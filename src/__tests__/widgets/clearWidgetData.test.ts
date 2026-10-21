/**
 * Sign-out widget clearing (build-18 review).
 *
 * clearAll() only touches AsyncStorage, but the iOS widget timeline lives in App Group
 * UserDefaults (expo-widgets updateTimeline). These tests run the iOS path of
 * src/widgets/bridge.ts with expo-widgets mocked and check that clearWidgetData()
 * replaces the timeline with a signed-out snapshot that carries no user data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
// jest.mock calls below are hoisted above these imports; the factories read the mock
// functions lazily, so the const declarations are initialised before first use.
import {
  updateWidgetData,
  clearWidgetData,
  buildSignedOutWidgetData,
} from '../../widgets/bridge';
import type { HoursData } from '../../lib/hours';
import type { CrossoverConfig } from '../../types/config';
import type { ApprovalItem, ManualApprovalItem } from '../../lib/approvals';
import type { ManualRequestEntry } from '../../types/requests';

const mockUpdateTimeline = jest.fn();
const mockCreateWidget = jest.fn((_name: string, _layout: unknown, _initialProps?: unknown) => ({
  updateTimeline: mockUpdateTimeline,
}));
const mockRequireOptionalNativeModule = jest.fn((_name: string): unknown => ({}));

jest.mock('expo-widgets', () => ({ createWidget: mockCreateWidget }), { virtual: true });

// 10-sdk-58-ios-27 FR6: bridge.ts takes requireOptionalNativeModule from 'expo', which re-exports
// it (expo/build/Expo.d.ts). expo-modules-core is only a transitive dependency of this app.
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockRequireOptionalNativeModule(name),
}));

// jest-expo's babel caller is platform "web", so babel-preset-expo rewrites the
// `Platform` import from react-native to react-native-web's export. Mock both.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
jest.mock('react-native-web/dist/exports/Platform', () => ({
  __esModule: true,
  default: { OS: 'ios' },
}));

type TimelineEntry = { date: Date; props: Record<string, unknown> };

const mockStorage = AsyncStorage as unknown as {
  _reset: () => void;
  getItem: jest.Mock;
  setItem: jest.Mock;
};

function makeHoursData(): HoursData {
  const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return {
    total: 32.5,
    average: 6.5,
    today: 6.2,
    daily: [{ date: '2026-03-10', hours: 6.2, isToday: true }],
    weeklyEarnings: 1300,
    todayEarnings: 248,
    hoursRemaining: 7.5,
    overtimeHours: 0,
    timeRemaining: deadline.getTime() - Date.now(),
    deadline,
  };
}

function makeConfig(overrides: Partial<CrossoverConfig> = {}): CrossoverConfig {
  return {
    userId: '2362707',
    fullName: 'Test Manager',
    managerId: '2372227',
    primaryTeamId: '4584',
    teams: [],
    hourlyRate: 40,
    weeklyLimit: 40,
    useQA: false,
    isManager: true,
    assignmentId: '79996',
    lastRoleCheck: '2026-03-10T00:00:00.000Z',
    debugMode: false,
    setupComplete: true,
    setupDate: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeApproval(): ManualApprovalItem {
  return {
    id: 'mt-1',
    category: 'MANUAL',
    userId: 1,
    fullName: 'Direct Report Name',
    durationMinutes: 150,
    hours: '2.5',
    description: 'Fixing the build',
    startDateTime: '2026-03-10T09:00:00Z',
    type: 'WEB',
    timecardIds: [1],
    weekStartDate: '2026-03-09',
  } as unknown as ManualApprovalItem;
}

function makeRequest(): ManualRequestEntry {
  return {
    id: 'req-1',
    date: '2026-03-10',
    durationMinutes: 90,
    memo: 'Private memo text',
    status: 'PENDING',
  } as unknown as ManualRequestEntry;
}

function lastTimeline(): TimelineEntry[] {
  const calls = mockUpdateTimeline.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as TimelineEntry[];
}

beforeEach(() => {
  mockStorage._reset();
  mockUpdateTimeline.mockReset();
  mockCreateWidget.mockClear();
  mockRequireOptionalNativeModule.mockReset();
  mockRequireOptionalNativeModule.mockImplementation(() => ({}));
});

describe('buildSignedOutWidgetData', () => {
  it('has the same keys as a real snapshot, so the layout gets every prop it reads', async () => {
    await updateWidgetData(makeHoursData(), null, 0, makeConfig(), [makeApproval() as ApprovalItem]);
    const real = lastTimeline()[0].props;
    expect(Object.keys(buildSignedOutWidgetData()).sort()).toEqual(Object.keys(real).sort());
  });

  it('carries no hours, earnings, deadline, names or memos', () => {
    const data = buildSignedOutWidgetData(1234);
    expect(data).toMatchObject({
      hoursDisplay: '0.0h',
      earnings: '$0',
      earningsRaw: 0,
      deadline: 0,
      urgency: 'none',
      pendingCount: 0,
      isManager: false,
      cachedAt: 1234,
      daily: [],
      approvalItems: [],
      myRequests: [],
      actionBg: '',
      paceBadge: 'none',
    });
  });
});

describe('clearWidgetData (iOS)', () => {
  it('replaces a manager timeline with one signed-out entry', async () => {
    await updateWidgetData(makeHoursData(), null, 1, makeConfig(), [makeApproval() as ApprovalItem]);
    expect(JSON.stringify(lastTimeline())).toContain('Direct Report Name');

    await clearWidgetData();

    expect(mockCreateWidget).toHaveBeenLastCalledWith('HourglassWidget', expect.any(String), expect.any(Object));
    const entries = lastTimeline();
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBeInstanceOf(Date);
    expect(entries[0].props).toEqual(buildSignedOutWidgetData(entries[0].props.cachedAt as number));
    expect(JSON.stringify(entries)).not.toContain('Direct Report Name');
  });

  it('leaves no contributor memo in the timeline', async () => {
    await updateWidgetData(
      makeHoursData(),
      null,
      0,
      makeConfig({ isManager: false }),
      [],
      [makeRequest()],
    );
    expect(JSON.stringify(lastTimeline())).toContain('Private memo');
    await clearWidgetData();
    expect(JSON.stringify(lastTimeline())).not.toContain('Private memo');
  });

  it('removes the widget_data AsyncStorage key', async () => {
    await updateWidgetData(makeHoursData(), null, 0, makeConfig());
    expect(await AsyncStorage.getItem('widget_data')).not.toBeNull();
    await clearWidgetData();
    expect(await AsyncStorage.getItem('widget_data')).toBeNull();
  });

  it('an updateWidgetData call in flight at sign-out does not restore the old data', async () => {
    let releaseWrite!: () => void;
    mockStorage.setItem.mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseWrite = resolve; }),
    );

    const pending = updateWidgetData(makeHoursData(), null, 1, makeConfig(), [makeApproval() as ApprovalItem]);
    await clearWidgetData();
    releaseWrite();
    await pending;

    expect(mockUpdateTimeline).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(lastTimeline())).not.toContain('Direct Report Name');
    expect(await AsyncStorage.getItem('widget_data')).toBeNull();
  });

  it('updates normally again after a later sign-in', async () => {
    await clearWidgetData();
    await updateWidgetData(makeHoursData(), null, 0, makeConfig());
    // 96 fifteen-minute entries, then the hourly run out to the deadline (final review 2026-10-21).
    expect(lastTimeline().length).toBeGreaterThan(96);
    expect(lastTimeline()[0].props.hoursDisplay).toBe('32.5h');
  });

  it('never throws when updateTimeline throws', async () => {
    mockUpdateTimeline.mockImplementationOnce(() => {
      throw new Error('UpdatedTimelineWithoutLayout');
    });
    await expect(clearWidgetData()).resolves.toBeUndefined();
  });

  it('skips the native write when the ExpoWidgets module is not compiled in', async () => {
    mockRequireOptionalNativeModule.mockImplementation(() => null);
    await expect(clearWidgetData()).resolves.toBeUndefined();
    expect(mockCreateWidget).not.toHaveBeenCalled();
    expect(mockUpdateTimeline).not.toHaveBeenCalled();
  });
});

// 10-sdk-58-ios-27 FR6 (e): expo-widgets 58 stores createWidget's third argument as the widget's
// initial props, which placeholder() and a timeline-less gallery snapshot render. Without it they
// get `undefined` props. Both call sites pass the signed-out snapshot: no user data, every key.
describe('createWidget initialProps (expo-widgets 58)', () => {
  function lastCreateWidgetCall(): unknown[] {
    const calls = mockCreateWidget.mock.calls as unknown[][];
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1];
  }

  it.each([
    ['updateWidgetData', () => updateWidgetData(makeHoursData(), null, 1, makeConfig(), [makeApproval() as ApprovalItem])],
    ['clearWidgetData', () => clearWidgetData()],
  ])('%s passes 3 arguments, the third being the signed-out snapshot', async (_name, run) => {
    const before = Date.now();
    await run();
    const args = lastCreateWidgetCall();
    expect(args).toHaveLength(3);
    const [name, layout, initialProps] = args as [string, string, ReturnType<typeof buildSignedOutWidgetData>];
    expect(name).toBe('HourglassWidget');
    expect(typeof layout).toBe('string');
    expect(initialProps.cachedAt).toBeGreaterThanOrEqual(before);
    expect(initialProps).toEqual(buildSignedOutWidgetData(initialProps.cachedAt));
  });

  it('the initial props carry none of the signed-in user\'s data', async () => {
    await updateWidgetData(makeHoursData(), null, 1, makeConfig(), [makeApproval() as ApprovalItem]);
    const initialProps = JSON.stringify(lastCreateWidgetCall()[2]);
    expect(JSON.stringify(lastTimeline())).toContain('Direct Report Name');
    expect(initialProps).not.toContain('Direct Report Name');
    expect(initialProps).not.toContain('32.5');
  });
});

// Final review 2026-10-21: expo-widgets 58's timeline policy is `.atEnd` and build 19 has no
// 15-minute reload, so the stored timeline itself must reach the deadline. Otherwise, more than
// 24 h after the last app open, WidgetKit keeps showing the last entry and its frozen countdown.
describe('updateWidgetData timeline reaches the deadline (iOS)', () => {
  const MIN = 60 * 1000;

  it('keeps 96 fifteen-minute entries, then ends with an expired entry 1 s after a deadline 3 days out', async () => {
    const hours = makeHoursData();
    const deadline = hours.deadline.getTime();
    const before = Date.now();
    await updateWidgetData(hours, null, 2, makeConfig(), [makeApproval() as ApprovalItem]);
    const entries = lastTimeline();

    expect(entries.length).toBeGreaterThan(96);
    expect(entries[0].date.getTime()).toBeGreaterThanOrEqual(before);
    for (let i = 1; i < 96; i++) {
      expect(entries[i].date.getTime() - entries[i - 1].date.getTime()).toBe(15 * MIN);
    }
    const last = entries[entries.length - 1];
    expect(last.date.getTime()).toBe(deadline + 1000);
    expect(last.props.urgency).toBe('expired');
    expect(entries.every((e) => e.date.getTime() <= deadline + 1000)).toBe(true);
  });

  it('a full-week manager timeline stays small enough for App Group UserDefaults (< 512 KB)', async () => {
    const hours = { ...makeHoursData(), deadline: new Date(Date.now() + 7 * 24 * 60 * MIN) };
    const approvals = [makeApproval(), makeApproval(), makeApproval()] as ApprovalItem[];
    await updateWidgetData(hours, null, 3, makeConfig(), approvals);
    const entries = lastTimeline();
    expect(entries.length).toBe(96 + (7 * 24 - 24) + 1);
    const bytes = JSON.stringify(entries.map((e) => ({ timestamp: e.date.getTime(), props: e.props }))).length;
    expect(bytes).toBeLessThan(512 * 1024);
  });
});
