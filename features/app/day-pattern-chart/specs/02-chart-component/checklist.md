# Checklist: 02-chart-component

## Phase 2.0 — Tests (Red Phase)

Write all tests before implementation. Every test must fail (red) before implementation begins.

### FR1 — Component File and Exports

- [x] SC1.1: Test — file exists at `src/components/DayPatternChart.tsx`
- [x] SC1.2: Test — exports `DayPatternChart` function
- [x] SC1.3: Test — exports `DayPatternChartProps` interface
- [x] SC1.4: Test — props include `current: number[]`, `prev?: number[] | null`, `width: number`, `height: number`, `trendThreshold?: number`

### FR2 — Bar Rendering

- [x] SC2.1: Test — source maps over 7 day indices
- [x] SC2.2: Test — bar height derived from `maxHours` (source contains `Math.max`)
- [x] SC2.3: Test — minimum bar height stub present (contains `Math.max(` or literal `2`)
- [x] SC2.4: Test — imports `colors` from `@/src/lib/colors`
- [x] SC2.5: Test — uses `colors.success` for work day bars
- [x] SC2.6: Test — uses `colors.surface` for rest-day stub

### FR3 — Trend Arrows

- [x] SC3.1: Test — source computes `delta` between `current[i]` and `prev[i]`
- [x] SC3.2: Test — up-arrow rendered when `delta >= trendThreshold`
- [x] SC3.3: Test — down-arrow rendered when `delta <= -trendThreshold`
- [x] SC3.4: Test — no arrow when `prev` is null or undefined (guard present)
- [x] SC3.5: Test — no arrow on rest days (`current[i] < 0.5` guard present)
- [x] SC3.6: Test — imports `TREND_THRESHOLD` from `@/src/lib/dayPatternUtils`

### FR4 — Day Labels

- [x] SC4.1: Test — source contains `DAY_LABELS` or equivalent 7-element array
- [x] SC4.2: Test — labels array contains `'M'` and `'S'` entries
- [x] SC4.3: Test — rest-day labels use `colors.textMuted`

### FR5 — Arrow Colors

- [x] SC5.1: Test — up-arrow uses `colors.success`
- [x] SC5.2: Test — down-arrow uses `colors.warning`

### Smoke Tests

- [x] Smoke: component renders without crash with valid `current` + `prev` arrays
- [x] Smoke: component renders without crash with `prev = null`
- [x] Smoke: component renders without crash with `prev = undefined`
- [x] Smoke: component renders without crash with all-zero `current`

---

## Phase 2.1 — Implementation

Implement minimum code to pass all Phase 2.0 tests.

- [x] FR1: Create `src/components/DayPatternChart.tsx` with `DayPatternChartProps` interface and `DayPatternChart` component export
- [x] FR2: Implement 7-bar layout with proportional bar heights, `colors.success` / `colors.surface` coloring, 2px minimum stub for rest days
- [x] FR3: Implement delta computation and arrow rendering (up above bar zone, down inside bar top); guard on null/undefined `prev` and rest days
- [x] FR4: Render `DAY_LABELS` below each bar; `colors.textSecondary` for work days, `colors.textMuted` for rest days
- [x] FR5: Apply `colors.success` to up-arrow, `colors.warning` to down-arrow
- [x] Run all tests: `npx jest src/components/__tests__/DayPatternChart.test.tsx --runInBand`
- [x] Confirm all tests pass (green) — 26/26

---

## Phase 2.2 — Review

- [x] spec-implementation-alignment: validate DayPatternChart.tsx against spec.md — PASS (all 21 SC verified)
- [x] pr-review-toolkit:review-pr: full PR review pass — no critical issues; `as any` on string % width noted as acceptable RN pattern
- [x] Address any review feedback — no changes needed
- [x] test-optimiser: review test file for redundancy or gaps — added width=0 smoke test
- [x] Run full test suite: `npx jest --runInBand` — 157 suites, 4379 tests, 0 failures

---

## Session Notes

**2026-06-06**: Implementation complete.
- Phase 2.0: 1 test commit (test(FR1-FR5): 26 tests, all red)
- Phase 2.1: 1 implementation commit (feat(FR1-FR5)) + 1 test-fix commit (fix SC2.3 regex)
- Phase 2.2: 1 fix commit (add width=0 smoke test)
- All 27 tests passing; full suite 4379 tests passing, zero regressions.
