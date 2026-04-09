# 03-hours-variance

**Status:** Draft
**Created:** 2026-04-06
**Last Updated:** 2026-04-06
**Owner:** @jaimealvarez

---

## Overview

### What

Surface week-over-week hours consistency as a **variance/standard-deviation label** in the Weekly Hours `ChartSection` subtitle on the Overview tab.

### Why

The current subtitle shows only a static goal (`Goal: 40h / week`). Users can already see their average hours but have no signal for how *stable* those hours are. Knowing whether performance is consistent (±0–1h) or volatile (±5h) helps the user take action — tighten up a variable schedule or feel confident about a consistent one.

### How

1. Add `computeHoursVariance(hours: number[])` to `src/lib/hours.ts` — pure function, population standard deviation over completed non-zero weeks (excludes the current partial week and weeks with zero hours).
2. Update `app/(tabs)/overview.tsx` to call the function and pass its output to `ChartSection`.
3. Extend `ChartSection` in `src/components/overview.tsx` with `subtitleRight?: string` and `subtitleRightColor?: string` props so the variance label can be rendered inline next to the goal string, colored by consistency tier.

### Label Tiers

| stdDev | Label | Color |
|--------|-------|-------|
| ≤ 1h | `Consistent` | `colors.success` |
| 1–3h | `±N.Nh/week` | `colors.warning` |
| > 3h | `Variable` | `colors.textSecondary` |

### Scope

Pure utility function + minimal UI prop addition. No new screens, no new API calls.

---

## Out of Scope

1. **Trend line or sparkline for variance** — **Descoped.** Visualising variance history is a separate charting concern; the label is sufficient for this spec.

2. **Per-day variance (day-of-week analysis)** — **Descoped.** Only week-level stdDev is required. Day-level analysis belongs in a future analytics spec.

3. **Configurable consistency threshold** — **Descoped.** The 2h threshold is a product decision; user-adjustable thresholds are out of scope for this feature.

4. **Variance for AI% or earnings** — **Descoped.** Only weekly hours variance is in scope here. Earnings pace projection is handled in spec 02-earnings-pace-projection.

5. **Backend persistence of variance** — **Descoped.** Computed client-side from already-fetched hours data; no new API endpoints required.

6. **Notification when hours become variable** — **Descoped.** Notification logic is a separate concern; the label is informational only.

---

## Functional Requirements

### FR1: `computeHoursVariance` — Core Calculation

**What:** Export `computeHoursVariance(hours: number[]): HoursVarianceResult | null` from `src/lib/hours.ts`.

**Behaviour:**
- Exclude the last entry in the input array (current partial week).
- Filter out zero-valued entries (weeks with no tracked hours).
- If fewer than 3 data points remain after filtering, return `null`.
- Compute population standard deviation over the remaining values.
- Derive `label` from stdDev tiers: ≤1 → `'Consistent'`; 1–3 → `'±N.Nh/week'` (one decimal); >3 → `'Variable'`.
- Derive `isConsistent` as `stdDev <= 2`.
- Return `{ stdDev, label, isConsistent }`.

**Interface:**
```typescript
export interface HoursVarianceResult {
  stdDev: number;
  label: string;
  isConsistent: boolean;
}

export function computeHoursVariance(hours: number[]): HoursVarianceResult | null
```

**Success Criteria:**
- `computeHoursVariance([40, 40, 40, 40])` → `{ stdDev: 0, label: 'Consistent', isConsistent: true }`
- `computeHoursVariance([38, 42, 39, 41, 40])` → stdDev ≈ 1.4, `label: '±1.4h/week'`, `isConsistent: true`
- `computeHoursVariance([30, 40, 35, 45, 38])` → stdDev > 3, `label: 'Variable'`, `isConsistent: false`
- `computeHoursVariance([40, 40])` → `null` (only 1 completed point after excluding last)
- `computeHoursVariance([40, 0, 0, 40])` → `null` (zeros filtered, 1 completed point)
- Last entry is always treated as the current partial week and excluded before processing.

---

### FR2: Null-Safe Guard — Insufficient Data

**What:** When fewer than 3 completed non-zero weeks exist, return `null` and render no variance label in the UI.

**Behaviour:**
- Input array length ≤ 1 after exclusions → `null`.
- Input array length 2 after exclusions → `null`.
- Input array length ≥ 3 after exclusions → compute and return result.

**Success Criteria:**
- `computeHoursVariance([])` → `null`
- `computeHoursVariance([40])` → `null` (only 0 completed points)
- `computeHoursVariance([40, 40])` → `null` (only 1 completed point)
- `computeHoursVariance([40, 40, 40])` → non-null (exactly 2 completed points)
- No crash or undefined return for any input length.

---

### FR3: ChartSection — `subtitleRight` Prop

**What:** Add `subtitleRight?: string` and `subtitleRightColor?: string` optional props to `ChartSection` in `src/components/overview.tsx`.

**Behaviour:**
- Existing `subtitle` prop behaviour unchanged.
- When `subtitleRight` is provided, render it inline after `subtitle`, separated by ` · `.
- When `subtitleRightColor` is provided, apply it to the `subtitleRight` text.
- When `subtitleRight` is absent, render exactly as before (no visual change).

**Success Criteria:**
- `ChartSection` renders `subtitleRight` text when prop is supplied.
- `subtitleRight` is styled with `subtitleRightColor` when provided.
- Existing snapshots / tests for `ChartSection` with only `subtitle` pass without modification.

---

### FR4: Overview Screen — Wire Variance to ChartSection

**What:** In `app/(tabs)/overview.tsx`, compute `hoursVariance` from `overviewData.hours` and pass the label and color to the Weekly Hours `ChartSection`.

**Behaviour:**
- Call `computeHoursVariance(overviewData.hours)` after data is loaded.
- Pass `subtitleRight={hoursVariance?.label}` and `subtitleRightColor` based on consistency tier:
  - `isConsistent` (stdDev ≤ 2) → `colors.success`
  - stdDev ≤ 3 → `colors.warning`
  - stdDev > 3 → `colors.textSecondary`
- When `hoursVariance` is `null`, pass no `subtitleRight` (label is simply omitted).
- `subtitle` continues to show `Goal: ${weeklyLimit}h / week` (no change to existing string).

**Success Criteria:**
- Weekly Hours ChartSection subtitle shows e.g. `Goal: 40h / week` with `Consistent` appended in green when variance is low.
- When data is insufficient, subtitle shows only `Goal: 40h / week` (no variance label).
- Color reflects consistency tier as specified.

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/hours.ts` | Existing hours utility — add `computeHoursVariance` here |
| `src/lib/__tests__/` | Existing test folder — add `hoursVariance.test.ts` here |
| `src/components/overview.tsx` | Contains `ChartSection` component — add `subtitleRight` props |
| `app/(tabs)/overview.tsx` | Overview screen — import and call `computeHoursVariance`, wire to ChartSection |
| `src/theme/colors.ts` | Color tokens (`success`, `warning`, `textSecondary`) |

### Files to Create

| File | Contents |
|------|---------|
| `src/lib/__tests__/hoursVariance.test.ts` | Unit tests for `computeHoursVariance` — all FR1/FR2 cases |

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/hours.ts` | Export `HoursVarianceResult` interface + `computeHoursVariance` function |
| `src/components/overview.tsx` | Add `subtitleRight?: string` and `subtitleRightColor?: string` to `ChartSectionProps`; render inline |
| `app/(tabs)/overview.tsx` | Import `computeHoursVariance`; compute result; pass to Weekly Hours ChartSection |

### Data Flow

```
overviewData.hours: number[]          (already fetched — 4-week rolling window)
        │
        ▼
computeHoursVariance(hours)           (src/lib/hours.ts)
        │
        ▼
HoursVarianceResult | null
  { stdDev, label, isConsistent }
        │
        ▼
overview.tsx: derive color from stdDev tiers
        │
        ▼
<ChartSection
  title="Weekly Hours"
  subtitle={`Goal: ${weeklyLimit}h / week`}
  subtitleRight={hoursVariance?.label}
  subtitleRightColor={varianceColor}
/>
        │
        ▼
ChartSection renders subtitle + subtitleRight inline
```

### ChartSection Prop Extension

```typescript
interface ChartSectionProps {
  title: string;
  subtitle?: string;
  subtitleRight?: string;        // NEW — e.g. "Consistent" or "±1.4h/week"
  subtitleRightColor?: string;   // NEW — token from colors.ts
  // ... existing props unchanged
}
```

Render pattern:
```tsx
<View style={styles.subtitleRow}>
  {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  {subtitleRight && (
    <Text style={[styles.subtitle, { color: subtitleRightColor }]}>
      {' · '}{subtitleRight}
    </Text>
  )}
</View>
```

### Color Tier Derivation (in overview.tsx)

```typescript
const hoursVariance = computeHoursVariance(overviewData.hours);

const varianceColor = hoursVariance
  ? hoursVariance.isConsistent
    ? colors.success                       // stdDev ≤ 2
    : hoursVariance.stdDev <= 3
      ? colors.warning                     // 2 < stdDev ≤ 3
      : colors.textSecondary               // stdDev > 3
  : undefined;
```

### Edge Cases

| Case | Handling |
|------|---------|
| `hours` is empty array | `computeHoursVariance` returns `null`; no label rendered |
| All hours are zero | After filtering zeros and excluding last, 0 points → `null` |
| Single data point | 0 completed points after excluding last → `null` |
| Two data points | 1 completed point after excluding last → `null` |
| Exactly 3 data points | 2 completed points → `null` (need ≥ 3 completed) |
| Exactly 4 data points | 3 completed points → valid, compute stdDev |
| stdDev exactly 1.0 | `label = 'Consistent'` (boundary: ≤1 → Consistent) |
| stdDev exactly 2.0 | `isConsistent = true`, `label = '±2.0h/week'` |
| stdDev exactly 3.0 | `isConsistent = false`, `label = '±3.0h/week'`, `colors.warning` |
| `overviewData` not yet loaded | `hoursVariance` will be `null`; no crash |

### Constraints

- **No new API calls** — computed from existing `overviewData.hours` array.
- **Population stdDev** (divide by N, not N-1) — matches the formula in spec-research.md.
- **One decimal place** in the `±N.Nh/week` format via `.toFixed(1)`.
- **`subtitleRight` separator**: `' · '` (space-dot-space) for visual separation.
- Test file goes in `src/lib/__tests__/` to match existing test conventions.
