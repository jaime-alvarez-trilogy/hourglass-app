# Checklist: 01-skia-gradient-bars

**Spec:** `hourglassws/features/app/hourly-chart-gradients/specs/01-skia-gradient-bars/spec.md`
**Status:** In Progress

---

## Phase 1.0 — Tests (Red Phase)

### FR1 — Canvas bar renderer

- [ ] `test(FR1)` SC1.1 — source imports Canvas, RoundedRect, LinearGradient, vec from @shopify/react-native-skia
- [ ] `test(FR1)` SC1.2 — source uses RoundedRect for bar rendering (not View backgroundColor)
- [ ] `test(FR1)` SC1.3 — source uses LinearGradient with _barColor() as first color stop + 'transparent' as second
- [ ] `test(FR1)` SC1.4 — bar corners use r={4}
- [ ] `test(FR1)` SC1.5 — smoke: renders without crash (Skia mock)
- [ ] `test(FR1)` SC1.6 — NaN aiRate: _barColor(NaN) = colors.surface → no crash
- [ ] `test(FR1)` SC1.7 — all-zero avgSlots: MIN_BAR_H floor → Canvas still renders
- [ ] `test(FR1)` SC1.8 — single-bar active window → renders fine

### FR2 — Entry animation

- [ ] `test(FR2)` SC2.1 — source imports Animated, useSharedValue, withTiming, useAnimatedStyle from react-native-reanimated
- [ ] `test(FR2)` SC2.2 — source imports timingChartFill from @/src/lib/reanimated-presets
- [ ] `test(FR2)` SC2.3 — source uses withTiming(1, timingChartFill) in useEffect with empty deps
- [ ] `test(FR2)` SC2.4 — smoke: renders without crash

### FR3 — Existing tests preserved

- [ ] `test(FR3)` SC3.1 — update SC2.6 assertion: _barColor() feeds LinearGradient colors[0], not backgroundColor on bars
- [ ] `test(FR3)` SC3.2 — run existing suite: all other 42 tests pass unchanged

---

## Phase 1.1 — Implementation (Green Phase)

- [ ] `feat(FR1)` Replace View bars with Canvas + RoundedRect + LinearGradient in HourlyPatternCard.tsx
- [ ] `feat(FR2)` Add Animated.View clip wrapper + useEffect withTiming(1, timingChartFill) animation
- [ ] Run full test suite; all tests pass

---

## Phase 1.2 — Review

Sequential gates — run in order, do not parallelize.

- [ ] `spec-implementation-alignment`: validate spec vs implementation
- [ ] `pr-review-toolkit:review-pr`: full PR review
- [ ] Address any review feedback
- [ ] `test-optimiser`: review tests for coverage and quality
- [ ] Final test suite run — all passing

---

## Files

| File | Status |
|---|---|
| `src/components/HourlyPatternCard.tsx` | Modified |
| `src/components/__tests__/HourlyPatternCard.test.tsx` | Modified (SC2.6 only) |
