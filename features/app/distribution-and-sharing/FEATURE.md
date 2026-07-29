# Distribution and sharing

**Status:** Research complete, ready for spec → implement
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-07-27

Fix the one broken distribution link, give existing users a frictionless way to invite teammates, and give returning users a reason to notice (and trust) updates via a changelog surface.

## Why this feature exists

The app is distributed via Unlisted App Distribution + a TestFlight link — there is no App Store listing driving organic discovery. Every install today comes from either a direct link or word-of-mouth from an existing user. The distribution/usage sweep (2026-07-24) found:

- **The README's TestFlight link may go stale** — TestFlight public links can expire or be replaced when builds roll over, and the README is the only place this link lives; nothing checks it's still valid.
- **No invite/share mechanism.** A happy user who wants to tell a teammate has to manually copy the TestFlight/App Store link from somewhere — the app itself offers no "Share this app" action.
- **No changelog / what's-new surface.** After an OTA update or a new build, users have no way to know what changed. This matters more now that the app is live (see `project_ota_update_sequencing` memory) — silent updates with no visible change erode trust that anything is happening, and don't surface bug fixes users specifically asked about.

## Intended final state

1. The TestFlight/distribution link in `README.md` (and anywhere else it's referenced) is confirmed live, and there's a lightweight way to notice if it goes stale in the future (manual check documented, or a CI/cron check if cheap).
2. A "Share Hourglass" action (Settings, or contextual after a positive moment) opens the native share sheet with the distribution link and a short description.
3. A changelog/what's-new mechanism exists — at minimum, a static "What's New" screen reachable from Settings showing the last few release notes; ideally, a one-time banner/modal shown after an app or OTA version bump.

## Out of scope

| Item | Why excluded |
|---|---|
| Public App Store listing / ASO | Not applicable — the app is Unlisted distribution per Guideline 3.2, not public-searchable. |
| Referral tracking / attribution | No backend infrastructure for this, and no product need identified yet. |
| Automated release-notes generation from commit history | Manual changelog entries are fine at this app's size; automation is premature. |
| A remote-config-driven changelog (server-served) | The Railway server has no content-serving surface today; a static in-app list is sufficient for now. |

## Decomposition

3 specs, sized to be each implementable in one PR.

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [testflight-link-fix](specs/01-testflight-link-fix/spec-research.md) | Verify current TestFlight link validity, update README/any other references, document how to re-check it going forward | — | — | S |
| 02 | [invite-share](specs/02-invite-share/spec-research.md) | "Share Hourglass" action using `expo-sharing`/`Share` API from Settings, sharing the distribution link + short blurb | — | — | S |
| 03 | [changelog-whats-new](specs/03-changelog-whats-new/spec-research.md) | Static "What's New" screen from Settings + one-time post-update banner keyed off a stored last-seen version | — | — | M |

**Critical path:** none of the three block each other — all three can be built in parallel.

## Verification strategy

| Tier | Layer | What it catches |
|---|---|---|
| 1 | **Unit tests** (Jest) | Share-action invocation assertions, changelog screen render, last-seen-version comparison logic for the one-time banner. |
| 2 | **N/A** | No Crossover API surface touched. |
| 3 | **TestFlight manual scenario** | Tap the TestFlight link from a clean device — confirm it installs. Tap "Share" — confirm share sheet opens with correct content. Bump version, relaunch — confirm the what's-new banner shows once and not again. |
| 4 | **Local error log review** | N/A — no error-prone I/O beyond AsyncStorage read/write for the last-seen version, which should fail safe (show banner again rather than crash) if corrupted. |

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-07-27 | — | Feature created from distribution/usage sweep findings. Research phase complete. |
