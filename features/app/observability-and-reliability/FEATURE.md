# Observability and reliability

**Status:** Research complete, ready for spec → implement
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-07-27

Finish what `resilience-fixes` spec 08 deliberately deferred: wire the local error logger into real call sites, add a global crash boundary so a JS exception doesn't blank the screen, audit and fix silent catch blocks that hide failures, make the debug log easy to attach to a support email, and get a heartbeat on the Railway ping server so a silent outage doesn't go unnoticed.

## Why this feature exists

`resilience-fixes` (see `features/app/resilience-fixes/FEATURE.md`) built the logging *infrastructure* — `src/lib/log.ts`, `src/lib/redact.ts`, the Settings "Share log" / "Clear log" UI — but its spec 08 explicitly scoped out wiring `log.*` calls into the app's actual failure paths (auth, push, notification scheduling, onboarding). Without that wiring, the logger exists but stays empty, which defeats the point: a user experiencing a bug has a "Share log" button that shares nothing useful.

The distribution/usage sweep (2026-07-24) added three more gaps on top of that deferred wiring work:

- **No global error boundary.** A thrown exception anywhere in the React tree currently has no catch-all — depending on where it happens, the user sees a blank screen or an RN redbox in production with no recovery path.
- **Silent catch blocks.** A repo-wide scan found ~67 `catch` blocks across `src/`, `app/`, and `server/` (excluding test files) — some subset of these almost certainly swallow errors without logging or surfacing them, which is exactly the kind of failure the resilience-fixes investigation flagged as a systemic risk (the Thursday notification burst was invisible for the same reason: nothing observed the failure). Needs a real audit, not a guess.
- **Debug log isn't attachable to a support conversation cleanly.** "Share log" opens the iOS share sheet, which works, but there's no support email address wired anywhere in the app for a user to actually send it *to* — they have to already know how to reach the developer.
- **No server monitoring.** The Railway ping server (`server/`) has a `/health` endpoint but nothing polls it. If the cron silently stops firing, notifications silently stop, and the only signal is a user noticing they didn't get reminded.

## Intended final state

1. `log.*` calls are added at the call sites `resilience-fixes` spec 08 identified as future work: `handleStatus` (api errors), auth token retry/failure, push handler dedup decisions, notification scheduling lock/orphan-sweep outcomes, onboarding not-contributor branch (already partially done — verify).
2. A React error boundary wraps the app root (or each tab), catching render-time exceptions, showing a minimal "Something went wrong" screen with a reload action, and logging the crash via `log.error`.
3. Every silent catch block in `src/`/`app`/`server` either logs via `log.*` (or `console.error` server-side, since the server has no on-device logger), rethrows, or has an explicit comment explaining why swallowing is intentional (e.g. best-effort cleanup).
4. A support email address is wired into the app (Settings, and/or the "Share log" flow) so sharing the debug log has an obvious destination.
5. The Railway ping server's `/health` endpoint is polled by an external uptime check (e.g. a free-tier monitor) with the user notified on downtime.

## Out of scope

| Item | Why excluded |
|---|---|
| Sentry / third-party crash reporting | Explicitly out of scope per `resilience-fixes` FEATURE.md — the on-device-only, no-phone-home privacy model stands. |
| In-app support chat | A support email is sufficient at this scale; a chat widget is a different product. |
| Rewriting server error handling architecture | `server/` is a small Express app; this feature adds a heartbeat, not a rewrite. |
| Retrying every audited silent-catch site's underlying operation | The audit's job is to make failures visible (logged), not to add new retry logic — retries are a case-by-case follow-up if the audit finds one that needs it. |

## Decomposition

5 specs, sized to be each implementable in one PR.

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [log-callsite-wiring](specs/01-log-callsite-wiring/spec-research.md) | Add `log.*` calls at the call sites deferred by `resilience-fixes` spec 08 (auth, push dedup, notification lifecycle, api errors) | — | — (consumes `resilience-fixes` 03/04/06/07/08, already shipped) | M |
| 02 | [global-error-boundary](specs/02-global-error-boundary/spec-research.md) | React error boundary at the app root with a minimal recovery screen, logs the crash | — | — | S |
| 03 | [silent-catch-audit](specs/03-silent-catch-audit/spec-research.md) | Enumerate and fix/annotate the ~67 catch blocks across `src/`, `app/`, `server/` | 01 (some fixes should route through the same logger) | 01 | M |
| 04 | [support-email-log-attach](specs/04-support-email-log-attach/spec-research.md) | Wire a support email address into Settings / the share-log flow | — | — | S |
| 05 | [server-monitoring](specs/05-server-monitoring/spec-research.md) | External uptime check against the Railway `/health` endpoint | — | — | S |

**Critical path:** 01 → 03 (the silent-catch audit should route new logging through the call-site conventions spec 01 establishes, not invent a second pattern). 02, 04, 05 are independent and can run in parallel with 01/03.

## Verification strategy

| Tier | Layer | What it catches |
|---|---|---|
| 1 | **Unit tests** (Jest) | New `log.*` calls fire with expected category/meta at each wired site (mock the logger). Error boundary renders fallback UI on a thrown error. Server `/health` route behavior (already covered, verify no regression). |
| 2 | **N/A** | No new Crossover API surface. |
| 3 | **TestFlight manual scenario** | Force an auth failure, a push-dedup decision, a notification-scheduling conflict — confirm each produces a log line via Share Log. Force a render crash in dev — confirm the boundary catches it instead of a blank screen. |
| 4 | **Local error log review** | This feature is largely *about* making tier 4 useful — its own completion criterion is "the log file has real content when something breaks," which is self-verifying once spec 01 lands. |

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-07-27 | — | Feature created from distribution/usage sweep findings. Directly continues the call-site wiring `resilience-fixes` spec 08 deferred. Research phase complete. |
