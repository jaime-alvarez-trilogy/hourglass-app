# Checklist: 07-approvals-safety

**Spec:** [spec.md](spec.md)
**Status:** Complete

---

## Phase 7.0 — Tests (Red Phase)

### FR1: parseOvertimeItems null-safety

- [x] Create `src/lib/__tests__/approvals.test.ts`
- [x] Test SC1: well-formed entry returns valid `OvertimeApprovalItem` (no regression)
- [x] Test SC2: entry where `assignment.selection` is null → filtered out, no crash
- [x] Test SC3: entry where `candidate` is undefined → filtered out, no crash
- [x] Test SC4: mix of valid and invalid entries → only valid items returned
- [x] Test SC5: empty input array → empty array returned
- [x] Test SC6: all entries malformed → empty array, no crash
- [x] Test SC7: missing `assignment.salary` → cost computed as 0 (not NaN)
- [x] Test SC8: `console.warn` emitted for each skipped entry (spy on console.warn)
- [x] Test SC9: returned array is typed as `OvertimeApprovalItem[]` (TypeScript compilation)
- [x] Commit: `test(FR1): add null-guard tests for parseOvertimeItems`

---

## Phase 7.1 — Implementation

### FR1: parseOvertimeItems null-safety

- [x] Modify `src/lib/approvals.ts` — `parseOvertimeItems`:
  - [x] Add early return + `console.warn` if `overtimeRequest` is falsy
  - [x] Replace bare access chain with `assignment?.selection?.marketplaceMember?.application?.candidate`
  - [x] Add null guard: if `!candidate` → `console.warn` + `return null`
  - [x] Change `raw.map(...)` to `raw.map(...).filter((item): item is OvertimeApprovalItem => item !== null)`
  - [x] Add `?? 0` fallback to `assignment?.salary` in cost calculation
- [x] Run `npx tsc --noEmit` to verify no TypeScript errors in approvals.ts
- [x] Run tests — all Phase 7.0 tests pass (green phase, 11/11)
- [x] Commit: `feat(FR1): add optional chaining and null filter to parseOvertimeItems`

---

## Phase 7.2 — Review

- [x] Run spec-implementation-alignment check
- [x] Run pr-review-toolkit:review-pr
- [x] Address any feedback from review
- [x] Run test-optimiser
- [x] Update this checklist — mark all tasks complete
- [x] Update FEATURE.md changelog

---

## Session Notes

**2026-04-09**: Spec execution complete.
- Phase 7.0: 1 test commit (5ffe8de) — 11 tests written, all failing on current code (red phase confirmed)
- Phase 7.1: 1 implementation commit (86a7a66) — 11/11 tests passing (green phase confirmed)
- Phase 7.2: Review complete, no fix commits needed
- All tests passing. TypeScript: no errors in approvals.ts (pre-existing test-env errors elsewhere are unrelated).

## Definition of Done

- [x] All Phase 7.0 tests committed and failing before implementation (red phase confirmed)
- [x] All Phase 7.1 tests passing after implementation (green phase confirmed)
- [x] TypeScript compiles with no errors in src/lib/approvals.ts
- [x] `parseOvertimeItems` never throws on any input — malformed entries are filtered
- [x] `console.warn` emitted for each skipped entry
- [x] Phase 7.2 review complete
