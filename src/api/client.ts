// FR3, FR4, FR5: Centralized Crossover API client
// Spec 04 (auth-resilience): in-memory token cache + Tomcat HTML 5xx -> AuthError.

import { AuthError, NetworkError, ApiError, type ErrorEnvelope } from './errors';
import { getApiBase } from '../store/config';

// ---------------------------------------------------------------------------
// Spec 04 — token cache module state
// ---------------------------------------------------------------------------
// Cached token is in-memory only (never persisted). Wiped on cold start,
// explicit `invalidateAuthToken()`, or when sign-out / env-switch runs from
// app/modal.tsx (FR7).

let cachedToken: string | null = null;
let mintInFlight: Promise<string> | null = null;

/**
 * Mint a fresh auth token by POSTing credentials to /api/v3/token.
 *
 * Cache-bypass: this helper never reads from or writes to `cachedToken`.
 * Use it for one-off mints (e.g. `probeEnvironments`) where you want to
 * verify creds without affecting the session cache.
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
 * a fresh one. Concurrent first-callers share a single in-flight mint.
 *
 * To force a re-mint (e.g. after a 401 retry), call `invalidateAuthToken()`
 * first.
 */
export async function getAuthToken(
  username: string,
  password: string,
  useQA: boolean,
): Promise<string> {
  if (cachedToken) return cachedToken;
  if (mintInFlight) return mintInFlight;
  mintInFlight = mintAuthToken(username, password, useQA)
    .then((t) => {
      cachedToken = t;
      return t;
    })
    .finally(() => {
      mintInFlight = null;
    });
  return mintInFlight;
}

/**
 * Wipe the in-memory token cache and any pending in-flight mint.
 * Idempotent and safe to call when no token is cached.
 *
 * MUST be called from `app/modal.tsx`:
 * - after `clearAll()` in `handleSignOut` (so the cache does not survive sign-out)
 * - before `fetchAndBuildConfig` in `handleSwitchEnvironment` (so the next mint
 *   targets the newly-selected environment, not the previously-cached one).
 */
export function invalidateAuthToken(): void {
  cachedToken = null;
  mintInFlight = null;
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
  if (response.status === 401) return true;
  if (response.status >= 500) {
    const ct = getHeader(response, 'content-type');
    if (ct.includes('text/html')) return true;
  }
  return false;
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
  if (response.status >= 500) {
    const ct = getHeader(response, 'content-type');
    if (ct.includes('text/html')) {
      throw new AuthError(401, undefined, {
        errorCode: 'AUTH_HTML_500',
        text: `Token rejected — HTML 5xx response (status ${response.status})`,
      });
    }
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
 */
async function parseBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------------------------------------------------------------------------
// Public API: apiGet / apiPut
// ---------------------------------------------------------------------------

/**
 * Typed GET request. When `creds` is provided and the first response is
 * auth-like (401 or HTML 5xx), the cache is invalidated, a fresh token is
 * minted, and the request is retried exactly once. When `creds` is omitted,
 * behavior is identical to today: one fetch, no retry.
 */
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
      return await fetch(url, {
        method: 'GET',
        headers: { 'x-auth-token': t },
      });
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
  return parseBody<T>(response);
}

/**
 * Typed PUT request. Same retry contract as `apiGet`: opt-in via optional
 * `creds` arg. The retry re-serializes `body` so the second fetch carries
 * the same payload (Response.body is single-shot per request).
 */
export async function apiPut<T>(
  path: string,
  body: unknown,
  token: string,
  useQA: boolean,
  creds?: { username: string; password: string; useQA: boolean },
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

  let response = await doFetch(token);

  if (creds && shouldRetryAuth(response)) {
    invalidateAuthToken();
    const fresh = await getAuthToken(creds.username, creds.password, creds.useQA);
    response = await doFetch(fresh);
  }

  if (!response.ok) await handleStatus(response);
  return parseBody<T>(response);
}
