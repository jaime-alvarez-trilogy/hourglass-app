# 02-work-pattern

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This spec delivers the **work-pattern inference layer** for the Smart Insights feature. It produces a personal day-weight profile that downstream specs (03-pace-prescription) use to distribute remaining hours across only the user's real working days — never pushing work onto inferred rest days.

### What is being built

1. **`src/lib/workPattern.ts`** — pure library module containing:
   - `WorkPattern` type and `WorkPatternStatus` union
   - Constants `REST_DAY_THRESHOLD = 0.5` and `MIN_WEEKS = 4`
   - `inferWorkPattern(snapshots: WeeklySnapshot[]): WorkPattern` — takes historical weekly snapshots, computes per-day averages, classifies rest days (avg < 0.5h), normalizes weights to sum 1.0

2. **`src/hooks/useWorkPattern.ts`** — thin stateful wrapper:
   - Reads `useWeeklyHistory().snapshots`
   - Returns `useMemo(() => inferWorkPattern(snapshots), [snapshots])`
   - No additional I/O or side effects

### How it works

`inferWorkPattern` filters snapshots to those that have `dailyHours` populated with at least one non-zero entry (ruling out old snapshots and zero-work weeks). If fewer than 4 valid weeks exist, it returns `{ status: 'insufficient_data' }` so consumers can degrade gracefully. Otherwise it:

- Averages each day's hours across all valid weeks
- Marks days with average < 0.5h as rest days (weight = 0)
- Normalizes the remaining weights to sum to 1.0
- Returns `{ status: 'ready', dayWeights, restDays, avgDailyHours, weeksUsed }`

The degenerate case — where all 7 days are classified as rest days — falls back to equal 1/5 weight for Mon–Fri to avoid a zero-division state.

### Layering

`workPattern.ts` imports only the `WeeklySnapshot` TYPE from `weeklyHistory.ts` (type-only import, lib→lib). It has no hook, API, store, or AsyncStorage dependencies. `useWorkPattern` in `src/hooks/` is the only stateful consumer.

---

## Out of Scope

1. **Consuming `WorkPattern` in the pace prescription** — **Deferred to [03-pace-prescription](../03-pace-prescription/spec-research.md).** `computePrescription` takes a `WorkPattern` and distributes hours; that logic lives in spec 03.

2. **Displaying the work pattern to the user** — **Deferred to [05-insights-ui](../05-insights-ui/spec-research.md).** Day-weight visualization (if any) belongs in the UI layer. This spec only computes the value.

3. **Persisting `WorkPattern` to AsyncStorage** — **Descoped.** The pattern is derived in-memory from already-persisted snapshots via `useMemo`. Caching it separately would add complexity for near-zero gain (inference is O(n) over ~24 items).

4. **Writing new snapshots or modifying `dailyHours`** — **Descoped.** That is spec 01's responsibility. This spec reads `dailyHours` read-only.

5. **Accounting for manual-time days with near-zero tracked slots** — **Descoped.** The research note (D6) documents this as a known edge case: manual time lands in the timesheet but not the work diary, so a user whose manual-heavy days have low slot counts may see those days misclassified as rest days. Fixing this requires joining work-diary with timesheet data — a separate concern outside the scope of this spec.

6. **Pattern invalidation / staleness tracking** — **Descoped.** The pattern recomputes on each `snapshots` change via `useMemo`; there is no stale-pattern problem to solve.

7. **Multi-team or multi-assignment patterns** — **Descoped.** The app currently models a single active assignment; the `WeeklySnapshot` store reflects that. Multi-assignment support is out of scope for the entire Smart Insights feature.

---

## Functional Requirements

### FR1 — `WorkPattern` type and constants

Define the `WorkPattern` interface and supporting constants in `src/lib/workPattern.ts`.

```typescript
export type WorkPatternStatus = 'ready' | 'insufficient_data';

export interface WorkPattern {
  status: WorkPatternStatus;
  dayWeights: number[];    // length 7, Mon=0 Sun=6 — fractions summing to 1.0; rest days = 0
  restDays: number[];      // day indices where avgDailyHours[i] < REST_DAY_THRESHOLD
  avgDailyHours: number[]; // raw averages per day — length 7 (for display/debug)
  weeksUsed: number;       // count of valid weeks used in calculation
}

export const REST_DAY_THRESHOLD = 0.5; // hours — days averaging below this are inferred rest days
export const MIN_WEEKS = 4;            // minimum valid weeks required before pattern is usable
```

**Success Criteria:**
- `WorkPatternStatus` is a union of exactly `'ready'` and `'insufficient_data'`
- `WorkPattern` interface is exported and has all five fields
- `REST_DAY_THRESHOLD` and `MIN_WEEKS` are exported numeric constants with the specified values
- The module imports `WeeklySnapshot` from `weeklyHistory.ts` as a type-only import

---

### FR2 — `inferWorkPattern` — insufficient data path

When called with fewer than `MIN_WEEKS` (4) valid weeks, `inferWorkPattern` returns a stable `insufficient_data` result.

A "valid week" is a `WeeklySnapshot` where `dailyHours` is present **and** has at least one entry > 0. Snapshots with missing `dailyHours` or all-zero `dailyHours` are excluded.

**Success Criteria:**
- 0 valid weeks → `{ status: 'insufficient_data', dayWeights: [], restDays: [], avgDailyHours: [], weeksUsed: 0 }`
- 3 valid weeks (below threshold) → `status: 'insufficient_data'`
- 4 valid weeks (exactly at threshold) → `status: 'ready'` (not insufficient)
- Snapshots where `dailyHours` is `undefined` are excluded from the valid-week count
- Snapshots where `dailyHours` is present but all entries are 0 are excluded

---

### FR3 — `inferWorkPattern` — ready path: averages and rest-day detection

When ≥ 4 valid weeks exist, compute per-day averages and classify rest days.

**Algorithm:**
1. For each day `i` in 0..6: `avgDailyHours[i]` = mean of `week.dailyHours[i]` across all valid weeks
2. `restDays` = indices where `avgDailyHours[i] < REST_DAY_THRESHOLD` (strict less-than; 0.5h exactly is NOT a rest day)

**Success Criteria:**
- `avgDailyHours` has exactly 7 entries
- Day with avg = 0.49h is classified as a rest day
- Day with avg = 0.50h is NOT classified as a rest day (threshold is strict `<`)
- `restDays` contains the correct day indices
- `weeksUsed` equals the count of valid weeks included in the calculation

---

### FR4 — `inferWorkPattern` — ready path: weight normalization

Compute normalized `dayWeights` from the averages and rest-day classification.

**Algorithm:**
1. `rawWeights[i]` = `avgDailyHours[i]` if `i` is not a rest day, else `0`
2. `total` = sum of `rawWeights`
3. If `total === 0` (degenerate: all days are rest days) → fallback: `dayWeights[i] = 1/5` for Mon–Fri (i=0..4), `0` for Sat/Sun (i=5,6)
4. Else: `dayWeights[i] = rawWeights[i] / total`
5. Return `{ status: 'ready', dayWeights, restDays, avgDailyHours, weeksUsed }`

**Success Criteria:**
- `dayWeights` sums to 1.0 within floating-point tolerance (±0.001)
- Rest days have `dayWeights[i] === 0`
- Work days have `dayWeights[i] > 0` proportional to their average hours
- Degenerate case (all days are rest days) returns equal Mon–Fri weights (each 0.2) and zero Sat/Sun
- Uneven distribution (e.g. Mon averages 8h, Tue averages 4h) → Mon weight is double Tue weight

---

### FR5 — `useWorkPattern` hook

A React hook in `src/hooks/useWorkPattern.ts` that provides the current work pattern derived from stored history.

```typescript
export function useWorkPattern(): WorkPattern
```

**Implementation:**
- Calls `useWeeklyHistory()` to get `snapshots`
- Returns `useMemo(() => inferWorkPattern(snapshots), [snapshots])`
- No additional I/O, no AsyncStorage access

**Success Criteria:**
- Hook returns a `WorkPattern` value
- Result is memoized: same `snapshots` reference → same `WorkPattern` reference (no re-inference)
- When `snapshots` has < 4 valid weeks → returns `status: 'insufficient_data'`
- When `snapshots` has ≥ 4 valid weeks → returns `status: 'ready'` with populated fields
- Hook respects the module layering rule: imports only from `src/lib/` and peer hooks

---

## Technical Design

### Files to Reference

| File | Purpose |
|---|---|
| `src/lib/weeklyHistory.ts` | Source of `WeeklySnapshot` type (with `dailyHours?: number[]`) and `useWeeklyHistory` hook |
| `src/lib/__tests__/weeklyHistory.test.ts` | Test convention reference — co-located lib tests |
| `src/widgets/bridge.ts:217-236` | `computePaceBadge` — the existing "dumb" pace logic this pattern replaces downstream |
| `hourglassws/features/app/smart-insights/specs/01-daily-history-store/spec.md` | What `dailyHours` means and how it is populated |
| `hourglassws/features/app/smart-insights/specs/03-pace-prescription/spec-research.md` | How `WorkPattern` will be consumed by `computePrescription` |

### Files to Create

| File | Description |
|---|---|
| `src/lib/workPattern.ts` | Pure lib: `WorkPattern` type, `inferWorkPattern`, `REST_DAY_THRESHOLD`, `MIN_WEEKS` |
| `src/hooks/useWorkPattern.ts` | Hook: reads `useWeeklyHistory`, returns `useMemo(inferWorkPattern)` |
| `src/lib/__tests__/workPattern.test.ts` | Unit tests for `inferWorkPattern` — all cases from test plan |

### Module Layering

```
src/hooks/useWorkPattern.ts
  └── imports inferWorkPattern from src/lib/workPattern.ts
  └── imports useWeeklyHistory from src/lib/weeklyHistory.ts

src/lib/workPattern.ts
  └── imports type { WeeklySnapshot } from src/lib/weeklyHistory.ts  ← type-only
  └── NO imports from src/api/, src/store/, src/hooks/, AsyncStorage
```

### Data Flow

```
AsyncStorage (weekly_history_v2)
  → useWeeklyHistory().snapshots: WeeklySnapshot[]
    → inferWorkPattern(snapshots)
      ├─ filter: has dailyHours && any > 0
      ├─ if validWeeks < 4 → { status: 'insufficient_data' }
      ├─ compute avgDailyHours[7]
      ├─ classify restDays (avg < 0.5h)
      ├─ normalize dayWeights
      └─ → WorkPattern
    → useWorkPattern() returns WorkPattern (memoized)
```

### Edge Cases

| Case | Behaviour |
|---|---|
| `dailyHours` missing on snapshot | Snapshot excluded from valid weeks |
| `dailyHours` all zeros | Snapshot excluded (treated same as missing) |
| < 4 valid weeks | Return `{ status: 'insufficient_data', dayWeights: [], restDays: [], avgDailyHours: [], weeksUsed: 0 }` |
| Day avg exactly 0.50h | NOT a rest day (threshold is strict `<`) |
| Day avg 0.49h | Rest day |
| All 7 days are rest days | Degenerate fallback: equal Mon–Fri weights (0.2 each), zero Sat/Sun |
| Floating point sum ≠ exactly 1.0 | Sum within ±0.001 is acceptable |
| `snapshots` is empty array | Returns `insufficient_data` (0 valid weeks) |
| Mix: some weeks with dailyHours, some without | Only weeks with valid dailyHours are averaged; `weeksUsed` reflects only those |

### Test File Location

`src/lib/__tests__/workPattern.test.ts` — co-located with sibling `src/lib/__tests__/weeklyHistory.test.ts`. This matches the dominant codebase convention (23 files in `src/lib/__tests__/` vs 3 in the legacy `src/__tests__/lib/`).

### WeeklySnapshot Factory (for tests)

Tests need a factory to generate `WeeklySnapshot` objects with controlled `dailyHours`:

```typescript
function makeSnapshot(dailyHours?: number[], weekStart = '2025-01-06'): WeeklySnapshot {
  return {
    weekStart,
    totalHours: dailyHours ? dailyHours.reduce((a, b) => a + b, 0) : 0,
    dailyHours,
    // ... other required fields with defaults
  };
}
```

### JSDoc for exported functions

Per `hourglassws/CLAUDE.md` conventions, exported functions in `src/lib/` get a 2–3 line JSDoc:

```typescript
/**
 * Derives a personal day-weight profile from historical weekly snapshots.
 * Returns 'insufficient_data' if fewer than MIN_WEEKS valid dailyHours entries exist.
 * Pure function — no side effects, safe for useMemo.
 */
export function inferWorkPattern(snapshots: WeeklySnapshot[]): WorkPattern { ... }
```
