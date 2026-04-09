# 02-mesh-urgency-signal

**Status:** Ready for implementation
**Created:** 2026-03-24
**Last Updated:** 2026-03-24
**Owner:** @trilogy

---

## Overview

Spec 01 (approval-urgency-card) already surfaces a visible card when approvals are pending.
This spec adds two lower-level ambient signals that reinforce urgency without requiring the
user to notice the card:

1. **Time-aware mesh panelState override** — When `approvalItems.length > 0`, Home and
   Overview pass `panelState` to `AnimatedMeshBackground` instead of `earningsPace`. The
   state is derived from UTC day: Mon-Wed → `'behind'` (warnAmber #FCD34D), Thu-Sun →
   `'critical'` (desatCoral #F87171). When the queue clears, earningsPace resumes.

2. **4th floor glow node** — A new static Skia `Circle` in `AnimatedMeshBackground`
   positioned at the Requests tab location (x = w × 0.875, y = h). Its radius pulses
   via a Reanimated SharedValue loop. Because NativeTabs uses UIGlassEffect on iOS 26,
   this glow node refracts through the frosted glass — the Requests tab visually glows
   without touching any native tab bar code.

### New File

`src/lib/approvalMeshSignal.ts` — exports `getApprovalMeshState(pendingCount, now?)`, a
pure function with injectable `now` for deterministic testing. No side effects.

### Modified Files

- `src/components/AnimatedMeshBackground.tsx` — new `pendingApprovals` prop + 4th floor node
- `app/(tabs)/index.tsx` — import signal fn + updated `AnimatedMeshBackground` call
- `app/(tabs)/overview.tsx` — mirror of index.tsx changes

---

## Out of Scope

1. **Descoped:** Floor glow refraction on Android — NativeTabs UIGlassEffect is iOS 26 only.
   The 4th node still renders on Android but the tab bar does not refract it. This is
   acceptable behaviour and not a regression.

2. **Descoped:** Animation changes to existing orbital nodes A, B, C — they are unchanged
   in timing, amplitude, and phase. Only the 4th floor node is new.

3. **Descoped:** Tab badge count — the static badge on the Requests tab icon is implemented
   in `app/(tabs)/_layout.tsx` and is not touched by this spec.

4. **Descoped:** Manager-only gating on floor glow — `useApprovalItems()` already returns
   an empty array for non-managers (the hook gates on manager role internally), so
   `pendingApprovals` will be 0 for contributors. No explicit `isManager` check needed in
   `AnimatedMeshBackground`.

5. **Descoped:** Notification escalation for end-of-week deadlines — out of scope for all
   approval-urgency specs.

---

## Functional Requirements

### FR1: `getApprovalMeshState` pure function

**File:** `src/lib/approvalMeshSignal.ts` (new)

A pure function that maps pending count + UTC day to a `PanelState | null`.

```typescript
export function getApprovalMeshState(
  pendingCount: number,
  now: Date = new Date(),
): PanelState | null
```

**Logic:**
- `pendingCount === 0` → `null` (earningsPace drives Node C normally)
- `pendingCount > 0`, UTC day Mon(1) / Tue(2) / Wed(3) → `'behind'`
- `pendingCount > 0`, UTC day Thu(4) / Fri(5) / Sat(6) / Sun(0) → `'critical'`

**Success Criteria:**
- SC1.1 — `getApprovalMeshState(0)` returns `null` regardless of `now`
- SC1.2 — `getApprovalMeshState(1, monday)` returns `'behind'` (UTC Monday)
- SC1.3 — `getApprovalMeshState(1, tuesday)` returns `'behind'`
- SC1.4 — `getApprovalMeshState(1, wednesday)` returns `'behind'`
- SC1.5 — `getApprovalMeshState(1, thursday)` returns `'critical'`
- SC1.6 — `getApprovalMeshState(1, friday)` returns `'critical'`
- SC1.7 — `getApprovalMeshState(1, saturday)` returns `'critical'`
- SC1.8 — `getApprovalMeshState(1, sunday)` returns `'critical'`
- SC1.9 — `getApprovalMeshState(5, friday)` returns `'critical'` (count > 1 still critical)
- SC1.10 — `getApprovalMeshState(0, thursday)` returns `null` (zero count wins regardless of day)
- SC1.11 — Function is a pure export with no side effects; `now` is injectable

---

### FR2: Home screen mesh wiring

**File:** `app/(tabs)/index.tsx` (modify)

Builds on spec 01 which already added `const { items: approvalItems } = useApprovalItems()`.

Adds:
```typescript
import { getApprovalMeshState } from '@/src/lib/approvalMeshSignal';

const approvalMeshState = getApprovalMeshState(approvalItems.length);
```

Updates `AnimatedMeshBackground` call from:
```typescript
<AnimatedMeshBackground earningsPace={earningsPaceSignal} />
```
to:
```typescript
<AnimatedMeshBackground
  panelState={approvalMeshState}
  earningsPace={approvalMeshState === null ? earningsPaceSignal : null}
  pendingApprovals={approvalItems.length}
/>
```

**Success Criteria:**
- SC2.1 — Source imports `getApprovalMeshState` from `@/src/lib/approvalMeshSignal`
- SC2.2 — Source derives `approvalMeshState` from `getApprovalMeshState(approvalItems.length)`
- SC2.3 — When `approvalItems.length > 0` (Mon): `panelState='behind'`, `earningsPace=null`
- SC2.4 — When `approvalItems.length > 0` (Fri): `panelState='critical'`, `earningsPace=null`
- SC2.5 — When `approvalItems.length === 0`: `panelState=null`, `earningsPace=earningsPaceSignal`
- SC2.6 — `pendingApprovals={approvalItems.length}` always passed to `AnimatedMeshBackground`
- SC2.7 — `useApprovalItems` is NOT called a second time (spec 01 already added it)

---

### FR3: Overview screen mesh wiring

**File:** `app/(tabs)/overview.tsx` (modify)

Mirror of FR2. Spec 01 already added `const { items: approvalItems } = useApprovalItems()`.

Same import, derived value, and updated `AnimatedMeshBackground` call as FR2.

**Success Criteria:**
- SC3.1 — Source imports `getApprovalMeshState` from `@/src/lib/approvalMeshSignal`
- SC3.2 — Source derives `approvalMeshState` from `getApprovalMeshState(approvalItems.length)`
- SC3.3 — `AnimatedMeshBackground` receives `panelState`, `earningsPace` (conditional), and `pendingApprovals`
- SC3.4 — When `approvalItems.length === 0`: `earningsPace` propagated, `panelState=null`
- SC3.5 — `pendingApprovals={approvalItems.length}` always passed

---

### FR4: AnimatedMeshBackground floor glow node

**File:** `src/components/AnimatedMeshBackground.tsx` (modify)

Adds a new `pendingApprovals?: number | null` prop to `AnimatedMeshBackgroundProps`.

When `pendingApprovals > 0`, renders a 4th Skia `Circle` at the Requests tab position with
a pulsing `RadialGradient` and `BlendMode.Screen`.

**Constants (internal):**
```typescript
const FLOOR_NODE_X_RATIO  = 0.875;  // Requests = 4th of 4 tabs → 0.125 * 7
const FLOOR_PULSE_MIN     = 0.20;   // radius = w * 0.20 at rest
const FLOOR_PULSE_MAX     = 0.32;   // radius = w * 0.32 at peak
const FLOOR_PULSE_DURATION = 2000;  // ms per half-cycle (withRepeat autoReverse)
const FLOOR_GLOW_ALPHA    = 0.30;   // inner gradient alpha
```

**Animation:**
```typescript
const floorPulse = useSharedValue(0);
// useEffect: withRepeat(withTiming(1, { duration: FLOOR_PULSE_DURATION }), -1, true)
const floorRadius = useDerivedValue(() =>
  w * (FLOOR_PULSE_MIN + (FLOOR_PULSE_MAX - FLOOR_PULSE_MIN) * floorPulse.value)
);
const floorCenter = useDerivedValue(() => ({ x: w * FLOOR_NODE_X_RATIO, y: h }));
```

**Color:** resolved via `resolveFloorGlowColor(pendingApprovals)` (see FR5).

**JSX (inside Canvas, after Node C):**
```tsx
{pendingApprovals != null && pendingApprovals > 0 && (
  <Circle cx={w * 0.875} cy={h} r={floorRadius}>
    <RadialGradient c={floorCenter} r={floorRadius} colors={floorColors} />
    <Paint blendMode="screen" />
  </Circle>
)}
```

**Success Criteria:**
- SC4.1 — `AnimatedMeshBackgroundProps` includes `pendingApprovals?: number | null`
- SC4.2 — Floor glow `Circle` renders when `pendingApprovals > 0`
- SC4.3 — Floor glow `Circle` does NOT render when `pendingApprovals=0`
- SC4.4 — Floor glow `Circle` does NOT render when `pendingApprovals=null`
- SC4.5 — Floor glow `Circle` does NOT render when `pendingApprovals` is undefined
- SC4.6 — Floor node x-position constant is `FLOOR_NODE_X_RATIO = 0.875`
- SC4.7 — Floor node y-position is `h` (very bottom, gradient falloff toward tab bar)
- SC4.8 — `FLOOR_PULSE_DURATION = 2000` (2-second pulse cycle)
- SC4.9 — `FLOOR_GLOW_ALPHA = 0.30`
- SC4.10 — Source uses `withRepeat` with autoReverse=`true` (3rd arg) for floor pulse
- SC4.11 — Existing nodes A, B, C are unaffected (no regressions)

---

### FR5: `resolveFloorGlowColor` internal helper

**File:** `src/components/AnimatedMeshBackground.tsx` (modify — internal function)

```typescript
function resolveFloorGlowColor(
  pendingApprovals: number | null | undefined,
  now: Date = new Date(),
): string | null
```

Returns `null` when `pendingApprovals <= 0` or null/undefined. Otherwise returns the
urgency color for the current UTC day:
- Thu(4) / Fri(5) / Sat(6) / Sun(0) → `colors.desatCoral` (`#F87171`)
- Mon(1) / Tue(2) / Wed(3) → `colors.warnAmber` (`#FCD34D`)

This is an **internal** function (not exported). It duplicates the day logic from
`getApprovalMeshState` to avoid a circular import. The function is a simple inline
calculation using `colors` tokens.

**Usage:**
```typescript
const floorHex = resolveFloorGlowColor(pendingApprovals);
const floorColors: [string, string] = floorHex
  ? [hexToRgba(floorHex, FLOOR_GLOW_ALPHA), 'transparent']
  : ['transparent', 'transparent'];
```

**Success Criteria:**
- SC5.1 — `resolveFloorGlowColor(0)` returns `null`
- SC5.2 — `resolveFloorGlowColor(null)` returns `null`
- SC5.3 — `resolveFloorGlowColor(undefined)` returns `null`
- SC5.4 — `resolveFloorGlowColor(1)` on Monday (UTC) → `colors.warnAmber` (`#FCD34D`)
- SC5.5 — `resolveFloorGlowColor(1)` on Thursday (UTC) → `colors.desatCoral` (`#F87171`)
- SC5.6 — `resolveFloorGlowColor(1)` on Sunday (UTC) → `colors.desatCoral` (`#F87171`)
- SC5.7 — Function is internal (not exported); tested via source analysis or indirect render

---

## Technical Design

### Files to Reference

| File | Role |
|------|------|
| `src/lib/panelState.ts` | `PanelState` type — `'behind'` and `'critical'` values |
| `src/lib/colors.ts` | `colors.desatCoral` (#F87171), `colors.warnAmber` (#FCD34D) |
| `src/components/AnimatedMeshBackground.tsx` | Base component to extend |
| `app/(tabs)/index.tsx` | Home screen — already has `approvalItems` from spec 01 |
| `app/(tabs)/overview.tsx` | Overview screen — already has `approvalItems` from spec 01 |
| `__mocks__/@shopify/react-native-skia.ts` | Existing Skia mock for tests |

### Files to Create

| File | Description |
|------|-------------|
| `src/lib/approvalMeshSignal.ts` | Pure function `getApprovalMeshState(pendingCount, now?)` |
| `src/lib/__tests__/approvalMeshSignal.test.ts` | FR1 + FR5 tests |
| `src/components/__tests__/MeshUrgencySignal.test.tsx` | FR2, FR3, FR4 tests |

### Files to Modify

| File | Change |
|------|--------|
| `src/components/AnimatedMeshBackground.tsx` | Add `pendingApprovals` prop + floor node + FR5 helper |
| `app/(tabs)/index.tsx` | Add import + `approvalMeshState` derived + updated mesh call |
| `app/(tabs)/overview.tsx` | Same changes as index.tsx |

### Data Flow

```
useApprovalItems()
  └── approvalItems.length (number)
        │
        ├── getApprovalMeshState(approvalItems.length)
        │     └── approvalMeshState: PanelState | null
        │           ├── panelState={approvalMeshState} → AnimatedMeshBackground Node C
        │           └── earningsPace=null when approvalMeshState ≠ null
        │
        └── pendingApprovals={approvalItems.length} → AnimatedMeshBackground floor node
              └── resolveFloorGlowColor(pendingApprovals)
                    └── floorColors: [string, string] → RadialGradient
```

### Key Constants

```typescript
// getApprovalMeshState day logic
// End-of-week: Sun(0), Thu(4), Fri(5), Sat(6)
const isEndOfWeek = day === 0 || day >= 4;

// Floor node positioning
const FLOOR_NODE_X_RATIO = 0.875;  // 4th tab of 4: 0.125, 0.375, 0.625, 0.875
const FLOOR_PULSE_MIN    = 0.20;
const FLOOR_PULSE_MAX    = 0.32;
const FLOOR_PULSE_DURATION = 2000;
const FLOOR_GLOW_ALPHA   = 0.30;
```

### Mock Strategy

- `@shopify/react-native-skia` — Use existing project-level mock at
  `__mocks__/@shopify/react-native-skia.ts` (extended in AnimatedMeshBackground test file
  as per existing test pattern)
- `src/lib/approvalMeshSignal` — Use real function (pure, no side effects)
- Date injection — `now` parameter on both `getApprovalMeshState` and (for FR5) tested
  indirectly via source analysis since `resolveFloorGlowColor` is internal

### Edge Cases

| Scenario | Expected |
|----------|----------|
| `pendingApprovals = 0` | No floor node; Node C driven by earningsPace |
| `pendingApprovals = null` | No floor node; `approvalMeshState` returns null |
| `pendingApprovals = undefined` | No floor node (prop not passed) |
| UTC Sunday midnight edge | `getUTCDay() === 0` → critical (correctly handled) |
| Week boundary (Mon 00:00 UTC) | `getUTCDay() === 1` → behind |

### No Circular Import

`resolveFloorGlowColor` in `AnimatedMeshBackground.tsx` does NOT import from
`approvalMeshSignal.ts`. It re-implements the day logic inline using `colors` tokens
directly. This keeps the dependency graph clean: `approvalMeshSignal.ts` imports only
`panelState.ts`; `AnimatedMeshBackground.tsx` imports only `colors.ts` and `panelState.ts`.
