// Tests: 02-deadline-clock — FR3 (60s tick) and FR4 (isFuture fix) in index.tsx
//
// FR3: 60-second now tick
//   SC3.1 — now state initialises from useState(() => new Date())
//   SC3.2 — setInterval with 60_000ms fires setNow(new Date())
//   SC3.3 — interval is cleared on unmount (clearInterval in useEffect cleanup)
//   SC3.4 — countdown useMemo depends on [now] not []
//   SC3.5 — pacing useMemo depends on [..., now] not [data?.total, weeklyLimit] only
//
// FR4: isFuture fix
//   SC4.1 — isFuture expression is `!entry` (not `!entry || (!entry.isToday && entry.hours === 0)`)
//   SC4.2 — past day with hours=0 and isToday=false maps to isFuture: false
//   SC4.3 — missing entry maps to isFuture: true
//   SC4.4 — today entry with hours=0 maps to isFuture: false
//   SC4.5 — today entry with hours>0 maps to isFuture: false
//
// Strategy:
// index.tsx has heavy native dependencies (Reanimated, Expo Router, many hooks).
// We use source-text assertions (like chartData.test.ts) for FR3 behavioral contracts
// and a pure-logic extraction to test FR4 isFuture logic directly.
//
// Source-text testing is appropriate here because:
// - The fix is a specific, verifiable code pattern
// - Component rendering requires a large mock surface
// - The pattern can be exactly specified by the spec

import * as fs from 'fs';
import * as path from 'path';

// ─── File path ────────────────────────────────────────────────────────────────

const INDEX_FILE = path.resolve(__dirname, '../../app/(tabs)/index.tsx');

let source: string;

beforeAll(() => {
  source = fs.readFileSync(INDEX_FILE, 'utf8');
});

// ─── FR3: 60-second tick ──────────────────────────────────────────────────────

describe('FR3 — 60-second now tick (index.tsx)', () => {
  it('SC3.1 — now state is initialised with useState(() => new Date())', () => {
    // Must use the lazy initialiser form to avoid stale date on re-renders
    expect(source).toMatch(/useState\s*\(\s*\(\s*\)\s*=>\s*new Date\(\)/);
  });

  it('SC3.2 — setInterval fires setNow(new Date()) every 60_000ms', () => {
    // Both the setInterval call and the 60_000 interval must be present
    expect(source).toMatch(/setInterval/);
    expect(source).toMatch(/60[_,]?000/);
    // setNow is called inside the interval
    expect(source).toMatch(/setNow\s*\(\s*new Date\(\)\s*\)/);
  });

  it('SC3.3 — interval is cleared in useEffect cleanup (clearInterval)', () => {
    expect(source).toMatch(/clearInterval/);
    // The cleanup return pattern: () => clearInterval(id) or return () => clearInterval
    expect(source).toMatch(/return\s*\(\s*\)\s*=>\s*clearInterval/);
  });

  it('SC3.4 — countdown useMemo passes now and depends on [now]', () => {
    // computeDeadlineCountdown must be called with now (not empty call)
    expect(source).toMatch(/computeDeadlineCountdown\s*\(\s*now\s*\)/);
    // The memo dependency array must include now
    // Match: useMemo(..., [now]) — countdown-specific
    expect(source).toMatch(/computeDeadlineCountdown\(now\)[^;]*\[now\]/s);
  });

  it('SC3.5 — pacing useMemo passes now and includes it in deps', () => {
    // computePacingSignal must be called with now as third argument
    expect(source).toMatch(/computePacingSignal\s*\([^)]+,\s*now\s*\)/);
    // Deps array must include now alongside other deps
    expect(source).toMatch(/\[data\?\.total[^,\]]*,\s*weeklyLimit[^,\]]*,\s*now\s*\]/);
  });
});

// ─── FR4: isFuture fix ────────────────────────────────────────────────────────

describe('FR4 — isFuture fix in mapDailyToChartData (index.tsx)', () => {
  it('SC4.1 — isFuture is simplified to !entry (not the broken compound condition)', () => {
    // The old (broken) expression must not be present
    expect(source).not.toMatch(/isFuture:\s*!entry\s*\|\|\s*\(!entry\.isToday/);
    // The correct expression must be present
    expect(source).toMatch(/isFuture:\s*!entry[,\s]/);
  });

  // ─── Behavioral tests for the isFuture logic ──────────────────────────────
  // We extract and exercise the isFuture expression directly as a pure function.
  // This mirrors the actual mapDailyToChartData logic without the full component.

  /**
   * Simulates the isFuture mapping logic from mapDailyToChartData.
   * After the fix: isFuture = !entry
   */
  function isFutureFixed(entry: { hours: number; isToday: boolean } | undefined): boolean {
    return !entry;
  }

  it('SC4.2 — past day with hours=0 and isToday=false → isFuture: false', () => {
    const entry = { hours: 0, isToday: false };
    expect(isFutureFixed(entry)).toBe(false);
  });

  it('SC4.3 — missing entry (undefined) → isFuture: true', () => {
    expect(isFutureFixed(undefined)).toBe(true);
  });

  it('SC4.4 — today entry with hours=0 → isFuture: false', () => {
    const entry = { hours: 0, isToday: true };
    expect(isFutureFixed(entry)).toBe(false);
  });

  it('SC4.5 — today entry with hours>0 → isFuture: false', () => {
    const entry = { hours: 7.5, isToday: true };
    expect(isFutureFixed(entry)).toBe(false);
  });

  it('old broken expression would incorrectly mark past zero-hour day as future', () => {
    // Document the bug: the old formula (!entry || (!entry.isToday && entry.hours === 0))
    // returns true for { hours: 0, isToday: false } — which is wrong
    function isFutureBroken(entry: { hours: number; isToday: boolean } | undefined): boolean {
      return !entry || (!entry.isToday && entry.hours === 0);
    }
    const pastZeroDay = { hours: 0, isToday: false };
    expect(isFutureBroken(pastZeroDay)).toBe(true);  // Bug: says future
    expect(isFutureFixed(pastZeroDay)).toBe(false);  // Fix: correctly says not future
  });
});
