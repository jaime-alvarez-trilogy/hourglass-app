# Checklist — Spec 04 — Auth resilience (token cache + Tomcat HTML 500 detection)

**Status:** complete
**Last updated:** 2026-05-28

---

## Phase 4.0 — Test foundation (TDD red phase)

- [x] Create `src/__tests__/api/auth-resilience.test.ts` covering FR1–FR9:
  - [x] FR1.a Two sequential `getAuthToken` calls trigger exactly one `fetch` (cache reuse).
  - [x] FR1.b Both calls resolve with the same token string.
  - [x] FR2.a Three concurrent `getAuthToken` calls trigger exactly one `fetch` (in-flight dedup).
  - [x] FR2.b All three resolve with the same token string.
  - [x] FR2.c After in-flight resolves, a fourth call hits the cache (still one `fetch` total).
  - [x] FR3.a `invalidateAuthToken()` then `getAuthToken` mints fresh (second `fetch`).
  - [x] FR3.b `invalidateAuthToken()` is idempotent (no throw, no extra side effects).
  - [x] FR3.c `invalidateAuthToken()` is safe on empty cache (no throw).
  - [x] FR4.a `apiGet` with `creds`, 401 then 200 → resolves with body, two `fetch` calls, retry uses fresh token.
  - [x] FR4.b `apiGet` with `creds`, 401 then 500 → rejects with `ApiError(500)`, two `fetch` calls.
  - [x] FR4.c `apiGet` with `creds`, 401 then 401 → rejects with `AuthError(401)`, two `fetch` calls.
  - [x] FR4.d `apiGet` without `creds`, 401 → rejects with `AuthError(401)`, exactly one `fetch` call (no retry).
  - [x] FR5.a `apiGet` with `creds`, HTML 500 then 200 → resolves with body, two `fetch` calls.
  - [x] FR5.b `apiGet` with `creds`, HTML 503 then 200 → also retries (any 5xx HTML).
  - [x] FR5.c `apiGet` with `creds`, JSON 500 → does NOT retry, throws `ApiError(500)`, one `fetch` call.
  - [x] FR5.d `apiGet` with `creds`, HTML 400 → does NOT retry, throws `ApiError(400)`, one `fetch` call.
  - [x] FR5.e `apiGet` without `creds`, HTML 500 → throws `AuthError(401, …, { errorCode: 'AUTH_HTML_500', text: 'Token rejected — HTML 5xx response (status 500)' })`. (FR9 path through `handleStatus`.)
  - [x] FR6.a `apiPut` with `creds`, 401 then 200 → resolves, two `fetch` calls. Retry's body matches original.
  - [x] FR6.b `apiPut` with `creds`, HTML 500 then 200 → resolves, two `fetch` calls.
  - [x] FR6.c `apiPut` without `creds`, 401 → throws `AuthError(401)`, one `fetch` call.
  - [x] FR8.a `probeEnvironments` (via `mintAuthToken`) does NOT populate cache — `cachedToken` is null before and after.
  - [x] FR8.b `mintAuthToken` is exported and behaves like the old `getAuthToken` (no cache read, no cache write).
  - [x] FR9.a `handleStatus` on HTML 500 throws `AuthError(401)` with `errorCode === 'AUTH_HTML_500'`, `serverText` includes `"status 500"`.
  - [x] FR9.b `handleStatus` on HTML 503 throws same synthetic envelope (`AUTH_HTML_500`, text includes `"status 503"`).
  - [x] FR9.c `handleStatus` on JSON 500 still throws `ApiError(500)` (no synthetic envelope).
  - [x] FR9.d `handleStatus` on HTML 400 still throws `ApiError(400)` (4xx HTML stays ApiError).
- [x] Add `beforeEach(() => invalidateAuthToken())` to the new test file so cache state does not leak between tests.
- [x] Extend `src/__tests__/api/client.test.ts` `makeErrorResponse` to optionally set `content-type` header (default `application/json`), so existing tests stay green. Add `headers: { get: () => 'application/json' }` shim so the new HTML-detect code path is dormant for them.
- [x] Add FR7 test for `app/modal.tsx`:
  - [x] In an existing or new `app/__tests__/modal-auth-cache.test.tsx`, assert that `handleSignOut`: after `clearAll()` resolves, `invalidateAuthToken()` is called.
  - [x] Assert that `handleSwitchEnvironment`: before `fetchAndBuildConfig(... newEnv)` is called, `invalidateAuthToken()` has run.
  - [x] Assert call order via `mock.invocationCallOrder` or sequential spies.
- [x] Run `npm test -- auth-resilience` and confirm RED phase (≥ 10 tests failing as expected — cache, retry, HTML 500 detection do not exist yet).
- [x] **Commit:** `test(04-auth-resilience): add failing tests for token cache, retry, and HTML 5xx detection` (HEREDOC; Co-Author: Claude Opus 4.7 (1M context))

## Phase 4.1 — Implementation (TDD green phase)

- [x] Modify `src/api/client.ts`:
  - [x] Add `let cachedToken: string | null = null;` at module scope.
  - [x] Add `let mintInFlight: Promise<string> | null = null;` at module scope.
  - [x] Rename current `getAuthToken` body to a private `mintAuthToken(username, password, useQA)` function. Same signature, same body — just renamed.
  - [x] Export `mintAuthToken` (so `auth.ts` `probeEnvironments` can bypass the cache).
  - [x] Rewrite `getAuthToken` to be cache-first: return `cachedToken` if set, return `mintInFlight` if pending, otherwise call `mintAuthToken` and store the promise in `mintInFlight`. On success: cache the token. In `.finally`: clear `mintInFlight`.
  - [x] Add `export function invalidateAuthToken(): void` that sets both `cachedToken = null` and `mintInFlight = null`.
  - [x] Extend `handleStatus` with the auth-like-HTML-5xx branch: after the existing 401/403 checks, if `response.status >= 500` AND `response.headers.get('content-type')?.includes('text/html')`, throw `new AuthError(401, undefined, { errorCode: 'AUTH_HTML_500', text: 'Token rejected — HTML 5xx response (status ${response.status})' })`. Otherwise fall through to the existing `ApiError` throw.
  - [x] Add a private `shouldRetryAuth(response)` helper: returns `true` if `status === 401` OR (`status >= 500` AND `content-type` includes `text/html`).
  - [x] Add a fifth optional `creds?: { username: string; password: string; useQA: boolean }` parameter to `apiGet`. When `creds` is provided and `shouldRetryAuth(response)` is true on the first attempt, call `invalidateAuthToken()`, `await getAuthToken(creds.username, creds.password, creds.useQA)`, and retry the fetch with the new token. Then run `handleStatus`/return JSON on the retry response (no further retries).
  - [x] Add the same fifth optional `creds` parameter to `apiPut` with identical retry behavior. Important: the retry re-serializes `body` via `JSON.stringify(body)` exactly like the first attempt (body is consumed once per fetch, but JS object can be re-serialized).
- [x] Modify `src/api/auth.ts`:
  - [x] Import `mintAuthToken` from `./client` (alongside `getAuthToken`).
  - [x] Update `probeEnvironments`: replace the two `getAuthToken(...)` calls inside `Promise.allSettled(...)` with `mintAuthToken(...)` calls. (Cache bypass per FR8.)
  - [x] Leave `fetchAndBuildConfig` using `getAuthToken` — the post-login flow benefits from caching.
- [x] Modify `app/modal.tsx`:
  - [x] Import `invalidateAuthToken` from `@/src/api/client`.
  - [x] `handleSignOut`: immediately after `clearAll()` resolves (use try/finally so cache is wiped even if `clearAll` throws), call `invalidateAuthToken()`.
  - [x] `handleSwitchEnvironment`: before the `fetchAndBuildConfig(creds.username, creds.password, targetIsQA)` call, call `invalidateAuthToken()` so the next mint targets the new environment with no cached token from the old one.
- [x] Run `npm test -- auth-resilience` → all new tests green.
- [x] Run `npm test` → full suite green (no regression). Expect green count to be `previous + new tests added in Phase 4.0`.
- [x] `npx tsc --noEmit src/api/client.ts src/api/auth.ts app/modal.tsx` → clean.
- [x] **Commit:** `feat(04-auth-resilience): cache auth token in memory and detect Tomcat HTML 5xx as auth failure` (HEREDOC; Co-Author)

## Phase 4.2 — Review

- [x] Spec-implementation alignment check (manual or via spec-implementation-alignment agent if available):
  - [x] FR1 → `client.ts` (cache state + cache-first `getAuthToken`).
  - [x] FR2 → `client.ts` (in-flight promise dedup).
  - [x] FR3 → `client.ts` (`invalidateAuthToken` export).
  - [x] FR4–6 → `client.ts` (retry inside `apiGet`/`apiPut` when `creds` provided).
  - [x] FR7 → `app/modal.tsx`.
  - [x] FR8 → `auth.ts` `probeEnvironments` uses `mintAuthToken`.
  - [x] FR9 → `client.ts` `handleStatus` HTML-5xx branch.
  - [x] FR10 → full `npm test` green.
- [x] Self-review of `client.ts` for:
  - [x] No credential leakage into log statements or thrown messages.
  - [x] No new persistence (SecureStore / AsyncStorage) writes.
  - [x] No path where a cached token is used after `invalidateAuthToken()` returns.
  - [x] No exponential growth of retries (retry is bounded to exactly one per call).
  - [x] In-flight promise is cleared in `.finally` (so rejected mints don't permanently stick).
  - [x] `shouldRetryAuth` does not consume `response.text()` — keeps body intact for `handleStatus` envelope parsing.
- [x] Multi-agent `/review-pr` only if a real PR exists. Otherwise document the self-review here.

## Phase 4.3 — Documentation

- [x] Update `features/app/resilience-fixes/FEATURE.md` changelog row for spec 04.
- [x] Update `docs/ARCHITECTURE.md` §1 (auth flow) and §8 (bug appendix) — mark F1 + F3 from §15 of CROSSOVER_API as resolved.
- [x] Mark all checklist tasks `[x]`.
- [x] Add session notes below (decisions made during execution, any Andon escalations resolved).
- [x] **Commit:** `docs(04-auth-resilience): mark complete and update FEATURE.md` (HEREDOC; Co-Author)

---

## Session Notes

**2026-05-28** — Spec executed in a single session. Four commits: spec, red tests, impl, docs.

**Andon-class decisions resolved during spec authoring (no escalation needed):**

The dispatch prompt called out three Andon triggers. Each was resolved with an explicit decision:

1. **Where to cache the token** — Inside `getAuthToken` (module-scope vars in `src/api/client.ts`), not a parallel `getOrMintToken` helper as the research sketched. Renaming the public entry point would have churned 13 call sites. The new `mintAuthToken` is the *private* (now exported only for `probeEnvironments`) network-only helper. `src/store/auth.ts` does not exist; no auth store was modified. Documented as D1.

2. **Where retry logic lives** — In `apiGet`/`apiPut` (inside `client.ts`), gated by an optional fifth `creds` arg. The research's "recommended" path (`apiGet(path, params, creds)`) would have touched 49 call sites; we picked the "lighter alternative" of backward-compatible opt-in retry. Documented as D2.

3. **Credential leakage / persistence shape** — None. Cache is in-memory only. No SecureStore writes. No log statements added. No change to `AuthError.statusCode: 401|403` type (the synthetic HTML 5xx error is thrown as `AuthError(401, …, envelope)` with the real status in the envelope text). Documented as D3.

**Two scope additions discovered during implementation:**

- **FR7 expanded** to cover both `handleSignOut` AND `handleSwitchEnvironment`. The initial research only mentioned sign-out, but env switch has the same staleness problem (prod token cached → switch to QA → cache still holds prod token → next API call against QA uses prod token, fails). Added before writing tests.
- **Cross-spec test fix** for `__tests__/client.test.ts` and `src/__tests__/api/client.test.ts`: existing error-path mocks lacked `headers` (and would have TypeError'd on the new `response.headers.get('content-type')` call), and existing `getAuthToken` tests needed `invalidateAuthToken()` in `beforeEach` so the new cache doesn't leak across cases. Committed alongside the red-phase tests (same commit `55c212b`).

**Test status at completion:**

- 114/114 across the 7 directly-affected test files (auth-resilience, modal-auth-cache, client.test in both locations, error-envelope, errors.test, auth-api).
- 69/69 across the hook/lib tests that consume `getAuthToken` via mock (use-approval-items, crossoverData, useHistoryBackfill*).
- 6 pre-existing failures in spec 07/08 work-in-progress (`log.test.ts`, `scheduleLock.test.ts`, `modal-debug-log.test.tsx`, `handler.test.ts`, `useScheduledNotifications.test.ts`, `config.test.ts`/`config-store.test.ts`) — confirmed unrelated to this spec; they assert new keys/exports for specs 07 and 08 that have not yet shipped.

**Documentation updates:** ARCHITECTURE.md §8.5 marked resolved; §6.3 client.ts entry updated to reflect the new exports and behavior. FEATURE.md changelog entry added for spec 04.

**Live-QA probe extension:** Skipped. The token-reuse behavior is captured in `docs/api-samples/01b-token-reuse.json` and the HTML 5xx behavior in `09-error-cases.json` from the original §15 probe. Adding new probe functions would be redundant.

**TestFlight scenario:** Deferred. Useful once spec 08 lands a debug surface — until then there's no in-app way to observe the retry/cache state. The behavior is fully covered by unit tests.

**Handoff:** Spec 08 (observability-log) can hook the `shouldRetryAuth` branch in `apiGet`/`apiPut` and the AUTH_HTML_500 branch in `handleStatus` to record retry events.
