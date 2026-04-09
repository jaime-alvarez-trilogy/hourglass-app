# 01-atmospheric-background

**Status:** Draft
**Created:** 2026-04-02
**Last Updated:** 2026-04-02
**Owner:** @trilogy

---

## Overview

### What Is Being Built

The `WidgetBackground` component in `src/widgets/ios/HourglassWidget.tsx` is being simplified from a two-circle layout to a single top-center atmospheric glow.

Currently the component renders:
- A top-right accent circle (160×160pt, 0.15 opacity, 50pt blur) inside a nested `HStack` with a leading `Spacer`
- A bottom-left blue circle (`#3B82F6`, 100×100pt, 0.08 opacity, 40pt blur) inside nested `VStack`/`HStack` with a trailing `Spacer`

This creates a "weird circles" visual — two mismatched focal points that don't reflect the single dominant header glow used across the main app's Hours and AI tabs.

### Target State

Replace the two-circle layout with a single elliptical glow Circle:
- **Width:** 250pt, **Height:** 200pt (intentionally non-square — wider-than-tall creates a horizontal ellipse)
- **Opacity:** 0.15
- **Blur:** 60pt
- **Fill:** `accent` prop (passed by caller)
- **Position:** top-center — placed as the first child of a `VStack` with a trailing `Spacer`, no inner `HStack`

The base `Rectangle` fill changes from the indirect `COLORS.bgDark` reference to the direct literal `"#0B0D13"` for clarity.

### How It Works

The caller (SmallWidget, MediumWidget, LargeWidget, AccessoryWidget) passes an `accent` string derived from `URGENCY_ACCENT[props.urgency] ?? COLORS.accentGreen`. The `WidgetBackground` prop signature is unchanged: `{ accent: string }`.

The new layout produces a wide glow arc across the top of the widget that mirrors the header gradient seen in the main app screens, giving the widget a visually coherent premium dark-glass appearance.

---

## Out of Scope

1. **IosGlassCard fill/stroke changes** — **Deferred to 02-glass-card:** Opacity and specular edge adjustments for IosGlassCard are a separate spec unit with its own research.

2. **StatusPill Capsule shape change** — **Deferred to 04-pill-chart:** The StatusPill → Capsule refactor and IosBarChart cornerRadius change are a separate spec unit.

3. **LargeWidget P3 typography and layout changes** — **Deferred to 03-typography-layout:** Font weight standardization and remaining-text repositioning are a separate spec unit.

4. **bridge.ts "left left" bug fix** — **Deferred to 03-typography-layout:** The `hoursRemaining + ' left'` double-suffix bug is bundled with the typography spec.

5. **SmallWidget and MediumWidget structural changes** — **Descoped:** No layout changes to SmallWidget or MediumWidget in this spec. WidgetBackground is a shared component; its single-circle update applies everywhere, but no per-widget layout logic changes.

6. **Android widget visual changes** — **Descoped:** Android widget uses a separate rendering pipeline; iOS-specific SwiftUI component changes do not apply.

7. **Animation or blur rendering fidelity** — **Descoped:** The `blur` prop value is set as a layout constant; actual rendering fidelity is platform-dependent and outside the scope of this spec.

8. **Accent color derivation logic** — **Descoped:** The `URGENCY_ACCENT` map and caller-side accent computation are unchanged. This spec only changes how `WidgetBackground` consumes the `accent` prop.

---

## Functional Requirements

### FR1: Single Top-Center Glow Circle

**Description:** Replace the existing two-circle layout in `WidgetBackground` with a single elliptical glow Circle positioned at the top-center of the widget.

**Acceptance Criteria:**

1. `WidgetBackground` renders exactly **one** `Circle` element in its tree.
2. The `Circle` has:
   - `width={250}`
   - `height={200}`
   - `opacity={0.15}`
   - `blur={60}`
   - `fill` equal to the `accent` prop value passed in
3. The `Circle` is positioned top-center: it is the **first child** of a `VStack`, with a `Spacer` below it. There is **no** inner `HStack` wrapping the Circle.
4. The base background `Rectangle` fill is the literal `"#0B0D13"` (not an indirect `COLORS.bgDark` reference).
5. No `Circle` with fill `#3B82F6` (the old blue glow) exists anywhere in the `WidgetBackground` tree.
6. No second `Circle` element exists anywhere in the `WidgetBackground` tree.
7. The prop signature is unchanged: `function WidgetBackground({ accent }: { accent: string })`.
8. All existing widget rendering tests (SmallWidget, MediumWidget, LargeWidget, AccessoryWidget) continue to pass after this change.

---

## Technical Design

### Files to Reference

- `src/widgets/ios/HourglassWidget.tsx` lines 60–80 — `COLORS` constants including `COLORS.bgDark = '#0B0D13'`
- `src/widgets/ios/HourglassWidget.tsx` lines 102–124 — current `WidgetBackground` implementation
- `src/widgets/__tests__/widgetPolish.test.ts` — existing test assertions; test helpers `renderSmallWidget`, `renderLargeWidget`
- `__mocks__/@expo/ui/swift-ui` — `Circle` mock; confirm `blur` prop is accepted

### Files to Modify

| File | Change |
|------|--------|
| `src/widgets/ios/HourglassWidget.tsx` | Replace `WidgetBackground` body (lines 102–124) with single-circle layout |
| `src/widgets/__tests__/widgetPolish.test.ts` | Add new `WidgetBackground` describe block with FR1 assertions |

### No New Files

No new files are created. This is a targeted in-place replacement.

### Implementation — WidgetBackground Replacement

Replace the current body with:

```tsx
function WidgetBackground({ accent }: { accent: string }) {
  return (
    <ZStack>
      <Rectangle fill="#0B0D13" />
      {/* Top-center header glow — mirrors main app header gradient */}
      <VStack>
        <Circle fill={accent} width={250} height={200} opacity={0.15} blur={60} />
        <Spacer />
      </VStack>
    </ZStack>
  );
}
```

**Key changes:**
- Remove inner `HStack` + leading `Spacer` from accent circle (was top-right; now top-center)
- Remove bottom-left `VStack`/`HStack` blue `Circle` block entirely
- Change `COLORS.bgDark` → `"#0B0D13"` literal on Rectangle
- Resize: width 160→250, height 160→200 (now non-square ellipse), blur 50→60

### Implementation — Tests

Add a new describe block to `widgetPolish.test.ts`:

```typescript
describe('WidgetBackground', () => {
  it('renders exactly one Circle', () => {
    const tree = renderSmallWidget(mockData);
    const circles = findAll(tree, 'Circle');
    expect(circles).toHaveLength(1);
  });

  it('Circle has correct dimensions and style', () => {
    const tree = renderSmallWidget(mockData);
    const [circle] = findAll(tree, 'Circle');
    expect(circle.props.width).toBe(250);
    expect(circle.props.height).toBe(200);
    expect(circle.props.opacity).toBe(0.15);
    expect(circle.props.blur).toBe(60);
  });

  it('Circle fill matches the accent prop', () => {
    const accent = COLORS.accentGreen; // default urgency → accentGreen
    const tree = renderSmallWidget(mockData);
    const [circle] = findAll(tree, 'Circle');
    expect(circle.props.fill).toBe(accent);
  });

  it('does not render the old blue glow circle', () => {
    const tree = renderSmallWidget(mockData);
    const circles = findAll(tree, 'Circle');
    const blueCircle = circles.find((c: any) => c.props.fill === '#3B82F6');
    expect(blueCircle).toBeUndefined();
  });
});
```

_Note: `findAll` traversal helper usage mirrors existing test patterns in `widgetPolish.test.ts`. Adapt if the file uses a different traversal utility._

### Data Flow

```
Caller (SmallWidget / MediumWidget / LargeWidget / AccessoryWidget)
  │
  │  accent = URGENCY_ACCENT[props.urgency] ?? COLORS.accentGreen
  ▼
WidgetBackground({ accent })
  │
  ├─ Rectangle fill="#0B0D13"   ← static background
  └─ VStack
       ├─ Circle fill={accent} width=250 height=200 opacity=0.15 blur=60
       └─ Spacer
```

### Edge Cases

1. **`accent` is undefined or empty string:** Unchanged behavior — callers always provide a fallback via `?? COLORS.accentGreen`. `WidgetBackground` does not guard the prop.
2. **AccessoryWidget:** This widget variant also renders `WidgetBackground`. The single-circle layout applies uniformly; no special casing needed.
3. **`blur` prop on Circle mock:** The existing mock in `__mocks__/@expo/ui/swift-ui` may not declare `blur`. If the test runner throws on an unknown prop, add `blur?: number` to the mock's prop type. Do not modify the mock to silently swallow all props.
