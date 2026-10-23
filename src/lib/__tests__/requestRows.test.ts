// Tests: requestRows — features/app/durable-data spec 04-requests-history-ui FR1 (DD4.1-DD4.6)
// The pure My Requests row builder: three bounded recent buckets ("This Week", "Last Week",
// "2 Weeks Ago" = prevMonday2 <= date < prevMonday1), then one older-toggle row for
// everything earlier. Expanded, the toggle is followed by month groups ("September 2026"),
// newest month first, with malformed dates under "Other dates" last (C11, C12). Plus
// monthLabel, and the FR1 static check that approvals.tsx imports the builder instead of
// defining its own.
//
// No mocks and no clock: the bounds are fixed (currentMonday 2026-10-19, a Monday) and
// every expected row list is written out in full, so each case pins the exact output. The
// first-of-month cases only catch a `new Date('YYYY-MM-DD')` (UTC) month read when run west
// of UTC, e.g. `TZ=America/Los_Angeles npx jest src/lib/__tests__/requestRows.test.ts`.

import * as fs from 'fs';
import * as path from 'path';
import { stripComments } from '../../../__tests__/helpers/stripComments';
import { buildMyRequestRows, monthLabel } from '../requestRows';
import type { MyRequestRow, RequestRowBounds } from '../requestRows';
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
