// Tests: DayPatternChart — 02-chart-component
//
// FR1 — Component file and exports
//   SC1.1 — file exists at src/components/DayPatternChart.tsx
//   SC1.2 — exports DayPatternChart function
//   SC1.3 — exports DayPatternChartProps interface
//   SC1.4 — props include current, prev, width, height, trendThreshold
//
// FR2 — Bar rendering
//   SC2.1 — source maps over 7 day indices
//   SC2.2 — bar height derived from maxHours (Math.max)
//   SC2.3 — minimum 2px stub present
//   SC2.4 — imports colors from @/src/lib/colors
//   SC2.5 — uses colors.success for work day bars
//   SC2.6 — uses colors.surface for rest-day stub
//
// FR3 — Trend arrows
//   SC3.1 — source computes delta between current[i] and prev[i]
//   SC3.2 — up-arrow when delta >= trendThreshold
//   SC3.3 — down-arrow when delta <= -trendThreshold
//   SC3.4 — no arrow when prev is null/undefined (guard present)
//   SC3.5 — no arrow on rest days (current[i] < 0.5 guard)
//   SC3.6 — imports TREND_THRESHOLD from @/src/lib/dayPatternUtils
//
// FR4 — Day labels
//   SC4.1 — source contains DAY_LABELS or equivalent 7-element array
//   SC4.2 — labels array contains 'M' and 'S'
//   SC4.3 — rest-day labels use colors.textMuted
//
// FR5 — Arrow colors
//   SC5.1 — up-arrow uses colors.success
//   SC5.2 — down-arrow uses colors.warning
//
// Smoke tests — render without crash under various prop combinations
//
// Strategy: static source analysis (fs.readFileSync) for interface and logic
// details, consistent with WeeklyBarChart.test.tsx and TrendSparkline.test.tsx.
// Smoke tests use react-test-renderer for crash validation.

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as path from 'path';
import * as fs from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return { ...mock, useReducedMotion: () => false };
});

// DayPatternChart uses Skia Canvas + RoundedRect + LinearGradient (matches WeeklyBarChart).
jest.mock('@shopify/react-native-skia');

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const CHART_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'DayPatternChart.tsx');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CURRENT_TYPICAL = [7.5, 8.0, 6.5, 7.0, 6.0, 0, 0];   // M-F work, Sat-Sun rest
const PREV_TYPICAL    = [6.5, 7.0, 7.0, 6.0, 5.5, 0, 0];
const ALL_ZEROS       = [0, 0, 0, 0, 0, 0, 0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderChart(props: {
  current?: number[];
  prev?: number[] | null;
  width?: number;
  height?: number;
  trendThreshold?: number;
}) {
  const DayPatternChart = require('@/src/components/DayPatternChart').DayPatternChart
    ?? require('@/src/components/DayPatternChart').default;
  const defaultProps = {
    current: CURRENT_TYPICAL,
    width: 280,
    height: 80,
    ...props,
  };
  let tree: any;
  act(() => {
    tree = create(React.createElement(DayPatternChart, defaultProps));
  });
  return tree;
}

// ─── FR1 — Component file and exports ────────────────────────────────────────

describe('DayPatternChart — FR1: Component file and exports', () => {
  it('SC1.1 — file exists at src/components/DayPatternChart.tsx', () => {
    expect(fs.existsSync(CHART_FILE)).toBe(true);
  });

  it('SC1.2 — exports DayPatternChart function (named or default)', () => {
    const source = fs.readFileSync(CHART_FILE, 'utf8');
    // Named export: export function DayPatternChart or export const DayPatternChart
    // OR default export of a function named DayPatternChart
    expect(source).toMatch(
      /export\s+(function|const)\s+DayPatternChart|export\s+default\s+function\s+DayPatternChart/,
    );
  });

  it('SC1.3 — exports DayPatternChartProps interface', () => {
    const source = fs.readFileSync(CHART_FILE, 'utf8');
    expect(source).toMatch(/export\s+interface\s+DayPatternChartProps/);
  });

  it('SC1.4 — props include current, prev, width, height, trendThreshold', () => {
    const source = fs.readFileSync(CHART_FILE, 'utf8');
    expect(source).toMatch(/current\s*:\s*number\[\]/);
    expect(source).toMatch(/prev\s*\?\s*:\s*number\[\]\s*\|\s*null/);
    expect(source).toMatch(/width\s*:\s*number/);
    expect(source).toMatch(/height\s*:\s*number/);
    expect(source).toMatch(/trendThreshold\s*\?\s*:\s*number/);
  });
});

// ─── FR2 — Bar rendering ─────────────────────────────────────────────────────

describe('DayPatternChart — FR2: Bar rendering', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(CHART_FILE, 'utf8');
  });

  it('SC2.1 — source maps over 7 day indices (DAY_LABELS or [0..6])', () => {
    // Either DAY_LABELS.map or an array literal with 7 entries or explicit 7-index loop
    const has7LabelArray = /DAY_LABELS/.test(source);
    const has7ElementMap = /\[0,\s*1,\s*2,\s*3,\s*4,\s*5,\s*6\]\.map|Array\.from\(\{\s*length:\s*7/.test(source);
    expect(has7LabelArray || has7ElementMap).toBe(true);
  });

  it('SC2.2 — bar height derived from maxHours using Math.max', () => {
    expect(source).toMatch(/Math\.max/);
    expect(source).toMatch(/maxHours/);
  });

  it('SC2.3 — minimum 2px bar height stub present', () => {
    // Accepts: Math.max(expr, 2), Math.max(expr, CONST) where CONST=2,
    // ternary with literal 2, or a named constant assigned the value 2 used with Math.max.
    const hasMathMaxWith2 = /Math\.max[\s\S]{0,80},\s*2\s*\)/.test(source);
    const hasConstant2 = /=\s*2[^0-9\.][\s\S]{0,200}Math\.max|Math\.max[\s\S]{0,200}=\s*2[^0-9\.]/.test(source);
    const hasLiteral2Ternary = /:\s*2\s*;|,\s*2\s*\)|MIN_BAR_H/.test(source);
    expect(hasMathMaxWith2 || hasConstant2 || hasLiteral2Ternary).toBe(true);
  });

  it('SC2.4 — imports colors from @/src/lib/colors', () => {
    expect(source).toMatch(/from\s+['"]@\/src\/lib\/colors['"]/);
  });

  it('SC2.5 — uses colors.success for work day bars', () => {
    expect(source).toContain('colors.success');
  });

  it('SC2.6 — uses colors.surface for rest-day stub', () => {
    expect(source).toContain('colors.surface');
  });
});

// ─── FR3 — Trend arrows ───────────────────────────────────────────────────────

describe('DayPatternChart — FR3: Trend arrows', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(CHART_FILE, 'utf8');
  });

  it('SC3.1 — source computes delta between current[i] and prev[i]', () => {
    expect(source).toMatch(/delta/);
    // delta computed as current minus prev (in some form)
    expect(source).toMatch(/current\[i\]\s*-\s*prev\[i\]|delta\s*=[\s\S]{0,60}current[\s\S]{0,30}prev/);
  });

  it('SC3.2 — up-arrow shown when delta >= trendThreshold', () => {
    expect(source).toMatch(/delta\s*>=\s*\w*[Tt]hreshold|delta\s*>=\s*TREND_THRESHOLD/);
  });

  it('SC3.3 — down-arrow shown when delta <= -trendThreshold', () => {
    expect(source).toMatch(/delta\s*<=\s*-\w*[Tt]hreshold|delta\s*<=\s*-TREND_THRESHOLD/);
  });

  it('SC3.4 — no arrow when prev is null or undefined (guard present)', () => {
    // Guard patterns: !prev, !!prev, prev === null, prev == null, prev !== null
    expect(source).toMatch(/!prev|!!prev|prev\s*===?\s*null|prev\s*!==?\s*null|prev\s*==\s*null/);
  });

  it('SC3.5 — no arrow on rest days (current[i] < 0.5 guard)', () => {
    expect(source).toMatch(/current\[i\]\s*[<>=!]{1,2}\s*0\.5|isWorkDay/);
  });

  it('SC3.6 — imports TREND_THRESHOLD from @/src/lib/dayPatternUtils', () => {
    expect(source).toMatch(/TREND_THRESHOLD/);
    expect(source).toMatch(/from\s+['"]@\/src\/lib\/dayPatternUtils['"]/);
  });
});

// ─── FR4 — Day labels ─────────────────────────────────────────────────────────

describe('DayPatternChart — FR4: Day labels', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(CHART_FILE, 'utf8');
  });

  it('SC4.1 — source contains DAY_LABELS constant or equivalent 7-element array', () => {
    const hasDayLabels = /DAY_LABELS/.test(source);
    // Or an inline array literal with 7 single-char string elements
    const hasInlineLabels = /\[\s*'M'[\s\S]{0,60}'S'\s*\]/.test(source);
    expect(hasDayLabels || hasInlineLabels).toBe(true);
  });

  it("SC4.2 — labels array contains 'M' and 'S' entries", () => {
    expect(source).toContain("'M'");
    expect(source).toContain("'S'");
  });

  it('SC4.3 — rest-day labels use colors.textMuted', () => {
    expect(source).toContain('colors.textMuted');
  });
});

// ─── FR5 — Arrow colors ───────────────────────────────────────────────────────

describe('DayPatternChart — FR5: Arrow colors', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(CHART_FILE, 'utf8');
  });

  it('SC5.1 — up-arrow uses colors.success', () => {
    // success appears as bar color AND up-arrow color
    const successCount = (source.match(/colors\.success/g) ?? []).length;
    expect(successCount).toBeGreaterThanOrEqual(2);
  });

  it('SC5.2 — down-arrow uses colors.warning', () => {
    expect(source).toContain('colors.warning');
  });
});

// ─── Smoke tests ──────────────────────────────────────────────────────────────

describe('DayPatternChart — Smoke tests', () => {
  it('renders without crash with typical current + prev arrays', () => {
    expect(() =>
      renderChart({ current: CURRENT_TYPICAL, prev: PREV_TYPICAL }),
    ).not.toThrow();
  });

  it('renders without crash with prev = null (no arrows)', () => {
    expect(() =>
      renderChart({ current: CURRENT_TYPICAL, prev: null }),
    ).not.toThrow();
  });

  it('renders without crash with prev = undefined (no arrows)', () => {
    expect(() =>
      renderChart({ current: CURRENT_TYPICAL, prev: undefined }),
    ).not.toThrow();
  });

  it('renders without crash with all-zero current (no work days)', () => {
    expect(() =>
      renderChart({ current: ALL_ZEROS, prev: null }),
    ).not.toThrow();
  });

  it('renders without crash with custom trendThreshold', () => {
    expect(() =>
      renderChart({ current: CURRENT_TYPICAL, prev: PREV_TYPICAL, trendThreshold: 1.0 }),
    ).not.toThrow();
  });

  it('renders without crash with width=0 (zero-width edge case)', () => {
    expect(() =>
      renderChart({ current: CURRENT_TYPICAL, prev: null, width: 0 }),
    ).not.toThrow();
  });
});
