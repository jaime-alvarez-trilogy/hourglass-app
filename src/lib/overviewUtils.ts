// overviewUtils.ts — 03-overview-hero FR3
//
// Pure utility functions for the Overview tab.
// computeEarningsPace: computes earnings pace ratio (current week vs prior average).
// Used by overview.tsx to determine AmbientBackground color signal.
//
// Ratio interpretation (maps to getAmbientColor earningsPace signal):
//   ≥ 0.85 → gold (strong pace)
//   0.60–0.84 → warning (behind pace)
//   < 0.60 → critical (significantly behind)
//   length < 2 → 1.0 (no prior data, assume strong)

/**
 * Computes the earnings pace ratio: last entry of earnings[] divided by
 * the average of all prior entries.
 *
 * @param earnings - Weekly earnings array ordered oldest→newest.
 *   Length = selected window (4 or 12). Last entry = current week.
 * @returns Ratio ≥ 0. Returns 1.0 for empty/single arrays (no prior = assume strong).
 *
 * Edge cases:
 *   - length < 2 → 1.0 (no prior periods to compare)
 *   - prior avg = 0 → 1.0 (all prior weeks zero = assume strong)
 */
export function computeEarningsPace(earnings: number[]): number {
  if (earnings.length < 2) return 1.0;
  const prior = earnings.slice(0, -1);
  const priorAvg = prior.reduce((sum, val) => sum + val, 0) / prior.length;
  if (priorAvg === 0) return 1.0;
  return earnings[earnings.length - 1] / priorAvg;
}

/**
 * Returns the count of consecutive completed weeks (all but last, which is
 * the partial current week) where each value meets or exceeds `target`.
 * Counts from the most-recent completed week backwards.
 *
 * Returns 0 if fewer than 2 entries (no completed weeks).
 */
export function computeStreak(data: number[], target: number): number {
  if (data.length < 2) return 0;
  const completed = data.slice(0, -1); // exclude current partial week
  let streak = 0;
  for (let i = completed.length - 1; i >= 0; i--) {
    if (completed[i] >= target) streak++;
    else break;
  }
  return streak;
}

/**
 * Computes an EWMA-smoothed annual earnings projection.
 *
 * - Excludes the last entry (partial current week)
 * - Excludes zero values (weeks with no data — gap weeks, onboarding, etc.)
 * - Returns 0 if fewer than 2 completed non-zero weeks (not enough signal)
 * - EWMA with alpha=0.3: more weight to recent weeks, smooths short-term noise
 * - Returns ewma * 52 as the annualized projection
 *
 * @param earnings - Weekly earnings array ordered oldest→newest.
 *   Last entry = current (partial) week, excluded from calculation.
 * @returns Annualized projection in dollars, or 0 if insufficient data.
 */
export function computeAnnualProjection(earnings: number[]): number {
  const completed = earnings.slice(0, -1).filter(v => v > 0);
  if (completed.length < 2) return 0;
  const alpha = 0.3;
  let ewma = completed[0];
  for (let i = 1; i < completed.length; i++) {
    ewma = alpha * completed[i] + (1 - alpha) * ewma;
  }
  return ewma * 52;
}

/**
 * Returns 0–100 percentage of completed weeks (all but last) where value
 * meets or exceeds `target`.
 *
 * Returns 0 if fewer than 2 entries.
 */
export function computeTargetHitRate(data: number[], target: number): number {
  if (data.length < 2) return 0;
  const completed = data.slice(0, -1);
  const hits = completed.filter(v => v >= target).length;
  return Math.round((hits / completed.length) * 100);
}
