// FR1 (durable-data 04-requests-history-ui): Pure My Requests row builder
// Three bounded recent buckets ("This Week", "Last Week", "2 Weeks Ago"), then everything
// older behind one toggle row. Expanded, the older entries are grouped by month, newest
// month first, with malformed dates under "Other dates" last. No I/O and no clock: the
// screen passes the week bounds and the toggle state.
// FR2: the My Requests copy. The quiet freshness note over visible entries, the no-data
// banner, whether Retry is offered, and the empty state. The 'auth' copy stays neutral
// about the cause; only NO_CREDENTIALS gets its own text, because Retry cannot fix it.

import { NO_CREDENTIALS } from '../api/errors';
import type { ManualRequestEntry, UseMyRequestsResult } from '../types/requests';

type RequestsError = UseMyRequestsResult['error'];

// ─── Types ────────────────────────────────────────────────────────────────────

export type MyRequestRow =
  | { type: 'header'; label: string }
  | { type: 'entry'; entry: ManualRequestEntry }
  | { type: 'older-toggle'; count: number; expanded: boolean };

export interface RequestRowBounds {
  /** Monday of the current week (local YYYY-MM-DD). */
  currentMonday: string;
  /** Monday 7 days before currentMonday. */
  prevMonday1: string;
  /** Monday 14 days before currentMonday: the inclusive lower bound of "2 Weeks Ago". */
  prevMonday2: string;
}

// ─── Month labels ─────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Fixed English names, not Intl: Hermes and jest give the same output (C11).
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const OTHER_DATES = 'Other dates';

function isDateString(date: unknown): date is string {
  return typeof date === 'string' && DATE_RE.test(date);
}

/**
 * '2026-09-14' → 'September 2026'. Read from the string itself (never `new Date`, which
 * parses YYYY-MM-DD as UTC and can shift the month). Malformed input → 'Other dates'.
 */
export function monthLabel(date: string): string {
  if (!isDateString(date)) return OTHER_DATES;
  const name = MONTH_NAMES[Number(date.slice(5, 7)) - 1];
  return name ? `${name} ${date.slice(0, 4)}` : OTHER_DATES;
}

// ─── FR1: buildMyRequestRows ──────────────────────────────────────────────────

/**
 * Builds the My Requests rows from entries already sorted by date descending.
 *
 * A YYYY-MM-DD date goes into "This Week" (>= currentMonday), "Last Week"
 * (>= prevMonday1) or "2 Weeks Ago" (>= prevMonday2). Anything earlier, and every
 * malformed date, is older: counted by one `older-toggle` row after the buckets, and
 * listed under month headers only when `olderExpanded`. Empty groups are omitted, and
 * entries keep their input order inside a group.
 */
export function buildMyRequestRows(
  entries: readonly ManualRequestEntry[],
  bounds: RequestRowBounds,
  olderExpanded: boolean,
): MyRequestRow[] {
  const { currentMonday, prevMonday1, prevMonday2 } = bounds;
  const buckets: { label: string; entries: ManualRequestEntry[] }[] = [
    { label: 'This Week', entries: [] },
    { label: 'Last Week', entries: [] },
    { label: '2 Weeks Ago', entries: [] },
  ];
  const older: ManualRequestEntry[] = [];

  for (const entry of entries) {
    const { date } = entry;
    // Checked first: a malformed string can compare >= currentMonday (C11).
    if (!isDateString(date) || date < prevMonday2) older.push(entry);
    else if (date >= currentMonday) buckets[0].entries.push(entry);
    else if (date >= prevMonday1) buckets[1].entries.push(entry);
    else buckets[2].entries.push(entry);
  }

  const rows: MyRequestRow[] = [];
  const pushGroup = (label: string, group: ManualRequestEntry[]) => {
    if (group.length === 0) return;
    rows.push({ type: 'header', label });
    for (const entry of group) rows.push({ type: 'entry', entry });
  };

  for (const bucket of buckets) pushGroup(bucket.label, bucket.entries);

  if (older.length === 0) return rows;
  rows.push({ type: 'older-toggle', count: older.length, expanded: olderExpanded });
  if (!olderExpanded) return rows;

  // Group by YYYY-MM key and sort the keys, so an out-of-order merge still lists months
  // newest first (C12). A date whose month has no name joins "Other dates".
  const months = new Map<string, ManualRequestEntry[]>();
  const otherDates: ManualRequestEntry[] = [];
  for (const entry of older) {
    if (monthLabel(entry.date) === OTHER_DATES) {
      otherDates.push(entry);
      continue;
    }
    const key = entry.date.slice(0, 7);
    const group = months.get(key);
    if (group) group.push(entry);
    else months.set(key, [entry]);
  }

  const monthGroups = [...months.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
  for (const [key, group] of monthGroups) pushGroup(monthLabel(`${key}-01`), group);
  pushGroup(OTHER_DATES, otherDates);

  return rows;
}

// ─── FR2: formatUpdatedAgo ────────────────────────────────────────────────────

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Local noon of the calendar day holding `ms`. The noon anchor keeps DST out of day math. */
function localNoon(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
}

/**
 * How long before `nowMs` (never the system clock) `iso` was: 'just now' under a minute,
 * a future time included; then 'N min ago' and 'N h ago', floored; from 24 h on, calendar
 * days between the local dates ('yesterday', 'N days ago'). Null, undefined or unparseable
 * → '', so the caller drops its " · updated …" suffix.
 */
export function formatUpdatedAgo(iso: string | null | undefined, nowMs: number): string {
  if (typeof iso !== 'string') return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  const ageMs = nowMs - then;
  if (ageMs < MINUTE_MS) return 'just now';
  if (ageMs < HOUR_MS) return `${Math.floor(ageMs / MINUTE_MS)} min ago`;

  const days = Math.round((localNoon(nowMs) - localNoon(then)) / DAY_MS);
  // days < 1 past 24 h only on a 25 h fall-back day: still the same date, so stay in hours.
  if (ageMs < DAY_MS || days < 1) return `${Math.floor(ageMs / HOUR_MS)} h ago`;
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// ─── FR2: note, banner, Retry and empty state ─────────────────────────────────

export interface FreshnessNoteArgs {
  hasEntries: boolean;
  error: RequestsError;
  errorCode: string | null;
  staleDates: readonly string[];
  updatedAt: string | null;
  nowMs: number;
}

/**
 * The quiet line under "My Requests" while entries are visible, or null when there is
 * nothing to say (no entries, or a clean refresh). An error wins over stale dates, and
 * errorCode only matters for 'auth'.
 */
export function freshnessNote({
  hasEntries,
  error,
  errorCode,
  staleDates,
  updatedAt,
  nowMs,
}: FreshnessNoteArgs): string | null {
  if (!hasEntries) return null;
  const ago = formatUpdatedAgo(updatedAt, nowMs);
  const upd = ago ? ` · updated ${ago}` : '';

  if (error === 'network') return `Showing saved requests${upd}`;
  if (error === 'auth') {
    return errorCode === NO_CREDENTIALS
      ? 'Saved sign-in missing · showing saved requests · sign out and back in from Settings'
      : `Can't sign in to Crossover right now · showing saved requests${upd}`;
  }
  if (staleDates.length > 0) return `Some days couldn't refresh${upd}`;
  return null;
}

/** The red banner text when nothing is visible. */
export function requestsBannerText(
  error: NonNullable<RequestsError>,
  errorCode: string | null,
): string {
  if (error === 'network') return 'Could not load requests.';
  return errorCode === NO_CREDENTIALS
    ? 'Your saved sign-in is missing. Sign out and back in from Settings.'
    : "Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings.";
}

/**
 * Whether the note or banner offers Retry: only for an error, and never for 'auth' +
 * NO_CREDENTIALS, where the queryFn throws again before any request is made.
 */
export function requestsErrorRetryable(error: RequestsError, errorCode: string | null): boolean {
  if (!error) return false;
  return !(error === 'auth' && errorCode === NO_CREDENTIALS);
}

export type MyRequestsEmptyState = 'error' | 'incomplete' | 'none';

/**
 * What to show when no entries are visible: the banner alone for an error (C4), the honest
 * incomplete card when some days never refreshed (C3), else "No requests yet".
 */
export function myRequestsEmptyState(
  error: RequestsError,
  staleDates: readonly string[],
): MyRequestsEmptyState {
  if (error) return 'error';
  return staleDates.length > 0 ? 'incomplete' : 'none';
}

/** The empty card text for the 'incomplete' state (C3). */
export const INCOMPLETE_EMPTY_TEXT = "Some days couldn't refresh, so requests may be missing.";
