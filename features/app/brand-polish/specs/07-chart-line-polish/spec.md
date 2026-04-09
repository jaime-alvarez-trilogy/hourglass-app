# 07-chart-line-polish

**Status:** Draft
**Created:** 2026-03-16
**Last Updated:** 2026-03-16
**Owner:** @trilogy

---

## Overview

This spec adds holographic glow effects to chart lines and bars using Skia's `BlurMaskFilter` API, advancing the app toward its sci-fi data visualisation aesthetic.

**What is being built:**

Two targeted rendering enhancements to existing Skia chart components:

1. **TrendSparkline line glow (FR1):** The sparkline data line gains a 25% alpha blurred halo layer (`BlurMaskFilter blur=8, style="solid"`) and a slight stroke weight increase from 2px to 2.5px. The glow matches the line's semantic color (gold for earnings, green for hours, cyan for AI%, violet for BrainLift) so the ambient light reinforces meaning.

2. **WeeklyBarChart today-bar glow (FR2):** The today bar — already highlighted in gold — gains a soft ambient glow via a child `<Paint>` with `BlurMaskFilter blur=12, style="normal"` at ~19% alpha. Only the today bar is affected (1 of 7); non-today bars render unchanged.

**How it works:**

Both enhancements use the same Skia child-paint composition technique: a drawing primitive (`<Path>` for FR1, `<Rect>` for FR2) accepts a child `<Paint>` element with a `BlurMaskFilter`. The child paint adds a supplemental blurred layer around/behind the crisp primary element. This is a core Skia API feature available across all drawing primitives.

**Scope:** Pure rendering change. No props, APIs, data flows, or component interfaces change. No new files are created — both FRs modify existing components.

---

## Out of Scope

1. **AIConeChart glow** — **Descoped.** AIConeChart has complex animated state (actualPoints trajectory drawing, scrub interaction, cone shading). Modifying its render path carries regression risk disproportionate to the polish gain. Can be revisited in a future dedicated chart interaction spec if warranted.

2. **WeeklyBarChart non-today bars** — **Descoped.** Glow on all 7 bars would reduce contrast between today and the rest of the week. The today bar is the primary visual anchor; its glow should be unique. Non-today bar glow would also increase per-frame blur operations without brand benefit.

3. **BlurMaskFilter glow on guide lines / axis labels** — **Descoped.** Guide lines and axis labels are decorative scaffolding, not data. Adding glow would blur the grid and reduce readability.

4. **strokeWidth increase on WeeklyBarChart bars** — **Descoped.** Bar width is determined by available canvas width divided by bar count — not a stroke property. Bar fill is already visually prominent. Widening bars is a layout change, not a polish change.

5. **Animated glow (pulse/breathe effect)** — **Descoped.** Animated glow (e.g. breathing intensity) is listed under future brand polish ("AI accent breathing animation") in FEATURE.md out-of-scope. Static glow is the correct first step.

6. **Platform-specific fallback (non-Skia)** — **Descoped.** TrendSparkline and WeeklyBarChart are already Skia-only components. No non-Skia fallback path exists or is needed.

---

## Functional Requirements

### FR1: TrendSparkline line glow

Add a soft coloured glow halo to the TrendSparkline data line using Skia child `<Paint>` with `BlurMaskFilter`.

**Success Criteria:**

- SC1.1: `BlurMaskFilter` is imported from `@shopify/react-native-skia` in `TrendSparkline.tsx`
- SC1.2: The data line `<Path>` has `strokeWidth={2.5}` (increased from 2)
- SC1.3: The data line `<Path>` renders a child `<Paint>` element with a `BlurMaskFilter` child
- SC1.4: The glow `<Paint>` has `blur >= 6` on its `BlurMaskFilter` (visible halo radius)
- SC1.5: The glow `<Paint>` `strokeWidth` is greater than the line `strokeWidth` (halo wider than line)
- SC1.6: The glow `<Paint>` color is the line's `color` prop with a hex alpha suffix (~25% opacity, hex `40`)
- SC1.7: Guide lines (when `showGuide=true`) are NOT given a glow `<Paint>` child — only the data line
- SC1.8: Component renders without crash when `data` is empty or `width=0`
- SC1.9: All existing `TrendSparkline` tests continue to pass
- SC1.10: Scrub gesture (`externalCursorIndex`) behaviour is unchanged

---

### FR2: WeeklyBarChart today-bar glow

Add a soft ambient glow to the `isToday` bar in `WeeklyBarChart` using Skia child `<Paint>` with `BlurMaskFilter`.

**Success Criteria:**

- SC2.1: `BlurMaskFilter` is imported from `@shopify/react-native-skia` in `WeeklyBarChart.tsx`
- SC2.2: The bar `<Rect>` for the `isToday` bar renders a child `<Paint>` with `BlurMaskFilter`
- SC2.3: The glow `BlurMaskFilter` has `blur >= 8` (visible ambient glow)
- SC2.4: The glow `<Paint>` uses `style="fill"` and `BlurMaskFilter style="normal"` (ambient spread)
- SC2.5: The glow `<Paint>` color is `barColor` with a hex alpha suffix (~19% opacity, hex `30`)
- SC2.6: Non-today bar `<Rect>` elements have NO `<Paint>` child with `BlurMaskFilter`
- SC2.7: Chart renders without crash when no bar has `isToday=true` (weekend / future week)
- SC2.8: Overflow bars (overtime exceeding limit) render glow correctly if they are the today bar
- SC2.9: All existing `WeeklyBarChart` tests continue to pass
- SC2.10: Bar height animation (`timingChartFill`) is unaffected by the glow addition

---

## Technical Design

### Files to Modify

| File | Change |
|------|--------|
| `src/components/TrendSparkline.tsx` | Add `BlurMaskFilter` import; change `strokeWidth` 2→2.5; add child `<Paint>` with `BlurMaskFilter` on data line `<Path>` |
| `src/components/WeeklyBarChart.tsx` | Add `BlurMaskFilter` import; add child `<Paint>` with `BlurMaskFilter` inside today bar `<Rect>` |
| `src/components/__tests__/TrendSparkline.test.tsx` | Add FR1 glow tests; existing tests must still pass |
| `src/components/__tests__/WeeklyBarChart.test.tsx` | Add FR2 glow tests; existing tests must still pass |

### Files to Reference (read-only)

| File | Purpose |
|------|---------|
| `src/components/AIConeChart.tsx` | Reference for existing Skia `<Paint>` usage patterns |
| `BRAND_GUIDELINES.md` | §Animation Philosophy: "Chart line glows via shadowColor = holographic" |

### No New Files

Both FRs are modifications to existing components. No new source files or test files are created.

---

### FR1 Technical Detail: TrendSparkline

**Import addition:**
```tsx
import { ..., BlurMaskFilter } from '@shopify/react-native-skia';
// BlurMaskFilter added alongside existing Skia imports (Paint, Path, etc.)
```

**Line Path change — before:**
```tsx
<Path path={linePath} color={lineColor} style="stroke" strokeWidth={2} strokeCap="round" />
```

**Line Path change — after:**
```tsx
<Path path={linePath} color={lineColor} style="stroke" strokeWidth={2.5} strokeCap="round">
  <Paint color={lineColor + '40'} style="stroke" strokeWidth={10} strokeCap="round">
    <BlurMaskFilter blur={8} style="solid" />
  </Paint>
</Path>
```

**Alpha encoding:** `'40'` appended to a 6-character hex string (`#RRGGBB`) yields `#RRGGBB40` — 64/255 ≈ 25% opacity. This is a simple string concatenation; no utility library needed.

**Constraint:** The guide line `<Path>` (rendered when `showGuide=true`, typically a dashed horizontal line) must NOT receive the glow `<Paint>` child. The glow is data-line-only.

---

### FR2 Technical Detail: WeeklyBarChart

**Import addition:**
```tsx
import { ..., BlurMaskFilter } from '@shopify/react-native-skia';
```

**Today bar render — before:**
```tsx
<Rect x={x} y={dataBarY} width={barWidth} height={animatedBarHeight} color={barColor} />
```

**Today bar render — after:**
```tsx
<Rect x={x} y={dataBarY} width={barWidth} height={animatedBarHeight} color={barColor}>
  <Paint color={barColor + '30'} style="fill">
    <BlurMaskFilter blur={12} style="normal" />
  </Paint>
</Rect>
```

**Alpha encoding:** `'30'` appended → 48/255 ≈ 19% opacity.

**Conditional scope:** The `isToday` conditional already exists in the bar rendering loop. The `<Paint>` child is added inside that conditional branch, not to the shared `<Rect>` template. Non-today bars remain self-closing `<Rect>` elements.

**`barColor` for today bar:** `colors.gold` — the glow will appear gold. If bar is overtime (using overtime color), glow will match that color automatically since `barColor` is passed in.

---

### Data Flow

No data flow changes. Both FRs are purely rendering changes:

```
Props in → (unchanged) → Skia canvas render → (glow layer added) → display
```

The component props, hook calls, and data derivation logic are untouched.

---

### Edge Cases

| Scenario | FR1 Handling | FR2 Handling |
|----------|-------------|-------------|
| Empty data | `linePath` is empty/null → `<Path>` renders nothing → no glow drawn | N/A (bar chart always has 7 bars) |
| `width=0` (pre-layout) | Path bounds are zero → no visible output | Canvas zero-width → invisible |
| No `isToday` bar | N/A | Loop produces no bar with `isToday=true` → no `<Paint>` child rendered anywhere |
| Overflow bar (isToday) | N/A | `barColor` is overtime color → glow matches overtime color |
| Non-6-char hex | `lineColor + '40'` appends regardless of format. All colors in this codebase are `#RRGGBB` format. | Same for `barColor` |

---

### Performance

- FR1: One additional Skia layer per sparkline (1 blur per component instance). Sparklines appear once each on the Overview screen. Negligible overhead.
- FR2: One additional Skia layer for the today bar only (1 of 7 bars). Conditional — no blur on non-today bars. Negligible overhead.

---

### Test Strategy

Both FRs are tested in their respective existing test files. Tests use the already-mocked Skia environment (jest setup). Since Skia primitives are mocked as simple React components, tests can assert rendered tree structure:

- Assert `BlurMaskFilter` appears in rendered output
- Assert `strokeWidth` values on `Path` elements
- Assert glow `Paint` color includes hex alpha suffix
- Assert non-glow paths/rects have no `BlurMaskFilter` child

Regression: run full existing test suite after each FR — all prior tests must pass.
