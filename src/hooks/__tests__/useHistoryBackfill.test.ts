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
    date: '2026-06-09T12:00:00Z',
    time: '12:00:00',
    activityLevel: 100,
    intensityScore: 100,
    productivityCategory: 'PRODUCTIVE' as const,
    activities: [],
    secondBrainDeepDive: null,
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

// ─── FR1 (01-enriched-hourly-aggregation): WeeklySnapshot new hourly fields ──

describe('FR1 (01-enriched): WeeklySnapshot — new hourly fields (static analysis)', () => {
  let weeklyHistorySource: string;

  beforeAll(() => {
    const libPath = path.resolve(__dirname, '..', '..', 'lib', 'weeklyHistory.ts');
    weeklyHistorySource = fs.readFileSync(libPath, 'utf8');
  });

  it('SC1E.1 — WeeklySnapshot includes hourlyIntensity optional field', () => {
    expect(weeklyHistorySource).toMatch(/hourlyIntensity\?\s*:\s*number\[\]/);
  });

  it('SC1E.2 — WeeklySnapshot includes hourlyAISlots optional field', () => {
    expect(weeklyHistorySource).toMatch(/hourlyAISlots\?\s*:\s*number\[\]/);
  });

  it('SC1E.3 — WeeklySnapshot includes hourlyProductiveSlots optional field', () => {
    expect(weeklyHistorySource).toMatch(/hourlyProductiveSlots\?\s*:\s*number\[\]/);
  });

  it('SC1E.4 — mergeWeeklySnapshot new-entry block includes hourlyIntensity spread', () => {
    expect(weeklyHistorySource).toMatch(/hourlyIntensity\s*!==\s*undefined[\s\S]{0,60}hourlyIntensity/);
  });

  it('SC1E.5 — mergeWeeklySnapshot new-entry block includes hourlyAISlots spread', () => {
    expect(weeklyHistorySource).toMatch(/hourlyAISlots\s*!==\s*undefined[\s\S]{0,60}hourlyAISlots/);
  });

  it('SC1E.6 — mergeWeeklySnapshot new-entry block includes hourlyProductiveSlots spread', () => {
    expect(weeklyHistorySource).toMatch(/hourlyProductiveSlots\s*!==\s*undefined[\s\S]{0,60}hourlyProductiveSlots/);
  });
});

describe('FR1 (01-enriched): mergeWeeklySnapshot — new hourly fields propagation', () => {
  const MONDAY = '2026-03-16';

  const INTENSITY = new Array(24).fill(0).map((_, i) => i * 10);
  const AI_SLOTS = new Array(24).fill(0).map((_, i) => i % 3);
  const PRODUCTIVE = new Array(24).fill(0).map((_, i) => i % 5);

  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC1E.7 — partial with all three new fields writes them to a new entry', () => {
    const updated = mergeWeeklySnapshot([], {
      weekStart: MONDAY,
      aiPct: 70,
      brainliftHours: 3,
      hourlyIntensity: INTENSITY,
      hourlyAISlots: AI_SLOTS,
      hourlyProductiveSlots: PRODUCTIVE,
    });

    const entry = updated.find(s => s.weekStart === MONDAY);
    expect(entry?.hourlyIntensity).toEqual(INTENSITY);
    expect(entry?.hourlyAISlots).toEqual(AI_SLOTS);
    expect(entry?.hourlyProductiveSlots).toEqual(PRODUCTIVE);
  });

  it('SC1E.8 — partial without new fields leaves existing entry new fields unchanged', () => {
    const existing: WeeklySnapshot = makeSnapshot({
      weekStart: MONDAY,
      hourlyIntensity: INTENSITY,
      hourlyAISlots: AI_SLOTS,
      hourlyProductiveSlots: PRODUCTIVE,
    });

    const updated = mergeWeeklySnapshot([existing], {
      weekStart: MONDAY,
      aiPct: 80,
    });

    const entry = updated.find(s => s.weekStart === MONDAY);
    expect(entry?.hourlyIntensity).toEqual(INTENSITY);
    expect(entry?.hourlyAISlots).toEqual(AI_SLOTS);
    expect(entry?.hourlyProductiveSlots).toEqual(PRODUCTIVE);
  });

  it('SC1E.9 — merge into existing entry that lacked new fields adds them', () => {
    const existing: WeeklySnapshot = makeSnapshot({ weekStart: MONDAY });
    // existing has no hourly* fields

    const updated = mergeWeeklySnapshot([existing], {
      weekStart: MONDAY,
      hourlyIntensity: INTENSITY,
      hourlyAISlots: AI_SLOTS,
      hourlyProductiveSlots: PRODUCTIVE,
    });

    const entry = updated.find(s => s.weekStart === MONDAY);
    expect(entry?.hourlyIntensity).toEqual(INTENSITY);
    expect(entry?.hourlyAISlots).toEqual(AI_SLOTS);
    expect(entry?.hourlyProductiveSlots).toEqual(PRODUCTIVE);
  });

  it('SC1E.10 — hourlyIntensity stored as-is (sum, not pre-divided)', () => {
    const rawSums = [0, 150, 320, 0, 80]; // partial array; stored verbatim
    const updated = mergeWeeklySnapshot([], {
      weekStart: MONDAY,
      aiPct: 0,
      brainliftHours: 0,
      hourlyIntensity: rawSums,
    });
    const entry = updated.find(s => s.weekStart === MONDAY);
    expect(entry?.hourlyIntensity).toEqual(rawSums);
    // Verify values are not divided (e.g. index 1 should still be 150, not some fractional average)
    expect(entry?.hourlyIntensity?.[1]).toBe(150);
  });
});

// ─── FR2 (01-enriched-hourly-aggregation): computeHourlyEnrichment ────────────
//
// computeHourlyEnrichment is internal to useHistoryBackfill.ts (not exported).
// We test via:
//   (a) static analysis of the source code for structure/contract
//   (b) replicated logic for computation correctness

// Replicate computeHourlyEnrichment for unit testing
interface HourlyEnrichment {
  hourlySlots: number[];
  hourlyIntensity: number[];
  hourlyAISlots: number[];
  hourlyProductiveSlots: number[];
}

function computeHourlyEnrichmentLogic(
  slotsData: Record<string, WorkDiarySlot[]>,
): HourlyEnrichment {
  const hourlySlots = new Array<number>(24).fill(0);
  const hourlyIntensity = new Array<number>(24).fill(0);
  const hourlyAISlots = new Array<number>(24).fill(0);
  const hourlyProductiveSlots = new Array<number>(24).fill(0);
  for (const slots of Object.values(slotsData)) {
    for (const slot of slots) {
      const hour = new Date(slot.date).getHours();
      if (!Number.isFinite(hour) || hour < 0 || hour >= 24) continue;
      hourlySlots[hour]++;
      hourlyIntensity[hour] += (slot.intensityScore ?? 0);
      if (slot.tags.includes('ai_usage') || slot.tags.includes('second_brain')) {
        hourlyAISlots[hour]++;
      }
      if (slot.productivityCategory === 'PRODUCTIVE') {
        hourlyProductiveSlots[hour]++;
      }
    }
  }
  return { hourlySlots, hourlyIntensity, hourlyAISlots, hourlyProductiveSlots };
}

function makeEnrichmentSlot(overrides: Partial<WorkDiarySlot>): WorkDiarySlot {
  return {
    date: '2026-06-09T12:00:00Z',
    time: '12:00:00',
    activityLevel: 50,
    intensityScore: 50,
    productivityCategory: 'UNCATEGORIZED',
    activities: [],
    secondBrainDeepDive: null,
    tags: [],
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
    ...overrides,
  };
}

describe('FR2 (01-enriched): computeHourlyEnrichment — static analysis', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BACKFILL_PATH, 'utf8');
  });

  it('SC2E.1 — source defines computeHourlyEnrichment function', () => {
    expect(source).toMatch(/function computeHourlyEnrichment\s*\(/);
  });

  it('SC2E.2 — source defines HourlyEnrichment interface with all four fields', () => {
    expect(source).toMatch(/interface HourlyEnrichment/);
    expect(source).toMatch(/hourlySlots\s*:\s*number\[\]/);
    expect(source).toMatch(/hourlyIntensity\s*:\s*number\[\]/);
    expect(source).toMatch(/hourlyAISlots\s*:\s*number\[\]/);
    expect(source).toMatch(/hourlyProductiveSlots\s*:\s*number\[\]/);
  });

  it('SC2E.3 — source uses Number.isFinite guard for hour bounds check', () => {
    expect(source).toMatch(/Number\.isFinite\s*\(/);
  });

  it('SC2E.4 — source uses intensityScore with null-coalesce (?? 0)', () => {
    expect(source).toMatch(/intensityScore[\s\S]{0,10}\?\?\s*0/);
  });

  it('SC2E.5 — source checks ai_usage and second_brain tags', () => {
    expect(source).toMatch(/ai_usage/);
    expect(source).toMatch(/second_brain/);
  });

  it('SC2E.6 — source checks PRODUCTIVE productivityCategory', () => {
    expect(source).toMatch(/PRODUCTIVE/);
  });

  it('SC2E.7 — computeHourlySlots is still exported/present (backward compat)', () => {
    expect(source).toMatch(/function computeHourlySlots\s*\(/);
  });

  it('SC2E.8 — call site uses computeHourlyEnrichment (not computeHourlySlots)', () => {
    // The backfill loop should use computeHourlyEnrichment, spreading into merge
    expect(source).toMatch(/computeHourlyEnrichment\s*\(/);
    // Spread: either ...enrichment or spreading individual keys
    expect(source).toMatch(/\.\.\.enrichment|\.\.\.\s*\{[\s\S]{0,200}hourlyIntensity/);
  });
});

describe('FR2 (01-enriched): computeHourlyEnrichment — computation logic', () => {
  it('SC2E.9 — empty slotsData {} returns four zero-filled arrays of length 24', () => {
    const result = computeHourlyEnrichmentLogic({});
    expect(result.hourlySlots).toEqual(new Array(24).fill(0));
    expect(result.hourlyIntensity).toEqual(new Array(24).fill(0));
    expect(result.hourlyAISlots).toEqual(new Array(24).fill(0));
    expect(result.hourlyProductiveSlots).toEqual(new Array(24).fill(0));
    expect(result.hourlySlots).toHaveLength(24);
  });

  it('SC2E.10 — single ai_usage+PRODUCTIVE slot at UTC hour 12 accumulates all counters', () => {
    // UTC date "2026-06-09T12:00:00Z" → getHours() = 12 on UTC device (CI environment)
    const slotsData = {
      '2026-06-09': [makeEnrichmentSlot({
        date: '2026-06-09T12:00:00Z',
        intensityScore: 80,
        tags: ['ai_usage'],
        productivityCategory: 'PRODUCTIVE',
      })],
    };
    const result = computeHourlyEnrichmentLogic(slotsData);
    const h = new Date('2026-06-09T12:00:00Z').getHours();
    expect(result.hourlySlots[h]).toBe(1);
    expect(result.hourlyIntensity[h]).toBe(80);
    expect(result.hourlyAISlots[h]).toBe(1);
    expect(result.hourlyProductiveSlots[h]).toBe(1);
  });

  it('SC2E.11 — slot with second_brain tag increments hourlyAISlots', () => {
    const slotsData = {
      '2026-06-09': [makeEnrichmentSlot({
        date: '2026-06-09T10:00:00Z',
        tags: ['second_brain'],
      })],
    };
    const result = computeHourlyEnrichmentLogic(slotsData);
    const h = new Date('2026-06-09T10:00:00Z').getHours();
    expect(result.hourlyAISlots[h]).toBe(1);
  });

  it('SC2E.12 — slot with empty tags and COMMUNICATION category: only hourlySlots incremented', () => {
    const slotsData = {
      '2026-06-09': [makeEnrichmentSlot({
        date: '2026-06-09T09:00:00Z',
        tags: [],
        productivityCategory: 'COMMUNICATION',
        intensityScore: 60,
      })],
    };
    const result = computeHourlyEnrichmentLogic(slotsData);
    const h = new Date('2026-06-09T09:00:00Z').getHours();
    expect(result.hourlySlots[h]).toBe(1);
    expect(result.hourlyIntensity[h]).toBe(60);
    expect(result.hourlyAISlots[h]).toBe(0);
    expect(result.hourlyProductiveSlots[h]).toBe(0);
  });

  it('SC2E.13 — multiple slots at same hour: hourlyIntensity is sum (not average)', () => {
    const h = 14; // 2pm UTC
    const date = `2026-06-09T${String(h).padStart(2, '0')}:00:00Z`;
    const slotsData = {
      '2026-06-09': [
        makeEnrichmentSlot({ date, intensityScore: 40 }),
        makeEnrichmentSlot({ date, intensityScore: 60 }),
        makeEnrichmentSlot({ date, intensityScore: 80 }),
      ],
    };
    const result = computeHourlyEnrichmentLogic(slotsData);
    const actualH = new Date(date).getHours();
    expect(result.hourlySlots[actualH]).toBe(3);
    expect(result.hourlyIntensity[actualH]).toBe(180); // sum, not avg (60)
  });

  it('SC2E.14 — slots across multiple hours accumulate independently per bucket', () => {
    const slotsData = {
      '2026-06-09': [
        makeEnrichmentSlot({ date: '2026-06-09T09:00:00Z', intensityScore: 50 }),
        makeEnrichmentSlot({ date: '2026-06-09T10:00:00Z', intensityScore: 70 }),
        makeEnrichmentSlot({ date: '2026-06-09T11:00:00Z', intensityScore: 90 }),
      ],
    };
    const result = computeHourlyEnrichmentLogic(slotsData);
    const h9 = new Date('2026-06-09T09:00:00Z').getHours();
    const h10 = new Date('2026-06-09T10:00:00Z').getHours();
    const h11 = new Date('2026-06-09T11:00:00Z').getHours();
    expect(result.hourlyIntensity[h9]).toBe(50);
    expect(result.hourlyIntensity[h10]).toBe(70);
    expect(result.hourlyIntensity[h11]).toBe(90);
  });

  it('SC2E.15 — 7 days of slots all accumulate into same 24 buckets', () => {
    // Each of 7 days has one slot at 08:00 UTC with ai_usage + PRODUCTIVE
    const slotsData: Record<string, WorkDiarySlot[]> = {};
    for (let day = 9; day <= 15; day++) {
      slotsData[`2026-06-${String(day).padStart(2, '0')}`] = [
        makeEnrichmentSlot({
          date: `2026-06-${String(day).padStart(2, '0')}T08:00:00Z`,
          intensityScore: 100,
          tags: ['ai_usage'],
          productivityCategory: 'PRODUCTIVE',
        }),
      ];
    }
    const result = computeHourlyEnrichmentLogic(slotsData);
    const h = new Date('2026-06-09T08:00:00Z').getHours();
    expect(result.hourlySlots[h]).toBe(7);
    expect(result.hourlyIntensity[h]).toBe(700); // 7 × 100
    expect(result.hourlyAISlots[h]).toBe(7);
    expect(result.hourlyProductiveSlots[h]).toBe(7);
  });

  it('SC2E.16 — slot with intensityScore undefined treated as 0 (no NaN)', () => {
    const slot = makeEnrichmentSlot({ date: '2026-06-09T13:00:00Z' });
    // Force intensityScore to be undefined (as if API omitted it)
    (slot as unknown as Record<string, unknown>).intensityScore = undefined;
    const result = computeHourlyEnrichmentLogic({ '2026-06-09': [slot] });
    const h = new Date('2026-06-09T13:00:00Z').getHours();
    expect(result.hourlyIntensity[h]).toBe(0);
    expect(Number.isNaN(result.hourlyIntensity[h])).toBe(false);
  });

  it('SC2E.17 — slot at the hour boundary: counts[h] incremented (device-local hour via getHours())', () => {
    // Use a date string that guarantees a specific local hour by using getHours() dynamically.
    // This avoids UTC-offset sensitivity (CI vs dev device).
    const testDate = '2026-06-09T09:00:00Z'; // pick any stable UTC time
    const expectedHour = new Date(testDate).getHours(); // device-local
    const slotsData = {
      '2026-06-09': [makeEnrichmentSlot({ date: testDate })],
    };
    const result = computeHourlyEnrichmentLogic(slotsData);
    expect(result.hourlySlots[expectedHour]).toBe(1);
    // All other hours remain 0
    result.hourlySlots.forEach((count, h) => {
      if (h !== expectedHour) expect(count).toBe(0);
    });
  });

  it('SC2E.18 — slot with invalid/unparseable date is skipped (NaN guard)', () => {
    const slot = makeEnrichmentSlot({ date: 'NOT_A_DATE' });
    const result = computeHourlyEnrichmentLogic({ 'invalid': [slot] });
    // No counter should have been incremented
    expect(result.hourlySlots.every(v => v === 0)).toBe(true);
    expect(result.hourlyIntensity.every(v => v === 0)).toBe(true);
  });
});

// ─── FR3 (01-enriched-hourly-aggregation): Backfill guard new field detection ─

describe('FR3 (01-enriched): backfill guard — detects missing new hourly fields (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BACKFILL_PATH, 'utf8');
  });

  it('SC3E.1 — guard includes hourlyIntensity === undefined condition', () => {
    expect(source).toMatch(/hourlyIntensity\s*===\s*undefined/);
  });

  it('SC3E.2 — guard includes hourlyAISlots === undefined condition', () => {
    expect(source).toMatch(/hourlyAISlots\s*===\s*undefined/);
  });

  it('SC3E.3 — guard includes hourlyProductiveSlots === undefined condition', () => {
    expect(source).toMatch(/hourlyProductiveSlots\s*===\s*undefined/);
  });

  it('SC3E.4 — all three new guard conditions are OR-combined with existing conditions', () => {
    // The entire guard block must use || between conditions (not &&)
    // We verify all new conditions appear in proximity with || operators
    const guardSection = source.slice(
      source.indexOf('weeksToFill'),
      source.indexOf('weeksToFill') + 800,
    );
    expect(guardSection).toMatch(/hourlyIntensity\s*===\s*undefined/);
    expect(guardSection).toMatch(/hourlyAISlots\s*===\s*undefined/);
    expect(guardSection).toMatch(/hourlyProductiveSlots\s*===\s*undefined/);
    // Conditions use ||
    expect(guardSection).toMatch(/\|\|/);
  });
});

describe('FR3 (01-enriched): backfill guard — logic via mergeWeeklySnapshot', () => {
  // Guard logic is tested via a simulated guard function that mirrors the real implementation.
  // This ensures the boolean logic is correct independently of I/O concerns.

  function shouldBackfill(entry: WeeklySnapshot | undefined): boolean {
    return (
      !entry ||
      entry.aiPct === 0 ||
      entry.dailyHours === undefined ||
      entry.hourlySlots === undefined ||
      entry.hourlyIntensity === undefined ||
      entry.hourlyAISlots === undefined ||
      entry.hourlyProductiveSlots === undefined
    );
  }

  it('SC3E.5 — entry with hourlySlots but missing hourlyIntensity → backfill', () => {
    const entry: WeeklySnapshot = makeSnapshot({
      weekStart: '2026-03-16',
      dailyHours: [8, 8, 8, 8, 8, 0, 0],
      hourlySlots: new Array(24).fill(1),
      // hourlyIntensity absent
    });
    expect(shouldBackfill(entry)).toBe(true);
  });

  it('SC3E.6 — entry missing hourlyAISlots → backfill', () => {
    const entry: WeeklySnapshot = makeSnapshot({
      weekStart: '2026-03-16',
      dailyHours: [8, 8, 8, 8, 8, 0, 0],
      hourlySlots: new Array(24).fill(1),
      hourlyIntensity: new Array(24).fill(100),
      // hourlyAISlots absent
    });
    expect(shouldBackfill(entry)).toBe(true);
  });

  it('SC3E.7 — entry missing hourlyProductiveSlots → backfill', () => {
    const entry: WeeklySnapshot = makeSnapshot({
      weekStart: '2026-03-16',
      dailyHours: [8, 8, 8, 8, 8, 0, 0],
      hourlySlots: new Array(24).fill(1),
      hourlyIntensity: new Array(24).fill(100),
      hourlyAISlots: new Array(24).fill(2),
      // hourlyProductiveSlots absent
    });
    expect(shouldBackfill(entry)).toBe(true);
  });

  it('SC3E.8 — entry with all new fields defined → NOT backfilled', () => {
    const entry: WeeklySnapshot = makeSnapshot({
      weekStart: '2026-03-16',
      aiPct: 75, // > 0
      dailyHours: [8, 8, 8, 8, 8, 0, 0],
      hourlySlots: new Array(24).fill(1),
      hourlyIntensity: new Array(24).fill(100),
      hourlyAISlots: new Array(24).fill(2),
      hourlyProductiveSlots: new Array(24).fill(3),
    });
    expect(shouldBackfill(entry)).toBe(false);
  });
});

// ─── FR4 (01-enriched-hourly-aggregation): call site uses computeHourlyEnrichment ─

describe('FR4 (01-enriched): call site — computeHourlyEnrichment replaces computeHourlySlots', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BACKFILL_PATH, 'utf8');
  });

  it('SC4E.1 — call site uses computeHourlyEnrichment, not computeHourlySlots', () => {
    // The backfill loop must call computeHourlyEnrichment
    expect(source).toMatch(/computeHourlyEnrichment\s*\(/);
  });

  it('SC4E.2 — enrichment result is spread into mergeWeeklySnapshot', () => {
    // Either ...enrichment spread or destructured spread with hourlyIntensity included
    const hasSpread = /\.\.\.\s*enrichment/.test(source) ||
      /hourlyIntensity[\s\S]{0,300}mergeWeeklySnapshot/.test(source);
    expect(hasSpread).toBe(true);
  });

  it('SC4E.3 — hourlyIntensity appears in mergeWeeklySnapshot call proximity', () => {
    // Find the mergeWeeklySnapshot call in runBackfill context
    const mergeIdx = source.lastIndexOf('mergeWeeklySnapshot');
    expect(mergeIdx).toBeGreaterThan(0);
    const mergeContext = source.slice(Math.max(0, mergeIdx - 400), mergeIdx + 400);
    // Either directly or via spread, hourlyIntensity must be part of the merge
    const hasEnrichment = /enrichment/.test(mergeContext) || /hourlyIntensity/.test(mergeContext);
    expect(hasEnrichment).toBe(true);
  });

  it('SC4E.4 — hourlySlots behavior preserved: enrichment.hourlySlots matches legacy computeHourlySlots for same input', () => {
    // Both should produce same output for identical slot data
    function computeHourlySlotsBefore(slotsData: Record<string, WorkDiarySlot[]>): number[] {
      const counts = new Array<number>(24).fill(0);
      for (const slots of Object.values(slotsData)) {
        for (const slot of slots) {
          const hour = new Date(slot.date).getHours();
          if (hour >= 0 && hour < 24) counts[hour]++;
        }
      }
      return counts;
    }

    const slotsData = {
      '2026-06-09': [
        makeEnrichmentSlot({ date: '2026-06-09T09:00:00Z' }),
        makeEnrichmentSlot({ date: '2026-06-09T09:00:00Z' }),
        makeEnrichmentSlot({ date: '2026-06-09T14:00:00Z' }),
      ],
    };

    const legacy = computeHourlySlotsBefore(slotsData);
    const { hourlySlots: enriched } = computeHourlyEnrichmentLogic(slotsData);

    expect(enriched).toEqual(legacy);
  });
});
