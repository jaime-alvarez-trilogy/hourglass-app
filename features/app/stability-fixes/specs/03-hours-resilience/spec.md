# 03-hours-resilience: useHoursData Either-Error Cache Fallback

**Status:** Draft
**Created:** 2026-04-09
**Last Updated:** 2026-04-09
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What Is Being Built

A targeted bug fix to `src/hooks/useHoursData.ts` that eliminates an infinite loading state when exactly one of the two parallel queries (`timesheetQuery` or `paymentsQuery`) fails while the other succeeds.

### The Problem

`useHoursData` computes `bothError = timesheetQuery.isError && paymentsQuery.isError` and uses this to gate the cache fallback. When only one query fails:

- `bothError` is `false` → cache fallback is skipped
- `hasLiveData` is `false` → live data path is skipped
- `eitherLoading` is `false` → loading guard is skipped
- Falls through to the final return: `{ data: null, isLoading: true }` — an infinite spinner

### The Fix

Add `eitherError = timesheetQuery.isError || paymentsQuery.isError` and use it in the cache fallback condition (line 123). The error surface condition (line 147) stays as `bothError` — only show an error when BOTH queries fail and there is no cache. This way:

- Either query fails + cache exists → show cached data with `isStale: true`
- Either query fails + no cache → `eitherError` branch in the final fallback surfaces an error state instead of `isLoading: true`

### How It Works

```typescript
// Before
const bothError = timesheetQuery.isError && paymentsQuery.isError;
if (bothError && cache) { return stale cached; }

// After
const bothError = timesheetQuery.isError && paymentsQuery.isError;
const eitherError = timesheetQuery.isError || paymentsQuery.isError;  // ← NEW
if (eitherError && cache) { return stale cached; }
// Final fallback also updated: eitherError with no cache → return error, not loading
```

The change is minimal: add one derived boolean, change one condition, and fix the final fallback.

---

## Out of Scope

1. **Partial data mode (using only the successful query's data)** — **Descoped:** When one query fails we cannot compute complete `HoursData` (earnings and hours both required). Serving cached data is safer than showing potentially incorrect totals with only partial API data.

2. **Retry policy changes** — **Descoped:** TanStack Query's default retry behavior (retry: 2) is acceptable. `isError` only becomes `true` after retries are exhausted. No retry tuning is part of this fix.

3. **UI changes to the error or stale-data display** — **Descoped:** The stale indicator (`isStale: true` + `cachedAt`) is already handled in `app/(tabs)/index.tsx`. No UI changes required.

4. **Changes to `useTimesheet` or `usePayments`** — **Descoped:** Those hooks are correct. The bug is entirely in `useHoursData`'s composition logic.

5. **Auth error differentiation** — **Descoped:** Surface `error: 'auth'` only when BOTH queries fail. If one auth-fails, use cache with `isStale: true`. Differentiating auth vs network at the partial-failure level is not needed for this spec.

6. **Clearing or invalidating cache on partial failure** — **Descoped:** The cache should not be cleared on partial failure. It is serving as a valid fallback.

---

## Functional Requirements

### FR1: Either-Error Cache Fallback

**Description:** When either (or both) queries fail and a cache exists, return the cached data with `isStale: true` instead of falling through to an infinite spinner.

**Changes:**

1. Add `eitherError` constant after `bothError`:
   ```typescript
   const eitherError = timesheetQuery.isError || paymentsQuery.isError;
   ```

2. Change cache fallback condition from `bothError` to `eitherError`:
   ```typescript
   // Before:
   if (bothError && cache) { ... }

   // After:
   if (eitherError && cache) { ... }
   ```

**Success Criteria:**

- SC1.1: When `timesheetQuery.isError = true`, `paymentsQuery.isError = false`, and cache exists → hook returns `{ data: cache.data, isLoading: false, isStale: true, cachedAt: cache.cachedAt, error: null }`
- SC1.2: When `timesheetQuery.isError = false`, `paymentsQuery.isError = true`, and cache exists → hook returns `{ data: cache.data, isLoading: false, isStale: true, cachedAt: cache.cachedAt, error: null }`
- SC1.3: When `timesheetQuery.isError = true`, `paymentsQuery.isError = true`, and cache exists → hook returns cached data with `isStale: true` (existing behavior preserved)
- SC1.4: When both queries succeed → hook returns live data with `isStale: false` (existing behavior preserved)

---

### FR2: Either-Error No-Cache Error State

**Description:** When either query fails and no cache exists, return an error state instead of the final `{ data: null, isLoading: true }` fallback.

**Changes:**

Update the final fallback return to detect `eitherError` before the no-config case:

```typescript
// Either query failed, no cache available
if (eitherError) {
  const errorMsg =
    (timesheetQuery.error as Error)?.message ||
    (paymentsQuery.error as Error)?.message ||
    'Failed to load hours data';
  return {
    data: null,
    isLoading: false,
    isStale: false,
    cachedAt: null,
    error: errorMsg,
    refetch,
  };
}

// No config yet / genuine loading
return {
  data: null,
  isLoading: true,
  isStale: false,
  cachedAt: null,
  error: null,
  refetch,
};
```

**Success Criteria:**

- SC2.1: When `timesheetQuery.isError = true`, `paymentsQuery.isError = false`, and no cache → hook returns `{ data: null, isLoading: false, error: <non-null message> }` (never `isLoading: true`)
- SC2.2: When `timesheetQuery.isError = false`, `paymentsQuery.isError = true`, and no cache → hook returns `{ data: null, isLoading: false, error: <non-null message> }` (never `isLoading: true`)
- SC2.3: When no errors and still loading → hook returns `{ isLoading: true, error: null }` (unchanged)
- SC2.4: When no config yet and no errors → hook returns `{ isLoading: true, error: null }` (unchanged)

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/hooks/useHoursData.ts` | The hook being fixed |
| `src/hooks/useTimesheet.ts` | Returns `{ data, isLoading, isError, error, refetch }` |
| `src/hooks/usePayments.ts` | Returns `{ data, isLoading, isError, error, refetch }` |
| `src/hooks/__tests__/useAIData.test.ts` | Pattern reference: static analysis approach for hook tests |

### Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/hooks/useHoursData.ts` | **Modify** | Add `eitherError`; use in cache fallback; fix final fallback |
| `src/hooks/__tests__/useHoursData.test.ts` | **Create** | Static analysis tests for partial failure logic |

### Exact Code Changes in `useHoursData.ts`

**Change 1 — Add `eitherError` (near line 85):**
```typescript
// Before:
const bothError = timesheetQuery.isError && paymentsQuery.isError;
const eitherLoading = timesheetQuery.isLoading || paymentsQuery.isLoading;

// After:
const bothError = timesheetQuery.isError && paymentsQuery.isError;
const eitherError = timesheetQuery.isError || paymentsQuery.isError;  // ← NEW
const eitherLoading = timesheetQuery.isLoading || paymentsQuery.isLoading;
```

**Change 2 — Use `eitherError` in cache fallback (near line 123):**
```typescript
// Before:
if (bothError && cache) {

// After:
if (eitherError && cache) {
```

**Change 3 — Fix final fallback (near line 163):**
```typescript
// Before (the infinite spinner trap):
// No config yet
return { data: null, isLoading: true, isStale: false, cachedAt: null, error: null, refetch };

// After:
// Either query failed, no cache
if (eitherError) {
  const errorMsg =
    (timesheetQuery.error as Error)?.message ||
    (paymentsQuery.error as Error)?.message ||
    'Failed to load hours data';
  return { data: null, isLoading: false, isStale: false, cachedAt: null, error: errorMsg, refetch };
}

// No config yet / genuine loading
return { data: null, isLoading: true, isStale: false, cachedAt: null, error: null, refetch };
```

### Data Flow After Fix

```
timesheetQuery.isError = true, paymentsQuery.isError = false
                    │
            eitherError = true
                    │
              ┌─────┴──────────┐
              │                │
           cache?           no cache?
              │                │
       return stale        eitherError guard
       cached data         in final fallback
       isStale: true       return error state
       error: null         isLoading: false
```

### Edge Cases

1. **Both queries error** — `eitherError = true`, `bothError = true`. Cache fallback triggers if cache exists (correct). If no cache, the `bothError` branch at line 147 fires before the final fallback (unchanged behavior).

2. **Auth error on one query** — `eitherError = true`, cache fallback triggers with `error: null`. User sees last known hours. Auth error is not surfaced unless BOTH fail.

3. **Loading state still correct** — `eitherLoading` check at line 135 runs before the final fallback. If one query is still loading (not errored yet), `isLoading: true` is returned correctly.

4. **No config yet** — After the `eitherError` guard, the final `return { isLoading: true }` still handles the no-config case. Config loads asynchronously; if config is null and no errors have occurred, neither `eitherError` nor `eitherLoading` is true, so `isLoading: true` is the correct response.

### Test Strategy

Following the established pattern in `src/hooks/__tests__/useAIData.test.ts`, tests use **static analysis** of the source file rather than `renderHook`. This avoids React dispatcher issues in the jest-expo/node preset while still validating the logic structure is correct.

Tests verify:
- `eitherError` is declared using `||` operator
- Cache fallback uses `eitherError` (not `bothError`) as the condition
- Final fallback includes `eitherError` guard before the `isLoading: true` return
- `bothError` is still used for the no-cache error surface (line 147)
