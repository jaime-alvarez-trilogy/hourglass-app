// Tests: OverviewStickyBar component — 01-sticky-bar
//
// FR1: Component file exists and exports OverviewStickyBar with correct props
// FR2: Static visual structure (Animated.View, snapLabel, 4 metric columns, colors)
// FR3: Pointer events control (isActive → pointerEvents)
// FR4: Value formatting (earnings, hours, AI%, BrainLift)
// FR5: overview.tsx integration (import, usage, panelStyle constraint)
//
// Strategy: Source-file static analysis throughout.
// Reanimated animated styles cannot be exercised in jest-expo/node preset.
// Static analysis matches the established pattern in this codebase
// (see InsightChip.test.tsx, ApprovalUrgencyCard.test.tsx, useStaggeredEntry.test.ts).
//
// Tests will FAIL (red phase) until src/components/OverviewStickyBar.tsx is created
// and overview.tsx is updated to use it.

import * as fs from 'fs';
import * as path from 'path';

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const COMPONENT_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'OverviewStickyBar.tsx');
const OVERVIEW_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'overview.tsx');

// ─── FR1: Component file exists and exports ───────────────────────────────────

describe('FR1: OverviewStickyBar — file and exports', () => {
  // SC1.1
  it('SC1.1: file exists at src/components/OverviewStickyBar.tsx', () => {
    expect(fs.existsSync(COMPONENT_FILE)).toBe(true);
  });

  // SC1.2
  it('SC1.2: exports OverviewStickyBar as named export', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/export\s+function\s+OverviewStickyBar/);
  });

  // SC1.3 — all 8 props present in props interface
  it('SC1.3: props interface includes animatedStyle', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/animatedStyle\s*:/);
  });

  it('SC1.3: props interface includes isActive', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/isActive\s*:/);
  });

  it('SC1.3: props interface includes snapLabel', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/snapLabel\s*:/);
  });

  it('SC1.3: props interface includes heroEarnings', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/heroEarnings\s*:/);
  });

  it('SC1.3: props interface includes heroHours', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/heroHours\s*:/);
  });

  it('SC1.3: props interface includes heroAiPct', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/heroAiPct\s*:/);
  });

  it('SC1.3: props interface includes heroBrainlift', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/heroBrainlift\s*:/);
  });

  it('SC1.3: props interface includes weeklyLimit', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/weeklyLimit\s*:/);
  });
});

// ─── FR2: Static visual structure ────────────────────────────────────────────

describe('FR2: OverviewStickyBar — static visual structure', () => {
  // SC2.1
  it('SC2.1: root element is Animated.View receiving animatedStyle', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // Animated.View should appear before other JSX elements in the return
    expect(src).toMatch(/Animated\.View/);
    // animatedStyle is referenced in the component body
    expect(src).toMatch(/animatedStyle/);
  });

  // SC2.2
  it('SC2.2: renders snapLabel text', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/\{snapLabel\}/);
  });

  // SC2.3 — four metric columns with value + label
  it('SC2.3: renders Earnings metric column with label', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('Earnings');
  });

  it('SC2.3: renders Hours metric column with label', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('Hours');
  });

  it('SC2.3: renders AI% metric column with label', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/AI%/);
  });

  it('SC2.3: renders BrainLift metric column with label', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('BrainLift');
  });

  // SC2.4
  it('SC2.4: earnings value text uses colors.gold', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.gold/);
  });

  // SC2.5
  it('SC2.5: AI% value text uses colors.cyan', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.cyan/);
  });

  // SC2.6
  it('SC2.6: BrainLift value text uses colors.violet', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.violet/);
  });

  // SC2.7 — hours color via computeSnapshotHoursColor logic
  it('SC2.7: hours color uses computeSnapshotHoursColor or equivalent threshold logic', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // Either calls a named function or contains the threshold logic inline
    const hasNamedFn = /computeSnapshotHoursColor/.test(src);
    const hasThresholdLogic = /0\.85/.test(src) && /0\.60/.test(src);
    expect(hasNamedFn || hasThresholdLogic).toBe(true);
  });

  // SC2.8
  it('SC2.8: root Animated.View uses colors.surfaceElevated background', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.surfaceElevated/);
  });
});

// ─── FR3: Pointer events control ─────────────────────────────────────────────

describe('FR3: OverviewStickyBar — pointer events', () => {
  // SC3.1
  it('SC3.1: pointerEvents is driven by isActive prop', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // isActive controls pointerEvents — either conditional expression or ternary
    expect(src).toMatch(/isActive/);
    expect(src).toMatch(/pointerEvents/);
  });

  it('SC3.1: pointerEvents uses "auto" for active state', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/'auto'/);
  });

  it('SC3.1: pointerEvents uses "none" for inactive state', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/'none'/);
  });

  it('SC3.1: isActive ternary drives pointerEvents value', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // isActive ? 'auto' : 'none' or isActive ? "auto" : "none"
    expect(src).toMatch(/isActive\s*\?\s*['"]auto['"]\s*:\s*['"]none['"]/);
  });
});

// ─── FR4: Value formatting ────────────────────────────────────────────────────

describe('FR4: OverviewStickyBar — value formatting', () => {
  // SC4.1
  it('SC4.1: earnings formatted with Math.round and toLocaleString', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/Math\.round\s*\(\s*heroEarnings\s*\)/);
    expect(src).toMatch(/\.toLocaleString\s*\(\s*\)/);
  });

  // SC4.2
  it('SC4.2: hours formatted with toFixed(1) and h suffix', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/heroHours\.toFixed\s*\(\s*1\s*\)/);
    // String contains 'h' suffix after hours value
    expect(src).toMatch(/heroHours\.toFixed\(\s*1\s*\)[`'"]\s*h|h[`'"]/);
  });

  // SC4.3
  it('SC4.3: AI% formatted with Math.round and % suffix', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/Math\.round\s*\(\s*heroAiPct\s*\)/);
    expect(src).toMatch(/%/);
  });

  // SC4.4
  it('SC4.4: BrainLift formatted with toFixed(1) and h suffix', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/heroBrainlift\.toFixed\s*\(\s*1\s*\)/);
  });
});

// ─── FR5: overview.tsx integration ───────────────────────────────────────────

describe('FR5: overview.tsx — OverviewStickyBar integration', () => {
  // SC5.1
  it('SC5.1: overview.tsx imports OverviewStickyBar from @/src/components/OverviewStickyBar', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/import.*OverviewStickyBar.*from.*['"]@\/src\/components\/OverviewStickyBar['"]/);
  });

  // SC5.2
  it('SC5.2: overview.tsx uses <OverviewStickyBar', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/<OverviewStickyBar/);
  });

  // SC5.3 — critical: existing useStaggeredEntry.test.ts constraint
  it('SC5.3: overview.tsx still contains panelStyle (useAnimatedStyle definition)', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/panelStyle/);
  });

  // SC5.4
  it('SC5.4: overview.tsx still declares panelOpacity shared value', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/panelOpacity/);
  });

  it('SC5.4: overview.tsx still declares panelTranslateY shared value', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/panelTranslateY/);
  });

  it('SC5.4: overview.tsx still declares panelHeight shared value', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/panelHeight/);
  });

  it('SC5.4: overview.tsx still declares panelMarginBottom shared value', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/panelMarginBottom/);
  });

  // SC5.5 — explicitly mirrors the existing useStaggeredEntry.test.ts assertion
  it('SC5.5: overview.tsx panelStyle check mirrors existing useStaggeredEntry.test.ts assertion', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // This assertion is identical to the one in useStaggeredEntry.test.ts line ~432
    expect(source).toMatch(/panelStyle/);
  });
});
