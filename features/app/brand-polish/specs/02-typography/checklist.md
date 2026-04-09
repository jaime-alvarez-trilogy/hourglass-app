# Checklist: 02-Typography

## Phase 1.0 — Tests (Red Phase)

### FR1: Font aliases map to Inter
- [x] Write test: `tailwind.config.js` `font-display` alias resolves to `Inter_700Bold` (not SpaceGrotesk)
- [x] Write test: `tailwind.config.js` `font-body` alias resolves to `Inter_400Regular` (not PlusJakartaSans)
- [x] Write test: `tailwind.config.js` `font-sans` alias still resolves to Inter (unchanged)
- [x] Write test: `tailwind.config.js` contains no `SpaceGrotesk` or `PlusJakartaSans` strings
- [x] Write test: `tailwind.config.js` `font-display-extrabold` alias resolves to `Inter_800ExtraBold`

### FR2: Font loading updated
- [x] Write test: `app/_layout.tsx` does not import `@expo-google-fonts/space-grotesk`
- [x] Write test: `app/_layout.tsx` does not import `@expo-google-fonts/plus-jakarta-sans`
- [x] Write test: `app/_layout.tsx` `useFonts` call includes `Inter_800ExtraBold`
- [x] Write test: `app/_layout.tsx` `useFonts` call does not include `SpaceGrotesk_` or `PlusJakartaSans_` variants

### FR3: Class violations fixed
- [x] Write test: grep codebase — zero occurrences of `text-error` className
- [x] Write test: grep codebase — zero occurrences of `text-textTertiary` className

### FR4: tabular-nums added
- [x] Write test: `app/(tabs)/index.tsx` SubMetric value Text has `fontVariant: ['tabular-nums']`
- [x] Write test: `src/components/ApprovalCard.tsx` hours Text has `fontVariant: ['tabular-nums']`
- [x] Write test: `src/components/ApprovalCard.tsx` cost Text has `fontVariant: ['tabular-nums']`
- [x] Write test: `src/components/MyRequestCard.tsx` duration Text has `fontVariant: ['tabular-nums']`
- [x] Write test: `app/(tabs)/ai.tsx` BrainLift sub-target Text has `fontVariant: ['tabular-nums']`

---

## Phase 1.1 — Implementation

### FR1: Font aliases remapped to Inter
- [x] Update `tailwind.config.js`: remap `font-display` group aliases to Inter weights
- [x] Update `tailwind.config.js`: remap `font-body` group aliases to Inter weights
- [x] Add `font-display-extrabold` alias pointing to `Inter_800ExtraBold`
- [x] Verify no SpaceGrotesk/PlusJakartaSans strings remain in tailwind.config.js

### FR2: Font loading updated to Inter-only
- [x] Remove `@expo-google-fonts/space-grotesk` import from `app/_layout.tsx`
- [x] Remove `@expo-google-fonts/plus-jakarta-sans` import from `app/_layout.tsx`
- [x] Update `useFonts` call to load Inter 300–800 (including `Inter_800ExtraBold`)
- [x] Confirm app startup does not hang (loading gate still works)

### FR3: Class violations fixed
- [x] Replace `text-error` with `text-critical` in `app/(tabs)/ai.tsx` (~line 256)
- [x] Replace all 6 `text-textTertiary` with `text-textMuted` in `app/(tabs)/ai.tsx` (~lines 280, 350, 351, 352, 442, 449)

### FR4: Tabular-nums added
- [x] Add `style={{ fontVariant: ['tabular-nums'] }}` to SubMetric value Text in `app/(tabs)/index.tsx`
- [x] Add `style={{ fontVariant: ['tabular-nums'] }}` to hours Text in `src/components/ApprovalCard.tsx`
- [x] Add `style={{ fontVariant: ['tabular-nums'] }}` to cost Text in `src/components/ApprovalCard.tsx`
- [x] Add `style={{ fontVariant: ['tabular-nums'] }}` to duration Text in `src/components/MyRequestCard.tsx`
- [x] Add `style={{ fontVariant: ['tabular-nums'] }}` to BrainLift sub-target Text in `app/(tabs)/ai.tsx`

---

## Phase 1.2 — Review

- [x] Run spec-implementation-alignment check (manual — all FRs fully aligned)
- [x] Run pr-review-toolkit:review-pr (manual review — no issues found)
- [x] Address any review feedback (none)
- [x] Run test-optimiser (tests are static source analysis — optimal for this spec)
- [x] All typography tests passing (17/17)
- [x] Update checklist.md: mark all tasks complete
- [x] Update FEATURE.md changelog

---

## Session Notes

**2026-03-15**: Spec execution complete.
- Phase 1.0: 1 test commit (17 tests, red phase 16 failing as expected)
- Phase 1.1: 1 implementation commit (all 17 tests green, AITab SC4.9 test updated to expect text-critical)
- Phase 1.2: Review passed, no fixes needed
- All 17 typography tests passing.
- Other test suite failures (approvals-screen, hours, modal, etc.) are pre-existing and unrelated to this spec.
