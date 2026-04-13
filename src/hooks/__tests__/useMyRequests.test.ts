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

  describe('FR4.2 — date range spans 3 weeks (prevMonday2 through today)', () => {
    it('fetches 15 days when today is Monday (Mon of current week + 2 prior full weeks)', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      mockFetchWorkDiary.mockResolvedValue([]);

      // 2026-03-09 is Monday
      // prevMonday2 = 2026-02-23, prevMonday1 = 2026-03-02, currentMonday = 2026-03-09
      // range: 2026-02-23 through 2026-03-09 = 15 days
      const queryFn = buildMyRequestsQueryFn('2026-03-09');
      await queryFn();

      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(15);
      // Current Monday is still included
      expect(mockFetchWorkDiary).toHaveBeenCalledWith('79996', '2026-03-09', CREDENTIALS, false);
      // prevMonday2 is also included
      expect(mockFetchWorkDiary).toHaveBeenCalledWith('79996', '2026-02-23', CREDENTIALS, false);
    });

    it('fetches 17 days when today is Wednesday (prevMonday2 Mon through Wed)', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      mockFetchWorkDiary.mockResolvedValue([]);

      // 2026-03-11 is Wednesday
      // currentMonday = 2026-03-09, prevMonday1 = 2026-03-02, prevMonday2 = 2026-02-23
      // range: 2026-02-23 through 2026-03-11 = 17 days
      const queryFn = buildMyRequestsQueryFn('2026-03-11');
      await queryFn();

      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(17);
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
        // Only return a manual entry on Tuesday; all other days return []
        if (date === '2026-03-10') {
          return [{ tags: [], autoTracker: false, status: 'APPROVED', memo: 'Tuesday task', actions: [] }];
        }
        return [];
      });

      const queryFn = buildMyRequestsQueryFn('2026-03-10'); // Tue (Mon fails, Tue succeeds)
      const result = await queryFn();

      // Tuesday entry is returned; Monday failure doesn't suppress it
      const tuesdayEntry = result.entries.find((e) => e.date === '2026-03-10');
      expect(tuesdayEntry).toBeDefined();
      expect(tuesdayEntry?.memo).toBe('Tuesday task');
      // Not all days failed, so error should be null
      expect(result.error).toBeNull();
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

// ─── 02-contributor-history: extended date range tests ───────────────────────

describe('useMyRequests — 02-contributor-history: 3-week date range', () => {
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

  describe('CH.1 — date range starts from prevMonday2', () => {
    it('starts from 2025-03-31 when today is 2025-04-14 (Monday)', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      mockFetchWorkDiary.mockResolvedValue([]);

      const queryFn = buildMyRequestsQueryFn('2025-04-14'); // Monday
      await queryFn();

      const dates = mockFetchWorkDiary.mock.calls.map((c) => c[1] as string).sort();
      expect(dates[0]).toBe('2025-03-31'); // prevMonday2
      expect(dates[dates.length - 1]).toBe('2025-04-14'); // today
      expect(dates).toHaveLength(15); // Mon Mar 31 through Mon Apr 14 = 15 days
    });

    it('starts from 2025-03-31 when today is 2025-04-16 (Wednesday)', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      mockFetchWorkDiary.mockResolvedValue([]);

      const queryFn = buildMyRequestsQueryFn('2025-04-16'); // Wednesday
      await queryFn();

      const dates = mockFetchWorkDiary.mock.calls.map((c) => c[1] as string).sort();
      expect(dates[0]).toBe('2025-03-31'); // prevMonday2
      expect(dates[dates.length - 1]).toBe('2025-04-16'); // today
      expect(dates).toHaveLength(17); // Mon Mar 31 through Wed Apr 16 = 17 days
    });
  });

  describe('CH.2 — entries from 2 weeks ago are included', () => {
    it('includes APPROVED entries from 2 weeks ago', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      // today = 2025-04-14 (Monday)
      // prevMonday2 = 2025-03-31
      mockFetchWorkDiary.mockImplementation(async (_assignmentId, date) => {
        if (date === '2025-03-31') {
          return [
            { tags: [], autoTracker: false, status: 'APPROVED', memo: 'Two weeks ago task', actions: [] },
          ];
        }
        return [];
      });

      const queryFn = buildMyRequestsQueryFn('2025-04-14');
      const result = await queryFn();

      const twoWeeksEntry = result.entries.find((e) => e.date === '2025-03-31');
      expect(twoWeeksEntry).toBeDefined();
      expect(twoWeeksEntry?.status).toBe('APPROVED');
      expect(twoWeeksEntry?.memo).toBe('Two weeks ago task');
    });

    it('includes REJECTED entries from 2 weeks ago (auto-reject case)', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      mockFetchWorkDiary.mockImplementation(async (_assignmentId, date) => {
        if (date === '2025-04-01') {
          return [
            { tags: [], autoTracker: false, status: 'REJECTED', memo: 'Expired request', actions: [] },
          ];
        }
        return [];
      });

      const queryFn = buildMyRequestsQueryFn('2025-04-14');
      const result = await queryFn();

      const rejectedEntry = result.entries.find((e) => e.date === '2025-04-01');
      expect(rejectedEntry).toBeDefined();
      expect(rejectedEntry?.status).toBe('REJECTED');
    });

    it('includes PENDING entries from last week', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      // today = 2025-04-14 (Monday), prevMonday1 = 2025-04-07
      mockFetchWorkDiary.mockImplementation(async (_assignmentId, date) => {
        if (date === '2025-04-07') {
          return [
            { tags: [], autoTracker: false, status: 'PENDING', memo: 'Last week pending', actions: [] },
          ];
        }
        return [];
      });

      const queryFn = buildMyRequestsQueryFn('2025-04-14');
      const result = await queryFn();

      const lastWeekEntry = result.entries.find((e) => e.date === '2025-04-07');
      expect(lastWeekEntry).toBeDefined();
      expect(lastWeekEntry?.status).toBe('PENDING');
    });
  });

  describe('CH.3 — entries sorted newest-first across all 3 weeks', () => {
    it('returns entries from all 3 weeks sorted by date descending', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      mockFetchWorkDiary.mockImplementation(async (_assignmentId, date) => {
        if (date === '2025-04-14') {
          return [{ tags: [], autoTracker: false, status: 'PENDING', memo: 'This week', actions: [] }];
        }
        if (date === '2025-04-07') {
          return [{ tags: [], autoTracker: false, status: 'APPROVED', memo: 'Last week', actions: [] }];
        }
        if (date === '2025-03-31') {
          return [{ tags: [], autoTracker: false, status: 'REJECTED', memo: 'Two weeks ago', actions: [] }];
        }
        return [];
      });

      const queryFn = buildMyRequestsQueryFn('2025-04-14');
      const result = await queryFn();

      // Should have entries from all 3 weeks, newest first
      expect(result.entries.length).toBeGreaterThanOrEqual(3);
      // Verify sort order: first entry should be newest
      for (let i = 0; i < result.entries.length - 1; i++) {
        expect(result.entries[i].date >= result.entries[i + 1].date).toBe(true);
      }
    });
  });

  describe('CH.4 — regression: fetchWorkDiary called with dates spanning prevMonday2 through today', () => {
    it('calls fetchWorkDiary with prevMonday2 as earliest date', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      mockFetchWorkDiary.mockResolvedValue([]);

      // today = Wednesday 2025-04-09
      // currentMonday = 2025-04-07
      // prevMonday1 = 2025-03-31
      // prevMonday2 = 2025-03-24
      const queryFn = buildMyRequestsQueryFn('2025-04-09');
      await queryFn();

      const calledDates = mockFetchWorkDiary.mock.calls.map((c) => c[1] as string);
      expect(calledDates).toContain('2025-03-24'); // prevMonday2
      expect(calledDates).toContain('2025-04-09'); // today
      // All calls should use the correct assignmentId
      mockFetchWorkDiary.mock.calls.forEach((call) => {
        expect(call[0]).toBe('79996');
      });
    });
  });

  describe('CH.5 — partial failure: prev-week days fail, current-week entries returned', () => {
    it('returns current-week entries even when all prior-week days fail', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);

      // today = 2025-04-14 (Monday of current week)
      // currentMonday = 2025-04-14
      // prevMonday1 = 2025-04-07, prevMonday2 = 2025-03-31
      mockFetchWorkDiary.mockImplementation(async (_assignmentId, date) => {
        if (date < '2025-04-14') {
          throw new Error('Network error for old dates');
        }
        return [{ tags: [], autoTracker: false, status: 'PENDING', memo: 'Today entry', actions: [] }];
      });

      const queryFn = buildMyRequestsQueryFn('2025-04-14');
      const result = await queryFn();

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].date).toBe('2025-04-14');
      // Not all days failed (today succeeded), so error should be null
      expect(result.error).toBeNull();
    });
  });
});
