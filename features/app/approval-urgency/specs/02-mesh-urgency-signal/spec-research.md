# Spec Research: 02-mesh-urgency-signal

## Problem

The ambient mesh on Home and Overview screens currently responds to hours urgency
(earningsPace). Pending approvals need their own mesh signal — and that signal should
escalate over the week: amber early in the week, coral Thursday onwards when approvals
must be reviewed before end-of-week (Crossover week ends Sunday midnight UTC).

Additionally, a 4th "floor glow" Skia node in AnimatedMeshBackground, positioned at the
Requests tab location (bottom-right), will pulse behind the NativeTabs glass bar. Because
NativeTabs uses UIGlassEffect on iOS 26, this ambient glow refracts through the frosted
glass — the Requests tab visually glows without touching any native tab bar code.

## Key Files

| File | Role |
|------|------|
| `src/lib/approvalMeshSignal.ts` | New: getApprovalMeshState() pure helper |
| `src/components/AnimatedMeshBackground.tsx` | Add pendingApprovals prop + 4th node |
| `app/(tabs)/index.tsx` | Pass approval mesh state to AnimatedMeshBackground |
| `app/(tabs)/overview.tsx` | Pass approval mesh state to AnimatedMeshBackground |
| `src/lib/panelState.ts` | PanelState type — 'behind' (amber), 'critical' (coral) |
| `src/lib/colors.ts` | Color tokens for floor node |

## Architectural Decisions

### Time-aware signal: getApprovalMeshState

```typescript
// src/lib/approvalMeshSignal.ts

import type { PanelState } from '@/src/lib/panelState';

/**
 * Computes the ambient mesh panelState for pending approval urgency.
 *
 * Signal priority over earningsPace when pending > 0:
 *   Mon (1), Tue (2), Wed (3) → 'behind' → warnAmber (#FCD34D)  [early week]
 *   Thu (4), Fri (5), Sat (6), Sun (0) → 'critical' → desatCoral (#F87171) [end of week]
 *
 * When pendingCount === 0: returns null → earningsPace drives Node C normally.
 *
 * Week boundary: Mon-Sun UTC (Crossover standard, same as payments API).
 */
export function getApprovalMeshState(
  pendingCount: number,
  now: Date = new Date(),
): PanelState | null {
  if (pendingCount === 0) return null;
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const isEndOfWeek = day === 0 || day >= 4;
  return isEndOfWeek ? 'critical' : 'behind';
}
```

This is a pure function with no side effects. Easily testable.

### How panelState overrides earningsPace in the mesh

`AnimatedMeshBackground.resolveNodeCColor()` already uses priority:
```
panelState (if provided) → earningsPace → aiPct → background (invisible)
```

So passing `panelState` when pending > 0 automatically overrides earningsPace. When
pending = 0, we pass `panelState={null}` (or omit it) and earningsPace takes over again.

### Change to Home/Overview mesh call

```typescript
// Before (existing):
<AnimatedMeshBackground earningsPace={earningsPaceSignal} />

// After:
const approvalMeshState = getApprovalMeshState(approvalItems.length);
<AnimatedMeshBackground
  panelState={approvalMeshState}
  earningsPace={approvalMeshState === null ? earningsPaceSignal : null}
/>
```

When `approvalMeshState !== null`: panelState wins, earningsPace is suppressed.
When `approvalMeshState === null`: earningsPace drives Node C (normal behavior).

**Note:** `approvalItems` from `useApprovalItems()` was already added to these screens
in spec 01-approval-urgency-card. This spec builds on that — no duplicate hook call.

### 4th "floor glow" node in AnimatedMeshBackground

A new static Skia `Circle` node (no orbital movement) positioned at the Requests tab
location. Radius pulses via a Reanimated SharedValue loop to create ambient breathing.

**Positioning:**
- Requests tab is the 4th of 4 visible tabs (index 3 out of 0–3)
- x = `w * 0.875` (7/8 of screen width, quarter = 0.125, centers = 0.125, 0.375, 0.625, 0.875)
- y = `h` (at the very bottom — gradient falls off toward tab bar)

**Node properties:**
- Color: same resolved color as panelState (coral or amber) — using `hexToRgba(pendingHex, 0.30)`
- Radius: pulses `w * 0.20 → w * 0.32` over 2000ms (withRepeat, autoReverse)
- Blend: `BlendMode.Screen` (same as other nodes)
- Conditional: only rendered when `pendingApprovals > 0`

**Why opacity lower (0.30 vs 0.22 for other nodes):**
The floor node is localized at the tab bar. Higher opacity would be too aggressive on
screen content. 0.30 creates just enough glow to refract through the glass tab bar.

### New prop on AnimatedMeshBackground

```typescript
export interface AnimatedMeshBackgroundProps {
  panelState?: PanelState | null;
  earningsPace?: number | null;
  aiPct?: number | null;
  pendingApprovals?: number | null;  // NEW: count drives floor glow node
}
```

The component resolves the floor node color from `pendingApprovals > 0`:
- Use `resolveNodeCColor(panelState, earningsPace, aiPct)` for Node C hex
- Floor node uses same color as Node C when visible — signal coherence

Actually, to decouple floor color from Node C: the floor node should always show the
current urgency color (coral or amber based on time), independent of whether panelState
is overriding Node C. Use a separate color resolver:

```typescript
function resolveFloorGlowColor(pendingApprovals: number | null | undefined): string | null {
  if (!pendingApprovals || pendingApprovals <= 0) return null;
  const day = new Date().getUTCDay();
  const isEndOfWeek = day === 0 || day >= 4;
  return isEndOfWeek ? colors.desatCoral : colors.warnAmber;
}
```

This is a pure color resolver inside AnimatedMeshBackground (no import of approvalMeshSignal
to avoid circular deps — it's a simple inline calculation).

## Interface Contracts

### getApprovalMeshState (new pure function)

```typescript
// src/lib/approvalMeshSignal.ts
export function getApprovalMeshState(
  pendingCount: number,
  now?: Date,
): PanelState | null
```

**Inputs:**
| Param | Type | Source |
|-------|------|--------|
| pendingCount | number | `items.length` from `useApprovalItems()` |
| now | Date (optional) | `new Date()` — injectable for testing |

**Outputs:**
| Value | Condition | Mesh effect |
|-------|-----------|-------------|
| null | pendingCount === 0 | earningsPace drives Node C normally |
| 'behind' | pending > 0, Mon-Wed UTC | warnAmber (#FCD34D) on Node C |
| 'critical' | pending > 0, Thu-Sun UTC | desatCoral (#F87171) on Node C |

### AnimatedMeshBackgroundProps (updated)

```typescript
export interface AnimatedMeshBackgroundProps {
  panelState?: PanelState | null;      // existing
  earningsPace?: number | null;        // existing
  aiPct?: number | null;               // existing
  pendingApprovals?: number | null;    // NEW: > 0 triggers floor glow node
}
```

**Source table for new prop:**
| Field | Source |
|-------|--------|
| pendingApprovals | `approvalItems.length` from `useApprovalItems()` on calling screen |

### Floor node in AnimatedMeshBackground (new internal)

```typescript
// Internal to AnimatedMeshBackground — not exported

const FLOOR_NODE_X_RATIO = 0.875;   // Requests tab: 4th of 4 tabs
const FLOOR_PULSE_MIN = 0.20;       // radius = w * 0.20 (min)
const FLOOR_PULSE_MAX = 0.32;       // radius = w * 0.32 (max)
const FLOOR_PULSE_DURATION = 2000;  // ms per pulse half-cycle
const FLOOR_GLOW_ALPHA = 0.30;      // inner gradient alpha

// Derived values
const floorX = w * FLOOR_NODE_X_RATIO;
const floorY = h;  // positioned at very bottom, gradient falloff covers tab bar

// Pulsing radius SharedValue
const floorPulse = useSharedValue(0);
// useEffect: withRepeat(withTiming(1, { duration: FLOOR_PULSE_DURATION }), -1, true)

const floorRadius = useDerivedValue(() => {
  return w * (FLOOR_PULSE_MIN + (FLOOR_PULSE_MAX - FLOOR_PULSE_MIN) * floorPulse.value);
});
const floorCenter = useDerivedValue(() => ({ x: floorX, y: floorY }));
```

### Change to Home screen (app/(tabs)/index.tsx)

Builds on spec 01 which already added `const { items: approvalItems } = useApprovalItems()`.
This spec adds:

```typescript
// New import
import { getApprovalMeshState } from '@/src/lib/approvalMeshSignal';

// New derived (in component body)
const approvalMeshState = getApprovalMeshState(approvalItems.length);

// Updated AnimatedMeshBackground call
<AnimatedMeshBackground
  panelState={approvalMeshState}
  earningsPace={approvalMeshState === null ? earningsPaceSignal : null}
  pendingApprovals={approvalItems.length}
/>
```

### Change to Overview screen (app/(tabs)/overview.tsx)

Mirror of Home screen pattern.

## Test Plan

### FR1: getApprovalMeshState pure function

**Happy Path:**
- [ ] `getApprovalMeshState(0)` → null (any day)
- [ ] `getApprovalMeshState(1, monday)` → 'behind'
- [ ] `getApprovalMeshState(1, tuesday)` → 'behind'
- [ ] `getApprovalMeshState(1, wednesday)` → 'behind'
- [ ] `getApprovalMeshState(1, thursday)` → 'critical'
- [ ] `getApprovalMeshState(1, friday)` → 'critical'
- [ ] `getApprovalMeshState(1, saturday)` → 'critical'
- [ ] `getApprovalMeshState(1, sunday)` → 'critical'
- [ ] `getApprovalMeshState(5, friday)` → 'critical' (count > 1)

**Edge Cases:**
- [ ] `getApprovalMeshState(0, thursday)` → null (count is 0, time doesn't matter)

### FR2: Home screen passes correct props to AnimatedMeshBackground

**Happy Path:**
- [ ] When `approvalItems.length > 0` on Monday: `panelState='behind'`, `earningsPace=null`
- [ ] When `approvalItems.length > 0` on Friday: `panelState='critical'`, `earningsPace=null`
- [ ] When `approvalItems.length === 0`: `panelState=null`, `earningsPace=earningsPaceSignal`
- [ ] `pendingApprovals={approvalItems.length}` always passed

### FR3: Overview screen passes correct props (mirror of FR2)

### FR4: AnimatedMeshBackground renders floor glow node when pendingApprovals > 0

**Happy Path:**
- [ ] Floor glow Circle renders when `pendingApprovals > 0`
- [ ] Floor glow Circle does NOT render when `pendingApprovals=0` or undefined
- [ ] Floor node is positioned at `cx = w * 0.875`, `cy = h`

**Edge Cases:**
- [ ] `pendingApprovals=null` → no floor node
- [ ] `pendingApprovals=0` → no floor node

### FR5: resolveFloorGlowColor returns correct color by day

**Happy Path:**
- [ ] Monday → warnAmber (#FCD34D)
- [ ] Thursday → desatCoral (#F87171)
- [ ] Sunday → desatCoral (#F87171)
- [ ] count=0 (any day) → null (no color)

## Mocks Needed

- `@shopify/react-native-skia` — already mocked at `__mocks__/@shopify/react-native-skia.ts`
- `src/lib/approvalMeshSignal` — use real function (pure, no side effects)
- Date: inject `now` parameter to `getApprovalMeshState` for deterministic day testing

## Files to Create/Modify

- **Create**: `src/lib/approvalMeshSignal.ts` — getApprovalMeshState() pure function
- **Modify**: `src/components/AnimatedMeshBackground.tsx` — new prop + floor glow node + pulse
- **Modify**: `app/(tabs)/index.tsx` — import signal fn + updated mesh call
- **Modify**: `app/(tabs)/overview.tsx` — import signal fn + updated mesh call
