# Spec Research: 01-approval-urgency-card

## Problem

When a manager has pending team approvals, the only signal on Home and Overview screens is
a small static badge on the Requests tab in the bottom navigation bar. This is trivially
easy to miss. This spec adds a prominent Liquid Glass "Action Required" card at the very
top of both screens when `pendingCount > 0`, with attention-catching animations.

## Key Files

| File | Role |
|------|------|
| `src/components/ApprovalUrgencyCard.tsx` | New component — create |
| `src/components/GlassCard.tsx` | Reference: glass layer stack + props |
| `src/components/AnimatedPressable.tsx` | CTA button wrapper |
| `src/lib/colors.ts` | Color tokens |
| `src/lib/reanimated-presets.ts` | Spring/timing presets |
| `src/hooks/useApprovalItems.ts` | Provides pendingCount (items.length) |
| `app/(tabs)/index.tsx` | Home screen — insert card |
| `app/(tabs)/overview.tsx` | Overview screen — insert card |

## Architectural Decisions

### Component design

`ApprovalUrgencyCard` is a self-contained component with:
- **GlassCard** (elevated=true, borderAccentColor=colors.desatCoral) for the glass surface
- **Breathing animation** — Reanimated 4 CSS animation API: `animationName`, `animationDuration: '1500ms'`, `animationTimingFunction: 'ease-in-out'`, `animationIterationCount: 'infinite'`, `animationDirection: 'alternate'`. Scale oscillates 1.0 → 1.02 (subtle, not jarring).
- **Pulsing border ring** — Absolutely positioned `Animated.View` with `borderColor=colors.desatCoral, borderWidth=1.5, borderRadius=18` (= card radius + 2). Opacity loops 0.35 → 1.0 → 0.35 via `withRepeat(withTiming(...), -1, true)`.
- **useReducedMotion** — gates breathing (scale stays 1) and pulse (opacity stays 0.6).

### Insertion points

**Home screen (`app/(tabs)/index.tsx`):**
Rendered as the first child of the ScrollView content, before Zone 1 (hero panel).
No stagger animation — it appears instantly (its presence/absence is the signal).
Gated with `isManager && items.length > 0`.

**Overview screen (`app/(tabs)/overview.tsx`):**
Same — first child of ScrollView content, before OverviewHeroCard.
Gated with `isManager && items.length > 0`.

### useApprovalItems call

Both screens call `useApprovalItems()`. TanStack Query deduplicates the fetch — the data
is already fetched by `_layout.tsx`. The hook call on each screen just reads from cache
with zero additional network cost.

### Navigation

`onPress` prop: the caller passes `() => router.push('/(tabs)/approvals')`.
Expo Router navigation from Home/Overview to Requests tab.

### Reanimated 4 CSS Animation API

Reanimated 4 introduced CSS-style animations that can be applied directly as style props:

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
} as const;
```

When `reducedMotion` is true, pass `{}` instead of `breathingStyle` to disable.
The pulsing border ring uses `withRepeat(withTiming(...), -1, true)` (SharedValue loop),
gated via `if (!reducedMotion)` in a `useEffect`.

## Interface Contracts

### ApprovalUrgencyCard (new component)

```typescript
// src/components/ApprovalUrgencyCard.tsx

interface ApprovalUrgencyCardProps {
  pendingCount: number;  // ← items.length from useApprovalItems() — must be > 0
  onPress: () => void;   // ← () => router.push('/(tabs)/approvals')
}

export function ApprovalUrgencyCard({ pendingCount, onPress }: ApprovalUrgencyCardProps): JSX.Element
```

**Source table:**
| Field | Source |
|-------|--------|
| pendingCount | `items.length` from `useApprovalItems()` on calling screen |
| onPress | Passed by caller: `() => router.push('/(tabs)/approvals')` |

### Change to app/(tabs)/index.tsx

New lines added (not modifying existing):
```typescript
// New import
import { ApprovalUrgencyCard } from '@/src/components/ApprovalUrgencyCard';

// New hook call (after existing hooks)
const { items: approvalItems } = useApprovalItems();

// New JSX (first child of ScrollView content)
{isManager && approvalItems.length > 0 && (
  <ApprovalUrgencyCard
    pendingCount={approvalItems.length}
    onPress={() => router.push('/(tabs)/approvals')}
  />
)}
```

**Source table for home screen changes:**
| Field | Source |
|-------|--------|
| isManager | Existing: `config?.isManager === true \|\| config?.devManagerView === true` |
| approvalItems.length | `useApprovalItems()` — TanStack Query cached, no extra fetch |
| router | Existing: `useRouter()` |

### Change to app/(tabs)/overview.tsx

Mirror of home screen. New imports + hook call + JSX insertion at top of scroll content.

## Card Layout (visual)

```
╔═══════════════════════════════════════╗   ← pulsing coral border ring
║                                       ║
║  ⏰ ACTION REQUIRED            [  3  ]  ║  ← icon + section label + count badge
║  3 Pending Team Requests              ║  ← title (count-aware pluralization)
║  Review before end of week            ║  ← subtitle
║                                       ║
║  ┌───────────────────────────────┐    ║
║  │         Review Now            │    ║  ← CTA button (desatCoral bg)
║  └───────────────────────────────┘    ║
║                                       ║
╚═══════════════════════════════════════╝
```

### Color tokens used

| Token | Usage |
|-------|-------|
| `colors.desatCoral` | Border ring, icon, count badge bg, CTA button bg |
| `colors.background` | CTA button text |
| `colors.textPrimary` | Title text |
| `colors.textSecondary` | Subtitle text |

All sourced from `src/lib/colors.ts`. No hardcoded hex.

## Test Plan

### FR1: ApprovalUrgencyCard renders correctly

**Happy Path:**
- [ ] Renders with pendingCount=1: text "1 Pending Team Request" (singular)
- [ ] Renders with pendingCount=3: text "3 Pending Team Requests" (plural)
- [ ] Count badge shows correct number
- [ ] "Review Now" CTA button visible

**Edge Cases:**
- [ ] Does not render with pendingCount=0 (caller gates, but component is defensive)

### FR2: Home screen shows card when isManager && pending > 0

**Happy Path:**
- [ ] Card renders as first ScrollView child when isManager=true, items.length=2
- [ ] Card does NOT render when isManager=true, items.length=0
- [ ] Card does NOT render when isManager=false, items.length=2

### FR3: Overview screen shows card when isManager && pending > 0

**Happy Path (mirror of FR2):**
- [ ] Card renders as first ScrollView child when isManager=true, items.length=1
- [ ] Card does NOT render when isManager=true, items.length=0

### FR4: Breathing animation gated on useReducedMotion

**Happy Path:**
- [ ] When reducedMotion=false: breathingStyle applied (scale oscillates)
- [ ] When reducedMotion=true: no breathing animation (scale stays 1)

**Note:** Animation values are tested via mock verification — actual animated values
require a running runtime to observe.

### FR5: onPress navigates to Requests tab

**Happy Path:**
- [ ] Pressing "Review Now" calls onPress prop
- [ ] onPress prop is called with no arguments

## Mocks Needed

- `@shopify/react-native-skia` — already mocked
- `expo-haptics` — already mocked
- `react-native-gesture-handler` — already mocked
- `expo-linear-gradient` — check; may need minimal mock for GlassCard's LinearGradient
- `src/hooks/useApprovalItems` — mock to return `{ items: [...], isLoading: false, ... }`
- `expo-router` — mock `useRouter()` to return `{ push: jest.fn() }`

## Files to Create/Modify

- **Create**: `src/components/ApprovalUrgencyCard.tsx`
- **Modify**: `app/(tabs)/index.tsx` — import + hook + JSX
- **Modify**: `app/(tabs)/overview.tsx` — import + hook + JSX
