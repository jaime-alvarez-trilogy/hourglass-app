// durable-data 01-auth-renewal FR4: behavioural creds-forwarding tests for the hooks
// whose queryFn / effect has no other test.
//
// The static guard in src/__tests__/api/creds-wiring.test.ts only checks that the last
// argument *looks like* `creds` / `toAuthCreds(…)`. These tests check the forwarded
// value: the loaded username/password plus the hook's own `config.useQA`.
//
// renderHook is not viable under jest-expo/node, so `useQuery` is mocked to capture its
// options (the queryFn is then called directly) and the React hooks used by
// useEarningsHistory / useHistoryBackfill are reduced to inert stand-ins (useEffect runs
// its callback once, synchronously).

let mockQueryFns: Array<() => Promise<unknown>> = [];

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((opts: { queryFn: () => Promise<unknown> }) => {
    mockQueryFns.push(opts.queryFn);
    return { data: undefined, isLoading: true };
  }),
}));

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (init: unknown) => [init, () => {}],
  useRef: (init: unknown) => ({ current: init }),
  useEffect: (fn: () => void) => {
    fn();
  },
}));

jest.mock('../useConfig', () => ({
  useConfig: jest.fn(),
}));

jest.mock('../../store/config', () => ({
  loadCredentials: jest.fn(),
  getApiBase: jest.fn(() => 'https://api.example.test'),
}));

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
  apiGet: jest.fn(),
}));

jest.mock('../../api/timesheet', () => ({
  fetchTimesheet: jest.fn(),
}));

jest.mock('../../api/payments', () => ({
  fetchPayments: jest.fn(),
}));

jest.mock('../../lib/weeklyHistory', () => ({
  loadWeeklyHistory: jest.fn(),
  mergeWeeklySnapshot: jest.fn((h: unknown) => h),
  saveWeeklyHistory: jest.fn(),
}));

jest.mock('../../lib/aiAppBreakdown', () => ({
  extractAppBreakdown: jest.fn(() => []),
  mergeAppBreakdown: jest.fn(() => []),
  loadAppHistory: jest.fn(() => Promise.resolve({})),
  saveAppHistory: jest.fn(() => Promise.resolve()),
}));

import { useConfig } from '../useConfig';
import { loadCredentials } from '../../store/config';
import { getAuthToken, apiGet } from '../../api/client';
import { fetchTimesheet } from '../../api/timesheet';
import { fetchPayments } from '../../api/payments';
import { loadWeeklyHistory } from '../../lib/weeklyHistory';
import { useTimesheet } from '../useTimesheet';
import { usePayments } from '../usePayments';
import { useEarningsHistory } from '../useEarningsHistory';
import { usePaymentHistory } from '../usePaymentHistory';
import { useHistoryBackfill } from '../useHistoryBackfill';
import type { CrossoverConfig } from '../../types/config';

const mockUseConfig = useConfig as jest.Mock;
const mockLoadCredentials = loadCredentials as jest.Mock;
const mockGetAuthToken = getAuthToken as jest.Mock;
const mockApiGet = apiGet as jest.Mock;
const mockFetchTimesheet = fetchTimesheet as jest.Mock;
const mockFetchPayments = fetchPayments as jest.Mock;
const mockLoadWeeklyHistory = loadWeeklyHistory as jest.Mock;

const CREDENTIALS = { username: 'worker@example.com', password: 's3cret' };
const TOKEN = 'token-abc';

function makeConfig(useQA: boolean): CrossoverConfig {
  return {
    userId: '100',
    fullName: 'Test User',
    managerId: '200',
    primaryTeamId: '300',
    assignmentId: '400',
    hourlyRate: 50,
    weeklyLimit: 40,
    useQA,
    isManager: false,
    teams: [],
    lastRoleCheck: '2026-01-01T00:00:00Z',
    debugMode: false,
    setupComplete: true,
    setupDate: '2026-01-01T00:00:00Z',
  } as unknown as CrossoverConfig;
}

/** The last argument the mock was called with on its first call. */
function lastArg(mock: jest.Mock, call = 0): unknown {
  const args = mock.mock.calls[call];
  return args[args.length - 1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryFns = [];
  mockLoadCredentials.mockResolvedValue(CREDENTIALS);
  mockGetAuthToken.mockResolvedValue(TOKEN);
  mockFetchTimesheet.mockResolvedValue(null);
  mockFetchPayments.mockResolvedValue(null);
  mockApiGet.mockResolvedValue([]);
});

describe.each([false, true])('FR4.h: hooks forward toAuthCreds(credentials, config.useQA) (useQA=%s)', (useQA) => {
  const expectedCreds = { ...CREDENTIALS, useQA };

  it('useTimesheet passes the creds to fetchTimesheet', async () => {
    const config = makeConfig(useQA);
    useTimesheet(config);
    await mockQueryFns[0]();
    expect(mockGetAuthToken).toHaveBeenCalledWith(CREDENTIALS.username, CREDENTIALS.password, useQA);
    expect(mockFetchTimesheet).toHaveBeenCalledWith(config, TOKEN, expectedCreds);
  });

  it('usePayments passes the creds to fetchPayments', async () => {
    const config = makeConfig(useQA);
    usePayments(config);
    await mockQueryFns[0]();
    expect(mockFetchPayments).toHaveBeenCalledWith(config, TOKEN, expectedCreds);
  });

  it('useEarningsHistory passes the creds to apiGet', async () => {
    mockUseConfig.mockReturnValue({ config: makeConfig(useQA) });
    useEarningsHistory(4);
    await mockQueryFns[0]();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet.mock.calls[0][0]).toBe('/api/v3/users/current/payments');
    expect(mockApiGet.mock.calls[0][2]).toBe(TOKEN);
    expect(mockApiGet.mock.calls[0][3]).toBe(useQA);
    expect(lastArg(mockApiGet)).toEqual(expectedCreds);
  });

  it('usePaymentHistory passes the creds to apiGet', async () => {
    mockUseConfig.mockReturnValue({ config: makeConfig(useQA) });
    usePaymentHistory(4);
    await mockQueryFns[0]();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet.mock.calls[0][3]).toBe(useQA);
    expect(lastArg(mockApiGet)).toEqual(expectedCreds);
  });

  describe('useHistoryBackfill', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockLoadWeeklyHistory.mockResolvedValue([]);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('passes the same creds to every work-diary apiGet', async () => {
      mockUseConfig.mockReturnValue({ config: makeConfig(useQA) });
      useHistoryBackfill();
      // The effect defers the backfill by 2 s; the first week's 7 day fetches then
      // run in parallel before the 300 ms inter-week pause (never advanced here).
      await jest.advanceTimersByTimeAsync(2000);
      expect(mockGetAuthToken).toHaveBeenCalledWith(CREDENTIALS.username, CREDENTIALS.password, useQA);
      expect(mockApiGet).toHaveBeenCalledTimes(7);
      for (let i = 0; i < 7; i++) {
        expect(mockApiGet.mock.calls[i][0]).toBe('/api/timetracking/workdiaries');
        expect(mockApiGet.mock.calls[i][1]).toEqual(expect.objectContaining({ assignmentId: '400' }));
        expect(mockApiGet.mock.calls[i][3]).toBe(useQA);
        expect(lastArg(mockApiGet, i)).toEqual(expectedCreds);
      }
    });
  });
});
