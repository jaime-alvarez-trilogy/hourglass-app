// Tests: PayDaysCard — 1.2 WorkSmart dashboard parity, home-screen pay-day card
//
// Strategy:
//   - Runtime render (react-test-renderer) of the live-shaped PAY_DAYS_RAW fixture and of
//     edge cases (empty, null amount, Paychex, LATE / NO_PAY, missing server today)
//   - Source-file static analysis for design-token compliance
//   - Collapsible (1.2): no onToggle renders as before (collapsed ignored); with onToggle
//     the header is the toggle (role, expanded state, label), collapsed = PAY DAYS + one
//     summary line of the NEXT card (else the first), expanded = every row
//
// NOTE on NativeWind v4 + test-renderer: className is transformed to hashed IDs in
// Jest/node, so token assertions read the source file (fs.readFileSync).

import React from 'react';
import { create, act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';
import PayDaysCard from '../PayDaysCard';
import { normalizePayDays, type PayDayCard, type PayDays } from '@/src/lib/hoursOverview';
import { PAY_DAYS_RAW } from '@/src/__fixtures__/hoursOverview';

// Card delegates to GlassCard (Skia) — mock to a pass-through to avoid the canvas dependency.
// The mock still receives Card's props (testID), so they stay queryable on its instance.
jest.mock('@/src/components/GlassCard', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode; testID?: string }) => children,
}));

// The collapse toggle's chevron: @expo/vector-icons' font loading crashes jest-expo/node.
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const CARD_FILE = path.resolve(__dirname, '../PayDaysCard.tsx');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FIXTURE: PayDays = normalizePayDays(PAY_DAYS_RAW)!;

function makeCard(overrides: Partial<PayDayCard> = {}): PayDayCard {
  return {
    payDate: '2026-10-28',
    dueDate: '2026-10-28',
    state: 'NEXT',
    weekStart: '2026-10-12',
    weekEnd: '2026-10-18',
    amount: 2000,
    amountKind: 'ESTIMATE',
    platform: 'PAYONEER',
    salaryUnit: 'HOUR',
    noPayReason: null,
    thisWeek: false,
    nextWeek: false,
    ...overrides,
  };
}

function render(props: React.ComponentProps<typeof PayDaysCard>): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(React.createElement(PayDaysCard, props));
  });
  return tree!;
}

/** Every rendered string leaf, depth-first in render order. */
function texts(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const children = (node as { children?: unknown }).children;
    if (children) walk(children);
  };
  walk(tree.toJSON());
  return out;
}

// ─── Live-shaped fixture ──────────────────────────────────────────────────────

describe('PayDaysCard — PAY_DAYS_RAW render (today 2026-10-25)', () => {
  it('renders the section header', () => {
    expect(texts(render({ payDays: FIXTURE }))).toContain('PAY DAYS');
  });

  it('renders the three state lines in server order', () => {
    const t = texts(render({ payDays: FIXTURE }));
    const paid = t.indexOf('PAID · 4 DAYS AGO');
    const next = t.indexOf('NEXT PAY DAY · IN 3 DAYS');
    const later = t.indexOf('IN 10 DAYS');
    expect(paid).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(paid);
    expect(later).toBeGreaterThan(next);
  });

  it('renders the amounts with their kind words', () => {
    const t = texts(render({ payDays: FIXTURE }));
    expect(t.filter((s) => s === '$1,600.00')).toHaveLength(3);
    expect(t).toContain('about');
    expect(t).toContain('so far');
    expect(t).not.toContain('before tax');
  });

  it('renders the work weeks and the "this week" chip once', () => {
    const t = texts(render({ payDays: FIXTURE }));
    expect(t).toContain('for work 5 – 11 Oct');
    expect(t).toContain('for work 12 – 18 Oct');
    expect(t).toContain('for work 19 – 25 Oct');
    expect(t.filter((s) => s === 'this week')).toHaveLength(1);
  });

  it('renders the calendar tiles', () => {
    const t = texts(render({ payDays: FIXTURE }));
    expect(t).toEqual(expect.arrayContaining(['OCT', '21', '28', 'NOV', '4', 'WED']));
    expect(t.filter((s) => s === 'WED')).toHaveLength(3);
  });

  it('marks only the PAID tile with a check badge', () => {
    const tree = render({ payDays: FIXTURE });
    const checks = tree.root.findAll((n) => n.props.testID === 'pay-day-paid-check');
    expect(checks.length).toBeGreaterThan(0);
    expect(texts(tree).filter((s) => s === '✓')).toHaveLength(1);
  });

  it('labels each row for accessibility', () => {
    const tree = render({ payDays: FIXTURE });
    const labels = tree.root
      .findAll((n) => typeof n.props.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string);
    expect(labels).toContain(
      'NOV 4, IN 10 DAYS, $1,600.00 so far, for work 19 – 25 Oct, this week',
    );
  });

  it('passes testID to the card', () => {
    const tree = render({ payDays: FIXTURE, testID: 'pay-days' });
    expect(tree.root.findAll((n) => n.props.testID === 'pay-days').length).toBeGreaterThan(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('PayDaysCard — edge cases', () => {
  it('returns null when there are no cards', () => {
    expect(render({ payDays: { today: '2026-10-25', cards: [] } }).toJSON()).toBeNull();
  });

  it('counts from the UTC date of `now` when the server sent no today', () => {
    const payDays = { today: null, cards: [makeCard({ payDate: '2026-10-28' })] };
    // 22:00 on the 26th in UTC-7 is the 27th in UTC → tomorrow
    const t = texts(render({ payDays, now: new Date('2026-10-27T05:00:00Z') }));
    expect(t).toContain('NEXT PAY DAY · TOMORROW');
  });

  it('prefers the server today over `now`', () => {
    const t = texts(render({ payDays: FIXTURE, now: new Date('2026-12-01T12:00:00Z') }));
    expect(t).toContain('PAID · 4 DAYS AGO');
  });

  it('shows "—" for a missing amount and "before tax" for Paychex', () => {
    const payDays = {
      today: '2026-10-25',
      cards: [
        makeCard({ amount: null, amountKind: 'NONE' }),
        makeCard({ payDate: '2026-11-04', state: 'LATER', amountKind: 'FINAL', platform: 'PAYCHEX' }),
      ],
    };
    const t = texts(render({ payDays }));
    expect(t).toContain('—');
    expect(t).toContain('$2,000.00');
    expect(t.filter((s) => s === 'before tax')).toHaveLength(1);
  });

  it('renders LATE and NO_PAY states', () => {
    const payDays = {
      today: '2026-10-25',
      cards: [
        makeCard({ payDate: '2026-10-21', state: 'LATE', amountKind: 'FINAL' }),
        makeCard({ state: 'NO_PAY', amount: null, amountKind: 'NONE', noPayReason: 'NO_HOURS_YET' }),
      ],
    };
    const t = texts(render({ payDays }));
    expect(t).toContain('LATE');
    expect(t).toContain('NO PAY · no hours yet');
    expect(t).not.toContain('✓');
  });

  it('uses the cross-month work-week label', () => {
    const payDays = {
      today: '2026-10-25',
      cards: [makeCard({ weekStart: '2026-09-28', weekEnd: '2026-10-04' })],
    };
    expect(texts(render({ payDays }))).toContain('for work 28 Sep – 4 Oct');
  });
});

// ─── Design tokens (source analysis) ──────────────────────────────────────────

describe('PayDaysCard — design tokens', () => {
  const source = fs.readFileSync(CARD_FILE, 'utf8');

  it('uses a gold border accent (earnings card, §1.4)', () => {
    expect(source).toMatch(/borderAccentColor=\{colors\.gold\}/);
  });

  it('renders amounts in gold with tabular nums', () => {
    expect(source).toMatch(/'text-gold'/);
    expect(source).toMatch(/tabular-nums/);
  });

  it('colours the state line per state', () => {
    expect(source).toMatch(/success:\s+'text-success'/);
    expect(source).toMatch(/critical:\s+'text-critical'/);
  });

  it('has no raw hex colours', () => {
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('has no animation', () => {
    expect(source).not.toMatch(/react-native-reanimated|Animated\./);
  });
});

// ─── Collapsible (1.2) ────────────────────────────────────────────────────────

function byTestID(tree: ReactTestRenderer, id: string): ReactTestInstance[] {
  return tree.root.findAll((n) => n.props.testID === id);
}

function rowCount(tree: ReactTestRenderer): number {
  const ids = new Set(
    tree.root
      .findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('pay-day-row-'))
      .map((n) => n.props.testID as string),
  );
  return ids.size;
}

function leafText(node: ReactTestInstance | string): string {
  return typeof node === 'string' ? node : node.children.map(leafText).join('');
}

function summaryText(tree: ReactTestRenderer): string {
  const [node] = byTestID(tree, 'pay-days-summary');
  if (!node) throw new Error('no pay-days-summary');
  return leafText(node);
}

function toggleOf(tree: ReactTestRenderer): ReactTestInstance {
  const [toggle] = tree.root.findAll(
    (n) => n.props.testID === 'pay-days-toggle' && typeof n.props.onPress === 'function',
  );
  if (!toggle) throw new Error('no pay-days-toggle');
  return toggle;
}

const PAID = makeCard({ payDate: '2026-10-21', state: 'PAID', amount: 1500, amountKind: 'FINAL' });
const NEXT = makeCard({ payDate: '2026-10-28', state: 'NEXT' });
const LATER = makeCard({ payDate: '2026-11-04', state: 'LATER', amountKind: 'SO_FAR', thisWeek: true });

describe('PayDaysCard — without onToggle (back-compat)', () => {
  it('has no toggle, no chevron and no summary', () => {
    const tree = render({ payDays: FIXTURE });
    expect(byTestID(tree, 'pay-days-toggle')).toHaveLength(0);
    expect(byTestID(tree, 'pay-days-summary')).toHaveLength(0);
    expect(tree.root.findAll((n) => (n.type as unknown) === 'Ionicons')).toHaveLength(0);
  });

  it('ignores collapsed: renders exactly the default card', () => {
    const plain = render({ payDays: FIXTURE });
    const collapsed = render({ payDays: FIXTURE, collapsed: true });
    expect(JSON.stringify(collapsed.toJSON())).toBe(JSON.stringify(plain.toJSON()));
    expect(rowCount(collapsed)).toBe(3);
  });
});

describe('PayDaysCard — with onToggle', () => {
  it('expanded: PAY DAYS + every row, no summary', () => {
    const tree = render({ payDays: FIXTURE, collapsed: false, onToggle: () => {} });
    const t = texts(tree);
    expect(t).toContain('PAY DAYS');
    expect(rowCount(tree)).toBe(3);
    expect(t).toContain('NEXT PAY DAY · IN 3 DAYS');
    expect(t).toContain('for work 19 – 25 Oct');
    expect(byTestID(tree, 'pay-days-summary')).toHaveLength(0);
  });

  it('collapsed: PAY DAYS + one summary line of the NEXT card, no rows', () => {
    const tree = render({ payDays: FIXTURE, collapsed: true, onToggle: () => {} });
    const t = texts(tree);
    expect(t).toContain('PAY DAYS');
    expect(summaryText(tree)).toBe('Next pay day · in 3 days · about $1,600.00');
    expect(rowCount(tree)).toBe(0);
    expect(t).not.toContain('PAID · 4 DAYS AGO');
    expect(t).not.toContain('for work 12 – 18 Oct');
    expect(t).not.toContain('OCT');
  });

  it('summary picks the NEXT card wherever it sits', () => {
    const payDays = { today: '2026-10-25', cards: [LATER, PAID, NEXT] };
    const tree = render({ payDays, collapsed: true, onToggle: () => {} });
    expect(summaryText(tree)).toBe('Next pay day · in 3 days · about $2,000.00');
  });

  it('summary falls back to the first card without a NEXT one', () => {
    const payDays = { today: '2026-10-25', cards: [PAID, LATER] };
    const tree = render({ payDays, collapsed: true, onToggle: () => {} });
    expect(summaryText(tree)).toBe('Paid · 4 days ago · $1,500.00');
  });

  it('summary keeps the amount words and drops a missing amount', () => {
    const soFar = render({
      payDays: { today: '2026-10-25', cards: [makeCard({ state: 'LATER', amountKind: 'SO_FAR', platform: 'PAYCHEX' })] },
      collapsed: true,
      onToggle: () => {},
    });
    expect(summaryText(soFar)).toBe('In 3 days · $2,000.00 so far before tax');

    const none = render({
      payDays: { today: '2026-10-25', cards: [makeCard({ amount: null, amountKind: 'NONE' })] },
      collapsed: true,
      onToggle: () => {},
    });
    expect(summaryText(none)).toBe('Next pay day · in 3 days');
  });

  it('the summary sits inside the toggle, with a chevron', () => {
    const toggle = toggleOf(render({ payDays: FIXTURE, collapsed: true, onToggle: () => {} }));
    expect(toggle.findAll((n) => n.props.testID === 'pay-days-summary').length).toBeGreaterThan(0);
    expect(toggle.findAll((n) => (n.type as unknown) === 'Ionicons')).toHaveLength(1);
  });

  it('a press calls onToggle', () => {
    const onToggle = jest.fn();
    const tree = render({ payDays: FIXTURE, collapsed: true, onToggle });
    act(() => toggleOf(tree).props.onPress());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('accessibility: a button with its expanded state and the summary in its label', () => {
    const collapsed = toggleOf(render({ payDays: FIXTURE, collapsed: true, onToggle: () => {} }));
    expect(collapsed.props.accessibilityRole).toBe('button');
    expect(collapsed.props.accessibilityState).toEqual({ expanded: false });
    expect(collapsed.props.accessibilityLabel).toBe(
      'Pay days, next pay day, in 3 days, about $1,600.00. Show details',
    );

    const expanded = toggleOf(render({ payDays: FIXTURE, collapsed: false, onToggle: () => {} }));
    expect(expanded.props.accessibilityState).toEqual({ expanded: true });
    expect(expanded.props.accessibilityLabel).toBe(
      'Pay days, next pay day, in 3 days, about $1,600.00. Hide details',
    );
  });

  it('still returns null with no cards', () => {
    const tree = render({ payDays: { today: '2026-10-25', cards: [] }, collapsed: true, onToggle: () => {} });
    expect(tree.toJSON()).toBeNull();
  });
});
