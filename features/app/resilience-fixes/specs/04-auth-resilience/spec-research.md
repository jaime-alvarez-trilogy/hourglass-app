# Spec 04 — Auth resilience (token cache + HTML 500 detection)

**Status:** Research complete
**Complexity:** M
**Combines:** F1 (token caching) + F3 (HTML 500 = auth failure detection) from `docs/CROSSOVER_API.md` §15.

## Problem context

Two related auth defects, both touching `src/api/client.ts`:

### F1: Per-request token fetch is wasteful

Today, **every** `apiGet`/`apiPut` calls `getAuthToken()` first (`client.ts:7-39`). That's a `POST /api/v3/token` per API request, doubling the network round-trips. Live probe (§15.F1) confirmed tokens are reusable for at least 12 seconds — actual TTL unknown but ≥ 12s.

Concrete cost: on the Home screen, we fire ~5 parallel calls (timesheet + payments + diary + approvals + role refresh). That's 10 round-trips when it could be 1 token + 5 data calls.

### F3: Bad tokens return Tomcat 500 HTML, not 401

Live probe confirmed: `GET /api/identity/users/current/detail` with a bogus token returns **500** with a Tomcat HTML error page, not 401. `handleStatus` (`client.ts:42-52`) maps 401/403 → `AuthError`, everything else → `ApiError`. **Bad tokens never trigger `AuthError`.**

Downstream: any `AuthError`-catching re-onboarding logic is currently dead code for the most common auth failure mode (expired token). It only fires on 403, which we see rarely.

## Exploration findings

- `getAuthToken()` is called from every `apiGet`/`apiPut` call (`client.ts:62, 84`).
- No in-memory token cache exists. No expiry tracking. No 401-retry-with-fresh-token logic.
- `useApprovalItems.ts:38` and other hooks pass `token` explicitly to API functions — token is not a module-global today, it flows through params.
- The token returned from `POST /api/v3/token` is the same string format whether prod or QA. Format: `userId:secret`.
- After spec 03 lands, `ApiError`/`AuthError` carry `errorCode` and `serverText`. We can use these to fingerprint different failure modes.

## Key decisions

**1. Module-scope token cache, not a global singleton.** A `let cachedToken: string | null = null` at the top of `client.ts` is enough. No need for a class, no need for AsyncStorage persistence (token is cheap to re-mint on cold start).

**2. Cache invalidation: on 401 OR on detected bad-token 500.** Two paths invalidate:
   - Explicit 401 response → clear cache, re-mint, retry once
   - HTML 500 response (detected via `content-type: text/html` OR body starts with `<!doctype html`) → treat as 401, same flow

**3. Single retry-on-auth-failure inside `apiGet`/`apiPut`.** Not callers' responsibility. If the cached token failed, mint a fresh one, retry. After one retry, propagate the error.

**4. Don't persist tokens to SecureStore.** Already considered and rejected — token is cheap to re-mint, persisting adds an attack surface, and the failure mode (cache miss) is benign.

**5. The first request still fetches a token synchronously.** Concurrent first requests are serialized via a single in-flight promise — when N hooks all fire on mount, the first triggers the mint, the rest wait on the same promise. (Standard request-deduplication pattern.)

**6. F3 detection lives in `handleStatus`.** It's already the auth-vs-other gate. Add: if `status >= 500` AND (`content-type` is text/html OR body starts with `<!doctype html`), throw `AuthError(500)` instead of `ApiError(500)`. The "auth-like 500" gets a synthetic error code: `AUTH_HTML_500` so callers can distinguish it from a structured 401.

## Interface contracts

### Module state (in `src/api/client.ts`)

```typescript
let cachedToken: string | null = null;
let mintInFlight: Promise<string> | null = null;

async function getOrMintToken(username: string, password: string, useQA: boolean): Promise<string> {
  if (cachedToken) return cachedToken;
  if (mintInFlight) return mintInFlight;
  mintInFlight = getAuthToken(username, password, useQA)
    .then((t) => { cachedToken = t; return t; })
    .finally(() => { mintInFlight = null; });
  return mintInFlight;
}

export function invalidateAuthToken(): void {
  cachedToken = null;
  mintInFlight = null;
}
```

### `apiGet` / `apiPut` (modified)

Caller passes `username`/`password`/`useQA` instead of pre-minted `token`. The function asks `getOrMintToken` internally and retries once on auth failure:

```typescript
export async function apiGet<T>(
  path: string, params: Record<string, string>,
  creds: { username: string; password: string; useQA: boolean }
): Promise<T> {
  let token = await getOrMintToken(creds.username, creds.password, creds.useQA);
  let response = await fetch(buildUrl(...), { headers: { 'x-auth-token': token } });
  if (response.status === 401 || isAuthLikeHtml500(response)) {
    invalidateAuthToken();
    token = await getOrMintToken(...);
    response = await fetch(buildUrl(...), { headers: { 'x-auth-token': token } });
  }
  if (!response.ok) await handleStatus(response);
  return response.json() as Promise<T>;
}

function isAuthLikeHtml500(response: Response): boolean {
  if (response.status < 500) return false;
  const ct = response.headers.get('content-type') ?? '';
  return ct.includes('text/html');
}
```

**Note:** changing the call signature is a breaking change. All callers (`auth.ts`, `timesheet.ts`, `payments.ts`, `workDiary.ts`, `approvals.ts`) need updates. Acceptable because it's all internal.

**Alternative (lighter):** keep the existing signature (caller passes `token`), accept that callers might pass a stale token, and have `apiGet`/`apiPut` handle the retry by accepting an optional "refresh" callback. Less clean but smaller blast radius.

**Recommended:** the cleaner "creds in, retry transparent" version. The callers are few and the refactor improves the contract.

### `handleStatus` (modified, building on spec 03)

```typescript
async function handleStatus(response: Response): Promise<never> {
  // Read envelope as in spec 03
  const envelope = await readErrorEnvelope(response);

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Auth failed: ${response.status}`, response.status, envelope);
  }
  // F3: Tomcat HTML 500 is auth-like
  const ct = response.headers.get('content-type') ?? '';
  if (response.status >= 500 && ct.includes('text/html')) {
    throw new AuthError('Auth failed (HTML 500)', response.status, {
      errorCode: 'AUTH_HTML_500', text: 'Token rejected by server (HTML response)'
    });
  }
  throw new ApiError(`API error: ${response.status}`, response.status, envelope);
}
```

## Test plan

### Unit tests

**Token cache (`__tests__/auth-resilience.test.ts`, new):**
- [ ] First call mints a token; second call within the same module session reuses it (mock `POST /api/v3/token` called once).
- [ ] Concurrent first calls share a single in-flight mint (mock called once for N parallel `apiGet`s).
- [ ] `invalidateAuthToken()` forces next call to re-mint.
- [ ] On 401 response, cache is cleared and a single retry is attempted with a freshly-minted token.
- [ ] On second 401 (retry also fails), `AuthError` propagates and cache stays cleared.
- [ ] After successful retry, subsequent calls use the new cached token.

**HTML 500 detection:**
- [ ] Response `status: 500, content-type: text/html, body: <!doctype html...>` → `AuthError` with `errorCode: 'AUTH_HTML_500'`.
- [ ] Response `status: 500, content-type: application/json, body: {errorCode: 'CROS-0400'}` → `ApiError` (real 500, not auth-shaped).
- [ ] Response `status: 503, content-type: text/html` (also HTML) → `AuthError(AUTH_HTML_500)` — any 5xx HTML treated as auth.
- [ ] Response `status: 400, content-type: text/html` → `ApiError(400)` (not 5xx, stays ApiError).

### Live-QA probe extension

Extend `scripts/probe-crossover-api.mjs`:

```javascript
async function verifyAuthResilience() {
  // 1. Token reuse
  const t = await mintToken();
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${BASE}/api/identity/users/current/detail`, { headers: { 'x-auth-token': t } });
    assert(r.status === 200, `call ${i} failed with token ${t}`);
  }

  // 2. Bad token → HTML 500
  const r = await fetch(`${BASE}/api/identity/users/current/detail`, { headers: { 'x-auth-token': 'bogus:bogus' } });
  assert(r.status >= 500, 'bad token did not return 5xx');
  const ct = r.headers.get('content-type') ?? '';
  assert(ct.includes('text/html'), `bad token did not return HTML (got ${ct})`);
}
```

### TestFlight scenario

- [ ] Sign in. Check Settings → "auth status" debug line (added by spec 08) shows token cached.
- [ ] Manually invalidate token by editing SecureStore (or letting it expire over a day). Open app. Verify:
  - First API call returns 5xx-HTML, gets re-minted, retry succeeds, no user-visible error.
  - Local error log records one `AUTH_HTML_500_RETRIED` event.

## Files to reference

| File | Why |
|---|---|
| `src/api/client.ts` | Primary file: add cache + retry; modify `handleStatus`. |
| `src/api/errors.ts` | Reference: spec 03's `AuthError` constructor signature with envelope. |
| `src/api/auth.ts` | Caller; will need to switch from passing `token` to passing `creds`. |
| `src/api/timesheet.ts`, `payments.ts`, `workDiary.ts`, `approvals.ts` | Same — all need signature updates. |
| `docs/api-samples/01b-token-reuse.json` | Evidence: token reused for ≥12s. |
| `docs/api-samples/09-error-cases.json` | Evidence: bad token = 500 HTML. |
| `docs/CROSSOVER_API.md` §2, §15.F1, §15.F3 | Doc context. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit | ✓ | New `__tests__/auth-resilience.test.ts`; existing tests must not regress. |
| Live-QA probe | ✓ | `verifyAuthResilience()` extension. |
| TestFlight | ✓ | Scenario above; needs spec 08's debug surface. |
| Error log | ✓ | Token-retry events captured by spec 08. |

## Risks

- **Refactoring API client signature is a wide change.** Mitigate by keeping `getAuthToken` exported separately (some tests will still test it in isolation).
- **HTML detection could false-positive.** A Cloudflare edge 503 might also return HTML; treating it as auth failure would cause a needless re-mint cycle. **Acceptable:** the retry just refreshes the token; if the real issue is Cloudflare, retries fail again and a real error propagates.
- **Token cache survives sign-out.** Make sure `invalidateAuthToken()` is called from `clearAll()` in `src/store/config.ts` so signing out wipes the cache.
