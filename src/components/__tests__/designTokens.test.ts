// Tests: design token migration (01-design-tokens)
// FR1: Tailwind font token migration — display-* → SpaceGrotesk, add mono/*
// FR2: Text color desaturation — textPrimary/Secondary/Muted
// FR3: Font loading in _layout.tsx — SpaceGrotesk + SpaceMono in useFonts
// FR4: MetricValue proportional letterSpacing formula
//
// Strategy:
// - FR1/FR2 tailwind: require() the config file directly (CommonJS module)
// - FR2 colors.ts: require() the compiled module
// - FR3: source-file static analysis (useFonts is a hook — can't unit test the call directly)
// - FR4: source-file static analysis (letterSpacing style is on a raw Text node;
//   NativeWind v4 transforms classNames to hashed IDs in jest/node env, so we
//   assert the formula from the source rather than runtime render)
//
// Note: SC2.2 (useAnimatedProps) in MetricValue.test.tsx was written for a prior
// count-up implementation. MetricValue now uses useAnimatedStyle + opacity fade.
// This test file covers the 01-design-tokens additions only.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

const TAILWIND_CONFIG_FILE = path.resolve(ROOT, 'tailwind.config.js');
const COLORS_FILE = path.resolve(ROOT, 'src/lib/colors.ts');
const LAYOUT_FILE = path.resolve(ROOT, 'app/_layout.tsx');
const METRIC_VALUE_FILE = path.resolve(ROOT, 'src/components/MetricValue.tsx');

// ─── FR1: Tailwind font token migration ──────────────────────────────────────

describe('FR1 — Tailwind font tokens: display-* → SpaceGrotesk', () => {
  let config: any;

  beforeAll(() => {
    // Clear require cache so we always read the live file
    delete require.cache[require.resolve(TAILWIND_CONFIG_FILE)];
    config = require(TAILWIND_CONFIG_FILE);
  });

  const fonts = () => config.theme.extend.fontFamily;

  it('SC1.1 — display maps to SpaceGrotesk_700Bold', () => {
    expect(fonts()['display']).toEqual(['SpaceGrotesk_700Bold']);
  });

  it('SC1.2 — display-bold maps to SpaceGrotesk_700Bold', () => {
    expect(fonts()['display-bold']).toEqual(['SpaceGrotesk_700Bold']);
  });

  it('SC1.3 — display-extrabold maps to SpaceGrotesk_700Bold (optical weight reduction 800→700)', () => {
    expect(fonts()['display-extrabold']).toEqual(['SpaceGrotesk_700Bold']);
  });

  it('SC1.4 — display-medium maps to SpaceGrotesk_500Medium', () => {
    expect(fonts()['display-medium']).toEqual(['SpaceGrotesk_500Medium']);
  });

  it('SC1.5 — display-semibold maps to SpaceGrotesk_600SemiBold', () => {
    expect(fonts()['display-semibold']).toEqual(['SpaceGrotesk_600SemiBold']);
  });

  it('SC1.6 — mono maps to SpaceMono_400Regular (new token)', () => {
    expect(fonts()['mono']).toEqual(['SpaceMono_400Regular']);
  });

  it('SC1.7 — mono-bold maps to SpaceMono_700Bold (new token)', () => {
    expect(fonts()['mono-bold']).toEqual(['SpaceMono_700Bold']);
  });

  it('SC1.8a — sans still maps to Inter_400Regular (no regression)', () => {
    expect(fonts()['sans']).toEqual(['Inter_400Regular']);
  });

  it('SC1.8b — sans-medium still maps to Inter_500Medium (no regression)', () => {
    expect(fonts()['sans-medium']).toEqual(['Inter_500Medium']);
  });

  it('SC1.8c — sans-semibold still maps to Inter_600SemiBold (no regression)', () => {
    expect(fonts()['sans-semibold']).toEqual(['Inter_600SemiBold']);
  });

  it('SC1.8d — sans-bold still maps to Inter_700Bold (no regression)', () => {
    expect(fonts()['sans-bold']).toEqual(['Inter_700Bold']);
  });

  it('SC1.8e — body still maps to Inter_400Regular (no regression)', () => {
    expect(fonts()['body']).toEqual(['Inter_400Regular']);
  });

  it('SC1.8f — body-light still maps to Inter_300Light (no regression)', () => {
    expect(fonts()['body-light']).toEqual(['Inter_300Light']);
  });

  it('SC1.8g — body-medium still maps to Inter_500Medium (no regression)', () => {
    expect(fonts()['body-medium']).toEqual(['Inter_500Medium']);
  });

  it('SC1.9 — no display-* token contains an Inter font name', () => {
    const displayTokens = Object.entries(fonts())
      .filter(([key]) => key.startsWith('display-') || key === 'display')
      .map(([, val]) => (val as string[]).join(','));
    for (const val of displayTokens) {
      expect(val).not.toMatch(/Inter_/);
    }
  });
});

// ─── FR2a: Tailwind text color desaturation ───────────────────────────────────

describe('FR2a — tailwind.config.js text color desaturation', () => {
  let config: any;

  beforeAll(() => {
    delete require.cache[require.resolve(TAILWIND_CONFIG_FILE)];
    config = require(TAILWIND_CONFIG_FILE);
  });

  const colors = () => config.theme.extend.colors;

  it('SC2.1 — textPrimary is #E0E0E0', () => {
    expect(colors().textPrimary).toBe('#E0E0E0');
  });

  it('SC2.2 — textSecondary is #A0A0A0', () => {
    expect(colors().textSecondary).toBe('#A0A0A0');
  });

  it('SC2.3 — textMuted is #757575', () => {
    expect(colors().textMuted).toBe('#757575');
  });

  it('SC2.7a — gold is still #E8C97A (accent colors unchanged)', () => {
    expect(colors().gold).toBe('#E8C97A');
  });

  it('SC2.7b — cyan is still #00C2FF (accent colors unchanged)', () => {
    expect(colors().cyan).toBe('#00C2FF');
  });

  it('SC2.7c — violet is still #A78BFA (accent colors unchanged)', () => {
    expect(colors().violet).toBe('#A78BFA');
  });
});

// ─── FR2b: colors.ts text color desaturation ─────────────────────────────────

describe('FR2b — src/lib/colors.ts text color desaturation', () => {
  let colors: any;

  beforeAll(() => {
    delete require.cache[require.resolve(COLORS_FILE)];
    // colors.ts is a TS module — use require with transform from jest-expo/node
    ({ colors } = require(COLORS_FILE));
  });

  it('SC2.4 — textPrimary is #E0E0E0', () => {
    expect(colors.textPrimary).toBe('#E0E0E0');
  });

  it('SC2.5 — textSecondary is #A0A0A0', () => {
    expect(colors.textSecondary).toBe('#A0A0A0');
  });

  it('SC2.6 — textMuted is #757575', () => {
    expect(colors.textMuted).toBe('#757575');
  });

  it('SC2.7 — gold is still #E8C97A (accent unchanged)', () => {
    expect(colors.gold).toBe('#E8C97A');
  });
});

// ─── FR2c: sync invariant — tailwind and colors.ts must match ────────────────

describe('FR2c — tailwind.config.js and colors.ts text token sync', () => {
  let twConfig: any;
  let colors: any;

  beforeAll(() => {
    delete require.cache[require.resolve(TAILWIND_CONFIG_FILE)];
    delete require.cache[require.resolve(COLORS_FILE)];
    twConfig = require(TAILWIND_CONFIG_FILE);
    ({ colors } = require(COLORS_FILE));
  });

  it('SC2.8a — textPrimary matches in both files', () => {
    expect(twConfig.theme.extend.colors.textPrimary).toBe(colors.textPrimary);
  });

  it('SC2.8b — textSecondary matches in both files', () => {
    expect(twConfig.theme.extend.colors.textSecondary).toBe(colors.textSecondary);
  });

  it('SC2.8c — textMuted matches in both files', () => {
    expect(twConfig.theme.extend.colors.textMuted).toBe(colors.textMuted);
  });
});

// ─── FR3: Font loading in _layout.tsx (source-file analysis) ─────────────────
//
// useFonts is a React hook — cannot be unit tested directly.
// We assert the source file contains the correct imports and font keys.

describe('FR3 — _layout.tsx font loading', () => {
  let source: string;
  let noComments: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    noComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  // SpaceGrotesk imports
  it('SC3.1a — imports SpaceGrotesk_400Regular from @expo-google-fonts/space-grotesk', () => {
    expect(source).toContain('SpaceGrotesk_400Regular');
    expect(source).toMatch(/@expo-google-fonts\/space-grotesk/);
  });

  it('SC3.1b — imports SpaceGrotesk_500Medium from @expo-google-fonts/space-grotesk', () => {
    expect(source).toContain('SpaceGrotesk_500Medium');
  });

  it('SC3.1c — imports SpaceGrotesk_600SemiBold from @expo-google-fonts/space-grotesk', () => {
    expect(source).toContain('SpaceGrotesk_600SemiBold');
  });

  it('SC3.1d — imports SpaceGrotesk_700Bold from @expo-google-fonts/space-grotesk', () => {
    expect(source).toContain('SpaceGrotesk_700Bold');
  });

  // SpaceMono imports
  it('SC3.2a — imports SpaceMono_400Regular from @expo-google-fonts/space-mono', () => {
    expect(source).toContain('SpaceMono_400Regular');
    expect(source).toMatch(/@expo-google-fonts\/space-mono/);
  });

  it('SC3.2b — imports SpaceMono_700Bold from @expo-google-fonts/space-mono', () => {
    expect(source).toContain('SpaceMono_700Bold');
  });

  // useFonts call contains all new variants
  it('SC3.3a — useFonts call contains SpaceGrotesk_700Bold key', () => {
    // useFonts({ ... SpaceGrotesk_700Bold, ... }) — key and value are the same variable name
    expect(noComments).toMatch(/useFonts\s*\(\s*\{[\s\S]*?SpaceGrotesk_700Bold[\s\S]*?\}/);
  });

  it('SC3.3b — useFonts call contains SpaceMono_400Regular key', () => {
    expect(noComments).toMatch(/useFonts\s*\(\s*\{[\s\S]*?SpaceMono_400Regular[\s\S]*?\}/);
  });

  it('SC3.3c — useFonts call contains SpaceMono_700Bold key', () => {
    expect(noComments).toMatch(/useFonts\s*\(\s*\{[\s\S]*?SpaceMono_700Bold[\s\S]*?\}/);
  });

  // Existing Inter variants still present (no regressions)
  it('SC3.4a — useFonts still contains Inter_300Light (no regression)', () => {
    expect(noComments).toMatch(/useFonts\s*\(\s*\{[\s\S]*?Inter_300Light[\s\S]*?\}/);
  });

  it('SC3.4b — useFonts still contains Inter_700Bold (no regression)', () => {
    expect(noComments).toMatch(/useFonts\s*\(\s*\{[\s\S]*?Inter_700Bold[\s\S]*?\}/);
  });

  it('SC3.4c — useFonts still contains Inter_800ExtraBold (no regression)', () => {
    expect(noComments).toMatch(/useFonts\s*\(\s*\{[\s\S]*?Inter_800ExtraBold[\s\S]*?\}/);
  });

  // No duplicates — count occurrences of each font name in source
  it('SC3.5a — SpaceGrotesk_700Bold appears exactly once in useFonts object', () => {
    // Count matches in the useFonts block only (not imports line)
    const useFontsBlock = noComments.match(/useFonts\s*\(\s*\{([\s\S]*?)\}\s*\)/)?.[1] ?? '';
    const count = (useFontsBlock.match(/SpaceGrotesk_700Bold/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('SC3.5b — SpaceMono_400Regular appears exactly once in useFonts object', () => {
    const useFontsBlock = noComments.match(/useFonts\s*\(\s*\{([\s\S]*?)\}\s*\)/)?.[1] ?? '';
    const count = (useFontsBlock.match(/SpaceMono_400Regular/g) ?? []).length;
    expect(count).toBe(1);
  });

  // FOUT prevention
  it('SC3.6 — SplashScreen.preventAutoHideAsync() is called', () => {
    expect(noComments).toContain('SplashScreen.preventAutoHideAsync()');
  });

  it('SC3.7 — isLoading || !fontsLoaded guard is present', () => {
    expect(noComments).toMatch(/isLoading\s*\|\|\s*!fontsLoaded/);
  });
});

// ─── FR4: MetricValue proportional letterSpacing formula (source analysis) ───
//
// The letterSpacing style is set inline on a raw React Native Text node.
// NativeWind v4 does not affect this; however jest-expo/node env makes
// runtime style retrieval unreliable (style may be registered as a numeric ID).
// Source analysis is the correct approach here, matching the pattern used in
// MetricValue.test.tsx and Card.test.tsx.

describe('FR4 — MetricValue proportional letterSpacing formula', () => {
  let source: string;
  let noComments: string;

  beforeAll(() => {
    source = fs.readFileSync(METRIC_VALUE_FILE, 'utf8');
    noComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC4.1 — source contains fontVariant: [\'tabular-nums\']', () => {
    expect(source).toMatch(/fontVariant\s*:\s*\[\s*['"]tabular-nums['"]\s*\]/);
  });

  it('SC4.2 — source computes letterSpacing as -fontSize * 0.02', () => {
    // The variable must be assigned as a formula derived from fontSize (not a fixed literal).
    // Implementation may use shorthand property { letterSpacing } in the style object.
    expect(noComments).toMatch(/letterSpacing\s*=\s*-\s*fontSize\s*\*\s*0\.02/);
  });

  it('SC4.3 — TAILWIND_FONT_SIZES map contains text-4xl → 36', () => {
    // Check both the key and value appear near each other in the map
    expect(source).toMatch(/'text-4xl'\s*:\s*36/);
  });

  it('SC4.4 — TAILWIND_FONT_SIZES map contains text-5xl → 48', () => {
    expect(source).toMatch(/'text-5xl'\s*:\s*48/);
  });

  it('SC4.5 — source retains font-display-extrabold className on hero Text node', () => {
    expect(source).toContain('font-display-extrabold');
  });

  it('SC4.7a — TAILWIND_FONT_SIZES map contains text-3xl → 30', () => {
    expect(source).toMatch(/'text-3xl'\s*:\s*30/);
  });

  it('SC4.7b — source extracts base size class from sizeClass prop', () => {
    // Derived from sizeClass — must read from the prop, not a hardcoded value
    expect(source).toMatch(/sizeClass/);
    expect(source).toContain('TAILWIND_FONT_SIZES');
  });

  it('SC4.7c — source uses fallback 36 for unknown sizeClass', () => {
    // The ?? 36 fallback pattern
    expect(noComments).toMatch(/TAILWIND_FONT_SIZES\[.*\]\s*\?\?\s*36/);
  });

  it('SC4.6 — source does not use the fixed letterSpacing: -0.5 (formula replaces it)', () => {
    expect(noComments).not.toMatch(/letterSpacing\s*:\s*-0\.5/);
  });
});
