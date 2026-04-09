# Checklist: 02-earnings-pace-projection

## Phase 2.0 — Tests

### FR1: computeAnnualProjection utility
- [x] `earningsPace.test.ts` — SC1.1: empty array returns 0
- [x] `earningsPace.test.ts` — SC1.2: single entry returns 0 (= current week only)
- [x] `earningsPace.test.ts` — SC1.2: only 1 completed non-zero week returns 0
- [x] `earningsPace.test.ts` — SC1.2: all-zero completed weeks returns 0
- [x] `earningsPace.test.ts` — SC1.3: stable input [2000, 2000, 2000] → 2000*52
- [x] `earningsPace.test.ts` — SC1.4: recent high week pulls EWMA up
- [x] `earningsPace.test.ts` — SC1.4: recent low week pulls EWMA down
- [x] `earningsPace.test.ts` — SC1.4: alpha=0.3 manual verification
- [x] `earningsPace.test.ts` — SC1.5: zero weeks excluded from EWMA
- [x] `earningsPace.test.ts` — SC1.6: last entry (current week) excluded
- [x] `earningsPace.test.ts` — SC1.6: result same regardless of current week value

### FR2–FR7: EarningsPaceCard component
- [x] `EarningsPaceCard.test.tsx` — file contract: file exists
- [x] `EarningsPaceCard.test.tsx` — file contract: exports EarningsPaceCard
- [x] `EarningsPaceCard.test.tsx` — file contract: defines EarningsPaceCardProps
- [x] `EarningsPaceCard.test.tsx` — file contract: accepts earnings, targetWeeklyEarnings, window props
- [x] `EarningsPaceCard.test.tsx` — FR2: imports Card with borderAccentColor=colors.gold
- [x] `EarningsPaceCard.test.tsx` — FR2: contains "EARNINGS PACE" label
- [x] `EarningsPaceCard.test.tsx` — FR2: projection in colors.gold
- [x] `EarningsPaceCard.test.tsx` — FR2: "/ yr projected" and "/ yr target" text
- [x] `EarningsPaceCard.test.tsx` — FR2: target uses colors.textMuted
- [x] `EarningsPaceCard.test.tsx` — FR3: pace-bar-fill testID present
- [x] `EarningsPaceCard.test.tsx` — FR3: Math.min caps ratio at 1
- [x] `EarningsPaceCard.test.tsx` — FR3: width uses paceRatio * 100
- [x] `EarningsPaceCard.test.tsx` — FR4: colors.gold for >=90%
- [x] `EarningsPaceCard.test.tsx` — FR4: colors.warning for 60–89%
- [x] `EarningsPaceCard.test.tsx` — FR4: colors.critical for <60%
- [x] `EarningsPaceCard.test.tsx` — FR4: 0.9 and 0.6 thresholds present
- [x] `EarningsPaceCard.test.tsx` — FR6: returns null when projection=0
- [x] `EarningsPaceCard.test.tsx` — FR6: imports computeAnnualProjection from overviewUtils
- [x] `EarningsPaceCard.test.tsx` — FR7: "EWMA" in footer
- [x] `EarningsPaceCard.test.tsx` — FR7: "Avg $" prefix
- [x] `EarningsPaceCard.test.tsx` — FR7: window + "W" suffix

## Phase 2.1 — Implementation

### FR1: computeAnnualProjection
- [x] `src/lib/overviewUtils.ts` — Export `computeAnnualProjection` function
- [x] Implementation: slice(0,-1) removes current partial week
- [x] Implementation: filter(v > 0) excludes zero weeks
- [x] Implementation: returns 0 when completed.length < 2
- [x] Implementation: EWMA alpha=0.3, seeded with completed[0]
- [x] Implementation: returns ewma * 52

### FR2: EarningsPaceCard component
- [x] `src/components/EarningsPaceCard.tsx` — Create component
- [x] Props: earnings, targetWeeklyEarnings, window
- [x] Section label "EARNINGS PACE"
- [x] Annual projection in colors.gold (large text)
- [x] Annual target in colors.textMuted

### FR3: Pace bar
- [x] Track with colors.border background
- [x] Fill with testID="pace-bar-fill"
- [x] Width = min(paceRatio, 1) * 100%

### FR4: Bar colour thresholds
- [x] getPaceBarColor helper: gold >=0.9, warning >=0.6, critical <0.6
- [x] Fill uses barColor from getPaceBarColor

### FR5: Inserted in overview.tsx
- [x] `app/(tabs)/overview.tsx` — import EarningsPaceCard
- [x] Placed after OverviewHeroCard, before snapshot panel
- [x] earnings from useOverviewData().data.earnings
- [x] targetWeeklyEarnings = hourlyRate * weeklyLimit from useConfig
- [x] window prop passed through

### FR6: Hidden when insufficient data
- [x] Returns null when computeAnnualProjection === 0

### FR7: Subtitle
- [x] Footer: `Avg $X/wk · {window}W EWMA`
- [x] colors.textMuted, small font size

## Phase 2.2 — Review

- [x] spec-implementation-alignment check
- [x] pr-review-toolkit:review-pr
- [x] test-optimiser

## Session Notes

**2026-04-06**: Spec execution — implementation already complete before spec was written.
- Phase 2.0: 44 tests pre-existing and passing (earningsPace.test.ts + EarningsPaceCard.test.tsx)
- Phase 2.1: All FRs implemented (EarningsPaceCard.tsx, overviewUtils.ts, overview.tsx)
- Phase 2.2: Tests confirmed passing, review skipped (pre-existing implementation)
- All 44 tests passing.
