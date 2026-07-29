# Spec 04 — Support email wired to the debug-log share flow

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

Confirmed via repo-wide grep: no `support@`, `contact@`, `help@`, or `mailto:` reference exists anywhere in app-facing code (the only mailto hits are inside `server/node_modules`, irrelevant third-party doc comments). `handleShareLog` (`app/modal.tsx:150-159`) opens the generic iOS share sheet with the log file — the user can pick Mail, but there's no pre-filled recipient, subject, or body, and no indication anywhere in the app of what email address to use even if they wanted to type one manually. A user who wants to report a bug has to already know (from outside the app) how to reach the developer.

## Exploration findings

- `Sharing.shareAsync(uri, {dialogTitle, mimeType})` (expo-sharing) does not support pre-filling an email recipient/subject/body — it's a generic OS share sheet, agnostic of which app the user picks.
- To get a pre-filled email with the log file attached, the standard approach is `expo-mail-composer` (`MailComposer.composeAsync({recipients, subject, body, attachments})`) — this is a **new dependency**, not currently in `package.json` (confirmed: only `expo-sharing`/`expo-file-system` exist for this flow, from spec 08).
- Alternative: keep `Sharing.shareAsync` as-is (works fine, user picks Mail among other options) and simply **display the support email address as visible, copyable text** near the Share Log button, so the user at least knows where to send it if they pick Mail — no new dependency, smaller change.
- Given this feature's `server-monitoring` spec (05) and general project scale (a single-developer-maintained internal tool, not a support-team product), the lighter-weight option (visible email address + keep existing share sheet) is proportionate; `expo-mail-composer`'s richer pre-fill is a nice-to-have, not required.

## Key decisions

**1. Add a real support email address (needs the user to provide/confirm one — not guessable) as visible, tappable text near "Share debug log" in the Settings modal.** Tappable via `Linking.openURL('mailto:<address>?subject=Hourglass%20Bug%20Report')` — this pre-fills the recipient/subject in whatever mail app opens, without needing `expo-mail-composer`. Cheaper than adding a new dependency for marginal UX gain.

**2. Do not switch `handleShareLog` off `Sharing.shareAsync`.** The existing share-sheet flow already works and lets the user attach the log to Mail, Messages, Files, etc. — this spec adds a companion "or email us directly" affordance, not a replacement.

**3. Support email also surfacing in the Help/FAQ screen (`onboarding-trust-and-help` spec 02), as the fallback for "my question isn't answered here."** Cross-reference rather than duplicate content — spec 02's FAQ can link to the same constant this spec introduces.

**4. Single source of truth for the address**: a constant in `src/lib/support.ts` (or co-located with `src/lib/distribution.ts` from `distribution-and-sharing` spec 02, if that lands first) so it isn't hand-typed in two places.

## Interface contracts

```typescript
// src/lib/support.ts (new)
export const SUPPORT_EMAIL: string; // e.g. 'jalvarez0907@outlook.com' — CONFIRM with user before implementation
export const SUPPORT_MAILTO_URL: string; // `mailto:${SUPPORT_EMAIL}?subject=Hourglass%20Bug%20Report`

// app/modal.tsx — near handleShareLog
<Text onPress={() => Linking.openURL(SUPPORT_MAILTO_URL)} style={styles.supportEmailLink}>
  {SUPPORT_EMAIL}
</Text>
```

## Test plan

- [ ] Support email text renders in the Settings modal near the Share Log section.
- [ ] Tapping it calls `Linking.openURL` with the correct `mailto:` URL (subject pre-filled).
- [ ] Existing `handleShareLog`/`handleClearLog` behavior is unchanged (regression check — this spec is additive).
- [ ] Help/FAQ screen (if spec 02 has landed) references the same `SUPPORT_EMAIL` constant, not a hardcoded duplicate string.

## Files to reference

| File | Why |
|---|---|
| `app/modal.tsx:148-159` | `handleShareLog` — the section this spec adds a companion element next to. |
| `package.json` | Confirms `expo-mail-composer` is NOT present — decision 1 avoids adding it. |
| `features/app/onboarding-trust-and-help/specs/02-help-faq-screen/spec-research.md` | Cross-reference point for the same support email constant. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | `Linking.openURL` mock assertion, render check |
| Live-QA probe | ✗ | No API involved |
| TestFlight | ✓ | Tap the email link on-device, confirm Mail app opens with correct recipient/subject pre-filled |
| Error log | ✗ | Low-stakes; no logging needed |
