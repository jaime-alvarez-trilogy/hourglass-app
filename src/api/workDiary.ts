// FR6 (04-ai-brainlift): Work diary API call
// Uses assignmentId (NOT userId) — critical distinction per MEMORY.md
// durable-data 02-requests-store FR1: one app-wide limiter of WORK_DIARY_CONCURRENCY,
// and concurrent identical calls share one in-flight promise.

import { getAuthToken, apiGet, getAuthGeneration } from './client';
import { toAuthCreds } from './authCreds';
import { createLimiter } from '../lib/limit';
import type { Credentials } from '../types/config';
import type { WorkDiarySlot } from '../types/api';

/** At most this many work-diary requests are in flight, app-wide. */
export const WORK_DIARY_CONCURRENCY = 4;

const workDiaryLimiter = createLimiter(WORK_DIARY_CONCURRENCY);

// Pending requests by `generation|env|assignmentId|date`. An entry is removed as soon
// as its promise settles, so nothing is memoised: freshness stays the callers' decision.
// The auth generation in the key stops a call made after `invalidateAuthToken()`
// (sign-out, env switch, not-contributor) from joining a request started before it.
const workDiaryInFlight = new Map<string, Promise<WorkDiarySlot[]>>();

/**
 * Fetches work diary slots for a single day.
 *
 * Runs inside the app-wide work-diary limiter. A call whose generation, environment,
 * assignment and date match a pending request returns that same promise, with no new
 * request, limiter slot or token call. The resolved array is therefore shared between
 * joined callers and must be treated as read-only.
 *
 * @param assignmentId  assignment.id from config (e.g. "79996") — NOT userId
 * @param date          YYYY-MM-DD format (local timezone, no conversion)
 * @param credentials   username + password for Basic auth token fetch (and renewal)
 * @param useQA         toggles between QA and production base URL
 */
export function fetchWorkDiary(
  assignmentId: string,
  date: string,
  credentials: Credentials,
  useQA: boolean,
): Promise<WorkDiarySlot[]> {
  const key = `${getAuthGeneration()}|${useQA ? 'qa' : 'prod'}|${assignmentId}|${date}`;
  const pending = workDiaryInFlight.get(key);
  if (pending) return pending;

  const p = workDiaryLimiter(async () => {
    const token = await getAuthToken(credentials.username, credentials.password, useQA);
    return apiGet<WorkDiarySlot[]>(
      '/api/timetracking/workdiaries',
      { assignmentId, date },
      token,
      useQA,
      toAuthCreds(credentials, useQA),
    );
  });
  workDiaryInFlight.set(key, p);
  // Only delete our own entry: a newer same-key request may have replaced it.
  // Two handlers (not `.finally`), so a rejection never becomes unhandled here.
  const clear = () => {
    if (workDiaryInFlight.get(key) === p) workDiaryInFlight.delete(key);
  };
  p.then(clear, clear);
  return p;
}

/** Test hook: forget every pending request, so a deferred left open cannot be joined later. */
export function __resetWorkDiaryInFlightForTests(): void {
  workDiaryInFlight.clear();
}
