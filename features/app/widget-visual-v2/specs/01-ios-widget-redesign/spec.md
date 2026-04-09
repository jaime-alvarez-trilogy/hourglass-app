# 01-ios-widget-redesign

**Status:** Complete
**Created:** 2026-04-02
**Last Updated:** 2026-04-02

---

## Overview

### What is being built

This spec redesigns the visual layer of the iOS Hourglass widget (`src/widgets/ios/HourglassWidget.tsx`) to match the app's premium dark glass aesthetic. The current implementation uses a flat two-Rectangle gradient background (base layer + urgency tint overlay) and a `GlassCard` component with values that do not fully match the app's glass surface specification. Tests are tightly coupled to the old design values.

### What changes

**Four coordinated visual changes:**

1. **Atmospheric background system** — Replace the two-Rectangle pattern with a new `WidgetBackground` component that renders one base `Rectangle` (#0B0D13) plus two `Circle` glow elements (accent top-right, blue #3B82F6 bottom-left). Urgency is expressed through the accent Circle color, not a tint Rectangle.

2. **Upgraded glass card** — Rename `GlassCard` → `IosGlassCard` and update its values: fill `#1C1E26CC` (was `#16151FCC`), cornerRadius 16 (was 14), strokeWidth 0.5 (was 1), padding 14 (was 12).

3. **Bar chart height** — Reduce `MAX_BAR_HEIGHT` from 100 to 60, giving charts visual breathing room within the widget frame.

4. **Hero typography** — Change the hero metric font from `weight: 'heavy', design: 'monospaced'` to `weight: 'bold', design: 'rounded'` for a softer, more premium feel.

### How tests are updated

All affected test assertions in `widgetVisualIos.test.ts` and `widgetPolish.test.ts` are updated to match the new design values. The `Circle` component is added to the `@expo/ui/swift-ui` Jest mock. Tests that are unaffected by the visual changes are preserved exactly as-is.

### Files changed

| File | Type of change |
|------|---------------|
| `src/widgets/ios/HourglassWidget.tsx` | Implementation: add `WidgetBackground`, rename `GlassCard` → `IosGlassCard`, update constants and font weights |
| `src/__tests__/widgets/widgetVisualIos.test.ts` | Test update: add `Circle` to mock, update FR2/FR3/FR4 assertions |
| `src/widgets/__tests__/widgetPolish.test.ts` | Test update: fix SC2.2 to remove stale negative assertion |

---

## Out of Scope

1. **Android widget visual changes** — **Deferred to 02-android-widget-redesign**: All equivalent redesign work for the Android HourglassWidget (SVG glass panel, background, badge colors, bar chart height) is handled in the sibling spec.

2. **WidgetData interface or bridge.ts changes** — **Descoped**: No data model changes. The redesign is purely visual — the same `WidgetData` props drive the new components unchanged.

3. **Adding a Large Android widget** — **Descoped**: Separate feature outside the widget-visual-v2 scope.

4. **Animation or real-time updates** — **Descoped**: Static rendering only; no animated transitions.

5. **Expo widget build / EAS compilation verification** — **Descoped**: Spec covers JSX-level correctness verified by Jest. Build-time SwiftUI compilation is validated separately in CI.

6. **Lock screen widget sizes (accessoryRectangular/Circular/Inline)** — **Descoped**: No visual changes to lock screen widget variants.

---

## Functional Requirements

### FR1: Add `Circle` to `@expo/ui/swift-ui` Jest mock

**Context:** The new `WidgetBackground` component uses `Circle` elements from `@expo/ui/swift-ui`. Tests will fail at render time if `Circle` is not in the mock.

**Success Criteria:**
- SC1.1: The `jest.mock('@expo/ui/swift-ui', ...)` factory in `widgetVisualIos.test.ts` exports a `Circle` key created with `makeComp('Circle')`
- SC1.2: All three widget sizes render without `TypeError: Circle is not a function`

---

### FR2: `WidgetBackground` component

**Context:** Replace the two-Rectangle urgency tint pattern with an atmospheric glow system.

**Signature:**
```typescript
function WidgetBackground({ accent }: { accent: string }): JSX.Element
```

**Structure:**
```tsx
<ZStack>
  <Rectangle fill="#0B0D13" />
  <VStack>
    <HStack>
      <Spacer />
      <Circle fill={accent} width={160} height={160} opacity={0.15} blur={50} />
    </HStack>
    <Spacer />
  </VStack>
  <VStack>
    <Spacer />
    <HStack>
      <Circle fill="#3B82F6" width={100} height={100} opacity={0.08} blur={40} />
      <Spacer />
    </HStack>
  </VStack>
</ZStack>
```

**Used in:** `SmallWidget`, `MediumWidget`, `LargeWidget` — replacing both `<Rectangle fill={COLORS.bgDark} />` and `<Rectangle fill={tint} />` lines.

**COLORS.bgDark updated:** `'#0B0D13'` (was `'#0D0C14'`)

**Success Criteria:**
- SC2.1: All three widget sizes (Small, Medium, Large) render exactly 1 `Rectangle` in the background (the base layer)
- SC2.2: That `Rectangle` has `fill === '#0B0D13'`
- SC2.3: All three widget sizes render at least 2 `Circle` elements (top-right accent + bottom-left blue)
- SC2.4: Top-right `Circle` has `fill` equal to the urgency accent color for the widget's urgency state
- SC2.5: Bottom-left `Circle` has `fill === '#3B82F6'`
- SC2.6: Urgency differentiation is preserved — different urgency states produce different accent Circle colors

---

### FR3: `IosGlassCard` component (replaces `GlassCard`)

**Context:** Rename and upgrade the glass card component to match the app's premium glass surface spec.

**Signature:**
```typescript
function IosGlassCard({
  children,
  borderColor,
}: {
  children: React.ReactNode;
  borderColor?: string;  // default: COLORS.borderSubtle ('#FFFFFF1A')
}): JSX.Element
```

**Updated values:**
| Property | Old value | New value |
|----------|-----------|-----------|
| `fill` | `#16151FCC` | `#1C1E26CC` |
| `cornerRadius` | 14 | 16 |
| `strokeWidth` | 1 | 0.5 |
| `padding` | 12 | 14 |

**COLORS.surface updated:** `'#1C1E26CC'` (was `'#16151FCC'`)

**Success Criteria:**
- SC3.1: `RoundedRectangle` fill = `#1C1E26CC`
- SC3.2: `RoundedRectangle` cornerRadius = 16
- SC3.3: `RoundedRectangle` strokeWidth = 0.5
- SC3.4: Inner `VStack` padding = 14
- SC3.5: `borderColor` prop defaults to `COLORS.borderSubtle` (`#FFFFFF1A`) when not provided
- SC3.6: `borderColor` prop is passed through as stroke when provided

---

### FR4: `MAX_BAR_HEIGHT = 60`

**Context:** Reduce bar chart maximum height for visual breathing room.

**Success Criteria:**
- SC4.1: `MAX_BAR_HEIGHT` constant = 60 in `HourglassWidget.tsx`
- SC4.2: The column with maximum hours has bar height close to 60pt (within 5pt: `>= 55, <= 65`)
- SC4.3: Single non-zero entry bar height = 60 (FR4.9 assertion updated from 100 to 60)

---

### FR5: Hero font `bold`/`rounded`

**Context:** Soften the hero metric typography from heavy monospaced to bold rounded.

**Applies to:** `MetricView` component `Text` element and all direct hero `Text` elements in widget layouts.

**Change:**
- `weight: 'heavy'` → `weight: 'bold'`
- `design: 'monospaced'` → `design: 'rounded'`

**Success Criteria:**
- SC5.1: `SmallWidget` hero `Text` (hoursDisplay) has `font.weight === 'bold'`
- SC5.2: `SmallWidget` hero `Text` has `font.design === 'rounded'`
- SC5.3: `LargeWidget` P3 hero `Text` has `font.weight === 'bold'` and `font.design === 'rounded'`
- SC5.4: `LargeWidget` P2 deficit hero `Text` (48pt) has `font.weight === 'bold'` and `font.design === 'rounded'`
- SC5.5: No `Text` element in any widget size uses `weight: 'heavy'` for a hero value display

---

### FR6: `StatusPill` opacity reduction

**Context:** Reduce the StatusPill background fill opacity for a subtler look.

**Change:** `color + '25'` → `color + '15'` (background fill only; stroke unchanged)

**Success Criteria:**
- SC6.1: `StatusPill` background `RoundedRectangle` fill ends with `'15'` (e.g. `#F5C84215`)
- SC6.2: `StatusPill` stroke `RoundedRectangle` stroke value is unchanged (still ends with `'80'`)

---

### FR7: Fix SC2.2 in `widgetPolish.test.ts`

**Context:** The existing SC2.2 test asserts `LargeWidget does NOT use padding={14}`. After this spec, `IosGlassCard` uses `padding={14}` internally, so SC2.2 would produce a false failure. The intent of SC2.1 + SC2.2 was to verify the outer VStack uses object-form padding `{ top: 16, ... }`. SC2.1 already covers this positively. SC2.2's negative check is now stale.

**Resolution:** Update SC2.2 to assert that the outer VStack uses object-form padding by checking for the literal string `padding={{ top: 16`, which is more precise than a negative check.

**Success Criteria:**
- SC7.1: `widgetPolish.test.ts` SC2.2 no longer asserts `not.toContain('padding={14}')` on the full LargeWidget source
- SC7.2: SC2.2 is replaced with a positive assertion: `toContain("padding={{ top: 16")`
- SC7.3: SC2.1 (`padding={16}`) remains passing and unchanged

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/widgets/ios/HourglassWidget.tsx` | Current implementation — GlassCard, MAX_BAR_HEIGHT, MetricView, SmallWidget/MediumWidget/LargeWidget |
| `src/__tests__/widgets/widgetVisualIos.test.ts` | All iOS widget test assertions to update |
| `src/widgets/__tests__/widgetPolish.test.ts` | SC2.2 negative assertion to fix |
| `hourglassws/BRAND_GUIDELINES.md` | Design system reference for colors and typography |

### Files to Create / Modify

| File | Change |
|------|--------|
| `src/widgets/ios/HourglassWidget.tsx` | Add `WidgetBackground` component; rename `GlassCard` → `IosGlassCard`; update fill/cornerRadius/strokeWidth/padding; update `MAX_BAR_HEIGHT` to 60; update `COLORS.bgDark` to `#0B0D13`; update `COLORS.surface` to `#1C1E26CC`; update `MetricView` font to `bold`/`rounded`; update `StatusPill` fill suffix to `15`; add `Circle` to require destructure; replace 2-Rectangle pattern in all three widget functions with `<WidgetBackground accent={accent} />` |
| `src/__tests__/widgets/widgetVisualIos.test.ts` | Add `Circle: makeComp('Circle')` to mock; update FR3.1–FR3.3 (`>= 1 Rectangle`); update FR3.4 (`#0B0D13`); update FR4.5 (`>= 55, <= 65`); update FR4.9 (bar height `60`); update FR2.1 (`bold`); update FR2.2 (`rounded`); update FR4.new.7 and FR4.new.7b (`bold`/`rounded`); add new Circle count/fill assertions |
| `src/widgets/__tests__/widgetPolish.test.ts` | Update SC2.2 from negative `not.toContain('padding={14}')` to positive `toContain("padding={{ top: 16")` |

### Data Flow

```
WidgetData.urgency
    │
    ▼
URGENCY_ACCENT[urgency]  ──→  accent: string
    │
    ├──→  WidgetBackground({ accent })
    │         ├── Rectangle fill="#0B0D13"
    │         ├── Circle fill={accent} opacity={0.15} blur={50}   // top-right glow
    │         └── Circle fill="#3B82F6" opacity={0.08} blur={40}  // bottom-left glow
    │
    ├──→  IosBarChart({ daily, accent })
    │         └── barHeight = (hours / maxHours) * 60  // MAX_BAR_HEIGHT=60
    │
    ├──→  MetricView({ value, valueColor, size })
    │         └── Text font={{ weight: 'bold', design: 'rounded' }}
    │
    └──→  StatusPill({ paceBadge })
              └── RoundedRectangle fill={color + '15'}  // was '25'
```

### Component Dependency Tree

```
HourglassWidget
├── SmallWidget
│   ├── ZStack
│   ├── WidgetBackground { accent }      ← NEW (replaces 2 Rectangle)
│   ├── SectionLabel
│   ├── Text (hero — bold/rounded)       ← UPDATED
│   └── StatusPill                       ← UPDATED fill opacity
│
├── MediumWidget
│   ├── ZStack
│   ├── WidgetBackground { accent }      ← NEW
│   └── [P1/P2/P3 layouts]
│       └── IosGlassCard                 ← RENAMED + UPDATED values
│           └── MetricView               ← UPDATED font
│
└── LargeWidget
    ├── ZStack
    ├── WidgetBackground { accent }      ← NEW
    └── [P1/P2/P3 layouts]
        ├── IosGlassCard                 ← RENAMED + UPDATED values
        ├── MetricView                   ← UPDATED font
        └── IosBarChart                  ← MAX_BAR_HEIGHT=60
```

### Edge Cases

1. **urgency = 'none'**: accent = `#00FF88` (existing behavior). `WidgetBackground` top-right Circle uses this. Tests verify accent passthrough.

2. **urgency not in URGENCY_ACCENT**: Falls back to `URGENCY_ACCENT.none` via `?? URGENCY_ACCENT.none` (existing guard). Same for `WidgetBackground` since it receives the already-resolved accent.

3. **All-zero daily data**: `IosBarChart` already handles `maxHours === 0` → all bars height 0. `MAX_BAR_HEIGHT` change does not affect this path.

4. **P1 approvals mode (MediumWidget/LargeWidget)**: These layouts use `COLORS.surface` directly for approval item cards (not via `IosGlassCard`). The surface color update (`#1C1E26CC`) applies to those `RoundedRectangle fill={COLORS.surface}` elements as well, since they reference the constant.

5. **Bar chart ZStack (LargeWidget P3)**: The activity chart container is an inline ZStack with explicit values (`cornerRadius={14}`, `padding={16}`). This is NOT using `IosGlassCard` — it remains unchanged (except `COLORS.surface` updates implicitly via the constant).

6. **SC2.2 in widgetPolish.test.ts**: The test reads `LargeWidget` source from disk. The safest fix is replacing the stale negative check with the positive assertion `toContain("padding={{ top: 16")`, which is the actual outer VStack padding in the current code.

### Test Update Map

| Test ID | File | Old assertion | New assertion |
|---------|------|---------------|---------------|
| mock | widgetVisualIos | no Circle export | `Circle: makeComp('Circle')` added |
| FR3.1 | widgetVisualIos | `>= 2 Rectangle` | `>= 1 Rectangle` |
| FR3.2 | widgetVisualIos | `>= 2 Rectangle` | `>= 1 Rectangle` |
| FR3.3 | widgetVisualIos | `>= 2 Rectangle` | `>= 1 Rectangle` |
| FR3.4 | widgetVisualIos | first rect fill `#0D0C14` | first rect fill `#0B0D13` |
| FR4.5 | widgetVisualIos | `>= 95, <= 105` | `>= 55, <= 65` |
| FR4.9 | widgetVisualIos | `toContain(100)` | `toContain(60)` |
| FR2.1 (hud layout) | widgetVisualIos | `font.weight === 'heavy'` | `font.weight === 'bold'` |
| FR2.2 (hud layout) | widgetVisualIos | `font.design === 'monospaced'` | `font.design === 'rounded'` |
| FR4.new.7 | widgetVisualIos | `weight === 'heavy'`, `design === 'monospaced'` | `weight === 'bold'`, `design === 'rounded'` |
| FR4.new.7b | widgetVisualIos | `weight === 'heavy'`, `design === 'monospaced'` | `weight === 'bold'`, `design === 'rounded'` |
| SC2.2 | widgetPolish | `not.toContain('padding={14}')` | `toContain("padding={{ top: 16")` |
| FR-New (Circle) | widgetVisualIos | (none — new tests) | Circle count/fill assertions added |
