/**
 * Spec 04 — auth-resilience
 *
 * Tests for the in-memory token cache, in-flight mint dedup,
 * cache invalidation, retry-on-auth-failure for apiGet/apiPut,
 * Tomcat HTML 5xx -> AuthError detection in handleStatus, and the
 * mintAuthToken cache-bypass used by probeEnvironments.
 *
 * The cache lives in module scope inside src/api/client.ts.
 * `invalidateAuthToken()` is called in beforeEach to reset state
 * between test cases (Jest module caching means top-level lets
 * survive across test cases within a file).
 *
 * The `DD1.*` blocks at the end cover features/app/durable-data spec
 * 01-auth-renewal: single-flight renewal via `invalidateIfCurrent`, the
 * mint generation guard, no-creds eviction, the `auth.*` log events and
 * the 60 s failed-login latch.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../../store/config', () => ({
  getApiBase: (useQA: boolean) =>
    useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com',
}));

jest.mock('../../lib/log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  apiGet,
  apiPut,
  getAuthToken,
  invalidateAuthToken,
  invalidateIfCurrent,
  LOGIN_LATCH_MS,
  mintAuthToken,
} from '../../api/client';
import { AuthError, ApiError, NetworkError } from '../../api/errors';
import { log } from '../../lib/log';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTokenResponse(token: string) {
  return {
    ok: true,
    status: 200,
    text: async () => token,
    headers: { get: (_: string) => null },
  };
}

function makeJsonOkResponse<T>(body: T) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (_: string) => 'application/json' },
  };
}

function makeJsonErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => '',
    headers: { get: (k: string) =>
      k.toLowerCase() === 'content-type' ? 'application/json' : null,
    },
  };
}

function makeHtml5xxResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
    text: async () =>
      `<!doctype html><html><head><title>HTTP Status ${status} - Internal Server Error</title></head><body>...</body></html>`,
    headers: { get: (k: string) =>
      k.toLowerCase() === 'content-type'
        ? 'text/html;charset=utf-8'
        : null,
    },
  };
}

function makeHtml4xxResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
    text: async () => `<!doctype html><html><head><title>HTTP Status ${status}</title></head></html>`,
    headers: { get: (k: string) =>
      k.toLowerCase() === 'content-type' ? 'text/html;charset=utf-8' : null,
    },
  };
}

const CREDS = { username: 'u@example.com', password: 'pw', useQA: false };

beforeEach(() => {
  invalidateAuthToken();
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// FR1 — getAuthToken caches its result
// ---------------------------------------------------------------------------

describe('FR1: getAuthToken caches its result', () => {
  it('FR1.a: two sequential calls trigger exactly one fetch (cache reuse)', async () => {
    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-abc'));

    const t1 = await getAuthToken('u', 'p', false);
    const t2 = await getAuthToken('u', 'p', false);

    expect(t1).toBe('tok-abc');
    expect(t2).toBe('tok-abc');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('FR1.b: both calls resolve with the same token string', async () => {
    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-xyz'));

    const t1 = await getAuthToken('u', 'p', false);
    const t2 = await getAuthToken('u', 'p', false);

    expect(t1).toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// FR2 — concurrent first calls share a single in-flight mint
// ---------------------------------------------------------------------------

describe('FR2: in-flight mint dedup', () => {
  it('FR2.a: three concurrent calls trigger exactly one fetch', async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchPromise = new Promise((res) => {
      resolveFetch = res;
    });
    mockFetch.mockReturnValueOnce(fetchPromise);

    const p = Promise.all([
      getAuthToken('u', 'p', false),
      getAuthToken('u', 'p', false),
      getAuthToken('u', 'p', false),
    ]);

    // Resolve after all three have been scheduled.
    resolveFetch(makeTokenResponse('tok-concurrent'));
    const [a, b, c] = await p;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(a).toBe('tok-concurrent');
    expect(b).toBe('tok-concurrent');
    expect(c).toBe('tok-concurrent');
  });

  it('FR2.b: all three resolve with the same token string', async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchPromise = new Promise((res) => {
      resolveFetch = res;
    });
    mockFetch.mockReturnValueOnce(fetchPromise);

    const p = Promise.all([
      getAuthToken('u', 'p', false),
      getAuthToken('u', 'p', false),
      getAuthToken('u', 'p', false),
    ]);
    resolveFetch(makeTokenResponse('tok-shared'));
    const results = await p;

    expect(new Set(results).size).toBe(1);
  });

  it('FR2.c: after in-flight resolves, a fourth call hits the cache', async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchPromise = new Promise((res) => {
      resolveFetch = res;
    });
    mockFetch.mockReturnValueOnce(fetchPromise);

    const p = Promise.all([
      getAuthToken('u', 'p', false),
      getAuthToken('u', 'p', false),
      getAuthToken('u', 'p', false),
    ]);
    resolveFetch(makeTokenResponse('tok-fourth'));
    await p;

    const t4 = await getAuthToken('u', 'p', false);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(t4).toBe('tok-fourth');
  });
});

// ---------------------------------------------------------------------------
// FR3 — invalidateAuthToken clears the cache
// ---------------------------------------------------------------------------

describe('FR3: invalidateAuthToken', () => {
  it('FR3.a: after invalidate, next call mints fresh', async () => {
    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-1'));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-2'));

    const t1 = await getAuthToken('u', 'p', false);
    invalidateAuthToken();
    const t2 = await getAuthToken('u', 'p', false);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-2');
  });

  it('FR3.b: invalidate is idempotent (calling twice does not throw)', () => {
    expect(() => {
      invalidateAuthToken();
      invalidateAuthToken();
    }).not.toThrow();
  });

  it('FR3.c: invalidate is safe on empty cache', () => {
    // beforeEach already invalidated; call again, then mint normally.
    expect(() => invalidateAuthToken()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FR4 — apiGet retries once on 401 when creds is provided
// ---------------------------------------------------------------------------

describe('FR4: apiGet retry on 401', () => {
  it('FR4.a: with creds, 401 then 200 → resolves with body, two fetches, retry uses fresh token', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(401));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('fresh-tok'));
    mockFetch.mockResolvedValueOnce(makeJsonOkResponse({ ok: true }));

    const result = await apiGet<{ ok: boolean }>('/test', {}, 'stale-tok', false, CREDS);

    expect(result).toEqual({ ok: true });
    // First call: stale token. Second call: mint. Third call: retry with fresh.
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const retryCallArgs = mockFetch.mock.calls[2];
    expect(retryCallArgs[1].headers['x-auth-token']).toBe('fresh-tok');
  });

  it('FR4.b: with creds, 401 then 500 → rejects with ApiError(500)', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(401));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('fresh-tok'));
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(500));

    const err = await apiGet('/test', {}, 'stale-tok', false, CREDS).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('FR4.c: with creds, 401 then 401 → rejects with AuthError(401)', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(401));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('fresh-tok'));
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(401));

    const err = await apiGet('/test', {}, 'stale-tok', false, CREDS).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('FR4.d: without creds, 401 → rejects with AuthError(401), no retry', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(401));

    const err = await apiGet('/test', {}, 'stale-tok', false).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FR5 — apiGet retries once on auth-like HTML 5xx
// ---------------------------------------------------------------------------

describe('FR5: apiGet retry on HTML 5xx', () => {
  it('FR5.a: with creds, HTML 500 then 200 → resolves, two fetches (plus mint)', async () => {
    mockFetch.mockResolvedValueOnce(makeHtml5xxResponse(500));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('fresh-tok'));
    mockFetch.mockResolvedValueOnce(makeJsonOkResponse({ ok: true }));

    const result = await apiGet<{ ok: boolean }>('/test', {}, 'stale-tok', false, CREDS);

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('FR5.b: with creds, HTML 503 then 200 → also retries', async () => {
    mockFetch.mockResolvedValueOnce(makeHtml5xxResponse(503));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('fresh-tok'));
    mockFetch.mockResolvedValueOnce(makeJsonOkResponse({ ok: true }));

    const result = await apiGet<{ ok: boolean }>('/test', {}, 'stale-tok', false, CREDS);

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('FR5.c: with creds, JSON 500 → does NOT retry, throws ApiError(500)', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(500));

    const err = await apiGet('/test', {}, 'stale-tok', false, CREDS).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('FR5.d: with creds, HTML 400 → does NOT retry (4xx HTML stays ApiError)', async () => {
    mockFetch.mockResolvedValueOnce(makeHtml4xxResponse(400));

    const err = await apiGet('/test', {}, 'stale-tok', false, CREDS).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('FR5.e: without creds, HTML 500 → throws AuthError(401, AUTH_HTML_500)', async () => {
    mockFetch.mockResolvedValueOnce(makeHtml5xxResponse(500));

    const err = await apiGet('/test', {}, 'stale-tok', false).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
    expect((err as AuthError).errorCode).toBe('AUTH_HTML_500');
    expect((err as AuthError).serverText).toContain('status 500');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FR6 — apiPut retry mirrors apiGet
// ---------------------------------------------------------------------------

describe('FR6: apiPut retry', () => {
  it('FR6.a: with creds, 401 then 200 → resolves, retry sends original body and new token', async () => {
    const body = { foo: 'bar', n: 42 };
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(401));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('fresh-tok'));
    // PUT success with empty body
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => undefined,
      text: async () => '',
      headers: { get: (_: string) => null },
    });

    await apiPut('/test', body, 'stale-tok', false, CREDS);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const retryArgs = mockFetch.mock.calls[2];
    expect(retryArgs[1].method).toBe('PUT');
    expect(retryArgs[1].headers['x-auth-token']).toBe('fresh-tok');
    expect(retryArgs[1].body).toBe(JSON.stringify(body));
  });

  it('FR6.b: with creds, HTML 500 then 200 → resolves, three fetches', async () => {
    mockFetch.mockResolvedValueOnce(makeHtml5xxResponse(500));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('fresh-tok'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => undefined,
      text: async () => '',
      headers: { get: (_: string) => null },
    });

    await apiPut('/test', { a: 1 }, 'stale-tok', false, CREDS);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('FR6.c: without creds, 401 → throws AuthError(401), one fetch', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(401));

    const err = await apiPut('/test', {}, 'stale-tok', false).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FR8 — mintAuthToken bypasses cache
// ---------------------------------------------------------------------------

describe('FR8: mintAuthToken cache bypass', () => {
  it('FR8.a: mintAuthToken does NOT populate the cache', async () => {
    mockFetch.mockResolvedValueOnce(makeTokenResponse('mint-bypass-1'));
    // Subsequent getAuthToken should mint again, not return the bypassed token.
    mockFetch.mockResolvedValueOnce(makeTokenResponse('mint-bypass-2'));

    const minted = await mintAuthToken('u', 'p', false);
    const cached = await getAuthToken('u', 'p', false);

    expect(minted).toBe('mint-bypass-1');
    // getAuthToken should NOT return mint-bypass-1 — cache should be empty.
    expect(cached).toBe('mint-bypass-2');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('FR8.b: mintAuthToken behaves like the old getAuthToken (POST to /api/v3/token)', async () => {
    mockFetch.mockResolvedValueOnce(makeTokenResponse('plain-tok'));

    const tok = await mintAuthToken('u@example.com', 'pw', true);

    expect(tok).toBe('plain-tok');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v3/token');
    expect(url).toContain('api-qa.crossover.com');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Basic ' + btoa('u@example.com:pw'));
  });

  it('FR8.c: mintAuthToken reads from cache? — no, always mints fresh', async () => {
    mockFetch.mockResolvedValueOnce(makeTokenResponse('first-mint'));
    mockFetch.mockResolvedValueOnce(makeTokenResponse('second-mint'));

    // Populate cache first.
    await getAuthToken('u', 'p', false);
    // mintAuthToken should mint again, not return cached.
    const minted = await mintAuthToken('u', 'p', false);

    expect(minted).toBe('second-mint');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// FR9 — handleStatus synthetic envelope for auth-like HTML 5xx
// ---------------------------------------------------------------------------

describe('FR9: handleStatus HTML 5xx → AuthError(AUTH_HTML_500)', () => {
  it('FR9.a: HTML 500 from apiGet (no creds) throws AuthError with errorCode AUTH_HTML_500', async () => {
    mockFetch.mockResolvedValueOnce(makeHtml5xxResponse(500));

    const err = await apiGet('/test', {}, 'tok', false).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
    expect((err as AuthError).errorCode).toBe('AUTH_HTML_500');
    expect((err as AuthError).serverText).toContain('status 500');
  });

  it('FR9.b: HTML 503 throws AuthError(AUTH_HTML_500) with status 503 in text', async () => {
    mockFetch.mockResolvedValueOnce(makeHtml5xxResponse(503));

    const err = await apiGet('/test', {}, 'tok', false).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).errorCode).toBe('AUTH_HTML_500');
    expect((err as AuthError).serverText).toContain('status 503');
  });

  it('FR9.c: JSON 500 still throws ApiError(500) (no synthetic envelope)', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(500));

    const err = await apiGet('/test', {}, 'tok', false).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(500);
    expect((err as ApiError).errorCode).toBeUndefined();
  });

  it('FR9.d: HTML 400 still throws ApiError(400) (4xx HTML stays ApiError)', async () => {
    mockFetch.mockResolvedValueOnce(makeHtml4xxResponse(400));

    const err = await apiGet('/test', {}, 'tok', false).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(400);
  });
});

// ===========================================================================
// Durable-data 01-auth-renewal (DD1.*)
// ===========================================================================

// ---------------------------------------------------------------------------
// DD1 helpers
// ---------------------------------------------------------------------------

const TOKEN_PATH = '/api/v3/token';

const mockLogInfo = log.info as jest.Mock;
const mockLogWarn = log.warn as jest.Mock;
const mockLogError = log.error as jest.Mock;

function clearLogMocks() {
  mockLogInfo.mockClear();
  mockLogWarn.mockClear();
  mockLogError.mockClear();
}

beforeEach(clearLogMocks);

/** A promise whose settlement the test controls (holds a mint or a response open). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every queued promise continuation run (all callers reach the pending mint). */
function flush(): Promise<void> {
  return new Promise((res) => setTimeout(res, 0));
}

/**
 * URL-routing fetch: POST /api/v3/token goes to `token()`, every other path goes
 * to `data(authToken, url)`, keyed on the request's `x-auth-token` header.
 */
function routeFetch(handlers: {
  token: () => unknown;
  data?: (authToken: string, url: string) => unknown;
}) {
  mockFetch.mockImplementation(async (url: string, init: { headers: Record<string, string> }) => {
    if (String(url).includes(TOKEN_PATH)) return handlers.token();
    if (!handlers.data) throw new Error(`unexpected data fetch: ${url}`);
    return handlers.data(init.headers['x-auth-token'], String(url));
  });
}

/** Mint responses served in order; any extra mint gets an obviously wrong token. */
function mintSequence(...tokens: string[]) {
  return () => makeTokenResponse(tokens.shift() ?? 'unexpected-extra-mint');
}

function tokenPosts() {
  return mockFetch.mock.calls.filter(([url]) => String(url).includes(TOKEN_PATH));
}

function dataFetches(): { url: string; authToken: string; body?: string }[] {
  return mockFetch.mock.calls
    .filter(([url]) => !String(url).includes(TOKEN_PATH))
    .map(([url, init]) => ({
      url: String(url),
      authToken: init.headers['x-auth-token'],
      body: init.body,
    }));
}

function makeEmptyOkResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => undefined,
    text: async () => '',
    headers: { get: (_: string) => null },
  };
}

/** Put `token` in the module cache through a real mint, then forget that mint's fetch and logs. */
async function seedCachedToken(token: string) {
  mockFetch.mockResolvedValueOnce(makeTokenResponse(token));
  await expect(getAuthToken(CREDS.username, CREDS.password, CREDS.useQA)).resolves.toBe(token);
  mockFetch.mockClear();
  clearLogMocks();
}

function getCredsToken() {
  return getAuthToken(CREDS.username, CREDS.password, CREDS.useQA);
}

function logEvents(mock: jest.Mock, category: string) {
  return mock.mock.calls.filter(([c]) => c === category);
}

// ---------------------------------------------------------------------------
// DD1.1 — a wave of concurrent auth failures shares one re-mint
// ---------------------------------------------------------------------------

describe('DD1.1: concurrent auth failures share a single re-mint', () => {
  it('DD1.1.a: 15 concurrent apiGet 401s with the stale token make exactly 1 token POST and all resolve', async () => {
    await seedCachedToken('stale');
    const mint = deferred<unknown>();
    routeFetch({
      token: () => mint.promise,
      data: (t) => (t === 'fresh' ? makeJsonOkResponse({ ok: true }) : makeJsonErrorResponse(401)),
    });

    const all = Promise.all(
      Array.from({ length: 15 }, () =>
        apiGet<{ ok: boolean }>('/test', {}, 'stale', false, CREDS),
      ),
    );
    await flush(); // every caller has had its 401 and is waiting on the mint
    mint.resolve(makeTokenResponse('fresh'));
    const results = await all;

    expect(results).toEqual(Array.from({ length: 15 }, () => ({ ok: true })));
    expect(tokenPosts()).toHaveLength(1);
    const fetches = dataFetches();
    expect(fetches).toHaveLength(30);
    expect(fetches.filter((f) => f.authToken === 'fresh')).toHaveLength(15);
  });

  it('DD1.1.b: apiPut mirror — 5 concurrent 401s share 1 mint and each retry re-sends its own body', async () => {
    await seedCachedToken('stale');
    const mint = deferred<unknown>();
    routeFetch({
      token: () => mint.promise,
      data: (t) => (t === 'fresh' ? makeEmptyOkResponse() : makeJsonErrorResponse(401)),
    });

    const bodies = Array.from({ length: 5 }, (_, i) => ({ timecardId: i }));
    const all = Promise.all(bodies.map((b) => apiPut('/put', b, 'stale', false, CREDS)));
    await flush();
    mint.resolve(makeTokenResponse('fresh'));
    await all;

    expect(tokenPosts()).toHaveLength(1);
    const retries = dataFetches().filter((f) => f.authToken === 'fresh');
    expect(retries.map((f) => f.body).sort()).toEqual(bodies.map((b) => JSON.stringify(b)).sort());
  });
});

// ---------------------------------------------------------------------------
// DD1.2 — a late 401 with the old token never discards the fresh one
// ---------------------------------------------------------------------------

describe('DD1.2: interleaved renewal keeps the fresher token', () => {
  it('DD1.2.a: B\'s late 401 with the stale token retries with A\'s fresh token, no second mint', async () => {
    await seedCachedToken('stale');
    const lateB = deferred<unknown>();
    routeFetch({
      token: mintSequence('fresh', 'fresh-2'),
      data: (t, url) => {
        if (t !== 'stale') return makeJsonOkResponse({ servedWith: t });
        return url.endsWith('/b') ? lateB.promise : makeJsonErrorResponse(401);
      },
    });

    // B's request leaves with the stale token; its 401 is held until A has renewed.
    const b = apiGet<{ servedWith: string }>('/b', {}, 'stale', false, CREDS);
    const a = await apiGet<{ servedWith: string }>('/a', {}, 'stale', false, CREDS);
    expect(a).toEqual({ servedWith: 'fresh' });

    lateB.resolve(makeJsonErrorResponse(401));
    expect(await b).toEqual({ servedWith: 'fresh' });
    expect(tokenPosts()).toHaveLength(1);

    // The cache still holds A's token: the next getAuthToken makes 0 fetches.
    const before = mockFetch.mock.calls.length;
    await expect(getCredsToken()).resolves.toBe('fresh');
    expect(mockFetch.mock.calls.length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// DD1.3 — invalidateIfCurrent only evicts the token it is given
// ---------------------------------------------------------------------------

describe('DD1.3: invalidateIfCurrent', () => {
  it('DD1.3.a: a token other than the cached one is a no-op (next getAuthToken makes 0 fetches)', async () => {
    await seedCachedToken('fresh');

    invalidateIfCurrent('other');

    await expect(getCredsToken()).resolves.toBe('fresh');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('DD1.3.b: the cached token is evicted (next getAuthToken mints once)', async () => {
    await seedCachedToken('fresh');
    mockFetch.mockResolvedValueOnce(makeTokenResponse('fresh-2'));

    invalidateIfCurrent('fresh');

    await expect(getCredsToken()).resolves.toBe('fresh-2');
    expect(tokenPosts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DD1.4 — invalidateIfCurrent leaves an in-flight mint alone
// ---------------------------------------------------------------------------

describe('DD1.4: invalidateIfCurrent during an in-flight mint', () => {
  it('DD1.4.a: a concurrent getAuthToken joins the pending mint, and that mint still fills the cache', async () => {
    const mint = deferred<unknown>();
    routeFetch({ token: () => mint.promise });

    const first = getCredsToken();
    invalidateIfCurrent('stale');
    const second = getCredsToken();
    mint.resolve(makeTokenResponse('tok'));

    await expect(Promise.all([first, second])).resolves.toEqual(['tok', 'tok']);
    expect(tokenPosts()).toHaveLength(1);
    // The mint was still current (no generation bump), so the cache serves the next call.
    await expect(getCredsToken()).resolves.toBe('tok');
    expect(tokenPosts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DD1.5 — a mint started before invalidateAuthToken() never fills the cache
// ---------------------------------------------------------------------------

describe('DD1.5: mint generation guard', () => {
  it('DD1.5.a: env switch mid-mint — the caller gets its token, the next getAuthToken mints again', async () => {
    const prodMint = deferred<unknown>();
    mockFetch.mockReturnValueOnce(prodMint.promise);
    mockFetch.mockResolvedValueOnce(makeTokenResponse('qa-tok'));

    const pending = getAuthToken('u', 'p', false);
    invalidateAuthToken(); // env switch (app/modal.tsx)
    prodMint.resolve(makeTokenResponse('prod-tok'));

    await expect(pending).resolves.toBe('prod-tok');
    await expect(getAuthToken('u', 'p', true)).resolves.toBe('qa-tok');
    expect(tokenPosts()).toHaveLength(2);
    expect(tokenPosts()[1][0]).toContain('api-qa.crossover.com');
  });

  it('DD1.5.b: a stale mint settling does not clear a newer in-flight mint (later callers join it)', async () => {
    const oldMint = deferred<unknown>();
    const newMint = deferred<unknown>();
    routeFetch({ token: () => makeTokenResponse('unexpected-extra-mint') });
    mockFetch.mockReturnValueOnce(oldMint.promise);
    mockFetch.mockReturnValueOnce(newMint.promise);

    const beforeReset = getCredsToken();
    invalidateAuthToken(); // sign-out
    const afterReset = getCredsToken();
    oldMint.resolve(makeTokenResponse('old-tok'));
    await expect(beforeReset).resolves.toBe('old-tok');

    const late = getCredsToken();
    newMint.resolve(makeTokenResponse('new-tok'));

    await expect(Promise.all([afterReset, late])).resolves.toEqual(['new-tok', 'new-tok']);
    expect(tokenPosts()).toHaveLength(2);
    await expect(getCredsToken()).resolves.toBe('new-tok');
    expect(tokenPosts()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DD1.6 — without creds, an auth-like response evicts its token (no retry)
// ---------------------------------------------------------------------------

describe('DD1.6: no-creds eviction', () => {
  it('DD1.6.a: apiGet 401 → AuthError(401) after 1 data fetch, and the next getAuthToken mints', async () => {
    await seedCachedToken('stale');
    routeFetch({ token: mintSequence('fresh'), data: () => makeJsonErrorResponse(401) });

    const err = await apiGet('/test', {}, 'stale', false).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
    expect(dataFetches()).toHaveLength(1);
    expect(tokenPosts()).toHaveLength(0);
    await expect(getCredsToken()).resolves.toBe('fresh');
    expect(tokenPosts()).toHaveLength(1);
  });

  it('DD1.6.b: apiGet HTML 500 → AuthError(AUTH_HTML_500) after 1 data fetch, and the next getAuthToken mints', async () => {
    await seedCachedToken('stale');
    routeFetch({ token: mintSequence('fresh'), data: () => makeHtml5xxResponse(500) });

    const err = await apiGet('/test', {}, 'stale', false).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).errorCode).toBe('AUTH_HTML_500');
    expect(dataFetches()).toHaveLength(1);
    expect(tokenPosts()).toHaveLength(0);
    await expect(getCredsToken()).resolves.toBe('fresh');
    expect(tokenPosts()).toHaveLength(1);
  });

  it('DD1.6.c: apiPut 401 → AuthError(401) after 1 data fetch, and the next getAuthToken mints', async () => {
    await seedCachedToken('stale');
    routeFetch({ token: mintSequence('fresh'), data: () => makeJsonErrorResponse(401) });

    const err = await apiPut('/put', { a: 1 }, 'stale', false).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect(dataFetches()).toHaveLength(1);
    await expect(getCredsToken()).resolves.toBe('fresh');
    expect(tokenPosts()).toHaveLength(1);
  });

  it('DD1.6.d: a 401 for a token that is no longer cached keeps the cached one (0 fetches next)', async () => {
    await seedCachedToken('fresh');
    routeFetch({ token: mintSequence('fresh-2'), data: () => makeJsonErrorResponse(401) });

    await expect(apiGet('/test', {}, 'stale', false)).rejects.toBeInstanceOf(AuthError);

    await expect(getCredsToken()).resolves.toBe('fresh');
    expect(tokenPosts()).toHaveLength(0);
  });

  it('DD1.6.e: a non-auth failure (JSON 500) keeps the cached token', async () => {
    await seedCachedToken('fresh');
    routeFetch({ token: mintSequence('fresh-2'), data: () => makeJsonErrorResponse(500) });

    await expect(apiGet('/test', {}, 'fresh', false)).rejects.toBeInstanceOf(ApiError);

    await expect(getCredsToken()).resolves.toBe('fresh');
    expect(tokenPosts()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DD1.7 — a 401 that persists after renewal (FR4.c contract, unchanged)
// ---------------------------------------------------------------------------

describe('DD1.7: 401 that persists with a fresh token', () => {
  it('DD1.7.a: with creds, 401 → mint → 401 rejects with AuthError(401) after exactly 2 data fetches', async () => {
    routeFetch({ token: mintSequence('fresh'), data: () => makeJsonErrorResponse(401) });

    const err = await apiGet('/test', {}, 'stale', false, CREDS).catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
    expect(dataFetches().map((f) => f.authToken)).toEqual(['stale', 'fresh']);
    expect(tokenPosts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DD1.8 — auth log events (src/lib/log.ts)
// ---------------------------------------------------------------------------

describe('DD1.8: auth log events', () => {
  it('DD1.8.a: auth.token_minted fires once per successful getAuthToken mint — not on cache hits, joins, failed mints or mintAuthToken', async () => {
    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-1'));
    await getCredsToken();
    await getCredsToken(); // cache hit
    expect(logEvents(mockLogInfo, 'auth.token_minted')).toEqual([['auth.token_minted', {}]]);

    mockFetch.mockResolvedValueOnce(makeTokenResponse('probe-tok'));
    await mintAuthToken(CREDS.username, CREDS.password, CREDS.useQA);

    invalidateAuthToken();
    mockFetch.mockResolvedValueOnce(makeJsonErrorResponse(401));
    await expect(getCredsToken()).rejects.toBeInstanceOf(AuthError);
    expect(logEvents(mockLogInfo, 'auth.token_minted')).toHaveLength(1);

    invalidateAuthToken();
    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-2'));
    await Promise.all([getCredsToken(), getCredsToken(), getCredsToken()]);
    expect(logEvents(mockLogInfo, 'auth.token_minted')).toEqual([
      ['auth.token_minted', {}],
      ['auth.token_minted', {}],
    ]);
  });

  it('DD1.8.b: auth.token_retried { triggerStatusCode: 401 } fires once per apiGet retry, never without one', async () => {
    routeFetch({
      token: mintSequence('fresh'),
      data: (t) => (t === 'fresh' ? makeJsonOkResponse({ ok: true }) : makeJsonErrorResponse(401)),
    });

    await expect(apiGet('/test', {}, 'stale', false)).rejects.toBeInstanceOf(AuthError);
    expect(logEvents(mockLogWarn, 'auth.token_retried')).toHaveLength(0);

    await apiGet('/test', {}, 'stale', false, CREDS);
    expect(logEvents(mockLogWarn, 'auth.token_retried')).toEqual([
      ['auth.token_retried', { triggerStatusCode: 401 }],
    ]);
  });

  it.each([500, 503])(
    'DD1.8.c: an HTML %i trigger logs auth.token_retried with that status',
    async (status) => {
      routeFetch({
        token: mintSequence('fresh'),
        data: (t) => (t === 'fresh' ? makeJsonOkResponse({ ok: true }) : makeHtml5xxResponse(status)),
      });

      await apiGet('/test', {}, 'stale', false, CREDS);

      expect(logEvents(mockLogWarn, 'auth.token_retried')).toEqual([
        ['auth.token_retried', { triggerStatusCode: status }],
      ]);
    },
  );

  it('DD1.8.d: apiPut retry logs auth.token_retried { triggerStatusCode: 401 }', async () => {
    routeFetch({
      token: mintSequence('fresh'),
      data: (t) => (t === 'fresh' ? makeEmptyOkResponse() : makeJsonErrorResponse(401)),
    });

    await apiPut('/put', { a: 1 }, 'stale', false, CREDS);

    expect(logEvents(mockLogWarn, 'auth.token_retried')).toEqual([
      ['auth.token_retried', { triggerStatusCode: 401 }],
    ]);
  });

  it('DD1.8.e: a concurrent wave logs 1 auth.token_minted and 1 auth.token_retried per caller', async () => {
    await seedCachedToken('stale');
    const mint = deferred<unknown>();
    routeFetch({
      token: () => mint.promise,
      data: (t) => (t === 'fresh' ? makeJsonOkResponse({ ok: true }) : makeJsonErrorResponse(401)),
    });

    const all = Promise.all([1, 2, 3].map(() => apiGet('/test', {}, 'stale', false, CREDS)));
    await flush();
    mint.resolve(makeTokenResponse('fresh'));
    await all;

    expect(logEvents(mockLogInfo, 'auth.token_minted')).toHaveLength(1);
    expect(logEvents(mockLogWarn, 'auth.token_retried')).toEqual(
      Array.from({ length: 3 }, () => ['auth.token_retried', { triggerStatusCode: 401 }]),
    );
  });

  it('DD1.8.f: no auth log call carries the token, username or password', async () => {
    const secret = { username: 'jane.doe@example.com', password: 'hunter2-secret', useQA: false };
    routeFetch({
      token: mintSequence('tok-stale-0001', 'tok-fresh-0002'),
      data: (t) =>
        t === 'tok-fresh-0002' ? makeJsonOkResponse({ ok: true }) : makeJsonErrorResponse(401),
    });

    await getAuthToken(secret.username, secret.password, secret.useQA);
    await apiGet('/test', {}, 'tok-stale-0001', false, secret);

    const calls = [...mockLogInfo.mock.calls, ...mockLogWarn.mock.calls, ...mockLogError.mock.calls];
    expect(calls.map(([category]) => category)).toEqual(
      expect.arrayContaining(['auth.token_minted', 'auth.token_retried']),
    );
    const serialized = JSON.stringify(calls);
    for (const value of ['tok-stale-0001', 'tok-fresh-0002', secret.username, secret.password]) {
      expect(serialized).not.toContain(value);
    }
  });
});

// ---------------------------------------------------------------------------
// DD1.9-DD1.17 helpers — failed-login latch
// ---------------------------------------------------------------------------

type TestCreds = typeof CREDS;

/** A JSON error in Crossover's `{errorCode, type, httpStatus, text}` envelope (docs/CROSSOVER_API.md F4). */
function makeEnvelopeErrorResponse(status: number, errorCode: string, text: string) {
  const envelope = { errorCode, type: 'ERROR', httpStatus: status, text };
  return {
    ok: false,
    status,
    json: async () => envelope,
    text: async () => JSON.stringify(envelope),
    headers: { get: (k: string) =>
      k.toLowerCase() === 'content-type' ? 'application/json' : null,
    },
  };
}

function tokenFor(creds: TestCreds) {
  return getAuthToken(creds.username, creds.password, creds.useQA);
}

/**
 * Have the token endpoint reject `CREDS` through getAuthToken (the rejection that latches),
 * then forget that fetch and its logs. The endpoint keeps answering `status` afterwards,
 * like a server that still holds a different password.
 */
async function rejectLogin(status: 401 | 403 = 401) {
  routeFetch({ token: () => makeJsonErrorResponse(status) });
  await expect(getCredsToken()).rejects.toBeInstanceOf(AuthError);
  mockFetch.mockClear();
  clearLogMocks();
}

function expectLatchedError(err: unknown, statusCode: 401 | 403 = 401) {
  expect(err).toBeInstanceOf(AuthError);
  expect(err).toMatchObject({ errorCode: 'AUTH_LOGIN_LATCHED', statusCode });
}

/** The original rejection from the token endpoint, not the latch's synthetic one. */
function expectServerRejection(err: unknown, statusCode: 401 | 403 = 401) {
  expect(err).toBeInstanceOf(AuthError);
  expect((err as AuthError).statusCode).toBe(statusCode);
  expect((err as AuthError).errorCode).not.toBe('AUTH_LOGIN_LATCHED');
}

// ---------------------------------------------------------------------------
// DD1.9 — a rejected login is latched for its credentials
// ---------------------------------------------------------------------------

describe('DD1.9: failed-login latch', () => {
  it('DD1.9.a: mint 401 → AuthError(401); the same creds inside 60 s → AUTH_LOGIN_LATCHED with 0 fetches; logged once', async () => {
    routeFetch({ token: () => makeJsonErrorResponse(401) });

    expectServerRejection(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(1);

    // A TanStack retry, then another: both refused locally.
    expectLatchedError(await getCredsToken().catch((e) => e));
    expectLatchedError(await getCredsToken().catch((e) => e));

    expect(tokenPosts()).toHaveLength(1);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toEqual([
      ['auth.login_latched', { statusCode: 401 }],
    ]);
    expect(logEvents(mockLogInfo, 'auth.token_minted')).toHaveLength(0);
  });

  it('DD1.9.b: callers that joined the rejected mint get its 401; a caller after it settles is latched', async () => {
    const mint = deferred<unknown>();
    routeFetch({ token: () => mint.promise });

    const joined = Promise.all([1, 2, 3].map(() => getCredsToken().catch((e) => e)));
    mint.resolve(makeJsonErrorResponse(401));
    for (const err of await joined) expectServerRejection(err);
    expect(tokenPosts()).toHaveLength(1);

    expectLatchedError(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(1);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toHaveLength(1);
  });

  it('DD1.9.c: neither the latched error nor any log call carries the username, password or Basic string', async () => {
    const secret = { username: 'jane.doe@example.com', password: 'hunter2-secret', useQA: false };
    routeFetch({ token: () => makeJsonErrorResponse(401) });

    await expect(tokenFor(secret)).rejects.toBeInstanceOf(AuthError);
    const latched = await tokenFor(secret).catch((e) => e);

    expectLatchedError(latched);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toHaveLength(1);
    const exposed = JSON.stringify([
      (latched as AuthError).message,
      (latched as AuthError).serverText,
      ...mockLogInfo.mock.calls,
      ...mockLogWarn.mock.calls,
      ...mockLogError.mock.calls,
    ]);
    for (const value of [secret.username, secret.password, btoa(`${secret.username}:${secret.password}`)]) {
      expect(exposed).not.toContain(value);
    }
  });
});

// ---------------------------------------------------------------------------
// DD1.10 — the latch lasts LOGIN_LATCH_MS from the rejection
// ---------------------------------------------------------------------------

describe('DD1.10: latch expiry', () => {
  const T0 = Date.UTC(2026, 9, 22, 9, 0, 0);
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(T0);
  });
  afterEach(() => nowSpy.mockRestore());

  it('DD1.10.a: LOGIN_LATCH_MS is 60 s', () => {
    expect(LOGIN_LATCH_MS).toBe(60_000);
  });

  it('DD1.10.b: latched through a 1 s / 2 s retry cycle and at 59 999 ms; at 60 001 ms the same creds mint again', async () => {
    await rejectLogin(401);

    for (const elapsed of [1_000, 3_000, 59_999]) {
      nowSpy.mockReturnValue(T0 + elapsed);
      expectLatchedError(await getCredsToken().catch((e) => e));
    }
    expect(tokenPosts()).toHaveLength(0);

    nowSpy.mockReturnValue(T0 + 60_001);
    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-after-expiry'));

    await expect(getCredsToken()).resolves.toBe('tok-after-expiry');
    expect(tokenPosts()).toHaveLength(1);
  });

  it('DD1.10.c: a rejection after expiry latches again, for 60 s from that rejection', async () => {
    await rejectLogin(401);

    nowSpy.mockReturnValue(T0 + 60_001);
    expectServerRejection(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(1);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toEqual([
      ['auth.login_latched', { statusCode: 401 }],
    ]);

    nowSpy.mockReturnValue(T0 + 60_001 + 59_999);
    expectLatchedError(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DD1.11 — the latch is keyed by environment + username + password
// ---------------------------------------------------------------------------

describe('DD1.11: other credentials are not blocked', () => {
  it.each([
    ['a different password, same username', { ...CREDS, password: 'pw-corrected' }],
    ['the same username and password in the other environment', { ...CREDS, useQA: !CREDS.useQA }],
    ['a different username, same password', { ...CREDS, username: 'someone.else@example.com' }],
  ])('DD1.11.a: while CREDS are latched, %s mints immediately', async (_label, other) => {
    await rejectLogin(401);
    expectLatchedError(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(0);

    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-other'));
    await expect(tokenFor(other)).resolves.toBe('tok-other');

    expect(tokenPosts()).toHaveLength(1);
    const [url, init] = tokenPosts()[0];
    expect(url).toContain(other.useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com');
    expect(init.headers.Authorization).toBe(`Basic ${btoa(`${other.username}:${other.password}`)}`);
  });
});

// ---------------------------------------------------------------------------
// DD1.12 — invalidateAuthToken() (sign-out / env switch) clears the latch
// ---------------------------------------------------------------------------

describe('DD1.12: invalidateAuthToken clears the latch', () => {
  it('DD1.12.a: after invalidateAuthToken() during the latch, the same creds mint', async () => {
    await rejectLogin(401);
    expectLatchedError(await getCredsToken().catch((e) => e));

    invalidateAuthToken();
    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-after-reset'));

    await expect(getCredsToken()).resolves.toBe('tok-after-reset');
    expect(tokenPosts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DD1.13 — a successful getAuthToken mint clears the latch
// ---------------------------------------------------------------------------

describe('DD1.13: a successful mint clears the latch', () => {
  it('DD1.13.a: latch A, mint B, evict B with invalidateIfCurrent → getAuthToken(A) makes 1 fetch', async () => {
    const credsB = { ...CREDS, password: 'pw-corrected' };
    await rejectLogin(401);
    expectLatchedError(await getCredsToken().catch((e) => e));

    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-b'));
    await expect(tokenFor(credsB)).resolves.toBe('tok-b');
    invalidateIfCurrent('tok-b'); // empties the cache; does not touch the latch itself
    expect(tokenPosts()).toHaveLength(1);

    mockFetch.mockResolvedValueOnce(makeTokenResponse('tok-a'));
    await expect(getCredsToken()).resolves.toBe('tok-a');
    expect(tokenPosts()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DD1.14 — mintAuthToken (the onboarding probe) neither reads nor writes the latch
// ---------------------------------------------------------------------------

describe('DD1.14: mintAuthToken bypasses the latch', () => {
  it('DD1.14.a: a probe during the latch makes 1 fetch, and its success leaves getAuthToken latched', async () => {
    await rejectLogin(401);
    expectLatchedError(await getCredsToken().catch((e) => e));

    mockFetch.mockResolvedValueOnce(makeTokenResponse('probe-tok'));
    await expect(mintAuthToken(CREDS.username, CREDS.password, CREDS.useQA)).resolves.toBe('probe-tok');
    expect(tokenPosts()).toHaveLength(1);

    expectLatchedError(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(1);
  });

  it('DD1.14.b: a rejected probe does not latch — getAuthToken still asks the server, and its own rejection latches', async () => {
    routeFetch({ token: () => makeJsonErrorResponse(401) });

    expectServerRejection(await mintAuthToken(CREDS.username, CREDS.password, CREDS.useQA).catch((e) => e));
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toHaveLength(0);

    expectServerRejection(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(2);

    expectLatchedError(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DD1.15 — renewal inside apiGet/apiPut during the latch
// ---------------------------------------------------------------------------

describe('DD1.15: renewal during the latch', () => {
  it.each([
    ['apiGet', () => apiGet('/test', {}, 'stale', false, CREDS)],
    ['apiPut', () => apiPut('/put', { a: 1 }, 'stale', false, CREDS)],
  ])('DD1.15.a: %s 401 with creds rejects with the latched AuthError after 1 data fetch and 0 token POSTs', async (_name, call) => {
    await rejectLogin(401);
    routeFetch({ token: () => makeJsonErrorResponse(401), data: () => makeJsonErrorResponse(401) });

    const err = await call().catch((e) => e);

    expectLatchedError(err);
    expect(dataFetches()).toHaveLength(1);
    expect(tokenPosts()).toHaveLength(0);
    expect(logEvents(mockLogWarn, 'auth.token_retried')).toHaveLength(0);
  });

  it('DD1.15.b: password changed on the server — a 401 wave makes 1 rejected re-mint, then later calls are latched with 0 token POSTs', async () => {
    await seedCachedToken('stale');
    const mint = deferred<unknown>();
    routeFetch({ token: () => mint.promise, data: () => makeJsonErrorResponse(401) });

    const wave = Promise.all(
      [1, 2, 3, 4, 5].map(() => apiGet('/test', {}, 'stale', false, CREDS).catch((e) => e)),
    );
    await flush(); // every caller has had its 401 and joined the re-mint
    mint.resolve(makeJsonErrorResponse(401));
    for (const err of await wave) expectServerRejection(err);

    expect(tokenPosts()).toHaveLength(1);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toEqual([
      ['auth.login_latched', { statusCode: 401 }],
    ]);

    expectLatchedError(await apiGet('/test', {}, 'stale', false, CREDS).catch((e) => e));
    expect(tokenPosts()).toHaveLength(1);
    expect(dataFetches()).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// DD1.16 — only a credential rejection (AuthError other than AUTH_HTML_500) latches
// ---------------------------------------------------------------------------

describe('DD1.16: which mint failures latch', () => {
  it.each([
    ['a NetworkError', () => Promise.reject(new TypeError('Network request failed')), NetworkError, undefined],
    ['an HTML 500 (AUTH_HTML_500)', () => makeHtml5xxResponse(500), AuthError, 'AUTH_HTML_500'],
    ['an HTML 503 (AUTH_HTML_500)', () => makeHtml5xxResponse(503), AuthError, 'AUTH_HTML_500'],
    ['a JSON 500 (ApiError)', () => makeJsonErrorResponse(500), ApiError, undefined],
  ])('DD1.16.a: %s from the token endpoint does not latch', async (_label, reply, ErrorClass, errorCode) => {
    routeFetch({ token: reply });
    const err = await getCredsToken().catch((e) => e);
    expect(err).toBeInstanceOf(ErrorClass);
    expect((err as { errorCode?: string }).errorCode).toBe(errorCode);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toHaveLength(0);

    // The next call still reaches the server. When the server does judge and reject the
    // credentials, that rejection (and only that one) latches.
    routeFetch({ token: () => makeJsonErrorResponse(401) });
    expectServerRejection(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(2);

    expectLatchedError(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(2);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toHaveLength(1);
  });

  it('DD1.16.b: a mint 403 latches with statusCode 403 and rethrows the server\'s own error first', async () => {
    routeFetch({ token: () => makeEnvelopeErrorResponse(403, 'CROS-0002', 'Forbidden') });

    const first = await getCredsToken().catch((e) => e);
    expectServerRejection(first, 403);
    expect((first as AuthError).errorCode).toBe('CROS-0002');

    expectLatchedError(await getCredsToken().catch((e) => e), 403);
    expect(tokenPosts()).toHaveLength(1);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toEqual([
      ['auth.login_latched', { statusCode: 403 }],
    ]);
  });
});

// ---------------------------------------------------------------------------
// DD1.17 — a rejection from a mint that is no longer current does not latch
// ---------------------------------------------------------------------------

describe('DD1.17: a stale mint rejection does not latch', () => {
  it('DD1.17.a: a 401 that settles after invalidateAuthToken() reaches its caller, and the next same-creds call asks the server', async () => {
    const staleMint = deferred<unknown>();
    routeFetch({ token: () => makeJsonErrorResponse(401) });
    mockFetch.mockReturnValueOnce(staleMint.promise);

    const pending = getCredsToken().catch((e) => e);
    invalidateAuthToken(); // sign-out / env switch while the login is in flight
    staleMint.resolve(makeJsonErrorResponse(401));

    expectServerRejection(await pending);
    expect(logEvents(mockLogWarn, 'auth.login_latched')).toHaveLength(0);

    // Not latched by the stale mint: this call reaches the server, and its own (current)
    // rejection latches.
    expectServerRejection(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(2);

    expectLatchedError(await getCredsToken().catch((e) => e));
    expect(tokenPosts()).toHaveLength(2);
  });
});
