# Checklist: 01-hourly-data-layer

**Spec:** [spec.md](spec.md)
**Feature:** Hourly Work Patterns
**Status:** Complete

---

## Phase 1.0 — Tests (Red Phase)

Write tests first. All tests must fail before implementation begins.

### FR1: `WorkDiarySlot` type extension

- [x] `test(FR1)` — TypeScript compile check: `WorkDiarySlot` with all 7 new fields assigned is accepted (type-level test or compile-only assertion)
- [x] `test(FR1)` — `SecondBrainDeepDive` interface exported and assignable from prod sample JSON shape
- [x] `test(FR1)` — `secondBrainDeepDive: null` is assignable to `WorkDiarySlot.secondBrainDeepDive`
- [x] `test(FR1)` — existing `WorkDiarySlot` usage (tags, autoTracker, status, memo, actions, events) still compiles

### FR2: `WeeklySnapshot.hourlySlots` field

- [x] `test(FR2)` — `mergeWeeklySnapshot([], { weekStart, hourlySlots: new Array(24).fill(0) })` → returned entry has `hourlySlots` property
- [x] `test(FR2)` — `mergeWeeklySnapshot([existingWithHourlySlots], { weekStart })` (partial omits `hourlySlots`) → existing `hourlySlots` preserved on merged entry
- [x] `test(FR2)` — all-zero `hourlySlots` stored as-is (not filtered)
- [x] `test(FR2)` — existing `mergeWeeklySnapshot` call sites without `hourlySlots` compile and test-pass unchanged

### FR3: `computeHourlySlots`

- [x] `test(FR3)` — empty `slotsData {}` → returns array of length 24, all zeros
- [x] `test(FR3)` — single slot with known UTC `date` → correct local-hour bucket = 1, all others 0, sum = 1
- [x] `test(FR3)` — 3 slots at same UTC `date` → that bucket = 3
- [x] `test(FR3)` — slots at 3 distinct UTC dates with distinct local hours → 3 distinct buckets each = 1
- [x] `test(FR3)` — two days with slots at same local hour → that bucket = 2 (accumulates across days)
- [x] `test(FR3)` — 24 slots spanning 24 distinct local hours → every bucket = 1, sum = 24

### FR4: `docs/CROSSOVER_API.md`

- [x] No automated test (docs-only change). Verify manually: section contains `date`, `time`, `activityLevel`, `intensityScore`, `productivityCategory`, `activities`, `secondBrainDeepDive` fields with types and examples.

---

## Phase 1.1 — Implementation

Implement minimum code to pass all Phase 1.0 tests.

### FR1: Extend `WorkDiarySlot` in `src/types/api.ts`

- [x] `feat(FR1)` — Add `SecondBrainDeepDive` interface before `WorkDiarySlot`
- [x] `feat(FR1)` — Add 7 new fields to `WorkDiarySlot` with `// ← API:` inline comments
- [x] `feat(FR1)` — Verify all existing tests still pass (`npx jest --testPathPattern="workdiary|diary|hooks/useAIData|hooks/useHistoryBackfill" --passWithNoTests`)

### FR2: Add `hourlySlots` to `WeeklySnapshot` in `src/lib/weeklyHistory.ts`

- [x] `feat(FR2)` — Add `hourlySlots?: number[]` with JSDoc block after `dailyHours?` in `WeeklySnapshot`
- [x] `feat(FR2)` — Verify `mergeWeeklySnapshot` handles `hourlySlots` correctly (spread already works; no logic change needed)
- [x] `feat(FR2)` — Verify all existing `weeklyHistory` tests pass (`npx jest --testPathPattern="weeklyHistory"`)

### FR3: `computeHourlySlots` + integration in `src/hooks/useHistoryBackfill.ts`

- [x] `feat(FR3)` — Add `computeHourlySlots` function after `computeDailyHours`
- [x] `feat(FR3)` — Update `mergeWeeklySnapshot` call at line ~163 to include `hourlySlots`
- [x] `feat(FR3)` — Verify all existing backfill tests pass (`npx jest --testPathPattern="useHistoryBackfill"`)

### FR4: Update `docs/CROSSOVER_API.md`

- [x] `feat(FR4)` — Extend work diary slot response shape section with new fields + `timeZoneId` param behavior + hour-extraction note + example JSON snippets

---

## Phase 1.2 — Review

Sequential quality gates after all implementation is complete.

### Step 1: Alignment Check

- [x] Run `spec-implementation-alignment` agent: verify every FR success criterion is met by the implementation
- [x] All criteria pass or gaps are documented as known deviations

### Step 2: PR Review

- [x] Run `pr-review-toolkit:review-pr` skill
- [x] Address any findings (correctness, style, missing edge-case handling)

### Step 3: Fix Feedback

- [x] If review findings exist: apply fixes with `fix(01-hourly-data-layer):` prefix commits
- [x] Re-run tests after fixes

### Step 4: Test Optimization

- [x] Run `test-optimiser` agent: check for redundant/flaky/slow tests
- [x] Apply suggested optimizations

---

## Completion Criteria

- [x] All Phase 1.0 tests written and initially failing (red phase confirmed)
- [x] All Phase 1.1 implementation complete — tests now passing (green phase)
- [x] All Phase 1.2 review steps passed
- [x] `npx jest --testPathPattern="hourlySlots|weeklyHistory|useHistoryBackfill" --runInBand` — all passing
- [x] TypeScript compiles cleanly: `npx tsc --noEmit`
- [x] `docs/CROSSOVER_API.md` updated with work diary slot fields

---

## Session Notes

**2026-06-10**: Implementation complete.
- Phase 1.0: 1 test commit (test(FR1-FR3): e8d0018) — 30 tests in `__tests__/lib/hourlySlots.test.ts`
- Phase 1.1: 4 implementation commits (feat(FR1): b4f98d6, feat(FR2): e52278f, feat(FR3): 895c133, feat(FR4): 7fd8c59)
- Phase 1.2: Review passed. 2 fix commits: 2f9151f (test fixture fixtures for required fields in 6 existing test files), 8ce69e5 (PR review fixes: removed export from computeHourlySlots, added hourlySlots===undefined guard to backfill, clarified CROSSOVER_API.md date format, added non-exhaustive comment to SecondBrainDeepDive). Static analysis tests (SC3.1-SC3.7) added including backfill guard regression test.
- All 4,450 tests passing, 160 suites.
