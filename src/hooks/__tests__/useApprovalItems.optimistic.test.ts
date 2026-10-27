// Tests: useApprovalItems — the optimistic removal is a filter over the live query data
// (1.2 auto-approve). The runner changes ['approvals'] itself (its refetch after
// approving; removeApprovalItems in the manager preview), so a hand approve / reject must
// not freeze the queue on a copy of the data taken at that moment. And hidden items stay
// hidden until a refetch has landed (approveAll, pull-to-refresh), never just because one
// started.
//
// Same harness as __tests__/use-approval-items.test.ts (react-test-renderer, a real
// QueryClient), in its own file so the render tests above it cannot delay these. The
// network is never reached: the config store, getAuthToken and the approvals wrappers are
// mocked. The "server" is the current week's raw rows; the two prior weeks are empty.

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApprovalItems } from '../useApprovalItems';
import { getWeekStartDate } from '../../lib/approvals';
import type { ApprovalItem } from '../../lib/approvals';
import type { CrossoverConfig } from '../../types/config';

jest.mock('../../api/approvals', () => ({
  fetchPendingManual: jest.fn(),
  fetchPendingOvertime: jest.fn(),
  approveManual: jest.fn(),
  rejectManual: jest.fn(),
  approveOvertime: jest.fn(),
  rejectOvertime: jest.fn(),
}));

jest.mock('../../store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
}));

import { approveManual, fetchPendingManual, fetchPendingOvertime } from '../../api/approvals';
import { loadConfig, loadCredentials } from '../../store/config';
import { getAuthToken } from '../../api/client';

const mockFetchManual = fetchPendingManual as jest.Mock;
const mockFetchOvertime = fetchPendingOvertime as jest.Mock;
const mockApproveManual = approveManual as jest.Mock;
const mockLoadConfig = loadConfig as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MANAGER: CrossoverConfig = {
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
const PREVIEW: CrossoverConfig = { ...MANAGER, isManager: false, devManagerView: true };

function rawManual(userId: number, timecardIds: number[], startDateTime: string) {
  return {
    userId,
    fullName: `Person ${userId}`,
    manualTimes: [
      { status: 'PENDING', timecardIds, durationMinutes: 60, description: 'Work', startDateTime, type: 'WEB' as const },
    ],
  };
}

// Newest first in the queue: mt-7 (03-11), mt-1-2 (03-10), ot-42 (03-08).
const RAW_NEW = rawManual(700, [7], '2026-03-11T09:00:00Z');
const RAW_MANUAL = rawManual(100, [1, 2], '2026-03-10T09:00:00Z');
const RAW_OVERTIME = {
  overtimeRequest: { id: 42, status: 'PENDING', durationMinutes: 120, description: 'Release', startDateTime: '2026-03-08T18:00:00Z' },
  assignment: { id: 1, salary: 50, selection: { marketplaceMember: { application: { candidate: { id: 2362707, printableName: 'Bob Jones', jobTitle: 'Engineer' } } } } },
};

let server: { manual: unknown[]; overtime: unknown[] };

// ─── Harness ─────────────────────────────────────────────────────────────────

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise<void>((res) => setTimeout(res, 0));
    });
  }
}

function setupHook() {
  // retryDelay 0: the hook's retry: 2 would otherwise wait seconds before a refetch fails
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity } } });
  let current!: ReturnType<typeof useApprovalItems>;
  const Child = () => {
    current = useApprovalItems();
    return null;
  };
  act(() => {
    create(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Child)));
  });
  return { get: () => current, queryClient };
}

const ids = (items: ApprovalItem[]) => items.map((i) => i.id);

beforeEach(() => {
  jest.clearAllMocks();
  const currentMonday = getWeekStartDate();
  server = { manual: [RAW_MANUAL], overtime: [RAW_OVERTIME] };
  mockFetchManual.mockImplementation(async (_t: string, _qa: boolean, week: string) =>
    week === currentMonday ? server.manual : []);
  mockFetchOvertime.mockImplementation(async (_t: string, _qa: boolean, week: string) =>
    week === currentMonday ? server.overtime : []);
  mockLoadConfig.mockResolvedValue(MANAGER);
  (loadCredentials as jest.Mock).mockResolvedValue({ username: 'user@test.com', password: 'pass' });
  (getAuthToken as jest.Mock).mockResolvedValue('mock-token');
  mockApproveManual.mockResolvedValue(undefined);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useApprovalItems — optimistic removal follows the query data', () => {
  it('after a hand approval, the queue still shows later data (runner approvals, new arrivals)', async () => {
    const { get, queryClient } = setupHook();
    await flush();
    expect(ids(get().items)).toEqual(['mt-1-2', 'ot-42']);

    // Approved by hand; the server still lists it for a while (lag): it stays hidden
    await act(async () => {
      await get().approveItem(get().items[0]);
    });
    await flush();
    expect(ids(get().items)).toEqual(['ot-42']);

    // The runner approves ot-42 and invalidates; meanwhile mt-7 arrived. Used to stay
    // frozen on the copy taken at the hand approval (ot-42 shown as pending, mt-7 missing).
    server = { manual: [RAW_MANUAL, RAW_NEW], overtime: [] };
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
    });
    await flush();
    expect(ids(get().items)).toEqual(['mt-7']);
  });

  it('a failed approval shows its item again, without undoing other removals', async () => {
    server = { manual: [RAW_MANUAL, RAW_NEW], overtime: [RAW_OVERTIME] };
    mockApproveManual.mockRejectedValueOnce(new Error('Failed'));
    const { get } = setupHook();
    await flush();
    expect(ids(get().items)).toEqual(['mt-7', 'mt-1-2', 'ot-42']);

    await act(async () => {
      await get().approveItem(get().items[2]); // ot-42 (the server lags)
    });
    await act(async () => {
      await get().approveItem(get().items[1]).catch(() => {}); // mt-1-2 fails
    });
    await flush();
    expect(ids(get().items)).toEqual(['mt-7', 'mt-1-2']);
  });

  it('manager preview: a hand approval and the runner\'s simulated removals both show', async () => {
    mockLoadConfig.mockResolvedValue(PREVIEW);
    const { get, queryClient } = setupHook();
    await flush();
    const [first, second] = get().items;
    expect(second).toBeDefined();

    await act(async () => {
      await get().approveItem(second);
    });
    // removeApprovalItems (src/hooks/useAutoApprove.ts) after a simulated approval of
    // `first`. Used to have no visible effect behind the frozen copy.
    act(() => {
      queryClient.setQueryData<ApprovalItem[]>(['approvals'], (old) => old?.filter((i) => i.id !== first.id));
    });
    await flush();
    expect(get().items).toEqual([]);
  });

  it('pull-to-refresh (refetch) shows the server list again', async () => {
    mockLoadConfig.mockResolvedValue(PREVIEW);
    const { get } = setupHook();
    await flush();
    const before = ids(get().items);
    await act(async () => {
      await get().approveItem(get().items[0]);
    });
    expect(get().items).toHaveLength(before.length - 1);

    act(() => {
      get().refetch();
    });
    await flush();
    expect(ids(get().items)).toEqual(before);
  });
});

describe('useApprovalItems — hidden items stay hidden until fresh data lands', () => {
  it('approveAll: the approved items stay hidden while the refetch runs, and when it fails', async () => {
    const { get } = setupHook();
    await flush();
    expect(ids(get().items)).toEqual(['mt-1-2', 'ot-42']);

    // Both approvals succeed; the refetch after them is held, then fails
    const refetch = deferred<unknown[]>();
    mockFetchManual.mockImplementation(() => refetch.promise);
    await act(async () => {
      await get().approveAll();
    });
    await flush();
    // Used to show both again as pending while the refetch ran
    expect(get().items).toEqual([]);

    refetch.reject(new Error('Network request failed'));
    await flush();
    expect(get().error).not.toBeNull();
    // ... and to leave them listed when it failed (the last good data still has them)
    expect(get().items).toEqual([]);
  });

  it('pull-to-refresh shows the server list again once it lands, not before', async () => {
    const { get } = setupHook();
    await flush();
    await act(async () => {
      await get().approveItem(get().items[0]); // mt-1-2; the server lags and still lists it
    });
    await flush();
    expect(ids(get().items)).toEqual(['ot-42']);

    const refetch = deferred<unknown[]>();
    const currentMonday = getWeekStartDate();
    mockFetchManual.mockImplementation(async (_t: string, _qa: boolean, week: string) =>
      week === currentMonday ? refetch.promise : []);
    act(() => {
      get().refetch();
    });
    await flush();
    // Used to show it again at once, as pending, while the refetch ran
    expect(ids(get().items)).toEqual(['ot-42']);

    refetch.resolve([RAW_MANUAL]);
    await flush();
    expect(ids(get().items)).toEqual(['mt-1-2', 'ot-42']);
  });

  it('a pull-to-refresh that fails keeps them hidden', async () => {
    const { get } = setupHook();
    await flush();
    await act(async () => {
      await get().approveItem(get().items[0]);
    });
    await flush();

    mockFetchManual.mockRejectedValue(new Error('Network request failed'));
    act(() => {
      get().refetch();
    });
    await flush();
    expect(get().error).not.toBeNull();
    expect(ids(get().items)).toEqual(['ot-42']);
  });

  it('a pull-to-refresh that lands while an approve is in flight keeps that item hidden', async () => {
    const { get } = setupHook();
    await flush();
    const approving = deferred<void>();
    mockApproveManual.mockReturnValueOnce(approving.promise);
    let approve!: Promise<void>;
    act(() => {
      approve = get().approveItem(get().items[0]); // mt-1-2, held
    });
    await flush();
    expect(ids(get().items)).toEqual(['ot-42']);

    act(() => {
      get().refetch(); // lands at once: the server still lists mt-1-2
    });
    await flush();
    expect(ids(get().items)).toEqual(['ot-42']);

    server = { manual: [], overtime: [RAW_OVERTIME] };
    await act(async () => {
      approving.resolve();
      await approve;
    });
    await flush();
    expect(ids(get().items)).toEqual(['ot-42']);
  });
});
