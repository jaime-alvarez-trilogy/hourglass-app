# Checklist — 06 Push Dedup

**Spec:** [spec.md](./spec.md)
**Research:** [spec-research.md](./spec-research.md)

---

## Phase 6.0 — Write Failing Tests (TDD red)

Before any production code change, write tests that fail against the current count-based handler.

### Test file: `src/__tests__/notifications/handler.test.ts`

- [x] **T1 — Extend inline AsyncStorage mock with `removeItem`.** *Implementation note: kept the inline `jest.mock` pattern (consistent with `useScheduledNotifications.test.ts`) instead of switching to the repo-wide manual mock. Added `removeItem: jest.fn()` to the factory. Functionally equivalent for the FRs and lower-risk than wholesale mock swap.*
- [x] **T2 — Existing count-based tests subsumed.** The old "schedules local notification when manager has new approvals" and "does not schedule notification when approval count is unchanged" were replaced wholesale by the new FR2/FR3 test blocks (T8, T9, T14, T15, T16) which assert the same behavior under the new dedup contract.

### FR1 — Read previously-seen IDs from storage

- [x] **T3** — Returns parsed Set when storage holds valid JSON array of strings.
- [x] **T4** — Returns null when key is absent (no prior write).
- [x] **T5** — Returns null when stored value is not valid JSON (e.g. `'not-json'`); does not throw.
- [x] **T6** — Returns null when stored value is valid JSON but not an array (e.g. `'{"foo":"bar"}'`); does not throw.
- [x] **T7** — Returns null when `AsyncStorage.getItem` rejects; handler does not throw.

### FR2 — Set-difference computation

- [x] **T8** — current `[mt-1,mt-2]`, prev `[mt-1]` → fires notification once with count 1.
- [x] **T9** — current `[mt-1,mt-2]`, prev `[mt-1,mt-2]` (no change) → no notification.
- [x] **T10** — current `[mt-1]`, prev `[mt-1,mt-2]` (item disappeared) → no notification; storage now holds `[mt-1]`.
- [x] **T11** — current `[mt-1,mt-3]`, prev `[mt-1,mt-2]` (approve-then-arrive inversion) → fires count 1, not count 0 and not count 2. *This is the Thursday-flood regression case.*
- [x] **T12** — current `[mt-1,mt-2,ot-9,ot-10]`, prev `[mt-1,mt-2]` (two overtime items arrived) → fires count 2.
- [x] **T13 — Cross-week regression case** — prev `[mt-1]`, current `[mt-prev-week-A, mt-prev-week-B, mt-1]` (window widened to include 2 prior weeks) → fires count 2. *Asserts the documented "regression by design" — research §"Test plan, Cross-week window expansion".*

### FR3 — Notification scheduling

- [x] **T14** — Notification body contains the *new-items* count (not total `pendingCount`). With current `[mt-1,mt-2,mt-3]`, prev `[mt-1]`, body must contain "2", must not contain "3".
- [x] **T15** — Notification title is unchanged: `'New Approvals'`.
- [x] **T16** — `scheduleNotificationAsync` is called exactly once when new items are present.

### FR4 — First-run seed

- [x] **T17** — `prev_approval_ids` absent, current `[mt-1,mt-2]`, isManager true → no notification scheduled; storage afterwards holds `'["mt-1","mt-2"]'`.
- [x] **T18** — `prev_approval_ids` corrupt (`'not-json'`), current `[mt-1]` → no notification; storage afterwards holds `'["mt-1"]'`.
- [x] **T19** — `getItem` throws, current `[mt-1]` → no notification; `setItem` called with `'["mt-1"]'`.

### FR5 — Legacy key cleanup

- [x] **T20** — On seed write, `AsyncStorage.removeItem('prev_approval_count')` is called.
- [x] **T21** — On post-notification write, `AsyncStorage.removeItem('prev_approval_count')` is called.
- [x] **T22** — `removeItem` rejection does not propagate. Configure the mock to make `removeItem` reject once, run a normal flow, assert handler resolves and notification still scheduled.

### FR6 — Non-manager gate

- [x] **T23** — isManager false → `getItem('prev_approval_ids')` is NOT called. Assert via `AsyncStorage.getItem.mock.calls` not containing that key.
- [x] **T24** — isManager false → `setItem('prev_approval_ids', …)` is NOT called.
- [x] **T25** — isManager false → `scheduleNotificationAsync` is NOT called.
- [x] **T26** — isManager false → `updateWidgetData` IS called with the fresh snapshot (widget refresh still happens).

### FR7 — Write failure resilience

- [x] **T27** — `setItem` rejects after a notification was scheduled → notification stays scheduled, `console.error` called once, handler resolves to undefined.
- [x] **T28** — `setItem` rejects on seed-only write → no notification scheduled, `console.error` called once, handler resolves.

### Companion test file: `src/__tests__/store/config.test.ts`

- [x] **T29** — Add `'prev_approval_ids'` to the `EXPECTED_KEYS` array (line ~30) so the existing wipe-list assertion validates both legacy and new keys. Confirm test still passes (it should fail before the implementation change because `clearAll` does not yet remove the new key).

### Run tests — confirm RED

- [x] **T30** — Run `npm test -- handler.test.ts` and confirm new tests fail with the expected count-based-handler errors. Existing tests that we updated (T2) should also fail.
- [x] **T31** — Run `npm test -- config.test.ts` and confirm the wipe-list test fails on the missing `prev_approval_ids` key.
- [x] **T32** — Run full `npm test` to baseline the rest of the suite (everything else should remain green).

### Validate test design

- [x] **T33** — Self-review: each new test asserts behavior, not implementation. No test inspects the contents of a private helper directly; all assertions flow through `handleBackgroundPush`'s observable side effects (`AsyncStorage` calls, `scheduleNotificationAsync` calls, `updateWidgetData` calls, `console.error`).

### Commit Phase 6.0

- [x] **T34** — Commit tests-only diff. Stage `src/__tests__/notifications/handler.test.ts` and `src/__tests__/store/config.test.ts` only. Message: `test(06-push-dedup): add failing tests for ID-set dedup, first-run seed, and sign-out wipe`. HEREDOC body with the FR coverage summary. Co-Author-By: `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Phase 6.1 — Implement (TDD green)

Minimum changes to turn the new tests green without breaking existing tests.

### `src/notifications/handler.ts`

- [x] **I1 — Replace key constants.** Remove `PREV_APPROVAL_COUNT_KEY` constant. Add `PREV_APPROVAL_IDS_KEY = 'prev_approval_ids'` and `PREV_APPROVAL_COUNT_KEY_LEGACY = 'prev_approval_count'`.
- [x] **I2 — Add `getPrevIds()` helper.** Async, returns `Promise<Set<string> | null>`. Wraps `AsyncStorage.getItem` in try/catch; returns `null` on any failure path (rejection, non-string, JSON parse error, non-array result). On a valid array, returns `new Set(arr.filter(x => typeof x === 'string'))` — defensive against mixed-type arrays.
- [x] **I3 — Add `savePrevIds(ids: Set<string>)` helper.** Async, returns `Promise<void>`. Calls `AsyncStorage.setItem(PREV_APPROVAL_IDS_KEY, JSON.stringify([...ids]))`. Then calls `AsyncStorage.removeItem(PREV_APPROVAL_COUNT_KEY_LEGACY).catch(() => {})`. The `setItem` rejection IS allowed to propagate so the caller's try/catch logs it (FR7).
- [x] **I4 — Rewrite `handleBackgroundPush` dedup block.** Inside the existing `if (freshData.config.isManager)` branch, replace the count-based logic with:
  - `currentIds = new Set((freshData.approvalItems ?? []).map(it => it.id))`
  - `prevIds = await getPrevIds()`
  - if `prevIds === null` → `await savePrevIds(currentIds)` and `return` (skips notification — but the surrounding try/catch must still complete; use a structured branch instead of an early function-level return so updateWidgetData remains called above).
  - Actually: `updateWidgetData` is already called before this block, so an early `return` inside the manager-branch is safe. Use early return.
  - else: compute `newIds = [...currentIds].filter(id => !prevIds.has(id))`; if `newIds.length > 0` call `await scheduleLocalNotification(newIds.length)`; then `await savePrevIds(currentIds)`.
- [x] **I5 — Preserve the outer try/catch contract.** Any rejection from `savePrevIds` inside the manager branch must be caught by the existing `try { … } catch (err) { console.error(…) }` wrapping the whole handler body. Verify the new code is inside that try.
- [x] **I6 — Update the JSDoc on `handleBackgroundPush`.** Replace the line about "schedules local notification if needed" with a one-liner: "schedules local notification when the manager has newly-arrived approval items (set-difference dedup vs `prev_approval_ids`)."

### `src/store/config.ts`

- [x] **I7 — Add `'prev_approval_ids'` to `clearAll` wipe list.** Insert immediately after the existing `'prev_approval_count'` entry (line 89) so legacy and new keys cluster together. Order matters for test stability — the companion test asserts an exact-content list.

### Run tests — confirm GREEN

- [x] **I8** — `npm test -- handler.test.ts` passes (all old + new tests).
- [x] **I9** — `npm test -- config.test.ts` passes.
- [x] **I10** — `npm test` (full suite) passes with no regressions. *Establish a delta count vs the pre-spec baseline — record both numbers in the commit message.*

### Commit Phase 6.1

- [x] **I11** — Commit implementation. Stage `src/notifications/handler.ts` and `src/store/config.ts` only. Message: `feat(06-push-dedup): replace count-based dedup with ID-set diff`. HEREDOC body describing the structural fix and citing §8.1. Co-Author-By: `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Phase 6.2 — Review

### Spec / implementation alignment

- [ ] **R1 — Manual alignment check.** Walk each FR in spec.md against the implementation. Confirm:
  - FR1: `getPrevIds` handles all 5 null-fallback paths.
  - FR2: Set difference uses `currentIds` minus `prevIds` (not the reverse).
  - FR3: `scheduleLocalNotification` receives `newIds.length`, not `currentIds.size`.
  - FR4: First-run seed early-returns before any notification scheduling.
  - FR5: `removeItem('prev_approval_count')` is called inside `savePrevIds`.
  - FR6: All `prev_approval_ids` reads/writes are inside the `if (config.isManager)` block.
  - FR7: `setItem` rejection is caught by the outer try/catch and logged.
  - FR8: `clearAll` list includes both keys.

### Code review pass

- [ ] **R2 — Self-review the diff** with these prompts:
  - Any code path where the handler can throw past the outer try/catch?
  - Any case where a notification could fire for the same item ID twice across consecutive runs?
  - Any race where `savePrevIds` writes before `scheduleLocalNotification` resolves, leaving stored state ahead of the user's notification?
  - Does the legacy-key cleanup interact badly with the existing `clearAll` flow (e.g. removing the key twice)? No — `removeItem` on an absent key is a no-op.

### Documentation touch-ups

- [ ] **R3 — Update `src/notifications/README.md`** to reflect that count-based dedup is gone. Change the §1 bullet "`prev_approval_count` is count-based, not ID-based" to past tense or remove it — replace with a one-liner pointing to the new key. *Mechanical doc sync, not a behavior change.*
- [ ] **R4 — Update `docs/ARCHITECTURE.md` §1.3 and §8.1.** §1.3 mentions `prev_approval_count`; update to `prev_approval_ids`. §8.1 currently lists this as a known issue — change the entry to "resolved by spec 06" or remove it entirely (preferred: keep the entry with a "resolved" marker for git-archaeology purposes).

### Suite check after doc edits

- [ ] **R5** — Re-run `npm test` to confirm doc-only changes didn't break anything. Expected: identical green count to I10.

### Commit Phase 6.2 docs

- [ ] **R6** — Commit doc updates. Stage `src/notifications/README.md` and `docs/ARCHITECTURE.md` only. Message: `docs(06-push-dedup): document ID-set dedup, mark §8.1 resolved`. HEREDOC. Co-Author-By.

### Manual TestFlight scenarios (deferred to release)

These are recorded for the release-day smoke test; they do not block this spec's merge.

- [ ] **R7 — First-run seed.** Fresh install, sign in as QA manager, wait for first silent push (≤ 30 min). Expect: no "New Approvals" notification.
- [ ] **R8 — New-item arrival.** With seed state established, have a contributor submit a manual time entry. Wait for next silent push. Expect: exactly one "1 item(s) pending approval" notification.
- [ ] **R9 — Approve-then-arrive inversion.** Approve one pending item in the app, then immediately have a contributor submit a new one. Wait for next silent push. Expect: exactly one notification for the new item only (count of 1). *This is the Thursday-flood regression case.*
- [ ] **R10 — Multiple-item arrival.** Two contributors submit time during the same push window. Expect: one notification with count 2.

### Feature changelog

- [x] **R11 — Update `features/app/resilience-fixes/FEATURE.md` Changelog.** Add a row for 06-push-dedup with the implementation date and commit hashes (Phase 6.0, 6.1, 6.2 docs).

### Final commit (changelog)

- [x] **R12** — Stage `features/app/resilience-fixes/FEATURE.md` only. Message: `docs(resilience-fixes): record 06-push-dedup completion in changelog`. HEREDOC. Co-Author-By.

---

## Definition of Done

- All FRs (FR1–FR8) have at least one passing test asserting their success criteria.
- Full `npm test` suite is green with delta = 0 regressions vs the pre-spec baseline. New tests increase the green count.
- `handler.ts` no longer references `PREV_APPROVAL_COUNT_KEY`.
- `clearAll` wipes both `prev_approval_count` and `prev_approval_ids`.
- README and ARCHITECTURE doc references to count-based dedup are updated.
- FEATURE.md Changelog records this spec's completion.
- Four commits land on `main` of the `hourglass-app` inner repo:
  1. `test(06-push-dedup): …`
  2. `feat(06-push-dedup): …`
  3. `docs(06-push-dedup): …`
  4. `docs(resilience-fixes): …`

---

## Session Notes

**2026-05-28**: Implementation complete.

- **Phase 6.0** — 1 commit (`6dd7e1a`): added 20 new failing tests across FR1–FR8, plus updated 2 existing wipe-list assertions. Suite went 3889 → 3889 pass / 20 fail (3909 total) — confirmed RED.
- **Phase 6.1** — 1 commit (`ee5cf05`): rewrote `handleBackgroundPush` manager branch around `getPrevIds()`/`savePrevIds()` helpers, added `prev_approval_ids` to `clearAll` wipe list. Caught a hidden duplicate of the FR8 assertion in `__tests__/config-store.test.ts` (outer-directory) during full-suite run; synced it inside the same commit as a mechanical contract fix. Suite went to 3909/3909 green.
- **Phase 6.2** — 1 commit (`e2a5aec`): updated `src/notifications/README.md` invariants list, `docs/ARCHITECTURE.md` §1.3 / §2 step 5 / §3.2 / §8.1 (marked resolved with residual procedural risk noted). No code touched; suite remained 3909/3909.

**Deviations from the original checklist:**
- T1 was relaxed from "switch to repo-wide manual mock" to "extend the inline mock with `removeItem`" — same observable behavior, lower-risk change, consistent with `useScheduledNotifications.test.ts`.
- T29's scope quietly expanded to include a sibling assertion in `__tests__/config-store.test.ts`; this was caught at I10 (full suite) and folded into the impl commit.

**Manual TestFlight scenarios (R7–R10)** remain unchecked — they require a real device and live API and are deferred to the release-day smoke test, not blocking merge.
