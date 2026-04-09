// 01-cone-math: Unit tests for computeActualPoints, computeCone, computeAICone
// Phase 1.0 — tests written before implementation (red phase)

import type { DailyTagData } from '../ai';
import {
  computeActualPoints,
  computeCone,
  computeAICone,
} from '../aiCone';

// ─── Test fixture helper ──────────────────────────────────────────────────────

const makeDay = (
  date: string,
  total: number,
  aiUsage: number,
  noTags: number,
  isToday = false,
): DailyTagData => ({ date, total, aiUsage, secondBrain: 0, noTags, isToday });

// ─── FR2: computeActualPoints ─────────────────────────────────────────────────

describe('computeActualPoints', () => {
  describe('FR2: empty input', () => {
    it('returns [{ hoursX: 0, pctY: 0 }] for empty array', () => {
      const result = computeActualPoints([]);
      expect(result).toEqual([{ hoursX: 0, pctY: 0 }]);
    });
  });

  describe('FR2: happy path', () => {
    it('returns 4 points for 3-day input (origin + one per day)', () => {
      const days = [
        makeDay('2026-03-09', 30, 20, 5),  // Mon: 30 total, 20 AI, 5 noTags
        makeDay('2026-03-10', 30, 15, 3),  // Tue
        makeDay('2026-03-11', 30, 25, 2),  // Wed
      ];
      const result = computeActualPoints(days);
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ hoursX: 0, pctY: 0 });
    });

    it('first point is always (0, 0)', () => {
      const days = [makeDay('2026-03-09', 24, 18, 0)];
      const result = computeActualPoints(days);
      expect(result[0]).toEqual({ hoursX: 0, pctY: 0 });
    });

    it('hoursX for day 1 equals total slots * 10 / 60', () => {
      // 24 slots * 10 / 60 = 4 hours
      const days = [makeDay('2026-03-09', 24, 18, 0)];
      const result = computeActualPoints(days);
      expect(result[1].hoursX).toBeCloseTo(4, 5);
    });

    it('computes cumulative AI% correctly for 100% AI days', () => {
      // All slots are AI-tagged, none untagged
      // taggedSlots = 24 - 0 = 24, aiUsage = 24 → pctY = 100
      const days = [makeDay('2026-03-09', 24, 24, 0)];
      const result = computeActualPoints(days);
      expect(result[1].pctY).toBeCloseTo(100, 5);
    });

    it('computes cumulative AI% correctly for 0% AI (all tagged, no AI)', () => {
      // taggedSlots = 24, aiUsage = 0 → pctY = 0
      const days = [makeDay('2026-03-09', 24, 0, 0)];
      const result = computeActualPoints(days);
      expect(result[1].pctY).toBe(0);
    });

    it('uses cumulative totals across days, not per-day', () => {
      // Day 1: 12 total, 12 AI, 0 noTags → cumulative AI% = 100%
      // Day 2: 12 total, 0 AI, 0 noTags → cumulative AI% = 12/24 = 50%
      const days = [
        makeDay('2026-03-09', 12, 12, 0),
        makeDay('2026-03-10', 12, 0, 0),
      ];
      const result = computeActualPoints(days);
      expect(result[1].pctY).toBeCloseTo(100, 5);
      expect(result[2].pctY).toBeCloseTo(50, 5);
    });
  });

  describe('FR2: edge cases', () => {
    it('pctY = 0 when all slots untagged (no division error)', () => {
      // All noTags → taggedSlots = 0 → should return 0 not throw
      const days = [makeDay('2026-03-09', 24, 0, 24)];
      const result = computeActualPoints(days);
      expect(result[1].pctY).toBe(0);
    });

    it('day with 0 total slots gets same pctY as prior day (no division error)', () => {
      // Day 1: 24 total, 12 AI, 0 noTags → 50% AI
      // Day 2: 0 total → cumulative unchanged → still 50%
      const days = [
        makeDay('2026-03-09', 24, 12, 0),
        makeDay('2026-03-10', 0, 0, 0),  // holiday / no work
      ];
      const result = computeActualPoints(days);
      expect(result[2].pctY).toBeCloseTo(50, 5);
      // hoursX for day 2 = same as day 1 (no new slots)
      expect(result[2].hoursX).toBeCloseTo(result[1].hoursX, 5);
    });

    it('skips null entries gracefully', () => {
      const days = [
        makeDay('2026-03-09', 24, 12, 0),
        null as unknown as DailyTagData,
        makeDay('2026-03-11', 24, 18, 0),
      ];
      expect(() => computeActualPoints(days)).not.toThrow();
      // 2 valid days → 3 points total (origin + 2)
      const result = computeActualPoints(days);
      expect(result).toHaveLength(3);
    });
  });
});

// ─── FR3: computeCone ─────────────────────────────────────────────────────────

describe('computeCone', () => {
  describe('FR3: guard conditions', () => {
    it('returns empty cone when weeklyLimit <= 0', () => {
      const result = computeCone(0, 50, 10, 20, 0);
      expect(result).toEqual({ upper: [], lower: [] });
    });

    it('returns empty cone when weeklyLimit is negative', () => {
      const result = computeCone(0, 50, 10, 20, -5);
      expect(result).toEqual({ upper: [], lower: [] });
    });

    it('returns empty cone when currentHours >= weeklyLimit', () => {
      const result = computeCone(40, 75, 48, 64, 40);
      expect(result).toEqual({ upper: [], lower: [] });
    });

    it('returns empty cone when currentHours > weeklyLimit (overtime)', () => {
      const result = computeCone(45, 75, 54, 72, 40);
      expect(result).toEqual({ upper: [], lower: [] });
    });
  });

  describe('FR3: start of week (all zeros)', () => {
    it('upper = 100%, lower = 0% when no slots logged yet', () => {
      // currentHours=0, aiSlots=0, taggedSlots=0, weeklyLimit=40
      const result = computeCone(0, 0, 0, 0, 40);
      expect(result.upper).toHaveLength(2);
      expect(result.lower).toHaveLength(2);
      expect(result.upper[1].pctY).toBe(100);
      expect(result.lower[1].pctY).toBe(0);
    });

    it('cone starts at (0, 0) at week start', () => {
      const result = computeCone(0, 0, 0, 0, 40);
      expect(result.upper[0]).toEqual({ hoursX: 0, pctY: 0 });
      expect(result.lower[0]).toEqual({ hoursX: 0, pctY: 0 });
    });

    it('cone ends at weeklyLimit on X-axis', () => {
      const result = computeCone(0, 0, 0, 0, 40);
      expect(result.upper[1].hoursX).toBe(40);
      expect(result.lower[1].hoursX).toBe(40);
    });
  });

  describe('FR3: mid-week position', () => {
    it('upper final > currentAIPct for mid-week position', () => {
      // 20h of 40h logged, 50% AI so far
      // aiSlots=72 (20h*6*0.6), taggedSlots=120 (20h*6)
      // slotsRemaining = 20*6 = 120
      // upper = (72 + 120) / (120 + 120) = 192/240 = 80%
      const result = computeCone(20, 60, 72, 120, 40);
      expect(result.upper[1].pctY).toBeGreaterThan(60);
    });

    it('lower final < currentAIPct for mid-week position', () => {
      // lower = 72 / (120 + 120) = 72/240 = 30%
      const result = computeCone(20, 60, 72, 120, 40);
      expect(result.lower[1].pctY).toBeLessThan(60);
    });

    it('cone origin point matches current position', () => {
      const result = computeCone(20, 60, 72, 120, 40);
      expect(result.upper[0]).toEqual({ hoursX: 20, pctY: 60 });
      expect(result.lower[0]).toEqual({ hoursX: 20, pctY: 60 });
    });

    it('cone end point X = weeklyLimit', () => {
      const result = computeCone(20, 60, 72, 120, 40);
      expect(result.upper[1].hoursX).toBe(40);
      expect(result.lower[1].hoursX).toBe(40);
    });
  });

  describe('FR3: clamping', () => {
    it('upper is clamped to 100% even if formula exceeds it', () => {
      // Very few tagged slots + lots remaining → formula > 100%
      // aiSlots=1, taggedSlots=1, slotsRemaining=large → (1+large)/(1+large) ≈ 100%
      // Force clamping: taggedSlots=0, aiSlots=0, remaining huge
      const result = computeCone(1, 0, 0, 0, 1000);
      expect(result.upper[1].pctY).toBeLessThanOrEqual(100);
    });

    it('lower is clamped to 0% (never negative)', () => {
      // aiSlots=0 → lower = 0/(anything) = 0
      const result = computeCone(20, 50, 0, 60, 40);
      expect(result.lower[1].pctY).toBeGreaterThanOrEqual(0);
    });
  });

  describe('FR3: near end of week', () => {
    it('upper and lower converge when nearly at weeklyLimit', () => {
      // 39h of 40h logged, 60% AI
      // slotsRemaining = 6 slots (1 hour)
      // aiSlots≈141 (39h*6*0.6), taggedSlots≈234 (39h*6)
      const aiSlots = Math.round(39 * 6 * 0.6);
      const taggedSlots = 39 * 6;
      const result = computeCone(39, 60, aiSlots, taggedSlots, 40);
      const upperFinal = result.upper[1].pctY;
      const lowerFinal = result.lower[1].pctY;
      // The spread should be much smaller than at mid-week
      expect(upperFinal - lowerFinal).toBeLessThan(5);
    });
  });
});

// ─── FR4: computeAICone ───────────────────────────────────────────────────────

describe('computeAICone', () => {
  describe('FR4: Monday morning (empty breakdown)', () => {
    it('actualPoints = [{ hoursX: 0, pctY: 0 }]', () => {
      const result = computeAICone([], 40);
      expect(result.actualPoints).toEqual([{ hoursX: 0, pctY: 0 }]);
    });

    it('returns a full-width cone (upper ends near 100%, lower = 0%)', () => {
      const result = computeAICone([], 40);
      expect(result.upperBound).toHaveLength(2);
      expect(result.lowerBound).toHaveLength(2);
      expect(result.upperBound[1].pctY).toBe(100);
      expect(result.lowerBound[1].pctY).toBe(0);
    });

    it('currentHours = 0', () => {
      const result = computeAICone([], 40);
      expect(result.currentHours).toBe(0);
    });

    it('currentAIPct = 0', () => {
      const result = computeAICone([], 40);
      expect(result.currentAIPct).toBe(0);
    });
  });

  describe('FR4: mid-week data', () => {
    const midWeekDays = [
      makeDay('2026-03-09', 24, 18, 2),  // Mon: 24 slots, 18 AI, 2 noTags
      makeDay('2026-03-10', 24, 16, 1),  // Tue
      makeDay('2026-03-11', 24, 20, 0),  // Wed (today)
    ];

    it('actualPoints has N+1 points for N days', () => {
      const result = computeAICone(midWeekDays, 40);
      expect(result.actualPoints).toHaveLength(4);
    });

    it('actualPoints[0] is always (0, 0)', () => {
      const result = computeAICone(midWeekDays, 40);
      expect(result.actualPoints[0]).toEqual({ hoursX: 0, pctY: 0 });
    });

    it('cone spans from currentHours to weeklyLimit', () => {
      const result = computeAICone(midWeekDays, 40);
      expect(result.upperBound[0].hoursX).toBeCloseTo(result.currentHours, 5);
      expect(result.upperBound[1].hoursX).toBe(40);
    });

    it('returns correct currentHours (3 days * 24 slots * 10/60)', () => {
      const result = computeAICone(midWeekDays, 40);
      // 3 * 24 * 10/60 = 12 hours
      expect(result.currentHours).toBeCloseTo(12, 5);
    });
  });

  describe('FR4: targetPct constant', () => {
    it('targetPct is always 75', () => {
      expect(computeAICone([], 40).targetPct).toBe(75);
      expect(computeAICone([makeDay('2026-03-09', 24, 12, 0)], 40).targetPct).toBe(75);
    });
  });

  describe('FR4: weeklyLimit passthrough', () => {
    it('weeklyLimit in output matches input', () => {
      expect(computeAICone([], 40).weeklyLimit).toBe(40);
      expect(computeAICone([], 35).weeklyLimit).toBe(35);
    });
  });

  describe('FR4: isTargetAchievable', () => {
    it('isTargetAchievable = true when upper bound final >= 75', () => {
      // Monday morning: upper = 100% → achievable
      const result = computeAICone([], 40);
      expect(result.isTargetAchievable).toBe(true);
    });

    it('isTargetAchievable = false when upper bound final < 75', () => {
      // Heavy week nearly done with low AI%, upper can't reach 75
      // 39h logged at 40h limit with only 20% AI
      // aiSlots = 39*6*0.2 = ~46, taggedSlots = 39*6 = 234
      // slotsRemaining = 1*6 = 6
      // upper = (46+6)/(234+6) = 52/240 ≈ 21.7% → not achievable
      const days: DailyTagData[] = [];
      // Build ~39h of data at 20% AI
      const aiSlots = Math.round(39 * 6 * 0.2); // 47
      const totalSlots = 39 * 6;                  // 234
      const noTags = 0;
      days.push(makeDay('2026-03-09', totalSlots, aiSlots, noTags));
      const result = computeAICone(days, 40);
      expect(result.isTargetAchievable).toBe(false);
    });

    it('isTargetAchievable based on currentAIPct when cone is empty (weeklyLimit=0)', () => {
      // currentAIPct = 0, weeklyLimit = 0 → cone empty → isTargetAchievable = false
      const result = computeAICone([], 0);
      expect(result.isTargetAchievable).toBe(false);
    });

    it('isTargetAchievable = true when cone empty and currentAIPct >= 75', () => {
      // All hours logged at 80% AI, weeklyLimit = 0 (or currentHours=weeklyLimit)
      const days = [makeDay('2026-03-09', 240, 192, 0)]; // 80% AI, 40h
      const result = computeAICone(days, 40);
      // Week complete (40h = 40h limit) → cone empty → check currentAIPct
      expect(result.isTargetAchievable).toBe(true);
    });
  });

  describe('FR4: edge cases', () => {
    it('weeklyLimit = 0 → empty cone, no crash', () => {
      expect(() => computeAICone([], 0)).not.toThrow();
      const result = computeAICone([], 0);
      expect(result.upperBound).toEqual([]);
      expect(result.lowerBound).toEqual([]);
    });

    it('currentHours > weeklyLimit (overtime) → cone collapsed to empty', () => {
      // 45h logged but limit is 40h
      const days = [makeDay('2026-03-09', 270, 200, 10)]; // 45h
      const result = computeAICone(days, 40);
      expect(result.upperBound).toEqual([]);
      expect(result.lowerBound).toEqual([]);
    });

    it('overtime case: isTargetAchievable based on currentAIPct', () => {
      // 45h at 80% AI → cone empty → achievable since 80 >= 75
      const days = [makeDay('2026-03-09', 270, 216, 0)]; // 270 slots=45h, 216/270=80% AI
      const result = computeAICone(days, 40);
      expect(result.isTargetAchievable).toBe(true);
    });
  });
});

// ─── 01-baseline-start: FR1 + FR2 baselinePct tests ──────────────────────────

describe('computeAICone — baselinePct (01-baseline-start)', () => {
  const emptyBreakdown: DailyTagData[] = [];
  const someDays = [
    makeDay('2026-03-09', 24, 18, 2),  // Mon: 24 slots, 18 AI, 2 noTags
    makeDay('2026-03-10', 24, 16, 1),  // Tue
  ];

  // ── FR2: hourlyPoints[0].pctY reflects baselinePct ────────────────────────

  describe('FR2: baselinePct threads to hourlyPoints origin', () => {
    it('baselinePct=81 → hourlyPoints[0].pctY === 81', () => {
      const result = computeAICone(emptyBreakdown, 40, 81);
      expect(result.hourlyPoints[0].pctY).toBe(81);
    });

    it('baselinePct=75 → hourlyPoints[0].pctY === 75', () => {
      const result = computeAICone(emptyBreakdown, 40, 75);
      expect(result.hourlyPoints[0].pctY).toBe(75);
    });

    it('baselinePct=100 → hourlyPoints[0].pctY === 100', () => {
      const result = computeAICone(emptyBreakdown, 40, 100);
      expect(result.hourlyPoints[0].pctY).toBe(100);
    });

    it('baselinePct=0 explicit → hourlyPoints[0].pctY === 0 (no regression)', () => {
      const result = computeAICone(emptyBreakdown, 40, 0);
      expect(result.hourlyPoints[0].pctY).toBe(0);
    });

    it('baselinePct omitted → hourlyPoints[0].pctY === 0 (default, no regression)', () => {
      const result = computeAICone(emptyBreakdown, 40);
      expect(result.hourlyPoints[0].pctY).toBe(0);
    });

    it('hourlyPoints[0].hoursX is always 0 regardless of baselinePct', () => {
      expect(computeAICone(emptyBreakdown, 40, 81).hourlyPoints[0].hoursX).toBe(0);
      expect(computeAICone(emptyBreakdown, 40).hourlyPoints[0].hoursX).toBe(0);
    });
  });

  // ── FR2: subsequent hourlyPoints track actual AI% (baseline only affects origin) ─

  describe('FR2: baseline only affects origin — subsequent points track actual', () => {
    it('with data, hourlyPoints[1+] are unaffected by baselinePct', () => {
      const withBaseline = computeAICone(someDays, 40, 81);
      const withoutBaseline = computeAICone(someDays, 40, 0);

      // Origin differs
      expect(withBaseline.hourlyPoints[0].pctY).toBe(81);
      expect(withoutBaseline.hourlyPoints[0].pctY).toBe(0);

      // All subsequent points are identical (same actual data)
      const withLen = withBaseline.hourlyPoints.length;
      const withoutLen = withoutBaseline.hourlyPoints.length;
      expect(withLen).toBe(withoutLen);
      for (let i = 1; i < withLen; i++) {
        expect(withBaseline.hourlyPoints[i].hoursX).toBeCloseTo(withoutBaseline.hourlyPoints[i].hoursX, 5);
        expect(withBaseline.hourlyPoints[i].pctY).toBeCloseTo(withoutBaseline.hourlyPoints[i].pctY, 5);
      }
    });
  });

  // ── FR2: cone bounds, currentAIPct, targetPct unaffected ──────────────────

  describe('FR2: cone bounds and scalars unaffected by baselinePct', () => {
    it('currentAIPct is the same with or without baselinePct', () => {
      const withBaseline = computeAICone(someDays, 40, 81);
      const withoutBaseline = computeAICone(someDays, 40);
      expect(withBaseline.currentAIPct).toBeCloseTo(withoutBaseline.currentAIPct, 5);
    });

    it('upperBound is unchanged regardless of baselinePct', () => {
      const withBaseline = computeAICone(someDays, 40, 81);
      const withoutBaseline = computeAICone(someDays, 40);
      expect(withBaseline.upperBound).toEqual(withoutBaseline.upperBound);
    });

    it('lowerBound is unchanged regardless of baselinePct', () => {
      const withBaseline = computeAICone(someDays, 40, 81);
      const withoutBaseline = computeAICone(someDays, 40);
      expect(withBaseline.lowerBound).toEqual(withoutBaseline.lowerBound);
    });

    it('targetPct is always 75 regardless of baselinePct', () => {
      expect(computeAICone(emptyBreakdown, 40, 0).targetPct).toBe(75);
      expect(computeAICone(emptyBreakdown, 40, 81).targetPct).toBe(75);
      expect(computeAICone(emptyBreakdown, 40, 100).targetPct).toBe(75);
    });
  });
});
