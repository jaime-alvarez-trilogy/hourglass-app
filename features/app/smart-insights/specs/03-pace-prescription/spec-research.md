# Spec Research: 03-pace-prescription

## Problem

The current pace badge ("ON TRACK / BEHIND / CRITICAL") is a status label — it tells you where you stand but not what to do. Users need a prescription: exact hours per remaining work day, based on their own work pattern, so they can front-load effort on a heavy day or take a lighter afternoon without losing the week.

## Exploration Findings

### Current pace computation (`src/widgets/bridge.ts:217-236` — `computePaceBadge`)
```
expectedHours = weeklyLimit × workdaysElapsed / 5
ratio = hoursData.total / expectedHours
```
Assumes equal 8h/day Mon–Fri. Ignores the user's actual pattern entirely.

### `HoursData` available from `useHoursData` (`src/lib/hours.ts:15-27`)
```typescript
export interface HoursData {
  total: number;       // hours worked so far this week
  average: number;
  today: number;       // hours worked today
  daily: DailyEntry[]; // [{date, hours, isToday}] — only days with activity
  weeklyEarnings: number;
  todayEarnings: number;
  hoursRemaining: number;  // weeklyLimit - total (can be negative = overtime)
  overtimeHours: number;
  timeRemaining: number;   // ms until Thursday deadline
  deadline: Date;
}
```
`hoursData.hoursRemaining` = hours still needed. When negative, user has already exceeded target.

### `WorkPattern` from spec 02
`dayWeights: number[]` (length 7, Mon=0, fractions summing to 1.0, rest days = 0).

### Day-of-week arithmetic
We need to know which days remain this week (today through Sunday). Use UTC day arithmetic consistent with the rest of the codebase (ARCHITECTURE §3.1 rule: never use `toISOString()` on local dates).

### `config.weeklyLimit` from `useConfig` (`src/hooks/useConfig.ts`)
The 40h (or contract) weekly target. Source for remaining hours.

### `hoursData.daily` for today's hours already worked
`DailyEntry[]` — only present for days that have tracked time. Today's entry (where `isToday === true`) gives hours already worked today, which should be subtracted when computing what's still needed today.

## Key Decisions

**D1: Prescription distributes `hoursRemaining` across remaining work days weighted by `dayWeights`.**
If 15h remain and tomorrow+day-after are both work days with equal weight (0.5 each), prescription = 7.5h each. Reflects the user's natural distribution, not equal splits.

**D2: Today is handled specially — subtract already-worked hours.**
Raw prescription for today = `hoursRemaining × dayWeights[today] / sumOfRemainingWeights`. Subtract today's already-worked hours to get "still need today." If the result is negative (already done for today), show 0 for today.

**D3: When `WorkPattern.status === 'insufficient_data'`, fall back to equal-weight remaining weekdays (Mon–Fri only, excluding today if past).**
This is the naive prescription but still better than nothing. Mark the result with `patternBased: false` so the UI can say "based on standard schedule" instead of "based on your pattern."

**D4: When `hoursRemaining ≤ 0`, return a "done" prescription.**
User has hit or exceeded their target. No per-day breakdown needed.

**D5: Output is a plain data object, not a formatted string.**
The hook returns raw numbers; formatting happens in the UI (spec 05). This makes testing clean and formatting changes free.

**D6: Expose `usePrescription` as the consumer-facing hook.**
Composes `useHoursData`, `useWorkPattern`, and `useConfig`. Single hook for the UI to call.

## Interface Contracts

### `Prescription` type (new, in `src/lib/prescription.ts`)
```typescript
export type PrescriptionStatus = 'done' | 'active' | 'insufficient_data';

export interface DayPrescription {
  dayIndex: number;   // 0=Mon … 6=Sun
  dayLabel: string;   // 'Mon', 'Tue', etc.
  hoursNeeded: number; // hours still needed this day (0 if already met or rest day)
  isToday: boolean;
}

export interface Prescription {
  status: PrescriptionStatus;
  days: DayPrescription[];       // only remaining work days (today → last work day this week)
  totalRemaining: number;        // total hours still needed (= hoursData.hoursRemaining, clamped ≥ 0)
  patternBased: boolean;         // true if WorkPattern was used; false if fell back to equal-weight
  summaryLine: string;           // e.g. "Need 5.2h today · 3.1h tomorrow" or "You're done for the week 🎉"
}
```

### `computePrescription` (new, in `src/lib/prescription.ts`)
```typescript
export function computePrescription(
  hoursData: HoursData,
  pattern: WorkPattern,
  weeklyLimit: number,
  now?: Date,           // injectable for testing; defaults to new Date()
): Prescription
```
**Algorithm:**
1. `hoursRemaining = Math.max(0, weeklyLimit - hoursData.total)`. If 0 → return `{ status: 'done', days: [], totalRemaining: 0, patternBased: false, summaryLine: "You're done for the week 🎉" }`.
2. Determine remaining day indices: `today = now.getDay()` adjusted to Mon=0 convention; remaining days = `[today, today+1, …, 6]` (cap at Sunday). Filter out rest days (where `pattern.dayWeights[i] === 0` when `status === 'ready'`; or where `i > 4` when status = `'insufficient_data'`).
3. `patternBased = pattern.status === 'ready'`.
4. Compute weights for remaining days: `w[i] = patternBased ? pattern.dayWeights[i] : (i <= 4 ? 1/remainingWorkdayCount : 0)`. Normalize to sum = 1.
5. For each remaining day `i`: `rawHours = hoursRemaining × w[i]`. If `i === todayIndex`: subtract `todayAlreadyWorked = hoursData.today`; clamp to ≥ 0.
6. Build `DayPrescription[]` for all remaining work days.
7. Build `summaryLine`: show the 2 highest-hours days. E.g. "Need 5.2h today · 3.1h Tue" or "Need 2.8h today" (if only today left).
8. Return `{ status: 'active', days, totalRemaining: hoursRemaining, patternBased, summaryLine }`.

### `usePrescription` hook (new, in `src/hooks/usePrescription.ts`)
```typescript
export function usePrescription(): Prescription | null
```
- `useHoursData()`, `useWorkPattern()`, `useConfig()`
- Returns `null` if `hoursData` is null (still loading)
- Returns `useMemo(() => computePrescription(hoursData, pattern, config.weeklyLimit), [hoursData, pattern, config.weeklyLimit])`

## Test Plan

### `computePrescription`
**Signature:** `(hoursData, pattern, weeklyLimit, now?) => Prescription`

**Happy path:**
- [ ] 20h worked, 40h limit, Wednesday morning, pattern-based → days = [Wed, Thu, Fri], weights reflect pattern
- [ ] summaryLine shows "Need Xh today · Yh tomorrow" (top 2 days)
- [ ] Today's already-worked hours subtracted correctly
- [ ] `patternBased: true` when pattern.status === 'ready'

**"Done" path:**
- [ ] 40h worked → `status: 'done'`, `summaryLine: "You're done for the week 🎉"`
- [ ] 42h worked (overtime) → `status: 'done'` (hoursRemaining = 0 after clamp)

**Pattern fallback:**
- [ ] `pattern.status === 'insufficient_data'` → `patternBased: false`, equal weight Mon–Fri
- [ ] Weekend day in remaining days excluded when `patternBased: false`

**Rest-day exclusion:**
- [ ] Friday is a rest day (dayWeights[4] = 0) → Friday absent from `days`
- [ ] Only Saturday and Sunday remain → `days = []`, show "You're done for the week" (or 0 remaining)

**Edge cases:**
- [ ] Thursday afternoon, 38h worked, 40h limit → 2h needed, only today + Fri left
- [ ] Today's worked hours exceed today's prescription → today = 0, remaining days absorb the gap
- [ ] `hoursRemaining` fractional (e.g. 7.3h) → distributed correctly, summaryLine rounded to 1 decimal

**`summaryLine` formatting:**
- [ ] Two or more work days remaining → "Need Xh today · Yh Tue"
- [ ] Only today left → "Need Xh today"
- [ ] status = 'done' → "You're done for the week 🎉"
- [ ] Hours rounded to 1 decimal

**Mocks needed:**
- `HoursData` fixture factory (parameterized by `total`, `today`)
- `WorkPattern` fixture: ready + insufficient_data variants
- `now` parameter for deterministic day-of-week

## Files to Create/Modify

| File | Change |
|---|---|
| `src/lib/prescription.ts` | New — `Prescription`, `DayPrescription` types, `computePrescription` |
| `src/hooks/usePrescription.ts` | New — `usePrescription` composing hook |
| `src/__tests__/lib/prescription.test.ts` | New — all test cases above |

## Verification Tiers

- **Tier 1 (unit tests):** Pure function — all cases injectable via `now` param.
- **Tier 2 (manual):** Temporarily surface `prescription.summaryLine` in a `console.log` on Overview mount. Verify the numbers make sense mid-week.
- **Tier 3 (TestFlight):** Verify summaryLine matches expectation on Monday (should show full week) vs Thursday afternoon (only today + Fri remaining).
