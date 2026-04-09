// Tests: src/components/WeeklyBarChart.tsx (FR2 — animated Skia bar chart)
//
// Updated for 04-victory-charts FR2: migrated from custom Skia Rect bars to
// VNX CartesianChart + Bar with LinearGradient fill.
// withDelay stagger replaced by clipProgress withTiming entry animation.
// OVERTIME_WHITE_GOLD (#FFF8E7) is a spec-mandated design constant (not a hex violation).
//
// Strategy: static source-file analysis for design constraints,
// runtime render assertions for crash-free behavior.
// @shopify/react-native-skia is mocked via __mocks__/@shopify/react-native-skia.ts

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const WEEKLY_BAR_FILE = path.resolve(__dirname, '../../src/components/WeeklyBarChart.tsx');

const SAMPLE_DATA = [
  { day: 'Mon', hours: 8, isToday: false, isFuture: false },
  { day: 'Tue', hours: 7.5, isToday: false, isFuture: false },
  { day: 'Wed', hours: 8, isToday: true, isFuture: false },
  { day: 'Thu', hours: 0, isToday: false, isFuture: true },
  { day: 'Fri', hours: 0, isToday: false, isFuture: true },
  { day: 'Sat', hours: 0, isToday: false, isFuture: true },
  { day: 'Sun', hours: 0, isToday: false, isFuture: true },
];

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('victory-native', () => {
  return {
    CartesianChart: ({ children }: any) => {
      const R = require('react');
      const chartBounds = { left: 0, right: 300, top: 0, bottom: 120 };
      const points = { value: [] };
      return children ? children({ points, chartBounds }) : null;
    },
    Bar: ({ children }: any) => children ?? null,
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
// FR2 SC: Source-level assertions
// ---------------------------------------------------------------------------

describe('WeeklyBarChart — FR2: source constraints', () => {
  it('FR2: src/components/WeeklyBarChart.tsx exists', () => {
    expect(fs.existsSync(WEEKLY_BAR_FILE)).toBe(true);
  });

  it('FR2: source imports from @/src/lib/colors (no hardcoded hex)', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    expect(source).toMatch(/from ['"]@\/src\/lib\/colors['"]/);
  });

  it('FR2: source imports timingChartFill from reanimated-presets', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    expect(source).toContain('timingChartFill');
    expect(source).toMatch(/from ['"]@\/src\/lib\/reanimated-presets['"]/);
  });

  it('FR2: source uses clipProgress withTiming entry animation (04-victory-charts FR2)', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    // VNX migration: withDelay stagger replaced by clipProgress clip animation
    expect(source).toContain('clipProgress');
    expect(source).toContain('withTiming');
  });

  it('FR2: source uses withTiming (not withSpring)', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    expect(source).toContain('withTiming');
    expect(source).not.toContain('withSpring');
  });

  it('FR2: source uses @shopify/react-native-skia Canvas (for watermark overlay)', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    expect(source).toContain('@shopify/react-native-skia');
    expect(source).toContain('Canvas');
  });

  it('FR2: source uses VNX Bar for bar rendering (04-victory-charts FR2)', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    // VNX migration: Skia Rect replaced by VNX Bar
    expect(source).toContain('Bar');
    expect(source).toContain('victory-native');
  });

  it('FR2: source does NOT contain hardcoded hex colors except OVERTIME_WHITE_GOLD design constant', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    // Strip comments first, then check
    const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const hexMatches = noComments.match(/#[0-9A-Fa-f]{6}\b/g) || [];
    // Only allowed hex: OVERTIME_WHITE_GOLD #FFF8E7 (spec-mandated design constant)
    const disallowedHex = hexMatches.filter(h => h.toUpperCase() !== '#FFF8E7');
    expect(disallowedHex).toEqual([]);
  });

  it('FR2: source does NOT use StyleSheet.create()', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    expect(source).not.toContain('StyleSheet.create(');
  });

  it('FR2: overtime coloring uses running cumulative total (runningTotal > weeklyLimit)', () => {
    const source = fs.readFileSync(WEEKLY_BAR_FILE, 'utf8');
    // The overtime logic: runningTotal exceeds weeklyLimit → OVERTIME_WHITE_GOLD
    expect(source).toMatch(/runningTotal/);
    expect(source).toMatch(/weeklyLimit/);
  });
});

// ---------------------------------------------------------------------------
// FR2 SC: Runtime render assertions
// ---------------------------------------------------------------------------

describe('WeeklyBarChart — FR2: runtime render', () => {
  let WeeklyBarChart: any;

  beforeAll(() => {
    WeeklyBarChart = require('../../src/components/WeeklyBarChart').default;
  });

  it('FR2: module exports a default function', () => {
    expect(WeeklyBarChart).toBeDefined();
    expect(typeof WeeklyBarChart).toBe('function');
  });

  it('FR2: renders without crashing with 7-day data', () => {
    expect(() => {
      act(() => {
        create(React.createElement(WeeklyBarChart, {
          data: SAMPLE_DATA,
          width: 300,
          height: 120,
        }));
      });
    }).not.toThrow();
  });

  it('FR2: renders without crashing with empty data=[]', () => {
    expect(() => {
      act(() => {
        create(React.createElement(WeeklyBarChart, {
          data: [],
          width: 300,
          height: 120,
        }));
      });
    }).not.toThrow();
  });

  it('FR2: renders without crashing with explicit maxHours', () => {
    expect(() => {
      act(() => {
        create(React.createElement(WeeklyBarChart, {
          data: SAMPLE_DATA,
          maxHours: 10,
          width: 300,
          height: 120,
        }));
      });
    }).not.toThrow();
  });

  it('FR2: renders without crashing when all bars are future', () => {
    const futureDays = SAMPLE_DATA.map(d => ({ ...d, isFuture: true, isToday: false, hours: 0 }));
    expect(() => {
      act(() => {
        create(React.createElement(WeeklyBarChart, {
          data: futureDays,
          width: 300,
          height: 120,
        }));
      });
    }).not.toThrow();
  });

  it('FR2: renders without crashing with width=0 (guard case)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(WeeklyBarChart, {
          data: SAMPLE_DATA,
          width: 0,
          height: 120,
        }));
      });
    }).not.toThrow();
  });
});
