# Spec Research: 02-android-widget-redesign

## Problem Context

The Android widget (`src/widgets/android/HourglassWidget.tsx`) has several visual divergences from the iOS widget and from the brand guidelines: wrong URGENCY_ACCENT colors (same `#FF6B00`/`#FF2D55` that iOS had before today's fix), GlassPanel colors that differ from the brand glass spec, and a filled PaceBadge design that doesn't match iOS's semi-transparent pill approach. This spec aligns the Android widget's visual language with iOS and the brand.

## Exploration Findings

### Current Android GlassPanel (lines 178–199)
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

### Current Android PaceBadge (lines 207–228)
```tsx
function PaceBadge({ paceBadge }) {
  const bg = badgeColor(paceBadge);  // '#CEA435', '#4ADE80', '#FCD34D', '#F87171'
  // Filled solid background, dark text '#0D0C14'
}
```

### Current Android URGENCY_ACCENT (lines 138–144)
```ts
const URGENCY_ACCENT = {
  none:     '#00FF88',  // test-locked (bar chart)
  low:      '#F5C842',
  high:     '#FF6B00',  // wrong — should be '#F59E0B' (brand warning)
  critical: '#FF2D55',  // wrong — should be '#F43F5E' (brand critical)
  expired:  '#6B6B6B',
};
```

### Current Android background (line 265)
```tsx
<FlexWidget style={{ backgroundColor: '#0D0C14', ... }}>
```

### Tests that will break and must be updated

| Test | File | Current assertion | New assertion |
|------|------|-------------------|---------------|
| FR2.5 | android/HourglassWidget.test.tsx | root backgroundColor `#0D0C14` | `#0B0D13` |
| FR3.1 | android/HourglassWidget.test.tsx | outer GlassPanel `#2F2E41`, borderRadius 13 | `#1C1E26`, borderRadius 16 |
| FR3.2 | android/HourglassWidget.test.tsx | inner GlassPanel `#1F1E2C`, borderRadius 12 | `#16151F`, borderRadius 15 |
| FR3.4 | android/HourglassWidget.test.tsx | bar chart for `urgency=critical` contains `#FF2D55` | `#F43F5E` |
| FR1.8 | android/HourglassWidget.test.tsx | `badgeColor('crushed_it')` = `#CEA435` | `#F5C842` (brand gold, semi-transparent approach) |
| FR1.9 | android/HourglassWidget.test.tsx | `badgeColor('on_track')` = `#4ADE80` | `#10B981` (brand success) |
| FR1.10 | android/HourglassWidget.test.tsx | `badgeColor('behind')` = `#FCD34D` | `#F59E0B` (brand warning) |
| FR1.11 | android/HourglassWidget.test.tsx | `badgeColor('critical')` = `#F87171` | `#F43F5E` (brand critical) |

### Tests that must NOT break

- FR1 (buildMeshSvg colors: `#F43F5E`, `#F59E0B`, `#10B981`, `#FFDF89`, `#A78BFA`) — not affected by URGENCY_ACCENT or GlassPanel
- FR1.12–FR1.26 (badgeLabel returns correct strings) — unaffected
- FR1.27–FR1.30 (deltaColor, blProgressBar track/fill colors) — unaffected (track `#2F2E41`, fill `#A78BFA`)
- FR2 (SvgWidget present, background layer, fallback widget) except FR2.5 — mostly unaffected
- FR3.3 (outer GlassPanel has borderRadius ≥ 10) — will still pass with new value 16
- FR3.5 (bar chart has 7 bars) — unaffected
- FR4 (PaceBadge renders, text matches label) — unaffected by color change (tests check text not color)
- FR5 (trend delta text) — unaffected
- FR6 (BrainLift progress bar renders) — unaffected
- FR7 (manager urgency mode) — unaffected
- All widgetPolish SC3 tests (buildMeshSvg structure: linearGradient, state colors, dimensions) — unaffected

## Key Decisions

1. **URGENCY_ACCENT**: Update `high: '#FF6B00'` → `'#F59E0B'` and `critical: '#FF2D55'` → `'#F43F5E'`, matching iOS. `none: '#00FF88'` stays (bar chart tests pass `#00FF88` directly).

2. **GlassPanel redesign**: Update to match iOS glass surface:
   - Outer: `#1C1E26`, borderRadius 16, padding 1 (creates 1px etched border)
   - Inner: `#16151F` (94% opacity equivalent of iOS `#16151FCC`), borderRadius 15, padding 12
   - This makes Android glass cards visually match iOS GlassCard fill depth

3. **Background base color**: `#0D0C14` → `#0B0D13` (matching iOS WidgetBackground base)

4. **PaceBadge colors** (`badgeColor()`): Update to brand semantic colors:
   - `crushed_it`: `#F5C842` (brand low/gold)
   - `on_track`: `#10B981` (brand success)
   - `behind`: `#F59E0B` (brand warning)
   - `critical`: `#F43F5E` (brand critical)
   - Android PaceBadge keeps the solid-fill approach (Android FlexWidget doesn't easily support rgba).
   - **PaceBadge text color: `#0D0C14` for all badges.** All four brand colors are sufficiently light that dark text is legible. No per-badge branching needed.

5. **Bar chart `barAreaHeight`**: Keep at 28px for Android (already visually appropriate for widget density; iOS 60pt is different unit space). No change needed.

6. **No WidgetBackground Circle analog**: Android uses SVG for background (buildMeshSvg). The SVG linear gradient is already the Android-equivalent of the iOS Circle glow — same atmospheric feel. No structural change needed to buildMeshSvg.

## Interface Contracts

### Updated: `URGENCY_ACCENT`
```typescript
// Source: updated constants in android/HourglassWidget.tsx
const URGENCY_ACCENT = {
  none:     '#00FF88',  // test-locked
  low:      '#F5C842',
  high:     '#F59E0B',  // was '#FF6B00'
  critical: '#F43F5E',  // was '#FF2D55'
  expired:  '#6B6B6B',
}
```

### Updated: `badgeColor()`
```typescript
// Source: updated function in android/HourglassWidget.tsx
export function badgeColor(paceBadge: string): string
// crushed_it → '#F5C842'  (was '#CEA435')
// on_track   → '#10B981'  (was '#4ADE80')
// behind     → '#F59E0B'  (was '#FCD34D')
// critical   → '#F43F5E'  (was '#F87171')
// default    → ''
```

### Updated: `GlassPanel`
```typescript
// Source: updated component in android/HourglassWidget.tsx
// Outer: backgroundColor '#1C1E26', borderRadius 16, padding 1
// Inner: backgroundColor '#16151F', borderRadius 15, padding 12
```

### Updated: SmallWidget/MediumWidget root background
```typescript
// '#0B0D13' (was '#0D0C14')
```

### Updated: `PaceBadge` text color
```typescript
// Source: updated PaceBadge component in android/HourglassWidget.tsx
// All badges use text color '#0D0C14' (dark text, legible on all four brand badge colors)
```

## Test Plan

### FR-Updated.1: URGENCY_ACCENT.high and .critical

**Contract update:**
- [ ] FR3.4: bar chart for `urgency=critical` contains `#F43F5E` (not `#FF2D55`)
- [ ] MediumWidget P2 Deficit layout shows `#F43F5E` accent (not `#FF2D55`)

### FR-Updated.2: badgeColor() brand colors

**Contract update:**
- [ ] FR1.8: `badgeColor('crushed_it')` = `#F5C842`
- [ ] FR1.9: `badgeColor('on_track')` = `#10B981`
- [ ] FR1.10: `badgeColor('behind')` = `#F59E0B`
- [ ] FR1.11: `badgeColor('critical')` = `#F43F5E`

### FR-Updated.3: GlassPanel colors

**Contract update:**
- [ ] FR3.1: outer `#1C1E26`, borderRadius 16
- [ ] FR3.2: inner `#16151F`, borderRadius 15

### FR-Updated.4: Background color

**Contract update:**
- [ ] FR2.5: root backgroundColor = `#0B0D13`

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/widgets/android/HourglassWidget.tsx` | Update URGENCY_ACCENT.high/.critical, badgeColor(), GlassPanel colors, root background |
| `src/__tests__/widgets/android/HourglassWidget.test.tsx` | Update FR1.8–FR1.11, FR2.5, FR3.1, FR3.2, FR3.4 |

## Files to Reference

- `src/widgets/android/HourglassWidget.tsx` — current implementation
- `src/__tests__/widgets/android/HourglassWidget.test.tsx` — tests to update
- `src/widgets/ios/HourglassWidget.tsx` — iOS visual reference for alignment
- `BRAND_GUIDELINES.md` — brand semantic color reference
