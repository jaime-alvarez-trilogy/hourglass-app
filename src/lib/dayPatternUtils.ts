// dayPatternUtils.ts — 01-computation
// Pure functions for computing per-day-of-week average hours over a calendar window.
// No side effects — safe for useMemo. No React, no hooks, no async.

import type { WeeklySnapshot } from './weeklyHistory';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum valid weeks in the prior group required to expose trend arrows. */
export const MIN_PRIOR_WEEKS = 2;

/** Minimum hour delta (per day) required before a trend arrow is shown. */
export const TREND_THRESHOLD = 0.5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayWindowResult {
  /** Average hours per day of week (Mon=0…Sun=6) for the current window. Length 7. */
  current: number[];
  /**
   * Average hours per day of week for the preceding window of equal length.
   * null when window===24 (no prior period) or when fewer than MIN_PRIOR_WEEKS
   * valid weeks exist in the prior calendar group.
   */
  prev: number[] | null;
  /** Number of weeks in the current group that had valid dailyHours. */
  validWeeksInCurrent: number;
  /** Number of valid weeks in the prior group. 0 when prev===null. */
  validWeeksInPrior: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A snapshot is valid when dailyHours is present and at least one hour is non-zero. */
function isValidSnap(s: WeeklySnapshot): boolean {
  return s.dailyHours !== undefined && s.dailyHours.reduce((a, b) => a + b, 0) > 0;
}

/**
 * Computes per-day average hours across a set of valid weeks.
 * Returns Array(7).fill(0) when weeks is empty.
 */
function avgPerDay(weeks: WeeklySnapshot[]): number[] {
  if (weeks.length === 0) return Array(7).fill(0) as number[];
  return Array.from({ length: 7 }, (_, i) =>
    weeks.reduce((sum, w) => sum + (w.dailyHours![i] ?? 0), 0) / weeks.length,
  );
}

// ─── computeDayWindowAvgs ─────────────────────────────────────────────────────

/**
 * Computes per-day-of-week average hours for the active window and its prior period.
 *
 * Snapshots must be sorted oldest-first; the in-progress current week must be excluded
 * by the caller. Weeks where dailyHours is undefined or sums to zero are skipped.
 *
 * Returns prev: null for the 24W window (no prior data) or when the prior calendar
 * slice has fewer than MIN_PRIOR_WEEKS valid weeks.
 */
export function computeDayWindowAvgs(
  snapshots: WeeklySnapshot[],
  window: 4 | 12 | 24,
): DayWindowResult {
  // Step 1: slice current calendar group (last N snapshots)
  const currentGroup = snapshots.slice(-window);

  // Step 2: filter to valid weeks
  const filteredCurrent = currentGroup.filter(isValidSnap);

  // Step 3: compute current averages
  const current = avgPerDay(filteredCurrent);

  // Step 4: 24W window — no prior period
  if (window === 24) {
    return {
      current,
      prev: null,
      validWeeksInCurrent: filteredCurrent.length,
      validWeeksInPrior: 0,
    };
  }

  // Step 5: prior calendar group (preceding N snapshots)
  const priorGroup = snapshots.slice(-2 * window, -window);
  const filteredPrior = priorGroup.filter(isValidSnap);

  // Step 6: insufficient prior data guard
  if (filteredPrior.length < MIN_PRIOR_WEEKS) {
    return {
      current,
      prev: null,
      validWeeksInCurrent: filteredCurrent.length,
      validWeeksInPrior: 0,
    };
  }

  // Step 7: compute prior averages
  const prev = avgPerDay(filteredPrior);

  return {
    current,
    prev,
    validWeeksInCurrent: filteredCurrent.length,
    validWeeksInPrior: filteredPrior.length,
  };
}
