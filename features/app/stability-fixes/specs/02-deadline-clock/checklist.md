# Checklist: 02-deadline-clock

**Spec:** [spec.md](spec.md)
**Feature:** stability-fixes

---

## Phase 2.0 — Tests (Red Phase)

Write tests first. All tests must fail before implementation begins.

### FR1: `getThursdayDeadlineGMT` unit tests

- [ ] `test(FR1)` Add `describe('getThursdayDeadlineGMT')` block to `src/lib/__tests__/hours.test.ts`
- [ ] `test(FR1)` Monday UTC → returns Thursday same week at 23:59:59.999 UTC
- [ ] `test(FR1)` Tuesday UTC → returns Thursday same week at 23:59:59.999 UTC
- [ ] `test(FR1)` Wednesday UTC → returns Thursday same week at 23:59:59.999 UTC
- [ ] `test(FR1)` Thursday UTC → returns today at 23:59:59.999 UTC (daysUntil = 0)
- [ ] `test(FR1)` Friday UTC → returns NEXT Thursday at 23:59:59.999 UTC
- [ ] `test(FR1)` Saturday UTC → returns next Thursday at 23:59:59.999 UTC
- [ ] `test(FR1)` Sunday UTC → returns next Thursday at 23:59:59.999 UTC
- [ ] `test(FR1)` Thursday at 23:59:58 UTC → still returns same-day deadline (not next week)
- [ ] `test(FR1)` Return value UTC day is always 4 (Thursday)
- [ ] `test(FR1)` Return value UTC hours=23, minutes=59, seconds=59

### FR2: `calculateHours` deadline regression tests

- [ ] `test(FR2)` When called on a Tuesday UTC, `HoursData.deadline` is a Thursday (not Sunday)
- [ ] `test(FR2)` `HoursData.timeRemaining` is positive when called before Thursday 23:59:59 UTC
- [ ] `test(FR2)` Return type `HoursData` shape is unchanged (all fields present)
- [ ] `test(FR2)` Existing `calculateHours` test suite still passes (regression guard)

### FR3: 60-second tick tests (index.tsx)

- [ ] `test(FR3)` `now` state initialises to a `Date` object on mount
- [ ] `test(FR3)` After `jest.advanceTimersByTime(60_000)`, `now` state updates to a newer `Date`
- [ ] `test(FR3)` `countdown` memo recomputes when `now` changes (countdown pill re-renders)
- [ ] `test(FR3)` `pacing` memo recomputes when `now` changes
- [ ] `test(FR3)` Interval is cleared on component unmount (no active timers after unmount)
- [ ] `test(FR3)` `countdown` useMemo deps include `now` (not empty array)
- [ ] `test(FR3)` `pacing` useMemo deps include `now` (not just `data?.total, weeklyLimit`)

### FR4: `isFuture` fix tests

- [ ] `test(FR4)` Past day with `hours === 0`, `isToday === false` → `isFuture: false`
- [ ] `test(FR4)` Missing entry (null/undefined in daily array) → `isFuture: true`
- [ ] `test(FR4)` Today's entry with `hours === 0` → `isFuture: false`
- [ ] `test(FR4)` Today's entry with `hours > 0` → `isFuture: false`
- [ ] `test(FR4)` Chart data array length and ordering unchanged

---

## Phase 2.1 — Implementation

Implement minimum code to pass all red-phase tests.

### FR1: Add `getThursdayDeadlineGMT()`

- [ ] `feat(FR1)` Add `getThursdayDeadlineGMT()` function to `src/lib/hours.ts` after `getSundayMidnightGMT`
- [ ] `feat(FR1)` Export the function from `src/lib/hours.ts`
- [ ] `feat(FR1)` Use formula `(4 - utcDay + 7) % 7` for day offset
- [ ] `feat(FR1)` Set UTC hours to 23:59:59.999
- [ ] `feat(FR1)` All FR1 unit tests pass

### FR2: Update `calculateHours()`

- [ ] `feat(FR2)` Replace `getSundayMidnightGMT()` call on line 180 with `getThursdayDeadlineGMT()`
- [ ] `feat(FR2)` `getSundayMidnightGMT` remains in file (not deleted)
- [ ] `feat(FR2)` All FR2 tests pass + existing calculateHours tests pass

### FR3: Add 60s tick in index.tsx

- [ ] `feat(FR3)` Add `const [now, setNow] = useState(() => new Date())` to index.tsx
- [ ] `feat(FR3)` Add `useEffect` with `setInterval(60_000)` and `clearInterval` cleanup
- [ ] `feat(FR3)` Update `countdown` useMemo to pass `now` and depend on `[now]`
- [ ] `feat(FR3)` Update `pacing` useMemo to pass `now` and depend on `[data?.total, weeklyLimit, now]`
- [ ] `feat(FR3)` All FR3 tick tests pass

### FR4: Fix `isFuture`

- [ ] `feat(FR4)` Change line 138 in `app/(tabs)/index.tsx` to `isFuture: !entry`
- [ ] `feat(FR4)` All FR4 tests pass

### Integration

- [ ] Run full test suite: `npx jest` — all tests pass
- [ ] TypeScript check: `npx tsc --noEmit` — no type errors
- [ ] `countdownPacing.test.ts` — all existing tests still pass (regression guard)

---

## Phase 2.2 — Review

Sequential review gates. Complete each before moving to the next.

- [ ] Run `spec-implementation-alignment` agent — verify implementation matches spec
- [ ] Run `pr-review-toolkit:review-pr` — address inline feedback
- [ ] Run `test-optimiser` agent — review test quality and coverage
- [ ] Commit any fixes: `fix(02-deadline-clock): address review feedback`

---

## Definition of Done

- [ ] All Phase 2.0 test tasks marked complete
- [ ] All Phase 2.1 implementation tasks marked complete
- [ ] All Phase 2.2 review tasks complete
- [ ] Full test suite green
- [ ] No TypeScript errors
- [ ] No empty `useMemo` dep arrays for countdown/pacing
- [ ] `HoursData.deadline` is a Thursday in all scenarios
- [ ] Past zero-hour days display as real bars (not grayed out)
