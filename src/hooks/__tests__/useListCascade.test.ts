// Tests: useListCascade hook — 04-list-cascade
//
// FR1: useListCascade hook — interface, initial values, spring config
// FR2: Items animate from opacity=0/translateY=12/scale=0.97 to final state
// FR3: Delay is min(index * delayPerItem, maxDelay)
// FR4: Re-triggers animation when deps change
// FR5: Applied to DailyAIRow items in ai.tsx
// FR6: Applied to approval cards in approvals.tsx
// FR7: useReducedMotion check — skip to final state immediately
//
// Strategy: Source-file static analysis throughout.
// Reanimated hooks (useSharedValue, useAnimatedStyle, withSpring) cannot be
// exercised via renderHook in jest-expo/node preset (no dispatcher outside render).
// This mirrors the established pattern in useStaggeredEntry.test.ts.

import * as fs from 'fs';
import * as path from 'path';

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const HOOK_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'hooks', 'useListCascade.ts');
const AI_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'ai.tsx');
const APPROVALS_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'approvals.tsx');

// ─── FR1: useListCascade hook — interface and exports ─────────────────────────

describe('FR1: useListCascade — source file exists and exports', () => {
  it('hook file exists at src/hooks/useListCascade.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('exports useListCascade function', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/export\s+function\s+useListCascade/);
  });

  it('exports UseListCascadeOptions interface', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/export\s+interface\s+UseListCascadeOptions/);
  });

  it('exports UseListCascadeReturn interface', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/export\s+interface\s+UseListCascadeReturn/);
  });

  it('UseListCascadeOptions declares count: number field', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/count\s*:\s*number/);
  });

  it('UseListCascadeOptions declares delayPerItem with default 60', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/delayPerItem.*=\s*60/);
  });

  it('UseListCascadeOptions declares maxDelay with default 400', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/maxDelay.*=\s*400/);
  });

  it('UseListCascadeReturn declares getItemStyle function field', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/getItemStyle\s*:\s*\(index\s*:\s*number\)/);
  });
});

// ─── FR2: Initial values and final animation target ───────────────────────────

describe('FR2: useListCascade — initial values (opacity=0, translateY=12, scale=0.97)', () => {
  it('initialises translateY shared values with TRANSLATE_Y_START = 12', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/TRANSLATE_Y_START\s*=\s*12|useSharedValue\(12\)/);
  });

  it('initialises opacity shared values to 0', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useSharedValue\(0\)/);
  });

  it('initialises scale shared values with SCALE_START = 0.97', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/SCALE_START\s*=\s*0\.97|useSharedValue\(0\.97\)/);
  });

  it('animates opacity to 1 using withSpring', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/withSpring\s*\(\s*1/);
  });

  it('animates translateY to 0 using withSpring', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/withSpring\s*\(\s*0/);
  });

  it('animates scale to 1 using withSpring', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // scale animates to 1 — same target as opacity but check scale values are present
    expect(source).toMatch(/scaleValues/);
    expect(source).toMatch(/withSpring\s*\(\s*1/);
  });

  it('uses springBouncy preset from reanimated-presets', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/import.*springBouncy.*from.*reanimated-presets/);
    expect(source).toMatch(/withSpring\([^)]*springBouncy/);
  });

  it('getItemStyle returns resting state for out-of-range indices', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must return a static style with opacity 1 for out-of-range
    expect(source).toMatch(/opacity\s*:\s*1/);
    expect(source).toMatch(/translateY\s*:\s*0/);
  });
});

// ─── FR3: Delay per item, capped at maxDelay ──────────────────────────────────

describe('FR3: useListCascade — delay calculation', () => {
  it('uses withDelay for staggered timing', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/withDelay/);
  });

  it('computes delay as index * delayPerItem', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/i\s*\*\s*delayPerItem|\*\s*delayPerItem/);
  });

  it('caps delay at maxDelay using Math.min', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/Math\.min\s*\([^)]*delayPerItem[^)]*maxDelay|Math\.min\s*\([^)]*maxDelay[^)]*delayPerItem/);
  });
});

// ─── FR4: Re-triggers on dep change ──────────────────────────────────────────

describe('FR4: useListCascade — re-triggers on deps change', () => {
  it('accepts deps as second argument', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/deps\s*:\s*DependencyList|deps\s*=\s*\[\]/);
  });

  it('useEffect dependency array spreads deps', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // The effect should depend on count and deps spread
    expect(source).toMatch(/\.\.\.\s*deps/);
  });

  it('resets values to initial state before re-firing (handles dep change)', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must reset opacity to 0 before re-firing spring
    expect(source).toMatch(/\.value\s*=\s*0/);
    // Must reset translateY to initial
    expect(source).toMatch(/TRANSLATE_Y_START|\.value\s*=\s*12/);
  });
});

// ─── FR7: useReducedMotion safety ─────────────────────────────────────────────

describe('FR7: useListCascade — useReducedMotion support', () => {
  it('imports useReducedMotion from react-native-reanimated', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useReducedMotion/);
    expect(source).toMatch(/from\s+['"]react-native-reanimated['"]/);
  });

  it('calls useReducedMotion() in the hook body', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useReducedMotion\(\)/);
  });

  it('has a reduceMotion branch that sets values to resting state without spring', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/reduceMotion/);
    expect(source).toMatch(/if\s*\(\s*reduce[Mm]otion|reduce[Mm]otion\s*&&|reduce[Mm]otion\s*\?/);
  });
});

// ─── Shared value allocation ───────────────────────────────────────────────────

describe('useListCascade — shared value allocation', () => {
  it('uses useSharedValue from react-native-reanimated', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useSharedValue/);
  });

  it('uses useAnimatedStyle from react-native-reanimated', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useAnimatedStyle/);
  });

  it('pre-creates animated styles in an array (not inside getItemStyle)', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must store animated styles in array before getItemStyle is defined
    expect(source).toMatch(/animatedStyles|animStyles/);
  });

  it('declares MAX_ITEMS constant for fixed allocation', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/MAX_ITEMS\s*=\s*\d+/);
  });

  it('uses Array.from to pre-allocate shared values', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/Array\.from/);
  });
});

// ─── FR5: ai.tsx integration ──────────────────────────────────────────────────

describe('FR5: ai.tsx — useListCascade applied to DailyAIRow items', () => {
  it('imports useListCascade from @/src/hooks/useListCascade', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/useListCascade.*from.*@\/src\/hooks\/useListCascade/);
  });

  it('calls useListCascade with count from dailyBreakdown.length', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/useListCascade\s*\(\s*\{[^}]*count[^}]*dailyBreakdown\.length/);
  });

  it('passes chartKey as a dep to useListCascade', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/useListCascade\s*\([^)]*chartKey/);
  });

  it('wraps DailyAIRow in Animated.View with getItemStyle(index)', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/getItemStyle\s*\(\s*index\s*\)/);
  });

  it('DailyAIRow map uses Animated.View wrapper', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    // The map over dailyBreakdown must include Animated.View
    expect(source).toMatch(/dailyBreakdown\.map[\s\S]*?Animated\.View/);
  });
});

// ─── FR6: approvals.tsx integration ──────────────────────────────────────────

describe('FR6: approvals.tsx — useListCascade applied to approval cards', () => {
  it('imports useListCascade from @/src/hooks/useListCascade', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    expect(source).toMatch(/useListCascade.*from.*@\/src\/hooks\/useListCascade/);
  });

  it('calls useListCascade with count from items.length', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    expect(source).toMatch(/useListCascade\s*\(\s*\{[^}]*count[^}]*items\.length/);
  });

  it('wraps approval items in Animated.View with getItemStyle(index)', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    expect(source).toMatch(/getItemStyle\s*\(\s*index\s*\)/);
  });
});
