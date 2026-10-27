// 1.2 WorkSmart dashboard parity: useHoursOverview (src/hooks/useHoursOverview.ts).
//
// renderHook is not viable under jest-expo/node, so — as in hooksCredsForwarding.test.ts —
// `useQuery` is mocked to capture its options (the queryFn is then called directly). The
// rest of TanStack stays real, so fetchCurrentHoursOverview runs against a real
// QueryClient. The credential store, getAuthToken and fetchHoursOverview are mocked; the
// real toAuthCreds builds the renewal creds.
//
// The key is ['hoursOverview', assignmentId, env, UTC Monday]: a different account, env
// or UTC week is a different entry, and the `date` param is the same instant's UTC day.

import { QueryClient } from '@tanstack/react-query';
import { loadCredentials } from '../../store/config';
import { getAuthToken } from '../../api/client';
import { fetchHoursOverview } from '../../api/hoursOverview';
import { NetworkError, shouldRetryOnce } from '../../api/errors';
import {
  fetchCurrentHoursOverview,
  HOURS_OVERVIEW_POLL_MS,
  HOURS_OVERVIEW_STALE_MS,
  hoursOverviewQueryKey,
  hoursOverviewQueryOptions,
  useHoursOverview,
} from '../useHoursOverview';
import { normalizeHoursOverview, type HoursOverview } from '../../lib/hoursOverview';
import { HOURS_OVERVIEW_RAW } from '../../__fixtures__/hoursOverview';
import type { CrossoverConfig } from '../../types/config';

let mockQueryOpts: Record<string, any>[] = [];

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn((opts: Record<string, any>) => {
    mockQueryOpts.push(opts);
    return { data: undefined, isLoading: true };
  }),
}));

jest.mock('../../store/config', () => ({
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
}));

jest.mock('../../api/hoursOverview', () => ({
  fetchHoursOverview: jest.fn(),
}));

const mockLoadCredentials = loadCredentials as jest.Mock;
const mockGetAuthToken = getAuthToken as jest.Mock;
const mockFetchHoursOverview = fetchHoursOverview as jest.Mock;

const CREDENTIALS = { username: 'worker@example.com', password: 's3cret' };
const TOKEN = 'token-abc';
const OVERVIEW = normalizeHoursOverview(HOURS_OVERVIEW_RAW) as HoursOverview;

// Wednesday 2026-10-21 midday UTC: Monday 2026-10-19 in every host time zone.
const NOW = new Date('2026-10-21T12:00:00.000Z');

function makeConfig(overrides: Partial<CrossoverConfig> = {}): CrossoverConfig {
  return {
    userId: '100',
    fullName: 'Test User',
    managerId: '200',
    primaryTeamId: '300',
    assignmentId: '79996',
    hourlyRate: 50,
    weeklyLimit: 40,
    useQA: false,
    isManager: false,
    teams: [],
    lastRoleCheck: '2026-01-01T00:00:00Z',
    debugMode: false,
    setupComplete: true,
    setupDate: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function lastOpts(): Record<string, any> {
  return mockQueryOpts[mockQueryOpts.length - 1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryOpts = [];
  jest.useFakeTimers({ now: NOW });
  mockLoadCredentials.mockResolvedValue(CREDENTIALS);
  mockGetAuthToken.mockResolvedValue(TOKEN);
  mockFetchHoursOverview.mockResolvedValue(OVERVIEW);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── hoursOverviewQueryKey ────────────────────────────────────────────────────

describe('hoursOverviewQueryKey', () => {
  it('is [hoursOverview, assignmentId, env, weekStart]', () => {
    expect(hoursOverviewQueryKey('79996', false, '2026-10-19')).toEqual([
      'hoursOverview', '79996', 'prod', '2026-10-19',
    ]);
    expect(hoursOverviewQueryKey('79996', true, '2026-10-19')).toEqual([
      'hoursOverview', '79996', 'qa', '2026-10-19',
    ]);
  });
});

// ─── hoursOverviewQueryOptions ────────────────────────────────────────────────

describe('hoursOverviewQueryOptions', () => {
  const owner = { assignmentId: '79996', useQA: false };

  it('keys on the UTC Monday and fetches the same instant\'s UTC day', async () => {
    const opts = hoursOverviewQueryOptions(owner, new Date('2026-10-25T23:59:00.000Z'));
    expect(opts.queryKey).toEqual(['hoursOverview', '79996', 'prod', '2026-10-19']);
    await opts.queryFn();
    expect(mockFetchHoursOverview.mock.calls[0][1]).toBe('2026-10-25');
  });

  it('starts a new entry at Monday 00:00 UTC', async () => {
    const opts = hoursOverviewQueryOptions(owner, new Date('2026-10-26T00:00:00.000Z'));
    expect(opts.queryKey[3]).toBe('2026-10-26');
    await opts.queryFn();
    expect(mockFetchHoursOverview.mock.calls[0][1]).toBe('2026-10-26');
  });

  it('follows the UTC week, not the local one (Sunday evening in UTC-6 is Monday UTC)', async () => {
    const opts = hoursOverviewQueryOptions(owner, new Date('2026-10-25T20:00:00-06:00'));
    expect(opts.queryKey[3]).toBe('2026-10-26');
    await opts.queryFn();
    expect(mockFetchHoursOverview.mock.calls[0][1]).toBe('2026-10-26');
  });

  it('defaults to now', () => {
    expect(hoursOverviewQueryOptions(owner).queryKey).toEqual([
      'hoursOverview', '79996', 'prod', '2026-10-19',
    ]);
  });

  it('is fresh for 5 minutes and retries once, outages only', () => {
    const opts = hoursOverviewQueryOptions(owner);
    expect(HOURS_OVERVIEW_STALE_MS).toBe(5 * 60 * 1000);
    expect(opts.staleTime).toBe(HOURS_OVERVIEW_STALE_MS);
    expect(opts.retry).toBe(shouldRetryOnce);
  });

  it.each([false, true])('queryFn forwards the token and toAuthCreds(credentials, useQA=%s)', async (useQA) => {
    const result = await hoursOverviewQueryOptions({ assignmentId: '79996', useQA }).queryFn();

    expect(result).toBe(OVERVIEW);
    expect(mockGetAuthToken).toHaveBeenCalledWith(CREDENTIALS.username, CREDENTIALS.password, useQA);
    expect(mockFetchHoursOverview).toHaveBeenCalledWith('79996', '2026-10-21', TOKEN, useQA, {
      ...CREDENTIALS,
      useQA,
    });
  });

  it('a missing `useQA` reads as prod', async () => {
    const opts = hoursOverviewQueryOptions({ assignmentId: '79996' } as never);
    expect(opts.queryKey[2]).toBe('prod');
    await opts.queryFn();
    expect(mockFetchHoursOverview.mock.calls[0][3]).toBe(false);
  });

  it('queryFn rejects without credentials and never fetches', async () => {
    mockLoadCredentials.mockResolvedValue(null);

    await expect(hoursOverviewQueryOptions(owner).queryFn()).rejects.toThrow('No credentials');
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockFetchHoursOverview).not.toHaveBeenCalled();
  });

  it('queryFn lets a fetch failure propagate (keep last good)', async () => {
    const outage = new NetworkError('Network request failed');
    mockFetchHoursOverview.mockRejectedValue(outage);

    await expect(hoursOverviewQueryOptions(owner).queryFn()).rejects.toBe(outage);
  });
});

// ─── useHoursOverview ─────────────────────────────────────────────────────────

describe('useHoursOverview', () => {
  it('keys on the config\'s assignmentId, env and the current UTC week', () => {
    useHoursOverview(makeConfig());
    expect(lastOpts().queryKey).toEqual(['hoursOverview', '79996', 'prod', '2026-10-19']);

    useHoursOverview(makeConfig({ useQA: true, assignmentId: '555' }));
    expect(lastOpts().queryKey).toEqual(['hoursOverview', '555', 'qa', '2026-10-19']);
  });

  it('is enabled once config has an assignmentId', () => {
    useHoursOverview(makeConfig());
    expect(lastOpts().enabled).toBe(true);
  });

  it('is disabled without config or without an assignmentId', () => {
    useHoursOverview(null);
    expect(lastOpts().enabled).toBe(false);
    expect(lastOpts().queryKey).toEqual(['hoursOverview', '', 'prod', '2026-10-19']);

    useHoursOverview(makeConfig({ assignmentId: '' }));
    expect(lastOpts().enabled).toBe(false);
  });

  it('polls every 10 minutes, fresh for 5, one retry for an outage', () => {
    useHoursOverview(makeConfig());
    expect(HOURS_OVERVIEW_POLL_MS).toBe(10 * 60 * 1000);
    expect(lastOpts().refetchInterval).toBe(HOURS_OVERVIEW_POLL_MS);
    expect(lastOpts().staleTime).toBe(HOURS_OVERVIEW_STALE_MS);
    expect(lastOpts().retry).toBe(shouldRetryOnce);
  });

  it('queryFn fetches today (UTC) for the config\'s assignment with its env', async () => {
    useHoursOverview(makeConfig({ useQA: true }));
    await lastOpts().queryFn();
    expect(mockFetchHoursOverview).toHaveBeenCalledWith('79996', '2026-10-21', TOKEN, true, {
      ...CREDENTIALS,
      useQA: true,
    });
  });

  it('shares its key with hoursOverviewQueryOptions (one cache entry for every reader)', () => {
    const config = makeConfig();
    useHoursOverview(config);
    expect(lastOpts().queryKey).toEqual(
      hoursOverviewQueryOptions({ assignmentId: config.assignmentId, useQA: config.useQA }).queryKey,
    );
  });
});

// ─── fetchCurrentHoursOverview (real QueryClient) ────────────────────────────

describe('fetchCurrentHoursOverview', () => {
  const owner = { assignmentId: '79996', useQA: false };
  const KEY = hoursOverviewQueryKey('79996', false, '2026-10-19');
  const MAX_AGE = 2 * 60 * 1000;
  let client: QueryClient;

  beforeEach(() => {
    // Only Date is faked here; TanStack's timers and microtasks stay real.
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
        'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
        'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  });

  afterEach(() => {
    client.clear();
  });

  it('serves a cached week younger than maxAgeMs without fetching', async () => {
    const cached = { ...OVERVIEW, today: 'cached' } as HoursOverview;
    client.setQueryData(KEY, cached, { updatedAt: NOW.getTime() - 60 * 1000 });

    await expect(fetchCurrentHoursOverview(client, owner, MAX_AGE)).resolves.toBe(cached);
    expect(mockFetchHoursOverview).not.toHaveBeenCalled();
  });

  it('refetches a cached week older than maxAgeMs and fills the shared entry', async () => {
    client.setQueryData(KEY, { ...OVERVIEW, today: 'old' }, { updatedAt: NOW.getTime() - 3 * 60 * 1000 });

    await expect(fetchCurrentHoursOverview(client, owner, MAX_AGE)).resolves.toBe(OVERVIEW);
    expect(mockFetchHoursOverview).toHaveBeenCalledTimes(1);
    // Structural sharing keeps unchanged sub-objects of the old entry, so compare by value.
    expect(client.getQueryData(KEY)).toEqual(OVERVIEW);
  });

  it('fetches when nothing is cached', async () => {
    await expect(fetchCurrentHoursOverview(client, owner, MAX_AGE)).resolves.toBe(OVERVIEW);
    expect(mockFetchHoursOverview).toHaveBeenCalledWith('79996', '2026-10-21', TOKEN, false, {
      ...CREDENTIALS,
      useQA: false,
    });
  });

  it('rejects on failure without retrying, even an outage', async () => {
    const outage = new NetworkError('Network request failed');
    mockFetchHoursOverview.mockRejectedValue(outage);

    await expect(fetchCurrentHoursOverview(client, owner, MAX_AGE)).rejects.toBe(outage);
    expect(mockFetchHoursOverview).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh keeps the last good week in the cache', async () => {
    client.setQueryData(KEY, OVERVIEW, { updatedAt: NOW.getTime() - 10 * 60 * 1000 });
    mockFetchHoursOverview.mockRejectedValue(new NetworkError('Network request failed'));

    await expect(fetchCurrentHoursOverview(client, owner, MAX_AGE)).rejects.toBeInstanceOf(NetworkError);
    expect(client.getQueryData(KEY)).toBe(OVERVIEW);
  });

  it('shares one request with an in-flight fetch of the same week', async () => {
    let resolve!: (o: HoursOverview) => void;
    mockFetchHoursOverview.mockReturnValue(new Promise<HoursOverview>((r) => { resolve = r; }));

    const first = client.fetchQuery(hoursOverviewQueryOptions(owner));
    const second = fetchCurrentHoursOverview(client, owner, MAX_AGE);
    // Let the shared queryFn reach fetchHoursOverview (credentials + token are async).
    for (let i = 0; i < 5 && mockFetchHoursOverview.mock.calls.length === 0; i++) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    resolve(OVERVIEW);

    await expect(Promise.all([first, second])).resolves.toEqual([OVERVIEW, OVERVIEW]);
    expect(mockFetchHoursOverview).toHaveBeenCalledTimes(1);
  });
});
