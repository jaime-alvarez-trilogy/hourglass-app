// ApprovalUrgencyCard.tsx
// FR1 (01-approval-urgency-card): Component renders correctly
// FR4 (01-approval-urgency-card): Breathing animation gated on useReducedMotion
// FR5 (01-approval-urgency-card): onPress navigates to Requests tab
//
// Architecture:
//   Animated.View  → Reanimated 4 CSS animation breathing (scale 1.0 → 1.02)
//   Animated.View  → absolute positioned pulsing border ring (opacity SharedValue loop)
//   GlassCard      → glass surface (elevated=true, desatCoral border, md padding, 2xl radius)
//   View           → header row (icon + section label + count badge)
//   Text           → title (N Pending Team Request(s))
//   Text           → subtitle (Review before end of week)
//   AnimatedPressable → "Review Now" CTA wired to onPress prop
//
// Animation:
//   Breathing: Reanimated 4 CSS animation API (animationName/Duration/TimingFunction/IterationCount/Direction)
//   Border pulse: withRepeat(withTiming, -1, true) on a Reanimated useSharedValue
//   Both gated by useReducedMotion() from react-native-reanimated

import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from './GlassCard';
import SectionLabel from './SectionLabel';
import { AnimatedPressable } from './AnimatedPressable';
import { colors } from '@/src/lib/colors';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ApprovalUrgencyCardProps {
  pendingCount: number;  // items.length from useApprovalItems() — must be > 0
  onPress: () => void;   // () => router.push('/(tabs)/approvals')
}

// ─── Animation constants ───────────────────────────────────────────────────────

// Reanimated 4 CSS animation API — breathing scale 1.0 → 1.02
const breathingStyle = {
  animationName: {
    from: { transform: [{ scale: 1 }] },
    to:   { transform: [{ scale: 1.02 }] },
  },
  animationDuration: '1500ms',
  animationTimingFunction: 'ease-in-out',
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
} as const;

// Border ring geometry (outset from GlassCard '2xl' radius=16 + 2px)
const RING_BORDER_RADIUS = 18;
const RING_BORDER_WIDTH = 1.5;

// ─── Component ────────────────────────────────────────────────────────────────

export function ApprovalUrgencyCard({ pendingCount, onPress }: ApprovalUrgencyCardProps): JSX.Element {
  const reducedMotion = useReducedMotion();

  // Pulsing border ring — SharedValue opacity loop
  const pulseOpacity = useSharedValue(0.35);

  useEffect(() => {
    if (!reducedMotion) {
      pulseOpacity.value = withRepeat(
        withTiming(1.0, { duration: 1200 }),
        -1,
        true,
      );
    } else {
      pulseOpacity.value = 0.6;
    }
  }, [reducedMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Pluralization
  const title = pendingCount === 1
    ? `${pendingCount} Pending Team Request`
    : `${pendingCount} Pending Team Requests`;

  return (
    <Animated.View style={reducedMotion ? undefined : breathingStyle}>
      {/* Pulsing border ring — absolutely positioned outset around GlassCard */}
      <Animated.View
        style={[
          pulseStyle,
          {
            position: 'absolute',
            top: -2,
            left: -2,
            right: -2,
            bottom: -2,
            borderRadius: RING_BORDER_RADIUS,
            borderWidth: RING_BORDER_WIDTH,
            borderColor: colors.desatCoral,
          },
        ]}
        pointerEvents="none"
      />

      <GlassCard
        elevated={true}
        borderAccentColor={colors.desatCoral}
        padding='md'
        radius='2xl'
      >
        {/* Header row: icon + section label + count badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ionicons
            name="time-outline"
            size={20}
            color={colors.desatCoral}
          />
          <SectionLabel className="text-desatCoral flex-1">ACTION REQUIRED</SectionLabel>
          {/* Count badge */}
          <View
            style={{
              backgroundColor: colors.desatCoral + '33',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: colors.desatCoral,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {String(pendingCount)}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: 16,
            fontWeight: '600',
            marginBottom: 4,
          }}
        >
          {title}
        </Text>

        {/* Subtitle */}
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          Review before end of week
        </Text>

        {/* CTA button */}
        <AnimatedPressable
          onPress={onPress}
          style={{
            backgroundColor: colors.desatCoral,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: colors.background,
              fontSize: 15,
              fontWeight: '600',
            }}
          >
            Review Now
          </Text>
        </AnimatedPressable>
      </GlassCard>
    </Animated.View>
  );
}

export default ApprovalUrgencyCard;
