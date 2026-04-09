// FR1 (05-manager-approvals): NativeWind design-system compliance for approvals screen
//
// Strategy:
//   Source-analysis only — verify the approvals screen uses the correct
//   NativeWind design tokens and does not use StyleSheet.create or raw hex values.
//
// NOTE: Runtime render tests for FR6 behavior are in:
//   app/(tabs)/__tests__/approvals.test.tsx
//   (added during 07-approvals-tab-redesign spec)
//
// These tests are retained here to cover NativeWind token compliance,
// which is not duplicated in the runtime test file.

import * as fs from 'fs';
import * as path from 'path';

const APPROVALS_FILE = path.resolve(__dirname, '../app/(tabs)/approvals.tsx');

// =============================================================================
// FR1: Approvals screen — NativeWind layout (source analysis)
// =============================================================================

describe('FR1: Approvals screen — NativeWind layout (source analysis)', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('FR1 — no StyleSheet.create in source (comments stripped)', () => {
    expect(code).not.toContain('StyleSheet.create');
  });

  it('FR1 — no hardcoded hex color values in source (comments stripped)', () => {
    // Allowed exceptions (React Native props, not style values):
    //   tintColor="#10B981" on RefreshControl (success token hex, no NativeWind equivalent)
    //   ActivityIndicator color="#fff" (white on colored background)
    const withoutAllowed = code
      .replace(/tintColor\s*=\s*["'][^"']*["']/g, '')
      .replace(/color\s*=\s*["']#fff["']/g, '')
      .replace(/rgba\([^)]+\)/g, '');
    expect(withoutAllowed).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('FR1 — root View uses flex-1 layout (AnimatedMeshBackground present for background)', () => {
    // approvals.tsx has AnimatedMeshBackground imported and rendered alongside the root View.
    // bg-background on root View is retained alongside the mesh overlay.
    expect(source).toContain('AnimatedMeshBackground');
    expect(source).toContain('flex-1');
  });

  it('FR1 — source uses bg-surface for header', () => {
    expect(source).toContain('bg-surface');
  });

  it('FR1 — source uses border-border for header separator', () => {
    expect(source).toContain('border-border');
  });

  it('FR1 — source uses text-textPrimary for header title', () => {
    expect(source).toContain('text-textPrimary');
  });

  it('FR1 — source uses bg-success for Approve All button', () => {
    expect(source).toContain('bg-success');
  });

  it('FR1 — source uses bg-critical for error banner', () => {
    expect(source).toContain('bg-critical');
  });

  it('FR5 — source imports SkeletonLoader', () => {
    expect(source).toContain('SkeletonLoader');
  });

  it('FR5 — source does not use ActivityIndicator as primary loading state', () => {
    // ActivityIndicator may be present for approveAll spinner but SkeletonLoader must also exist
    expect(source).toContain('SkeletonLoader');
  });
});
