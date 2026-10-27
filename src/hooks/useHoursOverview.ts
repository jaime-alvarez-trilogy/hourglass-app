// useHoursOverview — 1.2 WorkSmart dashboard parity: React Query wrapper for the
// current UTC week's hours overview (GET /api/v3/assignments/{id}/hours-overview).
//
// One call returns the week's minute buckets (tracked / manual approved / pending /
// rejected / idle / disputed / billable), the weekly limit and approved overtime, the
// day-by-day split, 8 weeks of history and this + last week's manual entries.
//
// The key carries assignmentId + env + the UTC week's Monday, so a sign-in as someone
// else, an env switch or Monday 00:00 UTC each start a fresh entry. The web dashboard
// re-polls every 10 minutes while the current week is shown; so do we (foreground only,
// TanStack's default). Persisted like the other queries, so the last good week survives
// a restart.

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { fetchHoursOverview } from '../api/hoursOverview';
import { getAuthToken } from '../api/client';
import { toAuthCreds } from '../api/authCreds';
import { shouldRetryOnce } from '../api/errors';
import { loadCredentials } from '../store/config';
import { utcToday, utcWeekStart, type HoursOverview } from '../lib/hoursOverview';
import type { CrossoverConfig } from '../types/config';

/** Fresh for 5 minutes; polled every 10 minutes while the app is in the foreground. */
export const HOURS_OVERVIEW_STALE_MS = 5 * 60 * 1000;
export const HOURS_OVERVIEW_POLL_MS = 10 * 60 * 1000;

type OverviewOwner = Pick<CrossoverConfig, 'assignmentId' | 'useQA'>;

/** ['hoursOverview', assignmentId, 'qa' | 'prod', weekStart] */
export function hoursOverviewQueryKey(
  assignmentId: string,
  useQA: boolean,
  weekStart: string,
): readonly [string, string, string, string] {
  return ['hoursOverview', assignmentId, useQA ? 'qa' : 'prod', weekStart] as const;
}

/** Reads the stored credentials, gets a token and fetches the week containing `date`. */
export async function loadHoursOverview(
  owner: OverviewOwner,
  date: string,
): Promise<HoursOverview> {
  const useQA = owner.useQA === true;
  if (!owner.assignmentId) throw new Error('No assignmentId');
  const creds = await loadCredentials();
  if (!creds) throw new Error('No credentials');
  const token = await getAuthToken(creds.username, creds.password, useQA);
  return fetchHoursOverview(owner.assignmentId, date, token, useQA, toAuthCreds(creds, useQA));
}

/**
 * Shared query options for the current UTC week, so the home screen and the My Requests
 * queryFn (via `client.fetchQuery`) read and fill the same cache entry.
 */
export function hoursOverviewQueryOptions(owner: OverviewOwner, now: Date = new Date()) {
  return {
    queryKey: hoursOverviewQueryKey(owner.assignmentId, owner.useQA === true, utcWeekStart(now)),
    queryFn: () => loadHoursOverview(owner, utcToday(now)),
    staleTime: HOURS_OVERVIEW_STALE_MS,
    retry: shouldRetryOnce,
  };
}

/**
 * The current week's overview from the cache when fresh (≤ `maxAgeMs`), otherwise one
 * fetch shared with any in-flight home-screen request. Rejects on failure.
 */
export function fetchCurrentHoursOverview(
  client: QueryClient,
  owner: OverviewOwner,
  maxAgeMs: number,
  now: Date = new Date(),
): Promise<HoursOverview> {
  const opts = hoursOverviewQueryOptions(owner, now);
  return client.fetchQuery({ ...opts, staleTime: maxAgeMs, retry: false });
}

/**
 * The current UTC week's hours overview for the signed-in assignment. Disabled until
 * config has an assignmentId. A failed refresh keeps the last good data (`data` stays
 * set, `isError` turns true).
 */
export function useHoursOverview(config: CrossoverConfig | null) {
  const owner: OverviewOwner = {
    assignmentId: config?.assignmentId ?? '',
    useQA: config?.useQA === true,
  };
  return useQuery<HoursOverview, Error>({
    ...hoursOverviewQueryOptions(owner),
    enabled: !!config?.assignmentId,
    refetchInterval: HOURS_OVERVIEW_POLL_MS,
  });
}
