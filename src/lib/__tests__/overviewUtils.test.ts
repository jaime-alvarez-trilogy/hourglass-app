// Tests: overviewUtils — 03-overview-hero FR3
//
// FR3: computeEarningsPace pure function
//   SC3.1 — [100, 100, 100, 100] → 1.0 (current equals prior average)
//   SC3.2 — [80, 80, 80, 120] → 1.5 (strong — current 120 vs prior avg 80)
//   SC3.3 — [100, 100, 100, 60] → 0.6 (behind — current 60 vs prior avg 100)
//   SC3.4 — [100, 100, 100, 0] → 0.0 (critical — no earnings this period)
//   SC3.5 — [100] (length 1) → 1.0 (no prior data, assume strong)
//   SC3.6 — [] (empty) → 1.0 (no data, assume strong)
//   SC3.7 — prior average uses earnings.slice(0, -1)
//   SC3.8 — division by zero guard: if prior avg = 0, return 1.0

import { computeEarningsPace } from '../overviewUtils';

describe('computeEarningsPace (03-overview-hero FR3)', () => {
  // ── Core value cases ────────────────────────────────────────────────────────

  it('SC3.1 — equal weeks [100,100,100,100] → 1.0 (current equals prior avg)', () => {
    expect(computeEarningsPace([100, 100, 100, 100])).toBeCloseTo(1.0);
  });

  it('SC3.2 — strong pace [80,80,80,120] → 1.5 (current 120 vs prior avg 80)', () => {
    expect(computeEarningsPace([80, 80, 80, 120])).toBeCloseTo(1.5);
  });

  it('SC3.3 — behind pace [100,100,100,60] → 0.6 (current 60 vs prior avg 100)', () => {
    expect(computeEarningsPace([100, 100, 100, 60])).toBeCloseTo(0.6);
  });

  it('SC3.4 — critical [100,100,100,0] → 0.0 (no earnings this period)', () => {
    expect(computeEarningsPace([100, 100, 100, 0])).toBeCloseTo(0.0);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it('SC3.5 — length 1 → 1.0 (no prior data, assume strong)', () => {
    expect(computeEarningsPace([100])).toBe(1.0);
  });

  it('SC3.6 — empty array → 1.0 (no data, assume strong)', () => {
    expect(computeEarningsPace([])).toBe(1.0);
  });

  it('SC3.7 — uses only prior entries (slice 0..-1): [50,150,100] → 1.0 (current=100 vs prior avg=(50+150)/2=100)', () => {
    // prior = [50, 150], avg = 100; current = 100; ratio = 1.0
    expect(computeEarningsPace([50, 150, 100])).toBeCloseTo(1.0);
  });

  it('SC3.7 — window=2: [80, 160] → 2.0 (prior=[80], current=160)', () => {
    expect(computeEarningsPace([80, 160])).toBeCloseTo(2.0);
  });

  it('SC3.8 — division by zero guard: prior avg=0 → 1.0', () => {
    // All prior weeks have zero earnings
    expect(computeEarningsPace([0, 0, 0, 100])).toBe(1.0);
  });

  it('SC3.8 — prior avg=0 edge: [0,0,0,0] → 1.0 (all zero, guard applies)', () => {
    expect(computeEarningsPace([0, 0, 0, 0])).toBe(1.0);
  });

  // ── Additional precision cases ──────────────────────────────────────────────

  it('12-week window: last entry / avg of prior 11', () => {
    const weeks = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 500];
    // prior avg = 1000, current = 500 → ratio = 0.5
    expect(computeEarningsPace(weeks)).toBeCloseTo(0.5);
  });

  it('variable prior avg: [200, 400, 300] → 1.0 (prior avg=300, current=300)', () => {
    expect(computeEarningsPace([200, 400, 300])).toBeCloseTo(1.0);
  });
});
