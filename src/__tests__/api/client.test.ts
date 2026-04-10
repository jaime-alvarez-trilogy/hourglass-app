/**
 * FR1, FR2: API Client network error handling
 * Tests for src/api/client.ts: apiGet, apiPut
 *
 * Verifies that fetch() throwing a TypeError (offline) results in
 * NetworkError being thrown — not the raw TypeError.
 */

// Mock fetch globally before importing the module under test
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock config dependency
jest.mock('../../store/config', () => ({
  getApiBase: (useQA: boolean) => (useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com'),
}));

import { apiGet, apiPut } from '../../api/client';
import { NetworkError, AuthError, ApiError } from '../../api/errors';

const FAKE_TOKEN = 'test-token-abc';
const FAKE_PATH = '/api/v3/users/current';
const FAKE_PARAMS: Record<string, string> = {};

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'error' }),
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
