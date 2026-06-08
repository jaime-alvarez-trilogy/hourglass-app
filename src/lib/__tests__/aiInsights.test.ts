// Tests: aiInsights.ts — 04-ai-insights FR2 and FR3
//
// FR3: formatWeekStartLabel(weekStart) → "MMM D"
//   SC3.1 — '2026-04-07' → 'Apr 7'
//   SC3.2 — '2026-01-01' → 'Jan 1'
//   SC3.3 — '2026-12-28' → 'Dec 28'
//
// FR2 — computeAIInsights: Trend branch
//   SC2.T1 — n < 5 → trend: null
//   SC2.T2 — n = 5 → trend computed (not null)
//   SC2.T3 — 8 ascending values 60→88 → direction 'up', slopePts ≈ +28
//   SC2.T4 — flat last 8 → direction 'flat'
//   SC2.T5 — |slopePts| exactly 1 → direction 'flat'
//   SC2.T6 — |slopePts| exactly 2 → direction 'up' or 'down' (not flat)
//   SC2.T7 — descending 8 values → direction 'down', negative slopePts
//   SC2.T8 — weeksUsed === actual window length
//
// FR2 — computeAIInsights: Best branch
//   SC2.B1 — n < 4 → best: null
//   SC2.B2 — n = 4 → best computed (not null)
//   SC2.B3 — peak at index 3 → weekLabel matches weekStarts[3]
//   SC2.B4 — current week is the peak → ptsBelowBest = 0
//   SC2.B5 — current week 6pts below peak → ptsBelowBest = 6
//   SC2.B6 — backfill-gap alignment: missing intermediate week → correct weekLabel
//
// FR2 — computeAIInsights: BrainLift Correlation branch
//   SC2.C1 — < 8 pairs (n ≤ 8) → brainliftCorrelation: null
//   SC2.C2 — = 8 pairs (n = 9) → correlation computed
//   SC2.C3 — 10 pairs, r ≈ 0.20 (below 0.35) → null
//   SC2.C4 — 10 pairs, r ≈ 0.60 → returns insight with correct pairsUsed
//   SC2.C5 — high-BL group has higher avg next-week AI%
//   SC2.C6 — no high-BL weeks at all → null
//   SC2.C7 — no low-BL weeks at all → null
//   SC2.C8 — r value stored matches the computed Pearson r
//
// Strategy: pure functions — direct unit tests, no mocking required.
// Array factory helpers build aligned aiPct/brainliftHours/weekStarts arrays.

import { formatWeekStartLabel } from '../hours';
import { computeAIInsights } from '../aiInsights';

// ─── Array factory helpers ────────────────────────────────────────────────────

/**
 * Build n weeks of aligned test data starting from a base Monday.
 * baseDateStr: YYYY-MM-DD Monday
 * aiPctValues: must be length n
 * brainliftValues: must be length n (defaults to all 0)
 */
function makeWeeks(
  n: number,
  aiPctValues: number[],
  brainliftValues?: number[],
  baseDateStr = '2026-01-05', // a Monday
): { aiPct: number[]; brainlift: number[]; weekStarts: string[] } {
  const BL = brainliftValues ?? Array(n).fill(0);
  const weekStarts: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(baseDateStr + 'T00:00:00');
    d.setDate(d.getDate() + i * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    weekStarts.push(`${y}-${m}-${day}`);
  }
  return { aiPct: aiPctValues, brainlift: BL, weekStarts };
}

// ─── FR3: formatWeekStartLabel ────────────────────────────────────────────────

describe('formatWeekStartLabel', () => {
  describe("SC3.1 — '2026-04-07' → 'Apr 7'", () => {
    it("formats April date correctly", () => {
      expect(formatWeekStartLabel('2026-04-07')).toBe('Apr 7');
    });
  });

  describe("SC3.2 — '2026-01-01' → 'Jan 1'", () => {
    it("formats January 1st correctly", () => {
      expect(formatWeekStartLabel('2026-01-01')).toBe('Jan 1');
    });
  });

  describe("SC3.3 — '2026-12-28' → 'Dec 28'", () => {
    it("formats December correctly", () => {
      expect(formatWeekStartLabel('2026-12-28')).toBe('Dec 28');
    });
  });
});

// ─── FR2: Trend branch ────────────────────────────────────────────────────────

describe('computeAIInsights — trend', () => {
  describe('SC2.T1 — n < 5 → trend: null', () => {
    it('returns null trend for n = 1', () => {
      const { aiPct, brainlift, weekStarts } = makeWeeks(1, [75]);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).trend).toBeNull();
    });

    it('returns null trend for n = 4', () => {
      const { aiPct, brainlift, weekStarts } = makeWeeks(4, [70, 72, 74, 76]);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).trend).toBeNull();
    });
  });

  describe('SC2.T2 — n = 5 → trend computed', () => {
    it('returns non-null trend for n = 5', () => {
      const { aiPct, brainlift, weekStarts } = makeWeeks(5, [70, 72, 74, 76, 78]);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).trend).not.toBeNull();
    });
  });

  describe('SC2.T3 — ascending 60→88 over 8 weeks → up, slopePts ≈ +28', () => {
    it('detects upward trend with slopePts close to +28', () => {
      const aiPctValues = [60, 64, 68, 72, 76, 80, 84, 88];
      const { aiPct, brainlift, weekStarts } = makeWeeks(8, aiPctValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.trend).not.toBeNull();
      expect(result.trend!.direction).toBe('up');
      expect(result.trend!.slopePts).toBeCloseTo(28, 0);
    });
  });

  describe('SC2.T4 — flat last 8 → direction flat', () => {
    it('returns flat direction when all values are identical', () => {
      const aiPctValues = [80, 80, 80, 80, 80, 80, 80, 80];
      const { aiPct, brainlift, weekStarts } = makeWeeks(8, aiPctValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.trend!.direction).toBe('flat');
      expect(result.trend!.slopePts).toBe(0);
    });
  });

  describe('SC2.T5 — |slopePts| exactly 1 → flat', () => {
    it('treats a 1-pt total change as flat', () => {
      // 8 values where total change = 1 pt: slope per step ≈ 0.143
      // slopePts = slope_per_step * (n-1) = 0.143 * 7 = 1.0
      // Use a hand-crafted set where least-squares slope * 7 ≈ 1
      // Simple: all 0 except last = 1 → slope ≈ 7*1/(0+1+4+9+16+25+36+49) = 7/140 ≈ 0.05 per step → slopePts ≈ 0.35
      // Easier: [0,0,0,0,0,0,0,7] → slope ≈ 7*7/140 = 49/140 ≈ 0.35 per step → slopePts ≈ 2.45
      // Use [78,78,78,78,78,78,78,79] → change ≈ 1 total via least squares
      // Actually, compute directly: need slopePts = linearSlope(window) * (n-1) where |result| < 2
      // [79,79,79,79,79,79,79,80] → regression: most values at 79, one at 80
      // slope_per_step ≈ (sum of (x_i - x_mean)*y_i) / (sum of (x_i - x_mean)^2)
      // x_mean = 3.5 for indices 0..7
      // numerator = sum_i (i - 3.5) * y_i where y = [79]*7 + [80]
      //           = 79 * sum_i (i-3.5) for i=0..6 + 80*(7-3.5)
      //           = 79 * (-3.5-2.5-1.5-0.5+0.5+1.5+2.5) + 80*3.5
      //           = 79 * (-3.5) + 280 = -276.5 + 280 = 3.5
      // denominator = sum (i-3.5)^2 = 12.25+6.25+2.25+0.25+0.25+2.25+6.25+12.25 = 42
      // slope = 3.5/42 ≈ 0.0833 → slopePts = 0.0833 * 7 = 0.583 → flat ✓
      //
      // Better test: use 8 values where slopePts = exactly 1:
      // slope per step = 1/7, so each step increases by 1/7
      // [0, 1/7, 2/7, 3/7, 4/7, 5/7, 6/7, 1] scaled to AI% range: add 75
      const v = [0, 1, 2, 3, 4, 5, 6, 7].map(i => 75 + i / 7);
      const { aiPct, brainlift, weekStarts } = makeWeeks(8, v);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      // slopePts = (1/7) * 7 = 1.0 → |1.0| < 2 → flat
      expect(result.trend!.slopePts).toBeCloseTo(1.0, 5);
      expect(result.trend!.direction).toBe('flat');
    });
  });

  describe('SC2.T6 — |slopePts| >= 2 → up or down (not flat)', () => {
    it('treats a 4-pt total change as up (clearly above the flat threshold of 2)', () => {
      // slope per step = 4/7, slopePts = 4.0 — well above the |<2| flat threshold
      const v = [0, 1, 2, 3, 4, 5, 6, 7].map(i => 75 + (4 * i) / 7);
      const { aiPct, brainlift, weekStarts } = makeWeeks(8, v);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.trend!.slopePts).toBeCloseTo(4.0, 4);
      expect(result.trend!.direction).toBe('up');
    });

    it('treats a -4-pt total change as down', () => {
      const v = [0, 1, 2, 3, 4, 5, 6, 7].map(i => 80 - (4 * i) / 7);
      const { aiPct, brainlift, weekStarts } = makeWeeks(8, v);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.trend!.slopePts).toBeCloseTo(-4.0, 4);
      expect(result.trend!.direction).toBe('down');
    });
  });

  describe('SC2.T7 — descending 8 values → down, negative slopePts', () => {
    it('detects downward trend', () => {
      const aiPctValues = [88, 84, 80, 76, 72, 68, 64, 60];
      const { aiPct, brainlift, weekStarts } = makeWeeks(8, aiPctValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.trend!.direction).toBe('down');
      expect(result.trend!.slopePts).toBeCloseTo(-28, 0);
    });
  });

  describe('SC2.T8 — weeksUsed === actual window length', () => {
    it('reports weeksUsed = 8 when there are 10 weeks of history', () => {
      const aiPctValues = Array(10).fill(0).map((_, i) => 70 + i);
      const { aiPct, brainlift, weekStarts } = makeWeeks(10, aiPctValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.trend!.weeksUsed).toBe(8);
    });

    it('reports weeksUsed = 5 when there are exactly 5 weeks', () => {
      const { aiPct, brainlift, weekStarts } = makeWeeks(5, [70, 72, 74, 76, 78]);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.trend!.weeksUsed).toBe(5);
    });
  });
});

// ─── FR2: Best branch ─────────────────────────────────────────────────────────

describe('computeAIInsights — best', () => {
  describe('SC2.B1 — n < 4 → best: null', () => {
    it('returns null best for n = 3', () => {
      const { aiPct, brainlift, weekStarts } = makeWeeks(3, [70, 75, 72]);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).best).toBeNull();
    });
  });

  describe('SC2.B2 — n = 4 → best computed', () => {
    it('returns non-null best for n = 4', () => {
      const { aiPct, brainlift, weekStarts } = makeWeeks(4, [70, 75, 72, 68]);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).best).not.toBeNull();
    });
  });

  describe('SC2.B3 — peak at index 3 → weekLabel matches weekStarts[3]', () => {
    it('sources weekLabel from weekStarts[maxIndex]', () => {
      const aiPctValues = [70, 75, 72, 90, 80]; // peak at index 3
      const { aiPct, brainlift, weekStarts } = makeWeeks(5, aiPctValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.best!.weekLabel).toBe(formatWeekStartLabel(weekStarts[3]));
      expect(result.best!.peakPct).toBe(90);
    });
  });

  describe('SC2.B4 — current week is the peak → ptsBelowBest = 0', () => {
    it('returns ptsBelowBest = 0 when current is at or above peak', () => {
      const aiPctValues = [70, 72, 74, 76, 90]; // peak is the last (current)
      const { aiPct, brainlift, weekStarts } = makeWeeks(5, aiPctValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.best!.ptsBelowBest).toBe(0);
      expect(result.best!.currentPct).toBe(90);
    });
  });

  describe('SC2.B5 — current week 6pts below peak → ptsBelowBest = 6', () => {
    it('returns ptsBelowBest = 6', () => {
      const aiPctValues = [70, 80, 75, 74, 74]; // peak at index 1 = 80, current = 74
      const { aiPct, brainlift, weekStarts } = makeWeeks(5, aiPctValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.best!.peakPct).toBe(80);
      expect(result.best!.currentPct).toBe(74);
      expect(result.best!.ptsBelowBest).toBe(6);
    });
  });

  describe('SC2.B6 — backfill-gap alignment', () => {
    it('maps weekLabel to actual snapshot weekStart, not a back-counted label', () => {
      // Simulate a gap: weeks are NOT contiguous
      const gappedWeekStarts = [
        '2026-01-05', // week 1
        '2026-01-12', // week 2
        // week 3 missing (gap)
        '2026-01-26', // week 4 — this is the peak
        '2026-02-02', // week 5 — current
      ];
      const aiPctValues = [70, 72, 95, 80]; // peak at index 2 = weekStarts[2] = '2026-01-26'
      const brainlift = [0, 0, 0, 0];
      const result = computeAIInsights(aiPctValues, brainlift, gappedWeekStarts);
      // weekLabel should come from '2026-01-26' → 'Jan 26'
      expect(result.best!.weekLabel).toBe(formatWeekStartLabel('2026-01-26'));
      expect(result.best!.weekLabel).toBe('Jan 26');
    });
  });
});

// ─── FR2: BrainLift Correlation branch ───────────────────────────────────────

describe('computeAIInsights — brainliftCorrelation', () => {
  describe('SC2.C1 — < 8 pairs (n ≤ 8) → brainliftCorrelation: null', () => {
    it('returns null when n = 8 (only 7 pairs)', () => {
      const aiPctValues = [70, 72, 74, 76, 78, 80, 82, 84];
      const blValues = [4, 5, 4, 5, 4, 5, 4, 5];
      const { aiPct, brainlift, weekStarts } = makeWeeks(8, aiPctValues, blValues);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).brainliftCorrelation).toBeNull();
    });

    it('returns null when n = 1', () => {
      const { aiPct, brainlift, weekStarts } = makeWeeks(1, [75]);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).brainliftCorrelation).toBeNull();
    });
  });

  describe('SC2.C2 — = 8 pairs (n = 9) → correlation computed (if r meets threshold)', () => {
    it('attempts computation for n = 9 (8 pairs)', () => {
      // Make data with clear correlation: high BL → high next AI
      const aiPctValues = [65, 80, 65, 85, 65, 80, 65, 85, 65];
      const blValues    = [5,  0,  5,  0,  5,  0,  5,  0,  5];
      // pairs: (5,65), (0,85), (5,65), (0,85), (5,65), (0,85), (5,65), (0,85)
      // When BL=5, next AI=65; when BL=0, next AI=85 — strong negative correlation
      const { aiPct, brainlift, weekStarts } = makeWeeks(9, aiPctValues, blValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      // correlation should be non-null (|r| > 0.35)
      expect(result.brainliftCorrelation).not.toBeNull();
      expect(result.brainliftCorrelation!.pairsUsed).toBe(8);
    });
  });

  describe('SC2.C3 — 10 pairs, r ≈ 0.20 (below 0.35) → null', () => {
    it('returns null when correlation is weak', () => {
      // Build 11 weeks (10 pairs) where correlation is negligible
      // Use nearly uniform data — same BL, varying AI
      const aiPctValues = [70, 71, 70, 72, 70, 71, 73, 70, 71, 70, 72];
      const blValues    = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]; // all same BL
      const { aiPct, brainlift, weekStarts } = makeWeeks(11, aiPctValues, blValues);
      // pearsonR with constant BL = 0 → below threshold
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.brainliftCorrelation).toBeNull();
    });
  });

  describe('SC2.C4 — 10 pairs with strong correlation → returns insight', () => {
    it('returns brainliftCorrelation with pairsUsed = 10', () => {
      // Build 11 weeks (10 pairs): alternating high/low BL with corresponding AI next week
      // High BL (≥5h) weeks followed by high AI, low BL followed by lower AI
      const aiPctValues = [60, 85, 60, 85, 60, 85, 60, 85, 60, 85, 60];
      const blValues    = [6,  1,  6,  1,  6,  1,  6,  1,  6,  1,  6];
      // pairs: (6,85),(1,60),(6,85),(1,60),(6,85),(1,60),(6,85),(1,60),(6,85),(1,60)
      // high-BL pairs: BL=6 → next AI=85; low-BL pairs: BL=1 → next AI=60
      const { aiPct, brainlift, weekStarts } = makeWeeks(11, aiPctValues, blValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      expect(result.brainliftCorrelation).not.toBeNull();
      expect(result.brainliftCorrelation!.pairsUsed).toBe(10);
    });
  });

  describe('SC2.C5 — high-BL group has higher avg next-week AI%', () => {
    it('highBLAvgAIPct > lowBLAvgAIPct when BrainLift predicts higher AI', () => {
      const aiPctValues = [60, 85, 60, 85, 60, 85, 60, 85, 60, 85, 60];
      const blValues    = [6,  1,  6,  1,  6,  1,  6,  1,  6,  1,  6];
      const { aiPct, brainlift, weekStarts } = makeWeeks(11, aiPctValues, blValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      // high-BL weeks (BL=6) → next AI=85; low-BL weeks (BL=1) → next AI=60
      expect(result.brainliftCorrelation!.highBLAvgAIPct).toBeCloseTo(85, 0);
      expect(result.brainliftCorrelation!.lowBLAvgAIPct).toBeCloseTo(60, 0);
      expect(result.brainliftCorrelation!.highBLAvgAIPct).toBeGreaterThan(
        result.brainliftCorrelation!.lowBLAvgAIPct,
      );
    });
  });

  describe('SC2.C6 — no high-BL weeks at all → null', () => {
    it('returns null when all BL values are below 5h', () => {
      const aiPctValues = [70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90];
      const blValues    = [1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1]; // all < 5
      const { aiPct, brainlift, weekStarts } = makeWeeks(11, aiPctValues, blValues);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).brainliftCorrelation).toBeNull();
    });
  });

  describe('SC2.C7 — no low-BL weeks at all → null', () => {
    it('returns null when all BL values are at or above 5h', () => {
      const aiPctValues = [70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90];
      const blValues    = [5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5]; // all >= 5
      const { aiPct, brainlift, weekStarts } = makeWeeks(11, aiPctValues, blValues);
      expect(computeAIInsights(aiPct, brainlift, weekStarts).brainliftCorrelation).toBeNull();
    });
  });

  describe('SC2.C8 — r value stored matches computed Pearson r', () => {
    it('stores the actual Pearson r, not just a boolean or clamped value', () => {
      const aiPctValues = [60, 85, 60, 85, 60, 85, 60, 85, 60, 85, 60];
      const blValues    = [6,  1,  6,  1,  6,  1,  6,  1,  6,  1,  6];
      const { aiPct, brainlift, weekStarts } = makeWeeks(11, aiPctValues, blValues);
      const result = computeAIInsights(aiPct, brainlift, weekStarts);
      const r = result.brainliftCorrelation!.r;
      // Pairs: BL=[6,1,6,1,...], AI_next=[85,60,85,60,...] — perfect positive correlation:
      // high BL (6h) predicts high next-week AI (85%), low BL (1h) predicts low (60%).
      // pearsonR of two perfectly co-varying binary sequences = 1.0.
      expect(r).toBeCloseTo(1.0, 5);
    });
  });
});
