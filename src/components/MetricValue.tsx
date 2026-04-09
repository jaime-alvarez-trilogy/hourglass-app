// MetricValue.tsx
// FR2: Hero number with Reanimated fade-in animation on mount (03-base-components)
// FR4 (06-wiring-and-tokens): font-display-extrabold, letterSpacing: -0.5 (superseded by 01-design-tokens)
// 01-design-tokens: font-display-extrabold now resolves to SpaceGrotesk_700Bold;
//                   letterSpacing updated to proportional -fontSize * 0.02 formula.
//
// Design system rule (BRAND_GUIDELINES.md v2.0):
//   Hero numbers use SpaceGrotesk (font-display-extrabold = SpaceGrotesk_700Bold).
//   Use tabular-nums for all animated counters.
//   Entry animation uses timingChartFill — data settling on truth, not spring.
//
// Animation approach (Fabric-safe):
//   useSharedValue(0) → withTiming(1, timingChartFill) drives opacity 0→1.
//   useAnimatedStyle runs entirely on the UI thread — zero runOnJS per frame.
//   Previously used useAnimatedReaction + runOnJS to count up text from 0,
//   which fired at 60fps × 1800ms = 108 JS-thread calls per instance (×3 on
//   Home tab = 324 calls), flooding Hermes young-gen and corrupting JSI Values.
// No StyleSheet.create — NativeWind className only.

import React, { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { timingChartFill } from '@/src/lib/reanimated-presets';

interface MetricValueProps {
  /** Target numeric value — displayed immediately, container fades in on mount */
  value: number;
  /** Appended to formatted number (e.g. "h", "%") */
  unit?: string;
  /** Decimal places (default: 1) */
  precision?: number;
  /** Tailwind text color class (default: "text-textPrimary") */
  colorClass?: string;
  /** Tailwind text size class (default: "text-4xl") */
  sizeClass?: string;
}

// Tailwind text size class → numeric px value for proportional letterSpacing.
// Only Tailwind's named sizes — no arbitrary values needed.
// brand-revamp/01-design-tokens: letterSpacing = -fontSize * 0.02
const TAILWIND_FONT_SIZES: Record<string, number> = {
  'text-xs':   12,
  'text-sm':   14,
  'text-base': 16,
  'text-lg':   18,
  'text-xl':   20,
  'text-2xl':  24,
  'text-3xl':  30,
  'text-4xl':  36, // default
  'text-5xl':  48,
  'text-6xl':  60,
  'text-7xl':  72,
};

export default function MetricValue({
  value,
  unit = '',
  precision = 1,
  colorClass = 'text-textPrimary',
  sizeClass = 'text-4xl',
}: MetricValueProps): JSX.Element {
  // opacity 0 → 1 via timingChartFill — same "data landing on truth" feel as count-up
  // but entirely on the UI thread (useAnimatedStyle), zero JS per frame.
  const displayValue = useSharedValue(0);

  useEffect(() => {
    displayValue.value = withTiming(1, timingChartFill);
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: displayValue.value,
  }));

  // Derive proportional letterSpacing from the active Tailwind size class.
  // brand-revamp/01-design-tokens: -0.02 × fontSize (e.g. -0.72 at 36px, -0.96 at 48px).
  // Fallback to 36 (text-4xl) if sizeClass contains an unknown size token.
  const baseClass = sizeClass.split(' ').find(c => c.startsWith('text-')) ?? 'text-4xl';
  const fontSize = TAILWIND_FONT_SIZES[baseClass] ?? 36;
  const letterSpacing = -fontSize * 0.02;

  return (
    <Animated.View style={containerStyle}>
      <Text
        className={`font-display-extrabold ${sizeClass} ${colorClass}`}
        style={{ fontVariant: ['tabular-nums'], letterSpacing }}
      >
        {`${value.toFixed(precision)}${unit}`}
      </Text>
    </Animated.View>
  );
}
