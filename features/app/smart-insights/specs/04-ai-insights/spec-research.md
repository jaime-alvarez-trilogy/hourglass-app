# Spec Research: 04-ai-insights

## Problem

The app shows AI% as a number and a sparkline but never surfaces whether it's improving, what the user's personal peak was, or whether BrainLift hours in one week actually predict higher AI% the following week. These insights are computable from the 24-week history already stored — they just need a derivation layer.

## Exploration Findings

### Available weekly data (`src/lib/weeklyHistory.ts`)
Per `WeeklySnapshot`: `aiPct: number` (0–100 midpoint), `brainliftHours: number`. Up to 24 past weeks + current week from `useAIData`.

### `useOverviewData` exposes `aiPct: number[]` and `brainliftHours: number[]`
Already composed from history + current week. These arrays are the primary input.

### `appGuidance.ts` — unused but relevant pattern
`src/lib/appGuidance.ts` already defines `GuidanceChip { text: string; color: string }` and a generation pattern (evaluate conditions in priority order, return max 3 chips). We extend this pattern but don't use that specific function — it's per-app breakdown focused, not per-week history.

### `aiTier.ts` — unused classification
`src/lib/aiTier.ts` classifies average AI% into tiers ("AI Leader" etc.). This will be used by spec 05 to decorate the AI trend insight chip with a tier label.

### Statistical primitives needed
- **Linear regression slope** (least-squares over last N weeks) — a handful of lines of arithmetic, no external library.
- **Pearson correlation** between two arrays — also pure arithmetic, ~10 lines.
- Both are pure functions with no deps — go in `src/lib/statsUtils.ts`.

### Significance guards (the most important design decision)
Without guards, weak correlations and tiny slopes produce misleading statements. Guards:
- **Slope insight:** require ≥5 weeks of data (to distinguish trend from noise).
- **BrainLift correlation:** require ≥8 week pairs AND |r| ≥ 0.35 (moderate correlation).
- **Personal best:** require ≥4 weeks of data.
When any guard fails → return `null` for that insight. UI hides it silently (per user decision).

### Lag correlation mechanism
For each pair of consecutive weeks `(week[i], week[i+1])`:
- predictor: `brainliftHours[i]`
- response: `aiPct[i+1]`
Compute Pearson r over all valid pairs. Split weeks into "5h+ BrainLift" vs "< 5h", compute average `aiPct[i+1]` for each group — the two averages are the human-readable output ("91% vs 74%").

### Color semantics (design constraint)
Per `WIDGET-INFO-DESIGN.md` and existing tokens:
- AI insight → `cyan` (`#00C2FF` / `text-cyan`)
- BrainLift insight → `violet` (`#A78BFA` / `text-violet`)
- Pace insight (spec 03/05) → `statusColor` (green/amber/red based on pace)
- No new colors.

## Key Decisions

**D1: All computation in one pure function `computeAIInsights(aiPct, brainliftHours, weekStarts)`.**
Returns an `AIInsights` object with nullable fields per insight. Consumers check for null. All three arrays are index-aligned, oldest→newest, current week last.

**D2: Slope uses last 8 weeks, not all 24.**
Short-term trend (8 weeks) is more actionable than a 6-month slope. 24 weeks would surface plateaus as "flat" even if the last 2 months were improving. (Distinct from D7: the *input* is full history; the trend *window* is the last 8 of it.)

**D3: Personal best is the maximum aiPct in the full history.**
Use all available weeks — personal best doesn't expire. Source the label from the matching `weekStarts[maxIndex]` so the UI can say "Apr 7."

**D4: BrainLift threshold for the correlation split = 5h.**
This is already the existing BrainLift weekly target (`brainliftTarget: '5h'` in widget). Consistent.

**D5: Express slope as "X pts over 8 weeks" not as a per-week rate.**
More human-readable. Positive = trending up, negative = trending down. The chip dot stays `colors.cyan` in BOTH directions (cyan = AI is color-locked); direction is conveyed by the "up/down" wording, not by switching to amber (N2 — amber is the pace/warning token and would break the color-to-meaning lock).

**D6: `computeAIInsights` is pure and takes raw arrays — it does NOT consume any hook.**
Testable in isolation, reusable anywhere. The `useAIInsights` hook (the stateful wrapper) reads `useWeeklyHistory` + `useHoursData` + `useAIData` and assembles the arrays. `useOverviewData` is explicitly NOT used (it exposes only formatted `weekLabels`, never raw `weekStart`).

**D7: Insights always read the FULL history, never the chart window.**
`useAIInsights()` takes no `window` param. If it sliced to the Overview's default 4-week window, trend (≥5 wk) and correlation (≥9 wk) would be permanently null. Insight significance is independent of which chart range the user is viewing.

**D8: Layering is clean (record for review).**
`statsUtils.ts`, `aiInsights.ts`, `formatWeekStartLabel` are all `src/lib/*` and import only types + other lib helpers — no `src/api`, no `src/store`, no AsyncStorage, no hooks. The hook layer (`useAIInsights`) lives in `src/hooks/*`. Conforms to CLAUDE.md §Module layering.

## Interface Contracts

### `statsUtils.ts` (new, in `src/lib/statsUtils.ts`)
```typescript
// Least-squares slope of y over x (index 0..n-1). Returns 0 if n < 2.
export function linearSlope(values: number[]): number

// Pearson r correlation between two equal-length arrays. Returns 0 if n < 2 or stddev = 0.
export function pearsonR(xs: number[], ys: number[]): number
```

### `AIInsights` type (new, in `src/lib/aiInsights.ts`)
```typescript
export interface AITrendInsight {
  slopePts: number;       // signed pts over 8 weeks (e.g. +12 or -8)
  weeksUsed: number;      // actual weeks in slope window (may be < 8 if insufficient history)
  direction: 'up' | 'down' | 'flat'; // |slopePts| < 2 → 'flat'
}

export interface AIBestInsight {
  peakPct: number;        // highest aiPct in history
  weekLabel: string;      // e.g. "Apr 7" (formatted from weekStart)
  currentPct: number;     // current week midpoint (last array entry)
  ptsBelowBest: number;   // peakPct - currentPct (0 if at/above peak)
}

export interface BrainLiftCorrelationInsight {
  r: number;                   // Pearson r (for internal use / debug)
  highBLAvgAIPct: number;      // avg aiPct[i+1] when brainliftHours[i] >= 5h
  lowBLAvgAIPct: number;       // avg aiPct[i+1] when brainliftHours[i] < 5h
  pairsUsed: number;           // number of week pairs
}

export interface AIInsights {
  trend: AITrendInsight | null;             // null if < 5 weeks
  best: AIBestInsight | null;              // null if < 4 weeks
  brainliftCorrelation: BrainLiftCorrelationInsight | null; // null if < 8 pairs or |r| < 0.35
}
```

### `computeAIInsights` (new, in `src/lib/aiInsights.ts`)
The authoritative signature is the 3-arg form (`aiPct`, `brainliftHours`, `weekStarts`) defined under "`computeAIInsights` signature" below — all three arrays index-aligned, oldest→newest, current week last. (`weekStarts` is required to source `best.weekLabel`; see D1, m6, and Algorithm step 2.)

**Algorithm:**
1. **Trend:** take last `min(8, n)` entries of `aiPct`. If < 5 entries → `trend: null`. Else: `slopePts = linearSlope(window) × (windowLength - 1)` (total change). `direction`: |slopePts| < 2 → 'flat'; > 0 → 'up'; < 0 → 'down'.
2. **Best:** if < 4 entries → `best: null`. Else: find `maxIndex` = argmax of `aiPct`. `weekLabel = formatWeekStartLabel(weekStarts[maxIndex])` (the actual snapshot date — NOT `getWeekLabels`, which would mislabel on a backfill gap). `currentPct = aiPct[n-1]`; `ptsBelowBest = max(0, peakPct - currentPct)`.
3. **BrainLift correlation:** build pairs `(brainliftHours[i], aiPct[i+1])` for i=0..n-2. If pairs.length < 8 → null. Compute `r = pearsonR(BL values, AI-next values)`. If |r| < 0.35 → null. Else compute group averages (≥5h vs <5h BL weeks).

### `useAIInsights` hook (new, in `src/hooks/useAIInsights.ts`)
```typescript
/**
 * Derives AI trend, personal best, and BrainLift→AI lag correlation from the
 * FULL weekly history (always 24 weeks — independent of the Overview chart window).
 * Reads useWeeklyHistory().snapshots directly. Returns AIInsights with nullable
 * fields when there is insufficient data per insight.
 */
export function useAIInsights(): AIInsights
```

**No `window` parameter — and `useOverviewData` is NOT the source.** Two reasons (both M3):
1. **Window starvation:** the app's default chart window is `4`. If insights were sliced to the window, the trend (needs ≥5 weeks) and correlation (needs ≥9 weeks) would be *permanently null* at the default view regardless of how much history is stored. Insights must always read the full history.
2. **`useOverviewData` exposes only `weekLabels` (formatted "MMM D"), never raw `weekStart` dates.** It cannot supply the `weekStarts: string[]` that `computeAIInsights` needs for `best.weekLabel`. Read `useWeeklyHistory().snapshots` directly instead — each snapshot carries `weekStart` (YYYY-MM-DD).

**Hook body (mirrors `useOverviewData`'s current-week handling, src/hooks/useOverviewData.ts:56-89):**
```typescript
const { snapshots } = useWeeklyHistory();
const { data: hoursData } = useHoursData();
const { data: aiData } = useAIData();
return useMemo(() => {
  const currentMonday = getWeekStartDate(true);            // UTC Monday
  const past = snapshots.filter(s => s.weekStart < currentMonday); // exclude in-progress week
  const currentAiPct = aiData ? Math.round((aiData.aiPctLow + aiData.aiPctHigh) / 2) : 0;
  const currentBL = aiData?.brainliftHours ?? 0;
  // Append current week as the last, aligned entry across all three arrays
  const aiPct        = [...past.map(s => s.aiPct),          currentAiPct];
  const brainlift    = [...past.map(s => s.brainliftHours), currentBL];
  const weekStarts   = [...past.map(s => s.weekStart),      currentMonday];
  return computeAIInsights(aiPct, brainlift, weekStarts);
}, [snapshots, hoursData, aiData]);
```
This keeps spec 04 honestly "blocked by: none" — it depends only on the existing history store, not on specs 01–03.

### `computeAIInsights` signature
```typescript
/**
 * Pure. Computes 8-week trend slope, personal-best week, and BrainLift→next-week-AI
 * correlation. All three arrays must be index-aligned, oldest→newest, current week last.
 * Returns nullable fields when guards fail (trend <5 wk, best <4 wk, corr <8 pairs or |r|<0.35).
 */
export function computeAIInsights(
  aiPct: number[],
  brainliftHours: number[],
  weekStarts: string[],   // YYYY-MM-DD Mondays, index-aligned with aiPct — source for best.weekLabel
): AIInsights
```
**`best.weekLabel` sourcing (m6):** format from `weekStarts[maxIndex]`, the ACTUAL snapshot `weekStart` — never from `getWeekLabels()` output (which back-counts from today and would mislabel the week if a backfill gap exists). Use a shared `formatWeekStartLabel(weekStart): string` extracted from `src/lib/hours.ts`'s month-name logic (N3 — do not inline a second `MONTHS` array).

## Test Plan

### `linearSlope`
- [ ] Flat array `[5, 5, 5, 5, 5]` → 0
- [ ] Steadily increasing `[0, 1, 2, 3, 4]` → 1.0 (slope per step)
- [ ] Decreasing `[4, 3, 2, 1, 0]` → -1.0
- [ ] Single element → 0
- [ ] Two elements `[10, 20]` → 10

### `pearsonR`
- [ ] Perfect positive correlation `[1,2,3], [1,2,3]` → 1.0
- [ ] Perfect negative correlation `[1,2,3], [3,2,1]` → -1.0
- [ ] No correlation `[1,2,3], [2,2,2]` → 0 (constant second array)
- [ ] Different lengths (guard) → 0

### `computeAIInsights`
**Trend:**
- [ ] < 5 weeks → `trend: null`
- [ ] 8 weeks ascending 60→88 → `trend.direction: 'up'`, `slopePts ≈ +28`
- [ ] Flat last 8 weeks (±1pt) → `trend.direction: 'flat'`
- [ ] Descending → `trend.direction: 'down'`, negative slopePts

**Best:**
- [ ] < 4 weeks → `best: null`
- [ ] Peak at week 3 → `best.weekLabel` matches `weekStarts[3]` formatted as "MMM D"
- [ ] Current week is the peak → `ptsBelowBest = 0`
- [ ] Current week 6pts below peak → `ptsBelowBest = 6`
- [ ] **Backfill-gap alignment:** history with a missing intermediate week → `best.weekLabel` maps to the correct snapshot's `weekStart` (proves it sources `weekStarts[maxIndex]`, not a back-counted label)

**BrainLift correlation:**
- [ ] < 8 pairs → null
- [ ] 10 pairs, r = 0.20 (below threshold) → null
- [ ] 10 pairs, r = 0.60 → returns insight with correct group averages
- [ ] Group averages: high-BL weeks (≥5h) have higher next-week AI% than low-BL weeks
- [ ] No high-BL weeks at all → null (can't compute group average)

**Mocks needed:**
- Array factory for aligned `aiPct`, `brainliftHours`, `weekStarts`

## Files to Create/Modify

| File | Change |
|---|---|
| `src/lib/statsUtils.ts` | New — `linearSlope`, `pearsonR` (each JSDoc'd: n<2 and length-mismatch guards) |
| `src/lib/aiInsights.ts` | New — `AIInsights` types, `computeAIInsights` (JSDoc'd) |
| `src/lib/hours.ts` | Extract/export `formatWeekStartLabel(weekStart: string): string` from the existing `getWeekLabels` month-name logic (N3 — shared, no duplicated `MONTHS` array) |
| `src/hooks/useAIInsights.ts` | New — `useAIInsights()` hook (no window param; reads `useWeeklyHistory` + `useHoursData` + `useAIData`) |
| `src/lib/__tests__/statsUtils.test.ts` | New — slope + correlation tests (co-located, dominant lib-test convention) |
| `src/lib/__tests__/aiInsights.test.ts` | New — all insight computation tests |

**Note:** `useOverviewData.ts` is intentionally NOT modified — insights read `useWeeklyHistory` directly (M3). No shared-hook change, so existing Overview chart consumers are unaffected.

## Verification Tiers

- **Tier 1 (unit tests):** Pure functions — all cases above.
- **Tier 2 (manual):** Temporarily log `computeAIInsights` output in `useAIInsights` on Overview mount. Validate slope sign and BrainLift correlation against eyeballing the sparkline history.
- **Tier 3:** No specific TestFlight scenario — output is surfaced by spec 05.
