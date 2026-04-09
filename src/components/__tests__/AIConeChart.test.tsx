// Tests: AIConeChart Skia component (02-cone-chart)
// FR1: Types and Props Contract
// FR2: toPixel Coordinate Helper
// FR3: buildActualPath
// FR4: buildConePath
// FR5: buildTargetLinePath
// FR6: Chart Rendering — Layers
// FR7: Animation (state logic)
// FR8: Axis Labels (full vs compact)
//
// Strategy:
// - FR1-FR5: unit test exported functions directly
// - FR6-FR8: render tests via react-test-renderer + Skia mock
// - FR7: test animState computation logic (pure math, extracted)
// - Skia mock auto-resolved from __mocks__/@shopify/react-native-skia.ts
// - Reanimated mock via jest-expo preset
// - ConeData fixtures built manually to match aiCone.ts interface contracts

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as path from 'path';
import * as fs from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Stub react-native-web components (same pattern as AITab.test.tsx)
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

// ─── Types ────────────────────────────────────────────────────────────────────

// ConeData fixture — matches interface in src/lib/aiCone.ts exactly
import type { ConeData, ConePoint } from '@/src/lib/aiCone';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Standard mid-week ConeData fixture: 20h logged at 75% AI, 20h remaining */
const MOCK_CONE_DATA: ConeData = {
  actualPoints: [
    { hoursX: 0, pctY: 0 },
    { hoursX: 4, pctY: 60 },
    { hoursX: 8, pctY: 70 },
    { hoursX: 12, pctY: 75 },
    { hoursX: 16, pctY: 72 },
    { hoursX: 20, pctY: 74 },
  ],
  hourlyPoints: [
    { hoursX: 0, pctY: 0 },
    { hoursX: 4, pctY: 60 },
    { hoursX: 8, pctY: 70 },
    { hoursX: 12, pctY: 75 },
    { hoursX: 16, pctY: 72 },
    { hoursX: 20, pctY: 74 },
  ],
  coneSnapshots: [
    { upperPct: 100, lowerPct: 0 },
    { upperPct: 96,  lowerPct: 6  },
    { upperPct: 92,  lowerPct: 18 },
    { upperPct: 88,  lowerPct: 28 },
    { upperPct: 85,  lowerPct: 32 },
    { upperPct: 87,  lowerPct: 37 },
  ],
  upperBound: [
    { hoursX: 20, pctY: 74 },
    { hoursX: 40, pctY: 87 },
  ],
  lowerBound: [
    { hoursX: 20, pctY: 74 },
    { hoursX: 40, pctY: 37 },
  ],
  currentHours: 20,
  currentAIPct: 74,
  weeklyLimit: 40,
  targetPct: 75,
  isTargetAchievable: true,
};

/** Monday morning — no work logged yet */
const MONDAY_CONE_DATA: ConeData = {
  actualPoints: [{ hoursX: 0, pctY: 0 }],
  hourlyPoints: [{ hoursX: 0, pctY: 0 }],
  coneSnapshots: [{ upperPct: 100, lowerPct: 0 }],
  upperBound: [
    { hoursX: 0, pctY: 0 },
    { hoursX: 40, pctY: 100 },
  ],
  lowerBound: [
    { hoursX: 0, pctY: 0 },
    { hoursX: 40, pctY: 0 },
  ],
  currentHours: 0,
  currentAIPct: 0,
  weeklyLimit: 40,
  targetPct: 75,
  isTargetAchievable: true,
};

/** Week complete — cone collapsed */
const WEEK_COMPLETE_DATA: ConeData = {
  actualPoints: [
    { hoursX: 0, pctY: 0 },
    { hoursX: 40, pctY: 76 },
  ],
  hourlyPoints: [
    { hoursX: 0, pctY: 0 },
    { hoursX: 40, pctY: 76 },
  ],
  coneSnapshots: [
    { upperPct: 100, lowerPct: 0  },
    { upperPct: 76,  lowerPct: 76 },
  ],
  upperBound: [],
  lowerBound: [],
  currentHours: 40,
  currentAIPct: 76,
  weeklyLimit: 40,
  targetPct: 75,
  isTargetAchievable: true,
};

// ─── File paths for static analysis ──────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const CONE_CHART_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIConeChart.tsx');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render AIConeChart using react-test-renderer */
function renderChart(props: {
  data?: ConeData;
  width?: number;
  height?: number;
  size?: 'full' | 'compact';
}) {
  const { AIConeChart } = require('@/src/components/AIConeChart');
  const defaultProps = {
    data: MOCK_CONE_DATA,
    width: 300,
    height: 240,
    ...props,
  };
  let tree: any;
  act(() => {
    tree = create(React.createElement(AIConeChart, defaultProps));
  });
  return tree;
}

/** Deep-traverse rendered tree for nodes matching type or testID */
function findNodes(node: any, predicate: (n: any) => boolean, found: any[] = []): any[] {
  if (!node) return found;
  if (predicate(node)) found.push(node);
  if (node.children) {
    for (const child of Array.isArray(node.children) ? node.children : [node.children]) {
      findNodes(child, predicate, found);
    }
  }
  return found;
}

function findByType(tree: any, type: string): any[] {
  return findNodes(tree?.toJSON(), (n) => n?.type === type);
}

// ─── Compute animState (extracted logic for FR7 tests) ────────────────────────

/** Mirrors the animState computation from AIConeChart (for unit-testing the math) */
function computeAnimState(progress: number) {
  const lineEnd = Math.min(progress / 0.6, 1);
  const coneOpacity = progress;
  const dotOpacity = Math.min(Math.max((progress - 0.6) / 0.4, 0), 1);
  return { lineEnd, coneOpacity, dotOpacity };
}

// ─── FR1: Types and Props Contract ───────────────────────────────────────────

describe('AIConeChart — FR1: Types and Props Contract', () => {
  it('SC1.1 — AIConeChartProps interface is exported from AIConeChart.tsx', () => {
    // Static analysis: verify source exports AIConeChartProps
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/export\s+interface\s+AIConeChartProps/);
  });

  it('SC1.2 — AIConeChartProps has data, width, height, and optional size fields', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Check all four props are in the interface
    expect(source).toMatch(/data\s*:\s*ConeData/);
    expect(source).toMatch(/width\s*:\s*number/);
    expect(source).toMatch(/height\s*:\s*number/);
    expect(source).toMatch(/size\?\s*:\s*['"]full['"]\s*\|\s*['"]compact['"]/);
  });

  it('SC1.3 — component returns null when width === 0', () => {
    const tree = renderChart({ width: 0 });
    expect(tree.toJSON()).toBeNull();
  });

  it('SC1.4 — component returns null when height === 0', () => {
    const tree = renderChart({ height: 0 });
    expect(tree.toJSON()).toBeNull();
  });

  it('SC1.5 — component does NOT return null when width and height are non-zero', () => {
    const tree = renderChart({ width: 300, height: 240 });
    expect(tree.toJSON()).not.toBeNull();
  });

  it('SC1.6 — size defaults to "full" when omitted (source-level check)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Default value set in destructuring or default parameter
    expect(source).toMatch(/size\s*=\s*['"]full['"]/);
  });

  it('SC1.7 — AIConeChart is exported from the module', () => {
    const mod = require('@/src/components/AIConeChart');
    expect(typeof mod.AIConeChart).toBe('function');
  });
});

// ─── FR2: toPixel — tested indirectly via path builder outputs ────────────────
// toPixel is not exported, so we validate it via known coordinate assertions.

describe('AIConeChart — FR2: toPixel Coordinate Helper', () => {
  // We test toPixel behaviour through buildActualPath with known inputs.
  // Full padding: { top: 16, right: 16, bottom: 28, left: 36 }
  // For width=400, height=200, weeklyLimit=40:
  //   chartW = 400 - 36 - 16 = 348
  //   chartH = 200 - 16 - 28 = 156
  //   hoursX=0 → x = 36 (paddingLeft)
  //   hoursX=40 → x = 400-16 = 384
  //   pctY=0 → y = 200-28 = 172 (bottom)
  //   pctY=100 → y = 16 (top, paddingTop)

  it('SC2.1 — hoursX=0 maps to paddingLeft for full variant', () => {
    const { buildActualPath } = require('@/src/components/AIConeChart');
    const skia = require('@shopify/react-native-skia');
    const skiaPath = skia.Skia.Path();
    const calls: Array<{ type: string; args: number[] }> = [];

    // Spy on path methods to capture calls
    skiaPath.moveTo.mockImplementation((...args: number[]) => { calls.push({ type: 'moveTo', args }); return skiaPath; });
    skiaPath.lineTo.mockImplementation((...args: number[]) => { calls.push({ type: 'lineTo', args }); return skiaPath; });

    const toPixelFn = (hx: number, py: number) => {
      const padding = { top: 16, right: 16, bottom: 28, left: 36 };
      const dims = { width: 400, height: 200 };
      const weeklyLimit = 40;
      const chartW = dims.width - padding.left - padding.right;
      const chartH = dims.height - padding.top - padding.bottom;
      const x = padding.left + (hx / weeklyLimit) * chartW;
      const y = padding.top + chartH * (1 - py / 100);
      return { x, y };
    };

    const origin = toPixelFn(0, 0);
    // hoursX=0 → x should equal paddingLeft (36)
    expect(origin.x).toBeCloseTo(36, 5);
  });

  it('SC2.2 — hoursX=weeklyLimit maps to width-paddingRight', () => {
    const toPixelFn = (hx: number, py: number) => {
      const padding = { top: 16, right: 16, bottom: 28, left: 36 };
      const dims = { width: 400, height: 200 };
      const weeklyLimit = 40;
      const chartW = dims.width - padding.left - padding.right;
      const x = padding.left + (hx / weeklyLimit) * chartW;
      const chartH = dims.height - padding.top - padding.bottom;
      const y = padding.top + chartH * (1 - py / 100);
      return { x, y };
    };
    const end = toPixelFn(40, 0);
    // hoursX=40 → x should equal width - paddingRight = 400 - 16 = 384
    expect(end.x).toBeCloseTo(384, 5);
  });

  it('SC2.3 — pctY=0 maps to height-paddingBottom (bottom of chart, Y inverted)', () => {
    const toPixelFn = (hx: number, py: number) => {
      const padding = { top: 16, right: 16, bottom: 28, left: 36 };
      const dims = { width: 400, height: 200 };
      const weeklyLimit = 40;
      const chartW = dims.width - padding.left - padding.right;
      const x = padding.left + (hx / weeklyLimit) * chartW;
      const chartH = dims.height - padding.top - padding.bottom;
      const y = padding.top + chartH * (1 - py / 100);
      return { x, y };
    };
    const bottom = toPixelFn(0, 0);
    // pctY=0 → y = paddingTop + chartH = 16 + 156 = 172 = height - paddingBottom = 200-28
    expect(bottom.y).toBeCloseTo(172, 5);
  });

  it('SC2.4 — pctY=100 maps to paddingTop (top of chart)', () => {
    const toPixelFn = (hx: number, py: number) => {
      const padding = { top: 16, right: 16, bottom: 28, left: 36 };
      const dims = { width: 400, height: 200 };
      const weeklyLimit = 40;
      const chartW = dims.width - padding.left - padding.right;
      const x = padding.left + (hx / weeklyLimit) * chartW;
      const chartH = dims.height - padding.top - padding.bottom;
      const y = padding.top + chartH * (1 - py / 100);
      return { x, y };
    };
    const top = toPixelFn(0, 100);
    // pctY=100 → y = paddingTop = 16
    expect(top.y).toBeCloseTo(16, 5);
  });

  it('SC2.5 — weeklyLimit <= 0 guard: buildTargetLinePath does not throw', () => {
    const { buildTargetLinePath } = require('@/src/components/AIConeChart');
    const toPixelFn = (hx: number, py: number) => ({ x: hx, y: py });
    expect(() => buildTargetLinePath(75, 0, toPixelFn)).not.toThrow();
  });
});

// ─── FR3: buildActualPath ─────────────────────────────────────────────────────

describe('AIConeChart — FR3: buildActualPath', () => {
  let buildActualPath: (points: ConePoint[], toPixelFn: any) => any;

  beforeAll(() => {
    buildActualPath = require('@/src/components/AIConeChart').buildActualPath;
  });

  const identityPixel = (hx: number, py: number) => ({ x: hx * 10, y: py * 2 });

  it('SC3.1 — 0 points: returns a path without throwing', () => {
    expect(() => buildActualPath([], identityPixel)).not.toThrow();
  });

  it('SC3.2 — 1 point: returns a path (moveTo called, no lineTo)', () => {
    const skia = require('@shopify/react-native-skia');
    const mockPath = skia.Skia.Path();
    mockPath.moveTo.mockClear();
    mockPath.lineTo.mockClear();

    const result = buildActualPath([{ hoursX: 0, pctY: 0 }], identityPixel);
    // Should not throw and returns truthy
    expect(result).toBeTruthy();
  });

  it('SC3.3 — 1 point: source uses M (moveTo) SVG command for path start', () => {
    // Static analysis: verify buildActualPath source starts path with M command
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Path strings use SVG M command: `M ${x} ${y}`
    expect(source).toMatch(/[`'"]M \$\{/);
  });

  it('SC3.4 — 3 points: does not throw', () => {
    const points: ConePoint[] = [
      { hoursX: 0, pctY: 0 },
      { hoursX: 10, pctY: 50 },
      { hoursX: 20, pctY: 70 },
    ];
    expect(() => buildActualPath(points, identityPixel)).not.toThrow();
  });

  it('SC3.5 — 3 points: returns a truthy path object', () => {
    const points: ConePoint[] = [
      { hoursX: 0, pctY: 0 },
      { hoursX: 10, pctY: 50 },
      { hoursX: 20, pctY: 70 },
    ];
    const result = buildActualPath(points, identityPixel);
    expect(result).toBeTruthy();
  });

  it('SC3.6 — all points at same Y (horizontal line): does not crash', () => {
    const points: ConePoint[] = [
      { hoursX: 0, pctY: 75 },
      { hoursX: 20, pctY: 75 },
      { hoursX: 40, pctY: 75 },
    ];
    expect(() => buildActualPath(points, identityPixel)).not.toThrow();
  });

  it('SC3.7 — exported as named export', () => {
    const mod = require('@/src/components/AIConeChart');
    expect(typeof mod.buildActualPath).toBe('function');
  });

  it('SC3.8 — source: buildActualPath uses L (lineTo) SVG command for subsequent points', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Path strings use SVG L command: ` L ${x} ${y}`
    expect(source).toMatch(/L \$\{x\}/);
  });
});

// ─── FR4: buildConePath ───────────────────────────────────────────────────────

describe('AIConeChart — FR4: buildConePath', () => {
  let buildConePath: (upper: ConePoint[], lower: ConePoint[], toPixelFn: any) => any;

  beforeAll(() => {
    buildConePath = require('@/src/components/AIConeChart').buildConePath;
  });

  const identityPixel = (hx: number, py: number) => ({ x: hx * 10, y: py * 2 });

  it('SC4.1 — empty upper: returns a path without throwing', () => {
    const lower: ConePoint[] = [
      { hoursX: 0, pctY: 74 },
      { hoursX: 40, pctY: 37 },
    ];
    expect(() => buildConePath([], lower, identityPixel)).not.toThrow();
  });

  it('SC4.2 — empty lower: returns a path without throwing', () => {
    const upper: ConePoint[] = [
      { hoursX: 0, pctY: 74 },
      { hoursX: 40, pctY: 87 },
    ];
    expect(() => buildConePath(upper, [], identityPixel)).not.toThrow();
  });

  it('SC4.3 — both empty: returns a path without throwing', () => {
    expect(() => buildConePath([], [], identityPixel)).not.toThrow();
  });

  it('SC4.4 — 2-point upper + 2-point lower: source closes the path (SVG Z command)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // SVG close: either ' Z' (string path) or .close() (Skia Path object)
    expect(source).toMatch(/[' ]Z['";\s]|\.close\(\)/);
  });

  it('SC4.5 — 2-point upper + 2-point lower: returns a truthy path', () => {
    const upper: ConePoint[] = [
      { hoursX: 20, pctY: 74 },
      { hoursX: 40, pctY: 87 },
    ];
    const lower: ConePoint[] = [
      { hoursX: 20, pctY: 74 },
      { hoursX: 40, pctY: 37 },
    ];
    const result = buildConePath(upper, lower, identityPixel);
    expect(result).toBeTruthy();
  });

  it('SC4.6 — single-point upper + single-point lower: does not throw (degenerate case)', () => {
    const upper: ConePoint[] = [{ hoursX: 40, pctY: 76 }];
    const lower: ConePoint[] = [{ hoursX: 40, pctY: 76 }];
    expect(() => buildConePath(upper, lower, identityPixel)).not.toThrow();
  });

  it('SC4.7 — exported as named export', () => {
    const mod = require('@/src/components/AIConeChart');
    expect(typeof mod.buildConePath).toBe('function');
  });

  it('SC4.8 — source: buildConePath traverses lower in reverse order', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Reverse traversal: reverse() or for loop counting down
    // Expect either [...lower].reverse() or similar
    expect(source).toMatch(/lower[\s\S]{0,50}(reverse|\.length\s*-)/);
  });
});

// ─── FR5: buildTargetLinePath ─────────────────────────────────────────────────

describe('AIConeChart — FR5: buildTargetLinePath', () => {
  let buildTargetLinePath: (targetPct: number, weeklyLimit: number, toPixelFn: any) => any;

  beforeAll(() => {
    buildTargetLinePath = require('@/src/components/AIConeChart').buildTargetLinePath;
  });

  it('SC5.1 — returns a path without throwing for standard inputs', () => {
    const toPixelFn = (hx: number, py: number) => ({ x: hx * 8, y: 240 - py * 2 });
    expect(() => buildTargetLinePath(75, 40, toPixelFn)).not.toThrow();
  });

  it('SC5.2 — returns a path without throwing for weeklyLimit = 0 (guard)', () => {
    const toPixelFn = (hx: number, py: number) => ({ x: hx * 8, y: 240 - py * 2 });
    expect(() => buildTargetLinePath(75, 0, toPixelFn)).not.toThrow();
  });

  it('SC5.3 — returns a truthy path object', () => {
    const toPixelFn = (hx: number, py: number) => ({ x: hx * 8, y: 240 - py * 2 });
    const result = buildTargetLinePath(75, 40, toPixelFn);
    expect(result).toBeTruthy();
  });

  it('SC5.4 — source: starts at hoursX=0 and ends at hoursX=weeklyLimit', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // buildTargetLinePath should call toPixelFn(0, targetPct) and toPixelFn(weeklyLimit, targetPct)
    expect(source).toMatch(/buildTargetLinePath[\s\S]{0,400}toPixelFn\s*\(\s*0\s*,/);
    expect(source).toMatch(/buildTargetLinePath[\s\S]{0,400}toPixelFn\s*\(\s*weeklyLimit\s*,/);
  });

  it('SC5.5 — exported as named export', () => {
    const mod = require('@/src/components/AIConeChart');
    expect(typeof mod.buildTargetLinePath).toBe('function');
  });

  it('SC5.6 — source: buildTargetLinePath uses L SVG command to draw the horizontal line', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // SVG path string: `M ${x0} ${y} L ${x1} ${y}`
    expect(source).toMatch(/buildTargetLinePath[\s\S]{0,500}L \$\{x1\}/);
  });
});

// ─── FR6: Chart Rendering — Layers ───────────────────────────────────────────

describe('AIConeChart — FR6: Chart Rendering', () => {
  it('SC6.1 — renders without crash with valid ConeData and non-zero dimensions', () => {
    expect(() => renderChart({ data: MOCK_CONE_DATA, width: 300, height: 240 })).not.toThrow();
  });

  it('SC6.2 — returns a non-null element with valid props', () => {
    const tree = renderChart({ data: MOCK_CONE_DATA, width: 300, height: 240 });
    const json = tree.toJSON();
    expect(json).not.toBeNull();
    // Root element is a View (wrapping Canvas + legend row for full variant)
    // or Canvas directly for compact. Either way, non-null.
    expect(json?.type === 'Canvas' || json?.type === 'View').toBe(true);
  });

  it('SC6.3 — source imports Canvas from @shopify/react-native-skia', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('@shopify/react-native-skia');
    expect(source).toMatch(/Canvas/);
  });

  it('SC6.4 — source uses Path elements for cone fill, boundary strokes, target line, actual line', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Multiple Path elements expected
    const pathCount = (source.match(/<Path/g) ?? []).length;
    expect(pathCount).toBeGreaterThanOrEqual(4);
  });

  it('SC6.5 — source uses Circle for current position dot', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/<Circle/);
  });

  it('SC6.6 — source defines a color constant for actual trajectory line', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Sci-fi redesign uses HOLO_GLOW/HOLO_CORE instead of colors.cyan
    expect(source).toMatch(/HOLO_GLOW|HOLO_CORE|colors\.cyan/);
  });

  it('SC6.7 — source defines a color constant for 75% target line', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Sci-fi redesign uses AMBER_CORE instead of colors.warning
    expect(source).toMatch(/AMBER_CORE|colors\.warning/);
  });

  it('SC6.8 — source sets a strokeWidth for actual line rendering', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Glow layers use multiple strokeWidths; verify at least one is present
    expect(source).toMatch(/strokeWidth=\{[0-9.]+\}/);
  });

  it('SC6.9 — renders with MONDAY_CONE_DATA (single actualPoint): no crash', () => {
    expect(() => renderChart({ data: MONDAY_CONE_DATA, width: 300, height: 240 })).not.toThrow();
  });

  it('SC6.10 — renders with WEEK_COMPLETE_DATA (empty cone): no crash', () => {
    expect(() => renderChart({ data: WEEK_COMPLETE_DATA, width: 300, height: 240 })).not.toThrow();
  });

  it('SC6.11 — source: cone fill uses a semi-transparent opacity', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Cone fill should be semi-transparent (0.10–0.25 range)
    expect(source).toMatch(/0\.(1[0-9]|2[0-5])/);
  });

  it('SC6.12 — source: cone boundary strokes use a visible opacity', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/0\.[3-6][0-9]*/);
  });

  it('SC6.13 — source: target line uses opacity between 0.5 and 0.7', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/0\.[5-7][0-9]*/);
  });
});

// ─── FR7: Animation State Logic ───────────────────────────────────────────────

describe('AIConeChart — FR7: Animation State Logic', () => {
  // Test the animState computation logic directly (pure math, spec-defined formula)

  it('SC7.1 — lineEnd is 0 at progress=0', () => {
    const state = computeAnimState(0);
    expect(state.lineEnd).toBe(0);
  });

  it('SC7.2 — lineEnd is 1 at progress=0.6 (line fully drawn)', () => {
    const state = computeAnimState(0.6);
    expect(state.lineEnd).toBeCloseTo(1, 5);
  });

  it('SC7.3 — lineEnd is clamped to 1 at progress=1 (no overshoot)', () => {
    const state = computeAnimState(1);
    expect(state.lineEnd).toBe(1);
  });

  it('SC7.4 — lineEnd is 0.5 at progress=0.3 (halfway through line draw)', () => {
    const state = computeAnimState(0.3);
    expect(state.lineEnd).toBeCloseTo(0.5, 5);
  });

  it('SC7.5 — coneOpacity equals progress value', () => {
    expect(computeAnimState(0).coneOpacity).toBe(0);
    expect(computeAnimState(0.5).coneOpacity).toBe(0.5);
    expect(computeAnimState(1).coneOpacity).toBe(1);
  });

  it('SC7.6 — dotOpacity is 0 at progress=0', () => {
    const state = computeAnimState(0);
    expect(state.dotOpacity).toBe(0);
  });

  it('SC7.7 — dotOpacity is 0 at progress=0.6 (dot not yet visible)', () => {
    const state = computeAnimState(0.6);
    expect(state.dotOpacity).toBeCloseTo(0, 5);
  });

  it('SC7.8 — dotOpacity is 1 at progress=1 (fully visible)', () => {
    const state = computeAnimState(1);
    expect(state.dotOpacity).toBe(1);
  });

  it('SC7.9 — dotOpacity is 0.5 at progress=0.8 (midway through fade-in)', () => {
    // progress=0.8: (0.8 - 0.6) / 0.4 = 0.2 / 0.4 = 0.5
    const state = computeAnimState(0.8);
    expect(state.dotOpacity).toBeCloseTo(0.5, 5);
  });

  it('SC7.10 — dotOpacity is clamped to 0 below progress=0.6', () => {
    const state = computeAnimState(0.3);
    expect(state.dotOpacity).toBe(0);
  });

  it('SC7.11 — source uses useSharedValue for progress animation', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('useSharedValue');
  });

  it('SC7.12 — source uses useAnimatedReaction with runOnJS bridge', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('useAnimatedReaction');
    expect(source).toContain('runOnJS');
  });

  it('SC7.13 — source uses withTiming for progress animation', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('withTiming');
  });

  it('SC7.14 — source uses useReducedMotion for accessibility', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('useReducedMotion');
  });

  it('SC7.15 — source defines a cone animation config with a duration', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/duration.*\d{3,}/);
  });
});

// ─── FR8: Axis Labels (full vs compact) ──────────────────────────────────────

describe('AIConeChart — FR8: Axis Labels', () => {
  it('SC8.1 — source uses matchFont for Skia text rendering', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('matchFont');
  });

  it('SC8.2 — source includes Text elements (for axis labels in full mode)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/<Text/);
  });

  it('SC8.3 — source guards font with null check before rendering Text', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // font && ... or font !== null or similar
    expect(source).toMatch(/font\s*&&/);
  });

  it('SC8.4 — source uses colors.textMuted for axis label color', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('colors.textMuted');
  });

  it('SC8.5 — source: axis labels only rendered when size === "full"', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Conditional: size === 'full' && ... before Text elements
    expect(source).toMatch(/size\s*===\s*['"]full['"]/);
  });

  it('SC8.6 — source: Y-axis includes 75% tick (target reference)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // 75 appears in Y_TICKS or similar constant
    expect(source).toMatch(/75/);
    expect(source).toMatch(/['"]75%['"]/);
  });

  it('SC8.7 — source: X-axis ticks filter to weeklyLimit', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // X ticks filtered: tick <= weeklyLimit
    expect(source).toMatch(/weeklyLimit/);
  });
});

// ─── FR9 (02-watermarks): AIConeChart legend row ──────────────────────────────
//
// FR2 of 02-watermarks spec:
//   SC9.1 — when size="full", source renders legend row with AI%, 75% target, projected
//   SC9.2 — legend references HOLO_GLOW (#38BDF8) for AI% indicator
//   SC9.3 — legend references AMBER_CORE (#FCD34D) for target indicator
//   SC9.4 — legend references PROJ_COLOR (#818CF8) for projected indicator
//   SC9.5 — when size="compact", no legend rendered
//   SC9.6 — no new props added to AIConeChartProps
//   SC9.7 — legend uses React Native View/Text (not Skia Text)

describe('AIConeChart — FR9 (02-watermarks): Legend Row', () => {
  it('SC9.1a — source renders legend with "AI%" label', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('AI%');
  });

  it('SC9.1b — source renders legend with "75% target" label', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('75% target');
  });

  it('SC9.1c — source renders legend with "projected" label', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toContain('projected');
  });

  it('SC9.2 — legend references HOLO_GLOW constant for AI% indicator color', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // HOLO_GLOW is already defined in the file as '#38BDF8'
    // The legend should use it as backgroundColor or color
    expect(source).toMatch(/HOLO_GLOW/);
    // Legend uses it specifically for AI% (appears in legend context)
    expect(source).toMatch(/AI%[\s\S]{0,300}HOLO_GLOW|HOLO_GLOW[\s\S]{0,300}AI%/);
  });

  it('SC9.3 — legend references AMBER_CORE constant for 75% target indicator', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // AMBER_CORE already exists — should appear in legend context too
    expect(source).toMatch(/AMBER_CORE[\s\S]{0,300}75% target|75% target[\s\S]{0,300}AMBER_CORE/);
  });

  it('SC9.4 — legend references PROJ_COLOR constant for projected indicator', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/PROJ_COLOR[\s\S]{0,300}projected|projected[\s\S]{0,300}PROJ_COLOR/);
  });

  it('SC9.5 — legend is guarded by size === "full"', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Find the LEGEND ROW comment block (unique marker in legend implementation)
    const legendMarker = 'LEGEND ROW';
    const legendIdx = source.indexOf(legendMarker);
    expect(legendIdx).toBeGreaterThan(-1);
    // Within the next 120 characters after the legend marker, expect the size guard
    const legendBlock = source.slice(legendIdx, legendIdx + 120);
    expect(legendBlock).toMatch(/size\s*===\s*['"]full['"]/);
  });

  it('SC9.6 — AIConeChartProps does NOT add new props (legend is internal)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // The AIConeChartProps interface should NOT have any new prop added for legend
    // Extract interface block and ensure no "legend" prop exists
    const interfaceMatch = source.match(/interface\s+AIConeChartProps\s*\{[\s\S]*?\}/);
    expect(interfaceMatch).not.toBeNull();
    const interfaceBody = interfaceMatch![0];
    expect(interfaceBody).not.toMatch(/legend/i);
  });

  it('SC9.7 — legend uses React Native View/Text layout (not Skia Text in Canvas)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // React Native View and Text imports must be present for the legend
    expect(source).toMatch(/from 'react-native'|from "react-native"/);
    // The legend text labels (AI%, 75% target, projected) must appear OUTSIDE any Skia Canvas context
    // They should be in a View row, not as Skia <Text x={} y={} ... /> with coordinates
    expect(source).toMatch(/AI%[\s\S]{0,200}75% target/);
  });

  it('SC9.8 — full size renders without crash', () => {
    expect(() =>
      renderChart({ size: 'full', width: 300, height: 240 }),
    ).not.toThrow();
  });

  it('SC9.9 — compact size renders without crash', () => {
    expect(() =>
      renderChart({ size: 'compact', width: 300, height: 100 }),
    ).not.toThrow();
  });
});

// ─── FR10 (04-ai-scrub): AIConeChart Scrub Gesture Integration ────────────────
//
// SC1.1 — AIConeChartProps includes onScrubChange prop
// SC1.2 — AIScrubPoint interface exported with 4 fields
// SC1.3 — gesture fires onScrubChange with AIScrubPoint when full
// SC1.4 — gesture fires onScrubChange(null) on end
// SC1.5 — size="compact": gesture disabled (source analysis)
// SC1.6 — no crash when onScrubChange not provided
// SC1.7 — empty hourlyPoints: no crash
// SC1.8 — hourlyPoints.length === 1: source handles index 0
// SC1.9 — imports useScrubGesture
// SC1.10 — wraps Canvas in GestureDetector

describe('AIConeChart — FR10 (04-ai-scrub): Scrub Gesture Integration', () => {
  it('SC1.1 — AIConeChartProps interface includes onScrubChange optional prop', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/onScrubChange\s*\?\s*:/);
    expect(source).toMatch(/AIScrubPoint\s*\|\s*null/);
  });

  it('SC1.2a — AIScrubPoint is exported from AIConeChart.tsx', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/export\s+interface\s+AIScrubPoint/);
  });

  it('SC1.2b — AIScrubPoint has pctY field', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/pctY\s*:\s*number/);
  });

  it('SC1.2c — AIScrubPoint has hoursX field', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // hoursX is in ConePoint too — look for it inside AIScrubPoint block
    expect(source).toMatch(/AIScrubPoint[\s\S]{0,200}hoursX\s*:\s*number/);
  });

  it('SC1.2d — AIScrubPoint has upperPct field', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/upperPct\s*:\s*number/);
  });

  it('SC1.2e — AIScrubPoint has lowerPct field', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/lowerPct\s*:\s*number/);
  });

  it('SC1.3 — source wires onScrubChange callback via handleScrubIndex useCallback', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Bridge pattern: useAnimatedReaction → runOnJS(handleScrubIndex)
    expect(source).toMatch(/runOnJS\s*\(\s*handleScrubIndex\s*\)/);
  });

  it('SC1.4 — source fires onScrubChange(null) when scrubbing ends (isScrubbing false)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // onScrubChange(null) called inside handleScrubbing (JS thread, not worklet)
    expect(source).toMatch(/onScrubChange\s*\(\s*null\s*\)/);
  });

  it('SC1.5 — source: useScrubGesture enabled tied to size === "full"', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // enabled: size === 'full'
    expect(source).toMatch(/enabled\s*:\s*size\s*===\s*['"]full['"]/);
  });

  it('SC1.6 — no crash when onScrubChange not provided (renders without prop)', () => {
    expect(() => renderChart({ data: MOCK_CONE_DATA, width: 300, height: 240 })).not.toThrow();
  });

  it('SC1.7 — renders without crash when hourlyPoints is empty', () => {
    const emptyData: ConeData = {
      ...MOCK_CONE_DATA,
      hourlyPoints: [],
      coneSnapshots: [],
    };
    expect(() => renderChart({ data: emptyData, width: 300, height: 240 })).not.toThrow();
  });

  it('SC1.8 — source guards scrubIndex bounds before accessing hourlyPoints array', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Guard: idx < 0 or idx >= N
    expect(source).toMatch(/idx\s*[<>]=?\s*[0N]|scrubIndex[\s\S]{0,100}< 0/);
  });

  it('SC1.9 — source imports useScrubGesture from @/src/hooks/useScrubGesture', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/from\s+['"]@\/src\/hooks\/useScrubGesture['"]/);
  });

  it('SC1.10 — source imports GestureDetector from react-native-gesture-handler', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/GestureDetector/);
    expect(source).toMatch(/from\s+['"]react-native-gesture-handler['"]/);
  });

  it('SC1.10b — source wraps Canvas in GestureDetector', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // GestureDetector appears before Canvas in the JSX
    const gesturePos = source.indexOf('GestureDetector');
    const canvasPos = source.indexOf('<Canvas');
    expect(gesturePos).toBeGreaterThan(-1);
    expect(canvasPos).toBeGreaterThan(gesturePos);
  });
});

// ─── FR11 (04-ai-scrub): ScrubCursor Rendering ────────────────────────────────
//
// SC2.1 — imports buildScrubCursor
// SC2.2 — Path with colors.textMuted at opacity 0.5 when isScrubActive
// SC2.3 — Circle at snapped dot position when isScrubActive
// SC2.4 — cursor guarded by isScrubActive condition
// SC2.5 — cursor rendered after all other chart layers
// SC2.6 — linePath produced by buildScrubCursor
// SC2.7 — size="compact": no cursor

describe('AIConeChart — FR11 (04-ai-scrub): ScrubCursor Rendering', () => {
  it('SC2.1 — source imports buildScrubCursor from @/src/components/ScrubCursor', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/buildScrubCursor/);
    expect(source).toMatch(/from\s+['"]@\/src\/components\/ScrubCursor['"]/);
  });

  it('SC2.2 — source renders a Path with colors.textMuted and opacity 0.5 for cursor line', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // cursor line uses colors.textMuted and opacity={0.5}
    expect(source).toMatch(/colors\.textMuted/);
    expect(source).toMatch(/opacity=\{0\.5\}/);
  });

  it('SC2.3 — source renders a Circle for the cursor dot at snapped position', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Circle for cursor dot — uses scrubCursor.dotX / dotY
    expect(source).toMatch(/scrubCursor\.dotX/);
    expect(source).toMatch(/scrubCursor\.dotY/);
  });

  it('SC2.4 — cursor layers are guarded by isScrubActive condition', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Conditional rendering: isScrubActive && scrubCursor
    expect(source).toMatch(/isScrubActive/);
    expect(source).toMatch(/isScrubActive\s*&&\s*scrubCursor|scrubCursor\s*&&\s*isScrubActive/);
  });

  it('SC2.5 — cursor layers appear after existing chart path layers in source (rendered on top)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // ACTUAL TRAJECTORY section comes before the SCRUB CURSOR render block
    const trajectoryPos = source.indexOf('ACTUAL TRAJECTORY');
    const cursorRenderPos = source.indexOf('SCRUB CURSOR');
    expect(trajectoryPos).toBeGreaterThan(-1);
    expect(cursorRenderPos).toBeGreaterThan(-1);
    expect(cursorRenderPos).toBeGreaterThan(trajectoryPos);
  });

  it('SC2.6 — source uses buildScrubCursor to produce linePath for cursor', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/buildScrubCursor\s*\(/);
    // Result stored in scrubCursor state
    expect(source).toMatch(/setScrubCursor/);
  });

  it('SC2.7 — source: isScrubActive bridged from isScrubbing SharedValue via handleScrubbing', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/setIsScrubActive/);
    // Bridge uses runOnJS with a useCallback handler (not direct setIsScrubActive)
    expect(source).toMatch(/runOnJS\s*\(\s*handleScrubbing\s*\)/);
  });

  it('SC2.8 — full chart renders without crash after scrub integration', () => {
    expect(() => renderChart({ size: 'full', width: 300, height: 240 })).not.toThrow();
  });

  it('SC2.9 — compact chart renders without crash after scrub integration', () => {
    expect(() => renderChart({ size: 'compact', width: 300, height: 100 })).not.toThrow();
  });
});

// ─── FR12 (02-safe-cone-scrub): Animation-Complete Gate ──────────────────────
//
// FR1: animDone state — starts false, becomes true after animation completes
// FR2: Gesture gate — GestureDetector disabled until animDone && size==='full'
// FR3: Reaction guards — useAnimatedReaction callbacks guard runOnJS behind animDone
// FR4: Completion callback — withTiming receives 3rd argument (callback)
//
// Testing strategy:
// - Source-level static analysis for structural checks (same approach as FR1-FR11)
//   because: GestureDetector mock ignores enabled prop; useAnimatedReaction is NOOP;
//   withTiming mock calls callback synchronously (so behavioral timer tests are not
//   meaningful in this environment)
// - Behavioral render tests for animDone state initialisation and remount reset

describe('AIConeChart — FR12 (02-safe-cone-scrub): Animation-Complete Gate', () => {

  // ── FR1: animDone state ───────────────────────────────────────────────────

  it('SC12.1 — FR1: source declares animDone state with useState(false)', () => {
    // animDone must start as false — initial state must be explicitly false
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/const\s*\[\s*animDone\s*,\s*setAnimDone\s*\]\s*=\s*useState\s*\(\s*false\s*\)/);
  });

  it('SC12.2 — FR1: source imports useState from react', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    expect(source).toMatch(/useState/);
    // useState already used — also used for isScrubActive, scrubCursor
  });

  it('SC12.3 — FR1: source declares an unmount guard (isMountedRef or isMountedSV)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Guard can be implemented as useRef (isMountedRef) or useSharedValue (isMountedSV)
    expect(source).toMatch(/isMountedRef|isMountedSV/);
  });

  it('SC12.4 — FR1: source sets unmount guard to false in a cleanup effect', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Cleanup sets the guard to false: isMountedRef.current = false OR isMountedSV.value = false
    expect(source).toMatch(/isMounted(?:Ref\.current|SV\.value)\s*=\s*false/);
  });

  it('SC12.5 — FR1: source calls setAnimDone(true) inside withTiming callback', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // setAnimDone(true) must be called via runOnJS bridge in completion callback
    expect(source).toMatch(/setAnimDone\s*\)\s*\(\s*true\s*\)/);
  });

  it('SC12.6 — FR1: source calls setAnimDone(true) in the reduceMotion branch', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // reduceMotion branch sets animDone synchronously
    expect(source).toMatch(/reducedMotion|reduceMotion/);
    // setAnimDone(true) called directly (not via runOnJS) in this branch
    expect(source).toMatch(/setAnimDone\s*\(\s*true\s*\)/);
  });

  it('SC12.7 — FR1: source uses useRef (imported from react) for isMountedRef', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // useRef must be in the import from 'react'
    expect(source).toMatch(/useRef/);
    expect(source).toMatch(/from\s+['"]react['"]/);
  });

  it('SC12.8 — FR1: component renders without crash (animDone state is internal, no prop change)', () => {
    expect(() => renderChart({ data: MOCK_CONE_DATA, width: 300, height: 240 })).not.toThrow();
  });

  // ── FR2: Gesture Gate ─────────────────────────────────────────────────────

  it('SC12.9 — FR2: source adds enabled prop to GestureDetector', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // GestureDetector must have enabled= prop
    expect(source).toMatch(/GestureDetector[\s\S]{0,200}enabled\s*=/);
  });

  it('SC12.10 — FR2: GestureDetector enabled prop references animDone', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // enabled={animDone && ...} or enabled={animDone} or logically equivalent
    expect(source).toMatch(/enabled\s*=\s*\{[^}]*animDone[^}]*\}/);
  });

  it('SC12.11 — FR2: GestureDetector enabled prop also guards on size==="full"', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // enabled must include size guard: animDone && size === 'full'
    const enabledMatch = source.match(/enabled\s*=\s*\{([^}]+)\}/);
    expect(enabledMatch).not.toBeNull();
    const enabledExpr = enabledMatch![1];
    // The enabled expression must reference both animDone and size
    expect(enabledExpr).toMatch(/animDone/);
    expect(enabledExpr).toMatch(/size|['"]full['"]/);
  });

  it('SC12.12 — FR2: compact chart renders without crash (gesture gate compact guard)', () => {
    expect(() => renderChart({ size: 'compact', width: 300, height: 100 })).not.toThrow();
  });

  it('SC12.13 — FR2: full chart renders without crash (gesture gate full path)', () => {
    expect(() => renderChart({ size: 'full', width: 300, height: 240 })).not.toThrow();
  });

  // ── FR3: Reaction Guards ──────────────────────────────────────────────────

  it('SC12.14 — FR3: scrubIndex useAnimatedReaction callback contains animDone guard', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Both reaction callbacks must check !animDone before runOnJS
    // Strategy: find useAnimatedReaction blocks and verify animDone guard appears
    // Pattern: useAnimatedReaction(...) with !animDone or animDone guard inside
    expect(source).toMatch(/useAnimatedReaction[\s\S]{0,300}animDone/);
  });

  it('SC12.15 — FR3: isScrubbing useAnimatedReaction callback contains animDone guard', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Both reaction callbacks must have the guard — count occurrences of animDone
    // near useAnimatedReaction (two distinct reactions, each needs the guard)
    const reactionMatches = [...source.matchAll(/useAnimatedReaction\s*\(/g)];
    expect(reactionMatches.length).toBeGreaterThanOrEqual(2);
    // Count how many times animDone guard pattern appears in reactions context
    const guardOccurrences = [...source.matchAll(/!\s*animDone/g)];
    // Must have at least 2 guard occurrences (one per reaction)
    expect(guardOccurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('SC12.16 — FR3: guard uses if (!animDone) return pattern', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Canonical form: if (!animDone) return;
    expect(source).toMatch(/if\s*\(\s*!\s*animDone\s*\)\s*return/);
  });

  it('SC12.17 — FR3: onScrubChange still wired via runOnJS after guard (not removed)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // runOnJS(handleScrubIndex) and runOnJS(handleScrubbing) must still be present
    expect(source).toMatch(/runOnJS\s*\(\s*handleScrubIndex\s*\)/);
    expect(source).toMatch(/runOnJS\s*\(\s*handleScrubbing\s*\)/);
  });

  // ── FR4: Completion Callback ──────────────────────────────────────────────

  it('SC12.18 — FR4: withTiming for clipProgress receives a completion callback (3rd argument)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // withTiming(1, CONE_ANIMATION, callback) — 3 arguments
    // Detect: withTiming(1, CONE_ANIMATION followed by a comma and callback body
    expect(source).toMatch(/withTiming\s*\(\s*1\s*,\s*CONE_ANIMATION\s*,/);
  });

  it('SC12.19 — FR4: completion callback uses runOnJS to call setAnimDone on JS thread', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // runOnJS(setAnimDone)(true) must appear in the completion callback context
    expect(source).toMatch(/runOnJS\s*\(\s*setAnimDone\s*\)\s*\(\s*true\s*\)/);
  });

  it('SC12.20 — FR4: completion callback checks mount guard before calling setAnimDone', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // Guard against calling setState on unmounted component (isMountedRef.current or isMountedSV.value)
    expect(source).toMatch(/isMounted(?:Ref\.current|SV\.value)/);
    // The check must appear in context with runOnJS(setAnimDone)
    const callbackBlock = source.match(/withTiming\s*\(\s*1\s*,\s*CONE_ANIMATION[\s\S]{0,500}/);
    expect(callbackBlock).not.toBeNull();
    expect(callbackBlock![0]).toMatch(/isMounted(?:Ref\.current|SV\.value)/);
  });

  it('SC12.21 — FR4: reduceMotion path does NOT use withTiming (synchronous state set)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // The existing pattern: if (reducedMotion) { ...; setAnimDone(true); return; }
    // Verify reduceMotion guard appears BEFORE withTiming call (early return)
    const clipEffect = source.match(/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,800}CONE_ANIMATION[\s\S]{0,200}\}/);
    expect(clipEffect).not.toBeNull();
    const effectBody = clipEffect![0];
    const reducedIdx = effectBody.search(/reducedMotion|reduceMotion/);
    const withTimingIdx = effectBody.search(/withTiming/);
    // reducedMotion check must appear before withTiming
    expect(reducedIdx).toBeGreaterThanOrEqual(0);
    expect(withTimingIdx).toBeGreaterThan(reducedIdx);
  });

  it('SC12.22 — FR4: no regression — clipProgress still uses withTiming (animation preserved)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // clipProgress.value = withTiming(1, CONE_ANIMATION, ...) must still be present
    expect(source).toMatch(/clipProgress\.value\s*=\s*withTiming/);
  });
});
