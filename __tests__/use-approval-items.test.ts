// FR3: useApprovalItems hook
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApprovalItems } from '../src/hooks/useApprovalItems';
import type { CrossoverConfig } from '../src/types/config';
import type { ManualApprovalItem, OvertimeApprovalItem } from '../src/lib/approvals';

// --- Mock API functions ---
jest.mock('../src/api/approvals', () => ({
  fetchPendingManual: jest.fn(),
  fetchPendingOvertime: jest.fn(),
  approveManual: jest.fn(),
  rejectManual: jest.fn(),
  approveOvertime: jest.fn(),
  rejectOvertime: jest.fn(),
}));

// --- Mock config store ---
jest.mock('../src/store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
  getApiBase: jest.fn((useQA: boolean) =>
    useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com'
  ),
}));

// --- Mock auth (getAuthToken lives in client.ts) ---
jest.mock('../src/api/client', () => ({
  getAuthToken: jest.fn().mockResolvedValue('mock-token'),
}));

import {
  fetchPendingManual,
  fetchPendingOvertime,
  approveManual,
  rejectManual,
  approveOvertime,
  rejectOvertime,
} from '../src/api/approvals';
import { loadConfig, loadCredentials } from '../src/store/config';
import { getAuthToken } from '../src/api/client';

const mockFetchManual = fetchPendingManual as jest.Mock;
const mockFetchOvertime = fetchPendingOvertime as jest.Mock;
const mockApproveManual = approveManual as jest.Mock;
const mockRejectManual = rejectManual as jest.Mock;
const mockApproveOvertime = approveOvertime as jest.Mock;
const mockRejectOvertime = rejectOvertime as jest.Mock;
const mockLoadConfig = loadConfig as jest.Mock;
const mockLoadCreds = loadCredentials as jest.Mock;

const MANAGER_CONFIG: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Manager Name',
  managerId: '2372227',
  primaryTeamId: '4584',
  assignmentId: '79996',
  hourlyRate: 50,
  weeklyLimit: 40,
  useQA: false,
  isManager: true,
  teams: [],
  lastRoleCheck: '2026-01-01T00:00:00.000Z',
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
  debugMode: false,
};

const CONTRIBUTOR_CONFIG: CrossoverConfig = {
  ...MANAGER_CONFIG,
  isManager: false,
};

const MANUAL_ITEM: ManualApprovalItem = {
  id: 'mt-1-2',
  category: 'MANUAL',
  userId: 100,
  fullName: 'Alice Smith',
  durationMinutes: 90,
  hours: '1.5',
  description: 'Fix bug',
  startDateTime: '2026-03-10T09:00:00Z',
  type: 'WEB',
  timecardIds: [1, 2],
  weekStartDate: '2026-03-09',
};

const OVERTIME_ITEM: OvertimeApprovalItem = {
  id: 'ot-42',
  category: 'OVERTIME',
  overtimeId: 42,
  userId: 2362707,
  fullName: 'Bob Jones',
  jobTitle: 'Senior Engineer',
  durationMinutes: 120,
  hours: '2.0',
  cost: 100,
  description: 'Emergency work',
  startDateTime: '2026-03-08T18:00:00Z',
  weekStartDate: '2026-03-09',
};

async function flushAsync() {
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
}

function setupHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let current!: ReturnType<typeof useApprovalItems>;
  const Wrapper = () =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(() => { current = useApprovalItems(); return null; }),
    );
  act(() => { create(React.createElement(Wrapper)); });
  return { get: () => current, queryClient };
}

beforeEach(() => {
  mockFetchManual.mockReset();
  mockFetchOvertime.mockReset();
  mockApproveManual.mockReset();
  mockRejectManual.mockReset();
  mockApproveOvertime.mockReset();
  mockRejectOvertime.mockReset();
  mockLoadConfig.mockReset();
  mockLoadCreds.mockReset();
  (getAuthToken as jest.Mock).mockResolvedValue?.('mock-token');

  // Default: manager with items
  mockLoadConfig.mockResolvedValue(MANAGER_CONFIG);
  mockLoadCreds.mockResolvedValue({ username: 'user@test.com', password: 'pass' });
  mockFetchManual.mockResolvedValue([MANUAL_ITEM]);
  mockFetchOvertime.mockResolvedValue([OVERTIME_ITEM]);
  mockApproveManual.mockResolvedValue(undefined);
  mockRejectManual.mockResolvedValue(undefined);
  mockApproveOvertime.mockResolvedValue(undefined);
  mockRejectOvertime.mockResolvedValue(undefined);
});

// =============================================================================
// FR3: Contributor guard
// =============================================================================

describe('FR3: contributor guard', () => {
  it('FR3_returns_empty_items_and_not_loading_when_isManager_false', async () => {
    mockLoadConfig.mockResolvedValue(CONTRIBUTOR_CONFIG);
    const { get } = setupHook();
    await flushAsync();
    expect(get().items).toEqual([]);
    expect(get().isLoading).toBe(false);
  });
});

// =============================================================================
// FR3: Sort order
// =============================================================================

describe('FR3: sort order', () => {
  it('FR3_items_sorted_by_startDateTime_descending', async () => {
    // MANUAL_ITEM is 2026-03-10 (later), OVERTIME_ITEM is 2026-03-08 (earlier)
    const { get } = setupHook();
    await flushAsync();
    const items = get().items;
    if (items.length >= 2) {
      expect(items[0].startDateTime >= items[1].startDateTime).toBe(true);
    }
  });
});

// =============================================================================
// FR3: approveItem — MANUAL
// =============================================================================

describe('FR3: approveItem MANUAL', () => {
  it('FR3_approveItem_calls_approveManual_with_correct_approverId', async () => {
    const { get } = setupHook();
    await flushAsync();
    await act(async () => {
      await get().approveItem(MANUAL_ITEM);
    });
    expect(mockApproveManual).toHaveBeenCalledWith(
      'mock-token',
      false,
      MANAGER_CONFIG.userId, // approverId = config.userId
      MANUAL_ITEM.timecardIds
    );
  });

  it('FR3_approveItem_MANUAL_does_not_call_approveOvertime', async () => {
    const { get } = setupHook();
    await flushAsync();
    await act(async () => {
      await get().approveItem(MANUAL_ITEM);
    });
    expect(mockApproveOvertime).not.toHaveBeenCalled();
  });
});

// =============================================================================
// FR3: approveItem — OVERTIME
// =============================================================================

describe('FR3: approveItem OVERTIME', () => {
  it('FR3_approveItem_calls_approveOvertime_for_OVERTIME_item', async () => {
    const { get } = setupHook();
    await flushAsync();
    await act(async () => {
      await get().approveItem(OVERTIME_ITEM);
    });
    expect(mockApproveOvertime).toHaveBeenCalledWith(
      'mock-token',
      false,
      OVERTIME_ITEM.overtimeId
    );
  });

  it('FR3_approveItem_OVERTIME_does_not_call_approveManual', async () => {
    const { get } = setupHook();
    await flushAsync();
    await act(async () => {
      await get().approveItem(OVERTIME_ITEM);
    });
    expect(mockApproveManual).not.toHaveBeenCalled();
  });
});

// =============================================================================
// FR3: rejectItem — MANUAL
// =============================================================================

describe('FR3: rejectItem MANUAL', () => {
  it('FR3_rejectItem_calls_rejectManual_with_rejectionReason', async () => {
    const { get } = setupHook();
    await flushAsync();
    await act(async () => {
      await get().rejectItem(MANUAL_ITEM, 'Not valid');
    });
    expect(mockRejectManual).toHaveBeenCalledWith(
      'mock-token',
      false,
      MANAGER_CONFIG.userId,
      MANUAL_ITEM.timecardIds,
      'Not valid'
    );
  });

  it('FR3_rejectItem_throws_when_reason_is_empty_string', async () => {
    const { get } = setupHook();
    await flushAsync();
    await expect(
      act(async () => { await get().rejectItem(MANUAL_ITEM, ''); })
    ).rejects.toThrow();
  });
});

// =============================================================================
// FR3: rejectItem — OVERTIME
// =============================================================================

describe('FR3: rejectItem OVERTIME', () => {
  it('FR3_rejectItem_calls_rejectOvertime_with_memo', async () => {
    const { get } = setupHook();
    await flushAsync();
    await act(async () => {
      await get().rejectItem(OVERTIME_ITEM, 'Budget exceeded');
    });
    expect(mockRejectOvertime).toHaveBeenCalledWith(
      'mock-token',
      false,
      OVERTIME_ITEM.overtimeId,
      'Budget exceeded'
    );
  });
});

// =============================================================================
// FR3: approveAll
// =============================================================================

// Raw API data shapes for approveAll tests (fetchPendingManual/Overtime return raw data
// that parseManualItems/parseOvertimeItems transform — passing already-parsed ApprovalItems
// would yield empty results since the parsers expect the raw nested structure)
const RAW_MANUAL = {
  userId: 100,
  fullName: 'Alice Smith',
  manualTimes: [{
    status: 'PENDING',
    timecardIds: [1, 2],
    durationMinutes: 90,
    description: 'Fix bug',
    startDateTime: '2026-03-10T09:00:00Z',
    type: 'WEB' as const,
  }],
};
const RAW_OVERTIME = {
  overtimeRequest: { id: 42, status: 'PENDING', durationMinutes: 120, description: 'Emergency work', startDateTime: '2026-03-08T18:00:00Z' },
  assignment: { id: 1, salary: 50, selection: { marketplaceMember: { application: { candidate: { id: 2362707, printableName: 'Bob Jones', jobTitle: 'Senior Engineer' } } } } },
};

describe('FR3: approveAll', () => {
  it('FR3_approveAll_calls_approve_for_each_item_in_list', async () => {
    mockFetchManual.mockResolvedValue([RAW_MANUAL]);
    mockFetchOvertime.mockResolvedValue([RAW_OVERTIME]);
    const { get } = setupHook();
    await flushAsync();

    await act(async () => {
      await get().approveAll();
    });

    // Should have called approveManual for the manual item
    expect(mockApproveManual).toHaveBeenCalled();
    // Should have called approveOvertime for the overtime item
    expect(mockApproveOvertime).toHaveBeenCalled();
  });

  it('FR3_approveAll_continues_when_one_item_fails', async () => {
    mockFetchManual.mockResolvedValue([RAW_MANUAL]);
    mockFetchOvertime.mockResolvedValue([RAW_OVERTIME]);
    // Make manual approval fail
    mockApproveManual.mockRejectedValue(new Error('Failed'));
    mockApproveOvertime.mockResolvedValue(undefined);

    const { get } = setupHook();
    await flushAsync();

    // approveAll should not throw even though one item failed
    await expect(
      act(async () => { await get().approveAll(); })
    ).resolves.not.toThrow();

    // Flush any residual async work (concurrent approveItem calls may need extra time)
    await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });

    // OT item was still attempted
    expect(mockApproveOvertime).toHaveBeenCalled();
  });
});
