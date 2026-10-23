// durable-data 05-requests-backfill: the My Requests backfill
// After spec 02, my_requests_v1 only gains days fetched from now on, and the foreground
// refresh never plans a missing day older than the 3-week window. This module fills those
// days back to retentionStart through the same store, so spec 04's Older section shows them.
//
// FR2: runRequestsBackfill, the week-by-week runner. Each loop plans the newest week with
// missing dates (planBackfillWeek), checks the owner, fetches only those dates through the
// shared work-diary limiter, merges the days that came back (updateRequestsStore), then
// pauses. Resumable from the data alone: a failed day is never written, so a later session
// retries it. It stops on a fully failed week, a non-retryable AuthError, a 429, a sign-out
// or owner change, an unreadable store or the session cap, and logs one
// requests.backfill_done event per run.
//
// FR3: startRequestsBackfillOnce, the session gate. At most one run per JS session per
// owner (assignmentId|env), never for a signed-out user, the dev-mock manager preview or a
// missing keychain entry, and it never rejects. After each stored week it rebuilds the
// ['myRequests', assignmentId] view in place (composeRequestsView), but only a successful
// same-owner or legacy view, keeping its error state and dataUpdatedAt (C8).
//
// Strategy (shaped like useHistoryBackfill's runBackfill):
//   - Weeks run sequentially, newest first; a week's dates are fetched together
//   - Only days that came back as a slot array are merged (a resolved [] is an empty day)
//   - BACKFILL_WEEK_PAUSE_MS between weeks keeps the one-time traffic gentle

import type { QueryClient } from '@tanstack/react-query';
import { loadConfig, loadCredentials } from '../store/config';
import { fetchWorkDiary } from '../api/workDiary';
import { ApiError, AuthError, isRetryableError } from '../api/errors';
import { groupSlotsIntoEntries } from '../lib/requestsUtils';
import {
  BACKFILL_MAX_WEEKS_PER_SESSION,
  isDaySettled,
  planBackfillWeek,
  todayLocal,
} from '../lib/requestsPlanner';
import {
  composeRequestsView,
  isOwnerConfigured,
  readRequestsStore,
  updateRequestsStore,
  type MyRequestsStore,
  type RequestsStoreOwner,
  type StoredRequestDay,
} from '../lib/requestsStore';
import { log } from '../lib/log';
import { toOwnerKey } from './useMyRequests';
import type { Credentials } from '../types/config';
import type { MyRequestsData } from '../types/requests';

// ─── Constants ────────────────────────────────────────────────────────────────

/** The gate starts this long after the Requests screen mounts, so the foreground refresh goes first. */
export const BACKFILL_START_DELAY_MS = 5_000;
/** Pause between weeks (gentler than useHistoryBackfill's 300 ms). */
export const BACKFILL_WEEK_PAUSE_MS = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackfillStopReason =
  | 'complete'    // planBackfillWeek returned null: nothing left to try this session (C5)
  | 'week-failed' // no planned day of a week came back as an array
  | 'auth'        // a rejection was an AuthError with isRetryableError(err) === false
  | 'throttled'   // a rejection was an ApiError with statusCode 429 (C6)
  | 'signed-out'  // the owner is no longer configured (pre-week check, or updateRequestsStore → null)
  | 'unreadable'  // readRequestsStore returned 'unreadable' at start (C7)
  | 'cap';        // BACKFILL_MAX_WEEKS_PER_SESSION weeks attempted (defensive, C4)

export interface BackfillResult {
  /** Weeks with ≥ 1 fulfilled day merged. */
  weeksStored: number;
  /** Fulfilled days merged. */
  daysStored: number;
  /** Planned days that rejected or resolved without an array. */
  daysFailed: number;
  stopReason: BackfillStopReason;
}

export interface BackfillDeps {
  /** Local YYYY-MM-DD, fixed for the run. */
  today: string;
  /** For fetchedAt. */
  nowMs: () => number;
  /** Default: setTimeout-based. */
  sleep: (ms: number) => Promise<void>;
  /** The gate passes the view update (FR3). */
  onWeekStored?: (store: MyRequestsStore) => void;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

/** The stop reason a week's rejections call for: a real auth failure first, then a 429. */
function stopReasonFor(reasons: unknown[]): 'auth' | 'throttled' | null {
  if (reasons.some((r) => r instanceof AuthError && !isRetryableError(r))) return 'auth';
  if (reasons.some((r) => r instanceof ApiError && r.statusCode === 429)) return 'throttled';
  return null;
}

/**
 * Backfills my_requests_v1 for `owner`, one week at a time, newest first, down to
 * retentionStart. Each week's fulfilled days are merged before any stop check, so a week
 * that ends the run still keeps what came back. Never writes a failed day. Never rejects
 * from a throwing `onWeekStored`; logs requests.backfill_done once and resolves its result.
 */
export async function runRequestsBackfill(
  owner: RequestsStoreOwner,
  credentials: Credentials,
  deps: BackfillDeps,
): Promise<BackfillResult> {
  let weeksStored = 0;
  let daysStored = 0;
  let daysFailed = 0;

  const finish = (stopReason: BackfillStopReason): BackfillResult => {
    log.info('requests.backfill_done', { weeksStored, daysStored, daysFailed, stopReason });
    return { weeksStored, daysStored, daysFailed, stopReason };
  };

  // Never fetch what cannot be written (C7)
  const read = await readRequestsStore(owner);
  if (read.status === 'unreadable') return finish('unreadable');
  let days: Record<string, StoredRequestDay> = read.status === 'ok' ? read.store.days : {};

  // Mondays attempted this session: a partial week is not retried until the next one
  const skip = new Set<string>();
  let attempted = 0;

  for (;;) {
    const week = planBackfillWeek(days, deps.today, skip);
    if (!week) return finish('complete');
    if (attempted >= BACKFILL_MAX_WEEKS_PER_SESSION) return finish('cap');

    // Signed out or switched: no further request, and no token minted with stale credentials (C3)
    if (!(await isOwnerConfigured(owner))) return finish('signed-out');
    attempted++;

    // The next week starts only after this one has settled, merged and paused
    const results = await Promise.allSettled(
      week.dates.map((date) => fetchWorkDiary(owner.assignmentId, date, credentials, owner.useQA)),
    );

    // A fulfilled array (even []) is a confirmed day. A rejection, or a non-array
    // (an empty body parses to undefined), is a failed day and is never written (C12).
    const fetchedAt = new Date(deps.nowMs()).toISOString();
    const fetched: StoredRequestDay[] = [];
    const reasons: unknown[] = [];
    results.forEach((result, i) => {
      const date = week.dates[i];
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        const entries = groupSlotsIntoEntries(result.value, date);
        fetched.push({ date, fetchedAt, entries, settled: isDaySettled(date, entries, deps.today) });
      } else if (result.status === 'rejected') {
        reasons.push(result.reason);
      }
    });
    daysFailed += week.dates.length - fetched.length;

    if (fetched.length > 0) {
      const stored = await updateRequestsStore(owner, fetched, deps.today);
      if (!stored) return finish('signed-out');
      days = stored.days;
      weeksStored++;
      daysStored += fetched.length;
      try {
        deps.onWeekStored?.(stored);
      } catch {
        // View only (C13): the week is stored, and the next refresh composes the view from it
      }
    }

    const stop = stopReasonFor(reasons);
    if (stop) return finish(stop);
    // Nothing was written for this week: stop rather than hammer a dead network
    if (fetched.length === 0) return finish('week-failed');

    skip.add(week.monday);
    await deps.sleep(BACKFILL_WEEK_PAUSE_MS);
  }
}

// ─── Session gate ─────────────────────────────────────────────────────────────

/** ownerKeys (toOwnerKey) whose backfill has started in this JS session. */
const backfillStartedFor = new Set<string>();

/** Test-only: forgets which owners have run, so the same owner can run again. */
export function __resetBackfillSessionForTests(): void {
  backfillStartedFor.clear();
}

/** Looks up setTimeout at call time, so fake timers drive it in tests. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the backfill at most once per JS session per owner, and resolves `null` when it
 * does not run: signed out, the dev-mock manager preview, no keychain entry, or this owner
 * already started. Those guards never mark the owner (C9), so a later call can still run.
 * After each stored week, the visible view grows in place. Never rejects (C13).
 */
export async function startRequestsBackfillOnce(
  queryClient: QueryClient,
  deps?: Partial<Omit<BackfillDeps, 'onWeekStored'>>,
): Promise<BackfillResult | null> {
  try {
    const config = await loadConfig();
    if (!config?.assignmentId || config.devManagerView === true) return null;
    const credentials = await loadCredentials();
    if (!credentials) return null;

    const owner: RequestsStoreOwner = { assignmentId: config.assignmentId, useQA: config.useQA === true };
    const ownerKey = toOwnerKey(owner.assignmentId, owner.useQA);
    // No await between the check and the mark: two quick calls start one run (C9)
    if (backfillStartedFor.has(ownerKey)) return null;
    backfillStartedFor.add(ownerKey);

    const today = deps?.today ?? todayLocal();
    const queryKey = ['myRequests', owner.assignmentId];

    // setQueryData dispatches a success: over an errored view it would clear the error,
    // and without updatedAt it would make the view look fresh. So only a successful
    // same-owner (or legacy) view is updated, keeping its dataUpdatedAt (C8).
    const onWeekStored = (store: MyRequestsStore): void => {
      const state = queryClient.getQueryState<MyRequestsData>(queryKey);
      const prev = state?.data;
      if (state?.status !== 'success' || !prev) return;
      if (prev.ownerKey !== undefined && prev.ownerKey !== ownerKey) return;
      queryClient.setQueryData<MyRequestsData>(
        queryKey,
        { ...prev, ownerKey, entries: composeRequestsView(store.days, today, prev) },
        { updatedAt: state.dataUpdatedAt },
      );
    };

    return await runRequestsBackfill(owner, credentials, {
      today,
      nowMs: deps?.nowMs ?? (() => Date.now()),
      sleep: deps?.sleep ?? defaultSleep,
      onWeekStored,
    });
  } catch (err) {
    // Fired from a timer with void: a rejection here would go unhandled
    log.error('requests.backfill_failed', err instanceof Error ? err : 'UnknownError');
    return null;
  }
}
