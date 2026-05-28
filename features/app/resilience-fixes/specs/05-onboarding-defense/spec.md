# 05-onboarding-defense

**Status:** Draft
**Created:** 2026-05-28
**Last Updated:** 2026-05-28
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Make the onboarding pipeline (`fetchAndBuildConfig` in `src/api/auth.ts`) robust to the two real-world Crossover API shapes documented by the live probe in `docs/CROSSOVER_API.md` §15:

1. **F5 — pure-manager `/detail` payload.** Accounts with `avatarTypes: ["MANAGER","COMPANY_ADMIN"]` and no `CANDIDATE` avatar receive an entirely different `/detail` response (no top-level `assignment`, no `userAvatars` of type `CANDIDATE`). Today, the code destructures `data.assignment.id` etc. into `undefined`, writes `userId='0'` (or a fallback that also fails), and every downstream timesheet call returns `CROS-0005`. The user sees a generic "Connection failed" message and gets stuck.

2. **F6 — `/assignments` Spring page envelope.** The fallback endpoint `GET /api/v2/teams/assignments?avatarType=CANDIDATE&status=ACTIVE&page=0` returns `{content: [], totalElements, ...}`, not a flat array. The current fallback in `auth.ts:99-109` treats the response as `AssignmentItem[]`; if Crossover ever sends the page envelope here (the captured sample does), `Array.isArray()` is false and the fallback throws `"No active assignment found"` immediately, with no chance to use a populated `content[0]`.

The fix is:
- Introduce a new typed error class `NotContributorError` in `src/api/errors.ts`.
- Treat `detail.assignment` and `detail.userAvatars` as optional in `extractConfigFromDetail`.
- Rewrite `fetchConfigFromAssignments` to read `.content` from a Spring page envelope (with a defensive read of a bare array as a belt-and-suspenders fallback).
- When neither `/detail` nor `/assignments` yields an assignment, throw `NotContributorError(avatarTypes)`.
- In `useSetup`, route `NotContributorError` to a new onboarding screen `app/(auth)/not-contributor.tsx` via a new state `'not-contributor'` on `OnboardingStep`.
- Surface the detected `avatarTypes` on the new screen and offer a "Sign out" button that returns to the welcome route.
- Log the `NotContributorError` event with `avatarTypes` via the spec 08 logger so we can audit how many real users (if any) hit this path.

Everything else (token cache, error envelope parsing, payments lookup, `probeEnvironments`) is unchanged. The pure-manager case is the only new terminal state; all other failures continue to surface as `AuthError`/`NetworkError`/`ApiError` exactly as today.

---

## Out Of Scope

1. **Supporting manager-only mode in Hourglass.** *Descoped.* The app is built around contributor data (hours, AI%, BrainLift, earnings). A manager-only build would be a different product. Showing the approval queue without the rest is not a viable middle ground.

2. **Adapting the timesheet / work-diary / payments calls to a pure-manager account.** *Descoped.* Per F7/F8 in CROSSOVER_API.md §15, none of those endpoints succeed without a candidate role anyway. The defense lives at the onboarding boundary; downstream code paths are not modified.

3. **Reading the manager role from `managerAvatar.id` to populate `managerId` for an admin user.** *Descoped.* Without a candidate role, `managerId` has no semantic meaning in our config. `NotContributorError` short-circuits the build entirely; we never construct a partial config.

4. **A "create a contributor role for me" deep link to Crossover.** *Descoped.* Out of our control; the error screen suggests the user resolve this on `crossover.com`.

5. **Logging `NotContributorError` to a remote service.** *Deferred to 08-observability-log.* Spec 08 already provides the local logger surface (`log.error(category, err, meta)`); this spec wires the call but does not change the log transport.

6. **Probing `/assignments` for the populated-content shape against QA.** *⚠️ Unassigned — known gap.* The QA test account is pure-manager so the captured sample has `content: []`. We have no live evidence of the shape Crossover returns when a contributor *does* have assignments. The defensive code reads `content[0]` *or* `response[0]` as fallback; if a real contributor's response turns out to be yet another shape, that user will surface as `NotContributorError` instead of crashing — acceptable for now, and the log entry will tell us.

7. **Sign-out from the not-contributor screen invalidating the auth-token cache.** *Already done by spec 04.* The screen's "Sign out" button reuses the same path as `app/modal.tsx#handleSignOut` (which calls `invalidateAuthToken()` per spec 04 FR7). If the screen calls `clearAll()` directly without going through the modal path, FR7 must be explicit here — see FR5.

---

## Functional Requirements

### FR1: `NotContributorError` typed error class

A new error class is added to `src/api/errors.ts` representing the terminal state in which onboarding cannot proceed because the account has no contributor (CANDIDATE) role.

**Requirements:**
- Class `NotContributorError extends Error`.
- Constructor signature: `constructor(avatarTypes: string[])`.
- `this.name = 'NotContributorError'`.
- `this.avatarTypes: string[]` — the roles detected on the account (e.g. `['MANAGER', 'COMPANY_ADMIN']`).
- Default `message` includes the avatarTypes joined by `', '` for log readability, e.g. `"Account has no contributor role (found: MANAGER, COMPANY_ADMIN)"`.
- `Object.setPrototypeOf(this, NotContributorError.prototype)` so `instanceof` survives the TypeScript-to-RN transpile (matches the existing pattern in `AuthError` / `ApiError`).

**Success Criteria:**
- [ ] `new NotContributorError([])` returns a value where `instanceof Error` is true.
- [ ] `new NotContributorError(['MANAGER'])` returns a value where `instanceof NotContributorError` is true.
- [ ] `err.name === 'NotContributorError'`.
- [ ] `err.avatarTypes` matches the constructor argument exactly (same identity is not required; same array contents are).
- [ ] `err.message` contains every value in `avatarTypes`.
- [ ] `JSON.stringify(err)` does not leak credentials or any field outside `name`, `message`, `avatarTypes`.

---

### FR2: Defensive `/detail` parsing in `extractConfigFromDetail`

The `extractConfigFromDetail` function in `src/api/auth.ts` is changed to treat `detail.assignment` as optional and to indicate "insufficient data" to the caller rather than producing a config with `'0'` IDs.

**Requirements:**
- The `DetailResponse` interface marks `assignment` as `assignment?: { ... }` (optional).
- The `userAvatars` field stays `userAvatars?:`.
- The function returns `null` (instead of a partial config) when **both** of these are true:
  - `detail.assignment` is `undefined` *or* `detail.assignment.id` is missing/falsy.
  - There is no `CANDIDATE` avatar in `detail.userAvatars` (or `userAvatars` is `undefined`).
- The function continues to return a full config when `detail.assignment` is present **and** has a valid `assignment.id` (existing happy-path behavior is unchanged).
- The function still reads `userId` via `userAvatars[CANDIDATE].id ?? assignment.selection.marketplaceMember.application.candidate.id ?? 0`.
- All field reads from `detail.assignment.*` are guarded by `?.` so an unexpected partial shape (e.g. assignment exists but `team` is missing) cannot throw `TypeError: Cannot read properties of undefined`.

**Success Criteria:**
- [ ] Contributor-shaped `/detail` payload (the existing `makeDetail()` fixture in `__tests__/auth-api.test.ts`) still produces an exact match for the current config output. **Regression guard:** existing happy-path tests in `__tests__/auth-api.test.ts` continue to pass with no fixture changes.
- [ ] Pure-manager `/detail` payload (no `assignment`, no `CANDIDATE` avatar in `userAvatars`) makes `extractConfigFromDetail` return `null`.
- [ ] `/detail` payload with `userAvatars: [{type: 'CANDIDATE', id: 99}]` but **no** `assignment` returns `null` (we need both — a candidate id without team/manager is not a usable config).
- [ ] `/detail` payload with `assignment` present but `assignment.team` undefined returns `null` (rather than throwing).

---

### FR3: Read `/assignments.content` Spring page envelope

The fallback path `fetchConfigFromAssignments` in `src/api/auth.ts` is rewritten to read the response as a Spring page envelope (`{content: AssignmentItem[]}`), with a defensive read of a bare array if Crossover ever changes the shape.

**Requirements:**
- The function calls `apiGet<unknown>` (or a typed page-envelope shape) and reads `.content` from the result.
- If `response.content` is an array, treat that as the assignment list.
- If `response.content` is absent **and** `response` itself is an array, treat `response` as the assignment list (belt-and-suspenders for shape drift).
- If neither yields an array, treat the list as empty.
- If the list is empty, return `null` (instead of throwing `Error('No active assignment found')`).
- If the list has at least one entry, build a partial config from `list[0]` using the existing field-extraction logic.
- Callers (currently only `fetchAndBuildConfig`) interpret `null` as "fallback didn't help" and proceed to the `NotContributorError` branch.

**Success Criteria:**
- [ ] Response `{content: [], totalElements: 0, ...}` makes the function return `null`. No exception is thrown.
- [ ] Response `{content: [validAssignment], totalElements: 1, ...}` makes the function return a config built from `validAssignment`.
- [ ] Response `[validAssignment]` (bare array, legacy shape) still produces a config built from `validAssignment`. No regression vs. today's behavior on a bare-array response.
- [ ] Response `null`, `undefined`, `{}`, or `42` (garbage) makes the function return `null`. No exception.
- [ ] The function does not call `apiGet` more than once per invocation (no pagination loop).

---

### FR4: `fetchAndBuildConfig` throws `NotContributorError` when neither path yields an assignment

`fetchAndBuildConfig` is updated to weave the new helpers together: try `/detail`, then fall back to `/assignments.content`, then if both return `null`, throw `NotContributorError` with the detected `avatarTypes`.

**Requirements:**
- After `getProfileDetail(token, useQA)` succeeds, capture `avatarTypes = detail.avatarTypes ?? []` for later error context.
- Call `extractConfigFromDetail(detail, useQA)`. If non-null, use it (existing happy path).
- If `extractConfigFromDetail` returned `null`, call `fetchConfigFromAssignments(token, useQA, username)`.
- If `fetchConfigFromAssignments` returned `null`, throw `new NotContributorError(avatarTypes)`.
- If `getProfileDetail` itself threw `AuthError`, re-throw (no change to current behavior).
- If `getProfileDetail` threw any other error, attempt `fetchConfigFromAssignments` (preserves current behavior — `/detail` could be down for reasons unrelated to schema). If that also throws or returns null, throw `NotContributorError([])` (we have no avatarTypes to report when `/detail` failed outright).
- The existing "last-resort minimal config built from token userId" branch in `auth.ts:155-173` is **removed**. The probe data (F7) confirms that a userId-only config produces a broken app; surfacing `NotContributorError` is strictly more useful than rendering a dashboard that 400s on every fetch.
- The payments-rate-lookup branch (`auth.ts:176-201`) is unchanged. It still runs after a successful config is built; it is *never* reached when `NotContributorError` is about to be thrown.

**Success Criteria:**
- [ ] Contributor `/detail` payload → returns a `CrossoverConfig`. No `/assignments` call is made.
- [ ] Pure-manager `/detail` payload + `/assignments` returning `{content: []}` → throws `NotContributorError` whose `avatarTypes` equals `['MANAGER', 'COMPANY_ADMIN']`.
- [ ] Pure-manager `/detail` payload + `/assignments` returning `{content: [validAssignment]}` → returns a `CrossoverConfig` built from the fallback assignment.
- [ ] `getProfileDetail` throws `AuthError(401)` → `AuthError(401)` propagates out unchanged. No `NotContributorError` is thrown.
- [ ] `getProfileDetail` throws `NetworkError` → `NetworkError` propagates out unchanged.
- [ ] `getProfileDetail` throws non-Auth `ApiError(500)` → `/assignments` is attempted. If `/assignments` also throws, `NotContributorError([])` is thrown. (Today, the code would silently return a userId-only config — that branch is removed.)
- [ ] `getProfileDetail` throws non-Auth `ApiError(500)` and `/assignments` returns `{content: [validAssignment]}` → returns a config from the fallback.

---

### FR5: `useSetup` routes `NotContributorError` to the new `'not-contributor'` step

The `useSetup` hook in `src/hooks/useAuth.ts` adds a new step `'not-contributor'`, a new piece of state for `nonContributorRoles`, and an error-branch handler for `NotContributorError`.

**Requirements:**
- Extend the `OnboardingStep` type with `'not-contributor'`.
- Add a piece of state: `nonContributorRoles: string[] | null` (default `null`).
- Add an exported field to `UseSetupResult`: `nonContributorRoles: string[] | null`.
- In `_buildConfig`'s catch block, add a branch **before** the existing `AuthError` branch:
  - If `err instanceof NotContributorError`: `setNonContributorRoles(err.avatarTypes)`, `setStep('not-contributor')`, `setError(null)`, and **call `log.error('onboarding.not-contributor', err, { avatarTypes: err.avatarTypes })`** (per FR6).
  - Do **not** call `setPendingConfig(...)` in this branch. The user must sign out / re-onboard; there is no partial config.
- Adding `NotContributorError` to the catch chain does **not** change behavior for the other branches (`AuthError`, `NetworkError`, `ApiError`, generic).

**Success Criteria:**
- [ ] `_buildConfig` catching a `NotContributorError(['MANAGER','COMPANY_ADMIN'])` sets `step === 'not-contributor'` and `nonContributorRoles === ['MANAGER','COMPANY_ADMIN']`.
- [ ] On `NotContributorError`, `pendingConfig` is `null` (not a stub config).
- [ ] On `NotContributorError`, `error` is `null` (the screen renders the roles, not a generic error banner).
- [ ] On `AuthError(401)`, behavior is unchanged: `step === 'credentials'`, `error === 'Invalid email or password.'`, `nonContributorRoles === null`.
- [ ] On generic non-typed `Error`, behavior is unchanged.

---

### FR6: Local error log entry on `NotContributorError`

The `useSetup` `NotContributorError` branch writes a redacted log event via the spec 08 logger so we can audit how often real users hit this path.

**Requirements:**
- Import `log` from `@/src/lib/log` in `src/hooks/useAuth.ts`.
- In the `NotContributorError` branch, call `log.error('onboarding.not-contributor', err, { avatarTypes: err.avatarTypes })`.
- The category string is `'onboarding.not-contributor'` (kebab-case, consistent with other log categories in the codebase per spec 08's redactor whitelist).
- `avatarTypes` is the only field passed in meta. Username, password, email are never passed to the logger from this code path.

**Success Criteria:**
- [ ] When `NotContributorError(['MANAGER'])` is caught in `_buildConfig`, `log.error` is called exactly once with `category === 'onboarding.not-contributor'`, the error itself as the second arg, and `meta.avatarTypes === ['MANAGER']`.
- [ ] No call to `log.error` references `pendingCredentials`, `username`, or `password`.
- [ ] When `AuthError` is caught (existing branch), `log.error` is **not** called (we don't want to spam the log on every typo).

---

### FR7: `not-contributor.tsx` onboarding screen + route registration

A new screen at `app/(auth)/not-contributor.tsx` renders the terminal "no contributor role" state, lists the detected roles, and offers a "Sign out" action that returns the user to the welcome route.

**Requirements:**
- New file `app/(auth)/not-contributor.tsx`.
- Uses `useOnboarding()` to read `nonContributorRoles`.
- Renders three lines of body copy (verbatim, per the wording decision in spec-research §3):
  1. `Hourglass tracks contributor activity — hours, AI usage, and earnings.`
  2. `Your Crossover account has these roles: ${nonContributorRoles.join(', ') || 'unknown'}.`
  3. `To use Hourglass, you'll need a Crossover Candidate (contributor) role. Resolve this on crossover.com, then sign back in.`
- Renders a sign-out button (label: `Sign Out`) that:
  - Calls `clearAll()` from `src/store/config`.
  - Calls `invalidateAuthToken()` from `src/api/client` (spec 04 FR7 contract — match the modal's `handleSignOut`).
  - Calls `router.replace('/(auth)/welcome')`.
  - Note: the not-contributor user has no push token registered yet (we haven't passed the splash gate that calls `registerPushToken`), so `unregisterPushToken()` is not required. If called for consistency with `app/modal.tsx`, it must be wrapped in `.catch(() => {})` per existing pattern.
- Register the route in `app/(auth)/_layout.tsx` with `gestureEnabled: false` (the user should not be able to swipe back to the credentials screen and get stuck in a loop).
- The screen's visual style matches the existing auth screens (`credentials.tsx` design language — dark background, padding, body-text color tokens). Pixel-perfect Figma compliance is not required; readability is.

**Success Criteria:**
- [ ] When the route renders with `nonContributorRoles = ['MANAGER', 'COMPANY_ADMIN']`, the text `MANAGER, COMPANY_ADMIN` appears on screen.
- [ ] When `nonContributorRoles` is `null` or `[]`, the screen still renders without crashing; it shows `unknown` in place of the roles list.
- [ ] Pressing "Sign Out" triggers `clearAll()` and `invalidateAuthToken()` and navigates to `/(auth)/welcome`.
- [ ] The route is registered in `_layout.tsx` and `router.replace('/(auth)/not-contributor')` from elsewhere does not crash.
- [ ] No `Stack.Screen` `back` gesture is enabled for this route.

---

### FR8: `verifying.tsx` navigation to the new step

The `app/(auth)/verifying.tsx` screen's step-driven `useEffect` adds a branch that navigates to `/(auth)/not-contributor` when `step === 'not-contributor'`.

**Requirements:**
- Add a branch to the existing `useEffect`:
  ```
  } else if (step === 'not-contributor') {
    router.replace('/(auth)/not-contributor');
  }
  ```
- Position: after the existing `'credentials'` branch.
- The existing branches (`success`, `setup`, `env-select`, `credentials`) are unchanged.

**Success Criteria:**
- [ ] When `useSetup` transitions `step` from `'verifying'` to `'not-contributor'`, `router.replace` is called with `/(auth)/not-contributor`.
- [ ] Other step transitions are unchanged (regression guard via existing `verifying` tests if present).

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `src/api/auth.ts` (lines 9–25, 57–89, 95–128, 134–210) | Primary edit target: DetailResponse type, extractConfigFromDetail, fetchConfigFromAssignments, fetchAndBuildConfig. |
| `src/api/errors.ts` | Add `NotContributorError`. Mirror the existing class pattern. |
| `src/api/client.ts` (lines 8–185) | `apiGet` signature + error-envelope behavior from specs 03/04 — used as-is, no changes. |
| `src/hooks/useAuth.ts` | Add `'not-contributor'` step, `nonContributorRoles` state, error-branch handler, log call. |
| `src/contexts/OnboardingContext.tsx` | Reads `UseSetupResult`; no edit needed — the new `nonContributorRoles` flows through automatically. |
| `app/(auth)/_layout.tsx` | Register the new route. |
| `app/(auth)/verifying.tsx` | Add the navigation branch. |
| `app/(auth)/credentials.tsx` | Style reference for the new screen. |
| `app/modal.tsx` (lines 47–68) | Sign-out reference pattern (`clearAll` + `invalidateAuthToken` + `router.replace`). |
| `src/lib/log.ts` | `log.error(category, err, meta)` signature from spec 08. |
| `docs/api-samples/02-user-detail.json` | F5 evidence — pure-manager payload, no `assignment`. |
| `docs/api-samples/03-assignments.json` | F6 evidence — Spring page envelope. |
| `docs/CROSSOVER_API.md` §15.F5, §15.F6, §15.F7, §15.F8 | Live-probe documentation. |
| `__tests__/auth-api.test.ts` | Regression-guard fixture for the contributor happy path. |
| `__tests__/use-setup.test.ts` | Regression-guard fixture for `useSetup` error branches. |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/api/errors.ts` | modify | Add `NotContributorError` class. |
| `src/api/auth.ts` | modify | Defensive parsing, page envelope read, throw `NotContributorError`. Remove the userId-only fallback branch. |
| `src/hooks/useAuth.ts` | modify | New step + state, catch-branch for `NotContributorError`, `log.error` call. |
| `app/(auth)/_layout.tsx` | modify | Register `not-contributor` route with `gestureEnabled: false`. |
| `app/(auth)/verifying.tsx` | modify | Add navigation branch for `step === 'not-contributor'`. |
| `app/(auth)/not-contributor.tsx` | **create** | New onboarding screen. |
| `__tests__/auth-api.test.ts` | modify | Add tests for FR2, FR3, FR4. |
| `__tests__/errors.test.ts` | modify | Add tests for FR1 (`NotContributorError` shape). |
| `__tests__/use-setup.test.ts` | modify | Add tests for FR5, FR6 (error branch + log call). |
| `__tests__/auth-screens.test.tsx` | modify | Add render + sign-out tests for `not-contributor.tsx` (FR7). |

### Data Flow

```
Credentials submitted (credentials.tsx)
   │
   ▼
useSetup.submitCredentials → probeEnvironments → _buildConfig
   │
   ▼
fetchAndBuildConfig(username, password, useQA)
   │
   ├─→ getAuthToken (spec 04 cache)
   │
   ├─→ getProfileDetail
   │      │
   │      ├─ contributor shape → extractConfigFromDetail → CrossoverConfig ✓
   │      │
   │      └─ pure-manager shape (no assignment, no CANDIDATE avatar)
   │             │
   │             ▼
   │      fetchConfigFromAssignments → reads .content (page envelope)
   │             │
   │             ├─ content[0] present → CrossoverConfig ✓
   │             │
   │             └─ content empty / response empty
   │                    │
   │                    ▼
   │             throw NotContributorError(avatarTypes)
   │
   ▼
useSetup._buildConfig catch block
   │
   ├─ AuthError      → step='credentials', error='Invalid email or password.'
   ├─ NetworkError   → step='credentials', error='Connection failed.'
   ├─ ApiError       → step='setup' with stub config (unchanged from today)
   ├─ NotContributorError (NEW)
   │      │
   │      ▼
   │   log.error('onboarding.not-contributor', err, {avatarTypes})
   │   setNonContributorRoles(err.avatarTypes)
   │   setStep('not-contributor')
   │
   └─ generic        → step='credentials', error='An unexpected error occurred.'
                            │
                            ▼
                  verifying.tsx useEffect on step
                            │
                            ▼
                  router.replace('/(auth)/not-contributor')
                            │
                            ▼
                  not-contributor.tsx renders avatarTypes + Sign Out
                            │
                            ▼
                  user taps Sign Out
                            │
                            ▼
                  clearAll() + invalidateAuthToken() + router.replace('/(auth)/welcome')
```

### Edge Cases

| Case | Handling |
|------|----------|
| `/detail` returns valid contributor payload | Existing happy path. `fetchConfigFromAssignments` is not called. (Regression guard) |
| `/detail` 401 | `AuthError(401)` propagates. `useSetup` shows credentials screen with "Invalid email or password." (No change from today.) |
| `/detail` returns 500 with HTML body | Spec 04 maps to `AuthError(401, AUTH_HTML_500)`. Propagates. (No change.) |
| `/detail` returns malformed JSON | Spec 04's `handleStatus` already covers this. Propagates as `ApiError` whose envelope is undefined. `fetchAndBuildConfig` falls into the `/assignments` fallback branch. |
| `/detail` payload has `assignment` but `assignment.id` is `0` | Treated as missing — falls through to `/assignments` fallback. (Aligns with "valid assignment.id" requirement in FR2.) |
| `/detail` payload has `userAvatars: [{type: 'CANDIDATE', id: 99}]` but no `assignment` | Returns `null` from `extractConfigFromDetail`; falls back to `/assignments`. If `/assignments` succeeds, that's the config. If not, `NotContributorError`. |
| `/detail` payload has `assignment` but missing `team`, `manager`, or `selection` | `extractConfigFromDetail` returns `null` (does not throw). Falls back to `/assignments`. |
| `/assignments` returns 401 | `AuthError` propagates from `apiGet`. Bubbles to `useSetup`'s `AuthError` branch — credentials screen. |
| `/assignments` returns 5xx | Throws `ApiError` from `apiGet`. Bubbles to `fetchAndBuildConfig`. **Behavior change:** today this would land on the userId-only fallback branch; per FR4 that branch is removed, so the error becomes `NotContributorError([])` (we don't have avatarTypes if `/detail` also failed). The user sees the not-contributor screen with `roles: unknown`. This is acceptable — better than a userId-only config that 400s on every fetch. Logged via spec 08 so we can detect if this fires often. |
| `/assignments` returns `{content: null}` | Treated as empty list — returns `null` from `fetchConfigFromAssignments`. |
| `/assignments` returns `{content: [validAssignment]}` | Build a config from `validAssignment`. Happy path for the fallback. |
| `nonContributorRoles` is `null` when the screen renders | Show `unknown` in place of the roles list (defensive — should not happen via the normal flow, but possible if the user deep-links to the route somehow). |
| User signs out from `not-contributor.tsx` and re-onboards with a different account | Standard `clearAll` flow. New account passes through the full pipeline; if it's a contributor, lands on dashboard. |
| User signs out from `not-contributor.tsx` while the auth token is still valid for the manager account | `invalidateAuthToken()` drops the in-memory cache. Next sign-in mints a fresh token. (Spec 04 contract.) |
| App is killed before user taps "Sign Out" | On next launch, `useConfig` returns null (we never called `saveConfig`), so the auth gate at `app/_layout.tsx:135-143` re-routes to `/welcome`. The not-contributor state is not persisted across launches — by design. |

---

## Dependencies

### Internal
- Spec 03 (error-envelope): consumed via `ApiError.envelope` — no edits to that surface.
- Spec 04 (auth-resilience): consumed via `invalidateAuthToken()` on sign-out; `getProfileDetail` benefits from the cached token. No edits to spec 04 surfaces.
- Spec 08 (observability-log): consumed via `log.error(category, err, meta)`. No edits to spec 08 surfaces.

### External
- No new packages.
- `expo-router` (already present) — new route only.

### Assumptions
- `detail.avatarTypes` is always present in a successful `/detail` response, even on the pure-manager schema. **Verified:** the sample at `docs/api-samples/02-user-detail.json` has `"avatarTypes": ["MANAGER", "COMPANY_ADMIN"]` at the top level. If a real account ever omits this field, `NotContributorError([])` is thrown — degrades gracefully.
- `/assignments` will *eventually* return a page envelope on the contributor side too (we have no sample to confirm). The defensive bare-array fallback covers the case where it does not.
- The spec 08 logger is safe to import from a hook (no React lifecycle constraints). **Verified:** `src/lib/log.ts` exports a module-scope singleton with no React dependencies.
- Removing the userId-only last-resort branch in `fetchAndBuildConfig` does not regress any user. **Verified:** per F7 in CROSSOVER_API.md §15, none of the timesheet strategies succeed with a userId-only config — that branch was already producing a broken app.
