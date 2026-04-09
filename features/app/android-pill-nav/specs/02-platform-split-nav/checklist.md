# Checklist: 02-platform-split-nav

## Phase 2.0 — Tests (Red Phase)

### FR1 — Platform Split Logic
- [x] test(FR1): verify `_layout.tsx` does NOT use `USE_NATIVE_TABS` / `ENABLE_NATIVE_TABS` as branch condition (SC1.1)
- [x] test(FR1): verify `Platform.OS === 'ios'` (or `!== 'android'`) used as branch (SC1.2)
- [x] test(FR1): verify NativeTabs path present for iOS branch (SC1.3)
- [x] test(FR1): verify `<Tabs>` + `tabBar` prop present for Android branch (SC1.4)

### FR2 — FloatingPillTabBar Wiring
- [x] test(FR2): verify `FloatingPillTabBar` imported from `@/src/components/FloatingPillTabBar` (SC2.1)
- [x] test(FR2): verify `tabBar` prop present on Android `<Tabs>` referencing `FloatingPillTabBar` (SC2.2)
- [x] test(FR2): verify `tintColor={colors.violet}` passed to FloatingPillTabBar (SC2.3)
- [x] test(FR2): verify `inactiveTintColor={colors.textMuted}` passed to FloatingPillTabBar (SC2.4)
- [x] test(FR2): verify `badgeCounts` passed to FloatingPillTabBar (SC2.5)

### FR3 — Screen Content Padding
- [x] test(FR3): verify `PILL_BOTTOM_OFFSET` constant defined and `>= 100` (SC3.1)
- [x] test(FR3): verify `contentStyle` includes `paddingBottom` in Android screenOptions (SC3.2)
- [x] test(FR3): verify `tabBarStyle: { display: 'none' }` in Android screenOptions (SC3.3)
- [x] test(FR3): verify `headerShown: false` in Android screenOptions (SC3.4)

### FR4 — iOS Path Unchanged
- [x] test(FR4): verify NativeTabs receives `tintColor={colors.violet}` (SC4.1)
- [x] test(FR4): verify NativeTabs receives `iconColor` with default/selected values (SC4.2)
- [x] test(FR4): verify NativeTabs receives `blurEffect="systemUltraThinMaterialDark"` (SC4.3)
- [x] test(FR4): verify NativeTabs receives `backgroundColor` prop (SC4.4)
- [x] test(FR4): verify NativeTabs receives `shadowColor="transparent"` (SC4.5)
- [x] test(FR4): verify `<NoiseOverlay />` still rendered (SC4.6)
- [x] test(FR4): verify `approvalBadge` / `NativeTabs.Trigger.Badge` still wired (SC4.7)

### FR5 — Test Updates
- [x] test(FR5): add new `02-platform-split-nav` describe block to `native-tabs.test.tsx` (SC5.1-SC5.6)
- [x] test(FR5): remove/update prior FR1 `ENABLE_NATIVE_TABS` test in `native-tabs.test.tsx` (SC5.7)
- [x] test(FR5): confirm `layout.test.tsx` needs no changes (SC5.9)

---

## Phase 2.1 — Implementation

### FR1 — Platform Split Logic
- [x] feat(FR1): remove `Constants` import and `USE_NATIVE_TABS` constant from `_layout.tsx`
- [x] feat(FR1): add `const isIOS = Platform.OS === 'ios'` in `TabLayout` component body
- [x] feat(FR1): replace `if (USE_NATIVE_TABS)` branch with `if (isIOS)` branch

### FR2 — FloatingPillTabBar Wiring
- [x] feat(FR2): import `FloatingPillTabBar` from `@/src/components/FloatingPillTabBar`
- [x] feat(FR2): wire `tabBar` prop on Android `<Tabs>` with `tintColor`, `inactiveTintColor`, `badgeCounts`
- [x] feat(FR2): use `TAB_SCREENS.map(...)` to drive Android `<Tabs>` screens (same as legacy path)

### FR3 — Screen Content Padding
- [x] feat(FR3): add `PILL_BOTTOM_OFFSET = 112` module-level constant
- [x] feat(FR3): add `contentStyle: { paddingBottom: PILL_BOTTOM_OFFSET }` to Android `screenOptions`
- [x] feat(FR3): add `tabBarStyle: { display: 'none' }` to Android `screenOptions`

### FR4 — iOS Path Unchanged
- [x] feat(FR4): verify iOS `NativeTabs` path is unmodified after refactor
- [x] feat(FR4): ensure `<NoiseOverlay />` present in Android path

### FR5 — Test Updates
- [x] feat(FR5): run full test suite after changes — all 131 suites pass (3714 tests)

---

## Phase 2.2 — Review

- [x] spec-implementation-alignment: all FR success criteria verified against implementation — PASS
- [x] pr-review-toolkit:review-pr: code quality review completed
- [x] Address any review feedback — fixed dead `Platform.OS === 'android'` check inside iOS branch
- [x] test-optimiser: test quality review — static source analysis, specific assertions, no mocking — PASS

---

## Session Notes

**2026-04-06**: Implementation complete.
- Phase 2.0: 1 test commit (test(FR1-FR5) — 63 tests in native-tabs.test.tsx)
- Phase 2.1: 1 implementation commit (feat(FR1-FR4) — _layout.tsx platform split)
- Phase 2.2: 1 fix commit (fix dead Platform.OS check inside iOS branch)
- All 131 test suites passing (3714 tests).
