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
// Strategy:
// - Source-level checks for VNX API usage (import, props, data flow)
// - Render tests for crash safety
// - Existing WeeklyBarChart tests continue to run in their own file

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('victory-native', () => {
  const R = require('react');
  const chartBounds = { left: 0, right: 300, top: 0, bottom: 120, width: 300, height: 120 };
  return {
    CartesianChart: ({ children, data, xKey, yKeys }: any) => {
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
        typeof children === 'function' ? children({ points, chartBounds }) : children
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
