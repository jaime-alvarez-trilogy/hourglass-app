// Spec 03 (error-envelope): structured error envelope on ApiError / AuthError
//
// Covers FR1–FR4: error classes accept an optional envelope; handleStatus
// reads the response body and populates envelope fields defensively.

import { AuthError, ApiError } from '../src/api/errors';
import { apiGet, apiPut, getAuthToken } from '../src/api/client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// FR1 — ApiError constructor
// ---------------------------------------------------------------------------

describe('FR1: ApiError with envelope', () => {
  it('populates errorCode, errorType, serverText from envelope', () => {
    const err = new ApiError(400, undefined, {
      errorCode: 'CROS-0005',
      type: 'ERROR',
      text: 'bad teamId',
    });
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('CROS-0005');
    expect(err.errorType).toBe('ERROR');
    expect(err.serverText).toBe('bad teamId');
  });

  it('leaves envelope fields undefined when no envelope passed', () => {
    const err = new ApiError(500);
    expect(err.statusCode).toBe(500);
    expect(err.errorCode).toBeUndefined();
    expect(err.errorType).toBeUndefined();
    expect(err.serverText).toBeUndefined();
  });

  it('is still instanceof ApiError and Error with envelope', () => {
    const err = new ApiError(400, undefined, { errorCode: 'CROS-0005' });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// FR2 — AuthError constructor
// ---------------------------------------------------------------------------

describe('FR2: AuthError with envelope', () => {
  it('populates errorCode and serverText from envelope', () => {
    const err = new AuthError(403, undefined, {
      errorCode: 'CROS-0002',
      text: 'forbidden',
    });
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe('CROS-0002');
    expect(err.serverText).toBe('forbidden');
  });

  it('leaves envelope fields undefined when no envelope passed', () => {
    const err = new AuthError(401);
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBeUndefined();
    expect(err.serverText).toBeUndefined();
  });

  it('is still instanceof AuthError and Error with envelope', () => {
    const err = new AuthError(401, undefined, { errorCode: 'CROS-9999' });
    expect(err).toBeInstanceOf(AuthError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// FR3 — handleStatus reads envelope from response body
// ---------------------------------------------------------------------------

describe('FR3: handleStatus parses envelope from response body', () => {
  it('apiGet on 400 with envelope JSON → ApiError with envelope fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          errorCode: 'CROS-0005',
          type: 'ERROR',
          httpStatus: 400,
          text: '"teamId" is not a valid value',
        }),
    });
    const err = await apiGet('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('CROS-0005');
    expect(err.errorType).toBe('ERROR');
    expect(err.serverText).toBe('"teamId" is not a valid value');
  });

  it('apiGet on 403 with envelope JSON → AuthError with envelope fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          errorCode: 'CROS-0002',
          type: 'ERROR',
          httpStatus: 403,
          text: 'Access denied',
        }),
    });
    const err = await apiGet('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe('CROS-0002');
    expect(err.serverText).toBe('Access denied');
  });

  it('apiPut on 400 with envelope JSON → ApiError with envelope fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          errorCode: 'CROS-0400',
          type: 'ERROR',
          text: 'Internal ref DDF88BDA',
        }),
    });
    const err = await apiPut('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('CROS-0400');
    expect(err.serverText).toBe('Internal ref DDF88BDA');
  });

  it('getAuthToken on 403 with envelope JSON → AuthError with envelope fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          errorCode: 'CROS-0002',
          type: 'ERROR',
          text: 'forbidden',
        }),
    });
    const err = await getAuthToken('u', 'p', false).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe('CROS-0002');
    expect(err.serverText).toBe('forbidden');
  });
});

// ---------------------------------------------------------------------------
// FR4 — Defensive parser
// ---------------------------------------------------------------------------

describe('FR4: handleStatus is defensive on bad bodies', () => {
  it('HTML 500 body → ApiError(500) with envelope fields undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () =>
        '<!doctype html><html><head><title>HTTP Status 500</title></head></html>',
    });
    const err = await apiGet('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(500);
    expect(err.errorCode).toBeUndefined();
    expect(err.errorType).toBeUndefined();
    expect(err.serverText).toBeUndefined();
  });

  it('empty body → ApiError(502) with envelope fields undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => '',
    });
    const err = await apiGet('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(502);
    expect(err.errorCode).toBeUndefined();
    expect(err.serverText).toBeUndefined();
  });

  it('JSON body without errorCode → ApiError(422) with envelope fields undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ message: 'oops', detail: 'thing' }),
    });
    const err = await apiGet('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(422);
    expect(err.errorCode).toBeUndefined();
    expect(err.serverText).toBeUndefined();
  });

  it('truncated JSON body → ApiError(400) with envelope fields undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"errorCode":',
    });
    const err = await apiGet('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBeUndefined();
  });

  it('JSON with empty-string errorCode → no envelope', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ errorCode: '', type: 'ERROR', text: 'x' }),
    });
    const err = await apiGet('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBeUndefined();
    expect(err.errorType).toBeUndefined();
    expect(err.serverText).toBeUndefined();
  });

  it('JSON array body (not an object) → no envelope', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '[1,2,3]',
    });
    const err = await apiGet('/x', {}, 'tok', false).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBeUndefined();
  });
});
