# Spec Research: 07-chart-line-polish

**Feature:** features/app/brand-polish
**Source:** UX Gauntlet Run #002 synthesis — 2026-03-16

---

## Problem Context

Gauntlet synthesis identified chart line quality as a quick win for sci-fi aesthetic:

> "Chart line thickness 3px + shadowColor glow" (🟢 Polish)
> "Chart line glows via shadowColor = holographic data visualisation"

Currently:
- `TrendSparkline` draws a 2px line (default `strokeWidth = 2`, line 142 of TrendSparkline.tsx)
- No glow/blur effect on chart lines — flat 2D line on dark background
- `WeeklyBarChart` today-bar is highlighted with gold/overtime color but no ambient glow

The brand guidelines describe charts as holographic data visualisation. A 1.5px flat line
on a dark background reads as wireframe. A 2.5px line with a soft coloured glow reads as
a glowing energy conduit — the sci-fi feel the gauntlet says is missing.

---

## Exploration Findings

### TrendSparkline (src/components/TrendSparkline.tsx)

The sparkline draws using Skia `<Path>` with a `<Paint>`. Current line rendering:

```tsx
// Likely current pattern (verify in file):
<Path
  path={linePath}
  color={color}
  style="stroke"
  strokeWidth={1.5}
  strokeCap="round"
/>
```

**Skia glow technique:** Add a second Paint layer with `BlendMode.Overlay` or use a
`MaskFilter` (blur) to create a soft glow. The most compatible approach for Expo Skia is:

```tsx
// Approach 1: Two Paths — fat blurred + crisp on top
// Blurred underline (glow halo):
<Path path={linePath} color={colorWithAlpha(color, 0.3)} style="stroke"
  strokeWidth={8} strokeCap="round">
  <BlurMaskFilter blur={6} style="solid" />
</Path>
// Crisp topline:
<Path path={linePath} color={color} style="stroke"
  strokeWidth={2} strokeCap="round" />

// Approach 2: Single Path with Paint + BlurMaskFilter
<Path path={linePath} color={color} style="stroke" strokeWidth={2} strokeCap="round">
  <Paint color={colorWithAlpha(color, 0.25)} style="stroke" strokeWidth={10}>
    <BlurMaskFilter blur={8} style="solid" />
  </Paint>
</Path>
```

Approach 2 is cleaner — one `<Path>` with a child `<Paint>` adds the blur layer.
`BlurMaskFilter` from `@shopify/react-native-skia` is available (package already installed).

**`colorWithAlpha` helper:** Skia accepts hex colors. Need a function to add alpha to a hex
color string, e.g. `#00C2FF` → `#00C2FF40`. Utility: `color + alphaHex(opacity)`.

### WeeklyBarChart (src/components/WeeklyBarChart.tsx)

**Today bar** is currently highlighted differently (usually `color.gold` or overtime color).
A subtle glow on the today bar would provide depth. Approach: same BlurMaskFilter technique
applied to the rounded bar rect for the `isToday` bar.

However: `WeeklyBarChart` renders many bars in a loop. Adding per-bar blur may have
performance implications on older devices. Approach: only blur the today bar (1 of 7 bars).

### AIConeChart

AIConeChart already has sophisticated rendering (actualPoints, coneShading, hourlyPoints).
The trajectory line (actualPoints path) could benefit from glow. However, AIConeChart has
complex state (animated drawing, scrub interaction) — modifying its render path carries
risk of regression. **AIConeChart glow is out of scope for the brand-polish feature.**
This can be revisited in a dedicated chart interaction polish feature if warranted.

### Skia API available

Package: `@shopify/react-native-skia: ^2.2.12` — fully installed.

Available imports:
```tsx
import { BlurMaskFilter } from '@shopify/react-native-skia';
```

`BlurMaskFilter` accepts `blur: number` (radius) and `style: "solid" | "normal" | "outer" | "inner"`.
`"solid"` = glow that fills the shape area fully (best for lines).
`"normal"` = glow that fades toward edges (softer).

---

## Key Decisions

**Glow opacity for TrendSparkline?**
→ Glow paint at 25–30% alpha, blur radius 6–8px. Line at full color, 2px strokeWidth.
Keep glow subtle — enhances depth without drawing attention away from data.

**Should glow be the same color as the line?**
→ Yes. The line color is semantically meaningful (gold = earnings, green = hours, cyan = AI%, violet = BrainLift). The glow should match so the ambient light reinforces the semantic color. Same color, reduced alpha.

**WeeklyBarChart today-bar glow — include or defer?**
→ Include as FR2. It's a 1-of-7 element, no loop performance concern. The today bar is the most important visual anchor in the chart.

**strokeWidth: 2 → 2.5?**
→ Yes. Current default is already 2 (explicit, not Skia default). 2.5px adds subtle weight that reads as intentional "energy conduit" line. 3px is too heavy on the small sparkline height (52px). 2.5px strikes the balance — noticeable upgrade from 2, not overblown.

---

## Interface Contracts

### FR1: TrendSparkline line glow

**File:** `src/components/TrendSparkline.tsx`

Add `BlurMaskFilter` import. Modify the line `<Path>` to include a glow `<Paint>` child:

```tsx
// Before (current — TrendSparkline.tsx line 319-324):
<Path path={linePath} color={lineColor} style="stroke" strokeWidth={2} strokeCap="round" />

// After:
<Path path={linePath} color={lineColor} style="stroke" strokeWidth={2.5} strokeCap="round">
  <Paint color={lineColor + '40'} style="stroke" strokeWidth={10} strokeCap="round">
    <BlurMaskFilter blur={8} style="solid" />
  </Paint>
</Path>
```

Where `lineColor + '40'` is the hex color with ~25% alpha appended (hex alpha `40` = 64/255 ≈ 25%).
The `color` prop on `<Path>` is the line; the child `<Paint>` is an additional layer.

**Helper function:** Add internal `hexAlpha(hex: string, opacity: number): string`
that returns `hex + twoDigitHex(opacity * 255)`.

**Parameters unchanged:** All external props (`data`, `color`, `width`, `height`, etc.) stay the same. This is purely a rendering change.

### FR2: WeeklyBarChart today-bar glow

**File:** `src/components/WeeklyBarChart.tsx`

The actual bar element is `<Rect>` (imported from `@shopify/react-native-skia`, line 14).
Current today-bar render at line 128:

```tsx
// Before (current):
<Rect x={x} y={dataBarY} width={barWidth} height={animatedBarHeight} color={barColor} />
```

For the `isToday` bar only, add a `BlurMaskFilter` Paint child. `<Rect>` in `@shopify/react-native-skia`
accepts `<Paint>` children (same as `Path`, `Circle`, etc. — all drawing primitives support child paints).

```tsx
// After (for isToday bar — schematic):
<Rect x={x} y={dataBarY} width={barWidth} height={animatedBarHeight} color={barColor}>
  {isToday && (
    <Paint color={barColor + '30'} style="fill">
      <BlurMaskFilter blur={12} style="normal" />
    </Paint>
  )}
</Rect>
```

`"normal"` style BlurMaskFilter spreads outward from the bar edge — ambient glow.

**Note:** `barColor` for `isToday` is `colors.gold` (line 111 in current code). The glow
should use the same color with reduced alpha (`+ '30'` = ~19% alpha).

**Conditional rendering:** Only applies to the `isToday` bar (1 of 7). No loop-level performance concern.

**Note on non-today bars:** The `<Rect>` element for non-today bars does not need
`{isToday && ...}` conditional inside — the conditional is inside the bar render block
that already branches on `isToday`.

---

## Test Plan

### FR1: TrendSparkline line glow

**Target:** `src/components/TrendSparkline.tsx`

**Happy Path:**
- [ ] BlurMaskFilter imported from `@shopify/react-native-skia`
- [ ] Path strokeWidth is 2.5 (not 1.5)
- [ ] Path children include a Paint element with BlurMaskFilter
- [ ] Glow Paint strokeWidth is larger than line strokeWidth (halo > line)
- [ ] Glow color is derived from the line `color` prop + alpha suffix

**Edge Cases:**
- [ ] When `data` array is empty, no crash (line path empty, no glow rendered)
- [ ] When `width=0` (before layout), no crash
- [ ] Guide line (if showGuide=true) is NOT affected — only the data line gets glow

**Regression:**
- [ ] Scrub gesture (externalCursorIndex) still works after render changes
- [ ] All existing TrendSparkline tests still pass

**Mocks needed:** Skia mocked (already mocked in test setup via jest setup file)

### FR2: WeeklyBarChart today-bar glow

**Target:** `src/components/WeeklyBarChart.tsx`

**Happy Path:**
- [ ] Bars where `isToday=true` render a BlurMaskFilter Paint child
- [ ] Bars where `isToday=false` do NOT render any BlurMaskFilter
- [ ] BlurMaskFilter blur value is >= 8 (visible glow)
- [ ] Glow color is derived from bar color with reduced alpha

**Edge Cases:**
- [ ] Chart with no `isToday` bar (weekend, future week) renders without crash
- [ ] Overflow bars (overtime > limit) render correctly with glow

**Regression:**
- [ ] All existing WeeklyBarChart tests still pass
- [ ] Chart animation (timingChartFill on bar heights) still works

---

## Files to Reference

| File | Purpose |
|------|---------|
| `src/components/TrendSparkline.tsx` | Primary target — line glow implementation |
| `src/components/WeeklyBarChart.tsx` | Today-bar glow — FR2 |
| `src/components/AIConeChart.tsx` | Reference for Skia Paint patterns (read-only) |
| `BRAND_GUIDELINES.md` | §Animation Philosophy: "Chart line glows via shadowColor = holographic" |

## Skia API Reference

```tsx
import { BlurMaskFilter } from '@shopify/react-native-skia';
// Usage inside any drawing primitive (Path, Rect, Circle, RoundedRect, etc.):
<Paint color="rgba(0,194,255,0.25)" style="stroke" strokeWidth={10}>
  <BlurMaskFilter blur={8} style="solid" />
</Paint>
```

**Paint children in `@shopify/react-native-skia`:** ALL drawing primitives — including `<Path>`,
`<Rect>`, `<RoundedRect>`, `<Circle>` — accept `<Paint>` children. Child paints are composited
as additional draw layers on the same element. This is a core Skia API feature, confirmed for
both `<Path>` (FR1) and `<Rect>` (FR2).

Multiple paints are composited in order: the child `<Paint>` with BlurMaskFilter adds a
blurred halo layer on top of/around the parent element's default paint. The parent element
uses its `color` prop as the base paint; child `<Paint>` elements add supplemental layers.

For a glow effect:
- Parent element: crisp fill/stroke at full color (e.g. `color={lineColor}`)
- Child `<Paint>`: blurred halo at reduced alpha (e.g. `color={lineColor + '40'}`, large strokeWidth, BlurMaskFilter)
