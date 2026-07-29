# 02-schedule-insights — Implementation Checklist

**Spec:** [spec.md](spec.md)
**Status:** Ready for implementation

---

## Phase 2.0 — Tests (Red Phase)

Write all tests first. All tests must fail before any implementation.

### FR1 — `inferWorkSchedule` tests (`src/__tests__/lib/scheduleInsights.test.ts`)

- [x] SC1.1 — 4 valid snapshots → non-null WorkSchedule returned
- [x] SC1.2 — `weeksCovered` equals count of non-zero-hourlySlots snapshots (not undefined/all-zero)
- [x] SC1.3 — `peakHour` is argmax of averaged hourly slots
- [x] SC1.4 — `peakRange[0] <= peakHour <= peakRange[1]` holds
- [x] SC1.5 — All hours in peakRange have `agg[h] >= 0.5 * agg[peakHour]`
- [x] SC1.6 — Hours immediately outside peakRange have `agg[h] < 0.5 * agg[peakHour]`
- [x] SC1.7 — `windowStart` is first hour with avg ≥ 2.0; `windowEnd` is last
- [x] SC1.8 — Returns null when < 4 valid snapshots
- [x] SC1.9 — Returns null when all hourlySlots are undefined or all-zero
- [x] SC1.10 — Returns null when `agg[peakHour] === 0`
- [x] SC1.11 — Returns null when only one hour qualifies for window (`windowStart === windowEnd`)
- [x] SC1.12 — Single-hour peak → `peakRange: [h, h]`
- [x] SC1.13 — Snapshots with `hourlySlots: undefined` excluded and not counted in `weeksCovered`

### FR3 — `formatScheduleChip` tests (`src/__tests__/lib/scheduleInsights.test.ts` or `insightFormatting.test.ts`)

- [x] SC3.1 — `key === "schedule"`
- [x] SC3.2 — `dotColor === colors.cyan`
- [x] SC3.3 — `boldLine` am/pm format: `[7, 11]` → `"Peak hours: 7am–11am"`
- [x] SC3.4 — Midnight edge: `peakRange[0] === 0` → `"12am"` in boldLine
- [x] SC3.5 — Noon edge: `peakRange[1] === 12` → `"12pm"` in boldLine
- [x] SC3.6 — Afternoon: `peakRange[1] === 14` → `"2pm"` in boldLine
- [x] SC3.7 — `weeksCovered === 1` → `"Across 1 week"` (singular)
- [x] SC3.8 — `weeksCovered === 8` → `"Across 8 weeks"` (plural)

### FR2 — `useWorkSchedule` tests (`src/hooks/__tests__/useWorkSchedule.test.ts`)

- [x] SC2.1 — Hook file exists at `src/hooks/useWorkSchedule.ts`
- [x] SC2.2 — Imports `useWeeklyHistory` from `./useWeeklyHistory`
- [x] SC2.3 — Imports `inferWorkSchedule` from `../lib/scheduleInsights`
- [x] SC2.4 — Re-exports `WorkSchedule` type
- [x] SC2.5 — Empty snapshots → null
- [x] SC2.6 — < 4 valid snapshots → null
- [x] SC2.7 — ≥ 4 valid snapshots → non-null WorkSchedule
- [x] SC2.8 — Hook has JSDoc comment

### FR4 — `useInsightChips` integration tests (`src/hooks/__tests__/useInsightChips.test.ts`)

- [x] SC4.1 — `useWorkSchedule` returns null → no schedule chip added
- [x] SC4.2 — `useWorkSchedule` returns WorkSchedule + chips already 3 → schedule NOT in result
- [x] SC4.3 — `useWorkSchedule` returns WorkSchedule + chips = 0 → schedule is only chip
- [x] SC4.4 — `useWorkSchedule` returns WorkSchedule + chips = 2 → schedule is 3rd chip
- [x] SC4.5 — Schedule chip key is `"schedule"` when present
- [x] SC4.6 — Hook source imports `useWorkSchedule` and `formatScheduleChip`
- [x] SC4.7 — `chips.slice(0, 3)` still applied after all four pushes

---

## Phase 2.1 — Implementation

Implement each FR to make its tests pass. Commit after each FR.

### FR1 — `inferWorkSchedule` pure function

- [x] Create `src/lib/scheduleInsights.ts`
- [x] Define `WorkSchedule` interface
- [x] Implement `inferWorkSchedule(snapshots: WeeklySnapshot[]): WorkSchedule | null`
- [x] Implement step 1: filter valid snapshots (non-zero hourlySlots)
- [x] Implement step 2: guard < 4 valid → null
- [x] Implement step 3: aggregate agg[0..23] = mean across valid weeks
- [x] Implement step 4: peakHour = argmax; guard agg[peakHour] === 0 → null
- [x] Implement step 5: peakRange expansion (≥50% of peak, clamped 0–23)
- [x] Implement step 6–7: windowStart = first h ≥ 2.0 avg; windowEnd = last
- [x] Implement step 8: guard windowStart === undefined || windowEnd === undefined || windowStart >= windowEnd → null
- [x] Add JSDoc to `inferWorkSchedule` export
- [x] All FR1 tests pass

### FR3 — `formatScheduleChip` formatter

- [x] Add `import type { WorkSchedule } from './scheduleInsights'` to `insightFormatting.ts`
- [x] Implement `fmt(h: number): string` helper (12am, 12pm, Xam, Xpm)
- [x] Implement `formatScheduleChip(s: WorkSchedule): InsightChipData`
- [x] Add JSDoc to `formatScheduleChip` export
- [x] All FR3 tests pass

### FR2 — `useWorkSchedule` hook

- [x] Create `src/hooks/useWorkSchedule.ts`
- [x] Import `useWeeklyHistory` and `inferWorkSchedule`
- [x] Re-export `WorkSchedule` type
- [x] Implement `useWorkSchedule()` hook body (one line: call inferWorkSchedule)
- [x] Add JSDoc to `useWorkSchedule` export
- [x] All FR2 tests pass

### FR4 — Integration in `useInsightChips`

- [x] Add `useWorkSchedule` import to `useInsightChips.ts`
- [x] Add `formatScheduleChip` import to `useInsightChips.ts`
- [x] Add `const schedule = useWorkSchedule()` call inside hook body
- [x] Add `if (schedule) chips.push(formatScheduleChip(schedule))` before return
- [x] Verify `chips.slice(0, 3)` is unchanged
- [x] All FR4 tests pass
- [x] Existing useInsightChips tests still pass (no regressions)

---

## Phase 2.2 — Review

Run in sequence after all tests pass.

- [x] **spec-implementation-alignment** — validate FR1–FR4 against spec.md (PASS)
- [x] **pr-review-toolkit:review-pr** — full PR review pass (N/A: direct-to-main workflow, no open PR)
- [x] Address any review feedback (none required)
- [x] **test-optimiser** — review test coverage for gaps or redundancy (PASS: 57 tests, all behavioral)
- [x] All tests green after review fixes

---

## Commit Discipline

| Phase | Prefix | Scope |
|-------|--------|-------|
| 2.0 tests | `test(FR1)`, `test(FR2)`, etc. | Test files only |
| 2.1 impl | `feat(FR1)`, `feat(FR2)`, etc. | Source files only (not test files) |
| 2.2 fixes | `fix(02-schedule-insights)` | Any |

---

## Session Notes

**2026-06-10**: Implementation complete.
- Phase 2.0: 1 test commit (`test(FR1-FR4): add schedule insights tests (red phase)`) — 36 tests covering all 4 FRs
- Phase 2.1: 4 implementation commits (`feat(FR1)`, `feat(FR3)`, `feat(FR2)`, `feat(FR4)`)
- Phase 2.2: spec-implementation-alignment PASS; pr-review-toolkit N/A (direct-to-main); test-optimiser PASS
- 57 tests total across 3 test files; 4493 tests passing across 162 suites (no regressions)
- Import path fix: `formatScheduleChip` moved from `scheduleInsights` to `insightFormatting` during FR3 implementation

