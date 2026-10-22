# Implementation Checklist

Spec: `03-keep-last-good`
Feature: `durable-data`

Worktree: `hg-worktrees/sdk58`, branch `feat/sdk-58`. Commit locally only: no push, no PR, no `eas`/`asc.js`/OTA. JS-only, and the fingerprint must stay `56d054fc723984e56892a367dca1efa79a9f8fad`. Never touch `package.json`, `package-lock.json`, `app.json`, `eas.json`, `ios/`, `android/` or `patches/`. Stage files by path (never `git add -A` / `.`). Commits use `test(FRn): …` / `feat(FRn): …` / `fix(03-keep-last-good): …`, written with a HEREDOC, and end with the `Co-Authored-By` line. If `.git/index.lock` exists, wait ~3 s and retry (up to 5 times); never delete it.

---

## Phase 3.0: Test Foundation

Write all tests first (red). Commit one `test(FRn): …` per FR.

### FR1: Hours, earnings and the widget keep the last good values
- [ ] `src/__tests__/api/retry-policy.test.ts`: import `shouldRetryOnce`. `DD3.6`: the table `(0, NetworkError)` true, `(1, NetworkError)` false, `(0, AuthError(401))` false, `(0, AUTH_HTML_500)` true; and `attemptsUntilGiveUp(shouldRetryOnce, outage) === 2`, `(…, new AuthError(401)) === 1`. Keep the local `oneRetry` cases as they are.
- [ ] `__tests__/hooks/useHoursData.test.ts` (the existing `global.fetch` pattern; `TypeError` rejection → `NetworkError`, `{ ok: false, status: 500, text: async () => '' }` → `ApiError(500)`):
  - [ ] `DD3.1` All 3 strategies reject → rejects `NetworkError`, `fetch` called exactly 3 times.
  - [ ] `DD3.2` Mixed rejections (500, network, 503) → rejects with the last one (`ApiError`, `statusCode` 503).
  - [ ] `DD3.3` 500 then `[]`, `[]` → `null`; reject, reject, `[row]` → `row`; three empty bodies → `null`.
  - [ ] `DD3.4` 401 on strategy 1 → rejects `AuthError` after 1 call (alongside the existing 401/403 cases).
  - [ ] `DD3.5` `fetchPayments`: network → rejects; 500 → rejects; empty body → `null`; `[row]` → `row`. The existing `[]` → `null` case stays.
- [ ] `src/hooks/__tests__/useHoursData.test.ts` (static): `DD3.7` `useTimesheet.ts` / `usePayments.ts` contain `retry: shouldRetryOnce` and not `retry: 1`. The `useHoursData.ts` guard still has `!timesheetQuery.isError` and `!paymentsQuery.isError`, and still has `eitherError && cache`.
- [ ] Create `__tests__/hooks/useHoursData.keep-last-good.test.ts`. Use the `setupHook` pattern from `__tests__/use-ai-data.test.ts:102-117` with a real `QueryClient` (`defaultOptions.queries: { retryDelay: 0, gcTime: 0 }`; **do not** set `retry`, so the hooks' `shouldRetryOnce` is exercised). Mock `../../src/api/client` (`apiGet`, `getAuthToken`) and `../../src/store/config` (`loadConfig`, `loadCredentials`, `getApiBase`). Use the AsyncStorage `__mocks__` with `_reset()` in `beforeEach`. Fake the clock to a Wednesday so the week key is stable.
  - [ ] `DD3.8` Seed `hours_cache` (total 32.5), capture the raw string; every `apiGet` rejects `NetworkError` → after the retries: `getItem('hours_cache')` is string-equal to the capture; no `setItem('hours_cache', …)`; `data.total === 32.5`; `isStale === true`; `error === null`. Assert that `apiGet` was called 6 times for the timesheet (3 strategies × 2 attempts) and 2 times for payments.
  - [ ] `DD3.9` A success run writes `hours_cache` (total 20). Then `refetch()` with every `apiGet` rejecting → `hours_cache` unchanged; `data.total === 20`.
  - [ ] `DD3.10` Every strategy and payments resolve `[]` → `hours_cache` written with `total` 0.
- [ ] Confirm that `src/__tests__/lib/crossoverData.test.ts`, `src/__tests__/hooks/useWidgetSync.test.ts` and `src/hooks/__tests__/hooksCredsForwarding.test.ts` are still green (no edits for FR1).

### FR2: The AI tab keeps its data on an auth failure
- [ ] `__tests__/use-ai-data.test.ts`:
  - [ ] `DD3.11` Rewrite `:179-185`: seed `ai_cache` with today's date (UTC) `{ total: 12, aiUsage: 4, secondBrain: 1, noTags: 2 }`, `fetchWorkDiary` rejects `AuthError(401)` (make sure today is planned, for example via `_lastFetchedAt` absent) → `error === 'auth'`, `data` not null, `data.totalSlots === 12`.
  - [ ] `DD3.12` The same with `AuthError(403)`.
  - [ ] `DD3.13` After the failure, `getItem('ai_cache')` is string-equal to the seeded value.

### FR3: The earnings trend and team totals keep the last good values
- [ ] Create `src/hooks/__tests__/usePaymentHistory.test.ts` (mock `../../store/config` `loadCredentials`, `../../api/client` `getAuthToken`/`apiGet`):
  - [ ] `DD3.14` `[p1, p2]` → that array; no config → `null` and no `apiGet`; `undefined` → `null`. Assert the `apiGet` path, `{ from, to }`, and that the last argument is `toAuthCreds(creds, useQA)`.
  - [ ] `DD3.15` `NetworkError` → rejects `NetworkError`; `AuthError(401)` → rejects `AuthError`; `loadCredentials` → `null` → rejects `'No credentials'`.
  - [ ] `DD3.16` Real `QueryClient` (`retry: false`): `setQueryData(['paymentHistory', from, to, userId], [a, b, c])`, then `fetchQuery` with the builder and a rejecting `apiGet` (`.catch` the rejection) → `getQueryData` is the same 3-element array; `getQueryState().status === 'error'`.
  - [ ] `DD3.17` Static: `usePaymentHistory.ts` and `useEarningsHistory.ts` contain `buildPaymentHistoryQueryFn(` and `retry: shouldRetryOnce`, and not `retry: 1`. `useEarningsHistory.ts` still contains `earnings_history_v1` and `paidHours`.
- [ ] `src/hooks/__tests__/useTeamAggregateData.test.ts`:
  - [ ] `DD3.18` Rewrite `:453-469` → `rejects.toThrow('all down')`.
  - [ ] `DD3.19` All `AuthError(401)` → rejects `AuthError`; all reject `undefined` → rejects `NetworkError`.
  - [ ] `DD3.20` A rejects `'a'`, B rejects `'b'` → rejects `'a'`.
  - [ ] `DD3.21` `:420-436`: `await expect(queryFn()).rejects.toThrow('boom')`, then the existing `log.error` assertions (2 calls, both ids).
  - [ ] `DD3.22` `:496-511`: one-member roster → rejects `'one day failed'`. Add a two-member variant → `reportCount: 1`, bad row `fetchFailed: true`.
  - [ ] `DD3.23` Real `QueryClient` (`retry: false`): seeded `weekHours: 40`, an all-fail `fetchQuery` → `getQueryData().weekHours === 40`. `mapTeamAggregateState` with that data and error → `data` non-null, `error` is the message.
  - [ ] `DD3.24` Static: `retry: shouldRetryOnce`, and not `retry: 1`.

### FR4: Weekly history writers never save over an unreadable store
- [ ] `src/lib/__tests__/weeklyHistory.test.ts` (add `jest.mock('../log')` if needed to assert the warn):
  - [ ] `DD3.25` `readWeeklyHistoryForWrite`: round trip; missing → `[]`; corrupt → `[]`; non-array → `[]`; `getItem` rejects → `null` and `log.warn('history.read_failed', {})` once.
  - [ ] `DD3.26` `loadWeeklyHistory` with `getItem` rejecting → `[]`. SC1.10-SC1.15 untouched.
  - [ ] `DD3.27` `wipeAIHistory` with `getItem` rejecting → resolves, no `setItem`.
- [ ] Create `src/hooks/__tests__/useHistoryBackfill.keep-last-good.test.ts` (mock `../../api/client` `getAuthToken`/`apiGet`; AsyncStorage `__mocks__`):
  - [ ] `DD3.28` `getItem('weekly_history_v2')` rejects → `runBackfill(...)` resolves `null`; `getAuthToken`, `apiGet`, `setItem('weekly_history_v2', …)` never called.
  - [ ] `DD3.29` Empty history, `apiGet` resolves slots → the first `setItem('weekly_history_v2', …)` happens (fake timers; advance past the first week's 300 ms pause only as far as needed).
  - [ ] `DD3.31` Static: `useAIData.ts` and `useEarningsHistory.ts` call `readWeeklyHistoryForWrite()` before every `saveWeeklyHistory(` and short-circuit on a falsy result; neither contains `loadWeeklyHistory`. `useHistoryBackfill.ts`'s `runBackfill` uses `readWeeklyHistoryForWrite`.
- [ ] `__tests__/use-ai-data.test.ts`: `DD3.30` Seed `ai_cache` with a previous-week day (`total > 0`); make `getItem` reject only for `'weekly_history_v2'` → no `setItem('weekly_history_v2', …)`, and `get().data` is not null.
- [ ] `src/hooks/__tests__/hooksCredsForwarding.test.ts`: add `readWeeklyHistoryForWrite: jest.fn()` to the `../../lib/weeklyHistory` factory mock, and resolve it `[]` in the `useHistoryBackfill` `beforeEach`. (This test is green before and after the implementation.)

### FR5: The persisted query cache keeps errored queries with data, and never the dev-mock view
- [ ] Create `src/lib/__tests__/queryPersist.test.ts` (real `QueryClient`, `dehydrate`, `hydrate`; `../../store/config` mocked only for `DD3.35`):
  - [ ] `DD3.32` `success` → true; `error` + data → true; `error` without data → false; `pending` → false; `success` with `undefined` → true. Build real query states via `setQueryData`, a rejecting `fetchQuery`, and `queryCache.build`.
  - [ ] `DD3.33` dev-mock `success` / `error` → false; `'79996|prod'` / no `ownerKey` → true; data `[1, 2]`, `5`, `null` → true with no throw.
  - [ ] `DD3.34` Round trip (dev-mock requests + timesheet row + errored team query with data) → no `myRequests` in `state.queries`; after `JSON.parse(JSON.stringify(state))` and `hydrate`, the team query has `status 'error'`, the same data, `fetchStatus 'idle'`.
  - [ ] `DD3.35` The real `buildMyRequestsQueryFn('2026-10-22')()` with `loadConfig` → `{ …, devManagerView: true }` → `ownerKey === DEV_MOCK_OWNER_KEY`, and it is absent after `dehydrate`.
  - [ ] `DD3.36` Static: the constant is `'dev-mock'`; `useMyRequests.ts` contains `DEV_MOCK_OWNER_KEY = 'dev-mock'`; `app/_layout.tsx` contains `dehydrateOptions: { shouldDehydrateQuery }` and the `'@/src/lib/queryPersist'` import; `queryPersist.ts` imports only `@tanstack/react-query`.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run the `red-phase-test-validator` agent.
- [ ] Every FR1-FR5 success criterion (`DD3.1`-`DD3.36`) has a test whose `it(...)` title carries its id.
- [ ] Assertions are specific: call counts, string-equal storage, `toBeInstanceOf`, exact totals. "Doesn't throw" alone is not enough.
- [ ] Mocks return realistic data that matches the interface contracts (`TimesheetResponse`, `PaymentsResponse`, `Payment`, `TagData`, `WeeklySnapshot`, `CrossoverConfig` with `useQA`).
- [ ] Record the red run (failing counts per file) in Session Notes or the `test(FRn)` commit messages.
- [ ] Fix any issues found before proceeding.

---

## Phase 3.1: Implementation

Commit one `feat(FRn): …` per FR.

### FR1: Hours, earnings and the widget keep the last good values
- [ ] `src/api/errors.ts`: add `shouldRetryOnce` with a JSDoc, after `shouldRetryQuery`. Update the file header to mention spec 03.
- [ ] `src/api/timesheet.ts`: `lastError` / `anyResponded`; `throw lastError` when nothing responded; update the header and JSDoc.
- [ ] `src/api/payments.ts`: remove the `try/catch` and the unused `AuthError` import; update the JSDoc.
- [ ] `src/hooks/useTimesheet.ts`, `src/hooks/usePayments.ts`: `retry: shouldRetryOnce` (import from `../api/errors`).
- [ ] No change to `useHoursData.ts`, `useWidgetSync.ts` or `crossoverData.ts` (`git diff --stat` shows none).
- [ ] `npx jest src/__tests__/api/retry-policy.test.ts __tests__/hooks/useHoursData.test.ts __tests__/hooks/useHoursData.keep-last-good.test.ts src/hooks/__tests__/useHoursData.test.ts src/__tests__/lib/crossoverData.test.ts src/__tests__/hooks/useWidgetSync.test.ts src/hooks/__tests__/hooksCredsForwarding.test.ts src/__tests__/api/creds-wiring.test.ts` is green.

### FR2: The AI tab keeps its data on an auth failure
- [ ] `src/hooks/useAIData.ts`: remove `setData(null)` from the `AuthError` branch and replace the comment.
- [ ] `npx jest __tests__/use-ai-data.test.ts src/components/__tests__/AITab.test.tsx` is green.

### FR3: The earnings trend and team totals keep the last good values
- [ ] `src/hooks/usePaymentHistory.ts`: export `buildPaymentHistoryQueryFn`; the hook uses it with `retry: shouldRetryOnce`; update the JSDoc.
- [ ] `src/hooks/useEarningsHistory.ts`: use `buildPaymentHistoryQueryFn` and `retry: shouldRetryOnce`; drop the inline queryFn and the imports it leaves unused.
- [ ] `src/hooks/useTeamAggregateData.ts`: `MemberFetchResult.error`; the all-failed throw (C8); `retry: shouldRetryOnce`; update the header and JSDoc.
- [ ] `npx jest src/hooks/__tests__/usePaymentHistory.test.ts src/hooks/__tests__/useTeamAggregateData.test.ts src/hooks/__tests__/useWeeklyHistory.test.ts src/hooks/__tests__/hooksCredsForwarding.test.ts "app/(tabs)/__tests__/overview.test.tsx" "app/(tabs)/__tests__/index.test.tsx" src/__tests__/api/creds-wiring.test.ts` is green.

### FR4: Weekly history writers never save over an unreadable store
- [ ] `src/lib/weeklyHistory.ts`: `readWeeklyHistoryForWrite` (+ `log.warn('history.read_failed', {})`); `loadWeeklyHistory` delegates; `wipeAIHistory` uses the strict reader.
- [ ] `src/hooks/useAIData.ts`: both flushes use `readWeeklyHistoryForWrite` with a `null` short-circuit; update the import.
- [ ] `src/hooks/useEarningsHistory.ts`: the weekly-history write uses `readWeeklyHistoryForWrite` with a `null` short-circuit.
- [ ] `src/hooks/useHistoryBackfill.ts`: export `runBackfill` (JSDoc with the three outcomes); strict read; return `null` before `getAuthToken`; the hook calls `setSnapshots` only for a non-null result.
- [ ] `npx jest src/lib/__tests__/weeklyHistory.test.ts src/hooks/__tests__/useHistoryBackfill.keep-last-good.test.ts src/hooks/__tests__/useHistoryBackfill.test.ts src/hooks/__tests__/useHistoryBackfillAppBreakdown.test.ts src/hooks/__tests__/useHistoryBackfillRelocation.test.ts src/hooks/__tests__/useWeeklyHistory.test.ts src/hooks/__tests__/useScheduledNotifications.test.ts src/hooks/__tests__/hooksCredsForwarding.test.ts __tests__/use-ai-data.test.ts` is green.

### FR5: The persisted query cache keeps errored queries with data, and never the dev-mock view
- [ ] Create `src/lib/queryPersist.ts` (`DEV_MOCK_OWNER_KEY`, `isDevMockData`, `shouldDehydrateQuery`), with a header comment naming spec 03 and the spec 02 contract.
- [ ] `app/_layout.tsx`: import it and add `dehydrateOptions: { shouldDehydrateQuery }` to `persistOptions`; update the persister comment.
- [ ] `docs/ARCHITECTURE.md` §8.8: a "keep last good" paragraph after the durable-data 02 one (failures throw or skip the write; `shouldRetryOnce`; `readWeeklyHistoryForWrite`; the persist predicate keeps errored-with-data queries and drops the `'dev-mock'` view). In §3.2, add the predicate to the `HOURGLASS_QUERY_CACHE` row. Check: `for t in readWeeklyHistoryForWrite shouldDehydrateQuery shouldRetryOnce; do grep -q "$t" docs/ARCHITECTURE.md || echo "missing $t"; done` prints nothing.
- [ ] `npx jest src/lib/__tests__/queryPersist.test.ts app/__tests__/layout-notifications.test.tsx app/__tests__/root-layout-tokens.test.tsx src/hooks/__tests__/useMyRequests.test.ts` is green.

---

## Phase 3.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run the `spec-implementation-alignment` agent.
- [ ] All FR1-FR5 success criteria are verified in code.
- [ ] Interface contracts match the implementation (`shouldRetryOnce`, `fetchTimesheet`/`fetchPayments` semantics, `buildPaymentHistoryQueryFn`, `readWeeklyHistoryForWrite`, `runBackfill`'s `null`, `shouldDehydrateQuery`, `DEV_MOCK_OWNER_KEY`).
- [ ] No scope creep (Out of Scope items 1-10 untouched; `useHoursData.ts`, `useWidgetSync.ts`, `crossoverData.ts`, `useMyRequests.ts` unchanged) and no shortfall.

### Step 1: Comprehensive PR Review
- [ ] Run the `pr-review-toolkit:review-pr` skill (6 specialized agents) on the spec's diff (`git diff fe38b2e..HEAD`), **locally only**: no PR, no push.

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues.
- [ ] Fix MEDIUM severity issues, or document why they are deferred.
- [ ] Re-run the focused tests after the fixes.
- [ ] Commit the fixes: `fix(03-keep-last-good): {description}`.

### Step 3: Test Quality Optimization
- [ ] Run the `test-optimiser` agent on the new and modified tests.
- [ ] Apply the improvements that strengthen confidence.
- [ ] Re-run the tests to confirm they pass.
- [ ] Commit if anything changed: `fix(03-keep-last-good): strengthen test assertions`.

### Final Verification
- [ ] Focused suite green:
  ```
  npx jest src/__tests__/api/retry-policy.test.ts __tests__/hooks/useHoursData.test.ts \
    __tests__/hooks/useHoursData.keep-last-good.test.ts src/hooks/__tests__/useHoursData.test.ts \
    __tests__/use-ai-data.test.ts src/hooks/__tests__/usePaymentHistory.test.ts \
    src/hooks/__tests__/useTeamAggregateData.test.ts src/lib/__tests__/weeklyHistory.test.ts \
    src/hooks/__tests__/useHistoryBackfill.keep-last-good.test.ts src/hooks/__tests__/useHistoryBackfill.test.ts \
    src/hooks/__tests__/useWeeklyHistory.test.ts src/hooks/__tests__/hooksCredsForwarding.test.ts \
    src/lib/__tests__/queryPersist.test.ts src/__tests__/lib/crossoverData.test.ts \
    src/__tests__/hooks/useWidgetSync.test.ts src/__tests__/api/creds-wiring.test.ts \
    app/__tests__/layout-notifications.test.tsx app/__tests__/root-layout-tokens.test.tsx
  ```
- [ ] Full suite green: `npx jest` (no regressions in existing tests).
- [ ] `npm run typecheck` is clean.
- [ ] `npm run lint` reports 0 errors.
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` prints `56d054fc723984e56892a367dca1efa79a9f8fad`.
- [ ] No changes to `package.json`/`app.json`/native: `git diff --stat fe38b2e..HEAD -- package.json package-lock.json app.json eas.json ios android patches plugins` is empty.
- [ ] Code follows existing patterns (exported `build…QueryFn` for testability; `log.warn` category style; comment density matching neighbours).
- [ ] Update `FEATURE.md`: the changelog row for `03-keep-last-good` (status, commits, test counts), and the "Files Touched" list (`useEarningsHistory.ts`, `src/api/errors.ts` for spec 03). Commit as `docs(03-keep-last-good): update checklist and FEATURE.md`.

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-22**: Spec and checklist written (autonomous). Key deviations from spec-research, all recorded in spec.md C1-C13: the earnings trend is `useEarningsHistory` (not the unused `usePaymentHistory`), so both use `buildPaymentHistoryQueryFn`; a shared `shouldRetryOnce` replaces the inline one-retry lambda; `runBackfill` returns `null` (not `[]`) on an unreadable store; five existing tests change, not two; the `'dev-mock'` contract is pinned by running spec 02's real queryFn.
