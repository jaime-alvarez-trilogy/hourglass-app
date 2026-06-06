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
  hoursRemaining: number;  // Math.max(0, weeklyLimit - total) — clamped ≥ 0, never negative; overtime is in overtimeHours
  overtimeHours: number;
  timeRemaining: number;   // ms until Thursday deadline
  deadline: Date;
}
```
`hoursData.hoursRemaining` is computed as `Math.max(0, weeklyLimit - total)` in `calculateHours` — it is **clamped ≥ 0** and is 0 (not negative) once at/over target. Overtime is carried separately in `hoursData.overtimeHours`. (We recompute remaining locally from `weeklyLimit - total` anyway; the field is corroboration.)

### `WorkPattern` from spec 02
`dayWeights: number[]` (length 7, Mon=0, fractions summing to 1.0, rest days = 0).

### Day-of-week arithmetic — use LOCAL day for the today-index (deliberate, documented)
We need the today-index and the "remaining days this week" horizon. **Use the LOCAL weekday** (`now.getDay()`), NOT UTC. Rationale:
- The today-subtraction in step 5 subtracts `hoursData.today`, which `calculateHours` matches by the **local** YYYY-MM-DD date string (`src/lib/hours.ts:248-258, 282`). The today-index MUST use the same (local) basis or, near a UTC/local boundary (e.g. Sun 7pm EST = Mon 00:00 UTC), we'd subtract one day's worked hours from another day's slot.
- The user experiences "today" and "their work days" in local time.

This is a deliberate exception to the general "API dates are UTC" rule (ARCHITECTURE §3.1) — that rule governs dates sent to/compared with the API; the prescription's day-index is a local-display concern. Caveat (documented, accepted): `dayWeights` (spec 02) derive from spec 01's `dailyHours`, which are keyed off UTC-Monday `weekDates`. In a narrow boundary window the local weekday may be ≤1 position off the UTC-keyed weight slot. Accepted as a minor imprecision because `dayWeights` is a multi-week smoothed average (adjacent work-day weights are similar). Do NOT "fix" this by switching the today-index to `getUTCDay()` — that breaks the larger, more visible today-subtraction.

### Which "week"? Work week = Mon–Sun (not the Thursday submission deadline)
Hours accumulate against the **Mon–Sun work week** (MEMORY: "Week boundary Mon–Sun"). `hoursData.deadline` (Thursday 23:59:59 UTC) is the *timesheet submission* deadline — a different concern. The prescription distributes remaining hours across remaining **work-week** days (today → Sunday, minus rest days). The `summaryLine` must NOT name a specific deadline day ("by Friday"/"by Thursday") — it just states per-day hours ("Need 5.2h today · 3.1h Tue"). This sidesteps the Thursday/Sunday ambiguity entirely.

### `config.weeklyLimit` from `useConfig` (`src/hooks/useConfig.ts`)
`config.weeklyLimit: number` (default 40 — confirmed `src/types/config.ts:16`). The 40h (or contract) weekly target. `useConfig().config` is `CrossoverConfig | null` — the hook must guard null `config` as well as null `hoursData`.

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
  summaryLine: string;           // e.g. "Need 5.2h today · 3.1h Tue" or "You're done for the week" (no emoji)
}
```

### `computePrescription` (new, in `src/lib/prescription.ts`)
```typescript
/**
 * Pure. Distributes remaining weekly hours across the user's remaining work days,
 * weighted by their personal day pattern (or equal Mon–Fri when pattern is unavailable).
 * `now` is injectable for deterministic tests. Returns status 'done' at/over target,
 * 'insufficient_data' when pattern isn't ready, else 'active'.
 */
export function computePrescription(
  hoursData: HoursData,
  pattern: WorkPattern,
  weeklyLimit: number,
  now?: Date,           // injectable for testing; defaults to new Date()
): Prescription
```
**Algorithm:**
1. `hoursRemaining = Math.max(0, weeklyLimit - hoursData.total)`. If 0 → return `{ status: 'done', days: [], totalRemaining: 0, patternBased: false, summaryLine: "You're done for the week" }` (no emoji).
2. Today-index, Mon=0 convention, **LOCAL** day (see Day-of-week note above): `const todayIndex = (now.getDay() + 6) % 7;` (Sun→6, Mon→0 … Sat→5 — numerically equivalent to the LOCAL-branch idiom at `src/lib/hours.ts:109-110`, which computes the same value via `dayOfWeek === 0 ? 6 : dayOfWeek - 1`; note line 99 is the UTC branch and is NOT the reference here). Remaining day indices = `[todayIndex, todayIndex+1, …, 6]` (cap at Sunday=6; if `todayIndex===6`, only Sunday). Filter out rest days: when `pattern.status === 'ready'`, drop `i` where `pattern.dayWeights[i] === 0`; when `'insufficient_data'`, keep only `i <= 4` (Mon–Fri).
3. `patternBased = pattern.status === 'ready'`.
4. Compute weights for the surviving remaining days: `w[i] = patternBased ? pattern.dayWeights[i] : 1` (equal). Renormalize across the surviving set so they sum to 1.
5. For each remaining day `i`: `rawHours = hoursRemaining × normalizedW[i]`. If `i === todayIndex`: `hoursNeeded = max(0, rawHours − hoursData.today)`; else `hoursNeeded = rawHours`.
   - Edge: if today's already-worked exceeds today's raw share, today shows 0 — the residual stays distributed on later days (do not re-spread; the simple per-day share is acceptable and avoids an iterative solve). Documented tradeoff.
6. Build `DayPrescription[]` for all surviving remaining work days. If the surviving set is empty (e.g. only Sat/Sun left and both are rest days) → return `status: 'done'` with `summaryLine: "You're done for the week"` (nothing actionable left this week).
7. Build `summaryLine` from the top-2 by `hoursNeeded`: "Need {x}h today · {y}h {dayLabel}" (today first if present), or "Need {x}h today" if only today, or "Need {x}h {dayLabel}" if today is already met but later days remain. Round to 1 decimal.
8. Return `{ status: 'active', days, totalRemaining: hoursRemaining, patternBased, summaryLine }`.

### `usePrescription` hook (new, in `src/hooks/usePrescription.ts`)
```typescript
/**
 * Composes useHoursData + useWorkPattern + useConfig into a live Prescription.
 * Returns null while hoursData or config is still loading. Recomputes on data change.
 */
export function usePrescription(): Prescription | null
```
- `useHoursData()`, `useWorkPattern()`, `useConfig()`
- **Guard null `config` AND null `hoursData`:** `if (!hoursData || !config) return null;` (`useConfig().config` is `CrossoverConfig | null` — reading `config.weeklyLimit` unguarded would crash during load).
- Returns `useMemo(() => (!hoursData || !config) ? null : computePrescription(hoursData, pattern, config.weeklyLimit), [hoursData, pattern, config])`

## Test Plan

### `computePrescription`
**Signature:** `(hoursData, pattern, weeklyLimit, now?) => Prescription`

**Happy path:**
- [ ] 20h worked, 40h limit, Wednesday morning, pattern-based → days = [Wed, Thu, Fri], weights reflect pattern
- [ ] summaryLine shows "Need Xh today · Yh tomorrow" (top 2 days)
- [ ] Today's already-worked hours subtracted correctly
- [ ] `patternBased: true` when pattern.status === 'ready'

**"Done" path:**
- [ ] 40h worked → `status: 'done'`, `summaryLine: "You're done for the week"` (no emoji)
- [ ] 42h worked (overtime) → `status: 'done'` (hoursRemaining = 0 after clamp)

**Pattern fallback:**
- [ ] `pattern.status === 'insufficient_data'` → `patternBased: false`, equal weight Mon–Fri
- [ ] Weekend day in remaining days excluded when `patternBased: false`

**Rest-day exclusion:**
- [ ] Friday is a rest day (dayWeights[4] = 0) → Friday absent from `days`
- [ ] Only Saturday and Sunday remain, both rest days → `status: 'done'` ("nothing actionable left")

**Day-of-week / Mon=0 conversion (m1 — most error-prone line):**
- [ ] **Sunday** (`now.getDay() === 0`) → `todayIndex === 6` (NOT -1); only Sunday remains in horizon
- [ ] Monday (`getDay() === 1`) → `todayIndex === 0`; full Mon–Sun horizon
- [ ] Saturday (`getDay() === 6`) → `todayIndex === 5`
- [ ] Inject `now` in a non-UTC scenario (e.g. a Date near midnight) → today-index uses LOCAL day, consistent with `hoursData.today` (does not flip to UTC day)

**Edge cases:**
- [ ] Thursday afternoon, 38h worked, 40h limit → 2h needed, distributed over surviving work days
- [ ] Today's worked hours exceed today's prescription → today = 0, residual stays on later days (no re-spread)
- [ ] `hoursRemaining` fractional (e.g. 7.3h) → distributed correctly, summaryLine rounded to 1 decimal

**`summaryLine` formatting:**
- [ ] Two or more work days remaining → "Need Xh today · Yh Tue"
- [ ] Only today left → "Need Xh today"
- [ ] Today already met, later days remain → "Need Xh Wed" (no "today")
- [ ] status = 'done' → "You're done for the week" (no emoji)
- [ ] Hours rounded to 1 decimal

**Hour-source consistency note (m7):** `dayWeights` derive from spec 01 `dailyHours` (work-diary slot counts), while distributed magnitude uses `hoursData.total`/`today` (payments/timesheet, includes approved manual time). Because `dayWeights` are RELATIVE (normalized to sum 1), total magnitude is always correct; only the *day-shape* (and rest-day classification) can skew for manual-heavy users. Accepted tradeoff — documented, not a bug. No test asserts cross-source equality.

**Mocks needed:**
- `HoursData` fixture factory (parameterized by `total`, `today`)
- `WorkPattern` fixture: ready + insufficient_data variants
- `now` parameter for deterministic day-of-week (cover Sun/Mon/Sat)

## Files to Create/Modify

| File | Change |
|---|---|
| `src/lib/prescription.ts` | New — `Prescription`, `DayPrescription` types, `computePrescription` |
| `src/hooks/usePrescription.ts` | New — `usePrescription` composing hook |
| `src/lib/__tests__/prescription.test.ts` | New — all test cases above (co-located with sibling lib tests, the dominant convention) |

## Verification Tiers

- **Tier 1 (unit tests):** Pure function — all cases injectable via `now` param.
- **Tier 2 (manual):** Temporarily surface `prescription.summaryLine` in a `console.log` on Overview mount. Verify the numbers make sense mid-week.
- **Tier 3 (TestFlight):** Verify summaryLine matches expectation on Monday (should show full week) vs Thursday afternoon (today + remaining work days). Specifically confirm on a **Sunday** the chip shows a sane single-day figure (not a crash / `dayWeights[-1]`).
