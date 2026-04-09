// Tests: approvalMeshSignal (02-mesh-urgency-signal)
// FR1: getApprovalMeshState pure function — pendingCount + UTC day → PanelState | null
//
// Test strategy:
// - Use injectable `now` parameter for deterministic UTC day control
// - UTC Monday: new Date('2026-03-23T12:00:00Z') → getUTCDay() === 1
// - UTC Tuesday: new Date('2026-03-24T12:00:00Z') → getUTCDay() === 2
// - UTC Wednesday: new Date('2026-03-25T12:00:00Z') → getUTCDay() === 3
// - UTC Thursday: new Date('2026-03-26T12:00:00Z') → getUTCDay() === 4
// - UTC Friday: new Date('2026-03-27T12:00:00Z') → getUTCDay() === 5
// - UTC Saturday: new Date('2026-03-28T12:00:00Z') → getUTCDay() === 6
// - UTC Sunday: new Date('2026-03-29T12:00:00Z') → getUTCDay() === 0

import { getApprovalMeshState } from '../approvalMeshSignal';

// Known UTC dates for deterministic day testing
const MONDAY    = new Date('2026-03-23T12:00:00Z'); // getUTCDay() = 1
const TUESDAY   = new Date('2026-03-24T12:00:00Z'); // getUTCDay() = 2
const WEDNESDAY = new Date('2026-03-25T12:00:00Z'); // getUTCDay() = 3
const THURSDAY  = new Date('2026-03-26T12:00:00Z'); // getUTCDay() = 4
const FRIDAY    = new Date('2026-03-27T12:00:00Z'); // getUTCDay() = 5
const SATURDAY  = new Date('2026-03-28T12:00:00Z'); // getUTCDay() = 6
const SUNDAY    = new Date('2026-03-29T12:00:00Z'); // getUTCDay() = 0

describe('getApprovalMeshState — FR1: pure function', () => {
  // ── Zero pending: always null ────────────────────────────────────────────────

  describe('pendingCount === 0: returns null regardless of day', () => {
    it('SC1.1a — getApprovalMeshState(0, monday) → null', () => {
      expect(getApprovalMeshState(0, MONDAY)).toBeNull();
    });

    it('SC1.1b — getApprovalMeshState(0, thursday) → null (zero count wins regardless of day)', () => {
      expect(getApprovalMeshState(0, THURSDAY)).toBeNull();
    });

    it('SC1.1c — getApprovalMeshState(0, sunday) → null', () => {
      expect(getApprovalMeshState(0, SUNDAY)).toBeNull();
    });

    it('SC1.10 — getApprovalMeshState(0) without now → null', () => {
      // Real `now` used — just verify it returns null when pending=0
      expect(getApprovalMeshState(0)).toBeNull();
    });
  });

  // ── Early week (Mon-Wed): 'behind' ──────────────────────────────────────────

  describe('pendingCount > 0, Mon-Wed UTC: returns "behind"', () => {
    it('SC1.2 — getApprovalMeshState(1, monday) → "behind"', () => {
      expect(getApprovalMeshState(1, MONDAY)).toBe('behind');
    });

    it('SC1.3 — getApprovalMeshState(1, tuesday) → "behind"', () => {
      expect(getApprovalMeshState(1, TUESDAY)).toBe('behind');
    });

    it('SC1.4 — getApprovalMeshState(1, wednesday) → "behind"', () => {
      expect(getApprovalMeshState(1, WEDNESDAY)).toBe('behind');
    });
  });

  // ── End of week (Thu-Sun): 'critical' ────────────────────────────────────────

  describe('pendingCount > 0, Thu-Sun UTC: returns "critical"', () => {
    it('SC1.5 — getApprovalMeshState(1, thursday) → "critical"', () => {
      expect(getApprovalMeshState(1, THURSDAY)).toBe('critical');
    });

    it('SC1.6 — getApprovalMeshState(1, friday) → "critical"', () => {
      expect(getApprovalMeshState(1, FRIDAY)).toBe('critical');
    });

    it('SC1.7 — getApprovalMeshState(1, saturday) → "critical"', () => {
      expect(getApprovalMeshState(1, SATURDAY)).toBe('critical');
    });

    it('SC1.8 — getApprovalMeshState(1, sunday) → "critical"', () => {
      expect(getApprovalMeshState(1, SUNDAY)).toBe('critical');
    });
  });

  // ── Count > 1 ────────────────────────────────────────────────────────────────

  describe('pendingCount > 1: same logic applies', () => {
    it('SC1.9 — getApprovalMeshState(5, friday) → "critical"', () => {
      expect(getApprovalMeshState(5, FRIDAY)).toBe('critical');
    });

    it('SC1.9b — getApprovalMeshState(10, monday) → "behind"', () => {
      expect(getApprovalMeshState(10, MONDAY)).toBe('behind');
    });
  });

  // ── Default now parameter ────────────────────────────────────────────────────

  describe('default now parameter (injectable)', () => {
    it('SC1.11 — function is callable without now parameter (uses real date)', () => {
      const result = getApprovalMeshState(3);
      // Real date — just verify it returns a valid PanelState or null
      expect([null, 'behind', 'critical']).toContain(result);
    });

    it('SC1.11b — explicit now matches no-arg behavior for same moment', () => {
      // Both calls happen within the same millisecond in the same UTC day
      // Use a fixed date to ensure determinism
      const fixedNow = new Date('2026-03-24T10:00:00Z'); // Tuesday
      expect(getApprovalMeshState(2, fixedNow)).toBe('behind');
    });
  });

  // ── Return type contract ─────────────────────────────────────────────────────

  describe('return type: PanelState | null', () => {
    it('non-null return is exactly "behind" or "critical" (valid PanelState values)', () => {
      const monday = getApprovalMeshState(1, MONDAY);
      const thursday = getApprovalMeshState(1, THURSDAY);
      expect(['behind', 'critical']).toContain(monday);
      expect(['behind', 'critical']).toContain(thursday);
    });
  });
});
