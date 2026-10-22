// Tests: useMyRequests hook — FR4 (01-my-requests-data)
// Spec: features/app/approvals-transparency/specs/01-my-requests-data
// Extended by features/app/durable-data/specs/02-requests-store FR4 (DD2.40-DD2.54):
// the store-backed queryFn (merge on success, throw on total failure, seed-then-throw),
// and FR5 (DD2.55-DD2.58): the hook's retry predicate, selectMyRequests (owner and
// dev-mock display rule), toRequestsError, and the env switch's removal of the view.
//
// Strategy: Static analysis of the hook source file + AsyncStorage/mock
// integration tests. renderHook via @testing-library/react-hooks is not
// used here (problematic in jest-expo/node preset as seen in useAIData tests).
// We validate contracts via static analysis + by testing the queryFn directly
// through mocked dependencies.
//
// The DD2 cases run the real planner and the real my_requests_v1 store against the
// in-memory AsyncStorage __mocks__ (reset before every queryFn case), with
// `fetchWorkDiary`, `loadConfig` / `loadCredentials` and ../../lib/log mocked. `loadConfig`
// uses mockResolvedValue (not ...Once): the store re-checks the owner twice per write.
// Fixture times are local wall-clock times, so the cases hold in any host time zone.
//
// DD2.55 calls the hook as a plain function: `useQuery` and `useConfig` are mocked to
// capture the options and feed a query result (as in hooksCredsForwarding.test.ts). The
// rest of @tanstack/react-query is the real one, so the QueryClient cases are unaffected.

import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, useQuery } from '@tanstack/react-query';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/workDiary', () => ({
  fetchWorkDiary: jest.fn(),
}));

jest.mock('../../lib/log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));

jest.mock('../../hooks/useConfig', () => ({
  useConfig: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { loadConfig, loadCredentials } from '../../store/config';
import { fetchWorkDiary } from '../../api/workDiary';
import { useConfig } from '../../hooks/useConfig';
import { ApiError, AuthError, NetworkError, AUTH_HTML_500, NO_CREDENTIALS } from '../../api/errors';
import { log } from '../../lib/log';
import { MOCK_MY_REQUESTS } from '../../lib/devMock';
import type { MyRequestsStore, RequestsStoreOwner, StoredRequestDay } from '../../lib/requestsStore';
import type { CrossoverConfig } from '../../types/config';
import type { ManualRequestEntry, ManualRequestStatus, MyRequestsData } from '../../types/requests';

const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;
const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;
const mockFetchWorkDiary = fetchWorkDiary as jest.MockedFunction<typeof fetchWorkDiary>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const mockWarn = log.warn as jest.Mock;
const mockUseQuery = useQuery as jest.Mock;
const mockUseConfig = useConfig as jest.Mock;

// ─── Static analysis ──────────────────────────────────────────────────────────

const HOOK_PATH = path.resolve(__dirname, '../../..', 'src', 'hooks', 'useMyRequests.ts');
const PLANNER_PATH = path.resolve(__dirname, '../../..', 'src', 'lib', 'requestsPlanner.ts');
const STORE_PATH = path.resolve(__dirname, '../../..', 'src', 'lib', 'requestsStore.ts');

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

  // Re-pointed by durable-data 02 FR5: the date math moved to src/lib/requestsPlanner.ts,
  // so the hook plans through it and the planner owns getWeekStartDate (also DD2.25).
  it('FR4.SC9 — plans the refresh with planRequestRefresh (the planner calls getWeekStartDate)', () => {
    expect(source).toMatch(/planRequestRefresh/);
    expect(fs.readFileSync(PLANNER_PATH, 'utf8')).toMatch(/getWeekStartDate/);
  });

  it('FR4.SC10 — calls groupSlotsIntoEntries', () => {
    expect(source).toMatch(/groupSlotsIntoEntries/);
  });

  it('FR4.SC11 — uses Promise.allSettled for parallel fetching', () => {
    expect(source).toMatch(/Promise\.allSettled/);
  });

  // Re-pointed by durable-data 02 FR5: the date-descending sort moved to the store's view
  // builders (buildRequestsView / composeRequestsView); the same check as DD2.39.
  it('FR4.SC12 — sorts entries by date descending (in src/lib/requestsStore.ts)', () => {
    expect(fs.readFileSync(STORE_PATH, 'utf8')).toMatch(/sort/);
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

  it('DD2.55 — retries through the shared predicate: retry: shouldRetryQuery, no more retry: 2', () => {
    expect(source).toMatch(/retry:\s*shouldRetryQuery/);
    expect(source).not.toMatch(/retry:\s*2\b/);
  });
});

// ─── Fetch function contract tests ───────────────────────────────────────────
// We extract and test the fetch logic by importing internal helpers via
// the module's queryFn pattern. Since the queryFn is an async function,
// we test it by driving the mocks and calling the exported helper directly.

import {
  buildMyRequestsQueryFn,
  markMyRequestsForcedRefresh,
  selectMyRequests,
  toRequestsError,
  useMyRequests,
} from '../../hooks/useMyRequests';
import type { WorkDiarySlot } from '../../types/api';

/** Minimal WorkDiarySlot for test mocks — only fields relevant to useMyRequests logic. */
function makeSlot(overrides: Pick<WorkDiarySlot, 'autoTracker' | 'status' | 'memo' | 'tags' | 'actions'>): WorkDiarySlot {
  return {
    date: '2026-06-09T12:00:00Z',
    time: '12:00:00',
    activityLevel: 0,
    intensityScore: 0,
    productivityCategory: 'UNCATEGORIZED',
    activities: [],
    secondBrainDeepDive: null,
    ...overrides,
  };
}

describe('useMyRequests — buildMyRequestsQueryFn (query logic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // DD2: the queryFn now persists my_requests_v1, so each case starts from an empty store.
    mockAsyncStorage._reset();
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
          return [makeSlot({ tags: [], autoTracker: false, status: 'PENDING', memo: 'Monday work', actions: [] })];
        }
        if (date === '2026-03-10') { // Tuesday
          return [makeSlot({ tags: [], autoTracker: false, status: 'APPROVED', memo: 'Tuesday work', actions: [] })];
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
          return [makeSlot({ tags: [], autoTracker: false, status: 'APPROVED', memo: 'Tuesday task', actions: [] })];
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
        makeSlot({ tags: [], autoTracker: true, status: 'APPROVED', memo: '', actions: [] }),
      ]);

      const queryFn = buildMyRequestsQueryFn('2026-03-11');
      const result = await queryFn();

      expect(result.entries).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // Rewritten by durable-data 02 FR4. The old cases encoded the bug: a total failure
  // resolved `{entries: [], error}`, which TanStack saved as a successful empty list. The
  // queryFn now rejects, so TanStack keeps the previous data and retries.
  describe('FR4.6 — total failure rejects with the error', () => {
    it('rejects with the AuthError when every day fails with AuthError(401)', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      const err = new AuthError(401);
      mockFetchWorkDiary.mockRejectedValue(err);

      // Monday on an empty store: 15 planned days, all failing
      const thrown = await buildMyRequestsQueryFn('2026-03-09')().then(
        () => 'resolved',
        (e: unknown) => e,
      );

      expect(thrown).toBeInstanceOf(AuthError);
      expect(thrown).toBe(err);
      expect(refreshFailedLogs()).toEqual([{ plannedDays: 15, failedDays: 15, kind: 'auth' }]);
    });

    it('rejects with the NetworkError when every day fails with NetworkError', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      const err = new NetworkError('Connection refused');
      mockFetchWorkDiary.mockRejectedValue(err);

      const queryFn = buildMyRequestsQueryFn('2026-03-09'); // Monday: 15 planned days

      await expect(queryFn()).rejects.toBe(err);
      expect(refreshFailedLogs()).toEqual([{ plannedDays: 15, failedDays: 15, kind: 'network' }]);
    });

    it('prefers a real AuthError over the other rejection reasons', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      const authErr = new AuthError(401);
      mockFetchWorkDiary.mockImplementation(async (_id, date) => {
        throw date === '2026-02-25' ? authErr : new NetworkError('Connection refused');
      });

      await expect(buildMyRequestsQueryFn('2026-03-09')()).rejects.toBe(authErr);
      expect(refreshFailedLogs()).toEqual([{ plannedDays: 15, failedDays: 15, kind: 'auth' }]);
    });

    it('does not prefer an AUTH_HTML_500 AuthError: the first rejection (today, newest first) wins', async () => {
      mockLoadConfig.mockResolvedValue(CONFIG as any);
      mockLoadCredentials.mockResolvedValue(CREDENTIALS);
      const netErr = new NetworkError('Connection refused');
      mockFetchWorkDiary.mockImplementation(async (_id, date) => {
        throw date === '2026-03-09'
          ? netErr
          : new AuthError(401, 'HTML 500', { errorCode: AUTH_HTML_500 });
      });

      await expect(buildMyRequestsQueryFn('2026-03-09')()).rejects.toBe(netErr);
      expect(refreshFailedLogs()).toEqual([{ plannedDays: 15, failedDays: 15, kind: 'network' }]);
    });
  });
});

// ─── 02-contributor-history: extended date range tests ───────────────────────

describe('useMyRequests — 02-contributor-history: 3-week date range', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // DD2: the queryFn now persists my_requests_v1, so each case starts from an empty store.
    mockAsyncStorage._reset();
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
            makeSlot({ tags: [], autoTracker: false, status: 'APPROVED', memo: 'Two weeks ago task', actions: [] }),
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
            makeSlot({ tags: [], autoTracker: false, status: 'REJECTED', memo: 'Expired request', actions: [] }),
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
            makeSlot({ tags: [], autoTracker: false, status: 'PENDING', memo: 'Last week pending', actions: [] }),
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
          return [makeSlot({ tags: [], autoTracker: false, status: 'PENDING', memo: 'This week', actions: [] })];
        }
        if (date === '2025-04-07') {
          return [makeSlot({ tags: [], autoTracker: false, status: 'APPROVED', memo: 'Last week', actions: [] })];
        }
        if (date === '2025-03-31') {
          return [makeSlot({ tags: [], autoTracker: false, status: 'REJECTED', memo: 'Two weeks ago', actions: [] })];
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
        return [makeSlot({ tags: [], autoTracker: false, status: 'PENDING', memo: 'Today entry', actions: [] })];
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

// ─── durable-data 02-requests-store FR4: store-backed queryFn ────────────────

const KEY = 'my_requests_v1';
const QUERY_KEY = ['myRequests', '79996'];
const PROD_KEY = '79996|prod';
const QA_KEY = '79996|qa';
const CREDS = { username: 'user@example.com', password: 'pass123' };

const PROD: RequestsStoreOwner = { assignmentId: '79996', useQA: false };

const DD_CONFIG: CrossoverConfig = {
  userId: '1190137',
  fullName: 'Test User',
  managerId: '2372227',
  primaryTeamId: '4584',
  teams: [{ id: '4584', name: 'Team Alpha', company: 'Acme Corp' }],
  hourlyRate: 30,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  assignmentId: '79996',
  lastRoleCheck: '2026-03-08T00:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
};
const QA_CONFIG: CrossoverConfig = { ...DD_CONFIG, useQA: true };

// A Wednesday. currentMonday 2026-03-09, catchUpStart 2026-02-23 (17 window days),
// retentionStart 2025-09-29.
const WED = '2026-03-11';
const TUE = '2026-03-10';
const MON = '2026-03-09';
const CATCH_UP = '2026-02-23';
const OLDER = '2026-02-17'; // before catchUpStart, inside retention: never planned without a record

// ─── Calendar oracle (UTC arithmetic, independent of the module under test) ──

function shift(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Inclusive `from..to`, newest first (the planner's order). */
function desc(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = to; d >= from; d = shift(d, -1)) out.push(d);
  return out;
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shift(date, -(dow === 0 ? 6 : dow - 1));
}

const catchUpOf = (today: string) => shift(mondayOf(today), -14);

/** Epoch ms of a local wall-clock time, e.g. local('2026-03-11T08:00'). */
const local = (wallClock: string): number => Date.parse(`${wallClock}:00`);

/** A `fetchedAt` as the queryFn writes it: new Date(nowMs).toISOString(). */
const isoAt = (wallClock: string): string => new Date(local(wallClock)).toISOString();

/** `nowMs` defaults to local noon of `todayOverride` when no `nowOverride` is given. */
const NOON = isoAt(`${WED}T12:00`);
const EIGHT = isoAt(`${WED}T08:00`);

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A one-slot manual request, as groupSlotsIntoEntries builds it. */
function entry(date: string, memo: string, status: ManualRequestStatus): ManualRequestEntry {
  return { id: `${date}|${memo}`, date, durationMinutes: 10, memo, status, rejectionReason: null };
}

/** A work-diary slot that groupSlotsIntoEntries turns into `entry(date, memo, status)`. */
function manual(memo: string, status: ManualRequestStatus): WorkDiarySlot {
  return makeSlot({ tags: [], autoTracker: false, status, memo, actions: [] });
}

/** Tracked (non-manual) time only: a day with no manual requests. */
function tracked(): WorkDiarySlot {
  return makeSlot({ tags: [], autoTracker: true, status: 'APPROVED', memo: '', actions: [] });
}

/** A stored day fetched at local `wallClock`, `settled` as isDaySettled defines it. */
function rec(date: string, wallClock: string, entries: ManualRequestEntry[] = []): StoredRequestDay {
  const fetchDay = wallClock.slice(0, 10);
  const settled =
    entries.every((e) => e.status !== 'PENDING') && fetchDay >= shift(mondayOf(date), 8);
  return { date, fetchedAt: isoAt(wallClock), entries, settled };
}

/** Every date in catchUpStart..today recorded at `wallClock`, with optional entries per date. */
function windowRecords(
  today: string,
  wallClock: string,
  entriesByDate: Record<string, ManualRequestEntry[]> = {},
): StoredRequestDay[] {
  return desc(catchUpOf(today), today).map((d) => rec(d, wallClock, entriesByDate[d] ?? []));
}

/** Writes my_requests_v1 as an earlier run left it; returns the exact string. */
async function seedStore(days: StoredRequestDay[], owner: RequestsStoreOwner = PROD): Promise<string> {
  const store: MyRequestsStore = {
    version: 1,
    owner,
    days: Object.fromEntries(days.map((d) => [d.date, d])),
  };
  const raw = JSON.stringify(store);
  await AsyncStorage.setItem(KEY, raw);
  mockAsyncStorage.setItem.mockClear();
  return raw;
}

async function readStore(): Promise<MyRequestsStore | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw === null ? null : (JSON.parse(raw) as MyRequestsStore);
}

/** setItem calls that wrote my_requests_v1. */
function storeWrites(): unknown[][] {
  return mockAsyncStorage.setItem.mock.calls.filter(([k]) => k === KEY);
}

/** Dates passed to fetchWorkDiary, in call order. */
function calledDates(): string[] {
  return mockFetchWorkDiary.mock.calls.map((c) => c[1] as string);
}

/** Meta of every log.warn('requests.refresh_failed', …) call. */
function refreshFailedLogs(): unknown[] {
  return mockWarn.mock.calls.filter(([c]) => c === 'requests.refresh_failed').map(([, meta]) => meta);
}

type DayResult = WorkDiarySlot[] | undefined | Error;

/** fetchWorkDiary per date: an array resolves, `undefined` resolves (empty body), an Error rejects. */
function serveDiary(byDate: Record<string, DayResult>, fallback: DayResult = []): void {
  mockFetchWorkDiary.mockImplementation(async (_id, date) => {
    const r = Object.prototype.hasOwnProperty.call(byDate, date) ? byDate[date] : fallback;
    if (r instanceof Error) throw r;
    return r as WorkDiarySlot[];
  });
}

function signedIn(config: CrossoverConfig = DD_CONFIG): void {
  mockLoadConfig.mockResolvedValue(config);
  mockLoadCredentials.mockResolvedValue(CREDS);
}

/** A view as this spec's queryFn caches it. */
function view(
  entries: ManualRequestEntry[],
  ownerKey: string,
  updatedAt: string | null = EIGHT,
): MyRequestsData {
  return { entries, error: null, staleDates: [], updatedAt, ownerKey };
}

/** A deep copy, to compare against after the code under test has run. */
const snapshot = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let clients: QueryClient[] = [];

/** A real QueryClient (no retries), optionally holding `prior` under ['myRequests','79996']. */
function newClient(prior?: unknown): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (prior !== undefined) client.setQueryData(QUERY_KEY, prior);
  clients.push(client);
  return client;
}

const ctxOf = (client: QueryClient) => ({ client, queryKey: QUERY_KEY });

afterEach(() => {
  clients.forEach((c) => c.clear());
  clients = [];
});

// One request on each of Mon, Tue and Wed; the whole window fetched at 08:00 today.
const MON_REQ = entry(MON, 'Monday request', 'APPROVED');
const TUE_REQ = entry(TUE, 'Tuesday request', 'REJECTED');
const WED_REQ = entry(WED, 'Wednesday request', 'PENDING');
const threeRequestStore = () =>
  windowRecords(WED, `${WED}T08:00`, { [MON]: [MON_REQ], [TUE]: [TUE_REQ], [WED]: [WED_REQ] });

describe('useMyRequests — DD2 store-backed queryFn (durable-data 02 FR4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage._reset();
  });

  describe('DD2.40 — first run stores every planned day', () => {
    it('writes a record for each of the 17 window days, empty days included, stamped at nowMs', async () => {
      signedIn();
      serveDiary({
        [TUE]: [manual('Tuesday work', 'PENDING')],
        '2026-03-02': [manual('Last week work', 'APPROVED')],
      });

      const result = await buildMyRequestsQueryFn(WED)();

      const stored = await readStore();
      expect(stored).not.toBeNull();
      expect(stored!.version).toBe(1);
      expect(stored!.owner).toEqual(PROD);
      expect(Object.keys(stored!.days).sort()).toEqual(desc(CATCH_UP, WED).reverse());
      for (const d of desc(CATCH_UP, WED)) {
        expect(stored!.days[d].date).toBe(d);
        expect(stored!.days[d].fetchedAt).toBe(NOON);
      }
      // An empty day is a real record, not a missing one
      expect(stored!.days[WED].entries).toEqual([]);
      expect(stored!.days['2026-02-23'].entries).toEqual([]);
      expect(stored!.days[TUE].entries).toEqual([entry(TUE, 'Tuesday work', 'PENDING')]);
      // settled = isDaySettled(date, entries, today): closed weeks fetched after their Tuesday
      expect(stored!.days['2026-02-23'].settled).toBe(true);
      expect(stored!.days['2026-03-02'].settled).toBe(true);
      expect(stored!.days['2026-03-08'].settled).toBe(true);
      expect(stored!.days[MON].settled).toBe(false);
      expect(stored!.days[TUE].settled).toBe(false);

      expect(result).toEqual({
        entries: [entry(TUE, 'Tuesday work', 'PENDING'), entry('2026-03-02', 'Last week work', 'APPROVED')],
        error: null,
        staleDates: [],
        updatedAt: NOON,
        ownerKey: PROD_KEY,
      });
    });

    it('a second run 5 min later fetches only today', async () => {
      signedIn();
      mockFetchWorkDiary.mockResolvedValue([]);

      await buildMyRequestsQueryFn(WED, () => local(`${WED}T12:00`))();
      expect(calledDates()).toHaveLength(17);
      mockFetchWorkDiary.mockClear();

      await buildMyRequestsQueryFn(WED, () => local(`${WED}T12:05`))();
      expect(calledDates()).toEqual([WED]);
    });
  });

  describe('DD2.42 — a successful empty day clears that day', () => {
    it('a day that now returns no manual slots loses its old entry in the store and the view', async () => {
      signedIn();
      const withdrawn = entry(TUE, 'Withdrawn request', 'PENDING');
      await seedStore(windowRecords(WED, `${WED}T08:00`, { [TUE]: [withdrawn] }));
      const client = newClient(view([withdrawn], PROD_KEY));
      // At noon Tuesday's PENDING record is past the 15-min TTL; the server now has tracked time only
      serveDiary({ [TUE]: [tracked()] });

      const result = await buildMyRequestsQueryFn(WED)(ctxOf(client));

      expect(calledDates()).toContain(TUE);
      expect((await readStore())!.days[TUE]).toEqual({
        date: TUE,
        fetchedAt: NOON,
        entries: [],
        settled: false,
      });
      expect(result.entries).toEqual([]);
      expect(result.staleDates).toEqual([]);
    });
  });

  describe('DD2.43 — partial failure merges only the days that succeeded', () => {
    it('Mon and Wed fail, Tue flips PENDING → APPROVED: 3 entries, staleDates, failed records untouched', async () => {
      signedIn();
      const before = windowRecords(WED, `${WED}T08:00`, {
        [MON]: [entry(MON, 'Monday request', 'PENDING')],
        [TUE]: [entry(TUE, 'Tuesday request', 'PENDING')],
        [WED]: [entry(WED, 'Wednesday request', 'PENDING')],
      });
      await seedStore(before);
      const recordBefore = (d: string) => JSON.stringify(before.find((r) => r.date === d));
      serveDiary({
        [MON]: new NetworkError('offline'),
        [WED]: new NetworkError('offline'),
        [TUE]: [manual('Tuesday request', 'APPROVED')],
      });

      const result = await buildMyRequestsQueryFn(WED)();

      // At noon the three PENDING days are past the 15-min TTL; every other day was fetched
      // today and is settled or fresh, so it is not planned.
      expect(calledDates()).toEqual([WED, TUE, MON]);
      expect(result.entries.map((e) => [e.date, e.status])).toEqual([
        [WED, 'PENDING'],
        [TUE, 'APPROVED'],
        [MON, 'PENDING'],
      ]);
      expect(result.staleDates).toEqual([WED, MON]);
      expect(result.error).toBeNull();
      expect(result.updatedAt).toBe(NOON);
      expect(result.ownerKey).toBe(PROD_KEY);

      const stored = (await readStore())!;
      expect(JSON.stringify(stored.days[MON])).toBe(recordBefore(MON));
      expect(JSON.stringify(stored.days[WED])).toBe(recordBefore(WED));
      expect(stored.days[TUE]).toEqual({
        date: TUE,
        fetchedAt: NOON,
        entries: [entry(TUE, 'Tuesday request', 'APPROVED')],
        settled: false,
      });
    });
  });

  describe('DD2.44 — an empty body (undefined) is a failure, [] is an empty day', () => {
    it('undefined → staleDates and the old record is kept; [] → stored with entries: []', async () => {
      signedIn();
      const pending = entry(TUE, 'Tuesday request', 'PENDING');
      // Everything but today was fetched at 08:00; Tuesday holds a PENDING request
      const before = windowRecords(WED, `${WED}T08:00`, { [TUE]: [pending] }).filter((r) => r.date !== WED);
      await seedStore(before);
      serveDiary({ [TUE]: undefined, [WED]: [] });

      const result = await buildMyRequestsQueryFn(WED)();

      expect(calledDates()).toEqual([WED, TUE]);
      expect(result.staleDates).toEqual([TUE]);
      expect(result.entries).toEqual([pending]);
      expect(result.error).toBeNull();
      const stored = (await readStore())!;
      expect(JSON.stringify(stored.days[TUE])).toBe(JSON.stringify(before.find((r) => r.date === TUE)));
      expect(stored.days[WED]).toEqual({ date: WED, fetchedAt: NOON, entries: [], settled: false });
    });

    it('every planned date resolving undefined rejects with a NetworkError and writes nothing', async () => {
      signedIn();
      mockFetchWorkDiary.mockResolvedValue(undefined as unknown as WorkDiarySlot[]);

      await expect(buildMyRequestsQueryFn(MON)()).rejects.toBeInstanceOf(NetworkError);

      expect(storeWrites()).toHaveLength(0);
      expect(await AsyncStorage.getItem(KEY)).toBeNull();
      expect(refreshFailedLogs()).toEqual([{ plannedDays: 15, failedDays: 15, kind: 'network' }]);
    });
  });

  describe('DD2.45 — a failed refresh never changes stored data', () => {
    it('after a good run, an all-fail run rejects, my_requests_v1 is string-equal and never rewritten', async () => {
      signedIn();
      serveDiary({ [TUE]: [manual('Tuesday request', 'PENDING')] });
      await buildMyRequestsQueryFn(WED, () => local(`${WED}T09:00`))();
      const raw = await AsyncStorage.getItem(KEY);
      expect(raw).not.toBeNull();
      mockAsyncStorage.setItem.mockClear();
      mockAsyncStorage.removeItem.mockClear();
      mockFetchWorkDiary.mockClear();
      mockFetchWorkDiary.mockRejectedValue(new NetworkError('offline'));

      // 11:00: today and Tuesday's PENDING day are planned, and both fail
      await expect(buildMyRequestsQueryFn(WED, () => local(`${WED}T11:00`))()).rejects.toBeInstanceOf(
        NetworkError,
      );

      expect(calledDates()).toEqual([WED, TUE]);
      expect(await AsyncStorage.getItem(KEY)).toBe(raw);
      expect(storeWrites()).toHaveLength(0);
      expect(mockAsyncStorage.removeItem).not.toHaveBeenCalledWith(KEY);
    });
  });

  describe('DD2.46 — credentials unavailable after the store read', () => {
    it('null credentials → rejects AuthError with errorCode NO_CREDENTIALS, without fetching', async () => {
      mockLoadConfig.mockResolvedValue(DD_CONFIG);
      mockLoadCredentials.mockResolvedValue(null);

      const thrown = await buildMyRequestsQueryFn(WED)().then(
        () => 'resolved',
        (e: unknown) => e,
      );

      expect(thrown).toBeInstanceOf(AuthError);
      expect((thrown as AuthError).statusCode).toBe(401);
      expect((thrown as AuthError).errorCode).toBe(NO_CREDENTIALS);
      expect((thrown as AuthError).errorCode).toBe('NO_CREDENTIALS');
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    });

    it('null credentials with a cold cache and a populated store → the cache is seeded from the store first', async () => {
      mockLoadConfig.mockResolvedValue(DD_CONFIG);
      mockLoadCredentials.mockResolvedValue(null);
      await seedStore(threeRequestStore());
      const client = newClient();

      await expect(buildMyRequestsQueryFn(WED)(ctxOf(client))).rejects.toMatchObject({
        errorCode: 'NO_CREDENTIALS',
      });

      expect(client.getQueryData(QUERY_KEY)).toEqual({
        entries: [WED_REQ, TUE_REQ, MON_REQ],
        error: null,
        staleDates: [],
        updatedAt: EIGHT,
        ownerKey: PROD_KEY,
      });
      // The seed carries the store's freshness, not "now"
      expect(client.getQueryState(QUERY_KEY)?.dataUpdatedAt).toBe(local(`${WED}T08:00`));
      expect(storeWrites()).toHaveLength(0);
    });

    it('null credentials with an empty store → nothing is seeded', async () => {
      mockLoadConfig.mockResolvedValue(DD_CONFIG);
      mockLoadCredentials.mockResolvedValue(null);
      const client = newClient();

      await expect(buildMyRequestsQueryFn(WED)(ctxOf(client))).rejects.toBeInstanceOf(AuthError);

      expect(client.getQueryData(QUERY_KEY)).toBeUndefined();
    });

    it('null credentials with same-owner data already cached → the cache is left as it was', async () => {
      mockLoadConfig.mockResolvedValue(DD_CONFIG);
      mockLoadCredentials.mockResolvedValue(null);
      await seedStore(threeRequestStore());
      const cached = view([entry(WED, 'Cached request', 'PENDING')], PROD_KEY, NOON);
      const client = newClient(cached);
      const expected = snapshot(cached);

      await expect(buildMyRequestsQueryFn(WED)(ctxOf(client))).rejects.toBeInstanceOf(AuthError);

      expect(client.getQueryData(QUERY_KEY)).toEqual(expected);
    });

    it('loadCredentials throws → rejects with that error, and a cold cache is seeded the same way', async () => {
      mockLoadConfig.mockResolvedValue(DD_CONFIG);
      const keychainErr = new Error('Keychain unavailable');
      mockLoadCredentials.mockRejectedValue(keychainErr);
      await seedStore(threeRequestStore());
      const client = newClient();

      await expect(buildMyRequestsQueryFn(WED)(ctxOf(client))).rejects.toBe(keychainErr);

      expect(client.getQueryData(QUERY_KEY)).toEqual({
        entries: [WED_REQ, TUE_REQ, MON_REQ],
        error: null,
        staleDates: [],
        updatedAt: EIGHT,
        ownerKey: PROD_KEY,
      });
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    });
  });

  // Review fix: a config read failure is logged before it propagates.
  it('loadConfig throws → rejects with that error, logs requests.config_read_failed, and does no store I/O', async () => {
    const storageErr = new Error('AsyncStorage unavailable');
    mockLoadConfig.mockRejectedValue(storageErr);
    mockLoadCredentials.mockResolvedValue(CREDS);
    const client = newClient();

    await expect(buildMyRequestsQueryFn(WED)(ctxOf(client))).rejects.toBe(storageErr);

    expect(mockWarn).toHaveBeenCalledWith('requests.config_read_failed', {});
    expect(mockLoadCredentials).not.toHaveBeenCalled();
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(mockAsyncStorage.getItem).not.toHaveBeenCalledWith(KEY);
    expect(client.getQueryData(QUERY_KEY)).toBeUndefined();
  });

  // Review fix: production calls buildMyRequestsQueryFn() with no overrides.
  describe('no overrides — the real clock', () => {
    beforeEach(() => {
      // Only Date is faked; timers and microtasks stay real for AsyncStorage and TanStack.
      jest.useFakeTimers({
        now: local(`${WED}T09:15`),
        doNotFake: [
          'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
          'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
          'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
        ],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('plans from todayLocal() and stamps every fetched day with Date.now(), not local noon', async () => {
      signedIn();
      serveDiary({});

      const result = await buildMyRequestsQueryFn()();

      expect(calledDates()).toEqual(desc(CATCH_UP, WED));
      const store = await readStore();
      const stamps = new Set(Object.values(store?.days ?? {}).map((d) => d.fetchedAt));
      expect([...stamps]).toEqual([isoAt(`${WED}T09:15`)]);
      expect(result.updatedAt).toBe(isoAt(`${WED}T09:15`));
    });
  });

  describe('DD2.47 — view-only carry-forward of a failed day with no record', () => {
    it('a failed day with no record but in the ctx prior stays in the view and is not stored', async () => {
      signedIn();
      // Monday has no record yet (its earlier fetches failed); the cached view still shows it.
      // The rest was fetched at 11:30, so at noon only today and Monday are planned.
      await seedStore(windowRecords(WED, `${WED}T11:30`).filter((r) => r.date !== MON));
      const monPrior = entry(MON, 'Monday request', 'PENDING');
      const client = newClient(view([monPrior], PROD_KEY));
      serveDiary({ [MON]: new NetworkError('offline') });

      const result = await buildMyRequestsQueryFn(WED)(ctxOf(client));

      expect(calledDates()).toEqual([WED, MON]);
      expect(result.entries).toEqual([monPrior]);
      expect(result.staleDates).toEqual([MON]);
      expect((await readStore())!.days[MON]).toBeUndefined();
    });

    it('with no prior, a failed day with no record is simply absent', async () => {
      signedIn();
      await seedStore(windowRecords(WED, `${WED}T11:30`).filter((r) => r.date !== MON));
      serveDiary({ [MON]: new NetworkError('offline') });

      const result = await buildMyRequestsQueryFn(WED)(ctxOf(newClient()));

      expect(result.entries).toEqual([]);
      expect(result.staleDates).toEqual([MON]);
      expect((await readStore())!.days[MON]).toBeUndefined();
    });
  });

  describe('DD2.48 — upgrade from a persisted 1.1 / 1.2.0 blob', () => {
    // The legacy shape: {entries, error}, no ownerKey. 3 entries inside the window and 2
    // older than catchUpStart (but inside retention).
    const legacyEntries = [
      entry(TUE, 'Legacy Tuesday', 'PENDING'),
      entry('2026-03-03', 'Legacy last week', 'APPROVED'),
      entry('2026-02-24', 'Legacy two weeks ago', 'REJECTED'),
      entry('2026-02-20', 'Legacy older A', 'APPROVED'),
      entry(OLDER, 'Legacy older B', 'APPROVED'),
    ];
    const legacyBlob = () => ({ entries: legacyEntries.map((e) => ({ ...e })), error: null });

    it('all fetches [] → the 2 older entries remain, the 3 in-window ones are gone, no record for the older dates', async () => {
      signedIn();
      mockFetchWorkDiary.mockResolvedValue([]);
      const client = newClient(legacyBlob());

      const result = await buildMyRequestsQueryFn(WED)(ctxOf(client));

      expect(calledDates().sort()).toEqual(desc(CATCH_UP, WED).sort()); // empty store → the whole window
      expect(result.entries).toEqual([legacyEntries[3], legacyEntries[4]]);
      expect(result.ownerKey).toBe(PROD_KEY);
      const stored = (await readStore())!;
      expect(Object.keys(stored.days)).toHaveLength(17);
      expect(stored.days['2026-02-20']).toBeUndefined();
      expect(stored.days[OLDER]).toBeUndefined();
    });

    it('total failure → rejects, and the legacy blob stays in the cache unchanged', async () => {
      signedIn();
      mockFetchWorkDiary.mockRejectedValue(new NetworkError('offline'));
      const client = newClient(legacyBlob());
      const expected = JSON.stringify(legacyBlob());

      await expect(buildMyRequestsQueryFn(WED)(ctxOf(client))).rejects.toBeInstanceOf(NetworkError);

      expect(JSON.stringify(client.getQueryData(QUERY_KEY))).toBe(expected);
      expect(await AsyncStorage.getItem(KEY)).toBeNull();
    });

    it('a legacy blob counts as same-owner data: with a populated store a total failure does not replace it', async () => {
      signedIn();
      await seedStore(threeRequestStore());
      mockFetchWorkDiary.mockRejectedValue(new NetworkError('offline'));
      const client = newClient(legacyBlob());
      const expected = JSON.stringify(legacyBlob());

      await expect(buildMyRequestsQueryFn(WED)(ctxOf(client))).rejects.toBeInstanceOf(NetworkError);

      expect(JSON.stringify(client.getQueryData(QUERY_KEY))).toBe(expected);
    });
  });

  describe('DD2.49 — owner stamp', () => {
    it("a '79996|prod' prior with a QA config carries nothing, and the result is stamped '79996|qa'", async () => {
      signedIn(QA_CONFIG);
      // Tuesday fails (no record) and OLDER is never planned: either would be carried if
      // the prod view were accepted as a prior.
      const client = newClient(
        view([entry(TUE, 'Prod request', 'PENDING'), entry(OLDER, 'Prod older', 'APPROVED')], PROD_KEY),
      );
      serveDiary({ [TUE]: new NetworkError('offline') });

      const result = await buildMyRequestsQueryFn(WED)(ctxOf(client));

      expect(mockFetchWorkDiary).toHaveBeenCalledWith('79996', WED, CREDS, true);
      expect(result.ownerKey).toBe(QA_KEY);
      expect(result.entries).toEqual([]);
      expect(result.staleDates).toEqual([TUE]);
      expect((await readStore())!.owner).toEqual({ assignmentId: '79996', useQA: true });
    });

    it("a 'dev-mock' prior with the preview off carries nothing", async () => {
      // A Monday: the mock dates 2026-03-12..14 fall in last week, inside the window
      const today = '2026-03-16';
      signedIn();
      const client = newClient({ entries: [...MOCK_MY_REQUESTS], error: null, ownerKey: 'dev-mock' });
      serveDiary(Object.fromEntries(MOCK_MY_REQUESTS.map((e) => [e.date, new NetworkError('offline')])));

      const result = await buildMyRequestsQueryFn(today)(ctxOf(client));

      expect(result.ownerKey).toBe(PROD_KEY);
      expect(result.entries).toEqual([]);
      expect(result.staleDates).toEqual(['2026-03-14', '2026-03-13', '2026-03-12']);
    });

    it("a 'dev-mock' prior does not block seeding: on a total failure the cache is seeded from the store", async () => {
      signedIn();
      await seedStore(threeRequestStore());
      const client = newClient({ entries: [...MOCK_MY_REQUESTS], error: null, ownerKey: 'dev-mock' });
      mockFetchWorkDiary.mockRejectedValue(new NetworkError('offline'));

      await expect(buildMyRequestsQueryFn(WED)(ctxOf(client))).rejects.toBeInstanceOf(NetworkError);

      // Noon: today, plus yesterday (fetched 4 h ago) by the 60-min rule
      expect(calledDates()).toEqual([WED, TUE]);
      expect(client.getQueryData(QUERY_KEY)).toEqual({
        entries: [WED_REQ, TUE_REQ, MON_REQ],
        error: null,
        staleDates: [WED, TUE],
        updatedAt: EIGHT,
        ownerKey: PROD_KEY,
      });
    });
  });

  describe('DD2.52 — unreadable store (getItem throws)', () => {
    it('resolves with the fetched days plus the prior carry-forward, and never writes', async () => {
      signedIn();
      mockAsyncStorage.getItem.mockRejectedValue(new Error('disk I/O'));
      const carried = entry(MON, 'Monday request', 'PENDING'); // Monday fails below
      const older = entry(OLDER, 'Older request', 'APPROVED'); // never planned, no record
      const client = newClient(view([carried, older], PROD_KEY));
      serveDiary({
        [TUE]: [manual('Tuesday request', 'APPROVED')],
        [MON]: new NetworkError('offline'),
      });

      const result = await buildMyRequestsQueryFn(WED)(ctxOf(client));

      expect(calledDates().sort()).toEqual(desc(CATCH_UP, WED).sort()); // nothing readable → the whole window
      expect(result.entries).toEqual([entry(TUE, 'Tuesday request', 'APPROVED'), carried, older]);
      expect(result.staleDates).toEqual([MON]);
      expect(result.error).toBeNull();
      expect(result.updatedAt).toBe(NOON);
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('DD2.53 — signed out (preserved behaviour)', () => {
    it('no config → {entries: [], error: null}, no fetch and no store write', async () => {
      mockLoadConfig.mockResolvedValue(null);
      mockLoadCredentials.mockResolvedValue(CREDS);

      const result = await buildMyRequestsQueryFn(WED)(ctxOf(newClient()));

      expect(result).toEqual({ entries: [], error: null });
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(storeWrites()).toHaveLength(0);
    });
  });
});

// ─── DD2.41: wake budget, end to end ─────────────────────────────────────────

describe('DD2 — wake budget', () => {
  // The regression test for "don't re-pull old data": the real planner and store, with
  // fetchWorkDiary resolving [] for every day. Each wake keeps the store the previous run
  // left (no _reset() between runs).
  //
  // Contrast: the old queryFn re-fetched the whole 3-week window on every run, i.e. 17
  // calls for each of the Wednesday runs below (and 16 on Tuesday, 15 on Monday).
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage._reset();
    signedIn();
    mockFetchWorkDiary.mockResolvedValue([]);
  });

  /** One queryFn run at local `today`T`time`; returns the dates it fetched. */
  async function wake(today: string, time: string): Promise<string[]> {
    jest.clearAllMocks(); // call logs only: implementations and the store persist
    await buildMyRequestsQueryFn(today, () => local(`${today}T${time}`))();
    return calledDates();
  }

  it('Tue 21:00 on an empty store → 16; Wed 08:00 → 3; 08:05 → 1; 09:30 → 2', async () => {
    expect((await wake('2026-10-20', '21:00')).sort()).toEqual(desc('2026-10-05', '2026-10-20').sort());
    expect(await wake('2026-10-21', '08:00')).toEqual(['2026-10-21', '2026-10-20', '2026-10-19']);
    expect(await wake('2026-10-21', '08:05')).toEqual(['2026-10-21']);
    expect(await wake('2026-10-21', '09:30')).toEqual(['2026-10-21', '2026-10-20']);
  });

  it('one 21:00 run each day Wed-Sun, then Mon 2026-10-26 08:00 → 8 (today + last week, unsettled until Tue)', async () => {
    expect(await wake('2026-10-20', '21:00')).toHaveLength(16);
    for (const d of ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']) {
      await wake(d, '21:00');
    }

    // Last week's 7 days were all fetched before Tuesday 2026-10-27, so none is settled;
    // the week before was settled by the Tuesday 2026-10-20 run.
    expect(await wake('2026-10-26', '08:00')).toEqual(desc('2026-10-19', '2026-10-26'));
  });
});

// ─── DD2.54: TanStack cache semantics (real QueryClient) ─────────────────────

describe('DD2 — cache semantics', () => {
  // Ported from the diagnosis repro: a failed refresh used to resolve {entries: [], error}
  // and replace the cached list with an empty "success".
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage._reset();
    signedIn();
  });

  function refetch(client: QueryClient) {
    return client.fetchQuery({
      queryKey: QUERY_KEY,
      queryFn: buildMyRequestsQueryFn(WED) as never,
      retry: false,
      networkMode: 'always',
    });
  }

  it.each<[string, () => Error]>([
    ['(a) NetworkError', () => new NetworkError('offline')],
    ['(c) AuthError(401)', () => new AuthError(401)],
  ])('%s: 3 cached entries, then an all-fail refetch → data unchanged, status error', async (_label, makeErr) => {
    await seedStore(threeRequestStore());
    const cached = view([WED_REQ, TUE_REQ, MON_REQ], PROD_KEY);
    const client = newClient(cached);
    const expected = snapshot(cached);
    const err = makeErr();
    mockFetchWorkDiary.mockRejectedValue(err);

    await expect(refetch(client)).rejects.toBe(err);

    expect(client.getQueryData(QUERY_KEY)).toEqual(expected);
    const state = client.getQueryState(QUERY_KEY);
    expect(state?.status).toBe('error');
    expect(state?.error).toBe(err);
  });

  it('(b) a partial failure through fetchQuery → updated data with staleDates, status success', async () => {
    await seedStore(
      windowRecords(WED, `${WED}T08:00`, {
        [MON]: [entry(MON, 'Monday request', 'PENDING')],
        [TUE]: [entry(TUE, 'Tuesday request', 'PENDING')],
        [WED]: [entry(WED, 'Wednesday request', 'PENDING')],
      }),
    );
    const client = newClient(
      view(
        [
          entry(WED, 'Wednesday request', 'PENDING'),
          entry(TUE, 'Tuesday request', 'PENDING'),
          entry(MON, 'Monday request', 'PENDING'),
        ],
        PROD_KEY,
      ),
    );
    serveDiary({
      [MON]: new NetworkError('offline'),
      [WED]: new NetworkError('offline'),
      [TUE]: [manual('Tuesday request', 'APPROVED')],
    });

    await refetch(client);

    const data = client.getQueryData<MyRequestsData>(QUERY_KEY)!;
    expect(data.entries.map((e) => [e.date, e.status])).toEqual([
      [WED, 'PENDING'],
      [TUE, 'APPROVED'],
      [MON, 'PENDING'],
    ]);
    expect(data.staleDates).toEqual([WED, MON]);
    expect(data.error).toBeNull();
    expect(data.ownerKey).toBe(PROD_KEY);
    expect(client.getQueryState(QUERY_KEY)?.status).toBe('success');
  });

  it('seed-then-throw: an empty client and a 3-entry store, every fetch failing → rejects, 3 entries cached, status error', async () => {
    await seedStore(threeRequestStore());
    const client = newClient();
    const err = new NetworkError('offline');
    mockFetchWorkDiary.mockRejectedValue(err);

    await expect(refetch(client)).rejects.toBe(err);

    const data = client.getQueryData<MyRequestsData>(QUERY_KEY);
    expect(data?.entries.length).toBe(3);
    expect(data?.entries).toEqual([WED_REQ, TUE_REQ, MON_REQ]);
    expect(data?.ownerKey).toBe(PROD_KEY);
    expect(client.getQueryState(QUERY_KEY)?.status).toBe('error');
  });
});

// ─── durable-data 02-requests-store FR5: hook, display rule, env switch ──────

const OLDER_REQ = entry(OLDER, 'Older request', 'APPROVED');

describe('useMyRequests — DD2.56 selectMyRequests (owner and dev-mock display rule)', () => {
  const entries = [TUE_REQ, MON_REQ];
  const legacy = (error: MyRequestsData['error'] = null): MyRequestsData => ({ entries: [...entries], error });

  it('no data yet → no entries, no error, staleDates [] and updatedAt null', () => {
    expect(selectMyRequests(undefined, DD_CONFIG, null)).toEqual({
      entries: [],
      error: null,
      staleDates: [],
      updatedAt: null,
    });
  });

  it('a legacy 1.1 / 1.2.0 blob (no ownerKey) → its entries, staleDates [] and updatedAt null', () => {
    expect(selectMyRequests(legacy(), DD_CONFIG, null)).toEqual({
      entries,
      error: null,
      staleDates: [],
      updatedAt: null,
    });
  });

  it('a view stamped with the current owner → its entries, staleDates and updatedAt', () => {
    const data: MyRequestsData = { entries, error: null, staleDates: [MON], updatedAt: NOON, ownerKey: PROD_KEY };

    expect(selectMyRequests(data, DD_CONFIG, null)).toEqual({
      entries,
      error: null,
      staleDates: [MON],
      updatedAt: NOON,
    });
    expect(selectMyRequests({ ...data, ownerKey: QA_KEY }, QA_CONFIG, null).entries).toEqual(entries);
  });

  it.each<[string, string, CrossoverConfig | null]>([
    ["a '79996|prod' view under a QA config", PROD_KEY, QA_CONFIG],
    ["a '79996|qa' view under a prod config", QA_KEY, DD_CONFIG],
    ['a view stamped for another assignment', '11111|prod', DD_CONFIG],
    ['a stamped view with no config', PROD_KEY, null],
  ])('%s → no entries', (_label, ownerKey, config) => {
    expect(selectMyRequests(view(entries, ownerKey), config, null).entries).toEqual([]);
  });

  describe("the 'dev-mock' view", () => {
    const mockView = (): MyRequestsData => ({ entries: [...MOCK_MY_REQUESTS], error: null, ownerKey: 'dev-mock' });

    it('is shown while the manager preview is on', () => {
      expect(selectMyRequests(mockView(), { ...DD_CONFIG, devManagerView: true }, null).entries).toEqual(
        MOCK_MY_REQUESTS,
      );
    });

    it.each<[string, CrossoverConfig | null]>([
      ['the preview toggled off', { ...DD_CONFIG, devManagerView: false }],
      ['the preview toggle absent', DD_CONFIG],
      ['no config', null],
    ])('is hidden with %s', (_label, config) => {
      expect(selectMyRequests(mockView(), config, null).entries).toEqual([]);
    });
  });

  describe('error', () => {
    it('the thrown query error wins over data.error', () => {
      expect(selectMyRequests(legacy('auth'), DD_CONFIG, new NetworkError('offline')).error).toBe('network');
      expect(selectMyRequests(legacy('network'), DD_CONFIG, new AuthError(401)).error).toBe('auth');
    });

    it("with no thrown error, a legacy blob's own error is kept; otherwise null", () => {
      expect(selectMyRequests(legacy('network'), DD_CONFIG, null).error).toBe('network');
      expect(selectMyRequests(legacy('auth'), DD_CONFIG, undefined).error).toBe('auth');
      expect(selectMyRequests(view(entries, PROD_KEY), DD_CONFIG, null).error).toBeNull();
    });

    it('a failed refetch reports its error while the kept view stays on screen', () => {
      const selected = selectMyRequests(view(entries, PROD_KEY), DD_CONFIG, new NetworkError('offline'));

      expect(selected.entries).toEqual(entries);
      expect(selected.error).toBe('network');
    });

    it('missing credentials on a cold cache → auth, with no entries', () => {
      const noCreds = new AuthError(401, 'Credentials unavailable', { errorCode: NO_CREDENTIALS });

      expect(selectMyRequests(undefined, DD_CONFIG, noCreds)).toEqual({
        entries: [],
        error: 'auth',
        staleDates: [],
        updatedAt: null,
      });
    });
  });
});

describe('useMyRequests — DD2.57 toRequestsError', () => {
  it.each<[string, 'auth' | 'network' | null, unknown]>([
    ['AuthError(401)', 'auth', new AuthError(401)],
    ['AuthError(403)', 'auth', new AuthError(403)],
    ['AuthError NO_CREDENTIALS', 'auth', new AuthError(401, 'Credentials unavailable', { errorCode: NO_CREDENTIALS })],
    ['AuthError AUTH_HTML_500 (an outage, not bad credentials)', 'network', new AuthError(401, 'HTML 500', { errorCode: AUTH_HTML_500 })],
    ['NetworkError', 'network', new NetworkError('offline')],
    ['ApiError(503)', 'network', new ApiError(503)],
    ['a plain Error', 'network', new Error('boom')],
    ['null', null, null],
    ['undefined', null, undefined],
  ])('%s → %p', (_label, expected, err) => {
    expect(toRequestsError(err)).toBe(expected);
  });
});

describe('useMyRequests — DD2.55 hook wiring (useQuery mocked)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** Calls the hook as a plain function, with `config` and a TanStack query result. Named as a
   *  hook so rules-of-hooks accepts the direct `useMyRequests()` call (no render is involved). */
  function useMyRequestsWith(
    config: CrossoverConfig | null,
    query: { data?: MyRequestsData; error?: unknown; isLoading?: boolean } = {},
  ) {
    const refetch = jest.fn();
    mockUseConfig.mockReturnValue({ config, isLoading: false, refetch: jest.fn() });
    mockUseQuery.mockReturnValue({
      data: query.data,
      error: query.error ?? null,
      isLoading: query.isLoading ?? false,
      refetch,
    });
    const result = useMyRequests();
    return { result, options: mockUseQuery.mock.lastCall![0], refetch };
  }

  it("queries ['myRequests', assignmentId] with staleTime 60 s, enabled only with an assignment (preserved)", () => {
    const { options } = useMyRequestsWith(DD_CONFIG);
    expect(options.queryKey).toEqual(['myRequests', '79996']);
    expect(options.staleTime).toBe(60_000);
    expect(options.enabled).toBe(true);
    expect(typeof options.queryFn).toBe('function');

    const signedOut = useMyRequestsWith(null).options;
    expect(signedOut.queryKey).toEqual(['myRequests', null]);
    expect(signedOut.enabled).toBe(false);
  });

  it('retries outages only, at most twice: a real 401 and missing credentials are never retried', () => {
    const { options } = useMyRequestsWith(DD_CONFIG);

    expect(typeof options.retry).toBe('function');
    expect(options.retry(0, new NetworkError('offline'))).toBe(true);
    expect(options.retry(1, new AuthError(401, 'HTML 500', { errorCode: AUTH_HTML_500 }))).toBe(true);
    expect(options.retry(2, new NetworkError('offline'))).toBe(false);
    expect(options.retry(0, new AuthError(401))).toBe(false);
    expect(options.retry(0, new AuthError(401, 'Credentials unavailable', { errorCode: NO_CREDENTIALS }))).toBe(false);
  });

  it('returns the selected view with staleDates and updatedAt, plus isLoading and refetch', () => {
    const data: MyRequestsData = {
      entries: [TUE_REQ, MON_REQ],
      error: null,
      staleDates: [MON],
      updatedAt: NOON,
      ownerKey: PROD_KEY,
    };
    const { result, refetch } = useMyRequestsWith(DD_CONFIG, { data });
    const { refetch: returnedRefetch, ...rest } = result;

    expect(rest).toEqual({
      entries: [TUE_REQ, MON_REQ],
      error: null,
      staleDates: [MON],
      updatedAt: NOON,
      isLoading: false,
    });
    expect(returnedRefetch).toBe(refetch);
  });

  it('while loading with no data → isLoading true, no entries, staleDates [] and updatedAt null', () => {
    const { result } = useMyRequestsWith(DD_CONFIG, { isLoading: true });

    expect(result.isLoading).toBe(true);
    expect(result.entries).toEqual([]);
    expect(result.error).toBeNull();
    expect(result.staleDates).toEqual([]);
    expect(result.updatedAt).toBeNull();
  });

  it('hides a view stamped for the other environment (a prod view under a QA config)', () => {
    const { result } = useMyRequestsWith(QA_CONFIG, { data: view([TUE_REQ], PROD_KEY) });

    expect(result.entries).toEqual([]);
  });

  it('a thrown AuthError(401) surfaces as auth while the kept view stays on screen', () => {
    const { result } = useMyRequestsWith(DD_CONFIG, { data: view([TUE_REQ], PROD_KEY), error: new AuthError(401) });

    expect(result.error).toBe('auth');
    expect(result.entries).toEqual([TUE_REQ]);
  });
});

// ─── DD2.58: the env switch removes the requests view (real QueryClient) ─────

describe('DD2 — env switch', () => {
  // handleSwitchEnvironment (app/modal.tsx) runs these cache steps in one startTransition:
  // setQueryData(['config'], …), removeQueries({ queryKey: ['myRequests'] }), then
  // invalidateQueries(). Its source order is pinned by modal-auth-cache.test.tsx
  // (DD2.envSwitch); these cases check the outcome. The TanStack key carries no
  // environment, so a prod view and a QA view share ['myRequests', '79996'].
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage._reset();
    signedIn();
  });

  // 3 in-window entries plus one older than catchUpStart, which a QA run never plans
  const legacyBlob = (): MyRequestsData => ({ entries: [WED_REQ, TUE_REQ, MON_REQ, OLDER_REQ], error: null });

  /** The switch's cache steps (optionally without the removal), then the QA config. */
  async function switchToQA(client: QueryClient, { removeRequests }: { removeRequests: boolean }) {
    if (removeRequests) client.removeQueries({ queryKey: ['myRequests'] });
    await client.invalidateQueries();
    signedIn(QA_CONFIG);
  }

  function runQuery(client: QueryClient) {
    return client.fetchQuery({
      queryKey: QUERY_KEY,
      queryFn: buildMyRequestsQueryFn(WED) as never,
      retry: false,
      networkMode: 'always',
    }) as Promise<MyRequestsData>;
  }

  it('a prod view + prod store, then the switch and an all-fail QA run → rejects, nothing cached under the key', async () => {
    const prodRaw = await seedStore(threeRequestStore());
    const client = newClient(view([WED_REQ, TUE_REQ, MON_REQ], PROD_KEY));
    await switchToQA(client, { removeRequests: true });
    mockFetchWorkDiary.mockRejectedValue(new NetworkError('offline'));

    await expect(runQuery(client)).rejects.toBeInstanceOf(NetworkError);

    // The prod store is not the QA owner's: the QA run plans the whole window, seeds
    // nothing, and no prod entry survives under the key
    expect(mockFetchWorkDiary).toHaveBeenCalledWith('79996', WED, CREDS, true);
    expect(calledDates()).toEqual(desc(CATCH_UP, WED));
    expect(client.getQueryData(QUERY_KEY)).toBeUndefined();
    expect(await AsyncStorage.getItem(KEY)).toBe(prodRaw);
  });

  it('the same with a legacy blob (no ownerKey) in place of the prod view → also nothing cached', async () => {
    await seedStore(threeRequestStore());
    const client = newClient(legacyBlob());
    await switchToQA(client, { removeRequests: true });
    mockFetchWorkDiary.mockRejectedValue(new NetworkError('offline'));

    await expect(runQuery(client)).rejects.toBeInstanceOf(NetworkError);

    expect(client.getQueryData(QUERY_KEY)).toBeUndefined();
  });

  it('after the switch, a successful QA run carries nothing from the legacy blob', async () => {
    const client = newClient(legacyBlob());
    await switchToQA(client, { removeRequests: true });
    mockFetchWorkDiary.mockResolvedValue([]);

    const data = await runQuery(client);

    expect(data.ownerKey).toBe(QA_KEY);
    expect(data.entries).toEqual([]);
  });

  describe('control: the same switch without removeQueries', () => {
    it('a QA run accepts the legacy blob as its prior and carries its older (prod) entry into the QA view', async () => {
      const client = newClient(legacyBlob());
      await switchToQA(client, { removeRequests: false });
      mockFetchWorkDiary.mockResolvedValue([]);

      const data = await runQuery(client);

      expect(data.ownerKey).toBe(QA_KEY);
      expect(data.entries).toEqual([OLDER_REQ]);
    });

    it('on a QA total failure the legacy blob is kept, and the display rule would show it under QA', async () => {
      await seedStore(threeRequestStore());
      const blob = legacyBlob();
      const expected = snapshot(blob);
      const client = newClient(blob);
      await switchToQA(client, { removeRequests: false });
      const err = new NetworkError('offline');
      mockFetchWorkDiary.mockRejectedValue(err);

      await expect(runQuery(client)).rejects.toBe(err);

      const kept = client.getQueryData<MyRequestsData>(QUERY_KEY);
      expect(kept).toEqual(expected);
      expect(selectMyRequests(kept, QA_CONFIG, err).entries).toEqual(expected.entries);
    });
  });
});

// ─── DD2.50 / DD2.51: the one-shot forced refresh flag ───────────────────────
// Last in the file: the flag is module state, so a case that fails before consuming it
// cannot leak a forced plan into the cases above.

describe('useMyRequests — DD2 forced refresh flag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage._reset();
  });

  it('DD2.50 devManagerView → the mocks stamped dev-mock: no store I/O, no credentials read, the flag kept', async () => {
    signedIn();
    // The whole window fetched 5 min ago: an unforced run would fetch only today
    await seedStore(windowRecords(WED, `${WED}T11:55`));
    markMyRequestsForcedRefresh();
    mockLoadConfig.mockResolvedValue({ ...DD_CONFIG, devManagerView: true });
    mockAsyncStorage.getItem.mockClear();

    const result = await buildMyRequestsQueryFn(WED)();

    expect(result).toEqual({ entries: MOCK_MY_REQUESTS, error: null, ownerKey: 'dev-mock' });
    expect(mockLoadCredentials).not.toHaveBeenCalled();
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(mockAsyncStorage.getItem).not.toHaveBeenCalledWith(KEY);
    expect(storeWrites()).toHaveLength(0);

    // The next real run consumes the flag: the whole window is fetched
    mockLoadConfig.mockResolvedValue(DD_CONFIG);
    mockFetchWorkDiary.mockResolvedValue([]);
    await buildMyRequestsQueryFn(WED)();
    expect(calledDates()).toEqual(desc(CATCH_UP, WED));
  });

  it('DD2.51 markMyRequestsForcedRefresh() → every catchUpStart..today date once; the next run is normal', async () => {
    signedIn();
    mockFetchWorkDiary.mockResolvedValue([]);
    // The window fetched at 08:00 today (closed weeks settled), plus an unsettled PENDING day
    // before catchUpStart, which `force` must not reach.
    await seedStore([
      ...windowRecords(WED, `${WED}T08:00`),
      rec(OLDER, `${WED}T08:00`, [entry(OLDER, 'Old pending', 'PENDING')]),
    ]);

    markMyRequestsForcedRefresh();
    await buildMyRequestsQueryFn(WED, () => local(`${WED}T08:05`))();
    expect(calledDates()).toEqual(desc(CATCH_UP, WED));

    mockFetchWorkDiary.mockClear();
    await buildMyRequestsQueryFn(WED, () => local(`${WED}T08:10`))();
    expect(calledDates()).toEqual([WED]);
  });
});
