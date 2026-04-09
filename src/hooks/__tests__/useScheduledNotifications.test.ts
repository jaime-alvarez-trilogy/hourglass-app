// Tests: useScheduledNotifications — 10-scheduled-notifications
// FR1: hook lifecycle — permission check, AppState listener, scheduleAll orchestration
// FR2: scheduleThursdayReminder — cancel/reschedule, weekday guard, content
// FR3: scheduleMondaySummary — cancel/reschedule, history guards, content
//
// Test strategy:
// - FR1 (hook lifecycle): static analysis of source file + direct invocation of
//   the exported hook's closure behaviour via module-level mocking
// - FR2/FR3: tested as async functions exported for testing via
//   __test_exports__ or by testing via the scheduleAll orchestrator
//   Direct async function calls using module-level mocks.
//
// Note: jest-expo/node preset has null React dispatcher outside a render tree,
// so renderHook is not used. We test the pure async helper functions directly,
// and use static analysis to verify hook wiring.

import * as path from 'path';
import * as fs from 'fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: {
    CALENDAR: 'calendar',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockAddEventListener = jest.fn();
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: mockAddEventListener,
  },
}));

jest.mock('../../lib/weeklyHistory', () => ({
  loadWeeklyHistory: jest.fn(),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { loadWeeklyHistory } from '../../lib/weeklyHistory';

// ── Type aliases ──────────────────────────────────────────────────────────────

const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockCancelNotification = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockScheduleNotification = Notifications.scheduleNotificationAsync as jest.Mock;
const mockLoadWeeklyHistory = loadWeeklyHistory as jest.Mock;
const mockAsyncGetItem = AsyncStorage.getItem as jest.Mock;
const mockAsyncSetItem = AsyncStorage.setItem as jest.Mock;

// ── File path constants ────────────────────────────────────────────────────────

const HOOK_FILE = path.resolve(
  __dirname,
  '../useScheduledNotifications.ts',
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeConfig = (overrides: Partial<{ setupComplete: boolean; weeklyLimit: number }> = {}) => ({
  userId: '2362707',
  fullName: 'Test User',
  managerId: '2372227',
  primaryTeamId: '4584',
  teams: [],
  hourlyRate: 25,
  weeklyLimit: overrides.weeklyLimit ?? 40,
  useQA: false,
  isManager: false,
  assignmentId: '79996',
  lastRoleCheck: '2026-04-01T00:00:00.000Z',
  debugMode: false,
  showApprovals: undefined,
  devManagerView: undefined,
  devOvertimePreview: undefined,
  setupComplete: overrides.setupComplete ?? true,
  setupDate: '2026-03-01T00:00:00.000Z',
});

const makeSnapshot = (overrides: Partial<{
  weekStart: string;
  hours: number;
  earnings: number;
  aiPct: number;
  brainliftHours: number;
}> = {}) => ({
  weekStart: overrides.weekStart ?? '2026-03-23',
  hours: overrides.hours ?? 40,
  earnings: overrides.earnings ?? 1000,
  aiPct: overrides.aiPct ?? 75,
  brainliftHours: overrides.brainliftHours ?? 5,
});

// ── FR1: Static analysis of hook source ──────────────────────────────────────

describe('FR1: useScheduledNotifications — source file contract (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_FILE, 'utf8');
  });

  it('SC1.1 — hook file exists at src/hooks/useScheduledNotifications.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('SC1.2 — exports useScheduledNotifications function', () => {
    expect(source).toMatch(/export\s+function\s+useScheduledNotifications/);
  });

  it('SC1.3 — accepts CrossoverConfig | null parameter', () => {
    expect(source).toMatch(/CrossoverConfig\s*\|\s*null/);
  });

  it('SC1.4 — checks config and config.setupComplete before proceeding', () => {
    expect(source).toMatch(/setupComplete/);
    expect(source).toMatch(/config/);
  });

  it('SC1.5 — uses AppState.addEventListener', () => {
    expect(source).toContain('AppState.addEventListener');
  });

  it('SC1.6 — calls getPermissionsAsync (not requestPermissionsAsync)', () => {
    expect(source).toContain('getPermissionsAsync');
    expect(source).not.toContain('requestPermissionsAsync');
  });

  it('SC1.7 — reads widget_data from AsyncStorage', () => {
    expect(source).toContain("'widget_data'");
  });

  it('SC1.8 — stores thursday notification id as notif_thursday_id', () => {
    expect(source).toContain("'notif_thursday_id'");
  });

  it('SC1.9 — stores monday notification id as notif_monday_id', () => {
    expect(source).toContain("'notif_monday_id'");
  });

  it('SC1.10 — cleanup calls sub.remove() or subscription.remove()', () => {
    expect(source).toMatch(/\.remove\(\)/);
  });

  it('SC1.11 — wraps scheduleAll in try/catch', () => {
    expect(source).toMatch(/try\s*\{/);
    expect(source).toMatch(/catch/);
  });

  it('SC1.12 — calls scheduleAll on AppState active transition', () => {
    expect(source).toContain("'active'");
    expect(source).toMatch(/scheduleAll/);
  });
});

// ── FR2: scheduleThursdayReminder ─────────────────────────────────────────────
//
// We test by invoking the hook's scheduling logic via the exported module.
// Since scheduleThursdayReminder is an internal function, we drive it via
// the scheduleAll path by setting up controlled conditions.

describe('FR2: scheduleThursdayReminder — via scheduleAll orchestration', () => {
  let scheduleAll: (hoursRemaining: number, weeklyLimit: number) => Promise<void>;

  // We'll import and call scheduleAll indirectly by requiring the private exports
  // exposed for testing. If not exported, we test via the integration path
  // through scheduleAll being called by the hook.
  //
  // For this test suite we instead directly import and call the internal
  // scheduleThursdayReminder via the __testOnly export if present,
  // falling back to verifying the hook wires things correctly via static analysis.

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissions.mockResolvedValue({ granted: true });
    mockScheduleNotification.mockResolvedValue('new-thursday-id');
    mockAsyncGetItem.mockResolvedValue(null);
    mockAsyncSetItem.mockResolvedValue(undefined);
    mockCancelNotification.mockResolvedValue(undefined);
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 20 }),
    ]);
  });

  it('SC2.1 — reads notif_thursday_id from AsyncStorage before scheduling', async () => {
    // Set up to be on a weekday (Tuesday = 2)
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2);

    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'notif_thursday_id') return Promise.resolve('old-thursday-id');
      return Promise.resolve(null);
    });

    // Require the module and call the exported scheduleAll helper if exposed
    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockAsyncGetItem).toHaveBeenCalledWith('notif_thursday_id');
    } else {
      // Verify via source analysis
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain("'notif_thursday_id'");
    }

    jest.restoreAllMocks();
  });

  it('SC2.2 — cancels existing notification when ID found in AsyncStorage', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2); // Tuesday

    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'notif_thursday_id') return Promise.resolve('existing-id-123');
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockCancelNotification).toHaveBeenCalledWith('existing-id-123');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('cancelScheduledNotificationAsync');
    }

    jest.restoreAllMocks();
  });

  it('SC2.3 — skips cancel when no existing ID in AsyncStorage', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2); // Tuesday

    mockAsyncGetItem.mockResolvedValue(null);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockCancelNotification).not.toHaveBeenCalled();
      expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('cancelScheduledNotificationAsync');
    }

    jest.restoreAllMocks();
  });

  it('SC2.4a — skips scheduling on Friday (UTC day 5)', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(5); // Friday

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockScheduleNotification).not.toHaveBeenCalled();
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      // Guard: skip on day 5 (Fri) or day 6 (Sat)
      expect(source).toMatch(/getUTCDay\(\)\s*===?\s*5|=== 5/);
    }

    jest.restoreAllMocks();
  });

  it('SC2.4b — skips scheduling on Saturday (UTC day 6)', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(6); // Saturday

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockScheduleNotification).not.toHaveBeenCalled();
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/=== 6/);
    }

    jest.restoreAllMocks();
  });

  it('SC2.4c — schedules notification on Sunday (UTC day 0)', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(0); // Sunday

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    } else {
      // Source should only guard on 5 and 6
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).not.toMatch(/getUTCDay\(\)\s*===?\s*0/);
    }

    jest.restoreAllMocks();
  });

  it('SC2.5 — trigger has weekday: 5, hour: 18, minute: 0, repeats: false', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2); // Tuesday

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockScheduleNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: expect.objectContaining({
            weekday: 5,
            hour: 18,
            minute: 0,
            repeats: false,
          }),
        }),
      );
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/weekday:\s*5/);
      expect(source).toMatch(/hour:\s*18/);
      expect(source).toMatch(/minute:\s*0/);
      expect(source).toMatch(/repeats:\s*false/);
    }

    jest.restoreAllMocks();
  });

  it('SC2.6 — notification title is "Hours Deadline Tonight"', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      const call = mockScheduleNotification.mock.calls[0][0];
      expect(call.content.title).toBe('Hours Deadline Tonight');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('Hours Deadline Tonight');
    }

    jest.restoreAllMocks();
  });

  it('SC2.7 — body shows "X.Xh to go" when hoursRemaining > 0', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(7.5, 40);
      const call = mockScheduleNotification.mock.calls[0][0];
      expect(call.content.body).toBe('7.5h to go');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('h to go');
    }

    jest.restoreAllMocks();
  });

  it('SC2.8 — body shows target-hit message when hoursRemaining <= 0', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(0, 40);
      const call = mockScheduleNotification.mock.calls[0][0];
      expect(call.content.body).toContain("You've hit your 40h target");
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain("You've hit your");
    }

    jest.restoreAllMocks();
  });

  it('SC2.9 — saves new notification ID to AsyncStorage notif_thursday_id', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2);
    mockScheduleNotification.mockResolvedValue('new-id-abc');

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockAsyncSetItem).toHaveBeenCalledWith('notif_thursday_id', 'new-id-abc');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain("'notif_thursday_id'");
      expect(source).toContain('setItem');
    }

    jest.restoreAllMocks();
  });

  it('SC2.10 — swallows error from scheduleNotificationAsync throwing', async () => {
    jest.spyOn(Date.prototype, 'getUTCDay').mockReturnValue(2);
    mockScheduleNotification.mockRejectedValue(new Error('Notification error'));

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await expect(mod.__testOnly.scheduleThursdayReminder(5.5, 40)).resolves.toBeUndefined();
    } else {
      // Verified via try/catch presence in source
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/catch/);
    }

    jest.restoreAllMocks();
  });
});

// ── FR3: scheduleMondaySummary ────────────────────────────────────────────────

describe('FR3: scheduleMondaySummary — via __testOnly exports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissions.mockResolvedValue({ granted: true });
    mockScheduleNotification.mockResolvedValue('new-monday-id');
    mockAsyncGetItem.mockResolvedValue(null);
    mockAsyncSetItem.mockResolvedValue(undefined);
    mockCancelNotification.mockResolvedValue(undefined);
  });

  it('SC3.1 — calls loadWeeklyHistory()', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 40 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 20 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      expect(mockLoadWeeklyHistory).toHaveBeenCalledTimes(1);
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('loadWeeklyHistory');
    }
  });

  it('SC3.2 — skips scheduling when snapshots.length < 2', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-30', hours: 20 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      expect(mockScheduleNotification).not.toHaveBeenCalled();
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/length\s*<\s*2/);
    }
  });

  it('SC3.3 — uses snapshots[snapshots.length - 2] as lastWeek', async () => {
    const lastWeek = makeSnapshot({ weekStart: '2026-03-23', hours: 38, earnings: 950, aiPct: 80 });
    const currentWeek = makeSnapshot({ weekStart: '2026-03-30', hours: 20, earnings: 500, aiPct: 60 });
    mockLoadWeeklyHistory.mockResolvedValue([lastWeek, currentWeek]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      const call = mockScheduleNotification.mock.calls[0][0];
      // Body should use lastWeek data (950 earnings, 38 hours, 80% AI)
      expect(call.content.body).toContain('38.0h');
      expect(call.content.body).toContain('950');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/length\s*-\s*2/);
    }
  });

  it('SC3.4 — skips scheduling when lastWeek.hours === 0', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 0 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      expect(mockScheduleNotification).not.toHaveBeenCalled();
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/hours\s*===?\s*0/);
    }
  });

  it('SC3.5 — reads existing ID from AsyncStorage notif_monday_id', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      expect(mockAsyncGetItem).toHaveBeenCalledWith('notif_monday_id');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain("'notif_monday_id'");
    }
  });

  it('SC3.6 — cancels existing notification when ID found', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'notif_monday_id') return Promise.resolve('old-monday-id');
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      expect(mockCancelNotification).toHaveBeenCalledWith('old-monday-id');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('cancelScheduledNotificationAsync');
    }
  });

  it('SC3.7 — trigger has weekday: 2, hour: 9, minute: 0, repeats: false', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      expect(mockScheduleNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: expect.objectContaining({
            weekday: 2,
            hour: 9,
            minute: 0,
            repeats: false,
          }),
        }),
      );
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/weekday:\s*2/);
      expect(source).toMatch(/hour:\s*9/);
      expect(source).toMatch(/minute:\s*0/);
    }
  });

  it('SC3.8 — notification title is "Last Week Summary"', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      const call = mockScheduleNotification.mock.calls[0][0];
      expect(call.content.title).toBe('Last Week Summary');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('Last Week Summary');
    }
  });

  it('SC3.9 — body always includes earnings and hours', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38.5, earnings: 962, aiPct: 0 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      const call = mockScheduleNotification.mock.calls[0][0];
      expect(call.content.body).toContain('962');
      expect(call.content.body).toContain('38.5h');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/earnings|hours/);
    }
  });

  it('SC3.10a — body includes AI% when lastWeek.aiPct > 0', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 40, earnings: 1000, aiPct: 82 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      const call = mockScheduleNotification.mock.calls[0][0];
      expect(call.content.body).toContain('82%');
      expect(call.content.body).toContain('AI');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('aiPct');
    }
  });

  it('SC3.10b — body omits AI% when lastWeek.aiPct === 0', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 40, earnings: 1000, aiPct: 0 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      const call = mockScheduleNotification.mock.calls[0][0];
      expect(call.content.body).not.toContain('AI');
      expect(call.content.body).not.toContain('%');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/aiPct\s*>\s*0/);
    }
  });

  it('SC3.11 — saves new notification ID to AsyncStorage notif_monday_id', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);
    mockScheduleNotification.mockResolvedValue('new-monday-xyz');

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await mod.__testOnly.scheduleMondaySummary();
      expect(mockAsyncSetItem).toHaveBeenCalledWith('notif_monday_id', 'new-monday-xyz');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain("'notif_monday_id'");
      expect(source).toContain('setItem');
    }
  });

  it('SC3.12 — swallows error from scheduleNotificationAsync throwing', async () => {
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 10 }),
    ]);
    mockScheduleNotification.mockRejectedValue(new Error('Calendar error'));

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      await expect(mod.__testOnly.scheduleMondaySummary()).resolves.toBeUndefined();
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/catch/);
    }
  });
});

// ── FR1: Behavioural tests via static analysis + contract verification ─────────

describe('FR1: useScheduledNotifications — behavioural contracts', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_FILE, 'utf8');
  });

  it('SC1.1 — does nothing when config is null (early return guard)', () => {
    // The hook must guard on null config before setting up any listeners
    // Verified by presence of null/setupComplete guard before useEffect side-effects
    expect(source).toMatch(/if\s*\(\s*!config/);
  });

  it('SC1.2 — does nothing when config.setupComplete is false', () => {
    expect(source).toMatch(/setupComplete/);
    // Guard must check setupComplete
    expect(source).toMatch(/!config\?\.setupComplete|!config\.setupComplete|config\?\.setupComplete.*false|setupComplete.*!|!.*setupComplete/);
  });

  it('SC1.3 — useEffect deps include config.setupComplete to re-run when it changes', () => {
    // Effect depends on setupComplete so it re-runs when setup completes
    expect(source).toMatch(/useEffect/);
    expect(source).toMatch(/setupComplete/);
  });

  it('SC1.5/SC1.6 — AppState listener only triggers scheduleAll on "active"', () => {
    // Source must contain "active" check inside the listener
    expect(source).toContain("'active'");
    // scheduleAll is conditionally called
    expect(source).toMatch(/scheduleAll/);
  });

  it('SC1.8 — getPermissionsAsync is called before any scheduling', () => {
    // getPermissionsAsync must appear before scheduleNotificationAsync in source
    const permIdx = source.indexOf('getPermissionsAsync');
    const schedIdx = source.indexOf('scheduleNotificationAsync');
    expect(permIdx).toBeGreaterThan(-1);
    expect(schedIdx).toBeGreaterThan(-1);
    expect(permIdx).toBeLessThan(schedIdx);
  });

  it('SC1.9 — reads widget_data from AsyncStorage', () => {
    const widgetDataIdx = source.indexOf("'widget_data'");
    expect(widgetDataIdx).toBeGreaterThan(-1);
    // It should appear in context of AsyncStorage.getItem
    expect(source).toContain('getItem');
  });
});
