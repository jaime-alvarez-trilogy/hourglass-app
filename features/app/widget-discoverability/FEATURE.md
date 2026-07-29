# Widget discoverability

**Status:** Research complete, ready for spec → implement
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-07-27

Make the home-screen and lock-screen widgets something users actually find and install, not a feature that ships invisibly. Two specs: light up the lock-screen accessory families that are already coded but never declared, and nudge users toward adding the widget during onboarding.

## Why this feature exists

The widget is one of the app's best differentiators (live hours/earnings/AI% at a glance) but nothing in the app tells a first-time user it exists. iOS widgets are opt-in and buried in a long-press → edit-screen flow that most users never discover on their own. Two concrete gaps came out of the distribution/usage sweep (2026-07-24):

- **Lock-screen accessory families are coded but not declared.** `WIDGET_LAYOUT_JS` (`src/widgets/bridge.ts`) already has render branches for `accessoryCircular`, `accessoryRectangular`, and `accessoryInline`, but `app.json`'s widget extension target on `main` never lists those families — so the lock-screen surface (the highest-frequency glance surface on iOS, above even the home screen) is dark.
- **No onboarding nudge.** Nothing in the setup flow tells a new user "add the widget to your home screen." Adoption depends entirely on the user already knowing iOS widgets exist and thinking to look.

## Important — known overlap with `feat/widget-vnext`

**Spec 01 in this feature is very likely already built.** The unmerged branch `feat/widget-vnext` has its own spec `01-accessory-families` marked **Complete** in that branch's `features/app/widget-vnext/FEATURE.md` — same problem, same fix (declare the families in `app.json`). That branch was never merged to `main`, so the fix exists but isn't shipped. Before implementing spec 01 here from scratch:

1. Diff `feat/widget-vnext`'s `app.json` + any widget-extension config changes against `main`.
2. If the change is small and isolated (just the accessory-family declarations), cherry-pick or hand-port it directly instead of re-deriving it — re-implementing already-solved work wastes effort and risks diverging from what was already validated on that branch.
3. If the branch has drifted too far from `main` for a clean cherry-pick (the branch also contains specs 02-04 foundation work for `WidgetData` extensions that `main` may not have), treat spec 01 here as a fresh, scoped-down port: just the `app.json` accessory-family declarations, not the rest of that branch's foundation.

This decision should be made at the start of spec 01's research/spec phase, not assumed.

## Intended final state

1. Lock-screen accessory widgets (circular, rectangular, inline) are installable from the widget gallery — `app.json` declares all three families for the widget extension target.
2. A post-setup onboarding screen or contextual card tells the user the widget exists and links to (or visually demonstrates) how to add it.
3. No regression to the existing home-screen widget sizes (small/medium) already shipped.

## Out of scope

| Item | Why excluded |
|---|---|
| Live Activities | Bigger bet, tracked separately in the widget roadmap memory — not a discoverability fix, a new surface. |
| Android widget parity for lock-screen-equivalent surfaces | Android has no lock-screen widget concept; out of scope by platform. |
| New widget visual designs | Covered by `widget-visual-v2`/`widget-visual-v3` — this feature is about discoverability, not appearance. |
| Full `feat/widget-vnext` merge | That branch has 24 specs across multiple milestones; this feature only needs spec 01's narrow fix, not the whole branch. |

## Decomposition

2 specs.

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [accessory-families-port](specs/01-accessory-families-port/spec-research.md) | Declare `accessoryCircular`/`accessoryRectangular`/`accessoryInline` in `app.json`'s widget extension target — port or re-derive from `feat/widget-vnext` spec 01 (see overlap note above) | 02 | — | S |
| 02 | [widget-onboarding-nudge](specs/02-widget-onboarding-nudge/spec-research.md) | Add a "Add the widget" screen/card shown once after setup completes, with a short visual walkthrough | — | 01 | S |

**Critical path:** 01 → 02. Spec 02's nudge should mention lock-screen widgets, so it's blocked on 01 shipping first.

## Verification strategy

| Tier | Layer | What it catches |
|---|---|---|
| 1 | **Unit tests** (Jest) | `app.json` config shape (if a config-validation test is added), onboarding nudge render/dismiss logic. |
| 2 | **N/A** | No Crossover API surface touched. |
| 3 | **TestFlight manual scenario** | Widget gallery long-press → confirm all three accessory families appear and render correctly on lock screen. Onboarding nudge appears once, doesn't reappear on relaunch. |
| 4 | **Local error log review** | N/A unless the nudge dismiss-state write fails silently — covered by `observability-and-reliability` if wired. |

Widget-gallery rendering cannot be verified by unit tests — tier 3 is load-bearing for spec 01.

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-07-27 | — | Feature created from distribution/usage sweep findings. Research phase complete. |
