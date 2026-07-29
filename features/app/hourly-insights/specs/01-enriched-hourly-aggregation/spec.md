# 01-enriched-hourly-aggregation

**Status:** Draft
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This spec adds three new 24-element hourly arrays to the `WeeklySnapshot` type and computes them during the existing backfill pass — **zero extra API calls**.

### What is being built

Three new optional fields on `WeeklySnapshot` in `src/lib/weeklyHistory.ts`:

| Field | Type | Semantics |
|---|---|---|
| `hourlyIntensity` | `number[24]` | Sum of `intensityScore` per local hour across all Mon–Sun days |
| `hourlyAISlots` | `number[24]` | Count of `ai_usage` or `second_brain` tagged slots per local hour |
| `hourlyProductiveSlots` | `number[24]` | Count of `PRODUCTIVE` `productivityCategory` slots per local hour |

### How it fits in

The backfill hook (`src/hooks/useHistoryBackfill.ts`) already iterates every `WorkDiarySlot` to call `countDiaryTags()`. Those same slot objects carry `intensityScore`, `tags`, and `productivityCategory` — all currently discarded after tag counting. This spec piggybacks three additional accumulators onto that same pass.

A new fused helper `computeHourlyEnrichment(slotsData)` replaces the separate `computeHourlySlots` call at the backfill integration site, returning all four arrays (including `hourlySlots`) in a single pass. The existing exported `computeHourlySlots` function is kept for backward compatibility with existing tests.

### Re-backfill on upgrade

Old snapshots that have `hourlySlots` but lack the three new fields must be re-processed on first run after the app updates. The backfill guard in `runBackfill` is extended with three additional OR conditions so any missing new field triggers re-processing.

---

## Out of Scope

1. **`computeHourlyProfile()` and derived insight types** — **Deferred to 02-hourly-pattern-insights.** Computing per-hour averages and identifying focus/AI windows from the stored arrays is the responsibility of spec 02.

2. **Any UI component or chart rendering** — **Deferred to 03-hourly-pattern-card.** The `HourlyPatternCard` component lives in spec 03 and reads from the hook introduced in spec 02.

3. **Overview tab wiring** — **Deferred to 04-overview-integration.** Plugging the card into `overview.tsx` with stagger count adjustment is spec 04's scope.

4. **Changes to `computeHourlySlots` export** — **Descoped.** The existing function is kept as-is for backward compatibility with tests already written against it. It is not removed, deprecated, or modified.

5. **`secondBrainDeepDive.probability` per-slot accumulation** — **Descoped.** The field is typed in the WorkDiarySlot interface but not surfaced here; deferred to a future spec outside the hourly-insights feature.

6. **Per-day breakdown (Mon vs Thu patterns)** — **Descoped.** `DayPatternChart` handles day-of-week dimension; the three new arrays intentionally collapse all days into a single 24-bucket histogram to avoid overlap.

---

## Functional Requirements

### FR1: Extend `WeeklySnapshot` type

Add three optional fields to the `WeeklySnapshot` interface in `src/lib/weeklyHistory.ts` and extend `mergeWeeklySnapshot` to propagate them.

**Success Criteria:**
- `WeeklySnapshot` has `hourlyIntensity?: number[]`, `hourlyAISlots?: number[]`, `hourlyProductiveSlots?: number[]` fields with JSDoc matching the research contracts
- `mergeWeeklySnapshot` writes all three fields when present in `partial` using the existing conditional-spread pattern
- TypeScript compiles without error (`tsc --noEmit`)
- Existing snapshot fields and merge behavior are unaffected

### FR2: Add `computeHourlyEnrichment` fused helper

Add a new function `computeHourlyEnrichment(slotsData: Record<string, WorkDiarySlot[]>): HourlyEnrichment` to `src/hooks/useHistoryBackfill.ts`.

**Success Criteria:**
- Returns an `HourlyEnrichment` object with `hourlySlots`, `hourlyIntensity`, `hourlyAISlots`, `hourlyProductiveSlots` — all `number[24]`
- Empty input returns four `new Array(24).fill(0)` arrays
- Each slot's contribution is determined by `new Date(slot.date).getHours()` for the hour bucket
- `hourlyIntensity[h]` accumulates `slot.intensityScore ?? 0` (null-coalesces to 0)
- `hourlyAISlots[h]` increments when `slot.tags` includes `'ai_usage'` or `'second_brain'`
- `hourlyProductiveSlots[h]` increments when `slot.productivityCategory === 'PRODUCTIVE'`
- Hours outside `[0, 23]` (including NaN from invalid dates) are skipped via `!Number.isFinite(hour)` guard
- Multiple slots at the same hour produce correct sums (intensity is sum, not average)
- The existing exported `computeHourlySlots` function is not removed or modified

### FR3: Update backfill guard to detect missing new fields

Extend the `weeksToFill` guard in `runBackfill` so weeks with `hourlySlots` present but any of the three new fields missing are re-processed on first run after upgrade.

**Success Criteria:**
- The guard condition includes `|| entry.hourlyIntensity === undefined || entry.hourlyAISlots === undefined || entry.hourlyProductiveSlots === undefined`
- A snapshot with all three new fields defined and other guard conditions met is NOT re-backfilled
- A snapshot with `hourlySlots` defined but `hourlyIntensity === undefined` IS included in `weeksToFill`
- A snapshot with `hourlyAISlots === undefined` (any one of the three) IS included in `weeksToFill`
- Existing guard conditions (`!entry`, `entry.aiPct === 0`, `entry.dailyHours === undefined`, `entry.hourlySlots === undefined`) are preserved unchanged

### FR4: Replace `computeHourlySlots` call site with `computeHourlyEnrichment`

At the `mergeWeeklySnapshot` call site in `runBackfill`, replace the separate `computeHourlySlots` call with `computeHourlyEnrichment` and spread all four resulting arrays into the snapshot merge.

**Success Criteria:**
- The call site uses `const enrichment = computeHourlyEnrichment(slotsData)` instead of `const hourlySlots = computeHourlySlots(slotsData)`
- `mergeWeeklySnapshot` receives `...enrichment` spreading all four arrays
- The existing behavior of `hourlySlots` in the snapshot is preserved (same values, same type)
- All three new fields (`hourlyIntensity`, `hourlyAISlots`, `hourlyProductiveSlots`) are now written to the snapshot on every backfill pass

---

## Technical Design

### Files to Reference

| File | Lines | Purpose |
|---|---|---|
| `src/lib/weeklyHistory.ts` | 10–82 | `WeeklySnapshot` interface + `mergeWeeklySnapshot` |
| `src/hooks/useHistoryBackfill.ts` | 80–92 | Existing `computeHourlySlots` pattern to extend |
| `src/hooks/useHistoryBackfill.ts` | 120–136 | Backfill guard logic (FR3 target) |
| `src/hooks/useHistoryBackfill.ts` | 174–184 | `mergeWeeklySnapshot` call site (FR4 target) |
| `src/types/api.ts` | — | `WorkDiarySlot` type (all fields including `intensityScore`, `productivityCategory`, `tags`) |

### Files to Modify

| File | Change |
|---|---|
| `src/lib/weeklyHistory.ts` | Add 3 optional fields to `WeeklySnapshot`; extend `mergeWeeklySnapshot` conditional spreads |
| `src/hooks/useHistoryBackfill.ts` | Add `HourlyEnrichment` interface + `computeHourlyEnrichment` function; update guard; update call site |

### Files to Create / Extend (Tests)

| File | Change |
|---|---|
| `src/hooks/__tests__/useHistoryBackfill.test.ts` | Add tests for `computeHourlyEnrichment` (all cases from Test Plan) |
| `src/__tests__/lib/hours.test.ts` (or new file) | Add tests for `mergeWeeklySnapshot` with new fields and backfill guard |

### Data Flow

```
WorkDiarySlot[]   →  computeHourlyEnrichment()  →  HourlyEnrichment
  .date               hourlySlots[24]               (4 arrays, single pass)
  .intensityScore     hourlyIntensity[24]
  .tags               hourlyAISlots[24]
  .productivityCat    hourlyProductiveSlots[24]
       ↓
mergeWeeklySnapshot(entry, { weekStart, aiPct, brainliftHours, dailyHours, ...enrichment })
       ↓
WeeklySnapshot persisted to AsyncStorage
       ↓
useWeeklyHistory() → consumed by spec 02 computeHourlyProfile()
```

### Interface Contracts

#### `HourlyEnrichment` (local interface in `useHistoryBackfill.ts`)

```typescript
interface HourlyEnrichment {
  hourlySlots: number[];
  hourlyIntensity: number[];       // sum-of-intensityScore per hour
  hourlyAISlots: number[];         // count of ai_usage|second_brain slots per hour
  hourlyProductiveSlots: number[]; // count of PRODUCTIVE slots per hour
}
```

#### `computeHourlyEnrichment` signature

```typescript
function computeHourlyEnrichment(
  slotsData: Record<string, WorkDiarySlot[]>,
): HourlyEnrichment
```

#### New `WeeklySnapshot` fields

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

### Edge Cases

| Case | Handling |
|---|---|
| `slot.intensityScore` is `undefined` (API omits field) | `?? 0` null-coalesces to 0; no NaN propagation |
| `slot.date` is invalid/unparseable | `new Date(invalid).getHours()` returns `NaN`; guard uses `!Number.isFinite(hour)` to catch NaN before the range check |
| Empty `slotsData` (`{}`) | Outer loop never executes; all four arrays remain zero-filled |
| Multiple slots at hour `h` | `hourlyIntensity[h]` accumulates (sum not average); slots/AI/productive counts also accumulate |
| `slot.tags` is `[]` or missing `ai_usage`/`second_brain` | `Array.includes` returns false; `hourlyAISlots[h]` not incremented |
| `productivityCategory` is `"COMMUNICATION"` or `"UNCATEGORIZED"` | Strict equality `=== 'PRODUCTIVE'` fails; `hourlyProductiveSlots[h]` not incremented |

### Storage Contract

`hourlyIntensity` is stored as **sum of scores** (not average). At read time (spec 02's `computeHourlyProfile`), the average per hour is `hourlyIntensity[h] / hourlySlots[h]` (guard against division by zero when `hourlySlots[h] === 0`). Storing the sum avoids floating-point drift when partial weeks are merged across multiple backfill runs.

### Backward Compatibility

- Existing snapshots without the three new fields remain valid. Consumers (spec 02+) treat `undefined` as all-zeros.
- `computeHourlySlots` export is **not removed**. Existing tests that call it directly continue to pass.
- The backfill guard's new conditions are ORed — a snapshot fully missing the new fields is re-processed exactly once on next app launch.
