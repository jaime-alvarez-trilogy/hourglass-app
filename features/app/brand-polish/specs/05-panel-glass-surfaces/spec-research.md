# Spec Research: 05-panel-glass-surfaces

## Problem Context

Three surface upgrades are needed to deliver the v1.1 "dark glass" promise:

1. **Radial panel gradients** — PanelGradient.tsx currently uses `LinearGradient` (top→bottom). v1.1 specifies radial gradients emanating from the hero metric center.
2. **Coloured glows** — Status panels should emit a soft coloured shadow matching their state colour, making the status feel physically radiated from the card.
3. **Backdrop blur + dark glass modal** — modal.tsx uses a flat opaque background. v1.1 specifies `expo-blur` `BlurView` for elevated surfaces.

A noise texture overlay is also specified but is a lower-risk visual enhancement that can be added without affecting component architecture.

## Exploration Findings

**`src/components/PanelGradient.tsx`** — uses `expo-linear-gradient` `LinearGradient` with `locations={[0, 1]}` and `start/end` props for top-to-bottom direction. The opacity animation (springPremium) is already correct and must be preserved.

**`react-native-svg`** — already installed (used by AIConeChart). Has `<RadialGradient>` via `<Defs>` — this is the cleanest way to achieve a true radial gradient in React Native.

**`expo-blur`** — not installed. Need `npx expo install expo-blur`.

**`app/modal.tsx`** — flat `backgroundColor: '#0D1117'` (will be tokenized in spec 01). For glass effect: replace with `BlurView intensity={40} tint="dark"` wrapping the modal content, with a semi-transparent `surfaceElevated` background overlay.

**Coloured glows** — achieved with React Native `shadowColor/shadowOpacity/shadowRadius` on the card container. On iOS these render correctly. On Android, we use `elevation` for a simpler drop shadow (Android doesn't support coloured shadows natively).

**Noise texture** — a semi-transparent PNG overlay on the root screen background. We'll add a noise PNG asset and render it as an `Image` with `opacity: 0.04` absolutely positioned over the `background` view. The noise image should tile seamlessly (256×256px is sufficient).

## Key Decisions

1. **SVG RadialGradient for PanelGradient** — replace `LinearGradient` from expo-linear-gradient with an SVG-based radial gradient. The SVG approach: render a full-width SVG behind the card content with a `<RadialGradient>` centered at ~(50%, 30%) — where the hero number lives. Preserve the springPremium opacity animation.

2. **Radial gradient center position** — `cx="50%"` `cy="30%"` with `r="70%"`. This puts the glow center slightly above center (hero number area) and ensures it reaches the card edges.

3. **Coloured glows via shadow props** — add to the card container in each panel. Per-state values:
   - `onTrack`: shadowColor `#10B981`, opacity 0.12, radius 20
   - `behind`: shadowColor `#F59E0B`, opacity 0.12, radius 20
   - `critical`: shadowColor `#F43F5E`, opacity 0.18, radius 24
   - `crushedIt`: shadowColor `#E8C97A`, opacity 0.18, radius 24
   - `idle`: no shadow

4. **expo-blur for modal** — install `expo-blur`, wrap modal content in `BlurView`. Keep a semi-transparent `surface` background layer for legibility. The blur is subtle (intensity 30) — we're adding depth, not frosting.

5. **Noise texture** — add `assets/images/noise.png` (256×256 tileable noise). Render as `<Image>` with `resizeMode="repeat"` and `opacity: 0.04` as absolute overlay on main screen `<View>`. Only applied at the root screen level, not per-card.

6. **Android fallback for glows** — on Android, replace coloured shadow with `elevation: 4` (neutral shadow). The `Platform.OS === 'android'` check isolates this.

## Interface Contracts

```typescript
// src/components/PanelGradient.tsx — updated

// New internal implementation: SVG-based radial instead of LinearGradient
// External API unchanged: <PanelGradient state={panelState} />
// Panel states and opacity animation logic unchanged

// SVG RadialGradient approach:
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
// Animated.View wrapper preserves springPremium opacity animation
```

```typescript
// PanelGradient shadow style per state (new)
function getGlowStyle(state: PanelState): ViewStyle {
  // Returns shadowColor, shadowOpacity, shadowRadius, shadowOffset
  // iOS: coloured glow; Android: elevation fallback
}
```

```typescript
// src/components/NoiseOverlay.tsx — new component
// <NoiseOverlay /> renders absolutely positioned noise image
// opacity: 0.04, full screen, pointer-events: none
// Used once in the root screen layout
```

```typescript
// app/modal.tsx — BlurView wrapper (after expo-blur install)
import { BlurView } from 'expo-blur';
// Modal content wrapped in BlurView intensity={30} tint="dark"
// Inner View: backgroundColor surfaceElevated at 0.85 opacity
```

### Source Tracing
| Feature | Source |
|---------|--------|
| Radial gradient | Brand guidelines v1.1 §Panel Gradient States |
| cx/cy position | Brand guidelines v1.1: "radial from hero metric center" ≈ top-center |
| Coloured glows | Brand guidelines v1.1 §Surface & Depth — Shadows as Glows |
| expo-blur | Brand guidelines v1.1 §Surface & Depth — Backdrop Blur |
| Noise texture | Brand guidelines v1.1 §Surface & Depth — Noise Texture |
| Android fallback | React Native limitation: no coloured shadows on Android |

## Test Plan

### FR1: Radial panel gradient
- [ ] `<PanelGradient state="onTrack" />` renders a radial gradient (not linear)
- [ ] Gradient center is at approximately cx=50%, cy=30%
- [ ] Opacity animation (springPremium) still works on state change
- [ ] All 5 states render correct colours
- [ ] `idle` state renders no gradient

### FR2: Coloured glows
- [ ] `onTrack` panel has green shadow
- [ ] `critical` panel has red shadow
- [ ] `crushedIt` panel has gold shadow
- [ ] `idle` panel has no shadow
- [ ] Android: uses elevation instead of coloured shadow

### FR3: BlurView modal
- [ ] Modal uses BlurView with intensity 30
- [ ] Modal background is semi-transparent surfaceElevated
- [ ] Modal content remains readable
- [ ] Fallback if expo-blur unavailable: solid surfaceElevated background

### FR4: NoiseOverlay
- [ ] Noise PNG renders at opacity ~0.04
- [ ] Positioned absolutely, full screen
- [ ] Does not intercept touch events (pointerEvents="none")
- [ ] Visible difference (subtle texture) vs flat background

## Files to Create/Modify

- `src/components/PanelGradient.tsx` — SVG radial gradient + coloured glow shadow
- `src/components/NoiseOverlay.tsx` — new component
- `app/modal.tsx` — BlurView wrapper (requires expo-blur install)
- `assets/images/noise.png` — add tileable noise texture asset
- Package: install `expo-blur` via `npx expo install expo-blur`
- `src/components/__tests__/PanelGradient.test.tsx` — update/extend tests
