// FR2: Approval API functions — wrapping confirmed Crossover endpoints
// All endpoints documented in WS/memory/MEMORY.md

import { apiGet, apiPut } from './client'
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
  weekStartDate: string
): Promise<RawManualResponse[]> {
  return apiGet<RawManualResponse[]>(
    '/api/timetracking/workdiaries/manual/pending',
    { weekStartDate },
    token,
    useQA
  )
}

/**
 * GET /api/overtime/request?status=PENDING&weekStartDate=
 * Manager-only.
 */
export async function fetchPendingOvertime(
  token: string,
  useQA: boolean,
  weekStartDate: string
): Promise<RawOvertimeResponse[]> {
  return apiGet<RawOvertimeResponse[]>(
    '/api/overtime/request',
    { status: 'PENDING', weekStartDate },
    token,
    useQA
  )
}

// ---------------------------------------------------------------------------
// Approve/Reject functions (PUT)
// Body formats confirmed in WS/tools/test-approval-confirmed.js
// ---------------------------------------------------------------------------

/**
 * PUT /api/timetracking/workdiaries/manual/approved
 * Body: { approverId, timecardIds, allowOvertime: false }
 * approverId = config.userId (candidate avatar ID — NOT login userId)
 */
export async function approveManual(
  token: string,
  useQA: boolean,
  approverId: string,
  timecardIds: number[]
): Promise<void> {
  await apiPut<unknown>(
    '/api/timetracking/workdiaries/manual/approved',
    { approverId, timecardIds, allowOvertime: false },
    token,
    useQA
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
  reason: string
): Promise<void> {
  await apiPut<unknown>(
    '/api/timetracking/workdiaries/manual/rejected',
    { approverId, timecardIds, rejectionReason: reason },
    token,
    useQA
  )
}

/**
 * PUT /api/overtime/request/approval/:overtimeId
 * Body: {} (empty)
 */
export async function approveOvertime(
  token: string,
  useQA: boolean,
  overtimeId: number
): Promise<void> {
  await apiPut<unknown>(
    `/api/overtime/request/approval/${overtimeId}`,
    {},
    token,
    useQA
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
  memo: string
): Promise<void> {
  await apiPut<unknown>(
    `/api/overtime/request/rejection/${overtimeId}`,
    { memo },
    token,
    useQA
  )
}
