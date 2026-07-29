# Checklist: 04-overview-integration

**Spec:** [spec.md](spec.md)
**Feature:** hourly-insights
**Status:** Not started

---

## Phase 4.0 — Tests (Red Phase)

Write tests first. All tests must fail (red) before implementation begins.

**File:** `app/(tabs)/__tests__/overview.test.tsx`

- [x] `test(FR4-null)`: When `useHourlyInsights` returns `{ profile: null, focusWindow: null, aiHotZone: null }`, `HourlyPatternCard` is not rendered (query by testID returns null)
- [x] `test(FR4-render)`: When `useHourlyInsights` returns `{ profile: mockHourlyProfile, focusWindow: mockFocusWindow, aiHotZone: mockAIHotZone }`, `HourlyPatternCard` is rendered (query by testID returns element)
- [x] `test(FR2-regression)`: With `profile: mockHourlyProfile`, all existing cards at stagger indices 0–6 are still present (insight chips, earnings, hours/AI, BrainLift, DayPatternChart)
- [x] Mock `useHourlyInsights` module added to test file mocks (alongside `useInsightChips`, `useWorkSchedule`)
- [x] Mock `HourlyPatternCard` as `(props) => <View testID="hourly-pattern-card" />`

**Commit:** `test(FR4): add HourlyPatternCard integration tests to overview`

---

## Phase 4.1 — Implementation (Green Phase)

Make tests pass with minimum code. Run tests before committing.

- [x] `feat(FR1)`: Add `HourlyPatternCard` and `useHourlyInsights` imports to `app/(tabs)/overview.tsx`
- [x] `feat(FR2)`: Change `useStaggeredEntry({ count: 7 })` to `useStaggeredEntry({ count: 8 })` in `overview.tsx`
- [x] `feat(FR3)`: Add `const { profile: hourlyProfile, focusWindow, aiHotZone } = useHourlyInsights();` call in data section of `overview.tsx`
- [x] `feat(FR4)`: Add conditional `HourlyPatternCard` JSX after WORK PATTERN block, at stagger index 7, guarded by `hourlyProfile && (...)`
- [x] Verify no double `Card` wrapping (component provides its own)
- [x] Run test suite — all tests green (4653 passing)

**Commits:**
- `feat(FR1-FR4): wire HourlyPatternCard into overview.tsx`
- `fix(04-overview-integration): update stale stagger-count tests`

---

## Phase 4.2 — Review

Sequential gates. Run in order.

- [x] `spec-implementation-alignment`: Validate all 4 FRs are implemented as specified — PASS
- [x] `pr-review-toolkit:review-pr`: Full PR review pass — PASS, no issues found
- [x] Address any feedback from review — no changes needed
- [x] `test-optimiser`: Review tests for coverage gaps or redundancy — PASS

---

## Session Notes

**2026-06-10**: Implementation complete.
- Phase 4.0: 1 test commit (17 tests, 15 red → green)
- Phase 4.1: 2 commits — feat(FR1-FR4) implementation + fix for stale stagger-count tests in overview-day-pattern + useStaggeredEntry test files
- Phase 4.2: Review passed, no fixes required. Test optimizer confirmed no changes needed.
- All 4653 tests passing.
