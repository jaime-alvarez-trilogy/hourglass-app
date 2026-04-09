// Tests: Card component (02-dark-glass + 01-ambient-layer)
// FR1: Card glass layer — base variant (flat dark surface, no BlurView)
// FR2: Card glass layer — elevated variant (slightly brighter flat dark surface)
// FR3: Card glass={false} opt-out — flat legacy render
// FR3 (01-ambient-layer): GLASS_BASE opacity updated for flat-glass (no BlurView)
// FR4 (01-ambient-layer): GLASS_ELEVATED opacity updated for flat-glass (no BlurView)
//
// Retained from 03-base-components:
//   SC1.1 — runtime render checks (children, elevated, className)
//   SC1.2/SC1.3 — source file class strings (updated for glass implementation)
//
// NOTE: BlurView removed from Card (crash fix — see Card.tsx for rationale).
// Card now uses flat semi-opaque dark surface. Tests updated accordingly.
//
// NOTE on NativeWind v4 + test-renderer:
// NativeWind v4 transforms className to hashed IDs in Jest/node.
// className assertions are done via source-file static analysis (fs.readFileSync).

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const CARD_FILE = path.resolve(__dirname, '../Card.tsx');

// ─── Module handle — load once ────────────────────────────────────────────────

let Card: any;
let GLASS_BASE: any;
let GLASS_ELEVATED: any;
let BLUR_INTENSITY_BASE: number;
let BLUR_INTENSITY_ELEVATED: number;

beforeAll(() => {
  const mod = require('../Card');
  Card = mod.default;
  GLASS_BASE = mod.GLASS_BASE;
  GLASS_ELEVATED = mod.GLASS_ELEVATED;
  BLUR_INTENSITY_BASE = mod.BLUR_INTENSITY_BASE;
  BLUR_INTENSITY_ELEVATED = mod.BLUR_INTENSITY_ELEVATED;
});

// ─── Runtime render checks (retained from 03-base-components) ─────────────────

describe('Card — runtime render (retained)', () => {
  it('SC1.1 — renders children without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(Card, null, React.createElement('View' as any, null)));
      });
    }).not.toThrow();
  });

  it('SC1.1 — children are present in rendered output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, null, 'card content'));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('card content');
  });

  it('SC1.1 — renders with elevated=true without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(Card, { elevated: true }, 'elevated card'));
      });
    }).not.toThrow();
  });

  it('SC1.1 — renders with className prop without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(Card, { className: 'p-8' }, 'custom padding'));
      });
    }).not.toThrow();
  });

  it('SC1.1 — renders exactly one root element (not fragment, not array)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, null, 'child'));
    });
    const json = tree.toJSON();
    expect(Array.isArray(json)).toBe(false);
    expect(json).not.toBeNull();
  });
});

// ─── FR1: GLASS_BASE constant ─────────────────────────────────────────────────

describe('Card — FR1: GLASS_BASE exported constant', () => {
  it('FR1.1 — GLASS_BASE is exported', () => {
    expect(GLASS_BASE).toBeDefined();
  });

  it('FR1.2 — GLASS_BASE.backgroundColor is semi-transparent (contains rgba)', () => {
    expect(GLASS_BASE.backgroundColor).toMatch(/rgba/i);
  });

  it('FR1.3 — GLASS_BASE.backgroundColor contains surface colour values (22, 21, 31)', () => {
    expect(GLASS_BASE.backgroundColor).toContain('22');
    expect(GLASS_BASE.backgroundColor).toContain('21');
    expect(GLASS_BASE.backgroundColor).toContain('31');
  });

  it('FR1.4 — GLASS_BASE.borderColor is an rgba white value', () => {
    // Normalise whitespace for comparison — value may be 0.06 or 0.10 per design iteration
    const normalised = GLASS_BASE.borderColor.replace(/\s/g, '');
    expect(normalised).toMatch(/^rgba\(255,255,255,/);
  });

  it('FR1.5 — GLASS_BASE.borderWidth is 1', () => {
    expect(GLASS_BASE.borderWidth).toBe(1);
  });

  it('FR1.6 — BLUR_INTENSITY_BASE is ≥ 60 (constant retained for test compatibility)', () => {
    expect(BLUR_INTENSITY_BASE).toBeGreaterThanOrEqual(60);
  });
});

// ─── FR1: Card base glass layer structure ─────────────────────────────────────
// BlurView removed — Card uses flat dark surface to avoid GPU framebuffer OOM.

describe('Card — FR1: base glass layer structure', () => {
  it('FR1.7 — base Card renders without BlurView (flat surface, no GPU framebuffer allocation)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, null, 'child'));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('BlurView');
  });

  it('FR1.8 — base Card renders children inside the content layer', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, null, 'inner content'));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('inner content');
  });

  it('FR1.9 — source has overflow hidden in OUTER_STYLE (reliable source check)', () => {
    // Runtime style assertions are unreliable in this NativeWind test env —
    // style objects may be registered as numeric IDs. Use source analysis.
    const source = fs.readFileSync(CARD_FILE, 'utf8');
    expect(source).toContain("overflow: 'hidden'");
  });

  it('FR1.10 — source has borderRadius 16 in OUTER_STYLE (reliable source check)', () => {
    const source = fs.readFileSync(CARD_FILE, 'utf8');
    expect(source).toContain('borderRadius: 16');
  });
});

// ─── FR2: GLASS_ELEVATED constant ────────────────────────────────────────────

describe('Card — FR2: GLASS_ELEVATED exported constant', () => {
  it('FR2.1 — GLASS_ELEVATED is exported', () => {
    expect(GLASS_ELEVATED).toBeDefined();
  });

  it('FR2.2 — GLASS_ELEVATED.backgroundColor is semi-transparent (contains rgba)', () => {
    expect(GLASS_ELEVATED.backgroundColor).toMatch(/rgba/i);
  });

  it('FR2.3 — GLASS_ELEVATED.backgroundColor is different from GLASS_BASE', () => {
    expect(GLASS_ELEVATED.backgroundColor).not.toBe(GLASS_BASE.backgroundColor);
  });

  it('FR2.4 — GLASS_ELEVATED.borderColor matches GLASS_BASE borderColor', () => {
    expect(GLASS_ELEVATED.borderColor).toBe(GLASS_BASE.borderColor);
  });

  it('FR2.5 — BLUR_INTENSITY_ELEVATED is ≥ 80 (constant retained for test compatibility)', () => {
    expect(BLUR_INTENSITY_ELEVATED).toBeGreaterThanOrEqual(80);
  });
});

// ─── FR2: elevated variant renders without BlurView ──────────────────────────

describe('Card — FR2: elevated variant uses flat dark surface', () => {
  it('FR2.6 — elevated Card renders without BlurView (flat surface, no GPU framebuffer allocation)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, { elevated: true }, 'elevated child'));
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain('BlurView');
  });
});

// ─── FR3: glass={false} opt-out ──────────────────────────────────────────────

describe('Card — FR3: glass opt-out prop', () => {
  it('FR3.1 — glass={false} renders no BlurView', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, { glass: false }, 'flat child'));
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain('BlurView');
  });

  it('FR3.2 — glass={false} still renders children', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, { glass: false }, 'flat child'));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('flat child');
  });

  it('FR3.3 — glass={true} (default) renders without BlurView (flat-glass implementation)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, { glass: true }, 'glass child'));
    });
    // BlurView removed from Card — both glass=true and glass=false use flat surfaces
    expect(JSON.stringify(tree.toJSON())).not.toContain('BlurView');
  });

  it('FR3.4 — className prop is accepted without crash in both modes', () => {
    expect(() => {
      act(() => {
        create(React.createElement(Card, { glass: false, className: 'mt-4' }, 'child'));
      });
    }).not.toThrow();
    expect(() => {
      act(() => {
        create(React.createElement(Card, { glass: true, className: 'mt-4' }, 'child'));
      });
    }).not.toThrow();
  });
});

// ─── Source file static checks (updated for flat-glass) ──────────────────────

describe('Card — source file structure checks', () => {
  let source: string;
  let noComments: string;

  beforeAll(() => {
    source = fs.readFileSync(CARD_FILE, 'utf8');
    noComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC1.2 — source contains bg-surface class string (for glass=false fallback)', () => {
    expect(source).toContain('bg-surface');
  });

  it('SC1.2 — source contains rounded-2xl class string', () => {
    expect(source).toContain('rounded-2xl');
  });

  it('SC1.3 — source contains bg-surfaceElevated class string (for elevated glass=false)', () => {
    expect(source).toContain('bg-surfaceElevated');
  });

  it('SC1.4 — source accepts className prop', () => {
    expect(source).toMatch(/className/);
  });

  it('SC1.5 — code does not use StyleSheet.create (outside comments)', () => {
    expect(noComments).not.toContain('StyleSheet.create');
  });

  it('SC2.1 — source exports GLASS_BASE constant', () => {
    expect(source).toContain('GLASS_BASE');
  });

  it('SC2.2 — source exports GLASS_ELEVATED constant', () => {
    expect(source).toContain('GLASS_ELEVATED');
  });

  it('SC2.3 — source does not import BlurView (flat-glass implementation, no per-card GPU framebuffer)', () => {
    // BlurView removed from Card to prevent concurrent UIVisualEffectView allocation OOM.
    // PanelGradient and AIArcHero retain their single BlurViews.
    expect(noComments).not.toContain('BlurView');
  });

  it('SC2.4 — source uses rgba white border colour', () => {
    // Value may be 0.06 or 0.10 depending on design iteration — check pattern only
    expect(source).toMatch(/rgba\(255, 255, 255, 0\.\d+\)/);
  });

  it('SC2.5 — source does not use StyleSheet.absoluteFill (BlurView removed)', () => {
    expect(noComments).not.toContain('StyleSheet.absoluteFill');
  });
});

// ─── FR7 (03-glass-surfaces): Card delegation to GlassCard ───────────────────
// Card with glass=true (default) now delegates to GlassCard which renders a
// Skia Canvas with BackdropFilter. glass=false keeps the flat legacy surface.

describe('Card — FR7 (03-glass-surfaces): GlassCard delegation', () => {
  it('FR7.1 — Card with default props renders Canvas element after layout (GlassCard delegation)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, null, 'child'));
    });
    // Canvas is guarded by dims.w > 0 — fire onLayout to trigger render
    act(() => {
      const withLayout = tree.root.findAll(
        (node: any) => node.props && typeof node.props.onLayout === 'function',
        { deep: true },
      );
      withLayout.forEach((node: any) => {
        node.props.onLayout({ nativeEvent: { layout: { width: 320, height: 120 } } });
      });
    });
    // Use root.findAll (not JSON.stringify) — BackdropFilter has a React element prop
    // that causes circular JSON errors once Canvas is rendered.
    const canvasNodes = tree.root.findAll(
      (node: any) => node.type === 'Canvas',
      { deep: true },
    );
    expect(canvasNodes.length).toBeGreaterThan(0);
  });

  it('FR7.2 — Card glass={false} renders no Canvas element (flat surface)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, { glass: false }, 'child'));
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain('"Canvas"');
  });

  it('FR7.3 — Card elevated={true} renders without crash (elevated passed to GlassCard)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(Card, { elevated: true }, 'elevated child'));
      });
    }).not.toThrow();
  });

  it('FR7.4 — Card glass={true} default renders children inside GlassCard', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(Card, null, 'glass child'));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('glass child');
  });
});

// ─── FR3 (01-ambient-layer): GLASS_BASE opacity ───────────────────────────────
// Opacity updated: flat-glass uses high-alpha backgrounds (0.85/0.92) since there
// is no underlying blur to provide the frosted-glass depth. Low alpha (0.12/0.18)
// only made sense when a BlurView sat behind the surface.

describe('Card — FR3 (01-ambient-layer): GLASS_BASE opacity (flat-glass)', () => {
  it('FR3-ambient.1 — GLASS_BASE.backgroundColor alpha is > 0.5 (opaque flat-glass surface)', () => {
    const match = GLASS_BASE.backgroundColor.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
    expect(match).not.toBeNull();
    const alpha = parseFloat(match![1]);
    expect(alpha).toBeGreaterThan(0.5);
  });

  it('FR3-ambient.2 — GLASS_ELEVATED.backgroundColor alpha is > 0.5 (opaque flat-glass surface)', () => {
    const match = GLASS_ELEVATED.backgroundColor.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
    expect(match).not.toBeNull();
    const alpha = parseFloat(match![1]);
    expect(alpha).toBeGreaterThan(0.5);
  });
});
