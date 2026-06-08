// useWorkPattern — 02-work-pattern FR5
// Derives the user's personal day-weight profile from stored weekly history.

import { useMemo } from 'react';
import { useWeeklyHistory } from './useWeeklyHistory';
import { inferWorkPattern } from '../lib/workPattern';
import type { WorkPattern } from '../lib/workPattern';

/**
 * Returns the inferred work pattern derived from persisted weekly snapshots.
 * Result is memoized against the snapshots reference — stable when history has not changed.
 * Returns status 'insufficient_data' until at least 4 weeks of dailyHours data exist.
 */
export function useWorkPattern(): WorkPattern {
  const { snapshots } = useWeeklyHistory();
  return useMemo(() => inferWorkPattern(snapshots), [snapshots]);
}
