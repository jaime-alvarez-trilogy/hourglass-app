# Checklist: 04-home-integration

## Phase 1.0 — Tests (Red Phase)

### FR1 — Import DayPatternChart
- [x] SC1.1: test that `index.tsx` imports `DayPatternChart` from `@/src/components/DayPatternChart`

### FR2 — Visibility Gate
- [x] SC2.1: test that `index.tsx` contains `showPatternChart` derived from `pattern.avgDailyHours.length === 7 && pattern.weeksUsed >= 2`
- [x] SC2.2: test that `DayPatternChart` is conditionally rendered with `showPatternChart &&`

### FR3 — Component Usage
- [x] SC3.1: test that `index.tsx` passes `current={pattern.avgDailyHours}` to `DayPatternChart`
- [x] SC3.2: test that `index.tsx` does NOT pass a `prev` prop to `DayPatternChart`
- [x] SC3.3: test that `DayPatternChart` wrapper uses `getEntryStyle(2)`

### FR4 — Stagger Shifts
- [x] SC4.1: test that `index.tsx` calls `useStaggeredEntry({ count: 5 })`
- [x] SC4.2: test that AI Trajectory card uses `getEntryStyle(3)` (was 2)
- [x] SC4.3: test that Earnings card uses `getEntryStyle(4)` (was 3)
- [x] SC4.4: test that `getEntryStyle` is called exactly 5 times total

### FR5 — useStaggeredEntry Test Update (FR2 block)
- [x] SC5.1: update FR2 block to assert `count: 5` (was 4)
- [x] SC5.2: add test that `getEntryStyle(2)` is used for Day Pattern card
- [x] SC5.3: update test that `getEntryStyle(3)` is used for AI Trajectory (was 2)
- [x] SC5.4: update test that `getEntryStyle(4)` is used for Earnings (was 3)
- [x] SC5.5: update total call count assertion to 5 (was 4)

---

## Phase 1.1 — Implementation

### FR1 — Import
- [x] Add `import { DayPatternChart } from '@/src/components/DayPatternChart'` to `app/(tabs)/index.tsx`

### FR2 — Visibility Gate
- [x] Add `patternCardWidth` state: `const [patternCardWidth, setPatternCardWidth] = useState(0);`
- [x] Add `showPatternChart` derived value: `const showPatternChart = pattern.avgDailyHours.length === 7 && pattern.weeksUsed >= 2;`

### FR3 — Component Usage
- [x] Add JSX section at stagger 2 (between Weekly Chart and AI Trajectory)

### FR4 — Stagger Shifts
- [x] Update `useStaggeredEntry({ count: 4 })` → `useStaggeredEntry({ count: 5 })`
- [x] Shift AI Trajectory wrapper: `getEntryStyle(2)` → `getEntryStyle(3)`
- [x] Shift Earnings wrapper: `getEntryStyle(3)` → `getEntryStyle(4)`

### FR5 — Test Update
- [x] Update FR2 describe block in `src/hooks/__tests__/useStaggeredEntry.test.ts`

---

## Phase 1.2 — Review

- [x] Spec-implementation alignment: all FR/SC criteria met
- [x] All tests passing (66/66 useStaggeredEntry, 4393/4393 full suite)
- [x] No review feedback to address

## Session Notes

**2026-06-06**: Spec execution complete.
- Phase 1.0: 1 test commit (FR2 block updated: count 4→5, Day Pattern slot 2, AI shifted 3, Earnings shifted 4)
- Phase 1.1: 1 implementation commit (index.tsx: import, state, gate, JSX, stagger shifts)
- Phase 1.2: Review passed, all 4393 tests green
- All tests passing.
