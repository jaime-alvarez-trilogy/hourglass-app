# Onboarding trust and help

**Status:** Research complete, ready for spec → implement
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-07-27

Reduce first-run drop-off and support burden by explaining what the app is and does before asking for Crossover credentials, giving users a way to self-serve answers, turning generic auth failures into actionable messages, and getting a real password-reset link in front of users instead of a plain-text pointer.

## Why this feature exists

The distribution/usage sweep (2026-07-24) surfaced a consistent theme: a brand-new user hits the credentials screen cold, with no explanation of why a third-party app wants their Crossover login, and if anything goes wrong (wrong password, network issue, account shape issue) they get a generic failure with no next step. This is exactly the kind of friction that kills first-run conversion for an unlisted-distribution app that has no App Store description/screenshots to build trust beforehand (Guideline 3.2 unlisted distribution means users often arrive via a bare link, not a store listing).

Four concrete gaps:

- **No pre-login trust/explainer screen.** The welcome screen goes straight to "sign in" — no explanation that credentials stay on-device, why the app needs a Crossover login, or what the app actually shows once signed in.
- **No help/FAQ surface.** A user who's confused (about AI% calculation, BrainLift, widget setup, why hours don't match the Crossover web app) has nowhere to look except asking the developer directly.
- **Generic auth errors.** `resilience-fixes` spec 03/04 already made `ApiError`/`AuthError` carry structured `errorCode`/`errorType` — but the credentials screen doesn't yet surface anything more specific than a generic failure message to the user.
- **"Forgot password" is a text pointer, not a link.** `app/(auth)/credentials.tsx:118-119` just says "Reset it at crossover.com" — not tappable, requires the user to remember and manually navigate.

## Intended final state

1. A trust/explainer screen (or expanded welcome screen) precedes the credentials form, explaining: what the app does, that it requires an existing Crossover account, and that credentials never leave the device.
2. A help/FAQ screen is reachable from Settings, covering the most likely self-serve questions (AI% formula, BrainLift, widget setup, why numbers may differ from the web app).
3. Auth failures on the credentials screen show a specific, actionable message keyed off the structured error envelope (bad password vs. network vs. account-shape issue) instead of one generic string.
4. "Forgot your password?" is a tappable link that deep-links or opens `crossover.com`'s password reset flow in the system browser.

## Out of scope

| Item | Why excluded |
|---|---|
| In-app password reset (collecting a new password without leaving the app) | Crossover owns auth — the app has no ability to reset a Crossover password itself, only to link out. |
| Full onboarding redesign / multi-step wizard | This is trust + clarity additions to the existing flow, not a redesign of `setup.tsx`/`verifying.tsx`. |
| Localizing help content | Single-language (English) for now, matches rest of the app. |
| A searchable/full-text help center | A short FAQ screen is enough at current scale; search is premature. |

## Decomposition

4 specs, sized to be each implementable in one PR.

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [pre-login-trust-screen](specs/01-pre-login-trust-screen/spec-research.md) | Add an explainer screen (or expand `welcome.tsx`) covering what the app does + on-device credential storage, shown before the credentials form | — | — | S |
| 02 | [help-faq-screen](specs/02-help-faq-screen/spec-research.md) | New Settings-reachable Help/FAQ screen with a static Q&A list (AI%, BrainLift, widget setup, data-mismatch explanations) | — | — | S |
| 03 | [actionable-auth-errors](specs/03-actionable-auth-errors/spec-research.md) | Map `errorCode`/`errorType`/status from `resilience-fixes` spec 03's envelope to specific credentials-screen error copy (bad password / network / account issue) | — | — (depends conceptually on `resilience-fixes` 03/04, already shipped) | S |
| 04 | [forgot-password-deeplink](specs/04-forgot-password-deeplink/spec-research.md) | Replace the static "Reset it at crossover.com" text with a tappable link (`Linking.openURL`) to Crossover's password reset page | — | — | S |

**Critical path:** none of the four block each other — all four can be built in parallel. Spec 03 has the most upstream context to read (the `resilience-fixes` error-envelope work) but no code dependency.

## Verification strategy

| Tier | Layer | What it catches |
|---|---|---|
| 1 | **Unit tests** (Jest) | Trust-screen render/navigation, FAQ content render, error-message mapping logic (given errorCode X, show message Y), link-open call assertions. |
| 2 | **N/A** | No new Crossover API surface — spec 03 consumes an envelope shape already validated by `resilience-fixes`' live-QA probe. |
| 3 | **TestFlight manual scenario** | Fresh-install flow: trust screen → credentials → (wrong password) → specific error message. Tap "Forgot password" → system browser opens to the right URL. Help screen reachable and legible on-device. |
| 4 | **Local error log review** | Auth failures already flow through `resilience-fixes` spec 08's logger if wired; spec 03 should add a `log.warn('auth.failure', {errorCode})` call as part of its implementation. |

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-07-27 | — | Feature created from distribution/usage sweep findings. Research phase complete. |
