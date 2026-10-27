// FR2, FR3 (01-my-requests-data): Pure utility functions for manual time request processing
// 1.2 WorkSmart dashboard parity: groupOverviewEntries builds the same entries from the hours
// overview's manualEntries (this and last UTC week in one call), on the user's LOCAL dates;
// localDatesWithin picks the local dates a UTC window covers whole.

import type { WorkDiarySlot } from '../types/api';
import { localDateOfUtcWallTime, type OverviewManualEntry } from './hoursOverview';
import type { ManualRequestEntry, ManualRequestStatus } from '../types/requests';

type SlotAction = WorkDiarySlot['actions'][number];

// ─── Status priority ──────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<ManualRequestStatus, number> = {
  REJECTED: 2,
  PENDING: 1,
  APPROVED: 0,
};

// ─── FR2: extractRejectionReason ─────────────────────────────────────────────

/**
 * Extracts the rejection reason from a slot's actions array.
 *
 * Looks for a REJECT_MANUAL_TIME action and returns its comment if non-empty.
 * Returns null in all other cases (no rejection action, empty comment, empty array).
 */
export function extractRejectionReason(actions: SlotAction[]): string | null {
  for (const action of actions) {
    if (action.actionType === 'REJECT_MANUAL_TIME' && action.comment) {
      return action.comment;
    }
  }
  return null;
}

// ─── FR3: groupSlotsIntoEntries ───────────────────────────────────────────────

/**
 * Filters manual time slots from a single day's work diary and groups them
 * into ManualRequestEntry objects by memo.
 *
 * Multiple 10-minute slots sharing the same memo represent one user submission.
 * Uses worst-case status aggregation: REJECTED > PENDING > APPROVED.
 */
export function groupSlotsIntoEntries(
  slots: WorkDiarySlot[],
  date: string,
): ManualRequestEntry[] {
  // Filter to manual slots only
  const manualSlots = slots.filter((s) => s.autoTracker === false);

  if (manualSlots.length === 0) return [];

  // Group by memo (normalize undefined → "")
  const groups = new Map<string, WorkDiarySlot[]>();
  for (const slot of manualSlots) {
    const memo = slot.memo ?? '';
    if (!groups.has(memo)) {
      groups.set(memo, []);
    }
    groups.get(memo)!.push(slot);
  }

  // Build entries
  const entries: ManualRequestEntry[] = [];
  for (const [memo, group] of groups) {
    // Worst-case status
    let worstStatus: ManualRequestStatus = 'APPROVED';
    let rejectedSlot: WorkDiarySlot | null = null;

    for (const slot of group) {
      const slotStatus = slot.status as ManualRequestStatus;
      if (STATUS_PRIORITY[slotStatus] > STATUS_PRIORITY[worstStatus]) {
        worstStatus = slotStatus;
      }
      if (slotStatus === 'REJECTED' && rejectedSlot === null) {
        rejectedSlot = slot;
      }
    }

    const rejectionReason =
      worstStatus === 'REJECTED' && rejectedSlot
        ? extractRejectionReason(rejectedSlot.actions)
        : null;

    entries.push({
      id: `${date}|${memo}`,
      date,
      durationMinutes: group.length * 10,
      memo,
      status: worstStatus,
      rejectionReason,
    });
  }

  return entries;
}

// ─── 1.2: groupOverviewEntries ────────────────────────────────────────────────

function byStart(a: OverviewManualEntry, b: OverviewManualEntry): number {
  return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
}

/**
 * Groups hours-overview manual entries into ManualRequestEntry objects for each requested
 * local date (YYYY-MM-DD), exactly as groupSlotsIntoEntries groups that date's work diary:
 * by memo (the description), minutes summed, worst status REJECTED > PENDING > APPROVED, the
 * first REJECTED entry's reason, id `${date}|${memo}`. A requested date with no entry maps
 * to []; entries on other dates are ignored. The Map's keys follow `dates`.
 *
 * An entry belongs to the LOCAL date its UTC start falls on (localDateOfUtcWallTime by
 * default, injectable for tests), like every day My Requests lists: the planner's dates and
 * the work-diary days are local. An entry whose start does not parse belongs to no date. The overview lists entries
 * newest first, the work diary a day's slots in time order, so a date's entries are walked
 * by ascending start (ties keep their order): groups then come out in groupSlotsIntoEntries'
 * first-appearance order, and "first REJECTED" means the earliest one.
 */
export function groupOverviewEntries(
  entries: readonly OverviewManualEntry[],
  dates: readonly string[],
  toLocalDate: (start: string) => string | null = localDateOfUtcWallTime,
): Map<string, ManualRequestEntry[]> {
  const byDate = new Map<string, OverviewManualEntry[]>(dates.map((d) => [d, []]));
  for (const e of entries) {
    const date = toLocalDate(e.start);
    if (date !== null) byDate.get(date)?.push(e);
  }

  const result = new Map<string, ManualRequestEntry[]>();
  for (const [date, dayEntries] of byDate) {
    const groups = new Map<string, OverviewManualEntry[]>();
    for (const e of [...dayEntries].sort(byStart)) {
      const group = groups.get(e.description);
      if (group) group.push(e);
      else groups.set(e.description, [e]);
    }

    const grouped: ManualRequestEntry[] = [];
    for (const [memo, group] of groups) {
      let worstStatus: ManualRequestStatus = 'APPROVED';
      let rejected: OverviewManualEntry | null = null;
      let durationMinutes = 0;
      for (const e of group) {
        if (STATUS_PRIORITY[e.status] > STATUS_PRIORITY[worstStatus]) worstStatus = e.status;
        if (e.status === 'REJECTED' && rejected === null) rejected = e;
        durationMinutes += e.durationMinutes;
      }
      grouped.push({
        id: `${date}|${memo}`,
        date,
        durationMinutes,
        memo,
        status: worstStatus,
        rejectionReason: rejected?.rejectionReason ?? null,
      });
    }
    result.set(date, grouped);
  }
  return result;
}

// ─── 1.2: localDatesWithin ────────────────────────────────────────────────────

/**
 * The `dates` (local YYYY-MM-DD) whose whole local day, [local midnight, next local
 * midnight), lies inside the window [startMs, endMs); order is kept. A day the window only
 * partly covers is left out. Both midnights come from local Date arithmetic, never a fixed
 * 24 h, so a 23- or 25-hour DST day is measured as it is.
 */
export function localDatesWithin(
  dates: readonly string[],
  startMs: number,
  endMs: number,
): string[] {
  return dates.filter((date) => {
    const [y, m, d] = date.split('-').map(Number);
    return (
      new Date(y, m - 1, d).getTime() >= startMs && new Date(y, m - 1, d + 1).getTime() <= endMs
    );
  });
}
