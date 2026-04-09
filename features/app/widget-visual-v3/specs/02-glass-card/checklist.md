# Checklist: 02-glass-card

## Phase 2.0 — Tests (Red Phase)

### FR1: Fill opacity updated to 75%
- [x] Write test: `IosGlassCard` renders `RoundedRectangle` with `fill="#1C1E26BF"`
- [x] Write test: no `RoundedRectangle` in `IosGlassCard` has `fill="#1C1E26CC"` (old 80% value)

### FR2: Specular edge hardcoded to 15% white
- [x] Write test: `IosGlassCard` renders `RoundedRectangle` with `stroke="#FFFFFF26"` and `strokeWidth={0.5}`
- [x] Write test: no `RoundedRectangle` in `IosGlassCard` has `stroke="#FFFFFF1A"` (old 10% default)

### FR3: `borderColor` prop removed
- [x] Write test: rendering `IosGlassCard` without `borderColor` succeeds
- [x] Write test: IosGlassCard function signature does not include borderColor parameter
- [x] Write test: no IosGlassCard caller passes borderColor prop
- [x] No existing assertions in `widgetPolish.test.ts` reference old fill/stroke values (confirmed none)
- [x] No existing assertions in `widgetLayoutJs.test.ts` reference card colors (confirmed none)

### Red Phase Gate
- [x] All 8 new tests failed (red) before implementation — 5 failing initially
- [x] Commit: `test(02-glass-card): add FR1/FR2/FR3 tests for IosGlassCard fill/stroke/prop` (c4d9565)

---

## Phase 2.1 — Implementation

### FR1: Fill opacity
- [x] Update `IosGlassCard` first `RoundedRectangle` fill from `COLORS.surface` to `"#1C1E26BF"`

### FR2: Specular edge
- [x] Update `IosGlassCard` second `RoundedRectangle` stroke from `borderColor` prop to hardcoded `"#FFFFFF26"`
- [x] Confirm `strokeWidth={0.5}` is preserved

### FR3: Remove `borderColor` prop
- [x] Remove `borderColor` parameter from `IosGlassCard` function signature and type
- [x] Remove `VStack spacing={4}` (use default spacing)
- [x] Update LargeWidget P3 hours card caller: remove `borderColor={accent + '50'}`
- [x] Update LargeWidget P3 earned card caller: remove `borderColor={COLORS.gold + '50'}`
- [x] Update P2 MetricView wrappers (3 callers): remove `borderColor={...}`
- [x] Update LargeWidget P3 default row 1 & row 3 callers (4 callers): remove `borderColor={...}`
- [x] Verify TypeScript compilation: no errors in widget source files

### Implementation Gate
- [x] All 8 Phase 2.0 tests pass (green)
- [x] No TypeScript errors in widget files
- [x] Commit: `feat(02-glass-card): update IosGlassCard fill/stroke, remove borderColor prop` (49d68f1)

---

## Phase 2.2 — Review

- [x] spec-implementation-alignment: all FRs implemented as specified
- [x] Final test run: 8/8 02-glass-card tests pass
- [x] Documentation updated

---

## Session Notes

**2026-04-02**: Spec execution complete.
- Phase 2.0: 1 test commit (c4d9565) — 8 tests added, 5 failing initially (SC1.1, SC1.2, SC2.1, SC2.2, SC3.2 via regex match)
- Phase 2.1: 1 implementation commit (49d68f1) — IosGlassCard refactored, 9 borderColor callers updated
- Phase 2.2: All 8 02-glass-card tests passing. No TypeScript errors in widget files.
- COLORS.surface constant preserved (not updated per spec).
