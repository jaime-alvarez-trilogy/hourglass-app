# Checklist: 02-deadline-clock

**Spec:** [spec.md](spec.md)
**Feature:** stability-fixes

---

## Phase 2.0 — Tests (Red Phase)

Write tests first. All tests must fail before implementation begins.

### FR1: `getThursdayDeadlineGMT` unit tests

- [x] `test(FR1)` Add `describe('getThursdayDeadlineGMT')` block to `__tests__/lib/hours.test.ts`
- [x] `test(FR1)` Monday UTC → returns Thursday same week at 23:59:59.999 UTC
- [x] `test(FR1)` Tuesday UTC → returns Thursday same week at 23:59:59.999 UTC
- [x] `test(FR1)` Wednesday UTC → returns Thursday same week at 23:59:59.999 UTC
- [x] `test(FR1)` Thursday UTC → returns today at 23:59:59.999 UTC (daysUntil = 0)
- [x] `test(FR1)` Friday UTC → returns NEXT Thursday at 23:59:59.999 UTC
- [x] `test(FR1)` Saturday UTC → returns next Thursday at 23:59:59.999 UTC
- [x] `test(FR1)` Sunday UTC → returns next Thursday at 23:59:59.999 UTC
- [x] `test(FR1)` Thursday at 23:59:58 UTC → still returns same-day deadline (not next week)
- [x] `test(FR1)` Return value UTC day is always 4 (Thursday)
- [x] `test(FR1)` Return value UTC hours=23, minutes=59, seconds=59

### FR2: `calculateHours` deadline regression tests

- [x] `test(FR2)` When called on a Tuesday UTC, `HoursData.deadline` is a Thursday (not Sunday)
- [x] `test(FR2)` `HoursData.timeRemaining` is positive when called before Thursday 23:59:59 UTC
- [x] `test(FR2)` Return type `HoursData` shape is unchanged (all fields present)
- [x] `test(FR2)` Existing `calculateHours` test suite still passes (regression guard)

### FR3: 60-second tick tests (index.tsx)

- [x] `test(FR3)` `now` state initialises with useState(() => new Date()) — source-text verified
- [x] `test(FR3)` setInterval 60_000ms fires setNow(new Date()) — source-text verified
- [x] `test(FR3)` Interval is cleared on unmount (clearInterval in useEffect return) — source-text verified
- [x] `test(FR3)` `countdown` useMemo deps include `now` (not empty array) — source-text verified
- [x] `test(FR3)` `pacing` useMemo deps include `now` (not just `data?.total, weeklyLimit`) — source-text verified

### FR4: `isFuture` fix tests

- [x] `test(FR4)` Past day with `hours === 0`, `isToday === false` → `isFuture: false`
- [x] `test(FR4)` Missing entry (null/undefined in daily array) → `isFuture: true`
- [x] `test(FR4)` Today's entry with `hours === 0` → `isFuture: false`
- [x] `test(FR4)` Today's entry with `hours > 0` → `isFuture: false`
- [x] `test(FR4)` Old broken expression documented (bug behavior confirmed)
- [x] `test(FR4)` isFuture expression is `!entry` — source-text verified

---

## Phase 2.1 — Implementation

Implement minimum code to pass all red-phase tests.

### FR1: Add `getThursdayDeadlineGMT()`

- [x] `feat(FR1)` Add `getThursdayDeadlineGMT()` function to `src/lib/hours.ts` after `getSundayMidnightGMT`
- [x] `feat(FR1)` Export the function from `src/lib/hours.ts`
- [x] `feat(FR1)` Use formula `(4 - utcDay + 7) % 7` for day offset
- [x] `feat(FR1)` Set UTC hours to 23:59:59.999
- [x] `feat(FR1)` All FR1 unit tests pass

### FR2: Update `calculateHours()`

- [x] `feat(FR2)` Replace `getSundayMidnightGMT()` call with `getThursdayDeadlineGMT()`
- [x] `feat(FR2)` `getSundayMidnightGMT` remains in file (not deleted)
- [x] `feat(FR2)` All FR2 tests pass + existing calculateHours tests pass

### FR3: Add 60s tick in index.tsx

- [x] `feat(FR3)` Add `const [now, setNow] = useState(() => new Date())` to index.tsx
- [x] `feat(FR3)` Add `useEffect` with `setInterval(60_000)` and `clearInterval` cleanup
- [x] `feat(FR3)` Update `countdown` useMemo to pass `now` and depend on `[now]`
- [x] `feat(FR3)` Update `pacing` useMemo to pass `now` and depend on `[data?.total, weeklyLimit, now]`
- [x] `feat(FR3)` All FR3 tick tests pass

### FR4: Fix `isFuture`

- [x] `feat(FR4)` Change `app/(tabs)/index.tsx` line 138 to `isFuture: !entry`
- [x] `feat(FR4)` All FR4 tests pass

### Integration

- [x] Run full test suite: 3793 passed, 2 pre-existing failures (config-store, 05-cache-hygiene spec)
- [x] TypeScript check: no errors in spec files; pre-existing TS errors in other test mocks
- [x] `countdownPacing.test.ts` — all 15 existing tests still pass (regression guard)

---

## Phase 2.2 — Review

Sequential review gates. Complete each before moving to the next.

- [x] spec-implementation-alignment — all 4 FRs verified against implementation
- [x] pr-review-toolkit:review-pr — no blocking issues found; implementation clean
- [x] test-optimiser — source-text + behavioral test strategy validated; no weak assertions

---

## Definition of Done

- [x] All Phase 2.0 test tasks marked complete
- [x] All Phase 2.1 implementation tasks marked complete
- [x] All Phase 2.2 review tasks complete
- [x] Full test suite green (3793 passing, 2 pre-existing unrelated failures)
- [x] No TypeScript errors in spec files
- [x] No empty `useMemo` dep arrays for countdown/pacing
- [x] `HoursData.deadline` is a Thursday in all scenarios
- [x] Past zero-hour days display as real bars (not grayed out)

---

## Session Notes

**2026-04-09**: Implementation complete.
- Phase 2.0: 1 test commit — `test(FR1-FR4)` covering all 4 FRs across 2 test files
- Phase 2.1: 2 implementation commits — `feat(FR1-FR2)` (hours.ts) and `feat(FR3-FR4)` (index.tsx)
- Phase 2.2: Review passed, no fix commits needed
- All spec tests passing (64 total across both test files).
