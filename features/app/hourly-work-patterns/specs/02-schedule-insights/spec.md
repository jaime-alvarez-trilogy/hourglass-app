# 02-schedule-insights

**Status:** Draft
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Owner:** @jaime-alvarez-trilogy
**Blocked by:** 01-hourly-data-layer (complete)

---

## Overview

This spec builds the inference and presentation layer for the "schedule insights" chip — the second and final spec in the `hourly-work-patterns` feature.

**What is being built:**

After spec `01-hourly-data-layer` ships `hourlySlots?: number[24]` on `WeeklySnapshot`, this spec adds:

1. **`inferWorkSchedule(snapshots)`** — a pure function in `src/lib/scheduleInsights.ts` that derives the user's typical work schedule from ≥4 weeks of hourly slot data. Produces a `WorkSchedule` value describing the contiguous peak range and full work window.

2. **`useWorkSchedule()`** — a thin React hook in `src/hooks/useWorkSchedule.ts` that reads `useWeeklyHistory().snapshots` and delegates to `inferWorkSchedule`. Returns `WorkSchedule | null`.

3. **`formatScheduleChip(s: WorkSchedule)`** — a pure formatter added to `src/lib/insightFormatting.ts` that converts a `WorkSchedule` into the standard `InsightChipData` shape (`{ key, boldLine, mutedLine, dotColor }`).

4. **Integration in `useInsightChips()`** — the schedule chip is added as a 4th candidate after the existing three (pace → AI trend → BrainLift). The `.slice(0, 3)` guard ensures it only appears when one of the higher-priority chips is absent.

**How it fits:**

```
WeeklySnapshot[].hourlySlots (from spec 01)
       │
       ▼
inferWorkSchedule()   ←  src/lib/scheduleInsights.ts (pure, no side effects)
       │
       ▼
useWorkSchedule()     ←  src/hooks/useWorkSchedule.ts (thin hook, no caching)
       │
       ▼
formatScheduleChip()  ←  src/lib/insightFormatting.ts (pure, returns InsightChipData)
       │
       ▼
useInsightChips()     ←  src/hooks/useInsightChips.ts (adds schedule as 4th candidate)
       │
       ▼
Overview tab insight chips (existing renderer — no new component needed)
```

**Design constraints respected:**
- `src/lib/*` remains pure (no imports from `src/api/`, `src/store/`, hooks)
- `InsightChipData` shape is unchanged; reuses existing `InsightChip` renderer
- `dotColor: colors.cyan` (matches AI% — both describe performance timing)
- Chip priority preserved: pace → AI trend → BrainLift → schedule

---

## Out of Scope

1. **Per-day-of-week schedule breakdown (Mon vs Thu patterns)**
   - **Deferred:** Unassigned (future spec after schedule chip is validated in production)
   - Rationale: Requires more complex segmentation of weekly snapshots by day-of-week; adds significant inference complexity for unconfirmed user value. Validate the simpler weekly aggregate first.

2. **Secondary or multiple peak ranges**
   - **Descoped:** Not planned for this feature
   - Rationale: Most knowledge workers have a single primary peak window. Multi-peak detection adds complexity and edge cases without clear display affordance in the current chip format.

3. **Work window chip (displaying `windowStart`/`windowEnd` in the chip text)**
   - **Descoped:** `windowStart`/`windowEnd` are computed and available on `WorkSchedule` but not surfaced in this chip
   - Rationale: The peak range chip is more actionable ("when am I busiest"). Full window display is a future enhancement if user research supports it.

4. **`secondBrainDeepDive.probability` display**
   - **Descoped:** Field typed in spec 01 (`WorkDiarySlot`); surfacing the value is a future spec
   - Rationale: Out of scope for schedule/hourly-patterns feature entirely.

5. **Timezone detection / explicit `timeZoneId` API param**
   - **Descoped:** Not planned for this feature
   - Rationale: Device `new Date(slot.date).getHours()` returns the correct local hour. No user-configurable timezone override is needed; confirmed working in spec 01.

6. **"Most productive time" nudge notification**
   - **Deferred:** Unassigned (notifications feature — future spec)
   - Rationale: Validate the insight chip first before building action flows on top of it.

7. **Schedule comparison / peer benchmarks**
   - **Descoped:** Never in scope — Hourglass is a personal productivity tool only.

8. **New UI components**
   - **Descoped:** Reuses existing `InsightChip` renderer; no new React Native components needed.

---

## Functional Requirements

---

### FR1: `inferWorkSchedule` pure function

**File:** `src/lib/scheduleInsights.ts` (new file)

Derives the user's typical work schedule from historical `hourlySlots` data.

**Interface:**

```typescript
export interface WorkSchedule {
  peakRange: [number, number]; // [startHour, endHour] inclusive, e.g. [7, 11]
  peakHour: number;            // single busiest hour (argmax of avg)
  windowStart: number;         // first hour with avg ≥ 2 slots/week
  windowEnd: number;           // last hour with avg ≥ 2 slots/week
  weeksCovered: number;        // count of snapshots with valid (non-zero) hourlySlots
}

/**
 * Derives the user's typical work schedule from historical hourly slot data.
 * Requires ≥ 4 weeks with at least one non-zero slot. Returns null when
 * insufficient data or no detectable peak.
 */
export function inferWorkSchedule(snapshots: WeeklySnapshot[]): WorkSchedule | null;
```

**Algorithm (steps executed in order):**

1. Filter valid: `valid = snapshots.filter(s => s.hourlySlots?.some(c => c > 0))`
2. Guard: `if (valid.length < 4) return null`
3. Aggregate: `agg[h] = sum(valid[i].hourlySlots[h]) / valid.length` for h in 0..23
4. `peakHour = argmax(agg)`; guard `if (agg[peakHour] === 0) return null`
5. `peakRange`: start at `peakHour`; expand left while `agg[h-1] >= 0.5 * agg[peakHour]` (clamp to 0); expand right while `agg[h+1] >= 0.5 * agg[peakHour]` (clamp to 23)
6. `windowStart = first h (0..23) where agg[h] >= 2.0` (undefined means no valid window)
7. `windowEnd = last h (0..23) where agg[h] >= 2.0`
8. Guard: `if (windowStart === undefined || windowEnd === undefined || windowStart >= windowEnd) return null`
9. Return `{ peakRange, peakHour, windowStart, windowEnd, weeksCovered: valid.length }`

**Success Criteria:**

- SC1.1 — With 4+ valid snapshots, returns a non-null `WorkSchedule`
- SC1.2 — `weeksCovered` equals the count of snapshots with at least one non-zero slot (ignores snapshots where `hourlySlots` is undefined or all-zero)
- SC1.3 — `peakHour` is the hour index with the highest average slot count
- SC1.4 — `peakRange[0] <= peakHour <= peakRange[1]` always holds
- SC1.5 — All hours in `peakRange` have `agg[h] >= 0.5 * agg[peakHour]`
- SC1.6 — Hours immediately outside `peakRange` (when they exist) have `agg[h] < 0.5 * agg[peakHour]`
- SC1.7 — `windowStart` is the lowest hour index with `avg >= 2.0`; `windowEnd` is the highest
- SC1.8 — Returns null when fewer than 4 snapshots have valid `hourlySlots`
- SC1.9 — Returns null when all `hourlySlots` are undefined or all-zero across all snapshots
- SC1.10 — Returns null when `agg[peakHour] === 0`
- SC1.11 — Returns null when only one hour qualifies for the work window (`windowStart === windowEnd`)
- SC1.12 — Single-hour peak (no neighbors ≥50%) → `peakRange: [h, h]`
- SC1.13 — Snapshots with `hourlySlots: undefined` are silently excluded (not counted in `weeksCovered`)

---

### FR2: `useWorkSchedule()` hook

**File:** `src/hooks/useWorkSchedule.ts` (new file)

Thin hook that reads `useWeeklyHistory().snapshots` and delegates to `inferWorkSchedule`.

**Interface:**

```typescript
import { useWeeklyHistory } from './useWeeklyHistory';
import { inferWorkSchedule } from '../lib/scheduleInsights';
export type { WorkSchedule } from '../lib/scheduleInsights';

/**
 * Returns the inferred work schedule from WeeklySnapshot history, or null when
 * insufficient data (< 4 weeks with hourlySlots). Reactivity is provided by
 * useWeeklyHistory — re-computes on every backfill write.
 */
export function useWorkSchedule(): WorkSchedule | null {
  const { snapshots } = useWeeklyHistory();
  return inferWorkSchedule(snapshots);
}
```

**Success Criteria:**

- SC2.1 — Hook file exists at `src/hooks/useWorkSchedule.ts`
- SC2.2 — Imports `useWeeklyHistory` from `./useWeeklyHistory`
- SC2.3 — Imports `inferWorkSchedule` from `../lib/scheduleInsights`
- SC2.4 — Re-exports `WorkSchedule` type
- SC2.5 — When `snapshots` is empty, returns null (via `inferWorkSchedule`)
- SC2.6 — When `snapshots` has < 4 valid entries, returns null
- SC2.7 — When `snapshots` has ≥ 4 valid entries, returns non-null `WorkSchedule`
- SC2.8 — Hook has JSDoc comment describing return value and null condition

---

### FR3: `formatScheduleChip()` formatter

**File:** `src/lib/insightFormatting.ts` (modify — add new export)

Converts a `WorkSchedule` into an `InsightChipData`.

**Interface:**

```typescript
import type { WorkSchedule } from './scheduleInsights';

/**
 * Converts a WorkSchedule into an InsightChipData for the schedule chip.
 * boldLine: "Peak hours: {startFmt}–{endFmt}" using am/pm notation.
 * mutedLine: "Across {N} week(s)".
 * dotColor is always colors.cyan.
 */
export function formatScheduleChip(s: WorkSchedule): InsightChipData;
```

**Hour formatting rules (`fmt(h: number) → string`):**
- `h === 0` → `"12am"`
- `h === 12` → `"12pm"`
- `1 <= h <= 11` → `"{h}am"`
- `13 <= h <= 23` → `"{h-12}pm"`

**Output shape:**
```typescript
{
  key: 'schedule',
  boldLine: `Peak hours: ${fmt(s.peakRange[0])}–${fmt(s.peakRange[1])}`,
  mutedLine: `Across ${s.weeksCovered} week${s.weeksCovered === 1 ? '' : 's'}`,
  dotColor: colors.cyan,
}
```

**Success Criteria:**

- SC3.1 — `key === "schedule"`
- SC3.2 — `dotColor === colors.cyan`
- SC3.3 — `boldLine` uses am/pm format: `"Peak hours: 7am–11am"` for `[7, 11]`
- SC3.4 — Midnight edge: `peakRange[0] === 0` → `"12am"` in boldLine
- SC3.5 — Noon edge: `peakRange[1] === 12` → `"12pm"` in boldLine
- SC3.6 — Afternoon: `peakRange[1] === 14` → `"2pm"` in boldLine
- SC3.7 — `mutedLine` is singular for `weeksCovered === 1`: `"Across 1 week"`
- SC3.8 — `mutedLine` is plural for `weeksCovered > 1`: `"Across 8 weeks"`

---

### FR4: Integration in `useInsightChips()`

**File:** `src/hooks/useInsightChips.ts` (modify — add schedule as 4th chip candidate)

Adds the schedule chip at lowest priority after existing three chips.

**Change:**

```typescript
// New imports:
import { useWorkSchedule } from './useWorkSchedule';
import { formatScheduleChip } from '../lib/insightFormatting';

// Inside useInsightChips(), after existing pushes, before return:
const schedule = useWorkSchedule();
if (schedule) chips.push(formatScheduleChip(schedule));
return chips.slice(0, 3); // unchanged
```

**Success Criteria:**

- SC4.1 — When `useWorkSchedule` returns null, no schedule chip is added
- SC4.2 — When `useWorkSchedule` returns a `WorkSchedule` and chips already has 3, schedule chip is NOT included (sliced out)
- SC4.3 — When `useWorkSchedule` returns a `WorkSchedule` and chips has 0, schedule chip appears as the only chip
- SC4.4 — When `useWorkSchedule` returns a `WorkSchedule` and chips has 2, schedule chip appears as the 3rd chip
- SC4.5 — Schedule chip key is `"schedule"` when present
- SC4.6 — Hook imports `useWorkSchedule` and `formatScheduleChip`
- SC4.7 — `chips.slice(0, 3)` is still applied after all four pushes

---

## Technical Design

---

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/weeklyHistory.ts` | `WeeklySnapshot` type — `hourlySlots?: number[]` (added in spec 01) |
| `src/lib/insightFormatting.ts` | `InsightChipData` interface; `formatCorrelationChip` as pattern for new formatter |
| `src/lib/colors.ts` | `colors.cyan` token for `dotColor` |
| `src/lib/workPattern.ts` | Pattern: pure function consuming `WeeklySnapshot[]` without hooks |
| `src/hooks/useInsightChips.ts` | Integration point — add 4th chip push before `.slice(0, 3)` |
| `src/hooks/useWeeklyHistory.ts` | Source of `snapshots: WeeklySnapshot[]` |
| `src/hooks/useAIInsights.ts` | Pattern: hook consuming `useWeeklyHistory` |
| `src/hooks/__tests__/useInsightChips.test.ts` | Existing test file to extend for FR4 |
| `src/lib/__tests__/` | Home for FR1 and FR3 unit tests |

---

### Files to Create

| File | Description |
|------|-------------|
| `src/lib/scheduleInsights.ts` | `WorkSchedule` interface + `inferWorkSchedule()` pure function (FR1) |
| `src/hooks/useWorkSchedule.ts` | `useWorkSchedule()` hook (FR2) |
| `src/__tests__/lib/scheduleInsights.test.ts` | Unit tests for `inferWorkSchedule` + `formatScheduleChip` (FR1 + FR3) |
| `src/hooks/__tests__/useWorkSchedule.test.ts` | Static + logic tests for `useWorkSchedule` (FR2) |

---

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/insightFormatting.ts` | Add `formatScheduleChip()` export and `WorkSchedule` import (FR3) |
| `src/hooks/useInsightChips.ts` | Import `useWorkSchedule`, `formatScheduleChip`; add 4th push before `slice` (FR4) |
| `src/hooks/__tests__/useInsightChips.test.ts` | Extend with FR4 schedule chip integration tests |

---

### Module Layering

The change respects the layering diagram from `docs/ARCHITECTURE.md §6.6`:

```
app/ (screens)
  ↓
src/hooks/       ← useWorkSchedule, useInsightChips (modified)
  ↓
src/lib/         ← scheduleInsights.ts, insightFormatting.ts (modified)
  ↓
src/types/
```

`src/lib/scheduleInsights.ts` imports only from `src/lib/weeklyHistory.ts` (for the `WeeklySnapshot` type) — no hooks, no API, no store. This follows the same pattern as `src/lib/workPattern.ts`.

---

### Data Flow

```
AsyncStorage 'weekly_history_v2'
       │  (read on mount + history update events)
       ▼
useWeeklyHistory() → { snapshots: WeeklySnapshot[] }
       │
       ▼
useWorkSchedule() → calls inferWorkSchedule(snapshots)
       │
       ├─ snapshots with valid hourlySlots < 4 → null
       │
       └─ snapshots with valid hourlySlots ≥ 4 →
              aggregate agg[0..23]
              → peakHour = argmax(agg)
              → peakRange = contiguous block ≥50% of peak
              → windowStart/windowEnd = hours ≥2.0 avg slots
              → WorkSchedule { peakRange, peakHour, windowStart, windowEnd, weeksCovered }
                     │
                     ▼
              formatScheduleChip(s) → InsightChipData {
                key: 'schedule',
                boldLine: 'Peak hours: 7am–11am',
                mutedLine: 'Across 6 weeks',
                dotColor: colors.cyan,
              }
                     │
                     ▼
              useInsightChips() → chips[...schedule].slice(0, 3)
                     │
                     ▼
              Overview tab InsightChip renderer (no changes needed)
```

---

### Edge Cases

| Case | Behaviour |
|------|-----------|
| `hourlySlots` absent on all snapshots | `inferWorkSchedule` → null (no valid weeks) |
| `hourlySlots` present but all-zero | Treated as invalid — not counted in `weeksCovered` |
| Exactly 3 valid weeks | → null (below 4-week threshold) |
| Exactly 4 valid weeks | → WorkSchedule if peak detected |
| Peak hour at hour 0 or 23 | `peakRange` clamps at boundary; `peakRange[0]` or `peakRange[1]` equals boundary |
| Only one hour at ≥2 avg slots | `windowStart === windowEnd` → guard fires → null |
| No hours at ≥2 avg slots | `windowStart === undefined` → guard fires → null |
| Chips already at 3 when schedule computed | `slice(0,3)` silently drops schedule chip |
| `peakRange[0] === 0` in formatter | `fmt(0)` → `"12am"` |
| `peakRange[1] === 12` in formatter | `fmt(12)` → `"12pm"` |
| `weeksCovered === 1` | `mutedLine` → `"Across 1 week"` (singular) |

---

### Test Strategy

Tests follow the project convention from `src/hooks/__tests__/useInsightChips.test.ts`:

- **Static analysis** (file-read-based): verify imports, exports, JSDoc presence in hook files
- **Logic tests** (call formatters directly): verify output shape and edge cases without React rendering
- **No `renderHook`**: project convention avoids this; logic is tested by calling pure functions directly or mirroring the hook body

For FR1 (`inferWorkSchedule`): pure function → standard unit tests with fixture data. All success criteria from the spec map 1:1 to test cases.

For FR3 (`formatScheduleChip`): pure function → standard unit tests. Hour formatting edge cases (0, 11, 12, 13, 23) explicitly tested.

For FR2 (`useWorkSchedule`): static analysis of file structure + logic tests (call `inferWorkSchedule` directly with same inputs the hook would pass).

For FR4 (`useInsightChips`): extend existing test file with the `assembleChips`-style helper pattern already present; add `schedule` as 4th input to verify priority and slicing behavior.
