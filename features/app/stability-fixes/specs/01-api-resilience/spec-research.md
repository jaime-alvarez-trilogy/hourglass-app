# Spec Research: API Resilience

**Date:** 2026-04-09
**Author:** @jaime-alvarez-trilogy
**Spec:** `01-api-resilience`

---

## Problem Context

Two related issues in the API layer:

**Issue #6** — `apiGet` and `apiPut` in `src/api/client.ts` call `fetch()` with no try/catch. When the device is offline, `fetch()` throws a raw `TypeError: Network request failed`. Callers (approval actions in `useApprovalItems.ts`) catch errors and expect typed errors (`NetworkError`, `AuthError`). The raw `TypeError` slips through the `catch (err)` blocks unrecognized. After a failed optimistic update, the UI may not roll back correctly.

**Issue #11** — `registerPushToken` and `unregisterPushToken` in `src/lib/pushToken.ts` call `fetch()` to register/unregister with the Railway ping server but never check `response.ok`. A 500 or 404 from the server is silently ignored; the token is saved locally as if registration succeeded. Users think they're registered for silent push but the server has no record of them.

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| try/catch around fetch → NetworkError | `getAuthToken` (client.ts:16-25) | Already correct pattern in same file |
| `response.ok` check | `getAuthToken` (client.ts:27-29) | Throws typed errors on non-ok response |
| `NetworkError` class | `src/api/errors.ts` | Already exists |
| Callers expecting `NetworkError` | `useApprovalItems.ts` catch blocks | Expect typed errors from API layer |

### Key Files

| File | Relevance |
|------|-----------|
| `src/api/client.ts` | Contains `apiGet`, `apiPut`, `getAuthToken` |
| `src/api/errors.ts` | Defines `NetworkError`, `AuthError`, `ApiError` |
| `src/lib/pushToken.ts` | Contains `registerPushToken`, `unregisterPushToken` |
| `src/hooks/useApprovalItems.ts` | Downstream caller; expect typed errors |

### Integration Points

- `apiGet` is called by: `fetchWorkDiary`, `fetchTimesheet`, `fetchPendingManual`, etc.
- `apiPut` is called by: `approveManual`, `rejectManual`, `approveOvertime`, `rejectOvertime`
- All callers expect `NetworkError | AuthError | ApiError` — never raw `TypeError`
- `registerPushToken` is called from `_layout.tsx` on setup complete; failure should not crash the app

### Current `apiGet` implementation (lines 56-69):
```typescript
export async function apiGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {    // ← no try/catch
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) handleStatus(response.status);
  return response.json() as Promise<T>;
}
```

### Current `getAuthToken` (correct pattern — lines 16-25):
```typescript
try {
  response = await fetch(url, { ... });
} catch {
  throw new NetworkError('Connection failed');
}
```

---

## Key Decisions

### Decision 1: Wrap fetch in apiGet and apiPut

**Options considered:**
1. Wrap `fetch()` calls in try/catch inside `apiGet`/`apiPut`, catching `TypeError` and re-throwing as `NetworkError` — mirrors `getAuthToken` exactly
2. Add a `safeApiCall` wrapper function that wraps any fetch — more reusable but unnecessary abstraction for 2 functions

**Chosen:** Option 1 — inline try/catch, mirrors existing pattern in same file

**Rationale:** `getAuthToken` in the same file already uses this exact pattern. Consistency is more important than abstraction. Only 2 functions need fixing.

### Decision 2: pushToken failure handling

**Options considered:**
1. Check `response.ok`, throw error, let `_layout.tsx` catch and log — surface errors clearly
2. Check `response.ok`, log a warning but don't throw — registration failure is non-fatal
3. No change to error propagation, just log the failure

**Chosen:** Option 2 — check `response.ok`, log warning but don't throw on registration failure

**Rationale:** Push notification registration failure should not break the app experience. Logging the failure allows debugging without crashing. The token is NOT saved if server rejected it.

---

## Interface Contracts

### Function Contracts

| Function | Signature | Responsibility | Change |
|----------|-----------|----------------|--------|
| `apiGet` | `<T>(url: string, token: string) => Promise<T>` | HTTP GET with auth | Wrap fetch in try/catch → NetworkError |
| `apiPut` | `<T>(url: string, token: string, body: unknown) => Promise<T>` | HTTP PUT with auth | Wrap fetch in try/catch → NetworkError |
| `registerPushToken` | `(token: string) => Promise<void>` | Register device with ping server | Check response.ok, log warning, only save if successful |
| `unregisterPushToken` | `(token: string) => Promise<void>` | Unregister device from ping server | Check response.ok, log warning |

### Error Types (existing, no changes needed)

```typescript
// src/api/errors.ts — already exists
class NetworkError extends Error { constructor(message: string) }
class AuthError extends Error { constructor(status: number) }
class ApiError extends Error { constructor(status: number) }
```

---

## Test Plan

### `apiGet` / `apiPut` — network error handling

**Signature:** `apiGet<T>(url: string, token: string): Promise<T>`

**Happy Path:**
- Returns parsed JSON on 200 response

**Error Cases:**
- `fetch()` throws `TypeError` (offline) → should throw `NetworkError`, not `TypeError`
- Response status 401 → `AuthError`
- Response status 500 → `ApiError`

**Mocks Needed:**
- `global.fetch`: mock to throw `new TypeError('Network request failed')` to simulate offline
- `global.fetch`: mock to return `{ ok: false, status: 401 }` for auth error

### `registerPushToken` — response.ok check

**Signature:** `registerPushToken(token: string): Promise<void>`

**Happy Path:**
- Server returns 200 → token saved to AsyncStorage

**Error Cases:**
- Server returns 500 → warning logged, token NOT saved to AsyncStorage
- `fetch()` throws → warning logged, token NOT saved

**Mocks Needed:**
- `global.fetch`: mock to return `{ ok: false, status: 500 }`
- `AsyncStorage`: verify `setItem` is/isn't called based on response

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/api/client.ts` | modify | Wrap `fetch()` in `apiGet` and `apiPut` with try/catch → `NetworkError` |
| `src/lib/pushToken.ts` | modify | Check `response.ok` in register/unregister; only save token on success |
| `src/__tests__/api/client.test.ts` | create or modify | Tests for NetworkError propagation |
| `src/__tests__/lib/pushToken.test.ts` | create or modify | Tests for response.ok handling |

---

## Edge Cases to Handle

1. **`apiGet` json parse failure** — if response is ok but body is not valid JSON, `response.json()` throws. This is already unhandled but out of scope for this spec (no change needed).
2. **pushToken fetch itself throws** — wrap in try/catch too so a total network failure during registration doesn't propagate.
3. **unregisterPushToken** — same fix as register: check response.ok.

---

## Open Questions

None remaining.
