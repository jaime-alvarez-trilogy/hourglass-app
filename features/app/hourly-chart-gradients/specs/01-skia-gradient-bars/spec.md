# Spec: 01-skia-gradient-bars

## Goal

Replace flat `View backgroundColor` bar rendering in `HourlyPatternCard` with Skia `Canvas` + `RoundedRect` + `LinearGradient`, matching the visual language of `DayPatternChart` and `WeeklyBarChart` and satisfying BRAND_GUIDELINES.md §5.2. Add a left-to-right clip reveal entry animation matching `WeeklyBarChart`.

## Functional Requirements

### FR1 — Canvas bar renderer

Replace the per-bar `<View style={{ backgroundColor: fill }}>` elements with a single `<Canvas>` containing `<RoundedRect>` + `<LinearGradient>` per bar.

**Success Criteria:**

- SC1.1 — Source imports `Canvas`, `RoundedRect`, `LinearGradient`, `vec` from `@shopify/react-native-skia`
- SC1.2 — Source uses `RoundedRect` for bar rendering (no longer just View backgroundColor for bars)
- SC1.3 — Source uses `LinearGradient` within bars, with `_barColor(aiRate)` as the first color stop and `'transparent'` as the second
- SC1.4 — Bar corners use `r={4}` (was `borderRadius: 2`)
- SC1.5 — Smoke test: renders without crash with Skia mock

**Edge cases:**

- SC1.6 — `NaN` aiRate → `_barColor(NaN)` = `colors.surface` → valid gradient top color, no crash
- SC1.7 — All-zero avgSlots → `barH = MIN_BAR_H` → Canvas still renders (no zero-height content)
- SC1.8 — Single-bar active window → 1 RoundedRect, renders fine

### FR2 — Entry animation

Add the same clip-reveal animation as `WeeklyBarChart`: `clipProgress` shared value animates from 0→1 via `withTiming(1, timingChartFill)` on mount.

**Success Criteria:**

- SC2.1 — Source imports `Animated`, `useSharedValue`, `withTiming`, `useAnimatedStyle` from `react-native-reanimated`
- SC2.2 — Source imports `timingChartFill` from `@/src/lib/reanimated-presets`
- SC2.3 — Source uses `withTiming(1, timingChartFill)` in a `useEffect` with empty deps `[]`
- SC2.4 — Smoke test: renders without crash (Reanimated mock already in place)

### FR3 — Existing tests preserved

All 43 pre-existing `HourlyPatternCard` tests must continue to pass without modification.

**Impacted tests to update (not break):**

- SC3.1 — SC2.6 in the existing suite: update assertion from `backgroundColor` on bars to `LinearGradient`/`colors` check — `_barColor()` now feeds `LinearGradient colors[0]` instead of `backgroundColor`
- SC3.2 — All other SC1.x, SC2.x, SC3.x, SC4.x, smoke tests, and integration tests pass unchanged

## Interface Contracts

### Canvas structure (inside barArea)

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

### Per-bar geometry (unchanged)

```typescript
const barLeft = idx * colW + (colW - barW) / 2
const barTop  = height - barH
const barH    = Math.max((slots / peakSlots) * height, MIN_BAR_H)
const topColor = _barColor(profile.avgAIRate[h])
```

### Skia RoundedRect + LinearGradient per bar

```typescript
<RoundedRect x={barLeft} y={barTop} width={barW} height={barH} r={4}>
  <LinearGradient
    start={vec(0, barTop)}
    end={vec(0, barTop + barH)}
    colors={[topColor, 'transparent']}
  />
</RoundedRect>
```

### Entry animation (WeeklyBarChart pattern)

```typescript
const clipProgress = useSharedValue(0);
useEffect(() => { clipProgress.value = withTiming(1, timingChartFill); }, []);
const clipStyle = useAnimatedStyle(() => {
  const p = clipProgress.value;
  if (p >= 0.99) return { width };
  return { overflow: 'hidden' as const, width: p * width };
});
```

## Files

| File | Change |
|------|--------|
| `src/components/HourlyPatternCard.tsx` | Replace View bars with Canvas+RoundedRect+LinearGradient; add entry animation |
| `src/components/__tests__/HourlyPatternCard.test.tsx` | Update SC2.6 assertion only |
