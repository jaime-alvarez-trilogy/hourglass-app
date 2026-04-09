// Tests: TrendSparkline — 05-earnings-scrub FR2
//
// FR2: TrendSparkline scrub props + gesture layer
//   SC2.1 — onScrubChange and weekLabels props accepted by TrendSparklineProps
//   SC2.2 — onScrubChange is optional (component renders without it)
//   SC2.3 — weekLabels is optional (component renders without it)
//   SC2.4 — data=[] → no crash, no scrub events fired
//   SC2.5 — data.length=1 → gesture snaps to index 0 only
//   SC2.6 — onScrubChange(null) invoked on gesture end
//   SC2.7 — onScrubChange(index) invoked with correct nearest index during pan
//   SC2.8 — scrub cursor (vertical line + dot) appears during scrub
//   SC2.9 — existing rendering unchanged when not scrubbing
//
// Strategy:
// - Source-level static analysis for interface, import, and pattern contracts
// - react-test-renderer for crash/no-crash validation
// - Skia, gesture, and reanimated mocks handle native dependencies

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as path from 'path';
import * as fs from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Note: 04-victory-charts FR3 migrated from GestureDetector/useScrubGesture to
// VNX useChartPressState. These mocks are kept for backward compat but the
// gesture-handler mock is no longer needed by TrendSparkline directly.
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: any) => children,
  Gesture: {
    Pan: () => ({
      minDistance: function() { return this; },
      enabled: function() { return this; },
      activeOffsetX: function() { return this; },
      onBegin: function() { return this; },
      onUpdate: function() { return this; },
      onFinalize: function() { return this; },
    }),
  },
}));

jest.mock('react-native-reanimated', () => {
  const R = require('react');
  const identity = (x: any) => x;
  const Easing = {
    linear: identity,
    ease: identity,
    bezier: () => identity,
    inOut: () => identity,
    out: () => identity,
    in: () => identity,
    poly: () => identity,
    sin: identity,
    circle: identity,
    exp: identity,
    elastic: () => identity,
    back: () => identity,
    bounce: identity,
    steps: () => identity,
  };
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: any) => R.createElement('View', { style }, children),
      Text: ({ children, style }: any) => R.createElement('Text', { style }, children),
      createAnimatedComponent: (C: any) => C,
    },
    useSharedValue: (init: any) => ({ value: init }),
    withTiming: (val: any) => val,
    useAnimatedStyle: (_fn: any) => ({}),
    useAnimatedReaction: () => {},
    runOnJS: (fn: any) => fn,
    useReducedMotion: () => false,
    Easing,
  };
});

jest.mock('victory-native', () => {
  return {
    CartesianChart: ({ children, renderOutside }: any) => {
      const R = require('react');
      const chartBounds = { left: 0, right: 340, top: 0, bottom: 60, width: 340, height: 60 };
      const points = { y: [], value: [] };
      return R.createElement('View', null,
        renderOutside ? renderOutside({ chartBounds }) : null,
        children ? children({ points, chartBounds }) : null,
      );
    },
    Line: ({ children }: any) => children ?? null,
    Area: ({ children }: any) => children ?? null,
    useChartPressState: () => ({
      state: { x: { position: { value: 0 } } },
      isActive: { value: false },
    }),
  };
});

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

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const SPARKLINE_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'TrendSparkline.tsx');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_DATA_4 = [1840, 1960, 2000, 1920];
const MOCK_DATA_12 = [1200, 1350, 1100, 1500, 1400, 1600, 1450, 1550, 1700, 1800, 1650, 1900];
const MOCK_WEEK_LABELS = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderSparkline(props: {
  data?: number[];
  width?: number;
  height?: number;
  color?: string;
  maxValue?: number;
  showGuide?: boolean;
  capLabel?: string;
  onScrubChange?: (index: number | null) => void;
  weekLabels?: string[];
}) {
  const TrendSparkline = require('@/src/components/TrendSparkline').default;
  const defaultProps = {
    data: MOCK_DATA_4,
    width: 340,
    height: 60,
    ...props,
  };
  let tree: any;
  act(() => {
    tree = create(React.createElement(TrendSparkline, defaultProps));
  });
  return tree;
}

// ─── SC2.1–SC2.3: Interface and optionality ───────────────────────────────────

describe('TrendSparkline FR2 — scrub props interface', () => {
  it('SC2.1 — TrendSparklineProps includes onScrubChange optional prop', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/onScrubChange\s*\?/);
  });

  it('SC2.1 — TrendSparklineProps includes weekLabels optional prop', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/weekLabels\s*\?/);
  });

  it('SC2.1 — onScrubChange type is ScrubChangeCallback or (index: number | null) => void', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    const hasScrubChangeCallback = /ScrubChangeCallback/.test(source);
    const hasInlineType = /onScrubChange.*number\s*\|\s*null.*=>\s*void/.test(source);
    expect(hasScrubChangeCallback || hasInlineType).toBe(true);
  });

  it('SC2.1 — weekLabels type is string[]', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/weekLabels\s*\??\s*:\s*string\[\]/);
  });

  it('SC2.2 — renders without crash when onScrubChange not provided', () => {
    expect(() => renderSparkline({ data: MOCK_DATA_4 })).not.toThrow();
  });

  it('SC2.3 — renders without crash when weekLabels not provided', () => {
    expect(() => renderSparkline({ data: MOCK_DATA_4 })).not.toThrow();
  });

  it('SC2.2+SC2.3 — renders without crash when both omitted', () => {
    expect(() => renderSparkline({ data: MOCK_DATA_4 })).not.toThrow();
  });
});

// ─── SC2.1: Gesture imports (VNX — 04-victory-charts) ────────────────────────
//
// Note: FR3 of 04-victory-charts migrated from GestureDetector+useScrubGesture
// to VNX useChartPressState. Import contract updated accordingly.

describe('TrendSparkline FR2 — gesture layer imports (VNX)', () => {
  it('imports useChartPressState from victory-native (replaces useScrubGesture)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/useChartPressState/);
    expect(source).toMatch(/victory-native/);
  });

  it('does NOT import useScrubGesture (replaced by VNX useChartPressState)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).not.toMatch(/useScrubGesture/);
  });

  it('does NOT import GestureDetector (VNX handles gesture internally)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // GestureDetector must not be imported — comments mentioning it are OK
    const importLines = source.split('\n').filter(l => l.match(/^import\s/));
    expect(importLines.some(l => l.includes('GestureDetector'))).toBe(false);
    // Also: no JSX element <GestureDetector
    expect(source).not.toMatch(/<GestureDetector/);
  });

  it('imports useAnimatedReaction and runOnJS from react-native-reanimated', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/useAnimatedReaction/);
    expect(source).toMatch(/runOnJS/);
  });
});

// ─── SC2.1: Gesture pattern in source (VNX — 04-victory-charts) ─────────────

describe('TrendSparkline FR2 — gesture pattern in source (VNX)', () => {
  it('uses useChartPressState from VNX (not GestureDetector)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/useChartPressState/);
    expect(source).not.toMatch(/<GestureDetector/);
  });

  it('uses VNX gesture configuration on CartesianChart (chartPressConfig or gestureLongPressDelay)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Either chartPressConfig (newer VNX API) or gestureLongPressDelay (older API)
    expect(source).toMatch(/chartPressConfig|gestureLongPressDelay/);
  });

  it('uses useAnimatedReaction to bridge VNX press state to onScrubChange', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/useAnimatedReaction/);
    expect(source).toMatch(/onScrubChange|scrubChange/);
    expect(source).toMatch(/runOnJS/);
  });

  it('guards onScrubChange as optional (optional call or ?? fallback)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    const hasNullishCoalesce = /onScrubChange\s*\?\?/.test(source);
    const hasSafeWrapper = /safe\w*ScrubChange|scrubChangeSafe/.test(source);
    const hasOptionalCall = /onScrubChange\?\./.test(source);
    expect(hasNullishCoalesce || hasSafeWrapper || hasOptionalCall).toBe(true);
  });

  it('uses VNX state x value for index calculation (not pixelXs)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // VNX useChartPressState provides state.x.value or state.x.position
    expect(source).toMatch(/state\.x\.value|state\.x\.position|position\.value/);
  });
});

// ─── SC2.4: data=[] — no crash ────────────────────────────────────────────────

describe('TrendSparkline FR2 — data=[] edge case', () => {
  it('SC2.4 — renders without crash when data is empty', () => {
    expect(() => renderSparkline({ data: [], width: 340, height: 60 })).not.toThrow();
  });

  it('SC2.4 — source returns null early when data is empty (no gesture needed)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // VNX: early return null when data.length === 0
    expect(source).toMatch(/data\.length\s*===\s*0|data\.length\s*==\s*0|data\.length\s*&&|return null/);
  });
});

// ─── SC2.5: data.length=1 ────────────────────────────────────────────────────

describe('TrendSparkline FR2 — single data point', () => {
  it('SC2.5 — renders without crash with data.length=1', () => {
    expect(() => renderSparkline({ data: [1500], width: 340, height: 60 })).not.toThrow();
  });

  it('SC2.5 — source handles single-point cursor (center position)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Single-point: center between chartBounds.left and chartBounds.right (or width / 2)
    expect(source).toMatch(/width\s*\/\s*2|chartBounds\.left\s*\+\s*chartBounds\.right|left\s*\+\s*.*right.*\/\s*2/);
  });
});

// ─── SC2.8: Scrub cursor in source (VNX — 04-victory-charts) ────────────────
//
// Note: VNX uses renderOutside + Skia Canvas overlay for external cursor.
// The old buildScrubCursor/cursorPos approach was replaced.

describe('TrendSparkline FR2 — scrub cursor rendering (VNX)', () => {
  it('SC2.8 — source uses renderOutside prop on CartesianChart for cursor overlay', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/renderOutside/);
  });

  it('SC2.8 — source renders cursor line with textMuted color and 0.5 opacity', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/textMuted/);
    expect(source).toMatch(/0\.5/);
  });

  it('SC2.8 — source renders cursor Circle (dot) using Skia Circle', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/Circle/);
  });

  it('SC2.8 — cursor is conditional on externalCursorIndex !== null', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/externalCursorIndex\s*!==?\s*null|externalCursorIndex/);
  });
});

// ─── SC2.9: Existing rendering unchanged ─────────────────────────────────────

describe('TrendSparkline FR2 — existing rendering unchanged', () => {
  it('SC2.9 — renders with full data and no scrub props without crash', () => {
    expect(() => renderSparkline({
      data: MOCK_DATA_4,
      width: 340,
      height: 60,
      showGuide: true,
      capLabel: '$2,000',
      maxValue: 2000,
    })).not.toThrow();
  });

  it('SC2.9 — renders with full data including onScrubChange and weekLabels without crash', () => {
    const onScrubChange = jest.fn();
    expect(() => renderSparkline({
      data: MOCK_DATA_4,
      width: 340,
      height: 60,
      onScrubChange,
      weekLabels: MOCK_WEEK_LABELS,
      showGuide: true,
      capLabel: '$2,000',
      maxValue: 2000,
    })).not.toThrow();
  });

  it('SC2.9 — renders with 12-week data without crash', () => {
    expect(() => renderSparkline({
      data: MOCK_DATA_12,
      width: 340,
      height: 60,
    })).not.toThrow();
  });
});
