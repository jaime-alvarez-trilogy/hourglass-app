# 02-platform-split-nav

**Status:** Draft
**Created:** 2026-04-06
**Last Updated:** 2026-04-06
**Owner:** @jaime

---

## Overview

### What Is Being Built

`02-platform-split-nav` wires the `FloatingPillTabBar` (built in spec 01) into the app's tab layout and splits navigation by platform: iOS always gets `NativeTabs` (UITabBarController with automatic iOS 26 glass pill), while Android gets the custom `FloatingPillTabBar`.

The change replaces the `USE_NATIVE_TABS` feature-flag branch in `app/(tabs)/_layout.tsx` with a `Platform.OS === 'ios'` check. This removes the need for app rebuilds to toggle renderers and ensures the correct navigator is always used on each platform.

### How It Works

1. **Platform gate**: `const isIOS = Platform.OS === 'ios'`. When `true`, the existing `NativeTabs` path renders unchanged. When `false` (Android), the new `<Tabs>` + `FloatingPillTabBar` path renders.

2. **Android path**: A `<Tabs>` navigator is rendered with `tabBar={(props) => <FloatingPillTabBar .../>}`. The default tab bar is hidden via `tabBarStyle: { display: 'none' }` since `FloatingPillTabBar` renders absolutely above content.

3. **Screen padding**: `contentStyle: { paddingBottom: PILL_BOTTOM_OFFSET }` in `screenOptions` globally applies bottom padding so no tab screen content is hidden behind the floating pill. `PILL_BOTTOM_OFFSET = 112` (pill height 60 + bottom offset 24 + max safe-area inset 28).

4. **iOS path unchanged**: `NativeTabs` keeps all existing props (`tintColor`, `iconColor`, `blurEffect`, `backgroundColor`, `shadowColor`), badge logic, and `NoiseOverlay`.

5. **Test updates**: `native-tabs.test.tsx` FR1/FR2 tests for `ENABLE_NATIVE_TABS` are replaced with a platform-split test block. No regressions in `layout.test.tsx`.

---

## Out of Scope

1. **FloatingPillTabBar component internals** — The pill component itself (icon mapping, active indicator, badge, press animation) was built in spec 01-floating-pill-tab. This spec only wires it into the layout. **Descoped** (already complete).

2. **Per-screen padding files** — Individual screen files (`index.tsx`, `overview.tsx`, `ai.tsx`, `approvals.tsx`) are not modified. Padding is applied globally via `contentStyle` in `<Tabs>` screenOptions. **Descoped** (not needed).

3. **BlurView / frosted glass on Android** — Explicitly excluded per feature design decisions. The floating pill uses semi-opaque `colors.surface` without BlurView. **Descoped** (decided in spec 01).

4. **Dynamic `PILL_BOTTOM_OFFSET` based on device insets** — The constant uses a conservative fixed value (112pt) rather than dynamically computing from `useSafeAreaInsets`. Dynamic computation belongs in a polish/refinement pass. **Descoped**.

5. **`ENABLE_NATIVE_TABS` flag removal from `app.json`** — The flag becomes a no-op once `Platform.OS` drives the branch. Removing it from `app.json` is a cleanup task but not required for correctness. The test that previously checked `ENABLE_NATIVE_TABS` exists in `app.json` will be updated to no longer assert its presence. **Descoped**.

6. **Expo Go vs production build detection** — No special handling for Expo Go vs EAS build. The platform split works identically in both environments. **Descoped**.

7. **Android 3-button vs gesture navigation variants** — Both navigation modes work with the fixed `PILL_BOTTOM_OFFSET`. Fine-tuning per nav mode is a future polish task. **Descoped**.

---

## Functional Requirements

### FR1 — Platform Split Logic

Replace the `USE_NATIVE_TABS` feature-flag branch with a `Platform.OS === 'ios'` check.

**Success Criteria:**

- SC1.1 — `_layout.tsx` does NOT use `USE_NATIVE_TABS` or `ENABLE_NATIVE_TABS` as the conditional branch (the flag becomes a dead variable or is removed)
- SC1.2 — `_layout.tsx` uses `Platform.OS === 'ios'` (or equivalent `Platform.OS !== 'android'`) as the branch condition
- SC1.3 — When `isIOS` is `true`, the `NativeTabs` path renders
- SC1.4 — When `isIOS` is `false` (Android), the `<Tabs>` + `FloatingPillTabBar` path renders
- SC1.5 — `Platform` is imported from `react-native` (already present in the file)

---

### FR2 — FloatingPillTabBar Wiring

Wire `FloatingPillTabBar` as the `tabBar` prop on the Android `<Tabs>` navigator.

**Success Criteria:**

- SC2.1 — `FloatingPillTabBar` is imported from `@/src/components/FloatingPillTabBar`
- SC2.2 — The Android `<Tabs>` component has a `tabBar` prop that renders `FloatingPillTabBar`
- SC2.3 — `tintColor={colors.violet}` is passed to `FloatingPillTabBar`
- SC2.4 — `inactiveTintColor={colors.textMuted}` is passed to `FloatingPillTabBar`
- SC2.5 — `badgeCounts` is passed to `FloatingPillTabBar` (using the existing `approvalBadge` logic)
- SC2.6 — The same `TAB_SCREENS.map(...)` used in the legacy Tabs path drives the Android `<Tabs>` screens

---

### FR3 — Screen Content Padding

Ensure tab screen content is not hidden behind the floating pill on Android.

**Success Criteria:**

- SC3.1 — A constant `PILL_BOTTOM_OFFSET` is defined at module level with value `>= 100` (spec: 112)
- SC3.2 — The Android `<Tabs>` `screenOptions` includes `contentStyle: { paddingBottom: PILL_BOTTOM_OFFSET }`
- SC3.3 — The Android `<Tabs>` `screenOptions` includes `tabBarStyle: { display: 'none' }` to hide the default React Navigation tab bar
- SC3.4 — `headerShown: false` is present in Android `screenOptions`

---

### FR4 — iOS Path Unchanged

The `NativeTabs` path must remain functionally identical to the pre-split implementation.

**Success Criteria:**

- SC4.1 — `NativeTabs` still receives `tintColor={colors.violet}`
- SC4.2 — `NativeTabs` still receives `iconColor={{ default: colors.textMuted, selected: colors.violet }}`
- SC4.3 — `NativeTabs` still receives `blurEffect="systemUltraThinMaterialDark"`
- SC4.4 — `NativeTabs` still receives `backgroundColor` (platform-conditional)
- SC4.5 — `NativeTabs` still receives `shadowColor="transparent"`
- SC4.6 — `<NoiseOverlay />` is still rendered in the iOS path
- SC4.7 — The approval badge logic (`approvalBadge`) is still wired in the iOS path via `NativeTabs.Trigger.Badge`

---

### FR5 — Test Updates

Update `native-tabs.test.tsx` to reflect the platform-split architecture. No regressions in `layout.test.tsx`.

**Success Criteria:**

- SC5.1 — `native-tabs.test.tsx` contains a new test block for `02-platform-split-nav`
- SC5.2 — The new test block verifies `Platform.OS === 'ios'` (or `!== 'android'`) is used as the branch
- SC5.3 — The new test block verifies `FloatingPillTabBar` is imported in `_layout.tsx`
- SC5.4 — The new test block verifies `tabBar` prop is present in the Android path
- SC5.5 — The new test block verifies `PILL_BOTTOM_OFFSET` constant is defined and `>= 100`
- SC5.6 — The new test block verifies `contentStyle` includes `paddingBottom` in Android screenOptions
- SC5.7 — The prior FR1 test for `ENABLE_NATIVE_TABS: true` in `app.json` is removed or updated (flag no longer drives behavior)
- SC5.8 — All existing tests in `native-tabs.test.tsx` that remain valid continue to pass (FR3 TAB_SCREENS, FR4 NativeTabs path, FR5 HapticTab removal, FR6 NoiseOverlay)
- SC5.9 — `layout.test.tsx` requires no changes (its checks are about tab title and showApprovals removal, which are unaffected)

---

## Technical Design

### Files to Modify

| File | Action |
|------|--------|
| `app/(tabs)/_layout.tsx` | Modify — replace USE_NATIVE_TABS branch with Platform.OS split, wire FloatingPillTabBar |
| `app/(tabs)/__tests__/native-tabs.test.tsx` | Modify — add 02-platform-split-nav test block, update/remove FR1 ENABLE_NATIVE_TABS test |

### Files to Reference

| File | Why |
|------|-----|
| `app/(tabs)/_layout.tsx` | Current implementation — full source to understand existing paths |
| `app/(tabs)/__tests__/native-tabs.test.tsx` | Existing tests — pattern to follow, tests to update |
| `app/(tabs)/__tests__/layout.test.tsx` | Verify no regressions needed |
| `src/components/FloatingPillTabBar.tsx` | Import target — `FloatingPillTabBarProps` |
| `src/lib/colors.ts` | Color tokens — `colors.violet`, `colors.textMuted` |

### Data Flow

```
app/(tabs)/_layout.tsx
    │
    ├─ Platform.OS === 'ios'?
    │     YES → <NativeTabs ...> + <NoiseOverlay /> (unchanged)
    │     NO  → Android path ↓
    │
    └─ <View flex:1>
         <Tabs
           screenOptions={{
             headerShown: false,
             tabBarStyle: { display: 'none' },
             contentStyle: { paddingBottom: PILL_BOTTOM_OFFSET },
           }}
           tabBar={(props) => (
             <FloatingPillTabBar
               {...props}
               tintColor={colors.violet}
               inactiveTintColor={colors.textMuted}
               badgeCounts={approvalBadge ? { approvals: approvalBadge } : {}}
             />
           )}
         >
           {TAB_SCREENS.map(...)}   ← same screens as legacy path
         </Tabs>
         <NoiseOverlay />
       </View>
```

### Key Implementation Notes

1. **`isIOS` vs inline check** — Define `const isIOS = Platform.OS === 'ios'` at component scope (not module scope, since Platform is available at runtime).

2. **`PILL_BOTTOM_OFFSET` placement** — Define as a module-level constant above `TabLayout`:
   ```typescript
   const PILL_BOTTOM_OFFSET = 112; // pill (60) + offset (24) + safe area max (28)
   ```

3. **`USE_NATIVE_TABS` removal** — Remove the `Constants` import and `USE_NATIVE_TABS` constant entirely. The feature flag is superseded by `Platform.OS`. Also remove the `expo-constants` import (not used elsewhere in the file).

4. **`tabBarStyle: { display: 'none' }`** — Required to suppress React Navigation's default Android `BottomNavigationView`. Without this, both the default bar and the floating pill would render simultaneously.

5. **`contentStyle`** — Applied in `screenOptions` at the `<Tabs>` level, not per-screen. This avoids modifying any of the 4 tab screen files.

6. **`badgeCounts` shape** — Pass `approvalBadge ? { approvals: approvalBadge } : {}`. The `FloatingPillTabBar` accepts `badgeCounts?: Record<string, number>`.

7. **TAB_SCREENS reuse** — The existing `TAB_SCREENS` constant drives both paths. No duplication. The `screen.href === null` branch in the map handles `explore` exactly as the legacy path does.

8. **NoiseOverlay on Android** — Keep `<NoiseOverlay />` in the Android path (inside the `<View flex:1>` wrapper).

### Edge Cases

| Case | Handling |
|------|---------|
| `Platform.OS === 'web'` | Falls through to Android path (Tabs + FloatingPillTabBar). Web is not a supported target. |
| `approvalBadge` is `undefined` | `badgeCounts` becomes `{}` — no badge shown. Correct behavior. |
| `approvalBadge` is `0` | `0 > 0` is false, so `approvalBadge` is `undefined`. `badgeCounts` becomes `{}`. Correct. |
| `PILL_BOTTOM_OFFSET` over-padding on flat-nav Android | Minor visual gap below last list item. Acceptable tradeoff vs clipping. |

### Test Strategy

Follow the static source-file analysis pattern established in `native-tabs.test.tsx`:
- `fs.readFileSync` to read `_layout.tsx` source
- Regex / string assertions on source text
- No React rendering, no mocking needed
- New `describe` block: `'02-platform-split-nav — FR{N}: ...'`

The existing FR1 test for `app.json ENABLE_NATIVE_TABS: true` should be removed since the flag no longer drives behavior. The existing FR2 tests for `Constants.expoConfig` / `ENABLE_NATIVE_TABS` should be removed and replaced with `Platform.OS` assertions.

All other existing test blocks (FR3 TAB_SCREENS, FR4 NativeTabs path, FR5 HapticTab removal, FR6 NoiseOverlay) remain valid and should continue to pass unchanged.
