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
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../../store/config', () => ({
  getApiBase: (useQA: boolean) =>
    useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com',
}));

import {
  apiGet,
  apiPut,
  getAuthToken,
  invalidateAuthToken,
  mintAuthToken,
} from '../../api/client';
import { AuthError, ApiError } from '../../api/errors';

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
