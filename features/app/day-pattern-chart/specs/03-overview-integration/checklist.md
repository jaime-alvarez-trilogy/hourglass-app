# Checklist: 03-overview-integration

## Phase 3.0 — Tests (Red Phase)

### FR1 — Imports
- [x] SC1.1: Write test asserting `overview.tsx` imports `useWeeklyHistory` from `@/src/hooks/useWeeklyHistory`
- [x] SC1.2: Write test asserting `overview.tsx` imports `computeDayWindowAvgs` from `@/src/lib/dayPatternUtils`
- [x] SC1.3: Write test asserting `overview.tsx` imports `DayPatternChart` from `@/src/components/DayPatternChart`

### FR2 — Data Computation
- [x] SC2.1: Write test asserting `overview.tsx` calls `useWeeklyHistory()` and destructures `snapshots`
- [x] SC2.2: Write test asserting `overview.tsx` calls `computeDayWindowAvgs(snapshots, window)` inside `useMemo`
- [x] SC2.3: Write test asserting `useMemo` dependency array includes both `snapshots` and `window`

### FR3 — Section Rendering
- [x] SC3.1: Write test asserting `overview.tsx` renders `<DayPatternChart` with `current=` prop
- [x] SC3.2: Write test asserting `overview.tsx` passes `prev=` prop to `DayPatternChart`
- [x] SC3.3: Write test asserting subtitle text contains `window` variable reference
- [x] SC3.4: Write test asserting section is wrapped in `<Animated.View` using `getEntryStyle(6)`

### FR4 — Stagger Count Update
- [x] SC4.1: Write test asserting `overview.tsx` calls `useStaggeredEntry({ count: 7 })`
- [x] SC4.2: Write test asserting `getEntryStyle(6)` appears exactly once in `overview.tsx`

### FR5 — useStaggeredEntry Test Update
- [x] SC5.1: Update FR5 describe block: assert `count: 7` (was 6)
- [x] SC5.2: Add assertion for `getEntryStyle(6)` present (Work Pattern section)
- [x] SC5.3: Update literal call count assertion: 4 (was 3)
- [x] SC5.4: Retain assertion for `getEntryStyle(3)` (Earnings)
- [x] SC5.5: Retain assertion for `getEntryStyle(4)` (Hours+AI%)
- [x] SC5.6: Retain assertion for `getEntryStyle(5)` (BrainLift)

---

## Phase 3.1 — Implementation (Green Phase)

### FR1 — Imports
- [x] Add `useWeeklyHistory` import to `app/(tabs)/overview.tsx`
- [x] Add `computeDayWindowAvgs` import to `app/(tabs)/overview.tsx`
- [x] Add `DayPatternChart` import to `app/(tabs)/overview.tsx`

### FR2 — Data Computation
- [x] Add `const { snapshots } = useWeeklyHistory();` in `OverviewScreen`
- [x] Add `const [patternCardWidth, setPatternCardWidth] = useState(0);` state
- [x] Add `patternData` useMemo calling `computeDayWindowAvgs(snapshots, window)` with `[snapshots, window]` deps

### FR3 — Section Rendering
- [x] Add WORK PATTERN card JSX after BrainLift section with `<Animated.View style={[getEntryStyle(6)]}>` wrapper
- [x] Wire `current={patternData.current}` prop on `<DayPatternChart>`
- [x] Wire `prev={patternData.prev}` prop on `<DayPatternChart>`
- [x] Add subtitle with `window` conditional (`'24W avg'` vs `'${window}W vs prior ${window}W'`)
- [x] Wire `onLayout` to `setPatternCardWidth`

### FR4 — Stagger Count Update
- [x] Change `useStaggeredEntry({ count: 6 })` to `useStaggeredEntry({ count: 7 })` in `overview.tsx`

### FR5 — useStaggeredEntry Test Update
- [x] Update FR5 describe block in `src/hooks/__tests__/useStaggeredEntry.test.ts` per SC5.1–SC5.6

---

## Phase 3.2 — Review

- [x] Run spec-implementation-alignment check
- [x] Run pr-review-toolkit:review-pr
- [x] Address any review feedback (fix: restored original stagger indices 0/1/2 for charts)
- [x] Run test-optimiser on test files touched
- [x] Confirm all tests pass (`npx jest --runInBand` — 4392/4392 passing)

## Session Notes

**2026-06-06**: Implementation complete.
- Phase 3.0: 1 test commit (test(FR1-FR5): new overview-day-pattern.test.ts + useStaggeredEntry FR5 update)
- Phase 3.1: 1 implementation commit (feat(FR1-FR4): wire DayPatternChart into overview.tsx)
- Phase 3.2: 1 fix commit (fix(03-overview-integration): restore original stagger indices)
- All 4392 tests passing.
