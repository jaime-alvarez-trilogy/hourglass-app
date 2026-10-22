// FR3, FR4, FR5: Centralized Crossover API client
// Spec 04 (auth-resilience): in-memory token cache + Tomcat HTML 5xx -> AuthError.
// durable-data 01-auth-renewal: single-flight renewal, the mint generation guard,
// the failed-login latch and HTML 5xx after renewal -> ApiError.

import {
  AuthError,
  NetworkError,
  ApiError,
  AUTH_HTML_500,
  AUTH_LOGIN_LATCHED,
  HTML_5XX_AFTER_RENEWAL,
  type ErrorEnvelope,
} from './errors';
import type { AuthCreds } from './authCreds';
import { getApiBase } from '../store/config';
import { log } from '../lib/log';

export type { AuthCreds } from './authCreds';

// ---------------------------------------------------------------------------
// Spec 04 — token cache module state
// ---------------------------------------------------------------------------
// Cached token is in-memory only (never persisted). Wiped on cold start,
// explicit `invalidateAuthToken()`, or when sign-out / env-switch runs from
// app/modal.tsx (FR7).

let cachedToken: string | null = null;
let mintInFlight: Promise<string> | null = null;
// Bumped by every hard reset (`invalidateAuthToken`). A mint that started under an
// older generation must not write its token into the cache.
let authGeneration = 0;

/** How long a login rejected by the token endpoint is refused locally. */
export const LOGIN_LATCH_MS = 60_000;

// Failed-login latch. Holds only a non-reversible fingerprint of the rejected
// env + username + password (never the password or the Basic string), so a
// changed password cannot cause a storm of failed logins.
let loginLatch: { fingerprint: string; until: number; statusCode: 401 | 403 } | null = null;

/** FNV-1a 32-bit over env + username + password, as 8 lowercase hex chars. */
function fingerprintCreds(username: string, password: string, useQA: boolean): string {
  const input = `${useQA ? 'qa' : 'prod'}\u0000${username}\u0000${password}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Mint a fresh auth token by POSTing credentials to /api/v3/token.
 *
 * Cache-bypass: this helper never reads from or writes to `cachedToken`, and
 * it neither consults nor sets the failed-login latch (`loginLatch`). Use it
 * for one-off mints (e.g. `probeEnvironments`) where you want to verify creds
 * without affecting the session cache, so a wrong password during onboarding
 * is never latched or blocked by an earlier latch.
 *
 * Side effects: a single `fetch` to the token endpoint. Throws on non-2xx.
 */
export async function mintAuthToken(
  username: string,
  password: string,
  useQA: boolean,
): Promise<string> {
  const base = getApiBase(useQA);
  const credentials = btoa(`${username}:${password}`);

  let response: Response;
  try {
    response = await fetch(`${base}/api/v3/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'Network request failed');
  }

  if (!response.ok) await handleStatus(response);

  const text = await response.text();
  // API returns either plain token string or JSON {"token":"..."}
  try {
    const json = JSON.parse(text);
    return json.token ?? text;
  } catch {
    return text;
  }
}

/**
 * Get an auth token. Returns the cached token if one exists, otherwise mints
 * a fresh one. Concurrent callers share a single in-flight mint.
 *
 * To force a re-mint after a rejected token, call `invalidateIfCurrent(token)`
 * first (the apiGet/apiPut retry does this).
 *
 * Generation guard: the mint writes `cachedToken` only if no hard reset
 * (`invalidateAuthToken`) ran while it was in flight. Its callers still receive
 * the token either way.
 *
 * Failed-login latch: when the token endpoint rejects the credentials (an
 * AuthError other than AUTH_HTML_500), the same env + username + password is
 * refused for LOGIN_LATCH_MS with `AuthError(AUTH_LOGIN_LATCHED)` and no fetch.
 * Only a current mint sets the latch; a successful mint or
 * `invalidateAuthToken()` clears it. `mintAuthToken` ignores it.
 */
export async function getAuthToken(
  username: string,
  password: string,
  useQA: boolean,
): Promise<string> {
  if (cachedToken) return cachedToken;
  if (mintInFlight) return mintInFlight;
  const fingerprint = fingerprintCreds(username, password, useQA);
  if (loginLatch && loginLatch.fingerprint === fingerprint && Date.now() < loginLatch.until) {
    throw new AuthError(loginLatch.statusCode, 'Login recently rejected', {
      errorCode: AUTH_LOGIN_LATCHED,
    });
  }
  const gen = authGeneration;
  const p: Promise<string> = mintAuthToken(username, password, useQA)
    .then(
      (t) => {
        if (gen === authGeneration && mintInFlight === p) {
          cachedToken = t;
          loginLatch = null;
        }
        log.info('auth.token_minted', {});
        return t;
      },
      (err: unknown) => {
        if (
          err instanceof AuthError &&
          err.errorCode !== AUTH_HTML_500 &&
          gen === authGeneration &&
          mintInFlight === p
        ) {
          loginLatch = { fingerprint, until: Date.now() + LOGIN_LATCH_MS, statusCode: err.statusCode };
          log.warn('auth.login_latched', { statusCode: err.statusCode });
        }
        throw err;
      },
    )
    .finally(() => {
      if (mintInFlight === p) mintInFlight = null;
    });
  mintInFlight = p;
  return p;
}

/**
 * Evict `token` from the cache only if it is still the cached one. Leaves any
 * in-flight mint alone, so concurrent auth failures share one re-mint and a
 * late 401 carrying an old token never discards a fresher one.
 */
export function invalidateIfCurrent(token: string): void {
  if (cachedToken === token) cachedToken = null;
}

/**
 * Hard reset: wipe the in-memory token cache, any pending in-flight mint and
 * the failed-login latch, and bump the mint generation so a mint already in
 * flight cannot repopulate the cache or set the latch. Idempotent and safe to
 * call when no token is cached.
 *
 * Only for sign-out, env switch and not-contributor. A rejected token on a
 * data request goes through `invalidateIfCurrent` instead.
 *
 * MUST be called from `app/modal.tsx`:
 * - after `clearAll()` in `handleSignOut` (so the cache does not survive sign-out)
 * - before `fetchAndBuildConfig` in `handleSwitchEnvironment` (so the next mint
 *   targets the newly-selected environment, not the previously-cached one).
 */
export function invalidateAuthToken(): void {
  cachedToken = null;
  mintInFlight = null;
  loginLatch = null;
  authGeneration++;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildUrl(base: string, path: string, params: Record<string, string>): string {
  const url = `${base}${path}`;
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return url;
  const qs = new URLSearchParams(entries).toString();
  return `${url}?${qs}`;
}

function getHeader(response: Response, name: string): string {
  // Defensive: some test mocks omit `headers` entirely. Treat that as "no header set".
  const h = (response as { headers?: { get?: (k: string) => string | null } }).headers;
  if (!h || typeof h.get !== 'function') return '';
  return h.get(name) ?? '';
}

/** HTTP >= 500 with `content-type: text/html` (a Tomcat or load-balancer error page). */
function isHtml5xx(response: Response): boolean {
  return response.status >= 500 && getHeader(response, 'content-type').includes('text/html');
}

/**
 * Spec 04 — recognize "auth-like" responses that should trigger a retry-with-fresh-token:
 * - HTTP 401 (explicit auth failure)
 * - HTTP >= 500 with `content-type: text/html` (Tomcat error page for bad tokens — see
 *   docs/CROSSOVER_API.md §15.F3 and docs/api-samples/09-error-cases.json).
 *
 * Does NOT consume the body — `Response.text()` is single-shot, so handleStatus
 * needs an intact body for envelope parsing.
 */
function shouldRetryAuth(response: Response): boolean {
  return response.status === 401 || isHtml5xx(response);
}

/**
 * durable-data 01-auth-renewal FR3 — a retried response that is still HTML 5xx
 * came back for a token the token endpoint has just issued, so it is a server
 * outage, not a bad token. Throw a retryable ApiError without reading the body.
 */
function throwIfHtml5xxAfterRenewal(response: Response): void {
  if (isHtml5xx(response)) {
    throw new ApiError(response.status, 'Server error after token renewal', {
      errorCode: HTML_5XX_AFTER_RENEWAL,
    });
  }
}

// Spec 03 (error-envelope) + Spec 04 (auth-resilience):
// - Read body once for the structured `{errorCode, type, text}` envelope.
// - On HTML 5xx, throw AuthError(401) with synthetic AUTH_HTML_500 envelope
//   so the existing AuthError-catching re-onboarding logic fires.
// - Otherwise, map 401/403 -> AuthError(status) and everything else -> ApiError.
async function handleStatus(response: Response): Promise<never> {
  let envelope: ErrorEnvelope | undefined;
  try {
    const bodyText = await response.text();
    if (bodyText) {
      const parsed: unknown = JSON.parse(bodyText);
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof (parsed as { errorCode?: unknown }).errorCode === 'string' &&
        ((parsed as { errorCode: string }).errorCode).length > 0
      ) {
        const obj = parsed as { errorCode: string; type?: unknown; text?: unknown };
        envelope = {
          errorCode: obj.errorCode,
          type: typeof obj.type === 'string' ? obj.type : undefined,
          text: typeof obj.text === 'string' ? obj.text : undefined,
        };
      }
    }
  } catch {
    // Non-JSON body (HTML 500 page, plain-text 503, truncated JSON, etc).
    // Envelope stays undefined; the thrown error still carries statusCode.
  }

  if (response.status === 401) throw new AuthError(401, undefined, envelope);
  if (response.status === 403) throw new AuthError(403, undefined, envelope);

  // Spec 04 FR9: Tomcat HTML 5xx = bad/expired token. Synthesize an AuthError
  // (statusCode is 401 to satisfy the existing 401|403 type; real status lives
  // in serverText). AUTH_HTML_500 errorCode lets downstream code distinguish
  // this from a real 401.
  if (isHtml5xx(response)) {
    throw new AuthError(401, undefined, {
      errorCode: AUTH_HTML_500,
      text: `Token rejected — HTML 5xx response (status ${response.status})`,
    });
  }

  throw new ApiError(response.status, undefined, envelope);
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

/**
 * Parse a response body as JSON, tolerating an EMPTY body. Crossover returns a
 * 200/204 with a zero-byte body on approve/reject PUTs AND on some GETs (e.g. an
 * empty pending-overtime queue). Raw `response.json()` throws "JSON Parse error:
 * Unexpected end of input" on those; reading text first and returning `undefined`
 * for an empty body avoids it. Used by BOTH apiGet and apiPut so the read and
 * write paths can never drift apart again.
 *
 * 10-sdk-58-ios-27 FR3 (`expo/fetch` is `globalThis.fetch` from SDK 56):
 * - The body is read exactly once, as text. expo/fetch rejects a second
 *   `text()`/`json()` with `TypeError: … Response body is already used`.
 * - A blank body (empty or whitespace-only, `text.trim() === ''`) returns `undefined`.
 * - A non-blank body that isn't JSON throws `ApiError(status, 'Invalid JSON response
 *   body')`, never a raw `SyntaxError`. This applies to apiPut too, even though the
 *   approve/reject callers discard the result (src/api/approvals.ts): a 200 HTML page
 *   (a captive portal or proxy) means the PUT may never have reached Crossover, so an
 *   error is safer than a false success. After the error, `useApprovalItems` restores
 *   the list and refetches in `finally` (src/hooks/useApprovalItems.ts:155-162), so the
 *   user sees the real state before retrying.
 */
async function parseBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (text.trim() === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, 'Invalid JSON response body');
  }
}

// ---------------------------------------------------------------------------
// Public API: apiGet / apiPut
// ---------------------------------------------------------------------------

/**
 * Shared renew-and-retry for apiGet/apiPut. On an auth-like first response (401
 * or HTML 5xx) the failed token is evicted with `invalidateIfCurrent`, with or
 * without `creds`. When `creds` is provided, a fresh token is fetched via
 * `getAuthToken` (concurrent failures share one mint), `auth.token_retried` is
 * logged and `doFetch` runs exactly once more; a retried response that is still
 * HTML 5xx throws `ApiError(HTML_5XX_AFTER_RENEWAL)`. Returns the last response.
 */
async function fetchWithRenewal(
  doFetch: (t: string) => Promise<Response>,
  token: string,
  creds?: AuthCreds,
): Promise<Response> {
  const response = await doFetch(token);
  if (!shouldRetryAuth(response)) return response;
  invalidateIfCurrent(token);
  if (!creds) return response;
  const fresh = await getAuthToken(creds.username, creds.password, creds.useQA);
  log.warn('auth.token_retried', { triggerStatusCode: response.status });
  const retried = await doFetch(fresh);
  throwIfHtml5xxAfterRenewal(retried);
  return retried;
}

/**
 * Typed GET request. Renewal via `fetchWithRenewal`: on an auth-like first
 * response (401 or HTML 5xx) the failed token is always evicted. With `creds`,
 * the request is retried exactly once on a fresh token, and a retried response
 * that is still HTML 5xx throws `ApiError(HTML_5XX_AFTER_RENEWAL)`. Without
 * `creds`: one fetch, no retry; the next `getAuthToken` mints fresh.
 */
export async function apiGet<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  useQA: boolean,
  creds?: AuthCreds,
): Promise<T> {
  const url = buildUrl(getApiBase(useQA), path, params);

  async function doFetch(t: string): Promise<Response> {
    try {
      return await fetch(url, {
        method: 'GET',
        headers: { 'x-auth-token': t },
      });
    } catch (err) {
      throw new NetworkError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  const response = await fetchWithRenewal(doFetch, token, creds);
  if (!response.ok) await handleStatus(response);
  return parseBody<T>(response);
}

/**
 * Typed PUT request. Same renewal contract as `apiGet` (`fetchWithRenewal`): the
 * failed token is evicted even without `creds`; only the renew-and-retry needs
 * `creds`, and a retried response that is still HTML 5xx throws
 * `ApiError(HTML_5XX_AFTER_RENEWAL)`. Both fetches send the same pre-serialized
 * `body` string (a request body is single-shot, so each fetch gets its own).
 */
export async function apiPut<T>(
  path: string,
  body: unknown,
  token: string,
  useQA: boolean,
  creds?: AuthCreds,
): Promise<T> {
  const base = getApiBase(useQA);
  const serialized = JSON.stringify(body);

  async function doFetch(t: string): Promise<Response> {
    try {
      return await fetch(`${base}${path}`, {
        method: 'PUT',
        headers: {
          'x-auth-token': t,
          'Content-Type': 'application/json',
        },
        body: serialized,
      });
    } catch (err) {
      throw new NetworkError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  const response = await fetchWithRenewal(doFetch, token, creds);
  if (!response.ok) await handleStatus(response);
  return parseBody<T>(response);
}
