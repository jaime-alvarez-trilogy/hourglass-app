# Checklist: 03-hours-resilience

**Spec:** useHoursData Either-Error Cache Fallback
**Status:** In Progress

---

## Phase 1.0 — Tests (Red Phase)

### FR1: Either-Error Cache Fallback

- [ ] `test(FR1)` SC1.1 — timesheet fails, payments ok, cache exists → isStale: true, data: cache.data, error: null
- [ ] `test(FR1)` SC1.2 — payments fails, timesheet ok, cache exists → isStale: true, data: cache.data, error: null
- [ ] `test(FR1)` SC1.3 — both fail, cache exists → isStale: true (existing behavior preserved)
- [ ] `test(FR1)` SC1.4 — both succeed → live data, isStale: false (regression guard)
- [ ] `test(FR1)` Static analysis: `eitherError` declared with `||` operator
- [ ] `test(FR1)` Static analysis: cache fallback uses `eitherError` not `bothError`

### FR2: Either-Error No-Cache Error State

- [ ] `test(FR2)` SC2.1 — timesheet fails, no cache → isLoading: false, error: non-null (not infinite spinner)
- [ ] `test(FR2)` SC2.2 — payments fails, no cache → isLoading: false, error: non-null (not infinite spinner)
- [ ] `test(FR2)` SC2.3 — no errors, loading → isLoading: true, error: null (unchanged)
- [ ] `test(FR2)` SC2.4 — no config, no errors → isLoading: true, error: null (unchanged)
- [ ] `test(FR2)` Static analysis: final fallback has `eitherError` guard before `isLoading: true`
- [ ] `test(FR2)` Static analysis: `bothError` still used for no-cache error surface (line ~147)

### Red Phase Validation

- [ ] All tests written to `src/hooks/__tests__/useHoursData.test.ts`
- [ ] Tests fail against current implementation (confirming red phase)
- [ ] Commit: `test(FR1-2): add useHoursData partial failure tests`

---

## Phase 1.1 — Implementation (Green Phase)

### FR1: Either-Error Cache Fallback

- [ ] Add `const eitherError = timesheetQuery.isError || paymentsQuery.isError;` after `bothError`
- [ ] Change cache fallback condition: `if (bothError && cache)` → `if (eitherError && cache)`
- [ ] Verify SC1.1 and SC1.2 pass
- [ ] Verify SC1.3 and SC1.4 pass (no regression)

### FR2: Either-Error No-Cache Error State

- [ ] Add `eitherError` guard in final fallback before `return { isLoading: true }`
- [ ] Error message uses `timesheetQuery.error || paymentsQuery.error || 'Failed to load hours data'`
- [ ] Verify SC2.1 and SC2.2 pass
- [ ] Verify SC2.3 and SC2.4 pass (no regression)

### Integration Check

- [ ] Run full test suite: `npx jest src/hooks/__tests__/useHoursData.test.ts`
- [ ] Run all hooks tests: `npx jest src/hooks/__tests__/` — no regressions
- [ ] TypeScript check: `npx tsc --noEmit` — no type errors
- [ ] Commit: `feat(FR1-2): fix useHoursData either-error cache fallback`

---

## Phase 1.2 — Review

- [ ] Run `spec-implementation-alignment`: verify spec.md ↔ implementation match
- [ ] Run `pr-review-toolkit:review-pr`: full PR review
- [ ] Address any review feedback
- [ ] Run `test-optimiser`: check for redundant or missing tests
- [ ] Commit any fixes: `fix(03-hours-resilience): address review feedback`

---

## Session Notes

_(Updated on completion)_
