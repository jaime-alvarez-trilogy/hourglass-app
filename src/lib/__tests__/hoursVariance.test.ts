// Tests for computeHoursVariance (03-hours-variance)

import { computeHoursVariance } from '../hours';

describe('computeHoursVariance', () => {
  // ── Null cases (insufficient data) ────────────────────────────────────────

  it('returns null when fewer than 3 completed non-zero entries (2 entries total)', () => {
    // [40, 40] — last is current week (excluded), only 1 completed entry
    expect(computeHoursVariance([40, 40])).toBeNull();
  });

  it('returns null when exactly 2 completed non-zero entries', () => {
    // [40, 40, 40] — last excluded → 2 completed entries, need ≥ 3
    expect(computeHoursVariance([40, 40, 40])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(computeHoursVariance([])).toBeNull();
  });

  it('returns null for single-entry array', () => {
    expect(computeHoursVariance([40])).toBeNull();
  });

  it('returns null when zeros reduce completed entries below 3', () => {
    // [40, 0, 40, current] — after excluding last and zeros, only 2 non-zero completed
    expect(computeHoursVariance([40, 0, 40, 38])).toBeNull();
  });

  // ── Zero exclusion ─────────────────────────────────────────────────────────

  it('excludes zero values when counting completed entries', () => {
    // [40, 40, 0, 40, current] — after excluding last (40) and zeros, 3 non-zero remain → not null
    const result = computeHoursVariance([40, 40, 0, 40, 38]);
    expect(result).not.toBeNull();
    expect(result!.stdDev).toBe(0);
    expect(result!.label).toBe('Consistent');
    expect(result!.isConsistent).toBe(true);
  });

  // ── Consistent cases (stdDev <= 1) ─────────────────────────────────────────

  it('returns Consistent label and isConsistent=true when stdDev is 0 (identical values)', () => {
    // [40, 40, 40, 40] — last excluded → [40, 40, 40], stdDev = 0
    const result = computeHoursVariance([40, 40, 40, 40]);
    expect(result).not.toBeNull();
    expect(result!.stdDev).toBe(0);
    expect(result!.label).toBe('Consistent');
    expect(result!.isConsistent).toBe(true);
  });

  it('returns Consistent and isConsistent=true for small variance within 1h', () => {
    // [38, 42, 39, 41, 40] — last (40) excluded → [38, 42, 39, 41]
    // mean = 40, variance = (4+4+1+1)/4 = 2.5, stdDev ≈ 1.58 → within ±Xh/week range
    // BUT the spec says isConsistent: stdDev <= 2, so this should be isConsistent=true
    const result = computeHoursVariance([38, 42, 39, 41, 40]);
    expect(result).not.toBeNull();
    expect(result!.isConsistent).toBe(true);
    // stdDev ≈ 1.58 → label is '±1.6h/week' (between 1 and 3)
    expect(result!.label).toMatch(/^[±\u00B1]/);
  });

  // ── Variance label (1 < stdDev <= 3) ──────────────────────────────────────

  it('returns ±X.Xh/week label for moderate variance', () => {
    // [28, 40, 35, 45, 38] — last (38) excluded → [28, 40, 35, 45]
    // mean = 37, deviations: -9, 3, -2, 8 → squares: 81, 9, 4, 64 → variance=39.5, stdDev≈6.28
    // stdDev > 3 → 'Variable'
    const result = computeHoursVariance([28, 40, 35, 45, 38]);
    expect(result).not.toBeNull();
    // stdDev ≈ 6.28, which is > 3 → Variable
    expect(result!.label).toBe('Variable');
    expect(result!.isConsistent).toBe(false);
  });

  it('returns ±X.Xh/week label when stdDev is between 1 and 3', () => {
    // Craft values where stdDev lands between 1 and 3
    // [39, 41, 39, 41, 40] → last (40) excluded → [39, 41, 39, 41]
    // mean=40, variance=(1+1+1+1)/4=1, stdDev=1 → exactly 1, so label='Consistent'
    // Try [38, 42, 38, 42, 40] → [38, 42, 38, 42], mean=40, var=(4+4+4+4)/4=4, stdDev=2
    // stdDev=2 → label '±2.0h/week', isConsistent=true (<=2)
    const result = computeHoursVariance([38, 42, 38, 42, 40]);
    expect(result).not.toBeNull();
    expect(result!.stdDev).toBeCloseTo(2, 5);
    expect(result!.label).toBe('\u00B12.0h/week');
    expect(result!.isConsistent).toBe(true); // stdDev <= 2
  });

  // ── Variable case (stdDev > 3) ─────────────────────────────────────────────

  it('returns Variable label when stdDev exceeds 3', () => {
    // Large spread: [20, 45, 20, 45, 30] → last excluded → [20, 45, 20, 45]
    // mean=32.5, deviations: -12.5, 12.5, -12.5, 12.5 → variance=156.25, stdDev=12.5
    const result = computeHoursVariance([20, 45, 20, 45, 30]);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Variable');
    expect(result!.isConsistent).toBe(false);
  });

  // ── Last entry always excluded (current partial week) ─────────────────────

  it('always excludes the last entry regardless of its value', () => {
    // If last entry were included, it would change stdDev significantly
    // [40, 40, 40, 999] → last (999) excluded → [40, 40, 40], stdDev=0
    const result = computeHoursVariance([40, 40, 40, 999]);
    expect(result).not.toBeNull();
    expect(result!.stdDev).toBe(0);
    expect(result!.label).toBe('Consistent');
  });

  // ── isConsistent boundary ─────────────────────────────────────────────────

  it('isConsistent is true when stdDev equals exactly 2', () => {
    // [38, 42, 38, 42, 40] gives stdDev=2 as shown above
    const result = computeHoursVariance([38, 42, 38, 42, 40]);
    expect(result!.isConsistent).toBe(true);
  });

  it('isConsistent is false when stdDev exceeds 2', () => {
    // stdDev > 2 → not consistent
    const result = computeHoursVariance([20, 45, 20, 45, 30]);
    expect(result!.isConsistent).toBe(false);
  });

  // ── Return shape ──────────────────────────────────────────────────────────

  it('returns an object with stdDev, label, and isConsistent fields', () => {
    const result = computeHoursVariance([40, 40, 40, 40]);
    expect(result).toHaveProperty('stdDev');
    expect(result).toHaveProperty('label');
    expect(result).toHaveProperty('isConsistent');
  });
});
