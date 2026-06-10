// HourlyPatternCard.tsx — 03-hourly-pattern-card FR1–FR4
//
// Pure presentational component. Renders a 24-bar histogram clipped to
// profile.activeWindow. Bar height = avgSlots normalized to peak. Bar fill
// color = AI rate two-stop gradient (surface → cyan → violet). Translucent
// overlays mark the focus window (gold) and AI hot zone (violet, suppressed
// when overlapping focus). Two invariant summary text rows below bars.
//
// Bar rendering uses Skia Canvas + RoundedRect + LinearGradient
// (BRAND_GUIDELINES.md §5.2). Entry animation: left-to-right clip reveal
// via timingChartFill, matching WeeklyBarChart.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  cancelAnimation,
} from 'react-native-reanimated';
import {
  Canvas,
  RoundedRect,
  LinearGradient,
  vec,
} from '@shopify/react-native-skia';
import Card from './Card';
import SectionLabel from './SectionLabel';
import { colors } from '@/src/lib/colors';
import { timingChartFill } from '@/src/lib/reanimated-presets';
import type { HourlyProfile, FocusWindow, AIHotZone } from '@/src/lib/hourlyInsights';
import { formatHour } from '@/src/lib/hourlyInsights';

// ─── Constants ────────────────────────────────────────────────────────────────

const BAR_W_RATIO = 0.65;
const MIN_BAR_H = 2;
const DEFAULT_BAR_AREA_H = 96;
const LABEL_H = 16;

// ─── FR1: Color interpolation helpers ────────────────────────────────────────

/**
 * Linearly interpolates between two #RRGGBB hex colors.
 * t is clamped to [0, 1].
 */
export function _lerpColor(from: string, to: string, t: number): string {
  const tc = Math.max(0, Math.min(1, t));
  const r1 = parseInt(from.slice(1, 3), 16);
  const g1 = parseInt(from.slice(3, 5), 16);
  const b1 = parseInt(from.slice(5, 7), 16);
  const r2 = parseInt(to.slice(1, 3), 16);
  const g2 = parseInt(to.slice(3, 5), 16);
  const b2 = parseInt(to.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * tc).toString(16).padStart(2, '0');
  const g = Math.round(g1 + (g2 - g1) * tc).toString(16).padStart(2, '0');
  const b = Math.round(b1 + (b2 - b1) * tc).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/**
 * Maps an AI-rate fraction [0..1] to a hex fill color via two-stop gradient:
 *   0.0  → colors.surface
 *   0.5  → colors.cyan
 *   1.0  → colors.violet
 * NaN (no data at this hour) → colors.surface.
 */
export function _barColor(aiRate: number): string {
  if (isNaN(aiRate)) return colors.surface;
  if (aiRate <= 0) return colors.surface;
  if (aiRate >= 1) return colors.violet;
  // At exact midpoint return the anchor color directly (avoids rounding drift)
  if (aiRate === 0.5) return colors.cyan;
  if (aiRate < 0.5) return _lerpColor(colors.surface, colors.cyan, aiRate * 2);
  return _lerpColor(colors.cyan, colors.violet, (aiRate - 0.5) * 2);
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HourlyPatternCardProps {
  profile: HourlyProfile;
  focusWindow: FocusWindow | null;
  aiHotZone: AIHotZone | null;
  /** Total component width in pixels — measured by parent via onLayout. */
  width: number;
  /** Bar area height in pixels. Default 96. */
  height?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HourlyPatternCard({
  profile,
  focusWindow,
  aiHotZone,
  width,
  height = DEFAULT_BAR_AREA_H,
}: HourlyPatternCardProps): React.JSX.Element | null {
  // FR2: Entry animation — hooks unconditionally before any early return (Rules of Hooks)
  const clipProgress = useSharedValue(0);
  useEffect(() => {
    if (width === 0) return;
    clipProgress.value = withTiming(1, timingChartFill);
    return () => { cancelAnimation(clipProgress); };
  }, [width]);
  const clipStyle = useAnimatedStyle(() => {
    const p = clipProgress.value;
    if (p >= 0.99) return { width };
    return { overflow: 'hidden' as const, width: p * width };
  });

  // FR2: width=0 guard — parent layout not yet resolved (after hooks)
  if (width === 0) return null;

  const [lo, hi] = profile.activeWindow;
  const barCount = hi - lo + 1;
  if (barCount <= 0) return null;
  const colW = width / barCount;
  const barW = colW * BAR_W_RATIO;

  // Normalize bar heights to peak within the active window
  const windowSlots = profile.avgSlots.slice(lo, hi + 1);
  const peakSlots = Math.max(...windowSlots, 1);

  // FR3: Detect overlap between focus window and AI hot zone
  const focusOverlapsAI =
    focusWindow !== null &&
    aiHotZone !== null &&
    aiHotZone.hotRange[0] <= focusWindow.peakRange[1] &&
    aiHotZone.hotRange[1] >= focusWindow.peakRange[0];

  // FR3: Focus overlay geometry
  const focusOverlay = focusWindow !== null ? (() => {
    const startCol = focusWindow.peakRange[0] - lo;
    const endCol = focusWindow.peakRange[1] - lo;
    const overlayW = (endCol - startCol + 1) * colW;
    const overlayL = startCol * colW;
    return { left: overlayL, width: overlayW };
  })() : null;

  // FR3: AI overlay geometry (only when non-overlapping with focus)
  const aiOverlay = aiHotZone !== null && !focusOverlapsAI ? (() => {
    const startCol = aiHotZone.hotRange[0] - lo;
    const endCol = aiHotZone.hotRange[1] - lo;
    const overlayW = (endCol - startCol + 1) * colW;
    const overlayL = startCol * colW;
    return { left: overlayL, width: overlayW };
  })() : null;

  // FR4: Summary text values
  const focusText = focusWindow !== null
    ? `${formatHour(focusWindow.peakRange[0])}–${formatHour(focusWindow.peakRange[1])} (avg ${Math.round(focusWindow.peakIntensity)} intensity)`
    : '—';
  const aiText = aiHotZone !== null
    ? `${formatHour(aiHotZone.hotRange[0])}–${formatHour(aiHotZone.hotRange[1])} (${Math.round(aiHotZone.aiRate * 100)}%)`
    : '—';

  return (
    <Card>
      <SectionLabel className="mb-3">HOURLY PATTERNS</SectionLabel>

      {/* FR2: Bar area */}
      <View style={[styles.barArea, { height }]}>
        {/* Animated clip reveal — Canvas only */}
        <Animated.View style={[{ height }, clipStyle]}>
          <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }}>
            {Array.from({ length: barCount }, (_, idx) => {
              const h = lo + idx;
              const slots = profile.avgSlots[h];
              const barH = Math.max(((slots || 0) / peakSlots) * height, MIN_BAR_H);
              const barTop = height - barH;
              const barLeft = idx * colW + (colW - barW) / 2;
              const topColor = _barColor(profile.avgAIRate[h]);

              return (
                <RoundedRect
                  key={h}
                  x={barLeft}
                  y={barTop}
                  width={barW}
                  height={barH}
                  r={4}
                >
                  <LinearGradient
                    start={vec(0, barTop)}
                    end={vec(0, barTop + barH)}
                    colors={[topColor, 'transparent']}
                  />
                </RoundedRect>
              );
            })}
          </Canvas>
        </Animated.View>

        {/* FR3: Focus window overlay — gold at 15% opacity */}
        {focusOverlay !== null && (
          <View
            testID="focus-overlay"
            pointerEvents="none"
            style={[
              styles.overlay,
              {
                left: focusOverlay.left,
                width: focusOverlay.width,
                height,
                backgroundColor: colors.gold,
                opacity: 0.15,
              },
            ]}
          />
        )}

        {/* FR3: AI hot zone overlay — violet at 15% opacity (non-overlapping only) */}
        {aiOverlay !== null && (
          <View
            testID="ai-overlay"
            pointerEvents="none"
            style={[
              styles.overlay,
              {
                left: aiOverlay.left,
                width: aiOverlay.width,
                height,
                backgroundColor: colors.violet,
                opacity: 0.15,
              },
            ]}
          />
        )}
      </View>

      {/* Hour axis labels — sparse, every 3h, aligned to bar columns */}
      <View style={[styles.labelRow, { height: LABEL_H }]}>
        {Array.from({ length: barCount }, (_, idx) => {
          const h = lo + idx;
          const showLabel = h % 3 === 0;
          return (
            <View key={h} style={[styles.labelCell, { width: colW }]}>
              {showLabel && (
                <Text style={styles.hourLabel}>{formatHour(h)}</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Separator */}
      <View style={styles.separator} />

      {/* FR4: Summary rows */}
      <View style={styles.summaryRow}>
        <Text className="text-textMuted font-sans-semibold text-[11px] uppercase tracking-widest">
          FOCUS PEAK
        </Text>
        <Text className="text-textSecondary text-[12px]">{focusText}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text className="text-textMuted font-sans-semibold text-[11px] uppercase tracking-widest">
          AI PEAK
        </Text>
        <Text className="text-textSecondary text-[12px]">{aiText}</Text>
      </View>
    </Card>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  barArea: {
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    borderRadius: 3,
  },
  labelRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  labelCell: {
    alignItems: 'center',
  },
  hourLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
});

export default HourlyPatternCard;
