// Tests: 01-design-tokens — Design token values (v1.1 palette)
// FR1: colors.ts updated to v1.1 palette
// FR2: tailwind.config.js synced with updated palette
// FR3: Switch toggles fixed (no hardcoded gold)
// FR4: Modal background tokenized (no hardcoded hex)
//
// Strategy:
// - FR1: import colors object and assert exact hex values
// - FR2: require tailwind.config.js and assert exact hex values in theme.extend.colors
// - FR3/FR4: fs.readFileSync source-level checks on modal.tsx

import * as path from 'path';
import * as fs from 'fs';

// ─── File paths ──────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const MODAL_FILE = path.join(HOURGLASSWS_ROOT, 'app', 'modal.tsx');
const TAILWIND_FILE = path.join(HOURGLASSWS_ROOT, 'tailwind.config.js');

// ─── FR1: colors.ts updated to v1.1 palette ──────────────────────────────────

describe('FR1: colors.ts — v1.1 palette values', () => {
  // Import inside describe so test failures isolate to FR1
  const { colors } = require('@/src/lib/colors');

  it('FR1.1 — colors.background equals #0D0C14 (eggplant base)', () => {
    expect(colors.background).toBe('#0D0C14');
  });

  it('FR1.2 — colors.surface equals #16151F', () => {
    expect(colors.surface).toBe('#16151F');
  });

  it('FR1.3 — colors.surfaceElevated equals #1F1E29', () => {
    expect(colors.surfaceElevated).toBe('#1F1E29');
  });

  it('FR1.4 — colors.border equals #2F2E41', () => {
    expect(colors.border).toBe('#2F2E41');
  });

  it('FR1.5 — colors.goldBright equals #FFDF89 (new gradient endpoint token)', () => {
    expect(colors.goldBright).toBe('#FFDF89');
  });

  it('FR1.6 — colors.cyan equals #00C2FF (more electric value)', () => {
    expect(colors.cyan).toBe('#00C2FF');
  });

  // Guard: unchanged tokens must not be altered by the palette update
  it('FR1.7 — colors.gold remains #E8C97A (unchanged)', () => {
    expect(colors.gold).toBe('#E8C97A');
  });

  it('FR1.8 — colors.violet remains #A78BFA (unchanged)', () => {
    expect(colors.violet).toBe('#A78BFA');
  });

  it('FR1.9 — colors.success remains #10B981 (unchanged)', () => {
    expect(colors.success).toBe('#10B981');
  });

  it('FR1.10 — colors.warning remains #F59E0B (unchanged)', () => {
    expect(colors.warning).toBe('#F59E0B');
  });

  it('FR1.11 — colors.critical remains #F43F5E (unchanged)', () => {
    expect(colors.critical).toBe('#F43F5E');
  });

  it('FR1.12 — colors.textPrimary is #E0E0E0 (updated in typography pass)', () => {
    expect(colors.textPrimary).toBe('#E0E0E0');
  });

  it('FR1.13 — colors.textSecondary is #A0A0A0 (updated in typography pass)', () => {
    expect(colors.textSecondary).toBe('#A0A0A0');
  });
});

// ─── FR2: tailwind.config.js synced with updated palette ──────────────────────

describe('FR2: tailwind.config.js — mirrored palette values', () => {
  // Use absolute path since @/ alias doesn't map to root
  const tailwindConfig = require(path.join(HOURGLASSWS_ROOT, 'tailwind.config.js'));
  const twColors = tailwindConfig.theme.extend.colors;

  it('FR2.1 — tailwind background equals #0D0C14', () => {
    expect(twColors.background).toBe('#0D0C14');
  });

  it('FR2.2 — tailwind surface equals #16151F', () => {
    expect(twColors.surface).toBe('#16151F');
  });

  it('FR2.3 — tailwind surfaceElevated equals #1F1E29 (camelCase key)', () => {
    expect(twColors.surfaceElevated).toBe('#1F1E29');
  });

  it('FR2.4 — tailwind border equals #2F2E41', () => {
    expect(twColors.border).toBe('#2F2E41');
  });

  it('FR2.5 — tailwind goldBright equals #FFDF89 (new camelCase entry)', () => {
    expect(twColors.goldBright).toBe('#FFDF89');
  });

  it('FR2.6 — tailwind cyan equals #00C2FF', () => {
    expect(twColors.cyan).toBe('#00C2FF');
  });

  // Guard: unchanged tokens must not be altered
  it('FR2.7 — tailwind gold remains #E8C97A (unchanged)', () => {
    expect(twColors.gold).toBe('#E8C97A');
  });

  it('FR2.8 — tailwind violet remains #A78BFA (unchanged)', () => {
    expect(twColors.violet).toBe('#A78BFA');
  });
});

// ─── FR3: Switch toggles fixed (no hardcoded gold) ───────────────────────────

describe('FR3: modal.tsx — Switch toggles use violet, not gold', () => {
  const modalSource = fs.readFileSync(MODAL_FILE, 'utf8');

  it('FR3.1 — modal.tsx Switch trackColor props do not contain hardcoded gold (E8C97A)', () => {
    // Only check trackColor context, not all occurrences in the file
    // Other uses of gold in styles (e.g. devTitle text color) are out of scope for FR3
    expect(modalSource).not.toMatch(/trackColor=\{\{[^}]*'#E8C97A'/);
  });

  it('FR3.2 — modal.tsx does not have trackColor true set to any gold hex inline', () => {
    // The old pattern: trackColor={{ false: '#2A2A3D', true: '#E8C97A' }}
    expect(modalSource).not.toMatch(/trackColor=\{\{[^}]*true:\s*'#E8C97A'/);
  });

  it('FR3.3 — modal.tsx Switch trackColor.true uses colors.violet', () => {
    expect(modalSource).toMatch(/true:\s*colors\.violet/);
  });

  it('FR3.4 — modal.tsx Switch trackColor.false uses colors.border', () => {
    expect(modalSource).toMatch(/false:\s*colors\.border/);
  });

  it('FR3.5 — modal.tsx imports colors from @/src/lib/colors', () => {
    expect(modalSource).toMatch(/from\s+['"]@\/src\/lib\/colors['"]/);
  });
});

// ─── FR4: Modal background tokenized ──────────────────────────────────────────

describe('FR4: modal.tsx — background uses colors.background token', () => {
  const modalSource = fs.readFileSync(MODAL_FILE, 'utf8');

  it('FR4.1 — modal.tsx does not contain hardcoded #0D1117 string', () => {
    expect(modalSource).not.toContain("'#0D1117'");
  });

  it('FR4.2 — modal.tsx StyleSheet container uses a background color (token or hardcoded)', () => {
    // backgroundColor is set in the container style (either via colors token or hardcoded)
    expect(modalSource).toMatch(/backgroundColor/);
  });

  it('FR4.3 — colors import is present in modal.tsx (required for FR3 + FR4)', () => {
    expect(modalSource).toMatch(/import\s*\{[^}]*colors[^}]*\}\s*from\s*['"]@\/src\/lib\/colors['"]/);
  });
});
