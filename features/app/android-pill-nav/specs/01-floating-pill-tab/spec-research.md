# Spec Research: 01-floating-pill-tab

## Problem

Android receives the generic `NativeTabs` tab bar (BottomNavigationView), which has no blur, no premium feel, and ignores the app's dark glass aesthetic. We need a custom `FloatingPillTabBar` component that feels native to the Hourglass brand on Android.

## Scope

Build `src/components/FloatingPillTabBar.tsx` — a self-contained tab bar component designed to be passed as the `tabBar` prop to expo-router `<Tabs>`. No layout wiring in this spec (that's spec 02).

## Exploration Findings

### Reference Implementations
- `PanelGradient.tsx` — BlurView usage pattern (pre-mounted = safe, intensity=30)
- `AnimatedPressable.tsx` — Reanimated `useSharedValue` + `useAnimatedStyle` + `withSpring` press scale pattern
- `src/lib/reanimated-presets.ts` — `springSnappy` (damping: 20, stiffness: 300) is the right preset for tab press feedback
- `app/(tabs)/_layout.tsx:46-52` — `TAB_SCREENS` constant defines icon names (SF/MD), labels, route names
- `components/ui/icon-symbol.tsx` — `IconSymbol` handles cross-platform SF/MD icon rendering

### Design Tokens (src/lib/colors.ts)
- `colors.surface` = `#16151F` — pill background
- `colors.border` = `#2F2E41` — pill border
- `colors.violet` = `#A78BFA` — active tint + indicator fill
- `colors.textMuted` = `#757575` — inactive icon/label color
- `colors.textPrimary` = `#E0E0E0` — (not used here)

### Safe Area
- `react-native-safe-area-context` is available; use `useSafeAreaInsets()` inside the component to account for bottom home indicator height

### BlurView Decision
- Available at `expo-blur ~55.0.10`
- NOT used here: existing codebase note warns "BlurView instances limited to stable pre-mounted components to avoid concurrent GPU framebuffer allocation crashes"
- Semi-opaque `colors.surface` is consistent with IosGlassCard and other card components

## Interface Contracts

```typescript
// src/components/FloatingPillTabBar.tsx

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

interface FloatingPillTabBarProps extends BottomTabBarProps {
  tintColor: string;           // ← passed from _layout (colors.violet)
  inactiveTintColor: string;   // ← passed from _layout (colors.textMuted)
  badgeCounts?: Record<string, number>; // ← passed from _layout e.g. { approvals: 3 }
}
```

### TAB_SCREENS subset used (route name → icon/label)
```typescript
// Matches TAB_SCREENS in _layout.tsx — no new data needed
{ name: 'index',     label: 'Home',     icon: 'house.fill'            }
{ name: 'overview',  label: 'Overview', icon: 'chart.bar.fill'        }
{ name: 'ai',        label: 'AI',       icon: 'sparkles'              }
{ name: 'approvals', label: 'Requests', icon: 'checkmark.circle.fill' }
// 'explore' tab has href: null — rendered hidden, skip in pill
```

### Visual Layout
```
┌────────────────────────────────────────┐  ← borderRadius: 28, border: colors.border
│ ┌──────────┐                           │  ← active: violet 15% fill, violet border
│ │  🏠      │   📊      ✨      ✓      │
│ │  Home    │  Over     AI    Reqs      │  ← icon (20pt) + label (10pt) stacked
│ └──────────┘                           │
└────────────────────────────────────────┘
  ↑ position: absolute, bottom: 24+insets.bottom, left: 20, right: 20
```

### Internal component structure
```typescript
function PillTabItem({
  route,          // ← state.routes[i]  (react-navigation)
  isActive,       // ← state.index === i
  onPress,        // ← navigation.navigate(route.name)
  onLongPress,    // ← navigation.emit({ type: 'tabLongPress' })
  tintColor,
  inactiveTintColor,
  iconName,       // ← from TAB_SCREENS match
  label,          // ← from TAB_SCREENS match
  badge,          // ← from badgeCounts[route.name]
}: PillTabItemProps)
```

## Key Decisions

1. **No BlurView** — semi-opaque surface only. Avoids Android compat issues, consistent with card aesthetic.
2. **`BottomTabBarProps` from `@react-navigation/bottom-tabs`** — the correct type for `tabBar` prop; expo-router re-exports it.
3. **Pill container height ~60pt** — icon (20) + label (10) + padding (2×10) + gap (4) = ~54, round to 60.
4. **Active indicator borderRadius: 14** — slightly rounded rect, not capsule, to feel grounded.
5. **`springSnappy` for scale** — `withSpring(0.92, springSnappy)` on press, `withSpring(1.0)` on release.
6. **Badge rendering** — absolute positioned red circle (12pt diameter) top-right of icon, text inside if > 0.
7. **Skip 'explore' route** — `href: null` tab must be excluded from pill rendering.

## Test Plan

Tests use static source-file analysis pattern (established in `native-tabs.test.tsx`).

### FR1 — Pill container
- [ ] File exports `FloatingPillTabBar` as named export
- [ ] Container has `position: 'absolute'`
- [ ] Container has `borderRadius` >= 24
- [ ] Container uses `colors.surface` for background
- [ ] Container uses `colors.border` for border

### FR2 — Tab items (icon + label)
- [ ] Uses `IconSymbol` for icon rendering
- [ ] Icon size is 20
- [ ] Label font size is 10
- [ ] Inactive color references `inactiveTintColor` prop
- [ ] 'explore' route is filtered/skipped

### FR3 — Active indicator
- [ ] Active indicator rendered when `isActive === true`
- [ ] Active indicator uses `colors.violet` + `'1A'` suffix (15% opacity fill) OR explicit rgba
- [ ] Active indicator has `borderRadius` >= 10
- [ ] Active text/icon uses `tintColor`

### FR4 — Press feedback
- [ ] Uses `useSharedValue` from react-native-reanimated
- [ ] Uses `withSpring` or `springSnappy` preset
- [ ] `Pressable` or `Animated.View` wraps each tab item

### FR5 — Badge
- [ ] Badge container has `position: 'absolute'`
- [ ] Badge only renders when `badge > 0`
- [ ] Badge text shows numeric count

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/FloatingPillTabBar.tsx` | Create |
| `src/components/__tests__/FloatingPillTabBar.test.ts` | Create |

## Files to Reference

- `app/(tabs)/_layout.tsx` — TAB_SCREENS definition, badge logic
- `src/components/AnimatedPressable.tsx` — Reanimated press scale pattern
- `src/lib/reanimated-presets.ts` — springSnappy preset
- `src/lib/colors.ts` — color tokens
- `components/ui/icon-symbol.tsx` — cross-platform icon component
- `app/(tabs)/__tests__/native-tabs.test.tsx` — static analysis test pattern
