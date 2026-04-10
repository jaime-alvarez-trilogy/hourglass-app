# Checklist: Cache Hygiene

**Spec:** `05-cache-hygiene`
**Feature:** `stability-fixes`
**Status:** Not Started

---

## Phase 5.0 — Tests (Red Phase)

Write tests first. All tests must fail before implementation begins.

### FR1 — clearAll removes all 14 AsyncStorage keys

- [ ] Write test: `clearAll()` calls `AsyncStorage.multiRemove` with all 14 keys
- [ ] Write test: `clearAll()` — after resolve, `AsyncStorage.getItem` for each of the 14 keys returns `null`
- [ ] Write test: `clearAll()` — keys not yet written (all missing) — no error thrown, resolves cleanly
- [ ] Write test: `clearAll()` — partial keys written (only some exist) — resolves cleanly, all present keys are cleared
- [ ] Write test: `clearAll()` — signature is `Promise<void>` (no params, async)

### FR2 — Sign-out call site clears TanStack Query cache and cancels notifications

- [ ] Write test: sign-out call site calls `queryClient.clear()` after `clearAll()` resolves
- [ ] Write test: sign-out call site calls `Notifications.cancelAllScheduledNotificationsAsync()` after `clearAll()`
- [ ] Write test: `config.ts` does NOT import `QueryClient` or any TanStack/React module (static import check)
- [ ] Write test: if `queryClient.clear()` throws, sign-out still completes (does not rethrow / block routing)

### FR3 — Modal env-switch clears all query cache

- [ ] Write test: env-switch calls `queryClient.resetQueries()` (spy verifies call)
- [ ] Write test: env-switch does NOT call `queryClient.invalidateQueries({ queryKey: ['hours'] })`
- [ ] Write test: env-switch does NOT call `queryClient.invalidateQueries({ queryKey: ['approvals'] })`

**Commit after all tests written:** `test(FR1-3): add cache hygiene tests`

---

## Phase 5.1 — Implementation (Green Phase)

Implement minimum code to make tests pass.

### FR1 — clearAll in config.ts

- [ ] Replace `removeItem` calls (3 keys) with `AsyncStorage.multiRemove([...14 keys...])`
- [ ] Verify all 14 raw string literals match constants exactly (cross-check against spec table)
- [ ] Run FR1 tests — all pass
- [ ] Commit: `feat(FR1): clearAll removes all 14 AsyncStorage keys`

### FR2 — _layout.tsx sign-out call site

- [ ] Add `queryClient.clear()` call after `await clearAll()` at sign-out / auth-failure path
- [ ] Add `await Notifications.cancelAllScheduledNotificationsAsync()` at sign-out / auth-failure path
- [ ] Wrap additional calls in try/catch so failures don't block routing
- [ ] Run FR2 tests — all pass
- [ ] Commit: `feat(FR2): clear TanStack cache and cancel notifications on sign-out`

### FR3 — modal.tsx env-switch

- [ ] Remove `queryClient.invalidateQueries({ queryKey: ['hours'] })`
- [ ] Remove `queryClient.invalidateQueries({ queryKey: ['approvals'] })`
- [ ] Add `queryClient.resetQueries()` at env-switch location
- [ ] Run FR3 tests — all pass
- [ ] Commit: `feat(FR3): use resetQueries on env-switch in modal`

### Integration

- [ ] Run full test suite — all tests pass
- [ ] No TypeScript errors (`npx tsc --noEmit`)

---

## Phase 5.2 — Review

Run in sequence (each is a gate).

- [ ] `spec-implementation-alignment` — validate implementation matches spec
- [ ] `pr-review-toolkit:review-pr` — standard PR review
- [ ] Address any feedback from review agents
- [ ] `test-optimiser` — review test quality and coverage

---

## Session Notes

_(append after execution)_
