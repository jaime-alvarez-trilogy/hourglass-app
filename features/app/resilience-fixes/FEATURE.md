# Resilience fixes

**Status:** Research complete, ready for spec → implement
**Owner:** @jaime-alvarez-trilogy
**Created:** 2026-05-23

Address every issue surfaced by the architecture map (`docs/ARCHITECTURE.md` §8) and the Crossover API live probe (`docs/CROSSOVER_API.md` §15), and add a verification layer that lets us be confident future fixes work — without breaking the on-device-only privacy model.

## Why this feature exists

Two recent investigations turned up nine concrete defects that are quietly degrading the app:

- The **Thursday notification burst** is most likely caused by count-only dedup in the push handler and uncoordinated re-entry between `scheduleAll` and `handleBackgroundPush`.
- The **JSON parse fix** from `1adca60` shipped one corner of a broader issue: the Crossover API returns empty PUT bodies, Tomcat HTML 500s for bad tokens, and a structured `{errorCode, type, text}` envelope that the current client discards.
- **Pure-manager accounts** (no `CANDIDATE` avatar) get a completely different `/detail` payload that the onboarding code crashes through silently.
- The **`inFlightRef` guard** only protects intra-hook re-entry; cancel+setItem isn't atomic; iOS calendar triggers survive uninstall.

Beyond the bugs, the investigation also surfaced that we have **zero CI**, **zero production observability**, and **zero pre-submit gates**. A fix can pass all 142 local unit tests and still fail in the wild — exactly what happened with the Thursday burst. Without a verification layer, we'll keep shipping fixes and hoping.

This feature ships both: the fixes themselves, and the infrastructure to know whether future fixes work.

## Intended final state

After this feature ships:

1. **Test mocks match production.** No mock-vs-runtime drift like the `.text()` failure in `__tests__/approvals-api.test.ts`.
2. **CI runs on every PR.** GitHub Actions executes `npm test` and `cd server && npm test`; a red suite blocks merge.
3. **`ApiError` carries the server's structured error.** UI can show validation messages from `CROS-XXXX` codes; we can distinguish "user typed wrong" from "server is broken."
4. **Auth failures are detected reliably.** Bad/expired tokens are caught regardless of whether the server returns 401, 403, or Tomcat 500 HTML. A successful token is cached in memory and reused for the session.
5. **Onboarding handles all account shapes.** Pure-manager accounts (`avatarTypes: ["MANAGER","COMPANY_ADMIN"]` with no assignment) get a graceful "your account isn't a contributor — Hourglass is contributor-only" message instead of a silent cascade of 400 errors. Fallback paths read paginated envelopes correctly.
6. **New-approval push notifications dedup by ID set, not count.** Two new items appearing after one being approved no longer fires a notification. Cross-week window expansion no longer causes spurious bursts.
7. **Notification scheduling is concurrency-safe across handlers.** `scheduleAll` and `handleBackgroundPush` cannot interleave to produce duplicate notifications. Orphans left by AsyncStorage write failures are detected and cancelled on app launch.
8. **A privacy-preserving error log exists.** Errors are written to a local on-device file (redacted at write time). Settings includes a "Share debug log" button that lets the user export the file via email or share sheet. No automatic phone-home.

## Out of scope

| Item | Why excluded |
|---|---|
| Sentry / opt-in crash reporting | Deferred — requires consent UI and a backend. Tier 1 local log + manual export covers the immediate need. |
| Anonymous integer telemetry to a backend | Deferred — value uncertain at solo-developer scale. |
| Android first release | Independent of this work — covered by a future Android-launch feature. |
| Replacing the Railway ping server with webhooks | Crossover doesn't expose webhooks. Polling is the only option. |
| Migrating to TanStack Query for the auth/onboarding flow | Out of scope — auth uses `useSetup` state machine, which works. |
| Restructuring widget data contract | Out of scope — widget data shape is stable. |

## Decomposition

8 specs, sized to be each implementable in one PR.

| # | Spec | Description | Blocks | Blocked By | Complexity |
|---|---|---|---|---|---|
| 01 | [test-mock-text](specs/01-test-mock-text/spec-research.md) | Fix `__tests__/approvals-api.test.ts` mocks to include `.text()` — same fix as the other client test files | — | — | S |
| 02 | [ci-pipeline](specs/02-ci-pipeline/spec-research.md) | GitHub Actions workflow running `npm test` (app + server) on every PR + push to main | 03–08 | 01 | S |
| 03 | [error-envelope](specs/03-error-envelope/spec-research.md) | Parse `{errorCode, type, httpStatus, text}` JSON envelope on non-2xx responses; expose on `ApiError` | 04, 05 | 02 | S |
| 04 | [auth-resilience](specs/04-auth-resilience/spec-research.md) | F1 + F3 — cache token in memory for session, refresh on 401; detect HTML 500 as auth failure | — | 02, 03 | M |
| 05 | [onboarding-defense](specs/05-onboarding-defense/spec-research.md) | F5 + F6 — handle `/detail` schema variants without `assignment`; read `/assignments.content` envelope; show clear error for unsupported account shapes | — | 02, 03 | M |
| 06 | [push-dedup](specs/06-push-dedup/spec-research.md) | §8.1 — switch new-approvals push from `prev_approval_count` to a set of previously-seen item IDs | — | 02 | M |
| 07 | [notification-lifecycle](specs/07-notification-lifecycle/spec-research.md) | §8.2 + §8.3 + §8.4 — AsyncStorage mutex across `scheduleAll` and `handleBackgroundPush`; restructure cancel+setItem; app-launch orphan sweep | — | 02, 06 | L |
| 08 | [observability-log](specs/08-observability-log/spec-research.md) | Local rolling error log with redaction at write time; "Share debug log" button in settings modal | — | 02, 03 | M |

**Critical path:** 01 → 02 → (03, 06, 08 in parallel) → (04, 05, 07 in parallel). Spec 02 is the verification foundation; everything after it benefits from CI catching regressions.

## Verification strategy

Every spec follows the same four-tier verification ladder:

| Tier | Layer | What it catches |
|---|---|---|
| 1 | **Unit tests** (Jest) | Logic bugs, contract violations within a module. Mocked dependencies. Runs on every PR via spec 02. |
| 2 | **Live-QA probe extension** | Crossover API contract drift, response-shape changes. Added as a new function to `scripts/probe-crossover-api.mjs`. Runs manually against `api-qa.crossover.com` before merging. |
| 3 | **TestFlight manual scenario** | Behavior that only manifests on real iOS — concurrency, AppState transitions, push delivery timing, notification scheduling persistence. Documented in each spec's checklist. |
| 4 | **Local error log review** | Production issues discovered post-ship. Reviewed when a user reports unexpected behavior. Provided by spec 08. |

Where a spec changes behavior that can be observed entirely in unit tests (e.g., spec 01 fixing a mock), tiers 2–3 may be skipped. Each spec's `spec-research.md` documents which tiers apply.

## Changelog

| Date | Spec | Description |
|---|---|---|
| 2026-05-23 | — | Feature created. Research phase complete. |
