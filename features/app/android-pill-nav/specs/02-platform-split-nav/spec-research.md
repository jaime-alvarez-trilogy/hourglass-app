# Spec Research: 02-platform-split-nav

## Problem

Currently `_layout.tsx` uses a single feature flag (`ENABLE_NATIVE_TABS`) to switch between `NativeTabs` and legacy `Tabs`. This doesn't differentiate by platform — both iOS and Android get `NativeTabs` when the flag is true. We need iOS to always use `NativeTabs` and Android to use the new `FloatingPillTabBar`.

## Scope

Modify `app/(tabs)/_layout.tsx` to platform-split navigation, wire `FloatingPillTabBar` on Android, ensure screen content isn't obscured by the floating pill, and update tests. Depends on spec 01 (FloatingPillTabBar component must exist).

## Exploration Findings

### Current Architecture (app/(tabs)/_layout.tsx)
- Line 41: `USE_NATIVE_TABS = Constants.expoConfig?.extra?.ENABLE_NATIVE_TABS ?? false`
- Line 77: `if (USE_NATIVE_TABS) { return <NativeTabs ...> } else { return <Tabs ...> }`
- `NativeTabs` already has `backgroundColor={Platform.OS === 'android' ? colors.surface : 'transparent'}` — the Android condition exists but delivers BottomNavigationView, not our pill
- `app.json extra.ENABLE_NATIVE_TABS: true` — currently active

### Screen Content Padding
- All 4 visible tab screens (`index`, `overview`, `ai`, `approvals`) need `paddingBottom` on Android to avoid content being hidden behind the floating pill
- Pill height ≈ 60pt, bottom offset = 24pt, max safe area bottom ≈ 28pt → total ≈ 112pt
- Use `Platform.select` in screen `contentContainerStyle` or a shared constant `PILL_BOTTOM_OFFSET`
- The `screenOptions.contentStyle` in `<Tabs>` can apply padding globally: `{ paddingBottom: PILL_BOTTOM_OFFSET }`

### Test Files to Update
- `app/(tabs)/__tests__/native-tabs.test.tsx` — FR1 checks `app.json ENABLE_NATIVE_TABS`, FR2 checks flag read, FR4 checks NativeTabs render. Need new FR for platform split.
- `app/(tabs)/__tests__/layout.test.tsx` — minimal changes, just verify no regression.

## Interface Contracts

### Platform split logic
```typescript
// Replaces the USE_NATIVE_TABS flag check
const isIOS = Platform.OS === 'ios';
// iOS → NativeTabs (existing, unchanged)
// Android → Legacy <Tabs> with FloatingPillTabBar as tabBar prop
```

### Android Tabs wiring
```typescript
<Tabs
  screenOptions={{
    headerShown: false,
    // Hide default tab bar — FloatingPillTabBar renders absolutely
    tabBarStyle: { display: 'none' },
    // Global bottom padding so screen content clears the pill
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
  {/* same TAB_SCREENS.map(...) as legacy path */}
</Tabs>
```

### Shared constant
```typescript
// Bottom padding needed for screens when pill nav is active (Android only)
// pill height (60) + bottom offset (24) + safe area max (28) = 112
export const PILL_BOTTOM_OFFSET = 112; // pt
```

### app.json extra
`ENABLE_NATIVE_TABS` flag is removed (no longer needed — split is now always platform-based). If it remains, it becomes a no-op since `Platform.OS === 'ios'` drives the decision.

## Key Decisions

1. **Platform.OS === 'ios' is the gate**, not a feature flag. The flag approach required app rebuilds to test — the platform check is always correct.
2. **`tabBarStyle: { display: 'none' }`** hides the default React Navigation tab bar, letting `FloatingPillTabBar` render absolutely above content.
3. **`contentStyle: { paddingBottom: PILL_BOTTOM_OFFSET }`** in `screenOptions` globally applies bottom padding to all tab screens on Android without touching each screen file.
4. **`PILL_BOTTOM_OFFSET = 112`** — conservative value that clears pill on all devices including max safe-area phones (iPhone 14/15 style bottom inset ported to Android).
5. **NativeTabs path is unchanged** — iOS path keeps all existing props, badge logic, NoiseOverlay.
6. **No changes to individual screen files** — padding is handled at the layout level via `contentStyle`.

## Test Plan

Static source-file analysis pattern (consistent with `native-tabs.test.tsx`).

### FR1 — Platform split logic
- [ ] `_layout.tsx` does NOT reference `USE_NATIVE_TABS` or `ENABLE_NATIVE_TABS` as the branch condition
- [ ] `_layout.tsx` uses `Platform.OS === 'ios'` (or `Platform.OS !== 'android'`) as the branch
- [ ] iOS path returns `<NativeTabs` component
- [ ] Android path returns `<Tabs` with `tabBar` prop

### FR2 — FloatingPillTabBar wiring
- [ ] Android `<Tabs>` has `tabBar` prop that references `FloatingPillTabBar`
- [ ] `tintColor={colors.violet}` passed to FloatingPillTabBar
- [ ] `inactiveTintColor={colors.textMuted}` passed to FloatingPillTabBar
- [ ] `badgeCounts` passed to FloatingPillTabBar

### FR3 — Screen content padding
- [ ] `screenOptions.contentStyle` or equivalent includes `paddingBottom`
- [ ] `PILL_BOTTOM_OFFSET` constant is defined and >= 100
- [ ] Default tab bar is hidden (`tabBarStyle: { display: 'none' }`)

### FR4 — iOS path unchanged
- [ ] NativeTabs still receives `tintColor`, `iconColor`, `blurEffect`, `backgroundColor`, `shadowColor`
- [ ] NoiseOverlay still rendered in iOS path
- [ ] Approval badge logic still wired in iOS path

### FR5 — Test updates
- [ ] `native-tabs.test.tsx` updated: `ENABLE_NATIVE_TABS` flag test replaced or supplemented with platform-split test
- [ ] No regressions in `layout.test.tsx`

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/(tabs)/_layout.tsx` | Modify — platform split, FloatingPillTabBar wiring |
| `app/(tabs)/__tests__/native-tabs.test.tsx` | Modify — update FR1/FR2 for platform split |
| `app/(tabs)/__tests__/layout.test.tsx` | Modify — minor updates if needed |

## Files to Reference

- `app/(tabs)/_layout.tsx` — current implementation (full file)
- `app/(tabs)/__tests__/native-tabs.test.tsx` — test patterns to update
- `src/components/FloatingPillTabBar.tsx` — spec 01 output (must exist before this spec runs)
- `src/lib/colors.ts` — color tokens
- `app.json` — extra flags to update
