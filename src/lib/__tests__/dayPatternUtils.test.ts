// Tests: computeDayWindowAvgs pure function — 01-computation FR1–FR7
//
// FR1: constants
//   SC1.1 — MIN_PRIOR_WEEKS equals 2
//   SC1.2 — TREND_THRESHOLD equals 0.5
//
// FR2: DayWindowResult type (compile-time, verified by import shape)
//   SC2.1 — DayWindowResult importable from dayPatternUtils
//   SC2.2 — type has all four fields with correct signatures
//
// FR3: happy path — 4W window
//   SC3.1 — 8 valid snapshots, 4W → validWeeksInCurrent=4, validWeeksInPrior=4, prev!==null
//   SC3.2 — current weeks Mon=8h → current[0] ≈ 8.0
//   SC3.3 — prior weeks Mon=4h → prev[0] ≈ 4.0
//   SC3.4 — current.length===7 and prev.length===7
//
// FR3: happy path — 12W window
//   SC3.5 — 24 valid snapshots, 12W → both groups computed, prev!==null
//   SC3.6 — prior group selects oldest 12, not same 12 as current
//
// FR4: 24W window
//   SC4.1 — any snapshots, window=24 → prev===null
//   SC4.2 — validWeeksInPrior===0 when window=24
//
// FR5: insufficient prior data
//   SC5.1 — 5 valid snapshots, 4W → prior has 1 valid week → prev===null
//   SC5.2 — 6 valid snapshots, 4W → prior has 2 valid weeks → prev!==null
//
// FR6: invalid week filtering
//   SC6.1 — 4 valid + 4 missing dailyHours, 4W → only valid ones averaged
//   SC6.2 — snapshot with all-zero dailyHours is excluded
//   SC6.3 — snapshot with dailyHours===undefined is excluded
//   SC6.4 — empty array → current=zeros, prev=null, validWeeksInCurrent=0
//
// FR7: output shape invariants
//   SC7.1 — current always has exactly 7 elements
//   SC7.2 — when prev!==null, prev has exactly 7 elements
//   SC7.3 — all values are finite (no NaN, no Infinity)

import {
  MIN_PRIOR_WEEKS,
  TREND_THRESHOLD,
  computeDayWindowAvgs,
  type DayWindowResult,
} from '../dayPatternUtils';
import type { WeeklySnapshot } from '../weeklyHistory';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a WeeklySnapshot with a specific dailyHours pattern. */
function snap(weekStart: string, dailyHours?: number[]): WeeklySnapshot {
  return {
    weekStart,
    hours: dailyHours ? dailyHours.reduce((a, b) => a + b, 0) : 0,
    earnings: 0,
    aiPct: 0,
    brainliftHours: 0,
    dailyHours,
  };
}

/** Build N snapshots with identical dailyHours, oldest-first. */
function makeSnaps(n: number, dailyHours: number[], startOffset = 0): WeeklySnapshot[] {
  return Array.from({ length: n }, (_, i) => {
    const weekNum = startOffset + i + 1;
    return snap(`2025-${String(weekNum).padStart(2, '0')}-01`, [...dailyHours]);
  });
}

/** Flat 7-day pattern: every day same value. */
const flat = (h: number) => Array(7).fill(h) as number[];

// ─── FR1: Constants ───────────────────────────────────────────────────────────

describe('constants', () => {
  it('SC1.1: MIN_PRIOR_WEEKS equals 2', () => {
    expect(MIN_PRIOR_WEEKS).toBe(2);
  });

  it('SC1.2: TREND_THRESHOLD equals 0.5', () => {
    expect(TREND_THRESHOLD).toBe(0.5);
  });
});

// ─── FR2: DayWindowResult type ───────────────────────────────────────────────

describe('DayWindowResult type', () => {
  it('SC2.1 + SC2.2: interface is importable and has all four fields', () => {
    // This test is primarily a compile-time check. At runtime we verify shape via result.
    const result = computeDayWindowAvgs([], 4);
    // Verify all four fields are present with correct types
    expect(typeof result.validWeeksInCurrent).toBe('number');
    expect(typeof result.validWeeksInPrior).toBe('number');
    expect(Array.isArray(result.current)).toBe(true);
    // prev is either null or an array
    expect(result.prev === null || Array.isArray(result.prev)).toBe(true);
    // TypeScript compile check: assignment to DayWindowResult should type-check
    const typed: DayWindowResult = result;
    expect(typed).toBeDefined();
  });
});

// ─── FR3: Happy path — 4W window ─────────────────────────────────────────────

describe('computeDayWindowAvgs — happy path 4W', () => {
  // 8 snapshots: prior group = snaps 1–4 (Mon=4h), current group = snaps 5–8 (Mon=8h)
  const priorSnaps = makeSnaps(4, [4, 4, 4, 4, 4, 0, 0]); // Mon=4h, Tue-Fri=4h, Sat/Sun=0
  const currentSnaps = makeSnaps(4, [8, 4, 4, 4, 4, 0, 0], 4); // Mon=8h, Tue-Fri=4h
  const snapshots = [...priorSnaps, ...currentSnaps];

  it('SC3.1: validWeeksInCurrent=4, validWeeksInPrior=4, prev!==null', () => {
    const result = computeDayWindowAvgs(snapshots, 4);
    expect(result.validWeeksInCurrent).toBe(4);
    expect(result.validWeeksInPrior).toBe(4);
    expect(result.prev).not.toBeNull();
  });

  it('SC3.2: current weeks Mon=8h → current[0] ≈ 8.0', () => {
    const result = computeDayWindowAvgs(snapshots, 4);
    expect(result.current[0]).toBeCloseTo(8.0, 5);
  });

  it('SC3.3: prior weeks Mon=4h → prev[0] ≈ 4.0', () => {
    const result = computeDayWindowAvgs(snapshots, 4);
    expect(result.prev![0]).toBeCloseTo(4.0, 5);
  });

  it('SC3.4: current.length===7 and prev.length===7', () => {
    const result = computeDayWindowAvgs(snapshots, 4);
    expect(result.current).toHaveLength(7);
    expect(result.prev).toHaveLength(7);
  });
});

// ─── FR3: Happy path — 12W window ────────────────────────────────────────────

describe('computeDayWindowAvgs — happy path 12W', () => {
  // 24 snapshots: prior group = snaps 1–12 (Mon=2h), current group = snaps 13–24 (Mon=6h)
  const priorSnaps = makeSnaps(12, [2, 2, 2, 2, 2, 0, 0]);
  const currentSnaps = makeSnaps(12, [6, 2, 2, 2, 2, 0, 0], 12);
  const snapshots = [...priorSnaps, ...currentSnaps];

  it('SC3.5: 24 valid snapshots, 12W → both groups computed, prev!==null', () => {
    const result = computeDayWindowAvgs(snapshots, 12);
    expect(result.validWeeksInCurrent).toBe(12);
    expect(result.validWeeksInPrior).toBe(12);
    expect(result.prev).not.toBeNull();
  });

  it('SC3.6: prior group selects oldest 12 (Mon=2h), not same 12 as current (Mon=6h)', () => {
    const result = computeDayWindowAvgs(snapshots, 12);
    // current group is snaps 13–24 (Mon=6h)
    expect(result.current[0]).toBeCloseTo(6.0, 5);
    // prior group is snaps 1–12 (Mon=2h)
    expect(result.prev![0]).toBeCloseTo(2.0, 5);
  });
});

// ─── FR4: 24W window ─────────────────────────────────────────────────────────

describe('computeDayWindowAvgs — 24W window', () => {
  const snapshots = makeSnaps(24, flat(4));

  it('SC4.1: any snapshots, window=24 → prev===null', () => {
    const result = computeDayWindowAvgs(snapshots, 24);
    expect(result.prev).toBeNull();
  });

  it('SC4.2: validWeeksInPrior===0 when window=24', () => {
    const result = computeDayWindowAvgs(snapshots, 24);
    expect(result.validWeeksInPrior).toBe(0);
  });

  it('SC4.1 edge: empty snapshots, window=24 → prev===null', () => {
    const result = computeDayWindowAvgs([], 24);
    expect(result.prev).toBeNull();
  });
});

// ─── FR5: Insufficient prior data ────────────────────────────────────────────

describe('computeDayWindowAvgs — insufficient prior data', () => {
  it('SC5.1: 5 valid snapshots, 4W → prior has 1 valid week → prev===null', () => {
    // current group = last 4, prior group = slice(-8,-4) = snaps[0..0] = 1 snap
    const snapshots = makeSnaps(5, flat(4));
    const result = computeDayWindowAvgs(snapshots, 4);
    expect(result.prev).toBeNull();
    // current should have 4 valid weeks
    expect(result.validWeeksInCurrent).toBe(4);
    // prior valid weeks is 1 (below MIN_PRIOR_WEEKS)
    expect(result.validWeeksInPrior).toBe(0); // set to 0 when prev=null per spec
  });

  it('SC5.2: 6 valid snapshots, 4W → prior has 2 valid weeks → prev!==null', () => {
    // current group = last 4, prior group = slice(-8,-4) = snaps[0..1] = 2 snaps
    const snapshots = makeSnaps(6, flat(4));
    const result = computeDayWindowAvgs(snapshots, 4);
    expect(result.prev).not.toBeNull();
    expect(result.validWeeksInCurrent).toBe(4);
    expect(result.validWeeksInPrior).toBe(2);
  });
});

// ─── FR6: Invalid week filtering ─────────────────────────────────────────────

describe('computeDayWindowAvgs — invalid week filtering', () => {
  it('SC6.1: 4 valid + 4 missing dailyHours, 4W → only valid ones averaged', () => {
    // 8 total snapshots, oldest 4 have no dailyHours, newest 4 have Mon=6h
    const invalid = Array.from({ length: 4 }, (_, i) =>
      snap(`2025-0${i + 1}-01`, undefined),
    );
    const valid = makeSnaps(4, [6, 2, 2, 2, 2, 0, 0], 4);
    const snapshots = [...invalid, ...valid];

    const result = computeDayWindowAvgs(snapshots, 4);
    // Current group = last 4 (all valid with Mon=6h)
    expect(result.validWeeksInCurrent).toBe(4);
    expect(result.current[0]).toBeCloseTo(6.0, 5);
  });

  it('SC6.2: snapshot with all-zero dailyHours is excluded', () => {
    const zeroWeek = snap('2025-01-01', [0, 0, 0, 0, 0, 0, 0]);
    const validWeeks = makeSnaps(4, flat(4), 1);
    // 5 total; current window=4 picks last 4 (all valid), prior window picks zeroWeek only
    const snapshots = [zeroWeek, ...validWeeks];

    const result = computeDayWindowAvgs(snapshots, 4);
    // validWeeksInCurrent = 4 (the four valid ones)
    expect(result.validWeeksInCurrent).toBe(4);
    // Prior group has 1 snap (zeroWeek) which is invalid → validWeeksInPrior = 0 (filtered out)
    expect(result.prev).toBeNull();
  });

  it('SC6.3: snapshot with dailyHours===undefined is excluded', () => {
    const noHours = snap('2025-01-01', undefined);
    const validWeeks = makeSnaps(4, flat(4), 1);
    const snapshots = [noHours, ...validWeeks];

    const result = computeDayWindowAvgs(snapshots, 4);
    expect(result.validWeeksInCurrent).toBe(4);
    // The undefined-dailyHours snap lands in prior group of size 1 → prev=null
    expect(result.prev).toBeNull();
  });

  it('SC6.4: empty snapshots → current=zeros, prev=null, validWeeksInCurrent=0', () => {
    const result = computeDayWindowAvgs([], 4);
    expect(result.current).toEqual(Array(7).fill(0));
    expect(result.prev).toBeNull();
    expect(result.validWeeksInCurrent).toBe(0);
    expect(result.validWeeksInPrior).toBe(0);
  });
});

// ─── FR7: Output shape invariants ────────────────────────────────────────────

describe('computeDayWindowAvgs — output shape invariants', () => {
  const cases: Array<{ label: string; snapshots: WeeklySnapshot[]; window: 4 | 12 | 24 }> = [
    { label: 'empty snapshots 4W', snapshots: [], window: 4 },
    { label: 'empty snapshots 24W', snapshots: [], window: 24 },
    { label: '8 valid 4W', snapshots: makeSnaps(8, flat(4)), window: 4 },
    { label: '24 valid 12W', snapshots: makeSnaps(24, flat(4)), window: 12 },
    { label: '24 valid 24W', snapshots: makeSnaps(24, flat(4)), window: 24 },
    { label: 'all invalid 4W', snapshots: makeSnaps(8, [0, 0, 0, 0, 0, 0, 0]), window: 4 },
  ];

  it.each(cases)('SC7.1: current has exactly 7 elements — $label', ({ snapshots, window }) => {
    const result = computeDayWindowAvgs(snapshots, window);
    expect(result.current).toHaveLength(7);
  });

  it.each(cases.filter(c => c.window !== 24))(
    'SC7.2: when prev!==null, prev has exactly 7 elements — $label',
    ({ snapshots, window }) => {
      const result = computeDayWindowAvgs(snapshots, window);
      if (result.prev !== null) {
        expect(result.prev).toHaveLength(7);
      }
    },
  );

  it.each(cases)('SC7.3: all values are finite — $label', ({ snapshots, window }) => {
    const result = computeDayWindowAvgs(snapshots, window);
    result.current.forEach(v => {
      expect(Number.isFinite(v)).toBe(true);
    });
    if (result.prev !== null) {
      result.prev.forEach(v => {
        expect(Number.isFinite(v)).toBe(true);
      });
    }
  });
});
