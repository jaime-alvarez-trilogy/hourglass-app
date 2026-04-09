// FR6 Tests: fetchWorkDiary
// Written BEFORE implementation (TDD red phase)

import { fetchWorkDiary } from '../../src/api/workDiary';
import { AuthError, NetworkError } from '../../src/api/errors';
import type { Credentials } from '../../src/types/config';
import type { WorkDiarySlot } from '../../src/types/api';

// Mock the API client module so we can intercept calls
jest.mock('../../src/api/client', () => ({
  getAuthToken: jest.fn(),
  apiGet: jest.fn(),
}));

import { getAuthToken, apiGet } from '../../src/api/client';

const mockGetAuthToken = getAuthToken as jest.Mock;
const mockApiGet = apiGet as jest.Mock;

const CREDENTIALS: Credentials = {
  username: 'user@example.com',
  password: 'secret',
};

const MOCK_TOKEN = '1190137:token123';

const MOCK_SLOTS: WorkDiarySlot[] = [
  {
    tags: ['ai_usage'],
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
  },
  {
    tags: ['second_brain'],
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
  },
  {
    tags: [],
    autoTracker: false,
    status: 'PENDING',
    memo: 'Fix login bug',
    actions: [
      {
        actionType: 'ADD_MANUAL_TIME',
        comment: 'Fix',
        actionMadeBy: 2362707,
        createdDate: '2026-03-04T10:00:00Z',
      },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockResolvedValue(MOCK_TOKEN);
  mockApiGet.mockResolvedValue(MOCK_SLOTS);
});

describe('FR6: fetchWorkDiary', () => {
  it('calls getAuthToken with credentials and useQA flag', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    expect(mockGetAuthToken).toHaveBeenCalledWith('user@example.com', 'secret', false);
  });

  it('calls apiGet with correct path /api/timetracking/workdiaries', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/timetracking/workdiaries',
      expect.any(Object),
      MOCK_TOKEN,
      false,
    );
  });

  it('passes assignmentId (NOT userId) in query params', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    const [, params] = mockApiGet.mock.calls[0];
    expect(params).toHaveProperty('assignmentId', '79996');
    expect(params).not.toHaveProperty('userId');
  });

  it('passes date as-is in YYYY-MM-DD format', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    const [, params] = mockApiGet.mock.calls[0];
    expect(params).toHaveProperty('date', '2026-03-04');
  });

  it('returns the typed WorkDiarySlot array from apiGet', async () => {
    const result = await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    expect(result).toEqual(MOCK_SLOTS);
    expect(Array.isArray(result)).toBe(true);
  });

  it('uses QA flag: passes useQA=true through to getAuthToken and apiGet', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, true);
    expect(mockGetAuthToken).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      true,
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      MOCK_TOKEN,
      true,
    );
  });

  it('propagates AuthError from getAuthToken to caller', async () => {
    mockGetAuthToken.mockRejectedValueOnce(new AuthError(401));
    await expect(
      fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('propagates AuthError from apiGet to caller', async () => {
    mockApiGet.mockRejectedValueOnce(new AuthError(403));
    await expect(
      fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('propagates NetworkError from getAuthToken to caller', async () => {
    mockGetAuthToken.mockRejectedValueOnce(new NetworkError('No connection'));
    await expect(
      fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('returns empty array when apiGet returns []', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    const result = await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    expect(result).toEqual([]);
  });
});
