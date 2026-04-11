// FR1: Business logic — calculateHours, date utilities
// Pure functions with no side effects. Fully testable.
// getWeekLabels added for 07-overview-sync FR2.
// computeHoursVariance added for 03-hours-variance.

export type UrgencyLevel = 'none' | 'low' | 'high' | 'critical' | 'expired';

export interface DailyEntry {
  date: string;      // YYYY-MM-DD
  hours: number;
  isToday: boolean;
}

export interface HoursData {
  total: number;
  average: number;
  today: number;
  daily: DailyEntry[];
  weeklyEarnings: number;
  todayEarnings: number;
  hoursRemaining: number;
  overtimeHours: number;
  timeRemaining: number; // ms
  deadline: Date;
}

export interface TimesheetResponse {
  totalHours?: number;
  hourWorked?: number;
  manualHourWorked?: number | string; // manual/logbook hours (includes pending entries)
  averageHoursPerDay: number;
  stats?: Array<{ date: string; hours: number }>;
}

export interface PaymentsResponse {
  paidHours: number;
  workedHours: number;
  overtimeHours: number;
  approvedOvertimeHours: number;
  manualMinutes: number;
  amount: number;
}

// ─── getSundayMidnightGMT ─────────────────────────────────────────────────────

/**
 * Returns the Sunday 23:59:59 UTC of the current UTC week.
 * If today is already Sunday, returns end of today (not next week).
 */
export function getSundayMidnightGMT(): Date {
  const now = new Date();
  const currentDay = now.getUTCDay(); // 0 = Sunday
  const daysUntilSunday = currentDay === 0 ? 0 : 7 - currentDay;

  const deadline = new Date(now);
  deadline.setUTCDate(deadline.getUTCDate() + daysUntilSunday);
  deadline.setUTCHours(23, 59, 59, 999);

  return deadline;
}

// ─── getThursdayDeadlineGMT ───────────────────────────────────────────────────

/**
 * Returns Thursday 23:59:59.999 UTC of the current UTC work week.
 * Mon–Thu: this Thursday. Fri–Sun: next Thursday.
 *
 * Mirrors the day-offset logic in computeDeadlineCountdown but returns
 * a Date object for use in calculateHours.
 */
export function getThursdayDeadlineGMT(): Date {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Thursday = 4. Days until next/current Thursday:
  // Mon(1)→3, Tue(2)→2, Wed(3)→1, Thu(4)→0, Fri(5)→6, Sat(6)→5, Sun(0)→4
  const daysUntilThursday = (4 - utcDay + 7) % 7;

  const deadline = new Date(now);
  deadline.setUTCDate(deadline.getUTCDate() + daysUntilThursday);
  deadline.setUTCHours(23, 59, 59, 999);

  return deadline;
}

// ─── getWeekStartDate ─────────────────────────────────────────────────────────

/**
 * Returns the Monday of the current week as a YYYY-MM-DD string.
 * useUTC=true uses Date.UTC() arithmetic (safe for API calls, immune to timezone shifts).
 * useUTC=false uses local date arithmetic (for local display).
 *
 * CRITICAL: Never use new Date().toISOString() for local dates —
 * it shifts the date to UTC, which may change the date in non-UTC timezones.
 */
export function getWeekStartDate(useUTC: boolean): string {
  if (useUTC) {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysToMonday
    );
    // Safe to use toISOString here because mondayUTC is already UTC-aligned
    return new Date(mondayUTC).toISOString().slice(0, 10);
  } else {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(monday.getDate() - daysToMonday);
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

// ─── getUrgencyLevel ──────────────────────────────────────────────────────────

/**
 * Returns urgency level based on milliseconds remaining until deadline.
 * Boundary cases: exactly 12h → 'low', exactly 3h → 'high', exactly 1h → 'critical'
 */
export function getUrgencyLevel(timeRemainingMs: number): UrgencyLevel {
  if (timeRemainingMs < 0) return 'expired';

  const hours = timeRemainingMs / (1000 * 60 * 60);

  if (hours > 12) return 'none';
  if (hours > 3) return 'low';
  if (hours > 1) return 'high';
  return 'critical';
}

// ─── formatTimeRemaining ──────────────────────────────────────────────────────

/**
 * Converts milliseconds to a human-readable time string.
 * Negative → "Expired"
 * > 24h → "Xd Xh"
 * 1h–24h → "Xh Xm"
 * < 1h → "Xm"
 */
export function formatTimeRemaining(ms: number): string {
  if (ms < 0) return 'Expired';

  const totalMinutes = Math.floor(ms / (1000 * 60));
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  const remainingMinutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${remainingHours}h`;
  }
  if (totalHours > 0) {
    return `${totalHours}h ${remainingMinutes}m`;
  }
  return `${totalMinutes}m`;
}

// ─── getWeekLabels ────────────────────────────────────────────────────────────

/**
 * Returns `count` human-readable week-start labels, oldest first.
 * Each label is the Monday of that week, formatted "MMM D" (e.g. "Mar 3").
 * Uses local timezone. count=0 returns [].
 *
 * Example for count=4 on a Wednesday 2026-03-18:
 *   ["Feb 23", "Mar 2", "Mar 9", "Mar 16"]
 */
export function getWeekLabels(count: number): string[] {
  if (count === 0) return [];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const result: string[] = [];
  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = dow === 0 ? 6 : dow - 1;
  // i = weeks back from current (count-1 = oldest, 0 = current)
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysToMonday - i * 7);
    result.push(`${MONTHS[d.getMonth()]} ${d.getDate()}`);
  }
  return result;
}

// ─── calculateHours ───────────────────────────────────────────────────────────

/**
 * Derives HoursData from raw API responses.
 * Pure function — no side effects, fully testable.
 *
 * Priority rules:
 * - total: payments.workedHours when > 0 (includes auto-tracked + manual/logbook hours);
 *          falls back to timesheet.totalHours/hourWorked (auto-tracked only)
 * - weeklyEarnings: total * hourlyRate (derived from displayed hours for consistency)
 * - today: matched by local YYYY-MM-DD date string from stats array
 */
export function calculateHours(
  timesheetData: TimesheetResponse | null | undefined,
  paymentsData: PaymentsResponse | null | undefined,
  hourlyRate: number,
  weeklyLimit: number
): HoursData {
  const deadline = getThursdayDeadlineGMT();
  const now = Date.now();
  const timeRemaining = deadline.getTime() - now;
  const limit = weeklyLimit || 40;

  // Handle null/missing timesheet
  if (!timesheetData) {
    return {
      total: 0,
      average: 0,
      today: 0,
      daily: [],
      weeklyEarnings: 0,
      todayEarnings: 0,
      hoursRemaining: limit,
      overtimeHours: 0,
      timeRemaining,
      deadline,
    };
  }

  // Extract timesheet values
  const timesheetTotal = parseFloat(
    String(timesheetData.totalHours ?? timesheetData.hourWorked ?? 0)
  );
  const averageHours = parseFloat(String(timesheetData.averageHoursPerDay ?? 0));
  const stats = timesheetData.stats ?? [];

  // Crossover's "payment hours" on the earnings page = paidHours.
  // It includes auto-tracked + approved manual time, and matches what the user
  // expects to see as their hours for the week.
  // workedHours is auto-tracked only (lower number, doesn't include approved manual).
  // Fall back chain: paidHours → workedHours → timesheetTotal (auto-tracked only)
  const total =
    paymentsData && paymentsData.paidHours > 0
      ? paymentsData.paidHours
      : paymentsData && paymentsData.workedHours > 0
        ? paymentsData.workedHours
        : timesheetTotal;

  // Today's hours by local date string match
  const todayLocal = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  const todayEntry = stats.find((s) => s.date.startsWith(todayLocal));
  const todayHours = todayEntry ? todayEntry.hours : 0;

  // Build daily entries with isToday flag
  // Normalize date: API returns full ISO datetime ("2026-03-09T00:00:00.000Z"), slice to YYYY-MM-DD
  const daily: DailyEntry[] = stats.map((s) => ({
    date: s.date.slice(0, 10),
    hours: s.hours,
    isToday: s.date.startsWith(todayLocal),
  }));

  // Earnings always derived from displayed hours × rate for internal consistency.
  // The payments API amount (paidHours × rate) is finalized data used in the historical
  // sparkline (useEarningsHistory), not here. Using total × hourlyRate ensures
  // the hero number and earnings card are always mathematically consistent.
  const weeklyEarnings = total * hourlyRate;
  const todayEarnings = todayHours * hourlyRate;

  // Remaining / overtime
  const hoursRemaining = Math.max(0, limit - total);
  const overtimeHours = Math.max(0, total - limit);

  return {
    total,
    average: averageHours,
    today: todayHours,
    daily,
    weeklyEarnings,
    todayEarnings,
    hoursRemaining,
    overtimeHours,
    timeRemaining,
    deadline,
  };
}

// getWeekLabels is defined above (added by 05-earnings-scrub, reused by 07-overview-sync)

// ─── computeDeadlineCountdown ─────────────────────────────────────────────────

/**
 * Returns time remaining until the Crossover timesheet deadline (Thursday 23:59:59 UTC).
 * Mon–Thu: deadline is this Thursday. Fri–Sun: deadline is next Thursday.
 *
 * - urgency: 'none' (>48h), 'warning' (24–48h), 'critical' (<24h)
 * - label: "2d 14h left" | "23h 45m left" | "45m left"
 */
export function computeDeadlineCountdown(now = new Date()): {
  msRemaining: number;
  label: string;
  urgency: 'none' | 'warning' | 'critical';
} {
  // Thursday (UTC day 4) is the Crossover timesheet deadline
  const utcDay = now.getUTCDay(); // 0 = Sunday
  const daysUntilThursday = (4 - utcDay + 7) % 7; // 0 on Thursday, 6 on Friday
  const deadline = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilThursday,
    23, 59, 59, 0
  ));

  const msRemaining = deadline.getTime() - now.getTime();

  // Urgency thresholds
  const hoursRemaining = msRemaining / (1000 * 60 * 60);
  const urgency: 'none' | 'warning' | 'critical' =
    hoursRemaining > 48 ? 'none'
    : hoursRemaining > 24 ? 'warning'
    : 'critical';

  // Label format
  const totalMinutes = Math.floor(msRemaining / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  const remainingMinutes = totalMinutes % 60;

  let label: string;
  if (days > 0) {
    label = `${days}d ${remainingHours}h left`;
  } else if (totalHours > 0) {
    label = `${totalHours}h ${remainingMinutes}m left`;
  } else {
    label = `${totalMinutes}m left`;
  }

  return { msRemaining, label, urgency };
}

// ─── computePacingSignal ──────────────────────────────────────────────────────

/**
 * Returns intra-week pacing signal: how many hours/day are needed to hit the goal.
 *
 * - daysRemaining: Mon=4, Tue=3, Wed=2, Thu=1 (working days left including today)
 * - Weekend (Fri/Sat/Sun): returns null
 * - hoursWorked >= weeklyLimit: returns { label: "Target met", hoursPerDayNeeded: 0 }
 * - Otherwise: hoursPerDayNeeded = (weeklyLimit - hoursWorked) / daysRemaining
 */
export function computePacingSignal(
  hoursWorked: number,
  weeklyLimit: number,
  now = new Date(),
): {
  hoursPerDayNeeded: number;
  label: string;
} | null {
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

  // Map UTC day to daysRemaining (Mon=4, Tue=3, Wed=2, Thu=1; weekend=null)
  const DAY_TO_REMAINING: Record<number, number | null> = {
    1: 4, // Monday
    2: 3, // Tuesday
    3: 2, // Wednesday
    4: 1, // Thursday
    5: null, // Friday
    6: null, // Saturday
    0: null, // Sunday
  };

  const daysRemaining = DAY_TO_REMAINING[utcDay];
  if (daysRemaining === null || daysRemaining === undefined) return null;

  if (hoursWorked >= weeklyLimit) {
    return { hoursPerDayNeeded: 0, label: 'Target met' };
  }

  const hoursPerDayNeeded = (weeklyLimit - hoursWorked) / daysRemaining;
  const label = `${hoursPerDayNeeded.toFixed(1)}h/day needed`;

  return { hoursPerDayNeeded, label };
}

// ─── computeHoursVariance ─────────────────────────────────────────────────────

export interface HoursVarianceResult {
  stdDev: number;
  label: string;       // 'Consistent' | '±X.Xh/week' | 'Variable'
  isConsistent: boolean; // stdDev <= 2
}

/**
 * Computes the population standard deviation of weekly hours, excluding the
 * last entry (current partial week) and any zero values.
 *
 * Returns null if fewer than 3 non-zero completed entries are available.
 *
 * Label thresholds:
 *   stdDev <= 1 → 'Consistent'
 *   stdDev <= 3 → '±X.Xh/week'
 *   else        → 'Variable'
 *
 * isConsistent: stdDev <= 2
 */
export function computeHoursVariance(hours: number[]): HoursVarianceResult | null {
  // Exclude last entry (current partial week), then filter zeros
  const completed = hours.slice(0, -1).filter((h) => h > 0);

  if (completed.length < 3) return null;

  const mean = completed.reduce((sum, h) => sum + h, 0) / completed.length;
  const variance = completed.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) / completed.length;
  const stdDev = Math.sqrt(variance);

  let label: string;
  if (stdDev <= 1) {
    label = 'Consistent';
  } else if (stdDev <= 3) {
    label = `\u00B1${stdDev.toFixed(1)}h/week`;
  } else {
    label = 'Variable';
  }

  return {
    stdDev,
    label,
    isConsistent: stdDev <= 2,
  };
}
