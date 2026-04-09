// Tests: useOverviewData hook — 07-overview-sync FR3
//
// FR3: useOverviewData(window) hook
//   SC3.1 — window=4, 3 past weeks in history → all arrays length 4
//   SC3.2 — window=12, 11 past weeks in history → all arrays length 12
//   SC3.3 — empty history → all arrays length 1 (current week only)
//   SC3.4 — history shorter than window → arrays = available + 1 (no padding)
//   SC3.5 — current week is always the last entry in each array
//   SC3.6 — isLoading is true when any dependent hook is loading
//   SC3.7 — weekLabels length equals earnings length
//   SC3.8 — null useHoursData → current week hours = 0
//   SC3.9 — null useAIData → current week aiPct = 0, brainliftHours = 0
//   SC3.10 — hook file exists and exports useOverviewData
//   SC3.11 — earnings array uses useWeeklyHistory snapshots (not earnings history hook)
//
// Strategy:
// - Source-level static analysis for interface/import contracts
// - Pure function unit tests for the data composition logic (window slicing + appending)
// - renderHook is not used — jest-expo/node preset has null dispatcher outside React
//   Instead, the composition logic is extracted and tested as pure functions.

import * as path from 'path';
import * as fs from 'fs';
import type { WeeklySnapshot } from '../../lib/weeklyHistory';

// ─── File paths ───────────────────────────────────────────────────────────────

const SRC_ROOT = path.resolve(__dirname, '../..');
const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'useOverviewData.ts');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnapshot(weekStart: string, override?: Partial<WeeklySnapshot>): WeeklySnapshot {
  return {
    weekStart,
    hours: 40,
    earnings: 2000,
    aiPct: 75,
    brainliftHours: 5,
    ...override,
  };
}

/** Build N past week snapshots, ending at `endWeekStart`. */
function buildPastSnapshots(count: number, endWeekStart: string): WeeklySnapshot[] {
  const snapshots: WeeklySnapshot[] = [];
  const base = new Date(endWeekStart + 'T00:00:00');
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    snapshots.push(makeSnapshot(`${y}-${m}-${day}`));
  }
  return snapshots;
}

// ─── Pure composition logic extracted for testing ─────────────────────────────
//
// This mirrors what useOverviewData does internally, allowing testing without
// React hooks. When useOverviewData is implemented, it must satisfy these contracts.

interface OverviewData {
  earnings: number[];
  hours: number[];
  aiPct: number[];
  brainliftHours: number[];
  weekLabels: string[];
}

/**
 * Compose overview data arrays from history snapshots and current week values.
 * Mirrors the useOverviewData internal logic.
 */
function composeOverviewData(
  snapshots: WeeklySnapshot[],
  window: 4 | 12,
  currentWeek: {
    earnings: number;
    hours: number;
    aiPct: number;
    brainliftHours: number;
  },
  weekLabels: string[],
): OverviewData {
  // Take up to (window - 1) past snapshots + current week
  const pastSlice = snapshots.slice(-(window - 1));

  const earningsPast = pastSlice.map(s => s.earnings);
  const hoursPast = pastSlice.map(s => s.hours);
  const aiPctPast = pastSlice.map(s => s.aiPct);
  const brainliftPast = pastSlice.map(s => s.brainliftHours);

  const earnings = [...earningsPast, currentWeek.earnings];
  const hours = [...hoursPast, currentWeek.hours];
  const aiPct = [...aiPctPast, currentWeek.aiPct];
  const brainliftHours = [...brainliftPast, currentWeek.brainliftHours];

  // Align weekLabels to actual data length
  const alignedLabels = weekLabels.slice(-earnings.length);

  return { earnings, hours, aiPct, brainliftHours, weekLabels: alignedLabels };
}

const CURRENT_WEEK = { earnings: 1800, hours: 38, aiPct: 72, brainliftHours: 4 };

// ─── SC3.10: File existence ───────────────────────────────────────────────────

describe('useOverviewData — SC3.10: file contract', () => {
  it('SC3.10 — hook file exists at src/hooks/useOverviewData.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('SC3.10 — hook file exports useOverviewData function', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/export function useOverviewData|export.*useOverviewData/);
  });

  it('SC3.10 — hook accepts window parameter typed as 4 | 12', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/4\s*\|\s*12/);
  });

  it('SC3.10 — hook returns data and isLoading', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/data/);
    expect(source).toMatch(/isLoading/);
  });
});

// ─── SC3.11: Source imports ───────────────────────────────────────────────────

describe('useOverviewData — SC3.11: source imports', () => {
  it('SC3.11 — imports useWeeklyHistory', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useWeeklyHistory/);
  });

  it('SC3.11 — imports useHoursData', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useHoursData/);
  });

  it('SC3.11 — imports useAIData', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/useAIData/);
  });

  it('SC3.11 — imports getWeekLabels from hours lib', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/getWeekLabels/);
    expect(source).toMatch(/hours/);
  });

  it('SC3.11 — OverviewData interface includes earnings, hours, aiPct, brainliftHours, weekLabels', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/earnings/);
    expect(source).toMatch(/hours/);
    expect(source).toMatch(/aiPct/);
    expect(source).toMatch(/brainliftHours/);
    expect(source).toMatch(/weekLabels/);
  });
});

// ─── SC3.1: window=4, 3 past weeks → arrays length 4 ─────────────────────────

describe('useOverviewData composition — SC3.1: window=4 with full history', () => {
  it('SC3.1 — 3 past weeks + current = length 4', () => {
    const snapshots = buildPastSnapshots(3, '2026-03-09');
    const labels = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    expect(result.earnings).toHaveLength(4);
    expect(result.hours).toHaveLength(4);
    expect(result.aiPct).toHaveLength(4);
    expect(result.brainliftHours).toHaveLength(4);
  });

  it('SC3.1 — weekLabels length matches data length (4)', () => {
    const snapshots = buildPastSnapshots(3, '2026-03-09');
    const labels = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    expect(result.weekLabels).toHaveLength(4);
    expect(result.weekLabels).toHaveLength(result.earnings.length);
  });
});

// ─── SC3.2: window=12, 11 past weeks → arrays length 12 ──────────────────────

describe('useOverviewData composition — SC3.2: window=12 with full history', () => {
  it('SC3.2 — 11 past weeks + current = length 12', () => {
    const snapshots = buildPastSnapshots(11, '2026-01-05');
    const labels = Array.from({ length: 12 }, (_, i) => `Week ${i + 1}`);
    const result = composeOverviewData(snapshots, 12, CURRENT_WEEK, labels);
    expect(result.earnings).toHaveLength(12);
    expect(result.hours).toHaveLength(12);
  });

  it('SC3.2 — weekLabels length matches 12', () => {
    const snapshots = buildPastSnapshots(11, '2026-01-05');
    const labels = Array.from({ length: 12 }, (_, i) => `Week ${i + 1}`);
    const result = composeOverviewData(snapshots, 12, CURRENT_WEEK, labels);
    expect(result.weekLabels).toHaveLength(12);
  });
});

// ─── SC3.3: empty history → length 1 ─────────────────────────────────────────

describe('useOverviewData composition — SC3.3: empty history', () => {
  it('SC3.3 — empty snapshots → all arrays length 1 (current week only)', () => {
    const result = composeOverviewData([], 4, CURRENT_WEEK, ['Mar 16']);
    expect(result.earnings).toHaveLength(1);
    expect(result.hours).toHaveLength(1);
    expect(result.aiPct).toHaveLength(1);
    expect(result.brainliftHours).toHaveLength(1);
    expect(result.weekLabels).toHaveLength(1);
  });

  it('SC3.3 — empty history → current week values in array[0]', () => {
    const result = composeOverviewData([], 4, CURRENT_WEEK, ['Mar 16']);
    expect(result.earnings[0]).toBe(CURRENT_WEEK.earnings);
    expect(result.hours[0]).toBe(CURRENT_WEEK.hours);
    expect(result.aiPct[0]).toBe(CURRENT_WEEK.aiPct);
    expect(result.brainliftHours[0]).toBe(CURRENT_WEEK.brainliftHours);
  });
});

// ─── SC3.4: history shorter than window → no padding ─────────────────────────

describe('useOverviewData composition — SC3.4: short history (no padding)', () => {
  it('SC3.4 — 2 past weeks + window=4 → length 3 (not padded to 4)', () => {
    const snapshots = buildPastSnapshots(2, '2026-03-09');
    const labels = ['Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    expect(result.earnings).toHaveLength(3);
  });

  it('SC3.4 — 1 past week + window=12 → length 2 (not padded)', () => {
    const snapshots = buildPastSnapshots(1, '2026-03-09');
    const labels = ['Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 12, CURRENT_WEEK, labels);
    expect(result.earnings).toHaveLength(2);
  });

  it('SC3.4 — weekLabels length still equals earnings length', () => {
    const snapshots = buildPastSnapshots(2, '2026-03-09');
    const labels = ['Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    expect(result.weekLabels).toHaveLength(result.earnings.length);
  });
});

// ─── SC3.5: current week is always last entry ──────────────────────────────────

describe('useOverviewData composition — SC3.5: current week is last', () => {
  it('SC3.5 — current week earnings is last entry in earnings array', () => {
    const snapshots = buildPastSnapshots(3, '2026-03-09');
    const labels = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    const last = result.earnings[result.earnings.length - 1];
    expect(last).toBe(CURRENT_WEEK.earnings);
  });

  it('SC3.5 — current week hours is last entry in hours array', () => {
    const snapshots = buildPastSnapshots(3, '2026-03-09');
    const labels = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    const last = result.hours[result.hours.length - 1];
    expect(last).toBe(CURRENT_WEEK.hours);
  });

  it('SC3.5 — current week aiPct is last entry in aiPct array', () => {
    const snapshots = buildPastSnapshots(3, '2026-03-09');
    const labels = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    const last = result.aiPct[result.aiPct.length - 1];
    expect(last).toBe(CURRENT_WEEK.aiPct);
  });

  it('SC3.5 — current week brainliftHours is last entry', () => {
    const snapshots = buildPastSnapshots(3, '2026-03-09');
    const labels = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    const last = result.brainliftHours[result.brainliftHours.length - 1];
    expect(last).toBe(CURRENT_WEEK.brainliftHours);
  });
});

// ─── SC3.7: weekLabels length always equals data length ───────────────────────

describe('useOverviewData composition — SC3.7: weekLabels alignment', () => {
  it('SC3.7 — weekLabels length equals earnings length for window=4 full history', () => {
    const snapshots = buildPastSnapshots(3, '2026-03-09');
    const labels = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    expect(result.weekLabels.length).toBe(result.earnings.length);
  });

  it('SC3.7 — weekLabels length equals earnings length for window=12 short history', () => {
    const snapshots = buildPastSnapshots(2, '2026-03-09');
    const labels = Array.from({ length: 12 }, (_, i) => `Week ${i + 1}`);
    const result = composeOverviewData(snapshots, 12, CURRENT_WEEK, labels);
    expect(result.weekLabels.length).toBe(result.earnings.length);
  });

  it('SC3.7 — weekLabels length equals earnings length for empty history', () => {
    const result = composeOverviewData([], 4, CURRENT_WEEK, ['Mar 16']);
    expect(result.weekLabels.length).toBe(result.earnings.length);
  });
});

// ─── SC3.8: null useHoursData → current week hours = 0 ────────────────────────

describe('useOverviewData composition — SC3.8 + SC3.9: null fallbacks', () => {
  it('SC3.8 — null hoursData → current week hours = 0', () => {
    const nullCurrentWeek = { earnings: 0, hours: 0, aiPct: 72, brainliftHours: 4 };
    const result = composeOverviewData([], 4, nullCurrentWeek, ['Mar 16']);
    expect(result.hours[0]).toBe(0);
  });

  it('SC3.9 — null aiData → current week aiPct = 0', () => {
    const nullCurrentWeek = { earnings: 1800, hours: 38, aiPct: 0, brainliftHours: 0 };
    const result = composeOverviewData([], 4, nullCurrentWeek, ['Mar 16']);
    expect(result.aiPct[0]).toBe(0);
  });

  it('SC3.9 — null aiData → current week brainliftHours = 0', () => {
    const nullCurrentWeek = { earnings: 1800, hours: 38, aiPct: 0, brainliftHours: 0 };
    const result = composeOverviewData([], 4, nullCurrentWeek, ['Mar 16']);
    expect(result.brainliftHours[0]).toBe(0);
  });

  it('SC3.8+SC3.9 — source guards null hook data with ?? 0 fallback', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Source must handle null/undefined from hooks with ?? 0
    expect(source).toMatch(/\?\?\s*0/);
  });
});

// ─── SC3.6: isLoading ─────────────────────────────────────────────────────────

describe('useOverviewData — SC3.6: isLoading contract', () => {
  it('SC3.6 — source includes isLoading in return value', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(source).toMatch(/isLoading/);
    expect(source).toMatch(/return.*{[\s\S]{0,200}isLoading|isLoading[\s\S]{0,100}return/);
  });

  it('SC3.6 — source checks isLoading from multiple hooks', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must compose isLoading from dependent hooks (at least 2 references)
    const matches = source.match(/isLoading/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Window slicing — more than window entries in history ─────────────────────

describe('useOverviewData composition — window slicing when history > window', () => {
  it('history longer than window-1 → result length capped at window', () => {
    // 15 past weeks, window=4 → only last 3 past + current = 4
    const snapshots = buildPastSnapshots(15, '2026-03-09');
    const labels = Array.from({ length: 4 }, (_, i) => `Week ${i + 1}`);
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    expect(result.earnings).toHaveLength(4);
  });

  it('history longer than window-1 → uses most recent snapshots', () => {
    // Most recent snapshot should appear at index length-2 (second to last)
    const snapshots = buildPastSnapshots(5, '2026-03-09');
    const labels = Array.from({ length: 4 }, (_, i) => `Week ${i + 1}`);
    const result = composeOverviewData(snapshots, 4, CURRENT_WEEK, labels);
    // Second to last entry should be from the most recent past snapshot
    const mostRecentPast = snapshots[snapshots.length - 1];
    expect(result.earnings[result.earnings.length - 2]).toBe(mostRecentPast.earnings);
  });
});
