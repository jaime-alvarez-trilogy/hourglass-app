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
| 2026-05-23 | 01-test-mock-text | Complete. `successEmpty()` mock now exposes `.text()` matching `apiPut` contract. Commit `d120e35`. 27/27 approvals-api tests green; full suite 3870/3870. |
| 2026-05-23 | [02-ci-pipeline](specs/02-ci-pipeline/spec.md) | Spec ready for implement. Adds `hourglassws/.github/workflows/test.yml` with parallel `app-tests` + `server-tests` jobs on Node 20. `tsc --noEmit` deferred to a future tsc-enforcement spec (~419 baseline errors). |
| 2026-05-23 | 02-ci-pipeline | Phase X.1 complete. Commit `5302411` adds the workflow file. Alignment check PASS. Phase X.2 end-to-end verification (open PR, red/green probes, cache reuse, branch protection) deferred to next user action. |
| 2026-05-28 | [06-push-dedup](specs/06-push-dedup/spec.md) | Spec ready for implement. 8 FRs cover ID-set dedup helper (`getPrevIds`/`savePrevIds`), first-run seed, legacy-key cleanup, non-manager gate, write-failure resilience, and sign-out wipe extension. Addresses §8.1 count-based-dedup root cause of the Thursday burst. |
| 2026-05-28 | 06-push-dedup | Complete. `handleBackgroundPush` now dedups by `Set<string>` of stable `ApprovalItem.id` values (`mt-…` / `ot-…`) persisted to AsyncStorage key `prev_approval_ids`. First-run seeds without firing; legacy `prev_approval_count` removed on every write. `clearAll` wipes both keys. Commits `1568343` (spec), `6dd7e1a` (red tests, +20 failing), `ee5cf05` (impl, suite 3909/3909 green), `e2a5aec` (docs: README + ARCHITECTURE §1.3 / §2 / §3.2 / §8.1 marked resolved). Manual TestFlight scenarios deferred to release smoke test. |
| 2026-05-28 | [03-error-envelope](specs/03-error-envelope/spec.md) | Complete. `ApiError` and `AuthError` now surface `{errorCode, type, text}` from Crossover's structured error responses. `handleStatus` reads the body defensively (HTML / empty / malformed JSON all leave envelope undefined). Commits `163ee26` (spec), `0c18f45` (red tests), `4a3fec5` (impl). Full suite 3886/3886 green. Unblocks specs 04 and 05. |
| 2026-05-28 | [04-auth-resilience](specs/04-auth-resilience/spec.md) | Complete. In-memory token cache (request-dedup via shared in-flight promise) + Tomcat HTML 5xx → `AuthError(401, AUTH_HTML_500)` synthetic envelope. `apiGet`/`apiPut` gain an opt-in fifth `creds` arg for single-retry on auth failure (existing 49 call sites compile unchanged). `probeEnvironments` bypasses the cache via new exported `mintAuthToken`. `app/modal.tsx` wipes the cache on sign-out (`handleSignOut`, try/finally) and before env switch (`handleSwitchEnvironment`, before `fetchAndBuildConfig`). Commits `67923e9` (spec), `55c212b` (red tests, 30 failing), `8dc87f4` (impl). 114/114 across the 7 directly-affected test suites; 69/69 across hook/lib tests that consume `getAuthToken` via mock. ARCHITECTURE.md §8.5 marked resolved; §6.3 updated. Resolves CROSSOVER_API §15.F1 (per-request mint) and §15.F3 (HTML 500 = auth failure). |
| 2026-05-28 | [08-observability-log](specs/08-observability-log/spec.md) | Complete. Local JSONL error log at `documentDirectory + hourglass-debug.log` written by `src/lib/log.ts` (singleton; `info`/`warn`/`error`/`flush`/`getLogFileUri`/`clear`). Buffered 3 s flushes, 200 KB rolling cap with mid-line-preserving rotation, never throws (I/O failures swallowed). Redaction at write time via `src/lib/redact.ts` — deny-by-default key list (password, auth\*, \*Id with count/length/size exception, username/email/memo/description/text/message/body/headers) + credential-shaped value scrubbers (Basic / Bearer / long-base64 / token-shaped). Errors capture `err.constructor.name` only; `.message` never written (verified against an `AuthError(401, 'SECRET_MARKER')` assertion). Zero network surface — module imports only `expo-file-system/legacy` and `./redact`; FR10 enforced by import-graph + `global.fetch` monkey-patch tests. `app/modal.tsx` gains a "Debug Log" section visible to **all users** (not gated behind `isMe`) with "Share log" (`Sharing.shareAsync` with `mimeType: 'text/plain'`) and "Clear log" (destructive Alert confirm → `log.clear()`). Two new deps: `expo-file-system ~55.0.22`, `expo-sharing ~55.0.20`. Mocks at `__mocks__/expo-file-system/{index,legacy}.ts` and `__mocks__/expo-sharing.ts`. Commits `bfecf57` (spec), `f86ca62` (red tests + deps + mocks, +54 failing), `49eb43b` (impl, suite 4025/4025 green — note: this commit accidentally bundled in-flight changes from concurrent specs 04/07 due to a shared workdir; those bundled files were already correct from those specs' uncommitted work, no semantic conflict). ARCHITECTURE.md §6.5 (`src/lib/`), §5.4 (Settings route), §8.9 (new "no automatic phone-home" invariant) updated. TestFlight scenarios + call-site wiring deferred per spec's Out of Scope §1. |
