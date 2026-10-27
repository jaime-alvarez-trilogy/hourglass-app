// FR1: Business logic — calculateHours, date utilities
// Pure functions with no side effects. Fully testable.
// getWeekLabels added for 07-overview-sync FR2.
// computeHoursVariance added for 03-hours-variance.
// 1.2 WorkSmart dashboard parity: calculateHours takes the hours overview (optional). The
// displayed hours stay on the local-week timesheet; for the current UTC week the overview
// adds the real weekly limit, the per-day manual/pending split and the UTC pay-week
// breakdown.

import {
  cappedBillableMinutes,
  isHourlyKind,
  localDateOfUtcWallTime,
  selectedOverviewWeek,
  utcWeekStart,
  type HoursOverview,
} from './hoursOverview';

export type UrgencyLevel = 'none' | 'low' | 'high' | 'critical' | 'expired';

export interface DailyEntry {
  date: string;      // YYYY-MM-DD
  hours: number;
  isToday: boolean;
  /** Approved manual hours of this local day, included in `hours` (hours overview only) */
  manualHours?: number;
  /** Manual hours of this local day waiting for approval, NOT in `hours` (hours overview only) */
  pendingHours?: number;
}

/**
 * The current UTC pay week's minute buckets from the hours overview (1.2): Mon–Sun UTC,
 * which is what payments count, not the local week the displayed hours follow. All values
 * are minutes. `billable` = tracked + manualApproved, uncapped; `cappedBillable` is what
 * counts toward pay (min(billable, limit + approved OT) for hourly contracts).
 */
export interface WeekBreakdown {
  weekStart: string;
  tracked: number;
  idle: number;
  manualApproved: number;
  manualPending: number;
  manualRejected: number;
  disputed: number;
  billable: number;
  cappedBillable: number;
  limitMinutes: number;
  approvedOvertime: number;
  isHourly: boolean;
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
  /** Weekly limit in hours used for this week's numbers (the overview's, when known) */
  weeklyLimit?: number;
  /** The UTC pay week's buckets, present when the hours overview is known (1.2) */
  breakdown?: WeekBreakdown;
}

/**
 * One row of GET /api/timetracking/timesheets: the user's LOCAL Mon–Sun week. `stats` has
 * one entry per local day (dated "2026-10-19T00:00:00.000Z", but the Z date names the
 * local day). totalHours is uncapped and includes approved manual time, not pending.
 */
export interface TimesheetResponse {
  totalHours?: number;
  hourWorked?: number;
  manualHourWorked?: number | string; // approved manual/logbook hours (pending not included)
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
 * PACE-CHECK ONLY — this is NOT the hard deadline. The Crossover hours week is
 * Mon–Sun, so the real cutoff to log hours is Sunday 23:59:59 UTC; use
 * getSundayMidnightGMT for the deadline. Retained for the Thursday mid-week
 * pace-check reminder and its unit tests.
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

// ─── formatWeekStartLabel ─────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a YYYY-MM-DD Monday date string as "MMM D" (e.g. "Apr 7").
 * Uses local timezone — parses without a Z suffix to avoid UTC offset shifts.
 * Shared by getWeekLabels and computeAIInsights (via aiInsights.ts).
 */
export function formatWeekStartLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
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
 * - total (hours displayed): timesheet.totalHours (else hourWorked) whenever there is a
 *   timesheet. Displayed hours follow the user's LOCAL Mon–Sun week, like WorkSmart's
 *   time tracker, and the timesheet is that week: uncapped (real overtime shows) and
 *   including approved manual time. Payments are on the UTC pay week, so they never
 *   stand in for it: with no timesheet at all the displayed hours are 0 (and
 *   hoursRemaining the full limit), whatever the payments row says
 * - weeklyEarnings (payments, UTC): derived from paidHours specifically (approved/
 *   compensated hours only), NOT from the displayed total — working overtime doesn't
 *   guarantee it's paid, so earnings must never inflate off hours Crossover hasn't
 *   approved yet. Without paidHours: workedHours, else the timesheet total
 * - today / daily / isToday: matched by local YYYY-MM-DD date string from stats array
 * - overview (1.2, optional): for the current UTC week the hours overview adds the
 *   weekly limit, the per-day manual/pending split and the UTC pay-week breakdown; it
 *   never replaces the local hours (its days are UTC) — see applyHoursOverview
 */
export function calculateHours(
  timesheetData: TimesheetResponse | null | undefined,
  paymentsData: PaymentsResponse | null | undefined,
  hourlyRate: number,
  weeklyLimit: number,
  overview?: HoursOverview | null,
): HoursData {
  const base = calculateHoursFromTimesheet(timesheetData, paymentsData, hourlyRate, weeklyLimit);
  return overview ? applyHoursOverview(base, overview, paymentsData, hourlyRate) : base;
}

/**
 * Overlays the hours overview on a timesheet-based result, for the current UTC week
 * only (a persisted overview from last week is ignored). The overview has no time-zone
 * parameter (its days and weeks are UTC), so it never replaces the displayed hours:
 * total, today, daily hours, average and todayEarnings stay on the local timesheet.
 * From the overview:
 * - weeklyLimit (its limit when known); hoursRemaining / overtimeHours are the local
 *   total against it
 * - per-day manualHours / pendingHours: APPROVED / PENDING manual entries, each filed
 *   under the local date its start falls on (REJECTED ignored)
 * - breakdown: the UTC pay week's minute buckets
 * - weeklyEarnings (payments): the payments row's paidHours when there is one, else
 *   (hourly contracts only) the capped billable time
 */
export function applyHoursOverview(
  base: HoursData,
  overview: HoursOverview,
  paymentsData: PaymentsResponse | null | undefined,
  hourlyRate: number,
  now: Date = new Date(),
): HoursData {
  if (overview.weekStart !== utcWeekStart(now)) return base;
  const week = selectedOverviewWeek(overview);
  // selectedOverviewWeek falls back to the newest row; an older week's total must never
  // read as this week's
  if (!week || week.weekStart !== overview.weekStart) return base;

  const limit = overview.limitHours > 0 ? overview.limitHours : (base.weeklyLimit ?? 40);

  // Manual minutes by the local date of their start. The overview lists this and last UTC
  // week's entries, which covers every day of the local week.
  const approvedByDate = new Map<string, number>();
  const pendingByDate = new Map<string, number>();
  for (const e of overview.manualEntries) {
    const byDate =
      e.status === 'APPROVED' ? approvedByDate : e.status === 'PENDING' ? pendingByDate : null;
    const date = byDate ? localDateOfUtcWallTime(e.start) : null;
    if (byDate && date) byDate.set(date, (byDate.get(date) ?? 0) + e.durationMinutes);
  }
  const daily: DailyEntry[] = base.daily.map((d) => ({
    ...d,
    manualHours: (approvedByDate.get(d.date) ?? 0) / 60,
    pendingHours: (pendingByDate.get(d.date) ?? 0) / 60,
  }));

  const cappedBillable = cappedBillableMinutes(
    { billable: week.billable, limitHours: limit, approvedOvertime: week.approvedOvertime },
    overview.kind,
  );
  const paidHours = paymentsData?.paidHours ?? 0;
  // NOT_PAID / FIXED: no per-hour pay to derive, so keep the base figure
  const weeklyEarnings =
    paidHours > 0 || !isHourlyKind(overview.kind)
      ? base.weeklyEarnings
      : (cappedBillable / 60) * hourlyRate;

  return {
    ...base,
    daily,
    weeklyEarnings,
    hoursRemaining: Math.max(0, limit - base.total),
    overtimeHours: Math.max(0, base.total - limit),
    weeklyLimit: limit,
    breakdown: {
      weekStart: week.weekStart,
      tracked: week.tracked,
      idle: week.idle,
      manualApproved: week.manualApproved,
      manualPending: week.manualPending,
      manualRejected: week.manualRejected,
      disputed: week.disputed,
      billable: week.billable,
      cappedBillable,
      limitMinutes: limit * 60,
      approvedOvertime: week.approvedOvertime,
      isHourly: isHourlyKind(overview.kind),
    },
  };
}

function calculateHoursFromTimesheet(
  timesheetData: TimesheetResponse | null | undefined,
  paymentsData: PaymentsResponse | null | undefined,
  hourlyRate: number,
  weeklyLimit: number
): HoursData {
  // Hard deadline is Sunday 23:59:59 UTC — the Crossover hours week closes
  // Mon–Sun (05-sunday-gmt-deadline). NOT Thursday (getThursdayDeadlineGMT is
  // pace-check only).
  const deadline = getSundayMidnightGMT();
  const now = Date.now();
  const timeRemaining = deadline.getTime() - now;
  const limit = weeklyLimit || 40;

  // paidHours = approved/compensated hours (regular + approved OT) — this is what
  // Crossover will actually pay out. workedHours = raw tracked time, uncapped, and
  // can exceed paidHours when overtime has been worked but not yet approved in
  // payroll. Both are for the UTC pay week (payments), not the local week.
  const paidHours = paymentsData?.paidHours ?? 0;
  const workedHoursRaw = paymentsData?.workedHours ?? 0;

  // Handle null/missing timesheet: no local-week figure, so the displayed hours stay at
  // zero. The payments row is the UTC pay week and never stands in for them; only the
  // earnings (payments) still come from it. No per-day data without a timesheet.
  if (!timesheetData) {
    return {
      total: 0,
      average: 0,
      today: 0,
      daily: [],
      weeklyEarnings: (paidHours > 0 ? paidHours : workedHoursRaw) * hourlyRate,
      todayEarnings: 0,
      hoursRemaining: limit,
      overtimeHours: 0,
      timeRemaining,
      deadline,
      weeklyLimit: limit,
    };
  }

  // Extract timesheet values. The timesheet is the user's LOCAL Mon–Sun week, uncapped
  // and including approved manual time — what WorkSmart's time tracker shows — so its
  // total is the displayed total, whatever the payments row says.
  const total = parseFloat(
    String(timesheetData.totalHours ?? timesheetData.hourWorked ?? 0)
  );
  const averageHours = parseFloat(String(timesheetData.averageHoursPerDay ?? 0));
  const stats = timesheetData.stats ?? [];

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

  // Earnings are payments (UTC pay week) and tied to paidHours specifically, NOT the
  // displayed `total` — working overtime doesn't guarantee it's compensated, so
  // weeklyEarnings must never inflate off hours Crossover hasn't approved yet. Without
  // paidHours they fall back to workedHours, and to the timesheet `total` only when
  // payments data is missing entirely (paidHours and workedHours both 0).
  const earningsBasis = paidHours > 0 ? paidHours : workedHoursRaw > 0 ? workedHoursRaw : total;
  const weeklyEarnings = earningsBasis * hourlyRate;
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
    weeklyLimit: limit,
  };
}

// getWeekLabels is defined above (added by 05-earnings-scrub, reused by 07-overview-sync)

// ─── computeDeadlineCountdown ─────────────────────────────────────────────────

/**
 * Returns time remaining until the Crossover hours deadline (Sunday 23:59:59 UTC).
 * The hours week is Mon–Sun, so the cutoff is this week's Sunday (end of today
 * when called on a Sunday; never jumps to next week).
 *
 * - urgency: 'none' (>48h), 'warning' (24–48h), 'critical' (<24h)
 * - label: "2d 14h left" | "23h 45m left" | "45m left"
 */
export function computeDeadlineCountdown(now = new Date()): {
  msRemaining: number;
  label: string;
  urgency: 'none' | 'warning' | 'critical';
} {
  // Sunday (UTC day 0) closes the Crossover hours week.
  const utcDay = now.getUTCDay(); // 0 = Sunday
  const daysUntilSunday = (0 - utcDay + 7) % 7; // 0 on Sunday, 6 on Monday
  const deadline = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilSunday,
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
