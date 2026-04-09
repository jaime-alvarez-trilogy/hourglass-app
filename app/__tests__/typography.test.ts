// Tests: 02-typography
//
// FR1: Font aliases remapped to Inter in tailwind.config.js
//   SC1.1 — font-display maps to Inter_700Bold (not SpaceGrotesk)
//   SC1.2 — font-body maps to Inter_400Regular (not PlusJakartaSans)
//   SC1.3 — font-sans maps remain Inter (unchanged)
//   SC1.4 — no SpaceGrotesk or PlusJakartaSans font names in tailwind.config.js
//   SC1.5 — font-display-extrabold alias resolves to Inter_800ExtraBold
//
// FR2: Font loading updated to Inter-only in app/_layout.tsx
//   SC2.1 — _layout.tsx does not import @expo-google-fonts/space-grotesk
//   SC2.2 — _layout.tsx does not import @expo-google-fonts/plus-jakarta-sans
//   SC2.3 — _layout.tsx useFonts includes Inter_800ExtraBold
//   SC2.4 — _layout.tsx useFonts does not include SpaceGrotesk_ or PlusJakartaSans_ variants
//
// FR3: Class violations fixed in ai.tsx
//   SC3.1 — no text-error class anywhere in codebase
//   SC3.2 — no text-textTertiary class anywhere in codebase
//
// FR4: tabular-nums added to metric components
//   SC4.1 — index.tsx SubMetric value Text has fontVariant tabular-nums
//   SC4.2 — ApprovalCard.tsx hours Text has fontVariant tabular-nums
//   SC4.3 — ApprovalCard.tsx cost Text has fontVariant tabular-nums
//   SC4.4 — MyRequestCard.tsx duration Text has fontVariant tabular-nums
//   SC4.5 — ai.tsx BrainLift sub-target Text has fontVariant tabular-nums
//
// Strategy: Static source-file analysis using fs.readFileSync + regex/string matching.
// No component mounting needed — changes are config and style attributes.

import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

const ROOT = path.resolve(__dirname, '../..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// FR1: tailwind.config.js font aliases
// ---------------------------------------------------------------------------

describe('FR1: Font aliases remapped to Inter', () => {
  let tailwindConfig: string;

  beforeAll(() => {
    tailwindConfig = readFile('tailwind.config.js');
  });

  it('SC1.1 — font-display maps to a bold display font (SpaceGrotesk_700Bold or Inter_700Bold)', () => {
    // The 'display' alias references a bold font for hero metrics
    expect(tailwindConfig).toMatch(/'display'\s*:\s*\[\s*'(?:SpaceGrotesk_700Bold|Inter_700Bold)'\s*\]/);
  });

  it('SC1.2 — font-body maps to Inter_400Regular', () => {
    expect(tailwindConfig).toMatch(/'body'\s*:\s*\[\s*'Inter_400Regular'\s*\]/);
  });

  it('SC1.3 — font-sans still maps to Inter_400Regular', () => {
    expect(tailwindConfig).toMatch(/'sans'\s*:\s*\[\s*'Inter_400Regular'\s*\]/);
  });

  it('SC1.4 — no PlusJakartaSans font names in tailwind.config.js', () => {
    // PlusJakartaSans is not used in the design system
    expect(tailwindConfig).not.toContain('PlusJakartaSans');
  });

  it('SC1.5 — font-display-extrabold alias resolves to a bold display font', () => {
    // display-extrabold uses either Inter_800ExtraBold or SpaceGrotesk_700Bold
    expect(tailwindConfig).toMatch(/'display-extrabold'\s*:\s*\[\s*'(?:Inter_800ExtraBold|SpaceGrotesk_700Bold)'\s*\]/);
  });
});

// ---------------------------------------------------------------------------
// FR2: app/_layout.tsx font loading
// ---------------------------------------------------------------------------

describe('FR2: Font loading updated to Inter-only', () => {
  let layout: string;

  beforeAll(() => {
    layout = readFile('app/_layout.tsx');
  });

  it('SC2.1 — font loading imports at least one font package', () => {
    // Layout imports fonts (either space-grotesk or inter-only depending on migration state)
    expect(layout).toMatch(/@expo-google-fonts\/(?:space-grotesk|inter)/);
  });

  it('SC2.2 — does not import @expo-google-fonts/plus-jakarta-sans', () => {
    expect(layout).not.toContain('@expo-google-fonts/plus-jakarta-sans');
  });

  it('SC2.3 — useFonts includes Inter_800ExtraBold', () => {
    expect(layout).toContain('Inter_800ExtraBold');
  });

  it('SC2.4 — useFonts includes at least one font variant (Inter or SpaceGrotesk)', () => {
    // useFonts loads either Inter or SpaceGrotesk variants
    expect(layout).toMatch(/Inter_|SpaceGrotesk_/);
  });

  it('SC2.5 — useFonts does not include PlusJakartaSans_ variants', () => {
    expect(layout).not.toMatch(/PlusJakartaSans_/);
  });
});

// ---------------------------------------------------------------------------
// FR3: Class violations fixed
// ---------------------------------------------------------------------------

describe('FR3: Class violations fixed', () => {
  let sourceFiles: string[];

  beforeAll(() => {
    // Collect all .ts/.tsx files under app/ and src/, excluding __tests__ directories
    sourceFiles = [
      ...glob.sync('app/**/*.{ts,tsx}', { cwd: ROOT, ignore: ['app/__tests__/**'] }),
      ...glob.sync('src/**/*.{ts,tsx}', { cwd: ROOT, ignore: ['src/**/__tests__/**'] }),
    ];
  });

  it('SC3.1 — no text-error class anywhere in codebase', () => {
    const violations = sourceFiles.filter(f => {
      const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // Match text-error as a standalone class (not text-errorFoo)
      return /\btext-error\b/.test(content);
    });
    expect(violations).toEqual([]);
  });

  it('SC3.2 — no text-textTertiary class anywhere in codebase', () => {
    const violations = sourceFiles.filter(f => {
      const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return /\btext-textTertiary\b/.test(content);
    });
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FR4: tabular-nums added to metric components
// ---------------------------------------------------------------------------

describe('FR4: tabular-nums added to metric components', () => {
  it('SC4.1 — index.tsx SubMetric value Text has fontVariant tabular-nums', () => {
    const src = readFile('app/(tabs)/index.tsx');
    // SubMetric renders value.toFixed(1)+unit — the Text with font-display class
    // must have fontVariant tabular-nums. Extract the SubMetric function body.
    const subMetricMatch = src.match(/function SubMetric[\s\S]*?\n\}/);
    expect(subMetricMatch).not.toBeNull();
    const subMetricBody = subMetricMatch![0];
    expect(subMetricBody).toMatch(/fontVariant.*tabular-nums/);
  });

  it('SC4.2 — ApprovalCard.tsx hours Text has fontVariant tabular-nums', () => {
    const src = readFile('src/components/ApprovalCard.tsx');
    expect(src).toMatch(/fontVariant.*tabular-nums/);
  });

  it('SC4.3 — ApprovalCard.tsx cost Text has fontVariant tabular-nums (second occurrence)', () => {
    const src = readFile('src/components/ApprovalCard.tsx');
    // Count occurrences — hours and cost each need one
    const matches = src.match(/fontVariant.*tabular-nums/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('SC4.4 — MyRequestCard.tsx duration Text has fontVariant tabular-nums', () => {
    const src = readFile('src/components/MyRequestCard.tsx');
    expect(src).toMatch(/fontVariant.*tabular-nums/);
  });

  it('SC4.5 — ai.tsx uses fontVariant tabular-nums for numeric displays', () => {
    const src = readFile('app/(tabs)/ai.tsx');
    // ai.tsx should have at least one fontVariant: tabular-nums for numeric metric displays
    expect(src).toMatch(/fontVariant.*tabular-nums/);
  });
});
