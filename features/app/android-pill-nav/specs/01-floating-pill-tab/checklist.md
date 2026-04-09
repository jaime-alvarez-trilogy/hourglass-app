# Checklist: 01-floating-pill-tab

## Phase 1.0 — Tests (Red Phase)

Write failing tests before any implementation. All tests must fail initially.

### FR1 — Pill Container Tests

- [x] SC1.1 — `FloatingPillTabBar` is exported as a named export
- [x] SC1.2 — Container `View` has `position: 'absolute'`
- [x] SC1.3 — Container uses `useSafeAreaInsets` from `react-native-safe-area-context`
- [x] SC1.4 — Container has `left: 20` and `right: 20`
- [x] SC1.5 — Container has `borderRadius` >= 24
- [x] SC1.6 — Container background uses `colors.surface`
- [x] SC1.7 — Container border uses `colors.border`
- [x] SC1.8 — Container uses `flexDirection: 'row'`

### FR2 — Tab Items Tests

- [x] SC2.2 — `explore` route is filtered/excluded from rendering
- [x] SC2.3 — `MaterialIcons` imported from `@expo/vector-icons/MaterialIcons` and used for icons
- [x] SC2.4 — Label text has `fontSize: 10`
- [x] SC2.5 — Inactive color references `inactiveTintColor`
- [x] SC2.6 — `ICON_MAP` or equivalent maps all 4 SF icon names to MD names (`home`, `bar_chart`, `auto_awesome`, `check_circle`)

### FR3 — Active Indicator Tests

- [x] SC3.1 — Active indicator rendered conditionally (not always shown)
- [x] SC3.2 — Active indicator background includes `colors.violet` + `'1A'` suffix OR `rgba` equivalent
- [x] SC3.3 — Active indicator has `borderColor: colors.violet`
- [x] SC3.4 — Active indicator `borderRadius` >= 10
- [x] SC3.5 — Active icon/label uses `tintColor` prop (not hardcoded)

### FR4 — Press Feedback Tests

- [x] SC4.1 — `useSharedValue` imported and used from `react-native-reanimated`
- [x] SC4.2 — `useAnimatedStyle` used for scale transform
- [x] SC4.3 — `withSpring` and `springSnappy` used for press animation
- [x] SC4.5 — `Animated.View` from reanimated wraps tab item

### FR5 — Badge Tests

- [x] SC5.1 — Badge container has `position: 'absolute'`
- [x] SC5.3 — Badge only renders conditionally (guarded by `badge > 0` or similar)
- [x] SC5.4 — Badge renders numeric count as text
- [x] SC5.5 — Badge uses `colors.critical` background

---

## Phase 1.1 — Implementation (Green Phase)

Implement minimum code to make all Phase 1.0 tests pass.

### FR1 — Pill Container Implementation

- [x] Create `src/components/FloatingPillTabBar.tsx` with named export `FloatingPillTabBar`
- [x] Implement absolutely-positioned container: `position: 'absolute'`, `bottom: 24 + insets.bottom`, `left: 20`, `right: 20`
- [x] Apply `borderRadius: 28`, `backgroundColor: colors.surface`, `borderWidth: 1`, `borderColor: colors.border`
- [x] Apply `flexDirection: 'row'`, `paddingVertical: 8`, `paddingHorizontal: 4`
- [x] Wire `useSafeAreaInsets()` for bottom inset

### FR2 — Tab Items Implementation

- [x] Define `PILL_TABS` constant with 4 visible tabs (name, label, icon)
- [x] Define `ICON_MAP` mapping SF icon names to MaterialIcons names
- [x] Implement `PillTabItem` internal sub-component
- [x] Filter `state.routes` to exclude `explore` route (skip if not in PILL_TABS)
- [x] Render `MaterialIcons` with `size={20}` and appropriate color
- [x] Render `Text` label with `fontSize: 10`
- [x] Wire `onPress` to `navigation.navigate` + emit `tabPress`
- [x] Wire `onLongPress` to emit `tabLongPress`

### FR3 — Active Indicator Implementation

- [x] Render active indicator `View` only when `isActive === true`
- [x] Apply `backgroundColor: colors.violet + '1A'` to active indicator
- [x] Apply `borderWidth: 1, borderColor: colors.violet` to active indicator
- [x] Apply `borderRadius: 14` to active indicator
- [x] Use `tintColor` prop for active icon and label color

### FR4 — Press Feedback Implementation

- [x] Import `Animated`, `useSharedValue`, `useAnimatedStyle`, `withSpring` from `react-native-reanimated`
- [x] Import `springSnappy` from `@/src/lib/reanimated-presets`
- [x] Initialize `scale = useSharedValue(1)` per PillTabItem
- [x] Apply `useAnimatedStyle` returning `{ transform: [{ scale: scale.value }] }`
- [x] On `pressIn`: `scale.value = withSpring(0.92, springSnappy)`
- [x] On `pressOut`: `scale.value = withSpring(1.0, springSnappy)`
- [x] Wrap each item in `Animated.View` with animated style; place `Pressable` inside

### FR5 — Badge Implementation

- [x] Accept `badge` prop in `PillTabItem` (from `badgeCounts[route.name]` or `descriptors[route.key].options.tabBarBadge`)
- [x] Render badge `View` only when `badge > 0`
- [x] Apply `position: 'absolute'`, `top: -4`, `right: -4` to badge container
- [x] Apply `width: 12`, `height: 12`, `borderRadius: 6`, `backgroundColor: colors.critical`
- [x] Render `Text` showing badge count, `fontSize: 8`, `color: 'white'`, `fontWeight: 'bold'`

---

## Phase 1.2 — Review

### Alignment Check

- [x] Run spec-implementation-alignment check: verify all FR success criteria implemented
- [x] Verify `FloatingPillTabBar` exported as named export (not default)
- [x] Verify `explore` tab excluded from pill
- [x] Verify `MaterialIcons` used instead of `IconSymbol` (Android mapping gap)
- [x] Verify no `expo-blur` import (explicitly excluded)

### PR Review

- [x] Run code review on changed files
- [x] Fixed: PILL_TAB_NAMES moved to module level (removed per-render Set allocation)
- [x] Fixed: redundant `labelColor` merged into `iconColor` → `itemColor`
- [x] Fixed: unreachable null guard removed after PILL_TAB_NAMES.has() check
- [x] Fixed: SC2.2 test strengthened from keyword match to entry name assertions

### Test Optimization

- [x] Tests follow established static analysis pattern (native-tabs.test.tsx)
- [x] All tests would fail if implementation structure changes
- [x] No pageantry testing identified

---

## Session Notes

**2026-04-06**: Implementation complete.
- Phase 1.0: 1 test commit (50 tests, all FRs covered)
- Phase 1.1: 1 implementation commit (FloatingPillTabBar.tsx, 50/50 tests green)
- Phase 1.2: 1 fix commit (review findings: module-level Set, redundant variable, dead code, test strength)
- All 3693 tests passing. No regressions.
