// 1.2 WorkSmart dashboard parity: usePayDays (src/hooks/usePayDays.ts).
//
// renderHook is not viable under jest-expo/node, so — as in hooksCredsForwarding.test.ts —
// `useQuery` is mocked to capture its options and the queryFn is called directly. The
// credential store, getAuthToken and fetchPayDays are mocked; the real toAuthCreds builds
// the renewal creds.

import { loadCredentials } from '../../store/config';
import { getAuthToken } from '../../api/client';
import { fetchPayDays } from '../../api/hoursOverview';
import { AuthError, shouldRetryOnce } from '../../api/errors';
import { PAY_DAYS_STALE_MS, usePayDays } from '../usePayDays';
import { normalizePayDays } from '../../lib/hoursOverview';
import { PAY_DAYS_RAW } from '../../__fixtures__/hoursOverview';
import type { CrossoverConfig } from '../../types/config';

let mockQueryOpts: Record<string, any>[] = [];

jest.mock('@tanstack/react-query', () => ({
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
  fetchPayDays: jest.fn(),
}));

const mockLoadCredentials = loadCredentials as jest.Mock;
const mockGetAuthToken = getAuthToken as jest.Mock;
const mockFetchPayDays = fetchPayDays as jest.Mock;

const CREDENTIALS = { username: 'worker@example.com', password: 's3cret' };
const TOKEN = 'token-abc';
const PAY_DAYS = normalizePayDays(PAY_DAYS_RAW);

function makeConfig(overrides: Partial<CrossoverConfig> = {}): CrossoverConfig {
  return {
    userId: '2362707',
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
  mockLoadCredentials.mockResolvedValue(CREDENTIALS);
  mockGetAuthToken.mockResolvedValue(TOKEN);
  mockFetchPayDays.mockResolvedValue(PAY_DAYS);
});

describe('usePayDays', () => {
  it('keys on [payDays, userId, env]', () => {
    usePayDays(makeConfig());
    expect(lastOpts().queryKey).toEqual(['payDays', '2362707', 'prod']);

    usePayDays(makeConfig({ userId: '42', useQA: true }));
    expect(lastOpts().queryKey).toEqual(['payDays', '42', 'qa']);
  });

  it('is enabled once config has a userId', () => {
    usePayDays(makeConfig());
    expect(lastOpts().enabled).toBe(true);
  });

  it('is disabled without config or without a userId', () => {
    usePayDays(null);
    expect(lastOpts().enabled).toBe(false);
    expect(lastOpts().queryKey).toEqual(['payDays', null, 'prod']);

    usePayDays(makeConfig({ userId: '' }));
    expect(lastOpts().enabled).toBe(false);
  });

  it('is fresh for 30 minutes and retries once, outages only', () => {
    usePayDays(makeConfig());
    expect(PAY_DAYS_STALE_MS).toBe(30 * 60 * 1000);
    expect(lastOpts().staleTime).toBe(PAY_DAYS_STALE_MS);
    expect(lastOpts().retry).toBe(shouldRetryOnce);
  });

  it.each([false, true])('queryFn forwards the token and toAuthCreds(credentials, useQA=%s)', async (useQA) => {
    usePayDays(makeConfig({ useQA }));
    const result = await lastOpts().queryFn();

    expect(result).toBe(PAY_DAYS);
    expect(mockGetAuthToken).toHaveBeenCalledWith(CREDENTIALS.username, CREDENTIALS.password, useQA);
    expect(mockFetchPayDays).toHaveBeenCalledWith(TOKEN, useQA, { ...CREDENTIALS, useQA });
  });

  it('queryFn rejects without credentials and never fetches', async () => {
    mockLoadCredentials.mockResolvedValue(null);
    usePayDays(makeConfig());

    await expect(lastOpts().queryFn()).rejects.toThrow('No credentials');
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockFetchPayDays).not.toHaveBeenCalled();
  });

  it('queryFn lets a fetch failure propagate (a manager account may have no pay days)', async () => {
    const forbidden = new AuthError(403);
    mockFetchPayDays.mockRejectedValue(forbidden);
    usePayDays(makeConfig());

    await expect(lastOpts().queryFn()).rejects.toBe(forbidden);
    // A real 403 is a credential/permission answer, never retried.
    expect(shouldRetryOnce(0, forbidden)).toBe(false);
  });
});
