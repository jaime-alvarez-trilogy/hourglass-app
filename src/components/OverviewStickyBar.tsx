// OverviewStickyBar.tsx — 01-sticky-bar
//
// Scrub snapshot panel extracted from overview.tsx.
// Displays four metrics (Earnings, Hours, AI%, BrainLift) for the selected
// scrub week. Animation (opacity/translateY/height) is driven by the parent
// (overview.tsx) via the animatedStyle prop.

import React from 'react';
import { View, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors } from '@/src/lib/colors';

// Inlined from overview.tsx to respect module layering (src/components must not import from app/).
// The original export stays in overview.tsx to preserve existing test coverage.
function computeSnapshotHoursColor(hours: number, weeklyLimit: number): string {
  if (weeklyLimit === 0) return colors.success;
  const ratio = hours / weeklyLimit;
  if (ratio >= 0.85) return colors.success;
  if (ratio >= 0.60) return colors.warning;
  return colors.critical;
}

interface OverviewStickyBarProps {
  /** Animated style from panelStyle (opacity/translateY/height/marginBottom) */
  animatedStyle: StyleProp<ViewStyle>;
  /** Whether the panel is active — controls pointerEvents */
  isActive: boolean;
  /** Label e.g. "Week of Jan 6" — empty string when not scrubbing */
  snapLabel: string;
  heroEarnings: number;
  heroHours: number;
  heroAiPct: number;
  heroBrainlift: number;
  /** Hours target for color computation */
  weeklyLimit: number;
}

export function OverviewStickyBar({
  animatedStyle,
  isActive,
  snapLabel,
  heroEarnings,
  heroHours,
  heroAiPct,
  heroBrainlift,
  weeklyLimit,
}: OverviewStickyBarProps): React.JSX.Element {
  return (
    <Animated.View
      style={[animatedStyle, {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }]}
      pointerEvents={isActive ? 'auto' : 'none'}
    >
      <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 6 }}>
        {snapLabel}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.gold, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {`$${Math.round(heroEarnings).toLocaleString()}`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>Earnings</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: computeSnapshotHoursColor(heroHours, weeklyLimit), fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {`${heroHours.toFixed(1)}h`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>Hours</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.cyan, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {`${Math.round(heroAiPct)}%`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>AI%</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.violet, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {`${heroBrainlift.toFixed(1)}h`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>BrainLift</Text>
        </View>
      </View>
    </Animated.View>
  );
}
