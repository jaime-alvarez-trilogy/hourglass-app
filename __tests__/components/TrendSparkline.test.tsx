// Tests: src/components/TrendSparkline.tsx (FR3 — animated Skia line chart)
//
// Updated for 04-victory-charts FR3: migrated from custom Skia bezier to
// VNX CartesianChart + Line + Area + BlurMask. Skia Path replaced by VNX Line.
//
// Strategy: static source-file analysis for design constraints,
// runtime render assertions for crash-free behavior and edge cases.
// @shopify/react-native-skia is mocked via __mocks__/@shopify/react-native-skia.ts

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const SPARKLINE_FILE = path.resolve(__dirname, '../../src/components/TrendSparkline.tsx');

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('victory-native', () => {
  return {
    CartesianChart: ({ children, renderOutside }: any) => {
      const R = require('react');
      const chartBounds = { left: 0, right: 200, top: 0, bottom: 60, width: 200, height: 60 };
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

// ---------------------------------------------------------------------------
// FR3 SC: Source-level assertions
// ---------------------------------------------------------------------------

describe('TrendSparkline — FR3: source constraints', () => {
  it('FR3: src/components/TrendSparkline.tsx exists', () => {
    expect(fs.existsSync(SPARKLINE_FILE)).toBe(true);
  });

  it('FR3: source imports from @/src/lib/colors', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/from ['"]@\/src\/lib\/colors['"]/);
  });

  it('FR3: source imports timingChartFill', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toContain('timingChartFill');
  });

  it('FR3: source uses withTiming (for clip animation)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toContain('withTiming');
  });

  it('FR3: source uses @shopify/react-native-skia Canvas', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toContain('@shopify/react-native-skia');
    expect(source).toContain('Canvas');
  });

  it('FR3: source uses VNX Line for line rendering (04-victory-charts FR3)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // VNX Line from victory-native, not Skia Path for main chart line
    expect(source).toContain('Line');
    expect(source).toContain('victory-native');
  });

  it('FR3: source uses Circle for cursor dot', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toContain('Circle');
  });

  it('FR3: source does NOT contain hardcoded hex colors (uses colors.ts constants)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Colors should come from colors.ts constants, not hardcoded
    // Strip comments first, then check
    const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const hexColorMatches = noComments.match(/#[0-9A-Fa-f]{6}\b/g) || [];
    expect(hexColorMatches.length).toBe(0);
  });

  it('FR3: source does NOT use StyleSheet.create()', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).not.toContain('StyleSheet.create(');
  });

  it('FR3: default color is colors.gold (source references gold)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toContain('gold');
  });

  it('FR3: default strokeWidth is 2.5 (updated in 04-chart-polish)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/strokeWidth\s*=\s*2\.5/);
  });

  it('FR3: Y domain handled via VNX domain prop (not internal padding constant)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/domain.*y|yMin|yMax/);
  });
});

// ---------------------------------------------------------------------------
// FR3 SC: Runtime render assertions
// ---------------------------------------------------------------------------

describe('TrendSparkline — FR3: runtime render', () => {
  let TrendSparkline: any;

  beforeAll(() => {
    TrendSparkline = require('../../src/components/TrendSparkline').default;
  });

  it('FR3: module exports a default function', () => {
    expect(TrendSparkline).toBeDefined();
    expect(typeof TrendSparkline).toBe('function');
  });

  it('FR3: renders without crashing with 8 data points', () => {
    expect(() => {
      act(() => {
        create(React.createElement(TrendSparkline, {
          data: [800, 750, 820, 900, 780, 850, 760, 880],
          width: 200,
          height: 60,
        }));
      });
    }).not.toThrow();
  });

  it('FR3: renders without crashing with empty data=[]', () => {
    expect(() => {
      act(() => {
        create(React.createElement(TrendSparkline, {
          data: [],
          width: 200,
          height: 60,
        }));
      });
    }).not.toThrow();
  });

  it('FR3: renders without crashing with single data point', () => {
    expect(() => {
      act(() => {
        create(React.createElement(TrendSparkline, {
          data: [750],
          width: 200,
          height: 60,
        }));
      });
    }).not.toThrow();
  });

  it('FR3: renders without crashing with 2 data points (straight line)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(TrendSparkline, {
          data: [700, 800],
          width: 200,
          height: 60,
        }));
      });
    }).not.toThrow();
  });

  it('FR3: renders without crashing with all-zero data', () => {
    expect(() => {
      act(() => {
        create(React.createElement(TrendSparkline, {
          data: [0, 0, 0, 0],
          width: 200,
          height: 60,
        }));
      });
    }).not.toThrow();
  });

  it('FR3: renders without crashing with explicit color and strokeWidth', () => {
    expect(() => {
      act(() => {
        create(React.createElement(TrendSparkline, {
          data: [800, 750, 820],
          width: 200,
          height: 60,
          color: '#00D4FF',
          strokeWidth: 3,
        }));
      });
    }).not.toThrow();
  });
});
