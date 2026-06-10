# 03-hourly-pattern-card — Spec Research

**Feature:** Hourly Insights
**Spec:** 03-hourly-pattern-card
**Date:** 2026-06-10
**Status:** Research complete

---

## Problem Context

Spec 02 provides `HourlyProfile`, `FocusWindow`, and `AIHotZone`. This spec
renders them as a 24-bar histogram card — the "Patterns" visual on the Overview tab.

The card answers three visual questions simultaneously:
1. **Work distribution** — bar height shows when the user is actually working (slot density)
2. **AI usage timing** — bar fill color encodes AI rate (muted → cyan → violet)
3. **Focus peak** — translucent overlay marks the peak-intensity block

The component takes fully-computed props (no hooks, no AsyncStorage) so it is
purely presentational and straightforward to test.

---

## Exploration Findings

### `DayPatternChart` pattern (reference — `src/components/DayPatternChart.tsx`)

```typescript
interface Props {
  current: number[];    // 7-element bar heights
  prev: number[];       // 7-element comparison
  width: number;        // from onLayout
  height: number;
}
```

Uses `View` with `StyleSheet.absoluteFillObject` overlays, no SVG dependency.
Bar widths calculated as `barWidth = (width - totalGapWidth) / barCount`.
This is the established bar-chart pattern to follow.

### `InsightChip` pattern (`src/components/InsightChip.tsx`)

Uses `Card` + nested `View` rows. The new card also uses `Card` wrapper per
DayPatternChart precedent.

### Color system (`src/lib/colors.ts`)

Confirmed tokens used for interpolation:
- `colors.surface` — background / zero-AI bar fill (dark glass)
- `colors.cyan` — primary AI accent (matches AI% chart)
- `colors.violet` — high-AI accent (matches BrainLift chart)
- `colors.gold` — focus window highlight (translucent overlay)
- `colors.text` — primary text
- `colors.textMuted` — secondary/label text
- `colors.textSecondary` — tertiary annotation

### `Card` component (`src/components/Card.tsx`)

Accepts `children`. No special bar-chart support needed — card is just the wrapper.

### Width measurement pattern

`DayPatternChart` in overview.tsx uses:
```typescript
const [patternCardWidth, setPatternCardWidth] = useState(0);
// ...
<View onLayout={e => setPatternCardWidth(e.nativeEvent.layout.width)}>
  <DayPatternChart width={patternCardWidth} ... />
</View>
```

`HourlyPatternCard` will use the same `width` prop approach (measured by the parent
in overview.tsx, same as `DayPatternChart`).

### Color interpolation — no library needed

Linear interpolation between two colors is a 1-line helper using
`colors.hex` values parsed as RGB. The existing codebase doesn't use a color
interpolation library — implement inline:

```typescript
function lerpColor(from: string, to: string, t: number): string {
  // t clamped to [0, 1]; hex strings without alpha
}
```

Two-segment interpolation: `t < 0.5` → lerp(surface, cyan, t*2), `t >= 0.5` → lerp(cyan, violet, (t-0.5)*2).

---

## Key Decisions

1. **Props are typed structs from spec 02, not raw arrays.** The component receives
   `HourlyProfile`, `FocusWindow | null`, `AIHotZone | null`. The parent (overview.tsx)
   passes these from `useHourlyInsights()`. This keeps the component pure and testable.

2. **Width prop, measured by parent.** Avoids `onLayout` inside the component, which
   would require an async first render with `width=0` bars. Parent already uses this
   pattern for `DayPatternChart`.

3. **Active window clipping.** Only hours `[activeWindow[0], activeWindow[1]]` are
   rendered. If `activeWindow` spans 8 hours, 8 bars are drawn. This avoids many
   empty bars flanking the visible work block.

4. **Minimum bar height: 2px.** Hours inside the active window with `avgSlots < 0.5`
   (between the threshold and zero) still render a thin 2px tick so the user sees
   "there was something here." Zero-slot hours outside the active window are not
   rendered at all.

5. **Focus window overlay: `colors.gold` at 15% opacity.** Rendered as an absolute
   `View` spanning the focus window bars. `colors.violet` at 15% opacity for AI hot
   zone if different from focus window. When they overlap, only the gold (focus)
   overlay is shown (focus takes priority).

6. **Text summary rows.** Below the bars, two rows:
   - Row 1: "FOCUS PEAK" label + `focusWindow ? "9am–12pm (avg 84 intensity)" : "—"`
   - Row 2: "AI PEAK" label + `aiHotZone ? "10am–11am (82%)" : "—"`
   Both rows always rendered; dash when null, avoids layout shift.

---

## Interface Contracts

### Props (`src/components/HourlyPatternCard.tsx`)

```typescript
import type { HourlyProfile, FocusWindow, AIHotZone } from '../lib/hourlyInsights';

interface Props {
  profile: HourlyProfile;
  focusWindow: FocusWindow | null;
  aiHotZone: AIHotZone | null;
  width: number;           // ← measured by parent via onLayout
  height?: number;         // default 72
}
```

### Render contract

```
Card
  SectionLabel "PATTERNS"
  View (bars container, height=height)
    for each h in [activeWindow[0]..activeWindow[1]]:
      View (bar, height proportional, fill color = lerpColor(surface→cyan→violet, avgAIRate[h]))
    View (focus overlay, absolute, spans focusWindow.peakRange columns)
    View (AI zone overlay, absolute, spans aiHotZone.hotRange columns — only if different from focus)
  View (summary row 1)
    Text "FOCUS PEAK"  (textMuted, 11px)
    Text <value>        (text, 12px)
  View (summary row 2)
    Text "AI PEAK"     (textMuted, 11px)
    Text <value>        (text, 12px)
```

### Color interpolation helper (internal to file)

```typescript
function lerpColor(from: string, to: string, t: number): string
// from, to: "#RRGGBB" hex strings
// t: 0-1 clamped
// Returns "#RRGGBB" interpolated
```

Two-stop gradient function (internal):
```typescript
function barColor(aiRate: number): string
// aiRate NaN → colors.surface
// 0→colors.surface (muted), 0.5→colors.cyan, 1.0→colors.violet
```

---

## Test Plan

### `lerpColor` / `barColor` (unit)

- [ ] `barColor(0)` → equals `colors.surface`
- [ ] `barColor(0.5)` → equals `colors.cyan`
- [ ] `barColor(1.0)` → equals `colors.violet`
- [ ] `barColor(NaN)` → equals `colors.surface`
- [ ] `barColor(0.25)` → interpolated between surface and cyan

### `HourlyPatternCard` render (component test)

**Setup:** mock `HourlyProfile` with `activeWindow=[8,11]`, 4 hours:
- h8: `avgSlots=3, avgIntensity=70, avgAIRate=0.6, avgProductiveRate=0.8`
- h9: `avgSlots=5, avgIntensity=85, avgAIRate=0.8, avgProductiveRate=0.9`
- h10: `avgSlots=4, avgIntensity=75, avgAIRate=0.9, avgProductiveRate=0.85`
- h11: `avgSlots=2, avgIntensity=60, avgAIRate=0.5, avgProductiveRate=0.7`

Focus: `peakRange=[8,10], peakIntensity=77`; AI: `hotRange=[9,10], aiRate=0.85`

- [ ] Renders exactly 4 bars (h8–h11, no bars outside active window)
- [ ] Bar at h9 (peak slots=5) has height >= bar at h11 (slots=2) — proportional
- [ ] Bar at h10 (AI rate 0.9) has a more violet fill than bar at h8 (AI rate 0.6)
- [ ] Focus overlay View spans columns 0-2 (h8-h10 within the 4-bar set)
- [ ] AI overlay View spans columns 1-2 (h9-h10) — does NOT render since overlaps focus
- [ ] "FOCUS PEAK" text present
- [ ] "AI PEAK" text present
- [ ] When `focusWindow=null`: "FOCUS PEAK" row shows "—"
- [ ] When `aiHotZone=null`: "AI PEAK" row shows "—"
- [ ] `width=0` → renders without crash (guard: `if (width === 0) return null`)

**Mocks needed:** standard React Native test renderer; no native modules needed
(pure View-based rendering).

---

## Files to Reference

- `src/components/DayPatternChart.tsx` — bar width calculation + absolute overlay pattern
- `src/components/InsightChip.tsx` — Card wrapper + row layout convention
- `src/lib/colors.ts` — `colors.surface`, `colors.cyan`, `colors.violet`, `colors.gold`, `colors.text`, `colors.textMuted`
- `src/lib/hourlyInsights.ts` — `HourlyProfile`, `FocusWindow`, `AIHotZone`, `formatHour` (spec 02 output)
- `src/components/Card.tsx` — wrapper component

---

## Out of Scope for This Spec

- Integration into `overview.tsx` (spec 04)
- Animated bar entrance (can add after ship; avoid scope creep)
- Interactive tooltip on bar tap (future spec)
- Scrub gesture linkage (bars are static, not synchronized with chart scrub)
