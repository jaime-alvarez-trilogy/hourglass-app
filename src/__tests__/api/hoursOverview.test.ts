// 1.2 WorkSmart dashboard parity: fetchHoursOverview / fetchPayDays (src/api/hoursOverview.ts).
//
// `../../api/client` is factory-mocked (the convention of team.test.ts and
// wrappers-creds.test.ts), so the exact apiGet arguments are visible: the path with the
// encoded assignmentId, the `date` param, the token, useQA and the trailing creds (an
// explicit `undefined` without them). A 200 body that does not parse rejects with
// ApiError(UNEXPECTED_SHAPE) — never a resolved empty week — and is not retried.

import { apiGet } from '../../api/client';
import { fetchHoursOverview, fetchPayDays, UNEXPECTED_SHAPE } from '../../api/hoursOverview';
import { ApiError, AuthError, NetworkError, isRetryableError } from '../../api/errors';
import { normalizeHoursOverview, normalizePayDays } from '../../lib/hoursOverview';
import { HOURS_OVERVIEW_RAW, PAY_DAYS_RAW } from '../../__fixtures__/hoursOverview';
import type { AuthCreds } from '../../api/authCreds';

jest.mock('../../api/client', () => ({
  apiGet: jest.fn(),
}));

const mockApiGet = apiGet as jest.Mock;

const TOKEN = 'token-abc';
const CREDS: AuthCreds = { username: 'worker@example.com', password: 's3cret', useQA: false };

/** The rejection value, or a test failure naming what the promise resolved to. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  let value: unknown;
  try {
    value = await promise;
  } catch (e) {
    return e;
  }
  throw new Error(`expected a rejection, but it resolved ${JSON.stringify(value)}`);
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('fetchHoursOverview', () => {
  it('GETs /api/v3/assignments/{assignmentId}/hours-overview with the date param, token, env and creds', async () => {
    mockApiGet.mockResolvedValue(HOURS_OVERVIEW_RAW);

    await fetchHoursOverview('79996', '2026-10-25', TOKEN, false, CREDS);

    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v3/assignments/79996/hours-overview',
      { date: '2026-10-25' },
      TOKEN,
      false,
      CREDS,
    );
    expect(mockApiGet.mock.calls[0][4]).toBe(CREDS);
  });

  it('URI-encodes the assignmentId', async () => {
    mockApiGet.mockResolvedValue(HOURS_OVERVIEW_RAW);

    await fetchHoursOverview('79 99/6?x', '2026-10-25', TOKEN, true, CREDS);

    expect(mockApiGet.mock.calls[0][0]).toBe('/api/v3/assignments/79%2099%2F6%3Fx/hours-overview');
    expect(mockApiGet.mock.calls[0][3]).toBe(true);
  });

  it('passes an explicit trailing undefined without creds', async () => {
    mockApiGet.mockResolvedValue(HOURS_OVERVIEW_RAW);

    await fetchHoursOverview('79996', '2026-10-25', TOKEN, false);

    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v3/assignments/79996/hours-overview',
      { date: '2026-10-25' },
      TOKEN,
      false,
      undefined,
    );
  });

  it('resolves the parsed overview', async () => {
    mockApiGet.mockResolvedValue(HOURS_OVERVIEW_RAW);

    const result = await fetchHoursOverview('79996', '2026-10-25', TOKEN, false, CREDS);

    expect(result).toEqual(normalizeHoursOverview(HOURS_OVERVIEW_RAW));
    expect(result.weekStart).toBe('2026-10-19');
    expect(result.weeks).toHaveLength(8);
  });

  it.each([
    ['an empty body', undefined],
    ['null', null],
    ['an empty object', {}],
    ['an array', []],
    ['a body without weekStart', { ...HOURS_OVERVIEW_RAW, weekStart: undefined }],
    ['a string', 'OK'],
  ])('rejects ApiError(UNEXPECTED_SHAPE) on %s', async (_label, body) => {
    mockApiGet.mockResolvedValue(body);

    const err = await rejectionOf(fetchHoursOverview('79996', '2026-10-25', TOKEN, false, CREDS));

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe(UNEXPECTED_SHAPE);
    expect((err as ApiError).statusCode).toBe(200);
    // A shape failure is not an outage: the hooks' shouldRetryOnce does not retry it.
    expect(isRetryableError(err)).toBe(false);
  });

  it.each([
    ['AuthError(401)', () => new AuthError(401)],
    ['NetworkError', () => new NetworkError('Network request failed')],
    ['ApiError(500)', () => new ApiError(500)],
  ])('lets a %s from apiGet propagate unchanged', async (_label, make) => {
    const thrown = make();
    mockApiGet.mockRejectedValue(thrown);

    const err = await rejectionOf(fetchHoursOverview('79996', '2026-10-25', TOKEN, false, CREDS));

    expect(err).toBe(thrown);
  });
});

describe('fetchPayDays', () => {
  it('GETs /api/v3/users/current/pay-days with no params, token, env and creds', async () => {
    mockApiGet.mockResolvedValue(PAY_DAYS_RAW);

    await fetchPayDays(TOKEN, true, CREDS);

    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith('/api/v3/users/current/pay-days', {}, TOKEN, true, CREDS);
    expect(mockApiGet.mock.calls[0][4]).toBe(CREDS);
  });

  it('passes an explicit trailing undefined without creds', async () => {
    mockApiGet.mockResolvedValue(PAY_DAYS_RAW);

    await fetchPayDays(TOKEN, false);

    expect(mockApiGet).toHaveBeenCalledWith('/api/v3/users/current/pay-days', {}, TOKEN, false, undefined);
  });

  it('resolves the parsed cards', async () => {
    mockApiGet.mockResolvedValue(PAY_DAYS_RAW);

    const result = await fetchPayDays(TOKEN, false, CREDS);

    expect(result).toEqual(normalizePayDays(PAY_DAYS_RAW));
    expect(result.cards.map((c) => c.state)).toEqual(['PAID', 'NEXT', 'LATER']);
  });

  it('resolves an empty cards array (a valid answer, not a failure)', async () => {
    mockApiGet.mockResolvedValue({ today: '2026-10-25', cards: [] });

    await expect(fetchPayDays(TOKEN, false, CREDS)).resolves.toEqual({ today: '2026-10-25', cards: [] });
  });

  it.each([
    ['an empty body', undefined],
    ['an empty object', {}],
    ['an array', [PAY_DAYS_RAW]],
    ['cards not an array', { cards: 'none' }],
  ])('rejects ApiError(UNEXPECTED_SHAPE) on %s', async (_label, body) => {
    mockApiGet.mockResolvedValue(body);

    const err = await rejectionOf(fetchPayDays(TOKEN, false, CREDS));

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe(UNEXPECTED_SHAPE);
    expect((err as ApiError).statusCode).toBe(200);
  });

  it.each([
    ['AuthError(403)', () => new AuthError(403)],
    ['NetworkError', () => new NetworkError('Network request failed')],
    ['ApiError(503)', () => new ApiError(503)],
  ])('lets a %s from apiGet propagate unchanged', async (_label, make) => {
    const thrown = make();
    mockApiGet.mockRejectedValue(thrown);

    await expect(fetchPayDays(TOKEN, false, CREDS)).rejects.toBe(thrown);
  });
});
