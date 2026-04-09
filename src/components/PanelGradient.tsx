// PanelGradient.tsx
// FR1 (05-panel-glass-surfaces): SVG-based radial gradient replacing LinearGradient
// FR2 (05-panel-glass-surfaces): Coloured glows via getGlowStyle (iOS shadow / Android elevation)
// FR4 (02-dark-glass): BlurView glass base layer at intensity 30
//
// Design system rule (BRAND_GUIDELINES.md v1.1):
//   Panel gradient = radial from hero metric center (cx=50%, cy=30%, r=70%).
//   Status colour at inner stop → transparent at outer stop.
//   Idle = flat surface (#13131A), no gradient.
//   State transitions use springPremium — most emotionally significant transition.
//
// Architecture:
//   - SVG RadialGradient replaces expo-linear-gradient LinearGradient
//   - react-native-svg already installed (used by AIConeChart)
//   - External API unchanged: <PanelGradient state={state}>{children}</PanelGradient>
//   - getGlowStyle(state) exported for use by parent panel containers
//   - BlurView (intensity 30) is first absolutely-positioned child, behind gradient

import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { springPremium } from '@/src/lib/reanimated-presets';
import type { PanelState } from '@/src/lib/panelState';

// ─── Glass base layer constant (exported for test access) ─────────────────────

export const BLUR_INTENSITY_PANEL = 30;

// ─── Radial gradient colours per state ─────────────────────────────────────────
// inner: the status colour at cx=50% cy=30% (hero number area)
// outer: always transparent (edges fade out)
// null = idle state renders no gradient

export const PANEL_GRADIENT_COLORS: Record<PanelState, { inner: string; outer: string } | null> = {
  // success green
  onTrack:   { inner: '#10B981', outer: 'transparent' },
  // amber warning
  behind:    { inner: '#F59E0B', outer: 'transparent' },
  // rose critical
  critical:  { inner: '#F43F5E', outer: 'transparent' },
  // gold achievement
  crushedIt:   { inner: '#E8C97A', outer: 'transparent' },
  // gold — ahead of pace mid-week (same family as crushedIt)
  aheadOfPace: { inner: '#E8C97A', outer: 'transparent' },
  // idle = flat surface, no radial gradient
  idle:        null,
  // warm white-gold overtime
  overtime:  { inner: '#FFF8E7', outer: 'transparent' },
};

// Legacy export: keep PANEL_GRADIENTS for any code still referencing it.
// Provides a compatible shape (colors array, start, end) derived from new data.
export const PANEL_GRADIENTS: Record<
  PanelState,
  { colors: string[]; start: object; end: object }
> = {
  onTrack:   { colors: ['#10B98159', 'transparent'], start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  behind:    { colors: ['#F59E0B59', 'transparent'], start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  critical:  { colors: ['#F43F5E59', 'transparent'], start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  crushedIt:   { colors: ['#E8C97A59', 'transparent'], start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  aheadOfPace: { colors: ['#E8C97A59', 'transparent'], start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  idle:        { colors: ['#13131A', '#13131A'],        start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  overtime:  { colors: ['#FFF8E759', 'transparent'], start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
};

// ─── FR2: Coloured glow styles per state ───────────────────────────────────────
//
// iOS:     shadowColor + shadowOpacity + shadowRadius + shadowOffset
// Android: elevation only (Android does not support coloured shadows)

/**
 * Returns the ViewStyle shadow props for a given panel state.
 *
 * iOS:     coloured glow matching state colour
 * Android: neutral elevation fallback (elevation: 4)
 * idle:    no shadow on either platform
 */
export function getGlowStyle(state: PanelState): ViewStyle {
  if (state === 'idle') {
    return Platform.OS === 'android' ? { elevation: 0 } : {};
  }

  if (Platform.OS === 'android') {
    return { elevation: 4 };
  }

  // iOS coloured shadow per state
  const shadowOffset = { width: 0, height: 4 };
  switch (state) {
    case 'onTrack':
      return { shadowColor: '#10B981', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset };
    case 'behind':
      return { shadowColor: '#F59E0B', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset };
    case 'critical':
      return { shadowColor: '#F43F5E', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset };
    case 'crushedIt':
      return { shadowColor: '#E8C97A', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset };
    case 'aheadOfPace':
      return { shadowColor: '#E8C97A', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset };
    case 'overtime':
      return { shadowColor: '#FFF8E7', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset };
    default:
      return {};
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface PanelGradientProps {
  /** Drives gradient selection — use computePanelState() from src/lib/panelState */
  state: PanelState;
  children: React.ReactNode;
  /** Additional NativeWind classes appended to outer container */
  className?: string;
}

// Stable SVG fill style to avoid inline object recreation on every render.
const SVG_FILL_STYLE = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

export default function PanelGradient({
  state,
  children,
  className,
}: PanelGradientProps): JSX.Element {
  const opacity = useSharedValue(0);
  // Track mount state without reading opacity.value on the JS thread.
  // Reading a SharedValue from useEffect (JS thread) triggers WorkletRuntime::executeSync
  // which deadlocks when a concurrent worklet (e.g. useAnimatedProps) holds the mutex.
  const mounted = useRef(false);

  useEffect(() => {
    // On mount: fade in from 0 → 1 with springPremium (entrance animation).
    // On state change: brief dip to 0.75 → back to 1 so the gradient swap is visible.
    if (!mounted.current) {
      mounted.current = true;
      opacity.value = withSpring(1, springPremium);
    } else {
      opacity.value = withSequence(
        withTiming(0.75, { duration: 120 }),
        withSpring(1, springPremium),
      );
    }
  }, [state]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const base = 'flex-1';
  const combined = className ? `${base} ${className}` : base;
  const gradientColors = PANEL_GRADIENT_COLORS[state];

  return (
    <Animated.View className={combined} style={[{ flex: 1 }, animatedStyle]}>
      {/* Glass base layer — wrapped in pointerEvents=none View so touches always pass through */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BlurView intensity={BLUR_INTENSITY_PANEL} tint="systemChromeMaterialDark" style={{ flex: 1 }} />
      </View>
      {/* SVG radial gradient — absolutely positioned behind children */}
      {gradientColors !== null && (
        <Svg
          width="100%"
          height="100%"
          style={SVG_FILL_STYLE}
          preserveAspectRatio="none"
        >
          <Defs>
            <RadialGradient
              id={`panelGrad_${state}`}
              cx="50%"
              cy="30%"
              r="70%"
              gradientUnits="objectBoundingBox"
            >
              <Stop offset="0%" stopColor={gradientColors.inner} stopOpacity={0.50} />
              <Stop offset="100%" stopColor={gradientColors.outer} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect
            width="100%"
            height="100%"
            fill={`url(#panelGrad_${state})`}
          />
        </Svg>
      )}
      {children}
    </Animated.View>
  );
}
