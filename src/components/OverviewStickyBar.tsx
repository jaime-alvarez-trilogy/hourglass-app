import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
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

/** Overview scope tiers: Personal (own metrics), Team (direct reports, manager-only), Org (skip-level, gated). */
export type OverviewScope = 'personal' | 'team' | 'org';

const SCOPE_SEGMENTS: { key: OverviewScope; label: string }[] = [
  { key: 'personal', label: 'Personal' },
  { key: 'team', label: 'Team' },
  { key: 'org', label: 'Org' },
];

const PICKER_ROW_HEIGHT = 52;

export interface OverviewStickyBarProps {
  window: 4 | 12 | 24;
  onWindowChange: (w: 4 | 12 | 24) => void;
  scrubSnapshot: ScrubSnapshot | null;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  /** Manager scope tier. Omitted/undefined = no scope row rendered (non-manager bar, unchanged). */
  scope?: OverviewScope;
  /** Fires for Personal/Team taps only — Org has no data path yet and never invokes this. */
  onScopeChange?: (scope: 'personal' | 'team') => void;
  /** Rollout flag — controls only the Org segment's dimmed/undimmed preview, never its interactivity. */
  orgTierEnabled?: boolean;
}

export function OverviewStickyBar({
  window,
  onWindowChange,
  scrubSnapshot,
  visible,
  style,
  scope,
  onScopeChange,
  orgTierEnabled,
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

  // 03-scope-toggle-ui FR2 — picker/scrub row is Personal-only; collapse it
  // (opacity + height, non-interactive) for Team/Org, independent of the
  // outer bar-level visibility animation above.
  const showPickerRow = scope === undefined || scope === 'personal';
  const pickerCollapse = useSharedValue(showPickerRow ? 0 : 1);

  useEffect(() => {
    pickerCollapse.value = withTiming(showPickerRow ? 0 : 1, timingSmooth);
  }, [showPickerRow]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickerRowStyle = useAnimatedStyle(() => ({
    opacity: 1 - pickerCollapse.value,
    height: (1 - pickerCollapse.value) * PICKER_ROW_HEIGHT,
  }));

  return (
    <Animated.View
      style={[style, barStyle, styles.shadow]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* FR1 — frosted glass surface */}
      <BlurView intensity={60} tint="dark" style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        overflow: 'hidden',
      }}>
        {/* 03-scope-toggle-ui FR1 — Personal/Team/Org scope row, manager-only */}
        {scope !== undefined && (
          <View testID="scope-row" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
            <View
              testID="scope-track"
              style={{ backgroundColor: colors.border, borderRadius: 10, padding: 2, flexDirection: 'row' }}
            >
              {SCOPE_SEGMENTS.map(seg => {
                const isOrg = seg.key === 'org';
                const isActive = scope === seg.key;
                return (
                  <TouchableOpacity
                    key={seg.key}
                    testID={`scope-segment-${seg.key}`}
                    disabled={isOrg ? true : undefined}
                    onPress={isOrg ? undefined : () => onScopeChange?.(seg.key as 'personal' | 'team')}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive, disabled: isOrg }}
                    style={[
                      { flex: 1, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4 },
                      isActive && { backgroundColor: colors.surfaceElevated, borderRadius: 8 },
                      isOrg && !orgTierEnabled && { opacity: 0.4 },
                    ]}
                  >
                    <Text style={{
                      color: isActive ? colors.violet : colors.textMuted,
                      fontWeight: isActive ? '600' : '400',
                      fontSize: 13,
                    }}>
                      {seg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* FR2/FR3 — picker/scrub row: Personal-only, collapses for Team/Org */}
        <Animated.View
          testID="picker-scrub-row"
          pointerEvents={showPickerRow ? 'auto' : 'none'}
          style={[{ overflow: 'hidden' }, pickerRowStyle]}
        >
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
                    {`${w}W`}
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
        </Animated.View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centred: { justifyContent: 'center', alignItems: 'center' },
  scrubPad: { paddingHorizontal: 12, justifyContent: 'center' },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
});
