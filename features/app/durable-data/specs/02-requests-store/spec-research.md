# Spec Research: Requests Store

**Date:** 2026-10-22
**Author:** @jaime-alvarez-trilogy
**Spec:** `02-requests-store`

---

## Problem Context

My Requests is the user's top complaint ("old manual time requests … disappear when it sleeps"). The diagnosis proves the mechanism (RC1) with a jest reproduction (scenarios a-c):

- `buildMyRequestsQueryFn` re-downloads 15-21 days in parallel on every refetch (`src/hooks/useMyRequests.ts:76-87`). The refetch fires on every inactive→active transition after 60 s (`:140`, `app/_layout.tsx:62-67`).
- The function never throws (`:121`). Total failure becomes `{entries: [], error}` as a success (`:110-119`). Partial failure silently drops the failed days (`:94-105`).
- TanStack replaces the cache and the persister saves it (`hydration.ts:219-221`).

The owner's requirement: **store data on the phone, and only re-download what can still change.**

This spec makes a versioned, per-assignment, per-day AsyncStorage store the source of truth for My Requests. It adds:

- a pure refresh planner;
- a per-day merge that runs only on that day's success;
- a queryFn that throws on total failure (TanStack keeps data and retries);
- a global work-diary concurrency limit, with in-flight sharing of identical work-diary requests;
- 24-week retention;
- the sign-out wipe.

UI changes (Older section, freshness note, forced pull-to-refresh) are spec 04. The backfill of older weeks is spec 05.

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| Merge-never-replace, bounded, sorted | `mergeWeeklySnapshot` + `WEEKLY_HISTORY_MAX = 24` (`src/lib/weeklyHistory.ts:55-56,69-105`) | The template for retention (24) and find-or-insert merge. Our key is `date`, not `weekStart`. |
| Spread-merge where the API wins on overlap | `useEarningsHistory` `{...existing, ...weeks}` (`src/hooks/useEarningsHistory.ts:142-147`) | Same semantics per day. A read failure skips the write (`:149-152`): copy that. |
| Read-before-credentials (show cache first) | `useAIData` (`src/hooks/useAIData.ts:143-154`) | The queryFn reads the store before deciding what to fetch. |
| "Don't overwrite with nothing" | `useHistoryBackfill` (`:216`), `crossoverData.ts:90-109` | The project already knows the rule. This spec applies it to requests. |
| Versioned key suffix | `earnings_history_v1`, `weekly_history_v2` | New key `my_requests_v1`, with an explicit `version: 1` field inside as well. |
| Sign-out list of literal keys | `clearAll()` (`src/store/config.ts:72-102`, comment `:69-71`) | New keys must be added by hand. `__tests__/config-store.test.ts:127-131` asserts `toHaveLength(18)`. |
| Write-epoch guard against sign-out races | `widgetWriteEpoch` (`src/widgets/bridge.ts:922-962`) | Our equivalent: re-check `loadConfig()` owner inside the serialized write. |
| Test the queryFn directly, no `renderHook` | `useMyRequests.test.ts:1-9` | Keep it. Add QueryClient-level tests (ported from the diagnosis repro) for cache semantics. |

### Key Files

| File | Relevance |
|------|-----------|
| `src/hooks/useMyRequests.ts:55-151` | QueryFn and hook to rewrite |
| `src/lib/requestsUtils.ts:42-94` | `groupSlotsIntoEntries(slots, date)`: pure, per day; output is exactly one stored day's `entries` |
| `src/types/requests.ts:7-40` | `ManualRequestEntry`, `UseMyRequestsResult` |
| `src/types/api.ts:26-46` | `WorkDiarySlot` (`memo`, `status`, `autoTracker`, `actions[]`) |
| `src/lib/approvals.ts:87-96` | `getWeekStartDate(date)`: local Monday, never `toISOString` |
| `src/api/workDiary.ts:16-29` | `fetchWorkDiary`: the place for the global limiter (critique amendment 5) and the in-flight sharing (Decision 6) |
| `src/hooks/useAIData.ts:46-49,208-237,375-383`, `src/lib/ai.ts:173-182` | `useAIData` refetches today's diary on every AppState `'active'` (`shouldRefetchDay` is always true for today), the same moment as the `['myRequests']` focus refetch |
| `src/api/client.ts:92-95,209-211` | `invalidateAuthToken` (spec 01 adds `authGeneration`); `parseBody` returns `undefined` for an empty body |
| `app/modal.tsx:109-155,157-170` | `handleSwitchEnvironment` (keeps data with `invalidateQueries()`, `:138-143`); `toggleDevManagerView` (does not touch `['myRequests']`) |
| `src/store/config.ts:52-58,72-102` | `loadConfig`/`loadCredentials`, `clearAll` |
| `src/lib/devMock.ts:44-69` | `MOCK_MY_REQUESTS` must never reach the store |
| `app/_layout.tsx:69-84,171-176` | QueryClient defaults (`retry: 2`, `gcTime: 24h`), persister `maxAge: 24h` (a cold cache after more than 24 h idle) |
| `node_modules/@tanstack/query-core/src/types.ts:240` | `QueryFunctionContext.client` exists in 5.104.5 (and in 5.97.0 for 1.1) |
| `node_modules/@tanstack/query-core/src/query.ts:961-991` | `'success'` with `manual` keeps `fetchStatus`; `'error'` keeps `data` (basis of seed-then-throw) |
| `docs/CROSSOVER_API.md:516-543` | Status machine: PENDING → APPROVED or REJECTED; both terminal (`:541`) |
| `__mocks__/@react-native-async-storage/async-storage.ts` | In-memory mock with `_reset()` (no `clear`) |

### Integration Points

- `useQuery(['myRequests', assignmentId])`: the key is unchanged, so the persisted cache from 1.1/1.2.0 hydrates into it and the old shape `{entries, error}` must still render.
- `fetchWorkDiary` is also used by `useAIData` (`:228,277`), `useTeamAggregateData` (`:160`) and `crossoverData` (`:137`). All of them inherit the concurrency limit.
- `clearAll()` gains `my_requests_v1`. `app/modal.tsx:77-107` already calls `queryClient.clear()`.
- The env switch (`app/modal.tsx` `handleSwitchEnvironment`) gains `queryClient.removeQueries({ queryKey: ['myRequests'] })` before its `invalidateQueries()` (Decision 4).
- Spec 01's `shouldRetryQuery` (two retries, the same as today's `retry: 2`), the `NO_CREDENTIALS` / `AUTH_HTML_500` constants, and `authGeneration`, which this spec reads through a new one-line `getAuthGeneration()` export in `client.ts` (Decision 6).
- **Cross-spec contract with spec 03:** its `shouldDehydrateQuery` returns `false` for any query whose `data.ownerKey === 'dev-mock'`, so the manager-preview view is never persisted (Decision 4). Until spec 03 lands, the default predicate does persist it, which is harmless because the hook shows a `'dev-mock'` view only while `config.devManagerView` is true.
- Spec 04 consumes `staleDates`, `updatedAt` and `markMyRequestsForcedRefresh`. Spec 05 consumes `updateRequestsStore`, `requestWindows`, `buildRequestsView` and `composeRequestsView`.

---

## Key Decisions

### Decision 1: Where the data lives

**Options considered:**
1. Only the TanStack cache plus persister, reading `client.getQueryData` inside the queryFn (synthesis §3). The persister drops the whole snapshot after `maxAge: 24h` of idle (`app/_layout.tsx:173`; `query-persist-client-core/src/persist.ts:136-137`). It rewrites the whole blob on every cache event (`persist.ts:166-205`), and it skips error-state queries by default. That would not "store" anything beyond a day.
2. A parallel `useState` cache next to `useQuery` (the earnings pattern). Two sources of truth in the hook, and harder to test without `renderHook`.
3. **A dedicated AsyncStorage key `my_requests_v1`, owned by a small module (`src/lib/requestsStore.ts`), read and written inside the queryFn.** The TanStack cache holds only the derived view.

**Chosen:** Option 3.

**Rationale:**
- History survives any idle period.
- Only server-confirmed days are stored.
- The store can be tested as pure functions plus the AsyncStorage mock.
- Backfill (spec 05) can write into it.

Cost: one more key in `clearAll()`, covered by a test.

### Decision 2: Shape (per assignment, per day, versioned)

**Chosen:** `{ version: 1, owner: {assignmentId, useQA}, days: Record<date, StoredRequestDay> }`. Each day is `{date, fetchedAt, entries, settled}`. Days with **zero** entries are stored too.

**Rationale:**
- `owner` isolates accounts and environments. A mismatch is treated as an empty store and replaced on the next successful write.
- Storing empty days is what lets the planner skip them ("settled older days never").
- About 168 days × (mostly empty) entries is small next to `HOURGLASS_QUERY_CACHE`.
- An unknown `version` is treated as empty, so an OTA rollback rebuilds rather than misreading a future shape. The history is re-fetchable (spec 05).

### Decision 3: Refresh planner rules (pure function)

Windows are computed from `today` (local, noon-anchored like `useMyRequests.ts:77-81`):
- `currentMonday`;
- `yesterday` = `today − 1` (can fall in last week on a Monday);
- `catchUpStart` = 2 Mondays before (today's 3-week window);
- `retentionStart` = `currentMonday` minus 23 weeks (24 weeks in total).

**What can still change** (this is what the planner encodes):
- A day of the **current week** can gain a new manual request until the week's timecard deadline, Sunday 23:59:59 UTC (`docs/CROSSOVER_API.md:694-696`).
- A day with a **PENDING** entry can flip to APPROVED or REJECTED. Both are terminal (`docs/CROSSOVER_API.md:541`).
- A day of a **closed week** with no PENDING entry cannot change. Backdating into a closed week is undocumented, and pull-to-refresh (`forced`) is the escape hatch.

**`settled`** is computed at write time by `isDaySettled(date, entries, fetchDay)`:
- every entry is non-PENDING, **and**
- `fetchDay >= tuesdayAfter(date)`, meaning the fetch happened on or after the Tuesday following the day's Mon-Sun week.

Local Tuesday 00:00 is later than Sunday 23:59 UTC in every time zone from UTC−12 to UTC+14. So a settled record was fetched after the deadline and is final. Current-week days are never settled.

For each date the plan picks the first reason that applies:

| Date range | Reason | Rule |
|---|---|---|
| `today` | `today` | Always. The hook's `staleTime: 60_000` already rate-limits runs. |
| `catchUpStart..today` | `forced` | `force === true` (user pull-to-refresh or Retry, spec 04) |
| `catchUpStart..today` | `pending-ttl` | The record has a PENDING entry and `now − fetchedAt ≥ PENDING_TTL_MS` (15 min) |
| `yesterday` | `recent-ttl` | `now − fetchedAt ≥ RECENT_TTL_MS` (60 min). Late-logged manual time most often targets yesterday. |
| `currentMonday..today` | `daily` | No record, or `localDate(fetchedAt) < today`. Current-week days are refreshed once per calendar day. |
| `catchUpStart..currentMonday−1` | `daily` | (No record, or `!settled`) and (no record, or `localDate(fetchedAt) < today`). Days in a closed week are refreshed once per day only until a post-deadline fetch settles them. |
| `retentionStart..<catchUpStart` | `unsettled-old` | The record exists, `!settled`, and `now − fetchedAt ≥ OLD_UNSETTLED_TTL_MS` (6 h) |
| anything else | — | Skip. Settled days are never refetched automatically: only `forced` (above) re-checks them, and only inside the 3-week window. Missing older days are left to spec 05's backfill. |

**Options rejected:**
- "Fetch everything always". This is today's behaviour and the source of the bursts.
- Refreshing every active-window day after 60 min. A wake an hour later would still send 8-14 requests for days that cannot change, which fails the owner's "not pulling everything old again and again".
- `settled = date < activeStart(fetchDay)` (an earlier draft). It re-pulls all of last week every day until the following Monday, because it ignores that the week is closed.
- A single global `lastCatchUpAt` flag. It is not resumable after a partial failure; the per-day records are.
- Refetching ancient PENDING days every 15 min. That is unbounded for never-approved entries; the 6 h rule caps it.

**Effect: `fetchWorkDiary` calls per wake.** Warm store, no PENDING entries, last run the previous evening. Before this spec, every wake more than 60 s after the last one sent the whole window (`useMyRequests.ts:82-87`).

| Wake | Before (every wake) | After |
|---|---|---|
| Monday, first wake of the day | 15 | 8: today plus last week's 7, which settle on Tuesday |
| Tuesday, first wake | 16 | 9: today, Monday, and last week's 7 (fetched Monday, still before `tuesdayAfter`) |
| Wednesday, first wake | 17 | 3: today, Mon, Tue |
| Sunday, first wake | 21 | 7: the current week |
| Any later wake within 60 min | 15-21 | **1** (today) |
| Any later wake after 60 min | 15-21 | **2** (today, yesterday) |
| Each PENDING day in the 3-week window | — | +1, at most every 15 min |
| First run after upgrade (empty store) | 15-21 | 15-21, once |

Every case runs at most 4 requests at a time (Decision 6). These rows are pinned by the "wake budget" tests in the Test Plan.

### Decision 4: Failure semantics

**Options considered:**
1. Return stored data plus `error` as a success. The data is safe, but TanStack retry and backoff never fire and the status says success.
2. Throw on total failure. TanStack keeps prior `data` (`query.ts:977-991`) and retries. But on a cold cache (persister maxAge exceeded) there is no prior data, so the screen would be empty even though the store has data.
3. **Throw on total failure, and on any other failure after the store has been read (credentials unavailable, `loadCredentials` throwing). If `ctx.client.getQueryData(ctx.queryKey)` is `undefined` and the store has days, first `ctx.client.setQueryData(ctx.queryKey, storedView, { updatedAt })` (seed), then throw.**

**Chosen:** Option 3, "seed-then-throw".

**Rationale:**
- A manual `setQueryData` during a fetch is supported: the reducer's `manual` flag keeps `fetchStatus` and records `revertState` (`query.ts:961-975`). The subsequent rejection goes through the `'error'` case, which keeps `data`.
- The retry run sees prior data and simply throws.
- The result is `status: 'error'` with stored data in all cases.

Partial failure resolves with `error: null` and `staleDates`:
- Failed days keep their stored record.
- **View-only carry-forward:** every entry of the prior cache data whose `date` has **no** store record is carried forward in the view, if its date is within retention and the prior data belongs to the same owner (see `ownerKey` below). It is never written to the store, so it is never treated as confirmed. A date's carried entries are dropped the moment that date gets a record, whether from a refresh or from spec 05's backfill.
  - This covers failed days of the current window **and** the upgrade case where the hydrated 1.1/1.2.0 blob holds entries older than `catchUpStart` (Decision 5).
- A successful day that now returns no manual slots really clears that day (synthesis T2). It now has a record, so nothing is carried forward for it.
- `config` present but `loadCredentials()` null → throw `AuthError(401, 'Credentials unavailable', {errorCode: NO_CREDENTIALS})` instead of an empty success (`useMyRequests.ts:70-72`, RC4). This happens **after** the store read, so it also seeds a cold cache, following the read-before-credentials pattern of `useAIData.ts:143-154`.
- No config or `assignmentId` (signed out) → `{entries: [], error: null}`, which is legitimate.

**Owner stamp on the view.** `MyRequestsData.ownerKey` is `assignmentId + '|' + (useQA ? 'qa' : 'prod')`. The TanStack key is `['myRequests', assignmentId]` with no environment (`useMyRequests.ts:138`), so a prod view and a QA view with the same `assignmentId` share one cache entry. The env switch keeps old data visible with `invalidateQueries()` rather than `clear()` (`app/modal.tsx:138-143`). The rules:
- **The env switch removes the requests view.** `handleSwitchEnvironment` calls `queryClient.removeQueries({ queryKey: ['myRequests'] })` before its `invalidateQueries()` (`app/modal.tsx:143`), inside the same `startTransition`.
  - After a switch, no view of any kind (legacy, prod or QA) survives under that key. The next run starts from the new environment's store, which is owner-checked. On a total failure it seeds only from that store, which is empty on a first visit.
  - Only `['myRequests']` is removed and `['config']` is left in place, so the auth-gate concern in the comment at `modal.tsx:138-142` (a `null` config bouncing to welcome) does not apply.
  - The Requests screen shows its skeleton until the new environment's first run lands. Data from the other environment is never shown in its place.
- **Carry-forward and seeding** only use prior data whose `ownerKey` equals the current one, or is `undefined` (a legacy 1.1/1.2.0 blob). Accepting `undefined` is kept for the normal upgrade path (Decision 5), and it is now safe:
  - a view written by this spec's queryFn always has an `ownerKey`, so `undefined` only means "written by the old queryFn";
  - the old queryFn always resolved (`useMyRequests.ts:121`), so on 1.1/1.2.0 an env switch's refetch replaced the blob with the new environment's result. A legacy blob therefore belongs to the environment that was current when the old code last ran;
  - the first env switch on the new code removes it (rule above), so it can never be carried into the other environment.

  The one residual case is a 1.1 env switch whose refetch never ran (the Requests query was inactive), followed by this update within the persister's 24 h `maxAge`. Even then it shows no more than 1.1 itself was showing under that key.
- **`'dev-mock'` views.** The dev-preview branch (step 2) stamps `ownerKey: 'dev-mock'`. A real run treats it as a foreign owner, so mock entries are never carried forward and never block seeding.
  - **Display:** the hook shows a `'dev-mock'` view **only** while `config.devManagerView === true`. With the toggle off it is foreign like any other view (`entries: []`). This matters because `toggleDevManagerView` does not invalidate `['myRequests']` (`modal.tsx:157-170`), so the mock view stays in the cache until the next refetch.
  - **Persistence:** never persisted. Spec 03's `shouldDehydrateQuery` returns `false` when `q.state.data?.ownerKey === 'dev-mock'` (cross-spec contract; see Integration Points).
- **The hook** (`selectMyRequests`) returns `entries: []` when `data.ownerKey` is defined and differs from the current config's (`useConfig().config`), except for the `'dev-mock'` view while the toggle is on. So a failed first QA run never shows prod entries, the manager preview still renders its mocks, and turning the preview off hides them at once.

### Decision 5: Migration from the persisted query data

**Options considered:**
1. Import the old `{entries}` from the hydrated TanStack cache into the store on the first run. Freshness is unknown; the data may be the bug-truncated list (RC1b) or dev-preview mocks (`devMock.ts:44-69`, written by the same queryFn's `:65-67` shortcut); and the persister has already dropped it after 24 h.
2. **No persisted import. The first run's planner fetches the whole 3-week window (`daily`, no records). Every prior entry whose date has no record (failed days, plus anything older than the window still in the hydrated blob) is carried forward in the view only, until a server fetch gives that date a record. Weeks older than the window come from spec 05's backfill, from the server.**

**Chosen:** Option 2.

**Rationale:**
- Nothing visible is lost on upgrade:
  - on a total failure the hydrated cache stays on screen, because we throw;
  - on a partial failure, or a success on a Monday that moves the window, the carried-forward entries stay.

  Test: the "upgrade from 1.1 blob" cases in the Test Plan.
- The store keeps its invariant: every record came from a successful server fetch.
- This improves on the task's suggested one-time migration, which would have imported unverified data.

### Decision 6: Concurrency limit and in-flight sharing (one wrapper in `fetchWorkDiary`)

**Chosen:** one wrapper around the body of `fetchWorkDiary` (token acquisition plus `apiGet`), with two parts:
1. **In-flight sharing.**
   - A module-level `workDiaryInFlight: Map<string, Promise<WorkDiarySlot[]>>`, keyed by `` `${getAuthGeneration()}|${useQA ? 'qa' : 'prod'}|${assignmentId}|${date}` ``.
   - A call whose key is in the map returns **the same promise**: no new request, no limiter slot, no token call. A rejection therefore reaches every caller that joined.
   - On a miss, the wrapper creates `p` (part 2), stores it, and attaches `p.then(clear, clear)`. `clear` deletes the key only if the map still holds `p`. `.then(clear, clear)` is used rather than `.finally` so that the cleanup chain never produces an unhandled rejection.
   - There is **no time-based memo**. Once a promise settles, the next call fetches again, so freshness stays the callers' decision (this spec's planner, `shouldRefetchDay` in `useAIData`).
2. **Concurrency limit.** On a miss, the body runs inside one module-level `createLimiter(WORK_DIARY_CONCURRENCY = 4)`.

**Rationale (sharing):**
- **Duplicate downloads on wake.** `useAIData` refetches today's diary on every AppState `'active'` (`useAIData.ts:375-383`; `shouldRefetchDay` always returns true for today, `src/lib/ai.ts:173-182`). The `['myRequests']` focus refetch always plans `today` (Decision 3). Both fire on the same transition, so today's diary is downloaded twice; with sharing it is downloaded once.
  - The two hooks compute "today" differently (`todayUTC()` at `useAIData.ts:46-49`, local date here). They share whenever the strings match; when they differ, the requests are for different dates, which is correct.
  - A spec 05 backfill date and an `unsettled-old` refetch of the same day share in the same way.
- **Reset on sign-out, env switch and not-contributor.** Every `invalidateAuthToken()` bumps spec 01's `authGeneration`, and the generation is part of the key. A call made after the reset therefore never joins a promise started before it, and a new account or environment never receives an old one's result. Old entries delete themselves when they settle.
  - The reset is expressed through the key rather than a `map.clear()` inside `invalidateAuthToken()`: `workDiary.ts` imports `client.ts`, so `client.ts` cannot import `workDiary.ts` without a cycle. The only `client.ts` change in this spec is a read-only `export function getAuthGeneration(): number`.
- **Shared result.** Callers share one array, so it must be treated as read-only. Every current consumer only reads it: `groupSlotsIntoEntries` filters (`requestsUtils.ts:42-47`), `countDiaryTags` counts (`src/lib/ai.ts:81-107`), and `extractAppBreakdown` builds new arrays (`src/lib/aiAppBreakdown.ts`).
- **Rejected:** a short TTL memo ("reuse a result for N seconds"). It would add a second freshness rule next to the planner, and a stale success could hide a status change.

**Rationale (limit):**
- Critique amendment 5: `useAIData`'s own fan-out on every wake (`useAIData.ts:226-237`, plus its previous-week fallback at `:271-296`) and `useTeamAggregateData` (members × days) also benefit.
- The token mint itself does not need a slot. `getAuthToken` → `mintAuthToken` calls `fetch` directly (`client.ts:26-56`), and the retry's re-mint inside `apiGet` does too. So 4 slot holders awaiting one `mintInFlight` cannot deadlock.
- Trade-off: the queue is FIFO. A manager's team fan-out (`useTeamAggregateData.ts:155-163`, members × days) queued ahead of a My Requests refresh delays it. That costs about (queued ÷ 4) × request latency, roughly 5 s for 10 reports on a Sunday. It is acceptable because the planner usually asks for 1-2 days. A priority lane is deliberately not added.
- `useHistoryBackfill` calls `apiGet` directly (`:198`) with its own sequential pacing (`:245`), so neither the limit nor the sharing applies to it.

### Decision 7: Serializing store writes

**Chosen:** `updateRequestsStore` runs through a module-level promise chain:
1. re-read;
2. merge the given days by date;
3. prune;
4. re-check that the owner is still configured (`loadConfig()`);
5. write;
6. **verify after the write:** call `loadConfig()` again, and if it is null or another owner, `removeItem(REQUESTS_STORE_KEY)` and return `null`.

**Rationale:**
- The queryFn and spec 05's backfill can interleave. A read-modify-write without serialization loses one side's update.
- The pre-check stops most in-flight refreshes from re-creating `my_requests_v1` after sign-out's `clearAll()`.
- The post-write verify closes the remaining window, where `clearAll()` runs between the pre-check and `setItem`. `clearAll()` removes `crossover_config` and `my_requests_v1` in one `multiRemove` (`src/store/config.ts:74-94`), so one of two things is true:
  - the write landed after the multiRemove, and the verify sees no config and removes it;
  - the write landed before, and the multiRemove deletes it.
- `widgetWriteEpoch` (`src/widgets/bridge.ts:924-962`) solves the same race for the widget with an epoch. An epoch is not used here because `config.ts` cannot import `requestsStore.ts`: `requestsStore` imports `loadConfig` from `config.ts`, and `config.ts:69-71` forbids such imports to avoid cycles.

### Decision 8: Forced refresh signal

**Chosen:** a module-level one-shot flag, `markMyRequestsForcedRefresh()`, consumed (read and reset) by the next queryFn run. The hook's returned `refetch` sets it (wired in spec 04).

**Rationale:** `refetch()` has no per-call meta, and changing the `queryKey` would orphan the persisted cache. `refetch` is called only by user actions (pull-to-refresh at `approvals.tsx:145-150`, Retry at `:352`), and never by focus refetches, which call the queryFn directly.

---

## Interface Contracts

### Types

```typescript
// src/types/requests.ts (modify)
/** Value stored in the TanStack cache under ['myRequests', assignmentId]. */
export interface MyRequestsData {
  entries: ManualRequestEntry[];      // computed: buildRequestsView(store days) + view-only carry-forward
  error: 'auth' | 'network' | null;   // always null from the new queryFn; kept so persisted 1.1/1.2.0 blobs ({entries, error}) still type-check and render
  staleDates?: string[];              // computed: planned dates whose fetchWorkDiary rejected in this run (YYYY-MM-DD, desc). Optional for old blobs
  updatedAt?: string | null;          // computed: max StoredRequestDay.fetchedAt within catchUpStart..today (ISO-8601); null if none. Optional for old blobs
  ownerKey?: string;                  // computed: `${assignmentId}|${useQA ? 'qa' : 'prod'}` from CrossoverConfig, or 'dev-mock' (Decision 4). Undefined only on legacy blobs
}

export interface UseMyRequestsResult {
  entries: ManualRequestEntry[];      // existing
  isLoading: boolean;                 // existing
  error: 'auth' | 'network' | null;   // existing; now derived from the thrown queryError first (toRequestsError)
  refetch: () => void;                // existing
  staleDates?: string[];              // new: data?.staleDates ?? []
  updatedAt?: string | null;          // new: data?.updatedAt ?? null
}

// src/lib/requestsStore.ts (new)
export const REQUESTS_STORE_KEY = 'my_requests_v1';
export const REQUESTS_STORE_VERSION = 1 as const;
export const REQUESTS_RETENTION_WEEKS = 24;           // mirrors WEEKLY_HISTORY_MAX (weeklyHistory.ts:56)

export interface RequestsStoreOwner {
  assignmentId: string;  // source: CrossoverConfig.assignmentId (the workdiaries `assignmentId` param, workDiary.ts:25)
  useQA: boolean;        // source: CrossoverConfig.useQA
}

export interface StoredRequestDay {
  date: string;                  // source: the YYYY-MM-DD local date passed as the workdiaries `date` param
  fetchedAt: string;             // computed: new Date(nowMs).toISOString() when that day's fetch fulfilled
  entries: ManualRequestEntry[]; // computed: groupSlotsIntoEntries(WorkDiarySlot[] API response, date) (requestsUtils.ts:42-94)
  settled: boolean;              // computed: isDaySettled(date, entries, fetchDay) at write time
}

export interface MyRequestsStore {
  version: typeof REQUESTS_STORE_VERSION; // stored constant
  owner: RequestsStoreOwner;              // stored, from config at write time
  days: Record<string, StoredRequestDay>; // stored; key === StoredRequestDay.date
}

export type RequestsStoreRead =
  | { status: 'ok'; store: MyRequestsStore }
  | { status: 'empty' }        // key absent, corrupt JSON, wrong shape, unknown version, or owner mismatch → safe to overwrite
  | { status: 'unreadable' };  // AsyncStorage.getItem threw → do NOT write this run

// src/lib/requestsPlanner.ts (new)
export const PENDING_TTL_MS = 15 * 60_000;        // matches the app default staleTime (app/_layout.tsx:72)
export const RECENT_TTL_MS = 60 * 60_000;         // `yesterday` refresh interval (Decision 3)
export const OLD_UNSETTLED_TTL_MS = 6 * 60 * 60_000;

export interface RequestWindows {
  today: string;          // input
  currentMonday: string;  // computed: getWeekStartDate(today@noon)
  yesterday: string;      // computed: today − 1 day (noon-anchored)
  catchUpStart: string;   // computed: Monday 2 weeks before (== today's prevMonday2, useMyRequests.ts:79-81)
  retentionStart: string; // computed: Monday (REQUESTS_RETENTION_WEEKS - 1) weeks before currentMonday
}

export type RefreshReason = 'today' | 'forced' | 'pending-ttl' | 'recent-ttl' | 'daily' | 'unsettled-old';

export interface RefreshPlanInput {
  today: string;                          // local YYYY-MM-DD (todayOverride ?? todayLocal())
  nowMs: number;                          // epoch ms (nowOverride ?? Date.now())
  days: Record<string, StoredRequestDay>; // store days (or {} when empty/unreadable)
  force: boolean;                         // consumed one-shot flag (Decision 8)
}

export interface RefreshPlan {
  dates: string[];                            // to fetch, newest first, unique
  reasons: Record<string, RefreshReason>;     // one per date in `dates`
}

// src/lib/limit.ts (new)
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;
```

### Function Contracts

| Function | Signature | Responsibility | Dependencies |
|----------|-----------|----------------|--------------|
| `createLimiter` | `(max: number) => Limiter` | FIFO queue. At most `max` tasks run at once. A rejection releases its slot. | — |
| `fetchWorkDiary` | unchanged | Decision 6. Join the in-flight promise for `` `${getAuthGeneration()}\|${env}\|${assignmentId}\|${date}` `` if there is one. Otherwise run the body in `workDiaryLimiter` (`WORK_DIARY_CONCURRENCY = 4`), store the promise, and delete it on settle (only if still the stored one). | `createLimiter`, `getAuthGeneration`, `getAuthToken`, `apiGet` |
| `getAuthGeneration` | `() => number` (new export in `src/api/client.ts`) | Returns spec 01's `authGeneration`. Read-only; nothing else in `client.ts` changes | — |
| `__resetWorkDiaryInFlightForTests` | `() => void` (exported from `workDiary.ts`) | Clears `workDiaryInFlight`, so a never-settling deferred in one test cannot leak into the next (the same idea as `__setRotationLimits` in `log.ts:20`) | — |
| `handleSwitchEnvironment` (`app/modal.tsx`, modify) | — | In the existing `startTransition`, call `queryClient.removeQueries({ queryKey: ['myRequests'] })` **before** the existing `queryClient.invalidateQueries()` (Decision 4). Nothing else changes; `['config']` is still set first. | `queryClient` |
| `requestWindows` | `(today: string) => RequestWindows` | Noon-anchored date math (DST-safe) | `getWeekStartDate` |
| `tuesdayAfter` | `(date: string) => string` | `getWeekStartDate(date@noon) + 8 days`: the local Tuesday after the day's Mon-Sun week | `getWeekStartDate` |
| `isDaySettled` | `(date: string, entries: ManualRequestEntry[], fetchDay: string) => boolean` | `entries.every(e => e.status !== 'PENDING') && fetchDay >= tuesdayAfter(date)` (Decision 3) | `tuesdayAfter` |
| `planRequestRefresh` | `(input: RefreshPlanInput) => RefreshPlan` | Decision 3 table. Pure. | `requestWindows` |
| `readRequestsStore` | `(owner: RequestsStoreOwner) => Promise<RequestsStoreRead>` | Never throws. Classifies as in `RequestsStoreRead`. | `AsyncStorage` |
| `updateRequestsStore` | `(owner, fetched: StoredRequestDay[], today: string) => Promise<MyRequestsStore \| null>` | Serialized: re-read (`unreadable` → `null`, no write); base = `ok` ? store : empty for `owner`; `days[d.date] = d` for each fetched day; prune `< retentionStart`; re-check `loadConfig()` owner (mismatch or null → `null`, no write); `setItem`. If `setItem` throws: `log.warn('requests.store_write_failed', {})` and return the merged store. | `AsyncStorage`, `loadConfig`, `log` |
| `pruneDays` | `(days, today) => Record<string, StoredRequestDay>` | Drop `date < retentionStart` | `requestWindows` |
| `buildRequestsView` | `(days, today) => { entries: ManualRequestEntry[]; updatedAt: string \| null }` | Flatten days within retention. Stable sort by `date` desc, keeping in-day order from `groupSlotsIntoEntries`. `updatedAt` = max `fetchedAt` in `catchUpStart..today`. | `requestWindows` |
| `composeRequestsView` | `(days: Record<string, StoredRequestDay>, today: string, prior: MyRequestsData \| undefined) => ManualRequestEntry[]` | `buildRequestsView(days, today).entries` plus `prior?.entries.filter(e => !days[e.date] && e.date >= retentionStart)`, re-sorted by date desc. The caller passes `prior` only when its `ownerKey` matches or is undefined. Shared by the queryFn (step 12) and spec 05's `setQueryData` updater, so the backfill can never drop carried-forward entries. | `buildRequestsView`, `requestWindows` |
| `markMyRequestsForcedRefresh` | `() => void` | Set the one-shot flag (exported from `useMyRequests.ts`) | — |
| `buildMyRequestsQueryFn` | `(todayOverride?: string, nowOverride?: () => number) => (ctx?: { client: QueryClient; queryKey: readonly unknown[] }) => Promise<MyRequestsData>` | See the algorithm below. `ctx` is optional, so existing `buildMyRequestsQueryFn(x)()` calls keep working (critique amendment 1). If `todayOverride` is set without `nowOverride`, `nowMs` defaults to `Date.parse(today + 'T12:00:00')` (local noon) for deterministic tests. | all of the above, `fetchWorkDiary`, `groupSlotsIntoEntries`, `loadConfig`, `loadCredentials` |
| `toRequestsError` | `(err: unknown) => 'auth' \| 'network' \| null` | `null` if no error; `'auth'` for `AuthError` without `errorCode === AUTH_HTML_500`; else `'network'` (keeps the `'auth'`/`'network'` literals for SC13/SC14) | `AuthError` |
| `useMyRequests` | `() => UseMyRequestsResult` | `useQuery({ queryKey: ['myRequests', assignmentId], queryFn: buildMyRequestsQueryFn(), staleTime: 60_000, enabled: !!assignmentId, retry: shouldRetryQuery })`. Returns `error: toRequestsError(queryError) ?? data?.error ?? null`, plus `staleDates` and `updatedAt`. Entries (Decision 4): a legacy view (no `ownerKey`) or a matching `ownerKey` → `data.entries`; `'dev-mock'` → `data.entries` only if `config?.devManagerView === true`, else `[]`; any other `ownerKey` → `[]`. A pure exported `selectMyRequests(data, config, queryError)` does this mapping, so it is unit-tested without `renderHook`. | `useQuery`, `useConfig`, `shouldRetryQuery` |

**QueryFn algorithm** (`buildMyRequestsQueryFn`):
1. `today`, `nowMs`. `config = await loadConfig()`.
2. `config?.devManagerView` → return `{ entries: [...MOCK_MY_REQUESTS], error: null, ownerKey: 'dev-mock' }`. No store I/O; the force flag is not consumed.
3. `!config || !config.assignmentId` → return `{ entries: [], error: null }`.
4. `owner = { assignmentId, useQA }`, `ownerKey`. `read = await readRequestsStore(owner)`. `baseDays = read.status === 'ok' ? read.store.days : {}`. `rawPrior = ctx?.client.getQueryData<MyRequestsData>(ctx.queryKey)`. `prior = rawPrior && (rawPrior.ownerKey === undefined || rawPrior.ownerKey === ownerKey) ? rawPrior : undefined`. A `'dev-mock'` or other-environment view is therefore never a prior. After an env switch `rawPrior` is `undefined` anyway, because the switch removed the query (Decision 4).
5. Define `seedAndThrow(err, staleDates)`:
   - If `ctx && prior === undefined && Object.keys(baseDays).length > 0` (no same-owner data in the cache; a foreign-owner view is overwritten), compute `view = buildRequestsView(baseDays, today)` and call `ctx.client.setQueryData(ctx.queryKey, { ...view, error: null, staleDates, ownerKey }, { updatedAt: Date.parse(view.updatedAt ?? '') || undefined })`.
   - Then `throw err`.
6. `credentials = await loadCredentials()`. If it throws, `seedAndThrow(thatError, [])`. If it is null, `seedAndThrow(new AuthError(401, 'Credentials unavailable', { errorCode: NO_CREDENTIALS }), [])`.
7. `plan = planRequestRefresh({ today, nowMs, days: baseDays, force: consumeForcedRefresh() })`.
8. `settled = await Promise.allSettled(plan.dates.map(d => fetchWorkDiary(assignmentId, d, credentials, useQA)))`.
9. Each fulfilled result **whose value is an array** (including `[]`) becomes `{ date, fetchedAt: new Date(nowMs).toISOString(), entries: groupSlotsIntoEntries(value, date), settled: isDaySettled(date, entries, today) }`. A resolved `[]` is a real empty day and is stored as one. A rejected date goes into `failedDates`, and so does a fulfilled value that is not an array: an empty body makes `parseBody` return `undefined` (`client.ts:209-211`), and that must never be stored as an empty day. Spec 05 applies the same rule.
10. **Total failure** (`fetched.length === 0`, which implies `plan.dates.length > 0` because `today` is always planned):
    - `err` = the first `AuthError` that is not `AUTH_HTML_500`, otherwise the first rejection reason, otherwise (every date resolved without an array) `new NetworkError('Empty work diary response')`, which is retryable.
    - `log.warn('requests.refresh_failed', { plannedDays, failedDays, kind: toRequestsError(err) })`.
    - `seedAndThrow(err, plan.dates)`. Nothing is written to the store.
11. `stored = read.status === 'unreadable' ? null : await updateRequestsStore(owner, fetched, today)`. `days = stored?.days ?? { ...baseDays, ...byDate(fetched) }`.
12. `view = buildRequestsView(days, today)`. `entries = composeRequestsView(days, today, prior)`: the view plus view-only carry-forward (Decision 4), re-sorted by date desc.
13. Return `{ entries, error: null, staleDates: failedDates (desc), updatedAt: view.updatedAt, ownerKey }`.

---

## Test Plan

### `createLimiter` (`src/lib/__tests__/limit.test.ts`, new)

**Happy Path:** 10 tasks with deferred promises and max 4: the 4 started tasks are observed, resolving one starts the 5th, and results return in each task's own promise.

**Edge Cases:** max 1 runs serially; a task that throws synchronously inside an async fn releases its slot; FIFO start order.

**Error Cases:** a rejected task rejects its own promise and does not block the queue.

**Mocks Needed:** none.

### `fetchWorkDiary` limit and in-flight sharing (`__tests__/api/work-diary.test.ts`, extend)

`beforeEach(__resetWorkDiaryInFlightForTests)`.

**Happy Path:**
- **Limit:** 10 concurrent calls for **10 different dates** (identical keys would be shared), with `apiGet` mocked as deferreds. At most 4 are in flight at once, and all 10 resolve.
- **Sharing:** two concurrent calls for the same `assignmentId` + date + `useQA` → `apiGet` is called **once** and `getAuthToken` once, and both callers resolve with the same array (`toBe`).
- **Different dates:** two concurrent calls for `'2026-10-21'` and `'2026-10-20'` → `apiGet` called **twice**.

**Edge Cases:**
- **No memo after settle:** call, await, then call again with the same key → `apiGet` is called twice.
- **Environment is part of the key:** the same `assignmentId` and date with `useQA` `false` and `true` at once → 2 calls.
- **Generation reset:** start a call (deferred), make the mocked `getAuthGeneration` return `1` (as after `invalidateAuthToken()`), then call again with the same key → a second `apiGet`. Resolving the first deferred does not delete the second entry: a third concurrent call joins the second, so the count stays at 2.
- **Joins bypass the queue:** with the limiter full (4 distinct calls in flight and a 5th distinct date queued), a join of in-flight call #2 resolves as soon as #2 resolves, while #1, #3 and #4 are still pending and the 5th is still queued. After everything settles, `apiGet` has exactly 5 calls.

**Error Cases:**
- **Rejection reaches both callers:** two concurrent same-key calls, and the deferred rejects with `NetworkError` → both reject with that same error. A next call then fetches again (the entry was cleared on rejection), and no unhandled rejection is reported.

**Mocks Needed:** `../../src/api/client` (`getAuthToken`, `apiGet`, and now **`getAuthGeneration: jest.fn(() => 0)`**). The file's factory mock currently lists only `getAuthToken` and `apiGet` (`work-diary.test.ts:10-13`), so it must gain `getAuthGeneration`, or every call throws "getAuthGeneration is not a function". Other suites mock `../api/workDiary` as a whole (`use-ai-data`, `stale-closure-iso`, `crossoverData`, `useTeamAggregateData`, `useMyRequests`), so they are unaffected.

### `requestWindows` / `planRequestRefresh` / `isDaySettled` (`src/lib/__tests__/requestsPlanner.test.ts`, new)

**Happy Path:**
- Empty store, today Monday 2026-03-09 → 15 dates (2026-02-23..2026-03-09), `today` → `'today'`, the rest `'daily'`. This matches CH.1 today.
- Empty store, Wednesday → 17 dates. Sunday → 21.
- All days fetched 5 min ago today, no PENDING → `['2026-03-09']` only.
- Yesterday fetched 61 min ago today → `recent-ttl`; at 59 min → skipped.
- A current-week day (not today or yesterday) fetched 3 h ago today → skipped. Fetched yesterday → `daily`.
- A day with a PENDING entry anywhere in `catchUpStart..today`, fetched 16 min ago → `pending-ttl`; at 14 min → skipped.
- A last-week day with no PENDING:
  - fetched on the Monday of this week, today Tuesday → `daily`, because it is not settled yet;
  - stored `settled: true` (fetched Tuesday or later) → skipped for the rest of the week.
- `force: true` → every catch-up date, as `forced` (`today` keeps `'today'`).
- Older day (before catchUpStart): settled → never. `!settled` and fetched 7 h ago → `unsettled-old`; 5 h → skipped. No record → skipped.
- **Wake-budget table (Decision 3), one `it` per row.** Each test builds a store as the previous evening's run would have left it: every window day recorded, `settled` computed by `isDaySettled`, no PENDING. It then asserts `plan.dates.length`:
  - Monday first wake → 8;
  - Tuesday → 9;
  - Wednesday → 3;
  - Sunday → 7;
  - the same day +5 min → 1;
  - the same day +90 min → 2.

**Edge Cases:**
- A day before `retentionStart` is never planned.
- `fetchedAt` in the future (clock skew) → treated as fresh (no negative-age refetch loops) except for the `today` rule.
- DST weeks: US spring-forward 2026-03-08 and fall-back 2026-11-01 give correct Mondays (noon anchor).
- Output dates are unique and sorted desc.
- `isDaySettled`:
  - a last-week day with only APPROVED/REJECTED, `fetchDay` = this Tuesday → true; `fetchDay` = this Monday → false (the deadline may not have passed in UTC+ zones);
  - with PENDING → false;
  - any current-week day → false;
  - an empty day of a closed week fetched after its `tuesdayAfter` → true;
  - `tuesdayAfter('2026-10-25')` (a Sunday) → `'2026-10-27'`; across the DST week, `tuesdayAfter('2026-11-01')` → `'2026-11-03'`.

**Error Cases:** a malformed `fetchedAt` (NaN) is treated as never fetched (`daily` or `unsettled-old` applies).

**Mocks Needed:** none (pure; noon-anchored dates).

### `readRequestsStore` / `updateRequestsStore` / `pruneDays` / `buildRequestsView` (`src/lib/__tests__/requestsStore.test.ts`, new)

**Happy Path:**
- Round trip: an update with 2 days, then a read gives `ok` with both.
- Merge: stored `{d1, d2}` plus fetched `{d2'}` gives `{d1, d2'}` (fresh wins, others are kept).
- View: entries sorted desc across days, in-day order preserved, `updatedAt` = max `fetchedAt` in the catch-up window (older backfilled days are ignored).

**Edge Cases:**
- Prune: days older than `retentionStart` are removed on write.
- Owner mismatch (different `assignmentId` or `useQA`) → read `empty`; an update replaces the store with only the fetched days for the new owner.
- An unknown `version` → `empty`.
- Corrupt JSON → `empty`, and a write is allowed.
- Serialization: two concurrent `updateRequestsStore` calls with different days both persist (no lost update).
- A day stored with `entries: []` survives the round trip.

**Error Cases:**
- `getItem` throws → read `unreadable`, `updateRequestsStore` returns `null`, and `setItem` is never called.
- `setItem` throws → returns the merged store and `log.warn('requests.store_write_failed')`.
- `loadConfig()` returns `null` (signed out mid-flight) → returns `null` with no `setItem`.
- `loadConfig()` returns another `assignmentId` → no write.
- **Sign-out race (write-then-verify):** `loadConfig` resolves the owner for the pre-check, then `null` for the post-write verify (simulating `clearAll()` between check and `setItem`). Result: `null`, `removeItem('my_requests_v1')` called, and `getItem('my_requests_v1')` is `null` afterwards.
- **`clearAll()` integration:** write a store, call the real `clearAll()` (`src/store/config.ts`, unmocked in this file), and `getItem('my_requests_v1')` is `null`.

**Mocks Needed:** the AsyncStorage `__mocks__` with `_reset()` in `beforeEach`; `../../store/config` `loadConfig` (use `mockResolvedValue`, not `...Once`, because the owner is checked twice per write; the `clearAll` case uses `jest.requireActual`); `../log`.

### `buildMyRequestsQueryFn` (`src/hooks/__tests__/useMyRequests.test.ts`, modify)

Add `beforeEach(() => (AsyncStorage as any)._reset())`. The file currently never resets storage, and a persisted store would make later call-count tests skip days.

**Happy Path:**
- First run → the store is written with every planned day (including empty days).
- A second run with the same `today` and `now + 5 min` → `fetchWorkDiary` is called once (today).
- A successful day that now returns no manual slots removes that day's old entry (store and view).
- **Wake budget, end to end** (`describe('DD2 — wake budget')`). This is the regression test for "don't re-pull old data". It runs the real planner and store against a mocked `fetchWorkDiary` that resolves `[]`, and asserts `mockFetchWorkDiary.mock.calls.length` and the called dates:
  - run 1 on Tuesday 2026-10-20 at 21:00 (empty store) → 16;
  - run 2 on Wednesday 2026-10-21 at 08:00 → 3 (`['2026-10-21','2026-10-20','2026-10-19']`);
  - run 3 at 08:05 → 1 (`['2026-10-21']`);
  - run 4 at 09:30 → 2 (`['2026-10-21','2026-10-20']`);
  - then one run at 21:00 each day from Wednesday through Sunday 2026-10-25, and a run on Monday 2026-10-26 at 08:00 → 8 (today plus last week's 7, none settled yet because each was fetched before Tuesday 2026-10-27);
  - **contrast:** a comment records the old code's 17 calls for every one of the Wednesday runs.
  - Use `nowOverride` and `todayOverride` and call `jest.clearAllMocks()` between runs, but not `_reset()`.

**Edge Cases:**
- `devManagerView` → mocks returned, `AsyncStorage.setItem` never called with `my_requests_v1`, and the force flag is not consumed.
- No config → `{entries: [], error: null}` with no fetch.
- Partial failure: stored Mon, Tue and Wed entries; the refetch fails Mon and Wed while Tue changes PENDING → APPROVED. Result: all 3 entries present, Tue's status fresh, `staleDates = ['2026-03-11','2026-03-09']`, `error: null`.
- A failed day with no record and no prior → simply absent.
- Empty body versus empty day: one planned date resolves `undefined` and another resolves `[]`. The `undefined` date is in `staleDates` and gets no record (its old record, if any, is unchanged). The `[]` date is stored with `entries: []`. If every planned date resolves `undefined`, the queryFn rejects with a `NetworkError` and nothing is written.
- A failed day with no record but in the `ctx` prior data → carried forward in the view, and not written to the store.
- **Upgrade from a 1.1/1.2.0 blob:**
  - `ctx` prior is the legacy shape `{entries: [5 entries incl. 2 dated before catchUpStart], error: null}` with no `ownerKey`, and the store is empty.
  - Every planned fetch succeeds with `[]`.
  - Result: the 2 older entries are still in `entries` (carried forward), the 3 in-window ones are gone (server says empty), and the store holds no record for the 2 older dates.
  - With a total failure instead: the queryFn rejects and `getQueryData` is still the legacy blob, byte for byte.
- **Owner stamp:**
  - prior with `ownerKey: '79996|prod'` while config is `useQA: true` → nothing carried forward, and the result has `ownerKey: '79996|qa'`;
  - prior `ownerKey: 'dev-mock'` with `devManagerView` off → nothing carried forward; with a populated store and a total failure, the cache is seeded from the store (the mock view is overwritten, not kept);
  - the `devManagerView` result has `ownerKey: 'dev-mock'`.
- `markMyRequestsForcedRefresh()` followed by a run → all catch-up dates fetched. The flag is one-shot: the next run is back to normal.
- `getItem` throws → still resolves with fetched days plus the prior carry-forward, and no `setItem`.

**Error Cases:**
- Total failure with `NetworkError` → the queryFn **rejects** with that `NetworkError`. Total failure with `AuthError(401)` → rejects with the `AuthError`. This is the rewritten **FR4.6** (`:284-311`).
- **Failed refresh leaves storage byte-identical:**
  - capture `raw = await AsyncStorage.getItem('my_requests_v1')` after a successful run;
  - make every fetch reject and run again (rejects);
  - assert `getItem` returns exactly `raw` (string equality) and `setItem` was not called with `'my_requests_v1'`.
  - Partial failure variant: the records of the failed dates are `JSON.stringify`-equal to before.
- Credentials `null` with a config → rejects with `AuthError`, `errorCode === 'NO_CREDENTIALS'`. With a cold `ctx` cache and a populated store, the store view is seeded first (`getQueryData(key).entries.length > 0`).
- `loadCredentials` throws → rejects with that error, seeded the same way.

**QueryClient-level** (new `describe('DD2 — cache semantics')`, ported from the diagnosis repro; real `QueryClient` with `retry: false`):
- (a) 3 cached entries, then an all-fail refetch → `getQueryData` unchanged, `getQueryState().status === 'error'`.
- (c) The same with `AuthError` → status `'error'`, data unchanged.
- (b) Partial failure as above, through `fetchQuery`.
- Seed-then-throw: empty QueryClient, the store holds 3 entries, every fetch fails → `fetchQuery` rejects, `getQueryData(key).entries.length === 3`, and `status === 'error'`.
- **Env switch removes the view** (`describe('DD2 — env switch')`):
  - setup: seed `['myRequests','79996']` with a prod view (`ownerKey: '79996|prod'`, 3 entries) and write a prod store;
  - apply the switch's cache steps in the same order as `handleSwitchEnvironment`: `removeQueries({ queryKey: ['myRequests'] })`, then `invalidateQueries()`;
  - set config to `useQA: true` and make every QA fetch fail → `fetchQuery` rejects, and `getQueryData(['myRequests','79996'])` is `undefined`: the QA store is empty, so nothing is seeded and no prod entry survives;
  - the same with a **legacy** blob (no `ownerKey`) in place of the prod view → also `undefined`;
  - control without `removeQueries`: the legacy blob would be accepted as a prior. This documents why the removal is needed.

**Mocks Needed:** existing `../../store/config` and `../../api/workDiary` mocks; the AsyncStorage `__mocks__`; `../../lib/log`; a `QueryClient` from `@tanstack/react-query`.

### `useMyRequests` hook (static, same file)

- The source contains `retry: shouldRetryQuery`, `staleTime: 60_000` (SC4 stays), `Promise.allSettled` (SC11 stays), `'auth'`/`'network'` (SC13/SC14 stay, in `toRequestsError`), `groupSlotsIntoEntries` (SC10, still called in the hook) and `UseMyRequestsResult` (SC16).
- **SC12 (`useMyRequests.test.ts:89-91`, regex `/sort/`) needs re-pointing.** The sort now lives in `composeRequestsView` (`requestsStore.ts`). Point SC12 at that file rather than leaving a stray `sort` in the hook. (A comment containing "sort" would also satisfy the regex, which is exactly why it should be re-pointed.)
- **SC9 (`getWeekStartDate`, `useMyRequests.test.ts:77-79`) would break.** The date math moves to `requestsPlanner.ts`, so `useMyRequests.ts` no longer calls `getWeekStartDate`. Update SC9 to assert `requestWindows` or `planRequestRefresh` instead, and add the same `getWeekStartDate` assertion to a source check of `src/lib/requestsPlanner.ts`. Do not keep a dead import just to satisfy the regex.
- `selectMyRequests` unit cases:
  - a legacy blob (no `ownerKey`) → its entries;
  - a matching `ownerKey` → entries;
  - a `'79996|prod'` blob with a QA config → `[]`;
  - `'dev-mock'` with `config.devManagerView === true` → the mock entries;
  - `'dev-mock'` with `devManagerView` false or absent → `[]`, and with `config` null → `[]`.
- `toRequestsError` unit cases:
  - `AuthError(401)` → `'auth'`;
  - `AuthError` with `AUTH_HTML_500` → `'network'`;
  - `NetworkError` → `'network'`;
  - `null` → `null`.

### Env switch (`app/__tests__/modal-auth-cache.test.tsx`, extend)

The file already source-checks `handleSwitchEnvironment` (FR7.c, `:49-61`), because the handler is a local function inside the component. Add **DD2.envSwitch**, using the same body extraction:
- the body contains `removeQueries({ queryKey: ['myRequests'] })`;
- its index is **before** `invalidateQueries(`.

The `useQueryClient` mocks in `app/__tests__/modal*.test.tsx` expose only `setQueryData` and `invalidateQueries`. None of them drives the switch path today, so they stay unchanged. Add `removeQueries: jest.fn()` to any mock that starts driving it.

The behaviour itself (no prod or legacy view survives a switch) is the QueryClient-level `DD2 — env switch` test above.

### `clearAll` (`__tests__/config-store.test.ts`, modify)

- `:127-131`: `toHaveLength(18)` → `toHaveLength(19)`, with the test title updated.
- `:137-156`: add `expect(keys).toContain('my_requests_v1')`.
- **Second copy:** `src/__tests__/store/config.test.ts:59-64` also asserts `toHaveLength(18)`. Change it to 19 and add `toContain('my_requests_v1')`.

### Existing tests that change (and how)

| Test | Change |
|------|--------|
| `useMyRequests.test.ts` FR4.6 (`:284-311`) | **Rewrite:** `await expect(queryFn()).rejects.toBeInstanceOf(AuthError)` and `.rejects.toBeInstanceOf(NetworkError)`. It currently encodes the bug. |
| `useMyRequests.test.ts` FR4.4 (`:240-266`), CH.5 (`:488-511`) | **Unchanged.** Partial failure still resolves with `error: null` (critique correction 8). |
| `useMyRequests.test.ts` CH.1-CH.4 (`:316-487`) | Unchanged, given the `_reset()` `beforeEach`. The first run on an empty store plans the same 15/17/21 dates. |
| `useMyRequests.test.ts` SC1-SC16 | Unchanged strings except **SC9** and **SC12**, which are re-pointed to `requestsPlanner.ts` / `requestsStore.ts` (see the static list above) |
| `__tests__/config-store.test.ts:127-131`, `src/__tests__/store/config.test.ts:59-64` | 18 → 19 keys (both files) |
| `app/(tabs)/__tests__/approvals.test.tsx` | Unchanged (mocks the hook; the new fields are optional) |
| `__tests__/api/work-diary.test.ts` (`:10-13` factory) | Add `getAuthGeneration: jest.fn(() => 0)` to the `../../src/api/client` mock, and `beforeEach(__resetWorkDiaryInFlightForTests)`. The existing cases await each call in turn, so sharing does not change their call counts |
| `app/__tests__/modal-auth-cache.test.tsx` | Add DD2.envSwitch (source order). FR7.a-c unchanged |

### Verification commands

```
npx jest src/lib/__tests__/limit.test.ts src/lib/__tests__/requestsPlanner.test.ts src/lib/__tests__/requestsStore.test.ts \
  src/hooks/__tests__/useMyRequests.test.ts __tests__/api/work-diary.test.ts __tests__/config-store.test.ts \
  src/__tests__/store/config.test.ts __tests__/use-ai-data.test.ts src/hooks/__tests__/useTeamAggregateData.test.ts src/__tests__/lib/crossoverData.test.ts \
  app/__tests__/modal-auth-cache.test.tsx app/__tests__/modal.test.tsx app/__tests__/modal-signout.test.tsx
npm test && npm run typecheck && npm run lint
npx expo-updates runtimeversion:resolve --platform ios   # == 56d054fc723984e56892a367dca1efa79a9f8fad (fingerprint unchanged)
git diff --stat -- app.json package.json package-lock.json plugins ios android   # empty
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/limit.ts` | create | `createLimiter` |
| `src/lib/requestsPlanner.ts` | create | Windows, `tuesdayAfter`, `isDaySettled`, `planRequestRefresh`, TTL constants |
| `src/lib/requestsStore.ts` | create | Key, types, read/update/prune/view, `composeRequestsView`, serialized write-then-verify writes |
| `src/api/workDiary.ts` | modify | Global limiter plus in-flight sharing of identical requests; `__resetWorkDiaryInFlightForTests` |
| `src/api/client.ts` | modify | One read-only export, `getAuthGeneration()` (in-flight sharing key) |
| `app/modal.tsx` | modify | `handleSwitchEnvironment`: `removeQueries({ queryKey: ['myRequests'] })` before `invalidateQueries()` |
| `src/hooks/useMyRequests.ts` | modify | Store-backed queryFn, `toRequestsError`, `markMyRequestsForcedRefresh`, retry predicate |
| `src/types/requests.ts` | modify | `MyRequestsData`, optional `staleDates`/`updatedAt`/`ownerKey` |
| `src/store/config.ts` | modify | Add `'my_requests_v1'` to `clearAll` |
| `src/lib/__tests__/limit.test.ts`, `requestsPlanner.test.ts`, `requestsStore.test.ts` | create | Unit tests |
| `src/hooks/__tests__/useMyRequests.test.ts`, `__tests__/api/work-diary.test.ts`, `__tests__/config-store.test.ts`, `src/__tests__/store/config.test.ts`, `app/__tests__/modal-auth-cache.test.tsx` | modify | As listed above |
| `docs/ARCHITECTURE.md` | modify | Requests data flow: store, planner, limiter and in-flight sharing, env-switch removal |

---

## Edge Cases to Handle

1. **Sign-out mid-refresh.** The owner pre-check in `updateRequestsStore` skips the write, and the post-write verify removes a write that raced `clearAll()` (Decision 7). `queryClient.clear()` (`modal.tsx:96`) drops the view.
2. **Env switch or another account.**
   - The store owner is `{assignmentId, useQA}`, so a mismatch reads as empty and is replaced on the first successful write.
   - The env switch removes `['myRequests']` before invalidating, so no legacy, prod or QA view survives it. The view's `ownerKey` is the second guard: a foreign view under the same `['myRequests', assignmentId]` key is never shown or carried forward (Decision 4).
   - `invalidateAuthToken()` (sign-out, env switch, not-contributor) bumps the auth generation, so no work-diary call made afterwards joins an in-flight request from before (Decision 6).
   - Switching back and forth rebuilds each environment's history from the server. QA is a test environment, so this is acceptable.
3. **Manager preview toggle** (`devManagerView`). No store reads or writes. The mock view is stamped `ownerKey: 'dev-mock'`, and the docs for specs 02 and 03 agree on three rules:
   - it is never carried forward and never used for seeding (it is a foreign owner to every real run);
   - it is **shown only while `config.devManagerView` is true**. With the toggle off, `selectMyRequests` returns `[]` for it, even though the toggle leaves it in the cache;
   - it is **never persisted** once spec 03 lands: `shouldDehydrateQuery` returns `false` for `ownerKey === 'dev-mock'`. Between the 02 and 03 merges, the default predicate does persist it, which is harmless because of the display rule.

   The mock dates 2026-03-12..14 are also older than `retentionStart`.
4. **Old persisted blob** `{entries, error}` without `staleDates`/`updatedAt`/`ownerKey` renders (the optional fields default in the hook). Its entries are carried forward until each date gets a server record, so the upgrade shows nothing less than before. A legacy blob with `error: 'network'` and `entries: []` (the RC1 bug state) simply has nothing to carry.
5. **Cold cache after more than 24 h idle plus offline**: seed-then-throw shows the stored list.
6. **Ancient PENDING entry**: refetched at most every 6 h.
7. **Same-memo grouping** is unchanged (F5). The store is keyed by date, so a day's grouping is recomputed on every successful fetch.
8. **Focus storms** (Face ID, Notification Center; critique correction 6). With a warm store each run fetches 1-2 days (Decision 3 table), so the bursts are gone even with focus refetch on. The critique's optional `staleTime` raise (amendment 9) is therefore not needed. SC4 pins `staleTime: 60_000`, and it stays.
9. **Midnight rollover during a run**: `today` and `nowMs` are captured once per run.
10. **Shipping 02 without 04.** Once days age past `catchUpStart`, the view contains entries older than the 3-week window. Today's screen puts every `date < prevMonday1` entry under "2 Weeks Ago" (`approvals.tsx:98`), so they would be mislabelled. 02 can be merged alone, but it must not be **released** without 04 (FEATURE Release Plan).

---

## Open Questions

✓ Store in the TanStack cache or a separate key? → A separate key (Decision 1).
✓ Migrate persisted query data? → No import; view-only carry-forward plus spec 05 backfill (Decision 5).
✓ Can manual time be backdated? → Undocumented. Handled by the `daily` rule over the 3-week window and the 6 h unsettled rule (Decision 3).
✓ Where does the concurrency limit go? → Inside `fetchWorkDiary`, together with the in-flight sharing of identical requests (Decision 6).

None remaining.
