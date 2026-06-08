// InsightChip.tsx — 05-insights-ui FR3
// Pure display component: one insight chip rendered as a GlassCard surface
// with a colored dot, bold primary line, and muted secondary line.

import React from 'react';
import { View, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import GlassCard from './GlassCard';

interface InsightChipProps {
  boldLine: string;
  mutedLine: string;
  /** Hex color from colors.* palette — sets dot fill */
  dotColor: string;
  /** From useStaggeredEntry's getEntryStyle(3 + i) */
  animatedStyle?: StyleProp<ViewStyle>;
}

export function InsightChip({
  boldLine,
  mutedLine,
  dotColor,
  animatedStyle,
}: InsightChipProps): React.JSX.Element {
  return (
    <Animated.View style={animatedStyle}>
      <GlassCard padding='md'>
        {/* Row layout on inner View — GlassCard ignores className (Skia component) */}
        <View className="flex-row items-start gap-3">
          <View
            className="w-2 h-2 rounded-full mt-[6px]"
            style={{ backgroundColor: dotColor }}
          />
          <View className="flex-1">
            <Text className="text-textPrimary font-sans-medium text-[13px]">
              {boldLine}
            </Text>
            <Text className="text-textSecondary text-[11px] mt-0.5">
              {mutedLine}
            </Text>
          </View>
        </View>
      </GlassCard>
    </Animated.View>
  );
}
