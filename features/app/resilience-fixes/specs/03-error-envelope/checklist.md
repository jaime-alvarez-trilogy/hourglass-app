# Checklist — Spec 03 — Capture Crossover's structured error envelope

**Status:** complete
**Last updated:** 2026-05-28

---

## Phase 3.0 — Test foundation (TDD red phase)

- [x] Create `__tests__/error-envelope.test.ts` covering all of FR1–FR4:
  - [x] FR1.a `ApiError` with envelope populates `errorCode`, `errorType`, `serverText`.
  - [x] FR1.b `ApiError` without envelope leaves the three fields `undefined`.
  - [x] FR1.c `ApiError` instanceof checks still pass with envelope.
  - [x] FR2.a `AuthError` with envelope populates `errorCode`, `serverText`.
  - [x] FR2.b `AuthError` without envelope leaves the two fields `undefined`.
  - [x] FR2.c `AuthError` instanceof checks still pass with envelope.
  - [x] FR3.a `apiGet` on 400 + envelope JSON body → thrown `ApiError` has `errorCode`, `errorType`, `serverText` populated.
  - [x] FR3.b `apiGet` on 403 + envelope JSON body (`CROS-0002`) → thrown `AuthError` has `errorCode`, `serverText` populated.
  - [x] FR3.c `apiPut` on 400 + envelope JSON body → same as FR3.a.
  - [x] FR3.d `getAuthToken` on 403 + envelope JSON body → `AuthError` has envelope fields populated.
  - [x] FR4.a HTML 500 body → `ApiError(500)` with envelope fields undefined, no exception escapes.
  - [x] FR4.b Empty body → `ApiError(502)` with envelope fields undefined.
  - [x] FR4.c JSON without `errorCode` (`{"message":"oops"}`) → `ApiError(422)` with envelope fields undefined.
  - [x] FR4.d Truncated/malformed JSON → `ApiError(400)` with envelope fields undefined.
  - [x] FR4.e JSON with empty-string `errorCode` → treated as no envelope (fields undefined).
  - [x] FR4.f (bonus) JSON array body → no envelope.
- [x] Run `npm test -- __tests__/error-envelope.test.ts` and confirm red phase (6/16 failed as expected).
- [x] **Commit:** `test(03-error-envelope): add envelope-parsing tests for client and errors` (`0c18f45`)

## Phase 3.1 — Implementation (TDD green phase)

- [x] Modify `src/api/errors.ts`:
  - [x] Add `ErrorEnvelope` type (exported).
  - [x] Add `envelope?: ErrorEnvelope` third parameter and `errorCode` / `serverText` properties to `AuthError`.
  - [x] Add `envelope?: ErrorEnvelope` third parameter and `errorCode` / `errorType` / `serverText` properties to `ApiError`.
  - [x] Confirm `Object.setPrototypeOf` lines remain (so instanceof checks survive).
- [x] Modify `src/api/client.ts`:
  - [x] Rewrite `handleStatus(status: number)` → `handleStatus(response: Response): Promise<never>`. Reads body, parses envelope defensively (try/catch around `JSON.parse`), filters on non-empty string `errorCode`, ignores non-object / array shapes, throws appropriate error with envelope.
  - [x] Update `apiGet` call site: `if (!response.ok) await handleStatus(response);`.
  - [x] Update `apiPut` call site: `if (!response.ok) await handleStatus(response);`.
  - [x] In `getAuthToken`, replace the three explicit `throw new AuthError/ApiError` lines (formerly 27-29) with `await handleStatus(response)`. Verified the success-path `response.text()` on line 29 still works (handleStatus only runs on `!response.ok`, mutually exclusive).
- [x] Confirm existing test mocks survive — no `__tests__/client.test.ts` or `src/__tests__/api/client.test.ts` updates were actually needed; existing `text:` stubs covered the new path. `errors.test.ts` also passes unchanged.
- [x] Run `npm test` and confirm all suites pass (existing + new envelope tests): **140 suites, 3886/3886 tests green**.
- [x] `npx tsc --noEmit src/api/client.ts src/api/errors.ts` → clean.
- [x] **Commit (impl):** `feat(03-error-envelope): capture structured error envelope on ApiError and AuthError` (`4a3fec5`)
  - No separate `fix(resilience-fixes)` commit needed for test mocks (they already had `text:` stubs in the relevant test files — see Notes below).

## Phase 3.2 — Review

- [x] Spec-implementation alignment: FR1 → `errors.ts:37-52`; FR2 → `errors.ts:12-26`; FR3 → `client.ts:50-79`; FR4 → `client.ts:52-74` defensive try/catch + shape filter; FR5 → 3886/3886 green.
- [x] Full `npm test` re-run after final implementation: clean.
- [x] Inline self-review of `client.ts:50-79` — envelope filter requires object, not array, non-empty string `errorCode`. `httpStatus` from the body is intentionally ignored (we trust `response.status`). `type` and `text` are type-checked to be strings before being captured.
- [x] No multi-agent `/review-pr` posted — repo is local, no PR open. Self-review covered the same surface.

## Phase 3.3 — Documentation

- [x] Update `features/app/resilience-fixes/FEATURE.md` changelog row for spec 03.
- [x] Mark all checklist tasks `[x]`.
- [x] Add session notes below.
- [x] **Commit:** `docs(03-error-envelope): mark complete and update FEATURE.md`

---

## Session Notes

**2026-05-28** — Spec executed in a single session. Three implementation commits plus a docs commit.

**Decisions made during execution (one Andon-class call):**

The research's interface-contract sketch (lines 64-93 of `spec-research.md`) proposed `constructor(message: string, statusCode: number, envelope?)`. The actual production signatures were `(statusCode, message?)` — positional, no message in any current call site. Changing parameter order would have broken every existing test (`errors.test.ts`, `client.test.ts`, hook tests, etc.). Per the Andon policy I paused and resolved with an **additive** change: envelope is now the third positional parameter, existing signatures unchanged. This preserves spec-research's stated **principle** ("Add fields to ApiError, not new classes") while keeping the contract stable. Decision documented in `spec.md` §"Decisions" D1.

**Test-mock changes:** None required. The two test files the spec.md flagged for mock updates (`__tests__/client.test.ts`, `src/__tests__/api/client.test.ts`) already provided `text:` stubs on success paths, and the error-path mocks survive because `response.text()` on a missing stub returns `undefined`, which the try/catch in `handleStatus` swallows cleanly. Verified by running the full 3886-test suite — zero regressions.

**Outstanding work / handoff to downstream specs:**
- Spec 04 (auth-resilience) can now read `error.errorCode === 'CROS-0002'` to distinguish "real auth failure" from a Tomcat 500 HTML page.
- Spec 05 (onboarding-defense) can now read `error.errorCode === 'CROS-0005'` and `error.serverText` to surface validation messages.
- Spec 08 (observability-log) can now log envelope fields when logging errors.

**Live-QA probe extension:** Skipped (Tier 2 marked △ in spec.md). The envelope shape was already captured in `docs/api-samples/04-timesheet.json` and `05-payments-current-week.json` during the §15 probe. Adding a redundant probe function would be busy-work.
