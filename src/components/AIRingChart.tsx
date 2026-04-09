/**
 * AIRingChart — Skia animated concentric ring chart (FR4)
 *
 * Animation pattern: useSharedValue + useAnimatedReaction + runOnJS → React state → static Skia.
 * Avoids passing SharedValue/DerivedValue as Skia props (unreliable in Skia < 2.3 + Fabric).
 */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Canvas, Path } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withTiming,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { colors } from '@/src/lib/colors';
import { timingChartFill } from '@/src/lib/reanimated-presets';

export interface AIRingChartProps {
  aiPercent: number;
  brainliftPercent?: number;
  size: number;
  strokeWidth?: number;
}

function buildArcPath(cx: number, cy: number, radius: number, startAngle: number, sweepAngle: number): string {
  if (sweepAngle <= 0) return '';
  const sweep = Math.min(sweepAngle, 359.999 * (Math.PI / 180));
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(startAngle + sweep);
  const y2 = cy + radius * Math.sin(startAngle + sweep);
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function buildFullCirclePath(cx: number, cy: number, radius: number): string {
  const top = cy - radius;
  const bottom = cy + radius;
  return `M ${cx} ${top} A ${radius} ${radius} 0 1 1 ${cx} ${bottom} A ${radius} ${radius} 0 1 1 ${cx} ${top}`;
}

interface RingProps {
  cx: number; cy: number; radius: number;
  percent: number; fillColor: string; trackColor: string;
  strokeWidth: number; animDelay?: number;
}

function Ring({ cx, cy, radius, percent, fillColor, trackColor, strokeWidth, animDelay = 0 }: RingProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const targetSweep = (clamped / 100) * (2 * Math.PI);
  const [sweep, setSweep] = useState(0);
  const animatedSweep = useSharedValue(0);

  useEffect(() => {
    animatedSweep.value = withTiming(targetSweep, {
      ...timingChartFill,
      duration: timingChartFill.duration + animDelay,
    });
  }, [targetSweep]);

  useAnimatedReaction(
    () => animatedSweep.value,
    (v) => { runOnJS(setSweep)(v); },
  );

  const trackPath = buildFullCirclePath(cx, cy, radius);
  const fillPath = buildArcPath(cx, cy, radius, -Math.PI / 2, sweep);

  return (
    <>
      <Path path={trackPath} color={trackColor} style="stroke" strokeWidth={strokeWidth} strokeCap="round" />
      {clamped > 0 && fillPath !== '' && (
        <Path path={fillPath} color={fillColor} style="stroke" strokeWidth={strokeWidth} strokeCap="round" />
      )}
    </>
  );
}

export default function AIRingChart({ aiPercent, brainliftPercent, size, strokeWidth = 12 }: AIRingChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - strokeWidth / 2;
  const innerRadius = size / 2 - strokeWidth * 2.5;
  const hasBrainlift = brainliftPercent !== undefined && brainliftPercent !== null;

  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        <Ring cx={cx} cy={cy} radius={outerRadius} percent={aiPercent}
          fillColor={colors.cyan} trackColor={colors.border} strokeWidth={strokeWidth} />
        {hasBrainlift && (
          <Ring cx={cx} cy={cy} radius={innerRadius} percent={brainliftPercent!}
            fillColor={colors.violet} trackColor={colors.border} strokeWidth={strokeWidth} animDelay={100} />
        )}
      </Canvas>
    </View>
  );
}
