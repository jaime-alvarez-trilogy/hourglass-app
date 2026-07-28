# Implementation Checklist

Spec: `02-team-aggregate-hook`
Feature: `team-org-view`

---

## Phase 1.0: Test Foundation

### FR1: Fetch a direct report's current-week timesheet
- [x] Write test: `fetchReportTimesheet` sends `userId`, `managerId`, `teamId`, `date`, and `period: 'WEEK'` together in a single request
- [x] Write test: uses the authenticated manager's token and the environment selected by `useQA`
- [x] Write test: returns the report's `TimesheetResponse` when present, `null` when the API returns no timesheet
- [x] Write test: never attempts a two-parameter or one-parameter fallback request (regression guard against reusing `fetchTimesheet`'s strategy shape)

### FR2: Fetch current-week data for every direct report
- [x] Write test: for each roster member, one work-diary request per day (Monday through today) plus exactly one timesheet request are initiated
- [x] Write test: fetches across reports (and daily work-diary fetches within a report) run concurrently, not serially
- [x] Write test: no requests are made for historical weeks
- [x] Write test: no requests are made for anyone outside the direct-report roster

### FR3: Produce team aggregates and a per-person breakdown
- [x] Write test: two members with materially different slot counts/AI rates produce a slot-weighted `weekAiPct` that differs visibly from a naive average of member percentages
- [x] Write test: `weekHours` equals the sum of paid hours across successfully fetched reports
- [x] Write test: `weekBrainliftHours` equals the sum of BrainLift hours across successfully fetched reports
- [x] Write test: `reportCount` equals the number of reports where both fetches succeeded
- [x] Write test: `breakdown` contains one row per roster member with `member`, `hours`, `aiPct`, `brainliftHours`, `fetchFailed: false` for successes

### FR4: Isolate per-report failures and support an empty roster
- [x] Write test: one report's work-diary fetch throwing excludes it from `weekHours`/`weekAiPct`/`weekBrainliftHours` and `reportCount`, but keeps it in `breakdown` with `fetchFailed: true`
- [x] Write test: one report's timesheet fetch throwing produces the same isolation behavior
- [x] Write test: other reports' successful data remains in aggregates; hook-level `data` is not null and `isLoading` resolves normally
- [x] Write test: each per-report failure is logged via the application's error-logging convention
- [x] Write test: an empty roster (`useTeamRoster` returns `[]`) resolves to `{ weekHours: 0, weekAiPct: 0, weekBrainliftHours: 0, reportCount: 0, breakdown: [] }` without an error

### FR5: Expose stable hook state and weekly cache behavior
- [x] Write test: hook returns `data: TeamAggregateData | null`, `isLoading: boolean`, `error: string | null`
- [x] Write test: React Query key is `['teamAggregate', config?.primaryTeamId, weekStartDate]`
- [x] Write test: advancing the mocked date across a Monday boundary produces a distinct query key/cache entry
- [x] Write test: `staleTime` is configured to 24 hours (no custom timer/AppState listener present)
- [x] Write test: missing credentials/token acquisition failure surfaces as a hook-level error with no aggregate data

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run `red-phase-test-validator` agent (skipped for time; ran manual mutation-testing spot check instead — see Session Notes)
- [x] All FR success criteria have test coverage
- [x] Assertions are specific (not just "exists" or "doesn't throw")
- [x] Mocks return realistic data matching interface contracts (per spec-research.md decisions, especially the slot-weighted AI% case)
- [x] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Fetch a direct report's current-week timesheet
- [x] Add `fetchReportTimesheet(member, weekStartDate, token, useQA)` to `src/api/team.ts`
- [x] Send a single request to `/api/timetracking/timesheets` with `date`, `period: 'WEEK'`, `userId`, `managerId`, `teamId` — no fallback strategies
- [x] Return the first array item or `null`; reuse existing `TimesheetResponse` type
- [x] Add JSDoc per module convention (`hourglassws/CLAUDE.md`)

### FR2: Fetch current-week data for every direct report
- [x] Create `src/hooks/useTeamAggregateData.ts`
- [x] Consume `useTeamRoster` for the direct-report list (built `src/hooks/useTeamRoster.ts` as a prerequisite — see Session Notes)
- [x] Fan out per-report work-diary (Monday-today, one request per day) and one `fetchReportTimesheet` call via `Promise.all`, wrapping each report's operation in its own try/catch

### FR3: Produce team aggregates and a per-person breakdown
- [x] Convert each day's slots via `countDiaryTags`; retain per-member `Record<string, TagData>`
- [x] Run `aggregateAICache` per member for individual `aiPct`/`brainliftHours` (rounded midpoint of low/high)
- [x] Sum raw `TagData` counts across successful members into a team-level cache before computing `weekAiPct` via `aggregateAICache`
- [x] Sum `hours` and `brainliftHours` across successful members
- [x] Build ordered `breakdown` array preserving roster order

### FR4: Isolate per-report failures and support an empty roster
- [x] Catch per-member fetch errors; log via existing logger convention with member context
- [x] Set `fetchFailed: true` and zero numeric values for failed rows; exclude from aggregate sums and `reportCount`
- [x] Handle empty roster by resolving to the zero-valued aggregate rather than an error/null state

### FR5: Expose stable hook state and weekly cache behavior
- [x] Implement `TeamMemberBreakdown`, `TeamAggregateData`, `UseTeamAggregateDataResult` interfaces
- [x] Configure React Query with key `['teamAggregate', config?.primaryTeamId, weekStartDate]` and `staleTime: 24 * 60 * 60 * 1000`
- [x] Map query state to `{ data: query.data ?? null, isLoading, error }`, converting query errors to their message
- [x] Use existing UTC-safe week-start helper for `weekStartDate` (matching `useTimesheet` convention)

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [x] Run `spec-implementation-alignment` agent
- [x] All FR success criteria verified in code
- [x] Interface contracts match implementation
- [x] No scope creep or shortfall (no UI rendering, no roster-fetch logic duplicated from Spec 01, no historical backfill) — see Session Notes for the one flagged ambiguity (`useTeamRoster.ts` ownership) and its resolution

### Step 1: Comprehensive PR Review
- [x] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents) — skill is GitHub-PR-oriented (`gh pr view`) and doesn't apply to direct-to-`main` commits with no open PR; did the manual equivalent instead (spec-implementation-alignment + test-optimiser + manual mutation-testing spot check — see Session Notes)

### Step 2: Address Feedback
- [x] Fix HIGH severity issues (critical) — none found
- [x] Fix MEDIUM severity issues (or document why deferred) — 2 found (untested hook-level state merge; unverified FR5 rollover claim), both fixed — see Session Notes
- [x] Re-run tests after fixes
- [x] Commit fixes: `fix(02-team-aggregate-hook): {description}`

### Step 3: Test Quality Optimization
- [x] Run `test-optimiser` agent on modified tests
- [x] Apply suggested improvements that strengthen confidence
- [x] Re-run tests to confirm passing
- [x] Commit if changes made: `fix(02-team-aggregate-hook): strengthen test assertions` (`c7d06a5`)

### Final Verification
- [x] All tests passing (`src/hooks/__tests__/useTeamAggregateData.test.ts`, `src/hooks/__tests__/useTeamRoster.test.ts`, `src/__tests__/api/team.test.ts` — 85/85)
- [x] TypeScript check passes with no new errors
- [x] No regressions in existing `useAIData`/`useTimesheet`/`useOverviewData` tests (shared math/pattern reuse)
- [x] Code follows existing hook/API layering conventions (`docs/ARCHITECTURE.md` §6.6)

---

## Session Notes

<!-- Add notes as you work -->

**2026-07-28**: Spec + checklist generated via `spec` skill (Codex-drafted sections, coherence check found and fixed two inconsistencies: work-diary fetch cardinality wording and an undefined `date` type notation).

**2026-07-28 (implementation)**: TDD per checklist above. Red phase: 30 tests written across FR1 (`fetchReportTimesheet`), FR2-FR5 (`useTeamAggregateData`), all confirmed failing before implementation; skipped `red-phase-test-validator` for time and instead ran a manual mutation-testing spot check post-implementation (commented out the failure-isolation `continue` guard — exactly the 6 expected tests failed; restored and re-confirmed green). Implementation: `fetchReportTimesheet` in `src/api/team.ts` (single-request contract, no fallback strategies, matches spec exactly); `useTeamAggregateData.ts` with slot-weighted aggregation (raw `TagData` summed across successful reports before `aggregateAICache`, never averaging per-member percentages) and per-report `try/catch` isolation. Discovered spec 01 explicitly deferred roster fan-out to the hook layer (spec 01's spec.md: "roster fan-out ... belongs to the hook layer"), so built `src/hooks/useTeamRoster.ts` here as a prerequisite dependency, with its own static-analysis + queryFn test suite (`useTeamRoster.test.ts`) at the same rigor as spec-owned files; reconciled this in `FEATURE.md`'s "Intended final state" §2, which had attributed it to spec 01.

Review (Phase 1.2): `spec-implementation-alignment` found 2 MEDIUM gaps — (1) the hook's own `isLoading`/`error` merge logic was only exercised indirectly through the queryFn tests, never directly; fixed by extracting that merge into an exported pure function `mapTeamAggregateState(roster, query)` and adding 5 direct tests (loading precedence, resolved passthrough, roster-error-only, query-error-only, roster-error-wins). (2) The FR5 "Monday-boundary produces a distinct query key" checklist item was checked off without a test that actually exercises `getWeekStartDate(true)`'s rollover; fixed by adding 2 tests using real (unmocked) `getWeekStartDate` + `jest.useFakeTimers()`/`setSystemTime()` crossing a Friday→Monday boundary. `test-optimiser` found 3 MEDIUM issues on first pass (loose range assertion that could pass with a wrong slot-weighted formula; missing test for untagged slots being excluded from the AI% denominator; missing assertion that `fetchReportTimesheet` receives the correct Monday anchor date on a non-Monday "today") plus a few LOW items (NaN-passing type checks, thin single-failure logging test, one misleadingly-named test) — all fixed directly in `useTeamAggregateData.test.ts`. Final: 92/92 tests passing across the three related suites (`useTeamAggregateData.test.ts`, `useTeamRoster.test.ts`, `src/__tests__/api/team.test.ts`); `tsc --noEmit` has zero new errors (only a pre-existing, unrelated `@types/node` error, confirmed identical before/after via diff). `pr-review-toolkit:review-pr` skill was not run — it is scoped to open GitHub PRs (`gh pr view`) and this work committed directly to `main`; the two review agents above plus a manual mutation-testing check served as the equivalent. Confirmed throughout: `src/components/OverviewStickyBar.tsx` and its test file were never touched by this work (that's spec 03's concurrent scope).
