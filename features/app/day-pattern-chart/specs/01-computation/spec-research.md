# Spec Research: 01-computation

## Problem

The Overview tab needs windowed day-of-week averages with trend comparison to render trend arrows. No utility currently exists that slices `WeeklySnapshot[]` by a window parameter and produces per-day averages for the current period and its prior period.

## Scope

Pure functions only. No React, no hooks, no async. Lives in `src/lib/dayPatternUtils.ts`.

## Interface Contracts

### Types

```typescript
// src/lib/dayPatternUtils.ts

export const MIN_PRIOR_WEEKS = 2; // minimum valid weeks in prior group to show arrows
export const TREND_THRESHOLD = 0.5; // hours — minimum delta to show an arrow

export interface DayWindowResult {
  current: number[];           // length 7, Mon=0…Sun=6, avg hours per day
  prev: number[] | null;       // null if 24W window or < MIN_PRIOR_WEEKS valid prior weeks
  validWeeksInCurrent: number; // weeks with valid dailyHours that contributed
  validWeeksInPrior: number;   // weeks in prior group (0 if prev === null)
}
```

All sources:
- `current[i]` ← computed from `WeeklySnapshot.dailyHours[i]` ← `src/lib/weeklyHistory.ts`
- `prev[i]` ← same field, prior calendar slice
- Constants ← defined here, exported for use by `DayPatternChart` (threshold) and tests

### Function

```typescript
/**
 * Computes per-day-of-week average hours for the active window and its prior period.
 *
 * Snapshots must be sorted oldest-first; current (in-progress) week must be excluded
 * by the caller. Weeks where dailyHours is undefined or sums to zero are skipped.
 *
 * Returns prev: null for the 24W window (no prior data) or when the prior calendar
 * slice has fewer than MIN_PRIOR_WEEKS valid weeks.
 */
export function computeDayWindowAvgs(
  snapshots: WeeklySnapshot[], // oldest-first, no current week
  window: 4 | 12 | 24,
): DayWindowResult
```

### Algorithm

1. Slice `snapshots.slice(-window)` → **current calendar group** (last N snapshots)
2. Slice `snapshots.slice(-2 * window, -window)` → **prior calendar group** (preceding N)
   - Skip for `window === 24`
3. For each group, filter to weeks where `dailyHours` is defined and `sum(dailyHours) > 0`
4. Compute per-day averages over filtered weeks:
   ```
   current[i] = sum(validWeek.dailyHours[i] for validWeek in filteredCurrent) / filteredCurrent.length
   ```
   If `filteredCurrent.length === 0`, `current[i] = 0` for all i.
5. Return `prev: null` if `window === 24` or `filteredPrior.length < MIN_PRIOR_WEEKS`
6. Otherwise compute `prev[i]` the same way

### Edge Cases

| Scenario | Expected behaviour |
|----------|-------------------|
| Empty snapshots | `current = [0,0,0,0,0,0,0]`, `prev = null` |
| All snapshots lack `dailyHours` | `validWeeksInCurrent = 0`, `current = zeros`, `prev = null` |
| Prior group has 1 valid week (< MIN_PRIOR_WEEKS) | `prev = null` |
| 24W window | `prev = null` always |
| A day index is always 0 across all valid weeks | `current[i] = 0` (no special treatment) |
| `dailyHours` is all-zero for a snapshot | That snapshot is skipped |

## Test Plan

**File:** `src/lib/__tests__/dayPatternUtils.test.ts`

### FR1 — Constants

- SC1.1: `MIN_PRIOR_WEEKS === 2`
- SC1.2: `TREND_THRESHOLD === 0.5`

### FR2 — Happy path (4W window)

- SC2.1: 8 valid snapshots, 4W window → `validWeeksInCurrent = 4`, `validWeeksInPrior = 4`, both non-null
- SC2.2: Per-day avg correct — 4 weeks all with Mon=8h → `current[0] ≈ 8.0`
- SC2.3: Prior group avg correct — prior 4 weeks Mon=4h → `prev[0] ≈ 4.0`
- SC2.4: `current.length === 7`, `prev.length === 7`

### FR3 — 12W window

- SC3.1: 24 valid snapshots, 12W window → both groups computed, non-null
- SC3.2: Prior group correctly selects weeks 13–24 (not weeks 1–12 of current)

### FR4 — 24W window

- SC4.1: Any number of snapshots, 24W window → `prev === null`
- SC4.2: `validWeeksInPrior === 0`

### FR5 — Insufficient prior data

- SC5.1: 5 valid snapshots, 4W window → prior group has 1 valid week → `prev === null`
- SC5.2: 6 valid snapshots, 4W window → prior group has 2 valid weeks → `prev !== null`

### FR6 — Missing dailyHours filtering

- SC6.1: Mix of 4 valid + 4 without `dailyHours`, 4W window → valid ones averaged, invalid skipped
- SC6.2: Snapshot with `dailyHours` all zeros is skipped
- SC6.3: Snapshot with `dailyHours = undefined` is skipped
- SC6.4: Empty snapshots → `current = Array(7).fill(0)`, `prev = null`, `validWeeksInCurrent = 0`

### FR7 — Output shape invariants

- SC7.1: `current` always has exactly 7 elements
- SC7.2: When `prev !== null`, `prev` has exactly 7 elements
- SC7.3: All values are finite numbers (no NaN, no Infinity)

## Files

| Action | File |
|--------|------|
| Create | `src/lib/dayPatternUtils.ts` |
| Create | `src/lib/__tests__/dayPatternUtils.test.ts` |

## Reference Files

- `src/lib/workPattern.ts` — `inferWorkPattern` uses same `dailyHours` averaging pattern; follow its "skip all-zero weeks" convention
- `src/lib/weeklyHistory.ts` — `WeeklySnapshot` type (lines 10–25); `dailyHours` is `number[] | undefined`
- `src/hooks/useOverviewData.ts` — shows how `snapshots.slice(-(window - 1))` is used for the existing charts; this spec uses a similar pattern but without appending current week

## Key Decisions

**Use calendar-window slicing (not "valid weeks" slicing):** Consistent with how Overview charts work — a 4W window means the last 4 calendar weeks, not the last 4 weeks that happen to have data. Gaps in data are acceptable; the `validWeeksInCurrent/Prior` fields tell callers how much data backed the avg.

**Skip all-zero `dailyHours` weeks:** A week where every day is 0h (e.g., vacation or data gap) would incorrectly pull down averages. The `sum > 0` guard matches the convention in `inferWorkPattern`.

**No current-week inclusion:** The in-progress current week uses different data sources (`useHoursData`) and partial data would skew pattern averages. Callers are responsible for passing only past snapshots.
