# Implementation Checklist

Spec: `01-team-roster-api`
Feature: `team-org-view`

---

## Phase 1.0: Test Foundation

### FR1: Define team roster API types
- [x] Write a TypeScript compile-time check (or type-only test) confirming `RawTeam`, `RawTeamAssignment`, `TeamMember` are exported from `src/types/api.ts` with the specified fields
- [x] Write test confirming `TeamMember` shape includes `assignmentId`, `candidateId`, `managerId`, `teamId`, `teamName`, `name`, optional `photoUrl`, `isManager`

### FR2: Fetch the current manager's active teams
- [x] Write test: `fetchMyTeams` sends `GET /api/v2/teams` with `{ status: 'ACTIVE' }`, correct token, and correct QA/prod base URL
- [x] Write test: a populated bare-array response resolves to typed `RawTeam[]`
- [x] Write test: an empty array response resolves to `[]` (not an error)
- [x] Write test: a nullish/malformed response resolves to `[]`
- [x] Write test: `AuthError`/`NetworkError` thrown by the mocked `apiGet` propagate unchanged (not swallowed/wrapped)

### FR3: Fetch and map one team's active roster
- [x] Write test: `fetchTeamRoster(teamId, ...)` sends `GET /api/v2/teams/assignments` with `{ teamId, status: 'ACTIVE' }`
- [x] Write test: assignments read from Spring `content` envelope map correctly to `TeamMember[]` (exact field mapping: `assignmentId`/`candidateId`/`managerId`/`teamId`/`teamName`/`name`/`photoUrl`/`isManager`, all IDs stringified)
- [x] Write test: a bare assignment array (no `content` envelope) is also accepted
- [x] Write test: rows with non-`ACTIVE` status are filtered out even if returned by the mocked server
- [x] Write test: missing `candidate.photoUrl` maps to `photoUrl: undefined` without throwing
- [x] Write test: missing `avatarTypes` or an array without `MANAGER` maps to `isManager: false`; array containing `MANAGER` maps to `isManager: true`
- [x] Write test: an empty roster response resolves to `[]`
- [x] Write test: `AuthError`/`NetworkError` thrown by the mocked `apiGet` propagate unchanged

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run `red-phase-test-validator` agent
- [x] All FR success criteria have test coverage
- [x] Assertions are specific (not just "exists" or "doesn't throw")
- [x] Mocks return realistic data matching interface contracts (use the confirmed live shape from spec-research.md decision 3)
- [x] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Define team roster API types
- [x] Add `RawTeam` to `src/types/api.ts` (`{ id: number; name: string }`, API-source comments)
- [x] Add `RawTeamAssignment` to `src/types/api.ts` (nested `candidate`/`manager`/`team`, optional `photoUrl`/`avatarTypes`, API-source comments)
- [x] Add `TeamMember` to `src/types/api.ts` (app-facing shape, string IDs, `isManager: boolean`)

### FR2: Fetch the current manager's active teams
- [x] Create `src/api/team.ts`
- [x] Implement `fetchMyTeams(token, useQA)` per Technical Design: `apiGet<RawTeam[] | null>('/api/v2/teams', { status: 'ACTIVE' }, token, useQA)`, return `[]` for non-array responses
- [x] Add short JSDoc per module convention (`hourglassws/CLAUDE.md` comments rule — exported `src/api/` functions get 2-3 line JSDoc)

### FR3: Fetch and map one team's active roster
- [x] Implement private `AssignmentsPage` structural type in `team.ts`
- [x] Implement `fetchTeamRoster(teamId, token, useQA)`: call `apiGet` for `/api/v2/teams/assignments` with `{ teamId, status: 'ACTIVE' }`
- [x] Implement envelope handling: read `response.content` when array, else accept bare array, else `[]`
- [x] Implement defensive `status === 'ACTIVE'` filter
- [x] Implement `RawTeamAssignment` → `TeamMember` mapping exactly per Technical Design
- [x] Add JSDoc per module convention

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [x] Run `spec-implementation-alignment` agent
- [x] All FR success criteria verified in code
- [x] Interface contracts match implementation
- [x] No scope creep or shortfall (no fan-out/aggregation logic leaked into this spec's files — that belongs to Spec 02)

### Step 1: Comprehensive PR Review
- [x] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents) — adapted for local-only diff (no real GitHub PR exists in this workflow): 5 specialized reviewer roles (code quality, silent-failure-hunter, test-coverage, comment-analyzer, type-design-analyzer) plus Codex CLI as a 6th cross-model reviewer, all against `git diff 53ced1b HEAD`

### Step 2: Address Feedback
- [x] Fix HIGH severity issues (critical) — none found
- [x] Fix MEDIUM severity issues (or document why deferred) — fixed: (1) silent-failure-hunter's leaf-field `String(undefined)` coercion via new `assertPresent()` guard; (2) type-design's missing `candidate.userId` vs `candidate.id` distinguishing comment; (3) test-coverage's missing case-sensitive status-filter regression test. Deferred as non-actionable: Codex's pagination point (explicitly deferred by spec.md) and type-erasure point (mitigated by existing `tsc --noEmit` check)
- [x] Re-run tests after fixes
- [x] Commit fixes: `fix(01-team-roster-api): {description}` (commits `8eef9b9`, `fa56ad9`)

### Step 3: Test Quality Optimization
- [x] Run `test-optimiser` agent on modified tests
- [x] Apply suggested improvements that strengthen confidence — mutation sweep found 5 of 6 `assertPresent` call sites were unguarded by tests; replaced single malformed-candidate-id test with an `it.each` table covering all six guarded fields
- [x] Re-run tests to confirm passing
- [x] Commit if changes made: `fix(01-team-roster-api): strengthen test assertions` (commit `9597b68`)

### Final Verification
- [x] All tests passing (`npx jest src/__tests__/api/team.test.ts --runInBand`) — 35/35 passing
- [x] TypeScript check passes with no new errors
- [x] No regressions in existing `src/api/auth.ts` tests (shared `apiGet`/envelope-parsing conventions) — verified alongside work-diary.test.ts and approvals-api.test.ts, 95/95 passing across all four suites
- [x] Code follows existing `src/api/` patterns (thin wrapper, no error swallowing, module layering per `docs/ARCHITECTURE.md` §6.6)

---

## Session Notes

**2026-07-28**: Spec execution complete.
- Phase 1.0: tests for FR1-FR3 written against `src/__tests__/api/team.test.ts`; `red-phase-test-validator` iteration 1 flagged missing `fetchTeamRoster` nullish/malformed-envelope tests, fixed and re-validated (iteration 2 PASS).
- Phase 1.1: `src/api/team.ts` (fetchMyTeams, fetchTeamRoster) and `src/types/api.ts` (RawTeam, RawTeamAssignment, TeamMember) implemented per spec.md's Technical Design almost verbatim.
- Phase 1.2: `spec-implementation-alignment` PASS. 6-agent review round (code quality, silent-failure-hunter, test-coverage, comment-accuracy, type-design, Codex CLI) found 3 legitimate MEDIUM issues, all fixed via `fix(01-team-roster-api)` commits (`8eef9b9`, `fa56ad9`): added `assertPresent()` guard against silent `String(undefined)` identity fabrication, added a clarifying comment on `candidate.userId` vs `candidate.id`, added case-sensitive status-filter regression coverage. `test-optimiser` mutation sweep found 5/6 `assertPresent` sites were untested; strengthened via an `it.each` table (`9597b68`).
- Final: 35/35 tests passing in `team.test.ts`; 95/95 passing across `team.test.ts` + `auth-api.test.ts` + `work-diary.test.ts` + `approvals-api.test.ts`; `tsc --noEmit` clean for all touched files.
