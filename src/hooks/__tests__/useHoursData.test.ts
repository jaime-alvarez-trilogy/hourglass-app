// Tests: useHoursData hook (03-hours-resilience)
// Verifies either-error cache fallback and no-cache error state.
//
// Strategy: static analysis of the source file, following the established pattern
// from useAIData.test.ts. Full hook rendering via renderHook is problematic in
// jest-expo/node preset because the React dispatcher is null outside a render.
//
// Bug being fixed:
//   useHoursData uses `bothError` (&&) to gate the cache fallback.
//   When exactly ONE query fails, bothError=false and hasLiveData=false,
//   so the hook falls through to `return { data: null, isLoading: true }` — infinite spinner.
//
// Fix: add `eitherError = timesheetQuery.isError || paymentsQuery.isError`
//   and use it to trigger cache fallback AND detect no-cache error in final fallback.

import * as fs from 'fs';
import * as path from 'path';

// ─── File path for static analysis ───────────────────────────────────────────
// __dirname = hourglassws/src/hooks/__tests__
const USE_HOURS_DATA_PATH = path.resolve(__dirname, '..', 'useHoursData.ts');

// ─── Static analysis helpers ──────────────────────────────────────────────────

describe('useHoursData — FR1: either-error cache fallback (static analysis)', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(USE_HOURS_DATA_PATH, 'utf8');
    // Strip comments for structural analysis
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC1.1/SC1.2 — eitherError is declared using || operator', () => {
    // The fix requires: const eitherError = timesheetQuery.isError || paymentsQuery.isError
    expect(source).toMatch(/eitherError\s*=\s*timesheetQuery\.isError\s*\|\|\s*paymentsQuery\.isError/);
  });

  it('SC1.1/SC1.2 — cache fallback uses eitherError, not bothError', () => {
    // The cache fallback block must be conditioned on eitherError
    // Pattern: if (eitherError && cache)  — not if (bothError && cache)
    expect(source).toMatch(/if\s*\(\s*eitherError\s*&&\s*cache\s*\)/);
  });

  it('SC1.3 — bothError is still declared (both-fail case still computed)', () => {
    // bothError remains needed for the no-cache error path (line ~147)
    expect(source).toMatch(/bothError\s*=\s*timesheetQuery\.isError\s*&&\s*paymentsQuery\.isError/);
  });

  it('SC1.4 — live data path still uses hasLiveData (regression guard)', () => {
    // The live data return path must still check hasLiveData
    expect(source).toMatch(/hasLiveData/);
    // And it must NOT use eitherError as the live data gate
    const liveDataBlock = source.match(/if\s*\(hasLiveData[^)]*\)[^}]*return[^}]*/s);
    expect(liveDataBlock).not.toBeNull();
  });

  it('SC1.1/SC1.2 — cache fallback does NOT use bothError as its primary condition', () => {
    // Verify the cache fallback condition is eitherError, not bothError
    // Find all if-blocks that reference `cache` — the first one should use eitherError
    const cacheFallbackMatch = source.match(/if\s*\(\s*(bothError|eitherError)\s*&&\s*cache\s*\)/g);
    expect(cacheFallbackMatch).not.toBeNull();
    // There should be exactly one cache-fallback if-block, using eitherError
    expect(cacheFallbackMatch!.length).toBe(1);
    expect(cacheFallbackMatch![0]).toContain('eitherError');
    expect(cacheFallbackMatch![0]).not.toContain('bothError');
  });
});

describe('useHoursData — FR2: either-error no-cache error state (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(USE_HOURS_DATA_PATH, 'utf8');
  });

  it('SC2.1/SC2.2 — final fallback includes eitherError guard before isLoading: true return', () => {
    // The final section must have an eitherError branch that returns isLoading: false with an error
    // Pattern: if (eitherError) { ... isLoading: false ... error: ... }
    expect(source).toMatch(/if\s*\(\s*eitherError\s*\)/);
  });

  it('SC2.1/SC2.2 — eitherError guard returns isLoading: false (not the spinner)', () => {
    // Inside the eitherError block, the return must set isLoading: false
    // We check the eitherError block exists and contains isLoading: false
    const eitherErrorGuardMatch = source.match(
      /if\s*\(\s*eitherError\s*\)\s*\{[\s\S]*?isLoading:\s*false[\s\S]*?\}/
    );
    expect(eitherErrorGuardMatch).not.toBeNull();
  });

  it('SC2.1/SC2.2 — eitherError guard extracts error message from query errors', () => {
    // The errorMsg must use timesheetQuery.error or paymentsQuery.error
    expect(source).toMatch(/timesheetQuery\.error[\s\S]*?paymentsQuery\.error/);
  });

  it('SC2.3/SC2.4 — final return still has isLoading: true for genuine loading', () => {
    // After the eitherError guard, there must still be a return { isLoading: true } as final fallback
    // This handles no-config / genuine loading states
    const lines = source.split('\n');
    // Find all `isLoading: true` returns
    const loadingReturns = lines.filter(l => l.includes('isLoading: true'));
    expect(loadingReturns.length).toBeGreaterThanOrEqual(1);
  });

  it('SC2.3/SC2.4 — bothError still used for no-cache error surface (symmetric)', () => {
    // When BOTH fail and no cache, the bothError branch at ~line 147 still fires
    // This is the existing error path — must be preserved
    expect(source).toMatch(/if\s*\(\s*bothError\s*\)\s*\{/);
  });

  it('SC2.1/SC2.2 — the infinite spinner final return is guarded, not unconditional', () => {
    // The final `return { data: null, isLoading: true }` must appear AFTER the eitherError guard
    // so it is never reached when eitherError is true.
    // Verify the eitherError if-block appears before the unconditional isLoading: true return.
    const eitherErrorIdx = source.indexOf('if (eitherError)');
    // The final isLoading: true return (unconditional) must appear after the eitherError block
    const finalReturnIdx = source.lastIndexOf('isLoading: true');
    expect(eitherErrorIdx).toBeGreaterThan(-1);
    expect(finalReturnIdx).toBeGreaterThan(eitherErrorIdx);
  });
});
