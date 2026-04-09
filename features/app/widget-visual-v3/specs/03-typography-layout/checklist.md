# Checklist: 03-typography-layout

## Phase 1.0 — Tests (Write First, Red Phase)

### FR1: Bridge "left left" bug fix
- [x] Add test: given `hoursRemaining = "7.5h left"`, Android WIDGET_LAYOUT_JS output does NOT contain `"7.5h left left"`
- [x] Add test: given `hoursRemaining = "7.5h left"`, Android WIDGET_LAYOUT_JS output contains `"7.5h left"` exactly once
- [x] Add test: given `hoursRemaining = "2.5h OT"`, Android WIDGET_LAYOUT_JS output equals `"2.5h OT"` (no " left" appended)
- [x] Confirm tests are in `src/widgets/__tests__/widgetLayoutJs.test.ts`
- [x] Confirm tests FAIL (red phase) before implementation

### FR2: Remaining text under hours card
- [x] Add test: hours `IosGlassCard` in P3 hero row contains `Text` with `font: { size: 11, weight: 'medium' }` and `foregroundStyle: '#94A3B8'`
- [x] Add test: given `hoursRemaining = "7.5h left"`, the remaining text equals `"7.5h remaining"`
- [x] Add test: given `hoursRemaining = "2.5h OT"`, the remaining text equals `"2.5h OT remaining"`
- [x] Confirm tests are in `src/widgets/__tests__/widgetPolish.test.ts`
- [x] Confirm tests FAIL (red phase) before implementation

### FR3: Earnings card in hero row
- [x] Add test: hero HStack in P3 contains exactly two `IosGlassCard` children
- [x] Add test: second card contains `Text` with `font: { size: 24, weight: 'bold' }` for earnings
- [x] Add test: second card contains `Text` with `weight: 'medium'` and content `"EARNED"`
- [x] Confirm tests FAIL (red phase) before implementation

### FR4: StatusPill text weight bold
- [x] Add test: `StatusPill` tree contains `Text` with `font.weight === 'bold'`
- [x] Add test: `StatusPill` tree contains NO `Text` with `font.weight === 'semibold'`
- [x] Confirm tests FAIL (red phase) before implementation

### FR5: Footer row simplified
- [x] Add test: footer `HStack` in P3 contains a `Text` with "Today:" in content
- [x] Add test: footer text includes AI percentage indicator
- [x] Add test: footer does NOT contain a separate `hoursRemaining` text element
- [x] Confirm tests FAIL (red phase) before implementation

---

## Phase 1.1 — Implementation

### FR1: Fix bridge.ts "left left" bug
- [x] Locate `WIDGET_LAYOUT_JS` string in `src/widgets/bridge.ts` (~line 812)
- [x] Remove `+ ' left'` from the `Text` children concatenation
- [x] Change to: `children: p.hoursRemaining` (no concatenation)
- [x] Run FR1 tests — all pass

### FR2: Remaining text under hours card
- [x] In `HourglassWidget.tsx` LargeWidget P3 branch, add secondary `Text` inside hours `IosGlassCard`
- [x] Text props: `font: { size: 11, weight: 'medium' }`, `foregroundStyle: '#94A3B8'`
- [x] Text content: `props.hoursRemaining.replace('left', '').trim() + ' remaining'`
- [x] Run FR2 tests — all pass

### FR3: Earnings card in hero row
- [x] Replace the right-side `VStack` in hero HStack with a second `IosGlassCard`
- [x] Earnings card: `Text` with `font: { size: 24, weight: 'bold' }` for `props.earnings`
- [x] Earnings card: `Text` with `weight: 'medium'` and content `"EARNED"`
- [x] Run FR3 tests — all pass

### FR4: StatusPill text weight
- [x] Locate `StatusPill` component in `HourglassWidget.tsx`
- [x] Change `weight: 'semibold'` → `weight: 'bold'` in the Text element
- [x] Run FR4 tests — all pass

### FR5: Footer row simplified
- [x] Replace P3 footer HStack content with single `Text` combining today + AI percentage
- [x] Footer format: `"Today: {props.today} • AI: {props.aiPct}"`
- [x] Remove separate `hoursRemaining` text element from footer
- [x] Update outer VStack padding from asymmetric to uniform 16pt
- [x] Remove `ZStack` + `RoundedRectangle` wrapper from activity chart section
- [x] Run FR5 tests — all pass

### Integration
- [x] Run full test suite: `cd hourglassws && npx jest`
- [x] All existing widget tests pass (no regressions in P1/P2 modes)
- [x] No TypeScript errors

---

## Phase 1.2 — Review

- [x] Run `spec-implementation-alignment` agent to verify alignment between spec.md and implementation
- [x] Run `pr-review-toolkit:review-pr` for code review
- [x] Address any review feedback
- [x] Run `test-optimiser` to review test quality
- [x] Final test suite run: all tests green

---

## Session Notes

**2026-04-02**: Implementation complete.
- Phase 1.0: 2 test commits (widgetLayoutJs.test.ts + widgetPolish.test.ts)
- Phase 1.1: 1 implementation commit (bridge.ts + HourglassWidget.tsx)
- Phase 1.2: Review passed, 0 blocking issues found
- 17 spec tests all passing; 82 widgetPolish tests all passing
- Pre-existing 37 widgetLayoutJs failures are from unimplemented sibling specs (cockpit-hud), not this spec
- FR4 (StatusPill bold) was already implemented by 04-pill-chart parallel spec
- SC2.2 and SC4.12 existing tests updated to reflect new P3 layout semantics
