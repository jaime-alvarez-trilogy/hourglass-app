# 02-schedule-insights — Spec Research

**Feature:** Hourly Work Patterns
**Spec:** 02-schedule-insights
**Blocked by:** 01-hourly-data-layer
**Date:** 2026-06-09
**Status:** Research complete

---

## Problem Context

After spec 01 adds `hourlySlots?: number[24]` to `WeeklySnapshot` and backfill populates it, this spec builds the inference layer (pure function) and surfaces the result as a schedule insight chip.

The chip answers "when do I typically work?" — a simple, universal insight that has value even for users without enough AI%/BrainLift history for the existing smart-insights chips.

Integration point is `src/hooks/useInsightChips.ts` which currently returns up to 3 chips in priority order (pace → AI trend → BrainLift). We add schedule as a 4th candidate, still sliced at 3, so it appears when one of the higher-priority chips is absent.

---

## Exploration Findings

### `useInsightChips.ts` — current state (lines 18–31)

```typescript
export function useInsightChips(): InsightChipData[] {
  const p = usePrescription();
  const ai = useAIInsights();
  const chips: InsightChipData[] = [];
  if (p) chips.push(formatPrescriptionChip(p));
  const t = formatTrendChip(ai.trend, ai.best);
  if (t) chips.push(t);
  if (ai.brainliftCorrelation) chips.push(formatCorrelationChip(ai.brainliftCorrelation));
  return chips.slice(0, 3);
}
```

Adding a 4th push before `slice(0, 3)` is safe — schedule only fills a slot when a higher-priority chip is absent.

### `InsightChipData` interface (in `src/lib/insightFormatting.ts`)

```typescript
export interface InsightChipData {
  key: string;
  boldLine: string;
  mutedLine: string;
  dotColor: string;
}
```

### Data source: `useWeeklyHistory`

Already consumed by `useAIInsights`. Returns `{ snapshots: WeeklySnapshot[] }`. After spec 01 ships, each snapshot may carry `hourlySlots?: number[24]`.

### Design tokens

- `colors.cyan` — currently used for AI% in the scrub bar. Appropriate for schedule chip (schedule describes when performance peaks, parallel to AI%).
- Chip key `"schedule"` — unique among existing keys (`"pace"`, `"ai-trend"`, `"brainlift"`).

---

## Key Decisions

1. **Minimum 4 weeks of non-empty `hourlySlots` required.** Fewer weeks produce noisy patterns. Return `null` until threshold met.

2. **Peak range = contiguous block at ≥50% of peak density.** Start from `peakHour`, expand left/right while adjacent hours average ≥50% of peak. This yields a compact window (typically 3–5 hours) rather than a wide spread.

3. **Work window = first/last hour averaging ≥2 slots/week.** 2 slots = 20 min. Anything below is noise (incidental activity). If no hours qualify, return null.

4. **Schedule chip at lowest priority.** Users with full pace + AI + BrainLift data don't need it. It fills naturally for new users or low-AI weeks.

5. **New file `src/lib/scheduleInsights.ts`.** Pure functions only, no hooks, no imports from `api/` or `store/`. Follows layering rule: `src/lib/*` is pure.

6. **`useWorkSchedule()` is a thin hook.** Reads `useWeeklyHistory().snapshots`, calls `inferWorkSchedule`. No additional caching — `useWeeklyHistory` already provides reactive snapshots via AsyncStorage + query invalidation.

---

## Interface Contracts

### FR1: `inferWorkSchedule` in `src/lib/scheduleInsights.ts`

```typescript
export interface WorkSchedule {
  peakRange: [number, number]; // [startHour, endHour] inclusive, e.g. [7, 11]
  peakHour: number;            // single busiest hour (argmax)
  windowStart: number;         // first hour with avg ≥ 2 slots/week
  windowEnd: number;           // last hour with avg ≥ 2 slots/week
  weeksCovered: number;        // count of snapshots with valid hourlySlots
}

/**
 * Derives the user's typical work schedule from historical hourly slot data.
 * Requires ≥ 4 weeks with non-zero hourlySlots. Returns null when insufficient
 * data or no detectable peak.
 */
export function inferWorkSchedule(snapshots: WeeklySnapshot[]): WorkSchedule | null;
```

**Sources:**
- `snapshots` ← `useWeeklyHistory().snapshots` ← `weekly_history_v2` AsyncStorage
- `snapshot.hourlySlots` ← `computeHourlySlots` from spec 01

**Algorithm:**
1. `valid = snapshots.filter(s => s.hourlySlots?.some(c => c > 0))`
2. Guard: `if (valid.length < 4) return null`
3. Aggregate: `agg[h] = sum(valid[i].hourlySlots![h]) / valid.length` for h in 0..23
4. `peakHour = argmax(agg)` — if `agg[peakHour] === 0` return null
5. peakRange: from peakHour, expand left while `agg[h-1] >= 0.5 * agg[peakHour]`, clamp to 0; expand right while `agg[h+1] >= 0.5 * agg[peakHour]`, clamp to 23
6. `windowStart = first h where agg[h] >= 2.0` (or 0 if none — but guard below catches it)
7. `windowEnd = last h where agg[h] >= 2.0`
8. Guard: `if windowStart >= windowEnd return null`
9. Return `{ peakRange, peakHour, windowStart, windowEnd, weeksCovered: valid.length }`

### FR2: `useWorkSchedule()` in `src/hooks/useWorkSchedule.ts`

```typescript
import { useWeeklyHistory } from './useWeeklyHistory';
import { inferWorkSchedule } from '../lib/scheduleInsights';
export type { WorkSchedule } from '../lib/scheduleInsights';

/**
 * Returns the inferred work schedule from WeeklySnapshot history, or null
 * when insufficient data (< 4 weeks with hourlySlots). Reactivity via useWeeklyHistory.
 */
export function useWorkSchedule(): WorkSchedule | null {
  const { snapshots } = useWeeklyHistory();
  return inferWorkSchedule(snapshots);
}
```

**Sources:** `snapshots` ← `useWeeklyHistory` ← `loadWeeklyHistory` ← AsyncStorage

### FR3: `formatScheduleChip()` in `src/lib/insightFormatting.ts`

Add alongside existing formatters:
```typescript
import type { WorkSchedule } from './scheduleInsights';

/**
 * Formats a WorkSchedule into an InsightChipData.
 * boldLine: "Peak hours: 7am–11am"
 * mutedLine: "Across N weeks"
 */
export function formatScheduleChip(s: WorkSchedule): InsightChipData {
  function fmt(h: number): string {
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
  }
  return {
    key: 'schedule',
    boldLine: `Peak hours: ${fmt(s.peakRange[0])}–${fmt(s.peakRange[1])}`,
    mutedLine: `Across ${s.weeksCovered} week${s.weeksCovered === 1 ? '' : 's'}`,
    dotColor: colors.cyan,
  };
}
```

**Sources:** `s.peakRange`, `s.weeksCovered` ← `inferWorkSchedule` (spec 01 data → FR1)

### FR4: Integration in `useInsightChips.ts`

```typescript
// Additional imports
import { useWorkSchedule } from './useWorkSchedule';
import { formatScheduleChip } from '../lib/insightFormatting';

// Inside useInsightChips(), after existing chips:
const schedule = useWorkSchedule();
if (schedule) chips.push(formatScheduleChip(schedule));
return chips.slice(0, 3); // unchanged — schedule fills only if room
```

---

## Test Plan

### `inferWorkSchedule`

**Happy path:**
- [ ] 4 snapshots, all with `hourlySlots`, peak at hour 8 → `peakHour: 8`, `weeksCovered: 4`
- [ ] Peak cluster hours [7,8,9] where agg[7]=3, agg[8]=6, agg[9]=4 → `peakRange: [7,9]` (7 and 9 are ≥50% of 6)
- [ ] Work window: hours 7–17 all ≥2 slots avg → `windowStart: 7`, `windowEnd: 17`
- [ ] 8 snapshots, 6 valid (2 have all-zero hourlySlots) → `weeksCovered: 6`, still ≥4

**Edge cases:**
- [ ] 3 snapshots with valid data → null (below threshold)
- [ ] 4+ snapshots all with `hourlySlots: undefined` → null
- [ ] `agg[peakHour] === 0` → null
- [ ] peakRange expansion: no neighbor ≥50% → `peakRange: [h, h]` (single hour)
- [ ] `windowStart === windowEnd` (only one hour qualifies) → null
- [ ] `windowStart > windowEnd` (shouldn't happen with good data) → null guard

### `formatScheduleChip`

**Happy path:**
- [ ] `peakRange: [7, 11]` → `boldLine: "Peak hours: 7am–11am"`
- [ ] `peakRange: [12, 14]` → `boldLine: "Peak hours: 12pm–2pm"`
- [ ] `peakRange: [0, 1]` → `boldLine: "Peak hours: 12am–1am"`
- [ ] `weeksCovered: 1` → `mutedLine: "Across 1 week"` (singular)
- [ ] `weeksCovered: 8` → `mutedLine: "Across 8 weeks"` (plural)
- [ ] `key === "schedule"`
- [ ] `dotColor === colors.cyan`

### `useInsightChips` — integration

**Happy path:**
- [ ] `useWorkSchedule` returns null → chips ≤3, no schedule chip
- [ ] `useWorkSchedule` returns data, chips already 3 → schedule chip not included (slice(0,3))
- [ ] `useWorkSchedule` returns data, chips < 3 → schedule chip fills the slot

**Mocks needed:** `useWorkSchedule` mock (return null or WorkSchedule fixture). Existing mocks for `usePrescription`, `useAIInsights` already established in `__tests__/hooks/useInsightChips` (or similar pattern from `useStaggeredEntry.test.ts`).

---

## Files to Reference

- `src/lib/insightFormatting.ts` — add `formatScheduleChip`; follow `formatCorrelationChip` pattern
- `src/lib/insightFormatting.ts:15` — `InsightChipData` interface
- `src/lib/workPattern.ts` — pattern for a pure lib function consuming `WeeklySnapshot[]`
- `src/lib/colors.ts` — `colors.cyan` token
- `src/hooks/useInsightChips.ts:18-31` — integration point (add 4th chip push)
- `src/hooks/useAIInsights.ts` — pattern for reading `useWeeklyHistory` in a hook
- `src/hooks/useWeeklyHistory.ts` — source of `snapshots`
- `src/lib/weeklyHistory.ts:14` — `WeeklySnapshot.hourlySlots` (from spec 01)

---

## Out of Scope for This Spec

- Per-day-of-week breakdown (Mon peak vs Thu peak)
- Secondary/multiple peak ranges
- Work window chip (separate from peak range chip)
- Displaying `windowStart`/`windowEnd` in the chip (available in `WorkSchedule` if a future chip wants it)
