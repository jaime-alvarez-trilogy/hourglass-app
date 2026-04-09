// Tests: hours.ts — FR1 (05-earnings-scrub): getWeekLabels
//
// FR1: getWeekLabels(count) utility
//   SC1.1 — getWeekLabels(0) returns []
//   SC1.2 — getWeekLabels(1) returns array of length 1 with current Monday label
//   SC1.3 — getWeekLabels(4) returns 4 labels, oldest first, each 7 days apart
//   SC1.4 — labels use abbreviated month + day, no year (e.g. "Mar 3")
//   SC1.5 — getWeekLabels(12) returns 12 labels, no crash
//   SC1.6 — all labels are Mondays (day-of-week calculation correct)
//
// Strategy:
// - Pure function with no side effects, no React needed
// - Mock Date to control "today" and make tests deterministic
// - Verify label count, spacing, and format

import { getWeekLabels } from '../hours';

// ─── Date mock helpers ────────────────────────────────────────────────────────

/**
 * Mock Date to a known "today" value for deterministic tests.
 * Uses jest.spyOn so we can restore it cleanly in afterEach.
 */
function mockDate(isoDate: string) {
  const fixed = new Date(isoDate + 'T12:00:00'); // noon local to avoid DST boundary
  jest.spyOn(global, 'Date').mockImplementation((...args: any[]) => {
    if (args.length === 0) return new RealDate(fixed);
    return new RealDate(...(args as [any]));
  });
}

const RealDate = Date;

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── FR1: getWeekLabels ───────────────────────────────────────────────────────

describe('getWeekLabels', () => {
  describe('SC1.1 — empty count', () => {
    it('returns [] for count = 0', () => {
      expect(getWeekLabels(0)).toEqual([]);
    });
  });

  describe('SC1.2 — count = 1 returns current Monday label', () => {
    it('returns array of length 1 when count = 1', () => {
      const result = getWeekLabels(1);
      expect(result).toHaveLength(1);
    });

    it('returns a non-empty string label', () => {
      const result = getWeekLabels(1);
      expect(typeof result[0]).toBe('string');
      expect(result[0].length).toBeGreaterThan(0);
    });

    it('label for count=1 on a known Wednesday is the preceding Monday', () => {
      // 2026-03-18 is a Wednesday
      mockDate('2026-03-18');
      const result = getWeekLabels(1);
      // Monday of that week is 2026-03-16 → "Mar 16"
      expect(result[0]).toBe('Mar 16');
    });

    it('label for count=1 on a known Monday is that same day', () => {
      // 2026-03-16 is a Monday
      mockDate('2026-03-16');
      const result = getWeekLabels(1);
      expect(result[0]).toBe('Mar 16');
    });

    it('label for count=1 on a known Sunday is the preceding Monday', () => {
      // 2026-03-22 is a Sunday
      mockDate('2026-03-22');
      const result = getWeekLabels(1);
      // Monday of that week: 2026-03-16 → "Mar 16"
      expect(result[0]).toBe('Mar 16');
    });
  });

  describe('SC1.3 — count = 4, oldest first, 7 days apart', () => {
    it('returns array of length 4', () => {
      mockDate('2026-03-18'); // Wednesday
      const result = getWeekLabels(4);
      expect(result).toHaveLength(4);
    });

    it('returns 4 labels oldest first (earliest Monday first)', () => {
      // Wednesday 2026-03-18; current Monday = Mar 16
      // 4 weeks back: Mar 16, Mar 9, Mar 2, Feb 23 → oldest first: Feb 23, Mar 2, Mar 9, Mar 16
      mockDate('2026-03-18');
      const result = getWeekLabels(4);
      expect(result[0]).toBe('Feb 23'); // oldest
      expect(result[1]).toBe('Mar 2');
      expect(result[2]).toBe('Mar 9');
      expect(result[3]).toBe('Mar 16'); // current week (newest)
    });

    it('consecutive labels are 7 days apart (span one week)', () => {
      mockDate('2026-03-18');
      const result = getWeekLabels(4);
      // Parse each label back to verify 7-day spacing
      // Labels are like "Feb 23", "Mar 2" — verify sequential Mondays
      expect(result).toHaveLength(4);
      // Verify the last label is current Monday (Mar 16)
      expect(result[3]).toBe('Mar 16');
      // Verify the first label is 3 weeks before (Feb 23)
      expect(result[0]).toBe('Feb 23');
    });
  });

  describe('SC1.4 — label format: abbreviated month + day, no year', () => {
    it('format matches "MMM D" (e.g. "Mar 3", "Feb 10")', () => {
      mockDate('2026-03-18');
      const result = getWeekLabels(4);
      // Each label should be "Abc N" or "Abc NN"
      const labelPattern = /^[A-Z][a-z]{2} \d{1,2}$/;
      result.forEach(label => {
        expect(label).toMatch(labelPattern);
      });
    });

    it('uses abbreviated month names (3-letter)', () => {
      mockDate('2026-01-07'); // Wednesday Jan 7 → Monday Jan 5
      const result = getWeekLabels(1);
      expect(result[0]).toBe('Jan 5');
    });

    it('does not include the year', () => {
      mockDate('2026-03-18');
      const result = getWeekLabels(4);
      result.forEach(label => {
        expect(label).not.toMatch(/\d{4}/);
      });
    });

    it('single-digit days are not zero-padded (e.g. "Mar 3" not "Mar 03")', () => {
      // 2026-03-04 is a Wednesday → Monday = Mar 2
      mockDate('2026-03-04');
      const result = getWeekLabels(1);
      expect(result[0]).toBe('Mar 2');
      expect(result[0]).not.toContain('03');
      expect(result[0]).not.toBe('Mar 02');
    });
  });

  describe('SC1.5 — count = 12, no crash', () => {
    it('returns array of length 12', () => {
      const result = getWeekLabels(12);
      expect(result).toHaveLength(12);
    });

    it('all 12 labels are non-empty strings', () => {
      const result = getWeekLabels(12);
      result.forEach(label => {
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      });
    });

    it('last label (index 11) is current week Monday', () => {
      // 2026-03-16 is Monday
      mockDate('2026-03-16');
      const result = getWeekLabels(12);
      expect(result[11]).toBe('Mar 16');
    });
  });

  describe('SC1.6 — all labels are Mondays', () => {
    const MONTHS: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    /**
     * Parse a "MMM D" label to a Date, inferring the year from context.
     * For labels near year boundaries (e.g. "Dec 29" when today is Jan 7),
     * use the supplied currentYear to decide whether the label is in the prior year.
     */
    function parseLabelWithYear(label: string, currentYear: number, currentMonth: number): Date {
      const [mon, day] = label.split(' ');
      const month = MONTHS[mon];
      // If the label month is later in the year than current month (by > 6 months),
      // it must be from the prior year (e.g. label "Dec" when today is "Jan")
      const year = month > currentMonth + 6 ? currentYear - 1 : currentYear;
      return new RealDate(year, month, parseInt(day, 10), 12, 0, 0);
    }

    it('each label parses to a Monday (getDay() === 1)', () => {
      mockDate('2026-03-18');
      const result = getWeekLabels(4);
      result.forEach(label => {
        const d = parseLabelWithYear(label, 2026, 2); // March = month 2
        expect(d.getDay()).toBe(1); // Monday
      });
    });

    it('12-week labels are all Mondays', () => {
      mockDate('2026-03-18');
      const result = getWeekLabels(12);
      result.forEach(label => {
        const d = parseLabelWithYear(label, 2026, 2);
        expect(d.getDay()).toBe(1);
      });
    });
  });

  describe('year boundary (Dec → Jan)', () => {
    it('handles year rollover correctly (Jan labels after Dec today)', () => {
      // 2026-01-05 is a Monday
      mockDate('2026-01-07'); // Wednesday
      const result = getWeekLabels(2);
      // 2 weeks: Dec 29 (2025) and Jan 5 (2026)
      expect(result[0]).toBe('Dec 29');
      expect(result[1]).toBe('Jan 5');
    });
  });
});
