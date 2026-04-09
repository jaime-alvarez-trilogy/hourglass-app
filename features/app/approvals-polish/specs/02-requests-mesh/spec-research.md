# Spec Research: 02-requests-mesh

## Problem

The Requests screen (`app/(tabs)/approvals.tsx`) uses a flat `bg-background` surface.
Every other primary screen in the app has the animated mesh background. This spec adds
`AnimatedMeshBackground` to the Requests screen and drives its Node C color from pending
approval count: coral/critical when approvals are pending, invisible when queue is clear.

## Key Files

| File | Role |
|------|------|
| `app/(tabs)/approvals.tsx` | Add AnimatedMeshBackground + remove bg-background from root |
| `src/components/AnimatedMeshBackground.tsx` | Existing mesh component — no changes |
| `src/lib/panelState.ts` | `PanelState` type |
| `src/lib/colors.ts` | Color tokens |

## Existing Pattern (from other screens)

`AnimatedMeshBackground` uses `StyleSheet.absoluteFill` with `pointerEvents="none"`.
It must be rendered as the FIRST child of the screen's root View so it appears behind
all content.

The screen's root View currently has `className="flex-1 bg-background"`. The
`bg-background` class sets `backgroundColor: #0D0C14`. `AnimatedMeshBackground` already
includes a `<Rect color="#0D0C14" />` as its base layer. If we keep `bg-background`, the
solid background still shows but the mesh renders on top of it (absolute positioning) —
so the mesh's Rect layer covers the solid background anyway.

**Decision**: Keep `className="flex-1"` but drop `bg-background` from the root View.
The mesh provides its own #0D0C14 base. This matches how other screens are structured
(home, overview, AI screens don't need bg-background because the mesh handles it).

## Node C Signal Design

`AnimatedMeshBackground` accepts `panelState?: PanelState | null`.

Existing PanelState color mapping:
```
critical → colors.desatCoral (#F87171)  ← USE THIS when pending > 0
null      → falls through to colors.background (invisible)  ← USE WHEN empty
```

The signal:
```typescript
const meshPanelState: PanelState | null =
  isManager && items.length > 0 ? 'critical' : null;
```

When null, Node C color = `colors.background` (#0D0C14), same as the base Rect. Node C
contribution is invisible — only violet (Node A) and cyan (Node B) show. This is the
calm ambient idle state.

When `critical`, Node C glows `desatCoral` (#F87171). This creates an unmissable
environmental signal — the background pulses with coral, alerting the manager.

Non-managers: `isManager` is false, so `meshPanelState` is always null. Mesh shows
idle violet+cyan (still premium, no urgency signal).

## Interface Contracts

### AnimatedMeshBackground (existing, no changes)

```typescript
interface AnimatedMeshBackgroundProps {
  panelState?: PanelState | null;
  earningsPace?: number | null;
  aiPct?: number | null;
}
```

### Changes to approvals.tsx

```typescript
// New derived value (computed from existing hook data — no new hooks)
const meshPanelState: PanelState | null =
  isManager && items.length > 0 ? 'critical' : null;

// Root View change:
// Before: <View className="flex-1 bg-background">
// After:  <View className="flex-1">

// AnimatedMeshBackground: first child of root View
<AnimatedMeshBackground panelState={meshPanelState} />
```

## Test Plan

### FR1: AnimatedMeshBackground renders on Requests screen

**Happy Path:**
- [ ] `AnimatedMeshBackground` renders as the first child of root View
- [ ] Root View no longer has `bg-background` class

**Edge Cases:**
- [ ] Component does not crash when items = [] and isManager = false

### FR2: meshPanelState derives correctly

**Happy Path:**
- [ ] When `isManager=true` and `items.length > 0`: `meshPanelState = 'critical'`
- [ ] When `isManager=true` and `items.length === 0`: `meshPanelState = null`
- [ ] When `isManager=false` and `items.length > 0`: `meshPanelState = null`

**Edge Cases:**
- [ ] When `isManager=false`: mesh always receives null panelState

### FR3: Existing content renders correctly over mesh

**Happy Path:**
- [ ] Header, ScrollView, RejectionSheet all render above mesh (z-order correct)
- [ ] ScrollView RefreshControl visible
- [ ] No layout shift from removing bg-background

## Mocks Needed

- `@shopify/react-native-skia` — already mocked at `__mocks__/@shopify/react-native-skia.ts`
- `src/components/AnimatedMeshBackground` — use real component with mocked Skia

## Files to Create/Modify

- **Modify**: `app/(tabs)/approvals.tsx`
  - Import `AnimatedMeshBackground`
  - Add `meshPanelState` derived value
  - Add `<AnimatedMeshBackground panelState={meshPanelState} />` as first child of root View
  - Remove `bg-background` from root View className
