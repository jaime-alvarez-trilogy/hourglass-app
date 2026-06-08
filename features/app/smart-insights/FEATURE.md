# Smart Insights

**Status:** Research complete, ready for spec → implement
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-06-06

Turn the 24-week history already stored in `weekly_history_v2` into three actionable insights rendered in the Overview tab, plus the infrastructure that makes them possible (per-day hours stored in history).

## Why this feature exists

The app already fetches and stores rich weekly data — AI%, BrainLift hours, earnings, total hours — but only surfaces it as trend charts. The user sees the line go up; the app never says *why*, *what to do about it*, or *how today compares to their own pattern*.

Three insights close that gap:

1. **AI trend + personal best** — not the weekly number but the 8-week slope and their all-time peak. "You're up 12pts over 8 weeks. Your best was 94% (Apr 7)."
2. **BrainLift → AI% lag correlation** — does a 5h+ BrainLift week predict higher AI% the *following* week? Only shown when statistically meaningful (≥8 pairs, |r| ≥ 0.35). Hypothesis surfaced by the data, not the developer.
3. **Smart pace prescription** — "You need 5.2h today and 3.1h tomorrow to hit 40h by Friday." Normalizes remaining hours against the user's *own* historical day-weight profile so it never pushes work onto their inferred rest days.

The pace prescription requires per-day hours per week in history (not currently stored). The backfill already fetches 7 days of work diary per week; adding `dailyHours: number[7]` to `WeeklySnapshot` is a free data win during the same pass.

## Intended final state

After this feature ships:

1. **`WeeklySnapshot` carries `dailyHours: number[7]`** (Mon–Sun, 0-indexed). Backfill populates it from existing work diary fetches. Old snapshots without it degrade gracefully (treated as all-zeros; prescriptions show "not enough data" until 4 weeks fill in).
2. **Work-pattern profile computed from history.** `inferWorkPattern(snapshots)` returns a `WorkPattern` with per-day average hours and inferred rest days (days averaging < 0.5h over available history). Available after 4+ weeks of `dailyHours` data.
3. **Pace prescription is always current.** `computePrescription(hoursData, pattern)` returns the per-remaining-workday breakdown and a one-line summary string. Updates live as `useHoursData` updates.
4. **AI insights derived from history.** `computeAIInsights(snapshots)` returns the 8-week slope, personal best week, and the BrainLift lag correlation — each with a significance guard (returns null when insufficient data or below threshold).
5. **Insights section in Overview tab.** Renders below the BrainLift chart as 1–3 `InsightChip` components. Chips are surface-level (one bold line + one muted line). Zero chips → section hidden entirely. Fully respects existing design tokens, spacing system, and `useStaggeredEntry` animation pattern.

## Out of scope

| Item | Why excluded |
|---|---|
| Widget prescription line | Deferred — widget layout redesign (WIDGET-INFO-DESIGN.md) should settle first; prescription text belongs in the status row but the layout spec isn't finalized |
| Push notification for pace urgency | Deferred — notification system already complex; add once insights are validated on screen |
| Earnings-at-risk from pending manual | Good idea but requires joining work diary status with approval state — separate feature |
| AI% normalization / quality weighting | Out of scope — the existing midpoint formula is validated and sufficient |
| Social / peer comparison | Never in scope — Hourglass is personal only |

## Decomposition

5 specs. Critical path: 01 → 02 → 03 → 05 (parallel with 04 → 05).

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [daily-history-store](specs/01-daily-history-store/spec-research.md) | Add `dailyHours: number[7]` to `WeeklySnapshot`; compute from work diary slot counts in backfill; migrate old snapshots gracefully | 02, 03 | — | S |
| 02 | [work-pattern](specs/02-work-pattern/spec-research.md) | `inferWorkPattern(snapshots)` — per-day average hours, rest-day detection, day-weight profile | 03 | 01 | S |
| 03 | [pace-prescription](specs/03-pace-prescription/spec-research.md) | `computePrescription(hoursData, pattern, now)` — smart per-day breakdown, summary string; `usePrescription` hook | 05 | 01, 02 | M |
| 04 | [ai-insights](specs/04-ai-insights/spec-research.md) | `computeAIInsights(snapshots)` — 8-week slope, personal best, BrainLift lag correlation with significance guards | 05 | — | M |
| 05 | [insights-ui](specs/05-insights-ui/spec-research.md) | `InsightChip` component + Insights section in `overview.tsx`; design-token compliant, staggered-entry animation, hides when empty | — | 03, 04 | M |

**Critical path:** 01 → 02 → 03 → 05. Spec 04 runs in parallel with 01–03 and joins at 05.

> **Dependency-graph note (validated):** Spec 04's "Blocked By: —" holds because `useAIInsights` reads `useWeeklyHistory().snapshots` directly (each snapshot already carries `aiPct`, `brainliftHours`, `weekStart`) — it does NOT depend on spec 01's `dailyHours`, nor on `useOverviewData`. No spec modifies `useOverviewData` or any other shared hook, so existing Overview chart consumers are unaffected (no unintended blast radius). All other edges (01→02→03, 03/04→05) match the actual import graph.

## Design constraint

All components must follow the existing design system:
- Tokens from `tailwind.config.js` (`bg-surface`, `text-gold`, `text-cyan`, `text-violet`, etc.)
- Spacing and typography from `WIDGET-INFO-DESIGN.md` shared system (11pt readable floor, max 2 type roles)
- `useStaggeredEntry` for card entry animation (matches all other tab screens)
- `GlassCard` / `buildGlassCard` surface pattern for any new card surfaces
- No new color values — only existing palette entries

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-06-06 | — | Feature created. Research phase complete. |
| 2026-06-06 | [01-daily-history-store](specs/01-daily-history-store/spec.md) | **Complete.** `dailyHours?: number[]` added to `WeeklySnapshot`; `computeDailyHours` helper + backfill integration. 21 tests, 423 total passing. |
| 2026-06-06 | [04-ai-insights](specs/04-ai-insights/spec.md) | **Complete.** `linearSlope`, `pearsonR`, `computeAIInsights`, `formatWeekStartLabel`, `useAIInsights`. 59 new tests, 4182 total passing. |
| 2026-06-06 | [02-work-pattern](specs/02-work-pattern/spec.md) | **Complete.** `inferWorkPattern` pure function + `useWorkPattern` hook. 24 tests, 4182 total passing. |
| 2026-06-06 | [03-pace-prescription](specs/03-pace-prescription/spec.md) | **Complete.** `computePrescription` pure function + `usePrescription` hook. 42 tests, 4224 total passing. |
| 2026-06-06 | [05-insights-ui](specs/05-insights-ui/spec.md) | **Complete.** `InsightChip` component + `useInsightChips` hook + `insightFormatting.ts` formatters + `overview.tsx` insights section. 75 new tests, 4299 total passing. |
