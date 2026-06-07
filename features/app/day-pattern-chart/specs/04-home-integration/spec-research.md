# Spec Research: 04-home-integration

## Problem

Wire a static (no-arrow) `DayPatternChart` into the Home tab showing the user's overall work pattern (all-time average hours per day), positioned between the weekly bar chart and the AI trajectory card.

## Scope

Modifications to `app/(tabs)/index.tsx` only. Shifts existing stagger indices 2→3 (AI trajectory) and 3→4 (Earnings), raises count 4→5. Also updates the FR2 describe block in `src/hooks/__tests__/useStaggeredEntry.test.ts`.

Note: 04 is sequenced after 03 to avoid merge conflicts on `useStaggeredEntry.test.ts` (03 updates FR5, 04 updates FR2 — different describe blocks, but in the same file).

## Current Home Stagger Layout

```
useStaggeredEntry({ count: 4 })
  stagger 0: Hero PanelGradient zone
  stagger 1: Weekly bar chart card
  stagger 2: AI Trajectory card (AIConeChart)
  stagger 3: Earnings card (4-week TrendSparkline)
```

## New Stagger Layout

```
useStaggeredEntry({ count: 5 })
  stagger 0: Hero PanelGradient zone      (unchanged)
  stagger 1: Weekly bar chart card         (unchanged)
  stagger 2: Day Pattern card              (NEW)
  stagger 3: AI Trajectory card            (was 2)
  stagger 4: Earnings card                 (was 3)
```

## Data Flow

```
useWorkPattern()            → pattern: WorkPattern
pattern.avgDailyHours       → DayPatternChart.current
pattern.weeksUsed           → gate: show if >= 2
(no prev)                   → DayPatternChart.prev = undefined
```

`useWorkPattern` is already imported in `index.tsx` (added in the pacing prescription work).

## Visibility Gate

Show the Day Pattern card only when `pattern.avgDailyHours.length === 7 && pattern.weeksUsed >= 2`.

- `length === 7`: ensures `avgDailyHours` was computed (not the empty-array case for 0 valid weeks)
- `weeksUsed >= 2`: same minimum-data threshold as `MIN_PRIOR_WEEKS` — if 2 weeks aren't worth showing for arrows, they're not worth showing in a static chart either

When the gate is false (new user, < 2 weeks), the card is simply not rendered — no skeleton, no placeholder. The Home tab already shows a reasonable experience without it.

## Interface Contract

```typescript
// In app/(tabs)/index.tsx (additions only)

import { DayPatternChart } from '@/src/components/DayPatternChart';

// pattern is already declared:
// const pattern = useWorkPattern();

const showPatternChart = pattern.avgDailyHours.length === 7 && pattern.weeksUsed >= 2;
```

### New JSX section (stagger 2)

```tsx
{showPatternChart && (
  <Animated.View style={[getEntryStyle(2)]}>
    <Card>
      <SectionLabel>WORK PATTERN</SectionLabel>
      <View
        style={{ height: 96 }}
        onLayout={e => setPatternCardWidth(e.nativeEvent.layout.width)}
      >
        <DayPatternChart
          current={pattern.avgDailyHours}
          width={patternCardWidth}
          height={96}
        />
      </View>
    </Card>
  </Animated.View>
)}
```

No `prev` prop → no arrows → static display.

### Stagger shifts

```typescript
// Before:
const { getEntryStyle } = useStaggeredEntry({ count: 4 });
// AI Trajectory wrapped in getEntryStyle(2)
// Earnings wrapped in getEntryStyle(3)

// After:
const { getEntryStyle } = useStaggeredEntry({ count: 5 });
// Day Pattern wrapped in getEntryStyle(2)   (new)
// AI Trajectory wrapped in getEntryStyle(3)  (shifted from 2)
// Earnings wrapped in getEntryStyle(4)       (shifted from 3)
```

## Test Plan

Updates `src/hooks/__tests__/useStaggeredEntry.test.ts` FR2 describe block.

### FR1 — Imports

- SC1.1: `index.tsx` imports `DayPatternChart` from `@/src/components/DayPatternChart`

### FR2 — Visibility gate

- SC2.1: `index.tsx` contains `showPatternChart` or equivalent boolean based on `pattern.avgDailyHours.length` and `pattern.weeksUsed`
- SC2.2: `DayPatternChart` is conditionally rendered (source contains `showPatternChart &&` or equivalent)

### FR3 — Component usage

- SC3.1: `index.tsx` passes `current={pattern.avgDailyHours}` to `DayPatternChart`
- SC3.2: `index.tsx` does NOT pass a `prev` prop to `DayPatternChart` (static, no arrows)
- SC3.3: `DayPatternChart` is wrapped in `<Animated.View` using `getEntryStyle(2)`

### FR4 — Stagger shifts

- SC4.1: `index.tsx` calls `useStaggeredEntry({ count: 5 })` (updated from 4)
- SC4.2: AI Trajectory card is wrapped with `getEntryStyle(3)` (was 2)
- SC4.3: Earnings card is wrapped with `getEntryStyle(4)` (was 3)
- SC4.4: `getEntryStyle` called exactly 5 times total in index.tsx (0,1,2,3,4)

### FR5 — useStaggeredEntry test update (FR2 block in useStaggeredEntry.test.ts)

- SC5.1: `index.tsx` calls `useStaggeredEntry` with `count: 5`
- SC5.2: Test covers `getEntryStyle(2)` for Day Pattern card
- SC5.3: Test covers `getEntryStyle(3)` for AI Trajectory (shifted from 2)
- SC5.4: Test covers `getEntryStyle(4)` for Earnings (shifted from 3)
- SC5.5: Total getEntryStyle call count assertion updated to 5

## Files

| Action | File | Change |
|--------|------|--------|
| Modify | `app/(tabs)/index.tsx` | Add import, `showPatternChart` gate, new JSX section at stagger 2, shift AI→3 and Earnings→4, count 4→5 |
| Modify | `src/hooks/__tests__/useStaggeredEntry.test.ts` | Update FR2 describe block: count 4→5, new stagger 2 test, shift AI 2→3, shift Earnings 3→4, total calls 4→5 |

## Reference Files

- `app/(tabs)/index.tsx` — current stagger layout; `useWorkPattern()` already imported and called (added in pacing prescription feature); `pattern.avgDailyHours` and `pattern.weeksUsed` already available
- `src/hooks/__tests__/useStaggeredEntry.test.ts` — FR2 describe block (lines 214–261); update count assertion, add stagger 2 test, update stagger 2→3 (AI) and 3→4 (Earnings), update total call count
- `src/components/DayPatternChart.tsx` (spec 02) — component interface
- `src/hooks/useWorkPattern.ts` — `WorkPattern.avgDailyHours`, `WorkPattern.weeksUsed`

## Key Decisions

**Gate on `weeksUsed >= 2` (not `status === 'ready'`):** The pattern is `ready` only after 4 weeks (MIN_WEEKS). But a 2-week pattern is still meaningful enough for a static display — it shows whether the user works weekends, for example. The `insufficient_data` status with `weeksUsed >= 2` still produces a valid `avgDailyHours[7]`.

**No `prev` prop (truly static):** The Home variant is explicitly a "here's your overall pattern" view. The window-comparison arrows belong only on the Overview tab where the window toggle lives. Passing `prev={undefined}` cleanly communicates "no comparison intended."

**Stagger 2 (between weekly chart and AI trajectory):** The day pattern chart is thematically related to the weekly bar chart above it — both show hours distribution. Placing it immediately after creates a natural visual group: "this week" (bar chart) → "your typical week" (pattern chart) → AI / earnings trend below.

**`patternCardWidth` as new state:** Distinct from any existing `cardWidth` variable in index.tsx (which may be used for the Earnings chart). Named specifically to avoid collisions.
