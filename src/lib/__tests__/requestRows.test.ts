// Tests: requestRows — features/app/durable-data spec 04-requests-history-ui FR1 (DD4.1-DD4.6)
// and FR2 (DD4.7-DD4.13).
// FR1, the pure My Requests row builder: three bounded recent buckets ("This Week", "Last
// Week", "2 Weeks Ago" = prevMonday2 <= date < prevMonday1), then one older-toggle row for
// everything earlier. Expanded, the toggle is followed by month groups ("September 2026"),
// newest month first, with malformed dates under "Other dates" last (C11, C12). Plus
// monthLabel, and the FR1 static check that approvals.tsx imports the builder instead of
// defining its own.
// FR2, the pure copy: formatUpdatedAgo, the quiet freshnessNote shown over visible entries,
// the no-data requestsBannerText, requestsErrorRetryable (no Retry for NO_CREDENTIALS) and
// myRequestsEmptyState (an honest 'incomplete' state, C3/C4). No message says "re-open" or
// mentions a password.
//
// No mocks and no clock: the bounds are fixed (currentMonday 2026-10-19, a Monday) and
// every expected row list is written out in full, so each case pins the exact output. The
// first-of-month cases only catch a `new Date('YYYY-MM-DD')` (UTC) month read when run west
// of UTC, e.g. `TZ=America/Los_Angeles npx jest src/lib/__tests__/requestRows.test.ts`.
// FR2's NOW and every timestamp it is compared with are local wall-clock times, so the
// calendar-day cases hold in any host time zone. The DST case only discriminates in a zone
// that springs forward in March (e.g. `TZ=America/New_York` or `TZ=Europe/Berlin`).

import * as fs from 'fs';
import * as path from 'path';
import { stripComments } from '../../../__tests__/helpers/stripComments';
import { AUTH_LOGIN_LATCHED, NO_CREDENTIALS } from '../../api/errors';
import {
  buildMyRequestRows,
  formatUpdatedAgo,
  freshnessNote,
  INCOMPLETE_EMPTY_TEXT,
  monthLabel,
  myRequestsEmptyState,
  requestsBannerText,
  requestsErrorRetryable,
} from '../requestRows';
import type { MyRequestRow, MyRequestsEmptyState, RequestRowBounds } from '../requestRows';
import type { ManualRequestEntry } from '../../types/requests';

const ROOT = path.resolve(__dirname, '../../..');
const ROWS_FILE = path.resolve(__dirname, '../requestRows.ts');
const APPROVALS_FILE = path.join(ROOT, 'app', '(tabs)', 'approvals.tsx');

/** Source with comments removed, so a pattern named in prose never satisfies a static check. */
const codeOf = (file: string) => stripComments(fs.readFileSync(file, 'utf8'));

// ─── Fixtures ────────────────────────────────────────────────────────────────

// The week of Monday 2026-10-19 and the two Mondays before it.
const BOUNDS: RequestRowBounds = {
  currentMonday: '2026-10-19',
  prevMonday1: '2026-10-12',
  prevMonday2: '2026-10-05',
};

function entry(date: string, memo = `memo ${date}`): ManualRequestEntry {
  return {
    id: `${date}|${memo}`,
    date,
    durationMinutes: 30,
    memo,
    status: 'PENDING',
    rejectionReason: null,
  };
}

const header = (label: string): MyRequestRow => ({ type: 'header', label });
const row = (e: ManualRequestEntry): MyRequestRow => ({ type: 'entry', entry: e });
const toggle = (count: number, expanded: boolean): MyRequestRow => ({
  type: 'older-toggle',
  count,
  expanded,
});

const THIS_WEEK = entry('2026-10-21', 'this week');
const LAST_WEEK = entry('2026-10-14', 'last week');
const TWO_WEEKS = entry('2026-10-07', 'two weeks ago');
const RECENT = [THIS_WEEK, LAST_WEEK, TWO_WEEKS];
const RECENT_ROWS: MyRequestRow[] = [
  header('This Week'),
  row(THIS_WEEK),
  header('Last Week'),
  row(LAST_WEEK),
  header('2 Weeks Ago'),
  row(TWO_WEEKS),
];

// Older than prevMonday2: one in October (before the 5th), one in September.
const OLDER_OCT = entry('2026-10-02', 'early October');
const OLDER_SEP = entry('2026-09-14', 'mid September');

const GARBAGE = entry('garbage', 'malformed date');

// Malformed dates. Most of them compare >= currentMonday as strings, so a builder that
// buckets by string comparison alone would put them in "This Week".
const MALFORMED_DATES = ['garbage', '', '2026-9-14', '2026-10-20T09:00:00Z', '20261020', ' 2026-10-20'];

const build = (entries: ManualRequestEntry[], expanded: boolean) =>
  buildMyRequestRows(entries, BOUNDS, expanded);

// ─── DD4.1: the three recent buckets ─────────────────────────────────────────

describe('DD4.1 — three bounded recent buckets', () => {
  it.each([false, true])(
    'one entry in each recent week → This Week, Last Week, 2 Weeks Ago, and no toggle (olderExpanded %s)',
    (expanded) => {
      expect(build(RECENT, expanded)).toEqual(RECENT_ROWS);
    },
  );

  it.each([
    ['2026-10-19', 'This Week', 'currentMonday'],
    ['2026-10-25', 'This Week', 'the Sunday of this week'],
    ['2026-10-18', 'Last Week', 'the day before currentMonday'],
    ['2026-10-12', 'Last Week', 'prevMonday1'],
    ['2026-10-11', '2 Weeks Ago', 'the day before prevMonday1'],
  ])('%s → %s (%s)', (date, label) => {
    const e = entry(date);
    expect(build([e], false)).toEqual([header(label), row(e)]);
  });

  it('buckets come out in a fixed order whatever the input order; entries keep input order inside a bucket', () => {
    const tueThisWeek = entry('2026-10-20', 'tuesday');
    const thuThisWeek = entry('2026-10-22', 'thursday');
    const rows = build([TWO_WEEKS, tueThisWeek, LAST_WEEK, thuThisWeek], false);
    expect(rows).toEqual([
      header('This Week'),
      row(tueThisWeek),
      row(thuThisWeek),
      header('Last Week'),
      row(LAST_WEEK),
      header('2 Weeks Ago'),
      row(TWO_WEEKS),
    ]);
  });

  it('empty buckets are omitted', () => {
    expect(build([THIS_WEEK, TWO_WEEKS], false)).toEqual([
      header('This Week'),
      row(THIS_WEEK),
      header('2 Weeks Ago'),
      row(TWO_WEEKS),
    ]);
  });
});

// ─── DD4.2: "2 Weeks Ago" is bounded ─────────────────────────────────────────

describe('DD4.2 — "2 Weeks Ago" stops at prevMonday2', () => {
  it('an entry dated exactly prevMonday2 lands in 2 Weeks Ago (inclusive bound)', () => {
    const onBound = entry('2026-10-05');
    expect(build([onBound], false)).toEqual([header('2 Weeks Ago'), row(onBound)]);
  });

  it('an entry the day before prevMonday2 is older: counted by the toggle, absent from every bucket', () => {
    const onBound = entry('2026-10-05');
    const dayBefore = entry('2026-10-04');
    expect(build([onBound, dayBefore], false)).toEqual([
      header('2 Weeks Ago'),
      row(onBound),
      toggle(1, false),
    ]);
  });
});

// ─── DD4.3: the Older section ────────────────────────────────────────────────

describe('DD4.3 — older entries sit behind a collapsible, month-grouped toggle', () => {
  it('collapsed: the buckets, then the toggle (count 2, expanded false) as the last row, and no older entry rows', () => {
    expect(build([...RECENT, OLDER_OCT, OLDER_SEP], false)).toEqual([
      ...RECENT_ROWS,
      toggle(2, false),
    ]);
  });

  it('expanded: the toggle (expanded true), then October 2026 with its entries, then September 2026 with its entries', () => {
    expect(build([...RECENT, OLDER_OCT, OLDER_SEP], true)).toEqual([
      ...RECENT_ROWS,
      toggle(2, true),
      header('October 2026'),
      row(OLDER_OCT),
      header('September 2026'),
      row(OLDER_SEP),
    ]);
  });

  it('a year boundary: January 2026 comes before December 2025', () => {
    const jan12 = entry('2026-01-12');
    const jan05 = entry('2026-01-05');
    const dec29 = entry('2025-12-29');
    const dec01 = entry('2025-12-01');
    expect(build([THIS_WEEK, jan12, jan05, dec29, dec01], true)).toEqual([
      header('This Week'),
      row(THIS_WEEK),
      toggle(4, true),
      header('January 2026'),
      row(jan12),
      row(jan05),
      header('December 2025'),
      row(dec29),
      row(dec01),
    ]);
  });

  it('C12: months are ordered by key descending even when the input is out of order; entries keep input order inside a month', () => {
    const sepA = entry('2026-09-03', 'sep a');
    const oct = entry('2026-10-01', 'oct');
    const dec = entry('2025-12-20', 'dec');
    const sepB = entry('2026-09-28', 'sep b');
    const jan = entry('2026-01-10', 'jan');
    expect(build([sepA, oct, dec, sepB, jan], true)).toEqual([
      toggle(5, true),
      header('October 2026'),
      row(oct),
      header('September 2026'),
      row(sepA),
      row(sepB),
      header('January 2026'),
      row(jan),
      header('December 2025'),
      row(dec),
    ]);
  });

  it('first and last days of a month group under their own month, in any host time zone', () => {
    const sep01 = entry('2026-09-01');
    const aug31 = entry('2026-08-31');
    const jan01 = entry('2026-01-01');
    const dec31 = entry('2025-12-31');
    expect(build([sep01, aug31, jan01, dec31], true)).toEqual([
      toggle(4, true),
      header('September 2026'),
      row(sep01),
      header('August 2026'),
      row(aug31),
      header('January 2026'),
      row(jan01),
      header('December 2025'),
      row(dec31),
    ]);
  });
});

// ─── DD4.4: empty and older-only inputs ──────────────────────────────────────

describe('DD4.4 — empty and older-only inputs', () => {
  it.each([false, true])('[] → [] (olderExpanded %s)', (expanded) => {
    expect(build([], expanded)).toEqual([]);
  });

  it('only older entries, collapsed → exactly one toggle row', () => {
    expect(build([OLDER_OCT, OLDER_SEP], false)).toEqual([toggle(2, false)]);
  });

  it('only older entries, expanded → the toggle, then the month groups', () => {
    expect(build([OLDER_OCT, OLDER_SEP], true)).toEqual([
      toggle(2, true),
      header('October 2026'),
      row(OLDER_OCT),
      header('September 2026'),
      row(OLDER_SEP),
    ]);
  });
});

// ─── DD4.5: malformed dates ──────────────────────────────────────────────────

describe('DD4.5 — a malformed date is always older, grouped under "Other dates" after every month', () => {
  it("'garbage', collapsed: never in a recent bucket, and counted by the toggle", () => {
    expect(build([GARBAGE, ...RECENT, OLDER_SEP], false)).toEqual([
      ...RECENT_ROWS,
      toggle(2, false),
    ]);
  });

  it("'garbage', expanded: under 'Other dates', after every month group", () => {
    expect(build([GARBAGE, ...RECENT, OLDER_OCT, OLDER_SEP], true)).toEqual([
      ...RECENT_ROWS,
      toggle(3, true),
      header('October 2026'),
      row(OLDER_OCT),
      header('September 2026'),
      row(OLDER_SEP),
      header('Other dates'),
      row(GARBAGE),
    ]);
  });

  it.each(MALFORMED_DATES)('%j is older: alone it gives only the toggle, then "Other dates" when expanded', (date) => {
    const e = entry(date);
    expect(build([e], false)).toEqual([toggle(1, false)]);
    expect(build([e], true)).toEqual([toggle(1, true), header('Other dates'), row(e)]);
  });

  it('every malformed entry shares one "Other dates" group, in input order', () => {
    const g1 = entry('garbage', 'g1');
    const g2 = entry('', 'g2');
    expect(build([g1, OLDER_SEP, g2], true)).toEqual([
      toggle(3, true),
      header('September 2026'),
      row(OLDER_SEP),
      header('Other dates'),
      row(g1),
      row(g2),
    ]);
  });

  it('never throws, even for a non-string date', () => {
    const missing = { ...entry('x'), date: undefined as unknown as string };
    const nulled = { ...entry('y'), date: null as unknown as string };
    let rows: MyRequestRow[] = [];
    expect(() => {
      rows = build([THIS_WEEK, missing, nulled], true);
    }).not.toThrow();
    expect(rows).toEqual([
      header('This Week'),
      row(THIS_WEEK),
      toggle(2, true),
      header('Other dates'),
      row(missing),
      row(nulled),
    ]);
  });
});

// ─── Purity ──────────────────────────────────────────────────────────────────

describe('FR1 — buildMyRequestRows is pure', () => {
  it('does not mutate its inputs, and the same input gives the same rows', () => {
    const entries = [OLDER_SEP, GARBAGE, THIS_WEEK, OLDER_OCT, LAST_WEEK];
    const before = JSON.parse(JSON.stringify(entries));
    const bounds = { ...BOUNDS };
    const first = buildMyRequestRows(entries, bounds, true);
    expect(entries).toEqual(before);
    expect(bounds).toEqual(BOUNDS);
    expect(buildMyRequestRows(entries, bounds, true)).toEqual(first);
  });

  it('accepts frozen inputs (it never sorts or edits them in place)', () => {
    const entries = Object.freeze([OLDER_SEP, THIS_WEEK, OLDER_OCT].map((e) => Object.freeze({ ...e })));
    expect(() => buildMyRequestRows(entries as ManualRequestEntry[], Object.freeze({ ...BOUNDS }), true)).not.toThrow();
  });
});

// ─── DD4.6: monthLabel ───────────────────────────────────────────────────────

describe('DD4.6 — monthLabel', () => {
  it.each([
    ['2026-09-14', 'September 2026'],
    ['2025-12-01', 'December 2025'],
    ['garbage', 'Other dates'],
  ])('%s → %s', (date, label) => {
    expect(monthLabel(date)).toBe(label);
  });

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  it.each(MONTHS.map((name, i) => [`2026-${String(i + 1).padStart(2, '0')}-15`, `${name} 2026`]))(
    'fixed English month names: %s → %s',
    (date, label) => {
      expect(monthLabel(date)).toBe(label);
    },
  );

  it.each([
    ['2026-01-01', 'January 2026'],
    ['2026-03-01', 'March 2026'],
    ['2026-12-31', 'December 2026'],
  ])('reads the calendar month from the string, in any host time zone: %s → %s', (date, label) => {
    expect(monthLabel(date)).toBe(label);
  });

  it.each([...MALFORMED_DATES, 'September 2026', undefined, null])(
    'malformed input %j → Other dates, without throwing',
    (date) => {
      expect(monthLabel(date as unknown as string)).toBe('Other dates');
    },
  );

  it('C11: month names are fixed strings, not Intl or toLocale* (Hermes and jest agree)', () => {
    const code = codeOf(ROWS_FILE);
    expect(code).not.toMatch(/\bIntl\b/);
    expect(code).not.toMatch(/\.toLocale\w*\(/);
  });
});

// ─── FR1 static check: approvals.tsx uses the extracted builder ──────────────

describe('FR1 — approvals.tsx imports buildMyRequestRows instead of defining it', () => {
  const code = () => codeOf(APPROVALS_FILE);

  it('has no local buildMyRequestRows or MyRequestRow', () => {
    expect(code()).not.toMatch(/\bfunction\s+buildMyRequestRows\b/);
    expect(code()).not.toMatch(/\b(?:const|let|var)\s+buildMyRequestRows\b/);
    expect(code()).not.toMatch(/\b(?:type|interface)\s+MyRequestRow\b/);
  });

  it('imports buildMyRequestRows from @/src/lib/requestRows', () => {
    expect(code()).toMatch(
      /import\s*\{[^}]*\bbuildMyRequestRows\b[^}]*\}\s*from\s*['"]@\/src\/lib\/requestRows['"]/,
    );
  });
});

// ─── FR2 fixtures ────────────────────────────────────────────────────────────

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

/** A local wall-clock time as epoch ms (month is 1-based), so day math holds in any zone. */
const at = (y: number, month: number, d: number, h = 0, min = 0) =>
  new Date(y, month - 1, d, h, min).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

// Thursday 2026-10-22, 15:00 local.
const NOW = at(2026, 10, 22, 15);
const ago = (ms: number) => iso(NOW - ms);
const UPDATED_5_MIN = ago(5 * MIN);
const STALE = ['2026-10-20'];
// A server envelope code on an AuthError: an 'auth' code that is not NO_CREDENTIALS.
const SERVER_CODE = 'CROS-0002';

const NETWORK_NOTE = 'Showing saved requests';
const AUTH_NOTE = "Can't sign in to Crossover right now · showing saved requests";
const MISSING_NOTE =
  'Saved sign-in missing · showing saved requests · sign out and back in from Settings';
const STALE_NOTE = "Some days couldn't refresh";
const UPD_5 = ' · updated 5 min ago';

const NETWORK_BANNER = 'Could not load requests.';
const AUTH_BANNER =
  "Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings.";
const MISSING_BANNER = 'Your saved sign-in is missing. Sign out and back in from Settings.';

type NoteInput = Parameters<typeof freshnessNote>[0];

/** freshnessNote over visible entries refreshed 5 min before NOW, with no error; override per case. */
const note = (over: Partial<NoteInput> = {}) =>
  freshnessNote({
    hasEntries: true,
    error: null,
    errorCode: null,
    staleDates: [],
    updatedAt: UPDATED_5_MIN,
    nowMs: NOW,
    ...over,
  });

// ─── DD4.7: formatUpdatedAgo ─────────────────────────────────────────────────

describe('DD4.7 — formatUpdatedAgo', () => {
  it.each([
    ['30 s', ago(30 * SEC), 'just now'],
    ['5 min', ago(5 * MIN), '5 min ago'],
    ['3 h', ago(3 * HOUR), '3 h ago'],
    ['the previous calendar day, 26 h earlier', iso(at(2026, 10, 21, 13)), 'yesterday'],
    ['4 calendar days earlier', iso(at(2026, 10, 18, 15)), '4 days ago'],
  ])('%s → %j', (_label, updatedAt, expected) => {
    expect(formatUpdatedAgo(updatedAt, NOW)).toBe(expected);
  });

  it.each([
    ['0 s', ago(0), 'just now'],
    ['59 s', ago(59 * SEC), 'just now'],
    ['exactly 60 s', ago(60 * SEC), '1 min ago'],
    ['59 min 59 s (floored)', ago(59 * MIN + 59 * SEC), '59 min ago'],
    ['exactly 60 min', ago(HOUR), '1 h ago'],
    ['23 h 59 min, already on the previous calendar day (still hours)', ago(23 * HOUR + 59 * MIN), '23 h ago'],
  ])('unit boundaries: %s → %j', (_label, updatedAt, expected) => {
    expect(formatUpdatedAgo(updatedAt, NOW)).toBe(expected);
  });

  it.each([
    ['exactly 24 h', NOW, NOW - 24 * HOUR, 'yesterday'],
    ['26 h, but two calendar days back (01:00 vs 23:00)', at(2026, 10, 22, 1), at(2026, 10, 20, 23), '2 days ago'],
    ['47 h, one calendar day back (23:00 vs 00:00)', at(2026, 10, 22, 23), at(2026, 10, 21, 0), 'yesterday'],
    ['a month back, across a March DST change', at(2026, 4, 2, 15), at(2026, 3, 2, 15), '31 days ago'],
  ])('from 24 h on it counts calendar days between the local dates, not 24 h blocks: %s → %j', (_label, nowMs, then, expected) => {
    expect(formatUpdatedAgo(iso(then), nowMs)).toBe(expected);
  });

  it.each([
    ['+5 min', iso(NOW + 5 * MIN)],
    ['+2 days', iso(NOW + 48 * HOUR)],
  ])('a future time (clock skew, %s) → just now', (_label, updatedAt) => {
    expect(formatUpdatedAgo(updatedAt, NOW)).toBe('just now');
  });

  it.each([null, undefined, 'not-a-date', ''])('%j → empty string', (updatedAt) => {
    expect(formatUpdatedAgo(updatedAt, NOW)).toBe('');
  });

  it('measures against nowMs, never the system clock (formatUpdatedAgo and freshnessNote)', () => {
    jest.useFakeTimers({ now: at(2030, 1, 1, 12) });
    try {
      expect(formatUpdatedAgo(UPDATED_5_MIN, NOW)).toBe('5 min ago');
      expect(formatUpdatedAgo(iso(at(2026, 10, 18, 15)), NOW)).toBe('4 days ago');
      expect(note({ error: 'network' })).toBe(NETWORK_NOTE + UPD_5);
      expect(note({ error: 'network', nowMs: NOW + 10 * MIN })).toBe(
        'Showing saved requests · updated 15 min ago',
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

// ─── DD4.8: freshnessNote over visible entries ───────────────────────────────

describe('DD4.8 — freshnessNote with entries, updated 5 min ago', () => {
  it("'network' → 'Showing saved requests · updated 5 min ago'", () => {
    expect(note({ error: 'network' })).toBe('Showing saved requests · updated 5 min ago');
  });

  it.each([null, AUTH_LOGIN_LATCHED, SERVER_CODE])(
    "'auth' with errorCode %j → the neutral sign-in note, with the updated suffix",
    (errorCode) => {
      expect(note({ error: 'auth', errorCode })).toBe(
        "Can't sign in to Crossover right now · showing saved requests · updated 5 min ago",
      );
    },
  );

  it("'auth' with NO_CREDENTIALS → the Settings pointer, with no updated suffix", () => {
    expect(note({ error: 'auth', errorCode: NO_CREDENTIALS })).toBe(
      'Saved sign-in missing · showing saved requests · sign out and back in from Settings',
    );
    expect(note({ error: 'auth', errorCode: NO_CREDENTIALS, updatedAt: null })).toBe(MISSING_NOTE);
  });

  it("no error with stale dates → \"Some days couldn't refresh · updated 5 min ago\"", () => {
    expect(note({ staleDates: STALE })).toBe("Some days couldn't refresh · updated 5 min ago");
    expect(note({ staleDates: ['2026-10-20', '2026-10-13'] })).toBe(STALE_NOTE + UPD_5);
  });

  it.each([
    ['network', null, NETWORK_NOTE + UPD_5],
    ['auth', null, AUTH_NOTE + UPD_5],
    ['auth', AUTH_LOGIN_LATCHED, AUTH_NOTE + UPD_5],
    ['auth', NO_CREDENTIALS, MISSING_NOTE],
  ] as const)('an error wins over stale dates: %j with errorCode %j → the error note', (error, errorCode, expected) => {
    expect(note({ error, errorCode, staleDates: STALE })).toBe(expected);
  });

  it('the updated suffix is formatUpdatedAgo(updatedAt, nowMs)', () => {
    expect(note({ error: 'network', updatedAt: ago(3 * HOUR) })).toBe(
      'Showing saved requests · updated 3 h ago',
    );
    expect(note({ staleDates: STALE, updatedAt: iso(at(2026, 10, 21, 13)) })).toBe(
      "Some days couldn't refresh · updated yesterday",
    );
    expect(note({ error: 'auth', updatedAt: iso(NOW + 5 * MIN) })).toBe(
      AUTH_NOTE + ' · updated just now',
    );
  });
});

// ─── DD4.9: freshnessNote edges ──────────────────────────────────────────────

describe('DD4.9 — freshnessNote edges', () => {
  it("updatedAt null with 'network' → 'Showing saved requests', with no ' · updated'", () => {
    const text = note({ error: 'network', updatedAt: null });
    expect(text).toBe('Showing saved requests');
    expect(text).not.toContain(' · updated');
  });

  it.each([null, undefined, 'not-a-date'])(
    'updatedAt %j drops the suffix from every note that carries one',
    (updatedAt) => {
      expect(note({ error: 'network', updatedAt })).toBe(NETWORK_NOTE);
      expect(note({ error: 'auth', updatedAt })).toBe(AUTH_NOTE);
      expect(note({ error: 'auth', errorCode: AUTH_LOGIN_LATCHED, updatedAt })).toBe(AUTH_NOTE);
      expect(note({ staleDates: STALE, updatedAt })).toBe(STALE_NOTE);
    },
  );

  it.each([
    [null, null, []],
    [null, null, STALE],
    ['network', null, []],
    ['network', null, STALE],
    ['auth', null, []],
    ['auth', AUTH_LOGIN_LATCHED, STALE],
    ['auth', NO_CREDENTIALS, []],
  ] as const)('hasEntries false → null (error %j, errorCode %j, staleDates %j)', (error, errorCode, staleDates) => {
    expect(note({ hasEntries: false, error, errorCode, staleDates: [...staleDates] })).toBeNull();
  });

  it.each([
    ['5 min old', UPDATED_5_MIN],
    ['4 days old', iso(at(2026, 10, 18, 15))],
    ['missing', null],
  ])('no error and no stale dates → null, whatever the age (updatedAt %s)', (_label, updatedAt) => {
    expect(note({ updatedAt })).toBeNull();
  });
});

// ─── DD4.10: requestsBannerText ──────────────────────────────────────────────

describe('DD4.10 — requestsBannerText (nothing visible)', () => {
  it("('network', null) → 'Could not load requests.'", () => {
    expect(requestsBannerText('network', null)).toBe('Could not load requests.');
  });

  it.each([null, AUTH_LOGIN_LATCHED, SERVER_CODE])("('auth', %j) → the neutral sentence", (errorCode) => {
    expect(requestsBannerText('auth', errorCode)).toBe(
      "Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings.",
    );
  });

  it("('auth', NO_CREDENTIALS) → 'Your saved sign-in is missing. Sign out and back in from Settings.'", () => {
    expect(requestsBannerText('auth', NO_CREDENTIALS)).toBe(
      'Your saved sign-in is missing. Sign out and back in from Settings.',
    );
  });
});

// ─── DD4.11: requestsErrorRetryable ──────────────────────────────────────────

describe('DD4.11 — requestsErrorRetryable (Retry only when it can help)', () => {
  it.each([
    ['auth', NO_CREDENTIALS, false],
    ['auth', null, true],
    ['auth', AUTH_LOGIN_LATCHED, true],
    ['auth', SERVER_CODE, true],
    ['network', null, true],
    [null, null, false],
    [null, NO_CREDENTIALS, false],
  ] as const)('(%j, %j) → %s', (error, errorCode, expected) => {
    expect(requestsErrorRetryable(error, errorCode)).toBe(expected);
  });
});

// ─── C2: only 'auth' reads errorCode ─────────────────────────────────────────

describe("FR2 — errorCode only changes the copy for 'auth'", () => {
  it("'network' with NO_CREDENTIALS keeps the network note, banner and Retry", () => {
    expect(note({ error: 'network', errorCode: NO_CREDENTIALS })).toBe(NETWORK_NOTE + UPD_5);
    expect(requestsBannerText('network', NO_CREDENTIALS)).toBe(NETWORK_BANNER);
    expect(requestsErrorRetryable('network', NO_CREDENTIALS)).toBe(true);
  });

  it('with no error, an errorCode changes nothing: the stale note, or no note', () => {
    expect(note({ errorCode: NO_CREDENTIALS, staleDates: STALE })).toBe(STALE_NOTE + UPD_5);
    expect(note({ errorCode: NO_CREDENTIALS })).toBeNull();
  });
});

// ─── DD4.12: myRequestsEmptyState ────────────────────────────────────────────

describe('DD4.12 — myRequestsEmptyState (C3, C4)', () => {
  it.each<[NoteInput['error'], string[], MyRequestsEmptyState]>([
    ['network', [], 'error'],
    ['auth', STALE, 'error'],
    ['auth', [], 'error'],
    ['network', STALE, 'error'],
    [null, STALE, 'incomplete'],
    [null, ['2026-10-20', '2026-10-13'], 'incomplete'],
    [null, [], 'none'],
  ])('(%j, %j) → %j', (error, staleDates, expected) => {
    expect(myRequestsEmptyState(error, staleDates)).toBe(expected);
  });

  it('INCOMPLETE_EMPTY_TEXT is the honest incomplete copy, not "No requests yet"', () => {
    expect(INCOMPLETE_EMPTY_TEXT).toBe("Some days couldn't refresh, so requests may be missing.");
  });
});

// ─── DD4.13: copy guard ──────────────────────────────────────────────────────

describe('DD4.13 — copy guard: no message says re-open or mentions a password', () => {
  const ERRORS = [null, 'network', 'auth'] as const;
  const CODES = [null, NO_CREDENTIALS, AUTH_LOGIN_LATCHED, SERVER_CODE];
  const STALES = [[], STALE];
  const UPDATED = [UPDATED_5_MIN, null];

  // Built lazily, inside the tests, so a missing export fails the case instead of the suite.
  const allNotes = () =>
    [true, false].flatMap((hasEntries) =>
      ERRORS.flatMap((error) =>
        CODES.flatMap((errorCode) =>
          STALES.flatMap((staleDates) =>
            UPDATED.map((updatedAt) => note({ hasEntries, error, errorCode, staleDates, updatedAt })),
          ),
        ),
      ),
    ).filter((text): text is string => text !== null);
  const allBanners = () =>
    (['network', 'auth'] as const).flatMap((error) => CODES.map((code) => requestsBannerText(error, code)));
  const allAgos = () =>
    [30 * SEC, 5 * MIN, 3 * HOUR, 26 * HOUR, 4 * 24 * HOUR, -5 * MIN].map((ms) => formatUpdatedAgo(ago(ms), NOW));
  const allCopy = () => [...allNotes(), ...allBanners(), ...allAgos(), INCOMPLETE_EMPTY_TEXT];

  const distinct = (texts: string[]) => [...new Set(texts)].sort();

  it('the error × errorCode × stale × updatedAt matrix reaches every note and banner (the guard is not vacuous)', () => {
    expect(distinct(allNotes())).toEqual(
      distinct([
        NETWORK_NOTE + UPD_5,
        NETWORK_NOTE,
        AUTH_NOTE + UPD_5,
        AUTH_NOTE,
        MISSING_NOTE,
        STALE_NOTE + UPD_5,
        STALE_NOTE,
      ]),
    );
    expect(distinct(allBanners())).toEqual(distinct([NETWORK_BANNER, AUTH_BANNER, MISSING_BANNER]));
  });

  it.each([/re-?open/i, /password/i])('no returned string, nor INCOMPLETE_EMPTY_TEXT, matches %s', (pattern) => {
    const copy = allCopy();
    // Every item is real copy, so a stubbed or missing message cannot pass the guard
    // (toStrictEqual: toEqual would treat [undefined] as []).
    expect(copy.filter((text) => typeof text !== 'string' || text === '')).toStrictEqual([]);
    expect(copy.filter((text) => pattern.test(text))).toStrictEqual([]);
  });

  it('requestRows.ts code (comments stripped) holds neither phrase, so no untested branch can return it', () => {
    const code = codeOf(ROWS_FILE);
    expect(code).not.toMatch(/re-?open/i);
    expect(code).not.toMatch(/password/i);
  });
});

// ─── FR2 static check: one NO_CREDENTIALS ────────────────────────────────────

describe('FR2 — NO_CREDENTIALS comes from src/api/errors', () => {
  it('requestRows.ts imports NO_CREDENTIALS and never re-declares it as a literal', () => {
    const code = codeOf(ROWS_FILE);
    expect(code).toMatch(
      /import\s*\{[^}]*\bNO_CREDENTIALS\b[^}]*\}\s*from\s*['"](?:\.\.\/api\/errors|@\/src\/api\/errors)['"]/,
    );
    expect(code).not.toMatch(/['"`]NO_CREDENTIALS['"`]/);
  });
});
