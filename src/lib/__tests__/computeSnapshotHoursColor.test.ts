// Tests: computeSnapshotHoursColor helper (01-color-semantics)
// FR3: Overview snapshot hours — status-aware colour based on hours/weeklyLimit ratio
//
// Strategy: pure unit test of the exported helper function.
// The function lives in app/(tabs)/overview.tsx (module-level export).

import { computeSnapshotHoursColor } from '../../../app/(tabs)/overview';
import { colors } from '../colors';

// ─── FR3: computeSnapshotHoursColor ───────────────────────────────────────────

describe('computeSnapshotHoursColor — FR3 (01-color-semantics)', () => {
  // Happy path — on-track (>= 85%)
  it('40h / 40h limit (100%) → success', () => {
    expect(computeSnapshotHoursColor(40, 40)).toBe(colors.success);
  });

  it('34h / 40h limit (85%) → success', () => {
    expect(computeSnapshotHoursColor(34, 40)).toBe(colors.success);
  });

  // Happy path — warning (60–84%)
  it('30h / 40h limit (75%) → warning', () => {
    expect(computeSnapshotHoursColor(30, 40)).toBe(colors.warning);
  });

  it('24h / 40h limit (60%) → warning', () => {
    expect(computeSnapshotHoursColor(24, 40)).toBe(colors.warning);
  });

  // Happy path — critical (< 60%)
  it('20h / 40h limit (50%) → critical', () => {
    expect(computeSnapshotHoursColor(20, 40)).toBe(colors.critical);
  });

  it('0h / 40h limit (0%) → critical', () => {
    expect(computeSnapshotHoursColor(0, 40)).toBe(colors.critical);
  });

  // Edge case — weeklyLimit = 0 (no target configured)
  it('weeklyLimit = 0 → success (no target, not behind)', () => {
    expect(computeSnapshotHoursColor(40, 0)).toBe(colors.success);
  });

  it('weeklyLimit = 0, hours = 0 → success', () => {
    expect(computeSnapshotHoursColor(0, 0)).toBe(colors.success);
  });

  // Edge case — hours > weeklyLimit (overtime)
  it('hours > weeklyLimit (50/40, 125%) → success (overtime is on-track)', () => {
    expect(computeSnapshotHoursColor(50, 40)).toBe(colors.success);
  });
});
