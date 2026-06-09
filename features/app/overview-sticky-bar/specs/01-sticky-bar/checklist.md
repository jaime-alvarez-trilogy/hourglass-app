# Checklist: 01-sticky-bar — OverviewStickyBar Component

**Spec:** features/app/overview-sticky-bar/specs/01-sticky-bar/spec.md
**Status:** Not Started

---

## Phase 1.0 — Tests (Red Phase)

Write all tests first. They must FAIL before implementation begins.

### FR1 — Component file exists and exports

- [ ] `test(FR1): SC1.1 — file exists at src/components/OverviewStickyBar.tsx`
- [ ] `test(FR1): SC1.2 — exports OverviewStickyBar as named export`
- [ ] `test(FR1): SC1.3 — props interface includes all 8 props`

### FR2 — Static visual structure

- [ ] `test(FR2): SC2.1 — root is Animated.View receiving animatedStyle`
- [ ] `test(FR2): SC2.2 — renders snapLabel text`
- [ ] `test(FR2): SC2.3 — renders 4 metric columns with labels`
- [ ] `test(FR2): SC2.4 — earnings uses colors.gold`
- [ ] `test(FR2): SC2.5 — AI% uses colors.cyan`
- [ ] `test(FR2): SC2.6 — BrainLift uses colors.violet`
- [ ] `test(FR2): SC2.7 — hours uses computeSnapshotHoursColor logic`
- [ ] `test(FR2): SC2.8 — root uses colors.surfaceElevated background`

### FR3 — Pointer events

- [ ] `test(FR3): SC3.1 — pointerEvents auto/none driven by isActive`

### FR4 — Value formatting

- [ ] `test(FR4): SC4.1 — earnings formatted as $N,NNN`
- [ ] `test(FR4): SC4.2 — hours formatted as N.Nh`
- [ ] `test(FR4): SC4.3 — AI% formatted as N%`
- [ ] `test(FR4): SC4.4 — BrainLift formatted as N.Nh`

### FR5 — overview.tsx integration

- [ ] `test(FR5): SC5.1 — overview.tsx imports OverviewStickyBar`
- [ ] `test(FR5): SC5.2 — overview.tsx uses <OverviewStickyBar`
- [ ] `test(FR5): SC5.3 — overview.tsx still contains panelStyle`
- [ ] `test(FR5): SC5.4 — overview.tsx still contains all 4 shared value declarations`
- [ ] `test(FR5): SC5.5 — existing useStaggeredEntry.test.ts panelStyle assertion still passes`

### Red Phase Validation

- [ ] Run `npx jest --runInBand src/components/__tests__/OverviewStickyBar.test.tsx`
- [ ] Confirm all new tests FAIL (red)
- [ ] Confirm `npx jest --runInBand src/hooks/__tests__/useStaggeredEntry.test.ts` still PASSES
- [ ] Commit: `test(FR1-FR5): add OverviewStickyBar tests`

---

## Phase 1.1 — Implementation (Green Phase)

### Wave 1 — FR1 (independent)

- [ ] Create `src/components/OverviewStickyBar.tsx` with props interface and named export
- [ ] Commit: `feat(FR1): create OverviewStickyBar component skeleton`

### Wave 2 — FR2, FR3, FR4 (parallel, depend on FR1)

- [ ] Implement FR2: Animated.View root + snapLabel + 4 metric columns with colors
- [ ] Implement FR3: `pointerEvents={isActive ? 'auto' : 'none'}`
- [ ] Implement FR4: format helpers (Math.round + toLocaleString, toFixed(1), Math.round + %)
- [ ] Inline `computeSnapshotHoursColor` (do not import from app/)
- [ ] Commit: `feat(FR2-FR4): implement OverviewStickyBar structure, pointer events, formatting`

### Wave 3 — FR5 (depends on FR1-FR4)

- [ ] Add `import { OverviewStickyBar } from '@/src/components/OverviewStickyBar'` to overview.tsx
- [ ] Replace 40-line inline Animated.View block with `<OverviewStickyBar .../>` usage
- [ ] Verify `panelStyle`, `panelOpacity`, `panelTranslateY`, `panelHeight`, `panelMarginBottom` still present in overview.tsx
- [ ] Commit: `feat(FR5): wire OverviewStickyBar into overview.tsx`

### Integration Verification

- [ ] Run `npx jest --runInBand src/components/__tests__/OverviewStickyBar.test.tsx` — all PASS
- [ ] Run `npx jest --runInBand src/hooks/__tests__/useStaggeredEntry.test.ts` — all PASS
- [ ] Run `npx jest --runInBand` (full suite) — no regressions

---

## Phase 1.2 — Review

### Alignment Check

- [ ] Run spec-implementation-alignment check
- [ ] All FR success criteria satisfied

### PR Review

- [ ] Run `pr-review-toolkit:review-pr`
- [ ] Address any blocking feedback

### Test Optimization

- [ ] Run test-optimiser on `src/components/__tests__/OverviewStickyBar.test.tsx`
- [ ] Verify no redundant assertions

### Final Sign-off

- [ ] All tests passing (`npx jest --runInBand`)
- [ ] No TypeScript errors
- [ ] overview.tsx line count reduced (inline block replaced)
- [ ] checklist.md fully checked off
- [ ] FEATURE.md changelog updated

---

## Notes

- Test strategy: static analysis only (fs.readFileSync pattern)
- `computeSnapshotHoursColor` is INLINED in OverviewStickyBar.tsx (not imported from app/)
- `panelStyle` string MUST remain in overview.tsx (existing test constraint)
- Do NOT modify `src/hooks/__tests__/useStaggeredEntry.test.ts`
