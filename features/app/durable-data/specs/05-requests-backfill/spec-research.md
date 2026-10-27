# Spec Research: Requests Backfill

**Date:** 2026-10-22
**Author:** @jaime-alvarez-trilogy
**Spec:** `05-requests-backfill`

---

## Problem Context

The owner wants request history to build up beyond the current 3-week window. After spec 02 it does, but only going forward: the store keeps every day it has fetched for 24 weeks.

Existing users still lose everything older than "Monday two weeks ago" that was never fetched: the app never asked for those days (`src/hooks/useMyRequests.ts:76-82`), and the diagnosis ranks this rolling window as cause #2 for "old requests disappear" (critique correction 4).

**The server has that history.** The workdiaries endpoint takes any `date` (`src/api/workDiary.ts:23-28`), and production already reads that far back. `useHistoryBackfill` is mounted app-wide (`app/(tabs)/_layout.tsx:52`) and has been since 1.0 (`e7fb801`). Once per session it fetches the per-day work diaries of up to `BACKFILL_MAX = 23` past weeks (`src/hooks/useHistoryBackfill.ts:35`, week selection `:153-173`, the 7-day fetch per week `:190-205`) to compute the AI% / BrainLift history in `weekly_history_v2`. So the endpoint serves at least 23 weeks back. That is the same depth as this spec: `retentionStart` is the current Monday − 23 weeks (spec 02).

**If an old week does not come back,** nothing is invented:
- A day whose fetch rejects, or resolves without a slot array (an empty body makes `parseBody` return `undefined`, `src/api/client.ts:209-211`; `useHistoryBackfill` guards the same case with `Array.isArray`, `:209`), is **not stored**. It stays a gap, and a later session retries it.
- If no day of a week returns a slot array, the backfill **stops for the session without writing anything** (Decision 3, `'week-failed'`).
- A successful empty answer (`[]`) is different. It is **stored as an empty day** (`entries: []`, settled), which is correct: the server has confirmed that the day has no manual requests.

This spec adds a gentle, resumable, once-per-session backfill that walks back week by week to the retention start (24 weeks) and stores each week. The Older section from spec 04 then shows it.

The traffic must stay bounded and gentle:
- the user requirement says "not pulling everything old again and again";
- `useHistoryBackfill` already shows the Hermes memory-pressure concern (`src/hooks/useHistoryBackfill.ts:245`, 300 ms pause "lets Hermes GC reclaim…");
- the global limiter from spec 02 caps concurrency.

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| Once-per-session, delayed background job | `useHistoryBackfill` `hasRun` ref + `setTimeout(…, 2000)` (`src/hooks/useHistoryBackfill.ts:262-274`) | Copy the shape. Use a module-level flag, because the Requests screen can remount. |
| Week-by-week, 7 days in parallel, pause between weeks | `runBackfill` (`useHistoryBackfill.ts:190-245`) | Same shape; per-week writes make it resumable (`:216-224`) |
| Auth failure stops without destroying anything | `useHistoryBackfill.ts:181-185` | Same: stop the session and keep the store |
| "Only write if we got data" | `useHistoryBackfill.ts:216` | Our per-day merge only writes fulfilled days |
| Serialized, owner-checked store writes | `updateRequestsStore` (spec 02 Decision 7) | Safe to interleave with the queryFn |
| Pure planner, tested without hooks | `planRequestRefresh` (spec 02) | `planBackfillWeek` follows the same pattern |

### Key Files

| File | Relevance |
|------|-----------|
| `src/lib/requestsStore.ts` (spec 02) | `readRequestsStore`, `updateRequestsStore`, `buildRequestsView`, `REQUESTS_RETENTION_WEEKS` |
| `src/lib/requestsPlanner.ts` (spec 02) | `requestWindows`, `isDaySettled` |
| `src/api/workDiary.ts` | `fetchWorkDiary` (limited to 4 globally; renews the token per spec 01) |
| `src/lib/requestsUtils.ts:42-94` | `groupSlotsIntoEntries` |
| `src/hooks/useHistoryBackfill.ts:140-280` | Reference runner and hook |
| `app/(tabs)/approvals.tsx` | Mount point (Requests screen) |
| `src/store/config.ts:37-58` | `loadConfig`, `loadCredentials` |
| `src/api/errors.ts` (spec 01) | `AuthError`, `isRetryableError` |

### Integration Points

- Writes go into `my_requests_v1` through `updateRequestsStore`, so sign-out wipes them (spec 02 adds the key to `clearAll`).
- After each stored week, the TanStack view `['myRequests', assignmentId]` is updated in place with `queryClient.setQueryData` (updater form), so the Older section grows live.
- It shares the global FIFO work-diary limiter with foreground refreshes. A refresh queued behind a backfill week waits for at most that week's remaining requests (≤ 7, run 4 at a time), because weeks run one at a time.

---

## Key Decisions

### Decision 1: Own spec or part of the history UI (04)?

**Chosen:** its own spec.

**Rationale:**
- It is the only part of this feature that adds API traffic beyond today's level: up to 21 weeks × 7 = 147 requests, once.
- It has a different risk profile (rate limits are undocumented, `docs/CROSSOVER_API.md` has no rate-limit text) and must be independently revertible.
- Spec 04 is pure UI.
- Spec 02's forward accumulation already satisfies "build up" for new history, so this spec can be dropped without breaking anything.

### Decision 2: Which weeks, and in what order

**Chosen:** `planBackfillWeek(days, today)` returns the **newest** Monday `M` with `retentionStart <= M < catchUpStart` such that at least one date in `M..M+6` (clamped to `< catchUpStart`) has no stored record. It returns `null` when no such week exists.

**Rationale:**
- Newest first means the most relevant history appears first.
- Resumability comes from the data itself (missing records), with no cursor to get out of sync.
- Days already present, for example from spec 02's `unsettled-old` rule, are skipped.

**Rejected:** a stored cursor (it drifts after pruning or an owner change).

### Decision 3: Pacing and stop conditions

**Chosen:**
- Start `BACKFILL_START_DELAY_MS = 5_000` after the Requests screen mounts, so the foreground refresh, which has a 60 s `staleTime`, goes first.
- At most once per JS session **per owner**. The module-level `backfillStartedFor: Set<string>` holds `ownerKey`s, so signing out and into another account, or switching environment, in the same session still backfills the new owner.
- Weeks run sequentially. A week's days are fetched together through `fetchWorkDiary` (≤ 4 in flight globally), and only the days missing a record are fetched.
- Merge the fulfilled days of each week (`updateRequestsStore`), then pause `BACKFILL_WEEK_PAUSE_MS = 500`.
- A fetched day counts as **failed** if its `fetchWorkDiary` rejected **or** resolved with a value that is not an array (empty body). Failed days are never written. A resolved `[]` is a success and is stored as an empty day. This is the same rule as spec 02's queryFn (step 9).
- **Stop the session** when:
  - every day of a week failed (no write for that week);
  - any rejection is an `AuthError` that is not retryable (`!isRetryableError`, spec 01);
  - `updateRequestsStore` returns `null` (signed out or owner changed);
  - the cap of `BACKFILL_MAX_WEEKS_PER_SESSION = 21` is reached.

  The next session resumes from the gaps.
- A partial week stores what succeeded. Its missing days are retried in a later session; within the same session the week is skipped so the loop cannot spin.

**Rationale:**
- 500 ms between weeks is gentler than `useHistoryBackfill`'s 300 ms (`:245`), and the request volume here is a one-time cost.
- Stopping on a fully failed week prevents hammering a dead network.
- The non-retryable `AuthError` stop ensures a changed password never causes more than the one latched failure (spec 01).

### Decision 4: Settled flag for backfilled days

**Chosen:** `settled = isDaySettled(date, entries, today)` (spec 02). Every backfilled day is older than `catchUpStart`, so `today >= tuesdayAfter(date)` always holds, and the day is settled unless it has a PENDING entry. A PENDING backfilled day is re-checked by spec 02's `unsettled-old` rule (every 6 h at most).

**Rationale:** This reuses spec 02's rules, so backfilled days are never re-pulled once terminal. They are older than the 3-week window, which only moves forward, so not even pull-to-refresh (`forced`) re-checks them.

### Decision 5: Updating the visible list

**Chosen:**
```ts
queryClient.setQueryData<MyRequestsData>(['myRequests', assignmentId], (prev) =>
  prev && (prev.ownerKey === undefined || prev.ownerKey === ownerKey)
    ? { ...prev, ownerKey, entries: composeRequestsView(store.days, today, prev) }
    : prev)
```
Here:
- `store` is what `updateRequestsStore` returned.
- `composeRequestsView` (spec 02) keeps the view-only carry-forward of `prev` entries whose date still has no record. Using `buildRequestsView(...).entries` alone would silently drop legacy entries of weeks not yet backfilled. That would be data loss on screen.
- The update is skipped when there is no same-owner prior data; the queryFn will build the view itself.

**Rationale:**
- No extra network refetch.
- `staleDates` and `updatedAt` are preserved, because `updatedAt` only counts the catch-up window (spec 02).

**Rejected:** `invalidateQueries`. It is cheap with the planner, but it re-runs the queryFn after every week (up to 21 extra "today" requests).

### Decision 6: Mount point

**Chosen:** `useRequestsBackfill()` in `app/(tabs)/approvals.tsx`, the Requests tab.

**Rationale:**
- Only users who look at their requests pay the one-time cost.
- It avoids an app-wide mount, which matters for the deferred widget My Requests work (follow-up F1).
- Not run while `config.devManagerView` is on, and not when config or credentials are missing.

---

## Interface Contracts

### Types

```typescript
// src/lib/requestsPlanner.ts (extend)
export const BACKFILL_MAX_WEEKS_PER_SESSION = 21; // computed: REQUESTS_RETENTION_WEEKS (24) − 3 catch-up weeks

export interface BackfillWeek {
  monday: string;   // computed: a Monday in [retentionStart, catchUpStart) (requestWindows, spec 02)
  dates: string[];  // computed: dates in monday..monday+6, < catchUpStart, with no record in store.days
}

// src/hooks/useRequestsBackfill.ts (new)
export const BACKFILL_START_DELAY_MS = 5_000;
export const BACKFILL_WEEK_PAUSE_MS = 500;

export type BackfillStopReason =
  | 'complete'        // planBackfillWeek returned null
  | 'week-failed'     // every fetch in a week failed: rejected with a retryable error, or resolved without a slot array
  | 'auth'            // a non-retryable AuthError (isRetryableError === false)
  | 'signed-out'      // updateRequestsStore returned null
  | 'cap';            // BACKFILL_MAX_WEEKS_PER_SESSION reached

export interface BackfillResult {
  weeksStored: number;          // computed: weeks with ≥1 fulfilled day merged
  stopReason: BackfillStopReason;
}

export interface BackfillDeps {          // injectable for tests
  today: string;                         // local YYYY-MM-DD
  nowMs: () => number;                   // for fetchedAt
  sleep: (ms: number) => Promise<void>;  // default setTimeout-based
  onWeekStored?: (store: MyRequestsStore) => void; // the hook passes the setQueryData updater
}
```

### Function Contracts

| Function | Signature | Responsibility | Dependencies |
|----------|-----------|----------------|--------------|
| `planBackfillWeek` | `(days: Record<string, StoredRequestDay>, today: string, skip?: ReadonlySet<string>) => BackfillWeek \| null` | Decision 2. `skip` holds Mondays already attempted this session. | `requestWindows` |
| `runRequestsBackfill` | `(owner: RequestsStoreOwner, credentials: Credentials, deps: BackfillDeps) => Promise<BackfillResult>` | The loop. Plan → fetch the missing dates → build `StoredRequestDay`s (`groupSlotsIntoEntries`, `isDaySettled`) → `updateRequestsStore` → `onWeekStored` → `sleep(BACKFILL_WEEK_PAUSE_MS)`. Stop rules per Decision 3. Logs `log.info('requests.backfill_done', { weeksStored, stopReason })`. | `readRequestsStore`, `updateRequestsStore`, `fetchWorkDiary`, `planBackfillWeek`, `log` |
| `startRequestsBackfillOnce` | `(queryClient: QueryClient, deps?: Partial<BackfillDeps>) => Promise<BackfillResult \| null>` | Returns `null` without work if: this session already started for this `ownerKey`; `config` or `credentials` is missing; or `config.devManagerView` is on. Otherwise it adds the `ownerKey` to `backfillStartedFor`, builds `owner`, and calls `runRequestsBackfill` with an `onWeekStored` that applies the `setQueryData` updater (Decision 5). | `loadConfig`, `loadCredentials`, `runRequestsBackfill`, `composeRequestsView` |
| `useRequestsBackfill` | `() => void` | `useEffect`: `setTimeout(() => startRequestsBackfillOnce(queryClient), BACKFILL_START_DELAY_MS)`; clears the timer on unmount (a started run continues). | `useQueryClient`, `startRequestsBackfillOnce` |
| `__resetBackfillSessionForTests` | `() => void` | Clears `backfillStartedFor` (test-only export, like `__setRotationLimits` in `log.ts:20`) | — |

Field sources (all computed or stored, nothing new from the API):
- `StoredRequestDay.entries` ← `groupSlotsIntoEntries(WorkDiarySlot[] from GET /api/timetracking/workdiaries?assignmentId&date)`;
- `fetchedAt` ← `new Date(deps.nowMs()).toISOString()`;
- `settled` ← `isDaySettled`;
- `owner` ← `CrossoverConfig.assignmentId` / `useQA`.

---

## Test Plan

### `planBackfillWeek` (`src/lib/__tests__/requestsPlanner.test.ts`, extend)

**Happy Path:**
- Empty store, today 2026-10-21 (Wednesday) → `monday` = `catchUpStart − 7`, with 7 dates.
- That week fully stored → the next older week.
- All weeks back to `retentionStart` stored → `null`.

**Edge Cases:**
- A week with only Tue and Thu missing → `dates: [Tue, Thu]`.
- `skip` containing the newest gap week → the next one.
- The `retentionStart` week is included; the week before it never is.
- The DST week (2026-11-01) gives a correct Monday sequence.

**Error Cases:** a corrupt day key in the store (non-date) is ignored.

**Mocks Needed:** none.

### `runRequestsBackfill` (`src/hooks/__tests__/useRequestsBackfill.test.ts`, new)

**Happy Path:**
- Empty store, `fetchWorkDiary` resolves `[]` for every date → 21 weeks stored, `stopReason: 'complete'`, `weeksStored === 21`. The store holds 147 days, all `settled: true`.
  - Loop order: plan first (a `null` plan → `'complete'`), then check the cap (attempted weeks ≥ `BACKFILL_MAX_WEEKS_PER_SESSION` → `'cap'`).
  - A run that has attempted 21 weeks and still has gaps (because of `skip`) stops with `'cap'`; assert this with a store holding gaps beyond 21 attempts.
- `sleep` called 21 times with 500.
- `onWeekStored` called 21 times.

**Edge Cases:**
- A partial week: 2 dates reject → 5 days stored, the week goes into `skip`, the loop continues to the next week, and a second run in a new "session" retries only those 2 dates.
- Store prefilled with 10 weeks → only 11 weeks fetched.
- `today` changes between sessions → windows shift and the planner adapts.

**Error Cases:**
- All 7 of a week reject `NetworkError` → `stopReason: 'week-failed'`, earlier weeks kept, and the store is byte-identical to before that week (`setItem` not called for it).
- All 7 of a week resolve `undefined` (empty body) → `stopReason: 'week-failed'`, and no record is created for any of those dates.
- A week where 3 dates resolve `undefined` and 4 resolve `[]` → the 4 are stored as empty days (`entries: []`), and the 3 stay missing (no record), to be retried in a later session.
- One date rejects `AuthError(401)` → `stopReason: 'auth'` after storing that week's fulfilled days.
- `updateRequestsStore` returns `null` (`loadConfig` mocked to `null` mid-run) → `stopReason: 'signed-out'`, no further fetches.
- An `AuthError` with `AUTH_HTML_500` counts as retryable, so it alone does not stop the run.

**Concurrency:** a deferred-promise check that in-flight `fetchWorkDiary` calls never exceed 7 per week here. With the real `workDiary` module the global limit of 4 is covered in spec 02.

**Mocks Needed:** `../../api/workDiary` (`fetchWorkDiary`), `../../store/config` (`loadConfig` for the store owner check), the AsyncStorage `__mocks__` with `_reset()`, `../../lib/log`; injected `sleep: jest.fn().mockResolvedValue(undefined)` and a fixed `nowMs`.

### `useRequestsBackfill` (static, same file)

- The source contains `BACKFILL_START_DELAY_MS`, a module-level session flag, a `devManagerView` guard and `setQueryData`.
- Calling the hook logic twice in one session starts one run. Test through the exported `startRequestsBackfillOnce(queryClient)` helper the hook calls, so it is testable without `renderHook`.
- A second call with a different `assignmentId` or `useQA` in the same session starts a run for that owner.
- `onWeekStored` with a `prev` holding a carried-forward entry for a date that is still unrecorded keeps that entry, and drops the carried entries for dates the week just recorded. A `prev` with a foreign `ownerKey` is left untouched.

### Screen mount (`app/(tabs)/__tests__/approvals.test.tsx` and `app/(tabs)/__tests__/approvals-mesh.test.tsx`, extend)

- Add `jest.mock('@/src/hooks/useRequestsBackfill')` to **both** files. Both render `ApprovalsScreen` with `react-test-renderer` and no `QueryClientProvider` (`approvals.test.tsx:101,263`, `approvals-mesh.test.tsx:112,253`). Without the mock, the real hook's `useQueryClient()` throws "No QueryClient set".
- A source check that `approvals.tsx` imports and calls `useRequestsBackfill()`.
- `__tests__/build-team-queue-rows.test.ts:9` imports `approvals.tsx` as a module without rendering it. It is unaffected, because the hook only runs inside the component.

### Existing tests that change (and how)

| Test | Change |
|------|--------|
| `app/(tabs)/__tests__/approvals.test.tsx`, `app/(tabs)/__tests__/approvals-mesh.test.tsx` | Add a module mock for the new hook. Otherwise `useQueryClient()` throws without a provider, and its timer and AsyncStorage calls run inside render tests |
| All others | Unchanged |

### Verification commands

```
npx jest src/lib/__tests__/requestsPlanner.test.ts src/hooks/__tests__/useRequestsBackfill.test.ts \
  "app/(tabs)/__tests__/approvals.test.tsx" "app/(tabs)/__tests__/approvals-mesh.test.tsx" src/lib/__tests__/requestsStore.test.ts
npm test && npm run typecheck && npm run lint
npx expo-updates runtimeversion:resolve --platform ios   # == 56d054fc723984e56892a367dca1efa79a9f8fad (fingerprint unchanged)
git diff --stat -- app.json package.json package-lock.json plugins ios android   # empty
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/requestsPlanner.ts` | modify | `planBackfillWeek`, `BACKFILL_MAX_WEEKS_PER_SESSION` |
| `src/hooks/useRequestsBackfill.ts` | create | `runRequestsBackfill`, `startRequestsBackfillOnce`, `useRequestsBackfill`, constants, test reset |
| `app/(tabs)/approvals.tsx` | modify | Call `useRequestsBackfill()` |
| `src/lib/__tests__/requestsPlanner.test.ts` | modify | Planner tests |
| `src/hooks/__tests__/useRequestsBackfill.test.ts` | create | Runner tests |
| `app/(tabs)/__tests__/approvals.test.tsx`, `app/(tabs)/__tests__/approvals-mesh.test.tsx` | modify | Module mock (both) + source check |

---

## Edge Cases to Handle

1. **Sign-out during a backfill.** The owner check in `updateRequestsStore` returns `null`, so the run stops with `signed-out`. `queryClient.clear()` already dropped the view, and `onWeekStored` is not called.
2. **Env switch.** The owner (`useQA`) changes, so writes are refused, and the next session backfills the new owner.
3. **Retention pruning.** Weeks pruned on a later Monday are not re-backfilled, because the planner never goes below `retentionStart`.
4. **A foreground refresh during a backfill.** Writes are serialized (spec 02). The FIFO limiter is shared, so a pull-to-refresh waits for at most the current backfill week's queued requests (≤ 7, two waves of 4). If both ask for the same old date at the same moment (the queryFn's `unsettled-old` rule), they share one request through spec 02's in-flight sharing in `fetchWorkDiary`.
5. **The app backgrounded mid-run.** JS suspends and the run continues on resume; a kill loses only the in-flight week (resumable).
6. **Persistent per-date server error** (`docs/api-samples/06-workdiary-yesterday.json`: `400 CROS-0400`). That day stays missing and is retried at most once per session.

---

## Open Questions

✓ Own spec or part of 04? → Its own spec (Decision 1).
✓ How far back? → `REQUESTS_RETENTION_WEEKS = 24`, matching `WEEKLY_HISTORY_MAX` (spec 02).
✓ Rate limits? → Undocumented. Mitigated by sequential weeks, a 500 ms pause, the global 4-slot limit, stop-on-failure and once per session (Decision 3).

None remaining.
