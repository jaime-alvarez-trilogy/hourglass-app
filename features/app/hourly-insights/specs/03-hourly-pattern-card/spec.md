# 03-hourly-pattern-card

**Status:** Draft
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Owner:** @jaime-alvarez-trilogy

---

## Overview

`HourlyPatternCard` is a purely presentational React Native component that renders a 24-bar histogram visualizing the user's hourly work profile. It takes already-computed props from `useHourlyInsights()` and produces a Card-wrapped bar chart with two text summary rows.

### What is being built

A single file: `src/components/HourlyPatternCard.tsx`.

The component answers three visual questions at a glance:
1. **Work distribution** — bar height shows when the user actually works (proportional to `avgSlots[h]`, normalized to peak)
2. **AI usage timing** — bar fill color encodes AI rate via a two-stop interpolation: `colors.surface` (0%) → `colors.cyan` (50%) → `colors.violet` (100%)
3. **Focus peak** — a `colors.gold` at 15% opacity translucent overlay highlights the focus window region

### How it is structured

The component clips bars to `profile.activeWindow` so only active-day hours are shown (no long row of empty bars). It uses a `width` prop measured by the parent (same pattern as `DayPatternChart`) to calculate bar widths from available layout space.

Three internal helpers are defined in-file:
- `lerpColor(from, to, t)` — hex-to-hex linear interpolation
- `barColor(aiRate)` — maps AI rate [0..1] to interpolated color via two-stop gradient
- Rendering logic clips h to `[activeWindow[0], activeWindow[1]]`

Below the bars, two invariant text rows display the focus peak and AI peak summaries. Both rows always render — when the respective window/zone is null, the value column shows "—".

### How it fits into the feature

- **Depends on:** spec 02 (`src/lib/hourlyInsights.ts` and `src/hooks/useHourlyInsights.ts`)
- **Used by:** spec 04 (`app/(tabs)/overview.tsx`) which will pass `useHourlyInsights()` results as props
- **Visual language:** follows DayPatternChart (bar layout, width measurement) and InsightChip (Card wrapper, text row conventions)

---

## Out of Scope

1. **Integration into `overview.tsx`** — **Deferred to 04-overview-integration.** Wiring `HourlyPatternCard` + `useHourlyInsights()` into the Overview tab, stagger index management, and `profile !== null` guard are all owned by spec 04.

2. **Animated bar entrance** — **Descoped.** Staggered entry animations (like `useStaggeredEntry`) are a polish layer that can be added after the card ships. Excluding now avoids scope creep and keeps the component pure/testable without Reanimated mocks.

3. **Interactive bar tap / tooltip** — **Descoped.** Bars are static display only. A future spec can add `onPress` gesture + `HourlyDetailModal`. Not required for the Patterns card MVP.

4. **Scrub gesture linkage** — **Descoped.** The bars do not synchronize with any chart scrub state. They display a single averaged view across weeks.

5. **AI hot zone overlay when overlapping focus window** — **Descoped (overlap suppression).** Per research decision 5: the AI hot zone overlay is suppressed when it overlaps the focus window (focus takes priority). The AI zone overlay only renders when `aiHotZone.hotRange` is entirely outside `focusWindow.peakRange`.

---

## Functional Requirements

### FR1 — Color interpolation helpers (`lerpColor` + `barColor`)

Internal helper functions within `HourlyPatternCard.tsx` that map an AI rate fraction to a display hex color. Exported with `_` prefix for direct unit testing.

**`lerpColor(from: string, to: string, t: number): string`**
- `from` and `to` are `"#RRGGBB"` hex strings
- `t` is clamped to `[0, 1]`
- Returns `"#RRGGBB"` linearly interpolated between `from` and `to`
- Uses integer math: parse hex pairs, interpolate each R/G/B component, re-encode

**`barColor(aiRate: number): string`**
- `aiRate` NaN → returns `colors.surface` (no data = muted fill)
- `aiRate` 0 → returns `colors.surface`
- `aiRate` 0.5 → returns `colors.cyan`
- `aiRate` 1.0 → returns `colors.violet`
- Two-segment: `t < 0.5` → `lerpColor(colors.surface, colors.cyan, t * 2)`; `t >= 0.5` → `lerpColor(colors.cyan, colors.violet, (t - 0.5) * 2)`

**Success Criteria:**
- `barColor(0)` === `colors.surface`
- `barColor(0.5)` === `colors.cyan`
- `barColor(1.0)` === `colors.violet`
- `barColor(NaN)` === `colors.surface`
- `barColor(0.25)` produces a color between `colors.surface` and `colors.cyan` (not equal to either)
- `lerpColor` is pure — same inputs always produce same output

---

### FR2 — Bar rendering (histogram within active window)

The component renders exactly `activeWindow[1] - activeWindow[0] + 1` bars, one per hour in the active window.

**Bar layout:**
- Total width = `props.width`; each bar occupies `width / barCount` column
- Bar width = `columnWidth * BAR_W_RATIO` (0.65, matching DayPatternChart convention)
- Bar height proportional: `(avgSlots[h] / peakSlots) * barAreaHeight`, clamped to minimum 2px
- `peakSlots = Math.max(...avgSlots.slice(lo, hi + 1), 1)` (normalizes within active window)
- Zero-slot hours inside the active window still render a 2px-tall tick bar

**Bar fill:**
- Each bar's `backgroundColor` = `barColor(profile.avgAIRate[h])`
- NaN AI rate (no slot data for that hour) → `colors.surface`

**Guard:** `if (width === 0) return null` — prevents divide-by-zero before layout resolves.

**Success Criteria:**
- Renders exactly `(activeWindow[1] - activeWindow[0] + 1)` bar Views
- Bar for peak-slot hour has the maximum height among all bars
- Bar heights are proportional to `avgSlots` values
- Minimum bar height is 2px (hours with 0 slots render a 2px tick)
- Bar fill for `avgAIRate=0.9` is more violet than bar fill for `avgAIRate=0.6`
- `width=0` returns `null` without crashing

---

### FR3 — Focus window and AI zone overlays

A translucent overlay spans the columns corresponding to `focusWindow.peakRange` (gold) and optionally `aiHotZone.hotRange` (violet), positioned absolutely over the bar area.

**Focus overlay:**
- Absolutely positioned `View` over the bar area
- Left offset: `(focusWindow.peakRange[0] - activeWindow[0]) * columnWidth`
- Width: `(peakRange[1] - peakRange[0] + 1) * columnWidth`
- Height: full `barAreaHeight`
- `backgroundColor`: `colors.gold` at 15% opacity (use `rgba` string or `opacity` style)
- `pointerEvents="none"` so it does not block interactions

**AI hot zone overlay:**
- Only rendered when `aiHotZone !== null` AND its `hotRange` does NOT overlap `focusWindow.peakRange`
- Uses `colors.violet` at 15% opacity with same absolute positioning logic
- Overlap detection: `aiHotZone.hotRange[0] <= focusWindow.peakRange[1] && aiHotZone.hotRange[1] >= focusWindow.peakRange[0]` → suppress AI overlay
- When `focusWindow === null`, the AI overlay renders unconditionally if `aiHotZone !== null`

**Null cases:**
- `focusWindow === null` → no focus overlay rendered
- `aiHotZone === null` → no AI overlay rendered

**Success Criteria:**
- Focus overlay `View` is present when `focusWindow !== null`
- Focus overlay spans exactly the focus window columns
- AI overlay `View` is absent when `aiHotZone.hotRange` overlaps `focusWindow.peakRange`
- No overlay rendered when both are null
- `focusWindow=null, aiHotZone≠null` → only AI overlay rendered

---

### FR4 — Text summary rows

Two invariant text rows below the bar area, always rendered regardless of null state.

**Row 1 — Focus Peak:**
- Label: `"FOCUS PEAK"` — `colors.textMuted`, 11px
- Value when `focusWindow !== null`: `"{formatHour(start)}–{formatHour(end)} (avg {Math.round(peakIntensity)} intensity)"`
- Value when `focusWindow === null`: `"—"`

**Row 2 — AI Peak:**
- Label: `"AI PEAK"` — `colors.textMuted`, 11px
- Value when `aiHotZone !== null`: `"{formatHour(start)}–{formatHour(end)} ({Math.round(aiRate * 100)}%)"`
- Value when `aiHotZone === null`: `"—"`

**Success Criteria:**
- Both `"FOCUS PEAK"` and `"AI PEAK"` labels always present in render tree
- Focus Peak value row shows formatted range + intensity when `focusWindow !== null`
- Focus Peak value shows `"—"` when `focusWindow === null`
- AI Peak value row shows formatted range + percentage when `aiHotZone !== null`
- AI Peak value shows `"—"` when `aiHotZone === null`
- `formatHour` from `src/lib/hourlyInsights.ts` is used (not a local re-implementation)

---

## Technical Design

### Files to Reference

| File | Why |
|---|---|
| `src/components/DayPatternChart.tsx` | Bar width calculation, `BAR_W_RATIO`, `width=0` guard, `StyleSheet` layout |
| `src/components/InsightChip.tsx` | Card wrapper + row layout text convention |
| `src/components/Card.tsx` | `Card` component interface — children, glass, borderAccentColor props |
| `src/lib/colors.ts` | `colors.surface`, `.cyan`, `.violet`, `.gold`, `.text`, `.textMuted`, `.textSecondary` |
| `src/lib/hourlyInsights.ts` | `HourlyProfile`, `FocusWindow`, `AIHotZone`, `formatHour` |
| `src/components/__tests__/DayPatternChart.test.tsx` | Test pattern reference for pure View-based chart tests |

### Files to Create

| File | Description |
|---|---|
| `src/components/HourlyPatternCard.tsx` | New component — the single output of this spec |
| `src/components/__tests__/HourlyPatternCard.test.tsx` | Component tests covering FR1–FR4 |

### Files to Modify

None. All FRs are self-contained in the new component file. Spec 04 will modify `overview.tsx`.

### Data Flow

```
Parent (overview.tsx — spec 04)
  → useHourlyInsights() → { profile, focusWindow, aiHotZone }
  → onLayout → width (measured)
  → <HourlyPatternCard profile={...} focusWindow={...} aiHotZone={...} width={width} />

HourlyPatternCard (this spec)
  → clips hours to activeWindow
  → normalizes bar heights to peakSlots
  → calls barColor(avgAIRate[h]) per bar
  → positions focus/AI overlays via absolute left/width math
  → formats summary rows via formatHour()
  → pure render → JSX
```

### Component Interface

```typescript
import type { HourlyProfile, FocusWindow, AIHotZone } from '@/src/lib/hourlyInsights';

export interface HourlyPatternCardProps {
  profile: HourlyProfile;
  focusWindow: FocusWindow | null;
  aiHotZone: AIHotZone | null;
  width: number;           // measured by parent via onLayout
  height?: number;         // bar area height; default 72
}

// Internal helpers exported for test access
export function _lerpColor(from: string, to: string, t: number): string;
export function _barColor(aiRate: number): string;

export function HourlyPatternCard(props: HourlyPatternCardProps): React.JSX.Element | null;
export default HourlyPatternCard;
```

### Hex Color Interpolation

```typescript
export function _lerpColor(from: string, to: string, t: number): string {
  const tc = Math.max(0, Math.min(1, t));
  const r1 = parseInt(from.slice(1, 3), 16);
  const g1 = parseInt(from.slice(3, 5), 16);
  const b1 = parseInt(from.slice(5, 7), 16);
  const r2 = parseInt(to.slice(1, 3), 16);
  const g2 = parseInt(to.slice(3, 5), 16);
  const b2 = parseInt(to.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * tc).toString(16).padStart(2, '0');
  const g = Math.round(g1 + (g2 - g1) * tc).toString(16).padStart(2, '0');
  const b = Math.round(b1 + (b2 - b1) * tc).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}
```

### Overlay Overlap Detection

```typescript
const focusOverlapsAI =
  focusWindow !== null &&
  aiHotZone !== null &&
  aiHotZone.hotRange[0] <= focusWindow.peakRange[1] &&
  aiHotZone.hotRange[1] >= focusWindow.peakRange[0];
```

### Edge Cases

| Case | Handling |
|---|---|
| `width === 0` | Return `null` — no bars, no divide-by-zero |
| `focusWindow === null` | No gold overlay; Focus Peak row shows "—" |
| `aiHotZone === null` | No violet overlay; AI Peak row shows "—" |
| AI zone overlaps focus zone | AI overlay suppressed; focus overlay shown |
| `avgAIRate[h]` is NaN | `barColor(NaN)` → `colors.surface` |
| All `avgSlots` in window are 0 | `peakSlots = Math.max(..., 1)` guards divide; all bars render 2px ticks |
| `focusWindow.peakRange` at boundary of `activeWindow` | Column index math uses `h - lo` offset, always in `[0, barCount-1]` |
| Single-bar active window | `barCount = 1`, `colW = width`, renders correctly |

### Test Architecture

Tests use `@testing-library/react-native` with `render()`. Pure View-based component — no `@shopify/react-native-skia` dependency and no native module mocks needed beyond the standard `AsyncStorage` mock.

The `_lerpColor` and `_barColor` helpers are exported with `_` prefix for direct unit testing. Component tests verify bar count, overlay presence, and text row content via `getAllByTestId` / `getByText`.
