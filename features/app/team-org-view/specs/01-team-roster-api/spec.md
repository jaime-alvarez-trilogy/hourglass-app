# Team Roster API

**Status:** Draft
**Created:** 2026-07-28
**Last Updated:** 2026-07-28
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This spec adds the typed API foundation for loading a manager's direct reports in the Team-tier view. It introduces team and roster response types in `src/types/api.ts` and a new `src/api/team.ts` module with two focused functions: `fetchMyTeams()` retrieves the active teams owned by the signed-in manager, and `fetchTeamRoster(teamId)` retrieves and maps the active assignments for one of those teams into the app-facing `TeamMember` shape.

The implementation follows the existing API-layer convention of one request per function. `fetchMyTeams()` calls `GET /api/v2/teams` with `status=ACTIVE` and handles its bare-array response. `fetchTeamRoster()` calls `GET /api/v2/teams/assignments` for a single team, also requesting active records, then defensively filters inactive rows and extracts the candidate, manager, team, profile-photo, and manager-role fields needed by downstream Team-tier features. Existing authentication and network errors are allowed to propagate unchanged.

No new manager identifier is added to `CrossoverConfig`. The teams endpoint is already scoped server-side to teams owned by the calling manager, so roster rows fetched from those team IDs are direct reports by construction. Fetching all owned teams and fanning out roster requests is intentionally left to the hook layer in Spec 02; this spec provides only the reusable, independently testable API calls and mappings.

## Out of Scope

1. **Deferred to Spec 02 — Team aggregate hook: roster fan-out and aggregation.** This spec provides one-call API primitives only: fetching the manager's teams and fetching one active roster. Calling `fetchTeamRoster` for every owned team, combining the results, and exposing them through a hook belong to the hook layer so the API layer retains the repository's one-call/one-result convention. The target spec is verified at `../02-team-aggregate-hook/spec-research.md`.

2. **Deferred to Spec 02 — Team aggregate hook: per-report timesheet and work-diary retrieval.** Cross-user timesheet requests, work-diary requests, per-report failure isolation, and calculation of team hours, AI usage, and BrainLift totals are consumers of the roster rather than responsibilities of the roster API. The target spec is verified at `../02-team-aggregate-hook/spec-research.md`.

3. **Deferred to Spec 03 — Scope toggle UI: Personal/Team/Org controls.** The roster API has no UI surface and does not add or change the Overview scope selector, its disabled Org state, or the visibility of the existing time-window picker. The target spec is verified at `../03-scope-toggle-ui/spec-research.md`.

4. **Deferred to Spec 04 — Team-view content: roster presentation and screen wiring.** Rendering aggregate cards, report rows, profile-photo fallbacks, manager badges, loading and empty states, failed-report treatments, and Personal/Team branch switching belongs to the Overview screen composition work. TestFlight verification is also deferred there because this API-only spec introduces no visible behavior. The target spec is verified at `../04-team-view-content/spec-research.md`.

5. **Descoped (not part of this feature): Org-tier roster traversal.** This feature fetches only teams owned by the calling manager and their direct active reports. It does not recursively discover reports-of-reports or build an organization-wide hierarchy; the Org option is only represented as a disabled UI affordance in the current feature.

6. **Descoped (not part of this feature): multi-week historical team data.** The v1 team view is limited to a current-week snapshot. Backfilling historical data would multiply per-report API traffic by the number of weeks and is not required by the roster contract, even though the mockup includes an aspirational 12-week sparkline.

7. **Descoped (not part of this feature): inactive or departed team members.** Both roster calls request `status=ACTIVE`, and `fetchTeamRoster` defensively removes any non-active rows returned by the service. Historical membership and departed-report reporting are not part of the "current direct reports" use case.

8. **Descoped (not part of this feature): a new manager identity field or config migration.** No `managerAvatarId` or equivalent field is added to `CrossoverConfig`, and no onboarding/backfill migration is introduced. `GET /api/v2/teams` is already scoped server-side to teams owned by the authenticated manager, making client-side manager-ID filtering and a persisted manager identifier unnecessary.

## Functional Requirements

### FR1 — Define team roster API types

The system MUST add the following typed contracts to `src/types/api.ts`, with comments identifying each field's API source:

- `RawTeam`, containing numeric `id` and string `name`.
- `RawTeamAssignment`, containing the assignment's numeric `id`, string `status`, nested candidate data (`id`, `userId`, `printableName`, optional `photoUrl`, and optional `avatarTypes`), nested manager `id`, and nested team `id` and `name`.
- `TeamMember`, containing string `assignmentId`, `candidateId`, `managerId`, and `teamId`; string `teamName` and `name`; optional string `photoUrl`; and boolean `isManager`.

#### Success Criteria

- `RawTeam`, `RawTeamAssignment`, and `TeamMember` are exported from `src/types/api.ts`.
- The raw types represent the confirmed bare team response and nested team-assignment response without introducing a new `CrossoverConfig` field.
- `photoUrl` and `avatarTypes` are optional so assignments without those values remain valid.
- `TeamMember` exposes every identifier required by downstream timesheet and work-diary calls.
- The project type-checks successfully with the new contracts.

### FR2 — Fetch the current manager's active teams

The system MUST provide an exported `fetchMyTeams(token, useQA)` function in `src/api/team.ts`. The function MUST issue one authenticated `GET /api/v2/teams` request with `status=ACTIVE`, use the environment selected by `useQA`, and return the endpoint's bare array response as `RawTeam[]`.

#### Success Criteria

- Calling `fetchMyTeams` sends the request through the project's existing API client and includes `status=ACTIVE`.
- A response such as `[{ "id": 2374, "name": "Team A" }]` is returned as a typed `RawTeam[]` without expecting a Spring page envelope.
- An empty array response resolves to `[]` and is not treated as an error.
- The function does not perform client-side manager filtering because the endpoint is scoped server-side to teams owned by the authenticated manager.
- Authentication and network failures propagate unchanged as the existing `AuthError` or `NetworkError`; the function does not swallow or replace them.
- Unit tests cover a populated bare-array response, an empty response, request parameters, and unchanged error propagation.

### FR3 — Fetch and map one team's active roster

The system MUST provide an exported `fetchTeamRoster(teamId, token, useQA)` function in `src/api/team.ts`. The function MUST issue one authenticated `GET /api/v2/teams/assignments` request for the supplied `teamId` with `status=ACTIVE`, defensively exclude any returned assignment whose status is not exactly `ACTIVE`, and map each remaining `RawTeamAssignment` to a `TeamMember`.

The mapping MUST be:

- `assignmentId` from `assignment.id`, converted to a string.
- `candidateId` from `assignment.candidate.id`, converted to a string.
- `managerId` from `assignment.manager.id`, converted to a string.
- `teamId` from `assignment.team.id`, converted to a string.
- `teamName` from `assignment.team.name`.
- `name` from `assignment.candidate.printableName`.
- `photoUrl` from `assignment.candidate.photoUrl`.
- `isManager` set to whether `assignment.candidate.avatarTypes` contains `MANAGER`.

#### Success Criteria

- Calling `fetchTeamRoster` requests assignments only for the supplied team and includes `status=ACTIVE`.
- Active assignments are mapped exactly according to the specified field mapping, including conversion of numeric identifiers to strings.
- An assignment with a non-`ACTIVE` status is omitted even when the server returns it.
- A missing `candidate.photoUrl` does not throw and produces `photoUrl: undefined`.
- Missing `candidate.avatarTypes`, or an array without `MANAGER`, produces `isManager: false`; an array containing `MANAGER` produces `isManager: true`.
- An empty roster response resolves to `[]`.
- Authentication and network failures propagate unchanged as the existing `AuthError` or `NetworkError`; the function does not swallow or replace them.
- The function performs exactly one team's roster request; multi-team fan-out and aggregation remain outside this API layer.
- Unit tests cover exact nested-field mapping, defensive status filtering, absent optional fields, manager-badge derivation, an empty response, request parameters, and unchanged error propagation.

## Technical Design

### Scope

Add a typed API layer for discovering the current manager's owned teams and fetching the active members of one team. This spec stops at one-request/one-result API functions. The React Query hook that fans roster requests out across all owned teams belongs to Spec 02.

No `CrossoverConfig` field or migration is required. `GET /api/v2/teams` is server-scoped to teams owned by the authenticated manager, so members returned from those teams are direct reports by construction.

### Files to Reference

| File | Reference purpose |
|---|---|
| `src/api/client.ts` | `apiGet<T>` signature, environment selection, auth/network error behavior, query serialization, and unchanged error propagation. |
| `src/api/auth.ts` (`fetchConfigFromAssignments`) | Existing `/api/v2/teams/assignments` caller and defensive parsing of the Spring page envelope with a bare-array fallback. |
| `src/api/approvals.ts` | Style for a small API module: exported async functions, short JSDoc, and thin `apiGet` wrappers. |
| `src/types/api.ts` | Shared API/domain types and the convention of documenting each field's source. |
| `src/__tests__/api/auth-resilience.test.ts` | Jest conventions for API tests and rejected-error assertions. |
| `docs/ARCHITECTURE.md` §6.3 and §6.6 | API module responsibility and layering: `src/api` remains React-free and may depend only on lower/leaf layers. |
| `docs/CROSSOVER_API.md` §15 F6 | Confirms `/api/v2/teams/assignments` returns records in a Spring `content` envelope. |
| `memory/reference_crossover_api.md` ("Team roster + profile photo") | Live-probe evidence for roster fields, ID semantics, and `candidate.photoUrl`. |
| `features/app/team-org-view/specs/01-team-roster-api/spec-research.md` | Source of the endpoint contracts, live-QA findings, and scope decisions for this design. |

### Files to Create/Modify

#### Create `src/api/team.ts`

Export two pure async functions:

```ts
export async function fetchMyTeams(
  token: string,
  useQA: boolean,
): Promise<RawTeam[]>

export async function fetchTeamRoster(
  teamId: string,
  token: string,
  useQA: boolean,
): Promise<TeamMember[]>
```

`fetchMyTeams` calls:

```ts
apiGet<RawTeam[] | null>(
  '/api/v2/teams',
  { status: 'ACTIVE' },
  token,
  useQA,
)
```

It returns the response when it is an array and otherwise returns `[]`. The endpoint is a bare array; it must not share the assignments-envelope parser.

`fetchTeamRoster` calls:

```ts
apiGet<AssignmentsPage | RawTeamAssignment[] | null>(
  '/api/v2/teams/assignments',
  { teamId, status: 'ACTIVE' },
  token,
  useQA,
)
```

Define `AssignmentsPage` as a private structural type in `team.ts` because the pagination envelope is an endpoint transport detail, not an app-facing contract. Read rows from `response.content` when it is an array and accept a bare response array as a defensive shape-drift fallback, matching `auth.ts`.

Map only rows whose `status === 'ACTIVE'`:

```ts
{
  assignmentId: String(row.id),
  candidateId: String(row.candidate.id),
  managerId: String(row.manager.id),
  teamId: String(row.team.id),
  teamName: row.team.name,
  name: row.candidate.printableName,
  photoUrl: row.candidate.photoUrl,
  isManager: row.candidate.avatarTypes?.includes('MANAGER') ?? false,
}
```

Do not catch errors in either function. `apiGet` remains responsible for producing `AuthError`, `NetworkError`, and other API errors, which must propagate unchanged to the future hook layer.

#### Modify `src/types/api.ts`

Append:

- `RawTeamAssignment`: exact nested assignment transport shape used by the roster endpoint.
- `RawTeam`: `{ id: number; name: string }` from the owned-teams endpoint.
- `TeamMember`: normalized app-facing roster row with string IDs, display fields, optional photo URL, and derived manager status.

Keep `status` typed as `string` rather than an `ACTIVE`-only literal because the client deliberately filters unexpected inactive values. Keep `photoUrl` and `avatarTypes` optional because both may be absent.

#### Create `src/__tests__/api/team.test.ts`

Mock `../../api/client` and test the module without network access:

1. `fetchMyTeams` sends the exact path, `{ status: 'ACTIVE' }`, token, and QA flag, and returns a bare team array.
2. `fetchMyTeams` returns `[]` for an empty array and for a nullish/malformed response.
3. `fetchTeamRoster` sends the exact assignments path and `{ teamId, status: 'ACTIVE' }`.
4. It reads assignments from the Spring `content` envelope and maps every ID and nested display field to `TeamMember`.
5. It also accepts a bare assignment array as the defensive fallback.
6. It filters non-`ACTIVE` rows even though the server query requests active rows.
7. It preserves `photoUrl: undefined` and derives `isManager` as `false` when `avatarTypes` is absent, and as `true` when it contains `MANAGER`.
8. It returns `[]` for an empty envelope.
9. It rejects with the exact `AuthError` or `NetworkError` instance returned by the mocked `apiGet`, proving the API layer does not swallow or replace it.

No barrel export or config/store change is needed; current API modules are imported by direct file path.

### Data Flow

```text
Authenticated manager token + useQA
             |
             v
fetchMyTeams(token, useQA)
  GET /api/v2/teams?status=ACTIVE
             |
             v
       RawTeam[] (bare array)
             |
             |  Spec 02 hook iterates owned team IDs
             v
fetchTeamRoster(String(team.id), token, useQA)  [once per team]
  GET /api/v2/teams/assignments?teamId=...&status=ACTIVE
             |
             v
Spring page.content (bare-array fallback)
             |
             v
defensive status === "ACTIVE" filter
             |
             v
RawTeamAssignment -> TeamMember normalization
             |
             v
TeamMember[] for that one team
```

The API layer does not flatten teams, deduplicate people, cache requests, or coordinate parallelism. Spec 02 owns `Promise.all` fan-out, flattening, React Query state, and any cross-team policy.

ID mapping is intentionally explicit:

| App field | API source | Downstream use |
|---|---|---|
| `assignmentId` | `assignment.id` | Work-diary `assignmentId` |
| `candidateId` | `assignment.candidate.id` | Timesheet `userId` |
| `managerId` | `assignment.manager.id` | Timesheet `managerId` |
| `teamId` | `assignment.team.id` | Timesheet `teamId` |

All API numeric IDs are converted to strings at the transport boundary so downstream code receives the same ID representation used elsewhere in the app.

### Edge Cases

- **Manager owns no active teams:** `fetchMyTeams` returns `[]`; this is a valid empty state, not an exception.
- **Owned team has no active members:** an empty `content` array maps to `[]`.
- **Assignments response envelope differs:** prefer `content`; accept a bare array as a defensive fallback; return `[]` for nullish or unrecognized top-level shapes.
- **Teams response shape differs:** do not treat `/api/v2/teams` as a Spring page. A non-array response becomes `[]` rather than feeding an invalid object to the caller.
- **Server ignores `status=ACTIVE`:** filter rows again client-side with exact, case-sensitive equality to `ACTIVE`.
- **No profile photo:** preserve `photoUrl: undefined`; the later UI supplies initials/fallback presentation.
- **Report is also a manager:** do not filter the row. Set `isManager: true` so Spec 04 can render its badge; this feature is direct-report, not recursive-org, traversal.
- **Missing `avatarTypes`:** derive `isManager: false`.
- **Duplicate member across owned teams:** preserve both assignment rows at this layer. Deduplication, if product requirements later call for it, needs an explicit cross-team identity and ownership policy in the aggregation hook.
- **Malformed nested assignment fields:** the live-confirmed required fields are represented as required TypeScript properties. This spec does not invent partial fallback identities or silently coerce missing nested objects; such a runtime contract violation should be handled only if observed and documented.
- **Authentication/network/API failure:** propagate the original error. Empty data and failed requests must remain distinguishable to callers.
- **Pure-manager account has no candidate avatar/config IDs:** roster discovery still works because it relies on server-scoped team ownership rather than a new `CrossoverConfig.managerAvatarId`.
- **Pagination:** current live results and endpoint evidence use the returned `content` page with no client pagination requirement in this spec. If an owned team can exceed the server's page size, pagination must be researched and added as a separate contract rather than guessed here.

### Verification

Run the focused Jest test:

```sh
npx jest src/__tests__/api/team.test.ts --runInBand
```

Then run the project's TypeScript check to validate the new shared interfaces and imports. No live-QA probe is required unless the endpoint response shape is suspected to have changed; the shapes in this design were already confirmed during research.
