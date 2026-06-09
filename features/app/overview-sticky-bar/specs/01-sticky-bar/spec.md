# 01-sticky-bar — OverviewStickyBar Component

**Status:** Draft
**Created:** 2026-06-08
**Last Updated:** 2026-06-08
**Owner:** @jalvarez0907

---

## Overview

### What Is Being Built

`OverviewStickyBar` is a new React Native component that encapsulates the scrub
snapshot panel currently inlined in `app/(tabs)/overview.tsx`. The panel displays
four metrics (Earnings, Hours, AI%, BrainLift) for the selected scrub week and
is animated in/out by the parent's `panelStyle` Reanimated shared value.

### Why

The current inline 40-line `Animated.View` block inside a 570-line screen makes:
- The screen harder to read (scroll past panel to reach chart cards)
- The panel untestable in isolation
- Future layout changes harder to reason about

Extracting to a named component gives:
- A testable unit with a clear prop contract
- A single place to maintain snapshot panel layout
- overview.tsx reduced to orchestration-only concerns

### How

**What moves to OverviewStickyBar:**
- The `Animated.View` root with `animatedStyle` applied and `pointerEvents` logic
- The `snapLabel` text row
- The four metric columns (Earnings, Hours, AI%, BrainLift) with their color logic
- All static styling (backgroundColor, borderRadius, padding)

**What stays in overview.tsx:**
- The four Reanimated shared values (`panelOpacity`, `panelTranslateY`, `panelHeight`, `panelMarginBottom`)
- The `useEffect` that drives those shared values from `scrubWeekIndex`
- The `panelStyle = useAnimatedStyle(...)` definition
- The `heroEarnings`, `heroHours`, `heroAiPct`, `heroBrainlift`, `snapLabel` derivations
- The `computeSnapshotHoursColor` export (stays in overview.tsx; OverviewStickyBar inlines it)

**Integration:** overview.tsx replaces the 40-line Animated.View with:
```tsx
<OverviewStickyBar
  animatedStyle={panelStyle}
  isActive={scrubWeekIndex !== null}
  snapLabel={snapLabel}
  heroEarnings={heroEarnings}
  heroHours={heroHours}
  heroAiPct={heroAiPct}
  heroBrainlift={heroBrainlift}
  weeklyLimit={weeklyLimit}
/>
```

### No Behavioral Change

All animation timing, spring configs, and visual appearance remain identical. This
is a structural extraction, not a feature addition.

---

## Out of Scope

1. **Changing animation behavior** — Descoped. Spring configs, timing, and all shared value
   logic stay exactly as they are in overview.tsx. This spec does not modify animations.

2. **Moving panelStyle or shared values into OverviewStickyBar** — Descoped. The panel
   animation is driven by `scrubWeekIndex` which lives in overview.tsx. Lifting animation
   ownership into the component would require callback props or context, adding complexity
   beyond this extraction scope.

3. **Adding new metrics to the panel** — Descoped. The four columns (Earnings, Hours, AI%,
   BrainLift) are unchanged. No new data is added.

4. **Moving computeSnapshotHoursColor out of overview.tsx** — Descoped. The function stays
   exported from overview.tsx. OverviewStickyBar inlines an identical copy (to avoid
   cross-layer import from `app/` into `src/components/`).

5. **Testing animation behavior at runtime** — Descoped. All tests use static analysis
   (source file reading), consistent with the established codebase pattern for Reanimated
   hooks (cannot be exercised in jest-expo/node preset without a real dispatcher).

6. **Android or widget changes** — Descoped. This refactor is iOS screen-only.

---

## Functional Requirements

### FR1 — OverviewStickyBar component file

Create `src/components/OverviewStickyBar.tsx` as a named export React component.

**Props interface:**
```tsx
interface OverviewStickyBarProps {
  animatedStyle: StyleProp<ViewStyle>;
  isActive: boolean;
  snapLabel: string;
  heroEarnings: number;
  heroHours: number;
  heroAiPct: number;
  heroBrainlift: number;
  weeklyLimit: number;
}
```

**Success Criteria:**
- SC1.1: File exists at `src/components/OverviewStickyBar.tsx`
- SC1.2: Exports `OverviewStickyBar` as a named export
- SC1.3: Props interface includes all 8 props listed above

---

### FR2 — Static visual structure

The component renders an `Animated.View` root containing a label row and four
metric columns matching the current inline block exactly.

**Success Criteria:**
- SC2.1: Root element is `Animated.View` receiving `animatedStyle`
- SC2.2: Renders `snapLabel` in a text element at the top
- SC2.3: Renders four metric columns: Earnings, Hours, AI%, BrainLift (with labels)
- SC2.4: Earnings value text uses `colors.gold`
- SC2.5: AI% value text uses `colors.cyan`
- SC2.6: BrainLift value text uses `colors.violet`
- SC2.7: Hours value text color uses the `computeSnapshotHoursColor` logic
- SC2.8: Root `Animated.View` includes `backgroundColor: colors.surfaceElevated`

---

### FR3 — Pointer events control

The `isActive` prop controls whether the panel intercepts touches.

**Success Criteria:**
- SC3.1: When `isActive` is true, `pointerEvents="auto"`; when false, `pointerEvents="none"`
  (verified via source static analysis)

---

### FR4 — Value formatting

Metric values are formatted consistently with the current inline block.

**Success Criteria:**
- SC4.1: Earnings formatted as `$N,NNN` (`$${Math.round(heroEarnings).toLocaleString()}`)
- SC4.2: Hours formatted as `N.Nh` (`${heroHours.toFixed(1)}h`)
- SC4.3: AI% formatted as `N%` (`${Math.round(heroAiPct)}%`)
- SC4.4: BrainLift formatted as `N.Nh` (`${heroBrainlift.toFixed(1)}h`)

---

### FR5 — overview.tsx integration

Replace the inline 40-line Animated.View block with `<OverviewStickyBar .../>` and
add the import. All animation shared values and panelStyle remain in overview.tsx.

**Success Criteria:**
- SC5.1: overview.tsx imports `OverviewStickyBar` from `@/src/components/OverviewStickyBar`
- SC5.2: overview.tsx contains `<OverviewStickyBar` usage
- SC5.3: overview.tsx still contains the string `panelStyle` (useAnimatedStyle definition stays)
- SC5.4: overview.tsx still contains all four shared value declarations:
  `panelOpacity`, `panelTranslateY`, `panelHeight`, `panelMarginBottom`
- SC5.5: Existing useStaggeredEntry.test.ts assertion `expect(source).toMatch(/panelStyle/)` still passes

---

## Technical Design

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/OverviewStickyBar.tsx` | New component (FR1–FR4) |
| `src/components/__tests__/OverviewStickyBar.test.tsx` | Test coverage (all FRs) |

### Files to Modify

| File | Change |
|------|--------|
| `app/(tabs)/overview.tsx` | Replace inline Animated.View block with `<OverviewStickyBar>` + add import |

### Files NOT to Modify

| File | Reason |
|------|--------|
| `src/hooks/__tests__/useStaggeredEntry.test.ts` | Existing tests must stay green |
| `src/hooks/useStaggeredEntry.ts` | No changes needed |

---

### Component Implementation

`computeSnapshotHoursColor` is inlined in OverviewStickyBar.tsx (not imported from
`app/`) to respect module layering: `src/components` must not import from `app/`.
The existing export in overview.tsx is kept to preserve existing test coverage.

```tsx
// src/components/OverviewStickyBar.tsx
import React from 'react';
import { View, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors } from '@/src/lib/colors';

// Inlined from overview.tsx — avoids cross-layer import (app/ → src/components/)
function computeSnapshotHoursColor(hours: number, weeklyLimit: number): string {
  if (weeklyLimit === 0) return colors.success;
  const ratio = hours / weeklyLimit;
  if (ratio >= 0.85) return colors.success;
  if (ratio >= 0.60) return colors.warning;
  return colors.critical;
}

interface OverviewStickyBarProps {
  animatedStyle: StyleProp<ViewStyle>;
  isActive: boolean;
  snapLabel: string;
  heroEarnings: number;
  heroHours: number;
  heroAiPct: number;
  heroBrainlift: number;
  weeklyLimit: number;
}

export function OverviewStickyBar({ ... }: OverviewStickyBarProps): React.JSX.Element {
  // renders Animated.View with snapLabel + 4 metric columns
}
```

---

### Data Flow

```
overview.tsx
  scrubWeekIndex (state)
      │
      ├── useEffect drives → panelOpacity, panelTranslateY, panelHeight, panelMarginBottom
      │                           │
      │                      panelStyle = useAnimatedStyle(...)
      │
      ├── Derives → heroEarnings, heroHours, heroAiPct, heroBrainlift, snapLabel
      │
      └── Renders <OverviewStickyBar
              animatedStyle={panelStyle}
              isActive={scrubWeekIndex !== null}
              snapLabel={snapLabel}
              heroEarnings={heroEarnings}
              heroHours={heroHours}
              heroAiPct={heroAiPct}
              heroBrainlift={heroBrainlift}
              weeklyLimit={weeklyLimit}
          />
                  │
          OverviewStickyBar.tsx
              renders Animated.View with 4 metric columns
```

---

### Edge Cases

1. **`weeklyLimit === 0`**: `computeSnapshotHoursColor` returns `colors.success` (no
   division by zero). Handled in the inlined function.

2. **`heroEarnings = 0`**: `$0` renders correctly via `Math.round(0).toLocaleString()`.

3. **`snapLabel = ''`**: When `scrubWeekIndex === null`, snapLabel is `''`. The Text
   element renders an empty string — pointerEvents is 'none' so the panel is invisible.

4. **`isActive = false`**: `pointerEvents="none"` prevents touch interference when
   the panel is hidden (height=0, opacity=0).

---

### Test Strategy

All tests use **static analysis** (reading source files with `fs.readFileSync`). This
is consistent with `InsightChip.test.tsx`, `useStaggeredEntry.test.ts`, and
`ApprovalUrgencyCard.test.tsx` in this codebase.

Rationale: Reanimated and Gesture Handler cannot be fully exercised in jest-expo/node
preset. Source text matching validates structure and contracts reliably.

**Test file:** `src/components/__tests__/OverviewStickyBar.test.tsx`

Tests are grouped by FR. Each success criterion maps to one `it()` block.

---

### FR Dependency Graph

| FR | Description | Depends On | Wave |
|----|-------------|------------|------|
| FR1 | OverviewStickyBar file + props shape | — | 1 |
| FR2 | Static visual structure (4 columns, colors) | FR1 | 2 |
| FR3 | Pointer events (isActive → pointerEvents) | FR1 | 2 |
| FR4 | Value formatting (earnings/hours/ai/brainlift) | FR1 | 2 |
| FR5 | overview.tsx integration | FR1–FR4 | 3 |
