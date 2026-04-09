// FR2 + FR3 Tests: fetchTimesheet, fetchPayments API functions + useHoursData hook
// TDD red phase — these files do not exist yet

import { fetchTimesheet } from '../../src/api/timesheet';
import { fetchPayments } from '../../src/api/payments';
import type { CrossoverConfig } from '../../src/types/config';

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
      json: async () => timesheetResponse,
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
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // strategy 1 empty
      .mockResolvedValue({ ok: true, json: async () => timesheetResponse });

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
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // strategy 1
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // strategy 2
      .mockResolvedValue({ ok: true, json: async () => timesheetResponse });

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
      .mockResolvedValue({ ok: true, json: async () => timesheetResponse });

    global.fetch = fetchMock as any;

    const result = await fetchTimesheet(baseConfig, 'test-token');
    expect(result).toEqual(timesheetResponse[0]);
  });

  it('uses getWeekStartDate(true) for the date param (UTC-based Monday)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => timesheetResponse,
    });
    global.fetch = fetchMock as any;

    await fetchTimesheet(baseConfig, 'test-token');

    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    // On 2026-03-04 UTC, Monday of that week is 2026-03-02
    expect(firstCallUrl).toContain('date=2026-03-02');
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
      json: async () => paymentsResponse,
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
      json: async () => paymentsResponse,
    });
    global.fetch = fetchMock as any;

    await fetchPayments(baseConfig, 'test-token');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('from=2026-03-02');
  });

  it('formats to date as Sunday 2026-03-08 for week containing 2026-03-04', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => paymentsResponse,
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
      json: async () => paymentsResponse,
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
      json: async () => paymentsResponse,
    });
    global.fetch = fetchMock as any;

    const result = await fetchPayments(baseConfig, 'test-token');
    expect(result).toEqual(paymentsResponse[0]);
  });

  it('returns null when payments array is empty', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    global.fetch = fetchMock as any;

    const result = await fetchPayments(baseConfig, 'test-token');
    expect(result).toBeNull();
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
