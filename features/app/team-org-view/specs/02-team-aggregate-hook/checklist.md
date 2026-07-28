# Implementation Checklist

Spec: `02-team-aggregate-hook`
Feature: `team-org-view`

---

## Phase 1.0: Test Foundation

### FR1: Fetch a direct report's current-week timesheet
- [ ] Write test: `fetchReportTimesheet` sends `userId`, `managerId`, `teamId`, `date`, and `period: 'WEEK'` together in a single request
- [ ] Write test: uses the authenticated manager's token and the environment selected by `useQA`
- [ ] Write test: returns the report's `TimesheetResponse` when present, `null` when the API returns no timesheet
- [ ] Write test: never attempts a two-parameter or one-parameter fallback request (regression guard against reusing `fetchTimesheet`'s strategy shape)

### FR2: Fetch current-week data for every direct report
- [ ] Write test: for each roster member, one work-diary request per day (Monday through today) plus exactly one timesheet request are initiated
- [ ] Write test: fetches across reports (and daily work-diary fetches within a report) run concurrently, not serially
- [ ] Write test: no requests are made for historical weeks
- [ ] Write test: no requests are made for anyone outside the direct-report roster

### FR3: Produce team aggregates and a per-person breakdown
- [ ] Write test: two members with materially different slot counts/AI rates produce a slot-weighted `weekAiPct` that differs visibly from a naive average of member percentages
- [ ] Write test: `weekHours` equals the sum of paid hours across successfully fetched reports
- [ ] Write test: `weekBrainliftHours` equals the sum of BrainLift hours across successfully fetched reports
- [ ] Write test: `reportCount` equals the number of reports where both fetches succeeded
- [ ] Write test: `breakdown` contains one row per roster member with `member`, `hours`, `aiPct`, `brainliftHours`, `fetchFailed: false` for successes

### FR4: Isolate per-report failures and support an empty roster
- [ ] Write test: one report's work-diary fetch throwing excludes it from `weekHours`/`weekAiPct`/`weekBrainliftHours` and `reportCount`, but keeps it in `breakdown` with `fetchFailed: true`
- [ ] Write test: one report's timesheet fetch throwing produces the same isolation behavior
- [ ] Write test: other reports' successful data remains in aggregates; hook-level `data` is not null and `isLoading` resolves normally
- [ ] Write test: each per-report failure is logged via the application's error-logging convention
- [ ] Write test: an empty roster (`useTeamRoster` returns `[]`) resolves to `{ weekHours: 0, weekAiPct: 0, weekBrainliftHours: 0, reportCount: 0, breakdown: [] }` without an error

### FR5: Expose stable hook state and weekly cache behavior
- [ ] Write test: hook returns `data: TeamAggregateData | null`, `isLoading: boolean`, `error: string | null`
- [ ] Write test: React Query key is `['teamAggregate', config?.primaryTeamId, weekStartDate]`
- [ ] Write test: advancing the mocked date across a Monday boundary produces a distinct query key/cache entry
- [ ] Write test: `staleTime` is configured to 24 hours (no custom timer/AppState listener present)
- [ ] Write test: missing credentials/token acquisition failure surfaces as a hook-level error with no aggregate data

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage
- [ ] Assertions are specific (not just "exists" or "doesn't throw")
- [ ] Mocks return realistic data matching interface contracts (per spec-research.md decisions, especially the slot-weighted AI% case)
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Fetch a direct report's current-week timesheet
- [ ] Add `fetchReportTimesheet(member, weekStartDate, token, useQA)` to `src/api/team.ts`
- [ ] Send a single request to `/api/timetracking/timesheets` with `date`, `period: 'WEEK'`, `userId`, `managerId`, `teamId` — no fallback strategies
- [ ] Return the first array item or `null`; reuse existing `TimesheetResponse` type
- [ ] Add JSDoc per module convention (`hourglassws/CLAUDE.md`)

### FR2: Fetch current-week data for every direct report
- [ ] Create `src/hooks/useTeamAggregateData.ts`
- [ ] Consume `useTeamRoster` for the direct-report list
- [ ] Fan out per-report work-diary (Monday-today, one request per day) and one `fetchReportTimesheet` call via `Promise.all`, wrapping each report's operation in its own try/catch

### FR3: Produce team aggregates and a per-person breakdown
- [ ] Convert each day's slots via `countDiaryTags`; retain per-member `Record<string, TagData>`
- [ ] Run `aggregateAICache` per member for individual `aiPct`/`brainliftHours` (rounded midpoint of low/high)
- [ ] Sum raw `TagData` counts across successful members into a team-level cache before computing `weekAiPct` via `aggregateAICache`
- [ ] Sum `hours` and `brainliftHours` across successful members
- [ ] Build ordered `breakdown` array preserving roster order

### FR4: Isolate per-report failures and support an empty roster
- [ ] Catch per-member fetch errors; log via existing logger convention with member context
- [ ] Set `fetchFailed: true` and zero numeric values for failed rows; exclude from aggregate sums and `reportCount`
- [ ] Handle empty roster by resolving to the zero-valued aggregate rather than an error/null state

### FR5: Expose stable hook state and weekly cache behavior
- [ ] Implement `TeamMemberBreakdown`, `TeamAggregateData`, `UseTeamAggregateDataResult` interfaces
- [ ] Configure React Query with key `['teamAggregate', config?.primaryTeamId, weekStartDate]` and `staleTime: 24 * 60 * 60 * 1000`
- [ ] Map query state to `{ data: query.data ?? null, isLoading, error }`, converting query errors to their message
- [ ] Use existing UTC-safe week-start helper for `weekStartDate` (matching `useTimesheet` convention)

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code
- [ ] Interface contracts match implementation
- [ ] No scope creep or shortfall (no UI rendering, no roster-fetch logic duplicated from Spec 01, no historical backfill)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes
- [ ] Commit fixes: `fix(02-team-aggregate-hook): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(02-team-aggregate-hook): strengthen test assertions`

### Final Verification
- [ ] All tests passing (`src/hooks/__tests__/useTeamAggregateData.test.ts`, `src/__tests__/api/team.test.ts`)
- [ ] TypeScript check passes with no new errors
- [ ] No regressions in existing `useAIData`/`useTimesheet`/`useOverviewData` tests (shared math/pattern reuse)
- [ ] Code follows existing hook/API layering conventions (`docs/ARCHITECTURE.md` §6.6)

---

## Session Notes

<!-- Add notes as you work -->

**2026-07-28**: Spec + checklist generated via `spec` skill (Codex-drafted sections, coherence check found and fixed two inconsistencies: work-diary fetch cardinality wording and an undefined `date` type notation).
