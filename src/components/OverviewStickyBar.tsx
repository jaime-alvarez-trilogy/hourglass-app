import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { colors } from '@/src/lib/colors';
import { springSnappy, timingSmooth } from '@/src/lib/reanimated-presets';

export interface ScrubSnapshot {
  label: string;
  earnings: string;
  hoursLabel: string;
  hoursColor: string;
  aiPct: string;
  brainlift: string;
}

export interface OverviewStickyBarProps {
  window: 4 | 12 | 24;
  onWindowChange: (w: 4 | 12 | 24) => void;
  scrubSnapshot: ScrubSnapshot | null;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
}

export function OverviewStickyBar({
  window,
  onWindowChange,
  scrubSnapshot,
  visible,
  style,
}: OverviewStickyBarProps): React.JSX.Element {
  // FR4 — bar visibility animation (opacity + translateY)
  const barOpacity = useSharedValue(0);
  const barTranslateY = useSharedValue(-8);

  useEffect(() => {
    barOpacity.value = withSpring(visible ? 1 : 0, springSnappy);
    barTranslateY.value = withSpring(visible ? 0 : -8, springSnappy);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const barStyle = useAnimatedStyle(() => ({
    opacity: barOpacity.value,
    transform: [{ translateY: barTranslateY.value }],
  }));

  // FR3 — content cross-fade: 0=picker, 1=scrub
  const isScrubbing = scrubSnapshot !== null;
  const scrubMode = useSharedValue(0);

  useEffect(() => {
    scrubMode.value = withTiming(isScrubbing ? 1 : 0, timingSmooth);
  }, [isScrubbing]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickerLayerStyle = useAnimatedStyle(() => ({
    opacity: 1 - scrubMode.value,
  }));

  const scrubLayerStyle = useAnimatedStyle(() => ({
    opacity: scrubMode.value,
  }));

  return (
    <Animated.View
      style={[style, barStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* FR1 — surface */}
      <View style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        height: 52,
        overflow: 'hidden',
      }}>
        {/* FR2 — picker layer: 4W/12W/24W toggle */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.centred, pickerLayerStyle]}>
          <View style={{ backgroundColor: colors.border, borderRadius: 10, padding: 2, flexDirection: 'row' }}>
            {([4, 12, 24] as const).map(w => (
              <TouchableOpacity
                key={w}
                onPress={() => onWindowChange(w)}
                style={window === w
                  ? { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 }
                  : { paddingHorizontal: 12, paddingVertical: 4 }
                }
              >
                <Text style={{
                  color: window === w ? colors.violet : colors.textMuted,
                  fontWeight: window === w ? '600' : '400',
                  fontSize: 13,
                }}>
                  {w}W
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* FR3 — scrub layer: week snapshot metrics */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrubPad, scrubLayerStyle]}>
          {scrubSnapshot && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.gold, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {scrubSnapshot.earnings}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>Earnings</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: scrubSnapshot.hoursColor, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {scrubSnapshot.hoursLabel}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>Hours</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.cyan, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {scrubSnapshot.aiPct}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>AI%</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.violet, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {scrubSnapshot.brainlift}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>BrainLift</Text>
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centred: { justifyContent: 'center', alignItems: 'center' },
  scrubPad: { paddingHorizontal: 12, justifyContent: 'center' },
});
