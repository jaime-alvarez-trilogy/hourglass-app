# 01-approval-urgency-card

**Status:** Draft
**Created:** 2026-03-24
**Last Updated:** 2026-03-24
**Owner:** @trilogy

---

## Overview

### What

This spec adds a prominent "Action Required" Liquid Glass card (`ApprovalUrgencyCard`) that
appears at the very top of the Home and Overview screens whenever a manager has pending team
approvals. The card replaces the silent tab-bar badge as the primary visual signal for pending
approvals.

### Why

The existing pending-approval indicator is a static count badge on the Requests tab icon. It
is trivially easy to miss, particularly when the screen is focused on hours or earnings data.
Managers risk missing end-of-week approval deadlines because the signal is too subtle.

### How

A new `src/components/ApprovalUrgencyCard.tsx` component is created. It wraps `GlassCard`
(elevated, coral border accent) with two simultaneous attention mechanisms:

1. **Breathing scale animation** — Reanimated 4 CSS animation API oscillates card scale
   between 1.0 and 1.02 on a 1500ms ease-in-out cycle.
2. **Pulsing border ring** — An absolutely-positioned `Animated.View` whose opacity loops
   0.35 → 1.0 via `withRepeat(withTiming(...), -1, true)`.

Both animations are gated by `useReducedMotion()` from `react-native-reanimated` for
accessibility.

The card is inserted as the **first ScrollView child** on both `app/(tabs)/index.tsx` and
`app/(tabs)/overview.tsx`, gated by `isManager && approvalItems.length > 0`.
`useApprovalItems()` is already called by `_layout.tsx` for the tab badge — TanStack Query
deduplicates the fetch so there is no additional network cost.

The "Review Now" CTA calls the `onPress` prop, which is wired by each screen to
`router.push('/(tabs)/approvals')`.

---

## Out of Scope

1. **Mesh urgency signal** — Deferred to `02-mesh-urgency-signal`. Changing Node C color
   and adding a 4th floor-glow node in `AnimatedMeshBackground` is a separate spec. This
   spec only adds the card, not mesh-level signaling.

2. **Tab bar floor glow** — Deferred to `02-mesh-urgency-signal`. The 4th Skia
   `RadialGradient` node at the Requests tab position is part of the mesh spec.

3. **Dismissibility / snooze** — Descoped. The card is a persistent signal while
   `pendingCount > 0`. No dismiss button, no snooze state.

4. **Card stagger animation** — Descoped. The card appears instantly (presence/absence IS
   the signal). Adding a stagger would require coordinating with existing zone-entry
   animations — not worth the complexity for a card that should demand immediate attention.

5. **Per-approval item list inside card** — Descoped. The card is a count + CTA only.
   Detailed approval items are on the Requests tab, which the CTA navigates to.

6. **Deadline countdown in card** — Descoped. End-of-week deadline text ("Review before
   end of week") is static. Dynamic countdown is part of the UrgencyBanner system, not
   this card.

7. **Android-specific pulse implementation** — Descoped. `withRepeat(withTiming)` works
   on both platforms. No platform-specific branch needed.

---

## Functional Requirements

### FR1: ApprovalUrgencyCard component renders correctly

The component accepts `pendingCount: number` and `onPress: () => void` and renders a
structured card with all required elements.

**Success Criteria:**
- SC1.1 — Renders without crash for `pendingCount=1`
- SC1.2 — Renders without crash for `pendingCount=3`
- SC1.3 — Displays singular "1 Pending Team Request" for `pendingCount=1`
- SC1.4 — Displays plural "3 Pending Team Requests" for `pendingCount=3`
- SC1.5 — Displays the count value in the badge element
- SC1.6 — Renders "Review Now" CTA text
- SC1.7 — Renders "ACTION REQUIRED" label text
- SC1.8 — Renders subtitle "Review before end of week"
- SC1.9 — Source uses `GlassCard` with `elevated={true}` and
  `borderAccentColor={colors.desatCoral}`
- SC1.10 — Source uses `padding='md'` and `radius='2xl'` on GlassCard
- SC1.11 — Renders without crash for `pendingCount=0` (caller gates but component
  is defensive — no crash)

### FR2: Home screen shows card when `isManager && pending > 0`

`app/(tabs)/index.tsx` imports `ApprovalUrgencyCard`, calls `useApprovalItems()`, and
conditionally renders the card as the first ScrollView child.

**Success Criteria:**
- SC2.1 — Source imports `ApprovalUrgencyCard` from `@/src/components/ApprovalUrgencyCard`
- SC2.2 — Source imports `useApprovalItems` from `@/src/hooks/useApprovalItems`
- SC2.3 — Source contains conditional rendering gated by `isManager` and
  `approvalItems.length > 0`
- SC2.4 — Source passes `pendingCount={approvalItems.length}` to the card
- SC2.5 — Source passes `onPress={() => router.push('/(tabs)/approvals')}` to the card
- SC2.6 — Card renders when `isManager=true` and `items.length > 0`
- SC2.7 — Card does NOT render when `items.length === 0`
- SC2.8 — Card does NOT render when `isManager=false`

### FR3: Overview screen shows card when `isManager && pending > 0`

`app/(tabs)/overview.tsx` receives identical changes to Home — mirror of FR2.

**Success Criteria:**
- SC3.1 — Source imports `ApprovalUrgencyCard` from `@/src/components/ApprovalUrgencyCard`
- SC3.2 — Source imports `useApprovalItems` from `@/src/hooks/useApprovalItems`
- SC3.3 — Source contains conditional rendering gated by `isManager` and
  `approvalItems.length > 0`
- SC3.4 — Source passes `pendingCount={approvalItems.length}` to the card
- SC3.5 — Source passes `onPress={() => router.push('/(tabs)/approvals')}` to the card

### FR4: Breathing animation gated on `useReducedMotion`

When `useReducedMotion()` returns `false`, the breathing CSS animation is applied to the
card's Animated.View wrapper. When it returns `true`, no scale animation is applied.

**Success Criteria:**
- SC4.1 — Source imports `useReducedMotion` from `react-native-reanimated`
- SC4.2 — Source applies `animationName` with `from: { transform: [{ scale: 1 }] }` and
  `to: { transform: [{ scale: 1.02 }] }` (breathing style)
- SC4.3 — Source uses `animationDuration: '1500ms'`
- SC4.4 — Source uses `animationTimingFunction: 'ease-in-out'`
- SC4.5 — Source uses `animationIterationCount: 'infinite'`
- SC4.6 — Source uses `animationDirection: 'alternate'`
- SC4.7 — When `reducedMotion=true`, breathing style is NOT applied (empty object or no
  animation style passed to the Animated.View)
- SC4.8 — Source gates the pulsing border animation via `if (!reducedMotion)` (or
  equivalent) in a `useEffect`

### FR5: `onPress` navigates to Requests tab

Pressing "Review Now" invokes the `onPress` prop with no arguments.

**Success Criteria:**
- SC5.1 — Pressing the CTA (or the card's pressable area) calls `onPress` exactly once
- SC5.2 — `onPress` is called with no arguments (or only the native event — caller ignores
  it)
- SC5.3 — Source wires `onPress` to the `AnimatedPressable` (or equivalent pressable
  element) for the "Review Now" CTA

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/components/GlassCard.tsx` | Glass surface wrapper — use `GlassCard` with `elevated=true`, `borderAccentColor=colors.desatCoral`, `padding='md'`, `radius='2xl'` |
| `src/components/AnimatedPressable.tsx` | CTA "Review Now" button — wraps Pressable with scale-down animation |
| `src/components/SectionLabel.tsx` | "ACTION REQUIRED" uppercase tracking label |
| `src/lib/colors.ts` | `colors.desatCoral` (#F87171), `colors.background`, `colors.textPrimary`, `colors.textSecondary` |
| `src/lib/reanimated-presets.ts` | Spring/timing presets — may use for border pulse timing |
| `src/hooks/useApprovalItems.ts` | Provides `items: ApprovalItem[]` — `items.length` is `pendingCount` |
| `app/(tabs)/index.tsx` | Home screen — insertion point |
| `app/(tabs)/overview.tsx` | Overview screen — insertion point |

### Files to Create

| File | Description |
|------|-------------|
| `src/components/ApprovalUrgencyCard.tsx` | New component |

### Files to Modify

| File | Change |
|------|--------|
| `app/(tabs)/index.tsx` | Add import, `useApprovalItems` call, conditional card JSX |
| `app/(tabs)/overview.tsx` | Mirror of index.tsx changes |

### Component Architecture

```
ApprovalUrgencyCard
├── Animated.View (breathing scale via Reanimated 4 CSS animation API)
│   ├── Animated.View (absolute positioned pulsing border ring)
│   │   └── (opacity SharedValue loop via withRepeat + withTiming)
│   └── GlassCard (elevated=true, borderAccentColor=desatCoral, padding='md', radius='2xl')
│       ├── View (header row)
│       │   ├── Ionicons "time-outline" (20px, desatCoral)
│       │   ├── SectionLabel "ACTION REQUIRED"
│       │   └── View (badge: desatCoral/20 bg)
│       │       └── Text (pendingCount)
│       ├── Text (title: "N Pending Team Request(s)")
│       ├── Text (subtitle: "Review before end of week")
│       └── AnimatedPressable (onPress prop)
│           └── Text "Review Now"
```

### Data Flow

```
app/(tabs)/index.tsx          app/(tabs)/overview.tsx
  useApprovalItems()     <->    useApprovalItems()
  (TanStack cache hit)          (TanStack cache hit)
        |                              |
   items.length                   items.length
        |                              |
  isManager && count > 0        isManager && count > 0
        |                              |
  <ApprovalUrgencyCard          <ApprovalUrgencyCard
    pendingCount={n}              pendingCount={n}
    onPress={-> approvals} />     onPress={-> approvals} />
```

### Animation Design

**Breathing (Reanimated 4 CSS animation API):**
```typescript
const breathingStyle = {
  animationName: {
    from: { transform: [{ scale: 1 }] },
    to:   { transform: [{ scale: 1.02 }] },
  },
  animationDuration: '1500ms',
  animationTimingFunction: 'ease-in-out',
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
};
// Applied only when !reducedMotion
```

**Pulsing border ring (RN Animated SharedValue loop):**
```typescript
const pulseOpacity = useSharedValue(0.35);
useEffect(() => {
  if (!reducedMotion) {
    pulseOpacity.value = withRepeat(
      withTiming(1.0, { duration: 1200 }),
      -1,
      true,
    );
  }
}, [reducedMotion]);
```

**Border ring geometry:**
- `borderRadius: 18` (= GlassCard '2xl' radius 16 + 2px outset)
- `borderWidth: 1.5`
- `borderColor: colors.desatCoral`
- Absolute fill over GlassCard with small negative margin to create outset ring

### Card Layout Tokens

```
GlassCard props:
  elevated={true}           -> blur radius 20 (elevated)
  borderAccentColor={colors.desatCoral}  -> #F87171
  padding='md'              -> 20px internal padding
  radius='2xl'              -> borderRadius 16

Header row:
  gap: 8px between icon, label, badge
  badge: backgroundColor = colors.desatCoral + '33' (20% alpha)
  badge padding: horizontal 8px, vertical 2px, borderRadius 8

Title: font-display, textPrimary, 16px
Subtitle: font-sans, textSecondary, 13px, marginTop 4

CTA button:
  AnimatedPressable wrapping View
  backgroundColor: colors.desatCoral
  borderRadius: 10, paddingVertical: 12
  Text: "Review Now", textPrimary, font-sans-semibold
  marginTop: 16
```

### Pluralization Logic

```typescript
const label = pendingCount === 1
  ? `${pendingCount} Pending Team Request`
  : `${pendingCount} Pending Team Requests`;
```

### isManager Derivation (Home and Overview screens)

```typescript
// Already exists in index.tsx — confirm pattern matches:
const isManager = config?.isManager === true || config?.devManagerView === true;
```

If `devManagerView` is not already present on the config type in the file, use only
`config?.isManager === true`. The primary check is `isManager`.

### Edge Cases

| Case | Behavior |
|------|----------|
| `pendingCount=0` | Caller gates with `> 0` check; component still renders safely (shows "0 Pending Team Requests") |
| `reducedMotion=true` | No breathing, border opacity static at 0.35 or 0.6 |
| Config not loaded | `isManager` defaults to falsy -> card hidden (safe) |
| `items` empty array | `items.length === 0` -> card hidden |
| Landscape / large screen | GlassCard is full-width with `mx` padding from parent scroll view — no explicit width needed |

### Mock Strategy (Tests)

| Module | Mock Approach |
|--------|---------------|
| `@shopify/react-native-skia` | Already in `__mocks__/@shopify/` |
| `expo-linear-gradient` | Already in `__mocks__/expo-linear-gradient.ts` |
| `react-native-reanimated` | Jest preset provides mock; `useReducedMotion` returns `false` by default |
| `src/hooks/useApprovalItems` | `jest.mock('@/src/hooks/useApprovalItems', () => ({ useApprovalItems: () => ({ items: [...], isLoading: false }) }))` |
| `expo-router` | `jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))` |
| `@expo/vector-icons` | `jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))` |
