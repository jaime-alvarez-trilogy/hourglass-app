// FR1 Tests: calculateHours and date utilities
// These tests are written BEFORE the implementation (TDD red phase)
// Import from src/lib/hours which does not exist yet

import {
  applyHoursOverview,
  calculateHours,
  getSundayMidnightGMT,
  getUrgencyLevel,
  formatTimeRemaining,
  getWeekStartDate,
  getThursdayDeadlineGMT,
} from '../../src/lib/hours';
import type { PaymentsResponse, TimesheetResponse } from '../../src/lib/hours';
import { normalizeHoursOverview, type HoursOverview } from '../../src/lib/hoursOverview';
import { HOURS_OVERVIEW_RAW } from '../../src/__fixtures__/hoursOverview';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const HOURLY_RATE = 25;
const WEEKLY_LIMIT = 40;

const makeTimesheet = (overrides = {}) => ({
  totalHours: 20,
  averageHoursPerDay: 4,
  stats: [
    { date: '2026-03-02', hours: 4 },
    { date: '2026-03-03', hours: 4 },
    { date: '2026-03-04', hours: 4 },
    { date: '2026-03-05', hours: 4 },
    { date: '2026-03-06', hours: 4 },
    { date: '2026-03-07', hours: 0 },
    { date: '2026-03-08', hours: 0 },
  ],
  ...overrides,
});

const makePayments = (overrides: Partial<PaymentsResponse> = {}): PaymentsResponse => ({
  paidHours: 20,
  workedHours: 20,
  overtimeHours: 0,
  approvedOvertimeHours: 0,
  manualMinutes: 0,
  amount: 500,
  ...overrides,
});

// ─── calculateHours ───────────────────────────────────────────────────────────

describe('calculateHours', () => {
  beforeEach(() => {
    // Fix time to Wednesday 2026-03-04 12:00:00 UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Displayed hours follow the LOCAL week (the timesheet); payments are the UTC pay week.
  // These used to expect the payments row's hours as the total: that was the UTC figure.

  it('total is the timesheet total (local week), not payments.paidHours (UTC pay week)', () => {
    const ts = makeTimesheet({ totalHours: 10 });
    const pay = makePayments({ paidHours: 33 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(10);
    // Earnings stay on the payments row
    expect(result.weeklyEarnings).toBe(33 * HOURLY_RATE);
  });

  it('total is the timesheet total even when paidHours === 0 and workedHours is set', () => {
    const ts = makeTimesheet({ totalHours: 10 });
    const pay = makePayments({ paidHours: 0, workedHours: 35 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(10);
    // Earnings without paidHours fall back to workedHours, exactly as before
    expect(result.weeklyEarnings).toBe(35 * HOURLY_RATE);
  });

  it('the timesheet total is uncapped: worked overtime shows (live: 42.83 h on a 40 h limit)', () => {
    // Regression guard: the hero was once stuck at exactly the weekly limit. The local
    // timesheet total is uncapped and includes approved manual time.
    const ts = makeTimesheet({ totalHours: 42.83 });
    const pay = makePayments({ paidHours: 40, workedHours: 40 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(42.83);
    expect(result.overtimeHours).toBeCloseTo(2.83, 10);
    expect(result.hoursRemaining).toBe(0);
    expect(result.weeklyEarnings).toBe(40 * HOURLY_RATE);
  });

  it('a lower timesheet total wins over a higher payments row (Monday in the UTC pay week)', () => {
    const ts = makeTimesheet({ totalHours: 4 });
    const pay = makePayments({ paidHours: 0, workedHours: 5.5 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(4);
    expect(result.hoursRemaining).toBe(36);
  });

  it('no timesheet: no local hours; the payments row (UTC pay week) never stands in', () => {
    // Used to show max(paidHours, workedHours) = 45 as the local-week total
    const pay = makePayments({ paidHours: 40, workedHours: 45 });
    const result = calculateHours(null, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(0);
    expect(result.overtimeHours).toBe(0);
    expect(result.hoursRemaining).toBe(WEEKLY_LIMIT);
    // Earnings are payments: still tied to paidHours (unapproved OT is not guaranteed pay)
    expect(result.weeklyEarnings).toBe(40 * HOURLY_RATE);
    // No per-day data without a timesheet
    expect(result.daily).toEqual([]);
    expect(result.today).toBe(0);
    expect(result.todayEarnings).toBe(0);
    expect(result.average).toBe(0);
  });

  it('no timesheet, paidHours === 0: no local hours, earnings from workedHours', () => {
    const pay = makePayments({ paidHours: 0, workedHours: 12 });
    const result = calculateHours(null, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(0);
    expect(result.hoursRemaining).toBe(WEEKLY_LIMIT);
    expect(result.weeklyEarnings).toBe(12 * HOURLY_RATE);
  });

  it('no timesheet, empty payments row → zeros', () => {
    const pay = makePayments({ paidHours: 0, workedHours: 0 });
    const result = calculateHours(null, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(0);
    expect(result.weeklyEarnings).toBe(0);
    expect(result.hoursRemaining).toBe(WEEKLY_LIMIT);
  });

  it('keeps weeklyEarnings tied to paidHours even when workedHours is higher (unapproved OT is not guaranteed pay)', () => {
    const ts = makeTimesheet({ totalHours: 40 });
    const pay = makePayments({ paidHours: 40, workedHours: 45 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.weeklyEarnings).toBe(40 * HOURLY_RATE);
  });

  it('falls back to timesheet.totalHours when both paidHours and workedHours === 0', () => {
    const ts = makeTimesheet({ totalHours: 28 });
    const pay = makePayments({ paidHours: 0, workedHours: 0 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(28);
  });

  it('falls back to timesheet.hourWorked when totalHours absent', () => {
    const ts = { hourWorked: 22, averageHoursPerDay: 4.4, stats: [] };
    const pay = makePayments({ paidHours: 0, workedHours: 0 });
    const result = calculateHours(ts as any, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(22);
  });

  it('defaults total to 0 when both timesheet and payments are null', () => {
    const result = calculateHours(null, null, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(0);
  });

  it('derives weeklyEarnings from total * hourlyRate (mathematically consistent with hero hours)', () => {
    // payments.amount (paidHours × rate) is ignored — weeklyEarnings = workedHours × rate
    // so the earnings card always matches the hero: e.g. 20h shown → $20×rate shown
    const ts = makeTimesheet({ totalHours: 20 });
    const pay = makePayments({ workedHours: 20, amount: 750 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.weeklyEarnings).toBe(20 * HOURLY_RATE); // 20 * 25 = 500
  });

  it('computes todayEarnings = today * hourlyRate', () => {
    // Fake time is 2026-03-04 UTC
    const todayStr = '2026-03-04';
    const ts = makeTimesheet({
      stats: [{ date: todayStr, hours: 6 }],
    });
    const pay = makePayments({ paidHours: 6 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.todayEarnings).toBe(6 * HOURLY_RATE);
  });

  it('computes hoursRemaining = Math.max(0, weeklyLimit - total)', () => {
    const ts = makeTimesheet({ totalHours: 30 });
    const pay = makePayments({ paidHours: 0, workedHours: 0 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.hoursRemaining).toBe(10);
  });

  it('clamps hoursRemaining to 0 when total exceeds weeklyLimit', () => {
    const ts = makeTimesheet({ totalHours: 45 });
    const pay = makePayments({ paidHours: 0, workedHours: 0 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.hoursRemaining).toBe(0);
  });

  it('computes overtimeHours = Math.max(0, total - weeklyLimit)', () => {
    const ts = makeTimesheet({ totalHours: 45 });
    const pay = makePayments({ paidHours: 0, workedHours: 0 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.overtimeHours).toBe(5);
  });

  it('clamps overtimeHours to 0 when total is below weeklyLimit', () => {
    const ts = makeTimesheet({ totalHours: 30 });
    const pay = makePayments({ paidHours: 0, workedHours: 0 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.overtimeHours).toBe(0);
  });

  it('finds today hours from stats array by YYYY-MM-DD local date match', () => {
    // Fake time = 2026-03-04T12:00:00Z
    const todayLocal = '2026-03-04';
    const ts = makeTimesheet({
      stats: [
        { date: '2026-03-02', hours: 4 },
        { date: todayLocal, hours: 7.5 },
        { date: '2026-03-06', hours: 3 },
      ],
    });
    const pay = makePayments({ paidHours: 0 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.today).toBe(7.5);
  });

  it('returns today = 0 when today is not found in stats', () => {
    const ts = makeTimesheet({
      stats: [
        { date: '2026-03-02', hours: 8 },
        { date: '2026-03-03', hours: 8 },
      ],
    });
    const pay = makePayments({ paidHours: 0 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.today).toBe(0);
  });

  it('returns daily = [] when stats are absent', () => {
    const ts = { totalHours: 10, averageHoursPerDay: 2 } as any;
    const pay = makePayments();
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.daily).toEqual([]);
  });

  it('sets isToday=true on today DailyEntry and false on others', () => {
    const todayStr = '2026-03-04';
    const ts = makeTimesheet({
      stats: [
        { date: '2026-03-02', hours: 4 },
        { date: todayStr, hours: 5 },
        { date: '2026-03-06', hours: 3 },
      ],
    });
    const pay = makePayments({ paidHours: 0 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    const todayEntry = result.daily.find((d) => d.date === todayStr);
    const otherEntry = result.daily.find((d) => d.date === '2026-03-02');
    expect(todayEntry?.isToday).toBe(true);
    expect(otherEntry?.isToday).toBe(false);
  });

  it('null timesheet returns zeros with valid deadline', () => {
    const result = calculateHours(null, null, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(0);
    expect(result.average).toBe(0);
    expect(result.today).toBe(0);
    expect(result.daily).toEqual([]);
    expect(result.weeklyEarnings).toBe(0);
    expect(result.deadline).toBeInstanceOf(Date);
    expect(result.timeRemaining).toBeDefined();
  });

  it('null payments falls through to timesheet values', () => {
    const ts = makeTimesheet({ totalHours: 18 });
    const result = calculateHours(ts, null, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(18);
    expect(result.weeklyEarnings).toBe(18 * HOURLY_RATE);
  });

  it('returns a valid deadline Date', () => {
    const ts = makeTimesheet();
    const pay = makePayments();
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.deadline).toBeInstanceOf(Date);
    expect(isNaN(result.deadline.getTime())).toBe(false);
  });

  it('timeRemaining = deadline.getTime() - Date.now()', () => {
    const ts = makeTimesheet();
    const pay = makePayments();
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    const expected = result.deadline.getTime() - Date.now();
    // Allow 100ms tolerance for execution time
    expect(Math.abs(result.timeRemaining - expected)).toBeLessThan(100);
  });
});

// ─── getSundayMidnightGMT ─────────────────────────────────────────────────────

describe('getSundayMidnightGMT', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns Sunday of current week (UTC) when called on Wednesday', () => {
    // Wednesday 2026-03-04
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
    const result = getSundayMidnightGMT();
    expect(result.getUTCDay()).toBe(0); // 0 = Sunday
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(2); // March = 2
    expect(result.getUTCDate()).toBe(8); // 2026-03-08
  });

  it('returns 6 days ahead when called on Monday', () => {
    // Monday 2026-03-02
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-02T09:00:00.000Z'));
    const result = getSundayMidnightGMT();
    expect(result.getUTCDay()).toBe(0);
    expect(result.getUTCDate()).toBe(8); // Mon + 6 = Sun
  });

  it('returns end of current day when called on Sunday', () => {
    // Sunday 2026-03-08
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-08T10:00:00.000Z'));
    const result = getSundayMidnightGMT();
    expect(result.getUTCDay()).toBe(0);
    expect(result.getUTCDate()).toBe(8); // same Sunday, not next week
  });

  it('has time component 23:59:59 UTC', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
    const result = getSundayMidnightGMT();
    expect(result.getUTCHours()).toBe(23);
    expect(result.getUTCMinutes()).toBe(59);
    expect(result.getUTCSeconds()).toBe(59);
  });
});

// ─── getUrgencyLevel ──────────────────────────────────────────────────────────

describe('getUrgencyLevel', () => {
  const H = 60 * 60 * 1000; // 1 hour in ms

  it('returns "none" for ms > 12h', () => {
    expect(getUrgencyLevel(13 * H)).toBe('none');
    expect(getUrgencyLevel(24 * H)).toBe('none');
    expect(getUrgencyLevel(100 * H)).toBe('none');
  });

  it('returns "low" at exactly 12h', () => {
    expect(getUrgencyLevel(12 * H)).toBe('low');
  });

  it('returns "low" for 3h–12h range', () => {
    expect(getUrgencyLevel(11 * H)).toBe('low');
    expect(getUrgencyLevel(6 * H)).toBe('low');
    expect(getUrgencyLevel(3 * H + 1)).toBe('low');
  });

  it('returns "high" for 1h–3h range', () => {
    expect(getUrgencyLevel(3 * H)).toBe('high');
    expect(getUrgencyLevel(2 * H)).toBe('high');
    expect(getUrgencyLevel(1 * H + 1)).toBe('high');
  });

  it('returns "critical" for 0–1h range', () => {
    expect(getUrgencyLevel(1 * H)).toBe('critical');
    expect(getUrgencyLevel(30 * 60 * 1000)).toBe('critical');
    expect(getUrgencyLevel(1)).toBe('critical');
  });

  it('returns "expired" for negative ms', () => {
    expect(getUrgencyLevel(-1)).toBe('expired');
    expect(getUrgencyLevel(-1 * H)).toBe('expired');
    expect(getUrgencyLevel(0)).toBe('critical'); // 0 is not negative
  });
});

// ─── formatTimeRemaining ──────────────────────────────────────────────────────

describe('formatTimeRemaining', () => {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('returns "Xd Xh" format for > 24h', () => {
    const result = formatTimeRemaining(1 * DAY + 5 * HOUR);
    expect(result).toBe('1d 5h');
  });

  it('returns "Xd 0h" when exactly N days', () => {
    const result = formatTimeRemaining(2 * DAY);
    expect(result).toBe('2d 0h');
  });

  it('returns "Xh Xm" format for 1h–24h', () => {
    const result = formatTimeRemaining(12 * HOUR + 30 * MINUTE);
    expect(result).toBe('12h 30m');
  });

  it('returns "Xh 0m" when exactly N hours', () => {
    const result = formatTimeRemaining(3 * HOUR);
    expect(result).toBe('3h 0m');
  });

  it('returns "Xm" format for < 1h', () => {
    const result = formatTimeRemaining(45 * MINUTE);
    expect(result).toBe('45m');
  });

  it('returns "0m" for very small positive value', () => {
    const result = formatTimeRemaining(1000); // 1 second
    expect(result).toBe('0m');
  });

  it('returns "Expired" for negative ms', () => {
    expect(formatTimeRemaining(-1)).toBe('Expired');
    expect(formatTimeRemaining(-1 * HOUR)).toBe('Expired');
  });
});

// ─── getWeekStartDate ─────────────────────────────────────────────────────────

describe('getWeekStartDate', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns Monday of current week in UTC mode', () => {
    // Wednesday 2026-03-04 UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
    const result = getWeekStartDate(true);
    expect(result).toBe('2026-03-02'); // Monday of that week
  });

  it('returns Monday of current week in local mode', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
    const result = getWeekStartDate(false);
    // Should be a Monday — can't assert exact date due to timezone but verify format and day
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Parse and check it's a Monday (day 1)
    const parts = result.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    expect(d.getDay()).toBe(1); // Monday = 1
  });

  it('returns YYYY-MM-DD format string in UTC mode', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
    const result = getWeekStartDate(true);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns YYYY-MM-DD format string in local mode', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00.000Z'));
    const result = getWeekStartDate(false);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('UTC mode returns 2026-03-02 when called on Sunday 2026-03-08', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-08T22:00:00.000Z'));
    const result = getWeekStartDate(true);
    expect(result).toBe('2026-03-02');
  });

  it('UTC mode returns same-day Monday when called on Monday', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-02T09:00:00.000Z'));
    const result = getWeekStartDate(true);
    expect(result).toBe('2026-03-02');
  });
});

// ─── getThursdayDeadlineGMT (FR1: 02-deadline-clock) ─────────────────────────
//
// SC1.1 — Monday UTC → this Thursday same week at 23:59:59.999 UTC
// SC1.2 — Tuesday UTC → this Thursday same week at 23:59:59.999 UTC
// SC1.3 — Wednesday UTC → this Thursday same week at 23:59:59.999 UTC
// SC1.4 — Thursday UTC → today at 23:59:59.999 UTC (0 days ahead)
// SC1.5 — Friday UTC → next Thursday at 23:59:59.999 UTC
// SC1.6 — Saturday UTC → next Thursday at 23:59:59.999 UTC
// SC1.7 — Sunday UTC → next Thursday at 23:59:59.999 UTC
// SC1.8 — Thursday at 23:59:58 → still returns same-day deadline (not next week)
// SC1.9 — return value always has UTC day === 4 (Thursday)
// SC1.10 — return value has UTC hours=23, minutes=59, seconds=59

describe('getThursdayDeadlineGMT', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper: assert the returned date is a Thursday at 23:59:59 UTC
  function assertThursdayDeadline(result: Date) {
    expect(result.getUTCDay()).toBe(4); // SC1.9 — Thursday
    expect(result.getUTCHours()).toBe(23); // SC1.10
    expect(result.getUTCMinutes()).toBe(59);
    expect(result.getUTCSeconds()).toBe(59);
  }

  it('SC1.1 — Monday UTC → Thursday same week (3 days ahead)', () => {
    // 2026-04-06 is a Monday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:00:00.000Z'));
    const result = getThursdayDeadlineGMT();
    assertThursdayDeadline(result);
    // 2026-04-09 is Thursday of that week
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(3); // April = 3
    expect(result.getUTCDate()).toBe(9);
  });

  it('SC1.2 — Tuesday UTC → Thursday same week (2 days ahead)', () => {
    // 2026-04-07 is a Tuesday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-07T09:00:00.000Z'));
    const result = getThursdayDeadlineGMT();
    assertThursdayDeadline(result);
    expect(result.getUTCDate()).toBe(9); // 2026-04-09
  });

  it('SC1.3 — Wednesday UTC → Thursday same week (1 day ahead)', () => {
    // 2026-04-08 is a Wednesday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-08T15:00:00.000Z'));
    const result = getThursdayDeadlineGMT();
    assertThursdayDeadline(result);
    expect(result.getUTCDate()).toBe(9); // 2026-04-09
  });

  it('SC1.4 — Thursday UTC → today at 23:59:59 UTC (0 days ahead)', () => {
    // 2026-04-09 is a Thursday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-09T08:00:00.000Z'));
    const result = getThursdayDeadlineGMT();
    assertThursdayDeadline(result);
    expect(result.getUTCDate()).toBe(9); // same Thursday
  });

  it('SC1.5 — Friday UTC → next Thursday (6 days ahead)', () => {
    // 2026-04-10 is a Friday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-10T12:00:00.000Z'));
    const result = getThursdayDeadlineGMT();
    assertThursdayDeadline(result);
    expect(result.getUTCDate()).toBe(16); // 2026-04-16 (next Thursday)
  });

  it('SC1.6 — Saturday UTC → next Thursday (5 days ahead)', () => {
    // 2026-04-11 is a Saturday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-11T10:00:00.000Z'));
    const result = getThursdayDeadlineGMT();
    assertThursdayDeadline(result);
    expect(result.getUTCDate()).toBe(16); // 2026-04-16
  });

  it('SC1.7 — Sunday UTC → next Thursday (4 days ahead)', () => {
    // 2026-04-12 is a Sunday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-12T18:00:00.000Z'));
    const result = getThursdayDeadlineGMT();
    assertThursdayDeadline(result);
    expect(result.getUTCDate()).toBe(16); // 2026-04-16
  });

  it('SC1.8 — Thursday at 23:59:58 → still same-day deadline, not next week', () => {
    // 2026-04-09 Thursday at 23:59:58 UTC — just 1 second before deadline
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-09T23:59:58.000Z'));
    const result = getThursdayDeadlineGMT();
    assertThursdayDeadline(result);
    expect(result.getUTCDate()).toBe(9); // still Apr 9, not Apr 16
  });
});

// ─── calculateHours deadline is Sunday (FR1: 05-sunday-gmt-deadline) ──────────
//
// The Crossover hours week runs Mon–Sun, so the hard deadline is Sunday 23:59:59
// UTC (week close), NOT Thursday. calculateHours must source HoursData.deadline
// from getSundayMidnightGMT(). This block replaces the prior Thursday regression
// block (02-deadline-clock); the standalone getThursdayDeadlineGMT unit tests
// above stay green because the function is retained (pace-check only).

describe('calculateHours — deadline is Sunday (FR1: 05-sunday-gmt-deadline)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('SC1.1 — deadline.getUTCDay() === 0 (Sunday) when called on Tuesday', () => {
    // 2026-04-07 is a Tuesday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
    const result = calculateHours(null, null, 25, 40);
    expect(result.deadline.getUTCDay()).toBe(0); // Sunday
  });

  it('SC1.2 — Wednesday 2026-04-08 → deadline is 2026-04-12 (Sunday) at 23:59:59 UTC', () => {
    // 2026-04-08 is a Wednesday UTC; the Sunday of that Mon–Sun week is 2026-04-12
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-08T12:00:00.000Z'));
    const result = calculateHours(null, null, 25, 40);
    expect(result.deadline.getUTCFullYear()).toBe(2026);
    expect(result.deadline.getUTCMonth()).toBe(3); // April = 3
    expect(result.deadline.getUTCDate()).toBe(12);
    expect(result.deadline.getUTCHours()).toBe(23);
    expect(result.deadline.getUTCMinutes()).toBe(59);
    expect(result.deadline.getUTCSeconds()).toBe(59);
  });

  it('SC1.3 — timeRemaining > 3 days when called Monday (deadline is days away)', () => {
    // Monday — Sunday deadline is ~6 days away
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T09:00:00.000Z')); // Monday
    const result = calculateHours(null, null, 25, 40);
    expect(result.timeRemaining).toBeGreaterThan(0);
    expect(result.timeRemaining).toBeGreaterThan(3 * 24 * 60 * 60 * 1000);
  });

  it('SC1.4 — called Sunday 2026-04-12 10:00 UTC → this Sunday, not next week', () => {
    // 2026-04-12 is a Sunday UTC; deadline must be end of TODAY, not next Sunday
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-12T10:00:00.000Z'));
    const result = calculateHours(null, null, 25, 40);
    expect(result.deadline.getUTCDay()).toBe(0); // Sunday
    expect(result.deadline.getUTCDate()).toBe(12); // this Sunday
    // 10:00 → 23:59:59 same day = positive but < 14h
    expect(result.timeRemaining).toBeGreaterThan(0);
    expect(result.timeRemaining).toBeLessThan(14 * 60 * 60 * 1000);
  });

  it('SC1.5 — deadline is a Date instance (HoursData shape unchanged)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
    const result = calculateHours(null, null, 25, 40);
    expect(result.deadline).toBeInstanceOf(Date);
    expect(isNaN(result.deadline.getTime())).toBe(false);
  });
});

// ─── calculateHours with the hours overview (1.2 WorkSmart dashboard parity) ──
//
// Displayed hours follow the LOCAL week (the timesheet); the overview's days and weeks are
// UTC. So for the current UTC week the overview never replaces total / today / daily hours
// / average: it adds the weekly limit (remaining / overtime = local total against it), the
// per-local-day manual / pending split and the UTC pay-week breakdown (applyHoursOverview).
// The fixture is the live-shaped week of Mon 2026-10-19 as of Sunday 2026-10-25: billable
// 2410 min = tracked 2000 + manual approved 410, plus 130 min pending (not billable),
// limit 40 h, no approved OT.
//
// jest runs in the host's time zone (not pinned), so every local-day expectation is built
// with local Date methods: entries are made from local times (utcWallTime), or the
// expected day is worked out from the host offset (localYmd).

describe('calculateHours — 1.2 hours overview (applyHoursOverview)', () => {
  const RATE = 50;
  // The fixture's `today`, midday UTC: the same day and week in every host time zone.
  const SUNDAY = new Date('2026-10-25T18:00:00.000Z');
  const BILLABLE_H = 2410 / 60;

  function overviewOf(mutate?: (raw: any) => void): HoursOverview {
    const raw = JSON.parse(JSON.stringify(HOURS_OVERVIEW_RAW));
    mutate?.(raw);
    const o = normalizeHoursOverview(raw);
    if (!o) throw new Error('fixture did not parse');
    return o;
  }

  const weekTimesheet = (): TimesheetResponse => ({
    totalHours: 38,
    averageHoursPerDay: 6,
    stats: [
      { date: '2026-10-19', hours: 8 },
      { date: '2026-10-20', hours: 7.5 },
      { date: '2026-10-21', hours: 7.5 },
      { date: '2026-10-22', hours: 9 },
      { date: '2026-10-23', hours: 4 },
      { date: '2026-10-24', hours: 0 },
      { date: '2026-10-25', hours: 2 },
    ],
  });

  const weekPayments = (paidHours = 38) =>
    makePayments({ paidHours, workedHours: paidHours, amount: paidHours * RATE });

  /** The host-local YYYY-MM-DD of an instant, from the host's UTC offset at that instant. */
  const localYmd = (d: Date): string =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

  /** A host-local wall time as the overview writes it: UTC, no offset ("2026-10-21T04:30"). */
  const utcWallTime = (local: Date): string => local.toISOString().slice(0, 16);

  /** An overview manual entry starting at a host-local time. */
  const entryAt = (local: Date, durationMinutes: number, status: string) => ({
    start: utcWallTime(local),
    end: utcWallTime(new Date(local.getTime() + durationMinutes * 60_000)),
    durationMinutes,
    description: 'Work',
    status,
    selectedWeek: true,
  });

  /** Minutes of the fixture's `status` entries whose start is on host-local `date`. */
  const fixtureMinutesOn = (o: HoursOverview, status: string, date: string): number =>
    o.manualEntries
      .filter((e) => e.status === status && localYmd(new Date(`${e.start}Z`)) === date)
      .reduce((sum, e) => sum + e.durationMinutes, 0);

  beforeEach(() => {
    jest.useFakeTimers({ now: SUNDAY });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('without an overview', () => {
    it('null / undefined leave the timesheet path as it was (no breakdown)', () => {
      const ts = weekTimesheet();
      const pay = weekPayments();
      const plain = calculateHours(ts, pay, RATE, WEEKLY_LIMIT);
      expect(calculateHours(ts, pay, RATE, WEEKLY_LIMIT, null)).toEqual(plain);
      expect(calculateHours(ts, pay, RATE, WEEKLY_LIMIT, undefined)).toEqual(plain);
      expect(plain.total).toBe(38);
      expect(plain.weeklyEarnings).toBe(38 * RATE);
      expect(plain.weeklyLimit).toBe(WEEKLY_LIMIT);
      expect(plain.breakdown).toBeUndefined();
    });

    it('the timesheet path reports the limit it used', () => {
      expect(calculateHours(null, null, RATE, 35).weeklyLimit).toBe(35);
      expect(calculateHours(weekTimesheet(), null, RATE, 0).weeklyLimit).toBe(40);
    });
  });

  describe('current week', () => {
    // These used to expect the overview's UTC billable minutes / UTC days as the displayed
    // hours; displayed hours now stay on the local-week timesheet.

    it('total stays the local timesheet total; the UTC billable minutes never replace it', () => {
      const r = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, overviewOf());
      expect(r.total).toBe(38);
      expect(r.total).not.toBeCloseTo(BILLABLE_H, 1);
      expect(r.weeklyLimit).toBe(40);
      // Remaining / overtime: the local total against the overview's limit
      expect(r.hoursRemaining).toBe(2);
      expect(r.overtimeHours).toBe(0);
      // The UTC pay week is still reported, in the breakdown
      expect(r.breakdown?.billable).toBe(2410);
    });

    it('an uncapped local total over the limit → overtime against the overview limit', () => {
      const ts = { ...weekTimesheet(), totalHours: 42.83 };
      const r = calculateHours(ts, weekPayments(40), RATE, WEEKLY_LIMIT, overviewOf());
      expect(r.total).toBe(42.83);
      expect(r.hoursRemaining).toBe(0);
      expect(r.overtimeHours).toBeCloseTo(2.83, 10);
    });

    it('daily keeps the timesheet\'s local days, hours and isToday; the UTC days are not used', () => {
      const base = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT);
      const r = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, overviewOf());
      expect(r.daily.map(({ date, hours, isToday }) => ({ date, hours, isToday }))).toEqual(base.daily);
      // Friday: the timesheet's 4 h, not the overview's UTC 280 min
      expect(r.daily[4]).toMatchObject({ date: '2026-10-23', hours: 4 });
    });

    it('today, todayEarnings and average stay the timesheet\'s (local day)', () => {
      const base = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT);
      const r = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, overviewOf());
      const todayRow = weekTimesheet().stats!.find((s) => s.date === localYmd(SUNDAY));
      expect(base.today).toBe(todayRow?.hours ?? 0);
      expect(r.today).toBe(base.today);
      expect(r.todayEarnings).toBe(base.todayEarnings);
      expect(r.average).toBe(6);
    });

    it('today stays the local day, never the overview\'s UTC day', () => {
      // 03:00 UTC Sunday is still Saturday evening in the Americas: the overview's UTC
      // "today" (Sunday, 160 min) must not leak into the local one.
      const earlySunday = new Date('2026-10-25T03:00:00.000Z');
      jest.setSystemTime(earlySunday);
      const base = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT);
      const r = applyHoursOverview(base, overviewOf(), weekPayments(), RATE, earlySunday);
      const localToday = localYmd(earlySunday);
      expect(r.today).toBe(weekTimesheet().stats!.find((s) => s.date === localToday)?.hours ?? 0);
      expect(r.daily.filter((d) => d.isToday).map((d) => d.date)).toEqual(
        base.daily.filter((d) => d.isToday).map((d) => d.date),
      );
    });

    it('per-day manual / pending: each entry is filed under the local day its start falls on', () => {
      // Built from host-local times, so the expected day holds in every host time zone;
      // late-evening and just-after-midnight starts sit on a different UTC date in most.
      const o = overviewOf((raw) => {
        raw.manualEntries = [
          entryAt(new Date(2026, 9, 21, 22, 30), 60, 'APPROVED'), // Wed 22:30 local
          entryAt(new Date(2026, 9, 22, 0, 30), 30, 'APPROVED'), // Thu 00:30 local
          entryAt(new Date(2026, 9, 21, 23, 50), 45, 'PENDING'), // Wed 23:50 local
          entryAt(new Date(2026, 9, 23, 9, 0), 15, 'PENDING'), // Fri 09:00 local
          entryAt(new Date(2026, 9, 21, 12, 0), 90, 'REJECTED'), // ignored
        ];
      });
      const r = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, o);
      const byDate = Object.fromEntries(
        r.daily.map((d) => [d.date, [d.hours, d.manualHours, d.pendingHours]]),
      );
      expect(byDate).toEqual({
        '2026-10-19': [8, 0, 0],
        '2026-10-20': [7.5, 0, 0],
        '2026-10-21': [7.5, 1, 0.75],
        '2026-10-22': [9, 0.5, 0],
        '2026-10-23': [4, 0, 0.25],
        '2026-10-24': [0, 0, 0],
        '2026-10-25': [2, 0, 0],
      });
      // The split never changes the timesheet total
      expect(r.total).toBe(38);
    });

    it('per-day manual / pending from the fixture entries match their local days', () => {
      const o = overviewOf();
      const r = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, o);
      for (const d of r.daily) {
        expect(d.manualHours! * 60).toBeCloseTo(fixtureMinutesOn(o, 'APPROVED', d.date), 10);
        expect(d.pendingHours! * 60).toBeCloseTo(fixtureMinutesOn(o, 'PENDING', d.date), 10);
      }
      // Every day gets numbers, 0 when it has no entry
      expect(r.daily.every((d) => d.manualHours !== undefined && d.pendingHours !== undefined)).toBe(true);
    });

    it('live 2026-10-26 shape: timesheet 4 h + a 70-min PENDING entry → total 4, pending on its day only', () => {
      // Monday of the next week: the timesheet (local) has 4 h and excludes the pending
      // entry; the overview has tracked 240 + 70 pending.
      const monday = new Date('2026-10-26T18:00:00.000Z');
      jest.setSystemTime(monday);
      const localMonday = new Date(2026, 9, 26, 10, 0);
      const o = overviewOf((raw) => {
        raw.weekStart = '2026-10-26';
        raw.weeks.push({
          billable: 240, tracked: 240, manualApproved: 0, manualPending: 70,
          manualRejected: 0, disputed: 0, weekStart: '2026-10-26',
          approvedOvertime: 0, limitHours: 40, beforeStart: false,
        });
        raw.manualEntries = [entryAt(localMonday, 70, 'PENDING')];
      });
      const ts: TimesheetResponse = {
        totalHours: 4,
        manualHourWorked: 0,
        averageHoursPerDay: 4,
        stats: [{ date: `${localYmd(localMonday)}T00:00:00.000Z`, hours: 4 }],
      };
      const r = calculateHours(ts, null, RATE, WEEKLY_LIMIT, o);
      expect(r.total).toBe(4);
      expect(r.hoursRemaining).toBe(36);
      expect(r.daily).toHaveLength(1);
      expect(r.daily[0].hours).toBe(4);
      expect(r.daily[0].manualHours).toBe(0);
      expect(r.daily[0].pendingHours).toBeCloseTo(70 / 60, 10);
      expect(r.breakdown).toMatchObject({ weekStart: '2026-10-26', billable: 240, manualPending: 70 });
    });

    it('Monday 02:00 UTC (Sunday evening in UTC-6): the pay week moves on, the local total does not', () => {
      // The accepted oddity: the breakdown is the new UTC pay week while the hero keeps the
      // local week's timesheet total.
      const mondayUtc = new Date('2026-10-26T02:00:00.000Z');
      jest.setSystemTime(mondayUtc);
      const o = overviewOf((raw) => {
        raw.weekStart = '2026-10-26';
        raw.weeks.push({
          billable: 120, tracked: 120, manualApproved: 0, manualPending: 0,
          manualRejected: 0, disputed: 0, weekStart: '2026-10-26',
          approvedOvertime: 0, limitHours: 40, beforeStart: false,
        });
      });
      const r = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, o);
      expect(r.total).toBe(38);
      expect(r.breakdown).toMatchObject({ weekStart: '2026-10-26', billable: 120 });
    });

    it('the weekly limit comes from the overview, not the config', () => {
      const o = overviewOf((raw) => {
        raw.limitHours = 30;
        raw.weeks[7].limitHours = 30;
      });
      const r = calculateHours(weekTimesheet(), null, RATE, 40, o);
      expect(r.weeklyLimit).toBe(30);
      expect(r.hoursRemaining).toBe(0);
      // The local total (38 h) against the overview's limit
      expect(r.overtimeHours).toBe(38 - 30);
      expect(r.breakdown?.limitMinutes).toBe(1800);
      expect(r.breakdown?.cappedBillable).toBe(1800);
      expect(r.weeklyEarnings).toBeCloseTo(30 * RATE, 10);

      const roomy = calculateHours(weekTimesheet(), null, RATE, 40, overviewOf((raw) => { raw.limitHours = 45; }));
      expect(roomy.weeklyLimit).toBe(45);
      expect(roomy.hoursRemaining).toBe(45 - 38);
      expect(roomy.overtimeHours).toBe(0);
    });

    it('a zero or missing overview limit falls back to the config limit', () => {
      const zero = calculateHours(weekTimesheet(), null, RATE, 35, overviewOf((raw) => { raw.limitHours = 0; }));
      expect(zero.weeklyLimit).toBe(35);
      expect(zero.breakdown?.limitMinutes).toBe(35 * 60);
      expect(zero.breakdown?.cappedBillable).toBe(35 * 60);

      const missing = calculateHours(weekTimesheet(), null, RATE, 35, overviewOf((raw) => { delete raw.limitHours; }));
      expect(missing.weeklyLimit).toBe(35);
    });

    it('earnings keep the payments row when paidHours > 0', () => {
      const r = calculateHours(weekTimesheet(), weekPayments(38), RATE, WEEKLY_LIMIT, overviewOf());
      expect(r.weeklyEarnings).toBe(38 * RATE);
    });

    it('earnings fall back to capped billable × rate without a paid row', () => {
      const noRow = calculateHours(weekTimesheet(), null, RATE, WEEKLY_LIMIT, overviewOf());
      expect(noRow.weeklyEarnings).toBeCloseTo(40 * RATE, 10); // 2410 min capped at 2400

      const zeroPaid = calculateHours(weekTimesheet(), weekPayments(0), RATE, WEEKLY_LIMIT, overviewOf());
      expect(zeroPaid.weeklyEarnings).toBeCloseTo(40 * RATE, 10);
    });

    it('approved overtime raises the earnings cap', () => {
      const o = overviewOf((raw) => { raw.weeks[7].approvedOvertime = 120; });
      const r = calculateHours(weekTimesheet(), null, RATE, WEEKLY_LIMIT, o);
      expect(r.breakdown?.cappedBillable).toBe(2410);
      expect(r.weeklyEarnings).toBeCloseTo(BILLABLE_H * RATE, 10);
    });

    it('a FIXED contract is never capped, and its earnings stay on the base figure', () => {
      const o = overviewOf((raw) => { raw.kind = 'FIXED'; });
      const r = calculateHours(weekTimesheet(), null, RATE, WEEKLY_LIMIT, o);
      const base = calculateHours(weekTimesheet(), null, RATE, WEEKLY_LIMIT);
      expect(r.breakdown?.isHourly).toBe(false);
      expect(r.breakdown?.cappedBillable).toBe(2410);
      // No per-hour pay to derive for FIXED / NOT_PAID: billable × rate would be invented money
      expect(r.weeklyEarnings).toBeCloseTo(base.weeklyEarnings, 10);
    });

    it('breakdown carries the week\'s minute buckets', () => {
      const r = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, overviewOf());
      expect(r.breakdown).toEqual({
        weekStart: '2026-10-19',
        tracked: 2000,
        idle: 110,
        manualApproved: 410,
        manualPending: 130,
        manualRejected: 0,
        disputed: 0,
        billable: 2410,
        cappedBillable: 2400,
        limitMinutes: 2400,
        approvedOvertime: 0,
        isHourly: true,
      });
    });

    it('average is the timesheet\'s; the overview\'s UTC days never derive one', () => {
      const withTs = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, overviewOf());
      expect(withTs.average).toBe(6);

      // Used to be the UTC billable total over the UTC days with time
      const noTs = calculateHours(null, null, RATE, WEEKLY_LIMIT, overviewOf());
      expect(noTs.average).toBe(0);
    });

    it('an overview alone (no timesheet, no payments) gives no local hours, only the pay week', () => {
      // Used to give the whole UTC week as displayed hours
      const r = calculateHours(null, null, RATE, WEEKLY_LIMIT, overviewOf());
      expect(r.total).toBe(0);
      expect(r.today).toBe(0);
      expect(r.daily).toEqual([]);
      expect(r.hoursRemaining).toBe(40);
      expect(r.weeklyLimit).toBe(40);
      // Payments-domain: capped billable × rate without a paid row
      expect(r.weeklyEarnings).toBeCloseTo(40 * RATE, 10);
      expect(r.breakdown?.billable).toBe(2410);
    });

    it('no timesheet but a payments row: no local hours, the overview limit, payments earnings', () => {
      const pay = makePayments({ paidHours: 30, workedHours: 33 });
      const r = calculateHours(null, pay, RATE, 35, overviewOf());
      expect(r.total).toBe(0);
      expect(r.weeklyLimit).toBe(40);
      expect(r.hoursRemaining).toBe(40);
      expect(r.overtimeHours).toBe(0);
      expect(r.weeklyEarnings).toBe(30 * RATE);
    });

    it('keeps the timesheet path\'s deadline and timeRemaining', () => {
      const base = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT);
      const r = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT, overviewOf());
      expect(r.deadline).toEqual(base.deadline);
      expect(r.timeRemaining).toBe(base.timeRemaining);
    });

    it('Sunday 23:59 UTC is still the overview\'s week', () => {
      const base = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT);
      const r = applyHoursOverview(base, overviewOf(), weekPayments(), RATE, new Date('2026-10-25T23:59:59.999Z'));
      expect(r).not.toBe(base);
      expect(r.breakdown?.weekStart).toBe('2026-10-19');
    });
  });

  describe('an overview for another week', () => {
    it.each([
      ['next Monday 00:00 UTC', '2026-10-26T00:00:00.000Z'],
      ['the next Sunday evening in UTC-6 (already Monday UTC)', '2026-10-25T20:00:00-06:00'],
      ['the week before', '2026-10-18T23:00:00.000Z'],
    ])('returns the base unchanged (%s)', (_label, iso) => {
      const base = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT);
      expect(applyHoursOverview(base, overviewOf(), weekPayments(), RATE, new Date(iso))).toBe(base);
    });

    it('a persisted last-week overview leaves calculateHours on the timesheet path', () => {
      jest.setSystemTime(new Date('2026-10-27T12:00:00.000Z'));
      const ts = weekTimesheet();
      const pay = weekPayments();
      const r = calculateHours(ts, pay, RATE, WEEKLY_LIMIT, overviewOf());
      expect(r).toEqual(calculateHours(ts, pay, RATE, WEEKLY_LIMIT));
      expect(r.breakdown).toBeUndefined();
      expect(r.total).toBe(38);
    });
  });

  describe('a week row that is not the requested week', () => {
    it('the requested week missing from `weeks` → base unchanged, never last week\'s total', () => {
      const o = overviewOf((raw) => { raw.weeks = raw.weeks.slice(0, 7); }); // newest is 10-12
      const base = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT);
      expect(applyHoursOverview(base, o, weekPayments(), RATE, SUNDAY)).toBe(base);
    });

    it('no weeks at all → base unchanged', () => {
      const o = overviewOf((raw) => { raw.weeks = []; });
      const base = calculateHours(weekTimesheet(), weekPayments(), RATE, WEEKLY_LIMIT);
      expect(applyHoursOverview(base, o, weekPayments(), RATE, SUNDAY)).toBe(base);
    });
  });
});
