// FR1-FR3 (01-team-roster-api): Tests for fetchMyTeams and fetchTeamRoster
// Written BEFORE implementation (TDD red phase) — src/api/team.ts does not exist yet.
//
// FR1 (02-team-aggregate-hook): Tests for fetchReportTimesheet, extending this
// file per spec.md's "Files to Create/Modify" table — written BEFORE
// fetchReportTimesheet exists in src/api/team.ts.
//
// durable-data 01-auth-renewal FR4: each function takes an optional trailing
// creds and always forwards it as the last apiGet argument (an explicit
// trailing undefined without it), so the client can renew an expired token.
//
// Managed roster: fetchManagedAssignments (every ACTIVE assignment the caller
// manages, no teamId) and fetchTeamRoster both page /api/v2/teams/assignments
// (default page size 10 live): limit=500 and page from 0 until the envelope's
// last page, capped at 20 pages with a counts-only log.

import {
  fetchMyTeams,
  fetchTeamRoster,
  fetchManagedAssignments,
  fetchReportTimesheet,
} from '../../api/team';
import { AuthError, NetworkError } from '../../api/errors';
import type { RawTeam, RawTeamAssignment, TeamMember } from '../../types/api';
import type { TimesheetResponse } from '../../lib/hours';

// Mock the API client module so we can intercept calls, matching the
// convention in __tests__/api/work-diary.test.ts.
jest.mock('../../api/client', () => ({
  apiGet: jest.fn(),
}));

jest.mock('../../lib/log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { apiGet } from '../../api/client';
import { log } from '../../lib/log';

const mockApiGet = apiGet as jest.Mock;
const mockLogWarn = log.warn as jest.Mock;

const MOCK_TOKEN = '2374000:token123';
const CREDS = { username: 'manager@example.com', password: 'pass123', useQA: false };

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
      userId: '1190137',
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
      userId: '1190137',
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
      undefined,
    );
  });

  it('DD1 FR4: forwards the given creds object as the last apiGet argument', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    await fetchMyTeams(MOCK_TOKEN, false, CREDS);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams',
      { status: 'ACTIVE' },
      MOCK_TOKEN,
      false,
      CREDS,
    );
    expect(mockApiGet.mock.calls[0][4]).toBe(CREDS);
  });

  it('passes useQA=true through to apiGet when requested', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    await fetchMyTeams(MOCK_TOKEN, true);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams',
      { status: 'ACTIVE' },
      MOCK_TOKEN,
      true,
      undefined,
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
  it('sends GET /api/v2/teams/assignments with { teamId, status: "ACTIVE", limit: "500", page: "0" }, the token, and useQA', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [] });
    await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams/assignments',
      { teamId: '2374', status: 'ACTIVE', limit: '500', page: '0' },
      MOCK_TOKEN,
      false,
      undefined,
    );
  });

  it('DD1 FR4: forwards the given creds object as the last apiGet argument', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [] });
    await fetchTeamRoster('2374', MOCK_TOKEN, false, CREDS);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams/assignments',
      { teamId: '2374', status: 'ACTIVE', limit: '500', page: '0' },
      MOCK_TOKEN,
      false,
      CREDS,
    );
    expect(mockApiGet.mock.calls[0][4]).toBe(CREDS);
  });

  it('passes useQA=true through to apiGet when requested', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [] });
    await fetchTeamRoster('2374', MOCK_TOKEN, true);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams/assignments',
      { teamId: '2374', status: 'ACTIVE', limit: '500', page: '0' },
      MOCK_TOKEN,
      true,
      undefined,
    );
  });

  it('reads assignments from the Spring content envelope and maps every field exactly, with IDs stringified', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [makeAssignment()] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toEqual([
      {
        assignmentId: '79996',
        candidateId: '2362707',
        userId: '1190137',
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
        userId: '1190137',
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
        userId: '1190137',
        managerId: '2372227',
        teamId: '2374',
        teamName: 'Team Alpha',
        name: 'Jane Doe',
        photoUrl: undefined,
        isManager: false,
      },
    ]);
  });

  it('auto-approve: maps candidate.userId to a string userId, and a missing one to null without throwing', async () => {
    const withoutUserId = makeAssignment({
      id: 79997,
      candidate: {
        id: 2362708,
        printableName: 'No Person Id',
      } as RawTeamAssignment['candidate'],
    });
    mockApiGet.mockResolvedValueOnce({ content: [makeAssignment(), withoutUserId] });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result.map((m) => m.userId)).toEqual(['1190137', null]);
    expect(result[1].candidateId).toBe('2362708');
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
// Paging: /api/v2/teams/assignments pages at 10 rows by default, so an
// unpaged call lost everyone after the first 10 (a real report, assignment
// 80232, was missing). Both roster calls send limit + page and follow pages.
// ---------------------------------------------------------------------------

// The n-th distinct report: unique assignment, avatar and person ids.
function reportRow(n: number, overrides: Partial<RawTeamAssignment> = {}): RawTeamAssignment {
  return makeAssignment({
    id: 80000 + n,
    candidate: {
      id: 3000000 + n,
      userId: 1200000 + n,
      printableName: `Report ${n}`,
      avatarTypes: ['CANDIDATE'],
    },
    ...overrides,
  });
}

function rows(from: number, to: number): RawTeamAssignment[] {
  const out: RawTeamAssignment[] = [];
  for (let n = from; n <= to; n++) out.push(reportRow(n));
  return out;
}

// The page params each apiGet call sent, in order.
const sentPages = () => mockApiGet.mock.calls.map((call) => call[1].page);

// A server shaped like the live one: pages of `limit` rows (10 without it;
// `size` ignored), 0-based `page`, Spring envelope. 65 reports, the last one
// assignment 80232 — the report the unpaged roster was missing.
const SIXTY_FIVE = [...rows(1, 64), reportRow(232)];
function liveLikeServer(all: RawTeamAssignment[]) {
  return async (_path: string, params: Record<string, string>) => {
    const limit = params.limit ? Number(params.limit) : 10;
    const page = params.page ? Number(params.page) : 0;
    const totalPages = Math.ceil(all.length / limit);
    return {
      content: all.slice(page * limit, (page + 1) * limit),
      totalElements: all.length,
      totalPages,
      size: limit,
      number: page,
      last: page + 1 >= totalPages,
    };
  };
}

describe('FR3: fetchTeamRoster paging', () => {
  it('follows pages until the last one, sending teamId, limit and page on each', async () => {
    mockApiGet
      .mockResolvedValueOnce({ content: rows(1, 10), last: false, totalPages: 2, number: 0 })
      .mockResolvedValueOnce({ content: [reportRow(11)], last: true, totalPages: 2, number: 1 });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false, CREDS);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    expect(mockApiGet).toHaveBeenNthCalledWith(
      1,
      '/api/v2/teams/assignments',
      { teamId: '2374', status: 'ACTIVE', limit: '500', page: '0' },
      MOCK_TOKEN,
      false,
      CREDS,
    );
    expect(mockApiGet).toHaveBeenNthCalledWith(
      2,
      '/api/v2/teams/assignments',
      { teamId: '2374', status: 'ACTIVE', limit: '500', page: '1' },
      MOCK_TOKEN,
      false,
      CREDS,
    );
    expect(result).toHaveLength(11);
    expect(result[10].assignmentId).toBe('80011');
  });

  it('makes one request when the envelope is its only page', async () => {
    mockApiGet.mockResolvedValueOnce({ content: rows(1, 3), last: true, totalPages: 1, number: 0 });
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
  });

  it('a live-shaped server (10 rows unless limit is sent): all 65 reports, 80232 included', async () => {
    mockApiGet.mockImplementation(liveLikeServer(SIXTY_FIVE));
    const result = await fetchTeamRoster('2374', MOCK_TOKEN, false);
    expect(result).toHaveLength(65);
    expect(result.map((m) => m.assignmentId)).toContain('80232');
  });
});

describe('fetchManagedAssignments', () => {
  it('sends GET /api/v2/teams/assignments with { status: "ACTIVE", limit: "500", page: "0" } and no teamId', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [], last: true, totalPages: 0 });
    await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams/assignments',
      { status: 'ACTIVE', limit: '500', page: '0' },
      MOCK_TOKEN,
      false,
      undefined,
    );
    expect(mockApiGet.mock.calls[0][1]).not.toHaveProperty('teamId');
  });

  it('passes useQA=true through to apiGet when requested', async () => {
    mockApiGet.mockResolvedValueOnce({ content: [], last: true });
    await fetchManagedAssignments(MOCK_TOKEN, true);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v2/teams/assignments',
      { status: 'ACTIVE', limit: '500', page: '0' },
      MOCK_TOKEN,
      true,
      undefined,
    );
  });

  it('DD1 FR4: forwards the given creds object as the last apiGet argument of every page', async () => {
    mockApiGet
      .mockResolvedValueOnce({ content: [reportRow(1)], last: false, totalPages: 2 })
      .mockResolvedValueOnce({ content: [reportRow(2)], last: true, totalPages: 2 });
    await fetchManagedAssignments(MOCK_TOKEN, false, CREDS);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    expect(mockApiGet.mock.calls[0][4]).toBe(CREDS);
    expect(mockApiGet.mock.calls[1][4]).toBe(CREDS);
  });

  it('single-page envelope: one request, every field mapped exactly, rows from every team kept', async () => {
    const otherTeam = reportRow(2, { team: { id: 5004, name: 'Team Beta' } });
    mockApiGet.mockResolvedValueOnce({
      content: [makeAssignment(), otherTeam],
      totalElements: 2,
      totalPages: 1,
      size: 500,
      number: 0,
      last: true,
    });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        assignmentId: '79996',
        candidateId: '2362707',
        userId: '1190137',
        managerId: '2372227',
        teamId: '2374',
        teamName: 'Team Alpha',
        name: 'Jane Doe',
        photoUrl: 'https://crossover.com/photos/2362707.jpg',
        isManager: false,
      },
      {
        assignmentId: '80002',
        candidateId: '3000002',
        userId: '1200002',
        managerId: '2372227',
        teamId: '5004',
        teamName: 'Team Beta',
        name: 'Report 2',
        photoUrl: undefined,
        isManager: false,
      },
    ]);
  });

  it('a live-shaped server (10 rows unless limit is sent): all 65 reports in one page, 80232 included', async () => {
    mockApiGet.mockImplementation(liveLikeServer(SIXTY_FIVE));
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(65);
    expect(result.map((m) => m.assignmentId)).toContain('80232');
  });

  it('a live-shaped server paging smaller than limit: every page followed, 80232 included', async () => {
    // As if the server capped pages at 10 whatever limit says: 7 pages.
    const server = liveLikeServer(SIXTY_FIVE);
    mockApiGet.mockImplementation((path: string, params: Record<string, string>) =>
      server(path, { ...params, limit: '10' }));
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(sentPages()).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(result).toHaveLength(65);
    expect(result[64].assignmentId).toBe('80232');
  });

  it('multi-page: requests page 0, 1, 2 until totalPages and keeps the reports past the first page', async () => {
    mockApiGet
      .mockResolvedValueOnce({ content: rows(1, 10), totalPages: 3, number: 0 })
      .mockResolvedValueOnce({ content: rows(11, 20), totalPages: 3, number: 1 })
      .mockResolvedValueOnce({ content: [reportRow(21)], totalPages: 3, number: 2 });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(sentPages()).toEqual(['0', '1', '2']);
    expect(mockApiGet.mock.calls.every((call) => call[1].limit === '500')).toBe(true);
    expect(result).toHaveLength(21);
    expect(result.map((m) => m.assignmentId)).toEqual(
      Array.from({ length: 21 }, (_, i) => String(80001 + i)),
    );
  });

  it('multi-page: follows last: false without totalPages, and stops at last: true', async () => {
    mockApiGet
      .mockResolvedValueOnce({ content: rows(1, 10), last: false })
      .mockResolvedValueOnce({ content: [reportRow(11)], last: true });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(sentPages()).toEqual(['0', '1']);
    expect(result.map((m) => m.assignmentId)).toContain('80011');
  });

  it('stops at last: true even when totalPages says there are more', async () => {
    mockApiGet.mockResolvedValueOnce({ content: rows(1, 2), last: true, totalPages: 5 });
    await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('stops at an empty page even when the envelope says last: false', async () => {
    mockApiGet
      .mockResolvedValueOnce({ content: rows(1, 10), last: false })
      .mockResolvedValueOnce({ content: [], last: false });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(10);
  });

  it('reads an envelope with neither last nor totalPages as one page', async () => {
    mockApiGet.mockResolvedValueOnce({ content: rows(1, 10) });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(10);
  });

  it('accepts a bare assignment array as the only page', async () => {
    mockApiGet.mockResolvedValueOnce(rows(1, 12));
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(12);
    expect(result[11]).toMatchObject({ assignmentId: '80012', name: 'Report 12' });
  });

  it.each<[string, unknown]>([
    ['an empty content envelope', { content: [], last: true }],
    ['an empty bare array', []],
    ['a nullish response', null],
    ['an unrecognized envelope shape (non-array content)', { content: {} }],
  ])('resolves %s to [] in one request', async (_label, response) => {
    mockApiGet.mockResolvedValueOnce(response);
    await expect(fetchManagedAssignments(MOCK_TOKEN, false)).resolves.toEqual([]);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('page cap: stops after 20 pages and logs counts only', async () => {
    let n = 0;
    mockApiGet.mockImplementation(async () => {
      n++;
      return { content: [reportRow(n)], last: false, totalPages: 100 };
    });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(20);
    expect(sentPages()[19]).toBe('19');
    expect(result).toHaveLength(20);
    expect(mockLogWarn).toHaveBeenCalledTimes(1);
    expect(mockLogWarn).toHaveBeenCalledWith('team.assignments_page_cap', {
      pageCount: 20,
      rowCount: 20,
      totalPages: 100,
    });
  });

  it('page cap: a last page at exactly the cap is not logged', async () => {
    let n = 0;
    mockApiGet.mockImplementation(async () => {
      n++;
      return { content: [reportRow(n)], totalPages: 20 };
    });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(mockApiGet).toHaveBeenCalledTimes(20);
    expect(result).toHaveLength(20);
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  it('keeps an assignment repeated across pages once (its first row)', async () => {
    const shifted = reportRow(10, { candidate: { id: 3000010, userId: 1200010, printableName: 'Renamed' } });
    mockApiGet
      .mockResolvedValueOnce({ content: rows(1, 10), last: false })
      .mockResolvedValueOnce({ content: [shifted, reportRow(11)], last: true });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(result).toHaveLength(11);
    expect(result.filter((m) => m.assignmentId === '80010')).toEqual([
      expect.objectContaining({ name: 'Report 10' }),
    ]);
  });

  it('keeps one person\'s assignments on two teams as two rows', async () => {
    const secondTeam = makeAssignment({ id: 80099, team: { id: 5004, name: 'Team Beta' } });
    mockApiGet.mockResolvedValueOnce({ content: [makeAssignment(), secondTeam], last: true });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(result.map((m) => [m.assignmentId, m.candidateId, m.teamId])).toEqual([
      ['79996', '2362707', '2374'],
      ['80099', '2362707', '5004'],
    ]);
  });

  it('keeps the manager\'s own assignment (self-managed); dropping self is the caller\'s job', async () => {
    const self = makeAssignment({
      id: 79000,
      candidate: { id: 2372227, userId: 1190140, printableName: 'Manager Managerson', avatarTypes: ['CANDIDATE', 'MANAGER'] },
    });
    mockApiGet.mockResolvedValueOnce({ content: [self, makeAssignment()], last: true });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(result.map((m) => [m.candidateId, m.isManager])).toEqual([
      ['2372227', true],
      ['2362707', false],
    ]);
  });

  it('filters out non-ACTIVE rows (INACTIVE, TERMINATED, lowercase "active") on every page', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        content: [reportRow(1), reportRow(2, { status: 'INACTIVE' })],
        last: false,
      })
      .mockResolvedValueOnce({
        content: [reportRow(3, { status: 'TERMINATED' }), reportRow(4, { status: 'active' }), reportRow(5)],
        last: true,
      });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(result.map((m) => m.assignmentId)).toEqual(['80001', '80005']);
  });

  it('auto-approve: maps candidate.userId to a string userId, and a missing one to null without throwing', async () => {
    const withoutUserId = makeAssignment({
      id: 79997,
      candidate: { id: 2362708, printableName: 'No Person Id' } as RawTeamAssignment['candidate'],
    });
    mockApiGet.mockResolvedValueOnce({ content: [makeAssignment(), withoutUserId], last: true });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(result.map((m) => m.userId)).toEqual(['1190137', null]);
    expect(result[1].candidateId).toBe('2362708');
  });

  // Same guards as fetchTeamRoster: a missing leaf fails loudly, naming the
  // caller and the field, instead of fabricating "undefined" as an id.
  it.each<[string, Partial<RawTeamAssignment>]>([
    ['id', { id: undefined as unknown as number }],
    ['candidate.id', { candidate: { id: undefined as unknown as number, userId: 1190137, printableName: 'Jane Doe' } }],
    ['manager.id', { manager: { id: undefined as unknown as number } }],
    ['team.id', { team: { id: undefined as unknown as number, name: 'Team Alpha' } }],
    ['team.name', { team: { id: 2374, name: undefined as unknown as string } }],
    ['candidate.printableName', { candidate: { id: 2362707, userId: 1190137, printableName: undefined as unknown as string } }],
  ])('throws naming the missing field when "%s" is absent', async (field, overrides) => {
    mockApiGet.mockResolvedValueOnce({ content: [makeAssignment(overrides)], last: true });
    await expect(fetchManagedAssignments(MOCK_TOKEN, false)).rejects.toThrow(
      `fetchManagedAssignments: malformed assignment row — missing "${field}"`,
    );
  });

  it('skips a malformed non-ACTIVE row without throwing (filtered before mapping, as fetchTeamRoster)', async () => {
    const malformedInactive = makeAssignment({ id: undefined as unknown as number, status: 'INACTIVE' });
    mockApiGet.mockResolvedValueOnce({ content: [malformedInactive, makeAssignment()], last: true });
    const result = await fetchManagedAssignments(MOCK_TOKEN, false);
    expect(result.map((m) => m.assignmentId)).toEqual(['79996']);
  });

  it('a malformed row on a later page fails the whole call (no partial roster)', async () => {
    mockApiGet
      .mockResolvedValueOnce({ content: rows(1, 10), last: false })
      .mockResolvedValueOnce({ content: [makeAssignment({ manager: { id: undefined as unknown as number } })], last: true });
    await expect(fetchManagedAssignments(MOCK_TOKEN, false)).rejects.toThrow('missing "manager.id"');
  });

  it('propagates the exact AuthError instance thrown by apiGet unchanged', async () => {
    const authError = new AuthError(403);
    mockApiGet.mockRejectedValueOnce(authError);
    await expect(fetchManagedAssignments(MOCK_TOKEN, false)).rejects.toBe(authError);
  });

  it('propagates a NetworkError on a later page instead of returning the first page', async () => {
    const networkError = new NetworkError('Timed out');
    mockApiGet
      .mockResolvedValueOnce({ content: rows(1, 10), last: false })
      .mockRejectedValueOnce(networkError);
    await expect(fetchManagedAssignments(MOCK_TOKEN, false)).rejects.toBe(networkError);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// FR1 (02-team-aggregate-hook): fetchReportTimesheet(member, weekStartDate, token, useQA)
// ---------------------------------------------------------------------------

const MEMBER: TeamMember = {
  assignmentId: '79996',
  candidateId: '2362707',
  userId: '1190137',
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
      undefined,
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
      undefined,
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
      undefined,
    );
  });

  it('DD1 FR4: forwards the given creds object (the manager\'s own) as the last apiGet argument', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    await fetchReportTimesheet(MEMBER, WEEK_START, MOCK_TOKEN, false, CREDS);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/timetracking/timesheets',
      expect.objectContaining({ userId: MEMBER.candidateId }),
      MOCK_TOKEN,
      false,
      CREDS,
    );
    expect(mockApiGet.mock.calls[0][4]).toBe(CREDS);
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
