# 03-touch-and-navigation

**Status:** Draft
**Created:** 2026-03-15
**Last Updated:** 2026-03-15
**Owner:** @jalvarez

---

## Overview

This spec adds spring-driven touch feedback and screen entrance animations to make the app feel alive and premium. Three subsystems are addressed:

1. **AnimatedPressable** — a new reusable `Pressable` wrapper that scales down to 0.96 on press (`timingInstant`, 150ms ease-out) and springs back to 1.0 on release (`springSnappy`, damping 20, stiffness 300). Replaces `TouchableOpacity` on high-visibility action buttons: approve/reject in `ApprovalCard` and action buttons in `modal.tsx`.

2. **FadeInScreen spring entrance** — upgrades the existing `FadeInScreen` wrapper from a plain opacity fade (350ms `Animated.timing`) to a combined opacity + `translateY` spring. Screens enter from `translateY: 8` → `0` via `springSnappy`, giving tab switches a decisive, snappy feel without touching the Expo Router navigator.

3. **HapticTab scale pulse** — adds a `useSharedValue` scale animation to the icon wrapper inside `haptic-tab.tsx`. On press the icon scales to 0.88 (via `timingInstant`), then springs back to 1.0 (`springSnappy`). Existing haptic feedback is preserved.

**Approach:** Use `react-native-reanimated` (already installed) with the existing presets in `src/lib/reanimated-presets.ts`. No new dependencies required. Expo Router navigator is not modified — the FadeInScreen upgrade is sufficient to make tab transitions feel spring-driven.

---

## Out of Scope

1. **Expo Router navigator animation changes** — **Descoped.** Intercepting React Navigation's stack transition is fragile and complex. The FadeInScreen upgrade (FR2) achieves the desired spring feel without touching the navigator.

2. **Full app-wide `TouchableOpacity` → `AnimatedPressable` migration** — **Deferred to future polish pass.** This spec wires AnimatedPressable to the highest-visibility locations (ApprovalCard, modal.tsx). Remaining buttons across all screens will migrate incrementally.

3. **Gesture card swipe animations** — **Descoped.** Swipe-to-approve gestures are outside the scope of basic touch feedback. AnimatedPressable is for tap/press actions only.

4. **Android-specific ripple removal** — **Descoped.** AnimatedPressable will coexist with platform ripple. The scale animation supplements rather than replaces platform feedback.

5. **Staggered card entry animations** — **Deferred to 04-card-entry-animations.** That spec owns the `useStaggeredEntry` hook and per-screen wiring.

6. **Sound/haptic feedback for non-tab buttons** — **Descoped.** HapticTab keeps its existing haptic. `AnimatedPressable` is visual only; haptic wiring for action buttons is a separate concern.

7. **`useReducedMotion` implementation** — **Deferred to 04-card-entry-animations.** A single `useReducedMotion` hook covering all motion is cleaner than per-component wiring; that spec will add it globally. FR2 includes a basic inline reduced-motion check as a safety net.

---

## Functional Requirements

### FR1: AnimatedPressable Component

Create `src/components/AnimatedPressable.tsx` — a Reanimated-powered pressable primitive.

**Props:**
```typescript
interface AnimatedPressableProps extends PressableProps {
  children: React.ReactNode;
  scaleValue?: number;      // default: 0.96
  className?: string;
  style?: StyleProp<ViewStyle>;
}
```

**Behaviour:**
- On `pressIn`: animate scale from 1.0 → `scaleValue` using `withTiming` with `timingInstant` config (150ms, `Easing.out(Easing.ease)`)
- On `pressOut`: animate scale from `scaleValue` → 1.0 using `withSpring` with `springSnappy` config (damping 20, stiffness 300, mass 0.8)
- Passes all `PressableProps` through to the underlying `Pressable`
- When `disabled` is true: no scale animation fires (scale stays at 1.0)
- `className` and `style` applied to the `Animated.View` wrapper

**Success Criteria:**
- [ ] Component renders children without layout changes
- [ ] `sharedValue.value` is 0.96 immediately after `onPressIn` fires (or animating toward it)
- [ ] `sharedValue.value` returns to 1.0 after `onPressOut` fires
- [ ] `onPress` callback is invoked when the pressable is tapped
- [ ] Custom `scaleValue` prop (e.g. 0.92) is respected
- [ ] When `disabled={true}`, scale value remains 1.0 after press events
- [ ] Component is exported as named export `AnimatedPressable`

---

### FR2: FadeInScreen Spring Entrance

Upgrade `src/components/FadeInScreen.tsx` to add a `translateY` spring alongside the existing opacity animation.

**Current behaviour:** `Animated.timing` opacity 0→1, 350ms. Triggered by `useIsFocused()`.

**New behaviour:**
- Opacity: 0 → 1, same trigger, using `withTiming(1, timingSmooth)`
- `translateY`: 8 → 0 using `withSpring(0, springSnappy)` when screen gains focus
- Both values reset to initial state when screen loses focus (opacity 0, translateY 8) — direct assignment, no animation
- Migrates internal animation to `react-native-reanimated` (`useSharedValue`, `useAnimatedStyle`, `withSpring`, `withTiming`)
- **Reduced motion:** If `useReducedMotion()` returns true, skip animation — render at final state immediately (opacity 1, translateY 0)
- External API unchanged: `<FadeInScreen>{children}</FadeInScreen>`

**Success Criteria:**
- [ ] Screen content enters with combined opacity + translateY animation on tab focus
- [ ] `translateY` starts at 8 and animates to 0 on focus
- [ ] Opacity starts at 0 and animates to 1 on focus
- [ ] Both values reset when screen loses focus
- [ ] When `useReducedMotion()` is true, content is immediately visible (no animation)
- [ ] Children render correctly; no layout shift in final state

---

### FR3: HapticTab Scale Feedback

Upgrade `components/haptic-tab.tsx` to add a scale pulse to the tab icon on press.

**Current behaviour:** `PlatformPressable` with `Haptics.impactAsync` on press. No visual scale.

**New behaviour:**
- `props.children` wrapped in `Animated.View` + `useAnimatedStyle`
- `useSharedValue(1)` for scale
- `onPressIn`: `iconScale.value = withTiming(0.88, timingInstant)`; haptic fires as before
- `onPressOut`: `iconScale.value = withSpring(1, springSnappy)`
- Active tab visual state (color, indicator) unchanged

**Success Criteria:**
- [ ] Tab icon `Animated.View` has scale applied via `useAnimatedStyle`
- [ ] Scale reduces to ~0.88 on press
- [ ] Scale returns to 1.0 on release
- [ ] `Haptics.impactAsync` still fires on press
- [ ] Active/inactive tab styling is visually unchanged

---

### FR4: Key Buttons Upgraded to AnimatedPressable

Replace `TouchableOpacity` (or equivalent) with `AnimatedPressable` at the highest-visibility action sites.

**Locations:**
1. **`src/components/ApprovalCard.tsx`** — Approve button (line ~115) and Reject button (line ~122)
2. **`app/modal.tsx`** — Sign Out button (line ~106)

**Migration rule:** Import `AnimatedPressable` from `@/src/components/AnimatedPressable`. Replace the `TouchableOpacity` wrapper. Pass `onPress`, `style`/`className`, and `disabled` props through. Children (text, icons) are unchanged.

**Success Criteria:**
- [ ] `ApprovalCard` approve button is an `AnimatedPressable`
- [ ] `ApprovalCard` reject button is an `AnimatedPressable`
- [ ] `modal.tsx` Sign Out button uses `AnimatedPressable`
- [ ] No `TouchableOpacity` imports remain in `ApprovalCard.tsx` or `modal.tsx` after migration
- [ ] Existing press behaviour (onPress callbacks, disabled state) is preserved

---

## Technical Design

### Files to Reference

| File | Role |
|------|------|
| `src/lib/reanimated-presets.ts` | `timingInstant` and `springSnappy` configs — import directly |
| `src/components/FadeInScreen.tsx` | Current: `Animated.timing` opacity, `useIsFocused`. Upgrade target. |
| `components/haptic-tab.tsx` | Current: `PlatformPressable` + haptic. Upgrade target. |
| `src/components/ApprovalCard.tsx` | Contains `TouchableOpacity` approve/reject buttons at lines 115–129. Migrate to AnimatedPressable. |
| `app/modal.tsx` | Contains `TouchableOpacity` Sign Out button at line 106. Migrate to AnimatedPressable. |

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/AnimatedPressable.tsx` | New Reanimated-powered pressable primitive |
| `src/components/__tests__/AnimatedPressable.test.tsx` | Tests for FR1 |

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/FadeInScreen.tsx` | Replace `Animated` with Reanimated; add `translateY` spring |
| `components/haptic-tab.tsx` | Add `useSharedValue` scale pulse to icon wrapper |
| `src/components/ApprovalCard.tsx` | Replace `TouchableOpacity` with `AnimatedPressable` (approve + reject buttons) |
| `app/modal.tsx` | Replace `TouchableOpacity` Sign Out button with `AnimatedPressable` |

---

### AnimatedPressable — Implementation Detail

```typescript
// src/components/AnimatedPressable.tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { timingInstant, springSnappy } from '@/src/lib/reanimated-presets';

// scale sharedValue: 1.0 → scaleValue (pressIn) → 1.0 (pressOut)
// AnimatedStyle: transform: [{ scale: scaleValue }]
// When disabled: onPressIn/onPressOut do not run animation
```

The `Animated.View` wraps the `Pressable`. The `Pressable` receives all passthrough props. `onPressIn` and `onPressOut` are intercepted to drive the shared value; the caller's `onPressIn`/`onPressOut` (if provided) are also called.

---

### FadeInScreen — Migration Detail

Current: `React.useRef(new Animated.Value(0))` + `Animated.timing` + `Animated.View` from RN core.

New:
```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { springSnappy, timingSmooth } from '@/src/lib/reanimated-presets';

// opacity: useSharedValue(0)
// translateY: useSharedValue(8)
//
// On focus (isFocused === true):
//   opacity.value = withTiming(1, timingSmooth)
//   translateY.value = withSpring(0, springSnappy)
//
// On blur (isFocused === false):
//   opacity.value = 0  (reset, no animation)
//   translateY.value = 8  (reset, no animation)
//
// useReducedMotion(): if true, skip animation — set opacity=1, translateY=0 directly
```

The `useEffect` dependency remains `[isFocused]`. External API (`<FadeInScreen>{children}</FadeInScreen>`) is unchanged.

---

### HapticTab — Migration Detail

`PlatformPressable` renders `props.children` from React Navigation. The children (icon + label) are wrapped in `Animated.View`.

```typescript
// components/haptic-tab.tsx
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
} from 'react-native-reanimated';
import { timingInstant, springSnappy } from '@/src/lib/reanimated-presets';

// iconScale = useSharedValue(1)
// animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }))
//
// <PlatformPressable
//   onPressIn={() => {
//     if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(...)
//     iconScale.value = withTiming(0.88, timingInstant);
//     props.onPressIn?.(ev);
//   }}
//   onPressOut={() => { iconScale.value = withSpring(1, springSnappy); }}
// >
//   <Animated.View style={animatedStyle}>{props.children}</Animated.View>
// </PlatformPressable>
```

---

### Data Flow

```
User presses button
        │
        ▼
AnimatedPressable.onPressIn
        │
        ├─ scale.value = withTiming(0.96, timingInstant)
        │
        ▼
User releases button
        │
        ├─ scale.value = withSpring(1.0, springSnappy)
        ├─ props.onPress() called
        │
        ▼
Visual: scale animation drives Animated.View transform
```

```
Tab switch (focus change)
        │
        ▼
useIsFocused() → true
        │
        ├─ opacity: 0 → 1 (withTiming, timingSmooth)
        ├─ translateY: 8 → 0 (withSpring, springSnappy)
        │
        ▼
Screen content slides in from slightly below while fading in
```

---

### Edge Cases

1. **Rapid press-and-release**: Reanimated interrupts in-progress animation cleanly — new `withTiming`/`withSpring` call overrides previous. No state machine needed.

2. **Disabled pressable**: Check `props.disabled` in `onPressIn`/`onPressOut` — skip animation when true. Scale stays at 1.0.

3. **Tab blur before animation completes**: Reset values without animation (direct assignment `opacity.value = 0`). On next focus, animation starts from correct initial state.

4. **Reduced motion**: `useReducedMotion()` from Reanimated v3+. When true, set final values directly without animation wrappers.

5. **HapticTab children structure**: Wrapping `props.children` in `Animated.View` adds a View layer. The wrapper should use `style={{ flex: 1 }}` or `alignItems: 'center'` to match the existing tab icon layout and avoid breaking the tab bar.

6. **StyleSheet.create in modal.tsx**: `TouchableOpacity` uses `styles.signOutButton`. When migrating to `AnimatedPressable`, pass `style={styles.signOutButton}` — it accepts `StyleProp<ViewStyle>`.
