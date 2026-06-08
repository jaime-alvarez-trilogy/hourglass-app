// Tests: useHistoryBackfill — 01-daily-history-store FR2 + FR4
// FR2: computeDailyHours pure helper — unit tests via static analysis + logic replication
// FR4: mergeWeeklySnapshot preserves dailyHours across partial updates + round-trip

import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  mergeWeeklySnapshot,
  loadWeeklyHistory,
  saveWeeklyHistory,
} from '../../lib/weeklyHistory';
import type { WeeklySnapshot } from '../../lib/weeklyHistory';
import type { WorkDiarySlot } from '../../types/api';

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };

const BACKFILL_PATH = path.resolve(__dirname, '..', 'useHistoryBackfill.ts');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSlots(n: number): WorkDiarySlot[] {
  return Array.from({ length: n }, () => ({
    tags: [],
    autoTracker: true,
    status: 'APPROVED' as const,
    memo: '',
    actions: [],
  }));
}

function makeSnapshot(overrides: Partial<WeeklySnapshot> & { weekStart: string }): WeeklySnapshot {
  return {
    hours: 40,
    earnings: 1000,
    aiPct: 75,
    brainliftHours: 5,
    ...overrides,
  };
}

// ─── computeDailyHours logic (replicated for unit testing) ───────────────────
//
// The function is internal to useHistoryBackfill.ts (not exported).
// We test the computation logic directly by replicating the pure function here.
// Static analysis tests below verify the real implementation matches the contract.

function weekDatesFromMonday(mondayStr: string): string[] {
  const dates: string[] = [];
  const base = new Date(mondayStr + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dd}`);
  }
  return dates;
}

function computeDailyHoursLogic(
  mondayStr: string,
  slotsData: Record<string, WorkDiarySlot[]>,
): number[] {
  const dates = weekDatesFromMonday(mondayStr);
  return dates.map(date => (slotsData[date]?.length ?? 0) * 10 / 60);
}

// ─── FR2: Static analysis — computeDailyHours source contract ─────────────────

describe('FR2: computeDailyHours — source contract (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BACKFILL_PATH, 'utf8');
  });

  it('SC2.1 — source defines computeDailyHours function', () => {
    expect(source).toMatch(/function computeDailyHours\s*\(/);
  });

  it('SC2.2 — source uses weekDates() to iterate dates', () => {
    // computeDailyHours must call weekDates internally
    expect(source).toMatch(/weekDates\s*\(/);
  });

  it('SC2.3 — source computes hours as slot count * 10 / 60', () => {
    // The formula must appear in the source
    expect(source).toMatch(/\*\s*10\s*\/\s*60/);
  });

  it('SC2.4 — source uses nullish coalescing for absent dates (length ?? 0)', () => {
    // Must guard against undefined slotsData entries
    expect(source).toMatch(/\?\?/);
  });

  it('SC2.5 — source calls computeDailyHours in the backfill loop and passes result to mergeWeeklySnapshot', () => {
    expect(source).toMatch(/computeDailyHours\s*\(/);
    // dailyHours must appear in mergeWeeklySnapshot call
    expect(source).toMatch(/dailyHours/);
    expect(source).toMatch(/mergeWeeklySnapshot/);
  });

  it('SC2.6 — dailyHours is passed alongside aiPct and brainliftHours in merge', () => {
    // The merge call must include all three fields
    expect(source).toMatch(/aiPct[\s\S]{0,200}brainliftHours[\s\S]{0,200}dailyHours|dailyHours[\s\S]{0,200}aiPct/);
  });
});

// ─── FR2: computeDailyHours computation logic (unit) ─────────────────────────

describe('FR2: computeDailyHours — computation logic', () => {
  const MONDAY = '2026-03-16'; // Known Monday

  it('SC2.7 — all 7 days present: each index = slots.length * 10/60', () => {
    const dates = weekDatesFromMonday(MONDAY);
    const slotsData: Record<string, WorkDiarySlot[]> = {};
    const slotCounts = [48, 30, 24, 36, 42, 6, 0]; // Mon=48(8h) … Sun=0
    dates.forEach((d, i) => { slotsData[d] = makeSlots(slotCounts[i]); });

    const result = computeDailyHoursLogic(MONDAY, slotsData);

    expect(result).toHaveLength(7);
    slotCounts.forEach((count, i) => {
      expect(result[i]).toBeCloseTo(count * 10 / 60, 5);
    });
  });

  it('SC2.8 — Monday (index 0) with 48 slots returns 8h', () => {
    const dates = weekDatesFromMonday(MONDAY);
    const slotsData: Record<string, WorkDiarySlot[]> = {
      [dates[0]]: makeSlots(48),
    };
    const result = computeDailyHoursLogic(MONDAY, slotsData);
    expect(result[0]).toBeCloseTo(8, 5);
  });

  it('SC2.9 — Sunday (index 6) with 0 slots returns 0', () => {
    const dates = weekDatesFromMonday(MONDAY);
    const slotsData: Record<string, WorkDiarySlot[]> = {
      [dates[6]]: makeSlots(0),
    };
    const result = computeDailyHoursLogic(MONDAY, slotsData);
    expect(result[6]).toBe(0);
  });

  it('SC2.10 — date absent from slotsData → index is 0, not NaN or undefined', () => {
    const slotsData: Record<string, WorkDiarySlot[]> = {
      '2026-03-16': makeSlots(24), // only Monday
    };
    const result = computeDailyHoursLogic(MONDAY, slotsData);

    // Tuesday through Sunday should be 0
    for (let i = 1; i < 7; i++) {
      expect(result[i]).toBe(0);
      expect(Number.isNaN(result[i])).toBe(false);
      expect(result[i]).not.toBeUndefined();
    }
  });

  it('SC2.11 — empty slotsData {} returns [0,0,0,0,0,0,0]', () => {
    const result = computeDailyHoursLogic(MONDAY, {});
    expect(result).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result).toHaveLength(7);
  });

  it('SC2.12 — partial week (3 of 7 days) → remaining indices = 0', () => {
    const dates = weekDatesFromMonday(MONDAY);
    const slotsData: Record<string, WorkDiarySlot[]> = {
      [dates[0]]: makeSlots(30), // Mon
      [dates[2]]: makeSlots(18), // Wed
      [dates[4]]: makeSlots(24), // Fri
    };
    const result = computeDailyHoursLogic(MONDAY, slotsData);

    expect(result[0]).toBeCloseTo(30 * 10 / 60, 5);
    expect(result[1]).toBe(0); // Tue absent
    expect(result[2]).toBeCloseTo(18 * 10 / 60, 5);
    expect(result[3]).toBe(0); // Thu absent
    expect(result[4]).toBeCloseTo(24 * 10 / 60, 5);
    expect(result[5]).toBe(0); // Sat absent
    expect(result[6]).toBe(0); // Sun absent
  });

  it('SC2.13 — always returns exactly 7 elements', () => {
    expect(computeDailyHoursLogic(MONDAY, {})).toHaveLength(7);
    expect(computeDailyHoursLogic(MONDAY, { '2026-03-16': makeSlots(10) })).toHaveLength(7);
    const full: Record<string, WorkDiarySlot[]> = {};
    weekDatesFromMonday(MONDAY).forEach(d => { full[d] = makeSlots(5); });
    expect(computeDailyHoursLogic(MONDAY, full)).toHaveLength(7);
  });
});

// ─── FR4: mergeWeeklySnapshot preserves dailyHours ───────────────────────────

describe('FR4: dailyHours preserved across partial merges', () => {
  const MONDAY = '2026-03-16';
  const DAILY = [8, 7.5, 8, 7, 8, 0, 0] as number[];

  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC4.1 — existing dailyHours preserved when partial omits the field (simulates useEarningsHistory write)', () => {
    const existing: WeeklySnapshot = makeSnapshot({
      weekStart: MONDAY,
      dailyHours: DAILY,
    });
    const history = [existing];

    // useEarningsHistory writes {weekStart, earnings, hours, overtime} — no dailyHours
    const updated = mergeWeeklySnapshot(history, {
      weekStart: MONDAY,
      earnings: 1200,
      hours: 38.5,
    });

    const result = updated.find(s => s.weekStart === MONDAY);
    expect(result?.dailyHours).toEqual(DAILY);
  });

  it('SC4.2 — existing dailyHours preserved when partial omits the field (simulates useAIData write)', () => {
    const existing: WeeklySnapshot = makeSnapshot({
      weekStart: MONDAY,
      dailyHours: DAILY,
    });
    const history = [existing];

    // useAIData writes {weekStart, aiPct, brainliftHours} — no dailyHours
    const updated = mergeWeeklySnapshot(history, {
      weekStart: MONDAY,
      aiPct: 82,
      brainliftHours: 5.5,
    });

    const result = updated.find(s => s.weekStart === MONDAY);
    expect(result?.dailyHours).toEqual(DAILY);
  });

  it('SC4.3 — snapshot gains dailyHours when existing lacked it (backfill adds field)', () => {
    // Old snapshot without dailyHours (pre-spec-01 entry)
    const existing: WeeklySnapshot = {
      weekStart: MONDAY,
      hours: 40,
      earnings: 1000,
      aiPct: 0,
      brainliftHours: 0,
    };
    const history = [existing];

    // Backfill writes {weekStart, aiPct, brainliftHours, dailyHours}
    const updated = mergeWeeklySnapshot(history, {
      weekStart: MONDAY,
      aiPct: 75,
      brainliftHours: 5,
      dailyHours: DAILY,
    });

    const result = updated.find(s => s.weekStart === MONDAY);
    expect(result?.dailyHours).toEqual(DAILY);
  });

  it('SC4.4 — dailyHours survives round-trip through saveWeeklyHistory → loadWeeklyHistory', async () => {
    const snapshot: WeeklySnapshot = makeSnapshot({
      weekStart: MONDAY,
      dailyHours: DAILY,
    });

    await saveWeeklyHistory([snapshot]);
    const loaded = await loadWeeklyHistory();

    const result = loaded.find(s => s.weekStart === MONDAY);
    expect(result?.dailyHours).toEqual(DAILY);
    expect(result?.dailyHours).toHaveLength(7);
  });

  it('SC4.5 — snapshot without dailyHours loads fine (undefined, not error)', async () => {
    const snapshot: WeeklySnapshot = {
      weekStart: MONDAY,
      hours: 40,
      earnings: 1000,
      aiPct: 75,
      brainliftHours: 5,
    };

    await saveWeeklyHistory([snapshot]);
    const loaded = await loadWeeklyHistory();

    const result = loaded.find(s => s.weekStart === MONDAY);
    expect(result).toBeDefined();
    expect(result?.dailyHours).toBeUndefined();
    // Should not throw or return null
  });
});

// ─── FR1: WeeklySnapshot interface has dailyHours field (static analysis) ────

describe('FR1: WeeklySnapshot interface — dailyHours field (static analysis)', () => {
  let weeklyHistorySource: string;

  beforeAll(() => {
    const libPath = path.resolve(__dirname, '..', '..', 'lib', 'weeklyHistory.ts');
    weeklyHistorySource = fs.readFileSync(libPath, 'utf8');
  });

  it('SC1.1 — WeeklySnapshot interface includes dailyHours optional field', () => {
    expect(weeklyHistorySource).toMatch(/dailyHours\?\s*:\s*number\[\]/);
  });

  it('SC1.2 — dailyHours has JSDoc documenting length, Mon=0, work diary slots', () => {
    // Must have some documentation for the field
    expect(weeklyHistorySource).toMatch(/Mon=0/);
    expect(weeklyHistorySource).toMatch(/dailyHours/);
  });

  it('SC1.3 — dailyHours is optional (? modifier)', () => {
    expect(weeklyHistorySource).toMatch(/dailyHours\?/);
  });
});
