# Spec Research: Hours Data Resilience

**Date:** 2026-04-09
**Author:** @jaime-alvarez-trilogy
**Spec:** `03-hours-resilience`

---

## Problem Context

**Issue #4 — Single-source infinite spinner**: `src/hooks/useHoursData.ts` fetches two queries in parallel — `timesheetQuery` and `paymentsQuery`. The fallback-to-cache logic only triggers when BOTH queries fail (`bothError`). But if exactly ONE query fails and the other succeeds, the hook falls through to a final `return { data: null, isLoading: true }` with no error state and no escape. The user sees an infinite spinner.

Exact flow when timesheet succeeds but payments fails:
1. `timesheetQuery.isError = false`, `.data = defined`
2. `paymentsQuery.isError = true`, `.data = undefined`
3. `bothError = false && true = false`
4. `hasLiveData = defined && undefined = false` (both must be defined)
5. `eitherLoading = false || false = false`
6. Cache fallback condition: `if (bothError && cache)` → skipped (bothError is false)
7. Loading return: `if (eitherLoading || !cacheLoaded)` → skipped (not loading)
8. Error return: `if (bothError)` → skipped
9. Falls through to final return: `return { data: null, isLoading: true }` ← **infinite spinner**

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| `bothError` for cache fallback | `useHoursData.ts:123` | The bug — should be `eitherError` |
| Cache fallback with stale indicator | `useHoursData.ts:123-132` | Already works when both fail |
| `isStale: true` in cache fallback | `useHoursData.ts:130` | Good pattern — keep |
| Error state for UI | `useHoursData.ts:147-155` | Returns error when no cache either |

### Key Files

| File | Relevance |
|------|-----------|
| `src/hooks/useHoursData.ts` | The bug and fix |
| `app/(tabs)/index.tsx` | Consumes `useHoursData`; shows error or spinner |

### Integration Points

- `useHoursData` returns `{ data, isLoading, isStale, cachedAt, error, refetch }`
- `data` being `null` with `isLoading: true` means spinner forever
- `error` being non-null should show error UI in index.tsx
- Cache fallback populates `data` with stale data + `isStale: true` + `cachedAt`

### Relevant code (useHoursData.ts):

```typescript
// Line 85-88
const bothError = timesheetQuery.isError && paymentsQuery.isError;
const eitherLoading = timesheetQuery.isLoading || paymentsQuery.isLoading;
const hasLiveData =
  timesheetQuery.data !== undefined && paymentsQuery.data !== undefined && !bothError;

// Line 110 — live data path (correct)
if (hasLiveData && config) { return live data; }

// Line 123 — cache fallback (BUG: uses bothError)
if (bothError && cache) { return cached; }

// Line 135 — loading spinner
if (eitherLoading || !cacheLoaded) { return { isLoading: true }; }

// Line 147 — error (no cache)
if (bothError) { return { error }; }

// Line 163 — final fallback (THE INFINITE SPINNER TRAP)
return { data: null, isLoading: true };
```

---

## Key Decisions

### Decision 1: What triggers the cache fallback

**Options considered:**
1. Change `bothError` → `eitherError` for the cache fallback: if EITHER query fails, fall back to cache
2. Change `hasLiveData` to require only the successful query: partial data is ok
3. Add a specific case: if one succeeds and one fails, use only the successful data with a warning

**Chosen:** Option 1 — change cache fallback condition to `eitherError`

**Rationale:** If one data source is unavailable, we can't compute complete `HoursData` (need both timesheet and payments for accurate totals). Cache data (even stale) is better than nothing. Changing `bothError` → `eitherError` in the cache fallback condition fixes the trap with minimal change.

### Decision 2: What to show the user in partial failure

**Options considered:**
1. Show cached data with `isStale: true` — user sees their last known hours with a stale indicator
2. Show an error message — tells user something is wrong
3. Show whatever data we have (partial) — could show incorrect totals

**Chosen:** Option 1 — cached data with stale indicator

**Rationale:** Cached data is always better than an infinite spinner. The existing cache fallback already does this. We're simply widening the condition that triggers it.

---

## Interface Contracts

### Modified Logic

```typescript
// BEFORE:
const bothError = timesheetQuery.isError && paymentsQuery.isError;

// AFTER: add eitherError
const bothError = timesheetQuery.isError && paymentsQuery.isError;
const eitherError = timesheetQuery.isError || paymentsQuery.isError;  // NEW

// Cache fallback: change bothError → eitherError
// BEFORE (line 123):
if (bothError && cache) { return stale cached data; }

// AFTER:
if (eitherError && cache) { return stale cached data; }

// Error return: keep as bothError (only show error if BOTH fail and no cache)
// Line 147 unchanged:
if (bothError) { return { error }; }
```

### Return type (unchanged)

```typescript
interface UseHoursDataResult {
  data: HoursData | null;      // ← null only during genuine loading or total failure
  isLoading: boolean;
  isStale: boolean;            // ← true when serving from cache
  cachedAt: string | null;
  error: 'auth' | 'network' | null;
  refetch: () => void;
}
```

### Source Tracing

| Field | Source |
|-------|--------|
| `eitherError` | `timesheetQuery.isError \|\| paymentsQuery.isError` |
| cache fallback trigger | `eitherError && cache !== null` |
| error surface trigger | `bothError && cache === null` (unchanged) |

---

## Test Plan

### `useHoursData` — partial failure scenarios

**Signature:** `useHoursData(): UseHoursDataResult`

**Happy Path:**
- Both queries succeed → returns live data, `isLoading: false`, `isStale: false`

**Error Cases:**
- Both queries fail, cache exists → returns cached data, `isStale: true`, `error: null`
- Both queries fail, no cache → returns `{ data: null, error: 'network' }`
- **Timesheet fails, payments succeeds, cache exists → returns cached data, `isStale: true`** (the bug fix)
- **Payments fails, timesheet succeeds, cache exists → returns cached data, `isStale: true`** (symmetric)
- **Timesheet fails, payments succeeds, no cache → returns `{ data: null, error: 'network' }`** (not infinite spinner)

**Mocks Needed:**
- `fetchTimesheet`: mock to reject for failure cases
- `fetchPayments`: mock to reject for failure cases
- `AsyncStorage`: pre-populate cache for cache fallback cases

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useHoursData.ts` | modify | Add `eitherError`; use it in cache fallback condition |
| `src/hooks/__tests__/useHoursData.test.ts` | modify or create | Add partial-failure test cases |

---

## Edge Cases to Handle

1. **Auth error on one query** — `eitherError` triggers cache fallback; the `error` field in the cache return should still be null (stale data, not error state). Only surface `error: 'auth'` if BOTH fail.
2. **Retry behavior** — TanStack Query retries failed queries (default retry: 2). `isError` only becomes true after all retries exhausted. This fix takes effect at the point `isError` is true, which is correct.

---

## Open Questions

None remaining.
