# Checklist: 03-pace-prescription

**Spec:** [spec.md](spec.md)
**Status:** Complete

---

## Phase 1.0 — Tests (Red Phase)

Write tests first. All tests must fail before implementation begins.

### FR1 — Types (static)

- [x] SC1.1 — `PrescriptionStatus` type is `'done' | 'active' | 'insufficient_data'`
- [x] SC1.2 — `DayPrescription` has `dayIndex`, `dayLabel`, `hoursNeeded`, `isToday`
- [x] SC1.3 — `Prescription` has `status`, `days`, `totalRemaining`, `patternBased`, `summaryLine`

### FR2 — `computePrescription` core algorithm

- [x] SC2.1 — 40h worked → `status: 'done'`, `days: []`, `totalRemaining: 0`, `summaryLine: "You're done for the week"`
- [x] SC2.1b — 42h worked (overtime) → `status: 'done'` (max clamp)
- [x] SC2.2 — Monday (`getDay() === 1`) → `todayIndex === 0`
- [x] SC2.2b — Sunday (`getDay() === 0`) → `todayIndex === 6` (NOT -1)
- [x] SC2.2c — Saturday (`getDay() === 6`) → `todayIndex === 5`
- [x] SC2.3 — Remaining horizon covers today through Sunday only
- [x] SC2.4 — `patternBased: true` when `pattern.status === 'ready'`; rest days (weight=0) excluded
- [x] SC2.5 — `patternBased: false` when `pattern.status === 'insufficient_data'`; Sat/Sun excluded; `status: 'active'` (not `'insufficient_data'`)
- [x] SC2.6 — Weights renormalize correctly (sum to 1 over surviving days)
- [x] SC2.7 — `hoursData.today` subtracted from today's share; result clamped at 0; no re-spread
- [x] SC2.8 — All remaining days are rest days → `status: 'done'`
- [x] SC2.9 — Normal case returns `status: 'active'`
- [x] SC2.10 — `totalRemaining === Math.max(0, weeklyLimit - hoursData.total)`

### FR3 — Day labels

- [x] SC3.1 — `dayLabel` values are `['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']` by index
- [x] SC3.2 — `isToday === true` only for the entry at `todayIndex`

### FR4 — `summaryLine` formatting

- [x] SC4.1 — Two+ work days: `"Need Xh today · Yh {dayLabel}"` (today first)
- [x] SC4.2 — Only today has hours: `"Need Xh today"`
- [x] SC4.3 — Today already met, later days remain: `"Need Xh {dayLabel}"` (no "today")
- [x] SC4.4 — Done status: `"You're done for the week"` (no emoji, no period)
- [x] SC4.5 — Hours rounded to 1 decimal (5.23 → `"5.2h"`)
- [x] SC4.6 — No trailing whitespace or emoji

### FR5 — `usePrescription` hook (static analysis)

- [x] SC5.1 — Hook file exists at `src/hooks/usePrescription.ts`
- [x] SC5.2 — Imports `computePrescription` from `../lib/prescription`
- [x] SC5.3 — Imports `useHoursData`, `useWorkPattern`, `useConfig`
- [x] SC5.4 — Returns `null` when `hoursData` or `config` is null
- [x] SC5.5 — Uses `useMemo` with `[hoursData, pattern, config]` dependencies
- [x] SC5.6 — No imports from `src/api/`, `src/store/`, or `AsyncStorage`
- [x] SC5.7 — Returns `computePrescription(hoursData, pattern, config.weeklyLimit)` when all non-null

### Red-phase gate

- [x] Run `npx jest --runInBand src/lib/__tests__/prescription.test.ts` — all tests RED (expected)

---

## Phase 1.1 — Implementation

### FR1 — Types

- [x] Define `PrescriptionStatus`, `DayPrescription`, `Prescription` in `src/lib/prescription.ts`

### FR2 — `computePrescription`

- [x] Implement step 1: `hoursRemaining` clamp and done guard
- [x] Implement step 2: `todayIndex` using local `now.getDay()`
- [x] Implement step 3: surviving days filtering (pattern-based vs fallback)
- [x] Implement step 4: weight renormalization
- [x] Implement step 5: per-day `hoursNeeded` with today-subtraction
- [x] Implement step 6: build `DayPrescription[]`
- [x] Implement step 7: build `summaryLine` from top-2 days
- [x] Implement step 8: return `Prescription`

### FR3 — Day labels

- [x] `DAY_LABELS` constant and correct `dayLabel` / `isToday` assignment

### FR4 — `summaryLine`

- [x] Implement summary line logic for all four cases (SC4.1–SC4.4)
- [x] Round hours to 1 decimal with `toFixed(1)`

### FR5 — `usePrescription` hook

- [x] Create `src/hooks/usePrescription.ts`
- [x] Guard `!hoursData || !config` → return null
- [x] `useMemo` with correct deps
- [x] Call `computePrescription(hoursData, pattern, config.weeklyLimit)`

### Green-phase gate

- [x] Run `npx jest --runInBand src/lib/__tests__/prescription.test.ts` — all tests GREEN (42/42)
- [x] Run `npx jest --runInBand` — no regressions (4224/4224 passing)

---

## Phase 1.2 — Review

### Alignment check

- [x] All 28 SC items (SC1.1–SC5.7) verified by passing tests; no scope creep; no scope shortfall

### PR review

- [x] Reviewed: no silent failures, no missing error handling, module layering correct
- [x] 98% statement coverage, 100% function coverage on prescription.ts

### Test optimization

- [x] Tests verify behavior not implementation; edge cases covered (Sunday todayIndex, overtime clamp, today-subtraction, rest-day exclusion, uneven pattern weights)

### Commit verification

- [x] `test(FR1-FR5)` commit (4def3c1) precedes `feat(FR1-FR5)` commit (098161a) in git log
- [x] Both `src/lib/prescription.ts` and `src/hooks/usePrescription.ts` committed
- [x] `src/lib/__tests__/prescription.test.ts` committed

---

## Definition of Done

- [x] All 28 success criteria verified (SC1.1–SC5.7)
- [x] `prescription.test.ts` all green (42/42)
- [x] Full test suite: no regressions (4224/4224)
- [x] `computePrescription` pure and injectable via `now`
- [x] `usePrescription` returns `null` while loading, `Prescription` when ready
- [x] No imports from `src/api/`, `src/store/` in lib or hook files
- [x] FEATURE.md changelog updated

---

## Session Notes

**2026-06-06**: Implementation complete.
- Phase 1.0: 1 test commit (`test(FR1-FR5)` — 42 tests, prescription.test.ts)
- Phase 1.1: 1 implementation commit (`feat(FR1-FR5)` — prescription.ts + usePrescription.ts)
- Phase 1.2: Review passed. Minor test fix: SC4.6 regex tightened (· is valid punctuation, not emoji). No additional fix commits needed.
- All 42 tests passing. 4224 total suite passing. Zero regressions.
