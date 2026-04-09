# Brand Polish — v1.1 Design System Implementation

## Overview

Implement all fixes surfaced by UX Gauntlet Run #001 and upgrade the app to the v1.1 brand guidelines. This feature closes the gap between what the brand guidelines specify and what the app actually delivers.

**Source:** `gauntlet-runs/video/run-001-2026-03-15/` — v1 specs (01–05)
**Source:** `gauntlet-runs/video/run-002-2026-03-16/` — v2 specs (06–07)
**Brand guidelines version:** v1.1 (`BRAND_GUIDELINES.md`)

---

## Problem Statement

The UX Gauntlet (3/7 models, avg ~5/10) identified a consistent pattern: **strong data foundation, weak motion/brand execution**. The app has excellent data visualisation and hierarchy but fails on:

1. Missing spring animations throughout (navigation, cards, touch)
2. Color token violations (gold misused, undefined classes)
3. Typography inconsistency (3 font families, missing tabular-nums)
4. Panel gradients are linear instead of radial
5. No dark glass surfaces (backdrop-blur, noise, glows) despite brand promise

---

## Goals

- Upgrade base color palette to v1.1 (hued eggplant black)
- Consolidate to Inter variable font — drop Space Grotesk and Plus Jakarta Sans
- Add springSnappy touch feedback to all pressables
- Add springBouncy staggered card entry animations on every screen
- Convert panel gradients from linear to radial (SVG RadialGradient)
- Implement dark glass surfaces: backdrop-blur, noise texture, coloured glows

---

## Out of Scope

- New features or data changes
- Command menu / Cmd+K (future)
- Shader-based background animation (future)
- Auditory feedback / sound design (future)
- AI accent "breathing" animation (future)

---

## Spec Decomposition

| Spec | Description | Blocks | Blocked By | Complexity |
|------|-------------|--------|------------|------------|
| 01-design-tokens | Palette v1.1, goldBright, cyan update, tailwind sync | 02, 03, 04, 05 | — | S |
| 02-typography | Inter consolidation, font aliases, tabular-nums, class fixes | — | 01 | S |
| 03-touch-and-navigation | AnimatedPressable, HapticTab scale, FadeInScreen spring | — | 01 | M |
| 04-card-entry-animations | useStaggeredEntry hook, wire to all screens | — | 01 | M |
| 05-panel-glass-surfaces | Radial gradients (SVG), coloured glows, expo-blur, noise texture | — | 01 | M |
| 06-wiring-and-tokens | NoiseOverlay wired to tabs layout, tab bar token fix, toggle gold→violet, MetricValue 800wt | — | — | S |
| 07-chart-line-polish | TrendSparkline glow (Skia BlurMaskFilter, 2.5px), WeeklyBarChart today-bar glow | — | — | S |

**Parallelism:** 01 must complete first for v1 specs. 06 and 07 are independent of everything — run immediately.

---

## Key Files

| File | Specs that modify it |
|------|---------------------|
| `src/lib/colors.ts` | 01 |
| `tailwind.config.js` | 01, 02 |
| `app/_layout.tsx` | 02 |
| `app/modal.tsx` | 01, 05 |
| `app/(tabs)/_layout.tsx` | 03 |
| `app/(tabs)/index.tsx` | 02, 04 |
| `app/(tabs)/ai.tsx` | 02, 04 |
| `app/(tabs)/approvals.tsx` | 02, 04 |
| `app/(tabs)/overview.tsx` | 04 |
| `src/components/AnimatedPressable.tsx` | 03 (new) |
| `src/components/PanelGradient.tsx` | 05 |
| `src/components/FadeInScreen.tsx` | 03 |
| `components/haptic-tab.tsx` | 03 |
| `src/hooks/useStaggeredEntry.ts` | 04 (new) |
| `src/components/TrendSparkline.tsx` | 07 |
| `src/components/WeeklyBarChart.tsx` | 07 |

---

## Changelog

- 2026-03-15: Research complete. 5 specs decomposed.
- 2026-03-15: [01-design-tokens](specs/01-design-tokens/spec.md) — **COMPLETE**. Palette v1.1 (eggplant), goldBright token added, cyan updated, tailwind synced, modal Switch/background violations tokenized. 29 tests passing.
- 2026-03-15: [02-typography](specs/02-typography/spec.md) — **COMPLETE**. Inter-only font system (drop SpaceGrotesk + PlusJakartaSans), display/body aliases remapped, Inter_800ExtraBold added, tabular-nums on 5 metric components, 7 class violations fixed. 17 tests passing.
- 2026-03-15: [05-panel-glass-surfaces](specs/05-panel-glass-surfaces/spec.md) — **COMPLETE**. SVG RadialGradient (cx=50% cy=30%) replaces LinearGradient, getGlowStyle coloured shadows (iOS) + elevation fallback (Android), BlurView modal (intensity=30), NoiseOverlay (opacity:0.04). 61 tests passing.
- 2026-03-15: [03-touch-and-navigation](specs/03-touch-and-navigation/spec.md) — **COMPLETE**. AnimatedPressable (timingInstant+springSnappy), FadeInScreen translateY spring entrance, HapticTab scale pulse, ApprovalCard/modal button migration. 71 tests passing.
- 2026-03-15: [04-card-entry-animations](specs/04-card-entry-animations/spec.md) — **COMPLETE**. useStaggeredEntry hook (springBouncy, 50ms stagger, maxStaggerIndex cap, reduceMotion safety), wired to all 4 tab screens. 65 tests passing.
- 2026-03-16: [06-wiring-and-tokens](specs/06-wiring-and-tokens/spec.md) — **COMPLETE**. NoiseOverlay wired to tabs layout, tab bar tokens (surface/border), toggle gold→violet, MetricValue 800wt+letterSpacing, loading screen token cleanup. 39 tests passing.
- 2026-03-16: [07-chart-line-polish](specs/07-chart-line-polish/spec.md) — **COMPLETE**. Sci-fi holographic chart lines: TrendSparkline 2.5px + BlurMaskFilter glow (blur=8, solid, 25% alpha), WeeklyBarChart today-bar ambient glow (blur=12, normal, 19% alpha). 15 new tests passing.
