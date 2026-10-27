// Tests: useTeamRoster hook — prerequisite hook for 02-team-aggregate-hook
//
// Not owned by any spec's file list (see src/hooks/useTeamRoster.ts header for
// why it had to be built here), but ships with the same test rigor as any
// other hook in this codebase. Follows the useMyRequests.test.ts convention:
// static source analysis + testing the exported queryFn directly, since
// renderHook is not viable under jest-expo/node.
//
// The queryFn makes one paged fetchManagedAssignments() call: no
// fetchMyTeams() and no per-team fetchTeamRoster() fan-out (which lost
// reports past a team's first 10 rows and on teams the manager doesn't own).

import * as fs from 'fs';
import * as path from 'path';
import { stripComments } from '../../../__tests__/helpers/stripComments';

jest.mock('../../store/config', () => ({
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
}));

jest.mock('../../api/team', () => ({
  fetchManagedAssignments: jest.fn(),
  fetchMyTeams: jest.fn(),
  fetchTeamRoster: jest.fn(),
}));

import { loadCredentials } from '../../store/config';
import { getAuthToken } from '../../api/client';
import { fetchManagedAssignments, fetchMyTeams, fetchTeamRoster } from '../../api/team';
import { buildTeamRosterQueryFn, teamRosterQueryKey } from '../../hooks/useTeamRoster';
import type { TeamMember } from '../../types/api';

const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;
const mockGetAuthToken = getAuthToken as jest.MockedFunction<typeof getAuthToken>;
const mockFetchManagedAssignments = fetchManagedAssignments as jest.MockedFunction<
  typeof fetchManagedAssignments
>;
const mockFetchMyTeams = fetchMyTeams as jest.MockedFunction<typeof fetchMyTeams>;
const mockFetchTeamRoster = fetchTeamRoster as jest.MockedFunction<typeof fetchTeamRoster>;

const CREDENTIALS = { username: 'manager@example.com', password: 'pass123' };
const CONFIG = { useQA: false };
// durable-data 01-auth-renewal FR4: renewal creds passed to the roster request.
const CREDS_WITH_ENV = { ...CREDENTIALS, useQA: false };
const TOKEN = '2374000:token123';

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    assignmentId: '1',
    candidateId: '10',
    userId: null,
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

  it('queryKey includes teamRoster, the v2 version, primaryTeamId and the environment', () => {
    expect(source).toMatch(/queryKey\s*:\s*teamRosterQueryKey\(\s*config\s*\)/);
    expect(source).toMatch(/\[\s*['"]teamRoster['"]\s*,\s*'v2'\s*,\s*config\?\.primaryTeamId\s*,\s*config\?\.useQA\s*\?\s*'qa'\s*:\s*'prod'\s*\]/);
  });

  it('enabled guard is !!config', () => {
    expect(source).toMatch(/enabled\s*:\s*!!\s*config/);
  });

  it('staleTime is 24 hours', () => {
    expect(source).toMatch(/staleTime\s*:\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  it('retry is 1 (useDirectReports shares this cache entry with the same options)', () => {
    expect(source).toMatch(/retry\s*:\s*1\b/);
  });

  it('calls fetchManagedAssignments, never fetchMyTeams or fetchTeamRoster', () => {
    const code = stripComments(source);
    expect(code).toMatch(/fetchManagedAssignments\(/);
    expect(code).not.toMatch(/fetchMyTeams/);
    expect(code).not.toMatch(/fetchTeamRoster/);
  });
});

// ─── teamRosterQueryKey ───────────────────────────────────────────────────────

describe('useTeamRoster — teamRosterQueryKey', () => {
  // app/modal.tsx refetches the active roster with the old config's queryFn when it
  // switches environment: one key for both would relabel that roster as the new one's.
  it('differs between QA and prod for the same team', () => {
    expect(teamRosterQueryKey({ primaryTeamId: '4584', useQA: false })).toEqual(['teamRoster', 'v2', '4584', 'prod']);
    expect(teamRosterQueryKey({ primaryTeamId: '4584', useQA: true })).toEqual(['teamRoster', 'v2', '4584', 'qa']);
  });

  // Earlier builds cached (and persisted) the roster under ['teamRoster', team, env], cut
  // off at 10 rows per team: the version segment means that entry is never read again.
  it('carries a version segment, so a roster cached by an earlier build is never reused', () => {
    const key = teamRosterQueryKey({ primaryTeamId: '4584', useQA: false });
    expect(key).not.toEqual(['teamRoster', '4584', 'prod']);
    expect(key[1]).toBe('v2');
    // Still under the ['teamRoster'] prefix the Retry and the Team overview refetch
    expect(key[0]).toBe('teamRoster');
  });
});

// ─── buildTeamRosterQueryFn ───────────────────────────────────────────────────

describe('useTeamRoster — buildTeamRosterQueryFn (query logic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mints one token and makes ONE fetchManagedAssignments call, with no teams call or per-team fan-out', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    const roster = [
      makeMember({ assignmentId: 'a1', teamId: '2374' }),
      makeMember({ assignmentId: 'b1', teamId: '5004', teamName: 'Team Beta' }),
    ];
    mockFetchManagedAssignments.mockResolvedValue(roster);

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    const result = await queryFn();

    expect(mockGetAuthToken).toHaveBeenCalledTimes(1);
    expect(mockFetchManagedAssignments).toHaveBeenCalledTimes(1);
    expect(mockFetchManagedAssignments).toHaveBeenCalledWith(TOKEN, false, CREDS_WITH_ENV);
    expect(mockFetchMyTeams).not.toHaveBeenCalled();
    expect(mockFetchTeamRoster).not.toHaveBeenCalled();
    expect(result).toEqual(roster);
  });

  it('returns every managed assignment, reports past the first 10 included', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    const roster = Array.from({ length: 17 }, (_, i) =>
      makeMember({ assignmentId: String(80220 + i), candidateId: String(3000 + i) }),
    );
    mockFetchManagedAssignments.mockResolvedValue(roster);

    const result = await buildTeamRosterQueryFn(CONFIG)();

    expect(result).toHaveLength(17);
    expect(result.map((m) => m.assignmentId)).toContain('80232');
  });

  it('DD1 FR4: a QA config puts useQA true in the renewal creds', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    mockFetchManagedAssignments.mockResolvedValue([]);

    await buildTeamRosterQueryFn({ useQA: true })();

    const qaCreds = { ...CREDENTIALS, useQA: true };
    expect(mockGetAuthToken).toHaveBeenCalledWith(CREDENTIALS.username, CREDENTIALS.password, true);
    expect(mockFetchManagedAssignments).toHaveBeenCalledWith(TOKEN, true, qaCreds);
  });

  it('returns [] when the manager manages no assignments', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    mockFetchManagedAssignments.mockResolvedValue([]);

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    const result = await queryFn();

    expect(result).toEqual([]);
  });

  it('throws when credentials are missing', async () => {
    mockLoadCredentials.mockResolvedValue(null);

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    await expect(queryFn()).rejects.toThrow('Missing credentials or config');
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockFetchManagedAssignments).not.toHaveBeenCalled();
  });

  it('throws when config is null', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);

    const queryFn = buildTeamRosterQueryFn(null);
    await expect(queryFn()).rejects.toThrow('Missing credentials or config');
  });

  it('propagates rejection when fetchManagedAssignments fails', async () => {
    mockLoadCredentials.mockResolvedValue(CREDENTIALS);
    mockGetAuthToken.mockResolvedValue(TOKEN);
    const err = new Error('network down');
    mockFetchManagedAssignments.mockRejectedValue(err);

    const queryFn = buildTeamRosterQueryFn(CONFIG);
    await expect(queryFn()).rejects.toBe(err);
  });
});
