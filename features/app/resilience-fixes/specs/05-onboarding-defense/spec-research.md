# Spec 05 — Onboarding defense (pure-manager schema + pagination envelope)

**Status:** Research complete
**Complexity:** M
**Combines:** F5 (pure-manager `/detail` schema) + F6 (`/assignments` Spring pagination envelope) from `docs/CROSSOVER_API.md` §15.

## Problem context

### F5: Pure-manager `/detail` payload silently breaks onboarding

Live probe captured a real example: the QA manager account `(avatarTypes: ["MANAGER","COMPANY_ADMIN"])` returns from `/api/identity/users/current/detail` a **completely different schema** than the documented contributor shape:

```json
{
  "applications": {
    "MANAGER": [
      {"name": "Activities", "identifier": "ACTIVITIES", "enabled": true, "appUserType": "TEAM"},
      ...
    ]
  },
  "managerAvatar": { ... },
  "id": 765054,
  "fullName": "<REDACTED>",
  "userAvatars": [{"id": 1421271, "type": "COMPANY_ADMIN"}]
}
```

No top-level `assignment`. No `CANDIDATE` avatar.

Today, `src/api/auth.ts:62-67` destructures `data.assignment.id`, `data.assignment.team.id`, etc. These all become `undefined`. The code happily writes `config.userId = undefined`, then every downstream timesheet/diary call fails with `CROS-0005 "userId is not a valid value"` and the user sees an unhelpful "Connection failed" message.

**Severity:** unknown population. The QA test account is the only confirmed example. Real users may or may not exist in this shape.

### F6: `/assignments` returns a Spring page envelope

`/api/v2/teams/assignments` returned:

```json
{
  "content": [],
  "last": true,
  "totalElements": 0,
  "totalPages": 1,
  "first": true,
  ...
}
```

Not a flat array. The current fallback code in `auth.ts:151-157` should be re-checked to confirm it reads `.content`.

## Exploration findings

- `src/api/auth.ts:9-25` defines `DetailResponse` interface assuming `assignment` is always present.
- `fetchAndBuildConfig` (`auth.ts:134-210`) extracts IDs without null-checking, then writes them to `CrossoverConfig`.
- If `assignment` is missing, the code falls back to `/api/v2/teams/assignments` (`auth.ts:151-157`), but if **that** also returns no assignment (pure-manager case), there's no further fallback.
- The current `auth.ts` paths haven't been read end-to-end against the F5 sample; the actual code path for "no assignment found anywhere" needs verification during implementation.
- `useSetup` (`src/hooks/useAuth.ts`) handles the high-level state machine; if `fetchAndBuildConfig` throws, the user lands on the credentials screen with a generic error.

## Key decisions

**1. Detect "no-contributor account" early and surface a clear error.** Don't try to fake an assignment. If `userAvatars` lacks a `CANDIDATE` entry AND `/assignments` returns `content: []`, the user is a pure manager / admin. Hourglass is contributor-focused; they can't use it.

Surface: an explicit error class `NotContributorError` and an onboarding screen that says "Hourglass requires a contributor (Candidate) role on your Crossover account. Your account has [MANAGER/COMPANY_ADMIN] roles only."

**2. Always read `/assignments.content`, not the response root.** Update `auth.ts:151-157` to destructure `{ content }` and treat `content[0]` as the assignment (if present). Adds defense against both no-content and shape drift.

**3. Defensive parsing for `/detail`.** Treat `data.assignment` as optional. Treat `data.userAvatars` as optional. The successful path requires both; missing either flips to the fallback `/assignments`, and if that also yields nothing, throw `NotContributorError`.

**4. Don't try to support manager-only mode in Hourglass.** Out of scope. The app is built around contributor data (hours, AI%, BrainLift, etc.). Showing only the approval queue without the rest would be a different product. Clear error is the right answer.

**5. Capture extra detail in error log.** When `NotContributorError` fires, write the detected `avatarTypes` to the local error log (spec 08) so we can confirm if real users hit it.

## Interface contracts

### New error class

```typescript
// src/api/errors.ts
export class NotContributorError extends Error {
  avatarTypes: string[];
  constructor(avatarTypes: string[]) {
    super(`Account has no contributor role (found: ${avatarTypes.join(', ')})`);
    this.name = 'NotContributorError';
    this.avatarTypes = avatarTypes;
  }
}
```

### Modified `fetchAndBuildConfig`

```typescript
async function fetchAndBuildConfig(username, password, useQA): Promise<CrossoverConfig> {
  const token = await getAuthToken(username, password, useQA);
  // ... (existing token unpacking)

  const detail = await getProfileDetail(token, useQA);
  const avatarTypes: string[] = detail.avatarTypes ?? [];
  const candidate = detail.userAvatars?.find((a) => a.type === 'CANDIDATE');
  const candidateFromSelection = detail.assignment?.selection?.marketplaceMember?.application?.candidate;

  let assignment = detail.assignment ?? null;
  let userId = candidate?.id ?? candidateFromSelection?.id ?? null;

  // Fallback to /assignments if /detail didn't yield what we need
  if (!assignment || !userId) {
    const page = await fetchAssignmentsPage(token, useQA);   // returns { content: [...] }
    const firstAssignment = page.content?.[0];
    if (firstAssignment) {
      assignment ??= firstAssignment;
      userId ??= firstAssignment.selection?.marketplaceMember?.application?.candidate?.id;
    }
  }

  if (!assignment || !userId) {
    throw new NotContributorError(avatarTypes);
  }

  // Existing path continues with valid assignment + userId
  return { /* ... */ };
}
```

### `useSetup` handling

```typescript
// src/hooks/useAuth.ts
try {
  const config = await fetchAndBuildConfig(...);
  setStep('success');
} catch (err) {
  if (err instanceof NotContributorError) {
    setStep('not-contributor');
    setNonContributorRoles(err.avatarTypes);
  } else if (err instanceof AuthError) {
    setStep('credentials');
    setError('Invalid email or password.');
  } else {
    setStep('credentials');
    setError('Something went wrong. Please try again.');
  }
}
```

### New onboarding screen

`app/(auth)/not-contributor.tsx`:

```typescript
export default function NotContributorScreen() {
  const { nonContributorRoles } = useOnboarding();
  return (
    <View>
      <Text>Hourglass tracks contributor activity (hours, AI usage, earnings).</Text>
      <Text>Your account has these roles: {nonContributorRoles.join(', ')}.</Text>
      <Text>To use Hourglass, you'll need a Crossover Candidate role.</Text>
      <Button onPress={signOut}>Sign out</Button>
    </View>
  );
}
```

## Test plan

### Unit tests (`__tests__/onboarding-defense.test.ts`, new)

**F5 scenarios:**
- [ ] `/detail` returns CANDIDATE schema with assignment → config built normally, no fallback called.
- [ ] `/detail` returns pure-manager schema (no `assignment`, only `MANAGER`+`COMPANY_ADMIN` in `avatarTypes`) → `/assignments` fallback called.
- [ ] `/assignments` returns `{content: [contributorAssignment]}` → config built from fallback.
- [ ] `/assignments` returns `{content: []}` → throws `NotContributorError` with the avatarTypes.
- [ ] `NotContributorError.avatarTypes` is correctly populated.

**F6 scenarios:**
- [ ] `fetchAssignmentsPage` returns `{content: [], totalElements: 0, ...}` → empty array handled, no crash.
- [ ] Old-shape response (flat array) → defensive code reads `.content ?? response` to avoid breaking if Crossover ever changes the response shape. (Optional belt-and-suspenders.)

**Edge cases:**
- [ ] `/detail` returns `{userAvatars: [{type: "CANDIDATE", id: 99}], /* no assignment */}` → `/assignments` fallback called, succeeds, uses CANDIDATE id from `/detail`.
- [ ] `/detail` 5xx → propagates AuthError or ApiError (not our problem here).
- [ ] `getProfileDetail` throws AuthError → propagates (spec 04 handles retry).

### Live-QA probe extension

Extend `scripts/probe-crossover-api.mjs`:

```javascript
async function verifyOnboardingDefense() {
  // Confirm /assignments envelope shape on QA
  const a = await fetch(`${BASE}/api/v2/teams/assignments?avatarType=CANDIDATE&status=ACTIVE&page=0`, {
    headers: { 'x-auth-token': token },
  });
  const body = await a.json();
  assert('content' in body, '/assignments does not have content field');
  assert('totalElements' in body, '/assignments does not have totalElements');
  console.log(`  /assignments envelope verified: totalElements=${body.totalElements}`);
}
```

If we ever get a contributor QA account, extend to verify the contributor `/detail` shape too.

### TestFlight scenario

- [ ] Sign in with the QA manager account (`user_765054@example.com`). Verify: `not-contributor.tsx` screen renders with `["MANAGER", "COMPANY_ADMIN"]` listed. Sign-out button works.
- [ ] Sign in with a real contributor account. Verify: skips the not-contributor screen, lands on the dashboard.

### Error log

- [ ] Spec 08 logs `NotContributorError` with `avatarTypes` so we can audit over time if real users hit it.

## Files to reference

| File | Why |
|---|---|
| `src/api/auth.ts:9-89, 134-210` | Primary edit: defensive parsing + fallback flow. |
| `src/api/errors.ts` | Add `NotContributorError`. |
| `src/hooks/useAuth.ts` | Handle the new error class in `useSetup`. |
| `src/contexts/OnboardingContext.tsx` | May need a new state for "not-contributor" + `nonContributorRoles`. |
| `app/(auth)/_layout.tsx` | Register new route. |
| `app/(auth)/not-contributor.tsx` | **New file.** |
| `docs/api-samples/02-user-detail.json` | The F5 evidence — pure-manager payload. |
| `docs/api-samples/03-assignments.json` | The F6 evidence — Spring pagination envelope. |
| `docs/CROSSOVER_API.md` §15.F5, §15.F6 | Doc context. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit | ✓ | New `__tests__/onboarding-defense.test.ts`. |
| Live-QA probe | ✓ | `verifyOnboardingDefense()` extension. |
| TestFlight | ✓ | Pure-manager sign-in scenario (QA creds). |
| Error log | ✓ | `NotContributorError` events captured for audit. |

## Risks

- **The QA-fixture might be artificial.** If no real production user is in this state, the new error screen is dead UI. Acceptable — better than the silent cascade we have today.
- **`/assignments` page envelope is unconfirmed shape under load.** All probe results show empty content. Need to validate when we get a populated QA contributor account.
