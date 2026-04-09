# 04-pill-chart

**Status:** Draft
**Created:** 2026-04-02
**Last Updated:** 2026-04-02
**Owner:** @trilogy

---

## Overview

This spec refines two visual components in `src/widgets/ios/HourglassWidget.tsx`:

1. **StatusPill — shape primitive**: Replace `RoundedRectangle cornerRadius={10}` with `Capsule()`, the correct SwiftUI primitive for fully pill-shaped badges. Capsule auto-adapts its corner radius to 50% of its height regardless of content width. Fill opacity changes from `color+'15'` (8.2%) to `color+'1A'` (10%), stroke changes from `color+'80'` (50% opacity, 1pt) to `color` (100%, 0.5pt), and text font weight changes from `'semibold'` to `'bold'` with horizontal-only padding.

2. **IosBarChart — corner radius**: Change bar `RoundedRectangle cornerRadius` from 3 to 6. The design system uses 6pt bar corners throughout the app; 3pt is technically out-of-spec and visually too sharp.

Additionally, the `@expo/ui/swift-ui` mock in `widgetVisualIos.test.ts` must be updated to include `Capsule`, and the existing FR-New StatusPill tests that assert `RoundedRectangle` must be updated to assert `Capsule` instead.

---

## Out of Scope

1. **Android widget bar chart corner radius** — Descoped: Android widgets use a different rendering system (`react-native-android-widget`). Visual parity there is a separate concern.

2. **Other StatusPill prop changes (size, colors, paceBadge values)** — Descoped: Only the shape primitive and opacity/stroke/weight values change. The PACE_COLORS map and PACE_LABELS mapping are unchanged.

3. **SmallWidget and MediumWidget layout changes** — Descoped: StatusPill is used in SmallWidget; only its internal rendering changes, not its placement or the surrounding widget layout.

4. **Animation or blur rendering fidelity** — Descoped: Platform-dependent, not testable in Jest.

5. **LargeWidget typography or remaining-text layout** — Deferred to 03-typography-layout: Those changes belong to spec 03, which is independent and parallel.

---

## Functional Requirements

### FR1: StatusPill uses Capsule shape

Replace both `RoundedRectangle` elements in StatusPill with `Capsule` elements.

**Changes:**
- Fill layer: `<RoundedRectangle fill={color + '15'} cornerRadius={10} />` → `<Capsule fill={color + '1A'} height={22} />`
- Stroke layer: `<RoundedRectangle cornerRadius={10} stroke={color + '80'} strokeWidth={1} />` → `<Capsule stroke={color} strokeWidth={0.5} height={22} />`

**Success Criteria:**
- StatusPill renders exactly two `Capsule` nodes (no `RoundedRectangle` with `cornerRadius={10}`)
- First Capsule has fill ending in `'1A'` (e.g. `#10B9811A`) and height=22
- Second Capsule has stroke equal to the full color value (no suffix) and strokeWidth=0.5
- Second Capsule has height=22

### FR2: StatusPill text styling updated

**Changes:**
- Font weight: `'semibold'` → `'bold'`
- Padding: `6` (uniform) → `{ leading: 10, trailing: 10 }` (horizontal-only)

**Success Criteria:**
- StatusPill Text node has `font.weight === 'bold'`
- StatusPill Text node has `padding.leading === 10` and `padding.trailing === 10`

### FR3: IosBarChart bar corner radius is 6

Change `cornerRadius={3}` to `cornerRadius={6}` in the bar RoundedRectangle inside IosBarChart.

**Success Criteria:**
- All bar `RoundedRectangle` nodes rendered by IosBarChart have `cornerRadius === 6`
- No `RoundedRectangle` with `cornerRadius === 3` exists in the IosBarChart output
- Bar count, colors, and heights are unchanged

### FR4: Capsule added to widgetVisualIos mock

The `@expo/ui/swift-ui` mock in `widgetVisualIos.test.ts` must export `Capsule` so StatusPill tests do not throw.

**Changes:**
- Add `Capsule: makeComp('Capsule')` to the mock factory in `widgetVisualIos.test.ts`

**Success Criteria:**
- Tests referencing StatusPill do not throw "Element type is invalid" or "Capsule is not a function"
- Existing FR-New StatusPill tests updated to assert `Capsule` nodes instead of `RoundedRectangle`

---

## Technical Design

### Files to Modify

| File | Change |
|------|--------|
| `src/widgets/ios/HourglassWidget.tsx` | StatusPill: RoundedRectangle → Capsule; IosBarChart: cornerRadius 3 → 6 |
| `src/widgets/__tests__/widgetPolish.test.ts` | New StatusPill + IosBarChart tests |
| `src/__tests__/widgets/widgetVisualIos.test.ts` | Add Capsule to mock; update FR-New StatusPill assertions |

### Files to Reference

- `src/widgets/ios/HourglassWidget.tsx` lines 147–228: StatusPill and IosBarChart implementations
- `src/__tests__/widgets/widgetVisualIos.test.ts` lines 516–538: FR-New StatusPill tests (assert RoundedRectangle today — must update to Capsule)
- `src/widgets/__tests__/widgetLayoutJs.test.ts` lines 80–115: createSwiftUIStubs() already has Capsule — reference for test helper pattern

### Data Flow

StatusPill receives `paceBadge: string` → derives `color` from PACE_COLORS map → passes color to Capsule fill/stroke. No data flow change — only JSX primitives change.

IosBarChart receives `daily: WidgetDailyEntry[]` and `accent: string` → maps entries to bar columns. No data flow change — only `cornerRadius` prop value changes.

### Implementation Notes

**Capsule prop interface** (from spec-research.md):
```tsx
<Capsule fill={color + '1A'} height={22} />
<Capsule stroke={color} strokeWidth={0.5} height={22} />
```

`Capsule` is already exported by `@expo/ui/swift-ui` in production. The widgetLayoutJs test already stubs it. The widgetVisualIos test does not — this is the gap to fix.

**Existing FR-New tests that must be updated:**

In `widgetVisualIos.test.ts`:
- `StatusPill.1` — currently asserts `collectNodes(tree, 'RoundedRectangle')` + fill ending with `'15'`. Must change to `collectNodes(tree, 'Capsule')` + fill ending with `'1A'`.
- `StatusPill.2` — currently asserts stroke ending with `'80'`. Must change to assert Capsule stroke equal to full color (no suffix), strokeWidth=0.5.

**IosBarChart cornerRadius**: Single char change at line 219 of HourglassWidget.tsx: `cornerRadius={3}` → `cornerRadius={6}`.

### Edge Cases

- If `paceBadge` is unknown, `PACE_COLORS[paceBadge]` returns `undefined` and falls back to `PACE_COLORS.none` (`'#10B981'`). Capsule will still render with the fallback color — same as RoundedRectangle did.
- `maxHours === 0` in IosBarChart: handled by the existing `Math.max(...daily.map(d => d.hours), 0)` guard (barHeight = 0). Corner radius change does not affect this path.
