# Checklist: 01-daily-history-store

**Spec:** [spec.md](spec.md)
**Status:** In Progress

---

## Phase 1.0 — Tests (Red Phase)

Write tests first. All tests must fail (red) before implementation begins.

**Target file:** `hourglassws/src/hooks/__tests__/useHistoryBackfill.test.ts`

### FR2 — `computeDailyHours` unit tests

- [x] Happy path: all 7 days present with slots → returns 7-element array, each = `slots.length * 10/60`
- [x] Monday has 48 slots (8h) → index 0 = 8
- [x] Sunday has 0 slots → index 6 = 0
- [x] Date absent from `slotsData` → that index = 0 (not NaN, not undefined)
- [x] Empty `slotsData {}` → returns `[0,0,0,0,0,0,0]`
- [x] Partial week (only 3 days fetched) → remaining indices = 0
- [x] Returns exactly 7 elements in every case

### FR4 — Merge-preservation integration tests

- [x] `mergeWeeklySnapshot` with existing `dailyHours` + partial omitting `dailyHours` → field preserved
- [x] `mergeWeeklySnapshot` with existing snapshot without `dailyHours` + partial including `dailyHours` → field gained
- [x] Round-trip: snapshot with `dailyHours` → `saveWeeklyHistory` → `loadWeeklyHistory` → field still present with correct values

---

## Phase 1.1 — Implementation (Green Phase)

Make tests pass with minimum viable code.

### FR1 — Extend `WeeklySnapshot` interface

**File:** `hourglassws/src/lib/weeklyHistory.ts`

- [x] Add `dailyHours?: number[]` field to `WeeklySnapshot` interface
- [x] Add JSDoc comment: length 7, Mon=0 … Sun=6, work diary slot hours, absent on old/skipped weeks, consumers treat missing as `[0,0,0,0,0,0,0]`
- [x] Verify TypeScript compiles (no breaking changes to existing consumers)

### FR2 — `computeDailyHours` helper

**File:** `hourglassws/src/hooks/useHistoryBackfill.ts`

- [x] Add internal function `computeDailyHours(mondayStr: string, slotsData: Record<string, WorkDiarySlot[]>): number[]`
- [x] Uses `weekDates(mondayStr)` to iterate 7 dates
- [x] Each index = `(slotsData[date]?.length ?? 0) * 10 / 60`
- [x] Function is NOT exported (internal helper)
- [x] No JSDoc (internal per CLAUDE.md convention)

### FR3 — Integrate into backfill merge

**File:** `hourglassws/src/hooks/useHistoryBackfill.ts`

- [x] After `computeWeekAI(dayData)` call at ~line 153, add: `const dailyHours = computeDailyHours(monday, slotsData)`
- [x] Extend `mergeWeeklySnapshot` call at ~line 154 to include `dailyHours` in the partial
- [x] No new API calls added
- [x] No new `saveWeeklyHistory` calls added
- [x] 300ms pause at ~line 179 unchanged

### FR4 — Verify merge preservation (implementation side)

- [x] Confirm `mergeWeeklySnapshot` in `weeklyHistory.ts` uses `{ ...existing, ...partial }` spread (already true — verify, no change needed)
- [x] `dailyHours` NOT added to `useEarningsHistory` writer
- [x] `dailyHours` NOT added to `useAIData` writer(s)

---

## Phase 1.2 — Review

- [x] Run spec-implementation-alignment check (all FR criteria verified — PASS)
- [x] Run pr-review-toolkit:review-pr (TS2783 duplicate key found and fixed)
- [x] Run test-optimiser on new test file (tests are behaviorally sound — no changes needed)
- [x] Address any review feedback (fixed duplicate weekStart in makeSnapshot)
- [x] All tests passing: `cd hourglassws && npx jest src/hooks/__tests__/useHistoryBackfill.test.ts --no-coverage` (21/21)
- [x] Existing tests unaffected: `cd hourglassws && npx jest src/hooks/__tests__/ --no-coverage` (423/423)

---

## Verification Checklist (Post-Implementation)

- [x] `computeDailyHours` tests: all green
- [x] Merge-preservation tests: all green
- [x] Existing backfill tests (`useHistoryBackfillAppBreakdown.test.ts`, `useHistoryBackfillRelocation.test.ts`): still green
- [x] TypeScript: no new errors in changed files (pre-existing tsconfig quirks in test mocks are project-wide, not introduced by this spec)
- [x] `dailyHours` is optional in interface (no existing code broken)
- [x] Only `useHistoryBackfill` writes `dailyHours` (single write site preserved)

---

## Session Notes

**2026-06-06**: Implementation complete.
- Phase 1.0: 1 test commit (test(FR1,FR2,FR4)) — 21 tests written, 6 failing (red) on static analysis checks for not-yet-implemented code
- Phase 1.1: 1 implementation commit (feat(FR1,FR2,FR3)) — all 21 tests green
- Phase 1.2: 1 fix commit (fix duplicate weekStart in test fixture — TS2783). Review passed.
- All 423 hook tests passing. No regressions.
