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

export interface RawOvertimeResponse {
  overtimeRequest: {
    id: number
    status: string
    durationMinutes: number
    description: string
    startDateTime: string
  }
  assignment: {
    id: number
    salary: number
    selection: {
      marketplaceMember: {
        application: {
          candidate: {
            id: number
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
  userId: number
  fullName: string
  durationMinutes: number
  hours: string            // (durationMinutes/60).toFixed(1)
  description: string
  startDateTime: string
  type: 'WEB' | 'MOBILE'
  timecardIds: number[]
  weekStartDate: string
}

export interface OvertimeApprovalItem {
  id: string               // "ot-{overtimeRequest.id}"
  category: 'OVERTIME'
  overtimeId: number
  userId: number
  fullName: string
  jobTitle: string
  durationMinutes: number
  hours: string
  cost: number             // (durationMinutes/60) * assignment.salary
  description: string
  startDateTime: string
  weekStartDate: string
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

export function parseOvertimeItems(raw: RawOvertimeResponse[]): OvertimeApprovalItem[] {
  return raw.map((entry) => {
    const { overtimeRequest, assignment } = entry
    const candidate = assignment.selection.marketplaceMember.application.candidate
    const hours = overtimeRequest.durationMinutes / 60
    const cost = Math.round(hours * assignment.salary * 100) / 100
    const weekStartDate = getWeekStartDate(new Date(overtimeRequest.startDateTime))
    return {
      id: `ot-${overtimeRequest.id}`,
      category: 'OVERTIME',
      overtimeId: overtimeRequest.id,
      userId: candidate.id,
      fullName: candidate.printableName,
      jobTitle: candidate.jobTitle,
      durationMinutes: overtimeRequest.durationMinutes,
      hours: hours.toFixed(1),
      cost,
      description: overtimeRequest.description,
      startDateTime: overtimeRequest.startDateTime,
      weekStartDate,
    }
  })
}
