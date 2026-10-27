// Tests: approvals.ts — FR1 (07-approvals-safety): parseOvertimeItems null guards
//
// FR1: parseOvertimeItems(raw) — optional chaining + null filter
//   SC1: well-formed entry returns a valid OvertimeApprovalItem (no regression)
//   SC2: entry where assignment.selection is null → filtered out, no crash
//   SC3: entry where candidate is undefined → filtered out, no crash
//   SC4: mix of valid and invalid entries → only valid items returned
//   SC5: empty input array → empty array returned
//   SC6: all entries malformed → empty array, no crash
//   SC7: missing assignment.salary → cost = 0 (not NaN)
//   SC8: console.warn emitted for each skipped entry
//   SC9: returned value is OvertimeApprovalItem[] (no nulls in array)
//
// Live shape (QA, 2026-10-27): overtimeRequest carries weekStartDate / memo / overtimePeriod
// (minutes) / overtimeCost / createdOn, and no durationMinutes / description / startDateTime
//   LS1: live entry → hours '2.0', weekStartDate '2026-10-19', cost 3000, memo, week-start anchor
//   LS2: older shape unchanged (week derived from startDateTime, salary cost)
//   LS3: mixed lists; older fields win when both are present
//   LS4: no duration (absent, 0, negative, NaN, a string) → skipped with a warning
//   LS5: no valid week (and no startDateTime to derive one from) → skipped with a warning
//   LS6: cost falls back to hours * salary when overtimeCost is not a finite number
//
// Strategy:
// - Pure function, no React needed
// - Use `as unknown as RawOvertimeResponse` to inject null/undefined at any depth
// - Spy on console.warn to verify warnings without polluting test output

import { getWeekStartDate, parseOvertimeItems, RawOvertimeResponse } from '../approvals'
import { LIVE_OVERTIME_RAW, liveOvertime } from '../../__fixtures__/overtimeRequests'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const wellFormed: RawOvertimeResponse = {
  overtimeRequest: {
    id: 1,
    status: 'PENDING',
    durationMinutes: 60,
    description: 'Extra work on feature',
    startDateTime: '2026-04-07T10:00:00Z',
  },
  assignment: {
    id: 100,
    salary: 50,
    selection: {
      marketplaceMember: {
        application: {
          candidate: {
            id: 999,
            printableName: 'Jane Doe',
            jobTitle: 'Software Engineer',
          },
        },
      },
    },
  },
}

const missingSelection = {
  overtimeRequest: {
    id: 2,
    status: 'PENDING',
    durationMinutes: 30,
    description: 'Test entry',
    startDateTime: '2026-04-07T10:00:00Z',
  },
  assignment: { id: 101, salary: 50, selection: null },
} as unknown as RawOvertimeResponse

const missingMarketplaceMember = {
  overtimeRequest: {
    id: 3,
    status: 'PENDING',
    durationMinutes: 30,
    description: 'Test entry',
    startDateTime: '2026-04-07T10:00:00Z',
  },
  assignment: {
    id: 102,
    salary: 50,
    selection: { marketplaceMember: null },
  },
} as unknown as RawOvertimeResponse

const missingCandidate = {
  overtimeRequest: {
    id: 4,
    status: 'PENDING',
    durationMinutes: 90,
    description: 'Test entry',
    startDateTime: '2026-04-07T10:00:00Z',
  },
  assignment: {
    id: 103,
    salary: 50,
    selection: {
      marketplaceMember: { application: { candidate: undefined } },
    },
  },
} as unknown as RawOvertimeResponse

const missingSalary: RawOvertimeResponse = {
  overtimeRequest: {
    id: 5,
    status: 'PENDING',
    durationMinutes: 60,
    description: 'No salary entry',
    startDateTime: '2026-04-07T10:00:00Z',
  },
  assignment: {
    id: 104,
    salary: null as unknown as number,
    selection: {
      marketplaceMember: {
        application: {
          candidate: {
            id: 888,
            printableName: 'John Smith',
            jobTitle: 'Designer',
          },
        },
      },
    },
  },
}

const missingOvertimeRequest = {
  overtimeRequest: null,
  assignment: {
    id: 105,
    salary: 50,
    selection: {
      marketplaceMember: {
        application: {
          candidate: { id: 777, printableName: 'Bob', jobTitle: 'PM' },
        },
      },
    },
  },
} as unknown as RawOvertimeResponse

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseOvertimeItems', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // SC1: Happy path — well-formed entry returns a valid OvertimeApprovalItem
  it('SC1: returns a valid OvertimeApprovalItem for a well-formed entry', () => {
    const result = parseOvertimeItems([wellFormed])

    expect(result).toHaveLength(1)
    const item = result[0]
    expect(item.category).toBe('OVERTIME')
    expect(item.overtimeId).toBe(1)
    expect(item.userId).toBe(999)
    expect(item.fullName).toBe('Jane Doe')
    expect(item.jobTitle).toBe('Software Engineer')
    expect(item.durationMinutes).toBe(60)
    expect(item.hours).toBe('1.0')
    expect(item.cost).toBe(50) // 1h * $50/h
    expect(item.description).toBe('Extra work on feature')
    expect(item.id).toBe('ot-1')
  })

  // SC2: assignment.selection is null → filtered out, no crash
  it('SC2: filters out entry where assignment.selection is null', () => {
    const result = parseOvertimeItems([missingSelection])

    expect(result).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  // SC3: candidate is undefined → filtered out, no crash
  it('SC3: filters out entry where candidate is undefined', () => {
    const result = parseOvertimeItems([missingCandidate])

    expect(result).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  // SC4: mix of valid and invalid → only valid returned
  it('SC4: returns only valid items from a mixed array', () => {
    const result = parseOvertimeItems([wellFormed, missingSelection, missingCandidate])

    expect(result).toHaveLength(1)
    expect(result[0].overtimeId).toBe(1)
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  // SC5: empty input → empty array
  it('SC5: returns empty array for empty input', () => {
    const result = parseOvertimeItems([])

    expect(result).toHaveLength(0)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  // SC6: all entries malformed → empty array, no crash
  it('SC6: returns empty array when all entries are malformed', () => {
    const result = parseOvertimeItems([missingSelection, missingMarketplaceMember, missingCandidate])

    expect(result).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(3)
  })

  // SC7: missing salary → cost = 0 (not NaN)
  it('SC7: uses 0 for cost when assignment.salary is null', () => {
    const result = parseOvertimeItems([missingSalary])

    expect(result).toHaveLength(1)
    expect(result[0].cost).toBe(0)
    expect(result[0].cost).not.toBeNaN()
  })

  // SC8: console.warn emitted for each skipped entry
  it('SC8: emits console.warn for each skipped entry', () => {
    parseOvertimeItems([missingSelection, missingCandidate])

    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy.mock.calls[0][0]).toContain('[parseOvertimeItems]')
    expect(warnSpy.mock.calls[1][0]).toContain('[parseOvertimeItems]')
  })

  // SC9: returned array contains no nulls (type narrowing)
  it('SC9: returned array contains no null values', () => {
    const result = parseOvertimeItems([wellFormed, missingSelection])

    for (const item of result) {
      expect(item).not.toBeNull()
      expect(item).not.toBeUndefined()
    }
  })

  // Additional: missingOvertimeRequest → filtered out, no crash
  it('filters out entry where overtimeRequest is null', () => {
    const result = parseOvertimeItems([missingOvertimeRequest])

    expect(result).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  // Additional: multiple well-formed entries all returned
  it('returns all items when all entries are well-formed', () => {
    const second: RawOvertimeResponse = {
      ...wellFormed,
      overtimeRequest: { ...wellFormed.overtimeRequest, id: 42 },
      assignment: { ...wellFormed.assignment, id: 200, salary: 75 },
    }

    const result = parseOvertimeItems([wellFormed, second])

    expect(result).toHaveLength(2)
    expect(result[0].overtimeId).toBe(1)
    expect(result[1].overtimeId).toBe(42)
  })
})

// ─── Live shape (QA, 2026-10-27) ──────────────────────────────────────────────

describe('parseOvertimeItems — live shape and older shape', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('LS1: maps the live entry: overtimePeriod, weekStartDate, overtimeCost, memo', () => {
    const result = parseOvertimeItems([LIVE_OVERTIME_RAW])

    expect(result).toEqual([
      {
        id: 'ot-9902122',
        category: 'OVERTIME',
        overtimeId: 9902122,
        userId: 2368317,
        fullName: 'Priya Natarajan',
        jobTitle: 'Software Engineer',
        durationMinutes: 120,
        hours: '2.0',
        cost: 3000, // overtimeCost, not 2 h * $25
        description: 'Release week: migration cutover and on-call cover',
        startDateTime: '2026-10-19T00:00:00',
        weekStartDate: '2026-10-19',
        assignmentId: 77972,
        personId: 1192813,
      },
    ])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('LS1: anchors startDateTime in its own week, not at createdOn (the week after)', () => {
    const [item] = parseOvertimeItems([LIVE_OVERTIME_RAW])

    expect(item.startDateTime.startsWith('2026-10-27')).toBe(false)
    expect(getWeekStartDate(new Date(item.startDateTime))).toBe(item.weekStartDate)
  })

  it('LS2: the older shape is unchanged: week from startDateTime, cost from salary', () => {
    const [item] = parseOvertimeItems([wellFormed])

    expect(item.durationMinutes).toBe(60)
    expect(item.description).toBe('Extra work on feature')
    expect(item.startDateTime).toBe('2026-04-07T10:00:00Z')
    expect(item.weekStartDate).toBe('2026-04-06') // Monday of Tue 2026-04-07
    expect(item.cost).toBe(50)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('LS3: parses a list mixing both shapes, in order, skipping only the bad entry', () => {
    const noDuration = liveOvertime({ id: 9902123, overtimePeriod: undefined })
    const result = parseOvertimeItems([wellFormed, noDuration, LIVE_OVERTIME_RAW])

    expect(result.map((i) => [i.id, i.hours, i.weekStartDate])).toEqual([
      ['ot-1', '1.0', '2026-04-06'],
      ['ot-9902122', '2.0', '2026-10-19'],
    ])
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('LS3: the older fields win when an entry carries both', () => {
    const both = liveOvertime({
      durationMinutes: 90,
      description: 'Older description',
      startDateTime: '2026-10-21T09:00:00',
    })
    const [item] = parseOvertimeItems([both])

    expect(item.durationMinutes).toBe(90)
    expect(item.description).toBe('Older description')
    expect(item.startDateTime).toBe('2026-10-21T09:00:00')
    expect(item.weekStartDate).toBe('2026-10-19') // the request's own week
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['zero', 0],
    ['negative', -30],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a string', '120'],
  ])('LS4: skips an entry whose duration is %s, with a warning', (_label, overtimePeriod) => {
    const raw = liveOvertime({ overtimePeriod: overtimePeriod as unknown as number })
    const result = parseOvertimeItems([raw])

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('[parseOvertimeItems]')
    expect(warnSpy.mock.calls[0][0]).toContain('duration')
  })

  it('LS4: skips an older-shape entry with no durationMinutes', () => {
    const raw = {
      ...wellFormed,
      overtimeRequest: { ...wellFormed.overtimeRequest, durationMinutes: undefined },
    }
    expect(parseOvertimeItems([raw])).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['absent', undefined],
    ['the NaN week the 1.0 parser produced', 'NaN-NaN-NaN'],
    ['not a calendar date', '2026-02-30'],
    ['not YYYY-MM-DD', '10/19/2026'],
    ['empty', ''],
  ])('LS5: skips an entry whose week is %s and has no startDateTime, with a warning', (_label, weekStartDate) => {
    const result = parseOvertimeItems([liveOvertime({ weekStartDate })])

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('[parseOvertimeItems]')
    expect(warnSpy.mock.calls[0][0]).toContain('week')
  })

  it('LS5: skips an older-shape entry whose startDateTime does not parse', () => {
    const raw = {
      ...wellFormed,
      overtimeRequest: { ...wellFormed.overtimeRequest, startDateTime: 'not a date' },
    }
    expect(parseOvertimeItems([raw])).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('LS5: derives the week from startDateTime when weekStartDate is invalid', () => {
    const raw = liveOvertime({ weekStartDate: 'NaN-NaN-NaN', startDateTime: '2026-10-22T09:00:00' })
    const [item] = parseOvertimeItems([raw])

    expect(item.weekStartDate).toBe('2026-10-19')
    expect(item.startDateTime).toBe('2026-10-22T09:00:00')
  })

  it.each([
    ['absent', undefined],
    ['NaN', NaN],
    ['a string', '3000'],
  ])('LS6: falls back to hours * salary when overtimeCost is %s', (_label, overtimeCost) => {
    const [item] = parseOvertimeItems([liveOvertime({ overtimeCost: overtimeCost as unknown as number })])
    expect(item.cost).toBe(50) // 2 h * $25
  })

  it('LS6: keeps an overtimeCost of 0', () => {
    const [item] = parseOvertimeItems([liveOvertime({ overtimeCost: 0 })])
    expect(item.cost).toBe(0)
  })

  it('uses an empty description when there is neither description nor memo', () => {
    const [item] = parseOvertimeItems([liveOvertime({ memo: undefined })])
    expect(item.description).toBe('')
  })
})
