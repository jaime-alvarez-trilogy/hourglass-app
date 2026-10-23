# Spec Research: Keep Last Good

**Date:** 2026-10-22
**Author:** @jaime-alvarez-trilogy
**Spec:** `03-keep-last-good`

---

## Problem Context

The owner's rule is that a failed refresh must never replace or wipe stored data. My Requests is spec 02. Every other surface has the same "failure saved as data" pattern (diagnosis §2, last-good explorer):

| Surface | Mechanism | Effect |
|---|---|---|
| Hours / earnings / home-screen widget | `fetchTimesheet` swallows non-auth errors and returns `null` (`src/api/timesheet.ts:38-70`); so does `fetchPayments` (`src/api/payments.ts:50-63`). `null !== undefined` passes `useHoursData`'s write guard (`src/hooks/useHoursData.ts:54-76`). `calculateHours(null)` is all zeros (`src/lib/hours.ts:234-248`). | A blip on wake writes 0 h / $0 to `hours_cache` and pushes it to the widget through `useWidgetSync` (`src/hooks/useWidgetSync.ts:40-62`) |
| AI / BrainLift tab | `setData(null)` on `AuthError` (`src/hooks/useAIData.ts:338-340`); refetch on every `active` transition (`:375-383`) | The tab blanks whenever the token is bad |
| Earnings sparkline | `usePaymentHistory` catches and returns `null` (`src/hooks/usePaymentHistory.ts:71-82`) | Goes flat after one failure |
| Team totals (managers) | Every member fails, and the result still resolves as an all-zero success (`src/hooks/useTeamAggregateData.ts:206-229`) | Totals drop to 0 |
| Weekly trend history | `loadWeeklyHistory` returns `[]` on a read error (`src/lib/weeklyHistory.ts:114-124`). The writers then save over it: `useAIData.ts:180-187,320-327`, `useEarningsHistory.ts:156-168`, `useHistoryBackfill.ts:150,224` | Up to 24 weeks overwritten by one week |
| Persisted cache across restarts | The default dehydrate keeps only `status === 'success'` (`node_modules/@tanstack/query-core/src/hydration.ts:219-221`); there is no `dehydrateOptions` (`app/_layout.tsx:171-176`) | Once failures throw (this spec, spec 02), errored-but-holding-data queries would be **dropped** from the next snapshot (synthesis §3, `app/_layout.tsx` item) |

Scope: make each of these throw (or skip the write) on failure, so TanStack or the local cache keeps the last good value. Also persist errored queries that still hold data.

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| Background path keeps the last good hours | `src/lib/crossoverData.ts:85-109` (`.catch(() => null)`, then `hours_cache` fallback) | Already assumes `fetchTimesheet`/`fetchPayments` can reject, so hardening them is compatible (`src/__tests__/lib/crossoverData.test.ts:298-320` already mocks rejections) |
| Cache served on error | `useHoursData` `eitherError && cache` (`:124-133`), stale cache (`:140-149`) | Correct once `isError` is real. Locked by `src/hooks/__tests__/useHoursData.test.ts` SC1.1-SC2.4 |
| Keep data on non-auth errors | `useAIData` NetworkError / unknown branches (`:341-346`) | The target behaviour for AuthError too |
| Error with data still renders | `overview.tsx` `TeamViewContent` renders `data` when non-null regardless of `error` (`app/(tabs)/overview.tsx:659-690`) | So throwing keeps team totals visible |
| Skip the write when the read failed | `useEarningsHistory` `earnings_history_v1` merge `.catch` (`:142-152`) | The template for weekly-history writers |
| Testable factored queryFn | `buildTeamAggregateQueryFn`, `buildMyRequestsQueryFn` | Use it for `usePaymentHistory` (`buildPaymentHistoryQueryFn`) |

### Key Files

| File | Relevance |
|------|-----------|
| `src/api/timesheet.ts:15-71` | 3-strategy fallback; `rethrowIfAuth` |
| `src/api/payments.ts:44-64` | Single call; swallows non-auth |
| `src/hooks/useTimesheet.ts:20-36`, `src/hooks/usePayments.ts:19-35` | Thin `useQuery` wrappers, `retry: 1` |
| `src/hooks/useHoursData.ts:54-89,124-149` | Write guard and cache serving |
| `src/hooks/useAIData.ts:133-351,375-383` | Fetch and catch branches |
| `src/hooks/usePaymentHistory.ts:54-93` | Inline queryFn |
| `src/hooks/useTeamAggregateData.ts:134-230,252-289` | QueryFn, `mapTeamAggregateState` |
| `src/lib/weeklyHistory.ts:107-164` | `loadWeeklyHistory`, `saveWeeklyHistory`, listeners |
| `app/_layout.tsx:69-84,171-176` | QueryClient and persister |
| `node_modules/@tanstack/query-core/src/hydration.ts:195-197,219-221,366-371,396` | Pending-only promise dehydration; default predicate; hydrate handles error-state queries; restored fetchStatus idle (critique amendment 7) |

### Integration Points

- Spec 01's `isRetryableError` is used in `retry` for `useTimesheet`, `usePayments`, `usePaymentHistory` and `useTeamAggregateData`, as `retry: (n, e) => n < 1 && isRetryableError(e)`. That is one retry, the same as their `retry: 1` today. Spec 01's `shouldRetryQuery` is not used here, because it allows two retries (it is spec 02's).
- `useWidgetSync` is unchanged: it pushes whatever `useHoursData` serves, which is now the last good value on error (last-good explorer §11).
- `HOURGLASS_QUERY_CACHE` persistence (`app/_layout.tsx:81-84`) is already in `clearAll()` (`src/store/config.ts:93`).
- **Cross-spec contract with spec 02:** a query whose `data.ownerKey === 'dev-mock'` (the manager-preview My Requests view) is never persisted (Decision 5). Spec 02 relies on this, together with its own display rule (shown only while `config.devManagerView` is true).

---

## Key Decisions

### Decision 1: "No row" vs "request failed" in timesheet and payments

**Options considered:**
1. Make `useHoursData` detect a failure some other way. It cannot: the information is lost at the API layer.
2. **`fetchTimesheet`: if every one of the 3 strategies *threw* a non-auth error, re-throw the last one. If at least one returned a parseable response (even `[]` or an empty body), return `null` as today. `fetchPayments`: re-throw any caught error, and return `null` only for a genuinely empty result (`[]` or an empty body, `parseBody` → `undefined`).**

**Chosen:** Option 2.

**Rationale:**
- A genuine "no timesheet row yet" (Monday morning) must still be zero; that is truthful.
- Strategy 1 failing with a 500 while strategy 3 returns `[]` is still a real empty response, which preserves the fallthrough tests (`__tests__/hooks/useHoursData.test.ts:73-106`).
- `useHoursData` needs **no code change**: `isError` blocks the write (`:58-59`) and serves the cache (`:124`).

### Decision 2: AI tab on `AuthError`

**Chosen:** remove `setData(null)` (`useAIData.ts:340`). `AuthError` sets `error: 'auth'` and keeps `data`, like `NetworkError`.

**Rationale:** The on-disk `ai_cache` is untouched by an auth failure, so the "cached data is likely wrong too" comment is false. The auth state is still shown through `error`.

**Rejected:** clearing only on 403. A 403 for the user's own data means a role change, and that is handled by re-onboarding (`useRoleRefresh`), not by blanking the tab.

### Decision 3: Payment history and team totals

**Chosen:**
- **Payment history:** extract `buildPaymentHistoryQueryFn(config, from, to)` (exported) that re-throws instead of returning `null` (`usePaymentHistory.ts:79-81`); `retry: (n, e) => n < 1 && isRetryableError(e)`.
- **Team totals:** in `buildTeamAggregateQueryFn`, when `roster.length > 0 && reportCount === 0`, throw the first member error. Each member result keeps `error` in a non-exported field; if there is no error instance, throw `new NetworkError('All team member fetches failed')`. An empty roster still resolves to zeros. Partial failure is unchanged.

**Rationale:** TanStack keeps the prior `data` on error (`query.ts:977-991`). `mapTeamAggregateState` passes data and error through (`useTeamAggregateData.ts:252-261`), and the overview renders data when present.

### Decision 4: Weekly history read failure vs empty

**Options considered:**
1. Make `loadWeeklyHistory` throw. That breaks the readers (`useWeeklyHistory.ts:28,40`, `useScheduledNotifications.ts:105`, `useHistoryBackfill.ts:272`) and the pinned tests SC1.12/SC1.14 (`src/lib/__tests__/weeklyHistory.test.ts:213-218,235-240`).
2. **Add `readWeeklyHistoryForWrite(): Promise<WeeklySnapshot[] | null>`. It returns `null` only when `AsyncStorage.getItem` throws (transient I/O), and otherwise behaves like `loadWeeklyHistory` (missing, corrupt or non-array → `[]`). `loadWeeklyHistory` becomes `(await readWeeklyHistoryForWrite()) ?? []`. All 4 writers use the strict reader and skip `saveWeeklyHistory` on `null`.**

**Chosen:** Option 2.

**Rationale:**
- Corrupt JSON is already lost data, so overwriting it is correct. A transient read error is not, so skipping is correct.
- Readers and all existing SC1 tests are unchanged.
- `wipeAIHistory` (dev-only, `weeklyHistory.ts:132-136`) also switches to the strict reader for consistency.

### Decision 5: Persist errored queries that hold data

**Chosen:** a new `src/lib/queryPersist.ts`:

```ts
export const DEV_MOCK_OWNER_KEY = 'dev-mock'; // must equal spec 02's devManagerView stamp

function isDevMockData(data: unknown): boolean {
  return typeof data === 'object' && data !== null
    && (data as { ownerKey?: unknown }).ownerKey === DEV_MOCK_OWNER_KEY;
}

export function shouldDehydrateQuery(q) {
  if (isDevMockData(q.state.data)) return false; // cross-spec contract with spec 02
  return defaultShouldDehydrateQuery(q) || (q.state.status === 'error' && q.state.data !== undefined);
}
```

Wired as `persistOptions.dehydrateOptions = { shouldDehydrateQuery }` at `app/_layout.tsx:173`.

**Cross-spec contract (spec 02): the manager-preview view is never persisted.**
- Spec 02's queryFn stamps the `devManagerView` result `ownerKey: 'dev-mock'`, and its hook shows that view only while `config.devManagerView` is true (spec 02 Decision 4).
- Without the first line, this predicate would persist it like any other successful query: the default keeps every `status === 'success'` query (`hydration.ts:219-221`).
- The check is on the data shape, not the query key, so it holds for any query that carries the stamp. `isDevMockData` tolerates non-object data (arrays, numbers, `null`), because other queries store such data.
- The two specs share the literal `'dev-mock'`; spec 02 lands first and stamps it in `useMyRequests.ts`. No import is added between the modules: `queryPersist.ts` stays free of app imports (see the test-mock note below). A static test pins that both files use the same literal, so they cannot drift apart silently.

**Rationale:**
- Without this, the throw-on-failure fixes (here and in spec 02) would drop data from the snapshot after a restart.
- Hydrating error-state queries is supported (`hydration.ts:366-371`). Only `pending` queries carry promises (`:195-197`). Restored queries come back idle and refetch on mount.
- The serialized `Error` becomes `{}`, which is harmless (synthesis risk "persisted error state"). The predicate lives in its own module so it can be tested without mounting the provider.

**Rejected:** a `buster` (it would wipe every user's cache once, for no benefit).

**Test-mock note:** `app/__tests__/layout-notifications.test.tsx:110-116` mocks `@tanstack/react-query` with only `QueryClient`, `QueryClientProvider` and `focusManager`. It also mocks `PersistQueryClientProvider` (`:119-124`).
- `queryPersist.ts` must therefore only *reference* `defaultShouldDehydrateQuery` inside the predicate body, and never call it at module load. The predicate is never invoked under that mock, so the layout tests keep passing unchanged.
- An alternative is to import `defaultShouldDehydrateQuery` from `@tanstack/query-core`, which is not mocked there. Either works; keep the import at the top of `queryPersist.ts` and verify by running `app/__tests__/layout-notifications.test.tsx` and `app/__tests__/root-layout-tokens.test.tsx`.

---

## Interface Contracts

### Types

```typescript
// No new persisted types. Changed return semantics only:

// src/api/timesheet.ts
// fetchTimesheet(config: CrossoverConfig, token: string, creds?: AuthCreds): Promise<TimesheetResponse | null>
//   resolves TimesheetResponse  — source: first non-empty GET /api/timetracking/timesheets array element
//   resolves null               — source: at least one strategy returned a parseable empty response
//   rejects AuthError           — unchanged (rethrowIfAuth)
//   rejects <last error>        — NEW: all 3 strategies threw (NetworkError / ApiError / other)

// src/api/payments.ts
// fetchPayments(config, token, creds?): Promise<PaymentsResponse | null>
//   resolves PaymentsResponse   — source: GET /api/v3/users/current/payments result[0]
//   resolves null               — source: [] or empty body (parseBody → undefined)
//   rejects any error           — NEW (previously only AuthError)

// src/hooks/useTeamAggregateData.ts (internal, not exported) — existing type at :122-125
interface MemberFetchResult {
  breakdown: TeamMemberBreakdown;  // existing
  cache: Record<string, TagData> | null; // existing
  error?: unknown;                 // NEW: the caught error (source: fetchWorkDiary / fetchReportTimesheet rejection), only when fetchFailed
}

// src/lib/queryPersist.ts
import type { Query } from '@tanstack/react-query';
export const DEV_MOCK_OWNER_KEY = 'dev-mock';   // the same literal as spec 02's MyRequestsData.ownerKey stamp for devManagerView (pinned by a static test)
export function shouldDehydrateQuery(query: Query): boolean;
//   input fields: query.state.status ('pending'|'error'|'success'), query.state.data — TanStack state (query-core/src/query.ts)
//   query.state.data.ownerKey — source: spec 02's MyRequestsData.ownerKey ('dev-mock' → never persisted)
```

### Function Contracts

| Function | Signature | Responsibility | Dependencies |
|----------|-----------|----------------|--------------|
| `fetchTimesheet` | `(config, token, creds?) => Promise<TimesheetResponse \| null>` | Decision 1. Tracks `let lastError: unknown; let anyParsed = false`. | `apiGet` |
| `fetchPayments` | `(config, token, creds?) => Promise<PaymentsResponse \| null>` | Decision 1 | `apiGet` |
| `useTimesheet` / `usePayments` | unchanged | `retry: (n, e) => n < 1 && isRetryableError(e)` (keeps today's single retry; never retries an `AuthError` other than `AUTH_HTML_500`) | `isRetryableError` |
| `useAIData` catch | — | `AuthError` → `setError('auth')` and keep `data` | — |
| `buildPaymentHistoryQueryFn` | `(config: CrossoverConfig \| null, from: string, to: string) => () => Promise<Payment[] \| null>` | `null` if no config; throws `Error('No credentials')` (unchanged); returns the array; **rethrows** fetch errors; non-array → `null` | `loadCredentials`, `getAuthToken`, `apiGet` |
| `buildTeamAggregateQueryFn` | unchanged signature | Throws when `roster.length > 0 && reportCount === 0` | — |
| `readWeeklyHistoryForWrite` | `() => Promise<WeeklySnapshot[] \| null>` | `null` iff `getItem` threw | `AsyncStorage` |
| `loadWeeklyHistory` | unchanged `() => Promise<WeeklySnapshot[]>` | `(await readWeeklyHistoryForWrite()) ?? []` | — |
| writers | — | `useAIData.ts:180,320`, `useEarningsHistory.ts:156`, `useHistoryBackfill.ts:150` (`runBackfill` returns `[]` and writes nothing on `null`), `weeklyHistory.ts:133`: skip the save on `null` | `readWeeklyHistoryForWrite` |
| `shouldDehydrateQuery` | `(query: Query) => boolean` | Decision 5: `false` if `data.ownerKey === 'dev-mock'` (spec 02 contract); otherwise the default (success) or error-with-data | `defaultShouldDehydrateQuery`, `DEV_MOCK_OWNER_KEY` |

---

## Test Plan

### `fetchTimesheet` (`__tests__/hooks/useHoursData.test.ts`, extend)

**Happy Path:** strategy 1 non-empty returns row 1 (existing); fallthrough to 2 or 3 on `[]` (existing `:73-106`).

**Edge Cases:**
- Strategy 1 throws `ApiError(500)`, strategy 2 returns `[]`, strategy 3 returns `[]` → resolves `null`.
- Strategy 1 throws, 2 throws, 3 returns `[row]` → returns the row.
- All three return an empty body (`undefined`) → `null`.

**Error Cases:**
- All three throw `NetworkError` → **rejects** with the `NetworkError`, after 3 calls.
- All three throw a mix (`ApiError`, `TypeError`, `NetworkError`) → rejects with the last.
- `AuthError` on strategy 1 → rejects immediately after 1 call (existing `:133-149`).

**Mocks Needed:** `../src/api/client` `apiGet` (the existing pattern in that file).

### `fetchPayments` (same file)

**Happy Path:** `[row]` → row.

**Edge Cases:** `[]` → `null` (existing `:252-261`); empty body → `null`.

**Error Cases:** `NetworkError` → rejects (new); `ApiError(500)` → rejects (new); 401/403 → rejects (existing `:223-239`).

### `useHoursData` keeps last good (`__tests__/hooks/useHoursData.test.ts`, new describe)

`src/hooks/__tests__/useHoursData.test.ts` is static-analysis only (`:37-124`). But the repo already renders hooks with `react-test-renderer` inside a real `QueryClientProvider` (`__tests__/use-ai-data.test.ts:102-114`, `setupHook`). Use that pattern for a real behavioural proof. The proof has three parts:

1. **Static** (add to `src/hooks/__tests__/useHoursData.test.ts`): the write effect's guard still contains both `!timesheetQuery.isError` and `!paymentsQuery.isError`, and the cache-serving branch still keys on `eitherError && cache`.
2. **Behavioural, at the query level** (new describe in `__tests__/hooks/useHoursData.test.ts`): a real `QueryClient` runs the `useTimesheet` queryFn (`fetchTimesheet` with every strategy rejecting `NetworkError`). The result is `getQueryState(['timesheet', …]).status === 'error'`, and prior `data` is retained when it was seeded.
3. **Behavioural, the whole hook** (new file `__tests__/hooks/useHoursData.keep-last-good.test.ts`, using the `setupHook` pattern):
   - seed `hours_cache` with a non-zero `CachedHours` and capture the raw string;
   - mock `apiGet` so every timesheet strategy and the payments call reject with `NetworkError`;
   - render `useHoursData`, then flush the retries (`retry` is a function, so use `retryDelay: 0` via the test `QueryClient` defaults).
   - Assert:
     - `getItem('hours_cache')` still equals the captured string **byte for byte**;
     - `setItem` was never called with `'hours_cache'`;
     - the hook's `data.total` equals the cached value, not 0;
     - `isStale === true`.

**Happy Path:** both resolve → `fetchTimesheet` returns the row, so the guard permits the write (static), and in part 3 a success run does write `hours_cache`.

**Error Cases:** all strategies reject → the query status is `'error'`, a seeded prior row is retained, and `hours_cache` is byte-identical (part 3).

**Mocks Needed:** `../src/api/client` (`apiGet`, `getAuthToken`), `../src/store/config` (`loadConfig`, `loadCredentials`), and the AsyncStorage `__mocks__` with `_reset()`.

### `useAIData` (`__tests__/use-ai-data.test.ts`, modify)

**Happy Path:** unchanged.

**Error Cases:** **Rewrite `:179-185`.** `fetchWorkDiary` rejects with `AuthError(401)` → `error === 'auth'` and `data` is **not null** (seed `ai_cache` so prior data exists, mirroring the `NetworkError` sibling at `:187-194`).

**Mocks Needed:** the existing mocks in that file.

### `buildPaymentHistoryQueryFn` (`src/hooks/__tests__/usePaymentHistory.test.ts`, new)

**Happy Path:** `apiGet` resolves `[p1, p2]` → returns the array.

**Edge Cases:** no config → `null`; non-array (empty body) → `null`.

**Error Cases:**
- `NetworkError` → rejects.
- No credentials → rejects with `Error('No credentials')`.
- QueryClient level: 3 cached payments, then a rejecting refetch → `getQueryData` unchanged.

**Mocks Needed:** `../../store/config`, `../../api/client`.

### `buildTeamAggregateQueryFn` (`src/hooks/__tests__/useTeamAggregateData.test.ts`, modify)

**Rewrite `:437-452`:** every report fails → `await expect(queryFn()).rejects.toThrow('all down')` (the first member error is rethrown).

**Unchanged:** `:422-435` (empty roster → zeros, no error); `:352-421` (partial isolation); `mapTeamAggregateState` `:557-601`.

**New:** every report fails with `AuthError` → rejects with `AuthError`.

### `readWeeklyHistoryForWrite` and writers (`src/lib/__tests__/weeklyHistory.test.ts`, extend)

**Happy Path:** round trip returns the array.

**Edge Cases:** missing key → `[]`; corrupt JSON → `[]`; non-array → `[]`.

**Error Cases:** `getItem` throws → `null`; `loadWeeklyHistory` still returns `[]` (SC1.14 unchanged).

**Writers:**
- `useHistoryBackfill`'s `runBackfill`: with `getItem` throwing, `saveWeeklyHistory`/`setItem` is never called for `weekly_history_v2`. Test through the exported runner if it is exported; otherwise export `runBackfill` as `__runBackfillForTests`.
- `useAIData` week-transition flush: static check that `readWeeklyHistoryForWrite` is used and `null` short-circuits.
- `useEarningsHistory`: static check, the same.

**Unchanged and must pass:** SC1.10-SC1.14 (`:194-240`).

### `shouldDehydrateQuery` (`src/lib/__tests__/queryPersist.test.ts`, new)

**Happy Path:** `success` → true; `error` with data → true.

**Edge Cases:** `error` without data → false; `pending` → false; `success` with `data: undefined` → true (the default behaviour).

**Dev-mock contract (spec 02):**
- `success` with `data = { entries: [mock], error: null, ownerKey: 'dev-mock' }` → **false**;
- `error` with that same data → false;
- `success` with `ownerKey: '79996|prod'`, or with no `ownerKey` (a legacy blob) → true;
- `success` with non-object data (`[1, 2]`, `5`, `null`) → true (no throw).
- Round trip: a client holding `['myRequests','79996']` = the dev-mock view and `['timesheet', …]` = a row. After `dehydrate` there is no `myRequests` entry in `state.queries`, and the timesheet entry is present.
- Static cross-check: `DEV_MOCK_OWNER_KEY === 'dev-mock'`, and the source of `src/hooks/useMyRequests.ts` (spec 02) contains `ownerKey: 'dev-mock'`.

**Error Cases:** a round trip through `dehydrate(client, {shouldDehydrateQuery})` + `hydrate(newClient, state)` keeps an errored query's data, and the restored `fetchStatus` is `'idle'`.

**Static:** `app/_layout.tsx` source contains `dehydrateOptions` and imports `shouldDehydrateQuery` from `@/src/lib/queryPersist`.

**Mocks Needed:** none (real `QueryClient`, `dehydrate`, `hydrate`).

### Existing tests that change (and how)

| Test | Change |
|------|--------|
| `__tests__/use-ai-data.test.ts:179-185` | `expect(get().data).toBeNull()` → not null (encodes the bug) |
| `src/hooks/__tests__/useTeamAggregateData.test.ts:437-452` | Resolve-with-zeros → `rejects` |
| `src/lib/__tests__/weeklyHistory.test.ts` SC1.10-SC1.14 | **Unchanged** |
| `__tests__/hooks/useHoursData.test.ts:73-149,223-261` | **Unchanged** |
| `src/__tests__/lib/crossoverData.test.ts:298-320` | **Unchanged** (already models rejecting fetchers) |
| `src/__tests__/hooks/useWidgetSync.test.ts:257-274`, `src/__tests__/widgets/bridge.test.ts:1186-1246` | **Unchanged** |

### Verification commands

```
npx jest __tests__/hooks/useHoursData.test.ts __tests__/hooks/useHoursData.keep-last-good.test.ts src/hooks/__tests__/useHoursData.test.ts __tests__/use-ai-data.test.ts \
  src/hooks/__tests__/usePaymentHistory.test.ts src/hooks/__tests__/useTeamAggregateData.test.ts \
  src/lib/__tests__/weeklyHistory.test.ts src/lib/__tests__/queryPersist.test.ts src/__tests__/lib/crossoverData.test.ts \
  src/__tests__/hooks/useWidgetSync.test.ts app/__tests__/layout-notifications.test.tsx app/__tests__/root-layout-tokens.test.tsx
npm test && npm run typecheck && npm run lint
npx expo-updates runtimeversion:resolve --platform ios   # == 56d054fc723984e56892a367dca1efa79a9f8fad (fingerprint unchanged)
git diff --stat -- app.json package.json package-lock.json plugins ios android   # empty
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/api/timesheet.ts` | modify | Throw when all strategies threw |
| `src/api/payments.ts` | modify | Rethrow non-auth |
| `src/hooks/useTimesheet.ts`, `src/hooks/usePayments.ts` | modify | Auth-aware retry |
| `src/hooks/useAIData.ts` | modify | Keep data on `AuthError`; strict history reads in both writers |
| `src/hooks/usePaymentHistory.ts` | modify | Extract and export the queryFn; rethrow; retry |
| `src/hooks/useTeamAggregateData.ts` | modify | Throw on all-fail; auth-aware retry |
| `src/lib/weeklyHistory.ts` | modify | `readWeeklyHistoryForWrite`; `loadWeeklyHistory` delegates; `wipeAIHistory` uses strict |
| `src/hooks/useEarningsHistory.ts`, `src/hooks/useHistoryBackfill.ts` | modify | Strict read before write |
| `src/lib/queryPersist.ts` | create | `shouldDehydrateQuery` (excludes the `'dev-mock'` view), `DEV_MOCK_OWNER_KEY` |
| `app/_layout.tsx` | modify | `dehydrateOptions` |
| Tests listed above | create/modify | — |

---

## Edge Cases to Handle

1. **Monday morning, genuinely no timesheet row** → `null` → zeros are written. That is correct and truthful.
2. **Timesheet errors, payments succeed** → no write (`useHoursData.ts:58-59`), the cache is served. Mixed freshness is follow-up F4.
3. **First-ever launch offline** → no cache, so the error state shows, as today.
4. **Restored errored query** → idle; it refetches on mount (`staleTime` elapsed). Its `error` object is `{}`, and the hooks map any truthy error.
5. **AI tab with a really revoked account** → data is kept and the error is `'auth'`. Re-onboarding is unchanged (`useRoleRefresh`, `useAuth.ts:72`).
6. **Empty team roster** → zeros without an error (an explicit non-failure).
7. **Background widget path** is unchanged here. It already falls back to `hours_cache` (`crossoverData.ts:90-109`); the manager approvals carry-forward is follow-up F2.

---

## Open Questions

✓ Does `useHoursData` need a code change? → No. The upstream throw makes `isError` real (last-good explorer §4).
✓ Should `loadWeeklyHistory` itself change? → No. Add a strict sibling for writers (Decision 4).
✓ Does the persisted error-with-data state risk persisting promises? → No. Only `pending` queries carry promises (`hydration.ts:195-197`).

None remaining.
