// FR2: fetchTimesheet — Crossover timesheet API with 3-strategy fallback
//
// Strategy 1: full params (date, managerId, period, teamId, userId)
// Strategy 2: no teamId (date, managerId, period, userId)
// Strategy 3: minimal (date, period, userId)
//
// Returns the first non-empty array response.
// durable-data 03-keep-last-good FR1: when every strategy threw, the last error is
// rethrown, so a failed refresh errors the query instead of reading as 0 h. `null`
// means at least one strategy got a response and none had a row.

import { apiGet } from './client';
import type { AuthCreds } from './authCreds';
import { AuthError } from './errors';
import { getWeekStartDate } from '../lib/hours';
import type { TimesheetResponse } from '../lib/hours';
import type { CrossoverConfig } from '../types/config';

function rethrowIfAuth(err: unknown): void {
  if (err instanceof AuthError) throw err;
}

/**
 * Fetches the current week's timesheet, trying 3 endpoint parameter shapes in order and
 * returning the first non-empty response. Returns null only when at least one strategy
 * got a response (`[]`, an empty body, or any other non-row value) and none had a row:
 * a genuinely empty week. Rejects with the last error when all 3 strategies threw.
 * Rethrows AuthError immediately so the caller can re-onboard. `creds` (forwarded to
 * every strategy) lets the client renew an expired token and retry once.
 */
export async function fetchTimesheet(
  config: CrossoverConfig,
  token: string,
  creds?: AuthCreds
): Promise<TimesheetResponse | null> {
  // Use UTC-safe Monday date for the payments-API-compatible week boundary
  const date = getWeekStartDate(true);

  const baseParams = {
    date,
    period: 'WEEK',
    userId: config.userId,
  };

  const strategies: Record<string, string>[] = [
    // Strategy 1: full params
    { ...baseParams, managerId: config.managerId, teamId: config.primaryTeamId },
    // Strategy 2: without teamId
    { ...baseParams, managerId: config.managerId },
    // Strategy 3: minimal — date + period + userId only
    baseParams,
  ];

  let lastError: unknown;
  let anyResponded = false;

  for (const params of strategies) {
    try {
      const rows = await apiGet<TimesheetResponse[]>(
        '/api/timetracking/timesheets',
        params,
        token,
        config.useQA,
        creds
      );
      if (Array.isArray(rows) && rows.length > 0) return rows[0];
      anyResponded = true; // answered with no row — fall through to the next strategy
    } catch (e) {
      rethrowIfAuth(e);
      lastError = e; // fall through to the next strategy
    }
  }

  // Every strategy threw: a failed request, not an empty week.
  if (!anyResponded) throw lastError;
  return null;
}
