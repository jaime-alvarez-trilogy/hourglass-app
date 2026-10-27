// usePaymentHistory — FR2 support (05-hours-dashboard)
//
// Fetches payment records for the last `numWeeks` weeks in a single API call
// using a wider date range. Returns the raw Payment[] array for aggregation by
// getWeeklyEarningsTrend() from src/lib/payments.ts.
//
// Unlike usePayments (current week only, aggregated), this hook returns all
// individual payment records for the requested range — one per week typically.
//
// durable-data 03-keep-last-good FR3: the queryFn (buildPaymentHistoryQueryFn, shared
// with useEarningsHistory) rethrows every failure, so TanStack keeps the last good data.

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { getAuthToken } from '../api/client';
import { toAuthCreds } from '../api/authCreds';
import { shouldRetryOnce } from '../api/errors';
import { loadCredentials } from '../store/config';
import { useConfig } from './useConfig';
import type { Payment } from '../lib/payments';
import type { CrossoverConfig } from '../types/config';

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
 * Returns the TanStack Query queryFn for one payments-range call
 * (GET /api/v3/users/current/payments?from&to). Shared by usePaymentHistory and
 * useEarningsHistory so the two range calls cannot drift apart. Exported for testing.
 *
 * Resolves the Payment[] the API sent, or `null` when there is no config or the body
 * is not an array. Every rejection propagates (no try/catch): a failed refresh errors
 * the query, so TanStack keeps the previous `data` instead of storing `null`.
 */
export function buildPaymentHistoryQueryFn(
  config: CrossoverConfig | null,
  from: string,
  to: string,
): () => Promise<Payment[] | null> {
  return async () => {
    if (!config) return null;
    const creds = await loadCredentials();
    if (!creds) throw new Error('No credentials');
    const token = await getAuthToken(creds.username, creds.password, config.useQA);

    const result = await apiGet<Payment[]>(
      '/api/v3/users/current/payments',
      { from, to },
      token,
      config.useQA,
      toAuthCreds(creds, config.useQA),
    );
    return Array.isArray(result) ? result : null;
  };
}

/**
 * Returns raw Payment[] records spanning the last numWeeks weeks via a single
 * payments-API call with a wide date range. Unlike usePayments (current week,
 * aggregated), callers receive individual records for trend aggregation.
 * 1-hour staleTime; no AsyncStorage cache — keeps the last good data on error.
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
    queryFn: buildPaymentHistoryQueryFn(config, from, to),
    enabled: !!config,
    staleTime: 60 * 60 * 1000, // 1 hour — historical data changes rarely
    retry: shouldRetryOnce, // one retry, outages only (never a credential failure)
  });

  return {
    data: data ?? null,
    isLoading,
  };
}
