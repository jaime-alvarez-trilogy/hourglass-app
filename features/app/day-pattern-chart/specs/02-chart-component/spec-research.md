# Spec Research: 02-chart-component

## Problem

Need a reusable `DayPatternChart` component that renders 7 vertical bars (Mon–Sun) with optional trend arrows. Used by both Overview (with arrows) and Home (static, no arrows).

## Scope

Component implementation only — no screen wiring. The component is a pure presentational primitive: given arrays of numbers, render bars + optional arrows.

## Interface Contract

```typescript
// src/components/DayPatternChart.tsx

export interface DayPatternChartProps {
  current: number[];          // length 7, Mon=0…Sun=6, avg hours per day
  prev?: number[] | null;     // undefined or null → no arrows rendered
  width: number;              // total component width
  height: number;             // bar area height (excludes day labels below)
  trendThreshold?: number;    // default TREND_THRESHOLD (0.5h) from dayPatternUtils
}
```

Sources:
- `current` ← `DayWindowResult.current` (spec 01) or `WorkPattern.avgDailyHours`
- `prev` ← `DayWindowResult.prev` (spec 01), `undefined` for Home usage
- `width`, `height` ← measured via `onLayout` or passed from parent card
- `trendThreshold` ← default `TREND_THRESHOLD` from `src/lib/dayPatternUtils`

## Visual Design

### Layout (per column)

```
┌──────────────────┐
│   arrow zone     │  ← 20px fixed (↑ floats here for upward trend)
├──────────────────┤
│                  │
│    bar zone      │  ← fills remaining height
│   (from bottom)  │
│                  │
│  ↓ inside here   │  ← ↓ arrow at top of bar for downward trend
│ [███ bar ████ ]  │
├──────────────────┤
│   day label      │  ← 16px fixed (M / T / W / T / F / S / S)
└──────────────────┘
```

### Bar height

```
barZoneHeight = height  (component height prop = bar zone only; labels are additional)
barHeight[i] = (current[i] / maxHours) * barZoneHeight
maxHours = Math.max(...current, 1)  // avoid div-by-zero
```

### Bar colors

| Condition | Bar color |
|-----------|-----------|
| `current[i] >= 0.5h` (work day) | `colors.success` |
| `current[i] < 0.5h` (rest day) | `colors.surface` (2px stub, always visible) |

Rest days show a 2px minimum-height stub so the column isn't invisible.

### Arrow rules

| Condition | Arrow | Position | Color |
|-----------|-------|----------|-------|
| `prev` is null/undefined | none | — | — |
| `current[i] < 0.5` (rest day) | none | — | — |
| `delta >= trendThreshold` | ↑ | above bar (in arrow zone) | `colors.success` |
| `delta <= -trendThreshold` | ↓ | inside bar at top | `colors.warning` |
| `|delta| < trendThreshold` | none | — | — |

Where `delta = current[i] - prev[i]`.

No arrows on rest days even if delta qualifies — rest-day changes are noise.

### Day labels

`['M', 'T', 'W', 'T', 'F', 'S', 'S']`

- Work days: `colors.textSecondary`
- Rest days (`current[i] < 0.5`): `colors.textMuted`

## Implementation Approach

**View-based (not CartesianChart/VNX):** The 7-bar layout with precisely positioned arrows is cleaner as nested Views than as CartesianChart render props. No pan gesture needed (Overview scrubbing stays on TrendSparklines, not this chart). No fill-reveal animation needed (the component itself enters via `getEntryStyle` stagger).

```
<View style={{ width, flexDirection: 'row' }}>
  {[0..6].map(i => (
    <View key={i} style={{ flex: 1, height: height + 20 + 16, alignItems: 'center' }}>
      {/* Arrow zone: 20px */}
      <View style={{ height: 20, justifyContent: 'flex-end' }}>
        {upArrow[i] && <Text>↑</Text>}
      </View>
      {/* Bar zone */}
      <View style={{ flex: 1, justifyContent: 'flex-end', width: '70%' }}>
        <View style={{ height: Math.max(barHeight, 2), backgroundColor, borderRadius: 3, overflow: 'hidden' }}>
          {downArrow[i] && <Text style={{ position: 'absolute', top: 0 }}>↓</Text>}
        </View>
      </View>
      {/* Label */}
      <Text style={{ height: 16 }}>{DAY_LABELS[i]}</Text>
    </View>
  ))}
</View>
```

Arrow characters: use `↑` / `↓` unicode or small triangle View. Font size ~10–11px.

## Test Plan

**File:** `src/components/__tests__/DayPatternChart.test.tsx`

Strategy: static analysis (source file inspection) — consistent with existing chart tests in this codebase (WeeklyBarChart, TrendSparkline tests use static analysis).

### FR1 — Component file and exports

- SC1.1: File exists at `src/components/DayPatternChart.tsx`
- SC1.2: Exports `DayPatternChart` function
- SC1.3: Exports `DayPatternChartProps` interface
- SC1.4: Props include `current: number[]`, `prev?: number[] | null`, `width: number`, `height: number`, `trendThreshold?: number`

### FR2 — Bar rendering

- SC2.1: Source contains 7-element mapping (loop over 7 indices or literal `DAY_LABELS` / `[0,1,2,3,4,5,6]`)
- SC2.2: Bar height derived from `maxHours` (source contains `Math.max`)
- SC2.3: Minimum bar height stub (source contains `Math.max(` for bar height or literal `2`)
- SC2.4: Imports `colors` from `@/src/lib/colors`
- SC2.5: Uses `colors.success` for work day bars
- SC2.6: Uses `colors.surface` or `colors.textMuted` for rest-day stub

### FR3 — Trend arrows

- SC3.1: Source computes `delta` between `current[i]` and `prev[i]`
- SC3.2: Arrow rendered above bar when `delta >= trendThreshold` (source contains upward comparison)
- SC3.3: Arrow rendered inside bar when `delta <= -trendThreshold` (source contains downward comparison)
- SC3.4: No arrow when `prev` is null or undefined (source has null/undefined guard)
- SC3.5: No arrow on rest days (`current[i] < 0.5` guard present)
- SC3.6: Imports `TREND_THRESHOLD` from `@/src/lib/dayPatternUtils` (used as default)

### FR4 — Day labels

- SC4.1: Contains `DAY_LABELS` or equivalent array with 7 entries
- SC4.2: Labels array contains `'M'` and `'S'` entries (spot check)
- SC4.3: Rest-day labels use `colors.textMuted`

### FR5 — Arrow colors

- SC5.1: Up arrow uses `colors.success`
- SC5.2: Down arrow uses `colors.warning`

## Files

| Action | File |
|--------|------|
| Create | `src/components/DayPatternChart.tsx` |
| Create | `src/components/__tests__/DayPatternChart.test.tsx` |

## Reference Files

- `src/components/WeeklyBarChart.tsx` — bar chart pattern (CartesianChart); use as visual reference but implement as View-based for simpler arrow positioning
- `src/lib/colors.ts` — color tokens (`success`, `warning`, `surface`, `textMuted`, `textSecondary`)
- `src/lib/dayPatternUtils.ts` (spec 01) — `TREND_THRESHOLD`, `DayWindowResult`

## Key Decisions

**View-based, not VNX:** CartesianChart is great for scrubable time-series data but awkward for precisely placing overlay text at specific bar heights. View-based gives direct control over arrow position (absolute inside bar vs floated above arrow zone).

**No animation on bars:** The entry animation comes from `getEntryStyle` wrapping the whole chart section in the parent screen. Adding a fill-reveal here would double-animate and look jittery.

**Rest-day arrow suppression:** A 0h→0h delta technically qualifies as no trend, but a non-zero delta on a near-zero rest day (e.g., occasional 1-slot Saturday) would show a spurious arrow. Suppressing on `current[i] < 0.5` keeps arrows meaningful.
