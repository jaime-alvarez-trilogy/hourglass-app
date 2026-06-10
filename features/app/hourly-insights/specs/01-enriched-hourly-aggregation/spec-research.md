# 01-enriched-hourly-aggregation — Spec Research

**Feature:** Hourly Insights
**Spec:** 01-enriched-hourly-aggregation
**Date:** 2026-06-10
**Status:** Research complete

---

## Problem Context

`WeeklySnapshot` in `src/lib/weeklyHistory.ts` already carries `hourlySlots?: number[24]`
(per-hour slot count, added by 01-hourly-data-layer). But `hourlySlots` only answers
"how many slots per hour" — it cannot answer "how intense was each hour" or "how much
AI was used at that hour."

The backfill hook (`src/hooks/useHistoryBackfill.ts`) already iterates every
`WorkDiarySlot` to call `countDiaryTags()`. Those same raw slots carry:
- `slot.intensityScore` (1–100): focus/activity quality for the 10-min slot
- `slot.tags` including `"ai_usage"` / `"second_brain"`: already parsed for weekly AI%
- `slot.productivityCategory` (`"PRODUCTIVE"` | `"COMMUNICATION"` | `"UNCATEGORIZED"`)

Piggybacking three additional 24-element accumulators onto the existing per-slot loop
costs zero extra API calls and minimal CPU (single pass, 3 extra counter increments
per slot). The arrays enable spec 02's `computeHourlyProfile()`.

**Design note on storage format for `hourlyIntensity`:** Store as sum-of-scores
(not average). Averaging requires dividing by `hourlySlots[h]` at read time, which
is already available. Storing the raw sum avoids floating-point averaging drift
when merging partial updates across multiple backfill runs.

---

## Exploration Findings

### Current backfill guard (line 129 of `useHistoryBackfill.ts`)

```typescript
if (!entry || entry.aiPct === 0 || entry.dailyHours === undefined || entry.hourlySlots === undefined) {
  weeksToFill.push(monday);
}
```

The new fields must be added to this guard so weeks already processed (with
`hourlySlots` present but missing `hourlyIntensity` etc.) are re-processed on first
run after the app updates.

### `computeHourlySlots` (lines 83–92) — pattern to extend

```typescript
function computeHourlySlots(slotsData: Record<string, WorkDiarySlot[]>): number[] {
  const counts = new Array<number>(24).fill(0);
  for (const slots of Object.values(slotsData)) {
    for (const slot of slots) {
      const hour = new Date(slot.date).getHours();
      if (hour >= 0 && hour < 24) counts[hour]++;
    }
  }
  return counts;
}
```

The three new helpers follow the identical signature pattern but accumulate different
fields. They can share the inner loop with `computeHourlySlots` (fused single pass).

### `mergeWeeklySnapshot` conditional spread pattern (lines 71–73 of `weeklyHistory.ts`)

```typescript
...(partial.overtime !== undefined && { overtime: partial.overtime }),
...(partial.dailyHours !== undefined && { dailyHours: partial.dailyHours }),
...(partial.hourlySlots !== undefined && { hourlySlots: partial.hourlySlots }),
```

New fields follow the identical pattern: three more conditional spreads in `mergeWeeklySnapshot`.

### `WorkDiarySlot` (confirmed fields from live prod 2026-06-09)

- `intensityScore: number` — already typed in 01-hourly-data-layer
- `productivityCategory: 'PRODUCTIVE' | 'COMMUNICATION' | 'UNCATEGORIZED'` — typed
- `activities: string[]` — not needed here (tags are the authoritative AI signal)
- `tags: string[]` — `"ai_usage"` and `"second_brain"` already used by `countDiaryTags`

---

## Key Decisions

1. **Store `hourlyIntensity` as sum, not average.** Dividing by `hourlySlots[h]` at
   read time (in `computeHourlyProfile`) gives the correct per-hour mean. Storing
   the sum avoids precision loss when a partial week is merged over multiple calls.

2. **Fused single-pass helper.** Rather than 3 separate functions iterating
   `slotsData`, one new function `computeHourlyEnrichment()` returns an object with
   all 4 hourly arrays (including `hourlySlots` to replace the separate call). This
   keeps the per-slot loop to one pass and makes the backfill integration site cleaner.
   The existing exported `computeHourlySlots` function stays in place (backward compat,
   tests) — but the backfill runner will use `computeHourlyEnrichment` going forward.

3. **Re-backfill guard: OR condition only on new fields being undefined.** Add
   `entry.hourlyIntensity === undefined` OR `entry.hourlyAISlots === undefined` OR
   `entry.hourlyProductiveSlots === undefined` — any missing new field triggers
   re-process. Use `||` not `&&` so a partial update still gets completed.

4. **Integration at the `mergeWeeklySnapshot` call site (line 179).** Replace the
   current call with one that also passes `hourlyIntensity`, `hourlyAISlots`,
   `hourlyProductiveSlots` from `computeHourlyEnrichment()`.

---

## Interface Contracts

### FR1: Extend `WeeklySnapshot` in `src/lib/weeklyHistory.ts`

Add after the `hourlySlots?` JSDoc block:

```typescript
  /**
   * Sum of intensityScore per local hour of day (all Mon–Sun days combined).
   * Length 24. Divide by hourlySlots[h] to get avg intensity per hour.
   * Absent on snapshots processed before this field was added.
   * Consumers treat missing as all-zeros.
   */
  hourlyIntensity?: number[];
  /**
   * Count of ai_usage or second_brain tagged slots per local hour of day.
   * Length 24. Absent on snapshots processed before this field was added.
   */
  hourlyAISlots?: number[];
  /**
   * Count of PRODUCTIVE productivityCategory slots per local hour of day.
   * Length 24. Absent on snapshots processed before this field was added.
   */
  hourlyProductiveSlots?: number[];
```

Also extend `mergeWeeklySnapshot` new-entry block and the conditional spreads in
the merge path:

```typescript
// In the new-entry block:
...(partial.hourlyIntensity !== undefined && { hourlyIntensity: partial.hourlyIntensity }),
...(partial.hourlyAISlots !== undefined && { hourlyAISlots: partial.hourlyAISlots }),
...(partial.hourlyProductiveSlots !== undefined && { hourlyProductiveSlots: partial.hourlyProductiveSlots }),
```

### FR2: `computeHourlyEnrichment` in `src/hooks/useHistoryBackfill.ts`

New fused helper (replaces separate calls to `computeHourlySlots` at the call site):

```typescript
interface HourlyEnrichment {
  hourlySlots: number[];
  hourlyIntensity: number[];       // sum-of-intensityScore per hour (divide by slots for avg)
  hourlyAISlots: number[];         // count of ai_usage|second_brain slots per hour
  hourlyProductiveSlots: number[]; // count of PRODUCTIVE slots per hour
}

function computeHourlyEnrichment(
  slotsData: Record<string, WorkDiarySlot[]>,
): HourlyEnrichment {
  const hourlySlots = new Array<number>(24).fill(0);
  const hourlyIntensity = new Array<number>(24).fill(0);
  const hourlyAISlots = new Array<number>(24).fill(0);
  const hourlyProductiveSlots = new Array<number>(24).fill(0);
  for (const slots of Object.values(slotsData)) {
    for (const slot of slots) {
      const hour = new Date(slot.date).getHours();
      if (hour < 0 || hour >= 24) continue;
      hourlySlots[hour]++;
      hourlyIntensity[hour] += slot.intensityScore ?? 0;
      if (slot.tags.includes('ai_usage') || slot.tags.includes('second_brain')) {
        hourlyAISlots[hour]++;
      }
      if (slot.productivityCategory === 'PRODUCTIVE') {
        hourlyProductiveSlots[hour]++;
      }
    }
  }
  return { hourlySlots, hourlyIntensity, hourlyAISlots, hourlyProductiveSlots };
}
```

### FR3: Update backfill guard in `runBackfill`

Replace line 129:

```typescript
// Before:
if (!entry || entry.aiPct === 0 || entry.dailyHours === undefined || entry.hourlySlots === undefined) {

// After:
if (
  !entry ||
  entry.aiPct === 0 ||
  entry.dailyHours === undefined ||
  entry.hourlySlots === undefined ||
  entry.hourlyIntensity === undefined ||
  entry.hourlyAISlots === undefined ||
  entry.hourlyProductiveSlots === undefined
) {
```

### FR4: Update `mergeWeeklySnapshot` call site in `runBackfill` (line 179)

```typescript
// Before:
const hourlySlots = computeHourlySlots(slotsData);
updated = mergeWeeklySnapshot(updated, {
  weekStart: monday, aiPct, brainliftHours, dailyHours, hourlySlots,
});

// After:
const enrichment = computeHourlyEnrichment(slotsData);
updated = mergeWeeklySnapshot(updated, {
  weekStart: monday, aiPct, brainliftHours, dailyHours,
  ...enrichment,
});
```

---

## Test Plan

### `computeHourlyEnrichment`

**Happy path:**
- [ ] Empty `slotsData {}` → all four arrays are `new Array(24).fill(0)`
- [ ] Single slot at UTC `"2026-06-09T13:00:00Z"` (UTC-6 → hour 7), `intensityScore: 80`,
  `tags: ["ai_usage"]`, `productivityCategory: "PRODUCTIVE"` →
  `hourlySlots[7]=1, hourlyIntensity[7]=80, hourlyAISlots[7]=1, hourlyProductiveSlots[7]=1`
- [ ] Slot with `tags: ["second_brain"]` → `hourlyAISlots[h]` incremented (same bucket as ai_usage)
- [ ] Slot with `tags: []` (no AI), `productivityCategory: "COMMUNICATION"` →
  `hourlyAISlots[h]=0, hourlyProductiveSlots[h]=0` but `hourlySlots[h]` incremented
- [ ] Multiple slots at same hour → `hourlyIntensity[h]` is sum (not avg) of all intensityScores
- [ ] Slots across multiple hours in one day → correct per-hour accumulation
- [ ] `slotsData` with 7 days → all days' slots accumulated into same 24 buckets

**Edge cases:**
- [ ] Slot with `intensityScore: undefined` (missing from API) → treated as 0, no NaN
- [ ] `slot.date` at hour boundary (e.g. `"...T23:00:00Z"` on UTC device) → `counts[23]` incremented
- [ ] `slot.date` invalid/unparseable → `getHours()` returns NaN → `NaN < 0` is false, `NaN >= 24` is false → skipped by `if (hour < 0 || hour >= 24) continue` (verify NaN guard works correctly)

### `WeeklySnapshot` with new fields via `mergeWeeklySnapshot`

**Happy path:**
- [ ] `partial` with all three new fields → all written to new entry
- [ ] `partial` without new fields → existing entry's new fields preserved (not overwritten)
- [ ] Merge into existing entry that had no new fields → fields added
- [ ] `hourlyIntensity` with non-zero sums → stored as-is (not pre-divided)

**Backfill guard:**
- [ ] Entry with `hourlySlots` defined but `hourlyIntensity === undefined` → included in `weeksToFill`
- [ ] Entry with all new fields defined → NOT included (no unnecessary re-fetch)

**Mocks needed:** `AsyncStorage` already mocked in project setup. `WorkDiarySlot`
needs `date`, `intensityScore`, `productivityCategory`, `tags` fields; the test
mocks can use UTC dates where `getHours()` is deterministic on CI (all UTC).

---

## Files to Reference

- `src/lib/weeklyHistory.ts:10-82` — `WeeklySnapshot` interface + `mergeWeeklySnapshot`
- `src/hooks/useHistoryBackfill.ts:80-92` — existing `computeHourlySlots` pattern
- `src/hooks/useHistoryBackfill.ts:120-136` — backfill guard logic
- `src/hooks/useHistoryBackfill.ts:174-184` — `mergeWeeklySnapshot` call site
- `src/types/api.ts` — `WorkDiarySlot` (all fields typed by 01-hourly-data-layer)

---

## Out of Scope for This Spec

- `computeHourlyProfile()` and derived insight types (spec 02)
- Any UI component or overview wiring (specs 03, 04)
- Changes to `computeHourlySlots` export (kept for backward compat with existing tests)
