# 02-hourly-pattern-insights — Spec Research

**Feature:** Hourly Insights
**Spec:** 02-hourly-pattern-insights
**Date:** 2026-06-10
**Status:** Research complete

---

## Problem Context

Spec 01 stores three new hourly arrays in `WeeklySnapshot`. This spec derives
actionable summaries from those arrays: a `HourlyProfile` (per-hour averages across
N weeks), a `FocusWindow` (peak-intensity block), and an `AIHotZone` (peak-AI-rate
block). These types feed the histogram component in spec 03.

This spec follows the pattern established by `src/lib/scheduleInsights.ts`
(`inferWorkSchedule`, `WorkSchedule`): pure functions with no side effects, usable in
tests without mocking any hooks or storage, consuming `WeeklySnapshot[]` and returning
typed structs or `null` on insufficient data.

---

## Exploration Findings

### `inferWorkSchedule` pattern (reference — `src/lib/scheduleInsights.ts`)

```typescript
export function inferWorkSchedule(snapshots: WeeklySnapshot[]): WorkSchedule | null {
  const valid = snapshots.filter(s => s.hourlySlots?.some(c => c > 0));
  if (valid.length < 4) return null;
  // aggregate → find peak → expand range → detect window
  ...
}
```

Key: filter to snapshots that have the required field present and non-empty, require ≥4,
then aggregate by averaging across weeks.

### `useWorkSchedule` hook pattern (reference — `src/hooks/useWorkSchedule.ts`)

```typescript
export function useWorkSchedule(): WorkSchedule | null {
  const { snapshots } = useWeeklyHistory();
  return useMemo(() => inferWorkSchedule(snapshots), [snapshots]);
}
```

`useHourlyInsights` follows the identical shape: read `useWeeklyHistory`, run pure
fn in `useMemo`.

### `useWeeklyHistory` (reference — `src/hooks/useWeeklyHistory.ts`)

Returns `{ snapshots: WeeklySnapshot[] }`. This is the single read source for all
history-derived computations. Already used by `useWorkSchedule` and `useInsightChips`.

### Hour format helpers

`formatHour(h: number): string` — e.g. `0 → "12am"`, `9 → "9am"`, `13 → "1pm"`.
This utility needs to live in the new lib file since there is no existing shared
time-format helper for 12hr display in this codebase. (Check: `src/lib/hours.ts`
has `formatCountdown` and `formatHour` does NOT exist there — new fn needed.)

---

## Key Decisions

1. **`HourlyProfile.avgIntensity[h]` = NaN for zero-slot hours.** This signals
   "no data" to the chart without requiring a sentinel value like -1. The card
   renderer treats `isNaN(v)` as transparent bars.

2. **Minimum weeks threshold: 4.** Matches `inferWorkSchedule`. Fewer weeks gives
   noisy averages that may highlight the wrong hour. On first install, returns
   `null` gracefully (card hidden).

3. **Focus window: highest contiguous 2–4 hour block.** Algorithm: smooth
   `avgIntensity` with a 3-point rolling average, find global peak hour, expand
   contiguously while neighbors are ≥ 60% of peak. Cap at 4 hours to keep label
   compact. Returns `null` if peak intensity < 20 (not enough signal).

4. **AI hot zone: highest 1–2 hour block by AI rate.** Algorithm: find hour with
   max `avgAIRate`, expand to adjacent if neighbor ≥ 70% of peak. Returns `null`
   if max AI rate < 0.10 (< 10% AI usage at any hour — degenerate case).

5. **`HourlyProfile.activeWindow`** is the union of all hours with `avgSlots >= 0.5`
   (at least one slot every other week on average). Defines the visible range for
   the histogram. Hours outside this window are not rendered.

6. **All pure functions exported** from `src/lib/hourlyInsights.ts`. Hook in
   `src/hooks/useHourlyInsights.ts` is a thin wrapper over `useWeeklyHistory` + `useMemo`.

---

## Interface Contracts

### Types (new file `src/lib/hourlyInsights.ts`)

```typescript
// ← computed from WeeklySnapshot[].hourlyIntensity / hourlySlots
export interface HourlyProfile {
  avgSlots: number[];          // 24-element: avg slots per hour across N weeks
  avgIntensity: number[];      // 24-element: avg intensityScore (0-100); NaN where avgSlots[h] === 0
  avgAIRate: number[];         // 24-element: fraction 0-1; NaN where avgSlots[h] === 0
  avgProductiveRate: number[]; // 24-element: fraction 0-1; NaN where avgSlots[h] === 0
  weeksCovered: number;
  activeWindow: [number, number]; // [firstHour, lastHour] with avgSlots[h] >= 0.5
}

// ← derived from HourlyProfile.avgIntensity
export interface FocusWindow {
  peakRange: [number, number];  // [startHour, endHour] inclusive, device-local
  peakIntensity: number;        // avg intensityScore in this range (0-100)
  weeksCovered: number;
}

// ← derived from HourlyProfile.avgAIRate
export interface AIHotZone {
  hotRange: [number, number];   // [startHour, endHour] inclusive, device-local
  aiRate: number;               // fraction 0-1
  weeksCovered: number;
}
```

### `computeHourlyProfile` (src/lib/hourlyInsights.ts)

```typescript
/**
 * Computes per-hour averages from N weeks of WeeklySnapshot data.
 * Requires ≥4 weeks with hourlySlots, hourlyIntensity, hourlyAISlots,
 * and hourlyProductiveSlots all defined. Returns null on insufficient data.
 */
export function computeHourlyProfile(
  snapshots: WeeklySnapshot[],
): HourlyProfile | null
```

Source tracing:
- `avgSlots[h]` ← mean of `snapshot.hourlySlots[h]` across valid weeks
- `avgIntensity[h]` ← mean of `snapshot.hourlyIntensity[h] / snapshot.hourlySlots[h]` per week; NaN where `hourlySlots[h] === 0`
- `avgAIRate[h]` ← mean of `snapshot.hourlyAISlots[h] / snapshot.hourlySlots[h]` per week; NaN where `hourlySlots[h] === 0`
- `avgProductiveRate[h]` ← mean of `snapshot.hourlyProductiveSlots[h] / snapshot.hourlySlots[h]` per week; NaN where `hourlySlots[h] === 0`
- `weeksCovered` ← count of valid weeks
- `activeWindow` ← `[min h where avgSlots[h]>=0.5, max h where avgSlots[h]>=0.5]`

### `inferFocusWindow` (src/lib/hourlyInsights.ts)

```typescript
/**
 * Returns the peak contiguous focus block (highest avg intensityScore) from a
 * HourlyProfile. Returns null if peak intensity < 20 (insufficient signal).
 */
export function inferFocusWindow(
  profile: HourlyProfile,
): FocusWindow | null
```

Algorithm (clipped to `profile.activeWindow`):
1. Filter to `h` in activeWindow where `!isNaN(avgIntensity[h])`
2. Find `peakHour` = argmax of `avgIntensity`
3. Expand left/right while neighbor's intensity ≥ 60% of `avgIntensity[peakHour]`
4. Cap expansion at 4 hours total
5. Return null if `avgIntensity[peakHour] < 20`

### `inferAIHotZone` (src/lib/hourlyInsights.ts)

```typescript
/**
 * Returns the peak AI-rate block from a HourlyProfile.
 * Returns null if max AI rate < 0.10 (< 10% AI at any hour).
 */
export function inferAIHotZone(
  profile: HourlyProfile,
): AIHotZone | null
```

Algorithm (clipped to `profile.activeWindow`):
1. Filter to `h` in activeWindow where `!isNaN(avgAIRate[h])`
2. Find `peakHour` = argmax of `avgAIRate`
3. Expand to adjacent hour if neighbor rate ≥ 70% of peak rate
4. Return null if `avgAIRate[peakHour] < 0.10`

### `formatHour` helper (src/lib/hourlyInsights.ts)

```typescript
/** Formats a 0-23 hour as "12am", "9am", "1pm" etc. */
export function formatHour(h: number): string
// 0→"12am", 12→"12pm", 13→"1pm", 9→"9am"
```

### Hook (new file `src/hooks/useHourlyInsights.ts`)

```typescript
export interface HourlyInsights {
  profile: HourlyProfile | null;
  focusWindow: FocusWindow | null;
  aiHotZone: AIHotZone | null;
}

/**
 * Computes the hourly pattern profile and derived focus/AI windows from
 * the user's weekly history. Returns nulls until ≥4 valid weeks are available.
 */
export function useHourlyInsights(): HourlyInsights
```

Implementation: reads `useWeeklyHistory().snapshots`, calls `computeHourlyProfile`
in `useMemo`, then `inferFocusWindow` and `inferAIHotZone` in follow-on `useMemo`s
(stable dependencies → no unnecessary re-computes).

---

## Test Plan

### `computeHourlyProfile`

**Happy path:**
- [ ] 4 weeks each with only hour 9 having slots (5 slots, intensity 80, all AI, all PRODUCTIVE) →
  `avgSlots[9]=5, avgIntensity[9]=80, avgAIRate[9]=1.0, avgProductiveRate[9]=1.0`,
  all other hours `NaN`, `activeWindow=[9,9]`, `weeksCovered=4`
- [ ] Snapshots mixed with and without new hourly fields → only snapshots with all 4 fields contribute
- [ ] Hours at boundaries (h=0, h=23) → correctly included in averaging

**Edge cases:**
- [ ] < 4 valid weeks → returns `null`
- [ ] 0 weeks → returns `null`
- [ ] Week where `hourlySlots[h]=0` but `hourlyIntensity[h]>0` (shouldn't happen; defensive) →
  `avgIntensity[h]` is NaN (divide by zero → NaN, not stored)
- [ ] All hours have `avgSlots < 0.5` → `activeWindow` fallback: `[0, 23]` (or null handled upstream)

### `inferFocusWindow`

**Happy path:**
- [ ] Profile with hour 9 at intensity 90, hours 8+10 at 60 (66% of 90 ≥ 60%) →
  `peakRange=[8,10]`, `peakIntensity≈70` (avg over 3 hours)
- [ ] Profile where expansion would exceed 4 hours → capped at 4
- [ ] Hours 8-11 all at identical intensity → range is exactly `[8,11]`

**Edge cases:**
- [ ] Peak intensity < 20 → returns `null`
- [ ] Only 1 valid hour in activeWindow → `peakRange=[h,h]`, single-hour range
- [ ] All intensities NaN → returns `null`

### `inferAIHotZone`

**Happy path:**
- [ ] Hour 10 at aiRate 0.8, hour 11 at 0.6 (75% of 0.8 ≥ 70%) → `hotRange=[10,11]`
- [ ] Hour 10 at aiRate 0.8, hour 11 at 0.5 (62% < 70%) → `hotRange=[10,10]`

**Edge cases:**
- [ ] Max AI rate < 0.10 → returns `null`
- [ ] All hours NaN → returns `null`

### `formatHour`

- [ ] `0 → "12am"`, `12 → "12pm"`, `1 → "1am"`, `13 → "1pm"`, `9 → "9am"`

### `useHourlyInsights`

- [ ] Returns `{ profile: null, focusWindow: null, aiHotZone: null }` when snapshots empty
- [ ] Re-computes when `snapshots` changes (useMemo dependency)
- [ ] Stable reference when snapshots unchanged (no unnecessary re-renders)

**Mocks needed:**
- `useWeeklyHistory`: mock to return controlled `snapshots` arrays
- No AsyncStorage access in lib functions (pure) or hook (read-only via useWeeklyHistory)

---

## Files to Reference

- `src/lib/scheduleInsights.ts` — `inferWorkSchedule` algorithm pattern (very close analog)
- `src/hooks/useWorkSchedule.ts` — thin hook pattern over `useWeeklyHistory` + `useMemo`
- `src/hooks/useWeeklyHistory.ts` — data source (returns `{ snapshots: WeeklySnapshot[] }`)
- `src/lib/weeklyHistory.ts:10-32` — `WeeklySnapshot` interface with new fields from spec 01
- `src/types/api.ts` — `WorkDiarySlot` type (not used directly here; confirm field names)

---

## Out of Scope for This Spec

- `HourlyPatternCard` component (spec 03)
- Integration into `overview.tsx` (spec 04)
- Adding insight chips for focus/AI windows (deferred — avoids chip slot competition)
