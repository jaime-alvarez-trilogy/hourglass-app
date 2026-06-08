# 04-home-integration

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Owner:** @jaime

---

## Overview

**What is being built:**
Wire a static (no-arrow) `DayPatternChart` into the Home tab (`app/(tabs)/index.tsx`) showing the user's overall work pattern — average hours worked per day of week (Mon–Sun), derived from all available history.

**How it fits in:**
The chart is inserted at stagger position 2 (between the existing Weekly Bar Chart at position 1 and the AI Trajectory card, which shifts from 2→3). The Earnings card shifts from 3→4. `useStaggeredEntry` count is updated from 4→5.

**Data source:**
`useWorkPattern()` is already called in `index.tsx` (added during pacing prescription work). Its `.avgDailyHours` (length-7 array, Mon=0…Sun=6) and `.weeksUsed` fields are already available. No new data fetching is required.

**Visibility gate:**
The card renders only when `pattern.avgDailyHours.length === 7 && pattern.weeksUsed >= 2`. This ensures at least 2 weeks of history are available before showing the chart (consistent with the minimum meaningful threshold used elsewhere). New users see no card at all — no skeleton, no placeholder.

**Static display:**
No `prev` prop is passed to `DayPatternChart`. This is intentional — the Home variant shows an overall all-time pattern; the window-comparison arrows belong only on the Overview tab where the window toggle lives.

**Layout state:**
A new `patternCardWidth` state variable (distinct from any existing `cardWidth`) captures the rendered width via `onLayout` for correct chart scaling.

---

## Out of Scope

1. **Trend arrows on the Home tab DayPatternChart** — **Descoped:** The Home variant is explicitly a static "here's your overall pattern" view. Window-comparison arrows belong only on the Overview tab where the 4W/12W/24W toggle lives.

2. **Window toggle on the Home tab** — **Descoped:** Only the Overview tab has the window selector. The Home tab always shows the all-time (`useWorkPattern`) pattern.

3. **Skeleton / placeholder for new users** — **Descoped:** When `weeksUsed < 2` the card is simply not rendered. The Home tab provides a reasonable experience without the chart.

4. **Changes to `useWorkPattern` hook** — **Descoped:** The hook is already complete from the pacing-prescription feature. This spec only consumes it.

5. **Changes to `DayPatternChart` component** — **Descoped:** The component is complete from spec 02-chart-component. This spec only uses it.

6. **useStaggeredEntry.test.ts FR5 block (Overview)** — **Deferred to 03-overview-integration:** Already updated by spec 03. This spec updates only the FR2 block (Home screen).

---

## Functional Requirements

### FR1 — Import DayPatternChart

Add an import for `DayPatternChart` from `@/src/components/DayPatternChart` in `app/(tabs)/index.tsx`.

**Success Criteria:**
- SC1.1: `index.tsx` contains `import { DayPatternChart } from '@/src/components/DayPatternChart'` (or default import equivalent)

---

### FR2 — Visibility Gate

Declare a `showPatternChart` boolean in the component body that gates rendering of the Day Pattern card.

**Success Criteria:**
- SC2.1: `index.tsx` contains a `showPatternChart` variable (or equivalent inline expression) derived from `pattern.avgDailyHours.length === 7 && pattern.weeksUsed >= 2`
- SC2.2: `DayPatternChart` is conditionally rendered — wrapped in `{showPatternChart && (…)}` or equivalent

---

### FR3 — Component Usage

Render `DayPatternChart` inside a `Card` with `SectionLabel` "WORK PATTERN", wrapped in an `Animated.View` at stagger index 2. Use `patternCardWidth` state for width measurement via `onLayout`. Do NOT pass a `prev` prop.

**Success Criteria:**
- SC3.1: `index.tsx` passes `current={pattern.avgDailyHours}` to `DayPatternChart`
- SC3.2: `index.tsx` does NOT pass a `prev` prop to `DayPatternChart`
- SC3.3: `DayPatternChart` wrapper `Animated.View` uses `getEntryStyle(2)`

---

### FR4 — Stagger Shifts

Update `useStaggeredEntry({ count: 4 })` to `{ count: 5 }`. Shift AI Trajectory card from `getEntryStyle(2)` to `getEntryStyle(3)`. Shift Earnings card from `getEntryStyle(3)` to `getEntryStyle(4)`.

**Success Criteria:**
- SC4.1: `index.tsx` calls `useStaggeredEntry({ count: 5 })`
- SC4.2: AI Trajectory card is wrapped with `getEntryStyle(3)` (was 2)
- SC4.3: Earnings card is wrapped with `getEntryStyle(4)` (was 3)
- SC4.4: `getEntryStyle` is called exactly 5 times total in `index.tsx` (indices 0, 1, 2, 3, 4)

---

### FR5 — useStaggeredEntry Test Update (FR2 block)

Update the FR2 describe block in `src/hooks/__tests__/useStaggeredEntry.test.ts` to reflect the new stagger layout (count 4→5, new stagger 2 for Day Pattern, AI shifted to 3, Earnings shifted to 4).

**Success Criteria:**
- SC5.1: Test file asserts `useStaggeredEntry` is called with `count: 5` (updated from 4)
- SC5.2: Test covers `getEntryStyle(2)` for the Day Pattern card
- SC5.3: Test covers `getEntryStyle(3)` for AI Trajectory (shifted from 2)
- SC5.4: Test covers `getEntryStyle(4)` for Earnings (shifted from 3)
- SC5.5: Total `getEntryStyle` call count assertion is updated to 5 (was 4)

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `app/(tabs)/index.tsx` | Target file — current stagger layout, existing `useWorkPattern()` call |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` | Target test file — FR2 describe block to update |
| `src/components/DayPatternChart.tsx` | Component to import and use |
| `src/hooks/useWorkPattern.ts` | Source of `pattern.avgDailyHours` and `pattern.weeksUsed` |

### Files to Create/Modify

| Action | File | Change Summary |
|--------|------|---------------|
| Modify | `app/(tabs)/index.tsx` | Add import, `patternCardWidth` state, `showPatternChart` gate, new JSX at stagger 2, shift AI→3, Earnings→4, count 4→5 |
| Modify | `src/hooks/__tests__/useStaggeredEntry.test.ts` | Update FR2 block: count 4→5, add stagger 2 test, shift AI 2→3, Earnings 3→4, total calls 4→5 |

### Data Flow

```
useWorkPattern()
  └─ pattern.avgDailyHours  (number[7], Mon=0…Sun=6)
  └─ pattern.weeksUsed      (number)
       │
       ▼
showPatternChart = pattern.avgDailyHours.length === 7 && pattern.weeksUsed >= 2
       │
       ▼ (when true)
<DayPatternChart current={pattern.avgDailyHours} width={patternCardWidth} height={96} />
  (no prev → no arrows → static display)
```

### New State Variable

```typescript
const [patternCardWidth, setPatternCardWidth] = useState(0);
```

Named specifically to avoid collisions with any existing `cardWidth` or similar variables in `index.tsx`.

### New JSX Section (stagger 2)

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

### Stagger Shift Summary

| Card | Before | After |
|------|--------|-------|
| Hero PanelGradient | `getEntryStyle(0)` | `getEntryStyle(0)` — unchanged |
| Weekly Chart | `getEntryStyle(1)` | `getEntryStyle(1)` — unchanged |
| Day Pattern (new) | — | `getEntryStyle(2)` |
| AI Trajectory | `getEntryStyle(2)` | `getEntryStyle(3)` |
| Earnings | `getEntryStyle(3)` | `getEntryStyle(4)` |
| `useStaggeredEntry` count | 4 | 5 |

### Test Update (FR2 block in useStaggeredEntry.test.ts)

The FR2 describe block currently asserts:
- `count: 4`
- `getEntryStyle(2)` → AI Trajectory
- `getEntryStyle(3)` → Earnings
- Total call count = 4

After this spec, the FR2 block must assert:
- `count: 5`
- `getEntryStyle(2)` → Day Pattern card (new)
- `getEntryStyle(3)` → AI Trajectory (shifted)
- `getEntryStyle(4)` → Earnings (shifted)
- Total call count = 5

### Edge Cases

1. **`patternCardWidth` starts at 0:** `DayPatternChart` receives `width={0}` until the `onLayout` fires. The component guards against zero-width with `{ width }` on the outer `View` — bars may be invisible on first render but correct after layout. This is acceptable and matches how `WeeklyBarChart` and `TrendSparkline` handle it.

2. **`showPatternChart` flips false → true:** The `Animated.View` mounts and `getEntryStyle(2)` fires the entry animation. No special handling needed — the stagger system handles mount-time animation naturally.

3. **Conditional render and stagger numbering:** The `showPatternChart` gate means the card may or may not be in the DOM. Stagger indices 0–4 are always registered regardless (they are pre-allocated by `useStaggeredEntry({ count: 5 })`). An absent stagger-2 card simply means its animation fires into nothing — harmless.
