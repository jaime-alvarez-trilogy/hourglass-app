# Implementation Checklist

Spec: `05-onboarding-defense`
Feature: `resilience-fixes`

---

## Phase 5.0: Test Foundation

### FR1: `NotContributorError` typed error class
- [ ] Write test: `new NotContributorError([])` is `instanceof Error`
- [ ] Write test: `new NotContributorError(['MANAGER'])` is `instanceof NotContributorError`
- [ ] Write test: `err.name === 'NotContributorError'`
- [ ] Write test: `err.avatarTypes` deep-equals the constructor argument
- [ ] Write test: `err.message` contains each entry of `avatarTypes` (comma-joined)
- [ ] Write test: `JSON.stringify(err)` does not surface any extra fields beyond `name`/`message`/`avatarTypes`

### FR2: Defensive `/detail` parsing in `extractConfigFromDetail`
- [ ] Write test: contributor-shaped fixture (existing `makeDetail()`) returns the same config object as today (regression guard via existing happy-path tests)
- [ ] Write test: pure-manager `/detail` payload (no `assignment`, no CANDIDATE avatar) makes `fetchAndBuildConfig` reach the `/assignments` fallback
- [ ] Write test: `/detail` with `userAvatars: [{type: 'CANDIDATE', id: 99}]` but no `assignment` reaches the `/assignments` fallback
- [ ] Write test: `/detail` with `assignment` present but `assignment.team` undefined reaches the `/assignments` fallback (no `TypeError` thrown)

### FR3: Read `/assignments.content` Spring page envelope
- [ ] Write test: response `{content: [], totalElements: 0}` → no throw, `NotContributorError` is reached
- [ ] Write test: response `{content: [validAssignment], totalElements: 1}` → returns config built from `validAssignment`
- [ ] Write test: response `[validAssignment]` (legacy bare-array) → returns config built from `validAssignment`
- [ ] Write test: response `null` / `undefined` / `{}` / `42` → no throw, `NotContributorError` is reached
- [ ] Write test: `apiGet` is called exactly once per `fetchConfigFromAssignments` invocation (no pagination loop)

### FR4: `fetchAndBuildConfig` throws `NotContributorError` when both paths fail
- [ ] Write test: contributor `/detail` payload → `apiGet` is **not** called for `/assignments`
- [ ] Write test: pure-manager `/detail` + `/assignments` `{content: []}` → throws `NotContributorError` whose `avatarTypes === ['MANAGER', 'COMPANY_ADMIN']`
- [ ] Write test: pure-manager `/detail` + `/assignments` `{content: [validAssignment]}` → returns a `CrossoverConfig` built from the fallback assignment
- [ ] Write test: `getProfileDetail` throws `AuthError(401)` → `AuthError(401)` propagates, no `NotContributorError`
- [ ] Write test: `getProfileDetail` throws `NetworkError` → `NetworkError` propagates, no `NotContributorError`
- [ ] Write test: `getProfileDetail` throws `ApiError(500)` + `/assignments` throws → throws `NotContributorError([])`
- [ ] Write test: `getProfileDetail` throws `ApiError(500)` + `/assignments` `{content: [validAssignment]}` → returns a config from the fallback
- [ ] Write test: userId-only last-resort branch is removed — verify the function does **not** return a config when both `/detail` and `/assignments` return empty (would have returned a userId-only stub before)

### FR5: `useSetup` routes `NotContributorError` to `'not-contributor'` step
- [ ] Write test: `_buildConfig` catching `NotContributorError(['MANAGER','COMPANY_ADMIN'])` sets `step === 'not-contributor'`
- [ ] Write test: `_buildConfig` catching `NotContributorError(['MANAGER'])` sets `nonContributorRoles === ['MANAGER']`
- [ ] Write test: on `NotContributorError`, `pendingConfig` stays `null`
- [ ] Write test: on `NotContributorError`, `error` stays `null`
- [ ] Write test: on `AuthError(401)`, `nonContributorRoles` stays `null` (regression — other branches don't set it)
- [ ] Write test: `nonContributorRoles` is exposed on `UseSetupResult`

### FR6: Local error log entry on `NotContributorError`
- [ ] Write test: `_buildConfig` catching `NotContributorError(['MANAGER'])` calls `log.error('onboarding.not-contributor', err, { avatarTypes: ['MANAGER'] })` exactly once
- [ ] Write test: `log.error` is **not** called when `_buildConfig` catches `AuthError(401)` or generic `Error`
- [ ] Write test: `log.error` arguments do not contain `username` or `password` strings

### FR7: `not-contributor.tsx` onboarding screen + route registration
- [ ] Write test: screen renders with `nonContributorRoles = ['MANAGER', 'COMPANY_ADMIN']` and the text `MANAGER, COMPANY_ADMIN` appears
- [ ] Write test: screen renders with `nonContributorRoles = null` and shows the literal string `unknown` in the roles slot
- [ ] Write test: screen renders with `nonContributorRoles = []` and shows `unknown`
- [ ] Write test: pressing the Sign Out button triggers `clearAll()` (mocked)
- [ ] Write test: pressing Sign Out calls `invalidateAuthToken()` (mocked)
- [ ] Write test: pressing Sign Out calls `router.replace('/(auth)/welcome')`
- [ ] Write test: the route is registered in `_layout.tsx` with `gestureEnabled: false`

### FR8: `verifying.tsx` navigation to `'not-contributor'`
- [ ] Write test: when `step` transitions from `'verifying'` to `'not-contributor'`, `router.replace('/(auth)/not-contributor')` is called
- [ ] Write test: when `step` transitions to any other value, navigation behavior is unchanged (regression guard)

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent (inline review acceptable in autonomous mode)
- [ ] All FR success criteria have test coverage
- [ ] Assertions are specific (no bare `toBeDefined()` / `not.toThrow()` patterns where a concrete shape is the contract)
- [ ] Mocks return realistic data matching the interface contracts in spec.md
- [ ] Fix any issues identified before proceeding
- [ ] Commit: `test(05-onboarding-defense): add red-phase tests` (HEREDOC, Co-Author-By)

---

## Phase 5.1: Implementation

### FR1: `NotContributorError`
- [ ] Add `NotContributorError` class to `src/api/errors.ts` (extends `Error`, sets `name`, `avatarTypes`, prototype)
- [ ] Verify `instanceof` survives transpile (matches `AuthError`/`ApiError` pattern)
- [ ] Commit: `feat(05-onboarding-defense): add NotContributorError`

### FR2: Defensive `/detail` parsing
- [ ] Mark `DetailResponse.assignment` as optional in `src/api/auth.ts`
- [ ] Change `extractConfigFromDetail` signature to return `Omit<CrossoverConfig, 'setupComplete' | 'setupDate'> | null`
- [ ] Add guard: return `null` when `assignment` missing/has no `id` AND no CANDIDATE avatar in `userAvatars`
- [ ] Add optional-chaining on every `detail.assignment.*` read
- [ ] Run existing happy-path tests — must still pass

### FR3: Page-envelope read in `fetchConfigFromAssignments`
- [ ] Change return type to `Omit<CrossoverConfig, 'setupComplete' | 'setupDate'> | null`
- [ ] Replace `Array.isArray(assignments)` check with: read `response.content` if array, else `response` if array, else empty list
- [ ] Return `null` (not throw) when the list is empty or garbage
- [ ] Verify single `apiGet` call per invocation

### FR4: `fetchAndBuildConfig` wiring
- [ ] Capture `avatarTypes` from a successful `/detail` response
- [ ] Call new helpers in sequence: detail → assignments fallback → throw `NotContributorError`
- [ ] **Remove** the userId-only last-resort branch (`auth.ts:155-173`)
- [ ] Re-raise `AuthError` / `NetworkError` from `getProfileDetail` unchanged
- [ ] When `getProfileDetail` throws non-Auth `ApiError`, try `/assignments`; if also fails, throw `NotContributorError([])`
- [ ] Commit: `feat(05-onboarding-defense): defensive onboarding parse and NotContributorError`

### FR5: `useSetup` step + state + branch
- [ ] Extend `OnboardingStep` type with `'not-contributor'`
- [ ] Add `nonContributorRoles: string[] | null` state
- [ ] Expose `nonContributorRoles` on `UseSetupResult`
- [ ] Add `NotContributorError` branch in `_buildConfig` catch block (before `AuthError` branch)
- [ ] On the new branch: `setNonContributorRoles`, `setStep('not-contributor')`, leave `pendingConfig` and `error` null

### FR6: Log call
- [ ] Import `log` from `@/src/lib/log` in `src/hooks/useAuth.ts`
- [ ] Call `log.error('onboarding.not-contributor', err, { avatarTypes: err.avatarTypes })` in the new branch
- [ ] Verify no username/password is passed to the logger

### FR7: `not-contributor.tsx` screen
- [ ] Create `app/(auth)/not-contributor.tsx`
- [ ] Read `nonContributorRoles` via `useOnboarding()`
- [ ] Render three lines of body copy verbatim from FR7 success criteria
- [ ] Render Sign Out button → `clearAll()` + `invalidateAuthToken()` + `router.replace('/(auth)/welcome')`
- [ ] Match dark-background styling to `credentials.tsx`
- [ ] Register route in `app/(auth)/_layout.tsx` with `gestureEnabled: false`

### FR8: `verifying.tsx` branch
- [ ] Add `else if (step === 'not-contributor') router.replace('/(auth)/not-contributor');` branch
- [ ] Commit: `feat(05-onboarding-defense): not-contributor screen and useSetup wiring`

### Integration verification
- [ ] Run full test suite: `npm test`
- [ ] No regression in `__tests__/auth-api.test.ts`, `__tests__/use-setup.test.ts`, `__tests__/auth-screens.test.tsx`

---

## Phase 5.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` (inline if agent dispatch unavailable)
- [ ] All FR success criteria verified in code
- [ ] Interface contracts match implementation (NotContributorError shape, extractConfigFromDetail return type, fetchConfigFromAssignments return type)
- [ ] No scope creep or shortfall (e.g. didn't touch payments-rate-lookup branch)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (or equivalent multi-angle inline review)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes
- [ ] Commit fixes: `fix(05-onboarding-defense): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` on modified tests (inline acceptable)
- [ ] Tighten any weak assertions (e.g. assert exact `avatarTypes` array, not just `not.null`)
- [ ] Re-run tests
- [ ] Commit if changes made: `fix(05-onboarding-defense): strengthen test assertions`

### Final Verification
- [ ] All tests passing (full app suite green)
- [ ] No regressions in existing tests
- [ ] FEATURE.md changelog updated with completion entry
- [ ] ARCHITECTURE.md §5.5 updated to mention the new not-contributor terminal state (if applicable)
- [ ] CROSSOVER_API.md §15.F5 / §15.F6 cross-referenced to spec 05 as resolved

---

## Session Notes

<!-- Add notes as you work -->

**2026-05-28**: Spec drafted. Adopting research's proposed user-visible wording verbatim. `NotContributorError` chosen as a new error class (not a tagged `ApiError`) to align with the existing `errors.ts` convention. The userId-only last-resort branch in `fetchAndBuildConfig` (`auth.ts:155-173`) is being removed because the live probe (F7) confirms it produces a broken dashboard; surfacing `NotContributorError` is strictly more useful. Inherited contracts from specs 03/04 (token cache, error envelope) are consumed but not modified.
