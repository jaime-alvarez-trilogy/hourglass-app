# 04 — Auth resilience (in-memory token cache + Tomcat HTML 500 detection)

**Status:** Ready for implementation
**Created:** 2026-05-28
**Last Updated:** 2026-05-28
**Owner:** @jaime-alvarez-trilogy
**Complexity:** M
**Blocks:** —
**Blocked by:** 02 (ci-pipeline), 03 (error-envelope) — both complete

---

## Overview

Two related auth defects, both rooted in `src/api/client.ts`.

**Defect F1 — per-request token mint.** Today every `apiGet` / `apiPut` caller first calls `getAuthToken` (e.g. `useApprovalItems.ts:45,141,189`, `useTimesheet.ts:29`, `usePayments.ts:28`, `useRoleRefresh.ts:38`, `useHistoryBackfill.ts:118`, `useEarningsHistory.ts:105`, `usePaymentHistory.ts:69`, `crossoverData.ts:79`, `workDiary.ts:22`, `auth.ts:140`). The live-QA probe (`docs/CROSSOVER_API.md` §15.F1) confirmed tokens are reusable for at least 12 seconds. On Home-screen mount we currently fire roughly 5 parallel data calls and pay for 5 token mints (≈ 10 round-trips) when a single shared token would suffice.

**Defect F3 — bad tokens return Tomcat HTML 500.** `GET /api/identity/users/current/detail` with a bogus token returns `500` with `content-type: text/html` and a `<!doctype html>` body, not 401 (`docs/CROSSOVER_API.md` §15.F3). The current `handleStatus` (`client.ts:50-79`) maps 401/403 → `AuthError` and everything else → `ApiError`. Expired tokens therefore never reach the `AuthError`-catching re-onboarding logic in `useAuth.ts:54-74` — the most common auth failure mode is silently demoted to a generic 500.

This spec ships both fixes together because the retry-on-auth-failure inside the API client is what gives the cache its escape hatch: if the cached token has gone stale, the next call detects the auth failure (401 or auth-like HTML 500), invalidates the cache, re-mints, and retries once.

The change is **additive and signature-compatible.** Callers do not change — `apiGet(path, params, token, useQA)` and `apiPut(path, body, token, useQA)` keep their current 4-arg signatures. The new retry path is opt-in via an optional 5th `creds` argument; when omitted, behavior is identical to today. The token cache lives inside `getAuthToken` itself, so every existing call site benefits without any refactor at the call site.

---

## Out of Scope

1. **Persisting the cached token to SecureStore.** Tokens are cheap to re-mint on cold start, and persisting expands the credential blast radius. The cache is in-memory only.

2. **Refactoring `apiGet` / `apiPut` to take creds positionally.** The research's "recommended" path proposed `apiGet(path, params, creds)` and removing the `token` argument. That would change ~49 call sites across 14 files. Out of scope — we keep the existing signatures and accept the slightly less elegant retry contract.

3. **Multi-attempt retry / exponential backoff.** A single retry on auth failure is enough. If the second call also fails, the error propagates to the caller (matching today's behavior on any non-auth failure).

4. **Detecting Cloudflare / WAF HTML responses separately from Tomcat HTML 500.** Any `>=500` response with `content-type: text/html` is treated as auth-like and triggers a re-mint. If the real cause is a Cloudflare 503, the retry will also fail in the same way and a real error propagates — see Risks below.

5. **Surfacing `AUTH_HTML_500` to the user.** A synthetic envelope `{ errorCode: 'AUTH_HTML_500' }` is attached to the thrown `AuthError` so downstream code (re-onboarding flow, observability log) can distinguish it from a real 401. No UI change ships in this spec.

6. **Logging the retry event.** Spec 08 (observability-log) will record `AUTH_HTML_500_RETRIED` and `AUTH_401_RETRIED` events. This spec only attaches the synthetic envelope so the log call site has data to record later.

7. **Invalidating the cache on `clearAll` from inside `src/store/config.ts`.** That would create a `store → api` import alongside the existing `api → store` import (`client.ts:4`), introducing a cycle. Instead, the only `clearAll` call site (`app/modal.tsx:11`) calls `invalidateAuthToken()` immediately after `clearAll()`. Documented in FR7.

8. **Cache eviction on app suspend / background transition.** The cache lives in module scope and dies when the JS runtime is torn down (cold start). No explicit timer eviction — if the token is stale, the next request will trigger the auth-failure retry path.

9. **Probing the actual token TTL beyond 12 seconds.** Deferred to a future Crossover-liaison conversation (already noted in `docs/CROSSOVER_API.md` §15.F1). Our retry path makes the exact TTL operationally irrelevant — we discover staleness reactively.

10. **Changing the `AuthError.statusCode` type to admit 500/503.** `AuthError.statusCode` is currently typed `401 | 403`. The synthetic auth-like-HTML-5xx error is thrown as a `401` (not the response's actual 500/503) so the existing type contract holds; the *real* HTTP status is recoverable from the envelope's `text` field when needed for debugging. See D3 in Decisions.

---

## Decisions

### D1 — Cache lives inside `getAuthToken`, not as a parallel `getOrMintToken`

The research sketch proposed a new `getOrMintToken` function and a renamed `_freshAuthToken` private helper. Today `getAuthToken` is the public, well-known entry point used by 13 call sites in `src/`. Renaming or splitting it would force all those call sites to either change imports or accept that "getAuthToken" no longer means "mint a fresh token." Cleaner: make `getAuthToken` cache its result internally, and expose `invalidateAuthToken()` for explicit reset. Anyone reading the name expects a token; they get one (cached or freshly minted). The freshly-minted code path moves to a private `mintAuthToken` helper inside `client.ts` — not exported.

### D2 — Retry-on-auth-failure is opt-in via an optional 5th `creds` argument

Two reasons:

- **Backward compatibility.** Every existing caller passes `(path, params, token, useQA)` for `apiGet` and `(path, body, token, useQA)` for `apiPut`. Adding `creds?: { username; password; useQA }` as a fifth parameter keeps them all compiling and behaving exactly as before. We get the retry "for free" on call sites that opt in.

- **Token still needed on the first call.** Even with caching inside `getAuthToken`, the API client needs to know the credentials to mint a fresh one if the cached one is rejected. The token alone is not enough; we need username + password + useQA to call `POST /api/v3/token`. Threading those through the existing token argument would be impossible without a wider refactor. An optional `creds` argument is the smallest possible contract widening.

When `creds` is omitted, `apiGet` / `apiPut` behave exactly as today: one fetch, no retry, status-based throw. When `creds` is provided and the response is a 401 or auth-like HTML 5xx, the client invalidates the cache, calls `getAuthToken(creds)` (which mints fresh because cache is empty), and retries the original request with the new token. After one retry, any failure propagates.

### D3 — The synthetic HTML-5xx error is thrown as `AuthError(401, …, envelope)`, not `AuthError(500)`

`AuthError.statusCode` is typed `401 | 403` (`src/api/errors.ts:12`). Widening it to admit 500/503 would ripple through every existing test that asserts `error.statusCode === 401` for auth failures (`useAuth.ts:54`, plus a dozen test assertions). Cleaner: when we detect an auth-like HTML 5xx, we throw `new AuthError(401, undefined, { errorCode: 'AUTH_HTML_500', text: 'Token rejected — HTML 5xx response (real status N)' })`. Downstream code that branches on `statusCode === 401` keeps working unchanged; code that wants to differentiate the synthetic case checks `errorCode === 'AUTH_HTML_500'`. The actual HTTP status is preserved inside the envelope's `text` field for debug logs.

### D4 — Auth-like HTML detection: status ≥ 500 AND content-type includes `text/html`

We do not parse the body to look for `<!doctype html>` — that would consume the body twice (once for detection, once for `handleStatus`'s envelope read), and `Response.text()` is single-shot. Header-only detection is sufficient because Tomcat's content-type is reliably `text/html;charset=utf-8` on its error pages (confirmed in `docs/api-samples/09-error-cases.json`). A 500 with `application/json` body is a real server error, not auth-shaped — `handleStatus` keeps treating it as `ApiError`.

We deliberately do **not** treat a 4xx HTML response as auth-like — only 5xx. The `if (response.status === 401 || response.status === 403)` branch in `handleStatus` handles real 4xx auth cases via envelope; a 400 with text/html (theoretical, not observed) would still be `ApiError(400)`.

### D5 — In-flight mint deduplication via a shared promise

When N hooks call `apiGet` concurrently on first mount, all N will call `getAuthToken` before the first response arrives. Without coordination, all N would race to mint, and N tokens would be created (3 of which are wasted). A single `mintInFlight: Promise<string> | null` variable holds the pending mint; concurrent callers `await` it and resolve to the same token. Once it resolves, `mintInFlight` is cleared in a `.finally`, so subsequent callers either hit the cache (fast path) or start a new mint (cache miss). This is a well-known pattern (request deduplication / singleflight).

### D6 — Cache invalidation responsibility lives at the only `clearAll` call site

`src/store/config.ts:clearAll()` is called exactly once in the codebase: `app/modal.tsx:11` (sign-out / re-onboarding flow). To keep the layering clean (store does not import from api), `app/modal.tsx` calls `invalidateAuthToken()` immediately after `clearAll()`. If a future caller of `clearAll` is added, it must also call `invalidateAuthToken()` — this is documented as a JSDoc note on `clearAll` and verified by a unit test in this spec.

---

## Functional Requirements

### FR1 — `getAuthToken` caches its result in module scope

After the first successful `getAuthToken(u, p, qa)` call, subsequent calls (with any arguments) MUST return the cached token without hitting the network, until `invalidateAuthToken()` is called or the JS runtime is torn down.

**Success criteria:**
- Two sequential `getAuthToken('a', 'b', false)` calls in the same module session result in exactly **one** `fetch('/api/v3/token')` call.
- `getAuthToken` resolves with the same string both times.
- The cached token is module-scoped, not request-scoped — survives across `apiGet`, `apiPut`, and direct `getAuthToken` callers.

**Note on cache key.** The cache stores a single token, keyed implicitly by "whichever creds were used for the most recent successful mint." We deliberately do not key the cache by `(username, password, useQA)` tuple because (a) the app is single-user at any moment, (b) `clearAll` (called on sign-out / env switch) calls `invalidateAuthToken` explicitly, and (c) `probeEnvironments` (the only multi-env caller) bypasses the cache via `mintAuthToken` directly. See FR6.

### FR2 — Concurrent first calls share a single in-flight mint

When N callers invoke `getAuthToken` before the first mint completes, all N callers MUST `await` the same in-flight promise. The result is a single network mint and N callers receiving the same token.

**Success criteria:**
- `Promise.all([getAuthToken(c), getAuthToken(c), getAuthToken(c)])` with `fetch` mocked to resolve after a tick triggers **one** `fetch` call.
- All three promises resolve with the same token string.
- After resolution, the in-flight promise is cleared (next call goes to cache, not to a stale pending state).

### FR3 — `invalidateAuthToken()` clears the cache

A new exported function `invalidateAuthToken(): void` MUST clear both the cached token and any in-flight promise, so the next `getAuthToken` call mints fresh.

**Success criteria:**
- After `getAuthToken` succeeds, calling `invalidateAuthToken()` and then `getAuthToken` again triggers a second `fetch`.
- `invalidateAuthToken()` is idempotent — calling it twice in a row is safe.
- `invalidateAuthToken()` is callable when no token is cached (no-op).

### FR4 — `apiGet` retries once on 401 with a freshly-minted token when `creds` is provided

When `apiGet(path, params, token, useQA, creds)` is called with `creds` and the first response is 401, `apiGet` MUST:
1. Call `invalidateAuthToken()`.
2. Call `getAuthToken(creds)` to mint a fresh token.
3. Retry the original request with the new token.
4. If the retry succeeds (2xx), return the parsed JSON.
5. If the retry fails with any status, throw the normal `handleStatus` error (no further retries).

When `creds` is omitted, `apiGet` MUST NOT retry — current behavior preserved.

**Success criteria:**
- `apiGet(p, {}, 'stale', false, creds)` with fetch returning 401 then 200 → resolves with the 200 body. Exactly two `fetch` calls. The second call's `x-auth-token` header equals the freshly-minted token.
- `apiGet(p, {}, 'stale', false, creds)` with fetch returning 401 then 500 → rejects with `ApiError(500)`. Exactly two `fetch` calls.
- `apiGet(p, {}, 'stale', false, creds)` with fetch returning 401 then 401 → rejects with `AuthError(401)`. Exactly two `fetch` calls.
- `apiGet(p, {}, 'stale', false)` (no creds) with fetch returning 401 → rejects with `AuthError(401)`. Exactly one `fetch` call.

### FR5 — `apiGet` and `apiPut` retry once on auth-like HTML 5xx when `creds` is provided

When the response has `status >= 500` AND `content-type` includes `text/html`, and `creds` is provided, the same retry flow as FR4 applies. The thrown error on retry failure carries the synthetic envelope `{ errorCode: 'AUTH_HTML_500', text: 'Token rejected — HTML 5xx response (status ${status})' }` and `statusCode === 401` (per D3).

**Success criteria:**
- `apiGet(p, {}, 'stale', false, creds)` with first response `status: 500, content-type: text/html, body: <!doctype html>...` and second response `status: 200, body: {...}` → resolves with the 200 body. Exactly two `fetch` calls.
- Same with first `503, text/html` → also retries (any 5xx HTML treated as auth-like).
- First response `status: 500, content-type: application/json` → does NOT retry, throws `ApiError(500)`. Exactly one `fetch` call. (Real 500, not auth-shaped.)
- First response `status: 400, content-type: text/html` → does NOT retry (4xx HTML stays `ApiError(400)`). Exactly one `fetch` call.
- Without `creds`, an auth-like HTML 5xx response throws `AuthError(401, …, { errorCode: 'AUTH_HTML_500', text: 'Token rejected — HTML 5xx response (status 500)' })` directly from `handleStatus`. (handleStatus gains the synthetic-envelope path independent of retry.)

### FR6 — `apiPut` retry mirrors `apiGet` retry

`apiPut(path, body, token, useQA, creds)` MUST implement the same retry behavior as `apiGet` for 401 and auth-like HTML 5xx, with identical contract for `creds`-omitted vs `creds`-provided.

**Success criteria:**
- `apiPut(p, b, 'stale', false, creds)` with fetch returning 401 then 200 (empty body) → resolves with `undefined`. Exactly two `fetch` calls. The retry sends the original `body` argument (re-serialized) and the new token.
- Same retry rules as FR5 for HTML 5xx.

### FR7 — `app/modal.tsx` invalidates the cache on sign-out and env switch

Two code paths in `app/modal.tsx` change "which credentials should the cache represent":

- **`handleSignOut`** — clears all stored data. MUST call `invalidateAuthToken()` immediately after `clearAll()` so the in-memory token does not survive sign-out.
- **`handleSwitchEnvironment`** — switches between prod and QA. MUST call `invalidateAuthToken()` *before* the `fetchAndBuildConfig` call so the next `getAuthToken` is a fresh mint against the new environment (otherwise the cache would serve a stale prod token in a QA call site, or vice-versa).

**Success criteria:**
- `handleSignOut`: after `clearAll()` resolves, `invalidateAuthToken()` is called. Unit test asserts both functions are invoked.
- `handleSwitchEnvironment`: before `fetchAndBuildConfig(creds.username, creds.password, targetIsQA)` is called, `invalidateAuthToken()` has run. Unit test asserts the invalidation precedes the config fetch.

### FR8 — `probeEnvironments` bypasses the cache

`probeEnvironments` in `src/api/auth.ts` runs parallel auth attempts against prod and QA. It MUST NOT populate the cache (because we don't yet know which env the user will pick), and it MUST NOT read from the cache (because we want to verify both creds work, not return a stale answer).

**Success criteria:**
- After `probeEnvironments(u, p)` resolves, the cache state is unchanged from before the call.
- `probeEnvironments` calls a private `mintAuthToken` helper directly (not `getAuthToken`), bypassing the cache layer.

### FR9 — `handleStatus` recognizes auth-like HTML 5xx independently of retry

Even when `apiGet` / `apiPut` is called without `creds`, the `handleStatus` helper MUST recognize an auth-like HTML 5xx response and throw `AuthError(401, undefined, { errorCode: 'AUTH_HTML_500', text: 'Token rejected — HTML 5xx response (status ${status})' })` instead of `ApiError(500)`. This ensures the existing re-onboarding flow in `useAuth.ts:54` (which catches `AuthError`) fires for expired tokens even on call sites that have not opted into the new retry contract.

**Success criteria:**
- `getAuthToken` flow: a bogus token making a follow-up `/detail` call (e.g. via `probeEnvironments` or a `crossoverData` path) yields an `AuthError` with `errorCode === 'AUTH_HTML_500'`, not an `ApiError(500)`.
- All existing 401/403 → `AuthError` cases continue to work unchanged.
- 500 JSON responses (with valid envelope or empty) continue to throw `ApiError(500)`.
- 4xx HTML responses continue to throw `ApiError(status)`.

### FR10 — Existing tests must not regress

`npm test` MUST continue to pass with the same green count after this spec lands. Test mocks that previously stubbed only `headers.get('content-type')` returning `null` (or omitting it entirely) may need `text/html` adjustments only in the new tests that target auth-like-HTML detection — existing tests already use JSON bodies and JSON content-types, so the new HTML branch is dormant for them.

**Success criteria:**
- `npm test` green count before this spec === green count after this spec, plus the new tests added in Phase 4.0.
- No previously-passing test is loosened, skipped, or removed.

---

## Technical Design

### Files to modify

| File | Change |
|---|---|
| `src/api/client.ts` | Add module-scope `cachedToken` and `mintInFlight` vars. Rename current network-fetch body to `mintAuthToken` (private). Make `getAuthToken` cache-first. Export `invalidateAuthToken()`. Extend `handleStatus` with auth-like-HTML-5xx detection. Add optional `creds` arg to `apiGet` and `apiPut` plus retry loop. |
| `src/api/auth.ts` | `probeEnvironments` switches from `getAuthToken` to a new exported `mintAuthToken` (cache-bypass). |
| `app/modal.tsx` | After `clearAll()`, call `invalidateAuthToken()`. |
| `src/__tests__/api/client.test.ts` | New tests added under existing describe blocks for the auth-resilience behavior. |

### Files to create

| File | Purpose |
|---|---|
| `src/__tests__/api/auth-resilience.test.ts` | New test file targeting FR1–FR9 explicitly (token cache, in-flight dedup, invalidate, retry on 401, retry on HTML 5xx, JSON-500-not-retried, probeEnvironments bypass, handleStatus HTML 5xx synthetic envelope). |
| `src/__tests__/app/modal.test.tsx` (or extension to existing) | FR7 — verify `invalidateAuthToken` runs after `clearAll` in the sign-out path. |

### Implementation sketch

`src/api/client.ts` — new module state and helpers:

```typescript
let cachedToken: string | null = null;
let mintInFlight: Promise<string> | null = null;

async function mintAuthToken(
  username: string,
  password: string,
  useQA: boolean,
): Promise<string> {
  // ...current body of getAuthToken (fetch, parse, throw on error)...
}

export async function getAuthToken(
  username: string,
  password: string,
  useQA: boolean,
): Promise<string> {
  if (cachedToken) return cachedToken;
  if (mintInFlight) return mintInFlight;
  mintInFlight = mintAuthToken(username, password, useQA)
    .then((t) => { cachedToken = t; return t; })
    .finally(() => { mintInFlight = null; });
  return mintInFlight;
}

export function invalidateAuthToken(): void {
  cachedToken = null;
  mintInFlight = null;
}

// Used by probeEnvironments — bypass cache.
export { mintAuthToken };
```

`handleStatus` gains the synthetic-envelope branch:

```typescript
async function handleStatus(response: Response): Promise<never> {
  // ...existing envelope-read block from spec 03...

  if (response.status === 401) throw new AuthError(401, undefined, envelope);
  if (response.status === 403) throw new AuthError(403, undefined, envelope);

  // Auth-like HTML 5xx (Tomcat error page for bad tokens).
  if (response.status >= 500) {
    const ct = response.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      throw new AuthError(401, undefined, {
        errorCode: 'AUTH_HTML_500',
        text: `Token rejected — HTML 5xx response (status ${response.status})`,
      });
    }
  }

  throw new ApiError(response.status, undefined, envelope);
}
```

`apiGet` adds the optional `creds` arg and retry:

```typescript
export async function apiGet<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  useQA: boolean,
  creds?: { username: string; password: string; useQA: boolean },
): Promise<T> {
  const url = buildUrl(getApiBase(useQA), path, params);

  async function doFetch(t: string): Promise<Response> {
    try {
      return await fetch(url, { method: 'GET', headers: { 'x-auth-token': t } });
    } catch (err) {
      throw new NetworkError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  let response = await doFetch(token);
  if (creds && shouldRetryAuth(response)) {
    invalidateAuthToken();
    const fresh = await getAuthToken(creds.username, creds.password, creds.useQA);
    response = await doFetch(fresh);
  }
  if (!response.ok) await handleStatus(response);
  return response.json() as Promise<T>;
}

function shouldRetryAuth(response: Response): boolean {
  if (response.status === 401) return true;
  if (response.status >= 500) {
    const ct = response.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) return true;
  }
  return false;
}
```

`apiPut` adds the same retry pattern (also re-serializing `body` on retry).

`src/api/auth.ts`:

```typescript
import { mintAuthToken } from './client'; // new bypass-cache import

// Inside probeEnvironments:
const [prodResult, qaResult] = await Promise.allSettled([
  mintAuthToken(username, password, false),
  mintAuthToken(username, password, true),
]);
```

`app/modal.tsx`:

```typescript
import { invalidateAuthToken } from '@/src/api/client';
// ...
await clearAll();
invalidateAuthToken();
```

### Verification of "single fetch with cache" via Jest

The auth-resilience test will mock `fetch` and assert call counts:

```typescript
// FR1: cache reuse
mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-abc'));
const t1 = await getAuthToken('u', 'p', false);
const t2 = await getAuthToken('u', 'p', false);
expect(t1).toBe('tok-abc');
expect(t2).toBe('tok-abc');
expect(mockFetch).toHaveBeenCalledTimes(1);

// FR2: in-flight dedup
mockFetch.mockResolvedValueOnce(makeTokenResponseDelayed('tok-xyz'));
const [a, b, c] = await Promise.all([
  getAuthToken('u', 'p', false),
  getAuthToken('u', 'p', false),
  getAuthToken('u', 'p', false),
]);
expect(a).toBe('tok-xyz'); expect(b).toBe('tok-xyz'); expect(c).toBe('tok-xyz');
expect(mockFetch).toHaveBeenCalledTimes(1);
```

The test file imports `invalidateAuthToken` and calls it in `beforeEach` to reset module state between tests, because Jest module caching means `cachedToken` survives across test cases within a file.

### Test fixture: auth-like HTML 5xx response

```typescript
function makeHtml500Response() {
  const headers = new Map([['content-type', 'text/html;charset=utf-8']]);
  return {
    ok: false,
    status: 500,
    json: async () => { throw new SyntaxError('Unexpected token <'); },
    text: async () => '<!doctype html><html><head><title>HTTP Status 500</title></head><body>...</body></html>',
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
  };
}
```

---

## Verification

| Tier | Applies? | How |
|---|---|---|
| Unit | ✓ | `src/__tests__/api/auth-resilience.test.ts` (new) — FR1–FR9. `src/__tests__/api/client.test.ts` — extended for FR10 regression. `src/__tests__/app/modal.test.tsx` — FR7. |
| Live-QA probe | △ | Optional. The reuse behavior (§15.F1) and HTML 500 behavior (§15.F3) were captured in the original probe (`docs/api-samples/01b-token-reuse.json`, `09-error-cases.json`). Not adding a new probe in this spec unless requested. |
| TestFlight | △ | Optional. Sign-in flow, leave app open across token TTL boundary, observe no user-visible error and a single retry in logs. Requires spec 08 to be useful; deferred. |
| Error log review | ✗ | Spec 08 will hook the retry path to write `AUTH_HTML_500_RETRIED` / `AUTH_401_RETRIED` events. This spec only attaches the synthetic envelope. |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cache leaks across users (sign out → cached token survives → new user inherits old token). | Medium if FR7 is wrong | FR7 mandates `invalidateAuthToken()` in the only `clearAll` call site (`app/modal.tsx`). Unit test asserts both run. |
| Cloudflare 503 with HTML body false-positives as "auth failure" and triggers a useless re-mint. | Low (Cloudflare not used) | The retry is bounded to one. If the real cause is Cloudflare, the retry also fails the same way and a real error propagates. Net cost: one wasted token mint. |
| In-flight promise reused after rejection — next caller awaits a rejected promise forever. | Low | `.finally(() => { mintInFlight = null })` clears it regardless of resolve/reject. Caller that awaits a rejected `mintInFlight` gets the rejection synchronously, then `mintInFlight` is null, so the next caller starts fresh. |
| Test isolation: cached state leaks between Jest test cases. | High without care | `beforeEach(() => invalidateAuthToken())` in every test file that touches `getAuthToken`. Also covered by `jest.clearAllMocks` resetting fetch mocks. |
| `creds` argument duplicates `useQA` (already passed positionally). | Cosmetic | Acceptable. We could omit `useQA` from `creds` (use the positional one), but that's a footgun if they ever disagree. Better to require `creds.useQA` and have `apiGet` assert they match — but that complicates the signature. Keep both, accept the redundancy. |
| `probeEnvironments` populates the cache with the wrong-environment token. | Real bug if FR8 is wrong | FR8 mandates `probeEnvironments` calls `mintAuthToken` (cache-bypass), not `getAuthToken`. Unit test verifies cache state is unchanged before/after. |
| Token format change at the server (e.g. shorter TTL) breaks the cache assumption. | Low | The retry path handles staleness reactively. If TTL is even 1 second, the cache helps for the burst of concurrent calls in that 1 second, then re-mints on the next call. Worst case: no improvement over today. |
| Module-level mutable state confuses Hot Reload during development. | Low | Hot Reload re-evaluates the module, which re-initializes `cachedToken = null` and `mintInFlight = null`. No persistent stale state. |

---

## Open Questions

None — the design is fully decided. The original Andon flagged three areas; all have explicit decisions:
- **Where to cache the token:** module scope in `client.ts`, inside `getAuthToken` (D1).
- **Where retry logic lives:** in `client.ts` inside `apiGet` / `apiPut`, opt-in via optional `creds` arg (D2).
- **Credential leakage / persistence shape:** none — token is in-memory only, no SecureStore changes, no log changes (out-of-scope items #1 and #6).
