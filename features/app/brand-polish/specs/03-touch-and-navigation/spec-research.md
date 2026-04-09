# Spec Research: 03-touch-and-navigation

## Problem Context

**Touch feedback:** All interactive elements (buttons, tab icons, card actions) use plain `TouchableOpacity` or `PlatformPressable` with no scale animation. The `timingInstant` preset (scale 0.96, 150ms) is defined in reanimated-presets.ts but unused. The app feels "dead" on tap — cited by all 3 UX reviewers.

**Tab navigation:** Each screen uses `FadeInScreen` (plain `Animated.timing` opacity fade, 350ms). Tab transitions feel sluggish or invisible. The `springSnappy` preset exists but is wired to nothing structural.

## Exploration Findings

**`src/lib/reanimated-presets.ts`**:
- `springSnappy`: damping 20, stiffness 300, mass 0.8 — "decisive, instant"
- `timingInstant`: 150ms ease-out — "button press scale 0.96→1"

**`components/haptic-tab.tsx`**: Uses `PlatformPressable` from `@react-navigation/elements`. Has `Haptics.impactAsync` on press. No visual scale animation.

**`src/components/FadeInScreen.tsx`**: `Animated.timing` opacity 0→1, 350ms. Triggered by `useIsFocused()`. All four tabs use this wrapper.

**`app/(tabs)/_layout.tsx`**: Expo Router `<Tabs>` component. Tab transitions happen via React Navigation stack animation — not easily overridden at Expo Router level without custom navigators.

**Approach for tab transitions:** Rather than trying to intercept Expo Router's navigation animation (complex, fragile), we upgrade `FadeInScreen` to combine opacity WITH a subtle `translateY` spring (entering from +8px → 0). This makes tab switches feel snappy and spring-driven without touching the navigator.

**Approach for touch feedback:** Create `AnimatedPressable` — a Reanimated-powered wrapper component that:
- Applies `scale(0.96)` on press down via `timingInstant`
- Springs back to `scale(1)` on release via `springSnappy`
- Passes all `Pressable` props through
- Replaces `TouchableOpacity` for all actionable buttons (not gesture cards)

**HapticTab:** Add `useAnimatedStyle` with scale shared value to the tab icon. On press: scale 0.88 via timingInstant, release via springSnappy. Keeps existing haptic feedback.

## Key Decisions

1. **`AnimatedPressable` is the new button primitive** — wraps Reanimated `Animated.View` + `Pressable`. All buttons in the app should migrate to this over time. This spec wires it to the most visible locations: nav buttons, approve/reject, settings actions.
2. **FadeInScreen gets translateY** — add a -8px → 0 spring translation alongside the existing opacity. Uses `springSnappy` via Reanimated `withSpring`. Keeps FadeInScreen API unchanged (just adds motion).
3. **HapticTab scale** — add scale pulse to the icon view inside HapticTab. Simple, high-impact.
4. **No Expo Router navigator changes** — too fragile. FadeInScreen upgrade is sufficient.

## Interface Contracts

```typescript
// src/components/AnimatedPressable.tsx
interface AnimatedPressableProps extends PressableProps {
  children: React.ReactNode;
  scaleValue?: number;      // default: 0.96
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({
  children,
  scaleValue = 0.96,
  onPress,
  ...rest
}: AnimatedPressableProps): JSX.Element
// Internally: useSharedValue(1) for scale, withTiming on pressIn (timingInstant config),
// withSpring on pressOut (springSnappy config)
```

```typescript
// src/components/FadeInScreen.tsx — updated signature (unchanged externally)
// Internal change: adds translateY shared value alongside existing opacity
// translateY: 8 → 0 using withSpring(springSnappy) on focus
// Existing API: <FadeInScreen>{children}</FadeInScreen> — no change
```

```typescript
// components/haptic-tab.tsx — internal change only
// Adds scale shared value (1.0 → 0.88 on press, back to 1.0 on release)
// Applied to the icon wrapper View via Animated.View + useAnimatedStyle
```

### Source Tracing
| Behavior | Source |
|----------|--------|
| timingInstant scale 0.96 | reanimated-presets.ts `timingInstant` + brand guidelines §Animation Rules rule 4 |
| springSnappy for icon scale | reanimated-presets.ts `springSnappy` |
| FadeInScreen springSnappy | brand guidelines §Animation Rules rule 6 |
| translateY entrance | Standard premium mobile pattern; 8px offset is subtle but readable |

## Test Plan

### FR1: AnimatedPressable component
- [ ] Renders children correctly
- [ ] Applies scale 0.96 on pressIn
- [ ] Returns to scale 1.0 on pressOut
- [ ] Passes onPress through correctly
- [ ] Custom scaleValue prop works
- [ ] Works with disabled state (no animation when disabled)

### FR2: FadeInScreen spring entrance
- [ ] Screen enters with translateY from 8 → 0
- [ ] Screen enters with opacity 0 → 1
- [ ] Animation triggers on tab focus (useIsFocused)
- [ ] Respects useReducedMotion (shows end state immediately)

### FR3: HapticTab scale feedback
- [ ] Tab icon scales down on press
- [ ] Tab icon springs back on release
- [ ] Haptic feedback still fires
- [ ] Active tab visual state unchanged

### FR4: Key buttons upgraded to AnimatedPressable
- [ ] Approve button in ApprovalCard uses AnimatedPressable
- [ ] Reject button in ApprovalCard uses AnimatedPressable
- [ ] Settings button in modals uses AnimatedPressable
- [ ] At least one primary CTA per screen upgraded

## Files to Create/Modify

- `src/components/AnimatedPressable.tsx` — new component
- `src/components/FadeInScreen.tsx` — add translateY spring
- `components/haptic-tab.tsx` — add icon scale animation
- `src/components/ApprovalCard.tsx` — replace TouchableOpacity with AnimatedPressable
- `app/modal.tsx` — replace TouchableOpacity with AnimatedPressable
- `src/components/__tests__/AnimatedPressable.test.tsx` — new tests
