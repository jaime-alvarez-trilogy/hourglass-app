// useAIInsights.ts — 04-ai-insights FR4
// Stateful hook that assembles aligned weekly history arrays and computes AI insights.

import { useMemo } from 'react';
import { useWeeklyHistory } from './useWeeklyHistory';
import { useHoursData } from './useHoursData';
import { useAIData } from './useAIData';
import { computeAIInsights } from '../lib/aiInsights';
import { getWeekStartDate } from '../lib/hours';
import type { AIInsights } from '../lib/aiInsights';

/**
 * Derives AI trend, personal best, and BrainLift→AI lag correlation from the
 * FULL weekly history (always reads all stored snapshots — independent of the
 * Overview chart window). Reads useWeeklyHistory, useHoursData, and useAIData.
 * Returns AIInsights with nullable fields when guards fail (trend <5 wk,
 * best <4 wk, correlation <8 pairs or |r|<0.35).
 */
export function useAIInsights(): AIInsights {
  const { snapshots } = useWeeklyHistory();
  const { data: hoursData } = useHoursData();
  const { data: aiData } = useAIData();

  return useMemo(() => {
    const currentMonday = getWeekStartDate(true); // UTC Monday, YYYY-MM-DD
    const past = snapshots.filter(s => s.weekStart < currentMonday);

    const currentAiPct = aiData ? Math.round((aiData.aiPctLow + aiData.aiPctHigh) / 2) : 0;
    const currentBL = aiData?.brainliftHours ?? 0;

    // Build index-aligned arrays: past weeks first, current week last
    const aiPct      = [...past.map(s => s.aiPct),          currentAiPct];
    const brainlift  = [...past.map(s => s.brainliftHours), currentBL];
    const weekStarts = [...past.map(s => s.weekStart),      currentMonday];

    return computeAIInsights(aiPct, brainlift, weekStarts);
    // hoursData is included so the memo recomputes when live hours change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots, hoursData, aiData]);
}
