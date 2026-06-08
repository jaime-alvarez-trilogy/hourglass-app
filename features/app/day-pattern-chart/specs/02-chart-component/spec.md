# 02-chart-component: DayPatternChart Visual Component

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06

---

## Overview

### What Is Being Built

`DayPatternChart` is a pure presentational React Native component that renders a 7-bar vertical bar chart representing average hours worked per day of the week (Monday through Sunday). It accepts computed averages from the parent and renders them as proportional bars with optional trend arrows.

### Component Purpose

The chart serves two usage contexts:

| Context | `prev` prop | Arrows shown |
|---------|-------------|--------------|
| Overview tab (windowed) | `DayWindowResult.prev` from `computeDayWindowAvgs` | Yes — when delta ≥ TREND_THRESHOLD |
| Home tab (all-time) | `undefined` | Never |

The component is a rendering primitive only — it does not fetch data, manage state, or handle gestures. All data preparation happens in the parent screen.

### How It Works

Each of the 7 columns (Mon–Sun) contains three stacked zones:

1. **Arrow zone** (20px fixed height): Holds an up-arrow (↑) that floats above the bar for days where the average increased by ≥ 0.5h vs the prior period.
2. **Bar zone** (fills remaining height prop): The proportional bar grows from the bottom. A down-arrow (↓) sits at the top of the bar for days where the average decreased by ≥ 0.5h.
3. **Day label** (16px fixed height): Single-character labels M/T/W/T/F/S/S. Work days use `colors.textSecondary`; rest days (`avg < 0.5h`) use `colors.textMuted`.

### Implementation Approach

View-based layout (not CartesianChart/VNX). The precisely positioned arrows — one floating above the bar, one pinned inside the bar top — are cleaner as nested Views than as CartesianChart render props. No pan gesture is needed (scrubbing stays on TrendSparklines in the parent).

Bar heights are computed as: `barHeight = (current[i] / maxHours) * height`, where `maxHours = Math.max(...current, 1)`. Rest-day bars (`avg < 0.5h`) always render a 2px minimum stub using `colors.surface` so the column is never invisible.

---

## Out of Scope

1. **Data fetching or hook integration** — **Descoped:** This component is a pure presentational primitive. Data preparation via `computeDayWindowAvgs` is handled by the caller. Hook wiring is done in specs 03-overview-integration and 04-home-integration.

2. **Screen wiring (Overview and Home tabs)** — **Deferred to 03-overview-integration and 04-home-integration:** Connecting this component into actual tab screens, passing real data, and integrating with window selectors is out of scope for this spec.

3. **Entry animation on bars** — **Descoped:** No fill-reveal animation is added to the bars themselves. The component receives stagger animation via `getEntryStyle` wrapping in the parent screen. Adding a second animation layer here would double-animate and look jittery.

4. **Pan gesture / scrubbing** — **Descoped:** Overview tab scrubbing is handled by TrendSparklines, not this chart. No gesture handling is needed in DayPatternChart.

5. **Accessibility labels** — **Descoped for this spec:** ARIA/accessibility labeling is not part of the initial component implementation. Can be added in a follow-on spec.

6. **Theming / dark-light mode switching** — **Descoped:** The app uses a fixed dark theme; colors are imported as constants from `src/lib/colors.ts`.

---

## Functional Requirements

### FR1 — Component File and Exports

Create the `DayPatternChart` component file with the correct exported interface.

**Props interface:**
```typescript
export interface DayPatternChartProps {
  current: number[];          // length 7, Mon=0…Sun=6, avg hours per day
  prev?: number[] | null;     // undefined or null → no arrows rendered
  width: number;              // total component width in pixels
  height: number;             // bar area height (excludes day labels and arrow zone)
  trendThreshold?: number;    // default TREND_THRESHOLD (0.5h) from dayPatternUtils
}
```

**Success Criteria:**
- SC1.1: File exists at `src/components/DayPatternChart.tsx`
- SC1.2: File exports `DayPatternChart` named function (or default export of that name)
- SC1.3: File exports `DayPatternChartProps` interface
- SC1.4: Props include `current: number[]`, `prev?: number[] | null`, `width: number`, `height: number`, `trendThreshold?: number`

---

### FR2 — Bar Rendering

Render 7 proportional bars, one per day of week, growing from the bottom of the bar zone.

**Bar height formula:**
```
maxHours = Math.max(...current, 1)   // avoid div-by-zero
barHeight[i] = (current[i] / maxHours) * height
```

**Bar colors:**
- Work day (`current[i] >= 0.5h`): `colors.success`
- Rest day (`current[i] < 0.5h`): `colors.surface` at minimum 2px height (always visible stub)

**Day labels** (`['M','T','W','T','F','S','S']`):
- Work days: `colors.textSecondary`
- Rest days: `colors.textMuted`

**Success Criteria:**
- SC2.1: Source maps over 7 day indices (e.g. `DAY_LABELS` or `[0,1,2,3,4,5,6].map`)
- SC2.2: Bar height derived from `maxHours` — source contains `Math.max`
- SC2.3: Minimum bar height stub present — source contains `Math.max(` for bar height clamp or literal `2`
- SC2.4: Imports `colors` from `@/src/lib/colors`
- SC2.5: Uses `colors.success` for work day bars
- SC2.6: Uses `colors.surface` for rest-day stub

---

### FR3 — Trend Arrows

Render trend arrows when `prev` is provided and the day qualifies.

**Arrow placement:**
- ↑ up-arrow: rendered in the 20px arrow zone **above** the bar
- ↓ down-arrow: rendered **inside the bar** at the top (absolute position top:0)

**Arrow rules:**

| Condition | Arrow | Color |
|-----------|-------|-------|
| `prev` is null/undefined | none | — |
| `current[i] < 0.5` (rest day) | none | — |
| `delta >= trendThreshold` | ↑ | `colors.success` |
| `delta <= -trendThreshold` | ↓ | `colors.warning` |
| `|delta| < trendThreshold` | none | — |

Where `delta = current[i] - prev[i]`.

`trendThreshold` defaults to `TREND_THRESHOLD` imported from `dayPatternUtils`.

**Success Criteria:**
- SC3.1: Source computes `delta` between `current[i]` and `prev[i]`
- SC3.2: Up-arrow rendered when `delta >= trendThreshold`
- SC3.3: Down-arrow rendered when `delta <= -trendThreshold`
- SC3.4: No arrow when `prev` is null or undefined (null/undefined guard present)
- SC3.5: No arrow on rest days — `current[i] < 0.5` guard present
- SC3.6: Imports `TREND_THRESHOLD` from `@/src/lib/dayPatternUtils`

---

### FR4 — Day Labels

Render single-character day labels below each bar column.

**Labels:** `['M', 'T', 'W', 'T', 'F', 'S', 'S']`

**Success Criteria:**
- SC4.1: Source contains `DAY_LABELS` constant or equivalent 7-element array
- SC4.2: Labels array contains `'M'` and `'S'` entries
- SC4.3: Rest-day labels use `colors.textMuted`

---

### FR5 — Arrow Colors

**Success Criteria:**
- SC5.1: Up-arrow (↑) uses `colors.success`
- SC5.2: Down-arrow (↓) uses `colors.warning`

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/dayPatternUtils.ts` | `TREND_THRESHOLD`, `DayWindowResult` types |
| `src/lib/colors.ts` | Color tokens: `success`, `warning`, `surface`, `textSecondary`, `textMuted` |
| `src/components/WeeklyBarChart.tsx` | Bar chart pattern reference (CartesianChart); implement as View-based instead |
| `src/components/__tests__/WeeklyBarChart.test.tsx` | Test pattern reference (static analysis + react-test-renderer) |

### Files to Create

| File | Description |
|------|-------------|
| `src/components/DayPatternChart.tsx` | The chart component |
| `src/components/__tests__/DayPatternChart.test.tsx` | Tests (static analysis strategy) |

### Component Structure

```tsx
// Total column height = height (bar zone) + 20 (arrow zone) + 16 (label)
<View style={{ width, flexDirection: 'row' }}>
  {DAY_LABELS.map((label, i) => {
    const barH = Math.max((current[i] / maxHours) * height, 2);
    const isWorkDay = current[i] >= 0.5;
    const barColor = isWorkDay ? colors.success : colors.surface;

    // Arrow logic
    const delta = prev ? current[i] - prev[i] : 0;
    const showUp   = !!prev && isWorkDay && delta >= threshold;
    const showDown = !!prev && isWorkDay && delta <= -threshold;

    return (
      <View key={i} style={{ flex: 1, alignItems: 'center' }}>
        {/* Arrow zone: 20px — up arrow floats here */}
        <View style={{ height: 20, justifyContent: 'flex-end' }}>
          {showUp && <Text style={{ color: colors.success, fontSize: 10 }}>↑</Text>}
        </View>
        {/* Bar zone */}
        <View style={{ flex: 1, justifyContent: 'flex-end', width: '70%' }}>
          <View style={{ height: barH, backgroundColor: barColor, borderRadius: 3, overflow: 'hidden' }}>
            {showDown && (
              <Text style={{ position: 'absolute', top: 0, color: colors.warning, fontSize: 10 }}>↓</Text>
            )}
          </View>
        </View>
        {/* Day label */}
        <Text style={{ height: 16, color: isWorkDay ? colors.textSecondary : colors.textMuted, fontSize: 10 }}>
          {label}
        </Text>
      </View>
    );
  })}
</View>
```

### Data Flow

```
Parent (Overview/Home)
  │
  ├─ current: number[]   ← DayWindowResult.current or WorkPattern.avgDailyHours
  ├─ prev: number[]|null ← DayWindowResult.prev (null for 24W or insufficient data)
  ├─ width: number       ← onLayout measurement from parent card
  └─ height: number      ← fixed value from parent (e.g. 80)
  │
  ▼
DayPatternChart
  │
  ├─ computes maxHours = Math.max(...current, 1)
  ├─ for each day i:
  │    barH = (current[i] / maxHours) * height  [min 2px]
  │    isWorkDay = current[i] >= 0.5
  │    barColor = isWorkDay ? success : surface
  │    delta = prev ? current[i] - prev[i] : 0
  │    showUp = prev && isWorkDay && delta >= threshold
  │    showDown = prev && isWorkDay && delta <= -threshold
  └─ renders View tree
```

### Edge Cases

| Case | Handling |
|------|---------|
| All zeros (e.g. first week, no data) | `maxHours = 1` (guard), all bars show 2px stub in `colors.surface` |
| `prev` is null | No arrows shown; null guard short-circuits delta computation |
| `prev` is undefined | Same as null — `!!prev` is false |
| `current[i]` is 0 on a rest day with non-zero prev | No arrow (rest-day guard) — delta on near-zero days is noise |
| `width = 0` | Component renders; bars compute to zero width via `flex: 1` — no crash |
| Single outlier day much higher than rest | `maxHours` scales correctly; other bars proportionally shorter |
| `trendThreshold` not provided | Defaults to `TREND_THRESHOLD` (0.5) from dayPatternUtils |

### Test Strategy

Static source-analysis (`fs.readFileSync`) — consistent with `WeeklyBarChart.test.tsx` and `TrendSparkline.test.tsx` patterns in this codebase. Tests inspect source for:
- Interface shape (props)
- Color usage (`colors.success`, `colors.warning`, `colors.surface`, `colors.textMuted`)
- Arrow logic patterns (delta, threshold guards, null guard, rest-day guard)
- `Math.max` bar scaling
- `DAY_LABELS` or equivalent

No render-tree traversal is needed since the component has no external library rendering (CartesianChart, Skia Canvas) that requires mocking. A single render smoke test is included to verify the component mounts without crash.
