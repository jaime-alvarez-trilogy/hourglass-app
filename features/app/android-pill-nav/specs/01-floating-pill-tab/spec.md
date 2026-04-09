# 01-floating-pill-tab

**Status:** Draft
**Created:** 2026-04-06
**Last Updated:** 2026-04-06
**Owner:** @jaime

---

## Overview

### What Is Being Built

`FloatingPillTabBar` is a custom React Native tab bar component for Android. It renders as a floating semi-opaque pill that hovers above screen content, replacing the default BottomNavigationView with a premium dark-glass aesthetic consistent with the Hourglass brand.

The component is designed to be passed directly as the `tabBar` prop to expo-router `<Tabs>`. It is self-contained — no router wiring is done here (that belongs to spec 02-platform-split-nav).

### How It Works

1. **Container**: An absolutely-positioned `View` floats at `bottom = 24 + insets.bottom`, spanning `left: 20` to `right: 20`. It has `borderRadius: 28`, uses `colors.surface` as background, `colors.border` as the 1pt border, and carries a subtle drop shadow for depth.

2. **Tab items**: Each visible tab route (excluding `explore`) renders a `PillTabItem` sub-component. Items are arranged in a horizontal row with equal spacing. Each item shows a stacked icon (20pt) + label (10pt).

3. **Active indicator**: The active tab gets a rounded-rect background fill using `colors.violet` at 15% opacity (`#A78BFA1A`) with a `colors.violet` stroke, and `borderRadius: 14`.

4. **Press animation**: Each tab item wraps a `Pressable` in a `Reanimated.Animated.View` driven by `useSharedValue`. On `pressIn`, scale springs to 0.92 using `springSnappy`. On `pressOut`, it springs back to 1.0.

5. **Badge**: When a badge count > 0 is present, a 12pt red circle renders absolutely at the top-right of the icon, showing the count as text.

6. **Icon rendering**: Because `components/ui/icon-symbol.tsx` only maps `house.fill` on Android, `FloatingPillTabBar` uses `MaterialIcons` (from `@expo/vector-icons/MaterialIcons`) directly with explicit MD icon names per tab. This avoids the broken mapping gap without modifying the shared `IconSymbol` component.

7. **Safe area**: `useSafeAreaInsets()` provides bottom inset so the pill clears the Android home indicator on gesture-nav devices.

---

## Out of Scope

1. **iOS tab bar** — iOS uses `NativeTabs` (UITabBarController + iOS 26 glass pill). Rendering `FloatingPillTabBar` on iOS is explicitly excluded. **Deferred to 02-platform-split-nav** which wires platform detection.

2. **Router wiring / platform-split** — Passing `FloatingPillTabBar` as `tabBar` prop to `<Tabs>` in `_layout.tsx`, and gating it to Android via `Platform.OS`, is out of scope here. **Deferred to 02-platform-split-nav**.

3. **Screen padding adjustment** — Adding `paddingBottom` to each tab screen to prevent content hiding behind the floating pill is out of scope. **Deferred to 02-platform-split-nav**.

4. **BlurView / frosted glass effect** — Explicitly excluded per Key Decision #1: BlurView is limited to stable pre-mounted components to avoid Android GPU framebuffer crashes. Semi-opaque surface used instead. **Descoped** (no action needed).

5. **Swipe-to-switch gesture** — Horizontal swipe navigation between tabs is not part of this spec. **Descoped**.

6. **Long-press sheet** — The `onLongPress` handler emits the standard `tabLongPress` event (react-navigation convention) but no custom bottom sheet or action menu is shown. **Descoped**.

7. **`IconSymbol` mapping extension** — Rather than modifying the shared `components/ui/icon-symbol.tsx` to add more SF→MD mappings, `FloatingPillTabBar` uses `MaterialIcons` directly. Updating `IconSymbol` for the full tab set is **Descoped** (out of scope for this spec).

---

## Functional Requirements

### FR1 — Pill Container

Build the outer floating pill container that positions the tab bar on screen.

**Success Criteria:**

- SC1.1 — `FloatingPillTabBar` is exported as a named export from `src/components/FloatingPillTabBar.tsx`
- SC1.2 — Container `View` has `position: 'absolute'`
- SC1.3 — Container has `bottom` offset = `24 + insets.bottom` (where `insets` comes from `useSafeAreaInsets()`)
- SC1.4 — Container has `left: 20` and `right: 20`
- SC1.5 — Container has `borderRadius` >= 24 (spec: 28)
- SC1.6 — Container background color is `colors.surface` (`#16151F`)
- SC1.7 — Container border color is `colors.border` (`#2F2E41`) with `borderWidth: 1`
- SC1.8 — Container uses `flexDirection: 'row'` to arrange tab items horizontally
- SC1.9 — Container height is ~60pt (accommodates icon 20pt + label 10pt + vertical padding)

---

### FR2 — Tab Items (Icon + Label)

Each visible tab route renders as a stacked icon + label item inside the pill.

**Success Criteria:**

- SC2.1 — Tab items are rendered by iterating `state.routes` from `BottomTabBarProps`
- SC2.2 — The `explore` route (which has `href: null`) is filtered out and NOT rendered
- SC2.3 — Each tab item renders an icon using `MaterialIcons` from `@expo/vector-icons/MaterialIcons` with size 20
- SC2.4 — Each tab item renders a text label with `fontSize: 10`
- SC2.5 — Inactive icon and label use the `inactiveTintColor` prop color
- SC2.6 — The tab icon→MD mapping covers all 4 visible tabs:
  - `house.fill` → `'home'`
  - `chart.bar.fill` → `'bar_chart'`
  - `sparkles` → `'auto_awesome'`
  - `checkmark.circle.fill` → `'check_circle'`
- SC2.7 — Icon and label are stacked vertically (`flexDirection: 'column'`, `alignItems: 'center'`)
- SC2.8 — Each tab item's `onPress` calls `navigation.navigate(route.name)` and emits `tabPress` event
- SC2.9 — Each tab item's `onLongPress` emits `tabLongPress` event via `navigation.emit`

---

### FR3 — Active Indicator

The currently active tab shows a highlighted background behind its icon+label.

**Success Criteria:**

- SC3.1 — Active indicator is rendered only when `state.index === routeIndex` (i.e. `isActive === true`)
- SC3.2 — Active indicator background color is `colors.violet + '1A'` (`#A78BFA1A`, ~15% opacity) OR explicit `rgba(167, 139, 250, 0.15)`
- SC3.3 — Active indicator has a `colors.violet` border stroke (`borderWidth: 1`, `borderColor: colors.violet`)
- SC3.4 — Active indicator `borderRadius` >= 10 (spec: 14)
- SC3.5 — Active tab icon and label color use `tintColor` prop (not hardcoded)

---

### FR4 — Press Feedback Animation

Each tab press triggers a spring scale animation for tactile feedback.

**Success Criteria:**

- SC4.1 — Each `PillTabItem` uses `useSharedValue` from `react-native-reanimated` to track scale
- SC4.2 — `useAnimatedStyle` derives a `transform: [{ scale }]` style from the shared value
- SC4.3 — On `pressIn`, scale animates to `0.92` using `withSpring` with `springSnappy` preset
- SC4.4 — On `pressOut`, scale animates back to `1.0` using `withSpring` with `springSnappy` preset
- SC4.5 — Each tab item is wrapped in `Animated.View` (from `react-native-reanimated`) with the animated style applied
- SC4.6 — A `Pressable` handles the touch events inside the `Animated.View`

---

### FR5 — Badge

Approval count badges appear on the Requests tab when there are pending items.

**Success Criteria:**

- SC5.1 — Badge container has `position: 'absolute'` to float over the icon
- SC5.2 — Badge container is positioned at top-right of the icon area (e.g. `top: -4, right: -4`)
- SC5.3 — Badge renders ONLY when `badge > 0` (no render when badge is 0 or undefined)
- SC5.4 — Badge shows the numeric count as text inside the circle
- SC5.5 — Badge container is ~12pt diameter with `backgroundColor: colors.critical` (red) and `borderRadius: 6`
- SC5.6 — Badge text is white, `fontSize: 8`, `fontWeight: 'bold'`

---

## Technical Design

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/FloatingPillTabBar.tsx` | Main component — pill container + PillTabItem sub-component |
| `src/components/__tests__/FloatingPillTabBar.test.ts` | Static source analysis tests (same pattern as native-tabs.test.tsx) |

### Files to Reference

| File | Why |
|------|-----|
| `app/(tabs)/_layout.tsx` | `TAB_SCREENS` constant — tab names, SF icons, labels |
| `src/components/AnimatedPressable.tsx` | Reanimated press-scale pattern (`useSharedValue` + `withSpring` + `springSnappy`) |
| `src/lib/reanimated-presets.ts` | `springSnappy` export |
| `src/lib/colors.ts` | All color tokens |
| `components/ui/icon-symbol.tsx` | Understand the Android gap (MAPPING is sparse) — use `MaterialIcons` directly instead |
| `app/(tabs)/__tests__/native-tabs.test.tsx` | Static source analysis test pattern to follow |

### Data Flow

```
_layout.tsx (spec 02)
    │
    ├─ tabBar={FloatingPillTabBar}          ← passed as prop to <Tabs>
    │
    └── FloatingPillTabBar receives BottomTabBarProps
            │
            ├── state.routes          → iterate → filter 'explore' → render PillTabItems
            ├── state.index           → identify active route
            ├── navigation.navigate   → tab press handler
            ├── navigation.emit       → tab longpress handler
            ├── descriptors           → access options.tabBarBadge
            ├── tintColor             → active icon/label color
            ├── inactiveTintColor     → inactive icon/label color
            └── badgeCounts           → optional override for badge counts
                    │
                    └── PillTabItem (per route)
                            ├── Animated.View (useSharedValue scale)
                            │     └── Pressable
                            │           ├── Active indicator (conditional View)
                            │           ├── MaterialIcons (size=20)
                            │           ├── Text label (size=10)
                            │           └── Badge (conditional, absolute position)
                            └── scale.value = withSpring(0.92/1.0, springSnappy)
```

### Internal Structure

```typescript
// src/components/FloatingPillTabBar.tsx

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { springSnappy } from '@/src/lib/reanimated-presets';
import { colors } from '@/src/lib/colors';

// SF icon name → MaterialIcons name (covers the 4 visible tabs)
const ICON_MAP: Record<string, string> = {
  'house.fill':           'home',
  'chart.bar.fill':       'bar_chart',
  'sparkles':             'auto_awesome',
  'checkmark.circle.fill': 'check_circle',
};

// TAB_SCREENS subset — drives label + icon resolution
const PILL_TABS = [
  { name: 'index',     label: 'Home',     icon: 'house.fill' },
  { name: 'overview',  label: 'Overview', icon: 'chart.bar.fill' },
  { name: 'ai',        label: 'AI',       icon: 'sparkles' },
  { name: 'approvals', label: 'Requests', icon: 'checkmark.circle.fill' },
] as const;

interface FloatingPillTabBarProps extends BottomTabBarProps {
  tintColor: string;
  inactiveTintColor: string;
  badgeCounts?: Record<string, number>;
}

// PillTabItem — internal sub-component (not exported)
function PillTabItem({ ... }: PillTabItemProps) { ... }

export function FloatingPillTabBar({ state, navigation, descriptors, tintColor, inactiveTintColor, badgeCounts }: FloatingPillTabBarProps) { ... }
```

### Edge Cases

| Case | Handling |
|------|---------|
| `explore` route in `state.routes` | Filter: skip any route not present in `PILL_TABS` name list |
| Badge = 0 or undefined | No badge rendered (`badge > 0` guard before rendering) |
| Unknown SF icon name in `ICON_MAP` | Fallback to `'help'` MaterialIcon (defensive) |
| `badgeCounts` not provided | Falls back to `descriptors[route.key]?.options?.tabBarBadge` |
| Insets = 0 (Android 3-button nav) | `bottom: 24 + 0 = 24` — still correct, no issue |
| Very long label text | Fixed font size 10, no wrapping — labels are short by design |

### Key Implementation Notes

1. **No BlurView** — `backgroundColor: colors.surface` only. Do not import `expo-blur`.

2. **MaterialIcons directly** — Import `MaterialIcons` from `@expo/vector-icons/MaterialIcons`. Do NOT use `IconSymbol` — the Android fallback mapping is missing 3 of 4 tab icons.

3. **Reanimated v4** — Use the programmatic API (`useSharedValue` + `useAnimatedStyle` + `withSpring`). Do not use CSS Animations syntax (that's for simple entrances, not gesture-driven press feedback).

4. **`BottomTabBarProps` source** — Import from `@react-navigation/bottom-tabs`, not from expo-router. expo-router re-exports it but the canonical type location is `@react-navigation/bottom-tabs`.

5. **Pill height** — Do not use a fixed numeric height style. Let content determine height via padding (`paddingVertical: 8`). This prevents clipping on different Android font sizes.

6. **Test pattern** — Follow `native-tabs.test.tsx` exactly: `import * as fs from 'fs'`, `fs.readFileSync`, regex/string assertions on source text. No React rendering or mocking needed.
