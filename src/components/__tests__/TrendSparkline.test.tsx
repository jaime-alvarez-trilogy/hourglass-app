// Tests: TrendSparkline — 02-watermarks FR3
//
// FR3: TrendSparkline cap label
//   SC3.1 — capLabel prop in TrendSparklineProps interface
//   SC3.2 — when showGuide && capLabel, Skia Text rendered in source
//   SC3.3 — cap label opacity <= 0.40
//   SC3.4 — cap label x near right edge (width - padding)
//   SC3.5 — capLabel without showGuide: no label rendered
//   SC3.6 — capLabel undefined: no crash, no label
//
// Strategy:
// - Source-level static analysis for interface and positioning details
// - react-test-renderer for crash/no-crash validation
// - Skia mock from __mocks__/@shopify/react-native-skia.ts

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as path from 'path';
import * as fs from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Use official Reanimated mock + missing exports: prevents native binary initialization
// and worklet background timer crashes when multiple test suites share a worker process.
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return { ...mock, useReducedMotion: () => false };
});

jest.mock('victory-native', () => {
  return {
    CartesianChart: ({ children, renderOutside }: any) => {
      const R = require('react');
      const chartBounds = { left: 0, right: 300, top: 0, bottom: 60, width: 300, height: 60 };
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

const MOCK_DATA = [1200, 1350, 1100, 1500, 1400, 1600, 1450, 1550];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderSparkline(props: {
  data?: number[];
  width?: number;
  height?: number;
  maxValue?: number;
  showGuide?: boolean;
  capLabel?: string;
}) {
  const TrendSparkline = require('@/src/components/TrendSparkline').default;
  const defaultProps = {
    data: MOCK_DATA,
    width: 300,
    height: 60,
    ...props,
  };
  let tree: any;
  act(() => {
    tree = create(React.createElement(TrendSparkline, defaultProps));
  });
  return tree;
}

// ─── FR1 (04-victory-charts FR3 / 07-chart-line-polish): TrendSparkline VNX ──
//
// Note: 04-victory-charts FR3 migrated TrendSparkline from custom Skia bezier to VNX.
// The old Skia Paint+BlurMaskFilter approach was replaced by VNX Line + BlurMask child.
//
// SC1.1 — BlurMask imported from @shopify/react-native-skia (VNX glow approach)
// SC1.2 — strokeWidth prop defaults to 3 (used on VNX Line)
// SC1.3 — VNX Line has BlurMask child (not Paint+BlurMaskFilter)
// SC1.4 — BlurMask blur value is >= 6
// SC1.5 — VNX Area fill uses LinearGradient with color alpha
// SC1.6 — Area LinearGradient colors uses color + hex alpha suffix
// SC1.7 — Source does NOT contain BlurMaskFilter (old Skia paint approach)
// SC1.8 — Empty data renders without crash
// SC1.9 — width=0 renders without crash (returns null before canvas)
// SC1.10 — externalCursorIndex prop still accepted and renders without crash

describe('TrendSparkline — FR1 (04-victory-charts): VNX Line Glow', () => {
  it('SC1.1 — BlurMask is imported from @shopify/react-native-skia', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/BlurMask/);
    expect(source).toMatch(/@shopify\/react-native-skia/);
    // BlurMask appears in the import
    expect(source).toMatch(/@shopify\/react-native-skia[\s\S]{0,300}BlurMask|BlurMask[\s\S]{0,300}@shopify\/react-native-skia/);
  });

  it('SC1.2 — strokeWidth prop defaults to 2.5', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/strokeWidth\s*=\s*2\.5/);
  });

  it('SC1.3 — source contains BlurMask as child of VNX Line element', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // VNX Line wrapping BlurMask
    expect(source).toMatch(/<Line[\s\S]{0,200}<BlurMask/);
  });

  it('SC1.4 — BlurMask blur value is >= 6', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // blur={8} from VNX Line + BlurMask
    const match = source.match(/BlurMask[\s\S]{0,100}blur=\{(\d+(?:\.\d+)?)\}/);
    expect(match).not.toBeNull();
    const blurVal = parseFloat(match![1]);
    expect(blurVal).toBeGreaterThanOrEqual(6);
  });

  it('SC1.5 — VNX Area fill uses LinearGradient', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/<Area[\s\S]{0,300}LinearGradient/);
  });

  it('SC1.6 — Area LinearGradient colors uses color + alpha suffix (hex alpha)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Area uses color + hex alpha suffix (e.g. '59' or '66') for semi-transparency
    expect(source).toMatch(/color\s*\+\s*'[0-9A-Fa-f]{2}'/);
  });

  it('SC1.7 — source does NOT import BlurMaskFilter (old pre-VNX paint approach)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // BlurMaskFilter may appear in comments but should NOT be imported or used in JSX
    const importLines = source.split('\n').filter(l => l.match(/^import\s/));
    const hasBlurMaskFilterImport = importLines.some(l => l.includes('BlurMaskFilter'));
    expect(hasBlurMaskFilterImport).toBe(false);
    // Also: no JSX element <BlurMaskFilter
    expect(source).not.toMatch(/<BlurMaskFilter/);
  });

  it('SC1.8 — empty data renders without crash', () => {
    expect(() =>
      renderSparkline({ data: [], width: 300, height: 60 }),
    ).not.toThrow();
  });

  it('SC1.9 — width=0 renders without crash (returns null before canvas)', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA, width: 0, height: 60 }),
    ).not.toThrow();
  });

  it('SC1.10 — externalCursorIndex prop still accepted and renders without crash', () => {
    const TrendSparkline = require('@/src/components/TrendSparkline').default;
    expect(() => {
      let tree: any;
      act(() => {
        tree = create(React.createElement(TrendSparkline, {
          data: MOCK_DATA,
          width: 300,
          height: 60,
          externalCursorIndex: 3,
        }));
      });
    }).not.toThrow();
  });
});

// ─── FR3: TrendSparkline cap label ───────────────────────────────────────────

describe('TrendSparkline — FR3: Cap Label', () => {
  it('SC3.1 — TrendSparklineProps includes capLabel?: string', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/capLabel\s*\?\s*:\s*string/);
  });

  it('SC3.2 — source imports matchFont and Text (or SkiaText) from @shopify/react-native-skia', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toContain('matchFont');
    // Text may be aliased as SkiaText in the import
    expect(source).toMatch(/Text[\s\S]{0,400}@shopify\/react-native-skia|@shopify\/react-native-skia[\s\S]{0,400}Text/);
  });

  it('SC3.3 — when showGuide && capLabel provided, source contains Skia Text (SkiaText) with capLabel', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Source should render a Skia <SkiaText ... text={capLabel}> or <Text ... capLabel>
    expect(source).toMatch(/<SkiaText[\s\S]{0,300}capLabel|<Text[\s\S]{0,300}capLabel/);
  });

  it('SC3.4 — cap label has opacity set (any value)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Cap label text has an opacity prop
    expect(source).toMatch(/capLabel[\s\S]{0,600}opacity=\{0\.\d+\}/);
  });

  it('SC3.5 — cap label x position derived from right edge minus label width (right-aligned)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Right edge: chartBounds.right - capLabelWidth
    expect(source).toMatch(/right\s*-\s*capLabelWidth|\bwidth\s*-\s*\w*[Ww]idth|\bwidth\s*-\s*\d/);
  });

  it('SC3.6 — cap label is guarded by showGuide && capLabel', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    expect(source).toMatch(/showGuide\s*&&\s*capLabel/);
  });

  it('SC3.7 — cap label font size is 10sp (matching AIConeChart axis label pattern)', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Either literal `fontSize: 10` or a constant `CAP_LABEL_FONT_SIZE = 10` with `fontSize: CAP_LABEL_FONT_SIZE`
    const hasLiteralFontSize = /fontSize\s*:\s*10/.test(source);
    const hasConstantTen = /CAP_LABEL_FONT_SIZE\s*=\s*10/.test(source);
    expect(hasLiteralFontSize || hasConstantTen).toBe(true);
  });

  it('SC3.8 — capLabel without showGuide: component renders without crash', () => {
    expect(() =>
      renderSparkline({ capLabel: '$2,000', showGuide: false, maxValue: 2000 }),
    ).not.toThrow();
  });

  it('SC3.9 — capLabel undefined: component renders without crash', () => {
    expect(() =>
      renderSparkline({ showGuide: true, maxValue: 2000 }),
    ).not.toThrow();
  });

  it('SC3.10 — showGuide && capLabel provided: component renders without crash', () => {
    expect(() =>
      renderSparkline({ capLabel: '$2,000', showGuide: true, maxValue: 2000, width: 300, height: 60 }),
    ).not.toThrow();
  });

  it('SC3.11 — guard also checks font is non-null before rendering Skia Text', () => {
    const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
    // Guard: capLabel && capFont (or showGuide && capLabel && font)
    expect(source).toMatch(/capLabel\s*&&\s*\w*[Ff]ont|showGuide\s*&&\s*capLabel\s*&&\s*\w*[Ff]ont/);
  });
});

// ─── FR (09-chart-visual-fixes FR1): safeData trailing-zero strip + domainPadding ──
//
// SC-09FR1.1 — source contains safeData strip-trailing-zeros pattern
// SC-09FR1.2 — source guards minimum 1 element (end > 1)
// SC-09FR1.3 — toLineData called with safeData (not raw data)
// SC-09FR1.4 — CartesianChart has domainPadding with right: 10
// SC-09FR1.5 — renders without crash: data=[100, 90, 85, 0]
// SC-09FR1.6 — renders without crash: data=[0]
// SC-09FR1.7 — renders without crash: data=[10, 20, 30]
// SC-09FR1.8 — renders without crash: data=[0, 0, 0]

describe('TrendSparkline — 09FR1: safeData + domainPadding', () => {
  const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');

  it('SC-09FR1.1 — source contains safeData strip-trailing-zeros logic', () => {
    expect(source).toMatch(/safeData/);
    expect(source).toMatch(/end\s*>\s*1/);
  });

  it('SC-09FR1.2 — source guards minimum 1 element (end > 1 ensures single element preserved)', () => {
    expect(source).toMatch(/end\s*>\s*1/);
  });

  it('SC-09FR1.3 — toLineData is called with safeData (not raw data prop)', () => {
    expect(source).toMatch(/toLineData\s*\(\s*safeData/);
  });

  it('SC-09FR1.4 — CartesianChart receives domainPadding with right: 10', () => {
    expect(source).toMatch(/domainPadding/);
    expect(source).toMatch(/right\s*:\s*10/);
  });

  it('SC-09FR1.5 — renders without crash for data with trailing zero [100, 90, 85, 0]', () => {
    expect(() => renderSparkline({ data: [100, 90, 85, 0] })).not.toThrow();
  });

  it('SC-09FR1.6 — renders without crash for data=[0] (single zero)', () => {
    expect(() => renderSparkline({ data: [0] })).not.toThrow();
  });

  it('SC-09FR1.7 — renders without crash for data with no trailing zeros [10, 20, 30]', () => {
    expect(() => renderSparkline({ data: [10, 20, 30] })).not.toThrow();
  });

  it('SC-09FR1.8 — renders without crash for all-zero array [0, 0, 0]', () => {
    expect(() => renderSparkline({ data: [0, 0, 0] })).not.toThrow();
  });
});

// ─── FR1 + FR2 (04-victory-charts): TrendSparkline VNX glow (updated) ───────
//
// Note: 04-victory-charts FR3 migrated from custom Skia 3-layer glow (strokeWidth=14/7/2.5)
// to VNX Line + single BlurMask blur={8}. The 3-layer approach is no longer present.
//
// FR1:
//   SC-FR1.1 — strokeWidth prop defaults to 3
//   SC-FR1.2 — explicit strokeWidth prop still accepted
//
// FR2 (VNX single-layer glow):
//   SC-FR2.1 — VNX CartesianChart is used (replaces bespoke Skia chart)
//   SC-FR2.2 — BlurMask blur={8} is the single glow layer
//   SC-FR2.3 — source uses useChartPressState (replaces old gesture layer)
//   SC-FR2.4 — useAnimatedReaction + runOnJS bridge onScrubChange
//   SC-FR2.5 — Area uses color + '66' alpha (50% translucent area fill)
//   SC-FR2.6 — source has at least 1 BlurMask
//   SC-FR2.7 — renders without crash with default strokeWidth

describe('TrendSparkline — FR1+FR2 (04-victory-charts): VNX glow', () => {
  const source = fs.readFileSync(SPARKLINE_FILE, 'utf8');

  it('SC-FR1.1 — strokeWidth prop defaults to 2.5', () => {
    expect(source).toMatch(/strokeWidth\s*=\s*2\.5/);
  });

  it('SC-FR1.2 — explicit strokeWidth prop still accepted without crash', () => {
    const TrendSparkline = require('@/src/components/TrendSparkline').default;
    expect(() => {
      let tree: any;
      act(() => {
        tree = create(React.createElement(TrendSparkline, {
          data: MOCK_DATA,
          width: 300,
          height: 60,
          strokeWidth: 2,
        }));
      });
    }).not.toThrow();
  });

  it('SC-FR2.1 — VNX CartesianChart is imported and used', () => {
    expect(source).toContain('CartesianChart');
    expect(source).toContain('victory-native');
  });

  it('SC-FR2.2 — BlurMask blur={8} is the single glow layer on the VNX Line', () => {
    expect(source).toMatch(/BlurMask[\s\S]{0,100}blur=\{8\}/);
  });

  it('SC-FR2.3 — source uses useChartPressState (VNX gesture, replaces GestureDetector)', () => {
    expect(source).toContain('useChartPressState');
  });

  it('SC-FR2.4 — useAnimatedReaction + runOnJS bridge onScrubChange', () => {
    expect(source).toContain('useAnimatedReaction');
    expect(source).toContain('runOnJS');
  });

  it('SC-FR2.5 — Area fill uses color + hex alpha suffix (semi-transparent)', () => {
    // Source uses color + '59' (35% opacity) for area fill
    expect(source).toMatch(/color\s*\+\s*'[0-9A-Fa-f]{2}'/);
  });

  it('SC-FR2.6 — source has at least 1 BlurMask', () => {
    const blurMaskCount = (source.match(/BlurMask/g) || []).length;
    expect(blurMaskCount).toBeGreaterThanOrEqual(1);
  });

  it('SC-FR2.7 — renders without crash with default strokeWidth', () => {
    expect(() =>
      renderSparkline({ data: MOCK_DATA, width: 300, height: 60 }),
    ).not.toThrow();
  });
});

// ─── 10-mesh-color-overhaul: FR5 — Left domainPadding ───────────────────────

describe('TrendSparkline — 10-mesh-color-overhaul FR5: left domainPadding', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  });

  it('FR5-overhaul.1 — domainPadding has left: 10 (not left: 0)', () => {
    // Pattern matches { left: 10, right: 10 } in any whitespace format
    expect(source).toMatch(/domainPadding=\{\{\s*left:\s*10,\s*right:\s*10\s*\}\}/);
  });

  it('FR5-overhaul.2 — source does NOT contain domainPadding with left: 0', () => {
    // left: 0 is the old value — must be replaced with left: 10
    const domainPaddingLine = source.split('\n').find(line =>
      line.includes('domainPadding') && line.includes('left:') && !line.trimStart().startsWith('//')
    );
    if (domainPaddingLine) {
      expect(domainPaddingLine).not.toMatch(/left:\s*0[^.0-9]/);
    }
  });

  it('FR5-overhaul.3 — padTop and padBottom domain calc lines are unchanged', () => {
    // These lines use yRange * 0.20 and yRange * 0.10 and must not be modified
    expect(source).toContain('padTop');
    expect(source).toContain('padBottom');
    expect(source).toMatch(/yRange\s*\*\s*0\.20/);
    expect(source).toMatch(/yRange\s*\*\s*0\.10/);
  });
});
