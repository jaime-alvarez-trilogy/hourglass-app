// FR2 (02-requests-store): Pure refresh planner for My Requests
// Decides which work-diary dates can still change and must be re-downloaded, from the
// stored per-day records. No I/O: deterministic given `today` and `nowMs`.
// The date helpers moved here from useMyRequests.ts (one owner for the date math).
// FR1 (05-requests-backfill): planBackfillWeek picks the next older week with missing days.

import { getWeekStartDate } from './approvals';
import type { ManualRequestEntry } from '../types/requests';
import type { StoredRequestDay } from './requestsStore';

// ─── Constants ────────────────────────────────────────────────────────────────

/** A day with a PENDING entry in the 3-week window is re-checked after 15 min. */
export const PENDING_TTL_MS = 15 * 60_000;
/** `yesterday` is re-checked after 60 min (late-logged manual time most often targets it). */
export const RECENT_TTL_MS = 60 * 60_000;
/** An unsettled day older than the 3-week window is re-checked after 6 h. */
export const OLD_UNSETTLED_TTL_MS = 6 * 60 * 60_000;
/** Mirrors WEEKLY_HISTORY_MAX. Defined here so the store can import it without a runtime cycle. */
export const REQUESTS_RETENTION_WEEKS = 24;
/** REQUESTS_RETENTION_WEEKS (24) − the 3 weeks of the catch-up window: the weeks the backfill covers. */
export const BACKFILL_MAX_WEEKS_PER_SESSION = 21;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestWindows {
  today: string;
  /** Monday of today's week. */
  currentMonday: string;
  /** today − 1 day; falls in last week on a Monday. */
  yesterday: string;
  /** Monday 2 weeks before currentMonday: the start of the 3-week window. */
  catchUpStart: string;
  /** Monday (REQUESTS_RETENTION_WEEKS − 1) weeks before currentMonday. */
  retentionStart: string;
}

export type RefreshReason = 'today' | 'forced' | 'pending-ttl' | 'recent-ttl' | 'daily' | 'unsettled-old';

export interface RefreshPlanInput {
  /** Local YYYY-MM-DD. */
  today: string;
  /** Epoch ms. */
  nowMs: number;
  /** Store days, keyed by date ({} when the store is empty or unreadable). */
  days: Record<string, StoredRequestDay>;
  /** One-shot forced refresh (pull-to-refresh / Retry). */
  force: boolean;
}

export interface RefreshPlan {
  /** Dates to fetch, newest first, unique. */
  dates: string[];
  /** One reason per date in `dates`. */
  reasons: Record<string, RefreshReason>;
}

export interface BackfillWeek {
  /** A Monday in [retentionStart, catchUpStart). */
  monday: string;
  /** Dates in monday..monday+6, < catchUpStart, with no record in the store; ascending. */
  dates: string[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD of `d` in the local timezone (never UTC). */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Returns YYYY-MM-DD for today in the local timezone. */
export function todayLocal(): string {
  return formatLocalDate(new Date());
}

/** Local noon of a YYYY-MM-DD date. The noon anchor keeps DST transitions out of day math. */
function atNoon(date: string): Date {
  return new Date(date + 'T12:00:00');
}

/** Returns YYYY-MM-DD for the day `n` days after `date` (negative `n` goes back). */
export function addDays(date: string, n: number): string {
  const d = atNoon(date);
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
}

/** Returns all dates from `start` through `end` inclusive, ascending; [] when start > end. */
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) {
    dates.push(cur);
  }
  return dates;
}

/** Returns the local YYYY-MM-DD of an ISO timestamp, or null if it does not parse. */
export function localDateOf(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : formatLocalDate(new Date(ms));
}

// ─── Windows and settling ─────────────────────────────────────────────────────

export function requestWindows(today: string): RequestWindows {
  const currentMonday = getWeekStartDate(atNoon(today));
  return {
    today,
    currentMonday,
    yesterday: addDays(today, -1),
    catchUpStart: addDays(currentMonday, -14),
    retentionStart: addDays(currentMonday, -7 * (REQUESTS_RETENTION_WEEKS - 1)),
  };
}

/**
 * The local Tuesday after the Mon-Sun week containing `date`. Local Tuesday 00:00 is
 * later than the week's Sunday 23:59:59 UTC timecard deadline in every time zone.
 */
export function tuesdayAfter(date: string): string {
  return addDays(getWeekStartDate(atNoon(date)), 8);
}

/**
 * A day is settled (final) when it has no PENDING entry and was fetched on or after
 * its tuesdayAfter, i.e. after the week's deadline. Current-week days are never settled.
 */
export function isDaySettled(date: string, entries: ManualRequestEntry[], fetchDay: string): boolean {
  return entries.every((e) => e.status !== 'PENDING') && fetchDay >= tuesdayAfter(date);
}

// ─── planRequestRefresh ───────────────────────────────────────────────────────

/**
 * Plans which dates in retentionStart..today to fetch. Each date gets the first
 * reason that applies (research Decision 3); settled days are only re-checked by
 * `force`, and only inside the 3-week window. A missing older day is left to the
 * backfill (spec 05).
 *
 * An unparseable `fetchedAt` counts as never fetched (no fetch day, age ∞); a
 * future `fetchedAt` (clock skew) counts as fresh for every rule.
 */
export function planRequestRefresh({ today, nowMs, days, force }: RefreshPlanInput): RefreshPlan {
  const { currentMonday, yesterday, catchUpStart, retentionStart } = requestWindows(today);

  const reasonFor = (date: string): RefreshReason | null => {
    if (date === today) return 'today';
    if (force && date >= catchUpStart) return 'forced';

    const rec: StoredRequestDay | undefined = days[date];
    const fetchedMs = rec ? Date.parse(rec.fetchedAt) : NaN;
    const age = Number.isNaN(fetchedMs) ? Infinity : nowMs - fetchedMs;
    const fetchDay = rec ? localDateOf(rec.fetchedAt) : null;
    const notFetchedToday = fetchDay === null || fetchDay < today;

    if (date >= catchUpStart) {
      if (rec && age >= PENDING_TTL_MS && rec.entries.some((e) => e.status === 'PENDING')) {
        return 'pending-ttl';
      }
      if (date === yesterday && rec && age >= RECENT_TTL_MS) return 'recent-ttl';
      if (date >= currentMonday) return notFetchedToday ? 'daily' : null;
      return (!rec || !rec.settled) && notFetchedToday ? 'daily' : null;
    }

    return rec && !rec.settled && age >= OLD_UNSETTLED_TTL_MS ? 'unsettled-old' : null;
  };

  const dates: string[] = [];
  const reasons: Record<string, RefreshReason> = {};
  const range = dateRange(retentionStart, today);
  for (let i = range.length - 1; i >= 0; i--) {
    const reason = reasonFor(range[i]);
    if (reason) {
      dates.push(range[i]);
      reasons[range[i]] = reason;
    }
  }
  return { dates, reasons };
}

// ─── planBackfillWeek ─────────────────────────────────────────────────────────

/**
 * Plans the next backfill week (spec 05): the newest Monday in [retentionStart,
 * catchUpStart), not in `skip`, with at least one date that has no record, and exactly
 * those dates. Null when there is none. Resumable from the data alone: a date without a
 * key in `days` is the only thing it plans. Only generated dates are looked up, so
 * non-date store keys are ignored.
 */
export function planBackfillWeek(
  days: Record<string, StoredRequestDay>,
  today: string,
  skip?: ReadonlySet<string>,
): BackfillWeek | null {
  const { catchUpStart, retentionStart } = requestWindows(today);
  for (let monday = addDays(catchUpStart, -7); monday >= retentionStart; monday = addDays(monday, -7)) {
    if (skip?.has(monday)) continue;
    const dates = dateRange(monday, addDays(monday, 6)).filter(
      (d) => d < catchUpStart && !Object.prototype.hasOwnProperty.call(days, d),
    );
    if (dates.length > 0) return { monday, dates };
  }
  return null;
}
