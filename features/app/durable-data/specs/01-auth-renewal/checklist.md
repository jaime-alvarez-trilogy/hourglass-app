# Implementation Checklist

Spec: `01-auth-renewal`
Feature: `durable-data`
Worktree: `hg-worktrees/sdk58` · Branch: `feat/sdk-58` (1.2.0) · JS-only. The fingerprint must stay `56d054fc723984e56892a367dca1efa79a9f8fad`.

---

## Phase 1.0: Test Foundation

All new `describe` ids in `auth-resilience.test.ts` are prefixed `DD1.`, so they cannot collide with the existing FR1-FR9.

The file gains:
- `jest.mock('../../lib/log', () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))`;
- a URL-routing `fetch` mock (token endpoint vs data endpoint);
- a deferred-promise helper.

`beforeEach(invalidateAuthToken)` stays.

### FR1: Single-flight token renewal and mint generation guard
- [ ] `DD1.1` 15 concurrent `apiGet('/test', {}, 'stale', false, CREDS)`:
  - the data endpoint returns 401 for `stale` and 200 for `fresh`, and the token endpoint resolves `fresh` deferred;
  - exactly 1 `/api/v3/token` POST after the seeding mint;
  - all 15 resolve with the body.
- [ ] `DD1.2` Interleaving:
  - A re-mints to `fresh`, then B's late 401 with `stale` → `cachedToken` stays `fresh`, and B retries with `fresh` with no mint;
  - the next `getAuthToken` makes 0 fetches.
- [ ] `DD1.3` `invalidateIfCurrent('other')` while the cache holds `fresh` is a no-op (0 fetches on the next `getAuthToken`).
- [ ] `DD1.4` `invalidateIfCurrent(x)` during an in-flight mint → a concurrent `getAuthToken` joins it (1 token POST).
- [ ] `DD1.5` Generation guard: deferred mint → `invalidateAuthToken()` → resolve. The awaiting caller gets its token, and the next `getAuthToken` mints again (2 token POSTs).
- [ ] `DD1.6` No-creds eviction:
  - 401 → `AuthError(401)` after 1 data fetch, then `getAuthToken` mints (the token was evicted);
  - the same for HTML 500 → `AuthError(AUTH_HTML_500)`.
- [ ] `DD1.7` With creds, 401 → mint → 401 → `AuthError(401)` after exactly 2 data fetches.
- [ ] `DD1.8` Logs:
  - `log.info('auth.token_minted', {})` once per `getAuthToken` mint, and never for `mintAuthToken`;
  - `log.warn('auth.token_retried', { triggerStatusCode: 401 })` and `{ triggerStatusCode: 500 }` for HTML 500;
  - no meta value equals the token, username or password.

### FR2: Failed-login latch
- [ ] `DD1.9` Mint 401 → `AuthError(401)`. The same creds within 60 s → `AuthError` with `errorCode 'AUTH_LOGIN_LATCHED'` and `statusCode 401`, and 0 extra fetches. `log.warn('auth.login_latched', { statusCode: 401 })` fires exactly once.
- [ ] `DD1.10` `jest.spyOn(Date, 'now')` + 60 001 ms → the same creds mint again (1 fetch).
- [ ] `DD1.11` A different password with the same username → mints immediately. The same creds with the other `useQA` → mints immediately.
- [ ] `DD1.12` `invalidateAuthToken()` during the latch → the next call mints.
- [ ] `DD1.13` A successful mint clears the latch: latch A, mint B successfully, `invalidateIfCurrent(tokenB)`, then `getAuthToken(A)` makes 1 fetch.
- [ ] `DD1.14` `mintAuthToken` during the latch → 1 fetch.
- [ ] `DD1.15` With creds and during the latch, `apiGet` 401 → rejects with the latched `AuthError` after exactly 1 data fetch and 0 token POSTs.
- [ ] `DD1.16` A mint `NetworkError` doesn't latch. A mint HTML 500 doesn't latch. A mint 403 latches with `statusCode 403`.
- [ ] `DD1.17` A mint 401 that settles after `invalidateAuthToken()` doesn't latch (the next same-creds call fetches).

### FR3: Error-code constants, HTML 5xx after renewal, shared retry predicate
- [ ] `DD1.18` `apiGet` with creds: HTML 503 → mint → HTML 503 → `ApiError` with `statusCode 503` and `errorCode 'HTML_5XX_AFTER_RENEWAL'`. `isRetryableError(err) === true`, and the second response's `text` mock is called 0 times (`makeExpoLikeResponse` read tracking or a `jest.fn` text).
- [ ] `DD1.19` The `apiPut` mirror: the same error, and the retry carries the same serialized body.
- [ ] Create `src/__tests__/api/retry-policy.test.ts`. It imports everything from `src/api/errors`.
  - [ ] Constants equal their names, and `MAX_QUERY_RETRIES === 2`.
  - [ ] `isRetryableError` returns true for `NetworkError`, `ApiError(500/502/503/408/429)`, `TypeError`, `AuthError(401, undefined, {errorCode:'AUTH_HTML_500'})` and `ApiError(503, …, {errorCode:'HTML_5XX_AFTER_RENEWAL'})`.
  - [ ] `isRetryableError` returns false for `AuthError(401)`, `AuthError(403)`, `AUTH_LOGIN_LATCHED`, `NO_CREDENTIALS`, `ApiError(400/404/422)`.
  - [ ] `shouldRetryQuery`: `(0, NetworkError)` → true, `(1, …)` → true, `(2, …)` → false, `(0, AuthError(401))` → false.
  - [ ] One-retry table `(n, e) => n < 1 && isRetryableError(e)`: `(0, NetworkError)` → true, `(1, NetworkError)` → false, `(0, AuthError(401))` → false.

### FR4: Creds on every wrapper and every production call site
- [ ] Create `src/__tests__/api/wrappers-creds.test.ts`. It factory-mocks `../../api/client` with `apiGet` and `apiPut`.
  - [ ] `toAuthCreds({username:'u', password:'p'}, true)` deep-equals `{username:'u', password:'p', useQA:true}`.
  - [ ] `fetchPendingManual`, `fetchPendingOvertime`, `approveManual`, `rejectManual`, `approveOvertime` and `rejectOvertime` with creds → the last `apiGet`/`apiPut` arg is the same object (`toBe`). Without creds → explicit trailing `undefined`.
  - [ ] `fetchTimesheet` with creds and strategies 1-2 returning `[]` → all 3 `apiGet` calls carry the same creds object (`toBe`). Without creds → all 3 carry a trailing `undefined`.
  - [ ] `fetchPayments` with creds (`toBe`) and without (trailing `undefined`).
  - [ ] Type-level negative: one `// @ts-expect-error` line passes a bare `Credentials` (no `useQA`) as `creds` to `fetchPayments`. `npm run typecheck` fails if the error disappears.
- [ ] `__tests__/api/work-diary.test.ts:93-98,127-132`: expect the 5th arg `{ username, password, useQA: false|true }`.
- [ ] `src/__tests__/api/team.test.ts:108,119,204,215,489,506,517`: calls without creds expect a trailing `undefined`. Add one with-creds case each for `fetchMyTeams`, `fetchTeamRoster` and `fetchReportTimesheet`.
- [ ] `__tests__/auth-api.test.ts:160-166`: nth-call 1 has the 5th arg `{username:'user@test.com', password:'pass', useQA:false}`. Also assert:
  - the `/assignments` fallback (`fetchConfigFromAssignments`) and the payments call carry a deep-equal creds object;
  - `getProfileDetail(token, false, creds)` forwards `creds` (`toBe`), and `getProfileDetail(token, false)` forwards a trailing `undefined`.
- [ ] `__tests__/use-approval-items.test.ts:189,218,246,275`: append the creds object. Add a fetch-path case: the 6 pending fetches carry creds.
- [ ] `__tests__/use-role-refresh.test.ts:128-131`: append the creds object.
- [ ] `src/hooks/__tests__/useTeamAggregateData.test.ts:191,210`: append creds to `fetchReportTimesheet` (leave `:189` alone).
- [ ] `src/hooks/__tests__/useTeamRoster.test.ts:112-113`: append creds.
- [ ] `src/__tests__/lib/crossoverData.test.ts`: `fetchTimesheet` / `fetchPayments` are called with `(config, token, CREDS_WITH_ENV)`, and the manager pending fetches carry creds.
- [ ] Create `src/__tests__/api/creds-wiring.test.ts` (static guard).
  - [ ] A balanced-paren scanner, string-literal aware, that skips an optional `<…>` type-arg list. It skips comment lines and `function name(` declarations.
  - [ ] Self-test: a multi-line fixture without creds is flagged, and a fixture with creds passes.
  - [ ] Scan `src/` and `app/` (excluding `__tests__`, `*.test.*` and `src/api/client.ts`) for `apiGet`, `apiPut` and the 13 wrapper names (the 12 public wrappers plus `fetchConfigFromAssignments`). Each argument list must contain `creds` or `toAuthCreds(`. Also assert at least 1 call found per name that has production callers, so the guard cannot silently match nothing.
- [ ] Confirm `src/hooks/__tests__/useMyRequests.test.ts:194,196` are untouched.
- [ ] Mutation check (Phase 1.1, manual, not committed): temporarily drop creds from one production call (for example `usePayments.ts`), confirm `creds-wiring.test.ts` fails and names the file, then restore. Record the result in Session Notes.

### FR5: Documentation
- [ ] There are no automated tests for the docs. The FR5 success criteria are checked with `grep` in Phase 1.1 / Final Verification.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate the test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run the `red-phase-test-validator` agent.
- [ ] Every FR success criterion has test coverage (FR5 uses grep checks).
- [ ] Assertions are specific: fetch counts, `errorCode`, `statusCode`, exact args, `toBe` identity. "Doesn't throw" alone is not enough.
- [ ] Mocks return realistic data that matches the interface contracts (token as plain text, the HTML 5xx `content-type`, JSON 401 envelopes).
- [ ] Red run recorded: the new DD1 / retry-policy / wrappers-creds / creds-wiring cases fail, and existing FR1-FR9 still pass.
- [ ] Fix any issues identified before proceeding.

---

## Phase 1.1: Implementation

### FR1: Single-flight token renewal and mint generation guard
- [ ] `client.ts`: add `authGeneration` and `invalidateIfCurrent(token)`. Extend `invalidateAuthToken()` (latch + generation) and update its JSDoc (hard reset only).
- [ ] `getAuthToken`: capture `gen` and the own promise `p`. Write the cache / clear the latch only if `gen === authGeneration && mintInFlight === p`. `.finally` clears `mintInFlight` only if it is still `p`. Log `auth.token_minted`.
- [ ] `apiGet` / `apiPut`: with creds, `invalidateIfCurrent(token)`, then `getAuthToken(creds)`, `log.warn('auth.token_retried', {triggerStatusCode})`, and retry once. Without creds, `invalidateIfCurrent(token)` before `handleStatus`.
- [ ] Import `log` from `../lib/log`. Update the header comment and the `getAuthToken` JSDoc (remove "call `invalidateAuthToken()` first").

### FR2: Failed-login latch
- [ ] Add `LOGIN_LATCH_MS`, the `loginLatch` state and `fingerprintCreds` (FNV-1a 32-bit, `Math.imul`, 8-hex).
- [ ] `getAuthToken` checks in order: cache → in-flight → latch (throws `AUTH_LOGIN_LATCHED`) → mint. On an `AuthError` other than `AUTH_HTML_500` with a current generation: set the latch, `log.warn('auth.login_latched', {statusCode})`, rethrow.
- [ ] Confirm `mintAuthToken` is untouched (it bypasses the latch).

### FR3: Error-code constants, HTML 5xx after renewal, shared retry predicate
- [ ] `errors.ts`: add the `AUTH_HTML_500`, `AUTH_LOGIN_LATCHED`, `NO_CREDENTIALS`, `HTML_5XX_AFTER_RENEWAL` and `MAX_QUERY_RETRIES` constants, `isRetryableError` and `shouldRetryQuery`, with doc comments naming their consumers (specs 02/03/05).
- [ ] `client.ts`: use `AUTH_HTML_500` in `handleStatus`. In both retry blocks, a still-HTML-5xx retried response throws `ApiError(status, 'Server error after token renewal', {errorCode: HTML_5XX_AFTER_RENEWAL})` without reading the body.
- [ ] Do **not** change any hook's `retry` option.

### FR4: Creds on every wrapper and every production call site
- [ ] Create `src/api/authCreds.ts` (`AuthCreds`, `toAuthCreds`). In `client.ts`, use `creds?: AuthCreds` and `export type { AuthCreds } from './authCreds'`.
- [ ] Wrappers: trailing `creds?: AuthCreds`, forwarded as the last arg.
  - `timesheet.ts` (3 strategies), `payments.ts`;
  - `approvals.ts` (6 functions);
  - `team.ts` (3 functions);
  - `auth.ts`: `getProfileDetail`, `fetchConfigFromAssignments`, and `fetchAndBuildConfig` building creds once for detail, assignments and payments.
- [ ] `workDiary.ts`: pass `toAuthCreds(credentials, useQA)`.
- [ ] Hooks:
  - `useTimesheet`, `usePayments`;
  - `useApprovalItems` (fetch-all, approve, reject: build `creds` once each);
  - `useTeamRoster`, `useTeamAggregateData`, `useRoleRefresh`;
  - `useEarningsHistory`, `usePaymentHistory`;
  - `useHistoryBackfill` (`toAuthCreds({ username, password }, useQA)`).
- [ ] `crossoverData.ts`: timesheet, payments and the pending fetches.
- [ ] Production code imports `toAuthCreds` from `src/api/authCreds` only (`grep -rn "toAuthCreds" src app | grep "api/client"` is empty).

### FR5: Documentation
- [ ] `docs/CROSSOVER_API.md` §2: replace "Per-request token (no caching)" with "Token cache and renewal" (cache, single-flight, `invalidateIfCurrent`, latch, generation guard, HTML 5xx after renewal).
- [ ] `docs/CROSSOVER_API.md` §13: add the error codes and the retry predicates. Replace "No retry policy anywhere".
- [ ] `docs/ARCHITECTURE.md` §8.5: renewal is wired everywhere (not opt-in only). Describe the latch and generation guard, and point to `src/api/authCreds.ts`.
- [ ] `grep -n "no caching\|no refresh-on-401\|No retry policy" docs/CROSSOVER_API.md` returns nothing.
- [ ] `grep -c` finds each of `invalidateIfCurrent`, `AUTH_LOGIN_LATCHED`, `HTML_5XX_AFTER_RENEWAL`, `isRetryableError` and (`LOGIN_LATCH_MS` or `60 s`) in `docs/CROSSOVER_API.md`.
- [ ] `docs/ARCHITECTURE.md` §8.5 mentions the latch and `toAuthCreds`, and no longer describes renewal as opt-in only.

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run the `spec-implementation-alignment` agent.
- [ ] Every FR1-FR5 success criterion is verified in code.
- [ ] Interface contracts match the implementation:
  - `invalidateIfCurrent`, `LOGIN_LATCH_MS`, `AuthCreds`, `toAuthCreds`;
  - the error constants, `isRetryableError`, `shouldRetryQuery`;
  - every wrapper signature.
- [ ] No scope creep: no `getAuthGeneration`, no hook `retry` changes, no UI copy changes. No shortfall.

### Step 1: Comprehensive PR Review
- [ ] Run the `pr-review-toolkit:review-pr` skill (launches 6 specialized agents) on the local diff. Do not post to GitHub or create a PR.

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical).
- [ ] Fix MEDIUM severity issues, or document why they are deferred.
- [ ] Re-run the tests after fixes.
- [ ] Commit fixes: `fix(01-auth-renewal): {description}`.

### Step 3: Test Quality Optimization
- [ ] Run the `test-optimiser` agent on the new and modified tests.
- [ ] Apply suggested improvements that strengthen confidence.
- [ ] Re-run the tests to confirm they pass.
- [ ] Commit if changes were made: `fix(01-auth-renewal): strengthen test assertions`.

### Final Verification
- [ ] Focused jest:
  ```
  npx jest src/__tests__/api __tests__/client.test.ts __tests__/api/work-diary.test.ts __tests__/auth-api.test.ts \
    __tests__/use-approval-items.test.ts __tests__/use-role-refresh.test.ts __tests__/errors.test.ts __tests__/approvals-api.test.ts \
    src/hooks/__tests__/useTeamAggregateData.test.ts src/hooks/__tests__/useTeamRoster.test.ts src/hooks/__tests__/useMyRequests.test.ts \
    __tests__/hooks/useHoursData.test.ts src/__tests__/lib/crossoverData.test.ts app/__tests__/modal-auth-cache.test.tsx
  ```
- [ ] Full suite: `npx jest`. All green, no regressions in existing tests.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` reports 0 errors.
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` prints `56d054fc723984e56892a367dca1efa79a9f8fad`.
- [ ] No changes to `package.json`, `package-lock.json`, `app.json`, `eas.json`, `ios/`, `android/`, `patches/` or `plugins/`, and no new dependencies. `git diff --stat main...HEAD -- package.json package-lock.json app.json eas.json ios android patches plugins` shows nothing from this spec's commits.
- [ ] The code follows existing patterns (comment density and the `log.ts` category/meta conventions).

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-22**: Spec and checklist created (autonomous). Key decision C1: `toAuthCreds` lives in `src/api/authCreds.ts`, because nine test files factory-mock `src/api/client`.
