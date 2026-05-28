# Spec 01 — Fix `.text()` mock in `__tests__/approvals-api.test.ts`

**Status:** Ready for implementation
**Complexity:** S
**Type:** Test-only fix (no production code changes)

## Goal

Align the mock response helper `successEmpty()` in `__tests__/approvals-api.test.ts` with the production contract enforced by `apiPut` in `src/api/client.ts`. The production code reads `response.text()` before parsing JSON; the mock currently exposes only `.json()`, causing `TypeError: response.text is not a function` on every mutation test.

## Functional requirements

**FR1.** `successEmpty()` MUST return a response-shaped object whose `text()` method resolves to an empty string (`''`), matching the empty-body 200 contract of the production approve/reject endpoints.

**FR2.** All other helpers in the file (`successJson()`, `errorResponse()`) MAY remain unchanged — they are exercised by code paths that don't call `.text()` (GETs use `.json()`; error paths short-circuit at `handleStatus()` before `.text()` is reached).

**FR3.** No production code changes. No file restructure. No refactor of the helper into a shared utility.

## Non-goals

- Refactoring the test file.
- Promoting the mock helper to a shared utility (deferred — only used here).
- Touching `successJson()` or `errorResponse()`.
- Changing any production code.

## Acceptance

- `npx jest __tests__/approvals-api.test.ts` exits 0 with all tests passing.
- Full suite shows no regressions vs. baseline.
- Diff is a single-line addition inside `successEmpty()`.
