// useAppBreakdown — 11-app-data-layer FR7
// Reads the ai_app_history cache from AsyncStorage on mount AND on tab focus.
// Re-reads on focus so backfill writes from useHistoryBackfill are picked up
// without needing to remount the screen.
// No API calls — freshness is driven by useAIData and useHistoryBackfill writes.

import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { loadAppHistory, mergeAppBreakdown } from '../lib/aiAppBreakdown';
import { getMondayOfWeek } from '../lib/ai';
import type { AppBreakdownEntry } from '../lib/aiAppBreakdown';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppBreakdownResult {
  /** App breakdown for the current week (ai_app_history[currentMonday]). Empty if not yet cached. */
  currentWeek: AppBreakdownEntry[];
  /** Merged breakdown across all 12 weeks in the cache. Empty if cache is empty. */
  aggregated12w: AppBreakdownEntry[];
  /** False until the AsyncStorage read completes (success or error). */
  isReady: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for today in local timezone. */
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Reads ai_app_history from AsyncStorage on mount and derives:
 * - currentWeek: entries for the current Monday key
 * - aggregated12w: merged entries across all stored weeks
 * - isReady: true once load completes (even on error)
 */
export function useAppBreakdown(): AppBreakdownResult {
  const [currentWeek, setCurrentWeek] = useState<AppBreakdownEntry[]>([]);
  const [aggregated12w, setAggregated12w] = useState<AppBreakdownEntry[]>([]);
  const [isReady, setIsReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const currentMonday = getMondayOfWeek(todayLocal());

      loadAppHistory()
        .then(cache => {
          const week = cache[currentMonday] ?? [];
          const aggregate = Object.values(cache).reduce<AppBreakdownEntry[]>(
            (acc, entries) => mergeAppBreakdown(acc, entries),
            [],
          );
          setCurrentWeek(week);
          setAggregated12w(aggregate);
          setIsReady(true);
        })
        .catch(() => {
          setCurrentWeek([]);
          setAggregated12w([]);
          setIsReady(true);
        });
    }, []),
  );

  return { currentWeek, aggregated12w, isReady };
}
