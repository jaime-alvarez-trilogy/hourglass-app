# Spec Research: 01-daily-history-store

## Problem

`WeeklySnapshot` stores weekly totals (hours, earnings, aiPct, brainliftHours) but no per-day breakdown. Work-pattern inference and the smart pace prescription both need to know how many hours the user typically works each day of the week. The backfill hook already fetches 7 days of work diary per week — per-day slot counts are in memory during that pass and thrown away.

## Exploration Findings

### Current `WeeklySnapshot` shape (`src/lib/weeklyHistory.ts:10-17`)
```typescript
export interface WeeklySnapshot {
  weekStart: string;        // YYYY-MM-DD (Monday)
  hours: number;
  earnings: number;
  aiPct: number;
  brainliftHours: number;
  overtime?: number;        // optional — old snapshots may lack it
}
```

### Where snapshots are written (two writers)
1. **`useEarningsHistory`** (`src/hooks/useEarningsHistory.ts:150-165`) — writes `hours`, `earnings`, `overtime` per week from the payments API.
2. **`useAIData`** (`src/hooks/useAIData.ts:308`) — writes `aiPct`, `brainliftHours` for the week just ended (Monday flush).
3. **`useHistoryBackfill`** (`src/hooks/useHistoryBackfill.ts:152-158`) — writes `aiPct`, `brainliftHours` for past weeks with gaps.

### Where the daily slot data already exists
In `useHistoryBackfill` (lines 127-158), for each past week:
```typescript
const slotsData: Record<string, WorkDiarySlot[]> = {};
// ...per day in parallel:
slotsData[dates[i]] = result.value; // raw slots retained for app breakdown
```
`slotsData[date].length * 10 / 60` = hours for that day (each slot = 10 min).

This data is used for app breakdown (FR6 line 164) and then discarded. We need to also compute a `number[7]` (Mon–Sun) from it.

### Work diary vs timesheet as hours source
- **Timesheet** (`stats` array): hours per day from Crossover's backend — only present for days with tracked time; absent days = 0h. More authoritative for "paid hours."
- **Work diary slots**: `slots.length × 10 / 60` — reflects actual screen-tracked time. May differ from timesheet (manual time adds to timesheet but not work diary).

Decision: use **work diary slot count** for the `dailyHours` field. Reason: the backfill already fetches work diary per day; using timesheet would require a second parallel API call per day. The primary insight use case (rest-day detection, day-weight profile) needs relative patterns, not exact paid hours. Close enough.

### Current-week daily data path
`useHoursData` returns `hoursData.daily: DailyEntry[]` where each entry has `{ date, hours, isToday }`. This comes from the timesheet `stats` array. The current week is NOT in `weekly_history_v2` until Monday flush — so prescription for the current week uses `hoursData.daily` directly, not history.

### `mergeWeeklySnapshot` (`src/lib/weeklyHistory.ts:35-63`)
Merge logic: if `weekStart` already exists, `{ ...existing, ...partial }` — so adding a new optional field to `WeeklySnapshot` is backward-compatible. Old entries without `dailyHours` will be missing the field until backfilled.

### Max history: 24 weeks (`WEEKLY_HISTORY_MAX = 24`)

## Key Decisions

**D1: Store as `number[7]` (Mon=0 … Sun=6), NOT a Record.**
Fixed-length array is compact, index-stable, and maps directly to day-of-week arithmetic. 7 floats ≈ 56 bytes per snapshot.

**D2: Absent = graceful zero, not null.**
Old snapshots without `dailyHours` are treated as `[0,0,0,0,0,0,0]` by consumers. This means the work-pattern inference returns "not enough data" until real values accumulate — correct behavior.

**D3: Populate during backfill, not as a separate hook.**
Adding `dailyHours` computation into the existing backfill loop costs zero extra API calls. A new hook would require re-fetching everything already fetched.

**D4: Current week's `dailyHours` comes from `hoursData.daily`, not history.**
`useHistoryBackfill` only covers past completed weeks. The prescription for the live week reads `DailyEntry[]` directly.

## Interface Contracts

### Modified `WeeklySnapshot` (in `src/lib/weeklyHistory.ts`)
```typescript
export interface WeeklySnapshot {
  weekStart: string;
  hours: number;
  earnings: number;
  aiPct: number;
  brainliftHours: number;
  overtime?: number;
  dailyHours?: number[]; // NEW — length 7, Mon=0 Sun=6, hours from work diary slots
                          // ← computed: slotsData[date].length * 10 / 60
                          // ← absent on old snapshots; consumers treat missing as [0,0,0,0,0,0,0]
}
```

### New helper in `useHistoryBackfill.ts`
```typescript
// Pure helper — no side effects
function computeDailyHours(
  mondayStr: string,          // YYYY-MM-DD
  slotsData: Record<string, WorkDiarySlot[]>, // keyed by YYYY-MM-DD
): number[]                   // length 7, Mon=0 Sun=6
```
- Iterates `weekDates(mondayStr)` (7 dates)
- For each date: `(slotsData[date]?.length ?? 0) * 10 / 60`
- Returns the 7-element array

### Modified `mergeWeeklySnapshot` call in `useHistoryBackfill`
After `computeWeekAI`, also call `computeDailyHours` and include in the merge:
```typescript
const dailyHours = computeDailyHours(monday, slotsData);
updated = mergeWeeklySnapshot(updated, { weekStart: monday, aiPct, brainliftHours, dailyHours });
```

## Test Plan

### `computeDailyHours`
**Signature:** `(mondayStr: string, slotsData: Record<string, WorkDiarySlot[]>) => number[]`

**Happy path:**
- [ ] All 7 days present with slots → returns 7-element array, each = `slots.length * 10/60`
- [ ] Monday has 48 slots (8h) → returns `[8, ...]`
- [ ] Sunday has 0 slots → returns `[..., 0]`

**Edge cases:**
- [ ] Date absent from slotsData → that index = 0 (not NaN)
- [ ] Empty slotsData `{}` → returns `[0,0,0,0,0,0,0]`
- [ ] mondayStr is a Sunday (shouldn't happen; guard gracefully → index 0 = 0)
- [ ] Partial week (only 3 days fetched) → remaining indices = 0

**Integration — mergeWeeklySnapshot with dailyHours:**
- [ ] Old snapshot without `dailyHours` + merge with `dailyHours` → snapshot gains the field
- [ ] Snapshot already has `dailyHours` → merge overwrites it
- [ ] `dailyHours` survives round-trip through JSON (no Date coercion issues)

**Mocks needed:**
- `WorkDiarySlot[]` fixtures: array of N slots (tags/events don't matter for this spec)

## Files to Create/Modify

| File | Change |
|---|---|
| `src/lib/weeklyHistory.ts` | Add `dailyHours?: number[]` to `WeeklySnapshot` interface |
| `src/hooks/useHistoryBackfill.ts` | Add `computeDailyHours` helper; include in `mergeWeeklySnapshot` call |
| `src/__tests__/hooks/useHistoryBackfill.test.ts` | Tests for `computeDailyHours` + integration with merge |

## Verification Tiers

- **Tier 1 (unit tests):** `computeDailyHours` pure function — all edge cases above.
- **Tier 2 (integration):** After backfill runs on device, `weekly_history_v2` entries for past weeks should have `dailyHours` arrays. Verify via Settings → Debug Log → Share Log, inspect JSON.
- **Tier 3 (TestFlight):** Open app, go to Overview, wait for backfill animation. Force-close and re-open. Check that `dailyHours` persists across sessions.
