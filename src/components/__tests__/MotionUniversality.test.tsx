// Tests: 03-motion-universality — AnimatedPressable on remaining touchables
//
// Strategy: Source-file static analysis for all three FRs.
//   FR1: index.tsx — TouchableOpacity removed, AnimatedPressable added
//   FR2: approvals.tsx — Pressable removed, AnimatedPressable added, tint token fixed
//   FR3: ai.tsx — TouchableOpacity removed, AnimatedPressable added
//
// Static analysis avoids requiring full navigation/data stack mocks.

import * as fs from 'fs';
import * as path from 'path';

const INDEX_FILE = path.resolve(__dirname, '../../../app/(tabs)/index.tsx');
const APPROVALS_FILE = path.resolve(__dirname, '../../../app/(tabs)/approvals.tsx');
const AI_FILE = path.resolve(__dirname, '../../../app/(tabs)/ai.tsx');

// ─── FR1: index.tsx ───────────────────────────────────────────────────────────

describe('FR1: index.tsx — AnimatedPressable migration', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
    // Strip comments for import-checking
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC1.1 — does NOT import TouchableOpacity from react-native', () => {
    // After migration TouchableOpacity should not appear in the react-native import
    expect(code).not.toMatch(/import[\s\S]*?TouchableOpacity[\s\S]*?from\s+['"]react-native['"]/);
  });

  it('SC1.2 — DOES import AnimatedPressable from @/src/components/AnimatedPressable', () => {
    expect(source).toMatch(/import[\s\S]*?AnimatedPressable[\s\S]*?from.*AnimatedPressable/);
  });

  it('SC1.3 — AnimatedPressable wraps the settings button (testID="settings-button")', () => {
    expect(source).toMatch(/AnimatedPressable[\s\S]{0,300}testID="settings-button"|testID="settings-button"[\s\S]{0,100}AnimatedPressable/);
  });

  it('SC1.4 — AnimatedPressable wraps the error-banner retry button (testID="retry-button")', () => {
    expect(source).toMatch(/AnimatedPressable[\s\S]{0,300}testID="retry-button"|testID="retry-button"[\s\S]{0,100}AnimatedPressable/);
  });

  it('SC1.5 — no plain <TouchableOpacity used for settings or retry buttons in JSX', () => {
    // Verify neither button site uses TouchableOpacity
    // (generic check — TouchableOpacity should not appear at all after migration)
    expect(source).not.toContain('<TouchableOpacity');
  });
});

// ─── FR2: approvals.tsx ───────────────────────────────────────────────────────

describe('FR2: approvals.tsx — AnimatedPressable migration + tint token', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC2.1 — does NOT import Pressable from react-native', () => {
    expect(code).not.toMatch(/import[\s\S]*?\bPressable\b[\s\S]*?from\s+['"]react-native['"]/);
  });

  it('SC2.2 — DOES import AnimatedPressable', () => {
    expect(source).toMatch(/import[\s\S]*?AnimatedPressable[\s\S]*?from.*AnimatedPressable/);
  });

  it('SC2.3 — Approve All button uses AnimatedPressable (handleApproveAll wired)', () => {
    // handleApproveAll must appear as onPress on an AnimatedPressable
    expect(source).toMatch(/AnimatedPressable[\s\S]{0,300}handleApproveAll|handleApproveAll[\s\S]{0,300}AnimatedPressable/);
  });

  it('SC2.4a — team error Retry uses AnimatedPressable (teamRefetch wired)', () => {
    expect(source).toMatch(/AnimatedPressable[\s\S]{0,200}teamRefetch|teamRefetch[\s\S]{0,200}AnimatedPressable/);
  });

  it('SC2.4b — my-requests error Retry uses AnimatedPressable (myRefetch wired)', () => {
    expect(source).toMatch(/AnimatedPressable[\s\S]{0,200}myRefetch|myRefetch[\s\S]{0,200}AnimatedPressable/);
  });

  it('SC2.5 — RefreshControl tintColor does NOT contain hardcoded #10B981', () => {
    expect(source).not.toContain('#10B981');
  });

  it('SC2.6 — RefreshControl tintColor references colors.success', () => {
    expect(source).toContain('colors.success');
  });

  it('SC2.7 — no plain <Pressable in JSX (all migrated)', () => {
    expect(source).not.toContain('<Pressable');
  });
});

// ─── FR3: ai.tsx ─────────────────────────────────────────────────────────────

describe('FR3: ai.tsx — AnimatedPressable migration for error/empty states', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(AI_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC3.1 — does NOT import TouchableOpacity from react-native', () => {
    expect(code).not.toMatch(/import[\s\S]*?TouchableOpacity[\s\S]*?from\s+['"]react-native['"]/);
  });

  it('SC3.2 — DOES import AnimatedPressable from @/src/components/AnimatedPressable', () => {
    expect(source).toMatch(/import[\s\S]*?AnimatedPressable[\s\S]*?from.*AnimatedPressable/);
  });

  it('SC3.3 — AnimatedPressable has testID="relogin-button"', () => {
    // relogin-button must appear within an AnimatedPressable block
    expect(source).toMatch(/AnimatedPressable[\s\S]{0,300}testID="relogin-button"|testID="relogin-button"[\s\S]{0,100}AnimatedPressable/);
  });

  it('SC3.4 — AnimatedPressable has testID="retry-button" (network error state)', () => {
    // retry-button in ai.tsx must be on an AnimatedPressable
    expect(source).toMatch(/AnimatedPressable[\s\S]{0,300}testID="retry-button"|testID="retry-button"[\s\S]{0,100}AnimatedPressable/);
  });

  it('SC3.5 — no plain <TouchableOpacity in JSX (all migrated)', () => {
    expect(source).not.toContain('<TouchableOpacity');
  });

  it('SC3.6 — AnimatedPressable count >= 3 (one per error/empty state button)', () => {
    const matches = source.match(/<AnimatedPressable/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});
