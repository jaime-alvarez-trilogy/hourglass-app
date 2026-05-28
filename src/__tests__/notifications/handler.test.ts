/**
 * FR5: App Background Push Handler tests
 * Tests for src/notifications/handler.ts: handleBackgroundPush, scheduleLocalNotification
 *
 * Spec 06-push-dedup: dedup is keyed on `prev_approval_ids` (JSON string[]) not `prev_approval_count` (integer).
 * See features/app/resilience-fixes/specs/06-push-dedup/spec.md for the full FR table.
 */

// Mock expo-notifications — use jest.fn() inside factory (hoisting safe)
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
}));

// Mock boundary dependencies (from other specs)
jest.mock('../../lib/crossoverData', () => ({
  fetchFreshData: jest.fn(),
}));

jest.mock('../../lib/widgetBridge', () => ({
  updateWidgetData: jest.fn(),
}));

// Mock AsyncStorage — 06-push-dedup needs removeItem for legacy-key cleanup
import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// 07-notification-lifecycle FR6: handler wraps scheduleLocalNotification in withScheduleLock.
// Default mock runs `fn` (no contention), preserving spec-06 test behavior.
jest.mock('../../lib/scheduleLock', () => ({
  withScheduleLock: jest.fn(async (fn: () => Promise<any>) => fn()),
}));

import {
  handleBackgroundPush,
  scheduleLocalNotification,
} from '../../notifications/handler';
import * as Notifications from 'expo-notifications';
import { fetchFreshData } from '../../lib/crossoverData';
import { updateWidgetData } from '../../lib/widgetBridge';
import { withScheduleLock } from '../../lib/scheduleLock';
import type { ApprovalItem } from '../../lib/approvals';

// Cast to jest.Mock after import (factories used jest.fn() directly)
const mockScheduleNotification = Notifications.scheduleNotificationAsync as jest.Mock;
const mockFetchFreshData = fetchFreshData as jest.Mock;
const mockUpdateWidgetData = updateWidgetData as jest.Mock;
const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;
const mockRemoveItem = AsyncStorage.removeItem as jest.Mock;
const mockWithScheduleLock = withScheduleLock as jest.Mock;

const PREV_IDS_KEY = 'prev_approval_ids';
const LEGACY_KEY = 'prev_approval_count';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

const makeManualItem = (id: string): ApprovalItem =>
  ({
    id,
    category: 'MANUAL',
    userId: 1,
    fullName: 'Test Contributor',
    durationMinutes: 60,
    hours: '1.0',
    description: 'manual entry',
    startDateTime: '2026-05-28T10:00:00.000Z',
    type: 'WEB',
    timecardIds: [Number(id.split('-')[1]) || 0],
    weekStartDate: '2026-05-25',
  });

const makeOvertimeItem = (id: string): ApprovalItem =>
  ({
    id,
    category: 'OVERTIME',
    overtimeId: Number(id.split('-')[1]) || 0,
    userId: 1,
    fullName: 'Test Contributor',
    jobTitle: 'Engineer',
    durationMinutes: 60,
    hours: '1.0',
    cost: 25,
    description: 'overtime',
    startDateTime: '2026-05-28T10:00:00.000Z',
    weekStartDate: '2026-05-25',
  });

// Realistic CrossoverSnapshot shape matching spec 01-widget-activation boundary contract
const makeFreshData = (
  approvalItems: ApprovalItem[] | undefined = undefined,
  isManager = false
) => ({
  pendingCount: approvalItems?.length ?? 0,
  approvalItems,
  config: {
    userId: '2362707',
    assignmentId: '79996',
    managerId: '2372227',
    primaryTeamId: '4584',
    hourlyRate: 25,
    weeklyLimit: 40,
    useQA: false,
    isManager,
    fullName: 'Test User',
    teams: [],
    lastRoleCheck: '2026-03-17T00:00:00.000Z',
    debugMode: false,
    setupComplete: true,
    setupDate: '2026-03-01T00:00:00.000Z',
  },
  hoursData: {
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
  },
  aiData: null,
});

const makePush = (dataType: string) => ({
  request: {
    content: {
      data: { type: dataType },
      title: null,
      body: null,
    },
    identifier: 'test-notif-id',
    trigger: {},
  },
  date: Date.now(),
});

// Convenience: seed the storage mock with a prev_approval_ids value (or null for absent)
const seedPrevIds = (ids: string[] | null) => {
  mockGetItem.mockImplementation(async (key: string) => {
    if (key === PREV_IDS_KEY) return ids === null ? null : JSON.stringify(ids);
    return null;
  });
};

// Convenience: seed the storage mock with a raw (possibly corrupt) string
const seedPrevIdsRaw = (raw: string) => {
  mockGetItem.mockImplementation(async (key: string) => {
    if (key === PREV_IDS_KEY) return raw;
    return null;
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateWidgetData.mockResolvedValue(undefined);
  mockScheduleNotification.mockResolvedValue('scheduled-id');
  mockSetItem.mockResolvedValue(undefined);
  mockRemoveItem.mockResolvedValue(undefined);
  mockGetItem.mockResolvedValue(null);
  // Default: lock not contended — run the wrapped fn.
  mockWithScheduleLock.mockImplementation(async (fn: () => Promise<any>) => fn());
});

// ─── Existing behavior: data.type guard / fetch / widget update ──────────────

describe('FR5: handleBackgroundPush — outer guards and fetch flow', () => {
  it('ignores notifications where data.type is not bg_refresh', async () => {
    await handleBackgroundPush(makePush('other_type') as any);

    expect(mockFetchFreshData).not.toHaveBeenCalled();
    expect(mockUpdateWidgetData).not.toHaveBeenCalled();
  });

  it('ignores notifications with no data type', async () => {
    const notif = { request: { content: { data: {} }, identifier: 'x', trigger: {} }, date: 0 };
    await handleBackgroundPush(notif as any);

    expect(mockFetchFreshData).not.toHaveBeenCalled();
  });

  it('calls fetchFreshData on bg_refresh notification', async () => {
    mockFetchFreshData.mockResolvedValueOnce(makeFreshData());

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockFetchFreshData).toHaveBeenCalledTimes(1);
  });

  it('calls updateWidgetData with the fetched fresh data', async () => {
    const freshData = makeFreshData(undefined, false);
    mockFetchFreshData.mockResolvedValueOnce(freshData);

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockUpdateWidgetData).toHaveBeenCalledWith(freshData);
  });

  it('catches and logs errors without throwing', async () => {
    mockFetchFreshData.mockRejectedValueOnce(new Error('Network timeout'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      handleBackgroundPush(makePush('bg_refresh') as any)
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── FR1: read previously-seen IDs ───────────────────────────────────────────

describe('FR1 (06-push-dedup): read previously-seen approval IDs from storage', () => {
  it('reads the prev_approval_ids key when isManager is true (T3 valid JSON array)', async () => {
    seedPrevIds(['mt-1']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockGetItem).toHaveBeenCalledWith(PREV_IDS_KEY);
  });

  it('treats absent key as null and seeds (T4 first-run path)', async () => {
    seedPrevIds(null);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    // No notification on first-run seed
    expect(mockScheduleNotification).not.toHaveBeenCalled();
    // Seed was written
    const writeCalls = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writeCalls).toHaveLength(1);
    expect(JSON.parse(writeCalls[0][1])).toEqual(['mt-1']);
  });

  it('treats malformed JSON as null without throwing (T5)', async () => {
    seedPrevIdsRaw('not-json');
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await expect(
      handleBackgroundPush(makePush('bg_refresh') as any)
    ).resolves.toBeUndefined();

    // Treated as first-run seed → no notification
    expect(mockScheduleNotification).not.toHaveBeenCalled();
    const writeCalls = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writeCalls).toHaveLength(1);
    expect(JSON.parse(writeCalls[0][1])).toEqual(['mt-1']);
  });

  it('treats non-array JSON as null without throwing (T6)', async () => {
    seedPrevIdsRaw(JSON.stringify({ foo: 'bar' }));
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await expect(
      handleBackgroundPush(makePush('bg_refresh') as any)
    ).resolves.toBeUndefined();

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    const writeCalls = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writeCalls).toHaveLength(1);
  });

  it('treats getItem rejection as null without throwing (T7)', async () => {
    mockGetItem.mockImplementation(async (key: string) => {
      if (key === PREV_IDS_KEY) throw new Error('storage offline');
      return null;
    });
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await expect(
      handleBackgroundPush(makePush('bg_refresh') as any)
    ).resolves.toBeUndefined();

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    // The seed write should still be attempted
    const writeCalls = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writeCalls).toHaveLength(1);
    expect(JSON.parse(writeCalls[0][1])).toEqual(['mt-1']);
  });
});

// ─── FR2: set-difference computation ─────────────────────────────────────────

describe('FR2 (06-push-dedup): newIds = currentIds \\ prevIds', () => {
  it('fires once with count 1 when one new item arrives (T8)', async () => {
    seedPrevIds(['mt-1']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const body = mockScheduleNotification.mock.calls[0][0].content.body;
    expect(body).toContain('1');
    expect(body).not.toContain('2'); // body must reflect new-count, not total
  });

  it('does not fire when the snapshot is unchanged (T9)', async () => {
    seedPrevIds(['mt-1', 'mt-2']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('does not fire when an item disappears (approved/rejected) (T10)', async () => {
    seedPrevIds(['mt-1', 'mt-2']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    // Storage now reflects the smaller set
    const writeCalls = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writeCalls).toHaveLength(1);
    expect(JSON.parse(writeCalls[0][1])).toEqual(['mt-1']);
  });

  it('approve-then-arrive inversion fires for the new item only (T11, Thursday-flood regression case)', async () => {
    seedPrevIds(['mt-1', 'mt-2']);
    // mt-2 was approved (gone), mt-3 arrived
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-3')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const body = mockScheduleNotification.mock.calls[0][0].content.body;
    expect(body).toContain('1');
    // The body must not advertise the total (which is still 2)
    expect(body).not.toMatch(/\b2\b/);
    // And not 0 (i.e., not "0 items pending")
    expect(body).not.toMatch(/\b0\b/);
  });

  it('fires count 2 when two overtime items arrive (T12)', async () => {
    seedPrevIds(['mt-1', 'mt-2']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData(
        [
          makeManualItem('mt-1'),
          makeManualItem('mt-2'),
          makeOvertimeItem('ot-9'),
          makeOvertimeItem('ot-10'),
        ],
        true
      )
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const body = mockScheduleNotification.mock.calls[0][0].content.body;
    expect(body).toContain('2');
    expect(body).not.toContain('4'); // not the total
  });

  it('cross-week window expansion fires for prior-week items by design (T13)', async () => {
    // Before the window widened: prev held only mt-1 (current-week item)
    seedPrevIds(['mt-1']);
    // After the window widened: snapshot now includes 2 prior-week items + mt-1
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData(
        [
          makeManualItem('mt-prev-week-A'),
          makeManualItem('mt-prev-week-B'),
          makeManualItem('mt-1'),
        ],
        true
      )
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    // Documented "regression by design" — the prior-week items appear as new
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const body = mockScheduleNotification.mock.calls[0][0].content.body;
    expect(body).toContain('2'); // 2 new
  });
});

// ─── FR3: notification scheduling shape ──────────────────────────────────────

describe('FR3 (06-push-dedup): notification shape uses new-items count', () => {
  it('body contains new-items count, not total pendingCount (T14)', async () => {
    seedPrevIds(['mt-1']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData(
        [makeManualItem('mt-1'), makeManualItem('mt-2'), makeManualItem('mt-3')],
        true
      )
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    const call = mockScheduleNotification.mock.calls[0][0];
    expect(call.content.body).toContain('2');
    expect(call.content.body).not.toContain('3');
  });

  it('title remains "New Approvals" (T15)', async () => {
    seedPrevIds(['mt-1']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification.mock.calls[0][0].content.title).toBe('New Approvals');
  });

  it('scheduleNotificationAsync is called exactly once when new items are present (T16)', async () => {
    seedPrevIds(['mt-1']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
  });
});

// ─── FR4: first-run seed ─────────────────────────────────────────────────────

describe('FR4 (06-push-dedup): first-run seed never fires', () => {
  it('absent key + items present → no notification, seeds the IDs (T17)', async () => {
    seedPrevIds(null);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    const writeCalls = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writeCalls).toHaveLength(1);
    expect(JSON.parse(writeCalls[0][1]).sort()).toEqual(['mt-1', 'mt-2']);
  });

  it('corrupt JSON + items present → no notification, seeds the IDs (T18)', async () => {
    seedPrevIdsRaw('not-json');
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    const writeCalls = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writeCalls).toHaveLength(1);
    expect(JSON.parse(writeCalls[0][1])).toEqual(['mt-1']);
  });

  it('getItem throws + items present → no notification, attempts seed write (T19)', async () => {
    mockGetItem.mockImplementation(async (key: string) => {
      if (key === PREV_IDS_KEY) throw new Error('boom');
      return null;
    });
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    const writeCalls = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writeCalls).toHaveLength(1);
    expect(JSON.parse(writeCalls[0][1])).toEqual(['mt-1']);
  });
});

// ─── FR5: legacy key cleanup ─────────────────────────────────────────────────

describe('FR5 (06-push-dedup): legacy prev_approval_count removed on write', () => {
  it('seed write also calls removeItem("prev_approval_count") (T20)', async () => {
    seedPrevIds(null);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockRemoveItem).toHaveBeenCalledWith(LEGACY_KEY);
  });

  it('post-notification write also calls removeItem("prev_approval_count") (T21)', async () => {
    seedPrevIds(['mt-1']);
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockRemoveItem).toHaveBeenCalledWith(LEGACY_KEY);
  });

  it('removeItem rejection does not propagate and notification still fires (T22)', async () => {
    seedPrevIds(['mt-1']);
    mockRemoveItem.mockRejectedValueOnce(new Error('legacy gone'));
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true)
    );

    await expect(
      handleBackgroundPush(makePush('bg_refresh') as any)
    ).resolves.toBeUndefined();

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
  });
});

// ─── FR6: non-manager gate ───────────────────────────────────────────────────

describe('FR6 (06-push-dedup): non-manager users skip the dedup block', () => {
  it('does not read prev_approval_ids when isManager is false (T23)', async () => {
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], false) // approvalItems present but role is contributor
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    const prevIdsReads = mockGetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(prevIdsReads).toHaveLength(0);
  });

  it('does not write prev_approval_ids when isManager is false (T24)', async () => {
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], false)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    const writes = mockSetItem.mock.calls.filter((c) => c[0] === PREV_IDS_KEY);
    expect(writes).toHaveLength(0);
  });

  it('does not call scheduleNotificationAsync when isManager is false (T25)', async () => {
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], false)
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('still calls updateWidgetData when isManager is false (T26)', async () => {
    const freshData = makeFreshData([makeManualItem('mt-1')], false);
    mockFetchFreshData.mockResolvedValueOnce(freshData);

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockUpdateWidgetData).toHaveBeenCalledWith(freshData);
  });
});

// ─── FR7: write-failure resilience ───────────────────────────────────────────

describe('FR7 (06-push-dedup): AsyncStorage setItem failure is non-fatal', () => {
  it('setItem rejects after notification was scheduled → notification stays, error logged, handler resolves (T27)', async () => {
    seedPrevIds(['mt-1']);
    mockSetItem.mockRejectedValueOnce(new Error('disk full'));
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true)
    );
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      handleBackgroundPush(makePush('bg_refresh') as any)
    ).resolves.toBeUndefined();

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('setItem rejects on seed write → no notification, error logged, handler resolves (T28)', async () => {
    seedPrevIds(null);
    mockSetItem.mockRejectedValueOnce(new Error('disk full'));
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], true)
    );
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      handleBackgroundPush(makePush('bg_refresh') as any)
    ).resolves.toBeUndefined();

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

// ─── scheduleLocalNotification (unchanged) ───────────────────────────────────

describe('FR5: scheduleLocalNotification', () => {
  it('schedules notification with title "New Approvals"', async () => {
    await scheduleLocalNotification(3);

    expect(mockScheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'New Approvals',
        }),
        trigger: null,
      })
    );
  });

  it('schedules notification with body containing count', async () => {
    await scheduleLocalNotification(5);

    const call = mockScheduleNotification.mock.calls[0][0];
    expect(call.content.body).toContain('5');
    expect(call.content.body).toContain('pending approval');
  });

  it('schedules notification immediately (trigger: null)', async () => {
    await scheduleLocalNotification(1);

    const call = mockScheduleNotification.mock.calls[0][0];
    expect(call.trigger).toBeNull();
  });
});

// ─── 07-notification-lifecycle FR6: lock-wrapping of scheduleLocalNotification ───

describe('07-notification-lifecycle FR6: handleBackgroundPush wraps scheduleLocalNotification in withScheduleLock', () => {
  it('NL-FR6-T30 — calls withScheduleLock when newIds.length > 0', async () => {
    // Seed: prev has mt-1, current has mt-1 + mt-2 → newIds=[mt-2]
    mockGetItem.mockImplementation(async (key: string) => {
      if (key === PREV_IDS_KEY) return JSON.stringify(['mt-1']);
      return null;
    });
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true),
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockWithScheduleLock).toHaveBeenCalledTimes(1);
    // The wrapped function, when invoked, schedules a notification.
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
  });

  it('NL-FR6-T31 — does NOT call withScheduleLock when newIds is empty', async () => {
    // Seed: prev == current → newIds=[]
    mockGetItem.mockImplementation(async (key: string) => {
      if (key === PREV_IDS_KEY) return JSON.stringify(['mt-1', 'mt-2']);
      return null;
    });
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true),
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockWithScheduleLock).not.toHaveBeenCalled();
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('NL-FR6-T32 — does NOT call withScheduleLock for non-manager', async () => {
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1')], false /* isManager */),
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockWithScheduleLock).not.toHaveBeenCalled();
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('NL-FR6-T33 — lock contention: notification skipped but savePrevIds still runs', async () => {
    // Lock contended: withScheduleLock resolves undefined without invoking fn
    mockWithScheduleLock.mockImplementationOnce(async () => undefined);

    mockGetItem.mockImplementation(async (key: string) => {
      if (key === PREV_IDS_KEY) return JSON.stringify(['mt-1']);
      return null;
    });
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-1'), makeManualItem('mt-2')], true),
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    // withScheduleLock was attempted...
    expect(mockWithScheduleLock).toHaveBeenCalledTimes(1);
    // ...but the notification was NOT scheduled (lock returned undefined).
    expect(mockScheduleNotification).not.toHaveBeenCalled();
    // CRITICAL: savePrevIds still ran — prev_approval_ids advanced to current set.
    expect(mockSetItem).toHaveBeenCalledWith(
      PREV_IDS_KEY,
      JSON.stringify(['mt-1', 'mt-2']),
    );
  });

  it('NL-FR6-T34 — lock wraps the actual scheduleNotificationAsync call (not the dedup logic)', async () => {
    // Arrange: capture the function passed into withScheduleLock and verify it
    // is what triggers scheduleNotificationAsync.
    let captured: (() => Promise<unknown>) | null = null;
    mockWithScheduleLock.mockImplementationOnce(async (fn: () => Promise<unknown>) => {
      captured = fn;
      return fn();
    });

    mockGetItem.mockImplementation(async (key: string) => {
      if (key === PREV_IDS_KEY) return JSON.stringify([]);
      return null;
    });
    mockFetchFreshData.mockResolvedValueOnce(
      makeFreshData([makeManualItem('mt-7')], true),
    );

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(captured).not.toBeNull();
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
  });
});

