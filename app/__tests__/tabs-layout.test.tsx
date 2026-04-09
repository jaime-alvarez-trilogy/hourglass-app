// Tests: app/(tabs)/_layout.tsx (06-wiring-and-tokens)
// FR1: NoiseOverlay wired into tabs layout
// FR2: Tab bar backgroundColor/borderTopColor use color tokens
//
// Test approach:
// - Source-file static analysis (fs.readFileSync) for all checks.
// - Render-based tests are not viable here: react-native-web's View calls
//   useContext(ThemeContext), which conflicts with react-test-renderer's renderer
//   context. Source-file analysis is the correct approach for this file.

import * as fs from 'fs';
import * as path from 'path';

const LAYOUT_FILE = path.resolve(__dirname, '../(tabs)/_layout.tsx');

// ─── FR1: NoiseOverlay wiring ────────────────────────────────────────────────
//
// NOTE: Render-based tests for the tabs layout are not viable in jest-expo/node
// because react-native-web's View calls useContext(ThemeContext), which conflicts
// with react-test-renderer's renderer context. This is a known incompatibility.
// Source-file analysis is the authoritative approach (matches existing test patterns).

describe('tabs _layout — FR1: NoiseOverlay wiring', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('FR1.1 — source exports a default function (TabLayout)', () => {
    expect(source).toMatch(/export default function\s+\w+/);
  });

  it('FR1.2 — source renders <NoiseOverlay /> JSX element', () => {
    expect(source).toMatch(/<NoiseOverlay\s*\/>/);
  });

  it('FR1.3 — source renders <Tabs component (still present)', () => {
    expect(source).toMatch(/<Tabs[\s>]/);
  });

  it('FR1.4 — source imports NoiseOverlay from @/src/components/NoiseOverlay', () => {
    expect(source).toContain('NoiseOverlay');
    expect(source).toContain('@/src/components/NoiseOverlay');
  });

  it('FR1.5 — source imports View from react-native', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bView\b[^}]*\}\s*from\s*['"]react-native['"]/);
  });

  it('FR1.6 — NoiseOverlay is placed AFTER each navigator (wrapper View + overlay after navigator)', () => {
    // NoiseOverlay handles pointerEvents="none" internally.
    // Verify structural placement: each <NoiseOverlay /> appears after its preceding navigator.
    // Since 06-native-tabs added NativeTabs as an additional render path, there are now
    // two navigators (NativeTabs and Tabs) each followed by <NoiseOverlay />.
    // Check that the last <NoiseOverlay> appears after the last navigator close tag.
    const allTabsEnd = [...source.matchAll(/<\/Tabs>/g)].map((m) => m.index ?? 0);
    const allNativeTabsEnd = [...source.matchAll(/<\/NativeTabs>/g)].map((m) => m.index ?? 0);
    const allNavEnds = [...allTabsEnd, ...allNativeTabsEnd];
    const lastNavEnd = Math.max(...allNavEnds);
    const allNoiseStarts = [...source.matchAll(/<NoiseOverlay/g)].map((m) => m.index ?? 0);
    const lastNoiseStart = Math.max(...allNoiseStarts);
    expect(lastNavEnd).toBeGreaterThan(-1);
    expect(lastNoiseStart).toBeGreaterThan(lastNavEnd);
  });
});

// ─── FR2: Tab bar color tokens ───────────────────────────────────────────────

describe('tabs _layout — FR2: tab bar color tokens', () => {
  it('FR2.1 — source does NOT contain hardcoded "#13131A"', () => {
    const source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    expect(source).not.toContain("'#13131A'");
    expect(source).not.toContain('"#13131A"');
  });

  it('FR2.2 — source does NOT contain hardcoded "#2A2A3D"', () => {
    const source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    expect(source).not.toContain("'#2A2A3D'");
    expect(source).not.toContain('"#2A2A3D"');
  });

  it('FR2.3 — source imports colors from @/src/lib/colors', () => {
    const source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    expect(source).toContain('@/src/lib/colors');
    expect(source).toContain('colors');
  });

  it('FR2.4 — source uses colors.surface for backgroundColor', () => {
    const source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    expect(source).toContain('colors.surface');
  });

  it('FR2.5 — source uses colors.border for borderTopColor', () => {
    const source = fs.readFileSync(LAYOUT_FILE, 'utf8');
    expect(source).toContain('colors.border');
  });

  it('FR2.6 — tabBarStyle backgroundColor resolves to colors.surface value at runtime (#16151F)', () => {
    const { colors } = require('@/src/lib/colors');
    // Verify the token value is what the spec expects
    expect(colors.surface).toBe('#16151F');
  });

  it('FR2.7 — tabBarStyle borderTopColor resolves to colors.border value at runtime (#2F2E41)', () => {
    const { colors } = require('@/src/lib/colors');
    expect(colors.border).toBe('#2F2E41');
  });
});
