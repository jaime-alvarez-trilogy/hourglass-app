# Checklist: 04-ai-data-closure

## Phase 1.0 — Tests (Red Phase)

### FR3: Regression test — previous week fetched at most once per session

- [ ] Open `__tests__/use-ai-data.test.ts`
- [ ] Add test case inside `describe('FR7+FR8: useAIData', ...)`:
  - Test name: `'does not re-fetch previous week on subsequent refreshes (stale closure fix)'`
  - Setup: clear `AsyncStorage` so no `previousWeekAIPercent` stored (first-run simulation)
  - Mount hook via `setupHook()`
  - Flush async (first `fetchData` runs)
  - Record `mockFetchWorkDiary.mock.calls.length` after first refresh
  - Flush async again (second `fetchData` cycle via `refetch()`)
  - Assert total `fetchWorkDiary` call count did not increase by 7 or more between first and second refresh
- [ ] Verify the new test **fails** (red) with the current `useState`-based code (document intent in comment)
- [ ] Commit: `test(FR3): add regression test for prev-week fetch frequency`

## Phase 1.1 — Implementation (Green Phase)

### FR1: Replace `useState` with `useRef` for `previousWeekPercent`

- [ ] Open `src/hooks/useAIData.ts`
- [ ] Line 109: Replace `const [previousWeekPercent, setPreviousWeekPercent] = useState<number | undefined>(undefined);` with `const prevWeekPercentRef = useRef<number | undefined>(undefined);`
- [ ] Line 257: Replace `if (previousWeekPercent === undefined) {` with `if (prevWeekPercentRef.current === undefined) {`
- [ ] Line 279: Replace `setPreviousWeekPercent(pct);` with `prevWeekPercentRef.current = pct;`
- [ ] Line 292: Replace `setPreviousWeekPercent(midpoint);` with `prevWeekPercentRef.current = midpoint;`
- [ ] Line 350: Replace `return { data, isLoading, lastFetchedAt, error, refetch, previousWeekPercent };` with `return { data, isLoading, lastFetchedAt, error, refetch, previousWeekPercent: prevWeekPercentRef.current };`
- [ ] Verify `useState` import still needed (yes — used for `data`, `isLoading`, `lastFetchedAt`, `error`)
- [ ] Verify `useRef` already imported (yes — line 9)
- [ ] Run `npx tsc --noEmit` — 0 errors

### FR2: Update mount effect to set ref instead of state

- [ ] Lines 117-119: Replace `setPreviousWeekPercent(Number(val));` with `prevWeekPercentRef.current = Number(val);`
- [ ] Verify effect dependency array `[]` is unchanged
- [ ] Verify silent failure `.catch(() => {})` is unchanged

### Verify all tests pass

- [ ] Run `npx jest __tests__/use-ai-data.test.ts --no-coverage`
- [ ] All existing tests pass (green)
- [ ] FR3 regression test passes (green)
- [ ] Commit: `feat(FR1): fix stale closure in useAIData prevWeekPercentRef`

## Phase 1.2 — Review

### Alignment Check

- [ ] Run `spec-implementation-alignment` agent on `features/app/stability-fixes/specs/04-ai-data-closure/`
- [ ] All FR success criteria verified against implementation
- [ ] No drift between spec and code

### PR Review

- [ ] Run `pr-review-toolkit:review-pr` skill
- [ ] Address any blocking feedback
- [ ] Commit fixes: `fix(04-ai-data-closure): address review feedback` (if needed)

### Test Optimization

- [ ] Run `test-optimiser` agent on `__tests__/use-ai-data.test.ts`
- [ ] Apply any recommended improvements
- [ ] All tests still passing after optimization

## Session Notes

<!-- Added after execution -->
