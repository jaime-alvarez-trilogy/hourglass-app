# Checklist: 01-api-resilience

## Phase 1.0 — Tests (Red Phase)

### FR1: apiGet wraps fetch → NetworkError

- [ ] `test(FR1)`: `apiGet` throws `NetworkError` when `fetch()` throws `TypeError`
- [ ] `test(FR1)`: `apiGet` returns parsed JSON on 200 response
- [ ] `test(FR1)`: `apiGet` throws `AuthError` on 401 response
- [ ] `test(FR1)`: `apiGet` throws `ApiError` on 500 response

### FR2: apiPut wraps fetch → NetworkError

- [ ] `test(FR2)`: `apiPut` throws `NetworkError` when `fetch()` throws `TypeError`
- [ ] `test(FR2)`: `apiPut` returns parsed JSON on 200 response
- [ ] `test(FR2)`: `apiPut` throws error (via `handleStatus`) on non-ok response

### FR3: registerPushToken checks response.ok

- [ ] `test(FR3)`: token is saved to AsyncStorage when server returns 200
- [ ] `test(FR3)`: token is NOT saved and `console.warn` emitted when server returns 500
- [ ] `test(FR3)`: token is NOT saved and `console.warn` emitted when `fetch()` throws
- [ ] `test(FR3)`: function resolves (does not throw) on server error

### FR4: unregisterPushToken checks response.ok

- [ ] `test(FR4)`: `console.warn` emitted when server returns non-ok status
- [ ] `test(FR4)`: `console.warn` emitted when `fetch()` throws
- [ ] `test(FR4)`: function resolves (does not throw) on server error

---

## Phase 1.1 — Implementation

### FR1: apiGet

- [ ] `feat(FR1)`: wrap `fetch()` in `apiGet` with try/catch → `NetworkError`
- [ ] `feat(FR1)`: declare `let response: Response` before try block
- [ ] `feat(FR1)`: all FR1 tests pass

### FR2: apiPut

- [ ] `feat(FR2)`: wrap `fetch()` in `apiPut` with try/catch → `NetworkError`
- [ ] `feat(FR2)`: declare `let response: Response` before try block
- [ ] `feat(FR2)`: all FR2 tests pass

### FR3: registerPushToken

- [ ] `feat(FR3)`: wrap `fetch()` call in try/catch in `registerPushToken`
- [ ] `feat(FR3)`: check `response.ok`; emit `console.warn` if false
- [ ] `feat(FR3)`: move `AsyncStorage.setItem` inside `response.ok` branch only
- [ ] `feat(FR3)`: all FR3 tests pass

### FR4: unregisterPushToken

- [ ] `feat(FR4)`: wrap `fetch()` call in try/catch in `unregisterPushToken`
- [ ] `feat(FR4)`: check `response.ok`; emit `console.warn` if false
- [ ] `feat(FR4)`: all FR4 tests pass

### Integration

- [ ] Full test suite passes (`npx jest`)
- [ ] TypeScript compiles with no errors (`npx tsc --noEmit`)

---

## Phase 1.2 — Review

- [ ] Run `spec-implementation-alignment`: verify FR1–FR4 success criteria all met
- [ ] Run `pr-review-toolkit:review-pr`: address any feedback
- [ ] Run `test-optimiser`: remove redundant tests, improve assertions
- [ ] All tests still passing after review changes
- [ ] Commit any review fixes: `fix(01-api-resilience): address review feedback`
