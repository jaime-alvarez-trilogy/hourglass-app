# 05-panel-glass-surfaces

**Status:** Draft
**Created:** 2026-03-15
**Last Updated:** 2026-03-15
**Owner:** @trilogy

---

## Overview

This spec upgrades three surface-rendering systems to deliver the v1.1 "dark glass" brand promise:

1. **Radial panel gradients** — replace `LinearGradient` in `PanelGradient.tsx` with an SVG-based `RadialGradient` centered at the hero metric area (cx=50%, cy=30%, r=70%). The existing springPremium opacity animation is preserved.

2. **Coloured glows** — each status panel emits a soft coloured shadow matching its state colour via React Native `shadowColor/shadowOpacity/shadowRadius` (iOS) with `elevation` fallback (Android). Per-state values are specified in the research.

3. **Backdrop-blur modal** — `app/modal.tsx` is upgraded from a flat opaque background to an `expo-blur` `BlurView` (intensity=30, tint="dark") wrapping the modal content with a semi-transparent surfaceElevated overlay for legibility.

4. **Noise texture overlay** — a `NoiseOverlay` component renders a 256×256 tileable noise PNG at opacity 0.04 as an absolutely-positioned, pointer-events-none layer on the root screen background.

### Dependencies

- `react-native-svg` is already installed (used by AIConeChart). The RadialGradient import is available.
- `expo-blur` must be installed via `npx expo install expo-blur`.
- This spec runs in parallel with 02, 03, 04 but requires 01-design-tokens to be complete (color tokens needed for glow values and surfaceElevated).

---

## Out of Scope

1. **Shader-based background animation** — Descoped. WebGL/Skia shaders are a future enhancement listed in FEATURE.md out-of-scope.

2. **AI accent "breathing" animation** — Descoped. Pulsing glow animations are a future enhancement; static glows are sufficient for v1.1.

3. **Per-card noise texture** — Descoped. Noise is applied once at root screen level only. Per-card noise would require significant performance consideration and is not specified in v1.1 brand guidelines for individual cards.

4. **Coloured shadows on Android** — Descoped (platform limitation). Android does not support `shadowColor` natively. The Android fallback uses `elevation: 4` (neutral). This is documented in spec-research.md and is a known platform constraint, not a feature gap.

5. **BlurView on all surfaces** — Descoped. Blur is applied only to `modal.tsx`. Extending blur to cards, bottom sheets, or other surfaces is deferred to a future design-system expansion spec (no current spec owns this).

6. **Noise PNG generation tooling** — Descoped. The asset `assets/images/noise.png` is committed directly. Build-time generation of noise textures is unnecessary complexity.

7. **Dynamic blur intensity by elevation level** — Descoped. A single intensity=30 for all modals is specified. Variable blur intensity by elevation depth is a future enhancement.

---

## Functional Requirements

### FR1: Radial Panel Gradient

Replace the `LinearGradient` implementation in `PanelGradient.tsx` with an SVG-based radial gradient.

**Implementation:**
- Import `Svg, { Defs, RadialGradient, Stop, Rect }` from `react-native-svg`
- Render a full-width SVG behind card content using `cx="50%" cy="30%" r="70%"`
- Wrap in `Animated.View` to preserve the existing springPremium opacity animation
- Remove the `expo-linear-gradient` `LinearGradient` import and usage

**Per-state gradient colours (inner → outer):**
- `onTrack`: `#10B981` → `transparent`
- `behind`: `#F59E0B` → `transparent`
- `critical`: `#F43F5E` → `transparent`
- `crushedIt`: `#E8C97A` → `transparent`
- `idle`: no gradient (render nothing / fully transparent)

**Success Criteria:**
- [ ] `<PanelGradient state="onTrack" />` renders an SVG with a `RadialGradient` element (not `LinearGradient`)
- [ ] The RadialGradient has `cx="50%"` and `cy="30%"` attributes
- [ ] All 5 states (`onTrack`, `behind`, `critical`, `crushedIt`, `idle`) render without error
- [ ] `idle` state renders no visible gradient (transparent or no SVG rendered)
- [ ] Opacity animation (springPremium) still applies to the gradient container

---

### FR2: Coloured Glows

Add a state-dependent coloured shadow to the card container returned by PanelGradient (or applied by the parent panel component).

**Implementation:**
- Export a `getGlowStyle(state: PanelState): ViewStyle` function from PanelGradient
- Apply `shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset` for iOS
- Apply `elevation` for Android using `Platform.OS === 'android'` guard

**Per-state shadow values:**
| State | shadowColor | shadowOpacity | shadowRadius | elevation |
|-------|-------------|---------------|--------------|-----------|
| `onTrack` | `#10B981` | 0.12 | 20 | 4 |
| `behind` | `#F59E0B` | 0.12 | 20 | 4 |
| `critical` | `#F43F5E` | 0.18 | 24 | 4 |
| `crushedIt` | `#E8C97A` | 0.18 | 24 | 4 |
| `idle` | none | 0 | 0 | 0 |

For all non-idle states: `shadowOffset: { width: 0, height: 4 }`

**Success Criteria:**
- [ ] `getGlowStyle('onTrack')` returns iOS shadow props with `shadowColor: '#10B981'`
- [ ] `getGlowStyle('critical')` returns iOS shadow props with `shadowOpacity: 0.18`
- [ ] `getGlowStyle('crushedIt')` returns iOS shadow props with `shadowColor: '#E8C97A'`
- [ ] `getGlowStyle('idle')` returns no shadow (shadowOpacity: 0 or empty object)
- [ ] On Android (`Platform.OS === 'android'`), returns `{ elevation: 4 }` for non-idle states and `{ elevation: 0 }` for idle

---

### FR3: BlurView Modal

Upgrade `app/modal.tsx` to use `expo-blur` `BlurView` for the dark glass surface.

**Implementation:**
- Install `expo-blur` via `npx expo install expo-blur`
- Import `BlurView` from `expo-blur`
- Wrap modal content root in `<BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>`
- Add inner `<View>` with `backgroundColor: colors.surfaceElevated` at opacity 0.85 for legibility
- Preserve all existing modal content (close button, children rendering)
- Fallback: if `BlurView` is unavailable (web/unsupported), fall back to solid `surfaceElevated` background

**Success Criteria:**
- [ ] Modal renders a `BlurView` component with `intensity={30}` and `tint="dark"`
- [ ] Modal has an inner `View` with semi-transparent `surfaceElevated` background
- [ ] Existing modal content (title, close button, children) still renders correctly
- [ ] No regression in modal open/close behaviour

---

### FR4: NoiseOverlay Component

Create a new `NoiseOverlay` component that renders a tileable noise texture as a subtle screen-level overlay.

**Implementation:**
- Create `src/components/NoiseOverlay.tsx`
- Render `<Image source={require('../../assets/images/noise.png')} style={styles.noise} />`
- Styles: `position: 'absolute'`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0`, `opacity: 0.04`
- Set `pointerEvents="none"` on the container so it never intercepts touch
- Add `noise.png` to `assets/images/` (256×256px tileable noise PNG, `resizeMode="repeat"`)

**Success Criteria:**
- [ ] `<NoiseOverlay />` renders without error
- [ ] Component has `pointerEvents="none"` (does not intercept touch events)
- [ ] Image has `opacity: 0.04` style applied
- [ ] Image is absolutely positioned covering full parent bounds
- [ ] `resizeMode="repeat"` is set on the Image

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/components/PanelGradient.tsx` | Current LinearGradient implementation — replace with SVG radial |
| `src/components/__tests__/PanelGradient.test.tsx` | Existing tests — extend to cover radial + glow |
| `src/components/AIConeChart.tsx` | Reference for react-native-svg usage patterns |
| `app/modal.tsx` | Current flat-background modal — add BlurView |
| `src/lib/colors.ts` | Color tokens (surfaceElevated, state colours) — from spec 01 |
| `assets/images/` | Image assets directory — add noise.png here |

### Files to Create

| File | Description |
|------|-------------|
| `src/components/NoiseOverlay.tsx` | New component for noise texture overlay |
| `assets/images/noise.png` | 256×256 tileable noise PNG at opacity 0.04 |

### Files to Modify

| File | Change |
|------|--------|
| `src/components/PanelGradient.tsx` | Replace LinearGradient with SVG RadialGradient; export `getGlowStyle` |
| `app/modal.tsx` | Add BlurView wrapper with semi-transparent overlay |
| `src/components/__tests__/PanelGradient.test.tsx` | Extend tests for radial gradient and glow styles |
| `package.json` / `package-lock.json` | After `npx expo install expo-blur` |

### Data Flow

```
PanelGradient receives: state: PanelState
    │
    ├─ getGlowStyle(state) → ViewStyle (shadow props)
    │     └─ iOS: shadowColor/opacity/radius/offset
    │     └─ Android: elevation
    │
    └─ SVG RadialGradient
          ├─ cx="50%" cy="30%" r="70%"
          ├─ Stop offset="0%" stopColor={innerColor}
          └─ Stop offset="100%" stopColor="transparent"

Animated.View (opacity: springPremium animated value)
    └─ Svg (full width/height)
          └─ Defs > RadialGradient > Stops
          └─ Rect fill="url(#gradient)"
```

```
app/modal.tsx
    └─ BlurView intensity={30} tint="dark" (absoluteFill)
          └─ View backgroundColor=surfaceElevated opacity=0.85
                └─ [existing modal content]
```

```
Root screen layout
    └─ View (background)
          ├─ [screen content]
          └─ NoiseOverlay (pointerEvents="none")
                └─ Image source=noise.png opacity=0.04 resizeMode="repeat"
```

### Edge Cases

1. **`idle` state**: `getGlowStyle('idle')` returns `{}` (no shadow). The SVG RadialGradient for idle renders fully transparent stops — or the SVG is not rendered at all.

2. **Android coloured shadows**: `Platform.OS === 'android'` returns `{ elevation: 4 }` for non-idle and `{ elevation: 0 }` for idle. The `shadowColor` prop is ignored on Android.

3. **expo-blur unavailable**: If unavailable (e.g., Expo Web), render a solid `View` with `backgroundColor: colors.surfaceElevated` as fallback.

4. **noise.png missing**: The PNG must be committed before the component is used. Tests should mock `require()`.

5. **SVG sizing**: The SVG must use `width="100%"` and `height="100%"` with `preserveAspectRatio="none"` so the radial gradient scales correctly regardless of card dimensions.

6. **springPremium animation preservation**: The `Animated.View` wrapper around the SVG must receive the `opacity` animated value from the existing springPremium animation. The external API `<PanelGradient state={...} />` must not change.

### Dependencies

- `react-native-svg` — already installed, confirmed by AIConeChart usage
- `expo-blur` — install via `npx expo install expo-blur` before implementation
- `expo-linear-gradient` — import can be removed from PanelGradient after this spec

### Test Mock Strategy

- `react-native-svg`: mock `Svg`, `Defs`, `RadialGradient`, `Stop`, `Rect` as plain `View` or `null`
- `expo-blur`: mock `BlurView` as a plain `View` forwarding all props
- `Image` (noise): mock `require('../../assets/images/noise.png')` as `1` (numeric asset ID)
- `Platform.OS`: set to `'ios'` for glow tests, `'android'` for fallback tests
