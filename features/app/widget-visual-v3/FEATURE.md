# Feature: Widget Visual Polish v3

## Goal

Apply four targeted visual corrections to the iOS widget so it matches the premium dark-glass aesthetic of the main app. The widget-visual-v2 feature established the structural foundation (WidgetBackground, IosGlassCard, MAX_BAR_HEIGHT, font weights); this feature refines the specific values and fixes bugs discovered after seeing the widget running in the simulator.

## Background

After building widget-visual-v2, the simulator revealed several gaps between the widget and the app's main screen:
- **WidgetBackground** uses two off-center circles (top-right + bottom-left) creating a "weird circles" effect instead of the app's single top-center header glow.
- **IosGlassCard** fill is 80% opacity (`#1C1E26CC`) and the border is 10% white (`#FFFFFF1A`), both too subtle — the card blends into the background instead of feeling like a distinct glass surface.
- **StatusPill** uses `RoundedRectangle` with cornerRadius=10, not the `Capsule()` shape used in the app's own badge components.
- **IosBarChart** bars use a 3pt corner radius; the app uses 6pt for a softer look.
- A **"left left" string bug** exists in bridge.ts where `hoursRemaining` (already formatted as "7.5h left") has " left" appended again.
- The **LargeWidget P3 layout** needs typography standardization and the remaining text repositioned directly under the primary hours metric.

## Scope

### In Scope

- `WidgetBackground`: single Circle() top-center, 250×200pt (wide elliptical glow), 0.15 opacity, 60pt blur, accent color; remove two-circle layout
- `IosGlassCard`: fill `#1C1E26BF` (75%), stroke `#FFFFFF26` (15% white), remove `borderColor` prop
- `StatusPill`: replace `RoundedRectangle` with `Capsule()`, 1pt accent stroke, 10% accent fill
- `IosBarChart`: corner radius 3 → 6
- bridge.ts line 812: remove `+ ' left'` suffix (hoursRemaining already contains "left")
- LargeWidget P3: standardize font weights (bold primary, medium labels), reposition remaining text under hours metric
- Test updates for all changed assertions

### Out of Scope

- P1 (approvals) or P2 (deficit) layout changes
- SmallWidget or MediumWidget changes
- Android widget visual changes
- Animation or blur rendering fidelity (platform-dependent)

## Architecture

All changes are in two files:

```
src/widgets/ios/HourglassWidget.tsx
  ├─ WidgetBackground   — spec 01
  ├─ IosGlassCard       — spec 02
  ├─ LargeWidget P3     — spec 03 (typography + layout)
  ├─ StatusPill         — spec 04
  └─ IosBarChart        — spec 04

src/widgets/bridge.ts
  └─ line 812 "left left" bug  — spec 03
```

## Spec Units

| Spec | Description | Blocks | Blocked By | Complexity |
|------|-------------|--------|------------|------------|
| 01-atmospheric-background | Replace multi-circle WidgetBackground with single top-center glow | — | — | S |
| 02-glass-card | Refactor IosGlassCard opacity + specular edge, remove borderColor prop | — | — | S |
| 03-typography-layout | Fix "left left" bug in bridge.ts, standardize LargeWidget P3 fonts, reposition remaining text | — | — | M |
| 04-pill-chart | StatusPill → Capsule, IosBarChart cornerRadius 3→6 | — | — | S |

All four specs are independent and can run in parallel.

## Files Modified

| File | Spec | Change |
|------|------|--------|
| `src/widgets/ios/HourglassWidget.tsx` | 01 | WidgetBackground single-circle |
| `src/widgets/ios/HourglassWidget.tsx` | 02 | IosGlassCard fill/stroke/prop |
| `src/widgets/ios/HourglassWidget.tsx` | 03 | LargeWidget P3 typography + layout |
| `src/widgets/bridge.ts` | 03 | Remove `+ ' left'` suffix at line 812 |
| `src/widgets/ios/HourglassWidget.tsx` | 04 | StatusPill Capsule + IosBarChart radius |

## Success Criteria

- [ ] WidgetBackground renders single Circle top-center (width=250, height=200, 0.15 opacity, 60pt blur); no second circle
- [ ] IosGlassCard fill is `#1C1E26BF`; stroke is `#FFFFFF26` 0.5pt; no `borderColor` prop
- [ ] StatusPill uses `Capsule` shape with 1pt accent stroke and `accent+'1A'` fill
- [ ] IosBarChart bar corner radius is 6
- [ ] bridge.ts: `hoursRemaining + ' left'` removed; uses `hoursRemaining` directly
- [ ] LargeWidget P3: primary metric uses bold, labels use medium; remaining text positioned under hours card
- [ ] All existing widget tests still pass; updated assertions match new values

## Changelog

| Date | Spec | Description |
|------|------|-------------|
| 2026-04-02 | [01-atmospheric-background](specs/01-atmospheric-background/spec.md) | Complete: Replace two-circle WidgetBackground with single top-center elliptical glow (250×200, blur=60) |
| 2026-04-02 | [02-glass-card](specs/02-glass-card/spec.md) | Spec: IosGlassCard fill 75%, specular edge 15%, remove borderColor prop |
| 2026-04-02 | [03-typography-layout](specs/03-typography-layout/spec.md) | Complete: Fix "left left" bridge bug, LargeWidget P3 layout restructure (hero cards, footer simplified), uniform padding=16 |
| 2026-04-02 | [04-pill-chart](specs/04-pill-chart/spec.md) | Complete: StatusPill Capsule shape, IosBarChart cornerRadius 3→6, update widgetVisualIos mock |
