// usePaymentHistory — FR2 support (05-hours-dashboard)
//
// Fetches payment records for the last `numWeeks` weeks in a single API call
// using a wider date range. Returns the raw Payment[] array for aggregation by
// getWeeklyEarningsTrend() from src/lib/payments.ts.
//
// Unlike usePayments (current week only, aggregated), this hook returns all
// individual payment records for the requested range — one per week typically.

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { getAuthToken } from '../api/client';
import { loadCredentials } from '../store/config';
import { useConfig } from './useConfig';
import type { Payment } from '../lib/payments';

/**
 * Returns UTC Monday date string N weeks before the current week's Monday.
 * numWeeksBack=0 → current week's Monday, numWeeksBack=1 → last week's Monday, etc.
 */
function getUTCMondayNWeeksAgo(numWeeksBack: number): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mondayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToMonday - numWeeksBack * 7,
  );
  return new Date(mondayUTC).toISOString().slice(0, 10);
}

/**
 * Returns UTC Sunday date string for the current week.
 */
function getCurrentUTCSunday(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysSinceSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sundayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysSinceSunday,
  );
  return new Date(sundayUTC).toISOString().slice(0, 10);
}

/**
 * Hook: fetches payment records for the last `numWeeks` weeks.
 *
 * @param numWeeks  Number of weeks of history to fetch (default: 4)
 * @returns         { data: Payment[] | null; isLoading: boolean }
 */
export function usePaymentHistory(numWeeks: number = 4): {
  data: Payment[] | null;
  isLoading: boolean;
} {
  const { config } = useConfig();

  const from = getUTCMondayNWeeksAgo(numWeeks - 1);
  const to = getCurrentUTCSunday();

  const { data, isLoading } = useQuery<Payment[] | null, Error>({
    queryKey: ['paymentHistory', from, to, config?.userId],
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
        // Non-fatal — sparkline falls back to flat line
      }
      return null;
    },
    enabled: !!config,
    staleTime: 60 * 60 * 1000, // 1 hour — historical data changes rarely
    retry: 1,
  });

  return {
    data: data ?? null,
    isLoading,
  };
}
