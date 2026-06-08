// insightFormatting.ts — 05-insights-ui FR1
// Pure formatting functions that convert raw insight types into display-ready chips.
// No hooks, no side effects — safe to call in useMemo or render.

import { colors } from './colors';
import type { Prescription } from './prescription';
import type {
  AITrendInsight,
  AIBestInsight,
  BrainLiftCorrelationInsight,
} from './aiInsights';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InsightChipData {
  /** Stable React list key: 'pace' | 'ai-trend' | 'brainlift' */
  key: string;
  /** Primary text line — max ~55 chars */
  boldLine: string;
  /** Secondary text line — max ~55 chars */
  mutedLine: string;
  /** Hex from colors.* palette only (no raw hex literals) */
  dotColor: string;
}

// ─── formatPrescriptionChip ───────────────────────────────────────────────────

/**
 * Converts a Prescription into an InsightChipData for the pace chip.
 * Handles all three status values: done, active, insufficient_data.
 * Returns key 'pace'; dotColor uses colors.success for done/active,
 * colors.textSecondary for insufficient_data.
 */
export function formatPrescriptionChip(p: Prescription): InsightChipData {
  if (p.status === 'done') {
    if (p.totalRemaining > 0) {
      return {
        key: 'pace',
        boldLine: 'Week complete',
        mutedLine: `${p.totalRemaining.toFixed(1)}h short of goal`,
        dotColor: colors.textSecondary,
      };
    }
    return {
      key: 'pace',
      boldLine: "You're done for the week",
      mutedLine: '40h hit — rest or keep going',
      dotColor: colors.success,
    };
  }

  if (p.status === 'active') {
    return {
      key: 'pace',
      boldLine: p.summaryLine,
      mutedLine: p.patternBased ? 'based on your pattern' : 'based on standard schedule',
      dotColor: colors.success,
    };
  }

  // insufficient_data
  const hoursStr = p.totalRemaining > 0 ? `${p.totalRemaining.toFixed(1)}h` : 'more hours';
  const daysStr = p.days.length > 0 ? `${p.days.length} day${p.days.length > 1 ? 's' : ''} left` : 'week left';
  return {
    key: 'pace',
    boldLine: `Need ${hoursStr} · ${daysStr}`,
    mutedLine: 'Building your work pattern…',
    dotColor: colors.textSecondary,
  };
}

// ─── formatTrendChip ──────────────────────────────────────────────────────────

/**
 * Converts AITrendInsight + AIBestInsight into an InsightChipData for the AI trend chip.
 * Self-guards: returns null when both arguments are null (no data to display).
 * dotColor is always colors.cyan regardless of direction — direction is in the text.
 */
export function formatTrendChip(
  trend: AITrendInsight | null,
  best: AIBestInsight | null,
): InsightChipData | null {
  if (trend === null && best === null) return null;

  let boldLine: string;
  if (trend === null) {
    // Only best is available (we know best !== null here — both-null returns above)
    boldLine = `AI at ${Math.round(best!.currentPct)}%`;
  } else if (trend.direction === 'up') {
    boldLine = `AI up +${Math.round(trend.slopePts)}pts over ${trend.weeksUsed} weeks`;
  } else if (trend.direction === 'down') {
    boldLine = `AI down ${Math.round(Math.abs(trend.slopePts))}pts over ${trend.weeksUsed} weeks`;
  } else {
    // flat
    const pct = best ? Math.round(best.currentPct) : null;
    boldLine = pct !== null ? `AI holding steady at ~${pct}%` : 'AI holding steady';
  }

  let mutedLine: string;
  if (best === null) {
    mutedLine = 'building history…';
  } else if (trend?.direction === 'down') {
    mutedLine = `Your best: ${Math.round(best.peakPct)}% (${best.weekLabel}) – ${best.ptsBelowBest}pts gap`;
  } else {
    mutedLine = `Your best: ${Math.round(best.peakPct)}% (${best.weekLabel})`;
  }

  return {
    key: 'ai-trend',
    boldLine,
    mutedLine,
    dotColor: colors.cyan,
  };
}

// ─── formatCorrelationChip ────────────────────────────────────────────────────

/**
 * Converts a BrainLiftCorrelationInsight into an InsightChipData for the BrainLift chip.
 * Caller must null-guard before calling — this function does not accept null.
 * dotColor is colors.violet (BrainLift semantic color lock).
 */
export function formatCorrelationChip(c: BrainLiftCorrelationInsight): InsightChipData {
  const delta = Math.round(c.highBLAvgAIPct - c.lowBLAvgAIPct);
  const high = Math.round(c.highBLAvgAIPct);
  const low = Math.round(c.lowBLAvgAIPct);
  return {
    key: 'brainlift',
    boldLine: `BrainLift weeks → +${delta}pts AI next week`,
    mutedLine: `5h+ BL: ${high}% avg · other weeks: ${low}%`,
    dotColor: colors.violet,
  };
}
