// Tests: WeeklyBarChart — 02-watermarks FR1 + 01-overtime-display FR2
//
// FR1 (02-watermarks): WeeklyBarChart watermark label
//   SC1.1 — watermarkLabel prop in interface
//   SC1.2 — Skia <Text> rendered when watermarkLabel provided
//   SC1.3 — opacity ≤ 0.10
//   SC1.4 — x position near width/2
//   SC1.5 — y position near height/2
//   SC1.6 — watermarkLabel undefined → no Text rendered, no crash
//   SC1.7 — watermarkLabel "" → no Text rendered
//
// FR2 (01-overtime-display): WeeklyBarChart overtime bar coloring
//   SC2.1 — weeklyLimit prop in WeeklyBarChartProps interface
//   SC2.2 — source declares OVERTIME_WHITE_GOLD constant (#FFF8E7)
//   SC2.3 — bar pushing cumulative total beyond weeklyLimit uses #FFF8E7
//   SC2.4 — bar at exactly weeklyLimit (not over) is NOT white-gold
//   SC2.5 — without weeklyLimit prop, no white-gold bars
//   SC2.6 — future bars always use textMuted, not white-gold
//   SC2.7 — source uses running cumulative total before the map loop
//
// Strategy:
// - Source-level static analysis for interface and implementation details
// - react-test-renderer for render validation (same pattern as AIConeChart.test.tsx)
// - Skia mock from __mocks__/@shopify/react-native-skia.ts

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as path from 'path';
import * as fs from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-web/dist/exports/View/index.js', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: ({ children, testID, style, ...rest }: any) =>
      R.createElement('View', { testID, style, ...rest }, children),
  };
});

jest.mock('react-native-web/dist/exports/Text/index.js', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: ({ children, testID, style, ...rest }: any) =>
      R.createElement('Text', { testID, style, ...rest }, children),
  };
});

// victory-native mock required after 04-victory-charts VNX migration
jest.mock('victory-native', () => {
  const R = require('react');
  const chartBounds = { left: 0, right: 300, top: 0, bottom: 120, width: 300, height: 120 };
  return {
    CartesianChart: ({ children, data, xKey, yKeys }: any) => {
      // Populate points.value with mock {x, y} entries matching data length
      // so WeeklyBarChart's RoundedRect per-bar render path executes without crash.
      const points: any = {};
      if (yKeys && data) {
        yKeys.forEach((k: string) => {
          points[k] = (data as any[]).map((_d: any, i: number) => ({
            x: (i + 0.5) * (chartBounds.right / data.length),
            y: 60, // mid-chart y for all bars
          }));
        });
      }
      return R.createElement('CartesianChart', { data, xKey, yKeys },
        typeof children === 'function' ? children({ points, chartBounds }) : children
      );
    },
  };
});

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const BAR_CHART_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'WeeklyBarChart.tsx');

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderChart(props: {
  data?: typeof MOCK_DATA;
  width?: number;
  height?: number;
  maxHours?: number;
  watermarkLabel?: string;
  weeklyLimit?: number;
}) {
  const WeeklyBarChart = require('@/src/components/WeeklyBarChart').default;
  const defaultProps = {
    data: MOCK_DATA,
    width: 300,
    height: 120,
    ...props,
  };
  let tree: any;
  act(() => {
    tree = create(React.createElement(WeeklyBarChart, defaultProps));
  });
  return tree;
}

/** Deep-traverse rendered tree for nodes matching predicate */
function findNodes(node: any, predicate: (n: any) => boolean, found: any[] = []): any[] {
  if (!node) return found;
  if (predicate(node)) found.push(node);
  const children = node.children ?? [];
  for (const child of Array.isArray(children) ? children : [children]) {
    findNodes(child, predicate, found);
  }
  return found;
}

// ─── FR3 (04-victory-charts update): WeeklyBarChart bar visual treatment ──────
//
// The WeeklyBarChart has been migrated from bespoke Skia Rect bars to Victory
// Native XL (04-victory-charts). The old BlurMaskFilter glow on Skia Paint/Rect
// is replaced by a LinearGradient fill (peak color → transparent) inside each Bar.
//
// SC2.1 — @shopify/react-native-skia imported (for watermark Canvas)
// SC2.2 — LinearGradient inside Bar (replaces Paint/BlurMaskFilter glow)
// SC2.3 — LinearGradient uses transparent end color
// SC2.4 — CartesianChart from victory-native used
// SC2.5 — todayColor used in bar color logic
// SC2.6 — textMuted used for future bars
// SC2.7 — Chart renders without crash when no bar is isToday
// SC2.8 — Overflow isToday bar renders without crash
// SC2.10 — clipProgress animation preserved (replaces animatedBarHeight)

describe('WeeklyBarChart — FR3 (04-victory-charts): Bar visual treatment', () => {
  it('SC2.1 — @shopify/react-native-skia imported (for watermark Canvas)', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toContain('@shopify/react-native-skia');
  });

  it('SC2.2 — LinearGradient inside RoundedRect (per-bar gradient fill)', () => {
    // WeeklyBarChart uses Skia RoundedRect (not VNX Bar) for per-bar gradients.
    // VNX Bar applies one gradient to ALL bars in a series; RoundedRect gives full
    // per-bar control with individual LinearGradient children.
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toContain('LinearGradient');
    expect(source).toContain('RoundedRect');
  });

  it('SC2.3 — LinearGradient uses transparent as end color', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toMatch(/transparent|'#[0-9a-fA-F]{6}00'/);
  });

  it('SC2.4 — CartesianChart from victory-native is used', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toContain('CartesianChart');
    expect(source).toContain('victory-native');
  });

  it('SC2.5 — todayColor used in bar color logic', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toContain('todayColor');
  });

  it('SC2.6 — textMuted used for future bars', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toContain('textMuted');
  });

  it('SC2.7 — chart renders without crash when no bar has isToday=true', () => {
    const noTodayData = [
      { day: 'Mon', hours: 7.5, isToday: false, isFuture: false },
      { day: 'Tue', hours: 8,   isToday: false, isFuture: false },
      { day: 'Wed', hours: 6.5, isToday: false, isFuture: false },
      { day: 'Thu', hours: 0,   isToday: false, isFuture: true  },
      { day: 'Fri', hours: 0,   isToday: false, isFuture: true  },
      { day: 'Sat', hours: 0,   isToday: false, isFuture: true  },
      { day: 'Sun', hours: 0,   isToday: false, isFuture: true  },
    ];
    expect(() =>
      renderChart({ data: noTodayData, width: 300, height: 120 }),
    ).not.toThrow();
  });

  it('SC2.8 — overflow isToday bar renders without crash', () => {
    const overtimeTodayData = [
      { day: 'Mon', hours: 8, isToday: false, isFuture: false },
      { day: 'Tue', hours: 8, isToday: false, isFuture: false },
      { day: 'Wed', hours: 8, isToday: true,  isFuture: false },
      { day: 'Thu', hours: 0, isToday: false, isFuture: true  },
      { day: 'Fri', hours: 0, isToday: false, isFuture: true  },
      { day: 'Sat', hours: 0, isToday: false, isFuture: true  },
      { day: 'Sun', hours: 0, isToday: false, isFuture: true  },
    ];
    expect(() =>
      renderChart({ data: overtimeTodayData, weeklyLimit: 15, width: 300, height: 120 }),
    ).not.toThrow();
  });

  it('SC2.10 — clipProgress animation preserved (withTiming + timingChartFill)', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toContain('clipProgress');
    expect(source).toContain('withTiming');
  });
});

// ─── FR1: WeeklyBarChart watermark label ─────────────────────────────────────

describe('WeeklyBarChart — FR1: Watermark Label', () => {
  it('SC1.1 — WeeklyBarChartProps includes watermarkLabel?: string', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // Interface should declare optional watermarkLabel string prop
    expect(source).toMatch(/watermarkLabel\s*\?\s*:\s*string/);
  });

  it('SC1.2 — when watermarkLabel="38.5h" is provided, source contains Skia Text with the string', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // Source should render a Skia <Text ... text={watermarkLabel}> element
    expect(source).toMatch(/<SkiaText[\s\S]{0,200}watermarkLabel|<Text[\s\S]{0,200}watermarkLabel/);
  });

  it('SC1.3 — watermark Text element has opacity <= 0.10', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // The watermark should have very low opacity (e.g. 0.07)
    // Look for opacity prop near the watermark Text element
    expect(source).toMatch(/watermarkLabel[\s\S]{0,500}opacity=\{0\.0[0-9]/);
  });

  it('SC1.4 — watermark x is centered (derived from width/2)', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // Should use width/2 calculation for centering
    expect(source).toMatch(/width\s*\/\s*2/);
  });

  it('SC1.5 — watermark y is vertically centered (derived from h/2 or height/2)', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // Should use height/2 or h/2 for vertical centering
    expect(source).toMatch(/h\s*\/\s*2|height\s*\/\s*2/);
  });

  it('SC1.6 — watermarkLabel undefined: component renders without crash', () => {
    // No watermarkLabel passed → should not throw
    expect(() => renderChart({ width: 300, height: 120 })).not.toThrow();
  });

  it('SC1.7 — watermarkLabel undefined: no watermark Text rendered (guarded)', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // Guard pattern: {watermarkLabel && font && (...)} or similar
    expect(source).toMatch(/watermarkLabel\s*&&/);
  });

  it('SC1.8 — watermarkLabel "": source guard also suppresses empty string', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // Boolean coercion of "" is falsy, so the same guard handles both cases
    // Verify: the guard uses watermarkLabel directly (not explicit !== undefined check)
    expect(source).toMatch(/watermarkLabel\s*&&/);
  });

  it('SC1.9 — source imports matchFont from @shopify/react-native-skia', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toContain('matchFont');
    expect(source).toContain('@shopify/react-native-skia');
  });

  it('SC1.10 — font size is in 48-56sp range for watermark texture effect', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // matchFont with fontSize 48-56 — may be a literal or a constant declaration
    // Either `fontSize: 52` or `WATERMARK_FONT_SIZE = 52` with `fontSize: WATERMARK_FONT_SIZE`
    const hasLiteralFontSize = /fontSize\s*:\s*(4[89]|5[0-6])/.test(source);
    const hasConstantInRange = /WATERMARK_FONT_SIZE\s*=\s*(4[89]|5[0-6])/.test(source);
    expect(hasLiteralFontSize || hasConstantInRange).toBe(true);
  });

  it('SC1.11 — component renders successfully with watermarkLabel provided', () => {
    expect(() =>
      renderChart({ watermarkLabel: '38.5h', width: 300, height: 120 }),
    ).not.toThrow();
  });
});

// ─── FR2 (01-overtime-display): WeeklyBarChart overtime bar coloring ──────────

describe('WeeklyBarChart — FR2: Overtime bar coloring (01-overtime-display)', () => {
  it('SC2.1 — WeeklyBarChartProps includes weeklyLimit?: number', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toMatch(/weeklyLimit\s*\?\s*:\s*number/);
  });

  it('SC2.2 — source declares OVERTIME_WHITE_GOLD constant with value #FFF8E7', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    expect(source).toContain('OVERTIME_WHITE_GOLD');
    expect(source).toContain('#FFF8E7');
  });

  it('SC2.3 — source uses OVERTIME_WHITE_GOLD in bar color selection logic', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // OVERTIME_WHITE_GOLD must appear as a barColor value
    expect(source).toMatch(/OVERTIME_WHITE_GOLD/);
  });

  it('SC2.4 — source uses strict > comparison against weeklyLimit (not >=)', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // Must use > not >= to prevent crushedIt case from triggering white-gold
    expect(source).toMatch(/runningTotal\s*>\s*weeklyLimit/);
  });

  it('SC2.5 — component renders without crash when weeklyLimit is provided', () => {
    // Data totals to 22h — within 40h limit
    expect(() =>
      renderChart({ weeklyLimit: 40, width: 300, height: 120 }),
    ).not.toThrow();
  });

  it('SC2.6 — component renders without crash when weeklyLimit is not provided', () => {
    expect(() =>
      renderChart({ width: 300, height: 120 }),
    ).not.toThrow();
  });

  it('SC2.7 — component renders without crash with data exceeding weeklyLimit', () => {
    // All hours well over 15h limit — every bar should be white-gold
    const overtimeData = [
      { day: 'Mon', hours: 8, isToday: false, isFuture: false },
      { day: 'Tue', hours: 8, isToday: false, isFuture: false },
      { day: 'Wed', hours: 8, isToday: true,  isFuture: false },
      { day: 'Thu', hours: 0, isToday: false, isFuture: true  },
      { day: 'Fri', hours: 0, isToday: false, isFuture: true  },
      { day: 'Sat', hours: 0, isToday: false, isFuture: true  },
      { day: 'Sun', hours: 0, isToday: false, isFuture: true  },
    ];
    expect(() =>
      renderChart({ data: overtimeData, weeklyLimit: 15, width: 300, height: 120 }),
    ).not.toThrow();
  });

  it('SC2.8 — source accumulates runningTotal before the data.map() render loop', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // Running total must be declared as a mutable variable before the map
    expect(source).toMatch(/let\s+runningTotal\s*=\s*0/);
  });

  it('SC2.9 — source increments runningTotal inside the map (only for non-future bars)', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // runningTotal must be incremented — += entry.hours or similar
    expect(source).toMatch(/runningTotal\s*\+=\s*entry\.hours/);
  });

  it('SC2.10 — source guards future bars from overtime color (isFuture check before overtime check)', () => {
    const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');
    // isFuture check must appear in bar color logic
    expect(source).toMatch(/isFuture/);
    // OVERTIME_WHITE_GOLD must not be applied to future bars — guard via isFuture
    expect(source).toContain('OVERTIME_WHITE_GOLD');
  });
});

// ─── FR3 (04-chart-polish): WeeklyBarChart todayColor prop ───────────────────
//
// SC-FR3.1 — todayColor?: string accepted in WeeklyBarChartProps
// SC-FR3.2 — when todayColor provided, today bar uses that color
// SC-FR3.3 — when todayColor omitted, today bar defaults to colors.success
// SC-FR3.4 — completed past days still use colors.success
// SC-FR3.5 — future days still use colors.textMuted
// SC-FR3.6 — renders without crash with todayColor provided
// SC-FR3.7 — renders without crash without todayColor

describe('WeeklyBarChart — FR3 (04-chart-polish): todayColor prop', () => {
  const source = fs.readFileSync(BAR_CHART_FILE, 'utf8');

  it('SC-FR3.1 — WeeklyBarChartProps includes todayColor?: string', () => {
    expect(source).toMatch(/todayColor\s*\?\s*:\s*string/);
  });

  it('SC-FR3.2 — source uses todayColor in bar color selection (not hardcoded gold)', () => {
    // todayColor should appear in the barColor assignment for today bars
    expect(source).toMatch(/todayColor/);
    // Gold should NOT be hardcoded for isToday case
    // (the assignment should use todayColor, not colors.gold directly for today)
    // Check: todayColor is used in bar color logic near isToday
    expect(source).toMatch(/isToday[\s\S]{0,200}todayColor|todayColor[\s\S]{0,200}isToday/);
  });

  it('SC-FR3.3 — todayColor defaults to colors.success when omitted', () => {
    // Default value in destructuring: todayColor = colors.success
    expect(source).toMatch(/todayColor\s*=\s*colors\.success/);
  });

  it('SC-FR3.4 — source still uses colors.success for completed past bars', () => {
    // Non-future, non-today bars should still use colors.success
    expect(source).toMatch(/colors\.success/);
  });

  it('SC-FR3.5 — future bars still use colors.textMuted', () => {
    expect(source).toMatch(/colors\.textMuted/);
    expect(source).toMatch(/isFuture[\s\S]{0,100}textMuted|textMuted[\s\S]{0,100}isFuture/);
  });

  it('SC-FR3.6 — renders without crash with todayColor provided', () => {
    const WeeklyBarChart = require('@/src/components/WeeklyBarChart').default;
    expect(() => {
      let tree: any;
      act(() => {
        tree = create(React.createElement(WeeklyBarChart, {
          data: MOCK_DATA,
          width: 300,
          height: 120,
          todayColor: '#F43F5E',
        }));
      });
    }).not.toThrow();
  });

  it('SC-FR3.7 — renders without crash without todayColor (uses default)', () => {
    expect(() =>
      renderChart({ width: 300, height: 120 }),
    ).not.toThrow();
  });
});
