# Auth Renewal

**Status:** Draft
**Created:** 2026-10-22
**Last Updated:** 2026-10-22
**Owner:** @jaime-alvarez-trilogy

**Feature:** [durable-data](../../FEATURE.md) · **Research:** [spec-research.md](spec-research.md) · **Branch:** `feat/sdk-58` (1.2.0) · **Fingerprint:** must stay `56d054fc723984e56892a367dca1efa79a9f8fad`

---

## Overview

The Crossover token is minted once per JS process and then reused forever. `resilience-fixes/04-auth-resilience` built an opt-in 401 / HTML-5xx re-mint-and-retry in `apiGet`/`apiPut` (a 5th `creds` argument), but wired no caller. This spec fixes that path and then turns it on everywhere.

**What gets built:**

1. **Single-flight renewal** (`src/api/client.ts`). The retry calls a new `invalidateIfCurrent(failedToken)` instead of `invalidateAuthToken()`. It clears `cachedToken` only if it still holds the token that failed, and it never touches `mintInFlight`. So N concurrent 401s share one re-mint, and a late 401 carrying the old token can never throw away a fresh one. A new `authGeneration` counter, bumped by `invalidateAuthToken()`, stops a mint that started before a sign-out or env switch from writing its token into the cache. A no-creds auth-like response also evicts its token (no retry), so the next `getAuthToken` mints fresh.
2. **Failed-login latch.** When the token endpoint rejects the credentials (an `AuthError` that is not `AUTH_HTML_500`), `getAuthToken` stores a non-reversible FNV-1a fingerprint of `env + username + password` for `LOGIN_LATCH_MS = 60_000`. Until then, `getAuthToken` with the same credentials throws `AuthError(…, {errorCode: AUTH_LOGIN_LATCHED})` without a network call. A different password or environment is not blocked; the only exception is a 32-bit fingerprint collision, which delays it by at most 60 s. A successful mint or `invalidateAuthToken()` clears the latch. `mintAuthToken` (the onboarding probe) bypasses it.
3. **Error classification** (`src/api/errors.ts`). Error-code constants (`AUTH_HTML_500`, `AUTH_LOGIN_LATCHED`, `NO_CREDENTIALS`, `HTML_5XX_AFTER_RENEWAL`). With creds, an HTML 5xx that is still HTML 5xx after a fresh token becomes a retryable `ApiError(status, …, {errorCode: HTML_5XX_AFTER_RENEWAL})`, not "Authentication error". `isRetryableError(err)` and `shouldRetryQuery(failureCount, err)` (`MAX_QUERY_RETRIES = 2`) are exported for specs 02, 03 and 05. No hook's `retry` option changes in this spec.
4. **Creds everywhere.** Every API wrapper except `fetchWorkDiary` (which already takes `credentials` and builds creds itself) gains an optional trailing `creds?: AuthCreds` and always forwards it as the last `apiGet`/`apiPut` argument. Every production call site passes `toAuthCreds(credentials, config.useQA)`. A static jest guard fails if a production call to `apiGet`, `apiPut` or a wrapper omits creds.
5. **Auth log events** via `src/lib/log.ts`: `auth.token_minted`, `auth.token_retried`, `auth.login_latched`. Meta keys are limited to `statusCode` / `triggerStatusCode`.
6. **Docs.** `docs/CROSSOVER_API.md` §2 (the stale "no caching" text) and §13, and `docs/ARCHITECTURE.md` §8.5.

JS-only. No new dependencies, no `package.json` / `app.json` / native changes.

---

## Clarification Decisions (Step 3, autonomous)

spec-research.md has no open questions. Checking it against the code (HEAD `968f1d5`) raised these points. Each was decided here:

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| C1 | Where do `AuthCreds` / `toAuthCreds` live? Research says `client.ts`. | **New pure module `src/api/authCreds.ts`** (imports only `type Credentials`). It exports `interface AuthCreds` and `toAuthCreds`. `client.ts` imports the type and re-exports it (`export type { AuthCreds } from './authCreds'`), but **not** the function. Production code imports `toAuthCreds` from `src/api/authCreds`. | Nine test files factory-mock `src/api/client` with only `getAuthToken`/`apiGet`/`apiPut`/`invalidateAuthToken` (`__tests__/auth-api.test.ts:7`, `use-approval-items.test.ts:30`, `use-role-refresh.test.ts:10`, `auth-screens.test.tsx:51`, `api/work-diary.test.ts:10`, `src/__tests__/api/team.test.ts:15`, `src/__tests__/lib/crossoverData.test.ts:13`, `src/hooks/__tests__/useTeamRoster.test.ts:16`, `useTeamAggregateData.test.ts:16`). If `toAuthCreds` came from `client.ts`, it would be `undefined` in every one of them, and the hooks under test would throw `TypeError`. A separate module needs no mock edits, and spec 02 can keep adding to the `client` factory without having to remember it. The type re-export keeps `import type { AuthCreds } from '../api/client'` (spec 03's signatures) valid. |
| C2 | Which mint failures latch? Research says "401/403 with a non-HTML body". | Latch iff the mint rejects with an `AuthError` whose `errorCode !== AUTH_HTML_500`. | `handleStatus` maps 401/403 to `AuthError` before its HTML check (`client.ts:165-166`), so a 401 is a credential rejection whatever its body. HTML 5xx becomes `AUTH_HTML_500`, and `NetworkError`/`ApiError` are not `AuthError`. This rule is the precise form of the research intent. |
| C3 | Does a mint that fails after `invalidateAuthToken()` still latch? | **No.** The latch is set (and `cachedToken` written) only if the mint is still current: `authGeneration` is unchanged since it started **and** `mintInFlight` is still its own promise (the same test as research Decision 6). | After a sign-out or env switch, the hard reset must leave no auth state behind (research Edge Case 1). A stale failure must not block the next sign-in for 60 s. |
| C4 | Log levels and the `auth.html_500_detected` name from the observability design. | `log.info('auth.token_minted', {})`, `log.warn('auth.token_retried', {triggerStatusCode})`, `log.warn('auth.login_latched', {statusCode})`. There is no separate `html_500_detected` event. | `warn` for a retry matches the observability research (`features/app/observability-and-reliability/specs/01-log-callsite-wiring/spec-research.md:36`). `triggerStatusCode >= 500` on `token_retried` already records an HTML-5xx trigger, because only HTML 5xx reaches the retry. Meta keys pass `redact.ts` (no `auth`/`token`/`name`/`*Id` substrings in the keys). |
| C5 | Where do the wrapper creds-forwarding tests go? Research proposes `approvals-creds.test.ts` plus `useHoursData.test.ts` for the timesheet. | **One new file `src/__tests__/api/wrappers-creds.test.ts`.** It factory-mocks `../../api/client` (`apiGet`, `apiPut`) and covers the approvals (6), `fetchTimesheet` (all 3 strategies) and `fetchPayments` wrappers. Team, work diary and auth stay in their existing files. | `__tests__/hooks/useHoursData.test.ts` drives the real `client.ts` through a `fetch` mock (`:57-63`), so it cannot see the `creds` argument. A client-mocked file asserts the exact forwarded object. |
| C6 | Wrappers that hold one `token` for several calls (`fetchTimesheet` strategies 2-3, `useHistoryBackfill`'s week loop, `useApprovalItems`' 6 fetches) keep using the pre-renewal token after a renewal. | **Accepted, no change.** | Each such call gets one extra 401. `invalidateIfCurrent(stale)` is then a no-op, because the cache already holds the fresh token, and `getAuthToken` returns that fresh token: **no extra mint**. The cost is bounded to the remainder of one queryFn run. Re-reading the token per call would touch more code for no correctness gain. |
| C7 | `fetchConfigFromAssignments` is private. Does it get creds? | Yes: a trailing `creds?: AuthCreds` param, passed by `fetchAndBuildConfig`. | Its `apiGet` call (`auth.ts:155`) is a production `apiGet` and falls under the static guard. |
| C8 | Exact-arg assertions broken by forwarding `undefined`. | Update each one listed in the research table. A call made without creds asserts an explicit trailing `undefined`. | Research Decision 4: Jest's `toHaveBeenCalledWith` fails on a trailing `undefined`. A grep of all `toHaveBeenCalledWith` / `toHaveBeenNthCalledWith` on the wrappers found no others. Code that inspects `.mock.calls[n][i]` by index (`auth-api.test.ts:173,295,308,421`, `work-diary.test.ts:103,110`) is unaffected. |
| C9 | Fingerprint algorithm details. | FNV-1a 32-bit over the UTF-16 code units of `` `${useQA ? 'qa' : 'prod'}\u0000${username}\u0000${password}` ``. Offset `0x811c9dc5`, prime `0x01000193` via `Math.imul`, `>>> 0`, 8-char zero-padded lowercase hex. A private helper in `client.ts`. | Pure JS with no crypto dependency, so the fingerprint is unchanged. It is not reversible to the password. Only this hash and the expiry stay in module memory. |
| C10 | Static-guard scanner details. | A test-local helper in `creds-wiring.test.ts`. For each call name matched with a word boundary, it skips an optional balanced `<…>` type-argument list, then scans the balanced `(…)` (string-literal aware). It skips matches on comment lines (`//`, `*`, `/*`) and declarations (`function name(`). | Production calls span lines (`useEarningsHistory.ts:107-112`, `timesheet.ts:39-44`) and use nested generics (`auth.ts:234` `apiGet<Array<{…}>>(`). |
| C11 | FR count. | 5 FRs: core renewal, latch, error classification, creds plumbing and wiring, docs. | Within the 3-5 guidance. Each FR maps to one test block. |

---

## Out Of Scope

1. **Wiring `shouldRetryQuery` into `useMyRequests`, throwing `AuthError(NO_CREDENTIALS)` from its queryFn, and the read-only `getAuthGeneration()` export.** **Deferred to [02-requests-store](../02-requests-store/spec-research.md).** This spec only defines `shouldRetryQuery`, `NO_CREDENTIALS` and `authGeneration`. `useMyRequests` keeps `retry: 2` unchanged here.

2. **`retry: (n, e) => n < 1 && isRetryableError(e)` in `useTimesheet` / `usePayments` / `usePaymentHistory` / `useTeamAggregateData`, and making `fetchTimesheet` / `fetchPayments` throw on transport errors.** **Deferred to [03-keep-last-good](../03-keep-last-good/spec-research.md).** This spec adds only their `creds?` parameter. The one-retry form is pinned by a table test here, so spec 03 inherits a tested contract.

3. **Requests-screen auth copy** (the "Please re-open the app" banner, `app/(tabs)/approvals.tsx:345-356`, and the neutral `'auth'` text). **Deferred to [04-requests-history-ui](../04-requests-history-ui/spec-research.md).**

4. **The backfill stop rule that uses `isRetryableError`.** **Deferred to [05-requests-backfill](../05-requests-backfill/spec-research.md).**

5. **Proactive token refresh by TTL.** **Descoped.** The token lifetime is undocumented (`docs/CROSSOVER_API.md:752-756,909`). Reactive renewal on 401 / HTML 5xx covers expiry without guessing a TTL (FEATURE.md Out of Scope).

6. **A minimum re-mint interval for a 401 that persists with a fresh token** (research Edge Case 8). **Descoped.** Each wave costs one *successful* mint, and the resulting `AuthError(401)` is classified as not retryable. Once specs 02/03 wire the predicate, no query-level retry follows. Until then, the existing numeric `retry` options re-run it a bounded number of times. Nothing proves a case where this matters, and the rule would add timing state.

7. **Changing `handleStatus`'s first-response mapping of HTML 5xx to `AuthError(AUTH_HTML_500)`.** **Descoped.** Pinned by `auth-resilience.test.ts` FR5.e / FR9.a-b and the no-creds caller semantics (research Decision 3). `isRetryableError` treats `AUTH_HTML_500` as retryable instead.

8. **Re-reading the token per call inside multi-call wrappers and loops** (Decision C6). **Descoped.** The cost is bounded: one extra 401 per remaining call and no extra mint.

9. **Backporting to `release/1.1` and a 1.0-runtime hotfix.** **Descoped from this spec.** They are tracked as FEATURE.md follow-ups F3 / F6 (release lanes, not specs).

10. **Any OTA, `eas`, `asc.js`, version bump, push or PR.** **Descoped.** Release mechanics are a separate, user-run step (`docs/RELEASING.md`).

---

## Functional Requirements

### FR1: Single-flight token renewal and mint generation guard

`apiGet`/`apiPut` re-mint once per wave of concurrent auth failures, never discard a fresher token, and never let a pre-reset mint repopulate the cache.

**Requirements:**
- Add `export function invalidateIfCurrent(token: string): void`, which runs `if (cachedToken === token) cachedToken = null`. It never touches `mintInFlight`, the latch or `authGeneration`.
- Add module state `let authGeneration = 0`. `invalidateAuthToken()` keeps `cachedToken = null; mintInFlight = null;` and adds `loginLatch = null; authGeneration++`. Its JSDoc states it is the hard reset for sign-out, env switch and not-contributor only.
- `getAuthToken` captures `gen = authGeneration` and its own promise `p` when it starts a mint:
  - on success it writes `cachedToken` (and clears the latch) only if the mint is still current: `gen === authGeneration && mintInFlight === p` (research Decision 6). It logs `log.info('auth.token_minted', {})` and resolves with the token in either case;
  - in `.finally` it sets `mintInFlight = null` only if `mintInFlight === p`.
- `apiGet` / `apiPut` with `creds`, on an auth-like first response (`shouldRetryAuth`):
  1. call `invalidateIfCurrent(token)` (not `invalidateAuthToken()`);
  2. get `fresh = await getAuthToken(creds.username, creds.password, creds.useQA)`;
  3. log `log.warn('auth.token_retried', { triggerStatusCode: response.status })`;
  4. retry once with `fresh`.
- `apiGet` / `apiPut` **without** `creds`, on an auth-like first response, call `invalidateIfCurrent(token)` and then `handleStatus` as today. There is still exactly one fetch and no retry.
- `client.ts` imports `log` from `../lib/log`. Meta carries no token, username or message.

**Success Criteria:**
- [ ] 15 concurrent `apiGet('/test', {}, 'stale', false, CREDS)` calls (the data endpoint returns 401 for `stale` and 200 for `fresh`, and the token endpoint resolves `fresh` after a deferred delay) make exactly **1** POST to `/api/v3/token`, excluding the seeding mint, and all 15 resolve with the 200 body.
- [ ] Interleaving: after caller A has re-minted to `fresh`, caller B's late 401 with `stale` leaves `cachedToken === 'fresh'` (the next `getAuthToken` makes 0 fetches), and B retries with `fresh` without a mint.
- [ ] `invalidateIfCurrent('other')` when the cache holds `fresh` is a no-op (the next `getAuthToken` makes 0 fetches).
- [ ] `invalidateIfCurrent(x)` during an in-flight mint does not null `mintInFlight`: a concurrent `getAuthToken` joins it (token POST count 1).
- [ ] Generation guard: start a deferred mint, call `invalidateAuthToken()`, then resolve the mint. The awaiting caller still receives its token, and the next `getAuthToken` mints again (2 token POSTs in total).
- [ ] Without creds, 401 → `AuthError(401)` after 1 data fetch, and a following `getAuthToken` mints (the token was evicted). The same holds for HTML 500 → `AuthError(AUTH_HTML_500)`.
- [ ] With creds, 401 → mint → 401 → `AuthError(401)` after exactly 2 data fetches (existing FR4.c is unchanged).
- [ ] `log.info` is called with `('auth.token_minted', {})` once per successful `getAuthToken` mint and never for `mintAuthToken`. `log.warn` is called with `('auth.token_retried', { triggerStatusCode: 401 })` (or `500` for HTML 500) once per retry. No log meta value equals the token, username or password.
- [ ] All existing `src/__tests__/api/auth-resilience.test.ts` FR1-FR9, `__tests__/client.test.ts`, `src/__tests__/api/client.test.ts` and `app/__tests__/modal-auth-cache.test.tsx` cases pass unmodified.

---

### FR2: Failed-login latch

A rejected login is remembered for 60 s per credential fingerprint, so a changed password cannot cause a storm of failed logins.

**Requirements:**
- Export `LOGIN_LATCH_MS = 60_000` from `client.ts`.
- Module state `let loginLatch: { fingerprint: string; until: number; statusCode: 401 | 403 } | null = null`.
- Add a private `fingerprintCreds(username, password, useQA): string` (Decision C9).
- `getAuthToken` checks, in this order: cached token → in-flight mint → latch → mint. If `loginLatch` matches the fingerprint and `Date.now() < loginLatch.until`, it throws `new AuthError(loginLatch.statusCode, 'Login recently rejected', { errorCode: AUTH_LOGIN_LATCHED })` without calling `fetch`.
- If a mint started by `getAuthToken` rejects with an `AuthError` whose `errorCode !== AUTH_HTML_500`, and the mint is still current (Decision C3), it sets `loginLatch = { fingerprint, until: Date.now() + LOGIN_LATCH_MS, statusCode: err.statusCode }`, logs `log.warn('auth.login_latched', { statusCode })`, and rethrows the original error.
- `NetworkError`, `ApiError` and `AUTH_HTML_500` mint failures never latch.
- A successful mint clears the latch. `invalidateAuthToken()` clears it (FR1).
- `mintAuthToken` neither reads nor writes the latch.
- The password and the `Basic` string are never stored in module state. Only the fingerprint is.
- A different password or environment is not blocked; the only exception is a 32-bit fingerprint collision (Edge Cases).
- Until specs 02/03 wire `isRetryableError`, hooks keep their numeric `retry`. A TanStack retry of a latched error (1 s / 2 s backoff, inside the 60 s window) therefore costs 0 fetches.

**Success Criteria:**
- [ ] A mint 401 rejects with `AuthError(401)`. A second `getAuthToken` with the same creds inside 60 s rejects with `AuthError`, `errorCode === 'AUTH_LOGIN_LATCHED'` and `statusCode === 401`, and makes **0** additional fetches. `log.warn('auth.login_latched', { statusCode: 401 })` fires exactly once.
- [ ] With `jest.spyOn(Date, 'now')` advanced by 60 001 ms, the same creds mint again (1 more fetch).
- [ ] A different password with the same username mints immediately. The same creds with the other `useQA` mint immediately.
- [ ] `invalidateAuthToken()` during the latch makes the next call mint.
- [ ] A successful mint clears the latch. Latch creds A, mint successfully with creds B, call `invalidateIfCurrent(tokenB)` (which does not touch the latch), and then `getAuthToken(A)` makes 1 fetch.
- [ ] `mintAuthToken` during the latch makes 1 fetch.
- [ ] With creds and during the latch, `apiGet` 401 rejects with the latched `AuthError` after exactly 1 data fetch and 0 token POSTs.
- [ ] A mint `NetworkError` does not latch (the next call fetches). A mint HTML 500 (`AUTH_HTML_500`) does not latch. A mint 403 latches with `statusCode === 403`.
- [ ] A mint 401 that settles after `invalidateAuthToken()` does not latch (the next same-creds call fetches).
- [ ] `__tests__/client.test.ts` "throws AuthError(401) on 401 response" (`:47`) and its neighbours still pass, because `beforeEach(invalidateAuthToken)` clears the latch.

---

### FR3: Error-code constants, HTML 5xx after renewal, and the shared retry predicate

Failures are classified so queries retry outages but never retry credential problems.

**Requirements:**
- `src/api/errors.ts` exports `AUTH_HTML_500 = 'AUTH_HTML_500'`, `AUTH_LOGIN_LATCHED`, `NO_CREDENTIALS`, `HTML_5XX_AFTER_RENEWAL` (each with the same string value) and `MAX_QUERY_RETRIES = 2`. `client.ts` uses the constants instead of the `'AUTH_HTML_500'` literal (`client.ts:176`).
- `apiGet` / `apiPut` with creds: if the **retried** response is HTML 5xx (`status >= 500` and `content-type` includes `text/html`), throw `new ApiError(status, 'Server error after token renewal', { errorCode: HTML_5XX_AFTER_RENEWAL })` **without reading the body**. Any other non-OK retried response still goes through `handleStatus`.
- `isRetryableError(err: unknown): boolean`:
  - `AuthError` → `err.errorCode === AUTH_HTML_500`;
  - `NetworkError` → `true`;
  - `ApiError` → `statusCode >= 500 || statusCode === 408 || statusCode === 429`;
  - anything else → `true`.
- `shouldRetryQuery(failureCount: number, error: unknown): boolean` returns `failureCount < MAX_QUERY_RETRIES && isRetryableError(error)`.
- No hook's `retry` option changes in this spec (Out of Scope 1-2).

**Success Criteria:**
- [ ] With creds: HTML 503 → mint → HTML 503 rejects with `ApiError`, `statusCode === 503`, `errorCode === 'HTML_5XX_AFTER_RENEWAL'`, and `isRetryableError(err) === true`. The second response's `text` mock is called 0 times.
- [ ] The `apiPut` mirror behaves the same, and the retry fetch carries the same serialized body.
- [ ] With creds: HTML 500 → mint → 200 resolves (existing FR5.a). Without creds: HTML 500 → `AuthError(AUTH_HTML_500)` (FR5.e, FR9.a-b unchanged).
- [ ] `isRetryableError` returns true for `NetworkError`, `ApiError(500/502/503/408/429)`, `new TypeError()`, `AuthError(401, undefined, {errorCode:'AUTH_HTML_500'})` and `ApiError(503, …, {errorCode:'HTML_5XX_AFTER_RENEWAL'})`.
- [ ] `isRetryableError` returns false for `AuthError(401)`, `AuthError(403)`, `AuthError(401, …, {errorCode:'AUTH_LOGIN_LATCHED'})`, `AuthError(401, …, {errorCode:'NO_CREDENTIALS'})`, `ApiError(400)`, `ApiError(404)` and `ApiError(422)`.
- [ ] `shouldRetryQuery(0, NetworkError)` → true, `(1, NetworkError)` → true, `(2, NetworkError)` → false, `(0, AuthError(401))` → false.
- [ ] One-retry table (spec 03's form): `(n, e) => n < 1 && isRetryableError(e)` gives `(0, NetworkError)` → true, `(1, NetworkError)` → false, `(0, AuthError(401))` → false.
- [ ] The constants equal their string names, and `MAX_QUERY_RETRIES === 2`. They are all imported from `src/api/errors` in the test, which pins the exports.

---

### FR4: Creds on every wrapper and every production call site

Every production request can renew its own token.

**Requirements:**
- New `src/api/authCreds.ts` (Decision C1):
  - `export interface AuthCreds { username: string; password: string; useQA: boolean }`;
  - `export function toAuthCreds(c: Credentials, useQA: boolean): AuthCreds`, which returns `{ username: c.username, password: c.password, useQA }`.
- `client.ts`: `apiGet`/`apiPut` type their 5th param as `creds?: AuthCreds`, replacing the inline type at `:234,271`, and re-export `type AuthCreds`.
- Wrappers gain a trailing `creds?: AuthCreds` and always pass it, possibly `undefined`, as the last `apiGet`/`apiPut` argument:
  - `fetchTimesheet(config, token, creds?)`, all 3 strategies;
  - `fetchPayments(config, token, creds?)`;
  - `fetchPendingManual` / `fetchPendingOvertime(token, useQA, weekStartDate, creds?)`;
  - `approveManual(token, useQA, approverId, timecardIds, creds?)`;
  - `rejectManual(…, reason, creds?)`;
  - `approveOvertime(token, useQA, overtimeId, creds?)`;
  - `rejectOvertime(…, memo, creds?)`;
  - `fetchMyTeams(token, useQA, creds?)`;
  - `fetchTeamRoster(teamId, token, useQA, creds?)`;
  - `fetchReportTimesheet(member, weekStartDate, token, useQA, creds?)`;
  - `getProfileDetail(token, useQA, creds?)`;
  - the private `fetchConfigFromAssignments(token, useQA, username, creds?)`.
- `fetchWorkDiary` keeps its signature and passes `toAuthCreds(credentials, useQA)` as the 5th `apiGet` argument.
- `fetchAndBuildConfig` builds `toAuthCreds({ username, password }, useQA)` once and passes it to `getProfileDetail`, `fetchConfigFromAssignments` and the payments `apiGet` (`auth.ts:234`).
- These production call sites pass `toAuthCreds(credentials, config.useQA)`, built once per function where there are several calls (Decision C6):
  - `useTimesheet.ts:30`, `usePayments.ts:29`;
  - `useApprovalItems.ts:60-65,150,153,193,196`;
  - `useTeamRoster.ts:36,38`;
  - `useTeamAggregateData.ts:170`;
  - `useRoleRefresh.ts:43`;
  - `useEarningsHistory.ts:107`, `usePaymentHistory.ts:72`;
  - `useHistoryBackfill.ts:198` (`toAuthCreds({ username, password }, useQA)`);
  - `crossoverData.ts:86-87,157-158`.
  
  `fetchWorkDiary` callers inherit renewal automatically.
- Static guard `src/__tests__/api/creds-wiring.test.ts` (Decision C10):
  - **Scope:** every `.ts`/`.tsx` under `src/` and `app/`, excluding `__tests__` directories, `*.test.*` files and `src/api/client.ts`.
  - **Rule:** every call to `apiGet`, `apiPut`, `fetchTimesheet`, `fetchPayments`, `fetchPendingManual`, `fetchPendingOvertime`, `approveManual`, `rejectManual`, `approveOvertime`, `rejectOvertime`, `fetchMyTeams`, `fetchTeamRoster`, `fetchReportTimesheet`, `getProfileDetail` or `fetchConfigFromAssignments` must have an argument list that contains `creds` or `toAuthCreds(`.
  - **Self-test:** the guard first runs its scanner on two fixtures: a multi-line call without creds (must be flagged) and one with creds (must pass).
- Update the exact-arg assertions listed in [Technical Design → Existing tests that change](#existing-tests-that-change).

**Success Criteria:**
- [ ] `toAuthCreds({username:'u', password:'p'}, true)` deep-equals `{username:'u', password:'p', useQA:true}`.
- [ ] `fetchWorkDiary('79996','2026-03-09', {username:'u',password:'p'}, false)` calls `apiGet('/api/timetracking/workdiaries', {assignmentId:'79996', date:'2026-03-09'}, MOCK_TOKEN, false, {username:'u', password:'p', useQA:false})`.
- [ ] Each wrapper given `creds` passes the identical object (`toBe`) as the last `apiGet`/`apiPut` argument. `fetchTimesheet` does so on all 3 strategy calls (assert three calls when strategies 1-2 return `[]`). Each wrapper called without `creds` passes an explicit trailing `undefined`.
- [ ] `fetchAndBuildConfig('user@test.com','pass',false)`: `apiGet` nth-call 1 is `('/api/identity/users/current/detail', {}, MOCK_TOKEN, false, {username:'user@test.com', password:'pass', useQA:false})`.
- [ ] Hooks: `approveManual` is called with `('mock-token', false, userId, timecardIds, {username, password, useQA:false})`, and the same pattern holds for `approveOvertime`, `rejectManual`, `rejectOvertime` and the 6 pending fetches. `useTeamRoster` calls `fetchTeamRoster('2374', TOKEN, false, CREDS_WITH_ENV)`. `useTeamAggregateData` calls `fetchReportTimesheet(member, '2026-07-27', TOKEN, false, CREDS_WITH_ENV)`. `useRoleRefresh` calls `getProfileDetail(MOCK_TOKEN, config.useQA, CREDS_WITH_ENV)`. `fetchFreshData` calls `fetchTimesheet` / `fetchPayments` with `(config, token, CREDS_WITH_ENV)`.
- [ ] The static guard passes on the tree. Its self-test flags the creds-less multi-line fixture and passes the creds fixture. Temporarily reverting any one call site to its old arguments makes the guard fail (checked manually during implementation).
- [ ] `npm run typecheck` passes. Passing a bare `Credentials` (no `useQA`) where `AuthCreds` is expected is a type error.
- [ ] `src/hooks/__tests__/useMyRequests.test.ts:194,196` pass **unmodified**.

---

### FR5: Documentation

The docs describe the auth lifecycle the code now implements.

**Requirements:**
- `docs/CROSSOVER_API.md` §2: replace the "Per-request token (no caching)" subsection (`:56-64`) with "Token cache and renewal". It covers:
  - the in-memory cache and single-flight mint;
  - `invalidateIfCurrent` on 401 / HTML 5xx, with one re-mint and one retry when creds are passed (now every production call);
  - the 60 s failed-login latch, keyed by a fingerprint and never by the password;
  - the generation guard;
  - HTML 5xx after renewal becoming `ApiError(HTML_5XX_AFTER_RENEWAL)`.
- `docs/CROSSOVER_API.md` §13 (Error model):
  - document the four error codes and `isRetryableError` / `shouldRetryQuery`;
  - replace the "**No retry policy** anywhere" paragraph (`:716`) with the in-client single retry and the query-level predicate;
  - note the HTML 5xx → `AuthError(AUTH_HTML_500)` mapping on the first response.
- `docs/ARCHITECTURE.md` §8.5: state that renewal is wired at every call site (no longer opt-in only), and describe the latch and generation guard. Point to `src/api/authCreds.ts`.

**Success Criteria:**
- [ ] `grep -n "no caching\|no refresh-on-401\|No retry policy" docs/CROSSOVER_API.md` returns nothing.
- [ ] `docs/CROSSOVER_API.md` contains `LOGIN_LATCH_MS` (or "60 s"), `invalidateIfCurrent`, `AUTH_LOGIN_LATCHED`, `HTML_5XX_AFTER_RENEWAL` and `isRetryableError`.
- [ ] `docs/ARCHITECTURE.md` §8.5 no longer says renewal is only "opt-in", and it mentions the latch and `toAuthCreds`.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `src/api/client.ts` | Token cache `:14-15`, `mintAuthToken` `:26-56`, `getAuthToken` `:65-81`, `invalidateAuthToken` `:92-95`, `shouldRetryAuth` `:125-132`, `handleStatus` `:139-183`, `parseBody` `:209-217`, retry blocks `:251-255`, `:293-297` |
| `src/api/errors.ts` | `AuthError` / `NetworkError` / `ApiError` shapes |
| `src/lib/log.ts`, `src/lib/redact.ts` | `log.info/warn(category, meta)`. The deny-list forbids meta keys containing `auth`, `token`, `pass`, `name`, `text` or ending in `id` |
| `src/types/config.ts:30-33` | `Credentials` |
| `src/__tests__/api/auth-resilience.test.ts:36-104` | Response helpers (`makeTokenResponse`, `makeJsonErrorResponse`, `makeHtml5xxResponse`), `CREDS`, `beforeEach(invalidateAuthToken)` |
| `__tests__/helpers/expoLikeResponse.ts` | Single-read response helper for the "body not read" assertion |
| `app/modal.tsx:93,132`, `app/(auth)/not-contributor.tsx:28` | The only `invalidateAuthToken()` callers. They stay unchanged |
| `features/app/resilience-fixes/specs/04-auth-resilience/spec.md` | The original opt-in retry design and pinned tests |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/api/authCreds.ts` | create | `AuthCreds`, `toAuthCreds` (FR4, C1) |
| `src/api/client.ts` | modify | `invalidateIfCurrent`, `authGeneration`, latch + `LOGIN_LATCH_MS`, `fingerprintCreds`, retry via `invalidateIfCurrent`, no-creds eviction, HTML 5xx after renewal, `log` events, `creds?: AuthCreds`, `export type { AuthCreds }` (FR1-FR4) |
| `src/api/errors.ts` | modify | Constants, `isRetryableError`, `shouldRetryQuery`, `MAX_QUERY_RETRIES` (FR3) |
| `src/api/workDiary.ts` | modify | 5th arg `toAuthCreds(credentials, useQA)` |
| `src/api/timesheet.ts`, `src/api/payments.ts`, `src/api/approvals.ts`, `src/api/team.ts`, `src/api/auth.ts` | modify | Trailing `creds?` forwarded. `fetchAndBuildConfig` builds creds |
| `src/hooks/useTimesheet.ts`, `usePayments.ts`, `useApprovalItems.ts`, `useTeamRoster.ts`, `useTeamAggregateData.ts`, `useRoleRefresh.ts`, `useEarningsHistory.ts`, `usePaymentHistory.ts`, `useHistoryBackfill.ts` | modify | Pass `toAuthCreds(...)` |
| `src/lib/crossoverData.ts` | modify | Pass creds on the background path |
| `src/__tests__/api/auth-resilience.test.ts` | modify | `DD1.*` blocks: single-flight, interleaving, generation, eviction, latch, HTML after renewal, logs |
| `src/__tests__/api/retry-policy.test.ts` | create | FR3 predicate and constant tests |
| `src/__tests__/api/wrappers-creds.test.ts` | create | Approvals / timesheet / payments forwarding, plus `toAuthCreds` (C5) |
| `src/__tests__/api/creds-wiring.test.ts` | create | Static guard + scanner self-test |
| Existing tests (table below) | modify | Exact-arg updates and with-creds cases |
| `docs/CROSSOVER_API.md`, `docs/ARCHITECTURE.md` | modify | FR5 |

### Existing tests that change

| Test | Line(s) | Change |
|------|---------|--------|
| `__tests__/api/work-diary.test.ts` | `:93-98`, `:127-132` | Add the 5th expected arg `{ username, password, useQA: false\|true }` |
| `src/__tests__/api/team.test.ts` | `:108,119,204,215,489,506,517` | Calls without creds get `undefined` as the expected last arg. Add one with-creds case per function |
| `__tests__/auth-api.test.ts` | `:160-166` | Add the creds object as the 5th arg |
| `__tests__/use-approval-items.test.ts` | `:189,218,246,275` | Append the expected creds object, and add pending-fetch creds assertions |
| `__tests__/use-role-refresh.test.ts` | `:128-131` | Append the expected creds object |
| `src/hooks/__tests__/useTeamAggregateData.test.ts` | `:191,210` | Append creds to `fetchReportTimesheet` (`:189` `fetchWorkDiary` unchanged) |
| `src/hooks/__tests__/useTeamRoster.test.ts` | `:112-113` | Append creds |
| `src/__tests__/lib/crossoverData.test.ts` | new assertions | `fetchTimesheet`/`fetchPayments`/pending fetches called with the creds object |
| `src/hooks/__tests__/useMyRequests.test.ts` | `:194,196` | **Unchanged** |
| `__tests__/client.test.ts`, `src/__tests__/api/client.test.ts`, `auth-resilience.test.ts` FR1-FR9, `app/__tests__/modal-auth-cache.test.tsx` | all | **Unchanged and must pass** |

### Test Infrastructure

- `src/__tests__/api/auth-resilience.test.ts` keeps its `global.fetch` mock, the `../../store/config` mock, its response helpers and `beforeEach(invalidateAuthToken)`. The `DD1.*` blocks add:
  - `jest.mock('../../lib/log', () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))` for the event assertions;
  - a URL-routing `fetch` implementation (`/api/v3/token` vs data paths, keyed on the `x-auth-token` header);
  - a deferred-promise helper, so a mint can be held open while concurrent callers queue;
  - `jest.spyOn(Date, 'now')` for the latch expiry.
- `retry-policy.test.ts` is pure, with no mocks.
- `wrappers-creds.test.ts` factory-mocks `../../api/client` (`apiGet`, `apiPut`).
- `creds-wiring.test.ts` uses `fs` only.

### Verification

```
npx jest src/__tests__/api __tests__/client.test.ts __tests__/api/work-diary.test.ts __tests__/auth-api.test.ts \
  __tests__/use-approval-items.test.ts __tests__/use-role-refresh.test.ts __tests__/errors.test.ts __tests__/approvals-api.test.ts \
  src/hooks/__tests__/useTeamAggregateData.test.ts src/hooks/__tests__/useTeamRoster.test.ts src/hooks/__tests__/useMyRequests.test.ts \
  __tests__/hooks/useHoursData.test.ts src/__tests__/lib/crossoverData.test.ts app/__tests__/modal-auth-cache.test.tsx
npx jest && npm run typecheck && npm run lint          # lint: 0 errors
npx expo-updates runtimeversion:resolve --platform ios  # must print 56d054fc723984e56892a367dca1efa79a9f8fad
git diff --stat -- package.json package-lock.json app.json eas.json ios android patches plugins   # must be empty
```

### Data Flow

```
hook / crossoverData / auth.ts
  creds = toAuthCreds(credentials, config.useQA)          (src/api/authCreds.ts)
  token = getAuthToken(u, p, useQA)
            cachedToken? ──► return
            mintInFlight? ─► join
            latch(fp) active? ─► throw AuthError(AUTH_LOGIN_LATCHED)   [0 fetches]
            mint (gen = authGeneration, p):            current ≡ gen === authGeneration && mintInFlight === p
               ok   → if current: cachedToken = t, latch = null; log auth.token_minted
               Auth (≠AUTH_HTML_500) → if current: latch = {fp, now+60s, status}; log auth.login_latched
               finally → if mintInFlight === p: mintInFlight = null
  wrapper(…, token, creds) ──► apiGet/apiPut(path, …, token, useQA, creds)
            res = fetch(token)
            auth-like(res)?  (401 | HTML 5xx)
              creds:   invalidateIfCurrent(token) → fresh = getAuthToken(creds) → log auth.token_retried
                       res = fetch(fresh)
                       HTML 5xx again → throw ApiError(status, HTML_5XX_AFTER_RENEWAL)   [body unread]
              no creds: invalidateIfCurrent(token)   (no retry)
            !res.ok → handleStatus(res)    ok → parseBody(res)

TanStack retry (specs 02/03/05) ── isRetryableError / shouldRetryQuery (src/api/errors.ts)

sign-out / env switch / not-contributor ── invalidateAuthToken(): cache, in-flight, latch cleared; authGeneration++
```

### Edge Cases

| Case | Handling |
|------|----------|
| Sign-out or env switch during a mint | The generation guard drops the stale token and any stale latch (C3). Callers already awaiting still get their token, which targets their own old `useQA`. |
| Password changed on the server | The first 401 wave makes one re-mint, which gets a 401 → latch. Every other concurrent handler that has not yet joined throws the latched `AuthError` with 0 fetches; those that joined the in-flight mint get its 401. Both are classified as not retryable (`isRetryableError` false), so specs 02/03 stop retrying them. Until then, a numeric TanStack retry inside 60 s hits the latch and makes 0 fetches. |
| Onboarding with a wrong password, then retyping the same one within 60 s | `fetchAndBuildConfig` → `getAuthToken` throws latched `AuthError(401)`, so the credentials screen shows the same "invalid credentials" path with no network call. A corrected password has a different fingerprint and mints. `probeEnvironments` uses `mintAuthToken` and ignores the latch. |
| Cold start offline | The mint `NetworkError` is shared through `mintInFlight` and does not latch. Queries retry with backoff (`isRetryableError` true). |
| HTML 502/503 outage page | First response → re-mint → still HTML 5xx → `ApiError(HTML_5XX_AFTER_RENEWAL)` (retryable), not "Authentication error". |
| A 401 that persists with a fresh token | One successful mint per wave, then `AuthError(401)` (not retryable). No latch, because the password was accepted. Out of Scope 6. |
| Approve/reject PUT retried after a 401 or HTML 5xx | Safe: the rejected request was not applied. The body is re-serialized. `useApprovalItems` still restores and refetches in `finally`. |
| Callers holding the pre-renewal token (timesheet strategies, backfill loop, 6 approval fetches) | One extra 401 per call. `invalidateIfCurrent` is a no-op and `getAuthToken` returns the cached fresh token: no extra mint (C6). |
| Manager fetching a report's data (`useTeamAggregateData`) | The re-mint uses the manager's own creds, which is correct. |
| Fingerprint collision | A different password is delayed by up to 60 s at worst. No security impact. |
| Logging privacy | Only `statusCode` / `triggerStatusCode` (numbers) and an empty meta. `redact()` runs anyway. |
| A test leaks latch state between cases | Every client test file already calls `invalidateAuthToken()` in `beforeEach`, which now also clears the latch and bumps the generation. |

---

## Dependencies

### Internal
- `src/lib/log.ts` (logger singleton; already imported by hooks such as `useTeamAggregateData`).
- `src/lib/redact.ts` (meta redaction).
- `__mocks__/expo-file-system` (keeps `log` inert in jest).
- Consumers: spec 02 (`shouldRetryQuery`, `NO_CREDENTIALS`, `AUTH_HTML_500`, `authGeneration` via `getAuthGeneration()`), spec 03 (`isRetryableError`, `AuthCreds`), spec 04 (`NO_CREDENTIALS`, `AUTH_LOGIN_LATCHED`), spec 05 (`isRetryableError`).

### External
- None new. Crossover `POST /api/v3/token` (Basic auth) and the data endpoints, unchanged.

### Assumptions
- A 401/403 from `/api/v3/token` means the credentials were rejected, so latching is safe. A Tomcat HTML 5xx or a network failure means they were not judged.
- A 401 or HTML 5xx on a data request means it was not applied, so one PUT retry is safe.
- TanStack v5 calls `retry(failureCount, error)` with `failureCount` starting at 0 (`node_modules/@tanstack/query-core/src/retryer.ts`).
- The token TTL is unknown. Renewal is reactive only.
