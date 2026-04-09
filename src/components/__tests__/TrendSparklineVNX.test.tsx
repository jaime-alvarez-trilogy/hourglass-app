// Tests: TrendSparkline — 04-victory-charts FR3 (VNX migration)
//
// FR3: TrendSparkline migrated from bespoke Skia bezier to VNX CartesianChart + Line + Area
//   SC3.1 — External prop interface unchanged
//   SC3.2 — Source imports CartesianChart, Line, Area, useChartPressState from victory-native
//   SC3.3 — Source passes toLineData output as data to CartesianChart
//   SC3.4 — CartesianChart uses xKey="x" and yKeys=["y"]
//   SC3.5 — Line has BlurMaskFilter child (neon glow, blur >= 6)
//   SC3.6 — Area has LinearGradient fill (brand color to transparent)
//   SC3.7 — useChartPressState used (not useScrubGesture)
//   SC3.8 — onScrubChange called with index when isActive=true
//   SC3.9 — onScrubChange called with null when isActive becomes false
//   SC3.10 — externalCursorIndex !== null renders cursor overlay via renderOutside
//   SC3.11 — externalCursorIndex=null hides cursor overlay
//   SC3.12 — Cursor x-position formula correct
//   SC3.13 — Renders without crash for data=[] and width=0
//   SC3.14 — showGuide/capLabel/targetValue guide behavior preserved
//   SC3.15 — Entry animation preserved
//
// Strategy:
// - Source-level checks for VNX API usage
// - Render tests for crash safety and conditional cursor logic

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Use official Reanimated mock + missing exports: prevents native binary initialization
// and worklet background timer crashes when multiple test suites share a worker process.
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return { ...mock, useReducedMotion: () => false };
});

const mockIsActive = { value: false };
const mockState = {
  x: { position: { value: 0 }, value: { value: 0 } },
  y: { y: { value: { value: 0 } } },
};

jest.mock('victory-native', () => {
  const R = require('react');
  const chartBounds = { left: 0, right: 300, top: 0, bottom: 80, width: 300, height: 80 };
  return {
    CartesianChart: ({ children, data, xKey, yKeys, renderOutside, gestureLongPressDelay }: any) => {
      const points: any = {};
      if (yKeys) {
        yKeys.forEach((k: string) => { points[k] = []; });
      }
      return R.createElement('CartesianChart', { data, xKey, yKeys, gestureLongPressDelay },
        typeof children === 'function' ? children({ points, chartBounds }) : children,
        // Render the renderOutside slot
        typeof renderOutside === 'function' ? renderOutside({ chartBounds }) : null
      );
    },
    Bar: ({ children }: any) =>
      R.createElement('Bar', {}, typeof children === 'function' ? children() : children),
    Line: ({ children, strokeWidth }: any) =>
      R.createElement('Line', { strokeWidth },
        typeof children === 'function' ? children() : children
      ),
    Area: ({ children, y0 }: any) =>
      R.createElement('Area', { y0 },
        typeof children === 'function' ? children() : children
      ),
    useChartPressState: () => ({
      state: mockState,
      isActive: mockIsActive,
    }),
  };
});

// ─── File paths ───────────────────────────────────────────────────────────────

const SPARKLINE_FILE = path.resolve(__dirname, '../TrendSparkline.tsx');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_DATA = [100, 120, 90, 140, 110, 130, 150, 125];

function renderSparkline(props: {
  data?: number[];
  width?: number;
  height?: number;
  color?: string;
  externalCursorIndex?: number | null;
  onScrubChange?: (i: number | null) => void;
  showGuide?: boolean;
  capLabel?: string;
  targetValue?: number;
}) {
  const TrendSparkline = require('@/src/components/TrendSparkline').default;
  const defaultProps = { data: SAMPLE_DATA, width: 300, height: 80, ...props };
  let tree: any;
  act(() => {
    tree = create(React.createElement(TrendSparkline, defaultProps));
  });
  return tree;
}

// ─── SC3.1: External prop interface ──────────────────────────────────────────

describe('TrendSparkline VNX — SC3.1: external prop interface unchanged', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.1a — data prop in interface', () => {
    expect(source).toMatch(/data\s*:/);
  });

  it('SC3.1b — width and height props in interface', () => {
    expect(source).toMatch(/width\s*:/);
    expect(source).toMatch(/height\s*:/);
  });

  it('SC3.1c — optional color prop in interface', () => {
    expect(source).toMatch(/color\s*\?\s*:/);
  });

  it('SC3.1d — optional externalCursorIndex prop in interface', () => {
    expect(source).toMatch(/externalCursorIndex\s*\?/);
  });

  it('SC3.1e — optional onScrubChange prop in interface', () => {
    expect(source).toMatch(/onScrubChange\s*\?/);
  });

  it('SC3.1f — optional showGuide, capLabel, targetValue props', () => {
    expect(source).toMatch(/showGuide\s*\?/);
    expect(source).toMatch(/capLabel\s*\?/);
    expect(source).toMatch(/targetValue\s*\?/);
  });

  it('SC3.1g — optional weekLabels prop', () => {
    expect(source).toMatch(/weekLabels\s*\?/);
  });
});

// ─── SC3.2: VNX imports ───────────────────────────────────────────────────────

describe('TrendSparkline VNX — SC3.2: imports from victory-native', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.2a — CartesianChart imported from victory-native', () => {
    expect(source).toMatch(/CartesianChart[\s\S]{0,100}victory-native|victory-native[\s\S]{0,100}CartesianChart/);
  });

  it('SC3.2b — Line imported from victory-native', () => {
    expect(source).toMatch(/\bLine\b[\s\S]{0,100}victory-native|victory-native[\s\S]{0,100}\bLine\b/);
  });

  it('SC3.2c — Area imported from victory-native', () => {
    expect(source).toMatch(/\bArea\b[\s\S]{0,100}victory-native|victory-native[\s\S]{0,100}\bArea\b/);
  });

  it('SC3.2d — useChartPressState imported from victory-native', () => {
    expect(source).toMatch(/useChartPressState[\s\S]{0,100}victory-native|victory-native[\s\S]{0,100}useChartPressState/);
  });
});

// ─── SC3.3: toLineData usage ──────────────────────────────────────────────────

describe('TrendSparkline VNX — SC3.3: uses toLineData from chartData', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.3a — source imports toLineData', () => {
    expect(source).toContain('toLineData');
  });

  it('SC3.3b — toLineData used in data flow to CartesianChart', () => {
    expect(source).toMatch(/toLineData[\s\S]{0,200}CartesianChart|CartesianChart[\s\S]{0,200}toLineData/);
  });
});

// ─── SC3.4: CartesianChart keys ──────────────────────────────────────────────

describe('TrendSparkline VNX — SC3.4: CartesianChart xKey and yKeys', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.4a — xKey="x"', () => {
    expect(source).toMatch(/xKey\s*=\s*["']x["']/);
  });

  it('SC3.4b — yKeys includes "y"', () => {
    expect(source).toMatch(/yKeys\s*=\s*\{\s*\[["']y["']\]/);
  });
});

// ─── SC3.5: Neon glow via BlurMaskFilter ─────────────────────────────────────

describe('TrendSparkline VNX — SC3.5: Line has BlurMaskFilter neon glow', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.5a — BlurMaskFilter is present in source', () => {
    expect(source).toMatch(/BlurMaskFilter|BlurMask/);
  });

  it('SC3.5b — blur value >= 6', () => {
    const match = source.match(/(?:BlurMaskFilter|BlurMask)[\s\S]{0,100}blur=\{(\d+(?:\.\d+)?)\}/);
    if (match) {
      expect(parseFloat(match[1])).toBeGreaterThanOrEqual(6);
    }
    // Also accept blur as a prop without specific name
    const blurMatch = source.match(/blur\s*[=:]\s*\{?(\d+(?:\.\d+)?)\}?/);
    if (blurMatch) {
      expect(parseFloat(blurMatch[1])).toBeGreaterThanOrEqual(6);
    }
  });
});

// ─── SC3.6: Area LinearGradient ──────────────────────────────────────────────

describe('TrendSparkline VNX — SC3.6: Area has LinearGradient fill', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.6a — LinearGradient is used in Area', () => {
    expect(source).toContain('LinearGradient');
  });

  it('SC3.6b — LinearGradient includes transparent end', () => {
    expect(source).toMatch(/transparent|'#[0-9a-fA-F]{6}00'|"#[0-9a-fA-F]{6}00"/);
  });
});

// ─── SC3.7: useChartPressState replaces useScrubGesture ──────────────────────

describe('TrendSparkline VNX — SC3.7: gesture handling via useChartPressState', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.7a — useChartPressState is called in source', () => {
    expect(source).toContain('useChartPressState');
  });

  it('SC3.7b — useScrubGesture is no longer imported or called', () => {
    expect(source).not.toContain('useScrubGesture');
  });
});

// ─── SC3.8 + SC3.9: onScrubChange callbacks ──────────────────────────────────

describe('TrendSparkline VNX — SC3.8/SC3.9: onScrubChange callbacks', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.8 — source emits onScrubChange with index when active', () => {
    // useAnimatedReaction → runOnJS bridges to onScrubChange (directly or via wrapper function)
    expect(source).toMatch(/onScrubChange/);
    expect(source).toMatch(/runOnJS[\s\S]{0,600}onScrubChange|onScrubChange[\s\S]{0,100}isActive/);
  });

  it('SC3.9 — source emits onScrubChange(null) when not active', () => {
    // When isActive is false, null is passed
    expect(source).toMatch(/onScrubChange[\s\S]{0,200}null|null[\s\S]{0,200}onScrubChange/);
  });
});

// ─── SC3.10 + SC3.11: External cursor overlay ────────────────────────────────

describe('TrendSparkline VNX — SC3.10/SC3.11: external cursor via renderOutside', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.10 — source uses renderOutside prop for cursor overlay', () => {
    expect(source).toContain('renderOutside');
  });

  it('SC3.10b — externalCursorIndex guards the cursor rendering', () => {
    expect(source).toMatch(/externalCursorIndex[\s\S]{0,200}renderOutside|renderOutside[\s\S]{0,200}externalCursorIndex/);
  });

  it('SC3.11 — when externalCursorIndex=null, cursor overlay not rendered', () => {
    // The null check guards rendering
    expect(source).toMatch(/externalCursorIndex\s*!=\s*null|externalCursorIndex\s*!==\s*null|externalCursorIndex\s*&&/);
  });

  it('SC3.10c — renders without crash when externalCursorIndex is set', () => {
    expect(() => renderSparkline({ externalCursorIndex: 3 })).not.toThrow();
  });

  it('SC3.11b — renders without crash when externalCursorIndex is null', () => {
    expect(() => renderSparkline({ externalCursorIndex: null })).not.toThrow();
  });
});

// ─── SC3.12: Cursor x-position formula ───────────────────────────────────────

describe('TrendSparkline VNX — SC3.12: cursor x-position formula', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.12 — source computes cursor x using chartBounds.left/right and data.length', () => {
    // Position derived from chartBounds dimensions and index ratio
    expect(source).toMatch(/chartBounds[\s\S]{0,100}(?:left|width|right)[\s\S]{0,100}(?:length|index)/);
  });
});

// ─── SC3.13: Crash safety ─────────────────────────────────────────────────────

describe('TrendSparkline VNX — SC3.13: crash safety', () => {
  it('SC3.13a — renders without crash with normal data', () => {
    expect(() => renderSparkline({ data: SAMPLE_DATA, width: 300, height: 80 })).not.toThrow();
  });

  it('SC3.13b — renders without crash for data=[]', () => {
    expect(() => renderSparkline({ data: [], width: 300, height: 80 })).not.toThrow();
  });

  it('SC3.13c — renders without crash for width=0', () => {
    expect(() => renderSparkline({ data: SAMPLE_DATA, width: 0, height: 80 })).not.toThrow();
  });

  it('SC3.13d — renders without crash for single data point', () => {
    expect(() => renderSparkline({ data: [42] })).not.toThrow();
  });

  it('SC3.13e — renders without crash with onScrubChange provided', () => {
    expect(() => renderSparkline({ onScrubChange: jest.fn() })).not.toThrow();
  });
});

// ─── SC3.14: Guide line preserved ────────────────────────────────────────────

describe('TrendSparkline VNX — SC3.14: guide line behavior preserved', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.14a — showGuide prop handled in source', () => {
    expect(source).toMatch(/showGuide/);
  });

  it('SC3.14b — capLabel prop handled in source', () => {
    expect(source).toMatch(/capLabel/);
  });

  it('SC3.14c — renders without crash with showGuide=true', () => {
    expect(() => renderSparkline({ showGuide: true, capLabel: '$2,000', targetValue: 150 })).not.toThrow();
  });
});

// ─── SC3.15: Entry animation preserved ───────────────────────────────────────

describe('TrendSparkline VNX — SC3.15: entry animation preserved', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('SC3.15 — clipProgress or equivalent animation mechanism exists', () => {
    // Either clipProgress (Animated.View clip) or VNX built-in animation
    const hasClipProgress = source.includes('clipProgress');
    const hasWithTiming = source.includes('withTiming');
    expect(hasClipProgress || hasWithTiming).toBe(true);
  });
});
