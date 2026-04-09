// useOverviewData — 07-overview-sync FR3
//
// Composes all 4 metric arrays (earnings, hours, AI%, BrainLift) for the Overview tab.
// Combines persisted weekly history with live current-week data from active hooks.
//
// Data composition:
//   - earnings:       useWeeklyHistory().snapshots[i].earnings (past) + useHoursData current week
//   - hours:          snapshots[i].hours (past) + useHoursData current week total
//   - aiPct:          snapshots[i].aiPct (past) + useAIData current week midpoint
//   - brainliftHours: snapshots[i].brainliftHours (past) + useAIData current week
//
// Current week is ALWAYS the last entry.
// Arrays are sliced to last `window` entries (no padding if history is shorter).
// weekLabels is aligned to actual data array length.

import { useMemo } from 'react';
import { useWeeklyHistory } from './useWeeklyHistory';
import { useHoursData } from './useHoursData';
import { useAIData } from './useAIData';
import { getWeekLabels, getWeekStartDate } from '../lib/hours';
import type { WeeklySnapshot } from '../lib/weeklyHistory';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OverviewData {
  earnings: number[];       // length = min(history + 1, window)
  hours: number[];          // Payment hours (what you're paid for) — same length
  aiPct: number[];          // same length
  brainliftHours: number[]; // same length
  overtimeHours: number[];  // Actual overtime above weekly limit per week — same length
  weekLabels: string[];     // aligned to data array length
}

export interface UseOverviewDataResult {
  data: OverviewData;
  isLoading: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Compose Overview tab data arrays for the given time window.
 *
 * @param window - Number of weeks to display: 4 or 12
 */
export function useOverviewData(
  window: 4 | 12 | 24,
): UseOverviewDataResult {
  const { snapshots, isLoading: historyLoading } = useWeeklyHistory();
  const { data: hoursData, isLoading: hoursLoading } = useHoursData();
  const { data: aiData, isLoading: aiLoading } = useAIData();

  const isLoading = historyLoading || hoursLoading || aiLoading;

  const data = useMemo((): OverviewData => {
    // Current week live values (fall back to 0 if data not yet loaded)
    const currentEarnings = hoursData?.weeklyEarnings ?? 0;
    const currentHours = hoursData?.total ?? 0;
    const currentAiPct = aiData
      ? Math.round((aiData.aiPctLow + aiData.aiPctHigh) / 2)
      : 0;
    const currentBrainlift = aiData?.brainliftHours ?? 0;

    // Exclude the current UTC week from past snapshots — useEarningsHistory writes
    // the current week to storage (ai:0), which would otherwise duplicate the live
    // current-week entry we append below and shift all labels by 1 week.
    const currentMonday = getWeekStartDate(true); // UTC Monday
    const pastSnapshots = snapshots.filter(s => s.weekStart < currentMonday);

    // Take up to (window - 1) past snapshots, then append current week
    const pastSlice = pastSnapshots.slice(-(window - 1));

    const earnings = [...pastSlice.map(s => s.earnings), currentEarnings];
    const hours = [...pastSlice.map(s => s.hours), currentHours];
    const aiPct = [...pastSlice.map(s => s.aiPct), currentAiPct];
    const brainliftHours = [...pastSlice.map(s => s.brainliftHours), currentBrainlift];
    // Current week overtime: useEarningsHistory fetches the CURRENT-status payment record too,
    // so it stores actualOvertime in the current week's snapshot. Look it up directly.
    const currentWeekSnapshot = snapshots.find(s => s.weekStart === currentMonday);
    const currentOvertime = currentWeekSnapshot?.overtime ?? 0;
    const overtimeHours = [...pastSlice.map(s => s.overtime ?? 0), currentOvertime];

    // weekLabels from getWeekLabels(window), aligned to actual data length
    const allLabels = getWeekLabels(window);
    const weekLabels = allLabels.slice(-earnings.length);

    return { earnings, hours, aiPct, brainliftHours, overtimeHours, weekLabels };
  }, [snapshots, hoursData, aiData, window]);

  return { data, isLoading };
}
