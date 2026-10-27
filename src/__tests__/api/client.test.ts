/**
 * FR1, FR2: API Client network error handling
 * Tests for src/api/client.ts: apiGet, apiPut
 *
 * Verifies that fetch() throwing a TypeError (offline) results in
 * NetworkError being thrown — not the raw TypeError.
 *
 * 10-sdk-58-ios-27 FR3 (bottom of file): blank and non-JSON 2xx bodies and the
 * expo/fetch FetchError, against the single-read Response stand-in.
 */

import { FetchError, makeExpoLikeResponse } from '../../../__tests__/helpers/expoLikeResponse';

// Mock fetch globally before importing the module under test
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock config dependency
jest.mock('../../store/config', () => ({
  getApiBase: (useQA: boolean) => (useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com'),
}));

import { apiGet, apiPut, mintAuthToken } from '../../api/client';
import { NetworkError, AuthError, ApiError } from '../../api/errors';

const FAKE_TOKEN = 'test-token-abc';
const FAKE_PATH = '/api/v3/users/current';
const FAKE_PARAMS: Record<string, string> = {};

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'error' }),
    // Spec 03/04 — handleStatus reads text() for envelope and headers.get('content-type')
    // for HTML 5xx detection. Default to JSON content-type so the new code path is dormant.
    text: async () => '',
    headers: { get: () => 'application/json' },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// FR1: apiGet
// ---------------------------------------------------------------------------

describe('FR1: apiGet — network error wrapping', () => {
  it('throws NetworkError when fetch() throws TypeError (offline)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiGet(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false)).rejects.toThrow(NetworkError);
  });

  it('throws NetworkError (not raw TypeError) when offline', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiGet(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false)).rejects.not.toThrow(TypeError);
  });

  it('returns parsed JSON on 200 response', async () => {
    const expected = { id: 42, name: 'Alice' };
    mockFetch.mockResolvedValueOnce(makeOkResponse(expected));

    const result = await apiGet<{ id: number; name: string }>(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false);

    expect(result).toEqual(expected);
  });

  it('throws AuthError on 401 response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401));

    await expect(apiGet(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false)).rejects.toThrow(AuthError);
  });

  it('throws AuthError on 403 response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(403));

    await expect(apiGet(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false)).rejects.toThrow(AuthError);
  });

  it('throws ApiError on 500 response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

    await expect(apiGet(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false)).rejects.toThrow(ApiError);
  });

  it('passes x-auth-token header in the request', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({}));

    await apiGet(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(FAKE_PATH),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-auth-token': FAKE_TOKEN }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// FR2: apiPut
// ---------------------------------------------------------------------------

describe('FR2: apiPut — network error wrapping', () => {
  const FAKE_PUT_PATH = '/api/timetracking/workdiaries/manual/approved';
  const FAKE_BODY = { approverId: 123, timecardIds: [1, 2], allowOvertime: false };

  it('throws NetworkError when fetch() throws TypeError (offline)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiPut(FAKE_PUT_PATH, FAKE_BODY, FAKE_TOKEN, false)).rejects.toThrow(NetworkError);
  });

  it('throws NetworkError (not raw TypeError) when offline', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiPut(FAKE_PUT_PATH, FAKE_BODY, FAKE_TOKEN, false)).rejects.not.toThrow(TypeError);
  });

  it('returns parsed JSON on 200 response', async () => {
    const expected = { success: true };
    mockFetch.mockResolvedValueOnce(makeOkResponse(expected));

    const result = await apiPut<{ success: boolean }>(FAKE_PUT_PATH, FAKE_BODY, FAKE_TOKEN, false);

    expect(result).toEqual(expected);
  });

  it('throws AuthError on 401 response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401));

    await expect(apiPut(FAKE_PUT_PATH, FAKE_BODY, FAKE_TOKEN, false)).rejects.toThrow(AuthError);
  });

  it('throws ApiError on 500 response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

    await expect(apiPut(FAKE_PUT_PATH, FAKE_BODY, FAKE_TOKEN, false)).rejects.toThrow(ApiError);
  });

  it('sends PUT method with JSON body and auth header', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({}));

    await apiPut(FAKE_PUT_PATH, FAKE_BODY, FAKE_TOKEN, false);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(FAKE_PUT_PATH),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'x-auth-token': FAKE_TOKEN,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(FAKE_BODY),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 10-sdk-58-ios-27 FR3: expo/fetch readiness (single-read Response stand-in)
// ---------------------------------------------------------------------------

describe.each([
  ['GET', () => apiGet<unknown>(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false)],
  ['PUT', () => apiPut<unknown>('/api/timetracking/workdiaries/manual/approved', { a: 1 }, FAKE_TOKEN, false)],
] as const)('10 FR3: %s 2xx body parsing', (_method, call) => {
  it.each([
    [200, ''],
    [204, ''],
    [200, ' '],
    [200, '\n'],
    [204, ' '],
    [204, '\n'],
    [200, ' \r\n\t '],
  ])('%i with a blank body %j resolves to undefined after one read', async (status, body) => {
    const res = makeExpoLikeResponse({ status, body });
    mockFetch.mockResolvedValueOnce(res);
    await expect(call()).resolves.toBeUndefined();
    expect(res.reads).toEqual(['text']);
  });

  it('200 {} resolves to {} after one read', async () => {
    const res = makeExpoLikeResponse({ status: 200, body: '{}' });
    mockFetch.mockResolvedValueOnce(res);
    await expect(call()).resolves.toEqual({});
    expect(res.reads).toEqual(['text']);
  });

  it('200 JSON wrapped in whitespace still parses', async () => {
    const res = makeExpoLikeResponse({ status: 200, body: '\n  [1,2]\n' });
    mockFetch.mockResolvedValueOnce(res);
    await expect(call()).resolves.toEqual([1, 2]);
  });

  it('200 text/html (captive portal / proxy) rejects with ApiError(200), not SyntaxError', async () => {
    const res = makeExpoLikeResponse({
      status: 200,
      body: '<!doctype html><html><head><title>Sign in to Wi-Fi</title></head><body>…</body></html>',
      headers: { 'content-type': 'text/html;charset=utf-8' },
    });
    mockFetch.mockResolvedValueOnce(res);
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect(err).toMatchObject({ name: 'ApiError', statusCode: 200, message: 'Invalid JSON response body' });
    expect(res.reads).toEqual(['text']);
  });

  it('201 truncated JSON rejects with ApiError(201)', async () => {
    mockFetch.mockResolvedValueOnce(makeExpoLikeResponse({ status: 201, body: '{"a":' }));
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ statusCode: 201, message: 'Invalid JSON response body' });
  });
});

describe('10 FR3: expo/fetch FetchError rejection → NetworkError (message preserved)', () => {
  it.each([
    ['apiGet', () => apiGet(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false)],
    ['apiPut', () => apiPut(FAKE_PATH, { a: 1 }, FAKE_TOKEN, false)],
    ['mintAuthToken', () => mintAuthToken('u', 'p', false)],
  ] as const)('%s', async (_name, call) => {
    mockFetch.mockRejectedValueOnce(new FetchError('The network connection was lost.'));
    const err: Error = await call().then(
      () => new Error('expected a rejection'),
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(FetchError);
    expect(err.message).toBe('fetch failed: The network connection was lost.');
  });

  it('an aborted request (FetchError "The operation was aborted.") is a NetworkError too', async () => {
    mockFetch.mockRejectedValueOnce(new FetchError('The operation was aborted.'));
    const err: Error = await apiGet(FAKE_PATH, FAKE_PARAMS, FAKE_TOKEN, false).then(
      () => new Error('expected a rejection'),
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.message).toBe('fetch failed: The operation was aborted.');
  });
});
