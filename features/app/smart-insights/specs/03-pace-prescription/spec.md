# 03-pace-prescription

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What

This spec implements the **pace prescription** — a smart, per-day action plan that tells users exactly how many hours they still need on each remaining workday of the current week to hit their weekly target.

Two new modules are created:

- **`src/lib/prescription.ts`** — pure `computePrescription` function and exported types (`Prescription`, `DayPrescription`, `PrescriptionStatus`)
- **`src/hooks/usePrescription.ts`** — `usePrescription` hook composing `useHoursData`, `useWorkPattern`, and `useConfig`

### How

**`computePrescription(hoursData, pattern, weeklyLimit, now?)`** is a pure function (injectable `now` for deterministic testing) that:

1. Computes `hoursRemaining = max(0, weeklyLimit - hoursData.total)`. Returns a `'done'` prescription if ≤ 0.
2. Identifies remaining work days from today through Sunday (Mon=0 … Sun=6, **local** weekday convention).
3. Picks per-day weights from the user's `WorkPattern.dayWeights` when `pattern.status === 'ready'` (`patternBased: true`); falls back to equal weight over Mon–Fri remaining days when `'insufficient_data'` (`patternBased: false`). Rest days (weight = 0 or outside Mon–Fri for fallback) are excluded.
4. Normalizes surviving weights to sum to 1, then distributes `hoursRemaining` proportionally.
5. Subtracts already-worked hours (`hoursData.today`) from today's raw share, clamping at 0. No re-spreading of the residual to later days (documented tradeoff, acceptable).
6. Builds a `summaryLine` from the top-2 days by hours needed: `"Need 5.2h today · 3.1h Tue"`.
7. Returns `status: 'active'` with the full `DayPrescription[]` array covering only surviving remaining work days.

Edge cases handled explicitly:
- `hoursRemaining ≤ 0` → `status: 'done'`
- All remaining days are rest days → `status: 'done'` ("nothing actionable left this week")
- Today's already-worked hours exceed today's raw share → today shows 0

**`usePrescription()`** composes the three hooks, guards null config and null hoursData, and returns `Prescription | null`.

### Upstream dependencies

- **spec 01** (`dailyHours` on `WeeklySnapshot`, `computeDailyHours`) — already complete
- **spec 02** (`WorkPattern`, `inferWorkPattern`, `useWorkPattern`) — already complete
- **`useHoursData`**, **`useConfig`** — existing hooks

---

## Out of Scope

1. **Widget prescription line** — **Deferred to `05-insights-ui` + widget redesign**: Surfacing the `summaryLine` in the iOS/Android widget requires a widget layout redesign pass (`WIDGET-INFO-DESIGN.md`). The `computePrescription` data is available but the widget rendering layer is not touched in this spec.

2. **Re-spreading today's residual to later days** — **Descoped**: When today's already-worked hours exceed today's raw share, the residual is not redistributed to later days. An iterative solver would complicate the pure function significantly and the edge is uncommon. The tradeoff is documented in spec-research §Algorithm note.

3. **Push notification when pace is critical** — **Deferred to notifications feature**: Notification scheduling is a separate system (`useScheduledNotifications`). This spec only produces the data; triggering notifications is out of scope.

4. **Prescription UI rendering** — **Deferred to `05-insights-ui`**: `InsightChip` and the Overview section that consumes `usePrescription` are implemented in spec 05. This spec is data-layer only.

5. **Earnings-at-risk projection** — **Descoped**: Combining pace with earnings projection requires joining with the payments API in a new way; this is a separate feature enhancement.

6. **Thursday/submission-deadline awareness** — **Descoped**: The prescription distributes hours across the Mon–Sun work week. The Thursday submission deadline is intentionally ignored — the `summaryLine` never says "by Thursday" or "by Friday", sidestepping the deadline ambiguity documented in spec-research.

7. **Cross-UTC/local-day reconciliation** — **Descoped**: The UTC/local boundary imprecision (spec-research §Day-of-week arithmetic) is accepted as a minor artifact. No test asserts UTC behaviour; fixing it would require switching the today-index to UTC which breaks the larger today-subtraction (documented tradeoff).

---

## Functional Requirements

---

### FR1 — Types and constants (`src/lib/prescription.ts`)

Export the `Prescription`, `DayPrescription`, and `PrescriptionStatus` types.

**Note on `PrescriptionStatus`:** The type union is `'done' | 'active' | 'insufficient_data'`. The current algorithm only emits `'done'` or `'active'` — `patternBased: false` signals fallback mode, not a separate status. `'insufficient_data'` is reserved for future use.

**Success Criteria:**

- SC1.1 — `PrescriptionStatus` type is exported as `'done' | 'active' | 'insufficient_data'`
- SC1.2 — `DayPrescription` interface has fields: `dayIndex: number`, `dayLabel: string`, `hoursNeeded: number`, `isToday: boolean`
- SC1.3 — `Prescription` interface has fields: `status: PrescriptionStatus`, `days: DayPrescription[]`, `totalRemaining: number`, `patternBased: boolean`, `summaryLine: string`

---

### FR2 — `computePrescription` pure function (`src/lib/prescription.ts`)

Implement `computePrescription(hoursData, pattern, weeklyLimit, now?)` as a pure function with injectable `now` (defaults to `new Date()`).

**Success Criteria:**

- SC2.1 — Returns `{ status: 'done', days: [], totalRemaining: 0, patternBased: false, summaryLine: "You're done for the week" }` when `weeklyLimit - hoursData.total ≤ 0` (includes overtime case)
- SC2.2 — Today-index uses **local** weekday: `(now.getDay() + 6) % 7` — Monday = 0, Sunday = 6
- SC2.3 — Remaining day indices are `[todayIndex, todayIndex+1, …, 6]`
- SC2.4 — When `pattern.status === 'ready'`: rest days excluded where `pattern.dayWeights[i] === 0`; `patternBased = true`
- SC2.5 — When `pattern.status === 'insufficient_data'`: only Mon–Fri (`i <= 4`) kept; all get equal weight 1; `patternBased = false`; `status` is `'active'`
- SC2.6 — Weights renormalized across surviving remaining days to sum to 1
- SC2.7 — Today's raw share subtracts `hoursData.today`; clamped at 0 (no re-spread to later days)
- SC2.8 — If surviving remaining work days set is empty → `status: 'done'`, `summaryLine: "You're done for the week"`
- SC2.9 — Non-done outcomes return `status: 'active'`
- SC2.10 — `totalRemaining = Math.max(0, weeklyLimit - hoursData.total)`

---

### FR3 — Day labels and `isToday` flag

Provide correct abbreviated day names and the `isToday` flag.

**Success Criteria:**

- SC3.1 — `dayLabel` values are `['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']` indexed by `dayIndex`
- SC3.2 — `isToday` is `true` only for the `DayPrescription` where `dayIndex === todayIndex`

---

### FR4 — `summaryLine` formatting

Build a human-readable one-line summary from the top-2 days by `hoursNeeded`, rounded to 1 decimal.

**Success Criteria:**

- SC4.1 — Two or more work days with `hoursNeeded > 0`: `"Need Xh today · Yh {dayLabel}"` (today first when it has hours)
- SC4.2 — Only today has `hoursNeeded > 0`: `"Need Xh today"`
- SC4.3 — Today has 0 `hoursNeeded`, later days remain: `"Need Xh {dayLabel}"` (no "today" token)
- SC4.4 — `status === 'done'`: `"You're done for the week"` (no emoji, no period)
- SC4.5 — Hours rounded to 1 decimal (e.g., 5.23 → `"5.2h"`)
- SC4.6 — No trailing whitespace, no emoji in output

---

### FR5 — `usePrescription` hook (`src/hooks/usePrescription.ts`)

Composing hook that calls `useHoursData`, `useWorkPattern`, `useConfig`, guards nulls, and returns `Prescription | null`.

**Success Criteria:**

- SC5.1 — Hook file exists at `src/hooks/usePrescription.ts`
- SC5.2 — Imports `computePrescription` from `../lib/prescription`
- SC5.3 — Imports `useHoursData`, `useWorkPattern`, `useConfig`
- SC5.4 — Returns `null` when `hoursData` or `config` is null (no crash on `config.weeklyLimit` read)
- SC5.5 — Uses `useMemo` with `[hoursData, pattern, config]` as dependencies
- SC5.6 — Does not import from `src/api/`, `src/store/`, or `AsyncStorage` directly
- SC5.7 — Returns `computePrescription(hoursData, pattern, config.weeklyLimit)` when all inputs are non-null

---

## Technical Design

### Files to Reference

| File | Purpose |
|---|---|
| `src/lib/hours.ts:14–25` | `HoursData` interface (total, today, hoursRemaining, daily) |
| `src/lib/hours.ts:109–110` | Local day-of-week → Mon=0 idiom (non-UTC branch of `getWeekStartDate`) |
| `src/lib/workPattern.ts` | `WorkPattern`, `WorkPatternStatus` types and constants |
| `src/hooks/useWorkPattern.ts` | Pattern for a pure-composition useMemo hook |
| `src/hooks/useConfig.ts` | `useConfig()` return shape: `{ config: CrossoverConfig | null, ... }` |
| `src/hooks/useHoursData.ts` | `useHoursData()` return shape: `{ data: HoursData | null, ... }` |
| `src/lib/__tests__/workPattern.test.ts` | Test structure and fixture factory patterns to follow |
| `src/types/config.ts:16` | `weeklyLimit: number` field (default 40) |

### Files to Create

| File | Description |
|---|---|
| `src/lib/prescription.ts` | New — `PrescriptionStatus`, `DayPrescription`, `Prescription` types; `computePrescription` pure function |
| `src/hooks/usePrescription.ts` | New — `usePrescription` composing hook |
| `src/lib/__tests__/prescription.test.ts` | New — all unit tests (co-located with sibling lib tests) |

### Files to Modify

None. All work is additive.

### Data Flow

```
useHoursData()   →  { data: HoursData | null }  ─┐
useWorkPattern() →  WorkPattern                  ─┤→  usePrescription()  →  Prescription | null
useConfig()      →  { config: CrossoverConfig | null } ┘       │
                                                               ▼
                                                   computePrescription(
                                                     hoursData,
                                                     pattern,
                                                     config.weeklyLimit,
                                                     now  ← injectable for tests
                                                   )
```

### Algorithm Detail

```
Step 1:  hoursRemaining = max(0, weeklyLimit - hoursData.total)
         if hoursRemaining === 0  →  return done prescription

Step 2:  todayIndex = (now.getDay() + 6) % 7     // local weekday, Mon=0, Sun=6
         horizon = [todayIndex, ..., 6]           // always ends at Sunday

Step 3:  patternBased = pattern.status === 'ready'
         if patternBased:
           survivingDays = horizon.filter(i => pattern.dayWeights[i] > 0)
         else:
           survivingDays = horizon.filter(i => i <= 4)   // Mon–Fri only

         if survivingDays.length === 0  →  return done prescription

Step 4:  rawW[i] = patternBased ? pattern.dayWeights[i] : 1
         sumW    = sum of rawW over survivingDays
         normW[i] = rawW[i] / sumW                // renormalize

Step 5:  for each i in survivingDays:
           rawHours = hoursRemaining × normW[i]
           if i === todayIndex:
             hoursNeeded = max(0, rawHours - hoursData.today)
           else:
             hoursNeeded = rawHours

Step 6:  build DayPrescription[] for survivingDays (with dayLabel, isToday)

Step 7:  build summaryLine from top-2 days by hoursNeeded (round to 1 decimal)

Step 8:  return { status: 'active', days, totalRemaining: hoursRemaining,
                  patternBased, summaryLine }
```

### Day Label Lookup

```typescript
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
```

### Critical Invariant: LOCAL day for today-index

```typescript
// CORRECT — uses local day
const todayIndex = (now.getDay() + 6) % 7;

// WRONG — do not use UTC
const todayIndex = (now.getUTCDay() + 6) % 7;
```

Rationale: `hoursData.today` is sourced from `calculateHours` which matches by local YYYY-MM-DD string. Using UTC day near a local/UTC boundary would subtract the wrong day's worked hours.

### Edge Cases

| Scenario | Behaviour |
|---|---|
| `hoursData.total >= weeklyLimit` | `status: 'done'`, `days: []`, `totalRemaining: 0` |
| `hoursData.total > weeklyLimit` (overtime) | Same as above — `max(0, ...)` clamp |
| Saturday only + Sunday both rest days (`patternBased: false`) | horizon [5,6] → filtered to ≤4 = empty → `status: 'done'` |
| All remaining days are rest days (`patternBased: true`) | `survivingDays.length === 0` → `status: 'done'` |
| `hoursData.today > today's raw share` | `hoursNeeded` for today = 0; residual NOT re-spread |
| `hoursRemaining` fractional | Distribution correct; `summaryLine` rounds to 1 decimal |
| Sunday only remaining, `patternBased: false` | Sunday (6) > 4, excluded → `status: 'done'` |
| Sunday only remaining, `patternBased: true`, Sun weight > 0 | Sunday included with its weight |

### Module Layering Compliance

`src/lib/prescription.ts` is pure — it imports only from:
- `src/lib/hours.ts` (for `HoursData` type)
- `src/lib/workPattern.ts` (for `WorkPattern` type)

`src/hooks/usePrescription.ts` imports from:
- `src/lib/prescription.ts`
- `src/hooks/useHoursData.ts`
- `src/hooks/useWorkPattern.ts`
- `src/hooks/useConfig.ts`

No imports from `src/api/`, `src/store/`, or `AsyncStorage` in either file.

### Test Fixture Factories

```typescript
// Minimal HoursData fixture
function makeHoursData(overrides: Partial<HoursData>): HoursData

// Ready WorkPattern (equal Mon–Fri)
const READY_PATTERN: WorkPattern = {
  status: 'ready',
  dayWeights: [0.2, 0.2, 0.2, 0.2, 0.2, 0, 0],
  restDays: [5, 6],
  avgDailyHours: [8, 8, 8, 8, 8, 0, 0],
  weeksUsed: 4,
};

// Insufficient-data pattern
const INSUFFICIENT_PATTERN: WorkPattern = {
  status: 'insufficient_data',
  dayWeights: [],
  restDays: [],
  avgDailyHours: [],
  weeksUsed: 0,
};
```
