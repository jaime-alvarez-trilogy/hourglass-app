import {
  computePanelState,
  computeDaysElapsed,
  PACING_ON_TRACK_THRESHOLD,
  PACING_BEHIND_THRESHOLD,
  PACING_CRUSHING_THRESHOLD,
} from '../panelState';

describe('computePanelState', () => {
  // ---------------------------------------------------------------------------
  // Happy path — all five states
  // ---------------------------------------------------------------------------
  describe('happy path — five states', () => {
    it('returns idle when Mon morning with 0 hours worked', () => {
      expect(computePanelState(0, 40, 0)).toBe('idle');
    });

    it('returns onTrack when modestly ahead of pace mid-week (Wed, 18h worked, expected 16h)', () => {
      // daysElapsed=2, expected = (2/5)*40 = 16, ratio = 18/16 = 1.125 ≥ 0.85 but < 1.25
      expect(computePanelState(18, 40, 2)).toBe('onTrack');
    });

    it('returns onTrack when Thu at 30h worked (expected 32h, ratio 0.9375)', () => {
      // daysElapsed=4, expected = (4/5)*40 = 32, ratio = 30/32 = 0.9375 ≥ 0.85
      expect(computePanelState(30, 40, 4)).toBe('onTrack');
    });

    it('returns crushedIt when at exactly 40h on Fri', () => {
      expect(computePanelState(40, 40, 5)).toBe('crushedIt');
    });

    it('returns crushedIt when over 40h on Fri — REPLACED BY overtime state', () => {
      // Previously 'crushedIt', now 'overtime' because hours > weeklyLimit
      expect(computePanelState(42, 40, 5)).toBe('overtime');
    });

    it('returns behind when recoverable behind mid-week (Wed, 10h, expected 16h, ratio 0.625)', () => {
      // daysElapsed=2, expected = (2/5)*40 = 16, ratio = 10/16 = 0.625 ≥ 0.60
      expect(computePanelState(10, 40, 2)).toBe('behind');
    });

    it('returns critical when severely behind mid-week (Wed, 5h, expected 16h, ratio 0.3125)', () => {
      // daysElapsed=2, expected = (2/5)*40 = 16, ratio = 5/16 = 0.3125 < 0.60
      expect(computePanelState(5, 40, 2)).toBe('critical');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('returns idle when weeklyLimit is 0 (no division by zero)', () => {
      expect(computePanelState(0, 0, 3)).toBe('idle');
    });

    it('returns idle when weeklyLimit is negative', () => {
      expect(computePanelState(0, -10, 3)).toBe('idle');
    });

    it('returns idle when daysElapsed=0 and hoursWorked=0', () => {
      expect(computePanelState(0, 40, 0)).toBe('idle');
    });

    it('returns onTrack when daysElapsed=0 but some hours worked (early work is positive)', () => {
      // days=0 → expectedHours=0 → zero-guard returns onTrack (no division by zero)
      expect(computePanelState(5, 40, 0)).toBe('onTrack');
    });

    it('clamps daysElapsed > 5 to 5 (returns crushedIt with 40h/40 limit)', () => {
      expect(computePanelState(40, 40, 7)).toBe('crushedIt');
    });

    it('clamps daysElapsed < 0 to 0 with 0 hours → idle', () => {
      // clamped to 0 → days < 1 && hours === 0 → idle
      expect(computePanelState(0, 40, -1)).toBe('idle');
    });

    it('treats negative hoursWorked as 0 (returns critical)', () => {
      // hoursWorked clamped to 0, daysElapsed=3, expected=24, ratio=0/24=0 < 0.60
      expect(computePanelState(-1, 40, 3)).toBe('critical');
    });
  });

  // ---------------------------------------------------------------------------
  // Threshold boundaries
  // ---------------------------------------------------------------------------
  describe('threshold boundaries', () => {
    // PACING_ON_TRACK_THRESHOLD = 0.85 (inclusive)
    it('returns onTrack when pacingRatio is exactly PACING_ON_TRACK_THRESHOLD (0.85)', () => {
      // Need: hours / (days/5 * 40) = 0.85
      // Use daysElapsed=5, expected=40, hours=34 → ratio=34/40=0.85
      expect(computePanelState(34, 40, 5)).toBe('onTrack');
    });

    it('returns behind when pacingRatio is just below PACING_ON_TRACK_THRESHOLD (0.84)', () => {
      // hours / (days/5 * 40) = 0.84 → hours=33.6, use daysElapsed=5, hours=33.6
      expect(computePanelState(33.6, 40, 5)).toBe('behind');
    });

    // PACING_BEHIND_THRESHOLD = 0.60 (inclusive)
    it('returns behind when pacingRatio is exactly PACING_BEHIND_THRESHOLD (0.60)', () => {
      // daysElapsed=5, expected=40, hours=24 → ratio=24/40=0.60
      expect(computePanelState(24, 40, 5)).toBe('behind');
    });

    it('returns critical when pacingRatio is just below PACING_BEHIND_THRESHOLD (0.59)', () => {
      // daysElapsed=5, expected=40, hours=23.6 → ratio=23.6/40=0.59
      expect(computePanelState(23.6, 40, 5)).toBe('critical');
    });
  });

  // ---------------------------------------------------------------------------
  // FR1 (01-overtime-display): overtime state
  // ---------------------------------------------------------------------------
  describe('overtime state — FR1 (01-overtime-display)', () => {
    it('FR1.1 — returns overtime when hours strictly exceed weeklyLimit (41 > 40)', () => {
      expect(computePanelState(41, 40, 3)).toBe('overtime');
    });

    it('FR1.2 — returns crushedIt when hours exactly equal weeklyLimit (40 === 40)', () => {
      expect(computePanelState(40, 40, 5)).toBe('crushedIt');
    });

    it('FR1.3 — returns overtime for fractional overage (40.01 > 40)', () => {
      expect(computePanelState(40.01, 40, 3)).toBe('overtime');
    });

    it('FR1.4 — returns non-overtime state when hours just under limit (39.9 < 40)', () => {
      const result = computePanelState(39.9, 40, 3);
      expect(result).not.toBe('overtime');
      expect(result).not.toBe('crushedIt');
    });

    it('FR1.5 — zero-limit guard unchanged: weeklyLimit=0 returns idle regardless of hours', () => {
      expect(computePanelState(0, 0, 0)).toBe('idle');
      expect(computePanelState(10, 0, 3)).toBe('idle');
    });

    it('FR1.6 — zero hours with 40h limit and no days returns idle (not overtime)', () => {
      expect(computePanelState(0, 40, 0)).toBe('idle');
    });

    it('FR1.7 — large overtime value (100h > 40h limit) returns overtime', () => {
      expect(computePanelState(100, 40, 5)).toBe('overtime');
    });

    it('FR1.8 — overtime has higher priority than crushedIt (hours strictly > limit)', () => {
      // hours=41 > limit=40 — must be overtime, never crushedIt
      const result = computePanelState(41, 40, 5);
      expect(result).toBe('overtime');
      expect(result).not.toBe('crushedIt');
    });
  });

  // ---------------------------------------------------------------------------
  // FR2 (01-fractional-days): idle guard updated — days < 1 && hours === 0
  // ---------------------------------------------------------------------------
  describe('idle guard — FR2 (01-fractional-days)', () => {
    it('FR2.1 — daysElapsed=0.333 (Mon 8am), 0h → idle (days < 1 guard)', () => {
      expect(computePanelState(0, 40, 0.333)).toBe('idle');
    });

    it('FR2.2 — daysElapsed=0.999 (Mon near-midnight), 0h → idle', () => {
      expect(computePanelState(0, 40, 0.999)).toBe('idle');
    });

    it('FR2.3 — daysElapsed=0.0 (Mon midnight), 0h → idle (preserved)', () => {
      expect(computePanelState(0, 40, 0.0)).toBe('idle');
    });

    it('FR2.4 — daysElapsed=0.0 (Mon midnight), 5h → onTrack (zero-guard prevents division by zero)', () => {
      // expectedHours = (0 / 5) * 40 = 0 → zero-guard fires → onTrack
      expect(computePanelState(5, 40, 0.0)).toBe('onTrack');
    });

    it('FR2.5 — daysElapsed=1.0 (Tue started), 0h → critical (days >= 1, no longer idle)', () => {
      // expectedHours = (1/5)*40 = 8h; ratio = 0/8 = 0 < 0.60 → critical
      expect(computePanelState(0, 40, 1.0)).toBe('critical');
    });

    it('FR2.6 — daysElapsed=1.292 (Tue 7am), 0h → critical (Tue morning, nothing logged)', () => {
      // expectedHours = (1.292/5)*40 = 10.33h; ratio = 0 → critical
      expect(computePanelState(0, 40, 1.292)).toBe('critical');
    });

    it('FR2.7 — daysElapsed=1.292 (Tue 7am), 12h → onTrack (116% pace — bug case fixed)', () => {
      // expectedHours = (1.292/5)*40 ≈ 10.33h; ratio = 12/10.33 ≈ 1.16 ≥ 0.85
      expect(computePanelState(12, 40, 1.292)).toBe('onTrack');
    });

    it('FR2.8 — daysElapsed=1.292 (Tue 7am), 8h → behind (77% of 10.33h expected, recoverable)', () => {
      // expectedHours = (1.292/5)*40 = 10.336; ratio = 8/10.336 ≈ 0.774 → 0.60 ≤ 0.774 < 0.85 → behind
      expect(computePanelState(8, 40, 1.292)).toBe('behind');
    });

    it('FR2.9 — daysElapsed=1.292 (Tue 7am), 5h → critical (48% of 10.33h expected)', () => {
      // ratio = 5/10.336 ≈ 0.484 < 0.60 → critical
      expect(computePanelState(5, 40, 1.292)).toBe('critical');
    });
  });

  // ---------------------------------------------------------------------------
  // FR1 (01-ahead-of-pace-state): aheadOfPace state
  // ---------------------------------------------------------------------------
  describe('aheadOfPace state — FR1 (01-ahead-of-pace-state)', () => {
    it('FR1.1 — returns aheadOfPace on Mon EOD with 10h (10/8 = 125% of expected)', () => {
      // daysElapsed=1.0, expected = (1/5)*40 = 8h, ratio = 10/8 = 1.25 ≥ 1.25
      expect(computePanelState(10, 40, 1.0)).toBe('aheadOfPace');
    });

    it('FR1.2 — returns aheadOfPace on Tue 9am with 13.75h (13.75/11 = 125% of expected)', () => {
      // daysElapsed=1.375, expected = (1.375/5)*40 = 11h, ratio = 13.75/11 = 1.25
      expect(computePanelState(13.75, 40, 1.375)).toBe('aheadOfPace');
    });

    it('FR1.3 — returns aheadOfPace when pacingRatio is exactly 1.25', () => {
      // daysElapsed=2.0, expected = (2/5)*40 = 16h, ratio = 20/16 = 1.25 exactly
      expect(computePanelState(20, 40, 2.0)).toBe('aheadOfPace');
    });

    it('FR1.4 — returns aheadOfPace when pacingRatio is 2.0 (well above threshold)', () => {
      // daysElapsed=1.0, expected=8h, ratio = 16/8 = 2.0
      expect(computePanelState(16, 40, 1.0)).toBe('aheadOfPace');
    });

    it('FR1.5 — returns onTrack when pacingRatio is 1.249 (just below threshold)', () => {
      // daysElapsed=1.0, expected=8h, hours=9.99 → ratio≈1.249
      expect(computePanelState(9.99, 40, 1.0)).toBe('onTrack');
    });

    it('FR1.6 — overtime takes priority over aheadOfPace (hours > weeklyLimit)', () => {
      // hours=45 > weeklyLimit=40 → overtime fires before pacing ratio check
      expect(computePanelState(45, 40, 1.0)).toBe('overtime');
    });

    it('FR1.7 — crushedIt takes priority over aheadOfPace (hours >= weeklyLimit)', () => {
      // hours=40 === weeklyLimit=40 → crushedIt fires before pacing ratio check
      expect(computePanelState(40, 40, 1.0)).toBe('crushedIt');
    });

    it('FR1.8 — idle guard preserved (days < 1 && hours === 0 → idle)', () => {
      // daysElapsed=0.5, hours=0 → idle guard fires before pacing ratio check
      expect(computePanelState(0, 40, 0.5)).toBe('idle');
    });
  });

  // ---------------------------------------------------------------------------
  // Constant exports
  // ---------------------------------------------------------------------------
  describe('exported constants', () => {
    it('exports PACING_ON_TRACK_THRESHOLD as 0.85', () => {
      expect(PACING_ON_TRACK_THRESHOLD).toBe(0.85);
    });

    it('exports PACING_BEHIND_THRESHOLD as 0.60', () => {
      expect(PACING_BEHIND_THRESHOLD).toBe(0.6);
    });

    it('exports PACING_CRUSHING_THRESHOLD as 1.25', () => {
      expect(PACING_CRUSHING_THRESHOLD).toBe(1.25);
    });
  });
});

// ---------------------------------------------------------------------------
// computeDaysElapsed — FR1 (01-fractional-days)
// Returns float 0.0–5.0 using local timezone.
// ---------------------------------------------------------------------------

describe('computeDaysElapsed', () => {
  // Helper: build a local Date for a given ISO-like string but interpreted
  // in local time (avoid UTC shift).
  function localDate(
    year: number,
    month: number, // 1-based
    day: number,
    hour = 12,
    minute = 0,
    second = 0,
  ): Date {
    return new Date(year, month - 1, day, hour, minute, second, 0);
  }

  describe('weekdays — fractional return (FR1: 01-fractional-days)', () => {
    it('SC1.1 — Monday 08:00 → ≈ 0.333 (fractional, not integer 1)', () => {
      // 2026-03-09 is a Monday; dayIndex=0, hourOfDay=8 → 0 + 8/24 = 0.3333
      const result = computeDaysElapsed(localDate(2026, 3, 9, 8, 0, 0));
      expect(result).toBeCloseTo(8 / 24, 3);
    });

    it('SC1.2 — Monday 00:00:00 → exactly 0.0 (start-of-week edge preserved)', () => {
      expect(computeDaysElapsed(localDate(2026, 3, 9, 0, 0, 0))).toBe(0);
    });

    it('SC1.2b — Monday 12:00 → ≈ 0.500', () => {
      const result = computeDaysElapsed(localDate(2026, 3, 9, 12, 0, 0));
      expect(result).toBeCloseTo(0.5, 3);
    });

    it('SC1.3 — Tuesday 12:00 → ≈ 1.500 (fractional, not integer 2)', () => {
      // dayIndex=1, hourOfDay=12 → 1 + 12/24 = 1.5
      const result = computeDaysElapsed(localDate(2026, 3, 10, 12, 0, 0));
      expect(result).toBeCloseTo(1.5, 3);
    });

    it('SC1.3b — Tuesday 07:00 → ≈ 1.292 (original bug scenario)', () => {
      // dayIndex=1, hourOfDay=7 → 1 + 7/24 ≈ 1.2917
      const result = computeDaysElapsed(localDate(2026, 3, 10, 7, 0, 0));
      expect(result).toBeCloseTo(1 + 7 / 24, 3);
    });

    it('SC1.4 — Wednesday 12:00 → ≈ 2.500 (fractional, not integer 3)', () => {
      // dayIndex=2, hourOfDay=12 → 2 + 12/24 = 2.5
      const result = computeDaysElapsed(localDate(2026, 3, 11, 12, 0, 0));
      expect(result).toBeCloseTo(2.5, 3);
    });

    it('SC1.4b — Wednesday 09:00 → ≈ 2.375', () => {
      // dayIndex=2, hourOfDay=9 → 2 + 9/24 = 2.375
      const result = computeDaysElapsed(localDate(2026, 3, 11, 9, 0, 0));
      expect(result).toBeCloseTo(2 + 9 / 24, 3);
    });

    it('SC1.5 — Thursday 09:00 → ≈ 3.375 (fractional, not integer 4)', () => {
      // dayIndex=3, hourOfDay=9 → 3 + 9/24 = 3.375
      const result = computeDaysElapsed(localDate(2026, 3, 12, 9, 0, 0));
      expect(result).toBeCloseTo(3 + 9 / 24, 3);
    });

    it('SC1.5b — Thursday 15:00 → ≈ 3.625', () => {
      // dayIndex=3, hourOfDay=15 → 3 + 15/24 = 3.625
      const result = computeDaysElapsed(localDate(2026, 3, 12, 15, 0, 0));
      expect(result).toBeCloseTo(3 + 15 / 24, 3);
    });

    it('SC1.6 — Friday 23:59 → exactly 5.0 (clamped)', () => {
      expect(computeDaysElapsed(localDate(2026, 3, 13, 23, 59, 0))).toBe(5);
    });
  });

  describe('weekend clamping', () => {
    it('SC1.7 — Saturday 10:00 → 5 (clamped)', () => {
      expect(computeDaysElapsed(localDate(2026, 3, 14, 10, 0, 0))).toBe(5);
    });

    it('SC1.8 — Sunday 10:00 → 5 (clamped)', () => {
      expect(computeDaysElapsed(localDate(2026, 3, 15, 10, 0, 0))).toBe(5);
    });
  });

  describe('Monday fractional boundary', () => {
    it('SC1.9 — Monday 00:01 → ≈ 0.000694 (tiny fraction, not integer 1)', () => {
      // dayIndex=0, hourOfDay=1/60 → 0 + (1/60)/24 = 1/1440 ≈ 0.000694
      const result = computeDaysElapsed(localDate(2026, 3, 9, 0, 1, 0));
      expect(result).toBeCloseTo(1 / 1440, 4);
      // Must be < 1 (idle guard will catch it as idle when hours === 0)
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('SC1.10 — Monday 23:59:59 → ≈ 0.9999 (less than 1, not integer 1)', () => {
      // dayIndex=0, hourOfDay≈24 → 0 + ~23.9997/24 ≈ 0.99999
      const result = computeDaysElapsed(localDate(2026, 3, 9, 23, 59, 59));
      expect(result).toBeGreaterThan(0.999);
      expect(result).toBeLessThan(1);
    });
  });

  describe('no-argument call', () => {
    it('SC1.11 — called with no argument does not crash and returns 0.0–5.0', () => {
      const result = computeDaysElapsed();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(5);
    });
  });
});
