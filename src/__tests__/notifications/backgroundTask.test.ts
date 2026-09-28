/**
 * Headless silent-push task: payload parsing, task result, coalescing of
 * concurrent refreshes, and module-scope defineTask/registerTaskAsync wiring.
 */

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  registerTaskAsync: jest.fn().mockResolvedValue(null),
  BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

jest.mock('../../lib/crossoverData', () => ({
  fetchFreshData: jest.fn(),
}));

jest.mock('../../lib/widgetBridge', () => ({
  updateWidgetData: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../lib/scheduleLock', () => ({
  withScheduleLock: jest.fn(async (fn: () => Promise<any>) => fn()),
}));

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import {
  BG_PUSH_TASK,
  getPushTypeFromTaskPayload,
  handleBackgroundPush,
  handleBackgroundTask,
} from '../../notifications/handler';
import { fetchFreshData } from '../../lib/crossoverData';
import { updateWidgetData } from '../../lib/widgetBridge';

const mockFetchFreshData = fetchFreshData as jest.Mock;
const mockUpdateWidgetData = updateWidgetData as jest.Mock;
const Result = Notifications.BackgroundNotificationTaskResult;

const snapshot = { config: { isManager: false }, approvalItems: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchFreshData.mockResolvedValue(snapshot);
  mockUpdateWidgetData.mockResolvedValue(undefined);
});

describe('getPushTypeFromTaskPayload', () => {
  it('reads iOS payload where Expo data is nested under body', () => {
    expect(
      getPushTypeFromTaskPayload({
        notification: null,
        data: { body: { type: 'bg_refresh' }, experienceId: '@x/y' },
        aps: { 'content-available': 1 },
      })
    ).toBe('bg_refresh');
  });

  it('reads body delivered as a JSON string', () => {
    expect(
      getPushTypeFromTaskPayload({ data: { body: '{"type":"bg_refresh"}' } })
    ).toBe('bg_refresh');
  });

  it('reads Android payload from dataString', () => {
    expect(
      getPushTypeFromTaskPayload({
        notification: null,
        data: { dataString: '{"type":"bg_refresh"}' },
      })
    ).toBe('bg_refresh');
  });

  it('reads dataString wrapping a body object', () => {
    expect(
      getPushTypeFromTaskPayload({
        data: { dataString: '{"body":{"type":"bg_refresh"}}' },
      })
    ).toBe('bg_refresh');
  });

  it('reads a flat data.type', () => {
    expect(getPushTypeFromTaskPayload({ data: { type: 'bg_refresh' } })).toBe('bg_refresh');
  });

  it('reads a NotificationResponse shape', () => {
    expect(
      getPushTypeFromTaskPayload({
        notification: { request: { content: { data: { type: 'bg_refresh' } } } },
        actionIdentifier: 'default',
      })
    ).toBe('bg_refresh');
  });

  it('returns undefined for malformed or empty payloads', () => {
    expect(getPushTypeFromTaskPayload(undefined)).toBeUndefined();
    expect(getPushTypeFromTaskPayload(null)).toBeUndefined();
    expect(getPushTypeFromTaskPayload({ data: { dataString: '{not json' } })).toBeUndefined();
    expect(getPushTypeFromTaskPayload({ data: {} })).toBeUndefined();
  });
});

describe('handleBackgroundTask', () => {
  it('runs the refresh and reports NewData for bg_refresh', async () => {
    const result = await handleBackgroundTask({ data: { body: { type: 'bg_refresh' } } });
    expect(mockFetchFreshData).toHaveBeenCalledTimes(1);
    expect(mockUpdateWidgetData).toHaveBeenCalledWith(snapshot);
    expect(result).toBe(Result.NewData);
  });

  it('ignores other push types and reports NoData', async () => {
    const result = await handleBackgroundTask({ data: { body: { type: 'other' } } });
    expect(mockFetchFreshData).not.toHaveBeenCalled();
    expect(result).toBe(Result.NoData);
  });

  it('coalesces a concurrent listener + task delivery into one refresh', async () => {
    let release: () => void = () => {};
    mockFetchFreshData.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(snapshot); })
    );
    const push = { request: { content: { data: { type: 'bg_refresh' } } } } as any;
    const a = handleBackgroundPush(push);
    const b = handleBackgroundTask({ data: { body: { type: 'bg_refresh' } } });
    release();
    await Promise.all([a, b]);
    expect(mockFetchFreshData).toHaveBeenCalledTimes(1);
  });

  it('runs again once the previous refresh has settled', async () => {
    await handleBackgroundTask({ data: { body: { type: 'bg_refresh' } } });
    await handleBackgroundTask({ data: { body: { type: 'bg_refresh' } } });
    expect(mockFetchFreshData).toHaveBeenCalledTimes(2);
  });
});

describe('backgroundTask module', () => {
  it('defines and registers the task at module scope', () => {
    let TM: any;
    let N: any;
    jest.isolateModules(() => {
      require('../../notifications/backgroundTask');
      TM = require('expo-task-manager');
      N = require('expo-notifications');
    });
    expect(TM.defineTask).toHaveBeenCalledWith(BG_PUSH_TASK, expect.any(Function));
    expect(N.registerTaskAsync).toHaveBeenCalledWith(BG_PUSH_TASK);
  });

  it('task executor returns Failed on error without refreshing', async () => {
    let executor: any;
    jest.isolateModules(() => {
      require('../../notifications/backgroundTask');
      executor = (require('expo-task-manager').defineTask as jest.Mock).mock.calls[0][1];
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await executor({ data: null, error: new Error('boom'), executionInfo: {} });
    errSpy.mockRestore();
    expect(result).toBe(Result.Failed);
    expect(mockFetchFreshData).not.toHaveBeenCalled();
  });

  it('is imported by the app entry before expo-router/entry', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.resolve(__dirname, '../../..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const entry = fs.readFileSync(path.join(root, pkg.main), 'utf8');
    const taskIdx = entry.indexOf("./src/notifications/backgroundTask");
    const routerIdx = entry.indexOf("expo-router/entry");
    expect(taskIdx).toBeGreaterThanOrEqual(0);
    expect(taskIdx).toBeLessThan(routerIdx);
  });
});
