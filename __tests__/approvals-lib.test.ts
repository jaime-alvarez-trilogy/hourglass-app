// FR1: Types and Parser Library
import {
  parseManualItems,
  parseOvertimeItems,
  getWeekStartDate,
} from '../src/lib/approvals';
import type { ManualApprovalItem, OvertimeApprovalItem, ApprovalItem } from '../src/lib/approvals';

// --- Sample raw data fixtures ---

const rawManualUser = {
  userId: 100,
  fullName: 'Alice Smith',
  manualTimes: [
    {
      status: 'PENDING',
      durationMinutes: 90,
      description: 'Fix critical bug',
      startDateTime: '2026-03-10T09:00:00Z',
      timecardIds: [1, 2, 3],
      type: 'WEB' as const,
    },
  ],
};

const rawOvertimeEntry = {
  overtimeRequest: {
    id: 42,
    status: 'PENDING',
    durationMinutes: 120,
    description: 'Emergency deployment',
    startDateTime: '2026-03-10T18:00:00Z',
  },
  assignment: {
    id: 79996,
    salary: 50,
    selection: {
      marketplaceMember: {
        application: {
          candidate: {
            id: 2362707,
            printableName: 'Bob Jones',
            jobTitle: 'Senior Engineer',
          },
        },
      },
    },
  },
};

// =============================================================================
// FR1: parseManualItems
// =============================================================================

describe('FR1: parseManualItems', () => {
  it('FR1_flattens_manualTimes_into_flat_list', () => {
    const result = parseManualItems([rawManualUser]);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('MANUAL');
    expect(result[0].fullName).toBe('Alice Smith');
    expect(result[0].userId).toBe(100);
  });

  it('FR1_generates_correct_id_mt_timecardIds_joined', () => {
    const result = parseManualItems([rawManualUser]);
    expect(result[0].id).toBe('mt-1-2-3');
  });

  it('FR1_calculates_hours_durationMinutes_divided_by_60', () => {
    const result = parseManualItems([rawManualUser]);
    // 90 / 60 = 1.5
    expect(result[0].hours).toBe('1.5');
  });

  it('FR1_user_with_multiple_manualTimes_produces_N_items', () => {
    const userWithTwo = {
      userId: 101,
      fullName: 'Carol Brown',
      manualTimes: [
        {
          status: 'PENDING',
          durationMinutes: 30,
          description: 'Task A',
          startDateTime: '2026-03-10T10:00:00Z',
          timecardIds: [10],
          type: 'MOBILE' as const,
        },
        {
          status: 'PENDING',
          durationMinutes: 60,
          description: 'Task B',
          startDateTime: '2026-03-10T11:00:00Z',
          timecardIds: [20, 21],
          type: 'WEB' as const,
        },
      ],
    };
    const result = parseManualItems([userWithTwo]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('mt-10');
    expect(result[1].id).toBe('mt-20-21');
  });

  it('FR1_multiple_users_each_flattened', () => {
    const user2 = {
      userId: 200,
      fullName: 'Dave Lee',
      manualTimes: [
        {
          status: 'PENDING',
          durationMinutes: 45,
          description: 'Another task',
          startDateTime: '2026-03-10T12:00:00Z',
          timecardIds: [99],
          type: 'WEB' as const,
        },
      ],
    };
    const result = parseManualItems([rawManualUser, user2]);
    expect(result).toHaveLength(2);
  });

  it('FR1_empty_input_returns_empty_array', () => {
    expect(parseManualItems([])).toEqual([]);
  });

  it('FR1_description_and_startDateTime_preserved', () => {
    const result = parseManualItems([rawManualUser]);
    expect(result[0].description).toBe('Fix critical bug');
    expect(result[0].startDateTime).toBe('2026-03-10T09:00:00Z');
  });

  it('FR1_type_field_preserved_WEB_or_MOBILE', () => {
    const result = parseManualItems([rawManualUser]);
    expect(result[0].type).toBe('WEB');
  });

  it('FR1_timecardIds_array_preserved', () => {
    const result = parseManualItems([rawManualUser]);
    expect(result[0].timecardIds).toEqual([1, 2, 3]);
  });

  it('FR1_weekStartDate_passed_through', () => {
    const result = parseManualItems([rawManualUser], '2026-03-09');
    expect(result[0].weekStartDate).toBe('2026-03-09');
  });
});

// =============================================================================
// FR1: parseOvertimeItems
// =============================================================================

describe('FR1: parseOvertimeItems', () => {
  it('FR1_extracts_candidate_info_from_nested_path', () => {
    const result = parseOvertimeItems([rawOvertimeEntry]);
    expect(result[0].fullName).toBe('Bob Jones');
    expect(result[0].jobTitle).toBe('Senior Engineer');
    expect(result[0].userId).toBe(2362707);
  });

  it('FR1_generates_id_ot_overtimeRequest_id', () => {
    const result = parseOvertimeItems([rawOvertimeEntry]);
    expect(result[0].id).toBe('ot-42');
  });

  it('FR1_calculates_cost_durationMinutes_divided_by_60_times_salary', () => {
    const result = parseOvertimeItems([rawOvertimeEntry]);
    // 120/60 * 50 = 100.00
    expect(result[0].cost).toBe(100);
  });

  it('FR1_category_is_OVERTIME', () => {
    const result = parseOvertimeItems([rawOvertimeEntry]);
    expect(result[0].category).toBe('OVERTIME');
  });

  it('FR1_hours_calculated_correctly', () => {
    const result = parseOvertimeItems([rawOvertimeEntry]);
    // 120 / 60 = 2.0
    expect(result[0].hours).toBe('2.0');
  });

  it('FR1_description_and_startDateTime_from_overtimeRequest', () => {
    const result = parseOvertimeItems([rawOvertimeEntry]);
    expect(result[0].description).toBe('Emergency deployment');
    expect(result[0].startDateTime).toBe('2026-03-10T18:00:00Z');
  });

  it('FR1_overtimeId_matches_overtimeRequest_id', () => {
    const result = parseOvertimeItems([rawOvertimeEntry]);
    expect(result[0].overtimeId).toBe(42);
  });

  it('FR1_empty_input_returns_empty_array', () => {
    expect(parseOvertimeItems([])).toEqual([]);
  });
});

// =============================================================================
// FR1: getWeekStartDate
// =============================================================================

describe('FR1: getWeekStartDate', () => {
  it('FR1_returns_Monday_for_a_Wednesday_input', () => {
    // Inject a known Wednesday: 2026-03-11 (Wed)
    const result = getWeekStartDate(new Date('2026-03-11T12:00:00'));
    expect(result).toBe('2026-03-09'); // Monday
  });

  it('FR1_returns_Monday_for_a_Monday_input', () => {
    const result = getWeekStartDate(new Date('2026-03-09T08:00:00'));
    expect(result).toBe('2026-03-09');
  });

  it('FR1_returns_previous_Monday_for_a_Sunday_input', () => {
    // Sunday 2026-03-15 → Monday is 2026-03-09
    const result = getWeekStartDate(new Date('2026-03-15T10:00:00'));
    expect(result).toBe('2026-03-09');
  });

  it('FR1_returns_YYYY_MM_DD_format', () => {
    const result = getWeekStartDate(new Date('2026-03-11T12:00:00'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('FR1_uses_local_date_not_UTC', () => {
    // This test verifies we get a consistent local-time result.
    // We pass a concrete Date so the result is deterministic.
    const monday = new Date('2026-03-09T00:30:00'); // local Mon just after midnight
    const result = getWeekStartDate(monday);
    expect(result).toBe('2026-03-09');
  });
});

// =============================================================================
// FR1: Type shape — compile-time contract check (runtime duck-typing)
// =============================================================================

describe('FR1: ApprovalItem type contract', () => {
  it('FR1_ManualApprovalItem_shape_has_all_required_fields', () => {
    const result = parseManualItems([rawManualUser], '2026-03-09');
    const item = result[0];
    // All required fields must exist
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('category', 'MANUAL');
    expect(item).toHaveProperty('userId');
    expect(item).toHaveProperty('fullName');
    expect(item).toHaveProperty('durationMinutes');
    expect(item).toHaveProperty('hours');
    expect(item).toHaveProperty('description');
    expect(item).toHaveProperty('startDateTime');
    expect(item).toHaveProperty('type');
    expect(item).toHaveProperty('timecardIds');
    expect(item).toHaveProperty('weekStartDate');
  });

  it('FR1_OvertimeApprovalItem_shape_has_all_required_fields', () => {
    const result = parseOvertimeItems([rawOvertimeEntry]);
    const item = result[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('category', 'OVERTIME');
    expect(item).toHaveProperty('overtimeId');
    expect(item).toHaveProperty('userId');
    expect(item).toHaveProperty('fullName');
    expect(item).toHaveProperty('jobTitle');
    expect(item).toHaveProperty('durationMinutes');
    expect(item).toHaveProperty('hours');
    expect(item).toHaveProperty('cost');
    expect(item).toHaveProperty('description');
    expect(item).toHaveProperty('startDateTime');
    expect(item).toHaveProperty('weekStartDate');
  });
});
