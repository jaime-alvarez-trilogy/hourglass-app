// 1.2 WorkSmart dashboard parity: the hours-overview and pay-days endpoints.
//
// GET /api/v3/assignments/{assignmentId}/hours-overview?date=YYYY-MM-DD
//   assignmentId (NOT userId). `date` is any day of the target Mon–Sun UTC week.
// GET /api/v3/users/current/pay-days
//   No params. Contributor-facing.
//
// Like the other fetchers (durable-data 03-keep-last-good FR1), every failure throws —
// including a body that does not parse into the expected shape — so a failed refresh
// keeps the last good data instead of reading as 0 h.

import { apiGet } from './client';
import { ApiError } from './errors';
import type { AuthCreds } from './authCreds';
import {
  normalizeHoursOverview,
  normalizePayDays,
  type HoursOverview,
  type PayDays,
} from '../lib/hoursOverview';

/** errorCode of the ApiError thrown when a 200 body is not the expected shape. */
export const UNEXPECTED_SHAPE = 'UNEXPECTED_SHAPE';

/**
 * Fetches the hours overview of the week containing `date` (YYYY-MM-DD, UTC).
 * Rejects with ApiError(UNEXPECTED_SHAPE) when the body has no usable week.
 */
export async function fetchHoursOverview(
  assignmentId: string,
  date: string,
  token: string,
  useQA: boolean,
  creds?: AuthCreds,
): Promise<HoursOverview> {
  const raw = await apiGet<unknown>(
    `/api/v3/assignments/${encodeURIComponent(assignmentId)}/hours-overview`,
    { date },
    token,
    useQA,
    creds,
  );
  const parsed = normalizeHoursOverview(raw);
  if (!parsed) {
    throw new ApiError(200, 'Unexpected hours-overview response', {
      errorCode: UNEXPECTED_SHAPE,
    });
  }
  return parsed;
}

/**
 * Fetches the contributor's pay-day cards (last paid, next, this week's).
 * Rejects with ApiError(UNEXPECTED_SHAPE) when the body has no `cards` array.
 */
export async function fetchPayDays(
  token: string,
  useQA: boolean,
  creds?: AuthCreds,
): Promise<PayDays> {
  const raw = await apiGet<unknown>('/api/v3/users/current/pay-days', {}, token, useQA, creds);
  const parsed = normalizePayDays(raw);
  if (!parsed) {
    throw new ApiError(200, 'Unexpected pay-days response', { errorCode: UNEXPECTED_SHAPE });
  }
  return parsed;
}
