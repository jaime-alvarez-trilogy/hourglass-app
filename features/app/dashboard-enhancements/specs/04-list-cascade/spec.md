# 04-list-cascade

**Status:** Complete
**Created:** 2026-04-06
**Last Updated:** 2026-04-06
**Owner:** @jaimeadf

---

## Overview

`04-list-cascade` delivers the `useListCascade` hook defined in brand guidelines §6.4. The hook provides staggered entry animation for list items — opacity + translateY + scale — using the `springBouncy` preset with a configurable per-item delay capped at a maximum. The hook is then applied to two existing screens: the AI tab's `DailyAIRow` list and the approvals tab's approval cards.

The primary challenge is hooks compliance: `useAnimatedStyle` cannot be called conditionally or inside a loop at render time. The solution pre-allocates a fixed `MAX_ITEMS = 50` animated style array at the top level, then exposes them via an index-based `getItemStyle(index)` function. This pattern mirrors the established `useStaggeredEntry` pattern already in the codebase.

Accessibility is handled via `useReducedMotion`: when the user has enabled reduced motion in iOS settings, all items snap immediately to their final resting state without any spring animation.

---

## Out of Scope

1. **Exit animations (list item removal)** — **Descoped:** Brand guidelines §6.4 only defines entry animations. Exit/removal stagger is not required.

2. **Gesture-driven list reordering animation** — **Descoped:** This spec covers entry-only cascade; drag-to-reorder or swipe animations belong to a separate interaction spec.

3. **Applying cascade to the hours dashboard or overview tab lists** — **Deferred to future spec:** Cascade integration to additional screens is deferred; the current scope covers only ai.tsx and approvals.tsx as specified in spec-research.md.

4. **Server-driven animation config (delay/maxDelay from API)** — **Descoped:** Animation parameters are compile-time constants per brand guidelines. No runtime config needed.

---

## Functional Requirements

### FR1: useListCascade hook — interface

**What:** Export `useListCascade` from `src/hooks/useListCascade.ts` with the interface defined in brand guidelines §6.4.

**Interface:**
```typescript
interface UseListCascadeOptions {
  count: number;
  delayPerItem?: number;  // Default: 60ms
  maxDelay?: number;      // Default: 400ms
}

interface UseListCascadeReturn {
  getItemStyle: (index: number) => StyleProp<ViewStyle>;
}

export function useListCascade(
  options: UseListCascadeOptions,
  deps?: DependencyList,
): UseListCascadeReturn
```

**Success Criteria:**
- `useListCascade` is exported from `src/hooks/useListCascade.ts`
- `UseListCascadeOptions` and `UseListCascadeReturn` interfaces are exported
- `count`, `delayPerItem` (default 60), and `maxDelay` (default 400) are present
- `getItemStyle(index: number)` returns `StyleProp<ViewStyle>`

---

### FR2: Items animate from initial to final state

**What:** Each list item enters from opacity=0, translateY=12px, scale=0.97 and animates to opacity=1, translateY=0, scale=1 using `springBouncy`.

**Initial state per item:**
- `opacity: 0`
- `translateY: 12`
- `scale: 0.97`

**Final state:**
- `opacity: 1`
- `translateY: 0`
- `scale: 1`

**Success Criteria:**
- Shared values initialised to starting state constants (`TRANSLATE_Y_START = 12`, `SCALE_START = 0.97`, opacity `0`)
- All three properties animate to final state via `withSpring(..., springBouncy)`
- `springBouncy` imported from `@/src/lib/reanimated-presets`
- `getItemStyle` returns the resting static style `{ opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] }` for out-of-range indices

---

### FR3: Staggered delay, capped at maxDelay

**What:** Each item starts its animation after a delay of `min(index * delayPerItem, maxDelay)` milliseconds.

**Formula:** `delay = Math.min(index * delayPerItem, maxDelay)`

**Success Criteria:**
- `withDelay(delay, withSpring(...))` used for all three animated properties
- Delay computed as `Math.min(i * delayPerItem, maxDelay)`
- Item 0 has delay 0 (no delay for first item)
- Items beyond `maxDelay / delayPerItem` all share the same maximum delay

---

### FR4: Animation re-triggers when deps change

**What:** The cascade re-plays whenever the `deps` array passed as the second argument changes — for example when `chartKey` increments or `items.length` changes.

**Success Criteria:**
- `deps` accepted as second parameter with default `[]`
- `useEffect` dependency array includes `count` and spread `...deps`
- Before re-firing, all shared values reset to their initial state (opacity=0, translateY=12, scale=0.97)

---

### FR5: Applied to DailyAIRow items in ai.tsx

**What:** The `DailyAIRow` list in `app/(tabs)/ai.tsx` wraps each row in `Animated.View` with `getItemStyle(index)`.

**Success Criteria:**
- `useListCascade` imported from `@/src/hooks/useListCascade`
- Called with `{ count: data?.dailyBreakdown.length ?? 0 }` and `[chartKey]` as deps
- Each `DailyAIRow` rendered inside `<Animated.View style={getItemStyle(index)}>`

---

### FR6: Applied to approval cards in approvals.tsx

**What:** Approval items in `app/(tabs)/approvals.tsx` wrap each card in `Animated.View` with `getItemStyle(index)`.

**Success Criteria:**
- `useListCascade` imported from `@/src/hooks/useListCascade`
- Called with `{ count: items.length }` and `[items.length]` as deps
- Each approval card rendered inside `<Animated.View style={getItemStyle(index)}>`

---

### FR7: Reduced motion accessibility

**What:** When `useReducedMotion()` returns `true`, all items snap immediately to their final resting state without spring animation.

**Success Criteria:**
- `useReducedMotion` imported from `react-native-reanimated`
- Called at hook top level
- When `reduceMotion` is truthy, shared values set directly (no `withDelay`/`withSpring`)

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/reanimated-presets.ts` | `springBouncy` config — stiffness=200, damping=14, mass=1 |
| `src/hooks/useStaggeredEntry.ts` | Established pattern for pre-allocated hook arrays |
| `app/(tabs)/ai.tsx` | Target screen for DailyAIRow cascade |
| `app/(tabs)/approvals.tsx` | Target screen for approval card cascade |

### Files to Create / Modify

| File | Action |
|------|--------|
| `src/hooks/useListCascade.ts` | **Create** — the hook |
| `src/hooks/__tests__/useListCascade.test.ts` | **Create** — static analysis tests |
| `app/(tabs)/ai.tsx` | **Modify** — import hook, wrap DailyAIRow map |
| `app/(tabs)/approvals.tsx` | **Modify** — import hook, wrap approval items map |

### Data Flow

```
useListCascade({ count, delayPerItem, maxDelay }, deps)
  │
  ├─ Pre-allocate MAX_ITEMS (50) shared values for opacity, translateY, scale
  ├─ Pre-build MAX_ITEMS animated styles via useAnimatedStyle (top-level, fixed count)
  │
  ├─ useEffect([count, ...deps])
  │    ├─ reduceMotion? → snap all values to resting state, return
  │    ├─ Reset values to initial state (opacity=0, y=12, scale=0.97)
  │    └─ For each item: withDelay(min(i*delayPerItem, maxDelay), withSpring(final, springBouncy))
  │
  └─ getItemStyle(index)
       ├─ index in range → return animatedStyles[index]
       └─ out of range  → return static resting style
```

### Rules of Hooks Compliance

`useSharedValue` and `useAnimatedStyle` cannot be called in loops (variable hook count). The solution:

- Use `Array.from({ length: MAX_ITEMS }, () => useSharedValue(...))` — this runs exactly `MAX_ITEMS` hook calls every render, satisfying the fixed-count rule.
- ESLint `react-hooks/rules-of-hooks` warnings are suppressed with inline comments since this pattern is intentional and correct.
- `count` controls which indices are *active*, not how many hooks run.

### Edge Cases

| Case | Handling |
|------|---------|
| `count > MAX_ITEMS` | `Math.min(count, MAX_ITEMS)` in effect loop — extra items get resting style |
| `count = 0` | Effect runs but loop body never executes — safe |
| `index < 0` or `index >= count` | `getItemStyle` returns static `{ opacity: 1, translateY: 0, scale: 1 }` |
| `reduceMotion = true` | All values set directly (no `withDelay`/`withSpring`), returns immediately |
| Rapid dep changes | Each dep change resets and re-fires — natural overlap from Reanimated's worklet queuing |

### Testing Strategy

Reanimated's `useSharedValue`, `useAnimatedStyle`, and `withSpring` cannot be exercised via `renderHook` in the jest-expo/node preset (no dispatcher available outside React render). Tests use **static source analysis** (fs.readFileSync + regex patterns) — the same approach used in `useStaggeredEntry.test.ts`. This validates the contract at the source level without requiring a full Reanimated runtime.
