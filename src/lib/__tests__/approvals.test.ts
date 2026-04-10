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
// Strategy:
// - Pure function, no React needed
// - Use `as unknown as RawOvertimeResponse` to inject null/undefined at any depth
// - Spy on console.warn to verify warnings without polluting test output

import { parseOvertimeItems, RawOvertimeResponse, OvertimeApprovalItem } from '../approvals'

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
