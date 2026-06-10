# 01-hourly-data-layer

**Status:** Draft
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This spec establishes the data layer for hourly work-pattern analysis by:

1. **Fully typing `WorkDiarySlot`** — adding the ~8 real API fields (`date`, `time`, `activityLevel`, `intensityScore`, `productivityCategory`, `activities[]`, `secondBrainDeepDive`) that are missing from the current 6-field stub in `src/types/api.ts`. Also adds the helper interface `SecondBrainDeepDive` for the BrainLift probability object.

2. **Adding `hourlySlots?: number[]` to `WeeklySnapshot`** — a 24-element array (index = local hour 0–23, value = slot count that hour) added to `src/lib/weeklyHistory.ts`. Old snapshots without this field degrade gracefully (treated as all-zeros by the inference layer in spec 02).

3. **Computing `hourlySlots` in the backfill hook** — a new `computeHourlySlots(slotsData)` helper in `src/hooks/useHistoryBackfill.ts` accumulates counts across all week days via `new Date(slot.date).getHours()` (device-local), then the result is passed into the existing `mergeWeeklySnapshot` call. Zero extra API calls.

4. **Documenting the work diary API shape** — `docs/CROSSOVER_API.md` is updated with the confirmed field types, `timeZoneId` param behavior, and hour-extraction technique.

### How It Fits Together

```
Work Diary API (existing)
        │  returns WorkDiarySlot[] per date
        ▼
useHistoryBackfill (existing)
        │  already fetches 7 days per past week
        │  NEW: calls computeHourlySlots(slotsData)
        │  passes hourlySlots into mergeWeeklySnapshot
        ▼
WeeklySnapshot (extended)
        │  hourlySlots?: number[24]
        ▼
inferWorkSchedule (spec 02)
        │  reads hourlySlots from ≥4 snapshots
        ▼
Schedule chip in Overview tab (spec 02)
```

The hour-extraction uses `new Date(slot.date).getHours()` which gives device-local time regardless of API timezone params — confirmed correct for the backfill call which omits `timeZoneId` (making `slot.date` UTC; JS `Date` converts to local automatically).

---

## Out of Scope

1. **`inferWorkSchedule` and schedule chip** — **Deferred to [02-schedule-insights](../02-schedule-insights/spec-research.md).** That spec reads `hourlySlots` from ≥4 weekly snapshots and produces the `WorkSchedule | null` result and `formatScheduleChip()` formatter. This spec only produces the data.

2. **Adding `timeZoneId` to the backfill API call** — **Descoped.** Device `getHours()` on the UTC `slot.date` is already correct (JS `Date` auto-converts to local timezone). Adding `timeZoneId` would change `slot.date` format and require finding the user's TZ ID — not necessary and introduces risk.

3. **Per-day or per-productivityCategory hourly breakdown** — **Descoped.** 24-element week-aggregate is sufficient for schedule inference. Per-day patterns (Mon vs Thu) require 7× storage and more weekly snapshots to be meaningful; deferred to a future spec after the baseline chip is validated.

4. **Displaying `secondBrainDeepDive.probability` in UI** — **Descoped.** Typing the field is enough for this spec. Surfacing the per-slot BrainLift confidence score is a future spec.

5. **Backfilling historical snapshots that already exist** — **Descoped.** Existing snapshots in AsyncStorage will lack `hourlySlots`. The inference layer (spec 02) handles this via `hourlySlots?.some(c => c > 0)` guard — weeks without the field are skipped. No migration needed.

6. **`secondBrainDeepDive` exhaustive typing** — **Descoped.** The 6 confirmed fields (`probability` + 5 scoring dimensions) are typed. Additional dimensions may exist but are undiscovered; the interface is intentionally non-exhaustive.

---

## Functional Requirements

### FR1: Extend `WorkDiarySlot` type in `src/types/api.ts`

Add `SecondBrainDeepDive` interface and extend `WorkDiarySlot` with confirmed API fields.

**Success Criteria:**

- `SecondBrainDeepDive` interface is exported with fields: `probability: string`, `ai_tool_actively_present: number`, `deep_ai_research_and_synthesis: number`, `building_custom_ai_tools: number`, `documenting_ai_system_or_prompts: number`, `routine_operational_work: number`
- `WorkDiarySlot` gains 7 new fields: `date: string`, `time: string`, `activityLevel: number`, `intensityScore: number`, `productivityCategory: 'PRODUCTIVE' | 'COMMUNICATION' | 'UNCATEGORIZED'`, `activities: string[]`, `secondBrainDeepDive: SecondBrainDeepDive | null`
- Existing 6 fields (`tags`, `autoTracker`, `status`, `memo`, `actions`, `events?`) are preserved unchanged
- Each new field has a `// ← API:` comment with type, example value, and any behavioral note
- All existing tests that reference `WorkDiarySlot` continue to pass without modification (fields are additive)

---

### FR2: Add `hourlySlots` to `WeeklySnapshot` in `src/lib/weeklyHistory.ts`

Add optional `hourlySlots?: number[]` field to the `WeeklySnapshot` interface.

**Success Criteria:**

- `WeeklySnapshot` interface has `hourlySlots?: number[]` after the `dailyHours?` JSDoc block
- JSDoc block describes: 24-element array, index = device-local hour 0–23, value = total slot count that hour across all Mon–Sun days, absent on pre-feature snapshots
- `mergeWeeklySnapshot` accepts `hourlySlots` in its partial argument and merges it correctly:
  - When partial includes `hourlySlots`: written to the snapshot
  - When partial omits `hourlySlots`: existing `hourlySlots` on the snapshot is preserved (not overwritten with undefined)
- All existing `mergeWeeklySnapshot` call sites (without `hourlySlots`) continue to compile and pass tests

---

### FR3: Add `computeHourlySlots` and integrate in `src/hooks/useHistoryBackfill.ts`

New pure helper function that accumulates per-hour slot counts from a week's `slotsData`, plus integration into the existing backfill merge call.

**Success Criteria:**

- `computeHourlySlots(slotsData: Record<string, WorkDiarySlot[]>): number[]` function exists after `computeDailyHours`
- Returns a 24-element array (all zeros for empty input)
- Uses `new Date(slot.date).getHours()` for hour extraction (device-local)
- Guards against out-of-range hours: `if (hour >= 0 && hour < 24)` before incrementing
- Accumulates counts across all days in `slotsData` (does not reset per day)
- Integration: the existing `mergeWeeklySnapshot` call is updated to include `hourlySlots: computeHourlySlots(slotsData)` in the partial
- All existing backfill tests continue to pass

---

### FR4: Update `docs/CROSSOVER_API.md` work diary section

Document the real `WorkDiarySlot` API fields with confirmed types, examples, and the `timeZoneId` param behavior.

**Success Criteria:**

- Work diary section documents all new fields: `date` (ISO 8601, UTC without `timeZoneId`), `time` (HH:MM:SS, UTC without `timeZoneId`), `activityLevel` (1–100), `intensityScore` (1–100), `productivityCategory` (union type), `activities[]` (string array, confirmed values), `secondBrainDeepDive` (null or object)
- Documents `timeZoneId` query param behavior: without it → `slot.date` and `slot.time` are UTC
- Documents the hour-extraction technique: `new Date(slot.date).getHours()` gives device-local hour
- Includes a minimal JSON example of a productive slot and a BrainLift slot (from 2026-06-09 prod response)
- Does not remove or contradict any existing content in the file

---

## Technical Design

### Files to Modify

| File | Change |
|---|---|
| `src/types/api.ts` | Add `SecondBrainDeepDive` interface; extend `WorkDiarySlot` with 7 new fields |
| `src/lib/weeklyHistory.ts` | Add `hourlySlots?: number[]` to `WeeklySnapshot`; no change to `mergeWeeklySnapshot` logic (spread handles it) |
| `src/hooks/useHistoryBackfill.ts` | Add `computeHourlySlots` after `computeDailyHours`; update `mergeWeeklySnapshot` call to include `hourlySlots` |
| `docs/CROSSOVER_API.md` | Extend work diary slot shape section (§6, lines ~295–316) |

### Files to Create

| File | Purpose |
|---|---|
| `src/__tests__/lib/hourlySlots.test.ts` | Unit tests for `computeHourlySlots` and `WeeklySnapshot.hourlySlots` via `mergeWeeklySnapshot` |

### Files to Reference

| File | Relevant Section |
|---|---|
| `src/types/api.ts` | Line 14+ — current `WorkDiarySlot` (6 fields to preserve) |
| `src/lib/weeklyHistory.ts` | Lines 14–45 — `WeeklySnapshot` interface + `mergeWeeklySnapshot` |
| `src/hooks/useHistoryBackfill.ts` | Lines 73–78 — `computeDailyHours` pattern; lines 160–163 — integration point |
| `docs/CROSSOVER_API.md` | Lines 287–325 — existing work diary slot shape to extend |

---

### Data Flow

```
useHistoryBackfill.processWeek(monday)
  │
  ├── fetches slotsData: Record<string, WorkDiarySlot[]>
  │   (7 API calls, one per date, already existing)
  │
  ├── computeDailyHours(monday, slotsData) → number[7]   [existing]
  ├── computeHourlySlots(slotsData) → number[24]          [new]
  │   └── for each day's slots:
  │       for each slot:
  │           hour = new Date(slot.date).getHours()  // device-local
  │           counts[hour]++
  │
  └── mergeWeeklySnapshot(updated, {
          weekStart: monday,
          aiPct, brainliftHours, dailyHours,
          hourlySlots,                                     [new]
      })
```

### Interface Contracts

**`SecondBrainDeepDive` (new, in `src/types/api.ts`):**
```typescript
export interface SecondBrainDeepDive {
  probability: string;                      // float-as-string, e.g. "84.4"
  ai_tool_actively_present: number;         // 0-100
  deep_ai_research_and_synthesis: number;   // 0-100
  building_custom_ai_tools: number;         // 0-100
  documenting_ai_system_or_prompts: number; // 0-100
  routine_operational_work: number;         // 0-100
}
```

**Extended `WorkDiarySlot` (additive — new fields after `events?`):**
```typescript
// Fields below confirmed 2026-06-09 from live prod API response
date: string;               // ISO+tz, e.g. "2026-06-09T12:50:00Z" (UTC w/o timeZoneId param)
time: string;               // "HH:MM:SS" (UTC w/o timeZoneId; use slot.date for hour extraction)
activityLevel: number;      // 1-100
intensityScore: number;     // 1-100
productivityCategory: 'PRODUCTIVE' | 'COMMUNICATION' | 'UNCATEGORIZED';
activities: string[];       // ["AI","PURE_AI","Chat","Meeting","Office","Development","Uncategorized"]
secondBrainDeepDive: SecondBrainDeepDive | null; // null on most slots
```

**`computeHourlySlots` (new, in `src/hooks/useHistoryBackfill.ts`):**
```typescript
/** Returns 24-element slot count array indexed by device-local hour. */
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

**Updated `mergeWeeklySnapshot` call (line ~163 of `useHistoryBackfill.ts`):**
```typescript
// Before:
updated = mergeWeeklySnapshot(updated, { weekStart: monday, aiPct, brainliftHours, dailyHours });

// After:
const hourlySlots = computeHourlySlots(slotsData);
updated = mergeWeeklySnapshot(updated, {
  weekStart: monday, aiPct, brainliftHours, dailyHours, hourlySlots,
});
```

---

### Edge Cases

| Scenario | Handling |
|---|---|
| Empty `slotsData` (week with no diary data) | `computeHourlySlots` returns 24 zeros; stored as-is; spec 02 filters via `hourlySlots?.some(c => c > 0)` |
| Slot `date` at hour boundary (e.g., `T07:00:00Z`) | `getHours()` returns `7`; no off-by-one |
| Old snapshots without `hourlySlots` | `mergeWeeklySnapshot` spread ignores undefined; field simply absent on old entries |
| `mergeWeeklySnapshot` called without `hourlySlots` | Existing `hourlySlots` on stored snapshot preserved via `{ ...s, ...partial }` — partial omits the key, spread does not overwrite |
| `slot.date` is malformed / NaN | `new Date(malformedString).getHours()` returns `NaN`; `NaN >= 0` is `false`; guard skips safely |

---

### Test Design

**Test file:** `src/__tests__/lib/hourlySlots.test.ts`

**`computeHourlySlots` tests:**
- Empty input → `new Array(24).fill(0)`
- Single slot at `"2026-06-09T13:00:00Z"` → `counts[hour] === 1` (exact hour depends on test machine TZ; test by checking sum = 1 and the bucket for `new Date("2026-06-09T13:00:00Z").getHours()` = 1)
- 3 slots at same UTC timestamp → correct bucket = 3
- Slots at 3 distinct UTC timestamps with distinct local hours → each bucket = 1
- Multiple days accumulate (same local hour across two days → that bucket = 2)
- 24 slots spanning 24 distinct local hours → every bucket exactly 1, sum = 24

**`WeeklySnapshot.hourlySlots` via `mergeWeeklySnapshot` tests:**
- `mergeWeeklySnapshot([], { weekStart, hourlySlots: new Array(24).fill(0) })` → new entry has `hourlySlots` field
- `mergeWeeklySnapshot([entry with hourlySlots], { weekStart })` (no `hourlySlots` in partial) → `hourlySlots` preserved on merged entry
- All-zero `hourlySlots` → stored (inference layer filters later, not here)
