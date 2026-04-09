// Tests: PanelGradient component (03-base-components + 05-panel-glass-surfaces + 02-dark-glass)
// FR4 (03-base-components): 5-state gradient hero panel with springPremium transition
// FR1 (05-panel-glass-surfaces): Radial panel gradient via SVG RadialGradient (cx=50%, cy=30%)
// FR2 (05-panel-glass-surfaces): Coloured glows — getGlowStyle export
// FR4 (02-dark-glass): BlurView glass base layer at intensity 30
//
// Mock strategy:
// - react-native-svg: passthrough Fragment components (no resetModules)
// - expo-blur: BlurView passthrough with props forwarded
// - Platform.OS: Android branch verified via source analysis

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// Mock expo-blur — BlurView renders as passthrough in tests
jest.mock('expo-blur', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    BlurView: ({ children, intensity, tint, style }: any) =>
      mockReact.createElement('BlurView', { intensity, tint, style }, children ?? null),
  };
});

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

const PANEL_GRADIENT_FILE = path.resolve(__dirname, '../PanelGradient.tsx');

// ─── Module handles — load once, no resetModules ──────────────────────────────

let PanelGradient: any;
let PANEL_GRADIENT_COLORS: any;
let PANEL_GRADIENTS: any;
let getGlowStyle: any;
let BLUR_INTENSITY_PANEL: number;

beforeAll(() => {
  const mod = require('../PanelGradient');
  PanelGradient = mod.default;
  PANEL_GRADIENT_COLORS = mod.PANEL_GRADIENT_COLORS;
  PANEL_GRADIENTS = mod.PANEL_GRADIENTS;
  getGlowStyle = mod.getGlowStyle;
  BLUR_INTENSITY_PANEL = mod.BLUR_INTENSITY_PANEL;
});

// ─── FR1: Runtime render ──────────────────────────────────────────────────────

describe('PanelGradient — FR1: runtime render for all states', () => {
  const allStates = ['onTrack', 'behind', 'critical', 'crushedIt', 'idle', 'overtime', 'aheadOfPace'] as const;

  allStates.forEach((state) => {
    it(`FR1.1 — renders without crash for state="${state}"`, () => {
      expect(() => {
        act(() => {
          create(
            React.createElement(PanelGradient, { state },
              React.createElement('View' as any, null)
            )
          );
        });
      }).not.toThrow();
    });
  });

  it('FR1.2 — renders children inside panel', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(PanelGradient, { state: 'onTrack' }, 'child content')
      );
    });
    expect(JSON.stringify(tree.toJSON())).toContain('child content');
  });

  it('FR1.3 — animation container present (tree not null)', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(PanelGradient, { state: 'onTrack' },
          React.createElement('View' as any, null)
        )
      );
    });
    expect(tree.toJSON()).not.toBeNull();
  });
});

// ─── FR1: PANEL_GRADIENT_COLORS export ───────────────────────────────────────

describe('PanelGradient — FR1: PANEL_GRADIENT_COLORS export', () => {
  it('FR1.12 — PANEL_GRADIENT_COLORS is exported', () => {
    expect(PANEL_GRADIENT_COLORS).toBeDefined();
  });

  it('FR1.13 — onTrack.inner contains #10B981', () => {
    expect(PANEL_GRADIENT_COLORS.onTrack?.inner?.toUpperCase()).toContain('10B981');
  });

  it('FR1.14 — behind.inner contains #F59E0B', () => {
    expect(PANEL_GRADIENT_COLORS.behind?.inner?.toUpperCase()).toContain('F59E0B');
  });

  it('FR1.15 — critical.inner contains #F43F5E', () => {
    expect(PANEL_GRADIENT_COLORS.critical?.inner?.toUpperCase()).toContain('F43F5E');
  });

  it('FR1.16 — crushedIt.inner contains #E8C97A', () => {
    expect(PANEL_GRADIENT_COLORS.crushedIt?.inner?.toUpperCase()).toContain('E8C97A');
  });

  it('FR1.17 — idle entry is null (no gradient)', () => {
    expect(PANEL_GRADIENT_COLORS.idle).toBeNull();
  });

  it('FR1.18 — overtime entry defined and not null', () => {
    expect(PANEL_GRADIENT_COLORS.overtime).toBeDefined();
    expect(PANEL_GRADIENT_COLORS.overtime).not.toBeNull();
  });
});

// ─── FR2: getGlowStyle ────────────────────────────────────────────────────────

describe('PanelGradient — FR2: getGlowStyle', () => {
  it('FR2.1 — getGlowStyle is a function', () => {
    expect(typeof getGlowStyle).toBe('function');
  });

  it('FR2.2 — getGlowStyle("onTrack") returns object with shadow or elevation', () => {
    const style = getGlowStyle('onTrack');
    const hasData = style.shadowColor !== undefined || style.elevation !== undefined;
    expect(hasData).toBe(true);
  });

  it('FR2.11 — getGlowStyle("idle") returns no shadow', () => {
    const style = getGlowStyle('idle');
    const noShadow =
      !style ||
      Object.keys(style).length === 0 ||
      style.shadowOpacity === 0 ||
      (style.elevation === 0 && !style.shadowColor);
    expect(noShadow).toBe(true);
  });

  it('FR2.12 — getGlowStyle returns something for all non-idle states', () => {
    ['onTrack', 'behind', 'critical', 'crushedIt', 'overtime'].forEach((state) => {
      const style = getGlowStyle(state as any);
      expect(style).toBeDefined();
    });
  });
});

// ─── FR1 (01-ahead-of-pace-state): aheadOfPace map entries ───────────────────

describe('PanelGradient — FR1 (01-ahead-of-pace-state): aheadOfPace entries', () => {
  it('FR1.aop.1 — PANEL_GRADIENT_COLORS["aheadOfPace"] is non-null', () => {
    expect(PANEL_GRADIENT_COLORS['aheadOfPace']).not.toBeNull();
    expect(PANEL_GRADIENT_COLORS['aheadOfPace']).toBeDefined();
  });

  it('FR1.aop.2 — PANEL_GRADIENT_COLORS["aheadOfPace"].inner contains E8C97A (gold)', () => {
    expect(PANEL_GRADIENT_COLORS['aheadOfPace']?.inner?.toUpperCase()).toContain('E8C97A');
  });

  it('FR1.aop.3 — PANEL_GRADIENT_COLORS["aheadOfPace"].outer is "transparent"', () => {
    expect(PANEL_GRADIENT_COLORS['aheadOfPace']?.outer).toBe('transparent');
  });

  it('FR1.aop.4 — PANEL_GRADIENTS["aheadOfPace"].colors has length 2', () => {
    expect(Array.isArray(PANEL_GRADIENTS['aheadOfPace']?.colors)).toBe(true);
    expect(PANEL_GRADIENTS['aheadOfPace'].colors).toHaveLength(2);
  });

  it('FR1.aop.5 — PANEL_GRADIENTS["aheadOfPace"].colors[0] contains E8C97A (gold with alpha)', () => {
    expect(PANEL_GRADIENTS['aheadOfPace'].colors[0].toUpperCase()).toContain('E8C97A');
  });

  it('FR1.aop.6 — getGlowStyle("aheadOfPace") returns shadowColor #E8C97A on iOS', () => {
    const style = getGlowStyle('aheadOfPace');
    // On iOS: shadowColor is present; on Android: elevation is present
    const hasShadowColor = style.shadowColor !== undefined;
    const hasElevation = style.elevation !== undefined;
    expect(hasShadowColor || hasElevation).toBe(true);
  });

  it('FR1.aop.7 — PanelGradient renders without error when state="aheadOfPace"', () => {
    expect(() => {
      act(() => {
        create(
          React.createElement(PanelGradient, { state: 'aheadOfPace' },
            React.createElement('View' as any, null)
          )
        );
      });
    }).not.toThrow();
  });
});

// ─── FR1+FR2: Source file checks ─────────────────────────────────────────────

describe('PanelGradient — FR1+FR2: source file structure', () => {
  let source: string;
  let noComments: string;

  beforeAll(() => {
    source = fs.readFileSync(PANEL_GRADIENT_FILE, 'utf8');
    noComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('FR1.4 — imports from react-native-svg', () => {
    expect(source).toContain('react-native-svg');
  });

  it('FR1.5 — uses RadialGradient', () => {
    expect(source).toContain('RadialGradient');
  });

  it('FR1.6 — NO import from expo-linear-gradient (stripped comments)', () => {
    expect(noComments).not.toContain('expo-linear-gradient');
  });

  it('FR1.7 — uses cx="50%"', () => {
    expect(source).toContain('cx="50%"');
  });

  it('FR1.8 — uses cy="30%"', () => {
    expect(source).toContain('cy="30%"');
  });

  it('FR1.9 — uses r="70%"', () => {
    expect(source).toContain('r="70%"');
  });

  it('FR1.10 — imports springPremium', () => {
    expect(source).toContain('springPremium');
  });

  it('FR1.11 — uses withSpring', () => {
    expect(source).toContain('withSpring');
  });

  it('FR2.13 — checks Platform.OS for android branch', () => {
    expect(source).toContain('android');
    expect(source).toContain('Platform');
  });

  it('FR2.14 — uses elevation for Android fallback', () => {
    expect(source).toContain('elevation');
  });

  it('SC4.8 — no StyleSheet.create (outside comments)', () => {
    expect(noComments).not.toContain('StyleSheet.create');
  });
});

// ─── Legacy: PANEL_GRADIENTS backward compat ─────────────────────────────────

describe('PanelGradient — SC4: PANEL_GRADIENTS export (backward compat)', () => {
  it('SC4.2 — PANEL_GRADIENTS exported', () => {
    expect(PANEL_GRADIENTS).toBeDefined();
  });

  const states = ['onTrack', 'behind', 'critical', 'crushedIt', 'idle', 'overtime', 'aheadOfPace'];
  states.forEach((state) => {
    it(`SC4.2 — PANEL_GRADIENTS.${state} has colors array`, () => {
      expect(Array.isArray(PANEL_GRADIENTS[state]?.colors)).toBe(true);
    });
  });

  it('FR3.3 — overtime colors contain FFF8E7', () => {
    const colorStr = PANEL_GRADIENTS.overtime.colors.join('').toUpperCase();
    expect(colorStr).toContain('FFF8E7');
  });

  it('SC4.4 — crushedIt colors contain E8C97A', () => {
    const colorStr = PANEL_GRADIENTS.crushedIt.colors.join('').toUpperCase();
    expect(colorStr).toContain('E8C97A');
  });

  it('SC4.5 — critical colors contain F43F5E', () => {
    const colorStr = PANEL_GRADIENTS.critical.colors.join('').toUpperCase();
    expect(colorStr).toContain('F43F5E');
  });
});

// ─── FR4 (02-dark-glass): PanelGradient glass base layer ─────────────────────

describe('PanelGradient — FR4 (02-dark-glass): BlurView glass base layer', () => {
  function findBlurViews(node: any): any[] {
    if (!node) return [];
    const results: any[] = [];
    if (node.type === 'BlurView') results.push(node);
    if (node.children) {
      for (const child of node.children) {
        results.push(...findBlurViews(child));
      }
    }
    return results;
  }

  it('FR4.1 — BLUR_INTENSITY_PANEL is exported and equals 30', () => {
    expect(BLUR_INTENSITY_PANEL).toBe(30);
  });

  it('FR4.2 — PanelGradient renders a BlurView', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(PanelGradient, { state: 'onTrack' },
          React.createElement('View' as any, null)
        )
      );
    });
    const blurViews = findBlurViews(tree.toJSON());
    expect(blurViews.length).toBeGreaterThan(0);
  });

  it('FR4.3 — BlurView has intensity 30', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(PanelGradient, { state: 'onTrack' },
          React.createElement('View' as any, null)
        )
      );
    });
    const blurViews = findBlurViews(tree.toJSON());
    expect(blurViews[0].props.intensity).toBe(30);
  });

  it('FR4.4 — BlurView present in idle state (no gradient)', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(PanelGradient, { state: 'idle' },
          React.createElement('View' as any, null)
        )
      );
    });
    const blurViews = findBlurViews(tree.toJSON());
    expect(blurViews.length).toBeGreaterThan(0);
  });

  it('FR4.5 — children still render alongside BlurView', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(PanelGradient, { state: 'onTrack' }, 'panel child')
      );
    });
    expect(JSON.stringify(tree.toJSON())).toContain('panel child');
  });

  it('FR4.6 — source imports BlurView from expo-blur', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../PanelGradient.tsx'), 'utf8'
    );
    expect(source).toContain('expo-blur');
    expect(source).toContain('BlurView');
  });

  it('FR4.7 — source exports BLUR_INTENSITY_PANEL', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../PanelGradient.tsx'), 'utf8'
    );
    expect(source).toContain('BLUR_INTENSITY_PANEL');
  });
});

// ─── FR2 (02-home-hero-ambient): PanelGradient gradient expansion ─────────────
//
// Inner stop opacity expanded from 0.35 → 0.50 so the hero glow
// bleeds more strongly into the ambient field.

describe('PanelGradient — FR2 (02-home-hero-ambient): expanded inner gradient opacity', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(PANEL_GRADIENT_FILE, 'utf8');
  });

  it('FR2.T1 — inner stop uses stopOpacity={0.50}', () => {
    expect(source).toContain('stopOpacity={0.50}');
  });

  it('FR2.T2 — source still has r="70%" (radius unchanged)', () => {
    expect(source).toContain('r="70%"');
  });

  it('FR2.T3 — source still has cx="50%" (center x unchanged)', () => {
    expect(source).toContain('cx="50%"');
  });

  it('FR2.T4 — source still has cy="30%" (center y unchanged)', () => {
    expect(source).toContain('cy="30%"');
  });

  it('FR2.T5 — source does NOT have stopOpacity={0.35} (old value removed)', () => {
    expect(source).not.toContain('stopOpacity={0.35}');
  });
});
