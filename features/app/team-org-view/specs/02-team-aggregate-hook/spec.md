# Team Aggregate Hook

**Status:** Draft
**Created:** 2026-07-28
**Last Updated:** 2026-07-28
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Build a `useTeamAggregateData` hook that turns the current user's direct-report roster into a current-week team snapshot. The hook returns total paid hours, a team-wide AI percentage, BrainLift hours, the number of reports whose data was successfully fetched, and a per-person breakdown. Its result parallels the personal overview data shape closely enough for the team view to consume the same presentation components, while retaining failed rows so the UI can show when an individual report could not be included.

The hook uses `useTeamRoster` as its boundary and fans out one current-week work-diary request per day (Monday through today) plus one timesheet request for each direct report, all in parallel. Cross-user timesheets are fetched through a new `fetchReportTimesheet` API helper that always supplies the report's `userId`, `managerId`, and `teamId`, as required by the confirmed API behavior. Each report is processed independently: `countDiaryTags` and `aggregateAICache` calculate its diary metrics, its timesheet supplies paid hours, and any failure marks that report's breakdown row as failed and excludes it from all aggregate totals without failing the overall query.

Successful reports are combined by summing hours and BrainLift hours and by summing their raw diary tag counts before calculating AI percentage. This produces a slot-weighted team AI percentage rather than an average of individual percentages. The React Query cache is keyed by team and the current week's Monday, with a 24-hour stale time, so a new week naturally creates a new cache entry. This version covers direct reports and the current week only; it does not recurse through the organization or backfill historical team trends.

## Out of Scope

1. **Descoped — Multi-week historical team trend data.** This feature fetches and aggregates only the current week. Backfilling each report across multiple weeks would multiply the API fan-out by the history-window size, so the 12-week trend shown in the mockup is not part of this hook's contract.

2. **Unassigned — Org-tier and recursive-report aggregation.** The hook aggregates only the direct reports supplied by the team roster and does not discover or traverse reports-of-reports. No existing spec in the current decomposition owns the additional API discovery, recursion rules, deduplication, or org-wide aggregation behavior — matches the feature-level framing in FEATURE.md's "Why Org is flagged, not built."

3. **Deferred to `01-team-roster-api` — Direct-report discovery and roster ownership.** This hook consumes the roster rather than fetching, normalizing, or defining direct reports itself. Keeping roster acquisition in its existing spec prevents the aggregate hook from duplicating team-membership logic.

4. **Deferred to `03-scope-toggle-ui` — Personal/team scope selection controls.** Choosing the active dashboard scope and implementing the control that switches between personal and team data are UI concerns; this spec only exposes team aggregate data.

5. **Deferred to `04-team-view-content` — Rendering team totals, per-person breakdowns, and report-level failure states.** This hook returns the aggregate and breakdown contracts, including `fetchFailed`, but does not decide how charts, snapshot values, failed rows, empty teams, or other team-view states appear.

6. **Descoped — Custom midnight or foreground refresh scheduling.** The hook relies on React Query's standard behavior with a 24-hour `staleTime` and a week-start value in the query key. Adding timers, AppState listeners, or forced daily invalidation is unnecessary for the agreed freshness requirements.

7. **Descoped — Generalizing or changing the existing personal `fetchTimesheet()` fallback flow.** Cross-user timesheet requests use a dedicated report-fetch function with all three required identifiers. Refactoring the personal request strategies would broaden this feature's risk without helping the report-query contract.

## Functional Requirements

### FR1 — Fetch a direct report's current-week timesheet

The system MUST provide `fetchReportTimesheet(member, weekStartDate, token, useQA)` in `src/api/team.ts` to fetch a direct report's current-week timesheet using the authenticated manager's token. Every request MUST include the report's `userId`, `managerId`, and `teamId`; it MUST NOT fall back to request shapes that omit any of those identifiers.

#### Success Criteria

- A call for a direct report sends `userId`, `managerId`, and `teamId` together with the requested week start date.
- The request uses the authenticated manager's token and the environment selected by `useQA`.
- The function returns the report's `TimesheetResponse`, or `null` when the API has no timesheet response.
- Automated tests verify that no two-parameter or one-parameter fallback request is attempted.

### FR2 — Fetch current-week data for every direct report

The `useTeamAggregateData` hook MUST obtain the direct-report roster from `useTeamRoster` and concurrently fetch each report's current-week work-diary days (one request per day, Monday through today, mirroring `useAIData`'s existing fan-out) and one current-week timesheet per report. The hook MUST operate only on direct reports and MUST NOT recursively fetch lower organization tiers or historical weeks.

#### Success Criteria

- For each roster member, one work-diary request is initiated per day from Monday through today, plus exactly one current-week timesheet fetch.
- Fetches for multiple reports, and the daily work-diary fetches within a report, are performed concurrently rather than serially.
- Work-diary requests cover Monday through today in the current week.
- No historical-week requests are made.
- No requests are made for people outside the direct-report roster.

### FR3 — Produce team aggregates and a per-person breakdown

The hook MUST return a `TeamAggregateData` object containing `weekHours`, `weekAiPct`, `weekBrainliftHours`, `reportCount`, and `breakdown`. It MUST use `countDiaryTags` and `aggregateAICache` for each successfully fetched report, sum raw tag counts across those reports, and calculate the team AI percentage from the combined counts. Hours and BrainLift hours MUST be summed across successfully fetched reports. Each successful breakdown row MUST contain the member, that member's paid hours, midpoint AI percentage using the same personal-dashboard formula, BrainLift hours, and `fetchFailed: false`.

#### Success Criteria

- `weekHours` equals the sum of current-week paid hours for all successfully fetched reports.
- `weekBrainliftHours` equals the sum of current-week BrainLift hours for all successfully fetched reports.
- `weekAiPct` is calculated from summed raw tag counts, producing a slot-weighted team percentage rather than an average of members' percentages.
- `reportCount` equals the number of reports for whom both required fetches succeeded.
- `breakdown` contains one row per roster member and exposes the specified member-level fields.
- Automated tests include data where slot-weighted aggregation differs visibly from a naive average and verify the slot-weighted result.

### FR4 — Isolate per-report failures and support an empty roster

A failure in either fetch for one report MUST NOT fail the overall team query. The failed report MUST be excluded from all aggregate totals and `reportCount`, retained in `breakdown` with `fetchFailed: true`, and logged using the application's error-logging convention. An empty roster MUST resolve successfully to zeroed aggregate data.

#### Success Criteria

- If either the work-diary or timesheet fetch fails for a report, that report contributes nothing to `weekHours`, `weekAiPct`, or `weekBrainliftHours`.
- A failed report remains in `breakdown` with `fetchFailed: true`.
- Other reports' successful data remains available, the hook-level `data` is not `null`, and loading completes normally.
- Each per-report failure is written to the application error log.
- An empty roster returns `weekHours: 0`, `weekAiPct: 0`, `weekBrainliftHours: 0`, `reportCount: 0`, and `breakdown: []`, without an error.

### FR5 — Expose stable hook state and weekly cache behavior

The system MUST expose `useTeamAggregateData(): UseTeamAggregateDataResult`, returning `data`, `isLoading`, and `error`. Its React Query key MUST be `['teamAggregate', config?.primaryTeamId, weekStartDate]`, and its stale time MUST be 24 hours. It MUST rely on standard React Query mount/focus behavior after data becomes stale and MUST NOT add custom midnight timers or foreground-refetch listeners.

#### Success Criteria

- Consumers receive `data: TeamAggregateData | null`, `isLoading: boolean`, and `error: string | null`.
- The query is scoped by the manager's primary team ID and the current week's Monday.
- Crossing into a new week produces a distinct cache entry.
- Cached team data remains fresh for 24 hours.
- After the stale window, React Query may refetch on the next standard mount or focus event.
- No custom midnight scheduling, timer, or app-foreground listener is introduced by this hook.

## Technical Design

### Summary

Add a current-week team aggregation hook that consumes the direct-report roster
from Spec 01, fetches each report's work-diary and timesheet data with the
manager's credentials, and returns team totals plus a per-person breakdown.
Failures are isolated to the affected report. The hook does not backfill
historical team data.

### Files to Reference

| File | Relevant contract or pattern |
|---|---|
| `src/lib/ai.ts` (`countDiaryTags`, `aggregateAICache`) | Convert work-diary slots to raw tag counts and apply the existing AI percentage, ±2 range, and BrainLift-hours math. Raw counts must be combined before calculating the team percentage. |
| `src/hooks/useAIData.ts` (`daysToFetch.map(...)` fan-out) | Pattern for fetching work-diary days in parallel, converting slots with `countDiaryTags`, and building a date-keyed cache. |
| `src/api/timesheet.ts` | Reference for the timesheet endpoint, authentication behavior, response type, and request parameters. Its fallback strategies must not be reused for report queries. |
| `src/hooks/useTimesheet.ts` | Reference for loading credentials/token, React Query `enabled` behavior, week-boundary cache keys, retries, and mapping query state into a hook. |
| `src/hooks/useOverviewData.ts` | Reference for exposing current-week AI midpoint, hours, and BrainLift values in the shapes used by overview consumers. This team hook is parallel in purpose but does not append historical snapshots. |
| `src/api/team.ts` | Spec 01's team roster API and `TeamMember` contract. This spec extends the same file with `fetchReportTimesheet`. |
| `src/types/api.ts` | Existing `WorkDiarySlot` response type used by `fetchWorkDiary` and `countDiaryTags`; no new shared response type is required. |

### Files to Create/Modify

| File | Change |
|---|---|
| `src/api/team.ts` | **Modify.** Add and export `fetchReportTimesheet(member, weekStartDate, token, useQA)`. Make exactly one request to `/api/timetracking/timesheets` with `date`, `period: 'WEEK'`, `userId`, `managerId`, and `teamId`. Return the first array item or `null`; do not fall back to reduced parameter sets. Reuse `apiGet` and the existing `TimesheetResponse` type. |
| `src/hooks/useTeamAggregateData.ts` | **Create.** Define the public result/breakdown interfaces, consume the Spec 01 roster, fan out report fetches, isolate report failures, combine raw tag counts, and expose the React Query state. |
| `src/__tests__/api/team.test.ts` | **Extend.** Verify the report-timesheet request always includes all five request parameters and never retries with a reduced shape. |
| `src/hooks/__tests__/useTeamAggregateData.test.ts` | **Create.** Cover weighted aggregation, per-report failure isolation, an empty roster, current-Monday query-key rollover, and query/error state mapping. |

No change is needed in `src/types/api.ts`, `src/lib/ai.ts`,
`src/hooks/useAIData.ts`, `src/api/timesheet.ts`, `src/hooks/useTimesheet.ts`,
or `src/hooks/useOverviewData.ts`.

### Public Interfaces

```ts
export interface TeamMemberBreakdown {
  member: TeamMember;
  hours: number;
  aiPct: number;
  brainliftHours: number;
  fetchFailed: boolean;
}

export interface TeamAggregateData {
  weekHours: number;
  weekAiPct: number;
  weekBrainliftHours: number;
  reportCount: number;
  breakdown: TeamMemberBreakdown[];
}

export interface UseTeamAggregateDataResult {
  data: TeamAggregateData | null;
  isLoading: boolean;
  error: string | null;
}

export function useTeamAggregateData(): UseTeamAggregateDataResult;
```

```ts
export async function fetchReportTimesheet(
  member: TeamMember,
  weekStartDate: string,
  token: string,
  useQA: boolean,
): Promise<TimesheetResponse | null>;
```

### Data Flow

1. `useTeamAggregateData` reads the authenticated Crossover configuration and
   the direct-report roster supplied by `useTeamRoster`. It derives `today` and
   the current UTC-safe Monday using the existing hours/date helpers.

2. The React Query is enabled after configuration and roster loading have
   completed. An empty, successfully loaded roster still enables the query so
   it can return zero-valued data instead of remaining in an undefined state.
   Its key is:

   ```ts
   ['teamAggregate', config?.primaryTeamId, weekStartDate]
   ```

   Configure `staleTime: 24 * 60 * 60 * 1000` and use normal React Query
   mount/focus behavior. Do not add a midnight timer or AppState listener.

3. The query function loads credentials and obtains one manager auth token
   before starting report work. Missing credentials or token acquisition
   failure is a query-level error because no report can be queried.

4. Map the roster to `Promise.all`, with each mapped operation wrapped in its
   own `try/catch`. For each member:

   - Fetch all current-week work-diary days from Monday through today using the
     member's assignment ID and the existing work-diary API. The daily requests
     may run in parallel, following `useAIData`.
   - Convert each day's slots with `countDiaryTags` and retain a
     `Record<string, TagData>` (keyed by ISO date string) for that member.
   - Call `fetchReportTimesheet` once for the same Monday.
   - Run `aggregateAICache(memberCache, today)` for the member's AI and
     BrainLift breakdown. Set `aiPct` to the rounded midpoint of
     `aiPctLow`/`aiPctHigh`, matching `useOverviewData`.
   - Read paid weekly hours from the returned timesheet stats using the same
     response semantics as the personal hours path. A `null` timesheet is an
     empty successful response and contributes zero hours; a thrown request
     error marks the report failed.
   - Return both the public breakdown row and the raw daily `TagData` needed by
     the team reducer.

5. If either data source throws for a member, log the error with member context
   through the project's existing logger and return a breakdown row with
   `fetchFailed: true` and zero numeric values. Do not rethrow from the
   per-member operation. This prevents partial metrics from one source being
   presented as a complete member result.

6. Reduce only successful member results:

   - Sum paid hours into `weekHours`.
   - Sum each day's raw `TagData.total`, `aiUsage`, `secondBrain`, and `noTags`
     into a team date cache.
   - Run `aggregateAICache(teamCache, today)` once after the reduction.
   - Set `weekAiPct` to the rounded midpoint of the resulting low/high range.
   - Set `weekBrainliftHours` from the resulting aggregate.
   - Increment `reportCount` once per successful member.

   Combining raw slot counts before the final percentage produces the required
   slot-weighted result. Averaging members' percentages would incorrectly give
   low- and high-activity members equal influence.

7. Preserve roster order in `breakdown`, including failed rows. Map React Query
   state to `{ data: query.data ?? null, isLoading, error }`, converting an
   outer query error to its message. Roster/config loading contributes to
   `isLoading`; roster or prerequisite failures surface as hook-level errors.

The resulting dependency flow is:

```text
config + credentials + direct-report roster + current Monday
                              |
                              v
                  Promise.all(per report)
                     /                 \
       Mon-today work diaries      weekly timesheet
                  |                     |
        daily raw TagData           paid hours
                     \                 /
                      member result
                            |
             failed row or successful reducer input
                            |
        sum raw slots + hours across successful reports
                            |
                aggregateAICache(team cache)
                            |
          TeamAggregateData + ordered breakdown
```

### Edge Cases

- **Empty roster:** Return
  `{ weekHours: 0, weekAiPct: 0, weekBrainliftHours: 0, reportCount: 0, breakdown: [] }`.
  This is valid loaded data, not `null` and not an error.
- **One report fails:** Include that member in `breakdown` with
  `fetchFailed: true`; exclude all of that member's partial values from team
  totals and `reportCount`. Other reports remain usable.
- **Every report fails:** Return zero-valued aggregate data and one failed
  breakdown row per report. The failure isolation contract means this is not a
  hook-level query error after prerequisites and token acquisition succeeded.
- **Missing credentials/token failure:** Surface a hook-level error and no
  aggregate data because fan-out cannot begin.
- **No timesheet record:** Treat `null` as zero paid hours rather than a
  transport failure. A thrown timesheet request is a failed report.
- **No diary slots or only untagged slots:** Existing `aggregateAICache`
  semantics produce `0%` AI and zero BrainLift hours; do not manufacture a
  `0%–2%` range.
- **Partial daily diary failure:** Fail the entire member row and exclude it
  from all team totals. Mixing incomplete diary data with complete hours would
  make the aggregate internally inconsistent.
- **AI weighting:** Sum `TagData` counts first. Do not average
  `TeamMemberBreakdown.aiPct` values.
- **Overlapping AI tags:** Rely on `countDiaryTags`; a slot containing both
  `ai_usage` and `second_brain` counts once toward AI usage and once toward
  BrainLift.
- **Week rollover:** Monday is part of the query key, so the next week receives
  a distinct cache entry without explicit invalidation.
- **Timezone boundary:** Use the same UTC-safe week-start helper as timesheets
  and pass one consistent `today` value through all cache aggregation in a
  query run; do not mix local and UTC-derived Mondays.
- **Roster changes inside the 24-hour freshness window:** The specified query
  key is team-and-week scoped, so standard React Query freshness rules apply.
  This hook does not add roster IDs to the key or force custom invalidation.
- **Historical charts:** Return only the current-week snapshot. Do not pad or
  synthesize prior weeks, read personal weekly history, or fan out across
  historical dates.
- **Org traversal:** Process only members returned directly by `useTeamRoster`;
  never recurse into reports' own teams.

### Verification

- Use two members with materially different slot counts and AI rates to prove
  `weekAiPct` matches the raw-slot weighted calculation and differs from the
  naive average of member percentages.
- Mock one diary request throwing and assert the other member still contributes
  to all totals while the failed member remains in `breakdown`.
- Assert every `fetchReportTimesheet` call contains `date`, `period`,
  `userId`, `managerId`, and `teamId`, with a single endpoint attempt.
- Assert an empty roster resolves to the zero-valued aggregate.
- Advance the mocked date across a Monday boundary and assert the query key
  changes.
