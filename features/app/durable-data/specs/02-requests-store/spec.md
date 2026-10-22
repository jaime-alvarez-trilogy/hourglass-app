# Requests Store

**Status:** Draft
**Created:** 2026-10-22
**Last Updated:** 2026-10-22
**Owner:** @jaime-alvarez-trilogy

**Feature:** [durable-data](../../FEATURE.md) · **Research:** [spec-research.md](spec-research.md) · **Builds on:** [01-auth-renewal](../01-auth-renewal/spec.md) (done, `968f1d5..c1b36c2`) · **Branch:** `feat/sdk-58` (1.2.0) · **Fingerprint:** must stay `56d054fc723984e56892a367dca1efa79a9f8fad`

---

## Overview

My Requests stops re-downloading three weeks of work diaries on every wake, and stops saving a failed refresh as an empty list. A versioned, per-assignment, per-day AsyncStorage store (`my_requests_v1`) becomes the source of truth. The TanStack cache under `['myRequests', assignmentId]` (key unchanged) holds only a view derived from it.

**What gets built:**

1. **Bounded work-diary traffic** (`src/lib/limit.ts`, `src/api/workDiary.ts`, `src/api/client.ts`). A FIFO `createLimiter(max)`. `fetchWorkDiary` keeps its signature but runs its body (token plus `apiGet`) inside one module-level limiter of `WORK_DIARY_CONCURRENCY = 4`, app-wide. Concurrent identical calls (same auth generation, environment, assignment and date) share one in-flight promise, with no time-based memo. Spec 01 created `authGeneration` but no reader, so this spec adds the read-only `getAuthGeneration()` export to `client.ts`.
2. **A pure refresh planner** (`src/lib/requestsPlanner.ts`). It decides which dates to fetch from the stored records: today always; yesterday after 60 min; PENDING days in the 3-week window after 15 min; the current week and unsettled closed-week days once per calendar day; unsettled older days after 6 h; and the whole 3-week window when forced. Settled days are never refetched automatically. A typical wake makes **1-2** `fetchWorkDiary` calls instead of 15-21.
3. **The store** (`src/lib/requestsStore.ts`). It reads without throwing and classifies the result as `ok`, `empty` or `unreadable`. Writes are serialized, merge per date, prune to 24 weeks, check the owner before writing and verify it afterwards. It also builds the view, including view-only carry-forward of prior entries for dates that have no record. `clearAll()` wipes the key.
4. **A store-backed queryFn** (`src/hooks/useMyRequests.ts`). It reads the store, plans, fetches, and writes only the days that succeeded. A failed day keeps its record byte for byte. When every planned day fails, the queryFn **throws**, so TanStack keeps the previous data and retries. On a cold cache it first seeds the cache from the store ("seed-then-throw"). Missing credentials throw `AuthError(NO_CREDENTIALS)` after the store read. The view carries `ownerKey`, `staleDates` and `updatedAt`.
5. **Hook, env switch, docs.** `useMyRequests` uses spec 01's `shouldRetryQuery`. A pure `selectMyRequests` applies the owner and dev-mock display rule, and `toRequestsError` maps a thrown error to `'auth' | 'network'`. The env switch in `app/modal.tsx` removes `['myRequests']` before `invalidateQueries()`. `docs/ARCHITECTURE.md` documents the store.

JS-only. No new dependencies, and no changes to `package.json`, `app.json`, `eas.json` or native files.

---

## Clarification Decisions (Step 3, autonomous)

spec-research.md has no open questions. Checking it against the code at `c1b36c2` (spec 01 done) raised these points. Each was decided here:

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| C1 | Does `getAuthGeneration()` exist yet? Research specifies it as a new export of this spec (Decision 6). | **No, it is confirmed absent, so this spec adds it.** Spec 01 added `let authGeneration` (`client.ts:32`) and bumps it in `invalidateAuthToken()` (`:184`), but exports no reader, and spec 01 explicitly deferred the export (spec 01 Out Of Scope #1). This spec adds `export function getAuthGeneration(): number { return authGeneration; }`. Nothing else in `client.ts` changes. | The in-flight sharing key needs the generation (research Decision 6). `workDiary.ts` already imports from `client.ts`, so the reverse import that a `map.clear()` would need would create a cycle. |
| C2 | Which spec 01 names does this spec use? | The real exports: `shouldRetryQuery`, `isRetryableError`, `NO_CREDENTIALS`, `AUTH_HTML_500`, `AuthError`, `NetworkError` (`src/api/errors.ts`); `getAuthToken`, `apiGet` (`src/api/client.ts`); `toAuthCreds` (`src/api/authCreds.ts`). `fetchWorkDiary` keeps forwarding `toAuthCreds(credentials, useQA)` as the **last** `apiGet` argument. | The static creds guard (`src/__tests__/api/creds-wiring.test.ts` FR4.g.3) scans `workDiary.ts`. Wrapping the body in the limiter must not drop or reorder that argument. |
| C3 | Which test files are affected by the new `getAuthGeneration` call inside `fetchWorkDiary`? | Only `__tests__/api/work-diary.test.ts`. It factory-mocks `../../src/api/client` and drives the real `workDiary.ts`, so it gains `getAuthGeneration: jest.fn(() => 0)`. | A grep found no other suite that mocks `api/client` with a factory and uses the real `workDiary` (`auth-api`, `use-approval-items`, `use-role-refresh`, `auth-screens`, `wrappers-creds`, `team`, `hooksCredsForwarding`, `useTeamRoster` never touch it). `use-ai-data`, `stale-closure-iso`, `crossoverData`, `useTeamAggregateData` and `useMyRequests` mock `api/workDiary` as a whole. |
| C4 | Where do the date helpers live? | `todayLocal`, `formatLocalDate`, `addDays` and `dateRange` move from `useMyRequests.ts:17-45` into `requestsPlanner.ts` and are exported for spec 05. `addDays` switches to a **noon anchor** (`T12:00:00`), like the existing week math. `localDateOf(iso)` returns the local `YYYY-MM-DD` of an ISO timestamp, or `null` if it does not parse. | One owner for the date math. The noon anchor rules out a DST transition at local midnight. |
| C5 | How is a malformed or future `fetchedAt` handled? | `Date.parse(fetchedAt)` is NaN → the record counts as **never fetched** (the `daily` or `unsettled-old` rules may then fire, and the TTL rules use age = ∞). Age `nowMs − fetchedMs < 0` (clock skew) counts as fresh for every TTL rule, and `daily` compares local dates, so a future date is never `< today`. | From the research Test Plan. It also avoids refetch loops after a clock change. |
| C6 | Log events. | `log.warn('requests.refresh_failed', { plannedDays, failedDays, kind })` on total failure; `log.warn('requests.store_write_failed', {})` when `setItem` throws; **added:** `log.warn('requests.store_read_failed', {})` when `getItem` throws (`unreadable`). No event on success. | The research lists the first two. A read failure silently stops every write, so it needs a trace too. All meta keys pass `src/lib/redact.ts` (no denied substrings and no `id` suffix), and values are numbers or the literals `'auth'`/`'network'`. |
| C7 | What if `loadConfig()` throws inside `updateRequestsStore`? | **Fail closed.** If the pre-check throws: no write, return `null`. If the post-write verify throws: `removeItem(REQUESTS_STORE_KEY)` and return `null`. If that `removeItem` throws as well, swallow it and log `requests.store_write_failed`. `updateRequestsStore` never rejects. | The sign-out wipe is the contract. A store lost this way can be fetched again (spec 05). |
| C8 | Serialization mechanics. | A module-level `writeChain: Promise<unknown>`. Each call does `const run = writeChain.then(task, task); writeChain = run.then(noop, noop); return run;`, so one failed link never blocks later writes. | No lost update between the queryFn and spec 05's backfill (research Decision 7). |
| C9 | Is the forced refresh wired to the hook's `refetch` here? | **No.** This spec exports `markMyRequestsForcedRefresh()` and the queryFn consumes the flag. The hook keeps returning TanStack's `refetch`, and spec 04 wires `refetch` → mark + refetch. | Research Decision 8, with UI ownership in spec 04. It keeps this spec free of UI behaviour. |
| C10 | `selectMyRequests` shape. | `selectMyRequests(data: MyRequestsData \| undefined, config: CrossoverConfig \| null \| undefined, queryError: unknown): { entries; error; staleDates; updatedAt }`. The hook adds `isLoading` and `refetch`. | It is testable without `renderHook`, which this repo avoids (`useMyRequests.test.ts:4-8`). |
| C11 | The type of the queryFn context. | `(ctx?: { client: QueryClient; queryKey: readonly unknown[] }) => Promise<MyRequestsData>`. TanStack's `QueryFunctionContext` is structurally assignable to it (`client` exists in query-core 5.104.5). | Existing `buildMyRequestsQueryFn(x)()` calls keep compiling (critique amendment 1). |
| C12 | Owner coercion. | `owner = { assignmentId: config.assignmentId, useQA: config.useQA === true }` and `ownerKey` is `assignmentId + '\|' + (useQA ? 'qa' : 'prod')`. | `CrossoverConfig.useQA` is a `boolean` (`src/types/config.ts:17`). The strict comparison keeps a malformed persisted config from creating a third owner. |
| C13 | FR count. | 5 FRs: limiter and sharing, planner, store, queryFn, then hook / env switch / docs. | Within the 3-5 guidance. Each FR maps to one test file or block. |
| C14 | Step 4/6 drafting tool. | The sections were drafted directly by the spec author. This sub-agent has no Agent tool, and the four draft prompts only restate spec-research.md, which was already fully read. | It is a process deviation, not a content one. The coherence and QC checks still run (Steps 6, 9 and 10). |
| C15 | Where does `REQUESTS_RETENTION_WEEKS` live? Research puts it in `requestsStore.ts`. | **It is defined in `requestsPlanner.ts`, and `requestsStore.ts` re-exports it**, so `import { REQUESTS_RETENTION_WEEKS } from '…/requestsStore'` still works as the research contract says. | `requestWindows` (planner) needs it for `retentionStart`, and the store imports the planner at runtime (`pruneDays`, `buildRequestsView`). If the constant lived in the store, the two modules would import each other at runtime. With this split, the planner imports only types from the store. |

---

## Out Of Scope

1. **Requests screen UI: the "Older" section, the freshness note, the forced pull-to-refresh wiring, restore-aware loading.** **Deferred to [04-requests-history-ui](../04-requests-history-ui/spec-research.md).** This spec only produces `staleDates`, `updatedAt` and `markMyRequestsForcedRefresh`. **Release coupling:** 02 can be merged alone but must not be *released* without 04. Otherwise stored entries older than the window land in the unbounded "2 Weeks Ago" bucket (`app/(tabs)/approvals.tsx:98`).
2. **Backfill of weeks older than the 3-week window.** **Deferred to [05-requests-backfill](../05-requests-backfill/spec-research.md).** This spec exports what spec 05 needs (`updateRequestsStore`, `requestWindows`, `buildRequestsView`, `composeRequestsView`, `addDays`), and the planner never plans a missing older day.
3. **The persist predicate that drops the `'dev-mock'` view, and keep-last-good for hours, AI, payments, team and weekly history.** **Deferred to [03-keep-last-good](../03-keep-last-good/spec-research.md).** This spec only stamps `ownerKey: 'dev-mock'` (cross-spec contract). Until 03 lands, the default predicate persists the mock view, which is harmless because of the FR5 display rule.
4. **A shared per-day work-diary record store for `useAIData` / `useHistoryBackfill`.** **Descoped from this feature, tracked as follow-up F7 (FEATURE.md Out of Scope).** This spec's in-flight sharing already removes the concurrent duplicate of today's diary.
5. **Widget "My Requests" wiring** (`app/(tabs)/_layout.tsx:68` passes `undefined`). **Descoped, follow-up F1.**
6. **Changing same-memo grouping** (`groupSlotsIntoEntries`). **Descoped, follow-up F5.** The store keeps today's grouping, and each day is regrouped on every successful fetch.
7. **A priority lane in the limiter, or a TTL memo of results.** **Descoped** (research Decision 6). FIFO is enough when the planner asks for 1-2 days, and a memo would add a second freshness rule.
8. **Importing the persisted 1.1/1.2.0 blob into the store.** **Descoped** (research Decision 5). Only server-confirmed days are stored. The blob is carried forward in the view only.
9. **Raising `staleTime` or the persister's `maxAge` / `gcTime`.** **Descoped.** SC4 pins `staleTime: 60_000`, and the planner makes focus storms cheap.
10. **Any OTA, `eas`, `asc.js`, version bump, push or PR.** **Descoped.** These are release mechanics (`docs/RELEASING.md`).

---

## Functional Requirements

### FR1: Bounded work-diary traffic (limiter + in-flight sharing)

App-wide, at most 4 work-diary requests are in flight, and concurrent identical requests download once.

**Requirements:**
- `src/lib/limit.ts`: `export type Limiter = <T>(task: () => Promise<T>) => Promise<T>` and `export function createLimiter(max: number): Limiter`.
  - A FIFO queue. At most `max` tasks run at once.
  - A task that rejects, or throws synchronously, releases its slot and rejects only its own promise.
  - Each caller gets its own task's result.
- `src/api/client.ts`: add `export function getAuthGeneration(): number`, which returns `authGeneration`. Nothing else in `client.ts` changes.
- `src/api/workDiary.ts`:
  - `export const WORK_DIARY_CONCURRENCY = 4`. A module-level `workDiaryLimiter = createLimiter(WORK_DIARY_CONCURRENCY)` and a `workDiaryInFlight: Map<string, Promise<WorkDiarySlot[]>>`.
  - `fetchWorkDiary(assignmentId, date, credentials, useQA)` (signature unchanged) computes ``key = `${getAuthGeneration()}|${useQA ? 'qa' : 'prod'}|${assignmentId}|${date}` ``.
  - **Hit:** it returns the stored promise itself. There is no new request, no limiter slot and no `getAuthToken` call.
  - **Miss:** `p = workDiaryLimiter(() => body())`, where `body` is the existing `getAuthToken` + `apiGet(…, toAuthCreds(credentials, useQA))`. It stores `p` and attaches `p.then(clear, clear)`, where `clear` deletes the key only if the map still holds `p`. It returns `p`.
  - There is no time-based memo: after `p` settles, the next call fetches again.
  - JSDoc: the resolved array is shared between joined callers and must be treated as read-only.
  - `export function __resetWorkDiaryInFlightForTests(): void` clears the map.

**Success Criteria:**
- [ ] `createLimiter(4)` with 10 deferred tasks: exactly 4 have started. Resolving one starts the 5th, and every task's promise resolves with its own value.
- [ ] `createLimiter(1)` runs tasks one at a time, in FIFO start order.
- [ ] A task that rejects, or throws synchronously inside an async fn, rejects only its own promise and frees its slot (the next queued task starts).
- [ ] 10 concurrent `fetchWorkDiary` calls for 10 distinct dates: at most 4 `apiGet` calls are pending at any time, and all 10 resolve.
- [ ] 2 concurrent calls with the same assignment, date and `useQA`: `apiGet` ×1 and `getAuthToken` ×1, and both resolve to the **same** array (`toBe`).
- [ ] Concurrent calls for different dates, or for the same date with `useQA` `false` and `true`: 2 `apiGet` calls.
- [ ] Call, await, call again with the same key: 2 `apiGet` calls (no memo).
- [ ] Generation reset: a call is pending, `getAuthGeneration` now returns 1, and the same key is called again → a 2nd `apiGet`. Resolving the first does not delete the second entry, so a 3rd concurrent call joins the 2nd (total stays 2).
- [ ] Joins bypass the queue: with 4 distinct calls in flight and a 5th queued, a join of call #2 resolves as soon as #2 does. After everything settles, `apiGet` has exactly 5 calls.
- [ ] A shared rejection (`NetworkError`) rejects both callers with the same error. The next call fetches again, and no unhandled rejection is reported.
- [ ] `getAuthGeneration()` returns 0, then 1 after `invalidateAuthToken()` (real `client.ts`).
- [ ] `creds-wiring.test.ts` stays green (the `apiGet` in `workDiary.ts` still passes `toAuthCreds(…)` last).

---

### FR2: Pure refresh planner

`src/lib/requestsPlanner.ts` decides what can still change. It has no I/O and is fully deterministic given `today` and `nowMs`.

**Requirements:**
- Constants: `PENDING_TTL_MS = 15 * 60_000`, `RECENT_TTL_MS = 60 * 60_000`, `OLD_UNSETTLED_TTL_MS = 6 * 60 * 60_000`, and `REQUESTS_RETENTION_WEEKS = 24` (it mirrors `WEEKLY_HISTORY_MAX`). It is defined here and re-exported by `requestsStore.ts` (C15). The store imports the planner at runtime (`requestWindows`), and the planner imports only *types* from the store, so there is no runtime import cycle.
- Date helpers (C4), exported: `todayLocal()`, `formatLocalDate(d)`, `addDays(date, n)` (noon-anchored), `dateRange(start, end)` (inclusive, ascending), `localDateOf(iso): string | null`.
- `requestWindows(today): RequestWindows`:
  - `currentMonday = getWeekStartDate(today@noon)`;
  - `yesterday = addDays(today, −1)`;
  - `catchUpStart = getWeekStartDate(currentMonday@noon − 14 days)`;
  - `retentionStart = addDays(currentMonday, −7 × (REQUESTS_RETENTION_WEEKS − 1))`.
- `tuesdayAfter(date) = addDays(getWeekStartDate(date@noon), 8)`.
- `isDaySettled(date, entries, fetchDay) = entries.every(e => e.status !== 'PENDING') && fetchDay >= tuesdayAfter(date)`.
- `planRequestRefresh({ today, nowMs, days, force }): RefreshPlan`. For each date in `retentionStart..today`, it picks the **first** reason that applies (research Decision 3). `age = nowMs − Date.parse(rec.fetchedAt)`; per C5, an unparseable `fetchedAt` counts as no fetch day and age ∞, and a negative age counts as fresh. `fetchDay = localDateOf(rec.fetchedAt)`.
  1. `date === today` → `'today'`.
  2. `force` and `date >= catchUpStart` → `'forced'`.
  3. `date >= catchUpStart`, the record has a PENDING entry, and `age >= PENDING_TTL_MS` → `'pending-ttl'`.
  4. `date === yesterday`, a record exists, and `age >= RECENT_TTL_MS` → `'recent-ttl'`.
  5. `date >= currentMonday` and (no record, or `fetchDay === null`, or `fetchDay < today`) → `'daily'`.
  6. `catchUpStart <= date < currentMonday`, (no record or `!settled`), and (no record, or `fetchDay === null`, or `fetchDay < today`) → `'daily'`.
  7. `retentionStart <= date < catchUpStart`, a record exists, `!settled`, and `age >= OLD_UNSETTLED_TTL_MS` → `'unsettled-old'`.
  8. Otherwise skip. A missing older day is left to spec 05.
- Output: `dates` unique, sorted **descending**, plus `reasons[date]` for each.

**Success Criteria:**
- [ ] Empty store: Monday 2026-03-09 → 15 dates (2026-02-23..2026-03-09), with `today` → `'today'` and the rest `'daily'`. Wednesday → 17 dates; Sunday → 21.
- [ ] Every window day fetched 5 min ago today, no PENDING → `['2026-03-09']` only.
- [ ] Yesterday fetched 61 min ago → `'recent-ttl'`; 59 min ago → not planned.
- [ ] A current-week day (not today or yesterday) fetched 3 h ago today → not planned. Fetched on a previous calendar day → `'daily'`.
- [ ] A PENDING day in `catchUpStart..today`: fetched 16 min ago → `'pending-ttl'`; 14 min ago → not planned.
- [ ] A last-week day with no PENDING, fetched this Monday, with today Tuesday → `'daily'`. Stored `settled: true` → not planned.
- [ ] `force: true` → every date in `catchUpStart..today`, as `'forced'` (today keeps `'today'`), settled days included. No date before `catchUpStart` is forced.
- [ ] A day before `catchUpStart`: settled → never; `!settled`, fetched 7 h ago → `'unsettled-old'`; 5 h ago → not planned; no record → not planned. A day before `retentionStart` is never planned.
- [ ] Wake budget, one `it` per row. Each store is built as the previous evening's run left it (every window day recorded, `settled` from `isDaySettled`, no PENDING). Monday first wake → **8**; Tuesday → **9**; Wednesday → **3**; Sunday → **7**; the same day +5 min → **1**; +90 min → **2**.
- [ ] `fetchedAt` in the future → fresh for all TTL rules (only `'today'` fires). `fetchedAt: 'garbage'` → treated as never fetched.
- [ ] DST: `requestWindows` gives correct Mondays across 2026-03-08 and 2026-11-01. `tuesdayAfter('2026-10-25') === '2026-10-27'` and `tuesdayAfter('2026-11-01') === '2026-11-03'`.
- [ ] `isDaySettled`: a last-week day with only APPROVED/REJECTED entries, `fetchDay` = this Tuesday → `true`, this Monday → `false`; with PENDING → `false`; any current-week day → `false`; an empty closed-week day fetched on or after its `tuesdayAfter` → `true`.
- [ ] Source check: `requestsPlanner.ts` contains `getWeekStartDate` (it takes over SC9).

---

### FR3: The `my_requests_v1` store

`src/lib/requestsStore.ts` owns the key. Every record in it came from a successful server fetch.

**Requirements:**
- Exports: `REQUESTS_STORE_KEY = 'my_requests_v1'`, `REQUESTS_STORE_VERSION = 1 as const`, `REQUESTS_RETENTION_WEEKS` (re-exported, see below), and the types `RequestsStoreOwner`, `StoredRequestDay`, `MyRequestsStore` and `RequestsStoreRead` (exactly as in research Interface Contracts).
- `readRequestsStore(owner): Promise<RequestsStoreRead>`. It never throws.
  - `getItem` throws → `{status: 'unreadable'}`, and it logs `requests.store_read_failed`.
  - The key is absent, the JSON is corrupt, the shape is wrong (no `days` object), `version !== 1`, or `owner.assignmentId` / `owner.useQA` differ → `{status: 'empty'}`.
  - Otherwise `{status: 'ok', store}`.
- `updateRequestsStore(owner, fetched: StoredRequestDay[], today): Promise<MyRequestsStore | null>`. It is serialized through the module write chain (C8) and never rejects. Steps:
  1. Re-read. `unreadable` → return `null` without writing.
  2. `base = ok ? store.days : {}`, then `days[d.date] = d` for each fetched day.
  3. `pruneDays(days, today)`.
  4. Pre-check: `loadConfig()` must return a config with the same `assignmentId` as `owner`, and `(config.useQA === true) === owner.useQA`. If it is null, different, or throws → return `null` without writing (C7).
  5. `setItem(KEY, JSON.stringify({version: 1, owner, days}))`. If it throws → `log.warn('requests.store_write_failed', {})` and return the merged store (not persisted).
  6. Post-verify: call `loadConfig()` again. If it is null, different, or throws → `removeItem(KEY)` and return `null`.
- `pruneDays(days, today)` drops `date < retentionStart`.
- `buildRequestsView(days, today): { entries; updatedAt }`:
  - flatten the days in `retentionStart..today`, stable-sorted by `date` descending, keeping each day's in-day order;
  - `updatedAt` = the max `fetchedAt` among days in `catchUpStart..today`, or `null`.
- `composeRequestsView(days, today, prior: MyRequestsData | undefined): ManualRequestEntry[]`:
  - `buildRequestsView(days, today).entries`, plus `prior?.entries.filter(e => !days[e.date] && e.date >= retentionStart)`;
  - stable-sorted by date descending;
  - the caller passes `prior` only for the same owner or a legacy view.
- `src/store/config.ts` `clearAll()`: add `'my_requests_v1'` to the `multiRemove` literal list (19 keys).

**Success Criteria:**
- [ ] An update with 2 days, then a read → `ok` with both days, field for field. A day with `entries: []` survives the round trip.
- [ ] Merge: stored `{d1, d2}` plus fetched `{d2'}` → `{d1, d2'}`.
- [ ] Prune: a day before `retentionStart` already in the store is gone after the next update. `buildRequestsView` ignores such days even before any write.
- [ ] Owner mismatch (another `assignmentId`, or the other `useQA`) → `empty`. An update then holds only the new owner's fetched days.
- [ ] `version: 2` → `empty`. Corrupt JSON → `empty`, and a following update writes.
- [ ] Two concurrent `updateRequestsStore` calls with different days → both days are persisted (no lost update). A rejected link (`setItem` throws once) does not block the next write.
- [ ] `getItem` throws → read is `unreadable` and `log.warn('requests.store_read_failed')` fires; `updateRequestsStore` returns `null` and `setItem` is never called.
- [ ] `setItem` throws → returns the merged store and `log.warn('requests.store_write_failed', {})` fires.
- [ ] `loadConfig` → `null`, another `assignmentId`, or a throw at the pre-check → `null`, and no `setItem`.
- [ ] Sign-out race: `loadConfig` returns the owner for the pre-check, then `null` for the verify → `null`, `removeItem('my_requests_v1')` is called, and `getItem('my_requests_v1')` is `null` afterwards.
- [ ] Real `clearAll()` (`jest.requireActual`) after a write → `getItem('my_requests_v1')` is `null`.
- [ ] `buildRequestsView`: entries are sorted descending across days with in-day order preserved, and `updatedAt` is the max `fetchedAt` within the catch-up window (a newer `fetchedAt` on an older backfilled day is ignored).
- [ ] `composeRequestsView`: a prior entry whose date has no record is kept. A prior entry whose date has a record (even `entries: []`) is dropped. A prior entry older than `retentionStart` is dropped.
- [ ] `__tests__/config-store.test.ts` and `src/__tests__/store/config.test.ts`: `toHaveLength(19)` and `toContain('my_requests_v1')`.
- [ ] Source check: `requestsStore.ts` contains `sort` (it takes over SC12).

---

### FR4: Store-backed queryFn: merge on success, throw on total failure

`buildMyRequestsQueryFn(todayOverride?, nowOverride?)` returns `(ctx?) => Promise<MyRequestsData>`. It follows the research QueryFn algorithm, steps 1-13.

**Requirements:**
- `src/types/requests.ts`: add `MyRequestsData { entries; error: 'auth' | 'network' | null; staleDates?; updatedAt?; ownerKey? }`, and add optional `staleDates?` / `updatedAt?` to `UseMyRequestsResult`. The old blob `{entries, error}` must still type-check.
- `today = todayOverride ?? todayLocal()`. `nowMs = nowOverride?.() ?? (todayOverride ? Date.parse(today + 'T12:00:00') : Date.now())`. Both are captured once per run.
- `config = await loadConfig()`:
  - `config?.devManagerView` → `{ entries: [...MOCK_MY_REQUESTS], error: null, ownerKey: 'dev-mock' }`. No store I/O, no credentials read, and the force flag is **not** consumed.
  - `!config || !config.assignmentId` → `{ entries: [], error: null }`.
- Read the store (owner per C12). Then `prior = getQueryData(ctx.queryKey)` if its `ownerKey` is `undefined` or equals `ownerKey`, else `undefined`.
- `seedAndThrow(err, staleDates)`: if `ctx`, `prior === undefined` and the store has days, call `ctx.client.setQueryData(ctx.queryKey, { ...buildRequestsView(baseDays, today), error: null, staleDates, ownerKey }, { updatedAt: Date.parse(view.updatedAt ?? '') || undefined })`. Then throw `err`.
- Credentials are read **after** the store read. If `loadCredentials()` throws → `seedAndThrow(thatError, [])`. If it returns `null` → `seedAndThrow(new AuthError(401, 'Credentials unavailable', { errorCode: NO_CREDENTIALS }), [])`.
- `plan = planRequestRefresh({ today, nowMs, days: baseDays, force: consumeForcedRefresh() })`, then `Promise.allSettled(plan.dates.map(d => fetchWorkDiary(assignmentId, d, credentials, useQA)))`.
- A fulfilled **array** (including `[]`) becomes a `StoredRequestDay`: `fetchedAt = new Date(nowMs).toISOString()`, `entries = groupSlotsIntoEntries(value, date)`, `settled = isDaySettled(date, entries, today)`. A rejection, or a fulfilled non-array (an empty body, `parseBody` → `undefined`), is a failed date.
- **Total failure** (no fetched day):
  - `err` = the first `AuthError` whose `errorCode !== AUTH_HTML_500`, else the first rejection reason, else `new NetworkError('Empty work diary response')`;
  - `log.warn('requests.refresh_failed', { plannedDays, failedDays, kind: toRequestsError(err) })`;
  - `seedAndThrow(err, plan.dates)`. Nothing is written.
- **Otherwise:** `stored = read.status === 'unreadable' ? null : await updateRequestsStore(owner, fetched, today)`, and `days = stored?.days ?? { ...baseDays, ...byDate(fetched) }`. Return `{ entries: composeRequestsView(days, today, prior), error: null, staleDates: failedDates (desc), updatedAt: buildRequestsView(days, today).updatedAt, ownerKey }`.
- `export function markMyRequestsForcedRefresh(): void` sets a module-level one-shot flag. `consumeForcedRefresh()` (private) reads it and resets it.

**Success Criteria:**
- [ ] First run on an empty store → every planned day is stored, including empty days. The existing FR4.1-FR4.5, CH.1-CH.5 tests pass unchanged, given `beforeEach(AsyncStorage._reset)`.
- [ ] Wake budget end to end (`describe('DD2 — wake budget')`, real planner and store, `fetchWorkDiary` → `[]`):
  - Tue 2026-10-20 21:00, empty store → 16 calls;
  - Wed 2026-10-21 08:00 → 3 calls (`['2026-10-21','2026-10-20','2026-10-19']`);
  - 08:05 → 1 call (`['2026-10-21']`);
  - 09:30 → 2 calls (`['2026-10-21','2026-10-20']`);
  - after one 21:00 run each day Wed-Sun, Mon 2026-10-26 08:00 → 8 calls;
  - a comment records the old code's 17 calls per Wednesday run.
- [ ] A successful day that now returns no manual slots removes that day's old entry from both the store and the view.
- [ ] Partial failure: Mon, Tue and Wed are stored; Mon and Wed fail; Tue flips PENDING → APPROVED. Result: all 3 entries, Tue `APPROVED`, `staleDates = ['2026-03-11','2026-03-09']`, `error: null`. The failed dates' records are `JSON.stringify`-equal to before.
- [ ] A planned date that resolves `undefined` is in `staleDates` and keeps its old record. A date that resolves `[]` is stored with `entries: []`. If every date resolves `undefined`, the queryFn rejects with `NetworkError` and nothing is written.
- [ ] **A failed refresh never changes stored data:** after a good run, every fetch rejects → the queryFn rejects, `getItem('my_requests_v1')` is string-equal to before, and `setItem` was never called with `'my_requests_v1'`.
- [ ] Total failure: `NetworkError` → rejects with that `NetworkError`; `AuthError(401)` → rejects with that `AuthError` (the rewritten FR4.6). `log.warn('requests.refresh_failed', …)` fires once with numeric `plannedDays` / `failedDays` and `kind`.
- [ ] Credentials `null` with a config → rejects `AuthError` with `errorCode === 'NO_CREDENTIALS'`. With a cold `ctx` cache and a populated store, `getQueryData(key).entries` holds the stored entries first. If `loadCredentials` throws → rejects with that error, seeded the same way.
- [ ] Carry-forward: a failed day with no record but present in `ctx` prior data → in the view, and not in the store. A failed day with no record and no prior → absent.
- [ ] Upgrade from a 1.1 blob (`{entries: 5 incl. 2 before catchUpStart, error: null}`, no `ownerKey`, empty store), all fetches `[]` → the 2 older entries remain, the 3 in-window ones are gone, and the store has no record for the 2 older dates. With a total failure instead → rejects, and `getQueryData` is the legacy blob, unchanged.
- [ ] Owner stamp: prior `'79996|prod'` with config `useQA: true` → nothing carried, and the result has `ownerKey: '79996|qa'`. Prior `'dev-mock'` with the toggle off → nothing carried; with a populated store and a total failure, the cache is seeded from the store (mock entries gone).
- [ ] `devManagerView` → the mock entries with `ownerKey: 'dev-mock'`, no `setItem('my_requests_v1')`, no `loadCredentials` call, and the force flag still set (the next real run is forced).
- [ ] `markMyRequestsForcedRefresh()` then a run → every date in `catchUpStart..today` is fetched. The next run is back to the normal plan.
- [ ] `getItem` throws → the run still resolves with the fetched days plus the prior carry-forward, and `setItem` is never called.
- [ ] No config → `{entries: [], error: null}` and no fetch.
- [ ] QueryClient level (`describe('DD2 — cache semantics')`, real `QueryClient`, `retry: false`):
  - (a) 3 cached entries, then an all-fail `NetworkError` refetch → data unchanged and status `'error'`;
  - (c) the same with `AuthError`;
  - (b) a partial failure via `fetchQuery` → updated data with `staleDates`;
  - seed-then-throw on an empty client with a 3-entry store → `fetchQuery` rejects, `getQueryData(key).entries.length === 3`, and status `'error'`.

---

### FR5: Hook, env switch and documentation

**Requirements:**
- `useMyRequests()`:
  - `useQuery({ queryKey: ['myRequests', assignmentId], queryFn: buildMyRequestsQueryFn(), staleTime: 60_000, enabled: !!assignmentId, retry: shouldRetryQuery })`;
  - returns `{ ...selectMyRequests(data, config, queryError), isLoading, refetch }`.
- `export function toRequestsError(err: unknown): 'auth' | 'network' | null`: `null` for a falsy `err`; `'auth'` for an `AuthError` whose `errorCode !== AUTH_HTML_500`; otherwise `'network'`.
- `export function selectMyRequests(data, config, queryError)`:
  - `entries`: `data` undefined → `[]`; `data.ownerKey` undefined (legacy) or equal to the current `ownerKey` → `data.entries`; `'dev-mock'` → `data.entries` only if `config?.devManagerView === true`, else `[]`; any other value → `[]`.
  - `error: toRequestsError(queryError) ?? data?.error ?? null`, `staleDates: data?.staleDates ?? []`, `updatedAt: data?.updatedAt ?? null`.
- `app/modal.tsx` `handleSwitchEnvironment`: inside the existing `startTransition`, after `setQueryData(['config'], newConfig)` and **before** `invalidateQueries()`, call `queryClient.removeQueries({ queryKey: ['myRequests'] })`. Nothing else changes.
- `docs/ARCHITECTURE.md`:
  - §3.2: a `my_requests_v1` row (shape, writer, reader, wiped by `clearAll`);
  - §3.3: the `['myRequests', assignmentId]` row becomes "store-backed view, staleTime 60 s, `shouldRetryQuery`";
  - §4: a sub-section on the requests refresh: planner rules, merge on success only, throw on total failure (seed-then-throw), the `fetchWorkDiary` limiter of 4 with in-flight sharing, and env-switch removal;
  - §8.8: requests no longer depend on the persisted cache for history.
- Static tests in `useMyRequests.test.ts` are re-pointed: SC9 → the source contains `planRequestRefresh` (and the `requestsPlanner.ts` source contains `getWeekStartDate`); SC12 → `requestsStore.ts` contains `sort`. A new static check asserts `retry: shouldRetryQuery`.

**Success Criteria:**
- [ ] `selectMyRequests`:
  - legacy blob → its entries; matching `ownerKey` → its entries;
  - a `'79996|prod'` blob with a QA config → `[]`;
  - `'dev-mock'` with `devManagerView: true` → the mocks; with the toggle false or absent, or `config` null → `[]`;
  - `staleDates` and `updatedAt` default to `[]` and `null`.
- [ ] `toRequestsError`: `AuthError(401)` → `'auth'`; `AuthError` with `AUTH_HTML_500` → `'network'`; `NetworkError` → `'network'`; `ApiError(503)` → `'network'`; `null` → `null`. `selectMyRequests` prefers the thrown error over `data.error`.
- [ ] Source: `useMyRequests.ts` matches `retry:\s*shouldRetryQuery`, still matches SC1-SC8, SC10, SC11 and SC13-SC16, and no longer contains `retry: 2`.
- [ ] `app/__tests__/modal-auth-cache.test.tsx` DD2.envSwitch: the `handleSwitchEnvironment` body contains `removeQueries({ queryKey: ['myRequests'] })`, and its index is before `invalidateQueries(`.
- [ ] `DD2 — env switch` (QueryClient level):
  - a prod view (`'79996|prod'`, 3 entries) plus a prod store, then `removeQueries(['myRequests'])` + `invalidateQueries()`, then a QA config with every fetch failing → `fetchQuery` rejects and `getQueryData(['myRequests','79996'])` is `undefined`;
  - the same with a legacy blob → `undefined`;
  - a control without `removeQueries` shows the legacy blob would have been kept as a prior.
- [ ] `docs/ARCHITECTURE.md` contains `my_requests_v1`, `planRequestRefresh`, `WORK_DIARY_CONCURRENCY` (or "4 in flight") and `removeQueries`.
- [ ] `app/(tabs)/__tests__/approvals.test.tsx` passes unchanged.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `src/hooks/useMyRequests.ts` | The queryFn and hook being rewritten; its date helpers move to the planner |
| `src/lib/requestsUtils.ts:42-94` | `groupSlotsIntoEntries(slots, date)`: one stored day's `entries` |
| `src/lib/approvals.ts:87-96` | `getWeekStartDate(date)`: local Monday, never `toISOString` |
| `src/lib/weeklyHistory.ts:55-105` | The merge-never-replace / 24-week retention template |
| `src/api/client.ts:28-33,113-185` | `authGeneration`, `getAuthToken`, `invalidateAuthToken` (spec 01) |
| `src/api/errors.ts:12-21,101-116` | `AUTH_HTML_500`, `NO_CREDENTIALS`, `isRetryableError`, `shouldRetryQuery` (spec 01) |
| `src/api/authCreds.ts` | `toAuthCreds`, which stays the last `apiGet` arg in `workDiary.ts` |
| `src/__tests__/api/creds-wiring.test.ts` | The static guard that scans `workDiary.ts` |
| `src/store/config.ts:52-102` | `loadConfig`, `loadCredentials`, `clearAll` (literal key list) |
| `src/lib/log.ts`, `src/lib/redact.ts` | `log.warn(category, meta)`; meta key deny-list |
| `src/lib/devMock.ts:44-69` | `MOCK_MY_REQUESTS` (must never reach the store) |
| `app/modal.tsx:109-155` | `handleSwitchEnvironment` |
| `app/_layout.tsx:60-84,171-176` | Focus refetch, QueryClient defaults, persister `maxAge` 24 h |
| `node_modules/@tanstack/query-core/src/query.ts:961-991` | `setQueryData` during a fetch; `'error'` keeps `data` (the basis of seed-then-throw) |
| `__mocks__/@react-native-async-storage/async-storage.ts` | In-memory mock with `_reset()` |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/limit.ts` | create | `Limiter`, `createLimiter` (FR1) |
| `src/api/client.ts` | modify | `getAuthGeneration()` only (FR1) |
| `src/api/workDiary.ts` | modify | `WORK_DIARY_CONCURRENCY`, limiter, in-flight map, `__resetWorkDiaryInFlightForTests` (FR1) |
| `src/lib/requestsPlanner.ts` | create | TTL constants, date helpers, `requestWindows`, `tuesdayAfter`, `isDaySettled`, `planRequestRefresh`, types (FR2) |
| `src/lib/requestsStore.ts` | create | Key, version, retention, types, `readRequestsStore`, `updateRequestsStore`, `pruneDays`, `buildRequestsView`, `composeRequestsView` (FR3) |
| `src/store/config.ts` | modify | `'my_requests_v1'` in `clearAll` (FR3) |
| `src/types/requests.ts` | modify | `MyRequestsData`; optional `staleDates` / `updatedAt` on `UseMyRequestsResult` (FR4) |
| `src/hooks/useMyRequests.ts` | modify | Store-backed queryFn, `markMyRequestsForcedRefresh`, `toRequestsError`, `selectMyRequests`, `retry: shouldRetryQuery` (FR4, FR5) |
| `app/modal.tsx` | modify | `removeQueries({ queryKey: ['myRequests'] })` before `invalidateQueries()` (FR5) |
| `docs/ARCHITECTURE.md` | modify | §3.2, §3.3, §4, §8.8 (FR5) |
| `src/lib/__tests__/limit.test.ts` | create | FR1 limiter tests |
| `__tests__/api/work-diary.test.ts` | modify | `getAuthGeneration` in the client factory, `beforeEach(__resetWorkDiaryInFlightForTests)`, sharing/limit tests (FR1) |
| `src/__tests__/api/auth-generation.test.ts` | create | `getAuthGeneration` against the real `client.ts` (FR1) |
| `src/lib/__tests__/requestsPlanner.test.ts` | create | FR2 |
| `src/lib/__tests__/requestsStore.test.ts` | create | FR3 |
| `__tests__/config-store.test.ts`, `src/__tests__/store/config.test.ts` | modify | 18 → 19 keys, `toContain('my_requests_v1')` (FR3) |
| `src/hooks/__tests__/useMyRequests.test.ts` | modify | `_reset()` `beforeEach`, `jest.mock('../../lib/log')`, rewritten FR4.6, SC9/SC12 re-pointed, DD2 blocks (FR4, FR5) |
| `app/__tests__/modal-auth-cache.test.tsx` | modify | DD2.envSwitch source order (FR5) |

### Data Flow

```
Wake / focus (staleTime 60 s) / refetch
  → queryFn(ctx): today, nowMs; config = loadConfig()
      devManagerView         → {MOCK_MY_REQUESTS, ownerKey 'dev-mock'}  (no store, no creds, flag kept)
      no config/assignmentId → {entries: [], error: null}
  → read = readRequestsStore(owner)  ─ ok | empty | unreadable(log)
    baseDays; prior = same-owner-or-legacy getQueryData(ctx.queryKey)
  → creds = loadCredentials()  ─ throw/null → seedAndThrow(AuthError NO_CREDENTIALS | err)
  → plan = planRequestRefresh({today, nowMs, days: baseDays, force: consume flag})   (typically 1-2 dates)
  → Promise.allSettled(fetchWorkDiary × plan.dates)
        fetchWorkDiary: key gen|env|id|date → join in-flight, or limiter(4){ getAuthToken → apiGet(…, toAuthCreds) }
  → fetched = fulfilled arrays → StoredRequestDay; failed = rejected | non-array
      fetched = [] → log requests.refresh_failed → seedAndThrow(err)   (store untouched; TanStack keeps data, retries per shouldRetryQuery)
      else         → updateRequestsStore (serialized: re-read → merge → prune → owner pre-check → setItem → owner verify)
  → {entries: composeRequestsView(days, today, prior), error: null, staleDates, updatedAt, ownerKey}
  → hook: selectMyRequests(data, config, queryError) → screen

Sign-out: clearAll() multiRemove includes my_requests_v1; an in-flight write fails the pre-check or is removed by the verify.
Env switch: invalidateAuthToken() (gen++) → … → removeQueries(['myRequests']) → invalidateQueries().
```

### Edge Cases

| Case | Handling |
|------|----------|
| Sign-out mid-refresh | The owner pre-check skips the write. A write that races `clearAll()` is removed by the post-write verify (FR3). `queryClient.clear()` (`modal.tsx`) drops the view. |
| Env switch / another account | The store owner `{assignmentId, useQA}` mismatches → `empty`. The switch removes `['myRequests']`. `ownerKey` stops any foreign view from being shown or carried. The generation bump stops joins across the switch (FR1). |
| Manager preview toggle | The mock view is returned without store I/O. It is shown only while `devManagerView` is on, and is never a prior or a seed blocker. Spec 03 stops it being persisted. |
| Legacy 1.1/1.2.0 blob | It renders (optional fields default). Its entries are carried forward per date until the server gives that date a record. A total failure keeps the blob, because the queryFn throws. |
| Cold cache (> 24 h idle) + offline | Seed-then-throw shows the stored view with status `'error'`. |
| Empty response body (`undefined`) | Counts as a failed date and is never stored as an empty day. If every date is `undefined` → `NetworkError` (retryable). |
| AsyncStorage `getItem` throws | `unreadable`: no write this run. The view is built from the fetched days plus the prior, and `store_read_failed` is logged. |
| AsyncStorage `setItem` throws | The merged store is returned for the view, and `store_write_failed` is logged. The next run retries naturally, because the records stay old. |
| Ancient PENDING entry | `unsettled-old`, at most every 6 h. The 15-min rule is limited to the 3-week window. |
| Clock skew / malformed `fetchedAt` | Future = fresh; NaN = never fetched (C5). |
| Midnight rollover during a run | `today` and `nowMs` are captured once per run. |
| `useAIData` and My Requests ask for today at the same wake | Shared in-flight promise, one download (when the date strings match). |
| Manager team fan-out queued ahead | FIFO delay of about (queued ÷ 4) × latency. Accepted (research Decision 6). |
| Shipping 02 without 04 | Older stored entries would sit in "2 Weeks Ago". Merge-only; release with 04 (Out Of Scope #1). |

---

## Dependencies

### Internal
- Spec 01 (done): `authGeneration` (read via this spec's `getAuthGeneration`), `shouldRetryQuery`, `NO_CREDENTIALS`, `AUTH_HTML_500`, `toAuthCreds`, single-flight renewal (which keeps 4 slot holders from deadlocking: the mint uses `fetch` directly, not the limiter).
- Consumers: spec 03 (the `ownerKey === 'dev-mock'` literal), spec 04 (`staleDates`, `updatedAt`, `markMyRequestsForcedRefresh`, `toRequestsError`), spec 05 (`updateRequestsStore`, `requestWindows`, `buildRequestsView`, `composeRequestsView`, `addDays`, `REQUESTS_RETENTION_WEEKS`).

### External
- `@tanstack/react-query` 5.104.5 (already installed): `QueryFunctionContext.client`, `setQueryData` during a fetch, and the error reducer keeping `data`.
- `@react-native-async-storage/async-storage` (already installed).

### Assumptions
- PENDING → APPROVED/REJECTED are terminal (`docs/CROSSOVER_API.md:541`), and the timecard deadline is Sunday 23:59 UTC (`:694-696`).
- Backdating manual time into a closed week is undocumented. `force` (spec 04) is the escape hatch inside the window, and `unsettled-old` covers PENDING older days.
- `getAuthToken`/`mintAuthToken` never acquire a limiter slot, so the limiter cannot deadlock on a mint.
