# Spec 03 — Capture Crossover's structured error envelope

**Status:** Research complete
**Complexity:** S
**Blocks:** 04 (auth-resilience uses errorCode to distinguish auth errors), 05 (onboarding-defense uses errorCode to identify validation failures).

## Problem context

Live probe (`docs/CROSSOVER_API.md` §15 F4) confirmed Crossover returns a structured error envelope on most server-handled failures:

```json
{
  "errorCode": "CROS-XXXX",
  "type": "ERROR",
  "httpStatus": 400,
  "text": "Sorry, \"teamId\" is not a valid value. Retry the operation with a valid value."
}
```

Codes observed:

| `errorCode` | Status | Meaning |
|---|---|---|
| `CROS-0002` | 403 | Forbidden (e.g. payments endpoint for a manager without contributor role) |
| `CROS-0005` | 400 | Validation failure — `text` names the bad field |
| `CROS-0400` | 400 | Generic internal error with a reference code in `text` |

Today, `src/api/client.ts:42-52` (`handleStatus`) throws `AuthError(401|403)` or `ApiError(other)` with only a status code. The structured envelope is **discarded**. As a result:

- UI cannot show validation messages from `CROS-0005` (we get "something went wrong" instead of "your teamId is wrong").
- Debugging from logs is harder — we know "got a 400" but not which field.
- Spec 04 (auth-resilience) needs `errorCode` to distinguish a real auth failure from a bad-token Tomcat 500 — without the envelope, it can't.

## Exploration findings

- `src/api/errors.ts` defines three classes: `AuthError`, `NetworkError`, `ApiError`. Each currently takes only `(message: string)` plus `statusCode` on `ApiError`.
- `apiGet`/`apiPut` in `src/api/client.ts` read response as JSON (or text-then-JSON for empty PUT) — they don't read the error body separately.
- `handleStatus(status)` is called when `!response.ok`. It throws immediately based on status alone, without reading the body.
- Some responses are **not** JSON (HTML 500 page for bad tokens — see spec 04). Parser must be defensive.

## Key decisions

**1. Add fields to `ApiError` (and `AuthError`), not new classes.** The error type is already correct — we just need richer information.

```typescript
class ApiError extends Error {
  statusCode: number;
  errorCode?: string;        // "CROS-0005"
  errorType?: string;         // "ERROR"
  serverText?: string;        // Human-readable; not always safe to display
}
```

**2. Read the error body in `handleStatus`, fail open.** If body is not parseable JSON or doesn't have the envelope shape, fall back to current behavior (just status code). Never let envelope parsing throw.

**3. `serverText` is not user-safe by default.** Some codes (`CROS-0005` validation) have human-readable messages we *could* show; others (`CROS-0400` generic error) include internal reference codes that aren't user-safe. Callers decide. The doc captures which codes are safe.

**4. Don't change function signatures.** `apiGet`/`apiPut` still throw the same exceptions; consumers just get more info on the error object.

## Interface contracts

### `src/api/errors.ts`

```typescript
export class ApiError extends Error {
  statusCode: number;
  errorCode?: string;       // CROS-XXXX, parsed from response.errorCode
  errorType?: string;       // Usually "ERROR"
  serverText?: string;      // response.text — server's human-readable msg
  constructor(message: string, statusCode: number, envelope?: {
    errorCode?: string;
    type?: string;
    text?: string;
  }) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = envelope?.errorCode;
    this.errorType = envelope?.type;
    this.serverText = envelope?.text;
  }
}

// Same shape extension for AuthError (some 403s have envelopes too — CROS-0002)
export class AuthError extends Error {
  statusCode: number;
  errorCode?: string;
  serverText?: string;
  constructor(message: string, statusCode: number, envelope?: {
    errorCode?: string;
    text?: string;
  }) { /* ... */ }
}
```

### `src/api/client.ts`

```typescript
async function handleStatus(response: Response): Promise<never> {
  let envelope: { errorCode?: string; type?: string; text?: string } | undefined;
  try {
    const bodyText = await response.text();
    if (bodyText) {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === 'object' && parsed.errorCode) {
        envelope = { errorCode: parsed.errorCode, type: parsed.type, text: parsed.text };
      }
    }
  } catch {
    // Non-JSON body (e.g. HTML 500 page). envelope stays undefined.
  }

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Auth failed: ${response.status}`, response.status, envelope);
  }
  throw new ApiError(`API error: ${response.status}`, response.status, envelope);
}
```

**Sources:**
- `errorCode`, `type`, `text` ← API: any 4xx/5xx response body JSON
- All envelope fields optional; absent for non-JSON error bodies (HTML 500, network errors)

## Test plan

### Unit tests (`__tests__/error-envelope.test.ts`, new)

**Happy path — JSON envelope present:**
- [ ] 400 with `{errorCode: "CROS-0005", type: "ERROR", text: "..."}` → `ApiError` has `errorCode`, `errorType`, `serverText` populated.
- [ ] 403 with `{errorCode: "CROS-0002", ...}` → `AuthError` has `errorCode`, `serverText` populated.

**Edge cases:**
- [ ] Non-JSON body (HTML 500 page, plain text 503) → throws appropriate error without envelope fields. Doesn't crash.
- [ ] Empty body → throws appropriate error without envelope fields.
- [ ] JSON body without `errorCode` field (`{message: "..."}` style) → throws without envelope (envelope only set when `errorCode` present).
- [ ] Malformed JSON (`{errorCode:` truncated) → throws without envelope.

**Integration with existing tests:**
- [ ] `__tests__/client.test.ts` AuthError(401) and ApiError(500) tests still pass (no envelope, but the assertions don't check for one).
- [ ] No existing test should regress.

### Live-QA probe extension (`scripts/probe-crossover-api.mjs`)

Add a function that hits a known-bad endpoint and asserts envelope parsing:

```typescript
async function verifyErrorEnvelope() {
  // Hit /payments with bad date format → CROS-0005 expected
  const r = await fetch(`${BASE}/api/v3/users/current/payments?from=bad&to=date`, {
    headers: { 'x-auth-token': token },
  });
  const body = await r.json();
  assert(body.errorCode?.startsWith('CROS-'), 'envelope missing errorCode');
  assert(body.type === 'ERROR', 'envelope missing type=ERROR');
  console.log(`  envelope verified: ${body.errorCode}`);
}
```

Captures the actual envelope shape into `docs/api-samples/10-error-envelope.json`.

## Files to reference

| File | Why |
|---|---|
| `src/api/errors.ts` | Add fields to error classes. |
| `src/api/client.ts:42-52` | Modify `handleStatus` to read body before throwing. |
| `src/api/client.ts:60-73, 86-101` | `apiGet`, `apiPut` — these call `handleStatus`. Signature unchanged. |
| `docs/api-samples/04-timesheet.json` | Real `CROS-0400` and `CROS-0005` examples. |
| `docs/api-samples/05-payments-current-week.json` | Real `CROS-0002` example. |
| `docs/CROSSOVER_API.md` §13, §15.F4 | Doc describing the envelope contract. |
| `__tests__/client.test.ts`, `src/__tests__/api/client.test.ts` | Existing tests; must not regress. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit | ✓ | New tests in `__tests__/error-envelope.test.ts` |
| Live-QA probe | ✓ | New `verifyErrorEnvelope()` in probe script; sample saved |
| TestFlight | ✗ | No user-visible UI in this spec. Spec 04/05 will surface server messages. |
| Error log | ✗ | Spec 08 will log envelope fields when present |

## Out of scope for this spec (handed to downstream)

- **Showing `serverText` to users.** Spec 04 (auth) and 05 (onboarding) will decide which codes are safe to display.
- **Logging envelope fields.** Spec 08 (observability) will include `errorCode` in the local error log.
