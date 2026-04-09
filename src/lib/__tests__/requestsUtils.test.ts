// Tests: requestsUtils — FR2 (extractRejectionReason) + FR3 (groupSlotsIntoEntries)
// Spec: features/app/approvals-transparency/specs/01-my-requests-data

import { extractRejectionReason, groupSlotsIntoEntries } from '../requestsUtils';
import type { WorkDiarySlot } from '../../types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SlotAction = WorkDiarySlot['actions'][number];

function makeSlot(overrides: Partial<WorkDiarySlot> = {}): WorkDiarySlot {
  return {
    tags: [],
    autoTracker: true,
    status: 'APPROVED',
    memo: 'test memo',
    actions: [],
    ...overrides,
  };
}

function makeManualSlot(overrides: Partial<WorkDiarySlot> = {}): WorkDiarySlot {
  return makeSlot({ autoTracker: false, status: 'PENDING', ...overrides });
}

function makeRejectAction(comment: string): SlotAction {
  return {
    actionType: 'REJECT_MANUAL_TIME',
    comment,
    actionMadeBy: 123,
    createdDate: '2026-03-15T10:00:00Z',
  };
}

// ─── extractRejectionReason ───────────────────────────────────────────────────

describe('extractRejectionReason', () => {
  describe('FR2.1 — happy path: rejection action with comment', () => {
    it('returns the comment when REJECT_MANUAL_TIME action has a non-empty comment', () => {
      const actions: SlotAction[] = [makeRejectAction('Too many hours')];
      expect(extractRejectionReason(actions)).toBe('Too many hours');
    });

    it('returns comment from rejection action among multiple actions', () => {
      const actions: SlotAction[] = [
        { actionType: 'ADD_MANUAL_TIME', comment: '', actionMadeBy: 1, createdDate: '2026-03-15T09:00:00Z' },
        makeRejectAction('Needs documentation'),
        { actionType: 'SOME_OTHER', comment: 'irrelevant', actionMadeBy: 2, createdDate: '2026-03-15T11:00:00Z' },
      ];
      expect(extractRejectionReason(actions)).toBe('Needs documentation');
    });
  });

  describe('FR2.2 — no rejection action', () => {
    it('returns null when no REJECT_MANUAL_TIME action is present', () => {
      const actions: SlotAction[] = [
        { actionType: 'ADD_MANUAL_TIME', comment: 'submitted', actionMadeBy: 1, createdDate: '2026-03-15T09:00:00Z' },
        { actionType: 'APPROVE_MANUAL_TIME', comment: '', actionMadeBy: 2, createdDate: '2026-03-15T10:00:00Z' },
      ];
      expect(extractRejectionReason(actions)).toBeNull();
    });

    it('returns null for empty actions array', () => {
      expect(extractRejectionReason([])).toBeNull();
    });
  });

  describe('FR2.3 — empty comment on rejection action', () => {
    it('returns null when rejection action has empty string comment', () => {
      const actions: SlotAction[] = [makeRejectAction('')];
      expect(extractRejectionReason(actions)).toBeNull();
    });
  });

  describe('FR2.4 — does not throw', () => {
    it('does not throw for any valid input', () => {
      expect(() => extractRejectionReason([])).not.toThrow();
      expect(() => extractRejectionReason([makeRejectAction('reason')])).not.toThrow();
    });
  });
});

// ─── groupSlotsIntoEntries ────────────────────────────────────────────────────

describe('groupSlotsIntoEntries', () => {
  const DATE = '2026-03-15';

  describe('FR3.1 — grouping by memo', () => {
    it('groups two slots with the same memo into one entry with durationMinutes: 20', () => {
      const slots = [
        makeManualSlot({ memo: 'infra work', status: 'PENDING' }),
        makeManualSlot({ memo: 'infra work', status: 'PENDING' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result).toHaveLength(1);
      expect(result[0].durationMinutes).toBe(20);
      expect(result[0].memo).toBe('infra work');
    });

    it('creates separate entries for three slots with three distinct memos', () => {
      const slots = [
        makeManualSlot({ memo: 'task A' }),
        makeManualSlot({ memo: 'task B' }),
        makeManualSlot({ memo: 'task C' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result).toHaveLength(3);
      const memos = result.map((e) => e.memo).sort();
      expect(memos).toEqual(['task A', 'task B', 'task C']);
    });

    it('returns a single entry with durationMinutes: 10 for a single slot', () => {
      const slots = [makeManualSlot({ memo: 'solo task' })];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result).toHaveLength(1);
      expect(result[0].durationMinutes).toBe(10);
    });
  });

  describe('FR3.2 — filtering autoTracker', () => {
    it('returns [] for an empty slots array', () => {
      expect(groupSlotsIntoEntries([], DATE)).toEqual([]);
    });

    it('returns [] when all slots have autoTracker: true', () => {
      const slots = [
        makeSlot({ autoTracker: true, memo: 'auto tracked' }),
        makeSlot({ autoTracker: true, memo: 'also auto' }),
      ];
      expect(groupSlotsIntoEntries(slots, DATE)).toEqual([]);
    });

    it('only includes manual slots when mixed with auto-tracked slots', () => {
      const slots = [
        makeSlot({ autoTracker: true, memo: 'auto' }),
        makeManualSlot({ memo: 'manual only' }),
        makeSlot({ autoTracker: true, memo: 'also auto' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result).toHaveLength(1);
      expect(result[0].memo).toBe('manual only');
    });
  });

  describe('FR3.3 — edge cases for memo', () => {
    it('treats undefined memo as empty string without throwing', () => {
      const slot = makeManualSlot({ memo: undefined as unknown as string });
      expect(() => groupSlotsIntoEntries([slot], DATE)).not.toThrow();
      const result = groupSlotsIntoEntries([slot], DATE);
      expect(result).toHaveLength(1);
      expect(result[0].memo).toBe('');
    });
  });

  describe('FR3.4 — composite id format', () => {
    it('sets entry id to "{date}|{memo}"', () => {
      const slots = [makeManualSlot({ memo: 'fix bug' })];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].id).toBe(`${DATE}|fix bug`);
    });

    it('sets entry id using empty string memo when memo is undefined', () => {
      const slot = makeManualSlot({ memo: undefined as unknown as string });
      const result = groupSlotsIntoEntries([slot], DATE);
      expect(result[0].id).toBe(`${DATE}|`);
    });
  });

  describe('FR3.5 — worst-case status aggregation', () => {
    it('sets status to REJECTED when group contains APPROVED and REJECTED slots', () => {
      const slots = [
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
        makeManualSlot({ memo: 'work', status: 'REJECTED', actions: [makeRejectAction('No')] }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].status).toBe('REJECTED');
    });

    it('sets status to PENDING when group contains APPROVED and PENDING slots', () => {
      const slots = [
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
        makeManualSlot({ memo: 'work', status: 'PENDING' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].status).toBe('PENDING');
    });

    it('sets status to REJECTED when group has PENDING, APPROVED, and REJECTED slots', () => {
      const slots = [
        makeManualSlot({ memo: 'work', status: 'PENDING' }),
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
        makeManualSlot({ memo: 'work', status: 'REJECTED', actions: [makeRejectAction('Denied')] }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].status).toBe('REJECTED');
    });

    it('sets status to APPROVED when all slots are APPROVED', () => {
      const slots = [
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].status).toBe('APPROVED');
    });
  });

  describe('FR3.6 — rejection reason extraction', () => {
    it('populates rejectionReason when status is REJECTED', () => {
      const slots = [
        makeManualSlot({
          memo: 'disputed',
          status: 'REJECTED',
          actions: [makeRejectAction('Duplicate submission')],
        }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].rejectionReason).toBe('Duplicate submission');
    });

    it('sets rejectionReason to null when status is not REJECTED', () => {
      const slots = [makeManualSlot({ memo: 'pending work', status: 'PENDING' })];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].rejectionReason).toBeNull();
    });

    it('sets rejectionReason to null when REJECTED action has empty comment', () => {
      const slots = [
        makeManualSlot({
          memo: 'rejected no reason',
          status: 'REJECTED',
          actions: [makeRejectAction('')],
        }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].rejectionReason).toBeNull();
    });
  });

  describe('FR3.7 — date is set correctly', () => {
    it('sets entry date to the passed date parameter', () => {
      const slots = [makeManualSlot({ memo: 'work' })];
      const result = groupSlotsIntoEntries(slots, '2026-03-10');
      expect(result[0].date).toBe('2026-03-10');
    });
  });
});
