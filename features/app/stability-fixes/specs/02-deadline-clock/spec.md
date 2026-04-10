# Deadline Clock

**Status:** Draft
**Created:** 2026-04-09
**Last Updated:** 2026-04-09
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What Is Being Built

Three targeted fixes to the hours/deadline subsystem in the Hourglass app:

1. **Unified Thursday deadline** — `calculateHours()` currently uses `getSundayMidnightGMT()` to compute `deadline` and `timeRemaining`. This contradicts `computeDeadlineCountdown()`, which already uses Thursday (Crossover's actual timesheet cutoff). A new exported function `getThursdayDeadlineGMT()` is added to `src/lib/hours.ts` and `calculateHours` is updated to call it. Both the UrgencyBanner and the countdown pill now count down to the same moment.

2. **60-second countdown tick** — In `app/(tabs)/index.tsx`, `computeDeadlineCountdown` and `computePacingSignal` are wrapped in `useMemo` with empty or data-only dependency arrays. They are computed once at mount and never refresh. A `useState(new Date())` + `useEffect(() => setInterval(60_000))` pattern is added so `now` advances every minute; `countdown` and `pacing` memos both depend on `now`.

3. **isFuture fix** — `mapDailyToChartData` (index.tsx) marks a day as `isFuture` if it has an entry with `hours === 0` and `isToday === false`. Past zero-work days are grayed out as though they are future. The condition is simplified to `isFuture: !entry` — if an entry object exists, the day is real (past or today).

### How It Fits Together

`getThursdayDeadlineGMT()` mirrors the day-offset logic already inside `computeDeadlineCountdown` but returns a `Date` object rather than a countdown struct. `calculateHours` replaces its single call to `getSundayMidnightGMT()` with `getThursdayDeadlineGMT()`. The `now` tick in index.tsx feeds both `computeDeadlineCountdown(now)` and `computePacingSignal(..., now)`, which already accept an optional `now` parameter. The `isFuture` fix is a one-line change with no downstream ripple.

---

## Out of Scope

1. **Removing `getSundayMidnightGMT`** — The existing function is exported and may be reused for week-boundary calculations (earnings, payments API date ranges). It is left in place. **Descoped:** no consumer of this function is changed by this spec.

2. **Custom `useNow` hook** — A reusable hook abstracting the `useState`/`setInterval` tick pattern was considered but rejected as premature abstraction; only one consumer exists. **Descoped:** not needed for this fix.

3. **Background-foreground lifecycle handling** — iOS suspends `setInterval` when the app is backgrounded. When the app returns to foreground the interval fires and `now` updates. No special `AppState` listener is needed. **Descoped:** acceptable behavior, no action required.

4. **Week rollover animation** — When Thursday 23:59:59 passes, both the deadline and countdown advance to next Thursday simultaneously. No special UI transition is in scope. **Descoped:** handled transparently by the existing display logic.

5. **UrgencyBanner logic changes** — `UrgencyBanner` receives `timeRemaining` from `HoursData` and applies its own urgency thresholds. Those thresholds are not changed by this spec — only the target date changes from Sunday to Thursday. **Descoped:** no changes to `UrgencyBanner.tsx`.

6. **`getSundayMidnightGMT` deprecation warning** — Adding a JSDoc `@deprecated` tag was not included in the key decisions. **Descoped:** can be added in a future cleanup spec.

---

## Functional Requirements

### FR1 — Add `getThursdayDeadlineGMT()` to `src/lib/hours.ts`

Add a new exported function that returns Thursday 23:59:59.999 UTC of the current UTC work week.

**Specification:**

- Mon–Thu UTC: returns this Thursday at 23:59:59.999 UTC
- Fri–Sun UTC: returns next Thursday at 23:59:59.999 UTC
- The offset formula is `(4 - utcDay + 7) % 7` days ahead (same as used inside `computeDeadlineCountdown`)

**Success Criteria:**

- `getThursdayDeadlineGMT()` is exported from `src/lib/hours.ts`
- When called on a Monday UTC, returns the Thursday of the same week at 23:59:59.999 UTC
- When called on a Thursday UTC, returns today at 23:59:59.999 UTC
- When called on a Friday UTC, returns next Thursday at 23:59:59.999 UTC
- When called on a Sunday UTC, returns next Thursday at 23:59:59.999 UTC
- The returned `Date` has hours=23, minutes=59, seconds=59 in UTC
- Thursday at 23:59:58 still returns the same-day deadline (not next week)

---

### FR2 — Update `calculateHours()` to use `getThursdayDeadlineGMT()`

Replace the single call to `getSundayMidnightGMT()` inside `calculateHours` with `getThursdayDeadlineGMT()`.

**Specification:**

- `HoursData.deadline` is set to the result of `getThursdayDeadlineGMT()`
- `HoursData.timeRemaining` is computed as `deadline.getTime() - now` (no change to formula, only the `deadline` value changes)
- `getSundayMidnightGMT` is NOT removed from the file; it may still be imported/used elsewhere

**Success Criteria:**

- `calculateHours()` no longer calls `getSundayMidnightGMT()` internally for the deadline
- `HoursData.deadline` resolves to a Thursday, not a Sunday
- `HoursData.timeRemaining` is positive when called before Thursday 23:59:59 UTC, 0 or negative after
- Return type `HoursData` is unchanged (no new/removed fields)
- All existing `calculateHours` tests continue to pass (no regression)

---

### FR3 — Add 60-second `now` tick in `app/(tabs)/index.tsx`

Add a `useState` + `useEffect` clock that updates `now` every 60 seconds.

**Specification:**

```typescript
const [now, setNow] = useState(() => new Date());

useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 60_000);
  return () => clearInterval(id);
}, []);
```

- The interval is set up once (empty deps) and torn down on unmount
- `countdown` memo depends on `[now]`: `useMemo(() => computeDeadlineCountdown(now), [now])`
- `pacing` memo adds `now` to deps: `useMemo(() => computePacingSignal(data?.total ?? 0, weeklyLimit, now), [data?.total, weeklyLimit, now])`

**Success Criteria:**

- A `now` state variable exists in the index screen component
- A `setInterval` with 60_000ms interval fires `setNow(new Date())` while mounted
- The interval is cleared when the component unmounts (no memory leak)
- `countdown` recomputes when `now` changes
- `pacing` recomputes when `now` changes
- `countdown` and `pacing` do NOT use empty dep arrays

---

### FR4 — Fix `isFuture` in `mapDailyToChartData`

Change the `isFuture` expression from `!entry || (!entry.isToday && entry.hours === 0)` to `!entry`.

**Specification:**

```typescript
// Before:
isFuture: !entry || (!entry.isToday && entry.hours === 0),

// After:
isFuture: !entry,
```

**Success Criteria:**

- A past day entry with `hours === 0` and `isToday === false` is mapped as `isFuture: false`
- A missing entry (null/undefined) is mapped as `isFuture: true`
- Today's entry with `hours === 0` is mapped as `isFuture: false`
- Today's entry with `hours > 0` is mapped as `isFuture: false`
- The chart data array length and ordering are unchanged

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/hours.ts` | Contains `getSundayMidnightGMT` (line 46), `calculateHours` (line 174), `computeDeadlineCountdown` (line 272), `computePacingSignal` (line 325) |
| `app/(tabs)/index.tsx` | Contains `mapDailyToChartData` (line 123), `countdown` useMemo (line 186), `pacing` useMemo (line 187), `isFuture` expression (line 138) |
| `src/lib/__tests__/hours.test.ts` | Existing tests for `getWeekLabels`; append `getThursdayDeadlineGMT` tests here |
| `src/lib/__tests__/countdownPacing.test.ts` | Existing tests for `computeDeadlineCountdown` and `computePacingSignal`; verify no regression |

### Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/lib/hours.ts` | Modify | Add `getThursdayDeadlineGMT()` after `getSundayMidnightGMT`; update line 180 to call it |
| `app/(tabs)/index.tsx` | Modify | Add `now` state + 60s interval; update countdown/pacing deps; fix isFuture line 138 |
| `src/lib/__tests__/hours.test.ts` | Modify | Add describe block for `getThursdayDeadlineGMT` with day-of-week scenarios |
| `src/lib/__tests__/countdownPacing.test.ts` | Reference | Run to confirm no regressions (no changes expected) |

### Implementation Details

#### `getThursdayDeadlineGMT()` (FR1)

Place this immediately after `getSundayMidnightGMT` in `src/lib/hours.ts` (around line 57):

```typescript
/**
 * Returns Thursday 23:59:59.999 UTC of the current UTC work week.
 * Mon–Thu: this Thursday. Fri–Sun: next Thursday.
 *
 * Mirrors the day-offset logic in computeDeadlineCountdown but returns
 * a Date object for use in calculateHours.
 */
export function getThursdayDeadlineGMT(): Date {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Thursday = 4. Days until next/current Thursday:
  // Mon(1)→3, Tue(2)→2, Wed(3)→1, Thu(4)→0, Fri(5)→6, Sat(6)→5, Sun(0)→4
  const daysUntilThursday = (4 - utcDay + 7) % 7;

  const deadline = new Date(now);
  deadline.setUTCDate(deadline.getUTCDate() + daysUntilThursday);
  deadline.setUTCHours(23, 59, 59, 999);

  return deadline;
}
```

#### `calculateHours()` update (FR2)

Change line 180 in `src/lib/hours.ts`:

```typescript
// Before:
const deadline = getSundayMidnightGMT();

// After:
const deadline = getThursdayDeadlineGMT();
```

No other changes to `calculateHours`. The `timeRemaining` formula (`deadline.getTime() - now`) is unchanged.

#### `now` tick in index.tsx (FR3)

Add after the existing `useState` declarations (around line 163) in `app/(tabs)/index.tsx`:

```typescript
// 60-second clock for countdown / pacing freshness
const [now, setNow] = useState(() => new Date());
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 60_000);
  return () => clearInterval(id);
}, []);
```

Update countdown memo (line 186):
```typescript
// Before:
const countdown = useMemo(() => computeDeadlineCountdown(), []);

// After:
const countdown = useMemo(() => computeDeadlineCountdown(now), [now]);
```

Update pacing memo (lines 187–190):
```typescript
// Before:
const pacing = useMemo(
  () => computePacingSignal(data?.total ?? 0, weeklyLimit),
  [data?.total, weeklyLimit]
);

// After:
const pacing = useMemo(
  () => computePacingSignal(data?.total ?? 0, weeklyLimit, now),
  [data?.total, weeklyLimit, now]
);
```

#### `isFuture` fix (FR4)

Change line 138 in `app/(tabs)/index.tsx`:

```typescript
// Before:
isFuture: !entry || (!entry.isToday && entry.hours === 0),

// After:
isFuture: !entry,
```

### Data Flow

```
getThursdayDeadlineGMT()
  └─► calculateHours() → HoursData.deadline (Thursday)
                       → HoursData.timeRemaining (ms to Thursday)
                       → consumed by UrgencyBanner via data prop

index.tsx: now state (60s tick)
  ├─► computeDeadlineCountdown(now) → countdown.label / countdown.urgency
  └─► computePacingSignal(total, weeklyLimit, now) → pacing.label

mapDailyToChartData(daily):
  entry exists → isFuture: false  (past zero-work days show real bar)
  entry absent → isFuture: true   (future days grayed out)
```

### Edge Cases

1. **Friday/Saturday/Sunday** — `getThursdayDeadlineGMT` uses `(4 - utcDay + 7) % 7` so Fri(5)→6 days, Sat(6)→5 days, Sun(0)→4 days ahead. Advances to next Thursday correctly.

2. **Thursday at 23:59:58 UTC** — `daysUntilThursday = (4 - 4 + 7) % 7 = 0` → returns today at 23:59:59.999. Deadline is 1001ms in the future. Correct.

3. **Thursday 23:59:59 passes → Friday** — utcDay becomes 5. Formula gives 6 days ahead → next Thursday. Both `calculateHours` and `computeDeadlineCountdown` advance simultaneously. UrgencyBanner and countdown pill reset together.

4. **Component unmount** — `clearInterval(id)` returned from useEffect cleanup. No interval leak on tab switch or navigation.

5. **App backgrounded** — iOS suspends timers in background. When foregrounded, the interval fires once on resume. Acceptable; no AppState listener needed per research decision.

### Test Strategy

**`getThursdayDeadlineGMT` tests** (add to `src/lib/__tests__/hours.test.ts`):

Use `jest.useFakeTimers()` + `jest.setSystemTime()` to pin the system clock to each day-of-week scenario. Assert the returned `Date` has the expected UTC day (Thursday = 4), UTC hours/minutes/seconds, and the correct week offset.

**Regression guard** (`countdownPacing.test.ts`):

Run the existing test suite unchanged. All tests should pass because `computeDeadlineCountdown` is not modified. No new tests needed in that file.

**isFuture tests** (add to `src/lib/__tests__/chartData.test.ts`):

Pure function test — call `mapDailyToChartData` with a past day having `hours: 0`, verify `isFuture: false`; call with absent entry, verify `isFuture: true`.

**Countdown tick** (index.tsx — integration):

Use `jest.useFakeTimers()` with `@testing-library/react-native` to render the screen, advance time by 60 seconds via `jest.advanceTimersByTime(60_000)`, and assert that `now` state has updated (observable via countdown pill re-render). Verify interval is cleared on unmount.
