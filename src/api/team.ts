// FR2-FR3 (01-team-roster-api): Team roster API — the manager's owned teams
// and one team's active roster. One request per function; no fan-out or
// aggregation (that belongs to Spec 02's hook layer).
//
// FR1 (02-team-aggregate-hook): fetchReportTimesheet — cross-user timesheet
// fetch for one direct report. Single request, no fallback strategies (see
// function doc for why this cannot reuse fetchTimesheet's 3-strategy shape).

import { apiGet } from './client';
import type { RawTeam, RawTeamAssignment, TeamMember } from '../types/api';
import type { TimesheetResponse } from '../lib/hours';

// Spring pagination envelope for /api/v2/teams/assignments — a transport
// detail of this endpoint, not an app-facing contract.
interface AssignmentsPage {
  content: RawTeamAssignment[];
}

/**
 * Fetch the active teams owned by the signed-in manager. The endpoint is
 * server-scoped to the caller's own teams, so no client-side manager
 * filtering is needed. No caching; one GET per call.
 */
export async function fetchMyTeams(
  token: string,
  useQA: boolean,
): Promise<RawTeam[]> {
  const response = await apiGet<RawTeam[] | null>(
    '/api/v2/teams',
    { status: 'ACTIVE' },
    token,
    useQA,
  );
  return Array.isArray(response) ? response : [];
}

// Guards against silently fabricating an identity: if a nested object is
// present but a specific leaf field is missing, bare String(undefined)
// would coerce to the literal string "undefined" instead of failing. Per
// spec.md's edge cases, malformed rows must fail loudly, not produce a
// plausible-but-bogus id/name that could propagate into downstream calls.
function assertPresent<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new Error(`fetchTeamRoster: malformed assignment row — missing "${field}"`);
  }
  return value;
}

/**
 * Fetch one team's active roster and map it to TeamMember[]. Filters out
 * any non-ACTIVE rows defensively, even though ACTIVE is also requested
 * server-side. No caching; one GET per call.
 */
export async function fetchTeamRoster(
  teamId: string,
  token: string,
  useQA: boolean,
): Promise<TeamMember[]> {
  const response = await apiGet<AssignmentsPage | RawTeamAssignment[] | null>(
    '/api/v2/teams/assignments',
    { teamId, status: 'ACTIVE' },
    token,
    useQA,
  );

  let rows: RawTeamAssignment[];
  if (response && Array.isArray((response as AssignmentsPage).content)) {
    rows = (response as AssignmentsPage).content;
  } else if (Array.isArray(response)) {
    rows = response;
  } else {
    rows = [];
  }

  return rows
    .filter((row) => row.status === 'ACTIVE')
    .map((row) => ({
      assignmentId: String(assertPresent(row.id, 'id')),
      candidateId: String(assertPresent(row.candidate?.id, 'candidate.id')),
      managerId: String(assertPresent(row.manager?.id, 'manager.id')),
      teamId: String(assertPresent(row.team?.id, 'team.id')),
      teamName: assertPresent(row.team?.name, 'team.name'),
      name: assertPresent(row.candidate?.printableName, 'candidate.printableName'),
      photoUrl: row.candidate.photoUrl,
      isManager: row.candidate.avatarTypes?.includes('MANAGER') ?? false,
    }));
}

/**
 * Fetch one direct report's current-week timesheet using the authenticated
 * manager's token. Always sends userId (the report's candidateId), managerId,
 * and teamId together with date/period — cross-user timesheet queries 400
 * (CROS-0005) without all three, unlike the personal-timesheet path in
 * fetchTimesheet(), so this makes exactly one request and never falls back
 * to a reduced parameter set. Returns the first array item, or null when the
 * API has no timesheet for the report that week.
 */
export async function fetchReportTimesheet(
  member: TeamMember,
  weekStartDate: string,
  token: string,
  useQA: boolean,
): Promise<TimesheetResponse | null> {
  const response = await apiGet<TimesheetResponse[]>(
    '/api/timetracking/timesheets',
    {
      date: weekStartDate,
      period: 'WEEK',
      userId: member.candidateId,
      managerId: member.managerId,
      teamId: member.teamId,
    },
    token,
    useQA,
  );
  return Array.isArray(response) && response.length > 0 ? response[0] : null;
}
