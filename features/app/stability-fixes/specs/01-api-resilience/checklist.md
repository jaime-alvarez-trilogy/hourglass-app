# Checklist: 01-api-resilience

## Phase 1.0 — Tests (Red Phase)

### FR1: apiGet wraps fetch → NetworkError

- [x] `test(FR1)`: `apiGet` throws `NetworkError` when `fetch()` throws `TypeError`
- [x] `test(FR1)`: `apiGet` returns parsed JSON on 200 response
- [x] `test(FR1)`: `apiGet` throws `AuthError` on 401 response
- [x] `test(FR1)`: `apiGet` throws `ApiError` on 500 response

### FR2: apiPut wraps fetch → NetworkError

- [x] `test(FR2)`: `apiPut` throws `NetworkError` when `fetch()` throws `TypeError`
- [x] `test(FR2)`: `apiPut` returns parsed JSON on 200 response
- [x] `test(FR2)`: `apiPut` throws error (via `handleStatus`) on non-ok response

### FR3: registerPushToken checks response.ok

- [x] `test(FR3)`: token is saved to AsyncStorage when server returns 200
- [x] `test(FR3)`: token is NOT saved and `console.warn` emitted when server returns 500
- [x] `test(FR3)`: token is NOT saved and `console.warn` emitted when `fetch()` throws
- [x] `test(FR3)`: function resolves (does not throw) on server error

### FR4: unregisterPushToken checks response.ok

- [x] `test(FR4)`: `console.warn` emitted when server returns non-ok status
- [x] `test(FR4)`: `console.warn` emitted when `fetch()` throws
- [x] `test(FR4)`: function resolves (does not throw) on server error

---

## Phase 1.1 — Implementation

### FR1: apiGet

- [x] `feat(FR1)`: wrap `fetch()` in `apiGet` with try/catch → `NetworkError`
- [x] `feat(FR1)`: declare `let response: Response` before try block
- [x] `feat(FR1)`: all FR1 tests pass

### FR2: apiPut

- [x] `feat(FR2)`: wrap `fetch()` in `apiPut` with try/catch → `NetworkError`
- [x] `feat(FR2)`: declare `let response: Response` before try block
- [x] `feat(FR2)`: all FR2 tests pass

### FR3: registerPushToken

- [x] `feat(FR3)`: wrap `fetch()` call in try/catch in `registerPushToken`
- [x] `feat(FR3)`: check `response.ok`; emit `console.warn` if false
- [x] `feat(FR3)`: move `AsyncStorage.setItem` inside `response.ok` branch only
- [x] `feat(FR3)`: all FR3 tests pass

### FR4: unregisterPushToken

- [x] `feat(FR4)`: wrap `fetch()` call in try/catch in `unregisterPushToken`
- [x] `feat(FR4)`: check `response.ok`; emit `console.warn` if false
- [x] `feat(FR4)`: all FR4 tests pass

### Integration

- [x] All FR1-FR4 tests passing (32/32)
- [x] TypeScript compiles with no errors in modified files (`npx tsc --noEmit`)

---

## Phase 1.2 — Review

- [x] Run `spec-implementation-alignment`: verify FR1–FR4 success criteria all met — PASS
- [x] Run review: address unregister behavior (always remove local token, even on server failure)
- [x] All tests still passing after review changes (32/32)
- [x] Commit fix: `fix(01-api-resilience): always clean up local push token on unregister`

---

## Session Notes

**2026-04-09**: Spec execution complete.
- Phase 1.0: 1 test commit (test(FR1-FR4): 32 tests across 2 files)
- Phase 1.1: 1 implementation commit (feat(FR1-FR4): client.ts + pushToken.ts)
- Phase 1.2: 1 fix commit (unregister local token always, not gated on server ok)
- All 32 tests passing. TypeScript clean in modified files.
