// scheduleInsights.ts — 02-schedule-insights FR1
// Pure function for inferring a user's typical work schedule from hourly slot history.
// No side effects — safe for useMemo and direct test invocation.

import type { WeeklySnapshot } from './weeklyHistory';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkSchedule {
  /** Contiguous block of hours at ≥50% of peak density. Inclusive on both ends. */
  peakRange: [number, number];
  /** Single busiest hour (argmax of weekly average). */
  peakHour: number;
  /** First hour of the day averaging ≥2 slots/week. */
  windowStart: number;
  /** Last hour of the day averaging ≥2 slots/week. */
  windowEnd: number;
  /** Count of weekly snapshots that contributed valid hourlySlots data. */
  weeksCovered: number;
}

// ─── inferWorkSchedule ────────────────────────────────────────────────────────

/**
 * Derives the user's typical work schedule from historical hourly slot data.
 * Requires ≥4 weeks with at least one non-zero slot in hourlySlots. Returns null
 * when insufficient data, no detectable peak, or the work window cannot be
 * established (fewer than two distinct qualifying hours).
 */
export function inferWorkSchedule(snapshots: WeeklySnapshot[]): WorkSchedule | null {
  // Step 1: filter to snapshots with valid (non-empty) hourlySlots
  const valid = snapshots.filter(s => s.hourlySlots?.some(c => c > 0));

  // Step 2: minimum weeks guard
  if (valid.length < 4) return null;

  // Step 3: aggregate — compute mean slot count per hour across valid weeks
  const agg: number[] = Array.from({ length: 24 }, (_, h) => {
    const sum = valid.reduce((acc, w) => acc + (w.hourlySlots![h] ?? 0), 0);
    return sum / valid.length;
  });

  // Step 4: find peak hour (argmax); guard against all-zero aggregate
  let peakHour = 0;
  for (let h = 1; h < 24; h++) {
    if (agg[h] > agg[peakHour]) peakHour = h;
  }
  if (agg[peakHour] === 0) return null;

  // Step 5: expand peak range — contiguous block of hours at ≥50% of peak
  const halfPeak = 0.5 * agg[peakHour];
  let rangeStart = peakHour;
  let rangeEnd = peakHour;

  while (rangeStart > 0 && agg[rangeStart - 1] >= halfPeak) {
    rangeStart--;
  }
  while (rangeEnd < 23 && agg[rangeEnd + 1] >= halfPeak) {
    rangeEnd++;
  }

  const peakRange: [number, number] = [rangeStart, rangeEnd];

  // Step 6–7: find work window — first and last hour averaging ≥2.0 slots/week
  const WINDOW_THRESHOLD = 2.0;
  let windowStart: number | undefined;
  let windowEnd: number | undefined;

  for (let h = 0; h < 24; h++) {
    if (agg[h] >= WINDOW_THRESHOLD) {
      if (windowStart === undefined) windowStart = h;
      windowEnd = h;
    }
  }

  // Step 8: guard — need at least two distinct qualifying hours
  if (windowStart === undefined || windowEnd === undefined || windowStart >= windowEnd) {
    return null;
  }

  return {
    peakRange,
    peakHour,
    windowStart,
    windowEnd,
    weeksCovered: valid.length,
  };
}
