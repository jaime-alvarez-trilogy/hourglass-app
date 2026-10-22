// FR4 (01-my-requests-data): useMyRequests hook
// Returns current-week manual time request entries for the authenticated contributor.
// Follows the pattern of useApprovalItems — TanStack Query + loadConfig/loadCredentials.
//
// durable-data 02-requests-store FR4: the queryFn is backed by the my_requests_v1 store.
// It plans which days can still change, fetches only those, and writes only the days
// that succeeded. A total failure throws (TanStack keeps the previous data and retries);
// on a cold cache it first seeds the cache from the store ("seed-then-throw").

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { loadConfig, loadCredentials } from '../store/config';
import { fetchWorkDiary } from '../api/workDiary';
import { AuthError, NetworkError, AUTH_HTML_500, NO_CREDENTIALS } from '../api/errors';
import { groupSlotsIntoEntries } from '../lib/requestsUtils';
import { isDaySettled, planRequestRefresh, todayLocal } from '../lib/requestsPlanner';
import {
  buildRequestsView,
  composeRequestsView,
  readRequestsStore,
  updateRequestsStore,
  type RequestsStoreOwner,
  type StoredRequestDay,
} from '../lib/requestsStore';
import { MOCK_MY_REQUESTS } from '../lib/devMock';
import { log } from '../lib/log';
import type { Credentials } from '../types/config';
import type { MyRequestsData, UseMyRequestsResult } from '../types/requests';

/** ownerKey of the manager-preview view: never a prior, never stored (cross-spec contract). */
const DEV_MOCK_OWNER_KEY = 'dev-mock';

// ─── Forced refresh (one-shot) ───────────────────────────────────────────────

let forcedRefresh = false;

/** The next queryFn run re-fetches the whole 3-week window (pull-to-refresh / Retry). */
export function markMyRequestsForcedRefresh(): void {
  forcedRefresh = true;
}

/** Reads and resets the one-shot flag. */
function consumeForcedRefresh(): boolean {
  const force = forcedRefresh;
  forcedRefresh = false;
  return force;
}

// ─── Error mapping ───────────────────────────────────────────────────────────

/**
 * Maps a thrown error to the screen's error kind: 'auth' for a real 401/403 (including
 * missing credentials), 'network' for anything else (an AUTH_HTML_500 is an outage).
 */
export function toRequestsError(err: unknown): 'auth' | 'network' | null {
  if (!err) return null;
  if (err instanceof AuthError && err.errorCode !== AUTH_HTML_500) return 'auth';
  return 'network';
}

// ─── Query function (exported for testing) ───────────────────────────────────

/** The part of TanStack's QueryFunctionContext the queryFn uses. */
type MyRequestsQueryContext = { client: QueryClient; queryKey: readonly unknown[] };

/**
 * Returns the TanStack Query queryFn for useMyRequests.
 * Exported separately so it can be tested in isolation without renderHook.
 *
 * @param todayOverride  Inject today's date (YYYY-MM-DD) for testing.
 * @param nowOverride    Inject the clock for testing. Defaults to local noon of
 *                       `todayOverride` when only that is given.
 */
export function buildMyRequestsQueryFn(
  todayOverride?: string,
  nowOverride?: () => number,
): (ctx?: MyRequestsQueryContext) => Promise<MyRequestsData> {
  return async (ctx) => {
    // Captured once per run, so a midnight rollover cannot split it
    const today = todayOverride ?? todayLocal();
    const nowMs =
      nowOverride?.() ?? (todayOverride ? Date.parse(today + 'T12:00:00') : Date.now());

    const config = await loadConfig();

    // Dev: manager preview — fake my-requests, no store I/O; the force flag is kept
    if (config?.devManagerView) {
      return { entries: [...MOCK_MY_REQUESTS], error: null, ownerKey: DEV_MOCK_OWNER_KEY };
    }

    // Signed out: a legitimate empty result
    if (!config || !config.assignmentId) {
      return { entries: [], error: null };
    }

    const { assignmentId } = config;
    const useQA = config.useQA === true;
    const owner: RequestsStoreOwner = { assignmentId, useQA };
    const ownerKey = `${assignmentId}|${useQA ? 'qa' : 'prod'}`;

    const read = await readRequestsStore(owner);
    const baseDays = read.status === 'ok' ? read.store.days : {};

    // Only same-owner or legacy (unstamped) cache data is carried forward or blocks seeding
    const rawPrior = ctx?.client.getQueryData<MyRequestsData>(ctx.queryKey);
    const prior =
      rawPrior && (rawPrior.ownerKey === undefined || rawPrior.ownerKey === ownerKey)
        ? rawPrior
        : undefined;

    // Cold cache: show the stored view before throwing, so the error keeps data on screen
    const seedAndThrow = (err: unknown, staleDates: string[]): never => {
      if (ctx && prior === undefined && Object.keys(baseDays).length > 0) {
        const view = buildRequestsView(baseDays, today);
        ctx.client.setQueryData<MyRequestsData>(
          ctx.queryKey,
          { ...view, error: null, staleDates, ownerKey },
          { updatedAt: Date.parse(view.updatedAt ?? '') || undefined },
        );
      }
      throw err;
    };

    // Credentials are read after the store, so a missing keychain entry still seeds
    let credentials: Credentials | null;
    try {
      credentials = await loadCredentials();
    } catch (err) {
      return seedAndThrow(err, []);
    }
    if (!credentials) {
      return seedAndThrow(
        new AuthError(401, 'Credentials unavailable', { errorCode: NO_CREDENTIALS }),
        [],
      );
    }

    const plan = planRequestRefresh({ today, nowMs, days: baseDays, force: consumeForcedRefresh() });

    // Fetch the planned days in parallel, tolerating individual failures
    const settled = await Promise.allSettled(
      plan.dates.map((date) => fetchWorkDiary(assignmentId, date, credentials, useQA)),
    );

    // A fulfilled array (even []) is a confirmed day. A rejection, or a non-array
    // (an empty body parses to undefined), is a failed day and keeps its old record.
    const fetchedAt = new Date(nowMs).toISOString();
    const fetched: StoredRequestDay[] = [];
    const failedDates: string[] = [];
    const reasons: unknown[] = [];
    settled.forEach((result, i) => {
      const date = plan.dates[i];
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        const entries = groupSlotsIntoEntries(result.value, date);
        fetched.push({ date, fetchedAt, entries, settled: isDaySettled(date, entries, today) });
      } else {
        failedDates.push(date);
        if (result.status === 'rejected') reasons.push(result.reason);
      }
    });

    // Total failure: write nothing and throw, so TanStack keeps the previous data
    if (fetched.length === 0) {
      const err =
        reasons.find((r) => r instanceof AuthError && r.errorCode !== AUTH_HTML_500) ??
        reasons[0] ??
        new NetworkError('Empty work diary response');
      log.warn('requests.refresh_failed', {
        plannedDays: plan.dates.length,
        failedDays: failedDates.length,
        kind: toRequestsError(err),
      });
      return seedAndThrow(err, plan.dates);
    }

    // An unreadable store is never written this run; the view still uses what was fetched
    const stored =
      read.status === 'unreadable' ? null : await updateRequestsStore(owner, fetched, today);
    const days =
      stored?.days ?? { ...baseDays, ...Object.fromEntries(fetched.map((d) => [d.date, d])) };

    return {
      entries: composeRequestsView(days, today, prior),
      error: null,
      // plan.dates is newest first, so failedDates already is
      staleDates: failedDates,
      updatedAt: buildRequestsView(days, today).updatedAt,
      ownerKey,
    };
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * React Query hook returning the user's own manual time request entries
 * (pending/approved/rejected) across the last 2 prior weeks plus the current week.
 * Iterates work diary day-by-day in parallel, tolerates per-day failures, and
 * only surfaces an error string when all days fail. Works for contributors and managers alike.
 */
export function useMyRequests(): UseMyRequestsResult {
  const { config } = useConfig();
  const assignmentId = config?.assignmentId ?? null;

  const { data, isLoading, error: queryError, refetch } = useQuery({
    queryKey: ['myRequests', assignmentId],
    queryFn: buildMyRequestsQueryFn(),
    staleTime: 60_000,
    enabled: !!assignmentId,
    retry: 2,
  });

  return {
    entries: data?.entries ?? [],
    isLoading,
    error: data?.error ?? (queryError ? 'network' : null),
    refetch,
  };
}
