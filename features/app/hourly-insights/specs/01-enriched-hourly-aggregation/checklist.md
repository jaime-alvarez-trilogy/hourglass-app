# Checklist: 01-enriched-hourly-aggregation

**Spec:** [spec.md](spec.md)
**Phase prefix:** `1.`

---

## Phase 1.0 — Tests (red phase)

### FR1: Extend `WeeklySnapshot` type (`src/lib/weeklyHistory.ts`)

- [x] `test(FR1)`: `mergeWeeklySnapshot` — partial with all three new fields writes them to new entry
- [x] `test(FR1)`: `mergeWeeklySnapshot` — partial without new fields leaves existing entry's new fields unchanged
- [x] `test(FR1)`: `mergeWeeklySnapshot` — merge into existing entry that had no new fields adds them
- [x] `test(FR1)`: `mergeWeeklySnapshot` — `hourlyIntensity` stored as-is (sum, not pre-divided)

### FR2: `computeHourlyEnrichment` helper (`src/hooks/useHistoryBackfill.ts`)

- [x] `test(FR2)`: empty `slotsData {}` → all four arrays are `new Array(24).fill(0)`
- [x] `test(FR2)`: single slot, `intensityScore: 80`, `tags: ["ai_usage"]`, `productivityCategory: "PRODUCTIVE"` → correct per-hour accumulation in all four arrays
- [x] `test(FR2)`: slot with `tags: ["second_brain"]` → `hourlyAISlots[h]` incremented (same bucket as ai_usage)
- [x] `test(FR2)`: slot with `tags: []`, `productivityCategory: "COMMUNICATION"` → `hourlyAISlots[h]=0, hourlyProductiveSlots[h]=0`, `hourlySlots[h]` incremented
- [x] `test(FR2)`: multiple slots at same hour → `hourlyIntensity[h]` is sum (not avg) of all intensityScores
- [x] `test(FR2)`: slots across multiple hours in one day → correct per-hour accumulation
- [x] `test(FR2)`: `slotsData` with 7 days → all days' slots accumulated into same 24 buckets
- [x] `test(FR2)`: slot with `intensityScore: undefined` → treated as 0, no NaN
- [x] `test(FR2)`: slot at hour boundary → device-local hour incremented
- [x] `test(FR2)`: slot with invalid/unparseable date → skipped (NaN guard via `!Number.isFinite`)

### FR3: Backfill guard detects missing new fields (`src/hooks/useHistoryBackfill.ts`)

- [x] `test(FR3)`: entry with `hourlySlots` defined but `hourlyIntensity === undefined` → included in `weeksToFill`
- [x] `test(FR3)`: entry with `hourlyAISlots === undefined` → included in `weeksToFill`
- [x] `test(FR3)`: entry with `hourlyProductiveSlots === undefined` → included in `weeksToFill`
- [x] `test(FR3)`: entry with all new fields defined (and other guard conditions satisfied) → NOT included in `weeksToFill`

### FR4: Call site updated (`src/hooks/useHistoryBackfill.ts`)

- [x] `test(FR4)`: `computeHourlyEnrichment` output spread into `mergeWeeklySnapshot` — `hourlySlots` values match what `computeHourlySlots` would have returned for the same input
- [x] `test(FR4)`: all three new fields present on snapshot after backfill pass

---

## Phase 1.1 — Implementation

### FR1: Extend `WeeklySnapshot` type

- [x] `feat(FR1)`: add `hourlyIntensity?: number[]` to `WeeklySnapshot` with JSDoc
- [x] `feat(FR1)`: add `hourlyAISlots?: number[]` to `WeeklySnapshot` with JSDoc
- [x] `feat(FR1)`: add `hourlyProductiveSlots?: number[]` to `WeeklySnapshot` with JSDoc
- [x] `feat(FR1)`: extend `mergeWeeklySnapshot` new-entry block with three conditional spreads
- [x] `feat(FR1)`: extend `mergeWeeklySnapshot` merge path (via `{...s, ...partial}` spread)
- [x] `feat(FR1)`: TypeScript compiles without error (`tsc --noEmit`) — no new errors in source files

### FR2: Add `computeHourlyEnrichment` fused helper

- [x] `feat(FR2)`: add `HourlyEnrichment` interface to `useHistoryBackfill.ts`
- [x] `feat(FR2)`: implement `computeHourlyEnrichment` with fused single-pass loop
- [x] `feat(FR2)`: `!Number.isFinite(hour)` guard before range check
- [x] `feat(FR2)`: `intensityScore ?? 0` null-coalesce
- [x] `feat(FR2)`: `computeHourlySlots` export unchanged

### FR3: Update backfill guard

- [x] `feat(FR3)`: add three OR conditions to `weeksToFill` guard for new fields being `undefined`

### FR4: Replace call site

- [x] `feat(FR4)`: replace `computeHourlySlots(slotsData)` call with `computeHourlyEnrichment(slotsData)`
- [x] `feat(FR4)`: spread `...enrichment` into `mergeWeeklySnapshot` call
- [x] `feat(FR4)`: full test suite passes — 4544 tests across 162 suites, zero regressions

---

## Phase 1.2 — Review

- [x] Run `spec-implementation-alignment` check — all 4 FRs aligned with spec contracts
- [x] Run diff review — implementation clean, no issues found
- [x] Address any feedback — no issues to address
- [x] TypeScript compiles without error in source files (weeklyHistory.ts, useHistoryBackfill.ts)
- [x] All tests pass (`cd hourglassws && npx jest --runInBand` — 4544 tests, 162 suites)

## Session Notes

**2026-06-10**: Spec execution complete.
- Phase 1.0: 4 test commits (all FR1-FR4 tests, 22 new tests, red phase confirmed)
- Phase 1.1: 3 implementation commits (feat(FR1), feat(FR2), feat(FR3-FR4))
- Phase 1.2: 1 fix commit (TS cast), alignment check passed, all tests green
- 61 tests in useHistoryBackfill.test.ts (39 pre-existing + 22 new), all passing
- Full suite: 4544 tests, 0 regressions
