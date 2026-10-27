// Tests: autoApprove.ts — 1.2 manager auto-approve, the pure engine.
// directReports (self + duplicate removal, name sort), memberForItem (MANUAL by the proven
// owner in manualOwners only, never item.userId; OVERTIME by assignmentId, through the
// pre-dedupe roster, never by personId or name; null when ambiguous),
// planAutoApprovals (toggles, allowOvertime, skip set, timecardIds, proven owners, order),
// classifyApproveError (CROS codes, outage → retrying, other answers → failed) and countEnabled. Items are built through the real parsers from
// raw Crossover shapes, so the id mapping under test is the one the app uses.

import {
  classifyApproveError,
  countEnabled,
  directReports,
  memberForItem,
  planAutoApprovals,
} from '../autoApprove';
import type { AutoApproveRules } from '../autoApprove';
import type { ManualOwners } from '../manualOwnership';
import { parseManualItems, parseOvertimeItems } from '../approvals';
import type { ApprovalItem, ManualApprovalItem, OvertimeApprovalItem, RawOvertimeResponse } from '../approvals';
import { AUTH_HTML_500, ApiError, AuthError, AuthResetError, NetworkError } from '../../api/errors';
import type { TeamMember } from '../../types/api';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SELF_CANDIDATE_ID = '2362707';

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    assignmentId: '80001',
    candidateId: '3000001',
    userId: '1190001',
    managerId: SELF_CANDIDATE_ID,
    teamId: '4584',
    teamName: 'Platform',
    name: 'Ana Ruiz',
    isManager: false,
    ...overrides,
  };
}

const ANA = member();
const BEN = member({ assignmentId: '80002', candidateId: '3000002', userId: '1190002', name: 'Ben Okafor' });
const CY = member({ assignmentId: '80003', candidateId: '3000003', userId: '1190003', name: 'Cy Park' });
const REPORTS = [ANA, BEN, CY];

/**
 * A pending-manual entry. Its top-level userId is an id no roster carries (live QA: 36412
 * for a report whose candidate.userId is 1194942), so the engine never reads it: the owner
 * comes from manualOwners (the work-diary proof).
 */
function manual(
  legacyUserId: number,
  timecardIds: number[],
  startDateTime: string,
  fullName = 'Whoever',
): ManualApprovalItem {
  return parseManualItems(
    [
      {
        userId: legacyUserId,
        fullName,
        manualTimes: [
          { status: 'PENDING', durationMinutes: 60, description: 'Work', startDateTime, timecardIds, type: 'WEB' },
        ],
      },
    ],
    '2026-10-19',
  )[0];
}

/** A pending-overtime entry: candidate.id is the avatar id, assignment.id the assignment. */
function overtime(
  id: number,
  opts: { assignmentId?: number; personId?: number; avatarId?: number; startDateTime?: string; name?: string },
): OvertimeApprovalItem {
  const raw = {
    overtimeRequest: {
      id,
      status: 'PENDING',
      durationMinutes: 120,
      description: 'Release week',
      startDateTime: opts.startDateTime ?? '2026-10-20T09:00:00Z',
    },
    assignment: {
      id: opts.assignmentId,
      salary: 50,
      selection: {
        marketplaceMember: {
          application: {
            candidate: {
              id: opts.avatarId ?? 3000001,
              userId: opts.personId,
              printableName: opts.name ?? 'Whoever',
              jobTitle: 'Engineer',
            },
          },
        },
      },
    },
  } as unknown as RawOvertimeResponse;
  return parseOvertimeItems([raw])[0];
}

const ON: AutoApproveRules[string] = { manual: true, overtime: true };
const MANUAL_ONLY: AutoApproveRules[string] = { manual: true, overtime: false };
const OVERTIME_ONLY: AutoApproveRules[string] = { manual: false, overtime: true };
const NONE: ReadonlySet<string> = new Set();

/** Proven owners (resolveManualOwners' result), item → roster row. */
function owners(...pairs: [ManualApprovalItem, TeamMember | null][]): ManualOwners {
  return new Map(pairs.map(([item, owner]) => [item.id, owner]));
}

// ─── parseOvertimeItems: the new matching fields ─────────────────────────────

describe('parseOvertimeItems — auto-approve matching fields', () => {
  it('fills assignmentId from assignment.id and personId from candidate.userId', () => {
    const item = overtime(42, { assignmentId: 80002, personId: 1190002, avatarId: 3000002 });
    expect(item.assignmentId).toBe(80002);
    expect(item.personId).toBe(1190002);
    expect(item.userId).toBe(3000002); // unchanged: still candidate.id
  });

  it('uses null when the row has neither', () => {
    const item = overtime(43, {});
    expect(item.assignmentId).toBeNull();
    expect(item.personId).toBeNull();
  });
});

// ─── directReports ───────────────────────────────────────────────────────────

describe('directReports', () => {
  it('drops the manager themself (candidateId === selfCandidateId)', () => {
    const self = member({ assignmentId: '79996', candidateId: SELF_CANDIDATE_ID, userId: '1190137', name: 'Me' });
    expect(directReports([self, ANA], SELF_CANDIDATE_ID)).toEqual([ANA]);
  });

  it('keeps everyone when selfCandidateId is null or undefined', () => {
    expect(directReports([ANA, BEN], null)).toHaveLength(2);
    expect(directReports([ANA, BEN], undefined)).toHaveLength(2);
  });

  it('drops a second row for the same userId (a report on two teams), keeping the first', () => {
    const anaOnOtherTeam = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Other' });
    expect(directReports([ANA, anaOnOtherTeam], SELF_CANDIDATE_ID)).toEqual([ANA]);
  });

  it('dedupes by assignmentId when userId is null, without merging different null-userId people', () => {
    const x = member({ userId: null, assignmentId: '81000', candidateId: '3100000', name: 'X' });
    const xAgain = member({ userId: null, assignmentId: '81000', candidateId: '3100000', name: 'X' });
    const y = member({ userId: null, assignmentId: '81001', candidateId: '3100001', name: 'Y' });
    expect(directReports([x, xAgain, y], SELF_CANDIDATE_ID)).toEqual([x, y]);
  });

  it('sorts by name and does not mutate the roster', () => {
    const roster = [CY, ANA, BEN];
    expect(directReports(roster, SELF_CANDIDATE_ID).map((m) => m.name)).toEqual(['Ana Ruiz', 'Ben Okafor', 'Cy Park']);
    expect(roster.map((m) => m.name)).toEqual(['Cy Park', 'Ana Ruiz', 'Ben Okafor']);
  });
});

// ─── memberForItem ───────────────────────────────────────────────────────────

describe('memberForItem', () => {
  it('MANUAL: the report of the proven owner, whatever item.userId is', () => {
    const item = manual(36412, [1], '2026-10-27T04:30:00'); // the live, legacy userId
    expect(memberForItem(item, REPORTS, [], owners([item, BEN]))).toBe(BEN);
  });

  it('MANUAL: an owner row on a report\'s second team gives that report', () => {
    const anaOnOtherTeam = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Other' });
    const item = manual(36412, [1], '2026-10-20T10:00:00Z');
    expect(memberForItem(item, REPORTS, [...REPORTS, anaOnOtherTeam], owners([item, anaOnOtherTeam]))).toBe(ANA);
  });

  it('MANUAL: no proven owner matches nobody, even when item.userId is a report\'s userId', () => {
    const item = manual(1190002, [1], '2026-10-20T10:00:00Z'); // Ben's candidate.userId
    expect(memberForItem(item, REPORTS)).toBeNull();
    expect(memberForItem(item, REPORTS, REPORTS, new Map())).toBeNull();
    expect(memberForItem(item, REPORTS, REPORTS, owners([item, null]))).toBeNull();
  });

  it('MANUAL: never matches by name', () => {
    expect(memberForItem(manual(5555555, [1], '2026-10-20T10:00:00Z', 'Ben Okafor'), REPORTS)).toBeNull();
  });

  it('MANUAL: an owner who is no longer a report, or has no userId, matches nobody', () => {
    const item = manual(36412, [1], '2026-10-20T10:00:00Z');
    const former = member({ assignmentId: '80777', candidateId: '3000777', userId: '1190777', name: 'Former' });
    expect(memberForItem(item, REPORTS, [], owners([item, former]))).toBeNull();
    expect(memberForItem(item, REPORTS, [], owners([item, member({ userId: null })]))).toBeNull();
  });

  it('OVERTIME: matches by assignmentId first', () => {
    // personId points at Cy, assignmentId at Ben: assignmentId wins.
    expect(memberForItem(overtime(1, { assignmentId: 80002, personId: 1190003 }), REPORTS)).toBe(BEN);
  });

  it('OVERTIME: never falls back to personId (the person\'s other assignment is not covered)', () => {
    // Cy's request on an assignment that is not on the manager's roster (another team, another rate)
    expect(memberForItem(overtime(2, { assignmentId: 99999, personId: 1190003 }), REPORTS)).toBeNull();
    expect(memberForItem(overtime(2, { assignmentId: 99999, personId: 1190003 }), REPORTS, REPORTS)).toBeNull();
    expect(memberForItem(overtime(3, { personId: 1190001 }), REPORTS)).toBeNull();
  });

  it('OVERTIME: an assignment whose roster row was dropped as a repeat belongs to that report', () => {
    // Ana on two of the manager's teams: directReports keeps the 80001 row only.
    const anaOnOtherTeam = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Other' });
    const roster = [ANA, BEN, anaOnOtherTeam];
    const reports = directReports(roster, SELF_CANDIDATE_ID);
    const onSecondTeam = overtime(7, { assignmentId: 80099, personId: 1190001 });
    expect(memberForItem(onSecondTeam, reports, roster)).toBe(ANA);
    // Without the roster, the deduped list alone cannot tell
    expect(memberForItem(onSecondTeam, reports)).toBeNull();
  });

  it('OVERTIME: never matches by name or by candidate.id', () => {
    const item = overtime(4, { assignmentId: 99999, personId: 5555555, avatarId: 3000002, name: 'Ben Okafor' });
    expect(memberForItem(item, REPORTS)).toBeNull();
  });

  it('returns null for an unknown person', () => {
    expect(memberForItem(manual(42, [1], '2026-10-20T10:00:00Z'), REPORTS)).toBeNull();
    expect(memberForItem(overtime(5, {}), REPORTS)).toBeNull();
  });

  it('returns null when more than one member matches (ambiguous)', () => {
    const benTwin = member({ assignmentId: '80002', candidateId: '3000077', userId: '1190002', name: 'Ben Twin' });
    const item = manual(36412, [1], '2026-10-20T10:00:00Z');
    expect(memberForItem(item, [ANA, BEN, benTwin], [], owners([item, BEN]))).toBeNull();
    expect(memberForItem(overtime(6, { assignmentId: 80002 }), [ANA, BEN, benTwin])).toBeNull();
  });

  it('a report with a null userId matches no MANUAL item', () => {
    const noPerson = member({ userId: null });
    const item = manual(36412, [1], '2026-10-20T10:00:00Z');
    expect(memberForItem(item, [noPerson], [], owners([item, noPerson]))).toBeNull();
  });
});

// ─── planAutoApprovals ───────────────────────────────────────────────────────

describe('planAutoApprovals', () => {
  // Legacy userIds (as the live pending response sends them): only OWNERS ties them to people.
  const anaManual = manual(36401, [11], '2026-10-20T10:00:00Z');
  const benManual = manual(36412, [21, 22], '2026-10-21T10:00:00Z');
  const anaOvertime = overtime(31, { assignmentId: 80001, personId: 1190001, startDateTime: '2026-10-19T09:00:00Z' });
  const benOvertime = overtime(32, { assignmentId: 80002, personId: 1190002, startDateTime: '2026-10-22T09:00:00Z' });
  const ALL: ApprovalItem[] = [benOvertime, benManual, anaManual, anaOvertime];
  const OWNERS = owners([anaManual, ANA], [benManual, BEN]);

  const ids = (plan: ReturnType<typeof planAutoApprovals>) => plan.map((p) => p.item.id);

  it('plans nothing without rules', () => {
    expect(planAutoApprovals(ALL, REPORTS, {}, NONE, [], OWNERS)).toEqual([]);
  });

  it('respects the manual and overtime toggles independently', () => {
    const rules: AutoApproveRules = { '1190001': MANUAL_ONLY, '1190002': OVERTIME_ONLY };
    expect(ids(planAutoApprovals(ALL, REPORTS, rules, NONE, [], OWNERS))).toEqual([anaManual.id, benOvertime.id]);
  });

  it('allowOvertime follows the owner\'s overtime toggle', () => {
    const rules: AutoApproveRules = { '1190001': MANUAL_ONLY, '1190002': ON };
    const plan = planAutoApprovals([anaManual, benManual], REPORTS, rules, NONE, [], OWNERS);
    expect(plan.map((p) => [p.item.id, p.allowOvertime])).toEqual([
      [anaManual.id, false],
      [benManual.id, true],
    ]);
  });

  it('carries the matched member', () => {
    const plan = planAutoApprovals([benManual], REPORTS, { '1190002': ON }, NONE, [], OWNERS);
    expect(plan[0].member).toBe(BEN);
  });

  it('orders the plan oldest first', () => {
    const rules: AutoApproveRules = { '1190001': ON, '1190002': ON };
    expect(ids(planAutoApprovals(ALL, REPORTS, rules, NONE, [], OWNERS))).toEqual([
      anaOvertime.id, // 10-19
      anaManual.id, // 10-20
      benManual.id, // 10-21
      benOvertime.id, // 10-22
    ]);
  });

  it('keeps input order for equal start times and does not mutate the items', () => {
    const a = manual(36401, [41], '2026-10-20T10:00:00Z');
    const b = manual(36401, [42], '2026-10-20T10:00:00Z');
    const input = [b, a];
    expect(ids(planAutoApprovals(input, REPORTS, { '1190001': ON }, NONE, [], owners([a, ANA], [b, ANA])))).toEqual([b.id, a.id]);
    expect(input).toEqual([b, a]);
  });

  it('skips ids in the skip set', () => {
    const rules: AutoApproveRules = { '1190001': ON };
    expect(ids(planAutoApprovals(ALL, REPORTS, rules, new Set([anaManual.id]), [], OWNERS))).toEqual([anaOvertime.id]);
  });

  it('skips MANUAL items with empty timecardIds, even with an owner', () => {
    const empty = manual(36401, [], '2026-10-20T10:00:00Z');
    expect(planAutoApprovals([empty], REPORTS, { '1190001': ON }, NONE, [], owners([empty, ANA]))).toEqual([]);
  });

  it('MANUAL needs a proven owner: none, or a null one, plans nothing, even when item.userId is the report\'s userId', () => {
    // The userId match the engine used to make: gone from the real path entirely
    const byUserId = manual(1190001, [51], '2026-10-20T10:00:00Z', 'Ana Ruiz');
    const rules: AutoApproveRules = { '1190001': ON };
    expect(planAutoApprovals([byUserId], REPORTS, rules, NONE)).toEqual([]);
    expect(planAutoApprovals([byUserId], REPORTS, rules, NONE, REPORTS, new Map())).toEqual([]);
    expect(planAutoApprovals([byUserId], REPORTS, rules, NONE, REPORTS, owners([byUserId, null]))).toEqual([]);
    // Overtime needs no owners map
    expect(ids(planAutoApprovals([anaOvertime], REPORTS, rules, NONE))).toEqual([anaOvertime.id]);
  });

  it('the owner must still be a direct report with Manual time on', () => {
    const former = member({ assignmentId: '80777', candidateId: '3000777', userId: '1190777', name: 'Former' });
    const item = manual(36401, [61], '2026-10-20T10:00:00Z');
    expect(planAutoApprovals([item], REPORTS, { '1190777': ON }, NONE, [], owners([item, former]))).toEqual([]);
    expect(planAutoApprovals([item], REPORTS, { '1190001': OVERTIME_ONLY }, NONE, [], owners([item, ANA]))).toEqual([]);
  });

  it('a proven owner row on a report\'s second team is planned for that report', () => {
    const anaOnOtherTeam = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Other' });
    const roster = [ANA, BEN, anaOnOtherTeam];
    const reports = directReports(roster, SELF_CANDIDATE_ID);
    const item = manual(36401, [62], '2026-10-20T10:00:00Z');
    const plan = planAutoApprovals([item], reports, { '1190001': MANUAL_ONLY }, NONE, roster, owners([item, anaOnOtherTeam]));
    expect(ids(plan)).toEqual([item.id]);
    expect(plan[0].member).toBe(ANA);
  });

  it('never approves an unknown person, even with a rule for that id', () => {
    const stranger = manual(4242, [51], '2026-10-20T10:00:00Z');
    expect(planAutoApprovals([stranger], REPORTS, { '4242': ON }, NONE, [], owners([stranger, null]))).toEqual([]);
  });

  it('overtime: covers a report\'s other assignment on the roster, never one off it', () => {
    const anaOnOtherTeam = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Other' });
    const roster = [ANA, BEN, anaOnOtherTeam];
    const reports = directReports(roster, SELF_CANDIDATE_ID);
    const onRoster = overtime(81, { assignmentId: 80099, personId: 1190001 });
    const offRoster = overtime(82, { assignmentId: 80777, personId: 1190001 });
    const plan = planAutoApprovals([onRoster, offRoster], reports, { '1190001': OVERTIME_ONLY }, NONE, roster);
    expect(ids(plan)).toEqual([onRoster.id]);
    expect(plan[0].member).toBe(ANA);
  });

  it('never approves an ambiguous match', () => {
    const benTwin = member({ assignmentId: '80077', candidateId: '3000077', userId: '1190002', name: 'Ben Twin' });
    expect(planAutoApprovals([benManual], [ANA, BEN, benTwin], { '1190002': ON }, NONE, [], OWNERS)).toEqual([]);
  });

  it('never approves the manager\'s own items (self is not a direct report)', () => {
    const self = member({ assignmentId: '79996', candidateId: SELF_CANDIDATE_ID, userId: '1190137', name: 'Me' });
    const reports = directReports([self, ANA], SELF_CANDIDATE_ID);
    const mine = manual(36400, [61], '2026-10-20T10:00:00Z');
    const myOvertime = overtime(62, { assignmentId: 79996, personId: 1190137 });
    expect(planAutoApprovals([mine, myOvertime], reports, { '1190137': ON }, NONE, [self, ANA], owners([mine, self]))).toEqual([]);
  });

  it('ignores inherited keys on the rules object', () => {
    const proto = manual(36401, [71], '2026-10-20T10:00:00Z');
    const rules = Object.create({ '1190001': ON }) as AutoApproveRules;
    expect(planAutoApprovals([proto], REPORTS, rules, NONE, [], owners([proto, ANA]))).toEqual([]);
  });
});

// ─── classifyApproveError ────────────────────────────────────────────────────

describe('classifyApproveError', () => {
  const api = (code?: string) => new ApiError(400, undefined, code ? { errorCode: code } : undefined);

  it('CROS-9300 (weekly limit exceeded) → over_limit', () => {
    expect(classifyApproveError(api('CROS-9300'))).toBe('over_limit');
  });

  it('CROS-9301 (weekly limit could not be verified) → over_limit', () => {
    expect(classifyApproveError(api('CROS-9301'))).toBe('over_limit');
  });

  it('CROS-9101 (deadline passed) → deadline_passed', () => {
    expect(classifyApproveError(api('CROS-9101'))).toBe('deadline_passed');
  });

  it('an outage (network, 5xx, 408, 429) → retrying', () => {
    expect(classifyApproveError(new NetworkError('offline'))).toBe('retrying');
    expect(classifyApproveError(new ApiError(500))).toBe('retrying');
    expect(classifyApproveError(new ApiError(503))).toBe('retrying');
    expect(classifyApproveError(new ApiError(408))).toBe('retrying');
    expect(classifyApproveError(new ApiError(429))).toBe('retrying');
    expect(classifyApproveError(new AuthError(401, undefined, { errorCode: AUTH_HTML_500 }))).toBe('retrying');
  });

  it('an unknown throw is treated as an outage, as isRetryableError does → retrying', () => {
    expect(classifyApproveError(new Error('boom'))).toBe('retrying');
    expect(classifyApproveError(new TypeError('Network request failed'))).toBe('retrying');
    expect(classifyApproveError(null)).toBe('retrying');
    expect(classifyApproveError(undefined)).toBe('retrying');
    // A bare string is not an error envelope: its text is never read as a code
    expect(classifyApproveError('CROS-9300')).toBe('retrying');
  });

  it('any other server answer (4xx, a real 401/403) → failed', () => {
    expect(classifyApproveError(api('CROS-0000'))).toBe('failed');
    expect(classifyApproveError(api())).toBe('failed');
    expect(classifyApproveError(new ApiError(409))).toBe('failed');
    expect(classifyApproveError(new ApiError(404))).toBe('failed');
    expect(classifyApproveError(new AuthError(401))).toBe('failed');
    expect(classifyApproveError(new AuthError(403))).toBe('failed');
    expect(classifyApproveError(new AuthResetError())).toBe('failed');
  });

  it('a CROS code wins over an outage status', () => {
    expect(classifyApproveError(new ApiError(503, undefined, { errorCode: 'CROS-9300' }))).toBe('over_limit');
    expect(classifyApproveError(new ApiError(500, undefined, { errorCode: 'CROS-9101' }))).toBe('deadline_passed');
  });

  it('reads errorCode from any error-shaped value', () => {
    expect(classifyApproveError({ errorCode: 'CROS-9300' })).toBe('over_limit');
  });
});

// ─── countEnabled ────────────────────────────────────────────────────────────

describe('countEnabled', () => {
  it('counts reports with at least one toggle on', () => {
    const rules: AutoApproveRules = {
      '1190001': MANUAL_ONLY,
      '1190002': OVERTIME_ONLY,
      '1190003': { manual: false, overtime: false },
    };
    expect(countEnabled(rules, REPORTS)).toBe(2);
  });

  it('ignores rules for people who are not in the reports list', () => {
    expect(countEnabled({ '9999999': ON, '1190001': ON }, REPORTS)).toBe(1);
  });

  it('ignores members without a userId', () => {
    expect(countEnabled({ '1190001': ON }, [member({ userId: null })])).toBe(0);
  });

  it('is 0 with no rules', () => {
    expect(countEnabled({}, REPORTS)).toBe(0);
  });
});
