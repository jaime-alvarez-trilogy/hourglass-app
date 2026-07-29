# Checklist: 03-hourly-pattern-card

**Spec:** [spec.md](spec.md)
**Feature:** hourly-insights
**Created:** 2026-06-10

---

## Phase 3.0 — Tests (Red Phase)

Write tests first. All tests should fail (red) before implementation begins.

**File:** `hourglassws/src/components/__tests__/HourlyPatternCard.test.tsx`

### FR1 — Color interpolation helpers

- [x] `test(FR1)`: `_barColor(0)` returns `colors.surface`
- [x] `test(FR1)`: `_barColor(0.5)` returns `colors.cyan`
- [x] `test(FR1)`: `_barColor(1.0)` returns `colors.violet`
- [x] `test(FR1)`: `_barColor(NaN)` returns `colors.surface`
- [x] `test(FR1)`: `_barColor(0.25)` returns a color between surface and cyan (not equal to either)
- [x] `test(FR1)`: `_lerpColor` is pure — same inputs same output

### FR2 — Bar rendering

- [x] `test(FR2)`: renders exactly 4 bars for `activeWindow=[8,11]`
- [x] `test(FR2)`: bar for peak-slot hour (h9, slots=5) has height >= bar for h11 (slots=2)
- [x] `test(FR2)`: minimum bar height is 2px — zero-slot hour renders a 2px tick
- [x] `test(FR2)`: bar fill for `avgAIRate=0.9` is more violet than bar fill for `avgAIRate=0.6`
- [x] `test(FR2)`: `width=0` returns null without crashing

### FR3 — Focus window and AI zone overlays

- [x] `test(FR3)`: focus overlay View is present when `focusWindow !== null`
- [x] `test(FR3)`: focus overlay spans columns 0–2 (h8–h10) for `peakRange=[8,10]` in `activeWindow=[8,11]`
- [x] `test(FR3)`: AI overlay is absent when it overlaps focus window (hotRange=[9,10] overlaps peakRange=[8,10])
- [x] `test(FR3)`: no overlay when `focusWindow=null, aiHotZone=null`
- [x] `test(FR3)`: AI overlay renders when `focusWindow=null, aiHotZone≠null`

### FR4 — Text summary rows

- [x] `test(FR4)`: "FOCUS PEAK" label always present in render tree
- [x] `test(FR4)`: "AI PEAK" label always present in render tree
- [x] `test(FR4)`: Focus Peak value shows formatted range + intensity when `focusWindow !== null`
- [x] `test(FR4)`: Focus Peak value shows "—" when `focusWindow === null`
- [x] `test(FR4)`: AI Peak value shows formatted range + percentage when `aiHotZone !== null`
- [x] `test(FR4)`: AI Peak value shows "—" when `aiHotZone === null`

---

## Phase 3.1 — Implementation (Green Phase)

Make tests pass. Minimum code to satisfy success criteria.

**File:** `hourglassws/src/components/HourlyPatternCard.tsx`

### FR1 — Color interpolation helpers

- [x] `feat(FR1)`: implement `_lerpColor(from, to, t)` — hex RGB linear interpolation, t clamped to [0,1]
- [x] `feat(FR1)`: implement `_barColor(aiRate)` — two-stop gradient surface→cyan (0–0.5) / cyan→violet (0.5–1.0); NaN → surface

### FR2 — Bar rendering

- [x] `feat(FR2)`: clip bars to `activeWindow` — render exactly `hi - lo + 1` bars
- [x] `feat(FR2)`: compute `colW = width / barCount`, `barW = colW * 0.65`
- [x] `feat(FR2)`: bar height = `max((avgSlots[h] / peakSlots) * height, 2)` where `peakSlots = max(...window, 1)`
- [x] `feat(FR2)`: bar backgroundColor = `_barColor(profile.avgAIRate[h])`
- [x] `feat(FR2)`: `if (width === 0) return null` guard

### FR3 — Focus window and AI zone overlays

- [x] `feat(FR3)`: focus overlay — absolute View, gold at 15% opacity, positioned by `peakRange` columns
- [x] `feat(FR3)`: AI overlay — absolute View, violet at 15% opacity, positioned by `hotRange` columns; suppress when overlapping focus
- [x] `feat(FR3)`: overlap detection: `aiHotZone.hotRange[0] <= focusWindow.peakRange[1] && aiHotZone.hotRange[1] >= focusWindow.peakRange[0]`
- [x] `feat(FR3)`: null guards — no overlay rendered when window/zone is null

### FR4 — Text summary rows

- [x] `feat(FR4)`: render two summary rows below bars — always rendered, not conditional
- [x] `feat(FR4)`: Focus Peak label "FOCUS PEAK" + value `formatHour(start)–formatHour(end) (avg N intensity)` or "—"
- [x] `feat(FR4)`: AI Peak label "AI PEAK" + value `formatHour(start)–formatHour(end) (N%)` or "—"
- [x] `feat(FR4)`: use `formatHour` from `src/lib/hourlyInsights.ts`

---

## Phase 3.2 — Review

Run these steps in order after all tests pass.

- [x] Run spec-implementation-alignment check — PASS, all FRs verified
- [x] Run PR review — no blocking findings
- [x] Run test-optimiser — no redundant tests found

---

## Definition of Done

- [x] All Phase 3.0 tests written and confirmed red before implementation
- [x] All Phase 3.1 tasks complete — tests green
- [x] Full test suite passes: 43/43 HourlyPatternCard, 4636/4636 total
- [x] Phase 3.2 review complete with no blocking findings
- [x] `HourlyPatternCard` exported from `src/components/HourlyPatternCard.tsx`
- [x] `_lerpColor`, `_barColor` exported for test access
- [x] No new TypeScript errors in component file
- [x] Task #32 in TaskList updated to `completed`

---

## Session Notes

**2026-06-10**: Spec execution complete.
- Phase 3.0: 1 test commit (`test(FR1-FR4)`) — 43 tests, confirmed red
- Phase 3.1: 1 implementation commit (`feat(FR1-FR4)`) — 43 tests green; 1 fix for `_barColor(0.5)` case-sensitivity (exact midpoint bypass)
- Phase 3.2: Alignment PASS, PR review clean, test optimization clean
- All 4636 tests passing (no regressions).
