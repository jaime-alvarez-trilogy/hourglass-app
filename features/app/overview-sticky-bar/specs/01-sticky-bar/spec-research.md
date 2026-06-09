# Spec Research: 01-sticky-bar

**Feature:** overview-sticky-bar
**Spec:** 01-sticky-bar
**Date:** 2026-06-08
**Status:** Complete

---

## Problem Statement

The scrub snapshot panel in `overview.tsx` is an inline `Animated.View` driven by
`panelStyle` (opacity + translateY + height + marginBottom). This 40-line block sits
inside a 570-line screen file, making the file harder to read and the panel impossible
to unit-test in isolation.

The goal is to extract the panel into `src/components/OverviewStickyBar.tsx` without
changing any user-visible behavior. The animation logic moves with it; `overview.tsx`
keeps the shared values and passes them as props.

---

## Current State (overview.tsx)

### Inline panel block (lines ~408-446)

```tsx
<Animated.View
  style={[panelStyle, {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  }]}
  pointerEvents={scrubWeekIndex !== null ? 'auto' : 'none'}
>
  <Text style={{ color: colors.textMuted ?? '#888', fontSize: 11, marginBottom: 6 }}>
    {snapLabel}
  </Text>
  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.gold, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {`$${Math.round(heroEarnings).toLocaleString()}`}
      </Text>
      <Text style={{ color: colors.textMuted ?? '#888', fontSize: 10, marginTop: 2 }}>Earnings</Text>
    </View>
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: computeSnapshotHoursColor(heroHours, weeklyLimit), fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {`${heroHours.toFixed(1)}h`}
      </Text>
      <Text style={{ color: colors.textMuted ?? '#888', fontSize: 10, marginTop: 2 }}>Hours</Text>
    </View>
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.cyan, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {`${Math.round(heroAiPct)}%`}
      </Text>
      <Text style={{ color: colors.textMuted ?? '#888', fontSize: 10, marginTop: 2 }}>AI%</Text>
    </View>
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.violet, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {`${heroBrainlift.toFixed(1)}h`}
      </Text>
      <Text style={{ color: colors.textMuted ?? '#888', fontSize: 10, marginTop: 2 }}>BrainLift</Text>
    </View>
  </View>
</Animated.View>
```

### Animation shared values (lines ~313-339)

```tsx
const SNAPSHOT_PANEL_HEIGHT = 64;
const panelOpacity    = useSharedValue(0);
const panelTranslateY = useSharedValue(8);
const panelHeight     = useSharedValue(0);
const panelMarginBottom = useSharedValue(0);

useEffect(() => {
  if (scrubWeekIndex !== null) {
    panelOpacity.value      = withSpring(1, springPremium);
    panelTranslateY.value   = withSpring(0, springPremium);
    panelHeight.value       = withSpring(SNAPSHOT_PANEL_HEIGHT, springBouncy);
    panelMarginBottom.value = withSpring(4, springBouncy);
  } else {
    panelOpacity.value      = withSpring(0, springPremium);
    panelTranslateY.value   = withSpring(8, springPremium);
    panelHeight.value       = withSpring(0, springSnappy);
    panelMarginBottom.value = withSpring(0, springSnappy);
  }
}, [scrubWeekIndex]);

const panelStyle = useAnimatedStyle(() => ({
  opacity:        panelOpacity.value,
  transform:      [{ translateY: panelTranslateY.value }],
  height:         panelHeight.value,
  marginBottom:   panelMarginBottom.value,
  overflow:       'hidden',
}));
```

### Hero snapshot data (lines ~342-363)

```tsx
const lastIdx = overviewData.earnings.length - 1;

const heroEarnings  = scrubWeekIndex !== null ? overviewData.earnings[scrubWeekIndex] ?? 0 : overviewData.earnings[lastIdx] ?? 0;
const heroHours     = scrubWeekIndex !== null ? overviewData.hours[scrubWeekIndex] ?? 0    : overviewData.hours[lastIdx] ?? 0;
const heroAiPct     = scrubWeekIndex !== null ? overviewData.aiPct[scrubWeekIndex] ?? 0    : overviewData.aiPct[lastIdx] ?? 0;
const heroBrainlift = scrubWeekIndex !== null ? overviewData.brainliftHours[scrubWeekIndex] ?? 0 : overviewData.brainliftHours[lastIdx] ?? 0;

const snapLabel = scrubWeekIndex !== null
  ? `Week of ${overviewData.weekLabels[scrubWeekIndex] ?? ''}`
  : '';
```

---

## Proposed Interface

### OverviewStickyBar props

```tsx
interface OverviewStickyBarProps {
  /** Animated style from panelStyle (opacity/translateY/height/marginBottom) */
  animatedStyle: StyleProp<ViewStyle>;
  /** Whether the panel is active — controls pointerEvents */
  isActive: boolean;
  /** Label e.g. "Week of Jan 6" */
  snapLabel: string;
  /** Four metric values */
  heroEarnings:  number;
  heroHours:     number;
  heroAiPct:     number;
  heroBrainlift: number;
  /** Hours target for color computation */
  weeklyLimit:   number;
}
```

### overview.tsx changes

Replace the 40-line Animated.View block with:

```tsx
<OverviewStickyBar
  animatedStyle={panelStyle}
  isActive={scrubWeekIndex !== null}
  snapLabel={snapLabel}
  heroEarnings={heroEarnings}
  heroHours={heroHours}
  heroAiPct={heroAiPct}
  heroBrainlift={heroBrainlift}
  weeklyLimit={weeklyLimit}
/>
```

The animation shared values and `panelStyle` stay in overview.tsx (they drive the
`animatedStyle` prop). Only the rendering is moved.

---

## Existing Test Constraints

### useStaggeredEntry.test.ts (must still pass)

Line ~432-435:
```ts
it('scrub snapshot panel Animated.View does NOT use getEntryStyle', () => {
  const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
  // The snapshot panel is always rendered with its own panelStyle animation
  // It must still use panelStyle (not replaced by getEntryStyle)
  expect(source).toMatch(/panelStyle/);
});
```

**Constraint:** `overview.tsx` must still contain the string `panelStyle` after
refactoring. This is satisfied because `panelStyle` remains as the shared value
definition (`const panelStyle = useAnimatedStyle(...)`) — only the JSX block moves
to OverviewStickyBar. The string `panelStyle` still appears in overview.tsx.

---

## New Test File

`src/components/__tests__/OverviewStickyBar.test.tsx`

Test strategy: static analysis (consistent with InsightChip.test.tsx,
ApprovalUrgencyCard.test.tsx pattern in this codebase).

### Test plan

**FR1 — Component file exists and exports**
- SC1.1: File exists at `src/components/OverviewStickyBar.tsx`
- SC1.2: Exports `OverviewStickyBar` (named export)
- SC1.3: Accepts `animatedStyle`, `isActive`, `snapLabel`, `heroEarnings`, `heroHours`, `heroAiPct`, `heroBrainlift`, `weeklyLimit` props

**FR2 — Static structure**
- SC2.1: Uses `Animated.View` as root (for animatedStyle)
- SC2.2: Renders `snapLabel` text
- SC2.3: Renders four metric columns: Earnings, Hours, AI%, BrainLift
- SC2.4: Uses `colors.gold` for earnings value
- SC2.5: Uses `colors.cyan` for AI% value
- SC2.6: Uses `colors.violet` for BrainLift value
- SC2.7: Calls `computeSnapshotHoursColor` for hours value color (import from overview.tsx or inline)
- SC2.8: Uses `colors.surfaceElevated` background

**FR3 — Pointer events**
- SC3.1: `pointerEvents` is `'auto'` when `isActive` is true, `'none'` when false (source static check)

**FR4 — Format helpers**
- SC4.1: Formats earnings as `$N,NNN` (Math.round + toLocaleString)
- SC4.2: Formats hours as `N.Nh` (toFixed(1))
- SC4.3: Formats AI% as `N%` (Math.round)
- SC4.4: Formats BrainLift as `N.Nh` (toFixed(1))

**FR5 — overview.tsx integration**
- SC5.1: overview.tsx imports `OverviewStickyBar` from `@/src/components/OverviewStickyBar`
- SC5.2: overview.tsx uses `<OverviewStickyBar` instead of the inline Animated.View block
- SC5.3: overview.tsx still contains `panelStyle` (useAnimatedStyle definition stays)
- SC5.4: overview.tsx still contains the 4 shared values: `panelOpacity`, `panelTranslateY`, `panelHeight`, `panelMarginBottom`
- SC5.5: The useStaggeredEntry.test.ts existing assertion at line ~432 still passes

---

## Files to Create

- `src/components/OverviewStickyBar.tsx` (new component)
- `src/components/__tests__/OverviewStickyBar.test.tsx` (new test file)

## Files to Modify

- `app/(tabs)/overview.tsx` (replace inline panel block, add import)

## Files NOT to touch

- `src/hooks/__tests__/useStaggeredEntry.test.ts` (existing test must stay green)
- `src/hooks/useStaggeredEntry.ts`

---

## computeSnapshotHoursColor

Currently exported from `overview.tsx` (line ~71):

```ts
export function computeSnapshotHoursColor(hours: number, weeklyLimit: number): string {
  if (weeklyLimit === 0) return colors.success;
  const ratio = hours / weeklyLimit;
  if (ratio >= 0.85) return colors.success;
  if (ratio >= 0.60) return colors.warning;
  return colors.critical;
}
```

OverviewStickyBar.tsx will import this from `@/app/(tabs)/overview` (cross-layer
import is acceptable here because overview.tsx exports the function). Alternatively
the function can be duplicated inline. Either approach is acceptable.

**Decision:** Import from overview.tsx to avoid duplication — the function is already
exported from there and tested via useStaggeredEntry.test.ts.

---

## Dependency Graph

| FR | Description | Depends On | Wave |
|----|-------------|------------|------|
| FR1 | OverviewStickyBar component (file + props shape) | - | 1 |
| FR2 | Static structure (4 metric columns, colors) | FR1 | 2 |
| FR3 | Pointer events (isActive → pointerEvents) | FR1 | 2 |
| FR4 | Format helpers (earnings/hours/ai/brainlift display) | FR1 | 2 |
| FR5 | overview.tsx integration (replace inline block) | FR1-FR4 | 3 |

---

## Risk Assessment

**Low risk.** This is a pure extraction refactor:
- No behavior change (animation logic stays in overview.tsx)
- One existing test assertion updated (panelStyle → satisfied by keeping panelStyle in overview.tsx)
- The `panelStyle` string constraint is met automatically

**Main failure mode:** If `computeSnapshotHoursColor` import path breaks. Mitigation:
inline the function in OverviewStickyBar.tsx to avoid cross-layer dependency.
