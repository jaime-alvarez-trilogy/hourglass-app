// FR2: Approval API functions — wrapping confirmed Crossover endpoints
// All endpoints documented in WS/memory/MEMORY.md
// durable-data 01-auth-renewal FR4: each takes an optional trailing `creds` and
// forwards it to apiGet/apiPut, so an expired token is renewed and retried once.

import { apiGet, apiPut } from './client'
import type { AuthCreds } from './authCreds'
import type { RawManualResponse, RawOvertimeResponse } from '../lib/approvals'

// ---------------------------------------------------------------------------
// Fetch functions (GET)
// ---------------------------------------------------------------------------

/**
 * GET /api/timetracking/workdiaries/manual/pending?weekStartDate=
 * Manager-only — 403 for contributors.
 */
export async function fetchPendingManual(
  token: string,
  useQA: boolean,
  weekStartDate: string,
  creds?: AuthCreds
): Promise<RawManualResponse[]> {
  return (await apiGet<RawManualResponse[]>(
    '/api/timetracking/workdiaries/manual/pending',
    { weekStartDate },
    token,
    useQA,
    creds
  )) ?? []
}

/**
 * GET /api/overtime/request?status=PENDING&weekStartDate=
 * Manager-only.
 */
export async function fetchPendingOvertime(
  token: string,
  useQA: boolean,
  weekStartDate: string,
  creds?: AuthCreds
): Promise<RawOvertimeResponse[]> {
  return (await apiGet<RawOvertimeResponse[]>(
    '/api/overtime/request',
    { status: 'PENDING', weekStartDate },
    token,
    useQA,
    creds
  )) ?? []
}

// ---------------------------------------------------------------------------
// Approve/Reject functions (PUT)
// Body formats confirmed in WS/tools/test-approval-confirmed.js
// ---------------------------------------------------------------------------

/**
 * PUT /api/timetracking/workdiaries/manual/approved
 * Body: { approverId, timecardIds, allowOvertime }
 * approverId = config.userId (candidate avatar ID — NOT login userId)
 * allowOvertime = false: an approval that would push the report past their weekly
 * limit fails with CROS-9300 / CROS-9301 instead of granting overtime. It sits before
 * `creds`, which stays last like every other wrapper's.
 */
export async function approveManual(
  token: string,
  useQA: boolean,
  approverId: string,
  timecardIds: number[],
  allowOvertime: boolean = false,
  creds?: AuthCreds
): Promise<void> {
  await apiPut<unknown>(
    '/api/timetracking/workdiaries/manual/approved',
    { approverId, timecardIds, allowOvertime },
    token,
    useQA,
    creds
  )
}

/**
 * PUT /api/timetracking/workdiaries/manual/rejected
 * Body: { approverId, timecardIds, rejectionReason }
 */
export async function rejectManual(
  token: string,
  useQA: boolean,
  approverId: string,
  timecardIds: number[],
  reason: string,
  creds?: AuthCreds
): Promise<void> {
  await apiPut<unknown>(
    '/api/timetracking/workdiaries/manual/rejected',
    { approverId, timecardIds, rejectionReason: reason },
    token,
    useQA,
    creds
  )
}

/**
 * PUT /api/overtime/request/approval/:overtimeId
 * Body: {} (empty)
 */
export async function approveOvertime(
  token: string,
  useQA: boolean,
  overtimeId: number,
  creds?: AuthCreds
): Promise<void> {
  await apiPut<unknown>(
    `/api/overtime/request/approval/${overtimeId}`,
    {},
    token,
    useQA,
    creds
  )
}

/**
 * PUT /api/overtime/request/rejection/:overtimeId
 * Body: { memo }
 */
export async function rejectOvertime(
  token: string,
  useQA: boolean,
  overtimeId: number,
  memo: string,
  creds?: AuthCreds
): Promise<void> {
  await apiPut<unknown>(
    `/api/overtime/request/rejection/${overtimeId}`,
    { memo },
    token,
    useQA,
    creds
  )
}
