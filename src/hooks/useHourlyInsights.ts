// useHourlyInsights.ts — 02-hourly-pattern-insights FR5
// Thin hook that derives hourly work patterns from WeeklySnapshot history.

import { useMemo } from 'react';
import { useWeeklyHistory } from './useWeeklyHistory';
import {
  computeHourlyProfile,
  inferFocusWindow,
  inferAIHotZone,
} from '../lib/hourlyInsights';
export type { HourlyProfile, FocusWindow, AIHotZone, HourlyInsights } from '../lib/hourlyInsights';

/**
 * Computes the hourly pattern profile and derived focus/AI windows from the
 * user's weekly history. Returns nulls for all fields until ≥4 valid weeks
 * (with hourlyIntensity, hourlyAISlots, hourlyProductiveSlots) are available.
 * Re-computes only when the snapshots reference changes.
 */
export function useHourlyInsights() {
  const { snapshots } = useWeeklyHistory();

  const profile = useMemo(() => computeHourlyProfile(snapshots), [snapshots]);
  const focusWindow = useMemo(() => (profile ? inferFocusWindow(profile) : null), [profile]);
  const aiHotZone = useMemo(() => (profile ? inferAIHotZone(profile) : null), [profile]);

  return { profile, focusWindow, aiHotZone };
}
