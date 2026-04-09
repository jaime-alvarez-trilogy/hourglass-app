// Tests: AIArcHero — 04-victory-charts FR4 (Skia rebuild)
//
// FR4: AIArcHero rebuilt from react-native-svg to Skia Canvas + Path + SweepGradient
//   SC4.1 — react-native-svg import removed; @shopify/react-native-skia imported instead
//   SC4.2 — Component renders Skia Canvas with Path for arc
//   SC4.3 — SweepGradient with colors ['#00C2FF', '#A78BFA', '#FF00FF']
//   SC4.4 — sweepProgress SharedValue initializes at 0
//   SC4.5 — withSpring used for animation (not withTiming for arc)
//   SC4.6 — useEffect re-triggers animation on aiPct change
//   SC4.7 — External props preserved: aiPct, brainliftHours, deltaPercent, ambientColor, size
//   SC4.8 — AI_TARGET_PCT, BRAINLIFT_TARGET_HOURS constants remain exported
//   SC4.9 — arcPath function remains exported
//   SC4.10 — Center text shows {aiPct}% and "AI USAGE" label
//   SC4.11 — Delta badge shows when deltaPercent !== null
//   SC4.12 — BrainLift section with ProgressBar preserved
//   SC4.13 — Renders without crash for aiPct=0, aiPct=75, aiPct=100
//   SC4.14 — size prop controls canvas dimensions (default 180)
//
// Strategy:
// - Source-level checks for import/export/animation contract (can't catch these in render)
// - react-test-renderer for render validation (crash-free + text content)

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-blur', () => {
  const R = require('react');
  return {
    __esModule: true,
    BlurView: ({ children, intensity, tint, style }: any) =>
      R.createElement('BlurView', { intensity, tint, style }, children ?? null),
  };
});

// react-native-svg is no longer used in AIArcHero after the Skia rebuild,
// but the mock is kept here to prevent any residual import from crashing tests.
jest.mock('react-native-svg', () => {
  const R = require('react');
  const wrap = (name: string) => ({ children, ...rest }: any) =>
    R.createElement(name, rest, children ?? null);
  return {
    __esModule: true,
    default: wrap('Svg'),
    Svg: wrap('Svg'),
    Defs: wrap('Defs'),
    Path: wrap('SvgPath'),
    G: wrap('G'),
    Circle: wrap('Circle'),
    Line: wrap('Line'),
    Text: wrap('SvgText'),
  };
});

// ─── File paths ───────────────────────────────────────────────────────────────

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

// ─── SC4.1: Import contract ───────────────────────────────────────────────────

describe('AIArcHero — SC4.1: import source (Skia not SVG)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.1a — source imports from @shopify/react-native-skia', () => {
    expect(source).toContain('@shopify/react-native-skia');
  });

  it('SC4.1b — source does NOT import from react-native-svg for arc rendering', () => {
    // react-native-svg Svg/Path should not be the primary arc renderer
    // (arcPath utility may still be used for SVG path string, but the renderer is Skia)
    // Check that Animated.createAnimatedComponent(Path) from SVG is gone
    expect(source).not.toMatch(/createAnimatedComponent[\s\S]{0,50}Path.*svg|svg.*createAnimatedComponent[\s\S]{0,50}Path/i);
    expect(source).not.toContain('AnimatedPath');
  });

  it('SC4.1c — source renders Skia Canvas (not Svg)', () => {
    expect(source).toContain('Canvas');
    // The Canvas import must be from Skia
    expect(source).toMatch(/Canvas[\s\S]{0,200}@shopify\/react-native-skia|@shopify\/react-native-skia[\s\S]{0,200}Canvas/);
  });
});

// ─── SC4.2: Skia Canvas and Path ─────────────────────────────────────────────

describe('AIArcHero — SC4.2: renders Skia Canvas + Path', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.2a — source includes <Canvas ...> element', () => {
    expect(source).toMatch(/<Canvas/);
  });

  it('SC4.2b — source includes Path element for arc', () => {
    expect(source).toMatch(/<Path/);
  });
});

// ─── SC4.3: SweepGradient ────────────────────────────────────────────────────

describe('AIArcHero — SC4.3: SweepGradient paint', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.3a — source includes SweepGradient', () => {
    expect(source).toContain('SweepGradient');
  });

  it('SC4.3b — GRADIENT_COLORS constant is defined with cyan→violet→magenta', () => {
    expect(source).toContain('GRADIENT_COLORS');
    expect(source).toContain('#00C2FF');
    expect(source).toContain('#A78BFA');
    expect(source).toContain('#FF00FF');
  });

  it('SC4.3c — source contains static cyan arc color #00C2FF', () => {
    expect(source).toContain('#00C2FF');
  });

  it('SC4.3d — source contains static magenta #FF00FF', () => {
    expect(source).toContain('#FF00FF');
  });

  it('SC4.3e — SweepGradient uses GRADIENT_COLORS spread', () => {
    expect(source).toMatch(/colors=\{\[\.\.\.GRADIENT_COLORS\]\}/);
  });
});

// ─── Arc gradient: static cyan→violet→magenta (FR4 tier-solid reverted per user feedback) ──

describe('AIArcHero — arc gradient colors', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('FR4-overhaul.4 — track arc color rgba(255,255,255,0.08) is unchanged', () => {
    expect(source).toContain('rgba(255,255,255,0.08)');
  });
});

// ─── SC4.4 + SC4.5: Animation contract ───────────────────────────────────────

describe('AIArcHero — SC4.4/SC4.5: sweepProgress animation', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.4 — sweepProgress SharedValue exists and initializes at 0', () => {
    // useSharedValue(0) should be used for sweepProgress
    expect(source).toMatch(/sweepProgress\s*=\s*useSharedValue\s*\(\s*0\s*\)/);
  });

  it('SC4.5 — withSpring is used for animation', () => {
    expect(source).toContain('withSpring');
  });

  it('SC4.5b — withSpring target is aiPct/100 (normalized 0-1)', () => {
    expect(source).toMatch(/withSpring\s*\(\s*aiPct\s*\/\s*100/);
  });

  it('SC4.5c — spring config includes stiffness=80 and damping=12', () => {
    // From spec: mass=1, stiffness=80, damping=12
    expect(source).toMatch(/stiffness\s*:\s*80/);
    expect(source).toMatch(/damping\s*:\s*12/);
  });
});

// ─── SC4.6: Animation re-triggers on aiPct change ────────────────────────────

describe('AIArcHero — SC4.6: animation re-triggers on aiPct change', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.6 — useEffect with aiPct dependency triggers animation', () => {
    expect(source).toContain('useEffect');
    expect(source).toMatch(/useEffect[\s\S]{0,300}aiPct/);
  });
});

// ─── SC4.7: External props preserved ─────────────────────────────────────────

describe('AIArcHero — SC4.7: external props preserved', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.7a — aiPct prop in interface', () => {
    expect(source).toMatch(/aiPct\s*:/);
  });

  it('SC4.7b — brainliftHours prop in interface', () => {
    expect(source).toMatch(/brainliftHours\s*:/);
  });

  it('SC4.7c — deltaPercent prop in interface', () => {
    expect(source).toMatch(/deltaPercent\s*:/);
  });

  it('SC4.7d — ambientColor prop in interface', () => {
    expect(source).toMatch(/ambientColor\s*:/);
  });

  it('SC4.7e — size prop with default 180', () => {
    expect(source).toMatch(/size\s*=\s*180/);
  });
});

// ─── SC4.8 + SC4.9: Exported constants and arcPath ───────────────────────────

describe('AIArcHero — SC4.8/SC4.9: exports preserved', () => {
  it('SC4.8a — AI_TARGET_PCT equals 75', () => {
    expect(AI_TARGET_PCT).toBe(75);
  });

  it('SC4.8b — BRAINLIFT_TARGET_HOURS equals 5', () => {
    expect(BRAINLIFT_TARGET_HOURS).toBe(5);
  });

  it('SC4.9 — arcPath is exported and callable', () => {
    expect(typeof arcPath).toBe('function');
    // Verify it still produces valid SVG path strings
    const result = arcPath(90, 90, 80, 135, 405);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^M/);
  });
});

// ─── SC4.10: Center text content ─────────────────────────────────────────────

describe('AIArcHero — SC4.10: center text', () => {
  it('SC4.10a — renders {aiPct}% in center text', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, aiPct: 75 }));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('75%');
  });

  it('SC4.10b — renders "AI USAGE" label', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS }));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('AI USAGE');
  });
});

// ─── SC4.11: Delta badge ──────────────────────────────────────────────────────

describe('AIArcHero — SC4.11: delta badge', () => {
  it('SC4.11a — delta badge shown when deltaPercent is not null', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: 5 }));
    });
    const badge = tree.root.findAll((node: any) => node.props?.testID === 'delta-badge');
    expect(badge.length).toBeGreaterThan(0);
  });

  it('SC4.11b — delta badge hidden when deltaPercent is null', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: null }));
    });
    const badge = tree.root.findAll((node: any) => node.props?.testID === 'delta-badge');
    expect(badge.length).toBe(0);
  });

  it('delta text shows "+" prefix for positive values', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: 3.5 }));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('+3.5%');
  });

  it('delta text shows negative for negative values', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, deltaPercent: -2.1 }));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('-2.1%');
  });
});

// ─── SC4.12: BrainLift section ───────────────────────────────────────────────

describe('AIArcHero — SC4.12: BrainLift section', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.12a — source renders ProgressBar for BrainLift', () => {
    expect(source).toContain('ProgressBar');
  });

  it('SC4.12b — ProgressBar uses bg-violet colorClass', () => {
    expect(source).toContain('bg-violet');
  });

  it('SC4.12c — brainliftHours rendered in tree', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, brainliftHours: 3.5 }));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('3.5');
  });
});

// ─── SC4.13: Render without crash ────────────────────────────────────────────

describe('AIArcHero — SC4.13: crash-free rendering', () => {
  it('SC4.13a — renders without crash for aiPct=0', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, aiPct: 0 }));
      });
    }).not.toThrow();
  });

  it('SC4.13b — renders without crash for aiPct=75', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, aiPct: 75 }));
      });
    }).not.toThrow();
  });

  it('SC4.13c — renders without crash for aiPct=100', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, aiPct: 100 }));
      });
    }).not.toThrow();
  });
});

// ─── SC4.3f: fill Path uses color="white" (08-dark-glass-polish FR2) ─────────
//
// The fill Path must use color="white" (alpha=1.0) so that the SweepGradient
// shader is multiplied against full alpha and renders visibly.
// color="transparent" zeroes the paint alpha and makes the gradient invisible.

describe('AIArcHero — SC4.3f: fill Path color (08-dark-glass-polish FR2)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.3f.1 — fill Path does NOT use color="transparent" as a JSX attribute', () => {
    // "transparent" on the fill Path zeroes paint alpha → SweepGradient invisible
    // Check that color="transparent" does not appear as a JSX prop (comments are OK)
    // We look for the attribute pattern specifically: color="transparent" without JSX comment syntax
    const sweepGradientIdx = source.indexOf('<SweepGradient');
    expect(sweepGradientIdx).toBeGreaterThan(-1);

    // Find the fill Path block: starts at the second <Path occurrence (after the track arc)
    const firstPathIdx = source.indexOf('<Path');
    const secondPathIdx = source.indexOf('<Path', firstPathIdx + 1);
    expect(secondPathIdx).toBeGreaterThan(-1);

    // Extract the fill Path block (from second <Path to </Path>)
    const fillPathBlock = source.slice(secondPathIdx, sweepGradientIdx + 100);
    // Remove JSX comment lines before checking
    const withoutComments = fillPathBlock.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(withoutComments).not.toContain('color="transparent"');
  });

  it('SC4.3f.2 — fill Path uses color="white" (full alpha enables gradient)', () => {
    // color="white" → alpha=1.0 → gradient multiplied by 1 → visible
    const sweepGradientIdx = source.indexOf('<SweepGradient');
    const fillPathStart = source.lastIndexOf('<Path', sweepGradientIdx);
    const fillPathBlock = source.slice(fillPathStart, sweepGradientIdx);
    expect(fillPathBlock).toContain('color="white"');
  });
});

// ─── SC4.14: size prop ───────────────────────────────────────────────────────

describe('AIArcHero — SC4.14: size prop', () => {
  it('SC4.14a — renders without crash with custom size=240', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIArcHero, { ...DEFAULT_PROPS, size: 240 }));
      });
    }).not.toThrow();
  });

  it('SC4.14b — source has default size=180', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/size\s*=\s*180/);
  });
});
