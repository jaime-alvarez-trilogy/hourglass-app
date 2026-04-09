/**
 * WeeklyBarChart — VNX CartesianChart + Bar (04-victory-charts FR2)
 *
 * Migration from bespoke Skia Rect bars to Victory Native XL.
 * External prop API is UNCHANGED — all callers continue to work without modification.
 *
 * Visual enhancements:
 * - Vertical LinearGradient fill: peak color at top → transparent at base
 * - Rounded top corners (4px radius)
 * - Entry animation: Animated.View clip reveals chart left-to-right on mount
 *   (same clipProgress / timingChartFill pattern as before — zero JS per frame)
 *
 * Overtime coloring and watermark label are preserved exactly.
 */

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { CartesianChart } from 'victory-native';
import {
  Canvas,
  Text as SkiaText,
  LinearGradient,
  RoundedRect,
  matchFont,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { colors } from '@/src/lib/colors';
import { timingChartFill } from '@/src/lib/reanimated-presets';
import { toBarData } from '@/src/lib/chartData';

export interface DailyHours {
  day: string;
  hours: number;
  isToday?: boolean;
  isFuture?: boolean;
}

export interface WeeklyBarChartProps {
  data: DailyHours[];
  maxHours?: number;
  width: number;
  height: number;
  /** When provided, bars whose running cumulative total exceeds this value shift to OVERTIME_WHITE_GOLD */
  weeklyLimit?: number;
  /**
   * Hex colour for today's in-progress bar.
   * Should reflect the current panel state (success/warning/critical/overtimeWhiteGold/textMuted).
   * Default: colors.success (on-track green).
   */
  todayColor?: string;
  /**
   * Optional large watermark text rendered at chart center (e.g. "38.5h").
   * Rendered at very low opacity for a ghost/texture effect.
   */
  watermarkLabel?: string;
}

/** Warm white-gold used for bars that push the running total beyond weeklyLimit */
const OVERTIME_WHITE_GOLD = '#FFF8E7';
const WATERMARK_FONT_SIZE = 52;

export default function WeeklyBarChart({
  data,
  maxHours,
  width,
  height,
  weeklyLimit,
  todayColor = colors.success,
  watermarkLabel,
}: WeeklyBarChartProps) {
  const clipProgress = useSharedValue(0);

  useEffect(() => {
    clipProgress.value = withTiming(1, timingChartFill);
  }, []);

  // Once fully revealed, return {} so the Animated.View has no width constraint.
  // This removes the overflow:hidden clip on the touch/hit-test area, enabling
  // gesture interactions (scrub) on the full chart. Any floating-point imprecision
  // in withTiming(1) would otherwise leave a 1px clip on the right edge.
  // Once fully revealed, remove overflow:hidden so gestures work on the full chart.
  // overflow:hidden is only needed during the clip animation; after completion it would
  // block touches on the absolute-positioned inner View if width ever collapses to 0.
  const clipStyle = useAnimatedStyle(() => {
    const p = clipProgress.value;
    if (p >= 0.99) return { width }; // exact prop width — no overflow:hidden
    return { overflow: 'hidden' as const, width: p * width };
  });

  if (data.length === 0 || width === 0) return null;

  const h = height > 0 ? height : 120;

  // Max Y domain
  const resolvedMax = Math.max(maxHours ?? 8, ...data.map((d) => d.hours));

  // ── Compute per-bar colors (overtime logic requires running cumulative total) ──
  let runningTotal = 0;
  const derivedColors: string[] = data.map((entry) => {
    if (entry.isFuture) {
      return colors.textMuted;
    }
    runningTotal += entry.hours;
    if (weeklyLimit !== undefined && runningTotal > weeklyLimit) {
      return OVERTIME_WHITE_GOLD;
    }
    if (entry.isToday) {
      return todayColor;
    }
    return colors.success;
  });

  const todayIndex = data.findIndex((d) => d.isToday);
  const rawValues = data.map((d) => d.hours);

  // Watermark font — only loaded when needed
  const watermarkFont =
    watermarkLabel ? matchFont({ fontFamily: 'System', fontSize: WATERMARK_FONT_SIZE }) : null;

  const watermarkTextW =
    watermarkFont && watermarkLabel ? watermarkFont.measureText(watermarkLabel).width : 0;
  const watermarkX = width / 2 - watermarkTextW / 2;
  const watermarkY = h / 2 + WATERMARK_FONT_SIZE / 3;

  return (
    // Clip container: animates width 0 → W to reveal chart left-to-right.
    // CartesianChart is inside an absolute View at full `width` so its layout
    // is stable — it always measures W and renders bars at correct positions.
    // Without this, CartesianChart re-layouts at every intermediate clip width,
    // causing an "unfolding" effect instead of a clean left-to-right reveal.
    <Animated.View style={[{ height: h }, clipStyle]}>
      <View style={{ position: 'absolute', top: 0, left: 0, width, height: h }}>
        {/* Watermark canvas — rendered behind the bar chart */}
        {watermarkLabel && watermarkFont && (
          <Canvas
            style={{ position: 'absolute', top: 0, left: 0, width, height: h, zIndex: 0 }}
          >
            <SkiaText
              x={watermarkX}
              y={watermarkY}
              text={watermarkLabel}
              font={watermarkFont}
              color={colors.textPrimary}
              opacity={0.07}
            />
          </Canvas>
        )}

        {/* Per-bar RoundedRect with LinearGradient — each bar gets its own gradient. */}
        {/* VNX's Bar component applies one gradient to ALL bars in a series, so it   */}
        {/* cannot produce per-bar color gradients. Using Skia RoundedRect directly   */}
        {/* inside CartesianChart's render prop gives full per-bar control.           */}
        {(() => {
          const chartData = toBarData(rawValues, todayIndex, todayColor);
          return (
            <CartesianChart
              data={chartData}
              xKey="day"
              yKeys={['value']}
              domain={{ y: [0, resolvedMax] }}
              // top/bottom: 0 — suppresses VNX's internal vertical axis compression
              // No X domainPadding — bar positions computed directly from chartBounds
              // to avoid VNX point.x/cellW misalignment that causes uneven bar widths.
              domainPadding={{ top: 0, bottom: 0 }}
            >
              {({ points, chartBounds }) => {
                const n = chartData.length;
                const cellW = n > 0 ? (chartBounds.right - chartBounds.left) / n : 0;
                const barW = cellW * 0.65; // 65% of cell width; rest is gap
                return (
                  <>
                    {points.value.map((point, i) => {
                      if (point.y === null || point.y === undefined) return null;
                      // Compute barX from index directly — avoids VNX domainPadding
                      // shifting point.x out of sync with cellW-derived barW.
                      const barX = chartBounds.left + i * cellW + (cellW - barW) / 2;
                      const barTop = point.y;
                      const barBottom = chartBounds.bottom;
                      const barH = Math.max(0, barBottom - barTop);
                      if (barH === 0) return null;
                      const barColor = derivedColors[i] ?? colors.textMuted;
                      return (
                        <RoundedRect
                          key={i}
                          x={barX}
                          y={barTop}
                          width={barW}
                          height={barH}
                          r={4}
                        >
                          <LinearGradient
                            start={vec(0, barTop)}
                            end={vec(0, barBottom)}
                            colors={[barColor, 'transparent']}
                          />
                        </RoundedRect>
                      );
                    })}
                  </>
                );
              }}
            </CartesianChart>
          );
        })()}
      </View>
    </Animated.View>
  );
}
