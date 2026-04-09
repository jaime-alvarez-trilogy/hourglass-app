# 02-glass-card

**Status:** Draft
**Created:** 2026-04-02
**Last Updated:** 2026-04-02

---

## Overview

Refactor `IosGlassCard` in `src/widgets/ios/HourglassWidget.tsx` to match the app's premium dark-glass design system:

1. Update the fill from 80% opacity (`#1C1E26CC`) to 75% (`#1C1E26BF`) so the card reads as a distinct glass surface against the dark background without being overly opaque.
2. Harden the specular edge from 10% white (`#FFFFFF1A`) to 15% white (`#FFFFFF26`) so the card border is clearly visible.
3. Remove the `borderColor` prop entirely — it was an escape hatch that caused inconsistent borders across callers. All cards now use the same hardcoded specular edge.
4. Update all call sites to remove the now-deleted `borderColor` prop.

The `COLORS.surface` constant is not changed — it is used by other components. The card uses a literal color value instead.

---

## Out of Scope

1. **`COLORS.surface` constant update** — Descoped. The constant is shared by other components; only the card's literal value changes.
2. **Android widget card styling** — Descoped. Android widget uses a separate component system not covered by this spec.
3. **SmallWidget or MediumWidget layout changes** — Descoped. MediumWidget callers are updated only to remove the `borderColor` prop; no layout changes.
4. **Corner radius changes** — Deferred to `04-pill-chart`. Corner radius changes for other shapes are handled there.
5. **Blur or shadow effects on IosGlassCard** — Descoped. Not part of this feature's visual correction scope.

---

## Functional Requirements

### FR1: Fill opacity updated to 75%

**What:** The first `RoundedRectangle` in `IosGlassCard` must use fill `#1C1E26BF` (75% opacity).

**Why:** The current `#1C1E26CC` (80%) makes the card blend into the `#0B0D13` background. 75% provides the right visual separation.

**Success Criteria:**
- `IosGlassCard` renders a `RoundedRectangle` with `fill="#1C1E26BF"`
- No `RoundedRectangle` in `IosGlassCard` has `fill="#1C1E26CC"` (the old value)
- The fill is a literal string, not a reference to `COLORS.surface`

---

### FR2: Specular edge hardcoded to 15% white

**What:** The second `RoundedRectangle` in `IosGlassCard` must use `stroke="#FFFFFF26"` (15% white) at `strokeWidth={0.5}`.

**Why:** The old default `#FFFFFF1A` (10%) was too subtle. Callers patched this inconsistently via `borderColor` prop. A single hardcoded 15% value matches the app's AI/BrainLift screen standard.

**Success Criteria:**
- `IosGlassCard` renders a `RoundedRectangle` with `stroke="#FFFFFF26"` and `strokeWidth={0.5}`
- No `RoundedRectangle` in `IosGlassCard` has `stroke="#FFFFFF1A"` (the old default)
- The stroke is hardcoded — not derived from a prop or constant

---

### FR3: `borderColor` prop removed

**What:** `IosGlassCard` accepts only `{ children: React.ReactNode }`. The `borderColor` prop is deleted.

**Why:** The prop was an inconsistency escape hatch. Removing it enforces a single visual language across all widget cards.

**Success Criteria:**
- `IosGlassCard` type signature has no `borderColor` parameter
- TypeScript compilation succeeds with zero errors
- All call sites that previously passed `borderColor` have been updated to omit it:
  - LargeWidget P3 hours card: `borderColor={accent + '50'}` removed
  - LargeWidget P3 earned card: `borderColor={COLORS.gold + '50'}` removed
  - Any P2 MetricView wrappers using `borderColor` removed
  - MediumWidget: `borderColor={accent + '50'}` removed
- The `VStack spacing={4}` in the old implementation is removed (uses default spacing)

---

## Technical Design

### Files to Modify

| File | Change |
|------|--------|
| `src/widgets/ios/HourglassWidget.tsx` | Update `IosGlassCard` component + remove `borderColor` from all callers |
| `src/widgets/__tests__/widgetPolish.test.ts` | Update assertions to expect new fill/stroke values |
| `src/widgets/__tests__/widgetLayoutJs.test.ts` | Update any color assertions covering card fill/stroke |

### Files to Reference

- `src/widgets/ios/HourglassWidget.tsx` lines 127–143: `IosGlassCard` component
- `src/widgets/ios/HourglassWidget.tsx` lines 330–370: LargeWidget P3 callers
- `src/widgets/ios/HourglassWidget.tsx` lines 270–310: MediumWidget callers
- `src/widgets/__tests__/widgetPolish.test.ts`: existing fill/stroke assertions

### Target Component Implementation

```tsx
function IosGlassCard({ children }: { children: React.ReactNode }) {
  return (
    <ZStack>
      <RoundedRectangle fill="#1C1E26BF" cornerRadius={16} />
      <RoundedRectangle cornerRadius={16} stroke="#FFFFFF26" strokeWidth={0.5} />
      <VStack padding={14} alignment="leading">
        {children}
      </VStack>
    </ZStack>
  );
}
```

### Caller Updates

All callers that previously passed `borderColor` must be updated:

```tsx
// Before
<IosGlassCard borderColor={accent + '50'}>...</IosGlassCard>

// After
<IosGlassCard>...</IosGlassCard>
```

### Data Flow

No data flow changes. `IosGlassCard` is a pure presentational component. The only change is:
1. Fixed fill value (literal string, no prop)
2. Fixed stroke value (literal string, no prop)
3. Removed `spacing={4}` from VStack (uses default)

### Edge Cases

1. **TypeScript strictness:** Removing `borderColor` is a breaking change. The TypeScript compiler will flag all callers that still pass the prop. Use this as a checklist: fix all compiler errors before committing.
2. **No runtime branching:** The card has no conditional rendering logic, so there are no edge cases in rendering paths.
3. **COLORS.surface unchanged:** Other components that reference `COLORS.surface` continue to use `#1C1E26CC` unaffected.

### Test Strategy

Tests assert on the rendered widget tree (JSX structure returned by the widget function). Approach:

1. **Fill assertion:** Render a widget that contains `IosGlassCard`; find `RoundedRectangle` elements and assert one has `fill="#1C1E26BF"`.
2. **Stroke assertion:** Find `RoundedRectangle` elements and assert one has `stroke="#FFFFFF26"`.
3. **No old values:** Assert that `#1C1E26CC` (old fill) and `#FFFFFF1A` (old stroke default) do not appear in `IosGlassCard` output.
4. **Prop removed:** TypeScript type test — verifying `<IosGlassCard borderColor="red">` causes a compile error (ts-expect-error pattern).
