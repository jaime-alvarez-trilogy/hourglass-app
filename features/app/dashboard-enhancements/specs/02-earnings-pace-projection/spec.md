# 02-earnings-pace-projection

**Status:** Complete
**Created:** 2026-04-06
**Last Updated:** 2026-04-06
**Owner:** @jaimeadf

---

## Overview

`EarningsPaceCard` is a React Native component that gives the user an at-a-glance earnings trajectory view. It slots into `app/(tabs)/overview.tsx` directly below the existing `OverviewHeroCard`, before any snapshot panel.

The card computes an Exponential Weighted Moving Average (EWMA, α=0.3) over completed weekly earnings, multiplies the smoothed weekly figure by 52 to derive an annual projection, and compares that against the user's target annual earnings (`hourlyRate × weeklyLimit × 52`). A colour-coded pace bar (gold / warning / critical) gives immediate visual feedback on whether the user is on track.

Data flows from the existing `useOverviewData` hook (which returns an `earnings[]` array) and the `useConfig` hook (which supplies `hourlyRate` and `weeklyLimit`). A pure utility function `computeAnnualProjection` is exported from `src/lib/overviewUtils.ts` for isolated unit testing.

The card is hidden when fewer than 2 completed weeks of earnings data are available, avoiding misleading projections from a single data point.

---

## Out of Scope

1. **Historical earnings chart / sparkline** — Descoped: a full trend chart is a separate visualisation concern not part of this card's pace signal.

2. **Editable target weekly earnings** — Descoped: `hourlyRate` and `weeklyLimit` are set during onboarding. In-card editing is out of scope for this spec.

3. **Multi-currency / currency formatting beyond USD** — Descoped: the app currently assumes USD throughout; internationalisation is a future concern.

4. **Window selector UI (4 / 12 / 24 weeks)** — Descoped: the component accepts a `window` prop but the selector control is deferred to a future polish spec. Default is 24 weeks.

5. **Push notification for pace drop** — Descoped: notification triggers for earnings pace changes are not part of this dashboard-enhancements feature.

6. **Overtime / bonus earnings adjustment** — Descoped: the EWMA is computed on raw weekly earnings totals; deduction or bonus normalisation is a future concern.

---

## Functional Requirements

### FR1 — `computeAnnualProjection` utility

Implement a pure function `computeAnnualProjection(earnings: number[]): number` in `src/lib/overviewUtils.ts`.

**Algorithm:**
1. Slice off the last entry (current, partial week): `completed = earnings.slice(0, -1)`
2. Filter out zero values: `completed = completed.filter(v => v > 0)`
3. If `completed.length < 2` return `0`
4. Compute EWMA with α = 0.3, seeded with `completed[0]`:
   - For each subsequent value: `ewma = 0.3 * v + 0.7 * ewma`
5. Return `ewma * 52`

**Success Criteria:**
- `computeAnnualProjection([])` returns `0`
- `computeAnnualProjection([2000])` returns `0` (only one entry = current partial week)
- `computeAnnualProjection([2000, 1500])` returns `0` (only one completed week; need >= 2)
- `computeAnnualProjection([2000, 2000, 2000])` returns `2000 * 52` (stable 2 completed weeks)
- EWMA weights the most recent completed week more than older weeks
- All-zero arrays (excluding current week) return `0`
- Zero weeks interspersed are excluded from EWMA calculation

---

### FR2 — `EarningsPaceCard` renders projection and target

Create `src/components/EarningsPaceCard.tsx` accepting:
```typescript
interface EarningsPaceCardProps {
  earnings: number[];
  targetWeeklyEarnings: number;
  window: 4 | 12 | 24;
}
```

The card renders:
- Section label: "EARNINGS PACE" in `colors.textMuted`, uppercase
- Annual projection value in gold (`$XX,XXX / yr projected`)
- Annual target value in `colors.textMuted` (`$XX,XXX / yr target`)

**Success Criteria:**
- Projection amount rendered and styled gold
- Target amount rendered and styled `colors.textMuted`
- Card uses `borderAccentColor={colors.gold}` (earnings context per brand guidelines §1.4)
- Dollar formatting uses locale string

---

### FR3 — Pace bar fill width

The pace bar's filled portion width = `min(ewmaWeekly / targetWeekly, 1) * 100%`.

- `ewmaWeekly` = `computeAnnualProjection(earnings) / 52`
- `targetWeekly` = `targetWeeklyEarnings`
- Track background: `colors.border`
- Fill coloured per FR4
- `testID="pace-bar-fill"` on the fill element

**Success Criteria:**
- Fill width proportional to pace ratio, capped at 100%
- Track always full width, fill overlaid within it
- Uses `Math.min` to cap ratio

---

### FR4 — Pace bar colour based on ratio

The fill colour changes based on `paceRatio = ewmaWeekly / targetWeekly`:

| Ratio | Colour |
|-------|--------|
| >= 0.90 | `colors.gold` |
| 0.60 – 0.89 | `colors.warning` |
| < 0.60 | `colors.critical` |

**Success Criteria:**
- Gold at >= 90% pace
- Warning at 60–89% pace
- Critical below 60% pace

---

### FR5 — Card inserted in overview.tsx

`EarningsPaceCard` is inserted into `app/(tabs)/overview.tsx` between `OverviewHeroCard` and the snapshot panel.

Props wired from hooks:
- `earnings`: from `useOverviewData().data.earnings`
- `targetWeeklyEarnings`: `config.hourlyRate * config.weeklyLimit`
- `window`: current window value (default 24)

**Success Criteria:**
- Card visually appears below the hero card
- Props sourced from existing hooks
- No new API calls introduced

---

### FR6 — Hidden when insufficient data

When `computeAnnualProjection(earnings) === 0`, the card returns `null`.

This covers: empty array, single entry, fewer than 2 completed non-zero weeks.

**Success Criteria:**
- Returns `null` when projection is 0
- With >= 2 completed non-zero weeks → component renders

---

### FR7 — Subtitle line

Below the pace bar, render:
`Avg $X,XXX/wk · {window}W EWMA`

**Success Criteria:**
- Subtitle present below bar
- Shows EWMA weekly average in dollars
- Shows window count with "W" suffix
- Styled in `colors.textMuted`, small font

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `app/(tabs)/overview.tsx` | Insertion point for `EarningsPaceCard` |
| `src/lib/overviewUtils.ts` | Exports `computeAnnualProjection` |
| `src/hooks/useOverviewData.ts` | Provides `earnings: number[]` |
| `src/hooks/useConfig.ts` | Provides `hourlyRate`, `weeklyLimit` |
| `src/lib/colors.ts` | Design tokens: `gold`, `textMuted`, `border`, `warning`, `critical` |

### Files Created

| File | Description |
|------|-------------|
| `src/components/EarningsPaceCard.tsx` | Card component |
| `src/lib/__tests__/earningsPace.test.ts` | Unit tests for `computeAnnualProjection` |
| `src/components/__tests__/EarningsPaceCard.test.tsx` | Component static analysis tests |

### Files Modified

| File | Change |
|------|--------|
| `src/lib/overviewUtils.ts` | Added `computeAnnualProjection` export |
| `app/(tabs)/overview.tsx` | Imported and inserted `EarningsPaceCard` |

---

### Data Flow

```
useConfig()
  └─ hourlyRate, weeklyLimit
       └─► targetWeeklyEarnings = hourlyRate * weeklyLimit

useOverviewData()
  └─ earnings: number[]
       └─► EarningsPaceCard
             ├─► computeAnnualProjection(earnings) → annualProjection
             ├─► ewmaWeekly = annualProjection / 52
             ├─► paceRatio = min(ewmaWeekly / targetWeeklyEarnings, 1)
             ├─► barColor (FR4 thresholds)
             └─► rendered card (or null if projection = 0)
```

### Edge Cases

| Case | Handling |
|------|---------|
| Empty `earnings` | `computeAnnualProjection` returns 0 → card hidden |
| Only 1 completed week | `completed.length < 2` → returns 0 → card hidden |
| All zeroes | `filter(v > 0)` removes all → 0 → card hidden |
| `targetWeeklyEarnings === 0` | Guard: `paceRatio = 0` if target is 0 → critical bar |
| `paceRatio > 1` (over-performing) | `Math.min` caps bar at 100%, colour still gold |
