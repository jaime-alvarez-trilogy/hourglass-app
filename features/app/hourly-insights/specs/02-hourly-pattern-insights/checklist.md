# Checklist: 02-hourly-pattern-insights

**Spec:** `hourglassws/features/app/hourly-insights/specs/02-hourly-pattern-insights/spec.md`
**Status:** Complete

---

## Phase 2.0 — Tests (Red Phase)

Write failing tests for all FRs. Tests must fail before implementation begins.

### FR1 — `computeHourlyProfile`

- [x] `test(FR1)` Happy path: 4 weeks with only hour 9 active → `avgSlots[9]=5, avgIntensity[9]=80, avgAIRate[9]=1.0, avgProductiveRate[9]=1.0`, all other hours NaN, `activeWindow=[9,9]`, `weeksCovered=4`
- [x] `test(FR1)` Returns `null` for fewer than 4 valid weeks (e.g. 3 valid weeks)
- [x] `test(FR1)` Returns `null` for empty array
- [x] `test(FR1)` Mixed snapshots: some with new hourly fields, some without → only valid snapshots contribute; still returns null if valid < 4
- [x] `test(FR1)` Hours at boundaries (h=0, h=23) correctly included in averaging
- [x] `test(FR1)` `hourlySlots[h]=0` for a given week/hour → that week excluded from `avgIntensity[h]` average (NaN result if all weeks have 0 at that hour)
- [x] `test(FR1)` All `avgSlots[h] < 0.5` → `activeWindow` defaults to `[0, 23]`
- [x] `test(FR1)` All returned arrays are exactly 24 elements
- [x] `test(FR1)` `weeksCovered` equals count of valid (not total) snapshots

### FR2 — `inferFocusWindow`

- [x] `test(FR2)` Hour 9 at intensity 90, hours 8 and 10 at 60 (66% ≥ 60%) → `peakRange=[8,10]`, `peakIntensity` ≈ mean(60,90,60)=70
- [x] `test(FR2)` Expansion capped at 4 hours even when more neighbors qualify
- [x] `test(FR2)` Hours 8–11 all at identical intensity → range is exactly `[8,11]`
- [x] `test(FR2)` Peak intensity < 20 → returns `null`
- [x] `test(FR2)` Only 1 valid hour in activeWindow → `peakRange=[h,h]`
- [x] `test(FR2)` All intensities NaN → returns `null`
- [x] `test(FR2)` Expansion clipped to `activeWindow` boundaries
- [x] `test(FR2)` `weeksCovered` matches `profile.weeksCovered`

### FR3 — `inferAIHotZone`

- [x] `test(FR3)` Hour 10 at aiRate 0.8, hour 11 at 0.6 (75% ≥ 70%) → `hotRange=[10,11]`
- [x] `test(FR3)` Hour 10 at aiRate 0.8, hour 11 at 0.5 (62% < 70%) → `hotRange=[10,10]`
- [x] `test(FR3)` Both neighbors qualify → only stronger side expanded (range stays ≤ 2 hours)
- [x] `test(FR3)` Max AI rate < 0.10 → returns `null`
- [x] `test(FR3)` All hours NaN → returns `null`
- [x] `test(FR3)` `aiRate` equals mean of `avgAIRate` over `hotRange`
- [x] `test(FR3)` `weeksCovered` matches `profile.weeksCovered`

### FR4 — `formatHour`

- [x] `test(FR4)` `0` → `"12am"`
- [x] `test(FR4)` `12` → `"12pm"`
- [x] `test(FR4)` `1` → `"1am"`, `11` → `"11am"` (no leading zeros)
- [x] `test(FR4)` `13` → `"1pm"`, `23` → `"11pm"`
- [x] `test(FR4)` `9` → `"9am"`

### FR5 — `useHourlyInsights`

- [x] `test(FR5)` Returns `{ profile: null, focusWindow: null, aiHotZone: null }` when snapshots is empty
- [x] `test(FR5)` Re-computes when `snapshots` reference changes (useMemo dependency test)
- [x] `test(FR5)` Stable reference when snapshots unchanged (no unnecessary re-renders)
- [x] `test(FR5)` Returns populated `HourlyInsights` when ≥4 valid snapshots provided

---

## Phase 2.1 — Implementation (Green Phase)

Implement each FR to make its tests pass. Run tests after each FR before proceeding.

- [x] `feat(FR1)` Implement `computeHourlyProfile` in `src/lib/hourlyInsights.ts` (includes type definitions for `HourlyProfile`, `FocusWindow`, `AIHotZone`, `HourlyInsights`)
- [x] `feat(FR2)` Implement `inferFocusWindow` in `src/lib/hourlyInsights.ts`
- [x] `feat(FR3)` Implement `inferAIHotZone` in `src/lib/hourlyInsights.ts`
- [x] `feat(FR4)` Implement `formatHour` in `src/lib/hourlyInsights.ts`
- [x] `feat(FR5)` Implement `useHourlyInsights` in `src/hooks/useHourlyInsights.ts`
- [x] Run full test suite; all tests pass

---

## Phase 2.2 — Review

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
| `src/lib/hourlyInsights.ts` | Created |
| `src/hooks/useHourlyInsights.ts` | Created |
| `src/lib/__tests__/hourlyInsights.test.ts` | Created |
| `src/hooks/__tests__/useHourlyInsights.test.ts` | Created |

---

## Session Notes

**2026-06-10**: Implementation complete.
- Phase 2.0: 1 test commit (`test(FR1-FR5)`) — 49 tests across FR1–FR5
- Phase 2.1: 1 implementation commit (`feat(FR1-FR5)`) — `hourlyInsights.ts` (245 lines) + `useHourlyInsights.ts` (27 lines)
- Phase 2.2: Review passed. 2 fix commits:
  - `fix(02-hourly-pattern-insights)`: JSDoc wording clarification + hoist withSlots per hour (d08450c)
  - `fix(02-hourly-pattern-insights)`: Strengthen SC2.2 and SC2.3 test assertions (4d4c7f3)
- All 49 tests passing. Full suite clean.
