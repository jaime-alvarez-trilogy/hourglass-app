# Spec 01 — Verify and document the TestFlight distribution link

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

`README.md:7` has:

```
**Download on TestFlight (iOS):** https://testflight.apple.com/join/eV25Wbvh
```

This is the only place in the repo referencing the public TestFlight join link. Since the app went live on the App Store via Unlisted App Distribution (2026-07-21, per `project_ota_update_sequencing` memory), this link's role has shifted — it may now be redundant with (or superseded by) the Unlisted App Distribution link, or it may still be the primary distribution channel for beta/pre-release builds while the Unlisted link is the "stable" channel. Nothing in the repo currently distinguishes the two, and TestFlight public links can go stale (they're tied to a specific build's TestFlight group and can be regenerated, which changes the URL).

There's no verification anywhere that this link still resolves to a live build.

## Exploration findings

- `README.md` has two other TestFlight references (lines ~99, ~168) but those are build/submit *instructions* (`eas submit` flow docs), not user-facing links — only line 7 is the one a prospective user would click.
- The App Store Connect app ID (`6761698411`) and bundle id (`com.jalvarez0907.hourglass`) are documented in the approved plan `ticklish-swimming-shamir.md` (Unlisted App Distribution work) — that plan indicates the app is now either live or awaiting the Unlisted distribution grant, meaning there may now be **two** valid install paths: the direct Unlisted App Store link and the TestFlight link.
- No CI or script currently checks this URL's liveness. `.appstore/asc.js` (referenced in the plan) already has JWT-signed App Store Connect API access — it's plausible to extend it with a `check-testflight-link` command that GETs the public join URL and checks for a non-error response, but TestFlight join pages don't have a stable "is this build still available" API — the most reliable check is fetching the URL and confirming it doesn't redirect to an Apple "this link is no longer available" error page.

## Key decisions

**1. This is primarily a content/process fix, not a code fix.** Confirm current link validity by hand (fetch the URL, inspect the response), update `README.md` if it's stale, and add a short "how to re-verify" note so this doesn't silently rot again.

**2. Decide the *primary* link.** Since Unlisted App Distribution changes the story (a real App Store link may now exist, not just TestFlight), the spec's first task is determining — with the user — whether `README.md` should point at the Unlisted App Store link, the TestFlight link, or both (e.g. TestFlight for beta testers, Unlisted App Store link for general users). This is a decision for the spec-writing/implementation phase, not something to guess here.

**3. No new automated check is in scope unless the manual verification during implementation turns up recurring staleness.** A cron/CI liveness check is a nice-to-have, not required for this spec's success criteria — added as a stretch FR only if cheap.

## Interface contracts

None — this is a documentation change. If a stretch FR adds a liveness check, it would live in `.appstore/asc.js` following the existing command-pattern (see `set-review-notes` in the Unlisted App Distribution plan).

## Test plan

This is not code — verification is manual + a README diff review:

- [ ] Fetch the current TestFlight link and confirm it resolves to a live "Install" page (not an expired/error page).
- [ ] Confirm with user whether Unlisted App Distribution has been granted yet (per the `ticklish-swimming-shamir` plan) — if yes, decide primary link.
- [ ] Update `README.md` line 7 (and any other user-facing link) to the decided primary link(s).
- [ ] Add a one-line comment/note near the link about how to re-verify it (e.g. "verify via App Store Connect → TestFlight → Public Link before updating this").

## Files to reference

| File | Why |
|---|---|
| `README.md:7,99,168` | The link and the build/submit instructions that produce new builds. |
| `.appstore/asc.js` (referenced in Unlisted App Distribution plan) | Existing App Store Connect API helper — extension point if a liveness check is added. |
| `~/.claude/plans/ticklish-swimming-shamir.md` (session plan, not repo) | Context on Unlisted App Distribution status — determines whether a second, non-TestFlight link now exists. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✗ | No code change (unless stretch FR added) |
| Live-QA probe | ✗ | No Crossover API involved |
| TestFlight | ✓ | Literally verifying the TestFlight link itself |
| Error log | ✗ | N/A |
