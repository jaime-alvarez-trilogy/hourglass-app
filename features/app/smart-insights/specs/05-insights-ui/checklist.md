# Checklist: 05-Insights UI

**Spec:** [spec.md](spec.md)
**Feature:** Smart Insights
**Status:** Complete

---

## Phase 5.0 — Tests (Red Phase)

Write tests first. All tests must fail (or error) before implementation begins.

### FR1 — `insightFormatting.ts` formatter tests

- [x] `src/lib/__tests__/insightFormatting.test.ts` created
- [x] `formatPrescriptionChip` — status `'done'`: boldLine = "You're done for the week", dotColor = `colors.success`
- [x] `formatPrescriptionChip` — status `'done'`: mutedLine = "40h hit — rest or keep going"
- [x] `formatPrescriptionChip` — status `'active'`, `patternBased: true`: mutedLine = "based on your pattern"
- [x] `formatPrescriptionChip` — status `'active'`, `patternBased: false`: mutedLine = "based on standard schedule"
- [x] `formatPrescriptionChip` — status `'active'`: boldLine = prescription's `summaryLine`; dotColor = `colors.success`
- [x] `formatPrescriptionChip` — status `'insufficient_data'`: dotColor = `colors.textSecondary`; mutedLine includes "Building your work pattern…"
- [x] `formatPrescriptionChip` — always returns key `'pace'`
- [x] `formatTrendChip` — both args null → returns null
- [x] `formatTrendChip` — trend up, best non-null → boldLine contains "AI up +", weeksUsed value; mutedLine mentions peakPct and weekLabel
- [x] `formatTrendChip` — trend down, best non-null → boldLine contains "AI down"; dotColor = `colors.cyan` (not hue change)
- [x] `formatTrendChip` — trend flat → boldLine contains "AI holding steady"
- [x] `formatTrendChip` — best null → mutedLine = "building history…"
- [x] `formatTrendChip` — returns key `'ai-trend'`; dotColor always `colors.cyan`
- [x] `formatCorrelationChip` — boldLine contains "BrainLift weeks →" and computed delta pts
- [x] `formatCorrelationChip` — mutedLine contains "5h+ BL:" and both avg values rounded
- [x] `formatCorrelationChip` — dotColor = `colors.violet`; key = `'brainlift'`

### FR2 — `useInsightChips` hook tests

- [x] `src/hooks/__tests__/useInsightChips.test.ts` created
- [x] All insights null → returns `[]`
- [x] Only prescription non-null → returns 1 chip with key `'pace'`
- [x] Prescription + AI trend (no correlation) → returns 2 chips in order: pace, ai-trend
- [x] All 3 available → returns 3 chips in order: pace, ai-trend, brainlift
- [x] Prescription null, AI trend + correlation present → returns 2 chips (no pace chip)
- [x] `brainliftCorrelation` null → `formatCorrelationChip` NOT called (guard verified)
- [x] Result never longer than 3 items

### FR3 — `InsightChip` component tests

- [x] `src/components/__tests__/InsightChip.test.tsx` created
- [x] Renders `boldLine` text
- [x] Renders `mutedLine` text
- [x] Dot `View` has `backgroundColor: dotColor` in inline style
- [x] `animatedStyle` applied to outermost `Animated.View`
- [x] `GlassCard` is in the rendered tree (composition verified, not bare View surface)
- [x] `flex-row` className is on the INNER `<View>`, NOT passed to `GlassCard`
- [x] Muted line text has `text-[11px]` class (chip legibility floor)

### FR4 — `useStaggeredEntry.test.ts` and `overview.test.tsx` pre-checks

- [x] `src/hooks/__tests__/useStaggeredEntry.test.ts` — locate `count: 3` assertion at ~line 380
- [x] Confirm test currently passes with count: 3 (baseline established)
- [x] `app/(tabs)/__tests__/overview.test.tsx` — review existing assertions for blast radius

---

## Phase 5.1 — Implementation

### FR1 — `insightFormatting.ts`

- [x] `src/lib/insightFormatting.ts` created
- [x] `InsightChipData` interface exported
- [x] `formatPrescriptionChip` exported with JSDoc; handles all 3 status values; no raw hex literals
- [x] `formatTrendChip` exported with JSDoc; self-guards on null inputs; returns null when both args null
- [x] `formatCorrelationChip` exported with JSDoc; uses `highBLAvgAIPct`, `lowBLAvgAIPct` field names
- [x] All dot colors sourced from `colors.*` (imported from `@/src/lib/colors`)
- [x] All FR1 tests pass

### FR2 — `useInsightChips.ts`

- [x] `src/hooks/useInsightChips.ts` created
- [x] `useInsightChips` exported with JSDoc
- [x] Calls `usePrescription()` and `useAIInsights()` (no args)
- [x] Explicit null-guard before `formatPrescriptionChip` call
- [x] Explicit null-guard before `formatCorrelationChip` call
- [x] `formatTrendChip` called unconditionally (self-guards)
- [x] `.slice(0, 3)` applied to result
- [x] All FR2 tests pass

### FR3 — `InsightChip.tsx`

- [x] `src/components/InsightChip.tsx` created
- [x] `InsightChipProps` interface defined
- [x] `InsightChip` exported as named export
- [x] Outermost element is `Animated.View` wrapping `animatedStyle`
- [x] Composes `GlassCard` with `padding="md"`
- [x] Inner `<View className="flex-row items-start gap-3">` (not on GlassCard)
- [x] Dot: `<View className="w-2 h-2 rounded-full mt-[6px]" style={{ backgroundColor: dotColor }} />`
- [x] Bold line: `className="text-textPrimary font-sans-medium text-[13px]"`
- [x] Muted line: `className="text-textSecondary text-[11px] mt-0.5"`
- [x] All FR3 tests pass

### FR4 — `overview.tsx` edits and `useStaggeredEntry.test.ts` update

- [x] `app/(tabs)/overview.tsx` — `useStaggeredEntry({ count: 3 })` bumped to `{ count: 6 }`
- [x] `app/(tabs)/overview.tsx` — `useInsightChips()` hook call added
- [x] `app/(tabs)/overview.tsx` — Insights section added below BrainLift chart with `{insightChips.length > 0 && ...}` gate
- [x] `app/(tabs)/overview.tsx` — `SectionLabel` used for "INSIGHTS" header
- [x] `app/(tabs)/overview.tsx` — chips use `getEntryStyle(3 + i)` with existing binding
- [x] `app/(tabs)/overview.tsx` — imports for `InsightChip`, `useInsightChips`, `SectionLabel` added
- [x] `src/hooks/__tests__/useStaggeredEntry.test.ts` — `count: 3` assertion (~line 380) changed to `count: 6`
- [x] `app/(tabs)/__tests__/overview.test.tsx` — existing tests still pass; INSIGHTS-hidden-when-empty case added if needed
- [x] Full test suite passes (run `npx jest --runInBand` in `hourglassws/`)

---

## Phase 5.2 — Review

- [x] `spec-implementation-alignment` agent run — spec vs implementation verified
- [x] `pr-review-toolkit:review-pr` run — inline review comments addressed
- [x] `test-optimiser` agent run — test quality and coverage confirmed

---

## Session Notes

**2026-06-06**: Implementation complete.
- Phase 5.0: 1 commit — tests for FR1-FR4 (35 + 14 + 26 + stagger update = 75 new tests)
- Phase 5.1: 4 commits — feat(FR1) insightFormatting.ts, feat(FR2) useInsightChips.ts, feat(FR3) InsightChip.tsx + test strategy update, feat(FR4) overview.tsx wiring
- Phase 5.2: 3 fix commits — revert accidental failOffsetY regression, remove dead branch in formatTrendChip, tighten SC1.24 assertion
- All 4299 tests passing.
