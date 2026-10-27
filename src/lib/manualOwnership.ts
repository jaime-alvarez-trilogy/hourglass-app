// 1.2 manager auto-approve: which roster assignment a pending MANUAL request belongs to.
//
// The pending-manual response's userId is not an id the roster knows (live QA, 2026-10-27:
// 36412 for a report whose candidate.userId is 1194942 and candidate.id 2374577; no roster,
// assignment, detail or users/current response carries it), so manual requests are never
// matched by userId, and never by name. The proof is the work diary: a request's
// timecardIds are the ids of its slots, so it belongs to the assignment whose manual slots
// (autoTracker false) on the request's UTC dates hold every one of them. The request's
// startDateTime has no offset and is UTC. The diary's date param, sent without timeZoneId,
// held the live request on its UTC date, but that probe (an IST report, 04:30Z) cannot tell
// a UTC day from the report's own day, so the day before and after are read too before an
// assignment is answered "not theirs". Slot ids are unique, so a wider read never proves
// the wrong owner.
//
// Pure: the diary is reached only through the injected manualSlotIds. No React, no
// storage, no network of its own.

import type { ManualApprovalItem } from './approvals';
import type { TeamMember } from '../types/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Proven answers, keyed by ownershipKey(itemId, assignmentId): true when that assignment
 * owns the item, false when it does not. Timecards never move between assignments, so an
 * answer holds for the session. A failed fetch is never stored.
 */
export type OwnershipCache = Map<string, boolean>;

/** The ids of an assignment's manual (autoTracker false) work-diary slots on one UTC date. */
export type ManualSlotIds = (assignmentId: string, utcDate: string) => Promise<ReadonlySet<number>>;

/** item.id → the roster row that owns it, or null when none is proven. */
export type ManualOwners = ReadonlyMap<string, TeamMember | null>;

export function ownershipKey(itemId: string, assignmentId: string): string {
  return `${itemId}|${assignmentId}`;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** A request spanning more UTC dates than this is never proven (and never fetched). */
export const MAX_ITEM_UTC_DATES = 3;

const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Epoch ms of an ISO date-time; UTC when it has no offset. Null when it is not one. */
function parseStartMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = ISO_DATE_TIME.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', frac = '', zone] = m;
  const day = Number(d);
  if (Number(mo) < 1 || Number(mo) > 12 || day < 1 || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) {
    return null;
  }
  const ms = frac ? Math.floor(Number(`0.${frac}`) * 1000) : 0;
  const wall = Date.UTC(Number(y), Number(mo) - 1, day, Number(h), Number(mi), Number(s), ms);
  // Date.UTC rolls an impossible day (02-30) into the next month
  if (new Date(wall).getUTCDate() !== day) return null;
  let offsetMinutes = 0;
  if (zone && zone.toUpperCase() !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    const hours = Number(digits.slice(0, 2));
    const minutes = digits.length > 2 ? Number(digits.slice(2)) : 0;
    if (hours > 23 || minutes > 59) return null;
    offsetMinutes = (zone[0] === '-' ? -1 : 1) * (hours * 60 + minutes);
  }
  return wall - offsetMinutes * 60 * 1000;
}

/**
 * The UTC dates (YYYY-MM-DD) spanned by [start, start + durationMinutes): usually one, two
 * when the request crosses UTC midnight. startDateTime is read as UTC when it has no offset
 * (as the pending-manual response sends it); 'Z' and an explicit offset are honoured. []
 * for an unparseable start, a negative or non-numeric duration, or a span over
 * MAX_ITEM_UTC_DATES dates.
 */
export function manualItemUtcDates(
  item: Pick<ManualApprovalItem, 'startDateTime' | 'durationMinutes'>,
): string[] {
  const start = parseStartMs(item.startDateTime);
  const minutes = item.durationMinutes;
  if (start === null || typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
    return [];
  }
  // The end instant itself is not covered: 30 minutes from 23:30 stays on that date.
  const last = minutes > 0 ? start + minutes * 60 * 1000 - 1 : start;
  const dates: string[] = [];
  for (let day = Math.floor(start / DAY_MS) * DAY_MS; day <= last; day += DAY_MS) {
    if (dates.length === MAX_ITEM_UTC_DATES) return [];
    dates.push(new Date(day).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * The day before the first of `dates` and the day after the last (ascending YYYY-MM-DD, as
 * manualItemUtcDates gives them): read only when the request's own UTC dates do not prove
 * it, in case the diary's day is not the UTC day. [] for [].
 */
export function adjacentUtcDates(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const shift = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
  return [shift(dates[0], -1), shift(dates[dates.length - 1], 1)];
}

// ─── Candidates ───────────────────────────────────────────────────────────────

/** A name as compared for ordering: trimmed, single-spaced, lowercase. */
export function normalisedName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The rows whose name equals the item's fullName (normalised). Never proof of ownership. */
export function nameMatchedRows(item: ManualApprovalItem, rows: TeamMember[]): TeamMember[] {
  const name = normalisedName(item.fullName);
  if (!name) return [];
  return rows.filter((row) => normalisedName(row.name) === name);
}

/**
 * `rows` with the name-matched ones first, otherwise in order. An ordering optimisation
 * only (the likely owner's diary is read first, and proving it stops the search): a name is
 * never proof.
 */
export function nameMatchedFirst(item: ManualApprovalItem, rows: TeamMember[]): TeamMember[] {
  const matched = nameMatchedRows(item, rows);
  if (matched.length === 0) return rows;
  const first = new Set(matched);
  return [...matched, ...rows.filter((row) => !first.has(row))];
}

/** The candidates once each, by assignmentId (the first row wins). */
function uniqueAssignments(candidates: TeamMember[]): TeamMember[] {
  const seen = new Set<string>();
  return candidates.filter((row) => {
    if (seen.has(row.assignmentId)) return false;
    seen.add(row.assignmentId);
    return true;
  });
}

function hasTimecards(item: ManualApprovalItem): boolean {
  return Array.isArray(item.timecardIds) && item.timecardIds.length > 0;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Whether `assignmentId` owns the timecards: true when every id is among its manual slots
 * over `dates`, or failing that over those dates and the day either side (adjacentUtcDates);
 * false when not, undefined when a fetch failed and the ids found so far do not prove it
 * (unknown: never cached).
 */
async function owns(
  timecardIds: number[],
  assignmentId: string,
  dates: string[],
  slotIds: ManualSlotIds,
): Promise<boolean | undefined> {
  const found = new Set<number>();
  let failed = false;
  const proves = async (days: string[]) => {
    const results = await Promise.allSettled(days.map((date) => slotIds(assignmentId, date)));
    for (const result of results) {
      if (result.status === 'rejected') failed = true;
      else for (const id of result.value) found.add(id);
    }
    return timecardIds.every((id) => found.has(id));
  };
  if (await proves(dates)) return true;
  // "Not theirs" is cached for the session: rule out a diary day that is not the UTC day.
  if (await proves(adjacentUtcDates(dates))) return true;
  return failed ? undefined : false;
}

async function ownerOf(
  item: ManualApprovalItem,
  candidates: TeamMember[],
  slotIds: ManualSlotIds,
  cache: OwnershipCache,
): Promise<TeamMember | null> {
  if (!hasTimecards(item)) return null;
  const dates = manualItemUtcDates(item);
  if (dates.length === 0) return null;
  let owner: TeamMember | null = null;
  for (const candidate of uniqueAssignments(candidates)) {
    const key = ownershipKey(item.id, candidate.assignmentId);
    let answer = cache.get(key);
    if (answer === undefined) {
      // Proven already: the rest are only read from the cache, never fetched.
      if (owner) continue;
      answer = await owns(item.timecardIds, candidate.assignmentId, dates, slotIds);
      if (answer === undefined) continue; // a failed fetch: unknown, and not cached
      cache.set(key, answer);
    }
    if (answer) {
      // Two proven owners (only possible through answers cached earlier): fail closed.
      if (owner) return null;
      owner = candidate;
    }
  }
  return owner;
}

/**
 * The owner of each pending MANUAL item, by work-diary proof: a candidate owns an item when
 * the item has timecardIds and every one of them is among that candidate assignment's
 * manual slot ids over the item's UTC dates (manualItemUtcDates), or over those and the day
 * either side when they alone do not hold them all (adjacentUtcDates). Exactly one proven owner
 * → that row; none → null, including when a fetch failed and no candidate was proven
 * (fail closed). Candidates are tried in candidatesFor's order and the search stops at the
 * first proof. Each (assignmentId, date) is fetched at most once per call. Answers are
 * cached per (item, assignment) in `cache`; failures never are, so they are tried again on
 * the next call.
 */
export async function resolveManualOwners(
  items: ManualApprovalItem[],
  candidatesFor: (item: ManualApprovalItem) => TeamMember[],
  manualSlotIds: ManualSlotIds,
  cache: OwnershipCache = new Map(),
): Promise<Map<string, TeamMember | null>> {
  const fetched = new Map<string, Promise<ReadonlySet<number>>>();
  const slotIds: ManualSlotIds = (assignmentId, date) => {
    const key = `${assignmentId}|${date}`;
    let pending = fetched.get(key);
    if (!pending) {
      // Through a then, so a synchronous throw is a rejection like any other failure.
      pending = Promise.resolve().then(() => manualSlotIds(assignmentId, date));
      fetched.set(key, pending);
    }
    return pending;
  };
  const resolved = await Promise.all(
    items.map((item) => ownerOf(item, candidatesFor(item), slotIds, cache)),
  );
  const owners = new Map<string, TeamMember | null>();
  items.forEach((item, i) => owners.set(item.id, resolved[i]));
  return owners;
}

/**
 * What `cache` alone says about `item`'s owner among `candidates`: the proven row, null
 * when no candidate can own it (none, no timecardIds or dates, every one disproven, or two
 * proven), or undefined while some candidate is unchecked. Never fetches: the runner's
 * cheap pre-check uses it to skip a run that could not plan anything. `readable` says
 * whether an (assignment, date) read may be made now: a candidate with no answer and a read
 * that may not (a failed read waiting out its retry) is not counted as unchecked, so the
 * item is null until that read may be made again.
 */
export function cachedManualOwner(
  item: ManualApprovalItem,
  candidates: TeamMember[],
  cache: OwnershipCache,
  readable: (assignmentId: string, utcDate: string) => boolean = () => true,
): TeamMember | null | undefined {
  const dates = manualItemUtcDates(item);
  if (!hasTimecards(item) || dates.length === 0) return null;
  const reads = [...dates, ...adjacentUtcDates(dates)];
  let owner: TeamMember | null = null;
  let unchecked = false;
  for (const candidate of uniqueAssignments(candidates)) {
    const answer = cache.get(ownershipKey(item.id, candidate.assignmentId));
    if (answer === undefined) {
      if (reads.every((date) => readable(candidate.assignmentId, date))) unchecked = true;
    } else if (answer) {
      if (owner) return null;
      owner = candidate;
    }
  }
  return owner ?? (unchecked ? undefined : null);
}
