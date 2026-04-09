/**
 * FR5: App Background Push Handler tests
 * Tests for src/notifications/handler.ts: handleBackgroundPush, scheduleLocalNotification
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

// Mock AsyncStorage for previous approval count
import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import {
  handleBackgroundPush,
  scheduleLocalNotification,
} from '../../notifications/handler';
import * as Notifications from 'expo-notifications';
import { fetchFreshData } from '../../lib/crossoverData';
import { updateWidgetData } from '../../lib/widgetBridge';

// Cast to jest.Mock after import (factories used jest.fn() directly)
const mockScheduleNotification = Notifications.scheduleNotificationAsync as jest.Mock;
const mockFetchFreshData = fetchFreshData as jest.Mock;
const mockUpdateWidgetData = updateWidgetData as jest.Mock;

// Realistic CrossoverSnapshot shape matching spec 01-widget-activation boundary contract
const makeFreshData = (pendingCount = 0, isManager = false) => ({
  pendingCount,
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

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateWidgetData.mockResolvedValue(undefined);
  mockScheduleNotification.mockResolvedValue('scheduled-id');
});

describe('FR5: handleBackgroundPush', () => {
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
    const freshData = makeFreshData(0, false);
    mockFetchFreshData.mockResolvedValueOnce(freshData);

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockUpdateWidgetData).toHaveBeenCalledWith(freshData);
  });

  it('schedules local notification when manager has new approvals', async () => {
    // Previous count: 1, new count: 3
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('1');
    const freshData = makeFreshData(3, true);
    mockFetchFreshData.mockResolvedValueOnce(freshData);

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const call = mockScheduleNotification.mock.calls[0][0];
    expect(call.content.title).toBe('New Approvals');
    expect(call.content.body).toContain('3');
    expect(call.content.body).toContain('pending approval');
  });

  it('does not schedule notification when approval count is unchanged', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('2');
    const freshData = makeFreshData(2, true);
    mockFetchFreshData.mockResolvedValueOnce(freshData);

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('does not schedule notification for non-manager users', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('0');
    const freshData = makeFreshData(5, false); // 5 "approvals" but user is not a manager
    mockFetchFreshData.mockResolvedValueOnce(freshData);

    await handleBackgroundPush(makePush('bg_refresh') as any);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
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
