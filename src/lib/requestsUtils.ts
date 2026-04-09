// FR2, FR3 (01-my-requests-data): Pure utility functions for manual time request processing

import type { WorkDiarySlot } from '../types/api';
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
