# 04-ai-insights

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Spec 04 adds a pure-computation derivation layer on top of the 24-week weekly history already stored in `weekly_history_v2`. No new data is fetched; the layer produces three insights that are consumed by spec 05 for display.

**What is being built:**

1. `src/lib/statsUtils.ts` — two pure statistical primitives: `linearSlope(values)` (least-squares slope) and `pearsonR(xs, ys)` (Pearson correlation). Zero external dependencies. Fully tested.

2. `src/lib/aiInsights.ts` — `computeAIInsights(aiPct, brainliftHours, weekStarts)` and its return types. Pure function. Three nullable insight fields:
   - **Trend (`AITrendInsight`)** — 8-week least-squares slope expressed as signed pts change. Requires ≥5 weeks. Direction: `up`/`down`/`flat` (|slopePts| < 2).
   - **Personal best (`AIBestInsight`)** — max `aiPct` across all history weeks. Requires ≥4 weeks. Sources `weekLabel` from `weekStarts[maxIndex]` (not back-counted labels) to survive backfill gaps.
   - **BrainLift correlation (`BrainLiftCorrelationInsight`)** — Pearson r between `brainliftHours[i]` and `aiPct[i+1]` (lag-1). Requires ≥8 pairs and |r| ≥ 0.35. Returns group averages for ≥5h vs <5h BrainLift weeks.

3. `src/hooks/useAIInsights.ts` — stateful hook that assembles the three aligned arrays from `useWeeklyHistory().snapshots` + live `useAIData()` data (appending current week) and calls `computeAIInsights`. No window parameter — always reads full history.

4. `formatWeekStartLabel(weekStart: string): string` — extracted/exported from `src/lib/hours.ts`, shared by `computeAIInsights` for `best.weekLabel` formatting ("MMM D"). Reuses the existing `MONTHS` array — no duplication.

**How it fits:**

- Layer 0 (`src/lib/*`): pure, no hooks, no AsyncStorage
- Layer 1 (`src/hooks/*`): `useAIInsights` composes hooks, calls `computeAIInsights`
- Spec 05 consumes `useAIInsights()` to render chips — no changes to existing consumers

This spec has no blocking dependency on specs 01–03 because `useWeeklyHistory` already exposes `aiPct`, `brainliftHours`, and `weekStart` on each `WeeklySnapshot`.

---

## Out of Scope

1. **Rendering / UI chips** — **Deferred to [05-insights-ui](../05-insights-ui/spec-research.md).** `computeAIInsights` and `useAIInsights` produce data; the `InsightChip` components and Overview section that display it belong entirely to spec 05.

2. **Trend chart annotation** — **Descoped.** Overlaying slope lines or best-week markers on the sparkline chart is not part of this feature. The AI tab's existing chart renders unchanged.

3. **AI% normalization or quality weighting** — **Descoped.** The existing midpoint formula (`(aiPctLow + aiPctHigh) / 2`) is validated and sufficient. Any quality-weighting scheme is a separate research effort.

4. **Current-week slope inclusion decision** — **Descoped.** The spec explicitly excludes the in-progress current week from the trend window when there are ≥5 complete weeks of history. Including partial-week data would bias the slope downward for any day before Thursday. (Note: `useAIInsights` does append the current week as the final aligned entry across all three arrays; the trend algorithm takes the last 8 entries of that combined array, which may or may not include current week depending on history depth — this is intentional per D7.)

5. **Cross-spec `useOverviewData` modification** — **Descoped.** `useOverviewData` is explicitly not touched. It does not expose raw `weekStart` strings needed by `best.weekLabel`. Insights read `useWeeklyHistory` directly to avoid coupling.

6. **Widget prescription or chip display** — **Descoped.** Widget layout is not part of this spec family. Any widget insights surface is a separate work item.

7. **BrainLift correlation push notification** — **Descoped.** Notification system complexity deferred. Correlation data is surfaced only on-screen via spec 05.

8. **Multiple regression or multi-variable models** — **Descoped.** Only Pearson lag-1 correlation is in scope. Multi-variable models (e.g. BrainLift + hours predicting AI%) are a future research item.

---

## Functional Requirements

### FR1: Statistical Primitives (`src/lib/statsUtils.ts`)

Implement two pure statistical utility functions with guards for degenerate inputs.

**`linearSlope(values: number[]): number`**
- Computes the least-squares slope of `values` over indices 0..n−1.
- Returns `0` if `n < 2`.
- Positive means values are increasing, negative means decreasing.

**`pearsonR(xs: number[], ys: number[]): number`**
- Computes the Pearson correlation coefficient between two equal-length arrays.
- Returns `0` if `n < 2` or if either array has zero standard deviation.
- Returns `0` if arrays differ in length (guard, not throw).
- Range: [−1, 1].

**Success Criteria:**
- `linearSlope([5,5,5,5,5])` === 0 (flat)
- `linearSlope([0,1,2,3,4])` === 1.0 (slope per step)
- `linearSlope([4,3,2,1,0])` === −1.0
- `linearSlope([10])` === 0 (single element)
- `linearSlope([10,20])` === 10
- `pearsonR([1,2,3],[1,2,3])` === 1.0
- `pearsonR([1,2,3],[3,2,1])` === −1.0
- `pearsonR([1,2,3],[2,2,2])` === 0 (constant second array)
- `pearsonR([1,2],[1,2,3])` === 0 (length mismatch)
- Both functions are exported, JSDoc'd, and have zero imports.

---

### FR2: AI Insights Types and Pure Computation (`src/lib/aiInsights.ts`)

Define the `AIInsights` type hierarchy and implement `computeAIInsights`.

**Types:**
```typescript
export interface AITrendInsight {
  slopePts: number;        // signed pts over 8 weeks
  weeksUsed: number;       // actual weeks in slope window
  direction: 'up' | 'down' | 'flat';
}
export interface AIBestInsight {
  peakPct: number;
  weekLabel: string;       // "MMM D" from weekStarts[maxIndex]
  currentPct: number;
  ptsBelowBest: number;    // max(0, peakPct - currentPct)
}
export interface BrainLiftCorrelationInsight {
  r: number;
  highBLAvgAIPct: number;  // avg aiPct[i+1] when brainliftHours[i] >= 5
  lowBLAvgAIPct: number;   // avg aiPct[i+1] when brainliftHours[i] < 5
  pairsUsed: number;
}
export interface AIInsights {
  trend: AITrendInsight | null;
  best: AIBestInsight | null;
  brainliftCorrelation: BrainLiftCorrelationInsight | null;
}
```

**`computeAIInsights(aiPct, brainliftHours, weekStarts): AIInsights`**

Algorithm:

1. **Trend:** window = last `min(8, n)` entries of `aiPct`. If window < 5 → `trend: null`. Else: `slopePts = linearSlope(window) × (windowLength − 1)`. Direction: `|slopePts| < 2` → `'flat'`, `slopePts > 0` → `'up'`, else → `'down'`. `weeksUsed = windowLength`.

2. **Best:** if `n < 4` → `best: null`. Find `maxIndex = argmax(aiPct)`. `weekLabel = formatWeekStartLabel(weekStarts[maxIndex])`. `currentPct = aiPct[n−1]`. `ptsBelowBest = max(0, peakPct − currentPct)`.

3. **BrainLift correlation:** build pairs `(brainliftHours[i], aiPct[i+1])` for i=0..n−2. If `pairs.length < 8` → `null`. Compute `r = pearsonR(BL values, AI-next values)`. If `|r| < 0.35` → `null`. Split pairs by BL ≥ 5h vs < 5h; if either group is empty → `null`. Compute group averages for `highBLAvgAIPct` and `lowBLAvgAIPct`.

**Success Criteria:**
- `n < 5` → `trend: null`; `n = 5` → trend computed
- 8-week ascending 60→88 → `direction: 'up'`, `slopePts ≈ +28`
- Flat last 8 (within ±1pt) → `direction: 'flat'`
- Descending → `direction: 'down'`, negative `slopePts`
- `n < 4` → `best: null`; `n = 4` → best computed
- Peak at index 3 → `weekLabel` matches formatted `weekStarts[3]`
- Current week is the peak → `ptsBelowBest = 0`
- 6pts below peak → `ptsBelowBest = 6`
- Backfill-gap alignment: history with a missing intermediate week → `best.weekLabel` maps to the correct snapshot's `weekStart`
- `< 8 pairs` → `brainliftCorrelation: null`
- `10 pairs, r = 0.20` → `null` (below threshold)
- `10 pairs, r = 0.60` → returns insight with correct group averages
- No high-BL weeks at all → `null` (can't compute group average)
- `computeAIInsights` is pure (no imports from hooks/api/store)

---

### FR3: `formatWeekStartLabel` extracted from `src/lib/hours.ts`

Extract the month-name formatting logic from `getWeekLabels` into a named, exported helper.

**`formatWeekStartLabel(weekStart: string): string`**
- Input: YYYY-MM-DD Monday date string.
- Output: "MMM D" (e.g. `"Apr 7"`).
- Uses the same `MONTHS` array already in `hours.ts` — no duplication.
- `getWeekLabels` is refactored to call `formatWeekStartLabel` internally (no behavior change).

**Success Criteria:**
- `formatWeekStartLabel('2026-04-07')` === `'Apr 7'`
- `formatWeekStartLabel('2026-01-01')` === `'Jan 1'`
- `formatWeekStartLabel('2026-12-28')` === `'Dec 28'`
- Existing `getWeekLabels` tests continue to pass (no regression).
- No second `MONTHS` array is introduced anywhere in `src/lib/`.

---

### FR4: `useAIInsights` hook (`src/hooks/useAIInsights.ts`)

Stateful hook that assembles aligned arrays from history + current-week data, then calls `computeAIInsights`.

**Signature:** `export function useAIInsights(): AIInsights`

**Body (per spec-research D6, D7):**
```typescript
const { snapshots } = useWeeklyHistory();
const { data: hoursData } = useHoursData();
const { data: aiData } = useAIData();
return useMemo(() => {
  const currentMonday = getWeekStartDate(true);
  const past = snapshots.filter(s => s.weekStart < currentMonday);
  const currentAiPct = aiData ? Math.round((aiData.aiPctLow + aiData.aiPctHigh) / 2) : 0;
  const currentBL = aiData?.brainliftHours ?? 0;
  const aiPct      = [...past.map(s => s.aiPct),          currentAiPct];
  const brainlift  = [...past.map(s => s.brainliftHours), currentBL];
  const weekStarts = [...past.map(s => s.weekStart),      currentMonday];
  return computeAIInsights(aiPct, brainlift, weekStarts);
}, [snapshots, hoursData, aiData]);
```

Note: `hoursData` is included in the dependency array to ensure the hook re-runs when hours are refreshed on the same week, even though `computeAIInsights` doesn't use it directly. This mirrors `useOverviewData`'s current-week handling.

**Success Criteria:**
- Returns `AIInsights` with all fields correctly populated for a mocked history of ≥8 weeks.
- Returns `AIInsights` with all nulls for empty history.
- Does not read `useOverviewData` — sources `snapshots` from `useWeeklyHistory` directly.
- No `window` parameter.
- `useMemo` dependency array includes `[snapshots, hoursData, aiData]`.
- Hook is exported and JSDoc'd (2–3 lines describing what it returns and which hooks it reads).

---

## Technical Design

### Files to Reference

| File | Why |
|---|---|
| `src/lib/hours.ts` | Extract `formatWeekStartLabel` from `getWeekLabels`; reuse `MONTHS` array |
| `src/lib/weeklyHistory.ts` | `WeeklySnapshot` type (fields: `weekStart`, `aiPct`, `brainliftHours`) |
| `src/hooks/useWeeklyHistory.ts` | `UseWeeklyHistoryResult.snapshots` — primary history source for `useAIInsights` |
| `src/hooks/useAIData.ts` | `UseAIDataResult.data: AIWeekData` — current-week `aiPctLow`, `aiPctHigh`, `brainliftHours` |
| `src/hooks/useHoursData.ts` | Included in `useMemo` deps; `UseHoursDataResult.data` |
| `src/lib/ai.ts` | `AIWeekData` type — `aiPctLow`, `aiPctHigh`, `brainliftHours` fields |
| `src/hooks/useOverviewData.ts` | Reference only — NOT imported. Confirms `useOverviewData` does not expose `weekStart` |

### Files to Create

| File | Content |
|---|---|
| `src/lib/statsUtils.ts` | `linearSlope`, `pearsonR` — zero imports, fully JSDoc'd |
| `src/lib/aiInsights.ts` | `AITrendInsight`, `AIBestInsight`, `BrainLiftCorrelationInsight`, `AIInsights` types; `computeAIInsights`; imports `linearSlope`, `pearsonR` from `./statsUtils` and `formatWeekStartLabel` from `./hours` |
| `src/hooks/useAIInsights.ts` | `useAIInsights()` hook; imports `useWeeklyHistory`, `useHoursData`, `useAIData`, `computeAIInsights`, `getWeekStartDate` |
| `src/lib/__tests__/statsUtils.test.ts` | Unit tests for `linearSlope` and `pearsonR` |
| `src/lib/__tests__/aiInsights.test.ts` | Unit tests for `computeAIInsights` (all guards + algorithm branches) |

### Files to Modify

| File | Change |
|---|---|
| `src/lib/hours.ts` | Extract `formatWeekStartLabel(weekStart: string): string` as exported function; refactor `getWeekLabels` to call it; no behavior change |

### Data Flow

```
AsyncStorage (weekly_history_v2)
        │
        ▼
useWeeklyHistory()          useAIData()          useHoursData()
  .snapshots                 .data                 .data
  (past weeks)             (current week)         (dep array only)
        │                      │
        └──────────────────────┘
                   │
                   ▼
          useAIInsights()
          ┌─────────────────────────────────────────┐
          │  past = snapshots filtered < currentMonday │
          │  Append current week as last entry        │
          │  aiPct[], brainliftHours[], weekStarts[]  │
          └────────────────────┬────────────────────┘
                               │
                               ▼
                   computeAIInsights(aiPct, brainliftHours, weekStarts)
                   ┌──────────────────────────────────────────┐
                   │  Trend: linearSlope(last 8 aiPct)        │
                   │  Best: argmax(aiPct) + formatWeekStart   │
                   │  Correlation: pearsonR(BL[i], AI[i+1])   │
                   └──────────────────────────────────────────┘
                               │
                               ▼
                         AIInsights { trend, best, brainliftCorrelation }
                               │
                               ▼
                    spec 05 (InsightChip rendering)
```

### Edge Cases

| Case | Handling |
|---|---|
| Empty history (first launch) | All three arrays are `[currentAiPct]` — length 1. All three insights return null (guards: trend <5, best <4, corr <8). |
| `aiData` is null | `currentAiPct = 0`, `currentBL = 0`. Appended entry has zeroed values. Insights may still compute from past history. |
| All BrainLift hours are 0 | All pairs fall in the low-BL group → no high-BL group → `brainliftCorrelation: null`. |
| All BrainLift ≥ 5h | No low-BL pairs → `brainliftCorrelation: null` (can't compute group difference). |
| Backfill gap (missing week in history) | `weekStarts` array has the actual snapshot dates. `best.weekLabel` sources from `weekStarts[maxIndex]` directly — not back-counted from today — so a missing week doesn't shift the label. |
| Zero variance in aiPct (flat history) | `pearsonR` returns 0 (stddev guard). Slope is 0. `direction: 'flat'`. |
| `slopePts` exactly ±2 | `|slopePts| < 2` → `'flat'` boundary: value 2 is `'up'`/`'down'`, not flat. |
| NaN in aiPct or brainliftHours | Not guarded — caller (useAIInsights) is responsible for clean data. Snapshots from `weeklyHistory` always initialize `aiPct` and `brainliftHours` to 0, not NaN. |

### Module Layering Compliance

Per `ARCHITECTURE.md §6.6`:
- `statsUtils.ts` → no imports (pure arithmetic)
- `aiInsights.ts` → imports only `./statsUtils` and `./hours` (both `src/lib/*`) — compliant
- `useAIInsights.ts` → imports from `src/lib/*` and `src/hooks/*` — compliant
- No `src/api/*`, `src/store/*`, or AsyncStorage in `src/lib/*` — compliant

### Implementation Notes

- `formatWeekStartLabel` uses local timezone parsing of the YYYY-MM-DD string. Since `weekStart` is always a Monday in YYYY-MM-DD format, parse with `new Date(weekStart + 'T00:00:00')` (no `Z`) to get local date. This matches `getWeekLabels` existing behavior.
- `computeAIInsights` has three independent branches — order doesn't matter but Trend → Best → Correlation matches reading order of the output type.
- Group averages in the BrainLift correlation: avoid dividing by zero — if either group array is empty, return null (guard already stated in FR2).
- `weeksUsed` in `AITrendInsight` reports the actual window size (≤ 8), useful for spec 05 to decide whether to surface the insight or indicate limited data.
