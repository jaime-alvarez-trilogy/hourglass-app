# Spec Research: 02-glass-card

## Problem

`IosGlassCard` currently uses:
- Fill: `#1C1E26CC` (80% opacity) — too dark/opaque; the card barely reads as a distinct surface against `#0B0D13`
- Border: `#FFFFFF1A` (10% white) — too subtle; no visible specular highlight at the edge
- Accepts a `borderColor` prop that lets callers override the border — inconsistent across the codebase (some callers pass `accent + '50'`, some use default)

The app's AI/BrainLift screen uses a consistent glass card with 75% opacity fill and a 15% white specular edge. The widget card should match this standard and remove the prop escape hatch.

## Current Implementation

**File:** `src/widgets/ios/HourglassWidget.tsx` lines 127–143

```tsx
function IosGlassCard({
  children,
  borderColor = COLORS.borderSubtle,
}: {
  children: React.ReactNode;
  borderColor?: string;
}) {
  return (
    <ZStack>
      <RoundedRectangle fill={COLORS.surface} cornerRadius={16} />
      <RoundedRectangle
        cornerRadius={16}
        stroke={borderColor}
        strokeWidth={0.5}
      />
      <VStack padding={14} alignment="leading" spacing={4}>
        {children}
      </VStack>
    </ZStack>
  );
}
```

**Color constants (lines 62–63):**
```
COLORS.surface = '#1C1E26CC'   // 80% opacity
COLORS.borderSubtle = '#FFFFFF1A'  // 10% white
```

**Callers of IosGlassCard:**

| Location | borderColor passed |
|----------|--------------------|
| LargeWidget P3 hours card | `accent + '50'` |
| LargeWidget P3 earned card | `COLORS.gold + '50'` |
| LargeWidget P2 MetricView cards | (various) |
| MediumWidget | `accent + '50'` |

After refactor, all callers will get the same hardcoded specular edge — the `borderColor` prop is removed.

## Target Implementation

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

**Changes from current:**

| Property | Current | Target |
|----------|---------|--------|
| Fill | `COLORS.surface` = `#1C1E26CC` (80%) | `#1C1E26BF` (75%) |
| Stroke | `borderColor` prop (default `#FFFFFF1A`, 10%) | hardcoded `#FFFFFF26` (15%) |
| `borderColor` prop | present | removed |
| VStack spacing | 4 | removed (default) |
| Caller signature | `<IosGlassCard borderColor={...}>` | `<IosGlassCard>` |

Note: `COLORS.surface` in the COLORS constant is NOT updated (it's used elsewhere). The card uses a literal instead.

## Callers to Update

All call sites that currently pass `borderColor` must be updated to remove that prop:

1. LargeWidget P3 HStack: `<IosGlassCard borderColor={accent + '50'}>` → `<IosGlassCard>`
2. LargeWidget P3 earned card: `<IosGlassCard borderColor={COLORS.gold + '50'}>` → `<IosGlassCard>`
3. Any P2 MetricView wrappers using borderColor
4. MediumWidget: `<IosGlassCard borderColor={accent + '50'}>` → `<IosGlassCard>`

## Interface Contract

```typescript
// Before
function IosGlassCard({
  children,
  borderColor?: string,
}: {
  children: React.ReactNode;
  borderColor?: string;
}): JSX.Element

// After
function IosGlassCard({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element
```

**Breaking change:** `borderColor` prop removed. All callers must be updated in the same commit.

## Test Plan

### FR1: Fill opacity updated to 75%

**Contract:** IosGlassCard first RoundedRectangle fill is `#1C1E26BF`

- [ ] Tree contains `RoundedRectangle` with `fill="#1C1E26BF"`
- [ ] No RoundedRectangle with fill `#1C1E26CC` (old 80% value)

### FR2: Specular edge hardcoded to 15% white

**Contract:** IosGlassCard second RoundedRectangle stroke is `#FFFFFF26`

- [ ] Tree contains `RoundedRectangle` with `stroke="#FFFFFF26"`
- [ ] No RoundedRectangle with stroke `#FFFFFF1A` (old 10% value)

### FR3: borderColor prop removed

**Contract:** IosGlassCard accepts only `children`

- [ ] TypeScript compile succeeds with no callers passing `borderColor`
- [ ] Snapshot/tree does not vary by urgency for card border color

## Files to Reference

- `src/widgets/ios/HourglassWidget.tsx` — lines 127–143 (IosGlassCard), lines 330–370 (LargeWidget P3 callers), lines 270–310 (MediumWidget callers)
- `src/widgets/__tests__/widgetPolish.test.ts` — assertions on IosGlassCard fill/stroke
- `src/widgets/__tests__/widgetLayoutJs.test.ts` — may have color assertions covering card values
