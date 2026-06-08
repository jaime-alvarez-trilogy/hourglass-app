// Tests: inferWorkPattern pure function — 02-work-pattern FR1–FR4
// Tests: useWorkPattern hook — 02-work-pattern FR5 (static analysis)
//
// FR1: WorkPattern type and constants
//   SC1.1 — REST_DAY_THRESHOLD equals 0.5
//   SC1.2 — MIN_WEEKS equals 4
//
// FR2: insufficient data path
//   SC2.1 — empty array → insufficient_data, empty arrays, weeksUsed 0
//   SC2.2 — 3 valid weeks → insufficient_data
//   SC2.3 — 4 valid weeks (exactly at threshold) → ready
//   SC2.4 — snapshots with dailyHours undefined excluded
//   SC2.5 — snapshots with all-zero dailyHours excluded
//   SC2.6 — mix: 6 with dailyHours, 18 without → uses 6, ready, weeksUsed 6
//
// FR3: averages and rest-day detection
//   SC3.1 — 8 weeks Mon–Fri pattern → restDays [5,6]
//   SC3.2 — avgDailyHours length === 7
//   SC3.3 — day avg 0.49h is a rest day
//   SC3.4 — day avg 0.50h is NOT a rest day (strict <)
//   SC3.5 — user works Saturdays (avg 4h) → Saturday not in restDays
//   SC3.6 — weeksUsed equals count of valid weeks
//
// FR4: weight normalization
//   SC4.1 — dayWeights sums to 1.0 within ±0.001 (Mon–Fri pattern)
//   SC4.2 — rest days have dayWeights[i] === 0
//   SC4.3 — uneven distribution → weights proportional to avg hours
//   SC4.4 — degenerate: all 7 days rest → Mon–Fri each 0.2, Sat/Sun 0
//   SC4.5 — dayWeights length === 7
//
// FR5: useWorkPattern hook (static analysis)
//   SC5.1 — hook file exists
//   SC5.2 — imports inferWorkPattern from workPattern
//   SC5.3 — imports useWeeklyHistory
//   SC5.4 — uses useMemo with snapshots dependency
//   SC5.5 — does not import from src/api/, src/store/, or AsyncStorage

import * as path from 'path';
import * as fs from 'fs';
import {
  inferWorkPattern,
  REST_DAY_THRESHOLD,
  MIN_WEEKS,
} from '../workPattern';
import type { WorkPattern } from '../workPattern';
import type { WeeklySnapshot } from '../weeklyHistory';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(dailyHours?: number[], weekStart = '2025-01-06'): WeeklySnapshot {
  return {
    weekStart,
    hours: dailyHours ? dailyHours.reduce((a, b) => a + b, 0) : 0,
    earnings: 2000,
    aiPct: 75,
    brainliftHours: 5,
    dailyHours,
  };
}

/** Mon–Fri: 8h each day, Sat/Sun: 0h */
const TYPICAL_WEEK: number[] = [8, 8, 8, 8, 8, 0, 0];

/** Build N snapshots all with the same dailyHours pattern. */
function makeSnapshots(n: number, dailyHours: number[], startWeek = '2025-01-06'): WeeklySnapshot[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(startWeek + 'T00:00:00');
    d.setDate(d.getDate() + i * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return makeSnapshot(dailyHours, `${y}-${m}-${dd}`);
  });
}

// ─── FR1: Constants ───────────────────────────────────────────────────────────

describe('FR1 — constants', () => {
  it('SC1.1 — REST_DAY_THRESHOLD equals 0.5', () => {
    expect(REST_DAY_THRESHOLD).toBe(0.5);
  });

  it('SC1.2 — MIN_WEEKS equals 4', () => {
    expect(MIN_WEEKS).toBe(4);
  });
});

// ─── FR2: Insufficient data path ──────────────────────────────────────────────

describe('FR2 — insufficient data path', () => {
  it('SC2.1 — empty array → insufficient_data, empty arrays, weeksUsed 0', () => {
    const result = inferWorkPattern([]);
    expect(result.status).toBe('insufficient_data');
    expect(result.dayWeights).toEqual([]);
    expect(result.restDays).toEqual([]);
    expect(result.avgDailyHours).toEqual([]);
    expect(result.weeksUsed).toBe(0);
  });

  it('SC2.2 — 3 valid weeks → insufficient_data', () => {
    const snapshots = makeSnapshots(3, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    expect(result.status).toBe('insufficient_data');
  });

  it('SC2.3 — 4 valid weeks (exactly at threshold) → ready', () => {
    const snapshots = makeSnapshots(4, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    expect(result.status).toBe('ready');
  });

  it('SC2.4 — snapshots with dailyHours undefined are excluded', () => {
    // 3 valid + 5 without dailyHours = should still be insufficient_data
    const withData = makeSnapshots(3, TYPICAL_WEEK);
    const withoutData = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot(undefined, `2026-0${i + 1}-06`),
    );
    const result = inferWorkPattern([...withData, ...withoutData]);
    expect(result.status).toBe('insufficient_data');
    expect(result.weeksUsed).toBe(3); // 3 valid weeks contributed
  });

  it('SC2.5 — snapshots with all-zero dailyHours are excluded', () => {
    const allZero = makeSnapshots(3, [0, 0, 0, 0, 0, 0, 0]);
    const valid = makeSnapshots(3, TYPICAL_WEEK, '2025-04-07');
    const result = inferWorkPattern([...allZero, ...valid]);
    expect(result.status).toBe('insufficient_data');
    expect(result.weeksUsed).toBe(3); // 3 valid (non-zero) weeks contributed
  });

  it('SC2.7 — 2 valid weeks → insufficient_data with avgDailyHours populated (length 7)', () => {
    const snapshots = makeSnapshots(2, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    expect(result.status).toBe('insufficient_data');
    expect(result.avgDailyHours).toHaveLength(7);
    expect(result.weeksUsed).toBe(2);
  });

  it('SC2.8 — 2 weeks with Saturday work → avgDailyHours[5] reflects Sat average', () => {
    const SAT_WEEK = [8, 8, 8, 8, 8, 6, 0]; // works 6h on Saturdays
    const snapshots = makeSnapshots(2, SAT_WEEK);
    const result = inferWorkPattern(snapshots);
    expect(result.status).toBe('insufficient_data');
    expect(result.avgDailyHours[5]).toBeCloseTo(6, 4);
  });

  it('SC2.9 — 0 valid weeks → insufficient_data with empty avgDailyHours', () => {
    const result = inferWorkPattern([]);
    expect(result.avgDailyHours).toEqual([]);
    expect(result.weeksUsed).toBe(0);
  });

  it('SC2.6 — mix: 6 with dailyHours, 18 without → uses 6, ready, weeksUsed 6', () => {
    const withData = makeSnapshots(6, TYPICAL_WEEK);
    const withoutData = Array.from({ length: 18 }, (_, i) =>
      makeSnapshot(undefined, `2026-0${(i % 9) + 1}-0${(i % 4) + 1}`),
    );
    const result = inferWorkPattern([...withData, ...withoutData]);
    expect(result.status).toBe('ready');
    expect(result.weeksUsed).toBe(6);
  });
});

// ─── FR3: Averages and rest-day detection ─────────────────────────────────────

describe('FR3 — averages and rest-day detection', () => {
  it('SC3.1 — 8 weeks Mon–Fri pattern → restDays [5, 6]', () => {
    const snapshots = makeSnapshots(8, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    expect(result.restDays).toEqual([5, 6]);
  });

  it('SC3.2 — avgDailyHours length === 7', () => {
    const snapshots = makeSnapshots(4, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    expect(result.avgDailyHours).toHaveLength(7);
  });

  it('SC3.3 — day avg 0.49h is a rest day (below threshold)', () => {
    // Mon has 0.49h avg, all others have 8h
    // 4 weeks: Mon each week = 0.49h, so avg = 0.49
    const snapshots = makeSnapshots(4, [0.49, 8, 8, 8, 8, 0, 0]);
    const result = inferWorkPattern(snapshots);
    expect(result.restDays).toContain(0); // Mon is rest day
  });

  it('SC3.4 — day avg 0.50h is NOT a rest day (strict <)', () => {
    // Mon has exactly 0.50h avg
    const snapshots = makeSnapshots(4, [0.5, 8, 8, 8, 8, 0, 0]);
    const result = inferWorkPattern(snapshots);
    expect(result.restDays).not.toContain(0); // Mon is NOT a rest day
  });

  it('SC3.5 — user works Saturdays (avg 4h) → Saturday not in restDays', () => {
    const snapshots = makeSnapshots(4, [8, 8, 8, 8, 8, 4, 0]);
    const result = inferWorkPattern(snapshots);
    expect(result.restDays).not.toContain(5); // Sat not rest
    expect(result.restDays).toContain(6);     // Sun still rest
  });

  it('SC3.6 — weeksUsed equals count of valid weeks', () => {
    const snapshots = makeSnapshots(7, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    expect(result.weeksUsed).toBe(7);
  });
});

// ─── FR4: Weight normalization ────────────────────────────────────────────────

describe('FR4 — weight normalization', () => {
  it('SC4.1 — dayWeights sums to 1.0 within ±0.001', () => {
    const snapshots = makeSnapshots(8, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    const sum = result.dayWeights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 3);
  });

  it('SC4.2 — rest days have dayWeights[i] === 0', () => {
    const snapshots = makeSnapshots(8, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    // Sat (5) and Sun (6) are rest days
    expect(result.dayWeights[5]).toBe(0);
    expect(result.dayWeights[6]).toBe(0);
  });

  it('SC4.3 — uneven distribution → weights proportional (Mon 8h, Tue 4h)', () => {
    // Mon=8h, Tue=4h, others 0 → Mon weight should be double Tue
    const snapshots = makeSnapshots(4, [8, 4, 0, 0, 0, 0, 0]);
    const result = inferWorkPattern(snapshots);
    expect(result.dayWeights[0]).toBeCloseTo(result.dayWeights[1] * 2, 5);
  });

  it('SC4.4 — degenerate: all 7 days are rest days → Mon–Fri each 0.2, Sat/Sun 0', () => {
    // All days below threshold (0.1h each day)
    const snapshots = makeSnapshots(4, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    const result = inferWorkPattern(snapshots);
    expect(result.dayWeights[0]).toBeCloseTo(0.2, 5); // Mon
    expect(result.dayWeights[1]).toBeCloseTo(0.2, 5); // Tue
    expect(result.dayWeights[2]).toBeCloseTo(0.2, 5); // Wed
    expect(result.dayWeights[3]).toBeCloseTo(0.2, 5); // Thu
    expect(result.dayWeights[4]).toBeCloseTo(0.2, 5); // Fri
    expect(result.dayWeights[5]).toBe(0);             // Sat
    expect(result.dayWeights[6]).toBe(0);             // Sun
  });

  it('SC4.5 — dayWeights length === 7', () => {
    const snapshots = makeSnapshots(4, TYPICAL_WEEK);
    const result = inferWorkPattern(snapshots);
    expect(result.dayWeights).toHaveLength(7);
  });
});

// ─── FR5: useWorkPattern hook — static analysis ───────────────────────────────

describe('FR5 — useWorkPattern hook (static analysis)', () => {
  const SRC_ROOT = path.resolve(__dirname, '../..');
  const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'useWorkPattern.ts');

  let source: string;

  beforeAll(() => {
    if (fs.existsSync(HOOK_FILE)) {
      source = fs.readFileSync(HOOK_FILE, 'utf8');
    }
  });

  it('SC5.1 — hook file exists at src/hooks/useWorkPattern.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('SC5.2 — imports inferWorkPattern from workPattern', () => {
    expect(source).toMatch(/inferWorkPattern/);
    expect(source).toMatch(/workPattern/);
  });

  it('SC5.3 — imports useWeeklyHistory', () => {
    expect(source).toMatch(/useWeeklyHistory/);
  });

  it('SC5.4 — uses useMemo with snapshots dependency', () => {
    expect(source).toMatch(/useMemo/);
    expect(source).toMatch(/snapshots/);
  });

  it('SC5.5 — does not import from src/api, src/store, or AsyncStorage', () => {
    expect(source).not.toMatch(/from.*['"].*\/api\//);
    expect(source).not.toMatch(/from.*['"].*\/store\//);
    expect(source).not.toMatch(/AsyncStorage/);
  });
});
