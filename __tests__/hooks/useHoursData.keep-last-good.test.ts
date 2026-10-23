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
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

import { apiGet, getAuthToken } from '../../src/api/client';
import { loadConfig, loadCredentials } from '../../src/store/config';
import { NetworkError } from '../../src/api/errors';
import { useHoursData } from '../../src/hooks/useHoursData';
import type { HoursData, PaymentsResponse, TimesheetResponse } from '../../src/lib/hours';
import type { CrossoverConfig, Credentials } from '../../src/types/config';

const mockApiGet = apiGet as jest.Mock;
const mockGetAuthToken = getAuthToken as jest.Mock;
const mockLoadConfig = loadConfig as jest.Mock;
const mockLoadCredentials = loadCredentials as jest.Mock;
const mockStorage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  _reset: () => void;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'hours_cache';
const TIMESHEET_PATH = '/api/timetracking/timesheets';
const PAYMENTS_PATH = '/api/v3/users/current/payments';

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
function serve(timesheet: Responder, payments: Responder) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === TIMESHEET_PATH) return timesheet();
    if (path === PAYMENTS_PATH) return payments();
    return Promise.reject(new Error(`unexpected apiGet ${path}`));
  });
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
