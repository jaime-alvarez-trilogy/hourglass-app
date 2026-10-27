// hoursOverview.ts — 1.2 WorkSmart dashboard parity: types + defensive parsers for
//   GET /api/v3/assignments/{assignmentId}/hours-overview?date=YYYY-MM-DD
//   GET /api/v3/users/current/pay-days
//
// Both endpoints were found in the WorkSmart web dashboard bundle and confirmed live on
// 2026-10-25 (prod, contributor account). Every quantity is in MINUTES. Keys whose value
// is zero or null are sometimes omitted (`idle` on older weeks, `rejectionReason` on
// non-rejected entries), so every number defaults to 0 and every string to null.
// Weeks are Mon–Sun UTC. manualEntries `start`/`end` are UTC wall times with no offset
// ("2026-10-25T13:10"); localDateOfUtcWallTime files one under the device's local day.
//
// Pure module: no app imports, no side effects.

export type OverviewKind = 'HOURLY_PAYONEER' | 'HOURLY_PAYCHEX' | 'FIXED' | 'NOT_PAID' | string;
export type OverviewEntryStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Minute buckets shared by a week and a day. */
export interface OverviewBuckets {
  /** Auto-tracked minutes counted as billable (idle excluded) */
  tracked: number;
  /** Idle minutes — tracked but not billable */
  idle: number;
  manualApproved: number;
  manualPending: number;
  manualRejected: number;
  disputed: number;
  /** tracked + manualApproved, UNCAPPED (can exceed the weekly limit) */
  billable: number;
}

export interface OverviewWeek extends OverviewBuckets {
  /** YYYY-MM-DD Monday (UTC) */
  weekStart: string;
  /** Minutes of overtime approved for this week */
  approvedOvertime: number;
  limitHours: number;
  /** True for weeks before the assignment started */
  beforeStart: boolean;
}

export interface OverviewDay extends OverviewBuckets {
  /** YYYY-MM-DD (UTC) */
  date: string;
  future: boolean;
}

export interface OverviewManualEntry {
  /** UTC wall time "YYYY-MM-DDTHH:mm" (no offset) */
  start: string;
  end: string;
  durationMinutes: number;
  description: string;
  status: OverviewEntryStatus;
  rejectionReason: string | null;
  /** True when the entry belongs to the requested week, false for the week before */
  selectedWeek: boolean;
}

export interface OverviewOvertimeRequest {
  weekStart: string;
  status: string;
  requestedMinutes: number;
  grantedMinutes: number;
}

export interface HoursOverview {
  kind: OverviewKind;
  salaryUnit: string | null;
  paymentPlatform: string | null;
  limitHours: number;
  limitType: string | null;
  /** Monday (UTC) of the requested week */
  weekStart: string;
  /** Server's UTC date when the response was built */
  today: string | null;
  startDate: string | null;
  /** ~8 weeks, oldest → newest; the last one is the requested week */
  weeks: OverviewWeek[];
  /** The 7 days of the requested week, Mon → Sun */
  days: OverviewDay[];
  /** Manual entries of the requested week and the week before, newest first */
  manualEntries: OverviewManualEntry[];
  overtimeRequests: OverviewOvertimeRequest[];
}

export type PayDayState = 'PAID' | 'NEXT' | 'LATER' | 'LATE' | 'NO_PAY' | string;
export type PayDayAmountKind = 'FINAL' | 'ESTIMATE' | 'SO_FAR' | 'NONE' | string;

export interface PayDayCard {
  /** YYYY-MM-DD */
  payDate: string;
  dueDate: string | null;
  state: PayDayState;
  /** Work week the card pays for, YYYY-MM-DD Mon → Sun */
  weekStart: string;
  weekEnd: string;
  amount: number | null;
  amountKind: PayDayAmountKind;
  platform: string | null;
  salaryUnit: string | null;
  noPayReason: string | null;
  thisWeek: boolean;
  nextWeek: boolean;
}

export interface PayDays {
  today: string | null;
  cards: PayDayCard[];
}

// ─── Field readers ────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** YYYY-MM-DD from a date or ISO string, or null. */
function day(v: unknown): string | null {
  return typeof v === 'string' && DATE_RE.test(v) ? v.slice(0, 10) : null;
}

function buckets(r: Record<string, unknown>): OverviewBuckets {
  return {
    tracked: num(r.tracked),
    idle: num(r.idle),
    manualApproved: num(r.manualApproved),
    manualPending: num(r.manualPending),
    manualRejected: num(r.manualRejected),
    disputed: num(r.disputed),
    billable: num(r.billable),
  };
}

const ENTRY_STATUSES: readonly string[] = ['PENDING', 'APPROVED', 'REJECTED'];

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parses a raw hours-overview body. Returns null when the body is not an object or has
 * no usable `weekStart` — the caller treats that as a failed request, never as 0 h.
 * Malformed list items are dropped; missing numbers read as 0.
 */
export function normalizeHoursOverview(raw: unknown): HoursOverview | null {
  if (!isRecord(raw)) return null;
  const weekStart = day(raw.weekStart);
  if (!weekStart) return null;

  const weeks: OverviewWeek[] = [];
  for (const w of Array.isArray(raw.weeks) ? raw.weeks : []) {
    if (!isRecord(w)) continue;
    const ws = day(w.weekStart);
    if (!ws) continue;
    weeks.push({
      ...buckets(w),
      weekStart: ws,
      approvedOvertime: num(w.approvedOvertime),
      limitHours: num(w.limitHours),
      beforeStart: w.beforeStart === true,
    });
  }
  weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const days: OverviewDay[] = [];
  for (const d of Array.isArray(raw.days) ? raw.days : []) {
    if (!isRecord(d)) continue;
    const date = day(d.date);
    if (!date) continue;
    days.push({ ...buckets(d), date, future: d.future === true });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const manualEntries: OverviewManualEntry[] = [];
  for (const e of Array.isArray(raw.manualEntries) ? raw.manualEntries : []) {
    if (!isRecord(e)) continue;
    const start = typeof e.start === 'string' && DATE_RE.test(e.start) ? e.start : null;
    const status = typeof e.status === 'string' ? e.status.toUpperCase() : '';
    if (!start || !ENTRY_STATUSES.includes(status)) continue;
    manualEntries.push({
      start,
      end: typeof e.end === 'string' ? e.end : start,
      durationMinutes: num(e.durationMinutes),
      description: typeof e.description === 'string' ? e.description : '',
      status: status as OverviewEntryStatus,
      rejectionReason: str(e.rejectionReason),
      selectedWeek: e.selectedWeek === true,
    });
  }

  const overtimeRequests: OverviewOvertimeRequest[] = [];
  for (const o of Array.isArray(raw.overtimeRequests) ? raw.overtimeRequests : []) {
    if (!isRecord(o)) continue;
    const ws = day(o.weekStart);
    if (!ws) continue;
    overtimeRequests.push({
      weekStart: ws,
      status: typeof o.status === 'string' ? o.status : 'UNKNOWN',
      requestedMinutes: num(o.requestedMinutes),
      grantedMinutes: num(o.grantedMinutes),
    });
  }

  return {
    kind: typeof raw.kind === 'string' ? raw.kind : 'UNKNOWN',
    salaryUnit: str(raw.salaryUnit),
    paymentPlatform: str(raw.paymentPlatform),
    limitHours: num(raw.limitHours),
    limitType: str(raw.limitType),
    weekStart,
    today: day(raw.today),
    startDate: day(raw.startDate),
    weeks,
    days,
    manualEntries,
    overtimeRequests,
  };
}

/**
 * Parses a raw pay-days body. Returns null when the body is not an object with a
 * `cards` array. Cards without a pay date or work week are dropped.
 */
export function normalizePayDays(raw: unknown): PayDays | null {
  if (!isRecord(raw) || !Array.isArray(raw.cards)) return null;
  const cards: PayDayCard[] = [];
  for (const c of raw.cards) {
    if (!isRecord(c)) continue;
    const payDate = day(c.payDate) ?? day(c.dueDate);
    const weekStart = day(c.weekStart);
    const weekEnd = day(c.weekEnd);
    if (!payDate || !weekStart || !weekEnd) continue;
    cards.push({
      payDate,
      dueDate: day(c.dueDate),
      state: typeof c.state === 'string' ? c.state : 'UNKNOWN',
      weekStart,
      weekEnd,
      amount: numOrNull(c.amount),
      amountKind: typeof c.amountKind === 'string' ? c.amountKind : 'NONE',
      platform: str(c.platform),
      salaryUnit: str(c.salaryUnit),
      noPayReason: str(c.noPayReason),
      thisWeek: c.thisWeek === true,
      nextWeek: c.nextWeek === true,
    });
  }
  return { today: day(raw.today), cards };
}

// ─── Derived values ───────────────────────────────────────────────────────────

/** True for the hourly kinds, where billable time is capped at the limit + approved OT. */
export function isHourlyKind(kind: OverviewKind): boolean {
  return typeof kind === 'string' && kind.startsWith('HOURLY');
}

/** The requested week's row (matched by weekStart), else the newest week, else null. */
export function selectedOverviewWeek(o: HoursOverview): OverviewWeek | null {
  return o.weeks.find((w) => w.weekStart === o.weekStart) ?? o.weeks[o.weeks.length - 1] ?? null;
}

/**
 * Billable minutes that count toward pay: min(billable, limit + approved OT) for hourly
 * kinds, uncapped otherwise. A zero limit means "no limit known" and never caps.
 */
export function cappedBillableMinutes(
  week: Pick<OverviewWeek, 'billable' | 'limitHours' | 'approvedOvertime'>,
  kind: OverviewKind,
): number {
  if (!isHourlyKind(kind) || week.limitHours <= 0) return week.billable;
  return Math.min(week.billable, week.limitHours * 60 + week.approvedOvertime);
}

/**
 * Formats minutes the way the WorkSmart dashboard does, compactly: "38h 50m", "40h",
 * "50m", "0". Rounds to the nearest minute; negative input reads as 0.
 */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  if (m === 0) return '0';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

/** Today's UTC date as YYYY-MM-DD. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Monday (UTC) of the week containing `now`, as YYYY-MM-DD. */
export function utcWeekStart(now: Date = new Date()): string {
  const dow = now.getUTCDay(); // 0=Sun
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back),
  ).toISOString().slice(0, 10);
}

// "YYYY-MM-DDTHH:mm", optional seconds / fraction, optional trailing Z (no other offset)
const UTC_WALL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z?$/;

/**
 * The device-local date (YYYY-MM-DD) of a UTC wall time with no offset, such as a manual
 * entry's `start`: "2026-10-26T03:00" is 2026-10-26 in UTC+2 but 2026-10-25 in UTC-6.
 * Displayed hours follow the local day, while the overview files entries under UTC days.
 * Null when `start` has no time of day, carries an offset, or has out-of-range fields.
 */
export function localDateOfUtcWallTime(start: string): string | null {
  const m = typeof start === 'string' ? UTC_WALL_TIME_RE.exec(start) : null;
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((p) => (p === undefined ? 0 : Number(p)));
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Date.UTC rolls out-of-range fields over (2026-02-30, 24:10); those are not times
  if (
    t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d ||
    t.getUTCHours() !== h || t.getUTCMinutes() !== mi || t.getUTCSeconds() !== s
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Adds whole days to a YYYY-MM-DD date (UTC arithmetic). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
