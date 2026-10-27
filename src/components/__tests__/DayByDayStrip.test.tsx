// Tests: DayByDayStrip — 1.2 WorkSmart dashboard parity (THIS WEEK, day by day)
//
//   SC1 — renders 7 flex-1 columns with the day labels, Mon → Sun
//   SC2 — billable value per day via formatMinutes; future days show "–"
//   SC3 — approved-manual line (violet) only where manualHours > 0
//   SC4 — pending line (muted violet, "+") only where pendingHours > 0
//   SC5 — today's day label is textPrimary + semibold; other days textMuted
//   SC6 — legend only when showLegend and some day has manual or pending time
//   SC7 — accessibilityLabel spells out the values; testID prefix
//
// Strategy: react-test-renderer (same as DailyAIRow / AppBreakdownCard); the days come from
// the live-shaped HOURS_OVERVIEW_RAW fixture (week of Mon 2026-10-19, today = Sun 10-25).

import React from 'react';
import { create, act } from 'react-test-renderer';
import DayByDayStrip from '../DayByDayStrip';
import type { DailyHours } from '../WeeklyBarChart';
import { HOURS_OVERVIEW_RAW } from '@/src/__fixtures__/hoursOverview';
import { normalizeHoursOverview } from '@/src/lib/hoursOverview';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The fixture week as index.tsx builds it: hours = billable, manual/pending split out. */
function fixtureWeek(): DailyHours[] {
  const overview = normalizeHoursOverview(HOURS_OVERVIEW_RAW);
  if (!overview) throw new Error('fixture did not parse');
  return overview.days.map((d, i) => ({
    day: DAY_NAMES[i],
    hours: d.billable / 60,
    isToday: d.date === overview.today,
    isFuture: d.future,
    manualHours: d.manualApproved / 60,
    pendingHours: d.manualPending / 60,
  }));
}

/** Mon–Wed worked (Wed = today), Thu–Sun future; no manual fields at all. */
const PLAIN_WEEK: DailyHours[] = [
  { day: 'Mon', hours: 7.5, isToday: false, isFuture: false },
  { day: 'Tue', hours: 8, isToday: false, isFuture: false },
  { day: 'Wed', hours: 6.5, isToday: true, isFuture: false },
  { day: 'Thu', hours: 0, isToday: false, isFuture: true },
  { day: 'Fri', hours: 0, isToday: false, isFuture: true },
  { day: 'Sat', hours: 0, isToday: false, isFuture: true },
  { day: 'Sun', hours: 0, isToday: false, isFuture: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function render(props: { days: DailyHours[]; showLegend?: boolean; testID?: string }) {
  let tree: any;
  act(() => {
    tree = create(React.createElement(DayByDayStrip, props));
  });
  return tree;
}

/** Composite instances carrying the testID (the host node maps it to data-testid). */
function byTestID(tree: any, id: string): any[] {
  return tree.root.findAll((n: any) => typeof n.type !== 'string' && n.props.testID === id);
}

function textOf(node: any): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(textOf).join('');
}

function textByTestID(tree: any, id: string): string | null {
  const [node] = byTestID(tree, id);
  return node ? textOf(node) : null;
}

const P = 'day-by-day-strip';

// ─── SC1: columns ─────────────────────────────────────────────────────────────

describe('DayByDayStrip — SC1: seven columns', () => {
  it('SC1.1 — renders exactly 7 columns', () => {
    const tree = render({ days: fixtureWeek() });
    const ids = new Set(
      tree.root
        .findAll((n: any) => typeof n.props.testID === 'string' && /-col-\d+$/.test(n.props.testID))
        .map((n: any) => n.props.testID),
    );
    expect(ids.size).toBe(7);
  });

  it('SC1.2 — every column is flex-1 so it sits under its chart bar', () => {
    const tree = render({ days: fixtureWeek() });
    for (let i = 0; i < 7; i++) {
      expect(byTestID(tree, `${P}-col-${i}`)[0].props.className).toMatch(/\bflex-1\b/);
    }
  });

  it('SC1.3 — day labels Mon → Sun in order', () => {
    const tree = render({ days: fixtureWeek() });
    expect(DAY_NAMES.map((_, i) => textByTestID(tree, `${P}-day-${i}`))).toEqual(DAY_NAMES);
  });
});

// ─── SC2: billable values ─────────────────────────────────────────────────────

describe('DayByDayStrip — SC2: billable value per day', () => {
  it('SC2.1 — fixture week reads like the WorkSmart grid', () => {
    const tree = render({ days: fixtureWeek() });
    expect(DAY_NAMES.map((_, i) => textByTestID(tree, `${P}-value-${i}`))).toEqual([
      '8h 40m', '7h 30m', '7h 40m', '9h', '4h 40m', '0', '2h 40m',
    ]);
  });

  it('SC2.2 — future days show "–"', () => {
    const tree = render({ days: PLAIN_WEEK });
    for (let i = 3; i < 7; i++) expect(textByTestID(tree, `${P}-value-${i}`)).toBe('–');
    expect(textByTestID(tree, `${P}-value-0`)).toBe('7h 30m');
    expect(textByTestID(tree, `${P}-value-2`)).toBe('6h 30m');
  });

  it('SC2.3 — values are tabular and single-line', () => {
    const tree = render({ days: PLAIN_WEEK });
    const value = byTestID(tree, `${P}-value-0`)[0];
    expect(value.props.style).toEqual({ fontVariant: ['tabular-nums'] });
    expect(value.props.numberOfLines).toBe(1);
  });
});

// ─── SC3 / SC4: manual and pending lines ──────────────────────────────────────

describe('DayByDayStrip — SC3/SC4: manual and pending lines', () => {
  it('SC3.1 — manual line only on days with approved manual time', () => {
    const tree = render({ days: fixtureWeek() });
    // Mon 3h, Wed 1h 50m, Thu 1h 10m, Fri 50m; Tue, Sat, Sun have none
    expect(DAY_NAMES.map((_, i) => textByTestID(tree, `${P}-manual-${i}`))).toEqual([
      '3h', null, '1h 50m', '1h 10m', '50m', null, null,
    ]);
  });

  it('SC3.2 — manual line is violet', () => {
    const tree = render({ days: fixtureWeek() });
    expect(byTestID(tree, `${P}-manual-0`)[0].props.className).toMatch(/\btext-violet\b(?!\/)/);
  });

  it('SC4.1 — pending line only on days with pending time, prefixed "+"', () => {
    const tree = render({ days: fixtureWeek() });
    expect(DAY_NAMES.map((_, i) => textByTestID(tree, `${P}-pending-${i}`))).toEqual([
      null, null, null, null, '+1h 50m', null, '+20m',
    ]);
  });

  it('SC4.2 — pending line is muted violet', () => {
    const tree = render({ days: fixtureWeek() });
    expect(byTestID(tree, `${P}-pending-6`)[0].props.className).toContain('text-violet/60');
  });

  it('SC3.3 — no manual/pending lines when the fields are absent', () => {
    const tree = render({ days: PLAIN_WEEK });
    for (let i = 0; i < 7; i++) {
      expect(byTestID(tree, `${P}-manual-${i}`)).toHaveLength(0);
      expect(byTestID(tree, `${P}-pending-${i}`)).toHaveLength(0);
    }
  });

  it('SC3.4 — zero, negative, NaN and sub-minute values draw no line', () => {
    const days = PLAIN_WEEK.map((d, i) => ({
      ...d,
      manualHours: [0, -1, NaN, 0.004, 0, 0, 0][i],
      pendingHours: [0, -0.5, NaN, 0.004, 0, 0, 0][i],
    }));
    const tree = render({ days });
    for (let i = 0; i < 7; i++) {
      expect(byTestID(tree, `${P}-manual-${i}`)).toHaveLength(0);
      expect(byTestID(tree, `${P}-pending-${i}`)).toHaveLength(0);
    }
  });

  it('SC3.5 — a future day shows only "–", even if it carries manual/pending', () => {
    const days = PLAIN_WEEK.map((d, i) => (i === 4 ? { ...d, manualHours: 1, pendingHours: 1 } : d));
    const tree = render({ days });
    expect(textByTestID(tree, `${P}-value-4`)).toBe('–');
    expect(byTestID(tree, `${P}-manual-4`)).toHaveLength(0);
    expect(byTestID(tree, `${P}-pending-4`)).toHaveLength(0);
  });
});

// ─── SC5: today highlight ─────────────────────────────────────────────────────

describe('DayByDayStrip — SC5: today highlight', () => {
  it('SC5.1 — today label is textPrimary + semibold', () => {
    const tree = render({ days: PLAIN_WEEK });
    const cls = byTestID(tree, `${P}-day-2`)[0].props.className;
    expect(cls).toContain('text-textPrimary');
    expect(cls).toContain('font-sans-semibold');
    expect(cls).toMatch(/\btext-xs\b/);
  });

  it('SC5.2 — other day labels are textMuted, regular weight', () => {
    const tree = render({ days: PLAIN_WEEK });
    for (const i of [0, 1, 3, 6]) {
      const cls = byTestID(tree, `${P}-day-${i}`)[0].props.className;
      expect(cls).toContain('text-textMuted');
      expect(cls).not.toContain('font-sans-semibold');
    }
  });

  it('SC5.3 — no label is highlighted when no day is today', () => {
    const days = PLAIN_WEEK.map((d) => ({ ...d, isToday: false }));
    const tree = render({ days });
    for (let i = 0; i < 7; i++) {
      expect(byTestID(tree, `${P}-day-${i}`)[0].props.className).not.toContain('text-textPrimary');
    }
  });
});

// ─── SC6: legend ──────────────────────────────────────────────────────────────

describe('DayByDayStrip — SC6: legend', () => {
  it('SC6.1 — shown with showLegend when a day has manual or pending time', () => {
    const tree = render({ days: fixtureWeek(), showLegend: true });
    expect(byTestID(tree, `${P}-legend`)).not.toHaveLength(0);
    const legend = textByTestID(tree, `${P}-legend`);
    expect(legend).toContain('Tracked');
    expect(legend).toContain('Manual');
    expect(legend).toContain('Pending');
  });

  it('SC6.2 — hidden without showLegend (default false)', () => {
    const tree = render({ days: fixtureWeek() });
    expect(byTestID(tree, `${P}-legend`)).toHaveLength(0);
  });

  it('SC6.3 — hidden with showLegend when no day has manual or pending time', () => {
    const tree = render({ days: PLAIN_WEEK, showLegend: true });
    expect(byTestID(tree, `${P}-legend`)).toHaveLength(0);
  });

  it('SC6.4 — pending alone is enough to show it', () => {
    const days = PLAIN_WEEK.map((d, i) => (i === 2 ? { ...d, pendingHours: 0.5 } : d));
    const tree = render({ days, showLegend: true });
    expect(byTestID(tree, `${P}-legend`)).not.toHaveLength(0);
  });
});

// ─── SC7: accessibility + testID ──────────────────────────────────────────────

describe('DayByDayStrip — SC7: accessibility and testID', () => {
  it('SC7.1 — column label spells out billable, manual and pending', () => {
    const tree = render({ days: fixtureWeek() });
    expect(byTestID(tree, `${P}-col-0`)[0].props.accessibilityLabel).toBe(
      'Mon, 8 hours 40 minutes, 3 hours manual',
    );
    expect(byTestID(tree, `${P}-col-6`)[0].props.accessibilityLabel).toBe(
      'Sun, today, 2 hours 40 minutes, 20 minutes pending approval',
    );
  });

  it('SC7.2 — future column reads as upcoming', () => {
    const tree = render({ days: PLAIN_WEEK });
    expect(byTestID(tree, `${P}-col-5`)[0].props.accessibilityLabel).toBe('Sat, upcoming');
  });

  it('SC7.3 — custom testID prefixes every node', () => {
    const tree = render({ days: fixtureWeek(), showLegend: true, testID: 'week-strip' });
    expect(byTestID(tree, 'week-strip')).not.toHaveLength(0);
    expect(byTestID(tree, 'week-strip-col-0')).not.toHaveLength(0);
    expect(byTestID(tree, 'week-strip-legend')).not.toHaveLength(0);
    expect(byTestID(tree, P)).toHaveLength(0);
  });
});
