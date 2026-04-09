// Tests: getWeeklyEarningsTrend utility — FR2 (05-hours-dashboard)
// File: src/lib/payments.ts (new)

import { getWeeklyEarningsTrend } from '../payments';
import type { Payment } from '../payments';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayment(from: string, amount: number): Payment {
  // Compute Sunday as 6 days after the Monday `from` date
  const fromDate = new Date(from + 'T12:00:00Z');
  const toDate = new Date(fromDate);
  toDate.setUTCDate(toDate.getUTCDate() + 6);
  const to = toDate.toISOString().slice(0, 10);
  return {
    periodStartDate: from,
    periodEndDate: to,
    amount,
    paidHours: 0,
    workedHours: 0,
    status: 'PAID',
  };
}

// Four consecutive Monday dates for test data
const W1 = '2026-02-09'; // week 1 (oldest)
const W2 = '2026-02-16'; // week 2
const W3 = '2026-02-23'; // week 3
const W4 = '2026-03-02'; // week 4 (most recent)
const W5 = '2026-03-09'; // week 5 (extra, for truncation tests)
const W6 = '2026-03-16'; // week 6

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getWeeklyEarningsTrend', () => {
  describe('SC2.1 — empty payments', () => {
    it('returns 4 zeros when payments is empty (default numWeeks=4)', () => {
      const result = getWeeklyEarningsTrend([]);
      expect(result).toEqual([0, 0, 0, 0]);
    });

    it('returns N zeros when payments is empty and numWeeks=N', () => {
      expect(getWeeklyEarningsTrend([], 6)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(getWeeklyEarningsTrend([], 1)).toEqual([0]);
    });
  });

  describe('SC2.2 — 4 payments in distinct weeks', () => {
    it('returns 4 amounts in chronological order (oldest first)', () => {
      const payments = [
        makePayment(W1, 1000),
        makePayment(W2, 1200),
        makePayment(W3, 900),
        makePayment(W4, 1100),
      ];
      const result = getWeeklyEarningsTrend(payments);
      expect(result).toEqual([1000, 1200, 900, 1100]);
    });

    it('handles payments provided in reverse chronological order', () => {
      const payments = [
        makePayment(W4, 1100),
        makePayment(W3, 900),
        makePayment(W2, 1200),
        makePayment(W1, 1000),
      ];
      const result = getWeeklyEarningsTrend(payments);
      expect(result).toEqual([1000, 1200, 900, 1100]);
    });
  });

  describe('SC2.3 — fewer weeks than numWeeks — pads with zeros at start', () => {
    it('2 weeks of data with numWeeks=4 → [0, 0, w1, w2]', () => {
      const payments = [
        makePayment(W3, 900),
        makePayment(W4, 1100),
      ];
      const result = getWeeklyEarningsTrend(payments);
      expect(result).toEqual([0, 0, 900, 1100]);
    });

    it('1 week of data with numWeeks=4 → [0, 0, 0, w1]', () => {
      const payments = [makePayment(W4, 500)];
      const result = getWeeklyEarningsTrend(payments);
      expect(result).toEqual([0, 0, 0, 500]);
    });
  });

  describe('SC2.4 — numWeeks=6 with 4 weeks data → [0, 0, w1, w2, w3, w4]', () => {
    it('pads 2 zeros at start when 4 weeks data and numWeeks=6', () => {
      const payments = [
        makePayment(W1, 1000),
        makePayment(W2, 1200),
        makePayment(W3, 900),
        makePayment(W4, 1100),
      ];
      const result = getWeeklyEarningsTrend(payments, 6);
      expect(result).toEqual([0, 0, 1000, 1200, 900, 1100]);
    });
  });

  describe('SC2.5 — multiple payments sharing same `from` date → summed', () => {
    it('sums 2 records in the same week', () => {
      const payments = [
        makePayment(W4, 600),
        makePayment(W4, 500),
      ];
      const result = getWeeklyEarningsTrend(payments);
      expect(result).toEqual([0, 0, 0, 1100]);
    });

    it('sums 3 records in same week alongside other weeks', () => {
      const payments = [
        makePayment(W3, 300),
        makePayment(W3, 200),
        makePayment(W3, 100),
        makePayment(W4, 1000),
      ];
      const result = getWeeklyEarningsTrend(payments);
      expect(result).toEqual([0, 0, 600, 1000]);
    });
  });

  describe('SC2.6 — more weeks than numWeeks → takes most recent', () => {
    it('6 weeks data with numWeeks=4 → returns only the 4 most recent', () => {
      const payments = [
        makePayment(W1, 100),
        makePayment(W2, 200),
        makePayment(W3, 300),
        makePayment(W4, 400),
        makePayment(W5, 500),
        makePayment(W6, 600),
      ];
      const result = getWeeklyEarningsTrend(payments, 4);
      expect(result).toEqual([300, 400, 500, 600]);
    });
  });

  describe('interface and exports', () => {
    it('SC2.7 — Payment interface has amount, from, to fields', () => {
      // Type-level check via assignment — will fail to compile if wrong
      const p: Payment = { amount: 1000, from: '2026-03-02', to: '2026-03-08' };
      expect(p.amount).toBe(1000);
      expect(p.from).toBe('2026-03-02');
      expect(p.to).toBe('2026-03-08');
    });

    it('SC2.8 — returns an array', () => {
      expect(Array.isArray(getWeeklyEarningsTrend([]))).toBe(true);
    });

    it('SC2.9 — returned array has exactly numWeeks entries', () => {
      expect(getWeeklyEarningsTrend([], 4)).toHaveLength(4);
      expect(getWeeklyEarningsTrend([], 6)).toHaveLength(6);
      expect(getWeeklyEarningsTrend([makePayment(W4, 100)], 4)).toHaveLength(4);
    });
  });
});
