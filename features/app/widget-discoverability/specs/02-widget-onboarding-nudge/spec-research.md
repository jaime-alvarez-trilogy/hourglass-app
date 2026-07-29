# Spec 02 — Post-setup widget nudge screen

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent, but should reference the accessory families spec 01 ships)
**Blocked By:** 01 (nudge copy should mention lock-screen widgets, so it should land after 01's `supportedFamilies` change is in)

## Problem context

`app/(auth)/success.tsx` is the last onboarding screen — `handleGoToDashboard` (line 36) saves config/credentials and calls `router.replace('/(tabs)')` directly (line 46). There is no step anywhere that tells a new user the widget exists. iOS widgets require a long-press → "Edit Home Screen" → "+" → find app → choose size flow that has zero discoverability without either prior iOS familiarity or an explicit prompt — confirmed nothing in the onboarding stack (`welcome`, `credentials`, `verifying`, `env-select`, `setup`, `success`, `not-contributor` — full list from `app/(auth)/_layout.tsx`) mentions widgets at all.

## Exploration findings

- The natural insertion point is between `success.tsx`'s "Go to Dashboard" action and the actual navigation to `/(tabs)` — a new screen shown exactly once, after account setup completes, before the user reaches the main app.
- `success.tsx` already has the config-saving logic finished by the time the user would see a nudge — so the nudge screen doesn't need any of `pendingConfig`/`pendingCredentials`, just a "got it, take me to the dashboard" exit.
- iOS provides no programmatic "add this widget for me" API — the most an app can do is visually demonstrate (screenshot/illustration of the long-press flow) and instruct, then let the user do it manually in Settings/Home Screen — this is a real platform constraint, not a design choice to relax later.
- No persisted "have I seen the nudge" flag is needed if the screen is inserted directly into the one-time onboarding stack (it naturally shows once per fresh onboarding, same reasoning as `onboarding-trust-and-help` spec 01's welcome-screen expansion) — simpler than `distribution-and-sharing` spec 03's changelog banner, which needs persistence because it re-triggers on future version bumps. This screen does not re-trigger; it's a stack step.
- Existing dark/gradient visual language (`GradientButton`, `springBouncy` from `success.tsx`) should carry over for consistency.

## Key decisions

**1. New route `app/(auth)/add-widget.tsx`, inserted into the `Stack` in `app/(auth)/_layout.tsx` between `success` and the exit to `/(tabs)`.** `success.tsx`'s `handleGoToDashboard` changes its final `router.replace('/(tabs)')` to `router.replace('/(auth)/add-widget')`; the new screen's own CTA does the actual `router.replace('/(tabs)')`.

**2. Content: a short static illustration/instructions + two mentions — home screen AND lock screen (referencing spec 01's now-declared accessory families) — plus a "Skip for now" / "Got it" exit that's the same action either way (there's nothing to "skip" since this screen doesn't do anything but inform; both buttons just navigate to `/(tabs)`).** Keep it a single screen, not a multi-step carousel — proportionate to the actual content (a couple of sentences + maybe one illustrative image).

**3. No new dependency for the illustration** — either a static image asset (matching the existing `assets/images/icon.png` pattern used in `welcome.tsx`) or a simple text-based step list ("1. Long-press your Home Screen  2. Tap the + in the corner  3. Search 'Hourglass'  4. Choose a size and add it"). Decide the exact visual treatment during `spec.md` drafting; text-first is the safer default given no existing illustration asset exists yet.

**4. Mentions lock-screen widgets explicitly in copy** (e.g. "You can also add a compact version to your Lock Screen") — this is why the spec is blocked on 01: referencing a feature that isn't actually installable yet would be misleading.

## Interface contracts

```tsx
// app/(auth)/add-widget.tsx (new)
export default function AddWidgetScreen() {
  const router = useRouter();
  function handleContinue() {
    router.replace('/(tabs)');
  }
  return (
    // static instructional content + GradientButton "Got it" -> handleContinue
  );
}

// app/(auth)/_layout.tsx — add one Stack.Screen entry
<Stack.Screen name="add-widget" />

// app/(auth)/success.tsx — change final navigation target
router.replace('/(auth)/add-widget'); // was '/(tabs)'
```

## Test plan

- [ ] `success.tsx`'s `handleGoToDashboard` navigates to `/(auth)/add-widget` (not directly to `/(tabs)`) after a successful save.
- [ ] `add-widget.tsx` renders the instructional content, including a lock-screen mention.
- [ ] Tapping the CTA on `add-widget.tsx` navigates to `/(tabs)`.
- [ ] Regression: `success.tsx`'s save-error path (existing `saveError` banner) is unchanged — the nudge insertion only affects the success path, not the error path.
- [ ] Existing `app/__tests__/` auth-screens tests for `success.tsx` still pass with the updated navigation target assertion.

## Files to reference

| File | Why |
|---|---|
| `app/(auth)/success.tsx:36-51` | `handleGoToDashboard` — the navigation target this spec changes. |
| `app/(auth)/_layout.tsx` | Stack screen list — needs the new `add-widget` entry. |
| `app/(auth)/welcome.tsx` | Visual/animation pattern reference (springBouncy, GradientButton usage). |
| `features/app/widget-discoverability/specs/01-accessory-families-port/spec-research.md` | Confirms lock-screen families will actually be installable by the time this copy references them. |
| `__tests__/auth-screens.test.tsx` | Existing test file likely covering `success.tsx` navigation — needs updating, not just adding new tests. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | Navigation-target assertions, render checks |
| Live-QA probe | ✗ | No API involved |
| TestFlight | ✓ | Full fresh-onboarding run: confirm the nudge appears once after setup, before the dashboard, and doesn't reappear on subsequent app opens (since it's a stack step, not a persisted flag, reappearing would only happen if onboarding re-runs, which is correct behavior) |
| Error log | ✗ | No new error path — pure navigation/content |
