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

**D1: All computation in one pure function `computeAIInsights(aiPct, brainliftHours)`.**
Returns a `AIInsights` object with nullable fields per insight. Consumers check for null.

**D2: Slope uses last 8 weeks, not all 24.**
Short-term trend (8 weeks) is more actionable than a 6-month slope. 24 weeks would surface plateaus as "flat" even if the last 2 months were improving.

**D3: Personal best is the maximum aiPct in the full history.**
Use all available weeks — personal best doesn't expire. Include the week label so the UI can say "Apr 7."

**D4: BrainLift threshold for the correlation split = 5h.**
This is already the existing BrainLift weekly target (`brainliftTarget: '5h'` in widget). Consistent.

**D5: Express slope as "X pts over 8 weeks" not as a per-week rate.**
More human-readable. Positive = trending up (cyan), negative = trending down (warning amber).

**D6: `computeAIInsights` does NOT directly consume `useOverviewData`.**
It takes raw arrays. This makes it testable without hooks and reusable anywhere.

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
```typescript
export function computeAIInsights(
  aiPct: number[],           // ordered oldest→newest, includes current week as last entry
  brainliftHours: number[],  // same length and alignment
): AIInsights
```
**Algorithm:**
1. **Trend:** take last `min(8, n)` entries of `aiPct`. If < 5 entries → `trend: null`. Else: `slopePts = linearSlope(window) × (windowLength - 1)` (total change). `direction`: |slopePts| < 2 → 'flat'; > 0 → 'up'; < 0 → 'down'.
2. **Best:** if < 4 entries → `best: null`. Else: find max of `aiPct`. Format `weekStart` to "MMM D" using `weekLabels` alignment (pass in separately) or compute from index. `currentPct = aiPct[n-1]`.
3. **BrainLift correlation:** build pairs `(brainliftHours[i], aiPct[i+1])` for i=0..n-2. If pairs.length < 8 → null. Compute `r = pearsonR(BL values, AI-next values)`. If |r| < 0.35 → null. Else compute group averages (≥5h vs <5h BL weeks).

### `useAIInsights` hook (new, in `src/hooks/useAIInsights.ts`)
```typescript
export function useAIInsights(window: 4 | 12 | 24): AIInsights
```
- Calls `useOverviewData(window)` to get `aiPct[]` and `brainliftHours[]`
- Returns `useMemo(() => computeAIInsights(data.aiPct, data.brainliftHours), [data.aiPct, data.brainliftHours])`

**Note on `best.weekLabel`:** `computeAIInsights` needs the best week's date. Pass the `weekLabels` array as a third parameter OR derive it from the index (index of max × 7-day offset from current Monday). Second approach is self-contained — use that.

Actually: simplest approach — `computeAIInsights` also takes `weekStarts: string[]` (the `YYYY-MM-DD` Monday dates, aligned with `aiPct`). Format the best week as `"MMM D"` from the `weekStart` at the max-index. This is cleaner than reconstructing from index arithmetic.

### Revised signature
```typescript
export function computeAIInsights(
  aiPct: number[],
  brainliftHours: number[],
  weekStarts: string[],   // YYYY-MM-DD, same length — needed for best.weekLabel
): AIInsights
```

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
| `src/lib/statsUtils.ts` | New — `linearSlope`, `pearsonR` |
| `src/lib/aiInsights.ts` | New — `AIInsights` types, `computeAIInsights` |
| `src/hooks/useAIInsights.ts` | New — `useAIInsights` hook |
| `src/__tests__/lib/statsUtils.test.ts` | New — slope + correlation tests |
| `src/__tests__/lib/aiInsights.test.ts` | New — all insight computation tests |

## Verification Tiers

- **Tier 1 (unit tests):** Pure functions — all cases above.
- **Tier 2 (manual):** Temporarily log `computeAIInsights` output in `useAIInsights` on Overview mount. Validate slope sign and BrainLift correlation against eyeballing the sparkline history.
- **Tier 3:** No specific TestFlight scenario — output is surfaced by spec 05.
