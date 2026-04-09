# 02-requests-mesh

**Status:** Draft
**Created:** 2026-03-24
**Last Updated:** 2026-03-24
**Owner:** @trilogy

---

## Overview

**What:** Add `AnimatedMeshBackground` to the Requests screen (`app/(tabs)/approvals.tsx`), driven by pending approval count.

**Why:** Every other primary screen (Home, Overview, AI) already has the animated mesh background. The Requests screen uses a flat `bg-background` surface, making it visually inconsistent. Adding the mesh creates ambient depth and — crucially — gives managers an unmissable environmental signal: when approvals are pending, Node C glows coral (`desatCoral` #F87171). When the queue is clear, the mesh runs in calm violet+cyan idle mode.

**How:**

1. Compute `meshPanelState` from existing hook data: `isManager && items.length > 0 ? 'critical' : null`.
2. Import and render `<AnimatedMeshBackground panelState={meshPanelState} />` as the **first child** of the root View (so it sits behind all content via `StyleSheet.absoluteFill`).
3. Remove `bg-background` from the root View's `className`. The mesh component already renders a `<Rect color="#0D0C14" />` as its base layer, so the background color is maintained without the class.

No new hooks, no new APIs, no new components. The change is surgical: 3 lines added, 1 class token removed.

---

## Out of Scope

1. **Changes to `AnimatedMeshBackground.tsx`** — Descoped: the component already supports `panelState` prop and all 7 PanelState values. No modifications needed.

2. **Additional panelState values for the Requests screen** — Descoped: only `'critical'` (pending approvals) and `null` (idle) are used. `onTrack`, `behind`, `overtime`, etc. are not applicable to an approval queue.

3. **Contributor-specific mesh state** — Descoped: non-managers always receive `null` (idle mesh). A future spec could add contributor-facing urgency (e.g. pending own requests near deadline), but that is out of scope here.

4. **Approval card glass treatment** — Deferred to `01-glass-swipe-card`: liquid glass surface and glow swipe are handled by the sibling spec.

5. **Rejection sheet or action changes** — Descoped: `RejectionSheet` is already implemented. This spec makes no changes to approval/rejection flow.

6. **Lock screen or widget integration** — Descoped: this spec only affects the tab screen.

---

## Functional Requirements

### FR1: Render AnimatedMeshBackground on Requests screen

`AnimatedMeshBackground` must be rendered as the first child of the root View in `ApprovalsScreen`, so it appears behind all other content via its internal `StyleSheet.absoluteFill` canvas.

**Success Criteria:**

- SC1.1 — `approvals.tsx` imports `AnimatedMeshBackground` from `@/src/components/AnimatedMeshBackground`
- SC1.2 — `<AnimatedMeshBackground panelState={meshPanelState} />` appears as the first JSX child inside the root `<View className="flex-1">`
- SC1.3 — Rendering `ApprovalsScreen` does not throw, regardless of manager/contributor role or item count
- SC1.4 — Root View `className` no longer includes `bg-background`

---

### FR2: Compute meshPanelState from approval queue

A derived value `meshPanelState` is computed before the `return` statement using the data already fetched by `useApprovalItems` and the `isManager` flag.

**Success Criteria:**

- SC2.1 — `const meshPanelState: PanelState | null = isManager && items.length > 0 ? 'critical' : null`
- SC2.2 — When `isManager=true` and `items.length > 0`: `meshPanelState` is `'critical'`
- SC2.3 — When `isManager=true` and `items.length === 0`: `meshPanelState` is `null`
- SC2.4 — When `isManager=false` and `items.length > 0`: `meshPanelState` is `null` (no urgency for contributors)
- SC2.5 — When `isManager=false` and `items.length === 0`: `meshPanelState` is `null`

---

### FR3: Remove bg-background from root View className

The root View's `className` transitions from `"flex-1 bg-background"` to `"flex-1"`. The mesh component's internal `<Rect color="#0D0C14" />` maintains the dark background color.

**Success Criteria:**

- SC3.1 — Root View `className` does not contain the string `bg-background`
- SC3.2 — Root View `className` retains `flex-1`
- SC3.3 — Existing layout (header, ScrollView, RejectionSheet) renders correctly over the mesh with no visible layout shift

---

## Technical Design

### Files to Reference (no changes)

| File | Why |
|------|-----|
| `src/components/AnimatedMeshBackground.tsx` | Existing component — `panelState` prop, `StyleSheet.absoluteFill` canvas |
| `src/lib/panelState.ts` | `PanelState` type — re-exported from `reanimated-presets` |
| `src/lib/colors.ts` | Token reference only (desatCoral = #F87171, background = #0D0C14) |
| `src/hooks/useApprovalItems.ts` | Already imported in approvals.tsx — provides `items` array |
| `src/hooks/useConfig.ts` | Already imported — provides `isManager` flag |

### Files to Modify

#### `app/(tabs)/approvals.tsx`

Three changes, all surgical:

**1. Add import** (alongside existing component imports):
```tsx
import AnimatedMeshBackground from '@/src/components/AnimatedMeshBackground'
```

**2. Add derived value** (before `return`, after existing state declarations):
```tsx
const meshPanelState: PanelState | null =
  isManager && items.length > 0 ? 'critical' : null;
```

**3. Modify root View + add mesh as first child**:
```tsx
// Before:
<View className="flex-1 bg-background">

// After:
<View className="flex-1">
  <AnimatedMeshBackground panelState={meshPanelState} />
  {/* rest unchanged */}
```

### Data Flow

```
useConfig()        → isManager (boolean)
useApprovalItems() → items (ApprovalItem[])
                          │
                          ▼
          meshPanelState = isManager && items.length > 0
                            ? 'critical'
                            : null
                          │
                          ▼
          <AnimatedMeshBackground panelState={meshPanelState} />
                          │
                          ▼
          resolveNodeCColor('critical') → #F87171 (coral, Node C glow)
          resolveNodeCColor(null)       → #0D0C14 (idle, invisible Node C)
```

### Z-Order

```
root <View className="flex-1">
  [0] <AnimatedMeshBackground />          ← absoluteFill, pointerEvents=none, z=0
  [1] <View> Header                        ← z=1 (above mesh)
  [2] {teamError banner}                   ← z=2
  [3] <ScrollView>                         ← z=3 (all content above mesh)
  [4] <RejectionSheet />                   ← z=4 (modal, above all)
```

### Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `isManager=false`, items > 0 | `meshPanelState = null` → calm idle mesh (no false urgency for contributors) |
| `isManager=true`, items = 0 | `meshPanelState = null` → calm idle mesh (all clear state) |
| `isManager=true`, items loading (teamLoading=true) | `items = []` during load → `null` until data arrives (mesh starts calm, then re-renders once items load if any pending) |
| `config = null` (loading) | `isManager` expression: `config?.isManager === true` → false → `meshPanelState = null` |

### Test Strategy

**Source-level checks (fs.readFileSync):**
- `bg-background` absent from root View className
- `AnimatedMeshBackground` import present
- `meshPanelState` variable present
- `PanelState` type imported

**Runtime render tests (react-test-renderer):**
- Screen renders without crash for each role/item combination
- `AnimatedMeshBackground` mock is rendered (verify via testID or component tree)
- Existing content (header text, section labels) still renders

**Mock strategy:**
- `@shopify/react-native-skia` — project-level `__mocks__` auto-applied; extend locally for RadialGradient if needed
- `AnimatedMeshBackground` — use real component with mocked Skia (follows existing pattern in `AnimatedMeshBackground.test.tsx`)
- All existing mocks from `approvals.test.tsx` remain valid (useConfig, useMyRequests, useApprovalItems, etc.)
