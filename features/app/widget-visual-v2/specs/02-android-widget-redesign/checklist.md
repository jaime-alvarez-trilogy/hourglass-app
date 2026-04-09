# Checklist: 02-android-widget-redesign

## Phase 1.0 — Tests (Red Phase)

### FR1: URGENCY_ACCENT Colors
- [x] Update FR3.4 test: bar chart for `urgency=critical` asserts `#F43F5E` (not `#FF2D55`)
- [x] Verify FR1 buildMeshSvg color tests still pass (not modified)
- [x] Verify URGENCY_ACCENT.none `#00FF88` test-lock untouched

### FR2: badgeColor() Brand Colors
- [x] Update FR1.8 test: `badgeColor('crushed_it')` asserts `#F5C842` (not `#CEA435`)
- [x] Update FR1.9 test: `badgeColor('on_track')` asserts `#10B981` (not `#4ADE80`)
- [x] Update FR1.10 test: `badgeColor('behind')` asserts `#F59E0B` (not `#FCD34D`)
- [x] Update FR1.11 test: `badgeColor('critical')` asserts `#F43F5E` (not `#F87171`)
- [x] Verify FR1.12–FR1.26 badge label tests not modified

### FR3: GlassPanel Colors
- [x] Update FR3.1 test: outer `#1C1E26`, borderRadius 16
- [x] Update FR3.2 test: inner `#16151F`, borderRadius 15
- [x] Verify FR3.3 test (borderRadius ≥ 10) not modified — still passes with 16

### FR4: Root Background Color
- [x] Update FR2.5 test: root backgroundColor `#0B0D13` (not `#0D0C14`)
- [x] Verify all other FR2 tests not modified

### Red Phase Gate
- [x] All 8 updated test assertions fail (red) against current implementation
- [x] All unmodified tests still pass (green)
- [x] Commit: `test(FR1-FR5): update android widget visual assertions`

---

## Phase 1.1 — Implementation

### FR1: Update URGENCY_ACCENT
- [x] Update `URGENCY_ACCENT.high` from `#FF6B00` to `#F59E0B`
- [x] Update `URGENCY_ACCENT.critical` from `#FF2D55` to `#F43F5E`
- [x] Verify `none`, `low`, `expired` values unchanged
- [x] Run tests: FR3.4 passes

### FR2: Update badgeColor()
- [x] Update `crushed_it` return value to `#F5C842`
- [x] Update `on_track` return value to `#10B981`
- [x] Update `behind` return value to `#F59E0B`
- [x] Update `critical` return value to `#F43F5E`
- [x] Verify default case still returns `''`
- [x] Run tests: FR1.8–FR1.11 pass

### FR3: Redesign GlassPanel
- [x] Update outer FlexWidget backgroundColor to `#1C1E26`
- [x] Update outer FlexWidget borderRadius to `16`
- [x] Update inner FlexWidget backgroundColor to `#16151F`
- [x] Update inner FlexWidget borderRadius to `15`
- [x] Verify padding values unchanged (outer: 1, inner: 12)
- [x] Run tests: FR3.1, FR3.2, FR3.3 pass

### FR4: Update Root Background
- [x] Update SmallWidget root FlexWidget backgroundColor to `#0B0D13`
- [x] Update MediumWidget root FlexWidget backgroundColor to `#0B0D13`
- [x] Run tests: FR2.5 passes, all other FR2 tests pass

### Integration Verification
- [x] Run full Android widget test suite — all tests pass (139/139)
- [x] Commit: `feat(FR1-FR4): align android widget colors with brand`

---

## Phase 1.2 — Review

### Alignment Check
- [x] spec-implementation-alignment agent: PASS

### PR Review
- [x] pr-review-toolkit:review-pr run
- [x] Feedback addressed: fixed stale `badgeColor` comment (04-cockpit-hud ref → 02-android-widget-redesign)

### Test Optimization
- [x] test-optimiser agent run
- [x] No redundant or weak tests found; duplicate describe blocks retained as spec changelog

### Final Gate
- [x] All tests passing (139/139)
- [x] Review complete

---

## Session Notes

**2026-04-02**: Implementation complete.
- Phase 1.0: 1 test commit (22 assertions updated across 8 test blocks)
- Phase 1.1: 1 implementation commit (13 lines changed across 2 files)
- Phase 1.2: 1 fix commit (stale comment on badgeColor)
- All 139 tests passing.
- Note: spec-research identified 8 tests to update; implementation correctly identified 22 correlated tests requiring update (additional describe blocks from prior spec phases that also asserted old values).
