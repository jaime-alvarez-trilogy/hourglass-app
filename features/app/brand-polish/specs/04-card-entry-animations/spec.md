# 04-card-entry-animations

**Status:** Draft
**Created:** 2026-03-15
**Last Updated:** 2026-03-15
**Owner:** @trilogy

---

## Overview

### What Is Being Built

This spec introduces staggered card entry animations across all four tab screens (Home, AI, Approvals, Overview). Currently all card content appears simultaneously as part of the `FadeInScreen` opacity fade — there is no individual element presence. The `springBouncy` preset and stagger timing are already documented in `reanimated-presets.ts` but wired to nothing.

The deliverable is a single `useStaggeredEntry` hook that encapsulates the stagger logic and a consistent `Animated.View` wrapping pattern applied to every card on every screen.

### How It Works

A new hook, `useStaggeredEntry(options)`, is created in `src/hooks/useStaggeredEntry.ts`. It accepts a `count` (number of animatable items) and an optional `maxStaggerIndex` (default: 6). Internally it creates Reanimated shared values for `translateY` and `opacity` for each item up to `count`. On screen focus (via `useIsFocused`), it fires `withDelay(index * 50, withSpring(0, springBouncy))` on `translateY` (starting from 16) and `withDelay(index * 50, withSpring(1, springBouncy))` on `opacity` (starting from 0). The delay is capped at `maxStaggerIndex * 50` ms so very long lists don't cascade endlessly.

Each screen calls `const { getEntryStyle } = useStaggeredEntry({ count: N })` and wraps each card in `<Animated.View style={getEntryStyle(i)}>`. Items at indices beyond `maxStaggerIndex` receive the final resting style immediately (opacity 1, translateY 0) — they appear without animation.

If the device has `reduceMotion` enabled (via Reanimated's `useReducedMotion`), all items return their resting state immediately with no animation.

### Trigger Behaviour

Animations fire when the screen gains focus — consistent with how `FadeInScreen` and `useFocusKey` operate. Tab switching re-runs entry animations, matching the "alive" feel described in the brand guidelines.

---

## Out of Scope

1. **Exit animations for cards** — Cards do not animate when leaving the screen (e.g. tab switch away). Only entry is animated. **Descoped:** Exit animations are not in the brand guidelines stagger spec and would conflict with the FadeInScreen opacity fade.

2. **Scroll-triggered animations** — Cards do not re-animate as the user scrolls them into view; animations fire only once on screen focus. **Descoped:** Scroll-triggered stagger requires intersection observer equivalents (`onViewableItemsChanged`) and is a separate complexity class. Not required by the brand guidelines.

3. **Animating individual sub-metrics within a card** — Only the card-level container (`Animated.View` wrapping the entire card) is animated. Text/number count-up inside cards is outside this spec. **Deferred to future micro-spec:** If sub-element animation is desired, it should be a separate micro-spec.

4. **Approval list items beyond the first section containers** — Individual `ApprovalCard` and `MyRequestCard` items are not individually animated. Only section-level containers are wrapped. **Descoped:** Animating 10+ items in a cascade creates a poor UX (long wait) and introduces unnecessary shared value allocations.

5. **FadeInScreen replacement** — `FadeInScreen` remains as-is (screen-level opacity fade using React Native's `Animated` API). This spec does not convert it to Reanimated or modify its behaviour. **Descoped:** FadeInScreen works correctly for its purpose; migrating it is not required.

6. **Shared value pooling / virtualisation** — No memory optimisation for large lists. The `maxStaggerIndex` cap is the only performance safeguard. **Descoped:** Real-world approval lists rarely exceed 20 items; optimisation is premature.

7. **Inter-screen coordinated stagger** — Each screen manages its own stagger independently. **Descoped:** Each screen has its own focus lifecycle.

---

## Functional Requirements

### FR1: useStaggeredEntry Hook

**Description:** Create a reusable hook that produces per-card animated styles using `springBouncy` with a staggered delay.

**Interface:**

```typescript
interface StaggeredEntryOptions {
  count: number;           // total number of items to animate
  maxStaggerIndex?: number; // default: 6 — items at index > maxStaggerIndex appear instantly
}

interface UseStaggeredEntryReturn {
  getEntryStyle: (index: number) => StyleProp<ViewStyle>;
  isReady: boolean; // true once the initial animation wave has fired
}

export function useStaggeredEntry(options: StaggeredEntryOptions): UseStaggeredEntryReturn
```

**Success Criteria:**
- `useStaggeredEntry({ count: 4 })` returns an object with `getEntryStyle` function and `isReady` boolean
- `getEntryStyle(0)` returns a style with `opacity: 0` and `transform: [{ translateY: 16 }]` before focus fires
- `getEntryStyle(5)` uses delay `5 * 50 = 250ms`
- `getEntryStyle(7)` uses delay `Math.min(7 * 50, maxStaggerIndex * 50) = 300ms` when default `maxStaggerIndex = 6`
- Items at index > `maxStaggerIndex` receive `opacity: 1, translateY: 0` immediately (no shared value animation)
- When `useReducedMotion()` returns `true`, all items return `{ opacity: 1, transform: [{ translateY: 0 }] }` immediately without triggering any animation
- `isReady` is `true` after the hook returns
- Each focus event resets shared values to initial state and re-fires the animation sequence
- The hook creates exactly `min(count, maxStaggerIndex + 1)` pairs of shared values (no excess allocation)

**Internal Implementation Notes:**
- Use Reanimated `useSharedValue` for `translateY` (initial: 16) and `opacity` (initial: 0)
- Trigger: `useIsFocused()` from `@react-navigation/native`
- On focus: `withDelay(Math.min(index, maxStaggerIndex) * 50, withSpring(target, springBouncy))`
- Import `springBouncy` from `@/src/lib/reanimated-presets`
- Import `useReducedMotion` from `react-native-reanimated`
- Pre-create all `useAnimatedStyle` instances at hook init time (not inside `getEntryStyle`) to obey Rules of Hooks

---

### FR2: Home Screen Stagger

**Description:** Wire `useStaggeredEntry` to `app/(tabs)/index.tsx` so all major cards enter with staggered springBouncy animation on focus.

**Cards to animate (in order, index 0 first):**

| Index | Card |
|-------|------|
| 0 | Zone 1: Hero PanelGradient |
| 1 | Zone 2: Weekly Chart Card |
| 2 | Zone 2.5: AI Trajectory Card (conditional — only when `coneData` is present) |
| 3 | Zone 3: Earnings Card |

**Success Criteria:**
- Hero panel card (`PanelGradient`) is wrapped in `<Animated.View style={getEntryStyle(0)}>`
- Weekly chart card is wrapped in `<Animated.View style={getEntryStyle(1)}>`
- AI Trajectory card (when rendered) is wrapped in `<Animated.View style={getEntryStyle(2)}>`
- Earnings card is wrapped in `<Animated.View style={getEntryStyle(3)}>`
- `UrgencyBanner` and error banners are NOT wrapped (contextual, not structural cards)
- The stale cache text indicator is NOT wrapped
- Animations re-fire when the Home tab re-gains focus after switching to another tab

---

### FR3: AI Screen Stagger

**Description:** Wire `useStaggeredEntry` to `app/(tabs)/ai.tsx` so all visible cards enter with staggered springBouncy animation on focus.

**Cards to animate (in order):**

| Index | Card |
|-------|------|
| 0 | AI Usage Card (AIRingChart + delta badge) |
| 1 | BrainLift Card (progress bar) |
| 2 | Prime Radiant Card (AIConeChart) |
| 3 | Daily Breakdown Card (conditional — only when `data` present) |
| 4 | 12-Week Trajectory Card (conditional — only when `hasTrajectory`) |
| 5 | Legend Card |

**Success Criteria:**
- All six cards (when rendered) are wrapped in `<Animated.View style={getEntryStyle(i)}>`
- Conditional cards use indices 3 and 4 respectively when rendered; their absence does not cause index gaps in the animation sequence
- Cards do not visually overlap or glitch during the stagger sequence
- Animations re-fire on tab re-focus

---

### FR4: Approvals Screen Stagger

**Description:** Wire `useStaggeredEntry` to `app/(tabs)/approvals.tsx` for the section-level card containers.

**Section containers to animate:**

| Index | Container |
|-------|-----------|
| 0 | Team Requests section (manager) — wraps the `View className="pt-4"` for team section |
| 1 | My Requests section — wraps the `View className="pt-4"` for my requests section |

**Success Criteria:**
- The Team Requests section `View` is wrapped with `getEntryStyle(0)` for managers
- The My Requests section `View` is wrapped with `getEntryStyle(1)` for managers / `getEntryStyle(0)` for non-managers
- Individual `ApprovalCard` and `MyRequestCard` items within FlatList/map are NOT individually wrapped
- No visible performance degradation when the approvals list has 10+ items
- Animations re-fire on tab re-focus

---

### FR5: Overview Screen Stagger

**Description:** Wire `useStaggeredEntry` to `app/(tabs)/overview.tsx` so all four chart cards enter with staggered springBouncy animation on focus.

**Cards to animate (in order):**

| Index | Card |
|-------|------|
| 0 | Weekly Earnings ChartSection |
| 1 | Weekly Hours ChartSection |
| 2 | AI Usage % ChartSection |
| 3 | BrainLift Hours ChartSection |

**Success Criteria:**
- All four `<ChartSection ... />` calls are wrapped in `<Animated.View style={getEntryStyle(i)}>` (i = 0–3)
- The week snapshot panel (`Animated.View` for scrub display) is NOT re-wrapped — it has its own independent animation
- The 4W/12W toggle header row is NOT animated
- Animations re-fire on tab re-focus

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/reanimated-presets.ts` | `springBouncy` config to import |
| `src/hooks/useFocusKey.ts` | Pattern reference for `useIsFocused` usage |
| `src/components/FadeInScreen.tsx` | Existing screen-level animation pattern |
| `app/(tabs)/index.tsx` | Home screen — card structure to wrap |
| `app/(tabs)/ai.tsx` | AI screen — card structure to wrap |
| `app/(tabs)/approvals.tsx` | Approvals screen — section containers to wrap |
| `app/(tabs)/overview.tsx` | Overview screen — `ChartSection` cards to wrap |

### Files to Create

| File | Description |
|------|-------------|
| `src/hooks/useStaggeredEntry.ts` | New hook — staggered card entry animation |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` | Unit tests for the hook |

### Files to Modify

| File | Change |
|------|--------|
| `app/(tabs)/index.tsx` | Import `Animated` from `react-native-reanimated`; call `useStaggeredEntry({ count: 4 })`; wrap 4 card zones |
| `app/(tabs)/ai.tsx` | Import `Animated` from `react-native-reanimated`; call `useStaggeredEntry({ count: 6 })`; wrap 6 cards |
| `app/(tabs)/approvals.tsx` | Import `Animated` from `react-native-reanimated`; call `useStaggeredEntry({ count: 2 })`; wrap 2 section containers |
| `app/(tabs)/overview.tsx` | Already imports Reanimated; call `useStaggeredEntry({ count: 4 })`; wrap 4 `ChartSection` calls |

---

### Hook Implementation Design

The hook pre-creates all shared values and animated styles at initialization time (not inside `getEntryStyle`) to satisfy React's Rules of Hooks. The hook allocates `min(count, maxStaggerIndex + 1)` pairs of shared values.

**Key implementation invariant:** `useAnimatedStyle` calls are made inside `Array.from` at the top level of the custom hook, which is legal because the array size (`animatedCount`) is determined by stable `count`/`maxStaggerIndex` inputs that do not change after mount.

```typescript
// Pseudocode — correct structure:
const animatedCount = Math.min(count, maxStaggerIndex + 1);

const translateYValues = Array.from({ length: animatedCount }, () =>
  useSharedValue(TRANSLATE_Y_START)  // called at hook top level
);
const opacityValues = Array.from({ length: animatedCount }, () =>
  useSharedValue(0)  // called at hook top level
);
const animatedStyles = Array.from({ length: animatedCount }, (_, i) =>
  useAnimatedStyle(() => ({           // called at hook top level
    opacity: opacityValues[i].value,
    transform: [{ translateY: translateYValues[i].value }],
  }))
);

function getEntryStyle(index: number): StyleProp<ViewStyle> {
  if (index >= animatedCount) {
    return { opacity: 1, transform: [{ translateY: 0 }] };
  }
  return animatedStyles[index];  // returns pre-created animated style
}
```

---

### Data Flow

```
useIsFocused() [changes on tab focus]
       │
       ▼
useEffect fires
       │
       ├─ reduceMotion? → set all values to resting state immediately
       │
       └─ else:
           Reset all shared values to initial (translateY=16, opacity=0)
           ↓
           for i in 0..animatedCount:
             delay = min(i, maxStaggerIndex) * 50
             translateYValues[i].value = withDelay(delay, withSpring(0, springBouncy))
             opacityValues[i].value    = withDelay(delay, withSpring(1, springBouncy))

animatedStyles[i] (useAnimatedStyle) — reactive to shared value changes
       │
       ▼
getEntryStyle(i) → animatedStyles[i] or resting plain style
       │
       ▼
<Animated.View style={getEntryStyle(i)}>
  {card content}
</Animated.View>
```

---

### Edge Cases

| Case | Handling |
|------|---------|
| `count = 0` | Hook allocates 0 shared values; `getEntryStyle(0)` returns resting state |
| `index >= count` | Returns `{ opacity: 1, transform: [{ translateY: 0 }] }` |
| `index > maxStaggerIndex` | Returns resting state — immediate visibility |
| `reduceMotion = true` | All items instantly at resting state; no spring fired |
| Rapid tab switching | Each focus resets values to initial before re-firing; no accumulation |
| Conditional card absent | The `Animated.View` wrapper is also conditionally absent; no rendering issue |
| Skeleton loading state | Cards still animate in; skeleton content within them renders normally |

---

### Dependency Check

| Dependency | Already in project? |
|------------|-------------------|
| `react-native-reanimated` | Yes (used in `overview.tsx`, `reanimated-presets.ts`) |
| `@react-navigation/native` (`useIsFocused`) | Yes (used in `FadeInScreen`, `useFocusKey`) |
| `springBouncy` from `reanimated-presets` | Yes |
| `useReducedMotion` from `react-native-reanimated` | Yes (same package) |

No new packages required.
