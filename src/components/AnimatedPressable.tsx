/**
 * AnimatedPressable — Reanimated-powered pressable primitive.
 *
 * Scales down to scaleValue on pressIn (timingInstant, 150ms ease-out)
 * and springs back to 1.0 on pressOut (springSnappy).
 *
 * Use this as a drop-in replacement for plain pressables on action buttons.
 */

import React from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { timingInstant, springSnappy } from '@/src/lib/reanimated-presets';

interface AnimatedPressableProps extends PressableProps {
  children: React.ReactNode;
  scaleValue?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({
  children,
  scaleValue = 0.96,
  onPressIn,
  onPressOut,
  disabled,
  style,
  className,
  ...rest
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]} className={className}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={(ev) => {
          if (!disabled) {
            scale.value = withTiming(scaleValue, timingInstant);
          }
          onPressIn?.(ev);
        }}
        onPressOut={(ev) => {
          if (!disabled) {
            scale.value = withSpring(1, springSnappy);
          }
          onPressOut?.(ev);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
