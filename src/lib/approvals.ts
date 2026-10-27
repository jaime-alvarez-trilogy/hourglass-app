// FR1: Types and parser library for manager approvals

// ---------------------------------------------------------------------------
// Raw API response types (from Crossover endpoints)
// ---------------------------------------------------------------------------

export interface RawManualTime {
  status: string
  durationMinutes: number
  description: string
  startDateTime: string
  timecardIds: number[]
  type: 'WEB' | 'MOBILE'
}

export interface RawManualResponse {
  userId: number
  fullName: string
  manualTimes: RawManualTime[]
}

// One entry of GET /api/overtime/request?status=PENDING&weekStartDate=. Two shapes of
// overtimeRequest are accepted (parseOvertimeItems reads either):
//   live (QA, 2026-10-27, manager token): { id, weekStartDate: "YYYY-MM-DD", memo,
//     overtimePeriod (minutes), overtimeCost, status, createdOn: "YYYY-MM-DD" }, with
//     totalHoursWorked and trackerDataUnavailable beside it. No durationMinutes,
//     description or startDateTime. A contributor's own request body is
//     { weekStartDate, overtimePeriod (int minutes), memo }, which confirms the meanings.
//   older: { id, status, durationMinutes, description, startDateTime }
export interface RawOvertimeResponse {
  overtimeRequest: {
    id: number
    status: string
    // Live shape
    weekStartDate?: string   // Monday of the requested week
    overtimePeriod?: number  // minutes
    memo?: string
    overtimeCost?: number
    createdOn?: string       // not read: can fall in a later week than weekStartDate
    // Older shape
    durationMinutes?: number
    description?: string
    startDateTime?: string
  }
  totalHoursWorked?: number
  trackerDataUnavailable?: boolean
  assignment: {
    id: number
    salary: number
    selection: {
      marketplaceMember: {
        application: {
          candidate: {
            id: number
            // The person id (TeamMember.userId); Crossover's web app groups overtime by it
            userId?: number
            printableName: string
            jobTitle: string
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Unified ApprovalItem discriminated union
// ---------------------------------------------------------------------------

export interface ManualApprovalItem {
  id: string               // "mt-{timecardIds.join('-')}"
  category: 'MANUAL'
  // Not a roster id (live QA, 2026-10-27: a legacy id no other endpoint exposes). Auto-approve
  // never matches on it; the owner is proven from the work diary (src/lib/manualOwnership.ts)
  userId: number
  fullName: string
  durationMinutes: number
  hours: string            // (durationMinutes/60).toFixed(1)
  description: string
  startDateTime: string
  type: 'WEB' | 'MOBILE'
  timecardIds: number[]
  weekStartDate: string
  // Owner key (`${userId}|qa|prod`) of the account this item was fetched for, set by
  // fetchAllApprovalItems. Auto-approve only acts on items stamped for the current owner.
  fetchedFor?: string
}

export interface OvertimeApprovalItem {
  id: string               // "ot-{overtimeRequest.id}"
  category: 'OVERTIME'
  overtimeId: number
  userId: number
  fullName: string
  jobTitle: string
  durationMinutes: number  // durationMinutes ?? overtimePeriod; always finite and > 0
  hours: string
  cost: number             // overtimeCost, else (durationMinutes/60) * assignment.salary
  description: string      // description ?? memo ?? ''
  // The request's startDateTime, else `${weekStartDate}T00:00:00`: a weekly request
  // is anchored at the start of its week (see parseOvertimeItems)
  startDateTime: string
  weekStartDate: string
  // See ManualApprovalItem.fetchedFor
  fetchedFor?: string
  // Auto-approve matching (src/lib/autoApprove.ts). userId above is candidate.id (the
  // avatar id); these are assignment.id and candidate.userId. null when the row omits them.
  assignmentId?: number | null
  personId?: number | null
}

export type ApprovalItem = ManualApprovalItem | OvertimeApprovalItem

// ---------------------------------------------------------------------------
// FR1: getWeekStartDate — Monday of current week, local timezone
// Critical: NEVER use toISOString() — it shifts to UTC (documented bug)
// ---------------------------------------------------------------------------

export function getWeekStartDate(date: Date = new Date()): string {
  const day = date.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1
  const monday = new Date(date)
  monday.setDate(date.getDate() - daysFromMonday)
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---------------------------------------------------------------------------
// FR1: parseManualItems — flattens user.manualTimes[] into flat list
// ---------------------------------------------------------------------------

export function parseManualItems(
  raw: RawManualResponse[],
  weekStartDate: string = getWeekStartDate()
): ManualApprovalItem[] {
  const items: ManualApprovalItem[] = []
  for (const user of raw) {
    for (const mt of user.manualTimes) {
      items.push({
        id: `mt-${mt.timecardIds.join('-')}`,
        category: 'MANUAL',
        userId: user.userId,
        fullName: user.fullName,
        durationMinutes: mt.durationMinutes,
        hours: (mt.durationMinutes / 60).toFixed(1),
        description: mt.description,
        startDateTime: mt.startDateTime,
        type: mt.type,
        timecardIds: mt.timecardIds,
        weekStartDate,
      })
    }
  }
  return items
}

// ---------------------------------------------------------------------------
// FR1: parseOvertimeItems — maps overtime entries to OvertimeApprovalItem[]
// ---------------------------------------------------------------------------

// value when it is a real calendar date in YYYY-MM-DD form, else null
function validDay(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? value
    : null
}

// value when it is a date-time string Date can parse, else null
function validDateTime(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

/**
 * Maps pending-overtime entries, live or older shape (RawOvertimeResponse), to items.
 * durationMinutes is durationMinutes ?? overtimePeriod; weekStartDate is the request's
 * weekStartDate, else the Monday of its startDateTime; startDateTime falls back to
 * `${weekStartDate}T00:00:00`, so a weekly request sorts at the start of its own week
 * (createdOn is not used: the live sample was created the week after its week).
 * An entry with no candidate, no duration (finite and > 0) or no valid week is skipped
 * with a warning, so it is never shown, planned or approved.
 */
export function parseOvertimeItems(raw: RawOvertimeResponse[]): OvertimeApprovalItem[] {
  return raw
    .map((entry): OvertimeApprovalItem | null => {
      const { overtimeRequest, assignment } = entry

      if (!overtimeRequest) {
        console.warn('[parseOvertimeItems] Skipping entry with missing overtimeRequest')
        return null
      }

      const candidate = assignment?.selection?.marketplaceMember?.application?.candidate

      if (!candidate) {
        console.warn('[parseOvertimeItems] Skipping entry with missing candidate:', overtimeRequest?.id)
        return null
      }

      const durationMinutes = overtimeRequest.durationMinutes ?? overtimeRequest.overtimePeriod
      if (typeof durationMinutes !== 'number' || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        console.warn('[parseOvertimeItems] Skipping entry with missing duration:', overtimeRequest.id)
        return null
      }

      const start = validDateTime(overtimeRequest.startDateTime)
      const weekStartDate =
        validDay(overtimeRequest.weekStartDate) ?? (start !== null ? getWeekStartDate(new Date(start)) : null)
      if (weekStartDate === null) {
        console.warn('[parseOvertimeItems] Skipping entry with invalid week:', overtimeRequest.id)
        return null
      }

      const hours = durationMinutes / 60
      const { overtimeCost } = overtimeRequest
      const cost =
        typeof overtimeCost === 'number' && Number.isFinite(overtimeCost)
          ? overtimeCost
          : Math.round(hours * (assignment?.salary ?? 0) * 100) / 100

      return {
        id: `ot-${overtimeRequest.id}`,
        category: 'OVERTIME' as const,
        overtimeId: overtimeRequest.id,
        userId: candidate.id,
        fullName: candidate.printableName,
        jobTitle: candidate.jobTitle,
        durationMinutes,
        hours: hours.toFixed(1),
        cost,
        description: overtimeRequest.description ?? overtimeRequest.memo ?? '',
        startDateTime: start ?? `${weekStartDate}T00:00:00`,
        weekStartDate,
        assignmentId: assignment?.id ?? null,
        personId: candidate.userId ?? null,
      }
    })
    .filter((item): item is OvertimeApprovalItem => item !== null)
}
