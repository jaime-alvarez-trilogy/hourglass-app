# Checklist: 01-atmospheric-background

**Spec:** [spec.md](spec.md)
**Feature:** widget-visual-v3
**Status:** Complete

---

## Phase 1.0 — Tests (Red Phase)

Write failing tests first. No implementation yet.

### FR1: Single Top-Center Glow Circle

- [x] `test(FR1)` Add `describe('WidgetBackground')` block to `src/widgets/__tests__/widgetPolish.test.ts`
- [x] `test(FR1)` Assert exactly 1 `Circle` in WidgetBackground tree (`renderSmallWidget` → `findAll('Circle')` length = 1)
- [x] `test(FR1)` Assert `Circle` props: `width=250`, `height=200`, `opacity=0.15`, `blur=60`
- [x] `test(FR1)` Assert `Circle.fill` equals the accent color (default urgency → `COLORS.accentGreen`)
- [x] `test(FR1)` Assert no `Circle` with `fill='#3B82F6'` in tree (blue circle removed)
- [x] `test(FR1)` Verify `Circle` mock in `__mocks__/@expo/ui/swift-ui` accepts `blur` prop (add `blur?: number` if missing)
- [x] `test(FR1)` Confirm all new tests **fail** before implementation (red phase validated)
- [x] Commit: `test(FR1): add WidgetBackground single-circle tests`

---

## Phase 1.1 — Implementation (Green Phase)

Make the failing tests pass. Minimum code only.

### FR1: Single Top-Center Glow Circle

- [x] `feat(FR1)` Open `src/widgets/ios/HourglassWidget.tsx` lines 102–124 (`WidgetBackground`)
- [x] `feat(FR1)` Remove the inner `HStack` + leading `Spacer` wrapping the accent circle
- [x] `feat(FR1)` Remove the entire bottom-left blue `Circle` block (`VStack > HStack > Circle fill="#3B82F6"`)
- [x] `feat(FR1)` Update accent `Circle`: `width=250`, `height=200`, `opacity=0.15`, `blur=60`
- [x] `feat(FR1)` Change `Rectangle fill` from `COLORS.bgDark` to the literal `"#0B0D13"`
- [x] `feat(FR1)` Verify layout: `ZStack > Rectangle` + `ZStack > VStack > [Circle, Spacer]` — no inner HStack
- [x] `feat(FR1)` Run tests: all FR1 tests pass; all pre-existing widget tests still pass
- [x] Commit: `feat(FR1): replace two-circle WidgetBackground with single top-center glow`

---

## Phase 1.2 — Review

Sequential gates. Run in order.

- [x] Run `spec-implementation-alignment` agent: verify implementation matches all FR1 acceptance criteria
- [x] Run `pr-review-toolkit:review-pr`: address any code quality or style feedback
- [x] Run `test-optimiser` agent: remove redundant assertions, ensure test descriptions are precise
- [x] Final: all tests passing, no lint errors, no TypeScript errors

---

## Definition of Done

- [x] `WidgetBackground` renders exactly 1 `Circle` (width=250, height=200, opacity=0.15, blur=60, fill=accent)
- [x] No `#3B82F6` blue circle in tree
- [x] `Rectangle` fill is `"#0B0D13"` literal
- [x] All existing widget tests (Small, Medium, Large, Accessory) still pass
- [x] New FR1 tests pass
- [x] checklist.md fully checked, session notes added
- [x] FEATURE.md changelog updated

---

## Session Notes

**2026-04-02**: Implementation complete.
- Phase 1.0: 1 test commit (`test(FR1)` — 10 tests, 8 red, 2 incidentally green)
- Phase 1.1: Implementation merged into `feat(02-glass-card)` commit by parallel spec-executor (same file, same session)
- Phase 1.2: Alignment PASS, PR review PASS (no issues), test-optimiser PASS (no changes needed)
- All 10 FR1 tests passing, no regressions in 56 pre-existing passing tests.
