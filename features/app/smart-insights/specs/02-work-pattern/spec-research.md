# Spec Research: 02-work-pattern

## Problem

To generate a smart pace prescription that respects the user's actual rhythm — not nudging them to work on days they never work — the app needs to derive a personal day-weight profile from their historical daily hours. This is computed once per session from the `dailyHours` arrays stored by spec 01.

## Exploration Findings

### Input data (from spec 01)
`WeeklySnapshot.dailyHours?: number[]` — length 7, Mon=0 … Sun=6. Available on completed past weeks after backfill. Missing on old snapshots (treated as `[0,0,0,0,0,0,0]`).

### Minimum data threshold
Rest-day inference requires enough weeks to distinguish "day they don't work" from "week they happened to take off." 4 weeks is the practical minimum — at 4 weeks, a day with 0h in all 4 is very likely a rest day. At 1–3 weeks, too noisy.

### `computePaceBadge` in `src/widgets/bridge.ts:217-236` — reference pattern
Uses `workdaysElapsed` (Mon=0 … Fri=5, weekend clamps to 5) and `expectedHours = weeklyLimit × workdaysElapsed/5`. This is the current "dumb" pace logic — it assumes equal 8h/day across Mon–Fri, ignoring actual patterns. The work pattern spec replaces this assumption with personal day weights.

### Existing `inferWorkPattern` / similar: none
No prior art in codebase. Pure new lib function.

### Where this will be consumed (spec 03)
`computePrescription` takes a `WorkPattern` and uses `dayWeights` to distribute remaining hours across the user's real work days.

## Key Decisions

**D1: Express day weights as fractions that sum to 1.0 over work days.**
`dayWeights[i]` = average hours on day `i` / sum of all day averages. This gives a normalized distribution. Rest days (average < threshold) get weight 0.

**D2: Rest-day threshold = 0.5h average.**
A day averaging less than 0.5h/week over available history is treated as a rest day (weight = 0). Rationale: even a half-hour of catch-up work would push above 0.5h average. Anyone who regularly works Saturday will average well above 0.5h.

**D3: Require ≥4 weeks with non-zero `dailyHours` data.**
Fewer than 4 weeks → return `{ status: 'insufficient_data' }`. Consumers degrade gracefully (pace prescription shows "gathering your pattern…").

**D4: Only count weeks where `dailyHours` is present and has at least 1 non-zero entry.**
Weeks with all-zero `dailyHours` (old snapshots, week with no work) are excluded from the average calculation to avoid diluting the pattern.

**D5: `inferWorkPattern` is a pure function.**
No side effects, no AsyncStorage. Takes the `WeeklySnapshot[]` array and returns a `WorkPattern`. Easily testable and usable in `useMemo`. Layering (CLAUDE.md §Module layering, N6): `src/lib/workPattern.ts` imports only the `WeeklySnapshot` TYPE from `src/lib/weeklyHistory.ts` (type-only, lib→lib) — no hooks, no `src/api`, no `src/store`, no AsyncStorage. `useWorkPattern` (the stateful read) lives in `src/hooks/`.

**D6: `dayWeights` are derived from work-diary `dailyHours` (spec 01) and are RELATIVE.**
The pattern reflects work-diary screen-tracked hours, which can differ from payments/timesheet hours for manual-heavy users (manual time lands in timesheet, not the work diary). Because `dayWeights` are normalized (sum to 1) and only express *day-shape*, this is acceptable for distributing pace (see spec 03 m7 note). The only real consequence is rest-day misclassification for someone whose manual-time days have near-zero tracked slots — a rare edge, documented not fixed.

## Interface Contracts

### `WorkPattern` type (new, in `src/lib/workPattern.ts`)
```typescript
export type WorkPatternStatus = 'ready' | 'insufficient_data';

export interface WorkPattern {
  status: WorkPatternStatus;
  // Present only when status === 'ready':
  dayWeights: number[];   // length 7, Mon=0 Sun=6 — fractions summing to 1.0; rest days = 0
  restDays: number[];     // day indices where avg < REST_DAY_THRESHOLD (e.g. [5, 6] = Sat+Sun)
  avgDailyHours: number[]; // raw averages per day (for display/debug) — length 7
  weeksUsed: number;      // how many weeks contributed to the pattern
}
```

### `inferWorkPattern` (new, in `src/lib/workPattern.ts`)
```typescript
export function inferWorkPattern(snapshots: WeeklySnapshot[]): WorkPattern
```
**Algorithm:**
1. Filter snapshots to those with `dailyHours` present and at least one entry > 0. Call these `validWeeks`.
2. If `validWeeks.length < MIN_WEEKS` (4) → return `{ status: 'insufficient_data', dayWeights: [], restDays: [], avgDailyHours: [], weeksUsed: 0 }`.
3. Compute `avgDailyHours[i]` = mean of `week.dailyHours[i]` across all `validWeeks` for each i in 0..6.
4. Compute `restDays` = indices where `avgDailyHours[i] < REST_DAY_THRESHOLD` (0.5).
5. Compute raw weights: `rawWeights[i]` = `avgDailyHours[i]` if not a rest day, else 0.
6. Normalize: `total = sum(rawWeights)`; if total === 0 → fallback to equal weight Mon–Fri (degenerate case). Else `dayWeights[i] = rawWeights[i] / total`.
7. Return `{ status: 'ready', dayWeights, restDays, avgDailyHours, weeksUsed: validWeeks.length }`.

### Constants (in `src/lib/workPattern.ts`)
```typescript
export const REST_DAY_THRESHOLD = 0.5; // hours — days below this avg are inferred rest days
export const MIN_WEEKS = 4;            // minimum valid weeks before pattern is usable
```

### `useWorkPattern` hook (new, in `src/hooks/useWorkPattern.ts`)
```typescript
export function useWorkPattern(): WorkPattern
```
- Reads `useWeeklyHistory().snapshots`
- Returns `useMemo(() => inferWorkPattern(snapshots), [snapshots])`
- Pure derivation — no additional I/O

## Test Plan

### `inferWorkPattern`
**Signature:** `(snapshots: WeeklySnapshot[]) => WorkPattern`

**Happy path:**
- [ ] 8 weeks, typical Mon–Fri pattern (Sat/Sun avg = 0) → `restDays = [5, 6]`, `dayWeights` sum to 1.0, Sat/Sun weights = 0
- [ ] 4 weeks exactly (minimum) → `status: 'ready'`
- [ ] User who works Saturdays (avg 4h) → Saturday not a rest day, included in weights
- [ ] Uneven daily distribution (heavy Mon/Tue) → `dayWeights` reflect that skew

**Edge cases:**
- [ ] 3 valid weeks → `status: 'insufficient_data'`
- [ ] All 24 weeks present but `dailyHours` absent on all (old snapshots) → `status: 'insufficient_data'`
- [ ] Mix: 6 weeks with `dailyHours`, 18 without → uses the 6, returns `status: 'ready'`
- [ ] All 7 days are rest days (degenerate: user took full week off every week in dataset) → fallback equal-weight Mon–Fri
- [ ] `dailyHours` present but all-zeros for that week → week excluded from average
- [ ] `dayWeights` sums to 1.0 (floating-point tolerance ±0.001)

**`restDays` detection:**
- [ ] Day with avg = 0.49h → rest day (< 0.5 threshold)
- [ ] Day with avg = 0.50h → NOT rest day (threshold is exclusive: `< 0.5`)
- [ ] All weekdays are work days, weekends are rest → `restDays = [5, 6]`

**Mocks needed:**
- `WeeklySnapshot[]` factory: parameterized by `dailyHours` per week, `weekStart` sequence

## Files to Create/Modify

| File | Change |
|---|---|
| `src/lib/workPattern.ts` | New — `WorkPattern` type, `inferWorkPattern`, constants |
| `src/hooks/useWorkPattern.ts` | New — `useWorkPattern` hook (thin wrapper around `inferWorkPattern`) |
| `src/lib/__tests__/workPattern.test.ts` | New — all test cases above (co-located with the sibling `src/lib/__tests__/weeklyHistory.test.ts`; this is the dominant lib-test convention — 23 files vs 3 in the legacy `src/__tests__/lib/`) |

## Verification Tiers

- **Tier 1 (unit tests):** Pure function — comprehensive edge cases.
- **Tier 2 (manual):** After 4+ weeks of `dailyHours` data, add a temporary `console.log(workPattern)` in `useWorkPattern`. Verify rest days match your actual non-work days.
- **Tier 3:** No TestFlight scenario needed — this is pure logic. The visual output is in spec 05.
