// Tests: autoApproveView.ts — 1.2 manager auto-approve, the view helpers behind
// app/direct-reports.tsx and AutoApproveEntryRow: firstName, initialsOf, the enable
// confirmation copy (manual / overtime x waiting 0 / 1 / n / not known x the other
// toggle), the log's
// outcome and category labels, today's approved count (local calendar date) and the
// per-report pending counts (matched as the runner matches: the roster for overtime, the
// work-diary proof for manual time).

import {
  approvedTodayCount,
  categoryLabel,
  enableConfirmCopy,
  firstName,
  initialsOf,
  outcomeLabel,
  pendingCountsByMember,
} from '../autoApproveView';
import type { AutoApproveLogEntry, AutoApproveOutcome } from '../autoApprove';
import type { ManualApprovalItem, OvertimeApprovalItem } from '../approvals';
import type { ManualOwners } from '../manualOwnership';
import type { TeamMember } from '../../types/api';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    assignmentId: '80001',
    candidateId: '3000001',
    userId: '1190001',
    managerId: '2362707',
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
/** Ana's row on the manager's second team: directReports() drops it as a repeat. */
const ANA_SECOND = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Mobile' });

let seq = 0;

/** A pending-manual item. Its userId (a legacy id in live data) is never matched. */
function manual(userId = 36412): ManualApprovalItem {
  seq++;
  return {
    id: `mt-${seq}`,
    category: 'MANUAL',
    userId,
    fullName: 'Whoever',
    durationMinutes: 60,
    hours: '1.0',
    description: 'Work',
    startDateTime: '2026-10-20T10:00:00Z',
    type: 'WEB',
    timecardIds: [seq],
    weekStartDate: '2026-10-19',
  };
}

/** A pending-overtime item: userId is candidate.id (the avatar id), assignmentId assignment.id. */
function overtime(assignmentId: number | null, personId: number | null = null): OvertimeApprovalItem {
  seq++;
  return {
    id: `ot-${seq}`,
    category: 'OVERTIME',
    overtimeId: seq,
    userId: 3000001,
    fullName: 'Whoever',
    jobTitle: 'Engineer',
    durationMinutes: 120,
    hours: '2.0',
    cost: 100,
    description: 'Release',
    startDateTime: '2026-10-22T09:00:00Z',
    weekStartDate: '2026-10-19',
    assignmentId,
    personId,
  };
}

function logEntry(at: string, outcome: AutoApproveOutcome = 'approved', simulated?: boolean): AutoApproveLogEntry {
  seq++;
  return {
    id: `mt-${seq}`,
    personId: '1190001',
    name: 'Ana Ruiz',
    category: 'MANUAL',
    durationMinutes: 60,
    startDateTime: '2026-10-20T10:00:00Z',
    at,
    outcome,
    ...(simulated ? { simulated } : {}),
  };
}

/** An ISO time at a local wall-clock moment (the device's calendar, not UTC). */
function localIso(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(y, m, d, h, min).toISOString();
}

// ─── firstName / initialsOf ──────────────────────────────────────────────────

describe('firstName', () => {
  it('is the first word of the name', () => {
    expect(firstName('Ana Ruiz')).toBe('Ana');
    expect(firstName('Cher')).toBe('Cher');
  });

  it('ignores surrounding and repeated whitespace', () => {
    expect(firstName('  Ben   Okafor ')).toBe('Ben');
  });

  it("is 'this person' for a blank name", () => {
    expect(firstName('')).toBe('this person');
    expect(firstName('   ')).toBe('this person');
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words, uppercased', () => {
    expect(initialsOf('Ana Ruiz')).toBe('AR');
    expect(initialsOf('ana maria ruiz')).toBe('AM');
  });

  it('is one letter for a one-word name', () => {
    expect(initialsOf('cher')).toBe('C');
  });

  it('ignores surrounding and repeated whitespace', () => {
    expect(initialsOf('  ben   okafor ')).toBe('BO');
  });

  it("is '?' for a blank name", () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('  ')).toBe('?');
  });
});

// ─── enableConfirmCopy ───────────────────────────────────────────────────────

describe('enableConfirmCopy — manual time', () => {
  it('names the report in the title', () => {
    expect(enableConfirmCopy('manual', 'Ana Ruiz', 0, false).title).toBe("Auto-approve Ana's manual time?");
  });

  it('nothing waiting, Overtime off: no waiting clause, and over-limit time needs Overtime too', () => {
    expect(enableConfirmCopy('manual', 'Ana Ruiz', 0, false).message).toBe(
      "Hourglass will approve Ana's manual time whenever you open the app. " +
        'Manual time that would take Ana over the weekly limit is only approved when Overtime is on too.',
    );
  });

  it('one waiting: "the 1 request waiting now" (singular)', () => {
    const { message } = enableConfirmCopy('manual', 'Ana Ruiz', 1, false);
    expect(message).toContain('whenever you open the app, including the 1 request waiting now.');
  });

  it('several waiting: "the N requests waiting now" (plural)', () => {
    const { message } = enableConfirmCopy('manual', 'Ana Ruiz', 3, false);
    expect(message).toContain('whenever you open the app, including the 3 requests waiting now.');
  });

  it('Overtime already on: over-limit manual time is approved as well', () => {
    expect(enableConfirmCopy('manual', 'Ana Ruiz', 2, true).message).toBe(
      "Hourglass will approve Ana's manual time whenever you open the app, including the 2 requests waiting now. " +
        'Overtime is on too, so manual time that takes Ana over the weekly limit is approved as well.',
    );
  });

  it('the count not known yet (null): "any requests waiting now", with no number', () => {
    expect(enableConfirmCopy('manual', 'Ana Ruiz', null, false).message).toBe(
      "Hourglass will approve Ana's manual time whenever you open the app, including any requests waiting now. " +
        'Manual time that would take Ana over the weekly limit is only approved when Overtime is on too.',
    );
  });

  it.each([0, 1, 4, null])('the limit sentence follows the Overtime toggle (waiting %p)', (waiting) => {
    expect(enableConfirmCopy('manual', 'Ana Ruiz', waiting, false).message).toContain(
      'only approved when Overtime is on too',
    );
    expect(enableConfirmCopy('manual', 'Ana Ruiz', waiting, true).message).toContain('Overtime is on too, so');
  });
});

describe('enableConfirmCopy — overtime', () => {
  it('names the report in the title', () => {
    expect(enableConfirmCopy('overtime', 'Ben Okafor', 0, false).title).toBe("Auto-approve Ben's overtime?");
  });

  it('nothing waiting, Manual time off: no waiting clause, no limit sentence', () => {
    expect(enableConfirmCopy('overtime', 'Ben Okafor', 0, false).message).toBe(
      "Hourglass will approve Ben's overtime requests whenever you open the app.",
    );
  });

  it('one waiting', () => {
    expect(enableConfirmCopy('overtime', 'Ben Okafor', 1, false).message).toBe(
      "Hourglass will approve Ben's overtime requests whenever you open the app, including the 1 waiting now.",
    );
  });

  it('several waiting', () => {
    expect(enableConfirmCopy('overtime', 'Ben Okafor', 5, false).message).toContain(', including the 5 waiting now.');
  });

  it('Manual time already on: over-limit manual time will be approved too', () => {
    expect(enableConfirmCopy('overtime', 'Ben Okafor', 2, true).message).toBe(
      "Hourglass will approve Ben's overtime requests whenever you open the app, including the 2 waiting now. " +
        'Manual time that takes Ben over the weekly limit will be approved too.',
    );
  });

  it('the count not known yet (null): "any waiting now", with no number', () => {
    expect(enableConfirmCopy('overtime', 'Ben Okafor', null, false).message).toBe(
      "Hourglass will approve Ben's overtime requests whenever you open the app, including any waiting now.",
    );
  });

  it.each([0, 1, 4])('the limit sentence only appears with Manual time on (waiting %i)', (waiting) => {
    expect(enableConfirmCopy('overtime', 'Ben Okafor', waiting, false).message).not.toContain('weekly limit');
    expect(enableConfirmCopy('overtime', 'Ben Okafor', waiting, true).message).toContain('weekly limit');
  });
});

describe('enableConfirmCopy — a blank name', () => {
  it("says 'this person'", () => {
    expect(enableConfirmCopy('manual', '  ', 0, false).title).toBe("Auto-approve this person's manual time?");
    expect(enableConfirmCopy('overtime', '', 0, false).message).toContain("approve this person's overtime");
  });
});

// ─── outcomeLabel / categoryLabel ────────────────────────────────────────────

describe('outcomeLabel', () => {
  it('is null for an approval', () => {
    expect(outcomeLabel('approved')).toBeNull();
  });

  it('labels every other outcome', () => {
    expect(outcomeLabel('over_limit')).toBe('Over weekly limit — left for you');
    expect(outcomeLabel('deadline_passed')).toBe('Deadline passed');
    expect(outcomeLabel('retrying')).toBe("Couldn't reach Crossover — will try again");
    expect(outcomeLabel('failed')).toBe('Failed — left for you');
  });

  it('an outage is not labelled as left for the manager', () => {
    expect(outcomeLabel('retrying')).not.toContain('left for you');
    expect(outcomeLabel('retrying')).not.toBe(outcomeLabel('failed'));
  });
});

describe('categoryLabel', () => {
  it('names both categories', () => {
    expect(categoryLabel('MANUAL')).toBe('Manual time');
    expect(categoryLabel('OVERTIME')).toBe('Overtime');
  });
});

// ─── approvedTodayCount ──────────────────────────────────────────────────────

describe('approvedTodayCount', () => {
  const NOW = new Date(2026, 9, 27, 9, 30); // local 27 Oct, 09:30

  it('counts approvals on now\'s local calendar date, from local midnight to local midnight', () => {
    const log = [
      logEntry(localIso(2026, 9, 27, 0, 0)), // local midnight: today
      logEntry(localIso(2026, 9, 27, 9, 0)),
      logEntry(localIso(2026, 9, 27, 23, 59)), // later today
      logEntry(localIso(2026, 9, 26, 23, 59)), // a minute before local midnight: yesterday
      logEntry(localIso(2026, 9, 28, 0, 0)), // tomorrow
    ];
    expect(approvedTodayCount(log, NOW)).toBe(3);
  });

  it('is not fooled by the same day of another month or year', () => {
    const log = [logEntry(localIso(2026, 8, 27, 9, 0)), logEntry(localIso(2025, 9, 27, 9, 0))];
    expect(approvedTodayCount(log, NOW)).toBe(0);
  });

  it('counts simulated (preview) approvals', () => {
    expect(approvedTodayCount([logEntry(localIso(2026, 9, 27, 8, 0), 'approved', true)], NOW)).toBe(1);
  });

  it('ignores every outcome but approved', () => {
    const at = localIso(2026, 9, 27, 8, 0);
    const outcomes: AutoApproveOutcome[] = ['over_limit', 'deadline_passed', 'retrying', 'failed'];
    expect(approvedTodayCount(outcomes.map((o) => logEntry(at, o)), NOW)).toBe(0);
  });

  it('ignores entries with an invalid date', () => {
    const log = [logEntry('not a date'), logEntry(''), logEntry(localIso(2026, 9, 27, 8, 0))];
    expect(approvedTodayCount(log, NOW)).toBe(1);
  });

  it('is 0 for an empty log', () => {
    expect(approvedTodayCount([], NOW)).toBe(0);
  });
});

// ─── pendingCountsByMember ───────────────────────────────────────────────────

describe('pendingCountsByMember', () => {
  /** The work-diary proof (useManualOwners), item → owner row. */
  const proof = (...pairs: [ManualApprovalItem, TeamMember | null][]): ManualOwners =>
    new Map(pairs.map(([item, owner]) => [item.id, owner]));

  it('counts manual time by its proven owner and overtime by assignment, per report object', () => {
    const [a1, a2, b1] = [manual(), manual(), manual()];
    const counts = pendingCountsByMember(
      [a1, a2, overtime(80001), b1, overtime(80002), overtime(80002)],
      [ANA, BEN, CY],
      [],
      proof([a1, ANA], [a2, ANA], [b1, BEN]),
    );
    expect(counts.get(ANA)).toEqual({ manual: 2, overtime: 1 });
    expect(counts.get(BEN)).toEqual({ manual: 1, overtime: 2 });
  });

  it('has no entry for a report with nothing pending', () => {
    const item = manual();
    expect(pendingCountsByMember([item], [ANA, CY], [], proof([item, ANA])).has(CY)).toBe(false);
  });

  it('is keyed by the report object itself, not an equal copy', () => {
    const item = manual();
    const counts = pendingCountsByMember([item], [ANA], [], proof([item, ANA]));
    expect(counts.get(ANA)).toEqual({ manual: 1, overtime: 0 });
    expect(counts.get({ ...ANA })).toBeUndefined();
  });

  it('does not count manual time without a proof, even when its userId is a report\'s', () => {
    const byUserId = manual(1190001); // Ana's candidate.userId: never proof
    const unresolved = manual();
    const disproven = manual();
    const counts = pendingCountsByMember([byUserId, unresolved, disproven], [ANA, BEN], [], proof([disproven, null]));
    expect(counts.size).toBe(0);
    // Without any owners map at all, likewise
    expect(pendingCountsByMember([byUserId], [ANA, BEN]).size).toBe(0);
  });

  it('counts manual time proven on a report\'s second assignment for that report', () => {
    const item = manual();
    const counts = pendingCountsByMember([item], [ANA, BEN], [ANA, BEN, ANA_SECOND], proof([item, ANA_SECOND]));
    expect(counts.get(ANA)).toEqual({ manual: 1, overtime: 0 });
  });

  it('does not count overtime that matches nobody', () => {
    const counts = pendingCountsByMember(
      [
        overtime(99999, 1190001), // Ana's assignment off the manager's roster
        overtime(null, 1190001), // no assignment: never matched on personId
      ],
      [ANA, BEN],
    );
    expect(counts.size).toBe(0);
  });

  it('does not count ambiguous items (more than one report matches)', () => {
    const anaTwin = member({ assignmentId: '80001', candidateId: '3000077', userId: '1190001', name: 'Ana Twin' });
    const item = manual();
    const counts = pendingCountsByMember([item, overtime(80001)], [ANA, anaTwin], [], proof([item, ANA]));
    expect(counts.size).toBe(0);
  });

  it('never counts manual time for a report without a userId', () => {
    const noPerson = member({ userId: null });
    const item = manual();
    const counts = pendingCountsByMember([item, overtime(80001)], [noPerson], [], proof([item, noPerson]));
    // Overtime matches on the assignment, which the report still has
    expect(counts.get(noPerson)).toEqual({ manual: 0, overtime: 1 });
  });

  it('counts overtime on a report\'s second assignment through the roster, as the runner does', () => {
    const items = [overtime(80099, 1190001)];
    const roster = [ANA, BEN, ANA_SECOND];
    expect(pendingCountsByMember(items, [ANA, BEN], roster).get(ANA)).toEqual({ manual: 0, overtime: 1 });
    // Without the roster the deduped reports alone cannot place it
    expect(pendingCountsByMember(items, [ANA, BEN]).size).toBe(0);
  });

  it('is empty without items', () => {
    expect(pendingCountsByMember([], [ANA, BEN]).size).toBe(0);
  });
});
