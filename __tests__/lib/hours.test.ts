// FR1 Tests: calculateHours and date utilities
// These tests are written BEFORE the implementation (TDD red phase)
// Import from src/lib/hours which does not exist yet

import {
  calculateHours,
  getSundayMidnightGMT,
  getUrgencyLevel,
  formatTimeRemaining,
  getWeekStartDate,
  getThursdayDeadlineGMT,
} from '../../src/lib/hours';

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

const makePayments = (overrides = {}) => ({
  paidHours: 20,
  workedHours: 20,
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

  it('returns payments.paidHours when > 0 (matches Crossover "payment hours")', () => {
    // paidHours = auto-tracked + approved manual — what Crossover shows as "payment hours"
    const ts = makeTimesheet({ totalHours: 10 });
    const pay = makePayments({ paidHours: 33 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(33);
  });

  it('falls back to workedHours when paidHours === 0', () => {
    const ts = makeTimesheet({ totalHours: 10 });
    const pay = makePayments({ paidHours: 0, workedHours: 35 });
    const result = calculateHours(ts, pay, HOURLY_RATE, WEEKLY_LIMIT);
    expect(result.total).toBe(35);
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

// ─── calculateHours deadline regression (FR2: 02-deadline-clock) ──────────────
//
// SC2.1 — When called on Tuesday UTC, HoursData.deadline is a Thursday
// SC2.2 — HoursData.timeRemaining is positive when called before Thursday 23:59:59 UTC
// SC2.3 — Return type HoursData shape is unchanged (deadline is a Date)

describe('calculateHours — deadline is Thursday (FR2 regression)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('SC2.1 — deadline.getUTCDay() === 4 (Thursday) when called on Tuesday', () => {
    // 2026-04-07 is a Tuesday UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
    const result = calculateHours(null, null, 25, 40);
    expect(result.deadline.getUTCDay()).toBe(4); // Thursday
  });

  it('SC2.2 — timeRemaining is positive when called before Thursday 23:59:59 UTC', () => {
    // Monday — Thursday deadline is days away, timeRemaining should be large positive
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T09:00:00.000Z')); // Monday
    const result = calculateHours(null, null, 25, 40);
    expect(result.timeRemaining).toBeGreaterThan(0);
    // Should be approximately 3 days + some hours in ms
    expect(result.timeRemaining).toBeGreaterThan(2 * 24 * 60 * 60 * 1000);
  });

  it('SC2.3 — deadline is a Date instance (HoursData shape unchanged)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
    const result = calculateHours(null, null, 25, 40);
    expect(result.deadline).toBeInstanceOf(Date);
    expect(isNaN(result.deadline.getTime())).toBe(false);
  });
});
