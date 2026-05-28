# Implementation Checklist

Spec: `05-onboarding-defense`
Feature: `resilience-fixes`

---

## Phase 5.0: Test Foundation

### FR1: `NotContributorError` typed error class
- [x] Write test: `new NotContributorError([])` is `instanceof Error`
- [x] Write test: `new NotContributorError(['MANAGER'])` is `instanceof NotContributorError`
- [x] Write test: `err.name === 'NotContributorError'`
- [x] Write test: `err.avatarTypes` deep-equals the constructor argument
- [x] Write test: `err.message` contains each entry of `avatarTypes` (comma-joined)
- [x] Write test: `JSON.stringify(err)` does not surface any extra fields beyond `name`/`message`/`avatarTypes`

### FR2: Defensive `/detail` parsing in `extractConfigFromDetail`
- [x] Write test: contributor-shaped fixture (existing `makeDetail()`) returns the same config object as today (regression guard via existing happy-path tests)
- [x] Write test: pure-manager `/detail` payload (no `assignment`, no CANDIDATE avatar) makes `fetchAndBuildConfig` reach the `/assignments` fallback
- [x] Write test: `/detail` with `userAvatars: [{type: 'CANDIDATE', id: 99}]` but no `assignment` reaches the `/assignments` fallback
- [x] Write test: `/detail` with `assignment` present but `assignment.team` undefined reaches the `/assignments` fallback (no `TypeError` thrown)

### FR3: Read `/assignments.content` Spring page envelope
- [x] Write test: response `{content: [], totalElements: 0}` → no throw, `NotContributorError` is reached
- [x] Write test: response `{content: [validAssignment], totalElements: 1}` → returns config built from `validAssignment`
- [x] Write test: response `[validAssignment]` (legacy bare-array) → returns config built from `validAssignment`
- [x] Write test: response `null` / `undefined` / `{}` / `42` → no throw, `NotContributorError` is reached
- [x] Write test: `apiGet` is called exactly once per `fetchConfigFromAssignments` invocation (no pagination loop)

### FR4: `fetchAndBuildConfig` throws `NotContributorError` when both paths fail
- [x] Write test: contributor `/detail` payload → `apiGet` is **not** called for `/assignments`
- [x] Write test: pure-manager `/detail` + `/assignments` `{content: []}` → throws `NotContributorError` whose `avatarTypes === ['MANAGER', 'COMPANY_ADMIN']`
- [x] Write test: pure-manager `/detail` + `/assignments` `{content: [validAssignment]}` → returns a `CrossoverConfig` built from the fallback assignment
- [x] Write test: `getProfileDetail` throws `AuthError(401)` → `AuthError(401)` propagates, no `NotContributorError`
- [x] Write test: `getProfileDetail` throws `NetworkError` → `NetworkError` propagates, no `NotContributorError`
- [x] Write test: `getProfileDetail` throws `ApiError(500)` + `/assignments` throws → throws `NotContributorError([])`
- [x] Write test: `getProfileDetail` throws `ApiError(500)` + `/assignments` `{content: [validAssignment]}` → returns a config from the fallback
- [x] Write test: userId-only last-resort branch is removed — verify the function does **not** return a config when both `/detail` and `/assignments` return empty (would have returned a userId-only stub before)

### FR5: `useSetup` routes `NotContributorError` to `'not-contributor'` step
- [x] Write test: `_buildConfig` catching `NotContributorError(['MANAGER','COMPANY_ADMIN'])` sets `step === 'not-contributor'`
- [x] Write test: `_buildConfig` catching `NotContributorError(['MANAGER'])` sets `nonContributorRoles === ['MANAGER']`
- [x] Write test: on `NotContributorError`, `pendingConfig` stays `null`
- [x] Write test: on `NotContributorError`, `error` stays `null`
- [x] Write test: on `AuthError(401)`, `nonContributorRoles` stays `null` (regression — other branches don't set it)
- [x] Write test: `nonContributorRoles` is exposed on `UseSetupResult`

### FR6: Local error log entry on `NotContributorError`
- [x] Write test: `_buildConfig` catching `NotContributorError(['MANAGER'])` calls `log.error('onboarding.not-contributor', err, { avatarTypes: ['MANAGER'] })` exactly once
- [x] Write test: `log.error` is **not** called when `_buildConfig` catches `AuthError(401)` or generic `Error`
- [x] Write test: `log.error` arguments do not contain `username` or `password` strings

### FR7: `not-contributor.tsx` onboarding screen + route registration
- [x] Write test: screen renders with `nonContributorRoles = ['MANAGER', 'COMPANY_ADMIN']` and the text `MANAGER, COMPANY_ADMIN` appears
- [x] Write test: screen renders with `nonContributorRoles = null` and shows the literal string `unknown` in the roles slot
- [x] Write test: screen renders with `nonContributorRoles = []` and shows `unknown`
- [x] Write test: pressing the Sign Out button triggers `clearAll()` (mocked)
- [x] Write test: pressing Sign Out calls `invalidateAuthToken()` (mocked)
- [x] Write test: pressing Sign Out calls `router.replace('/(auth)/welcome')`
- [x] Write test: the route is registered in `_layout.tsx` with `gestureEnabled: false`

### FR8: `verifying.tsx` navigation to `'not-contributor'`
- [x] Write test: when `step` transitions from `'verifying'` to `'not-contributor'`, `router.replace('/(auth)/not-contributor')` is called
- [x] Write test: when `step` transitions to any other value, navigation behavior is unchanged (regression guard)

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run `red-phase-test-validator` agent (inline review acceptable in autonomous mode)
- [x] All FR success criteria have test coverage
- [x] Assertions are specific (no bare `toBeDefined()` / `not.toThrow()` patterns where a concrete shape is the contract)
- [x] Mocks return realistic data matching the interface contracts in spec.md
- [x] Fix any issues identified before proceeding
- [x] Commit: `test(05-onboarding-defense): add red-phase tests` (HEREDOC, Co-Author-By)

---

## Phase 5.1: Implementation

### FR1: `NotContributorError`
- [x] Add `NotContributorError` class to `src/api/errors.ts` (extends `Error`, sets `name`, `avatarTypes`, prototype)
- [x] Verify `instanceof` survives transpile (matches `AuthError`/`ApiError` pattern)
- [x] Commit: `feat(05-onboarding-defense): add NotContributorError`

### FR2: Defensive `/detail` parsing
- [x] Mark `DetailResponse.assignment` as optional in `src/api/auth.ts`
- [x] Change `extractConfigFromDetail` signature to return `Omit<CrossoverConfig, 'setupComplete' | 'setupDate'> | null`
- [x] Add guard: return `null` when `assignment` missing/has no `id` AND no CANDIDATE avatar in `userAvatars`
- [x] Add optional-chaining on every `detail.assignment.*` read
- [x] Run existing happy-path tests — must still pass

### FR3: Page-envelope read in `fetchConfigFromAssignments`
- [x] Change return type to `Omit<CrossoverConfig, 'setupComplete' | 'setupDate'> | null`
- [x] Replace `Array.isArray(assignments)` check with: read `response.content` if array, else `response` if array, else empty list
- [x] Return `null` (not throw) when the list is empty or garbage
- [x] Verify single `apiGet` call per invocation

### FR4: `fetchAndBuildConfig` wiring
- [x] Capture `avatarTypes` from a successful `/detail` response
- [x] Call new helpers in sequence: detail → assignments fallback → throw `NotContributorError`
- [x] **Remove** the userId-only last-resort branch (`auth.ts:155-173`)
- [x] Re-raise `AuthError` / `NetworkError` from `getProfileDetail` unchanged
- [x] When `getProfileDetail` throws non-Auth `ApiError`, try `/assignments`; if also fails, throw `NotContributorError([])`
- [x] Commit: `feat(05-onboarding-defense): defensive onboarding parse and NotContributorError`

### FR5: `useSetup` step + state + branch
- [x] Extend `OnboardingStep` type with `'not-contributor'`
- [x] Add `nonContributorRoles: string[] | null` state
- [x] Expose `nonContributorRoles` on `UseSetupResult`
- [x] Add `NotContributorError` branch in `_buildConfig` catch block (before `AuthError` branch)
- [x] On the new branch: `setNonContributorRoles`, `setStep('not-contributor')`, leave `pendingConfig` and `error` null

### FR6: Log call
- [x] Import `log` from `@/src/lib/log` in `src/hooks/useAuth.ts`
- [x] Call `log.error('onboarding.not-contributor', err, { avatarTypes: err.avatarTypes })` in the new branch
- [x] Verify no username/password is passed to the logger

### FR7: `not-contributor.tsx` screen
- [x] Create `app/(auth)/not-contributor.tsx`
- [x] Read `nonContributorRoles` via `useOnboarding()`
- [x] Render three lines of body copy verbatim from FR7 success criteria
- [x] Render Sign Out button → `clearAll()` + `invalidateAuthToken()` + `router.replace('/(auth)/welcome')`
- [x] Match dark-background styling to `credentials.tsx`
- [x] Register route in `app/(auth)/_layout.tsx` with `gestureEnabled: false`

### FR8: `verifying.tsx` branch
- [x] Add `else if (step === 'not-contributor') router.replace('/(auth)/not-contributor');` branch
- [x] Commit: `feat(05-onboarding-defense): not-contributor screen and useSetup wiring`

### Integration verification
- [x] Run full test suite: `npm test`
- [x] No regression in `__tests__/auth-api.test.ts`, `__tests__/use-setup.test.ts`, `__tests__/auth-screens.test.tsx`

---

## Phase 5.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [x] Run `spec-implementation-alignment` (inline if agent dispatch unavailable)
- [x] All FR success criteria verified in code
- [x] Interface contracts match implementation (NotContributorError shape, extractConfigFromDetail return type, fetchConfigFromAssignments return type)
- [x] No scope creep or shortfall (e.g. didn't touch payments-rate-lookup branch)

### Step 1: Comprehensive PR Review
- [x] Run `pr-review-toolkit:review-pr` skill (or equivalent multi-angle inline review)

### Step 2: Address Feedback
- [x] Fix HIGH severity issues (critical)
- [x] Fix MEDIUM severity issues (or document why deferred)
- [x] Re-run tests after fixes
- [x] Commit fixes: `fix(05-onboarding-defense): {description}`

### Step 3: Test Quality Optimization
- [x] Run `test-optimiser` on modified tests (inline acceptable)
- [x] Tighten any weak assertions (e.g. assert exact `avatarTypes` array, not just `not.null`)
- [x] Re-run tests
- [x] Commit if changes made: `fix(05-onboarding-defense): strengthen test assertions`

### Final Verification
- [x] All tests passing (full app suite green)
- [x] No regressions in existing tests
- [x] FEATURE.md changelog updated with completion entry
- [x] ARCHITECTURE.md §5.5 updated to mention the new not-contributor terminal state (if applicable)
- [x] CROSSOVER_API.md §15.F5 / §15.F6 cross-referenced to spec 05 as resolved

---

## Session Notes

<!-- Add notes as you work -->

**2026-05-28**: Spec drafted. Adopting research's proposed user-visible wording verbatim. `NotContributorError` chosen as a new error class (not a tagged `ApiError`) to align with the existing `errors.ts` convention. The userId-only last-resort branch in `fetchAndBuildConfig` (`auth.ts:155-173`) is being removed because the live probe (F7) confirms it produces a broken dashboard; surfacing `NotContributorError` is strictly more useful. Inherited contracts from specs 03/04 (token cache, error envelope) are consumed but not modified.

**2026-05-28**: Implementation complete.
- Phase 5.0: 1 test commit (`348dfc9`) — +41 failing tests across `errors.test.ts`, `auth-api.test.ts`, `use-setup.test.ts`, `auth-screens.test.tsx`. Stub `not-contributor.tsx` (returns `null`) added so the test file resolves.
- Phase 5.1: 4 implementation commits — `7ebfe02` (FR1 `NotContributorError`), `69afc91` (FR2/3/4 defensive auth.ts), `5685e29` (FR5/6 useSetup branch + log call), `655acc2` (FR7/8 screen + nav).
- Phase 5.2 review: inline alignment + multi-angle review caught one consistency issue (`err.name === 'NetworkError'` → `instanceof NetworkError`), fixed in `11895b0`. Test-optimisation pass strengthened the garbage-response assertion to also verify `avatarTypes` carry-through (`b447355`).
- Full suite: 4074/4074 green. No regressions.
- Two ambiguities flagged in the orchestrator brief were resolved per research:
  1. **User-visible error wording:** adopted verbatim from spec-research §3 ("Hourglass tracks contributor activity — hours, AI usage, and earnings." / "Your Crossover account has these roles: …" / "To use Hourglass, you'll need a Crossover Candidate (contributor) role. Resolve this on crossover.com, then sign back in."). Button label: "Sign Out".
  2. **Error-type shape:** new class `NotContributorError extends Error` (not a tagged `ApiError`), matching the `errors.ts` convention.
- One masked-bug concern: the `ApiError-from-detail + ApiError-from-/assignments` path now surfaces `NotContributorError([])` to the UI. Research §3.5 accepts this and FR6 makes it observable via the local log. **No silent-failure regression** vs the previous behavior (which returned a userId-only stub that 400d on every API call).
