// Tests: useHistoryBackfill relocation — 03-backfill-relocation
//
// FR1: Add useHistoryBackfill to _layout.tsx (fire-and-forget)
//   SC1.1 — _layout.tsx imports useHistoryBackfill from @/src/hooks/useHistoryBackfill
//   SC1.2 — TabLayout body calls useHistoryBackfill() without assigning return value
//   SC1.3 — The call appears before the return statement
//
// FR2: Remove useHistoryBackfill from overview.tsx
//   SC2.1 — overview.tsx does NOT import useHistoryBackfill
//   SC2.2 — overview.tsx does NOT call useHistoryBackfill()
//   SC2.3 — overview.tsx calls useOverviewData with one argument (no backfillSnapshots)
//   SC2.4 — No backfillSnapshots variable declared or referenced in overview.tsx
//
// FR3: Remove backfillSnapshots parameter from useOverviewData
//   SC3.1 — useOverviewData signature has no backfillSnapshots parameter
//   SC3.2 — useOverviewData body has no backfillSnapshots identifier
//   SC3.3 — The backfillSnapshots ?? storedSnapshots conditional is removed
//   SC3.5 — useMemo dependency array does not include backfillSnapshots
//
// Strategy: source-level static analysis of file contents.
// No React rendering needed — these are structural/contractual checks.

import * as path from 'path';
import * as fs from 'fs';

// ─── File paths ───────────────────────────────────────────────────────────────

// __dirname is WS/hourglassws/src/hooks/__tests__
// 3 levels up = WS/hourglassws (the project root)
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const LAYOUT_FILE = path.resolve(PROJECT_ROOT, 'app/(tabs)/_layout.tsx');
const OVERVIEW_FILE = path.resolve(PROJECT_ROOT, 'app/(tabs)/overview.tsx');
const HOOK_FILE = path.resolve(PROJECT_ROOT, 'src/hooks/useOverviewData.ts');

// ─── FR1: _layout.tsx imports and calls useHistoryBackfill ───────────────────

describe('FR1 — _layout.tsx: useHistoryBackfill fire-and-forget', () => {
  let layoutSource: string;

  beforeAll(() => {
    layoutSource = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('SC1.1 — imports useHistoryBackfill from @/src/hooks/useHistoryBackfill', () => {
    // Must have an import statement referencing useHistoryBackfill and the correct path
    expect(layoutSource).toMatch(
      /import\s+\{[^}]*useHistoryBackfill[^}]*\}\s+from\s+['"]@\/src\/hooks\/useHistoryBackfill['"]/
    );
  });

  it('SC1.2 — TabLayout body calls useHistoryBackfill() without assigning return value', () => {
    // The call must appear as a standalone statement: `useHistoryBackfill();`
    // NOT as `const x = useHistoryBackfill()` or `return useHistoryBackfill()`
    expect(layoutSource).toMatch(/^\s*useHistoryBackfill\(\s*\)\s*;/m);
    // Must NOT be assigned
    expect(layoutSource).not.toMatch(/=\s*useHistoryBackfill\s*\(/);
  });

  it('SC1.3 — the call appears before the return statement in TabLayout', () => {
    const callIndex = layoutSource.indexOf('useHistoryBackfill()');
    const returnIndex = layoutSource.indexOf('return (');
    expect(callIndex).toBeGreaterThan(-1);
    expect(returnIndex).toBeGreaterThan(-1);
    // Call must come before the JSX return
    expect(callIndex).toBeLessThan(returnIndex);
  });
});

// ─── FR2: overview.tsx does NOT call useHistoryBackfill ───────────────────────

describe('FR2 — overview.tsx: useHistoryBackfill removed', () => {
  let overviewSource: string;

  beforeAll(() => {
    overviewSource = fs.readFileSync(OVERVIEW_FILE, 'utf8');
  });

  it('SC2.1 — overview.tsx does not import useHistoryBackfill', () => {
    expect(overviewSource).not.toMatch(/import.*useHistoryBackfill/);
  });

  it('SC2.2 — overview.tsx does not call useHistoryBackfill()', () => {
    expect(overviewSource).not.toMatch(/useHistoryBackfill\s*\(/);
  });

  it('SC2.3 — overview.tsx calls useOverviewData with only one argument (window)', () => {
    // Must match useOverviewData(window) — exactly one argument
    // The call should NOT have a second argument (no comma after the first arg)
    expect(overviewSource).toMatch(/useOverviewData\s*\(\s*window\s*\)/);
    // Verify there is no two-argument form
    expect(overviewSource).not.toMatch(/useOverviewData\s*\(\s*window\s*,/);
  });

  it('SC2.4 — backfillSnapshots is not declared or referenced in overview.tsx', () => {
    expect(overviewSource).not.toMatch(/backfillSnapshots/);
  });
});

// ─── FR3: useOverviewData has no backfillSnapshots parameter ──────────────────

describe('FR3 — useOverviewData: backfillSnapshots parameter removed', () => {
  let hookSource: string;

  beforeAll(() => {
    hookSource = fs.readFileSync(HOOK_FILE, 'utf8');
  });

  it('SC3.1 — useOverviewData function signature has no backfillSnapshots parameter', () => {
    // Extract the function signature region and verify no backfillSnapshots
    expect(hookSource).not.toMatch(/backfillSnapshots\s*\??\s*:/);
  });

  it('SC3.2 — useOverviewData body has no backfillSnapshots identifier', () => {
    expect(hookSource).not.toMatch(/backfillSnapshots/);
  });

  it('SC3.3 — the backfillSnapshots ?? storedSnapshots conditional is removed', () => {
    // The specific fallback pattern must not exist
    expect(hookSource).not.toMatch(/backfillSnapshots\s*\?\?\s*storedSnapshots/);
    // storedSnapshots alias must also be gone (snapshots should come directly from useWeeklyHistory)
    expect(hookSource).not.toMatch(/snapshots:\s*storedSnapshots/);
  });

  it('SC3.5 — useMemo dependency array does not include backfillSnapshots', () => {
    // Find useMemo deps array and confirm backfillSnapshots is absent
    expect(hookSource).not.toMatch(/\[[\s\S]*?backfillSnapshots[\s\S]*?\]/);
  });

  it('SC3.4 — WeeklySnapshot type import is preserved (still used internally)', () => {
    // WeeklySnapshot is used by useWeeklyHistory return type
    expect(hookSource).toMatch(/WeeklySnapshot/);
  });

  it('SC3.6 (structural) — snapshots comes directly from useWeeklyHistory destructure', () => {
    // After the change: { snapshots, ... } = useWeeklyHistory()
    // NOT { snapshots: storedSnapshots, ... }
    expect(hookSource).toMatch(/\{\s*snapshots\s*[,}]/);
  });
});
