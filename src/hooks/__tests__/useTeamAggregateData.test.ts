// Tests: useTeamAggregateData hook — FR1-FR5 (02-team-aggregate-hook)
// Spec: features/app/team-org-view/specs/02-team-aggregate-hook/spec.md
//
// Written BEFORE implementation existed (TDD red phase) — follows the
// useMyRequests.test.ts convention: static source analysis of the hook file
// + testing the exported buildTeamAggregateQueryFn directly through mocked
// dependencies, since renderHook is not viable under jest-expo/node.

import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../store/config', () => ({
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
}));

jest.mock('../../api/workDiary', () => ({
  fetchWorkDiary: jest.fn(),
}));

jest.mock('../../api/team', () => ({
  fetchReportTimesheet: jest.fn(),
}));

jest.mock('../../lib/log', () => ({
  log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { loadCredentials } from '../../store/config';
import { getAuthToken } from '../../api/client';
import { fetchWorkDiary } from '../../api/workDiary';
import { fetchReportTimesheet } from '../../api/team';
import { log } from '../../lib/log';
import { buildTeamAggregateQueryFn } from '../../hooks/useTeamAggregateData';
import type { TeamMember, WorkDiarySlot } from '../../types/api';
import type { CrossoverConfig } from '../../types/config';
import type { TimesheetResponse } from '../../lib/hours';

const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;
const mockGetAuthToken = getAuthToken as jest.MockedFunction<typeof getAuthToken>;
const mockFetchWorkDiary = fetchWorkDiary as jest.MockedFunction<typeof fetchWorkDiary>;
const mockFetchReportTimesheet = fetchReportTimesheet as jest.MockedFunction<typeof fetchReportTimesheet>;
const mockLogError = log.error as jest.Mock;

const CREDENTIALS = { username: 'manager@example.com', password: 'pass123' };
const TOKEN = '2374000:token123';

const CONFIG: CrossoverConfig = {
  userId: '2372227',
  fullName: 'Manager Managerson',
  managerId: '1000000',
  primaryTeamId: '2374',
  teams: [],
  hourlyRate: 40,
  weeklyLimit: 40,
  useQA: false,
  isManager: true,
  assignmentId: '99999',
  lastRoleCheck: '',
  debugMode: false,
  setupComplete: true,
  setupDate: '',
};

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    assignmentId: '1',
    candidateId: '10',
    managerId: '2372227',
    teamId: '2374',
    teamName: 'Team Alpha',
    name: 'Report One',
    photoUrl: undefined,
    isManager: false,
    ...overrides,
  };
}

function makeSlot(overrides: Partial<WorkDiarySlot> = {}): WorkDiarySlot {
  return {
    tags: [],
    autoTracker: false,
    status: 'APPROVED',
    memo: '',
    actions: [],
    date: '2026-07-27T12:00:00Z',
    time: '12:00:00',
    activityLevel: 50,
    intensityScore: 50,
    productivityCategory: 'PRODUCTIVE',
    activities: [],
    secondBrainDeepDive: null,
    ...overrides,
  };
}

/** Builds N slots for a day where `aiCount` of them carry the ai_usage tag. */
function makeDaySlots(total: number, aiCount: number): WorkDiarySlot[] {
  const slots: WorkDiarySlot[] = [];
  for (let i = 0; i < total; i++) {
    slots.push(makeSlot({ tags: i < aiCount ? ['ai_usage'] : ['other'] }));
  }
  return slots;
}

function makeTimesheet(totalHours: number): TimesheetResponse {
  return { totalHours, averageHoursPerDay: totalHours / 5, stats: [] };
}

// ─── Static analysis ──────────────────────────────────────────────────────────

const HOOK_PATH = path.resolve(__dirname, '../../..', 'src', 'hooks', 'useTeamAggregateData.ts');

describe('useTeamAggregateData — static analysis of source contract', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, 'utf8');
  });

  it('exports useTeamAggregateData function', () => {
    expect(source).toMatch(/export\s+function\s+useTeamAggregateData/);
  });

  it('exports TeamMemberBreakdown, TeamAggregateData, UseTeamAggregateDataResult interfaces', () => {
    expect(source).toMatch(/export\s+interface\s+TeamMemberBreakdown/);
    expect(source).toMatch(/export\s+interface\s+TeamAggregateData/);
    expect(source).toMatch(/export\s+interface\s+UseTeamAggregateDataResult/);
  });

  it('uses TanStack Query (useQuery)', () => {
    expect(source).toMatch(/useQuery/);
  });

  it('queryKey is teamAggregate, primaryTeamId, weekStartDate', () => {
    expect(source).toMatch(
      /\[\s*['"]teamAggregate['"]\s*,\s*config\?\.primaryTeamId\s*,\s*weekStartDate\s*\]/,
    );
  });

  it('staleTime is 24 hours', () => {
    expect(source).toMatch(/staleTime\s*:\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  it('consumes useTeamRoster', () => {
    expect(source).toMatch(/useTeamRoster/);
  });

  it('calls countDiaryTags and aggregateAICache', () => {
    expect(source).toMatch(/countDiaryTags/);
    expect(source).toMatch(/aggregateAICache/);
  });

  it('calls fetchReportTimesheet (not fetchTimesheet)', () => {
    expect(source).toMatch(/fetchReportTimesheet/);
    expect(source).not.toMatch(/[^R]fetchTimesheet\(/);
  });

  it('does not register an AppState listener or custom timer', () => {
    expect(source).not.toMatch(/AppState/);
    expect(source).not.toMatch(/setInterval/);
  });
});

// ─── buildTeamAggregateQueryFn ────────────────────────────────────────────────

describe('useTeamAggregateData — buildTeamAggregateQueryFn (query logic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
  });

  describe('FR2 — fetch cadence and concurrency', () => {
    it('fetches one work-diary request per day (Mon-today) plus exactly one timesheet request per roster member', async () => {
      // 2026-07-27 is a Monday -> 1 day in range
      const member = makeMember();
      mockFetchWorkDiary.mockResolvedValue([]);
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [member], '2026-07-27');
      await queryFn();

      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(1);
      expect(mockFetchWorkDiary).toHaveBeenCalledWith('1', '2026-07-27', CREDENTIALS, false);
      expect(mockFetchReportTimesheet).toHaveBeenCalledTimes(1);
      expect(mockFetchReportTimesheet).toHaveBeenCalledWith(member, '2026-07-27', TOKEN, false);
    });

    it('fetches one work-diary request per day across Mon-Wed when today is Wednesday', async () => {
      const member = makeMember();
      mockFetchWorkDiary.mockResolvedValue([]);
      mockFetchReportTimesheet.mockResolvedValue(null);

      // 2026-07-29 is Wednesday; Monday of that week is 2026-07-27
      const queryFn = buildTeamAggregateQueryFn(CONFIG, [member], '2026-07-29');
      await queryFn();

      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(3);
      const dates = mockFetchWorkDiary.mock.calls.map((c) => c[1]);
      expect(dates.sort()).toEqual(['2026-07-27', '2026-07-28', '2026-07-29']);

      // Timesheet must be anchored to the week's Monday, not "today" — on a
      // non-Monday today these differ, so this catches a bug that passes
      // `today` straight through instead of the computed weekStartDate.
      expect(mockFetchReportTimesheet).toHaveBeenCalledWith(member, '2026-07-27', TOKEN, false);
    });

    it('fetches multiple reports concurrently, not serially', async () => {
      const members = [makeMember({ assignmentId: 'a' }), makeMember({ assignmentId: 'b' })];
      const callOrder: string[] = [];
      mockFetchWorkDiary.mockImplementation(async (assignmentId) => {
        callOrder.push(`start-${assignmentId}`);
        await new Promise((r) => setTimeout(r, 5));
        callOrder.push(`end-${assignmentId}`);
        return [];
      });
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, members, '2026-07-27');
      await queryFn();

      // Both fetches must have started before either finished — proves concurrency.
      expect(callOrder[0]).toMatch(/^start-/);
      expect(callOrder[1]).toMatch(/^start-/);
    });

    it('makes no requests for anyone outside the roster (only roster members are fetched)', async () => {
      const member = makeMember({ assignmentId: 'only-this-one' });
      mockFetchWorkDiary.mockResolvedValue([]);
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [member], '2026-07-27');
      await queryFn();

      const fetchedIds = mockFetchWorkDiary.mock.calls.map((c) => c[0]);
      expect(fetchedIds.every((id) => id === 'only-this-one')).toBe(true);
    });
  });

  describe('FR3 — slot-weighted aggregation', () => {
    it('produces a slot-weighted weekAiPct that differs from a naive average of member percentages', async () => {
      // Member A: 2 slots, 100% AI (high activity, small volume)
      // Member B: 20 slots, 10% AI (low activity, large volume)
      // Naive average of percentages: (100 + 10) / 2 = 55%
      // Slot-weighted: (2 + 2) AI-tagged out of 22 total = 4/22 ≈ 18%
      const memberA = makeMember({ assignmentId: 'a' });
      const memberB = makeMember({ assignmentId: 'b' });

      mockFetchWorkDiary.mockImplementation(async (assignmentId) => {
        if (assignmentId === 'a') return makeDaySlots(2, 2);
        return makeDaySlots(20, 2);
      });
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [memberA, memberB], '2026-07-27');
      const result = await queryFn();

      // Slot-weighted: 4 AI-tagged of 22 total => ~18.2%, +-2 band (16..20),
      // midpoint 18. A "last member wins" or non-summing aggregation bug
      // would produce a different, non-18 value (e.g. naive average 55, or
      // memberB-only weighting ~10) — pin the exact value, not just a range.
      expect(result.weekAiPct).toBe(18);
    });

    it('weekHours equals the sum of paid hours across successfully fetched reports', async () => {
      const memberA = makeMember({ assignmentId: 'a' });
      const memberB = makeMember({ assignmentId: 'b' });
      mockFetchWorkDiary.mockResolvedValue([]);
      mockFetchReportTimesheet.mockImplementation(async (member) =>
        member.assignmentId === 'a' ? makeTimesheet(30) : makeTimesheet(25),
      );

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [memberA, memberB], '2026-07-27');
      const result = await queryFn();

      expect(result.weekHours).toBe(55);
    });

    it('weekBrainliftHours equals the sum of BrainLift hours across successfully fetched reports', async () => {
      const memberA = makeMember({ assignmentId: 'a' });
      const memberB = makeMember({ assignmentId: 'b' });
      // 6 second_brain slots each => 6*10/60 = 1 hour each => 2 hours total
      mockFetchWorkDiary.mockImplementation(async (assignmentId) => {
        const slots: WorkDiarySlot[] = [];
        for (let i = 0; i < 6; i++) slots.push(makeSlot({ tags: ['second_brain'] }));
        return slots;
      });
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [memberA, memberB], '2026-07-27');
      const result = await queryFn();

      expect(result.weekBrainliftHours).toBe(2);
    });

    it('reportCount equals the number of reports where both fetches succeeded', async () => {
      const memberA = makeMember({ assignmentId: 'a' });
      const memberB = makeMember({ assignmentId: 'b' });
      mockFetchWorkDiary.mockResolvedValue([]);
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [memberA, memberB], '2026-07-27');
      const result = await queryFn();

      expect(result.reportCount).toBe(2);
    });

    it('excludes untagged slots from the weekAiPct denominator (tagged slots only, not all slots)', async () => {
      // 2 ai_usage + 3 'other' + 5 untagged => 2/5 tagged = 40%, not 2/10 = 20%.
      // Catches a bug that divides by totalSlots instead of taggedSlots.
      const member = makeMember();
      const slots = [
        ...makeDaySlots(5, 2),
        ...Array.from({ length: 5 }, () => makeSlot({ tags: [] })),
      ];
      mockFetchWorkDiary.mockResolvedValue(slots);
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [member], '2026-07-27');
      const result = await queryFn();

      expect(result.weekAiPct).toBe(40);
    });

    it('breakdown contains one row per roster member with member, hours, aiPct, brainliftHours, fetchFailed: false for successes', async () => {
      const member = makeMember({ assignmentId: 'solo' });
      mockFetchWorkDiary.mockResolvedValue(makeDaySlots(4, 2));
      mockFetchReportTimesheet.mockResolvedValue(makeTimesheet(38));

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [member], '2026-07-27');
      const result = await queryFn();

      expect(result.breakdown).toHaveLength(1);
      // 2 of 4 slots AI-tagged => 50%, +-2 band (48..52) midpoint 50; no
      // second_brain tags => 0 BrainLift hours. Exact values, not just
      // `typeof === 'number'` (which would also pass for NaN).
      expect(result.breakdown[0]).toMatchObject({
        member,
        hours: 38,
        aiPct: 50,
        brainliftHours: 0,
        fetchFailed: false,
      });
    });
  });

  describe('FR4 — per-report failure isolation', () => {
    it('excludes a member from weekHours/weekAiPct/weekBrainliftHours/reportCount when their work-diary fetch throws, but keeps them in breakdown with fetchFailed: true', async () => {
      const goodMember = makeMember({ assignmentId: 'good' });
      const badMember = makeMember({ assignmentId: 'bad' });
      mockFetchWorkDiary.mockImplementation(async (assignmentId) => {
        if (assignmentId === 'bad') throw new Error('workdiary network failure');
        return makeDaySlots(10, 5);
      });
      mockFetchReportTimesheet.mockResolvedValue(makeTimesheet(40));

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [goodMember, badMember], '2026-07-27');
      const result = await queryFn();

      expect(result.reportCount).toBe(1);
      expect(result.weekHours).toBe(40); // only goodMember's hours
      const badRow = result.breakdown.find((r) => r.member.assignmentId === 'bad');
      expect(badRow).toMatchObject({ fetchFailed: true, hours: 0, aiPct: 0, brainliftHours: 0 });
      const goodRow = result.breakdown.find((r) => r.member.assignmentId === 'good');
      expect(goodRow?.fetchFailed).toBe(false);
    });

    it('produces the same isolation behavior when the timesheet fetch throws instead', async () => {
      const goodMember = makeMember({ assignmentId: 'good' });
      const badMember = makeMember({ assignmentId: 'bad' });
      mockFetchWorkDiary.mockResolvedValue(makeDaySlots(5, 2));
      mockFetchReportTimesheet.mockImplementation(async (member) => {
        if (member.assignmentId === 'bad') throw new Error('timesheet 500');
        return makeTimesheet(20);
      });

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [goodMember, badMember], '2026-07-27');
      const result = await queryFn();

      expect(result.reportCount).toBe(1);
      const badRow = result.breakdown.find((r) => r.member.assignmentId === 'bad');
      expect(badRow).toMatchObject({ fetchFailed: true, hours: 0 });
    });

    it('does not rethrow a per-member failure — the overall queryFn promise resolves', async () => {
      const goodMember = makeMember({ assignmentId: 'good' });
      const badMember = makeMember({ assignmentId: 'bad' });
      mockFetchWorkDiary.mockImplementation(async (assignmentId) => {
        if (assignmentId === 'bad') throw new Error('boom');
        return [];
      });
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [goodMember, badMember], '2026-07-27');
      // Must resolve, not reject — the whole query does not fail.
      await expect(queryFn()).resolves.toBeDefined();
    });

    it('logs each per-report failure via the application error-logging convention, with distinguishing member context', async () => {
      const badMemberA = makeMember({ assignmentId: 'bad-a' });
      const badMemberB = makeMember({ assignmentId: 'bad-b' });
      mockFetchWorkDiary.mockRejectedValue(new Error('boom'));
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [badMemberA, badMemberB], '2026-07-27');
      await queryFn();

      expect(mockLogError).toHaveBeenCalledTimes(2);
      const loggedAssignmentIds = mockLogError.mock.calls.map(([, , meta]) => meta?.assignmentId);
      expect(loggedAssignmentIds.sort()).toEqual(['bad-a', 'bad-b']);
      for (const [category, errArg] of mockLogError.mock.calls) {
        expect(category).toMatch(/team/i);
        expect(errArg).toBeInstanceOf(Error);
      }
    });

    it('resolves an empty roster to the zero-valued aggregate without an error', async () => {
      const queryFn = buildTeamAggregateQueryFn(CONFIG, [], '2026-07-27');
      const result = await queryFn();

      expect(result).toEqual({
        weekHours: 0,
        weekAiPct: 0,
        weekBrainliftHours: 0,
        reportCount: 0,
        breakdown: [],
      });
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(mockFetchReportTimesheet).not.toHaveBeenCalled();
    });

    it('when every report fails, returns zero-valued aggregate data with one failed row per report (not a thrown error)', async () => {
      const memberA = makeMember({ assignmentId: 'a' });
      const memberB = makeMember({ assignmentId: 'b' });
      mockFetchWorkDiary.mockRejectedValue(new Error('all down'));
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [memberA, memberB], '2026-07-27');
      const result = await queryFn();

      expect(result.reportCount).toBe(0);
      expect(result.weekHours).toBe(0);
      expect(result.weekAiPct).toBe(0);
      expect(result.weekBrainliftHours).toBe(0);
      expect(result.breakdown.every((r) => r.fetchFailed)).toBe(true);
      expect(result.breakdown).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('treats a null timesheet as zero paid hours, not a failure', async () => {
      const member = makeMember();
      mockFetchWorkDiary.mockResolvedValue(makeDaySlots(3, 1));
      mockFetchReportTimesheet.mockResolvedValue(null);

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [member], '2026-07-27');
      const result = await queryFn();

      expect(result.reportCount).toBe(1);
      expect(result.breakdown[0]).toMatchObject({ fetchFailed: false, hours: 0 });
    });

    it('produces 0% AI (not a 0-2% range) when there are no diary slots', async () => {
      const member = makeMember();
      mockFetchWorkDiary.mockResolvedValue([]);
      mockFetchReportTimesheet.mockResolvedValue(makeTimesheet(10));

      const queryFn = buildTeamAggregateQueryFn(CONFIG, [member], '2026-07-27');
      const result = await queryFn();

      expect(result.weekAiPct).toBe(0);
      expect(result.breakdown[0].aiPct).toBe(0);
    });

    it('fails the entire member row when one of several daily diary fetches fails (partial daily failure)', async () => {
      const member = makeMember();
      mockFetchWorkDiary.mockImplementation(async (_id, date) => {
        if (date === '2026-07-28') throw new Error('one day failed');
        return makeDaySlots(5, 5);
      });
      mockFetchReportTimesheet.mockResolvedValue(makeTimesheet(40));

      // Wednesday -> Mon/Tue/Wed fetched; Tue throws
      const queryFn = buildTeamAggregateQueryFn(CONFIG, [member], '2026-07-29');
      const result = await queryFn();

      expect(result.reportCount).toBe(0);
      expect(result.breakdown[0].fetchFailed).toBe(true);
      expect(result.weekHours).toBe(0);
    });
  });

  describe('FR5 — prerequisite failures', () => {
    it('throws when credentials are missing (surfaces as hook-level error)', async () => {
      mockLoadCredentials.mockResolvedValue(null);
      const queryFn = buildTeamAggregateQueryFn(CONFIG, [makeMember()], '2026-07-27');
      await expect(queryFn()).rejects.toThrow(/credentials/i);
    });

    it('throws when config is missing', async () => {
      const queryFn = buildTeamAggregateQueryFn(null, [makeMember()], '2026-07-27');
      await expect(queryFn()).rejects.toThrow(/config/i);
    });
  });
});
