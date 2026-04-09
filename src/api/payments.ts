// FR2: fetchPayments — Crossover payments API
//
// GET /api/v3/users/current/payments?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// CRITICAL: Uses Mon–Sun UTC weeks.
// Dates MUST be formatted with Date.UTC() arithmetic — never toISOString() on local dates.

import { apiGet } from './client';
import { AuthError } from './errors';
import type { PaymentsResponse } from '../lib/hours';
import type { CrossoverConfig } from '../types/config';

function getUTCWeekBoundaries(): { from: string; to: string } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Days since Monday (Mon=0, Tue=1, ..., Sun=6)
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const daysSinceSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  const mondayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToMonday
  );
  const sundayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysSinceSunday
  );

  // Safe to use toISOString here — both dates are UTC-aligned
  const from = new Date(mondayUTC).toISOString().slice(0, 10);
  const to = new Date(sundayUTC).toISOString().slice(0, 10);

  return { from, to };
}

export async function fetchPayments(
  config: CrossoverConfig,
  token: string
): Promise<PaymentsResponse | null> {
  const { from, to } = getUTCWeekBoundaries();

  try {
    const result = await apiGet<PaymentsResponse[]>(
      '/api/v3/users/current/payments',
      { from, to },
      token,
      config.useQA
    );
    if (Array.isArray(result) && result.length > 0) return result[0];
  } catch (e) {
    if (e instanceof AuthError) throw e;
    /* non-fatal — dashboard shows without payment data */
  }

  return null;
}
