# 01-hourly-data-layer — Spec Research

**Feature:** Hourly Work Patterns
**Spec:** 01-hourly-data-layer
**Date:** 2026-06-09
**Status:** Research complete

---

## Problem Context

The `WorkDiarySlot` TypeScript type in `src/types/api.ts` only declares 6 fields (`tags`, `autoTracker`, `status`, `memo`, `actions`, `events?`), missing the ~25 real fields the API returns. The critical missing fields for this spec:

- `date: string` — ISO 8601 with timezone offset (e.g. `"2026-06-09T06:50:00-06:00"` with timeZoneId param, `"2026-06-09T12:50:00Z"` without). **This is the key field for hour extraction.**
- `time: string` — `"HH:MM:SS"` — local time if timeZoneId param passed, UTC otherwise.
- Activity/intensity fields: `activityLevel`, `intensityScore`, `productivityCategory`, `activities[]`
- `secondBrainDeepDive` — rich BrainLift probability object, null on most slots

`WeeklySnapshot` in `src/lib/weeklyHistory.ts` already has `dailyHours?: number[]` (7 elements, Mon–Sun) added by the smart-insights feature. We need an analogous `hourlySlots?: number[]` (24 elements, hours 0–23).

`useHistoryBackfill` (`src/hooks/useHistoryBackfill.ts`) already:
1. Fetches 7 days of `WorkDiarySlot[]` per past week via `apiGet` (lines 140–157)
2. Retains raw slots in `slotsData: Record<string, WorkDiarySlot[]>`
3. Calls `computeDailyHours(monday, slotsData)` and saves to `WeeklySnapshot` (line ~162)

Adding `hourlySlots` piggybacks on this existing pass — zero additional API calls.

---

## Exploration Findings

### `WorkDiarySlot` actual API shape (confirmed 2026-06-09 from live prod response)

Sample slot (no BrainLift):
```json
{
  "date": "2026-06-09T06:50:00-06:00",
  "time": "06:50:00",
  "activityLevel": 100,
  "intensityScore": 100,
  "productivityCategory": "PRODUCTIVE",
  "activities": ["AI", "PURE_AI"],
  "tags": ["ai_usage"],
  "autoTracker": true,
  "status": "APPROVED",
  "secondBrainDeepDive": null,
  "events": [...]
}
```

Sample slot with `second_brain` tag:
```json
{
  "date": "2026-06-09T12:20:00-06:00",
  "tags": ["second_brain"],
  "secondBrainDeepDive": {
    "probability": "84.4",
    "ai_tool_actively_present": 90,
    "deep_ai_research_and_synthesis": 85,
    "building_custom_ai_tools": 60,
    "documenting_ai_system_or_prompts": 45,
    "routine_operational_work": 10
  }
}
```

### Backfill API call (lines 140–157 of `useHistoryBackfill.ts`)

```typescript
apiGet<WorkDiarySlot[]>(
  '/api/timetracking/workdiaries',
  { assignmentId, date },   // NO timeZoneId param
  token, useQA,
)
```

Without `timeZoneId`, `slot.date` is UTC (e.g. `"2026-06-09T12:50:00Z"`). Use `new Date(slot.date).getHours()` for local hour — JS `Date` constructor automatically adjusts to device timezone.

### Hour extraction technique

```typescript
const hour = new Date(slot.date).getHours(); // 0-23, device-local
```

Confirmed: `"2026-06-09T12:50:00Z"` on UTC-6 device → `6`.

### `computeDailyHours` (lines 72–78) — pattern to follow

```typescript
function computeDailyHours(
  mondayStr: string,
  slotsData: Record<string, WorkDiarySlot[]>,
): number[] {
  return weekDates(mondayStr).map(date => (slotsData[date]?.length ?? 0) * 10 / 60);
}
```

`computeHourlySlots` follows the same signature pattern but flattens across all days.

---

## Key Decisions

1. **Use `slot.date` not `slot.time` for hour extraction.** Without `timeZoneId` in the API call (current behavior), `slot.time` is UTC. `slot.date` parsed by `new Date().getHours()` gives device-local time unconditionally. No need to add `timeZoneId` to the backfill API call.

2. **`hourlySlots` accumulates all days in the week, not per-day.** Goal is "what hour of day do you typically work?" across the full week. Per-day-per-hour granularity would require 7× storage and makes inference harder — deferred to a future spec.

3. **Same backfill guard as `dailyHours`.** Only write when `Object.keys(dayData).length > 0`. All-zeros `hourlySlots` from weeks with no data is indistinguishable from pre-feature snapshots — `inferWorkSchedule` filters both out via `hourlySlots?.some(c => c > 0)`.

4. **`secondBrainDeepDive` typed as optional with the 6 confirmed fields.** `probability` is the most useful field (shows per-slot BrainLift confidence); the 5 scoring dimensions are confirmed present. Non-exhaustive — additional fields may exist.

---

## Interface Contracts

### FR1: Extend `WorkDiarySlot` in `src/types/api.ts`

New interface before `WorkDiarySlot`:
```typescript
// ← API: slot.secondBrainDeepDive — null on non-BrainLift slots
export interface SecondBrainDeepDive {
  probability: string;                     // float-as-string, e.g. "84.4"
  ai_tool_actively_present: number;        // 0-100
  deep_ai_research_and_synthesis: number;  // 0-100
  building_custom_ai_tools: number;        // 0-100
  documenting_ai_system_or_prompts: number; // 0-100
  routine_operational_work: number;        // 0-100
}
```

Extended `WorkDiarySlot` (add after `events?`):
```typescript
  // New fields confirmed 2026-06-09 from live prod API response
  date: string;              // ← API: ISO+tz, e.g. "2026-06-09T12:50:00Z" (UTC w/o TZ param)
  time: string;              // ← API: "HH:MM:SS" (UTC w/o TZ param; use slot.date for hours)
  activityLevel: number;     // ← API: 1-100
  intensityScore: number;    // ← API: 1-100
  productivityCategory: 'PRODUCTIVE' | 'COMMUNICATION' | 'UNCATEGORIZED'; // ← API
  activities: string[];      // ← API: ["AI","PURE_AI","Chat","Meeting","Office","Development","Uncategorized",...]
  secondBrainDeepDive: SecondBrainDeepDive | null; // ← API: null on most slots
```

### FR2: Extend `WeeklySnapshot` in `src/lib/weeklyHistory.ts`

Add after `dailyHours?:` JSDoc block:
```typescript
  /**
   * Slot count per local hour of day (all Mon–Sun days combined).
   * Length 24, index = local device hour (0-23), value = total slots that hour across the week.
   * Absent on snapshots from weeks processed before this field was added.
   * Consumers treat missing as all-zeros; inferWorkSchedule returns null for < 4 valid weeks.
   */
  hourlySlots?: number[];
```

### FR3: `computeHourlySlots` in `src/hooks/useHistoryBackfill.ts`

New helper (add after `computeDailyHours`):
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

Integration — replace the existing merge call at line ~163:
```typescript
// Before (spec 01 daily-history-store state):
updated = mergeWeeklySnapshot(updated, { weekStart: monday, aiPct, brainliftHours, dailyHours });

// After:
const hourlySlots = computeHourlySlots(slotsData);
updated = mergeWeeklySnapshot(updated, {
  weekStart: monday, aiPct, brainliftHours, dailyHours, hourlySlots,
});
```

### FR4: `docs/CROSSOVER_API.md` — work diary section update

Extend the work diary response shape section to document the real slot fields with types and examples from the 2026-06-09 prod response: `date`, `time`, `activityLevel`, `intensityScore`, `productivityCategory`, `activities[]`, `secondBrainDeepDive`, and the `timeZoneId` query param behavior.

---

## Test Plan

### `computeHourlySlots`

**Happy path:**
- [ ] Empty `slotsData {}` → returns `new Array(24).fill(0)`
- [ ] Single day with 3 slots at UTC `"2026-06-09T13:00:00Z"` on UTC-6 device → `counts[7] === 3`
- [ ] Slots spread across hours 7, 8, 9 → correct per-hour counts
- [ ] Multiple days → counts accumulate across days (not reset per day)
- [ ] `weeksCovered` via correct count field

**Edge cases:**
- [ ] Slot with `date` at hour boundary → no off-by-one
- [ ] 24 distinct hours → all 24 buckets populated correctly

**Mocks needed:** Testing UTC-to-local conversion requires controlled timezone; use UTC dates where `getHours()` on the test machine returns known values, or mock `Date` constructor.

### `WeeklySnapshot` with `hourlySlots` via `mergeWeeklySnapshot`

**Happy path:**
- [ ] Partial with `hourlySlots` → field written to new snapshot
- [ ] Partial without `hourlySlots` → existing snapshot's `hourlySlots` preserved (not overwritten)
- [ ] Merge into existing entry that had no `hourlySlots` → field added

**Edge cases:**
- [ ] `hourlySlots` all-zeros → stored as-is (inference layer filters them out)

---

## Files to Reference

- `src/types/api.ts:14` — `WorkDiarySlot` interface (add ~8 new fields + `SecondBrainDeepDive`)
- `src/lib/weeklyHistory.ts:14-45` — `WeeklySnapshot` interface + `mergeWeeklySnapshot`
- `src/hooks/useHistoryBackfill.ts:72-78` — `computeDailyHours` pattern to follow
- `src/hooks/useHistoryBackfill.ts:160-163` — integration point for `hourlySlots`
- `docs/CROSSOVER_API.md` — work diary section (lines ~295-316) to extend

---

## Out of Scope for This Spec

- `inferWorkSchedule` and schedule chip (spec 02)
- Any change to the API call parameters
- Per-app or per-productivityCategory hourly breakdown
- Displaying `secondBrainDeepDive.probability` in UI
