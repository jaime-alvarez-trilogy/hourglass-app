# Spec 01 — Pre-login trust/explainer screen

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

`app/(auth)/welcome.tsx` is a purely animated hero screen: app icon, name, tagline, a single "Get Started" CTA, and one line of subtext — "Your credentials stay on your device" (`welcome.tsx:90`). That's the *entire* trust-building surface before the app asks for a Crossover username and password on the very next screen (`credentials.tsx`). There's no explanation of what the app actually does (hours tracking? earnings? something else?), why it needs a third-party login rather than its own account system, or any elaboration beyond that one subtext line.

This matters more than it would for a typical app because Hourglass is distributed via a bare link (TestFlight join link today, likely an Unlisted App Store link soon per the in-flight `ticklish-swimming-shamir` distribution plan) — there is no App Store listing page with screenshots, description, and reviews to build trust before install. The welcome screen inside the app *is* the store listing, functionally.

## Exploration findings

- `welcome.tsx` already has one trust signal (`subText: 'Your credentials stay on your device'`) — this spec is additive/expansive, not fixing something broken. Any new copy should complement, not duplicate, this line.
- `credentials.tsx:110-116` (the "Keychain row") repeats a very similar trust message ("stored securely in your device's Keychain and never leave your phone") — so by the time a user reaches the credentials form, they've already seen this reassurance once (on welcome) and are about to see it again (on credentials). The gap isn't "trust message repetition" — it's the complete absence of "what does this app do" framing.
- No existing screen in `app/(auth)/` explains app functionality — `verifying.tsx`, `env-select.tsx`, `setup.tsx`, `success.tsx` are all functional onboarding steps, not explainer content.
- Navigation: `welcome.tsx:73` does `router.push('/(auth)/credentials')` directly on CTA press. A new explainer screen would either (a) be inserted between welcome and credentials as a new route, or (b) be additional content added directly to `welcome.tsx` itself (expanding the hero screen rather than adding a hop).

## Key decisions

**1. Expand `welcome.tsx` in place rather than inserting a new route/screen.** Adding a full new stack screen for a first-run-only explainer means extra navigation state, an extra tap, and extra engineering (new route, new stack entry, back-button behavior). Since the existing welcome screen already has vertical space (a centered hero + bottom CTA), the explainer content — 2-3 short bullet points about what the app does — fits as additional content between the tagline and the CTA, using the same fade-in animation pattern already present (`textOpacity`/`textY`).

**2. Content: 3 short lines, not paragraphs.** e.g.:
   - "Track your Crossover hours, earnings, and AI usage in one place"
   - "Signs in with your existing Crossover account — no new signup"
   - "Your credentials stay on this device, always" (keep existing subtext, don't duplicate as a 4th line)

**3. No new persistent state (no "don't show again" logic).** This is a first screen a user sees exactly once per fresh install/session naturally (they don't return to `welcome.tsx` after completing onboarding) — no dismissal tracking needed, unlike the changelog banner in `distribution-and-sharing` spec 03 which explicitly needs one.

**4. Reuse existing animation primitives (`springBouncy`/`springSnappy` from `src/lib/reanimated-presets`) rather than introducing new easing/timing values** — keep consistent motion language with the rest of the screen.

## Interface contracts

No new types or functions — this is a JSX/copy addition to an existing component.

```tsx
// app/(auth)/welcome.tsx — additive only
<Animated.View style={[styles.explainer, explainerStyle]}>
  <Text style={styles.explainerLine}>Track your Crossover hours, earnings, and AI usage in one place</Text>
  <Text style={styles.explainerLine}>Signs in with your existing Crossover account — no new signup</Text>
</Animated.View>
```

## Test plan

- [ ] Welcome screen renders the new explainer lines (snapshot or text-content assertion).
- [ ] Existing "Your credentials stay on your device" subtext is unchanged (not duplicated, not removed).
- [ ] CTA still navigates to `/(auth)/credentials` on press (no regression).
- [ ] No new AsyncStorage/SecureStore reads — confirm no persistence logic was added by mistake.

## Files to reference

| File | Why |
|---|---|
| `app/(auth)/welcome.tsx` | The screen this spec expands in place. |
| `app/(auth)/credentials.tsx:110-116` | The existing Keychain trust message — new copy must not duplicate this. |
| `src/lib/reanimated-presets.ts` | `springBouncy`/`springSnappy` — reuse for the new content's entrance animation. |
| `app/__tests__/` (existing auth-screens tests) | Pattern to follow for the new/updated welcome-screen test. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | Render assertions for new copy, navigation regression check |
| Live-QA probe | ✗ | No API involved |
| TestFlight | ✓ | Fresh-install visual check — confirm layout doesn't overflow on smaller device sizes (SE-class screens) |
| Error log | ✗ | N/A — no error paths introduced |
