# Spec Research: 01-atmospheric-background

## Problem

The current `WidgetBackground` component uses two offset circles:
- Top-right: accent color, 160×160pt, 0.15 opacity, 50pt blur
- Bottom-left: `#3B82F6` blue, 100×100pt, 0.08 opacity, 40pt blur

This creates a "weird circles" visual — mismatched focal points that don't match the single dominant header glow in the main app screens. The user's reference shows a single top-center glow that mirrors the header gradient seen on the Hours and AI tabs.

## Current Implementation

**File:** `src/widgets/ios/HourglassWidget.tsx` lines 102–124

```tsx
function WidgetBackground({ accent }: { accent: string }) {
  return (
    <ZStack>
      <Rectangle fill={COLORS.bgDark} />
      {/* Top-right accent glow */}
      <VStack>
        <HStack>
          <Spacer />
          <Circle fill={accent} width={160} height={160} opacity={0.15} blur={50} />
        </HStack>
        <Spacer />
      </VStack>
      {/* Bottom-left blue glow */}
      <VStack>
        <Spacer />
        <HStack>
          <Circle fill="#3B82F6" width={100} height={100} opacity={0.08} blur={40} />
          <Spacer />
        </HStack>
      </VStack>
    </ZStack>
  );
}
```

**Color constant:**
`COLORS.bgDark = '#0B0D13'` (line 62) — base fill is already correct.

## Target Implementation

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

**Changes from current:**
| Property | Current | Target |
|----------|---------|--------|
| Accent circle width | 160 | 250 |
| Accent circle height | 160 | 200 (intentionally taller than wide — elliptical glow spread) |
| Accent circle blur | 50 | 60 |
| Accent circle position | top-right (inner HStack with leading Spacer) | top-center (VStack only, no inner HStack) |
| Blue circle | present | removed |
| Base fill | `COLORS.bgDark` (indirect) | `"#0B0D13"` (direct literal) |

Note: 250×200 is intentionally non-square — a wider-than-tall glow ellipse spreads horizontally across the top, matching the app header gradient shape. Tests must assert both width=250 AND height=200.

## Affected Tests

**Verified:** No direct WidgetBackground assertions exist in `widgetPolish.test.ts` or any widget test file. A grep for `WidgetBackground`, `Circle`, `blur`, and `3B82F6` across all widget test files returned zero results (only the Circle mock stub in `widgetLayoutJs.test.ts`).

This means **new tests must be written** for WidgetBackground. The implementer writes them from scratch in Phase X.0.

**Test file to add to:** `src/widgets/__tests__/widgetPolish.test.ts`

**Test scaffolding:** Use `renderSmallWidget(mockData)` / `renderLargeWidget(mockData)` helpers already in the file to get a rendered tree, then traverse to the WidgetBackground subtree and assert Circle properties.

Also check: `src/__tests__/widgets/bridge.test.ts` — covers bridge outputs, not widget rendering (not relevant here).

## Interface Contract

No interface change — `WidgetBackground` props remain `{ accent: string }`.

```typescript
// Unchanged prop signature
function WidgetBackground({ accent }: { accent: string }): JSX.Element
```

**Data source:** `accent` ← `URGENCY_ACCENT[props.urgency] ?? COLORS.accentGreen` ← caller (SmallWidget, MediumWidget, LargeWidget, AccessoryWidget all pass this)

## Test Plan

### FR1: Single top-center glow circle

**Contract:** WidgetBackground renders exactly one Circle; it is positioned top-center (VStack without inner HStack)

**Happy Path:**
- [ ] Tree contains exactly 1 `Circle` element
- [ ] Circle has `width={250}`, `height={200}`, `opacity={0.15}`, `blur={60}`
- [ ] Circle fill matches the accent color passed in

**Negative Cases:**
- [ ] No `#3B82F6` color present in WidgetBackground tree (blue circle removed)
- [ ] No second Circle element in tree

**Mock needed:** `@expo/ui/swift-ui` Circle mock — already exists in `__mocks__/expo-ui-swift-ui.ts`; ensure `Circle` accepts `blur` prop

## Files to Reference

- `src/widgets/ios/HourglassWidget.tsx` — lines 102–124 (current WidgetBackground)
- `src/widgets/__tests__/widgetPolish.test.ts` — existing test assertions
- `__mocks__/@expo/ui/swift-ui` — Circle mock (confirm blur prop supported)
- `src/widgets/ios/HourglassWidget.tsx` lines 60–80 — COLORS constants
