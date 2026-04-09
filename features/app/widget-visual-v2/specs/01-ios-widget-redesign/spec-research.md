# Spec Research: 01-ios-widget-redesign

## Problem Context

The iOS widget uses a flat two-Rectangle gradient background and a GlassCard component with values slightly misaligned from the app's glass surface spec. Tests lock in `MAX_BAR_HEIGHT=100`, `weight: 'heavy'`, and background color `#0D0C14`. This spec replaces the background with an atmospheric Circle-glow system, upgrades the glass card, reduces bar chart height, and softens the hero font — then updates all tests to reflect the new design.

## Exploration Findings

### Current implementation (`src/widgets/ios/HourglassWidget.tsx`)

**Background pattern (lines ~210–215 in each widget size):**
```tsx
<Rectangle fill={COLORS.bgDark} />        // '#0D0C14' base layer
<Rectangle fill={tint} />                  // urgency tint overlay
```

**GlassCard:**
```tsx
<RoundedRectangle fill={COLORS.surface} cornerRadius={14} />   // '#16151FCC'
<RoundedRectangle stroke={borderColor} strokeWidth={1} />
<VStack padding={12} ...>
```

**Constants:**
```ts
const COLORS = { bgDark: '#0D0C14', surface: '#16151FCC', ... }
const MAX_BAR_HEIGHT = 100
```

### Current test mock (`src/__tests__/widgets/widgetVisualIos.test.ts` lines 21-29)
```ts
// Mock does NOT include Circle — adding it is required
return {
  VStack, HStack, ZStack, Text, Spacer, Rectangle, RoundedRectangle
  // ← Circle missing here
};
```

### Tests that will break and must be updated

| Test | File | Current assertion | New assertion |
|------|------|-------------------|---------------|
| FR3.1–FR3.3 | widgetVisualIos.test.ts | `>= 2 Rectangle` per size | `>= 1 Rectangle` per size (circles replace 2nd rect) |
| FR3.4 | widgetVisualIos.test.ts | first rect fill `#0D0C14` | first rect fill `#0B0D13` |
| FR4.5 | widgetVisualIos.test.ts | max bar height `>= 95, <= 105` | max bar height `>= 55, <= 65` |
| FR2.1 | widgetVisualIos.test.ts | hero font weight `'heavy'` | `'bold'` |
| FR2.2 | widgetVisualIos.test.ts | hero font design `'monospaced'` | `'rounded'` |
| FR4.new.7 | widgetVisualIos.test.ts | LargeWidget P3 hero weight `'heavy'` | `'bold'` |
| FR4.new.7b | widgetVisualIos.test.ts | LargeWidget P2 hero weight `'heavy'` | `'bold'` |
| SC2.2 | widgetPolish.test.ts | LargeWidget source does NOT contain `padding={14}` | Needs update — IosGlassCard uses `padding={14}` |

### Tests that must NOT break

- FR1 (content triage): no earnings/hoursRemaining in SmallWidget — unaffected
- FR2.3–FR2.5 (SmallWidget renders hoursDisplay, pace badge, manager badge) — unaffected
- FR3.5, FR3.6 — urgency differentiation, no #1A1A2E background — unaffected
- FR4.1–FR4.4, FR4.6–FR4.9 (bar chart structure, colors) — unaffected (colors unchanged)
- FR4.new.1–6 (priority modes, bottom padding) — unaffected
- FR5 (todayDelta fallback) — unaffected
- All SC4 tests (computeTodayDelta, bridge todayDelta) — unaffected
- SC1 (SmallWidget content triage source assertions) — unaffected
- SC2.1 (LargeWidget `padding={16}`) — unaffected
- SC3 (Android buildMeshSvg) — unaffected (different spec)
- SC5 (Android blProgressBar) — unaffected (different spec)

## Key Decisions

1. **Background approach**: Use `WidgetBackground` component with Circle glow. Removes the URGENCY_TINTS second Rectangle — urgency is expressed by the accent Circle color alone.
2. **Background base color**: `#0B0D13` (user's spec). Slightly different from current `#0D0C14`. Test FR3.4 must be updated.
3. **GlassCard rename**: `GlassCard` → `IosGlassCard`. Component still accepts `borderColor` prop for semantic card borders.
4. **IosGlassCard values**: fill `#1C1E26CC`, cornerRadius 16, strokeWidth 0.5, padding 14.
5. **MAX_BAR_HEIGHT = 60**: Gives charts breathing room. Test FR4.5 must be updated to check `>= 55, <= 65`.
6. **Font weight**: `heavy` → `bold`, `design: 'monospaced'` → `design: 'rounded'`. Tests FR2.1/FR2.2/FR4.new.7/FR4.new.7b must be updated.
7. **StatusPill**: Reduce fill opacity. Currently `color + '25'` — change to `color + '15'` for subtler background.
8. **SC2.2 fix**: Change SC2.2 from whole-source check to a more targeted assertion. The outer VStack uses `padding={{ top: 16 ... }}` (an object, not a number), so `padding={14}` in SC2.2 was checking a different element. Best fix: update SC2.2 to assert that the outer VStack uses object padding (or just remove the negative check since the positive SC2.1 already covers the intent).

## Interface Contracts

### New: `WidgetBackground`
```typescript
// Source: new component in HourglassWidget.tsx
function WidgetBackground({ accent }: { accent: string }): JSX.Element
// Renders: Rectangle (base #0B0D13) + 2 Circle (top-right accent glow + bottom-left blue glow)
// Replaces: 2-Rectangle pattern used in SmallWidget/MediumWidget/LargeWidget
```

### Updated: `IosGlassCard` (was `GlassCard`)
```typescript
// Source: updated component in HourglassWidget.tsx
function IosGlassCard({
  children,
  borderColor,  // default: COLORS.borderSubtle ('#FFFFFF1A')
}: {
  children: React.ReactNode;
  borderColor?: string;
}): JSX.Element
// Fill: '#1C1E26CC' (was '#16151FCC')
// Corner radius: 16 (was 14)
// Stroke width: 0.5 (was 1)
// Padding: 14 (was 12)
```

### Updated: `MetricView`
```typescript
// Source: updated in HourglassWidget.tsx
// Font change: weight 'heavy' → 'bold', design 'monospaced' → 'rounded'
function MetricView({
  label, value, valueColor, size?: number  // default 24
}): JSX.Element
```

### Updated: `MAX_BAR_HEIGHT`
```typescript
const MAX_BAR_HEIGHT = 60  // was 100
```

### Updated: `COLORS.bgDark`
```typescript
const COLORS = {
  bgDark: '#0B0D13',        // was '#0D0C14'
  surface: '#1C1E26CC',    // was '#16151FCC'
  // ...rest unchanged
}
```

### Updated: `StatusPill`
```typescript
// Reduced fill opacity: color + '15' (was color + '25')
```

## Test Plan

### FR-New.1: WidgetBackground component

**Signature:** `WidgetBackground({ accent: string })`

**Happy path:**
- [ ] All three widget sizes render WidgetBackground with 1 Rectangle (base) + 2 Circle elements
- [ ] Rectangle fill = `#0B0D13`
- [ ] Top-right Circle fill = accent color (urgency-driven)
- [ ] Bottom-left Circle fill = `#3B82F6`

**Mocks needed:**
- `Circle: makeComp('Circle')` added to `@expo/ui/swift-ui` mock

### FR-New.2: IosGlassCard values

**Happy path:**
- [ ] RoundedRectangle fill = `#1C1E26CC`
- [ ] RoundedRectangle cornerRadius = 16
- [ ] RoundedRectangle strokeWidth = 0.5
- [ ] Inner VStack padding = 14

### FR-Updated.1: MAX_BAR_HEIGHT = 60

**Contract update:**
- [ ] FR4.5 assertion: max bar height `>= 55` and `<= 65`

### FR-Updated.2: Hero font bold/rounded

**Contract update:**
- [ ] FR2.1 (SmallWidget): `font.weight === 'bold'`
- [ ] FR2.2 (SmallWidget): `font.design === 'rounded'`
- [ ] FR4.new.7 (LargeWidget P3): `font.weight === 'bold'`, `font.design === 'rounded'`
- [ ] FR4.new.7b (LargeWidget P2): same

### FR-Updated.3: SC2.2 test fix

**Contract update:**
- [ ] SC2.2: Either remove this test (intent covered by SC2.1) or narrow to outer VStack only

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/widgets/ios/HourglassWidget.tsx` | Add `WidgetBackground`, rename `GlassCard` → `IosGlassCard`, update values, update `MAX_BAR_HEIGHT`, update font weights |
| `src/__tests__/widgets/widgetVisualIos.test.ts` | Add Circle to mock; update FR2.1, FR2.2, FR3.1–3.4, FR4.5, FR4.new.7, FR4.new.7b |
| `src/widgets/__tests__/widgetPolish.test.ts` | Update or remove SC2.2 |

## Files to Reference

- `src/widgets/ios/HourglassWidget.tsx` — current implementation
- `src/__tests__/widgets/widgetVisualIos.test.ts` — all test assertions to update
- `src/widgets/__tests__/widgetPolish.test.ts` — SC2.2 to fix
- `BRAND_GUIDELINES.md` — design system reference
