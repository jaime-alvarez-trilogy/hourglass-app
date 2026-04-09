// Tests: MeshUrgencySignal (02-mesh-urgency-signal)
// FR2: Home screen (index.tsx) — mesh wiring with getApprovalMeshState
// FR3: Overview screen (overview.tsx) — mesh wiring with getApprovalMeshState
// FR4: AnimatedMeshBackground floor glow node — renders when pendingApprovals > 0
// FR5: resolveFloorGlowColor — internal color resolver (tested via source analysis)
//
// Test strategy:
// - FR2 + FR3: Source-file static analysis (fast, reliable, no navigation stack)
// - FR4: Render tests with controlled props (floor node presence/absence)
// - FR5: Source analysis for internal function (not exported)

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── File paths ──────────────────────────────────────────────────────────────

const INDEX_FILE    = path.resolve(__dirname, '../../../app/(tabs)/index.tsx');
const OVERVIEW_FILE = path.resolve(__dirname, '../../../app/(tabs)/overview.tsx');
const MESH_FILE     = path.resolve(__dirname, '../AnimatedMeshBackground.tsx');

// ─── Skia mock (consistent with AnimatedMeshBackground.test.tsx) ─────────────

jest.mock('@shopify/react-native-skia', () => {
  const mockReact = require('react');
  return {
    Canvas: ({ children, style }: any) =>
      mockReact.createElement('Canvas', { style }, children),
    Rect: (_props: any) => null,
    Circle: ({ children, 'data-testid': testId }: any) =>
      mockReact.createElement('SkiaCircle', { 'data-testid': testId }, children ?? null),
    Paint: (_props: any) => null,
    RadialGradient: (_props: any) => null,
    vec: (x: number, y: number) => ({ x, y }),
    BlendMode: { Screen: 'screen' },
    useDerivedValue: (fn: () => any) => ({ value: fn() }),
    matchFont: jest.fn(() => ({
      size: 10,
      measureText: jest.fn(() => ({ width: 50, height: 10 })),
    })),
    Skia: {
      Path: Object.assign(
        () => ({
          moveTo: jest.fn().mockReturnThis(),
          lineTo: jest.fn().mockReturnThis(),
          close: jest.fn().mockReturnThis(),
        }),
        {
          Make: () => ({
            moveTo: jest.fn().mockReturnThis(),
            lineTo: jest.fn().mockReturnThis(),
            close: jest.fn().mockReturnThis(),
          }),
        },
      ),
      XYWHRect: jest.fn((x: number, y: number, w: number, h: number) => ({ x, y, w, h })),
      Color: jest.fn((color: string) => color),
    },
  };
});

// ─── FR2: Home screen source checks ──────────────────────────────────────────

describe('FR2: Home screen (index.tsx) — mesh wiring', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
  });

  it('SC2.1 — imports getApprovalMeshState from @/src/lib/approvalMeshSignal', () => {
    expect(source).toMatch(/import.*getApprovalMeshState.*from.*approvalMeshSignal/);
  });

  it('SC2.2 — derives approvalMeshState from getApprovalMeshState(approvalItems.length)', () => {
    expect(source).toContain('getApprovalMeshState(approvalItems.length)');
  });

  it('SC2.3 — AnimatedMeshBackground receives pendingApprovals={approvalItems.length}', () => {
    // Must appear as a JSX prop, not just in comments or imports
    expect(source).toMatch(/pendingApprovals=\{approvalItems\.length\}/);
  });

  it('SC2.4 — earningsPace is conditionally suppressed when approvalMeshState is not null', () => {
    // Must use the null-conditional pattern: approvalMeshState === null ? ... : null
    expect(source).toMatch(/earningsPace=\{approvalMeshState\s*===\s*null\s*\?/);
  });

  it('SC2.5 — panelState={approvalMeshState} is passed to AnimatedMeshBackground', () => {
    // Must be the JSX prop assignment, not just variable mentions
    expect(source).toMatch(/panelState=\{approvalMeshState\}/);
  });

  it('SC2.6 — pendingApprovals={approvalItems.length} is always passed', () => {
    expect(source).toMatch(/pendingApprovals=\{approvalItems\.length\}/);
  });

  it('SC2.7 — useApprovalItems is called exactly once (spec 01 already added it, no duplicate)', () => {
    const matches = source.match(/useApprovalItems\s*\(/g);
    expect(matches).not.toBeNull();
    // Should appear exactly once in the component body
    expect(matches!.length).toBe(1);
  });
});

// ─── FR3: Overview screen source checks ──────────────────────────────────────

describe('FR3: Overview screen (overview.tsx) — mesh wiring', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
  });

  it('SC3.1 — imports getApprovalMeshState from @/src/lib/approvalMeshSignal', () => {
    expect(source).toMatch(/import.*getApprovalMeshState.*from.*approvalMeshSignal/);
  });

  it('SC3.2 — derives approvalMeshState from getApprovalMeshState(approvalItems.length)', () => {
    expect(source).toContain('getApprovalMeshState(approvalItems.length)');
  });

  it('SC3.3 — AnimatedMeshBackground receives pendingApprovals={approvalItems.length}', () => {
    expect(source).toMatch(/pendingApprovals=\{approvalItems\.length\}/);
  });

  it('SC3.4 — earningsPace conditionally propagated: approvalMeshState === null ? earningsPace : null', () => {
    expect(source).toMatch(/earningsPace=\{approvalMeshState\s*===\s*null\s*\?/);
  });

  it('SC3.5 — pendingApprovals={approvalItems.length} is always passed', () => {
    expect(source).toMatch(/pendingApprovals=\{approvalItems\.length\}/);
  });
});

// ─── FR4: AnimatedMeshBackground floor glow node (render tests) ──────────────

let AnimatedMeshBackground: any;

beforeAll(() => {
  AnimatedMeshBackground = require('../AnimatedMeshBackground').default;
});

describe('FR4: AnimatedMeshBackground — floor glow node render', () => {
  // Helper: count SkiaCircle nodes anywhere in the rendered tree (recursive)
  function countSkiaCircles(node: any): number {
    if (!node) return 0;
    if (typeof node !== 'object') return 0;
    let count = node.type === 'SkiaCircle' ? 1 : 0;
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        count += countSkiaCircles(child);
      }
    }
    return count;
  }

  it('SC4.1 — pendingApprovals > 0 renders 4 Circle nodes (A+B+C+floor glow)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedMeshBackground, { pendingApprovals: 3 }));
    });
    expect(countSkiaCircles(tree.toJSON())).toBe(4);
  });

  it('SC4.2 — pendingApprovals=0 renders 3 Circle nodes (no floor glow)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedMeshBackground, { pendingApprovals: 0 }));
    });
    expect(countSkiaCircles(tree.toJSON())).toBe(3);
  });

  it('SC4.3 — pendingApprovals=null renders 3 Circle nodes (no floor glow)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedMeshBackground, { pendingApprovals: null }));
    });
    expect(countSkiaCircles(tree.toJSON())).toBe(3);
  });

  it('SC4.4 — pendingApprovals undefined renders 3 Circle nodes (no floor glow)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedMeshBackground, {}));
    });
    expect(countSkiaCircles(tree.toJSON())).toBe(3);
  });

  it('SC4.5 — panelState + pendingApprovals > 0 renders 4 Circle nodes', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(AnimatedMeshBackground, {
          panelState: 'critical',
          pendingApprovals: 2,
        }),
      );
    });
    expect(countSkiaCircles(tree.toJSON())).toBe(4);
  });

  it('SC4.6 — floor node appears only when pendingApprovals > 0 (delta = 1 Circle)', () => {
    let withGlow: any;
    let withoutGlow: any;
    act(() => {
      withGlow = create(React.createElement(AnimatedMeshBackground, { pendingApprovals: 1 }));
    });
    act(() => {
      withoutGlow = create(React.createElement(AnimatedMeshBackground, { pendingApprovals: 0 }));
    });
    expect(countSkiaCircles(withGlow.toJSON()) - countSkiaCircles(withoutGlow.toJSON())).toBe(1);
  });
});

// ─── FR4: AnimatedMeshBackground source checks ───────────────────────────────

describe('FR4: AnimatedMeshBackground — source: floor glow constants and structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MESH_FILE, 'utf8');
  });

  it('SC4.1-prop — pendingApprovals?: number | null in AnimatedMeshBackgroundProps', () => {
    expect(source).toContain('pendingApprovals');
    // Should appear in the props interface
    const interfaceBlock = source.match(/interface AnimatedMeshBackgroundProps[\s\S]*?\}/)?.[0] ?? '';
    expect(interfaceBlock).toContain('pendingApprovals');
  });

  it('SC4.6 — FLOOR_NODE_X_RATIO = 0.875', () => {
    expect(source).toMatch(/FLOOR_NODE_X_RATIO\s*=\s*0\.875/);
  });

  it('SC4.7 — floor node y-position is h (cy = h, positioned at bottom)', () => {
    // Pattern: cy={h} or cy = h in the floor node context
    // Source should contain cy={h} or cy at bottom
    expect(source).toMatch(/cy\s*=\s*\{?\s*h\s*\}?/);
  });

  it('SC4.8 — FLOOR_PULSE_DURATION = 2000', () => {
    expect(source).toMatch(/FLOOR_PULSE_DURATION\s*=\s*2000/);
  });

  it('SC4.9 — FLOOR_GLOW_ALPHA = 0.30', () => {
    expect(source).toMatch(/FLOOR_GLOW_ALPHA\s*=\s*0\.3[0]?/);
  });

  it('SC4.10 — floor pulse uses withRepeat with true (autoReverse)', () => {
    // There should be a withRepeat call with -1 and true (for floor pulse)
    // The existing orbit uses withRepeat(..., -1, false)
    // The floor pulse uses withRepeat(..., -1, true)
    expect(source).toContain('true');
    // Find a line with withRepeat and true
    const withRepeatTrueLine = source.split('\n').find(line =>
      line.includes('withRepeat') && line.includes('true') && line.includes('-1'),
    );
    expect(withRepeatTrueLine).toBeDefined();
  });

  it('SC4.11 — existing nodes unaffected: NODE_A_INNER violet still present', () => {
    expect(source).toContain('rgba(167,139,250,0.22)');
  });

  it('SC4.11b — existing nodes unaffected: NODE_B_INNER cyan still present', () => {
    expect(source).toContain('rgba(0,194,255,0.22)');
  });

  it('SC4.11c — existing nodeRadius w * 1.2 still present', () => {
    expect(source).toMatch(/w\s*\*\s*1\.2/);
  });

  it('SC4-conditional — source contains conditional for pendingApprovals > 0 in JSX', () => {
    // The floor node should be gated: pendingApprovals != null && pendingApprovals > 0
    // or similar guard
    const hasConditional =
      source.includes('pendingApprovals != null') ||
      source.includes('pendingApprovals !== null') ||
      (source.includes('pendingApprovals') && source.includes('> 0'));
    expect(hasConditional).toBe(true);
  });
});

// ─── FR5: resolveFloorGlowColor source checks ────────────────────────────────

describe('FR5: resolveFloorGlowColor — source checks (internal helper)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MESH_FILE, 'utf8');
  });

  it('SC5.4 — resolveFloorGlowColor body references warnAmber for non-end-of-week', () => {
    // Extract the resolveFloorGlowColor function body and check it references warnAmber
    const fnStart = source.indexOf('function resolveFloorGlowColor');
    expect(fnStart).toBeGreaterThan(-1);
    // Function body is bounded by the closing brace — take a generous window
    const fnBody = source.substring(fnStart, fnStart + 500);
    expect(fnBody.includes('warnAmber')).toBe(true);
  });

  it('SC5.5-6 — resolveFloorGlowColor body references desatCoral for end-of-week', () => {
    const fnStart = source.indexOf('function resolveFloorGlowColor');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.substring(fnStart, fnStart + 500);
    expect(fnBody.includes('desatCoral')).toBe(true);
  });

  it('SC5.7 — resolveFloorGlowColor is NOT exported from AnimatedMeshBackground', () => {
    const mod = require('../AnimatedMeshBackground');
    expect(mod.resolveFloorGlowColor).toBeUndefined();
  });

  it('SC5-name — source contains function named resolveFloorGlowColor', () => {
    expect(source).toContain('resolveFloorGlowColor');
  });

  it('SC5-null-guard — source handles null/undefined pendingApprovals (returns null path)', () => {
    // The function body should have a guard returning null for falsy/zero pendingApprovals
    // Find the function body
    const fnIdx = source.indexOf('resolveFloorGlowColor');
    expect(fnIdx).toBeGreaterThan(-1);
    // After the function definition there should be a null return path
    const fnSection = source.substring(fnIdx, fnIdx + 300);
    const hasNullReturn =
      fnSection.includes('return null') ||
      fnSection.includes('null;') ||
      fnSection.includes('<= 0');
    expect(hasNullReturn).toBe(true);
  });
});
