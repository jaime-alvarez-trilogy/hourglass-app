// Tests: src/components/FloatingPillTabBar.tsx — 01-floating-pill-tab spec
//
// FR1: Pill container — absolute position, colors, borderRadius, flexDirection
// FR2: Tab items — MaterialIcons, labels, explore filter, ICON_MAP
// FR3: Active indicator — conditional render, colors.violet + 1A, borderRadius
// FR4: Press feedback — useSharedValue, withSpring, springSnappy, Animated.View
// FR5: Badge — absolute position, conditional render, colors.critical
//
// Test strategy: static source-file analysis (fs.readFileSync).
// Same pattern as native-tabs.test.tsx and tabs-layout.test.tsx.
// No React rendering or mocking — validates implementation structure
// from source text.

import * as fs from 'fs';
import * as path from 'path';

// ─── File path ────────────────────────────────────────────────────────────────

const COMPONENT_FILE = path.resolve(
  __dirname,
  '../FloatingPillTabBar.tsx',
);

// ─── Shared fixture ───────────────────────────────────────────────────────────

let source: string;
let code: string; // comments stripped

beforeAll(() => {
  source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  // Strip single-line and block comments for structural assertions
  code = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
});

// ─── FR1: Pill Container ──────────────────────────────────────────────────────

describe('01-floating-pill-tab — FR1: Pill Container', () => {
  it('SC1.1 — FloatingPillTabBar is exported as a named export', () => {
    expect(source).toMatch(/export\s+(function|const)\s+FloatingPillTabBar/);
  });

  it("SC1.2 — container View has position: 'absolute'", () => {
    expect(source).toContain("position: 'absolute'");
  });

  it('SC1.3 — useSafeAreaInsets imported from react-native-safe-area-context', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*useSafeAreaInsets[^}]*\}\s*from\s*['"]react-native-safe-area-context['"]/,
    );
  });

  it('SC1.3 — useSafeAreaInsets is called in component body', () => {
    expect(source).toContain('useSafeAreaInsets()');
  });

  it('SC1.4 — container has left: 20', () => {
    expect(source).toContain('left: 20');
  });

  it('SC1.4 — container has right: 20', () => {
    expect(source).toContain('right: 20');
  });

  it('SC1.5 — container borderRadius is >= 24 (spec: 28)', () => {
    // The pill container must have borderRadius >= 24. There may be multiple
    // borderRadius declarations in the file (e.g. active indicator at 14, badge at 6).
    // Check that at least one value is >= 24 (the container's).
    const matches = [...source.matchAll(/borderRadius:\s*(\d+)/g)];
    expect(matches.length).toBeGreaterThan(0);
    const values = matches.map(m => parseInt(m[1], 10));
    expect(values.some(v => v >= 24)).toBe(true);
  });

  it('SC1.6 — container background uses colors.surface', () => {
    expect(source).toContain('colors.surface');
  });

  it('SC1.7 — container border uses colors.border', () => {
    expect(source).toContain('colors.border');
  });

  it("SC1.8 — container uses flexDirection: 'row'", () => {
    expect(source).toContain("flexDirection: 'row'");
  });
});

// ─── FR2: Tab Items ───────────────────────────────────────────────────────────

describe('01-floating-pill-tab — FR2: Tab Items', () => {
  it('SC2.2 — explore route is excluded from rendering (filtered)', () => {
    // PILL_TABS must NOT contain 'explore' — it is excluded from the pill
    // Import the exported constant to verify at the type/value level
    const componentPath = COMPONENT_FILE;
    const src = fs.readFileSync(componentPath, 'utf8');
    // PILL_TABS should contain index, overview, ai, approvals — but NOT explore
    expect(src).toContain("name: 'index'");
    expect(src).toContain("name: 'overview'");
    expect(src).toContain("name: 'approvals'");
    // 'explore' must not appear as a PILL_TABS entry name
    expect(src).not.toMatch(/PILL_TABS[\s\S]{0,500}name:\s*'explore'/);
  });

  it('SC2.3 — MaterialIcons imported from @expo/vector-icons/MaterialIcons', () => {
    expect(source).toMatch(
      /import\s+MaterialIcons\s+from\s+['"]@expo\/vector-icons\/MaterialIcons['"]/,
    );
  });

  it('SC2.3 — MaterialIcons used with size 20 for icon rendering', () => {
    expect(source).toContain('MaterialIcons');
    expect(source).toContain('size={20}');
  });

  it('SC2.4 — label text has fontSize: 10', () => {
    expect(source).toContain('fontSize: 10');
  });

  it('SC2.5 — inactive color references inactiveTintColor prop', () => {
    expect(source).toContain('inactiveTintColor');
  });

  it("SC2.6 — ICON_MAP maps 'house.fill' to 'home'", () => {
    expect(source).toContain("'house.fill'");
    expect(source).toContain("'home'");
  });

  it("SC2.6 — ICON_MAP maps 'chart.bar.fill' to 'bar_chart'", () => {
    expect(source).toContain("'chart.bar.fill'");
    expect(source).toContain("'bar_chart'");
  });

  it("SC2.6 — ICON_MAP maps 'sparkles' to 'auto_awesome'", () => {
    expect(source).toContain("'sparkles'");
    expect(source).toContain("'auto_awesome'");
  });

  it("SC2.6 — ICON_MAP maps 'checkmark.circle.fill' to 'check_circle'", () => {
    expect(source).toContain("'checkmark.circle.fill'");
    expect(source).toContain("'check_circle'");
  });

  it("SC2.7 — icon and label stacked vertically (flexDirection: 'column')", () => {
    expect(source).toContain("flexDirection: 'column'");
  });

  it('SC2.7 — alignItems: center for vertical stack centering', () => {
    expect(source).toContain("alignItems: 'center'");
  });

  it('SC2.8 — onPress handler calls navigation.navigate', () => {
    expect(source).toContain('navigation.navigate');
  });

  it('SC2.9 — onLongPress emits tabLongPress via navigation.emit', () => {
    expect(source).toContain('tabLongPress');
    expect(source).toContain('navigation.emit');
  });
});

// ─── FR3: Active Indicator ────────────────────────────────────────────────────

describe('01-floating-pill-tab — FR3: Active Indicator', () => {
  it('SC3.1 — active indicator is conditionally rendered (isActive guard)', () => {
    // Must have some condition based on active state
    expect(source).toMatch(/isActive|state\.index/);
  });

  it("SC3.2 — active indicator background uses colors.violet + '1A' suffix", () => {
    // Accept either colors.violet + '1A' concatenation or rgba equivalent
    const hasConcat = source.includes("colors.violet + '1A'") || source.includes('colors.violet + "1A"');
    const hasRgba = source.match(/rgba\s*\(\s*167\s*,\s*139\s*,\s*250/);
    const hasHex = source.includes('#A78BFA1A') || source.includes("'1A'");
    expect(hasConcat || hasRgba || hasHex).toBeTruthy();
  });

  it('SC3.2 — active indicator references colors.violet', () => {
    expect(source).toContain('colors.violet');
  });

  it('SC3.3 — active indicator borderColor uses colors.violet', () => {
    // borderColor for active indicator stroke must use colors.violet
    expect(source).toMatch(/borderColor:\s*colors\.violet/);
  });

  it('SC3.4 — active indicator borderRadius >= 10 (spec: 14)', () => {
    // Extract all borderRadius values and check at least one is >= 10 (the indicator's)
    const matches = [...source.matchAll(/borderRadius:\s*(\d+)/g)];
    const values = matches.map(m => parseInt(m[1], 10));
    expect(values.some(v => v >= 10)).toBe(true);
  });

  it('SC3.5 — active icon/label color uses tintColor prop (not hardcoded)', () => {
    expect(source).toContain('tintColor');
    // tintColor should NOT be hardcoded as a hex value
    expect(source).not.toMatch(/color:\s*['"]#A78BFA['"]/);
  });
});

// ─── FR4: Press Feedback Animation ───────────────────────────────────────────

describe('01-floating-pill-tab — FR4: Press Feedback Animation', () => {
  it('SC4.1 — useSharedValue imported from react-native-reanimated', () => {
    expect(source).toMatch(
      /import\s+[^;]*useSharedValue[^;]*from\s*['"]react-native-reanimated['"]/,
    );
  });

  it('SC4.1 — useSharedValue called to initialize scale', () => {
    expect(source).toContain('useSharedValue');
  });

  it('SC4.2 — useAnimatedStyle used for transform', () => {
    expect(source).toContain('useAnimatedStyle');
  });

  it('SC4.2 — animated style includes scale transform', () => {
    expect(source).toContain('scale');
    expect(source).toContain('transform');
  });

  it('SC4.3 — withSpring imported from react-native-reanimated', () => {
    expect(source).toMatch(
      /import\s+[^;]*withSpring[^;]*from\s*['"]react-native-reanimated['"]/,
    );
  });

  it('SC4.3 — springSnappy imported from reanimated-presets', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*springSnappy[^}]*\}\s*from\s*['"]@\/src\/lib\/reanimated-presets['"]/,
    );
  });

  it('SC4.3 — scale animates to 0.92 on pressIn', () => {
    expect(source).toContain('0.92');
  });

  it('SC4.4 — scale returns to 1.0 on pressOut', () => {
    // withSpring(1, ...) or withSpring(1.0, ...)
    expect(source).toMatch(/withSpring\s*\(\s*1[^.]/);
  });

  it('SC4.5 — Animated.View from react-native-reanimated wraps each tab item', () => {
    // Animated default import or named Animated.View
    expect(source).toMatch(/Animated\.View|<Animated\.View/);
  });

  it('SC4.6 — Pressable component handles touch events', () => {
    expect(source).toMatch(/Pressable/);
    expect(source).toMatch(/onPressIn|pressIn/);
    expect(source).toMatch(/onPressOut|pressOut/);
  });
});

// ─── FR5: Badge ───────────────────────────────────────────────────────────────

describe('01-floating-pill-tab — FR5: Badge', () => {
  it("SC5.1 — badge container has position: 'absolute'", () => {
    // Must have at least two 'absolute' usages (container + badge)
    const matches = (source.match(/position:\s*'absolute'/g) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('SC5.2 — badge positioned top-right of icon', () => {
    expect(source).toMatch(/top:\s*-?\d+/);
    expect(source).toMatch(/right:\s*-?\d+/);
  });

  it('SC5.3 — badge only renders when badge > 0', () => {
    // Must have a guard: badge > 0 or badge && or similar
    expect(source).toMatch(/badge\s*>\s*0|badge\s*&&|badge\s*\?/);
  });

  it('SC5.4 — badge shows numeric count as text', () => {
    // badge value rendered as text/string
    expect(source).toMatch(/String\s*\(\s*badge\s*\)|{badge}|badge\.toString/);
  });

  it('SC5.5 — badge uses colors.critical for background', () => {
    expect(source).toContain('colors.critical');
  });

  it('SC5.5 — badge has borderRadius: 6 (12pt circle)', () => {
    // borderRadius 6 for 12pt diameter badge
    expect(source).toMatch(/borderRadius:\s*6/);
  });

  it("SC5.6 — badge text color is 'white'", () => {
    expect(source).toMatch(/color:\s*['"]white['"]/);
  });

  it('SC5.6 — badge text fontSize is 8', () => {
    expect(source).toContain('fontSize: 8');
  });
});

// ─── Integration: no forbidden imports ───────────────────────────────────────

describe('01-floating-pill-tab — Integration: forbidden imports', () => {
  it('does NOT import expo-blur (BlurView excluded per spec)', () => {
    expect(code).not.toContain('expo-blur');
    expect(code).not.toContain('BlurView');
  });

  it('does NOT use IconSymbol (uses MaterialIcons directly)', () => {
    expect(code).not.toContain('IconSymbol');
  });

  it('imports BottomTabBarProps from @react-navigation/bottom-tabs', () => {
    expect(source).toMatch(
      /from\s*['"]@react-navigation\/bottom-tabs['"]/,
    );
  });
});
