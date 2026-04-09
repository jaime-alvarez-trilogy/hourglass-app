/**
 * FR3: widgetBridge.ts stub replacement tests
 * Tests for src/lib/widgetBridge.ts
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../widgets/bridge', () => ({
  updateWidgetData: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { updateWidgetData } from '../../lib/widgetBridge';
import * as widgetsBridge from '../../widgets/bridge';

const mockRealUpdateWidgetData = widgetsBridge.updateWidgetData as jest.Mock;

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

const MOCK_SNAPSHOT = {
  hoursData: MOCK_HOURS_DATA,
  aiData: MOCK_AI_DATA,
  pendingCount: 3,
  config: MOCK_CONFIG,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockRealUpdateWidgetData.mockResolvedValue(undefined);
});

describe('FR3: widgetBridge.updateWidgetData', () => {
  it('calls widgets/bridge.updateWidgetData with data.hoursData, data.aiData, data.pendingCount, data.config', async () => {
    await updateWidgetData(MOCK_SNAPSHOT);

    expect(mockRealUpdateWidgetData).toHaveBeenCalledTimes(1);
    expect(mockRealUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_SNAPSHOT.hoursData,
      MOCK_SNAPSHOT.aiData,
      MOCK_SNAPSHOT.pendingCount,
      MOCK_SNAPSHOT.config,
      [],
      []
    );
  });

  it('awaits and resolves when real bridge resolves', async () => {
    mockRealUpdateWidgetData.mockResolvedValue(undefined);

    await expect(updateWidgetData(MOCK_SNAPSHOT)).resolves.toBeUndefined();
  });

  it('rejects when real bridge rejects (error propagates)', async () => {
    const bridgeError = new Error('AsyncStorage write failed');
    mockRealUpdateWidgetData.mockRejectedValue(bridgeError);

    await expect(updateWidgetData(MOCK_SNAPSHOT)).rejects.toThrow('AsyncStorage write failed');
  });

  it('passes aiData = null when snapshot has null aiData', async () => {
    const snapshotWithNullAI = { ...MOCK_SNAPSHOT, aiData: null };

    await updateWidgetData(snapshotWithNullAI);

    expect(mockRealUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_SNAPSHOT.hoursData,
      null,
      MOCK_SNAPSHOT.pendingCount,
      MOCK_SNAPSHOT.config,
      [],
      []
    );
  });

  it('passes correct pendingCount from snapshot', async () => {
    const snapshotWithCount5 = { ...MOCK_SNAPSHOT, pendingCount: 5 };

    await updateWidgetData(snapshotWithCount5);

    expect(mockRealUpdateWidgetData).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      5,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  // ─── FR6 (08-widget-enhancements): approvalItems and myRequests forwarding ──

  it('forwards approvalItems from snapshot to real bridge', async () => {
    const approvalItems = [
      { id: 'mt-1', category: 'MANUAL', userId: 100, fullName: 'Alice', durationMinutes: 60,
        hours: '1.0', description: 'Work', startDateTime: '2026-03-18T10:00:00Z',
        type: 'WEB', timecardIds: [1], weekStartDate: '2026-03-16' },
    ];
    const snapshot = { ...MOCK_SNAPSHOT, approvalItems };
    await updateWidgetData(snapshot);
    expect(mockRealUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_SNAPSHOT.hoursData,
      MOCK_SNAPSHOT.aiData,
      MOCK_SNAPSHOT.pendingCount,
      MOCK_SNAPSHOT.config,
      approvalItems,
      []
    );
  });

  it('forwards myRequests from snapshot to real bridge', async () => {
    const myRequests = [
      { id: 'req-1', date: '2026-03-18', durationMinutes: 60, memo: 'Fix',
        status: 'PENDING' as const, rejectionReason: null },
    ];
    const snapshot = { ...MOCK_SNAPSHOT, myRequests };
    await updateWidgetData(snapshot);
    expect(mockRealUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_SNAPSHOT.hoursData,
      MOCK_SNAPSHOT.aiData,
      MOCK_SNAPSHOT.pendingCount,
      MOCK_SNAPSHOT.config,
      [],
      myRequests
    );
  });

  it('defaults approvalItems to [] when absent from snapshot', async () => {
    // snapshot has no approvalItems field
    const snapshot = { ...MOCK_SNAPSHOT };
    await updateWidgetData(snapshot);
    expect(mockRealUpdateWidgetData).toHaveBeenCalledWith(
      MOCK_SNAPSHOT.hoursData,
      MOCK_SNAPSHOT.aiData,
      MOCK_SNAPSHOT.pendingCount,
      MOCK_SNAPSHOT.config,
      [],
      []
    );
  });
});
