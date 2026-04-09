/**
 * chartData.ts — VNX data normalizers (04-victory-charts FR1)
 *
 * Converts raw number[] props into typed Victory Native XL datum objects.
 * Used internally by WeeklyBarChart and TrendSparkline.
 * Never imported by calling screens — the external prop APIs are unchanged.
 */

import { colors } from '@/src/lib/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

/** VNX bar datum shape — xKey="day", yKeys=["value"] */
export type BarDatum = {
  day: number;
  value: number;
  color: string;
};

/** VNX line/area datum shape — xKey="x", yKeys=["y"] */
export type LineDatum = {
  x: number;
  y: number;
};

// ─── Normalizers ──────────────────────────────────────────────────────────────

/**
 * toBarData — maps 7 daily-hours values to VNX BarDatum array.
 *
 * Color rules:
 *   index < todayIndex  → colors.success  (past completed days)
 *   index === todayIndex → todayColor      (today's in-progress bar)
 *   index > todayIndex  → colors.textMuted (future / empty days)
 *
 * @param values     Array of hour values (one per day)
 * @param todayIndex Index of today's bar (0-based)
 * @param todayColor Status-driven color for today's bar
 */
export function toBarData(
  values: number[],
  todayIndex: number,
  todayColor: string,
): BarDatum[] {
  return values.map((value, i) => {
    let color: string;
    if (i < todayIndex) {
      color = colors.success;
    } else if (i === todayIndex) {
      color = todayColor;
    } else {
      color = colors.textMuted;
    }
    return { day: i, value, color };
  });
}

/**
 * toLineData — maps a values array to VNX LineDatum array.
 *
 * Each index becomes the x coordinate; the value becomes y.
 *
 * @param values Array of numeric values (e.g. weekly earnings)
 */
export function toLineData(values: number[]): LineDatum[] {
  return values.map((value, i) => ({ x: i, y: value }));
}
