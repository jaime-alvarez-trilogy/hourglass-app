# Spec Research: 03-hours-variance

## What to Build

Surface **week-over-week hours consistency** (variance/standard deviation) in the Weekly Hours `ChartSection` on the Overview tab. Helps the user understand how stable their hours are, not just the average.

## Key Files

- **Utility:** `src/lib/hours.ts` — add `computeHoursVariance(hours: number[])`
- **Screen:** `app/(tabs)/overview.tsx` — pass variance result to Weekly Hours ChartSection subtitle
- **Component:** `src/components/overview.tsx` `ChartSection` — `subtitle` prop already exists

## Variance Formula

```typescript
// In src/lib/hours.ts
export interface HoursVarianceResult {
  stdDev: number;      // standard deviation in hours
  label: string;       // "±1.2h/week" | "Consistent" | "Variable"
  isConsistent: boolean; // stdDev <= 2h
}

export function computeHoursVariance(hours: number[]): HoursVarianceResult | null {
  // Exclude current partial week (last entry)
  const completed = hours.slice(0, -1).filter(v => v > 0);
  if (completed.length < 3) return null; // need at least 3 data points
  
  const mean = completed.reduce((s, v) => s + v, 0) / completed.length;
  const variance = completed.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / completed.length;
  const stdDev = Math.sqrt(variance);
  
  const isConsistent = stdDev <= 2;
  const label = stdDev <= 1
    ? 'Consistent'
    : stdDev <= 3
    ? `±${stdDev.toFixed(1)}h/week`
    : 'Variable';
  
  return { stdDev, label, isConsistent };
}
```

## UI Integration

In `app/(tabs)/overview.tsx`, compute variance and pass to Weekly Hours ChartSection subtitle:

```typescript
const hoursVariance = computeHoursVariance(overviewData.hours);

// In ChartSection:
subtitle={hoursVariance
  ? `Goal: ${weeklyLimit}h · ${hoursVariance.label}`
  : `Goal: ${weeklyLimit}h / week`
}
```

Color the variance portion:
- Consistent (stdDev ≤ 2h): `colors.success`
- Moderate (2–3h): `colors.warning`  
- Variable (> 3h): `colors.textSecondary` (informational, not alarming)

Since subtitle is a plain string prop in ChartSection, update `ChartSection` to accept `subtitleColor?: string` OR split into two subtitle lines. Simplest: add a `subtitleRight?: string` + `subtitleRightColor?: string` prop rendered inline.

## Tests

File: `src/lib/__tests__/hoursVariance.test.ts`
- `computeHoursVariance([40, 40, 40, 40])` → stdDev=0, label='Consistent', isConsistent=true
- `computeHoursVariance([38, 42, 39, 41, 40])` → stdDev≈1.4, isConsistent=true
- `computeHoursVariance([30, 40, 35, 45, 38])` → stdDev≈5.0, label='Variable'
- `computeHoursVariance([40, 40])` → null (< 3 completed points)
- Excludes last entry (current partial week)
- Excludes zero entries (weeks with no tracked hours)

## Acceptance Criteria

- FR1: `computeHoursVariance` returns correct stdDev and label for all cases
- FR2: Returns null with < 3 completed non-zero weeks
- FR3: Weekly Hours ChartSection subtitle updated to include variance label
- FR4: Variance label color reflects consistency level
