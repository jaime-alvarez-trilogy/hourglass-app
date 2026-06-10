# Spec Research: 01-skia-gradient-bars

## Problem Context

`HourlyPatternCard.tsx` renders hourly histogram bars as React Native `View` components with flat `backgroundColor` fills derived from `_barColor(aiRate)`. Every other bar chart in the app (`DayPatternChart`, `WeeklyBarChart`) uses Skia `Canvas` + `RoundedRect` + `LinearGradient` — neon color at top → `transparent` at base. BRAND_GUIDELINES.md §5.2 mandates this gradient pattern. The fix is a rendering-layer swap only; logic, colors, overlays, and tests remain.

## Reference Implementations

### DayPatternChart (`src/components/DayPatternChart.tsx`)
- Single `<Canvas style={{ width, height }}>` containing all bars
- Per-bar: `<RoundedRect x y width height r={BAR_RADIUS=4}><LinearGradient start={vec(0, col.barTop)} end={vec(0, height)} colors={[col.barColor, 'transparent']} /></RoundedRect>`
- No entry animation
- Imports: `Canvas, RoundedRect, LinearGradient, vec` from `@shopify/react-native-skia`

### WeeklyBarChart (`src/components/WeeklyBarChart.tsx`)
- `Animated.View` clip wrapper: `useSharedValue(0)` → `withTiming(1, timingChartFill)` on mount
- `clipStyle = useAnimatedStyle(() => p >= 0.99 ? { width } : { overflow: 'hidden', width: p * width })`
- Inner absolute `View` at full width holds `CartesianChart` + per-bar `RoundedRect` + `LinearGradient`
- Same gradient pattern: `start={vec(0, barTop)}`, `end={vec(0, barBottom)}`, `colors={[barColor, 'transparent']}`, `r={4}`
- Imports: `timingChartFill` from `@/src/lib/reanimated-presets`

### Existing HourlyPatternCard structure
```
<Card>
  <SectionLabel>HOURLY PATTERNS</SectionLabel>
  <View style={[styles.barArea, { height }]}>   ← keep as container
    {bars as View children}                       ← REPLACE with Canvas
    {focus overlay View}                          ← keep
    {ai overlay View}                             ← keep
  </View>
  {hour axis labels}
  {separator}
  {summary rows}
</Card>
```

## Exploration Findings

**BRAND_GUIDELINES.md §5.2:**
> Bar fill: Vertical LinearGradient — neon status-color at full opacity at peak → rgba(color, 0) transparent at base. Bars must glow from the top down.
> Rounded corners: topLeft: 4, topRight: 4.

**Test file analysis (`src/components/__tests__/HourlyPatternCard.test.tsx`):**
- `jest.mock('@shopify/react-native-skia')` already present — migration won't break the mock
- SC2.6 checks `_barColor(` and `backgroundColor` — after migration, `_barColor()` feeds `LinearGradient colors`, and `backgroundColor` still appears in overlay styles → test still passes
- No `testID="hourly-bar-{h}"` assertions — safe to remove testIDs from bars
- Source-level strategy tests (readFileSync) are the majority; no raw render assertions on bar elements
- Smoke tests all pass after migration since Skia is fully mocked

**Key decision (confirmed with user):** Include entry animation matching WeeklyBarChart.

## Architectural Design

Replace bar Views with a `Canvas` positioned absolute inside the existing `barArea` View. The Canvas has explicit `width` and `height` from props (required by Skia). The overlay Views remain as absolute-positioned siblings above the Canvas layer.

For entry animation: wrap `barArea` contents in `Animated.View` using the same clip pattern as `WeeklyBarChart`. The `barArea` outer View stays; the `Animated.View` is a new inner wrapper around just the Canvas (not the overlays — overlays should be visible immediately).

Actually, simpler: follow WeeklyBarChart's pattern exactly — the `Animated.View` contains a `position: absolute` full-width View with the Canvas, then overlay Views sit in the outer `barArea` View on top. Since overlays have `position: absolute`, they'll layer above naturally.

Revised structure:
```
<View style={[styles.barArea, { height }]}>
  {/* Animated clip reveal — Canvas only */}
  <Animated.View style={[{ height }, clipStyle]}>
    <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      {bars as RoundedRect + LinearGradient}
    </Canvas>
  </Animated.View>
  {/* Overlays always visible, layered above */}
  {focusOverlay && <View testID="focus-overlay" ... />}
  {aiOverlay && <View testID="ai-overlay" ... />}
</View>
```

## Interface Contracts

### Bar geometry (unchanged from existing)
```typescript
// per-bar derived values (same as today)
const barLeft = idx * colW + (colW - barW) / 2   // ← from layout math
const barTop  = height - (slots / peakSlots) * height  // ← normalized
const barH    = Math.max((slots / peakSlots) * height, MIN_BAR_H)
const topColor = _barColor(profile.avgAIRate[h])  // ← same function, now gradient top
```

### Skia RoundedRect + LinearGradient per bar
```typescript
<RoundedRect
  key={h}
  x={barLeft}
  y={barTop}
  width={barW}
  height={barH}
  r={4}  // was: borderRadius: 2
>
  <LinearGradient
    start={vec(0, barTop)}
    end={vec(0, barTop + barH)}   // or vec(0, height) — "full height" like DayPatternChart
    colors={[topColor, 'transparent']}
  />
</RoundedRect>
```

Note: `DayPatternChart` uses `vec(0, height)` (full canvas height) as gradient end. `WeeklyBarChart` uses `vec(0, barBottom)` (= barTop + barH, exact bar bottom). Both are correct — at the bar bottom, both reach `transparent`. Using `vec(0, barTop + barH)` concentrates the fade within the bar itself (tighter fade), matching WeeklyBarChart more closely. Use this variant.

### Entry animation
```typescript
// Same pattern as WeeklyBarChart
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { timingChartFill } from '@/src/lib/reanimated-presets';

const clipProgress = useSharedValue(0);
useEffect(() => { clipProgress.value = withTiming(1, timingChartFill); }, []);
const clipStyle = useAnimatedStyle(() => {
  const p = clipProgress.value;
  if (p >= 0.99) return { width };
  return { overflow: 'hidden' as const, width: p * width };
});
```

### Source fields and origins
| Field | Source |
|-------|--------|
| `barLeft`, `barW`, `colW` | computed from `width` prop + `BAR_W_RATIO` |
| `barTop`, `barH` | computed from `profile.avgSlots`, `peakSlots`, `height` prop |
| `topColor` | `_barColor(profile.avgAIRate[h])` — existing function, unchanged |
| `r={4}` | constant, matches DayPatternChart/WeeklyBarChart |
| `timingChartFill` | `@/src/lib/reanimated-presets` — already used by WeeklyBarChart |
| overlay geometries | unchanged from current implementation |

## Test Plan

### FR1: Canvas bar renderer

**Happy path:**
- [ ] Source imports `Canvas, RoundedRect, LinearGradient, vec` from `@shopify/react-native-skia`
- [ ] Source uses `RoundedRect` for bar rendering (not just View backgroundColor)
- [ ] Source uses `LinearGradient` within bars with `_barColor()` as first color stop
- [ ] `r={4}` (or equivalent) used for bar corners
- [ ] Smoke renders without crash (Skia mock)

**Updated assertions for SC2.6:**
- Replace "applies _barColor to bar backgroundColor" with "applies _barColor to LinearGradient colors"
- New assertion: `expect(source).toMatch(/LinearGradient/)` 
- Existing `expect(source).toMatch(/_barColor\s*\()` still valid

**Edge cases:**
- [ ] `NaN` aiRate → `_barColor(NaN)` = `colors.surface` → valid gradient top color, no crash
- [ ] All-zero slots → `barH = MIN_BAR_H` → still renders (no zero-height Canvas)
- [ ] Single-bar active window → 1 RoundedRect, renders fine

### FR2: Entry animation

**Happy path:**
- [ ] Source imports `Animated`, `useSharedValue`, `withTiming`, `useAnimatedStyle` from `react-native-reanimated`
- [ ] Source imports `timingChartFill` from `@/src/lib/reanimated-presets`
- [ ] Source uses `withTiming(1, timingChartFill)` in a `useEffect` (matches WeeklyBarChart pattern)
- [ ] Smoke renders without crash (Reanimated mock already in place)

### FR3: Existing test preservation

**Must still pass (no modifications needed):**
- [ ] All FR1 color interpolation tests (SC1.1–SC1.6e) — pure functions unchanged
- [ ] SC2.7, SC2.7b — width=0 guard unchanged
- [ ] FR3 overlay tests (SC3.1–SC3.5b) — overlays unchanged
- [ ] FR4 text summary tests (SC4.1–SC4.6b) — text unchanged
- [ ] All smoke tests — Skia mock already in place
- [ ] Integration text content tests

**Tests to update:**
- [ ] SC2.6 description + assertions: replace `backgroundColor` bar check with `LinearGradient`/`colors` check

**Mocks needed:**
- `@shopify/react-native-skia` — already mocked in test file
- `react-native-reanimated` — already mocked in test file
- No new mocks required

## Files to Reference

- `src/components/HourlyPatternCard.tsx` — file being modified
- `src/components/__tests__/HourlyPatternCard.test.tsx` — tests to update
- `src/components/WeeklyBarChart.tsx` — animation pattern reference
- `src/components/DayPatternChart.tsx` — canvas+gradient pattern reference
- `src/lib/reanimated-presets.ts` — `timingChartFill` definition
- `src/lib/colors.ts` — design tokens
- `BRAND_GUIDELINES.md` §5.2 — gradient mandate
