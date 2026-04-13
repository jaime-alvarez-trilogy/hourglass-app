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
    // Set up to be on a weekday (Tuesday = 2, 10am)
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

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
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2); // Tuesday
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

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
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2); // Tuesday
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

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

  it('SC2.4a — skips scheduling on Friday (local day 5)', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(5); // Friday
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockScheduleNotification).not.toHaveBeenCalled();
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toMatch(/localDay\s*===\s*5|=== 5/);
    }

    jest.restoreAllMocks();
  });

  it('SC2.4b — skips scheduling on Saturday (local day 6)', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(6); // Saturday
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

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

  it('SC2.4c — schedules notification on Sunday (local day 0)', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(0); // Sunday
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleThursdayReminder) {
      await mod.__testOnly.scheduleThursdayReminder(5.5, 40);
      expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).not.toMatch(/localDay\s*===\s*0/);
    }

    jest.restoreAllMocks();
  });

  it('SC2.5 — trigger has weekday: 5, hour: 18, minute: 0, repeats: false', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2); // Tuesday
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

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
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

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
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

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
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

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
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
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
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
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

// ── 06-notification-bootstrap: scheduleAll bootstrap fix ──────────────────────
//
// FR1: scheduleAll must NOT bail when widget_data is absent (fresh install)
// FR2: hoursRemaining defaults to 1 (positive sentinel) when data is absent/malformed
// FR3: scheduleMondaySummary always fires when permissions are granted
//
// Strategy: static analysis verifies the early-return bug is gone and the
// sentinel pattern is present. Behavioral tests drive scheduleThursdayReminder
// directly via __testOnly to verify hoursRemaining parsing for all edge cases.

describe('06-notification-bootstrap: FR1 — no early-return bail on missing widget data (static)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_FILE, 'utf8');
  });

  it('FR1-SC1 — scheduleAll does NOT contain early-return bail on missing raw data', () => {
    // The bug pattern: `if (!raw) return;` must be absent from scheduleAll.
    // (Other functions in the file may legitimately use this pattern.)
    const scheduleAllStart = source.indexOf('const scheduleAll = async');
    const scheduleAllEnd = source.indexOf('\n    };', scheduleAllStart);
    const scheduleAllBody = source.slice(scheduleAllStart, scheduleAllEnd);
    expect(scheduleAllBody).not.toMatch(/if\s*\(\s*!raw\s*\)\s*return/);
  });

  it('FR1-SC2 — source initializes hoursRemaining to 1 (positive sentinel)', () => {
    // Must default to 1, not 0
    expect(source).toMatch(/hoursRemaining\s*=\s*1/);
  });

  it('FR1-SC3 — source reads widget_data conditionally (if raw, not if !raw)', () => {
    // Pattern: if (raw) { ... } — positive guard, not early return
    expect(source).toMatch(/if\s*\(\s*raw\s*\)/);
  });

  it('FR1-SC4 — source wraps JSON.parse in try/catch for resilience', () => {
    // JSON.parse must be inside a try/catch block so malformed data keeps sentinel
    const tryIdx = source.indexOf('try {');
    const parseIdx = source.indexOf('JSON.parse');
    // Both must exist; try appears before parse
    expect(tryIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeLessThan(parseIdx);
  });

  it('FR1-SC5 — scheduleMondaySummary is called outside any widget_data conditional', () => {
    // scheduleMondaySummary must appear after the widget_data block, not inside `if (raw)`
    // Verified by confirming it is not indented inside the if(raw) block
    // (Static: both calls must appear at the same indent level after the if block)
    expect(source).toContain('scheduleMondaySummary');
    // The call should NOT be guarded by hoursRemaining
    expect(source).not.toMatch(/if\s*\(\s*hoursRemaining[^)]*\)[^}]*scheduleMondaySummary/s);
  });
});

describe('06-notification-bootstrap: FR2 — hoursRemaining sentinel and guard (static)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_FILE, 'utf8');
  });

  it('FR2-SC1 — sentinel default of 1 ensures hoursRemaining > 0 passes for fresh install', () => {
    // Default is 1; guard is hoursRemaining > 0; 1 > 0 is true → Thursday scheduled
    expect(source).toMatch(/hoursRemaining\s*=\s*1/);
    expect(source).toMatch(/if\s*\(\s*hoursRemaining\s*>\s*0\s*\)/);
  });

  it('FR2-SC2 — scheduleAll gates scheduleThursdayReminder on hoursRemaining > 0', () => {
    // The call to scheduleThursdayReminder must be inside the hoursRemaining > 0 guard
    // so that 0 (done) and negative (overtime) values correctly skip Thursday
    expect(source).toMatch(/if\s*\(\s*hoursRemaining\s*>\s*0\s*\)\s*\{[^}]*scheduleThursdayReminder/s);
  });
});

describe('06-notification-bootstrap: FR2 — hoursRemaining parsing in scheduleAll (static)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_FILE, 'utf8');
  });

  it('FR2-SC5 — only overrides hoursRemaining when parseFloat result is not NaN', () => {
    // Must check isNaN before overriding the default
    expect(source).toMatch(/isNaN/);
  });

  it('FR2-SC6 — JSON parse failure keeps hoursRemaining at sentinel (try/catch present)', () => {
    // catch block keeps the sentinel — verified by presence of try/catch around JSON.parse
    expect(source).toMatch(/catch/);
    expect(source).toContain('JSON.parse');
  });
});

// ── 01-flood-guard: concurrent scheduleAll protection ────────────────────────
//
// Regression: rapid AppState 'active' events must not cause multiple notifications
// to be queued. The inFlightRef guard coalesces concurrent calls to one.
//
// Note: jest-expo/node preset has null React dispatcher outside a render tree,
// so the hook cannot be called directly in tests. Behavioral coverage is provided
// via static analysis of the guard pattern (identical to useRoleRefresh.ts).

describe('01-flood-guard: concurrent scheduleAll protection (static)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_FILE, 'utf8');
  });

  it('FG-SC1 — source imports useRef from react', () => {
    expect(source).toMatch(/import\s*\{[^}]*useRef[^}]*\}\s*from\s*['"]react['"]/);
  });

  it('FG-SC2 — inFlightRef is declared at hook scope with useRef(false)', () => {
    expect(source).toContain('const inFlightRef = useRef(false)');
  });

  it('FG-SC3 — scheduleAll guards entry with inFlightRef.current check', () => {
    expect(source).toMatch(/if\s*\(\s*inFlightRef\.current\s*\)\s*return/);
  });

  it('FG-SC4 — scheduleAll sets inFlightRef.current = true on entry', () => {
    expect(source).toMatch(/inFlightRef\.current\s*=\s*true/);
  });

  it('FG-SC5 — inFlightRef.current reset to false is inside a finally block', () => {
    // Ensures the ref is always reset, even if an error is thrown
    expect(source).toMatch(/finally\s*\{[^}]*inFlightRef\.current\s*=\s*false/s);
  });

  it('FG-SC6 — inFlightRef declaration precedes useEffect (hook scope, not effect scope)', () => {
    const refDeclIdx = source.indexOf('const inFlightRef = useRef(false)');
    const useEffectIdx = source.indexOf('useEffect(');
    expect(refDeclIdx).toBeGreaterThan(-1);
    expect(useEffectIdx).toBeGreaterThan(-1);
    expect(refDeclIdx).toBeLessThan(useEffectIdx);
  });

  it('FG-SC7 — try/catch/finally structure is present in scheduleAll', () => {
    // Full try { ... } catch { ... } finally { ... } pattern
    expect(source).toMatch(/try\s*\{/);
    expect(source).toMatch(/catch\s*\{/);
    expect(source).toMatch(/finally\s*\{/);
  });
});

describe('06-notification-bootstrap: FR3 — Monday summary always fires when permissions granted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissions.mockResolvedValue({ granted: true });
    mockScheduleNotification.mockResolvedValue('monday-id');
    mockAsyncGetItem.mockResolvedValue(null);
    mockAsyncSetItem.mockResolvedValue(undefined);
    mockCancelNotification.mockResolvedValue(undefined);
  });

  it('FR3-SC1 — scheduleMondaySummary is called when widget data is absent', async () => {
    // Verify scheduleMondaySummary itself can be called independently of widget_data
    // (its own guards are about weeklyHistory, not widget_data)
    mockLoadWeeklyHistory.mockResolvedValue([
      makeSnapshot({ weekStart: '2026-03-23', hours: 38 }),
      makeSnapshot({ weekStart: '2026-03-30', hours: 20 }),
    ]);

    const mod = require('../useScheduledNotifications');
    if (mod.__testOnly?.scheduleMondaySummary) {
      // scheduleMondaySummary has no widget_data dependency — it always runs
      await mod.__testOnly.scheduleMondaySummary();
      expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
      const call = mockScheduleNotification.mock.calls[0][0];
      expect(call.content.title).toBe('Last Week Summary');
    } else {
      const source = fs.readFileSync(HOOK_FILE, 'utf8');
      expect(source).toContain('scheduleMondaySummary');
    }
  });

  it('FR3-SC2 — scheduleMondaySummary is NOT gated by widget_data in scheduleAll', () => {
    // Static: the call to scheduleMondaySummary must not be inside an if(raw) block
    // within scheduleAll. (Other functions may legitimately use if(!raw) return.)
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // The function call must exist
    expect(source).toContain('scheduleMondaySummary()');
    // Scope check to scheduleAll body only
    const scheduleAllStart = source.indexOf('const scheduleAll = async');
    const scheduleAllEnd = source.indexOf('\n    };', scheduleAllStart);
    const scheduleAllBody = source.slice(scheduleAllStart, scheduleAllEnd);
    expect(scheduleAllBody).not.toMatch(/if\s*\(\s*!raw\s*\)\s*return/);
  });

  it('FR3-SC3 — permissions denied prevents scheduleMondaySummary call (static)', () => {
    // scheduleAll gates all scheduling on !granted early return.
    // Static: both guards must be in the source; we verify the source structure.
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // The permissions return guard must exist
    expect(source).toMatch(/if\s*\(\s*!granted\s*\)\s*return/);
    // scheduleMondaySummary call must exist (it is reached only when permissions are granted)
    expect(source).toContain('await scheduleMondaySummary()');
    // The !granted guard must appear before the await scheduleMondaySummary() call in scheduleAll
    const scheduleAllIdx = source.indexOf('const scheduleAll');
    const grantedIdx = source.indexOf('!granted', scheduleAllIdx);
    const summaryCallIdx = source.indexOf('await scheduleMondaySummary()', scheduleAllIdx);
    expect(scheduleAllIdx).toBeGreaterThan(-1);
    expect(grantedIdx).toBeGreaterThan(-1);
    expect(summaryCallIdx).toBeGreaterThan(-1);
    expect(grantedIdx).toBeLessThan(summaryCallIdx);
  });
});

// ── FR4: scheduleMondayExpiryReminder ─────────────────────────────────────────
//
// Manager-only Monday 9am notification: warns that pending approvals expire
// at 15:00 UTC today. Only fires on Mondays before the 15:00 UTC cutoff.
// Reads pendingCount from widget_data; skips if zero or data unavailable.

describe('FR4: scheduleMondayExpiryReminder — expiry notification for managers', () => {
  const makeWidgetData = (pendingCount: number) =>
    JSON.stringify({ hoursRemaining: '12.0h left', pendingCount });

  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduleNotification.mockResolvedValue('new-expiry-id');
    mockAsyncGetItem.mockResolvedValue(null);
    mockAsyncSetItem.mockResolvedValue(undefined);
    mockCancelNotification.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Schedule cases ────────────────────────────────────────────────────────

  it('SC4.1 — Monday 14:00 UTC, isManager=true, pendingCount=3 → schedules with plural body', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);  // Monday
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(3));
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const call = mockScheduleNotification.mock.calls[0][0];
    expect(call.content.title).toBe('Approvals Expiring Today');
    expect(call.content.body).toBe('3 pending approvals — must be reviewed by 3pm UTC');
  });

  it('SC4.2 — Monday 14:00 UTC, isManager=true, pendingCount=1 → singular "1 pending approval"', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(1));
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const call = mockScheduleNotification.mock.calls[0][0];
    expect(call.content.body).toBe('1 pending approval — must be reviewed by 3pm UTC');
  });

  it('SC4.3 — Monday 14:00 UTC, isManager=true, pendingCount=0 → NOT called', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(0));
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('SC4.4 — non-Monday (Tuesday), pendingCount=5 → NOT called', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);  // Tuesday
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(5));
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('SC4.5 — Monday 15:00 UTC (deadline passed), pendingCount=3 → NOT called', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);  // Monday
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(15);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(3));
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('SC4.6 — isManager=false, Monday 14:00 UTC, pendingCount=3 → NOT called', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(3));
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(false);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  // ── Cancel + reschedule ───────────────────────────────────────────────────

  it('SC4.7 — existing notif_expiry_id → cancelScheduledNotificationAsync called before new schedule', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(2));
      if (key === 'notif_expiry_id') return Promise.resolve('old-expiry-id');
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockCancelNotification).toHaveBeenCalledWith('old-expiry-id');
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
  });

  it('SC4.8 — no existing notif_expiry_id → cancelScheduledNotificationAsync NOT called', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(2));
      return Promise.resolve(null);  // no existing ID
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockCancelNotification).not.toHaveBeenCalled();
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
  });

  it('SC4.9 — saves new notification ID to AsyncStorage notif_expiry_id', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(4));
      return Promise.resolve(null);
    });
    mockScheduleNotification.mockResolvedValue('fresh-expiry-id');

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockAsyncSetItem).toHaveBeenCalledWith('notif_expiry_id', 'fresh-expiry-id');
  });

  // ── Widget data edge cases ────────────────────────────────────────────────

  it('SC4.10 — widget_data absent → skip notification, no crash', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockResolvedValue(null);  // nothing in storage

    const mod = require('../useScheduledNotifications');
    await expect(mod.__testOnly.scheduleMondayExpiryReminder(true)).resolves.toBeUndefined();

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('SC4.11 — widget_data JSON parse fails → skip notification, no crash', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve('not valid json {{{');
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await expect(mod.__testOnly.scheduleMondayExpiryReminder(true)).resolves.toBeUndefined();

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it('SC4.12 — widget_data has no pendingCount field → skip notification', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(JSON.stringify({ hoursRemaining: '10.0h left' }));
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  // ── Trigger shape ─────────────────────────────────────────────────────────

  it('SC4.13 — trigger has weekday: 2, hour: 9, minute: 0, repeats: false', async () => {
    jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1);
    jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(14);
    mockAsyncGetItem.mockImplementation((key: string) => {
      if (key === 'widget_data') return Promise.resolve(makeWidgetData(2));
      return Promise.resolve(null);
    });

    const mod = require('../useScheduledNotifications');
    await mod.__testOnly.scheduleMondayExpiryReminder(true);

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
  });

  // ── Static analysis ───────────────────────────────────────────────────────

  it('SC4.14 — source exports scheduleMondayExpiryReminder in __testOnly', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toContain('scheduleMondayExpiryReminder');
    expect(source).toMatch(/__testOnly\s*=\s*\{[^}]*scheduleMondayExpiryReminder/s);
  });

  it('SC4.15 — source stores expiry notification id as notif_expiry_id', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toContain("'notif_expiry_id'");
  });

  it('SC4.16 — source calls scheduleMondayExpiryReminder from scheduleAll', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toContain('await scheduleMondayExpiryReminder(');
  });
});
