/**
 * useEarningsHistory — persistent 12-week earnings trend
 *
 * Fetch: TanStack Query (proven, handles retry/dedup/stale).
 * Cache: AsyncStorage — loads on mount for instant display, saves on success.
 *
 * Past weeks are finalized so they're stored permanently.
 * Current week re-fetches when TanStack considers it stale (1h staleTime).
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { loadCredentials } from '../store/config';
import { getAuthToken, apiGet } from '../api/client';
import type { Payment } from '../lib/payments';
import { loadWeeklyHistory, mergeWeeklySnapshot, saveWeeklyHistory } from '../lib/weeklyHistory';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_KEY = 'earnings_history_v1';
export const EARNINGS_HISTORY_WEEKS = 24;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getUTCMondayNWeeksAgo(weeksBack: number): string {
  const now = new Date();
  const dow = now.getUTCDay();
  const daysToMonday = dow === 0 ? 6 : dow - 1;
  const ms = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToMonday - weeksBack * 7,
  );
  return new Date(ms).toISOString().slice(0, 10);
}

function getCurrentUTCSunday(): string {
  const now = new Date();
  const dow = now.getUTCDay();
  const daysToSunday = dow === 0 ? 0 : 7 - dow;
  const ms = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysToSunday,
  );
  return new Date(ms).toISOString().slice(0, 10);
}

/** Sorted list of Monday dates for the last N weeks, oldest first. */
function buildWeekKeys(numWeeks: number): string[] {
  const keys: string[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    keys.push(getUTCMondayNWeeksAgo(i));
  }
  return keys;
}

/** Convert a week→amount map into a number[] of length numWeeks (oldest first). */
function mapToTrend(weeks: Record<string, number>, numWeeks: number): number[] {
  return buildWeekKeys(numWeeks).map(k => weeks[k] ?? 0);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseEarningsHistoryResult {
  trend: number[];
  isLoading: boolean;
}

export function useEarningsHistory(
  numWeeks: number = EARNINGS_HISTORY_WEEKS,
): UseEarningsHistoryResult {
  const { config } = useConfig();

  // Persisted trend loaded from AsyncStorage (instant display on mount)
  const [persistedTrend, setPersistedTrend] = useState<number[] | null>(null);

  // Load AsyncStorage cache on mount
  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then(raw => {
        if (!raw) return;
        try {
          const cached = JSON.parse(raw) as Record<string, number>;
          setPersistedTrend(mapToTrend(cached, numWeeks));
        } catch {
          // corrupt cache — ignore
        }
      })
      .catch(() => {});
  }, []);

  const from = getUTCMondayNWeeksAgo(numWeeks - 1);
  const to = getCurrentUTCSunday();

  // TanStack Query — same proven pattern as usePaymentHistory
  const { data: payments, isLoading } = useQuery<Payment[] | null, Error>({
    queryKey: ['earningsHistory', from, to, config?.userId],
    queryFn: async () => {
      if (!config) return null;
      const creds = await loadCredentials();
      if (!creds) throw new Error('No credentials');
      const token = await getAuthToken(creds.username, creds.password, config.useQA);
      try {
        const result = await apiGet<Payment[]>(
          '/api/v3/users/current/payments',
          { from, to },
          token,
          config.useQA,
        );
        if (Array.isArray(result)) return result;
      } catch {
        // Non-fatal — use persisted cache
      }
      return null;
    },
    enabled: !!config,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });

  // Merge API response into persistent cache and save
  useEffect(() => {
    if (!payments) return;

    // Build week maps keyed by periodStartDate (YYYY-MM-DD)
    const weeks: Record<string, number> = {};
    const hoursMap: Record<string, number> = {};
    const overtimeMap: Record<string, number> = {};
    for (const p of payments) {
      if (!p.periodStartDate) continue;
      const weekFrom = p.periodStartDate.slice(0, 10);
      weeks[weekFrom] = (weeks[weekFrom] ?? 0) + p.amount;
      hoursMap[weekFrom] = (hoursMap[weekFrom] ?? 0) + p.paidHours;
      // overtimeHours is the direct API field — no math needed.
      overtimeMap[weekFrom] = (overtimeMap[weekFrom] ?? 0) + (p.overtimeHours ?? 0);
    }

    // Merge with existing persisted data (keep weeks not in this API response)
    AsyncStorage.getItem(CACHE_KEY)
      .then(raw => {
        const existing: Record<string, number> = raw ? JSON.parse(raw) : {};
        const merged = { ...existing, ...weeks }; // API data wins for overlapping weeks
        setPersistedTrend(mapToTrend(merged, numWeeks));
        return AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged));
      })
      .catch(() => {
        // If read fails, just use the API data directly
        setPersistedTrend(mapToTrend(weeks, numWeeks));
      });

    // FR3 (06-overview-history): also write earnings + hours + overtime to weekly_history_v2.
    // Additive write — failure is silent and does not affect the trend return value.
    loadWeeklyHistory()
      .then(history => {
        let updated = history;
        for (const weekStart of Object.keys(weeks)) {
          updated = mergeWeeklySnapshot(updated, {
            weekStart,
            earnings: weeks[weekStart],
            hours: hoursMap[weekStart] ?? 0,
            overtime: overtimeMap[weekStart] ?? 0,
          });
        }
        return saveWeeklyHistory(updated);
      })
      .catch(() => {
        // Silent failure — weekly_history_v2 write does not affect earnings trend
      });
  }, [payments]);

  // Prefer live API data; fall back to persisted cache while loading
  const trend: number[] = (() => {
    if (payments) {
      // Use persistedTrend which was just updated from merged payments
      return persistedTrend ?? mapToTrend({}, numWeeks);
    }
    if (persistedTrend) return persistedTrend;
    return new Array(numWeeks).fill(0);
  })();

  return {
    trend,
    isLoading: isLoading && !persistedTrend,
  };
}
