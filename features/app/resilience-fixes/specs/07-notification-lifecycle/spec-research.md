# Spec 07 — Notification lifecycle hardening

**Status:** Research complete
**Complexity:** L
**Addresses:** `docs/ARCHITECTURE.md` §8.2 + §8.3 + §8.4 — cross-handler concurrency, non-atomic cancel+setItem, orphan iOS calendar triggers.

## Problem context

Three related issues in `useScheduledNotifications` + `handleBackgroundPush`:

### §8.2 — `inFlightRef` is intra-hook only

`useScheduledNotifications.ts:212` declares `inFlightRef` as a React ref. It guards re-entry into `scheduleAll()` from the same hook instance. It does **not** coordinate with `handleBackgroundPush` (which schedules `scheduleLocalNotification` directly).

Scenario: AppState transitions to 'active' (foreground), `scheduleAll` starts running. Mid-flight, a silent push arrives, `handleBackgroundPush` runs, also fires a `scheduleLocalNotification`. Result: two notifications scheduled in the same window with no coordination.

### §8.3 — Cancel+setItem is not atomic

Each scheduler function (e.g. `scheduleThursdayReminder`) does:
1. Read old ID from AsyncStorage.
2. `Notifications.cancelScheduledNotificationAsync(oldId)`.
3. `Notifications.scheduleNotificationAsync(...)` → returns new ID.
4. `AsyncStorage.setItem(key, newId)`.

If the app crashes or is killed between (3) and (4), the new notification is **live** but **uncancellable** on next run — we've forgotten the ID. The "next run" will read the old (already-cancelled) ID, try to cancel it (no-op), schedule a third notification, and persist that ID. Multiple orphans accumulate.

### §8.4 — iOS calendar triggers survive app uninstall

A calendar-trigger notification scheduled via `Notifications.scheduleNotificationAsync(...)` is held by iOS, not by our app. If the user uninstalls and reinstalls, the previously-scheduled notification can still fire (or so iOS docs suggest — needs verification). Our AsyncStorage is gone, so the new install has no ID to cancel.

## Exploration findings

- `useScheduledNotifications.ts:34-79, 90-133, 145-196` — three schedule functions, each with its own AsyncStorage key (`notif_thursday_id`, `notif_monday_id`, `notif_expiry_id`).
- `useScheduledNotifications.ts:212-253` — `scheduleAll` with `inFlightRef` guard.
- `handler.ts:51-59` — `scheduleLocalNotification` (immediate, no ID persistence; not the same orphan problem since it's `trigger: null`).
- `expo-notifications` provides `Notifications.getAllScheduledNotificationsAsync()` — returns every iOS-scheduled notification we've ever requested, including ones the app forgot about. This is the orphan-detection primitive.
- Each `scheduleNotificationAsync` call accepts an `identifier` option — if we pass our own deterministic identifier (e.g. `'hourglass:thursday'`), we don't need to track IDs in AsyncStorage at all. iOS replaces a notification with the same identifier on re-schedule.

## Key decisions

**1. Use deterministic identifiers instead of dynamic IDs.**

Pass `identifier: 'hourglass:thursday'`, `'hourglass:monday-summary'`, `'hourglass:monday-expiry'` when scheduling. `scheduleNotificationAsync` is idempotent on identifier — calling it again with the same identifier replaces the prior schedule. No AsyncStorage tracking needed.

This single decision dissolves §8.3 (no cancel+setItem race because there's no setItem) and dramatically simplifies §8.4 recovery (we know the identifier prefix; we can cancel anything matching it).

**2. AsyncStorage-backed mutex for cross-handler coordination.**

Pure React refs can't coordinate across separate code paths (hook + background handler). Use a small mutex keyed in AsyncStorage:

```typescript
async function withScheduleLock<T>(fn: () => Promise<T>): Promise<T | undefined> {
  const LOCK_KEY = 'notif_schedule_lock';
  const now = Date.now();
  const STALE_MS = 30_000; // 30s; way longer than any scheduling op should take

  // Read existing lock
  const raw = await AsyncStorage.getItem(LOCK_KEY);
  if (raw) {
    const heldAt = Number(raw);
    if (Number.isFinite(heldAt) && now - heldAt < STALE_MS) return undefined; // someone else holds it
  }

  await AsyncStorage.setItem(LOCK_KEY, String(now));
  try {
    return await fn();
  } finally {
    await AsyncStorage.removeItem(LOCK_KEY);
  }
}
```

`scheduleAll` and `handleBackgroundPush` wrap their scheduling sections in `withScheduleLock`. The stale-after-30s guard handles crash recovery (a crashed lock holder doesn't permanently block).

**Note:** AsyncStorage reads/writes are not atomic — two concurrent reads can both see an absent lock and both write. This is a best-effort mitigation, not a true mutex. For our usage (low contention, idempotent operations underneath thanks to deterministic IDs), it's enough. True mutex would require native code.

**3. App-launch orphan sweep.**

On every `useScheduledNotifications` mount, before scheduling anything:

```typescript
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
const hourglassScheduled = scheduled.filter((n) => n.identifier.startsWith('hourglass:'));
const expected = new Set(['hourglass:thursday', 'hourglass:monday-summary', 'hourglass:monday-expiry']);
const orphans = hourglassScheduled.filter((n) => !expected.has(n.identifier));
for (const orphan of orphans) {
  await Notifications.cancelScheduledNotificationAsync(orphan.identifier);
}
```

Two purposes:
- §8.4 mitigation: any leftover identifier from a previous install survives if our prefix doesn't match the expected set.
- General hygiene: catches typos or future expansion mistakes.

**4. Remove the AsyncStorage notification ID keys.**

Once schedulers use deterministic identifiers, the keys `notif_thursday_id`, `notif_monday_id`, `notif_expiry_id` are no longer needed. **Migration:** the orphan sweep also deletes these legacy keys via `AsyncStorage.multiRemove`.

**5. Keep `inFlightRef` as defense-in-depth.**

The AsyncStorage mutex protects across handlers; `inFlightRef` still protects against rapid AppState 'active' events queueing multiple `scheduleAll` runs from the same hook instance. Two layers.

## Interface contracts

### Refactored scheduler (example for Thursday)

```typescript
const THURSDAY_ID = 'hourglass:thursday';

async function scheduleThursdayReminder(hoursRemaining: number, weeklyLimit: number) {
  const now = new Date();
  if (now.getDay() === 5 || now.getDay() === 6) return; // Fri/Sat: skip
  if (now.getDay() === 4 && now.getHours() >= 18) return; // Thursday after 6pm
  if (hoursRemaining <= 0) return;

  await Notifications.scheduleNotificationAsync({
    identifier: THURSDAY_ID,   // ← deterministic, replaces prior
    content: {
      title: 'Hours Deadline Tonight',
      body: hoursRemaining > 0 ? `${hoursRemaining.toFixed(1)}h to go` : "You've hit your 40h target 🎯",
    },
    trigger: { weekday: 5, hour: 18, minute: 0, repeats: false },
  });
}
```

No `AsyncStorage.getItem`. No `cancelScheduledNotificationAsync`. No `setItem`. The function is now a pure scheduling call.

### `scheduleAll` wraps in mutex + does sweep

```typescript
export function useScheduledNotifications(config: CrossoverConfig | null, isManager: boolean) {
  const inFlightRef = useRef(false);

  useEffect(() => {
    const scheduleAll = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { granted } = await Notifications.getPermissionsAsync();
        if (!granted) return;

        await sweepOrphanNotifications();
        await withScheduleLock(async () => {
          const hoursRemaining = await readHoursRemainingFromWidget();
          if (hoursRemaining > 0) {
            await scheduleThursdayReminder(hoursRemaining, config?.weeklyLimit ?? 40);
          }
          await scheduleMondaySummary();
          await scheduleMondayExpiryReminder(isManager);
        });
      } catch (e) {
        // swallow
      } finally {
        inFlightRef.current = false;
      }
    };

    scheduleAll();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleAll();
    });
    return () => sub.remove();
  }, [config, isManager]);
}
```

### `handleBackgroundPush` wraps notification scheduling in same mutex

```typescript
// inside handleBackgroundPush, after computing newIds.length > 0
await withScheduleLock(async () => {
  await scheduleLocalNotification(newIds.length);
});
```

### Util: sweep + mutex

New file `src/notifications/orphan-sweep.ts`:

```typescript
const HOURGLASS_PREFIX = 'hourglass:';
const EXPECTED_IDS = new Set([
  'hourglass:thursday',
  'hourglass:monday-summary',
  'hourglass:monday-expiry',
]);

export async function sweepOrphanNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(HOURGLASS_PREFIX) && !EXPECTED_IDS.has(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  // Clean up legacy AsyncStorage keys
  await AsyncStorage.multiRemove(['notif_thursday_id', 'notif_monday_id', 'notif_expiry_id']).catch(() => {});
}
```

## Test plan

### Unit tests

**Deterministic identifiers (`useScheduledNotifications.test.ts`, modified):**
- [ ] `scheduleThursdayReminder` calls `scheduleNotificationAsync` with `identifier: 'hourglass:thursday'`.
- [ ] No `getItem`/`setItem` calls for `notif_thursday_id` anymore.
- [ ] Re-running the function while it's pending replaces the existing schedule (mock asserts identifier).

**Mutex (`__tests__/schedule-lock.test.ts`, new):**
- [ ] First caller gets the lock and runs `fn`.
- [ ] Concurrent second caller finds lock present and returns `undefined` without running.
- [ ] After first caller completes, lock is released; new callers can run.
- [ ] Stale lock (>30s old) is bypassed.
- [ ] On `fn` throw, lock is still released (finally).

**Orphan sweep (`__tests__/orphan-sweep.test.ts`, new):**
- [ ] `getAllScheduledNotificationsAsync` returns 3 expected + 2 orphans → 2 are cancelled, 3 remain.
- [ ] All identifiers are `hourglass:` prefix → only expected ones kept.
- [ ] No `hourglass:` notifications at all → no-op, no errors.
- [ ] Sweep also calls `multiRemove` on legacy AsyncStorage keys.
- [ ] Sweep tolerates `cancelScheduledNotificationAsync` throwing (skip and continue).

**Integration (`useScheduledNotifications.test.ts`):**
- [ ] On mount, sweep runs before any schedule call.
- [ ] `scheduleAll` and a concurrent `handleBackgroundPush` cannot both schedule local notifications (verified via mocked lock).

### Live-QA probe extension

N/A — pure client-side notification scheduling. No API contact.

### TestFlight scenario

The hardest, but the most important. Documented scenarios:

- [ ] **Rapid foreground transitions:** open app, background it, foreground 10× in 30 seconds. Verify only one Thursday reminder is scheduled (check via `Notifications.getAllScheduledNotificationsAsync()` exposed in a debug surface — add a "View scheduled" button in Settings if not present).
- [ ] **Reinstall recovery:** schedule a Thursday reminder. Uninstall app. Reinstall. Open app. Verify only the expected 3 notifications exist; any pre-uninstall artifacts are cancelled.
- [ ] **Background push + foreground sync collision:** with the app in foreground actively syncing, trigger a manual silent push from the Railway server (add a "Trigger push" admin endpoint or just `node server/scripts/test-push.js`). Verify exactly one notification fires.
- [ ] **Crash mid-schedule:** harder to orchestrate; could be skipped. The lock's stale-after-30s self-heals; the deterministic identifier eliminates the orphan problem entirely. Acceptable to verify only via unit tests.

### Error log

- [ ] Sweep logs how many orphans it cancelled and which identifiers (spec 08).
- [ ] Lock-not-acquired events are logged (so we know if contention is real in prod).

## Files to reference

| File | Why |
|---|---|
| `src/hooks/useScheduledNotifications.ts` | Primary file. All 3 scheduler functions + `scheduleAll`. |
| `src/notifications/handler.ts` | Wrap `scheduleLocalNotification` in `withScheduleLock`. |
| `src/notifications/orphan-sweep.ts` | **New file.** Sweep + mutex utility. |
| `src/__tests__/notifications/` | Test directory. |
| `src/hooks/__tests__/useScheduledNotifications.test.ts` | Existing tests; rewrite to match deterministic-identifier scheme. |
| `docs/ARCHITECTURE.md` §1.2, §1.3, §8.2, §8.3, §8.4 | Doc context. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit | ✓ | Rewritten + new test files; existing assertions on AsyncStorage IDs are removed/replaced. |
| Live-QA probe | ✗ | No API surface. |
| TestFlight | ✓ | Crucial — TestFlight scenarios above. Needs a debug "View scheduled" surface. |
| Error log | ✓ | Sweep + lock events logged. |

## Risks

- **Test rewrite is large.** The existing `useScheduledNotifications.test.ts` (~900 lines) has many assertions about ID storage. Most need rewriting. Budget time accordingly; this is the largest test surgery in the feature.
- **Deterministic identifier behavior on iOS.** Documented behavior is "schedule with same identifier replaces previous." Verify on a real device — there are reports that scheduling with the same identifier sometimes fails silently. If we hit that, fallback is `cancelScheduledNotificationAsync(identifier)` first, then re-schedule. (Still no setItem.)
- **AsyncStorage mutex is best-effort.** Two concurrent reads can both see no lock. Acceptable because the operations are idempotent thanks to deterministic IDs — a duplicate schedule call just replaces itself.
- **Calendar trigger semantics across iOS versions.** Repeats: false ones we use are simpler. If we ever add `repeats: true`, sweep + identifier behavior may differ. Document as a constraint.
