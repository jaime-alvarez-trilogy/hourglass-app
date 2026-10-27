// FR2-FR3 (01-team-roster-api): Team roster API — the manager's owned teams
// and one team's active roster. No fan-out or aggregation (that belongs to
// Spec 02's hook layer).
//
// Managed roster: fetchManagedAssignments — every ACTIVE assignment the
// signed-in manager manages, across all teams, from GET
// /api/v2/teams/assignments without teamId. useTeamRoster uses it instead of
// fetchMyTeams() + fetchTeamRoster() per team: /api/v2/teams omits teams the
// manager has reports on but does not own (QA: 8 of 17 reports found), and
// lists every company team (300+) for an admin-type manager. Both roster
// calls follow the endpoint's pages (see fetchAssignmentPages).
//
// FR1 (02-team-aggregate-hook): fetchReportTimesheet — cross-user timesheet
// fetch for one direct report. Single request, no fallback strategies (see
// function doc for why this cannot reuse fetchTimesheet's 3-strategy shape).
//
// durable-data 01-auth-renewal FR4: each takes an optional trailing `creds` and
// forwards it to apiGet, so an expired token is renewed and retried once.

import { apiGet } from './client';
import type { AuthCreds } from './authCreds';
import { log } from '../lib/log';
import type { RawTeam, RawTeamAssignment, TeamMember } from '../types/api';
import type { TimesheetResponse } from '../lib/hours';

// Spring pagination envelope for /api/v2/teams/assignments — a transport
// detail of this endpoint, not an app-facing contract. The endpoint pages at
// 10 rows by default: `limit` sets the page size (`size` is ignored) and
// `page` is 0-based.
interface AssignmentsPage {
  content: RawTeamAssignment[];
  last?: boolean;
  totalPages?: number;
}

// 500 returned all 65 rows of a 65-person team in one page (QA, 2026-10-27).
// The page cap only bounds a server that never reports its last page.
const ASSIGNMENTS_PAGE_LIMIT = 500;
const ASSIGNMENTS_MAX_PAGES = 20;

/**
 * Fetch the active teams owned by the signed-in manager. The endpoint is
 * server-scoped to the caller's own teams, so no client-side manager
 * filtering is needed. No caching; one GET per call. Not the roster source:
 * see fetchManagedAssignments.
 */
export async function fetchMyTeams(
  token: string,
  useQA: boolean,
  creds?: AuthCreds,
): Promise<RawTeam[]> {
  const response = await apiGet<RawTeam[] | null>(
    '/api/v2/teams',
    { status: 'ACTIVE' },
    token,
    useQA,
    creds,
  );
  return Array.isArray(response) ? response : [];
}

// Guards against silently fabricating an identity: if a nested object is
// present but a specific leaf field is missing, bare String(undefined)
// would coerce to the literal string "undefined" instead of failing. Per
// spec.md's edge cases, malformed rows must fail loudly, not produce a
// plausible-but-bogus id/name that could propagate into downstream calls.
function assertPresent<T>(value: T | null | undefined, field: string, caller: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${caller}: malformed assignment row — missing "${field}"`);
  }
  return value;
}

function toTeamMember(row: RawTeamAssignment, caller: string): TeamMember {
  return {
    assignmentId: String(assertPresent(row.id, 'id', caller)),
    candidateId: String(assertPresent(row.candidate?.id, 'candidate.id', caller)),
    // Not asserted: the Team overview reads this roster too and does not need it.
    // Auto-approve never matches a member whose userId is null.
    userId: row.candidate.userId != null ? String(row.candidate.userId) : null,
    managerId: String(assertPresent(row.manager?.id, 'manager.id', caller)),
    teamId: String(assertPresent(row.team?.id, 'team.id', caller)),
    teamName: assertPresent(row.team?.name, 'team.name', caller),
    name: assertPresent(row.candidate?.printableName, 'candidate.printableName', caller),
    photoUrl: row.candidate.photoUrl,
    isManager: row.candidate.avatarTypes?.includes('MANAGER') ?? false,
  };
}

// Another page only when the envelope says so: `last: true`, the last of
// `totalPages`, or an empty page ends it, as does an envelope with neither
// field (read as one page, like a bare array).
function hasNextPage(envelope: AssignmentsPage, page: number): boolean {
  if (envelope.content.length === 0 || envelope.last === true) return false;
  if (typeof envelope.totalPages === 'number') return page + 1 < envelope.totalPages;
  return envelope.last === false;
}

/**
 * Every ACTIVE row of GET /api/v2/teams/assignments for `params`, mapped to
 * TeamMember[], following `page` from 0 at ASSIGNMENTS_PAGE_LIMIT rows per
 * page until the envelope's last page (a bare array is one page). Unpaged,
 * the endpoint returns only its first 10 rows, so teams over 10 people lost
 * everyone after them. Stops after ASSIGNMENTS_MAX_PAGES and logs the counts.
 * Non-ACTIVE rows are dropped before mapping, even though ACTIVE is also
 * requested server-side; a repeated assignment (rows shifting between pages)
 * keeps its first row.
 */
async function fetchAssignmentPages(
  caller: string,
  params: Record<string, string>,
  token: string,
  useQA: boolean,
  creds?: AuthCreds,
): Promise<TeamMember[]> {
  const members: TeamMember[] = [];
  const seen = new Set<string>();
  let totalPages: number | undefined;

  for (let page = 0; page < ASSIGNMENTS_MAX_PAGES; page++) {
    const response = await apiGet<AssignmentsPage | RawTeamAssignment[] | null>(
      '/api/v2/teams/assignments',
      { ...params, status: 'ACTIVE', limit: String(ASSIGNMENTS_PAGE_LIMIT), page: String(page) },
      token,
      useQA,
      creds,
    );

    let envelope: AssignmentsPage | null = null;
    let rows: RawTeamAssignment[];
    if (response && Array.isArray((response as AssignmentsPage).content)) {
      envelope = response as AssignmentsPage;
      rows = envelope.content;
    } else if (Array.isArray(response)) {
      rows = response;
    } else {
      rows = [];
    }

    for (const row of rows) {
      if (row.status !== 'ACTIVE') continue;
      const member = toTeamMember(row, caller);
      if (seen.has(member.assignmentId)) continue;
      seen.add(member.assignmentId);
      members.push(member);
    }

    if (!envelope || !hasNextPage(envelope, page)) return members;
    totalPages = envelope.totalPages;
  }

  log.warn('team.assignments_page_cap', {
    pageCount: ASSIGNMENTS_MAX_PAGES,
    rowCount: members.length,
    totalPages,
  });
  return members;
}

/**
 * Fetch every ACTIVE assignment the signed-in manager manages, across all of
 * their teams, and map it to TeamMember[] (no teamId: the endpoint scopes the
 * rows to the caller as manager). One person on two teams is two rows; a
 * manager who is their own manager gets their own assignment too (callers
 * that want reports only drop it — see directReports in src/lib/autoApprove.ts).
 * A manager with no reports gets []. No caching.
 */
export async function fetchManagedAssignments(
  token: string,
  useQA: boolean,
  creds?: AuthCreds,
): Promise<TeamMember[]> {
  return fetchAssignmentPages('fetchManagedAssignments', {}, token, useQA, creds);
}

/**
 * Fetch one team's active roster and map it to TeamMember[], every page of
 * it. Filters out any non-ACTIVE rows defensively, even though ACTIVE is also
 * requested server-side. No caching.
 */
export async function fetchTeamRoster(
  teamId: string,
  token: string,
  useQA: boolean,
  creds?: AuthCreds,
): Promise<TeamMember[]> {
  return fetchAssignmentPages('fetchTeamRoster', { teamId }, token, useQA, creds);
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
  creds?: AuthCreds,
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
    creds,
  );
  return Array.isArray(response) && response.length > 0 ? response[0] : null;
}
