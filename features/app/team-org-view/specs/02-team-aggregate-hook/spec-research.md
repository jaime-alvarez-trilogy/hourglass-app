# Spec 02 — Team aggregate hook

**Status:** Research complete
**Complexity:** M
**Blocks:** 04
**Blocked By:** 01

## Problem context

Spec 01 gives a roster. This spec fans out per-report work-diary + timesheet
fetches and aggregates them into the same shape `useOverviewData` already
produces for personal data — weekly hours/AI%/BrainLift trend arrays — plus a
per-person breakdown list, so Spec 04 can render team trends through the
existing `ChartSection` component unmodified.

## Key decisions

**1. Reuse `countDiaryTags`/`aggregateAICache` from `src/lib/ai.ts` per report,
then sum, not average, at the slot level.** These are pure functions
(`src/lib/ai.ts:81-107`, `117-161`) with no config/React dependency — calling
them once per report and summing the raw `TagData` counts (`total`, `aiUsage`,
`secondBrain`, `noTags`) across reports before computing the team-wide AI%
formula gives a slot-weighted average (someone who worked 40h influences the
team % more than someone who worked 5h) rather than a naive average-of-percents
that would treat every report equally regardless of hours worked. This is more
correct and reuses existing, validated math instead of reimplementing it.

**2. New `fetchReportTimesheet()` function, not a call to `fetchTimesheet()`.**
Live QA probing (Spec context, see `memory/reference_crossover_api.md` "Manager
→ report TIMESHEET access CONFIRMED") found that `fetchTimesheet()`'s strategies
2/3 (dropping `teamId`) return `400 CROS-0005` for cross-user queries — unlike
the self-query case, `teamId` is not an optional fallback param for a report
query, it's required. Reusing `fetchTimesheet()` as-is (which takes a
`CrossoverConfig` and would need `config.userId`/`primaryTeamId` swapped for a
report's ids) would risk hitting strategies 2/3 and failing outright, and its
3-strategy retry loop is designed to compensate for shape uncertainty about
*the caller's own* record — not a report's. A new function that always sends
the full 3-param shape is simpler and matches what's actually proven to work.

**3. Fan-out via `Promise.all`, one row per report, mirroring `useAIData`'s
existing `daysToFetch.map(...)` pattern (`src/hooks/useAIData.ts:226-237`) but
over reports instead of days.** Each report contributes one work-diary fetch
(current week, Mon-today) and one timesheet fetch. A report's fetch failing
(e.g. the assignment-specific 500 documented in
`memory/reference_crossover_api.md` "Manager → report work-diary access
CONFIRMED") must not fail the whole hook — caught per-report, that report is
excluded from the aggregate and flagged in its breakdown row, matching the
existing "silent per-item failure, don't blank the whole screen" posture used
throughout `useAIData.ts` (e.g. lines 279-280, 295, 329-334 all catch-and-ignore
at the per-operation level).

**4. `staleTime: 24 * 60 * 60 * 1000`, standard React Query behavior — no custom
midnight-boundary scheduling.** Per the user's explicit decision this session.
Refetch happens on next mount/focus after 24h elapses, same as any other React
Query default-cadence hook; no new timer/AppState-listener logic like
`useAIData`'s foreground-refetch effect (`src/hooks/useAIData.ts:375-383`) is
needed for this hook specifically — team data is inherently less time-critical
than the user's own live dashboard.

**5. Aggregation window matches `useOverviewData`'s existing pattern: only
CURRENT week is fetched live; historical weeks are not backfilled per-report.**
Building a full N-week history per report would multiply the fan-out by the
window size (e.g. 10 reports × 12 weeks = 120 work-diary calls) — expensive and
unnecessary for a v1. Team charts show only what's fetchable live: the current
week's aggregate, refreshed daily. This intentionally descopes historical team
trend lines beyond what one live fetch can produce; documented as an explicit
limitation, not silently truncated data (the mockup's 12-week sparkline is
aspirational polish, not this spec's contract — see "Out of scope" note below).

## Interface contracts

New file `src/api/team.ts` (continuing from Spec 01, same file):

```typescript
/**
 * Fetches one report's current-week timesheet using the manager's own token.
 * Unlike fetchTimesheet(), always sends the full 3-param shape — cross-user
 * queries return 400 CROS-0005 if teamId is omitted (confirmed live).
 */
export async function fetchReportTimesheet(
  member: TeamMember,
  weekStartDate: string,
  token: string,
  useQA: boolean,
): Promise<TimesheetResponse | null>
```

New file `src/hooks/useTeamAggregateData.ts`:

```typescript
export interface TeamMemberBreakdown {
  member: TeamMember;
  hours: number;        // this week's paid hours from timesheet stats
  aiPct: number;         // this report's own AI% (midpoint, same ±2 formula as personal)
  brainliftHours: number;
  fetchFailed: boolean;  // true if either fetch errored for this report
}

export interface TeamAggregateData {
  weekHours: number;        // sum across all successfully-fetched reports
  weekAiPct: number;         // slot-weighted aggregate (see decision 1)
  weekBrainliftHours: number; // sum across all successfully-fetched reports
  reportCount: number;       // successfully-fetched reports (excludes fetchFailed)
  breakdown: TeamMemberBreakdown[]; // includes fetchFailed rows, for Spec 04 to surface
}

export interface UseTeamAggregateDataResult {
  data: TeamAggregateData | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fans out one work-diary + one timesheet fetch per direct report (from
 * useTeamRoster), aggregates into current-week team totals plus a per-person
 * breakdown. staleTime 24h — standard React Query cadence, refetches on next
 * mount/focus after that window elapses.
 */
export function useTeamAggregateData(): UseTeamAggregateDataResult
```

`queryKey: ['teamAggregate', config?.primaryTeamId, weekStartDate]` — matches
the existing `useTimesheet` key-shape convention (`src/hooks/useTimesheet.ts:24`)
of including the week boundary so the cache naturally rolls over each Monday
without extra invalidation logic.

## Test plan

- [ ] Aggregates two reports' mocked `TagData` correctly into slot-weighted
      team AI% (verify the weighting behavior from decision 1 with a case where
      naive per-percent averaging would give a visibly different answer).
- [ ] One report's work-diary fetch throwing (any error) excludes that report
      from `weekHours`/`weekAiPct`/`weekBrainliftHours` but still includes it in
      `breakdown` with `fetchFailed: true` — the hook's overall `data` is not
      null and `isLoading` resolves normally (no cascading failure).
- [ ] `fetchReportTimesheet` sends `userId`/`managerId`/`teamId` on every call —
      never a 2-param or 1-param request (regression guard against accidentally
      reusing `fetchTimesheet`'s fallback-strategy shape).
- [ ] Empty roster (`useTeamRoster` returns `[]`) produces `reportCount: 0`,
      zeroed aggregate fields, `breakdown: []` — not `null`/an error state.
- [ ] `queryKey` includes the current week's Monday so a week boundary crossing
      produces a distinct cache entry (mirrors `useTimesheet`'s existing test
      coverage pattern for this).

## Files to reference

| File | Why |
|---|---|
| `src/lib/ai.ts:81-161` | `countDiaryTags`/`aggregateAICache` — pure functions reused per-report before summing. |
| `src/hooks/useAIData.ts:226-256` | Reference pattern for parallel per-item fan-out (`Promise.all`) and per-item silent-failure handling. |
| `src/api/timesheet.ts` (full) | Why its 3-strategy fallback is NOT reused as-is for cross-user queries — see decision 2. |
| `src/hooks/useTimesheet.ts` (full) | `queryKey`/`staleTime`/`enabled` shape convention this hook's React Query config should match (with `staleTime` swapped to 24h per this feature's decision). |
| `src/hooks/useOverviewData.ts` (full) | The personal-scope composition hook this one is structurally parallel to — fans out over reports instead of over historical weeks. |
| `memory/reference_crossover_api.md` "Manager → report TIMESHEET/work-diary access CONFIRMED" | The two live-probe findings this spec's data-access approach is built on. |

## Out of scope (for this spec)

- Multi-week historical team trend lines (mockup shows a 12-week sparkline —
  descoped per decision 5; Spec 04 will render a single current-week snapshot,
  not a multi-week `ChartSection` trend, unless a later spec adds week-by-week
  backfill).
- Org tier — this hook only ever fans out over `useTeamRoster`'s direct-report
  list (Spec 01), never recurses into a report's own reports.

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ (load-bearing) | Aggregation math + per-report failure isolation per test plan above |
| Live-QA probe | ✓ (already done — see memory) | Re-verify only if response shape is suspected to have changed |
| TestFlight | — | Deferred to Spec 04 (no UI surface in this spec) |
| Error log | ✓ | Per-report fetch failures should be logged (matching existing `log.error` convention seen in `useAuth.ts:66-71`) even though they don't surface as a hook-level error |
