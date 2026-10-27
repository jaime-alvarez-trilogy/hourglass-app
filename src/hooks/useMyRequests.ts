// FR4 (01-my-requests-data): useMyRequests hook
// Returns current-week manual time request entries for the authenticated contributor.
// Follows the pattern of useApprovalItems — TanStack Query + loadConfig/loadCredentials.
//
// durable-data 02-requests-store FR4: the queryFn is backed by the my_requests_v1 store.
// It plans which days can still change, fetches only those, and writes only the days
// that succeeded. A total failure throws (TanStack keeps the previous data and retries);
// on a cold cache it first seeds the cache from the store ("seed-then-throw").
// FR5: the hook retries through shouldRetryQuery and shows the view only to its owner
// (selectMyRequests).
//
// durable-data 04-requests-history-ui FR3: selectMyRequests also returns the auth
// errorCode, the returned refetch is the forced refresh, and isLoading holds while the
// persister restores the cache (or config loads with no data), so a cold start never
// flashes an empty list.
//
// durable-data 05-requests-backfill FR3: toOwnerKey is exported, so the backfill's live
// view update guards with the same owner stamp as selectMyRequests (C2).
//
// 1.2 WorkSmart dashboard parity: one hours-overview call carries this and last UTC week's
// manual entries, so the planned dates it covers are taken from it and only the rest go to
// the work diary (one call per day). If the overview fails, every planned date does.
// Planned dates are LOCAL dates: one is covered only when its whole local day lies inside the
// overview's two UTC weeks, and its entries are those whose UTC start falls on that local date.

import { useIsRestoring, useQuery, type QueryClient } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { loadConfig, loadCredentials } from '../store/config';
import { fetchWorkDiary } from '../api/workDiary';
import { getAuthGeneration } from '../api/client';
import {
  AuthError,
  AuthResetError,
  NetworkError,
  AUTH_HTML_500,
  NO_CREDENTIALS,
  MAX_QUERY_RETRIES,
  shouldRetryQuery,
} from '../api/errors';
import { fetchCurrentHoursOverview } from './useHoursOverview';
import { addDays as addUtcDays, type HoursOverview } from '../lib/hoursOverview';
import { groupOverviewEntries, groupSlotsIntoEntries, localDatesWithin } from '../lib/requestsUtils';
import { isDaySettled, planRequestRefresh, todayLocal } from '../lib/requestsPlanner';
import {
  buildRequestsView,
  composeRequestsView,
  isOwnerConfigured,
  readRequestsStore,
  updateRequestsStore,
  type RequestsStoreOwner,
  type StoredRequestDay,
} from '../lib/requestsStore';
import { MOCK_MY_REQUESTS } from '../lib/devMock';
import { log } from '../lib/log';
import type { CrossoverConfig, Credentials } from '../types/config';
import type { ManualRequestEntry, MyRequestsData, UseMyRequestsResult } from '../types/requests';

/** ownerKey of the manager-preview view: never a prior, never stored (cross-spec contract). */
const DEV_MOCK_OWNER_KEY = 'dev-mock';

/** A home-screen overview fetched within this long is reused; a forced run always fetches. */
const OVERVIEW_MAX_AGE_MS = 60_000;

/** The view's owner stamp: `${assignmentId}|qa` or `${assignmentId}|prod`. */
export function toOwnerKey(assignmentId: string, useQA: boolean): string {
  return `${assignmentId}|${useQA ? 'qa' : 'prod'}`;
}

// ─── Forced refresh ──────────────────────────────────────────────────────────

// Every run that starts while a mark is set plans the whole 3-week window. The mark is
// cleared by the first such run that fetches at least one day, or after
// 1 + MAX_QUERY_RETRIES totally failed forced runs. So neither a TanStack retry nor an
// earlier run that refetch() cancelled (its body keeps running) can use it up before the
// visible run plans, and an outage does not force every later wake.
let forcedRefresh: { failuresLeft: number } | null = null;

/** The next queryFn runs re-fetch the whole 3-week window (pull-to-refresh / Retry). */
export function markMyRequestsForcedRefresh(): void {
  forcedRefresh = { failuresLeft: MAX_QUERY_RETRIES + 1 };
}

/** A forced run fetched at least one day: the mark it read is done. */
function settleForcedRefresh(mark: typeof forcedRefresh): void {
  if (mark && forcedRefresh === mark) forcedRefresh = null;
}

/** A forced run failed totally: the mark it read has one attempt fewer left. */
function failForcedRefresh(mark: typeof forcedRefresh): void {
  if (mark && forcedRefresh === mark && --mark.failuresLeft <= 0) forcedRefresh = null;
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

// ─── Display rule (exported for testing) ─────────────────────────────────────

/**
 * What the screen shows from the cached view. The TanStack key carries no environment,
 * so a view is shown only to its owner: a legacy (unstamped) blob or the current
 * `assignmentId|env`, and the 'dev-mock' view only while the manager preview is on.
 * A thrown query error wins over the view's own (legacy) error. `errorCode` is the
 * AuthError's own code, and only when the error maps to 'auth'.
 */
export function selectMyRequests(
  data: MyRequestsData | undefined,
  config: CrossoverConfig | null | undefined,
  queryError: unknown,
): Required<Pick<UseMyRequestsResult, 'entries' | 'error' | 'errorCode' | 'staleDates' | 'updatedAt'>> {
  const ownerKey = config?.assignmentId
    ? toOwnerKey(config.assignmentId, config.useQA === true)
    : undefined;

  const visible =
    data !== undefined &&
    (data.ownerKey === undefined ||
      data.ownerKey === ownerKey ||
      (data.ownerKey === DEV_MOCK_OWNER_KEY && config?.devManagerView === true));

  const thrown = toRequestsError(queryError);

  return {
    entries: visible ? data.entries : [],
    error: thrown ?? data?.error ?? null,
    errorCode:
      thrown === 'auth' && queryError instanceof AuthError ? queryError.errorCode ?? null : null,
    staleDates: data?.staleDates ?? [],
    updatedAt: data?.updatedAt ?? null,
  };
}

// ─── Hours overview ──────────────────────────────────────────────────────────

type OverviewDays = {
  /** Grouped entries of each planned date the overview covers, in plan order. */
  days: ReadonlyMap<string, ManualRequestEntry[]>;
  /** The overview call was superseded by a sign-out or env switch (AuthResetError). */
  reset: boolean;
};

const NO_OVERVIEW_DAYS: OverviewDays = { days: new Map(), reset: false };

/**
 * The planned local `dates` the current UTC week's hours overview covers, grouped as the
 * work diary would be. The overview holds the manual entries of its week and the one before,
 * the UTC window [weekStart − 7 d, weekStart + 7 d), so a date counts only when its whole
 * local day lies inside it. A partly covered edge day (the local Sunday west of UTC, the
 * local Monday of last week east of it) goes to the work diary like an uncovered one, and
 * the overview's entries on it are dropped. A failed call covers nothing.
 */
async function readOverviewDays(
  client: QueryClient,
  owner: RequestsStoreOwner,
  dates: readonly string[],
  maxAgeMs: number,
  now: Date,
): Promise<OverviewDays> {
  let overview: HoursOverview;
  try {
    overview = await fetchCurrentHoursOverview(client, owner, maxAgeMs, now);
  } catch (err) {
    log.warn('requests.overview_failed', { kind: toRequestsError(err) });
    return { days: new Map(), reset: err instanceof AuthResetError };
  }
  const covered = localDatesWithin(
    dates,
    Date.parse(`${addUtcDays(overview.weekStart, -7)}T00:00:00Z`),
    Date.parse(`${addUtcDays(overview.weekStart, 7)}T00:00:00Z`),
  );
  const days = groupOverviewEntries(overview.manualEntries, covered);
  log.info('requests.overview_used', {
    coveredDays: days.size,
    workDiaryDays: dates.length - days.size,
  });
  return { days, reset: false };
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

    // The owner is unknown until config is read, so there is no stored view to seed
    let config: CrossoverConfig | null;
    try {
      config = await loadConfig();
    } catch (err) {
      log.warn('requests.config_read_failed', {});
      throw err;
    }

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
    const ownerKey = toOwnerKey(assignmentId, useQA);

    const read = await readRequestsStore(owner);
    const baseDays = read.status === 'ok' ? read.store.days : {};

    // Only same-owner or legacy (unstamped) cache data is carried forward or blocks seeding
    const rawPrior = ctx?.client.getQueryData<MyRequestsData>(ctx.queryKey);
    const prior =
      rawPrior && (rawPrior.ownerKey === undefined || rawPrior.ownerKey === ownerKey)
        ? rawPrior
        : undefined;

    // Cold cache: show the stored view before throwing, so the error keeps data on screen.
    // Never after a sign-out or account/env change mid-run: setQueryData on a cleared
    // client would re-create the view and the persister would write it back.
    const seedAndThrow = async (err: unknown, staleDates: string[]): Promise<never> => {
      if (
        ctx &&
        prior === undefined &&
        Object.keys(baseDays).length > 0 &&
        (await isOwnerConfigured(owner))
      ) {
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

    const forceMark = forcedRefresh;
    const plan = planRequestRefresh({ today, nowMs, days: baseDays, force: forceMark !== null });
    const fetchedAt = new Date(nowMs).toISOString();
    const fetched: StoredRequestDay[] = [];

    // The planned dates the hours overview covers are confirmed days from it. Without a
    // ctx, or when it fails, every planned date goes to the work diary, as before 1.2.
    const authGeneration = getAuthGeneration();
    const overview = ctx
      ? await readOverviewDays(
          ctx.client,
          owner,
          plan.dates,
          forceMark !== null ? 0 : OVERVIEW_MAX_AGE_MS,
          new Date(nowMs),
        )
      : NO_OVERVIEW_DAYS;
    for (const [date, entries] of overview.days) {
      fetched.push({ date, fetchedAt, entries, settled: isDaySettled(date, entries, today) });
    }

    // A sign-out or env switch during the overview call: the remaining dates fail as
    // fetchWorkDiary's queued calls do, never logging in again with this run's credentials
    const superseded = overview.reset || getAuthGeneration() !== authGeneration;
    const diaryDates = plan.dates.filter((date) => !overview.days.has(date));

    // Fetch the remaining planned days in parallel, tolerating individual failures
    const settled = await Promise.allSettled(
      diaryDates.map((date) =>
        superseded
          ? Promise.reject(new AuthResetError())
          : fetchWorkDiary(assignmentId, date, credentials, useQA),
      ),
    );

    // A fulfilled array (even []) is a confirmed day. A rejection, or a non-array
    // (an empty body parses to undefined), is a failed day and keeps its old record.
    const failedDates: string[] = [];
    const reasons: unknown[] = [];
    settled.forEach((result, i) => {
      const date = diaryDates[i];
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
      failForcedRefresh(forceMark);
      log.warn('requests.refresh_failed', {
        plannedDays: plan.dates.length,
        failedDays: failedDates.length,
        kind: toRequestsError(err),
      });
      return seedAndThrow(err, plan.dates);
    }

    settleForcedRefresh(forceMark);

    // An unreadable store is never written this run; the view still uses what was fetched
    const stored =
      read.status === 'unreadable' ? null : await updateRequestsStore(owner, fetched, today);
    const days =
      stored?.days ?? { ...baseDays, ...Object.fromEntries(fetched.map((d) => [d.date, d])) };

    return {
      entries: composeRequestsView(days, today, prior),
      error: null,
      // plan.dates is newest first, so diaryDates and failedDates already are
      staleDates: failedDates,
      updatedAt: buildRequestsView(days, today).updatedAt,
      ownerKey,
    };
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * React Query hook returning the user's own manual time request entries
 * (pending/approved/rejected) from the my_requests_v1 store view. A failed refresh
 * keeps the previous view on screen and reports its error ('auth' | 'network');
 * outages are retried through shouldRetryQuery. Works for contributors and managers alike.
 *
 * `refetch` is a plain closure, not a useCallback: the hook is also called outside a render
 * in tests, and no consumer relies on its identity.
 */
export function useMyRequests(): UseMyRequestsResult {
  const isRestoring = useIsRestoring();
  const { config, isLoading: configLoading } = useConfig();
  const assignmentId = config?.assignmentId ?? null;

  const query = useQuery({
    queryKey: ['myRequests', assignmentId],
    queryFn: buildMyRequestsQueryFn(),
    staleTime: 60_000,
    enabled: !!assignmentId,
    retry: shouldRetryQuery,
  });
  const { data } = query;

  return {
    ...selectMyRequests(data, config, query.error),
    // While restoring, or while config loads, the query is disabled and idle, so its own
    // isLoading is false; hold the skeleton until there is a view to show
    isLoading: query.isLoading || isRestoring || (configLoading && data === undefined),
    refetch: () => {
      markMyRequestsForcedRefresh();
      return query.refetch();
    },
  };
}
