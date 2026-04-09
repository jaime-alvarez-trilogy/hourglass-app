// Tests: computeAnnualProjection — 02-earnings-pace-projection FR1
//
// FR1: computeAnnualProjection(earnings: number[]): number
//   - Excludes last entry (partial current week)
//   - Excludes zero values (weeks with no data)
//   - Returns 0 if fewer than 2 completed non-zero weeks
//   - EWMA with alpha=0.3: ewma = alpha * current + (1-alpha) * ewma
//   - Returns ewma * 52
//
// Success criteria:
//   SC1.1 — [] → 0 (no data at all)
//   SC1.2 — [2000, 0] → 0 (only 1 non-zero completed week after excluding last)
//   SC1.3 — [2000, 2000, 2000] → 2000 * 52 (stable input, current week excluded)
//   SC1.4 — EWMA weights recent weeks more than older weeks
//   SC1.5 — Excludes zero weeks from EWMA calculation
//   SC1.6 — Excludes last entry as partial current week

import { computeAnnualProjection } from '../overviewUtils';

describe('computeAnnualProjection (02-earnings-pace-projection FR1)', () => {
  // ── SC1.1: Empty input ───────────────────────────────────────────────────────

  it('SC1.1 — [] → 0 (no data)', () => {
    expect(computeAnnualProjection([])).toBe(0);
  });

  // ── SC1.2: Not enough completed non-zero weeks ───────────────────────────────

  it('SC1.2 — [2000, 0] → 0 (zero filtered, only 1 non-zero completed; need ≥ 2)', () => {
    // completed = slice(0,-1) = [2000], filter(>0) = [2000] — only 1 non-zero → 0
    // Wait: [2000, 0] → slice(0,-1) = [2000] → filter(>0) = [2000] → length=1
    // Spec says <2 completed non-zero → 0
    expect(computeAnnualProjection([2000, 0])).toBe(0);
  });

  it('SC1.2 — [0, 2000] → 0 (only 1 completed non-zero after last excluded)', () => {
    // slice(0,-1) = [0] → filter(>0) = [] → length=0 → 0
    expect(computeAnnualProjection([0, 2000])).toBe(0);
  });

  it('SC1.2 — [2000] → 0 (single entry = current week, no completed weeks)', () => {
    // slice(0,-1) = [] → 0
    expect(computeAnnualProjection([2000])).toBe(0);
  });

  it('SC1.2 — [0, 0, 2000] → 0 (all completed weeks are zero)', () => {
    // slice(0,-1) = [0, 0] → filter(>0) = [] → 0
    expect(computeAnnualProjection([0, 0, 2000])).toBe(0);
  });

  // ── SC1.3: Stable earnings → ewma = stable value → projection = value * 52 ──

  it('SC1.3 — [2000, 2000, 2000] → 2000 * 52 (stable, current week excluded)', () => {
    // completed = [2000, 2000] (last excluded), both non-zero
    // ewma start = 2000, next = 0.3*2000 + 0.7*2000 = 2000
    // projection = 2000 * 52 = 104000
    expect(computeAnnualProjection([2000, 2000, 2000])).toBeCloseTo(2000 * 52, 0);
  });

  it('SC1.3 — [1000, 1000, 1000, 1000, 1000] → 1000 * 52 (stable multi-week)', () => {
    // 4 completed non-zero weeks, all 1000 → ewma stays 1000
    expect(computeAnnualProjection([1000, 1000, 1000, 1000, 1000])).toBeCloseTo(1000 * 52, 0);
  });

  // ── SC1.4: EWMA weights recent weeks more than older weeks ───────────────────

  it('SC1.4 — recent high week pulls ewma up: [1000, 1000, 3000, partial]', () => {
    // completed = [1000, 1000, 3000]
    // ewma0 = 1000
    // ewma1 = 0.3*1000 + 0.7*1000 = 1000
    // ewma2 = 0.3*3000 + 0.7*1000 = 900 + 700 = 1600
    // projection = 1600 * 52 = 83200
    const result = computeAnnualProjection([1000, 1000, 3000, 999]);
    expect(result).toBeGreaterThan(1000 * 52); // pulled up by recent high
    expect(result).toBeLessThan(3000 * 52);    // not fully at recent level
    expect(result).toBeCloseTo(1600 * 52, 0);
  });

  it('SC1.4 — recent low week pulls ewma down: [3000, 3000, 1000, partial]', () => {
    // completed = [3000, 3000, 1000]
    // ewma0 = 3000
    // ewma1 = 0.3*3000 + 0.7*3000 = 3000
    // ewma2 = 0.3*1000 + 0.7*3000 = 300 + 2100 = 2400
    // projection = 2400 * 52 = 124800
    const result = computeAnnualProjection([3000, 3000, 1000, 999]);
    expect(result).toBeLessThan(3000 * 52); // pulled down by recent low
    expect(result).toBeGreaterThan(1000 * 52); // not fully at recent level
    expect(result).toBeCloseTo(2400 * 52, 0);
  });

  it('SC1.4 — alpha=0.3 EWMA: [1000, 2000, 0_partial] manual verification', () => {
    // completed = [1000, 2000] (last=0 excluded)
    // ewma0 = 1000
    // ewma1 = 0.3*2000 + 0.7*1000 = 600 + 700 = 1300
    // projection = 1300 * 52 = 67600
    expect(computeAnnualProjection([1000, 2000, 0])).toBeCloseTo(1300 * 52, 0);
  });

  // ── SC1.5: Excludes zero weeks from EWMA calculation ─────────────────────────

  it('SC1.5 — zero weeks skipped: [1000, 0, 2000, partial]', () => {
    // completed = [1000, 0, 2000] → filter(>0) = [1000, 2000]
    // ewma0 = 1000
    // ewma1 = 0.3*2000 + 0.7*1000 = 600 + 700 = 1300
    // projection = 1300 * 52 = 67600
    const withZero = computeAnnualProjection([1000, 0, 2000, 999]);
    const withoutZero = computeAnnualProjection([1000, 2000, 999]);
    // Should be equivalent since zero is excluded
    expect(withZero).toBeCloseTo(withoutZero, 0);
  });

  it('SC1.5 — multiple zeros skipped: [2000, 0, 0, 2000, partial] → same as [2000, 2000, partial]', () => {
    const withZeros = computeAnnualProjection([2000, 0, 0, 2000, 999]);
    const withoutZeros = computeAnnualProjection([2000, 2000, 999]);
    expect(withZeros).toBeCloseTo(withoutZeros, 0);
  });

  // ── SC1.6: Last entry excluded as partial current week ───────────────────────

  it('SC1.6 — last entry (partial week) is excluded regardless of value', () => {
    // [1000, 2000, 9999] — 9999 is current week, excluded
    // completed = [1000, 2000]
    // ewma0=1000, ewma1=0.3*2000+0.7*1000=1300 → 1300*52
    const result = computeAnnualProjection([1000, 2000, 9999]);
    expect(result).toBeCloseTo(1300 * 52, 0);
  });

  it('SC1.6 — same result regardless of current week value', () => {
    const resultA = computeAnnualProjection([1000, 2000, 500]);
    const resultB = computeAnnualProjection([1000, 2000, 9999]);
    expect(resultA).toBeCloseTo(resultB, 0);
  });

  // ── Minimum 2 non-zero completed weeks threshold ──────────────────────────────

  it('exactly 2 non-zero completed weeks → returns projection (not 0)', () => {
    // [1000, 2000, partial] → completed = [1000, 2000] → 2 non-zero → OK
    expect(computeAnnualProjection([1000, 2000, 0])).toBeGreaterThan(0);
  });
});
