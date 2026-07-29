# Spec 04 — Tappable "Forgot password" link

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

`app/(auth)/credentials.tsx:118-120`:

```tsx
<Text style={styles.forgotText}>
  Forgot your password? Reset it at crossover.com
</Text>
```

This is plain, non-interactive `<Text>` — no `onPress`, no link. A user who forgot their password has to remember "crossover.com," back out of the app, open a browser, type it in, and then find the reset flow themselves. No `Linking` import exists anywhere in the app yet (confirmed via repo-wide grep) — this is a net-new pattern, not a fix to an existing broken one.

## Exploration findings

- No existing `Linking.openURL` call anywhere in `src/` or `app/` — this spec introduces the first one. No wrapper/helper exists to model after; `Linking` is RN core, no new dependency.
- The actual Crossover password-reset URL needs confirming — likely `https://app.crossover.com/x/password/forgot` or similar (the app's own login page probably has a "forgot password" link whose target can be read from the frontend bundle, same reverse-engineering method already used for the approval API discovery). This must be confirmed against the real frontend before writing spec.md's FRs — do not guess the path.
- `styles.forgotText` currently has no visual affordance for tappability (no underline/color distinct from body text) — needs a small style tweak so it reads as a link, not just decoration.

## Key decisions

**1. Use RN's `Linking.openURL()`, opens in the system browser (not an in-app WebView).** Simpler, no new dependency, and consistent with "the app never mediates Crossover auth" (same posture as the on-device-only credential storage design already stated in the keychain note directly above this text at `credentials.tsx:110-116`).

**2. Wrap the text in a `Pressable`/`TouchableOpacity`, not the whole line — only the "Reset it at crossover.com" portion should be tappable**, so the "Forgot your password?" framing text stays plain. Split into two `<Text>` nodes or use nested `<Text>` with an `onPress` (RN supports `onPress` on nested `Text` for exactly this).

**3. Defensive `Linking.canOpenURL` check before calling `openURL`**, falling back to a no-op or a brief inline message if the URL can't be opened (rare, but `Linking` calls can reject on some Android configurations — less relevant on iOS-only but cheap to guard).

**4. Confirm the exact reset URL before implementation** — either by finding it in the Crossover frontend bundle (reverse-engineering method already established in this codebase) or asking the user directly, since guessing a wrong URL is worse than the current plain-text pointer (at least "crossover.com" is correct, even if not deep-linked).

## Interface contracts

```typescript
// app/(auth)/credentials.tsx
import { Linking, Text } from 'react-native';

const PASSWORD_RESET_URL = 'https://app.crossover.com/x/password/forgot'; // CONFIRM before implementation

async function handleForgotPassword(): Promise<void> {
  const supported = await Linking.canOpenURL(PASSWORD_RESET_URL);
  if (supported) {
    await Linking.openURL(PASSWORD_RESET_URL);
  }
}

// JSX
<Text style={styles.forgotText}>
  Forgot your password?{' '}
  <Text style={styles.forgotLink} onPress={handleForgotPassword}>
    Reset it at crossover.com
  </Text>
</Text>
```

## Test plan

- [ ] Tapping the link text calls `Linking.openURL` with the confirmed reset URL (mock `Linking`).
- [ ] `Linking.canOpenURL` resolving `false` → `openURL` is not called (no crash, no-op).
- [ ] Plain "Forgot your password?" prefix text remains non-interactive (no `onPress` on that segment).
- [ ] Visual: link segment has distinct styling (color/underline) from the prefix — snapshot or style assertion.

## Files to reference

| File | Why |
|---|---|
| `app/(auth)/credentials.tsx:118-120` | The text to replace. |
| Crossover frontend bundle (`app.crossover.com/x/scripts/...`) | Source of the real password-reset URL — reuse the reverse-engineering method from `tools/test-reverse-engineer.js`-era discovery work (repo root, deprecated widget, but the method still applies). |
| `hourglassws/CLAUDE.md` §"Module layering" | `Linking` call lives in `app/` (screen), no lower-layer helper needed for a single one-off call. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | `Linking` mock assertions, style checks |
| Live-QA probe | ✗ | Not a Crossover API call — a browser deep link |
| TestFlight | ✓ | Tap the link on-device, confirm the system browser opens to a real, working Crossover password-reset page |
| Error log | ✗ | Low-stakes; failure is a no-op, not worth a log line |
