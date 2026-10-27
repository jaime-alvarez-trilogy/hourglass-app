# Spec Research: Direct Expo SDK 55 → 58 on the iOS 27 SDK (v1.2.0, build 19)

**Date:** 2026-10-20
**Author:** @jaime-alvarez-trilogy
**Spec:** `10-sdk-58-ios-27`
**Supersedes:** `08-expo-sdk-57-scenes`, `09-sdk-58-xcode-27`. Both stay in the repo as history. Their findings are reused below and corrected where needed.

---

## Problem Context

- **Apple rule.** "Starting April 2027, apps and games uploaded to App Store Connect need to meet the following minimum requirements: iOS and iPadOS apps must be built with the iOS 27 & iPadOS 27 SDK or later". Posted September 9, 2026. Source: https://developer.apple.com/news/?id=k1mtkt1k (fetched 2026-10-20). **Verified.**
- **Scenes.** An iOS 27 SDK build that hasn't adopted the UIKit scene lifecycle traps at launch. Expo's own source says so: "Required by the iOS 27, which asserts at launch unless the app adopts the scene-based life cycle" (`expo@58.0.16` `ios/Expo/ExpoAppSceneDelegate.swift:11-12`, researcher read). The SDK 58 changelog says: "SDK 58 requires the UIScene life cycle, so `npx expo prebuild` now generates **SceneDelegate.swift** and a `UIApplicationSceneManifest` entry in **Info.plist**" (https://expo.dev/changelog/sdk-58, fetched 2026-10-20). **Verified.** Apple's TN3187 page renders client-side, so its body couldn't be retrieved. The crash wording comes from Expo's code and secondary sources only.
- **Spec 09's start trigger is met.** docs.expo.dev/build-reference/infrastructure (fetched 2026-10-20) lists:
  - `macos-tahoe-26.6-xcode-27.1`, tagged `latest` and `sdk-58`: Xcode "27.1 RC (27A9275)", macOS Tahoe 26.6.2, Node 22.23.3.
  - `macos-tahoe-26.6-xcode-27.0`: Xcode "27.0 (27A266a)", Node 22.23.2.

  `expo@58.0.16` is npm `latest`. **Verified** (page re-fetched 2026-10-20 in the critique pass; same rows).
- **27A9275 is the released Xcode 27.1, not a pre-release.** Apple's releases page lists "Xcode 27.1 (27A9275)", October 15, 2026, after "Xcode 27.1 beta (27A9269)", September 18, 2026. It also lists "Xcode 27.2 RC (27B48)", October 19, 2026, which no EAS image has yet (https://developer.apple.com/news/releases/, fetched 2026-10-20). **Verified.** Expo's "RC" label is stale: the image's build number is the GA build. So the earlier assumption that "App Store Connect accepts Xcode 27.1 RC builds" isn't needed (Decision 8).
- **Why one jump instead of two.** Specs 08 and 09 planned 55 → 57 (adding `expo-build-properties` `ios.enableSceneSupport`) and then 57 → 58 (removing it again). Going straight to 58 avoids four costs:
  - A second native build and App Review cycle.
  - A throwaway rebase of the expo-widgets patch against 57.
  - The SDK 57 Hermes V1 memory and startup regressions (fixed in 57.0.9 and 57.0.17; https://expo.dev/changelog/sdk-57, researcher fetch).
  - Adding and then deleting a config flag. On SDK ≥ 58, `enableSceneSupport` is only a prebuild warning: `expo-build-properties@58.0.11` `src/iosSceneSupport.ts:54-61` with `NATIVE_SUPPORT_SDK_MAJOR = 58`. **Verified** by researcher.
- **Baseline.** Worktree `hg-worktrees/sdk58`, branch `feat/sdk-58`, created from `main` at `aade79b`. That commit is exactly build 18: v1.1.0, `expo ~55.0.0` (lockfile 55.0.7), `react-native 0.83.2`. Build 18 is in App Store review. Spec 06's FR1–FR4 exist only on the unmerged branch `feat/dependency-hygiene` (`962d413`, `96035ea`, `91de428`). Spec 06 FR5 (the SDK 55 patch-line refresh) was blocked by the expo-widgets pin (`91de428`) and is dropped here, because SDK 58 replaces it. No tags exist, and no `release/*` branch exists (`git tag`, `git branch -a`, 2026-10-20).
- **Local constraints:**
  - Xcode 27.0 is the only Xcode on this Mac. There's no Simulator.app; Xcode 27 ships Device Hub instead.
  - Node is v22.17.0 and eas-cli is 20.1.0 (`eas --version`).
  - A Metro dev server runs in `WS/hourglassws` on port 8081. Nothing in this spec may touch it.

### Evidence conventions

- **Verified** means the source was read: a fetched URL, a file in an `npm pack` tarball, or a repo file at a line. **Likely** means it was inferred from verified facts. **Unverified** means nobody could read a source for it.
- Tarballs were unpacked read-only into `/tmp/spec10.o6hmwI/<pkg>_<ver>/package/`, and nothing in them was executed. The directory is ephemeral; to re-create it, run `npm pack <pkg>@<ver>` in a new `mktemp -d`. Where a claim comes from one of the six parallel researchers and wasn't re-read here, it says "researcher".

---

## Exploration Findings

### F1. Version map

The source of truth is `expo@58.0.16` `bundledNativeModules.json`, compared against `package.json` with a script on 2026-10-20 (**verified**). It covers every SDK-coupled package. Each non-bundled package uses the newest release whose peer dependencies fit the SDK 58 set. The full contract is in Interface Contracts → I1.

| Package | Now | SDK 58 target | Why / source |
|---|---|---|---|
| `expo` | ~55.0.0 (55.0.7) | ~58.0.16 | npm latest; `engines.node` `^22.13.0 \|\| ^24.3.0 \|\| ^26.0.0 \|\| >=27.0.0` (`npm view`, verified) |
| `react-native` | 0.83.2 | 0.88.0 | bundled. `engines.node` `^22.13.0 \|\| ^24.3.0 \|\| >= 26.0.0` (verified) |
| `react` / `react-dom` | 19.2.0 | 19.3.0 | bundled |
| `expo-router` | ~55.0.7 | ~58.0.24 | bundled. Peers: `react-native-screens ^4.30.0 \|\| ^5.0.0-alpha.3`, `react-native-safe-area-context >= 5.4.0`, optional `@testing-library/react-native >= 14.0.0`, `@expo/ui ^58.0.21` (tarball `package.json`, verified) |
| other `expo-*` (19) | ~55.x | bundled `~58.x` (I1) | bundled |
| `expo-widgets` | ^55.0.5 (patched) | ~58.0.21 | bundled. Also the floor of `babel-preset-expo@58.0.18`'s optional peer `^58.0.21` (`npm view`, verified) |
| `@expo/ui` | (transitive 55.x) | ~58.0.21 (new, **direct**) | Bundled `~58.0.21`. App code requires it directly (`src/widgets/ios/HourglassWidget.tsx:29` `require('@expo/ui/swift-ui')`), and the FR6 test calls `jest.requireActual('@expo/ui/swift-ui')`. The SDK 58 template declares it directly (`npm view expo-template-default@58.0.25 dependencies`: `"@expo/ui": "~58.0.21"`). expo-widgets 58 depends on `@expo/ui ~58.0.21`, and expo-router 58 has the optional peer `@expo/ui ^58.0.21` (tarball `package.json`s). Verified |
| `react-native-reanimated` / `-worklets` | 4.2.1 (patched) / 0.7.2 | 4.7.1 / 0.13.0 | bundled. Reanimated peers: `react-native "0.86 - 0.88"`, `react-native-worklets "0.13.x"` (verified) |
| `react-native-gesture-handler` | ~2.30.0 | ~3.3.0 | bundled (major) |
| `react-native-screens` / `-safe-area-context` | ~4.23.0 / ~5.6.0 | ~4.30.0 / ~5.10.1 | bundled. Screens 4.30 is a hard expo-router peer floor |
| `react-native-svg` / `-web` | 15.15.3 / ~0.21.0 | 15.16.0 / ~0.21.4 | bundled |
| `@shopify/react-native-skia` | 2.4.18 | 2.14.0 | bundled. **Removes the mutable SkPath API** (F2.4) |
| `victory-native` | ^41.20.2 | ^42.0.1 | Not bundled. **Forced by Skia 2.14** (F2.4). 42.0.1 peers: Skia `>=2.6.0 <3.0.0`, reanimated `>=3.19.1`, RNGH `>=2.0.0` (verified) |
| `@react-native-async-storage/async-storage` | 2.2.0 | 2.2.0 | Bundled exact. 3.x is a breaking rewrite that Expo hasn't adopted (researcher, GitHub release 3.0.0) |
| `@react-native-masked-view/masked-view` | ^0.3.2 | 0.3.2 | bundled; also an expo-router dependency |
| `@expo/vector-icons` | ^15.0.3 | ^15.1.1 | Bundled `^15.0.2`. npm latest is 15.1.1, with no `deprecated` field (verified) |
| `nativewind` / `react-native-css-interop` | ^4.2.3 / ^0.2.3 | ^4.2.7 / 0.2.7 | nativewind 4.2.7 depends on css-interop **exactly** `0.2.7`. 5.0 exists only as `rc` (verified) |
| `tailwindcss` | ^3.4.19 | ^3.4.19 | `react-native-css-interop@0.2.7` peers `tailwindcss ~3` (verified) |
| `@tanstack/*` (3) | ^5.90 / ^5.97 | ^5.104.5 (all three) | persist-client 5.104.5 peers `@tanstack/react-query ^5.104.5` (verified) |
| `react-native-android-widget` | ^0.20.1 | ^0.23.0 | Peer `expo >=54.0.0`, the same as 0.22.1. Published 2026-10-20 16:57Z (verified). The 0.23.0 release adds only "Allow configuring widgetCategory" (`gh release view v0.23.0 --repo sAleksovski/react-native-android-widget`, verified). It has no `ios/` directory or podspec, and every mod in `app.plugin.js` (`:14,80-81,151-152,175-176`) is Android-only, so it has no effect on the iOS build (tarball, verified). It stays at the latest release, per the "latest compatible" goal. Fallback: `^0.22.1` (2026-08-17) if a 0.23 regression is reported by FR4 |
| `react-native-inner-shadow` | ^1.3.1 | **remove** | Zero imports; `GlassCard.tsx:14-20` documents why it was removed (verified grep) |
| `@react-navigation/{native,bottom-tabs,elements}` | 7.x / 2.x | **remove** | expo-router 58 has no `@react-navigation/*` dependency or peer (verified, tarball `package.json`) |
| `@expo/ngrok` | ^4.1.0 | **remove** | spec 06 FR3, `96035ea` |
| `jest-expo` | ~55.0.11 | ~58.0.11 | Bundled. Dependencies are all `^30` `@jest/*` plus `test-renderer 1.3.0`. Peer `@react-native/jest-preset ^0.88.0` (required) (tarball, verified) |
| `jest` / `@types/jest` | ~29.7.0 / ^29.5.14 | ^30.5.2 / ^30.0.0 | "In SDK 58 and later, `jest-expo` requires Jest 30" (https://docs.expo.dev/develop/unit-testing/, fetched) |
| `@testing-library/react-native` | ^13.3.3 | ^14.1.0 | Forced: expo-router's optional peer `>= 14.0.0` conflicts with an installed 13.x (F2.2). 14.x peers `test-renderer ^1.0.0`. `render`, `renderHook`, `fireEvent` and `act` return Promises, and the `UNSAFE_*` queries are removed (F2.2; tarball `docs/guides/migration-v14.md:13,141-149,346-355`, `dist/events/fire-event.d.ts:3-6`, verified). Needs Node `^22.13.0 \|\| >=24` (`migration-v14.md:14,55`) |
| `test-renderer` | — | 1.3.0 (new) | Exact, to match jest-expo's own dependency so only one copy exists |
| `react-test-renderer` + `@types/react-test-renderer` | (transitive 19.2.0) / ^19.1.0 | 19.3.0 / ~19.3.0 (new explicit) | Decision 4. Today it arrives only as a transitive dependency of RNTL 13 and jest-expo 55 (`npm ls`, verified). 19.3.0 peers `react ^19.3.0` |
| `@react-native/jest-preset` | — | 0.88.0 (new) | jest-expo 58 peer |
| `typescript` | ~5.9.2 | ~6.0.3 | SDK 58 template pin (`expo-template-default@58.0.25`, verified). 7.x is ruled out: `@typescript-eslint/parser@8.72.0` (latest) peers `typescript >=4.8.4 <6.1.0` (verified) |
| `@types/react` | ~19.2.10 | ~19.3.0 | template pin |
| `@types/node` | ^25.3.5 | ^22.20.5 | Matches the Node 22 runtime of CI and EAS. Odd Node majors are unsupported (SDK 58 changelog) |
| `eslint` / `eslint-config-expo` | ^9.25.0 / ~55.0.0 | ^9.39.5 / ~58.0.4 | eslint 10 is npm latest, but `eslint-plugin-import` (a dependency of eslint-config-expo) peers `eslint … \|\| ^9` (verified). eslint-config-expo 58 also moves `eslint-plugin-react-hooks` from 5.2.0 (installed) to `^7.0.0`, which turns on the React Compiler lint rules (F2.2) |
| `patch-package` | ^8.0.1 | ^8.0.1 | latest; with no patches it prints "No patch files found" and exits 0 (`node_modules/patch-package/dist/applyPatches.js:58-61`, verified) |
| eas-cli (global) | 20.1.0 | ≥ 25.2.0 | Decision 12. No hard client floor was found for the Xcode 27 images |

### F2. Breaking changes that hit this app

#### F2.1 expo-router 58 (navigation)

| Change | Sites | Evidence | Conf. |
|---|---|---|---|
| No `@react-navigation/*` dependency. The root exports `useIsFocused`, `useNavigation`, `DarkTheme`, `DefaultTheme`, `ThemeProvider` and `useTheme` | `app/_layout.tsx:6`; `src/components/FadeInScreen.tsx:18`; `src/hooks/useFocusKey.ts:2`; `src/hooks/useStaggeredEntry.ts:29` | `expo-router@58.0.24` `build/exports.d.ts:20-26` | verified |
| `useIsFocused` is already exported by the **SDK 55** expo-router | same three hook sites | `node_modules/expo-router/build/exports.d.ts:26` (55.0.7) | verified |
| The root `Tabs` export is `@deprecated Use import { Tabs } from 'expo-router/js-tabs'`. `./tabs` and `./js-tabs` map to the same file, which also exports `BottomTabBarProps` / `BottomTabBarButtonProps` | `app/(tabs)/_layout.tsx:24`; `src/components/FloatingPillTabBar.tsx:18` | `build/exports.d.ts` (Tabs block); `package.json` `exports["./tabs"]` = `exports["./js-tabs"]`; `build/layouts/Tabs.d.ts:6` | verified |
| `expo-router/unstable-native-tabs` is deprecated in favor of `expo-router/native-tabs` (same names). Every prop the app passes (`tintColor`, `iconColor`, `backgroundColor`, `blurEffect`, `disableTransparentOnScrollEdge`, `shadowColor`) and `Trigger.Icon/Label/Badge` still exist | `app/(tabs)/_layout.tsx:23,82-110` | `build/unstable-native-tabs.d.ts`; `build/native-tabs/types.d.ts`; `build/native-tabs/NativeTabTrigger.d.ts:42-45` | verified |
| `initialRouteName` is `Omit`ted from the Stack navigator props, so it becomes a type error. The guide says: "Remove `initialRouteName` navigator prop; use `export const unstable_settings = { anchor: 'index' }`" | `app/(auth)/_layout.tsx:8` (`initialRouteName="welcome"`) | `build/layouts/StackClient.d.ts:8`; https://docs.expo.dev/router/migrate/sdk-57-to-58/ (fetched) | verified |
| "Stack headers on iOS 26 and later use the system bar appearance by default" | `app/_layout.tsx:160` (`modal` screen, header shown, `title: 'Modal'`) | sdk-57-to-58 guide | verified (visual impact: device QA) |
| "`useNavigation` now throws when it is called outside a navigator"; "Declare every route that should appear in the navigator UI"; `freezeOnBlur`, `initialParams` and `redirect` were removed | No `useNavigation`, `freezeOnBlur`, `initialParams` or `redirect=` in app code. `app/(tabs)/explore.tsx` is undeclared, which is intended (it's a hidden Expo-starter placeholder) | grep 2026-10-20; sdk-57-to-58 guide | verified |
| The SDK 56 codemod silently misses 25–50% of import sites | — | https://github.com/expo/expo/issues/46481 (researcher fetch) | verified |
| `PlatformPressable` survives only in the deprecated `expo-router/react-navigation` fork ("Copy the component into your codebase") | `components/haptic-tab.tsx:2`. The file is dead: nothing in `app/` imports it, and only `src/components/__tests__/HapticTab.test.tsx` references it | `build/react-navigation/elements/index.d.ts:97-100` (researcher); grep | verified |

#### F2.2 Test toolchain (forced by peer dependencies)

| Change | Impact | Evidence | Conf. |
|---|---|---|---|
| expo-router 58 has the optional peer `@testing-library/react-native >= 14.0.0`. npm still validates an optional peer that's installed, and expo-router is a root dependency, so npm can't nest its way out | `npx expo install` with RNTL 13 present would ERESOLVE | tarball `peerDependenciesMeta`; npm optional-peer semantics | peer verified; npm behavior **likely** |
| RNTL 14 replaces the `react-test-renderer` peer with `test-renderer ^1.0.0`. jest-expo 58 depends on `test-renderer 1.3.0` | 61 test files import `react-test-renderer` directly, but it's in neither `dependencies` nor `devDependencies`. Today it's only transitive (`npm ls`: RNTL 13.3.3 and jest-expo 55.0.11). After the upgrade it disappears and all 61 files fail to resolve | grep (61 files); `npm ls react-test-renderer` | verified |
| RNTL 14's `render` / `renderHook` / `rerender` / `unmount` / `fireEvent` / `act` return Promises | 2 files use RNTL: `__tests__/auth-screens.test.tsx`, `src/__tests__/hooks/useWidgetSync.test.ts` (`rerender` at `:133,147,195,290,360`) | unpkg `@testing-library/react-native@14.1.0/dist/render.d.ts:16`, `render-hook.d.ts:19`; tarball `dist/events/fire-event.d.ts:3-6`, `docs/guides/migration-v14.md:13,141-149` | verified |
| RNTL 14 removed the legacy `UNSAFE_getAllByType` / `UNSAFE_getByType` / `UNSAFE_getAllByProps` / `UNSAFE_getByProps` queries. `test-renderer` renders host elements only, so a query by a composite type (`TouchableOpacity`, `TextInput`) has no one-for-one port | `__tests__/auth-screens.test.tsx` has 71 lines with `UNSAFE_` (`grep -c`): 64 `UNSAFE_getAllByType` and 9 `UNSAFE_queryAllByType` calls (`grep -o | uniq -c`) and 13 un-awaited `fireEvent.*` calls, e.g. `:139-203`. It needs a rewrite onto `getByText` / `getByRole` / `getByPlaceholderText` / `getByTestId`. The `(auth)` screens have no `testID` today (`grep -c testID "app/(auth)/"*.tsx` → 0), so some must be added | tarball `docs/guides/migration-v14.md:346-355` ("Legacy `UNSAFE_*` queries removed"); repo grep | verified |
| Tests that hard-code `@react-navigation` paths (the source walk skips `__tests__`, so it can't flag them) | FR2: `src/hooks/__tests__/useStaggeredEntry.test.ts:132-135` asserts the hook imports `useIsFocused` from `@react-navigation/native`. `src/components/__tests__/FadeInScreen.test.tsx:22-24` mocks it with `jest.requireActual('@react-navigation/native')` and has **no** `expo-router` mock. `app/(tabs)/__tests__/index.test.tsx:54`, `indexConeIntegration.test.tsx:45`, `src/components/__tests__/AITab.test.tsx:168` and `AITabConeIntegration.test.tsx:160` mock `@react-navigation/native` for `useIsFocused`, and each already has an `expo-router` mock. FR4: `src/components/__tests__/FloatingPillTabBar.test.ts:310-314` asserts `from '@react-navigation/bottom-tabs'`. `app/__tests__/layout-notifications.test.tsx:103-110` mocks `@react-navigation/native` for `ThemeProvider`/`DarkTheme`/`DefaultTheme`, and its `expo-router` mock (`:84-97`) has none of them. A non-virtual `jest.mock` of a module that no longer resolves throws, so the whole notification-handler suite would fail to load once FR4 removes the package | repo files at the lines cited; expo-router 58 has no `@react-navigation/*` dependency or peer (tarball `package.json`) | verified |
| `server/` tests run on the **root** jest, `babel-jest` and `babel-preset-expo` (`server/jest.config.js:5-13`, `moduleDirectories: ['node_modules', '../node_modules']`; `server/package.json` has no jest dependency). The root jest config ignores `/server/` (`jest.config.js:4`) | Root `npm test` never exercises Jest 30 or babel-preset-expo 58 against `server/`; only CI's `server-tests` job does | repo files | verified |
| `eslint-config-expo@58.0.4` depends on `eslint-plugin-react-hooks ^7.0.0` (installed today: 5.2.0) and spreads `pluginReactHooks.configs.recommended.rules` (`flat/utils/react.js`). In 7.1.1 the `recommended` preset adds the React Compiler rules; `purity`, `refs`, `immutability`, `set-state-in-render`, `static-components`, `use-memo`, `error-boundaries` and others map to `'error'` (`cjs/eslint-plugin-react-hooks.development.js:52067,52076-52091,55419-55431`) | `npm run lint` is a CI gate (spec 07) and will likely go red at FR4. A likely hit is `app/(tabs)/index.tsx:201`, which calls `new Date()` during render (`purity`) | `npm view eslint-config-expo@58.0.4 dependencies`; tarballs | verified (rule set); hit count **likely** |
| Jest 30 removed the `toBeCalled*` / `toReturn*` / `lastCalledWith` / `nthCalledWith` / `toThrowError` aliases and `genMockFromModule` | 0 uses in the repo | grep for each alias, 2026-10-20 | verified |
| jest-expo 58's preset `transformIgnorePatterns` adds `standard-navigation` (a new expo-router dependency) and excludes `/node_modules/react-native-reanimated/plugin/` and `/node_modules/@react-native/babel-preset/` ("Reentrant plugin detected") | `jest.config.js:19-21` overrides the key, so it must add all three | `jest-expo@58.0.11/jest-preset.js:144-149` | verified |
| `jest-expo/node` still exists | `jest.config.js:2` unchanged | `jest-expo@58.0.11/node/jest-preset.js` | verified |

#### F2.3 react-native-gesture-handler 2 → 3: no code change

- Two researchers disagreed. One said `.onStart`/`.onEnd` were renamed to `.onActivate`/`.onDeactivate`. The other said the builder API was unchanged.
- **Resolution:** the v3 docs' renames apply to the new hook API only (`usePanGesture` etc.). In `react-native-gesture-handler@3.3.0`:
  - The builder `Gesture.Pan()` keeps `onBegin` / `onStart` / `onUpdate` / `onEnd(event, success)` / `onFinalize(event, success)` (`src/handlers/gestures/gesture.ts:182-230`). It's marked `@deprecated … migrate to the new, hook-based API` (`gestureObjects.ts:19,40`) but still works.
  - The v3 `GestureDetector` forwards any `BaseGesture`/`ComposedGesture` to the legacy detector (`src/v3/detectors/GestureDetector.tsx:20-25`).
  - It calls `useEnsureGestureHandlerRootView()`. The app's root already wraps everything in `GestureHandlerRootView` (`app/_layout.tsx:170-177`).
  - `GestureType` is still exported, as deprecated (`src/index.ts:120`).
- **Verified.** No source change at `ApprovalCard.tsx:93-166`, `useScrubGesture.ts:91-115`, `overview.tsx:138-147` or `AIConeChart.tsx:34`. Migrating to hooks is a later follow-up.

#### F2.4 Skia 2.14 removes the mutable SkPath API, which forces victory-native 42 (new finding)

- **The removal.** The Skia v2.14.0 release (2026-10-01) lists "🧹: remove mutable SkPath API and deprecation warnings (#4092)" under *Features*. It isn't labeled breaking (`gh release view v2.14.0 --repo Shopify/react-native-skia`, verified).
  - The `SkPath` interface in 2.14.0 has no `moveTo`, `lineTo` or `trim` methods, while 2.13.0 still has `moveTo` (`:89`), `lineTo` (`:102`) and `trim` (`:439`). Source: unpkg `lib/typescript/src/skia/types/Path/Path.d.ts` for both versions, verified.
  - Mutation now goes through `Skia.PathBuilder.Make()` → `.moveTo().lineTo().build()` (`PathBuilder.d.ts:18,32,195`, `Skia.d.ts:49`). Trimming goes through `Skia.Path.Trim(path, start, end, isComplement)` (`PathFactory.d.ts:85`).
- **App sites that break:**
  - `src/components/ScrubCursor.ts:42-44`: `Skia.Path.Make(); linePath.moveTo(…); linePath.lineTo(…)`.
  - `src/components/AIArcHero.tsx:146-150`: `fullSkiaPath.copy(); p.trim(0, sweepProgress.value, false)` inside a `useDerivedValue`.
  - Verified by grep. No other `Skia.Path` mutation exists in app code.
- **Version-neutral replacements** exist in both 2.4.18 and 2.14.0 (unpkg `.d.ts` for both, verified):
  - `Skia.Path.MakeFromSVGString`.
  - The `<Path start end>` props (`dom/types/Drawings.d.ts:12-18`).
  - So the fix can land **before** the SDK bump, on SDK 55 (Decision 2).
- **victory-native 41.26.0 (latest 41.x) still mutates paths:**
  - `src/cartesian/components/Scatter.tsx:82-86` (`Skia.Path.Make()` → `path.moveTo` / `path.lineTo`).
  - `CartesianAxis.tsx:243`, `Frame.tsx:18`, `useBarGroupPaths.ts:39`, `useCandlestickPaths.ts:135`.
  - Verified in the npm tarball.
  - The 41.x peer range (`skia >=1.2.3 <3.0.0`) allows 2.14, so npm won't stop it. It would break at runtime.
  - 42.0.0's only major change is "Raise minimum `@shopify/react-native-skia` to `>=2.6.0` and migrate chart path construction to the immutable `PathBuilder` API" (GitHub release `victory-native@42.0.0`, verified). 42.0.1 still exports `CartesianChart`, `Line`, `Bar`, `Area` and `useChartPressState` (`src/index.ts`, verified).
- **Corrections.** This finding corrects the third-party researcher ("no breaking found in v2.5–v2.14"; release-note grep for "breaking") and spec 09 Out of Scope 3 ("victory-native 42 … descoped unless forced"). It is forced.

#### F2.5 react-native-reanimated 4.7.1

- Requires RN `0.86 – 0.88` and worklets `0.13.x` (verified).
- `patches/react-native-reanimated+4.2.1.patch` targets a `_requiresAnimatedComponent` throwing getter that 4.7.1 no longer has. The only remaining reference is an `in` check at `src/createAnimatedComponent/InlinePropManager.ts:79`. A GitHub code search on the repo returns 0 hits. Two researchers checked the tarball independently; **verified**. Delete the patch. It can't stay: `--error-on-fail` would fail `npm ci`.
- 4.7.0's breaking changes (GitHub release 4.7.0, researcher fetch, verified):
  - The light-tree layout-animation engine is now the default.
  - Mutables always use Synchronizable state.
  - `AnimatedRefOnUI` is a Shareable read with `.value`, and `measure()` on an unmounted ref returns `null`.
- The app has no `entering`, `exiting` or `layout=` props (grep, verified). It uses `sharedTransitionTag` through `src/lib/sharedTransitions.ts:21-24` at `index.tsx:514,545`, `overview.tsx:439` and `ai.tsx:217`. Across tabs that's effectively a no-op; check on device for warnings.
- `useAnimatedRef` appears only in `components/parallax-scroll-view.tsx:28`, which is used only by the dead `explore.tsx`.

#### F2.6 expo-widgets 55.0.5 → 58.0.21

The patch is 130,007 bytes, of which 125,456 are a prebuilt `bundle/build/ExpoWidgets.bundle` Metro artifact. Status of each intent against 58.0.21 (`expo-widgets@58.0.21` tarball and CHANGELOG, re-read here unless marked):

| Intent | Patch lines | 58.0.21 status | Action | Conf. |
|---|---|---|---|---|
| A. Prebuilt `ExpoWidgets.bundle` | 1-100 | Obsolete. 58.0.17: "Rebuild the widgets JS bundle on every Xcode build" (#50200); the bundle also needs `ExpoWidgetsLayoutRegistry.json` | drop | verified |
| B. Podspec script-path quoting | 101-113 | Fixed in 58.0.0: "Quote script-phase paths so iOS builds work from a project path containing a space" (#48747) | drop | verified |
| C. `basename "$PROJECT_DIR"` quoting | 163-175 | Same fix (#48747) | drop | verified |
| D. `.containerBackground(#0D0D1A)` in `EntryView.swift` | 114-126 | Hook point gone. 56.0.0 removed the hard-coded background "in favor of @expo/ui modifier"; 58's `EntryView.swift:27-37` renders `WidgetsDynamicView` with no background | JS `containerBackground` modifier, plus the native fallback (Decision 5) | verified |
| E. `.after(15 min)` reload policy | 127-140 | 58 still `.atEnd` (`ios/Widgets/TimelineProvider.swift:34`). The hunk would rebase. A reload only re-reads App Group data; 96 reloads a day exceeds WidgetKit's 40–70/day budget (researcher, Apple WidgetKit doc JSON) | drop, plus the `env.date` fix | verified / likely |
| F. `autolinking.rb` `.send(:resolve)` | 145-153 | No-op: `resolve` is public in autolinking 55.0.10 and 58.0.13 (researcher) | drop | verified (researcher) |
| G. `APPLICATION_EXTENSION_API_ONLY=No` for `ExpoWidgets` | 154-162 | 58's `expo_widgets_post_install` sets it to `No` for `ExpoModulesCore`, `ExpoUI` and every `React-*` pod target, but not for `ExpoWidgets` (`scripts/autolinking.rb:26-33`, verified). ExpoWidgets' Swift uses no extension-unavailable API (researcher grep). Under SDK 58's precompiled modules (F2.8), the setting is a no-op for any pod that resolves to a prebuilt XCFramework | drop provisionally. Proven by the Checkpoint B / FR7 EAS development builds (Debug) and the mandatory FR9 Release compile | **unverified** until Checkpoint B |

Other 58 changes that hit `src/widgets/bridge.ts`:

- **Props may be undefined.** 58.0.0 "Handle undefined props instead fallback to empty object" (#46492, CHANGELOG `:162`, verified). The layout dereferences `props.*` directly at `bridge.ts:475-487`, so the placeholder and the widget gallery would throw.
- **Stack spacing.** `@expo/ui` 58: "Fix `HStack`, `VStack` … collapsing an unset `spacing` to `0` … they now use the system default spacing … Pass `spacing={0}` explicitly to keep the previous layout" (`@expo/ui@58.0.21` CHANGELOG `:188`, verified). Unspaced `HStack`s are at `bridge.ts:600,617,702,735,779` (verified grep).
- **Stored layout wins.** `WidgetsLayoutRegistry.layout(for:)` returns the App Group key `__expo_widgets_<name>_layout` first, and the build-time embedded layout only after that (`ios/Widgets/WidgetsLayoutRegistry.swift:9-19`, verified). The key is unchanged from 55 (`ios/WidgetObject.swift:8`, both versions, verified). So after the 1.1.0 → 1.2.0 auto-update, home-screen widgets keep evaluating build 18's layout string, which has no `containerBackground`, until the user opens 1.2.0. iOS 17+ shows its "adopt containerBackground API" placeholder for a background-less widget; the 58.0.16 CHANGELOG `:49-50` describes exactly that placeholder. **Likely.** Decision 5.
- **The placeholder renders a red box until 1.2.0 is first opened.** This is the same update window, but a different symptom.
  - `placeholder(in:)` always passes `WidgetsLayoutRegistry.initialProps(for:)` (`ios/Widgets/TimelineProvider.swift:4-5`). So do `getSnapshot` and `parseTimeline` when no timeline is stored (`TimelineProvider.swift:14,19`; `ios/Widgets/Utils.swift:18-19`). `initialProps(for:)` reads `__expo_widgets_<name>_initial_props`, then the embedded registry (`WidgetsLayoutRegistry.swift:21-26`).
  - Build 18 never stored initial props: 55's `WidgetObject.swift:8` stores only the layout. 58 stores them only when `createWidget` gets them (`WidgetObject.swift:6-12`). No layout is embedded either, because the app sets no `ios.initialLayout`.
  - So the props are `nil`. The runtime then passes `undefined` (`ios/Widgets/WidgetsJSRuntime.swift:20-22`, #46492). Build 18's stored layout dereferences `props.hoursDisplay` etc. directly (`src/widgets/bridge.ts:475-487` at `aade79b`), which throws. A failed evaluation renders `createRedBox` (`Utils.swift:65-77`). All verified.
  - What it affects: the **placeholder** for every upgrader, and the gallery snapshot when there's no stored timeline (a fresh install that has never been opened). An upgrader who has a stored build-18 timeline gets `entries.first` with real props in the gallery and the timeline (`TimelineProvider.swift:18-19,32`). That part is **likely**; the device check is FR11 smoke 17.
  - FR6's `props = props || {}` and the `createWidget(…, initialProps)` call fix this only after 1.2.0 has run once.
  - `ios.initialLayout` (`plugin/src/types/WidgetConfig.type.ts:20`) embeds a build-time layout **and its `initialProps`** (`scripts/build-layout-registry.mjs:133-143`). The embedded initial props would cover the placeholder, because `initialProps(for:)` falls back to them. But it bundles a module through expo-widgets' own Metro config, and `bridge.ts` isn't written for that. It's recorded as a follow-up option (Decision 5), not adopted here.
- **The entry date is passed in.** `env.date` = the entry timestamp (`bundle/index.ts:68-71`, verified). The layout uses `Date.now()` at `bridge.ts:507`.
- **The `containerBackground` modifier exists** in `@expo/ui` 58 (`build/swift-ui/modifiers/index.d.ts:7,1359`, verified). Its signature is `(style, container)`, with `'widget'` placement (researcher).
- **Android autolinking.** `expo-module.config.json` `platforms` is `["apple","android"]`, with the `io.github.expo.peek.glance-fork` gradle plugin (verified). In 55 it was apple-only. `expo.autolinking.android.exclude` is honored (`expo-modules-autolinking@58.0.13` `build/commands/autolinkingOptions.js:70-112`, verified).
- **Types ship with the package.** `package.json` `types: build/index.d.ts` (verified), so the ambient `declare module 'expo-widgets'` at `src/types/modules.d.ts:50-61` is stale.
- **Generated widget file.** The extension's Swift file is generated by a `withDangerousMod` at `ios/ExpoWidgetsTarget/<Name>.swift` as `WidgetsEntryView(entry: entry)` (`plugin/src/ios/withWidgetSourceFiles.ts:69,137-140,347-364`; `withIosWidgets.ts:35`, verified).
- **Mod order.** A mod added by a later plugin runs **before** the previously registered mod (`@expo/config-plugins@58.0.9` `build/plugins/withMod.js`: `action` first, then `nextMod`; verified). A plugin that edits the generated widget Swift must therefore be listed **before** `"expo-widgets"`.

#### F2.7 `expo/fetch` is `globalThis.fetch` (SDK 56+)

- **Where it's installed.** `expo@58.0.16` `src/winter/runtime.native.ts` installs `expo/fetch` unless `EXPO_PUBLIC_USE_RN_FETCH` is `1` or `true` (verified).
- **Behavior differences from RN fetch** (`src/winter/fetch/*`, verified):
  - The default is `credentials: 'include'`, and `same-origin` is treated as `include` (`fetch.ts:48-51,70`).
  - Network and abort errors are `FetchError extends Error` (`FetchErrors.ts:1`).
  - A second body read throws `TypeError: Failed to execute '<m>' on 'Response': Response body is already used` (`FetchResponse.ts:495-501`).
  - `json()` is `JSON.parse(await this.text())`.
- **Call sites** (verified grep; this corrects the inventory researcher's "no direct fetch()"):
  - `src/api/client.ts:36` (token mint), `:223` (`apiGet`), `:261` (`apiPut`).
  - `src/lib/pushToken.ts:35` (register), `:65` (unregister).
- **Current safeguards.** `parseBody` (`client.ts:197-200`) already tolerates an empty body (the build-11 fix). It still throws a raw `SyntaxError` on a non-JSON 2xx body. `handleStatus` (`:139-182`) reads the body once and catches parse errors. The jest tests mock `global.fetch`, so they test the parsing contract, not expo/fetch.
- **Whitespace and the PUTs (critique pass).** `text ? JSON.parse(text) : undefined` treats `' '` or `'\n'` as non-empty. The approve/reject PUTs discard their result (`src/api/approvals.ts:61,80,97,115` `await apiPut<unknown>(`), and they return an empty body on 200 (`docs/CROSSOVER_API.md:476,712`). FR3 therefore treats `text.trim() === ''` as empty.
  - A non-JSON, non-blank 2xx still becomes `ApiError` on PUT as well. A 200 HTML page (a captive portal or proxy) means the PUT may never have reached Crossover, so reporting success would be worse than an error.
  - After an error the approvals list refetches (`src/hooks/useApprovalItems.ts:155-162`: the optimistic list is restored, then `invalidateQueries` runs in `finally`), which shows the real state before the user retries. Verified (repo).

#### F2.8 Native config and tooling

| Change | Impact | Evidence | Conf. |
|---|---|---|---|
| Template: `class SceneDelegate: ExpoAppSceneDelegate`; `AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider` with no window creation; Info.plist `UIApplicationSceneManifest` = `{UIApplicationSupportsMultipleScenes: false, UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate"}`; `UILaunchStoryboardName: SplashScreen`; `IPHONEOS_DEPLOYMENT_TARGET = 16.4`; Podfile `'16.4'` | Nothing to configure. FR9 asserts the prebuild output | `expo-template-bare-minimum@58.0.25` `ios/HelloWorld/{SceneDelegate.swift,AppDelegate.swift:6,23,Info.plist}`, `project.pbxproj:255,283`, `Podfile:23` | verified |
| Minimum iOS is 16.4 (it was 15.1 on SDK 55). This drops iPhone 6s/7/SE1-class devices running < 16.4 | What's New and support page | SDK 56 changelog (fetched); template | verified |
| Under the scene lifecycle, cold-start URLs arrive through `scene(_:willConnectTo:options:)`. `ExpoAppSceneDelegate` rebuilds `launchOptions` for `Linking.getInitialURL()` and forwards `openURLContexts` | Deep links still work. Check on device | `expo@58.0.16` `ios/Expo/ExpoAppSceneDelegate.swift:56-75` (researcher) | verified (code), device check pending |
| AppState still fires: RN observes `UIApplication` notifications, which UIKit still posts for a single-scene app | `app/_layout.tsx:63`, `useAIData.ts:376`, `useScheduledNotifications.ts:276`, `useRoleRefresh.ts:103` | spec 08 research (`RCTAppState.mm:85-91`) | likely; device check |
| The app has **no** notification-tap routing (no `addNotificationResponseReceivedListener`, `useLastNotificationResponse` or `getLastNotificationResponseAsync`) | A tap from a killed app just cold-launches to the default route | grep 2026-10-20 | verified |
| Foreground notifications are now shown by default, but the app sets `setNotificationHandler` with all fields | No change | `expo-notifications@58.1.5` CHANGELOG 58.0.0 (researcher); `app/_layout.tsx:48` | verified |
| On iOS 27, `UIRequiresFullScreen` "no longer opts an app out of resizing. It requests discrete resizing that honors the supported interface orientations, it applies to iPhone as well as iPad, and Apple has deprecated it" (`@expo/config-plugins@58.0.9` `build/ios/RequiresFullScreen.js:45-47`). So `requireFullScreen: true` **does** constrain how a portrait-only app resizes, on both iPhone and iPad. It also skips the four-orientation iPad write (`:62-78`). **The iPad four-orientation write is not new**: SDK 55's `RequiresFullScreen.js` has the same `isTabletEnabled && !requiresFullScreen` branch; 58 only adds the comment and warning text | Decision 10 offers both options. Run the resizability QA matrix either way | `@expo/config-plugins@58.0.9` vs `node_modules/@expo/config-plugins` (55) `build/ios/RequiresFullScreen.js`; SDK 58 changelog | verified (corrects the apple-ios27 researcher's "new silent default", and the earlier "can't stop resizing" wording here) |
| **Precompiled Expo modules are on by default.** The SDK 58 template Podfile adds `ENV['EXPO_USE_PRECOMPILED_MODULES'] ||= '1'`, with an explicit `false` in `Podfile.properties.json` winning over an EAS-exported env var; the SDK 55 template has neither line (`expo-template-bare-minimum@58.0.25` `ios/Podfile:19-22` vs `@55.0.16`, `diff`). `expo-modules-core@58.0.23` ships `prebuilds/output/{debug,release}/xcframeworks/{ExpoModulesCore,ExpoModulesWorklets}.tar.gz` (`tar -tzf`). `@expo/ui` 58.0.19 *stopped* shipping a precompiled framework (`CHANGELOG.md:21`), and `expo-widgets` and `expo` ship no prebuilds (`tar -tzf`). Autolinking's precompiled path has had a run of multi-target and app-extension fixes: 58.0.0's duplicate-pod error "in a Podfile with multiple targets" and its app-extension link fix (`expo-modules-autolinking@58.0.13` `CHANGELOG.md:110-111`), and 58.0.11's React-only dependency fix (`:22`). `pod install` prints one `[Expo-precompiled]` line for each prebuilt pod resolution (`scripts/ios/precompiled_modules.rb:2282,2287`) | Our Podfile has two targets (app + `ExpoWidgetsTarget`, `expo-widgets@58.0.21` `plugin/src/ios/withPodsLinking.ts:44-75`). Hunk-G-style `APPLICATION_EXTENSION_API_ONLY` settings don't reach a prebuilt XCFramework. The only supported off switch is `expo-build-properties` `ios.usePrecompiledModules: false` → `EXPO_USE_PRECOMPILED_MODULES` (`expo-build-properties@58.0.11` `build/ios.js:72-74`, `build/pluginConfig.d.ts:419`). Decision 9 allows exactly that entry as the fallback. Checkpoint B's EAS log and FR9's local `pod install` record the `[Expo-precompiled]` lines | tarballs, `diff` | verified |
| An app extension must not contain a `Frameworks/` directory; App Store validation rejects that bundle (ITMS-90206) | If precompiled or dynamic frameworks get embedded into `ExpoWidgetsTarget.appex`, the upload fails | Apple validation error (known); not re-read this pass | **unverified** source; checked cheaply in FR9 and I5 |
| `@expo/fingerprint` 0.16.6 → 0.21.5. `DEFAULT_PRESET = 'balanced'`: its sourceSkips add `ExpoConfigRuntimeVersionIfString`, `EasJson`, `Easignore`, `AutolinkingConfigPaths`, and it sets `nativeModuleSourceType` / `configPluginSourceType` to `'package'`. User config is spread over the preset, so our `sourceSkips` array **replaces** the preset's skips | Merge in the balanced skips (Decision 11) | `@expo/fingerprint@0.21.5` `build/Presets.js`, `build/Options.js` (`normalizeOptionsAsync`) | verified |
| `patches/` is still content-hashed whatever the source type (`sourcer/PatchPackage.js:26-31`), and in-repo config plugin files are "hashed directly" (`sourcer/Expo.js:161-162`) | docs/RELEASING.md's "patches/ forks the runtime" stays true. A local widget plugin forks the runtime when edited | same tarball | verified (corrects the tooling researcher's "patched modules become invisible") |
| Expo CLI forces `NODE_ENV`; Router defaults to `web.output: "server"`; Node ≥ 22.13 / 24.3 / 26; RN 0.87's Strict TS API makes `react-native/Libraries/*` deep imports type errors | `app.json` already pins `web.output: "static"`. There are 0 deep imports and no code reads `NODE_ENV`. CI's `node-version: '20'` must change (`.github/workflows/test.yml:14,33`) | SDK 58 changelog (fetched); grep | verified |
| `expo/tsconfig.base` `jsx` changes from `react-native` to `react-jsx` | Possible typecheck fallout | `expo@58.0.16/tsconfig.base.json` vs 55 | verified |
| eas-cli v22.0.0: build objects in `--json` output now have `runtime` (`{id, version}`) and `updateChannel` in place of `runtimeVersion` and `channel`; other `eas update` JSON is unchanged. v24.4.2: "Support Xcode 27, which replaces Simulator.app with Device Hub". v24.4.0: Node `^20.18.3 \|\| >=22.0.0`. v24.9.0 (build-tools): SDK 58 builds upload the embedded bundle by default | `scripts/ota-publish.sh:94` reads `b.runtimeVersion` from `eas build:list --json`. On eas-cli ≥ 22 the audience guard reads an empty runtime and refuses every publish (fail-closed). `ota-publish.sh:63-72` resolves the local runtime from **local `node_modules`** (`npx expo-updates runtimeversion:resolve`), so any runtime recorded after a `git switch` must come after a fresh `npm ci` | `gh release view v22.0.0 / v24.4.0 / v24.4.2 / v24.9.0 --repo expo/eas-cli`; repo script | release notes verified; script impact **likely** |
| `eas submit` reads `submit.production.ios.ascApiKeyPath` = `.appstore/AuthKey_W4UV4XTKPC.p8`, a project-relative path (`eas.json:11`). `.appstore/` is gitignored (`.gitignore:57,62`) and **absent from this worktree** (`ls .appstore` → "No such file or directory"). It exists only in the main checkout `WS/hourglassws/.appstore/` (key, `api_key.json`, `asc.js`), which the ground rules put off-limits | As written, the FR11 upload fails for lack of the key, and every `node .appstore/asc.js` step (FR5 build number, FR11 ASC prep) would have to run in the off-limits checkout | repo; spec 05 `spec.md:20` ("exists only in the main checkout") | verified. Decision 16 |
| The `build:list` `--runtime-version` flag still exists in 25.2.0 | The guard query still works | `eas-cli@25.2.0` `build/commands/build/list.js:44-45` | verified |

#### F2.9 Unchanged (no action)

- `expo-file-system/legacy` (`src/lib/log.ts:13`).
- `expo-secure-store`, `expo-splash-screen`, `expo-symbols`, `expo-image`, `expo-blur`, `expo-system-ui`, `expo-web-browser`, `expo-application`, `expo-dev-client`. Their only 56–58 breaking entry is the iOS 16.4 minimum (researcher, CHANGELOGs).
- `@expo/vector-icons` keeps working at 15.1.1 (peer `expo-font >=14.0.4`).
- The privacy-manifest categories are unchanged for iOS 27. No new required-reason category was found (**unverified**; re-check before submission). The **widget extension** is not unchanged, though: see F2.10.
- New Architecture: already mandatory on RN 0.83.
- The same `babel-preset-expo` auto-adds the worklets plugin on 55 and 58, so the explicit `react-native-reanimated/plugin` in `babel.config.js` is not a new duplication (`babel-preset-expo@58.0.18` `build/configs/expo.js:104-116` vs 55 `build/index.js:313-320`, verified).

#### F2.10 The widget extension has no privacy manifest (critique pass)

- **RN's aggregation writes only the app's manifest.** `get_application_targets` keeps `t.symbol_type == :application` (`react-native@0.88.0` `scripts/cocoapods/privacy_manifest_utils.rb:52-54`), and `add_aggregated_privacy_manifest` writes and references the file only for those targets (`:7-50`). `ExpoWidgetsTarget` is an app extension, so it never gets one. Verified.
- **The appex links React Native and calls required-reason APIs.**
  - expo-widgets 58 runs `use_react_native!(… :privacy_file_aggregation_enabled …)` inside the widget target (`plugin/src/ios/withPodsLinking.ts:69-74`), and links `expo`, `expo-widgets` and `@expo/ui` (`scripts/autolinking.rb:8-17`).
  - `WidgetsStorage` reads app-group `UserDefaults(suiteName:)` (`ios/WidgetsStorage.swift:2-3`), which is reason `1C8F.1`.
  - RN core declares FileTimestamp `C617.1`, UserDefaults `CA92.1` and SystemBootTime `35F9.1` (`privacy_manifest_utils.rb:156-170`).
  - Verified.
- **Nothing else supplies one.** `grep -rl PrivacyInfo` over the `expo-widgets@58.0.21`, `@expo/ui@58.0.21`, `expo@58.0.16` and `expo-modules-core@58.0.23` tarballs finds nothing (verified). RN's own pods carry resource bundles (`React-Core.podspec:129-131` `React-Core_privacy`, plus `React-cxxreact`, `React-timing`, `RCT-Folly`, `boost` and `glog`). Whether Apple's scanner credits those bundles to the appex binary is **unverified**.
- **The planned remedy is gone.** Spec 05's ITMS-91053 branch says a finding that names only `ExpoWidgetsTarget` is fixed by giving the `ExpoWidgets` pod its own `PrivacyInfo.xcprivacy` "through the existing `patches/expo-widgets+55.0.5.patch`" (`05-release-build-18/spec.md:393`, `checklist.md:457-460`). This spec deletes that patch. Build 17's and 18's ITMS-91053 results aren't recorded in the committed spec 05 checklist (`:457` and `:506` unchecked at `aade79b`), so there's no baseline either.
- **Resolution (Decision 5).** A second local plugin, `plugins/withHourglassWidgetPrivacyManifest.js` (I10), writes `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` and adds it to that target's Resources build phase.
  - expo-widgets creates a Resources phase only when there are localizations (`plugin/src/ios/xcode/addBuildPhases.ts:84-96`), so the plugin creates one if it's missing.
  - Its `withXcodeProject` mod has to run after expo-widgets' `withTargetXcodeProject` (`plugin/src/ios/xcode/withTargetXcodeProject.ts:55`). By the same mod-order rule as I7, it is listed **before** `expo-widgets`.
  - The manifest's contents match RN core plus the app-group reason. That an extension's own manifest satisfies ITMS-91053 is **likely**: it's how other apps clear appex-named findings, but no Apple page was read this pass.

### F3. Researcher disagreements resolved in this pass

| Topic | Claim A | Claim B | Resolution | Evidence |
|---|---|---|---|---|
| RNGH 3 builder callbacks | Renamed to `onActivate`/`onDeactivate` (expo-breaking) | Unchanged (third-party) | **B.** Renames apply to the hook API only | F2.3 |
| victory-native 42 | Optional (third-party, spec 09) | — | **Forced** by Skia 2.14 | F2.4 |
| Skia 2.4 → 2.14 | "No breaking changes" | — | **Wrong**: #4092 removed the mutable SkPath API | F2.4 |
| `BottomTabBarProps` path | `expo-router/tabs` | `expo-router/js-tabs` | Both resolve to the same file. Use **`expo-router/js-tabs`**, which the root `Tabs` deprecation names | F2.1 |
| Build image | Leave `auto` (apple-ios27) | Pin (spec 09 D2, tooling) | **Pin** `macos-tahoe-26.6-xcode-27.1` | Decision 8 |
| expo-widgets pin | Exact pin inside `^58.0.21` (tooling) | Range `~58.0.21`, no exclude (expo-widgets) | **Range**, because the patch is deleted. Spec 06's rule pins only patched packages | Decision 5 |
| Fingerprint | Patched modules become invisible under `'package'` (tooling) | — | **Wrong**: `patches/` is hashed separately. The real gap is the four or five dropped balanced skips | F2.8 |
| iPad orientations | New silent iOS 27 behavior (apple-ios27) | — | **Wrong**: the same code path exists on SDK 55. Only resizability is new | F2.8 |
| Jest | Keep 29 (spec 09 FR2) | Jest 30 (tooling) | **Jest 30**, per the docs | F2.2 |
| fetch call sites | None (inventory) | 5 (expo-breaking) | **5** | F2.7 |
| TypeScript | Optional 6.0 (expo-breaking) | Pin ~6.0.3, not 7 (tooling) | **~6.0.3** | F1 |
| Icons | Migrate to `@react-native-vector-icons/*` (spec 08 FR3) | Optional (expo-breaking, third-party) | **Keep** `@expo/vector-icons` | Decision 3 |
| `@react-navigation/*` | Bump (inventory) | Remove | **Remove** | F2.1 |

### F4. Critique pass (2026-10-20)

Two critics (native-apple, js-migration) reviewed the first draft. Each claim was re-checked against the cited source before it was applied.

| # | Issue | Outcome | Where |
|---|---|---|---|
| 1 | Widget extension has no privacy manifest, and the 55-patch remedy is deleted | Applied | F2.10, Decision 5, I4, I5, I10, FR1 (baseline), FR6, FR11 |
| 2 | Precompiled modules unmentioned; FR9 compile optional; FR5 test blocks the `usePrecompiledModules` escape hatch | Applied, except the claim that FR11 is the first proof. Checkpoint B and FR7 are already EAS development builds on the `sdk-58` image, so they run `pod install` and compile both targets (in Debug). FR9's Release compile is now mandatory, and it covers Release | F2.8, Decision 9, FR4, FR5, FR9 |
| 3 | The `requireFullScreen` description was inaccurate | Applied | F2.8, Decision 10 |
| 4 | The placeholder shows a red box before 1.2.0 is first opened | Applied, narrowed: the gallery is affected only when no timeline is stored | F2.6, Decision 5, FR11 smoke 17 |
| 5 | No check that the 1.1.0 session survives the update | Applied | FR11 smoke 17 |
| 6 | RNTL 14 removed `UNSAFE_*` queries (auth-screens: 73 calls on 71 lines) | Applied | F2.2, Decision 4, FR4 |
| 7 | eslint-plugin-react-hooks 7 compiler rules will break the lint gate | Applied | F2.2, Decision 12, FR4 |
| 8 | Tests that hard-code `@react-navigation` are unlisted | Applied; `index.test.tsx`, `indexConeIntegration.test.tsx`, `AITab.test.tsx` and `AITabConeIntegration.test.tsx` were found as well | F2.2, FR2, FR4 |
| 9 | `.appstore/` (the ASC key for `eas submit`, and `asc.js`) is missing from the worktree | Applied as a user decision | F2.8, Decision 16 |
| 10 | Checkpoint A is validated by jest only | Applied | Decision 2, checkpoint A |
| 11 | The FR8 cherry-pick leaves SDK 55 `node_modules`; eas-cli is upgraded late | Applied: moved into FR1 | Decision 12, FR1, FR8 |
| 12 | The install order contradicts F2.2 (ERESOLVE) | Applied | FR4 |
| 13 | The FR4 gate allowed red tests yet required exit 0 | Applied: each FR writes its red tests at its start, and only green commits are pushed | FR4, checklist |
| 14 | The `cp -cR` copy carries the worktree's `.git` gitdir pointer into the off-limits checkout | Applied | FR9 |
| 15 | A whitespace-only 2xx body becomes `ApiError` | Applied (trim). `ApiError` stays for non-JSON 2xx PUTs, with the reason documented | FR3 |
| 16 | The FR10 grep for `ngrok` contradicts the tunnel note | Applied | FR10 |
| 17 | `962d413` is cherry-picked twice | Applied | checklist A.1 |
| 18 | `AIArcHero.tsx:131` `Skia.Path.Make()` is unlisted | Applied: listed. The simple ban stays | FR2 |
| 19 | `server/` tests aren't in the local gate | Applied | FR4 gate, checkpoint B |
| 20 | `@expo/ui` should be a direct dependency | Applied | F1, I1 |
| 21 | Use `react-native-android-widget ^0.22.1` because 0.23.0 is hours old | **Rejected.** The user's goal is the latest compatible version. 0.23.0 only adds `widgetCategory`, and the plugin has only Android mods and no iOS code (F1), so it can't affect the iOS store build. `^0.22.1` is the recorded fallback | F1 |
| 22 | Pin the 27.0 GA image instead of the "27.1 RC" | **Rejected, with a correction.** Apple's releases page lists 27A9275 as the released "Xcode 27.1" (Problem Context), so the 27.1 image is a GA toolchain and the RC-acceptance assumption is dropped. 27.0 stays the fallback | Decision 8 |

---

## Key Decisions

### Decision 1: One native jump, 55 → 58

**Options:** (a) spec 08 then spec 09: two native builds, SDK 57 with `enableSceneSupport`, then 58. (b) A direct 55 → 58 in one build.
**Chosen:** (b). Both external triggers are met (Problem Context), and the iOS 27 SDK can only be reached through 58. Ship as **v1.2.0**. The build number is the next unused one, which is **19** unless a 1.1.x rebuild takes it first. Specs 08 and 09 are marked superseded and kept.

### Decision 2: Milestone order keeps the app runnable

**Options:** (a) Bump everything, then fix the fallout (the app is broken until the end). (b) First land every change that works on **both** SDK 55 and 58, on SDK 55. Then do one atomic bump that includes only the 58-only edits needed to compile. Then fix behavior.
**Chosen:** (b).

- **Checkpoint A** (FR1–FR3, SDK 55): all three gates are green and nothing native changes.
  - The forward-compatible edits are: `useIsFocused` from `expo-router` (exported by 55.0.7), deleting the dead `haptic-tab`, version-neutral Skia path calls, and `expo/fetch` hardening.
  - **Plus one device run on SDK 55.** Jest mocks Skia, Victory and `fetch` (`__mocks__/@shopify/react-native-skia.ts`, `__mocks__/victory-native.ts`). Without a device run, an FR2/FR3 rendering regression would first appear at checkpoint B, tangled up with the SDK jump.
    - Load this worktree's Metro (port 8082) on an SDK 55 dev client. The FR1–FR3 native surface equals build 18's: `react-native-inner-shadow` is JS-only, with no podspec or `ios/` (verified).
    - Use an existing SDK 55 dev build if J has one, otherwise run `eas build -p ios --profile development` on the FR3 tree (`auto` → the `sdk-55` image).
    - Check the `AIArcHero` sweep, the Overview/Trend scrub-cursor line, the focus entry animations, and one approve and one reject PUT (empty body).
- **Checkpoint B** (end of FR4): SDK 58, all three gates green locally, and an EAS **development** build boots on a physical iOS 27 iPhone against Metro started from this worktree on port 8082.
- **Checkpoint C** (FR9): local prebuild inspection passes.
- **Checkpoint D** (FR11): TestFlight smoke passes.

There's no Simulator, and Expo Go can't load this app's custom natives, so the dev client on a device is the only "runnable" check.

### Decision 3: Icons stay on `@expo/vector-icons`

**Options:**
- (a) Run `npx @react-native-vector-icons/codemod` now (spec 08 FR3).
- (b) Keep `@expo/vector-icons ^15.1.1` and track the migration as a follow-up.

**Chosen:** (b), for four reasons:
- It's still in SDK 58's `bundledNativeModules.json` (`^15.0.2`) and isn't deprecated on npm.
- SDK 56 only says it "will be replaced".
- The replacement packages (`@react-native-vector-icons/*@14.0.0`) ship their own podspecs and Expo config plugins (`react-native-vector-icons-ionicons-14.0.0/package/{app.plugin.js,*.podspec}`, verified). That's a new native surface added to an already large native jump.
- The usage is small: 4 sites (`ApprovalUrgencyCard.tsx:29`, `ApprovalCard.tsx:55`, `FloatingPillTabBar.tsx:19` Android-only, `components/ui/icon-symbol.tsx:3` non-iOS fallback) and 6 test mocks.

*Needs the user's confirmation.*

### Decision 4: Test renderer

**Options:**
- (a) Migrate all 61 `react-test-renderer` files to RNTL 14 / `test-renderer` now.
- (b) Declare `react-test-renderer@19.3.0` (+ `@types/react-test-renderer ~19.3.0`) explicitly so the 61 files keep working. Move only the 2 RNTL files to async RNTL 14. Track the migration as a follow-up.

**Chosen:** (b). It keeps the bump reviewable. The docs call `react-test-renderer` deprecated, but 19.3.0 is published, peers `react ^19.3.0`, and the 19.2 build has no deprecation warning outside concurrent-only mode (`node_modules/react-test-renderer/cjs/react-test-renderer.development.js:17341`). The migration spec should first re-test whether the "jest-expo/node null-dispatcher" workaround (`src/hooks/__tests__/useIsManager.test.ts:19-20`) is still needed on jest-expo 58. *Needs the user's confirmation.*

"Move only the 2 RNTL files" is **more than adding `await`** (F2.2):
- `useWidgetSync.test.ts` only needs `await` on `renderHook`/`rerender`/`unmount`.
- `auth-screens.test.tsx` must be **rewritten** onto host queries (`getByText`, `getByRole`, `getByPlaceholderText`, `getByTestId`), because RNTL 14 removed the `UNSAFE_*` queries behind its 73 calls (71 lines). Every `fireEvent`/`act` call gets an `await`.
- Add `testID`s to the `(auth)` screens only where no text, role or placeholder query fits.
- The per-file test count stays the same. These tests cover the `(auth)` screens that the FR4 `initialRouteName` → `unstable_settings.anchor` change touches.

### Decision 5: expo-widgets: retire the patch; JS layout fixes and a no-pin native fallback

**Options for the background:**
- (a) JS-only `containerBackground('#0D0D1A','widget')`, accepting the placeholder until first open after the update.
- (b) (a), plus a **local config plugin** `plugins/withHourglassWidgetBackground.js` that rewrites the generated `ios/ExpoWidgetsTarget/HourglassWidget.swift` (`WidgetsEntryView(entry: entry)` → `WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())`, with an `if #available(iOS 17, *)` modifier appended).
- (c) A one-hunk patch-package patch on 58's `EntryView.swift`.

**Chosen:** (b). It closes the 1.1.0 → 1.2.0 window, where existing widgets keep the old stored layout until the user opens the app (F2.6). It needs no version pin or `expo.install.exclude`, so it can't recreate spec 06's babel-preset-expo nesting failure.

- The plugin must be listed **before** `"expo-widgets"` in `plugins` (F2.6, mod order).
- It must throw if the anchor is missing, so a template change fails prebuild loudly.
- The two backgrounds use the same color, so applying both is harmless.

Everything else from the 55 patch is dropped (A–C, E, F; G provisionally). The JS layout gets:
- `props = props || {}`.
- `initialProps` passed to `createWidget` (placeholder and gallery).
- `spacing: 0` on the five unspaced `HStack`s.
- `containerBackground` on the small, medium and large roots (`bridge.ts:666,711,808`).
- A countdown from `env.date` instead of `Date.now()` (`:507`).

`expo-widgets ~58.0.21` is a range and is no longer excluded. `@expo/ui ~58.0.21` becomes a **direct** dependency (the critique pass reversed the earlier transitive-only choice). App code requires it directly (F1), and the single-copy guard keeps it aligned with expo-widgets' own `~58.0.21`. *The user may veto (b) in favor of (a).*

**The placeholder window (critique pass, F2.6).** Until 1.2.0 is opened once, an upgrader's widget **placeholder** evaluates build 18's stored layout with `undefined` props and shows the red error box. A never-opened fresh install's gallery preview does the same. The stored-timeline paths (the home-screen widget and an upgrader's gallery) keep real props. Two options:
- (i) Accept and document it: it's transient, and it clears on first open. **This is the default.**
- (ii) A follow-up spec that adopts `ios.initialLayout` so that build-time `initialProps` exist.

FR11 smoke 17 records what's actually seen before 1.2.0 is opened. *The user may choose (ii) as a follow-up.*

**Widget-extension privacy manifest (critique pass, F2.10).** This is a second local plugin, `plugins/withHourglassWidgetPrivacyManifest.js` (I10). It replaces spec 05's patch-based remedy, which this spec deletes, without a patch, pin or `install.exclude`.
- It writes `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` with these entries:
  - `NSPrivacyTracking` `false`, empty `NSPrivacyTrackingDomains` and `NSPrivacyCollectedDataTypes`. Data collection stays declared on the app.
  - UserDefaults `CA92.1` + `1C8F.1`, FileTimestamp `C617.1`, and SystemBootTime `35F9.1`.
- It adds the file to the `ExpoWidgetsTarget` Resources build phase.
- It's listed **before** `expo-widgets`, next to `withHourglassWidgetBackground`.
- It's adopted proactively rather than waiting for an ITMS-91053 email, because a missed reason costs a rebuild and a new build number. FR11 still has an explicit branch for an appex-named finding.

### Decision 6: Delete the reanimated patch

**Chosen:** delete `patches/react-native-reanimated+4.2.1.patch` (F2.5), and update the now-stale `babel.config.js:19-22` comment. With both patches gone, `patches/` is empty. `patch-package --error-on-fail --error-on-warn` stays as the postinstall, so future patches are strict.

### Decision 7: Skia 2.14 + victory-native 42

**Chosen:** Make `ScrubCursor` and `AIArcHero` version-neutral on SDK 55 first (FR2). For `ScrubCursor`, use `Skia.Path.MakeFromSVGString('M x y L x y2')`. For `AIArcHero`, use `<Path path={full} start={0} end={sweepProgress}>`, which trims natively and needs no worklet `copy()`. Then move to Skia `2.14.0` and victory-native `^42.0.1` in FR4. Add a source guard that bans `Skia.Path.Make()` in app code.

- The guard is deliberately broader than the API removal. `Make()` itself still exists in 2.14.0 (`PathFactory.d.ts:7` `Make(): SkPath;`); only `moveTo`/`lineTo`/`trim` are gone from `SkPath` (unpkg 2.14.0 `Path.d.ts`, fetched in the critique pass, verified).
- Banning the constructor keeps one idiom (`MakeFromSVGString`) and catches any return of the mutable pattern.
- So the empty-path fallback at `src/components/AIArcHero.tsx:131` (`Skia.Path.MakeFromSVGString(fullArcSvg) ?? Skia.Path.Make()`) also becomes `?? Skia.Path.MakeFromSVGString('M 0 0')!`, the same fallback ScrubCursor uses.

### Decision 8: Pin the production image

**Options:** `auto`; `macos-tahoe-26.6-xcode-27.1` (`sdk-58` alias; Expo labels it "27.1 RC (27A9275)"); `macos-tahoe-26.6-xcode-27.0` (27.0 GA 27A266a, the same build as this Mac).
**Chosen:** `build.production.ios.image = "macos-tahoe-26.6-xcode-27.1"` (spec 09 rule 1: the `sdk-58` image).
- **27A9275 is the GA Xcode 27.1.** Apple's releases page lists "Xcode 27.1 (27A9275)", October 15, 2026 (Problem Context, verified). So this is not an RC build, and no RC-acceptance assumption is needed. The critique suggested pinning 27.0 GA instead; that was rejected on this evidence.
- It's also the image Expo tags `sdk-58`, so it's what `auto` gives the development builds. Checkpoint B and FR7 therefore exercise the same toolchain as production.
- Local Xcode is 27.0, so FR9's local compile runs one minor version behind EAS. That's an accepted gap: FR9 is an extra check, and the EAS builds are the authority.
- `development` and `preview` keep `auto`. Fallback: `macos-tahoe-26.6-xcode-27.0` (27.0 GA).

### Decision 9: Scenes come from the template

**Chosen:** No `expo-build-properties` and no `enableSceneSupport`. No hand-written `UIApplicationSceneManifest`. No `ios.deploymentTarget` override. FR9 asserts the generated files. The project stays CNG (`ios/` is gitignored), so the expo.fyi scene migration guide doesn't apply.

**One allowed exception: the precompiled-modules fallback (critique pass, F2.8).** SDK 58 precompiles Expo modules by default. If `pod install` or the extension link fails because of precompiled modules (duplicate pods across the two targets, undefined symbols in `ExpoWidgetsTarget`, or an "unavailable in application extensions" error from a prebuilt pod), the documented fix is one entry, `["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`. The FR5 test allows exactly that entry and nothing else: no `enableSceneSupport` and no `deploymentTarget`. Adding it is a recorded decision with the failing log line. It costs build time, not behavior.

### Decision 10: iPad and resizing

On iOS 27 **both iPhone and iPad windows resize**. `UIRequiresFullScreen` no longer opts out. Instead it "requests discrete resizing that honors the supported interface orientations", on iPhone as well as iPad, and it's deprecated (F2.8, `RequiresFullScreen.js:45-47`).

**Options:**
- (a) Keep `ios.supportsTablet: true` and `orientation: "portrait"`, and don't add `requireFullScreen` (spec 09 D3). Windows resize freely. The four iPad orientations are force-written, as on build 18, and are advisory on iOS 27. This needs the full resizability matrix.
- (b) Add `ios.requireFullScreen: true`. It asks for discrete, orientation-honoring resizing, which is a lower layout risk for a portrait-only app. But it's deprecated, it skips the four-orientation iPad write, and it may stop being honored in a later iOS.
  - If chosen: I2/I4/FR5 change. `requireFullScreen` becomes `true`, `UIRequiresFullScreen` becomes `true`, and I4's "`UISupportedInterfaceOrientations~ipad` has 4 entries" row becomes "has only portrait entries, or is absent".
  - The matrix still runs; it checks the discrete sizes.

**Chosen default:** (a). The task is to fix breakage, not to redesign the layout, and (a) doesn't build on a deprecated key. Run spec 09's resizability matrix in FR11. *Needs the user's confirmation (Q1).*

### Decision 11: Fingerprint config

**Options:** (a) Keep `sourceSkips` as is, which silently drops the balanced preset's skips. (b) Use the union of our three skips and the balanced ones. (c) Delete our config and use the preset.
**Chosen:** (b):

```js
sourceSkips: ['ExpoConfigVersions', 'PackageJsonScriptsAll', 'GitIgnore',
              'ExpoConfigRuntimeVersionIfString', 'EasJson', 'Easignore', 'AutolinkingConfigPaths']
```

- `PackageJsonScriptsAll` is a superset of the preset's `PackageJsonAndroidAndIosScriptsIfNotContainRun`.
- `nativeModuleSourceType` / `configPluginSourceType` stay at the preset value `'package'`. This is safe because `patches/` and in-repo plugins are still content-hashed (F2.8), and package mode is less sensitive to local-vs-EAS file differences.
- Keep `.fingerprintignore` (`eas.json`). It's redundant with `EasJson` but harmless, and its test exists.
- This change ships in the same native build as the SDK bump, so it adds no runtime fork of its own.

### Decision 12: Tooling

**Chosen:**
- TypeScript `~6.0.3`; Jest 30; RNTL 14; ESLint 9.39.
- **On SDK 55, in FR1** (moved from FR8 in the critique pass), while both trees still share one dependency line:
  - CI `node-version: '22'` in both jobs. Node 22 runs SDK 55, and RNTL 14 later needs `^22.13`.
  - `scripts/ota-publish.sh` reads `(b.runtime && b.runtime.version) ?? b.runtimeVersion`. That's backward-compatible, so it runs on eas-cli 20 and ≥ 22 alike. It's committed to `feat/sdk-58` and cherry-picked to `release/1.1`.
  - **Then** upgrade the global eas-cli to ≥ 25.2.0 and set `eas.json` `cli.version` to `">= 25.2.0"`.
  - `scripts/` isn't a fingerprint input, so the fix is OTA-neutral.
  - Effect: every EAS build in this spec (checkpoint A, checkpoint B, FR7 and FR11) uses the same CLI.
- **The `release/1.1` cherry-pick happens in this worktree.** `git switch release/1.1` → `git cherry-pick` → `npm ci` → `npm test` → push → `git switch feat/sdk-58` → **`rm -rf node_modules && npm ci`**. No runtime is recorded before that last `npm ci`, because `runtimeversion:resolve` reads local `node_modules` (F2.8). A separate `git worktree add` for `release/1.1` is an alternative, but it needs J's OK under the other-worktree rule.
- **Lint (critique pass, F2.2).** eslint-plugin-react-hooks 7 arrives with eslint-config-expo 58 and turns on the React Compiler rules as errors.
  - FR4 records the per-rule error count right after the install.
  - Fix the violations where the fix is local and behavior-neutral.
  - If more than 30 errors remain, or a fix would change behavior, turn off **only** the offending `react-hooks/<rule>` entries in `eslint.config.js`, each with a dated follow-up comment (`// TODO(2026-12-31, spec-10 follow-up): …`). This mirrors the TS escape hatch.
  - Never turn off `rules-of-hooks` or `exhaustive-deps`.

### Decision 13: Branches, the hotfix lane, and build 18

**Chosen:**
- Tag `build-18` → `aade79b` and cut `release/1.1` from `aade79b` (FR1). All 1.1.x fixes go there. They're OTA'd with `scripts/ota-publish.sh` from that branch, or rebuilt natively if App Review rejects build 18. Each fix is cherry-picked forward to `feat/sdk-58`.
- `feat/sdk-58` doesn't merge to `main` until two things hold: build 18's review is resolved, and build 19 has passed the TestFlight smoke. Until then `main` stays exactly build 18.
- Never run `eas update --channel production` from `feat/sdk-58`. Dev builds use the `development` / `preview` channels.
- Never submit to App Review without the user's explicit go-ahead.

### Decision 14: Version and build number

**Chosen:** `expo.version` = `package.json` `version` = `1.2.0`, and the lockfile root version is also `1.2.0` (`fingerprint-config.test.ts` FR1). `ios.buildNumber` = `"19"`. Before the production build, re-check it is the next unused number (`node .appstore/asc.js builds`, run from this worktree after the Decision 16 copy). If a 1.1.x rebuild consumed 19, take 20. Tests are range-based (≥ 19), so either passes.

### Decision 15: Android

**Chosen:** `expo.autolinking.android.exclude: ["expo-widgets"]`. This keeps expo-widgets 58's Glance, WorkManager and Hermes runtime out of the Android app, which renders widgets through `react-native-android-widget` and only `require`s expo-widgets on iOS (`bridge.ts:913-916,976-977`). Bump `react-native-android-widget` to `^0.23.0`. The pre-existing "Android widget handler is never registered" bug stays out of scope (Android isn't on the store).

### Decision 16: App Store Connect key and `asc.js` access (critique pass)

`eas submit` needs `.appstore/AuthKey_W4UV4XTKPC.p8` relative to the project. `asc.js` drives the FR5 build-number check and the FR11 ASC prep. Both exist only in the off-limits main checkout (F2.8).

**Options:**
- (a) **Copy `.appstore/` into this worktree** once, before FR5: `cp -R "<main>/.appstore" "<worktree>/.appstore"`, a read-only use of the main checkout that doesn't affect its Metro.
  - Before any later commit, `git check-ignore -q .appstore/AuthKey_W4UV4XTKPC.p8` must succeed (the worktree's `.gitignore:57,62` covers it).
  - All `node .appstore/asc.js …` calls then run from the worktree.
- (b) Store the ASC API key in EAS (`eas credentials`) and drop `ascApiKeyPath`/`ascApiKeyIssuerId`/`ascApiKeyId` from `eas.json`. `asc.js` would still need option (a) or the main checkout.
- (c) Amend the ground rule to allow read-only `node .appstore/asc.js …` and `eas submit` from the main checkout.

**Chosen default:** (a). It changes no tracked file, keeps the key out of EAS, and leaves the main checkout untouched after one copy. *Needs the user's OK before FR5*, because it copies a secret.

---

## Interface Contracts

### I1. `package.json` (post-FR4)

`dependencies`:

```
@expo-google-fonts/inter ^0.4.2 · plus-jakarta-sans ^0.4.2 · space-grotesk ^0.4.1 · space-mono ^0.4.2   (unchanged)
@expo/ui ~58.0.21   (new direct dependency)
@expo/vector-icons ^15.1.1
@react-native-async-storage/async-storage 2.2.0
@react-native-masked-view/masked-view 0.3.2
@shopify/react-native-skia 2.14.0
@tanstack/query-async-storage-persister ^5.104.5 · @tanstack/react-query ^5.104.5 · @tanstack/react-query-persist-client ^5.104.5
expo ~58.0.16
expo-application ~58.1.2 · expo-blur ~58.0.5 · expo-constants ~58.0.12 · expo-dev-client ~58.0.14
expo-file-system ~58.0.10 · expo-font ~58.0.9 · expo-haptics ~58.0.7 · expo-image ~58.0.16
expo-linear-gradient ~58.0.3 · expo-linking ~58.0.13 · expo-notifications ~58.1.5 · expo-router ~58.0.24
expo-secure-store ~58.0.2 · expo-sharing ~58.0.19 · expo-splash-screen ~58.0.10 · expo-status-bar ~58.0.3
expo-symbols ~58.0.4 · expo-system-ui ~58.0.6 · expo-updates ~58.0.17 · expo-web-browser ~58.0.6
expo-widgets ~58.0.21
nativewind ^4.2.7 · react-native-css-interop 0.2.7 · tailwindcss ^3.4.19
react 19.3.0 · react-dom 19.3.0 · react-native 0.88.0
react-native-android-widget ^0.23.0
react-native-gesture-handler ~3.3.0 · react-native-reanimated 4.7.1 · react-native-worklets 0.13.0
react-native-safe-area-context ~5.10.1 · react-native-screens ~4.30.0
react-native-svg 15.16.0 · react-native-web ~0.21.4
victory-native ^42.0.1
```

Removed: `@expo/ngrok`, `@react-navigation/bottom-tabs`, `@react-navigation/elements`, `@react-navigation/native`, `react-native-inner-shadow`.

`devDependencies`:

```
@react-native/jest-preset 0.88.0 · @testing-library/react-native ^14.1.0 · test-renderer 1.3.0
react-test-renderer 19.3.0 · @types/react-test-renderer ~19.3.0
@types/jest ^30.0.0 · @types/node ^22.20.5 · @types/react ~19.3.0
eslint ^9.39.5 · eslint-config-expo ~58.0.4 · jest ^30.5.2 · jest-expo ~58.0.11
patch-package ^8.0.1 · typescript ~6.0.3
```

The rest of `package.json`:
- `version` = `"1.2.0"`.
- `scripts.postinstall` = `"patch-package --error-on-fail --error-on-warn"`.
- `expo` = `{ "autolinking": { "android": { "exclude": ["expo-widgets"] } } }`, with **no** `install.exclude`.

If `npx expo install --fix` picks a later patch release of a bundled package, `--fix` wins. Record it.

`eslint-plugin-react-hooks` isn't declared; it comes in as `^7.0.0` through `eslint-config-expo` (Decision 12 covers the lint fallout).

**Install order (FR4).** Write every I1 range, every removal and every devDependency into `package.json` **first**, then run one `npm install`. Only after that run `npx expo install --check` and `--fix` for bundled drift. Running `npx expo install expo@~58.0.16` first, while RNTL 13 and `@react-navigation/*` are still declared, makes `--fix` pull expo-router 58, whose optional peer `@testing-library/react-native >= 14.0.0` conflicts with RNTL 13 (ERESOLVE, F2.2).

### I2. `app.json`

| Key | Contract |
|---|---|
| `expo.version` | `"1.2.0"` |
| `expo.ios.buildNumber` | `"19"` (an integer string ≥ 19, the next unused) |
| `expo.ios.supportsTablet` / `requireFullScreen` | `true` / absent (Decision 10 option (a); option (b) makes it `true`) |
| `expo.orientation` | `"portrait"` (advisory on iOS 27) |
| `expo.ios.infoPlist` | `UIBackgroundModes: ["remote-notification"]`, `ITSAppUsesNonExemptEncryption: false`. No `UIApplicationSceneManifest`, no `NSFaceIDUsageDescription` |
| `expo.ios.deploymentTarget` | absent (the template default is 16.4) |
| `expo.ios.privacyManifests` | Unchanged from build 18 (spec 03 contract) |
| `expo.plugins` | Same as build 18, plus `"./plugins/withHourglassWidgetPrivacyManifest"` then `"./plugins/withHourglassWidgetBackground"`, placed **immediately before** the `expo-widgets` tuple, in that order. No `expo-build-properties` entry, except the Decision 9 fallback, which is exactly `["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`. `JSON.stringify(plugins)` doesn't contain `enableSceneSupport` or `deploymentTarget` |
| `expo.web.output` | `"static"` |
| `expo.runtimeVersion` | `{ "policy": "fingerprint" }` (unchanged) |

### I3. `eas.json`

| Key | Contract |
|---|---|
| `cli.version` | `">= 25.2.0"` (set in FR1) |
| `cli.appVersionSource` | `"local"` (unchanged) |
| `build.production.ios.image` | `"macos-tahoe-26.6-xcode-27.1"` (Xcode 27.1 GA, 27A9275). Matches `/^macos-[a-z]+-\d+(\.\d+)*-xcode-27(\.\d+)+$/` and isn't an alias |
| `build.development` / `build.preview` | no `image` key |
| `submit.production.ios` | unchanged under Decision 16 (a)/(c). Under (b), the three `ascApiKey*` keys are removed |

### I4. Prebuilt iOS project (FR9, scratch copy)

| File | Must contain |
|---|---|
| `ios/Hourglassxo/Info.plist` | `UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes = false`; `UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName = "$(PRODUCT_MODULE_NAME).SceneDelegate"`; `UILaunchStoryboardName = "SplashScreen"`; `UIBackgroundModes = ["remote-notification"]`; no `NSFaceIDUsageDescription`; `UIRequiresFullScreen = false` and `UISupportedInterfaceOrientations~ipad` has all 4 (under Decision 10 (b): `true`, and portrait entries only or the key absent); `CFBundleShortVersionString`/`CFBundleVersion` resolve to 1.2.0 / 19 |
| `ios/Hourglassxo/SceneDelegate.swift` | `class SceneDelegate: ExpoAppSceneDelegate` |
| `ios/Hourglassxo/AppDelegate.swift` | `class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider` |
| `ios/*.xcodeproj/project.pbxproj` | every `IPHONEOS_DEPLOYMENT_TARGET` is ≥ `16.4`; `Podfile.properties.json` has no `ios.deploymentTarget` < 16.4 |
| `ios/Hourglassxo/*.entitlements` and `ios/ExpoWidgetsTarget/*.entitlements` | `com.apple.security.application-groups` = `["group.com.jalvarez0907.hourglass.widgets"]` |
| `ios/Hourglassxo/PrivacyInfo.xcprivacy` | the build-18 manifest, including `1C8F.1` |
| `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` | exists (I10). `NSPrivacyAccessedAPITypes` has UserDefaults `CA92.1` + `1C8F.1`, FileTimestamp `C617.1` and SystemBootTime `35F9.1`. `project.pbxproj` lists `PrivacyInfo.xcprivacy in Resources` inside the `ExpoWidgetsTarget` target's Resources phase. After `pod install`, the file still has those reasons: RN's aggregation never touches an extension target (F2.10) |
| `ios/ExpoWidgetsTarget/Info.plist` | no `UIApplicationSceneManifest` |
| `ios/ExpoWidgetsTarget/HourglassWidget.swift` | `WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())` exactly once, plus the `HourglassContainerBackground` struct |
| prebuild output | no `enableSceneSupport` warning; every warning recorded |
| `pod install` output (FR9, mandatory) | exits 0. Every `[Expo-precompiled]` line is recorded, so it's known which pods are prebuilt |
| local Release compile (FR9, mandatory) | `xcodebuild -workspace Hourglassxo.xcworkspace -scheme Hourglassxo -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` exits 0. The scheme builds the embedded `ExpoWidgetsTarget` as a target dependency. In the product, `Hourglassxo.app/PlugIns/ExpoWidgetsTarget.appex/` has **no** `Frameworks/` directory and **does** contain `PrivacyInfo.xcprivacy` |

### I5. IPA (FR11)

| Info.plist key (`Payload/*.app/Info.plist`) | Contract |
|---|---|
| `DTSDKName` | starts with `iphoneos27` |
| `DTSDKBuild` | starts with `24` (the build-16 IPA had `23F81a`) |
| `DTXcode` | starts with `27` |
| `CFBundleShortVersionString` / `CFBundleVersion` | `1.2.0` / `19` |
| `MinimumOSVersion` | `16.4` |
| scene delegate class | ends with `.SceneDelegate` |
| `Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/` | `Info.plist` has no `UIApplicationSceneManifest`. `PrivacyInfo.xcprivacy` exists with the I10 reasons. There's no `Frameworks/` directory |

### I6. Widget layout (`src/widgets/bridge.ts` `WIDGET_LAYOUT_JS`)

- The first statement is `props = props || {};`.
- The small, medium and large roots carry `modifiers: [containerBackground('#0D0D1A', 'widget')]`; accessory families don't.
- Every `HStack(`/`VStack(` call sets `spacing`.
- The countdown uses `var nowMs = (env && env.date) ? env.date.getTime() : Date.now();`.
- `createWidget('HourglassWidget', WIDGET_LAYOUT_JS, buildSignedOutWidgetData(Date.now()))` at both call sites.
- `requireOptionalNativeModule` is imported from `'expo'`.

### I7. `plugins/withHourglassWidgetBackground.js`

- Exports the config plugin as default, plus a pure `addContainerBackground(source: string): string`.
- The transform:
  - Replaces `WidgetsEntryView(entry: entry)` with `WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())`.
  - Appends the `HourglassContainerBackground: ViewModifier` struct (an iOS 17+ `containerBackground(Color(red: 0.051, green: 0.051, blue: 0.102), for: .widget)` call, else `content`).
- It's idempotent (a second run is a no-op).
- It throws `HourglassWidget.swift: anchor 'WidgetsEntryView(entry: entry)' not found` when the anchor is missing.
- The plugin is a `withDangerousMod('ios')` that edits `<platformProjectRoot>/ExpoWidgetsTarget/HourglassWidget.swift`.

### I8. `fingerprint.config.js`

`module.exports = { sourceSkips: [the 7 names in Decision 11] }`. No other keys.

### I9. CI

Every `node-version:` in `.github/workflows/test.yml` is `'22'` (set in FR1). `app-tests` runs `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` (spec 07 order unchanged).

### I10. `plugins/withHourglassWidgetPrivacyManifest.js` (critique pass, F2.10)

- Exports the config plugin as default, plus two pure helpers:
  - `buildWidgetPrivacyManifest(): object`. It returns `{ NSPrivacyTracking: false, NSPrivacyTrackingDomains: [], NSPrivacyCollectedDataTypes: [], NSPrivacyAccessedAPITypes: [UserDefaults [CA92.1, 1C8F.1], FileTimestamp [C617.1], SystemBootTime [35F9.1]] }`, using the full `NSPrivacyAccessedAPICategory*` names.
  - `addPrivacyManifestToTarget(project, targetName): project`. It's idempotent.
- `withDangerousMod('ios')` writes `<platformProjectRoot>/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` by serializing `buildWidgetPrivacyManifest()` to plist XML in the plugin itself. It adds no undeclared dependency such as `@expo/plist`; the test parses the output with `plutil -lint` or an XML parse.
- `withXcodeProject`:
  - Finds the native target named `ExpoWidgetsTarget`, and throws `ExpoWidgetsTarget: target not found` if it's absent.
  - Adds a `PBXFileReference` for `PrivacyInfo.xcprivacy` to the target's group, then adds a `PBXBuildFile` to the target's `PBXResourcesBuildPhase`, creating that phase if it's missing.
  - Doesn't touch the app target.
- In `app.json` it's listed before `withHourglassWidgetBackground`, so both precede `expo-widgets` (I2). A later plugin's mod runs first (F2.6), so this mod sees the target that expo-widgets created.
- It doesn't fork the runtime on its own: it ships in the same native build. Editing it later does fork the runtime (`sourcer/Expo.js:161-162`).

---

## Test Plan

### Automated (Jest; `npm test`, plus `npm run typecheck` and `npm run lint`)

- `__tests__/config/deps.test.ts`, ported from `962d413`:
  - Exact pin and lockfile alignment for patched packages (vacuous once `patches/` is empty).
  - Strict postinstall; no `@expo/ngrok`; no `react-native-inner-shadow`.
  - `expo.install.exclude` contains X if and only if `patches/X+*.patch` exists.
  - SDK 58 floors.
  - Single-copy checks for `react`, `test-renderer`, `react-native-css-interop`, `expo-widgets` and `@expo/ui`.
  - `react-test-renderer` equals `react`.
  - `@react-native/jest-preset` minor equals the `react-native` minor.
  - async-storage stays at 2.2.0.
- `__tests__/config/sdk58-migration.test.ts` (new): a source walk of `app/`, `src/`, `components/`, `hooks/` and `constants/` (excluding `__tests__`, `__mocks__` and `node_modules`) that finds:
  - no `from '@react-navigation/`;
  - no `expo-router/unstable-native-tabs`;
  - no `{ … Tabs … } from 'expo-router'`;
  - no `initialRouteName=`;
  - no `Skia.Path.Make()`;
  - no `.copy().trim(`.
  - It also checks that `components/haptic-tab.tsx` is absent.
  - A second walk covers **test files** (`__tests__`, `*.test.*` and `__mocks__`) and finds no `jest.mock('@react-navigation/` and no `requireActual('@react-navigation/` (FR4). Tests that hard-code import paths are updated by hand (F2.2).
- `__tests__/config/app-config.test.ts`: a `describe('10-sdk-58-ios-27')` block covering I2/I3 (typed JSON imports only, per spec 03's contract).
- `__tests__/config/app-config-introspect.test.ts`: `sdkVersion` major 58; `UIRequiresFullScreen === false`; spec 03's guards stay intact. A local plugin isn't guaranteed to show up in `_internal.pluginHistory`, so the plugin's effect is asserted in the FR9 prebuild instead.
- `__tests__/config/fingerprint-config.test.ts`: the expected `sourceSkips` become the 7 names; every name is a `SourceSkips` enum member.
- `__tests__/ci-gates.test.ts` (FR1): every `node-version` is ≥ 22 and even.
- `__tests__/scripts/ota-publish.test.ts` (FR1): the audience guard accepts both `runtimeVersion` and `runtime.version` build JSON.
- `src/widgets/__tests__/widgetLayoutJs.test.ts`:
  - `props` undefined doesn't throw;
  - `containerBackground` is present on each system root;
  - every stack sets `spacing`;
  - the `env.date` countdown is used;
  - every global the layout references exists in `@expo/ui/swift-ui` (including modifiers).
- `__tests__/config/widget-background-plugin.test.ts` (new): transform, idempotence, and the missing-anchor throw, against the real `widgetSwift` template string copied from `expo-widgets@58.0.21` `plugin/src/ios/withWidgetSourceFiles.ts:355-364` as a fixture.
- `__tests__/config/widget-privacy-plugin.test.ts` (new, I10):
  - `buildWidgetPrivacyManifest()` has exactly the four reason codes and empty collected-data and tracking-domain lists.
  - `addPrivacyManifestToTarget` on an `xcode` fixture project that has an `ExpoWidgetsTarget` target without a Resources phase adds the phase and one build file. A second run adds nothing.
  - A project without the target throws.
  - `app.json` lists the plugin before `withHourglassWidgetBackground`.
- `__tests__/auth-screens.test.tsx` (FR4): rewritten onto host queries, with no `UNSAFE_` and every `fireEvent`/`act` awaited. Same per-file test count as before.
- API client: tests for the single body read (a fake Response that throws `TypeError` on a second read), an empty **or whitespace-only** body on 200 and 204 (GET and PUT), a non-JSON 2xx body → `ApiError`, and a `FetchError`-shaped rejection → `NetworkError`.
- Components: `ScrubCursor.test.ts` (`MakeFromSVGString` string), `AIArcHero*.test.tsx` (`Path` `start`/`end` props).

### Manual / commands

- `rm -rf node_modules && npm ci`; `npx expo install --check`; `npx expo-doctor`; `npm ls` (no `invalid` / `UNMET`).
- A device run of the FR3 tree on an SDK 55 dev client (checkpoint A, Decision 2).
- The scratch prebuild, plus the mandatory `pod install` and Release compile (I4).
- An EAS development build on device (Checkpoint B), with its `[Expo-precompiled]` log lines recorded.
- `(cd server && npm ci && npm test)` at FR4 and checkpoint B: the server suite runs on the root jest (F2.2).
- The EAS production build on the pinned image (I5).
- Fingerprint determinism: local `runtimeversion:resolve --platform ios` equals the build's runtime.
- TestFlight smoke on an iOS 27 iPhone and iPad: the checklist covers spec 05's 8 items, plus the scene, fetch, widget and memory checks, plus the resizability matrix.

---

## Files to Create/Modify

| File | Action | FR |
|---|---|---|
| `package.json`, `package-lock.json` | modify | FR1, FR4, FR5, FR6 |
| `patches/expo-widgets+55.0.5.patch`, `patches/react-native-reanimated+4.2.1.patch` | delete | FR4 |
| `__mocks__/react-native-inner-shadow.ts` | delete | FR1 |
| `components/haptic-tab.tsx`, `src/components/__tests__/HapticTab.test.tsx` | delete | FR2 |
| `src/components/FadeInScreen.tsx`, `src/hooks/useFocusKey.ts`, `src/hooks/useStaggeredEntry.ts` | modify | FR2 |
| `src/components/__tests__/FadeInScreen.test.tsx` (new `expo-router` mock), `src/hooks/__tests__/useStaggeredEntry.test.ts` (inverted import regex), `app/(tabs)/__tests__/index.test.tsx`, `app/(tabs)/__tests__/indexConeIntegration.test.tsx`, `src/components/__tests__/AITab.test.tsx`, `src/components/__tests__/AITabConeIntegration.test.tsx` (stub moved into the `expo-router` mock) | modify | FR2 |
| `src/components/ScrubCursor.ts`, `src/components/AIArcHero.tsx`, `__mocks__/@shopify/react-native-skia.ts` (+ tests) | modify | FR2 |
| `src/api/client.ts` (+ API tests) | modify | FR3 |
| `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(auth)/_layout.tsx`, `src/components/FloatingPillTabBar.tsx`, `app/(tabs)/__tests__/native-tabs.test.tsx` | modify | FR4 |
| `src/components/__tests__/FloatingPillTabBar.test.ts` (`expo-router/js-tabs` regex), `app/__tests__/layout-notifications.test.tsx` (themes moved into the `expo-router` mock) | modify | FR4 |
| `app/(auth)/*.tsx` (`testID`s only where no host query fits), `eslint.config.js` (only if the Decision 12 lint fallback is used) | modify | FR4 |
| `jest.config.js`, `babel.config.js` (comment), `__tests__/auth-screens.test.tsx`, `src/__tests__/hooks/useWidgetSync.test.ts` | modify | FR4 |
| `__tests__/config/deps.test.ts` | create (port) | FR1, FR4 |
| `__tests__/config/sdk58-migration.test.ts` | create | FR2, FR4 |
| `app.json`, `eas.json` | modify | FR1 (`cli.version`), FR5, FR6 |
| `__tests__/config/app-config.test.ts`, `__tests__/config/app-config-introspect.test.ts` | modify | FR5, FR6 |
| `src/widgets/bridge.ts`, `src/types/modules.d.ts`, `src/widgets/__tests__/widgetLayoutJs.test.ts`, `src/__tests__/widgets/clearWidgetData.test.ts` | modify | FR6 |
| `plugins/withHourglassWidgetBackground.js`, `__tests__/config/widget-background-plugin.test.ts` | create | FR6 |
| `plugins/withHourglassWidgetPrivacyManifest.js`, `__tests__/config/widget-privacy-plugin.test.ts` | create | FR6 |
| `.github/workflows/test.yml`, `__tests__/ci-gates.test.ts` | modify | FR1 |
| `scripts/ota-publish.sh`, `__tests__/scripts/ota-publish.test.ts` | modify (also on `release/1.1`) | FR1 |
| `fingerprint.config.js`, `__tests__/config/fingerprint-config.test.ts` | modify | FR8 |
| `.appstore/` (gitignored copy, never committed; Decision 16) | copy | before FR5 |
| `TECH_STACK.md`, `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/RELEASING.md`, `features/app/store-compliance/FEATURE.md`, `site/support.html` | modify | FR10 |

---

## Edge Cases to Handle

1. **App Review rejects build 18.**
   - Fix on `release/1.1`. A native 1.1.0 rebuild takes the next build number, possibly 19, which moves v1.2.0 to 20.
   - The range tests still pass.
   - Cherry-pick the fix forward.
2. **1.1.x OTA during the migration.** Publish only from `release/1.1` with `scripts/ota-publish.sh`. Its runtime guard targets build 18's fingerprint. FR1 cherry-picks the Decision 12 script fix there before the CLI is upgraded.
3. **Update without an app open.**
   - Covered by Decision 5's native fallback.
   - Verified on device by installing build 18 from TestFlight, adding all three widget sizes, updating to build 19 **without** opening it, and checking the widgets.
   - The placeholder (and a never-opened fresh install's gallery) shows the red box until first open (F2.6). Default: accepted, transient, recorded in smoke 17 (Decision 5 (i)).
4. **expo-widgets G hunk, or a precompiled-modules failure.** If `pod install` fails, or the extension fails to compile or link ("unavailable in application extensions", a duplicate pod across targets, undefined symbols in `ExpoWidgetsTarget`):
   - First identify the pod from the `[Expo-precompiled]` lines.
   - If it's prebuilt, a Podfile setting won't reach it. Use the Decision 9 fallback, `["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`, which the FR5 test allows.
   - If the `ExpoWidgets` pod is source-built and only needs `APPLICATION_EXTENSION_API_ONLY=No`, re-add only that setting. Prefer a local config plugin on the Podfile `post_install`; fall back to a one-line patch-package hunk. In the patch case, also pin exactly, add to `install.exclude`, and keep `babel-preset-expo`'s `^58.0.21` peer satisfied.
5. **The codemod is unreliable** (expo/expo#46481). The source-walk test is the authority, not the codemod's report.
6. **Peer conflicts during install.** Never use `--legacy-peer-deps` or `--force`. Fix the conflicting range instead (RNTL 14 is the known one).
7. **Two copies** of `react-native-css-interop`, `test-renderer`, `expo-widgets`, `@expo/ui` or `react`. The `deps.test.ts` single-copy checks fail; fix the declared range.
8. **NativeWind `className` stops applying on SDK 58's Metro.** Keep `metro.config.js`'s resolver redirect and `forceWriteFileSystem`. Removing them is a separate, reversible experiment.
9. **No Simulator.** All runtime checks run on physical devices through EAS development, preview or production builds. Start Metro from this worktree on port 8082, never on 8081 and never from `WS/hourglassws`.
10. **The ASC agreement is unaccepted (403).** Uploads and asc.js calls stay blocked until the Account Holder accepts it (spec 05).
11. **The 1.2.0 version record can't be created while 1.1.0 is in review** (unverified ASC rule). A TestFlight upload doesn't need the version record. Create it when ASC allows.
12. **EAS build-tools upload the embedded bundle for SDK 58 builds** (eas-cli 24.9.0). After build 19, check `eas update:list --branch production`. If an automatic entry would confuse runbook A, set `EAS_UPDATE_UPLOAD_EMBEDDED_BUNDLE=0` in the production env and record it.
13. **The Strict TS API or TS 6 produces more than 60 errors.** Spec 07/09's escape hatch applies: the `react-native-legacy-deep-imports` opt-out is allowed temporarily, with a dated follow-up. There are 0 deep imports today, so this is unlikely.
14. **The React Compiler lint rules (eslint-plugin-react-hooks 7) turn `npm run lint` red.** Use the Decision 12 policy: record the counts per rule, fix the local cases, and turn off only named compiler rules, with a dated follow-up. Never turn off `rules-of-hooks` or `exhaustive-deps`.
15. **ITMS-91053 names `ExpoWidgetsTarget` on build 19** despite I10. Compare the listed categories with I10's four reasons:
    - A missing category: add it to `buildWidgetPrivacyManifest()` and its test, then rebuild with the next unused build number before submitting.
    - The categories are already declared: record it, don't block, and open a follow-up.
16. **The `.appstore/` copy (Decision 16) isn't approved.** FR5's build-number check and FR11's upload and ASC prep stop at "blocked: ASC key access" until J picks an option.

## Open Questions

- **Q1 (user):** these are recorded as chosen defaults. Confirm them or change them before FR4:
  - Decision 3 (icons).
  - Decision 4 (test renderer, including the `auth-screens` rewrite).
  - Decision 5 (the native widget-background fallback, the widget privacy-manifest plugin, and accepting the transient placeholder red box).
  - Decision 10 ((a) freely resizable vs (b) `requireFullScreen: true`).
- **Q1b (user, before FR5):** Decision 16, how this worktree gets the ASC key and `asc.js`.
- **Q2 (resolved at Checkpoint B / FR9):** Is the ExpoWidgets `APPLICATION_EXTENSION_API_ONLY=No` setting (hunk G), or the precompiled-modules fallback, needed? It's answered by the Checkpoint B EAS development build (Debug) and the FR9 local Release compile.
- **Q3 (resolved at Checkpoint B):** Is the `metro.config.js` jsx-runtime redirect still required? It's answered by a reversible experiment on the dev client.
- **Q4 (resolved at FR11):** Does Instruments' Activity Monitor on Xcode 27 read the footprint of a TestFlight (non-debuggable) app? If it doesn't, the memory check runs on the development build only.
- **Q5 (before submission):** Re-check Apple's required-reason API list and the Age Rating "social media capabilities" answer (set to No for 1.1.0 by spec 05 FR5) for the 1.2.0 submission.
