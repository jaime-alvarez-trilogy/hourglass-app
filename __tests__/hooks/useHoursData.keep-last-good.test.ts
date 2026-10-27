/**
 * durable-data 03-keep-last-good FR1 (DD3.8-DD3.10): hours and earnings keep the last
 * good values through a failed refresh.
 *
 * The whole useHoursData hook is rendered (react-test-renderer in a real
 * QueryClientProvider, the setupHook pattern from __tests__/use-ai-data.test.ts), with
 * the real useConfig, useTimesheet, usePayments, fetchTimesheet, fetchPayments and
 * calculateHours. Only the edges are mocked: `apiGet` / `getAuthToken`, the config and
 * credential store, and AsyncStorage (the in-memory __mocks__). The QueryClient sets
 * `retryDelay: 0` but no `retry`, so the hooks' own retry rule (`shouldRetryOnce`: one
 * retry for an outage) runs as in production.
 *
 * A failed refresh must never reach 'hours_cache' (the widget and the cold-start hero
 * read it); a genuinely empty week (the server answered `[]`) must still write zeros.
 *
 * 1.2 WorkSmart dashboard parity: useHoursData also reads useHoursOverview. It is mocked
 * here (no overview by default, so the cases above see the timesheet + payments path
 * alone); the overview cases at the end set its result, and one runs the real hook
 * through the routed apiGet. Displayed hours follow the local week (the timesheet), so
 * the overview (UTC days) only adds the limit, the per-day manual split and the pay-week
 * breakdown, and is never live data on its own.
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, getAuthToken } from '../../src/api/client';
import { loadConfig, loadCredentials } from '../../src/store/config';
import { NetworkError } from '../../src/api/errors';
import { useHoursData } from '../../src/hooks/useHoursData';
import { useHoursOverview } from '../../src/hooks/useHoursOverview';
import { normalizeHoursOverview, type HoursOverview } from '../../src/lib/hoursOverview';
import { HOURS_OVERVIEW_RAW } from '../../src/__fixtures__/hoursOverview';
import type { HoursData, PaymentsResponse, TimesheetResponse } from '../../src/lib/hours';
import type { CrossoverConfig, Credentials } from '../../src/types/config';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/api/client', () => ({
  apiGet: jest.fn(),
  getAuthToken: jest.fn(),
}));

jest.mock('../../src/store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
  getApiBase: jest.fn((useQA: boolean) =>
    useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com'
  ),
}));

jest.mock('../../src/hooks/useHoursOverview', () => ({
  ...jest.requireActual('../../src/hooks/useHoursOverview'),
  useHoursOverview: jest.fn(),
}));

const actualUseHoursOverview: typeof useHoursOverview = jest.requireActual(
  '../../src/hooks/useHoursOverview',
).useHoursOverview;

const mockApiGet = apiGet as jest.Mock;
const mockGetAuthToken = getAuthToken as jest.Mock;
const mockLoadConfig = loadConfig as jest.Mock;
const mockLoadCredentials = loadCredentials as jest.Mock;
const mockUseHoursOverview = useHoursOverview as jest.Mock;
const mockOverviewRefetch = jest.fn();
const mockStorage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  _reset: () => void;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'hours_cache';
const TIMESHEET_PATH = '/api/timetracking/timesheets';
const PAYMENTS_PATH = '/api/v3/users/current/payments';
const OVERVIEW_PATH = '/api/v3/assignments/79996/hours-overview';

// Wednesday 2026-10-21, midday UTC: the week key (Monday 2026-10-19) is the same in
// every host time zone.
const NOW = new Date('2026-10-21T12:00:00.000Z');

const CONFIG: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Jane Doe',
  managerId: '2372227',
  primaryTeamId: '4584',
  assignmentId: '79996',
  hourlyRate: 50,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  teams: [],
  lastRoleCheck: '2026-10-19T00:00:00.000Z',
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
  debugMode: false,
};

const CREDS: Credentials = { username: 'worker@example.com', password: 's3cret' };

/** A last good week on disk: 32.5 h, $1,625. */
const SEEDED_HOURS: HoursData = {
  total: 32.5,
  average: 6.5,
  today: 6,
  daily: [
    { date: '2026-10-19', hours: 8, isToday: false },
    { date: '2026-10-20', hours: 7.5, isToday: false },
    { date: '2026-10-21', hours: 6, isToday: true },
  ],
  weeklyEarnings: 1625,
  todayEarnings: 300,
  hoursRemaining: 7.5,
  overtimeHours: 0,
  timeRemaining: 4 * 24 * 3600 * 1000,
  deadline: new Date('2026-10-25T23:59:59.000Z'),
};

const TIMESHEET_ROW: TimesheetResponse = {
  totalHours: 20,
  averageHoursPerDay: 10,
  stats: [
    { date: '2026-10-19', hours: 10 },
    { date: '2026-10-20', hours: 10 },
  ],
};

const PAYMENT_ROW: PaymentsResponse = {
  paidHours: 20,
  workedHours: 20,
  overtimeHours: 0,
  approvedOvertimeHours: 0,
  manualMinutes: 0,
  amount: 1000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Responder = () => Promise<unknown>;

/** Routes apiGet by path: the 3 timesheet strategies share one path. */
function serve(timesheet: Responder, payments: Responder, overview?: Responder) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === TIMESHEET_PATH) return timesheet();
    if (path === PAYMENTS_PATH) return payments();
    if (path === OVERVIEW_PATH && overview) return overview();
    return Promise.reject(new Error(`unexpected apiGet ${path}`));
  });
}

/** What the mocked useHoursOverview returns: its data, or a failure with none. */
function overviewResult(data: HoursOverview | undefined, isError = false) {
  return {
    data,
    isError,
    isLoading: false,
    error: isError ? new Error('overview failed') : null,
    refetch: mockOverviewRefetch,
  };
}

const outage: Responder = () => Promise.reject(new NetworkError('Network request failed'));

const callsTo = (path: string) => mockApiGet.mock.calls.filter(([p]) => p === path).length;

const hoursCacheWrites = () => mockStorage.setItem.mock.calls.filter(([k]) => k === CACHE_KEY);

async function seedHoursCache(data: HoursData): Promise<string> {
  const raw = JSON.stringify({ data, cachedAt: '2026-10-21T08:00:00.000Z' });
  await AsyncStorage.setItem(CACHE_KEY, raw);
  mockStorage.setItem.mockClear();
  return raw;
}

async function tick() {
  await act(async () => {
    await new Promise<void>((res) => setTimeout(res, 0));
  });
}

/**
 * Flushes until `done()` holds (bounded), then a few more turns so the write effect and
 * AsyncStorage calls that follow the last query update have run.
 */
async function settle(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await tick();
  for (let i = 0; i < 5; i++) await tick();
}

// Unmounted in afterEach so no tree leaks state updates into the next test.
const cleanups: (() => void)[] = [];

function setupHook() {
  const queryClient = new QueryClient({
    // No `retry` here: the hooks' own rule must be the one that runs.
    defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } },
  });
  let current!: ReturnType<typeof useHoursData>;
  const Probe = () => {
    current = useHoursData();
    return null;
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Probe)),
    );
  });
  cleanups.push(() => {
    act(() => {
      renderer.unmount();
    });
    queryClient.clear();
  });
  /** True once a request has gone out and no query is still fetching (retries included). */
  const idle = () => mockApiGet.mock.calls.length > 0 && queryClient.isFetching() === 0;
  return { get: () => current, idle };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Only Date is faked; timers and microtasks stay real for AsyncStorage and TanStack.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
      'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
      'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    ],
  });
  mockStorage._reset();
  mockLoadConfig.mockResolvedValue(CONFIG);
  mockLoadCredentials.mockResolvedValue(CREDS);
  mockGetAuthToken.mockResolvedValue('token-abc');
  mockUseHoursOverview.mockReturnValue(overviewResult(undefined));
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  jest.useRealTimers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('durable-data 03 FR1: useHoursData keeps the last good hours and earnings', () => {
  it('DD3.8 — an outage on every request leaves hours_cache byte-identical and serves its total', async () => {
    const seeded = await seedHoursCache(SEEDED_HOURS);
    serve(outage, outage);

    const { get, idle } = setupHook();
    await settle(idle);

    expect(await AsyncStorage.getItem(CACHE_KEY)).toBe(seeded);
    expect(hoursCacheWrites()).toEqual([]);

    expect(get().data?.total).toBe(32.5);
    expect(get().data?.weeklyEarnings).toBe(1625);
    expect(get().isStale).toBe(true);
    expect(get().error).toBeNull();
    expect(get().isLoading).toBe(false);

    // One retry for an outage: 3 strategies × 2 attempts, and 2 payments attempts.
    expect(callsTo(TIMESHEET_PATH)).toBe(6);
    expect(callsTo(PAYMENTS_PATH)).toBe(2);
  });

  it('DD3.9 — after a good run, a failed refetch keeps hours_cache and the last good total', async () => {
    serve(
      () => Promise.resolve([TIMESHEET_ROW]),
      () => Promise.resolve([PAYMENT_ROW]),
    );

    const { get, idle } = setupHook();
    await settle(idle);

    // The good run is live and written through.
    expect(get().data?.total).toBe(20);
    expect(get().isStale).toBe(false);
    const written = await AsyncStorage.getItem(CACHE_KEY);
    expect(written).not.toBeNull();
    expect(JSON.parse(written!).data.total).toBe(20);
    const writesAfterGoodRun = hoursCacheWrites().length;
    const timesheetCallsAfterGoodRun = callsTo(TIMESHEET_PATH);

    serve(outage, outage);
    await act(async () => {
      get().refetch();
    });
    await settle(() => callsTo(TIMESHEET_PATH) > timesheetCallsAfterGoodRun && idle());

    expect(await AsyncStorage.getItem(CACHE_KEY)).toBe(written);
    expect(hoursCacheWrites()).toHaveLength(writesAfterGoodRun);
    expect(get().data?.total).toBe(20);
    expect(get().data?.weeklyEarnings).toBe(1000);
    expect(get().error).toBeNull();
  });

  it('DD3.10 — a genuinely empty week (every request answers []) still writes truthful zeros', async () => {
    await seedHoursCache(SEEDED_HOURS);
    serve(
      () => Promise.resolve([]),
      () => Promise.resolve([]),
    );

    const { get, idle } = setupHook();
    await settle(idle);

    // Every strategy was asked before concluding there is no row; nothing failed, so no retry.
    expect(callsTo(TIMESHEET_PATH)).toBe(3);
    expect(callsTo(PAYMENTS_PATH)).toBe(1);

    expect(hoursCacheWrites().length).toBeGreaterThan(0);
    const stored = JSON.parse((await AsyncStorage.getItem(CACHE_KEY))!);
    expect(stored.data.total).toBe(0);
    expect(stored.data.weeklyEarnings).toBe(0);

    expect(get().data?.total).toBe(0);
    expect(get().isStale).toBe(false);
    expect(get().error).toBeNull();
  });
});

// ─── durable-data cross-spec review: a payments-only failure ──────────────────

describe('cross-spec review: a payments-only failure still shows fresh timesheet hours', () => {
  it('timesheet succeeds, payments fails (no payments data yet) → live hours from the timesheet, not the stale cache', async () => {
    await seedHoursCache(SEEDED_HOURS);
    serve(() => Promise.resolve([TIMESHEET_ROW]), outage);

    const { get, idle } = setupHook();
    await settle(idle);

    expect(get().data?.total).toBe(20);
    // No payments row: earnings fall back to total × rate, as before spec 03
    expect(get().data?.weeklyEarnings).toBe(20 * CONFIG.hourlyRate);
    expect(get().isStale).toBe(false);
    expect(get().error).toBeNull();
  });
});

// ─── 1.2 WorkSmart dashboard parity: the hours overview ───────────────────────

describe('1.2: useHoursData refines the current week with the hours overview', () => {
  // The live-shaped week of Mon 2026-10-19 (NOW is Wednesday of that week): 2410 billable
  // minutes, capped at 2400 for pay; 130 minutes pending.
  const OVERVIEW = normalizeHoursOverview(HOURS_OVERVIEW_RAW) as HoursOverview;
  const LAST_WEEK = { ...OVERVIEW, weekStart: '2026-10-12' };

  /** Approved fixture minutes starting on host-local `date` (jest runs in the host zone). */
  const approvedMinutesOn = (date: string): number =>
    OVERVIEW.manualEntries
      .filter((e) => {
        const at = new Date(`${e.start}Z`);
        const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000);
        return e.status === 'APPROVED' && local.toISOString().slice(0, 10) === date;
      })
      .reduce((sum, e) => sum + e.durationMinutes, 0);

  const good = () => serve(
    () => Promise.resolve([TIMESHEET_ROW]),
    () => Promise.resolve([PAYMENT_ROW]),
  );

  it('overview present → total and days stay the timesheet\'s; limit, manual split and breakdown from it; written to hours_cache', async () => {
    mockUseHoursOverview.mockReturnValue(overviewResult(OVERVIEW));
    good();

    const { get, idle } = setupHook();
    await settle(idle);

    // Used to be the overview's UTC billable total (2410 min): the local timesheet wins
    expect(get().data?.total).toBe(20);
    expect(get().data?.weeklyLimit).toBe(40);
    expect(get().data?.hoursRemaining).toBe(20);
    expect(get().data?.breakdown?.billable).toBe(2410);
    expect(get().data?.breakdown?.manualPending).toBe(130);
    // The timesheet's local days, each with its manual minutes by local date
    expect(get().data?.daily.map((d) => [d.date, d.hours])).toEqual([
      ['2026-10-19', 10],
      ['2026-10-20', 10],
    ]);
    for (const d of get().data!.daily) {
      expect(d.manualHours! * 60).toBeCloseTo(approvedMinutesOn(d.date), 10);
    }
    // The payments row has paidHours (20), so earnings stay paidHours × rate.
    expect(get().data?.weeklyEarnings).toBe(20 * CONFIG.hourlyRate);
    expect(get().isStale).toBe(false);
    expect(get().error).toBeNull();

    const stored = JSON.parse((await AsyncStorage.getItem(CACHE_KEY))!);
    expect(stored.data.total).toBe(20);
    expect(stored.data.breakdown.billable).toBe(2410);
  });

  it('overview absent → the timesheet + payments numbers, no breakdown', async () => {
    good();

    const { get, idle } = setupHook();
    await settle(idle);

    expect(get().data?.total).toBe(20);
    expect(get().data?.weeklyEarnings).toBe(1000);
    expect(get().data?.breakdown).toBeUndefined();
    expect(get().isStale).toBe(false);
  });

  it('overview failed (no data) → the timesheet + payments numbers, no error', async () => {
    mockUseHoursOverview.mockReturnValue(overviewResult(undefined, true));
    good();

    const { get, idle } = setupHook();
    await settle(idle);

    expect(get().data?.total).toBe(20);
    expect(get().data?.breakdown).toBeUndefined();
    expect(get().error).toBeNull();
  });

  it('a persisted overview from last week is ignored', async () => {
    mockUseHoursOverview.mockReturnValue(overviewResult(LAST_WEEK));
    good();

    const { get, idle } = setupHook();
    await settle(idle);

    expect(get().data?.total).toBe(20);
    expect(get().data?.breakdown).toBeUndefined();
    expect(JSON.parse((await AsyncStorage.getItem(CACHE_KEY))!).data.total).toBe(20);
  });

  it('a last-week overview is not live data: with timesheet and payments down, hours_cache is served', async () => {
    const seeded = await seedHoursCache(SEEDED_HOURS);
    mockUseHoursOverview.mockReturnValue(overviewResult(LAST_WEEK));
    serve(outage, outage);

    const { get, idle } = setupHook();
    await settle(idle);

    expect(get().data?.total).toBe(32.5);
    expect(get().isStale).toBe(true);
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBe(seeded);
  });

  it('a current overview alone is not live data: timesheet and payments both fail → hours_cache is served, untouched', async () => {
    // Used to serve the overview's UTC week as live hours; its days are UTC, so it cannot
    // produce the local-week hours the home screen shows.
    const seeded = await seedHoursCache(SEEDED_HOURS);
    mockUseHoursOverview.mockReturnValue(overviewResult(OVERVIEW));
    serve(outage, outage);

    const { get, idle } = setupHook();
    await settle(idle);

    expect(get().data?.total).toBe(32.5);
    expect(get().data?.weeklyEarnings).toBe(1625);
    expect(get().data?.breakdown).toBeUndefined();
    expect(get().isStale).toBe(true);
    expect(get().isLoading).toBe(false);
    expect(get().error).toBeNull();
    // The cache write still needs both queries clean (DD3.7).
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBe(seeded);
    expect(hoursCacheWrites()).toEqual([]);
  });

  it('a current overview alone, no cache: no live data, the error surfaces', async () => {
    mockUseHoursOverview.mockReturnValue(overviewResult(OVERVIEW));
    serve(outage, outage);

    const { get, idle } = setupHook();
    await settle(idle);

    expect(get().data).toBeNull();
    expect(get().error).not.toBeNull();
    expect(hoursCacheWrites()).toEqual([]);
  });

  it('refetch() also refetches the overview', async () => {
    mockUseHoursOverview.mockReturnValue(overviewResult(OVERVIEW));
    good();

    const { get, idle } = setupHook();
    await settle(idle);
    await act(async () => {
      get().refetch();
    });

    expect(mockOverviewRefetch).toHaveBeenCalledTimes(1);
  });

  it('end to end with the real useHoursOverview: the routed body refines the week', async () => {
    mockUseHoursOverview.mockImplementation(actualUseHoursOverview);
    serve(
      () => Promise.resolve([TIMESHEET_ROW]),
      () => Promise.resolve([PAYMENT_ROW]),
      () => Promise.resolve(HOURS_OVERVIEW_RAW),
    );

    const { get, idle } = setupHook();
    await settle(() => idle() && get().data?.breakdown !== undefined);

    const overviewCalls = mockApiGet.mock.calls.filter(([p]) => p === OVERVIEW_PATH);
    expect(overviewCalls).toHaveLength(1);
    expect(overviewCalls[0][1]).toEqual({ date: '2026-10-21' });
    expect(overviewCalls[0][3]).toBe(false);
    expect(overviewCalls[0][4]).toEqual({ ...CREDS, useQA: false });

    // Used to be the overview's UTC billable total, with timesheet and payments down
    expect(get().data?.total).toBe(20);
    expect(get().data?.breakdown?.weekStart).toBe('2026-10-19');
    expect(get().data?.breakdown?.billable).toBe(2410);
    expect(get().isStale).toBe(false);
  });
});
