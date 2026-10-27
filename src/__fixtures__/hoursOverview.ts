// Synthetic fixtures shaped like the live 2026-10-25 responses (prod, contributor).
// Shapes, key presence and minute values mirror the real bodies; descriptions and amounts
// are made up. The last manual entry (REJECTED, with a reason) is synthetic too: the live
// body had none, and its `rejectionReason` key was absent on every other entry.
// Note the omitted keys the parsers must tolerate: `idle` on older weeks, and
// `rejectionReason` / `noPayReason` when there is none.

/** GET /api/v3/assignments/{id}/hours-overview?date=2026-10-25 (week of Mon 2026-10-19). */
export const HOURS_OVERVIEW_RAW = {
  "kind": "HOURLY_PAYONEER",
  "salaryUnit": "HOUR",
  "paymentPlatform": "PAYONEER",
  "limitHours": 40,
  "limitType": "WEEKLY_LIMIT",
  "weekStart": "2026-10-19",
  "today": "2026-10-25",
  "startDate": "2024-11-04",
  "days": [
    {
      "billable": 520,
      "tracked": 340,
      "idle": 0,
      "manualApproved": 180,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "date": "2026-10-19",
      "future": false
    },
    {
      "billable": 450,
      "tracked": 450,
      "idle": 60,
      "manualApproved": 0,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "date": "2026-10-20",
      "future": false
    },
    {
      "billable": 460,
      "tracked": 350,
      "idle": 10,
      "manualApproved": 110,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "date": "2026-10-21",
      "future": false
    },
    {
      "billable": 540,
      "tracked": 470,
      "idle": 10,
      "manualApproved": 70,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "date": "2026-10-22",
      "future": false
    },
    {
      "billable": 280,
      "tracked": 230,
      "idle": 20,
      "manualApproved": 50,
      "manualPending": 110,
      "manualRejected": 0,
      "disputed": 0,
      "date": "2026-10-23",
      "future": false
    },
    {
      "billable": 0,
      "tracked": 0,
      "idle": 0,
      "manualApproved": 0,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "date": "2026-10-24",
      "future": false
    },
    {
      "billable": 160,
      "tracked": 160,
      "idle": 10,
      "manualApproved": 0,
      "manualPending": 20,
      "manualRejected": 0,
      "disputed": 0,
      "date": "2026-10-25",
      "future": false
    }
  ],
  "weeks": [
    {
      "billable": 2550,
      "tracked": 2120,
      "manualApproved": 430,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "weekStart": "2026-08-31",
      "approvedOvertime": 0,
      "limitHours": 40,
      "beforeStart": false
    },
    {
      "billable": 2450,
      "tracked": 1740,
      "manualApproved": 710,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "weekStart": "2026-09-07",
      "approvedOvertime": 0,
      "limitHours": 40,
      "beforeStart": false
    },
    {
      "billable": 2420,
      "tracked": 1570,
      "manualApproved": 850,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "weekStart": "2026-09-14",
      "approvedOvertime": 0,
      "limitHours": 40,
      "beforeStart": false
    },
    {
      "billable": 2400,
      "tracked": 1700,
      "manualApproved": 700,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "weekStart": "2026-09-21",
      "approvedOvertime": 0,
      "limitHours": 40,
      "beforeStart": false
    },
    {
      "billable": 2410,
      "tracked": 1800,
      "manualApproved": 610,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "weekStart": "2026-09-28",
      "approvedOvertime": 0,
      "limitHours": 40,
      "beforeStart": false
    },
    {
      "billable": 2410,
      "tracked": 1780,
      "manualApproved": 630,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "weekStart": "2026-10-05",
      "approvedOvertime": 0,
      "limitHours": 40,
      "beforeStart": false
    },
    {
      "billable": 2400,
      "tracked": 1900,
      "idle": 140,
      "manualApproved": 500,
      "manualPending": 0,
      "manualRejected": 0,
      "disputed": 0,
      "weekStart": "2026-10-12",
      "approvedOvertime": 0,
      "limitHours": 40,
      "beforeStart": false
    },
    {
      "billable": 2410,
      "tracked": 2000,
      "idle": 110,
      "manualApproved": 410,
      "manualPending": 130,
      "manualRejected": 0,
      "disputed": 0,
      "weekStart": "2026-10-19",
      "approvedOvertime": 0,
      "limitHours": 40,
      "beforeStart": false
    }
  ],
  "manualEntries": [
    {
      "start": "2026-10-25T13:10",
      "end": "2026-10-25T13:20",
      "durationMinutes": 10,
      "description": "Spec review",
      "status": "PENDING",
      "selectedWeek": true
    },
    {
      "start": "2026-10-25T12:50",
      "end": "2026-10-25T13:00",
      "durationMinutes": 10,
      "description": "Call with client",
      "status": "PENDING",
      "selectedWeek": true
    },
    {
      "start": "2026-10-23T19:30",
      "end": "2026-10-23T20:20",
      "durationMinutes": 50,
      "description": "Fix build",
      "status": "PENDING",
      "selectedWeek": true
    },
    {
      "start": "2026-10-23T18:00",
      "end": "2026-10-23T19:00",
      "durationMinutes": 60,
      "description": "Planning",
      "status": "PENDING",
      "selectedWeek": true
    },
    {
      "start": "2026-10-23T14:40",
      "end": "2026-10-23T14:50",
      "durationMinutes": 10,
      "description": "Docs update",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-23T13:00",
      "end": "2026-10-23T13:40",
      "durationMinutes": 40,
      "description": "Standup notes",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-22T17:50",
      "end": "2026-10-22T18:00",
      "durationMinutes": 10,
      "description": "Spec review",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-22T16:20",
      "end": "2026-10-22T16:30",
      "durationMinutes": 10,
      "description": "Call with client",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-22T12:30",
      "end": "2026-10-22T12:40",
      "durationMinutes": 10,
      "description": "Fix build",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-22T11:40",
      "end": "2026-10-22T12:00",
      "durationMinutes": 20,
      "description": "Planning",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-22T11:00",
      "end": "2026-10-22T11:20",
      "durationMinutes": 20,
      "description": "Docs update",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-21T17:50",
      "end": "2026-10-21T18:40",
      "durationMinutes": 50,
      "description": "Standup notes",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-21T16:30",
      "end": "2026-10-21T17:00",
      "durationMinutes": 30,
      "description": "Spec review",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-21T11:30",
      "end": "2026-10-21T12:00",
      "durationMinutes": 30,
      "description": "Call with client",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-19T23:30",
      "end": "2026-10-19T23:40",
      "durationMinutes": 10,
      "description": "Fix build",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-19T23:10",
      "end": "2026-10-19T23:20",
      "durationMinutes": 10,
      "description": "Planning",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-19T22:20",
      "end": "2026-10-19T22:30",
      "durationMinutes": 10,
      "description": "Docs update",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-19T18:10",
      "end": "2026-10-19T19:00",
      "durationMinutes": 50,
      "description": "Standup notes",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-19T16:10",
      "end": "2026-10-19T16:50",
      "durationMinutes": 40,
      "description": "Spec review",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-19T13:30",
      "end": "2026-10-19T13:40",
      "durationMinutes": 10,
      "description": "Call with client",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-19T12:00",
      "end": "2026-10-19T12:50",
      "durationMinutes": 50,
      "description": "Fix build",
      "status": "APPROVED",
      "selectedWeek": true
    },
    {
      "start": "2026-10-16T23:50",
      "end": "2026-10-17T00:00",
      "durationMinutes": 10,
      "description": "Planning",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-16T23:10",
      "end": "2026-10-16T23:20",
      "durationMinutes": 10,
      "description": "Docs update",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-16T22:00",
      "end": "2026-10-16T22:50",
      "durationMinutes": 50,
      "description": "Standup notes",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-16T12:00",
      "end": "2026-10-16T13:30",
      "durationMinutes": 90,
      "description": "Spec review",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-15T13:50",
      "end": "2026-10-15T14:00",
      "durationMinutes": 10,
      "description": "Call with client",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-15T12:00",
      "end": "2026-10-15T12:20",
      "durationMinutes": 20,
      "description": "Fix build",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-15T11:00",
      "end": "2026-10-15T11:30",
      "durationMinutes": 30,
      "description": "Planning",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-14T15:20",
      "end": "2026-10-14T16:00",
      "durationMinutes": 40,
      "description": "Docs update",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-13T20:20",
      "end": "2026-10-13T21:30",
      "durationMinutes": 70,
      "description": "Standup notes",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-13T19:00",
      "end": "2026-10-13T19:20",
      "durationMinutes": 20,
      "description": "Spec review",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-12T19:30",
      "end": "2026-10-12T20:30",
      "durationMinutes": 60,
      "description": "Call with client",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-12T19:10",
      "end": "2026-10-12T19:20",
      "durationMinutes": 10,
      "description": "Fix build",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-12T18:50",
      "end": "2026-10-12T19:10",
      "durationMinutes": 20,
      "description": "Planning",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-12T16:30",
      "end": "2026-10-12T16:40",
      "durationMinutes": 10,
      "description": "Docs update",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-12T12:20",
      "end": "2026-10-12T13:10",
      "durationMinutes": 50,
      "description": "Standup notes",
      "status": "APPROVED",
      "selectedWeek": false
    },
    {
      "start": "2026-10-14T09:00",
      "end": "2026-10-14T09:30",
      "durationMinutes": 30,
      "description": "Research",
      "status": "REJECTED",
      "rejectionReason": "Please add detail",
      "selectedWeek": false
    }
  ],
  "overtimeRequests": []
} as const;

/** GET /api/v3/users/current/pay-days on 2026-10-25. */
export const PAY_DAYS_RAW = {
  "today": "2026-10-25",
  "cards": [
    {
      "weekStart": "2026-10-05",
      "weekEnd": "2026-10-11",
      "dueDate": "2026-10-21",
      "payDate": "2026-10-21",
      "state": "PAID",
      "amount": 1600,
      "amountKind": "FINAL",
      "platform": "PAYONEER",
      "salaryUnit": "HOUR",
      "thisWeek": false,
      "nextWeek": false,
      "lastWeekOfWork": false,
      "firstPayDay": false,
      "lastPayDay": false,
      "payDayForThisWeek": false
    },
    {
      "weekStart": "2026-10-12",
      "weekEnd": "2026-10-18",
      "dueDate": "2026-10-28",
      "payDate": "2026-10-28",
      "state": "NEXT",
      "amount": 1600,
      "amountKind": "ESTIMATE",
      "platform": "PAYONEER",
      "salaryUnit": "HOUR",
      "thisWeek": false,
      "nextWeek": false,
      "lastWeekOfWork": false,
      "firstPayDay": false,
      "lastPayDay": false,
      "payDayForThisWeek": false
    },
    {
      "weekStart": "2026-10-19",
      "weekEnd": "2026-10-25",
      "dueDate": "2026-11-04",
      "payDate": "2026-11-04",
      "state": "LATER",
      "amount": 1600,
      "amountKind": "SO_FAR",
      "platform": "PAYONEER",
      "salaryUnit": "HOUR",
      "thisWeek": true,
      "nextWeek": false,
      "lastWeekOfWork": false,
      "firstPayDay": false,
      "lastPayDay": false,
      "payDayForThisWeek": false
    }
  ]
} as const;
