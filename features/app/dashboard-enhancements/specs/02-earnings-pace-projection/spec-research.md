# Spec Research: 02-earnings-pace-projection

## What to Build

An `EarningsPaceCard` component inserted in `app/(tabs)/overview.tsx` below the hero card, showing:
1. **Annual projection** — EWMA-smoothed weekly earnings × 52 weeks
2. **Pace vs target** — current average vs target weekly earnings (hourlyRate × weeklyLimit)
3. **Pace bar** — visual fill showing how close current pace is to target

## Key Files

- **New component:** `src/components/EarningsPaceCard.tsx`
- **New utility:** `computeAnnualProjection` in `src/lib/overviewUtils.ts`
- **Screen:** `app/(tabs)/overview.tsx` — insert EarningsPaceCard after OverviewHeroCard
- **Hook:** `useOverviewData` provides `earnings[]` array
- **Config:** `useConfig` provides `hourlyRate`, `weeklyLimit`

## EWMA Formula

Exponential Weighted Moving Average smooths out noisy weekly variance:
```typescript
export function computeAnnualProjection(earnings: number[]): number {
  // Exclude current (partial) week — last entry
  const completed = earnings.slice(0, -1).filter(v => v > 0);
  if (completed.length === 0) return 0;
  const alpha = 0.3; // smoothing factor: higher = more weight to recent weeks
  let ewma = completed[0];
  for (let i = 1; i < completed.length; i++) {
    ewma = alpha * completed[i] + (1 - alpha) * ewma;
  }
  return ewma * 52;
}
```

## Component Interface

```typescript
interface EarningsPaceCardProps {
  earnings: number[];          // from useOverviewData, window=24 preferred
  targetWeeklyEarnings: number; // hourlyRate * weeklyLimit
  window: 4 | 12 | 24;
}
```

## UI Layout

```
┌─────────────────────────────────────────────┐
│ EARNINGS PACE                                │
│                                              │
│  $87,400/yr projected    $104,000/yr target  │
│                                              │
│  ████████████░░░░░░░░  84%                  │
│                                              │
│  Avg $1,681/wk · 24-week EWMA               │
└─────────────────────────────────────────────┘
```

- Projection in gold, target in `colors.textMuted`
- Progress bar: gold fill, `colors.border` track, width = `min(paceRatio, 1) * 100%`
- Bar color: gold if >= 90%, warning if 60-89%, critical if < 60%
- Subtitle: avg weekly + window label

## Tests

File: `src/lib/__tests__/earningsPace.test.ts`
- `computeAnnualProjection([])` → 0
- `computeAnnualProjection([2000])` → 2000 * 52 (single completed week)
- EWMA weights recent weeks more heavily than older weeks
- Excludes last entry (partial current week)
- Handles all-zero entries (weeks with no data)

File: `src/components/__tests__/EarningsPaceCard.test.tsx`
- Renders annual projection in gold
- Shows pace bar with correct width
- Hidden when no completed weeks of data

## Acceptance Criteria

- FR1: `computeAnnualProjection` uses EWMA with alpha=0.3, excludes current week, excludes zero weeks
- FR2: `EarningsPaceCard` renders annual projection and target side by side
- FR3: Pace bar fill width = `min(ewmaWeekly / targetWeekly, 1) * 100%`
- FR4: Bar color changes based on pace ratio (gold/warning/critical thresholds)
- FR5: Card inserted in overview.tsx between OverviewHeroCard and snapshot panel
- FR6: Hidden when fewer than 2 completed weeks of earnings data
