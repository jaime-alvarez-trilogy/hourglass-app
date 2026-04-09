# Checklist: 03-hours-variance

## Phase 1.0 — Tests (Red Phase)

### FR1: computeHoursVariance — Core Calculation
- [x] Test: `[40, 40, 40, 40]` → stdDev=0, label='Consistent', isConsistent=true
- [x] Test: `[38, 42, 39, 41, 40]` → stdDev≈1.4, label='±1.4h/week', isConsistent=true
- [x] Test: `[30, 40, 35, 45, 38]` → stdDev>3, label='Variable', isConsistent=false
- [x] Test: last entry excluded (partial week) before calculation
- [x] Test: zero entries filtered out before calculation
- [x] Test: `[40, 0, 0, 40]` → null (zeros filtered, only 1 completed point)

### FR2: Null-Safe Guard — Insufficient Data
- [x] Test: `[]` → null
- [x] Test: `[40]` → null (0 completed points after excluding last)
- [x] Test: `[40, 40]` → null (1 completed point)
- [x] Test: `[40, 40, 40]` → non-null (2 completed points — minimum)
- [x] Test: no crash/undefined for any input length

### FR3: ChartSection — subtitleRight Prop
- [x] Test: renders subtitleRight text when prop supplied
- [x] Test: applies subtitleRightColor to subtitleRight text
- [x] Test: omits subtitleRight when prop absent (backward compatible)
- [x] Test: existing subtitle-only usage unchanged

### FR4: Overview Screen — Wire Variance to ChartSection
- [x] Test: passes hoursVariance.label as subtitleRight when non-null
- [x] Test: passes colors.success when isConsistent (stdDev ≤ 2)
- [x] Test: passes colors.warning when stdDev ≤ 3 and not consistent
- [x] Test: passes colors.textSecondary when stdDev > 3
- [x] Test: no subtitleRight passed when hoursVariance is null

## Phase 1.1 — Implementation (Green Phase)

### FR1 + FR2: computeHoursVariance utility
- [x] Add `HoursVarianceResult` interface to `src/lib/hours.ts`
- [x] Implement `computeHoursVariance(hours: number[])` in `src/lib/hours.ts`
  - [x] Exclude last entry (partial week)
  - [x] Filter zero values
  - [x] Return null if < 3 completed points
  - [x] Compute population stdDev
  - [x] Derive label (Consistent / ±N.Nh/week / Variable)
  - [x] Derive isConsistent (stdDev ≤ 2)
- [x] All FR1/FR2 tests passing

### FR3: ChartSection prop extension
- [x] Add `subtitleRight?: string` to `ChartSectionProps` in `app/(tabs)/overview.tsx`
- [x] Add `subtitleRightColor?: string` to `ChartSectionProps`
- [x] Render `subtitleRight` inline after subtitle with ` · ` separator
- [x] Apply `subtitleRightColor` style when provided
- [x] All FR3 tests passing

### FR4: Overview screen wiring
- [x] Import `computeHoursVariance` in `app/(tabs)/overview.tsx`
- [x] Compute `hoursVariance` from `overviewData.hours`
- [x] Derive `varianceColor` from stdDev tiers
- [x] Pass `subtitleRight` and `subtitleRightColor` to Weekly Hours ChartSection
- [x] All FR4 tests passing

## Phase 1.2 — Review

- [x] Run spec-implementation-alignment check
- [x] Run pr-review-toolkit:review-pr
- [x] Address any review feedback
- [x] Run test-optimiser
- [x] All tests passing (full suite)
- [x] Commit documentation updates (checklist + FEATURE.md)

## Session Notes

**2026-04-06**: Implementation complete.
- Phase 1.0: 2 test commits (FR1/FR2 in hoursVariance.test.ts pre-existing from prior session; FR3/FR4 in hoursVarianceUI.test.ts added in this session)
- Phase 1.1: 2 implementation commits (FR1/FR2 pre-existing; FR3/FR4 in feat(FR3-FR4) commit)
- Phase 1.2: Review passed, no fix commits needed. Test suite 3643/3643 passing.
- Files changed: app/(tabs)/overview.tsx, src/lib/hours.ts, src/lib/__tests__/hoursVariance.test.ts, src/lib/__tests__/hoursVarianceUI.test.ts
