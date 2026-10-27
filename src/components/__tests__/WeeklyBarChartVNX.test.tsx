// Tests: WeeklyBarChart — 04-victory-charts FR2 (VNX migration)
//
// FR2: WeeklyBarChart migrated from bespoke Skia Rect to VNX CartesianChart + Bar
//   SC2.1 — External prop interface unchanged (DailyHours[], width, height, maxHours?, weeklyLimit?, todayColor?, watermarkLabel?)
//   SC2.2 — Source imports CartesianChart and Bar from victory-native
//   SC2.3 — Source passes toBarData output as data to CartesianChart
//   SC2.4 — CartesianChart uses xKey="day" and yKeys=["value"]
//   SC2.5 — Each bar LinearGradient uses bar's color as start color
//   SC2.6 — LinearGradient end color is transparent
//   SC2.7 — Bars have rounded top corners (4px)
//   SC2.8 — clipProgress + timingChartFill entry animation preserved
//   SC2.9 — Overtime coloring (weeklyLimit) preserved (OVERTIME_WHITE_GOLD)
//   SC2.10 — Today bar uses todayColor, default colors.success
//   SC2.11 — Future bars use colors.textMuted
//   SC2.12 — Renders without crash for data=[] and width=0
//   SC2.13 — watermarkLabel preserved with opacity <= 0.10
//
// 1.2 WorkSmart dashboard parity: manual / pending segments — SC-12.1–12.9 (last block)
//
// Strategy:
// - Source-level checks for VNX API usage (import, props, data flow)
// - Render tests for crash safety
// - Existing WeeklyBarChart tests continue to run in their own file

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';
import { RoundedRect } from '@shopify/react-native-skia';
import { CartesianChart } from 'victory-native';
import WeeklyBarChart, {
  type DailyHours,
  type WeeklyBarChartProps,
} from '@/src/components/WeeklyBarChart';
import { colors } from '@/src/lib/colors';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('victory-native', () => {
  const R = require('react');
  const chartBounds = { left: 0, right: 300, top: 0, bottom: 120, width: 300, height: 120 };
  return {
    CartesianChart: ({ children, data, xKey, yKeys, domain }: any) => {
      // Linear y scale over the passed domain — WeeklyBarChart stacks pending time with it
      const yMax = domain?.y?.[1] ?? 1;
      const yScale = (v: number) =>
        chartBounds.bottom - (v / yMax) * (chartBounds.bottom - chartBounds.top);
      // Provide realistic points.value so per-bar RoundedRect rendering executes
      const points: any = {};
      if (yKeys && data) {
        yKeys.forEach((k: string) => {
          points[k] = (data as any[]).map((_d: any, i: number) => ({
            x: (i + 0.5) * (chartBounds.right / data.length),
            y: 60,
          }));
        });
      } else if (yKeys) {
        yKeys.forEach((k: string) => { points[k] = []; });
      }
      return R.createElement('CartesianChart', { data, xKey, yKeys },
        typeof children === 'function' ? children({ points, chartBounds, yScale }) : children
      );
    },
    Line: ({ children }: any) =>
      R.createElement('Line', {}, typeof children === 'function' ? children() : children),
    Area: ({ children }: any) =>
      R.createElement('Area', {}, typeof children === 'function' ? children() : children),
    useChartPressState: () => ({
      state: { x: { position: { value: 0 }, value: { value: 0 } }, y: {} },
      isActive: { value: false },
    }),
  };
});

// ─── File paths ───────────────────────────────────────────────────────────────

const BAR_CHART_FILE = path.resolve(__dirname, '../WeeklyBarChart.tsx');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_DATA = [
  { day: 'Mon', hours: 7.5, isToday: false, isFuture: false },
  { day: 'Tue', hours: 8,   isToday: false, isFuture: false },
  { day: 'Wed', hours: 6.5, isToday: true,  isFuture: false },
  { day: 'Thu', hours: 0,   isToday: false, isFuture: true  },
  { day: 'Fri', hours: 0,   isToday: false, isFuture: true  },
  { day: 'Sat', hours: 0,   isToday: false, isFuture: true  },
  { day: 'Sun', hours: 0,   isToday: false, isFuture: true  },
];

function renderChart(props: {
  data?: typeof MOCK_DATA;
  width?: number;
  height?: number;
  maxHours?: number;
  weeklyLimit?: number;
  todayColor?: string;
  watermarkLabel?: string;
}) {
  const WeeklyBarChart = require('@/src/components/WeeklyBarChart').default;
  const defaultProps = { data: MOCK_DATA, width: 300, height: 120, ...props };
  let tree: any;
  act(() => {
    tree = create(React.createElement(WeeklyBarChart, defaultProps));
  });
  return tree;
}

// ─── SC2.1: External prop interface ──────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.1: external prop interface unchanged', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.1a — WeeklyBarChartProps includes data: DailyHours[]', () => {
    expect(source).toMatch(/data\s*:\s*DailyHours\[\]/);
  });

  it('SC2.1b — WeeklyBarChartProps includes width: number', () => {
    expect(source).toMatch(/width\s*:\s*number/);
  });

  it('SC2.1c — WeeklyBarChartProps includes height: number', () => {
    expect(source).toMatch(/height\s*:\s*number/);
  });

  it('SC2.1d — WeeklyBarChartProps includes optional maxHours', () => {
    expect(source).toMatch(/maxHours\s*\?\s*:/);
  });

  it('SC2.1e — WeeklyBarChartProps includes optional weeklyLimit', () => {
    expect(source).toMatch(/weeklyLimit\s*\?\s*:\s*number/);
  });

  it('SC2.1f — WeeklyBarChartProps includes optional todayColor', () => {
    expect(source).toMatch(/todayColor\s*\?\s*:\s*string/);
  });

  it('SC2.1g — DailyHours interface preserved with day, hours, isToday, isFuture', () => {
    expect(source).toMatch(/DailyHours/);
    expect(source).toMatch(/day\s*:/);
    expect(source).toMatch(/hours\s*:/);
    expect(source).toMatch(/isToday\s*\?/);
    expect(source).toMatch(/isFuture\s*\?/);
  });
});

// ─── SC2.2: VNX imports ───────────────────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.2: imports CartesianChart and Bar from victory-native', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.2a — CartesianChart imported from victory-native', () => {
    expect(source).toMatch(/CartesianChart[\s\S]{0,100}victory-native|victory-native[\s\S]{0,100}CartesianChart/);
  });

  it('SC2.2b — RoundedRect imported from @shopify/react-native-skia for per-bar gradients', () => {
    // VNX Bar applies one gradient to all bars — RoundedRect replaced it for per-bar gradients.
    expect(source).toMatch(/RoundedRect[\s\S]{0,100}react-native-skia|react-native-skia[\s\S]{0,100}RoundedRect/);
  });
});

// ─── SC2.3: toBarData usage ───────────────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.3: uses toBarData from chartData', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.3a — source imports toBarData', () => {
    expect(source).toContain('toBarData');
  });

  it('SC2.3b — source imports from chartData lib', () => {
    expect(source).toMatch(/chartData/);
  });

  it('SC2.3c — CartesianChart receives toBarData output as data prop', () => {
    // Either: data={toBarData(...)} or a variable derived from toBarData
    expect(source).toMatch(/toBarData[\s\S]{0,200}CartesianChart|CartesianChart[\s\S]{0,200}toBarData/);
  });
});

// ─── SC2.4: CartesianChart keys ──────────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.4: CartesianChart xKey and yKeys', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.4a — xKey="day"', () => {
    expect(source).toMatch(/xKey\s*=\s*["']day["']/);
  });

  it('SC2.4b — yKeys includes "value"', () => {
    expect(source).toMatch(/yKeys\s*=\s*\{\s*\[["']value["']\]/);
  });
});

// ─── SC2.5 + SC2.6: LinearGradient fill ──────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.5/SC2.6: LinearGradient fill', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.5 — LinearGradient is used inside RoundedRect for per-bar gradients', () => {
    expect(source).toContain('LinearGradient');
    expect(source).toContain('RoundedRect');
  });

  it('SC2.6 — LinearGradient includes transparent as end color', () => {
    // transparent or rgba(0,0,0,0) or color+'00' etc
    expect(source).toMatch(/transparent|'#[0-9a-fA-F]{6}00'|"#[0-9a-fA-F]{6}00"/);
  });
});

// ─── SC2.7: Rounded corners ───────────────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.7: rounded top corners', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.7 — bars have 4px radius (RoundedRect r={4})', () => {
    // Previously checked roundedCorners on VNX Bar; now using Skia RoundedRect with r={4}.
    expect(source).toMatch(/RoundedRect/);
    expect(source).toMatch(/r\s*=\s*\{?\s*4\s*\}?/);
  });
});

// ─── SC2.8: Entry animation ───────────────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.8: clipProgress animation preserved', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.8a — clipProgress SharedValue exists', () => {
    expect(source).toContain('clipProgress');
  });

  it('SC2.8b — withTiming used for clip animation', () => {
    expect(source).toContain('withTiming');
  });

  it('SC2.8c — timingChartFill imported and used', () => {
    expect(source).toContain('timingChartFill');
  });
});

// ─── SC2.9: Overtime coloring ─────────────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.9: overtime coloring preserved', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.9a — OVERTIME_WHITE_GOLD constant (#FFF8E7) preserved', () => {
    expect(source).toContain('OVERTIME_WHITE_GOLD');
    expect(source).toContain('#FFF8E7');
  });

  it('SC2.9b — weeklyLimit logic uses strict > comparison', () => {
    expect(source).toMatch(/runningTotal\s*>\s*weeklyLimit/);
  });

  it('SC2.9c — runningTotal accumulated before bar rendering', () => {
    expect(source).toMatch(/let\s+runningTotal\s*=\s*0/);
  });
});

// ─── SC2.10 + SC2.11: Color assignment ───────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.10/SC2.11: today and future bar colors', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.10a — todayColor used for today bar', () => {
    expect(source).toMatch(/isToday[\s\S]{0,200}todayColor|todayColor[\s\S]{0,200}isToday/);
  });

  it('SC2.10b — todayColor defaults to colors.success', () => {
    expect(source).toMatch(/todayColor\s*=\s*colors\.success/);
  });

  it('SC2.11 — future bars use colors.textMuted', () => {
    expect(source).toMatch(/isFuture[\s\S]{0,100}textMuted|textMuted[\s\S]{0,100}isFuture/);
  });
});

// ─── SC2.12: Crash safety ─────────────────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.12: crash safety', () => {
  it('SC2.12a — renders without crash with normal data', () => {
    expect(() => renderChart({ width: 300, height: 120 })).not.toThrow();
  });

  it('SC2.12b — renders without crash for data=[]', () => {
    expect(() => renderChart({ data: [], width: 300, height: 120 })).not.toThrow();
  });

  it('SC2.12c — renders without crash for width=0 (returns null, no crash)', () => {
    expect(() => renderChart({ width: 0, height: 120 })).not.toThrow();
  });

  it('SC2.12d — renders without crash with weeklyLimit set', () => {
    expect(() => renderChart({ weeklyLimit: 40 })).not.toThrow();
  });

  it('SC2.12e — renders without crash with overtime data exceeding weeklyLimit', () => {
    const overtimeData = [
      { day: 'Mon', hours: 8, isToday: false, isFuture: false },
      { day: 'Tue', hours: 8, isToday: false, isFuture: false },
      { day: 'Wed', hours: 8, isToday: true,  isFuture: false },
      { day: 'Thu', hours: 0, isToday: false, isFuture: true  },
      { day: 'Fri', hours: 0, isToday: false, isFuture: true  },
      { day: 'Sat', hours: 0, isToday: false, isFuture: true  },
      { day: 'Sun', hours: 0, isToday: false, isFuture: true  },
    ];
    expect(() => renderChart({ data: overtimeData, weeklyLimit: 15 })).not.toThrow();
  });
});

// ─── SC2.13: Watermark label ──────────────────────────────────────────────────

describe('WeeklyBarChart VNX — SC2.13: watermark label preserved', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC2.13a — watermarkLabel prop still in interface', () => {
    expect(source).toMatch(/watermarkLabel\s*\?\s*:\s*string/);
  });

  it('SC2.13b — watermark rendered with opacity <= 0.10', () => {
    expect(source).toMatch(/watermarkLabel[\s\S]{0,500}opacity=\{0\.0[0-9]/);
  });

  it('SC2.13c — renders without crash with watermarkLabel provided', () => {
    expect(() => renderChart({ watermarkLabel: '38.5h' })).not.toThrow();
  });

  it('SC2.13d — renders without crash without watermarkLabel', () => {
    expect(() => renderChart({})).not.toThrow();
  });
});

// ─── FR (09-chart-visual-fixes FR2): domainPadding suppresses VNX vertical squash ──
//
// SC-09FR2.1 — CartesianChart has domainPadding with top: 0 and bottom: 0
// SC-09FR2.2 — domainPadding x values use cellW * 0.35 factor
// SC-09FR2.3 — renders without crash with all-low-hours data

describe('WeeklyBarChart — 09FR2: domainPadding suppresses VNX vertical squash', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
  });

  it('SC-09FR2.1 — CartesianChart has domainPadding prop with top: 0 and bottom: 0', () => {
    expect(source).toMatch(/domainPadding/);
    expect(source).toMatch(/top\s*:\s*0/);
    expect(source).toMatch(/bottom\s*:\s*0/);
  });

  it('SC-09FR2.2 — barX computed from index (no x domainPadding — removed to fix bar width skew)', () => {
    // barX = chartBounds.left + i * cellW + (cellW - barW) / 2
    // x domainPadding was removed because it caused VNX to shift point.x out of sync
    // with cellW-derived barW, producing uneven bar widths.
    expect(source).toMatch(/chartBounds\.left\s*\+\s*i\s*\*\s*cellW/);
  });

  it('SC-09FR2.3 — renders without crash with all-low-hours data', () => {
    const lowHoursData = [
      { day: 'Mon', hours: 1.8, isToday: false, isFuture: false },
      { day: 'Tue', hours: 0.5, isToday: false, isFuture: false },
      { day: 'Wed', hours: 2.1, isToday: true,  isFuture: false },
      { day: 'Thu', hours: 0,   isToday: false, isFuture: true  },
      { day: 'Fri', hours: 0,   isToday: false, isFuture: true  },
      { day: 'Sat', hours: 0,   isToday: false, isFuture: true  },
      { day: 'Sun', hours: 0,   isToday: false, isFuture: true  },
    ];
    expect(() => renderChart({ data: lowHoursData, width: 300, height: 120 })).not.toThrow();
  });
});

// ─── 1.2 WorkSmart dashboard parity: manual / pending segments ───────────────
//
// SC-12.1 — DailyHours declares optional manualHours / pendingHours
// SC-12.2 — without the fields: one bar per day, geometry + gradient exactly as before
// SC-12.3 — y domain max includes hours + pendingHours
// SC-12.4 — approved manual: violet → transparent top segment over a shortened bar
// SC-12.5 — manual ≥ hours: the whole bar is the violet segment
// SC-12.6 — pending: translucent violet fill + 1px violet stroke stacked on the bar
// SC-12.7 — a few minutes of pending still draws a MIN_PENDING_PX box
// SC-12.8 — overtime white-gold still keys off `hours` (manual counts, pending doesn't)
// SC-12.9 — zero / negative / NaN fields render like absent ones
//
// The mock gives every bar point.y = 60 (bar top), and yScale(4) = 60 while the domain
// max is 8, so a 4h bar keeps the mock's geometry coherent for the stacking checks.

describe('WeeklyBarChart — 1.2 manual / pending segments', () => {
  const CELL_W = 300 / 7;
  const BAR_W = CELL_W * 0.65;
  const VIOLET = colors.violet;
  const SUCCESS = colors.success;
  const barX = (i: number) => i * CELL_W + (CELL_W - BAR_W) / 2;

  function renderWith(data: DailyHours[], extra: Partial<WeeklyBarChartProps> = {}) {
    let tree: any;
    act(() => {
      tree = create(React.createElement(WeeklyBarChart, { data, width: 300, height: 120, ...extra }));
    });
    return tree;
  }

  const rects = (tree: any): any[] =>
    tree.root.findAll((n: any) => n.type === RoundedRect).map((n: any) => n.props);
  const barRects = (tree: any, i: number) => rects(tree).filter((p) => Math.abs(p.x - barX(i)) < 1);
  const gradient = (p: any) => p.children?.props;
  const domainMax = (tree: any) => tree.root.findByType(CartesianChart).props.domain.y[1];
  const geometry = (tree: any) =>
    rects(tree).map((p) => ({
      x: p.x, y: p.y, width: p.width, height: p.height, r: p.r,
      color: p.color, style: p.style, gradient: gradient(p),
    }));

  const withDay = (i: number, patch: Partial<DailyHours>): DailyHours[] =>
    MOCK_DATA.map((d, j) => (j === i ? { ...d, ...patch } : d));

  it('SC-12.1 — DailyHours declares manualHours?: number and pendingHours?: number', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toMatch(/manualHours\s*\?\s*:\s*number/);
    expect(source).toMatch(/pendingHours\s*\?\s*:\s*number/);
  });

  it('SC-12.2 — without the fields: one gradient bar per day, no extra segments', () => {
    const tree = renderWith(MOCK_DATA);
    const all = rects(tree);
    expect(all).toHaveLength(7);
    all.forEach((p, i) => {
      expect(p).toMatchObject({ x: barX(i), y: 60, width: BAR_W, height: 60, r: 4 });
      expect(p.style).toBeUndefined();
      expect(p.color).toBeUndefined();
      expect(gradient(p).start).toEqual({ x: 0, y: 60 });
      expect(gradient(p).end).toEqual({ x: 0, y: 120 });
      expect(gradient(p).colors[0]).not.toBe(VIOLET);
      expect(gradient(p).colors[1]).toBe('transparent');
    });
  });

  it('SC-12.3 — y domain max includes hours + pendingHours', () => {
    expect(domainMax(renderWith(MOCK_DATA))).toBe(8);
    expect(domainMax(renderWith(withDay(2, { pendingHours: 3 })))).toBe(9.5); // 6.5 + 3
    expect(domainMax(renderWith(withDay(2, { pendingHours: 3 }), { maxHours: 12 }))).toBe(12);
    // Approved manual is already inside `hours` — it never widens the domain
    expect(domainMax(renderWith(withDay(1, { manualHours: 5 })))).toBe(8);
  });

  it('SC-12.4 — approved manual is a violet → transparent top segment', () => {
    const tree = renderWith(withDay(0, { hours: 8, manualHours: 2 }));
    const [tracked, manual] = barRects(tree, 0);
    // 2h of 8h = top quarter of the 60px bar
    expect(manual).toMatchObject({ y: 60, height: 15, r: 4 });
    expect(gradient(manual).colors).toEqual([VIOLET, 'transparent']);
    expect(gradient(manual).start).toEqual({ x: 0, y: 60 });
    expect(gradient(manual).end).toEqual({ x: 0, y: 75 });
    expect(tracked).toMatchObject({ y: 75, height: 45, r: 4 });
    expect(gradient(tracked).colors).toEqual([SUCCESS, 'transparent']);
    expect(gradient(tracked).start).toEqual({ x: 0, y: 75 });
    expect(gradient(tracked).end).toEqual({ x: 0, y: 120 });
    // Other bars untouched
    expect(barRects(tree, 1)).toHaveLength(1);
  });

  it('SC-12.5 — manual ≥ hours: the whole bar is violet', () => {
    const tree = renderWith(withDay(0, { hours: 3, manualHours: 5 }));
    const segs = barRects(tree, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ y: 60, height: 60 });
    expect(gradient(segs[0]).colors[0]).toBe(VIOLET);
  });

  it('SC-12.6 — pending: translucent violet fill + 1px violet stroke stacked on the bar', () => {
    // 4h bar (top at y=60) + 2h pending → pending top at yScale(6) = 30
    const tree = renderWith(withDay(2, { hours: 4, pendingHours: 2 }));
    const segs = barRects(tree, 2);
    expect(segs).toHaveLength(3);
    const [bar, fill, stroke] = segs;
    expect(bar).toMatchObject({ y: 60, height: 60 });
    expect(fill).toMatchObject({ x: barX(2), y: 30, width: BAR_W, height: 30, color: VIOLET });
    expect(fill.opacity).toBeGreaterThan(0);
    expect(fill.opacity).toBeLessThanOrEqual(0.3);
    expect(fill.style).toBeUndefined();
    expect(stroke).toMatchObject({
      style: 'stroke', strokeWidth: 1, color: VIOLET,
      x: barX(2) + 0.5, y: 30.5, width: BAR_W - 1, height: 29,
    });
  });

  it('SC-12.7 — a few minutes of pending still draws a visible box', () => {
    const tree = renderWith(withDay(2, { hours: 4, pendingHours: 0.01 }));
    const fill = barRects(tree, 2).find((p) => p.color === VIOLET && p.style === undefined);
    expect(fill).toMatchObject({ y: 57, height: 3 });
  });

  it('SC-12.8 — overtime colour keys off hours: manual counts, pending does not', () => {
    // Mon 8h; Tue 6h + 4h pending = 14h counted, under the 15h limit
    const base = withDay(0, { hours: 8 }).map((d, j) =>
      j === 1 ? { ...d, hours: 6, pendingHours: 4 } : j === 2 ? { ...d, isToday: false } : d,
    );
    const underLimit = barRects(renderWith(base, { weeklyLimit: 15 }), 1)
      .find((p) => p.style === undefined && p.color === undefined);
    expect(gradient(underLimit).colors[0]).toBe(SUCCESS);

    // Mon 8h; Tue 8h incl. 3h approved manual = 16h, over the limit
    const overLimit = base.map((d, j) => (j === 1 ? { day: 'Tue', hours: 8, manualHours: 3 } : d));
    const tracked = barRects(renderWith(overLimit, { weeklyLimit: 15 }), 1)
      .find((p) => gradient(p)?.colors[0] !== VIOLET);
    expect(gradient(tracked).colors[0]).toBe('#FFF8E7');
  });

  it('SC-12.9 — zero, negative and NaN fields render exactly like absent ones', () => {
    const noisy = MOCK_DATA.map((d, i) => ({
      ...d,
      manualHours: [0, -2, NaN, 0, 0, 0, 0][i],
      pendingHours: [0, -1, NaN, 0, 0, 0, 0][i],
    }));
    expect(geometry(renderWith(noisy))).toEqual(geometry(renderWith(MOCK_DATA)));
    expect(domainMax(renderWith(noisy))).toBe(8);
  });
});
