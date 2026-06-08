// Tests: OverviewScreen — 03-overview-integration (day-pattern-chart)
//
// FR1: Imports — overview.tsx imports useWeeklyHistory, computeDayWindowAvgs, DayPatternChart
// FR2: Data computation — useWeeklyHistory() call, useMemo with computeDayWindowAvgs
// FR3: Section rendering — DayPatternChart rendered with correct props inside getEntryStyle(6)
// FR4: Stagger count update — useStaggeredEntry({ count: 7 })
//
// Strategy: static source-file analysis via fs.readFileSync + regex.
// No runtime rendering needed — all contracts are verifiable from source text.
// Tests will FAIL (red) until overview.tsx is updated.

import * as fs from 'fs';
import * as path from 'path';

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const OVERVIEW_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'overview.tsx');

// ─── FR1: Imports ─────────────────────────────────────────────────────────────

describe('FR1: overview.tsx — imports for day-pattern-chart integration', () => {
  it('SC1.1: imports useWeeklyHistory from @/src/hooks/useWeeklyHistory', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useWeeklyHistory.*from.*@\/src\/hooks\/useWeeklyHistory/);
  });

  it('SC1.2: imports computeDayWindowAvgs from @/src/lib/dayPatternUtils', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/computeDayWindowAvgs.*from.*@\/src\/lib\/dayPatternUtils/);
  });

  it('SC1.3: imports DayPatternChart from @/src/components/DayPatternChart', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/DayPatternChart.*from.*@\/src\/components\/DayPatternChart/);
  });
});

// ─── FR2: Data computation ────────────────────────────────────────────────────

describe('FR2: overview.tsx — useWeeklyHistory and useMemo for pattern data', () => {
  it('SC2.1: calls useWeeklyHistory() and destructures snapshots', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // Must destructure snapshots from the hook call
    expect(source).toMatch(/\{\s*snapshots[^}]*\}\s*=\s*useWeeklyHistory\(\)/);
  });

  it('SC2.2: calls computeDayWindowAvgs(snapshots, window) inside useMemo', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/computeDayWindowAvgs\s*\(\s*snapshots\s*,\s*window\s*\)/);
  });

  it('SC2.3: useMemo dependency array includes snapshots and window', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // The dependency array [snapshots, window] must appear near computeDayWindowAvgs
    // Match the useMemo call containing computeDayWindowAvgs with both deps in array
    expect(source).toMatch(/\[\s*snapshots\s*,\s*window\s*\]/);
  });
});

// ─── FR3: Section rendering ───────────────────────────────────────────────────

describe('FR3: overview.tsx — WORK PATTERN section rendered correctly', () => {
  it('SC3.1: renders DayPatternChart with current= prop', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/DayPatternChart[\s\S]*?current=/);
  });

  it('SC3.2: passes prev= prop to DayPatternChart', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/DayPatternChart[\s\S]*?prev=/);
  });

  it('SC3.3: subtitle text contains window variable reference', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // Subtitle must use window in a conditional: either '24W avg' or `${window}W vs prior...`
    // Must contain both the 24W avg literal and a window template reference
    expect(source).toMatch(/24W avg/);
    expect(source).toMatch(/\$\{window\}W vs prior/);
  });

  it('SC3.4: WORK PATTERN section wrapped in Animated.View using getEntryStyle(6)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // getEntryStyle(6) must appear in the source
    expect(source).toMatch(/getEntryStyle\(6\)/);
    // The section must also contain WORK PATTERN label
    expect(source).toMatch(/WORK PATTERN/);
  });
});

// ─── FR4: Stagger count update ────────────────────────────────────────────────

describe('FR4: overview.tsx — stagger count updated to 7', () => {
  it('SC4.1: calls useStaggeredEntry with count: 7', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*7/);
  });

  it('SC4.2: getEntryStyle(6) appears exactly once', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const calls = (source.match(/getEntryStyle\(6\)/g) || []).length;
    expect(calls).toBe(1);
  });
});
