# Implementation Checklist

Spec: `01-team-roster-api`
Feature: `team-org-view`

---

## Phase 1.0: Test Foundation

### FR1: Define team roster API types
- [ ] Write a TypeScript compile-time check (or type-only test) confirming `RawTeam`, `RawTeamAssignment`, `TeamMember` are exported from `src/types/api.ts` with the specified fields
- [ ] Write test confirming `TeamMember` shape includes `assignmentId`, `candidateId`, `managerId`, `teamId`, `teamName`, `name`, optional `photoUrl`, `isManager`

### FR2: Fetch the current manager's active teams
- [ ] Write test: `fetchMyTeams` sends `GET /api/v2/teams` with `{ status: 'ACTIVE' }`, correct token, and correct QA/prod base URL
- [ ] Write test: a populated bare-array response resolves to typed `RawTeam[]`
- [ ] Write test: an empty array response resolves to `[]` (not an error)
- [ ] Write test: a nullish/malformed response resolves to `[]`
- [ ] Write test: `AuthError`/`NetworkError` thrown by the mocked `apiGet` propagate unchanged (not swallowed/wrapped)

### FR3: Fetch and map one team's active roster
- [ ] Write test: `fetchTeamRoster(teamId, ...)` sends `GET /api/v2/teams/assignments` with `{ teamId, status: 'ACTIVE' }`
- [ ] Write test: assignments read from Spring `content` envelope map correctly to `TeamMember[]` (exact field mapping: `assignmentId`/`candidateId`/`managerId`/`teamId`/`teamName`/`name`/`photoUrl`/`isManager`, all IDs stringified)
- [ ] Write test: a bare assignment array (no `content` envelope) is also accepted
- [ ] Write test: rows with non-`ACTIVE` status are filtered out even if returned by the mocked server
- [ ] Write test: missing `candidate.photoUrl` maps to `photoUrl: undefined` without throwing
- [ ] Write test: missing `avatarTypes` or an array without `MANAGER` maps to `isManager: false`; array containing `MANAGER` maps to `isManager: true`
- [ ] Write test: an empty roster response resolves to `[]`
- [ ] Write test: `AuthError`/`NetworkError` thrown by the mocked `apiGet` propagate unchanged

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage
- [ ] Assertions are specific (not just "exists" or "doesn't throw")
- [ ] Mocks return realistic data matching interface contracts (use the confirmed live shape from spec-research.md decision 3)
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Define team roster API types
- [ ] Add `RawTeam` to `src/types/api.ts` (`{ id: number; name: string }`, API-source comments)
- [ ] Add `RawTeamAssignment` to `src/types/api.ts` (nested `candidate`/`manager`/`team`, optional `photoUrl`/`avatarTypes`, API-source comments)
- [ ] Add `TeamMember` to `src/types/api.ts` (app-facing shape, string IDs, `isManager: boolean`)

### FR2: Fetch the current manager's active teams
- [ ] Create `src/api/team.ts`
- [ ] Implement `fetchMyTeams(token, useQA)` per Technical Design: `apiGet<RawTeam[] | null>('/api/v2/teams', { status: 'ACTIVE' }, token, useQA)`, return `[]` for non-array responses
- [ ] Add short JSDoc per module convention (`hourglassws/CLAUDE.md` comments rule — exported `src/api/` functions get 2-3 line JSDoc)

### FR3: Fetch and map one team's active roster
- [ ] Implement private `AssignmentsPage` structural type in `team.ts`
- [ ] Implement `fetchTeamRoster(teamId, token, useQA)`: call `apiGet` for `/api/v2/teams/assignments` with `{ teamId, status: 'ACTIVE' }`
- [ ] Implement envelope handling: read `response.content` when array, else accept bare array, else `[]`
- [ ] Implement defensive `status === 'ACTIVE'` filter
- [ ] Implement `RawTeamAssignment` → `TeamMember` mapping exactly per Technical Design
- [ ] Add JSDoc per module convention

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code
- [ ] Interface contracts match implementation
- [ ] No scope creep or shortfall (no fan-out/aggregation logic leaked into this spec's files — that belongs to Spec 02)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes
- [ ] Commit fixes: `fix(01-team-roster-api): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(01-team-roster-api): strengthen test assertions`

### Final Verification
- [ ] All tests passing (`npx jest src/__tests__/api/team.test.ts --runInBand`)
- [ ] TypeScript check passes with no new errors
- [ ] No regressions in existing `src/api/auth.ts` tests (shared `apiGet`/envelope-parsing conventions)
- [ ] Code follows existing `src/api/` patterns (thin wrapper, no error swallowing, module layering per `docs/ARCHITECTURE.md` §6.6)

---

## Session Notes

<!-- Add notes as you work -->
