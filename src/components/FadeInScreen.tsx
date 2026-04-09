/**
 * FadeInScreen — spring-driven tab screen entrance animation.
 *
 * Wraps the root element of each tab screen. On focus: opacity 0→1 (timingSmooth)
 * combined with translateY 8→0 (springSnappy). On blur: instant reset.
 *
 * External API is unchanged: <FadeInScreen>{children}</FadeInScreen>
 */

import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { springSnappy, timingSmooth } from '@/src/lib/reanimated-presets';

interface FadeInScreenProps {
  children: React.ReactNode;
}

export default function FadeInScreen({ children }: FadeInScreenProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (isFocused) {
      if (reducedMotion) {
        // Accessibility: skip animation, show immediately
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withTiming(1, timingSmooth);
        translateY.value = withSpring(0, springSnappy);
      }
    } else {
      // Reset without animation so next focus starts from initial state
      opacity.value = 0;
      translateY.value = 8;
    }
  }, [isFocused, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
