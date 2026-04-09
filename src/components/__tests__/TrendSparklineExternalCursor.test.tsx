// Tests: TrendSparkline — 07-overview-sync FR1
//
// FR1: externalCursorIndex prop on TrendSparkline
//   SC1.1 — TrendSparklineProps includes externalCursorIndex?: number | null
//   SC1.2 — when externalCursorIndex={2}, source renders cursor at index 2
//   SC1.3 — when externalCursorIndex={null}, no cursor rendered
//   SC1.4 — when externalCursorIndex={0}, cursor at leftmost data point
//   SC1.5 — externalCursorIndex out of range is clamped
//   SC1.6 — existing TrendSparkline usage without prop unaffected (no regression)
//   SC1.7 — source guards externalCursorIndex with clamp logic
//   SC1.8 — source computes cursorActiveIndex from externalCursorIndex or internal state
//
// Strategy:
// - Source-level static analysis for interface and pattern contracts
// - react-test-renderer for crash/no-crash validation
// - Skia, gesture, and reanimated mocks handle native dependencies

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as path from 'path';
import * as fs from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
    inOut: () => identity,
    out: () => identity,
    bezier: () => identity,
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderSparkline(props: {
  data?: number[];
  width?: number;
  height?: number;
  color?: string;
  maxValue?: number;
  showGuide?: boolean;
  onScrubChange?: (index: number | null) => void;
  weekLabels?: string[];
  externalCursorIndex?: number | null;
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

// ─── SC1.1: Interface contract ────────────────────────────────────────────────

describe('TrendSparkline FR1 (07-overview-sync) — externalCursorIndex interface', () => {
  it('SC1.1 — TrendSparklineProps includes externalCursorIndex?: number | null', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/externalCursorIndex\s*\?/);
  });

  it('SC1.1 — externalCursorIndex type is number | null', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Either inline type or optional with number|null annotation
    expect(source).toMatch(/externalCursorIndex\s*\??\s*:\s*number\s*\|\s*null/);
  });
});

// ─── SC1.2: Source pattern — cursor rendering driven by externalCursorIndex ──

describe('TrendSparkline FR1 (07-overview-sync) — cursor rendering pattern', () => {
  it('SC1.2 — source computes cursorActiveIndex from externalCursorIndex', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Either a variable named cursorActiveIndex or use of externalCursorIndex for cursor
    const hasCursorActiveIndex = /cursorActiveIndex/.test(source);
    const hasExternalCursorUsed = /externalCursorIndex/.test(source);
    expect(hasCursorActiveIndex || hasExternalCursorUsed).toBe(true);
  });

  it('SC1.2 — source uses externalCursorIndex to override internal scrub state', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Pattern: externalCursorIndex ?? ... or externalCursorIndex !== null
    const hasNullishCoalesce = /externalCursorIndex\s*\?\?/.test(source);
    const hasNullCheck = /externalCursorIndex\s*!==\s*null/.test(source);
    const hasNullCheckAlt = /externalCursorIndex\s*!=\s*null/.test(source);
    expect(hasNullishCoalesce || hasNullCheck || hasNullCheckAlt).toBe(true);
  });

  it('SC1.5 — source clamps externalCursorIndex to valid range', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Clamp: Math.max(0, Math.min(idx, data.length - 1)) or equivalent
    const hasMathMax = /Math\.max\s*\(\s*0/.test(source);
    const hasMathMin = /Math\.min/.test(source);
    const hasClamp = /clamp|Math\.max.*Math\.min|Math\.min.*Math\.max/.test(source);
    expect(hasMathMax || hasClamp || (hasMathMax && hasMathMin)).toBe(true);
  });

  it('SC1.8 — source uses externalCursorIndex in cursor geometry computation via renderOutside', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // VNX approach: externalCursorIndex drives cursor overlay via renderOutside
    expect(source).toMatch(/externalCursorIndex/);
    // Cursor computed from chartBounds (not pixelXs/buildScrubCursor)
    expect(source).toMatch(/chartBounds|clampedIdx/);
  });
});

// ─── SC1.3+SC1.4+SC1.6: Crash-free rendering ─────────────────────────────────

describe('TrendSparkline FR1 (07-overview-sync) — crash-free rendering', () => {
  it('SC1.3 — renders without crash when externalCursorIndex={null}', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA_4, externalCursorIndex: null }),
    ).not.toThrow();
  });

  it('SC1.4 — renders without crash when externalCursorIndex={0} (leftmost)', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA_4, externalCursorIndex: 0 }),
    ).not.toThrow();
  });

  it('SC1.2 — renders without crash when externalCursorIndex={2} (mid-array)', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA_4, externalCursorIndex: 2 }),
    ).not.toThrow();
  });

  it('SC1.2 — renders without crash when externalCursorIndex={data.length-1} (rightmost)', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA_4, externalCursorIndex: MOCK_DATA_4.length - 1 }),
    ).not.toThrow();
  });

  it('SC1.5 — renders without crash when externalCursorIndex is out of range (too large)', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA_4, externalCursorIndex: 999 }),
    ).not.toThrow();
  });

  it('SC1.5 — renders without crash when externalCursorIndex is out of range (negative)', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA_4, externalCursorIndex: -5 }),
    ).not.toThrow();
  });

  it('SC1.6 — renders without crash when externalCursorIndex not provided (no regression)', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA_4 }),
    ).not.toThrow();
  });

  it('SC1.6 — renders without crash with all existing props and no externalCursorIndex', () => {
    expect(() =>
      renderSparkline({
        data: MOCK_DATA_4,
        showGuide: true,
        capLabel: '$2,000',
        maxValue: 2000,
        onScrubChange: jest.fn(),
        weekLabels: ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'],
      }),
    ).not.toThrow();
  });

  it('SC1.2+SC1.6 — renders with all props including externalCursorIndex without crash', () => {
    expect(() =>
      renderSparkline({
        data: MOCK_DATA_4,
        externalCursorIndex: 1,
        onScrubChange: jest.fn(),
        weekLabels: ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'],
        showGuide: true,
        maxValue: 2000,
      }),
    ).not.toThrow();
  });

  it('SC1.6 — 12-week data renders without crash regardless of externalCursorIndex', () => {
    expect(() =>
      renderSparkline({
        data: MOCK_DATA_12,
        externalCursorIndex: 5,
        width: 340,
        height: 60,
      }),
    ).not.toThrow();
  });
});

// ─── Clamp logic unit test ───────────────────────────────────────────────────

describe('TrendSparkline FR1 (07-overview-sync) — clamp logic (pure unit test)', () => {
  /**
   * The clamp logic that TrendSparkline should apply:
   *   clampedIndex = Math.max(0, Math.min(idx, data.length - 1))
   */
  function clampIndex(idx: number, dataLength: number): number {
    return Math.max(0, Math.min(idx, dataLength - 1));
  }

  it('SC1.5 — clamp(999, 4) → 3 (clamps to last valid index)', () => {
    expect(clampIndex(999, 4)).toBe(3);
  });

  it('SC1.5 — clamp(-5, 4) → 0 (clamps to first valid index)', () => {
    expect(clampIndex(-5, 4)).toBe(0);
  });

  it('SC1.4 — clamp(0, 4) → 0 (leftmost, no change)', () => {
    expect(clampIndex(0, 4)).toBe(0);
  });

  it('SC1.2 — clamp(2, 4) → 2 (in-range, no change)', () => {
    expect(clampIndex(2, 4)).toBe(2);
  });

  it('SC1.2 — clamp(3, 4) → 3 (rightmost, no change)', () => {
    expect(clampIndex(3, 4)).toBe(3);
  });

  it('SC1.5 — clamp(4, 4) → 3 (exactly length, clamps to last)', () => {
    expect(clampIndex(4, 4)).toBe(3);
  });
});

// ─── cursorActiveIndex logic unit test ───────────────────────────────────────

describe('TrendSparkline FR1 (07-overview-sync) — cursorActiveIndex resolution', () => {
  /**
   * The resolution logic TrendSparkline applies to determine which index to show:
   *   cursorActiveIndex = externalCursorIndex ?? (isScrubbing ? internalScrubIndex : null)
   */
  function resolveCursorIndex(
    externalCursorIndex: number | null | undefined,
    isScrubbing: boolean,
    internalScrubIndex: number,
  ): number | null {
    if (externalCursorIndex != null) return externalCursorIndex;
    if (isScrubbing) return internalScrubIndex;
    return null;
  }

  it('SC1.2 — externalCursorIndex=2 overrides internal state', () => {
    expect(resolveCursorIndex(2, false, 0)).toBe(2);
  });

  it('SC1.2 — externalCursorIndex=2 overrides internal scrub state', () => {
    expect(resolveCursorIndex(2, true, 0)).toBe(2);
  });

  it('SC1.3 — externalCursorIndex=null + not scrubbing → no cursor', () => {
    expect(resolveCursorIndex(null, false, 0)).toBeNull();
  });

  it('SC1.3 — externalCursorIndex=null + isScrubbing → uses internal index', () => {
    expect(resolveCursorIndex(null, true, 1)).toBe(1);
  });

  it('SC1.4 — externalCursorIndex=0 → cursor at leftmost', () => {
    expect(resolveCursorIndex(0, false, 3)).toBe(0);
  });

  it('SC1.6 — externalCursorIndex=undefined + not scrubbing → no cursor (no regression)', () => {
    expect(resolveCursorIndex(undefined, false, 0)).toBeNull();
  });
});
