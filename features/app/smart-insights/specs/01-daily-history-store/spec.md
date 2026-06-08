# 01-daily-history-store

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This spec adds `dailyHours: number[7]` to the `WeeklySnapshot` interface, populating it during the existing history backfill pass at zero additional API cost. Each element represents hours worked on a given day of the week (Mon=0 … Sun=6), derived from work diary slot counts (`slots.length × 10 / 60` per day).

### What is being built

1. **Interface extension** — A single optional field `dailyHours?: number[]` is added to `WeeklySnapshot` in `src/lib/weeklyHistory.ts`. The field is optional to preserve backward compatibility with persisted snapshots that lack it.

2. **Pure helper function** — `computeDailyHours(mondayStr, slotsData)` inside `useHistoryBackfill.ts`. Takes the Monday date string and the `slotsData` map already in scope from the existing per-day work diary fetch, and returns a 7-element array.

3. **Backfill integration** — The existing `mergeWeeklySnapshot` call in `useHistoryBackfill` is extended to include `dailyHours` from the helper. No new API calls, no new hooks, no new data fetches.

### How it works

The backfill hook already fetches 7 days of work diary per past week and stores results in `slotsData: Record<string, WorkDiarySlot[]>` keyed by `YYYY-MM-DD`. After computing `aiPct` and `brainliftHours`, it calls `mergeWeeklySnapshot`. This spec adds one more computation — `computeDailyHours(monday, slotsData)` — to the same pass, then includes `dailyHours` in the merge.

Consumers treat a missing `dailyHours` field as `[0,0,0,0,0,0,0]`, so the work-pattern inference (spec 02) simply requires 4+ weeks with real data before producing a result. This is the correct degradation path for existing users.

### Scope

- **In scope:** Interface change, pure helper, backfill integration, unit tests.
- **Out of scope:** Current-week daily hours (handled by `hoursData.daily` in spec 03), re-backfilling already-processed weeks, consumer hooks (spec 02+).

---

## Out of Scope

1. **Current-week daily hours** — Deferred to [03-pace-prescription](../03-pace-prescription/spec-research.md): The prescription for the live week reads `hoursData.daily: DailyEntry[]` directly from `useHoursData`. The backfill only covers past completed weeks; `dailyHours` in history is only for those past weeks.

2. **Re-backfilling already-processed weeks** — **Descoped:** The backfill gate (`!entry || entry.aiPct === 0`) intentionally skips weeks already processed in prior sessions. Widening the gate to force-re-fetch all 24 weeks of work diary is the exact OOM/API-burst risk the gate exists to prevent. Existing users will accumulate `dailyHours` only on newly-processed weeks going forward.

3. **Work-pattern inference** — Deferred to [02-work-pattern](../02-work-pattern/spec-research.md): `inferWorkPattern(snapshots)` consumes `dailyHours` from this spec. That computation belongs in its own spec.

4. **Pace prescription UI** — Deferred to [03-pace-prescription](../03-pace-prescription/spec-research.md) and [05-insights-ui](../05-insights-ui/spec-research.md): Rendering prescription output is downstream of this infrastructure spec.

5. **AI insights computation** — Deferred to [04-ai-insights](../04-ai-insights/spec-research.md): `computeAIInsights` reads `aiPct` and `brainliftHours`, which already exist in `WeeklySnapshot`. It does not depend on `dailyHours`.

6. **Timesheet as hours source** — **Descoped:** Using timesheet `stats` array instead of work diary slots would require a second parallel API call per day during backfill. The primary use case (rest-day detection, day-weight profile) needs relative patterns, not exact paid hours. Slot-count approximation is close enough.

7. **Schema migration / version bump** — **Descoped:** `dailyHours` is optional; `loadWeeklyHistory` validates only `Array.isArray` and passes optional fields through unchanged. No migration needed.

---

## Functional Requirements

### FR1 — Extend `WeeklySnapshot` interface

Add `dailyHours?: number[]` to the `WeeklySnapshot` interface in `src/lib/weeklyHistory.ts`.

**Success Criteria:**
- `dailyHours` is typed as `number[] | undefined` (optional field)
- JSDoc documents: length 7, Mon=0 … Sun=6, hours from work diary slots, absent on old/skipped weeks
- Existing code that reads `WeeklySnapshot` compiles without modification (field is optional, no breaking change)
- `mergeWeeklySnapshot` already uses `{ ...existing, ...partial }` spread — no change needed to merge logic; the field is preserved automatically

### FR2 — Implement `computeDailyHours` pure helper

Add `computeDailyHours(mondayStr: string, slotsData: Record<string, WorkDiarySlot[]>): number[]` as an internal function in `src/hooks/useHistoryBackfill.ts`.

**Success Criteria:**
- Function is internal (not exported); no JSDoc required per CLAUDE.md convention for internal helpers
- Iterates the 7 dates of the week starting from `mondayStr` using the existing `weekDates()` utility
- For each date: result[i] = `(slotsData[date]?.length ?? 0) * 10 / 60`
- Returns a fixed-length array of exactly 7 elements
- All indices default to 0 when date is absent from `slotsData`
- Handles empty `slotsData {}` → returns `[0,0,0,0,0,0,0]`
- Handles partial week (only some dates present) → absent dates = 0
- Does not mutate `slotsData` or any external state

### FR3 — Integrate `dailyHours` into backfill merge

Extend the existing `mergeWeeklySnapshot` call in `useHistoryBackfill.ts` (near line 154) to include `dailyHours` from `computeDailyHours`.

**Success Criteria:**
- After `computeWeekAI`, also calls `computeDailyHours(monday, slotsData)`
- Passes `dailyHours` in the same `mergeWeeklySnapshot` call as `aiPct` and `brainliftHours`
- No new API calls introduced
- No additional `saveWeeklyHistory` calls (uses the existing single write)
- The 300ms inter-week pause is not changed
- Weeks that are gated out (already have `aiPct > 0`) continue to be skipped — `dailyHours` is NOT computed for them

### FR4 — Preserve `dailyHours` across partial merges

Verify (via test) that the existing merge behavior protects `dailyHours` when other writers (`useEarningsHistory`, `useAIData`) write partial updates that omit the field.

**Success Criteria:**
- `mergeWeeklySnapshot(existing, partial)` where `existing` has `dailyHours` and `partial` omits it → result retains `existing.dailyHours`
- `mergeWeeklySnapshot(existing, partial)` where `existing` lacks `dailyHours` and `partial` includes it → result gains `dailyHours`
- Field survives a round-trip through `saveWeeklyHistory` → `loadWeeklyHistory` (JSON serialization preserves it)

---

## Technical Design

### Files to Reference

| File | Purpose |
|---|---|
| `src/lib/weeklyHistory.ts` | `WeeklySnapshot` interface, `mergeWeeklySnapshot`, `loadWeeklyHistory`, `saveWeeklyHistory` |
| `src/hooks/useHistoryBackfill.ts` | Backfill loop, `slotsData` usage, existing merge call (~line 154), `weekDates()` utility |
| `src/hooks/__tests__/useHistoryBackfillAppBreakdown.test.ts` | Existing test file to co-locate new tests with |

### Files to Create / Modify

| File | Change |
|---|---|
| `src/lib/weeklyHistory.ts` | Add `dailyHours?: number[]` to `WeeklySnapshot` interface with JSDoc |
| `src/hooks/useHistoryBackfill.ts` | Add `computeDailyHours` internal helper; extend `mergeWeeklySnapshot` call to include `dailyHours` |
| `src/hooks/__tests__/useHistoryBackfill.test.ts` | New test file (or extend existing); tests for `computeDailyHours` + merge-preservation integration |

### Data Flow

```
useHistoryBackfill (per past week loop)
  │
  ├─ Fetch 7 days of work diary → slotsData: Record<YYYY-MM-DD, WorkDiarySlot[]>
  │
  ├─ computeWeekAI(slotsData) → { aiPct, brainliftHours }   [existing]
  │
  ├─ computeDailyHours(monday, slotsData) → number[7]        [NEW]
  │
  └─ mergeWeeklySnapshot(updated, {
       weekStart: monday,
       aiPct,
       brainliftHours,
       dailyHours          ← NEW
     })
       │
       └─ saveWeeklyHistory(updated)  [existing]
```

### Interface Contracts

**Modified `WeeklySnapshot`:**
```typescript
export interface WeeklySnapshot {
  weekStart: string;        // YYYY-MM-DD (Monday)
  hours: number;
  earnings: number;
  aiPct: number;
  brainliftHours: number;
  overtime?: number;
  /**
   * Hours worked per day of the week (Mon=0 … Sun=6).
   * Length 7. Computed from work diary slot counts (slot × 10 min / 60).
   * Absent on snapshots from weeks already processed before this spec shipped,
   * or on weeks gated out by the aiPct > 0 backfill guard.
   * Consumers treat missing as [0,0,0,0,0,0,0].
   */
  dailyHours?: number[];
}
```

**New internal helper:**
```typescript
function computeDailyHours(
  mondayStr: string,
  slotsData: Record<string, WorkDiarySlot[]>,
): number[]  // length 7, Mon=0 Sun=6
```

### Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Date absent from `slotsData` | Index = 0 (via `?? 0`) |
| Empty `slotsData {}` | Returns `[0,0,0,0,0,0,0]` |
| Partial week (3 of 7 days fetched) | Absent indices = 0 |
| `mondayStr` is not a Monday | `weekDates()` handles; index 0 = whatever date it returns |
| Merge with `dailyHours` omitted in partial | Spread `{...existing, ...partial}` preserves existing field |
| Round-trip JSON serialization | Arrays serialize natively; `loadWeeklyHistory` validates only `Array.isArray(data)` |

### Known Limitation (m12 — documented, accepted)

The backfill gate (`!entry || entry.aiPct === 0`) skips weeks already processed in prior sessions. Those weeks will **never gain `dailyHours`** retroactively without a forced re-backfill (which is intentionally not done to prevent API bursts). Consumers must handle `dailyHours === undefined` gracefully — the work-pattern inference (spec 02) requires 4+ weeks with data before returning a result.

### Test File Location

Per spec-research.md: co-locate with `src/hooks/__tests__/useHistoryBackfillAppBreakdown.test.ts`. The corrected path is `src/hooks/__tests__/useHistoryBackfill.test.ts` (or extend the existing AppBreakdown file if it already covers the module under test).

### Mocks Needed

- `WorkDiarySlot[]` fixture: array of N objects. Tags/events fields are irrelevant for this spec — only `.length` matters. A minimal fixture is `Array(N).fill({ /* minimal slot shape */ })`.
- `weekDates(mondayStr)` — should be importable from `useHistoryBackfill.ts` or testable indirectly through `computeDailyHours`.
