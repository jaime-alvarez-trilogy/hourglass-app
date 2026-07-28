# Team/Org View

**Status:** Research complete
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-07-28

Add a Personal/Team scope toggle to the Overview tab for managers. "Team" shows
aggregate hours, AI%, and BrainLift trends across a manager's direct reports, plus
a per-person breakdown, reusing exactly the endpoints already proven to work for
the manager's own data. An "Org" (skip-level reporting subtree) option is included
in the UI but stays disabled behind a feature flag until real-world roster data
confirms skip-level access — see "Why Org is flagged, not built" below.

## Why this feature exists

Managers currently have no way to see how their team is doing in aggregate — only
individual pending-approval items (`useApprovalItems`) and their own personal
Overview metrics. A manager who wants to know "is my team's AI adoption trending
up?" or "who needs help with BrainLift compliance?" has no in-app answer.

Live QA probing this session confirmed the data is reachable with **zero new
Crossover grant**:
- Work-diary access for a direct report's `assignmentId` → `200` (confirmed
  2026-07-27, see `memory/reference_crossover_api.md`).
- Timesheet access for a direct report's `userId`/`managerId`/`teamId` → `200`
  (confirmed 2026-07-28, same memory file) — the existing "strategy 1 full" shape
  in `fetchTimesheet()` works verbatim when a report's IDs are substituted for the
  manager's own.
- Roster fetch (`GET /api/v2/teams/assignments?teamId=...`) already returns full
  `candidate`/`manager`/`team` objects per row — everything needed to build a
  `TeamMember` list and filter it down to direct reports client-side by comparing
  `row.manager.id` to the manager's own `MANAGER`-type avatar id.

The barrier was missing app code (no roster-fetch function, no aggregate hook),
not an API restriction.

### Why Org is flagged, not built

"Org" = a manager's full reporting subtree (direct reports, plus the reports of
any of those direct reports who are themselves managers — skip-level/recursive),
not peer/other teams. Live probing found a real subordinate manager in the QA
roster, but their own team happened to have zero members, and
`GET /api/v2/teams/assignments?teamId=X` returns an **identical empty-page shape**
for "team has zero members" and "team doesn't exist / no access" (confirmed via a
bogus-teamId control returning the same response). This makes skip-level access
unverifiable from current QA data — not proven broken, just not provable one way
or the other. Decision (user-confirmed): ship Team tier now; add the Org pill to
the UI, disabled/hidden behind a flag, until a populated subordinate-manager team
or direct Crossover confirmation resolves the ambiguity.

## Intended final state

1. **New `fetchMyTeams()` + `fetchTeamRoster()` API functions** (`src/api/team.ts`).
   `fetchMyTeams()` wraps `GET /api/v2/teams` — this call is scoped server-side to
   teams *owned by the calling manager*, confirmed live this session (the QA
   manager account got back exactly the team ids it owns, `[2374, 5000, 5001,
   5004, 5005, 5006]`). `fetchTeamRoster()` wraps
   `GET /api/v2/teams/assignments?teamId={teamId}&status=ACTIVE` per team id and
   returns a typed `TeamMember[]` (id, name, userId/candidateId, assignmentId,
   managerId, photoUrl). New `RawTeamAssignment`/`RawTeam` types added to
   `src/types/api.ts` tracing the shapes confirmed live this session.

2. **New `useTeamRoster()` hook** (`src/hooks/useTeamRoster.ts`) — React Query
   wrapper that calls `fetchMyTeams()` then fans out `fetchTeamRoster()` across
   every returned team id and flattens the result. No new `CrossoverConfig` field
   needed: since `/api/v2/teams` already scopes to teams the caller owns, every
   row it returns is by construction a direct report — no manager-avatar-id
   comparison required. (Earlier research considered adding a
   `managerAvatarId` field to `CrossoverConfig` to filter roster rows by
   `row.manager.id`; that's unnecessary once the roster call itself already
   scopes by ownership. This also sidesteps a real gap: `useRoleRefresh`
   — `src/hooks/useRoleRefresh.ts:30-66` — only backfills a hand-picked field
   subset on existing configs and would NOT have backfilled a new field for
   already-onboarded users.) **Built during spec 02's implementation, not
   spec 01's** — spec 01's spec.md explicitly deferred "roster fan-out ... and
   exposing them through a hook" to the hook layer, and spec 01's own file list
   never created it; spec 02 needed it as a direct dependency of
   `useTeamAggregateData()` before that hook could be written, so it was added
   there instead, with the same test rigor as spec-owned code (see
   `src/hooks/__tests__/useTeamRoster.test.ts`).

3. **New `useTeamAggregateData()` hook** (`src/hooks/useTeamAggregateData.ts`) —
   client-side fan-out: takes the roster from `useTeamRoster()`, fires one
   `fetchWorkDiary` + one `fetchTimesheet`-shaped call per report in parallel
   (`Promise.all`), aggregates into team-level weekly hours/AI%/BrainLift trend
   arrays plus a per-person breakdown list. `staleTime: 24h` (standard React Query
   cadence, per user decision — not a custom midnight-boundary scheduler).

4. **Extended `OverviewStickyBar`** gains a `scope`/`onScopeChange` prop rendering
   a Personal/Team/Org 3-way pill (Org disabled, shown greyed with a "coming soon"
   affordance) — reuses the existing persistent floating-pill pattern already in
   `app/(tabs)/overview.tsx` rather than introducing a second floating element.

5. **Team-view content** — when scope is "Team", `overview.tsx` renders team
   aggregate `ChartSection`s (reusing the existing component) plus a by-person
   breakdown list, replacing the personal metric cards. Gated by the existing
   `isManager` pattern (`config?.isManager === true || config?.devManagerView ===
   true`), extracted into a shared `useIsManager()` hook since it's currently
   copy-pasted verbatim in `overview.tsx`, `approvals.tsx`, and `index.tsx`.

## Out of scope

| Item | Why excluded |
|---|---|
| Org tier (skip-level roster) | Unverifiable from QA data — flagged off until real signal. See "Why Org is flagged" above. |
| Server-side aggregation | User decision: client-side fan-out via React Query, not a new backend endpoint. |
| Extracting `useIsManager()` as a standalone refactor PR | Rolled into spec 04 as a byproduct of wiring the manager gate for team-view content, not a separate initiative. |
| Manager writing/approving on behalf of reports from this view | Approvals already has its own flow (`app/(tabs)/approvals.tsx`); this feature is read-only aggregate visibility. |
| Push notifications for team-level thresholds (e.g. "3 reports below BrainLift target") | Notification-worthy signal, but a separate feature — out of scope for the initial visibility-only view. |

## Decomposition

4 specs. 01 (roster API) blocks 02 (aggregate hook needs the roster). 03 (toggle
UI) and 01 can run in parallel — the toggle itself has no data dependency. 04
(team-view content) is blocked by both 02 (needs the aggregate data) and 03 (needs
the toggle to switch into).

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [team-roster-api](specs/01-team-roster-api/spec-research.md) | `fetchMyTeams()` + `fetchTeamRoster()` + `useTeamRoster()` | 02 | — | S |
| 02 | [team-aggregate-hook](specs/02-team-aggregate-hook/spec-research.md) | `useTeamAggregateData()` client-side fan-out + aggregation | 04 | 01 | M |
| 03 | [scope-toggle-ui](specs/03-scope-toggle-ui/spec-research.md) | `OverviewStickyBar` scope pill (Personal/Team/Org, Org disabled) | 04 | — | S |
| 04 | [team-view-content](specs/04-team-view-content/spec-research.md) | Team-view render branch in `overview.tsx`, `useIsManager()` extraction | — | 02, 03 | M |

## Design constraint

- Reuse the existing `ChartSection` local component (in `overview.tsx`) for team
  aggregate trend cards — same `TrendSparkline`, same hero-value/streak/delta
  visual language already used for personal metrics. No new chart primitive.
- Per-person breakdown rows follow the existing `Card` component conventions
  (`src/components/Card.tsx`, glass surface, `colors.ts` semantic accents: gold =
  earnings, cyan = AI%, violet = BrainLift).
- The scope pill visually matches the existing 4W/12W/24W window picker already
  inside `OverviewStickyBar` — same pill/segmented-control styling, not a new
  control pattern.

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-07-28 | — | Feature created. Research confirmed Team-tier data access (roster, work-diary, timesheet) works with existing auth; Org tier flagged off pending unverifiable skip-level roster access. |
| 2026-07-28 | [01-team-roster-api](specs/01-team-roster-api/spec.md) | Spec + checklist added: `fetchMyTeams()`/`fetchTeamRoster()` API functions, `RawTeam`/`RawTeamAssignment`/`TeamMember` types. |
| 2026-07-28 | [01-team-roster-api](specs/01-team-roster-api/spec.md) | **Complete.** `src/api/team.ts` + `src/types/api.ts` implemented and reviewed. TDD: tests (`68e4230`, `d671001`) → implementation (`7e1bf29`) → review fixes (`8eef9b9`, `fa56ad9`, `9597b68`) → docs (this commit). 35/35 tests passing; `tsc --noEmit` clean. |
| 2026-07-28 | [03-scope-toggle-ui](specs/03-scope-toggle-ui/spec.md) | Spec + checklist added: `OverviewStickyBar` Personal/Team/Org scope row, `CrossoverConfig.orgTierEnabled` flag. |
| 2026-07-28 | [02-team-aggregate-hook](specs/02-team-aggregate-hook/spec.md) | Spec + checklist added: `fetchReportTimesheet()`, `useTeamAggregateData()` slot-weighted aggregation, per-report failure isolation. |
| 2026-07-28 | [04-team-view-content](specs/04-team-view-content/spec.md) | Spec + checklist added: `useIsManager()` extraction, `TeamViewContent`/`TeamMemberRow` render branch in `overview.tsx`, loading/empty/all-failed state precedence. |
| 2026-07-28 | [03-scope-toggle-ui](specs/03-scope-toggle-ui/spec.md) | **Complete.** `src/components/OverviewStickyBar.tsx` + `src/types/config.ts` implemented and reviewed. TDD: tests (`6f3861f`, `5c5e205`) → implementation (`e2b4676`, `4c6650c`) → review fixes (`1b9a907`) → docs (this commit). 46/46 component tests + 6/6 config-type tests passing; `tsc --noEmit` clean (zero new errors). |
| 2026-07-28 | [02-team-aggregate-hook](specs/02-team-aggregate-hook/spec.md) | **Complete.** `src/api/team.ts` (`fetchReportTimesheet`) + `src/hooks/useTeamAggregateData.ts` + prerequisite `src/hooks/useTeamRoster.ts` implemented and reviewed. TDD: tests (`43fff87`, `5f08814`) → implementation (`589b943`, `65f1a20`, `114c13d`) → review fixes (`c7d06a5`, `6a0819f`) → docs (this commit). 92/92 tests passing across the three related suites; `tsc --noEmit` clean (zero new errors). `useTeamRoster.ts` ownership reconciled in "Intended final state" §2 above — built here as a spec 02 dependency, not spec 01's, per spec 01's own deferral. |
