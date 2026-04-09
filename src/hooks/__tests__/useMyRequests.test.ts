// Tests: useMyRequests hook — FR4 (01-my-requests-data)
// Spec: features/app/approvals-transparency/specs/01-my-requests-data
//
// Strategy: Static analysis of the hook source file + AsyncStorage/mock
// integration tests. renderHook via @testing-library/react-hooks is not
// used here (problematic in jest-expo/node preset as seen in useAIData tests).
// We validate contracts via static analysis + by testing the queryFn directly
// through mocked dependencies.

import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/workDiary', () => ({
  fetchWorkDiary: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { loadConfig, loadCredentials } from '../../store/config';
import { fetchWorkDiary } from '../../api/workDiary';
import { AuthError, NetworkError } from '../../api/errors';

const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;
const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;
const mockFetchWorkDiary = fetchWorkDiary as jest.MockedFunction<typeof fetchWorkDiary>;

// ─── Static analysis ──────────────────────────────────────────────────────────

const HOOK_PATH = path.resolve(__dirname, '../../..', 'src', 'hooks', 'useMyRequests.ts');

describe('useMyRequests — static analysis of source contract', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, 'utf8');
  });

  it('FR4.SC1 — exports useMyRequests function', () => {
    expect(source).toMatch(/export\s+function\s+useMyRequests/);
  });

  it('FR4.SC2 — uses TanStack Query (useQuery)', () => {
    expect(source).toMatch(/useQuery/);
  });

  it('FR4.SC3 — queryKey includes myRequests', () => {
    expect(source).toMatch(/['"]myRequests['"]/);
  });

  it('FR4.SC4 — staleTime is 60000', () => {
    expect(source).toMatch(/staleTime\s*:\s*60[_]?000/);
  });

  it('FR4.SC5 — enabled guard uses !!assignmentId', () => {
    expect(source).toMatch(/enabled\s*:\s*!!\s*\w*[Aa]ssignment[Ii]d/);
  });

  it('FR4.SC6 — uses loadConfig from store/config', () => {
    expect(source).toMatch(/loadConfig/);
  });

  it('FR4.SC7 — uses loadCredentials from store/config', () => {
    expect(source).toMatch(/loadCredentials/);
  });

  it('FR4.SC8 — calls fetchWorkDiary', () => {
    expect(source).toMatch(/fetchWorkDiary/);
  });

  it('FR4.SC9 — calls getWeekStartDate', () => {
    expect(source).toMatch(/getWeekStartDate/);
  });

  it('FR4.SC10 — calls groupSlotsIntoEntries', () => {
    expect(source).toMatch(/groupSlotsIntoEntries/);
  });

  it('FR4.SC11 — uses Promise.allSettled for parallel fetching', () => {
    expect(source).toMatch(/Promise\.allSettled/);
  });

  it('FR4.SC12 — sorts entries by date descending', () => {
    // Should compare dates in descending order
    expect(source).toMatch(/sort/);
  });

  it('FR4.SC13 — maps 401/403 to auth error', () => {
    expect(source).toMatch(/['"]auth['"]/);
  });

  it('FR4.SC14 — maps network error to network error string', () => {
    expect(source).toMatch(/['"]network['"]/);
  });

  it('FR4.SC15 — returns refetch function', () => {
    expect(source).toMatch(/refetch/);
  });

  it('FR4.SC16 — imports UseMyRequestsResult type', () => {
    expect(source).toMatch(/UseMyRequestsResult/);
  });
});

// ─── Fetch function contract tests ───────────────────────────────────────────
// We extract and test the fetch logic by importing internal helpers via
// the module's queryFn pattern. Since the queryFn is an async function,
// we test it by driving the mocks and calling the exported helper directly.

import { buildMyRequestsQueryFn } from '../../hooks/useMyRequests';

describe('useMyRequests — buildMyRequestsQueryFn (query logic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const CREDENTIALS = { username: 'user@example.com', password: 'pass123' };
  const CONFIG = {
    assignmentId: '79996',
    userId: '1190137',
    managerId: '2372227',
    primaryTeamId: 4584,
    teams: [],
    hourlyRate: 30,
    useQA: false,
    isManager: false,
    fullName: 'Test User',
    lastRoleCheck: null,
    debugMode: false,
  };

  describe('FR4.1 — returns entries sorted by date descending', () => {
    it('sorts multiple entries newest-first', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      // Mock fetchWorkDiary to return manual slots for two different dates
      // We fix today to a Wednesday (2026-03-11) in the test date range by
      // passing a fixed "today" date to buildMyRequestsQueryFn
      mockFetchWorkDiary.mockImplementation(async (assignmentId, date) => {
        if (date === '2026-03-09') { // Monday
          return [{ tags: [], autoTracker: false, status: 'PENDING', memo: 'Monday work', actions: [] }];
        }
        if (date === '2026-03-10') { // Tuesday
          return [{ tags: [], autoTracker: false, status: 'APPROVED', memo: 'Tuesday work', actions: [] }];
        }
        return [];
      });

      const queryFn = buildMyRequestsQueryFn('2026-03-10'); // today = Tuesday
      const result = await queryFn();

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].date).toBe('2026-03-10'); // newest first
      expect(result.entries[1].date).toBe('2026-03-09');
    });
  });

  describe('FR4.2 — date range Mon through today', () => {
    it('fetches exactly 1 day when today is Monday', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      mockFetchWorkDiary.mockResolvedValue([]);

      const queryFn = buildMyRequestsQueryFn('2026-03-09'); // Monday
      await queryFn();

      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(1);
      expect(mockFetchWorkDiary).toHaveBeenCalledWith('79996', '2026-03-09', CREDENTIALS, false);
    });

    it('fetches 3 days when today is Wednesday', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      mockFetchWorkDiary.mockResolvedValue([]);

      const queryFn = buildMyRequestsQueryFn('2026-03-11'); // Wednesday
      await queryFn();

      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(3);
    });
  });

  describe('FR4.3 — missing assignmentId', () => {
    it('returns empty entries with no error when assignmentId is missing', async () => {
      mockLoadConfig.mockResolvedValue({ ...CONFIG, assignmentId: '' } as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      const queryFn = buildMyRequestsQueryFn('2026-03-11');
      const result = await queryFn();

      expect(result.entries).toEqual([]);
      expect(result.error).toBeNull();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    });

    it('returns empty entries when config is null', async () => {
      mockLoadConfig.mockResolvedValue(null);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      const queryFn = buildMyRequestsQueryFn('2026-03-11');
      const result = await queryFn();

      expect(result.entries).toEqual([]);
      expect(result.error).toBeNull();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    });
  });

  describe('FR4.4 — partial day failure', () => {
    it('returns data from successful days when one day fails', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      mockFetchWorkDiary.mockImplementation(async (assignmentId, date) => {
        if (date === '2026-03-09') {
          throw new Error('Network error');
        }
        return [{ tags: [], autoTracker: false, status: 'APPROVED', memo: 'Tuesday task', actions: [] }];
      });

      const queryFn = buildMyRequestsQueryFn('2026-03-10'); // Tue (Mon fails, Tue succeeds)
      const result = await queryFn();

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].date).toBe('2026-03-10');
    });
  });

  describe('FR4.5 — no manual entries', () => {
    it('returns empty entries with null error when no manual time this week', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      mockFetchWorkDiary.mockResolvedValue([
        { tags: [], autoTracker: true, status: 'APPROVED', memo: '', actions: [] },
      ]);

      const queryFn = buildMyRequestsQueryFn('2026-03-11');
      const result = await queryFn();

      expect(result.entries).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('FR4.6 — error mapping', () => {
    it('maps 401 AuthError to error: "auth"', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      mockFetchWorkDiary.mockRejectedValue(new AuthError(401));

      // Monday only — all days fail → auth error bubbles up
      const queryFn = buildMyRequestsQueryFn('2026-03-09');
      const result = await queryFn();

      expect(result.error).toBe('auth');
      expect(result.entries).toEqual([]);
    });

    it('maps NetworkError to error: "network"', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      mockFetchWorkDiary.mockRejectedValue(new NetworkError('Connection refused'));

      const queryFn = buildMyRequestsQueryFn('2026-03-09'); // Monday only
      const result = await queryFn();

      expect(result.error).toBe('network');
      expect(result.entries).toEqual([]);
    });
  });
});
