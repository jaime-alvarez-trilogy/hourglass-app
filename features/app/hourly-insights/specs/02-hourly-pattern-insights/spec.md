# 02-hourly-pattern-insights

**Status:** Draft
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Owner:** @jaime-alvarez-trilogy

---

## Overview

**What is being built:**

`02-hourly-pattern-insights` adds pure analytic functions and a React hook that transform `WeeklySnapshot[]` data (from spec 01) into actionable hourly patterns for the Hourglass app.

**Deliverables:**

1. **`src/lib/hourlyInsights.ts`** — new file with:
   - Types: `HourlyProfile`, `FocusWindow`, `AIHotZone`, `HourlyInsights`
   - Pure functions: `computeHourlyProfile()`, `inferFocusWindow()`, `inferAIHotZone()`
   - Utility: `formatHour()` (12hr display helper)

2. **`src/hooks/useHourlyInsights.ts`** — new file with:
   - `useHourlyInsights()` hook returning `{ profile, focusWindow, aiHotZone }`

**How it works:**

`computeHourlyProfile(snapshots)` iterates all `WeeklySnapshot` entries that carry the three new hourly arrays introduced in spec 01 (`hourlyIntensity`, `hourlyAISlots`, `hourlyProductiveSlots`). It requires ≥4 valid weeks; if fewer are available it returns `null` (card hidden on first install). For each of the 24 hours it computes per-week ratios (intensity score, AI rate, productive rate) and averages them across weeks, using NaN as the "no data" sentinel for zero-slot hours.

`inferFocusWindow(profile)` finds the highest-intensity contiguous block (2–4 hours) from the profile's `avgIntensity` array, constrained to the `activeWindow`. It returns `null` when peak intensity < 20 (insufficient signal).

`inferAIHotZone(profile)` finds the highest-AI-rate block (1–2 hours) from the profile's `avgAIRate` array, also constrained to `activeWindow`. Returns `null` when max rate < 0.10.

`useHourlyInsights()` reads `useWeeklyHistory().snapshots` and runs all three computations in `useMemo` for stable referential identity, following the identical pattern as `useWorkSchedule`.

This spec produces no UI — the data layer consumed by spec 03 (`HourlyPatternCard`).

---

## Out of Scope

1. **`HourlyPatternCard` component** — Deferred to `03-hourly-pattern-card`. This spec produces the data layer only; no React Native rendering code.

2. **Wiring into `overview.tsx`** — Deferred to `04-overview-integration`. The hook is produced here but not connected to any screen.

3. **Insight chip for focus/AI windows** — Descoped. The Patterns card lives below the existing chips area; no chip slot is allocated for focus/AI windows to avoid chip slot competition with existing schedule insights.

4. **`secondBrainDeepDive.probability` per-slot aggregation** — Descoped. The field is typed in spec 01 but surfacing it in pattern analytics is a separate future spec.

5. **Day-of-week breakdown (e.g. "Monday vs Thursday intensity")** — Descoped. `DayPatternChart` handles the day-of-week dimension; this spec covers the hour-of-day dimension only.

6. **Intraday timeline vs calendar events** — Descoped. No calendar API integration is planned.

7. **Smoothed rolling average as a stored field** — Descoped. The 3-point smoothing used internally in `inferFocusWindow` is an algorithm detail, not a stored or exported field. `HourlyProfile.avgIntensity` stores raw per-hour averages.

8. **Push notification "focus window starts in 30min"** — Descoped. Validate the card first; ship as a follow-up.

---

## Functional Requirements

### FR1 — `computeHourlyProfile(snapshots: WeeklySnapshot[]): HourlyProfile | null`

Computes per-hour averages across N weeks of `WeeklySnapshot` data.

**Success Criteria:**
- Returns `null` when fewer than 4 valid weeks are available (where "valid" = snapshot has all four fields: `hourlySlots`, `hourlyIntensity`, `hourlyAISlots`, `hourlyProductiveSlots`, each a 24-element array)
- Returns `null` when given an empty array
- `avgSlots[h]` = mean of `snapshot.hourlySlots[h]` across all valid weeks
- `avgIntensity[h]` = mean of (`snapshot.hourlyIntensity[h] / snapshot.hourlySlots[h]`) per valid week; NaN where `hourlySlots[h] === 0` for that week
- `avgAIRate[h]` = mean of (`snapshot.hourlyAISlots[h] / snapshot.hourlySlots[h]`) per valid week; NaN where `hourlySlots[h] === 0`
- `avgProductiveRate[h]` = mean of (`snapshot.hourlyProductiveSlots[h] / snapshot.hourlySlots[h]`) per valid week; NaN where `hourlySlots[h] === 0`
- `weeksCovered` = count of valid weeks used in the computation
- `activeWindow` = `[firstHour, lastHour]` where `avgSlots[h] >= 0.5`; if no hour meets this threshold, defaults to `[0, 23]`
- All returned arrays are exactly 24 elements long
- Snapshots missing any of the four required arrays are silently excluded from the valid set (no error thrown)
- Hours at boundaries (h=0, h=23) are included correctly

### FR2 — `inferFocusWindow(profile: HourlyProfile): FocusWindow | null`

Identifies the peak-intensity contiguous block from a `HourlyProfile`.

**Success Criteria:**
- Returns `null` if no hour in `activeWindow` has a non-NaN `avgIntensity` value
- Returns `null` if `avgIntensity[peakHour] < 20` (insufficient signal)
- Finds `peakHour` = argmax of `avgIntensity[h]` for h in `activeWindow` where `!isNaN(avgIntensity[h])`
- Expands contiguously left and right from `peakHour` while: the neighbor's `avgIntensity` ≥ 60% of `avgIntensity[peakHour]`, and total block size ≤ 4 hours
- `peakRange` = `[startHour, endHour]` inclusive
- `peakIntensity` = mean of `avgIntensity[h]` for all h in `peakRange`
- `weeksCovered` = `profile.weeksCovered`
- Expansion is clipped to hours within `activeWindow` (cannot expand beyond `[activeWindow[0], activeWindow[1]]`)
- A single-hour active window produces a single-hour range (no error)

### FR3 — `inferAIHotZone(profile: HourlyProfile): AIHotZone | null`

Identifies the peak-AI-rate block from a `HourlyProfile`.

**Success Criteria:**
- Returns `null` if no hour in `activeWindow` has a non-NaN `avgAIRate` value
- Returns `null` if `avgAIRate[peakHour] < 0.10` (< 10% AI at any hour)
- Finds `peakHour` = argmax of `avgAIRate[h]` for h in `activeWindow` where `!isNaN(avgAIRate[h])`
- Expands to each adjacent hour if that hour's `avgAIRate` ≥ 70% of `avgAIRate[peakHour]` (each side independently)
- `hotRange` = `[startHour, endHour]` inclusive; if both adjacent hours qualify, prefer the one with higher `avgAIRate` to keep range to 2 hours maximum
- `aiRate` = mean of `avgAIRate[h]` for all h in `hotRange`
- `weeksCovered` = `profile.weeksCovered`
- Expansion is clipped to `activeWindow`

### FR4 — `formatHour(h: number): string`

Formats a 0–23 integer hour as a 12-hour display string.

**Success Criteria:**
- `0` → `"12am"`
- `12` → `"12pm"`
- `1`–`11` → `"1am"`–`"11am"`
- `13`–`23` → `"1pm"`–`"11pm"`
- No leading zeros

### FR5 — `useHourlyInsights(): HourlyInsights`

Hook that composes `computeHourlyProfile`, `inferFocusWindow`, and `inferAIHotZone` over live snapshot data.

**Success Criteria:**
- Reads `useWeeklyHistory().snapshots`
- Returns `{ profile: null, focusWindow: null, aiHotZone: null }` when no valid weeks are available
- Computes `profile` in a `useMemo` keyed on `snapshots`
- Computes `focusWindow` in a separate `useMemo` keyed on `profile`
- Computes `aiHotZone` in a separate `useMemo` keyed on `profile`
- Does not re-compute when `snapshots` reference is unchanged
- Return value satisfies the `HourlyInsights` interface: `{ profile: HourlyProfile | null; focusWindow: FocusWindow | null; aiHotZone: AIHotZone | null }`

---

## Technical Design

### Files to Reference

| File | Purpose |
|---|---|
| `src/lib/scheduleInsights.ts` | Exact algorithm pattern for `inferWorkSchedule` — use as structural template |
| `src/hooks/useWorkSchedule.ts` | Thin hook pattern (`useWeeklyHistory` + `useMemo`) — copy structure verbatim |
| `src/hooks/useWeeklyHistory.ts` | Data source returning `{ snapshots: WeeklySnapshot[] }` |
| `src/lib/weeklyHistory.ts` | `WeeklySnapshot` interface — confirm `hourlyIntensity`, `hourlyAISlots`, `hourlyProductiveSlots` field names from spec 01 |
| `src/hooks/__tests__/useHistoryBackfill.test.ts` | Pattern for mocking `useWeeklyHistory` in hook tests |

### Files to Create

| File | Description |
|---|---|
| `src/lib/hourlyInsights.ts` | Types + pure functions (FR1–FR4) |
| `src/hooks/useHourlyInsights.ts` | `useHourlyInsights` hook (FR5) |
| `src/lib/__tests__/hourlyInsights.test.ts` | Unit tests for all pure functions |
| `src/hooks/__tests__/useHourlyInsights.test.ts` | Hook unit tests |

### Files to Modify

None. This spec adds new files only. Spec 04 will modify `overview.tsx`.

### Type Definitions (`src/lib/hourlyInsights.ts`)

```typescript
import type { WeeklySnapshot } from './weeklyHistory';

export interface HourlyProfile {
  avgSlots: number[];           // 24-element
  avgIntensity: number[];       // 24-element; NaN where avgSlots[h] === 0
  avgAIRate: number[];          // 24-element; NaN where avgSlots[h] === 0
  avgProductiveRate: number[];  // 24-element; NaN where avgSlots[h] === 0
  weeksCovered: number;
  activeWindow: [number, number]; // [firstHour, lastHour] with avgSlots >= 0.5
}

export interface FocusWindow {
  peakRange: [number, number];  // [startHour, endHour] inclusive
  peakIntensity: number;        // mean avgIntensity over peakRange
  weeksCovered: number;
}

export interface AIHotZone {
  hotRange: [number, number];   // [startHour, endHour] inclusive
  aiRate: number;               // mean avgAIRate over hotRange
  weeksCovered: number;
}

export interface HourlyInsights {
  profile: HourlyProfile | null;
  focusWindow: FocusWindow | null;
  aiHotZone: AIHotZone | null;
}
```

### Data Flow

```
useWeeklyHistory().snapshots (WeeklySnapshot[])
        │
        ▼
computeHourlyProfile(snapshots)
  → filters valid snapshots (have all 4 hourly arrays)
  → requires ≥4 valid weeks
  → averages per-hour ratios across weeks
        │
        ▼
HourlyProfile (or null)
        │
        ├─────────────────────────────────┐
        ▼                                 ▼
inferFocusWindow(profile)       inferAIHotZone(profile)
  → peak detection                → peak rate detection
  → 2-4hr expansion               → 1-2hr expansion
        │                                 │
        ▼                                 ▼
FocusWindow | null              AIHotZone | null
```

### `computeHourlyProfile` Algorithm

```
valid = snapshots.filter(s =>
  s.hourlySlots?.length === 24 &&
  s.hourlyIntensity?.length === 24 &&
  s.hourlyAISlots?.length === 24 &&
  s.hourlyProductiveSlots?.length === 24
)

if (valid.length < 4) return null

for h in 0..23:
  perWeekIntensity = valid
    .filter(s => s.hourlySlots[h] > 0)
    .map(s => s.hourlyIntensity[h] / s.hourlySlots[h])
  avgIntensity[h] = perWeekIntensity.length > 0
    ? mean(perWeekIntensity)
    : NaN

  // same pattern for avgAIRate, avgProductiveRate

  avgSlots[h] = mean(valid.map(s => s.hourlySlots[h]))

activeWindow = [
  min h where avgSlots[h] >= 0.5,
  max h where avgSlots[h] >= 0.5
]
// fallback to [0, 23] if no such h
```

### `inferFocusWindow` Algorithm

```
[lo, hi] = profile.activeWindow
validHours = [lo..hi].filter(h => !isNaN(avgIntensity[h]))
if (validHours.length === 0 || max(avgIntensity[validHours]) < 20) return null

peakHour = argmax(avgIntensity, validHours)
peakVal = avgIntensity[peakHour]

start = peakHour, end = peakHour
while (end - start + 1 < 4):
  canLeft  = start > lo && !isNaN(avgIntensity[start-1]) && avgIntensity[start-1] >= 0.6 * peakVal
  canRight = end   < hi && !isNaN(avgIntensity[end+1])   && avgIntensity[end+1]   >= 0.6 * peakVal
  if (!canLeft && !canRight) break
  // expand to the stronger side (or left if tie)
  if (canLeft && (!canRight || avgIntensity[start-1] >= avgIntensity[end+1])) start--
  else end++

peakRange = [start, end]
peakIntensity = mean(avgIntensity[start..end])
```

### `inferAIHotZone` Algorithm

```
[lo, hi] = profile.activeWindow
validHours = [lo..hi].filter(h => !isNaN(avgAIRate[h]))
if (validHours.length === 0 || max(avgAIRate[validHours]) < 0.10) return null

peakHour = argmax(avgAIRate, validHours)
peakVal = avgAIRate[peakHour]

start = peakHour, end = peakHour
leftQualifies  = start > lo && !isNaN(avgAIRate[start-1]) && avgAIRate[start-1] >= 0.70 * peakVal
rightQualifies = end   < hi && !isNaN(avgAIRate[end+1])   && avgAIRate[end+1]   >= 0.70 * peakVal

if (leftQualifies && rightQualifies):
  // both qualify — expand to the stronger side only (keep range ≤ 2 hours)
  if avgAIRate[start-1] >= avgAIRate[end+1]: start--
  else: end++
else if (leftQualifies): start--
else if (rightQualifies): end++

hotRange = [start, end]
aiRate = mean(avgAIRate[start..end])
```

### `formatHour` Algorithm

```
h = 0  → "12am"
h = 12 → "12pm"
h < 12 → `${h}am`
h > 12 → `${h - 12}pm`
```

### Edge Cases

| Case | Behavior |
|---|---|
| Snapshot with `hourlySlots[h] = 0` but `hourlyIntensity[h] > 0` | Defensive: that week's per-hour contribution is NaN (divide-by-zero produces NaN, filtered out by non-NaN week count) |
| All `avgSlots < 0.5` | `activeWindow` defaults to `[0, 23]` |
| `inferFocusWindow` with identical intensities at expansion | Expands up to the 4-hour cap via left-preference tie-breaking, then stops |
| `inferAIHotZone` where both neighbors qualify | Only the stronger neighbor is expanded (range stays ≤ 2 hours) |
| NaN hours inside activeWindow range | Silently skipped in argmax and expansion checks |
| `hourlySlots[h]` missing some weeks but present in others | Only weeks where all 4 arrays are 24-length are valid; partial arrays excluded entirely |

### Dependency Notes

- Pure data layer: no UI imports, no AsyncStorage, no API calls.
- `src/lib/hourlyInsights.ts` imports only from `./weeklyHistory` (types) — satisfies module layering in `docs/ARCHITECTURE.md §6.6`.
- `src/hooks/useHourlyInsights.ts` imports from `react` (useMemo), `./useWeeklyHistory`, and `../lib/hourlyInsights`.
