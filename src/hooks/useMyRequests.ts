// FR4 (01-my-requests-data): useMyRequests hook
// Returns current-week manual time request entries for the authenticated contributor.
// Follows the pattern of useApprovalItems — TanStack Query + loadConfig/loadCredentials.

import { useQuery } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { loadConfig, loadCredentials } from '../store/config';
import { fetchWorkDiary } from '../api/workDiary';
import { AuthError } from '../api/errors';
import { getWeekStartDate } from '../lib/approvals';
import { groupSlotsIntoEntries } from '../lib/requestsUtils';
import { MOCK_MY_REQUESTS } from '../lib/devMock';
import type { ManualRequestEntry, UseMyRequestsResult } from '../types/requests';

// ─── Date helpers ──────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for today in local timezone. */
function todayLocal(): string {
  return formatDate(new Date());
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Returns YYYY-MM-DD for the day N days after the given YYYY-MM-DD string. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/** Returns all dates from start through end inclusive (YYYY-MM-DD strings). */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

// ─── Query function (exported for testing) ───────────────────────────────────

/**
 * Returns the TanStack Query queryFn for useMyRequests.
 * Exported separately so it can be tested in isolation without renderHook.
 *
 * @param todayOverride  Inject today's date (YYYY-MM-DD) for testing.
 */
export function buildMyRequestsQueryFn(
  todayOverride?: string,
): () => Promise<{ entries: ManualRequestEntry[]; error: 'auth' | 'network' | null }> {
  return async () => {
    const today = todayOverride ?? todayLocal();

    // Load config + credentials in parallel
    const [config, credentials] = await Promise.all([loadConfig(), loadCredentials()]);

    // Dev: manager preview — return fake my-requests without API calls
    if (config?.devManagerView) {
      return { entries: [...MOCK_MY_REQUESTS], error: null };
    }

    // Guard: no config or missing assignmentId
    if (!config || !config.assignmentId || !credentials) {
      return { entries: [], error: null };
    }

    const { assignmentId, useQA } = config;

    // Build date range: Monday of current week through today
    const monday = getWeekStartDate(new Date(today + 'T12:00:00'));
    const dates = dateRange(monday, today);

    // Fetch all days in parallel, tolerating individual failures
    const settled = await Promise.allSettled(
      dates.map((date) => fetchWorkDiary(assignmentId, date, credentials, useQA)),
    );

    // Collect entries from fulfilled days, track errors from rejected days
    const allEntries: ManualRequestEntry[] = [];
    let authFailed = 0;
    let totalFailed = 0;

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === 'fulfilled') {
        const dayEntries = groupSlotsIntoEntries(result.value, dates[i]);
        allEntries.push(...dayEntries);
      } else {
        totalFailed++;
        if (result.reason instanceof AuthError) {
          authFailed++;
        }
      }
    }

    // Sort entries newest-first
    allEntries.sort((a, b) => (a.date > b.date ? -1 : 1));

    // Error classification: only report error if ALL days failed
    let error: 'auth' | 'network' | null = null;
    if (totalFailed === dates.length && totalFailed > 0) {
      if (authFailed > 0) {
        error = 'auth';
      } else {
        // Network error, unknown error, or mix — surface as network
        error = 'network';
      }
    }

    return { entries: allEntries, error };
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches manual time requests for the current contributor for Mon–today.
 * Works for all users (contributors and managers alike).
 */
export function useMyRequests(): UseMyRequestsResult {
  const { config } = useConfig();
  const assignmentId = config?.assignmentId ?? null;

  const { data, isLoading, error: queryError, refetch } = useQuery({
    queryKey: ['myRequests', assignmentId],
    queryFn: buildMyRequestsQueryFn(),
    staleTime: 60_000,
    enabled: !!assignmentId,
    retry: false,
  });

  return {
    entries: data?.entries ?? [],
    isLoading,
    error: data?.error ?? (queryError ? 'network' : null),
    refetch,
  };
}
