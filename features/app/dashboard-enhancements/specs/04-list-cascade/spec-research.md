# Spec Research: 04-list-cascade

## What to Build

A `useListCascade` hook (brand guidelines §6.4) that staggered-animates list items (opacity + translateY + scale) and applies it to:
1. `DailyAIRow` rows in `app/(tabs)/ai.tsx`
2. Approval cards in `app/(tabs)/approvals.tsx`

## Key Files

- **New hook:** `src/hooks/useListCascade.ts`
- **AI screen:** `app/(tabs)/ai.tsx` — wrap DailyAIRow map in cascade
- **Approvals screen:** `app/(tabs)/approvals.tsx` — wrap approval items in cascade
- **Reanimated presets:** `src/lib/reanimated-presets.ts` — `springBouncy` (use for list items)

## Hook Spec (Brand Guidelines §6.4)

```typescript
// src/hooks/useListCascade.ts

interface UseListCascadeOptions {
  count: number;
  /** ms per item. Default: 60 */
  delayPerItem?: number;
  /** Max total delay cap. Default: 400ms */
  maxDelay?: number;
}

interface ListCascadeResult {
  getItemStyle: (index: number) => ReturnType<typeof useAnimatedStyle>;
}

export function useListCascade(
  { count, delayPerItem = 60, maxDelay = 400 }: UseListCascadeOptions,
  deps?: DependencyList,
): ListCascadeResult
```

Brand spec:
```
Initial state per item:
  opacity:    0
  translateY: 12px
  scale:      0.97

Final state:
  opacity:    1
  translateY: 0
  scale:      1

Spring: springBouncy
Delay: min(index * delayPerItem, maxDelay)
Re-triggers: when deps change (new data loads)
```

## Implementation Pattern

```typescript
import { useSharedValue, useAnimatedStyle, withDelay, withSpring } from 'react-native-reanimated';
import { useEffect, useRef, type DependencyList } from 'react';
import { springBouncy } from '../lib/reanimated-presets';

export function useListCascade(
  { count, delayPerItem = 60, maxDelay = 400 }: UseListCascadeOptions,
  deps: DependencyList = [],
): ListCascadeResult {
  // One shared value per item for opacity, translateY, scale
  // Reset to initial on dep change, then spring to final with delay
  
  const opacityValues = useRef<SharedValue<number>[]>([]);
  const translateYValues = useRef<SharedValue<number>[]>([]);
  const scaleValues = useRef<SharedValue<number>[]>([]);
  
  // ... initialize and trigger animation
  
  const getItemStyle = (index: number) => useAnimatedStyle(() => ({
    opacity: opacityValues.current[index]?.value ?? 0,
    transform: [
      { translateY: translateYValues.current[index]?.value ?? 12 },
      { scale: scaleValues.current[index]?.value ?? 0.97 },
    ],
  }));
  
  return { getItemStyle };
}
```

**Note:** Cannot call `useAnimatedStyle` inside `getItemStyle` since that violates hooks rules. Instead, pre-create animated styles for all items and return them by index:
```typescript
// Return animated styles array (pre-computed, not dynamic hook calls)
return { getItemStyle: (index: number) => itemStyles[index] };
```

## Usage in ai.tsx

```tsx
const { getItemStyle } = useListCascade({ count: safeData.dailyBreakdown.length }, [chartKey]);

{safeData.dailyBreakdown.map((day, index) => (
  <Animated.View key={day.date} style={getItemStyle(index)}>
    <DailyAIRow item={day} />
  </Animated.View>
))}
```

## Usage in approvals.tsx

```tsx
const { getItemStyle } = useListCascade({ count: items.length }, [items.length]);

{items.map((item, index) => (
  <Animated.View key={item.id} style={getItemStyle(index)}>
    <ApprovalCard item={item} ... />
  </Animated.View>
))}
```

## Tests

File: `src/hooks/__tests__/useListCascade.test.ts`
- Returns `getItemStyle` function
- `getItemStyle(0)` has no delay (first item animates immediately)
- Delay is capped at `maxDelay`
- Re-triggers animation when deps change

## Acceptance Criteria

- FR1: `useListCascade` hook exists with correct interface
- FR2: Items animate from opacity=0/translateY=12/scale=0.97 to final state
- FR3: Each item delayed by `min(index * 60, 400)`ms
- FR4: Animation re-triggers when `deps` changes
- FR5: Applied to DailyAIRow items in ai.tsx
- FR6: Applied to approval cards in approvals.tsx
- FR7: `useReducedMotion` check — if reduced motion, skip to final state immediately
