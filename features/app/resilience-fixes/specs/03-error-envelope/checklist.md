# Checklist — Spec 03 — Capture Crossover's structured error envelope

**Status:** in_progress
**Last updated:** 2026-05-28

---

## Phase 3.0 — Test foundation (TDD red phase)

- [ ] Create `__tests__/error-envelope.test.ts` covering all of FR1–FR4:
  - [ ] FR1.a `ApiError` with envelope populates `errorCode`, `errorType`, `serverText`.
  - [ ] FR1.b `ApiError` without envelope leaves the three fields `undefined`.
  - [ ] FR1.c `ApiError` instanceof checks still pass with envelope.
  - [ ] FR2.a `AuthError` with envelope populates `errorCode`, `serverText`.
  - [ ] FR2.b `AuthError` without envelope leaves the two fields `undefined`.
  - [ ] FR2.c `AuthError` instanceof checks still pass with envelope.
  - [ ] FR3.a `apiGet` on 400 + envelope JSON body → thrown `ApiError` has `errorCode`, `errorType`, `serverText` populated.
  - [ ] FR3.b `apiGet` on 403 + envelope JSON body (`CROS-0002`) → thrown `AuthError` has `errorCode`, `serverText` populated.
  - [ ] FR3.c `apiPut` on 400 + envelope JSON body → same as FR3.a.
  - [ ] FR3.d `getAuthToken` on 403 + envelope JSON body → `AuthError` has envelope fields populated.
  - [ ] FR4.a HTML 500 body → `ApiError(500)` with envelope fields undefined, no exception escapes.
  - [ ] FR4.b Empty body → `ApiError(502)` with envelope fields undefined.
  - [ ] FR4.c JSON without `errorCode` (`{"message":"oops"}`) → `ApiError(422)` with envelope fields undefined.
  - [ ] FR4.d Truncated/malformed JSON → `ApiError(400)` with envelope fields undefined.
  - [ ] FR4.e JSON with empty-string `errorCode` → treated as no envelope (fields undefined).
- [ ] Run `npm test -- __tests__/error-envelope.test.ts` and confirm the new tests fail with "not implemented" / "envelope undefined" messages (red phase).
- [ ] **Commit:** `test(03-error-envelope): add envelope-parsing tests for client and errors`

## Phase 3.1 — Implementation (TDD green phase)

- [ ] Modify `src/api/errors.ts`:
  - [ ] Add `ErrorEnvelope` type.
  - [ ] Add `envelope?: ErrorEnvelope` third parameter and `errorCode` / `serverText` properties to `AuthError`.
  - [ ] Add `envelope?: ErrorEnvelope` third parameter and `errorCode` / `errorType` / `serverText` properties to `ApiError`.
  - [ ] Confirm `Object.setPrototypeOf` lines remain (so instanceof checks survive).
- [ ] Modify `src/api/client.ts`:
  - [ ] Rewrite `handleStatus(status: number)` → `handleStatus(response: Response): Promise<never>`. Reads body, parses envelope defensively (try/catch around `JSON.parse`), filters on non-empty string `errorCode`, throws appropriate error with envelope.
  - [ ] Update `apiGet` call site: `if (!response.ok) await handleStatus(response);`.
  - [ ] Update `apiPut` call site: `if (!response.ok) await handleStatus(response);`.
  - [ ] In `getAuthToken`, replace the three explicit `throw new AuthError/ApiError` lines (currently 27-29) with `await handleStatus(response)`. Verify the existing `response.text()` on line 31 still works (it does — `handleStatus` only runs when `!response.ok`, and the success path is mutually exclusive).
- [ ] Update `__tests__/client.test.ts` error-path mocks:
  - [ ] Lines 106-107, 113-114, 120-121, 171-172, 178-179 — add `text: async () => ''` to each `mockFetch.mockResolvedValueOnce({ ok: false, status, json: ... })` block. (Or replace `json:` with `text:` since the new code path reads text only.)
- [ ] Update `src/__tests__/api/client.test.ts`:
  - [ ] In `makeErrorResponse`, add `text: async () => JSON.stringify({ error: 'error' })` (or `''`). Either works — the error has no `errorCode` so envelope stays undefined.
- [ ] Run `npm test` and confirm all suites pass (existing + new envelope tests).
- [ ] **Commit (impl):** `feat(03-error-envelope): capture structured error envelope on ApiError and AuthError`
- [ ] **Commit (test mocks):** `fix(resilience-fixes): add response.text() stubs to client test mocks` — this can be folded into the feat commit if it touches the same files, but separating keeps history clean.

## Phase 3.2 — Review

- [ ] Run the `spec-implementation-alignment` agent on `features/app/resilience-fixes/specs/03-error-envelope`. Verify spec.md FRs map 1:1 to implementation.
- [ ] Run `npm test` one final time. Confirm zero regressions.
- [ ] Run `npx tsc --noEmit src/api/client.ts src/api/errors.ts __tests__/error-envelope.test.ts` (or whatever the project's tsc invocation is — best-effort given the known 419-error baseline).
- [ ] Multi-agent `/review-pr` (read-only or dispatch-only — repo isn't pushed). Address any findings.
- [ ] **Commit (fixes if any):** `fix(03-error-envelope): address review feedback`

## Phase 3.3 — Documentation

- [ ] Update `features/app/resilience-fixes/FEATURE.md` changelog row for spec 03.
- [ ] Mark all checklist tasks above `[x]`.
- [ ] Add session notes section at the bottom of this file.
- [ ] **Commit:** `docs(03-error-envelope): mark complete and update FEATURE.md`

---

## Session Notes

_(to be filled at completion)_
