// Tests: requestsUtils — FR2 (extractRejectionReason) + FR3 (groupSlotsIntoEntries)
// Spec: features/app/approvals-transparency/specs/01-my-requests-data
// Extended by 1.2 WorkSmart dashboard parity: groupOverviewEntries (the hours overview's
// manualEntries grouped exactly as groupSlotsIntoEntries groups a work-diary day, on the
// LOCAL date of each UTC start) and localDatesWithin (the local dates a UTC window covers).
//
// Jest does not pin TZ, so these cases hold in any host time zone: wall times are built from
// local Date values (utcOf), expected local dates come from local Date getters (localDateOfUtc),
// and the cases that must cross a date line inject a fixed-offset converter (atOffset).

import {
  extractRejectionReason,
  groupOverviewEntries,
  groupSlotsIntoEntries,
  localDatesWithin,
} from '../requestsUtils';
import { normalizeHoursOverview, type OverviewManualEntry } from '../hoursOverview';
import { HOURS_OVERVIEW_RAW } from '../../__fixtures__/hoursOverview';
import type { WorkDiarySlot } from '../../types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SlotAction = WorkDiarySlot['actions'][number];

function makeSlot(overrides: Partial<WorkDiarySlot> = {}): WorkDiarySlot {
  return {
    tags: [],
    autoTracker: true,
    status: 'APPROVED',
    memo: 'test memo',
    actions: [],
    date: '',
    time: '',
    activityLevel: 0,
    intensityScore: 0,
    productivityCategory: 'UNCATEGORIZED',
    activities: [],
    secondBrainDeepDive: null,
    ...overrides,
  };
}

function makeManualSlot(overrides: Partial<WorkDiarySlot> = {}): WorkDiarySlot {
  return makeSlot({ autoTracker: false, status: 'PENDING', ...overrides });
}

function makeRejectAction(comment: string): SlotAction {
  return {
    actionType: 'REJECT_MANUAL_TIME',
    comment,
    actionMadeBy: 123,
    createdDate: '2026-03-15T10:00:00Z',
  };
}

// ─── extractRejectionReason ───────────────────────────────────────────────────

describe('extractRejectionReason', () => {
  describe('FR2.1 — happy path: rejection action with comment', () => {
    it('returns the comment when REJECT_MANUAL_TIME action has a non-empty comment', () => {
      const actions: SlotAction[] = [makeRejectAction('Too many hours')];
      expect(extractRejectionReason(actions)).toBe('Too many hours');
    });

    it('returns comment from rejection action among multiple actions', () => {
      const actions: SlotAction[] = [
        { actionType: 'ADD_MANUAL_TIME', comment: '', actionMadeBy: 1, createdDate: '2026-03-15T09:00:00Z' },
        makeRejectAction('Needs documentation'),
        { actionType: 'SOME_OTHER', comment: 'irrelevant', actionMadeBy: 2, createdDate: '2026-03-15T11:00:00Z' },
      ];
      expect(extractRejectionReason(actions)).toBe('Needs documentation');
    });
  });

  describe('FR2.2 — no rejection action', () => {
    it('returns null when no REJECT_MANUAL_TIME action is present', () => {
      const actions: SlotAction[] = [
        { actionType: 'ADD_MANUAL_TIME', comment: 'submitted', actionMadeBy: 1, createdDate: '2026-03-15T09:00:00Z' },
        { actionType: 'APPROVE_MANUAL_TIME', comment: '', actionMadeBy: 2, createdDate: '2026-03-15T10:00:00Z' },
      ];
      expect(extractRejectionReason(actions)).toBeNull();
    });

    it('returns null for empty actions array', () => {
      expect(extractRejectionReason([])).toBeNull();
    });
  });

  describe('FR2.3 — empty comment on rejection action', () => {
    it('returns null when rejection action has empty string comment', () => {
      const actions: SlotAction[] = [makeRejectAction('')];
      expect(extractRejectionReason(actions)).toBeNull();
    });
  });

  describe('FR2.4 — does not throw', () => {
    it('does not throw for any valid input', () => {
      expect(() => extractRejectionReason([])).not.toThrow();
      expect(() => extractRejectionReason([makeRejectAction('reason')])).not.toThrow();
    });
  });
});

// ─── groupSlotsIntoEntries ────────────────────────────────────────────────────

describe('groupSlotsIntoEntries', () => {
  const DATE = '2026-03-15';

  describe('FR3.1 — grouping by memo', () => {
    it('groups two slots with the same memo into one entry with durationMinutes: 20', () => {
      const slots = [
        makeManualSlot({ memo: 'infra work', status: 'PENDING' }),
        makeManualSlot({ memo: 'infra work', status: 'PENDING' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result).toHaveLength(1);
      expect(result[0].durationMinutes).toBe(20);
      expect(result[0].memo).toBe('infra work');
    });

    it('creates separate entries for three slots with three distinct memos', () => {
      const slots = [
        makeManualSlot({ memo: 'task A' }),
        makeManualSlot({ memo: 'task B' }),
        makeManualSlot({ memo: 'task C' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result).toHaveLength(3);
      const memos = result.map((e) => e.memo).sort();
      expect(memos).toEqual(['task A', 'task B', 'task C']);
    });

    it('returns a single entry with durationMinutes: 10 for a single slot', () => {
      const slots = [makeManualSlot({ memo: 'solo task' })];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result).toHaveLength(1);
      expect(result[0].durationMinutes).toBe(10);
    });
  });

  describe('FR3.2 — filtering autoTracker', () => {
    it('returns [] for an empty slots array', () => {
      expect(groupSlotsIntoEntries([], DATE)).toEqual([]);
    });

    it('returns [] when all slots have autoTracker: true', () => {
      const slots = [
        makeSlot({ autoTracker: true, memo: 'auto tracked' }),
        makeSlot({ autoTracker: true, memo: 'also auto' }),
      ];
      expect(groupSlotsIntoEntries(slots, DATE)).toEqual([]);
    });

    it('only includes manual slots when mixed with auto-tracked slots', () => {
      const slots = [
        makeSlot({ autoTracker: true, memo: 'auto' }),
        makeManualSlot({ memo: 'manual only' }),
        makeSlot({ autoTracker: true, memo: 'also auto' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result).toHaveLength(1);
      expect(result[0].memo).toBe('manual only');
    });
  });

  describe('FR3.3 — edge cases for memo', () => {
    it('treats undefined memo as empty string without throwing', () => {
      const slot = makeManualSlot({ memo: undefined as unknown as string });
      expect(() => groupSlotsIntoEntries([slot], DATE)).not.toThrow();
      const result = groupSlotsIntoEntries([slot], DATE);
      expect(result).toHaveLength(1);
      expect(result[0].memo).toBe('');
    });
  });

  describe('FR3.4 — composite id format', () => {
    it('sets entry id to "{date}|{memo}"', () => {
      const slots = [makeManualSlot({ memo: 'fix bug' })];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].id).toBe(`${DATE}|fix bug`);
    });

    it('sets entry id using empty string memo when memo is undefined', () => {
      const slot = makeManualSlot({ memo: undefined as unknown as string });
      const result = groupSlotsIntoEntries([slot], DATE);
      expect(result[0].id).toBe(`${DATE}|`);
    });
  });

  describe('FR3.5 — worst-case status aggregation', () => {
    it('sets status to REJECTED when group contains APPROVED and REJECTED slots', () => {
      const slots = [
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
        makeManualSlot({ memo: 'work', status: 'REJECTED', actions: [makeRejectAction('No')] }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].status).toBe('REJECTED');
    });

    it('sets status to PENDING when group contains APPROVED and PENDING slots', () => {
      const slots = [
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
        makeManualSlot({ memo: 'work', status: 'PENDING' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].status).toBe('PENDING');
    });

    it('sets status to REJECTED when group has PENDING, APPROVED, and REJECTED slots', () => {
      const slots = [
        makeManualSlot({ memo: 'work', status: 'PENDING' }),
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
        makeManualSlot({ memo: 'work', status: 'REJECTED', actions: [makeRejectAction('Denied')] }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].status).toBe('REJECTED');
    });

    it('sets status to APPROVED when all slots are APPROVED', () => {
      const slots = [
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
        makeManualSlot({ memo: 'work', status: 'APPROVED' }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].status).toBe('APPROVED');
    });
  });

  describe('FR3.6 — rejection reason extraction', () => {
    it('populates rejectionReason when status is REJECTED', () => {
      const slots = [
        makeManualSlot({
          memo: 'disputed',
          status: 'REJECTED',
          actions: [makeRejectAction('Duplicate submission')],
        }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].rejectionReason).toBe('Duplicate submission');
    });

    it('sets rejectionReason to null when status is not REJECTED', () => {
      const slots = [makeManualSlot({ memo: 'pending work', status: 'PENDING' })];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].rejectionReason).toBeNull();
    });

    it('sets rejectionReason to null when REJECTED action has empty comment', () => {
      const slots = [
        makeManualSlot({
          memo: 'rejected no reason',
          status: 'REJECTED',
          actions: [makeRejectAction('')],
        }),
      ];
      const result = groupSlotsIntoEntries(slots, DATE);
      expect(result[0].rejectionReason).toBeNull();
    });
  });

  describe('FR3.7 — date is set correctly', () => {
    it('sets entry date to the passed date parameter', () => {
      const slots = [makeManualSlot({ memo: 'work' })];
      const result = groupSlotsIntoEntries(slots, '2026-03-10');
      expect(result[0].date).toBe('2026-03-10');
    });
  });
});

// ─── 1.2: time zone helpers (host-independent oracles) ────────────────────────

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local YYYY-MM-DD of `d`, from local Date getters. */
const localYmd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The host's local YYYY-MM-DD of a UTC wall time "YYYY-MM-DDTHH:mm". */
const localDateOfUtc = (wallTime: string): string => localYmd(new Date(Date.parse(`${wallTime}:00Z`)));

/** The UTC wall time "YYYY-MM-DDTHH:mm" of a local wall-clock time, e.g. utcOf('2026-10-23T12:00'). */
const utcOf = (localWallClock: string): string =>
  new Date(Date.parse(`${localWallClock}:00`)).toISOString().slice(0, 16);

/** A converter for a fixed UTC offset in minutes (−360 = UTC−6), whatever the host's zone. */
const atOffset =
  (offsetMinutes: number) =>
  (start: string): string =>
    new Date(Date.parse(`${start}:00Z`) + offsetMinutes * 60_000).toISOString().slice(0, 10);

/** The user's zone, America/Mexico_City: UTC−6 all year. */
const UTC_MINUS_6 = atOffset(-360);

/** Epoch ms of local midnight of `date` + `plusDays`, by local Date arithmetic. */
function localMidnight(date: string, plusDays = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays).getTime();
}

/** Inclusive `from..to`, ascending (UTC date arithmetic on the strings). */
function ascending(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; ) {
    out.push(d);
    const [y, m, dd] = d.split('-').map(Number);
    d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
  }
  return out;
}

// Dates whose local day is 23 or 25 hours long in common DST zones: US spring forward /
// fall back, EU spring forward / fall back, AU/NZ fall back / spring forward (2026).
const DST_DATES = ['2026-03-08', '2026-11-01', '2026-03-29', '2026-10-25', '2026-04-05', '2026-10-04', '2026-09-27'];

// ─── 1.2: groupOverviewEntries ────────────────────────────────────────────────

describe('groupOverviewEntries', () => {
  const DATE = '2026-10-23';

  function makeOverviewEntry(overrides: Partial<OverviewManualEntry> = {}): OverviewManualEntry {
    return {
      start: utcOf(`${DATE}T12:00`),
      end: utcOf(`${DATE}T12:10`),
      durationMinutes: 10,
      description: 'test memo',
      status: 'PENDING',
      rejectionReason: null,
      selectedWeek: true,
      ...overrides,
    };
  }

  /** The 10-minute manual slots the work diary would list for `entries`, in time order. */
  function asDiarySlots(entries: readonly OverviewManualEntry[]): WorkDiarySlot[] {
    return [...entries]
      .sort((a, b) => a.start.localeCompare(b.start))
      .flatMap((e) =>
        Array.from({ length: e.durationMinutes / 10 }, () =>
          makeManualSlot({
            memo: e.description,
            status: e.status,
            actions: e.status === 'REJECTED' ? [makeRejectAction(e.rejectionReason ?? '')] : [],
          }),
        ),
      );
  }

  const overview = normalizeHoursOverview(HOURS_OVERVIEW_RAW)!;

  describe('parity with groupSlotsIntoEntries (the live-shaped fixture)', () => {
    // This and last UTC week are 2026-10-12 (Mon) .. 2026-10-25 (Sun); one day either side,
    // so every local date an entry can fall on (UTC−12 .. UTC+14) is requested
    const DATES = ascending('2026-10-11', '2026-10-26');

    it.each(DATES)('%s groups exactly like the same local day of work-diary slots', (date) => {
      const ofDate = overview.manualEntries.filter((e) => localDateOfUtc(e.start) === date);
      const result = groupOverviewEntries(overview.manualEntries, [date]);
      expect(result.get(date)).toEqual(groupSlotsIntoEntries(asDiarySlots(ofDate), date));
    });

    it('covers the fixture: every entry lands on exactly one requested date, minutes preserved', () => {
      const result = groupOverviewEntries(overview.manualEntries, DATES);
      const total = (xs: readonly { durationMinutes: number }[]) => xs.reduce((n, e) => n + e.durationMinutes, 0);
      expect(total([...result.values()].flat())).toBe(total(overview.manualEntries));
      for (const date of DATES) {
        const ofDate = overview.manualEntries.filter((e) => localDateOfUtc(e.start) === date);
        expect(total(result.get(date)!)).toBe(total(ofDate));
      }
    });

    // The fixture-specific cases inject the user's UTC−6, so they hold in any host zone

    it('sums a repeated description within a day (2026-10-19 "Fix build": 50 + 10 min) into one entry', () => {
      const day = groupOverviewEntries(overview.manualEntries, ['2026-10-19'], UTC_MINUS_6).get('2026-10-19')!;
      expect(day.filter((e) => e.memo === 'Fix build')).toEqual([
        {
          id: '2026-10-19|Fix build',
          date: '2026-10-19',
          durationMinutes: 60,
          memo: 'Fix build',
          status: 'APPROVED',
          rejectionReason: null,
        },
      ]);
    });

    it('carries the REJECTED entry with its reason (2026-10-14 "Research")', () => {
      const day = groupOverviewEntries(overview.manualEntries, ['2026-10-14'], UTC_MINUS_6).get('2026-10-14')!;
      expect(day).toEqual([
        {
          id: '2026-10-14|Research',
          date: '2026-10-14',
          durationMinutes: 30,
          memo: 'Research',
          status: 'REJECTED',
          rejectionReason: 'Please add detail',
        },
        {
          id: '2026-10-14|Docs update',
          date: '2026-10-14',
          durationMinutes: 40,
          memo: 'Docs update',
          status: 'APPROVED',
          rejectionReason: null,
        },
      ]);
    });

    it('at UTC−6 the days without manual time are the weekend of 2026-10-17, 2026-10-20 and 2026-10-24', () => {
      const result = groupOverviewEntries(overview.manualEntries, ascending('2026-10-12', '2026-10-25'), UTC_MINUS_6);
      const empty = [...result].filter(([, entries]) => entries.length === 0).map(([date]) => date);
      expect(empty).toEqual(['2026-10-17', '2026-10-18', '2026-10-20', '2026-10-24']);
    });
  });

  describe('the local date of the UTC start', () => {
    it('late on a UTC day, west of UTC: lands on the previous local date (UTC−6)', () => {
      // 2026-10-24T03:30Z is Friday 2026-10-23 21:30 at UTC−6
      const entries = [makeOverviewEntry({ start: '2026-10-24T03:30', end: '2026-10-24T03:40' })];
      const result = groupOverviewEntries(entries, ['2026-10-24', DATE], UTC_MINUS_6);
      expect(result.get('2026-10-24')).toEqual([]);
      expect(result.get(DATE)!.map((e) => [e.id, e.date])).toEqual([[`${DATE}|test memo`, DATE]]);
    });

    it('late on a UTC day, east of UTC: lands on the next local date (UTC+9)', () => {
      // 2026-10-23T18:00Z is Saturday 2026-10-24 03:00 at UTC+9
      const entries = [makeOverviewEntry({ start: `${DATE}T18:00`, end: `${DATE}T18:10` })];
      const result = groupOverviewEntries(entries, [DATE, '2026-10-24'], atOffset(540));
      expect(result.get(DATE)).toEqual([]);
      expect(result.get('2026-10-24')!.map((e) => e.id)).toEqual(['2026-10-24|test memo']);
    });

    it('by default reads the start as UTC and buckets it in the device zone (local Date getters)', () => {
      // A minute after local midnight and a minute before the next: in any zone but UTC, one
      // of the two UTC wall times carries another date, yet both land on DATE
      const entries = [
        makeOverviewEntry({ start: utcOf(`${DATE}T00:01`), description: 'early' }),
        makeOverviewEntry({ start: utcOf(`${DATE}T23:59`), description: 'late' }),
      ];
      const result = groupOverviewEntries(entries, ['2026-10-22', DATE, '2026-10-24']);
      expect(result.get(DATE)!.map((e) => e.memo)).toEqual(['early', 'late']);
      expect(result.get('2026-10-22')).toEqual([]);
      expect(result.get('2026-10-24')).toEqual([]);
    });

    it('by default matches the local Date getters for every fixture entry', () => {
      const dates = ascending('2026-10-11', '2026-10-26');
      const result = groupOverviewEntries(overview.manualEntries, dates);
      for (const e of overview.manualEntries) {
        const date = localDateOfUtc(e.start);
        expect(result.get(date)!.some((g) => g.memo === e.description)).toBe(true);
      }
    });

    it('DST-agnostic: an entry at local 00:30 or 23:30 on a 23- or 25-hour day keeps that date', () => {
      for (const date of DST_DATES) {
        const entries = [
          makeOverviewEntry({ start: utcOf(`${date}T00:30`), description: 'after midnight' }),
          makeOverviewEntry({ start: utcOf(`${date}T23:30`), description: 'before midnight' }),
        ];
        const result = groupOverviewEntries(entries, [date]);
        expect(result.get(date)!.map((e) => e.memo)).toEqual(['after midnight', 'before midnight']);
      }
    });

    it('by default an unparseable start, or one without a time of day, belongs to no date', () => {
      const entries = [
        makeOverviewEntry({ start: 'not a time' }),
        makeOverviewEntry({ start: '' }),
        makeOverviewEntry({ start: DATE }),
      ];
      const result = groupOverviewEntries(entries, [DATE, '2026-10-22', '2026-10-24']);
      expect([...result.values()].flat()).toEqual([]);
    });

    it('an injected converter returning null drops the entry', () => {
      expect(groupOverviewEntries([makeOverviewEntry()], [DATE], () => null).get(DATE)).toEqual([]);
    });
  });

  describe('dates', () => {
    it('maps every requested date, in the requested order, and an empty one to []', () => {
      const entries = [makeOverviewEntry({ start: utcOf('2026-10-22T09:00') })];
      const result = groupOverviewEntries(entries, ['2026-10-23', '2026-10-22', '2026-10-21']);
      expect([...result.keys()]).toEqual(['2026-10-23', '2026-10-22', '2026-10-21']);
      expect(result.get('2026-10-23')).toEqual([]);
      expect(result.get('2026-10-22')).toHaveLength(1);
      expect(result.get('2026-10-21')).toEqual([]);
    });

    it('ignores entries on dates that were not requested', () => {
      const entries = [
        makeOverviewEntry({ start: utcOf('2026-10-22T09:00'), description: 'other day' }),
        makeOverviewEntry({ start: utcOf(`${DATE}T09:00`), description: 'this day' }),
      ];
      const result = groupOverviewEntries(entries, [DATE]);
      expect([...result.keys()]).toEqual([DATE]);
      expect(result.get(DATE)!.map((e) => e.memo)).toEqual(['this day']);
    });

    it('returns an empty Map for no requested dates', () => {
      expect(groupOverviewEntries([makeOverviewEntry()], []).size).toBe(0);
    });

    it('puts an entry on the local date it starts on, even when it ends after local midnight', () => {
      const entries = [
        makeOverviewEntry({ start: utcOf(`${DATE}T23:30`), end: utcOf('2026-10-24T00:30'), durationMinutes: 60 }),
      ];
      const result = groupOverviewEntries(entries, [DATE, '2026-10-24']);
      expect(result.get(DATE)!.map((e) => e.durationMinutes)).toEqual([60]);
      expect(result.get('2026-10-24')).toEqual([]);
    });
  });

  describe('grouping', () => {
    it('groups by description, sums the minutes and builds the "{date}|{memo}" id', () => {
      const entries = [
        makeOverviewEntry({ start: utcOf(`${DATE}T14:00`), description: 'infra work', durationMinutes: 30 }),
        makeOverviewEntry({ start: utcOf(`${DATE}T10:00`), description: 'infra work', durationMinutes: 20 }),
      ];
      expect(groupOverviewEntries(entries, [DATE]).get(DATE)).toEqual([
        {
          id: `${DATE}|infra work`,
          date: DATE,
          durationMinutes: 50,
          memo: 'infra work',
          status: 'PENDING',
          rejectionReason: null,
        },
      ]);
    });

    it('an empty description groups under "" (id "{date}|"), like an undefined memo', () => {
      const result = groupOverviewEntries([makeOverviewEntry({ description: '' })], [DATE]).get(DATE)!;
      expect(result.map((e) => [e.id, e.memo])).toEqual([[`${DATE}|`, '']]);
    });

    it('orders groups by their earliest start (the overview lists newest first)', () => {
      const entries = [
        makeOverviewEntry({ start: utcOf(`${DATE}T18:00`), description: 'C' }),
        makeOverviewEntry({ start: utcOf(`${DATE}T15:00`), description: 'A' }),
        makeOverviewEntry({ start: utcOf(`${DATE}T12:00`), description: 'B' }),
        makeOverviewEntry({ start: utcOf(`${DATE}T09:00`), description: 'A' }),
      ];
      expect(groupOverviewEntries(entries, [DATE]).get(DATE)!.map((e) => e.memo)).toEqual(['A', 'B', 'C']);
    });

    it('does not reorder or mutate the input', () => {
      const entries = [
        makeOverviewEntry({ start: utcOf(`${DATE}T18:00`), description: 'late' }),
        makeOverviewEntry({ start: utcOf(`${DATE}T09:00`), description: 'early' }),
      ];
      const before = JSON.stringify(entries);
      groupOverviewEntries(entries, [DATE]);
      expect(JSON.stringify(entries)).toBe(before);
    });
  });

  describe('worst-case status and rejection reason', () => {
    it.each<[string, OverviewManualEntry['status'][], OverviewManualEntry['status']]>([
      ['APPROVED + PENDING → PENDING', ['APPROVED', 'PENDING'], 'PENDING'],
      ['APPROVED + REJECTED → REJECTED', ['APPROVED', 'REJECTED'], 'REJECTED'],
      ['PENDING + APPROVED + REJECTED → REJECTED', ['PENDING', 'APPROVED', 'REJECTED'], 'REJECTED'],
      ['APPROVED only → APPROVED', ['APPROVED', 'APPROVED'], 'APPROVED'],
    ])('%s', (_label, statuses, expected) => {
      const entries = statuses.map((status, i) =>
        makeOverviewEntry({ start: utcOf(`${DATE}T1${i}:00`), description: 'work', status }),
      );
      expect(groupOverviewEntries(entries, [DATE]).get(DATE)!.map((e) => e.status)).toEqual([expected]);
    });

    it('takes the reason of the earliest REJECTED entry, as groupSlotsIntoEntries takes the first rejected slot', () => {
      const entries = [
        makeOverviewEntry({ start: utcOf(`${DATE}T16:00`), description: 'work', status: 'REJECTED', rejectionReason: 'Later' }),
        makeOverviewEntry({ start: utcOf(`${DATE}T11:00`), description: 'work', status: 'REJECTED', rejectionReason: 'Earlier' }),
      ];
      const [result] = groupOverviewEntries(entries, [DATE]).get(DATE)!;
      expect(result.rejectionReason).toBe('Earlier');
      expect(result.rejectionReason).toBe(groupSlotsIntoEntries(asDiarySlots(entries), DATE)[0].rejectionReason);
    });

    it('null when the earliest REJECTED entry has no reason, even if a later one does (slot parity)', () => {
      const entries = [
        makeOverviewEntry({ start: utcOf(`${DATE}T16:00`), description: 'work', status: 'REJECTED', rejectionReason: 'Later' }),
        makeOverviewEntry({ start: utcOf(`${DATE}T11:00`), description: 'work', status: 'REJECTED', rejectionReason: null }),
      ];
      const [result] = groupOverviewEntries(entries, [DATE]).get(DATE)!;
      expect(result.rejectionReason).toBeNull();
      expect(groupSlotsIntoEntries(asDiarySlots(entries), DATE)[0].rejectionReason).toBeNull();
    });

    it('null when the group is not REJECTED', () => {
      const entries = [makeOverviewEntry({ status: 'APPROVED', rejectionReason: 'stale reason' })];
      expect(groupOverviewEntries(entries, [DATE]).get(DATE)![0].rejectionReason).toBeNull();
    });
  });
});

// ─── 1.2: localDatesWithin ────────────────────────────────────────────────────
// Windows are built from local midnights, so each case holds in any host time zone.

describe('localDatesWithin', () => {
  const D = '2026-10-21';
  const NEXT = '2026-10-22';
  const PREV = '2026-10-20';

  it('a window of exactly the local day covers that date and no neighbour', () => {
    expect(localDatesWithin([NEXT, D, PREV], localMidnight(D), localMidnight(D, 1))).toEqual([D]);
  });

  it('a window starting after local midnight leaves the partly covered first day out', () => {
    const start = localMidnight(D) + 1;
    expect(localDatesWithin([NEXT, D], start, localMidnight(NEXT, 1))).toEqual([NEXT]);
    // An hour in, as at a UTC midnight east of UTC
    expect(localDatesWithin([NEXT, D], localMidnight(D) + 3_600_000, localMidnight(NEXT, 1))).toEqual([NEXT]);
  });

  it('a window ending before the next local midnight leaves the partly covered last day out', () => {
    expect(localDatesWithin([NEXT, D], localMidnight(D), localMidnight(NEXT, 1) - 1)).toEqual([D]);
    // Six hours short, as at a UTC midnight at UTC−6
    expect(localDatesWithin([NEXT, D], localMidnight(D), localMidnight(NEXT, 1) - 6 * 3_600_000)).toEqual([D]);
  });

  it('keeps the input order and drops dates outside the window', () => {
    const dates = ['2026-10-25', '2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-20'];
    expect(localDatesWithin(dates, localMidnight('2026-10-21'), localMidnight('2026-10-24'))).toEqual([
      '2026-10-23',
      '2026-10-22',
      '2026-10-21',
    ]);
  });

  it('an empty or inverted window covers nothing; an unparseable date is never covered', () => {
    expect(localDatesWithin([D], localMidnight(D), localMidnight(D))).toEqual([]);
    expect(localDatesWithin([D], localMidnight(D, 1), localMidnight(D))).toEqual([]);
    expect(localDatesWithin(['not-a-date'], -Infinity, Infinity)).toEqual([]);
    expect(localDatesWithin([], -Infinity, Infinity)).toEqual([]);
  });

  it('DST-agnostic: a 23- or 25-hour local day is covered by exactly its own length', () => {
    for (const date of DST_DATES) {
      const start = localMidnight(date);
      const end = localMidnight(date, 1);
      expect(localDatesWithin([date], start, end)).toEqual([date]);
      expect(localDatesWithin([date], start, end - 1)).toEqual([]);
      expect(localDatesWithin([date], start + 1, end)).toEqual([]);
    }
  });

  it('the overview window [2026-10-12Z, 2026-10-26Z): every local date in between, edge days only when whole', () => {
    const dates = ascending('2026-10-10', '2026-10-27').reverse();
    const startMs = Date.UTC(2026, 9, 12);
    const endMs = Date.UTC(2026, 9, 26);
    const covered = localDatesWithin(dates, startMs, endMs);
    // The middle is whole in every zone (UTC−12 .. UTC+14)
    expect(covered).toEqual(expect.arrayContaining(ascending('2026-10-13', '2026-10-24')));
    // An edge day only when its local day lies inside: oracle from local Date getters
    expect(covered.includes('2026-10-12')).toBe(localMidnight('2026-10-12') >= startMs);
    expect(covered.includes('2026-10-25')).toBe(localMidnight('2026-10-25', 1) <= endMs);
    expect(covered).toHaveLength(12 + Number(covered.includes('2026-10-12')) + Number(covered.includes('2026-10-25')));
  });
});
