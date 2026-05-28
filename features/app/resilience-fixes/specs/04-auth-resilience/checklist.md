# Checklist — Spec 04 — Auth resilience (token cache + Tomcat HTML 500 detection)

**Status:** Draft
**Last updated:** 2026-05-28

---

## Phase 4.0 — Test foundation (TDD red phase)

- [ ] Create `src/__tests__/api/auth-resilience.test.ts` covering FR1–FR9:
  - [ ] FR1.a Two sequential `getAuthToken` calls trigger exactly one `fetch` (cache reuse).
  - [ ] FR1.b Both calls resolve with the same token string.
  - [ ] FR2.a Three concurrent `getAuthToken` calls trigger exactly one `fetch` (in-flight dedup).
  - [ ] FR2.b All three resolve with the same token string.
  - [ ] FR2.c After in-flight resolves, a fourth call hits the cache (still one `fetch` total).
  - [ ] FR3.a `invalidateAuthToken()` then `getAuthToken` mints fresh (second `fetch`).
  - [ ] FR3.b `invalidateAuthToken()` is idempotent (no throw, no extra side effects).
  - [ ] FR3.c `invalidateAuthToken()` is safe on empty cache (no throw).
  - [ ] FR4.a `apiGet` with `creds`, 401 then 200 → resolves with body, two `fetch` calls, retry uses fresh token.
  - [ ] FR4.b `apiGet` with `creds`, 401 then 500 → rejects with `ApiError(500)`, two `fetch` calls.
  - [ ] FR4.c `apiGet` with `creds`, 401 then 401 → rejects with `AuthError(401)`, two `fetch` calls.
  - [ ] FR4.d `apiGet` without `creds`, 401 → rejects with `AuthError(401)`, exactly one `fetch` call (no retry).
  - [ ] FR5.a `apiGet` with `creds`, HTML 500 then 200 → resolves with body, two `fetch` calls.
  - [ ] FR5.b `apiGet` with `creds`, HTML 503 then 200 → also retries (any 5xx HTML).
  - [ ] FR5.c `apiGet` with `creds`, JSON 500 → does NOT retry, throws `ApiError(500)`, one `fetch` call.
  - [ ] FR5.d `apiGet` with `creds`, HTML 400 → does NOT retry, throws `ApiError(400)`, one `fetch` call.
  - [ ] FR5.e `apiGet` without `creds`, HTML 500 → throws `AuthError(401, …, { errorCode: 'AUTH_HTML_500', text: 'Token rejected — HTML 5xx response (status 500)' })`. (FR9 path through `handleStatus`.)
  - [ ] FR6.a `apiPut` with `creds`, 401 then 200 → resolves, two `fetch` calls. Retry's body matches original.
  - [ ] FR6.b `apiPut` with `creds`, HTML 500 then 200 → resolves, two `fetch` calls.
  - [ ] FR6.c `apiPut` without `creds`, 401 → throws `AuthError(401)`, one `fetch` call.
  - [ ] FR8.a `probeEnvironments` (via `mintAuthToken`) does NOT populate cache — `cachedToken` is null before and after.
  - [ ] FR8.b `mintAuthToken` is exported and behaves like the old `getAuthToken` (no cache read, no cache write).
  - [ ] FR9.a `handleStatus` on HTML 500 throws `AuthError(401)` with `errorCode === 'AUTH_HTML_500'`, `serverText` includes `"status 500"`.
  - [ ] FR9.b `handleStatus` on HTML 503 throws same synthetic envelope (`AUTH_HTML_500`, text includes `"status 503"`).
  - [ ] FR9.c `handleStatus` on JSON 500 still throws `ApiError(500)` (no synthetic envelope).
  - [ ] FR9.d `handleStatus` on HTML 400 still throws `ApiError(400)` (4xx HTML stays ApiError).
- [ ] Add `beforeEach(() => invalidateAuthToken())` to the new test file so cache state does not leak between tests.
- [ ] Extend `src/__tests__/api/client.test.ts` `makeErrorResponse` to optionally set `content-type` header (default `application/json`), so existing tests stay green. Add `headers: { get: () => 'application/json' }` shim so the new HTML-detect code path is dormant for them.
- [ ] Add FR7 test for `app/modal.tsx`:
  - [ ] In an existing or new `app/__tests__/modal-auth-cache.test.tsx`, assert that `handleSignOut`: after `clearAll()` resolves, `invalidateAuthToken()` is called.
  - [ ] Assert that `handleSwitchEnvironment`: before `fetchAndBuildConfig(... newEnv)` is called, `invalidateAuthToken()` has run.
  - [ ] Assert call order via `mock.invocationCallOrder` or sequential spies.
- [ ] Run `npm test -- auth-resilience` and confirm RED phase (≥ 10 tests failing as expected — cache, retry, HTML 500 detection do not exist yet).
- [ ] **Commit:** `test(04-auth-resilience): add failing tests for token cache, retry, and HTML 5xx detection` (HEREDOC; Co-Author: Claude Opus 4.7 (1M context))

## Phase 4.1 — Implementation (TDD green phase)

- [ ] Modify `src/api/client.ts`:
  - [ ] Add `let cachedToken: string | null = null;` at module scope.
  - [ ] Add `let mintInFlight: Promise<string> | null = null;` at module scope.
  - [ ] Rename current `getAuthToken` body to a private `mintAuthToken(username, password, useQA)` function. Same signature, same body — just renamed.
  - [ ] Export `mintAuthToken` (so `auth.ts` `probeEnvironments` can bypass the cache).
  - [ ] Rewrite `getAuthToken` to be cache-first: return `cachedToken` if set, return `mintInFlight` if pending, otherwise call `mintAuthToken` and store the promise in `mintInFlight`. On success: cache the token. In `.finally`: clear `mintInFlight`.
  - [ ] Add `export function invalidateAuthToken(): void` that sets both `cachedToken = null` and `mintInFlight = null`.
  - [ ] Extend `handleStatus` with the auth-like-HTML-5xx branch: after the existing 401/403 checks, if `response.status >= 500` AND `response.headers.get('content-type')?.includes('text/html')`, throw `new AuthError(401, undefined, { errorCode: 'AUTH_HTML_500', text: 'Token rejected — HTML 5xx response (status ${response.status})' })`. Otherwise fall through to the existing `ApiError` throw.
  - [ ] Add a private `shouldRetryAuth(response)` helper: returns `true` if `status === 401` OR (`status >= 500` AND `content-type` includes `text/html`).
  - [ ] Add a fifth optional `creds?: { username: string; password: string; useQA: boolean }` parameter to `apiGet`. When `creds` is provided and `shouldRetryAuth(response)` is true on the first attempt, call `invalidateAuthToken()`, `await getAuthToken(creds.username, creds.password, creds.useQA)`, and retry the fetch with the new token. Then run `handleStatus`/return JSON on the retry response (no further retries).
  - [ ] Add the same fifth optional `creds` parameter to `apiPut` with identical retry behavior. Important: the retry re-serializes `body` via `JSON.stringify(body)` exactly like the first attempt (body is consumed once per fetch, but JS object can be re-serialized).
- [ ] Modify `src/api/auth.ts`:
  - [ ] Import `mintAuthToken` from `./client` (alongside `getAuthToken`).
  - [ ] Update `probeEnvironments`: replace the two `getAuthToken(...)` calls inside `Promise.allSettled(...)` with `mintAuthToken(...)` calls. (Cache bypass per FR8.)
  - [ ] Leave `fetchAndBuildConfig` using `getAuthToken` — the post-login flow benefits from caching.
- [ ] Modify `app/modal.tsx`:
  - [ ] Import `invalidateAuthToken` from `@/src/api/client`.
  - [ ] `handleSignOut`: immediately after `clearAll()` resolves (use try/finally so cache is wiped even if `clearAll` throws), call `invalidateAuthToken()`.
  - [ ] `handleSwitchEnvironment`: before the `fetchAndBuildConfig(creds.username, creds.password, targetIsQA)` call, call `invalidateAuthToken()` so the next mint targets the new environment with no cached token from the old one.
- [ ] Run `npm test -- auth-resilience` → all new tests green.
- [ ] Run `npm test` → full suite green (no regression). Expect green count to be `previous + new tests added in Phase 4.0`.
- [ ] `npx tsc --noEmit src/api/client.ts src/api/auth.ts app/modal.tsx` → clean.
- [ ] **Commit:** `feat(04-auth-resilience): cache auth token in memory and detect Tomcat HTML 5xx as auth failure` (HEREDOC; Co-Author)

## Phase 4.2 — Review

- [ ] Spec-implementation alignment check (manual or via spec-implementation-alignment agent if available):
  - [ ] FR1 → `client.ts` (cache state + cache-first `getAuthToken`).
  - [ ] FR2 → `client.ts` (in-flight promise dedup).
  - [ ] FR3 → `client.ts` (`invalidateAuthToken` export).
  - [ ] FR4–6 → `client.ts` (retry inside `apiGet`/`apiPut` when `creds` provided).
  - [ ] FR7 → `app/modal.tsx`.
  - [ ] FR8 → `auth.ts` `probeEnvironments` uses `mintAuthToken`.
  - [ ] FR9 → `client.ts` `handleStatus` HTML-5xx branch.
  - [ ] FR10 → full `npm test` green.
- [ ] Self-review of `client.ts` for:
  - [ ] No credential leakage into log statements or thrown messages.
  - [ ] No new persistence (SecureStore / AsyncStorage) writes.
  - [ ] No path where a cached token is used after `invalidateAuthToken()` returns.
  - [ ] No exponential growth of retries (retry is bounded to exactly one per call).
  - [ ] In-flight promise is cleared in `.finally` (so rejected mints don't permanently stick).
  - [ ] `shouldRetryAuth` does not consume `response.text()` — keeps body intact for `handleStatus` envelope parsing.
- [ ] Multi-agent `/review-pr` only if a real PR exists. Otherwise document the self-review here.

## Phase 4.3 — Documentation

- [ ] Update `features/app/resilience-fixes/FEATURE.md` changelog row for spec 04.
- [ ] Update `docs/ARCHITECTURE.md` §1 (auth flow) and §8 (bug appendix) — mark F1 + F3 from §15 of CROSSOVER_API as resolved.
- [ ] Mark all checklist tasks `[x]`.
- [ ] Add session notes below (decisions made during execution, any Andon escalations resolved).
- [ ] **Commit:** `docs(04-auth-resilience): mark complete and update FEATURE.md` (HEREDOC; Co-Author)

---

## Session Notes

_(Populated during execution.)_
