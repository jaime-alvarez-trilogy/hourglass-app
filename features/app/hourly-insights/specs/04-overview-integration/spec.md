# 04-overview-integration

**Status:** Draft
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Owner:** @jaime-alvarez-trilogy

---

## Overview

**What is being built:** Wire the completed `HourlyPatternCard` component and `useHourlyInsights` hook into the Overview tab screen (`app/(tabs)/overview.tsx`).

**How:** Four targeted changes to `overview.tsx`:
1. Add import statements for `HourlyPatternCard` and `useHourlyInsights`.
2. Increment the `useStaggeredEntry` count from 7 to 8 to accommodate the new card's animation slot.
3. Add a `useHourlyInsights()` hook call in the data section, destructuring `profile`, `focusWindow`, and `aiHotZone`.
4. Render `HourlyPatternCard` after the existing WORK PATTERN block, guarded by `hourlyProfile !== null` and animated at stagger index 7.

**Scope:** This is a small wiring spec (~25 lines of change). All business logic lives in specs 01–03. No new logic is introduced here.

**Dependencies:** All complete — `HourlyPatternCard` (spec 03) wraps itself in `Card`, so no additional wrapping is needed in `overview.tsx`.

---

## Out of Scope

1. **Any animation beyond staggered entry fade-in** — Descoped: The existing `useStaggeredEntry` fade-in is sufficient. Scrub/parallax animations are a future enhancement, not needed for initial wiring.

2. **Scrub gesture on histogram bars** — Descoped: The histogram is static for this spec. Interactive bar scrubbing is a follow-up UX enhancement.

3. **Window-aware filtering (passing a date window to `useHourlyInsights`)** — Descoped: The hook aggregates all available weeks by default. Time-windowed filtering is a future enhancement.

4. **`SectionLabel` header above the card** — Descoped: `HourlyPatternCard` renders its own header row (summary text rows). No external `SectionLabel` wrapper is needed.

5. **New `onLayout` measurement** — Descoped: The existing `patternCardWidth` state measured for `DayPatternChart` is reused since both charts occupy the same column width. No second `onLayout` is needed.

6. **Removing or modifying existing cards** — Descoped: All existing cards at indices 0–6 remain unchanged.

---

## Functional Requirements

### FR1 — Add Imports

Add two import statements to `app/(tabs)/overview.tsx`:

```typescript
import { HourlyPatternCard } from '@/src/components/HourlyPatternCard';
import { useHourlyInsights } from '@/src/hooks/useHourlyInsights';
```

**Success Criteria:**
- Both imports are present in the file.
- TypeScript resolves both without errors (no `ts(2307)` module not found).
- No unused import warnings (the imports are consumed by FR3 and FR4).

---

### FR2 — Increment Stagger Count

Change the `useStaggeredEntry` call from `{ count: 7 }` to `{ count: 8 }`:

```typescript
// Before:
const { getEntryStyle } = useStaggeredEntry({ count: 7 });
// After:
const { getEntryStyle } = useStaggeredEntry({ count: 8 });
```

**Success Criteria:**
- `count` is `8` after the change.
- All existing stagger indices 0–6 continue to animate correctly (no regression).
- `getEntryStyle(7)` is a valid call (index within bounds).

---

### FR3 — Add `useHourlyInsights` Hook Call

Add the hook call in the data section of `overview.tsx`, adjacent to the existing `useInsightChips()` and `useWorkSchedule()` calls:

```typescript
const { profile: hourlyProfile, focusWindow, aiHotZone } = useHourlyInsights();
```

**Success Criteria:**
- Hook is called unconditionally at the top level of the component (React rules of hooks).
- Destructured names `hourlyProfile`, `focusWindow`, `aiHotZone` are used in FR4 JSX.
- No TypeScript type errors on destructuring (types flow from `useHourlyInsights` return type).

---

### FR4 — Render `HourlyPatternCard`

Add the conditional card JSX directly after the WORK PATTERN `</Animated.View>` closing block, before `</ScrollView>`:

```tsx
{/* Hourly Patterns — 24-bar histogram (04-overview-integration) */}
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

**Note:** `HourlyPatternCard` already wraps its content in `Card` (confirmed in spec 03 implementation). Do NOT add a `Card` wrapper here.

**Success Criteria:**
- When `hourlyProfile` is `null` (e.g. < 4 weeks of data), `HourlyPatternCard` is not rendered.
- When `hourlyProfile` is non-null, `HourlyPatternCard` renders at stagger index 7 with the animated entry style.
- `patternCardWidth` is passed as `width` — the same value used by `DayPatternChart`.
- `focusWindow` and `aiHotZone` are passed through (may be `null`; `HourlyPatternCard` handles null windows).
- The card appears visually below the WORK PATTERN card in the Overview tab scroll view.
- No double `Card` wrapping (the component provides its own).

---

## Technical Design

### Files to Reference

| File | Purpose |
|---|---|
| `app/(tabs)/overview.tsx` | Target file; all 4 FRs modify this file |
| `app/(tabs)/__tests__/overview.test.tsx` | Existing test file; add mocks and assertions |
| `src/components/HourlyPatternCard.tsx` | Confirms `Card` wrapper — do NOT re-wrap |
| `src/hooks/useHourlyInsights.ts` | Source of `useHourlyInsights` hook |

### Files to Modify

**`app/(tabs)/overview.tsx`** — 4 targeted edits:

1. **Import block** (near top of file): add `HourlyPatternCard` and `useHourlyInsights` imports.
2. **Line ~228** (`useStaggeredEntry`): change `count: 7` → `count: 8`.
3. **Line ~314–316** (hook calls section): add `useHourlyInsights()` call.
4. **After line ~522** (after WORK PATTERN block): add conditional `HourlyPatternCard` JSX.

**`app/(tabs)/__tests__/overview.test.tsx`** — add mock and assertions:

1. Mock `useHourlyInsights` alongside existing mocks for `useInsightChips`, `useWorkSchedule`, etc.
2. Mock `HourlyPatternCard` as a simple test-id component (e.g. `(props) => <View testID="hourly-pattern-card" />`).
3. Add test: `profile: null` → card absent.
4. Add test: `profile: mockProfile` → card present.

### Data Flow

```
useHourlyInsights()
  └── reads from useWeeklyHistory (TanStack Query cache)
  └── returns { profile: HourlyProfile | null, focusWindow: FocusWindow | null, aiHotZone: AIHotZone | null }

overview.tsx
  ├── calls useHourlyInsights()  [FR3]
  ├── hourlyProfile === null → HourlyPatternCard not rendered  [FR4 guard]
  └── hourlyProfile !== null → <HourlyPatternCard profile={hourlyProfile} focusWindow={focusWindow} aiHotZone={aiHotZone} width={patternCardWidth} />
```

### Edge Cases

| Case | Behaviour |
|---|---|
| `profile` is `null` (< 4 weeks data) | `HourlyPatternCard` is not rendered; stagger index 7 is registered but the `Animated.View` is not mounted |
| `focusWindow` is `null` | Passed through; `HourlyPatternCard` renders without focus highlight |
| `aiHotZone` is `null` | Passed through; `HourlyPatternCard` renders without AI overlay |
| `patternCardWidth` is `0` | `HourlyPatternCard` returns `null` internally when `width === 0` (spec 03 behaviour); handled by the component, not the integration |
| Existing stagger indices 0–6 | Unaffected; incrementing `count` from 7 to 8 only adds a new slot |

### Key Constraint: No Double Card Wrapping

Spec 03's `HourlyPatternCard` opens with `<Card>` and closes with `</Card>`. The integration JSX must NOT add another `Card` wrapper. Verified from `src/components/HourlyPatternCard.tsx` lines 126 and 202.
