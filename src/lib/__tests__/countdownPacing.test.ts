// Tests for computeDeadlineCountdown and computePacingSignal (01-week-countdown-pacing)
// FR1: computeDeadlineCountdown returns correct label + urgency for all weekday cases
// FR4: computePacingSignal returns correct label for behind/on-track/weekend cases

import { computeDeadlineCountdown, computePacingSignal } from '../hours';

// ─── computeDeadlineCountdown ─────────────────────────────────────────────────

// 05-sunday-gmt-deadline (FR3): the hard deadline is Sunday 23:59:59 UTC (week
// close), NOT Thursday. computeDeadlineCountdown counts down to Sunday; the
// urgency ramp (>48h none / 24–48h warning / <24h critical) now keys off Sunday,
// so mid-week (e.g. Thursday) reads 'none' instead of the old false 'critical'.
describe('computeDeadlineCountdown', () => {
  beforeEach(() => {
    // Freeze clock to a known Monday so any internal new Date() calls are stable
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  it('Monday 2026-04-06 09:00 UTC → > 48h → urgency none, deadline is Sunday 2026-04-12', () => {
    // Monday 09:00 UTC — deadline is Sunday 23:59:59 UTC = ~6d 15h away
    const monday = new Date('2026-04-06T09:00:00.000Z'); // A known Monday
    const result = computeDeadlineCountdown(monday);

    expect(result.urgency).toBe('none');
    expect(result.msRemaining).toBeGreaterThan(48 * 60 * 60 * 1000);
    // Label should contain days and hours (e.g. "6d 14h left")
    expect(result.label).toMatch(/^\d+d \d+h left$/);
    // Deadline date is 2026-04-12 (the Sunday of that Mon–Sun week)
    const deadline = new Date(monday.getTime() + result.msRemaining);
    expect(deadline.getUTCDate()).toBe(12);
    expect(deadline.getUTCDay()).toBe(0); // Sunday
  });

  it('Thursday 2026-04-09 14:00 UTC → urgency none (was critical under Thursday behavior)', () => {
    // Thursday 14:00 UTC — deadline is Sunday 23:59:59 UTC = ~3d 10h away.
    // Proves the ramp moved OFF Thursday: this used to be 'critical'.
    const thursday = new Date('2026-04-09T14:00:00.000Z'); // A known Thursday
    const result = computeDeadlineCountdown(thursday);

    expect(result.urgency).toBe('none');
    expect(result.msRemaining).toBeGreaterThan(48 * 60 * 60 * 1000);
    expect(result.label).toMatch(/^\d+d \d+h left$/);
  });

  it('Saturday 2026-04-11 20:00 UTC → ~28h → urgency warning', () => {
    // Saturday 20:00 UTC — deadline is Sunday 23:59:59 UTC = ~28h away
    const saturday = new Date('2026-04-11T20:00:00.000Z'); // A known Saturday
    const result = computeDeadlineCountdown(saturday);

    expect(result.urgency).toBe('warning');
    expect(result.msRemaining).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(result.msRemaining).toBeLessThan(48 * 60 * 60 * 1000);
    expect(result.label).toMatch(/^\d+d \d+h left$/);
  });

  it('Sunday 2026-04-12 14:00 UTC → ~10h → urgency critical', () => {
    // Sunday 14:00 UTC — deadline is THIS Sunday 23:59:59 UTC = ~10h away
    const sunday = new Date('2026-04-12T14:00:00.000Z'); // A known Sunday
    const result = computeDeadlineCountdown(sunday);

    expect(result.urgency).toBe('critical');
    expect(result.msRemaining).toBeLessThan(24 * 60 * 60 * 1000);
    expect(result.msRemaining).toBeGreaterThan(0);
    // Label should contain hours and minutes (e.g. "9h 59m left")
    expect(result.label).toMatch(/^\d+h \d+m left$/);
  });

  it('called on Sunday returns this Sunday (0 days ahead), not next week', () => {
    const sunday = new Date('2026-04-12T12:00:00.000Z'); // A known Sunday
    const result = computeDeadlineCountdown(sunday);

    const deadline = new Date(sunday.getTime() + result.msRemaining);
    expect(deadline.getUTCDate()).toBe(12); // this Sunday, not 2026-04-19
    expect(deadline.getUTCDay()).toBe(0);
    expect(result.urgency).toBe('critical'); // < 24h to end of today
  });

  it('label uses "Xm left" format when < 1h remaining (Sunday 23:30 UTC)', () => {
    // Sunday 23:30 UTC — ~30 minutes to deadline (week close)
    const almostDeadline = new Date('2026-04-12T23:30:00.000Z');
    const result = computeDeadlineCountdown(almostDeadline);

    expect(result.urgency).toBe('critical');
    expect(result.label).toMatch(/^\d+m left$/);
  });

  it('msRemaining is close to expected value for Saturday 15:00 UTC', () => {
    const saturday = new Date('2026-04-11T15:00:00.000Z');
    const result = computeDeadlineCountdown(saturday);

    // Sunday 23:59:59 UTC - Saturday 15:00 UTC = 32h 59m 59s = ~118799s
    const expectedMs = (32 * 60 * 60 + 59 * 60 + 59) * 1000;
    expect(result.msRemaining).toBeCloseTo(expectedMs, -3); // within ~1 second
  });
});

// ─── computePacingSignal ──────────────────────────────────────────────────────

describe('computePacingSignal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  it('computePacingSignal(20, 40, monday) → "5.0h/day needed"', () => {
    // Monday: 4 working days remain (Mon, Tue, Wed, Thu)
    // (40 - 20) / 4 = 5.0h/day
    const monday = new Date('2026-04-06T09:00:00.000Z');
    const result = computePacingSignal(20, 40, monday);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('5.0h/day needed');
    expect(result!.hoursPerDayNeeded).toBeCloseTo(5.0, 1);
  });

  it('computePacingSignal(40, 40, tuesday) → "Target met"', () => {
    // hoursWorked >= weeklyLimit → target met
    const tuesday = new Date('2026-04-07T09:00:00.000Z');
    const result = computePacingSignal(40, 40, tuesday);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('Target met');
    expect(result!.hoursPerDayNeeded).toBe(0);
  });

  it('computePacingSignal(30, 40, saturday) → null', () => {
    // Weekend → no pacing signal
    const saturday = new Date('2026-04-11T10:00:00.000Z');
    const result = computePacingSignal(30, 40, saturday);

    expect(result).toBeNull();
  });

  it('computePacingSignal(30, 40, sunday) → null', () => {
    const sunday = new Date('2026-04-12T10:00:00.000Z');
    const result = computePacingSignal(30, 40, sunday);

    expect(result).toBeNull();
  });

  it('computePacingSignal(30, 40, wednesday) → "3.3h/day needed"', () => {
    // Wednesday: 2 working days remain (Wed, Thu)
    // (40 - 30) / 3 = 3.3h/day  -- wait, Wed has Wed+Thu = 2 days, but daysRemaining counts today
    // Mon=4, Tue=3, Wed=2, Thu=1 (includes today as a remaining day)
    // Actually: (40 - 30) / 2 = 5.0? Let's reconsider:
    // spec says daysRemaining = working days left Mon–Thu (Thu=1, Wed=2, Tue=3, Mon=4)
    // So Wednesday daysRemaining = 2
    // (40 - 30) / 2 = 5.0h/day
    const wednesday = new Date('2026-04-08T09:00:00.000Z');
    const result = computePacingSignal(30, 40, wednesday);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('5.0h/day needed');
    expect(result!.hoursPerDayNeeded).toBeCloseTo(5.0, 1);
  });

  it('computePacingSignal(38, 40, thursday) → "2.0h/day needed"', () => {
    // Thursday: 1 working day remains
    // (40 - 38) / 1 = 2.0h/day
    const thursday = new Date('2026-04-09T09:00:00.000Z');
    const result = computePacingSignal(38, 40, thursday);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('2.0h/day needed');
    expect(result!.hoursPerDayNeeded).toBeCloseTo(2.0, 1);
  });

  it('exceeding weeklyLimit → "Target met"', () => {
    const monday = new Date('2026-04-06T09:00:00.000Z');
    const result = computePacingSignal(45, 40, monday);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('Target met');
    expect(result!.hoursPerDayNeeded).toBe(0);
  });

  it('label formats hoursPerDayNeeded to 1 decimal place', () => {
    // Tuesday: 3 working days remain
    // (40 - 28) / 3 = 4.0h/day
    const tuesday = new Date('2026-04-07T09:00:00.000Z');
    const result = computePacingSignal(28, 40, tuesday);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('4.0h/day needed');
  });
});
