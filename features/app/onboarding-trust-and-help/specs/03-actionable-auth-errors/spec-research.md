# Spec 03 — Actionable auth error messages

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

`src/hooks/useAuth.ts`'s `useSetup` already distinguishes several error cases reasonably well inside `_buildConfig`'s catch block (`AuthError` → "Invalid email or password.", `NetworkError` → "Connection failed...", `NotContributorError` → dedicated terminal screen). **But the actual gap is one level up, in `submitCredentials` itself** (`src/hooks/useAuth.ts:123-127`):

```typescript
try {
  const probe = await probeEnvironments(username, password);
  ...
} catch (err) {
  setStep('credentials');
  setError('Connection failed. Please check your network and try again.');
}
```

This catch block treats **any** error thrown by `probeEnvironments` — a real network failure, a malformed-request `ApiError`, an unexpected exception — as "Connection failed," even when the underlying cause has nothing to do with connectivity. A user whose account has some other server-side issue (e.g. a `CROS-XXXX` validation error, now available via `resilience-fixes` spec 03's structured envelope) sees "check your network" and reasonably tries again on the same wifi, gets the same wrong message, and gives up or emails support confused.

Additionally, `_buildConfig`'s `ApiError` branch (`useAuth.ts:78-87`) doesn't show the user *any* error — it silently proceeds to the manual hourly-rate setup screen with a zeroed-out config. This may be intentional graceful degradation for some `ApiError` cases, but it means a real validation failure (bad `errorCode`) is invisible to the user.

## Exploration findings

- `src/api/errors.ts` (from `resilience-fixes` specs 03/04): `AuthError` and `ApiError` both carry `errorCode?: string`, and `ApiError` also carries `errorType?: string` and `serverText?: string` from the structured Crossover envelope (`CROS-XXXX` codes). This data already exists on caught errors — it's just not consulted in the credentials-screen error copy.
- `probeEnvironments` (in `src/api/auth.ts`) is what `submitCredentials` calls first — need to read its actual throw conditions to know what errors legitimately reach that outer catch (it may already handle most cases internally and only let genuine network failures escape — needs verification during spec-writing, not assumed here).
- `NotContributorError` already gets a dedicated screen (`app/(auth)/not-contributor.tsx`) — good precedent for "give the user something actionable, not a generic string."
- The error banner UI itself (`app/(auth)/credentials.tsx:57-61`) is a single `<Text>` — no room for a "try again" vs "contact support" distinction unless the spec adds a secondary action.

## Key decisions

**1. Fix the outer `submitCredentials` catch first — that's the actual generic-message bug.** Import the same `AuthError`/`NetworkError`/`ApiError` branching pattern already used in `_buildConfig` into this catch block, so a non-network `ApiError` thrown during environment probing gets an error-code-aware message instead of a blanket "Connection failed."

**2. For `ApiError` with a known `errorCode`, show `serverText` if it's on record as user-safe.** Per `resilience-fixes` spec 03's decision, `serverText` isn't universally safe to display (some codes are internal-reference-only). This spec needs a small allow-list mapping `errorCode` → safe-to-show flag, mirroring the codes table already documented in `resilience-fixes` spec 03 (`CROS-0002` forbidden, `CROS-0005` validation with safe text, `CROS-0400` generic — not safe). Unknown/unmapped codes fall back to a generic-but-honest message ("Something went wrong on Crossover's end. Try again in a moment.") rather than "check your network," which is specifically wrong for a server-side issue.

**3. `_buildConfig`'s silent `ApiError` → setup-screen fallback stays as-is for its existing purpose (hourly-rate entry when the API can't supply one) but should log via `log.warn` (per `observability-and-reliability` spec 01's call-site wiring, if that lands first) so at least the debug log has a record even when the UI shows no error.** This spec should add the log call regardless of whether spec 01 has landed — it's a one-line addition, no dependency.

**4. No new screens.** This stays within the existing error-banner UI on `credentials.tsx` — just better message selection logic in the hook.

## Interface contracts

```typescript
// src/hooks/useAuth.ts — submitCredentials catch block, revised
} catch (err) {
  setStep('credentials');
  setError(describeAuthError(err));
} finally {
  setIsLoading(false);
}

// src/lib/authErrorMessages.ts (new, or co-located in useAuth.ts if small enough)
export function describeAuthError(err: unknown): string;
// AuthError -> 'Invalid email or password.'
// NetworkError -> 'Connection failed. Please check your network and try again.'
// ApiError with known-safe errorCode -> serverText (or a curated message per code)
// ApiError with unknown/unsafe errorCode -> 'Something went wrong on Crossover's end. Try again in a moment.'
// anything else -> 'An unexpected error occurred. Please try again.'
```

## Test plan

- [ ] `submitCredentials` — `probeEnvironments` throws `NetworkError` → error is "Connection failed...".
- [ ] `submitCredentials` — `probeEnvironments` throws `ApiError` with a known-safe `errorCode` → error message reflects the server's validation text, NOT "Connection failed."
- [ ] `submitCredentials` — `probeEnvironments` throws `ApiError` with an unknown/unsafe `errorCode` → generic-but-accurate server-error message, still not "Connection failed."
- [ ] `submitCredentials` — `probeEnvironments` throws a plain `Error` (unexpected) → falls back to the existing generic message.
- [ ] `_buildConfig`'s `ApiError` branch — a `log.warn`/`log.error` call fires with `{errorCode, statusCode}` meta (no message/serverText per the redactor's deny-list).
- [ ] No regression to existing `AuthError`/`NetworkError`/`NotContributorError` branches in `_buildConfig` — same messages as today.

## Files to reference

| File | Why |
|---|---|
| `src/hooks/useAuth.ts:56-129` | The two catch blocks (`_buildConfig`, `submitCredentials`) — the second is this spec's actual target. |
| `src/api/errors.ts` | `AuthError`/`ApiError`/`NetworkError` shape, `errorCode`/`errorType`/`serverText` fields. |
| `src/api/auth.ts` (`probeEnvironments`) | Need to confirm exactly which errors can escape to `submitCredentials`'s catch — read before writing the spec's FRs. |
| `features/app/resilience-fixes/specs/03-error-envelope/spec-research.md` | The `errorCode` table (`CROS-0002`, `CROS-0005`, `CROS-0400`) and the "serverText is not universally safe" decision this spec must respect. |
| `app/(auth)/credentials.tsx:57-61` | The error banner UI — confirm no changes needed beyond the message string itself. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | `describeAuthError` branch coverage, `useSetup` hook integration tests |
| Live-QA probe | ✗ | Reuses `resilience-fixes` spec 03's already-validated envelope shape; no new endpoint probing needed |
| TestFlight | ✓ | Trigger a real bad-password attempt and (if reproducible) a validation-error attempt against QA; confirm distinct, accurate messages |
| Error log | ✓ | Confirms the new `log.warn` call in `_buildConfig`'s `ApiError` branch fires with safe fields only |
