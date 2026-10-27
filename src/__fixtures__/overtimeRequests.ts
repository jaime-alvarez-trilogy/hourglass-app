// Synthetic fixture shaped like the live pending-overtime response (QA, 2026-10-27, manager
// token): GET /api/overtime/request?status=PENDING&weekStartDate=2026-10-19. The ids, week,
// minutes, cost, status and createdOn are the live values; the memo, salary, name, title and
// hours worked are made up. Note what the live overtimeRequest lacks: durationMinutes,
// description and startDateTime (the older shape's fields, see RawOvertimeResponse).

import type { RawOvertimeResponse } from '../lib/approvals';

/** One live-shape pending-overtime entry (week of Mon 2026-10-19, created Tue 2026-10-27). */
export const LIVE_OVERTIME_RAW: RawOvertimeResponse = {
  overtimeRequest: {
    id: 9902122,
    weekStartDate: '2026-10-19',
    memo: 'Release week: migration cutover and on-call cover',
    overtimePeriod: 120, // minutes
    overtimeCost: 3000,
    status: 'PENDING',
    createdOn: '2026-10-27',
  },
  totalHoursWorked: 41.5,
  trackerDataUnavailable: false,
  assignment: {
    id: 77972,
    salary: 25, // 2 h * 25 = 50, so a test can tell overtimeCost from the salary estimate
    selection: {
      marketplaceMember: {
        application: {
          candidate: {
            id: 2368317,
            userId: 1192813,
            printableName: 'Priya Natarajan',
            jobTitle: 'Software Engineer',
          },
        },
      },
    },
  },
};

/** LIVE_OVERTIME_RAW with some overtimeRequest and top-level assignment fields replaced. */
export function liveOvertime(
  request: Partial<RawOvertimeResponse['overtimeRequest']> = {},
  assignment: Partial<Pick<RawOvertimeResponse['assignment'], 'id' | 'salary'>> = {},
): RawOvertimeResponse {
  return {
    ...LIVE_OVERTIME_RAW,
    overtimeRequest: { ...LIVE_OVERTIME_RAW.overtimeRequest, ...request },
    assignment: { ...LIVE_OVERTIME_RAW.assignment, ...assignment },
  };
}
