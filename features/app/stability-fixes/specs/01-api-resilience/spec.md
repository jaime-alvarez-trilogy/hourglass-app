# API Resilience

**Status:** Draft
**Created:** 2026-04-09
**Last Updated:** 2026-04-09
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What Is Being Built

Two targeted hardening changes to the API and push-token layers:

1. **Network error wrapping** — `apiGet` and `apiPut` in `src/api/client.ts` currently call `fetch()` without a try/catch. When the device is offline, `fetch()` throws a raw `TypeError: Network request failed`. This raw error propagates to callers (e.g. `useApprovalItems.ts`) which expect only typed errors (`NetworkError`, `AuthError`, `ApiError`). The fix wraps both functions' `fetch()` calls in try/catch and converts any thrown `TypeError` to `new NetworkError('Connection failed')`, exactly mirroring the existing pattern used by `getAuthToken` in the same file.

2. **Push token response validation** — `registerPushToken` and `unregisterPushToken` in `src/lib/pushToken.ts` call `fetch()` without checking `response.ok`. A 500 or 404 from the Railway ping server is silently swallowed; the token is saved to AsyncStorage as if registration succeeded. The fix checks `response.ok`, logs a console.warn on failure, and ensures the token is only persisted to AsyncStorage when the server confirms receipt.

### How It Is Built

Both changes follow existing patterns already present in the codebase:
- The `getAuthToken` function in `src/api/client.ts` already wraps `fetch()` in try/catch and throws `NetworkError`. `apiGet`/`apiPut` will use the same pattern.
- The `response.ok` check in `getAuthToken` is the model for the pushToken fix.

No new abstractions, no new error types, no new dependencies. Pure consistency enforcement.

---

## Out of Scope

1. **JSON parse failure in `apiGet`/`apiPut`** — If `response.ok` is true but `response.json()` throws (malformed body), this is not handled. **Descoped:** Out of scope for this batch; no existing caller depends on typed JSON parse errors.

2. **Retry logic** — No automatic retry on `NetworkError`. **Descoped:** Retry policies are a future concern; callers already have optimistic update rollback.

3. **Push token registration retry** — If registration fails, no automatic re-attempt is scheduled. **Descoped:** The silent-push infrastructure can tolerate a missed registration; the app will re-attempt on next cold start.

4. **Unregistration failure impact** — If `unregisterPushToken` gets a non-ok response, we log and continue. The server may still send pings to a stale token, which the OS will reject silently. **Descoped:** Acceptable behavior; the Railway server handles stale tokens gracefully.

5. **Error UI for network failures** — Surfacing `NetworkError` to the user (toast, banner, etc.) is handled by existing caller error handling in `useApprovalItems.ts`. **Descoped:** No UI changes required in this spec; callers already have error handling.

6. **`apiPut` response body handling** — `apiPut` returns the parsed response body. If the server returns 204 No Content, `response.json()` may throw. **Descoped:** Current API contracts always return JSON on success; this edge case is not observed in practice.

---

## Functional Requirements

### FR1: `apiGet` wraps fetch in try/catch → NetworkError

**Description:** When `fetch()` inside `apiGet` throws (device offline, DNS failure, etc.), the raw `TypeError` must be caught and re-thrown as `NetworkError`.

**Implementation:**
```typescript
export async function apiGet<T>(url: string, token: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new NetworkError('Connection failed');
  }
  if (!response.ok) handleStatus(response.status);
  return response.json() as Promise<T>;
}
```

**Success Criteria:**
- When `fetch()` throws any error (e.g. `TypeError: Network request failed`), `apiGet` throws `NetworkError` — not `TypeError`
- When `fetch()` resolves with `response.ok === true`, returns parsed JSON
- When `fetch()` resolves with status 401, throws `AuthError`
- When `fetch()` resolves with status 500, throws `ApiError`
- Function signature unchanged: `<T>(url: string, token: string) => Promise<T>`

---

### FR2: `apiPut` wraps fetch in try/catch → NetworkError

**Description:** Same fix as FR1, applied to `apiPut`. When `fetch()` throws (device offline), the raw error must be caught and re-thrown as `NetworkError`.

**Implementation:**
```typescript
export async function apiPut<T>(url: string, token: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new NetworkError('Connection failed');
  }
  if (!response.ok) handleStatus(response.status);
  return response.json() as Promise<T>;
}
```

**Success Criteria:**
- When `fetch()` throws, `apiPut` throws `NetworkError` — not the raw error
- When `fetch()` resolves with `response.ok === true`, returns parsed JSON
- When `fetch()` resolves with non-ok status, delegates to `handleStatus`
- Function signature unchanged: `<T>(url: string, token: string, body: unknown) => Promise<T>`

---

### FR3: `registerPushToken` checks `response.ok` and conditionally saves token

**Description:** After the fetch completes, `registerPushToken` must check `response.ok`. If the server returned a non-2xx status, log a warning and do NOT save the token to AsyncStorage. If `fetch()` itself throws, also log and do not save.

**Success Criteria:**
- When server returns 200 (ok), token is saved to AsyncStorage
- When server returns 500 (not ok), a `console.warn` is emitted and token is NOT saved to AsyncStorage
- When `fetch()` throws (network error), a `console.warn` is emitted and token is NOT saved to AsyncStorage
- Function signature unchanged: `(token: string) => Promise<void>`
- Function does not throw — registration failure is non-fatal

---

### FR4: `unregisterPushToken` checks `response.ok`

**Description:** Same fix as FR3, applied to `unregisterPushToken`. Check `response.ok`; log warning on failure. No token to un-save, but the log is important for debugging.

**Success Criteria:**
- When server returns non-ok status, a `console.warn` is emitted
- When `fetch()` throws, a `console.warn` is emitted
- Function does not throw — unregistration failure is non-fatal
- Function signature unchanged: `(token: string) => Promise<void>`

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/api/client.ts` | Contains `apiGet`, `apiPut`, `getAuthToken` (reference pattern) |
| `src/api/errors.ts` | Defines `NetworkError`, `AuthError`, `ApiError` — no changes needed |
| `src/lib/pushToken.ts` | Contains `registerPushToken`, `unregisterPushToken` |
| `src/hooks/useApprovalItems.ts` | Downstream caller; validates that typed errors propagate correctly |

### Files to Create / Modify

| File | Action | Reason |
|------|--------|--------|
| `src/api/client.ts` | **Modify** | Add try/catch around fetch in `apiGet` and `apiPut` |
| `src/lib/pushToken.ts` | **Modify** | Add `response.ok` check in `registerPushToken` and `unregisterPushToken`; wrap fetch in try/catch |
| `src/__tests__/api/client.test.ts` | **Create or modify** | Tests for FR1 and FR2 |
| `src/__tests__/lib/pushToken.test.ts` | **Create or modify** | Tests for FR3 and FR4 |

### Data Flow

**FR1 / FR2 — apiGet/apiPut network error path:**
```
caller (useApprovalItems.ts)
  └─► apiGet / apiPut
        └─► fetch()  ──[throws TypeError]──► catch → throw new NetworkError(...)
                     ──[response.ok=false]──► handleStatus(status) → AuthError/ApiError
                     ──[response.ok=true ]──► response.json() → T
```

**FR3 / FR4 — pushToken registration path:**
```
_layout.tsx
  └─► registerPushToken(token)
        ├─► fetch()  ──[throws]───────────────► catch → console.warn (no save)
        │            ──[response.ok=false]────► console.warn (no save)
        │            ──[response.ok=true ]────► AsyncStorage.setItem(token) (save)
        └─► (never throws — always resolves)
```

### Edge Cases

1. **`apiGet` / `apiPut` — `getAuthToken` pattern already correct**: Do not modify `getAuthToken`. It already has try/catch. Only `apiGet` and `apiPut` need updating.

2. **`registerPushToken` fetch itself throws**: Wrap the `fetch()` call in try/catch in addition to checking `response.ok`. Both paths (throw and non-ok) must prevent AsyncStorage.setItem.

3. **`unregisterPushToken` has no AsyncStorage to skip**: The fix here is only the warning log. The function should still not throw.

4. **TypeScript `let response: Response`**: When adding try/catch, the `response` variable must be declared with `let` before the try block, then assigned inside it. This is required so it's accessible after the catch block. The existing `getAuthToken` uses this exact pattern.

5. **Import of `NetworkError`**: `src/api/client.ts` already imports from `src/api/errors.ts`. No new import needed for FR1/FR2. For `src/lib/pushToken.ts`, the catch block uses `console.warn` — `NetworkError` does not need to be imported into pushToken.ts.

### Implementation Notes

- The `handleStatus` helper in `client.ts` already maps HTTP status codes to `AuthError` (401) and `ApiError` (other non-2xx). No changes to this helper.
- `NetworkError` constructor signature: `new NetworkError('Connection failed')` — matches usage in `getAuthToken`.
- For pushToken, the warning message should be informative: `console.warn('[pushToken] Registration failed:', response.status)` and `console.warn('[pushToken] Registration error:', err)`.
- Tests should use `jest.spyOn(global, 'fetch')` or `jest.fn()` assigned to `global.fetch` to control fetch behavior.
