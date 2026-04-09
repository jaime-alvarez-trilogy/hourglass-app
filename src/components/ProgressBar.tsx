/**
 * ProgressBar — animated NativeWind linear progress bar (FR5)
 *
 * NativeWind View-based component (no Skia).
 * Animates fill width from 0 to progress*100% using timingChartFill on mount
 * and whenever progress changes.
 *
 * Usage:
 *   <ProgressBar progress={0.72} colorClass="bg-success" height={4} />
 *   <ProgressBar progress={hoursRatio} colorClass="bg-warning" />
 */

import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { timingChartFill } from '@/src/lib/reanimated-presets';
import { colors } from '@/src/lib/colors';

// NativeWind className does not apply to Reanimated Animated.View in NativeWind v4.
// Inline backgroundColor is the reliable path; colorClass prop is kept for API compat.
const FILL_COLORS: Record<string, string> = {
  'bg-success':  colors.success,
  'bg-warning':  colors.warning,
  'bg-critical': colors.critical,
  'bg-violet':   colors.violet,
  'bg-gold':     colors.gold,
  'bg-cyan':     colors.cyan,
  'bg-border':   colors.border,
};

export interface ProgressBarProps {
  /** Fraction filled, 0–1. Values outside [0,1] are clamped. */
  progress: number;
  /** Tailwind bg-* class for fill color. Default: 'bg-success' */
  colorClass?: string;
  /** Bar height in pixels. Default: 4 */
  height?: number;
  /** Additional className for the outer container. */
  className?: string;
}

export default function ProgressBar({
  progress,
  colorClass = 'bg-success',
  height = 4,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, progress));

  const fillFlex = useSharedValue(0);
  const spaceFlex = useSharedValue(1);

  useEffect(() => {
    fillFlex.value = withTiming(clamped, timingChartFill);
    spaceFlex.value = withTiming(1 - clamped, timingChartFill);
  }, [clamped]);

  const fillColor = FILL_COLORS[colorClass ?? 'bg-success'] ?? colors.success;

  const fillStyle = useAnimatedStyle(() => ({ flex: fillFlex.value }));
  const spaceStyle = useAnimatedStyle(() => ({ flex: spaceFlex.value }));

  return (
    <View
      className={`bg-border rounded-full overflow-hidden${className ? ` ${className}` : ''}`}
      style={{ height, flexDirection: 'row' }}
    >
      {/* className kept for API compat; backgroundColor overrides it since NativeWind
          does not apply className to Reanimated Animated.View in NativeWind v4. */}
      <Animated.View className={`${colorClass} h-full`} style={[fillStyle, { backgroundColor: fillColor }]} />
      <Animated.View style={spaceStyle} />
    </View>
  );
}
