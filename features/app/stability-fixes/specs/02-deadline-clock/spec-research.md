# Spec Research: Deadline Clock

**Date:** 2026-04-09
**Author:** @jaime-alvarez-trilogy
**Spec:** `02-deadline-clock`

---

## Problem Context

Three related issues all in `src/lib/hours.ts` and `app/(tabs)/index.tsx`:

**Issue #1 — Deadline contradiction**: Two parts of the home tab use different deadlines.
- `calculateHours()` calls `getSundayMidnightGMT()` → Sunday 23:59:59 UTC as `deadline`
- This populates `HoursData.timeRemaining` used by `UrgencyBanner` and the "X remaining" sub-metric
- `computeDeadlineCountdown()` uses Thursday 23:59:59 UTC (fixed April 9)
- Result: on Friday, "X remaining" shows time until Sunday while the countdown pill shows "6d left" to next Thursday — directly contradictory

**Issue #2 — Countdown/pacing freeze**: In `app/(tabs)/index.tsx`:
- Line 186: `const countdown = useMemo(() => computeDeadlineCountdown(), [])` — empty deps, computed ONCE at mount
- Lines 187-190: `computePacingSignal(data?.total ?? 0, weeklyLimit)` — deps `[data?.total, weeklyLimit]` (no time dep)
- If app stays open overnight or past the Thursday deadline, both values are permanently stale

**Issue #8 — isFuture marks zero-hours past days**: In `mapDailyToChartData` (index.tsx line 138):
- `isFuture: !entry || (!entry.isToday && entry.hours === 0)`
- A past day where the user worked 0 hours has `entry` (not null), `isToday: false`, `hours: 0`
- Gets incorrectly marked as `isFuture: true` → shown grayed out like a future day
- Correct: past days with 0 hours should show a real zero bar

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| `useEffect` + `setInterval` for clock | None in this codebase | Standard React pattern |
| `computeDeadlineCountdown(now = new Date())` | Already accepts `now` param | Ready to accept injected time |
| `computePacingSignal(hoursWorked, weeklyLimit, now = new Date())` | hours.ts:315 | Already accepts `now` param |
| `getSundayMidnightGMT()` | `calculateHours()` line 180 only | Only one call site |

### Key Files

| File | Relevance |
|------|-----------|
| `src/lib/hours.ts` | `getSundayMidnightGMT`, `calculateHours`, `computeDeadlineCountdown`, `computePacingSignal` |
| `app/(tabs)/index.tsx` | countdown useMemo, pacing useMemo, mapDailyToChartData isFuture logic |
| `src/components/UrgencyBanner.tsx` | Receives `timeRemaining` from `HoursData` |

### Integration Points

- `calculateHours()` returns `HoursData` including `deadline: Date` and `timeRemaining: number`
- `HoursData.timeRemaining` is consumed by `UrgencyBanner` in index.tsx
- `HoursData.hoursRemaining` shown as a sub-metric (independent of deadline calc)
- `getSundayMidnightGMT` exported from hours.ts but only called once in `calculateHours`

### Why Thursday is the correct deadline

Crossover's timesheet closes Thursday at end-of-day UTC. The Friday–Sunday period is not a submission window — there is nothing to "count down to" on Friday from a timesheet perspective. The Crossover notifications fire on Thursday. The `computeDeadlineCountdown` logic (already Thursday) is correct. The Sunday deadline in `calculateHours` is a leftover from before this was clarified.

---

## Key Decisions

### Decision 1: Which deadline to unify on

**Options considered:**
1. Change `calculateHours` to use Thursday — both systems agree on Thursday
2. Change `computeDeadlineCountdown` back to Sunday — both systems agree on Sunday
3. Keep both but add a disclaimer in UI

**Chosen:** Option 1 — change `calculateHours` to Thursday

**Rationale:** Thursday is the actual Crossover timesheet deadline. The countdown pill behavior is correct. UrgencyBanner should warn about Thursday urgency, not Sunday.

### Decision 2: How to change the deadline in calculateHours

**Options considered:**
1. Rename `getSundayMidnightGMT` → `getThursdayDeadlineGMT` and change its logic
2. Leave `getSundayMidnightGMT` unchanged (may be used elsewhere in future) and add `getThursdayDeadlineGMT` as a new export, call it in `calculateHours`
3. Inline the Thursday logic directly in `calculateHours`

**Chosen:** Option 2 — add `getThursdayDeadlineGMT()` alongside existing function

**Rationale:** `getSundayMidnightGMT` is exported and could be reused for week boundary calculations (earnings, payments). Adding a new function is safer than renaming. The new function mirrors `computeDeadlineCountdown`'s Thursday logic but returns a `Date` instead of the countdown object.

### Decision 3: How to implement the 60-second tick

**Options considered:**
1. `useState(new Date())` + `useEffect` + `setInterval(60_000)` driving `countdown` and `pacing` memos
2. Custom `useNow(intervalMs)` hook
3. `useMemo` with a dependency on a `Date.now()` that gets refreshed

**Chosen:** Option 1 — inline `useState`/`useEffect` in index.tsx

**Rationale:** Only one consumer. A custom hook is premature abstraction. The pattern is 6 lines.

### Decision 4: Fix for isFuture

**Options considered:**
1. `isFuture: !entry` — a day with any entry is never future (simplest)
2. `isFuture: !entry || entry.date > today` — compare date strings

**Chosen:** Option 1 — `isFuture: !entry`

**Rationale:** The API only returns entries for dates up to today. An `entry` object existing means the day is real (past or today). Only absent entries represent future/empty days. The extra condition `(!entry.isToday && entry.hours === 0)` was always wrong.

---

## Interface Contracts

### New Function

```typescript
// src/lib/hours.ts — new export
/**
 * Returns Thursday 23:59:59 UTC of the current UTC work week.
 * Mon–Thu: this Thursday. Fri–Sun: next Thursday.
 */
export function getThursdayDeadlineGMT(): Date
```

### Modified Function

```typescript
// calculateHours — deadline changes from getSundayMidnightGMT() to getThursdayDeadlineGMT()
// Return type HoursData unchanged; deadline and timeRemaining now point to Thursday
```

### index.tsx additions

```typescript
// New state for clock tick
const [now, setNow] = useState(() => new Date());

// Effect: tick every 60 seconds
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 60_000);
  return () => clearInterval(id);
}, []);

// Modified memos
const countdown = useMemo(() => computeDeadlineCountdown(now), [now]);
const pacing = useMemo(
  () => computePacingSignal(data?.total ?? 0, weeklyLimit, now),
  [data?.total, weeklyLimit, now],
);
```

### isFuture fix

```typescript
// Before (line 138):
isFuture: !entry || (!entry.isToday && entry.hours === 0),

// After:
isFuture: !entry,
```

### Source Tracing

| Field | Source |
|-------|--------|
| `getThursdayDeadlineGMT()` deadline | `(4 - utcDay + 7) % 7` — same as `computeDeadlineCountdown` |
| `HoursData.timeRemaining` | `getThursdayDeadlineGMT().getTime() - now` |
| `countdown` | `computeDeadlineCountdown(now)` where `now` ticks every 60s |
| `pacing` | `computePacingSignal(data?.total, weeklyLimit, now)` |
| `isFuture` | `!entry` (entry exists = real day) |

---

## Test Plan

### `getThursdayDeadlineGMT`

**Signature:** `getThursdayDeadlineGMT(): Date`

**Happy Path:**
- Monday UTC → returns Thursday same week 23:59:59 UTC
- Thursday UTC → returns today 23:59:59 UTC
- Friday UTC → returns NEXT Thursday 23:59:59 UTC
- Sunday UTC → returns next Thursday 23:59:59 UTC

**Edge Cases:**
- Thursday at 23:59:58 → still returns today (not next week)
- Thursday at 23:59:59 → same-day deadline (0ms remaining)

**Mocks Needed:**
- `jest.useFakeTimers()` + `jest.setSystemTime()` for each day scenario

### Countdown tick (index.tsx)

**Happy Path:**
- `now` state updates every 60 seconds
- `countdown` memo recomputes when `now` changes
- Interval cleared on unmount

**Mocks Needed:**
- `jest.useFakeTimers()` to advance time
- renderHook or component render

### isFuture fix

**Happy Path:**
- Day with `entry` (hours: 0, isToday: false) → `isFuture: false`
- Day with no `entry` → `isFuture: true`
- Today with `entry` (hours > 0) → `isFuture: false`

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/hours.ts` | modify | Add `getThursdayDeadlineGMT()`; update `calculateHours` to call it |
| `app/(tabs)/index.tsx` | modify | Add `now` state + 60s interval; update countdown/pacing memos; fix isFuture |
| `src/lib/__tests__/hours.test.ts` | modify | Add tests for `getThursdayDeadlineGMT` |
| `src/lib/__tests__/countdownPacing.test.ts` | modify | Verify no regression |

---

## Edge Cases to Handle

1. **App backgrounded** — `setInterval` pauses in background on iOS. When app returns to foreground, interval fires and `now` updates. Acceptable — no special handling needed.
2. **Week rollover at Friday midnight** — `getThursdayDeadlineGMT` correctly advances to next Thursday for Fri/Sat/Sun. `computeDeadlineCountdown` already handles this identically.
3. **Thursday at end-of-day** — when deadline passes (Thursday 23:59:59 → Friday 00:00:00), `computeDeadlineCountdown` returns `msRemaining` with next Thursday. `calculateHours` similarly advances. Both UrgencyBanner and countdown pill will reset simultaneously.

---

## Open Questions

None remaining.
