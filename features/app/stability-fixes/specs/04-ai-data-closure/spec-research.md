# Spec Research: AI Data Stale Closure Fix

**Date:** 2026-04-09
**Author:** @jaime-alvarez-trilogy
**Spec:** `04-ai-data-closure`

---

## Problem Context

**Issue #5 — Stale closure causes 7 extra API calls per refresh**: In `src/hooks/useAIData.ts`, the `fetchData` function is memoized with `useCallback(..., [config])`. Inside `fetchData`, line 257 reads:

```typescript
if (previousWeekPercent === undefined)
```

`previousWeekPercent` is a React state variable. Because it's not in the `useCallback` dependency array, the closure captures the initial value (`undefined`) permanently. Every time `fetchData` runs, `previousWeekPercent` appears to be `undefined`, so the "fetch previous week" branch fires every single time — fetching all 7 days of last week on every single refresh cycle (every ~60 seconds or on focus).

This means:
- On each refresh: 7 extra work diary API calls to Crossover
- API quota consumed ~7× faster than intended
- Battery drain from unnecessary network I/O
- The previous week data is re-fetched even after `setPreviousWeekPercent` has been called

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| `useRef` for mutable values that shouldn't trigger re-render | Common React pattern | Avoids stale closure without deps change |
| Read AsyncStorage directly in callback | `useAIData.ts` line 115 already reads PREV_WEEK_KEY | Alternative: read from storage instead of state |
| `useCallback([config])` | `useAIData.ts:337` | The problematic dependency array |

### Key Files

| File | Relevance |
|------|-----------|
| `src/hooks/useAIData.ts` | The bug — stale closure over `previousWeekPercent` |

### Integration Points

- `previousWeekPercent` is read in `fetchData` to decide whether to fetch last week
- `previousWeekPercent` is written via `setPreviousWeekPercent(pct)` after successful fetch
- `previousWeekPercent` is also written from `AsyncStorage.getItem(PREV_WEEK_KEY)` on mount (line 115)
- The PREV_WEEK_KEY (`'previousWeekAIPercent'`) persists across sessions in AsyncStorage

### Current flow:

```typescript
const [previousWeekPercent, setPreviousWeekPercent] = useState<number | undefined>(undefined);

const fetchData = useCallback(async () => {
  // ...
  if (previousWeekPercent === undefined) {  // ← Always true (stale closure)
    // fetch all 7 days of previous week (7 API calls)
    const prevPct = await computePreviousWeekPct(...);
    setPreviousWeekPercent(prevPct);
    await AsyncStorage.setItem(PREV_WEEK_KEY, String(prevPct));
  }
  // ...
}, [config]);  // ← previousWeekPercent missing from deps
```

---

## Key Decisions

### Decision 1: How to fix the stale closure

**Options considered:**
1. **Add `previousWeekPercent` to `useCallback` deps** — simple but causes `fetchData` to recreate every time `previousWeekPercent` changes, which triggers the interval/effect that calls `fetchData` to re-register and potentially fire again
2. **Replace state with `useRef`** — `prevWeekPercentRef.current` is always fresh inside the callback without being a dependency; ref mutations don't trigger re-renders or effect re-runs
3. **Read from AsyncStorage directly** — instead of checking state, read PREV_WEEK_KEY at the start of `fetchData`; already done on mount but not inside the callback

**Chosen:** Option 2 — replace `useState` with `useRef` for `previousWeekPercent`

**Rationale:** `useRef` is the canonical React pattern for "a mutable value I need to read in a callback without it being a dependency." Reading from AsyncStorage (Option 3) would add an extra async round-trip on every refresh. Option 1 could cause the callback to fire extra times.

### Decision 2: Where to initialize the ref value

**Options considered:**
1. Initialize ref to `undefined`; on mount read from AsyncStorage and set `ref.current`
2. Eagerly read from AsyncStorage to initialize ref

**Chosen:** Option 1 — init to `undefined`, set from AsyncStorage in the existing mount effect

**Rationale:** There's already a `useEffect` that reads PREV_WEEK_KEY from AsyncStorage and calls `setPreviousWeekPercent`. Change that to set `prevWeekPercentRef.current` instead. No new effects needed.

---

## Interface Contracts

### Changed Implementation

```typescript
// BEFORE:
const [previousWeekPercent, setPreviousWeekPercent] = useState<number | undefined>(undefined);

// AFTER:
const prevWeekPercentRef = useRef<number | undefined>(undefined);

// In mount effect — BEFORE:
const stored = await AsyncStorage.getItem(PREV_WEEK_KEY);
if (stored !== null) setPreviousWeekPercent(parseFloat(stored));

// AFTER:
const stored = await AsyncStorage.getItem(PREV_WEEK_KEY);
if (stored !== null) prevWeekPercentRef.current = parseFloat(stored);

// Inside fetchData — BEFORE:
if (previousWeekPercent === undefined) { ... }
setPreviousWeekPercent(prevPct);

// AFTER:
if (prevWeekPercentRef.current === undefined) { ... }
prevWeekPercentRef.current = prevPct;
```

### Source Tracing

| Field | Source |
|-------|--------|
| `prevWeekPercentRef.current` initial value | AsyncStorage `'previousWeekAIPercent'` on mount |
| `prevWeekPercentRef.current` after first fetch | Set to computed `prevPct` inside `fetchData` |
| Persisted to AsyncStorage | `AsyncStorage.setItem(PREV_WEEK_KEY, ...)` unchanged |

---

## Test Plan

### `useAIData` — previous week fetch frequency

**Happy Path:**
- First mount: `prevWeekPercentRef.current === undefined` → fetches previous week once
- After first fetch: `prevWeekPercentRef.current` is set → subsequent refreshes do NOT fetch previous week again

**Edge Cases:**
- App restart: ref resets to `undefined`; AsyncStorage rehydrates it; fetch fires once
- AsyncStorage has stored value: ref initialized to stored value on mount; no previous week fetch needed

**Mocks Needed:**
- `fetchWorkDiary`: count calls to verify 7 previous-week calls don't repeat
- `AsyncStorage`: pre-populate PREV_WEEK_KEY to test initialization path
- `useConfig`: return valid config

**Key assertion:**
```typescript
// After first refresh, fetchWorkDiary call count should NOT include 7 prev-week calls
// On second refresh, total calls should be <= current week days only
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useAIData.ts` | modify | Replace `useState` with `useRef` for `previousWeekPercent` |
| `__tests__/use-ai-data.test.ts` | modify | Add test verifying previous week fetched ≤ once per session |

---

## Edge Cases to Handle

1. **Monday**: On Mondays, the previous week's data IS intended to be refreshed (the week rolled over). The `fetchData` logic has a separate Monday path that writes a new PREV_WEEK_KEY value. The ref will be updated then, which is correct.
2. **Ref persists in session only**: On app restart, `prevWeekPercentRef.current` starts as `undefined` again. The AsyncStorage read on mount restores it. This is correct — one fetch per session.

---

## Open Questions

None remaining.
