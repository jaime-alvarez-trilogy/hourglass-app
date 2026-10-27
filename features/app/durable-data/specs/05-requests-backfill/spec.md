# Requests Backfill

**Status:** Draft
**Created:** 2026-10-22
**Last Updated:** 2026-10-22
**Owner:** @jaime-alvarez-trilogy

**Feature:** [durable-data](../../FEATURE.md) · **Research:** [spec-research.md](spec-research.md) · **Builds on:** [01-auth-renewal](../01-auth-renewal/spec.md), [02-requests-store](../02-requests-store/spec.md) (hard), [03-keep-last-good](../03-keep-last-good/spec.md), [04-requests-history-ui](../04-requests-history-ui/spec.md) (soft: the Older section shows the weeks) — all done, `968f1d5..9eecc3c` · **Branch:** `feat/sdk-58` (1.2.0) · **Fingerprint:** must stay `56d054fc723984e56892a367dca1efa79a9f8fad`

---

## Overview

After spec 02, `my_requests_v1` keeps every day it has fetched for 24 weeks, but only days fetched from now on. Days older than the 3-week window (`catchUpStart`) that were never fetched stay missing, because `planRequestRefresh` never plans a missing older day ("that is the backfill, spec 05"). This spec adds that backfill: a gentle, resumable, once-per-session walk back to `retentionStart`, one week at a time, storing each week through the existing store. Spec 04's Older section then shows it.

**What gets built:**

1. **A pure week planner** (`src/lib/requestsPlanner.ts`, extend). `planBackfillWeek(days, today, skip?)` returns the newest Monday in `[retentionStart, catchUpStart)` that has at least one date with no stored record, with exactly those dates. It returns `null` when there is none. That range holds 21 weeks (147 days), so the whole backfill is a one-time cost: once every day has a record, the planner returns `null` before any request is made.
2. **A runner** (`src/hooks/useRequestsBackfill.ts`, new). `runRequestsBackfill(owner, credentials, deps)` loops: plan → check the owner → fetch the week's missing dates through `fetchWorkDiary` (the shared 4-slot FIFO limiter with in-flight sharing) → merge the days that came back through `updateRequestsStore` → update the visible view → pause 500 ms. It stops on a fully failed week, a non-retryable `AuthError`, a 429, a sign-out or owner change, an unreadable store, or the session cap. A failed day is never written. The next session resumes from the gaps, because the gaps are the plan.
3. **A session gate and live view update** (same file). `startRequestsBackfillOnce(queryClient, deps?)` runs the backfill at most once per JS session per owner (`assignmentId|env`). It never runs for the dev-mock manager preview, a signed-out user, or a missing keychain entry. After each stored week it rebuilds the `['myRequests', assignmentId]` view in place with `composeRequestsView`, but only over a successful same-owner (or legacy) view. It keeps that view's error state and `dataUpdatedAt`.
4. **A screen hook and its mount** (`useRequestsBackfill()`, called from `app/(tabs)/approvals.tsx`). It schedules the gate 5 s after the Requests screen mounts, or after the owner changes while it is mounted, so the foreground refresh goes first. Unmounting clears the timer; a started run continues.

JS-only. No new dependencies, and no changes to `package.json`, `package-lock.json`, `app.json`, `eas.json`, `ios/`, `android/` or `patches/`. Two existing private helpers gain an `export` keyword and nothing else (C2, C3).

---

## Clarification Decisions (Step 3, autonomous)

spec-research.md has no open questions. Checking it against the real code at `9eecc3c` (specs 01-04 done) raised these points. Each one is decided here.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| C1 | Which names did specs 01-04 actually ship? | We use these exports as they exist:<br>- `src/lib/requestsStore.ts`: `readRequestsStore(owner)` → `{status:'ok',store} \| {status:'empty'} \| {status:'unreadable'}`; `updateRequestsStore(owner, fetched, today)` → `MyRequestsStore \| null` (serialized, never rejects, owner checked before and after `setItem`); `composeRequestsView(days, today, prior)`; types `RequestsStoreOwner`, `StoredRequestDay`, `MyRequestsStore`.<br>- `src/lib/requestsPlanner.ts`: `requestWindows(today)` (`catchUpStart` = current Monday − 14 d, `retentionStart` = current Monday − 23 weeks), `addDays`, `isDaySettled(date, entries, fetchDay)`, `todayLocal()`, `REQUESTS_RETENTION_WEEKS = 24`.<br>- `src/api/workDiary.ts`: `fetchWorkDiary(assignmentId, date, credentials, useQA)` (limiter of `WORK_DIARY_CONCURRENCY = 4`, in-flight sharing keyed by `getAuthGeneration()`).<br>- `src/api/errors.ts`: `AuthError`, `ApiError`, `NetworkError`, `AUTH_HTML_500`, `isRetryableError`.<br>- `src/lib/requestsUtils.ts`: `groupSlotsIntoEntries(slots, date)`.<br>- `src/store/config.ts`: `loadConfig`, `loadCredentials`. `src/hooks/useConfig.ts`: `useConfig()`.<br>- `src/types/requests.ts`: `MyRequestsData` (`entries`, `error`, `staleDates?`, `updatedAt?`, `ownerKey?`). | Using the real names avoids a second API. `useHistoryBackfill`'s `runBackfill` is the shape reference only; it calls `apiGet` directly and is not touched (Out Of Scope #3). |
| C2 | The view's owner stamp (`toOwnerKey`) and `DEV_MOCK_OWNER_KEY` are private to `useMyRequests.ts`. | **Add `export` to `toOwnerKey`** in `src/hooks/useMyRequests.ts` (no other change) and import it. The dev-mock check uses `config.devManagerView` directly, so the `'dev-mock'` literal is not needed. | One owner for the stamp format. Re-implementing it would let the backfill's view guard drift from `selectMyRequests`. |
| C3 | **(new)** The runner holds the credentials it loaded at start. After a sign-out, every further fetch would mint a new token for a signed-out user with stale credentials, and only the next `updateRequestsStore` would notice. | **Check the owner before each week's fetch.** Add `export` to `isOwnerConfigured` in `src/lib/requestsStore.ts` (no other change), and call it before fetching each week. If it is false, stop with `'signed-out'` and fetch nothing. | Sign-out and env switch make no further requests and mint no token. Reusing the store's own rule means "configured owner" has one definition. It costs one AsyncStorage read per week. |
| C4 | **(research inconsistency)** The research loop is "plan first, then check the cap". Every attempted week goes into `skip`, and the range holds exactly 21 weeks, so after 21 attempts the planner returns `null` → `'complete'`. The research case "21 attempts with gaps still left → `'cap'`" cannot happen. | **Keep `BACKFILL_MAX_WEEKS_PER_SESSION = 21` as a defensive loop bound.** It is unreachable by construction. Test it with a planner spy that ignores `skip` (it always returns the same week): the run must stop at exactly 21 attempted weeks with `'cap'`. | The bound keeps the "≤ 21 weeks × 7 days per session" guarantee even if the planner regresses. The spy test proves the guard works without contradicting the planner. |
| C5 | What does `'complete'` mean when some days are still missing (partial weeks put in `skip`)? | **`'complete'` = nothing left to try this session.** The log's `daysFailed` says whether gaps remain. | One more stop reason would add no behaviour: either way the next session retries only the gaps. |
| C6 | **(new)** A 429 is retryable (`isRetryableError`), so under the research rules a partial week with 429s would continue into the next week. | **Any rejection that is an `ApiError` with `statusCode === 429` stops the session with a new reason, `'throttled'`.** The week's fulfilled days are still merged first. | The owner asked for gentle traffic. Rate limits are undocumented (`docs/CROSSOVER_API.md`), so a 429 is the one explicit signal to back off. |
| C7 | **(gap)** The store can be `'unreadable'` (`getItem` threw). The research has no stop reason for it, and `updateRequestsStore` would return `null` anyway. | **New stop reason `'unreadable'`.** If the store cannot be read when the run starts, it stops before any fetch. | Never fetch what cannot be written (spec 02 / 03 rule: never write over an unreadable store). |
| C8 | **(research deviation, verified in code)** `queryClient.setQueryData` dispatches a `success` action. `successState` (`@tanstack/query-core/build/modern/query.js:565-573`) sets `error: null`, `status: 'success'` and `dataUpdatedAt: Date.now()` unless `updatedAt` is given. A backfill week landing while the screen shows spec 04's "Can't sign in…" note would silently clear that error. It would also make the view look fresh, so a focus refetch would be skipped for 60 s. | **Update the view only when the query's `status === 'success'`** and its data is same-owner or legacy (`ownerKey` undefined or equal). **Pass `{ updatedAt: state.dataUpdatedAt }`** so freshness is unchanged. Otherwise do nothing: the weeks are in the store, and the next successful refresh shows them (`composeRequestsView` over the merged store). | Spec 04's honest-freshness contract stays true. An errored view usually means the backfill fails the same way, so little is lost. |
| C9 | When is the session flag set, and can two calls race? | **The `ownerKey` is added to `backfillStartedFor` only when a run actually starts:** after config is read (signed in, not `devManagerView`) and credentials are present. The `has` check and the `add` run **with no `await` between them** (after the last `await`). A guard that returns `null` does not mark the owner, so a later mount can still start it. | Two quick mounts (or a remount during `loadConfig`) start one run. The dev preview or a missing keychain entry does not use up the session's single run. |
| C10 | The Requests tab stays mounted across an env switch (`app/modal.tsx` updates `['config']` and removes `['myRequests']`). With a mount-only effect, the new owner would wait for the next app launch. | **`useRequestsBackfill` reads `useConfig()`.** Its effect depends on `[queryClient, ownerKey]`, where `ownerKey` is `null` when signed out or when `devManagerView` is on. A change schedules a new 5 s timer; the gate re-reads config from storage. | This covers env switch and sign-in to another account without a remount. `approvals.tsx` itself still does not import `useConfig` (its static test DD stays green). |
| C11 | **Steady-state cost** (owner: "a one-time cost, not repeated on later launches once weeks are stored"). | **Once every date in `[retentionStart, catchUpStart)` has a record, a session makes zero backfill requests** (the planner returns `null` before any fetch). Each later week, the oldest week is pruned and the newest becomes "older than the window". That week was already fetched by the foreground refresh (missing or unsettled window days are planned `daily`), so it normally needs nothing. Dates the server never answers stay gaps and are retried **at most once per session**. A fully failed week stops the run, so this costs ≤ 7 requests per session. | Retrying unanswered dates is the price of never inventing data. A persisted "give up" floor is descoped (Out Of Scope #5): `requests.backfill_done`'s `daysFailed` / `stopReason` will show whether it is needed. |
| C12 | A partial week (some days failed, some returned arrays). | **Merge the fulfilled days, add the Monday to `skip`, and continue.** A failed day (a rejection, or a resolved non-array such as an empty body) is never written. A resolved `[]` is stored as a settled empty day. | Research Decision 3; this is the same success rule as spec 02's queryFn. The owner's "stops on failure without writing" means a failed *week* stops the run and a failed *day* is never written. |
| C13 | Can the background promise reject? | **No.** `runRequestsBackfill` calls `onWeekStored` inside `try/catch` (a view-update throw never stops the backfill). `startRequestsBackfillOnce` wraps everything in `try/catch`: an unexpected throw (e.g. `loadConfig` rejects) logs `log.error('requests.backfill_failed', err)` (class name only) and resolves `null`. | The hook fires it from a `setTimeout` with `void`, so a rejection would be unhandled. |
| C14 | Logging. | **One event per run:** `log.info('requests.backfill_done', { weeksStored, daysStored, daysFailed, stopReason })`. Plus `requests.backfill_failed` (C13). A no-op gate logs nothing. **(research deviation)** `BackfillResult` gains `daysStored` and `daysFailed` beyond the research's `{ weeksStored, stopReason }`, so the result and the log carry the same four fields (FR2). | The keys pass `redact` (no deny-listed substring, no `id` suffix). No dates or IDs are logged (the `log.ts` privacy contract). |
| C15 | Test seams. | `export function __resetBackfillSessionForTests(): void` clears `backfillStartedFor` (like `__setRotationLimits` in `log.ts`). `BackfillDeps` injects `today`, `nowMs`, `sleep` and `onWeekStored`; `startRequestsBackfillOnce` takes `Partial<BackfillDeps>` (without `onWeekStored`, which it always provides). | This matches spec 02's `buildMyRequestsQueryFn(todayOverride, nowOverride)` pattern. |
| C16 | Screen tests render `ApprovalsScreen` without a `QueryClientProvider`. | Add **`jest.mock('@/src/hooks/useRequestsBackfill', () => ({ useRequestsBackfill: jest.fn() }))`** (factory form) to `app/(tabs)/__tests__/approvals.test.tsx` and `approvals-mesh.test.tsx`. `__tests__/build-team-queue-rows.test.ts` imports the module without rendering it, so it is unaffected. `approvals-screen.test.tsx` and `MotionUniversality.test.tsx` are source-only checks with no rule the new line breaks. | Without the mock, the real hook's `useQueryClient()` throws "No QueryClient set". The factory form avoids automock loading the real module graph. |
| C17 | Docs. | Add a step to `docs/ARCHITECTURE.md` §4.4 ("Backfill (durable-data 05)"), and replace "that is the backfill, spec 05" in step 2 with a pointer to it. Extend the header comments of `useMyRequests.ts` and `requestsStore.ts` for the new exports. Update the `FEATURE.md` changelog at the end (checklist). | This keeps the architecture doc true. |
| C18 | Process (Steps 4, 6, 9, 10). | The spec author drafted the sections directly and ran the coherence, checklist and QC checks by hand (FR ids, type names, file lists, Out Of Scope classes, stop-reason set, test ids), as specs 02 and 04 did. This sub-agent has no Agent tool, and the Codex CLI is not installed (`which codex` → not found). | This is a process deviation, not a content one. The checklist's Phase 5.2 review still runs. |

---

## Out Of Scope

1. **Making older weeks visible.** **Already done by [04-requests-history-ui](../04-requests-history-ui/spec.md).** Its Older section renders whatever the view holds, month-grouped. This spec only fills the store and the view. No UI change.
2. **Re-checking stored days older than the window.** **Descoped (owned by spec 02).** `planRequestRefresh`'s `unsettled-old` rule (6 h TTL) already re-checks an unsettled (PENDING) backfilled day, and settled days are final. The backfill never touches a date that has a record.
3. **Sharing per-day work diaries with `useHistoryBackfill` / `useAIData`**, or moving `useHistoryBackfill` onto `fetchWorkDiary` and its limiter. **Deferred to follow-up F7** (FEATURE.md Out of Scope: a per-day work-diary record store, a new spec 06 in this feature). On first run after this update, the same past days may be downloaded once by each backfill. Both are one-time, and `useHistoryBackfill` only fetches weeks with AI gaps.
4. **An app-wide mount** (tab layout) **or the widget's My Requests.** **Descoped, follow-up F1** (FEATURE.md). This hook is mounted only on the Requests screen (research Decision 6), so only users who open it pay the one-time cost.
5. **A persisted backfill cursor or "give up" floor** for dates the server never answers (e.g. before the assignment started, if the server rejects them). **Descoped** (research Decision 2 rejected a stored cursor; C11 bounds the repeat cost at ≤ 7 requests per session). Revisit only if `requests.backfill_done` logs show repeated `week-failed`.
6. **Going further back than 24 weeks**, or changing `REQUESTS_RETENTION_WEEKS`. **Descoped.** It mirrors `WEEKLY_HISTORY_MAX` (spec 02).
7. **Resetting the session flag on sign-out.** **Descoped.** Signing out and back into the *same* account in one JS session does not backfill again until the next launch (the store was wiped; the foreground refresh refills the 3-week window at once). This is rare, and keeping the flag simple avoids coupling to `clearAll`.
8. **A progress indicator or "loading older requests" UI.** **Descoped.** The backfill is silent; weeks appear in the collapsed Older section as they land.
9. **Store schema, planner refresh rules, limiter, API or persister changes.** **Descoped.** Specs 01-03 own them. This spec only adds `planBackfillWeek` and two `export` keywords (C2, C3).
10. **Any OTA, `eas`, `asc.js`, version bump, push or PR.** **Descoped.** Release mechanics (`docs/RELEASING.md`).

---

## Functional Requirements

### FR1: `planBackfillWeek` picks the newest week with missing days (pure)

`src/lib/requestsPlanner.ts` gains a pure planner for the backfill. Resumability comes from the data: a date without a record is the only thing it plans.

**Requirements:**
- `export const BACKFILL_MAX_WEEKS_PER_SESSION = 21;`, with a comment: `REQUESTS_RETENTION_WEEKS` (24) − the 3 weeks of the catch-up window.
- `export interface BackfillWeek { monday: string; dates: string[] }`.
- `export function planBackfillWeek(days: Record<string, StoredRequestDay>, today: string, skip?: ReadonlySet<string>): BackfillWeek | null`:
  - Let `{ catchUpStart, retentionStart } = requestWindows(today)`. Candidate Mondays are `addDays(catchUpStart, −7)`, `addDays(catchUpStart, −14)`, … down to and including `retentionStart`, newest first. That is 21 Mondays.
  - A Monday in `skip` is passed over.
  - For a candidate Monday `M`, `dates` = the dates `M..addDays(M, 6)` that are `< catchUpStart` and have **no key** in `days`, ascending.
  - It returns the first candidate with a non-empty `dates`, or `null` if there is none.
  - Store keys that are not dates (e.g. `'garbage'`) are never looked at, because only generated dates are checked. The function never throws and does not mutate its inputs.

**Success Criteria:**
- [ ] Empty store, today `2026-10-21` (Wednesday): `{ monday: '2026-09-28', dates: ['2026-09-28', …, '2026-10-04'] }` (7 dates). `catchUpStart` is `2026-10-05`.
- [ ] That week fully stored → `monday: '2026-09-21'`.
- [ ] Every date from `retentionStart` (`2026-05-11`) to `2026-10-04` stored → `null`.
- [ ] A week missing only Tue and Thu → `dates` is exactly those 2 dates.
- [ ] `skip` holding `'2026-09-28'` (empty store) → `monday: '2026-09-21'`.
- [ ] Only the `retentionStart` week (`2026-05-11`) has gaps → it is returned. The week before it (`2026-05-04`) is never returned, even when it has no records.
- [ ] DST: today `2026-11-25` with the `2026-11-02` week stored → `monday: '2026-10-26'` and the 7 dates `2026-10-26..2026-11-01` (the US fall-back week).
- [ ] A store holding a `'garbage'` key (and every real date stored) → `null`, no throw.
- [ ] `BACKFILL_MAX_WEEKS_PER_SESSION === REQUESTS_RETENTION_WEEKS − 3`, and an empty store yields exactly 21 distinct Mondays when called repeatedly with a growing `skip`.

---

### FR2: `runRequestsBackfill` stores week by week and stops on failure

`src/hooks/useRequestsBackfill.ts` (new) exports the runner, its constants and types.

**Requirements:**
- Constants: `export const BACKFILL_START_DELAY_MS = 5_000;` and `export const BACKFILL_WEEK_PAUSE_MS = 500;`.
- Types:
  ```ts
  export type BackfillStopReason =
    | 'complete'    // planBackfillWeek returned null: nothing left to try this session (C5)
    | 'week-failed' // no planned day of a week came back as an array
    | 'auth'        // a rejection was an AuthError with isRetryableError(err) === false
    | 'throttled'   // a rejection was an ApiError with statusCode 429 (C6)
    | 'signed-out'  // the owner is no longer configured (pre-week check, or updateRequestsStore → null)
    | 'unreadable'  // readRequestsStore returned 'unreadable' at start (C7)
    | 'cap';        // BACKFILL_MAX_WEEKS_PER_SESSION weeks attempted (defensive, C4)

  export interface BackfillResult {
    weeksStored: number; // weeks with ≥ 1 fulfilled day merged
    daysStored: number;  // fulfilled days merged
    daysFailed: number;  // planned days that rejected or resolved without an array
    stopReason: BackfillStopReason;
  }

  export interface BackfillDeps {
    today: string;                                   // local YYYY-MM-DD, fixed for the run
    nowMs: () => number;                             // for fetchedAt
    sleep: (ms: number) => Promise<void>;            // default: setTimeout-based
    onWeekStored?: (store: MyRequestsStore) => void; // the gate passes the view update (FR3)
  }
  ```
- `export async function runRequestsBackfill(owner: RequestsStoreOwner, credentials: Credentials, deps: BackfillDeps): Promise<BackfillResult>`:
  1. `readRequestsStore(owner)`. `'unreadable'` → stop `'unreadable'` (no fetch). `'empty'` → `days = {}`.
  2. Loop. `week = planBackfillWeek(days, deps.today, skip)`. If it is `null` → `'complete'`. Then, if `attempted >= BACKFILL_MAX_WEEKS_PER_SESSION` → `'cap'`.
  3. `isOwnerConfigured(owner)` is false → `'signed-out'` (no fetch for this week) (C3).
  4. `Promise.allSettled(week.dates.map((d) => fetchWorkDiary(owner.assignmentId, d, credentials, owner.useQA)))`. Weeks never overlap: the next week's fetches start only after this week has settled, merged and paused.
  5. A result that is `fulfilled` with `Array.isArray(value)` becomes `{ date, fetchedAt: new Date(deps.nowMs()).toISOString(), entries: groupSlotsIntoEntries(value, date), settled: isDaySettled(date, entries, deps.today) }`. Anything else is a failed day, never written (C12). `daysFailed += week.dates.length - fulfilled.length`, before any stop check below, so a week that ends the run still counts its failed days.
  6. If at least one day was fulfilled: `stored = await updateRequestsStore(owner, fulfilled, deps.today)`. `null` → `'signed-out'`. Otherwise `days = stored.days`, `weeksStored++`, `daysStored += fulfilled.length`, and `deps.onWeekStored?.(stored)` inside `try/catch` (C13).
  7. Then, in this order: any rejection is an `AuthError` with `!isRetryableError(reason)` → `'auth'`; any rejection is an `ApiError` with `statusCode === 429` → `'throttled'`; no day was fulfilled → `'week-failed'` (nothing was written for this week).
  8. Otherwise add `week.monday` to `skip`, `attempted++`, `await deps.sleep(BACKFILL_WEEK_PAUSE_MS)`, and loop.
  - On every exit: `log.info('requests.backfill_done', { weeksStored, daysStored, daysFailed, stopReason })`, once, then return the same values.
  - `attempted` counts every week that reached step 4.

**Success Criteria:**
- [ ] Empty store, every fetch resolves `[]`, today `2026-10-21`: `{ weeksStored: 21, daysStored: 147, daysFailed: 0, stopReason: 'complete' }`. The store holds 147 days in `2026-05-11..2026-10-04`, all `entries: []`, `settled: true`, `fetchedAt` = the injected `nowMs`. `sleep` is called 21 times, each with `500`. `onWeekStored` is called 21 times. Weeks are fetched newest first.
- [ ] A day whose slots include a manual `PENDING` entry is stored with that entry and `settled: false`. An `APPROVED` one gives `settled: true`.
- [ ] Store prefilled with the 10 newest backfill weeks → only the other 11 weeks are fetched (77 calls), and no prefilled date is requested.
- [ ] Partial week: 2 dates reject `NetworkError` → the other 5 are stored, `daysFailed: 2`, the run continues to the next week, and the 2 dates have no record. A second run (new session, same store) requests exactly those 2 dates and nothing else.
- [ ] A week where 3 dates resolve `undefined` and 4 resolve `[]` → the 4 are stored as empty days, and the 3 have no record.
- [ ] A week where all 7 reject `NetworkError` → `'week-failed'`. Earlier weeks stay stored, the store string is byte-identical to the one before that week, and no later week is fetched. All 7 resolving `undefined` gives the same result.
- [ ] One date rejects `new AuthError(401)` → `'auth'`, after that week's 6 fulfilled days are stored, with no further fetch. An `AuthError(401, …, { errorCode: AUTH_HTML_500 })` on one date does not stop the run.
- [ ] One date rejects `new ApiError(429)` → `'throttled'`, after the fulfilled days are stored, with no further fetch.
- [ ] `loadConfig` switches to another owner (or `null`) after the first week → `'signed-out'`. `fetchWorkDiary` is never called for the second week, and the store is not written again.
- [ ] `AsyncStorage.getItem` throws → `'unreadable'`, with no fetch and no write.
- [ ] Cap (C4): with `planBackfillWeek` spied to always return the same week (ignoring `skip`), the run stops with `'cap'` after exactly 21 attempted weeks.
- [ ] Concurrency: with deferred promises, no second-week `fetchWorkDiary` call happens before every first-week promise has settled and `sleep` has resolved. At most 7 calls are pending at once.
- [ ] `today` moved one week later for a second run → the planner's windows shift, and only the newly uncovered gaps are fetched (none if the foreground window filled them).
- [ ] `log.info` is called exactly once per run with `'requests.backfill_done'` and `{ weeksStored, daysStored, daysFailed, stopReason }` equal to the returned result.
- [ ] `onWeekStored` throwing does not stop the run, and the result is unchanged.

---

### FR3: `startRequestsBackfillOnce` gates the run and updates the visible view

**Requirements:**
- Module state: `const backfillStartedFor = new Set<string>()` holds `ownerKey`s (`toOwnerKey(assignmentId, useQA)`, C2). `export function __resetBackfillSessionForTests(): void` clears it.
- `export async function startRequestsBackfillOnce(queryClient: QueryClient, deps?: Partial<Omit<BackfillDeps, 'onWeekStored'>>): Promise<BackfillResult | null>`:
  1. `config = await loadConfig()`. No config or no `assignmentId` → `null`. `config.devManagerView === true` → `null` (no store read, no credentials read, no fetch).
  2. `credentials = await loadCredentials()`. `null` → `null`.
  3. With no `await` between them (C9): if `backfillStartedFor.has(ownerKey)` → `null`; else `backfillStartedFor.add(ownerKey)`.
  4. `owner = { assignmentId, useQA: config.useQA === true }`, and `today = deps?.today ?? todayLocal()`. Run `runRequestsBackfill(owner, credentials, { today, nowMs: deps?.nowMs ?? Date.now, sleep: deps?.sleep ?? defaultSleep, onWeekStored })` and return its result.
  5. Any throw → `log.error('requests.backfill_failed', err)`, resolve `null` (C13). It never rejects.
- `onWeekStored(store)` (C8):
  ```ts
  const key = ['myRequests', owner.assignmentId];
  const state = queryClient.getQueryState<MyRequestsData>(key);
  const prev = state?.data;
  if (state?.status !== 'success' || !prev) return;
  if (prev.ownerKey !== undefined && prev.ownerKey !== ownerKey) return;
  queryClient.setQueryData<MyRequestsData>(
    key,
    { ...prev, ownerKey, entries: composeRequestsView(store.days, today, prev) },
    { updatedAt: state.dataUpdatedAt },
  );
  ```
  `error`, `staleDates` and `updatedAt` are carried from `prev` unchanged.

**Success Criteria:**
- [ ] Two concurrent calls for the same owner → one run (the fetch count equals one run's). A later call in the same session → `null`, with no fetch.
- [ ] A call for another `assignmentId`, or the same one with `useQA` flipped → a new run.
- [ ] `loadConfig` → `null`, or a config without `assignmentId` → `null`, no fetch. A later call once signed in runs.
- [ ] `devManagerView: true` → `null`, with no `loadCredentials`, store read or fetch. A later call with it off runs (the owner was not marked).
- [ ] `loadCredentials` → `null` → `null`, no fetch, and the owner is not marked.
- [ ] `loadConfig` rejecting → resolves `null`, and `log.error` is called with `'requests.backfill_failed'`.
- [ ] View update, with a seeded `QueryClient` in `status: 'success'`:
  - [ ] a `prev` entry dated in a week that is still unrecorded is kept;
  - [ ] a `prev` entry dated in the week just stored is replaced by the stored day's entries;
  - [ ] `dataUpdatedAt`, `error`, `staleDates` and `updatedAt` are unchanged, and `ownerKey` is set;
  - [ ] a legacy `prev` (no `ownerKey`) is updated and stamped.
- [ ] A `prev` with a foreign `ownerKey`, or `'dev-mock'`, is left identical (same reference).
- [ ] An errored query that still holds data (`status: 'error'`) is left untouched: the same data and the same error.
- [ ] With no cached data, no `['myRequests', assignmentId]` data is created.
- [ ] `__resetBackfillSessionForTests()` lets the same owner run again.

---

### FR4: The Requests screen schedules the backfill

**Requirements:**
- `export function useRequestsBackfill(): void`:
  - `queryClient = useQueryClient()`, `{ config } = useConfig()`.
  - `ownerKey = config?.assignmentId && config.devManagerView !== true ? toOwnerKey(config.assignmentId, config.useQA === true) : null`.
  - `useEffect(() => { if (!ownerKey) return; const t = setTimeout(() => { void startRequestsBackfillOnce(queryClient); }, BACKFILL_START_DELAY_MS); return () => clearTimeout(t); }, [queryClient, ownerKey])`. Unmounting only clears a pending timer; a started run continues.
- `app/(tabs)/approvals.tsx`: `import { useRequestsBackfill } from '@/src/hooks/useRequestsBackfill'`, and call `useRequestsBackfill()` unconditionally, right after `useMyRequests()`. Add a `durable-data 05` line to the header comment.
- Add the factory mock (C16) to `app/(tabs)/__tests__/approvals.test.tsx` and `app/(tabs)/__tests__/approvals-mesh.test.tsx`.
- Docs (C17): `docs/ARCHITECTURE.md` §4.4 gets a "Backfill (durable-data 05)" step, and step 2's "(that is the backfill, spec 05)" points to it. The header comments of `useMyRequests.ts` and `requestsStore.ts` mention the new exports.

**Success Criteria:**
- [ ] Rendered inside a `QueryClientProvider` with fake timers and a signed-in `useConfig`: `loadConfig` is not called before 5 000 ms, and the gate runs once after it.
- [ ] Unmounting before 5 000 ms → the gate never runs.
- [ ] `devManagerView: true`, or no `assignmentId` → no timer and no gate call.
- [ ] Re-rendering with a different `useQA` (same mount) → a new timer, and a run for the new owner.
- [ ] Static: `approvals.tsx` (comments stripped) imports `useRequestsBackfill` from `@/src/hooks/useRequestsBackfill` and calls `useRequestsBackfill()`. It still does not import `useConfig`.
- [ ] `approvals.test.tsx`, `approvals-mesh.test.tsx`, `__tests__/approvals-screen.test.tsx`, `MotionUniversality.test.tsx` and `__tests__/build-team-queue-rows.test.ts` all pass.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `src/lib/requestsStore.ts` | `readRequestsStore`, `updateRequestsStore` (serialized, owner pre/post checks, prune), `composeRequestsView`, private `isOwnerConfigured` (C3) |
| `src/lib/requestsPlanner.ts` | `requestWindows`, `addDays`, `isDaySettled`, `todayLocal`, `REQUESTS_RETENTION_WEEKS`; `planRequestRefresh` never plans a missing older day |
| `src/hooks/useMyRequests.ts` | The queryFn's per-day success rule (`Array.isArray`), private `toOwnerKey` (C2), the `ownerKey` prior rule, `devManagerView` → `'dev-mock'` |
| `src/api/workDiary.ts` | `fetchWorkDiary`: 4-slot FIFO limiter, in-flight sharing |
| `src/api/errors.ts` | `AuthError`, `ApiError`, `NetworkError`, `AUTH_HTML_500`, `isRetryableError` |
| `src/lib/requestsUtils.ts` | `groupSlotsIntoEntries` |
| `src/hooks/useHistoryBackfill.ts` | Reference runner shape: sequential weeks, `allSettled` per week, write only data, pause between weeks |
| `src/hooks/useConfig.ts`, `src/store/config.ts` | `useConfig`, `loadConfig`, `loadCredentials`; `clearAll` wipes `my_requests_v1` |
| `src/lib/log.ts`, `src/lib/redact.ts` | Event conventions, key deny-list |
| `node_modules/@tanstack/query-core/build/modern/query.js:565-573` | `successState` clears `error` and stamps `dataUpdatedAt` (C8) |
| `app/(tabs)/approvals.tsx`, `app/modal.tsx` | Mount point; the env switch updates `['config']` and removes `['myRequests']` (C10) |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/requestsPlanner.ts` | modify | `BACKFILL_MAX_WEEKS_PER_SESSION`, `BackfillWeek`, `planBackfillWeek` (FR1) |
| `src/lib/requestsStore.ts` | modify | `export` on `isOwnerConfigured`, plus its header comment (C3) |
| `src/hooks/useMyRequests.ts` | modify | `export` on `toOwnerKey`, plus its header comment (C2) |
| `src/hooks/useRequestsBackfill.ts` | create | Constants, types, `runRequestsBackfill`, `startRequestsBackfillOnce`, `useRequestsBackfill`, `__resetBackfillSessionForTests` (FR2-FR4) |
| `app/(tabs)/approvals.tsx` | modify | Call `useRequestsBackfill()` (FR4) |
| `src/lib/__tests__/requestsPlanner.test.ts` | modify | FR1 tests |
| `src/hooks/__tests__/useRequestsBackfill.test.ts` | create | FR2-FR4 tests |
| `app/(tabs)/__tests__/approvals.test.tsx` | modify | Factory mock + static mount check |
| `app/(tabs)/__tests__/approvals-mesh.test.tsx` | modify | Factory mock |
| `docs/ARCHITECTURE.md` | modify | §4.4 backfill step (C17) |

### Data Flow

```
Requests screen mounts ── useRequestsBackfill()
   │  ownerKey from useConfig() (null: signed out / devManagerView)
   ▼  setTimeout 5 s  (foreground useMyRequests refresh goes first)
startRequestsBackfillOnce(queryClient)
   │  loadConfig → guards (signed in, !devManagerView) → loadCredentials
   │  sync: backfillStartedFor.has(ownerKey)? → null : add
   ▼
runRequestsBackfill(owner, credentials, deps)
   │  readRequestsStore ── 'unreadable' → stop
   └─► loop ─ planBackfillWeek(days, today, skip) ── null → 'complete'
              attempted ≥ 21 → 'cap'
              isOwnerConfigured(owner)? ── no → 'signed-out'
              allSettled(fetchWorkDiary × ≤7)  ──► shared limiter (≤4 in flight, FIFO,
              │                                    in-flight sharing with the queryFn)
              arrays → StoredRequestDay (groupSlotsIntoEntries, isDaySettled)
              ≥1 fulfilled → updateRequestsStore ── null → 'signed-out'
              │               └─► onWeekStored(store) → setQueryData(['myRequests', id])
              │                   (only over a 'success' same-owner/legacy view,
              │                    composeRequestsView, dataUpdatedAt kept)
              auth (non-retryable) → 'auth' · 429 → 'throttled' · 0 fulfilled → 'week-failed'
              skip += monday · sleep(500) · repeat
   ▼
log.info('requests.backfill_done', { weeksStored, daysStored, daysFailed, stopReason })
   ▼
approvals.tsx Older section (spec 04) renders the grown view
```

### Edge Cases

| Case | Handling |
|------|----------|
| Sign-out during a run | The next pre-week check (or the store's own pre/post check) fails → `'signed-out'`. No further fetch and no token mint (C3). `clearAll` wiped the store; `queryClient.clear()` dropped the view. |
| Env switch while the Requests tab is mounted | The old run stops at its next week (`'signed-out'`; its owner's store reads `empty` for the new owner anyway). `useConfig`'s new `ownerKey` schedules a run for the new owner (C10). |
| Foreground refresh during a run | Store writes are serialized. A refresh queued behind a backfill week waits for at most that week's ≤ 7 calls (two waves of 4). The two plans are disjoint (the queryFn only plans window dates, or older dates that have a record), so they rarely share a request; if they do, `fetchWorkDiary` shares it. |
| The queryFn resolves after a backfill week but built its view before it | That view lacks the week until the next `onWeekStored` or refresh, both of which compose from the full store. It heals itself, and no data is lost. |
| The view is errored (auth latch, outage) | No live update (C8). The weeks are stored and appear after the next successful refresh. |
| Persistent per-date server error (`docs/api-samples/06-workdiary-yesterday.json`, 400 `CROS-0400`), or dates the server never serves | The date stays a gap, is retried at most once per session, and a fully failed week stops the run (C11). |
| A PENDING backfilled day | Stored `settled: false`. Spec 02's `unsettled-old` rule re-checks it (6 h TTL) until it settles. |
| Retention moves forward (new week) | The oldest week is pruned by every write, and the planner never goes below `retentionStart`, so pruned weeks are never re-fetched. |
| Midnight or Monday rollover mid-run | `today` is fixed for the run. Its weeks stay older than the new `catchUpStart`. Pruning with the old `today` keeps at most one extra week until the next write. |
| App backgrounded mid-run | JS suspends and the run resumes. A kill loses only the in-flight week, and the next session replans from the gaps. |
| `setItem` throws | Spec 02's `updateRequestsStore` returns the merged store (not persisted, logged `requests.store_write_failed`). The run continues, and the next session refetches what was not persisted. |
| Dev manager preview (`devManagerView`) | No timer and no gate run. If it is switched on mid-run, the live update skips the `'dev-mock'` view (foreign `ownerKey`), and only real-owner data is stored. |

---

## Dependencies

### Internal
- Spec 02 (hard): `my_requests_v1`, `updateRequestsStore`, `composeRequestsView`, `requestWindows`, the `fetchWorkDiary` limiter and in-flight sharing.
- Spec 01: `isRetryableError`, token renewal inside `fetchWorkDiary` (`toAuthCreds`), the failed-login latch (a latched login is a non-retryable `AuthError` → `'auth'`).
- Spec 03 (soft, no code used): its keep-last-good rules. A failure never overwrites stored data (C7, C12), and the persisted cache keeps errored views that still hold data, which is why the live update leaves a `status: 'error'` view untouched (C8, FR3). The `setItem`-throws edge case is spec 02's `updateRequestsStore` behaviour, not spec 03's.
- Spec 04 (soft): the Older section renders backfilled entries.

### External
- `@tanstack/react-query` 5.104.5 (installed): `useQueryClient`, `QueryClient.getQueryState`, `setQueryData(key, data, { updatedAt })`.

### Assumptions
- The workdiaries endpoint serves at least 23 weeks back. `useHistoryBackfill` has read that depth in production since 1.0.
- A successful `[]` means "no slots that day", which is safe to store as a settled empty day (spec 02's rule).
- Rate limits are undocumented. Mitigation: sequential weeks, a 500 ms pause, the 4-slot global limit, a stop on 429 / a failed week / auth, and once per session per owner.
