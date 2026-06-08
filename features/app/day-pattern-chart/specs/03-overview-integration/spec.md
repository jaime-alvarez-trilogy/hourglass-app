# 03-overview-integration

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Owner:** @jaimealbarez

---

## Overview

Wire `DayPatternChart` into the Overview tab so it responds to the existing 4W / 12W / 24W window toggle and shows trend arrows comparing the current period to its prior period.

### What is being built

A new "WORK PATTERN" card section added to `app/(tabs)/overview.tsx`, positioned after the BrainLift chart at stagger index 6. The section renders `DayPatternChart` — a 7-bar Mon–Sun chart — driven by the weekly snapshot history already available in the component.

### How it works

1. `useWeeklyHistory()` is called directly in `OverviewScreen` (same hook already used by `useOverviewData`'s backing store; no extra network calls).
2. `computeDayWindowAvgs(snapshots, window)` is called inside a `useMemo` — both dependencies tracked.
3. The resulting `DayWindowResult.current` and `.prev` are passed straight to `<DayPatternChart>`.
4. Card width is tracked via `onLayout` state `patternCardWidth` so the fixed-width chart fills the card precisely.
5. The subtitle line reads `'24W avg'` when `window === 24` (no prior group) and `'NW vs prior NW'` otherwise.
6. `useStaggeredEntry` count is bumped from 6 → 7; the new section uses slot index 6.

### What is NOT changing

- Existing stagger indices 0–5 are unchanged.
- The chart does **not** participate in cross-chart cursor sync (no `externalCursorIndex`/`onScrubChange`).
- `useOverviewData` is not modified.
- No new files are created — only two existing files are modified.

---

## Out of Scope

1. **Cross-chart scrub synchronization for DayPatternChart** — Descoped: the 7-bar day-pattern chart shows a fixed distribution, not a time series, so cursor sync would be meaningless.

2. **Home tab integration** — Deferred to [04-home-integration](../04-home-integration/spec.md): a separate spec wires a static (no-arrow) variant into the Home tab.

3. **Extending `useOverviewData` with day pattern data** — Descoped: `useOverviewData` returns pre-processed metric arrays for sparklines; adding raw `dailyHours` slicing would break its single responsibility. Direct `useWeeklyHistory` call is the right pattern.

4. **`patternCardWidth` initialization to non-zero** — Descoped: chart renders with `width=0` until the first `onLayout` fires; `DayPatternChart` renders correctly at zero width (empty View).

5. **Trend arrow threshold configurability** — Descoped: `TREND_THRESHOLD = 0.5h` is a constant from `dayPatternUtils.ts` used as the default; no user-facing configuration is needed at this stage.

---

## Functional Requirements

### FR1 — Imports

Add three imports to `app/(tabs)/overview.tsx`.

**Success Criteria:**

- SC1.1: `overview.tsx` imports `useWeeklyHistory` from `@/src/hooks/useWeeklyHistory`
- SC1.2: `overview.tsx` imports `computeDayWindowAvgs` from `@/src/lib/dayPatternUtils`
- SC1.3: `overview.tsx` imports `DayPatternChart` from `@/src/components/DayPatternChart`

---

### FR2 — Data Computation

Call `useWeeklyHistory()` in `OverviewScreen` and compute pattern data via `useMemo`.

**Success Criteria:**

- SC2.1: `overview.tsx` calls `useWeeklyHistory()` and destructures `snapshots`
- SC2.2: `overview.tsx` calls `computeDayWindowAvgs(snapshots, window)` inside `useMemo`
- SC2.3: `useMemo` dependency array includes both `snapshots` and `window`

**Implementation note:** A local state variable `patternCardWidth` (initialized to 0) tracks the card's pixel width for the fixed-width chart.

---

### FR3 — Section Rendering

Render the "WORK PATTERN" card section after the BrainLift section.

**Success Criteria:**

- SC3.1: `overview.tsx` renders `<DayPatternChart` with `current=` prop (bound to `patternData.current`)
- SC3.2: `overview.tsx` passes `prev=` prop to `DayPatternChart` (bound to `patternData.prev`)
- SC3.3: Subtitle text contains `window` variable reference (responds to toggle — `'24W avg'` vs `'${window}W vs prior ${window}W'`)
- SC3.4: Section is wrapped in `<Animated.View` using `getEntryStyle(6)`

**JSX shape:**

```tsx
<Animated.View style={[getEntryStyle(6)]}>
  <Card>
    <SectionLabel>WORK PATTERN</SectionLabel>
    <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 6 }}>
      {window === 24 ? '24W avg' : `${window}W vs prior ${window}W`}
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

---

### FR4 — Stagger Count Update

Update `useStaggeredEntry` count from 6 → 7 in `overview.tsx`.

**Success Criteria:**

- SC4.1: `overview.tsx` calls `useStaggeredEntry({ count: 7 })` (updated from 6)
- SC4.2: `getEntryStyle(6)` appears exactly once in `overview.tsx`

---

### FR5 — useStaggeredEntry Test Update

Update the FR5 describe block in `src/hooks/__tests__/useStaggeredEntry.test.ts` to reflect the new count and new stagger index.

**Success Criteria:**

- SC5.1: Test asserts `overview.tsx` calls `useStaggeredEntry` with `count: 7`
- SC5.2: Test asserts `getEntryStyle(6)` is present (new Work Pattern section)
- SC5.3: Test asserts literal `getEntryStyle` calls total 4 (indices 3, 4, 5, 6)
- SC5.4: Test still asserts `getEntryStyle(3)` present (Earnings)
- SC5.5: Test still asserts `getEntryStyle(4)` present (Hours+AI%)
- SC5.6: Test still asserts `getEntryStyle(5)` present (BrainLift)

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `app/(tabs)/overview.tsx` | Target file; existing stagger at line 223; ChartSection pattern at lines 449–531 |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` | FR5 describe block (lines 372–420) to update |
| `src/hooks/useWeeklyHistory.ts` | Returns `{ snapshots: WeeklySnapshot[], isLoading: boolean }` |
| `src/lib/dayPatternUtils.ts` | Exports `computeDayWindowAvgs`, `DayWindowResult`, `TREND_THRESHOLD` |
| `src/components/DayPatternChart.tsx` | Props: `current`, `prev`, `width`, `height`, `trendThreshold?` |

### Files to Modify

| File | Change |
|------|--------|
| `app/(tabs)/overview.tsx` | Add 3 imports; add `useWeeklyHistory()` call + `patternCardWidth` state + `patternData` useMemo; add new JSX section after BrainLift; change stagger count 6→7 |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` | Update FR5 describe block: count 6→7, add SC5.2 (`getEntryStyle(6)`), update literal call count 3→4 |

### Data Flow

```
useWeeklyHistory()
  └─ snapshots: WeeklySnapshot[]
       │
       ▼
computeDayWindowAvgs(snapshots, window)    ← useMemo([snapshots, window])
  └─ DayWindowResult
       ├─ .current: number[7]  ──► DayPatternChart current prop
       └─ .prev: number[7] | null ─► DayPatternChart prev prop

window (existing state: 4 | 12 | 24)
  └─ subtitle conditional: window===24 → '24W avg' | else → `${window}W vs prior ${window}W`
  └─ useMemo dep
```

### State Variables Added

```typescript
const [patternCardWidth, setPatternCardWidth] = useState(0);
```

Named `patternCardWidth` (not `cardWidth`) to avoid collision with the `cardWidth` state inside `ChartSection`.

### useMemo

```typescript
const patternData = useMemo(
  () => computeDayWindowAvgs(snapshots, window),
  [snapshots, window],
);
```

### Stagger Index Map (After Change)

| Index | Section |
|-------|---------|
| 0..N  | InsightChips (dynamic loop) |
| 3     | Earnings ChartSection |
| 4     | Hours+AI% ChartSection row |
| 5     | BrainLift ChartSection |
| 6     | Work Pattern (new) |

### Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `snapshots` is empty (first launch) | `computeDayWindowAvgs` returns `current: Array(7).fill(0)`, `prev: null`; chart renders 7 minimal stub bars, no arrows |
| `window === 24` | `prev === null`; subtitle shows `'24W avg'`; no trend arrows in chart |
| `patternCardWidth === 0` (before first layout) | Chart renders with `width=0`; `DayPatternChart` renders an empty flex row — no crash |
| `snapshots` has < `2 * window` valid weeks | `prev === null`; no arrows shown (handled by `computeDayWindowAvgs` MIN_PRIOR_WEEKS guard) |

### Test Strategy

Static source-file analysis (same pattern as existing FR5 block and all other useStaggeredEntry tests). No runtime rendering needed — assertions check import strings, hook call patterns, and JSX attribute presence via `fs.readFileSync` + regex.
