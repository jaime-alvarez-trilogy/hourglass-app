// Tests: app/(tabs)/index.tsx — 05-earnings-scrub FR3
//
// FR3: Home tab earnings hero scrub sync
//   SC3.1 — scrubEarningsIndex state declared (number | null)
//   SC3.2 — weekLabels computed with getWeekLabels(earningsTrend.length)
//   SC3.3 — hero shows trend[scrubEarningsIndex] when non-null
//   SC3.4 — hero shows data.weeklyEarnings when scrubEarningsIndex is null
//   SC3.5 — sub-label shows week label string during scrub
//   SC3.6 — sub-label shows "this week" when not scrubbing
//   SC3.7 — scrubEarningsIndex=0 shows oldest trend value
//   SC3.8 — empty earningsTrend → no crash, hero shows 0
//   SC3.9 — TrendSparkline receives onScrubChange and weekLabels props
//
// Strategy:
// - Static source analysis for structural contracts (state, memo, prop wiring)
// - Unit tests for derived value logic (displayEarnings, earningsSubLabel)
//   extracted as pure computations — these test the logic without mounting
//   the full component (which has many native dependencies)

import * as path from 'path';
import * as fs from 'fs';

// ─── File path ────────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../..');
const INDEX_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'index.tsx');

// ─── Helper: derived value logic (mirrors index.tsx logic) ───────────────────

function computeDisplayEarnings(
  scrubEarningsIndex: number | null,
  earningsTrend: number[],
  weeklyEarnings: number,
): number {
  if (scrubEarningsIndex !== null) {
    return earningsTrend[scrubEarningsIndex] ?? 0;
  }
  return weeklyEarnings;
}

function computeEarningsSubLabel(
  scrubEarningsIndex: number | null,
  weekLabels: string[],
): string {
  if (scrubEarningsIndex !== null) {
    return weekLabels[scrubEarningsIndex] ?? 'past week';
  }
  return 'this week';
}

// ─── SC3.1–SC3.2: Source structure ───────────────────────────────────────────

describe('Home tab FR3 — source structure', () => {
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(INDEX_FILE)).toBe(true);
    source = fs.readFileSync(INDEX_FILE, 'utf8');
  });

  it('SC3.1 — declares scrubEarningsIndex state (number | null)', () => {
    expect(source).toMatch(/scrubEarningsIndex/);
    expect(source).toMatch(/useState.*null|null.*useState/);
  });

  it('SC3.1 — uses setScrubEarningsIndex setter', () => {
    expect(source).toMatch(/setScrubEarningsIndex/);
  });

  it('SC3.2 — imports getWeekLabels from @/src/lib/hours', () => {
    expect(source).toMatch(/getWeekLabels/);
    expect(source).toMatch(/src\/lib\/hours|@\/src\/lib\/hours/);
  });

  it('SC3.2 — weekLabels computed via useMemo with getWeekLabels', () => {
    expect(source).toMatch(/weekLabels/);
    expect(source).toMatch(/useMemo/);
    expect(source).toMatch(/getWeekLabels/);
  });

  it('SC3.9 — passes onScrubChange to TrendSparkline', () => {
    expect(source).toMatch(/onScrubChange\s*=\s*\{?setScrubEarningsIndex/);
  });

  it('SC3.9 — passes weekLabels to TrendSparkline', () => {
    // weekLabels={weekLabels} on TrendSparkline
    expect(source).toMatch(/weekLabels\s*=\s*\{weekLabels\}/);
  });

  it('SC3.3/SC3.4 — uses scrubEarningsIndex to select displayEarnings or equivalent', () => {
    // scrubEarningsIndex drives the hero value selection
    expect(source).toMatch(/scrubEarningsIndex/);
    // Must reference earningsTrend or earningsHistoryTrend when scrubbing
    const hasTrendAccess = /earningsTrend\[|earningsHistoryTrend\[|earningsTrend\s*\[/.test(source);
    expect(hasTrendAccess).toBe(true);
  });

  it('SC3.5/SC3.6 — sub-label conditionally shows "this week" or week label', () => {
    expect(source).toMatch(/this week/);
    expect(source).toMatch(/weekLabels/);
  });
});

// ─── SC3.3–SC3.8: Derived value logic unit tests ─────────────────────────────

describe('Home tab FR3 — displayEarnings logic', () => {
  const TREND = [1200, 1350, 1500, 1920];
  const WEEKLY_EARNINGS = 1750;

  it('SC3.4 — returns weeklyEarnings when scrubIndex is null', () => {
    expect(computeDisplayEarnings(null, TREND, WEEKLY_EARNINGS)).toBe(WEEKLY_EARNINGS);
  });

  it('SC3.3 — returns trend[0] when scrubIndex is 0 (oldest)', () => {
    expect(computeDisplayEarnings(0, TREND, WEEKLY_EARNINGS)).toBe(1200);
  });

  it('SC3.3 — returns trend[1] when scrubIndex is 1', () => {
    expect(computeDisplayEarnings(1, TREND, WEEKLY_EARNINGS)).toBe(1350);
  });

  it('SC3.3 — returns trend[3] (newest) when scrubIndex is last index', () => {
    expect(computeDisplayEarnings(3, TREND, WEEKLY_EARNINGS)).toBe(1920);
  });

  it('SC3.7 — scrubIndex=0 shows first (oldest) trend value', () => {
    expect(computeDisplayEarnings(0, TREND, WEEKLY_EARNINGS)).toBe(TREND[0]);
  });

  it('SC3.8 — empty trend with scrubIndex=0 returns 0 (nullish coalesce)', () => {
    expect(computeDisplayEarnings(0, [], WEEKLY_EARNINGS)).toBe(0);
  });

  it('SC3.8 — empty trend with scrubIndex=null returns weeklyEarnings', () => {
    expect(computeDisplayEarnings(null, [], WEEKLY_EARNINGS)).toBe(WEEKLY_EARNINGS);
  });

  it('SC3.4 — weeklyEarnings=0 returns 0 when scrubIndex is null', () => {
    expect(computeDisplayEarnings(null, TREND, 0)).toBe(0);
  });

  it('returns 0 for out-of-range scrubIndex (nullish coalesce)', () => {
    expect(computeDisplayEarnings(99, TREND, WEEKLY_EARNINGS)).toBe(0);
  });
});

describe('Home tab FR3 — earningsSubLabel logic', () => {
  const LABELS = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];

  it('SC3.6 — returns "this week" when scrubIndex is null', () => {
    expect(computeEarningsSubLabel(null, LABELS)).toBe('this week');
  });

  it('SC3.5 — returns oldest label when scrubIndex=0', () => {
    expect(computeEarningsSubLabel(0, LABELS)).toBe('Feb 23');
  });

  it('SC3.5 — returns current week label when scrubIndex=3 (last)', () => {
    expect(computeEarningsSubLabel(3, LABELS)).toBe('Mar 16');
  });

  it('SC3.5 — returns intermediate label when scrubIndex=1', () => {
    expect(computeEarningsSubLabel(1, LABELS)).toBe('Mar 2');
  });

  it('SC3.8 — empty labels with scrubIndex=0 returns fallback "past week"', () => {
    expect(computeEarningsSubLabel(0, [])).toBe('past week');
  });

  it('SC3.8 — empty labels with scrubIndex=null returns "this week"', () => {
    expect(computeEarningsSubLabel(null, [])).toBe('this week');
  });

  it('SC3.6 — "this week" at rest (scrubIndex null) regardless of labels content', () => {
    expect(computeEarningsSubLabel(null, ['Feb 23'])).toBe('this week');
    expect(computeEarningsSubLabel(null, [])).toBe('this week');
  });
});
