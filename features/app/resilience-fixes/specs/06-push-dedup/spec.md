# 06 — Push Notification ID-Set Dedup

**Status:** Draft
**Created:** 2026-05-28
**Last Updated:** 2026-05-28
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Replace the count-based dedup in the background push handler (`src/notifications/handler.ts`) with a set of previously-seen approval item IDs persisted to AsyncStorage. This is the structural fix for the Thursday-flood root cause documented in `docs/ARCHITECTURE.md` §8.1 — the `inFlightRef` guard from spec 01 papered over the symptom (re-entrant calls), but the underlying defect is that a single integer count cannot distinguish "one item approved + one new item arrived" from "one new item arrived."

The handler currently reads `prev_approval_count` (integer) from AsyncStorage and fires a "new approvals" local notification if `pendingCount > prev`. After this spec, it reads `prev_approval_ids` (JSON array of stable string IDs serialized to a `Set<string>`) and fires only when the set difference `currentIds \ prevIds` is non-empty. The notification body still says `"N item(s) pending approval"` where `N` is the count of *new* items (not the total) — body copy changes are deferred.

`ApprovalItem.id` (from `src/lib/approvals.ts:51-78`) is already a stable string keyed by underlying record IDs (`mt-{timecardIds.join("-")}` for manual time, `ot-{overtimeId}` for overtime), so no schema changes are required upstream. `fetchFreshData()` in `src/lib/crossoverData.ts:151-166` already populates `approvalItems: ApprovalItem[]` on the snapshot for managers, so the handler has the IDs available without a separate fetch.

Migration is one-shot and self-healing: if `prev_approval_ids` is absent on read (first-ever run, or after this spec deploys), the handler seeds the storage with the current snapshot's IDs and returns without firing a notification. On the same first write, the legacy `prev_approval_count` key is removed from AsyncStorage. The `clearAll` sign-out wipe in `src/store/config.ts:75-91` already removes `prev_approval_count`; this spec adds `prev_approval_ids` alongside it.

---

## Out of Scope

1. **Notification body copy** — Descoped. The body remains `"N item(s) pending approval"` (where N is the new-items count). Changing to `"N new approval request(s)"` is a copy-only tweak and can ship independently. Research §3 explicitly defers this.

2. **Cross-handler concurrency (mutex between `scheduleAll` and `handleBackgroundPush`)** — Deferred to 07-notification-lifecycle. The intra-handler dedup fixed here is orthogonal to inter-handler races on `notif_thursday_id` / `notif_monday_id` (see `docs/ARCHITECTURE.md` §8.2).

3. **Cancel-then-setItem atomicity for the local notification scheduled by `scheduleLocalNotification`** — Deferred to 07-notification-lifecycle. The `scheduleLocalNotification` call site here does not store the returned identifier, so the atomic-window issue from §8.3 does not apply to the bg_refresh notification specifically; it applies to the calendar-triggered Thursday/Monday notifications scheduled by `useScheduledNotifications`.

4. **Privacy-redacted error logging of dedup decisions** — Deferred to 08-observability-log. Research §"Test plan → Error log" explicitly defers this. Within this spec we log via `console.error` only on failure paths.

5. **Cross-device deduplication** — Descoped. A manager signed in on two devices will independently fire one notification per device per new item. This matches today's behavior and is acceptable.

6. **Bounding / capping `prev_approval_ids`** — Descoped. The set is replaced wholesale with the current snapshot's IDs after every refresh, so its size is bounded by the snapshot size (typically ≤ 50 items). No unbounded growth is possible.

7. **Migrating from `prev_approval_count` over a multi-version window** — Descoped. The legacy key is removed on first write of the new key. Both keys can coexist in storage during the same install only for the brief moment between read and write of the first post-deploy push handler invocation, and the legacy key is never read by the new code path.

8. **Auto-clear of `prev_approval_ids` on future approval-window expansions** — ⚠️ Unassigned. Research §Risks notes that the first refresh after any future window change (e.g. extending past 2 prior weeks) will see prior-window items as "new" and fire a one-shot notification. Mitigation is procedural (manually clear the key in the PR that changes the window), not coded here. Not blocking this spec, but worth tracking outside it.

---

## Functional Requirements

### FR1 — Read previously-seen approval IDs from AsyncStorage

The handler reads JSON-serialized `string[]` from AsyncStorage key `prev_approval_ids`. On any of:
- Key absent (`getItem` returns `null`)
- JSON parse failure
- Parsed value is not an array
- Any thrown error from `AsyncStorage.getItem`

…the handler treats the result as `null` and proceeds to "first-run seed" behavior (FR4).

**Success criteria:**
- Given `prev_approval_ids` stores `'["mt-1","ot-9"]'`, the handler reads it as `Set { "mt-1", "ot-9" }`.
- Given the key is absent, the handler reads `null` and does not throw.
- Given the key holds `'not-json'`, the handler reads `null` and does not throw.
- Given the key holds `'{"foo":"bar"}'` (parses but not an array), the handler reads `null` and does not throw.
- Given `AsyncStorage.getItem` rejects, the handler reads `null` and does not throw.

### FR2 — Compute new-IDs set difference

Given the current snapshot's `approvalItems` and the previous IDs set, compute `newIds = currentIds \ prevIds` (items in current but not in previous). The current IDs set is built by mapping `approvalItems.map(it => it.id)`. If `approvalItems` is undefined (non-manager path) the dedup block does not run at all — see FR6.

**Success criteria:**
- current `["mt-1","mt-2"]`, prev `["mt-1"]` → new = `["mt-2"]` (size 1).
- current `["mt-1","mt-2"]`, prev `["mt-1","mt-2"]` → new = `[]` (size 0).
- current `["mt-1"]`, prev `["mt-1","mt-2"]` → new = `[]` (the disappeared `mt-2` doesn't count).
- current `["mt-1","mt-3"]`, prev `["mt-1","mt-2"]` (approve-then-arrive inversion) → new = `["mt-3"]` (size 1).
- current `["mt-1","mt-2","ot-9","ot-10"]`, prev `["mt-1","mt-2"]` → new = `["ot-9","ot-10"]` (size 2).

### FR3 — Fire local notification when and only when newIds is non-empty

When `newIds.length > 0` and `config.isManager === true`, call `scheduleLocalNotification(newIds.length)` exactly once per handler invocation. The integer passed is the *new-items count*, not the total `pendingCount`. The existing `scheduleLocalNotification` signature and body template are unchanged.

**Success criteria:**
- New IDs non-empty + isManager true → `scheduleNotificationAsync` called once with `content.title === 'New Approvals'` and `content.body` containing the new-items count.
- New IDs empty + isManager true → `scheduleNotificationAsync` not called.
- The count argument to `scheduleLocalNotification` equals `newIds.length`, not `currentIds.size`.

### FR4 — First-run seed (no notification on first ever read)

When `getPrevIds()` returns `null` AND `config.isManager === true`, the handler writes the current snapshot's IDs to AsyncStorage and returns without scheduling any notification. This applies whether the absence is from a fresh install, the legacy `prev_approval_count` key being the only thing in storage, or a corrupt-read fallback.

**Success criteria:**
- `prev_approval_ids` absent, current `["mt-1","mt-2"]`, isManager true → no notification; storage now holds `'["mt-1","mt-2"]'`.
- `prev_approval_ids` corrupt (`'not-json'`), current `["mt-1"]`, isManager true → no notification; storage now holds `'["mt-1"]'`.
- `getItem` throws, current `["mt-1"]`, isManager true → no notification; storage write attempted with `'["mt-1"]'`.

### FR5 — Legacy key cleanup on first write

On the same code path that writes the new `prev_approval_ids` key (both seed write and post-notification write), the handler attempts to remove the legacy `prev_approval_count` key from AsyncStorage. Failure to remove is non-fatal (catch and continue). This is idempotent: subsequent writes also call `removeItem`, but on already-absent keys it is a no-op.

**Success criteria:**
- After any successful write of `prev_approval_ids`, `AsyncStorage.removeItem('prev_approval_count')` has been invoked.
- If `removeItem` rejects, the handler does not throw and the rest of the flow completes.

### FR6 — Non-manager users skip dedup entirely

When `config.isManager === false`, the handler skips the entire dedup block — no read of `prev_approval_ids`, no notification, no write. The `fetchFreshData → updateWidgetData` path still runs (so the widget refreshes), but the approval-dedup logic is gated behind the manager check exactly as today.

**Success criteria:**
- isManager false → `AsyncStorage.getItem('prev_approval_ids')` not called.
- isManager false → `AsyncStorage.setItem('prev_approval_ids', …)` not called.
- isManager false → `scheduleNotificationAsync` not called.
- isManager false → `updateWidgetData` still called with the fresh snapshot.

### FR7 — Write failure is non-fatal

If `AsyncStorage.setItem('prev_approval_ids', …)` rejects (full disk, corrupt store, etc.), the handler logs the error via `console.error` and returns normally. Notifications already scheduled before the write attempt are not rolled back; on the next push the read will fall through to "first-run seed" and the cycle self-heals.

**Success criteria:**
- `setItem` rejects after a notification was scheduled → notification stays scheduled, `console.error` called once, handler resolves.
- `setItem` rejects on a seed-only write → no notification scheduled, `console.error` called once, handler resolves.

### FR8 — Sign-out wipe includes `prev_approval_ids`

The `clearAll` function in `src/store/config.ts` is updated to include `prev_approval_ids` in its `multiRemove` list, alongside the existing `prev_approval_count` (which is preserved for installs that have not yet hit the new push handler). On sign-out both keys are removed.

**Success criteria:**
- `clearAll()` invokes `AsyncStorage.multiRemove` with an array containing both `'prev_approval_count'` and `'prev_approval_ids'`.
- Existing keys in the wipe list are unchanged.
- Companion test `src/__tests__/store/config.test.ts` is updated to assert the new key is in the wiped list.

---

## Technical Design

### Files to Reference

| File | Why |
|---|---|
| `src/notifications/handler.ts:1-67` | Primary edit target. Replace `PREV_APPROVAL_COUNT_KEY` flow with ID-set flow. |
| `src/lib/approvals.ts:51-80` | Source of stable `ApprovalItem.id` (the `"mt-…"` / `"ot-…"` strings). |
| `src/lib/crossoverData.ts:151-170` | Confirms `approvalItems: ApprovalItem[]` is populated on the snapshot for managers and undefined for contributors. |
| `src/__tests__/notifications/handler.test.ts` | Existing test file; extend with new dedup cases. Manual mock of `AsyncStorage` lives inline (lines 22-26) and currently lacks `removeItem`. |
| `__mocks__/@react-native-async-storage/async-storage.ts` | The repo-wide AsyncStorage mock; already supports `getItem`/`setItem`/`removeItem`/`multiRemove`/`_reset`. Switching the handler test to this mock cleans up the test surface. |
| `src/store/config.ts:75-91` | `clearAll` key list; add `prev_approval_ids`. |
| `src/__tests__/store/config.test.ts:30-45` | Companion list of expected wiped keys; update to match. |
| `docs/ARCHITECTURE.md` §1.3, §8.1 | Background on why count-only dedup misfires (Thursday burst, cross-week expansion). |
| `src/hooks/useScheduledNotifications.ts:204-252` | Out-of-scope but adjacent: the `inFlightRef` guard from spec 01 lives here. This spec must not collide with that guard's contract. |

### Files to Create / Modify

| File | Action | Summary |
|---|---|---|
| `src/notifications/handler.ts` | Modify | Replace `PREV_APPROVAL_COUNT_KEY` constant + count-based read/write with `PREV_APPROVAL_IDS_KEY` + helper `getPrevIds()` + helper `savePrevIds()`. Update `handleBackgroundPush` to call set-diff logic. Add legacy-key cleanup on write. |
| `src/__tests__/notifications/handler.test.ts` | Modify | Extend with FR1–FR7 cases. Switch `AsyncStorage` mock to the repo-wide manual mock (or extend the inline mock to include `removeItem`). |
| `src/store/config.ts` | Modify | Add `'prev_approval_ids'` to the `multiRemove` array in `clearAll`. |
| `src/__tests__/store/config.test.ts` | Modify | Add `'prev_approval_ids'` to the expected wiped-keys array. |

No new files created. No new dependencies added.

### Data Flow

```
Push arrives (bg_refresh)
  │
  ▼
handleBackgroundPush(notification)
  │
  ├─ guard: data.type === 'bg_refresh' (else return)
  │
  ▼
fetchFreshData() ─────▶ snapshot { approvalItems?, config, ... }
  │
  ▼
updateWidgetData(snapshot)                   [always runs]
  │
  ▼
if (config.isManager) {
  │
  ▼
  currentIds = new Set(approvalItems.map(it => it.id))
  │
  ▼
  prevIds = await getPrevIds()
            ├─ key absent  → null
            ├─ parse fail  → null
            ├─ not-array   → null
            └─ getItem err → null
  │
  ▼
  if (prevIds === null) {                    [FR4 seed]
    await savePrevIds(currentIds)
    return
  }
  │
  ▼
  newIds = [...currentIds].filter(id => !prevIds.has(id))   [FR2]
  │
  ▼
  if (newIds.length > 0) {                                  [FR3]
    await scheduleLocalNotification(newIds.length)
  }
  │
  ▼
  await savePrevIds(currentIds)                             [FR5]
    └─ inside savePrevIds:
         setItem('prev_approval_ids', JSON.stringify([...]))
         removeItem('prev_approval_count').catch(noop)
}
```

### Edge Cases

| Case | Handling | Where covered |
|---|---|---|
| First-ever run, no key | Seed without notifying. | FR4 |
| Corrupt JSON in storage | Treat as null → seed. | FR1, FR4 |
| Non-array JSON in storage (e.g. `{"foo":"bar"}`) | Treat as null → seed. | FR1, FR4 |
| `getItem` rejects | Treat as null → attempt seed write. | FR1, FR4 |
| `setItem` rejects after schedule succeeded | Log, return. Notification stays. Next run reseeds. | FR7 |
| `setItem` rejects on seed write | Log, return. Notification not fired. Next run reseeds. | FR7 |
| `removeItem` (legacy key) rejects | Catch and ignore — best-effort cleanup. | FR5 |
| `approvalItems` undefined on manager snapshot | Should not happen in practice (`fetchFreshData` always assigns the array for managers, even if empty). Defensive: treat as empty array → currentIds is empty → newIds is empty → no notification, save empty set. |
| `approvalItems` empty array | Valid — manager has no pending items. Save empty set. Comparing to a non-empty prev set produces `newIds = []` correctly. |
| Approve-then-arrive inversion (mt-2 approved, mt-3 arrives) | newIds = `{mt-3}` — fires for the truly new item, not the count change. | FR2 |
| Cross-week window expansion | Items from prior weeks appear in `currentIds` and are "new" from the dedup's perspective. Fires one burst on first refresh after the window change, then settles. Mitigation is procedural (clear key in the deploy PR) — not coded here. Out of scope item #8. |
| Role flip (contributor → manager) | First post-flip push: `prev_approval_ids` may be absent (never written while non-manager) → FR4 seed kicks in; no spurious notification. | FR4, FR6 |
| Role flip (manager → contributor) | Subsequent pushes skip the dedup block entirely (FR6). Stored `prev_approval_ids` remains in storage but is harmless; cleared on next sign-out via FR8. |
| Two notifications scheduled before storage write completes | `scheduleLocalNotification` is awaited before `savePrevIds`. Sequential within a single handler invocation. The cross-handler race (foreground `scheduleAll` running concurrently) is the domain of spec 07 and not addressed here. |
| Notification data.type missing or wrong | Existing early-return guard at top of `handleBackgroundPush` unchanged. |
