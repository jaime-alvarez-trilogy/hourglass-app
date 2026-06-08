// statsUtils.ts — 04-ai-insights FR1
// Pure statistical primitives. Zero external dependencies.

/**
 * Computes the least-squares linear regression slope of `values` over
 * indices 0..n−1. Returns 0 if n < 2 (cannot fit a line to fewer than 2 points).
 * Positive = trending up, negative = trending down.
 */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  // x_i = index i, mean_x = (n-1)/2
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    numerator += dx * (values[i] - meanY);
    denominator += dx * dx;
  }

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Computes the Pearson correlation coefficient between two equal-length arrays.
 * Returns 0 if n < 2, if the arrays differ in length, or if either array has
 * zero standard deviation (constant values). Result is in [−1, 1].
 */
export function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return 0;

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return 0;
  return num / denom;
}
