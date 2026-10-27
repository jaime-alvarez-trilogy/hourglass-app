// Tests: hoursOverview.ts — 1.2 WorkSmart dashboard parity, the pure data layer.
//
// normalizeHoursOverview / normalizePayDays run on the synthetic live-shaped bodies in
// src/__fixtures__/hoursOverview.ts, plus malformed variants of them. The date helpers
// are pinned at Sunday / Monday and month / year boundaries, with instants that fall on a
// different local day in a UTC-negative host (jest runs in the machine's time zone).
// localDateOfUtcWallTime depends on that zone, so its expectations are built from the
// host's own offset or from host-local times, never by assuming the machine is UTC.

import {
  addDays,
  cappedBillableMinutes,
  formatMinutes,
  isHourlyKind,
  localDateOfUtcWallTime,
  normalizeHoursOverview,
  normalizePayDays,
  selectedOverviewWeek,
  utcToday,
  utcWeekStart,
  type HoursOverview,
} from '../hoursOverview';
import { HOURS_OVERVIEW_RAW, PAY_DAYS_RAW } from '../../__fixtures__/hoursOverview';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A mutable deep copy of a fixture, so a test can break one field of it. */
function clone<T>(v: T): any {
  return JSON.parse(JSON.stringify(v));
}

function parsed(mutate?: (raw: any) => void): HoursOverview {
  const raw = clone(HOURS_OVERVIEW_RAW);
  mutate?.(raw);
  const result = normalizeHoursOverview(raw);
  if (!result) throw new Error('fixture did not parse');
  return result;
}

const WEEK = '2026-10-19';

// ─── normalizeHoursOverview ──────────────────────────────────────────────────

describe('normalizeHoursOverview', () => {
  describe('the live-shaped fixture', () => {
    const o = parsed();

    it('reads the top-level fields', () => {
      expect(o.kind).toBe('HOURLY_PAYONEER');
      expect(o.salaryUnit).toBe('HOUR');
      expect(o.paymentPlatform).toBe('PAYONEER');
      expect(o.limitHours).toBe(40);
      expect(o.limitType).toBe('WEEKLY_LIMIT');
      expect(o.weekStart).toBe(WEEK);
      expect(o.today).toBe('2026-10-25');
      expect(o.startDate).toBe('2024-11-04');
      expect(o.overtimeRequests).toEqual([]);
    });

    it('keeps 8 weeks, oldest → newest, the requested week last', () => {
      expect(o.weeks).toHaveLength(8);
      expect(o.weeks.map((w) => w.weekStart)).toEqual([
        '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21',
        '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19',
      ]);
      expect(o.weeks[7]).toEqual({
        weekStart: WEEK,
        tracked: 2000,
        idle: 110,
        manualApproved: 410,
        manualPending: 130,
        manualRejected: 0,
        disputed: 0,
        billable: 2410,
        approvedOvertime: 0,
        limitHours: 40,
        beforeStart: false,
      });
    });

    it('sorts weeks ascending even when the body lists them out of order', () => {
      const shuffled = parsed((raw) => {
        raw.weeks = [raw.weeks[7], raw.weeks[0], raw.weeks[4], raw.weeks[2], raw.weeks[6],
          raw.weeks[1], raw.weeks[5], raw.weeks[3]];
      });
      expect(shuffled.weeks).toEqual(o.weeks);
    });

    it('reads a missing `idle` (older weeks omit it) as 0', () => {
      expect(HOURS_OVERVIEW_RAW.weeks[0]).not.toHaveProperty('idle');
      expect(o.weeks.slice(0, 6).map((w) => w.idle)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(o.weeks[6].idle).toBe(140);
    });

    it('keeps the 7 days of the requested week, Mon → Sun, with their buckets', () => {
      expect(o.days.map((d) => d.date)).toEqual([
        '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22',
        '2026-10-23', '2026-10-24', '2026-10-25',
      ]);
      expect(o.days[4]).toEqual({
        date: '2026-10-23',
        future: false,
        tracked: 230,
        idle: 20,
        manualApproved: 50,
        manualPending: 110,
        manualRejected: 0,
        disputed: 0,
        billable: 280,
      });
    });

    it('the day buckets add up to the requested week (billable = tracked + manualApproved)', () => {
      const sum = (k: 'billable' | 'tracked' | 'manualApproved' | 'manualPending' | 'idle') =>
        o.days.reduce((s, d) => s + d[k], 0);
      const week = o.weeks[7];
      expect(sum('billable')).toBe(week.billable);
      expect(sum('tracked')).toBe(week.tracked);
      expect(sum('manualApproved')).toBe(week.manualApproved);
      expect(sum('manualPending')).toBe(week.manualPending);
      expect(sum('idle')).toBe(week.idle);
      for (const d of o.days) expect(d.billable).toBe(d.tracked + d.manualApproved);
    });

    it('keeps every manual entry in body order (newest first)', () => {
      expect(o.manualEntries).toHaveLength(HOURS_OVERVIEW_RAW.manualEntries.length);
      expect(o.manualEntries[0]).toEqual({
        start: '2026-10-25T13:10',
        end: '2026-10-25T13:20',
        durationMinutes: 10,
        description: 'Spec review',
        status: 'PENDING',
        rejectionReason: null,
        selectedWeek: true,
      });
      expect(o.manualEntries.map((e) => e.start)).toEqual(
        HOURS_OVERVIEW_RAW.manualEntries.map((e) => e.start),
      );
    });

    it('reads a missing `rejectionReason` as null and keeps a real one', () => {
      const rejected = o.manualEntries.filter((e) => e.status === 'REJECTED');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].rejectionReason).toBe('Please add detail');
      expect(rejected[0].selectedWeek).toBe(false);
      for (const e of o.manualEntries.filter((x) => x.status !== 'REJECTED')) {
        expect(e.rejectionReason).toBeNull();
      }
    });

    it('the selected week\'s pending entries match the week\'s manualPending', () => {
      const pending = o.manualEntries
        .filter((e) => e.selectedWeek && e.status === 'PENDING')
        .reduce((s, e) => s + e.durationMinutes, 0);
      expect(pending).toBe(o.weeks[7].manualPending);
    });
  });

  describe('rejects a body with no usable week (→ null, never 0 h)', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
      ['a string', '<html>Sign in</html>'],
      ['an array', [HOURS_OVERVIEW_RAW]],
      ['an empty object', {}],
    ])('%s', (_label, raw) => {
      expect(normalizeHoursOverview(raw)).toBeNull();
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['not a date', 'last week'],
      ['a number', 20261019],
      ['empty', ''],
    ])('weekStart %s', (_label, weekStart) => {
      const raw = clone(HOURS_OVERVIEW_RAW);
      if (weekStart === undefined) delete raw.weekStart;
      else raw.weekStart = weekStart;
      expect(normalizeHoursOverview(raw)).toBeNull();
    });
  });

  it('accepts an ISO datetime weekStart and keeps its date part', () => {
    expect(parsed((raw) => { raw.weekStart = '2026-10-19T00:00:00.000Z'; }).weekStart).toBe(WEEK);
  });

  it('drops malformed list items and keeps the good ones', () => {
    const o = parsed((raw) => {
      raw.weeks.push(null, 42, 'week', [], { billable: 60 }, { weekStart: 'soon', billable: 60 });
      raw.days.push(null, { billable: 60 }, { date: 7, billable: 60 });
      raw.manualEntries.push(
        null,
        { durationMinutes: 10, status: 'APPROVED' }, // no start
        { start: 'yesterday', durationMinutes: 10, status: 'APPROVED' },
        { start: '2026-10-20T10:00', durationMinutes: 10, status: 'DISPUTED' },
        { start: '2026-10-20T11:00', durationMinutes: 10 }, // no status
      );
      raw.overtimeRequests = [null, { status: 'PENDING' }, { weekStart: WEEK, status: 'APPROVED' }];
    });
    expect(o.weeks).toHaveLength(8);
    expect(o.days).toHaveLength(7);
    expect(o.manualEntries).toHaveLength(HOURS_OVERVIEW_RAW.manualEntries.length);
    expect(o.overtimeRequests).toEqual([
      { weekStart: WEEK, status: 'APPROVED', requestedMinutes: 0, grantedMinutes: 0 },
    ]);
  });

  it('reads non-array lists as empty', () => {
    const o = parsed((raw) => {
      raw.weeks = { 0: raw.weeks[0] };
      raw.days = 'none';
      delete raw.manualEntries;
      raw.overtimeRequests = null;
    });
    expect(o.weeks).toEqual([]);
    expect(o.days).toEqual([]);
    expect(o.manualEntries).toEqual([]);
    expect(o.overtimeRequests).toEqual([]);
  });

  it('accepts numeric strings and reads non-numeric values as 0', () => {
    const o = parsed((raw) => {
      raw.limitHours = '40';
      raw.weeks[7].billable = '2410';
      raw.weeks[7].approvedOvertime = ' 120 ';
      raw.weeks[7].tracked = 'lots';
      raw.weeks[7].idle = null;
      raw.weeks[7].manualPending = true;
      raw.days[0].billable = '520.5';
      raw.days[1].billable = Number.NaN;
      raw.days[2].billable = Number.POSITIVE_INFINITY;
      raw.manualEntries[0].durationMinutes = '10';
    });
    expect(o.limitHours).toBe(40);
    expect(o.weeks[7].billable).toBe(2410);
    expect(o.weeks[7].approvedOvertime).toBe(120);
    expect(o.weeks[7].tracked).toBe(0);
    expect(o.weeks[7].idle).toBe(0);
    expect(o.weeks[7].manualPending).toBe(0);
    expect(o.days[0].billable).toBe(520.5);
    expect(o.days[1].billable).toBe(0);
    expect(o.days[2].billable).toBe(0);
    expect(o.manualEntries[0].durationMinutes).toBe(10);
  });

  it('defaults missing strings and flags', () => {
    const o = parsed((raw) => {
      delete raw.kind;
      raw.salaryUnit = '';
      delete raw.paymentPlatform;
      raw.limitType = 7;
      delete raw.today;
      raw.startDate = 'never';
      delete raw.limitHours;
      raw.weeks[7].beforeStart = 'true';
      delete raw.days[0].future;
      raw.manualEntries[0] = { start: '2026-10-25T13:10', status: 'approved', selectedWeek: 1 };
      raw.overtimeRequests = [{ weekStart: WEEK }];
    });
    expect(o.kind).toBe('UNKNOWN');
    expect(o.salaryUnit).toBeNull();
    expect(o.paymentPlatform).toBeNull();
    expect(o.limitType).toBeNull();
    expect(o.today).toBeNull();
    expect(o.startDate).toBeNull();
    expect(o.limitHours).toBe(0);
    expect(o.weeks[7].beforeStart).toBe(false);
    expect(o.days[0].future).toBe(false);
    expect(o.manualEntries[0]).toEqual({
      start: '2026-10-25T13:10',
      end: '2026-10-25T13:10',
      durationMinutes: 0,
      description: '',
      status: 'APPROVED',
      rejectionReason: null,
      selectedWeek: false,
    });
    expect(o.overtimeRequests).toEqual([
      { weekStart: WEEK, status: 'UNKNOWN', requestedMinutes: 0, grantedMinutes: 0 },
    ]);
  });

  it('keeps manual entry start/end as UTC wall times, unconverted', () => {
    const o = parsed();
    const crossing = o.manualEntries.find((e) => e.start === '2026-10-16T23:50');
    expect(crossing?.end).toBe('2026-10-17T00:00');
  });
});

// ─── normalizePayDays ────────────────────────────────────────────────────────

describe('normalizePayDays', () => {
  it('keeps the live-shaped cards in body order', () => {
    const p = normalizePayDays(clone(PAY_DAYS_RAW));
    expect(p?.today).toBe('2026-10-25');
    expect(p?.cards.map((c) => [c.state, c.amountKind, c.payDate])).toEqual([
      ['PAID', 'FINAL', '2026-10-21'],
      ['NEXT', 'ESTIMATE', '2026-10-28'],
      ['LATER', 'SO_FAR', '2026-11-04'],
    ]);
    expect(p?.cards[2]).toEqual({
      payDate: '2026-11-04',
      dueDate: '2026-11-04',
      state: 'LATER',
      weekStart: WEEK,
      weekEnd: '2026-10-25',
      amount: 1600,
      amountKind: 'SO_FAR',
      platform: 'PAYONEER',
      salaryUnit: 'HOUR',
      noPayReason: null,
      thisWeek: true,
      nextWeek: false,
    });
  });

  it('falls back to dueDate when payDate is missing or not a date', () => {
    const raw = clone(PAY_DAYS_RAW);
    delete raw.cards[0].payDate;
    raw.cards[1].payDate = 'TBD';
    const p = normalizePayDays(raw);
    expect(p?.cards.map((c) => c.payDate)).toEqual(['2026-10-21', '2026-10-28', '2026-11-04']);
  });

  it('keeps a card with a payDate but no dueDate (dueDate → null)', () => {
    const raw = clone(PAY_DAYS_RAW);
    delete raw.cards[0].dueDate;
    const p = normalizePayDays(raw);
    expect(p?.cards[0].payDate).toBe('2026-10-21');
    expect(p?.cards[0].dueDate).toBeNull();
  });

  it('drops cards with no pay date or no work week', () => {
    const raw = clone(PAY_DAYS_RAW);
    delete raw.cards[0].payDate;
    delete raw.cards[0].dueDate;
    delete raw.cards[1].weekEnd;
    raw.cards.push(null, 'card', []);
    const p = normalizePayDays(raw);
    expect(p?.cards.map((c) => c.state)).toEqual(['LATER']);
  });

  it('reads LATE / NO_PAY cards, a null amount and missing kinds', () => {
    const p = normalizePayDays({
      today: '2026-10-25T09:00:00Z',
      cards: [
        { weekStart: WEEK, weekEnd: '2026-10-25', payDate: '2026-11-04', state: 'NO_PAY',
          amount: null, amountKind: 'NONE', noPayReason: 'NO_HOURS' },
        { weekStart: '2026-10-12', weekEnd: '2026-10-18', dueDate: '2026-10-28', state: 'LATE',
          amount: '1600.5' },
        { weekStart: '2026-10-05', weekEnd: '2026-10-11', payDate: '2026-10-21' },
      ],
    });
    expect(p?.today).toBe('2026-10-25');
    expect(p?.cards[0]).toMatchObject({ state: 'NO_PAY', amount: null, amountKind: 'NONE',
      noPayReason: 'NO_HOURS', platform: null, salaryUnit: null, thisWeek: false });
    expect(p?.cards[1]).toMatchObject({ state: 'LATE', amount: 1600.5, amountKind: 'NONE',
      payDate: '2026-10-28', dueDate: '2026-10-28' });
    expect(p?.cards[2]).toMatchObject({ state: 'UNKNOWN', amount: null, amountKind: 'NONE' });
  });

  it('an empty cards array is a valid answer', () => {
    expect(normalizePayDays({ cards: [] })).toEqual({ today: null, cards: [] });
  });

  it.each([
    ['null', null],
    ['a string', 'cards'],
    ['an array', [PAY_DAYS_RAW]],
    ['an object without cards', { today: '2026-10-25' }],
    ['cards not an array', { cards: { 0: PAY_DAYS_RAW.cards[0] } }],
    ['cards null', { cards: null }],
  ])('%s → null', (_label, raw) => {
    expect(normalizePayDays(raw)).toBeNull();
  });
});

// ─── formatMinutes ───────────────────────────────────────────────────────────

describe('formatMinutes', () => {
  it.each([
    [0, '0'],
    [10, '10m'],
    [59, '59m'],
    [60, '1h'],
    [125, '2h 5m'],
    [2400, '40h'],
    [2410, '40h 10m'],
    [2330, '38h 50m'],
  ])('%d → %s', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });

  it('rounds to the nearest minute', () => {
    expect(formatMinutes(0.4)).toBe('0');
    expect(formatMinutes(0.5)).toBe('1m');
    expect(formatMinutes(59.4)).toBe('59m');
    expect(formatMinutes(59.5)).toBe('1h');
    expect(formatMinutes(2409.6)).toBe('40h 10m');
  });

  it('reads negative, NaN and infinite input as 0', () => {
    expect(formatMinutes(-30)).toBe('0');
    expect(formatMinutes(Number.NaN)).toBe('0');
    expect(formatMinutes(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formatMinutes(Number.NEGATIVE_INFINITY)).toBe('0');
  });
});

// ─── isHourlyKind / cappedBillableMinutes ────────────────────────────────────

describe('isHourlyKind', () => {
  it.each([
    ['HOURLY_PAYONEER', true],
    ['HOURLY_PAYCHEX', true],
    ['FIXED', false],
    ['NOT_PAID', false],
    ['UNKNOWN', false],
    ['', false],
  ])('%s → %s', (kind, expected) => {
    expect(isHourlyKind(kind)).toBe(expected);
  });
});

describe('cappedBillableMinutes', () => {
  const week = (billable: number, limitHours = 40, approvedOvertime = 0) => ({
    billable,
    limitHours,
    approvedOvertime,
  });

  it('caps hourly billable time at the weekly limit', () => {
    expect(cappedBillableMinutes(week(2410), 'HOURLY_PAYONEER')).toBe(2400);
    expect(cappedBillableMinutes(week(2410), 'HOURLY_PAYCHEX')).toBe(2400);
  });

  it('leaves hourly time under the limit as it is', () => {
    expect(cappedBillableMinutes(week(1430), 'HOURLY_PAYONEER')).toBe(1430);
    expect(cappedBillableMinutes(week(2400), 'HOURLY_PAYONEER')).toBe(2400);
  });

  it('approved overtime raises the cap', () => {
    expect(cappedBillableMinutes(week(2410, 40, 120), 'HOURLY_PAYONEER')).toBe(2410);
    expect(cappedBillableMinutes(week(2600, 40, 120), 'HOURLY_PAYONEER')).toBe(2520);
    expect(cappedBillableMinutes(week(2410, 40, 5), 'HOURLY_PAYONEER')).toBe(2405);
  });

  it('honours a non-40 limit', () => {
    expect(cappedBillableMinutes(week(2410, 20), 'HOURLY_PAYONEER')).toBe(1200);
  });

  it('never caps FIXED, NOT_PAID or unknown kinds', () => {
    expect(cappedBillableMinutes(week(2410), 'FIXED')).toBe(2410);
    expect(cappedBillableMinutes(week(2410), 'NOT_PAID')).toBe(2410);
    expect(cappedBillableMinutes(week(2410), 'UNKNOWN')).toBe(2410);
  });

  it('a zero (unknown) limit never caps', () => {
    expect(cappedBillableMinutes(week(2410, 0), 'HOURLY_PAYONEER')).toBe(2410);
    expect(cappedBillableMinutes(week(2410, 0, 60), 'HOURLY_PAYONEER')).toBe(2410);
  });
});

// ─── selectedOverviewWeek ────────────────────────────────────────────────────

describe('selectedOverviewWeek', () => {
  it('returns the requested week\'s row', () => {
    const o = parsed();
    expect(selectedOverviewWeek(o)?.weekStart).toBe(WEEK);
    expect(selectedOverviewWeek(o)?.billable).toBe(2410);
  });

  it('matches by weekStart, not position', () => {
    const o = parsed((raw) => { raw.weekStart = '2026-10-12'; });
    expect(selectedOverviewWeek(o)?.weekStart).toBe('2026-10-12');
  });

  it('falls back to the newest week when the requested one is missing', () => {
    const o = parsed((raw) => { raw.weeks = raw.weeks.slice(0, 7); });
    expect(selectedOverviewWeek(o)?.weekStart).toBe('2026-10-12');
  });

  it('returns null without weeks', () => {
    expect(selectedOverviewWeek(parsed((raw) => { raw.weeks = []; }))).toBeNull();
  });
});

// ─── utcToday / utcWeekStart / addDays ───────────────────────────────────────

describe('utcToday', () => {
  it('is the UTC date of the instant', () => {
    expect(utcToday(new Date('2026-10-25T12:00:00.000Z'))).toBe('2026-10-25');
    expect(utcToday(new Date('2026-10-25T23:59:59.999Z'))).toBe('2026-10-25');
    expect(utcToday(new Date('2026-10-26T00:00:00.000Z'))).toBe('2026-10-26');
  });

  it('uses the UTC day, not the local one', () => {
    // Saturday 21:30 in UTC-6 is already Sunday in UTC; Monday 01:00 in UTC+9 is still Sunday.
    expect(utcToday(new Date('2026-10-24T21:30:00-06:00'))).toBe('2026-10-25');
    expect(utcToday(new Date('2026-10-26T01:00:00+09:00'))).toBe('2026-10-25');
  });

  it('defaults to now', () => {
    jest.useFakeTimers({ now: new Date('2026-12-31T23:30:00.000Z') });
    try {
      expect(utcToday()).toBe('2026-12-31');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('utcWeekStart', () => {
  it.each([
    ['Monday 00:00', '2026-10-19T00:00:00.000Z', '2026-10-19'],
    ['Wednesday', '2026-10-21T12:00:00.000Z', '2026-10-19'],
    ['Sunday 23:59', '2026-10-25T23:59:59.999Z', '2026-10-19'],
    ['the next Monday', '2026-10-26T00:00:00.000Z', '2026-10-26'],
    ['Sunday 1 March (Feb week)', '2026-03-01T12:00:00.000Z', '2026-02-23'],
    ['Sunday 1 November (Oct week)', '2026-11-01T10:00:00.000Z', '2026-10-26'],
    ['Friday 1 January (Dec week)', '2027-01-01T08:00:00.000Z', '2026-12-28'],
    ['Sunday 3 January (Dec week)', '2027-01-03T23:00:00.000Z', '2026-12-28'],
    ['Thursday 1 January 2026', '2026-01-01T00:00:00.000Z', '2025-12-29'],
    ['leap day', '2028-02-29T12:00:00.000Z', '2028-02-28'],
    ['Sunday after a leap day', '2028-03-05T12:00:00.000Z', '2028-02-28'],
  ])('%s → %s', (_label, iso, expected) => {
    expect(utcWeekStart(new Date(iso))).toBe(expected);
  });

  it('follows the UTC week, not the local one', () => {
    // Sunday 20:00 in UTC-6 is Monday 02:00 UTC: the new week has started.
    expect(utcWeekStart(new Date('2026-10-25T20:00:00-06:00'))).toBe('2026-10-26');
    // Monday 08:00 in UTC+9 is still Sunday 23:00 UTC: the old week.
    expect(utcWeekStart(new Date('2026-10-26T08:00:00+09:00'))).toBe('2026-10-19');
  });

  it('defaults to now', () => {
    jest.useFakeTimers({ now: new Date('2026-10-25T18:00:00.000Z') });
    try {
      expect(utcWeekStart()).toBe('2026-10-19');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('addDays', () => {
  it.each([
    ['2026-10-19', 0, '2026-10-19'],
    ['2026-10-19', 6, '2026-10-25'],
    ['2026-10-25', 1, '2026-10-26'],
    ['2026-10-19', -7, '2026-10-12'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -4, '2026-12-28'],
    ['2026-12-28', 7, '2027-01-04'],
  ])('%s + %d days → %s', (date, n, expected) => {
    expect(addDays(date, n)).toBe(expected);
  });

  it('walks a whole Mon–Sun week from its Monday', () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays('2026-12-28', i));
    expect(days).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
      '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });
});

// ─── localDateOfUtcWallTime ──────────────────────────────────────────────────

describe('localDateOfUtcWallTime', () => {
  /** Host-local YYYY-MM-DD of a UTC instant, from the host's offset at that instant. */
  function hostLocalDate(utcMs: number): string {
    const offsetMin = new Date(utcMs).getTimezoneOffset(); // + = west of UTC
    return new Date(utcMs - offsetMin * 60_000).toISOString().slice(0, 10);
  }

  it.each([
    ['midday', '2026-10-25T13:10', Date.UTC(2026, 9, 25, 13, 10)],
    ['just after midnight UTC', '2026-10-26T00:00', Date.UTC(2026, 9, 26, 0, 0)],
    ['early morning UTC', '2026-10-26T03:00', Date.UTC(2026, 9, 26, 3, 0)],
    ['late evening UTC', '2026-10-25T23:59', Date.UTC(2026, 9, 25, 23, 59)],
    ['new year\'s eve', '2026-12-31T23:30', Date.UTC(2026, 11, 31, 23, 30)],
    ['new year\'s morning', '2027-01-01T00:30', Date.UTC(2027, 0, 1, 0, 30)],
    ['leap day', '2028-02-29T12:00', Date.UTC(2028, 1, 29, 12, 0)],
    ['last day of February', '2026-02-28T22:00', Date.UTC(2026, 1, 28, 22, 0)],
  ])('%s: %s is read as UTC and filed under the host-local date', (_label, start, utcMs) => {
    expect(localDateOfUtcWallTime(start)).toBe(hostLocalDate(utcMs));
  });

  it('reads the wall time as UTC, never as local', () => {
    // 03:00 UTC is the previous evening anywhere more than 3 h west of UTC (UTC-6: 21:00).
    const utcMs = Date.UTC(2026, 9, 26, 3, 0);
    const westOfUtcBy3h = new Date(utcMs).getTimezoneOffset() > 180;
    expect(localDateOfUtcWallTime('2026-10-26T03:00')).toBe(westOfUtcBy3h ? '2026-10-25' : '2026-10-26');
  });

  it('round-trips a host-local time written as a UTC wall time', () => {
    // Late evening and just after midnight local: a different UTC date in most zones
    for (const local of [
      new Date(2026, 9, 21, 22, 30),
      new Date(2026, 9, 22, 0, 30),
      new Date(2026, 9, 25, 23, 59),
      new Date(2026, 9, 26, 0, 1),
    ]) {
      const y = local.getFullYear();
      const m = String(local.getMonth() + 1).padStart(2, '0');
      const d = String(local.getDate()).padStart(2, '0');
      expect(localDateOfUtcWallTime(local.toISOString().slice(0, 16))).toBe(`${y}-${m}-${d}`);
    }
  });

  it('accepts seconds, a fraction and a trailing Z', () => {
    const expected = localDateOfUtcWallTime('2026-10-26T03:00');
    expect(expected).not.toBeNull();
    for (const start of [
      '2026-10-26T03:00:00',
      '2026-10-26T03:00:00.000',
      '2026-10-26T03:00Z',
      '2026-10-26T03:00:00.000Z',
    ]) {
      expect(localDateOfUtcWallTime(start)).toBe(expected);
    }
  });

  it.each([
    ['empty', ''],
    ['garbage', 'garbage'],
    ['a date with no time of day (which local day it is cannot be known)', '2026-10-25'],
    ['an hour with no minutes', '2026-10-25T13'],
    ['a space instead of T', '2026-10-25 13:10'],
    ['an explicit offset', '2026-10-25T13:10+02:00'],
    ['trailing text', '2026-10-25T13:10 UTC'],
    ['month 13', '2026-13-01T10:00'],
    ['30 February', '2026-02-30T10:00'],
    ['hour 24', '2026-10-25T24:10'],
    ['minute 60', '2026-10-25T13:60'],
    ['second 60', '2026-10-25T13:10:60'],
  ])('null for %s', (_label, start) => {
    expect(localDateOfUtcWallTime(start)).toBeNull();
  });

  it('null for a non-string', () => {
    expect(localDateOfUtcWallTime(null as unknown as string)).toBeNull();
    expect(localDateOfUtcWallTime(undefined as unknown as string)).toBeNull();
    expect(localDateOfUtcWallTime(20261025 as unknown as string)).toBeNull();
  });

  it('every fixture manual entry start converts', () => {
    for (const e of parsed().manualEntries) {
      expect(localDateOfUtcWallTime(e.start)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
