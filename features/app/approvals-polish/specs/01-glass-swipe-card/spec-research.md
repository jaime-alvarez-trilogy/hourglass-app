# Spec Research: 01-glass-swipe-card

## Problem

`ApprovalCard.tsx` uses a plain `View` with NativeWind class `bg-surface border-border` for
its card surface. This opaque surface was intentional (Gauntlet consensus: width-based reveal
prevents color bleed). Now that we want Liquid Glass, color "bleed" is intentional — the
BackdropFilter blur samples green/red glow from behind the card, tinting the glass surface.

Additionally the swipe indicators are currently:
- Width-animated absolute `View`s anchored left/right
- Icon + label revealed as the card slides

We replace this with:
- Two full-width opacity-animated absolute `View`s — approve glow (green) and reject glow (red)
- Two face overlays on the card surface — icon + label fade in during drag, one per direction
- The glow bleeds through the glass blur for a premium "lit card" effect

## Key Files

| File | Role |
|------|------|
| `src/components/ApprovalCard.tsx` | Full rewrite of card surface + swipe indicators |
| `src/components/GlassCard.tsx` | Reference for glass layer stack |
| `src/lib/reanimated-presets.ts` | Import `springBouncy`, `springSnappy`, `timingInstant` |
| `src/lib/approvals.ts` | `ApprovalItem` / `ManualApprovalItem` / `OvertimeApprovalItem` types |
| `src/lib/colors.ts` | Color tokens — never hardcode hex |

## Architectural Decisions

### Why inline glass layers (not `<GlassCard>`)

`GlassCard` wraps its content in its own `Animated.View` (for scale press animation).
`ApprovalCard` already uses an outer `Animated.View` for swipe translate + rotate. Nesting
two Reanimated `Animated.View`s is fine but adds unnecessary overhead when we don't need
the press-scale behavior. We inline the same layer stack directly.

### Glass layer stack (z-order, bottom to top)

1. **Outer `Animated.View`** — swipe transforms (translateX, rotate). Dark bg fallback
   `rgba(22,21,31,1)` ensures no white flash when BackdropFilter hasn't rendered yet.
   Also carries `renderToHardwareTextureAndroid`.
2. **`expo-linear-gradient`** — gradient border at card perimeter (absoluteFill, borderWidth=1.5).
   Color: `borderAccentColor + '40'` → transparent (same approximation as GlassCard — no
   MaskedView in Expo Go).
3. **Skia `Canvas`** (absoluteFill) — `BackdropFilter(blur=16)` + `RoundedRect(GLASS_FILL)`
   + inner shadow `LinearGradient`. Requires `onLayout` on a wrapping View (new arch
   limitation). Only renders when `dims.w > 0`.
4. **Noise overlay** — `ImageBackground` with `noise.png` at 0.03 opacity (brand §1.5).
5. **Content `View`** — padding `p-5`, all card content.
6. **Face overlays** (absoluteFill inside content `View`) — approve icon (green checkmark +
   "APPROVE") and reject icon (red X + "REJECT"), each with opacity animation.

### Glow layers (behind the card in parent View, absolute)

Rendered BEFORE the `GestureDetector` in the JSX so they appear beneath the card:

- **Approve glow**: `Animated.View` absoluteFill, `backgroundColor: colors.success`, opacity
  interpolated `[0, SWIPE_THRESHOLD] → [0, 0.55]`. Has same `borderRadius` as card.
- **Reject glow**: `Animated.View` absoluteFill, `backgroundColor: colors.destructive`,
  opacity interpolated `[-SWIPE_THRESHOLD, 0] → [0.55, 0]`.

Opacity cap at 0.55 — not full 1.0. GlassCard's `GLASS_FILL` is 60% opaque; the blur
picks up ~40% of background colors. A 0.55 glow opacity creates a visible but not
overwhelming tint through the glass.

### Face overlays (approve / reject icons on card surface)

Inside the swipe card, absolutely centered:

```
approveFaceStyle: opacity = interpolate(translateX, [0, SWIPE_THRESHOLD*0.5], [0, 1], CLAMP)
rejectFaceStyle:  opacity = interpolate(translateX, [-SWIPE_THRESHOLD*0.5, 0], [1, 0], CLAMP)
```

Each overlay: Ionicons icon (48px) + uppercase label below it, in the appropriate color.
Scale: reuses `approveIconStyle` / `rejectIconStyle` from existing implementation (pop to 1.3x at threshold).

`pointerEvents="none"` on overlays — they must not block gesture.

### useReducedMotion

`useReducedMotion()` from Reanimated gates the glow and face overlay animations:
- When reduced motion: `cardStyle` has no rotation, glow opacity stays 0, face overlays hidden
- Spring-back still happens (structural animation, not decorative)

### Border accent color

Approve direction (`translateX > 10`): `borderAccentColor = colors.success + '80'`
Reject direction (`translateX < -10`): `borderAccentColor = colors.destructive + '80'`
Default: `colors.violet + '40'` (resting state)

This requires an `Animated` gradient border that interpolates accent color as you drag.
**Simplification**: use a single static border in resting state. The glow already provides
directional color feedback; a dynamic border adds complexity without meaningful UX gain.
Keep static `borderAccentColor = colors.violet`.

## Interface Contracts

### Props (unchanged)

```typescript
interface Props {
  item: ApprovalItem;
  onApprove: () => void;
  onReject: () => void;
}
```

### New internal constants

```typescript
const SWIPE_THRESHOLD = 100;    // unchanged
const DISMISS_VELOCITY = 800;   // unchanged
const GLOW_OPACITY_MAX = 0.55;  // max opacity of glow layers behind glass
const GLASS_FILL = 'rgba(22,21,31,0.6)';   // matches GlassCard
const SHADOW_TOP = 'rgba(0,0,0,0.6)';
const SHADOW_BOTTOM = 'rgba(255,255,255,0.08)';
const BLUR_RADIUS = 16;
const BORDER_RADIUS_PX = 16;  // corresponds to rounded-2xl
```

### New animated style contracts

```typescript
// Glow overlays (behind card, in parent View)
approveGlowStyle: { opacity: 0→GLOW_OPACITY_MAX as translateX: 0→SWIPE_THRESHOLD }
rejectGlowStyle:  { opacity: GLOW_OPACITY_MAX→0 as translateX: -SWIPE_THRESHOLD→0 }

// Face overlays (inside card, absoluteFill, pointerEvents=none)
approveFaceStyle: { opacity: 0→1 as translateX: 0→SWIPE_THRESHOLD*0.5 }
rejectFaceStyle:  { opacity: 1→0 as translateX: -SWIPE_THRESHOLD*0.5→0 }

// Icon scale (unchanged behavior, applied to face overlay icon)
approveIconStyle: { scale: 0.5→1.0→1.3 as translateX: 0→SWIPE_THRESHOLD→SWIPE_THRESHOLD*1.4 }
rejectIconStyle:  { scale: 1.3→1.0→0.5 as translateX: -SWIPE_THRESHOLD*1.4→-SWIPE_THRESHOLD→0 }
```

### Skia Canvas (identical to GlassCard)

```typescript
// Requires: dims: { w: number, h: number } from onLayout
// Render guard: dims.w > 0

<Canvas style={StyleSheet.absoluteFill}>
  <BackdropFilter filter={<Blur blur={BLUR_RADIUS} />}>
    <RoundedRect x={0} y={0} width={dims.w} height={dims.h} r={BORDER_RADIUS_PX} color={GLASS_FILL} />
  </BackdropFilter>
  <RoundedRect x={0} y={0} width={dims.w} height={dims.h} r={BORDER_RADIUS_PX}>
    <SkiaLinearGradient start={vec(0,0)} end={vec(0,dims.h)}
      colors={[SHADOW_TOP, 'transparent', 'transparent', SHADOW_BOTTOM]}
      positions={[0, 0.12, 0.85, 1]} />
  </RoundedRect>
</Canvas>
```

## Test Plan

### FR1: Glass surface renders

**Happy Path:**
- [ ] Card renders with dark fallback background when dims.w = 0 (Canvas guard active)
- [ ] Card renders without white flash (no opaque bg-surface covering BackdropFilter)
- [ ] Border gradient renders at card perimeter with violet accent

**Edge Cases:**
- [ ] Card renders correctly on Android (renderToHardwareTextureAndroid=true)
- [ ] Content (fullName, hours, description) still visible through glass

### FR2: Glow overlays animate correctly

**Happy Path:**
- [ ] `approveGlowStyle` opacity = 0 at translateX = 0
- [ ] `approveGlowStyle` opacity = GLOW_OPACITY_MAX at translateX = SWIPE_THRESHOLD
- [ ] `rejectGlowStyle` opacity = 0 at translateX = 0
- [ ] `rejectGlowStyle` opacity = GLOW_OPACITY_MAX at translateX = -SWIPE_THRESHOLD

**Edge Cases:**
- [ ] Glow opacity clamped — doesn't exceed GLOW_OPACITY_MAX beyond threshold
- [ ] Opposite glow is 0 when swiping in one direction

### FR3: Face overlay icons animate correctly

**Happy Path:**
- [ ] `approveFaceStyle` opacity = 0 at translateX = 0, = 1 at translateX = SWIPE_THRESHOLD*0.5
- [ ] `rejectFaceStyle` opacity = 1 at translateX = -SWIPE_THRESHOLD*0.5, = 0 at translateX = 0
- [ ] Face overlay `pointerEvents="none"` (does not block gesture)

### FR4: useReducedMotion gating

**Happy Path:**
- [ ] When reducedMotion=true: no rotation on card, glow opacity stays 0
- [ ] Spring-back still fires (spring is structural, not decorative)
- [ ] Button press scale still works (timingInstant is instant, not decorative)

### FR5: Swipe dismiss and callbacks

**Happy Path (unchanged behavior):**
- [ ] Swipe right past SWIPE_THRESHOLD OR velocity > DISMISS_VELOCITY → onApprove called
- [ ] Swipe left past SWIPE_THRESHOLD OR velocity > DISMISS_VELOCITY → onReject called
- [ ] Release before threshold → spring back to origin
- [ ] Approve haptic: notificationAsync(Success)
- [ ] Reject haptic: notificationAsync(Warning)

## Mocks Needed

- `@shopify/react-native-skia` — already mocked at `__mocks__/@shopify/react-native-skia.ts`
- `expo-haptics` — already mocked
- `react-native-gesture-handler` — already mocked
- `expo-linear-gradient` — check if mock exists; add minimal mock if not
- `../../assets/images/noise.png` — mock as `{}` in jest config or jest module mapper

## Files to Create/Modify

- **Modify**: `src/components/ApprovalCard.tsx` — full inline glass treatment + glow swipe
- **No new files** — all changes are within the single component
