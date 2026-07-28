// FR1-FR3 (01-team-roster-api): Tests for fetchMyTeams and fetchTeamRoster
// Written BEFORE implementation (TDD red phase) — src/api/team.ts does not exist yet.
//
// FR1 (02-team-aggregate-hook): Tests for fetchReportTimesheet, extending this
// file per spec.md's "Files to Create/Modify" table — written BEFORE
// fetchReportTimesheet exists in src/api/team.ts.

import { fetchMyTeams, fetchTeamRoster, fetchReportTimesheet } from '../../api/team';
import { AuthError, NetworkError } from '../../api/errors';
import type { RawTeam, RawTeamAssignment, TeamMember } from '../../types/api';
import type { TimesheetResponse } from '../../lib/hours';

// Mock the API client module so we can intercept calls, matching the
// convention in __tests__/api/work-diary.test.ts.
jest.mock('../../api/client', () => ({
  apiGet: jest.fn(),
}));

import { apiGet } from '../../api/client';

const mockApiGet = apiGet as jest.Mock;

const MOCK_TOKEN = '2374000:token123';

beforeEach(() => {
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------------
// FR1: type shape sanity — importing these by name fails to compile/resolve
// until src/types/api.ts exports them. Combined with a fully-specified
// object literal so a shape drift (missing/renamed field) fails type-check.
// ---------------------------------------------------------------------------

describe('FR1: team roster API types', () => {
  it('RawTeam has numeric id and string name', () => {
    const rawTeam: RawTeam = { id: 2374, name: 'Team Alpha' };
    expect(rawTeam).toEqual({ id: 2374, name: 'Team Alpha' });
  });

  it('RawTeamAssignment has nested candidate/manager/team with optional photoUrl/avatarTypes', () => {
    const rawAssignment: RawTeamAssignment = {
      id: 79996,
      status: 'ACTIVE',
      candidate: {
        id: 2362707,
        userId: 1190137,
        printableName: 'Jane Doe',
        photoUrl: 'https://example.com/jane.jpg',
        avatarTypes: ['CANDIDATE'],
      },
      manager: { id: 2372227 },
      team: { id: 2374, name: 'Team Alpha' },
    };
    expect(rawAssignment.status).toBe('ACTIVE');
    expect(rawAssignment.candidate.printableName).toBe('Jane Doe');
  });

  it('RawTeamAssignment allows candidate without photoUrl or avatarTypes', () => {
    const rawAssignment: RawTeamAssignment = {
      id: 79997,
      status: 'ACTIVE',
      candidate: {
        id: 2362708,
        userId: 1190138,
        printableName: 'John Roe',
      },
      manager: { id: 2372227 },
      team: { id: 2374, name: 'Team Alpha' },
    };
    expect(rawAssignment.candidate.photoUrl).toBeUndefined();
    expect(rawAssignment.candidate.avatarTypes).toBeUndefined();
  });

  it('TeamMember has string identifiers, display fields, optional photoUrl, and isManager boolean', () => {
    const member: TeamMember = {
      assignmentId: '79996',
      candidateId: '2362707',
      managerId: '2372227',
      teamId: '2374',
      teamName: 'Team Alpha',
      name: 'Jane Doe',
      photoUrl: undefined,
      isManager: false,
    };
    expect(member).toEqual({
      assignmentId: '79996',
      candidateId: '2362707',
      managerId: '2372227',
      teamId: '2374',
      teamName: 'Team Alpha',
      name: 'Jane Doe',
      photoUrl: undefined,
      isManager: false,
    });
  });
});

// ---------------------------------------------------------------------------
// FR2: fetchMyTeams(token, useQA)
// ---------------------------------------------------------------------------

describe('FR2: fetchMyTeams', () => {
  it('sends GET /api/v2/teams with { status: "ACTIVE" }, the token, and the useQA flag', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    await fetchMyTeams(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams',
      { status: 'ACTIVE' },
      MOCK_TOKEN,
      false,
    );
  });

  it('passes useQA=true through to apiGet when requested', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    await fetchMyTeams(MOCK_TOKEN, true);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams',
      { status: 'ACTIVE' },
      MOCK_TOKEN,
      true,
    );
  });

  it('resolves a populated bare-array response to typed RawTeam[]', async () => {
    const rawTeams: RawTeam[] = [
      { id: 2374, name: 'Team A' },
      { id: 5000, name: 'Team B' },
    ];
    mockApiGet.mockResolvedValueOnce(rawTeams);
    const result = await fetchMyTeams(MOCK_TOKEN, false);
    expect(result).toEqual([
      { id: 2374, name: 'Team A' },
      { id: 5000, name: 'Team B' },
    ]);
  });

  it('resolves an empty array response to [] (not an error)', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    const result = await fetchMyTeams(MOCK_TOKEN, false);
    expect(result).toEqual([]);
  });

  it('resolves a nullish response to [] rather than throwing', async () => {
    mockApiGet.mockResolvedValueOnce(null);
    const result = await fetchMyTeams(MOCK_TOKEN, false);
    expect(result).toEqual([]);
  });

  it('resolves a malformed non-array object response to []', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [{ id: 2374, name: 'Team A' }] });
    const result = await fetchMyTeams(MOCK_TOKEN, false);
    expect(result).toEqual([]);
  });

  it('propagates the exact AuthError instance thrown by apiGet unchanged', async () => {
    const authError = new AuthError(401);
    mockApiGet.mockRejectedValueOnce(authError);
    await expect(fetchMyTeams(MOCK_TOKEN, false)).rejects.toThrow(AuthError);
    mockApiGet.mockRejectedValueOnce(authError);
    await expect(fetchMyTeams(MOCK_TOKEN, false)).rejects.toBe(authError);
  });

  it('propagates the exact NetworkError instance thrown by apiGet unchanged', async () => {
    const networkError = new NetworkError('No connection');
    mockApiGet.mockRejectedValueOnce(networkError);
    await expect(fetchMyTeams(MOCK_TOKEN, false)).rejects.toThrow(NetworkError);
    mockApiGet.mockRejectedValueOnce(networkError);
    await expect(fetchMyTeams(MOCK_TOKEN, false)).rejects.toBe(networkError);
  });
});

// ---------------------------------------------------------------------------
// FR3: fetchTeamRoster(teamId, token, useQA)
// ---------------------------------------------------------------------------

// A fully-specified raw assignment row matching the spec's confirmed live shape.
function makeAssignment(
  overrides: Partial<RawTeamAssignment> = {},
): RawTeamAssignment {
  return {
    id: 79996,
    status: 'ACTIVE',
    candidate: {
      id: 2362707,
      userId: 1190137,
      printableName: 'Jane Doe',
      photoUrl: 'https://crossover.com/photos/2362707.jpg',
      avatarTypes: ['CANDIDATE'],
    },
    manager: { id: 2372227 },
    team: { id: 2374, name: 'Team Alpha' },
    ...overrides,
  };
}

describe('FR3: fetchTeamRoster', () => {
  it('sends GET /api/v2/teams/assignments with { teamId, status: "ACTIVE" }, the token, and useQA', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [] });
    await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams/assignments',
      { teamId: '2374', status: 'ACTIVE' },
      MOCK_TOKEN,
      false,
    );
  });

  it('passes useQA=true through to apiGet when requested', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [] });
    await fetchTeamRoster('2374', MOCK_TOKEN, true);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams/assignments',
      { teamId: '2374', status: 'ACTIVE' },
      MOCK_TOKEN,
      true,
    );
  });

  it('reads assignments from the Spring content envelope and maps every field exactly, with IDs stringified', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [makeAssignment()] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toEqual([
      {
        assignmentId: '79996',
        candidateId: '2362707',
        managerId: '2372227',
        teamId: '2374',
        teamName: 'Team Alpha',
        name: 'Jane Doe',
        photoUrl: 'https://crossover.com/photos/2362707.jpg',
        isManager: false,
      },
    ]);
  });

  it('accepts a bare assignment array (no content envelope) and maps it the same way', async () => {
    mockApiGet.mockResolvedValueOnce([makeAssignment()]);
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toEqual([
      {
        assignmentId: '79996',
        candidateId: '2362707',
        managerId: '2372227',
        teamId: '2374',
        teamName: 'Team Alpha',
        name: 'Jane Doe',
        photoUrl: 'https://crossover.com/photos/2362707.jpg',
        isManager: false,
      },
    ]);
  });

  it('filters out rows with non-ACTIVE status (INACTIVE) even though returned by the server', async () => {
    const activeRow = makeAssignment({ id: 79996 });
    const inactiveRow = makeAssignment({
      id: 79997,
      status: 'INACTIVE',
      candidate: {
        id: 2362708,
        userId: 1190138,
        printableName: 'Retired Report',
      },
    });
    mockApiGet.mockResolvedValueOnce({ content: [activeRow, inactiveRow] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toHaveLength(1);
    expect(result.find((m) => m.assignmentId === '79997')).toBeUndefined();
    expect(result[0].assignmentId).toBe('79996');
  });

  it('filters out rows with non-ACTIVE status (TERMINATED) even though returned by the server', async () => {
    const activeRow = makeAssignment({ id: 79996 });
    const terminatedRow = makeAssignment({
      id: 79998,
      status: 'TERMINATED',
      candidate: {
        id: 2362709,
        userId: 1190139,
        printableName: 'Former Report',
      },
    });
    mockApiGet.mockResolvedValueOnce({ content: [activeRow, terminatedRow] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toHaveLength(1);
    expect(result.find((m) => m.assignmentId === '79998')).toBeUndefined();
  });

  it('maps a missing candidate.photoUrl to photoUrl: undefined without throwing', async () => {
    const row = makeAssignment({
      candidate: {
        id: 2362707,
        userId: 1190137,
        printableName: 'Jane Doe',
        avatarTypes: ['CANDIDATE'],
      },
    });
    mockApiGet.mockResolvedValueOnce({ content: [row] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toEqual([
      {
        assignmentId: '79996',
        candidateId: '2362707',
        managerId: '2372227',
        teamId: '2374',
        teamName: 'Team Alpha',
        name: 'Jane Doe',
        photoUrl: undefined,
        isManager: false,
      },
    ]);
  });

  it('derives isManager: false when avatarTypes is absent', async () => {
    const row = makeAssignment({
      candidate: {
        id: 2362707,
        userId: 1190137,
        printableName: 'Jane Doe',
        photoUrl: 'https://crossover.com/photos/2362707.jpg',
      },
    });
    mockApiGet.mockResolvedValueOnce({ content: [row] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result[0].isManager).toBe(false);
  });

  it('derives isManager: false when avatarTypes is present but does not contain MANAGER', async () => {
    const row = makeAssignment({
      candidate: {
        id: 2362707,
        userId: 1190137,
        printableName: 'Jane Doe',
        photoUrl: 'https://crossover.com/photos/2362707.jpg',
        avatarTypes: ['CANDIDATE'],
      },
    });
    mockApiGet.mockResolvedValueOnce({ content: [row] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result[0].isManager).toBe(false);
  });

  it('derives isManager: true when avatarTypes contains MANAGER', async () => {
    const row = makeAssignment({
      candidate: {
        id: 2372227,
        userId: 1190140,
        printableName: 'Manager Managerson',
        photoUrl: 'https://crossover.com/photos/2372227.jpg',
        avatarTypes: ['CANDIDATE', 'MANAGER'],
      },
    });
    mockApiGet.mockResolvedValueOnce({ content: [row] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result[0].isManager).toBe(true);
  });

  it('resolves an empty content envelope to []', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toEqual([]);
  });

  it('resolves an empty bare array response to []', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toEqual([]);
  });

  it('resolves a nullish response to [] rather than throwing', async () => {
    mockApiGet.mockResolvedValueOnce(null);
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toEqual([]);
  });

  it('resolves an unrecognized envelope shape (non-array content) to [] rather than throwing', async () => {
    mockApiGet.mockResolvedValueOnce({ content: {} });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toEqual([]);
  });

  it('filters out a lowercase "active" status using exact, case-sensitive equality (per spec)', async () => {
    const exactActiveRow = makeAssignment({ id: 79996 });
    const lowercaseRow = makeAssignment({
      id: 79999,
      status: 'active',
      candidate: {
        id: 2362710,
        userId: 1190141,
        printableName: 'Case Mismatch',
      },
    });
    mockApiGet.mockResolvedValueOnce({ content: [exactActiveRow, lowercaseRow] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toHaveLength(1);
    expect(result.find((m) => m.assignmentId === '79999')).toBeUndefined();
    expect(result[0].assignmentId).toBe('79996');
  });

  // Every guarded leaf field must fail loudly when missing — a bare
  // String(undefined) would otherwise fabricate the literal "undefined" as an
  // id, and undefined would leak into name/teamName. One case per guard so a
  // regression in any single assertPresent call site is caught.
  it.each<[string, Partial<RawTeamAssignment>]>([
    ['id', { id: undefined as unknown as number }],
    [
      'candidate.id',
      {
        candidate: {
          id: undefined as unknown as number,
          userId: 1190137,
          printableName: 'Jane Doe',
        },
      },
    ],
    ['manager.id', { manager: { id: undefined as unknown as number } }],
    [
      'team.id',
      { team: { id: undefined as unknown as number, name: 'Team Alpha' } },
    ],
    [
      'team.name',
      { team: { id: 2374, name: undefined as unknown as string } },
    ],
    [
      'candidate.printableName',
      {
        candidate: {
          id: 2362707,
          userId: 1190137,
          printableName: undefined as unknown as string,
        },
      },
    ],
  ])(
    'throws naming the missing field rather than fabricating a value when "%s" is absent',
    async (field, overrides) => {
      mockApiGet.mockResolvedValueOnce({
        content: [makeAssignment(overrides)],
      });
      await expect(fetchTeamRoster('2374', MOCK_TOKEN, false)).rejects.toThrow(
        `missing "${field}"`,
      );
    },
  );

  it('propagates the exact AuthError instance thrown by apiGet unchanged', async () => {
    const authError = new AuthError(403);
    mockApiGet.mockRejectedValueOnce(authError);
    await expect(fetchTeamRoster('2374', MOCK_TOKEN, false)).rejects.toThrow(AuthError);
    mockApiGet.mockRejectedValueOnce(authError);
    await expect(fetchTeamRoster('2374', MOCK_TOKEN, false)).rejects.toBe(authError);
  });

  it('propagates the exact NetworkError instance thrown by apiGet unchanged', async () => {
    const networkError = new NetworkError('Timed out');
    mockApiGet.mockRejectedValueOnce(networkError);
    await expect(fetchTeamRoster('2374', MOCK_TOKEN, false)).rejects.toThrow(NetworkError);
    mockApiGet.mockRejectedValueOnce(networkError);
    await expect(fetchTeamRoster('2374', MOCK_TOKEN, false)).rejects.toBe(networkError);
  });
});

// ---------------------------------------------------------------------------
// FR1 (02-team-aggregate-hook): fetchReportTimesheet(member, weekStartDate, token, useQA)
// ---------------------------------------------------------------------------

const MEMBER: TeamMember = {
  assignmentId: '79996',
  candidateId: '2362707',
  managerId: '2372227',
  teamId: '2374',
  teamName: 'Team Alpha',
  name: 'Jane Doe',
  photoUrl: undefined,
  isManager: false,
};

const WEEK_START = '2026-07-27';

describe('FR1 (02-team-aggregate-hook): fetchReportTimesheet', () => {
  it('sends userId, managerId, teamId, date, and period: WEEK together in a single request', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    await fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/timetracking/timesheets',
      {
        date: WEEK_START,
        period: 'WEEK',
        userId: MEMBER.candidateId,
        managerId: MEMBER.managerId,
        teamId: MEMBER.teamId,
      },
      MOCK_TOKEN,
      false,
    );
  });

  it('uses the authenticated manager token and the environment selected by useQA (false)', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    await fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      MOCK_TOKEN,
      false,
    );
  });

  it('uses the authenticated manager token and the environment selected by useQA (true)', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    await fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, true);
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      MOCK_TOKEN,
      true,
    );
  });

  it('returns the first array item when the API responds with a populated array', async () => {
    const timesheet: TimesheetResponse = {
      totalHours: 32.5,
      averageHoursPerDay: 6.5,
      stats: [{ date: '2026-07-27', hours: 8 }],
    };
    mockApiGet.mockResolvedValueOnce([timesheet]);
    const result = await fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, false);
    expect(result).toEqual(timesheet);
  });

  it('returns null when the API returns an empty array (no timesheet)', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    const result = await fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, false);
    expect(result).toBeNull();
  });

  it('returns null when the API returns a nullish response', async () => {
    mockApiGet.mockResolvedValueOnce(null);
    const result = await fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, false);
    expect(result).toBeNull();
  });

  it('never attempts a two-parameter or one-parameter fallback request (regression guard against fetchTimesheet strategy shape)', async () => {
    // Simulate the underlying HTTP layer rejecting (e.g. 400) — a fallback-based
    // implementation like fetchTimesheet would retry with fewer params; this
    // function must not: exactly one apiGet call, and the thrown error propagates.
    const apiError = new Error('CROS-0005: missing required parameter');
    mockApiGet.mockRejectedValueOnce(apiError);
    await expect(
      fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, false),
    ).rejects.toBe(apiError);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('propagates the exact AuthError instance thrown by apiGet unchanged', async () => {
    const authError = new AuthError(401);
    mockApiGet.mockRejectedValueOnce(authError);
    await expect(
      fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, false),
    ).rejects.toBe(authError);
  });
});
