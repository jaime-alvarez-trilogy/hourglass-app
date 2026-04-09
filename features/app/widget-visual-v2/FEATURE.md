# Feature: Widget Visual Redesign v2

## Goal

Redesign both iOS and Android widgets so they visually match the app's premium dark glass aesthetic. The widgets should feel like native extensions of the app — same glass card depth, same atmospheric background glow, same color language, same typographic weights.

## Background

The current widgets use a two-Rectangle gradient background (flat base + urgency tint overlay) and a GlassCard with values that don't fully match the app's glass surface spec. Tests were written for this implementation and lock in several design values (MAX_BAR_HEIGHT=100, weight='heavy', base color '#0D0C14'). This feature redesigns the visual layer and updates the tests to reflect the new design spec.

## Scope

### In Scope

- **iOS widget**: Atmospheric `WidgetBackground` with Circle glow, upgraded `IosGlassCard`, `MAX_BAR_HEIGHT` reduction, font weight change from `heavy` to `bold`
- **Android widget**: Equivalent design improvements using SVG approach — improved glass panel, updated badge colors, bar chart height scale reduction
- **Test updates**: Update `@expo/ui/swift-ui` mock + existing design assertions to match new design

### Out of Scope

- Adding a Large Android widget (separate feature)
- Changes to WidgetData interface or bridge.ts
- Animation or real-time updating

## Design Direction

Provided by user:

```tsx
// 1. IMPROVED GLASS CARD
function IosGlassCard({ children }) {
  return (
    <ZStack>
      <RoundedRectangle fill="#1C1E26CC" cornerRadius={16} />
      <RoundedRectangle cornerRadius={16} stroke="#FFFFFF1A" strokeWidth={0.5} />
      <VStack padding={14} alignment="leading">
        {children}
      </VStack>
    </ZStack>
  );
}

// 2. ATMOSPHERIC BACKGROUND
function WidgetBackground({ accent }) {
  return (
    <ZStack>
      <Rectangle fill="#0B0D13" />
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

Additional changes:
- `MAX_BAR_HEIGHT`: 100 → 60 (breathing room)
- Hero font: `weight: 'heavy'` → `weight: 'bold'`, `design: 'monospaced'` → `design: 'rounded'`
- StatusPill: more subtle fill (reduce background opacity)
- Both platforms should feel visually consistent

## Decomposition

| Spec | Description | Blocks | Blocked By | Complexity |
|------|-------------|--------|------------|------------|
| 01-ios-widget-redesign | iOS atmospheric background, IosGlassCard, MAX_BAR_HEIGHT=60, font weight, test updates | — | — | M |
| 02-android-widget-redesign | Android glass panel, background SVG, badge colors, bar chart height | — | — | M |

Both specs are independent — same feature, different platform files.

## Success Criteria

- All existing iOS widget tests pass with updated assertions
- All existing Android widget tests pass with updated assertions
- `Circle` added to `@expo/ui/swift-ui` test mock
- iOS widget uses `WidgetBackground` component with atmospheric glow
- Both platforms use the same color language (glass fill `#1C1E26CC`, base `#0B0D13`)
- `MAX_BAR_HEIGHT = 60` in iOS; equivalent 60pt max in Android SVG chart
- Hero fonts: `weight: 'bold'`, `design: 'rounded'`

## Changelog

| Date | Spec | Description |
|------|------|-------------|
| 2026-04-02 | [01-ios-widget-redesign](specs/01-ios-widget-redesign/spec.md) | **Complete**: spec+test+impl — WidgetBackground, IosGlassCard, MAX_BAR_HEIGHT=60, bold/rounded font. 111/111 tests passing |
| 2026-04-02 | [02-android-widget-redesign](specs/02-android-widget-redesign/spec.md) | Spec created: Android widget color alignment — URGENCY_ACCENT, badgeColor(), GlassPanel, root background |
| 2026-04-02 | [02-android-widget-redesign](specs/02-android-widget-redesign/spec.md) | **Complete**: test(FR1-FR5), feat(FR1-FR4), fix(stale comment) — 139/139 tests passing |
