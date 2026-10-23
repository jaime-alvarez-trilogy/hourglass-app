/**
 * durable-data 03-keep-last-good FR3 (DD3.14-DD3.17): the earnings trend keeps the last
 * good payments through a failed refresh.
 *
 * `buildPaymentHistoryQueryFn(config, from, to)` is the one payments-range queryFn shared
 * by usePaymentHistory and useEarningsHistory (the hook behind the Home and Overview
 * earnings trend, spec C2). It returns the Payment[] the API sent, `null` only when there
 * is no config or the body is not an array, and lets every rejection propagate, so
 * TanStack keeps the previous `data` instead of storing `null`.
 *
 * - DD3.14 / DD3.15: the builder itself, with `apiGet` / `getAuthToken` and the
 *   credential store mocked (the real `toAuthCreds` builds the renewal creds).
 * - DD3.16: a real QueryClient keeps the seeded payments when the builder rejects; the
 *   same is then shown for both hooks, rendered (react-test-renderer in a real
 *   QueryClientProvider, the setupHook pattern of __tests__/use-ai-data.test.ts) with the
 *   real useConfig, with `retryDelay: 0` and no `retry`, so the hooks' own rule
 *   (`shouldRetryOnce`: one retry for an outage, none for a credential failure) runs.
 * - DD3.17: static, both hooks use the builder and `retry: shouldRetryOnce`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { stripComments } from '../../../__tests__/helpers/stripComments';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
  apiGet: jest.fn(),
}));

import { apiGet, getAuthToken } from '../../api/client';
import { loadConfig, loadCredentials } from '../../store/config';
import { ApiError, AuthError, NetworkError } from '../../api/errors';
import { buildPaymentHistoryQueryFn, usePaymentHistory } from '../usePaymentHistory';
import { useEarningsHistory } from '../useEarningsHistory';
import type { Payment } from '../../lib/payments';
import type { CrossoverConfig, Credentials } from '../../types/config';

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

const PAYMENTS_PATH = '/api/v3/users/current/payments';
const EARNINGS_CACHE_KEY = 'earnings_history_v1';
const TOKEN = 'token-abc';

// Thursday 2026-10-22, midday UTC. With 4 weeks the range is Monday 2026-09-28 to
// Sunday 2026-10-25 in every host time zone.
const NOW = new Date('2026-10-22T12:00:00.000Z');
const FROM = '2026-09-28';
const TO = '2026-10-25';

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

const PAYMENT_HISTORY_KEY = ['paymentHistory', FROM, TO, CONFIG.userId];
const EARNINGS_HISTORY_KEY = ['earningsHistory', FROM, TO, CONFIG.userId];

function makePayment(periodStartDate: string, periodEndDate: string, paidHours: number, status: string): Payment {
  return {
    amount: paidHours * CONFIG.hourlyRate,
    periodStartDate,
    periodEndDate,
    paidHours,
    workedHours: paidHours + 0.5,
    overtimeHours: 0,
    approvedOvertimeHours: 0,
    manualMinutes: 30,
    status,
  };
}

const P_OCT05 = makePayment('2026-10-05', '2026-10-11', 39, 'PROCESSED'); // $1,950
const P_OCT12 = makePayment('2026-10-12', '2026-10-18', 40, 'PROCESSED'); // $2,000
const P_OCT19 = makePayment('2026-10-19', '2026-10-25', 25, 'CURRENT'); // $1,250

/** The last good range: 3 weeks paid, nothing for the week of 2026-09-28. */
const LAST_GOOD = [P_OCT05, P_OCT12, P_OCT19];
/** The 4-week trend those payments make, oldest first. */
const LAST_GOOD_TREND = [0, 1950, 2000, 1250];

const outage = () => Promise.reject(new NetworkError('Network request failed'));

const paymentsCalls = () => mockApiGet.mock.calls.filter(([p]) => p === PAYMENTS_PATH).length;

const earningsCacheWrites = () => mockStorage.setItem.mock.calls.filter(([k]) => k === EARNINGS_CACHE_KEY);

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

const cleanups: (() => void)[] = [];

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
  mockGetAuthToken.mockResolvedValue(TOKEN);
  mockApiGet.mockResolvedValue(LAST_GOOD);
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  jest.useRealTimers();
});

// ─── DD3.14 / DD3.15: the shared queryFn ──────────────────────────────────────

describe('buildPaymentHistoryQueryFn — resolved values (DD3.14)', () => {
  it.each([false, true])(
    'DD3.14 — returns the Payment[] the API sent, from one payments call with the range and toAuthCreds last (useQA=%s)',
    async (useQA) => {
      const sent = [P_OCT05, P_OCT12];
      mockApiGet.mockResolvedValue(sent);

      const result = await buildPaymentHistoryQueryFn({ ...CONFIG, useQA }, FROM, TO)();

      expect(result).toBe(sent);
      expect(mockGetAuthToken).toHaveBeenCalledWith(CREDS.username, CREDS.password, useQA);
      expect(mockApiGet).toHaveBeenCalledTimes(1);
      expect(mockApiGet).toHaveBeenCalledWith(
        PAYMENTS_PATH,
        { from: FROM, to: TO },
        TOKEN,
        useQA,
        { username: CREDS.username, password: CREDS.password, useQA },
      );
    },
  );

  it('DD3.14 — an empty array is a truthful "no payments in range" and is returned as is', async () => {
    mockApiGet.mockResolvedValue([]);
    await expect(buildPaymentHistoryQueryFn(CONFIG, FROM, TO)()).resolves.toEqual([]);
  });

  it('DD3.14 — no config → null, with no credential, token or API call', async () => {
    await expect(buildPaymentHistoryQueryFn(null, FROM, TO)()).resolves.toBeNull();
    expect(mockLoadCredentials).not.toHaveBeenCalled();
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty body (undefined)', undefined],
    ['null', null],
    ['a non-array object', { content: [] }],
  ])('DD3.14 — %s → null', async (_label, body) => {
    mockApiGet.mockResolvedValue(body);
    await expect(buildPaymentHistoryQueryFn(CONFIG, FROM, TO)()).resolves.toBeNull();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});

describe('buildPaymentHistoryQueryFn — every failure rejects (DD3.15)', () => {
  it.each([
    ['NetworkError', () => new NetworkError('Network request failed'), NetworkError],
    ['AuthError(401)', () => new AuthError(401), AuthError],
    ['ApiError(500)', () => new ApiError(500), ApiError],
  ])('DD3.15 — apiGet rejects %s → the queryFn rejects with that same error', async (_label, makeErr, type) => {
    const err = makeErr();
    mockApiGet.mockRejectedValue(err);

    const run = buildPaymentHistoryQueryFn(CONFIG, FROM, TO)();

    await expect(run).rejects.toBe(err);
    await expect(run).rejects.toBeInstanceOf(type);
    // The builder never retries by itself: retries are the hook's `retry` rule.
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('DD3.15 — no stored credentials → rejects "No credentials", with no token or API call', async () => {
    mockLoadCredentials.mockResolvedValue(null);

    await expect(buildPaymentHistoryQueryFn(CONFIG, FROM, TO)()).rejects.toThrow('No credentials');
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('DD3.15 — a refused login (getAuthToken rejects AuthError) propagates, with no API call', async () => {
    const err = new AuthError(401);
    mockGetAuthToken.mockRejectedValue(err);

    await expect(buildPaymentHistoryQueryFn(CONFIG, FROM, TO)()).rejects.toBe(err);
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});

// ─── DD3.16: TanStack keeps the last good payments ───────────────────────────

describe('buildPaymentHistoryQueryFn — a real QueryClient keeps the last good payments (DD3.16)', () => {
  it('DD3.16 — a refetch that rejects leaves the same 3-payment array in the cache, with status error', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    cleanups.push(() => client.clear());
    client.setQueryData(PAYMENT_HISTORY_KEY, LAST_GOOD);
    mockApiGet.mockImplementation(outage);

    const thrown = await client
      .fetchQuery({ queryKey: PAYMENT_HISTORY_KEY, queryFn: buildPaymentHistoryQueryFn(CONFIG, FROM, TO) })
      .catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(NetworkError);
    expect(client.getQueryData(PAYMENT_HISTORY_KEY)).toBe(LAST_GOOD);
    expect(client.getQueryData<Payment[]>(PAYMENT_HISTORY_KEY)).toHaveLength(3);
    const state = client.getQueryState(PAYMENT_HISTORY_KEY);
    expect(state?.status).toBe('error');
    expect(state?.error).toBeInstanceOf(NetworkError);
  });
});

// ─── DD3.16, rendered: both hooks keep the last good payments ────────────────

async function tick() {
  await act(async () => {
    await new Promise<void>((res) => setTimeout(res, 0));
  });
}

/** Flushes until `done()` holds (bounded), then a few more turns for trailing effects and storage. */
async function settle(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await tick();
  for (let i = 0; i < 5; i++) await tick();
}

function setupHook<T>(useHook: () => T) {
  const queryClient = new QueryClient({
    // No `retry` here: the hooks' own rule must be the one that runs.
    defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } },
  });
  let current!: T;
  const Probe = () => {
    current = useHook();
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
  /** True once a payments request has gone out and no query is still fetching (retries included). */
  const idle = () => paymentsCalls() > 0 && queryClient.isFetching() === 0;
  /** Refetches one query family and waits for it, its retries and the effects after it. */
  const refetch = async (family: string) => {
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: [family] });
    });
    await settle(idle);
  };
  return { get: () => current, idle, queryClient, refetch };
}

describe('usePaymentHistory, rendered — a failed refresh keeps the last good payments (DD3.16)', () => {
  it('DD3.16 — after a good run, an outage refetch still returns the 3 payments as data', async () => {
    const { get, idle, refetch } = setupHook(() => usePaymentHistory(4));
    await settle(idle);
    expect(get().data).toEqual(LAST_GOOD);

    mockApiGet.mockImplementation(outage);
    await refetch('paymentHistory');

    expect(get().data).toEqual(LAST_GOOD);
    expect(get().isLoading).toBe(false);
  });
});

describe('useEarningsHistory, rendered — the earnings trend keeps the last good payments (DD3.16)', () => {
  /** Mounts with LAST_GOOD and waits for the merge effect to write earnings_history_v1. */
  async function mountWithGoodRun() {
    const hook = setupHook(() => useEarningsHistory(4));
    await settle(() => hook.idle() && earningsCacheWrites().length > 0);
    expect(hook.get().trend).toEqual(LAST_GOOD_TREND);
    const written = await AsyncStorage.getItem(EARNINGS_CACHE_KEY);
    expect(written).not.toBeNull();
    return { ...hook, written: written! };
  }

  it('DD3.16 — an outage refetch keeps the last Payment[] in the query as status error, after one retry', async () => {
    const { queryClient, refetch } = await mountWithGoodRun();
    const callsAfterGoodRun = paymentsCalls();

    mockApiGet.mockImplementation(outage);
    await refetch('earningsHistory');

    expect(queryClient.getQueryData(EARNINGS_HISTORY_KEY)).toEqual(LAST_GOOD);
    const state = queryClient.getQueryState(EARNINGS_HISTORY_KEY);
    expect(state?.status).toBe('error');
    expect(state?.error).toBeInstanceOf(NetworkError);
    // shouldRetryOnce: an outage is retried once.
    expect(paymentsCalls() - callsAfterGoodRun).toBe(2);
  });

  it('DD3.16 — a credential failure (AuthError 401) keeps the last Payment[] too, and is not retried', async () => {
    const { queryClient, refetch } = await mountWithGoodRun();
    const callsAfterGoodRun = paymentsCalls();

    mockApiGet.mockRejectedValue(new AuthError(401));
    await refetch('earningsHistory');

    expect(queryClient.getQueryData(EARNINGS_HISTORY_KEY)).toEqual(LAST_GOOD);
    const state = queryClient.getQueryState(EARNINGS_HISTORY_KEY);
    expect(state?.status).toBe('error');
    expect(state?.error).toBeInstanceOf(AuthError);
    expect(paymentsCalls() - callsAfterGoodRun).toBe(1);
  });

  it('DD3.16 — after a failed refetch the trend and earnings_history_v1 are unchanged', async () => {
    const { get, refetch, written } = await mountWithGoodRun();
    const writesAfterGoodRun = earningsCacheWrites().length;

    mockApiGet.mockImplementation(outage);
    await refetch('earningsHistory');

    expect(get().trend).toEqual(LAST_GOOD_TREND);
    expect(get().isLoading).toBe(false);
    expect(await AsyncStorage.getItem(EARNINGS_CACHE_KEY)).toBe(written);
    expect(earningsCacheWrites()).toHaveLength(writesAfterGoodRun);
  });

  it('DD3.16 — a failed first fetch serves the persisted earnings_history_v1 trend and writes nothing', async () => {
    const persisted = JSON.stringify({ '2026-10-05': 1950, '2026-10-12': 2000, '2026-10-19': 1250 });
    await AsyncStorage.setItem(EARNINGS_CACHE_KEY, persisted);
    mockStorage.setItem.mockClear();
    mockApiGet.mockImplementation(outage);

    const { get, idle } = setupHook(() => useEarningsHistory(4));
    await settle(idle);

    expect(get().trend).toEqual(LAST_GOOD_TREND);
    expect(get().isLoading).toBe(false);
    expect(await AsyncStorage.getItem(EARNINGS_CACHE_KEY)).toBe(persisted);
    expect(earningsCacheWrites()).toEqual([]);
  });
});

// ─── DD3.17: static, both hooks share the builder and the one-retry rule ─────

const PAYMENT_HISTORY_FILE = path.resolve(__dirname, '..', 'usePaymentHistory.ts');
const EARNINGS_HISTORY_FILE = path.resolve(__dirname, '..', 'useEarningsHistory.ts');

const codeOf = (file: string) => stripComments(fs.readFileSync(file, 'utf8'));

describe('usePaymentHistory / useEarningsHistory — durable-data 03 FR3 (static analysis)', () => {
  it.each([
    ['usePaymentHistory.ts', PAYMENT_HISTORY_FILE],
    ['useEarningsHistory.ts', EARNINGS_HISTORY_FILE],
  ])('DD3.17 — %s runs buildPaymentHistoryQueryFn and retries through shouldRetryOnce, not retry: 1', (_name, file) => {
    const code = codeOf(file);
    expect(code).toMatch(/queryFn:\s*buildPaymentHistoryQueryFn\(/);
    expect(code).toMatch(/retry:\s*shouldRetryOnce\b/);
    expect(code).not.toMatch(/retry:\s*1\b/);
    // The shared predicate from src/api/errors, not a local copy of it.
    expect(code).toMatch(/import\s*\{[^}]*\bshouldRetryOnce\b[^}]*\}\s*from\s*'\.\.\/api\/errors'/);
  });

  it('DD3.17 — the payments-range call lives only in usePaymentHistory.ts; useEarningsHistory.ts imports the builder', () => {
    expect(codeOf(PAYMENT_HISTORY_FILE)).toMatch(/export\s+function\s+buildPaymentHistoryQueryFn\s*\(/);
    const earnings = codeOf(EARNINGS_HISTORY_FILE);
    expect(earnings).toMatch(
      /import\s*\{[^}]*\bbuildPaymentHistoryQueryFn\b[^}]*\}\s*from\s*'\.\/usePaymentHistory'/,
    );
    expect(earnings).not.toContain(PAYMENTS_PATH);
  });

  it('DD3.17 — useEarningsHistory.ts keeps its earnings_history_v1 cache and the paidHours merge', () => {
    const earnings = codeOf(EARNINGS_HISTORY_FILE);
    expect(earnings).toContain(EARNINGS_CACHE_KEY);
    expect(earnings).toContain('paidHours');
  });
});
