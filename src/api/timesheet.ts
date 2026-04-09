// FR2: fetchTimesheet — Crossover timesheet API with 3-strategy fallback
//
// Strategy 1: full params (date, managerId, period, teamId, userId)
// Strategy 2: no teamId (date, managerId, period, userId)
// Strategy 3: minimal (date, period, userId)
//
// Returns the first non-empty array response.

import { apiGet } from './client';
import { AuthError } from './errors';
import { getWeekStartDate } from '../lib/hours';
import type { TimesheetResponse } from '../lib/hours';
import type { CrossoverConfig } from '../types/config';

function rethrowIfAuth(err: unknown): void {
  if (err instanceof AuthError) throw err;
}

export async function fetchTimesheet(
  config: CrossoverConfig,
  token: string
): Promise<TimesheetResponse | null> {
  // Use UTC-safe Monday date for the payments-API-compatible week boundary
  const date = getWeekStartDate(true);

  const baseParams = {
    date,
    period: 'WEEK',
    userId: config.userId,
  };

  // Strategy 1: full params
  try {
    const strategy1 = await apiGet<TimesheetResponse[]>(
      '/api/timetracking/timesheets',
      { ...baseParams, managerId: config.managerId, teamId: config.primaryTeamId },
      token,
      config.useQA
    );
    if (Array.isArray(strategy1) && strategy1.length > 0) return strategy1[0];
  } catch (e) { rethrowIfAuth(e); /* fall through to next strategy */ }

  // Strategy 2: without teamId
  try {
    const strategy2 = await apiGet<TimesheetResponse[]>(
      '/api/timetracking/timesheets',
      { ...baseParams, managerId: config.managerId },
      token,
      config.useQA
    );
    if (Array.isArray(strategy2) && strategy2.length > 0) return strategy2[0];
  } catch (e) { rethrowIfAuth(e); /* fall through to next strategy */ }

  // Strategy 3: minimal — date + period + userId only
  try {
    const strategy3 = await apiGet<TimesheetResponse[]>(
      '/api/timetracking/timesheets',
      baseParams,
      token,
      config.useQA
    );
    if (Array.isArray(strategy3) && strategy3.length > 0) return strategy3[0];
  } catch (e) { rethrowIfAuth(e); /* all strategies exhausted */ }

  return null;
}
