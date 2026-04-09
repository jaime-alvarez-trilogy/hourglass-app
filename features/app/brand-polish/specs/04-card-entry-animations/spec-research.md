# Spec Research: 04-card-entry-animations

## Problem Context

Cards on every screen appear instantly as part of the `FadeInScreen` opacity fade — all content arrives simultaneously with no sense of individual elements entering space. The `springBouncy` preset and stagger pattern are defined in the guidelines but wired to nothing. This was flagged by 2/3 reviewers as a major gap in premium feel.

## Exploration Findings

**`src/lib/reanimated-presets.ts`**:
- `springBouncy`: damping 14, stiffness 200, mass 1 — "energetic, confident, slight delight"
- Documented stagger: `delay: Math.min(index * 50, 300)` — 50ms per card, max 300ms

**Current card containers per screen:**
- `app/(tabs)/index.tsx` — hero panel card + 2–4 sub-metric cards + deadline banner + AI trajectory card
- `app/(tabs)/ai.tsx` — circular chart card + weekly bars card + trajectory card + legend card
- `app/(tabs)/approvals.tsx` — list of ApprovalCard items (variable count)
- `app/(tabs)/overview.tsx` — 4 chart sparkline cards

**Reanimated entering animations:** Reanimated v3 has built-in `entering` prop support (`FadeInDown`, `SlideInDown`, etc.) on `Animated.View`. However, these use Reanimated's built-in presets which don't match our custom `springBouncy` config exactly. We'll use the `withDelay` + `withSpring` pattern with shared values for precise control, or use Reanimated's `entering` with `SpringIn` customized values.

**Preferred pattern:** A `useStaggeredEntry` hook that returns an array of animated styles (one per card index), each with `translateY` (16→0) + `opacity` (0→1) using `springBouncy` with `withDelay(index * 50)`. The hook is called on mount and fires when the screen is focused.

**Alternative: Reanimated `entering` prop** with custom spring config — cleaner code but less flexible. Given we need the same config consistently, the hook approach is better.

## Key Decisions

1. **`useStaggeredEntry` hook** — returns `getEntryStyle(index)` function. Each card calls `getEntryStyle(i)` and passes it as the `style` prop to its `Animated.View` wrapper. Consistent API across all screens.
2. **16px translateY offset** — cards enter from 16px below their final position. Subtle but readable.
3. **Trigger: screen focus** — animations fire when the screen becomes focused (via `useIsFocused`). This means switching tabs re-runs entry animations, which matches the "alive" feel the guidelines target.
4. **Cap at 300ms total stagger** — `delay: Math.min(index * 50, 300)` matches the documented preset.
5. **useReducedMotion safety** — if reduced motion is preferred, return the end state (no translateY, opacity 1) immediately.
6. **Don't animate list items in approvals** — the ApprovalCard list can be very long (10+ items). Only animate the first 4–5; skip animation for items beyond index 4 to avoid a long cascade.

## Interface Contracts

```typescript
// src/hooks/useStaggeredEntry.ts
interface StaggeredEntryOptions {
  count: number;          // number of items
  maxStaggerIndex?: number; // default: 6 — skip animation beyond this index
}

interface UseStaggeredEntryReturn {
  getEntryStyle: (index: number) => StyleProp<ViewStyle>;
  isReady: boolean;  // true once animations have fired
}

export function useStaggeredEntry(
  options: StaggeredEntryOptions
): UseStaggeredEntryReturn
// Internal:
// - Creates shared values for each item (translateY + opacity)
// - On focus: fires withDelay(index * 50, withSpring(0, springBouncy)) for translateY
//             fires withDelay(index * 50, withSpring(1, springBouncy)) for opacity
// - Returns Animated.View-compatible style per index
```

```typescript
// Usage pattern in each screen:
const { getEntryStyle } = useStaggeredEntry({ count: cards.length });

// Wrap each card:
<Animated.View style={getEntryStyle(0)}>
  <HeroCard />
</Animated.View>
<Animated.View style={getEntryStyle(1)}>
  <SubMetricCard />
</Animated.View>
```

### Source Tracing
| Behavior | Source |
|----------|--------|
| springBouncy config | reanimated-presets.ts `springBouncy` |
| 50ms stagger | Brand guidelines §Animation Rules rule 3 |
| 16px translateY | Standard mobile card entrance; cited in Linear/Revolut patterns |
| useIsFocused trigger | Consistent with FadeInScreen pattern in the codebase |
| maxStaggerIndex=6 | Performance: avoid animating 15+ approvals sequentially |

## Test Plan

### FR1: useStaggeredEntry hook
- [ ] Returns `getEntryStyle` function and `isReady` boolean
- [ ] `getEntryStyle(0)` returns style with initial opacity 0
- [ ] `getEntryStyle(5)` has 250ms delay (5 * 50)
- [ ] `getEntryStyle(7)` has 300ms delay (capped at maxStaggerIndex * 50 = 300)
- [ ] Items beyond maxStaggerIndex appear instantly (no animation delay)
- [ ] With `reduceMotion`: all items show at full opacity immediately

### FR2: Home screen stagger
- [ ] Hero card enters with springBouncy at delay 0
- [ ] Sub-metric cards enter with 50ms stagger
- [ ] Animations re-fire on tab re-focus

### FR3: AI screen stagger
- [ ] All visible cards stagger in on focus
- [ ] Cards don't overlap/glitch during animation

### FR4: Approvals screen stagger
- [ ] First 4 cards animate in
- [ ] Items at index 6+ appear without animation
- [ ] No performance degradation with large lists

### FR5: Overview screen stagger
- [ ] All 4 chart cards stagger in

## Files to Create/Modify

- `src/hooks/useStaggeredEntry.ts` — new hook
- `app/(tabs)/index.tsx` — wrap cards in Animated.View with getEntryStyle
- `app/(tabs)/ai.tsx` — wrap cards in Animated.View with getEntryStyle
- `app/(tabs)/approvals.tsx` — wrap first N cards
- `app/(tabs)/overview.tsx` — wrap 4 chart cards
- `src/hooks/__tests__/useStaggeredEntry.test.ts` — new tests
