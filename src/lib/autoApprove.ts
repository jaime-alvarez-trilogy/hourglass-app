// 1.2 manager auto-approve: the pure engine.
//
// Crossover has no server-side auto-approve, so Hourglass approves on the manager's
// behalf whenever the app holds fresh approvals data (src/hooks/useAutoApprove.ts runs
// it). This module decides WHAT to approve: who the direct reports are, which report a
// pending item belongs to, and which items the manager's per-report rules cover. No
// React, no AsyncStorage, no network.
//
// Matching never uses names, and never the pending items' userId:
//   - MANUAL: ManualApprovalItem.userId is an id no other endpoint exposes (live QA,
//     2026-10-27: 36412 for a report whose candidate.userId is 1194942), so it matches
//     nobody. A manual item's owner is proven from the work diary instead
//     (src/lib/manualOwnership.ts resolveManualOwners): the roster row whose manual slots
//     hold every timecardId. The planner takes those resolved owners (manualOwners) and
//     plans a manual item only for a proven owner.
//   - OVERTIME: OvertimeApprovalItem.userId is candidate.id (the avatar id), so overtime
//     matches on assignmentId (assignment.id = TeamMember.assignmentId) only, never on
//     personId: a toggle covers the report's assignments on the manager's roster, not every
//     assignment that person holds. Not live-verified yet.

import { isRetryableError } from '../api/errors';
import type { ApprovalItem } from './approvals';
import type { ManualOwners } from './manualOwnership';
import type { TeamMember } from '../types/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One report's toggles. A report without a rule has both off. */
export interface AutoApproveRule {
  manual: boolean;
  overtime: boolean;
}

/** Keyed by personId (TeamMember.userId). */
export type AutoApproveRules = Record<string, AutoApproveRule>;

/**
 * 'retrying': the call hit an outage (network, 5xx, 408, 429), so the runner tries the item
 * again later. 'failed': the server answered and refused it for another reason; it is left
 * for the manager.
 */
export type AutoApproveOutcome = 'approved' | 'over_limit' | 'deadline_passed' | 'retrying' | 'failed';

export interface AutoApproveLogEntry {
  /** ApprovalItem.id */
  id: string;
  personId: string;
  name: string;
  category: 'MANUAL' | 'OVERTIME';
  durationMinutes: number;
  startDateTime: string;
  /** ISO-8601 time of the attempt. */
  at: string;
  outcome: AutoApproveOutcome;
  /** Manager preview: logged as approved, but no API call was made. */
  simulated?: boolean;
}

export interface AutoApprovePlanItem {
  item: ApprovalItem;
  member: TeamMember;
  /** The approveManual flag. Equals the report's overtime toggle. */
  allowOvertime: boolean;
}

// ─── Server error codes ───────────────────────────────────────────────────────

/** "Weekly limit exceeded": approving needs allowOvertime. */
export const CROS_WEEKLY_LIMIT_EXCEEDED = 'CROS-9300';
/** "Weekly limit could not be verified": treated like 9300. */
export const CROS_WEEKLY_LIMIT_UNVERIFIED = 'CROS-9301';
/** The approval deadline for that week has passed. */
export const CROS_APPROVAL_DEADLINE_PASSED = 'CROS-9101';

// ─── Roster ───────────────────────────────────────────────────────────────────

/** Same person: same userId, or same assignmentId when the userId is missing. */
function personKey(member: TeamMember): string {
  return member.userId != null ? `u:${member.userId}` : `a:${member.assignmentId}`;
}

/**
 * The people auto-approve can act for: the roster without the manager themself
 * (candidateId === selfCandidateId) and without repeats of the same person (a report on
 * two of the manager's teams appears once; the first row wins), sorted by name.
 */
export function directReports(
  roster: TeamMember[],
  selfCandidateId: string | null | undefined,
): TeamMember[] {
  const seen = new Set<string>();
  const reports: TeamMember[] = [];
  for (const member of roster) {
    if (selfCandidateId && member.candidateId === selfCandidateId) continue;
    const key = personKey(member);
    if (seen.has(key)) continue;
    seen.add(key);
    reports.push(member);
  }
  return reports.sort((a, b) => a.name.localeCompare(b.name));
}

/** The members whose id equals `id`. A null/undefined/NaN id matches nobody. */
function membersWith(
  reports: TeamMember[],
  id: number | null | undefined,
  field: 'userId' | 'assignmentId',
): TeamMember[] {
  if (id == null || !Number.isFinite(id)) return [];
  return reports.filter((m) => m[field] != null && Number(m[field]) === id);
}

/**
 * The report a pending item belongs to, or null when no report or more than one matches.
 * MANUAL: the report with the userId of the item's proven owner in `manualOwners` (the
 * roster row resolveManualOwners proved from the work diary; it may be the report's row
 * on another team). No owner, or an owner that is no longer a report, matches nobody;
 * item.userId is never read. OVERTIME: item.assignmentId === Number(member.assignmentId),
 * never item.personId (the person's other assignments, on another team and rate, are not
 * this report's). `roster` is the roster before directReports() dropped repeats: when no
 * report holds the assignment, a roster row that does gives the person, so overtime on a
 * report's second team still matches. Never by name.
 */
export function memberForItem(
  item: ApprovalItem,
  reports: TeamMember[],
  roster: TeamMember[] = [],
  manualOwners?: ManualOwners,
): TeamMember | null {
  let matches: TeamMember[];
  if (item.category === 'MANUAL') {
    const owner = manualOwners?.get(item.id);
    matches = owner?.userId != null ? membersWith(reports, Number(owner.userId), 'userId') : [];
  } else {
    matches = membersWith(reports, item.assignmentId, 'assignmentId');
    if (matches.length === 0) {
      const rows = membersWith(roster, item.assignmentId, 'assignmentId');
      if (rows.length === 1 && rows[0].userId != null) {
        matches = membersWith(reports, Number(rows[0].userId), 'userId');
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

// ─── Planner ──────────────────────────────────────────────────────────────────

/** Oldest first; Date.parse, with a string compare when either side is unparseable. */
function byStartAsc(a: ApprovalItem, b: ApprovalItem): number {
  const ta = Date.parse(a.startDateTime);
  const tb = Date.parse(b.startDateTime);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  return a.startDateTime < b.startDateTime ? -1 : a.startDateTime > b.startDateTime ? 1 : 0;
}

/**
 * The items to approve now, oldest first (ties keep their input order).
 *
 * An item is planned only when its report matches unambiguously (memberForItem, with
 * `roster` the roster before dedupe), has a userId, and has the matching toggle on
 * (manual or overtime). A MANUAL item also needs timecardIds and a proven owner in
 * `manualOwners` that is still a direct report: without manualOwners no manual item is
 * planned. allowOvertime is the report's overtime toggle: approving manual time that
 * pushes a report past their weekly limit is overtime, so it is only allowed when
 * overtime auto-approve is on too. Ids in skipIds are never planned.
 */
export function planAutoApprovals(
  items: ApprovalItem[],
  reports: TeamMember[],
  rules: AutoApproveRules,
  skipIds: ReadonlySet<string>,
  roster: TeamMember[] = [],
  manualOwners?: ManualOwners,
): AutoApprovePlanItem[] {
  const plan: AutoApprovePlanItem[] = [];
  for (const item of [...items].sort(byStartAsc)) {
    if (skipIds.has(item.id)) continue;
    const member = memberForItem(item, reports, roster, manualOwners);
    if (!member || member.userId == null) continue;
    const rule = Object.prototype.hasOwnProperty.call(rules, member.userId)
      ? rules[member.userId]
      : undefined;
    if (!rule) continue;
    if (item.category === 'MANUAL') {
      if (rule.manual !== true) continue;
      if (!Array.isArray(item.timecardIds) || item.timecardIds.length === 0) continue;
    } else if (rule.overtime !== true) {
      continue;
    }
    plan.push({ item, member, allowOvertime: rule.overtime === true });
  }
  return plan;
}

// ─── Outcomes ─────────────────────────────────────────────────────────────────

/** Reads `errorCode` off ApiError / AuthError (src/api/errors.ts) or any error-shaped value. */
function errorCodeOf(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { errorCode?: unknown }).errorCode;
  return typeof code === 'string' ? code : undefined;
}

/**
 * CROS-9300 / CROS-9301 → over_limit, CROS-9101 → deadline_passed; otherwise an outage
 * (isRetryableError: network, 5xx, 408, 429, an unknown throw) → retrying, and any other
 * server answer (4xx, a real 401/403) → failed.
 */
export function classifyApproveError(err: unknown): Exclude<AutoApproveOutcome, 'approved'> {
  const code = errorCodeOf(err);
  if (code === CROS_WEEKLY_LIMIT_EXCEEDED || code === CROS_WEEKLY_LIMIT_UNVERIFIED) {
    return 'over_limit';
  }
  if (code === CROS_APPROVAL_DEADLINE_PASSED) return 'deadline_passed';
  return isRetryableError(err) ? 'retrying' : 'failed';
}

/** How many of `reports` have at least one toggle on. Rules for anyone else don't count. */
export function countEnabled(rules: AutoApproveRules, reports: TeamMember[]): number {
  let count = 0;
  for (const member of reports) {
    if (member.userId == null) continue;
    if (!Object.prototype.hasOwnProperty.call(rules, member.userId)) continue;
    const rule = rules[member.userId];
    if (rule && (rule.manual === true || rule.overtime === true)) count++;
  }
  return count;
}
