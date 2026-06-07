# Spec Research: 03-overview-integration

## Problem

Wire `DayPatternChart` into the Overview tab so it responds to the 4W / 12W / 24W window toggle and shows trend arrows comparing the current period to its prior period.

## Scope

Modifications to `app/(tabs)/overview.tsx` only. Updates stagger count 6→7. Also updates the FR5 describe block in `src/hooks/__tests__/useStaggeredEntry.test.ts`.

## Current Overview Structure (relevant)

```
useStaggeredEntry({ count: 6 })
  InsightChips      getEntryStyle(0..N)  — dynamic loop
  EarningsPaceCard  — no stagger
  ChartSections:
    Earnings        getEntryStyle(3)
    Hours + AI%     getEntryStyle(4)
    BrainLift       getEntryStyle(5)
```

New section added after BrainLift at stagger index 6.

## Data Flow

```
useWeeklyHistory()          → snapshots: WeeklySnapshot[]
computeDayWindowAvgs(snapshots, window) → DayWindowResult
  DayWindowResult.current   → DayPatternChart.current
  DayWindowResult.prev      → DayPatternChart.prev
```

`useWeeklyHistory` is already a dependency of `useOverviewData` (which overview.tsx already uses). Adding a direct call to `useWeeklyHistory()` in overview.tsx is safe — it subscribes to the same AsyncStorage event system and shares the same data, adding no network overhead.

The `window` state already exists in overview.tsx (`const [window, setWindow] = ...`).

## Interface Contracts

### New `useMemo` in overview.tsx

```typescript
import { useWeeklyHistory } from '@/src/hooks/useWeeklyHistory';
import { computeDayWindowAvgs } from '@/src/lib/dayPatternUtils';
import { DayPatternChart } from '@/src/components/DayPatternChart';

// Inside component:
const { snapshots } = useWeeklyHistory();

const patternData = useMemo(
  () => computeDayWindowAvgs(snapshots, window),
  [snapshots, window],
);
```

Sources:
- `snapshots` ← `useWeeklyHistory()` (AsyncStorage `weekly_history_v2`)
- `window` ← existing state in overview.tsx
- `patternData.current` ← spec 01 output
- `patternData.prev` ← spec 01 output (null for 24W or insufficient prior data)

### New JSX section

```tsx
<Animated.View style={[getEntryStyle(6)]}>
  <Card>
    <SectionLabel>WORK PATTERN</SectionLabel>
    <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 6 }}>
      {window === 24
        ? '24W avg'
        : `${window}W vs prior ${window}W`}
    </Text>
    <View
      style={{ height: 96 }}
      onLayout={e => setPatternCardWidth(e.nativeEvent.layout.width)}
    >
      <DayPatternChart
        current={patternData.current}
        prev={patternData.prev}
        width={patternCardWidth}
        height={96}
      />
    </View>
  </Card>
</Animated.View>
```

The subtitle changes based on window (`'24W avg'` vs `'4W vs prior 4W'`), giving the user immediate context for what the arrows mean.

### Stagger update

```typescript
// Before:
const { getEntryStyle } = useStaggeredEntry({ count: 6 });

// After:
const { getEntryStyle } = useStaggeredEntry({ count: 7 });
```

Existing stagger indices (0–5) are unchanged. New section uses index 6.

## Test Plan

Updates `src/hooks/__tests__/useStaggeredEntry.test.ts` FR5 describe block.

### FR1 — Imports

- SC1.1: `overview.tsx` imports `useWeeklyHistory` from `@/src/hooks/useWeeklyHistory`
- SC1.2: `overview.tsx` imports `computeDayWindowAvgs` from `@/src/lib/dayPatternUtils`
- SC1.3: `overview.tsx` imports `DayPatternChart` from `@/src/components/DayPatternChart`

### FR2 — Data computation

- SC2.1: `overview.tsx` calls `useWeeklyHistory()` and destructures `snapshots`
- SC2.2: `overview.tsx` calls `computeDayWindowAvgs(snapshots, window)` inside `useMemo`
- SC2.3: `useMemo` dependency array includes both `snapshots` and `window`

### FR3 — Section rendering

- SC3.1: `overview.tsx` renders `<DayPatternChart` with `current=` prop
- SC3.2: `overview.tsx` passes `prev=` prop to `DayPatternChart`
- SC3.3: Subtitle text contains `window` variable reference (responds to toggle)
- SC3.4: Section is wrapped in `<Animated.View` using `getEntryStyle(6)`

### FR4 — Stagger update

- SC4.1: `overview.tsx` calls `useStaggeredEntry({ count: 7 })` (updated from 6)
- SC4.2: `getEntryStyle(6)` appears exactly once in overview.tsx

### FR5 — useStaggeredEntry test update (FR5 block in useStaggeredEntry.test.ts)

- SC5.1: `overview.tsx` calls `useStaggeredEntry` with `count: 7`
- SC5.2: `getEntryStyle(6)` present (new Work Pattern section)
- SC5.3: Literal `getEntryStyle` calls total 4 (indices 3, 4, 5, 6)
- SC5.4: `getEntryStyle(3)` still present (Earnings)
- SC5.5: `getEntryStyle(4)` still present (Hours+AI%)
- SC5.6: `getEntryStyle(5)` still present (BrainLift)

## Files

| Action | File | Change |
|--------|------|--------|
| Modify | `app/(tabs)/overview.tsx` | Add imports, `useWeeklyHistory` call, `useMemo`, new JSX section, stagger count 6→7 |
| Modify | `src/hooks/__tests__/useStaggeredEntry.test.ts` | Update FR5 describe block: count 6→7, add SC5.2 (getEntryStyle(6)), update literal call count 3→4 |

## Reference Files

- `app/(tabs)/overview.tsx` — existing structure; ChartSection pattern at lines 449–531; stagger at line 223
- `src/hooks/__tests__/useStaggeredEntry.test.ts` — FR5 describe block (lines 372–420); update assertions there
- `src/hooks/useWeeklyHistory.ts` — return type `{ snapshots, isLoading }`
- `src/lib/dayPatternUtils.ts` (spec 01) — `computeDayWindowAvgs`, `DayWindowResult`
- `src/components/DayPatternChart.tsx` (spec 02) — component interface

## Key Decisions

**Add `useWeeklyHistory` directly in overview.tsx (not extend `useOverviewData`):** `useOverviewData` returns pre-processed arrays (earnings[], hours[], etc.) for charting — adding raw `dailyHours` slicing to it would break its single responsibility. Direct call is clean and adds no overhead since both hooks subscribe to the same AsyncStorage event.

**`patternCardWidth` as separate state:** The chart needs a pixel width. Following the existing ChartSection `onLayout` pattern, a local state variable tracks the card inner width. Named distinctly from `cardWidth` (if overview already uses that name) to avoid collision.

**24W subtitle "24W avg" (not "24W vs prior 24W"):** There is no prior group for 24W. The subtitle reflects this to avoid confusing users about missing arrows.

**No scrub synchronization:** The 7-bar day-pattern chart shows a fixed distribution, not a time series. It doesn't participate in the cross-chart cursor sync (no `externalCursorIndex` prop, no `onScrubChange`). Scrubbing one of the TrendSparklines won't highlight a day in this chart — intentional.
