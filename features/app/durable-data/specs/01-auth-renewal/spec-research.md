# Spec Research: Auth Renewal

**Date:** 2026-10-22
**Author:** @jaime-alvarez-trilogy
**Spec:** `01-auth-renewal`

---

## Problem Context

The Crossover token is minted once per JS process and never renewed. `getAuthToken` returns the module-level `cachedToken` forever (`src/api/client.ts:14,65-81`). Spec `resilience-fixes/04-auth-resilience` built a 401 / HTML-5xx re-mint-and-retry, but made it opt-in through an optional 5th `creds` argument (`client.ts:229-259`, `:266-301`). It then deliberately wired **no** caller, to avoid touching about 49 call sites (`features/app/resilience-fixes/specs/04-auth-resilience/spec.md:31`, Decision D2 `:57-65`, `checklist.md:112`). No later spec wired it, so every production call passes 4 arguments.

Credentials are already in scope at every call site (auth explorer table): `fetchWorkDiary` has a `credentials` parameter (`src/api/workDiary.ts:16-21`), and every hook calls `loadCredentials()`. Once a token is rejected, every refresh fails until a force-quit. The banner even says "Please re-open the app" (`app/(tabs)/approvals.tsx:345-356`), which does not reset the module.

The unused retry path has four further defects that must be fixed before it is turned on:

1. **Storm.** The retry calls `invalidateAuthToken()`, which also nulls `mintInFlight` (`client.ts:92-95`, `:252`, `:294`). With N parallel 401s, up to N mints run, and late callers discard a freshly minted token (diagnosis RC2, "hidden bug").
2. **Failed-login storm.** If the token request itself fails fast (password changed), `mintInFlight` is cleared in `.finally` (`client.ts:77-79`). Every later 401 handler, in every hook, starts another Basic-auth login: up to 21 per wake. Crossover's lockout policy is undocumented (`docs/CROSSOVER_API.md` has no lockout or rate-limit text; critique amendment 4).
3. **HTML 5xx is treated as auth.** `handleStatus` turns any HTML 5xx into `AuthError(401, AUTH_HTML_500)` (`client.ts:172-180`). A load balancer's 502/503 page is HTML too. So a retry rule like "never retry AuthError" would stop retrying during a real outage and show "Authentication error" (critique amendment 3).
4. **Stale mint after sign-out.** If `invalidateAuthToken()` runs while a mint is in flight, the old promise's `.then` still sets `cachedToken = t` (`client.ts:73-76`). A token from the old account or environment can survive sign-out or an environment switch.

Scope: `client.ts` renewal semantics, a shared retry predicate, optional `creds` on every API wrapper, every production call site passing creds, and the first `log.*` auth events.

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| Optional trailing arg for opt-in behaviour | `apiGet`/`apiPut` `creds?` (`client.ts:234,271`) | Keeps old call sites compiling. Reused here for every wrapper's new `creds?`. |
| Single-flight promise dedup | `getAuthToken` `mintInFlight` (`client.ts:70-80`) | Correct for first callers. Broken only by `invalidateAuthToken()` inside the retry. |
| Cache-bypass mint | `mintAuthToken` used by `probeEnvironments` (`src/api/auth.ts:272-291`) | Must keep bypassing the cache **and** the new latch (onboarding probe, spec 04 FR8). |
| Synthetic error envelope | `AuthError(401, undefined, {errorCode:'AUTH_HTML_500'})` (`client.ts:175-178`) | Reuse the pattern for `AUTH_LOGIN_LATCHED`, `NO_CREDENTIALS`, `HTML_5XX_AFTER_RENEWAL`. |
| Log category naming | `resilience-fixes` spec 08 design: `auth.token_minted`, `auth.token_retried`, `auth.html_500_detected` (`features/app/observability-and-reliability/specs/01-log-callsite-wiring/spec-research.md:9,36`) | Never implemented (`client.ts` does not import `log`). This spec lands the auth subset with those exact names. |
| Redaction | `src/lib/redact.ts` deny-list: `auth`, `token`, `pass`, `name`, `text`, `*Id` keys | Meta keys must avoid these substrings: use `triggerStatusCode`, `statusCode`, `attempt`. |
| Fail-fast fan-out keeps data | `useApprovalItems` `Promise.all` (`src/hooks/useApprovalItems.ts:59-66`) | A thrown auth error then becomes a TanStack error with data kept (diagnosis repro (d)). |

### Key Files

| File | Relevance |
|------|-----------|
| `src/api/client.ts` | Token cache (`:14-15`), `getAuthToken` (`:65-81`), `invalidateAuthToken` (`:92-95`), `shouldRetryAuth` (`:125-132`), `handleStatus` (`:139-183`), retry blocks (`:251-255`, `:293-297`) |
| `src/api/errors.ts` | `AuthError` (`:11-24`, `statusCode: 401\|403`, `errorCode`), `NetworkError` (`:26-32`), `ApiError` (`:34-49`) |
| `src/api/workDiary.ts:16-29` | Has `credentials`; calls `apiGet` with 4 args |
| `src/api/timesheet.ts:24-71` | `fetchTimesheet(config, token)`: 3 `apiGet` calls |
| `src/api/payments.ts:44-64` | `fetchPayments(config, token)` |
| `src/api/approvals.ts:15-122` | 6 functions taking `(token, useQA, …)` |
| `src/api/team.ts:24-117` | `fetchMyTeams`, `fetchTeamRoster`, `fetchReportTimesheet` |
| `src/api/auth.ts:49-58,150-160,187-245` | `getProfileDetail`, `fetchConfigFromAssignments`, `fetchAndBuildConfig` (payments call `:234-239`) |
| Hooks | `useTimesheet.ts:25-31`, `usePayments.ts:24-30`, `useApprovalItems.ts:37-66,125-157,173-197`, `useTeamRoster.ts:35-38`, `useTeamAggregateData.ts:144-170`, `useRoleRefresh.ts:29-43`, `useEarningsHistory.ts:103-112`, `usePaymentHistory.ts:67-77`, `useHistoryBackfill.ts:182,198-203`, `useAIData.ts:202,228-233,277`, `useMyRequests.ts:62,86` |
| `src/lib/crossoverData.ts:73-88,137,155-158` | Background push path |
| `app/modal.tsx:92-93,130-134`, `app/(auth)/not-contributor.tsx:28` | The only `invalidateAuthToken()` callers: sign-out, env switch, not-contributor |
| `src/types/config.ts:30-33` | `Credentials { username; password }` |
| `src/lib/log.ts:54-90` | `log.info/warn/error(category, meta?)`; class names only, never `.message` |
| `docs/CROSSOVER_API.md:56-64,752-756,767-778,909-910` | §2 "no caching" is stale; token TTL ≥ 12 s unknown; HTML 500 for bad tokens |

### Integration Points

- Every production `apiGet`/`apiPut` call path. After this spec, all of them pass `creds`.
- `invalidateAuthToken()` callers (sign-out, env switch, not-contributor) also reset the latch and bump the mint generation. Spec 02 keys its work-diary in-flight sharing on that generation, so the bump also stops any later call from joining a request started before the reset.
- The TanStack `retry` option. Both predicates are exported from `src/api/errors.ts`, and each consumer keeps its current retry count:
  - **`shouldRetryQuery`** (up to **two** retries, `MAX_QUERY_RETRIES = 2`) is consumed by spec 02: `useMyRequests` has `retry: 2` today (`useMyRequests.ts:142`).
  - **`isRetryableError`** is consumed directly by spec 03, with a **one**-retry rule, `retry: (n, e) => n < 1 && isRetryableError(e)` (spec 03 Decision 3 and its `useTimesheet` / `usePayments` row). It covers `useTimesheet`, `usePayments`, `usePaymentHistory` and `useTeamAggregateData`, which all have `retry: 1` today (`useTimesheet.ts:34`, `usePayments.ts:33`, `usePaymentHistory.ts:86`, `useTeamAggregateData.ts:283`).
  - Spec 05's backfill also uses `isRetryableError` for its stop rule.
- The background push handler (`src/notifications/handler.ts:69`, via `fetchFreshData`) inherits renewal through `fetchWorkDiary`/`fetchTimesheet`/`fetchPayments` creds.

---

## Key Decisions

### Decision 1: How to stop the re-mint storm

**Options considered:**
1. Keep `invalidateAuthToken()` in the retry: N parallel 401s → up to N mints. Rejected; this is the bug.
2. A global "renewing" mutex around the whole retry: serializes all retries, slow, and more state.
3. **`invalidateIfCurrent(failedToken)`**: clear `cachedToken` only if it still equals the token that failed, and never touch `mintInFlight`. Then `getAuthToken` either returns a token another caller already re-minted or joins the in-flight mint.

**Chosen:** Option 3.

**Rationale:** It needs no new locking. It reuses the existing single-flight mint and is correct under interleaving: a late 401 carrying the *old* token can never discard the *new* one. `invalidateAuthToken()` stays the "hard reset" for sign-out and env switch (critique risk: `invalidateIfCurrent` must not be reachable from those paths).

### Decision 2: Failed-login latch

**Options considered:**
1. No latch: up to 21 failed Basic logins per wake per hook. Rejected (lockout risk).
2. Latch on any mint failure: a network blip on a cold start would block all logins for 60 s. Rejected.
3. Latch keyed by username only: if the user then types the correct password during onboarding, it would be blocked for 60 s. Rejected.
4. Latch keyed by the exact credentials: storing the password or `Basic` string in module memory contradicts the synthesis guidance ("don't keep the password in memory longer"). Rejected.
5. **Latch keyed by a non-reversible 32-bit FNV-1a fingerprint of `env + username + password`, set only when the token endpoint answers 401/403 with a non-HTML body, held for `LOGIN_LATCH_MS = 60_000`, and cleared by a successful mint or by `invalidateAuthToken()`.**

**Chosen:** Option 5.

**Rationale:**
- A new password has a different fingerprint, so it is never blocked.
- A collision only delays a different password by up to 60 s.
- `NetworkError` and HTML 5xx from the token endpoint mean the server is unreachable or broken, not that the credentials are wrong, so they do not latch.
- `mintAuthToken` (used by `probeEnvironments`) bypasses the latch, as it already bypasses the cache (spec 04 FR8).
- 60 s matches the critique's "about 30-60 s" and is longer than one TanStack retry cycle (1 s + 2 s backoff). One wake therefore costs at most one failed login.
- Implemented in pure JS with no crypto dependency, so the fingerprint is unaffected.

### Decision 3: What HTML 5xx means after a renewal

**Options considered:**
1. Keep throwing `AuthError(AUTH_HTML_500)`. Queries would never retry a real outage, and the UI says "Authentication error".
2. Reclassify every HTML 5xx as `ApiError`. That breaks pinned tests `auth-resilience.test.ts` FR5.e (`:331`) and FR9.a/b (`:449,460`), and the no-creds caller semantics.
3. **Keep `handleStatus` as is for the first response, without creds. With creds, after a successful re-mint, if the retried response is *still* HTML 5xx, throw `ApiError(status, 'Server error after token renewal', {errorCode:'HTML_5XX_AFTER_RENEWAL'})`.** In addition, `isRetryableError` treats `AuthError` with `errorCode === 'AUTH_HTML_500'` as retryable.

**Chosen:** Option 3.

**Rationale:** A fresh token has just been accepted by the token endpoint, so a still-HTML 5xx is a server problem. Every pinned no-creds test keeps passing. The UI maps `AUTH_HTML_500` to `'network'`, not `'auth'` (spec 02 `toRequestsError`).

### Decision 4: How to deliver creds to `apiGet`/`apiPut`

**Options considered:**
1. Module-level session creds in `client.ts` (`setSessionCredentials`). This keeps the password in memory for the whole session, breaks the "no creds → no retry" tests (`__tests__/client.test.ts:292`, `auth-resilience.test.ts:273,331,387,449`), and was rejected by the synthesis.
2. Change `apiGet` to take creds instead of a token (spec 04 research's original idea). About 49 call sites, breaking.
3. **An optional trailing `creds?: AuthCreds` on every wrapper. Wrappers always forward `creds` (possibly `undefined`) as `apiGet`/`apiPut`'s 5th arg. Every production call site passes `toAuthCreds(credentials, config.useQA)`.**

**Chosen:** Option 3.

**Rationale:** The change is additive and type-safe, and the opt-in contract and its pinned tests stay. Forwarding `undefined` explicitly does change exact-arg assertions: Jest's `toHaveBeenCalledWith` fails on a trailing `undefined` (verified with `expect` + `jest-mock` from `node_modules`, `fn(1,2,undefined)` vs `toHaveBeenCalledWith(1,2)` → FAIL). Those assertions are enumerated in the Test Plan and updated in this spec, as the task requires.

### Decision 5: Renewal for any remaining no-creds caller

**Options considered:**
1. Leave as is: a no-creds 401 keeps the bad token cached forever.
2. **On an auth-like response without creds, call `invalidateIfCurrent(token)` before throwing.** Still one fetch and no retry, but the next `getAuthToken` (for example TanStack's retry) mints fresh.

**Chosen:** Option 2.

**Rationale:** This is defence in depth for future callers, and it does not change any asserted behaviour: the pinned tests check the fetch count and the error class. `probeEnvironments` tokens are never cached, so the eviction is a no-op there.

### Decision 6: Mint generation guard

**Chosen:** add `let authGeneration = 0`. `invalidateAuthToken()` increments it. A mint only writes `cachedToken` (and clears `mintInFlight`) if the generation is unchanged and `mintInFlight` is still its own promise.

**Rationale:** This closes defect 4 (a stale-environment token after sign-out or env switch). The caller already awaiting the old mint still gets its token: it was issued before sign-out, and its request targets the old `useQA` it was built with.

### Decision 7: Shared query retry predicate

**Chosen:**
- `isRetryableError(err)` returns:
  - `AuthError` → retryable only if `errorCode === 'AUTH_HTML_500'`;
  - `NetworkError` → true;
  - `ApiError` → retryable if `statusCode >= 500`, `408` or `429`;
  - anything else (`TypeError`, unknown) → true.
- `shouldRetryQuery(failureCount, error) = failureCount < MAX_QUERY_RETRIES && isRetryableError(error)`, with `MAX_QUERY_RETRIES = 2`.

**Rationale:**
- TanStack v5 calls `retry(failureCount, error)` with `failureCount` starting at 0 (`node_modules/@tanstack/query-core/src/retryer.ts`). So `< 2` equals today's `retry: 2` (`useMyRequests.ts:142`, `app/_layout.tsx:73`), and `shouldRetryQuery` is used where two retries are the current behaviour (spec 02).
- Hooks that retry once today (`retry: 1`) must not gain a retry. Spec 03 therefore uses `isRetryableError` directly, as `retry: (n, e) => n < 1 && isRetryableError(e)`, instead of `shouldRetryQuery`. Exporting the classifier separately from the count is what keeps each hook's retry count unchanged.
- A real login failure is already latched and retried once inside `apiGet`, so retrying it again at the query level only burns attempts.

---

## Interface Contracts

### Types

```typescript
// src/api/client.ts
/** Credentials + environment for the opt-in renew-and-retry path. */
export interface AuthCreds {
  username: string; // source: SecureStore 'crossover_username' via loadCredentials() (src/store/config.ts:52-58)
  password: string; // source: SecureStore 'crossover_password' via loadCredentials()
  useQA: boolean;   // source: CrossoverConfig.useQA (AsyncStorage 'crossover_config', src/types/config.ts)
}
// Replaces the inline `{ username; password; useQA }` type at client.ts:234,271 (structurally identical).

export const LOGIN_LATCH_MS = 60_000; // computed constant (Decision 2)

// Module state (not exported)
let cachedToken: string | null;            // existing (client.ts:14); source: mintAuthToken response body
let mintInFlight: Promise<string> | null;  // existing (client.ts:15)
let authGeneration: number;                // new; incremented by invalidateAuthToken(). Spec 02 adds a read-only getAuthGeneration() export (work-diary in-flight sharing key)
let loginLatch: {
  fingerprint: string;  // computed: fnv1a32(`${useQA ? 'qa' : 'prod'}\u0000${username}\u0000${password}`), 8 hex chars
  until: number;        // computed: Date.now() + LOGIN_LATCH_MS at the failed mint
  statusCode: 401 | 403;// source: AuthError.statusCode thrown by handleStatus for /api/v3/token
} | null;

// src/api/errors.ts — error-code constants (all synthetic, client-side)
export const AUTH_HTML_500 = 'AUTH_HTML_500';                  // existing literal at client.ts:176
export const AUTH_LOGIN_LATCHED = 'AUTH_LOGIN_LATCHED';        // new: getAuthToken refused during latch
export const NO_CREDENTIALS = 'NO_CREDENTIALS';                // new: config present, loadCredentials() null (used by spec 02)
export const HTML_5XX_AFTER_RENEWAL = 'HTML_5XX_AFTER_RENEWAL';// new: HTML 5xx even with a fresh token
export const MAX_QUERY_RETRIES = 2;                            // matches existing retry: 2
```

### Function Contracts

| Function | Signature | Responsibility | Dependencies |
|----------|-----------|----------------|--------------|
| `getAuthToken` | `(username: string, password: string, useQA: boolean) => Promise<string>` | Order of checks: cached token, then in-flight mint, then latch (throws `AuthError(latch.statusCode, 'Login recently rejected', {errorCode: AUTH_LOGIN_LATCHED})`), then mint. A mint failing with `AuthError` that is not `AUTH_HTML_500` sets the latch and logs `log.warn('auth.login_latched', {statusCode})`. Success clears the latch, writes `cachedToken` only if the generation is unchanged, and logs `log.info('auth.token_minted', {})`. | `mintAuthToken`, `log` |
| `invalidateIfCurrent` | `(token: string) => void` | `if (cachedToken === token) cachedToken = null`. Never touches `mintInFlight`, the latch or the generation. Exported for tests. | — |
| `invalidateAuthToken` | `() => void` | Existing hard reset: `cachedToken = null; mintInFlight = null;`, **plus** `loginLatch = null; authGeneration++`. | — |
| `mintAuthToken` | unchanged `(username, password, useQA) => Promise<string>` | Still bypasses the cache **and** the latch. | `fetch`, `handleStatus` |
| `apiGet` / `apiPut` | unchanged shape; `creds?: AuthCreds` | First fetch with `token`. If auth-like (`shouldRetryAuth`): with `creds`, call `invalidateIfCurrent(token)`, `fresh = await getAuthToken(...creds)`, log `auth.token_retried {triggerStatusCode}`, retry once; if the retry is still HTML 5xx, throw `ApiError(status, 'Server error after token renewal', {errorCode: HTML_5XX_AFTER_RENEWAL})` without reading the body. Without `creds`, call `invalidateIfCurrent(token)`, then `handleStatus` as today. | `getAuthToken`, `handleStatus`, `parseBody`, `log` |
| `toAuthCreds` | `(c: Credentials, useQA: boolean) => AuthCreds` | `{ username: c.username, password: c.password, useQA }`. Lives in `client.ts`. | — |
| `isRetryableError` | `(err: unknown) => boolean`, exported from `src/api/errors.ts` | Decision 7 classifier. Consumed directly by spec 03 (`retry: (n, e) => n < 1 && isRetryableError(e)`, one retry) and by spec 05's stop rule | error classes |
| `shouldRetryQuery` | `(failureCount: number, error: unknown) => boolean`, exported from `src/api/errors.ts` | `failureCount < MAX_QUERY_RETRIES && isRetryableError(error)` (two retries). Consumed by spec 02 (`useMyRequests`) | `isRetryableError` |
| `fetchWorkDiary` | unchanged `(assignmentId, date, credentials, useQA)` | Passes `toAuthCreds(credentials, useQA)` as `apiGet`'s 5th arg | `getAuthToken`, `apiGet` |
| `fetchTimesheet` | `(config, token, creds?: AuthCreds)` | Forwards `creds` to all 3 strategies | `apiGet` |
| `fetchPayments` | `(config, token, creds?: AuthCreds)` | Forwards `creds` | `apiGet` |
| `fetchPendingManual` / `fetchPendingOvertime` | `(token, useQA, weekStartDate, creds?)` | Forward | `apiGet` |
| `approveManual` | `(token, useQA, approverId, timecardIds, creds?)` | Forward (retrying a PUT after a 401 is safe: a rejected token means nothing was applied) | `apiPut` |
| `rejectManual` | `(token, useQA, approverId, timecardIds, reason, creds?)` | Forward | `apiPut` |
| `approveOvertime` | `(token, useQA, overtimeId, creds?)` | Forward | `apiPut` |
| `rejectOvertime` | `(token, useQA, overtimeId, memo, creds?)` | Forward | `apiPut` |
| `fetchMyTeams` | `(token, useQA, creds?)` | Forward | `apiGet` |
| `fetchTeamRoster` | `(teamId, token, useQA, creds?)` | Forward | `apiGet` |
| `fetchReportTimesheet` | `(member, weekStartDate, token, useQA, creds?)` | Forward | `apiGet` |
| `getProfileDetail` | `(token, useQA, creds?)` | Forward | `apiGet` |
| `fetchConfigFromAssignments` (private) / `fetchAndBuildConfig` | internal: `fetchAndBuildConfig` builds `toAuthCreds({username,password}, useQA)` and passes it to `getProfileDetail`, `fetchConfigFromAssignments` and the payments `apiGet` (`auth.ts:234`) | Forward | `apiGet` |

**Call sites that must pass creds** (each builds `toAuthCreds(credentials, config.useQA)` from values already in scope):
- `useTimesheet.ts:30`, `usePayments.ts:29`
- `useApprovalItems.ts:60-65,150,153,193,196`
- `useTeamRoster.ts:36,38`
- `useTeamAggregateData.ts:170` (the `fetchWorkDiary` call at `:160` inherits automatically)
- `useRoleRefresh.ts:43`
- `useEarningsHistory.ts:107`, `usePaymentHistory.ts:72`, `useHistoryBackfill.ts:198`
- `crossoverData.ts:86-87,157-158` (`:137` inherits)
- `auth.ts:201,214,234`

---

## Test Plan

Tests extend `src/__tests__/api/auth-resilience.test.ts`, which mocks global `fetch`, calls `invalidateAuthToken()` in `beforeEach` (`:100-101`) and uses `jest.mock('../../lib/log')` to assert events. New `describe` ids are prefixed `DD1.` to avoid colliding with the existing FR1-FR9.

### `getAuthToken` / `invalidateIfCurrent` (single-flight)

**Signature:** `getAuthToken(username, password, useQA): Promise<string>`

**Happy Path:**
- 15 concurrent `apiGet(..., 'stale', false, creds)`: the data endpoint returns 401 for `stale` and 200 for `fresh`, and the token endpoint returns `fresh` after a deferred delay. Exactly **1** POST to `/api/v3/token` (excluding the seeding mint), and all 15 resolve.
- Interleaving: caller A re-mints to `fresh`, then caller B's late 401 with `stale` calls `invalidateIfCurrent('stale')`. `cachedToken` stays `fresh`, and B retries with `fresh` without minting.

**Edge Cases:**
- `invalidateIfCurrent('other')` when `cachedToken === 'fresh'` is a no-op.
- `invalidateIfCurrent` during an in-flight mint does not null `mintInFlight`: a concurrent caller joins the same mint (fetch count 1).
- Generation guard: start a mint (deferred), call `invalidateAuthToken()`, then resolve the mint. The next `getAuthToken` mints again (2 token POSTs), proving the stale mint did not populate the cache.

**Error Cases:**
- With creds, 401 → re-mint → 401 → `AuthError(401)` after exactly 2 data fetches (existing FR4.c keeps passing).
- Without creds, 401 → `AuthError(401)` after one fetch (existing FR4.d). A following `getAuthToken` mints fresh (token POST count 2), i.e. the token was evicted.

**Mocks Needed:**
- `global.fetch`: a URL-routing `jest.fn` (token vs data endpoint), with a deferred-promise helper.
- `../../lib/log`: `{ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }`.

### Failed-login latch

**Signature:** internal to `getAuthToken`. `LOGIN_LATCH_MS` is exported.

**Happy Path:**
- Mint 401 → `AuthError(401)`. A second `getAuthToken` with the same creds inside 60 s throws `AuthError` with `errorCode === 'AUTH_LOGIN_LATCHED'` and makes **0** additional fetches. `log.warn('auth.login_latched', {statusCode: 401})` fires once.
- After `Date.now` advances by 60 001 ms (`jest.spyOn(Date, 'now')`), it mints again.

**Edge Cases:**
- A different password with the same username mints immediately.
- The same creds with a different `useQA` mint immediately (the environment is part of the fingerprint).
- `invalidateAuthToken()` clears the latch, so the next call mints.
- A successful mint clears the latch.
- `mintAuthToken` ignores the latch (a probe during the latch makes 1 fetch).
- With creds, during the latch, `apiGet` 401 → `getAuthToken` throws latched `AuthError` → `apiGet` rejects with it, and only the 1 data fetch is made.

**Error Cases:**
- A mint `NetworkError` does not latch (the next call fetches again).
- A mint HTML 500 (`AUTH_HTML_500`) does not latch.
- A mint 403 latches with `statusCode` 403.

**Mocks Needed:** `fetch`, `Date.now` spy, `log`.

### HTML 5xx after renewal

**Happy Path:**
- With creds: HTML 500 → mint → 200 resolves (existing FR5.a).
- With creds: HTML 503 → mint → HTML 503 rejects with `ApiError`, `statusCode === 503`, `errorCode === 'HTML_5XX_AFTER_RENEWAL'`. `isRetryableError(thatError) === true`.

**Edge Cases:**
- The `apiPut` mirror (re-serialized body on the retry, like existing FR6.b).
- The retried HTML response body is not read (`text` mock call count 0 on the second response). This keeps the expo/fetch one-read rule (`__tests__/client.test.ts:218+`).

**Error Cases:**
- Without creds, HTML 500 → `AuthError(AUTH_HTML_500)` (FR5.e / FR9.a/b unchanged).

### `isRetryableError` / `shouldRetryQuery` (new file `src/__tests__/api/retry-policy.test.ts`)

Both are imported from `src/api/errors.ts` (this also pins that both are exported).

**`isRetryableError`**
- **Happy Path:** `NetworkError` → true; `ApiError(500/502/503/408/429)` → true; `new TypeError()` → true; `AuthError(401, undefined, {errorCode:'AUTH_HTML_500'})` → true; `ApiError(503, …, {errorCode:'HTML_5XX_AFTER_RENEWAL'})` → true.
- **Error Cases:**
  - `AuthError(401)`, `AuthError(403)`, `AuthError(401, …, {errorCode:'AUTH_LOGIN_LATCHED'})` and `AuthError(401, …, {errorCode:'NO_CREDENTIALS'})` → false;
  - `ApiError(400)`, `ApiError(404)`, `ApiError(422)` → false.

**`shouldRetryQuery`** (two retries, spec 02)
- **Edge Cases:** `shouldRetryQuery(0, NetworkError)` → true; `(1, …)` → true; `(2, …)` → false.
- **Error Cases:** `shouldRetryQuery(0, AuthError(401))` → false (the classifier is applied at every count).

**The one-retry form** (spec 03): a table test of `(n, e) => n < 1 && isRetryableError(e)` gives `(0, NetworkError)` → true, `(1, NetworkError)` → false and `(0, AuthError(401))` → false. This pins that spec 03 keeps today's `retry: 1`, while `shouldRetryQuery` keeps spec 02's `retry: 2`.

**Mocks Needed:** none (pure).

### Creds plumbing (wrappers)

**Happy Path:**
- `fetchWorkDiary('79996','2026-03-09', {username:'u',password:'p'}, false)` calls `apiGet('/api/timetracking/workdiaries', {assignmentId:'79996', date:'2026-03-09'}, MOCK_TOKEN, false, {username:'u', password:'p', useQA:false})`.
- Each wrapper given `creds` forwards the identical object as the last `apiGet`/`apiPut` argument. Covered in `src/__tests__/api/team.test.ts`, `__tests__/api/work-diary.test.ts`, a new `src/__tests__/api/approvals-creds.test.ts` (mocked `./client`) and `__tests__/hooks/useHoursData.test.ts` (timesheet: all 3 strategy calls carry creds).

**Edge Cases:** a wrapper called without `creds` forwards `undefined` (asserted explicitly).

### Call-site wiring (hooks)

- `useApprovalItems`: `approveManual` called with `('mock-token', false, userId, timecardIds, {username, password, useQA:false})`, and the same pattern for the other 3 actions and the 6 fetches.
- `useTeamRoster`: `fetchTeamRoster('2374', TOKEN, false, CREDS_WITH_ENV)`.
- `useTeamAggregateData`: `fetchReportTimesheet(member, '2026-07-27', TOKEN, false, CREDS_WITH_ENV)`.
- `useRoleRefresh`: `getProfileDetail(MOCK_TOKEN, config.useQA, CREDS_WITH_ENV)`.
- `fetchAndBuildConfig`: `apiGet` nth-call 1 is `('/api/identity/users/current/detail', {}, MOCK_TOKEN, false, {username:'user@test.com', password:'pass', useQA:false})`.
- Static guard (new, `src/__tests__/api/creds-wiring.test.ts`). It prevents regressing to calls without creds.
  - **Scope:** every production file under `src/` and `app/`, excluding `__tests__`, and excluding `src/api/client.ts`, which defines `apiGet`/`apiPut`.
  - **Calls checked:** `apiGet`, `apiPut` and each wrapper in the Function Contracts table (`fetchTimesheet`, `fetchPayments`, `fetchPendingManual`, `fetchPendingOvertime`, `approveManual`, `rejectManual`, `approveOvertime`, `rejectOvertime`, `fetchMyTeams`, `fetchTeamRoster`, `fetchReportTimesheet`, `getProfileDetail`).
  - **Rule:** each call's argument list must contain `creds` or `toAuthCreds(`. The argument list is extracted with a small balanced-parenthesis scanner from the call's opening `(`, not a single-line regex. Production calls span lines and end in `config.useQA,\n)` (for example `useEarningsHistory.ts:107-112`, `timesheet.ts:39-44`), which a line regex would miss.
  - **Skipped:** declarations (`export async function fetchX(`) and comment lines.
  - **Self-test:** the scanner is run on two fixture strings, one multi-line call without creds (must be flagged) and one with creds (must pass), so the guard cannot silently match nothing.

### Existing tests that change (and how)

| Test | Line(s) | Change |
|------|---------|--------|
| `__tests__/api/work-diary.test.ts` | `:93-98`, `:127-132` | Add the 5th expected arg `{ username, password, useQA: false\|true }` |
| `src/__tests__/api/team.test.ts` | `:108,119,204,215,489,506,517` | Calls without creds: add `undefined` as the 5th expected arg. Add one with-creds case per function |
| `__tests__/auth-api.test.ts` | `:160-166` | Add the creds object as the 5th arg |
| `__tests__/use-approval-items.test.ts` | `:189,218,246,275` | Append the expected creds object |
| `__tests__/use-role-refresh.test.ts` | `:128-131` | Append the expected creds object |
| `src/hooks/__tests__/useTeamAggregateData.test.ts` | `:191,210` | Append creds to the `fetchReportTimesheet` expectation (`:189`, `fetchWorkDiary`, is unchanged) |
| `src/hooks/__tests__/useTeamRoster.test.ts` | `:112-113` | Append creds |
| `src/hooks/__tests__/useMyRequests.test.ts` | `:194,196` | **Unchanged** (`fetchWorkDiary` signature unchanged) |
| `__tests__/client.test.ts`, `src/__tests__/api/auth-resilience.test.ts` FR1-FR9, `src/__tests__/api/client.test.ts` | all | **Unchanged and must pass.** `beforeEach(invalidateAuthToken)` now also clears the latch, which keeps the `getAuthToken` 401 test (`client.test.ts:47`) from latching into the next test |
| `app/__tests__/modal-auth-cache.test.tsx` | FR7.a-c | Unchanged (call sites still call `invalidateAuthToken()`) |

### Verification commands

```
npx jest src/__tests__/api __tests__/client.test.ts __tests__/api/work-diary.test.ts __tests__/auth-api.test.ts \
  __tests__/use-approval-items.test.ts __tests__/use-role-refresh.test.ts src/hooks/__tests__/useTeamAggregateData.test.ts \
  src/hooks/__tests__/useTeamRoster.test.ts __tests__/hooks/useHoursData.test.ts src/__tests__/lib/crossoverData.test.ts
npm test && npm run typecheck && npm run lint
npx expo-updates runtimeversion:resolve --platform ios   # must print 56d054fc723984e56892a367dca1efa79a9f8fad (fingerprint unchanged)
git diff --stat -- app.json package.json package-lock.json plugins ios android   # must be empty
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/api/client.ts` | modify | `AuthCreds`, `toAuthCreds`, `invalidateIfCurrent`, latch, generation guard, HTML 5xx after renewal, no-creds eviction, `log` events |
| `src/api/errors.ts` | modify | Error-code constants, `isRetryableError`, `shouldRetryQuery`, `MAX_QUERY_RETRIES` |
| `src/api/workDiary.ts` | modify | Pass creds |
| `src/api/timesheet.ts`, `src/api/payments.ts`, `src/api/approvals.ts`, `src/api/team.ts`, `src/api/auth.ts` | modify | Optional `creds?` forwarded |
| `src/hooks/useTimesheet.ts`, `usePayments.ts`, `useApprovalItems.ts`, `useTeamRoster.ts`, `useTeamAggregateData.ts`, `useRoleRefresh.ts`, `useEarningsHistory.ts`, `usePaymentHistory.ts`, `useHistoryBackfill.ts` | modify | Pass `toAuthCreds(...)` |
| `src/lib/crossoverData.ts` | modify | Pass creds on the background path |
| `src/__tests__/api/auth-resilience.test.ts` | modify | DD1 blocks (single-flight, latch, generation, HTML after renewal, eviction) |
| `src/__tests__/api/retry-policy.test.ts` | create | Retry predicate |
| `src/__tests__/api/approvals-creds.test.ts` | create | Approvals wrappers forward creds |
| `src/__tests__/api/creds-wiring.test.ts` | create | Static guard: no 4-arg production `apiGet`/`apiPut` |
| Tests in the table above | modify | Exact-arg updates |
| `docs/CROSSOVER_API.md` | modify | §2: replace "no caching / no refresh-on-401" with the cache + single-flight renewal + latch description; §13: retry now exists |
| `docs/ARCHITECTURE.md` | modify | Auth section (around `:514-536`): renewal is wired; the latch |

---

## Edge Cases to Handle

1. **Sign-out during a mint.** The generation guard stops the old mint from repopulating `cachedToken`. `invalidateAuthToken()` also clears the latch, so the next account is never blocked.
2. **Env switch.** The `useQA` in `AuthCreds` comes from the request's own config. A retry mints against that request's environment, and the fingerprint includes the environment.
3. **Password changed on the server.** The first wake gives one re-mint 401 → latch → every other in-flight 401 handler throws the latched `AuthError` with no network call. TanStack does not retry it: `isRetryableError` is false, so neither `shouldRetryQuery` (spec 02) nor spec 03's one-retry rule retries. The UI shows the auth state, and data is kept (specs 02/03).
4. **Cold start offline.** The mint `NetworkError` is shared by every caller through `mintInFlight` and is not latched. Queries throw and retry with backoff.
5. **Approve/reject PUT retried.** A 401 or HTML-5xx first response means the request was not applied, so one retry with a fresh token is safe. `useApprovalItems` still restores and refetches in `finally` (`useApprovalItems.ts:155-162`).
6. **Logging privacy.** Meta keys are limited to `triggerStatusCode`, `statusCode` and `attempt`; no token, username or message (`redact.ts` deny-list; `log.ts` class-name contract).
7. **Manager token on a report's assignment** (`useTeamAggregateData.ts:160`). The re-mint uses the manager's own creds, which is correct.
8. **A 401 that persists with a freshly minted token** (for example an endpoint the account may not read).
   - Each wave of concurrent calls costs one *successful* mint, and then the calls fail with `AuthError(401)`, which is not retryable (`isRetryableError` false), so no query-level retry follows.
   - The UI maps this to `'auth'` too, the same as a rejected password, so spec 04's copy must not claim the password was rejected.
   - The token endpoint accepted the password, so the latch is not set and there is no lockout risk. The cost is one extra token POST per wave, which is bounded by how often queries run.
   - Not mitigated further. A "minted < N s ago, don't re-mint" rule would add timing state for no proven case.

---

## Open Questions

✓ Why did spec 04 never pass creds? → It was a deliberate scope cut (spec.md:31, D2 `:57-65`, checklist `:112`), and no follow-up spec existed. This spec is that follow-up.
✓ Latch duration? → 60 s (Decision 2).
✓ Should HTML 5xx stay an `AuthError`? → Only on the first response without creds. After a fresh token it is an `ApiError` (Decision 3).
✓ Keep the password in module memory? → No. An FNV-1a fingerprint only (Decision 2).

None remaining.
