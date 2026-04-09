// Tests: src/lib/colors.ts (FR1 — design token color constants)
//
// Strategy: static source-file analysis (following NativeWindSmoke pattern).
// We compare hex values directly from tailwind.config.js to confirm sync.
// Runtime import verifies the module loads without error.

import * as fs from 'fs';
import * as path from 'path';

const COLORS_FILE = path.resolve(__dirname, '../../src/lib/colors.ts');
const TAILWIND_FILE = path.resolve(__dirname, '../../tailwind.config.js');

// ---------------------------------------------------------------------------
// FR1 SC: File exists and loads
// ---------------------------------------------------------------------------

describe('colors.ts — FR1: file structure', () => {
  it('FR1: src/lib/colors.ts exists', () => {
    expect(fs.existsSync(COLORS_FILE)).toBe(true);
  });

  it('FR1: module can be required without error', () => {
    expect(() => require('../../src/lib/colors')).not.toThrow();
  });

  it('FR1: exports a `colors` named export', () => {
    const mod = require('../../src/lib/colors');
    expect(mod.colors).toBeDefined();
    expect(typeof mod.colors).toBe('object');
  });

  it('FR1: has no external imports (pure constants — no import/require in source)', () => {
    const source = fs.readFileSync(COLORS_FILE, 'utf8');
    // Allow only type imports from TypeScript (no runtime imports)
    const lines = source.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
    const hasRuntimeImport = lines.some(l =>
      /^\s*import\s+(?!type\s)/.test(l) || /\brequire\s*\(/.test(l)
    );
    expect(hasRuntimeImport).toBe(false);
  });

  it('FR1: file contains sync warning comment referencing tailwind.config.js', () => {
    const source = fs.readFileSync(COLORS_FILE, 'utf8');
    expect(source).toMatch(/tailwind\.config\.js/);
  });

  it('FR1: uses `as const` assertion', () => {
    const source = fs.readFileSync(COLORS_FILE, 'utf8');
    expect(source).toContain('as const');
  });
});

// ---------------------------------------------------------------------------
// FR1 SC: All tokens present
// ---------------------------------------------------------------------------

describe('colors.ts — FR1: all design tokens exported', () => {
  const EXPECTED_TOKENS = [
    'background',
    'surface',
    'surfaceElevated',
    'border',
    'gold',
    'cyan',
    'violet',
    'success',
    'warning',
    'critical',
    'destructive',
    'textPrimary',
    'textSecondary',
    'textMuted',
  ];

  let colors: Record<string, string>;

  beforeAll(() => {
    colors = require('../../src/lib/colors').colors;
  });

  EXPECTED_TOKENS.forEach(token => {
    it(`FR1: exports colors.${token}`, () => {
      expect(colors[token]).toBeDefined();
      expect(typeof colors[token]).toBe('string');
    });

    it(`FR1: colors.${token} is a valid hex color`, () => {
      expect(colors[token]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

// ---------------------------------------------------------------------------
// FR1 SC: Values match tailwind.config.js exactly
// ---------------------------------------------------------------------------

describe('colors.ts — FR1: values match tailwind.config.js', () => {
  // Read tailwind config and extract colors manually for comparison
  const tailwindConfig = require('../../tailwind.config.js');
  const tailwindColors = tailwindConfig.theme.extend.colors as Record<string, string>;

  let colors: Record<string, string>;

  beforeAll(() => {
    colors = require('../../src/lib/colors').colors;
  });

  Object.entries(tailwindColors).forEach(([token, hex]) => {
    it(`FR1: colors.${token} === tailwind "${hex}"`, () => {
      expect(colors[token]).toBe(hex);
    });
  });
});
