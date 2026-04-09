// AIArcHero.tsx — 04-victory-charts FR4
// Rebuilt from react-native-svg to Skia Canvas + Path + SweepGradient
//
// Visual enhancement:
//   Arc stroke paint: SweepGradient (cyan #00C2FF → violet #A78BFA → magenta #FF00FF)
//   Animation: sweepProgress SharedValue 0→aiPct/100 via withSpring (mass=1, stiffness=80, damping=12)
//   Path trim: Skia Path.copy().trim(0, sweepProgress, false)
//
// External API UNCHANGED:
//   Props: aiPct, brainliftHours, deltaPercent, ambientColor, size
//   Exports: AI_TARGET_PCT, BRAINLIFT_TARGET_HOURS, arcPath
//
// Why arcPath is kept:
//   - Existing tests reference it as a named export
//   - The arc geometry calculation is still used internally (as SVG path string → Skia)
//
// Animation safety:
//   sweepProgress is a SharedValue<number> (0.0 → 1.0).
//   useDerivedValue trims the path on the Reanimated UI thread — no JS per frame.
//   No string allocation per frame (unlike the old strokeDashoffset approach).

import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import {
  Canvas,
  Path,
  SweepGradient,
  Skia,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '@/src/lib/colors';
import Card from '@/src/components/Card';
import ProgressBar from '@/src/components/ProgressBar';

// ─── Exported constants ────────────────────────────────────────────────────────

export const AI_TARGET_PCT = 75;
export const BRAINLIFT_TARGET_HOURS = 5;

// ─── Arc geometry constants ────────────────────────────────────────────────────

const START_ANGLE = 135;   // degrees — 7 o'clock position
const SWEEP = 270;         // degrees — full track sweep
const STROKE_WIDTH = 6;

// ─── Sweep gradient ───────────────────────────────────────────────────────────
//
// Full-circle mapping (no start/end) with stops at key angular positions of the arc.
// This avoids the Skia clamping artifact that appears at high fill percentages:
//
//   BUG (with start=135, end=405):
//     At >83% fill the arc crosses 360°. Pixels past 360° normalize to e.g. 34°,
//     which is BEFORE the gradient start (135°). Skia clamps to the first color (cyan),
//     creating a sudden cyan dot at the end cap.
//
//   FIX: Map the gradient to the full circle (0°–360°). Place stops at positions
//     corresponding to the arc's key angles so the wrap-around region stays magenta.
//
//   Position math (full circle = 360°):
//     0°   =  0.000 → magenta (wrap-around region start)
//    45°   =  0.125 → magenta (arc end at 100% fill; wrap-around region end)
//   135°   =  0.375 → cyan    (arc START)
//   270°   =  0.750 → violet  (arc TOP, halfway)
//   360°   =  1.000 → magenta (arc crosses here for >83% fill)
//
//   Result: end cap at any fill % lands in the 0°–45° region → always magenta. ✓
const GRADIENT_COLORS = ['#FF00FF', '#FF00FF', '#00C2FF', '#A78BFA', '#FF00FF'] as const;
const GRADIENT_POSITIONS = [0, 0.125, 0.375, 0.75, 1.0] as const;

// ─── arcPath — pure SVG path string generator (preserved for backward compat) ─
//
// Converts (cx, cy, r, startAngleDeg, endAngleDeg) into an SVG path d= string.
// Kept as an exported utility so existing callers and tests continue to work.
// IMPORTANT: Do NOT call this inside a Reanimated worklet (string allocation).

export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const startRad = startAngleDeg * (Math.PI / 180);
  const endRad = endAngleDeg * (Math.PI / 180);
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const sweepAngle = endAngleDeg - startAngleDeg;
  const largeArcFlag = sweepAngle > 180 ? 1 : 0;

  if (startAngleDeg === endAngleDeg) {
    return `M ${x1} ${y1}`;
  }

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AIArcHeroProps {
  aiPct: number;               // 0–100, displayed as bold center number
  brainliftHours: number;      // displayed as secondary "X.Xh / 5h"
  deltaPercent: number | null; // week-over-week, null if no prior data
  ambientColor: string;        // arc fill stroke color (kept for API compat; gradient takes priority)
  size?: number;               // arc diameter in dp, default 180
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIArcHero({
  aiPct,
  brainliftHours,
  deltaPercent,
  ambientColor,
  size = 180,
}: AIArcHeroProps): JSX.Element {
  // Geometry derived from size prop
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - STROKE_WIDTH / 2 - 2;

  // Build the full arc SVG path string ONCE in render scope (not in worklet)
  const fullArcSvg = arcPath(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP);

  // Convert SVG path to Skia Path ONCE — used for both track and trimmed fill
  const fullSkiaPath = Skia.Path.MakeFromSVGString(fullArcSvg) ?? Skia.Path.Make();

  // sweepProgress: 0 (invisible arc) → aiPct/100 (fraction of full sweep visible)
  const sweepProgress = useSharedValue(0);

  // Animate to target aiPct on mount and whenever aiPct changes
  useEffect(() => {
    sweepProgress.value = withSpring(aiPct / 100, {
      mass: 1,
      stiffness: 80,
      damping: 12,
    });
  }, [aiPct]);

  // Trim path on UI thread via useDerivedValue — zero JS per frame
  const trimmedPath = useDerivedValue(() => {
    const p = fullSkiaPath.copy();
    p.trim(0, sweepProgress.value, false);
    return p;
  });

  // Delta badge styling
  const deltaBadgeColor =
    deltaPercent !== null && deltaPercent > 0
      ? colors.success
      : deltaPercent !== null && deltaPercent < 0
      ? colors.critical
      : colors.textSecondary;

  const deltaText =
    deltaPercent === 0
      ? '+0.0%'
      : deltaPercent !== null && deltaPercent > 0
      ? `+${deltaPercent.toFixed(1)}%`
      : deltaPercent !== null
      ? `${deltaPercent.toFixed(1)}%`
      : '';

  // BrainLift progress (clamped 0–1)
  const brainliftProgress = Math.min(1, brainliftHours / BRAINLIFT_TARGET_HOURS);

  return (
    <Card>
      {/* Arc gauge container */}
      <View style={{ alignItems: 'center' }}>
        <View style={{ position: 'relative', width: size, height: size }}>
          {/* Skia Canvas with arc */}
          <Canvas style={{ width: size, height: size }}>
            {/* Track arc — full 270°, rgba(255,255,255,0.08) per brand §5.4 */}
            <Path
              path={fullSkiaPath}
              style="stroke"
              strokeWidth={STROKE_WIDTH}
              strokeCap="round"
              color="rgba(255,255,255,0.08)"
            />

            {/* Fill arc — trimmed by sweepProgress, SweepGradient paint */}
            {/* color="white" → alpha=1.0 so SweepGradient shader renders at full opacity.   */}
            {/* color="transparent" would zero the paint alpha, making the gradient invisible */}
            <Path
              path={trimmedPath}
              style="stroke"
              strokeWidth={STROKE_WIDTH}
              strokeCap="round"
              color="white"
            >
              <SweepGradient
                c={{ x: cx, y: cy }}
                colors={[...GRADIENT_COLORS]}
                positions={[...GRADIENT_POSITIONS]}
              />
            </Path>
          </Canvas>

          {/* Center text overlay */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 40,
                fontWeight: '700',
                fontVariant: ['tabular-nums'],
              }}
            >
              {`${aiPct}%`}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              AI USAGE
            </Text>
          </View>
        </View>

        {/* Delta badge — only when deltaPercent !== null */}
        {deltaPercent !== null && (
          <View
            testID="delta-badge"
            style={{
              backgroundColor: colors.surfaceElevated,
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 2,
              marginTop: 4,
            }}
          >
            <Text
              style={{
                color: deltaBadgeColor,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {deltaText}
            </Text>
          </View>
        )}
      </View>

      {/* BrainLift secondary metric */}
      <View style={{ marginTop: 16, gap: 4 }}>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          BRAINLIFT
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            fontVariant: ['tabular-nums'],
          }}
        >
          {`${brainliftHours.toFixed(1)}h / ${BRAINLIFT_TARGET_HOURS}h`}
        </Text>
        <ProgressBar
          progress={brainliftProgress}
          colorClass="bg-violet"
          height={5}
        />
      </View>
    </Card>
  );
}
