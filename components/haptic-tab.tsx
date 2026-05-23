import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { timingInstant, springSnappy } from '@/src/lib/reanimated-presets';

export function HapticTab(props: BottomTabBarButtonProps) {
  const iconScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        iconScale.value = withTiming(0.88, timingInstant);
        props.onPressIn?.(ev);
      }}
      onPressOut={(ev) => {
        iconScale.value = withSpring(1, springSnappy);
        props.onPressOut?.(ev);
      }}
    >
      <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, animatedStyle]}>
        {props.children}
      </Animated.View>
    </PlatformPressable>
  );
}
