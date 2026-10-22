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
 * mint generation guard, no-creds eviction and the `auth.*` log events.
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
  mintAuthToken,
} from '../../api/client';
import { AuthError, ApiError } from '../../api/errors';
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
