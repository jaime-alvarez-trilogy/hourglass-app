# Checklist: 01-design-tokens

**Spec:** [spec.md](spec.md)
**Feature:** brand-polish

---

## Phase 1.0 — Tests (Red Phase)

Write failing tests before any implementation. All tests must be red before Phase 1.1 begins.

### FR1: colors.ts updated
- [x] Test: `colors.background === '#0D0C14'`
- [x] Test: `colors.surface === '#16151F'`
- [x] Test: `colors.surfaceElevated === '#1F1E29'`
- [x] Test: `colors.border === '#2F2E41'`
- [x] Test: `colors.goldBright === '#FFDF89'` (new key exists)
- [x] Test: `colors.cyan === '#00C2FF'`
- [x] Test: `colors.gold === '#E8C97A'` (unchanged)
- [x] Test: `colors.violet === '#A78BFA'` (unchanged)
- [x] Test: `colors.success === '#10B981'` (unchanged)

### FR2: tailwind.config.js synced
- [x] Test: `tailwindConfig.theme.extend.colors.background === '#0D0C14'`
- [x] Test: `tailwindConfig.theme.extend.colors.surface === '#16151F'`
- [x] Test: `tailwindConfig.theme.extend.colors.surfaceElevated === '#1F1E29'`
- [x] Test: `tailwindConfig.theme.extend.colors.border === '#2F2E41'`
- [x] Test: `tailwindConfig.theme.extend.colors.goldBright === '#FFDF89'`
- [x] Test: `tailwindConfig.theme.extend.colors.cyan === '#00C2FF'`

### FR3: Switch toggles fixed
- [x] Test: `modal.tsx` trackColor props do not contain hardcoded gold `#E8C97A`
- [x] Test: `modal.tsx` source contains `colors.violet` for switch true state
- [x] Test: `modal.tsx` source contains `colors.border` for switch false state

### FR4: Modal background tokenized
- [x] Test: `modal.tsx` source does not contain `'#0D1117'`
- [x] Test: `modal.tsx` source contains `colors.background` in StyleSheet

---

## Phase 1.1 — Implementation (Green Phase)

Make the failing tests pass. Implement minimum code required.

### FR1: Update colors.ts
- [x] Update `background` to `#0D0C14`
- [x] Update `surface` to `#16151F`
- [x] Update `surfaceElevated` to `#1F1E29`
- [x] Update `border` to `#2F2E41`
- [x] Add `goldBright: '#FFDF89'`
- [x] Update `cyan` to `#00C2FF`
- [x] Verify all other tokens unchanged
- [x] Run FR1 tests — all pass

### FR2: Update tailwind.config.js
- [x] Update `background` to `#0D0C14`
- [x] Update `surface` to `#16151F`
- [x] Update `surfaceElevated` to `#1F1E29`
- [x] Update `border` to `#2F2E41`
- [x] Add `goldBright: '#FFDF89'`
- [x] Update `cyan` to `#00C2FF`
- [x] Run FR2 tests — all pass

### FR3: Fix Switch trackColors in modal.tsx
- [x] Add `import { colors } from '@/src/lib/colors'` to modal.tsx
- [x] Replace `trackColor={{ false: '#2A2A3D', true: '#E8C97A' }}` (line ~81) with `trackColor={{ false: colors.border, true: colors.violet }}`
- [x] Replace `trackColor={{ false: '#2A2A3D', true: '#E8C97A' }}` (line ~95) with `trackColor={{ false: colors.border, true: colors.violet }}`
- [x] Run FR3 tests — all pass

### FR4: Tokenize modal.tsx background
- [x] Replace `backgroundColor: '#0D1117'` (line ~115) with `backgroundColor: colors.background`
- [x] Verify `colors` import is present (added in FR3 step)
- [x] Run all tests — all pass

---

## Phase 1.2 — Review

Sequential gates — do not parallelize.

- [x] Spec-implementation alignment — PASS (all FR success criteria verified against implementation)
- [x] PR review — manual review covering code quality, types, tests, comments, simplicity
- [x] No critical issues found — no fix commits required
- [x] Test optimization review — 29 tests, behavior-focused, guard tests for unchanged tokens
- [x] Final test run — 29/29 passing

---

## Session Notes

**2026-03-15**: Implementation complete.
- Phase 1.0: 2 test commits (initial + FR3 scope refinement)
- Phase 1.1: 3 implementation commits (feat/FR1, feat/FR2, feat/FR3+FR4)
- Phase 1.2: Review passed, 0 fix commits
- All 29 tests passing. Pre-existing payments.test.ts failures (6) unchanged.
- Note: devTitle text color '#E8C97A' in modal.tsx StyleSheet is gold used for a UI label (not money). Technically a gold-rule violation but out of scope for FR3 which targets Switch trackColor only. Could be addressed in a cleanup pass.
