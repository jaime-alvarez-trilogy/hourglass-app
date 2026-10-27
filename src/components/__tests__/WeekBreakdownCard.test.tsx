// Tests: WeekBreakdownCard — 1.2 WorkSmart dashboard parity (breakdown card)
//
// Pure helpers
//   formatWeekRange — Mon–Sun UTC range, month/year spans, invalid input → ""
//   breakdownStatus — left / over · not approved (hourly only) / Limit reached / none
//   limitCaption    — "of your 40h weekly limit" (+ approved OT)
//   breakdownBar    — scale = max(limit + OT, billable + pending) × 1.08, limit marker inside
//   breakdownGroups — BILLABLE / NOT BILLABLE / LIMIT rows, zero rows muted, "None" values
//
// Render (react-test-renderer)
//   header (PAY WEEK + UTC range: the card is the UTC pay week, not the local week the hero
//   shows), status + caption, bar segments + limit marker, rows and values, pending
//   footnote shown / hidden, testID pass-through
//
// Collapsible (1.2) — no onToggle renders as before (collapsed ignored); with onToggle the
//   header is the toggle (role, expanded state, label with the status), collapsed hides the
//   bar / legend / rows / footnote but keeps the header + status + caption, press → onToggle
//
// Source contract — no Skia, no Reanimated (no entry/focus animations)
//
// Fixture: the requested week (last weeks[] entry, 2026-10-19) of HOURS_OVERVIEW_RAW run
// through applyHoursOverview with a fixed `now` — billable 2410, tracked 2000, idle 110,
// manualApproved 410, manualPending 130, limit 40h → 10m over the limit, not approved.
//
// No mocks: Card renders through GlassCard, whose Skia canvas resolves to
// __mocks__/@shopify/react-native-skia (as in AppBreakdownCard.test.tsx). The one stub is
// @expo/vector-icons for the toggle's chevron (its font loading crashes jest-expo/node).

import React from 'react';
import { create, act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

import { HOURS_OVERVIEW_RAW } from '@/src/__fixtures__/hoursOverview';
import { normalizeHoursOverview } from '@/src/lib/hoursOverview';
import { applyHoursOverview, calculateHours, type WeekBreakdown } from '@/src/lib/hours';
import WeekBreakdownCard, {
  breakdownBar,
  breakdownGroups,
  breakdownStatus,
  breakdownToggleLabel,
  formatWeekRange,
  limitCaption,
} from '../WeekBreakdownCard';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COMPONENT_FILE = path.resolve(__dirname, '../WeekBreakdownCard.tsx');
const NOW = new Date('2026-10-25T15:00:00Z');

function fixtureBreakdown(): WeekBreakdown {
  const overview = normalizeHoursOverview(HOURS_OVERVIEW_RAW);
  if (!overview) throw new Error('fixture did not parse');
  const base = calculateHours(null, null, 25, 40);
  const data = applyHoursOverview(base, overview, null, 25, NOW);
  if (!data.breakdown) throw new Error('fixture produced no breakdown');
  return data.breakdown;
}

const FX = fixtureBreakdown();

function make(overrides: Partial<WeekBreakdown> = {}): WeekBreakdown {
  return { ...FX, ...overrides };
}

// 1h 10m left: billable 38h 50m, no pending
const LEFT = make({ tracked: 1920, manualApproved: 410, billable: 2330, manualPending: 0 });

// ─── Render helpers ───────────────────────────────────────────────────────────

function render(breakdown: WeekBreakdown, testID?: string): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(React.createElement(WeekBreakdownCard, { breakdown, testID }));
  });
  return tree!;
}

function byTestID(tree: ReactTestRenderer, id: string): ReactTestInstance[] {
  return tree.root.findAll((n) => n.props.testID === id);
}

function textOf(node: ReactTestInstance | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textOf).join(' ');
}

function textById(tree: ReactTestRenderer, id: string): string {
  const [node] = byTestID(tree, id);
  if (!node) throw new Error(`no node with testID ${id}`);
  return textOf(node).replace(/\s+/g, ' ').trim();
}

// ─── Fixture sanity ───────────────────────────────────────────────────────────

describe('WeekBreakdownCard — fixture breakdown', () => {
  it('is the requested week of HOURS_OVERVIEW_RAW', () => {
    expect(FX).toMatchObject({
      weekStart: '2026-10-19',
      billable: 2410,
      tracked: 2000,
      idle: 110,
      manualApproved: 410,
      manualPending: 130,
      manualRejected: 0,
      disputed: 0,
      limitMinutes: 2400,
      approvedOvertime: 0,
      isHourly: true,
    });
  });
});

// ─── formatWeekRange ──────────────────────────────────────────────────────────

describe('formatWeekRange', () => {
  it('formats a week inside one month', () => {
    expect(formatWeekRange('2026-10-19')).toBe('Mon 19 – Sun 25 Oct');
  });

  it('names both months when the week spans two', () => {
    expect(formatWeekRange('2026-10-26')).toBe('Mon 26 Oct – Sun 1 Nov');
  });

  it('handles a week spanning the new year', () => {
    expect(formatWeekRange('2026-12-28')).toBe('Mon 28 Dec – Sun 3 Jan');
  });

  it('returns "" for invalid input', () => {
    expect(formatWeekRange('')).toBe('');
    expect(formatWeekRange('garbage')).toBe('');
    expect(formatWeekRange('2026-02-30')).toBe('');
    expect(formatWeekRange('2026-10-19T00:00')).toBe('');
  });
});

// ─── breakdownStatus ──────────────────────────────────────────────────────────

describe('breakdownStatus', () => {
  it('fixture (2410 of 2400, hourly) → 10m over · not approved', () => {
    expect(breakdownStatus(FX)).toEqual({
      kind: 'over',
      minutes: 10,
      label: '10m over · not approved',
      parts: ['10m over', '· not approved'],
    });
  });

  it('under the limit → time left', () => {
    const s = breakdownStatus(LEFT);
    expect(s.kind).toBe('left');
    expect(s.minutes).toBe(70);
    expect(s.label).toBe('1h 10m left');
  });

  it('nothing worked yet → the whole limit is left', () => {
    expect(breakdownStatus(make({ billable: 0, tracked: 0, manualApproved: 0 })).label).toBe('40h left');
  });

  it('exactly at the limit → Limit reached', () => {
    expect(breakdownStatus(make({ billable: 2400 }))).toMatchObject({ kind: 'reached', label: 'Limit reached' });
  });

  it('non-hourly contract over the limit → Limit reached, never "not approved"', () => {
    expect(breakdownStatus(make({ isHourly: false }))).toMatchObject({ kind: 'reached', minutes: 0 });
  });

  it('approved overtime extends the cap', () => {
    expect(breakdownStatus(make({ approvedOvertime: 60 })).label).toBe('50m left');
    expect(breakdownStatus(make({ approvedOvertime: 10 })).kind).toBe('reached');
    expect(breakdownStatus(make({ billable: 2600, approvedOvertime: 60 })).label).toBe(
      '2h 20m over · not approved',
    );
  });

  it('no known limit → none', () => {
    expect(breakdownStatus(make({ limitMinutes: 0 }))).toEqual({ kind: 'none', minutes: 0, label: '', parts: [] });
  });
});

// ─── limitCaption ─────────────────────────────────────────────────────────────

describe('limitCaption', () => {
  it('names the weekly limit', () => {
    expect(limitCaption(FX).label).toBe('of your 40h weekly limit');
  });

  it('appends approved overtime as its own part', () => {
    expect(limitCaption(make({ approvedOvertime: 150 }))).toEqual({
      label: 'of your 40h weekly limit + 2h 30m approved OT',
      parts: ['of your 40h weekly limit', '+ 2h 30m approved OT'],
    });
  });

  it('formats a non-whole-hour limit', () => {
    expect(limitCaption(make({ limitMinutes: 2250 })).label).toBe('of your 37h 30m weekly limit');
  });

  it('is empty with no known limit', () => {
    expect(limitCaption(make({ limitMinutes: 0 })).label).toBe('');
  });
});

// ─── breakdownBar ─────────────────────────────────────────────────────────────

describe('breakdownBar', () => {
  it('fixture: scale = (billable + pending) × 1.08 when that exceeds the limit', () => {
    const scale = (2410 + 130) * 1.08;
    const bar = breakdownBar(FX);
    expect(bar.trackedPct).toBeCloseTo((2000 / scale) * 100, 6);
    expect(bar.approvedPct).toBeCloseTo((410 / scale) * 100, 6);
    expect(bar.pendingPct).toBeCloseTo((130 / scale) * 100, 6);
    expect(bar.limitPct).toBeCloseTo((2400 / scale) * 100, 6);
  });

  it('under the limit: scale = (limit + OT) × 1.08, marker inside the bar', () => {
    const bar = breakdownBar(make({ billable: 600, tracked: 600, manualApproved: 0, manualPending: 0, approvedOvertime: 120 }));
    const scale = (2400 + 120) * 1.08;
    expect(bar.trackedPct).toBeCloseTo((600 / scale) * 100, 6);
    expect(bar.approvedPct).toBe(0);
    expect(bar.pendingPct).toBe(0);
    expect(bar.limitPct).toBeCloseTo((2400 / scale) * 100, 6);
  });

  it('segments never fill past the headroom and the marker stays inside', () => {
    for (const b of [FX, LEFT, make({ billable: 4000, tracked: 3600, manualApproved: 400 })]) {
      const bar = breakdownBar(b);
      expect(bar.trackedPct + bar.approvedPct + bar.pendingPct).toBeLessThanOrEqual(100 / 1.08 + 1e-9);
      expect(bar.limitPct!).toBeLessThan(100);
    }
  });

  it('no limit → no marker; empty week with no limit → all zero', () => {
    expect(breakdownBar(make({ limitMinutes: 0 })).limitPct).toBeNull();
    expect(
      breakdownBar(
        make({ limitMinutes: 0, billable: 0, tracked: 0, manualApproved: 0, manualPending: 0, approvedOvertime: 0 }),
      ),
    ).toEqual({ trackedPct: 0, approvedPct: 0, pendingPct: 0, limitPct: null });
  });
});

// ─── breakdownGroups ──────────────────────────────────────────────────────────

describe('breakdownGroups', () => {
  const groups = breakdownGroups(FX);
  const rows = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.key, r]));

  it('three groups in dashboard order', () => {
    expect(groups.map((g) => g.title)).toEqual(['BILLABLE', 'NOT BILLABLE', 'LIMIT']);
    expect(groups.map((g) => g.rows.map((r) => r.label))).toEqual([
      ['Tracked', 'Manual, approved'],
      ['Manual, pending', 'Manual, rejected', 'Idle time', 'Disputed'],
      ['Weekly limit', 'Approved overtime'],
    ]);
  });

  it('BILLABLE heading carries the billable total', () => {
    expect(groups[0].total).toBe('40h 10m');
    expect(groups[1].total).toBeNull();
    expect(groups[2].total).toBeNull();
  });

  it('formats every value with formatMinutes', () => {
    expect(rows.tracked.value).toBe('33h 20m');
    expect(rows.manualApproved.value).toBe('6h 50m');
    expect(rows.manualPending.value).toBe('2h 10m');
    expect(rows.idle.value).toBe('1h 50m');
    expect(rows.manualRejected.value).toBe('0');
    expect(rows.disputed.value).toBe('0');
    expect(rows.weeklyLimit.value).toBe('40h');
    expect(rows.approvedOvertime.value).toBe('None');
  });

  it('mutes zero rows only', () => {
    const muted = Object.values(rows).filter((r) => r.muted).map((r) => r.key);
    expect(muted.sort()).toEqual(['approvedOvertime', 'disputed', 'manualRejected']);
  });

  it('shows approved overtime when granted', () => {
    const ot = breakdownGroups(make({ approvedOvertime: 90 }))[2].rows[1];
    expect(ot).toMatchObject({ value: '1h 30m', muted: false });
  });
});

// ─── Render ───────────────────────────────────────────────────────────────────

describe('WeekBreakdownCard — render', () => {
  it('passes testID to the Card', () => {
    expect(byTestID(render(FX, 'week-breakdown'), 'week-breakdown').length).toBeGreaterThan(0);
  });

  it('names the UTC pay week in the header: PAY WEEK + the UTC week range', () => {
    const tree = render(FX);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('PAY WEEK');
    expect(json).not.toContain('HOURS BREAKDOWN');
    expect(textById(tree, 'week-breakdown-range')).toBe('Mon 19 – Sun 25 Oct · UTC');
  });

  it('a pay week spanning two months keeps both months in the UTC range', () => {
    const tree = render(make({ weekStart: '2026-10-26' }));
    expect(textById(tree, 'week-breakdown-range')).toBe('Mon 26 Oct – Sun 1 Nov · UTC');
  });

  it('over the limit: warning status + caption', () => {
    const tree = render(FX);
    expect(textById(tree, 'week-breakdown-status')).toBe('10m over · not approved');
    expect(textById(tree, 'week-breakdown-caption')).toBe('of your 40h weekly limit');
    const statusTexts = byTestID(tree, 'week-breakdown-status')[0].findAll(
      (n) => typeof n.props.className === 'string' && n.props.className.includes('font-sans-semibold'),
    );
    expect(statusTexts.length).toBeGreaterThan(0);
    for (const t of statusTexts) expect(t.props.className).toContain('text-warning');
  });

  it('under the limit: time-left status in primary text', () => {
    const tree = render(LEFT);
    expect(textById(tree, 'week-breakdown-status')).toBe('1h 10m left');
    const [statusText] = byTestID(tree, 'week-breakdown-status')[0].findAll(
      (n) => typeof n.props.className === 'string' && n.props.className.includes('font-sans-semibold'),
    );
    expect(statusText.props.className).toContain('text-textPrimary');
  });

  it('limit reached: success status', () => {
    const tree = render(make({ billable: 2400, tracked: 1990, manualApproved: 410, manualPending: 0 }));
    expect(textById(tree, 'week-breakdown-status')).toBe('Limit reached');
    const [statusText] = byTestID(tree, 'week-breakdown-status')[0].findAll(
      (n) => typeof n.props.className === 'string' && n.props.className.includes('font-sans-semibold'),
    );
    expect(statusText.props.className).toContain('text-success');
  });

  it('caption mentions approved overtime', () => {
    expect(textById(render(make({ approvedOvertime: 120 })), 'week-breakdown-caption')).toBe(
      'of your 40h weekly limit + 2h approved OT',
    );
  });

  it('no known limit: no status, no limit marker', () => {
    const tree = render(make({ limitMinutes: 0 }));
    expect(byTestID(tree, 'week-breakdown-status')).toHaveLength(0);
    expect(byTestID(tree, 'week-breakdown-limit-marker')).toHaveLength(0);
    expect(byTestID(tree, 'week-breakdown-limit-label')).toHaveLength(0);
  });

  it('draws the three bar segments and the 40h limit marker', () => {
    const tree = render(FX);
    expect(byTestID(tree, 'week-breakdown-bar-tracked').length).toBeGreaterThan(0);
    expect(byTestID(tree, 'week-breakdown-bar-approved').length).toBeGreaterThan(0);
    expect(byTestID(tree, 'week-breakdown-bar-pending').length).toBeGreaterThan(0);
    expect(byTestID(tree, 'week-breakdown-limit-marker').length).toBeGreaterThan(0);
    expect(textById(tree, 'week-breakdown-limit-label')).toBe('40h limit');
  });

  it('omits empty bar segments', () => {
    const tree = render(LEFT);
    expect(byTestID(tree, 'week-breakdown-bar-pending')).toHaveLength(0);
    expect(byTestID(tree, 'week-breakdown-bar-tracked').length).toBeGreaterThan(0);
  });

  it('renders the legend', () => {
    const json = JSON.stringify(render(FX).toJSON());
    expect(json).toContain('Tracked');
    expect(json).toContain('Manual, approved');
    expect(json).toContain('Manual, pending');
  });

  it('renders every row with its value', () => {
    const tree = render(FX);
    expect(textById(tree, 'week-breakdown-row-tracked')).toBe('Tracked 33h 20m');
    expect(textById(tree, 'week-breakdown-row-manualApproved')).toBe('Manual, approved 6h 50m');
    expect(textById(tree, 'week-breakdown-row-manualPending')).toBe('Manual, pending 2h 10m');
    expect(textById(tree, 'week-breakdown-row-manualRejected')).toBe('Manual, rejected 0');
    expect(textById(tree, 'week-breakdown-row-idle')).toBe('Idle time 1h 50m');
    expect(textById(tree, 'week-breakdown-row-disputed')).toBe('Disputed 0');
    expect(textById(tree, 'week-breakdown-row-weeklyLimit')).toBe('Weekly limit 40h');
    expect(textById(tree, 'week-breakdown-row-approvedOvertime')).toBe('Approved overtime None');
    for (const g of ['billable', 'notBillable', 'limit']) {
      expect(byTestID(tree, `week-breakdown-group-${g}`).length).toBeGreaterThan(0);
    }
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('BILLABLE');
    expect(json).toContain('NOT BILLABLE');
    expect(json).toContain('LIMIT');
  });

  it('mutes zero-valued rows', () => {
    const tree = render(FX);
    const classes = (id: string) =>
      byTestID(tree, id)[0]
        .findAll((n) => typeof n.props.className === 'string' && n.props.className.includes('text-sm'))
        .map((n) => n.props.className as string);
    for (const c of classes('week-breakdown-row-disputed')) expect(c).toContain('text-textMuted');
    for (const c of classes('week-breakdown-row-tracked')) expect(c).not.toContain('text-textMuted');
  });

  it('shows the pending footnote when manual time awaits approval', () => {
    const tree = render(FX);
    expect(textById(tree, 'week-breakdown-footnote')).toBe(
      '2h 10m of manual time becomes billable when your manager approves it.',
    );
  });

  it('hides the pending footnote when nothing is pending', () => {
    const tree = render(LEFT);
    expect(byTestID(tree, 'week-breakdown-footnote')).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).not.toContain('becomes billable');
  });
});

// ─── Source contract ──────────────────────────────────────────────────────────

describe('WeekBreakdownCard — source contract', () => {
  const source = fs.readFileSync(COMPONENT_FILE, 'utf8');

  it('uses Card as the container', () => {
    expect(source).toMatch(/import Card from '\.\/Card'/);
  });

  it('has no Skia and no Reanimated (no entry/focus animations)', () => {
    expect(source).not.toMatch(/react-native-reanimated|@shopify\/react-native-skia|useFocus|useStaggeredEntry/);
  });

  it('has no raw hex colours', () => {
    expect(source).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});

// ─── Collapsible (1.2) ────────────────────────────────────────────────────────

function renderToggle(
  breakdown: WeekBreakdown,
  collapsed: boolean,
  onToggle: () => void = () => {},
): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(React.createElement(WeekBreakdownCard, { breakdown, collapsed, onToggle }));
  });
  return tree!;
}

/** The toggle's Pressable: the node carrying both the testID and the press handler. */
function toggleOf(tree: ReactTestRenderer): ReactTestInstance {
  const [toggle] = tree.root.findAll(
    (n) => n.props.testID === 'week-breakdown-toggle' && typeof n.props.onPress === 'function',
  );
  if (!toggle) throw new Error('no week-breakdown-toggle');
  return toggle;
}

const BODY_IDS = [
  'week-breakdown-bar',
  'week-breakdown-limit-marker',
  'week-breakdown-group-billable',
  'week-breakdown-row-tracked',
  'week-breakdown-footnote',
];

describe('breakdownToggleLabel', () => {
  it('speaks the status and caption, then the action', () => {
    expect(breakdownToggleLabel(LEFT, false)).toBe(
      'Pay week, 1h 10m left, of your 40h weekly limit. Hide details',
    );
    expect(breakdownToggleLabel(FX, true)).toBe(
      'Pay week, 10m over · not approved, of your 40h weekly limit. Show details',
    );
  });

  it('no known limit: the card name alone', () => {
    expect(breakdownToggleLabel(make({ limitMinutes: 0 }), true)).toBe('Pay week. Show details');
  });
});

describe('WeekBreakdownCard — without onToggle (back-compat)', () => {
  it('has no toggle and no chevron', () => {
    const tree = render(FX);
    expect(byTestID(tree, 'week-breakdown-toggle')).toHaveLength(0);
    expect(tree.root.findAll((n) => (n.type as unknown) === 'Ionicons')).toHaveLength(0);
  });

  it('ignores collapsed: renders exactly the default card', () => {
    let collapsedTree: ReactTestRenderer | undefined;
    act(() => {
      collapsedTree = create(React.createElement(WeekBreakdownCard, { breakdown: FX, collapsed: true }));
    });
    // Serialized: the host refs are per-render functions
    expect(JSON.stringify(collapsedTree!.toJSON())).toBe(JSON.stringify(render(FX).toJSON()));
    for (const id of BODY_IDS) expect(byTestID(collapsedTree!, id).length).toBeGreaterThan(0);
  });
});

describe('WeekBreakdownCard — with onToggle', () => {
  it('expanded: header, status and the whole body', () => {
    const tree = renderToggle(FX, false);
    expect(JSON.stringify(tree.toJSON())).toContain('PAY WEEK');
    expect(textById(tree, 'week-breakdown-range')).toBe('Mon 19 – Sun 25 Oct · UTC');
    expect(textById(tree, 'week-breakdown-status')).toBe('10m over · not approved');
    expect(textById(tree, 'week-breakdown-caption')).toBe('of your 40h weekly limit');
    for (const id of BODY_IDS) expect(byTestID(tree, id).length).toBeGreaterThan(0);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Manual, approved');
    expect(json).toContain('NOT BILLABLE');
  });

  it('collapsed: header + status + caption only', () => {
    const tree = renderToggle(FX, true);
    expect(JSON.stringify(tree.toJSON())).toContain('PAY WEEK');
    expect(textById(tree, 'week-breakdown-range')).toBe('Mon 19 – Sun 25 Oct · UTC');
    expect(textById(tree, 'week-breakdown-status')).toBe('10m over · not approved');
    expect(textById(tree, 'week-breakdown-caption')).toBe('of your 40h weekly limit');
    for (const id of BODY_IDS) expect(byTestID(tree, id)).toHaveLength(0);
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('Manual, approved');
    expect(json).not.toContain('NOT BILLABLE');
    expect(json).not.toContain('becomes billable');
  });

  it('the header sits inside the toggle, with a chevron', () => {
    const toggle = toggleOf(renderToggle(LEFT, true));
    expect(toggle.findAll((n) => n.props.testID === 'week-breakdown-status').length).toBeGreaterThan(0);
    expect(toggle.findAll((n) => n.props.testID === 'week-breakdown-range').length).toBeGreaterThan(0);
    expect(toggle.findAll((n) => (n.type as unknown) === 'Ionicons')).toHaveLength(1);
  });

  it('a press calls onToggle', () => {
    const onToggle = jest.fn();
    const tree = renderToggle(FX, false, onToggle);
    act(() => toggleOf(tree).props.onPress());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('accessibility: a button with its expanded state and a label carrying the status', () => {
    const expanded = toggleOf(renderToggle(LEFT, false));
    expect(expanded.props.accessibilityRole).toBe('button');
    expect(expanded.props.accessibilityState).toEqual({ expanded: true });
    expect(expanded.props.accessibilityLabel).toBe(
      'Pay week, 1h 10m left, of your 40h weekly limit. Hide details',
    );

    const collapsed = toggleOf(renderToggle(FX, true));
    expect(collapsed.props.accessibilityState).toEqual({ expanded: false });
    expect(collapsed.props.accessibilityLabel).toBe(
      'Pay week, 10m over · not approved, of your 40h weekly limit. Show details',
    );
  });

  it('no known limit: the toggle still works and the body still hides', () => {
    const tree = renderToggle(make({ limitMinutes: 0 }), true);
    expect(toggleOf(tree).props.accessibilityLabel).toBe('Pay week. Show details');
    expect(byTestID(tree, 'week-breakdown-status')).toHaveLength(0);
    expect(byTestID(tree, 'week-breakdown-bar')).toHaveLength(0);
  });
});
