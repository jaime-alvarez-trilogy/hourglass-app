# Spec 03 — Capture Crossover's structured error envelope

**Status:** Ready for implementation
**Created:** 2026-05-28
**Last Updated:** 2026-05-28
**Owner:** @jaime-alvarez-trilogy
**Complexity:** S
**Blocks:** 04 (auth-resilience), 05 (onboarding-defense)
**Blocked by:** 02 (ci-pipeline)

---

## Overview

When a Crossover API call fails with a 4xx or 5xx, the server frequently returns a structured JSON envelope:

```json
{
  "errorCode": "CROS-XXXX",
  "type": "ERROR",
  "httpStatus": 400,
  "text": "Sorry, \"teamId\" is not a valid value. Retry the operation with a valid value."
}
```

Today, `handleStatus(status)` in `src/api/client.ts:49-53` throws `AuthError(401|403)` or `ApiError(status)` with only the HTTP status code — the envelope is discarded. This spec captures the envelope on the thrown error so that:

- Spec 04 can distinguish a real auth failure (`CROS-0002` on 403) from a Tomcat 500 HTML page (no envelope).
- Spec 05 can recognize validation failures (`CROS-0005`) and pull the bad-field name from `text`.
- Debugging from logs shows *which* validation failed, not just "got a 400."

The change is **additive only**: no existing function signature changes, no existing test should regress without a trivial mock update.

---

## Out of Scope

1. **Displaying `serverText` in the UI.** Some envelope `text` fields are user-safe (`CROS-0005` validation), others embed internal reference codes (`CROS-0400`). Callers decide what to show. Surfaced by specs 04 / 05.

2. **Logging envelope fields.** Spec 08 (observability-log) will include `errorCode` and `serverText` in the local error log.

3. **Retry-on-error policy.** Out of scope — captured under "no retry policy" in `docs/CROSSOVER_API.md` §13.

4. **Typed `errorCode` enum.** Codes are kept as free `string` (e.g. `"CROS-0005"`). A literal-union type would force every consumer to know the full set; the set isn't documented by Crossover, so any list we wrote would be incomplete.

5. **Changing the existing `(statusCode, message?)` constructor signatures.** See "Decisions" below — envelope is appended as a third optional parameter to keep all existing call sites working unchanged.

---

## Decisions

### D1 — Envelope is the third constructor parameter, not a replacement

The research's interface contract sketch (`spec-research.md` lines 64-93) proposed `constructor(message: string, statusCode: number, envelope?)`. The current production signatures are `AuthError(statusCode: 401|403, message?)` and `ApiError(statusCode: number, message?)`. Changing position would break **every** call site (~12 in production code and tests).

**Decision:** Append envelope as an additional optional parameter:

```typescript
new AuthError(statusCode, message?, envelope?)
new ApiError(statusCode, message?, envelope?)
```

Production code does not pass a `message` today, so the spec implementation will pass `undefined` for the message slot when an envelope is present. This is consistent with the spec-research **principle** ("Add fields to `ApiError`, not new classes" §1) while preserving the actual contract.

### D2 — Envelope-extraction does not throw

If the response body is empty, non-JSON, or JSON without an `errorCode` field, the catch-all path swallows the parse failure and leaves envelope undefined. The thrown `ApiError` / `AuthError` is unchanged from today. **The new code can never make an already-failing request fail in a worse way.**

### D3 — Envelope shape filter

We accept `{ errorCode, type, text }` from the body only when `errorCode` is a non-empty string. Other shapes (e.g. `{ message: "..." }`) are ignored — they aren't the Crossover envelope and would mislead callers. `httpStatus` from the body is ignored; we trust `response.status`.

---

## Functional requirements

**FR1.** `ApiError` MUST accept an optional `envelope` parameter on its constructor and MUST expose `errorCode`, `errorType`, and `serverText` properties.
- **Success criteria:**
  - `new ApiError(400, undefined, { errorCode: 'CROS-0005', type: 'ERROR', text: 'bad teamId' })` produces an instance with `statusCode === 400`, `errorCode === 'CROS-0005'`, `errorType === 'ERROR'`, `serverText === 'bad teamId'`.
  - `new ApiError(500)` (no envelope) produces an instance with `statusCode === 500` and `errorCode`, `errorType`, `serverText` all `undefined`.
  - The instance is still `instanceof ApiError` and `instanceof Error`.

**FR2.** `AuthError` MUST accept an optional `envelope` parameter on its constructor and MUST expose `errorCode` and `serverText` properties. (`errorType` is omitted for `AuthError` to keep parity with the spec-research interface — `AuthError` is by definition `type === 'ERROR'`.)
- **Success criteria:**
  - `new AuthError(403, undefined, { errorCode: 'CROS-0002', text: 'forbidden' })` produces an instance with `statusCode === 403`, `errorCode === 'CROS-0002'`, `serverText === 'forbidden'`.
  - `new AuthError(401)` (no envelope) produces an instance with `errorCode === undefined` and `serverText === undefined`.
  - The instance is still `instanceof AuthError` and `instanceof Error`.

**FR3.** `handleStatus` in `src/api/client.ts` MUST read the response body before throwing and pass the parsed envelope (if any) to the thrown error.
- **Success criteria:**
  - Mock response with `text: async () => '{"errorCode":"CROS-0005","type":"ERROR","text":"bad teamId"}'` and `status: 400` → thrown `ApiError` has `errorCode === 'CROS-0005'`, `errorType === 'ERROR'`, `serverText === 'bad teamId'`.
  - Mock response with `text: async () => '{"errorCode":"CROS-0002","text":"forbidden"}'` and `status: 403` → thrown `AuthError` has `errorCode === 'CROS-0002'`, `serverText === 'forbidden'`.
  - `handleStatus` becomes async (or its caller awaits it) — function signature changes from `(status: number): never` to `(response: Response): Promise<never>`.

**FR4.** Envelope extraction MUST be defensive — non-JSON, malformed JSON, empty body, or JSON without `errorCode` MUST NOT throw or change the resulting error's `statusCode`.
- **Success criteria:**
  - Mock response with `text: async () => '<!doctype html>HTTP 500'` and `status: 500` → thrown `ApiError` with `statusCode === 500`, all envelope fields undefined. No exception escapes.
  - Mock response with `text: async () => ''` and `status: 502` → thrown `ApiError` with `statusCode === 502`, envelope fields undefined.
  - Mock response with `text: async () => '{"message":"oops"}'` (alt error shape, no `errorCode`) and `status: 422` → `ApiError(422)`, envelope fields undefined.
  - Mock response with `text: async () => '{"errorCode":'` (truncated JSON) and `status: 400` → `ApiError(400)`, envelope fields undefined.

**FR5.** Existing tests in `__tests__/client.test.ts`, `__tests__/errors.test.ts`, and `src/__tests__/api/client.test.ts` MUST continue to pass after the change. Mocks that previously only stubbed `response.json` for the error path MUST be updated to also stub `response.text` so the new envelope-reader does not break them.
- **Success criteria:**
  - `npm test` shows the same green count it does today, with no `TypeError: response.text is not a function` from the suites listed above.
  - No test assertion that currently passes is loosened or removed.

---

## Technical design

### Files to modify

| File | Change |
|---|---|
| `src/api/errors.ts` | Add optional `envelope` parameter and `errorCode` / `errorType` / `serverText` properties to `ApiError` and `AuthError`. |
| `src/api/client.ts` | Rewrite `handleStatus` to read the body, parse envelope defensively, and pass it to the thrown error. Update the two call sites (`apiGet`, `apiPut`) to `await` it. Update `getAuthToken` to pass envelope on 401/403/other-error throws. |
| `__tests__/client.test.ts` | Add `text:` stubs to the error-path mocks (currently only have `json:`). |
| `src/__tests__/api/client.test.ts` | Add `text:` stub to `makeErrorResponse`. |

### Files to create

| File | Purpose |
|---|---|
| `__tests__/error-envelope.test.ts` | New unit tests covering FR1–FR4. |

### Implementation sketch

`src/api/errors.ts`:

```typescript
type ErrorEnvelope = {
  errorCode?: string;
  type?: string;
  text?: string;
};

export class AuthError extends Error {
  statusCode: 401 | 403;
  errorCode?: string;
  serverText?: string;
  constructor(statusCode: 401 | 403, message?: string, envelope?: ErrorEnvelope) {
    super(message ?? `Authentication failed (${statusCode})`);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.errorCode = envelope?.errorCode;
    this.serverText = envelope?.text;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export class ApiError extends Error {
  statusCode: number;
  errorCode?: string;
  errorType?: string;
  serverText?: string;
  constructor(statusCode: number, message?: string, envelope?: ErrorEnvelope) {
    super(message ?? `API error (${statusCode})`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = envelope?.errorCode;
    this.errorType = envelope?.type;
    this.serverText = envelope?.text;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
```

`src/api/client.ts` — new `handleStatus`:

```typescript
async function handleStatus(response: Response): Promise<never> {
  let envelope: { errorCode?: string; type?: string; text?: string } | undefined;
  try {
    const bodyText = await response.text();
    if (bodyText) {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === 'object' && typeof parsed.errorCode === 'string' && parsed.errorCode.length > 0) {
        envelope = {
          errorCode: parsed.errorCode,
          type: typeof parsed.type === 'string' ? parsed.type : undefined,
          text: typeof parsed.text === 'string' ? parsed.text : undefined,
        };
      }
    }
  } catch {
    // Non-JSON body (HTML 500 page, etc) — envelope stays undefined.
  }

  if (response.status === 401) throw new AuthError(401, undefined, envelope);
  if (response.status === 403) throw new AuthError(403, undefined, envelope);
  throw new ApiError(response.status, undefined, envelope);
}
```

Call sites become `if (!response.ok) await handleStatus(response);`. Inside `getAuthToken`, the three explicit `throw new AuthError/ApiError` lines (lines 27-29) are replaced with `await handleStatus(response)` to centralize envelope reading. **However** that loses the `text` read on line 31; the body has to be consumed exactly once. To keep `getAuthToken` simple, we keep its current path and just inline a small `readEnvelope(response)` helper for the three throws — see implementation note in the checklist.

### Cross-spec test fix

The two existing test files that stub `makeErrorResponse(...)` with only `json:` will get `text: async () => JSON.stringify(body)` added so the new code path can read them. The change is mechanical and documented in the checklist. These edits are committed under `fix(resilience-fixes): update client test mocks for envelope parsing` since they aren't a behavior change in spec 03 — they're test-mock drift that this spec exposes.

---

## Verification

| Tier | Applies? | How |
|---|---|---|
| Unit | ✓ | New `__tests__/error-envelope.test.ts` covers FR1–FR4. Existing suites cover FR5. |
| Live-QA probe | △ | Optional. The envelope shape was already captured in §15.F4 (samples `04-timesheet.json`, `05-payments-current-week.json`). Not adding a new probe function in this spec — the data exists. |
| TestFlight | ✗ | No user-visible UI change. Specs 04/05 will surface server messages. |
| Error log review | ✗ | Spec 08 will log envelope fields. |

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Reading `response.text()` consumes the body and breaks success-path JSON reads. | Low | `handleStatus` only runs on `!response.ok`; success-path code does not call it. Test FR3 covers an error path and FR5 covers all happy paths. |
| Some endpoint returns a *huge* error body (multi-MB HTML), so `await response.text()` is slow. | Very low | Crossover error bodies observed are <2 KB. If this materializes, add a size cap in a follow-up. |
| A consumer somewhere already accesses `.errorCode` / `.serverText` on an `ApiError` and gets a different value now. | None | Grep confirms no production or test code reads these fields today. |
| `Response.text()` is not implemented on the jest fetch mocks → tests crash. | Confirmed | Already addressed in FR5 — test-mock updates ship in the same change set. |

---

## Open questions

None — research-stage decisions were confirmed against the live API in `docs/CROSSOVER_API.md` §15.F4.
