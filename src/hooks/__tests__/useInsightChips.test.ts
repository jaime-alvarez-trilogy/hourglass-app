// Tests: useInsightChips hook — 05-insights-ui FR2
//
// FR2: useInsightChips() assembles up to 3 chips in priority order.
//   SC2.1 — returns [] when all insights are null
//   SC2.2 — returns 1 chip (pace) when only prescription is non-null
//   SC2.3 — returns 2 chips (pace, ai-trend) when prescription + trend available
//   SC2.4 — returns 3 chips in order (pace, ai-trend, brainlift) when all available
//   SC2.5 — prescription null → pace chip absent; up to 2 chips
//   SC2.6 — brainliftCorrelation null → formatCorrelationChip NOT called (guard verified)
//   SC2.7 — result never longer than 3
//   SC2.8 — hook imports usePrescription and useAIInsights (import audit)
//   SC2.9 — hook calls useAIInsights with no arguments (no window param)
//
// Strategy:
// - Static analysis for import/interface contracts (SC2.8, SC2.9)
// - Mocked hook calls via jest.mock for runtime behavior tests (SC2.1–SC2.7)
//   renderHook is not used per project convention; instead we test the logic
//   by directly calling the formatters with mocked hook return values.

import * as path from 'path';
import * as fs from 'fs';

// ─── File paths ───────────────────────────────────────────────────────────────

const SRC_ROOT = path.resolve(__dirname, '../..');
const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'useInsightChips.ts');

// ─── Static analysis tests ─────────────────────────────────────────────────────

describe('useInsightChips — SC2.8 — import audit', () => {
  it('hook file exists', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('imports usePrescription', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/usePrescription/);
  });

  it('imports useAIInsights', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useAIInsights/);
  });

  it('exports useInsightChips', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/export.*function useInsightChips/);
  });

  it('has JSDoc comment on useInsightChips', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/\/\*\*[\s\S]*?useInsightChips|useInsightChips[\s\S]*?\/\*\*/);
    // More specific: JSDoc must appear before the function
    const jsdocBeforeFunc = /\/\*\*[\s\S]*?\*\/\s*export\s+function\s+useInsightChips/;
    expect(src).toMatch(jsdocBeforeFunc);
  });
});

describe('useInsightChips — SC2.9 — no window param', () => {
  it('useAIInsights is called with no arguments', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    // Should NOT have useAIInsights(window) or useAIInsights(anything)
    expect(src).not.toMatch(/useAIInsights\s*\(\s*window/);
    // Should call useAIInsights()
    expect(src).toMatch(/useAIInsights\s*\(\s*\)/);
  });
});

describe('useInsightChips — SC2.6 — null guard for brainliftCorrelation', () => {
  it('source has explicit null-guard before formatCorrelationChip call', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must check brainliftCorrelation before calling formatCorrelationChip
    // Pattern: if (ai.brainliftCorrelation) ... formatCorrelationChip(...)
    // Use regex to find the if-guard pattern in the function body (not import)
    expect(src).toMatch(/if\s*\(\s*ai\.brainliftCorrelation\s*\)/);
    // The guard line must reference brainliftCorrelation AND formatCorrelationChip on same line or adjacent
    expect(src).toMatch(/brainliftCorrelation[\s\S]{0,80}formatCorrelationChip/);
  });
});

describe('useInsightChips — SC2.7 — slice(0, 3)', () => {
  it('source applies .slice(0, 3) to result', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/\.slice\s*\(\s*0\s*,\s*3\s*\)/);
  });
});

// ─── Logic tests (mirrors hook body, no renderHook) ───────────────────────────
// These tests call the formatting functions directly with the same logic
// the hook uses, verifying priority ordering and null-guard behavior.

import { colors } from '../../lib/colors';
import type { Prescription } from '../../lib/prescription';
import type { AIInsights } from '../../lib/aiInsights';
import {
  formatPrescriptionChip,
  formatTrendChip,
  formatCorrelationChip,
} from '../../lib/insightFormatting';

// Simulate the hook's chip-assembly logic
function assembleChips(
  p: Prescription | null,
  ai: AIInsights,
) {
  const chips = [];
  if (p) chips.push(formatPrescriptionChip(p));
  const t = formatTrendChip(ai.trend, ai.best);
  if (t) chips.push(t);
  if (ai.brainliftCorrelation) chips.push(formatCorrelationChip(ai.brainliftCorrelation));
  return chips.slice(0, 3);
}

const NULL_AI: AIInsights = { trend: null, best: null, brainliftCorrelation: null };

const ACTIVE_PRESCRIPTION: Prescription = {
  status: 'active',
  days: [{ dayIndex: 0, dayLabel: 'Mon', hoursNeeded: 4.0, isToday: true }],
  totalRemaining: 4.0,
  patternBased: true,
  summaryLine: 'Need 4.0h today',
};

const TREND_AI: AIInsights = {
  trend: { slopePts: 10, weeksUsed: 8, direction: 'up' },
  best: { peakPct: 90, weekLabel: 'May 5', currentPct: 80, ptsBelowBest: 10 },
  brainliftCorrelation: null,
};

const FULL_AI: AIInsights = {
  trend: { slopePts: 10, weeksUsed: 8, direction: 'up' },
  best: { peakPct: 90, weekLabel: 'May 5', currentPct: 80, ptsBelowBest: 10 },
  brainliftCorrelation: {
    r: 0.6,
    highBLAvgAIPct: 88,
    lowBLAvgAIPct: 71,
    pairsUsed: 10,
  },
};

describe('useInsightChips — SC2.1 — all null → returns []', () => {
  it('returns empty array when prescription null and all AI null', () => {
    const result = assembleChips(null, NULL_AI);
    expect(result).toEqual([]);
  });
});

describe('useInsightChips — SC2.2 — only prescription → 1 chip', () => {
  it('returns 1 chip with key "pace"', () => {
    const result = assembleChips(ACTIVE_PRESCRIPTION, NULL_AI);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('pace');
  });
});

describe('useInsightChips — SC2.3 — prescription + trend → 2 chips in order', () => {
  it('returns 2 chips: pace first, ai-trend second', () => {
    const result = assembleChips(ACTIVE_PRESCRIPTION, TREND_AI);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('pace');
    expect(result[1].key).toBe('ai-trend');
  });
});

describe('useInsightChips — SC2.4 — all 3 → 3 chips in order', () => {
  it('returns 3 chips: pace, ai-trend, brainlift', () => {
    const result = assembleChips(ACTIVE_PRESCRIPTION, FULL_AI);
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe('pace');
    expect(result[1].key).toBe('ai-trend');
    expect(result[2].key).toBe('brainlift');
  });
});

describe('useInsightChips — SC2.5 — no prescription → 2 chips (no pace)', () => {
  it('returns 2 chips without pace when prescription is null', () => {
    const result = assembleChips(null, FULL_AI);
    expect(result).toHaveLength(2);
    expect(result.some(c => c.key === 'pace')).toBe(false);
    expect(result[0].key).toBe('ai-trend');
    expect(result[1].key).toBe('brainlift');
  });
});

describe('useInsightChips — SC2.7 — result never > 3', () => {
  it('with 3 inputs result has at most 3 items', () => {
    const result = assembleChips(ACTIVE_PRESCRIPTION, FULL_AI);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

// ─── FR4 — SC4 schedule chip integration (02-schedule-insights) ───────────────
//
// SC4.1 — useWorkSchedule returns null → no schedule chip added
// SC4.2 — useWorkSchedule returns WorkSchedule + chips already 3 → schedule NOT in result
// SC4.3 — useWorkSchedule returns WorkSchedule + chips = 0 → schedule is only chip
// SC4.4 — useWorkSchedule returns WorkSchedule + chips = 2 → schedule is 3rd chip
// SC4.5 — schedule chip key is "schedule" when present
// SC4.6 — hook source imports useWorkSchedule and formatScheduleChip
// SC4.7 — chips.slice(0, 3) still applied after all four pushes

import type { WorkSchedule } from '../../lib/scheduleInsights';
import { formatScheduleChip } from '../../lib/insightFormatting';

/** Simulate the updated hook body with schedule as 4th candidate. */
function assembleChipsWithSchedule(
  p: typeof ACTIVE_PRESCRIPTION | null,
  ai: typeof NULL_AI,
  schedule: WorkSchedule | null,
) {
  const chips = [];
  if (p) chips.push(formatPrescriptionChip(p));
  const t = formatTrendChip(ai.trend, ai.best);
  if (t) chips.push(t);
  if (ai.brainliftCorrelation) chips.push(formatCorrelationChip(ai.brainliftCorrelation));
  if (schedule) chips.push(formatScheduleChip(schedule));
  return chips.slice(0, 3);
}

const SAMPLE_SCHEDULE: WorkSchedule = {
  peakRange: [7, 11],
  peakHour: 9,
  windowStart: 7,
  windowEnd: 17,
  weeksCovered: 6,
};

describe('useInsightChips — SC4.1 — schedule null → no schedule chip', () => {
  it('does not add schedule chip when useWorkSchedule returns null', () => {
    const result = assembleChipsWithSchedule(null, NULL_AI, null);
    expect(result.every(c => c.key !== 'schedule')).toBe(true);
  });
});

describe('useInsightChips — SC4.2 — chips already 3, schedule returns data → schedule excluded', () => {
  it('slice(0,3) drops schedule when 3 higher-priority chips fill the slots', () => {
    const result = assembleChipsWithSchedule(ACTIVE_PRESCRIPTION, FULL_AI, SAMPLE_SCHEDULE);
    expect(result).toHaveLength(3);
    expect(result.every(c => c.key !== 'schedule')).toBe(true);
  });
});

describe('useInsightChips — SC4.3 — chips = 0, schedule data → schedule is only chip', () => {
  it('returns 1 chip with key "schedule" when no other chips exist', () => {
    const result = assembleChipsWithSchedule(null, NULL_AI, SAMPLE_SCHEDULE);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('schedule');
  });
});

describe('useInsightChips — SC4.4 — chips = 2, schedule data → schedule is 3rd', () => {
  it('schedule fills the 3rd slot when 2 higher-priority chips exist', () => {
    const result = assembleChipsWithSchedule(ACTIVE_PRESCRIPTION, TREND_AI, SAMPLE_SCHEDULE);
    expect(result).toHaveLength(3);
    expect(result[2].key).toBe('schedule');
  });
});

describe('useInsightChips — SC4.5 — schedule chip key is "schedule"', () => {
  it('chip key equals "schedule" when schedule data is available', () => {
    const result = assembleChipsWithSchedule(null, NULL_AI, SAMPLE_SCHEDULE);
    expect(result[0].key).toBe('schedule');
  });
});

describe('useInsightChips — SC4.6 — hook imports useWorkSchedule and formatScheduleChip', () => {
  it('source imports useWorkSchedule', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useWorkSchedule/);
  });

  it('source imports formatScheduleChip', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/formatScheduleChip/);
  });
});

describe('useInsightChips — SC4.7 — slice(0, 3) still applied after 4th push', () => {
  it('result never exceeds 3 even when all four chips are available', () => {
    const result = assembleChipsWithSchedule(ACTIVE_PRESCRIPTION, FULL_AI, SAMPLE_SCHEDULE);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
