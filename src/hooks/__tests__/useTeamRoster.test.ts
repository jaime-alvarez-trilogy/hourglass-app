// Tests: useTeamRoster hook — prerequisite hook for 02-team-aggregate-hook
//
// Not owned by any spec's file list (see src/hooks/useTeamRoster.ts header for
// why it had to be built here), but ships with the same test rigor as any
// other hook in this codebase. Follows the useMyRequests.test.ts convention:
// static source analysis + testing the exported queryFn directly, since
// renderHook is not viable under jest-expo/node.

import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../store/config', () => ({
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
}));

jest.mock('../../api/team', () => ({
  fetchMyTeams: jest.fn(),
  fetchTeamRoster: jest.fn(),
}));

import { loadCredentials } from '../../store/config';
import { getAuthToken } from '../../api/client';
import { fetchMyTeams, fetchTeamRoster } from '../../api/team';
import { buildTeamRosterQueryFn } from '../../hooks/useTeamRoster';
import type { RawTeam, TeamMember } from '../../types/api';

const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;
const mockGetAuthToken = getAuthToken as jest.MockedFunction<typeof getAuthToken>;
const mockFetchMyTeams = fetchMyTeams as jest.MockedFunction<typeof fetchMyTeams>;
const mockFetchTeamRoster = fetchTeamRoster as jest.MockedFunction<typeof fetchTeamRoster>;

const CREDENTIALS = { username: 'manager@example.com', password: 'pass123' };
const CONFIG = { useQA: false };
const TOKEN = '2374000:token123';

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    assignmentId: '1',
    candidateId: '10',
    managerId: '20',
    teamId: '2374',
    teamName: 'Team Alpha',
    name: 'Report One',
    photoUrl: undefined,
    isManager: false,
    ...overrides,
  };
}

// ─── Static analysis ──────────────────────────────────────────────────────────

const HOOK_PATH = path.resolve(__dirname, '../../..', 'src', 'hooks', 'useTeamRoster.ts');

describe('useTeamRoster — static analysis of source contract', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, 'utf8');
  });

  it('exports useTeamRoster function', () => {
    expect(source).toMatch(/export\s+function\s+useTeamRoster/);
  });

  it('uses TanStack Query (useQuery)', () => {
    expect(source).toMatch(/useQuery/);
  });

  it('queryKey includes teamRoster and primaryTeamId', () => {
    expect(source).toMatch(/\[\s*['"]teamRoster['"]\s*,\s*config\?\.primaryTeamId\s*\]/);
  });

  it('enabled guard is !!config', () => {
    expect(source).toMatch(/enabled\s*:\s*!!\s*config/);
  });

  it('staleTime is 24 hours', () => {
    expect(source).toMatch(/staleTime\s*:\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  it('calls fetchMyTeams then fetchTeamRoster', () => {
    expect(source).toMatch(/fetchMyTeams/);
    expect(source).toMatch(/fetchTeamRoster/);
  });
});

// ─── buildTeamRosterQueryFn ───────────────────────────────────────────────────

describe('useTeamRoster — buildTeamRosterQueryFn (query logic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mints one token and fans out fetchTeamRoster across every team from fetchMyTeams', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    const teams: RawTeam[] = [{ id: 2374, name: 'Team A' }, { id: 5000, name: 'Team B' }];
    mockFetchMyTeams.mockResolvedValue(teams);
    mockFetchTeamRoster.mockImplementation(async (teamId) => [
      makeMember({ assignmentId: `member-${teamId}`, teamId }),
    ]);

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    const result = await queryFn();

    expect(mockGetAuthToken).toHaveBeenCalledTimes(1);
    expect(mockFetchTeamRoster).toHaveBeenCalledTimes(2);
    expect(mockFetchTeamRoster).toHaveBeenCalledWith('2374', TOKEN, false);
    expect(mockFetchTeamRoster).toHaveBeenCalledWith('5000', TOKEN, false);
    expect(result).toHaveLength(2);
  });

  it('flattens rosters from multiple teams into a single array', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    mockFetchMyTeams.mockResolvedValue([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    mockFetchTeamRoster.mockImplementation(async (teamId) =>
      teamId === '1'
        ? [makeMember({ assignmentId: 'a1' }), makeMember({ assignmentId: 'a2' })]
        : [makeMember({ assignmentId: 'b1' })],
    );

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    const result = await queryFn();

    expect(result.map((m) => m.assignmentId)).toEqual(['a1', 'a2', 'b1']);
  });

  it('returns [] when fetchMyTeams resolves to no teams', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    mockFetchMyTeams.mockResolvedValue([]);

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    const result = await queryFn();

    expect(result).toEqual([]);
    expect(mockFetchTeamRoster).not.toHaveBeenCalled();
  });

  it('throws when credentials are missing', async () => {
    mockLoadCredentials.mockResolvedValue(null);

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    await expect(queryFn()).rejects.toThrow('Missing credentials or config');
    expect(mockGetAuthToken).not.toHaveBeenCalled();
  });

  it('throws when config is null', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);

    const queryFn = buildTeamRosterQueryFn(null);
    await expect(queryFn()).rejects.toThrow('Missing credentials or config');
  });

  it('propagates rejection when fetchTeamRoster fails for any team', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    mockFetchMyTeams.mockResolvedValue([{ id: 1, name: 'A' }]);
    const err = new Error('network down');
    mockFetchTeamRoster.mockRejectedValue(err);

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    await expect(queryFn()).rejects.toBe(err);
  });
});
