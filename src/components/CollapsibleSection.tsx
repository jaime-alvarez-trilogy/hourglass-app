// CollapsibleSection.tsx — 1.2 home screen: the hide / show toggle of a detail card
//
// Shared by WeekBreakdownCard and PayDaysCard, whose collapsed flag app/(tabs)/index.tsx
// keeps in useCardCollapsed. Renders inside the card:
//   └─ Toggle (AnimatedPressable, role button, expanded state): header | chevron
//      └─ Summary line — collapsed only, inside the toggle so the whole line is tappable
//   └─ Body — expanded only
//
// Motion (src/lib/reanimated-presets.ts → panelTransition):
//   - expand:   chevron turns up, body fades + slides in — panelOpen (springBouncy)
//   - collapse: chevron turns down, summary fades in — panelClose (springSnappy)
//   - The body leaves at once and the cards below move without animation: the codebase has
//     no layout-animation pattern, and animating the card's height would re-run GlassCard's
//     onLayout (a Skia canvas resize through React state) on every frame.
//   - Only after a press: the first render, a remount (tab switch) and the stored
//     preference arriving never animate. Reduced motion: no animation.
//
// Design system: BRAND_GUIDELINES.md — chevron in textMuted (colors.textMuted: Ionicons
// takes a colour value, not a className); no raw hex.

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { colors } from '@/src/lib/colors';
import { panelTransition } from '@/src/lib/reanimated-presets';

// ─── Motion ───────────────────────────────────────────────────────────────────

type CollapseTransition = 'panelOpen' | 'panelClose';

/** Distance (px) a revealed block slides down from as it fades in. */
const REVEAL_SLIDE = 6;
const CHEVRON_SIZE = 16;

function animateTo(target: number, transition: CollapseTransition): number {
  const { config, type } = panelTransition(transition);
  return type === 'spring'
    ? withSpring(target, config as WithSpringConfig)
    : withTiming(target, config as WithTimingConfig);
}

/** Fades + slides its children in on mount when `animate` (read once, at mount). */
function Reveal({
  animate,
  transition,
  children,
}: {
  animate: boolean;
  transition: CollapseTransition;
  children: React.ReactNode;
}): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const [playOnMount] = useState(animate && !reducedMotion);
  const progress = useSharedValue(playOnMount ? 0 : 1);

  useEffect(() => {
    if (playOnMount) progress.value = animateTo(1, transition);
  }, [playOnMount, progress, transition]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -REVEAL_SLIDE }],
  }));

  return (
    <Animated.View style={style}>
      {children}
    </Animated.View>
  );
}

/** Points down when collapsed, up when expanded; turns only when `animate`. */
function Chevron({ collapsed, animate }: { collapsed: boolean; animate: boolean }): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const turn = useSharedValue(collapsed ? 0 : 1);
  const shown = useRef(collapsed);

  useEffect(() => {
    // Only a change of state turns the chevron (not `animate` flipping on the press itself)
    if (shown.current === collapsed) return;
    shown.current = collapsed;
    const target = collapsed ? 0 : 1;
    turn.value = animate && !reducedMotion ? animateTo(target, collapsed ? 'panelClose' : 'panelOpen') : target;
  }, [collapsed, animate, reducedMotion, turn]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 180}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={CHEVRON_SIZE} color={colors.textMuted} />
    </Animated.View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface CollapsibleSectionProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Spoken label of the toggle, e.g. "Pay week, 34h 10m left. Hide details" */
  accessibilityLabel: string;
  /** testID of the toggle */
  toggleTestID: string;
  /** Always shown, left of the chevron */
  header: React.ReactNode;
  /** Collapsed only: shown under the header, inside the toggle */
  summary?: React.ReactNode;
  /** Expanded only */
  children: React.ReactNode;
}

export default function CollapsibleSection({
  collapsed,
  onToggle,
  accessibilityLabel,
  toggleTestID,
  header,
  summary,
  children,
}: CollapsibleSectionProps): React.JSX.Element {
  // Motion only once the user has pressed this toggle (see header comment)
  const [pressed, setPressed] = useState(false);

  return (
    <>
      <AnimatedPressable
        testID={toggleTestID}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={accessibilityLabel}
        scaleValue={0.98}
        onPress={() => {
          setPressed(true);
          onToggle();
        }}
      >
        <View className="flex-row items-start gap-3">
          <View className="flex-1">{header}</View>
          <Chevron collapsed={collapsed} animate={pressed} />
        </View>
        {collapsed && summary !== undefined && (
          <Reveal animate={pressed} transition="panelClose">
            {summary}
          </Reveal>
        )}
      </AnimatedPressable>

      {!collapsed && (
        <Reveal animate={pressed} transition="panelOpen">
          {children}
        </Reveal>
      )}
    </>
  );
}
