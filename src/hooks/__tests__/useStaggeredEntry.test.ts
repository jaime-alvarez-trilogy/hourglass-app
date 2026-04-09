// Tests: useStaggeredEntry hook — 04-card-entry-animations
//
// FR1: useStaggeredEntry hook — interface contracts, spring config, stagger logic,
//      reduceMotion safety, shared value allocation, re-fire on focus
// FR2: Home screen (app/(tabs)/index.tsx) — card wrapping
// FR3: AI screen (app/(tabs)/ai.tsx) — card wrapping
// FR4: Approvals screen (app/(tabs)/approvals.tsx) — section container wrapping
// FR5: Overview screen (app/(tabs)/overview.tsx) — chart card wrapping
//
// Strategy: Source-file static analysis throughout.
// Reanimated hooks (useSharedValue, useAnimatedStyle, withSpring) cannot be
// exercised via renderHook in jest-expo/node preset (no dispatcher outside render).
// Static analysis matches the established pattern in this codebase (see
// useScrubGesture.test.ts, useAIData.test.ts, overview.test.tsx).
//
// Tests will FAIL (red phase) until the source files are created/modified.

import * as fs from 'fs';
import * as path from 'path';

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const HOOK_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'hooks', 'useStaggeredEntry.ts');
const HOME_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'index.tsx');
const AI_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'ai.tsx');
const APPROVALS_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'approvals.tsx');
const OVERVIEW_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'overview.tsx');

// ─── FR1: useStaggeredEntry hook ──────────────────────────────────────────────

describe('FR1: useStaggeredEntry — source file exists and exports', () => {
  it('hook file exists at src/hooks/useStaggeredEntry.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('exports useStaggeredEntry function', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/export\s+function\s+useStaggeredEntry/);
  });

  it('exports StaggeredEntryOptions interface', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/export\s+interface\s+StaggeredEntryOptions/);
  });

  it('exports UseStaggeredEntryReturn interface', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/export\s+interface\s+UseStaggeredEntryReturn/);
  });

  it('StaggeredEntryOptions declares count: number field', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/count\s*:\s*number/);
  });

  it('StaggeredEntryOptions declares maxStaggerIndex?: number field', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/maxStaggerIndex\s*\?\s*:\s*number/);
  });

  it('UseStaggeredEntryReturn declares getEntryStyle function field', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\s*:\s*\(index\s*:\s*number\)/);
  });

  it('UseStaggeredEntryReturn declares isReady: boolean field', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/isReady\s*:\s*boolean/);
  });
});

describe('FR1: useStaggeredEntry — initial values (opacity 0, translateY 16)', () => {
  it('initialises translateY shared values with TRANSLATE_Y_START = 16', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Either a constant named TRANSLATE_Y_START = 16 or direct useSharedValue(16)
    expect(source).toMatch(/TRANSLATE_Y_START\s*=\s*16|useSharedValue\(16\)/);
  });

  it('initialises opacity shared values to 0', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useSharedValue\(0\)/);
  });

  it('getEntryStyle returns resting state (opacity 1, translateY 0) for out-of-range indices', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must have a branch for out-of-range that returns opacity 1 and translateY 0
    expect(source).toMatch(/opacity\s*:\s*1/);
    expect(source).toMatch(/translateY\s*:\s*0/);
  });
});

describe('FR1: useStaggeredEntry — springBouncy and stagger delay', () => {
  it('imports springBouncy from @/src/lib/reanimated-presets', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/import.*springBouncy.*from.*reanimated-presets/);
  });

  it('uses withSpring with springBouncy for opacity animation', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/withSpring\([^)]*springBouncy/);
  });

  it('uses withDelay for staggered timing', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/withDelay/);
  });

  it('uses 50ms stagger multiplier (STAGGER_MS = 50 or index * 50)', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Either a STAGGER_MS = 50 constant or literal * 50
    expect(source).toMatch(/STAGGER_MS\s*=\s*50|index\s*\*\s*50|\*\s*50/);
  });

  it('caps delay at maxStaggerIndex using Math.min', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/Math\.min/);
  });

  it('uses withSpring to animate translateY to 0', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/withSpring\s*\(\s*0/);
  });

  it('uses withSpring to animate opacity to 1', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/withSpring\s*\(\s*1/);
  });
});

describe('FR1: useStaggeredEntry — focus trigger', () => {
  it('imports useIsFocused from @react-navigation/native', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useIsFocused.*from.*@react-navigation\/native/);
  });

  it('calls useIsFocused() to get focus state', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useIsFocused\(\)/);
  });

  it('uses useEffect with isFocused as a dependency', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useEffect/);
    expect(source).toMatch(/isFocused/);
  });

  it('resets translateY values to initial on each focus before re-firing', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must reset to TRANSLATE_Y_START or 16 before firing
    expect(source).toMatch(/TRANSLATE_Y_START|\.value\s*=\s*16/);
  });

  it('resets opacity values to 0 on each focus before re-firing', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must reset opacity to 0 before re-firing spring
    expect(source).toMatch(/\.value\s*=\s*0/);
  });
});

describe('FR1: useStaggeredEntry — reduceMotion safety', () => {
  it('imports useReducedMotion from react-native-reanimated', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // useReducedMotion is in a multi-line import block — check both the name and the from clause
    expect(source).toMatch(/useReducedMotion/);
    expect(source).toMatch(/from\s+['"]react-native-reanimated['"]/);
  });

  it('calls useReducedMotion() in the hook body', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useReducedMotion\(\)/);
  });

  it('has a reduceMotion branch that sets values to resting state without spring', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must check reduceMotion and handle it specially
    expect(source).toMatch(/reduceMotion/);
    // In the reduceMotion branch, values are set directly (no withDelay/withSpring)
    expect(source).toMatch(/if\s*\(\s*reduce[Mm]otion|reduce[Mm]otion\s*&&|reduce[Mm]otion\s*\?/);
  });
});

describe('FR1: useStaggeredEntry — shared value allocation', () => {
  it('uses useSharedValue from react-native-reanimated', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useSharedValue/);
  });

  it('uses useAnimatedStyle from react-native-reanimated', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useAnimatedStyle/);
  });

  it('pre-creates animated styles in an array (not inside getEntryStyle)', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must store animated styles in array before getEntryStyle is defined
    // Pattern: const animatedStyles = Array.from(...) or similar array storage
    expect(source).toMatch(/animatedStyles|animStyles|styles\s*=.*\[/);
  });

  it('default maxStaggerIndex is 6', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/maxStaggerIndex\s*=\s*6/);
  });

  it('uses Math.min to compute animatedCount from count and maxStaggerIndex', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // animatedCount = Math.min(count, maxStaggerIndex + 1)
    expect(source).toMatch(/Math\.min\s*\([^)]*count[^)]*maxStaggerIndex|Math\.min\s*\([^)]*maxStaggerIndex[^)]*count/);
  });
});

// ─── FR2: Home screen (index.tsx) ─────────────────────────────────────────────

describe('FR2: Home screen — useStaggeredEntry integration', () => {
  it('imports useStaggeredEntry from @/src/hooks/useStaggeredEntry', () => {
    const source = fs.readFileSync(HOME_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry.*from.*@\/src\/hooks\/useStaggeredEntry/);
  });

  it('imports Animated from react-native-reanimated', () => {
    const source = fs.readFileSync(HOME_FILE, 'utf8');
    // Home screen uses a multi-line import: import Animated, { ... } from 'react-native-reanimated'
    expect(source).toMatch(/import\s+Animated[\s,{][\s\S]*?from\s+['"]react-native-reanimated['"]/);
  });

  it('calls useStaggeredEntry with count: 4', () => {
    const source = fs.readFileSync(HOME_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*4/);
  });

  it('wraps hero PanelGradient zone with Animated.View getEntryStyle(0)', () => {
    const source = fs.readFileSync(HOME_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(0\)/);
  });

  it('wraps weekly chart card zone with Animated.View getEntryStyle(1)', () => {
    const source = fs.readFileSync(HOME_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(1\)/);
  });

  it('wraps AI trajectory card zone with Animated.View getEntryStyle(2)', () => {
    const source = fs.readFileSync(HOME_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(2\)/);
  });

  it('wraps earnings card zone with Animated.View getEntryStyle(3)', () => {
    const source = fs.readFileSync(HOME_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(3\)/);
  });

  it('does NOT wrap UrgencyBanner with getEntryStyle', () => {
    const source = fs.readFileSync(HOME_FILE, 'utf8');
    // Ensure UrgencyBanner is not inside an Animated.View with getEntryStyle
    // The UrgencyBanner must appear in the source without being preceded by getEntryStyle
    // on the same wrapper — check that UrgencyBanner is not wrapped in an entry style view
    // Simple assertion: getEntryStyle should only be called 4 times (indices 0-3)
    const entryStyleCalls = (source.match(/getEntryStyle\(\d+\)/g) || []).length;
    expect(entryStyleCalls).toBe(4);
  });
});

// ─── FR3: AI screen (ai.tsx) ──────────────────────────────────────────────────

describe('FR3: AI screen — useStaggeredEntry integration', () => {
  it('imports useStaggeredEntry from @/src/hooks/useStaggeredEntry', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry.*from.*@\/src\/hooks\/useStaggeredEntry/);
  });

  it('imports Animated from react-native-reanimated', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/import\s+Animated\s+from\s+['"]react-native-reanimated['"]/);
  });

  it('calls useStaggeredEntry with count: 7', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*7/);
  });

  it('wraps AI Usage card with getEntryStyle(0)', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(0\)/);
  });

  it('wraps BrainLift card with getEntryStyle(1)', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(1\)/);
  });

  it('wraps Prime Radiant card with getEntryStyle(2)', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(2\)/);
  });

  it('wraps Daily Breakdown card with getEntryStyle(3)', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(3\)/);
  });

  it('wraps 12-Week Trajectory card with getEntryStyle(4)', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(4\)/);
  });

  it('wraps Legend card with getEntryStyle(5)', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(5\)/);
  });

  it('uses exactly 7 getEntryStyle calls (indices 0-6)', () => {
    const source = fs.readFileSync(AI_FILE, 'utf8');
    const calls = (source.match(/getEntryStyle\(\d+\)/g) || []).length;
    expect(calls).toBe(7);
  });
});

// ─── FR4: Approvals screen (approvals.tsx) ────────────────────────────────────

describe('FR4: Approvals screen — useStaggeredEntry integration', () => {
  it('imports useStaggeredEntry from @/src/hooks/useStaggeredEntry', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry.*from.*@\/src\/hooks\/useStaggeredEntry/);
  });

  it('imports Animated from react-native-reanimated', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    expect(source).toMatch(/import\s+Animated\s+from\s+['"]react-native-reanimated['"]/);
  });

  it('calls useStaggeredEntry with count: 2', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*2/);
  });

  it('wraps Team Requests section with getEntryStyle(0)', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(0\)/);
  });

  it('wraps My Requests section with getEntryStyle using dynamic index (isManager ? 1 : 0)', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    // Manager uses index 1, contributor uses index 0 — dynamic expression
    expect(source).toMatch(/getEntryStyle\s*\(\s*isManager\s*\?\s*1\s*:\s*0\s*\)/);
  });

  it('does NOT wrap individual ApprovalCard renders with getEntryStyle', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    // There are exactly 2 Animated.View wrappers with getEntryStyle
    // (one with literal 0 for team section, one with expression for my-requests)
    const literalCalls = (source.match(/getEntryStyle\(\s*\d+\s*\)/g) || []).length;
    const exprCalls = (source.match(/getEntryStyle\s*\(\s*isManager\s*\?/g) || []).length;
    expect(literalCalls + exprCalls).toBe(2);
  });

  it('FlatList renderItem function does NOT reference getEntryStyle', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    // The FlatList in the approvals screen renders individual ApprovalCard items.
    // These must NOT be wrapped with getEntryStyle — only section containers are animated.
    // Verify the renderApprovalItem function exists and does not call getEntryStyle.
    expect(source).toMatch(/function\s+renderApprovalItem/);
    const renderItemMatch = source.match(/function\s+renderApprovalItem[\s\S]*?\n\s*\}/);
    expect(renderItemMatch).not.toBeNull();
    if (renderItemMatch) {
      expect(renderItemMatch[0]).not.toMatch(/getEntryStyle/);
    }
  });
});

// ─── FR5: Overview screen (overview.tsx) ──────────────────────────────────────

describe('FR5: Overview screen — useStaggeredEntry integration', () => {
  it('imports useStaggeredEntry from @/src/hooks/useStaggeredEntry', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry.*from.*@\/src\/hooks\/useStaggeredEntry/);
  });

  it('calls useStaggeredEntry with count: 3', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*3/);
  });

  it('wraps Earnings ChartSection with getEntryStyle(0)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(0\)/);
  });

  it('wraps Hours ChartSection with getEntryStyle(1)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(1\)/);
  });

  it('wraps AI Usage ChartSection with getEntryStyle(2)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\(2\)/);
  });

  it('uses exactly 3 getEntryStyle calls (one per ChartSection)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const calls = (source.match(/getEntryStyle\(\d+\)/g) || []).length;
    expect(calls).toBe(3);
  });

  it('scrub snapshot panel Animated.View does NOT use getEntryStyle', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // The snapshot panel is always rendered with its own panelStyle animation
    // It must still use panelStyle (not replaced by getEntryStyle)
    expect(source).toMatch(/panelStyle/);
  });

  it('4W/12W/24W toggle header row is NOT wrapped with getEntryStyle', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // The toggle is inside OverviewHeroCard — getEntryStyle should only be on ChartSection wrappers
    // Already verified by the "exactly 3 calls" test above
    const calls = (source.match(/getEntryStyle\(\d+\)/g) || []).length;
    expect(calls).toBeLessThanOrEqual(3);
  });
});
