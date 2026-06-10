# Hourly Work Patterns

**Status:** Research complete, ready for spec → implement
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-06-09

Extract the hour-of-day dimension already present in work diary API responses (confirmed 2026-06-09 from live prod data) to answer "when do I work?" — surfaced as a schedule insight chip in the Overview tab.

## Why this feature exists

The work diary API returns `slot.date` (ISO 8601 with timezone offset) on every slot — the local hour is trivially extractable via `new Date(slot.date).getHours()`. The `useHistoryBackfill` hook already fetches 7 days of slots per week; piggybacking a 24-element count array onto that pass costs zero extra API calls.

The resulting "Peak hours: 7am–11am" chip closes the "when am I most productive?" question with real data. It complements the existing pace/AI/BrainLift chips and fills the insight section on days when those chips have no data (e.g., first weeks of use or low AI-usage periods).

## Intended final state

1. **`WorkDiarySlot` is fully typed.** All real API fields (`date`, `time`, `activityLevel`, `intensityScore`, `productivityCategory`, `activities[]`, `secondBrainDeepDive`) are declared in `src/types/api.ts`.
2. **`WeeklySnapshot` carries `hourlySlots?: number[24]`.** Accumulated from work diary slots during the existing backfill pass. Old snapshots without it degrade gracefully (treated as all-zeros by `inferWorkSchedule`).
3. **`inferWorkSchedule(snapshots)` derives the schedule.** Pure function in `src/lib/scheduleInsights.ts`. Returns `WorkSchedule | null` after ≥4 weeks of hourly data. Computes peak hour, contiguous peak range (hours ≥50% of peak density), and overall work window.
4. **Schedule chip in Overview tab.** "Peak hours: 7am–11am / Across N weeks" rendered via `useInsightChips` at lower priority than pace/AI/BrainLift. Only shows when those chips don't fill all 3 slots, or when they aren't available yet.

## Out of scope

| Item | Why excluded |
|---|---|
| Per-day schedule breakdown (Mon vs Thu patterns) | More complex, fewer weekly snapshots available; add after schedule chip is validated |
| Timezone detection / explicit timeZoneId API param | Device `getHours()` is correct; TZ param value is not user-configurable |
| "Most productive time" nudge notification | Deferred — validate insight chip first |
| Schedule comparison / peer benchmarks | Never in scope — Hourglass is personal only |
| `secondBrainDeepDive.probability` display | Typing the field in spec 01 is enough; surface value in a future spec |

## Decomposition

2 specs. Sequential dependency: 01 → 02.

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [hourly-data-layer](specs/01-hourly-data-layer/spec-research.md) | Type `WorkDiarySlot` fully; add `hourlySlots[24]` to `WeeklySnapshot`; accumulate in backfill; update API docs | 02 | — | S |
| 02 | [schedule-insights](specs/02-schedule-insights/spec-research.md) | `inferWorkSchedule()` pure fn + `useWorkSchedule()` hook + `formatScheduleChip()` + integrate into `useInsightChips` | — | 01 | S |

## Design constraint

Follows the Smart Insights design system:
- `InsightChipData` shape: `{ key, boldLine, mutedLine, dotColor }` (existing contract)
- `dotColor`: `colors.cyan` (matches AI% — both are performance metrics)
- Chip priority: pace → AI trend → BrainLift → schedule (schedule fills empty slot only)
- No new components — reuses existing `InsightChip` renderer

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-06-09 | — | Feature created. API confirmed: `slot.date` gives local hour via `new Date(slot.date).getHours()`. Live prod response validated all slot fields. |
| 2026-06-10 | [01-hourly-data-layer](specs/01-hourly-data-layer/spec.md) | **Complete.** Extended `WorkDiarySlot` type (7 new fields + `SecondBrainDeepDive`), added `hourlySlots[24]` to `WeeklySnapshot`, computed in backfill hook, updated API docs. 30 tests, all passing. |
