# Hourly Insights

**Status:** Research complete
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-06-10

Surface richer per-hour work patterns using currently-unused `WorkDiarySlot` fields
(`intensityScore`, `productivityCategory`, `activities[]`) to answer three questions
already backed by data: "when is my focus sharpest?", "when do I use AI most?",
and "what does my typical work day look like hour by hour?"

## Why this feature exists

The hourly-work-patterns feature (spec 01-hourly-data-layer) already accumulates
`hourlySlots[24]` — a per-hour slot count — from the work diary backfill pass. That
same backfill loop iterates every raw `WorkDiarySlot`, which carries `intensityScore`,
`productivityCategory`, and `activities[]` that are currently discarded after
`countDiaryTags()` runs.

Piggybacking three more 24-element arrays (`hourlyIntensity`, `hourlyAISlots`,
`hourlyProductiveSlots`) onto the existing pass costs zero extra API calls and zero
additional user-visible latency. The result is a 24-bar "Patterns" histogram card on
the Overview tab: each bar height = avg slots/hr (work distribution), bar color =
AI rate at that hour (muted → cyan → violet = high AI), with a highlighted
focus-window region marking the peak-intensity block.

## Intended final state

1. **`WeeklySnapshot` carries 3 new hourly arrays.** `hourlyIntensity[24]` (sum of
   intensityScore per hour across the week — divided by `hourlySlots[h]` at read time
   to get avg), `hourlyAISlots[24]` (count of `ai_usage` or `second_brain` tagged
   slots), `hourlyProductiveSlots[24]` (count of `PRODUCTIVE` category slots). Old
   snapshots missing these fields are re-backfilled on first run.

2. **`HourlyProfile` computed from N≥4 weeks.** Pure function
   `computeHourlyProfile(snapshots)` in `src/lib/hourlyInsights.ts` returns per-hour
   averages across all three dimensions plus an `activeWindow` (first/last hour with
   `avgSlots ≥ 0.5`). `inferFocusWindow()` and `inferAIHotZone()` identify the top
   2–4 contiguous hours in their respective dimensions. Returns `null` on < 4 valid
   weeks.

3. **`HourlyPatternCard` visualizes the profile.** 24 bars clipped to the
   `activeWindow`. Bar height proportional to `avgSlots[h]` normalized to peak. Bar
   fill color interpolated by AI rate: muted surface → cyan → violet. Focus window
   region highlighted with a translucent overlay. Two text summary rows:
   "Peak focus: 9am–12pm" and "Peak AI: 10am–11am".

4. **Card wired into Overview tab** below the WORK PATTERN DayPatternChart, guarded
   by `profile !== null`, with staggered entry at index 7 (stagger count 7 → 8).

## Out of scope

| Item | Why excluded |
|---|---|
| Per-day breakdown (Mon vs Thu patterns) | DayPatternChart handles day-of-week dimension; avoid overlap |
| Intraday timeline vs calendar events | No calendar API integration planned |
| Push notification "focus window starts in 30min" | Validate the card first; ship as follow-up |
| `secondBrainDeepDive.probability` per-slot display | Field typed in 01-hourly-data-layer; surface in a future spec |
| AI hot zone chip in existing `InsightChip` area | Patterns card lives below chips, no chip slot competition |

## Decomposition

4 specs. Sequential dependency chain: 01 → 02 → 03 → 04.

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [enriched-hourly-aggregation](specs/01-enriched-hourly-aggregation/spec-research.md) | Add `hourlyIntensity`, `hourlyAISlots`, `hourlyProductiveSlots` to `WeeklySnapshot`; compute in backfill hook; update backfill guard to re-process weeks missing new fields | 02 | — | S |
| 02 | [hourly-pattern-insights](specs/02-hourly-pattern-insights/spec-research.md) | `computeHourlyProfile()` + `inferFocusWindow()` + `inferAIHotZone()` pure fns in `src/lib/hourlyInsights.ts`; `useHourlyInsights()` hook reading from `useWeeklyHistory` | 03 | 01 | M |
| 03 | [hourly-pattern-card](specs/03-hourly-pattern-card/spec-research.md) | `HourlyPatternCard` component — 24-bar histogram clipped to active window, AI-rate color gradient, focus window highlight, two summary text rows | 04 | 02 | M |
| 04 | [overview-integration](specs/04-overview-integration/spec-research.md) | Wire `HourlyPatternCard` + `useHourlyInsights()` into `overview.tsx` at stagger index 7, guarded by `profile !== null`, stagger count 7 → 8 | — | 03 | S |

## Design constraint

Visual language follows DayPatternChart + InsightChip conventions:
- Bar height normalized to `[0, 1]` against peak hour
- Color interpolation: `colors.surface` (0% AI) → `colors.cyan` (50%) → `colors.violet` (100%)
- Focus window highlight: `colors.gold` at 15% opacity
- Section uses existing `Card` + `SectionLabel` wrappers
- Text summary: `colors.textMuted` labels, `colors.text` for values
- Clamp minimum bar height to 2px so zero-slot hours are still visible as ticks

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-06-10 | — | Feature created. Architecture designed after user confirmed: all three directions (focus quality + AI timing + histogram) surfaced as dedicated Patterns card on Overview tab below DayPatternChart. |
