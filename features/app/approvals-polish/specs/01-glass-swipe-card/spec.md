# 01-glass-swipe-card

**Status:** Draft
**Created:** 2026-03-24
**Last Updated:** 2026-03-24
**Owner:** @trilogy

---

## Overview

## What is Being Built

`ApprovalCard.tsx` is upgraded from an opaque card surface with width-reveal swipe indicators to a Liquid Glass surface with opacity-animated glow swipe indicators. The result is a "lit card" effect: as the manager drags the card, a full-screen green or red glow appears behind the glass surface, and the BackdropFilter blur causes that glow to tint the card itself, creating an immersive directional feedback.

## Current State

The existing `ApprovalCard` uses:
- `bg-surface border-border` — opaque NativeWind classes. Intentionally opaque in the Gauntlet run to prevent color bleed through the surface.
- Width-animated absolute `View`s anchored left/right to reveal the approve/reject indicator behind the sliding card.
- A top highlight line simulating glass with no actual blur.

## Target State

After this spec, `ApprovalCard` will use:
- An inlined Liquid Glass layer stack (BackdropFilter + border gradient + noise overlay) identical to `GlassCard.tsx` but without the pressable scale wrapper.
- Two full-width opacity-animated `Animated.View` glow layers behind the card (approve green, reject red), replacing the width-reveal mechanism.
- Two face overlays inside the card (approve checkmark + "APPROVE", reject X + "REJECT"), absoluteFill with opacity animation, `pointerEvents="none"`.
- Unchanged swipe gesture logic: SWIPE_THRESHOLD=100, DISMISS_VELOCITY=800, haptics, callbacks.
- `useReducedMotion` gates glow opacity and card rotation (structural spring-back still fires).

## How It Works

### Glass Surface (FR1)

The outer `Animated.View` carries `backgroundColor: '#16151F'` as a fallback while the Skia canvas renders. Inside:
1. `expo-linear-gradient` at absoluteFill with `borderWidth=1.5` and violet accent provides a gradient border approximation (no MaskedView needed in Expo Go).
2. A wrapping `View` with `onLayout` captures `dims: { w, h }`. When `dims.w > 0`, a Skia `Canvas` renders `BackdropFilter(blur=16)` → `RoundedRect(GLASS_FILL)` → inner shadow `LinearGradient`.
3. Noise overlay at 0.03 opacity.
4. Content `View` with padding `p-5`.
5. Face overlays (FR3) absoluteFill inside content area.

### Glow Layers (FR2)

Rendered BEFORE `GestureDetector` in the JSX so they are visually beneath the card. Both are `Animated.View` with `StyleSheet.absoluteFill` and same `borderRadius` as card:
- Approve glow: `backgroundColor: colors.success`, opacity interpolated `[0, SWIPE_THRESHOLD] → [0, GLOW_OPACITY_MAX=0.55]`
- Reject glow: `backgroundColor: colors.destructive`, opacity interpolated `[-SWIPE_THRESHOLD, 0] → [GLOW_OPACITY_MAX, 0]`

The BackdropFilter blur samples these glow colors from behind the card, tinting the glass surface.

### Face Overlays (FR3)

Each absoluteFill overlay inside the card contains an Ionicons icon (48px) + uppercase label. Opacity animated:
- Approve: `opacity = interpolate(translateX, [0, SWIPE_THRESHOLD*0.5], [0, 1], CLAMP)`
- Reject: `opacity = interpolate(translateX, [-SWIPE_THRESHOLD*0.5, 0], [1, 0], CLAMP)`

Icon scale reuses existing `approveIconStyle`/`rejectIconStyle` pop behavior from the current implementation.

### Accessibility (FR4)

`useReducedMotion()` gates decorative animations. When active: no card rotation, glow opacity stays 0 (interpolation not applied), face overlays hidden. Spring-back on release is structural and still fires.

---

## Out of Scope

1. **Dynamic border accent color during drag** — The research explicitly simplifies this away: "A dynamic border adds complexity without meaningful UX gain. Keep static `borderAccentColor = colors.violet`." The glow provides all directional color feedback.
   - Classification: **Descoped** — not in scope for this feature; glow is sufficient feedback.

2. **`GlassCard` component reuse** — `GlassCard` wraps content in its own `Animated.View` for press-scale behavior. `ApprovalCard` already has an outer `Animated.View` for swipe transforms. Reusing `GlassCard` would nest two Reanimated `Animated.View`s for unnecessary overhead. Glass layers are inlined instead.
   - Classification: **Descoped** — architectural decision already made in spec-research.md.

3. **Rejection confirmation sheet** — `RejectionSheet` is already implemented upstream and is triggered by the reject callback. Not modified here.
   - Classification: **Descoped** — explicitly out of scope per FEATURE.md.

4. **AnimatedMeshBackground on Requests screen** — Covered separately by `02-requests-mesh`.
   - Classification: **Deferred to 02-requests-mesh** — independent spec in the same feature.

5. **layerBudget fallback** — `GlassCard` supports a `layerBudget=false` flat-surface mode. `ApprovalCard` is a single-purpose component and does not expose this prop.
   - Classification: **Descoped** — `ApprovalCard` is not a general-purpose component.

6. **Android-specific BackdropFilter behavior** — `renderToHardwareTextureAndroid={true}` is set on the outer `Animated.View` (same as `GlassCard`). Android BackdropFilter rendering differences beyond this are not addressed.
   - Classification: **Descoped** — follows established `GlassCard` pattern.

---

## Functional Requirements

## FR1: Inline Glass Surface

Replace the opaque `bg-surface border-border` card body with an inlined Liquid Glass layer stack identical to `GlassCard.tsx` but without the pressable press-scale wrapper.

**Layer stack (z-order, bottom to top):**
1. Outer `Animated.View`: carries swipe `translateX` + `rotate` transforms. `backgroundColor: '#16151F'` (dark fallback). `renderToHardwareTextureAndroid={true}` on Android.
2. `expo-linear-gradient`: absoluteFill, `borderWidth=1.5`, `borderColor: 'transparent'`, gradient from `colors.violet + '40'` to `'transparent'` — gradient border approximation.
3. Skia `Canvas` (absoluteFill, guarded by `dims.w > 0`): `BackdropFilter(blur=16)` → `RoundedRect(GLASS_FILL='rgba(22,21,31,0.6)')` + inner shadow `LinearGradient` (4-stop: SHADOW_TOP → transparent → transparent → SHADOW_BOTTOM).
4. Noise overlay: `View` at 0.03 opacity containing `ImageBackground` with `noise.png`, `resizeMode="repeat"`.
5. Content `View`: `padding: 20` (p-5), all existing card content unchanged.
6. Face overlays (FR3): absoluteFill inside content area.

**Constants:**
```typescript
const GLOW_OPACITY_MAX = 0.55;
const GLASS_FILL = 'rgba(22,21,31,0.6)';
const SHADOW_TOP = 'rgba(0,0,0,0.6)';
const SHADOW_BOTTOM = 'rgba(255,255,255,0.08)';
const BLUR_RADIUS = 16;
const BORDER_RADIUS_PX = 16; // rounded-2xl
```

**Success Criteria:**
- Card outer `Animated.View` has `backgroundColor: '#16151F'` (no white flash on BackdropFilter mount)
- `renderToHardwareTextureAndroid` is true on the outer `Animated.View`
- `expo-linear-gradient` renders absoluteFill at card border with violet accent
- Skia `Canvas` renders only when `dims.w > 0` (prevents zero-canvas crash)
- `Canvas` contains `BackdropFilter` with blur radius 16
- Content (fullName, hours, description) is visible inside the card
- The opaque `bg-surface` NativeWind class is absent from the card container
- `dims` is updated from an `onLayout` handler on a wrapping `View` (not directly on `Canvas`)

---

## FR2: Full-Width Glow Overlays

Replace the width-animated approve/reject indicator `View`s with two full-width opacity-animated `Animated.View`s rendered BEFORE the `GestureDetector` in JSX (so they are visually behind the card).

**Approve glow:**
- `backgroundColor: colors.success`
- `StyleSheet.absoluteFill` with `borderRadius: BORDER_RADIUS_PX`
- `opacity = interpolate(translateX, [0, SWIPE_THRESHOLD], [0, GLOW_OPACITY_MAX], Extrapolation.CLAMP)`
- When `reducedMotion`: opacity stays 0

**Reject glow:**
- `backgroundColor: colors.destructive`
- `StyleSheet.absoluteFill` with `borderRadius: BORDER_RADIUS_PX`
- `opacity = interpolate(translateX, [-SWIPE_THRESHOLD, 0], [GLOW_OPACITY_MAX, 0], Extrapolation.CLAMP)`
- When `reducedMotion`: opacity stays 0

**Success Criteria:**
- `approveGlowStyle` opacity = 0 when `translateX = 0`
- `approveGlowStyle` opacity = `GLOW_OPACITY_MAX` when `translateX = SWIPE_THRESHOLD`
- `rejectGlowStyle` opacity = 0 when `translateX = 0`
- `rejectGlowStyle` opacity = `GLOW_OPACITY_MAX` when `translateX = -SWIPE_THRESHOLD`
- Opacity clamped — does not exceed `GLOW_OPACITY_MAX` beyond threshold
- When swiping right: reject glow opacity = 0
- When swiping left: approve glow opacity = 0
- Glow `View`s appear before `GestureDetector` in JSX

---

## FR3: Card-Face Directional Overlays

Add two absoluteFill `Animated.View`s inside the card content area. Each contains an Ionicons icon (48px) + uppercase label. Both have `pointerEvents="none"` so they do not block gesture.

**Approve overlay:**
- Icon: `Ionicons name="checkmark-circle"` size=48 color=`colors.success`
- Label: "APPROVE" in `colors.success`, bold, uppercase, letterSpacing
- `approveFaceStyle: opacity = interpolate(translateX, [0, SWIPE_THRESHOLD*0.5], [0, 1], CLAMP)`
- Icon animated with `approveIconStyle` (scale: 0.5→1.0→1.3 as translateX: 0→SWIPE_THRESHOLD→SWIPE_THRESHOLD*1.4)
- Hidden when `reducedMotion`

**Reject overlay:**
- Icon: `Ionicons name="close-circle"` size=48 color=`colors.destructive`
- Label: "REJECT" in `colors.destructive`, bold, uppercase, letterSpacing
- `rejectFaceStyle: opacity = interpolate(translateX, [-SWIPE_THRESHOLD*0.5, 0], [1, 0], CLAMP)`
- Icon animated with `rejectIconStyle` (scale: 1.3→1.0→0.5 as translateX: -SWIPE_THRESHOLD*1.4→-SWIPE_THRESHOLD→0)
- Hidden when `reducedMotion`

**Success Criteria:**
- `approveFaceStyle` opacity = 0 at `translateX = 0`
- `approveFaceStyle` opacity = 1 at `translateX = SWIPE_THRESHOLD * 0.5`
- `rejectFaceStyle` opacity = 1 at `translateX = -SWIPE_THRESHOLD * 0.5`
- `rejectFaceStyle` opacity = 0 at `translateX = 0`
- Face overlays have `pointerEvents="none"`
- "APPROVE" label visible in approve overlay
- "REJECT" label visible in reject overlay
- Overlays do not block tap gesture on action buttons

---

## FR4: useReducedMotion Gating

`useReducedMotion()` from Reanimated gates all decorative animations while preserving structural animations.

**When `reducedMotion = true`:**
- Card rotation = `'0deg'` (no tilt during swipe)
- Glow opacity = 0 (both approve and reject glows invisible)
- Face overlay opacity = 0 (both overlays hidden)
- Spring-back to origin on swipe release still fires (structural)
- Button press scale (`AnimatedButton`) still animates with `timingInstant` (immediate, tactile — not decorative)

**When `reducedMotion = false`:**
- All animations run normally

**Success Criteria:**
- `cardStyle` rotation is `'0deg'` when `reducedMotion = true`, regardless of `translateX`
- `approveGlowStyle` and `rejectGlowStyle` opacity = 0 when `reducedMotion = true`
- `approveFaceStyle` and `rejectFaceStyle` opacity = 0 when `reducedMotion = true`
- Spring-back fires when `reducedMotion = true` (translate snaps back to 0 on sub-threshold release)

---

## FR5: Swipe Dismiss and Callbacks (Unchanged)

The existing swipe gesture logic, thresholds, haptics, and callbacks are preserved verbatim. This FR documents the contract to ensure no regression.

**Pan gesture:**
- `activeOffsetX: [-10, 10]` — horizontal-first gesture activation
- `failOffsetY: [-8, 8]` — cancel on significant vertical scroll
- `onStart`: saves `startX`, triggers light haptic on JS thread
- `onUpdate`: `translateX.value = startX.value + e.translationX`
- `onEnd`: evaluate `shouldApprove` / `shouldReject`

**Dismiss conditions:**
- Approve: `translateX > SWIPE_THRESHOLD || velocityX > DISMISS_VELOCITY` AND `!reducedMotion`
- Reject: `translateX < -SWIPE_THRESHOLD || velocityX < -DISMISS_VELOCITY` AND `!reducedMotion`

**On dismiss:**
- Translate to `±screenWidth * 1.2` with `springSnappy`
- `cardOpacity` fades to 0 over 250ms
- Haptic: `notificationAsync(Success)` for approve, `notificationAsync(Warning)` for reject
- Callback fired: `onApprove()` or `onReject()`

**On spring-back:**
- `translateX` returns to 0 with `springBouncy`

**Success Criteria:**
- `onApprove` called when `translateX > SWIPE_THRESHOLD` at release
- `onReject` called when `translateX < -SWIPE_THRESHOLD` at release
- Spring back to 0 when release is sub-threshold
- Approve haptic: `notificationAsync(Success)` fired
- Reject haptic: `notificationAsync(Warning)` fired
- Callbacks NOT fired when `reducedMotion = true`

---

## Technical Design

## Files to Reference

| File | Purpose |
|------|---------|
| `src/components/GlassCard.tsx` | Exact glass layer stack to replicate inline — BackdropFilter, border gradient, noise, onLayout pattern |
| `src/lib/colors.ts` | Color tokens (`colors.success`, `colors.destructive`, `colors.violet`) — never hardcode hex |
| `src/lib/reanimated-presets.ts` | `springBouncy`, `springSnappy`, `timingInstant` |
| `src/lib/approvals.ts` | `ApprovalItem`, `ManualApprovalItem`, `OvertimeApprovalItem` types |
| `src/components/ApprovalCard.tsx` | Current implementation — swipe logic to preserve exactly |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/ApprovalCard.tsx` | Modify | Full glass layer stack inline + glow swipe indicators. No prop changes. |
| `__mocks__/expo-linear-gradient.ts` | Create | Minimal mock: `LinearGradient` renders as plain `View`. No existing mock. |
| `jest.config.js` | Modify | Add `moduleNameMapper` entry for `.png` assets: map to `fileMock.js` returning `{}` |
| `__mocks__/fileMock.js` | Create (if absent) | Returns `{}` for image assets in Jest |

## Data Flow

```
Pan gesture onUpdate
  │
  └─► translateX (SharedValue)
        │
        ├─► cardStyle
        │     ├─ translateX transform
        │     └─ rotate (gated by reducedMotion)
        │
        ├─► approveGlowStyle
        │     └─ opacity: interpolate([0, SWIPE_THRESHOLD] → [0, GLOW_OPACITY_MAX])
        │          (0 when reducedMotion)
        │
        ├─► rejectGlowStyle
        │     └─ opacity: interpolate([-SWIPE_THRESHOLD, 0] → [GLOW_OPACITY_MAX, 0])
        │          (0 when reducedMotion)
        │
        ├─► approveFaceStyle
        │     └─ opacity: interpolate([0, SWIPE_THRESHOLD*0.5] → [0, 1])
        │          (0 when reducedMotion)
        │
        ├─► rejectFaceStyle
        │     └─ opacity: interpolate([-SWIPE_THRESHOLD*0.5, 0] → [1, 0])
        │          (0 when reducedMotion)
        │
        ├─► approveIconStyle
        │     └─ scale: interpolate([0, ST, ST, ST*1.4] → [0.5, 1.0, 1.0, 1.3])
        │
        └─► rejectIconStyle
              └─ scale: interpolate([-ST*1.4, -ST, -ST*0.6, 0] → [1.3, 1.0, 0.85, 0.5])
```

## JSX Render Tree

```
View (px-4 my-2)
  View (relative)
    ── Animated.View (approveGlowStyle) — absoluteFill, bg=success, BEFORE GestureDetector
    ── Animated.View (rejectGlowStyle)  — absoluteFill, bg=destructive, BEFORE GestureDetector
    GestureDetector (panGesture)
      Animated.View (cardStyle, bg=#16151F fallback, renderToHardwareTextureAndroid)
        LinearGradient (absoluteFill, border gradient, violet accent)
        View (absoluteFill, onLayout → setDims)
          {dims.w > 0 &&
            Canvas (absoluteFill)
              BackdropFilter (blur=16)
                RoundedRect (GLASS_FILL)
              RoundedRect (inner shadow gradient)
          }
        View (absoluteFill, opacity=0.03, pointerEvents=none)
          ImageBackground (noise.png, resizeMode=repeat)
        View (p-5)
          ── content: fullName, badge, hours, cost, description, divider, buttons, hint ──
          Animated.View (approveFaceStyle, absoluteFill, pointerEvents=none)
            Animated.View (approveIconStyle)
              Ionicons (checkmark-circle, 48, colors.success)
            Text ("APPROVE", colors.success)
          Animated.View (rejectFaceStyle, absoluteFill, pointerEvents=none)
            Animated.View (rejectIconStyle)
              Ionicons (close-circle, 48, colors.destructive)
            Text ("REJECT", colors.destructive)
```

## Edge Cases

### Zero-dimension Canvas guard
The `onLayout` handler sets `dims`. Before first layout, `dims.w = 0`. The Canvas render is guarded: `{dims.w > 0 && <Canvas>...}`. This prevents the Skia zero-canvas crash on new arch.

### reducedMotion in useAnimatedStyle
`useReducedMotion()` returns a boolean that is read inside `useAnimatedStyle` worklets. The returned value is stable across renders (Reanimated hook). All decorative `interpolate` calls are skipped by returning constant values when `reducedMotion` is true.

### Swipe dismiss with reducedMotion
Current `panGesture.onEnd` already checks `!reducedMotion` before firing `shouldApprove` / `shouldReject`. This is preserved unchanged. On reduced motion, swipe gestures always spring back regardless of distance.

### Face overlay blocking gesture
Overlays have `pointerEvents="none"` to prevent them from intercepting pan gesture events or button taps. This is critical — without it, `GestureDetector` may not receive events when overlays cover the card during a swipe.

### Noise PNG in Jest
`noise.png` is a binary asset that crashes Jest's module resolver. The `moduleNameMapper` in `jest.config.js` must map `\\.png$` (or the specific path) to a stub that returns `{}`. A `fileMock.js` stub covers all image assets uniformly.

### expo-linear-gradient in Jest
`expo-linear-gradient` is not in the `transformIgnorePatterns` allowlist and has no existing mock. A minimal mock renders `LinearGradient` as a plain `View`, keeping the render tree testable without native gradient rendering.

### Gesture handler mock gaps
The existing `react-native-gesture-handler` mock is missing `failOffsetY` and `onStart`/`onEnd` methods used by `ApprovalCard`. The mock's `Gesture.Pan()` must be extended with these methods using `jest.fn().mockReturnThis()` chaining so the component mounts without error.

## Implementation Notes

### Import changes required
Add to imports:
```typescript
import { useState } from 'react';
import { StyleSheet, ImageBackground, Platform } from 'react-native';
import {
  Canvas, BackdropFilter, Blur, RoundedRect,
  LinearGradient as SkiaLinearGradient, vec,
} from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/src/lib/colors';
```

### Animated.View opacity guard for reducedMotion
Prefer returning a constant `0` from `useAnimatedStyle` when `reducedMotion` is true, rather than wrapping the entire glow/face overlay in a conditional render. This keeps the component tree stable and avoids layout flicker.

### cardOpacity SharedValue
The `cardOpacity` shared value is already in the current implementation (fades card out on dismiss). It is preserved unchanged.

### Static borderAccentColor
Use `colors.violet` (hex `#A78BFA`) as `borderAccentColor` for the `LinearGradient` border. Per spec-research.md, the border stays static at resting state.
