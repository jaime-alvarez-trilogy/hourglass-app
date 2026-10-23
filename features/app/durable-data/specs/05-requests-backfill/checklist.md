# Implementation Checklist

Spec: `05-requests-backfill`
Feature: `durable-data`

Worktree: `hg-worktrees/sdk58`, branch `feat/sdk-58`.

- **Commit locally only.** No push, no PR, no `eas`/`asc.js`/OTA. Never touch the main checkout or Metro on port 8081, and never call the live Crossover API (every test mocks `fetchWorkDiary`).
- **JS-only.** The fingerprint must stay `56d054fc723984e56892a367dca1efa79a9f8fad`. Never touch `package.json`, `package-lock.json`, `app.json`, `eas.json`, `ios/`, `android/` or `patches/`.
- **Stage files by path.** Never `git add -A` / `.`.
- **Commits** use `test(FRn): …` / `feat(FRn): …` / `fix(05-requests-backfill): …`. Write them with a HEREDOC and end them with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Index lock.** If `.git/index.lock` exists, wait ~3 s and retry (up to 5 times). Never delete it.
- **Base for diffs:** `9eecc3c`.
- **Optional to release:** 05 can ship, be dropped or be reverted on its own (FEATURE.md release coupling).

---

## Phase 5.0: Test Foundation

Write all tests first (red). Commit one `test(FRn): …` per FR.

### FR1: `planBackfillWeek` picks the newest week with missing days
File: `src/lib/__tests__/requestsPlanner.test.ts` (extend; no mocks). Build stored days with the file's existing calendar oracle and fixtures, so the cases hold in any host time zone.
- [ ] `DD5.1` Empty store, today `2026-10-21` → `{ monday: '2026-09-28', dates: 2026-09-28..2026-10-04 }` (7 dates).
- [ ] `DD5.2` That week fully stored → `monday: '2026-09-21'`. Every date `2026-05-11..2026-10-04` stored → `null`.
- [ ] `DD5.3` A week missing only Tue and Thu → exactly those 2 dates, ascending.
- [ ] `DD5.4` `skip` holding `'2026-09-28'` (empty store) → `monday: '2026-09-21'`. Repeated calls with a growing `skip` yield exactly 21 distinct Mondays, the last being `'2026-05-11'`, then `null`.
- [ ] `DD5.5` Only the `retentionStart` week has gaps → `monday: '2026-05-11'`. `'2026-05-04'` is never returned, even with no records.
- [ ] `DD5.6` DST: today `2026-11-25`, `2026-11-02` week stored → `monday: '2026-10-26'`, dates `2026-10-26..2026-11-01` (7). Note in the describe that it crosses a transition only under `TZ=America/New_York`.
- [ ] `DD5.7` A `'garbage'` key plus every real date stored → `null`, no throw. Inputs are not mutated (deep-equal before and after, `skip` size unchanged).
- [ ] `DD5.8` `BACKFILL_MAX_WEEKS_PER_SESSION === REQUESTS_RETENTION_WEEKS − 3` (21).

### FR2: `runRequestsBackfill` stores week by week and stops on failure
New file: `src/hooks/__tests__/useRequestsBackfill.test.ts`. Mock `../../api/workDiary` (`fetchWorkDiary`), `../../store/config` (`loadConfig`, `loadCredentials`; `loadConfig` via `mockResolvedValue`, because the store and the runner re-check the owner several times per week) and `../../lib/log`. Use the AsyncStorage `__mocks__` with `_reset()` in `beforeEach`. Inject `today: '2026-10-21'`, a fixed `nowMs`, and `sleep: jest.fn().mockResolvedValue(undefined)`. Build slot fixtures with `autoTracker: false` + `status` + `memo` for manual entries.
- [ ] `DD5.9` Empty store, every fetch resolves `[]` → `{ weeksStored: 21, daysStored: 147, daysFailed: 0, stopReason: 'complete' }`:
  - [ ] the store holds 147 days in `2026-05-11..2026-10-04`, all `entries: []`, `settled: true`, with `fetchedAt` from `nowMs`;
  - [ ] `sleep` is called 21 times with `500`, and `onWeekStored` 21 times;
  - [ ] the first 7 calls are the `2026-09-28` week, and the last 7 are the `2026-05-11` week.
- [ ] `DD5.10` A manual `PENDING` slot → that entry is stored with `settled: false`. An `APPROVED` one → `settled: true`.
- [ ] `DD5.11` 10 newest backfill weeks prefilled → 77 fetch calls, none for a prefilled date. `weeksStored: 11`.
- [ ] `DD5.12` Partial week: 2 dates of the first week reject `NetworkError` → 5 stored, `daysFailed: 2`, the run continues and completes, and the 2 dates have no record. A second run (`__resetBackfillSessionForTests` is not needed: call the runner directly) requests exactly those 2 dates.
- [ ] `DD5.13` 3 dates resolve `undefined` and 4 resolve `[]` → 4 empty days stored, 3 with no record.
- [ ] `DD5.14` Second week all reject `NetworkError` → `'week-failed'`, `weeksStored: 1`. The stored string equals the one captured after week 1, `setItem` is not called after week 1, and no third-week date is requested. The same with all 7 resolving `undefined`.
- [ ] `DD5.15` One date rejects `new AuthError(401)` → `'auth'`, with the week's 6 fulfilled days stored and no further fetch. One date rejecting `new AuthError(401, 'x', { errorCode: AUTH_HTML_500 })` → the run continues (`'complete'`).
- [ ] `DD5.16` One date rejects `new ApiError(429)` → `'throttled'`, with the fulfilled days stored and no further fetch.
- [ ] `DD5.17` `loadConfig` switches to another owner after week 1 (flip a flag inside `onWeekStored`) → `'signed-out'`. No second-week `fetchWorkDiary` call, and no further `setItem`. The same with `loadConfig` → `null`.
- [ ] `DD5.18` `AsyncStorage.getItem` rejects → `'unreadable'`, with no fetch and no `setItem`.
- [ ] `DD5.19` Cap: `jest.spyOn(planner, 'planBackfillWeek')` always returns the same week → `'cap'` after exactly 21 weeks of fetches (147 calls). Restore the spy afterwards. (If the transform makes the export non-configurable, use a `jest.mock('../../lib/requestsPlanner', …)` factory over `requireActual` in an isolated `describe` with `jest.isolateModules` instead.)
- [ ] `DD5.20` Concurrency with deferred promises: while week 1's 7 promises are pending, no second-week call exists. After they settle, and before `sleep` resolves, still none. The maximum pending count is ≤ 7.
- [ ] `DD5.21` Second run with `today: '2026-10-28'` over a store from a complete `2026-10-21` run → only dates the new range uncovers and the store lacks are fetched (the `2026-10-05` week), and nothing below the new `retentionStart`.
- [ ] `DD5.22` `log.info` is called once with `'requests.backfill_done'` and meta equal to the returned `BackfillResult` (checked for `'complete'` and `'week-failed'`).
- [ ] `DD5.23` `onWeekStored` throwing → the run still completes with the same result as DD5.9.

### FR3: `startRequestsBackfillOnce` gates the run and updates the visible view
Same file. A real `QueryClient` (`new QueryClient()`), seeded with `setQueryData` / a fetched query for the error state. Call `__resetBackfillSessionForTests()` in `beforeEach`. Make runs short: a fully stored store, or fetches that resolve `undefined` (`'week-failed'` after one week).
- [ ] `DD5.24` Two concurrent calls (same owner) → one run (fetch calls equal a single run's; one resolves `null`). A third call after both settle → `null`, with no fetch.
- [ ] `DD5.25` Another `assignmentId`, or `useQA` flipped → a new run.
- [ ] `DD5.26` `loadConfig` → `null`, or a config without `assignmentId` → `null`, no fetch. The next call, signed in, runs.
- [ ] `DD5.27` `devManagerView: true` → `null`; `loadCredentials`, `AsyncStorage.getItem('my_requests_v1')` and `fetchWorkDiary` are not called. The next call with it off runs.
- [ ] `DD5.28` `loadCredentials` → `null` → `null`, no fetch. The next call with credentials runs.
- [ ] `DD5.29` `loadConfig` rejects → resolves `null` (no rejection), and `log.error` is called with `'requests.backfill_failed'`.
- [ ] `DD5.30` View update over a `success` same-owner view with `dataUpdatedAt` T, `error: null`, `staleDates: ['x']` and `updatedAt: 'u'`:
  - [ ] a prev entry in a still-unrecorded week is kept;
  - [ ] a prev entry in the week just stored is replaced by that day's stored entries;
  - [ ] `getQueryState(key).dataUpdatedAt === T`, and `staleDates`/`updatedAt` are unchanged;
  - [ ] a legacy prev (no `ownerKey`) is updated and stamped `ownerKey`.
- [ ] `DD5.31` A prev stamped with a foreign `ownerKey`, or `'dev-mock'` → `getQueryData` returns the same reference after the run.
- [ ] `DD5.32` An errored query that still holds data (a queryFn that rejects after `setQueryData`) → data reference and `state.error` unchanged after a stored week.
- [ ] `DD5.33` No cached data → `getQueryData(['myRequests', id])` is still `undefined` after the run.
- [ ] `DD5.34` `__resetBackfillSessionForTests()` lets the same owner run again.

### FR4: The Requests screen schedules the backfill
- [ ] `DD5.35` Same file: render a tiny component calling `useRequestsBackfill()` inside a `QueryClientProvider` with `react-test-renderer`, with `jest.useFakeTimers()` and `../useConfig` mocked (signed in):
  - [ ] `loadConfig` is not called at 4 999 ms, and is called after 5 000 ms (flush with `await act(async () => {})`);
  - [ ] unmounting at 4 000 ms → `loadConfig` is never called;
  - [ ] `devManagerView: true`, or no `assignmentId` → no call after 10 000 ms;
  - [ ] re-rendering with `useQA` flipped (and `loadConfig` returning the same) → a second gate run for the new owner after another 5 000 ms.
- [ ] `DD5.36` `app/(tabs)/__tests__/approvals.test.tsx`: add the C16 factory mock. Static check (comments stripped): it imports `useRequestsBackfill` from `@/src/hooks/useRequestsBackfill`, calls `useRequestsBackfill()`, and the existing "does not import useConfig" case still passes.
- [ ] `DD5.37` `app/(tabs)/__tests__/approvals-mesh.test.tsx`: add the same factory mock (no new case).

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run the `red-phase-test-validator` agent.
- [ ] Every FR1-FR4 success criterion has test coverage (DD5.1-DD5.37).
- [ ] Assertions are specific: exact dates, call counts, store contents and stop reasons, not "was called" or "doesn't throw".
- [ ] Mocks return realistic data that matches the interface contracts (`WorkDiarySlot` fields, `AuthError`/`ApiError` constructors, `MyRequestsData` shape).
- [ ] Fix any issues identified before proceeding.

---

## Phase 5.1: Implementation

### FR1: `planBackfillWeek`
- [ ] `src/lib/requestsPlanner.ts`: add `BACKFILL_MAX_WEEKS_PER_SESSION`, `BackfillWeek` and `planBackfillWeek` in a new `// ─── planBackfillWeek` section, with a header-comment line (`durable-data 05-requests-backfill FR1`). Update the `planRequestRefresh` doc line "left to the backfill (spec 05)" to name `planBackfillWeek`.
- [ ] Commit `feat(FR1): …`.

### FR2: `runRequestsBackfill`
- [ ] `src/lib/requestsStore.ts`: `export` on `isOwnerConfigured`, plus one header-comment line (C3). No other change.
- [ ] `src/hooks/useRequestsBackfill.ts` (new): header comment in the style of `useHistoryBackfill.ts`/`useMyRequests.ts` (spec ids, strategy); constants, `BackfillStopReason`, `BackfillResult`, `BackfillDeps`; `runRequestsBackfill` per FR2 steps 1-8; one `log.info('requests.backfill_done', …)` on every exit.
- [ ] Commit `feat(FR2): …`.

### FR3: `startRequestsBackfillOnce`
- [ ] `src/hooks/useMyRequests.ts`: `export` on `toOwnerKey`, plus one header-comment line (C2). No other change.
- [ ] Same new file: `backfillStartedFor`, `__resetBackfillSessionForTests`, the default `sleep`, `startRequestsBackfillOnce` (synchronous check-and-add, C9; never rejects, C13) and the `onWeekStored` view update (C8).
- [ ] Commit `feat(FR3): …`.

### FR4: Mount
- [ ] Same new file: `useRequestsBackfill` (`useQueryClient`, `useConfig`, an effect on `[queryClient, ownerKey]`).
- [ ] `app/(tabs)/approvals.tsx`: import it and call `useRequestsBackfill()` right after `useMyRequests()`; add a `durable-data 05 FR4` header-comment line.
- [ ] `docs/ARCHITECTURE.md` §4.4: add the "Backfill (durable-data 05)" step (trigger, planner, stop reasons, view-update rule, once per session per owner) and update step 2's pointer (C17).
- [ ] Confirm `__tests__/approvals-screen.test.tsx`, `src/components/__tests__/MotionUniversality.test.tsx` and `__tests__/build-team-queue-rows.test.ts` still pass.
- [ ] Commit `feat(FR4): …`.

---

## Phase 5.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run the `spec-implementation-alignment` agent.
- [ ] All FR1-FR4 success criteria are verified in code.
- [ ] Interface contracts match the implementation:
  - [ ] `BACKFILL_MAX_WEEKS_PER_SESSION`, `BackfillWeek`, `planBackfillWeek`;
  - [ ] `BACKFILL_START_DELAY_MS`, `BACKFILL_WEEK_PAUSE_MS`, `BackfillStopReason` (exactly 7 members), `BackfillResult`, `BackfillDeps`;
  - [ ] `runRequestsBackfill`, `startRequestsBackfillOnce`, `useRequestsBackfill`, `__resetBackfillSessionForTests`;
  - [ ] the `export`-only changes to `toOwnerKey` and `isOwnerConfigured`.
- [ ] No scope creep and no shortfall:
  - [ ] Out Of Scope items 1-10 are untouched;
  - [ ] `useHistoryBackfill.ts`, `src/api/*`, `src/lib/limit.ts`, `src/lib/requestRows.ts`, `queryPersist.ts`, `planRequestRefresh` and `src/store/config.ts` are unchanged (`git diff 9eecc3c..HEAD --stat` for each).

### Step 1: Comprehensive PR Review
- [ ] Run the `pr-review-toolkit:review-pr` skill (6 specialized agents) on the spec's diff (`git diff 9eecc3c..HEAD`), **locally only**: no PR, no push.

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues.
- [ ] Fix MEDIUM severity issues, or document why they are deferred.
- [ ] Re-run the focused tests after the fixes.
- [ ] Commit the fixes: `fix(05-requests-backfill): {description}`.

### Step 3: Test Quality Optimization
- [ ] Run the `test-optimiser` agent on the new and modified tests.
- [ ] Apply the improvements that strengthen confidence.
- [ ] Re-run the tests to confirm they pass.
- [ ] Commit if anything changed: `fix(05-requests-backfill): strengthen test assertions`.

### Final Verification
- [ ] Focused suite green (quote the `(tabs)` paths):
  ```
  npx jest src/lib/__tests__/requestsPlanner.test.ts src/hooks/__tests__/useRequestsBackfill.test.ts \
    "app/(tabs)/__tests__/approvals.test.tsx" "app/(tabs)/__tests__/approvals-mesh.test.tsx" \
    src/lib/__tests__/requestsStore.test.ts src/hooks/__tests__/useMyRequests.test.ts \
    __tests__/approvals-screen.test.tsx src/components/__tests__/MotionUniversality.test.tsx \
    __tests__/build-team-queue-rows.test.ts
  ```
  Confirm the suite count is 9 (both `(tabs)` files actually matched).
- [ ] Full suite green: `npx jest` (no regressions in existing tests).
- [ ] `npm run typecheck` is clean.
- [ ] `npm run lint` reports 0 errors.
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` prints `56d054fc723984e56892a367dca1efa79a9f8fad`.
- [ ] No changes to `package.json`/`app.json`/native: `git diff --stat 9eecc3c..HEAD -- package.json package-lock.json app.json eas.json ios android patches plugins` is empty.
- [ ] Code follows existing patterns:
  - [ ] the pure planner in `src/lib` with unit tests;
  - [ ] the runner shaped like `useHistoryBackfill`'s `runBackfill` (sequential weeks, `allSettled`, write only data, pause);
  - [ ] `src/lib/log.ts` conventions (dotted category, redaction-safe keys, `log.error` with the error for the class name);
  - [ ] comment density matching the neighbours.
- [ ] Update `FEATURE.md`:
  - [ ] the changelog row for `05-requests-backfill` (status, commits, test counts);
  - [ ] the "Files Touched" list (add `src/lib/requestsStore.ts` and `src/hooks/useMyRequests.ts` export-only changes for spec 05, `docs/ARCHITECTURE.md`, and the two screen test files).
  - [ ] Commit as `docs(05-requests-backfill): update checklist and FEATURE.md`.

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-22**: Spec and checklist written (autonomous, not committed). Deviations from spec-research and the decisions, all recorded in spec.md C1-C18:
- C3: an owner check before each week's fetch (`isOwnerConfigured` exported), so a sign-out or env switch makes no further request and mints no token with stale credentials.
- C4: the 21-week cap is unreachable by construction (plan first, 21 weeks in range, each attempted once), so it is kept as a defensive bound and tested with a planner spy.
- C6, C7: two new stop reasons, `'throttled'` (any 429) and `'unreadable'` (store read failed at start).
- C8: the live view update only runs over a `success` same-owner/legacy view and keeps `dataUpdatedAt`, because `setQueryData` would otherwise clear spec 04's error state and reset freshness.
- C9: the session flag is set only when a run actually starts, with a synchronous check-and-add.
- C10: the hook re-schedules on an owner change (env switch while the tab is mounted).
- C11: the steady-state cost is zero once weeks are stored; unanswered dates are retried at most once per session (≤ 7 requests when a week fully fails).
