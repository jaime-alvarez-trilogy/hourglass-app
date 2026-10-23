// FR1 (durable-data 04-requests-history-ui): Pure My Requests row builder
// Three bounded recent buckets ("This Week", "Last Week", "2 Weeks Ago"), then everything
// older behind one toggle row. Expanded, the older entries are grouped by month, newest
// month first, with malformed dates under "Other dates" last. No I/O and no clock: the
// screen passes the week bounds and the toggle state.

import type { ManualRequestEntry } from '../types/requests';

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
