# Checklist: 03-hours-resilience

**Spec:** useHoursData Either-Error Cache Fallback
**Status:** In Progress

---

## Phase 1.0 — Tests (Red Phase)

### FR1: Either-Error Cache Fallback

- [x] `test(FR1)` SC1.1 — timesheet fails, payments ok, cache exists → isStale: true, data: cache.data, error: null
- [x] `test(FR1)` SC1.2 — payments fails, timesheet ok, cache exists → isStale: true, data: cache.data, error: null
- [x] `test(FR1)` SC1.3 — both fail, cache exists → isStale: true (existing behavior preserved)
- [x] `test(FR1)` SC1.4 — both succeed → live data, isStale: false (regression guard)
- [x] `test(FR1)` Static analysis: `eitherError` declared with `||` operator
- [x] `test(FR1)` Static analysis: cache fallback uses `eitherError` not `bothError`

### FR2: Either-Error No-Cache Error State

- [x] `test(FR2)` SC2.1 — timesheet fails, no cache → isLoading: false, error: non-null (not infinite spinner)
- [x] `test(FR2)` SC2.2 — payments fails, no cache → isLoading: false, error: non-null (not infinite spinner)
- [x] `test(FR2)` SC2.3 — no errors, loading → isLoading: true, error: null (unchanged)
- [x] `test(FR2)` SC2.4 — no config, no errors → isLoading: true, error: null (unchanged)
- [x] `test(FR2)` Static analysis: final fallback has `eitherError` guard before `isLoading: true`
- [x] `test(FR2)` Static analysis: `bothError` still used for no-cache error surface (line ~147)

### Red Phase Validation

- [x] All tests written to `src/hooks/__tests__/useHoursData.test.ts`
- [x] Tests fail against current implementation (confirming red phase — 6 of 11 fail)
- [x] Commit: `test(FR1-2): add useHoursData partial failure tests`

---

## Phase 1.1 — Implementation (Green Phase)

### FR1: Either-Error Cache Fallback

- [x] Add `const eitherError = timesheetQuery.isError || paymentsQuery.isError;` after `bothError`
- [x] Change cache fallback condition: `if (bothError && cache)` → `if (eitherError && cache)`
- [x] Verify SC1.1 and SC1.2 pass
- [x] Verify SC1.3 and SC1.4 pass (no regression)

### FR2: Either-Error No-Cache Error State

- [x] Add `eitherError` guard in final fallback before `return { isLoading: true }`
- [x] Error message uses `timesheetQuery.error || paymentsQuery.error || 'Failed to load hours data'`
- [x] Verify SC2.1 and SC2.2 pass
- [x] Verify SC2.3 and SC2.4 pass (no regression)

### Integration Check

- [x] Run full test suite: `npx jest src/hooks/__tests__/useHoursData.test.ts` — 11/11 pass
- [x] Run all hooks tests: `npx jest src/hooks/__tests__/` — no regressions from this change
- [x] TypeScript check: `npx tsc --noEmit` — pre-existing errors only, none in useHoursData.ts
- [x] Commit: `feat(FR1-2): fix useHoursData either-error cache fallback`

---

## Phase 1.2 — Review

- [x] Run `spec-implementation-alignment`: verify spec.md ↔ implementation match — PASS
- [x] Run `pr-review-toolkit:review-pr`: full PR review — PASS, no issues
- [x] Address any review feedback — none required
- [x] Run `test-optimiser`: check for redundant or missing tests — PASS, 11 tests all meaningful
- [x] Commit any fixes: N/A — no fixes required

---

## Session Notes

**2026-04-09**: Implementation complete.
- Phase 1.0: 1 test commit (test(FR1-2)) — 11 static analysis tests, 6 fail red
- Phase 1.1: 1 implementation commit (feat(FR1-2)) — 3 code changes, all 11 tests green
- Phase 1.2: Review passed, no fixes required
- All 11 tests passing. No regressions in hooks suite.
