// aiInsights.ts — 04-ai-insights FR2
// Pure AI insight computation from aligned weekly history arrays.
// Imports only from src/lib/* — no hooks, no API, no AsyncStorage.

import { linearSlope, pearsonR } from './statsUtils';
import { formatWeekStartLabel } from './hours';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AITrendInsight {
  /** Signed points change over the trend window (e.g. +12 or -8). */
  slopePts: number;
  /** Number of weeks included in the slope window (≤ 8). */
  weeksUsed: number;
  /** |slopePts| < 2 → 'flat'; positive → 'up'; negative → 'down'. */
  direction: 'up' | 'down' | 'flat';
}

export interface AIBestInsight {
  /** Highest aiPct across all available history. */
  peakPct: number;
  /** "MMM D" label sourced from weekStarts[maxIndex] — not back-counted. */
  weekLabel: string;
  /** aiPct for the current week (last array entry). */
  currentPct: number;
  /** max(0, peakPct − currentPct). Zero when at or above peak. */
  ptsBelowBest: number;
}

export interface BrainLiftCorrelationInsight {
  /** Pearson r between brainliftHours[i] and aiPct[i+1] (lag-1). */
  r: number;
  /** Avg aiPct[i+1] when brainliftHours[i] >= 5h. */
  highBLAvgAIPct: number;
  /** Avg aiPct[i+1] when brainliftHours[i] < 5h. */
  lowBLAvgAIPct: number;
  /** Number of week pairs used for the correlation. */
  pairsUsed: number;
}

export interface AIInsights {
  /** null if fewer than 5 weeks of history. */
  trend: AITrendInsight | null;
  /** null if fewer than 4 weeks of history. */
  best: AIBestInsight | null;
  /** null if fewer than 8 pairs, |r| < 0.35, or either BL group is empty. */
  brainliftCorrelation: BrainLiftCorrelationInsight | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TREND_WINDOW = 8;
const TREND_MIN_WEEKS = 5;
const BEST_MIN_WEEKS = 4;
const CORR_MIN_PAIRS = 8;
const CORR_R_THRESHOLD = 0.35;
const BRAINLIFT_TARGET_HOURS = 5;
const FLAT_THRESHOLD_PTS = 2; // |slopePts| < 2 → 'flat'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── computeAIInsights ────────────────────────────────────────────────────────

/**
 * Pure. Computes the 8-week AI% trend slope, personal-best week, and
 * BrainLift→next-week-AI lag correlation from aligned weekly history arrays.
 *
 * All three arrays must be index-aligned, oldest→newest, current week last.
 * Returns nullable fields when significance guards fail:
 *   trend — null if < 5 weeks
 *   best  — null if < 4 weeks
 *   brainliftCorrelation — null if < 8 pairs, |r| < 0.35, or either group empty
 */
export function computeAIInsights(
  aiPct: number[],
  brainliftHours: number[],
  weekStarts: string[],
): AIInsights {
  const n = aiPct.length;

  // ── Trend ──────────────────────────────────────────────────────────────────
  let trend: AITrendInsight | null = null;
  const windowLen = Math.min(TREND_WINDOW, n);
  if (windowLen >= TREND_MIN_WEEKS) {
    const trendWindow = aiPct.slice(n - windowLen);
    const slopePerStep = linearSlope(trendWindow);
    const slopePts = slopePerStep * (windowLen - 1);
    const direction: 'up' | 'down' | 'flat' =
      Math.abs(slopePts) < FLAT_THRESHOLD_PTS ? 'flat'
      : slopePts > 0 ? 'up'
      : 'down';
    trend = { slopePts, weeksUsed: windowLen, direction };
  }

  // ── Best ───────────────────────────────────────────────────────────────────
  let best: AIBestInsight | null = null;
  if (n >= BEST_MIN_WEEKS) {
    let maxIndex = 0;
    for (let i = 1; i < n; i++) {
      if (aiPct[i] > aiPct[maxIndex]) maxIndex = i;
    }
    const peakPct = aiPct[maxIndex];
    const currentPct = aiPct[n - 1];
    best = {
      peakPct,
      weekLabel: formatWeekStartLabel(weekStarts[maxIndex]),
      currentPct,
      ptsBelowBest: Math.max(0, peakPct - currentPct),
    };
  }

  // ── BrainLift Correlation ──────────────────────────────────────────────────
  let brainliftCorrelation: BrainLiftCorrelationInsight | null = null;
  const pairs = n - 1; // lag-1 pairs: (brainliftHours[i], aiPct[i+1]) for i=0..n-2
  if (pairs >= CORR_MIN_PAIRS) {
    const blValues: number[] = [];
    const aiNextValues: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      blValues.push(brainliftHours[i]);
      aiNextValues.push(aiPct[i + 1]);
    }

    const r = pearsonR(blValues, aiNextValues);
    if (Math.abs(r) >= CORR_R_THRESHOLD) {
      // Split into high-BL and low-BL groups
      const highBLNextAI: number[] = [];
      const lowBLNextAI: number[] = [];
      for (let i = 0; i < blValues.length; i++) {
        if (blValues[i] >= BRAINLIFT_TARGET_HOURS) {
          highBLNextAI.push(aiNextValues[i]);
        } else {
          lowBLNextAI.push(aiNextValues[i]);
        }
      }

      // Both groups must be non-empty to produce a meaningful comparison
      if (highBLNextAI.length > 0 && lowBLNextAI.length > 0) {
        brainliftCorrelation = {
          r,
          highBLAvgAIPct: avg(highBLNextAI),
          lowBLAvgAIPct: avg(lowBLNextAI),
          pairsUsed: pairs,
        };
      }
    }
  }

  return { trend, best, brainliftCorrelation };
}
