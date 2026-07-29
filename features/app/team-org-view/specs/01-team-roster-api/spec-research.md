# Spec 01 — Team roster API

**Status:** Research complete
**Complexity:** S
**Blocks:** 02
**Blocked By:** — (independent)

## Problem context

The Team-tier view needs a list of the manager's direct reports before it can
fetch any per-report data. No code today calls `GET /api/v2/teams` at all
(`docs/CROSSOVER_API.md:133` explicitly flags it as documented-but-unused), and
the existing `GET /api/v2/teams/assignments` caller (`fetchConfigFromAssignments`
in `src/api/auth.ts:150-177`) is hardcoded to `avatarType: 'CANDIDATE'` — the
caller's own candidate assignment, not a roster of other people.

## Key decisions

**1. No new `CrossoverConfig` field.** Earlier in this feature's research, "how do
we know which roster rows are *my* direct reports" looked like it needed a new
`managerAvatarId` field on `CrossoverConfig`, because a pure-manager QA account
has no CANDIDATE avatar and its own `config.userId` doesn't match roster rows'
`manager.id`. That's now resolved without a new field: `GET /api/v2/teams` is
scoped server-side to teams *owned by the calling manager* — confirmed live this
session (QA manager account got back exactly `[2374, 5000, 5001, 5004, 5005,
5006]`, its own owned team ids, not every team in the org). So every row
returned by fetching each of those team ids' rosters is, by construction, a
direct report. No client-side filtering by manager id is needed.

This also sidesteps a real backfill gap discovered during research: even if a
new config field were added, `useRoleRefresh` (`src/hooks/useRoleRefresh.ts:30-66`)
only ever overwrites a hand-picked subset of fields (`isManager`, `hourlyRate`,
`weeklyLimit`, `teams`, `lastRoleCheck`) on an already-onboarded config — it does
not re-run `extractConfigFromDetail`, so a new field would silently stay
`undefined` for every user who onboarded before the field existed. Avoiding a
new config field avoids this migration problem entirely.

**2. Two-call shape: `fetchMyTeams()` then `fetchTeamRoster(teamId)` per team,
fanned out in the hook (Spec 02), not inside this spec's API functions.** Spec 01
stays at the "one API call, one typed result" granularity, matching the existing
style in `src/api/approvals.ts` and `src/api/timesheet.ts` — fan-out/aggregation
logic belongs in the hook layer per the module-layering convention
(`hourglassws/CLAUDE.md` "Module layering"). `fetchTeamRoster` takes a single
`teamId` and returns that team's roster; the hook calls it once per id from
`fetchMyTeams()`.

**3. Confirmed roster row shape (live QA probe, `team 2374`, 10 active members)**
— the fields this spec's `TeamMember` type needs, and where they come from:
```json
{
  "id": 80217,
  "candidate": { "id": 2372656, "userId": 1194928, "printableName": "...", "photoUrl": undefined },
  "manager": { "id": 1421271 },
  "team": { "id": 2374, "name": "..." },
  "status": "ACTIVE"
}
```
`candidate.photoUrl` is the real profile-photo field (confirmed against
Crossover's own frontend bundle mapping — see `memory/reference_crossover_api.md`
"Team roster + profile photo"), not anything under `userAvatars`/`avatarTypes`.
QA test accounts return `photoUrl: undefined` (no uploaded photo) — field
presence is confirmed, just empty on this data.

**4. `fetchMyTeams()` response shape** — `GET /api/v2/teams` returns an array
(not a Spring page envelope, unlike `/assignments`) of team objects; each has at
minimum `{id, name}`. Confirmed live: no wrapping `content`/pagination keys on
this endpoint's response, unlike F6 in `docs/CROSSOVER_API.md:835-854` for
`/assignments`.

**5. Status filter and staleness.** Both calls use `status=ACTIVE` (matches the
existing convention in `fetchConfigFromAssignments`, `src/api/auth.ts:157`) —
inactive/departed reports shouldn't appear in a "how is my team doing" view.

## Interface contracts

New types in `src/types/api.ts` (append, following the existing style — each
field commented with its API source per file convention):

```typescript
// Confirmed 2026-07-28 from live QA probe against GET /api/v2/teams/assignments?teamId=...
export interface RawTeamAssignment {
  id: number;                 // ← API: assignment id
  status: string;             // ← API: "ACTIVE" | others
  candidate: {
    id: number;                // ← API: candidate.id — use for timesheet userId param
    userId: number;
    printableName: string;
    photoUrl?: string;          // ← API: confirmed field name; undefined when no photo uploaded
    avatarTypes?: string[];     // ← API: e.g. ["CANDIDATE","MANAGER"] — a report can be a manager themselves
  };
  manager: { id: number };      // ← API: manager.id — use for timesheet managerId param
  team: { id: number; name: string }; // ← API: team.id — use for timesheet teamId param
}

// Confirmed 2026-07-28 from live QA probe against GET /api/v2/teams
export interface RawTeam {
  id: number;   // ← API
  name: string; // ← API
}

// App-facing shape — one row per direct report
export interface TeamMember {
  assignmentId: string;  // RawTeamAssignment.id — for work-diary API
  candidateId: string;   // RawTeamAssignment.candidate.id — for timesheet userId param
  managerId: string;     // RawTeamAssignment.manager.id — for timesheet managerId param
  teamId: string;        // RawTeamAssignment.team.id — for timesheet teamId param
  teamName: string;
  name: string;
  photoUrl?: string;
  isManager: boolean;    // derived: RawTeamAssignment.candidate.avatarTypes?.includes('MANAGER') — surfaced for the "MANAGER" badge in Spec 04's report cards; not used for any filtering in this feature's Team tier
}
```

New file `src/api/team.ts`:

```typescript
/**
 * Fetch the teams owned by the current manager. Scoped server-side to the
 * caller — returns only teams this manager owns, not every team in the org.
 */
export async function fetchMyTeams(
  token: string,
  useQA: boolean,
): Promise<RawTeam[]>

/**
 * Fetch the active roster for one team. Every row is a direct report of
 * whichever manager owns `teamId` (see fetchMyTeams).
 */
export async function fetchTeamRoster(
  teamId: string,
  token: string,
  useQA: boolean,
): Promise<TeamMember[]>
```

`fetchTeamRoster` maps each `RawTeamAssignment` to a `TeamMember`, filtering to
`status === 'ACTIVE'` defensively (the query param already requests this, but
mirrors the defensive-parsing style already used in `auth.ts` for API responses
that don't always honor query filters cleanly).

## Test plan

- [ ] `fetchMyTeams` returns a typed `RawTeam[]` from a mocked array response;
      returns `[]` on an empty array response (not an error).
- [ ] `fetchTeamRoster` maps a mocked `RawTeamAssignment[]` (using the exact
      shape captured in decision 3) to `TeamMember[]`, correctly extracting
      nested `candidate.id`/`manager.id`/`team.id`/`team.name`.
- [ ] `fetchTeamRoster` filters out non-`ACTIVE` rows defensively even if the
      mocked response includes one (server-side filter can't be assumed
      airtight — same defensive posture as `auth.ts`'s Spring-page handling).
- [ ] `fetchTeamRoster` handles a missing/undefined `photoUrl` without throwing,
      returning `photoUrl: undefined` on the mapped `TeamMember`.
- [ ] Both functions propagate `AuthError`/`NetworkError` unchanged (matching
      the existing propagation pattern in `src/api/timesheet.ts` and
      `src/api/approvals.ts` — no swallowing at this layer).

## Files to reference

| File | Why |
|---|---|
| `src/api/auth.ts:150-177` | Existing `/api/v2/teams/assignments` caller — reference for query-param/response-shape handling conventions, though it queries a different `avatarType`. |
| `src/api/approvals.ts` (full) | Reference style for a new `src/api/` file: JSDoc per exported function, thin wrapper around `apiGet`. |
| `src/types/api.ts` | Where new `RawTeamAssignment`/`RawTeam` types get appended, matching existing field-comment convention. |
| `memory/reference_crossover_api.md` "Team roster + profile photo" | Source of the confirmed roster row shape and `photoUrl` field identification. |
| `docs/CROSSOVER_API.md:835-854` (F6) | `/assignments` Spring-page-envelope gotcha — does NOT apply to `/api/v2/teams`, which returns a bare array (confirmed live this session) — worth noting explicitly so the two response-shape handlers aren't accidentally unified. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ (load-bearing) | Mapping/defensive-parsing logic per test plan above |
| Live-QA probe | ✓ (already done, see decisions 3/4) | Re-verify only if response shape is suspected to have changed |
| TestFlight | — | Deferred to Spec 04 (no UI surface in this spec) |
| Error log | ✗ | No new runtime error path beyond existing `AuthError`/`NetworkError` propagation |
