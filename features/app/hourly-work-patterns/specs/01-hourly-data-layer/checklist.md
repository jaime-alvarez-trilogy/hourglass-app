# Checklist: 01-hourly-data-layer

**Spec:** [spec.md](spec.md)
**Feature:** Hourly Work Patterns
**Status:** Not started

---

## Phase 1.0 — Tests (Red Phase)

Write tests first. All tests must fail before implementation begins.

### FR1: `WorkDiarySlot` type extension

- [ ] `test(FR1)` — TypeScript compile check: `WorkDiarySlot` with all 7 new fields assigned is accepted (type-level test or compile-only assertion)
- [ ] `test(FR1)` — `SecondBrainDeepDive` interface exported and assignable from prod sample JSON shape
- [ ] `test(FR1)` — `secondBrainDeepDive: null` is assignable to `WorkDiarySlot.secondBrainDeepDive`
- [ ] `test(FR1)` — existing `WorkDiarySlot` usage (tags, autoTracker, status, memo, actions, events) still compiles

### FR2: `WeeklySnapshot.hourlySlots` field

- [ ] `test(FR2)` — `mergeWeeklySnapshot([], { weekStart, hourlySlots: new Array(24).fill(0) })` → returned entry has `hourlySlots` property
- [ ] `test(FR2)` — `mergeWeeklySnapshot([existingWithHourlySlots], { weekStart })` (partial omits `hourlySlots`) → existing `hourlySlots` preserved on merged entry
- [ ] `test(FR2)` — all-zero `hourlySlots` stored as-is (not filtered)
- [ ] `test(FR2)` — existing `mergeWeeklySnapshot` call sites without `hourlySlots` compile and test-pass unchanged

### FR3: `computeHourlySlots`

- [ ] `test(FR3)` — empty `slotsData {}` → returns array of length 24, all zeros
- [ ] `test(FR3)` — single slot with known UTC `date` → correct local-hour bucket = 1, all others 0, sum = 1
- [ ] `test(FR3)` — 3 slots at same UTC `date` → that bucket = 3
- [ ] `test(FR3)` — slots at 3 distinct UTC dates with distinct local hours → 3 distinct buckets each = 1
- [ ] `test(FR3)` — two days with slots at same local hour → that bucket = 2 (accumulates across days)
- [ ] `test(FR3)` — 24 slots spanning 24 distinct local hours → every bucket = 1, sum = 24

### FR4: `docs/CROSSOVER_API.md`

- [ ] No automated test (docs-only change). Verify manually: section contains `date`, `time`, `activityLevel`, `intensityScore`, `productivityCategory`, `activities`, `secondBrainDeepDive` fields with types and examples.

---

## Phase 1.1 — Implementation

Implement minimum code to pass all Phase 1.0 tests.

### FR1: Extend `WorkDiarySlot` in `src/types/api.ts`

- [ ] `feat(FR1)` — Add `SecondBrainDeepDive` interface before `WorkDiarySlot`
- [ ] `feat(FR1)` — Add 7 new fields to `WorkDiarySlot` with `// ← API:` inline comments
- [ ] `feat(FR1)` — Verify all existing tests still pass (`npx jest --testPathPattern="workdiary|diary|hooks/useAIData|hooks/useHistoryBackfill" --passWithNoTests`)

### FR2: Add `hourlySlots` to `WeeklySnapshot` in `src/lib/weeklyHistory.ts`

- [ ] `feat(FR2)` — Add `hourlySlots?: number[]` with JSDoc block after `dailyHours?` in `WeeklySnapshot`
- [ ] `feat(FR2)` — Verify `mergeWeeklySnapshot` handles `hourlySlots` correctly (spread already works; no logic change needed)
- [ ] `feat(FR2)` — Verify all existing `weeklyHistory` tests pass (`npx jest --testPathPattern="weeklyHistory"`)

### FR3: `computeHourlySlots` + integration in `src/hooks/useHistoryBackfill.ts`

- [ ] `feat(FR3)` — Add `computeHourlySlots` function after `computeDailyHours`
- [ ] `feat(FR3)` — Update `mergeWeeklySnapshot` call at line ~163 to include `hourlySlots`
- [ ] `feat(FR3)` — Verify all existing backfill tests pass (`npx jest --testPathPattern="useHistoryBackfill"`)

### FR4: Update `docs/CROSSOVER_API.md`

- [ ] `feat(FR4)` — Extend work diary slot response shape section with new fields + `timeZoneId` param behavior + hour-extraction note + example JSON snippets

---

## Phase 1.2 — Review

Sequential quality gates after all implementation is complete.

### Step 1: Alignment Check

- [ ] Run `spec-implementation-alignment` agent: verify every FR success criterion is met by the implementation
- [ ] All criteria pass or gaps are documented as known deviations

### Step 2: PR Review

- [ ] Run `pr-review-toolkit:review-pr` skill
- [ ] Address any findings (correctness, style, missing edge-case handling)

### Step 3: Fix Feedback

- [ ] If review findings exist: apply fixes with `fix(01-hourly-data-layer):` prefix commits
- [ ] Re-run tests after fixes

### Step 4: Test Optimization

- [ ] Run `test-optimiser` agent: check for redundant/flaky/slow tests
- [ ] Apply suggested optimizations

---

## Completion Criteria

- [ ] All Phase 1.0 tests written and initially failing (red phase confirmed)
- [ ] All Phase 1.1 implementation complete — tests now passing (green phase)
- [ ] All Phase 1.2 review steps passed
- [ ] `npx jest --testPathPattern="hourlySlots|weeklyHistory|useHistoryBackfill" --runInBand` — all passing
- [ ] TypeScript compiles cleanly: `npx tsc --noEmit`
- [ ] `docs/CROSSOVER_API.md` updated with work diary slot fields
