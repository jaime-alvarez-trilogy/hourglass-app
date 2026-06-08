/**
 * DayPatternChart — 02-chart-component
 *
 * Renders a 7-bar vertical bar chart (Mon–Sun) showing average hours per day.
 * Bars use Skia Canvas + LinearGradient to match WeeklyBarChart's visual style.
 *
 * Layout (top → bottom):
 *   Arrow zone (22px)  — ↑ or ↓ floats here; absent when no trend or rest day
 *   Canvas (height px) — bars with gradient, pixel-precise positioning
 *   Label zone (18px)  — M T W T F S S
 *
 * Trend arrows are shown when `prev` is provided and |delta| ≥ trendThreshold (0.5h).
 * No arrows on rest days (avg < 0.5h).
 *
 * Used by Overview (with prev, windowed) and Home (prev omitted, no arrows).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, RoundedRect, LinearGradient, vec } from '@shopify/react-native-skia';
import { colors } from '@/src/lib/colors';
import { TREND_THRESHOLD } from '@/src/lib/dayPatternUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

const ARROW_ZONE_H = 22;
const LABEL_H = 18;
const BAR_W_RATIO = 0.60; // fraction of cell width — matches WeeklyBarChart's 65%
const BAR_RADIUS = 4;     // matches WeeklyBarChart
const ARROW_FONT_SIZE = 13;
const LABEL_FONT_SIZE = 11;
const MIN_BAR_H = 3;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DayPatternChartProps {
  /** Length-7 array of avg hours per day, Mon=0…Sun=6. */
  current: number[];
  /** Prior-period averages (same shape). null/undefined → no arrows rendered. */
  prev?: number[] | null;
  /** Total component width in pixels. */
  width: number;
  /** Bar area height in pixels (excludes arrow zone + label). */
  height: number;
  /** Minimum |delta| to show a trend arrow. Defaults to TREND_THRESHOLD (0.5h). */
  trendThreshold?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DayPatternChart({
  current,
  prev,
  width,
  height,
  trendThreshold = TREND_THRESHOLD,
}: DayPatternChartProps) {
  if (width === 0) return null;

  const maxHours = Math.max(...current, 1);
  const cellW = width / 7;
  const barW = cellW * BAR_W_RATIO;

  const columns = DAY_LABELS.map((label, i) => {
    const avgH = current[i] ?? 0;
    const isWorkDay = avgH >= 0.5;
    const barColor = isWorkDay ? colors.success : colors.surface;
    const barH = Math.max((avgH / maxHours) * height, MIN_BAR_H);

    const delta = prev ? current[i] - prev[i] : 0;
    const showUp = !!prev && isWorkDay && delta >= trendThreshold;
    const showDown = !!prev && isWorkDay && delta <= -trendThreshold;

    // Pixel-precise bar position — avoids fractional-width misalignment from % strings
    const barX = i * cellW + (cellW - barW) / 2;
    const barTop = height - barH;

    return { label, isWorkDay, barH, barColor, showUp, showDown, barX, barTop };
  });

  return (
    <View style={{ width }}>
      {/* Arrow zone — ↑/↓ sit at the bottom of this band, just above the bar */}
      <View style={styles.arrowRow}>
        {columns.map((col, i) => (
          <View key={i} style={styles.arrowCell}>
            {col.showUp && (
              <Text style={[styles.arrow, { color: colors.success }]}>↑</Text>
            )}
            {col.showDown && (
              <Text style={[styles.arrow, { color: colors.warning }]}>↓</Text>
            )}
          </View>
        ))}
      </View>

      {/* Bar canvas — Skia RoundedRect + LinearGradient matches WeeklyBarChart style */}
      <Canvas style={{ width, height }}>
        {columns.map((col, i) => (
          <RoundedRect
            key={i}
            x={col.barX}
            y={col.barTop}
            width={barW}
            height={col.barH}
            r={BAR_RADIUS}
          >
            <LinearGradient
              start={vec(0, col.barTop)}
              end={vec(0, height)}
              colors={[col.barColor, 'transparent']}
            />
          </RoundedRect>
        ))}
      </Canvas>

      {/* Day labels */}
      <View style={styles.labelRow}>
        {columns.map((col, i) => (
          <Text
            key={i}
            style={[
              styles.label,
              { color: col.isWorkDay ? colors.textSecondary : colors.textMuted },
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  arrowRow: {
    flexDirection: 'row',
    height: ARROW_ZONE_H,
  },
  arrowCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  arrow: {
    fontSize: ARROW_FONT_SIZE,
    lineHeight: ARROW_FONT_SIZE + 3,
    fontWeight: '600',
  },
  labelRow: {
    flexDirection: 'row',
    height: LABEL_H,
    marginTop: 4,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: LABEL_FONT_SIZE,
  },
});

export default DayPatternChart;
