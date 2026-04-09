/**
 * useListCascade — staggered list item entry animation hook (04-list-cascade)
 *
 * Returns `getItemStyle(index)` for wrapping list items in Animated.View.
 * Each item enters from 12px below with springBouncy, 60ms stagger per item,
 * max 400ms delay cap. Also animates scale (0.97 → 1) for a subtle pop effect.
 * Re-triggers when `deps` changes (e.g. new data loaded).
 *
 * Usage:
 *   const { getItemStyle } = useListCascade({ count: items.length }, [chartKey]);
 *
 *   {items.map((item, index) => (
 *     <Animated.View key={item.id} style={getItemStyle(index)}>
 *       <ItemComponent item={item} />
 *     </Animated.View>
 *   ))}
 *
 * Rules of Hooks compliance:
 *   All useSharedValue and useAnimatedStyle calls happen at hook top-level via
 *   Array.from — legal because MAX_ITEMS is a fixed compile-time constant and
 *   the count passed in determines which values are active, not how many hooks run.
 *
 * Brand guidelines §6.4:
 *   Initial: opacity=0, translateY=12, scale=0.97
 *   Final:   opacity=1, translateY=0,  scale=1
 *   Spring:  springBouncy
 *   Delay:   min(index * delayPerItem, maxDelay)
 */

import { useEffect, useRef, type DependencyList } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import { springBouncy } from '@/src/lib/reanimated-presets';
import type { StyleProp, ViewStyle } from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of items pre-allocated (fixed upper bound for hooks compliance). */
const MAX_ITEMS = 50;

const TRANSLATE_Y_START = 12;
const SCALE_START = 0.97;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface UseListCascadeOptions {
  count: number;
  /** Delay per item in ms. Default: 60 */
  delayPerItem?: number;
  /** Maximum total delay cap in ms. Default: 400 */
  maxDelay?: number;
}

export interface UseListCascadeReturn {
  getItemStyle: (index: number) => StyleProp<ViewStyle>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useListCascade(
  { count, delayPerItem = 60, maxDelay = 400 }: UseListCascadeOptions,
  deps: DependencyList = [],
): UseListCascadeReturn {
  const reduceMotion = useReducedMotion();

  // Pre-allocate MAX_ITEMS shared values at top level (Rules of Hooks: fixed count via Array.from)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const opacityValues = Array.from({ length: MAX_ITEMS }, () => useSharedValue(0));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const translateYValues = Array.from({ length: MAX_ITEMS }, () => useSharedValue(TRANSLATE_Y_START));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const scaleValues = Array.from({ length: MAX_ITEMS }, () => useSharedValue(SCALE_START));

  // Pre-create animated styles for all MAX_ITEMS slots
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const animatedStyles = Array.from({ length: MAX_ITEMS }, (_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: opacityValues[i].value,
      transform: [
        { translateY: translateYValues[i].value },
        { scale: scaleValues[i].value },
      ],
    }))
  );

  // Track a dep-change counter to trigger re-animations
  const depVersion = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    depVersion.current += 1;
    const activeCount = Math.min(count, MAX_ITEMS);

    if (reduceMotion) {
      // Accessibility: immediately snap all items to resting state
      for (let i = 0; i < activeCount; i++) {
        opacityValues[i].value = 1;
        translateYValues[i].value = 0;
        scaleValues[i].value = 1;
      }
      return;
    }

    // Reset to initial state before re-firing (handles re-trigger on dep change)
    for (let i = 0; i < activeCount; i++) {
      opacityValues[i].value = 0;
      translateYValues[i].value = TRANSLATE_Y_START;
      scaleValues[i].value = SCALE_START;
    }

    // Staggered spring entry — delay capped at maxDelay
    for (let i = 0; i < activeCount; i++) {
      const delay = Math.min(i * delayPerItem, maxDelay);
      opacityValues[i].value = withDelay(delay, withSpring(1, springBouncy));
      translateYValues[i].value = withDelay(delay, withSpring(0, springBouncy));
      scaleValues[i].value = withDelay(delay, withSpring(1, springBouncy));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, ...deps]);

  function getItemStyle(index: number): StyleProp<ViewStyle> {
    if (index < 0 || index >= count || index >= MAX_ITEMS) {
      // Out-of-range: return resting plain style (no animation overhead)
      return { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    return animatedStyles[index];
  }

  return { getItemStyle };
}
