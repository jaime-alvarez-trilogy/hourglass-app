// Tests: HourlyPatternCard — 03-hourly-pattern-card FR1–FR4
//
// FR1 — Color interpolation helpers (_lerpColor + _barColor)
//   SC1.1 — _barColor(0) returns colors.surface
//   SC1.2 — _barColor(0.5) returns colors.cyan
//   SC1.3 — _barColor(1.0) returns colors.violet
//   SC1.4 — _barColor(NaN) returns colors.surface
//   SC1.5 — _barColor(0.25) returns a color between surface and cyan
//   SC1.6 — _lerpColor is pure — same inputs same output
//
// FR2 — Bar rendering (histogram within active window)
//   SC2.1 — file exports HourlyPatternCard (named or default)
//   SC2.2 — source clips to activeWindow — renders barCount = hi - lo + 1 bars
//   SC2.3 — source uses BAR_W_RATIO (0.65) for bar width calculation
//   SC2.4 — source clamps bar height to minimum MIN_BAR_H (2px)
//   SC2.5 — source normalizes bar heights to peakSlots within active window
//   SC2.6 — source applies barColor to each bar's backgroundColor
//   SC2.7 — width=0 guard present (returns null when width === 0)
//
// FR3 — Focus window and AI zone overlays
//   SC3.1 — source renders focus overlay when focusWindow !== null
//   SC3.2 — focus overlay uses colors.gold with 15% opacity
//   SC3.3 — source renders AI overlay when aiHotZone !== null and non-overlapping
//   SC3.4 — source suppresses AI overlay when ranges overlap (overlap detection)
//   SC3.5 — source has pointerEvents="none" on overlay Views
//
// FR4 — Text summary rows
//   SC4.1 — "FOCUS PEAK" label always present in source
//   SC4.2 — "AI PEAK" label always present in source
//   SC4.3 — source uses formatHour from hourlyInsights for range formatting
//   SC4.4 — source handles focusWindow=null → shows "—"
//   SC4.5 — source handles aiHotZone=null → shows "—"
//   SC4.6 — summary rows use colors.textMuted for labels
//
// Smoke tests — render without crash under various prop combinations
//
// Strategy: source-level static analysis (fs.readFileSync) for interface and
// logic details. Smoke tests use react-test-renderer for crash validation.
// HourlyPatternCard is a pure View-based component — no Skia dependency,
// no native module mocks beyond AsyncStorage.

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as path from 'path';
import * as fs from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return { ...mock, useReducedMotion: () => false };
});

// Card delegates to GlassCard (Skia) — mock to avoid canvas dependency
jest.mock('@shopify/react-native-skia');
jest.mock('@/src/components/GlassCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(View, { testID }, children),
  };
});

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const COMPONENT_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'HourlyPatternCard.tsx');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeProfile(overrides?: Partial<{
  avgSlots: number[];
  avgIntensity: number[];
  avgAIRate: number[];
  avgProductiveRate: number[];
  activeWindow: [number, number];
}>): import('@/src/lib/hourlyInsights').HourlyProfile {
  const avgSlots = new Array(24).fill(0);
  const avgIntensity = new Array(24).fill(NaN);
  const avgAIRate = new Array(24).fill(NaN);
  const avgProductiveRate = new Array(24).fill(NaN);

  // Default: 4 active hours h8–h11
  avgSlots[8] = 3; avgIntensity[8] = 70; avgAIRate[8] = 0.6; avgProductiveRate[8] = 0.8;
  avgSlots[9] = 5; avgIntensity[9] = 85; avgAIRate[9] = 0.8; avgProductiveRate[9] = 0.9;
  avgSlots[10] = 4; avgIntensity[10] = 75; avgAIRate[10] = 0.9; avgProductiveRate[10] = 0.85;
  avgSlots[11] = 2; avgIntensity[11] = 60; avgAIRate[11] = 0.5; avgProductiveRate[11] = 0.7;

  return {
    avgSlots: overrides?.avgSlots ?? avgSlots,
    avgIntensity: overrides?.avgIntensity ?? avgIntensity,
    avgAIRate: overrides?.avgAIRate ?? avgAIRate,
    avgProductiveRate: overrides?.avgProductiveRate ?? avgProductiveRate,
    weeksCovered: 4,
    activeWindow: overrides?.activeWindow ?? [8, 11],
  };
}

const FOCUS_WINDOW: import('@/src/lib/hourlyInsights').FocusWindow = {
  peakRange: [8, 10],
  peakIntensity: 77,
  weeksCovered: 4,
};

const AI_HOT_ZONE: import('@/src/lib/hourlyInsights').AIHotZone = {
  hotRange: [9, 10],
  aiRate: 0.85,
  weeksCovered: 4,
};

// Non-overlapping AI hot zone (h12–h13, outside focus [8–10])
const AI_HOT_ZONE_NON_OVERLAPPING: import('@/src/lib/hourlyInsights').AIHotZone = {
  hotRange: [11, 11],
  aiRate: 0.7,
  weeksCovered: 4,
};

// ─── Helper ───────────────────────────────────────────────────────────────────

type CardProps = {
  profile: import('@/src/lib/hourlyInsights').HourlyProfile;
  focusWindow: import('@/src/lib/hourlyInsights').FocusWindow | null;
  aiHotZone: import('@/src/lib/hourlyInsights').AIHotZone | null;
  width: number;
  height?: number;
};

function renderCard(props: Partial<CardProps> & { profile?: CardProps['profile'] }) {
  const mod = require('@/src/components/HourlyPatternCard');
  const HourlyPatternCard = mod.HourlyPatternCard ?? mod.default;
  const defaultProps: CardProps = {
    profile: makeProfile(),
    focusWindow: FOCUS_WINDOW,
    aiHotZone: AI_HOT_ZONE,
    width: 320,
    height: 72,
    ...props,
  };
  let tree: ReturnType<typeof create> | undefined;
  act(() => {
    tree = create(React.createElement(HourlyPatternCard, defaultProps));
  });
  return tree!;
}

// ─── FR1 — Color interpolation helpers ───────────────────────────────────────

describe('HourlyPatternCard — FR1: Color interpolation helpers', () => {
  let _barColor: (aiRate: number) => string;
  let _lerpColor: (from: string, to: string, t: number) => string;
  const { colors } = require('@/src/lib/colors');

  beforeAll(() => {
    const mod = require('@/src/components/HourlyPatternCard');
    _barColor = mod._barColor;
    _lerpColor = mod._lerpColor;
  });

  it('SC1.1 — _barColor(0) returns colors.surface', () => {
    expect(_barColor(0)).toBe(colors.surface);
  });

  it('SC1.2 — _barColor(0.5) returns colors.cyan', () => {
    expect(_barColor(0.5)).toBe(colors.cyan);
  });

  it('SC1.3 — _barColor(1.0) returns colors.violet', () => {
    expect(_barColor(1.0)).toBe(colors.violet);
  });

  it('SC1.4 — _barColor(NaN) returns colors.surface', () => {
    expect(_barColor(NaN)).toBe(colors.surface);
  });

  it('SC1.5 — _barColor(0.25) returns a color between surface and cyan (not equal to either)', () => {
    const result = _barColor(0.25);
    expect(result).not.toBe(colors.surface);
    expect(result).not.toBe(colors.cyan);
    // Result should be a valid hex color
    expect(result).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('SC1.6 — _lerpColor is pure — same inputs same output', () => {
    const a = _lerpColor('#16151F', '#00C2FF', 0.5);
    const b = _lerpColor('#16151F', '#00C2FF', 0.5);
    expect(a).toBe(b);
  });

  it('SC1.6b — _lerpColor t=0 returns from color', () => {
    expect(_lerpColor('#16151F', '#00C2FF', 0)).toBe('#16151f');
  });

  it('SC1.6c — _lerpColor t=1 returns to color (or near-equal hex)', () => {
    const result = _lerpColor('#16151F', '#00C2FF', 1);
    // Allow either lowercase canonical form
    expect(result.toLowerCase()).toBe('#00c2ff');
  });

  it('SC1.6d — _lerpColor clamps t below 0', () => {
    const clamped = _lerpColor('#16151F', '#00C2FF', -0.5);
    const atZero  = _lerpColor('#16151F', '#00C2FF', 0);
    expect(clamped).toBe(atZero);
  });

  it('SC1.6e — _lerpColor clamps t above 1', () => {
    const clamped = _lerpColor('#16151F', '#00C2FF', 1.5);
    const atOne   = _lerpColor('#16151F', '#00C2FF', 1);
    expect(clamped).toBe(atOne);
  });
});

// ─── FR2 — Bar rendering ─────────────────────────────────────────────────────

describe('HourlyPatternCard — FR2: Bar rendering', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC2.1 — exports HourlyPatternCard (named or default)', () => {
    expect(source).toMatch(
      /export\s+(function|const)\s+HourlyPatternCard|export\s+default\s+function\s+HourlyPatternCard/,
    );
  });

  it('SC2.2 — source clips to activeWindow — uses lo/hi from activeWindow', () => {
    // Should reference activeWindow and use it for bounds
    expect(source).toMatch(/activeWindow/);
    // Should compute barCount from hi - lo or similar
    expect(source).toMatch(/hi\s*-\s*lo|barCount/);
  });

  it('SC2.3 — source uses BAR_W_RATIO constant for bar width', () => {
    expect(source).toMatch(/BAR_W_RATIO/);
    // Should be set to 0.65
    expect(source).toMatch(/BAR_W_RATIO\s*=\s*0\.65|0\.65/);
  });

  it('SC2.4 — source clamps bar height to minimum MIN_BAR_H (2px)', () => {
    // MIN_BAR_H constant or inline 2
    expect(source).toMatch(/MIN_BAR_H\s*=\s*2|Math\.max\s*\([\s\S]{0,60},\s*2\s*\)|Math\.max\s*\([\s\S]{0,60}MIN_BAR_H/);
  });

  it('SC2.5 — source normalizes to peakSlots within active window', () => {
    expect(source).toMatch(/peakSlots|Math\.max\s*\([\s\S]{0,80}slice/);
  });

  it('SC2.6 — source applies _barColor to LinearGradient colors (not bar backgroundColor)', () => {
    // _barColor() is used — feeds the gradient top color
    expect(source).toMatch(/_barColor\s*\(/);
    // LinearGradient is used for bar fills (Skia gradient migration)
    expect(source).toMatch(/LinearGradient/);
    // colors prop on LinearGradient receives the barColor output
    expect(source).toMatch(/colors\s*=\s*\{?\s*\[/);
  });

  it('SC2.7 — width=0 guard returns null', () => {
    expect(source).toMatch(/width\s*===\s*0[\s\S]{0,30}return\s+null|if\s*\(\s*!?\s*width\s*\)/);
  });

  it('SC2.7b — smoke: width=0 returns null without crash', () => {
    const tree = renderCard({ width: 0 });
    expect(tree.toJSON()).toBeNull();
  });
});

// ─── FR3 — Focus window and AI zone overlays ─────────────────────────────────

describe('HourlyPatternCard — FR3: Overlays (source analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC3.1 — source conditionally renders focus overlay on focusWindow !== null', () => {
    expect(source).toMatch(/focusWindow\s*!==?\s*null|focusWindow\s*&&/);
  });

  it('SC3.2 — focus overlay uses colors.gold with 15% opacity', () => {
    expect(source).toContain('colors.gold');
    // opacity: 0.15 or rgba with 0.15 alpha, or hex alpha
    expect(source).toMatch(/0\.15/);
  });

  it('SC3.3 — source conditionally renders AI overlay on aiHotZone !== null', () => {
    expect(source).toMatch(/aiHotZone\s*!==?\s*null|aiHotZone\s*&&/);
  });

  it('SC3.4 — source suppresses AI overlay when ranges overlap (overlap detection logic)', () => {
    // Must check for overlap between hotRange and peakRange
    expect(source).toMatch(/hotRange|peakRange/);
    // Overlap condition uses <= and >= or some range intersection
    expect(source).toMatch(
      /focusOverlapsAI|overlaps|hotRange\[0\]\s*<=\s*[\w.]+\[1\]|hotRange\[1\]\s*>=\s*[\w.]+\[0\]/,
    );
  });

  it('SC3.5 — source has pointerEvents="none" on overlay View(s)', () => {
    expect(source).toMatch(/pointerEvents\s*=\s*["']none["']/);
  });

  it('SC3.5b — focus overlay uses colors.violet for AI zone', () => {
    expect(source).toContain('colors.violet');
  });
});

// ─── FR4 — Text summary rows ─────────────────────────────────────────────────

describe('HourlyPatternCard — FR4: Text summary rows (source analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC4.1 — "FOCUS PEAK" label string present in source', () => {
    expect(source).toContain('FOCUS PEAK');
  });

  it('SC4.2 — "AI PEAK" label string present in source', () => {
    expect(source).toContain('AI PEAK');
  });

  it('SC4.3 — source imports and uses formatHour from hourlyInsights', () => {
    expect(source).toMatch(/formatHour/);
    expect(source).toMatch(/from\s+['"]@?\/?(src\/lib\/|.*)hourlyInsights['"]/);
  });

  it('SC4.4 — source handles focusWindow=null with "—" fallback', () => {
    expect(source).toMatch(/['"]—['"]/);
  });

  it('SC4.5 — source handles aiHotZone=null with "—" fallback', () => {
    // Same "—" literal used for both nulls
    const dashMatches = source.match(/['"]—['"]/g);
    expect(dashMatches).not.toBeNull();
    expect(dashMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it('SC4.6 — summary row labels use colors.textMuted', () => {
    expect(source).toContain('colors.textMuted');
  });

  it('SC4.6b — source has 11px label font size for summary rows', () => {
    expect(source).toMatch(/11/);
  });
});

// ─── Smoke tests ──────────────────────────────────────────────────────────────

describe('HourlyPatternCard — Smoke tests', () => {
  it('renders without crash with all props provided', () => {
    expect(() => renderCard({})).not.toThrow();
  });

  it('renders without crash when focusWindow=null', () => {
    expect(() => renderCard({ focusWindow: null })).not.toThrow();
  });

  it('renders without crash when aiHotZone=null', () => {
    expect(() => renderCard({ aiHotZone: null })).not.toThrow();
  });

  it('renders without crash when both focusWindow=null and aiHotZone=null', () => {
    expect(() => renderCard({ focusWindow: null, aiHotZone: null })).not.toThrow();
  });

  it('renders without crash with non-overlapping AI hot zone', () => {
    expect(() => renderCard({ aiHotZone: AI_HOT_ZONE_NON_OVERLAPPING })).not.toThrow();
  });

  it('renders without crash with single-bar active window', () => {
    const profile = makeProfile({ activeWindow: [9, 9] });
    expect(() => renderCard({ profile })).not.toThrow();
  });

  it('renders without crash with all-zero avgSlots in window', () => {
    const avgSlots = new Array(24).fill(0);
    const profile = makeProfile({ avgSlots, activeWindow: [8, 11] });
    expect(() => renderCard({ profile })).not.toThrow();
  });

  it('returns null for width=0 (no content rendered)', () => {
    const tree = renderCard({ width: 0 });
    expect(tree.toJSON()).toBeNull();
  });

  it('renders without crash with custom height', () => {
    expect(() => renderCard({ height: 100 })).not.toThrow();
  });
});

// ─── FR1 — Skia Canvas bar renderer (01-skia-gradient-bars) ─────────────────

describe('HourlyPatternCard — FR1: Skia Canvas bar renderer', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC1.1 — source imports Canvas, RoundedRect, LinearGradient, vec from @shopify/react-native-skia', () => {
    expect(source).toMatch(/Canvas[\s\S]{0,200}@shopify\/react-native-skia/);
    expect(source).toMatch(/RoundedRect/);
    expect(source).toMatch(/LinearGradient/);
    expect(source).toMatch(/\bvec\b/);
  });

  it('SC1.2 — source uses RoundedRect with Skia geometry props (x, y, width, height)', () => {
    // RoundedRect rendered with computed bar geometry
    expect(source).toMatch(/<RoundedRect[\s\S]{0,200}x=\{barLeft\}[\s\S]{0,100}y=\{barTop\}/);
    expect(source).toMatch(/RoundedRect[\s\S]{0,200}width=\{barW\}[\s\S]{0,100}height=\{barH\}/);
  });

  it('SC1.3 — LinearGradient colors[0] is _barColor() output, colors[1] is transparent', () => {
    // topColor (or direct call) assigned via _barColor and fed as colors[0]
    expect(source).toMatch(/topColor\s*=\s*_barColor\s*\(/);
    // colors array: first element is the topColor variable, second is transparent
    expect(source).toMatch(/colors\s*=\s*\{?\s*\[\s*topColor\s*,\s*['"]transparent['"]/);
    // No bar uses View backgroundColor for fill (Skia migration complete)
    expect(source).not.toMatch(/<View[\s\S]{0,200}backgroundColor\s*:\s*_?barColor/);
  });

  it('SC1.4 — bar corners use r={4} (not borderRadius: 2)', () => {
    expect(source).toMatch(/r\s*=\s*\{?\s*4\s*\}?/);
  });

  it('SC1.5 — smoke: renders without crash (Skia mock active)', () => {
    expect(() => renderCard({})).not.toThrow();
  });

  it('SC1.6 — NaN aiRate: _barColor(NaN) = colors.surface → no crash', () => {
    const avgAIRate = new Array(24).fill(NaN);
    const profile = makeProfile({ avgAIRate });
    expect(() => renderCard({ profile })).not.toThrow();
  });

  it('SC1.7 — all-zero avgSlots: MIN_BAR_H floor prevents zero-height bars, no crash', () => {
    const avgSlots = new Array(24).fill(0);
    const profile = makeProfile({ avgSlots, activeWindow: [8, 11] });
    expect(() => renderCard({ profile })).not.toThrow();
  });

  it('SC1.8 — single-bar active window renders fine', () => {
    const profile = makeProfile({ activeWindow: [9, 9] });
    expect(() => renderCard({ profile })).not.toThrow();
  });
});

// ─── FR2 — Entry animation (01-skia-gradient-bars) ───────────────────────────

describe('HourlyPatternCard — FR2: Entry animation', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC2.1 — source imports Animated, useSharedValue, withTiming, useAnimatedStyle from react-native-reanimated', () => {
    expect(source).toMatch(/useSharedValue/);
    expect(source).toMatch(/withTiming/);
    expect(source).toMatch(/useAnimatedStyle/);
    expect(source).toMatch(/react-native-reanimated/);
  });

  it('SC2.2 — source imports timingChartFill from @/src/lib/reanimated-presets', () => {
    expect(source).toMatch(/timingChartFill/);
    expect(source).toMatch(/reanimated-presets/);
  });

  it('SC2.3 — source uses withTiming(1, timingChartFill) in a useEffect', () => {
    expect(source).toMatch(/withTiming\s*\(\s*1\s*,\s*timingChartFill\s*\)/);
    // useEffect contains the clipProgress.value = withTiming call
    expect(source).toMatch(/useEffect[\s\S]{0,300}clipProgress\.value\s*=\s*withTiming/);
  });

  it('SC2.4 — smoke: renders without crash (Reanimated mock active)', () => {
    expect(() => renderCard({ width: 320 })).not.toThrow();
  });
});

// ─── Integration: text content verification ───────────────────────────────────

describe('HourlyPatternCard — Integration: text content', () => {
  it('renders "FOCUS PEAK" and "AI PEAK" labels when width > 0', () => {
    const tree = renderCard({});
    const json = tree.toJSON();
    expect(json).not.toBeNull();
    const jsonStr = JSON.stringify(json);
    expect(jsonStr).toContain('FOCUS PEAK');
    expect(jsonStr).toContain('AI PEAK');
  });

  it('renders "—" for focus peak when focusWindow=null', () => {
    const tree = renderCard({ focusWindow: null });
    const json = tree.toJSON();
    const jsonStr = JSON.stringify(json);
    expect(jsonStr).toContain('FOCUS PEAK');
    expect(jsonStr).toContain('—');
  });

  it('renders "—" for AI peak when aiHotZone=null', () => {
    const tree = renderCard({ aiHotZone: null });
    const json = tree.toJSON();
    const jsonStr = JSON.stringify(json);
    expect(jsonStr).toContain('AI PEAK');
    expect(jsonStr).toContain('—');
  });
});
