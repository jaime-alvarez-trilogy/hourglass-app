# Checklist: 07-approvals-safety

**Spec:** [spec.md](spec.md)
**Status:** Not Started

---

## Phase 7.0 — Tests (Red Phase)

### FR1: parseOvertimeItems null-safety

- [ ] Create `src/lib/__tests__/approvals.test.ts`
- [ ] Test SC1: well-formed entry returns valid `OvertimeApprovalItem` (no regression)
- [ ] Test SC2: entry where `assignment.selection` is null → filtered out, no crash
- [ ] Test SC3: entry where `candidate` is undefined → filtered out, no crash
- [ ] Test SC4: mix of valid and invalid entries → only valid items returned
- [ ] Test SC5: empty input array → empty array returned
- [ ] Test SC6: all entries malformed → empty array, no crash
- [ ] Test SC7: missing `assignment.salary` → cost computed as 0 (not NaN)
- [ ] Test SC8: `console.warn` emitted for each skipped entry (spy on console.warn)
- [ ] Test SC9: returned array is typed as `OvertimeApprovalItem[]` (TypeScript compilation)
- [ ] Commit: `test(FR1): add null-guard tests for parseOvertimeItems`

---

## Phase 7.1 — Implementation

### FR1: parseOvertimeItems null-safety

- [ ] Modify `src/lib/approvals.ts` — `parseOvertimeItems`:
  - [ ] Add early return + `console.warn` if `overtimeRequest` is falsy
  - [ ] Replace bare access chain with `assignment?.selection?.marketplaceMember?.application?.candidate`
  - [ ] Add null guard: if `!candidate` → `console.warn` + `return null`
  - [ ] Change `raw.map(...)` to `raw.map(...).filter((item): item is OvertimeApprovalItem => item !== null)`
  - [ ] Add `?? 0` fallback to `assignment?.salary` in cost calculation
- [ ] Run `npx tsc --noEmit` to verify no TypeScript errors
- [ ] Run tests — all Phase 7.0 tests pass (green phase)
- [ ] Commit: `feat(FR1): add optional chaining and null filter to parseOvertimeItems`

---

## Phase 7.2 — Review

- [ ] Run spec-implementation-alignment check
- [ ] Run pr-review-toolkit:review-pr
- [ ] Address any feedback from review
- [ ] Run test-optimiser
- [ ] Update this checklist — mark all tasks complete
- [ ] Update FEATURE.md changelog

---

## Definition of Done

- All Phase 7.0 tests committed and failing before implementation (red phase confirmed)
- All Phase 7.1 tests passing after implementation (green phase confirmed)
- TypeScript compiles with no errors
- `parseOvertimeItems` never throws on any input — malformed entries are filtered
- `console.warn` emitted for each skipped entry
- Phase 7.2 review complete
