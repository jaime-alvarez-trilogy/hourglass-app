# Checklist: 01-skia-gradient-bars

**Spec:** `hourglassws/features/app/hourly-chart-gradients/specs/01-skia-gradient-bars/spec.md`
**Status:** In Progress

---

## Phase 1.0 — Tests (Red Phase)

### FR1 — Canvas bar renderer

- [x] `test(FR1)` SC1.1 — source imports Canvas, RoundedRect, LinearGradient, vec from @shopify/react-native-skia
- [x] `test(FR1)` SC1.2 — source uses RoundedRect for bar rendering (not View backgroundColor)
- [x] `test(FR1)` SC1.3 — source uses LinearGradient with _barColor() as first color stop + 'transparent' as second
- [x] `test(FR1)` SC1.4 — bar corners use r={4}
- [x] `test(FR1)` SC1.5 — smoke: renders without crash (Skia mock)
- [x] `test(FR1)` SC1.6 — NaN aiRate: _barColor(NaN) = colors.surface → no crash
- [x] `test(FR1)` SC1.7 — all-zero avgSlots: MIN_BAR_H floor → Canvas still renders
- [x] `test(FR1)` SC1.8 — single-bar active window → renders fine

### FR2 — Entry animation

- [x] `test(FR2)` SC2.1 — source imports Animated, useSharedValue, withTiming, useAnimatedStyle from react-native-reanimated
- [x] `test(FR2)` SC2.2 — source imports timingChartFill from @/src/lib/reanimated-presets
- [x] `test(FR2)` SC2.3 — source uses withTiming(1, timingChartFill) in useEffect with empty deps
- [x] `test(FR2)` SC2.4 — smoke: renders without crash

### FR3 — Existing tests preserved

- [x] `test(FR3)` SC3.1 — update SC2.6 assertion: _barColor() feeds LinearGradient colors[0], not backgroundColor on bars
- [x] `test(FR3)` SC3.2 — run existing suite: all other 42 tests pass unchanged

---

## Phase 1.1 — Implementation (Green Phase)

- [x] `feat(FR1)` Replace View bars with Canvas + RoundedRect + LinearGradient in HourlyPatternCard.tsx
- [x] `feat(FR2)` Add Animated.View clip wrapper + useEffect withTiming(1, timingChartFill) animation
- [x] Run full test suite; all tests pass

---

## Phase 1.2 — Review

Sequential gates — run in order, do not parallelize.

- [x] `spec-implementation-alignment`: validate spec vs implementation
- [x] `pr-review-toolkit:review-pr`: full PR review
- [x] Address any review feedback
- [x] `test-optimiser`: review tests for coverage and quality
- [x] Final test suite run — all passing

---

## Files

| File | Status |
|---|---|
| `src/components/HourlyPatternCard.tsx` | Modified |
| `src/components/__tests__/HourlyPatternCard.test.tsx` | Modified (SC2.6 + 12 new tests) |

## Session Notes

**2026-06-10**: Implementation complete.
- Phase 1.0: 1 test commit (`test(FR1-FR3)`) — 12 new tests (8 FR1, 4 FR2), SC2.6 updated; 55 total passing
- Phase 1.1: 1 implementation commit (`feat(FR1-FR2)`) — Canvas+RoundedRect+LinearGradient replacing View bars; clip-reveal animation
- Phase 1.2: 2 fix commits
  - `fix(01-skia-gradient-bars)`: hooks-after-return violation (moved hooks before guard); barCount≤0 guard; Math.max(NaN) fix; cancelAnimation cleanup; tightened 4 test assertions + added negative
  - `fix(01-skia-gradient-bars)`: test-optimiser pass — anchored import assertions to actual import blocks (bare-word regexes were matching header comments); all 55 tests passing, 4665 total
