# 02-android-widget-redesign

**Status:** Draft
**Created:** 2026-04-02
**Last Updated:** 2026-04-02
**Owner:** @trilogy

---

## Overview

This spec aligns the Android Hourglass widget's visual language with the iOS widget and the brand design guidelines. The Android widget (`src/widgets/android/HourglassWidget.tsx`) currently uses incorrect urgency accent colors, GlassPanel border colors that don't match the brand glass spec, PaceBadge colors that diverge from semantic brand colors, and a root background that differs from the iOS baseline.

### What Is Being Built

Four targeted visual corrections to `HourglassWidget.tsx`:

1. **URGENCY_ACCENT color fixes** — `high` updated from `#FF6B00` to `#F59E0B` (brand warning), `critical` updated from `#FF2D55` to `#F43F5E` (brand critical). The `none` and `low` values are unchanged as they are test-locked or already correct.

2. **GlassPanel redesign** — Outer panel: `backgroundColor '#1C1E26'`, `borderRadius 16`, `padding 1`. Inner panel: `backgroundColor '#16151F'`, `borderRadius 15`, `padding 12`. This creates a 1px etched-border effect that visually matches the iOS `IosGlassCard` depth.

3. **Background base color** — Root `SmallWidget`/`MediumWidget` background changes from `#0D0C14` to `#0B0D13`, matching the iOS `WidgetBackground` base.

4. **PaceBadge color update** — `badgeColor()` updated to semantic brand colors: `crushed_it → #F5C842`, `on_track → #10B981`, `behind → #F59E0B`, `critical → #F43F5E`. Android FlexWidget doesn't support rgba, so the solid-fill approach is retained; all four brand colors are light enough for dark text `#0D0C14`.

### How It Works

All changes are confined to constants and two components (`GlassPanel`, `PaceBadge`) in the Android widget file. No structural changes are required. Existing tests that assert old color values are updated to reflect the corrected brand palette. Tests that do not touch these four areas (mesh SVG structure, badge labels, delta colors, BrainLift bar, manager urgency mode) are not modified.

---

## Out of Scope

1. **Large Android widget** — Adding a Large widget size for Android is a separate feature with its own layout requirements. **Descoped:** Not part of this feature.

2. **WidgetBackground Circle glow analog for Android** — The iOS `WidgetBackground` uses SwiftUI `Circle` blurs for atmospheric glow. Android uses `buildMeshSvg` with a linear gradient that already provides equivalent atmospheric feel. No structural change to `buildMeshSvg` is needed. **Descoped:** Android SVG approach is sufficient; structural equivalence is not required.

3. **barAreaHeight reduction for Android** — The `barAreaHeight` is already at 28px on Android, which is visually appropriate for widget density. The iOS `MAX_BAR_HEIGHT` reduction (100→60) is an iOS-specific change in pt units. **Descoped:** No change needed; Android value is already correct for its unit space.

4. **WidgetData interface or bridge.ts changes** — This spec is purely a visual layer change. Data contracts are out of scope. **Descoped:** Not part of this feature.

5. **Animation or real-time updating** — Out of scope for both platform specs. **Descoped:** Not part of this feature.

6. **rgba/semi-transparent PaceBadge** — Android FlexWidget does not support rgba colors. The solid-fill approach is retained. A fully transparent pill approach matching iOS StatusPill is not achievable. **Descoped:** Platform limitation; would require native Android custom view.

---

## Functional Requirements

### FR1: Update URGENCY_ACCENT Colors

Update the `URGENCY_ACCENT` constant so urgency levels use brand semantic colors.

**Before:**
```ts
const URGENCY_ACCENT = {
  none:     '#00FF88',
  low:      '#F5C842',
  high:     '#FF6B00',  // wrong
  critical: '#FF2D55',  // wrong
  expired:  '#6B6B6B',
};
```

**After:**
```ts
const URGENCY_ACCENT = {
  none:     '#00FF88',  // test-locked — do not change
  low:      '#F5C842',  // already correct
  high:     '#F59E0B',  // brand warning
  critical: '#F43F5E',  // brand critical
  expired:  '#6B6B6B',  // unchanged
};
```

**Success Criteria:**
- [ ] `URGENCY_ACCENT.high === '#F59E0B'`
- [ ] `URGENCY_ACCENT.critical === '#F43F5E'`
- [ ] `URGENCY_ACCENT.none === '#00FF88'` (unchanged)
- [ ] `URGENCY_ACCENT.low === '#F5C842'` (unchanged)
- [ ] `URGENCY_ACCENT.expired === '#6B6B6B'` (unchanged)
- [ ] Bar chart rendered for `urgency=critical` contains `#F43F5E` (FR3.4 test passes)

---

### FR2: Update PaceBadge Colors (`badgeColor()`)

Update `badgeColor()` to return brand semantic colors instead of legacy colors.

**Before:**
- `crushed_it` → `#CEA435`
- `on_track` → `#4ADE80`
- `behind` → `#FCD34D`
- `critical` → `#F87171`

**After:**
- `crushed_it` → `#F5C842` (brand gold/low)
- `on_track` → `#10B981` (brand success)
- `behind` → `#F59E0B` (brand warning)
- `critical` → `#F43F5E` (brand critical)

**PaceBadge text color remains `#0D0C14`** for all badge states (all four brand colors are light enough for legible dark text; no per-badge branching needed).

**Success Criteria:**
- [ ] `badgeColor('crushed_it') === '#F5C842'`
- [ ] `badgeColor('on_track') === '#10B981'`
- [ ] `badgeColor('behind') === '#F59E0B'`
- [ ] `badgeColor('critical') === '#F43F5E'`
- [ ] `badgeColor('')` or unknown value returns `''` (default case unchanged)
- [ ] PaceBadge text color is `#0D0C14` (no change needed — already dark text)
- [ ] FR1.12–FR1.26 badge label tests still pass (unaffected)

---

### FR3: Redesign GlassPanel

Update `GlassPanel` to match iOS glass card depth and color.

**Before:**
```tsx
function GlassPanel({ flex, children }) {
  return (
    <FlexWidget style={{ backgroundColor: '#2F2E41', borderRadius: 13, padding: 1 }}>
      <FlexWidget style={{ backgroundColor: '#1F1E2C', borderRadius: 12, padding: 12 }}>
        {children}
      </FlexWidget>
    </FlexWidget>
  );
}
```

**After:**
```tsx
function GlassPanel({ flex, children }) {
  return (
    <FlexWidget style={{ backgroundColor: '#1C1E26', borderRadius: 16, padding: 1 }}>
      <FlexWidget style={{ backgroundColor: '#16151F', borderRadius: 15, padding: 12 }}>
        {children}
      </FlexWidget>
    </FlexWidget>
  );
}
```

**Success Criteria:**
- [ ] Outer FlexWidget `backgroundColor === '#1C1E26'`
- [ ] Outer FlexWidget `borderRadius === 16`
- [ ] Outer FlexWidget `padding === 1`
- [ ] Inner FlexWidget `backgroundColor === '#16151F'`
- [ ] Inner FlexWidget `borderRadius === 15`
- [ ] Inner FlexWidget `padding === 12`
- [ ] FR3.3 test (outer borderRadius ≥ 10) still passes with value 16

---

### FR4: Update Root Background Color

Update `SmallWidget` and `MediumWidget` root background color to match iOS baseline.

**Before:** `backgroundColor: '#0D0C14'`
**After:** `backgroundColor: '#0B0D13'`

**Success Criteria:**
- [ ] `SmallWidget` root `FlexWidget` has `backgroundColor === '#0B0D13'`
- [ ] `MediumWidget` root `FlexWidget` has `backgroundColor === '#0B0D13'`
- [ ] FR2.5 test passes with new value `#0B0D13`
- [ ] All other FR2 tests unaffected (background layer present, fallback widget, SvgWidget present)

---

### FR5: Update Tests to Reflect New Values

Update the existing test file to assert the corrected values from FR1–FR4. Tests that are unaffected must not be modified.

**Tests to update:**
| Test ID | File | Old assertion | New assertion |
|---------|------|---------------|---------------|
| FR1.8 | HourglassWidget.test.tsx | `badgeColor('crushed_it') = '#CEA435'` | `'#F5C842'` |
| FR1.9 | HourglassWidget.test.tsx | `badgeColor('on_track') = '#4ADE80'` | `'#10B981'` |
| FR1.10 | HourglassWidget.test.tsx | `badgeColor('behind') = '#FCD34D'` | `'#F59E0B'` |
| FR1.11 | HourglassWidget.test.tsx | `badgeColor('critical') = '#F87171'` | `'#F43F5E'` |
| FR2.5 | HourglassWidget.test.tsx | root bg `#0D0C14` | `'#0B0D13'` |
| FR3.1 | HourglassWidget.test.tsx | outer `#2F2E41`, borderRadius 13 | `'#1C1E26'`, 16 |
| FR3.2 | HourglassWidget.test.tsx | inner `#1F1E2C`, borderRadius 12 | `'#16151F'`, 15 |
| FR3.4 | HourglassWidget.test.tsx | critical bar `#FF2D55` | `'#F43F5E'` |

**Tests that must NOT be modified:**
- FR1 buildMeshSvg color tests
- FR1.12–FR1.26 badgeLabel string tests
- FR1.27–FR1.30 deltaColor and blProgressBar track/fill tests
- FR2 (all except FR2.5)
- FR3.3 (outer borderRadius ≥ 10 — will still pass with 16)
- FR3.5 (7 bars — unaffected)
- FR4 (PaceBadge text content — unaffected)
- FR5 (trend delta text)
- FR6 (BrainLift progress bar)
- FR7 (manager urgency mode)
- All widgetPolish SC3 tests

**Success Criteria:**
- [ ] All updated tests pass with new values
- [ ] All previously-passing tests continue to pass
- [ ] No test file changes outside the 8 identified assertions

---

## Technical Design

### Files to Modify

| File | Change |
|------|--------|
| `hourglassws/src/widgets/android/HourglassWidget.tsx` | Update `URGENCY_ACCENT.high/.critical`, `badgeColor()`, `GlassPanel` outer/inner colors and radii, root background color |
| `hourglassws/src/__tests__/widgets/android/HourglassWidget.test.tsx` | Update 8 assertions: FR1.8–FR1.11, FR2.5, FR3.1, FR3.2, FR3.4 |

### Files to Reference

| File | Purpose |
|------|---------|
| `hourglassws/src/widgets/ios/HourglassWidget.tsx` | iOS visual reference — `IosGlassCard` colors, `WidgetBackground` base color |
| `hourglassws/BRAND_GUIDELINES.md` | Brand semantic color definitions |

### Data Flow

No data flow changes. All changes are in the render/style layer:

```
URGENCY_ACCENT constant
  └─ used in: bar chart fill color (MediumWidget barChart rendering)
  └─ used in: MediumWidget P2 Deficit accent color

badgeColor() function
  └─ used in: PaceBadge component (background color prop)

GlassPanel component
  └─ used in: SmallWidget, MediumWidget

Root FlexWidget backgroundColor
  └─ used in: SmallWidget root, MediumWidget root
```

### Change Locations in Implementation File

Based on spec-research.md exploration findings:

| Change | Approx. Lines | Description |
|--------|---------------|-------------|
| `URGENCY_ACCENT` constant | 138–144 | Update `high` and `critical` values |
| `badgeColor()` function | ~207+ | Update 4 return values |
| `GlassPanel` component | 178–199 | Update outer/inner bg colors and radii |
| Root background | line ~265 | Update `#0D0C14` → `#0B0D13` in SmallWidget and MediumWidget |

### Edge Cases

1. **`badgeColor` default case** — The function must return `''` for unknown badge values. This default is unchanged and must be preserved.

2. **`URGENCY_ACCENT.none` test lock** — The `none: '#00FF88'` value is referenced in bar chart tests and must NOT be changed. Only `high` and `critical` are updated.

3. **Root background appears in both SmallWidget and MediumWidget** — Both must be updated. If the color is defined as a shared constant rather than inline, the constant update covers both. If inline, both locations must be updated.

4. **PaceBadge text color** — The text color `#0D0C14` is already dark and appropriate for all four new brand badge background colors (all are light enough). No branching logic is needed and the text color prop is unchanged.

5. **GlassPanel borderRadius FR3.3 test** — The existing test asserts `borderRadius >= 10`. The new value 16 satisfies this constraint. No test logic change needed for FR3.3.

### Implementation Order

All four FRs (plus FR5 test updates) are independent of each other and can be implemented simultaneously. Suggested order for minimal cognitive overhead:

1. Update `URGENCY_ACCENT` constant (FR1) — one block
2. Update `badgeColor()` return values (FR2) — one function
3. Update `GlassPanel` colors/radii (FR3) — one component
4. Update root background color (FR4) — one or two lines
5. Update test assertions (FR5) — 8 assertions in test file

Total implementation estimated at ~20–30 lines changed across 2 files.
