# AI Data Stale Closure Fix

**Status:** Draft
**Created:** 2026-04-09
**Last Updated:** 2026-04-09
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What Is Being Built

A targeted bug fix for `src/hooks/useAIData.ts` that eliminates a stale closure causing 7 extra Crossover API calls on every refresh cycle.

### The Problem

`useAIData` memoizes `fetchData` with `useCallback(..., [config])`. Inside `fetchData`, the check `if (previousWeekPercent === undefined)` reads a React state variable that is **not in the dependency array**. The closure permanently captures the initial value (`undefined`), so every invocation of `fetchData` sees `previousWeekPercent === undefined` — regardless of whether the previous week was already fetched. This fires 7 `fetchWorkDiary` API calls (one per previous-week day) on every refresh.

### How It Is Fixed

Replace the `useState` for `previousWeekPercent` with a `useRef`. A ref's `.current` value is always live inside any closure without needing to appear in `useCallback` deps. The ref starts as `undefined`, is populated from `AsyncStorage` on mount (existing effect, just changes the write target), and is updated inside `fetchData` after the previous-week computation completes.

The external API of `useAIData` (`UseAIDataResult.previousWeekPercent`) remains identical — still a `number | undefined` field returned from the hook.

### Scope

One file modified: `src/hooks/useAIData.ts`. One test file updated: `__tests__/use-ai-data.test.ts` to add a regression test verifying the previous week is fetched at most once per session.

---

## Out of Scope

1. **Monday weekly rollover behavior** — **Descoped:** The existing Monday path that writes a new `PREV_WEEK_KEY` value (`isMonday && freshData.taggedSlots > 0`) is correct and unchanged. The ref will be updated by that path, which is the intended behavior.

2. **AsyncStorage read inside `fetchData`** — **Descoped:** Reading `PREV_WEEK_KEY` directly from `AsyncStorage` at the start of `fetchData` (Option 3 from research) was considered and explicitly rejected. Using `useRef` avoids the extra async round-trip.

3. **Adding `previousWeekPercent` to `useCallback` deps** — **Descoped:** Adding it as a dependency (Option 1 from research) was explicitly rejected; it would cause `fetchData` to recreate whenever the state changes, potentially re-triggering the interval/effect.

4. **Any other `useAIData` behavior** — **Descoped:** This fix is surgical. No changes to caching logic, error handling, app breakdown computation, or weekly history flush.

5. **`UseAIDataResult` interface changes** — **Descoped:** The return type of `useAIData` remains unchanged. `previousWeekPercent?: number` is still returned from the hook (reading `prevWeekPercentRef.current` at return time).

---

## Functional Requirements

### FR1 — Replace `useState` with `useRef` for `previousWeekPercent`

**Description:** In `src/hooks/useAIData.ts`, replace:

```typescript
const [previousWeekPercent, setPreviousWeekPercent] = useState<number | undefined>(undefined);
```

with:

```typescript
const prevWeekPercentRef = useRef<number | undefined>(undefined);
```

All reads of `previousWeekPercent` inside the module become `prevWeekPercentRef.current`. All writes via `setPreviousWeekPercent(value)` become `prevWeekPercentRef.current = value`. The return value at the bottom of the hook reads `prevWeekPercentRef.current` to preserve the `previousWeekPercent?: number` field in `UseAIDataResult`.

**Success Criteria:**
- `useState` for `previousWeekPercent` is removed
- `prevWeekPercentRef` declared with `useRef<number | undefined>(undefined)`
- Every read site updated: `previousWeekPercent` → `prevWeekPercentRef.current`
- Every write site updated: `setPreviousWeekPercent(x)` → `prevWeekPercentRef.current = x`
- Return object still exposes `previousWeekPercent: prevWeekPercentRef.current`
- The `useCallback` dependency array `[config]` is unchanged (no new deps added)
- TypeScript compiles with no new errors

### FR2 — Update mount effect to set ref instead of state

**Description:** In the `useEffect` that runs on mount to hydrate from `AsyncStorage`:

```typescript
// BEFORE:
if (val !== null) {
  setPreviousWeekPercent(Number(val));
}

// AFTER:
if (val !== null) {
  prevWeekPercentRef.current = Number(val);
}
```

**Success Criteria:**
- Mount effect reads `PREV_WEEK_KEY` from `AsyncStorage` (unchanged)
- On non-null value, sets `prevWeekPercentRef.current` instead of calling `setPreviousWeekPercent`
- Silent failure on `AsyncStorage` error (unchanged)
- Effect dependency array `[]` is unchanged

### FR3 — Add regression test: previous week fetched at most once per session

**Description:** In `__tests__/use-ai-data.test.ts`, add a test that:
1. Ensures `AsyncStorage` has no `previousWeekAIPercent` stored (simulating first run)
2. Mounts the hook and triggers `fetchData` twice (two refresh cycles)
3. Asserts that `fetchWorkDiary` was called for previous-week dates at most 7 times total (not 7 times per refresh)

**Success Criteria:**
- Test is inside the existing `describe('FR7+FR8: useAIData', ...)` block
- Test verifies `fetchWorkDiary` call count for previous-week dates does not double after a second refresh
- Test passes after the FR1+FR2 fix is applied (green phase)
- Test fails (or would fail) with the original `useState` code (red phase intent documented)

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/hooks/useAIData.ts` | The file being modified |
| `__tests__/use-ai-data.test.ts` | Existing test suite to extend |
| `src/lib/ai.ts` | `countDiaryTags`, `aggregateAICache`, `getMondayOfWeek` — used in hook, not changed |
| `src/api/workDiary.ts` | `fetchWorkDiary` — mocked in tests |

### Files to Create/Modify

| File | Action | Change |
|------|--------|--------|
| `src/hooks/useAIData.ts` | modify | Replace `useState`/`setPreviousWeekPercent` with `useRef`/`prevWeekPercentRef` (3 write sites, 1 read site inside `fetchData`, 1 read in return) |
| `__tests__/use-ai-data.test.ts` | modify | Add FR3 regression test for previous-week fetch count |

### Exact Change Sites in `useAIData.ts`

**Line 109 — Declaration (FR1):**
```typescript
// BEFORE:
const [previousWeekPercent, setPreviousWeekPercent] = useState<number | undefined>(undefined);

// AFTER:
const prevWeekPercentRef = useRef<number | undefined>(undefined);
```

**Lines 117-119 — Mount effect (FR2):**
```typescript
// BEFORE:
if (val !== null) {
  setPreviousWeekPercent(Number(val));
}

// AFTER:
if (val !== null) {
  prevWeekPercentRef.current = Number(val);
}
```

**Line 257 — Guard inside `fetchData` (FR1):**
```typescript
// BEFORE:
if (previousWeekPercent === undefined) {

// AFTER:
if (prevWeekPercentRef.current === undefined) {
```

**Line 279 — Setter inside previous-week fetch callback (FR1):**
```typescript
// BEFORE:
setPreviousWeekPercent(pct);

// AFTER:
prevWeekPercentRef.current = pct;
```

**Line 292 — Setter in Monday path (FR1):**
```typescript
// BEFORE:
setPreviousWeekPercent(midpoint);

// AFTER:
prevWeekPercentRef.current = midpoint;
```

**Line 350 — Return statement (FR1):**
```typescript
// BEFORE:
return { data, isLoading, lastFetchedAt, error, refetch, previousWeekPercent };

// AFTER:
return { data, isLoading, lastFetchedAt, error, refetch, previousWeekPercent: prevWeekPercentRef.current };
```

Note: `useRef` is already imported on line 9 (`import { useState, useEffect, useRef, useCallback } from 'react'`). After removing `useState` for `previousWeekPercent`, verify `useState` is still used for `data`, `isLoading`, `lastFetchedAt`, and `error` — it is, so the import remains.

### Data Flow

```
Mount
  └─ useEffect([]) → AsyncStorage.getItem(PREV_WEEK_KEY)
       └─ if value → prevWeekPercentRef.current = Number(val)

fetchData() [via useCallback([config])]
  ├─ ... fetch current week ...
  ├─ if prevWeekPercentRef.current === undefined   ← always fresh, not stale
  │     └─ fetch 7 prev-week days (once per session)
  │         └─ prevWeekPercentRef.current = pct
  │         └─ AsyncStorage.setItem(PREV_WEEK_KEY, String(pct))
  └─ if Monday && tagged data
        └─ prevWeekPercentRef.current = midpoint

return { ..., previousWeekPercent: prevWeekPercentRef.current }
```

### Edge Cases

| Case | Behavior |
|------|----------|
| First mount, no AsyncStorage value | `prevWeekPercentRef.current` stays `undefined`; previous week fetched once in first `fetchData` call |
| First mount, AsyncStorage has stored value | Mount effect sets `prevWeekPercentRef.current`; `fetchData` guard is `false`; no previous-week fetch |
| Second and subsequent refreshes (same session) | `prevWeekPercentRef.current` already set; guard is `false`; no previous-week fetch |
| App restart | Ref resets to `undefined`; mount effect rehydrates from `AsyncStorage`; same as "has stored value" |
| Monday | Monday path updates `prevWeekPercentRef.current = midpoint`; next refresh does not re-fetch |
| AsyncStorage read failure on mount | Silently caught; ref stays `undefined`; previous week fetched once on first `fetchData` (correct) |
| `fetchData` concurrent guard | `isFetchingRef` unchanged; second call while fetching is a no-op |

### Why Not Option 1 or Option 3

- **Option 1 (add to deps):** `previousWeekPercent` changing after the first fetch would cause `fetchData` to be a new function reference, which could trigger the `useEffect` depending on `fetchData` and fire an extra refresh.
- **Option 3 (read AsyncStorage in callback):** Adds an async read round-trip at the start of every `fetchData` call (every ~60 seconds). `useRef` is zero-cost — the value is already in memory.
