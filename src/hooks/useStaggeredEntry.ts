/**
 * useStaggeredEntry — staggered card entry animation hook (04-card-entry-animations)
 *
 * Returns `getEntryStyle(index)` for wrapping cards in Animated.View.
 * Each card enters from 16px below with springBouncy, staggered 50ms per index.
 * Animations fire on screen focus and re-fire on each subsequent focus (tab switch).
 *
 * Usage:
 *   const { getEntryStyle } = useStaggeredEntry({ count: 4 });
 *
 *   <Animated.View style={getEntryStyle(0)}>
 *     <HeroCard />
 *   </Animated.View>
 *
 * Rules of Hooks compliance:
 *   All useSharedValue and useAnimatedStyle calls happen at hook top-level via
 *   Array.from — legal because animatedCount is derived from stable count/maxStaggerIndex
 *   inputs that do not change after mount.
 */

import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { springBouncy } from '@/src/lib/reanimated-presets';
import type { StyleProp, ViewStyle } from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSLATE_Y_START = 16;
const STAGGER_MS = 50;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface StaggeredEntryOptions {
  count: number;
  maxStaggerIndex?: number; // default: 6 — items at index > maxStaggerIndex appear instantly
}

export interface UseStaggeredEntryReturn {
  getEntryStyle: (index: number) => StyleProp<ViewStyle>;
  isReady: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStaggeredEntry({
  count,
  maxStaggerIndex = 6,
}: StaggeredEntryOptions): UseStaggeredEntryReturn {
  const isFocused = useIsFocused();
  const reduceMotion = useReducedMotion();

  // Allocate shared values for animated items only (capped at maxStaggerIndex + 1)
  const animatedCount = Math.min(count, maxStaggerIndex + 1);

  // Pre-allocate translateY shared values (Rules of Hooks: at top level via Array.from)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const translateYValues = Array.from({ length: animatedCount }, () => useSharedValue(TRANSLATE_Y_START));

  // Pre-allocate opacity shared values
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const opacityValues = Array.from({ length: animatedCount }, () => useSharedValue(0));

  // Pre-create animated styles for each item
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const animatedStyles = Array.from({ length: animatedCount }, (_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: opacityValues[i].value,
      transform: [{ translateY: translateYValues[i].value }],
    }))
  );

  // Fire animations on focus
  useEffect(() => {
    if (!isFocused) return;

    if (reduceMotion) {
      // Accessibility: instantly show all items at resting state
      for (let i = 0; i < animatedCount; i++) {
        translateYValues[i].value = 0;
        opacityValues[i].value = 1;
      }
      return;
    }

    // Reset to initial state before re-firing (handles re-focus after tab switch)
    for (let i = 0; i < animatedCount; i++) {
      translateYValues[i].value = TRANSLATE_Y_START;
      opacityValues[i].value = 0;
    }

    // Staggered spring entry — delay capped at maxStaggerIndex * STAGGER_MS
    for (let i = 0; i < animatedCount; i++) {
      const delay = Math.min(i, maxStaggerIndex) * STAGGER_MS;
      translateYValues[i].value = withDelay(delay, withSpring(0, springBouncy));
      opacityValues[i].value = withDelay(delay, withSpring(1, springBouncy));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  // Return animated style by index; indices beyond animatedCount get resting plain style
  function getEntryStyle(index: number): StyleProp<ViewStyle> {
    if (index >= animatedCount || index >= count) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }
    return animatedStyles[index];
  }

  return { getEntryStyle, isReady: true };
}
