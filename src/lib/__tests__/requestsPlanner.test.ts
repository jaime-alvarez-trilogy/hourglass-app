// Tests: requestsPlanner — features/app/durable-data spec 02-requests-store FR2 (DD2.12-DD2.25)
// and spec 05-requests-backfill FR1 (DD5.1-DD5.8)
// Pure refresh planner: TTL constants, date helpers, requestWindows, tuesdayAfter,
// isDaySettled and planRequestRefresh; the backfill week planner planBackfillWeek. No mocks.
//
// Every fixture time is a local wall-clock time and every expected date comes from the
// UTC calendar helpers below (independent of the module under test), so the cases hold
// in any host time zone. The DST cases (DD2.22, DD5.6) only cross a transition when run in a
// DST zone, e.g. `TZ=America/New_York npx jest src/lib/__tests__/requestsPlanner.test.ts`.

import * as fs from 'fs';
import * as path from 'path';
import {
  PENDING_TTL_MS,
  RECENT_TTL_MS,
  OLD_UNSETTLED_TTL_MS,
  REQUESTS_RETENTION_WEEKS,
  todayLocal,
  formatLocalDate,
  addDays,
  dateRange,
  localDateOf,
  requestWindows,
  tuesdayAfter,
  isDaySettled,
  planRequestRefresh,
  BACKFILL_MAX_WEEKS_PER_SESSION,
  planBackfillWeek,
} from '../requestsPlanner';
import type { BackfillWeek, RefreshPlan, RefreshPlanInput, RefreshReason } from '../requestsPlanner';
import { WEEKLY_HISTORY_MAX } from '../weeklyHistory';
import type { ManualRequestEntry, ManualRequestStatus } from '../../types/requests';

type Day = RefreshPlanInput['days'][string];
type Days = Record<string, Day>;

const PLANNER_FILE = path.resolve(__dirname, '../requestsPlanner.ts');

const MIN = 60_000;
const HOUR = 60 * MIN;

// ─── Calendar oracle (UTC arithmetic, host-zone independent) ─────────────────

/** `date` shifted by `n` calendar days. */
function shift(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Inclusive `from..to`, newest first (the planner's output order). */
function desc(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = to; d >= from; d = shift(d, -1)) out.push(d);
  return out;
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shift(date, -(dow === 0 ? 6 : dow - 1));
}

const catchUpOf = (today: string) => shift(mondayOf(today), -14);
const retentionOf = (today: string) => shift(mondayOf(today), -7 * 23);

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Epoch ms of a local wall-clock time, e.g. local('2026-03-09T12:00'). */
const local = (wallClock: string): number => Date.parse(`${wallClock}:00`);

function entry(date: string, status: ManualRequestStatus): ManualRequestEntry {
  return {
    id: `${date}|${status} memo`,
    date,
    durationMinutes: 30,
    memo: `${status} memo`,
    status,
    rejectionReason: status === 'REJECTED' ? 'Not billable' : null,
  };
}

/** A stored day. `fetchedAt` is epoch ms (stored as ISO-8601) or a raw string. */
function rec(
  date: string,
  fetchedAt: number | string,
  opts: { statuses?: ManualRequestStatus[]; settled?: boolean } = {},
): Day {
  return {
    date,
    fetchedAt: typeof fetchedAt === 'number' ? new Date(fetchedAt).toISOString() : fetchedAt,
    entries: (opts.statuses ?? []).map((s) => entry(date, s)),
    settled: opts.settled ?? false,
  };
}

function store(...days: Day[]): Days {
  return Object.fromEntries(days.map((d) => [d.date, d]));
}

/** Every date in `from..to` recorded at `fetchedAtMs`: no entries, unsettled unless told. */
function recordAll(from: string, to: string, fetchedAtMs: number, settled = false): Days {
  return store(...desc(from, to).map((d) => rec(d, fetchedAtMs, { settled })));
}

/** The whole 3-week window fetched 5 min before `nowMs`, no PENDING, unsettled. */
function freshWindow(today: string, nowMs: number): Days {
  return recordAll(catchUpOf(today), today, nowMs - 5 * MIN);
}

function plan(today: string, nowMs: number, days: Days = {}, force = false): RefreshPlan {
  return planRequestRefresh({ today, nowMs, days, force });
}

/** `{ [today]: 'today', ...rest: reason }` for an exact reasons comparison. */
function reasonsFor(dates: string[], today: string, rest: RefreshReason): Record<string, RefreshReason> {
  return Object.fromEntries(dates.map((d) => [d, d === today ? 'today' : rest]));
}

// ─── Constants and date helpers ──────────────────────────────────────────────

// The TTL values are pinned by behaviour: the 14/16-min, 59/61-min and 5/7-h cases below.
describe('FR2: constants', () => {
  it('retention is 24 weeks and mirrors WEEKLY_HISTORY_MAX', () => {
    expect(REQUESTS_RETENTION_WEEKS).toBe(24);
    expect(REQUESTS_RETENTION_WEEKS).toBe(WEEKLY_HISTORY_MAX);
  });
});

describe('FR2: date helpers (C4)', () => {
  afterEach(() => jest.useRealTimers());

  it('formatLocalDate uses the local calendar date, never UTC', () => {
    expect(formatLocalDate(new Date(2026, 2, 9, 0, 15))).toBe('2026-03-09');
    expect(formatLocalDate(new Date(2026, 2, 9, 23, 30))).toBe('2026-03-09');
    expect(formatLocalDate(new Date(2027, 0, 1, 12, 0))).toBe('2027-01-01');
  });

  it('todayLocal is the local date of the system clock', () => {
    jest.useFakeTimers({ now: new Date(2026, 2, 9, 23, 30) });
    expect(todayLocal()).toBe('2026-03-09');
    jest.setSystemTime(new Date(2026, 2, 10, 0, 30));
    expect(todayLocal()).toBe('2026-03-10');
  });

  it.each([
    ['2026-03-09', -1, '2026-03-08'],
    ['2026-03-07', 2, '2026-03-09'], // across the US spring-forward (2026-03-08)
    ['2026-11-01', 1, '2026-11-02'], // across the US fall-back (2026-11-01)
    ['2026-11-02', -1, '2026-11-01'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-09', 0, '2026-03-09'],
    ['2026-03-09', -161, '2025-09-29'],
  ])('addDays(%s, %i) → %s', (date, n, expected) => {
    expect(addDays(date, n)).toBe(expected);
  });

  it('dateRange is inclusive and ascending, and empty when start > end', () => {
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(dateRange('2026-03-06', '2026-03-10')).toEqual([
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
    expect(dateRange('2026-03-09', '2026-03-09')).toEqual(['2026-03-09']);
    expect(dateRange('2026-03-10', '2026-03-09')).toEqual([]);
  });

  it('localDateOf returns the local YYYY-MM-DD of an ISO timestamp, or null if it does not parse', () => {
    expect(localDateOf(new Date(2026, 2, 9, 23, 30).toISOString())).toBe('2026-03-09');
    expect(localDateOf(new Date(2026, 2, 10, 0, 30).toISOString())).toBe('2026-03-10');
    expect(localDateOf('garbage')).toBeNull();
    expect(localDateOf('')).toBeNull();
  });
});

// ─── planRequestRefresh ──────────────────────────────────────────────────────

describe('DD2.12 — an empty store plans the whole 3-week window', () => {
  it.each([
    ['Monday', '2026-03-09', 15],
    ['Wednesday', '2026-03-11', 17],
    ['Sunday', '2026-03-15', 21],
  ])('%s %s → %i dates from 2026-02-23: today as today, the rest daily', (_dow, today, count) => {
    const p = plan(today, local(`${today}T12:00`));
    const expected = desc('2026-02-23', today);
    expect(expected).toHaveLength(count);
    expect(p.dates).toEqual(expected);
    expect(p.reasons).toEqual(reasonsFor(expected, today, 'daily'));
  });

  it('the Monday after the fall-back (2026-11-02) → 15 consecutive dates, no duplicate or gap', () => {
    const p = plan('2026-11-02', local('2026-11-02T12:00'));
    expect(p.dates).toEqual(desc('2026-10-19', '2026-11-02'));
  });
});

describe('DD2.13 — a warm store fetched minutes ago plans only today', () => {
  it.each(['2026-03-09', '2026-03-11', '2026-03-15'])(
    'today %s, every window day fetched 5 min ago, no PENDING → [today]',
    (today) => {
      const now = local(`${today}T12:00`);
      const p = plan(today, now, freshWindow(today, now));
      expect(p.dates).toEqual([today]);
      expect(p.reasons).toEqual({ [today]: 'today' });
    },
  );
});

describe('DD2.14 — yesterday refreshes after 60 min', () => {
  const today = '2026-03-11';
  const now = local('2026-03-11T12:00');
  const withYesterday = (fetchedAt: number) => ({
    ...freshWindow(today, now),
    '2026-03-10': rec('2026-03-10', fetchedAt),
  });

  it('fetched 61 min ago → recent-ttl', () => {
    const p = plan(today, now, withYesterday(now - 61 * MIN));
    expect(p.dates).toEqual([today, '2026-03-10']);
    expect(p.reasons['2026-03-10']).toBe('recent-ttl');
  });

  it('fetched exactly 60 min ago → recent-ttl (age >= RECENT_TTL_MS)', () => {
    const p = plan(today, now, withYesterday(now - RECENT_TTL_MS));
    expect(p.dates).toEqual([today, '2026-03-10']);
    expect(p.reasons['2026-03-10']).toBe('recent-ttl');
  });

  it('fetched 59 min ago → not planned', () => {
    expect(plan(today, now, withYesterday(now - 59 * MIN)).dates).toEqual([today]);
  });

  it('on a Monday, yesterday is last week’s Sunday: 61 min → recent-ttl; 59 min → not planned', () => {
    const monday = '2026-03-09';
    const mondayNow = local('2026-03-09T12:00');
    const days = (fetchedAt: number) => ({
      ...freshWindow(monday, mondayNow),
      '2026-03-08': rec('2026-03-08', fetchedAt),
    });
    const late = plan(monday, mondayNow, days(mondayNow - 61 * MIN));
    expect(late.dates).toEqual([monday, '2026-03-08']);
    expect(late.reasons['2026-03-08']).toBe('recent-ttl');
    expect(plan(monday, mondayNow, days(mondayNow - 59 * MIN)).dates).toEqual([monday]);
  });

  it('yesterday fetched on an earlier calendar day → recent-ttl, which outranks daily', () => {
    const p = plan(today, now, withYesterday(local('2026-03-09T21:00')));
    expect(p.dates).toEqual([today, '2026-03-10']);
    expect(p.reasons['2026-03-10']).toBe('recent-ttl');
  });
});

describe('DD2.15 — a current-week day refreshes once per calendar day', () => {
  const today = '2026-03-12'; // Thursday
  const now = local('2026-03-12T12:00');

  it('a day that is neither today nor yesterday, fetched 3 h ago today → not planned', () => {
    const days = { ...freshWindow(today, now), '2026-03-09': rec('2026-03-09', now - 3 * HOUR) };
    expect(plan(today, now, days).dates).toEqual([today]);
  });

  it('the same day fetched on a previous calendar day → daily', () => {
    const days = {
      ...freshWindow(today, now),
      '2026-03-09': rec('2026-03-09', local('2026-03-11T21:00')),
    };
    const p = plan(today, now, days);
    expect(p.dates).toEqual([today, '2026-03-09']);
    expect(p.reasons['2026-03-09']).toBe('daily');
  });

  it('the calendar day decides, not 24 h: fetched 23:30 yesterday, now 00:30 → daily', () => {
    const midnightNow = local('2026-03-12T00:30');
    const days = {
      ...freshWindow(today, midnightNow),
      '2026-03-10': rec('2026-03-10', local('2026-03-11T23:30')),
    };
    const p = plan(today, midnightNow, days);
    expect(p.dates).toEqual([today, '2026-03-10']);
    expect(p.reasons['2026-03-10']).toBe('daily');
  });
});

describe('DD2.16 — a PENDING day in catchUpStart..today refreshes after 15 min', () => {
  const today = '2026-03-11'; // Wednesday; catchUpStart 2026-02-23
  const now = local('2026-03-11T12:00');
  const withPending = (date: string, fetchedAt: number, statuses: ManualRequestStatus[] = ['PENDING']) => ({
    ...freshWindow(today, now),
    [date]: rec(date, fetchedAt, { statuses }),
  });

  it.each([
    ['2026-03-09', 'this week'],
    ['2026-03-04', 'last week'],
    ['2026-02-23', 'catchUpStart'],
  ])('%s (%s): 16 min → pending-ttl; 14 min → not planned', (date) => {
    const late = plan(today, now, withPending(date, now - 16 * MIN));
    expect(late.dates).toEqual([today, date]);
    expect(late.reasons[date]).toBe('pending-ttl');
    expect(plan(today, now, withPending(date, now - 14 * MIN)).dates).toEqual([today]);
  });

  it('fetched exactly 15 min ago → pending-ttl (age >= PENDING_TTL_MS)', () => {
    const p = plan(today, now, withPending('2026-03-04', now - PENDING_TTL_MS));
    expect(p.reasons['2026-03-04']).toBe('pending-ttl');
  });

  it('one PENDING entry among APPROVED/REJECTED ones is enough', () => {
    const p = plan(today, now, withPending('2026-03-04', now - 16 * MIN, ['APPROVED', 'PENDING', 'REJECTED']));
    expect(p.dates).toEqual([today, '2026-03-04']);
    expect(p.reasons['2026-03-04']).toBe('pending-ttl');
  });

  it('a PENDING yesterday fetched 61 min ago → pending-ttl, which outranks recent-ttl', () => {
    const p = plan(today, now, withPending('2026-03-10', now - 61 * MIN));
    expect(p.reasons['2026-03-10']).toBe('pending-ttl');
  });

  it('a day with no PENDING entry fetched 16 min ago today → not planned', () => {
    const p = plan(today, now, withPending('2026-03-04', now - 16 * MIN, ['APPROVED', 'REJECTED']));
    expect(p.dates).toEqual([today]);
  });

  it('a PENDING day before catchUpStart is not on the 15-min rule (16 min → not planned)', () => {
    expect(plan(today, now, withPending('2026-02-22', now - 16 * MIN)).dates).toEqual([today]);
  });
});

describe('DD2.17 — a closed-week day refreshes daily until a post-deadline fetch settles it', () => {
  it('a last-week day with no PENDING, fetched this Monday, today Tuesday → daily', () => {
    const today = '2026-03-10';
    const now = local('2026-03-10T12:00');
    const days = {
      ...freshWindow(today, now),
      '2026-03-04': rec('2026-03-04', local('2026-03-09T21:00'), { settled: false }),
    };
    const p = plan(today, now, days);
    expect(p.dates).toEqual([today, '2026-03-04']);
    expect(p.reasons['2026-03-04']).toBe('daily');
  });

  it.each(['2026-03-11', '2026-03-15', '2026-03-16'])(
    'stored settled: true (fetched Tuesday 2026-03-10) → not planned on %s',
    (today) => {
      const now = local(`${today}T12:00`);
      const days = {
        ...freshWindow(today, now),
        '2026-03-04': rec('2026-03-04', local('2026-03-10T08:00'), { settled: true }),
      };
      expect(plan(today, now, days).dates).toEqual([today]);
    },
  );

  it('a settled 2-weeks-ago day fetched long ago → not planned', () => {
    const today = '2026-03-11';
    const now = local('2026-03-11T12:00');
    const days = {
      ...freshWindow(today, now),
      '2026-02-25': rec('2026-02-25', local('2026-03-03T09:00'), { settled: true }),
    };
    expect(plan(today, now, days).dates).toEqual([today]);
  });
});

describe('DD2.18 — force re-checks the whole 3-week window, nothing older', () => {
  const today = '2026-03-11';
  const now = local('2026-03-11T12:00');

  it('every catchUpStart..today date is forced (today stays today), settled days included', () => {
    const days = {
      ...recordAll('2026-02-23', today, now - 5 * MIN, true),
      '2026-03-10': rec('2026-03-10', now - 61 * MIN, { statuses: ['PENDING'] }),
    };
    const p = plan(today, now, days, true);
    const window = desc('2026-02-23', today);
    expect(p.dates).toEqual(window);
    expect(p.reasons).toEqual(reasonsFor(window, today, 'forced'));
  });

  it('days before catchUpStart keep their own rules under force', () => {
    const days = {
      ...freshWindow(today, now),
      '2026-02-22': rec('2026-02-22', now - 1 * HOUR), // unsettled, fresh → skipped
      '2026-02-20': rec('2026-02-20', now - 7 * HOUR), // unsettled, stale → unsettled-old
      '2026-02-16': rec('2026-02-16', now - 30 * 24 * HOUR, { settled: true }), // settled → never
    };
    const p = plan(today, now, days, true);
    expect(p.dates).toEqual([...desc('2026-02-23', today), '2026-02-20']);
    expect(p.reasons['2026-02-20']).toBe('unsettled-old');
    for (const d of p.dates.filter((x) => x < '2026-02-23')) {
      expect(p.reasons[d]).not.toBe('forced');
    }
  });

  it('force on an empty store → the same window, as forced', () => {
    const p = plan(today, now, {}, true);
    const window = desc('2026-02-23', today);
    expect(p.dates).toEqual(window);
    expect(p.reasons).toEqual(reasonsFor(window, today, 'forced'));
  });
});

describe('DD2.19 — days before catchUpStart', () => {
  const today = '2026-03-11'; // catchUpStart 2026-02-23, retentionStart 2025-09-29
  const now = local('2026-03-11T12:00');
  const withOld = (...days: Day[]) => ({ ...freshWindow(today, now), ...store(...days) });

  it('settled → never planned, however old the fetch, even under force', () => {
    const days = withOld(rec('2026-02-18', now - 30 * 24 * HOUR, { settled: true }));
    expect(plan(today, now, days).dates).toEqual([today]);
    expect(plan(today, now, days, true).dates).not.toContain('2026-02-18');
  });

  it('unsettled, fetched 7 h ago → unsettled-old', () => {
    const p = plan(today, now, withOld(rec('2026-02-18', now - 7 * HOUR)));
    expect(p.dates).toEqual([today, '2026-02-18']);
    expect(p.reasons['2026-02-18']).toBe('unsettled-old');
  });

  it('unsettled, fetched exactly 6 h ago → unsettled-old (age >= OLD_UNSETTLED_TTL_MS)', () => {
    const p = plan(today, now, withOld(rec('2026-02-18', now - OLD_UNSETTLED_TTL_MS)));
    expect(p.reasons['2026-02-18']).toBe('unsettled-old');
  });

  it('unsettled, fetched 5 h ago → not planned', () => {
    expect(plan(today, now, withOld(rec('2026-02-18', now - 5 * HOUR))).dates).toEqual([today]);
  });

  it('an old PENDING day follows the 6 h rule: 5 h → not planned; 7 h → unsettled-old', () => {
    const pending = (age: number) => withOld(rec('2026-01-14', now - age, { statuses: ['PENDING'] }));
    expect(plan(today, now, pending(5 * HOUR)).dates).toEqual([today]);
    const p = plan(today, now, pending(7 * HOUR));
    expect(p.dates).toEqual([today, '2026-01-14']);
    expect(p.reasons['2026-01-14']).toBe('unsettled-old');
  });

  it('no record → not planned (missing older days are left to spec 05)', () => {
    const p = plan(today, now, {});
    expect(p.dates.filter((d) => d < '2026-02-23')).toEqual([]);
  });

  it('retentionStart itself is still eligible', () => {
    expect(retentionOf(today)).toBe('2025-09-29');
    const p = plan(today, now, withOld(rec('2025-09-29', now - 7 * HOUR)));
    expect(p.dates).toEqual([today, '2025-09-29']);
    expect(p.reasons['2025-09-29']).toBe('unsettled-old');
  });

  it('a day before retentionStart is never planned, even PENDING and stale, even under force', () => {
    const days = withOld(rec('2025-09-28', now - 7 * 24 * HOUR, { statuses: ['PENDING'] }));
    expect(plan(today, now, days).dates).toEqual([today]);
    expect(plan(today, now, days, true).dates).not.toContain('2025-09-28');
  });
});

describe('DD2.20 — wake budget', () => {
  // Each store is what the previous evening's 21:00 run left: every day from that run's
  // retentionStart through the evening recorded at 21:00, settled per isDaySettled, no
  // PENDING. Before this spec every wake re-fetched the whole window (15 on a Monday,
  // 16 Tuesday, 17 Wednesday, 21 Sunday).
  function eveningStore(evening: string): Days {
    const fetchedAt = local(`${evening}T21:00`);
    return store(
      ...desc(retentionOf(evening), evening).map((d) =>
        rec(d, fetchedAt, { settled: isDaySettled(d, [], evening) }),
      ),
    );
  }

  /** The store after a run at `nowMs` fetched `dates` (all empty days). */
  function afterRun(days: Days, today: string, nowMs: number, dates: string[]): Days {
    return {
      ...days,
      ...store(...dates.map((d) => rec(d, nowMs, { settled: isDaySettled(d, [], today) }))),
    };
  }

  function expectWake(p: RefreshPlan, today: string, expected: string[]) {
    expect(p.dates).toEqual(expected);
    expect(p.reasons[today]).toBe('today');
    const yesterday = shift(today, -1);
    if (expected.includes(yesterday)) expect(p.reasons[yesterday]).toBe('recent-ttl');
    for (const d of expected.filter((x) => x !== today && x !== yesterday)) {
      expect(p.reasons[d]).toBe('daily');
    }
  }

  it('Monday first wake → 8 (today, yesterday, and last week’s other 6, which settle on Tuesday)', () => {
    const p = plan('2026-03-09', local('2026-03-09T08:00'), eveningStore('2026-03-08'));
    expect(p.dates).toHaveLength(8);
    expectWake(p, '2026-03-09', desc('2026-03-02', '2026-03-09'));
  });

  it('Tuesday first wake → 9 (today, Monday, and last week’s 7, fetched before tuesdayAfter)', () => {
    const p = plan('2026-03-10', local('2026-03-10T08:00'), eveningStore('2026-03-09'));
    expect(p.dates).toHaveLength(9);
    expectWake(p, '2026-03-10', desc('2026-03-02', '2026-03-10'));
  });

  it('Wednesday first wake → 3 (today, Tuesday, Monday)', () => {
    const p = plan('2026-03-11', local('2026-03-11T08:00'), eveningStore('2026-03-10'));
    expect(p.dates).toHaveLength(3);
    expectWake(p, '2026-03-11', ['2026-03-11', '2026-03-10', '2026-03-09']);
  });

  it('Sunday first wake → 7 (the current week)', () => {
    const p = plan('2026-03-15', local('2026-03-15T08:00'), eveningStore('2026-03-14'));
    expect(p.dates).toHaveLength(7);
    expectWake(p, '2026-03-15', desc('2026-03-09', '2026-03-15'));
  });

  describe('later wakes the same day (after the Wednesday 08:00 run)', () => {
    const today = '2026-03-11';
    const firstWake = local('2026-03-11T08:00');
    const afterFirstWake = () =>
      afterRun(eveningStore('2026-03-10'), today, firstWake, ['2026-03-11', '2026-03-10', '2026-03-09']);

    it('+5 min → 1 (today)', () => {
      const p = plan(today, firstWake + 5 * MIN, afterFirstWake());
      expect(p.dates).toHaveLength(1);
      expectWake(p, today, [today]);
    });

    it('+90 min → 2 (today, yesterday)', () => {
      const p = plan(today, firstWake + 90 * MIN, afterFirstWake());
      expect(p.dates).toHaveLength(2);
      expectWake(p, today, [today, '2026-03-10']);
    });
  });
});

describe('DD2.21 — clock skew and malformed fetchedAt (C5)', () => {
  const today = '2026-03-11';
  const now = local('2026-03-11T12:00');

  it.each([
    ['30 min', 30 * MIN],
    ['2 days', 2 * 24 * HOUR],
  ])('fetchedAt %s in the future → fresh for every TTL rule: only today is planned', (_label, skew) => {
    // Every day PENDING and unsettled, so any stale-looking age would plan it.
    const days = store(
      ...desc(retentionOf(today), today).map((d) => rec(d, now + skew, { statuses: ['PENDING'] })),
    );
    const p = plan(today, now, days);
    expect(p.dates).toEqual([today]);
    expect(p.reasons).toEqual({ [today]: 'today' });
  });

  describe.each(['garbage', ''])('fetchedAt %p → treated as never fetched', (bad) => {
    const withBad = (date: string, opts: { statuses?: ManualRequestStatus[]; settled?: boolean } = {}) => ({
      ...freshWindow(today, now),
      [date]: rec(date, bad, opts),
    });
    const reasonOf = (date: string, opts?: { statuses?: ManualRequestStatus[]; settled?: boolean }) =>
      plan(today, now, withBad(date, opts)).reasons[date];

    it('a current-week day → daily', () => {
      expect(reasonOf('2026-03-09')).toBe('daily');
    });

    it('an unsettled last-week day → daily', () => {
      expect(reasonOf('2026-03-04')).toBe('daily');
    });

    it('yesterday (a record exists, age ∞) → recent-ttl', () => {
      expect(reasonOf('2026-03-10')).toBe('recent-ttl');
    });

    it('a PENDING window day (age ∞) → pending-ttl', () => {
      expect(reasonOf('2026-02-25', { statuses: ['PENDING'] })).toBe('pending-ttl');
    });

    it('an unsettled day before catchUpStart (age ∞) → unsettled-old', () => {
      expect(reasonOf('2026-02-18')).toBe('unsettled-old');
    });

    it('a settled day before catchUpStart → still never planned', () => {
      expect(reasonOf('2026-02-18', { settled: true })).toBeUndefined();
    });
  });
});

// ─── Windows, tuesdayAfter, isDaySettled ─────────────────────────────────────

describe('DD2.22 — noon-anchored windows across DST', () => {
  it.each([
    ['2026-03-07', '2026-03-02', '2026-03-06', '2026-02-16', '2025-09-22'],
    ['2026-03-08', '2026-03-02', '2026-03-07', '2026-02-16', '2025-09-22'], // US spring-forward
    ['2026-03-09', '2026-03-09', '2026-03-08', '2026-02-23', '2025-09-29'],
    ['2026-11-01', '2026-10-26', '2026-10-31', '2026-10-12', '2026-05-18'], // US fall-back
    ['2026-11-02', '2026-11-02', '2026-11-01', '2026-10-19', '2026-05-25'],
    ['2027-01-01', '2026-12-28', '2026-12-31', '2026-12-14', '2026-07-20'],
  ])(
    'requestWindows(%s) → Monday %s, yesterday %s, catchUpStart %s, retentionStart %s',
    (today, currentMonday, yesterday, catchUpStart, retentionStart) => {
      expect(requestWindows(today)).toEqual({ today, currentMonday, yesterday, catchUpStart, retentionStart });
    },
  );

  it('retentionStart..currentMonday spans exactly 24 Mondays', () => {
    const { currentMonday, retentionStart } = requestWindows('2026-03-11');
    expect(desc(retentionStart, currentMonday).filter((d) => mondayOf(d) === d)).toHaveLength(24);
  });

  it.each([
    ['2026-10-25', '2026-10-27'], // a Sunday
    ['2026-11-01', '2026-11-03'], // the fall-back Sunday
    ['2026-03-08', '2026-03-10'], // the spring-forward Sunday
    ['2026-10-19', '2026-10-27'], // a Monday
    ['2026-03-09', '2026-03-17'],
    ['2026-12-30', '2027-01-05'],
  ])('tuesdayAfter(%s) → %s', (date, expected) => {
    expect(tuesdayAfter(date)).toBe(expected);
  });
});

describe('DD2.23 — isDaySettled', () => {
  const closed = [entry('2026-03-04', 'APPROVED'), entry('2026-03-04', 'REJECTED')];

  it('a last-week day with only APPROVED/REJECTED entries: fetched this Tuesday → true', () => {
    expect(isDaySettled('2026-03-04', closed, '2026-03-10')).toBe(true);
    expect(isDaySettled('2026-03-04', closed, '2026-03-20')).toBe(true);
  });

  it('the same day fetched this Monday → false (the UTC deadline may not have passed)', () => {
    expect(isDaySettled('2026-03-04', closed, '2026-03-09')).toBe(false);
  });

  it('any PENDING entry → false, however late the fetch', () => {
    const withPending = [...closed, entry('2026-03-04', 'PENDING')];
    expect(isDaySettled('2026-03-04', withPending, '2026-03-10')).toBe(false);
    expect(isDaySettled('2026-03-04', withPending, '2026-06-01')).toBe(false);
  });

  it('a current-week day → false', () => {
    expect(isDaySettled('2026-03-10', [], '2026-03-10')).toBe(false);
    expect(isDaySettled('2026-03-09', [entry('2026-03-09', 'APPROVED')], '2026-03-15')).toBe(false);
  });

  it('an empty closed-week day fetched on or after its tuesdayAfter → true; before → false', () => {
    expect(isDaySettled('2026-03-08', [], '2026-03-10')).toBe(true);
    expect(isDaySettled('2026-03-08', [], '2026-04-01')).toBe(true);
    expect(isDaySettled('2026-03-08', [], '2026-03-09')).toBe(false);
  });

  it('across the fall-back week: Sunday 2026-11-01 settles on Tuesday 2026-11-03, not Monday', () => {
    expect(isDaySettled('2026-11-01', [], '2026-11-03')).toBe(true);
    expect(isDaySettled('2026-11-01', [], '2026-11-02')).toBe(false);
  });
});

// ─── Output contract and purity ──────────────────────────────────────────────

describe('DD2.24 — output dates are unique, newest first, with one reason each', () => {
  const today = '2026-03-11';
  const now = local('2026-03-11T12:00');
  const mixed: Days = {
    ...recordAll(retentionOf(today), shift(today, -1), now - 7 * HOUR),
    '2026-03-04': rec('2026-03-04', 'garbage'),
    '2026-03-06': rec('2026-03-06', now - 20 * MIN, { statuses: ['PENDING'] }),
    '2026-03-12': rec('2026-03-12', now - 7 * HOUR), // dated after today
    '2025-09-01': rec('2025-09-01', now - 7 * HOUR), // before retentionStart
  };

  it.each([
    ['an empty store on a Sunday', '2026-03-15', {} as Days, false],
    ['a mixed store', today, mixed, false],
    ['a mixed store, forced', today, mixed, true],
  ])('%s', (_label, day, days, force) => {
    const p = plan(day, local(`${day}T12:00`), days, force);
    for (let i = 1; i < p.dates.length; i++) {
      expect(p.dates[i - 1] > p.dates[i]).toBe(true);
    }
    expect(Object.keys(p.reasons).sort()).toEqual([...p.dates].sort());
    expect(p.dates[0]).toBe(day);
    for (const d of p.dates) {
      expect(d >= retentionOf(day) && d <= day).toBe(true);
    }
  });

  it('a record dated after today and one before retentionStart are never planned', () => {
    const p = plan(today, now, mixed);
    expect(p.dates).not.toContain('2026-03-12');
    expect(p.dates).not.toContain('2025-09-01');
  });

  it('is pure: the input is not mutated and the system clock is irrelevant', () => {
    const snapshot = JSON.stringify(mixed);
    const first = plan(today, now, mixed);
    expect(JSON.stringify(mixed)).toBe(snapshot);

    jest.useFakeTimers({ now: new Date(2031, 0, 1, 12, 0) });
    try {
      expect(plan(today, now, mixed)).toEqual(first);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('DD2.25 — source checks', () => {
  it('requestsPlanner.ts computes weeks with getWeekStartDate (takes over SC9)', () => {
    const source = fs.readFileSync(PLANNER_FILE, 'utf8');
    expect(source).toMatch(/getWeekStartDate/);
  });

  it('requestsPlanner.ts imports only types from requestsStore and does no I/O', () => {
    const source = fs.readFileSync(PLANNER_FILE, 'utf8');
    const storeImports = source.match(/^\s*(?:import|export)\b[^;]*?from\s+['"]\.\/requestsStore['"]/gm) ?? [];
    for (const stmt of storeImports) {
      expect(stmt.trim()).toMatch(/^import\s+type\b/);
    }
    expect(source).not.toMatch(/require\(\s*['"]\.\/requestsStore['"]/);
    expect(source).not.toMatch(/@react-native-async-storage/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/api\//);
  });
});

// ─── planBackfillWeek (spec 05-requests-backfill FR1) ────────────────────────

const BF_TODAY = '2026-10-21'; // Wednesday: catchUpStart 2026-10-05, retentionStart 2026-05-11
const BF_FETCHED = local('2026-10-21T08:00');

/** Inclusive `from..to`, oldest first (the order of BackfillWeek.dates). */
function asc(from: string, to: string): string[] {
  return desc(from, to).reverse();
}

/** The Mon-Sun week starting at `monday`, ascending. */
const weekOf = (monday: string): string[] => asc(monday, shift(monday, 6));

/** The Mondays in `from..to`, newest first. */
const mondaysIn = (from: string, to: string): string[] => desc(from, to).filter((d) => mondayOf(d) === d);

/** Every date in `from..to` stored except `missing`. The backfill only looks for a key. */
function storedExcept(from: string, to: string, ...missing: string[]): Days {
  const days = recordAll(from, to, BF_FETCHED, true);
  for (const d of missing) delete days[d];
  return days;
}

/** Plans the way the runner does: plan, add the Monday to `skip`, repeat until null. */
function walk(days: Days, today: string): { weeks: BackfillWeek[]; skip: Set<string> } {
  const skip = new Set<string>();
  const weeks: BackfillWeek[] = [];
  // Bounded at twice the range, so a planner that ignores `skip` fails instead of spinning.
  while (weeks.length < 42) {
    const week = planBackfillWeek(days, today, skip);
    if (!week) break;
    weeks.push(week);
    skip.add(week.monday);
  }
  return { weeks, skip };
}

describe('DD5.1 — an empty store plans the newest week before the 3-week window', () => {
  it('today 2026-10-21 (Wednesday) → the 2026-09-28 week, all 7 dates ascending', () => {
    expect(catchUpOf(BF_TODAY)).toBe('2026-10-05');
    expect(planBackfillWeek({}, BF_TODAY)).toEqual({
      monday: '2026-09-28',
      dates: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
    });
  });

  it.each([
    ['Monday', '2026-10-19', '2026-09-28'],
    ['Sunday', '2026-10-25', '2026-09-28'],
    ['the next Monday', '2026-10-26', '2026-10-05'],
  ])('%s %s → monday %s (catchUpStart − 7 days)', (_dow, today, monday) => {
    expect(monday).toBe(shift(catchUpOf(today), -7));
    expect(planBackfillWeek({}, today)).toEqual({ monday, dates: weekOf(monday) });
  });
});

describe('DD5.2 — recorded dates are never planned', () => {
  it('the 2026-09-28 week fully stored → the 2026-09-21 week', () => {
    expect(planBackfillWeek(storedExcept('2026-09-28', '2026-10-04'), BF_TODAY)).toEqual({
      monday: '2026-09-21',
      dates: weekOf('2026-09-21'),
    });
  });

  it('every date 2026-05-11..2026-10-04 stored → null, though catchUpStart..today has no record', () => {
    expect(retentionOf(BF_TODAY)).toBe('2026-05-11');
    expect(planBackfillWeek(storedExcept('2026-05-11', '2026-10-04'), BF_TODAY)).toBeNull();
  });

  it('any record counts: unsettled, PENDING or with an unparseable fetchedAt', () => {
    // Re-checking a recorded older day is planRequestRefresh's unsettled-old rule (Out Of Scope #2).
    const days: Days = {
      ...storedExcept('2026-09-28', '2026-10-04'),
      ...store(
        rec('2026-09-28', BF_FETCHED, { statuses: ['PENDING'] }),
        rec('2026-09-29', BF_FETCHED - 30 * 24 * HOUR),
        rec('2026-09-30', 'garbage'),
      ),
    };
    expect(planBackfillWeek(days, BF_TODAY)).toEqual({ monday: '2026-09-21', dates: weekOf('2026-09-21') });
  });

  it('is disjoint from planRequestRefresh on the same store, even forced', () => {
    const now = local('2026-10-21T12:00');
    const days = recordAll('2026-09-28', '2026-10-02', now - 7 * HOUR); // unsettled, stale
    const refresh = plan(BF_TODAY, now, days, true);
    expect(refresh.dates).toEqual(expect.arrayContaining(desc('2026-09-28', '2026-10-02')));

    const week = planBackfillWeek(days, BF_TODAY);
    expect(week).toEqual({ monday: '2026-09-28', dates: ['2026-10-03', '2026-10-04'] });
    for (const d of week?.dates ?? []) expect(refresh.dates).not.toContain(d);
  });
});

describe('DD5.3 — only the dates with no record are planned, ascending', () => {
  it('the 2026-09-28 week missing only Tue and Thu → exactly those 2 dates', () => {
    const days = storedExcept('2026-09-28', '2026-10-04', '2026-10-01', '2026-09-29');
    expect(planBackfillWeek(days, BF_TODAY)).toEqual({ monday: '2026-09-28', dates: ['2026-09-29', '2026-10-01'] });
  });

  it('a mid-range week missing Tue and Thu → that week, past the full weeks above it', () => {
    const days = storedExcept('2026-05-11', '2026-10-04', '2026-07-16', '2026-07-14');
    expect(planBackfillWeek(days, BF_TODAY)).toEqual({ monday: '2026-07-13', dates: ['2026-07-14', '2026-07-16'] });
  });

  it('only the Sunday before catchUpStart missing → that one date', () => {
    const days = storedExcept('2026-05-11', '2026-10-04', '2026-10-04');
    expect(planBackfillWeek(days, BF_TODAY)).toEqual({ monday: '2026-09-28', dates: ['2026-10-04'] });
  });
});

describe('DD5.4 — skip passes over the Mondays already attempted this session', () => {
  it("skip holding '2026-09-28' (empty store) → the 2026-09-21 week", () => {
    expect(planBackfillWeek({}, BF_TODAY, new Set(['2026-09-28']))).toEqual({
      monday: '2026-09-21',
      dates: weekOf('2026-09-21'),
    });
  });

  it('an empty skip is the same as none', () => {
    expect(planBackfillWeek({}, BF_TODAY, new Set())).toEqual({ monday: '2026-09-28', dates: weekOf('2026-09-28') });
  });

  it('a skipped week that still has gaps (a partial week) is passed over', () => {
    const days = storedExcept('2026-09-28', '2026-10-04', '2026-10-02', '2026-10-03');
    expect(planBackfillWeek(days, BF_TODAY, new Set(['2026-09-28']))).toEqual({
      monday: '2026-09-21',
      dates: weekOf('2026-09-21'),
    });
  });

  it('walking an empty store with a growing skip → exactly 21 distinct Mondays, newest first, then null', () => {
    const { weeks, skip } = walk({}, BF_TODAY);
    expect(weeks.map((w) => w.monday)).toEqual(mondaysIn('2026-05-11', '2026-09-28'));
    expect(weeks).toHaveLength(BACKFILL_MAX_WEEKS_PER_SESSION);
    for (const w of weeks) expect(w.dates).toEqual(weekOf(w.monday));
    expect(planBackfillWeek({}, BF_TODAY, skip)).toBeNull();
  });
});

describe('DD5.5 — retentionStart is the oldest week ever planned', () => {
  it('only the 2026-05-11 week has gaps → it is returned', () => {
    expect(planBackfillWeek(storedExcept('2026-05-18', '2026-10-04'), BF_TODAY)).toEqual({
      monday: '2026-05-11',
      dates: weekOf('2026-05-11'),
    });
  });

  it('only retentionStart itself missing → [2026-05-11]', () => {
    const days = storedExcept('2026-05-11', '2026-10-04', '2026-05-11');
    expect(planBackfillWeek(days, BF_TODAY)).toEqual({ monday: '2026-05-11', dates: ['2026-05-11'] });
  });

  it('the 2026-05-04 week is never returned, even with no records: 2026-05-11 skipped → null', () => {
    const days = storedExcept('2026-05-18', '2026-10-04');
    expect(Object.keys(days).filter((d) => d < '2026-05-18')).toEqual([]);
    expect(planBackfillWeek(days, BF_TODAY, new Set(['2026-05-11']))).toBeNull();
  });
});

// The fall-back (2026-11-01) and spring-forward (2026-03-08) weeks only cross a transition when
// run in a DST zone, e.g. `TZ=America/New_York npx jest src/lib/__tests__/requestsPlanner.test.ts`.
describe('DD5.6 — Mondays and dates stay exact across DST', () => {
  it.each([
    ['fall-back', '2026-11-25', '2026-11-02', '2026-10-26', '2026-11-01'],
    ['spring-forward', '2026-04-01', '2026-03-09', '2026-03-02', '2026-03-08'],
  ])('%s: today %s, the %s week stored → monday %s, 7 dates through %s', (_label, today, storedMonday, monday, sunday) => {
    const week = planBackfillWeek(storedExcept(storedMonday, shift(storedMonday, 6)), today);
    expect(week).toEqual({ monday, dates: asc(monday, sunday) });
    expect(week?.dates).toHaveLength(7);
  });

  it.each([
    ['2026-11-25', '2026-06-15', '2026-11-02'], // crosses 2026-11-01
    ['2026-04-01', '2025-10-20', '2026-03-09'], // crosses 2025-11-02 and 2026-03-08
  ])('walking an empty store, today %s → the 21 Mondays %s..%s, with no gap or duplicate date', (today, oldest, newest) => {
    const { weeks } = walk({}, today);
    expect(weeks.map((w) => w.monday)).toEqual(mondaysIn(oldest, newest));
    expect(weeks.flatMap((w) => w.dates).sort()).toEqual(asc(oldest, shift(newest, 6)));
  });
});

describe('DD5.7 — store keys outside the range are ignored, and the planner is pure', () => {
  it("a 'garbage' key plus every real date stored → null, no throw", () => {
    const days: Days = { ...storedExcept('2026-05-11', '2026-10-04'), garbage: rec('garbage', BF_FETCHED) };
    expect(planBackfillWeek(days, BF_TODAY)).toBeNull();
  });

  it("a 'garbage' key does not stand in for a missing date", () => {
    expect(planBackfillWeek({ garbage: rec('garbage', BF_FETCHED) }, BF_TODAY)).toEqual({
      monday: '2026-09-28',
      dates: weekOf('2026-09-28'),
    });
  });

  it('records before retentionStart, in the window or after today do not change the plan', () => {
    const days: Days = {
      ...storedExcept('2026-05-11', '2026-10-04', '2026-09-30'),
      ...recordAll('2026-05-04', '2026-05-10', BF_FETCHED, true),
      ...recordAll('2026-10-05', '2026-10-21', BF_FETCHED),
      '2026-10-30': rec('2026-10-30', BF_FETCHED),
    };
    expect(planBackfillWeek(days, BF_TODAY)).toEqual({ monday: '2026-09-28', dates: ['2026-09-30'] });
  });

  it('does not mutate days or skip, and ignores the system clock', () => {
    const days: Days = { ...storedExcept('2026-09-21', '2026-10-04'), garbage: rec('garbage', 'garbage') };
    const skip = new Set(['2026-09-14']);
    const snapshot = JSON.stringify(days);

    const first = planBackfillWeek(days, BF_TODAY, skip);
    expect(first).toEqual({ monday: '2026-09-07', dates: weekOf('2026-09-07') });
    expect(JSON.stringify(days)).toBe(snapshot);
    expect([...skip]).toEqual(['2026-09-14']);

    jest.useFakeTimers({ now: new Date(2031, 0, 1, 12, 0) });
    try {
      expect(planBackfillWeek(days, BF_TODAY, skip)).toEqual(first);
    } finally {
      jest.useRealTimers();
    }
  });
});

// That the cap equals the weeks an empty store plans in one session is checked by DD5.4's walk.
describe('DD5.8 — the session cap', () => {
  it('BACKFILL_MAX_WEEKS_PER_SESSION is REQUESTS_RETENTION_WEEKS − the 3 catch-up weeks (21)', () => {
    expect(BACKFILL_MAX_WEEKS_PER_SESSION).toBe(REQUESTS_RETENTION_WEEKS - 3);
    expect(BACKFILL_MAX_WEEKS_PER_SESSION).toBe(21);
  });
});
