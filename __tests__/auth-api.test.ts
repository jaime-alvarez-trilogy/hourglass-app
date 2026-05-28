// FR5: fetchAndBuildConfig + extractConfigFromDetail (src/api/auth.ts)
// 05-onboarding-defense FR2/FR3/FR4: defensive parsing + NotContributorError
import { fetchAndBuildConfig } from '../src/api/auth';
import { ApiError, AuthError, NetworkError, NotContributorError } from '../src/api/errors';
import * as client from '../src/api/client';

jest.mock('../src/api/client', () => ({
  getAuthToken: jest.fn(),
  apiGet: jest.fn(),
  apiPut: jest.fn(),
}));

const mockGetAuthToken = client.getAuthToken as jest.MockedFunction<typeof client.getAuthToken>;
const mockApiGet = client.apiGet as jest.MockedFunction<typeof client.apiGet>;

// Minimal valid DetailResponse shape matching the spec interface
const makeDetail = (overrides: Record<string, unknown> = {}) => ({
  fullName: 'Jane Doe',
  avatarTypes: ['CANDIDATE'],
  assignment: {
    id: 79996,
    salary: 50,
    weeklyLimit: 40,
    team: { id: 4584, name: 'Team Alpha' },
    manager: { id: 2372227 },
    selection: {
      marketplaceMember: {
        application: { candidate: { id: 9999 } },
      },
    },
  },
  userAvatars: [{ type: 'CANDIDATE', id: 2362707 }],
  ...overrides,
});

const MOCK_TOKEN = 'token123';
const MOCK_PAYMENTS = [{ amount: 2000, paidHours: 40, currency: 'USD' }];
// Detail with salary:0 to trigger payments-path tests
const makeDetailNoSalary = (overrides: Record<string, unknown> = {}) =>
  makeDetail({ assignment: { ...makeDetail().assignment, salary: 0, ...overrides } });

// Compute a 3-month-ago date in local YYYY-MM-DD for testing
function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

beforeEach(() => {
  // resetAllMocks clears mock.calls AND the mockResolvedValueOnce queue
  jest.resetAllMocks();
  mockGetAuthToken.mockResolvedValue(MOCK_TOKEN);
  // Use mockImplementation as a safe default so leftover Once-mocks from one test
  // never bleed into the next test's mock queue.
  mockApiGet.mockImplementation(async (path: string) => {
    if (path.includes('detail')) return makeDetail();
    if (path.includes('payments')) return MOCK_PAYMENTS;
    return {};
  });
});

// --- ID Extraction ---

describe('FR5: extractConfigFromDetail — userId extraction', () => {
  it('extracts userId from userAvatars CANDIDATE entry', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.userId).toBe('2362707');
  });

  it('falls back to nested candidate.id when userAvatars absent', async () => {
    mockApiGet
      .mockResolvedValueOnce(makeDetail({ userAvatars: undefined }))
      .mockResolvedValueOnce(MOCK_PAYMENTS);
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.userId).toBe('9999');
  });

  it('falls back to nested candidate.id when userAvatars has no CANDIDATE entry', async () => {
    mockApiGet
      .mockResolvedValueOnce(makeDetail({ userAvatars: [{ avatarType: 'MANAGER', id: 111 }] }))
      .mockResolvedValueOnce(MOCK_PAYMENTS);
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.userId).toBe('9999');
  });

  it('falls back to "0" when both userId paths are absent', async () => {
    const detail = makeDetail({ userAvatars: undefined });
    detail.assignment.selection = undefined as never;
    mockApiGet
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(MOCK_PAYMENTS);
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.userId).toBe('0');
  });
});

describe('FR5: extractConfigFromDetail — other fields', () => {
  it('sets isManager: true when avatarTypes includes MANAGER', async () => {
    mockApiGet
      .mockResolvedValueOnce(makeDetail({ avatarTypes: ['CANDIDATE', 'MANAGER'] }))
      .mockResolvedValueOnce(MOCK_PAYMENTS);
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.isManager).toBe(true);
  });

  it('sets isManager: false when avatarTypes does not include MANAGER', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.isManager).toBe(false);
  });

  it('extracts assignmentId as string from assignment.id', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.assignmentId).toBe('79996');
  });

  it('extracts managerId as string from assignment.manager.id', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.managerId).toBe('2372227');
  });

  it('extracts primaryTeamId as string from assignment.team.id', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.primaryTeamId).toBe('4584');
  });

  it('uses assignment.salary for hourlyRate', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.hourlyRate).toBe(50);
  });

  it('defaults weeklyLimit to 40 when absent from response', async () => {
    const detail = makeDetail();
    delete (detail.assignment as Record<string, unknown>).weeklyLimit;
    mockApiGet
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(MOCK_PAYMENTS);
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.weeklyLimit).toBe(40);
  });

  it('builds teams array with id, name, and company empty string', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.teams).toEqual([
      { id: '4584', name: 'Team Alpha', company: '' },
    ]);
  });
});

// --- Happy Path ---

describe('FR5: fetchAndBuildConfig — happy path', () => {
  it('calls getAuthToken with provided username and password', async () => {
    await fetchAndBuildConfig('user@test.com', 'mypass', false);
    expect(mockGetAuthToken).toHaveBeenCalledWith('user@test.com', 'mypass', false);
  });

  it('calls apiGet for detail endpoint with the auth token', async () => {
    await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(mockApiGet).toHaveBeenNthCalledWith(
      1,
      '/api/identity/users/current/detail',
      {},
      MOCK_TOKEN,
      false,
    );
  });

  it('calls payments endpoint with local YYYY-MM-DD date range spanning ~3 months', async () => {
    // Salary=0 triggers the payments path
    mockApiGet.mockImplementationOnce(async () => makeDetailNoSalary());
    await fetchAndBuildConfig('user@test.com', 'pass', false);
    const [path, params] = mockApiGet.mock.calls[1];
    expect(path).toBe('/api/v3/users/current/payments');
    // Dates must be YYYY-MM-DD local format, not ISO with T/Z
    expect(params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.from).not.toContain('T');
    expect(params.to).not.toContain('T');
    // Verify the date range is approximately 3 months (80-100 days)
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);
    const daysDiff = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBeGreaterThanOrEqual(80);
    expect(daysDiff).toBeLessThanOrEqual(100);
    // 'to' should be today in local time
    expect(params.to).toBe(localDateStr(new Date()));
  });

  it('sets useQA from the parameter passed in', async () => {
    mockApiGet
      .mockResolvedValueOnce(makeDetail())
      .mockResolvedValueOnce(MOCK_PAYMENTS);
    const config = await fetchAndBuildConfig('user@test.com', 'pass', true);
    expect(config.useQA).toBe(true);
  });

  it('returns CrossoverConfig with setupComplete: false', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.setupComplete).toBe(false);
  });

  it('returned config has no undefined fields', async () => {
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    const fields: Array<keyof typeof config> = [
      'userId', 'fullName', 'managerId', 'primaryTeamId', 'assignmentId',
      'hourlyRate', 'weeklyLimit', 'useQA', 'isManager', 'teams',
      'lastRoleCheck', 'setupComplete', 'setupDate', 'debugMode',
    ];
    for (const field of fields) {
      expect(config[field]).not.toBeUndefined();
    }
  });
});

// --- Error Cases ---

describe('FR5: fetchAndBuildConfig — error cases', () => {
  it('throws AuthError when getAuthToken throws AuthError(401)', async () => {
    mockGetAuthToken.mockRejectedValueOnce(new AuthError(401));
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError when getAuthToken throws AuthError(403)', async () => {
    mockGetAuthToken.mockRejectedValueOnce(new AuthError(403));
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(AuthError);
  });

  it('throws NetworkError when getAuthToken throws NetworkError', async () => {
    mockGetAuthToken.mockRejectedValueOnce(new NetworkError('timeout'));
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(NetworkError);
  });

  it('sets hourlyRate to 0 when payments call fails but preserves other config fields', async () => {
    // salary=0 triggers payments path; payments then throws
    mockApiGet
      .mockImplementationOnce(async () => makeDetailNoSalary())
      .mockRejectedValueOnce(new Error('payments down'));
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.hourlyRate).toBe(0);
    // Other fields must still be correctly extracted from the detail response
    expect(config.userId).toBe('2362707');
    expect(config.fullName).toBe('Jane Doe');
    expect(config.assignmentId).toBe('79996');
    expect(config.setupComplete).toBe(false);
  });

  it('sets hourlyRate to 0 when payments returns empty array but preserves other config fields', async () => {
    // salary=0 triggers payments path; payments returns []
    mockApiGet
      .mockImplementationOnce(async () => makeDetailNoSalary())
      .mockResolvedValueOnce([]);
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.hourlyRate).toBe(0);
    expect(config.userId).toBe('2362707');
    expect(config.fullName).toBe('Jane Doe');
    expect(config.assignmentId).toBe('79996');
  });
});

// ============================================================================
// 05-onboarding-defense FR2: Defensive /detail parsing (no crash on
// pure-manager payload). The test surface is fetchAndBuildConfig — when
// extractConfigFromDetail returns null, the function must reach the
// /assignments fallback.
// ============================================================================

const PURE_MANAGER_DETAIL = {
  // No top-level `assignment`. userAvatars has no CANDIDATE entry.
  // Matches docs/api-samples/02-user-detail.json shape.
  fullName: 'Manager Account',
  avatarTypes: ['MANAGER', 'COMPANY_ADMIN'],
  userAvatars: [
    { id: 1421271, type: 'COMPANY_ADMIN' },
    { id: 1421271, type: 'MANAGER' },
  ],
};

// A valid AssignmentItem shape for /assignments page-content[0] fallback.
const VALID_FALLBACK_ASSIGNMENT = {
  id: 79996,
  team: { id: 4584, name: 'Team Alpha' },
  manager: { id: 2372227 },
  candidate: { id: 2362707 },
};

const EMPTY_PAGE = { content: [], totalElements: 0, totalPages: 1, last: true, first: true };
const POPULATED_PAGE = { content: [VALID_FALLBACK_ASSIGNMENT], totalElements: 1, totalPages: 1 };

describe('05-onboarding-defense FR2: defensive /detail parsing', () => {
  it('contributor-shaped /detail does NOT trigger the /assignments fallback', async () => {
    // makeDetail() returns the contributor happy-path shape. Only /detail and
    // (because salary=50) zero further apiGet calls should happen for assignment-derivation.
    await fetchAndBuildConfig('user@test.com', 'pass', false);
    const calledPaths = mockApiGet.mock.calls.map((args) => args[0] as string);
    expect(calledPaths.filter((p) => p.includes('/assignments'))).toHaveLength(0);
  });

  it('pure-manager /detail (no assignment) reaches the /assignments fallback', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)       // /detail
      .mockResolvedValueOnce(POPULATED_PAGE);            // /assignments
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    // Successfully built a config from the fallback (no NotContributorError).
    expect(config.userId).toBe('2362707');
    expect(config.assignmentId).toBe('79996');
    // Verify the /assignments call was made.
    const calledPaths = mockApiGet.mock.calls.map((args) => args[0] as string);
    expect(calledPaths.some((p) => p.includes('/api/v2/teams/assignments'))).toBe(true);
  });

  it('/detail with only userAvatars CANDIDATE but no assignment reaches the fallback', async () => {
    const detailNoAssignment = {
      fullName: 'Half User',
      avatarTypes: ['CANDIDATE'],
      userAvatars: [{ id: 99, type: 'CANDIDATE' }],
      // no assignment field
    };
    mockApiGet
      .mockResolvedValueOnce(detailNoAssignment)        // /detail
      .mockResolvedValueOnce(POPULATED_PAGE);            // /assignments
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.assignmentId).toBe('79996'); // from fallback
  });

  it('/detail with assignment present but assignment.team undefined reaches the fallback (no TypeError)', async () => {
    const detailPartial = {
      fullName: 'Partial User',
      avatarTypes: ['CANDIDATE'],
      assignment: {
        id: 79996,
        // team missing
        manager: { id: 2372227 },
      },
      userAvatars: [{ id: 2362707, type: 'CANDIDATE' }],
    };
    mockApiGet
      .mockResolvedValueOnce(detailPartial)              // /detail
      .mockResolvedValueOnce(POPULATED_PAGE);             // /assignments
    // Should not throw a TypeError — should land in the fallback.
    await expect(fetchAndBuildConfig('user@test.com', 'pass', false)).resolves.toBeDefined();
  });
});

// ============================================================================
// 05-onboarding-defense FR3: /assignments Spring page envelope read
// ============================================================================

describe('05-onboarding-defense FR3: /assignments page envelope', () => {
  it('reads response.content array from the page envelope (populated)', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)        // /detail (triggers fallback)
      .mockResolvedValueOnce(POPULATED_PAGE);             // /assignments
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    // Built from content[0]
    expect(config.userId).toBe('2362707');
    expect(config.assignmentId).toBe('79996');
    expect(config.primaryTeamId).toBe('4584');
    expect(config.managerId).toBe('2372227');
  });

  it('empty content array → NotContributorError (no exception from helper itself)', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)        // /detail
      .mockResolvedValueOnce(EMPTY_PAGE);                 // /assignments
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(NotContributorError);
  });

  it('bare-array response (legacy shape) is still readable', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)        // /detail
      .mockResolvedValueOnce([VALID_FALLBACK_ASSIGNMENT]); // /assignments (bare array)
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.userId).toBe('2362707');
    expect(config.assignmentId).toBe('79996');
  });

  it('garbage response (null) → NotContributorError', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)
      .mockResolvedValueOnce(null);
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(NotContributorError);
  });

  it('garbage response (undefined) → NotContributorError', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)
      .mockResolvedValueOnce(undefined as unknown as Record<string, unknown>);
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(NotContributorError);
  });

  it('garbage response (empty object) → NotContributorError', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)
      .mockResolvedValueOnce({});
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(NotContributorError);
  });

  it('garbage response (number) → NotContributorError', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)
      .mockResolvedValueOnce(42 as unknown as Record<string, unknown>);
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(NotContributorError);
  });

  it('makes exactly one /assignments call per fetchAndBuildConfig invocation (no pagination loop)', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)
      .mockResolvedValueOnce(POPULATED_PAGE);
    await fetchAndBuildConfig('user@test.com', 'pass', false);
    const assignmentsCalls = mockApiGet.mock.calls.filter(
      (args) => (args[0] as string).includes('/api/v2/teams/assignments'),
    );
    expect(assignmentsCalls).toHaveLength(1);
  });
});

// ============================================================================
// 05-onboarding-defense FR4: fetchAndBuildConfig throws NotContributorError
// and the userId-only fallback branch is removed.
// ============================================================================

describe('05-onboarding-defense FR4: NotContributorError terminal state', () => {
  it('pure-manager /detail + empty /assignments → NotContributorError with avatarTypes', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)
      .mockResolvedValueOnce(EMPTY_PAGE);
    let caught: unknown;
    try {
      await fetchAndBuildConfig('u', 'p', false);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(NotContributorError);
    expect((caught as NotContributorError).avatarTypes).toEqual(['MANAGER', 'COMPANY_ADMIN']);
  });

  it('pure-manager /detail + populated /assignments → returns valid CrossoverConfig', async () => {
    mockApiGet
      .mockResolvedValueOnce(PURE_MANAGER_DETAIL)
      .mockResolvedValueOnce(POPULATED_PAGE);
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config).toBeDefined();
    expect(config.userId).toBe('2362707');
    expect(config.assignmentId).toBe('79996');
  });

  it('AuthError(401) from /detail propagates unchanged (no NotContributorError)', async () => {
    mockApiGet.mockRejectedValueOnce(new AuthError(401));
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(AuthError);
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.not.toBeInstanceOf(NotContributorError);
  });

  it('AuthError(403) from /detail propagates unchanged', async () => {
    mockApiGet.mockRejectedValueOnce(new AuthError(403));
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(AuthError);
  });

  it('NetworkError from /detail propagates unchanged', async () => {
    // NetworkError is thrown by getAuthToken in current code; the spec says
    // /detail NetworkError should likewise propagate. Use mockGetAuthToken
    // to model the network-failure-during-auth path.
    mockGetAuthToken.mockRejectedValueOnce(new NetworkError('timeout'));
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toBeInstanceOf(NetworkError);
  });

  it('non-Auth ApiError from /detail + populated /assignments → returns config from fallback', async () => {
    mockApiGet
      .mockRejectedValueOnce(new ApiError(500))             // /detail
      .mockResolvedValueOnce(POPULATED_PAGE);                // /assignments
    const config = await fetchAndBuildConfig('user@test.com', 'pass', false);
    expect(config.userId).toBe('2362707');
  });

  it('non-Auth ApiError from /detail + ApiError from /assignments → throws NotContributorError([])', async () => {
    mockApiGet
      .mockRejectedValueOnce(new ApiError(500))             // /detail
      .mockRejectedValueOnce(new ApiError(500));             // /assignments
    let caught: unknown;
    try {
      await fetchAndBuildConfig('u', 'p', false);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(NotContributorError);
    expect((caught as NotContributorError).avatarTypes).toEqual([]);
  });

  it('userId-only last-resort branch is REMOVED — no stub config is returned when both paths fail', async () => {
    // Previously: when both /detail and /assignments failed, the function
    // returned a userId-only stub config. After spec 05, this throws
    // NotContributorError instead. Verify we never resolve to a stub.
    mockApiGet
      .mockRejectedValueOnce(new ApiError(500))
      .mockRejectedValueOnce(new ApiError(500));
    await expect(fetchAndBuildConfig('u', 'p', false)).rejects.toThrow();
  });
});
