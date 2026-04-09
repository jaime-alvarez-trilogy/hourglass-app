// Tests: app/(tabs)/_layout.tsx — 06-native-tabs spec
//
// FR1: Feature flags in app.json (ENABLE_SHARED_ELEMENT_TRANSITIONS)
// FR2: Platform split logic (Platform.OS === 'ios' branch) — replaces old ENABLE_NATIVE_TABS flag tests
// FR3: TAB_SCREENS shared constant
// FR4: NativeTabs navigator render path
// FR5: Legacy Tabs fallback (HapticTab removal)
// FR6: AmbientBackground / NoiseOverlay layout unchanged
//
// 02-platform-split-nav: Platform-split nav (iOS → NativeTabs, Android → FloatingPillTabBar)
//   FR1: Platform split logic
//   FR2: FloatingPillTabBar wiring
//   FR3: Screen content padding
//   FR4: iOS path unchanged
//
// Test strategy:
//   - FR1: JSON parse app.json and verify extra block
//   - FR2-FR6: Source-file static analysis (fs.readFileSync)
//     This matches the established pattern in tabs-layout.test.tsx and layout.test.tsx.
//     Runtime render tests for the tab layout are not viable in jest-expo/node due to
//     react-native-web ThemeContext conflicts with react-test-renderer.

import * as fs from 'fs';
import * as path from 'path';

// ─── File paths ───────────────────────────────────────────────────────────────

const LAYOUT_FILE = path.resolve(__dirname, '../_layout.tsx');
const APP_JSON_FILE = path.resolve(__dirname, '../../../app.json');

// ─── FR1: Feature flags in app.json ──────────────────────────────────────────
// Note: ENABLE_NATIVE_TABS removed from this block — it is now a no-op since
// Platform.OS drives the branch. Only non-navigation flags checked here.

describe('06-native-tabs — FR1: feature flags in app.json', () => {
  let extra: Record<string, unknown>;

  beforeAll(() => {
    const raw = fs.readFileSync(APP_JSON_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    extra = parsed.expo?.extra ?? {};
  });

  it('SC1.2 — app.json expo.extra contains ENABLE_SHARED_ELEMENT_TRANSITIONS: true', () => {
    expect(extra).toHaveProperty('ENABLE_SHARED_ELEMENT_TRANSITIONS', true);
  });

  it('SC1.3 — existing router key inside extra is preserved', () => {
    expect(extra).toHaveProperty('router');
  });

  it('SC1.3 — existing eas key inside extra is preserved', () => {
    expect(extra).toHaveProperty('eas');
    expect((extra.eas as any)?.projectId).toBe('4ad8a6bd-aec2-45a5-935f-5598d47b605d');
  });
});

// ─── FR2: Platform split logic in _layout.tsx ────────────────────────────────
// Replaces old ENABLE_NATIVE_TABS flag read tests.
// Platform.OS === 'ios' is now the branch condition.

describe('06-native-tabs — FR2: platform split logic in _layout.tsx', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('SC2.1 — source uses Platform.OS as the branch condition', () => {
    expect(source).toMatch(/Platform\.OS\s*===\s*['"]ios['"]/);
  });

  it('SC2.2 — source does NOT use USE_NATIVE_TABS or ENABLE_NATIVE_TABS as a branch condition', () => {
    // The flag may still appear as a no-op comment but must not drive an if/ternary
    const code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/if\s*\(\s*USE_NATIVE_TABS/);
    expect(code).not.toMatch(/USE_NATIVE_TABS\s*\?/);
  });

  it('SC2.1 — source imports NativeTabs from expo-router/unstable-native-tabs', () => {
    expect(source).toContain('expo-router/unstable-native-tabs');
  });

  it('SC2.2 — source imports Tabs from expo-router (Android fallback path present)', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bTabs\b[^}]*\}\s*from\s*['"]expo-router['"]/);
  });
});

// ─── FR3: TAB_SCREENS shared constant ────────────────────────────────────────

describe('06-native-tabs — FR3: TAB_SCREENS shared constant', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('SC3.1 — source declares TAB_SCREENS constant', () => {
    expect(source).toMatch(/const\s+TAB_SCREENS\s*=/);
  });

  it('SC3.1 — TAB_SCREENS contains index tab', () => {
    expect(source).toContain("'index'");
  });

  it('SC3.1 — TAB_SCREENS contains overview tab', () => {
    expect(source).toContain("'overview'");
  });

  it('SC3.1 — TAB_SCREENS contains ai tab', () => {
    expect(source).toContain("'ai'");
  });

  it('SC3.1 — TAB_SCREENS contains approvals tab', () => {
    expect(source).toContain("'approvals'");
  });

  it('SC3.4 — TAB_SCREENS uses house.fill icon for Home tab', () => {
    expect(source).toContain('house.fill');
  });

  it('SC3.4 — TAB_SCREENS uses chart.bar.fill icon for Overview tab', () => {
    expect(source).toContain('chart.bar.fill');
  });

  it('SC3.4 — TAB_SCREENS uses sparkles icon for AI tab', () => {
    expect(source).toContain('sparkles');
  });

  it('SC3.4 — TAB_SCREENS uses checkmark.circle.fill icon for Requests tab', () => {
    expect(source).toContain('checkmark.circle.fill');
  });

  it('SC3.5 — TAB_SCREENS has title Home', () => {
    expect(source).toContain("'Home'");
  });

  it('SC3.5 — TAB_SCREENS has title Overview', () => {
    expect(source).toContain("'Overview'");
  });

  it('SC3.5 — TAB_SCREENS has title AI', () => {
    expect(source).toContain("'AI'");
  });

  it('SC3.5 — TAB_SCREENS has title Requests', () => {
    expect(source).toContain("'Requests'");
  });
});

// ─── FR4: NativeTabs navigator render path ───────────────────────────────────

describe('06-native-tabs — FR4: NativeTabs render path', () => {
  let source: string;
  let code: string; // comments stripped

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC4.1 — NativeTabs imported from expo-router/unstable-native-tabs', () => {
    expect(source).toContain('expo-router/unstable-native-tabs');
    expect(source).toMatch(/NativeTabs/);
  });

  it('SC4.2 — active tint color uses colors.violet', () => {
    expect(source).toContain('colors.violet');
  });

  it('SC4.3 — inactive tint color uses colors.textMuted', () => {
    expect(source).toContain('colors.textMuted');
  });

  it('SC4.4 — NativeTabs path does NOT use tabBarBackground (unsupported)', () => {
    expect(code).not.toContain('tabBarBackground');
  });

  it('SC4.5 / SC4.6 — badge logic derives count from items.length with undefined fallback', () => {
    expect(source).toContain('items.length');
    expect(source).toMatch(/items\.length\s*>\s*0\s*\?\s*items\.length\s*:\s*undefined/);
    expect(source).toContain('tabBarBadge');
  });

});

// ─── FR5: Legacy Tabs fallback — HapticTab removal ───────────────────────────

describe('06-native-tabs — FR5: legacy Tabs fallback / HapticTab removal', () => {
  let source: string;
  let code: string; // comments stripped

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC5.3 — source does NOT import HapticTab', () => {
    expect(code).not.toContain('haptic-tab');
    expect(code).not.toContain('HapticTab');
  });

  it('SC5.2 — source does NOT use tabBarButton: HapticTab', () => {
    expect(code).not.toMatch(/tabBarButton\s*:\s*HapticTab/);
  });

  it('SC5.1 — legacy Tabs import is present (Android path)', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bTabs\b[^}]*\}\s*from\s*['"]expo-router['"]/);
  });

  it('SC5.4 — tabBarStyle is present (Android path)', () => {
    expect(source).toContain('tabBarStyle');
  });
});

// ─── FR6: NoiseOverlay layout unchanged ──────────────────────────────────────

describe('06-native-tabs — FR6: NoiseOverlay / outer wrapper unchanged', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('SC6.2 — outer View with flex: 1 is preserved', () => {
    expect(source).toContain('flex: 1');
  });

  it('SC6.1 — NoiseOverlay is imported', () => {
    expect(source).toContain('NoiseOverlay');
    expect(source).toContain('@/src/components/NoiseOverlay');
  });

  it('SC6.1 — <NoiseOverlay /> JSX element is present', () => {
    expect(source).toMatch(/<NoiseOverlay\s*\/>/);
  });

  it('SC6.3 — useHistoryBackfill hook is imported and called', () => {
    expect(source).toContain('useHistoryBackfill');
  });

  it('SC6.3 — useHoursData hook is imported and called', () => {
    expect(source).toContain('useHoursData');
  });

  it('SC6.3 — useAIData hook is imported and called', () => {
    expect(source).toContain('useAIData');
  });

  it('SC6.3 — useApprovalItems hook is imported and called', () => {
    expect(source).toContain('useApprovalItems');
  });

  it('SC6.3 — useConfig hook is imported and called', () => {
    expect(source).toContain('useConfig');
  });

  it('SC6.3 — useWidgetSync hook is imported and called', () => {
    expect(source).toContain('useWidgetSync');
  });
});

// ─── 02-platform-split-nav: FR1 — Platform Split Logic ───────────────────────

describe('02-platform-split-nav — FR1: platform split logic', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC1.1 — source does NOT use USE_NATIVE_TABS or ENABLE_NATIVE_TABS as a branch condition', () => {
    expect(code).not.toMatch(/if\s*\(\s*USE_NATIVE_TABS/);
    expect(code).not.toMatch(/USE_NATIVE_TABS\s*\?/);
    expect(code).not.toMatch(/if\s*\(\s*ENABLE_NATIVE_TABS/);
  });

  it('SC1.2 — source uses Platform.OS === ios as the branch', () => {
    expect(source).toMatch(/Platform\.OS\s*===\s*['"]ios['"]/);
  });

  it('SC1.3 — iOS branch contains NativeTabs render', () => {
    expect(source).toMatch(/NativeTabs/);
  });

  it('SC1.4 — non-iOS branch contains Tabs with tabBar prop', () => {
    expect(source).toMatch(/tabBar\s*=/);
  });

  it('SC1.5 — Platform is imported from react-native', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bPlatform\b[^}]*\}\s*from\s*['"]react-native['"]/);
  });
});

// ─── 02-platform-split-nav: FR2 — FloatingPillTabBar Wiring ──────────────────

describe('02-platform-split-nav — FR2: FloatingPillTabBar wiring', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('SC2.1 — FloatingPillTabBar imported from @/src/components/FloatingPillTabBar', () => {
    expect(source).toContain('FloatingPillTabBar');
    expect(source).toContain('@/src/components/FloatingPillTabBar');
  });

  it('SC2.2 — tabBar prop present referencing FloatingPillTabBar', () => {
    expect(source).toMatch(/tabBar\s*=\s*\{/);
    expect(source).toContain('FloatingPillTabBar');
  });

  it('SC2.3 — tintColor={colors.violet} passed to FloatingPillTabBar', () => {
    // tintColor with colors.violet must appear (used in both NativeTabs and FloatingPillTabBar)
    expect(source).toContain('tintColor');
    expect(source).toContain('colors.violet');
  });

  it('SC2.4 — inactiveTintColor={colors.textMuted} passed to FloatingPillTabBar', () => {
    expect(source).toContain('inactiveTintColor');
    expect(source).toContain('colors.textMuted');
  });

  it('SC2.5 — badgeCounts prop passed to FloatingPillTabBar', () => {
    expect(source).toContain('badgeCounts');
  });

  it('SC2.6 — TAB_SCREENS.map drives Android Tabs screens', () => {
    expect(source).toMatch(/TAB_SCREENS\.map/);
  });
});

// ─── 02-platform-split-nav: FR3 — Screen Content Padding ─────────────────────

describe('02-platform-split-nav — FR3: screen content padding', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('SC3.1 — PILL_BOTTOM_OFFSET constant is defined', () => {
    expect(source).toMatch(/PILL_BOTTOM_OFFSET\s*=/);
  });

  it('SC3.1 — PILL_BOTTOM_OFFSET value is >= 100', () => {
    const match = source.match(/PILL_BOTTOM_OFFSET\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const value = parseInt(match![1], 10);
    expect(value).toBeGreaterThanOrEqual(100);
  });

  it('SC3.2 — contentStyle includes paddingBottom: PILL_BOTTOM_OFFSET', () => {
    expect(source).toContain('contentStyle');
    expect(source).toContain('paddingBottom');
    expect(source).toContain('PILL_BOTTOM_OFFSET');
  });

  it('SC3.3 — tabBarStyle display none present to hide default tab bar', () => {
    expect(source).toContain("display: 'none'");
  });

  it('SC3.4 — headerShown: false present in Android screenOptions', () => {
    expect(source).toContain('headerShown: false');
  });
});

// ─── 02-platform-split-nav: FR4 — iOS Path Unchanged ────────────────────────

describe('02-platform-split-nav — FR4: iOS NativeTabs path unchanged', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('SC4.1 — NativeTabs receives tintColor={colors.violet}', () => {
    expect(source).toMatch(/tintColor=\{colors\.violet\}/);
  });

  it('SC4.2 — NativeTabs receives iconColor with default and selected', () => {
    expect(source).toContain('iconColor');
    expect(source).toContain('default');
    expect(source).toContain('selected');
  });

  it('SC4.3 — NativeTabs receives blurEffect="systemUltraThinMaterialDark"', () => {
    expect(source).toContain('blurEffect');
    expect(source).toContain('systemUltraThinMaterialDark');
  });

  it('SC4.4 — NativeTabs receives backgroundColor prop', () => {
    expect(source).toContain('backgroundColor');
  });

  it('SC4.5 — NativeTabs receives shadowColor="transparent"', () => {
    expect(source).toContain('shadowColor');
    expect(source).toContain('transparent');
  });

  it('SC4.6 — NoiseOverlay is rendered (iOS path)', () => {
    expect(source).toMatch(/<NoiseOverlay\s*\/>/);
  });

  it('SC4.7 — NativeTabs.Trigger.Badge approval badge logic present', () => {
    expect(source).toContain('NativeTabs.Trigger.Badge');
    expect(source).toContain('approvalBadge');
  });
});
