/**
 * FR5: useWidgetSync hook tests
 * Tests for src/hooks/useWidgetSync.ts
 */

import type { ManualApprovalItem } from '../../lib/approvals';
import type { ManualRequestEntry } from '../../types/requests';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../widgets/bridge', () => ({
  updateWidgetData: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { renderHook, act } from '@testing-library/react-native';
import { useWidgetSync } from '../../hooks/useWidgetSync';
import * as widgetsBridge from '../../widgets/bridge';

const mockUpdateWidgetData = widgetsBridge.updateWidgetData as jest.Mock;

// ─── Test fixtures ────────────────────────────────────────────────────────────

const MOCK_HOURS_DATA = {
  total: 32.5,
  average: 6.5,
  today: 6.5,
  daily: [],
  weeklyEarnings: 812.5,
  todayEarnings: 162.5,
  hoursRemaining: 7.5,
  overtimeHours: 0,
  timeRemaining: 86400000,
  deadline: new Date('2026-03-22T23:59:59.000Z'),
};

const MOCK_AI_DATA = {
  aiPctLow: 73,
  aiPctHigh: 77,
  brainliftHours: 0.2,
  totalSlots: 20,
  taggedSlots: 18,
  workdaysElapsed: 3,
  dailyBreakdown: [],
};

const MOCK_CONFIG = {
  userId: '2362707',
  assignmentId: '79996',
  managerId: '2372227',
  primaryTeamId: '4584',
  hourlyRate: 25,
  weeklyLimit: 40,
  useQA: false,
  isManager: true,
  fullName: 'Test User',
  teams: [],
  lastRoleCheck: '2026-03-17T00:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-03-01T00:00:00.000Z',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateWidgetData.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

function makeManualItem(id: string, fullName: string, hours: string): ManualApprovalItem {
  return {
    id,
    category: 'MANUAL',
    userId: 0,
    fullName,
    durationMinutes: Math.round(parseFloat(hours) * 60),
    hours,
    description: '',
    startDateTime: '',
    type: 'WEB',
    timecardIds: [],
    weekStartDate: '',
  };
}

describe('FR5: useWidgetSync', () => {
  it('calls updateWidgetData on first render when hoursData and config are non-null', async () => {
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 2, MOCK_CONFIG)
    );

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(1);
    expect(mockUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_HOURS_DATA,
      MOCK_AI_DATA,
      2,
      MOCK_CONFIG,
      [],
      [],
      undefined,
    );
  });

  it('does NOT call updateWidgetData when hoursData is null', async () => {
    await renderHook(() =>
      useWidgetSync(null, MOCK_AI_DATA, false, 0, MOCK_CONFIG)
    );

    expect(mockUpdateWidgetData).not.toHaveBeenCalled();
  });

  it('does NOT call updateWidgetData when config is null', async () => {
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 0, null)
    );

    expect(mockUpdateWidgetData).not.toHaveBeenCalled();
  });

  it('calls updateWidgetData again when hoursData changes (new reference)', async () => {
    const { rerender } = await renderHook<void, { hoursData: typeof MOCK_HOURS_DATA }>(
      ({ hoursData }) => useWidgetSync(hoursData, MOCK_AI_DATA, false, 0, MOCK_CONFIG),
      { initialProps: { hoursData: MOCK_HOURS_DATA } }
    );

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(1);

    const updatedHoursData = { ...MOCK_HOURS_DATA, total: 38.0 };
    await rerender({ hoursData: updatedHoursData });

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(2);
  });

  it('calls updateWidgetData again when pendingCount changes', async () => {
    const { rerender } = await renderHook<void, { pendingCount: number }>(
      ({ pendingCount }) =>
        useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, pendingCount, MOCK_CONFIG),
      { initialProps: { pendingCount: 0 } }
    );

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(1);

    await rerender({ pendingCount: 3 });

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(2);
    expect(mockUpdateWidgetData).toHaveBeenLastCalledWith(
      MOCK_HOURS_DATA,
      MOCK_AI_DATA,
      3,
      MOCK_CONFIG,
      [],
      [],
      undefined,
    );
  });

  it('passes aiData = null to updateWidgetData when aiData is null and aiIsLoading is false (settled)', async () => {
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, null, false, 0, MOCK_CONFIG)
    );

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(1);
    expect(mockUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_HOURS_DATA,
      null,
      0,
      MOCK_CONFIG,
      [],
      [],
      undefined,
    );
  });

  it('does NOT call updateWidgetData when aiIsLoading=true and aiData=null (wait for AI to settle)', async () => {
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, null, true, 0, MOCK_CONFIG)
    );

    expect(mockUpdateWidgetData).not.toHaveBeenCalled();
  });

  it('calls updateWidgetData once aiIsLoading transitions false with aiData still null', async () => {
    const { rerender } = await renderHook<void, { aiIsLoading: boolean }>(
      ({ aiIsLoading }) =>
        useWidgetSync(MOCK_HOURS_DATA, null, aiIsLoading, 0, MOCK_CONFIG),
      { initialProps: { aiIsLoading: true } }
    );

    expect(mockUpdateWidgetData).not.toHaveBeenCalled();

    await rerender({ aiIsLoading: false });

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(1);
  });

  it('does not throw when updateWidgetData rejects (error is swallowed)', async () => {
    mockUpdateWidgetData.mockRejectedValue(new Error('Widget write failed'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // renderHook should not throw even when updateWidgetData rejects (RNTL 14: it resolves)
    await expect(
      renderHook(() =>
        useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 0, MOCK_CONFIG)
      ),
    ).resolves.toEqual(expect.objectContaining({ result: expect.anything() }));

    // Allow promise rejection to propagate and be caught
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // console.error should have been called with the error
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not call updateWidgetData when both hoursData and config are null', async () => {
    await renderHook(() =>
      useWidgetSync(null, null, false, 0, null)
    );

    expect(mockUpdateWidgetData).not.toHaveBeenCalled();
  });

  // ─── FR5 (08-widget-enhancements): new optional params ─────────────────────

  it('4-arg call (no approvalItems/myRequests) still works — updateWidgetData called once', async () => {
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 0, MOCK_CONFIG)
    );
    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(1);
  });

  it('passes approvalItems to updateWidgetData when provided', async () => {
    const approvalItems = [
      makeManualItem('mt-1', 'Alice', '1.0'),
    ];
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 1, MOCK_CONFIG, approvalItems)
    );
    expect(mockUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_HOURS_DATA,
      MOCK_AI_DATA,
      1,
      MOCK_CONFIG,
      approvalItems,
      [],
      undefined,
    );
  });

  it('passes myRequests to updateWidgetData when provided', async () => {
    const myRequests: ManualRequestEntry[] = [
      { id: 'req-1', date: '2026-03-18', durationMinutes: 60, memo: 'Fix', status: 'PENDING', rejectionReason: null },
    ];
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 0, MOCK_CONFIG, [], myRequests)
    );
    expect(mockUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_HOURS_DATA,
      MOCK_AI_DATA,
      0,
      MOCK_CONFIG,
      [],
      myRequests,
      undefined,
    );
  });

  it('re-fires updateWidgetData when approvalItems reference changes', async () => {
    const initialApprovals = [makeManualItem('mt-1', 'Alice', '1.0')];
    const updatedApprovals = [
      makeManualItem('mt-1', 'Alice', '1.0'),
      makeManualItem('mt-2', 'Bob', '2.0'),
    ];

    const { rerender } = await renderHook<void, { approvalItems: typeof initialApprovals }>(
      ({ approvalItems }) =>
        useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, approvalItems.length, MOCK_CONFIG, approvalItems),
      { initialProps: { approvalItems: initialApprovals } }
    );

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(1);

    await rerender({ approvalItems: updatedApprovals });

    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(2);
  });
});

// ─── 01-data-extensions: FR6 useWidgetSync prevWeekSnapshot param ─────────────

describe('FR6 (01-data-extensions): useWidgetSync prevWeekSnapshot param', () => {
  const MOCK_SNAPSHOT = { hours: 30.0, earnings: 1200 };

  it('FR6: prevWeekSnapshot forwarded to bridge.updateWidgetData when provided', async () => {
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 0, MOCK_CONFIG, [], [], MOCK_SNAPSHOT)
    );
    expect(mockUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_HOURS_DATA,
      MOCK_AI_DATA,
      0,
      MOCK_CONFIG,
      [],
      [],
      MOCK_SNAPSHOT
    );
  });

  it('FR6: null prevWeekSnapshot forwarded as null', async () => {
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 0, MOCK_CONFIG, [], [], null)
    );
    expect(mockUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_HOURS_DATA,
      MOCK_AI_DATA,
      0,
      MOCK_CONFIG,
      [],
      [],
      null
    );
  });

  it('FR6: existing 5-arg callers still work (backward compat)', async () => {
    await renderHook(() =>
      useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 0, MOCK_CONFIG)
    );
    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(1);
  });

  it('FR6: prevWeekSnapshot NOT in useEffect deps — changing snapshot does NOT add extra calls vs dep change', async () => {
    const snap1 = { hours: 30.0, earnings: 1200 };
    const snap2 = { hours: 28.0, earnings: 1120 };
    // Use stable array references so approvalItems dep does NOT change between renders
    const stableApprovals: never[] = [];
    const stableRequests: never[] = [];

    const { rerender } = await renderHook<
      void,
      { snap: typeof snap1 | typeof snap2 }
    >(
      ({ snap }) =>
        useWidgetSync(MOCK_HOURS_DATA, MOCK_AI_DATA, false, 0, MOCK_CONFIG, stableApprovals, stableRequests, snap),
      { initialProps: { snap: snap1 } }
    );

    // Record calls after initial render
    const callsAfterMount = mockUpdateWidgetData.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Change only the snapshot — should NOT add new calls beyond what mount produced
    mockUpdateWidgetData.mockClear();
    await rerender({ snap: snap2 });

    // No additional calls — prevWeekSnapshot is NOT in deps
    expect(mockUpdateWidgetData).toHaveBeenCalledTimes(0);
  });
});
