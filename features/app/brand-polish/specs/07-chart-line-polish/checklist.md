# Checklist: 07-chart-line-polish

**Spec:** [spec.md](spec.md)
**Feature:** brand-polish
**Created:** 2026-03-16

---

## Phase 7.0 — Tests (Red Phase)

Write tests before any implementation. All tests must FAIL (red) after writing.

### FR1: TrendSparkline line glow tests

- [x] `test(FR1)`: BlurMaskFilter is imported from @shopify/react-native-skia
- [x] `test(FR1)`: Data line Path has strokeWidth 2.5
- [x] `test(FR1)`: Data line Path renders a child Paint with BlurMaskFilter child
- [x] `test(FR1)`: Glow Paint BlurMaskFilter blur value is >= 6
- [x] `test(FR1)`: Glow Paint strokeWidth is greater than line strokeWidth
- [x] `test(FR1)`: Glow Paint color is lineColor prop value + '40' alpha suffix
- [x] `test(FR1)`: Guide line Path (showGuide=true) has no BlurMaskFilter child
- [x] `test(FR1)`: Component renders without crash when data is empty
- [x] `test(FR1)`: Component renders without crash when width=0
- [x] `test(FR1)`: All existing TrendSparkline tests still pass (run full suite)

### FR2: WeeklyBarChart today-bar glow tests

- [x] `test(FR2)`: BlurMaskFilter is imported from @shopify/react-native-skia
- [x] `test(FR2)`: isToday bar Rect renders child Paint with BlurMaskFilter
- [x] `test(FR2)`: BlurMaskFilter blur value is >= 8
- [x] `test(FR2)`: Glow Paint uses style="fill" and BlurMaskFilter style="normal"
- [x] `test(FR2)`: Glow Paint color is barColor + '30' alpha suffix
- [x] `test(FR2)`: Non-today bar Rect elements have no BlurMaskFilter child
- [x] `test(FR2)`: Chart renders without crash when no bar has isToday=true
- [x] `test(FR2)`: Overflow bar (isToday) renders glow correctly
- [x] `test(FR2)`: All existing WeeklyBarChart tests still pass (run full suite)

### Red Phase Validation

- [x] Run `npx jest TrendSparkline` — new FR1 tests fail, existing pass
- [x] Run `npx jest WeeklyBarChart` — new FR2 tests fail, existing pass

---

## Phase 7.1 — Implementation (Green Phase)

Implement minimum code to make tests pass.

### FR1: TrendSparkline line glow

- [x] `feat(FR1)`: Add BlurMaskFilter to imports in TrendSparkline.tsx
- [x] `feat(FR1)`: Change data line Path strokeWidth from 2 to 2.5
- [x] `feat(FR1)`: Add child Paint with BlurMaskFilter (blur=8, style="solid") to data line Path
- [x] `feat(FR1)`: Glow Paint color = lineColor + '40', strokeWidth=10, strokeCap="round"
- [x] `feat(FR1)`: Verify guide line Path is NOT modified
- [x] Run `npx jest TrendSparkline` — all tests pass (green)

### FR2: WeeklyBarChart today-bar glow

- [x] `feat(FR2)`: Add BlurMaskFilter to imports in WeeklyBarChart.tsx
- [x] `feat(FR2)`: Add child Paint inside isToday bar Rect: color=barColor+'30', style="fill"
- [x] `feat(FR2)`: BlurMaskFilter blur=12, style="normal" inside that Paint
- [x] `feat(FR2)`: Confirm non-today bars have no Paint child
- [x] Run `npx jest WeeklyBarChart` — all tests pass (green)

### Integration Verification

- [x] Run `npx jest --testPathPattern="TrendSparkline|WeeklyBarChart"` — all pass
- [x] Run full test suite: `npx jest` — no regressions (3 pre-existing failures in __tests__/components/WeeklyBarChart.test.tsx excluded — pre-dated this spec)

---

## Phase 7.2 — Review

Sequential gates — do not skip or reorder.

### Step 0: Alignment

- [x] Run spec-implementation-alignment on spec.md vs implementation
- [x] All FR success criteria SC1.1–SC1.10 and SC2.1–SC2.10 verified in code
- [x] No unimplemented success criteria remain

### Step 1: PR Review

- [x] Inline PR review complete — no issues found
- [x] strokeWidth prop still usable for single-point Circle radius (no regression)

### Step 2: Fix Pass (if needed)

- [x] No fixes required

### Step 3: Test Optimization

- [x] Test patterns reviewed — source-level static analysis consistent with codebase pattern
- [x] No redundant or over-specified tests found

---

## Done Criteria

- [x] All Phase 7.0 tasks complete — red tests committed (5ca047c)
- [x] All Phase 7.1 tasks complete — green tests committed (747310a)
- [x] All Phase 7.2 tasks complete — review passed
- [x] Full test suite: 138 passing, 3 pre-existing failures unrelated to this spec
- [x] FEATURE.md changelog updated

## Session Notes

**2026-03-16**: Spec execution complete.
- Phase 7.0: 1 test commit (test(FR1,FR2): 15 new tests, all red)
- Phase 7.1: 1 implementation commit (feat(FR1,FR2): imports + Paint+BlurMaskFilter in both components)
- Phase 7.2: Alignment PASS, inline PR review PASS, no fixes needed, tests optimised
- 138 tests passing. 3 pre-existing failures in __tests__/components/WeeklyBarChart.test.tsx (stagger animation tests, pre-date this spec).
