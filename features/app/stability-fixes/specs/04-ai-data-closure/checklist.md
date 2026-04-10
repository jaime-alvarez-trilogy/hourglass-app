# Checklist: 04-ai-data-closure

## Phase 1.0 — Tests (Red Phase)

### FR3: Regression test — previous week fetched at most once per session

- [x] Open `__tests__/use-ai-data.test.ts`
- [x] Add test case inside `describe('FR7+FR8: useAIData', ...)`:
  - Test name: `'does not re-fetch previous week on subsequent refreshes (stale closure fix)'`
  - Setup: clear `AsyncStorage` so no `previousWeekAIPercent` stored (first-run simulation)
  - Mount hook via `setupHook()`
  - Flush async (first `fetchData` runs)
  - Record `mockFetchWorkDiary.mock.calls.length` after first refresh
  - Flush async again (second `fetchData` cycle via `refetch()`)
  - Assert total `fetchWorkDiary` call count did not increase by 7 or more between first and second refresh
- [x] Verify the new test **fails** (red) with the current `useState`-based code (document intent in comment)
- [x] Commit: `test(FR3): add regression test for prev-week fetch frequency`

## Phase 1.1 — Implementation (Green Phase)

### FR1: Replace `useState` with `useRef` for `previousWeekPercent`

- [x] Open `src/hooks/useAIData.ts`
- [x] Line 109: Replace `const [previousWeekPercent, setPreviousWeekPercent] = useState<number | undefined>(undefined);` with `const prevWeekPercentRef = useRef<number | undefined>(undefined);`
- [x] Line 257: Replace `if (previousWeekPercent === undefined) {` with `if (prevWeekPercentRef.current === undefined) {`
- [x] Line 279: Replace `setPreviousWeekPercent(pct);` with `prevWeekPercentRef.current = pct;`
- [x] Line 292: Replace `setPreviousWeekPercent(midpoint);` with `prevWeekPercentRef.current = midpoint;`
- [x] Line 350: Replace `return { data, isLoading, lastFetchedAt, error, refetch, previousWeekPercent };` with `return { data, isLoading, lastFetchedAt, error, refetch, previousWeekPercent: prevWeekPercentRef.current };`
- [x] Verify `useState` import still needed (yes — used for `data`, `isLoading`, `lastFetchedAt`, `error`)
- [x] Verify `useRef` already imported (yes — line 9)
- [x] Run `npx tsc --noEmit` — 0 new errors

### FR2: Update mount effect to set ref instead of state

- [x] Lines 117-119: Replace `setPreviousWeekPercent(Number(val));` with `prevWeekPercentRef.current = Number(val);`
- [x] Verify effect dependency array `[]` is unchanged
- [x] Verify silent failure `.catch(() => {})` is unchanged

### Verify all tests pass

- [x] Run `npx jest __tests__/use-ai-data.test.ts --no-coverage`
- [x] All existing tests pass (green) — 12/12
- [x] FR3 regression test passes (green)
- [x] Commit: `feat(FR1): fix stale closure in useAIData with prevWeekPercentRef`

## Phase 1.2 — Review

### Alignment Check

- [x] All FR success criteria verified against implementation — PASS
- [x] No drift between spec and code

### PR Review

- [x] Code review conducted in-session (no open PR — direct-to-main)
- [x] One minor fix applied: stale comment text updated (`previousWeekPercent` → `prevWeekPercentRef`)
- [x] Commit: `fix(04-ai-data-closure): update stale comment to reference prevWeekPercentRef`

### Test Optimization

- [x] Test reviewed: assertions are behavior-focused, would fail if bug reintroduced
- [x] All 12 tests passing after review fix

## Session Notes

**2026-04-09**: Implementation complete.
- Phase 1.0: 1 test commit (`test(FR3)`)
- Phase 1.1: 1 implementation commit (`feat(FR1)` — covers FR1+FR2, co-located in same file)
- Phase 1.2: Review passed, 1 fix commit (stale comment text)
- All 12 tests passing.
