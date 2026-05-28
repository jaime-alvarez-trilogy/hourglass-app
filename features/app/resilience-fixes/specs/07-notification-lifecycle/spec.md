# 07 — Notification Lifecycle Hardening

**Status:** Draft
**Created:** 2026-05-28
**Last Updated:** 2026-05-28
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Close the three remaining notification-lifecycle defects catalogued in `docs/ARCHITECTURE.md` §8.2, §8.3, and §8.4. Spec 06 fixed the push-side dedup (§8.1, resolved); this spec fixes the calendar-trigger side.

| Surface | Defect | Fix |
|---|---|---|
| §8.2 — cross-handler concurrency | `inFlightRef` in `useScheduledNotifications` only guards intra-hook re-entry. A foreground transition's `scheduleAll` can interleave with a silent-push `handleBackgroundPush`. Both paths call `scheduleNotificationAsync` independently. | Add an **AsyncStorage-backed best-effort mutex** (`withScheduleLock`) and wrap both `scheduleAll`'s scheduling block and `handleBackgroundPush`'s `scheduleLocalNotification` call in it. |
| §8.3 — non-atomic cancel+setItem | Each calendar scheduler reads an old AsyncStorage ID, cancels it, schedules a new notification, then persists the new ID. A crash between schedule and persist leaves a live, uncancellable orphan. | **Switch to deterministic identifiers** (`'hourglass:thursday'`, `'hourglass:monday-summary'`, `'hourglass:monday-expiry'`). iOS replaces a notification scheduled with the same identifier; AsyncStorage ID tracking is no longer needed. Remove the legacy `notif_*_id` keys. |
| §8.4 — orphan calendar triggers | iOS holds scheduled calendar triggers independently of the app. After an uninstall/reinstall (or any path where AsyncStorage is wiped but iOS-side state isn't), prior schedules can still fire. | **App-launch orphan sweep**: on mount, query `getAllScheduledNotificationsAsync()`, cancel any `hourglass:*` identifier that isn't in the current expected set, and `multiRemove` the legacy `notif_*_id` AsyncStorage keys. |

The `inFlightRef` guard added in spec 01 (`bebfb0f`) is **kept** as defense-in-depth against rapid AppState 'active' bursts within the same hook instance. The new AsyncStorage mutex is the cross-handler layer on top of it.

`scheduleLocalNotification` in `handler.ts` (called from `handleBackgroundPush` after spec-06 dedup decides to fire) uses `trigger: null` and does not persist any identifier — it does not suffer from §8.3 directly. It is wrapped in the new mutex only to coordinate with `scheduleAll`'s parallel calendar writes (§8.2).

The mutex is a small file-local primitive (`src/lib/scheduleLock.ts`) — not a "lock service." It exposes one function: `withScheduleLock(fn)`. Storage shape is a single AsyncStorage key (`notif_schedule_lock`) holding `String(Date.now())`. Stale-after-30 s. No owner tag (acceptable because contention is low and the underlying scheduling operations are idempotent thanks to deterministic identifiers).

This spec touches a fragile area (Thursday burst was user-visible). Multi-agent review is appropriate at Phase 7.2.

---

## Out of Scope

1. **A true cross-process mutex / native lock service.** AsyncStorage reads and writes are not atomic, so two concurrent callers can both observe an absent lock and both write. This is acknowledged. With deterministic identifiers, the worst case becomes "the same calendar trigger is scheduled twice with the same identifier" — iOS resolves that by keeping the later one. The mutex reduces the rate of the harmless collision; it does not eliminate it. A true mutex would require native code and is not justified at current scale.

2. **A debug "View scheduled notifications" surface in Settings.** Research §"TestFlight scenario" suggests it for manual verification. Useful, but a separate spec — pure UI plumbing, no concurrency risk. Deferred.

3. **`repeats: true` calendar triggers.** None of our three schedulers use repeats. The orphan sweep and identifier strategy assume one-shot triggers. If a future spec adds a repeating trigger, that PR must document any interaction with the sweep.

4. **Logging of sweep / lock events.** Deferred to spec 08-observability-log. Within this spec, we use `console.warn`/`console.error` only on failure paths, consistent with the rest of `handler.ts`.

5. **Migrating the lock to a Promise-based in-memory queue.** Cross-handler concurrency in React Native means a process-wide JS-runtime queue would suffice if both code paths shared a module. They do — `useScheduledNotifications.ts` and `handler.ts` both live in the app JS bundle. A module-level `Promise` chain is an obvious alternative. **We are using AsyncStorage instead** because:
   - The hook re-mounts (different module instance state on each foreground? — actually no, modules are singletons in RN), but the background handler can fire while the app is suspended/resumed, where in-memory module state survival has been flaky in our experience.
   - AsyncStorage state survives a crash mid-section; an in-memory queue does not. The stale-after-30 s recovery is the explicit insurance.
   - Trade-off acknowledged: AsyncStorage is slower (~2-10 ms per op) than a Promise chain. Acceptable; scheduling already takes longer than the lock overhead.

6. **Removing `inFlightRef`.** Defense-in-depth. Kept exactly as today. Spec 01-flood-guard (commit `bebfb0f`) added this guard for a different reason (rapid AppState bursts within one mount) and we do not regress it.

7. **Changing notification content / trigger times.** Out of scope. Identifiers only; content stays as today.

8. **Cleaning up `__mocks__/@react-native-async-storage/async-storage.ts`** beyond what's needed for new tests. The repo-wide mock already supports `multiRemove` and `removeItem`. New tests for the lock and sweep should use the inline `jest.mock` pattern that matches the existing `useScheduledNotifications.test.ts` style.

---

## Functional Requirements

### FR1 — Deterministic identifier per scheduled notification

Each of the three calendar schedulers in `useScheduledNotifications.ts` passes a stable `identifier` to `scheduleNotificationAsync`. No `getItem`/`setItem` of `notif_*_id` keys. No `cancelScheduledNotificationAsync` before scheduling (the orphan sweep handles cleanup at mount; iOS replaces same-identifier schedules).

| Function | Identifier |
|---|---|
| `scheduleThursdayReminder` | `'hourglass:thursday'` |
| `scheduleMondaySummary` | `'hourglass:monday-summary'` |
| `scheduleMondayExpiryReminder` | `'hourglass:monday-expiry'` |

**Success criteria:**
- `scheduleThursdayReminder` calls `scheduleNotificationAsync` with an options object whose top-level `identifier` field equals `'hourglass:thursday'`.
- `scheduleMondaySummary` calls `scheduleNotificationAsync` with `identifier === 'hourglass:monday-summary'`.
- `scheduleMondayExpiryReminder` calls `scheduleNotificationAsync` with `identifier === 'hourglass:monday-expiry'`.
- None of the three functions call `AsyncStorage.getItem('notif_thursday_id')`, `'notif_monday_id'`, or `'notif_expiry_id'`.
- None of the three functions call `AsyncStorage.setItem` with those keys.
- None of the three functions call `cancelScheduledNotificationAsync` (cancellation is now sweep-only).
- All existing weekday/time/content guards still apply (Friday/Saturday skip, Thursday-after-6pm skip, snapshot count, last-week-empty skip, manager-only, UTC-hour gate, `pendingCount > 0` gate).
- Notification content (title, body) is unchanged from current behavior; identifier is added alongside existing content.

### FR2 — `withScheduleLock` AsyncStorage mutex

A new utility module `src/lib/scheduleLock.ts` exports a single function:

```typescript
export async function withScheduleLock<T>(fn: () => Promise<T>): Promise<T | undefined>;
```

Behavior:
1. Read AsyncStorage key `notif_schedule_lock`.
2. If the value parses as a finite number and `Date.now() - value < 30_000`, return `undefined` without running `fn` (lock contended).
3. Otherwise, write `String(Date.now())` to the key, run `fn` inside a try/finally, and `removeItem(key)` in `finally`.
4. The `fn`'s rejection propagates after `removeItem` runs.
5. Any AsyncStorage failure on the read step is treated as "no lock present" (proceed to claim).
6. Any AsyncStorage failure on the write step (claim) is treated as "claim failed" — run `fn` anyway (best-effort) and still attempt to release.
7. Any AsyncStorage failure on the release step is swallowed (lock will go stale after 30 s).

**Success criteria:**
- First caller: key absent, `fn` runs, returns `fn`'s result, key removed after.
- Concurrent second caller: while first's lock is held (current timestamp), second returns `undefined` and does not run `fn`.
- Stale lock: key holds a timestamp older than 30 s → second caller claims, runs `fn`, returns result.
- `fn` throws: lock is still released (finally), error propagates to caller.
- `getItem` rejects on read: treat as lock-absent, proceed to claim and run.
- `setItem` rejects on claim: log via `console.warn`, run `fn` anyway, return result.
- `removeItem` rejects on release: swallow; do not propagate.
- Key value `'not-a-number'`: treat as lock-absent (the stale-check uses `Number.isFinite`).

### FR3 — `scheduleAll` wraps its scheduling block in the mutex

`useScheduledNotifications.scheduleAll` calls the three scheduler functions inside `withScheduleLock`. The orphan sweep (FR4) runs **before** the lock — sweeping is read-mostly and idempotent, and it must complete even when the lock is contended (otherwise an orphan would never be cleared while a push is firing).

**Success criteria:**
- The inner `scheduleAll` orchestrator calls `withScheduleLock` exactly once per invocation, wrapping all three `schedule*` calls.
- If `withScheduleLock` returns `undefined` (contended), `scheduleAll` returns silently without throwing.
- `sweepOrphanNotifications` is called outside (before) `withScheduleLock`.
- `inFlightRef` guard is preserved: rapid back-to-back invocations from the same hook instance still short-circuit before reaching `withScheduleLock`.
- Permission check (`getPermissionsAsync`) still gates everything. If permission is not granted, neither the sweep nor the lock-wrapped block runs.

### FR4 — `sweepOrphanNotifications` cancels stale `hourglass:*` schedules

A new utility (`src/lib/scheduleLock.ts` may also export this, or a separate module — see Technical Design) iterates `Notifications.getAllScheduledNotificationsAsync()` and cancels any notification whose `identifier` starts with `'hourglass:'` and is not in the current expected-identifier set:

```typescript
const EXPECTED_IDENTIFIERS = new Set([
  'hourglass:thursday',
  'hourglass:monday-summary',
  'hourglass:monday-expiry',
]);
```

After the sweep, the legacy AsyncStorage ID keys are cleaned:

```typescript
await AsyncStorage.multiRemove([
  'notif_thursday_id',
  'notif_monday_id',
  'notif_expiry_id',
]).catch(() => {});
```

**Success criteria:**
- Given `getAllScheduledNotificationsAsync` returns `[{identifier:'hourglass:thursday'}, {identifier:'hourglass:monday-summary'}, {identifier:'hourglass:foo'}, {identifier:'hourglass:bar'}]`, `cancelScheduledNotificationAsync` is called for `'hourglass:foo'` and `'hourglass:bar'` only.
- Given the list contains only the three expected identifiers, `cancelScheduledNotificationAsync` is not called.
- Given the list is empty, `cancelScheduledNotificationAsync` is not called.
- Given the list contains identifiers not prefixed with `'hourglass:'` (e.g. third-party libraries), they are not cancelled regardless of expected-set membership.
- After the iteration completes, `AsyncStorage.multiRemove` is called once with `['notif_thursday_id', 'notif_monday_id', 'notif_expiry_id']`.
- If `getAllScheduledNotificationsAsync` rejects, the function logs via `console.warn` and resolves to `void` without throwing.
- If `cancelScheduledNotificationAsync` rejects for one orphan, the loop continues to the next orphan; the error is swallowed.
- If `multiRemove` rejects, the function does not throw.

### FR5 — Sweep runs on every `scheduleAll` invocation

`scheduleAll` calls `sweepOrphanNotifications()` once per invocation, immediately after the permission check passes. It runs before `withScheduleLock` so a contended lock does not block the sweep.

**Success criteria:**
- On mount with permissions granted: sweep is called once before any `scheduleNotificationAsync` call from this spec.
- On every AppState 'active' transition with permissions granted: sweep is called again.
- If `inFlightRef` short-circuits the call, the sweep is NOT called (the guarded re-entry should not double-sweep).
- If permission is not granted, the sweep is NOT called.

### FR6 — `handleBackgroundPush` wraps `scheduleLocalNotification` in the mutex

In `src/notifications/handler.ts`, when `newIds.length > 0` (spec-06 set-difference returned a non-empty new-items set), the call to `scheduleLocalNotification(newIds.length)` is wrapped in `withScheduleLock`.

**Success criteria:**
- When the manager dedup decides to fire (`newIds.length > 0`), the actual `scheduleLocalNotification` call is wrapped in `withScheduleLock`.
- If the lock is contended, `scheduleLocalNotification` is skipped for this invocation. The dedup state write (`savePrevIds`) STILL happens after the skip — otherwise the next push would re-evaluate the same `newIds` as new and we'd lose the spec-06 dedup contract.
- If `withScheduleLock` returns `undefined`, the handler does not throw. The skipped notification is acceptable — the next push (≤30 min later) will re-evaluate and (assuming the items are still pending and not seen-before) will re-trigger.

### FR7 — `clearAll` removes the schedule lock and legacy ID keys

`src/store/config.ts:clearAll` wipes `notif_schedule_lock`, `notif_thursday_id`, `notif_monday_id`, `notif_expiry_id` on sign-out. (`notif_thursday_id` and `notif_monday_id` already in the list; `notif_expiry_id` is missing from the current list and is added; `notif_schedule_lock` is new.)

**Success criteria:**
- `clearAll()` invokes `AsyncStorage.multiRemove` with an array containing `'notif_schedule_lock'`, `'notif_thursday_id'`, `'notif_monday_id'`, and `'notif_expiry_id'`.
- Existing keys in the wipe list are unchanged.
- Companion test `__tests__/config-store.test.ts` is updated to assert the new keys.

### FR8 — Legacy ID-key reads/writes are fully removed from `useScheduledNotifications.ts`

After this spec, the file does not contain any of the string literals `'notif_thursday_id'`, `'notif_monday_id'`, `'notif_expiry_id'`, nor the constants `THURSDAY_NOTIF_ID_KEY`, `MONDAY_NOTIF_ID_KEY`, `EXPIRY_NOTIF_ID_KEY`. The sweep utility may reference them in its `multiRemove` list, but `useScheduledNotifications.ts` should not.

**Success criteria:**
- Static analysis (read the file as a string): none of the six legacy symbols appear.
- The `__testOnly` export contract is preserved (still exposes the three scheduler functions); test consumers do not require any new test-only export for this spec beyond what already exists.

---

## Technical Design

### Files to Reference

| File | Why |
|---|---|
| `src/hooks/useScheduledNotifications.ts:1-279` | Primary edit target. All three scheduler functions, `scheduleAll`, `inFlightRef`. |
| `src/notifications/handler.ts:53-100` | Wrap `scheduleLocalNotification` in `withScheduleLock`. The bg_refresh + dedup code stays exactly as spec 06 left it. |
| `src/notifications/README.md` | Invariants list mentions `inFlightRef` is intra-hook (point 2), cancel+setItem non-atomicity (point 3), Calendar trigger persistence (point 4). Three lines to update to "resolved by spec 07." |
| `docs/ARCHITECTURE.md` §1.2, §1.3, §8.2, §8.3, §8.4 | Doc surfaces to update. §1.3 table will lose the `notif_*_id` rows (replaced with "deterministic identifier"). §8.2-§8.4 marked resolved with residual-risk notes. |
| `src/hooks/__tests__/useScheduledNotifications.test.ts:1-1177` | The largest test surgery in the feature. ~30+ assertions on `notif_thursday_id` / `notif_monday_id` / `notif_expiry_id` must be replaced with `identifier:` assertions on the `scheduleNotificationAsync` calls. |
| `src/__tests__/notifications/handler.test.ts:1-644` | Extend with FR6 lock-wrapping tests. |
| `__tests__/config-store.test.ts` and `src/__tests__/store/config.test.ts` | Companion wipe-list tests; both already asserted spec-06 keys. Update both to include the new keys (FR7). |
| `src/store/config.ts:72-97` | `clearAll` list; add the new keys. |
| `app/_layout.tsx:91-108` | Where `useScheduledNotifications` and `registerBackgroundPushHandler` are wired. No edit; just confirm the lifecycle is unchanged. |
| `features/app/resilience-fixes/specs/06-push-dedup/spec.md` | Spec 06's "Out of Scope" item 2 explicitly defers the mutex to this spec. We honor that boundary. |

### Files to Create / Modify

| File | Action | Summary |
|---|---|---|
| `src/lib/scheduleLock.ts` | **Create** | New module exporting `withScheduleLock` and `sweepOrphanNotifications` (and the `EXPECTED_IDENTIFIERS` set). Single small file because the two functions share the `'hourglass:*'` prefix domain and a co-located test file is cleaner. |
| `src/lib/__tests__/scheduleLock.test.ts` | **Create** | Unit tests for both exports. Inline `jest.mock` for `expo-notifications` and `@react-native-async-storage/async-storage`. |
| `src/hooks/useScheduledNotifications.ts` | Modify | Remove three `notif_*_id` constants. Remove `getItem`/`cancel`/`setItem` from each scheduler. Add `identifier: 'hourglass:…'` to each `scheduleNotificationAsync` call. Add `sweepOrphanNotifications` call to `scheduleAll` (post-permission, pre-lock). Wrap the three scheduler calls in `withScheduleLock`. |
| `src/hooks/__tests__/useScheduledNotifications.test.ts` | Modify | Large rewrite. Replace ID-key assertions with identifier-on-call assertions. Add integration tests verifying sweep+lock wiring inside `scheduleAll`. |
| `src/notifications/handler.ts` | Modify | Wrap `scheduleLocalNotification(newIds.length)` in `withScheduleLock`. Preserve `savePrevIds(currentIds)` call regardless of whether the lock fired the notification. |
| `src/__tests__/notifications/handler.test.ts` | Modify | Add FR6 tests for lock-wrapping and lock-contention skip behavior. |
| `src/store/config.ts` | Modify | Add `'notif_expiry_id'` and `'notif_schedule_lock'` to the `multiRemove` array in `clearAll`. |
| `src/__tests__/store/config.test.ts` | Modify | Add the two new keys to the expected wipe-list assertion. |
| `__tests__/config-store.test.ts` | Modify | Same — the outer-directory duplicate of the store test (caught during spec 06 implementation; the same drift can recur here). |
| `src/notifications/README.md` | Modify | Update invariants 2, 3, 4 to past-tense with spec-07 references. Add a new invariant: "Calendar schedulers use deterministic identifiers (`hourglass:*`); orphan sweep runs at mount." |
| `docs/ARCHITECTURE.md` | Modify | §1.2 (note new mutex + sweep step). §1.3 (table row updates — identifier-based instead of ID-key). §8.2, §8.3, §8.4 (mark resolved with residual notes). |
| `features/app/resilience-fixes/FEATURE.md` | Modify | Add changelog row for spec 07 completion. |

**No new dependencies.** Uses only `expo-notifications`, `@react-native-async-storage/async-storage`, both already in the project.

### Data Flow

```
useScheduledNotifications mount / AppState 'active'
  │
  ▼
scheduleAll() called
  │
  ├─ inFlightRef guard (intra-hook re-entry)
  │
  ▼
getPermissionsAsync → granted?  ──no──▶ return
  │
  ▼ yes
sweepOrphanNotifications()                                    [FR4, FR5]
  ├─ getAllScheduledNotificationsAsync()
  ├─ for each n where n.identifier.startsWith('hourglass:')
  │     and not in EXPECTED_IDENTIFIERS:
  │     cancelScheduledNotificationAsync(n.identifier)        [swallow errors]
  └─ multiRemove(['notif_thursday_id','notif_monday_id','notif_expiry_id'])
                                                              [swallow errors]
  │
  ▼
withScheduleLock(async () => {                                [FR2, FR3]
  ├─ read widget_data for hoursRemaining
  ├─ scheduleThursdayReminder(hoursRemaining, weeklyLimit)
  │     └─ scheduleNotificationAsync({ identifier:'hourglass:thursday', … })
  │                                                           [FR1: deterministic id]
  ├─ scheduleMondaySummary()
  │     └─ scheduleNotificationAsync({ identifier:'hourglass:monday-summary', … })
  └─ scheduleMondayExpiryReminder(isManager)
        └─ scheduleNotificationAsync({ identifier:'hourglass:monday-expiry', … })
})
  │
  ▼
inFlightRef cleared (finally)


handleBackgroundPush (silent push arrives)
  │
  ▼
[spec 06 dedup unchanged]
  │
  ▼
if (newIds.length > 0) {
  │
  ▼
  withScheduleLock(() => scheduleLocalNotification(newIds.length))   [FR6]
                                                              [skipped if contended]
}
  │
  ▼
savePrevIds(currentIds)                                       [FR6: ALWAYS, even if skipped]
```

### Module sketch — `src/lib/scheduleLock.ts`

```typescript
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCK_KEY = 'notif_schedule_lock';
const STALE_MS = 30_000;
const PREFIX = 'hourglass:';

export const EXPECTED_IDENTIFIERS: ReadonlySet<string> = new Set([
  'hourglass:thursday',
  'hourglass:monday-summary',
  'hourglass:monday-expiry',
]);

const LEGACY_ID_KEYS = ['notif_thursday_id', 'notif_monday_id', 'notif_expiry_id'] as const;

/**
 * Best-effort AsyncStorage-backed mutex coordinating calendar-trigger and
 * push-trigger notification scheduling across `useScheduledNotifications`
 * and `handleBackgroundPush`. See ARCHITECTURE.md §8.2.
 *
 * Returns the wrapped function's result on success, or undefined when the
 * lock is contended (caller proceeds without scheduling). Lock auto-clears
 * after STALE_MS to recover from crashed holders.
 */
export async function withScheduleLock<T>(fn: () => Promise<T>): Promise<T | undefined> {
  // Read existing lock — failure is treated as "no lock present"
  let existing: string | null = null;
  try {
    existing = await AsyncStorage.getItem(LOCK_KEY);
  } catch {
    existing = null;
  }

  if (existing !== null) {
    const heldAt = Number(existing);
    if (Number.isFinite(heldAt) && Date.now() - heldAt < STALE_MS) {
      return undefined;
    }
  }

  // Claim — failure is logged but we run anyway (best-effort)
  try {
    await AsyncStorage.setItem(LOCK_KEY, String(Date.now()));
  } catch (err) {
    console.warn('[scheduleLock] claim failed; running anyway:', err);
  }

  try {
    return await fn();
  } finally {
    try {
      await AsyncStorage.removeItem(LOCK_KEY);
    } catch {
      // swallow — lock will go stale after STALE_MS
    }
  }
}

/**
 * Cancel any `hourglass:*` calendar notification whose identifier is not in
 * EXPECTED_IDENTIFIERS, and remove legacy `notif_*_id` AsyncStorage keys.
 * Idempotent. See ARCHITECTURE.md §8.3 and §8.4.
 */
export async function sweepOrphanNotifications(): Promise<void> {
  let scheduled: Notifications.NotificationRequest[] = [];
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[scheduleLock] sweep getAllScheduled failed:', err);
    // Still attempt the legacy-key cleanup below
  }

  for (const n of scheduled) {
    const id = n.identifier;
    if (typeof id === 'string' && id.startsWith(PREFIX) && !EXPECTED_IDENTIFIERS.has(id)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // swallow per-orphan errors; continue
      }
    }
  }

  try {
    await AsyncStorage.multiRemove([...LEGACY_ID_KEYS]);
  } catch {
    // swallow
  }
}
```

### Edge Cases

| Case | Handling | Where covered |
|---|---|---|
| Lock key holds non-numeric junk | `Number(existing)` is `NaN`; `Number.isFinite` is false → treat as no lock. | FR2 |
| Lock key holds a numeric timestamp from the future | `Date.now() - heldAt` is negative → also `<STALE_MS` → treated as held. Acceptable; the lock will go stale in ≤30s + clock-skew. Not worth defending against. | FR2 |
| Concurrent claim race | Two callers both see no lock, both write a timestamp, both run. Acceptable because deterministic identifiers mean iOS replaces same-identifier schedules. `scheduleLocalNotification` (push side) might fire twice in the rare collision window — accepted residual risk; spec 06's dedup state-write still settles correctly. | FR2 (limitations) |
| Lock holder crashes between claim and release | Stale-after-30s recovery; next caller bypasses. | FR2 |
| `fn` throws | Lock released in `finally`; error re-thrown to caller. `scheduleAll` and `handleBackgroundPush` both catch downstream. | FR2 |
| iOS rejects `scheduleNotificationAsync` for an identifier it considers invalid | Caught by the scheduler function's own try/catch (existing). No state corruption — no AsyncStorage write needed. | FR1 |
| iOS silently fails to replace a same-identifier schedule | Documented research risk. Sweep at next mount catches the prior schedule as an "expected" identifier and does not cancel it; the new schedule call replaces or fails. Acceptable behaviour for the worst case (one duplicate within a 30s window). If observed in TestFlight, mitigation is to add an explicit `cancelScheduledNotificationAsync(id)` before re-scheduling; defer until evidence. | FR1, FR4 |
| `getAllScheduledNotificationsAsync` returns notifications scheduled by another app entity (third-party library) | Identifier prefix `'hourglass:'` filter prevents the sweep from touching foreign notifications. | FR4 |
| Sweep encounters an identifier from a future spec (e.g. `'hourglass:weekend-summary'`) | Not in `EXPECTED_IDENTIFIERS` → cancelled. **This is by-design hygiene** — any new spec that adds a hourglass identifier must update `EXPECTED_IDENTIFIERS`. Document this in `src/lib/scheduleLock.ts` JSDoc. | FR4 |
| User signs out mid-flight | `clearAll` removes `notif_schedule_lock`. Any in-flight `withScheduleLock` finishes and the `removeItem` in `finally` is a no-op (key already gone). No corruption. | FR7 |
| Permissions revoked mid-session | On next foreground, `scheduleAll` permission check fails before sweep/lock. Sweep is skipped — orphans (if any) survive until permissions are restored. Acceptable. | FR3, FR5 |
| Lock contended on the push side (`handleBackgroundPush`) | `scheduleLocalNotification` is skipped, but `savePrevIds(currentIds)` is still called. **Critical:** without this, the next push would re-evaluate the same items as `newIds` and we'd notify on the second attempt — fine, but contributes to perceived "duplicate" notifications. The chosen behavior (always save) eats one notification per contention event in exchange for clean dedup state. | FR6 |
| First-ever app launch (no prior schedules) | Sweep is a no-op (empty list returned). Lock claim succeeds. Schedulers run normally. | FR3, FR4 |
| Test environment where `getAllScheduledNotificationsAsync` is undefined on the mock | Test setup adds the function to the mock; production mock at `expo-notifications` already exposes it. | (test-only) |

---

## Verification Tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | New `scheduleLock.test.ts`. Rewrites in `useScheduledNotifications.test.ts` and `handler.test.ts`. Update `config.test.ts` files. |
| Live-QA probe | ✗ | No API surface — pure on-device notification scheduling. |
| TestFlight manual scenario | ✓ | Crucial. See checklist Phase 7.2. Rapid foreground bursts, reinstall recovery, simulated push collision. |
| Local error log review | ✓ | `console.warn`/`console.error` paths exercised by `scheduleLock` and sweep failures. Spec 08-observability-log will pick these up. |

---

## Risks

1. **Test surgery is large.** The existing `useScheduledNotifications.test.ts` has ~30+ assertions tied to legacy AsyncStorage ID keys. Replacing them is a mechanical-but-extensive edit. Budget time and verify each replaced assertion still asserts the spirit of the original (e.g. "the notification is replaceable on re-run" → "the identifier on the call is deterministic and the same on each call").

2. **iOS same-identifier replace semantics.** Documented behavior is "schedule with same identifier replaces previous." Some community reports note silent failures. Mitigation: TestFlight scenario R3 (rapid foreground transitions). If duplicates observed, fallback is to add an explicit `cancelScheduledNotificationAsync(id)` before re-scheduling — same FR contract, slightly more code. Out of scope to pre-implement.

3. **Best-effort mutex semantics.** Two concurrent claims can both succeed (TOCTOU). Acceptable because the underlying scheduling is idempotent (FR1 deterministic identifiers) and the push-side fall-through skips the notification rather than corrupting state.

4. **`inFlightRef` regression risk.** The intra-hook guard added in spec 01 (`bebfb0f`) MUST be preserved. The new sweep + lock layer wraps the existing structure but the guard sits at the function entry of `scheduleAll`. Test coverage for the guard must remain. *Verification: search for the `inFlightRef.current` test assertions in `useScheduledNotifications.test.ts` and confirm they still pass.*

5. **`savePrevIds` is called even when the push lock is contended.** This is intentional (otherwise dedup state lags) but it means a user could see one fewer notification than they "deserve" in the rare collision window. Documented in FR6 and the edge-cases table. Watch for user reports of "I expected a new-approvals notification and didn't get one"; if it surfaces, revisit FR6's "always save" stance.

6. **The sweep cancels future identifiers without explicit allow-listing.** Any new `'hourglass:*'` identifier introduced by a future spec must be added to `EXPECTED_IDENTIFIERS` in the same PR that adds it. Otherwise the sweep will quietly cancel it on the next mount. Documented in JSDoc on the constant.
