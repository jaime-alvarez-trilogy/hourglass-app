// SkeletonLoader.tsx
// FR5: Pulsing shimmer placeholder with timingSmooth loop (03-base-components)
//
// Design system rule: Loading skeletons pulse with timingSmooth opacity 50%→100%
// in a loop — slow enough to feel calm, not anxious.
// No StyleSheet.create — NativeWind className only (except inline dimension style).

import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
} from 'react-native-reanimated';
import { timingSmooth } from '@/src/lib/reanimated-presets';

interface SkeletonLoaderProps {
  /** Default: '100%' */
  width?: number | string;
  /** Default: 20 */
  height?: number;
  /** rounded-full for circular placeholders (default: false) */
  rounded?: boolean;
  /** Additional NativeWind classes appended to base classes */
  className?: string;
}

export default function SkeletonLoader({
  width = '100%',
  height = 20,
  rounded = false,
  className,
}: SkeletonLoaderProps): JSX.Element {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, timingSmooth), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const radiusClass = rounded ? 'rounded-full' : 'rounded-lg';
  const base = `bg-border ${radiusClass}`;
  const combined = className ? `${base} ${className}` : base;

  return (
    <Animated.View
      className={combined}
      style={[{ width, height }, animatedStyle]}
    />
  );
}
