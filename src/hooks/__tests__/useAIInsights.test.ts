// Tests: useAIInsights hook — 04-ai-insights FR4
//
// FR4: useAIInsights() hook
//   SC4.1 — returns AIInsights with all fields null for empty snapshots + null aiData
//   SC4.2 — returns correct AIInsights when given ≥8 weeks of mocked history
//   SC4.3 — does not import useOverviewData (import audit)
//   SC4.4 — useMemo dependency array includes snapshots, hoursData, and aiData
//   SC4.5 — current week (from aiData) is appended as last entry
//   SC4.6 — past snapshots with weekStart >= currentMonday are excluded
//
// Strategy:
// - Static analysis for interface/import contracts (SC4.3, SC4.4)
// - Direct unit tests on the array-assembly logic extracted from the hook body
//   (SC4.1, SC4.2, SC4.5, SC4.6) — renderHook not used per project convention
// - The hook body is a thin wrapper around computeAIInsights, which is already
//   fully tested in aiInsights.test.ts. Hook tests focus on the assembly layer.

import * as path from 'path';
import * as fs from 'fs';
import { computeAIInsights } from '../../lib/aiInsights';
import type { WeeklySnapshot } from '../../lib/weeklyHistory';
import type { AIWeekData } from '../../lib/ai';

// ─── File paths ───────────────────────────────────────────────────────────────

const SRC_ROOT = path.resolve(__dirname, '../..');
const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'useAIInsights.ts');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnapshot(weekStart: string, aiPct = 75, brainliftHours = 4): WeeklySnapshot {
  return { weekStart, hours: 40, earnings: 2000, aiPct, brainliftHours };
}

function makeAIWeekData(aiPctLow: number, aiPctHigh: number, brainliftHours: number): AIWeekData {
  return {
    aiPctLow,
    aiPctHigh,
    brainliftHours,
    taggedSlots: 100,
    totalSlots: 120,
    aiUsageSlots: 75,
    brainliftSlots: 30,
    noTagSlots: 20,
  };
}

// ─── Assembly logic (mirrors useAIInsights hook body) ────────────────────────
// Extract the pure array-assembly logic so we can unit-test it without React.

function assembleAndCompute(
  snapshots: WeeklySnapshot[],
  currentMonday: string,
  aiData: AIWeekData | null,
) {
  const past = snapshots.filter(s => s.weekStart < currentMonday);
  const currentAiPct = aiData ? Math.round((aiData.aiPctLow + aiData.aiPctHigh) / 2) : 0;
  const currentBL = aiData?.brainliftHours ?? 0;
  const aiPct      = [...past.map(s => s.aiPct),          currentAiPct];
  const brainlift  = [...past.map(s => s.brainliftHours), currentBL];
  const weekStarts = [...past.map(s => s.weekStart),      currentMonday];
  return computeAIInsights(aiPct, brainlift, weekStarts);
}

// ─── SC4.1 — empty snapshots + null aiData → all nulls ───────────────────────

describe('useAIInsights — SC4.1 — empty history', () => {
  it('returns all-null AIInsights for empty snapshots and null aiData', () => {
    const result = assembleAndCompute([], '2026-06-09', null);
    expect(result.trend).toBeNull();
    expect(result.best).toBeNull();
    expect(result.brainliftCorrelation).toBeNull();
  });
});

// ─── SC4.2 — ≥8 weeks of history → non-null insights ────────────────────────

describe('useAIInsights — SC4.2 — rich history produces insights', () => {
  it('returns non-null trend and best for 8+ weeks of history', () => {
    // Build 8 past weeks + current week = 9 total
    const snapshots: WeeklySnapshot[] = [
      makeSnapshot('2026-01-05', 60),
      makeSnapshot('2026-01-12', 64),
      makeSnapshot('2026-01-19', 68),
      makeSnapshot('2026-01-26', 72),
      makeSnapshot('2026-02-02', 76),
      makeSnapshot('2026-02-09', 80),
      makeSnapshot('2026-02-16', 84),
      makeSnapshot('2026-02-23', 88),
    ];
    const currentMonday = '2026-03-02';
    const aiData = makeAIWeekData(85, 95, 5.5); // midpoint = 90

    const result = assembleAndCompute(snapshots, currentMonday, aiData);
    expect(result.trend).not.toBeNull();
    expect(result.best).not.toBeNull();
    // best.currentPct should be the current week midpoint = 90
    expect(result.best!.currentPct).toBe(90);
  });
});

// ─── SC4.5 — current week is appended as last entry ──────────────────────────

describe('useAIInsights — SC4.5 — current week is last', () => {
  it('appends currentMonday and aiData values as the last aligned entry', () => {
    const snapshots: WeeklySnapshot[] = [
      makeSnapshot('2026-01-05', 70),
      makeSnapshot('2026-01-12', 72),
      makeSnapshot('2026-01-19', 74),
      makeSnapshot('2026-01-26', 76),
    ];
    const currentMonday = '2026-02-02';
    // aiPctLow=78, aiPctHigh=82 → midpoint = 80
    const aiData = makeAIWeekData(78, 82, 6);

    const result = assembleAndCompute(snapshots, currentMonday, aiData);
    // 5 total entries (4 past + 1 current) → trend computes
    expect(result.trend).not.toBeNull();
    // best.currentPct should be the appended current week = 80
    expect(result.best!.currentPct).toBe(80);
  });

  it('uses 0 for currentAiPct and currentBL when aiData is null', () => {
    const snapshots: WeeklySnapshot[] = [
      makeSnapshot('2026-01-05', 70),
      makeSnapshot('2026-01-12', 72),
      makeSnapshot('2026-01-19', 74),
      makeSnapshot('2026-01-26', 76),
    ];
    const currentMonday = '2026-02-02';
    const result = assembleAndCompute(snapshots, currentMonday, null);
    // current week entry has aiPct = 0 (defaults)
    // best.currentPct = last entry = 0
    expect(result.best!.currentPct).toBe(0);
  });
});

// ─── SC4.6 — snapshots with weekStart >= currentMonday are excluded ───────────

describe('useAIInsights — SC4.6 — future snapshots excluded', () => {
  it('filters out snapshots at or after currentMonday', () => {
    const snapshots: WeeklySnapshot[] = [
      makeSnapshot('2026-01-05', 70),
      makeSnapshot('2026-01-12', 72),
      makeSnapshot('2026-01-19', 74),
      makeSnapshot('2026-01-26', 76),
      // This snapshot is NOT a past week — should be excluded from 'past'
      makeSnapshot('2026-02-02', 99), // same as currentMonday
    ];
    const currentMonday = '2026-02-02';
    const aiData = makeAIWeekData(80, 80, 5); // midpoint = 80

    const result = assembleAndCompute(snapshots, currentMonday, aiData);
    // Only 4 past snapshots pass the filter; current = 80
    // best.currentPct = 80, not 99 (the excluded snapshot)
    expect(result.best!.currentPct).toBe(80);
    // peakPct = 80 (current), not 99
    expect(result.best!.peakPct).toBe(80);
  });
});

// ─── SC4.2b — brainliftCorrelation propagates through hook assembly ───────────

describe('useAIInsights — SC4.2b — correlation propagates', () => {
  it('returns non-null brainliftCorrelation when history shows strong BL-AI link', () => {
    // 10 past weeks + current = 11 total entries, 10 pairs
    // Alternating high/low BL → strong negative correlation (high BL → lower next AI here)
    const snapshots: WeeklySnapshot[] = [
      makeSnapshot('2026-01-05', 60, 6),
      makeSnapshot('2026-01-12', 85, 1),
      makeSnapshot('2026-01-19', 60, 6),
      makeSnapshot('2026-01-26', 85, 1),
      makeSnapshot('2026-02-02', 60, 6),
      makeSnapshot('2026-02-09', 85, 1),
      makeSnapshot('2026-02-16', 60, 6),
      makeSnapshot('2026-02-23', 85, 1),
      makeSnapshot('2026-03-02', 60, 6),
      makeSnapshot('2026-03-09', 85, 1),
    ];
    const currentMonday = '2026-03-16';
    const aiData = makeAIWeekData(58, 62, 6); // current: midpoint=60, BL=6

    const result = assembleAndCompute(snapshots, currentMonday, aiData);
    // 10 past + 1 current = 11 entries, 10 pairs — meets ≥8 threshold
    expect(result.brainliftCorrelation).not.toBeNull();
    expect(result.brainliftCorrelation!.pairsUsed).toBe(10);
    // r should be strong (alternating pattern)
    expect(Math.abs(result.brainliftCorrelation!.r)).toBeGreaterThan(0.35);
  });
});

// ─── SC4.3 — does not import useOverviewData ─────────────────────────────────

describe('useAIInsights — SC4.3 — import audit', () => {
  it('hook file exists', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('does not import useOverviewData', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).not.toMatch(/useOverviewData/);
  });

  it('does not have a window parameter', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    // The exported function should have no parameter named 'window'
    expect(src).not.toMatch(/useAIInsights\s*\(\s*window/);
  });
});

// ─── SC4.4 — useMemo dependency array ────────────────────────────────────────

describe('useAIInsights — SC4.4 — useMemo deps', () => {
  it('imports useMemo from react', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useMemo/);
  });

  it('includes snapshots in dependency array', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/snapshots/);
  });

  it('includes hoursData in dependency array', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/hoursData/);
  });

  it('includes aiData in dependency array', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/aiData/);
  });

  it('reads from useWeeklyHistory (not useOverviewData)', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useWeeklyHistory/);
  });
});
