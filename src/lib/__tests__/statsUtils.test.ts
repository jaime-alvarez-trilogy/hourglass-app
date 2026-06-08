// Tests: statsUtils.ts — 04-ai-insights FR1
//
// FR1: linearSlope(values) and pearsonR(xs, ys) statistical primitives
//   SC1.1 — linearSlope: flat array returns 0
//   SC1.2 — linearSlope: unit-increasing returns 1.0
//   SC1.3 — linearSlope: unit-decreasing returns -1.0
//   SC1.4 — linearSlope: single element returns 0
//   SC1.5 — linearSlope: two elements [10,20] returns 10
//   SC1.6 — pearsonR: perfect positive correlation returns 1.0
//   SC1.7 — pearsonR: perfect negative correlation returns -1.0
//   SC1.8 — pearsonR: constant second array returns 0 (zero stddev)
//   SC1.9 — pearsonR: length mismatch returns 0
//
// Strategy: pure functions — direct unit tests, no mocking required.

import { linearSlope, pearsonR } from '../statsUtils';

// ─── linearSlope ─────────────────────────────────────────────────────────────

describe('linearSlope', () => {
  describe('SC1.1 — flat array', () => {
    it('returns 0 for all-equal values', () => {
      expect(linearSlope([5, 5, 5, 5, 5])).toBe(0);
    });
  });

  describe('SC1.2 — unit-increasing', () => {
    it('returns 1.0 for [0,1,2,3,4]', () => {
      expect(linearSlope([0, 1, 2, 3, 4])).toBeCloseTo(1.0, 10);
    });
  });

  describe('SC1.3 — unit-decreasing', () => {
    it('returns -1.0 for [4,3,2,1,0]', () => {
      expect(linearSlope([4, 3, 2, 1, 0])).toBeCloseTo(-1.0, 10);
    });
  });

  describe('SC1.4 — single element guard', () => {
    it('returns 0 for a single-element array', () => {
      expect(linearSlope([10])).toBe(0);
    });
  });

  describe('SC1.5 — two elements', () => {
    it('returns 10 for [10, 20]', () => {
      expect(linearSlope([10, 20])).toBeCloseTo(10, 10);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for empty array', () => {
      expect(linearSlope([])).toBe(0);
    });

    it('handles non-integer values', () => {
      // Slope of [0, 0.5, 1.0, 1.5] should be 0.5
      expect(linearSlope([0, 0.5, 1.0, 1.5])).toBeCloseTo(0.5, 10);
    });
  });
});

// ─── pearsonR ─────────────────────────────────────────────────────────────────

describe('pearsonR', () => {
  describe('SC1.6 — perfect positive correlation', () => {
    it('returns 1.0 for identical arrays', () => {
      expect(pearsonR([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 10);
    });
  });

  describe('SC1.7 — perfect negative correlation', () => {
    it('returns -1.0 for perfectly inverted arrays', () => {
      expect(pearsonR([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1.0, 10);
    });
  });

  describe('SC1.8 — zero stddev guard', () => {
    it('returns 0 when second array is constant', () => {
      expect(pearsonR([1, 2, 3], [2, 2, 2])).toBe(0);
    });

    it('returns 0 when first array is constant', () => {
      expect(pearsonR([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  describe('SC1.9 — length mismatch guard', () => {
    it('returns 0 when arrays have different lengths', () => {
      expect(pearsonR([1, 2], [1, 2, 3])).toBe(0);
    });

    it('returns 0 when one array is empty', () => {
      expect(pearsonR([], [1, 2, 3])).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for n < 2 (both empty)', () => {
      expect(pearsonR([], [])).toBe(0);
    });

    it('returns 0 for single-element arrays (cannot compute stddev)', () => {
      expect(pearsonR([5], [5])).toBe(0);
    });

    it('returns value in [-1, 1] range for arbitrary arrays', () => {
      const r = pearsonR([1, 3, 2, 5, 4], [2, 5, 3, 6, 4]);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    });
  });
});
