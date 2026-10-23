# Feature: Durable Data

## Feature ID

`durable-data`

## Metadata

| Field | Value |
|-------|-------|
| **Domain** | app |
| **Feature Name** | Durable Data |
| **Contributors** | @jaime-alvarez-trilogy |
| **Owner** | @jaime-alvarez-trilogy |
| **Status** | Research complete, ready for spec → implement |
| **Created** | 2026-10-22 |
| **Branch / version** | `feat/sdk-58` (1.2.0), worktree `hg-worktrees/sdk58`, HEAD `6478321` |
| **Delivery** | JS-only. Fingerprint must stay `56d054fc723984e56892a367dca1efa79a9f8fad` (OTA-compatible with build 19+) |

## Files Touched

### API layer
- `src/api/client.ts` (modify — spec 01: single-flight re-mint, failed-login latch, mint generation guard, HTML 5xx after renewal, `AuthCreds`, auth logging; spec 02: read-only `getAuthGeneration()`)
- `src/api/authCreds.ts` (new — spec 01: `AuthCreds` type + pure `toAuthCreds()`, kept out of `client.ts` so the nine test files that factory-mock `src/api/client` still get a real `toAuthCreds`)
- `src/api/errors.ts` (modify — spec 01: error-code constants, `isRetryableError`, `shouldRetryQuery`; spec 03: `shouldRetryOnce`)
- `src/api/workDiary.ts` (modify — spec 01: pass creds; spec 02: global concurrency limit and in-flight sharing of identical requests)
- `src/api/timesheet.ts`, `src/api/payments.ts` (modify — spec 01: optional `creds`; spec 03: throw on transport failure)
- `src/api/approvals.ts`, `src/api/team.ts`, `src/api/auth.ts` (modify — spec 01: optional `creds`)

### Hooks
- `src/hooks/useMyRequests.ts` (modify — spec 02: store-backed planner queryFn, owner/dev-mock display rule; spec 04: forced refetch, restore-aware loading, `errorCode`)
- `src/hooks/useApprovalItems.ts`, `useTeamRoster.ts`, `useTeamAggregateData.ts`, `useRoleRefresh.ts`, `useTimesheet.ts`, `usePayments.ts`, `useEarningsHistory.ts`, `usePaymentHistory.ts`, `useHistoryBackfill.ts`, `useAIData.ts` (modify — spec 01: pass creds; spec 03: keep-last-good fixes — `shouldRetryOnce` in `useTimesheet`/`usePayments`; throw-on-failure plus `shouldRetryOnce` in `usePaymentHistory` (new `buildPaymentHistoryQueryFn`) and `useEarningsHistory` (reuses the builder); `shouldRetryOnce` plus a discriminated `MemberFetchResult` in `useTeamAggregateData`; `AuthError` no longer clears data in `useAIData`; `useAIData`/`useEarningsHistory`/`useHistoryBackfill` writers gate on `readWeeklyHistoryForWrite`)
- `src/hooks/useRequestsBackfill.ts` (new — spec 05)
- `src/lib/crossoverData.ts` (modify — spec 01: pass creds)

### Libraries
- `src/lib/limit.ts` (new — spec 02: `createLimiter`)
- `src/lib/requestsStore.ts` (new — spec 02: `my_requests_v1` store)
- `src/lib/requestsPlanner.ts` (new — spec 02: refresh planner; spec 05: backfill planner)
- `src/lib/requestRows.ts` (new — spec 04: grouping + "updated X ago")
- `src/lib/queryPersist.ts` (new — spec 03: dehydrate predicate; excludes the `'dev-mock'` view)
- `src/lib/weeklyHistory.ts` (modify — spec 03: `readWeeklyHistoryForWrite`)
- `src/store/config.ts` (modify — spec 02: `my_requests_v1` in `clearAll`)
- `src/types/requests.ts` (modify — spec 02: `MyRequestsData`, optional `staleDates` / `updatedAt` / `ownerKey`; spec 04: optional `errorCode`)

### Screens / app shell
- `app/(tabs)/approvals.tsx` (modify — spec 04: Older section, freshness note, pull-to-refresh state; spec 05: mount backfill)
- `app/_layout.tsx` (modify — spec 03: `dehydrateOptions`; spec 04: restore-aware auth gate / splash / overlay)
- `app/modal.tsx` (modify — spec 02: the env switch removes `['myRequests']` before `invalidateQueries()`)

### Docs
- `docs/CROSSOVER_API.md` (modify — spec 01: §2 "no caching" is stale; token renewal + latch)
- `docs/ARCHITECTURE.md` (modify — spec 01 auth section; spec 02 requests store; spec 03 §8.8 keep-last-good paragraph, §3.2 `HOURGLASS_QUERY_CACHE` predicate row)

### Tests (new and updated, listed per spec in each spec-research.md)

## Table of Contents

- [Feature Overview](#feature-overview)
- [Intended State](#intended-state)
- [System Architecture](#system-architecture)
- [Decomposition](#decomposition)
- [Out of Scope](#out-of-scope)
- [Release Plan](#release-plan)
- [Changelog of Feature Specs](#changelog-of-feature-specs)

## Feature Overview

### Summary

Make Hourglass keep its data on the phone. Manual-time requests live in a per-day local store that only re-downloads days that can still change. No failed refresh ever replaces or wipes stored data. The Crossover login token renews itself once, single-flight, without failed-login storms.

### Problem Statement

**User report (2026-10-22, J, on 1.0):** old manual time requests and other data vanish "when it sleeps". Requirement: "We should be storing data, not pulling everything old again and again."

**Diagnosis** (workflow `wf_0cea77cc-a83`: 5 tracers, a jest reproduction, Opus synthesis and adversarial critique; summary in `memory/project_data_disappears_on_wake.md`). The data-path code is logically identical in 1.0 (`e7fb801`), 1.1 (`main`) and 1.2 (`feat/sdk-58`).

1. **RC1: a failed refresh is saved as a successful, smaller result (proven by code and a jest repro).**
   - `buildMyRequestsQueryFn` fetches every day from the Monday two weeks ago through today with `Promise.allSettled` (`src/hooks/useMyRequests.ts:85-87`) and never throws (`:121`).
   - If every day fails, it returns `{entries: [], error}` as a *success* (`:110-119`). If some days fail, their entries are dropped with `error: null` (`:94-105`).
   - TanStack Query replaces `data`. The persister keeps any `status === 'success'` query (`node_modules/@tanstack/query-core/src/hydration.ts:219-221`; there is no override at `app/_layout.tsx:171-176`), so the empty list is written to disk.
   - **Trigger:** every inactive→active AppState change refetches after the 60 s `staleTime` (`app/_layout.tsx:62-67`, `useMyRequests.ts:140`). That includes waking from sleep, Face ID and Notification Center. Each refetch sends 15-21 requests at once.
   - After an overnight kill, all of those requests share one token mint (`src/api/client.ts:70-80`), so one failed login fails every day at once.
2. **RC3: rolling window (by design).** Only Monday-two-weeks-ago through today is ever fetched (`useMyRequests.ts:76-82`), and the UI has only three buckets (`app/(tabs)/approvals.tsx:90-115`). Older requests drop off every Monday. This is the "old requests" part of the report.
3. **RC2: the token is never renewed.** The missing renewal is proven; whether it triggers this bug is plausible but unproven.
   - `cachedToken` has no expiry (`client.ts:14,65-81`).
   - The 401 re-mint only runs when a 5th `creds` argument is passed (`client.ts:251-255,293-297`), and no production call passes it (`src/api/workDiary.ts:23-28` and 16 other sites).
   - Spec `resilience-fixes/04-auth-resilience` built that path but chose not to wire callers, to avoid touching about 49 call sites (`features/app/resilience-fixes/specs/04-auth-resilience/spec.md:31,57-65`; `checklist.md:112`). No later spec wired it.
   - The unused path would also storm. `invalidateAuthToken()` nulls `mintInFlight` (`client.ts:92-95`), so 15 parallel 401s mean up to 15 mints.
4. **The same "failure saved as data" pattern** appears in several other places:
   - `fetchTimesheet` and `fetchPayments` return `null` on transport errors (`src/api/timesheet.ts:37-70`, `src/api/payments.ts:50-63`). `useHoursData` then writes zeros to `hours_cache` and the widget (`src/hooks/useHoursData.ts:54-76`).
   - `useAIData` clears the AI tab on `AuthError` (`src/hooks/useAIData.ts:338-340`).
   - `usePaymentHistory` turns errors into `null` (`src/hooks/usePaymentHistory.ts:71-82`).
   - `useTeamAggregateData` returns all-zero team totals as a success (`src/hooks/useTeamAggregateData.ts:206-229`).
   - `loadWeeklyHistory` returns `[]` on a read error, and its writers save over 24 weeks of trend history (`src/lib/weeklyHistory.ts:114-124`).

### Goals

- Requests are stored on the phone per day and per assignment. Only days that can still change are re-downloaded automatically. Settled history is never re-pulled automatically; pull-to-refresh re-checks only the 3-week window.
- A failed refresh never replaces or wipes stored data: requests, hours, earnings, the widget, the AI tab, the trend line or team totals.
- The login token renews automatically: once, single-flight, and with a 60 s latch so a changed password cannot cause failed-login storms.
- Request history builds up beyond the current 3-week window, up to 24 weeks, and older weeks are backfilled once, gently.
- Sign-out still wipes everything.
- JS-only and OTA-compatible. TDD with the repo's existing jest patterns.

### Non-Goals

- New native dependencies such as NetInfo or `expo-network`. They would change the fingerprint (see [Out of Scope](#out-of-scope)).
- Redesigning the manager approvals queue. `useApprovalItems` already throws and keeps its data (diagnosis repro (d); `src/hooks/useApprovalItems.ts:59-66`).
- Changing how manual entries are grouped (same-memo merge, `src/lib/requestsUtils.ts:52-59`). The store keeps today's grouping semantics.

## Intended State

On first launch after the update, the app fetches the current 3-week window once and stores every day it gets back in `my_requests_v1` (AsyncStorage), whether or not the day has requests. After that:

- **Opening or waking the app** re-downloads:
  - today;
  - yesterday, if its copy is 60 minutes old or more;
  - any day **in the 3-week window** with a PENDING request, if its copy is 15 minutes old or more.
- **Older days that are not yet settled** (before the 3-week window, including days with a PENDING request) are re-checked at most every 6 hours. The 15-minute PENDING rule does not apply to them (spec 02 Decision 3, `unsettled-old`).
- **Once per calendar day**, the current week's other days are re-checked, and so is any day of a closed week in the 3-week window that is not yet settled.
- **Settled days are never re-downloaded automatically.** A day is settled when it has no PENDING request and was fetched on or after the Tuesday after its week, which is safely past the Sunday 23:59 UTC timecard deadline in every time zone (`docs/CROSSOVER_API.md:694-696`). Pull-to-refresh (or Retry) re-checks the 3-week window only, settled days included. Settled days older than that are never re-downloaded.
- **Request budget** (spec 02 Decision 3): a typical wake goes from 15-21 `fetchWorkDiary` calls to 1-2. The first wake of a day sends 3-9. Pinned by the spec 02 wake-budget tests.
- **Backfill:** once per app session, the Requests screen backfills older weeks back to 24 weeks, one week at a time, and resumes where it left off.
- **When a refresh fails**, the screen keeps showing what it had, with a quiet note such as "Showing saved requests · updated 2 h ago". The query goes into the error state and retries with backoff, except for auth failures (a refused login, a missing saved sign-in, or a 401/403 even with a fresh token), which retrying cannot fix. The auth note is neutral about which of these it is (spec 04 Decision 2).
- **When the token is rejected**, exactly one new token is minted for all concurrent requests, and each request is retried once. If the password was changed, the failed login is remembered for 60 s, so no further logins are attempted with that password until then.
- **Hours, earnings, the AI tab, the trend line and team totals** behave the same way: a transport failure is an error, never a zero.

### Key Behaviors

1. **Store-first requests**: the Requests list is built from the local per-day store; the network only refreshes it.
2. **Merge per day, never replace**: a day is overwritten only by that day's own successful fetch. A successful fetch that returns no manual slots really clears that day; a failed fetch leaves it alone, byte for byte. Entries already on screen for a date that has no stored record (failed days, or the hydrated 1.1 blob) are carried forward in the view only, until the server gives that date a record.
3. **Total failure throws**: when every planned day fails, the queryFn rejects, so TanStack keeps the previous data and retries. If the TanStack cache is empty (cold start more than 24 h after the last save, when the persister drops the snapshot per `app/_layout.tsx:173`), the stored view is seeded into the cache first.
4. **Single-flight renewal**: `invalidateIfCurrent(failedToken)` and a shared in-flight mint mean N concurrent 401s cause one re-mint. A failed login latches for 60 s, keyed by a hash of the credentials, never by the password itself.
5. **HTML 5xx is not fatal**: a Tomcat HTML 5xx triggers a re-mint and one retry. If it is still HTML 5xx with a fresh token, it becomes a retryable `ApiError`, not "Authentication error".
6. **Bounded traffic**: at most 4 work-diary requests are in flight app-wide (one limiter inside `fetchWorkDiary`). Concurrent identical requests (same assignment, date and environment) share one in-flight promise. There is no time-based memo, and `invalidateAuthToken()` retires every shared entry. So the wake-time duplicate of today's diary (`useAIData` plus My Requests) is downloaded once.
7. **Sign-out wipes**: `my_requests_v1` is added to `clearAll()`. Store writes check the owner before writing and verify it after writing, removing the key if the user signed out in between. So an in-flight refresh or backfill cannot re-create the store after sign-out.
8. **No environment mixing**: the store is owned by `{assignmentId, useQA}`, and the cached view carries an `ownerKey` stamp. The env switch removes `['myRequests']` before it invalidates, so no legacy, prod or QA view survives a switch. A foreign view is never shown or carried forward, even under the same `['myRequests', assignmentId]` query key. The manager-preview view (`ownerKey: 'dev-mock'`) is shown only while `devManagerView` is on, and is never persisted (spec 03's dehydrate predicate).

### Upgrade Path (build 19 / 1.1 → this feature)

| Existing on-device data | What happens | Lost? |
|---|---|---|
| `HOURGLASS_QUERY_CACHE` `['myRequests', id]` = `{entries, error}` | The key is unchanged, so the blob hydrates and renders (optional new fields default). The first run fetches the 3-week window into the new store. A total failure throws, so the blob stays on screen. Entries for dates without a record (including dates older than the window) are carried forward in the view until the server confirms them (spec 02 Decision 5; spec 05 backfills them). | No |
| `HOURGLASS_QUERY_CACHE` other queries | Unchanged keys and shapes. Spec 03 changes the persist predicate. It *adds* errored-with-data queries, and the only thing it drops is the manager-preview view stamped `ownerKey: 'dev-mock'`, which no 1.1/1.2.0 blob carries. There is no `buster`. | No |
| `hours_cache`, `ai_cache`, `earnings_history_v1`, `weekly_history_v2`, `widget_data` | Formats are unchanged. Spec 03 only stops failures from overwriting them. | No |
| A legacy blob already emptied by RC1 (`entries: []`) | Nothing to carry. The first successful run fills the store, and spec 05 backfills 24 weeks. | Already lost before the update. Recovered from the server |

## System Architecture

### Component Structure

```
app/(tabs)/approvals.tsx ──► useMyRequests() ─────────────► useQuery(['myRequests', assignmentId])
        │                         │ refetch() = forced              │ queryFn = buildMyRequestsQueryFn()
        │                         │                                 ▼
        └─► useRequestsBackfill() │        ┌──────────── planRequestRefresh() (pure, src/lib/requestsPlanner.ts)
              (spec 05)           │        │
                                  ▼        ▼
                      src/lib/requestsStore.ts  ◄── read / updateRequestsStore (serialized, owner-checked)
                      AsyncStorage 'my_requests_v1'
                                  ▲
                                  │ StoredRequestDay[]  (groupSlotsIntoEntries per successful day)
                      src/api/workDiary.ts  fetchWorkDiary ── share in-flight (gen|env|id|date) ── createLimiter(4) ──► apiGet(…, creds)
                                                                                       │
                      src/api/client.ts  getAuthToken (cache → in-flight → latch → mint)
                                          apiGet/apiPut: 401|HTML5xx → invalidateIfCurrent → re-mint once → retry once
```

### Data Flow

```
Wake / focus / pull-to-refresh
  → queryFn(ctx): loadConfig + loadCredentials
      devManagerView → MOCK_MY_REQUESTS, ownerKey 'dev-mock' (no store I/O; never persisted; shown only while the toggle is on)
      no creds       → (after the store read; seeds a cold cache) throw AuthError(NO_CREDENTIALS)   (TanStack keeps data)
  → readRequestsStore(owner) → baseDays
  → planRequestRefresh({today, nowMs, days: baseDays, force}) → dates[]
  → Promise.allSettled(dates.map(fetchWorkDiary))   (≤4 in flight globally; identical concurrent calls share one promise)
      a resolved non-array (empty body) counts as a failed day; a resolved [] is a stored empty day
      all failed → (seed stored view if cache empty) → throw first error
      some ok    → updateRequestsStore(owner, fetchedDays) → prune > 24 weeks
  → view = composeRequestsView(days, prior): store days + view-only carry-forward of same-owner prior entries whose date has no record
  → { entries, error: null, staleDates: failedDates, updatedAt, ownerKey }
  → persister writes HOURGLASS_QUERY_CACHE (success, or error-with-data after spec 03)

Hours: useTimesheet/usePayments → fetchTimesheet/fetchPayments throw on transport failure
  → isError → useHoursData write guard skips → serves hours_cache → widget gets last good values
```

## Decomposition

Specs run **sequentially in this one worktree**, in numeric order. Each one can be merged on its own, and each must keep `npm test`, `npm run typecheck` and `npm run lint` green, with the fingerprint unchanged.

| Spec | Description | Blocks | Blocked By | Complexity |
|------|-------------|--------|------------|------------|
| [01-auth-renewal](specs/01-auth-renewal/spec-research.md) | Single-flight re-mint via `invalidateIfCurrent`; 60 s failed-login latch; mint generation guard; HTML 5xx after a fresh token becomes a retryable `ApiError`; `isRetryableError` / `shouldRetryQuery`; optional `creds` on every API wrapper; every production call site passes `{username, password, useQA}`; auth log events | 02, 03 | — | M |
| [02-requests-store](specs/02-requests-store/spec-research.md) | Versioned per-assignment per-day `my_requests_v1` store as source of truth; pure refresh planner; per-day merge only on success; total failure throws (seed-then-throw on a cold cache); global work-diary concurrency limit of 4 with in-flight sharing of identical requests; 24-week retention; sign-out wipe; env switch removes the requests view | 03 (soft), 04, 05 | 01 | L |
| [03-keep-last-good](specs/03-keep-last-good/spec-research.md) | Timesheet and payments throw on transport errors (null only for a genuine "no row"); hours cache and widget keep last good values; `useAIData` keeps data on `AuthError`; `usePaymentHistory` and `useTeamAggregateData` throw instead of returning empties; weekly-history writers skip when the read failed; the persister also keeps error-with-data queries, but never the `'dev-mock'` view | — | 01, 02 (soft: its dev-mock cross-check reads the `ownerKey: 'dev-mock'` literal spec 02 adds) | M |
| [04-requests-history-ui](specs/04-requests-history-ui/spec-research.md) | Requests screen: "2 Weeks Ago" bounded, plus a collapsible "Older" section grouped by month; quiet "updated X ago" / "some days couldn't refresh" note instead of a red banner when data exists; neutral auth copy (`'auth'` is not always a rejected password); pull-to-refresh forces the 3-week window and keeps the spinner up; restore-aware loading (no "No requests yet" flash); restore-aware root auth gate (no welcome-screen bounce on cold start) | 05 (soft) | 02 | S |
| [05-requests-backfill](specs/05-requests-backfill/spec-research.md) | One-time, resumable, once-per-session backfill of older weeks (back to 24 weeks) into the store, week by week with a pause, stopping on failure; updates the query cache as weeks land | — | 02 (hard), 04 (soft: makes the weeks visible) | M |

**Release coupling:** each spec merges on its own, but 02 must not be released without 04. Otherwise stored entries older than the window land in the unbounded "2 Weeks Ago" bucket (`app/(tabs)/approvals.tsx:98`). 05 is optional and can be dropped or reverted on its own.

**Why 03 runs before 04:** both depend only on earlier specs, but 03 fixes live data loss that writes zeros to the home-screen widget (the critique's amendment 8). 04 is new UI.

## Out of Scope

| Item | Why excluded | Where it goes |
|------|--------------|---------------|
| NetInfo / `onlineManager` wiring | Needs `@react-native-community/netinfo` or `expo-network`. Neither is in `package.json` or `node_modules`, and adding one changes the native fingerprint (`docs/RELEASING.md` §E). Non-destructive failures plus retry backoff (specs 01-03) remove the need. | Not planned. Revisit only with a native release. |
| Widget "My Requests" wiring | `app/(tabs)/_layout.tsx:68` passes `undefined` as `myRequests`, so the widget never shows the user's own requests. Fixing it mounts `useMyRequests` app-wide and turns on widget colour/layout logic (`src/widgets/bridge.ts:174-205`). That needs on-device widget verification against the widget-vnext specs. Spec 02 makes the app-wide mount cheap (planner plus limiter), which unblocks it. | Follow-up **F1** (new spec in `features/app/widget-vnext/` after spec 02 lands). |
| Background manager approvals carry-forward | `fetchFreshData` turns two failed approval fetches into `pendingCount: 0` (`src/lib/crossoverData.ts:152-166`). The handler then advances the push-dedup ID set from that empty list (`src/notifications/handler.ts:72-90`). A carry-forward needs the raw last-good items: `widget_data` stores formatted items (`src/widgets/bridge.ts:331-367`), so it means a new key plus dedup changes. It is manager-only and tied to the approvals queue. | Follow-up **F2** (manager approvals; shares scope with the queue redesign). |
| Manager approvals queue redesign | The queue fetches only PENDING by design (`src/api/approvals.ts:15-43`) and already keeps data on failure (`useApprovalItems` uses `Promise.all`, `:59-66`). | Not planned in this feature. |
| Backport to 1.1 (`release/1.1`) | 1.1 users need the same fix via the B2 hotfix lane (`docs/RELEASING.md:72-94`), but only after 1.1.0 / build 18 is `READY_FOR_SALE`. The data-path files are near-identical (diagnosis: `useMyRequests.ts`, `workDiary.ts`, `client.ts` except `parseBody`, `timesheet.ts`, `useAIData.ts`), so `git cherry-pick -x` is expected to apply. 1.0 users cannot get any 1.2/1.1 OTA because their runtime is `appVersion` "1.0.0" (critique correction 1). | Follow-up **F3** (B2 lane, one cherry-pick per spec). |
| 1.0-runtime hotfix for users still on 1.0 (build 15) | The critique's preferred way to reach the reporting user (J, on 1.0) by OTA: a branch from `e7fb801` published to runtime `"1.0.0"` (1.0 uses `runtimeVersion.policy: "appVersion"`, `git show e7fb801:app.json:110-112`). The data-path files are logically identical (diagnosis). But that branch is SDK 55 (`e7fb801:package.json` `"expo": "~55.0.0"`), so the port must be re-verified against its own test suite rather than assumed to cherry-pick cleanly. Whether 1.0 has received any OTA since `e7fb801` is unverified (no EAS access in research). | Follow-up **F6**, owner's call. The alternative is J updating from the App Store once a build with this feature is live. |
| Any OTA publish, `eas`, `asc.js`, version bump, commit/push | Release mechanics are a separate, user-run step (`docs/RELEASING.md`). | Follow-up **F3** / the native release checklist. |
| Raising persister `maxAge` / `gcTime` beyond 24 h | Requests get their own store (spec 02) and hours have `hours_cache`. A longer `maxAge` would make the whole-blob rewrite (`query-persist-client-core/src/persist.ts:166-205`) grow with week-keyed queries, for little gain. | Not planned. |
| `useHoursData` mixed freshness (stale timesheet + fresh payments reported as live) | Real but cosmetic. The TanStack error reducer keeps old `data` (`query-core/src/query.ts:977-991`), so `hasLiveData` can be true with one stale half (`useHoursData.ts:88-89`). It is not data loss. | Follow-up **F4**. |
| Same-memo merge of same-day requests | `groupSlotsIntoEntries` groups by `(date, memo)` (`requestsUtils.ts:52-59`). This is a display issue, not data loss, and changing it changes entry `id`s. | Follow-up **F5**. |
| Apply "store, don't re-pull" to `useAIData`'s current-week per-day fan-out, and share per-day work-diary records between the AI history and the requests store | **The gap.** On every wake (AppState `'active'`, `src/hooks/useAIData.ts:375-383`), `shouldRefetchDay` (`src/lib/ai.ts:173-182`) re-downloads today plus every current-week day whose cached slot count is 0, such as days off and weekends. `refetch()` forces today again (`useAIData.ts:385-387`). Its `ai_cache` keeps per-day tag counts for the current week only (`pruneToCurrentWeek`, `useAIData.ts:76-90,192`). `useHistoryBackfill` fetches past weeks' diaries, but keeps only weekly aggregates in `weekly_history_v2` (`useHistoryBackfill.ts:190-225`), and the requests store keeps grouped manual entries. So the same day's work diary is downloaded separately for each. **Why deferred:** it is a separate data model (tag counts and app breakdown, not manual entries), with its own consumers: the AI tab, the widget and the weekly-history flush. This feature is about requests and failure handling. Spec 02's in-flight sharing already removes the concurrent duplicate of today. **Why it is a good next step:** a past day's AI% is final once the day ends, so the store-once rule is even simpler than for requests (no PENDING state). Confirm that finality (for example, late tag edits) when writing the spec. | Follow-up **F7**: a new spec in `features/app/durable-data/specs/` (06) after spec 02 lands. It adds a per-day work-diary record store shared by `useAIData`, `useHistoryBackfill` and the requests store, and reuses spec 02's planner rules and in-flight sharing. |
| Proactive token refresh by TTL | Token lifetime is undocumented (`docs/CROSSOVER_API.md:752-756,909`, "≥ 12 s"). Reactive renewal on 401 or HTML 5xx covers it without guessing. | Not planned. |

## Release Plan

1. Implement specs 01 → 05 on `feat/sdk-58`. Each spec's checklist ends with `npm test`, `npm run typecheck`, `npm run lint`, and `npx expo-updates runtimeversion:resolve --platform ios`, which must equal `56d054fc723984e56892a367dca1efa79a9f8fad`.
2. Ship in 1.2.0 (build 19 or 20), or as an OTA to the 1.2 runtime after build 19 is `READY_FOR_SALE` (`docs/RELEASING.md` §A/§C).
3. F3: cherry-pick to `release/1.1` and publish via B2 once 1.1.0 is live.
4. Reaching J, who is on 1.0:
   - **No OTA from this branch reaches a 1.0 install.** 1.0's runtime is `"1.0.0"` (appVersion policy), while 1.1/1.2 use fingerprint runtimes (critique correction 1).
   - J either installs the App Store build that contains this feature, or the owner chooses follow-up F6 (a 1.0-runtime hotfix).
   - For any OTA lane (1.2 runtime, or F3/F6), tell users the update applies on the **next cold start** after it downloads, so they should force-quit and reopen, twice to be safe. expo-updates defaults apply because there is no `checkAutomatically` override in `app.json` (critique amendment 6).

## Changelog of Feature Specs

| Date | Spec | Description |
|------|------|-------------|
| 2026-10-22 | [01-auth-renewal](specs/01-auth-renewal/spec.md) | **Complete.** Single-flight token renewal (`invalidateIfCurrent` + mint generation guard) and a failed-login latch (`AUTH_LOGIN_LATCHED`, 60 s, FNV-1a credential fingerprint) added to `src/api/client.ts`. New error-code constants and `isRetryableError`/`shouldRetryQuery` in `src/api/errors.ts`. New `src/api/authCreds.ts` (`AuthCreds`, `toAuthCreds`); every API wrapper and every production call site now forwards creds, enforced by a static scanner (`src/__tests__/api/creds-wiring.test.ts`). `docs/CROSSOVER_API.md` §2/§13 and `docs/ARCHITECTURE.md` §8.5 updated. TDD: tests (`4a4b7e3`, `1198bdb`, `b391838`, `61c15be`) → implementation (`1c98971`, `8fcf1ff`, `d619a30`, `96e0ad7`, `765fdc7`) → review fixes (`104dd24`) → test-quality pass (`ede5409`) → docs (this commit). Focused suite 572/572 passing (19 suites); full repo suite 5523/5523 (189 suites); `tsc --noEmit` clean; lint 0 errors; iOS fingerprint unchanged at `56d054fc723984e56892a367dca1efa79a9f8fad`. |
| 2026-10-22 | [02-requests-store](specs/02-requests-store/spec.md) | **Complete.** Versioned `my_requests_v1` AsyncStorage store (`src/lib/requestsStore.ts`) is now the source of truth for My Requests, read/written by a pure refresh planner (`src/lib/requestsPlanner.ts`: TTL/settlement rules, 24-week retention, wake-budget tuned). `src/hooks/useMyRequests.ts`'s `buildMyRequestsQueryFn` merges per day on success only and throws on total failure (seeding a cold TanStack cache from the store first); `selectMyRequests`/`toRequestsError` gate the view by owner and surface a neutral auth/network error; the hook now uses `retry: shouldRetryQuery`. `src/api/workDiary.ts` adds a 4-concurrency FIFO limiter (`src/lib/limit.ts`) and in-flight sharing of identical requests, keyed by `getAuthGeneration()` (new in `src/api/client.ts`) so a token renewal doesn't let a stale call join a new one. `src/store/config.ts`'s `clearAll` now wipes `my_requests_v1`, and `app/modal.tsx`'s environment switch removes the `['myRequests']` query before invalidating so no prod/QA/legacy view leaks across environments. `docs/ARCHITECTURE.md` §3.2/§3.3/§4/§8.5/§8.8 updated. TDD: tests (`bfd62c7`, `368141d`, `8d51bab`, `e3720aa`, `ea8df51`) → implementation (`9c7f4fb`, `f738a35`, `9e5f9f8`, `7572284`, `694dfad`) → review fixes (`3654fd6`, `cdda487`) → test-quality pass (`d718aa3`) → docs (this commit). Focused suite 451/451 passing (15 suites); full repo suite 5778/5778 (193 suites); `tsc --noEmit` clean; lint 0 errors (516 warnings); iOS fingerprint unchanged at `56d054fc723984e56892a367dca1efa79a9f8fad`. [Checklist](specs/02-requests-store/checklist.md). |
| 2026-10-22 | [03-keep-last-good](specs/03-keep-last-good/spec.md) | **Complete.** `fetchTimesheet`/`fetchPayments` now throw on every transport failure (`null` only for a genuine no-row response); `useTimesheet`/`usePayments`/`usePaymentHistory`/`useEarningsHistory`/`useTeamAggregateData` all retry through the new shared `shouldRetryOnce` (`src/api/errors.ts`). `usePaymentHistory` exports `buildPaymentHistoryQueryFn`, now reused by `useEarningsHistory`. `useTeamAggregateData`'s `MemberFetchResult` is a discriminated union on `failed`, and the queryFn throws when every member fails. `useAIData` no longer clears `data` on `AuthError`. `src/lib/weeklyHistory.ts` adds `readWeeklyHistoryForWrite` (returns `null`, logs `history.read_failed`, only when the store can't be read); `useAIData`, `useEarningsHistory` and `useHistoryBackfill`'s `runBackfill` (now exported) all gate their saves on it. New `src/lib/queryPersist.ts` (`shouldDehydrateQuery`, `DEV_MOCK_OWNER_KEY`) wired into `app/_layout.tsx`'s `dehydrateOptions`: keeps `success` queries and errored queries that still hold data, but never the `'dev-mock'` manager-preview view. `docs/ARCHITECTURE.md` §3.2/§8.8 updated. TDD: tests (`9d14b6b`, `9a76fad`, `4d67ff8`, `19006c6`, `54fd9cc`) → implementation (`465519e`, `dbe79bc`, `3ba5adb`, `49313d9`, `1e4f1c9`) → review fixes (`3a7c0ce`: `MemberFetchResult` narrowed to a discriminated union; shared `__tests__/helpers/stripComments.ts` helper) → test-quality pass (`deb4963`: a behavioural FR4 case for `useEarningsHistory`'s weekly-history write, a pinned fake clock for FR2/FR4's UTC-day cases, de-duplicated static-check helpers) → docs (this commit). Focused suite 444/444 passing (18 suites); full repo suite 5888/5888 (197 suites); `tsc --noEmit` clean; lint 0 errors (533 warnings); iOS fingerprint unchanged at `56d054fc723984e56892a367dca1efa79a9f8fad`. [Checklist](specs/03-keep-last-good/checklist.md). |
| 2026-10-22 | [04-requests-history-ui](specs/04-requests-history-ui/spec-research.md) | Research: Older section, freshness note, forced pull-to-refresh |
| 2026-10-22 | [05-requests-backfill](specs/05-requests-backfill/spec-research.md) | Research: gentle resumable backfill of 24 weeks of requests |

### Dependency Graph

```
01-auth-renewal ──► 02-requests-store ──► 04-requests-history-ui ··► 05-requests-backfill
       │                    └───────────────────────────────────────► 05 (hard)
       └──────────► 03-keep-last-good
Execution order: 01 → 02 → 03 → 04 → 05
```
