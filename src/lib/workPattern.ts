// workPattern.ts — 02-work-pattern
// Pure functions for inferring a personal day-weight profile from weekly history.
// No side effects — safe for useMemo.

import type { WeeklySnapshot } from './weeklyHistory';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkPatternStatus = 'ready' | 'insufficient_data';

export interface WorkPattern {
  status: WorkPatternStatus;
  /** Normalized day fractions (Mon=0 … Sun=6) summing to 1.0. Rest days = 0. */
  dayWeights: number[];
  /** Day indices where avgDailyHours[i] < REST_DAY_THRESHOLD. */
  restDays: number[];
  /** Mean hours per day across valid weeks — length 7 (for display/debug). */
  avgDailyHours: number[];
  /** Number of valid weeks that contributed to the pattern. */
  weeksUsed: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Days averaging below this threshold (hours) are inferred as rest days. */
export const REST_DAY_THRESHOLD = 0.5;

/** Minimum number of valid weeks required before the pattern is usable. */
export const MIN_WEEKS = 4;

// ─── inferWorkPattern ─────────────────────────────────────────────────────────

/**
 * Derives a personal day-weight profile from historical weekly snapshots.
 * Returns 'insufficient_data' if fewer than MIN_WEEKS valid dailyHours entries exist.
 * Pure function — no side effects, safe for useMemo.
 */
export function inferWorkPattern(snapshots: WeeklySnapshot[]): WorkPattern {
  // Step 1: filter to weeks with valid dailyHours (present and at least one non-zero entry)
  const validWeeks = snapshots.filter(
    s => s.dailyHours !== undefined && s.dailyHours.some(h => h > 0),
  );

  // Step 2: insufficient data guard — still compute partial averages when any weeks exist.
  // Partial avgDailyHours lets the prescription engine detect weekend work before 4 full
  // weeks of data accumulate (support teams, 7-day contractors, etc.).
  if (validWeeks.length < MIN_WEEKS) {
    const avgDailyHours =
      validWeeks.length > 0
        ? Array.from({ length: 7 }, (_, i) => {
            const sum = validWeeks.reduce((acc, w) => acc + (w.dailyHours![i] ?? 0), 0);
            return sum / validWeeks.length;
          })
        : [];
    return {
      status: 'insufficient_data',
      dayWeights: [],
      restDays: [],
      avgDailyHours,
      weeksUsed: validWeeks.length,
    };
  }

  // Step 3: compute per-day averages (Mon=0 … Sun=6)
  const avgDailyHours: number[] = Array.from({ length: 7 }, (_, i) => {
    const sum = validWeeks.reduce((acc, w) => acc + (w.dailyHours![i] ?? 0), 0);
    return sum / validWeeks.length;
  });

  // Step 4: classify rest days (strict less-than — 0.5h exactly is NOT a rest day)
  const restDays: number[] = avgDailyHours
    .map((avg, i) => (avg < REST_DAY_THRESHOLD ? i : -1))
    .filter(i => i >= 0);

  // Step 5: compute raw weights (0 for rest days)
  const rawWeights: number[] = avgDailyHours.map((avg, i) =>
    restDays.includes(i) ? 0 : avg,
  );

  // Step 6: normalize
  const total = rawWeights.reduce((a, b) => a + b, 0);

  let dayWeights: number[];
  if (total === 0) {
    // Degenerate: all days classified as rest — fallback to equal Mon–Fri
    dayWeights = [0.2, 0.2, 0.2, 0.2, 0.2, 0, 0];
  } else {
    dayWeights = rawWeights.map(w => w / total);
  }

  return {
    status: 'ready',
    dayWeights,
    restDays,
    avgDailyHours,
    weeksUsed: validWeeks.length,
  };
}
