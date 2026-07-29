// useWorkSchedule.ts — 02-schedule-insights FR2
// Thin hook that derives the user's typical work schedule from WeeklySnapshot history.

import { useWeeklyHistory } from './useWeeklyHistory';
import { inferWorkSchedule } from '../lib/scheduleInsights';
export type { WorkSchedule } from '../lib/scheduleInsights';

/**
 * Returns the inferred work schedule from WeeklySnapshot history, or null when
 * insufficient data (< 4 weeks with non-zero hourlySlots). Reactivity is provided
 * by useWeeklyHistory — re-computes on every backfill write.
 */
export function useWorkSchedule() {
  const { snapshots } = useWeeklyHistory();
  return inferWorkSchedule(snapshots);
}
