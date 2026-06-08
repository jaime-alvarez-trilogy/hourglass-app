# 01-computation — `computeDayWindowAvgs`

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Owner:** @jaime

---

## Overview

### What Is Being Built

`computeDayWindowAvgs` is a pure TypeScript function in `src/lib/dayPatternUtils.ts` that computes per-day-of-week average hours for a chosen calendar window and its preceding period.

It accepts an array of `WeeklySnapshot` objects (oldest-first, current week excluded by caller) and a window size (`4 | 12 | 24`). It returns a `DayWindowResult` with:

- `current[i]` — average hours for day-of-week `i` (Mon=0…Sun=6) over the most recent N calendar weeks
- `prev[i] | null` — same for the preceding N weeks; null when unavailable or insufficient
- `validWeeksInCurrent` / `validWeeksInPrior` — how many weeks contributed to each average

### How It Works

1. Slices the last `window` snapshots as the **current calendar group** (`snapshots.slice(-window)`).
2. Slices the preceding `window` snapshots as the **prior calendar group** (`snapshots.slice(-2*window, -window)`).
3. For each group, filters to weeks where `dailyHours` is defined and sums to > 0 (matches `inferWorkPattern` convention from `workPattern.ts`).
4. Averages each day index across filtered weeks; zeros when no valid weeks exist.
5. Returns `prev: null` when `window === 24` (no room for a prior group) or when the prior group has fewer than `MIN_PRIOR_WEEKS` valid weeks.

### Constants Exported

- `MIN_PRIOR_WEEKS = 2` — minimum valid weeks in prior group to enable trend arrows
- `TREND_THRESHOLD = 0.5` — minimum hour delta before a trend arrow is shown (used by `DayPatternChart`)

### Consumers

| Consumer | Usage |
|---|---|
| `DayPatternChart` (spec 02) | Renders bars + arrows from `DayWindowResult` |
| Overview tab (spec 03) | Passes `snapshots` + active window toggle value |
| Tests | Direct unit test of each success criterion |

### Scope

Pure computation only — no React, no hooks, no async, no I/O. Lives entirely in `src/lib/dayPatternUtils.ts`.

---

## Out of Scope

1. **React component rendering** — **Deferred to 02-chart-component:** The visual `DayPatternChart` bar-chart component is spec 02. This spec produces only the data layer.

2. **Trend arrow rendering logic** — **Deferred to 02-chart-component:** Comparing `current[i]` vs `prev[i]` against `TREND_THRESHOLD` and choosing ↑/↓ symbols is a presentation concern belonging to spec 02. This spec exports `TREND_THRESHOLD` for reuse there.

3. **Overview tab wiring** — **Deferred to 03-overview-integration:** Connecting `computeDayWindowAvgs` to the 4W/12W/24W toggle and rendering on the Overview screen is spec 03.

4. **Home tab static chart** — **Deferred to 04-home-integration:** The no-arrow variant on the Home tab is spec 04.

5. **Current-week inclusion** — **Descoped:** The in-progress current week uses live data from `useHoursData` and partial slot counts would skew pattern averages. Callers are responsible for excluding it before passing `snapshots`.

6. **`dailyHours` backfill** — **Descoped:** Populating `dailyHours` on old snapshots that predate the field is out of scope for this spec. Snapshots without the field are simply skipped during averaging.

7. **AsyncStorage reads/writes** — **Descoped:** This function is pure. Persistence is handled upstream by `useWeeklyHistory`.

8. **Formatting / localisation** — **Descoped:** Day labels (M T W T F S S), number formatting, and locale-aware rendering belong to the chart component, not the computation layer.

---

## Functional Requirements

### FR1 — Export Constants

Export two named constants from `src/lib/dayPatternUtils.ts`:

```typescript
export const MIN_PRIOR_WEEKS = 2;
export const TREND_THRESHOLD = 0.5;
```

**Success Criteria:**

- SC1.1: `MIN_PRIOR_WEEKS` equals `2`
- SC1.2: `TREND_THRESHOLD` equals `0.5`

---

### FR2 — Export Types

Export the `DayWindowResult` interface:

```typescript
export interface DayWindowResult {
  current: number[];           // length 7, Mon=0…Sun=6, avg hours per day
  prev: number[] | null;       // null if 24W window or < MIN_PRIOR_WEEKS valid prior weeks
  validWeeksInCurrent: number; // weeks with valid dailyHours that contributed
  validWeeksInPrior: number;   // weeks in prior group (0 if prev === null)
}
```

**Success Criteria:**

- SC2.1: `DayWindowResult` is importable from `dayPatternUtils`
- SC2.2: The type has all four fields with correct TypeScript signatures

---

### FR3 — `computeDayWindowAvgs` Happy Path (4W and 12W windows)

Given snapshots sorted oldest-first with `dailyHours` populated and a window of 4 or 12:

1. Slice the last `window` snapshots as the current calendar group.
2. Slice the preceding `window` snapshots as the prior calendar group.
3. Filter each group to weeks where `dailyHours` is defined and `sum(dailyHours) > 0`.
4. Compute per-day averages over filtered weeks: `current[i] = sum(validWeek.dailyHours[i]) / filteredCurrent.length`.
5. Return `prev` as the same computation on the prior group (not null) when `filteredPrior.length >= MIN_PRIOR_WEEKS`.

**Success Criteria:**

- SC3.1: 8 valid snapshots, 4W window → `validWeeksInCurrent = 4`, `validWeeksInPrior = 4`, `prev !== null`
- SC3.2: All current weeks have `Mon = 8 h` → `current[0] ≈ 8.0`
- SC3.3: All prior weeks have `Mon = 4 h` → `prev[0] ≈ 4.0`
- SC3.4: `current.length === 7` and `prev.length === 7`
- SC3.5: 24 valid snapshots, 12W window → both groups computed, `prev !== null`
- SC3.6: With 24 snapshots the prior group for 12W selects snapshots 1–12 (oldest), not the same 12 as current

---

### FR4 — 24W Window Returns `prev: null`

When `window === 24`, skip prior-group computation entirely.

**Success Criteria:**

- SC4.1: Any number of snapshots with `window = 24` → `prev === null`
- SC4.2: `validWeeksInPrior === 0` when `window = 24`

---

### FR5 — Insufficient Prior Data Returns `prev: null`

When the prior group exists but contains fewer than `MIN_PRIOR_WEEKS` valid weeks, return `prev: null`.

**Success Criteria:**

- SC5.1: 5 valid snapshots, 4W window → prior group has 1 valid week → `prev === null`
- SC5.2: 6 valid snapshots, 4W window → prior group has 2 valid weeks → `prev !== null`

---

### FR6 — Skip Invalid Weeks

Weeks where `dailyHours` is `undefined` or sums to `0` must be excluded from averages (not counted, not zeroed).

**Success Criteria:**

- SC6.1: Mix of 4 valid + 4 without `dailyHours` in an 8-snapshot set, 4W window → only valid ones averaged
- SC6.2: A snapshot with `dailyHours` all-zero is excluded
- SC6.3: A snapshot with `dailyHours === undefined` is excluded
- SC6.4: Empty `snapshots` array → `current = Array(7).fill(0)`, `prev = null`, `validWeeksInCurrent = 0`

---

### FR7 — Output Shape Invariants

The function must always return well-formed output regardless of input quality.

**Success Criteria:**

- SC7.1: `current` always has exactly 7 elements
- SC7.2: When `prev !== null`, `prev` has exactly 7 elements
- SC7.3: All values in `current` and `prev` are finite numbers (no `NaN`, no `Infinity`)

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `src/lib/weeklyHistory.ts` | `WeeklySnapshot` type — `dailyHours?: number[]` (Mon=0…Sun=6) |
| `src/lib/workPattern.ts` | `inferWorkPattern` — "skip all-zero weeks" convention to follow |
| `src/hooks/useOverviewData.ts` | Shows `snapshots.slice(-(window - 1))` window pattern used elsewhere |

### Files to Create

| File | Description |
|------|-------------|
| `src/lib/dayPatternUtils.ts` | Pure computation function + exported types + constants |
| `src/lib/__tests__/dayPatternUtils.test.ts` | Unit tests covering all 7 FRs |

### Data Flow

```
WeeklySnapshot[]                  (from useWeeklyHistory, caller strips current week)
         │
         ▼
computeDayWindowAvgs(snapshots, window)
         │
         ├─ currentGroup = snapshots.slice(-window)
         ├─ priorGroup   = snapshots.slice(-2*window, -window)  [skipped for 24W]
         │
         ├─ filteredCurrent = currentGroup.filter(valid)
         ├─ filteredPrior   = priorGroup.filter(valid)
         │
         ├─ current[i] = mean(filteredCurrent.map(w => w.dailyHours[i]))
         ├─ prev[i]    = mean(filteredPrior.map(w => w.dailyHours[i]))  [or null]
         │
         ▼
DayWindowResult { current, prev, validWeeksInCurrent, validWeeksInPrior }
         │
         ▼
DayPatternChart (spec 02)  ← renders bars and trend arrows
```

### Key Implementation Notes

**Validity guard (matching `workPattern.ts` convention):**
```typescript
const isValid = (s: WeeklySnapshot) =>
  s.dailyHours !== undefined && s.dailyHours.reduce((a, b) => a + b, 0) > 0;
```

**Average helper (safe against empty arrays):**
```typescript
function avgPerDay(weeks: WeeklySnapshot[]): number[] {
  if (weeks.length === 0) return Array(7).fill(0);
  return Array.from({ length: 7 }, (_, i) =>
    weeks.reduce((sum, w) => sum + (w.dailyHours![i] ?? 0), 0) / weeks.length,
  );
}
```

**Prior group null conditions:**
- `window === 24` → always `null`, skip slicing
- `filteredPrior.length < MIN_PRIOR_WEEKS` → `null`

**`slice` edge cases:**
- `snapshots.slice(-window)` when `snapshots.length < window` → returns all snapshots (correct)
- `snapshots.slice(-2*window, -window)` when `snapshots.length <= window` → returns `[]` (correct)

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Empty `snapshots` | `slice` returns `[]`; `avgPerDay([])` returns 7 zeros |
| All snapshots lack `dailyHours` | `filteredCurrent = []`; zeros; `prev = null` |
| Prior group has 0 valid weeks | `validWeeksInPrior = 0`; `prev = null` |
| Prior group has 1 valid week | `filteredPrior.length < MIN_PRIOR_WEEKS`; `prev = null` |
| 24W window | `priorGroup` not sliced; `prev = null`; `validWeeksInPrior = 0` |
| Day always 0 across valid weeks | `current[i] = 0` — no special handling needed |
| `dailyHours.length !== 7` | Not expected per `WeeklySnapshot` contract; `?? 0` guard covers missing indices |

### Module Layering

`src/lib/dayPatternUtils.ts` is a pure lib module. It may import only from:
- `src/lib/weeklyHistory.ts` (for `WeeklySnapshot` type)
- Nothing stateful, no `src/api/`, `src/store/`, `src/hooks/`

This satisfies the `src/lib/*` layering constraint in `CLAUDE.md`.

### Test File Structure

```
src/lib/__tests__/dayPatternUtils.test.ts
  describe('constants')                    → FR1
  describe('DayWindowResult type')         → FR2 (type-level)
  describe('computeDayWindowAvgs')
    describe('happy path — 4W window')     → FR3 SC3.1–SC3.4
    describe('happy path — 12W window')    → FR3 SC3.5–SC3.6
    describe('24W window')                 → FR4
    describe('insufficient prior data')    → FR5
    describe('invalid week filtering')     → FR6
    describe('output shape invariants')    → FR7
```
