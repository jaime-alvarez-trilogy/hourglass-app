# Hourglass Brand Guidelines v2.0
**Spatial Dark Glass UI — Strict Implementation Reference**

> **Version 2.0** · Supersedes v1.1 completely.
> This document is the canonical source of truth for all visual decisions in the Hourglass app.
> Every color, font weight, radius, blur amount, and animation in this document is **non-negotiable**.
> If something on screen does not match this document, it is a bug.

---

## 0. Design Philosophy

### 0.1 Primary Mission

The app must answer **"Where does my week stand?"** in under 3 seconds. Every visual decision is subordinate to this. Aesthetic richness serves clarity — it never competes with it.

### 0.2 The Liquid Glass Paradigm

This is not dark mode. This is not glassmorphism. This is **Liquid Glass** — a paradigm where:

- Interface surfaces are **physical materials** with mass, depth, light refraction, and environmental reactivity
- The background is a **living technical environment** — not a static wallpaper, an active scene
- Data visualizations **emit light** — charts glow from within, bars have neon peaks, arcs pulse with gradients
- Interactions carry **physical mass** — elements compress, spring back, settle with friction
- Colors are **mathematical inputs to a lighting system** — they communicate weekly standing without words

Every element on screen is part of a single coherent spatial scene. There is no foreground and background — only layers of depth within the same illuminated environment.

### 0.3 The Version 2.0 Upgrade

v1.1 used flat radial gradients as panel state indicators. v2.0 replaces these with **volumetric colored subsurface glows** — light emitted from the data itself, visually refracting through frosted glass surfaces. The upgrade is not cosmetic. It shifts the app from "dark mode dashboard" to "spatial observatory."

---

## 1. Color System

### 1.1 Foundation Palette

| Token | Hex | Material Application | Conceptual Role |
|---|---|---|---|
| `background` | `#0D0C14` | Animated SKSL/Skia mesh canvas base | Infinite spatial void behind the interface. Deep eggplant — **NOT pure black**. Pure black kills accent luminosity; this lets accents radiate with warmth. |
| `surface` | `#16151F` | BackdropFilter (16–20px blur) + 0.03 noise | Default analytical card glass. |
| `surfaceElevated` | `#1F1E29` | Multi-layer BackdropFilter (30px blur) | Modals, bottom sheets, PressIn states. Stronger blur signals higher z-axis. |
| `border` | `#2F2E41` | Hardware-accelerated masked LinearGradient, 1–1.5px | Chamfered glass edge catching ambient light. |
| `textPrimary` | `#E0E0E0` | Typography only | **Never `#FFFFFF`.** Pure white on dark causes halation — visual bleeding and eye strain. |
| `textSecondary` | `#A0A0A0` | Typography only | Metadata, subtitles, secondary values. |
| `textMuted` | `#757575` | Typography only | Placeholders, disabled states, timestamps, axis labels. Replaces legacy `#484F58`. |

### 1.2 Semantic Accent Colors

Each accent has **one semantic domain**. Using an accent outside its domain is a brand violation — accents must retain their neurological associations (gold = financial reward, cyan = AI intelligence, violet = deep focus).

| Token | Hex | Semantic Domain | Forbidden Uses |
|---|---|---|---|
| `gold` | `#E8C97A` / `#FFDF89` (Crushed It peak) | Financial metrics, earnings, "Crushed It" state exclusively | Navigation, decoration, non-financial charts, BrainLift, AI data |
| `cyan` | `#00C2FF` | AI usage %, AI trajectory, AI predictions only | Hours, earnings, BrainLift, navigation |
| `violet` | `#A78BFA` | BrainLift hours, deep-work tracking, primary CTAs, active navigation states | Financial data, AI usage percentage |
| `success` | `#10B981` | Weekly hours on-track state, positive delta indicators | Earnings (must use gold), AI metrics |
| `warning` | `#F59E0B` | Behind-pace state (50–99% of target) | Errors (use critical), destructive actions |
| `critical` | `#F43F5E` | Behind-pace state (<50% of target), urgent time-sensitive alerts | Destructive actions (use destructive) |
| `destructive` | `#F85149` | Irreversible actions only — delete, reject, permanent operations | Warnings, status indicators |

**On the two gold values:** `#E8C97A` is the warm base used for all earnings text and chart lines. `#FFDF89` is the brighter peak used exclusively for the "Crushed It" background glow at maximum luminosity. `#FFDF89` is never used for text.

### 1.3 Panel State → Volumetric Subsurface Glow

The animated mesh background's Node C (the status node) shifts color to communicate the user's weekly pace. This is the app's **primary emotional signal** — a luminous state machine. The glow emanates from the data itself and visually refracts through all glass surfaces in the scene.

| State | Condition | Node C Color | Glow Opacity | Animation |
|---|---|---|---|---|
| On Track | Pace ≥ target | `#10B981` Success Green | 35% | Steady |
| Behind | Pace 50–99% of target | `#F59E0B` Warning Orange | 35% | Steady |
| Critical | Pace < 50% of target | `#F43F5E` Critical Red | 35% → 55% → 35% | **Pulsing**: `withRepeat(withSequence(withTiming(0.55, {duration:800}), withTiming(0.35, {duration:800})), -1)` |
| Crushed It | Target fully met | `#FFDF89` Gold Peak | 35% | Steady (use brighter `#FFDF89` not `#E8C97A`) |
| Idle / Weekend | No active data | No Node C glow — default violet/cyan mesh | — | — |

### 1.4 Gradient Border State Awareness

The card gradient border is **not always violet**. It responds to the card's semantic context:

- **Default / neutral cards:** `#A78BFA` Violet → transparent at 45°
- **Status-bearing cards** (metric cards showing pace): border uses the current panel state color → transparent
- **Earnings cards:** `#E8C97A` Gold → transparent at 45°
- **AI metric cards:** `#00C2FF` Cyan → transparent at 45°

This extends the volumetric glow philosophy to the card surface: the border itself becomes a secondary light source that echoes the data's semantic color.

### 1.5 Surface Texture

Every glass card surface carries a **white noise texture overlay at 0.03 opacity** on top of the glass fill. This eliminates the "too clean CG rendering" look and makes the surface feel like a physical material rather than a rectangle with CSS.

- Opacity: **0.03** — barely perceptible individually, but collectively removes synthetic sterility
- Blend mode: `overlay`
- Asset: tileable white noise PNG at 256×256px, repeated to fill
- Position: `AbsoluteFill` inside the card, above BackdropFilter canvas, below content

---

## 2. Typography

### 2.1 Font Stack

| Role | Typeface | Rationale |
|---|---|---|
| **Hero numbers, section headings** | Space Grotesk | Geometric, brutalist sans-serif. Definitive for technical, AI-driven dashboards. Immediate visual impact at 36px hero sizes. The "face" of the data. |
| **Data tables, timestamps, numeric columns** | Space Mono | Highly structured monospaced. Vertical column alignment is mathematically guaranteed. For dense tabular data where misalignment would be jarring. |
| **Body copy, labels, descriptions** | Inter | Undisputed gold standard for interface text. Massive x-height. Clarity at 12–16px. For anything the user reads rather than scans. |

### 2.2 Type Scale

| NativeWind class | Size | Typeface | Weight | Color | Specific use |
|---|---|---|---|---|---|
| `font-display-bold text-4xl` | 36px | Space Grotesk | 700 | `#E0E0E0` | Weekly hours hero (`33.8h`) |
| `font-display-bold text-2xl` | 24px | Space Grotesk | 700 | `#E8C97A` | Earnings hero (`$1,692`) |
| `font-display-semibold text-xl` | 20px | Space Grotesk | 600 | `#E0E0E0` | Section metric values, overview numbers |
| `font-display-semibold text-lg` | 18px | Space Grotesk | 600 | `#00C2FF` | AI percentage hero (`92%`) |
| `font-sans-medium text-xs uppercase` | 11px | Inter | 500 | `#A0A0A0` | Card section labels (`THIS WEEK`, `EARNINGS`) |
| `font-mono-regular text-sm` | 14px | Space Mono | 400 | `#A0A0A0` | Table row values, date columns |
| `font-mono-regular text-xs` | 12px | Space Mono | 400 | `#757575` | Timestamps, secondary table data |
| `font-sans-regular text-xs` | 12px | Inter | 400 | `#757575` | Axis labels, chart captions, footnotes |

### 2.3 Strict Calibration Rules

1. **No pure white text, ever.** `#FFFFFF` is prohibited on all dark surfaces. Minimum primary text: `#E0E0E0`. This is not a preference — it eliminates halation.

2. **Tabular nums on every number.** All hours, dollars, percentages, and counts must have `fontVariant: ['tabular-nums']`. Prevents horizontal jitter when values update. No exceptions.

3. **Hero letter-spacing.** At 36px+: `letterSpacing: -0.02 * fontSize` (e.g., `letterSpacing: -0.72` at 36px). At 24px: `letterSpacing: -0.48`. Tighter tracking at display sizes reads as precision and confidence.

4. **Section label style.** All card section labels (`THIS WEEK`, `AI TRAJECTORY`, `EARNINGS`) are uppercase Inter Medium at 11–12px with `letterSpacing: 0.08em`. Never use Space Grotesk for labels — it's reserved for numbers.

5. **Font weight ceiling: 700.** ExtraBold (800) renders optically too heavy on dark backgrounds. Bold (700) is the maximum allowed weight across all typefaces.

6. **Optical weight reduction.** Light text on dark backgrounds renders ~1 weight-step heavier than it truly is. Compensate: where Bold (700) would be used in light mode, use SemiBold (600). Where Regular (400) would be used, consider Light (300) for delicate secondary text. Never compensate by reducing font size.

7. **Line heights.** Body and label text: `lineHeight: fontSize * 1.5`. Tight line heights on dark surfaces cause luminance clustering. Do not go below `1.4×`.

8. **Gradient hero text (high-impact, optional).** Major hero numbers may use a Skia `LinearGradient` mask — `#E0E0E0` at top fading to `#A0A0A0` at bottom. Creates volumetric depth on large numerals. Apply to `33.8h` and `$1,692` only. Never on body text or labels.

9. **FOUT prevention is mandatory.** Space Grotesk and Space Mono must be fully loaded before the splash screen dismisses. Implementation: `SplashScreen.preventAutoHideAsync()` at app root → `useFonts({...spaceGrotesk, ...spaceMono, ...inter})` → `SplashScreen.hideAsync()` in `useEffect` when `fontsLoaded === true`. A flash of unstyled Inter before Space Grotesk appears is a visible product regression.

---

## 3. Glass Card Surface

### 3.1 The Liquid Glass Definition

A Hourglass glass card is not a "semi-transparent dark rectangle." It is a **physical material** that:
- Has measurable thickness (simulated by inner shadows)
- Refracts the animated environment behind it (BackdropFilter blur)
- Has chamfered edges that catch and scatter light (gradient border)
- Carries surface imperfection (noise texture)
- Responds to touch with physical compression (spring PressIn)

Every property in §3.2 exists to create this illusion. Removing any layer degrades the physical quality of the material.

### 3.2 Layer Stack (bottom → top)

```
AnimatedMeshBackground     AbsoluteFill, z=0, pointerEvents=none
  ↓ all content floats above ↓
Animated.View              Spring scale wrapper (pressable cards only)
  MaskedView               Gradient border — 1.5px perimeter gap
    LinearGradient         Status/semantic color → transparent at 45°
  View (onLayout)          ← onLayout MUST be here, not on Canvas
    Canvas (AbsoluteFill)  Skia rendering layer
      BackdropFilter(16)   Blurs animated mesh — creates refraction
        RoundedRect        Fills with GLASS_FILL rgba(22,21,31,0.6)
  NoiseOverlay (AbsFill)   White noise PNG at 0.03 opacity / overlay blend
  ShadowView (inset)       Physical glass thickness simulation
    top edge               rgba(0,0,0,0.6), offset {0,4}, blur 8
    bottom edge            rgba(255,255,255,0.10) reflected highlight
  content View             Children, padding 20px (p-5)
```

### 3.3 Glass Card Values

| Property | Value | Source / Notes |
|---|---|---|
| Blur radius — standard card | `16–20px` | Skia `BackdropFilter` with `ImageFilter.MakeBlur(16,16)`. 20px for wider cards. |
| Blur radius — elevated surface | `30px` | Modals, bottom sheets. Stronger blur signals higher z-axis elevation. |
| Fill color | `rgba(22, 21, 31, 0.60)` | Dark glass. This must be dark. A light or white fill means BackdropFilter is not rendering. |
| Border radius | `16px` | `rounded-2xl`. Non-negotiable minimum for tactile aesthetic. |
| Border width | `1.5px` | Gradient masked perimeter. |
| Border gradient | Semantic color → `transparent` at 45° | See §1.4 for color selection. Default: `#A78BFA` violet. |
| Inner shadow — top | `rgba(0,0,0,0.6)`, offset `{width:0, height:4}`, blur `8` | Thickness at top edge — dark interior. |
| Inner shadow — bottom | `rgba(255,255,255,0.10)` reflected light | Brightness at bottom edge — ambient bounce light. **Note: 0.10, not 0.08.** |
| Noise texture | White noise PNG, opacity `0.03`, blend `overlay` | See §1.5. |
| `onLayout` | On the wrapping `View`, **never on `<Canvas>`** | `<Canvas onLayout>` is unsupported in new architecture — causes console error. |
| Max simultaneous glass layers | **3** | Exceeding this triggers GPU thermal throttling. Standard screens should target 1–2 overlapping layers. |
| Card opacity | **Always 1.0** | Sub-1.0 opacity on BackdropFilter views causes rendering pipeline glitches and visual artifacts. |
| Android | `renderToHardwareTextureAndroid={true}` mandatory | Forces GPU hardware texture caching. Without this, Android repaints at CPU level during scroll — catastrophic performance. |

### 3.4 Platform Routing for Blur

| Platform | Glass Implementation | Rationale |
|---|---|---|
| iOS 26+ — cards | Skia `BackdropFilter` | `UIGlassEffect` reserved for system chrome (tab bar, system alerts). Skia gives precise control over card blur. |
| iOS 26+ — tab bar | `NativeTabs` (system handles) | Automatic `UIGlassEffect` integration — real-time dynamic specular highlights, gyroscope-responsive optical distortion. Zero configuration. |
| Legacy iOS < 26 | Skia `BackdropFilter` | Stable 60+ FPS. Avoids `UIVisualEffectView` framebuffer allocation — which caused SIGKILL crashes on this codebase when multiple cards mounted concurrently alongside Reanimated startup. |
| All Android | Skia `BackdropFilter` | Android has no robust native real-time background blur. Skia provides cross-platform parity without performance degradation. |

**Permanently banned:** `expo-blur`, `@react-native-community/blur`. Both caused SIGKILL crashes on this codebase. They are not to be reinstalled under any circumstances.

### 3.5 Spatial Geometry

| Property | Value | Tailwind | Rule |
|---|---|---|---|
| Card internal padding | 20px or 24px | `p-5` / `p-6` | `p-5` for standard cards; `p-6` for hero/large cards |
| Screen horizontal margin | 16px | `px-4` | Ensures separation from device bezel |
| Card gap (vertical) | 16px | `gap-4` | Between stacked cards on a screen |
| Main cards | 16px radius | `rounded-2xl` | |
| Interactive elements, buttons, inputs | 12px radius | `rounded-xl` | |
| Nested badges, tags, chips | 8px radius | `rounded-lg` | |
| **Absolute minimum** | **8px** | `rounded-lg` | `rounded-md` (6px) or smaller permanently prohibited — destroys tactile glass aesthetic |

**Base grid unit: 4px.** Every padding, margin, gap, and radius value must be a multiple of 4. This is non-negotiable.

---

## 4. Animated Mesh Background

### 4.1 Design Decision: Declarative over SKSL

Two implementation options were evaluated:
- **Option A (SKSL fragment shaders):** GPU-accelerated per-pixel Simplex/Perlin noise via `RuntimeEffect`. Maximum fidelity, maximum complexity. Rejected for maintainability — shader code is opaque, difficult to debug, and cannot be reasoned about in React terms.
- **Option B (Declarative Skia gradients):** Multiple `RadialGradient` components with Reanimated-driven orbital centers. **Selected.** Achieves equivalent visual result through composable React primitives. Maintainable, debuggable, cross-platform identical.

### 4.2 Architecture

- **Full-screen Skia `<Canvas>`** at `AbsoluteFill`, `zIndex: 0`, `pointerEvents: 'none'`
- **Present on every screen** — the mesh is the environment, not a home-screen decoration
- **3 RadialGradient nodes** bound to Reanimated `useSharedValue`-driven orbital centers
- **BlendMode: `"screen"`** on all nodes — luminous intersections where node light overlaps
- **Base:** `<Circle>` covering full canvas in `#0D0C14` eggplant before nodes render
- **Node opacity ceiling: 0.15** — mesh is atmosphere, never foreground

### 4.3 Node Specification

| Node | Color | Phase Offset | Orbital Role |
|---|---|---|---|
| A | `#A78BFA` Violet | 0° | Primary orbital — always present |
| B | `#00C2FF` Cyan | 120° counter-phase | Secondary orbital — always present |
| C | Current panel state color (§1.3) | 240° | Status signal — changes with weekly pace |

### 4.4 Animation

```js
// Single shared time value drives all three nodes
time = useSharedValue(0)
→ withRepeat(withTiming(2 * Math.PI, { duration: 8000, easing: Easing.linear }), -1, false)

// Per-node center calculation (run on UI thread via useDerivedValue)
nodeCenter.x = screenWidth/2  + 160 * Math.sin(time.value + phaseOffset)
nodeCenter.y = screenHeight/2 + 200 * Math.cos(time.value * 0.7 + phaseOffset)

// Node radii — large enough to cover significant screen area
nodeRadiusA = screenWidth * 0.7   // violet — dominant
nodeRadiusB = screenWidth * 0.6   // cyan
nodeRadiusC = screenWidth * 0.55  // status — slightly smaller
```

---

## 5. Data Visualization

### 5.1 Library Mandate

**Victory Native XL v41+** is required for all non-specialized charts (bar chart, sparklines). It renders a single optimized Skia `Path` on the GPU canvas rather than SVG nodes — enabling 60–120 FPS gesture tracking via Reanimated worklets.

**Banned chart libraries:**
- `react-native-chart-kit` — SVG-based, UI thread blocking during animation
- Pre-v40 `victory-native` — SVG rendering, cannot run worklets
- `react-native-svg` as a chart renderer — same issue

### 5.2 Weekly Bar Chart

| Property | Spec |
|---|---|
| Library | VNX `<CartesianChart>` wrapping custom `<Bar>` component |
| Bar fill | Vertical `LinearGradient` — neon status-color at full opacity at peak → `rgba(color, 0)` transparent at base. Bars must glow from the top down. |
| Rounded corners | `topLeft: 4, topRight: 4` — rounded peak, flat base (sits on axis) |
| Cylindrical depth | `ShadowView` inset on each bar — creates illusion of volumetric cylinder |
| Today's bar color | Status color: `#10B981` on-track / `#F59E0B` behind / `#F43F5E` critical |
| Past bars | `#10B981` success green gradient |
| Future bars | `#757575` muted — future is unknown |
| Target line | `#A0A0A0` dashed horizontal at weekly target Y position |
| Card surface | **Dark glass only.** White backgrounds behind charts are a bug. |

### 5.3 Trend Sparkline (Earnings, Hours, AI%)

| Property | Spec |
|---|---|
| Library | VNX `<CartesianChart>` + `<Line>` + `<Area>` |
| Line stroke width | 2.5px |
| Line glow | `BlurMaskFilter(blur=8, style="solid")` painted over the line — creates neon luminous halo |
| Line color | Semantic: `#E8C97A` gold=earnings, `#10B981` green=hours, `#00C2FF` cyan=AI% |
| Area fill | `LinearGradient` — accent color at 0.35 opacity at top → `transparent` at `y0` bottom axis |
| Cursor | Vertical hairline + filled dot at touched data point |
| Gesture | `gestureLongPressDelay={0}` — immediate activation. 60–120 FPS via Skia + Reanimated UI-thread worklet. Cross-chart sync via `externalCursorIndex` / `onScrubChange` props. |
| Card surface | **Dark glass only.** |

### 5.4 AI Arc Hero (Circular Progress)

| Property | Spec |
|---|---|
| Renderer | Skia `<Canvas>` + `<Path>` (270° arc) + `<SweepGradient>` |
| Gradient stops | `#00C2FF` Cyan (0%) → `#A78BFA` Violet (50%) → `#FF00FF` Magenta (100%) |
| Track | 270° path at full extent, stroke `rgba(255,255,255,0.08)` |
| Sweep animation | `useSharedValue(0)` → `withSpring(targetPct / 100, springArcFill)` on mount and value change |
| Arc sweep | 270° — opens at bottom center (flat bottom, not full circle) |
| Card surface | **Dark glass only.** The arc should appear to float within a dark glass environment. |

### 5.5 Prime Radiant / AI Cone Chart

| Property | Spec |
|---|---|
| Renderer | Custom Skia — **permanently excluded from VNX migration** |
| Rationale | 3D holographic cone shape + layered cyan/indigo glow layers + scrub gesture returning `AIScrubPoint` — bespoke visualization that would lose its identity in any generic chart framework |
| Main projection line | `#00C2FF` cyan, `BlurMaskFilter(blur=6)` glow |
| Confidence cone area | `rgba(0,194,255,0.12)` filled Skia Path (upper and lower bounds) |
| 75% AI target guide | `#E8C97A` gold dashed horizontal |
| Axis labels | Inter Regular 11px, `#757575` |

---

## 6. Motion System

### 6.1 Core Principle

**Elements must behave with physical mass, momentum, and friction.** Linear transitions feel mechanical and reveal their digital nature. Every animation should suggest that the element has weight — it overshoots slightly, settles, compresses on impact. The user should feel like they are interacting with matter, not pixels.

### 6.2 Spring Constants

```ts
// src/lib/animation.ts — single source of truth

springCardEntry = { mass: 1,   stiffness: 100, damping: 15 }
// Cards entering a screen: deliberate, confident, settles smoothly

springListItem  = { mass: 0.8, stiffness: 80,  damping: 12 }
// List items: lighter, faster, slight bounce creates "settling in" feel

springPressIn   = { stiffness: 300, damping: 20 }
// Touch feedback: stiff and immediate — must feel instantaneous

springArcFill   = { mass: 1,   stiffness: 80,  damping: 12 }
// AI arc progress: deliberate spring from 0 to current value on mount
```

### 6.3 Screen Card Entry (useStaggeredEntry)

Applied to **every screen's top-level cards** via `useFocusEffect` — replays on every tab switch, not just initial mount.

```
count:   number of cards on screen
delay:   cardIndex × 150ms

Initial state per card:
  opacity:    0
  translateY: 20px  (cards float up into place)
  scale:      0.95  (slight zoom in)

Final state:
  opacity:    1
  translateY: 0
  scale:      1

Spring: springCardEntry
```

Screens and their card counts: Home (4), Overview (5), AI (3+rows), Approvals (list).

### 6.4 List Cascade (useListCascade)

Applied to **every scrollable list** — AI daily rows, approval cards, any `FlatList` or `.map()` rendered list.

```
count:   number of items
delay:   itemIndex × 100ms  (faster than card stagger — items are lighter)

Initial state:
  opacity:    0
  translateY: 12px
  scale:      0.97

Final state:
  opacity:    1
  translateY: 0
  scale:      1

Spring: springListItem
Re-triggers: when count changes (new data loads)
```

### 6.5 PressIn / PressOut (Tactile Feedback)

All navigable cards use `pressable={true}` on `GlassCard`. Non-navigable informational cards use `pressable={false}`.

```
onPressIn:
  scale:        1.0 → 0.96
  inner shadow: opacity ↑ (card compresses deeper into itself)
  spring:       springPressIn (immediate — must not lag)

onPressOut:
  scale:        0.96 → 1.0
  inner shadow: opacity back to resting value
  spring:       springPressIn
```

### 6.6 What Must Not Be Used

| Banned | Replacement | Reason |
|---|---|---|
| Moti library | `react-native-reanimated` directly | Adds dependency for zero benefit — Reanimated 4.2.1 exposes everything Moti wraps |
| Legacy `Animated` API (`Animated.Value`, `Animated.timing`) | Reanimated `useSharedValue` + worklets | Legacy API crosses JS bridge asynchronously — cannot guarantee 60 FPS during complex Skia renders |
| `Animated.spring` / `Animated.sequence` | `withSpring`, `withSequence` from Reanimated | Same bridge issue |

---

## 7. Navigation

### 7.1 Tab Bar

- **Component:** `NativeTabs` from `expo-router/unstable-native-tabs`
- **Correct API:** `<NativeTabs.Trigger name="...">` containing `<NativeTabs.Trigger.Icon sf="..." />` + `<NativeTabs.Trigger.Label>` + optional `<NativeTabs.Trigger.Badge>` — **not** `.Screen`
- **Active tint:** `#A78BFA` Violet via `tintColor` prop on `<NativeTabs>` directly — not via `screenOptions`
- **iOS 26+:** `UIGlassEffect` applied automatically by system — the tab bar becomes refractive glass matching the spatial environment. Do not configure, override, or interfere with it.
- **Feature flag:** `ENABLE_NATIVE_TABS: true` in `app.json → expo.extra`
- **Haptics:** Native tab bars on both iOS and Android handle haptic feedback natively. The `HapticTab` wrapper component is deprecated and must not be used.

### 7.2 Shared Element Transitions

- **Feature flag:** `ENABLE_SHARED_ELEMENT_TRANSITIONS: true` in `app.json → expo.extra`
- Executed on the native C++ thread — JS thread mounts new screen simultaneously, no janking
- Morphs geometry (position, size, borderRadius) from source to destination card

**Tagged element pairs:**

| Source | Destination | Tag |
|---|---|---|
| Home earnings `TrendSparkline` card | Overview earnings section | `home-earnings-card` |
| Home AI compact card | AI tab main chart card | `home-ai-card` |

**Usage:** `setTag(tag)` from `src/lib/sharedTransitions.ts` — reads feature flag, returns `{ sharedTransitionTag: tag }` or `{}`. Wrap GlassCard in `<Animated.View {...setTag('home-earnings-card')}>`.

---

## 8. Design Targets (Competitive Calibration)

When making subjective visual decisions not covered explicitly by this document, calibrate against:

| Product | What to learn from it |
|---|---|
| **Oura Ring app** | Spatial depth in health dashboards. How glass cards layer without cluttering. How metric typography feels confident without being aggressive. |
| **Linear** | Data density on dark backgrounds. Purposeful use of violet as the primary action color. How to make a "serious" product feel premium rather than cold. |
| **Arc Browser** | Organic shapes in dark UI. How animated ambient backgrounds create atmosphere without demanding attention. Premium tactile interaction quality. |

If a proposed design would look out of place in any of these apps, it is wrong for Hourglass.

---

## 9. Implementation Gap Register

Current state of the running app vs. this spec. These are bugs.

| # | Gap | Status | Fix |
|---|---|---|---|
| 1 | **Card background** | ✅ Fixed | `ShadowView` got `backgroundColor: 'transparent'` — was covering BackdropFilter Canvas with white |
| 2 | **All chart card backgrounds** | ✅ Fixed | Same `ShadowView` fix — all `Card`/`GlassCard` now dark glass |
| 3 | **Bar chart fill** | ✅ Fixed | Replaced VNX `Bar` with Skia `RoundedRect`+`LinearGradient` per bar for per-bar color gradients |
| 4 | **Line chart glow** | ✅ Fixed | `TrendSparkline` already has `BlurMask blur={8}` inside `Line` from VNX migration |
| 5 | **Area fill under sparklines** | ✅ Fixed | `TrendSparkline` already has `Area` + `LinearGradient` from VNX migration |
| 6 | **Hero font** | ✅ Fixed | `MetricValue` uses `font-display-extrabold` → `SpaceGrotesk_700Bold` via tailwind.config |
| 7 | **Data table font** | ✅ Fixed | `DailyAIRow` updated to `font-mono` + `fontVariant: ['tabular-nums']` on all data cells |
| 8 | **Text colors** | ✅ Fixed | `colors.ts` already has correct tokens; `#E0E0E0`, `#A0A0A0`, `#757575` |
| 9 | **Animated mesh** | ✅ Fixed | Split combined `{x,y}` DerivedValues into separate `cx`/`cy` for Skia UI-thread reactivity; opacity 0.15 |
| 10 | **Tabular nums** | ✅ Fixed | `MetricValue` and `DailyAIRow` both enforce `fontVariant: ['tabular-nums']` |
| 11 | **Noise texture** | ✅ Fixed | Added `ImageBackground noise.png` at `0.03 opacity` inside `GlassCard` glass body |
| 12 | **Border color** | ✅ Fixed | `Card` accepts `borderAccentColor` prop; `index.tsx` passes gold/cyan/panelState; AI tab uses cyan |

---

## 10. What "Done" Looks Like

When fully implemented, every screen of this app should evoke the following:

> You are looking at live data through **frosted volcanic glass** suspended in deep space.
>
> The background is not a wallpaper — it breathes. Three light sources orbit slowly, their intersecting glow communicating the week's standing before the user has read a single number: green = doing well, orange = slipping, red = critical. The colors shift with physical softness, not a binary toggle.
>
> Cards have genuine depth. They refract the orbiting light behind them. Their edges catch violet and cyan and scatter it at 45°. Press one and it compresses inward with physical mass, the inner shadow deepening as if the glass flexes under your finger. Release and it springs back with the momentum of something that weighs something.
>
> Numbers are carved from dark glass in Space Grotesk — confident, geometric, precisely off-white. They are not labels. They are instruments.
>
> Charts emit light. Bar peaks are neon-bright, fading to nothing at the base like a plasma display. Line charts glow with luminous halos. The AI arc sweeps through cyan to violet to magenta with spring momentum.
>
> The overall register is: **deep space observatory, 2026. Not dark mode.**
