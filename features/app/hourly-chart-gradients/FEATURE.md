# Feature: Hourly Chart Gradient Migration

## Goal

Migrate `HourlyPatternCard` bar rendering from flat React Native `View` fills to Skia `Canvas` + `RoundedRect` + `LinearGradient`, matching the visual language of `DayPatternChart` and `WeeklyBarChart` and satisfying BRAND_GUIDELINES.md §5.2.

## Problem

The hourly histogram bars currently use plain `View` with `backgroundColor` (a flat hex from `_barColor()`). Every other chart in the app uses vertical Skia `LinearGradient` — neon color at peak fading to `transparent` at base. This makes `HourlyPatternCard` look flat and inconsistent in the running app.

## Success Criteria

1. Each hourly bar is rendered as a Skia `RoundedRect` with `LinearGradient` (`_barColor(aiRate)` → `'transparent'`), matching the gradient spec in BRAND_GUIDELINES.md §5.2.
2. Bar corners are `r=4` (matching `DayPatternChart` and `WeeklyBarChart`; currently `borderRadius: 2`).
3. Bars animate in with a left-to-right clip reveal on mount using `timingChartFill` (600ms expo ease-out), matching `WeeklyBarChart`.
4. Focus window and AI hot zone overlays continue to render correctly above the Canvas layer.
5. All 43 existing `HourlyPatternCard` tests still pass.

## Out of Scope

- Changes to `_barColor()` or the color palette (colors are correct; only the rendering pipeline changes)
- Changes to the overlay logic (focus/AI Views stay as-is)
- Changes to summary rows, axis labels, or separator
- Any other component

## Decomposition

| Spec | Description | Blocks | Blocked By | Complexity |
|------|-------------|--------|------------|------------|
| 01-skia-gradient-bars | Replace View bars with Canvas+RoundedRect+LinearGradient; add timingChartFill entry animation; update tests | — | — | S |

## Changelog

- `01-skia-gradient-bars` — pending
