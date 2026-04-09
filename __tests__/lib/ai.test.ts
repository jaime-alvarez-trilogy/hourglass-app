// FR3, FR4, FR5 Tests: countDiaryTags, aggregateAICache, shouldRefetchDay
// Written BEFORE implementation (TDD red phase)

import {
  countDiaryTags,
  aggregateAICache,
  shouldRefetchDay,
} from '../../src/lib/ai';
import type { TagData } from '../../src/lib/ai';
import type { WorkDiarySlot } from '../../src/types/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(tags: string[]): WorkDiarySlot {
  return {
    tags,
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
  };
}

function makeTagData(overrides: Partial<TagData> = {}): TagData {
  return { total: 0, aiUsage: 0, secondBrain: 0, noTags: 0, ...overrides };
}

// ─── countDiaryTags ───────────────────────────────────────────────────────────

describe('FR3: countDiaryTags', () => {
  it('returns all zeros for empty array', () => {
    const result = countDiaryTags([]);
    expect(result).toEqual({ total: 0, aiUsage: 0, secondBrain: 0, noTags: 0 });
  });

  it('counts ai_usage slots in aiUsage', () => {
    const result = countDiaryTags([makeSlot(['ai_usage'])]);
    expect(result.aiUsage).toBe(1);
    expect(result.secondBrain).toBe(0);
    expect(result.noTags).toBe(0);
    expect(result.total).toBe(1);
  });

  it('counts second_brain slots in both aiUsage and secondBrain', () => {
    const result = countDiaryTags([makeSlot(['second_brain'])]);
    expect(result.aiUsage).toBe(1);
    expect(result.secondBrain).toBe(1);
    expect(result.total).toBe(1);
  });

  it('counts slot with BOTH ai_usage AND second_brain once in aiUsage (union, not addition)', () => {
    const result = countDiaryTags([makeSlot(['ai_usage', 'second_brain'])]);
    expect(result.aiUsage).toBe(1); // counted once, not twice
    expect(result.secondBrain).toBe(1);
    expect(result.total).toBe(1);
  });

  it('counts empty tags array in noTags', () => {
    const result = countDiaryTags([makeSlot([])]);
    expect(result.noTags).toBe(1);
    expect(result.aiUsage).toBe(0);
    expect(result.secondBrain).toBe(0);
    expect(result.total).toBe(1);
  });

  it('handles mixed 4-slot scenario: ai_usage, second_brain, empty, both', () => {
    const slots = [
      makeSlot(['ai_usage']),
      makeSlot(['second_brain']),
      makeSlot([]),
      makeSlot(['ai_usage', 'second_brain']),
    ];
    const result = countDiaryTags(slots);
    expect(result.total).toBe(4);
    expect(result.aiUsage).toBe(3);   // slot1 + slot2 + slot4
    expect(result.secondBrain).toBe(2); // slot2 + slot4
    expect(result.noTags).toBe(1);    // slot3
  });

  it('not_second_brain does NOT increment secondBrain (exact tag match, not substring)', () => {
    const result = countDiaryTags([makeSlot(['not_second_brain'])]);
    expect(result.secondBrain).toBe(0);
  });

  it('not_second_brain does NOT increment aiUsage', () => {
    const result = countDiaryTags([makeSlot(['not_second_brain'])]);
    expect(result.aiUsage).toBe(0);
  });

  it('not_second_brain with non-empty tags does NOT count as noTags', () => {
    const result = countDiaryTags([makeSlot(['not_second_brain'])]);
    expect(result.noTags).toBe(0);
    expect(result.total).toBe(1);
  });

  it('AI_USAGE (uppercase) does NOT match ai_usage (case-sensitive)', () => {
    const result = countDiaryTags([makeSlot(['AI_USAGE'])]);
    expect(result.aiUsage).toBe(0);
  });

  it('SECOND_BRAIN (uppercase) does NOT match second_brain', () => {
    const result = countDiaryTags([makeSlot(['SECOND_BRAIN'])]);
    expect(result.secondBrain).toBe(0);
    expect(result.aiUsage).toBe(0);
  });

  it('sets total = slots.length for any input', () => {
    const slots = Array.from({ length: 5 }, () => makeSlot(['ai_usage']));
    expect(countDiaryTags(slots).total).toBe(5);
  });
});

// ─── aggregateAICache ─────────────────────────────────────────────────────────

describe('FR4: aggregateAICache', () => {
  it('returns all zeros for empty cache', () => {
    const result = aggregateAICache({}, '2026-03-04');
    expect(result).toEqual({
      aiPctLow: 0,
      aiPctHigh: 0,
      brainliftHours: 0,
      totalSlots: 0,
      taggedSlots: 0,
      workdaysElapsed: 0,
      dailyBreakdown: [],
    });
  });

  it('only processes Mon–today; pre-Monday dates are excluded', () => {
    // today = Wednesday 2026-03-04; Monday = 2026-03-02; Sunday before = 2026-03-01
    const cache: Record<string, TagData> = {
      '2026-03-01': makeTagData({ total: 10, aiUsage: 8, secondBrain: 2, noTags: 0 }), // Sunday BEFORE week
      '2026-03-02': makeTagData({ total: 5, aiUsage: 4, secondBrain: 1, noTags: 0 }),  // Monday
      '2026-03-03': makeTagData({ total: 5, aiUsage: 3, secondBrain: 0, noTags: 1 }),  // Tuesday
      '2026-03-04': makeTagData({ total: 5, aiUsage: 4, secondBrain: 1, noTags: 0 }),  // Wednesday (today)
    };
    const result = aggregateAICache(cache, '2026-03-04');
    // Sunday (2026-03-01) excluded; only Mon+Tue+Wed counted → totalSlots = 5+5+5 = 15
    expect(result.totalSlots).toBe(15);
  });

  it('future dates (tomorrow and beyond) are excluded from aggregation', () => {
    const cache: Record<string, TagData> = {
      '2026-03-04': makeTagData({ total: 10, aiUsage: 7, secondBrain: 1, noTags: 1 }), // today
      '2026-03-05': makeTagData({ total: 8, aiUsage: 6, secondBrain: 0, noTags: 0 }),  // tomorrow
    };
    const result = aggregateAICache(cache, '2026-03-04');
    expect(result.totalSlots).toBe(10); // only today
  });

  it('taggedSlots = totalSlots - totalNoTags (not totalSlots)', () => {
    const cache: Record<string, TagData> = {
      '2026-03-03': makeTagData({ total: 30, aiUsage: 24, secondBrain: 3, noTags: 3 }),
    };
    const result = aggregateAICache(cache, '2026-03-03');
    expect(result.totalSlots).toBe(30);
    expect(result.taggedSlots).toBe(27); // 30 - 3
  });

  it('brainliftHours = totalSecondBrain * 10 / 60; 30 slots = 5.0 hours', () => {
    const cache: Record<string, TagData> = {
      '2026-03-03': makeTagData({ total: 31, aiUsage: 30, secondBrain: 30, noTags: 0 }),
    };
    const result = aggregateAICache(cache, '2026-03-03');
    expect(result.brainliftHours).toBeCloseTo(5.0, 5);
  });

  it('AI% formula: aiPct = totalAiUsage / taggedSlots * 100', () => {
    // 24 ai / 27 tagged = 88.89%
    // aiPctLow = round(88.89 - 2) = round(86.89) = 87
    // aiPctHigh = round(88.89 + 2) = round(90.89) = 91
    const cache: Record<string, TagData> = {
      '2026-03-03': makeTagData({ total: 30, aiUsage: 24, secondBrain: 3, noTags: 3 }),
    };
    const result = aggregateAICache(cache, '2026-03-03');
    expect(result.aiPctLow).toBe(87);
    expect(result.aiPctHigh).toBe(91);
  });

  it('aiPctLow is clamped at 0 (not negative)', () => {
    // 1 aiUsage / 10 tagged = 10%; aiPctLow = round(10 - 2) = 8 — still positive
    // Use 1/10 = 10%, aiPctLow = 8. Use 0/10 to get aiPct=0, aiPctLow=0
    const cache: Record<string, TagData> = {
      '2026-03-03': makeTagData({ total: 10, aiUsage: 0, secondBrain: 0, noTags: 0 }),
    };
    const result = aggregateAICache(cache, '2026-03-03');
    expect(result.aiPctLow).toBeGreaterThanOrEqual(0);
    expect(result.aiPctLow).toBe(0);
  });

  it('aiPctHigh is clamped at 100 (not over 100)', () => {
    // 100% AI: all slots tagged ai_usage, aiPct=100, aiPctHigh = min(100, round(102)) = 100
    const cache: Record<string, TagData> = {
      '2026-03-03': makeTagData({ total: 10, aiUsage: 10, secondBrain: 0, noTags: 0 }),
    };
    const result = aggregateAICache(cache, '2026-03-03');
    expect(result.aiPctHigh).toBe(100);
    expect(result.aiPctLow).toBe(98);
  });

  it('no division by zero when taggedSlots === 0', () => {
    const cache: Record<string, TagData> = {
      '2026-03-03': makeTagData({ total: 10, aiUsage: 0, secondBrain: 0, noTags: 10 }),
    };
    const result = aggregateAICache(cache, '2026-03-03');
    expect(result.aiPctLow).toBe(0);
    expect(result.aiPctHigh).toBe(0);
    expect(Number.isNaN(result.aiPctLow)).toBe(false);
    expect(Number.isNaN(result.aiPctHigh)).toBe(false);
  });

  it('workdaysElapsed counts only days with total > 0', () => {
    const cache: Record<string, TagData> = {
      '2026-03-02': makeTagData({ total: 5, aiUsage: 4, secondBrain: 1, noTags: 0 }),
      '2026-03-03': makeTagData({ total: 0, aiUsage: 0, secondBrain: 0, noTags: 0 }), // zero day
      '2026-03-04': makeTagData({ total: 3, aiUsage: 2, secondBrain: 0, noTags: 1 }),
    };
    const result = aggregateAICache(cache, '2026-03-04');
    expect(result.workdaysElapsed).toBe(2); // Mon and Wed, not Tue (zero)
  });

  it('isToday is true only for today entry in dailyBreakdown', () => {
    const cache: Record<string, TagData> = {
      '2026-03-02': makeTagData({ total: 5, aiUsage: 4, secondBrain: 0, noTags: 1 }),
      '2026-03-03': makeTagData({ total: 5, aiUsage: 4, secondBrain: 0, noTags: 1 }),
      '2026-03-04': makeTagData({ total: 5, aiUsage: 4, secondBrain: 0, noTags: 1 }),
    };
    const result = aggregateAICache(cache, '2026-03-04');
    const todayEntry = result.dailyBreakdown.find((d) => d.date === '2026-03-04');
    const monEntry = result.dailyBreakdown.find((d) => d.date === '2026-03-02');
    expect(todayEntry?.isToday).toBe(true);
    expect(monEntry?.isToday).toBe(false);
  });

  it('dailyBreakdown includes one entry per day from Mon to today', () => {
    const cache: Record<string, TagData> = {
      '2026-03-02': makeTagData({ total: 5, aiUsage: 4, secondBrain: 0, noTags: 1 }), // Mon
      '2026-03-03': makeTagData({ total: 5, aiUsage: 4, secondBrain: 0, noTags: 1 }), // Tue
      '2026-03-04': makeTagData({ total: 5, aiUsage: 4, secondBrain: 0, noTags: 1 }), // Wed = today
    };
    const result = aggregateAICache(cache, '2026-03-04');
    expect(result.dailyBreakdown).toHaveLength(3);
    expect(result.dailyBreakdown.map((d) => d.date)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
  });

  it('handles today = Monday (only one day in breakdown)', () => {
    const cache: Record<string, TagData> = {
      '2026-03-02': makeTagData({ total: 10, aiUsage: 8, secondBrain: 2, noTags: 0 }),
    };
    const result = aggregateAICache(cache, '2026-03-02');
    expect(result.totalSlots).toBe(10);
    expect(result.dailyBreakdown).toHaveLength(1);
    expect(result.dailyBreakdown[0].isToday).toBe(true);
  });
});

// ─── shouldRefetchDay ─────────────────────────────────────────────────────────

describe('FR5: shouldRefetchDay', () => {
  it('returns true when cached is undefined (not in cache)', () => {
    expect(shouldRefetchDay('2026-03-04', undefined, false)).toBe(true);
  });

  it('returns true when cached.total === 0 (empty/stale)', () => {
    const cached = makeTagData({ total: 0 });
    expect(shouldRefetchDay('2026-03-04', cached, false)).toBe(true);
  });

  it('returns true when isToday === true, even if cached.total > 0', () => {
    const cached = makeTagData({ total: 30, aiUsage: 24 });
    expect(shouldRefetchDay('2026-03-04', cached, true)).toBe(true);
  });

  it('returns false when isToday === false and cached.total > 0 (past day with data)', () => {
    const cached = makeTagData({ total: 25, aiUsage: 20 });
    expect(shouldRefetchDay('2026-03-02', cached, false)).toBe(false);
  });

  it('does not throw when cached is undefined', () => {
    expect(() => shouldRefetchDay('2026-03-04', undefined, false)).not.toThrow();
  });

  it('returns true when isToday === true and cached is undefined', () => {
    expect(shouldRefetchDay('2026-03-04', undefined, true)).toBe(true);
  });

  it('returns true when isToday === true and cached.total === 0', () => {
    const cached = makeTagData({ total: 0 });
    expect(shouldRefetchDay('2026-03-04', cached, true)).toBe(true);
  });
});
