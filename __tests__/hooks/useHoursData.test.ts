// FR2 + FR3 Tests: fetchTimesheet, fetchPayments API functions + useHoursData hook
// TDD red phase — these files do not exist yet
//
// Extended by durable-data 03-keep-last-good FR1 (DD3.1-DD3.5): a failed request
// rejects instead of resolving `null`, which calculateHours would turn into 0 h / $0.
// `null` now means "the server answered, and there is no row". These cases drive the
// real apiGet through `global.fetch`: a `TypeError` rejection becomes a NetworkError,
// `{ ok: false, status: 500 }` an ApiError(500). The whole-hook proof (hours_cache kept)
// is in useHoursData.keep-last-good.test.ts.

import { QueryClient } from '@tanstack/react-query';
import { fetchTimesheet } from '../../src/api/timesheet';
import { fetchPayments } from '../../src/api/payments';
import { ApiError, AuthError, NetworkError } from '../../src/api/errors';
import type { PaymentsResponse, TimesheetResponse } from '../../src/lib/hours';
import type { CrossoverConfig } from '../../src/types/config';

/** Local Monday of `d` as YYYY-MM-DD, from local Date methods only. */
function localMonday(d: Date): string {
  const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseConfig: CrossoverConfig = {
  userId: '2362707',
  managerId: '2372227',
  primaryTeamId: '4584',
  fullName: 'Test User',
  teams: [],
  hourlyRate: 25,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  assignmentId: '79996',
  lastRoleCheck: new Date().toISOString(),
  debugMode: false,
  setupComplete: true,
  setupDate: new Date().toISOString(),
};

const timesheetResponse = [
  {
    totalHours: 20,
    averageHoursPerDay: 4,
    stats: [{ date: '2026-03-02', hours: 4 }],
  },
];

const paymentsResponse = [
  {
    paidHours: 20,
    workedHours: 20,
    amount: 500,
  },
];

// ─── fetchTimesheet ───────────────────────────────────────────────────────────

describe('fetchTimesheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calls strategy 1 (full params: date, managerId, period, teamId, userId) first', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(timesheetResponse),
    });
    global.fetch = fetchMock as any;

    await fetchTimesheet(baseConfig, 'test-token');

    const firstCall = fetchMock.mock.calls[0][0] as string;
    expect(firstCall).toContain('managerId=');
    expect(firstCall).toContain('teamId=');
    expect(firstCall).toContain('userId=');
    expect(firstCall).toContain('period=WEEK');
    expect(firstCall).toContain('date=');
  });

  it('falls back to strategy 2 (no teamId) when strategy 1 returns empty array', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => "[]" }) // strategy 1 empty
      .mockResolvedValue({ ok: true, text: async () => JSON.stringify(timesheetResponse) });

    global.fetch = fetchMock as any;

    const result = await fetchTimesheet(baseConfig, 'test-token');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1][0] as string;
    expect(secondCall).not.toContain('teamId=');
    expect(result).toEqual(timesheetResponse[0]);
  });

  it('falls back to strategy 3 (minimal: date+period+userId) when strategy 2 returns empty', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => "[]" }) // strategy 1
      .mockResolvedValueOnce({ ok: true, text: async () => "[]" }) // strategy 2
      .mockResolvedValue({ ok: true, text: async () => JSON.stringify(timesheetResponse) });

    global.fetch = fetchMock as any;

    const result = await fetchTimesheet(baseConfig, 'test-token');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdCall = fetchMock.mock.calls[2][0] as string;
    expect(thirdCall).not.toContain('managerId=');
    expect(thirdCall).not.toContain('teamId=');
    expect(thirdCall).toContain('userId=');
    expect(result).toEqual(timesheetResponse[0]);
  });

  it('returns first non-empty array response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: async () => JSON.stringify(timesheetResponse) });

    global.fetch = fetchMock as any;

    const result = await fetchTimesheet(baseConfig, 'test-token');
    expect(result).toEqual(timesheetResponse[0]);
  });

  it('uses getWeekStartDate(false) for the date param (local Monday)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(timesheetResponse),
    });
    global.fetch = fetchMock as any;

    await fetchTimesheet(baseConfig, 'test-token');

    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    // Displayed hours follow the local week: the local Monday of the mocked clock
    expect(firstCallUrl).toContain(`date=${localMonday(new Date())}`);
  });

  it('asks for the local week when UTC has already moved on (Sunday evening west of UTC)', async () => {
    // 02:00 UTC on Monday 9 Mar: still Sunday 8 Mar anywhere west of UTC-2, so the local
    // Monday is 2 Mar there while the UTC Monday is 9 Mar. Expectation built with local
    // Date methods, so it holds in any machine time zone.
    jest.setSystemTime(new Date('2026-03-09T02:00:00.000Z'));
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(timesheetResponse),
    });
    global.fetch = fetchMock as any;

    await fetchTimesheet(baseConfig, 'test-token');

    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain(`date=${localMonday(new Date())}`);
  });

  it('throws on 401 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as any;

    await expect(fetchTimesheet(baseConfig, 'test-token')).rejects.toThrow();
  });

  it('throws on 403 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }) as any;

    await expect(fetchTimesheet(baseConfig, 'test-token')).rejects.toThrow();
  });
});

// ─── fetchPayments ────────────────────────────────────────────────────────────

describe('fetchPayments', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calls correct endpoint with from/to UTC dates', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(paymentsResponse),
    });
    global.fetch = fetchMock as any;

    await fetchPayments(baseConfig, 'test-token');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/v3/users/current/payments');
    expect(url).toContain('from=');
    expect(url).toContain('to=');
  });

  it('formats from date as Monday 2026-03-02 for week containing 2026-03-04', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(paymentsResponse),
    });
    global.fetch = fetchMock as any;

    await fetchPayments(baseConfig, 'test-token');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('from=2026-03-02');
  });

  it('formats to date as Sunday 2026-03-08 for week containing 2026-03-04', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(paymentsResponse),
    });
    global.fetch = fetchMock as any;

    await fetchPayments(baseConfig, 'test-token');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('to=2026-03-08');
  });

  it('does NOT use toISOString() for date formatting (UTC-safe)', async () => {
    // We verify this indirectly: the dates must be correct UTC Monday/Sunday
    // even when the test runs in a non-UTC timezone.
    // Fixed time = 2026-03-04T12:00:00Z, Monday = 2026-03-02, Sunday = 2026-03-08
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(paymentsResponse),
    });
    global.fetch = fetchMock as any;

    await fetchPayments(baseConfig, 'test-token');

    const url = fetchMock.mock.calls[0][0] as string;
    // If it used toISOString() in EST (-5), Monday would shift to 2026-03-01
    expect(url).toContain('from=2026-03-02');
  });

  it('throws on 401 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as any;

    await expect(fetchPayments(baseConfig, 'test-token')).rejects.toThrow();
  });

  it('throws on 403 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }) as any;

    await expect(fetchPayments(baseConfig, 'test-token')).rejects.toThrow();
  });

  it('returns the first payment record from the array', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(paymentsResponse),
    });
    global.fetch = fetchMock as any;

    const result = await fetchPayments(baseConfig, 'test-token');
    expect(result).toEqual(paymentsResponse[0]);
  });

  it('returns null when payments array is empty', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "[]",
    });
    global.fetch = fetchMock as any;

    const result = await fetchPayments(baseConfig, 'test-token');
    expect(result).toBeNull();
  });
});

// ─── durable-data 03 FR1: a failure rejects, `null` only for a real empty answer ──

const TIMESHEET_ROW: TimesheetResponse = {
  totalHours: 32.5,
  averageHoursPerDay: 6.5,
  stats: [
    { date: '2026-03-02', hours: 8 },
    { date: '2026-03-03', hours: 7.5 },
    { date: '2026-03-04', hours: 6 },
  ],
};

const PAYMENT_ROW: PaymentsResponse = {
  paidHours: 32.5,
  workedHours: 32.5,
  overtimeHours: 0,
  approvedOvertimeHours: 0,
  manualMinutes: 0,
  amount: 812.5,
};

/** `fetch` itself rejects (offline, DNS, TLS); apiGet maps it to NetworkError. */
const offline = () => Promise.reject(new TypeError('Network request failed'));
/** A non-auth HTTP failure with a blank body; apiGet maps it to ApiError(status). */
const httpError = (status: number) => ({ ok: false, status, text: async () => '' });
const jsonOk = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
/** A 200 with a zero-byte body (parseBody → undefined). */
const blankOk = () => ({ ok: true, status: 200, text: async () => '' });

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

function installFetch(...responses: (() => unknown)[]): jest.Mock {
  const fetchMock = jest.fn();
  for (const respond of responses) fetchMock.mockImplementationOnce(async () => respond());
  global.fetch = fetchMock as any;
  return fetchMock;
}

describe('fetchTimesheet — durable-data 03 FR1: keep last good', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('DD3.1 — every strategy fails with a NetworkError → rejects with it after exactly 3 fetches', async () => {
    const fetchMock = installFetch(offline, offline, offline);

    const err = await rejectionOf(fetchTimesheet(baseConfig, 'test-token'));

    expect(err).toBeInstanceOf(NetworkError);
    expect((err as Error).message).toBe('Network request failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // All three parameter shapes were tried before giving up.
    expect(new Set(fetchMock.mock.calls.map(([url]) => url)).size).toBe(3);
  });

  it('DD3.2 — mixed failures (500, network, 503) → rejects with the last one, ApiError 503', async () => {
    const fetchMock = installFetch(() => httpError(500), offline, () => httpError(503));

    const err = await rejectionOf(fetchTimesheet(baseConfig, 'test-token'));

    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(NetworkError);
    expect((err as ApiError).statusCode).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('DD3.2 — a 200 HTML page on every strategy (captive portal) rejects instead of reading as 0 h', async () => {
    const portal = () => ({ ok: true, status: 200, text: async () => '<html><body>Sign in to Wi-Fi</body></html>' });
    installFetch(portal, portal, portal);

    const err = await rejectionOf(fetchTimesheet(baseConfig, 'test-token'));

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(200);
  });

  it('DD3.3 — strategy 1 fails with 500, strategies 2 and 3 answer [] → null (a real empty week)', async () => {
    const fetchMock = installFetch(() => httpError(500), () => jsonOk([]), () => jsonOk([]));

    await expect(fetchTimesheet(baseConfig, 'test-token')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('DD3.3 — strategies 1 and 2 fail, strategy 3 answers [row] → row', async () => {
    const fetchMock = installFetch(() => httpError(500), offline, () => jsonOk([TIMESHEET_ROW]));

    await expect(fetchTimesheet(baseConfig, 'test-token')).resolves.toEqual(TIMESHEET_ROW);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('DD3.3 — all three strategies answer with an empty body → null', async () => {
    const fetchMock = installFetch(blankOk, blankOk, blankOk);

    await expect(fetchTimesheet(baseConfig, 'test-token')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('DD3.3 — a non-array JSON answer counts as a response: 503, 503, {} → null', async () => {
    installFetch(() => httpError(503), () => httpError(503), () => jsonOk({}));

    await expect(fetchTimesheet(baseConfig, 'test-token')).resolves.toBeNull();
  });

  it('DD3.4 — a 401 on strategy 1 → rejects AuthError after exactly 1 fetch', async () => {
    const fetchMock = installFetch(() => httpError(401), () => jsonOk([TIMESHEET_ROW]));

    const err = await rejectionOf(fetchTimesheet(baseConfig, 'test-token'));

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).statusCode).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('DD3.4 — a 401 after an outage still rejects AuthError at once (not the earlier NetworkError)', async () => {
    const fetchMock = installFetch(offline, () => httpError(401), () => jsonOk([TIMESHEET_ROW]));

    const err = await rejectionOf(fetchTimesheet(baseConfig, 'test-token'));

    expect(err).toBeInstanceOf(AuthError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchPayments — durable-data 03 FR1: keep last good', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('DD3.5 — a NetworkError rejects (no longer resolves null)', async () => {
    const fetchMock = installFetch(offline);

    const err = await rejectionOf(fetchPayments(baseConfig, 'test-token'));

    expect(err).toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('DD3.5 — an ApiError(500) rejects (no longer resolves null)', async () => {
    installFetch(() => httpError(500));

    const err = await rejectionOf(fetchPayments(baseConfig, 'test-token'));

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(500);
  });

  it('DD3.5 — an empty body → null', async () => {
    installFetch(blankOk);

    await expect(fetchPayments(baseConfig, 'test-token')).resolves.toBeNull();
  });

  it('DD3.5 — [row] → row', async () => {
    installFetch(() => jsonOk([PAYMENT_ROW]));

    await expect(fetchPayments(baseConfig, 'test-token')).resolves.toEqual(PAYMENT_ROW);
  });
});

// The query-level half of the proof: under a real QueryClient, the rejection leaves the
// last good row in place (status 'error'), where a resolved `null` would replace it.
describe('timesheet / payments queries — durable-data 03 FR1: a failed refresh keeps the last good row', () => {
  const WEEK = '2026-03-02';
  let client: QueryClient;

  beforeEach(() => {
    // Only Date is faked; TanStack's timers and microtasks stay real.
    jest.useFakeTimers({
      now: new Date('2026-03-04T12:00:00.000Z'),
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
        'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
        'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    client.clear();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('DD3.1 — the timesheet query errors and keeps the seeded row when every strategy fails', async () => {
    const key = ['timesheet', WEEK, baseConfig.userId];
    client.setQueryData(key, TIMESHEET_ROW);
    installFetch(offline, offline, offline);

    await client
      .fetchQuery({ queryKey: key, queryFn: () => fetchTimesheet(baseConfig, 'test-token') })
      .catch(() => {});

    expect(client.getQueryState(key)?.status).toBe('error');
    expect(client.getQueryState(key)?.error).toBeInstanceOf(NetworkError);
    expect(client.getQueryData(key)).toEqual(TIMESHEET_ROW);
  });

  it('DD3.5 — the payments query errors and keeps the seeded row when the request fails', async () => {
    const key = ['payments', WEEK, baseConfig.userId];
    client.setQueryData(key, PAYMENT_ROW);
    installFetch(() => httpError(502));

    await client
      .fetchQuery({ queryKey: key, queryFn: () => fetchPayments(baseConfig, 'test-token') })
      .catch(() => {});

    expect(client.getQueryState(key)?.status).toBe('error');
    expect(client.getQueryState(key)?.error).toBeInstanceOf(ApiError);
    expect(client.getQueryData(key)).toEqual(PAYMENT_ROW);
  });
});

// ─── useHoursData (FR3) — integration-level hook tests ───────────────────────
// Note: Hook tests are light here due to React Query needing a Provider.
// Full hook tests would use renderHook + QueryClientProvider.
// These tests verify the module exists and exports the expected shape.

describe('useHoursData exports', () => {
  it('exports useHoursData from src/hooks/useHoursData', () => {
    // This will fail with "Cannot find module" in red phase — expected
    const mod = require('../../src/hooks/useHoursData');
    expect(typeof mod.useHoursData).toBe('function');
  });

  it('exports useTimesheet from src/hooks/useTimesheet', () => {
    const mod = require('../../src/hooks/useTimesheet');
    expect(typeof mod.useTimesheet).toBe('function');
  });

  it('exports usePayments from src/hooks/usePayments', () => {
    const mod = require('../../src/hooks/usePayments');
    expect(typeof mod.usePayments).toBe('function');
  });
});
