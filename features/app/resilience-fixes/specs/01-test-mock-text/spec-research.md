# Spec 01 — Fix `.text()` mock in `__tests__/approvals-api.test.ts`

**Status:** Research complete
**Complexity:** S
**Blocks:** Everything downstream (we want CI green from spec 02 onward).

## Problem context

The mutation tests in `__tests__/approvals-api.test.ts` have been failing since commit `1adca60` switched `apiPut` to read `response.text()` before parsing JSON (to handle Crossover's empty-body 200 responses on approve/reject endpoints).

The mock response helper `successEmpty()` in that file returns `{ ok: true, status: 200, json: async () => ({}) }` — no `.text()` method. Production code at `src/api/client.ts:97-101` now calls `await response.text()`, which throws `TypeError: response.text is not a function`.

This is the same regression I fixed in `__tests__/client.test.ts` and `src/__tests__/api/client.test.ts` in commit `1adca60`, but `__tests__/approvals-api.test.ts` was missed.

**Impact today:** 13 failing tests, 1 failing suite at baseline. Confusing CI signal (when we add CI in spec 02) — green/red distinguishability matters.

## Exploration findings

- `__tests__/approvals-api.test.ts` defines a helper `successEmpty()` (around line 33) used by every approve/reject test.
- Tests assert on outgoing request shape (URL, method, headers, body) — they don't care about the response value beyond it not throwing.
- The matching `apiPut` change is at `src/api/client.ts:97-101`:
  ```typescript
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
  ```

## Key decisions

**Add `.text: async () => ''` to `successEmpty()`.** Don't restructure the test file. Don't refactor the helper into a shared utility (premature — only used in this file). Matching the production contract is the minimum change.

## Interface contracts

No new types. No code changes outside the test file.

## Test plan

This *is* a test fix. Verification:

- [ ] Before: `npx jest __tests__/approvals-api.test.ts` → 13 failed, 6 passed
- [ ] After: `npx jest __tests__/approvals-api.test.ts` → 19 passed
- [ ] Full suite: 139/139 suites pass (baseline today is 138/139 with this as the only red)

## Files to reference

| File | Why |
|---|---|
| `__tests__/approvals-api.test.ts` | The file being fixed. |
| `src/api/client.ts:77-102` | The production `apiPut` whose contract the mocks must match. |
| `__tests__/client.test.ts` | Reference: how I fixed the same issue elsewhere in commit `1adca60`. The fix here should mirror the pattern. |
| `src/__tests__/api/client.test.ts` | Reference: second example. The `makeOkResponse` helper there got a `text: async () => JSON.stringify(body)` line. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | Suite goes green |
| Live-QA probe | ✗ | No API change |
| TestFlight | ✗ | No runtime change |
| Error log | ✗ | No production behavior change |
