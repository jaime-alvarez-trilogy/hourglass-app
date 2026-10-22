# Keep Last Good

**Status:** Draft
**Created:** 2026-10-22
**Last Updated:** 2026-10-22
**Owner:** @jaime-alvarez-trilogy

**Feature:** [durable-data](../../FEATURE.md) · **Research:** [spec-research.md](spec-research.md) · **Builds on:** [01-auth-renewal](../01-auth-renewal/spec.md) (done, `968f1d5..c1b36c2`), [02-requests-store](../02-requests-store/spec.md) (done, `c1b36c2..fe38b2e`) · **Branch:** `feat/sdk-58` (1.2.0) · **Fingerprint:** must stay `56d054fc723984e56892a367dca1efa79a9f8fad`

---

## Overview

Spec 02 stopped My Requests from saving a failed refresh as data. This spec does the same for every other surface: hours, earnings, the home-screen widget, the AI tab, the earnings trend, team totals and the weekly trend history. The rule is simple. **A failure throws, or skips the write.** It never resolves to zeros, `null` or `[]`. TanStack then keeps the last good `data`, and the local caches (`hours_cache`, `ai_cache`, `earnings_history_v1`, `weekly_history_v2`) are never overwritten by a failed refresh. The persisted query cache also keeps errored queries that still hold data, so the last good values survive a restart. It never keeps the manager-preview (`'dev-mock'`) requests view.

**What gets built:**

1. **Hours, earnings and the widget** (`src/api/timesheet.ts`, `src/api/payments.ts`, `src/hooks/useTimesheet.ts`, `src/hooks/usePayments.ts`, `src/api/errors.ts`). `fetchTimesheet` throws the last error when all three strategies **threw**, and returns `null` only when at least one strategy got a response. `fetchPayments` rethrows every error and returns `null` only for an empty result. Both hooks retry through a new `shouldRetryOnce` (one retry, outages only). `useHoursData` needs no code change: its existing `isError` guard (`useHoursData.ts:53-83`) blocks the `hours_cache` write and serves the cache (`:124-133`). `useWidgetSync` pushes what `useHoursData` serves, so the widget keeps the last good hours and earnings.
2. **The AI tab** (`src/hooks/useAIData.ts`). An `AuthError` sets `error: 'auth'` and keeps `data`, as `NetworkError` already does.
3. **The earnings trend and team totals** (`src/hooks/usePaymentHistory.ts`, `src/hooks/useEarningsHistory.ts`, `src/hooks/useTeamAggregateData.ts`). A new exported `buildPaymentHistoryQueryFn` rethrows instead of returning `null`. Both `usePaymentHistory` and `useEarningsHistory` (the hook behind the Home and Overview earnings trend) use it. `buildTeamAggregateQueryFn` throws when the roster is non-empty and every member failed. All three use `shouldRetryOnce`.
4. **Weekly trend history** (`src/lib/weeklyHistory.ts`, plus the writers in `useAIData.ts`, `useEarningsHistory.ts` and `useHistoryBackfill.ts`). A strict `readWeeklyHistoryForWrite()` returns `null` only when `AsyncStorage.getItem` throws. Every writer skips `saveWeeklyHistory` on `null`. `loadWeeklyHistory` and its readers are unchanged.
5. **The persisted query cache** (new `src/lib/queryPersist.ts`, `app/_layout.tsx`). `shouldDehydrateQuery` keeps `success` queries and errored queries that hold data. It drops any query whose data carries `ownerKey: 'dev-mock'`. It is wired as `persistOptions.dehydrateOptions`.

JS-only. No new dependencies, and no changes to `package.json`, `package-lock.json`, `app.json`, `eas.json`, `ios/`, `android/` or `patches/`. Stored formats (`hours_cache`, `ai_cache`, `earnings_history_v1`, `weekly_history_v2`, `widget_data`, `HOURGLASS_QUERY_CACHE`) are unchanged, and there is no `buster`.

---

## Clarification Decisions (Step 3, autonomous)

spec-research.md has no open questions. Checking it against the code at `fe38b2e` (specs 01 and 02 done) raised these points. Each was decided here:

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| C1 | Did spec 02 export a `'dev-mock'` owner-key constant to import? | **No.** `useMyRequests.ts:39` declares a module-private `const DEV_MOCK_OWNER_KEY = 'dev-mock'`, used at `:95` (display rule) and `:139` (the stamp). `src/lib/queryPersist.ts` exports its own `DEV_MOCK_OWNER_KEY = 'dev-mock'`. Spec 02's code is not touched. The contract is pinned **behaviourally**: a test runs the real `buildMyRequestsQueryFn` with `devManagerView: true` and checks that `dehydrate(client, { shouldDehydrateQuery })` drops the result. A static check also pins the literal in both files. | Research Decision 5: no import between the modules, and `queryPersist.ts` stays free of app imports. Running the real queryFn catches a renamed stamp or a changed shape, which a literal-only check would miss. |
| C2 | Research targets `usePaymentHistory` for the "earnings sparkline". Is that the hook the user sees? | **No.** `usePaymentHistory` has no production consumer: it is imported only by tests (`app/(tabs)/__tests__/index.test.tsx:29`, `src/hooks/__tests__/hooksCredsForwarding.test.ts:75`). The Home and Overview earnings trend is `useEarningsHistory` (`app/(tabs)/index.tsx:162`, `app/(tabs)/overview.tsx:242`), and its queryFn swallows errors the same way (`useEarningsHistory.ts:102-120`). **Decision:** extract `buildPaymentHistoryQueryFn(config, from, to)` into `usePaymentHistory.ts` as the research says, and make **both** hooks use it. | The owner's goal names the earnings trend. Fixing only the unused hook would leave the visible trend unfixed. One shared queryFn keeps the two payment-range calls from drifting apart. `hooksCredsForwarding.test.ts` still sees exactly one `apiGet` per queryFn. |
| C3 | Research inlines the one-retry form `(n, e) => n < 1 && isRetryableError(e)` in four hooks. | **Add `export function shouldRetryOnce(failureCount, error)` to `src/api/errors.ts`**, next to `shouldRetryQuery`, and use it at all five call sites (`useTimesheet`, `usePayments`, `usePaymentHistory`/`useEarningsHistory` via their `useQuery`, `useTeamAggregateData`). | Five copies of a lambda drift. `retry-policy.test.ts:46-48` already names this "the one-retry form spec 03 will use". It keeps today's single retry, and never retries a credential failure (`AuthError` other than `AUTH_HTML_500`). |
| C4 | Which existing tests change? Research lists `use-ai-data.test.ts:179-185` and `useTeamAggregateData.test.ts:437-452` only. | **Five existing tests change:** `use-ai-data.test.ts:179-185` (data kept on `AuthError`); `useTeamAggregateData.test.ts:420-436` (both members fail, so the queryFn now rejects; the logging assertions stay); `:453-469` (all fail → rejects); `:496-511` (a one-member roster whose only member fails → rejects; the partial-daily-failure isolation moves to a two-member roster); and `hooksCredsForwarding.test.ts:53-57`, whose `weeklyHistory` factory mock gains `readWeeklyHistoryForWrite`, or `runBackfill` crashes before its first `apiGet`. | Found by grepping every test that factory-mocks `lib/weeklyHistory` and every team-aggregate test where no member succeeds. |
| C5 | Research says the `fetchTimesheet` tests mock `apiGet`. | **They mock `global.fetch`** (`__tests__/hooks/useHoursData.test.ts:56-150`). The new cases follow that pattern: `fetch` rejecting `TypeError` becomes a `NetworkError` in `apiGet`, and `{ ok: false, status: 500, text: async () => '' }` becomes `ApiError(500)`. The new whole-hook test (FR1) mocks `../../src/api/client` instead, because it needs `getAuthToken` too. | It matches the existing file. It also exercises the real `apiGet` error mapping. |
| C6 | What does "a strategy got a response" mean in `fetchTimesheet`? | `apiGet` resolved, whatever the value (research's Function Contracts sketch calls the flag `anyParsed`; this spec names it `anyResponded`, because a resolved non-array body counts as well): a non-empty array returns at once; `[]`, an empty body (`undefined`) or a non-array value sets `anyResponded = true` and falls through. Only a **rejection** counts as a failed strategy. A 200 with a non-JSON body (`parseBody` throws `ApiError`, `client.ts:319-327`) is a failure. | That keeps "genuinely no row" (Monday morning) a truthful zero. It also stops a captive-portal page from becoming 0 h. |
| C7 | What does `runBackfill` return when the strict read fails? Research says `[]`. | **`null`.** `runBackfill` becomes `Promise<WeeklySnapshot[] \| null>` and is exported for tests. On `null` it fetches nothing (no `getAuthToken`, no `apiGet`) and writes nothing. The hook then leaves `snapshots` unchanged (still `null`). | `[]` would claim "the history is empty", which is the bug this spec removes. The hook's return value has no production consumer (`app/(tabs)/_layout.tsx:52` discards it), so `null` is safe. Skipping the fetches also saves 7-56 work-diary calls during a storage fault. |
| C8 | Which error does the team queryFn throw when every member failed? | The error of the **first failed member in roster order**, carried in a new non-exported `MemberFetchResult.error` field. If that value is `undefined` or `null`, throw `new NetworkError('All team member fetches failed')`. | Roster order makes the result deterministic. Rethrowing the real error keeps `AuthError` unretried (`shouldRetryOnce`), and the overview shows `error.message` only when there is no `data` (`overview.tsx:681-688`). |
| C9 | Logging. | One new event: `log.warn('history.read_failed', {})` in `readWeeklyHistoryForWrite` when `getItem` throws. No other new events. | A failed read silently stops every history write, so it needs a trace (the same reasoning as spec 02's `requests.store_read_failed`). The other failures already surface: team members log `teamAggregate.member-fetch-failed` (`useTeamAggregateData.ts:190-194`), and query errors reach the UI. The meta is empty, which passes `src/lib/redact.ts`. |
| C10 | Should the persisted errored query be restored as `'success'` to hide its `{}` error? | **No.** It is restored as stored: `status: 'error'`, the last good `data`, `error: {}`, `fetchStatus: 'idle'` (`hydration.ts:381-404`). | This matches the in-session state after a failed refetch. Consumers already handle it: `useHoursData` serves `hours_cache` on `isError`, `mapTeamAggregateState` renders `data` when present, and `selectMyRequests` maps any truthy error to `'network'`. The query is stale, so it refetches on mount. Rewriting state would hide a real failure. Spec 04 owns the restore-aware Requests UI. |
| C11 | Where does `defaultShouldDehydrateQuery` come from? | `import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query'` (the app's direct dependency, 5.104.5, which re-exports it from query-core). It is referenced only inside the predicate body. | `@tanstack/query-core` is a transitive dependency. `app/__tests__/layout-notifications.test.tsx:110-116` factory-mocks `@tanstack/react-query` without it, which is harmless because the mocked provider never calls the predicate. |
| C12 | FR count. | 5 FRs: hours/earnings/widget, AI tab, earnings trend + team totals, weekly history, persisted cache. | Within the 3-5 guidance. The earnings trend and team totals share one rule ("the queryFn throws on total failure") and one retry change, so they are one FR. |
| C13 | Step 4/6 drafting tool. | The sections were drafted directly by the spec author. This sub-agent has no Agent tool, and the Codex CLI is not installed (`codex` not on `PATH`, no `timeout` binary). The coherence check was run by the author against the checklist in Step 6. | A process deviation, not a content one. It matches spec 02's C14. Drafting from the verified code, not only from spec-research.md, is what surfaced C1-C7. |

---

## Out Of Scope

1. **The background widget path (`fetchFreshData`).** **Descoped.** `src/lib/crossoverData.ts:88-110` already catches both fetchers and falls back to `hours_cache` when the timesheet fails. With FR1 the fetchers reject more often, and that catch handles it unchanged (`src/__tests__/lib/crossoverData.test.ts:298-325` already models rejecting fetchers). The path cannot tell "no row" from "failed" because of its own `.catch(() => null)`. That is pre-existing, and it errs towards keeping the cache.
2. **Background manager approvals carry-forward** (`pendingCount: 0` after two failed fetches). **Descoped from this spec, tracked as follow-up F2** (FEATURE.md Out of Scope).
3. **`useHoursData` mixed freshness** (a stale timesheet with fresh payments shown as live). **Descoped, follow-up F4.** It is cosmetic, not data loss.
4. **Requests screen restore-aware loading and error display after a restart.** **Deferred to [04-requests-history-ui](../04-requests-history-ui/spec-research.md).** This spec only makes the errored-with-data view survive the restart (FR5).
5. **A per-day work-diary store shared by `useAIData` and `useHistoryBackfill`**, which would also fix the case where `ai_cache` is unreadable and its previous-week entries are lost before the week-transition flush (`useAIData.ts:147-154`). **Descoped, follow-up F7.** It is a separate data model.
6. **Read-modify-write races between weekly-history writers** (`useAIData`, `useEarningsHistory` and `useHistoryBackfill` can interleave a load and a save). **Descoped.** It is pre-existing, and it is a lost merge, not a failure saved as data. A serialized writer like spec 02's `writeChain` would be the fix, but nothing in this feature needs it.
7. **Repairing a corrupt `earnings_history_v1`.** **Descoped.** The merge's `.catch` (`useEarningsHistory.ts:144-154`) already skips the write when the read or parse fails, which is keep-last-good. A corrupt blob stays until a later read succeeds.
8. **Deleting the unused `usePaymentHistory` hook.** **Descoped.** It is still mocked by `app/(tabs)/__tests__/index.test.tsx` and listed in `src/hooks/README.md`. This spec hardens it via the shared queryFn (C2), and removing it is a separate cleanup.
9. **A `buster`, or a change to the persister's `maxAge` / `gcTime` / `staleTime`.** **Descoped** (research Decision 5). A buster would wipe every user's cache once.
10. **Making `loadWeeklyHistory` throw.** **Descoped** (research Decision 4). Its readers (`useWeeklyHistory.ts:28,40`, `useScheduledNotifications.ts:105`, `useHistoryBackfill.ts:277`) and SC1.10-SC1.14 keep the never-throws contract.

---

## Functional Requirements

### FR1: Hours, earnings and the widget keep the last good values

A failed timesheet or payments request now makes the query error, instead of resolving `null` (which `calculateHours` turns into 0 h and $0).

**Requirements:**
- `src/api/errors.ts`: add `export function shouldRetryOnce(failureCount: number, error: unknown): boolean`, which returns `failureCount < 1 && isRetryableError(error)`, with a JSDoc in the style of `shouldRetryQuery`. Nothing else changes.
- `fetchTimesheet(config, token, creds?)` (`src/api/timesheet.ts`):
  - Track `let lastError: unknown` and `let anyResponded = false`.
  - For each of the 3 strategies, in order: if `apiGet` resolves to a non-empty array, return its first element. If it resolves to anything else, set `anyResponded = true` and fall through. If it rejects, call `rethrowIfAuth(e)` (an `AuthError` is still rethrown at once), set `lastError = e`, and fall through.
  - After strategy 3: `if (!anyResponded) throw lastError;`, otherwise `return null`.
  - Update the header comment and JSDoc to state the new contract.
- `fetchPayments(config, token, creds?)` (`src/api/payments.ts`): remove the `try/catch`, so every `apiGet` rejection propagates. Return `result[0]` for a non-empty array, otherwise `null`. Update the JSDoc. The now-unused `AuthError` import is removed.
- `useTimesheet` and `usePayments`: `retry: 1` → `retry: shouldRetryOnce`. Nothing else changes.
- `useHoursData.ts`, `useWidgetSync.ts` and `crossoverData.ts`: **no code change.**

**Success Criteria:**
- [ ] `DD3.1` `fetchTimesheet`: all 3 strategies reject `NetworkError` → rejects with that `NetworkError` after exactly 3 `fetch` calls.
- [ ] `DD3.2` `fetchTimesheet`: strategies reject `ApiError(500)`, then `TypeError`-as-`NetworkError`, then `ApiError(503)` → rejects with the **last** error (`ApiError`, `statusCode` 503).
- [ ] `DD3.3` `fetchTimesheet`: strategy 1 rejects `ApiError(500)`, strategies 2 and 3 resolve `[]` → resolves `null`. Strategy 1 and 2 reject, strategy 3 resolves `[row]` → resolves `row`. All three resolve an empty body → `null`.
- [ ] `DD3.4` `fetchTimesheet`: a 401 on strategy 1 → rejects `AuthError` after exactly 1 call (the existing `:133-149` cases still pass).
- [ ] `DD3.5` `fetchPayments`: `NetworkError` → rejects; `ApiError(500)` → rejects; an empty body → `null`; `[]` → `null` (the existing `:252-261` case); `[row]` → `row`.
- [ ] `DD3.6` `shouldRetryOnce`: `(0, NetworkError)` → true; `(1, NetworkError)` → false; `(0, AuthError(401))` → false; `(0, AuthError AUTH_HTML_500)` → true. Through a real `QueryClient`: an outage runs the queryFn twice, a credential failure once.
- [ ] `DD3.7` Static: `useTimesheet.ts` and `usePayments.ts` each contain `retry: shouldRetryOnce` and no `retry: 1`. `useHoursData.ts`'s write guard still contains `!timesheetQuery.isError` and `!paymentsQuery.isError`, and the cache branch still keys on `eitherError && cache`.
- [ ] `DD3.8` Whole hook (new `__tests__/hooks/useHoursData.keep-last-good.test.ts`, real `QueryClient` with `retryDelay: 0`): `hours_cache` is seeded with a non-zero `CachedHours`, and every timesheet strategy and the payments call reject `NetworkError`. After the retries settle: `getItem('hours_cache')` is string-equal to the seeded value; `setItem` was never called with `'hours_cache'`; the hook's `data.total` equals the seeded total (not 0); `isStale === true`; `error === null`.
- [ ] `DD3.9` Whole hook, after a success: the first run succeeds and writes `hours_cache` (row total 20). Then a refetch fails on both queries. `hours_cache` is unchanged after the failed refetch, and `data.total` is still 20.
- [ ] `DD3.10` Whole hook, a genuine empty week: every strategy resolves `[]` and payments resolves `[]` → `hours_cache` is written with `total` 0 (zeros are truthful here).
- [ ] `src/__tests__/lib/crossoverData.test.ts`, `src/__tests__/hooks/useWidgetSync.test.ts` and `src/hooks/__tests__/hooksCredsForwarding.test.ts` pass unchanged.

---

### FR2: The AI tab keeps its data on an auth failure

**Requirements:**
- `useAIData.ts` outer `catch` (`:336-347`): in the `AuthError` branch, remove `setData(null)` and its comment. The branch sets `error: 'auth'` and keeps `data`, like the `NetworkError` branch. Add a one-line comment that `ai_cache` is untouched by an auth failure, and that re-onboarding is handled by `useRoleRefresh`.
- No other change to the catch or to `fetchData`.

**Success Criteria:**
- [ ] `DD3.11` Rewrite `__tests__/use-ai-data.test.ts:179-185`: `ai_cache` is seeded with a current-week day (`total > 0`), and `fetchWorkDiary` rejects `AuthError(401)` → `error === 'auth'`, `data` is not null, and `data.totalSlots` equals the seeded day's total.
- [ ] `DD3.12` The same with `AuthError(403)` → `error === 'auth'`, data kept.
- [ ] `DD3.13` `ai_cache` is unchanged after the auth failure: `getItem('ai_cache')` is string-equal to the seeded value.
- [ ] The `NetworkError` sibling (`:187-194`) and the rest of `use-ai-data.test.ts` pass unchanged.

---

### FR3: The earnings trend and team totals keep the last good values

**Requirements:**
- `src/hooks/usePaymentHistory.ts`: export `buildPaymentHistoryQueryFn(config: CrossoverConfig | null, from: string, to: string): () => Promise<Payment[] | null>`:
  - no `config` → `null`;
  - `loadCredentials()` returns `null` → throw `new Error('No credentials')` (unchanged);
  - `getAuthToken(...)`, then `apiGet<Payment[]>('/api/v3/users/current/payments', { from, to }, token, config.useQA, toAuthCreds(creds, config.useQA))`. `toAuthCreds` stays the **last** argument (the `creds-wiring` scanner);
  - an array → the array; any other resolved value → `null`;
  - **any rejection propagates** (no `try/catch`).
- `usePaymentHistory` uses `queryFn: buildPaymentHistoryQueryFn(config, from, to)` and `retry: shouldRetryOnce`. Update its JSDoc ("falls back to null on error" becomes "keeps the last good data on error").
- `src/hooks/useEarningsHistory.ts`: `queryFn: buildPaymentHistoryQueryFn(config, from, to)` (imported from `./usePaymentHistory`) and `retry: shouldRetryOnce`. Remove the inline queryFn and any imports left unused. The merge effect and the trend logic do not change. A thrown error leaves `payments` as the previous array, so the effect does not re-run and the trend keeps `persistedTrend`.
- `src/hooks/useTeamAggregateData.ts`:
  - `MemberFetchResult` gains `error?: unknown`, set in the member `catch` (`:189-205`). The interface stays non-exported.
  - After the totals loop: if `roster.length > 0 && reportCount === 0`, throw `memberResults.find((r) => r.breakdown.fetchFailed)?.error`, or `new NetworkError('All team member fetches failed')` when that value is `undefined` or `null`.
  - An empty roster still resolves the zero aggregate. A partial failure is unchanged: it resolves, and the failed rows have `fetchFailed: true`.
  - `retry: 1` → `retry: shouldRetryOnce`. Update the header comment and the hook JSDoc.

**Success Criteria:**
- [ ] `DD3.14` `buildPaymentHistoryQueryFn` (new `src/hooks/__tests__/usePaymentHistory.test.ts`): `apiGet` resolves `[p1, p2]` → returns that array; no config → `null` with no `apiGet` call; an empty body (`undefined`) → `null`.
- [ ] `DD3.15` `buildPaymentHistoryQueryFn`: `apiGet` rejects `NetworkError` → rejects `NetworkError`; `AuthError(401)` → rejects `AuthError`; no credentials → rejects `'No credentials'`.
- [ ] `DD3.16` Real `QueryClient` (`retry: false`): `['paymentHistory', …]` holds 3 payments; a refetch whose `apiGet` rejects → `getQueryData` is the same 3-element array, and status is `'error'`.
- [ ] `DD3.17` Static: `usePaymentHistory.ts` and `useEarningsHistory.ts` each contain `buildPaymentHistoryQueryFn(` and `retry: shouldRetryOnce`, and neither contains `retry: 1`. `useEarningsHistory.ts` still contains `earnings_history_v1` and `paidHours` (`useWeeklyHistory.test.ts` SC3.1-SC3.7 pass).
- [ ] `DD3.18` Rewrite `useTeamAggregateData.test.ts:453-469`: both members' diaries reject `Error('all down')` → `await expect(queryFn()).rejects.toThrow('all down')`.
- [ ] `DD3.19` Every member rejects `AuthError(401)` → rejects `toBeInstanceOf(AuthError)`. Every member rejects with `undefined` → rejects `toBeInstanceOf(NetworkError)`.
- [ ] `DD3.20` Roster order: member A rejects `Error('a')` and member B rejects `Error('b')` → rejects `'a'`.
- [ ] `DD3.21` `:420-436` (logging): the queryFn now rejects (`await expect(queryFn()).rejects.toThrow()`), and `log.error` is still called twice, with both `assignmentId`s.
- [ ] `DD3.22` `:496-511` (one daily fetch fails): with a one-member roster → rejects. Add a two-member variant (a good member plus the member whose Tuesday fails) → resolves `reportCount: 1`, and the bad member's row has `fetchFailed: true`.
- [ ] `DD3.23` Real `QueryClient`: `['teamAggregate', …]` holds data with `weekHours` 40; an all-fail refetch → `getQueryData().weekHours === 40`. `mapTeamAggregateState` with that data and the error → `data` non-null, `error` is the message.
- [ ] `DD3.24` Static: `useTeamAggregateData.ts` contains `retry: shouldRetryOnce` and no `retry: 1`.
- [ ] The empty-roster case (`:438-451`), partial isolation (`:368-418`) and `mapTeamAggregateState` (`:574-619`) pass unchanged.

---

### FR4: Weekly history writers never save over an unreadable store

**Requirements:**
- `src/lib/weeklyHistory.ts`:
  - Add `export async function readWeeklyHistoryForWrite(): Promise<WeeklySnapshot[] | null>`. It returns `null` **only** when `AsyncStorage.getItem(WEEKLY_HISTORY_KEY)` rejects, and then logs `log.warn('history.read_failed', {})`. Otherwise it behaves like today's `loadWeeklyHistory`: a missing key, corrupt JSON or a non-array value → `[]`, an array → the array.
  - `loadWeeklyHistory()` becomes `(await readWeeklyHistoryForWrite()) ?? []`. Its never-throws contract and JSDoc stay.
  - `wipeAIHistory()` uses the strict reader and returns without writing on `null`.
- Writers use the strict reader and skip `saveWeeklyHistory` on `null`:
  - `useAIData.ts` week-transition flush (`:180-187`);
  - `useAIData.ts` Monday flush (`:320-331`);
  - `useEarningsHistory.ts` weekly-history write (`:158-173`);
  - `useHistoryBackfill.ts` `runBackfill` (`:145-151`). It is exported (with an "exported for testing" JSDoc) and becomes `Promise<WeeklySnapshot[] | null>`. On `null` it returns `null` before `getAuthToken`, with no fetches and no writes. The JSDoc states the three outcomes: `null` (unreadable), the history unchanged (nothing to fill, or the token failed), or the updated history. The hook calls `setSnapshots` only for a non-null result.
- Readers (`useWeeklyHistory`, `useScheduledNotifications`, the hook's `refreshFromStorage`) keep `loadWeeklyHistory`.
- `src/hooks/__tests__/hooksCredsForwarding.test.ts`'s `lib/weeklyHistory` factory mock gains `readWeeklyHistoryForWrite: jest.fn()`, resolving `[]` in the `useHistoryBackfill` block.

**Success Criteria:**
- [ ] `DD3.25` `readWeeklyHistoryForWrite` (`src/lib/__tests__/weeklyHistory.test.ts`): the round trip returns the array; a missing key → `[]`; corrupt JSON → `[]`; non-array JSON → `[]`; `getItem` rejects → `null`, and `log.warn` is called once with `'history.read_failed'`.
- [ ] `DD3.26` `loadWeeklyHistory` with `getItem` rejecting → `[]`. SC1.10-SC1.15 (`:194-245`) pass unchanged.
- [ ] `DD3.27` `wipeAIHistory` with `getItem` rejecting → resolves, with no `setItem` call.
- [ ] `DD3.28` `runBackfill` (new `src/hooks/__tests__/useHistoryBackfill.keep-last-good.test.ts`, mocked `../../api/client`): `getItem('weekly_history_v2')` rejects → resolves `null`; `getAuthToken`, `apiGet` and `setItem('weekly_history_v2', …)` are never called.
- [ ] `DD3.29` `runBackfill` with an empty history and every `apiGet` resolving a slot list → `saveWeeklyHistory` is called (the happy path still writes). It is enough to advance past the first week and assert the first `setItem('weekly_history_v2', …)`.
- [ ] `DD3.30` `useAIData` week-transition flush (behavioural, `__tests__/use-ai-data.test.ts`): `ai_cache` is seeded with a previous-week day (`total > 0`), and `getItem` rejects only for `'weekly_history_v2'` → no `setItem('weekly_history_v2', …)`, and the hook still returns data.
- [ ] `DD3.31` Static (in `src/hooks/__tests__/useHistoryBackfill.keep-last-good.test.ts`, which reads all three writer sources): in `useAIData.ts` and `useEarningsHistory.ts`, every `saveWeeklyHistory(` call is preceded in its chain by `readWeeklyHistoryForWrite()` and a `null` short-circuit (for example `if (!history) return;`). Neither file calls `loadWeeklyHistory`. `useHistoryBackfill.ts`'s `runBackfill` uses `readWeeklyHistoryForWrite`.
- [ ] `hooksCredsForwarding.test.ts`, `useHistoryBackfill.test.ts`, `useHistoryBackfillAppBreakdown.test.ts`, `useHistoryBackfillRelocation.test.ts`, `useWeeklyHistory.test.ts` and `useScheduledNotifications.test.ts` pass.

---

### FR5: The persisted query cache keeps errored queries with data, and never the dev-mock view

**Requirements:**
- New `src/lib/queryPersist.ts`, with a header comment naming this spec and the spec 02 contract:
  ```ts
  import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

  /** ownerKey of spec 02's manager-preview My Requests view. Must equal useMyRequests.ts's stamp. */
  export const DEV_MOCK_OWNER_KEY = 'dev-mock';

  function isDevMockData(data: unknown): boolean { /* object, non-null, ownerKey === DEV_MOCK_OWNER_KEY */ }

  /** Persist predicate: success, or error that still holds data; never the dev-mock view. */
  export function shouldDehydrateQuery(query: Query): boolean {
    if (isDevMockData(query.state.data)) return false;
    return defaultShouldDehydrateQuery(query)
      || (query.state.status === 'error' && query.state.data !== undefined);
  }
  ```
  The module has no app imports, and nothing is called at module load.
- `app/_layout.tsx`: import `shouldDehydrateQuery` from `@/src/lib/queryPersist`, and pass `persistOptions={{ persister: asyncStoragePersister, maxAge: 1000 * 60 * 60 * 24, dehydrateOptions: { shouldDehydrateQuery } }}`. Update the persister comment (`:79-80`) to say errored-with-data queries are kept and the dev-mock view is not. Nothing else in the file changes.

**Success Criteria:**
- [ ] `DD3.32` `shouldDehydrateQuery` (new `src/lib/__tests__/queryPersist.test.ts`, real `QueryClient`): `success` → true; `error` with data → true; `error` without data → false; `pending` → false; `success` with `data: undefined` → true.
- [ ] `DD3.33` The dev-mock rule: `success` and `error` with `{ entries: [mock], error: null, ownerKey: 'dev-mock' }` → false; `success` with `ownerKey: '79996|prod'`, or with no `ownerKey` → true; `success` with data `[1, 2]`, `5` or `null` → true, and the predicate does not throw.
- [ ] `DD3.34` Round trip: a client holds `['myRequests', '79996']` = the dev-mock view, `['timesheet', '2026-10-19', '2362707']` = a row, and `['teamAggregate', …]` in `'error'` with data. After `dehydrate(client, { shouldDehydrateQuery })`, `state.queries` has the timesheet and team entries and no `myRequests` entry. `hydrate(newClient, JSON.parse(JSON.stringify(state)))` restores the team query with `status: 'error'`, the same `data`, and `fetchStatus: 'idle'`.
- [ ] `DD3.35` Cross-spec contract (behavioural): with `../../store/config` mocked so that `loadConfig` resolves a config with `devManagerView: true`, the real `buildMyRequestsQueryFn('2026-10-22')()` resolves data whose `ownerKey` equals `DEV_MOCK_OWNER_KEY`. Stored with `setQueryData(['myRequests', '79996'], data)`, it is absent after `dehydrate(client, { shouldDehydrateQuery })`.
- [ ] `DD3.36` Static: `DEV_MOCK_OWNER_KEY === 'dev-mock'`; `src/hooks/useMyRequests.ts` contains `DEV_MOCK_OWNER_KEY = 'dev-mock'`; `app/_layout.tsx` contains `dehydrateOptions: { shouldDehydrateQuery }` and imports `shouldDehydrateQuery` from `'@/src/lib/queryPersist'`; `queryPersist.ts` has no import except `@tanstack/react-query`.
- [ ] `app/__tests__/layout-notifications.test.tsx` and `app/__tests__/root-layout-tokens.test.tsx` pass unchanged.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `src/api/errors.ts:93-117` | `isRetryableError`, `shouldRetryQuery`: the model for `shouldRetryOnce` |
| `src/api/client.ts:364-386,252-280,319-327` | `apiGet` maps a `fetch` rejection to `NetworkError`; `handleStatus`; `parseBody` (blank → `undefined`, non-JSON → `ApiError`) |
| `src/hooks/useHoursData.ts:53-133` | The write guard and cache serving that make FR1 need no hook change |
| `src/hooks/useWidgetSync.ts:30-70` | Pushes whatever `useHoursData` / `useAIData` serve |
| `src/lib/crossoverData.ts:85-110` | The background path already tolerates rejecting fetchers |
| `src/hooks/useMyRequests.ts:38-39,82-101,134-140` | Spec 02's private `DEV_MOCK_OWNER_KEY`, its display rule, and the dev-mock stamp |
| `src/hooks/useTeamRoster.ts` | The roster query throws on failure, so the aggregate query is disabled rather than run with `[]` |
| `app/(tabs)/overview.tsx:658-690` | `TeamViewContent` renders `data` when present, whatever `error` is |
| `node_modules/@tanstack/query-core/src/hydration.ts:178-206,219-221,306-410` | `dehydrateQuery` (a promise only when pending), `defaultShouldDehydrateQuery`, hydrate restores error-state queries with `fetchStatus: 'idle'` |
| `__tests__/use-ai-data.test.ts:102-117` | The `setupHook` pattern (react-test-renderer in a real `QueryClientProvider`) for FR1 and FR2 |
| `src/__tests__/api/retry-policy.test.ts:46-48,185-200` | The one-retry table, and `attemptsUntilGiveUp` through a real `QueryClient` |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/api/errors.ts` | modify | `shouldRetryOnce` (FR1) |
| `src/api/timesheet.ts` | modify | Throw the last error when every strategy threw (FR1) |
| `src/api/payments.ts` | modify | Rethrow every error; `null` only for an empty result (FR1) |
| `src/hooks/useTimesheet.ts`, `src/hooks/usePayments.ts` | modify | `retry: shouldRetryOnce` (FR1) |
| `src/hooks/useAIData.ts` | modify | Keep `data` on `AuthError` (FR2); strict reads in both history flushes (FR4) |
| `src/hooks/usePaymentHistory.ts` | modify | Export `buildPaymentHistoryQueryFn`, rethrow, `shouldRetryOnce` (FR3) |
| `src/hooks/useEarningsHistory.ts` | modify | Use `buildPaymentHistoryQueryFn` and `shouldRetryOnce` (FR3); strict read before the weekly-history write (FR4) |
| `src/hooks/useTeamAggregateData.ts` | modify | Throw when every member failed; `shouldRetryOnce` (FR3) |
| `src/lib/weeklyHistory.ts` | modify | `readWeeklyHistoryForWrite` + `history.read_failed`; `loadWeeklyHistory` delegates; `wipeAIHistory` uses the strict reader (FR4) |
| `src/hooks/useHistoryBackfill.ts` | modify | Export `runBackfill`; strict read, `null` short-circuit (FR4) |
| `src/lib/queryPersist.ts` | create | `DEV_MOCK_OWNER_KEY`, `shouldDehydrateQuery` (FR5) |
| `app/_layout.tsx` | modify | `dehydrateOptions: { shouldDehydrateQuery }` (FR5) |
| `src/__tests__/api/retry-policy.test.ts` | modify | `DD3.6` |
| `__tests__/hooks/useHoursData.test.ts` | modify | `DD3.1`-`DD3.5` |
| `__tests__/hooks/useHoursData.keep-last-good.test.ts` | create | `DD3.8`-`DD3.10` |
| `src/hooks/__tests__/useHoursData.test.ts` | modify | `DD3.7` (static) |
| `__tests__/use-ai-data.test.ts` | modify | `DD3.11`-`DD3.13`, `DD3.30` |
| `src/hooks/__tests__/usePaymentHistory.test.ts` | create | `DD3.14`-`DD3.17` |
| `src/hooks/__tests__/useTeamAggregateData.test.ts` | modify | `DD3.18`-`DD3.24` |
| `src/lib/__tests__/weeklyHistory.test.ts` | modify | `DD3.25`-`DD3.27` |
| `src/hooks/__tests__/useHistoryBackfill.keep-last-good.test.ts` | create | `DD3.28`, `DD3.29`, and `DD3.31`. `DD3.31` is one static guard over all three FR4 writer hooks (`useAIData.ts`, `useEarningsHistory.ts`, `useHistoryBackfill.ts`), so it lives in this new FR4 file rather than being split across `use-ai-data.test.ts` and a new `useEarningsHistory` test file (the same pattern as `DD3.17`, which checks `useEarningsHistory.ts` from `usePaymentHistory.test.ts`) |
| `src/hooks/__tests__/hooksCredsForwarding.test.ts` | modify | Add `readWeeklyHistoryForWrite` to the factory mock |
| `src/lib/__tests__/queryPersist.test.ts` | create | `DD3.32`-`DD3.36` |
| `docs/ARCHITECTURE.md` | modify | §8.8: a "keep last good" paragraph (failures throw or skip the write; `shouldRetryOnce`; `readWeeklyHistoryForWrite`; the persist predicate keeps errored-with-data queries and drops the `'dev-mock'` view). §3.2: add the persist predicate to the `HOURGLASS_QUERY_CACHE` row |

### Data Flow

```
Refresh (focus / mount / pull-to-refresh)
  useTimesheet / usePayments ──► fetchTimesheet / fetchPayments
      any strategy responded  → resolve row | null   → useHoursData writes hours_cache (truthful)
      every strategy threw    → reject (retry once if retryable)
                                 → TanStack: status 'error', data = last good
                                 → useHoursData: write guard blocked; serves live-from-last-good or hours_cache
                                 → useWidgetSync pushes the same last good HoursData to widget_data

  useAIData.fetchData ──► ai_cache → instant data → fetchWorkDiary
      AuthError / NetworkError / other → setError(kind); data kept (ai_cache untouched)

  useEarningsHistory / usePaymentHistory ──► buildPaymentHistoryQueryFn
      reject → TanStack keeps the last Payment[] → trend keeps persistedTrend / earnings_history_v1

  useTeamAggregateData ──► buildTeamAggregateQueryFn
      roster non-empty and every member failed → throw first member error → data kept, error surfaced

Weekly history writers (useAIData flushes, useEarningsHistory, runBackfill, wipeAIHistory)
  readWeeklyHistoryForWrite()
      getItem threw → null → log history.read_failed → skip save (and, in runBackfill, skip fetching)
      otherwise     → [] | snapshots → merge → saveWeeklyHistory

Persist (PersistQueryClientProvider, HOURGLASS_QUERY_CACHE)
  dehydrate(client, { shouldDehydrateQuery })
      data.ownerKey === 'dev-mock'        → dropped
      success | (error && data defined)  → kept
  restart → hydrate → status as stored, fetchStatus 'idle' → stale → refetch on mount
```

### Edge Cases

| Case | Handling |
|------|----------|
| Monday morning, no timesheet row yet | A strategy responds `[]` → `null` → `hours_cache` gets truthful zeros (`DD3.10`). |
| Strategy 1 returns 500, strategy 3 returns `[]` | `anyResponded` → `null`, which preserves the fallthrough semantics (`DD3.3`). |
| A captive-portal 200 HTML page on every strategy | `parseBody` throws `ApiError` → all threw → reject → last good kept. |
| Timesheet fails, payments succeed | No write (`useHoursData.ts:58-59`). The live view uses the retained timesheet `data`, or `hours_cache` if there is none. Mixed freshness is F4. |
| First launch, offline, no cache | The error state shows, as today (`useHoursData.ts:163-191`). |
| A real 401/403 on the AI tab | `error: 'auth'`, data kept. Re-onboarding is unchanged (`useRoleRefresh`, `useAuth.ts:72`). |
| Empty team roster | Resolves zeros with no error (the existing `:438-451` case passes unchanged; FR3 criteria). |
| Every team member fails with mixed errors | The first failed member in roster order decides the thrown error (`DD3.20`). |
| `weekly_history_v2` holds corrupt JSON | The strict reader returns `[]` and writers overwrite it. Corrupt data is already lost (research Decision 4). |
| `getItem` throws transiently for `weekly_history_v2` | Writers skip; `runBackfill` makes no API calls; readers still get `[]` for this render and re-read on the next history event. |
| An errored-with-data query restored after a restart | `status: 'error'`, `error: {}`, data intact, idle, refetches on mount (C10). |
| The manager preview was on when the app was killed | The dev-mock requests view is not persisted. On the next start, `useMyRequests` runs its queryFn again (mock view if the toggle is still on, the real view otherwise). |
| A dev-mock-shaped stamp on a non-requests query | Dropped as well. The check is on the data shape, which is spec 02's contract. |
| Non-object query data (`null`, arrays, numbers) | `isDevMockData` returns false and the default rule applies (`DD3.33`). |

---

## Dependencies

### Internal
- Spec 01: `isRetryableError`, `AuthError`, `NetworkError`, `ApiError`, `AUTH_HTML_500` (`src/api/errors.ts`); `apiGet`, `getAuthToken` (`src/api/client.ts`); `toAuthCreds` (`src/api/authCreds.ts`); the `creds-wiring` scanner, which requires `toAuthCreds(...)` to stay the last `apiGet` argument.
- Spec 02: the `ownerKey: 'dev-mock'` stamp from `buildMyRequestsQueryFn` (`useMyRequests.ts:139`), and its display rule. My Requests' own throw-on-failure is what FR5 persists.
- `src/lib/log.ts` (`log.warn`) and `src/lib/redact.ts`.

### External
- `@tanstack/react-query` 5.104.5: `defaultShouldDehydrateQuery`, `Query`, `dehydrate`/`hydrate` (tests).
- `@tanstack/react-query-persist-client` 5.104.5: `persistOptions.dehydrateOptions` (`query-persist-client-core/src/persist.ts:90,173-178`).
- No new packages.

### Assumptions
- TanStack v5 keeps the previous `data` when a refetch rejects (`query.ts` error reducer), which is the mechanism every FR relies on.
- `fetchTimesheet` and `fetchPayments` have no callers besides `useTimesheet`, `usePayments` and `fetchFreshData` (verified by grep), so the stricter rejection reaches only those three.
- `usePaymentHistory` has no production consumer (verified by grep). Hardening it is for consistency, not a visible change.
