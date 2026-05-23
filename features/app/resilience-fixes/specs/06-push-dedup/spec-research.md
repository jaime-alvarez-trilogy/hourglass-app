# Spec 06 — Push notification ID-set dedup

**Status:** Research complete
**Complexity:** M
**Addresses:** `docs/ARCHITECTURE.md` §8.1 — count-only dedup in `handleBackgroundPush`. Most likely root cause of the Thursday notification burst.

## Problem context

The "new approvals" instant push notification fires when a silent background push lands and the manager has *more* pending approvals than the last time we checked. The dedup is **count-only**: `prev_approval_count` in AsyncStorage, integer comparison.

This breaks in several ways:

1. **Cross-week window expansion:** commits `3636a64` and `8cedb63` widened the query to include 2 prior weeks. The first refresh after that change saw a count jump (from N items in current week to N + prior-week items) and fired a "new approvals" notification for items already seen.

2. **Approve-then-new-arrival inversion:** if a manager approves 1 item (count: 5→4) and then a new item arrives (count: 4→5), the notification fires for a *different* item than what's truly new. The user sees "1 new approval" even though one was approved and one arrived — but the ID isn't tracked, so they're indistinguishable.

3. **Background-refresh race with foreground action:** if the user approves an item in the app at the same moment a background push fires, the count diff can produce a "new approval" notification for the item the user just approved.

4. **Re-arrived items.** If Crossover ever moved an item from approved back to pending (rare but technically possible), the count would re-increase, firing again. Count-based has no memory of "I already notified about item X."

## Exploration findings

- `src/notifications/handler.ts:11-12` defines `PREV_APPROVAL_COUNT_KEY = 'prev_approval_count'`.
- `handleBackgroundPush` (`handler.ts:19-46`):
  - Calls `fetchFreshData()` which returns `CrossoverSnapshot { approvalItems: ApprovalItem[], ...}`.
  - Reads `pendingCount` (= `approvalItems.length`) — the count of items.
  - Reads `prev_approval_count` from AsyncStorage.
  - If `newCount > prevCount` AND `isManager`, calls `scheduleLocalNotification(newCount)`.
  - Always overwrites `prev_approval_count` with `newCount`.
- `ApprovalItem.id` (from `src/lib/approvals.ts:51-78`) is a stable string:
  - Manual time: `"mt-" + timecardIds.join("-")` (e.g. `"mt-12345-12346"`)
  - Overtime: `"ot-" + overtimeRequest.id` (e.g. `"ot-9876"`)
- These IDs are deterministic across refetches; they don't change once the item exists.
- The notification body says `"X item(s) pending approval"`, not "X new" — so the user might already expect "this is the current count," but the notification firing at all is the noise.

## Key decisions

**1. Replace `prev_approval_count` (integer) with `prev_approval_ids` (Set of string IDs).** Serialized to AsyncStorage as a JSON array. Standard pattern.

**2. The notification trigger condition becomes:** notify if `newIds \ prevIds` (set difference) is non-empty. Specifically: if there are item IDs in the current snapshot that weren't in the prior snapshot.

**3. The notification content uses the count of *new* items, not the total count.** "2 new approval requests" is more useful than "5 item(s) pending approval." But the existing copy can stay if changes feel risky — the dedup fix is what matters.

**4. Migration: handle the first refresh gracefully.** First time the new code runs, `prev_approval_ids` won't exist. Don't fire a notification for "everything is new" — treat first-ever run as "seed" and just persist the IDs without notifying.

**5. ID lifecycle:**
   - When an item disappears from the snapshot (approved/rejected/expired), remove from `prev_approval_ids`.
   - Equivalent: just replace the stored set with the current snapshot's IDs after every refresh. No memory of historically-seen items beyond the current view.
   - The set is also bounded by the snapshot size (typically ≤ 50 items) — no unbounded growth.

**6. Notify only for items new to the *full* snapshot, not just to one week.** The cross-week window is part of the snapshot. An item that "moved" between weeks (impossible in practice, but) wouldn't refire.

**7. Keep `prev_approval_count` key around temporarily** as `prev_approval_count_DEPRECATED` (write nothing, ignore on read) to avoid stale state biting after deploy. Actually — simpler — just delete the key on the first run of the new code. One-shot migration.

## Interface contracts

### `src/notifications/handler.ts` (modified)

```typescript
const PREV_APPROVAL_IDS_KEY = 'prev_approval_ids';
const PREV_APPROVAL_COUNT_KEY_LEGACY = 'prev_approval_count'; // for cleanup

async function getPrevIds(): Promise<Set<string> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREV_APPROVAL_IDS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return new Set(arr);
  } catch {
    return null;
  }
}

async function savePrevIds(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(PREV_APPROVAL_IDS_KEY, JSON.stringify([...ids]));
  // Migration: remove legacy key on first write
  await AsyncStorage.removeItem(PREV_APPROVAL_COUNT_KEY_LEGACY).catch(() => {});
}

export async function handleBackgroundPush(notification: Notification): Promise<void> {
  if (notification.request.content.data?.type !== 'bg_refresh') return;
  try {
    const fresh = await fetchFreshData();
    await updateWidgetData(fresh);

    if (fresh.config.isManager) {
      const currentIds = new Set(fresh.approvalItems.map((it) => it.id));
      const prevIds = await getPrevIds();

      if (prevIds === null) {
        // First-ever run: seed without notifying
        await savePrevIds(currentIds);
        return;
      }

      const newIds = [...currentIds].filter((id) => !prevIds.has(id));
      if (newIds.length > 0) {
        await scheduleLocalNotification(newIds.length);
      }
      await savePrevIds(currentIds);
    }
  } catch (err) {
    console.error('handleBackgroundPush failed', err);
  }
}
```

### `scheduleLocalNotification` signature (no change to body for now)

Keep `"N item(s) pending approval"` — but `N` is now the count of *new* items, not total. If we want to be more precise later, copy can become `"N new approval request(s)"`. Out of scope for this spec — copy change is independent.

## Test plan

### Unit tests (`src/__tests__/notifications/handler.test.ts`, extend)

**Migration scenarios:**
- [ ] First run with `prev_approval_ids` absent → seed with current snapshot IDs, do NOT fire notification.
- [ ] First run also deletes legacy `prev_approval_count` key.

**Dedup correctness:**
- [ ] Current `[mt-1, mt-2]`, prev `[mt-1]` → fires notification with count 1 (mt-2 is new).
- [ ] Current `[mt-1, mt-2]`, prev `[mt-1, mt-2]` → no notification fires.
- [ ] Current `[mt-1]`, prev `[mt-1, mt-2]` (item approved/disappeared) → no notification fires. New prev = `[mt-1]`.
- [ ] Current `[mt-1, mt-3]`, prev `[mt-1, mt-2]` (one approved, one new) → fires for `mt-3` (count 1), not for the count change.
- [ ] Current `[mt-1, mt-2, ot-9, ot-10]`, prev `[mt-1, mt-2]` (two overtime items arrived) → fires count 2.

**Cross-week window expansion:**
- [ ] Prev `[mt-1]` (one item in current week), now snapshot includes 2 prior weeks `[mt-prev-week-A, mt-prev-week-B, mt-1]` → fires count 2 (the prior-week items appear as "new" — which they technically are in our window). **Note:** this is still a regression-by-design — extending the window adds items. The right fix is at the window-expansion point (a one-time seed clear). Document this in the spec output.

**Manager gate:**
- [ ] `isManager: false` → no notification, but prev_ids still updated (so when role flips, we don't fire for old items).

**Error handling:**
- [ ] AsyncStorage read fails → treats as first-run (no notification, seeds with current).
- [ ] AsyncStorage write fails → notification still fires (best effort), error logged but not thrown.

### Live-QA probe extension

Not directly applicable — dedup logic is fully client-side. No live API verification needed beyond what's already covered.

### TestFlight scenario

This is the hardest to verify because it requires real notification delivery. Documented scenario:

- [ ] **Setup:** install fresh build, sign in as manager. Wait for first silent push to land (≤30 min) and verify no notification fires (first-run seed).
- [ ] **Test "new item arrives":** have someone submit a manual time entry on the team. Wait for next silent push. Verify exactly one "X new approval" notification fires.
- [ ] **Test "approve action while item arrives":** harder to orchestrate. Approve an item in the app, then quickly trigger another team-member submission. Verify only one notification for the new item, not for the count change.
- [ ] **Test "multiple items arrive between pushes":** have 2 items submitted, wait for one push. Verify notification fires once with count 2.
- [ ] **Test cross-week window:** existing — verify items from 2 prior weeks already in the snapshot don't re-fire on next push.

### Error log

- [ ] Log each invocation: previous ID count, current ID count, count of new IDs, fired-notification yes/no. Spec 08 captures this.

## Files to reference

| File | Why |
|---|---|
| `src/notifications/handler.ts:11-46` | Primary edit. |
| `src/lib/approvals.ts:51-78` | Source of stable `id` field on `ApprovalItem`. |
| `src/__tests__/notifications/handler.test.ts` | Existing tests; extend with new cases above. |
| `docs/ARCHITECTURE.md` §1.3, §8.1 | Doc context. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit | ✓ | Extended `handler.test.ts`. |
| Live-QA probe | ✗ | Pure client-side logic. |
| TestFlight | ✓ | Scenarios above; requires team-coordinated submissions. |
| Error log | ✓ | Per-invocation dedup decision captured. |

## Risks

- **Cross-week window seeding remains imperfect.** The first refresh after a future window change will still see "new" items. Mitigation: when changing the window, manually clear `prev_approval_ids` as part of the deploy. Document this in any future window-expansion PR.
- **First-ever silent push after install seeds without notifying.** If a real new item happens to arrive during that very first push window, the user misses one notification. **Acceptable:** silent pushes fire every 30 min; they'll see the next one.
- **Two devices for the same manager.** Both devices have their own `prev_approval_ids`. They'll independently fire notifications for the same new items. This is the current behavior too, but worth noting.
