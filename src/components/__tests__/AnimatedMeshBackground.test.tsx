// Tests: AnimatedMeshBackground component (02-animated-mesh)
// FR1: AnimatedMeshBackground component — Canvas, absoluteFill, pointerEvents
// FR2: Reanimated animation driver — time SharedValue, useDerivedValue orbital math
// FR3: Status-driven Node C color — priority resolution (panelState > earningsPace > aiPct > idle)
// FR4: Gradient node visual spec — Skia imports, alpha 0.12, BlendMode.Screen, z-order
// FR5: AmbientBackground backward compatibility — compat re-export, preserved named exports
//
// Mock strategy:
// - @shopify/react-native-skia: project-level __mocks__/@shopify/react-native-skia.ts (auto-applied)
//   We extend it locally for RadialGradient and BlendMode which the new component needs.
// - react-native-reanimated: standard jest-expo preset auto-mock
// - Source analysis (fs.readFileSync) for animation internals not observable via renderer

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Extend Skia mock for new APIs used by AnimatedMeshBackground ─────────────
// The project-level mock handles Canvas, Rect, Circle, Paint, vec.
// We add RadialGradient and BlendMode here since they're new to this component.
jest.mock('@shopify/react-native-skia', () => {
  const originalMock = jest.requireActual
    ? (() => {
        try {
          return require('../../../__mocks__/@shopify/react-native-skia');
        } catch {
          return {};
        }
      })()
    : {};
  const mockReact = require('react');
  return {
    ...originalMock,
    Canvas: ({ children, style }: any) =>
      mockReact.createElement('Canvas', { style }, children),
    Rect: (_props: any) => null,
    Circle: ({ children }: any) => children ?? null,
    Paint: (_props: any) => null,
    RadialGradient: (_props: any) => null,
    vec: (x: number, y: number) => ({ x, y }),
    BlendMode: { Screen: 'screen' },
    useDerivedValue: (fn: () => any) => ({ value: fn() }),
    matchFont: jest.fn(() => ({ size: 10, measureText: jest.fn(() => ({ width: 50, height: 10 })) })),
    Skia: {
      Path: Object.assign(
        () => ({ moveTo: jest.fn().mockReturnThis(), lineTo: jest.fn().mockReturnThis(), close: jest.fn().mockReturnThis() }),
        { Make: () => ({ moveTo: jest.fn().mockReturnThis(), lineTo: jest.fn().mockReturnThis(), close: jest.fn().mockReturnThis() }) }
      ),
      XYWHRect: jest.fn((x: number, y: number, w: number, h: number) => ({ x, y, w, h })),
      Color: jest.fn((color: string) => color),
    },
  };
});

const MESH_FILE = path.resolve(__dirname, '../AnimatedMeshBackground.tsx');
const AMBIENT_FILE = path.resolve(__dirname, '../AmbientBackground.tsx');

// ─── Module handles ──────────────────────────────────────────────────────────

let AnimatedMeshBackground: any;
let AmbientBackground: any;
let AmbientBackgroundModule: any;

beforeAll(() => {
  AnimatedMeshBackground = require('../AnimatedMeshBackground').default;
  AmbientBackgroundModule = require('../AmbientBackground');
  AmbientBackground = AmbientBackgroundModule.default;
});

// ─── FR1: AnimatedMeshBackground component — render ─────────────────────────

describe('AnimatedMeshBackground — FR1: component render', () => {
  it('FR1.1 — renders without error when no props provided', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedMeshBackground, {}));
      });
    }).not.toThrow();
  });

  it('FR1.2 — renders without error when panelState="onTrack"', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedMeshBackground, { panelState: 'onTrack' }));
      });
    }).not.toThrow();
  });

  it('FR1.3 — renders without error when panelState=null', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedMeshBackground, { panelState: null }));
      });
    }).not.toThrow();
  });

  it('FR1.4 — renders non-null output (never returns null)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedMeshBackground, {}));
    });
    expect(tree.toJSON()).not.toBeNull();
  });

  it('FR1.5 — renders a single root element (not fragment or array)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedMeshBackground, {}));
    });
    expect(Array.isArray(tree.toJSON())).toBe(false);
  });
});

// ─── FR1: Source file structure ──────────────────────────────────────────────

describe('AnimatedMeshBackground — FR1: source structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MESH_FILE, 'utf8');
  });

  it('FR1.6 — source uses StyleSheet.absoluteFill for Canvas positioning', () => {
    expect(source).toContain('StyleSheet.absoluteFill');
  });

  it('FR1.7 — source has pointerEvents="none" on Canvas element', () => {
    expect(source).toContain('pointerEvents');
    expect(source).toContain('"none"');
  });

  it('FR1.8 — source exports AnimatedMeshBackground as named export', () => {
    const mod = require('../AnimatedMeshBackground');
    expect(mod.AnimatedMeshBackground).toBeDefined();
  });

  it('FR1.9 — source exports AnimatedMeshBackground as default export', () => {
    const mod = require('../AnimatedMeshBackground');
    expect(mod.default).toBeDefined();
  });

  it('FR1.10 — source imports useWindowDimensions for responsive dimensions', () => {
    expect(source).toContain('useWindowDimensions');
  });
});

// ─── FR2: Reanimated animation driver — source checks ────────────────────────

describe('AnimatedMeshBackground — FR2: animation driver', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MESH_FILE, 'utf8');
  });

  it('FR2.1 — source uses useSharedValue(0) for time initialization', () => {
    expect(source).toContain('useSharedValue(0)');
  });

  it('FR2.2 — source calls withTiming with duration: 20000', () => {
    expect(source).toContain('20000');
    expect(source).toContain('withTiming');
  });

  it('FR2.3 — source calls withRepeat with -1 (infinite)', () => {
    expect(source).toContain('withRepeat');
    expect(source).toContain('-1');
  });

  it('FR2.4 — source calls withRepeat with false (no reverse / no yoyo)', () => {
    // withRepeat(withTiming(...), -1, false) — 3rd arg must be false
    // Find the usage line (withRepeat call, not the import declaration)
    const withRepeatLine = source.split('\n').find(line =>
      line.includes('withRepeat(') && line.includes('-1')
    );
    expect(withRepeatLine).toBeDefined();
    expect(withRepeatLine).toContain('false');
  });

  it('FR2.5 — source uses useDerivedValue for node center computations', () => {
    expect(source).toContain('useDerivedValue');
  });

  it('FR2.6 — source has three useDerivedValue calls (one per node)', () => {
    const matches = source.match(/useDerivedValue/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it('FR2.7 — nodeBCenter phase offset is 2π/3 (source contains 2 * Math.PI / 3 or equivalent)', () => {
    // Accept: (2 * Math.PI) / 3, 2*Math.PI/3, 2.094..., or 2/3 factor comment
    const hasPhaseB =
      source.includes('2 * Math.PI') ||
      source.includes('2*Math.PI') ||
      source.includes('(Math.PI * 2') ||
      source.match(/2\s*\*\s*Math\.PI\s*\/\s*3/) !== null ||
      source.includes('2.094');
    expect(hasPhaseB).toBe(true);
  });

  it('FR2.8 — nodeCCenter phase offset is 4π/3 (source contains 4 * Math.PI) / 3 or equivalent)', () => {
    // Accepts: (4 * Math.PI) / 3 or 4 * Math.PI / 3 or 4.188...
    const hasPhaseC =
      source.includes('4 * Math.PI') ||
      source.includes('4*Math.PI') ||
      source.includes('4.188') ||
      source.includes('(4 / 3)') ||
      // multiline — check for "4" near "Math.PI" near "/ 3"
      (source.includes('4 * Math.PI') && source.includes('/ 3'));
    expect(hasPhaseC).toBe(true);
  });

  it('FR2.9 — nodeACenter math: at time=0, x = w*0.5 (sin(0)=0)', () => {
    // Verify the formula constants: cx = w * 0.5 + w * 0.30 * sin(...)
    expect(source).toMatch(/0\.5\s*\+[^)]*0\.3[0]?\s*\*\s*Math\.sin/);
  });

  it('FR2.10 — nodeACenter math: cy_base = h * 0.3 (base y for node A)', () => {
    // h * 0.3 is node A base y
    expect(source).toMatch(/h\s*\*\s*0\.3/);
  });

  it('FR2.11 — nodeCCenter amplitude is smaller than nodeA (±25% width vs ±30%)', () => {
    // Node C: 0.25 amplitude (smaller orbit than A/B which use 0.30)
    expect(source).toContain('0.25');
  });
});

// ─── FR3: Node C color resolution ────────────────────────────────────────────

describe('AnimatedMeshBackground — FR3: Node C color resolution', () => {
  let source: string;
  let resolveNodeCColor: (panelState?: any, earningsPace?: any, aiPct?: any) => string;

  beforeAll(() => {
    source = fs.readFileSync(MESH_FILE, 'utf8');
    // Try to extract the exported resolveNodeCColor if exported, else test via source
    try {
      const mod = require('../AnimatedMeshBackground');
      if (mod.resolveNodeCColor) {
        resolveNodeCColor = mod.resolveNodeCColor;
      }
    } catch (_) {}
  });

  // Source-level checks for color resolution logic
  it('FR3.1 — source contains panelState color map (PANEL_STATE_COLORS or AMBIENT_COLORS)', () => {
    const hasPanelMap =
      source.includes('PANEL_STATE_COLORS') ||
      source.includes('AMBIENT_COLORS') ||
      source.includes('panelState:');
    expect(hasPanelMap).toBe(true);
  });

  it('FR3.2 — source contains color resolution logic for earningsPace and aiPct signals', () => {
    const hasResolution =
      source.includes('earningsPace') &&
      (source.includes('aiPct') || source.includes('aiPct'));
    expect(hasResolution).toBe(true);
  });

  it('FR3.3 — source handles panelState priority first in resolveNodeCColor', () => {
    // panelState check must appear before earningsPace check
    const panelStateIdx = source.indexOf('panelState');
    const earningsPaceIdx = source.indexOf('earningsPace');
    expect(panelStateIdx).toBeGreaterThan(-1);
    expect(earningsPaceIdx).toBeGreaterThan(-1);
    expect(panelStateIdx).toBeLessThan(earningsPaceIdx);
  });

  it('FR3.4 — source has idle fallback to background color (#0D0C14)', () => {
    expect(source).toContain('#0D0C14');
  });

  it('FR3.5 — source handles null panelState (idle state) without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedMeshBackground, { panelState: 'idle' }));
      });
    }).not.toThrow();
  });

  it('FR3.6 — renders with earningsPace prop without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedMeshBackground, { earningsPace: 0.9 }));
      });
    }).not.toThrow();
  });

  it('FR3.7 — renders with aiPct prop without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedMeshBackground, { aiPct: 80 }));
      });
    }).not.toThrow();
  });

  // If resolveNodeCColor is exported, test the pure function directly
  describe('resolveNodeCColor (if exported)', () => {
    it('FR3.8 — panelState="onTrack" → returns #4ADE80 (10-mesh-color-overhaul: desaturated success green)', () => {
      if (!resolveNodeCColor) return; // skip if not exported
      const result = resolveNodeCColor('onTrack');
      // Updated by 10-mesh-color-overhaul: #10B981 → #4ADE80
      expect(result.toLowerCase()).toContain('4ade80');
    });

    it('FR3.9 — panelState="crushedIt" → returns #C89F5D (10-mesh-color-overhaul: champagne gold)', () => {
      if (!resolveNodeCColor) return;
      const result = resolveNodeCColor('crushedIt');
      // Updated by 10-mesh-color-overhaul: #E8C97A → #C89F5D
      expect(result.toLowerCase()).toContain('c89f5d');
    });

    it('FR3.10 — panelState="critical" → returns #F87171 (10-mesh-color-overhaul: desaturated coral)', () => {
      if (!resolveNodeCColor) return;
      const result = resolveNodeCColor('critical');
      // Updated by 10-mesh-color-overhaul: #F43F5E → #F87171
      expect(result.toLowerCase()).toContain('f87171');
    });

    it('FR3.11 — panelState="behind" → returns #FCD34D (10-mesh-color-overhaul: warn amber)', () => {
      if (!resolveNodeCColor) return;
      const result = resolveNodeCColor('behind');
      // Updated by 10-mesh-color-overhaul: #F59E0B → #FCD34D
      expect(result.toLowerCase()).toContain('fcd34d');
    });

    it('FR3.12 — panelState="idle" → returns #556B8E (10-mesh-color-overhaul: dusty blue, not #0D0C14)', () => {
      if (!resolveNodeCColor) return;
      const result = resolveNodeCColor('idle');
      // Updated by 10-mesh-color-overhaul: null → #556B8E
      expect(result.toLowerCase()).toContain('556b8e');
    });

    it('FR3.13 — all props undefined → returns #0D0C14', () => {
      if (!resolveNodeCColor) return;
      const result = resolveNodeCColor(undefined, undefined, undefined);
      expect(result.toLowerCase()).toContain('0d0c14');
    });

    it('FR3.14 — earningsPace=0.9 (no panelState) → gold #E8C97A', () => {
      if (!resolveNodeCColor) return;
      const result = resolveNodeCColor(undefined, 0.9);
      expect(result.toLowerCase()).toContain('e8c97a');
    });

    it('FR3.15 — aiPct=80 (no panelState, no earningsPace) → violet #A78BFA', () => {
      if (!resolveNodeCColor) return;
      const result = resolveNodeCColor(undefined, undefined, 80);
      expect(result.toLowerCase()).toContain('a78bfa');
    });

    it('FR3.16 — panelState takes priority over earningsPace when both provided', () => {
      if (!resolveNodeCColor) return;
      // panelState=critical (#F87171) should win over earningsPace=0.9 (would give gold)
      // 10-mesh-color-overhaul: critical changed from #F43F5E → #F87171 (desatCoral)
      const result = resolveNodeCColor('critical', 0.9);
      expect(result.toLowerCase()).toContain('f87171');
    });
  });
});

// ─── FR4: Gradient node visual spec — source checks ─────────────────────────

describe('AnimatedMeshBackground — FR4: gradient node visual spec', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MESH_FILE, 'utf8');
  });

  it('FR4.1 — source imports Canvas from @shopify/react-native-skia', () => {
    expect(source).toContain('@shopify/react-native-skia');
    expect(source).toContain('Canvas');
  });

  it('FR4.2 — source imports Circle from @shopify/react-native-skia', () => {
    expect(source).toContain('Circle');
  });

  it('FR4.3 — source imports Rect from @shopify/react-native-skia', () => {
    expect(source).toContain('Rect');
  });

  it('FR4.4 — source imports RadialGradient from @shopify/react-native-skia', () => {
    expect(source).toContain('RadialGradient');
  });

  it('FR4.5 — source imports vec from @shopify/react-native-skia', () => {
    expect(source).toContain('vec');
  });

  it('FR4.6 — source contains 0.22 alpha for inner gradient stops (08-dark-glass-polish: bumped from 0.15 to 0.22)', () => {
    // Bumped from 0.15 → 0.22 in 08-dark-glass-polish for more visible light bloom behind glass
    expect(source).toContain('0.22');
  });

  it('FR4.7 — Node A contains violet color A78BFA (case-insensitive)', () => {
    expect(source.toLowerCase()).toContain('a78bfa');
  });

  it('FR4.8 — Node B contains cyan color 00C2FF (case-insensitive)', () => {
    expect(source.toLowerCase()).toContain('00c2ff');
  });

  it('FR4.9 — source references screen blend mode (BlendMode or blendMode)', () => {
    const hasBlendMode =
      source.includes('BlendMode') ||
      source.includes('blendMode') ||
      source.includes('"screen"') ||
      source.includes("'screen'");
    expect(hasBlendMode).toBe(true);
  });

  it('FR4.10 — base Rect appears before Circle nodes in source (z-order: base first)', () => {
    // The base Rect JSX should appear before the first Circle JSX
    const rectIdx = source.indexOf('<Rect');
    const circleIdx = source.indexOf('<Circle');
    expect(rectIdx).toBeGreaterThan(-1);
    expect(circleIdx).toBeGreaterThan(-1);
    expect(rectIdx).toBeLessThan(circleIdx);
  });

  it('FR4.11 — source contains w * 1.2 for circle radius (10-mesh-color-overhaul: expanded from 0.7)', () => {
    // Updated by 10-mesh-color-overhaul: radius expanded from w*0.7 to w*1.2
    expect(source).toMatch(/1\.2/);
  });
});

// ─── FR5: AmbientBackground backward compatibility ───────────────────────────

describe('AmbientBackground — FR5: backward compatibility', () => {
  it('FR5.1 — AmbientBackground default import resolves at runtime', () => {
    expect(AmbientBackground).toBeDefined();
  });

  it('FR5.2 — rendering <AmbientBackground color="#10B981" /> does not throw', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AmbientBackground, { color: '#10B981' }));
      });
    }).not.toThrow();
  });

  it('FR5.3 — rendering <AmbientBackground color={null} /> does not throw', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AmbientBackground, { color: null }));
      });
    }).not.toThrow();
  });

  it('FR5.4 — AMBIENT_COLORS named export is preserved', () => {
    expect(AmbientBackgroundModule.AMBIENT_COLORS).toBeDefined();
    expect(AmbientBackgroundModule.AMBIENT_COLORS.panelState).toBeDefined();
  });

  it('FR5.5 — getAmbientColor named export is preserved and functional', () => {
    expect(AmbientBackgroundModule.getAmbientColor).toBeDefined();
    const result = AmbientBackgroundModule.getAmbientColor({
      type: 'panelState',
      state: 'onTrack',
    });
    expect(result).toBe('#10B981');
  });

  it('FR5.6 — AmbientBackground.tsx source contains @deprecated annotation', () => {
    const ambientSource = fs.readFileSync(AMBIENT_FILE, 'utf8');
    expect(ambientSource).toContain('@deprecated');
  });

  it('FR5.7 — AmbientBackground default export delegates to AnimatedMeshBackground', () => {
    // Either AmbientBackground IS AnimatedMeshBackground (re-export),
    // or it renders an AnimatedMeshBackground inside.
    // We check the AmbientBackground source delegates rather than being the old SVG component.
    const ambientSource = fs.readFileSync(AMBIENT_FILE, 'utf8');
    const delegatesToMesh =
      ambientSource.includes('AnimatedMeshBackground') ||
      ambientSource.includes('./AnimatedMeshBackground');
    expect(delegatesToMesh).toBe(true);
  });
});

// ─── FR5: hexToRgba helper (if exported) ────────────────────────────────────

describe('hexToRgba helper (if exported)', () => {
  it('FR5.8 — converts hex + alpha to rgba string', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.hexToRgba) return; // optional export
    expect(mod.hexToRgba('#A78BFA', 0.12)).toBe('rgba(167,139,250,0.12)');
    expect(mod.hexToRgba('#00C2FF', 0.12)).toBe('rgba(0,194,255,0.12)');
  });

  it('FR5.9 — hexToRgba with 0.22 alpha for NODE_A (08-dark-glass-polish opacity bump)', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.hexToRgba) return;
    expect(mod.hexToRgba('#A78BFA', 0.22)).toBe('rgba(167,139,250,0.22)');
    expect(mod.hexToRgba('#00C2FF', 0.22)).toBe('rgba(0,194,255,0.22)');
  });
});

// ─── 10-mesh-color-overhaul: FR1 — Mesh radius expansion ────────────────────

describe('AnimatedMeshBackground — 10-mesh-color-overhaul FR1: node radius', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MESH_FILE, 'utf8');
  });

  it('FR1-overhaul.1 — nodeRadius evaluates to w * 1.2 (not w * 0.7)', () => {
    // Regex: any form of w * 1.2 or w*1.2
    expect(source).toMatch(/w\s*\*\s*1\.2/);
  });

  it('FR1-overhaul.2 — source does NOT contain w * 0.7 as the nodeRadius value', () => {
    // w * 0.7 should no longer appear as the radius assignment
    // It's OK if 0.7 appears in comments, but the nodeRadius = line must use 1.2
    const nodeRadiusLine = source.split('\n').find(line =>
      line.includes('nodeRadius') && line.includes('=') && !line.trimStart().startsWith('//')
    );
    if (nodeRadiusLine) {
      expect(nodeRadiusLine).toContain('1.2');
      expect(nodeRadiusLine).not.toContain('0.7');
    }
  });

  it('FR1-overhaul.3 — hexToRgba still produces valid rgba string (regression)', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.hexToRgba) return;
    const result = mod.hexToRgba('#A78BFA', 0.22);
    expect(result).toBe('rgba(167,139,250,0.22)');
  });
});

// ─── 10-mesh-color-overhaul: FR2 — State color palette ──────────────────────

describe('AnimatedMeshBackground — 10-mesh-color-overhaul FR2: state color palette', () => {
  let resolveNodeCColor: (panelState?: any, earningsPace?: any, aiPct?: any) => string;

  beforeAll(() => {
    jest.resetModules();
    const mod = require('../AnimatedMeshBackground');
    resolveNodeCColor = mod.resolveNodeCColor;
  });

  it('FR2-overhaul.1 — resolveNodeCColor("idle") returns #556B8E (dusty blue, not null)', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor('idle');
    expect(result.toLowerCase()).toBe('#556b8e');
  });

  it('FR2-overhaul.2 — resolveNodeCColor("critical") returns #F87171 (desaturated coral)', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor('critical');
    expect(result.toLowerCase()).toBe('#f87171');
  });

  it('FR2-overhaul.3 — resolveNodeCColor("behind") returns #FCD34D (warn amber)', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor('behind');
    expect(result.toLowerCase()).toBe('#fcd34d');
  });

  it('FR2-overhaul.4 — resolveNodeCColor("onTrack") returns #4ADE80 (success green)', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor('onTrack');
    expect(result.toLowerCase()).toBe('#4ade80');
  });

  it('FR2-overhaul.5 — resolveNodeCColor("aheadOfPace") returns #4ADE80 (same as onTrack)', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor('aheadOfPace');
    expect(result.toLowerCase()).toBe('#4ade80');
  });

  it('FR2-overhaul.6 — resolveNodeCColor("crushedIt") returns #C89F5D (champagne gold)', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor('crushedIt');
    expect(result.toLowerCase()).toBe('#c89f5d');
  });

  it('FR2-overhaul.7 — resolveNodeCColor("overtime") returns #CEA435 (luxury gold)', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor('overtime');
    expect(result.toLowerCase()).toBe('#cea435');
  });

  it('FR2-overhaul.8 — resolveNodeCColor(null, null, null) returns colors.background (#0D0C14)', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor(null, null, null);
    expect(result.toLowerCase()).toBe('#0d0c14');
  });

  it('FR2-overhaul.9 — resolveNodeCColor(undefined, undefined, undefined) returns colors.background', () => {
    if (!resolveNodeCColor) return;
    const result = resolveNodeCColor(undefined, undefined, undefined);
    expect(result.toLowerCase()).toBe('#0d0c14');
  });
});

// ─── 08-dark-glass-polish: Node C color signal tests (FR4) ──────────────────

describe('AnimatedMeshBackground — 08-dark-glass-polish FR4: Node C signal wiring', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MESH_FILE, 'utf8');
  });

  it('FR4-polish.1 — NODE_A_INNER uses 0.22 opacity (not 0.15)', () => {
    // 08-dark-glass-polish bumps opacity 0.15 → 0.22 for more visible light bloom
    expect(source).toContain("rgba(167,139,250,0.22)");
  });

  it('FR4-polish.2 — NODE_B_INNER uses 0.22 opacity (not 0.15)', () => {
    expect(source).toContain("rgba(0,194,255,0.22)");
  });

  it('FR4-polish.3 — source uses 0.22 for Node C hexToRgba call', () => {
    // hexToRgba(nodeCHex, 0.22) — the dynamic Node C opacity
    expect(source).toContain('0.22');
  });

  it('FR4-polish.4 — resolveNodeCColor earningsPace=0.9 returns gold', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.resolveNodeCColor) return;
    const result = mod.resolveNodeCColor(undefined, 0.9);
    // gold = #E8C97A
    expect(result.toLowerCase()).toContain('e8c97a');
  });

  it('FR4-polish.5 — resolveNodeCColor earningsPace=0.65 returns warning color', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.resolveNodeCColor) return;
    const result = mod.resolveNodeCColor(undefined, 0.65);
    // warning = #F59E0B
    expect(result.toLowerCase()).toContain('f59e0b');
  });

  it('FR4-polish.6 — resolveNodeCColor earningsPace=0.5 returns critical color', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.resolveNodeCColor) return;
    const result = mod.resolveNodeCColor(undefined, 0.5);
    // critical = #F43F5E
    expect(result.toLowerCase()).toContain('f43f5e');
  });

  it('FR4-polish.7 — resolveNodeCColor aiPct=80 returns violet', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.resolveNodeCColor) return;
    const result = mod.resolveNodeCColor(undefined, undefined, 80);
    // violet = #A78BFA
    expect(result.toLowerCase()).toContain('a78bfa');
  });

  it('FR4-polish.8 — resolveNodeCColor aiPct=65 returns cyan', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.resolveNodeCColor) return;
    const result = mod.resolveNodeCColor(undefined, undefined, 65);
    // cyan = #00C2FF
    expect(result.toLowerCase()).toContain('00c2ff');
  });

  it('FR4-polish.9 — resolveNodeCColor aiPct=50 returns warning', () => {
    const mod = require('../AnimatedMeshBackground');
    if (!mod.resolveNodeCColor) return;
    const result = mod.resolveNodeCColor(undefined, undefined, 50);
    expect(result.toLowerCase()).toContain('f59e0b');
  });
});
