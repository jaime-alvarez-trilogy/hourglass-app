# Checklist: 02-work-pattern

**Spec:** [spec.md](spec.md)
**Status:** Complete

---

## Phase 2.0 — Tests (write first, run red)

### FR1 — Type and constants
- [x] Test: `WorkPattern` type is exported with all five fields (`status`, `dayWeights`, `restDays`, `avgDailyHours`, `weeksUsed`)
- [x] Test: `REST_DAY_THRESHOLD` equals `0.5`
- [x] Test: `MIN_WEEKS` equals `4`

### FR2 — Insufficient data path
- [x] Test: empty snapshots array → `status: 'insufficient_data'`, all arrays empty, `weeksUsed: 0`
- [x] Test: 3 valid weeks → `status: 'insufficient_data'`
- [x] Test: 4 valid weeks (exactly at threshold) → `status: 'ready'`
- [x] Test: snapshots with `dailyHours: undefined` are excluded from valid-week count
- [x] Test: snapshots with all-zero `dailyHours` are excluded from valid-week count
- [x] Test: mix — 6 snapshots with `dailyHours`, 18 without → uses the 6, `status: 'ready'`, `weeksUsed: 6`

### FR3 — Averages and rest-day detection
- [x] Test: 8 weeks, typical Mon–Fri pattern (Sat/Sun avg = 0) → `restDays = [5, 6]`
- [x] Test: `avgDailyHours` length === 7
- [x] Test: day with avg = 0.49h is a rest day (below threshold)
- [x] Test: day with avg = 0.50h is NOT a rest day (threshold is strict `<`)
- [x] Test: user who works Saturdays (avg 4h) → Saturday not in `restDays`
- [x] Test: `weeksUsed` equals count of valid weeks

### FR4 — Weight normalization
- [x] Test: `dayWeights` sums to 1.0 within ±0.001 (Mon–Fri pattern)
- [x] Test: rest days have `dayWeights[i] === 0`
- [x] Test: uneven distribution (Mon 8h avg, Tue 4h avg) → Mon weight is double Tue weight
- [x] Test: degenerate case (all 7 days are rest days) → Mon–Fri each 0.2, Sat/Sun 0
- [x] Test: `dayWeights` length === 7

### FR5 — `useWorkPattern` hook
- [x] Test: hook returns `WorkPattern` (renders without error)
- [x] Test: returns `status: 'insufficient_data'` when snapshots has < 4 valid weeks
- [x] Test: returns `status: 'ready'` when snapshots has ≥ 4 valid weeks

---

## Phase 2.1 — Implementation

### FR1 — Type and constants
- [x] Create `src/lib/workPattern.ts` with `WorkPatternStatus` union type
- [x] Add `WorkPattern` interface with all five fields
- [x] Export `REST_DAY_THRESHOLD = 0.5` constant
- [x] Export `MIN_WEEKS = 4` constant
- [x] Ensure `WeeklySnapshot` is imported type-only from `weeklyHistory.ts`

### FR2 — Insufficient data path
- [x] Implement valid-week filter: `dailyHours` present AND at least one entry > 0
- [x] Return `{ status: 'insufficient_data', dayWeights: [], restDays: [], avgDailyHours: [], weeksUsed: 0 }` when valid weeks < MIN_WEEKS
- [x] Verify FR2 tests pass

### FR3 — Averages and rest-day detection
- [x] Implement `avgDailyHours` computation: mean of `week.dailyHours[i]` across validWeeks for i in 0..6
- [x] Implement `restDays` detection: indices where `avgDailyHours[i] < REST_DAY_THRESHOLD` (strict less-than)
- [x] Verify FR3 tests pass

### FR4 — Weight normalization
- [x] Implement `rawWeights`: 0 for rest days, `avgDailyHours[i]` for work days
- [x] Implement normalization: divide each rawWeight by total
- [x] Implement degenerate fallback: if total === 0, use equal 0.2 for Mon–Fri, 0 for Sat/Sun
- [x] Add JSDoc comment to `inferWorkPattern` (2–3 lines per CLAUDE.md convention)
- [x] Verify FR4 tests pass

### FR5 — `useWorkPattern` hook
- [x] Create `src/hooks/useWorkPattern.ts`
- [x] Implement: `const { snapshots } = useWeeklyHistory()`
- [x] Implement: `return useMemo(() => inferWorkPattern(snapshots), [snapshots])`
- [x] Add JSDoc comment to `useWorkPattern`
- [x] Verify FR5 tests pass

### Integration check
- [x] Run full test suite: `cd hourglassws && npx jest --runInBand` — all tests pass (4182 total)
- [x] Verify no imports from `src/api/`, `src/store/`, or AsyncStorage in `workPattern.ts`

---

## Phase 2.2 — Review

- [x] Run `spec-implementation-alignment` check — PASS
- [x] Run PR review (code-reviewer, silent-failure-hunter, test-analyzer, type-design) — PASS, no issues
- [x] Address any review feedback — none needed
- [x] Run `test-optimiser` — PASS, tests are tight

---

## Session Notes

**2026-06-06**: Implementation complete.
- Phase 2.0: 1 test commit (24 tests, all red against missing module)
- Phase 2.1: 1 implementation commit (workPattern.ts + useWorkPattern.ts, all 24 green)
- Phase 2.2: Review passed, no fix commits needed
- 4182 total tests passing, no regressions
- All tests passing.
