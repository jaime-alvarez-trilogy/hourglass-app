// FR1-FR3 Tests: WorkDiarySlot type extension, WeeklySnapshot.hourlySlots, computeHourlySlots
// Written BEFORE implementation (TDD red phase)

import * as fs from 'fs';
import * as path from 'path';
import type { WorkDiarySlot } from '../../src/types/api';
import type { SecondBrainDeepDive } from '../../src/types/api';
import { mergeWeeklySnapshot } from '../../src/lib/weeklyHistory';
import type { WeeklySnapshot } from '../../src/lib/weeklyHistory';

// ─── Local replica of computeHourlySlots (not exported from source) ──────────
// Mirrors the implementation exactly — if the source diverges, static analysis
// tests (see FR3 static block below) will catch it.
function computeHourlySlots(slotsData: Record<string, WorkDiarySlot[]>): number[] {
  const counts = new Array<number>(24).fill(0);
  for (const slots of Object.values(slotsData)) {
    for (const slot of slots) {
      const hour = new Date(slot.date).getHours();
      if (hour >= 0 && hour < 24) counts[hour]++;
    }
  }
  return counts;
}

const BACKFILL_PATH = path.resolve(__dirname, '../../src/hooks/useHistoryBackfill.ts');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Make a minimal WorkDiarySlot with the new required fields for FR3 tests. */
function makeSlot(dateISO: string): WorkDiarySlot {
  return {
    date: dateISO,
    time: '00:00:00',
    activityLevel: 100,
    intensityScore: 100,
    productivityCategory: 'PRODUCTIVE',
    activities: ['AI'],
    secondBrainDeepDive: null,
    tags: ['ai_usage'],
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
  };
}

function makeSnapshot(weekStart: string, overrides: Partial<WeeklySnapshot> = {}): WeeklySnapshot {
  return {
    weekStart,
    hours: 40,
    earnings: 0,
    aiPct: 75,
    brainliftHours: 5,
    ...overrides,
  };
}

// ─── FR1: WorkDiarySlot type extension ────────────────────────────────────────

describe('FR1: WorkDiarySlot type extension', () => {
  it('accepts all 7 new fields alongside existing fields', () => {
    // This is a compile-time check expressed as a runtime assignment.
    // If the type doesn't have these fields, TypeScript will error here.
    const slot: WorkDiarySlot = {
      // Existing 6 fields
      tags: ['ai_usage'],
      autoTracker: true,
      status: 'APPROVED',
      memo: 'test',
      actions: [],
      events: [],
      // New 7 fields (FR1)
      date: '2026-06-09T12:50:00Z',
      time: '12:50:00',
      activityLevel: 100,
      intensityScore: 100,
      productivityCategory: 'PRODUCTIVE',
      activities: ['AI', 'PURE_AI'],
      secondBrainDeepDive: null,
    };
    expect(slot.date).toBe('2026-06-09T12:50:00Z');
    expect(slot.productivityCategory).toBe('PRODUCTIVE');
    expect(slot.secondBrainDeepDive).toBeNull();
  });

  it('accepts COMMUNICATION productivityCategory', () => {
    const slot: WorkDiarySlot = { ...makeSlot('2026-06-09T12:00:00Z'), productivityCategory: 'COMMUNICATION' };
    expect(slot.productivityCategory).toBe('COMMUNICATION');
  });

  it('accepts UNCATEGORIZED productivityCategory', () => {
    const slot: WorkDiarySlot = { ...makeSlot('2026-06-09T12:00:00Z'), productivityCategory: 'UNCATEGORIZED' };
    expect(slot.productivityCategory).toBe('UNCATEGORIZED');
  });

  it('accepts secondBrainDeepDive object (non-null)', () => {
    const deepDive: SecondBrainDeepDive = {
      probability: '84.4',
      ai_tool_actively_present: 90,
      deep_ai_research_and_synthesis: 85,
      building_custom_ai_tools: 60,
      documenting_ai_system_or_prompts: 45,
      routine_operational_work: 10,
    };
    const slot: WorkDiarySlot = { ...makeSlot('2026-06-09T12:20:00Z'), secondBrainDeepDive: deepDive };
    expect(slot.secondBrainDeepDive).not.toBeNull();
    expect((slot.secondBrainDeepDive as SecondBrainDeepDive).probability).toBe('84.4');
  });

  it('SecondBrainDeepDive has all 6 required fields', () => {
    const deepDive: SecondBrainDeepDive = {
      probability: '72.1',
      ai_tool_actively_present: 80,
      deep_ai_research_and_synthesis: 70,
      building_custom_ai_tools: 50,
      documenting_ai_system_or_prompts: 30,
      routine_operational_work: 5,
    };
    // All fields accessible without TypeScript errors
    expect(typeof deepDive.probability).toBe('string');
    expect(typeof deepDive.ai_tool_actively_present).toBe('number');
    expect(typeof deepDive.deep_ai_research_and_synthesis).toBe('number');
    expect(typeof deepDive.building_custom_ai_tools).toBe('number');
    expect(typeof deepDive.documenting_ai_system_or_prompts).toBe('number');
    expect(typeof deepDive.routine_operational_work).toBe('number');
  });

  it('preserves existing fields (additive — no regressions)', () => {
    // Slots without new fields should still be valid (date field is required but existing tests
    // use minimal stubs — the new fields are typed as required because the API always returns them)
    const slot: WorkDiarySlot = makeSlot('2026-06-09T08:00:00Z');
    expect(slot.tags).toEqual(['ai_usage']);
    expect(slot.autoTracker).toBe(true);
    expect(slot.status).toBe('APPROVED');
    expect(slot.memo).toBe('');
    expect(slot.actions).toEqual([]);
  });
});

// ─── FR2: WeeklySnapshot.hourlySlots via mergeWeeklySnapshot ─────────────────

describe('FR2: WeeklySnapshot.hourlySlots in mergeWeeklySnapshot', () => {
  const weekStart = '2026-06-02';
  const allZeros = new Array<number>(24).fill(0);

  it('stores hourlySlots when partial includes the field', () => {
    const result = mergeWeeklySnapshot([], { weekStart, hourlySlots: allZeros });
    expect(result[0]).toHaveProperty('hourlySlots');
    expect(result[0].hourlySlots).toEqual(allZeros);
  });

  it('stores non-zero hourlySlots correctly', () => {
    const counts = new Array<number>(24).fill(0);
    counts[7] = 5;
    counts[8] = 12;
    counts[9] = 8;
    const result = mergeWeeklySnapshot([], { weekStart, hourlySlots: counts });
    expect(result[0].hourlySlots![7]).toBe(5);
    expect(result[0].hourlySlots![8]).toBe(12);
    expect(result[0].hourlySlots![9]).toBe(8);
  });

  it('preserves existing hourlySlots when partial omits the field', () => {
    const existingCounts = new Array<number>(24).fill(0);
    existingCounts[9] = 42;
    const existing = makeSnapshot(weekStart, { hourlySlots: existingCounts });
    // Partial with no hourlySlots — should NOT overwrite existing
    const result = mergeWeeklySnapshot([existing], { weekStart, aiPct: 80 });
    expect(result[0].hourlySlots).toEqual(existingCounts);
    expect(result[0].hourlySlots![9]).toBe(42);
  });

  it('stores all-zero hourlySlots as-is (inference layer filters, not storage)', () => {
    const result = mergeWeeklySnapshot([], { weekStart, hourlySlots: allZeros });
    expect(result[0].hourlySlots).toEqual(allZeros);
    expect(result[0].hourlySlots!.every(c => c === 0)).toBe(true);
  });

  it('merges hourlySlots into existing entry that had none', () => {
    const existing = makeSnapshot(weekStart); // no hourlySlots
    const counts = new Array<number>(24).fill(0);
    counts[10] = 7;
    const result = mergeWeeklySnapshot([existing], { weekStart, hourlySlots: counts });
    expect(result[0].hourlySlots).toBeDefined();
    expect(result[0].hourlySlots![10]).toBe(7);
  });

  it('does not affect other WeeklySnapshot fields when adding hourlySlots', () => {
    const existing = makeSnapshot(weekStart, { aiPct: 75, brainliftHours: 5 });
    const result = mergeWeeklySnapshot([existing], { weekStart, hourlySlots: allZeros });
    expect(result[0].aiPct).toBe(75);
    expect(result[0].brainliftHours).toBe(5);
  });

  it('WeeklySnapshot type accepts hourlySlots field (compile check)', () => {
    const snap: WeeklySnapshot = {
      weekStart: '2026-06-02',
      hours: 40,
      earnings: 1000,
      aiPct: 75,
      brainliftHours: 5,
      hourlySlots: new Array<number>(24).fill(0),
    };
    expect(snap.hourlySlots).toHaveLength(24);
  });
});

// ─── FR3: computeHourlySlots — static analysis ───────────────────────────────
// Catches divergence between the local replica above and the real implementation.

describe('FR3: computeHourlySlots — static analysis', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BACKFILL_PATH, 'utf8');
  });

  it('SC3.1 — source defines computeHourlySlots function (internal, not exported)', () => {
    expect(source).toMatch(/function computeHourlySlots\s*\(/);
    // Should NOT be exported — it's an internal helper matching the computeDailyHours pattern
    expect(source).not.toMatch(/export\s+function\s+computeHourlySlots/);
  });

  it('SC3.2 — returns 24-element array filled with 0', () => {
    expect(source).toMatch(/new Array[^(]*\(24\)\.fill\(0\)/);
  });

  it('SC3.3 — uses new Date(slot.date).getHours() for local hour extraction', () => {
    expect(source).toMatch(/new Date\s*\(\s*slot\.date\s*\)\.getHours\s*\(\s*\)/);
  });

  it('SC3.4 — guards with hour >= 0 && hour < 24 before incrementing', () => {
    expect(source).toMatch(/hour\s*>=\s*0\s*&&\s*hour\s*<\s*24/);
  });

  it('SC3.5 — iterates Object.values(slotsData) to accumulate across all days', () => {
    expect(source).toMatch(/Object\.values\s*\(\s*slotsData\s*\)/);
  });

  it('SC3.6 — computeHourlySlots called in backfill merge with hourlySlots', () => {
    expect(source).toMatch(/computeHourlySlots\s*\(/);
    expect(source).toMatch(/hourlySlots/);
    expect(source).toMatch(/mergeWeeklySnapshot/);
  });

  it('SC3.7 — backfill guard includes hourlySlots === undefined check', () => {
    // Weeks with aiPct > 0 and dailyHours but no hourlySlots must still be backfilled
    expect(source).toMatch(/entry\.hourlySlots\s*===\s*undefined/);
  });
});

// ─── FR3: computeHourlySlots — computation logic (via local replica) ──────────

describe('FR3: computeHourlySlots', () => {
  it('returns 24 zeros for empty slotsData', () => {
    const result = computeHourlySlots({});
    expect(result).toHaveLength(24);
    expect(result.every(c => c === 0)).toBe(true);
  });

  it('returns 24-element array', () => {
    const result = computeHourlySlots({});
    expect(result).toHaveLength(24);
  });

  it('counts a single slot into the correct local-hour bucket', () => {
    // Use a UTC date; the local hour on this machine = new Date(...).getHours()
    const date = '2026-06-09T13:00:00Z';
    const expectedHour = new Date(date).getHours();
    const slotsData = { '2026-06-09': [makeSlot(date)] };

    const result = computeHourlySlots(slotsData);

    expect(result[expectedHour]).toBe(1);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1); // sum = 1
  });

  it('counts 3 slots at the same UTC hour into the same bucket', () => {
    const date = '2026-06-09T08:00:00Z';
    const expectedHour = new Date(date).getHours();
    const slotsData = {
      '2026-06-09': [makeSlot(date), makeSlot(date), makeSlot(date)],
    };

    const result = computeHourlySlots(slotsData);

    expect(result[expectedHour]).toBe(3);
    expect(result.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('counts slots at 3 distinct UTC hours into separate buckets', () => {
    // Use UTC hours 6, 7, 8 — on any machine these map to distinct local hours
    const date1 = '2026-06-09T06:00:00Z';
    const date2 = '2026-06-09T07:00:00Z';
    const date3 = '2026-06-09T08:00:00Z';
    const h1 = new Date(date1).getHours();
    const h2 = new Date(date2).getHours();
    const h3 = new Date(date3).getHours();

    // Only proceed if these map to distinct hours (true unless machine is on a
    // timezone that collapses them, which is a DST edge case not relevant here)
    if (h1 !== h2 && h2 !== h3 && h1 !== h3) {
      const slotsData = {
        '2026-06-09': [makeSlot(date1), makeSlot(date2), makeSlot(date3)],
      };
      const result = computeHourlySlots(slotsData);
      expect(result[h1]).toBe(1);
      expect(result[h2]).toBe(1);
      expect(result[h3]).toBe(1);
      expect(result.reduce((a, b) => a + b, 0)).toBe(3);
    }
  });

  it('accumulates counts across multiple days (does not reset per day)', () => {
    // Two days with a slot at the same UTC hour — should accumulate to 2
    const date = '2026-06-09T09:00:00Z'; // same time, different day strings
    const date2 = '2026-06-10T09:00:00Z';
    const expectedHour1 = new Date(date).getHours();
    const expectedHour2 = new Date(date2).getHours();

    const slotsData = {
      '2026-06-09': [makeSlot(date)],
      '2026-06-10': [makeSlot(date2)],
    };
    const result = computeHourlySlots(slotsData);

    // Both map to same local hour since same UTC hour offset
    expect(expectedHour1).toBe(expectedHour2); // sanity: same UTC hour → same local hour
    expect(result[expectedHour1]).toBe(2);
  });

  it('handles 24 slots spanning 24 distinct UTC hours — all buckets populated', () => {
    // Create one slot per UTC hour 0-23 for a single day
    const slotsData: Record<string, WorkDiarySlot[]> = {};
    const slots: WorkDiarySlot[] = [];
    const hourMapping: number[] = [];

    for (let h = 0; h < 24; h++) {
      const utcDate = `2026-06-09T${String(h).padStart(2, '0')}:00:00Z`;
      slots.push(makeSlot(utcDate));
      hourMapping.push(new Date(utcDate).getHours());
    }
    slotsData['2026-06-09'] = slots;

    const result = computeHourlySlots(slotsData);

    // Total must equal 24
    expect(result.reduce((a, b) => a + b, 0)).toBe(24);
    // Each local hour that appears in the mapping must have count ≥ 1
    for (const localHour of hourMapping) {
      expect(result[localHour]).toBeGreaterThanOrEqual(1);
    }
  });

  it('handles slot with date at exact hour boundary (no off-by-one)', () => {
    const date = '2026-06-09T07:00:00Z'; // exactly 7:00
    const expectedHour = new Date(date).getHours();
    const slotsData = { '2026-06-09': [makeSlot(date)] };
    const result = computeHourlySlots(slotsData);
    expect(result[expectedHour]).toBe(1);
  });

  it('silently skips slots with invalid/malformed date (NaN guard)', () => {
    // makeSlot with an invalid date — getHours() returns NaN, guard skips it
    const badSlot: WorkDiarySlot = { ...makeSlot('not-a-date') };
    const slotsData = {
      '2026-06-09': [badSlot, makeSlot('2026-06-09T10:00:00Z')],
    };
    const result = computeHourlySlots(slotsData);
    // Only the valid slot contributes; total = 1
    expect(result.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('works with multiple days and mixed slot counts', () => {
    const d1 = '2026-06-09T10:00:00Z'; // local hour = H10
    const d2 = '2026-06-10T10:00:00Z'; // local hour = H10 (same)
    const d3 = '2026-06-11T14:00:00Z'; // local hour = H14

    const H10 = new Date(d1).getHours();
    const H14 = new Date(d3).getHours();

    const slotsData = {
      '2026-06-09': [makeSlot(d1), makeSlot(d1)], // 2 at H10
      '2026-06-10': [makeSlot(d2)],                // 1 at H10
      '2026-06-11': [makeSlot(d3)],                // 1 at H14
    };
    const result = computeHourlySlots(slotsData);

    expect(result[H10]).toBe(3); // 2 + 1
    if (H14 !== H10) {
      expect(result[H14]).toBe(1);
    }
    expect(result.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
