// Tests: AIArcHero component (01-safe-arc-hero)
// FR1: Replace useAnimatedProps path-string with strokeDashoffset (safe animation contract)
// FR2: All geometry derived from size prop
// FR3: Props interface and visual output unchanged
// FR4: arcPath pure utility function + animation re-triggers on aiPct change
//
// Mock strategy:
// - react-native-svg: passthrough Fragment components (same pattern as AmbientBackground.test.tsx)
// - expo-blur: BlurView passthrough (Card uses BlurView)
// - react-native-reanimated: __mocks__ auto-mock via jest-expo preset
// - Source analysis for animation contract checks (catch regressions render tests cannot)

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-blur', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    BlurView: ({ children, intensity, tint, style }: any) =>
      mockReact.createElement('BlurView', { intensity, tint, style }, children ?? null),
  };
});

// victory-native mock — CartesianChart passthrough
jest.mock('victory-native', () => {
  const R = require('react');
  return {
    CartesianChart: ({ children }: any) =>
      children ? children({ points: { value: [], y: [] }, chartBounds: { left: 0, right: 100, top: 0, bottom: 100 } }) : null,
    Bar: ({ children }: any) => children ?? null,
    Line: ({ children }: any) => children ?? null,
    Area: ({ children }: any) => children ?? null,
    useChartPressState: () => ({
      state: { x: { position: { value: 0 } } },
      isActive: { value: false },
    }),
  };
});

// ─── File paths ────────────────────────────────────────────────────────────────

const COMPONENT_FILE = path.resolve(__dirname, '../AIArcHero.tsx');

// ─── Module handles ───────────────────────────────────────────────────────────

let AIArcHero: any;
let arcPath: any;
let AI_TARGET_PCT: number;
let BRAINLIFT_TARGET_HOURS: number;

beforeAll(() => {
  const mod = require('../AIArcHero');
  AIArcHero = mod.default;
  arcPath = mod.arcPath;
  AI_TARGET_PCT = mod.AI_TARGET_PCT;
  BRAINLIFT_TARGET_HOURS = mod.BRAINLIFT_TARGET_HOURS;
});

// ─── Default props fixture ────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  aiPct: 75,
  brainliftHours: 3.5,
  deltaPercent: null,
  ambientColor: '#A78BFA',
};

// ─── FR1 (04-victory-charts): Animation contract — source-level checks ───────
//
// FR4 of 04-victory-charts rebuilt AIArcHero from react-native-svg to Skia Canvas
// + SweepGradient. Animation uses withSpring + useDerivedValue + Path.trim().

describe('AIArcHero — FR1: Skia animation contract (source-level)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('FR1.1 — arcPath is called in render scope (builds full arc SVG for Skia)', () => {
    // arcPath is called in render to produce the SVG path string → Skia.Path.MakeFromSVGString
    expect(source).toContain('arcPath(');
    // Not inside a worklet — should not appear in useDerivedValue body calling arcPath
    expect(source).not.toMatch(/useDerivedValue[\s\S]{0,100}arcPath\s*\(/);
  });

  it('FR1.2 — withSpring IS present in source (replaces withTiming for arc animation)', () => {
    expect(source).toContain('withSpring');
  });

  it('FR1.3 — springPremium is NOT imported (uses inline spring config)', () => {
    expect(source).not.toContain('springPremium');
  });

  it('FR1.4 — SweepGradient IS imported from @shopify/react-native-skia', () => {
    expect(source).toContain('SweepGradient');
    expect(source).toContain('@shopify/react-native-skia');
  });

  it('FR1.5 — SweepGradient uses cyan→violet→magenta colors', () => {
    // Gradient: #00C2FF → #A78BFA → #FF00FF
    expect(source).toContain('#00C2FF');
    expect(source).toContain('#A78BFA');
    expect(source).toContain('#FF00FF');
  });

  it('FR1.6 — useDerivedValue IS used (trims path on UI thread)', () => {
    expect(source).toContain('useDerivedValue');
  });

  it('FR1.7 — path.trim() IS called inside useDerivedValue (arc trimming)', () => {
    // useDerivedValue callback calls .trim(0, sweepProgress.value, false)
    expect(source).toMatch(/\.trim\s*\(\s*0/);
  });

  it('FR1.8 — strokeDashoffset is NOT in any import statement (Skia trim replaces it)', () => {
    // strokeDashoffset may appear in a comment but NOT in actual code/imports
    const importLines = source.split('\n').filter(l => l.match(/^import\s/) || l.match(/strokeDashoffset\s*=/));
    const hasStrokeDashoffsetImportOrAssign = importLines.some(l => l.includes('strokeDashoffset'));
    expect(hasStrokeDashoffsetImportOrAssign).toBe(false);
  });

  it('FR1.9 — react-native-svg is NOT in any import statement (replaced by Skia Canvas)', () => {
    // May appear in comments but NOT imported
    const importLines = source.split('\n').filter(l => l.match(/^import\s/));
    const hasSvgImport = importLines.some(l => l.includes('react-native-svg'));
    expect(hasSvgImport).toBe(false);
  });
});

// ─── FR1: Render tests ────────────────────────────────────────────────────────

describe('AIArcHero — FR1: renders without crash', () => {
  it('FR1.10 — renders without crash for aiPct=0', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, aiPct: 0 }));
      });
    }).not.toThrow();
  });

  it('FR1.11 — renders without crash for aiPct=65, brainliftHours=3.5, deltaPercent=8.2', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, {
          aiPct: 65,
          brainliftHours: 3.5,
          deltaPercent: 8.2,
          ambientColor: '#00C2FF',
        }));
      });
    }).not.toThrow();
  });

  it('FR1.12 — renders without crash for aiPct=100 (full arc)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, aiPct: 100 }));
      });
    }).not.toThrow();
  });
});

// ─── FR2: Geometry derived from size prop ─────────────────────────────────────

describe('AIArcHero — FR2: geometry from size prop', () => {
  it('FR2.1 — renders without crash with custom size=240', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, size: 240 }));
      });
    }).not.toThrow();
  });

  it('FR2.2 — default size is 180dp when size prop is omitted', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/size\s*=\s*180/);
  });
});

// ─── FR3: Props interface and visual output unchanged ─────────────────────────

describe('AIArcHero — FR3: props interface and visual output', () => {
  it('FR3.1 — delta badge shown when deltaPercent is not null', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: 5 }));
    });
    const instance = tree.root;
    const badge = instance.findAll((node: any) => node.props?.testID === 'delta-badge');
    expect(badge.length).toBeGreaterThan(0);
  });

  it('FR3.2 — delta badge hidden when deltaPercent is null', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: null }));
    });
    const instance = tree.root;
    const badge = instance.findAll((node: any) => node.props?.testID === 'delta-badge');
    expect(badge.length).toBe(0);
  });

  it('FR3.3 — center text shows {aiPct}% (e.g. "75%")', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, aiPct: 75 }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('75%');
  });

  it('FR3.4 — "AI USAGE" label is rendered', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('AI USAGE');
  });

  it('FR3.5 — brainliftHours=0 renders "0.0h / 5h" with no crash', () => {
    let tree: any;
    expect(() => {
      act(() => {
        tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, brainliftHours: 0 }));
      });
    }).not.toThrow();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('0.0h');
  });

  it('FR3.6 — brainliftHours > BRAINLIFT_TARGET_HOURS (e.g. 7) renders without crash, clamps progress', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, brainliftHours: 7 }));
      });
    }).not.toThrow();
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/Math\.min\s*\(\s*1/);
  });

  it('FR3.7 — delta badge shows "+" prefix when deltaPercent > 0', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: 3.5 }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('+3.5%');
  });

  it('FR3.8 — delta badge shows negative value when deltaPercent < 0', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: -2.1 }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('-2.1%');
  });

  it('FR3.9 — delta badge shows "+0.0%" when deltaPercent === 0', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: 0 }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('+0.0%');
  });

  it('FR3.10 — arcPath export preserved (function exists and is callable)', () => {
    expect(typeof arcPath).toBe('function');
  });

  it('FR3.11 — AI_TARGET_PCT exported constant equals 75', () => {
    expect(AI_TARGET_PCT).toBe(75);
  });

  it('FR3.12 — BRAINLIFT_TARGET_HOURS exported constant equals 5', () => {
    expect(BRAINLIFT_TARGET_HOURS).toBe(5);
  });

  it('FR3.13 — source imports Card component', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('Card');
  });

  it('FR3.14 — source renders ProgressBar with colorClass="bg-violet"', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('bg-violet');
    expect(source).toContain('ProgressBar');
  });

  it('FR3.15 — source uses Skia Canvas + Path for arc rendering (04-victory-charts FR4)', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // Migrated from react-native-svg to Skia Canvas
    expect(source).toContain('@shopify/react-native-skia');
    expect(source).toContain('Canvas');
    expect(source).toContain('Path');
  });
});

// ─── FR4: arcPath pure utility function ──────────────────────────────────────

describe('arcPath — FR4: SVG arc path generation', () => {
  it('FR4.1 — arcPath(90, 90, 87, 135, 405) returns string starting with "M " and containing " A "', () => {
    const result = arcPath(90, 90, 87, 135, 405);
    expect(typeof result).toBe('string');
    expect(result.startsWith('M ')).toBe(true);
    expect(result).toContain(' A ');
  });

  it('FR4.2 — degenerate case: start === end returns string starting with "M" (no crash)', () => {
    const result = arcPath(90, 90, 80, 135, 135);
    expect(typeof result).toBe('string');
    expect(result.startsWith('M')).toBe(true);
    // Degenerate: no arc command
    expect(result).not.toContain('A');
  });

  it('FR4.3 — sweep > 180 → largeArcFlag = 1 in result', () => {
    // 270° sweep
    const result = arcPath(90, 90, 80, 135, 405);
    expect(result).toMatch(/A\s+[\d.]+\s+[\d.]+\s+0\s+1\s+1/);
  });

  it('FR4.4 — sweep <= 180 → largeArcFlag = 0 in result', () => {
    // 135° sweep (50% of 270)
    const result = arcPath(90, 90, 80, 135, 270);
    expect(result).toMatch(/A\s+[\d.]+\s+[\d.]+\s+0\s+0\s+1/);
  });

  it('FR4.5 — arc coordinates are numeric (not NaN)', () => {
    const result = arcPath(90, 90, 80, 135, 270);
    const numbers = result.match(/-?[\d.]+/g) ?? [];
    numbers.forEach(n => {
      expect(isNaN(parseFloat(n))).toBe(false);
    });
  });
});

// ─── FR4: source structure ────────────────────────────────────────────────────

describe('AIArcHero — source structure (exports + hooks)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('source exports arcPath function', () => {
    expect(source).toMatch(/export\s+function\s+arcPath/);
  });

  it('source exports AI_TARGET_PCT constant', () => {
    expect(source).toMatch(/export\s+const\s+AI_TARGET_PCT/);
  });

  it('source exports BRAINLIFT_TARGET_HOURS constant', () => {
    expect(source).toMatch(/export\s+const\s+BRAINLIFT_TARGET_HOURS/);
  });

  it('source uses useSharedValue for animated value', () => {
    expect(source).toContain('useSharedValue');
  });

  it('source uses useEffect to trigger animation on aiPct change', () => {
    expect(source).toContain('useEffect');
  });

  it('source does NOT import AIRingChart', () => {
    expect(source).not.toContain('AIRingChart');
  });

  it('source uses withSpring for arc animation (04-victory-charts FR4)', () => {
    expect(source).toContain('withSpring');
  });

  it('source imports Skia from @shopify/react-native-skia (for Path.MakeFromSVGString)', () => {
    expect(source).toContain('Skia');
    expect(source).toContain('MakeFromSVGString');
  });
});

// ─── FR3: getAmbientColor contract boundary verification ─────────────────────

describe('getAmbientColor — aiPct signal boundaries', () => {
  let getAmbientColor: any;

  beforeAll(() => {
    const mod = require('../AmbientBackground');
    getAmbientColor = mod.getAmbientColor;
  });

  it('pct=80 → colors.violet (#A78BFA)', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 80 })).toBe('#A78BFA');
  });

  it('pct=65 → colors.cyan (#00C2FF)', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 65 })).toBe('#00C2FF');
  });

  it('pct=50 → colors.warning (#F59E0B)', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 50 })).toBe('#F59E0B');
  });

  it('pct=75 (boundary) → colors.violet (#A78BFA)', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 75 })).toBe('#A78BFA');
  });

  it('pct=60 (boundary) → colors.cyan (#00C2FF)', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 60 })).toBe('#00C2FF');
  });

  it('pct=0 → colors.warning (#F59E0B)', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 0 })).toBe('#F59E0B');
  });
});

// ─── FR (09/10): SweepGradient full-circle mapping (end-cap clamping fix) ────
//
// SC-09FR5.1 — SweepGradient uses GRADIENT_POSITIONS (start/end removed)
// SC-09FR5.2 — GRADIENT_POSITIONS maps arc key angles to full-circle fractions
// SC-09FR5.3 — SweepGradient c prop uses cx=cy=size/2
// SC-09FR5.4 — gradient colors contain cyan, violet, magenta

describe('AIArcHero — 09FR5: SweepGradient arc color mapping', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC-09FR5.1 — SweepGradient uses GRADIENT_POSITIONS for full-circle mapping (no start/end)', () => {
    // start/end removed: high fill% arc crosses 360°, pixels at e.g. 34° were clamped
    // to first gradient color (cyan). Full-circle positions keep wrap-around region magenta.
    expect(source).toContain('GRADIENT_POSITIONS');
    expect(source).toMatch(/positions=\{\[\.\.\.GRADIENT_POSITIONS\]\}/);
  });

  it('SC-09FR5.2 — GRADIENT_POSITIONS maps arc key angles to full-circle fractions', () => {
    // 135°/360=0.375 (arc start=cyan), 270°/360=0.75 (arc top=violet), 0 and 1.0 (magenta)
    expect(source).toMatch(/0\.375/);
    expect(source).toMatch(/0\.75/);
    expect(source).toMatch(/0\.125/);
  });

  it('SC-09FR5.3 — SweepGradient c prop uses { x: cx, y: cy } centered on canvas', () => {
    expect(source).toMatch(/c\s*=\s*\{\s*\{\s*x\s*:\s*cx\s*,\s*y\s*:\s*cy\s*\}/);
  });

  it('SC-09FR5.4 — gradient colors array contains cyan, violet, magenta', () => {
    expect(source).toContain('#00C2FF');
    expect(source).toContain('#A78BFA');
    expect(source).toContain('#FF00FF');
  });
});
