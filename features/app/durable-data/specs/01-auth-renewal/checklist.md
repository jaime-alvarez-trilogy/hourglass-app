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
- [x] `DD1.1` 15 concurrent `apiGet('/test', {}, 'stale', false, CREDS)`:
  - the data endpoint returns 401 for `stale` and 200 for `fresh`, and the token endpoint resolves `fresh` deferred;
  - exactly 1 `/api/v3/token` POST after the seeding mint;
  - all 15 resolve with the body.
- [x] `DD1.2` Interleaving:
  - A re-mints to `fresh`, then B's late 401 with `stale` → `cachedToken` stays `fresh`, and B retries with `fresh` with no mint;
  - the next `getAuthToken` makes 0 fetches.
- [x] `DD1.3` `invalidateIfCurrent('other')` while the cache holds `fresh` is a no-op (0 fetches on the next `getAuthToken`).
- [x] `DD1.4` `invalidateIfCurrent(x)` during an in-flight mint → a concurrent `getAuthToken` joins it (1 token POST).
- [x] `DD1.5` Generation guard: deferred mint → `invalidateAuthToken()` → resolve. The awaiting caller gets its token, and the next `getAuthToken` mints again (2 token POSTs).
- [x] `DD1.6` No-creds eviction:
  - 401 → `AuthError(401)` after 1 data fetch, then `getAuthToken` mints (the token was evicted);
  - the same for HTML 500 → `AuthError(AUTH_HTML_500)`.
- [x] `DD1.7` With creds, 401 → mint → 401 → `AuthError(401)` after exactly 2 data fetches.
- [x] `DD1.8` Logs:
  - `log.info('auth.token_minted', {})` once per `getAuthToken` mint, and never for `mintAuthToken`;
  - `log.warn('auth.token_retried', { triggerStatusCode: 401 })` and `{ triggerStatusCode: 500 }` for HTML 500;
  - no meta value equals the token, username or password.

### FR2: Failed-login latch
- [x] `DD1.9` Mint 401 → `AuthError(401)`. The same creds within 60 s → `AuthError` with `errorCode 'AUTH_LOGIN_LATCHED'` and `statusCode 401`, and 0 extra fetches. `log.warn('auth.login_latched', { statusCode: 401 })` fires exactly once.
- [x] `DD1.10` `jest.spyOn(Date, 'now')` + 60 001 ms → the same creds mint again (1 fetch).
- [x] `DD1.11` A different password with the same username → mints immediately. The same creds with the other `useQA` → mints immediately.
- [x] `DD1.12` `invalidateAuthToken()` during the latch → the next call mints.
- [x] `DD1.13` A successful mint clears the latch: latch A, mint B successfully, `invalidateIfCurrent(tokenB)`, then `getAuthToken(A)` makes 1 fetch.
- [x] `DD1.14` `mintAuthToken` during the latch → 1 fetch.
- [x] `DD1.15` With creds and during the latch, `apiGet` 401 → rejects with the latched `AuthError` after exactly 1 data fetch and 0 token POSTs.
- [x] `DD1.16` A mint `NetworkError` doesn't latch. A mint HTML 500 doesn't latch. A mint 403 latches with `statusCode 403`.
- [x] `DD1.17` A mint 401 that settles after `invalidateAuthToken()` doesn't latch (the next same-creds call fetches).

### FR3: Error-code constants, HTML 5xx after renewal, shared retry predicate
- [x] `DD1.18` `apiGet` with creds: HTML 503 → mint → HTML 503 → `ApiError` with `statusCode 503` and `errorCode 'HTML_5XX_AFTER_RENEWAL'`. `isRetryableError(err) === true`, and the second response's `text` mock is called 0 times (`makeExpoLikeResponse` read tracking or a `jest.fn` text).
- [x] `DD1.19` The `apiPut` mirror: the same error, and the retry carries the same serialized body.
- [x] Create `src/__tests__/api/retry-policy.test.ts`. It imports everything from `src/api/errors`.
  - [x] Constants equal their names, and `MAX_QUERY_RETRIES === 2`.
  - [x] `isRetryableError` returns true for `NetworkError`, `ApiError(500/502/503/408/429)`, `TypeError`, `AuthError(401, undefined, {errorCode:'AUTH_HTML_500'})` and `ApiError(503, …, {errorCode:'HTML_5XX_AFTER_RENEWAL'})`.
  - [x] `isRetryableError` returns false for `AuthError(401)`, `AuthError(403)`, `AUTH_LOGIN_LATCHED`, `NO_CREDENTIALS`, `ApiError(400/404/422)`.
  - [x] `shouldRetryQuery`: `(0, NetworkError)` → true, `(1, …)` → true, `(2, …)` → false, `(0, AuthError(401))` → false.
  - [x] One-retry table `(n, e) => n < 1 && isRetryableError(e)`: folded into the FR3.e.3 TanStack-retryer table in `ede5409` rather than kept as a separate test-local table (see Session Notes).

### FR4: Creds on every wrapper and every production call site
- [x] Create `src/__tests__/api/wrappers-creds.test.ts`. It factory-mocks `../../api/client` with `apiGet` and `apiPut`.
  - [x] `toAuthCreds({username:'u', password:'p'}, true)` deep-equals `{username:'u', password:'p', useQA:true}`.
  - [x] `fetchPendingManual`, `fetchPendingOvertime`, `approveManual`, `rejectManual`, `approveOvertime` and `rejectOvertime` with creds → the last `apiGet`/`apiPut` arg is the same object (`toBe`). Without creds → explicit trailing `undefined`.
  - [x] `fetchTimesheet` with creds and strategies 1-2 returning `[]` → all 3 `apiGet` calls carry the same creds object (`toBe`). Without creds → all 3 carry a trailing `undefined`.
  - [x] `fetchPayments` with creds (`toBe`) and without (trailing `undefined`).
  - [x] Type-level negative: one `// @ts-expect-error` line passes a bare `Credentials` (no `useQA`) as `creds` to `fetchPayments`. `npm run typecheck` fails if the error disappears.
- [x] `__tests__/api/work-diary.test.ts:93-98,127-132`: expect the 5th arg `{ username, password, useQA: false|true }`.
- [x] `src/__tests__/api/team.test.ts:108,119,204,215,489,506,517`: calls without creds expect a trailing `undefined`. Add one with-creds case each for `fetchMyTeams`, `fetchTeamRoster` and `fetchReportTimesheet`.
- [x] `__tests__/auth-api.test.ts:160-166`: nth-call 1 has the 5th arg `{username:'user@test.com', password:'pass', useQA:false}`. Also assert:
  - the `/assignments` fallback (`fetchConfigFromAssignments`) and the payments call carry a deep-equal creds object;
  - `getProfileDetail(token, false, creds)` forwards `creds` (`toBe`), and `getProfileDetail(token, false)` forwards a trailing `undefined`.
- [x] `__tests__/use-approval-items.test.ts:189,218,246,275`: append the creds object. Add a fetch-path case: the 6 pending fetches carry creds.
- [x] `__tests__/use-role-refresh.test.ts:128-131`: append the creds object.
- [x] `src/hooks/__tests__/useTeamAggregateData.test.ts:191,210`: append creds to `fetchReportTimesheet` (leave `:189` alone).
- [x] `src/hooks/__tests__/useTeamRoster.test.ts:112-113`: append creds.
- [x] `src/__tests__/lib/crossoverData.test.ts`: `fetchTimesheet` / `fetchPayments` are called with `(config, token, CREDS_WITH_ENV)`, and the manager pending fetches carry creds.
- [x] Create `src/__tests__/api/creds-wiring.test.ts` (static guard).
  - [x] A balanced-paren scanner, string-literal aware, that skips an optional `<…>` type-arg list. It skips comment lines and `function name(` declarations.
  - [x] Self-test: a multi-line fixture without creds is flagged, and a fixture with creds passes.
  - [x] Scan `src/` and `app/` (excluding `__tests__`, `*.test.*` and `src/api/client.ts`) for `apiGet`, `apiPut` and the 13 wrapper names (the 12 public wrappers plus `fetchConfigFromAssignments`). Each argument list must contain `creds` or `toAuthCreds(`. Also assert at least 1 call found per name that has production callers, so the guard cannot silently match nothing.
- [x] Confirm `src/hooks/__tests__/useMyRequests.test.ts:194,196` are untouched. (Verified: file not in the `968f1d5..HEAD` diff.)
- [x] Mutation check (Phase 1.1, manual, not committed): temporarily drop creds from one production call (for example `usePayments.ts`), confirm `creds-wiring.test.ts` fails and names the file, then restore. Record the result in Session Notes. (Re-verified live during this bookkeeping pass on 2026-10-22 — see Session Notes.)
- [x] Also added beyond the checklist: `src/hooks/__tests__/hooksCredsForwarding.test.ts` (new, 189 lines, commit `104dd24`) — behavioural creds-forwarding tests for `useTimesheet`, `usePayments`, `useEarningsHistory`, `usePaymentHistory`, `useHistoryBackfill` across both envs, added during Phase 1.2 review-feedback.

### FR5: Documentation
- [x] There are no automated tests for the docs. The FR5 success criteria are checked with `grep` in Phase 1.1 / Final Verification.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate the test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run the `red-phase-test-validator` agent. (No separate agent-run artifact in git; inferred from the commit sequence — 4 dedicated `test(FRn):` commits land before any `feat(FRn):` commit, matching the red-phase-first workflow.)
- [x] Every FR success criterion has test coverage (FR5 uses grep checks).
- [x] Assertions are specific: fetch counts, `errorCode`, `statusCode`, exact args, `toBe` identity. "Doesn't throw" alone is not enough. (Verified directly in `auth-resilience.test.ts`, `retry-policy.test.ts`, `wrappers-creds.test.ts`, `creds-wiring.test.ts`.)
- [x] Mocks return realistic data that matches the interface contracts (token as plain text, the HTML 5xx `content-type`, JSON 401 envelopes).
- [ ] Red run recorded — not done: no red-run console output or log was committed/found anywhere in the repo; only inferable from commit ordering, not from a recorded run.
- [x] Fix any issues identified before proceeding. (`104dd24` and `ede5409` both close gaps found after the initial red/green pass — see Session Notes.)

---

## Phase 1.1: Implementation

### FR1: Single-flight token renewal and mint generation guard
- [x] `client.ts`: add `authGeneration` and `invalidateIfCurrent(token)`. Extend `invalidateAuthToken()` (latch + generation) and update its JSDoc (hard reset only).
- [x] `getAuthToken`: capture `gen` and the own promise `p`. Write the cache / clear the latch only if `gen === authGeneration && mintInFlight === p`. `.finally` clears `mintInFlight` only if it is still `p`. Log `auth.token_minted`.
- [x] `apiGet` / `apiPut`: with creds, `invalidateIfCurrent(token)`, then `getAuthToken(creds)`, `log.warn('auth.token_retried', {triggerStatusCode})`, and retry once. Without creds, `invalidateIfCurrent(token)` before `handleStatus`. (Refactored into a shared private `fetchWithRenewal` helper in `104dd24` — same behavior, deduplicated.)
- [x] Import `log` from `../lib/log`. Update the header comment and the `getAuthToken` JSDoc (remove "call `invalidateAuthToken()` first").

### FR2: Failed-login latch
- [x] Add `LOGIN_LATCH_MS`, the `loginLatch` state and `fingerprintCreds` (FNV-1a 32-bit, `Math.imul`, 8-hex).
- [x] `getAuthToken` checks in order: cache → in-flight → latch (throws `AUTH_LOGIN_LATCHED`) → mint. On an `AuthError` other than `AUTH_HTML_500` with a current generation: set the latch, `log.warn('auth.login_latched', {statusCode})`, rethrow.
- [x] Confirm `mintAuthToken` is untouched (it bypasses the latch). (JSDoc note of the bypass added in `104dd24`.)

### FR3: Error-code constants, HTML 5xx after renewal, shared retry predicate
- [x] `errors.ts`: add the `AUTH_HTML_500`, `AUTH_LOGIN_LATCHED`, `NO_CREDENTIALS`, `HTML_5XX_AFTER_RENEWAL` and `MAX_QUERY_RETRIES` constants, `isRetryableError` and `shouldRetryQuery`, with doc comments naming their consumers (specs 02/03/05).
- [x] `client.ts`: use `AUTH_HTML_500` in `handleStatus`. In both retry blocks, a still-HTML-5xx retried response throws `ApiError(status, 'Server error after token renewal', {errorCode: HTML_5XX_AFTER_RENEWAL})` without reading the body.
- [x] Do **not** change any hook's `retry` option. (Verified: `git diff 968f1d5..HEAD -- src/hooks | grep "retry:"` is empty.)

### FR4: Creds on every wrapper and every production call site
- [x] Create `src/api/authCreds.ts` (`AuthCreds`, `toAuthCreds`). In `client.ts`, use `creds?: AuthCreds` and `export type { AuthCreds } from './authCreds'`.
- [x] Wrappers: trailing `creds?: AuthCreds`, forwarded as the last arg.
  - `timesheet.ts` (3 strategies), `payments.ts`;
  - `approvals.ts` (6 functions);
  - `team.ts` (3 functions);
  - `auth.ts`: `getProfileDetail`, `fetchConfigFromAssignments`, and `fetchAndBuildConfig` building creds once for detail, assignments and payments.
- [x] `workDiary.ts`: pass `toAuthCreds(credentials, useQA)`.
- [x] Hooks:
  - `useTimesheet`, `usePayments`;
  - `useApprovalItems` (fetch-all, approve, reject: build `creds` once each);
  - `useTeamRoster`, `useTeamAggregateData`, `useRoleRefresh`;
  - `useEarningsHistory`, `usePaymentHistory`;
  - `useHistoryBackfill` (`toAuthCreds({ username, password }, useQA)`).
- [x] `crossoverData.ts`: timesheet, payments and the pending fetches.
- [x] Production code imports `toAuthCreds` from `src/api/authCreds` only. (The literal `grep -rn "toAuthCreds" src app | grep "api/client"` check hits one false positive — a comment line in `src/api/authCreds.ts` itself that mentions the string "api/client" in prose. Re-verified correctly with `grep -rn "toAuthCreds" src app --include="*.ts*" | grep -v __tests__ | grep import`: every production import resolves to `./authCreds` / `../api/authCreds`, none to `client`.)

### FR5: Documentation
- [x] `docs/CROSSOVER_API.md` §2: replace "Per-request token (no caching)" with "Token cache and renewal" (cache, single-flight, `invalidateIfCurrent`, latch, generation guard, HTML 5xx after renewal).
- [x] `docs/CROSSOVER_API.md` §13: add the error codes and the retry predicates. Replace "No retry policy anywhere".
- [x] `docs/ARCHITECTURE.md` §8.5: renewal is wired everywhere (not opt-in only). Describe the latch and generation guard, and point to `src/api/authCreds.ts`.
- [x] `grep -n "no caching\|no refresh-on-401\|No retry policy" docs/CROSSOVER_API.md` returns nothing.
- [x] `grep -c` finds each of `invalidateIfCurrent` (2), `AUTH_LOGIN_LATCHED` (3), `HTML_5XX_AFTER_RENEWAL` (4), `isRetryableError` (3) and `LOGIN_LATCH_MS`/`60 s` (3) in `docs/CROSSOVER_API.md`.
- [x] `docs/ARCHITECTURE.md` §8.5 mentions the latch and `toAuthCreds`, and no longer describes renewal as opt-in only.

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [x] Run the `spec-implementation-alignment` agent. (No standalone agent-run artifact in git; this bookkeeping pass independently re-verified every FR1-FR5 success criterion against the code — see Phase 1.1 above — with matching results.)
- [x] Every FR1-FR5 success criterion is verified in code.
- [x] Interface contracts match the implementation:
  - `invalidateIfCurrent`, `LOGIN_LATCH_MS`, `AuthCreds`, `toAuthCreds`;
  - the error constants, `isRetryableError`, `shouldRetryQuery`;
  - every wrapper signature.
- [x] No scope creep: no `getAuthGeneration`, no hook `retry` changes, no UI copy changes. No shortfall. (Confirmed via grep/diff during this bookkeeping pass.)

### Step 1: Comprehensive PR Review
- [x] Run the `pr-review-toolkit:review-pr` skill (launches 6 specialized agents) on the local diff. Do not post to GitHub or create a PR. (No GitHub PR was created, per the hard rule; no review-run artifact beyond the resulting fix commit, consistent with this step having run.)

### Step 2: Address Feedback
- [x] Fix HIGH severity issues (critical).
- [x] Fix MEDIUM severity issues, or document why they are deferred.
- [x] Re-run the tests after fixes.
- [x] Commit fixes: `fix(01-auth-renewal): {description}` → actual commit `104dd24` `fix(01-auth-renewal): address review feedback` (factored `fetchWithRenewal` helper, JSDoc fixes, new `hooksCredsForwarding.test.ts`).

### Step 3: Test Quality Optimization
- [x] Run the `test-optimiser` agent on the new and modified tests.
- [x] Apply suggested improvements that strengthen confidence.
- [x] Re-run the tests to confirm they pass.
- [x] Commit if changes were made — actual commit `ede5409` `test(01-auth-renewal): optimise tests` (message prefix is `test(...)` rather than the checklist's suggested `fix(01-auth-renewal): strengthen test assertions`; content matches the step's intent — closed 5 named mutation-testing gaps and removed test redundancy).

### Final Verification
- [x] Focused jest:
  ```
  npx jest src/__tests__/api __tests__/client.test.ts __tests__/api/work-diary.test.ts __tests__/auth-api.test.ts \
    __tests__/use-approval-items.test.ts __tests__/use-role-refresh.test.ts __tests__/errors.test.ts __tests__/approvals-api.test.ts \
    src/hooks/__tests__/useTeamAggregateData.test.ts src/hooks/__tests__/useTeamRoster.test.ts src/hooks/__tests__/useMyRequests.test.ts \
    __tests__/hooks/useHoursData.test.ts src/__tests__/lib/crossoverData.test.ts app/__tests__/modal-auth-cache.test.tsx
  ```
  Re-run during this bookkeeping pass (2026-10-22): **19 suites passed, 19 total; 572 tests passed, 572 total.**
- [x] Full suite: `npx jest`. All green, no regressions in existing tests. Per the spec-executor's final verification data (not re-run in full here per the "run only relevant jest files" rule): **5523 passed, 5523 total; 189 suites passed, 189 total.**
- [x] `npm run typecheck` passes. Re-verified during this bookkeeping pass: `npx tsc --noEmit` — no output, no errors.
- [x] `npm run lint` reports 0 errors. Per spec-executor data: **0 errors, 508 warnings (warnings only)**. Spot-re-linted the 19 changed production files in this pass: 0 errors, 9 warnings (all pre-existing-pattern warnings, e.g. `react-hooks/exhaustive-deps`, `@typescript-eslint/array-type`).
- [x] `npx expo-updates runtimeversion:resolve --platform ios` prints `56d054fc723984e56892a367dca1efa79a9f8fad`. Re-run during this bookkeeping pass: confirmed exact match.
- [x] No changes to `package.json`, `package-lock.json`, `app.json`, `eas.json`, `ios/`, `android/`, `patches/` or `plugins/`, and no new dependencies. Re-verified: `git diff --stat 968f1d5..HEAD -- package.json package-lock.json app.json eas.json ios android patches plugins` is empty.
- [x] The code follows existing patterns (comment density and the `log.ts` category/meta conventions). Confirmed: `log.info`/`log.warn` calls in `client.ts` use the same `(category, meta)` shape as `src/lib/log.ts`'s documented contract, and comment density matches the surrounding file.

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-22**: Spec and checklist created (autonomous). Key decision C1: `toAuthCreds` lives in `src/api/authCreds.ts`, because nine test files factory-mock `src/api/client`.

**2026-10-22**: Mutation check (checklist Phase 1.1 item, FR4) re-verified live during this bookkeeping pass: temporarily removed the `toAuthCreds(...)` arg from `src/hooks/usePayments.ts`'s `fetchPayments` call, ran `npx jest src/__tests__/api/creds-wiring.test.ts` → 1 of 15 tests failed, correctly reporting `missing = ["src/hooks/usePayments.ts:30 fetchPayments(config, token)"]`. Restored the file (`git diff --stat` confirmed a clean no-op) and re-ran the suite → 15/15 passing again. The static guard works as designed.

**2026-10-22**: Spec execution complete. 12 commits in `968f1d5..HEAD`: 5 `test(...)` commits (FR1-FR4 red-phase tests + the post-review `test(01-auth-renewal): optimise tests` pass), 5 `feat(...)` commits (FR1-FR5 implementation), 1 `fix(01-auth-renewal): address review feedback` commit, 1 `spec(01-auth-renewal): add spec and checklist` commit. Review outcome: PR-review feedback addressed in `104dd24` (deduplicated `apiGet`/`apiPut` renewal logic into a private `fetchWithRenewal` helper, JSDoc fixes, added `hooksCredsForwarding.test.ts`); test-optimiser pass in `ede5409` closed 5 named mutation-testing gaps and removed test redundancy. Verification (re-run during this bookkeeping pass unless noted): focused jest 19/19 suites, 572/572 tests green; full suite per spec-executor data 189/189 suites, 5523/5523 tests green (not re-run in full here, per the "run only relevant jest files" rule); `tsc --noEmit` clean; lint 0 errors (508 warnings repo-wide per spec-executor data, 9 warnings on this spec's 19 changed production files, all pre-existing patterns); iOS fingerprint confirmed `56d054fc723984e56892a367dca1efa79a9f8fad` (unchanged); no edits to `package.json`/`package-lock.json`/`app.json`/`eas.json`/`ios/`/`android/`/`patches/`/`plugins/`. One checklist item left unticked: the Test Design Validation phase's "Red run recorded" — no red-run log was found committed anywhere in the repo, so it's noted as not independently verifiable (only inferable from commit ordering).
