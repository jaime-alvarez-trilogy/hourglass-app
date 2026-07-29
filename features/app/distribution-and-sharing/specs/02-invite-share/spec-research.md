# Spec 02 — "Share Hourglass" invite action

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

The app has no way for a satisfied user to tell a teammate about it short of manually finding and copying the distribution link themselves (which they may not even know the URL for — it's not surfaced anywhere in-app, only in `README.md`, which end users never see). Every install today is either a direct link handed out by the developer or organic word-of-mouth that dead-ends at "what's the link again?"

`expo-sharing` is already a dependency (added by `resilience-fixes` spec 08 for the debug-log share flow), so the native share sheet primitive is already in the app — this spec reuses it for a different payload.

## Exploration findings

- `app/modal.tsx` already imports `* as Sharing from 'expo-sharing'` and calls `Sharing.shareAsync(uri, {...})` for the debug log (see `handleShareLog`, `app/modal.tsx:150`). That call shares a *file URI*. Sharing a plain link/text is a different Expo API — `expo-sharing`'s `shareAsync` expects a URL (can be a web URL, not just a file), OR React Native's built-in `Share.share({ message, url })` from `react-native` is more appropriate for "share this URL as text," since `expo-sharing`'s `shareAsync` on iOS is documented for local file URIs primarily.
- **Decision needed at spec time:** use RN's `Share.share()` (simpler for a text+URL payload, no new dependency) vs. `expo-sharing.shareAsync()` (already imported, but semantically for files). Recommendation: `Share.share({ message: '...', url: '<link>' })` from `react-native` — it's the standard API for "share a link," is already available (no new dependency, RN core), and is simpler than repurposing the file-sharing primitive.
- Settings modal (`app/modal.tsx`) is the natural home — same pattern as the Debug Log section (`resilience-fixes` spec 08 FR9): a labelled section with a single button.
- The link to share is whatever spec `01-testflight-link-fix` in this same feature settles on as the primary distribution link — this spec should read that decision (or a shared constant) rather than hardcoding a second copy of the URL that can drift out of sync with the README.

## Key decisions

**1. Use RN's `Share.share()`, not `expo-sharing`.** Simpler API for text+URL, no new dependency, and keeps `expo-sharing` semantically scoped to "share a file" (its actual use in the app today).

**2. Single shared source of truth for the distribution URL.** Introduce a small constant (e.g. `src/lib/distribution.ts` exporting `DISTRIBUTION_URL` and a short share blurb) that both this spec's button and (if it exists) any future stale-link check can reference. Avoids the README and the in-app share action silently diverging.

**3. Placement: Settings modal, near the top (not buried below Debug Log).** This is a positive/growth action, distinct from the debug/dev-tools cluster at the bottom of the modal.

**4. Share text is short and generic** — e.g. "Track your Crossover hours, earnings, and AI usage with Hourglass: {link}" — not personalized (no user data in the shared text, keeping with the app's privacy posture).

## Interface contracts

```typescript
// src/lib/distribution.ts (new)
export const DISTRIBUTION_URL: string;
export const SHARE_MESSAGE: string; // e.g. `Track your Crossover hours, earnings, and AI usage with Hourglass: ${DISTRIBUTION_URL}`

// app/modal.tsx
import { Share } from 'react-native';
async function handleShareApp(): Promise<void> {
  try {
    await Share.share({ message: SHARE_MESSAGE, url: DISTRIBUTION_URL });
  } catch {
    // Share.share rejecting is rare (user cancel resolves, not rejects) — swallow defensively, no Alert needed for a non-critical action.
  }
}
```

## Test plan

- [ ] `Share.share` mock — tapping "Share Hourglass" calls `Share.share` with the expected `message`/`url`.
- [ ] Button renders in Settings modal regardless of `isMe`/dev-gate state (same visibility policy as Debug Log — end users are the target).
- [ ] `DISTRIBUTION_URL` constant matches whatever spec 01 settles on as primary (manual cross-check, not an automated test — the two files aren't otherwise coupled).

## Files to reference

| File | Why |
|---|---|
| `app/modal.tsx:150-160` (approx, `handleShareLog`) | Existing share-flow pattern to mirror for UI structure (section, button, try/catch). |
| `package.json` | Confirm `expo-sharing` already present (yes, from spec 08); RN's `Share` needs no new dependency. |
| `features/app/distribution-and-sharing/specs/01-testflight-link-fix/spec-research.md` | Source of the primary distribution URL decision this spec depends on. |
| `app/__tests__/modal-debug-log.test.tsx` (from `resilience-fixes` spec 08) | Reference test structure for a new `modal-share-app.test.tsx`. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | `Share.share` invocation assertions |
| Live-QA probe | ✗ | No Crossover API involved |
| TestFlight | ✓ | Confirm the real iOS share sheet opens with correct content on-device |
| Error log | ✗ | Low-stakes action; no logging needed |
