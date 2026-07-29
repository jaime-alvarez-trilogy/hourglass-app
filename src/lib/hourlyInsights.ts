// hourlyInsights.ts — 02-hourly-pattern-insights FR1–FR4
// Pure functions for deriving hourly work patterns from WeeklySnapshot history.
// No side effects — safe for useMemo and direct test invocation.

import type { WeeklySnapshot } from './weeklyHistory';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HourlyProfile {
  /** Mean slot count per hour across N valid weeks. Length 24. */
  avgSlots: number[];
  /** Mean intensityScore per hour (0–100). NaN where no week has slots at that hour. Length 24. */
  avgIntensity: number[];
  /** Mean AI-usage rate per hour (fraction 0–1). NaN where no week has slots at that hour. Length 24. */
  avgAIRate: number[];
  /** Mean productive-slot rate per hour (fraction 0–1). NaN where no week has slots at that hour. Length 24. */
  avgProductiveRate: number[];
  /** Count of weekly snapshots that contributed valid hourly data. */
  weeksCovered: number;
  /** [firstHour, lastHour] where avgSlots[h] >= 0.5. Falls back to [0, 23]. */
  activeWindow: [number, number];
}

export interface FocusWindow {
  /** [startHour, endHour] inclusive — peak-intensity contiguous block. */
  peakRange: [number, number];
  /** Mean avgIntensity over peakRange. */
  peakIntensity: number;
  /** Propagated from HourlyProfile.weeksCovered. */
  weeksCovered: number;
}

export interface AIHotZone {
  /** [startHour, endHour] inclusive — peak-AI-rate block (1–2 hours). */
  hotRange: [number, number];
  /** Mean avgAIRate over hotRange. */
  aiRate: number;
  /** Propagated from HourlyProfile.weeksCovered. */
  weeksCovered: number;
}

export interface HourlyInsights {
  profile: HourlyProfile | null;
  focusWindow: FocusWindow | null;
  aiHotZone: AIHotZone | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── computeHourlyProfile ────────────────────────────────────────────────────

/**
 * Computes per-hour averages across N valid weeks of WeeklySnapshot data.
 * Requires ≥4 weeks that carry all four hourly arrays (hourlySlots, hourlyIntensity,
 * hourlyAISlots, hourlyProductiveSlots), each length 24. Returns null on insufficient data.
 * Uses NaN as the sentinel for hours with zero slots (no data at that hour).
 */
export function computeHourlyProfile(snapshots: WeeklySnapshot[]): HourlyProfile | null {
  // Step 1: filter to snapshots that have all 4 required arrays (each length 24)
  const valid = snapshots.filter(
    s =>
      s.hourlySlots?.length === 24 &&
      s.hourlyIntensity?.length === 24 &&
      s.hourlyAISlots?.length === 24 &&
      s.hourlyProductiveSlots?.length === 24,
  );

  // Step 2: minimum weeks guard
  if (valid.length < 4) return null;

  // Step 3: compute per-hour averages across all valid weeks
  const avgSlots = new Array<number>(24);
  const avgIntensity = new Array<number>(24);
  const avgAIRate = new Array<number>(24);
  const avgProductiveRate = new Array<number>(24);

  for (let h = 0; h < 24; h++) {
    // avgSlots[h] = mean of hourlySlots[h] across all valid weeks
    avgSlots[h] = mean(valid.map(s => s.hourlySlots![h]));

    // For ratio averages: only include weeks where hourlySlots[h] > 0
    // (filter once per hour, reuse for all three ratios)
    const withSlots = valid.filter(s => s.hourlySlots![h] > 0);
    const slots = withSlots.length;

    avgIntensity[h] =
      slots > 0 ? mean(withSlots.map(s => s.hourlyIntensity![h] / s.hourlySlots![h])) : NaN;

    avgAIRate[h] =
      slots > 0 ? mean(withSlots.map(s => s.hourlyAISlots![h] / s.hourlySlots![h])) : NaN;

    avgProductiveRate[h] =
      slots > 0 ? mean(withSlots.map(s => s.hourlyProductiveSlots![h] / s.hourlySlots![h])) : NaN;
  }

  // Step 4: compute activeWindow — first/last hour with avgSlots[h] >= 0.5
  let windowFirst: number | undefined;
  let windowLast: number | undefined;
  for (let h = 0; h < 24; h++) {
    if (avgSlots[h] >= 0.5) {
      if (windowFirst === undefined) windowFirst = h;
      windowLast = h;
    }
  }
  const activeWindow: [number, number] =
    windowFirst !== undefined && windowLast !== undefined ? [windowFirst, windowLast] : [0, 23];

  return {
    avgSlots,
    avgIntensity,
    avgAIRate,
    avgProductiveRate,
    weeksCovered: valid.length,
    activeWindow,
  };
}

// ─── inferFocusWindow ────────────────────────────────────────────────────────

/**
 * Returns the peak contiguous focus block (highest avg intensityScore) from a
 * HourlyProfile. Clipped to profile.activeWindow. Returns null if peak intensity
 * < 20 (insufficient signal) or no valid hours exist.
 */
export function inferFocusWindow(profile: HourlyProfile): FocusWindow | null {
  const [lo, hi] = profile.activeWindow;
  const { avgIntensity } = profile;

  // Collect valid hours in activeWindow
  const validHours: number[] = [];
  for (let h = lo; h <= hi; h++) {
    if (!isNaN(avgIntensity[h])) validHours.push(h);
  }
  if (validHours.length === 0) return null;

  // Find peak hour (argmax)
  let peakHour = validHours[0];
  for (const h of validHours) {
    if (avgIntensity[h] > avgIntensity[peakHour]) peakHour = h;
  }
  const peakVal = avgIntensity[peakHour];

  // Insufficient signal guard
  if (peakVal < 20) return null;

  // Expand contiguously while: neighbor >= 60% of peak, total <= 4 hours
  let start = peakHour;
  let end = peakHour;

  while (end - start + 1 < 4) {
    const canLeft =
      start > lo && !isNaN(avgIntensity[start - 1]) && avgIntensity[start - 1] >= 0.6 * peakVal;
    const canRight =
      end < hi && !isNaN(avgIntensity[end + 1]) && avgIntensity[end + 1] >= 0.6 * peakVal;

    if (!canLeft && !canRight) break;

    // Expand to the stronger side; prefer left on tie
    if (canLeft && (!canRight || avgIntensity[start - 1] >= avgIntensity[end + 1])) {
      start--;
    } else {
      end++;
    }
  }

  const peakRange: [number, number] = [start, end];
  const peakIntensity = mean(
    Array.from({ length: end - start + 1 }, (_, i) => avgIntensity[start + i]),
  );

  return { peakRange, peakIntensity, weeksCovered: profile.weeksCovered };
}

// ─── inferAIHotZone ──────────────────────────────────────────────────────────

/**
 * Returns the peak AI-rate block (1–2 hours) from a HourlyProfile.
 * Clipped to profile.activeWindow. Returns null if max AI rate < 0.10
 * (< 10% AI usage at any hour — degenerate case).
 */
export function inferAIHotZone(profile: HourlyProfile): AIHotZone | null {
  const [lo, hi] = profile.activeWindow;
  const { avgAIRate } = profile;

  // Collect valid hours in activeWindow
  const validHours: number[] = [];
  for (let h = lo; h <= hi; h++) {
    if (!isNaN(avgAIRate[h])) validHours.push(h);
  }
  if (validHours.length === 0) return null;

  // Find peak hour (argmax)
  let peakHour = validHours[0];
  for (const h of validHours) {
    if (avgAIRate[h] > avgAIRate[peakHour]) peakHour = h;
  }
  const peakVal = avgAIRate[peakHour];

  // Low-signal guard
  if (peakVal < 0.1) return null;

  // Check each adjacent hour: qualify if >= 70% of peak
  const leftQualifies =
    peakHour > lo && !isNaN(avgAIRate[peakHour - 1]) && avgAIRate[peakHour - 1] >= 0.7 * peakVal;
  const rightQualifies =
    peakHour < hi && !isNaN(avgAIRate[peakHour + 1]) && avgAIRate[peakHour + 1] >= 0.7 * peakVal;

  let start = peakHour;
  let end = peakHour;

  if (leftQualifies && rightQualifies) {
    // Both qualify — expand to the stronger side only (keep range <= 2 hours)
    if (avgAIRate[peakHour - 1] >= avgAIRate[peakHour + 1]) {
      start--;
    } else {
      end++;
    }
  } else if (leftQualifies) {
    start--;
  } else if (rightQualifies) {
    end++;
  }

  const hotRange: [number, number] = [start, end];
  const aiRate = mean(
    Array.from({ length: end - start + 1 }, (_, i) => avgAIRate[start + i]),
  );

  return { hotRange, aiRate, weeksCovered: profile.weeksCovered };
}

// ─── formatHour ──────────────────────────────────────────────────────────────

/** Formats a 0–23 hour as a 12-hour display string: 0→"12am", 12→"12pm", 13→"1pm". */
export function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}
