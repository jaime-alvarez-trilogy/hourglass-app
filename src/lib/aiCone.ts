// 01-cone-math: AI Possibility Cone math
// Pure functions — no React, no AsyncStorage, no API calls.

import type { DailyTagData } from './ai';

// ─── FR1: Types ───────────────────────────────────────────────────────────────

export interface ConePoint {
  hoursX: number; // X-axis position in hours (0 → weeklyLimit)
  pctY: number;   // Y-axis AI percentage (0 → 100)
}

/**
 * Cone upper/lower bounds at a specific point in time.
 * Parallel to hourlyPoints — same index gives same time position.
 */
export interface ConeSnapshot {
  upperPct: number; // best-case AI% if all remaining hours are AI-tagged
  lowerPct: number; // worst-case AI% if no more hours are AI-tagged
}

export interface ConeData {
  // Per-day historical trajectory (one point per day + origin).
  // Unchanged from original — all existing tests pass against this field.
  actualPoints: ConePoint[];

  // Per-hour interpolated trajectory (one point per integer hour + day boundaries).
  // Used by AIConeChart for high-resolution animation (line + moving cone).
  hourlyPoints: ConePoint[];

  // Cone bounds at each hourlyPoint (parallel array — same indices).
  // coneSnapshots[i] gives the upper/lower for the cone drawn from hourlyPoints[i].
  coneSnapshots: ConeSnapshot[];

  // Final static cone (current position → weeklyLimit)
  upperBound: ConePoint[];
  lowerBound: ConePoint[];

  // Derived scalars for chart rendering
  currentHours: number;
  currentAIPct: number;
  weeklyLimit: number;
  targetPct: number;           // always 75
  isTargetAchievable: boolean;
}

// ─── FR2: computeActualPoints ─────────────────────────────────────────────────

/**
 * Builds the historical AI% trajectory from per-day cumulative data.
 * One point per day (+ origin at 0,0). Unchanged — all existing tests pass.
 */
export function computeActualPoints(dailyBreakdown: DailyTagData[]): ConePoint[] {
  const points: ConePoint[] = [{ hoursX: 0, pctY: 0 }];

  let cumulativeTotal = 0;
  let cumulativeAi = 0;
  let cumulativeNoTags = 0;

  for (const entry of dailyBreakdown) {
    if (!entry) continue;

    cumulativeTotal += entry.total;
    cumulativeAi += entry.aiUsage;
    cumulativeNoTags += entry.noTags;

    const taggedSlots = cumulativeTotal - cumulativeNoTags;
    const aiPct = taggedSlots > 0 ? (cumulativeAi / taggedSlots) * 100 : 0;
    const hoursX = cumulativeTotal * 10 / 60;

    points.push({ hoursX, pctY: aiPct });
  }

  return points;
}

// ─── FR3: computeCone ────────────────────────────────────────────────────────

/**
 * Builds the forward-looking possibility cone from the current position.
 * Returns two 2-point arrays: upper (best case) and lower (worst case).
 */
export function computeCone(
  currentHours: number,
  currentAIPct: number,
  aiSlots: number,
  taggedSlots: number,
  weeklyLimit: number,
): { upper: ConePoint[]; lower: ConePoint[] } {
  if (weeklyLimit <= 0 || currentHours >= weeklyLimit) {
    return { upper: [], lower: [] };
  }

  const slotsRemaining = (weeklyLimit - currentHours) * 6;
  const denominator = taggedSlots + slotsRemaining;

  let upperFinal: number;
  let lowerFinal: number;

  if (denominator === 0) {
    upperFinal = 100;
    lowerFinal = 0;
  } else {
    upperFinal = Math.min(100, Math.max(0, ((aiSlots + slotsRemaining) / denominator) * 100));
    lowerFinal = Math.min(100, Math.max(0, (aiSlots / denominator) * 100));
  }

  return {
    upper: [{ hoursX: currentHours, pctY: currentAIPct }, { hoursX: weeklyLimit, pctY: upperFinal }],
    lower: [{ hoursX: currentHours, pctY: currentAIPct }, { hoursX: weeklyLimit, pctY: lowerFinal }],
  };
}

// ─── Internal: per-frame cone math ───────────────────────────────────────────

/**
 * Computes the cone snapshot (upper/lower bounds at weeklyLimit) from a
 * given intermediate position. Used to animate the cone as the line draws.
 */
function coneAt(
  aiSlots: number,
  taggedSlots: number,
  currentHours: number,
  weeklyLimit: number,
): ConeSnapshot {
  if (weeklyLimit <= 0 || currentHours >= weeklyLimit) {
    const pct = taggedSlots > 0 ? (aiSlots / taggedSlots) * 100 : 0;
    return { upperPct: pct, lowerPct: pct };
  }
  const slotsRemaining = (weeklyLimit - currentHours) * 6;
  const denominator = taggedSlots + slotsRemaining;
  if (denominator === 0) return { upperPct: 100, lowerPct: 0 };
  const upperPct = Math.min(100, ((aiSlots + slotsRemaining) / denominator) * 100);
  const lowerPct = Math.max(0, (aiSlots / denominator) * 100);
  return { upperPct, lowerPct };
}

/**
 * Builds per-hour interpolated trajectory and parallel cone snapshots.
 *
 * Creates one point per integer hour within each day (linear interpolation
 * within the day) plus an end-of-day point when the day ends mid-hour.
 * Starting origin (0, baselinePct) always included; defaults to (0, 0).
 */
function computeHourlyPoints(
  dailyBreakdown: DailyTagData[],
  weeklyLimit: number,
  baselinePct: number = 0,
): { points: ConePoint[]; snapshots: ConeSnapshot[] } {
  const points: ConePoint[] = [{ hoursX: 0, pctY: baselinePct }];
  const snapshots: ConeSnapshot[] = [coneAt(0, 0, 0, weeklyLimit)];

  let cumTotalSlots = 0;
  let cumAISlots = 0;
  let cumNoTagSlots = 0;

  for (const entry of dailyBreakdown) {
    if (!entry || entry.total === 0) continue;

    const dayHours = entry.total * 10 / 60;
    const prevHours = cumTotalSlots * 10 / 60;
    const endHours = prevHours + dayHours;

    // Integer hour marks within this day (exclusive start, inclusive end integer)
    const startInt = Math.floor(prevHours) + 1;
    const endInt = Math.floor(endHours);

    for (let h = startInt; h <= endInt; h++) {
      const frac = (h - prevHours) / dayHours;
      const ai = cumAISlots + entry.aiUsage * frac;
      const noTags = cumNoTagSlots + entry.noTags * frac;
      const slots = cumTotalSlots + entry.total * frac;
      const tagged = slots - noTags;
      const pct = tagged > 0 ? (ai / tagged) * 100 : 0;
      points.push({ hoursX: h, pctY: pct });
      snapshots.push(coneAt(ai, tagged, h, weeklyLimit));
    }

    // Accumulate day totals
    cumTotalSlots += entry.total;
    cumAISlots += entry.aiUsage;
    cumNoTagSlots += entry.noTags;

    // Add end-of-day point only if it doesn't land on an integer hour
    if (Math.abs(endHours - endInt) > 0.001) {
      const tagged = cumTotalSlots - cumNoTagSlots;
      const pct = tagged > 0 ? (cumAISlots / tagged) * 100 : 0;
      points.push({ hoursX: endHours, pctY: pct });
      snapshots.push(coneAt(cumAISlots, tagged, endHours, weeklyLimit));
    }
  }

  return { points, snapshots };
}

// ─── FR4: computeAICone ───────────────────────────────────────────────────────

/**
 * Orchestrates all cone math into a full ConeData object.
 * Primary entry point for chart components.
 */
export function computeAICone(
  dailyBreakdown: DailyTagData[],
  weeklyLimit: number,
  baselinePct: number = 0,
): ConeData {
  let totalSlots = 0;
  let aiSlots = 0;
  let noTagSlots = 0;

  for (const entry of dailyBreakdown) {
    if (!entry) continue;
    totalSlots += entry.total;
    aiSlots += entry.aiUsage;
    noTagSlots += entry.noTags;
  }

  const taggedSlots = totalSlots - noTagSlots;
  const currentHours = totalSlots * 10 / 60;
  const currentAIPct = taggedSlots > 0 ? (aiSlots / taggedSlots) * 100 : 0;

  const actualPoints = computeActualPoints(dailyBreakdown);
  const { upper, lower } = computeCone(currentHours, currentAIPct, aiSlots, taggedSlots, weeklyLimit);
  const { points: hourlyPoints, snapshots: coneSnapshots } = computeHourlyPoints(dailyBreakdown, weeklyLimit, baselinePct);

  let isTargetAchievable: boolean;
  if (upper.length > 0) {
    isTargetAchievable = upper[upper.length - 1].pctY >= 75;
  } else {
    isTargetAchievable = currentAIPct >= 75;
  }

  return {
    actualPoints,
    hourlyPoints,
    coneSnapshots,
    upperBound: upper,
    lowerBound: lower,
    currentHours,
    currentAIPct,
    weeklyLimit,
    targetPct: 75,
    isTargetAchievable,
  };
}
