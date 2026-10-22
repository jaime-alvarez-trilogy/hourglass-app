# Implementation Checklist

Spec: `02-requests-store`
Feature: `durable-data`

Worktree: `hg-worktrees/sdk58`, branch `feat/sdk-58`. Commit locally only: no push, no PR, no `eas`/OTA. JS-only, and the fingerprint must stay `56d054fc723984e56892a367dca1efa79a9f8fad`. Stage files by path. Commits use `test(FRn): …` / `feat(FRn): …` / `fix(02-requests-store): …` and end with the `Co-Authored-By` line.

---

## Phase 2.0: Test Foundation

Write all tests first (red). Commit one `test(FRn): …` per FR.

### FR1: Bounded work-diary traffic
- [ ] Create `src/lib/__tests__/limit.test.ts`:
  - [ ] `DD2.1` `createLimiter(4)` with 10 deferred tasks: 4 started, resolving one starts the 5th, and each promise resolves with its own value.
  - [ ] `DD2.2` `createLimiter(1)` runs tasks serially, in FIFO start order.
  - [ ] `DD2.3` A rejecting task, and an async task that throws synchronously, reject only their own promise and free the slot.
- [ ] `__tests__/api/work-diary.test.ts`:
  - [ ] Add `getAuthGeneration: jest.fn(() => 0)` to the `../../src/api/client` factory mock, and `beforeEach(__resetWorkDiaryInFlightForTests)`. Confirm the existing cases still assert the same call counts.
  - [ ] `DD2.4` Limit: 10 concurrent calls for distinct dates with deferred `apiGet` → at most 4 pending at once; all 10 resolve.
  - [ ] `DD2.5` Sharing: 2 concurrent same-key calls → `apiGet` ×1, `getAuthToken` ×1, results `toBe` the same array.
  - [ ] `DD2.6` Different dates → 2 calls; same date with `useQA` false and true → 2 calls.
  - [ ] `DD2.7` No memo: call, await, call again → 2 `apiGet` calls.
  - [ ] `DD2.8` Generation reset: pending call, generation → 1, same key → a 2nd `apiGet`. Resolving the 1st keeps the 2nd entry: a 3rd concurrent call joins it (total 2).
  - [ ] `DD2.9` Joins bypass the queue: 4 in flight plus a 5th queued; a join of #2 resolves when #2 does; total `apiGet` = 5.
  - [ ] `DD2.10` Shared `NetworkError` rejects both callers with the same error; the next call fetches again; no unhandled rejection.
- [ ] Create `src/__tests__/api/auth-generation.test.ts` (real `client.ts`): `DD2.11` `getAuthGeneration()` is 0, then 1 after `invalidateAuthToken()`.

### FR2: Pure refresh planner
- [ ] Create `src/lib/__tests__/requestsPlanner.test.ts` (no mocks; noon-anchored fixtures):
  - [ ] `DD2.12` Empty store: Monday 2026-03-09 → 15 dates (`today` + `daily`); Wednesday → 17; Sunday → 21.
  - [ ] `DD2.13` Every window day fetched 5 min ago, no PENDING → `['2026-03-09']`.
  - [ ] `DD2.14` Yesterday 61 min → `recent-ttl`; 59 min → not planned.
  - [ ] `DD2.15` A current-week day that is neither today nor yesterday: fetched 3 h ago today → skipped; fetched on a previous day → `daily`.
  - [ ] `DD2.16` A PENDING day in the window: 16 min → `pending-ttl`; 14 min → skipped.
  - [ ] `DD2.17` A last-week day fetched this Monday, today Tuesday → `daily`; `settled: true` → skipped.
  - [ ] `DD2.18` `force: true` → every `catchUpStart..today` date as `forced` (today stays `today`); nothing older is forced.
  - [ ] `DD2.19` A day older than `catchUpStart`: settled → never; unsettled 7 h → `unsettled-old`; 5 h → skipped; no record → skipped. A day before `retentionStart` → never.
  - [ ] `DD2.20` Wake budget, one `it` per row: Mon 8, Tue 9, Wed 3, Sun 7, +5 min 1, +90 min 2.
  - [ ] `DD2.21` Future `fetchedAt` → only `today`; `fetchedAt: 'garbage'` → treated as never fetched.
  - [ ] `DD2.22` DST: correct Mondays across 2026-03-08 and 2026-11-01; `tuesdayAfter('2026-10-25') === '2026-10-27'`, `tuesdayAfter('2026-11-01') === '2026-11-03'`.
  - [ ] `DD2.23` `isDaySettled`: Tuesday fetch → true; Monday fetch → false; PENDING → false; current week → false; empty closed-week day after `tuesdayAfter` → true.
  - [ ] `DD2.24` Output dates are unique and sorted descending; `reasons` has one key per date.
  - [ ] `DD2.25` Source check: `requestsPlanner.ts` contains `getWeekStartDate`.

### FR3: The `my_requests_v1` store
- [ ] Create `src/lib/__tests__/requestsStore.test.ts` (AsyncStorage `__mocks__` with `_reset()` in `beforeEach`; `../../store/config` `loadConfig` via `mockResolvedValue`; `../log` mocked):
  - [ ] `DD2.26` Round trip of 2 days, including one with `entries: []`.
  - [ ] `DD2.27` Merge `{d1, d2}` + `{d2'}` → `{d1, d2'}`.
  - [ ] `DD2.28` Prune on write; `buildRequestsView` ignores out-of-retention days before any write.
  - [ ] `DD2.29` Owner mismatch (another `assignmentId`; the other `useQA`) → `empty`; an update holds only the new owner's days.
  - [ ] `DD2.30` `version: 2` → `empty`; corrupt JSON → `empty`, and the next update writes.
  - [ ] `DD2.31` Two concurrent updates with different days both persist. A `setItem` that throws once does not block the next write.
  - [ ] `DD2.32` `getItem` throws → `unreadable` + `requests.store_read_failed`; the update returns `null` with no `setItem`.
  - [ ] `DD2.33` `setItem` throws → the merged store is returned + `requests.store_write_failed`.
  - [ ] `DD2.34` Pre-check `loadConfig` null / other `assignmentId` / throws → `null`, no `setItem`.
  - [ ] `DD2.35` Sign-out race: owner for the pre-check, then `null` for the verify → `null`, `removeItem('my_requests_v1')` called, and the key is absent afterwards.
  - [ ] `DD2.36` Real `clearAll()` (`jest.requireActual`) removes `my_requests_v1`.
  - [ ] `DD2.37` `buildRequestsView` sort and in-day order; `updatedAt` = max `fetchedAt` in the catch-up window only.
  - [ ] `DD2.38` `composeRequestsView`: carries a prior entry whose date has no record; drops one whose date has a record (even an empty one); drops one older than `retentionStart`.
  - [ ] `DD2.39` Source check: `requestsStore.ts` contains `sort`.
- [ ] `__tests__/config-store.test.ts:127-131,137-156` and `src/__tests__/store/config.test.ts:59-64`: `toHaveLength(19)` (update the titles) and `toContain('my_requests_v1')`.

### FR4: Store-backed queryFn
- [ ] `src/hooks/__tests__/useMyRequests.test.ts` setup: `beforeEach(() => (AsyncStorage as any)._reset())` in every `describe` that runs the queryFn, plus `jest.mock('../../lib/log')`. Confirm FR4.1-FR4.5 and CH.1-CH.5 pass unchanged.
- [ ] Rewrite FR4.6: total failure with `AuthError(401)` → `rejects.toBeInstanceOf(AuthError)`; with `NetworkError` → `rejects.toBeInstanceOf(NetworkError)`; `log.warn('requests.refresh_failed', …)` once, with numeric `plannedDays`/`failedDays` and `kind`.
- [ ] `DD2.40` First run stores every planned day, including empty days.
- [ ] `DD2.41` `describe('DD2 — wake budget')`: Tue 21:00 → 16; Wed 08:00 → 3 (exact dates); 08:05 → 1; 09:30 → 2; daily 21:00 runs Wed-Sun, then Mon 2026-10-26 08:00 → 8. Add a comment noting the old code made 17 calls per Wednesday run. Use `jest.clearAllMocks()` between runs (no `_reset()`).
- [ ] `DD2.42` A successful empty day removes that day's old entry (store and view).
- [ ] `DD2.43` Partial failure: Mon and Wed fail, Tue flips PENDING → APPROVED → 3 entries, `staleDates = ['2026-03-11','2026-03-09']`, `error: null`, failed records `JSON.stringify`-equal.
- [ ] `DD2.44` `undefined` versus `[]`: `undefined` → `staleDates`, old record kept; `[]` → stored empty day; all `undefined` → rejects `NetworkError`, nothing written.
- [ ] `DD2.45` A failed refresh leaves storage byte-identical: `getItem` is string-equal to before, and there is no `setItem('my_requests_v1')`.
- [ ] `DD2.46` Credentials `null` → rejects `AuthError` with `errorCode 'NO_CREDENTIALS'`, and a cold `ctx` cache is seeded from the store. `loadCredentials` throws → rejects with that error, and the cache is seeded.
- [ ] `DD2.47` Carry-forward: a failed, unrecorded day present in the `ctx` prior → in the view, not in the store; with no prior → absent.
- [ ] `DD2.48` Upgrade from a 1.1 blob: success → the 2 older entries remain, the in-window ones are cleared, no store record for the older dates; total failure → rejects, legacy blob unchanged.
- [ ] `DD2.49` Owner stamp: a `'79996|prod'` prior with a QA config → nothing carried, result `'79996|qa'`. A `'dev-mock'` prior with the toggle off → nothing carried; on total failure, seeded from the store.
- [ ] `DD2.50` `devManagerView` → mocks with `ownerKey 'dev-mock'`; no store `setItem`; no `loadCredentials`; the force flag is not consumed.
- [ ] `DD2.51` `markMyRequestsForcedRefresh()` → the full window, once; the next run is back to normal.
- [ ] `DD2.52` `getItem` throws → resolves with fetched days + prior carry-forward; no `setItem`.
- [ ] `DD2.53` No config → `{entries: [], error: null}`, no fetch.
- [ ] `DD2.54` `describe('DD2 — cache semantics')` with a real `QueryClient` (`retry: false`): (a) all-fail `NetworkError` keeps data, status `'error'`; (c) the same with `AuthError`; (b) partial failure via `fetchQuery`; seed-then-throw on an empty client → 3 entries, status `'error'`.

### FR5: Hook, env switch, docs
- [ ] `useMyRequests.test.ts` static block: re-point SC9 to `planRequestRefresh` (keep DD2.25 for `getWeekStartDate` in the planner) and SC12 to DD2.39. Add `DD2.55` `retry:\s*shouldRetryQuery`, plus a check that `retry: 2` is gone.
- [ ] `DD2.56` `selectMyRequests`: legacy → entries; matching → entries; prod blob with a QA config → `[]`; `'dev-mock'` with toggle true → mocks; toggle false or absent, or `config` null → `[]`; defaults `staleDates: []`, `updatedAt: null`.
- [ ] `DD2.57` `toRequestsError`: `AuthError(401)` → `'auth'`; `AUTH_HTML_500` → `'network'`; `NetworkError` → `'network'`; `ApiError(503)` → `'network'`; `null` → `null`. The thrown error wins over `data.error`.
- [ ] `DD2.58` `describe('DD2 — env switch')`: prod view + prod store → `removeQueries` + `invalidateQueries` → QA all-fail → `getQueryData` is `undefined`; the same with a legacy blob; a control without `removeQueries` shows the blob kept as a prior.
- [ ] `app/__tests__/modal-auth-cache.test.tsx` `DD2.envSwitch`: the `handleSwitchEnvironment` body contains `removeQueries({ queryKey: ['myRequests'] })` before `invalidateQueries(`.
- [ ] Docs: no automated test. FR5's doc criteria are checked with `grep` in Phase 2.1.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run the `red-phase-test-validator` agent.
- [ ] Every FR1-FR5 success criterion has test coverage (FR5 docs via grep).
- [ ] Assertions are specific: call counts, exact date lists, `toBe` identity, string-equal storage, `errorCode`. "Doesn't throw" alone is not enough.
- [ ] Mocks return realistic data that matches the interface contracts (`WorkDiarySlot` via `makeSlot`, `CrossoverConfig` with `useQA`, ISO `fetchedAt`).
- [ ] Record the red run (failing counts per file) in Session Notes.
- [ ] Fix any issues found before proceeding.

---

## Phase 2.1: Implementation

Commit one `feat(FRn): …` per FR.

### FR1: Bounded work-diary traffic
- [ ] Create `src/lib/limit.ts` (`Limiter`, `createLimiter`; FIFO; a slot is released on settle, including a synchronous throw).
- [ ] `src/api/client.ts`: add `export function getAuthGeneration(): number` with a one-line JSDoc. No other change.
- [ ] `src/api/workDiary.ts`: `WORK_DIARY_CONCURRENCY = 4`, `workDiaryLimiter`, `workDiaryInFlight`, the key ``${getAuthGeneration()}|${env}|${assignmentId}|${date}``, join-or-start, `p.then(clear, clear)` with an identity check, and `__resetWorkDiaryInFlightForTests`. Keep `toAuthCreds(credentials, useQA)` as the last `apiGet` argument. Add a JSDoc note that the array is shared and read-only, and update the header comment.
- [ ] `npx jest src/lib/__tests__/limit.test.ts __tests__/api/work-diary.test.ts src/__tests__/api/auth-generation.test.ts src/__tests__/api/creds-wiring.test.ts` is green.

### FR2: Pure refresh planner
- [ ] Create `src/lib/requestsPlanner.ts`: TTL constants; `todayLocal`, `formatLocalDate`, `addDays` (noon anchor), `dateRange`, `localDateOf`; `RequestWindows`, `RefreshReason`, `RefreshPlanInput`, `RefreshPlan`; `requestWindows`, `tuesdayAfter`, `isDaySettled`, `planRequestRefresh` (the rule order in spec FR2).
- [ ] Define `REQUESTS_RETENTION_WEEKS = 24` in the planner; `requestsStore.ts` re-exports it. The planner uses `import type` only from the store (no runtime cycle).
- [ ] `npx jest src/lib/__tests__/requestsPlanner.test.ts` is green.

### FR3: The `my_requests_v1` store
- [ ] Create `src/lib/requestsStore.ts`: constants, types, `readRequestsStore` (never throws; logs `requests.store_read_failed`), `updateRequestsStore` (write chain; re-read → merge → prune → pre-check → `setItem` → verify → `removeItem`; fail closed per C7; never rejects), `pruneDays`, `buildRequestsView`, `composeRequestsView`.
- [ ] `src/store/config.ts`: add `'my_requests_v1'` to `clearAll`'s `multiRemove` (update the count comment).
- [ ] `npx jest src/lib/__tests__/requestsStore.test.ts __tests__/config-store.test.ts src/__tests__/store/config.test.ts` is green.

### FR4: Store-backed queryFn
- [ ] `src/types/requests.ts`: `MyRequestsData`; optional `staleDates` / `updatedAt` on `UseMyRequestsResult`; update the doc comments (entries are no longer limited to 3 weeks).
- [ ] `src/hooks/useMyRequests.ts`: remove the local date helpers (moved to the planner). Rewrite `buildMyRequestsQueryFn(todayOverride?, nowOverride?)` following spec FR4 (steps 1-13), with `seedAndThrow`, the `requests.refresh_failed` log, and `markMyRequestsForcedRefresh` / `consumeForcedRefresh`.
- [ ] `npx jest src/hooks/__tests__/useMyRequests.test.ts` FR4 blocks are green.

### FR5: Hook, env switch, docs
- [ ] `useMyRequests.ts`: `toRequestsError`, `selectMyRequests`, `retry: shouldRetryQuery`, and return `{...selectMyRequests(...), isLoading, refetch}`. Update the hook JSDoc.
- [ ] `app/modal.tsx` `handleSwitchEnvironment`: `queryClient.removeQueries({ queryKey: ['myRequests'] })` after `setQueryData(['config'], …)` and before `invalidateQueries()`, with a one-line comment.
- [ ] `docs/ARCHITECTURE.md`: §3.2 `my_requests_v1` row; §3.3 `['myRequests', assignmentId]` row; §4 requests refresh sub-section; §8.8 note.
- [ ] `for t in my_requests_v1 planRequestRefresh removeQueries; do grep -q "$t" docs/ARCHITECTURE.md || echo "missing $t"; done` prints nothing, and `grep -nE "WORK_DIARY_CONCURRENCY|4 in flight" docs/ARCHITECTURE.md` finds a match.
- [ ] `npx jest src/hooks/__tests__/useMyRequests.test.ts app/__tests__/modal-auth-cache.test.tsx "app/(tabs)/__tests__/approvals.test.tsx"` is green.

---

## Phase 2.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run the `spec-implementation-alignment` agent.
- [ ] Every FR1-FR5 success criterion is verified in code.
- [ ] Interface contracts match the implementation (exported names and signatures from the spec and research Interface Contracts, plus `getAuthGeneration`).
- [ ] No scope creep (no UI changes, no wiring of `refetch` to the force flag, no persist predicate) and no shortfall.

### Step 1: Comprehensive PR Review
- [ ] Run the `pr-review-toolkit:review-pr` skill (launches 6 specialized agents) on the local diff `c1b36c2..HEAD`. Do not post to GitHub or create a PR.

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical).
- [ ] Fix MEDIUM severity issues, or document why they are deferred.
- [ ] Re-run the tests after fixes.
- [ ] Commit fixes: `fix(02-requests-store): {description}`.

### Step 3: Test Quality Optimization
- [ ] Run the `test-optimiser` agent on the new and modified tests.
- [ ] Apply suggested improvements that strengthen confidence.
- [ ] Re-run the tests to confirm they pass.
- [ ] Commit if changes were made: `fix(02-requests-store): strengthen test assertions`.

### Final Verification
- [ ] Focused suites are green:
  ```
  npx jest src/lib/__tests__/limit.test.ts src/lib/__tests__/requestsPlanner.test.ts src/lib/__tests__/requestsStore.test.ts \
    src/hooks/__tests__/useMyRequests.test.ts __tests__/api/work-diary.test.ts src/__tests__/api/auth-generation.test.ts \
    src/__tests__/api/creds-wiring.test.ts __tests__/config-store.test.ts src/__tests__/store/config.test.ts \
    __tests__/use-ai-data.test.ts src/hooks/__tests__/useTeamAggregateData.test.ts src/__tests__/lib/crossoverData.test.ts \
    app/__tests__/modal-auth-cache.test.tsx app/__tests__/modal.test.tsx app/__tests__/modal-signout.test.tsx \
    "app/(tabs)/__tests__/approvals.test.tsx"
  ```
- [ ] Full suite: `npx jest`. All passing, no regressions.
- [ ] `npm run typecheck` is clean.
- [ ] `npm run lint` reports 0 errors.
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` == `56d054fc723984e56892a367dca1efa79a9f8fad`.
- [ ] No changes to package.json/app.json/native: `git diff --stat c1b36c2..HEAD -- package.json package-lock.json app.json eas.json ios android patches plugins` is empty.
- [ ] The code follows existing patterns (header comments, `log` categories, noon-anchored dates).
- [ ] Update `FEATURE.md` Changelog (02 → Complete, with commits) and this checklist's Session Notes.

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-22**: Spec and checklist written (autonomous). `getAuthGeneration()` did not exist after spec 01, so this spec adds it (C1). The 15 clarification decisions (C1-C15) are in spec.md.
