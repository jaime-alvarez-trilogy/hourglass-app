// Tests: app/_layout.tsx (06-wiring-and-tokens)
// FR5: Root layout loading screen — replace '#0D1117' with colors.background,
//      replace '#00FF88' with colors.violet on ActivityIndicator
//
// Test approach:
// - Source-file static analysis (fs.readFileSync) for token checks
// - Verify hardcoded hex values removed and design tokens used

import * as fs from 'fs';
import * as path from 'path';

const LAYOUT_FILE = path.resolve(__dirname, '../_layout.tsx');

describe('root _layout — FR5: loading screen token cleanup', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('FR5.1 — source does NOT contain hardcoded "#0D1117" (old background)', () => {
    expect(source).not.toContain("'#0D1117'");
    expect(source).not.toContain('"#0D1117"');
  });

  it('FR5.2 — source does NOT contain hardcoded "#00FF88" (old spinner color)', () => {
    expect(source).not.toContain("'#00FF88'");
    expect(source).not.toContain('"#00FF88"');
  });

  it('FR5.3 — source imports colors from @/src/lib/colors', () => {
    expect(source).toContain('@/src/lib/colors');
    expect(source).toContain('colors');
  });

  it('FR5.4 — source uses colors.background for loading screen backgroundColor', () => {
    expect(source).toContain('colors.background');
  });

  it('FR5.5 — source uses colors.violet for ActivityIndicator color', () => {
    // Should reference colors.violet in the loading screen
    expect(source).toContain('colors.violet');
  });

  it('FR5.6 — colors.background token value is correct (#0D0C14)', () => {
    const { colors } = require('@/src/lib/colors');
    expect(colors.background).toBe('#0D0C14');
  });

  it('FR5.7 — colors.violet token value is correct (#A78BFA)', () => {
    const { colors } = require('@/src/lib/colors');
    expect(colors.violet).toBe('#A78BFA');
  });

  it('FR5.8 — source still imports ActivityIndicator from react-native', () => {
    expect(source).toContain('ActivityIndicator');
  });
});
