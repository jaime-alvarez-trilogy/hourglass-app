// Tests: AmbientBackground component (01-ambient-layer)
// FR1: full-screen SVG radial gradient ambient layer
// FR2: AMBIENT_COLORS constant + getAmbientColor() pure function
// FR5: Reanimated color transition (source analysis)
//
// Mock strategy:
// - react-native-svg: passthrough Fragment components
// - react-native-reanimated: __mocks__ auto-mock (standard project pattern)
// - Source analysis for animation internals (springPremium, withSequence, etc.)

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// Mock react-native-svg — passthrough components
jest.mock('react-native-svg', () => {
  const mockReact = require('react');
  const wrap = () => ({ children }: any) =>
    mockReact.createElement(mockReact.Fragment, null, children ?? null);
  return {
    __esModule: true,
    default: wrap(),
    Svg: wrap(),
    Defs: wrap(),
    RadialGradient: wrap(),
    Stop: () => null,
    Rect: () => null,
  };
});

const AMBIENT_FILE = path.resolve(__dirname, '../AmbientBackground.tsx');

// ─── Module handles ──────────────────────────────────────────────────────────

let AmbientBackground: any;
let AMBIENT_COLORS: any;
let getAmbientColor: any;

beforeAll(() => {
  const mod = require('../AmbientBackground');
  AmbientBackground = mod.default;
  AMBIENT_COLORS = mod.AMBIENT_COLORS;
  getAmbientColor = mod.getAmbientColor;
});

// ─── FR1: AmbientBackground component — runtime render ───────────────────────

describe('AmbientBackground — FR1: component render', () => {
  it('FR1.1 — renders without crash when color is provided', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AmbientBackground, { color: '#10B981' }));
      });
    }).not.toThrow();
  });

  it('FR1.2 — renders without crash when color is null (idle state)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AmbientBackground, { color: null }));
      });
    }).not.toThrow();
  });

  it('FR1.3 — color=null renders non-null output (empty touch-safe view)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AmbientBackground, { color: null }));
    });
    // Should render something (not throw / return null to tree)
    expect(tree.toJSON()).not.toBeNull();
  });

  it('FR1.4 — color="#10B981" renders SVG content (not empty)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AmbientBackground, { color: '#10B981' }));
    });
    // With SVG mocked as Fragment passthrough, tree should have children
    const json = tree.toJSON();
    expect(json).not.toBeNull();
  });

  it('FR1.5 — renders exactly one root element (not fragment, not array)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AmbientBackground, { color: '#10B981' }));
    });
    const json = tree.toJSON();
    expect(Array.isArray(json)).toBe(false);
  });

  it('FR1.6 — intensity prop is accepted without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AmbientBackground, { color: '#10B981', intensity: 0.5 }));
      });
    }).not.toThrow();
  });
});

// ─── FR1: Source file structure checks ──────────────────────────────────────
// Note: Updated in 02-animated-mesh — AmbientBackground now delegates to AnimatedMeshBackground.
// SVG imports and Reanimated animation code have moved to AnimatedMeshBackground.tsx.
// These source checks verify the new compat-wrapper structure.

describe('AmbientBackground — FR1: source file checks', () => {
  let source: string;
  let noComments: string;

  beforeAll(() => {
    source = fs.readFileSync(AMBIENT_FILE, 'utf8');
    noComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('FR1.7 — source delegates to AnimatedMeshBackground (02-animated-mesh)', () => {
    // AmbientBackground now wraps AnimatedMeshBackground
    expect(source).toContain('AnimatedMeshBackground');
  });

  it('FR1.8 — source contains @deprecated annotation', () => {
    expect(source).toContain('@deprecated');
  });

  it('FR1.9 — source does NOT use StyleSheet.create', () => {
    expect(noComments).not.toContain('StyleSheet.create');
  });

  it('FR1.10 — source preserves AMBIENT_COLORS export', () => {
    expect(source).toContain('AMBIENT_COLORS');
  });

  it('FR1.11 — source preserves getAmbientColor export', () => {
    expect(source).toContain('getAmbientColor');
  });

  it('FR1.12 — source preserves AmbientSignal type export', () => {
    expect(source).toContain('AmbientSignal');
  });

  it('FR1.13 — default export is AmbientBackground function', () => {
    expect(source).toContain('export default function AmbientBackground');
  });
});

// ─── FR2: getAmbientColor — panelState signal ────────────────────────────────

describe('getAmbientColor — FR2: panelState signal', () => {
  it('FR2.1 — onTrack → colors.success (#10B981)', () => {
    expect(getAmbientColor({ type: 'panelState', state: 'onTrack' })).toBe('#10B981');
  });

  it('FR2.2 — behind → colors.warning (#F59E0B)', () => {
    expect(getAmbientColor({ type: 'panelState', state: 'behind' })).toBe('#F59E0B');
  });

  it('FR2.3 — critical → colors.critical (#F43F5E)', () => {
    expect(getAmbientColor({ type: 'panelState', state: 'critical' })).toBe('#F43F5E');
  });

  it('FR2.4 — crushedIt → colors.gold (#E8C97A)', () => {
    expect(getAmbientColor({ type: 'panelState', state: 'crushedIt' })).toBe('#E8C97A');
  });

  it('FR2.5 — overtime → colors.overtimeWhiteGold (#FFF8E7)', () => {
    expect(getAmbientColor({ type: 'panelState', state: 'overtime' })).toBe('#FFF8E7');
  });

  it('FR2.6 — idle → null', () => {
    expect(getAmbientColor({ type: 'panelState', state: 'idle' })).toBeNull();
  });

  it('FR2.aop — aheadOfPace → colors.gold (#E8C97A)', () => {
    expect(getAmbientColor({ type: 'panelState', state: 'aheadOfPace' })).toBe('#E8C97A');
  });
});

// ─── FR2: getAmbientColor — earningsPace signal ──────────────────────────────

describe('getAmbientColor — FR2: earningsPace signal', () => {
  it('FR2.7 — ratio=1.0 (strong) → colors.gold', () => {
    expect(getAmbientColor({ type: 'earningsPace', ratio: 1.0 })).toBe('#E8C97A');
  });

  it('FR2.8 — ratio=0.85 (boundary, strong) → colors.gold', () => {
    expect(getAmbientColor({ type: 'earningsPace', ratio: 0.85 })).toBe('#E8C97A');
  });

  it('FR2.9 — ratio=0.84 (below strong boundary) → colors.warning', () => {
    expect(getAmbientColor({ type: 'earningsPace', ratio: 0.84 })).toBe('#F59E0B');
  });

  it('FR2.10 — ratio=0.60 (boundary, behind) → colors.warning', () => {
    expect(getAmbientColor({ type: 'earningsPace', ratio: 0.60 })).toBe('#F59E0B');
  });

  it('FR2.11 — ratio=0.59 (below behind boundary) → colors.critical', () => {
    expect(getAmbientColor({ type: 'earningsPace', ratio: 0.59 })).toBe('#F43F5E');
  });

  it('FR2.12 — ratio=0.0 (no prior data) → colors.gold (assume strong)', () => {
    expect(getAmbientColor({ type: 'earningsPace', ratio: 0 })).toBe('#E8C97A');
  });

  it('FR2.13 — ratio=0.3 (critical zone) → colors.critical', () => {
    expect(getAmbientColor({ type: 'earningsPace', ratio: 0.3 })).toBe('#F43F5E');
  });
});

// ─── FR2: getAmbientColor — aiPct signal ────────────────────────────────────

describe('getAmbientColor — FR2: aiPct signal', () => {
  it('FR2.14 — pct=100 (at target) → colors.violet', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 100 })).toBe('#A78BFA');
  });

  it('FR2.15 — pct=75 (boundary, at target) → colors.violet', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 75 })).toBe('#A78BFA');
  });

  it('FR2.16 — pct=74 (below target boundary) → colors.cyan', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 74 })).toBe('#00C2FF');
  });

  it('FR2.17 — pct=60 (boundary, approaching) → colors.cyan', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 60 })).toBe('#00C2FF');
  });

  it('FR2.18 — pct=59 (below approaching boundary) → colors.warning', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 59 })).toBe('#F59E0B');
  });

  it('FR2.19 — pct=0 (no AI usage) → colors.warning', () => {
    expect(getAmbientColor({ type: 'aiPct', pct: 0 })).toBe('#F59E0B');
  });
});

// ─── FR2: AMBIENT_COLORS constant ────────────────────────────────────────────

describe('AMBIENT_COLORS — FR2: constant structure', () => {
  it('FR2.20 — AMBIENT_COLORS is exported', () => {
    expect(AMBIENT_COLORS).toBeDefined();
  });

  it('FR2.21 — panelState record has all 7 PanelState keys (including aheadOfPace)', () => {
    const keys = Object.keys(AMBIENT_COLORS.panelState);
    expect(keys).toContain('onTrack');
    expect(keys).toContain('behind');
    expect(keys).toContain('critical');
    expect(keys).toContain('crushedIt');
    expect(keys).toContain('overtime');
    expect(keys).toContain('idle');
    expect(keys).toContain('aheadOfPace');
    expect(keys).toHaveLength(7);
  });

  it('FR2.22 — panelState.idle is null', () => {
    expect(AMBIENT_COLORS.panelState.idle).toBeNull();
  });

  it('FR2.23 — earningsPaceStrong is a hex color string', () => {
    expect(AMBIENT_COLORS.earningsPaceStrong).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('FR2.24 — earningsPaceBehind is a hex color string', () => {
    expect(AMBIENT_COLORS.earningsPaceBehind).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('FR2.25 — earningsPaceCritical is a hex color string', () => {
    expect(AMBIENT_COLORS.earningsPaceCritical).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('FR2.26 — aiAtTarget is a hex color string', () => {
    expect(AMBIENT_COLORS.aiAtTarget).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('FR2.27 — aiApproaching is a hex color string', () => {
    expect(AMBIENT_COLORS.aiApproaching).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('FR2.28 — aiBelow is a hex color string', () => {
    expect(AMBIENT_COLORS.aiBelow).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

// ─── FR5: Deprecation + delegation — source checks ───────────────────────────
// Note: Updated in 02-animated-mesh — animation logic moved to AnimatedMeshBackground.tsx.
// These checks verify the compat wrapper structure rather than the old animation implementation.

describe('AmbientBackground — FR5: deprecation + delegation source checks', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(AMBIENT_FILE, 'utf8');
  });

  it('FR5.1 — source has @deprecated annotation (02-animated-mesh)', () => {
    expect(source).toContain('@deprecated');
  });

  it('FR5.2 — source imports AnimatedMeshBackground (delegation target)', () => {
    expect(source).toContain('AnimatedMeshBackground');
  });

  it('FR5.3 — source still exports getAmbientColor (compat — screens import this)', () => {
    expect(source).toContain('getAmbientColor');
  });

  it('FR5.4 — source still exports AMBIENT_COLORS (compat — screens import this)', () => {
    expect(source).toContain('AMBIENT_COLORS');
  });

  it('FR5.5 — source still exports AmbientSignal type (compat)', () => {
    expect(source).toContain('AmbientSignal');
  });

  it('FR5.6 — default export function accepts color prop (backward compat interface)', () => {
    expect(source).toContain('color');
  });

  it('FR5.7 — default export function accepts intensity prop (backward compat interface)', () => {
    expect(source).toContain('intensity');
  });

  it('FR5.8 — source does NOT contain react-native-svg import (SVG replaced by Skia)', () => {
    expect(source).not.toContain("from 'react-native-svg'");
  });

  it('FR5.9 — source does NOT contain Animated.View (animation moved to AnimatedMeshBackground)', () => {
    // The compat wrapper no longer manages its own Reanimated animation
    expect(source).not.toContain('Animated.View');
  });
});
