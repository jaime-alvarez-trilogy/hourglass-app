# Spec Research: 04-pill-chart

## Problem

Two small but visible component refinements:

### StatusPill — wrong shape primitive

Current: uses `RoundedRectangle` with `cornerRadius={10}` for both the fill and border layers. This creates a slightly squared pill shape.

Target: uses `Capsule()` — the correct SwiftUI primitive for a fully pill-shaped badge. Capsule automatically adapts its radius to 50% of height regardless of content width.

Additionally the fill opacity changes: `color + '15'` (8.2% hex) → `accent + '1A'` (10% hex), and the stroke opacity changes: `color + '80'` (50%) → `accent` stroke at 1pt (100% opacity, thinner).

### IosBarChart — too-sharp bar corners

Current: `RoundedRectangle` bars use `cornerRadius={3}`. The app's design system uses 6pt for bar chart corners (matching the card corner language used elsewhere). At 3pt the bars look sharp/technical; at 6pt they feel softer and more brand-consistent.

`MAX_BAR_HEIGHT` is already 60 (set in widget-visual-v2) — no change needed there.

## Current Implementation

### StatusPill (lines 147–167)

```tsx
function StatusPill({ paceBadge }: { paceBadge: string }) {
  const label = PACE_LABELS[paceBadge] ?? 'ON TRACK';
  const PACE_COLORS: Record<string, string> = {
    crushed_it: '#F5C842',
    on_track:   '#10B981',
    behind:     '#F59E0B',
    critical:   '#F43F5E',
    none:       '#10B981',
  };
  const color = PACE_COLORS[paceBadge] ?? PACE_COLORS.none;

  return (
    <ZStack>
      <RoundedRectangle fill={color + '15'} cornerRadius={10} />
      <RoundedRectangle cornerRadius={10} stroke={color + '80'} strokeWidth={1} />
      <Text font={{ size: 10, weight: 'semibold' }} foregroundStyle={color} padding={6}>
        {label}
      </Text>
    </ZStack>
  );
}
```

Called as: `<StatusPill paceBadge={props.paceBadge} />`

### IosBarChart (lines 203–228)

```tsx
function IosBarChart({ daily, accent }: { daily: WidgetDailyEntry[]; accent: string }) {
  const maxHours = Math.max(...daily.map((d) => d.hours), 1);
  return (
    <HStack spacing={4}>
      {daily.map((entry, i) => (
        <VStack key={i} spacing={2} alignment="center">
          <Spacer />
          <RoundedRectangle
            fill={entry.isToday ? accent : entry.isFuture || entry.hours === 0 ? COLORS.barFuture : COLORS.barPast}
            cornerRadius={3}  // ← target: 6
            width={undefined}
            height={(entry.hours / maxHours) * MAX_BAR_HEIGHT}
          />
          <Text font={{ size: 9, weight: 'medium' }} foregroundStyle={COLORS.textMuted}>
            {DAY_LABELS[i]}
          </Text>
        </VStack>
      ))}
    </HStack>
  );
}
```

## Target Implementation

### StatusPill

```tsx
function StatusPill({ paceBadge }: { paceBadge: string }) {
  const label = PACE_LABELS[paceBadge] ?? 'ON TRACK';
  const PACE_COLORS: Record<string, string> = {
    crushed_it: '#F5C842',
    on_track:   '#10B981',
    behind:     '#F59E0B',
    critical:   '#F43F5E',
    none:       '#10B981',
  };
  const color = PACE_COLORS[paceBadge] ?? PACE_COLORS.none;

  return (
    <ZStack>
      <Capsule fill={color + '1A'} height={22} />
      <Capsule stroke={color} strokeWidth={0.5} height={22} />
      <Text
        font={{ size: 10, weight: 'bold' }}
        foregroundStyle={color}
        padding={{ leading: 10, trailing: 10 }}
      >
        {label}
      </Text>
    </ZStack>
  );
}
```

**Changes:**

| Property | Current | Target |
|----------|---------|--------|
| Shape | `RoundedRectangle cornerRadius={10}` | `Capsule` |
| Fill opacity suffix | `'15'` (≈8%) | `'1A'` (10%) |
| Stroke opacity suffix | `'80'` (50%) | none (full accent color) |
| Stroke width | `1` | `0.5` |
| Text weight | `'semibold'` | `'bold'` |
| Text padding | `6` (uniform) | `{ leading: 10, trailing: 10 }` |
| Height | implicit | `22` |

### IosBarChart

Only change: `cornerRadius={3}` → `cornerRadius={6}`

## Interface Contracts

No prop changes for either component. Signatures remain:

```typescript
function StatusPill({ paceBadge }: { paceBadge: string }): JSX.Element
// Internally derives label from PACE_LABELS[paceBadge] and color from PACE_COLORS[paceBadge]

function IosBarChart({ daily, accent }: { daily: WidgetDailyEntry[]; accent: string }): JSX.Element
```

## @expo/ui/swift-ui Mock

`Capsule` must be present in the mock. Check `__mocks__/@expo/ui/swift-ui` (or wherever the mock lives).

Current: The prior `widget-visual-v2` spec added `Circle` to the mock. Verify `Capsule` is also there. If not, it needs adding.

**Mock pattern for Capsule (same as Circle):**
```typescript
Capsule: ({ children, fill, stroke, strokeWidth, height }: any) => ({
  type: 'Capsule',
  props: { fill, stroke, strokeWidth, height },
  children: children ?? null,
}),
```

## Test Plan

### FR1: StatusPill uses Capsule shape

**Contract:** StatusPill renders two Capsule elements (fill layer + stroke layer), not RoundedRectangle

- [ ] Tree contains `Capsule` elements (not `RoundedRectangle`) in StatusPill
- [ ] No `RoundedRectangle` with `cornerRadius={10}` in StatusPill subtree
- [ ] First Capsule has fill `{color}1A` and height=22
- [ ] Second Capsule has stroke equal to `color` and strokeWidth=0.5

### FR2: StatusPill text is bold with horizontal padding

- [ ] Text font.weight === 'bold'
- [ ] Text padding has leading=10 and trailing=10

### FR3: IosBarChart corner radius is 6

**Contract:** Each bar RoundedRectangle uses cornerRadius=6

- [ ] All bar RoundedRectangles have `cornerRadius={6}`
- [ ] No RoundedRectangle with `cornerRadius={3}` in IosBarChart (old value)

### FR4: Capsule mock exists

- [ ] `@expo/ui/swift-ui` mock exports a `Capsule` component
- [ ] Tests do not throw "Capsule is not a function" or similar

## Files to Reference

- `src/widgets/ios/HourglassWidget.tsx` — lines 147–167 (StatusPill), lines 203–228 (IosBarChart)
- `__mocks__/@expo/ui/swift-ui` (or equivalent path) — check for Capsule export
- `src/widgets/__tests__/widgetPolish.test.ts` — StatusPill and bar chart assertions
- `src/widgets/__tests__/widgetLayoutJs.test.ts` — may have StatusPill color assertions
