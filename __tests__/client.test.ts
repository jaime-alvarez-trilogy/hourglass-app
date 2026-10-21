// FR3, FR4, FR5: API Client
import { getAuthToken, apiGet, apiPut, invalidateAuthToken, mintAuthToken } from '../src/api/client';
import { AuthError, NetworkError, ApiError } from '../src/api/errors';
import {
  makeExpoLikeResponse,
  type ExpoLikeResponse,
  type ExpoLikeResponseInit,
} from './helpers/expoLikeResponse';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  // Spec 04: reset the module-level token cache so each test sees a clean slate.
  invalidateAuthToken();
});

// --- FR3: getAuthToken ---
describe('FR3: getAuthToken', () => {
  it('returns token string on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '12345:abc',
    });
    const token = await getAuthToken('user@example.com', 'pass', false);
    expect(token).toBe('12345:abc');
  });

  it('sends Authorization: Basic base64(username:password) header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'tok' });
    await getAuthToken('user@example.com', 'pass', false);
    const [, options] = mockFetch.mock.calls[0];
    const expected = 'Basic ' + btoa('user@example.com:pass');
    expect(options.headers['Authorization']).toBe(expected);
  });

  it('sends POST request', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'tok' });
    await getAuthToken('user@example.com', 'pass', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
  });

  it('throws AuthError(401) on 401 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => '', headers: { get: () => null } });
    const err = await getAuthToken('u', 'p', false).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(401);
  });

  it('throws AuthError(403) on 403 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => '', headers: { get: () => null } });
    const err = await getAuthToken('u', 'p', false).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(403);
  });

  it('throws NetworkError when fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getAuthToken('u', 'p', false)).rejects.toThrow(NetworkError);
  });

  it('uses QA base URL when useQA is true', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'tok' });
    await getAuthToken('u', 'p', true);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api-qa\.crossover\.com/);
  });

  it('uses prod base URL when useQA is false', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'tok' });
    await getAuthToken('u', 'p', false);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api\.crossover\.com/);
  });
});

// --- FR4: apiGet ---
describe('FR4: apiGet', () => {
  it('attaches x-auth-token header with the token value', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ data: 1 }) });
    await apiGet('/test', {}, 'mytoken', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-auth-token']).toBe('mytoken');
  });

  it('serializes params into query string', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' });
    await apiGet('/test', { date: '2026-01-01', teamId: '4584' }, 'tok', false);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('date=2026-01-01');
    expect(url).toContain('teamId=4584');
  });

  it('no ? in URL when params is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' });
    await apiGet('/test', {}, 'tok', false);
    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain('?');
  });

  it('request method is GET', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' });
    await apiGet('/test', {}, 'tok', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('GET');
  });

  // Regression (empty-body bug): a 200/204 with a zero-byte body must resolve to
  // undefined, NOT throw "JSON Parse error: Unexpected end of input". apiGet used
  // raw response.json() which crashed managers on the approvals screen when a
  // pending GET (e.g. empty overtime queue) returned an empty body. parseBody now
  // guards both apiGet and apiPut.
  it('returns undefined on an empty 200 body (no JSON.parse crash)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });
    await expect(apiGet('/test', {}, 'tok', false)).resolves.toBeUndefined();
  });

  it('returns undefined on a 204 empty body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
    await expect(apiGet('/test', {}, 'tok', false)).resolves.toBeUndefined();
  });

  it('parses a non-empty JSON body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ a: 1 }) });
    await expect(apiGet('/test', {}, 'tok', false)).resolves.toEqual({ a: 1 });
  });

  it('throws AuthError(401) on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toThrow(AuthError);
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws AuthError(403) on 403', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toThrow(AuthError);
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws ApiError(500) on 500', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toThrow(ApiError);
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 500 });
  });
});

// --- FR5: apiPut ---
describe('FR5: apiPut', () => {
  it('request method is PUT', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' });
    await apiPut('/test', {}, 'tok', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('PUT');
  });

  it('attaches x-auth-token header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' });
    await apiPut('/test', {}, 'mytoken', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-auth-token']).toBe('mytoken');
  });

  it('attaches Content-Type: application/json header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' });
    await apiPut('/test', {}, 'tok', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('serializes body as JSON string', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' });
    const body = { approverId: '123', timecardIds: [1, 2] };
    await apiPut('/test', body, 'tok', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toBe(JSON.stringify(body));
  });

  it('returns undefined when response body is empty (approve/reject endpoints)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });
    const result = await apiPut('/test', {}, 'tok', false);
    expect(result).toBeUndefined();
  });

  it('returns parsed JSON when response body is non-empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"ok":true}' });
    const result = await apiPut<{ ok: boolean }>('/test', {}, 'tok', false);
    expect(result).toEqual({ ok: true });
  });

  it('throws AuthError(403) on 403', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    await expect(apiPut('/test', {}, 'tok', false)).rejects.toThrow(AuthError);
    await expect(apiPut('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws ApiError(422) on 422', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}), text: async () => '', headers: { get: () => 'application/json' } });
    await expect(apiPut('/test', {}, 'tok', false)).rejects.toThrow(ApiError);
    await expect(apiPut('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 422 });
  });
});

// --- 10-sdk-58-ios-27 FR3: expo/fetch reads a body once ---
// From SDK 56, globalThis.fetch is expo/fetch: a second text()/json() on a Response rejects with
// TypeError "Response body is already used". Every client path runs here against that stand-in.
// handleStatus wraps its read in try/catch, so a second read there would be swallowed silently;
// the error-path cases therefore also assert that the envelope arrived, and every case checks
// each Response's read log directly.
describe('10 FR3: every client path reads each body at most once (expo/fetch)', () => {
  const CREDS = { username: 'u@example.com', password: 'pw', useQA: false };
  const ENVELOPE = JSON.stringify({ errorCode: 'CROS-0042', type: 'VALIDATION', text: 'Nope' });
  let created: ExpoLikeResponse[];

  function respond(init: ExpoLikeResponseInit): ExpoLikeResponse {
    const res = makeExpoLikeResponse(init);
    created.push(res);
    return res;
  }

  function queue(...inits: ExpoLikeResponseInit[]): ExpoLikeResponse[] {
    const out = inits.map(respond);
    for (const r of out) mockFetch.mockResolvedValueOnce(r);
    return out;
  }

  beforeEach(() => {
    created = [];
  });

  afterEach(() => {
    // No Response is ever read twice (a rejected second read is logged too).
    expect(created.map((r) => r.reads.length).filter((n) => n > 1)).toEqual([]);
  });

  describe('token mint', () => {
    it('200 plain-text token: one read', async () => {
      const [res] = queue({ status: 200, body: '12345:abc' });
      await expect(getAuthToken('u', 'p', false)).resolves.toBe('12345:abc');
      expect(res.reads).toEqual(['text']);
    });

    it('200 JSON {"token"} body: one read', async () => {
      const [res] = queue({ status: 200, body: '{"token":"tok-json"}' });
      await expect(mintAuthToken('u', 'p', false)).resolves.toBe('tok-json');
      expect(res.reads).toEqual(['text']);
    });

    it('401 with an envelope: AuthError carries it, one read', async () => {
      const [res] = queue({ status: 401, body: ENVELOPE, headers: { 'content-type': 'application/json' } });
      const err = await mintAuthToken('u', 'p', false).catch((e) => e);
      expect(err).toBeInstanceOf(AuthError);
      expect(err).toMatchObject({ statusCode: 401, errorCode: 'CROS-0042', serverText: 'Nope' });
      expect(res.reads).toEqual(['text']);
    });

    it('500 JSON envelope: ApiError carries it, one read', async () => {
      const [res] = queue({ status: 500, body: ENVELOPE, headers: { 'content-type': 'application/json' } });
      const err = await mintAuthToken('u', 'p', false).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ statusCode: 500, errorCode: 'CROS-0042', errorType: 'VALIDATION' });
      expect(res.reads).toEqual(['text']);
    });
  });

  describe.each([
    ['GET', (creds?: typeof CREDS) => apiGet<unknown>('/test', {}, 'stale', false, creds)],
    ['PUT', (creds?: typeof CREDS) => apiPut<unknown>('/test', { a: 1 }, 'stale', false, creds)],
  ] as const)('%s', (_method, call) => {
    it('200 JSON, no creds: one read', async () => {
      const [res] = queue({ status: 200, body: '{"a":1}' });
      await expect(call()).resolves.toEqual({ a: 1 });
      expect(res.reads).toEqual(['text']);
    });

    it('422 envelope, no creds: ApiError carries it, one read', async () => {
      const [res] = queue({ status: 422, body: ENVELOPE, headers: { 'content-type': 'application/json' } });
      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ statusCode: 422, errorCode: 'CROS-0042' });
      expect(res.reads).toEqual(['text']);
    });

    it('401 without creds: no retry, AuthError carries the envelope, one read', async () => {
      const [res] = queue({ status: 401, body: ENVELOPE, headers: { 'content-type': 'application/json' } });
      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(AuthError);
      expect(err).toMatchObject({ statusCode: 401, errorCode: 'CROS-0042' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.reads).toEqual(['text']);
    });

    it('200 with creds: no retry, one read', async () => {
      const [res] = queue({ status: 200, body: '{"a":2}' });
      await expect(call(CREDS)).resolves.toEqual({ a: 2 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.reads).toEqual(['text']);
    });

    it('401 → mint → 200 with creds: the 401 is discarded unread; mint and retry read once each', async () => {
      const [first, mint, retry] = queue(
        { status: 401, body: ENVELOPE, headers: { 'content-type': 'application/json' } },
        { status: 200, body: 'fresh-token' },
        { status: 200, body: '{"a":3}' },
      );
      await expect(call(CREDS)).resolves.toEqual({ a: 3 });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[2][1].headers['x-auth-token']).toBe('fresh-token');
      expect(first.reads).toEqual([]);
      expect(mint.reads).toEqual(['text']);
      expect(retry.reads).toEqual(['text']);
    });

    it('HTML 5xx → mint → 200 with creds: the HTML page is discarded unread', async () => {
      const [first, mint, retry] = queue(
        { status: 500, body: '<!doctype html><html>Tomcat</html>', headers: { 'content-type': 'text/html;charset=utf-8' } },
        { status: 200, body: 'fresh-token' },
        { status: 200, body: '{"a":4}' },
      );
      await expect(call(CREDS)).resolves.toEqual({ a: 4 });
      expect(first.reads).toEqual([]);
      expect(mint.reads).toEqual(['text']);
      expect(retry.reads).toEqual(['text']);
    });

    it('401 → mint → 401 with creds: AuthError carries the retry envelope, read once', async () => {
      const [first, mint, retry] = queue(
        { status: 401, body: '', headers: { 'content-type': 'application/json' } },
        { status: 200, body: 'fresh-token' },
        { status: 401, body: ENVELOPE, headers: { 'content-type': 'application/json' } },
      );
      const err = await call(CREDS).catch((e) => e);
      expect(err).toBeInstanceOf(AuthError);
      expect(err).toMatchObject({ statusCode: 401, errorCode: 'CROS-0042' });
      expect(first.reads).toEqual([]);
      expect(mint.reads).toEqual(['text']);
      expect(retry.reads).toEqual(['text']);
    });

    it('401 → mint fails 401 with creds: AuthError from the mint, each body read at most once', async () => {
      const [first, mint] = queue(
        { status: 401, body: '', headers: { 'content-type': 'application/json' } },
        { status: 401, body: ENVELOPE, headers: { 'content-type': 'application/json' } },
      );
      const err = await call(CREDS).catch((e) => e);
      expect(err).toBeInstanceOf(AuthError);
      expect(err).toMatchObject({ statusCode: 401, errorCode: 'CROS-0042' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(first.reads).toEqual([]);
      expect(mint.reads).toEqual(['text']);
    });
  });
});
