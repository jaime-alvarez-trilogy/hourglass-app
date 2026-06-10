# 04-overview-integration — Spec Research

**Feature:** Hourly Insights
**Spec:** 04-overview-integration
**Date:** 2026-06-10
**Status:** Research complete

---

## Problem Context

Spec 03 delivers `HourlyPatternCard`. This spec wires it into `app/(tabs)/overview.tsx`
alongside the existing WORK PATTERN `DayPatternChart` card, adds `useHourlyInsights()`
to the screen data, and increments the stagger count so the new card animates in.

This is a small wiring spec (~25 lines of code change) with no business logic.

---

## Exploration Findings

### Current stagger count in `overview.tsx` (line 228)

```typescript
const { getEntryStyle } = useStaggeredEntry({ count: 7 });
```

Stagger indices currently used:
- 0–2: insight chips (via `insightChips.map((chip, i) => ... getEntryStyle(i))`)
- 3: earnings chart
- 4: hours + AI% side-by-side
- 5: BrainLift chart
- 6: WORK PATTERN (DayPatternChart)

New card: stagger index 7 → `count` must go 7 → 8.

### Placement anchor (lines 504–522 of `overview.tsx`)

```typescript
{/* Work Pattern — 7-bar day-of-week chart (03-overview-integration) */}
<Animated.View style={[getEntryStyle(6)]}>
  <Card>
    <SectionLabel>WORK PATTERN</SectionLabel>
    ...
    <DayPatternChart ... />
  </Card>
</Animated.View>
```

The new card goes directly after this `</Animated.View>` block, before the
`</ScrollView>` closing tag.

### `patternCardWidth` state — reuse for `HourlyPatternCard`

The existing `const [patternCardWidth, setPatternCardWidth] = useState(0)` drives
`DayPatternChart`. Since both charts live in the same column-width container, the
SAME measured width can be reused for `HourlyPatternCard` — no new `onLayout` needed.

### Guard: `profile !== null`

The card is only rendered when `profile !== null` (i.e. ≥ 4 weeks of enriched data).
This avoids a blank card on new installs. The stagger index 7 is always registered
(stable hook call count), but the `Animated.View` and card contents are conditional.

---

## Key Decisions

1. **Reuse `patternCardWidth`** — no second `onLayout` measurement needed since both
   charts occupy the same full-card-width column.

2. **`useHourlyInsights()` call added alongside `useWorkSchedule()` in the data section.**
   The hook returns `{ profile, focusWindow, aiHotZone }`.

3. **Card always at stagger index 7.** `getEntryStyle(7)` is called unconditionally
   so the hook call count never changes. The JSX inside is conditionally rendered
   (`profile && (...)`), which is fine because hooks are called before the return.

4. **`PATTERNS` section label** — matches the research terminology. Companion to
   `WORK PATTERN` label above. Consistent naming: `WORK PATTERN` = day-of-week,
   `PATTERNS` = hour-of-day.

---

## Interface Contracts

### Changes to `app/(tabs)/overview.tsx`

**FR1: Add import**
```typescript
import { HourlyPatternCard } from '@/src/components/HourlyPatternCard';
import { useHourlyInsights } from '@/src/hooks/useHourlyInsights';
```

**FR2: Increment stagger count**
```typescript
// Before:
const { getEntryStyle } = useStaggeredEntry({ count: 7 });
// After:
const { getEntryStyle } = useStaggeredEntry({ count: 8 });
```

**FR3: Add hook call in data section (after existing hook calls)**
```typescript
const { profile: hourlyProfile, focusWindow, aiHotZone } = useHourlyInsights();
```

**FR4: Add card JSX after WORK PATTERN block**
```tsx
{/* Hourly Patterns — 24-bar histogram (04-overview-integration) */}
{hourlyProfile && (
  <Animated.View style={[getEntryStyle(7)]}>
    <Card>
      <HourlyPatternCard
        profile={hourlyProfile}
        focusWindow={focusWindow}
        aiHotZone={aiHotZone}
        width={patternCardWidth}
      />
    </Card>
  </Animated.View>
)}
```

Wait — spec 03 defines that `HourlyPatternCard` already uses `Card` as its outer
wrapper. So the integration should NOT double-wrap with `Card`. The correct JSX:

```tsx
{hourlyProfile && (
  <Animated.View style={[getEntryStyle(7)]}>
    <HourlyPatternCard
      profile={hourlyProfile}
      focusWindow={focusWindow}
      aiHotZone={aiHotZone}
      width={patternCardWidth}
    />
  </Animated.View>
)}
```

(Spec 03 implementer to verify: if `HourlyPatternCard` wraps with `Card`, do not
re-wrap here. If it does not, add `Card` wrapper here. One or the other, not both.)

---

## Test Plan

### `overview.tsx` integration (existing snapshot / render tests)

**Location:** `app/(tabs)/__tests__/overview.test.tsx`

- [ ] When `useHourlyInsights` returns `{ profile: null, ... }` → `HourlyPatternCard` is not rendered
- [ ] When `useHourlyInsights` returns `{ profile: mockProfile, ... }` → `HourlyPatternCard` is rendered
- [ ] Stagger count change (7 → 8) doesn't break existing chips/charts — all still present
- [ ] No TypeScript errors on build

**Mocks needed:**
- `useHourlyInsights`: add to existing test mocks file (mock module)
- `HourlyPatternCard`: mock as `() => null` or a simple test id wrapper
- Existing mocks for `useInsightChips`, `useWorkSchedule`, etc. are already in place

---

## Files to Reference

- `app/(tabs)/overview.tsx:228` — stagger count `{ count: 7 }` → change to `{ count: 8 }`
- `app/(tabs)/overview.tsx:314-316` — existing `useInsightChips()` + `useWorkSchedule()` hook calls (add `useHourlyInsights()` here)
- `app/(tabs)/overview.tsx:317-322` — `patternCardWidth` state (reuse for `HourlyPatternCard`)
- `app/(tabs)/overview.tsx:504-522` — WORK PATTERN block (add new card directly after)
- `app/(tabs)/__tests__/overview.test.tsx` — test file to update with new mock + assertion
- `src/components/HourlyPatternCard.tsx` — spec 03 output (confirm `Card` wrapper presence)
- `src/hooks/useHourlyInsights.ts` — spec 02 output

---

## Out of Scope for This Spec

- Any animation beyond the existing staggered entry fade-in
- Scrub gesture integration (histogram bars are static)
- Window-aware filtering (the profile already averages across weeks; window param not passed)
