// 1.2 manager auto-approve: view helpers for app/direct-reports.tsx and the Requests tab's
// AutoApproveEntryRow. Pure: the confirmation copy, the log's outcome and category labels,
// today's approved count and the per-report pending counts. No React, no storage.

import { memberForItem } from './autoApprove';
import type { AutoApproveLogEntry, AutoApproveOutcome, AutoApproveRule } from './autoApprove';
import type { ApprovalItem } from './approvals';
import type { ManualOwners } from './manualOwnership';
import type { TeamMember } from '../types/api';

/** Which of a report's two toggles. */
export type AutoApproveKind = keyof AutoApproveRule;

export interface PendingCounts {
  manual: number;
  overtime: number;
}

// ─── Names ────────────────────────────────────────────────────────────────────

/** The first word of a name, or 'this person' when the name is blank. */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? first : 'this person';
}

/** Up to two initials, uppercased; '?' for a blank name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// ─── Confirmation ─────────────────────────────────────────────────────────────

/**
 * The Alert shown before a toggle is turned on. The runner approves everything of that
 * kind pending for the report as soon as the rule is saved, so the message says how many
 * are waiting, or, when `waiting` is null (the count is not final: manual time whose owner
 * is still being proved, useManualOwners' settled), that any waiting now are included.
 * `otherOn` is the report's other toggle: approving manual time that takes a report over
 * the weekly limit needs Overtime on too (planAutoApprovals' allowOvertime).
 */
export function enableConfirmCopy(
  kind: AutoApproveKind,
  name: string,
  waiting: number | null,
  otherOn: boolean,
): { title: string; message: string } {
  const who = firstName(name);
  if (kind === 'manual') {
    const waitingClause =
      waiting === null
        ? ', including any requests waiting now'
        : waiting === 1
          ? ', including the 1 request waiting now'
          : waiting > 1
            ? `, including the ${waiting} requests waiting now`
            : '';
    const limit = otherOn
      ? `Overtime is on too, so manual time that takes ${who} over the weekly limit is approved as well.`
      : `Manual time that would take ${who} over the weekly limit is only approved when Overtime is on too.`;
    return {
      title: `Auto-approve ${who}'s manual time?`,
      message: `Hourglass will approve ${who}'s manual time whenever you open the app${waitingClause}. ${limit}`,
    };
  }
  const waitingClause =
    waiting === null
      ? ', including any waiting now'
      : waiting > 0
        ? `, including the ${waiting} waiting now`
        : '';
  const limit = otherOn
    ? ` Manual time that takes ${who} over the weekly limit will be approved too.`
    : '';
  return {
    title: `Auto-approve ${who}'s overtime?`,
    message: `Hourglass will approve ${who}'s overtime requests whenever you open the app${waitingClause}.${limit}`,
  };
}

// ─── Log ──────────────────────────────────────────────────────────────────────

/** The line shown under a log row, or null for an approval. */
export function outcomeLabel(outcome: AutoApproveOutcome): string | null {
  switch (outcome) {
    case 'approved':
      return null;
    case 'over_limit':
      return 'Over weekly limit — left for you';
    case 'deadline_passed':
      return 'Deadline passed';
    case 'retrying':
      return "Couldn't reach Crossover — will try again";
    case 'failed':
      return 'Failed — left for you';
    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = outcome;
      return null;
    }
  }
}

export function categoryLabel(category: AutoApproveLogEntry['category']): string {
  return category === 'MANUAL' ? 'Manual time' : 'Overtime';
}

/** Log entries approved (simulated included) on `now`'s local calendar date. */
export function approvedTodayCount(log: AutoApproveLogEntry[], now: Date): number {
  let count = 0;
  for (const entry of log) {
    if (entry.outcome !== 'approved') continue;
    const at = new Date(entry.at);
    if (Number.isNaN(at.getTime())) continue;
    if (
      at.getFullYear() === now.getFullYear() &&
      at.getMonth() === now.getMonth() &&
      at.getDate() === now.getDate()
    ) {
      count++;
    }
  }
  return count;
}

// ─── Pending ──────────────────────────────────────────────────────────────────

/**
 * Pending manual and overtime counts per report, matched with memberForItem exactly as
 * the runner matches (`roster` is useDirectReports' roster, before dedupe, so overtime on
 * a report's second assignment counts; `manualOwners` is the work-diary proof from
 * useManualOwners, so manual time counts only for its proven owner), keyed by the report
 * object from `reports`. Items that match nobody, or more than one report, and manual
 * items not (yet) proven, are not counted.
 */
export function pendingCountsByMember(
  items: ApprovalItem[],
  reports: TeamMember[],
  roster: TeamMember[] = [],
  manualOwners?: ManualOwners,
): Map<TeamMember, PendingCounts> {
  const counts = new Map<TeamMember, PendingCounts>();
  for (const item of items) {
    const member = memberForItem(item, reports, roster, manualOwners);
    if (!member) continue;
    const c = counts.get(member) ?? { manual: 0, overtime: 0 };
    if (item.category === 'MANUAL') c.manual++;
    else c.overtime++;
    counts.set(member, c);
  }
  return counts;
}
