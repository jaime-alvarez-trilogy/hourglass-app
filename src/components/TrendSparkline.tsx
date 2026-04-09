/**
 * TrendSparkline — VNX CartesianChart + Line + Area (04-victory-charts FR3)
 *
 * Migration from bespoke Skia bezier path to Victory Native XL.
 * External prop API is UNCHANGED — all callers and 07-overview-sync continue to work.
 *
 * Visual enhancements:
 * - Line with BlurMaskFilter neon glow paint
 * - Area with LinearGradient fill (brand color → transparent)
 *
 * Gesture migration:
 * - Gesture: useChartPressState (VNX built-in, replaces the old gesture hook)
 * - chartPressState={state} wires VNX's gesture tracking to the shared value
 * - state.x.value is the data-domain x (= integer index from toLineData)
 * - externalCursorIndex / onScrubChange interface preserved via renderOutside overlay
 *
 * Edge cases:
 *   - data=[]   → null (no crash), gesture disabled
 *   - width=0   → null (no crash)
 *   - data=[x]  → renders single-point chart (no crash)
 *   - all zeros → flat line at bottom
 */

import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import {
  Canvas,
  Line as SkiaLine,
  Circle,
  vec,
  matchFont,
  Text as SkiaText,
  BlurMask,
  LinearGradient,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { colors } from '@/src/lib/colors';
import { timingChartFill } from '@/src/lib/reanimated-presets';
import { toLineData } from '@/src/lib/chartData';

export interface TrendSparklineProps {
  data: number[];
  width: number;
  height: number;
  /** Line color. Default: colors.gold */
  color?: string;
  /** Line stroke width. Default: 2.5 (brand §5.3) */
  strokeWidth?: number;
  /**
   * Optional ceiling value for the Y-axis scale.
   * If provided and >= all data values, the chart scales to this max instead of
   * data max — so bars/lines never touch the top unless data reaches maxValue.
   */
  maxValue?: number;
  /**
   * Show a faint horizontal guide line at the top of the chart (y=2),
   * representing the maxValue reference. Default: false.
   */
  showGuide?: boolean;
  /**
   * Optional label rendered at the right edge of the guide line.
   * Only shown when showGuide is true. e.g. "$2,000"
   */
  capLabel?: string;
  /**
   * When provided, the guide line is drawn at this data value's Y position
   * instead of at the top of the chart. Use when the target is below maxValue,
   * e.g. targetValue={75} with maxValue={100} for the 75% AI usage guide.
   */
  targetValue?: number;
  /**
   * Called with the nearest data index (0..N-1) during a horizontal pan gesture,
   * and with null when the gesture ends. Enables parent to update a hero value.
   */
  onScrubChange?: (index: number | null) => void;
  /**
   * Human-readable week labels for each data point (oldest first).
   * Length should match data.length. Used by parent for sub-label display.
   * Not rendered inside the canvas.
   */
  weekLabels?: string[];
  /**
   * External cursor index driven by a parent component for synchronized scrubbing.
   * When non-null, renders a cursor at that data index regardless of internal gesture state.
   * Takes priority over the internal gesture cursor.
   * Out-of-range values are clamped to [0, data.length - 1].
   * Used by OverviewScreen (07-overview-sync) to sync all 4 charts.
   */
  externalCursorIndex?: number | null;
  /**
   * When true, the internal VNX gesture does not emit onScrubChange.
   * Use when the parent card owns the gesture (card-level scrub).
   */
  gestureDisabled?: boolean;
}

const CAP_LABEL_FONT_SIZE = 10;

export default function TrendSparkline({
  data,
  width,
  height,
  color = colors.gold,
  strokeWidth = 2.5,
  maxValue,
  showGuide = false,
  capLabel,
  targetValue,
  onScrubChange,
  weekLabels: _weekLabels,
  externalCursorIndex = null,
  gestureDisabled = false,
}: TrendSparklineProps) {
  const clipProgress = useSharedValue(0);
  const h = height > 0 ? height : 52;

  useEffect(() => {
    clipProgress.value = withTiming(1, timingChartFill);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-reveal left-to-right when new week data arrives
  const prevDataLengthRef = useRef(data.length);
  useEffect(() => {
    if (data.length > prevDataLengthRef.current) {
      clipProgress.value = 0;
      clipProgress.value = withTiming(1, timingChartFill);
    }
    prevDataLengthRef.current = data.length;
  }, [data.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const clipStyle = useAnimatedStyle(() => {
    const p = clipProgress.value;
    if (p >= 0.99) return { width };
    return { overflow: 'hidden' as const, width: p * width };
  });

  // ── VNX gesture state ────────────────────────────────────────────────────
  const { state } = useChartPressState({ x: 0, y: { y: 0 } });

  // Emit onScrubChange from gesture — runs on JS thread via runOnJS.
  // state.x.value is the data-domain x value (integer index, since toLineData
  // uses { x: i, y: val }). Math.round converts fractional snapping to nearest index.
  const emitScrubChange = (active: boolean, xValue: number) => {
    if (active && data.length > 0) {
      // Clamp to safeData length — scrub indices beyond safeData are not meaningful
      const safeLen = (() => {
        let end = data.length;
        while (end > 1 && data[end - 1] === 0) end--;
        return end;
      })();
      const idx = Math.min(Math.max(Math.round(xValue), 0), safeLen - 1);
      onScrubChange?.(idx);
    } else {
      onScrubChange?.(null);
    }
  };

  // gestureDisabledSV bridges the React prop into the Reanimated reaction.
  const gestureDisabledSV = useSharedValue(gestureDisabled);
  useEffect(() => { gestureDisabledSV.value = gestureDisabled; }, [gestureDisabled]);

  useAnimatedReaction(
    () => ({ active: state.isActive.value, xValue: state.x.value.value }),
    ({ active, xValue }) => {
      if (!gestureDisabledSV.value) {
        runOnJS(emitScrubChange)(active, xValue);
      }
    },
  );

  // ── Early returns ────────────────────────────────────────────────────────

  if (data.length === 0 || width === 0) return null;

  // Strip trailing zeros before chart render.
  // Prevents the VNX monotoneX line from plunging toward y=0 at the right edge
  // when the current week is incomplete (last bucket(s) = 0).
  // Preserves at minimum the first element to avoid an empty array.
  const safeData = (() => {
    let end = data.length;
    while (end > 1 && data[end - 1] === 0) end--;
    return data.slice(0, end);
  })();

  // Y domain
  const dataMax = Math.max(...safeData);
  const yMax = maxValue !== undefined && maxValue >= dataMax ? maxValue : dataMax;
  const yMin = Math.min(...safeData);

  // Extend domain past yMax/yMin so the BlurMask glow (blur=8) isn't hard-clipped
  // by VNX's internal Skia <Group clip={chartBounds}>. ~20% top / ~10% bottom gives
  // ~10px headroom at the top and ~5px at the bottom in a 52px chart.
  const yRange = yMax - yMin;
  const padTop = yRange > 0 ? yRange * 0.20 : (yMax > 0 ? yMax * 0.20 : 1);
  const padBottom = yRange > 0 ? yRange * 0.10 : (yMax > 0 ? yMax * 0.10 : 0.5);
  const domainYMin = yMin - padBottom;
  const domainYMax = yMax + padTop;

  // Cap label font + measured width (used inside renderOutside to position alongside guide line)
  const capFont = showGuide && capLabel
    ? matchFont({ fontFamily: 'System', fontSize: CAP_LABEL_FONT_SIZE })
    : null;
  const capLabelWidth = capFont && capLabel ? capFont.measureText(capLabel).width : 0;

  return (
    <View style={{ width, height: h }}>
      {/* Clip container: animates width 0 → W to reveal sparkline left-to-right.  */}
      {/* CartesianChart is inside an absolute View at full `width` so its layout   */}
      {/* is stable — it always measures W and renders the line at correct coords.  */}
      {/* Without this, CartesianChart re-layouts at every intermediate clip width, */}
      {/* causing an "unfolding" effect instead of a clean left-to-right reveal.    */}
      {/* Gestures: after animation completes, the full-width chart is touchable.   */}
      <Animated.View style={[{ height: h }, clipStyle]}>
        <View style={{ position: 'absolute', top: 0, left: 0, width, height: h }}>
        {/* toLineData normalizes data[] to VNX-typed [{x, y}] records */}
        <CartesianChart
          data={toLineData(safeData)}
          xKey="x"
          yKeys={['y']}
          domain={{ y: [domainYMin, domainYMax] }}
          // domainPadding left+right: 10 — gives the BlurMask glow (blur=8) headroom at
          // both canvas edges so neither edge clips the glow of the first/last data point.
          // (10-mesh-color-overhaul FR5: was { left: 0, right: 10 } — left glow clipped)
          domainPadding={{ left: 10, right: 10 }}
          // activeOffsetX: activate on horizontal swipe ≥5px.
          // failOffsetY: if vertical movement exceeds 10px, yield to the ScrollView.
          // Together these give a clear handoff: mostly-horizontal → scrub,
          // mostly-vertical → scroll, with no ambiguous fighting in between.
          // When gestureDisabled, omit chartPressState entirely so VNX doesn't register
          // a gesture handler — allowing the parent GestureDetector to own the touch.
          {...(!gestureDisabled && {
            chartPressConfig: { pan: { activeOffsetX: [-5, 5], failOffsetY: [-10, 10] } },
            chartPressState: state,
          })}
          renderOutside={({ chartBounds }) => {
            // renderOutside runs inside VNX's Skia Canvas — Skia elements only, no <Canvas> wrapper.
            // Shared helper: maps a data index to pixel (x, y) using the padded domain.
            const extDomainRange = domainYMax - domainYMin;
            // domainPadding={{ left: 10, right: 10 }} causes VNX to inset the first/last
            // data points 10px from each edge. Our manual dot must match that inset.
            const X_PAD = 10;
            const xAt = (idx: number) => safeData.length > 1
              ? chartBounds.left + X_PAD + (idx / (safeData.length - 1)) * (chartBounds.right - chartBounds.left - 2 * X_PAD)
              : (chartBounds.left + chartBounds.right) / 2;
            const yAt = (idx: number) => {
              const pct = extDomainRange === 0 ? 0.5 : 1 - (safeData[idx] - domainYMin) / extDomainRange;
              return chartBounds.top + pct * (chartBounds.bottom - chartBounds.top);
            };

            // ── Target / cap guide line ──────────────────────────────────────
            // Rendered behind cursor and dot so it doesn't obscure them.
            const guideEl = showGuide ? (() => {
              const guideY = targetValue !== undefined
                ? (() => {
                    const pct = extDomainRange === 0 ? 0.5 : 1 - (targetValue - domainYMin) / extDomainRange;
                    return chartBounds.top + pct * (chartBounds.bottom - chartBounds.top);
                  })()
                : chartBounds.top + 2;
              // Label sits just above the line, right-aligned inside the chart area
              const labelX = chartBounds.right - capLabelWidth - 4;
              const labelY = guideY - 3;
              return (
                <>
                  <SkiaLine
                    p1={vec(chartBounds.left, guideY)}
                    p2={vec(chartBounds.right, guideY)}
                    color={colors.textMuted}
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                  {capLabel && capFont && (
                    <SkiaText
                      x={labelX}
                      y={labelY}
                      text={capLabel}
                      font={capFont}
                      color={colors.textMuted}
                      opacity={0.55}
                    />
                  )}
                </>
              );
            })() : null;

            if (externalCursorIndex !== null && safeData.length > 0) {
              // ── Scrubbing: vertical line + dot at cursor position ────────────
              const idx = Math.max(0, Math.min(externalCursorIndex, safeData.length - 1));
              return (
                <>
                  {guideEl}
                  <SkiaLine
                    p1={vec(xAt(idx), chartBounds.top)}
                    p2={vec(xAt(idx), chartBounds.bottom)}
                    color={colors.textMuted}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                  <Circle cx={xAt(idx)} cy={yAt(idx)} r={strokeWidth * 2} color={color} />
                </>
              );
            }

            // ── Default: dot at latest (rightmost) data point ────────────────
            if (safeData.length === 0) return null;
            const lastIdx = safeData.length - 1;
            return (
              <>
                {guideEl}
                <Circle cx={xAt(lastIdx)} cy={yAt(lastIdx)} r={strokeWidth * 2} color={color} />
              </>
            );
          }}
        >
          {({ points, chartBounds }) => (
            <>
              {/* Area fill — cardinal curve for smooth flow, brand color → transparent */}
              <Area
                points={points.y}
                y0={chartBounds.bottom}
                color="transparent"
                curveType="monotoneX"
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[color + '59', 'transparent']}
                />
              </Area>

              {/* Line with neon glow — cardinal curve matches area shape */}
              <Line
                points={points.y}
                strokeWidth={strokeWidth}
                color={color}
                curveType="monotoneX"
              >
                <BlurMask blur={8} style="solid" />
              </Line>
            </>
          )}
        </CartesianChart>
        </View>
      </Animated.View>
    </View>
  );
}
