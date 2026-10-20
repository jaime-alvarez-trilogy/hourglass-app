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

  `expo@58.0.16` is npm `latest`. **Verified.**
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
| `react-native-android-widget` | ^0.20.1 | ^0.23.0 | Peer `expo >=54.0.0`. Published 2026-10-20 16:57Z (verified). Changelog is additive (researcher, GitHub releases) |
| `react-native-inner-shadow` | ^1.3.1 | **remove** | Zero imports; `GlassCard.tsx:14-20` documents why it was removed (verified grep) |
| `@react-navigation/{native,bottom-tabs,elements}` | 7.x / 2.x | **remove** | expo-router 58 has no `@react-navigation/*` dependency or peer (verified, tarball `package.json`) |
| `@expo/ngrok` | ^4.1.0 | **remove** | spec 06 FR3, `96035ea` |
| `jest-expo` | ~55.0.11 | ~58.0.11 | Bundled. Dependencies are all `^30` `@jest/*` plus `test-renderer 1.3.0`. Peer `@react-native/jest-preset ^0.88.0` (required) (tarball, verified) |
| `jest` / `@types/jest` | ~29.7.0 / ^29.5.14 | ^30.5.2 / ^30.0.0 | "In SDK 58 and later, `jest-expo` requires Jest 30" (https://docs.expo.dev/develop/unit-testing/, fetched) |
| `@testing-library/react-native` | ^13.3.3 | ^14.1.0 | Forced: expo-router's optional peer `>= 14.0.0` conflicts with an installed 13.x (F2.2). 14.x peers `test-renderer ^1.0.0`; `render`/`renderHook` return Promises (unpkg `dist/render.d.ts:16`, `dist/render-hook.d.ts:19`, verified) |
| `test-renderer` | — | 1.3.0 (new) | Exact, to match jest-expo's own dependency so only one copy exists |
| `react-test-renderer` + `@types/react-test-renderer` | (transitive 19.2.0) / ^19.1.0 | 19.3.0 / ~19.3.0 (new explicit) | Decision 4. Today it arrives only as a transitive dependency of RNTL 13 and jest-expo 55 (`npm ls`, verified). 19.3.0 peers `react ^19.3.0` |
| `@react-native/jest-preset` | — | 0.88.0 (new) | jest-expo 58 peer |
| `typescript` | ~5.9.2 | ~6.0.3 | SDK 58 template pin (`expo-template-default@58.0.25`, verified). 7.x is ruled out: `@typescript-eslint/parser@8.72.0` (latest) peers `typescript >=4.8.4 <6.1.0` (verified) |
| `@types/react` | ~19.2.10 | ~19.3.0 | template pin |
| `@types/node` | ^25.3.5 | ^22.20.5 | Matches the Node 22 runtime of CI and EAS. Odd Node majors are unsupported (SDK 58 changelog) |
| `eslint` / `eslint-config-expo` | ^9.25.0 / ~55.0.0 | ^9.39.5 / ~58.0.4 | eslint 10 is npm latest, but `eslint-plugin-import` (a dependency of eslint-config-expo) peers `eslint … \|\| ^9` (verified) |
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
| RNTL 14's `render` / `renderHook` / `rerender` / `unmount` return Promises | 2 files use RNTL: `__tests__/auth-screens.test.tsx`, `src/__tests__/hooks/useWidgetSync.test.ts` | unpkg `@testing-library/react-native@14.1.0/dist/render.d.ts:16`, `render-hook.d.ts:19` | verified |
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
| G. `APPLICATION_EXTENSION_API_ONLY=No` for `ExpoWidgets` | 154-162 | Not in 58's `expo_widgets_post_install`, and ExpoWidgets' Swift uses no extension-unavailable API (researcher grep) | drop provisionally; FR9 compile check / FR11 build | **unverified** |

Other 58 changes that hit `src/widgets/bridge.ts`:

- **Props may be undefined.** 58.0.0 "Handle undefined props instead fallback to empty object" (#46492, CHANGELOG `:162`, verified). The layout dereferences `props.*` directly at `bridge.ts:475-487`, so the placeholder and the widget gallery would throw.
- **Stack spacing.** `@expo/ui` 58: "Fix `HStack`, `VStack` … collapsing an unset `spacing` to `0` … they now use the system default spacing … Pass `spacing={0}` explicitly to keep the previous layout" (`@expo/ui@58.0.21` CHANGELOG `:188`, verified). Unspaced `HStack`s are at `bridge.ts:600,617,702,735,779` (verified grep).
- **Stored layout wins.** `WidgetsLayoutRegistry.layout(for:)` returns the App Group key `__expo_widgets_<name>_layout` first, and the build-time embedded layout only after that (`ios/Widgets/WidgetsLayoutRegistry.swift:9-19`, verified). The key is unchanged from 55 (`ios/WidgetObject.swift:8`, both versions, verified). So after the 1.1.0 → 1.2.0 auto-update, home-screen widgets keep evaluating build 18's layout string, which has no `containerBackground`, until the user opens 1.2.0. iOS 17+ shows its "adopt containerBackground API" placeholder for a background-less widget; the 58.0.16 CHANGELOG `:49-50` describes exactly that placeholder. **Likely.** Decision 5.
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

#### F2.8 Native config and tooling

| Change | Impact | Evidence | Conf. |
|---|---|---|---|
| Template: `class SceneDelegate: ExpoAppSceneDelegate`; `AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider` with no window creation; Info.plist `UIApplicationSceneManifest` = `{UIApplicationSupportsMultipleScenes: false, UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate"}`; `UILaunchStoryboardName: SplashScreen`; `IPHONEOS_DEPLOYMENT_TARGET = 16.4`; Podfile `'16.4'` | Nothing to configure. FR9 asserts the prebuild output | `expo-template-bare-minimum@58.0.25` `ios/HelloWorld/{SceneDelegate.swift,AppDelegate.swift:6,23,Info.plist}`, `project.pbxproj:255,283`, `Podfile:23` | verified |
| Minimum iOS is 16.4 (it was 15.1 on SDK 55). This drops iPhone 6s/7/SE1-class devices running < 16.4 | What's New and support page | SDK 56 changelog (fetched); template | verified |
| Under the scene lifecycle, cold-start URLs arrive through `scene(_:willConnectTo:options:)`. `ExpoAppSceneDelegate` rebuilds `launchOptions` for `Linking.getInitialURL()` and forwards `openURLContexts` | Deep links still work. Check on device | `expo@58.0.16` `ios/Expo/ExpoAppSceneDelegate.swift:56-75` (researcher) | verified (code), device check pending |
| AppState still fires: RN observes `UIApplication` notifications, which UIKit still posts for a single-scene app | `app/_layout.tsx:63`, `useAIData.ts:376`, `useScheduledNotifications.ts:276`, `useRoleRefresh.ts:103` | spec 08 research (`RCTAppState.mm:85-91`) | likely; device check |
| The app has **no** notification-tap routing (no `addNotificationResponseReceivedListener`, `useLastNotificationResponse` or `getLastNotificationResponseAsync`) | A tap from a killed app just cold-launches to the default route | grep 2026-10-20 | verified |
| Foreground notifications are now shown by default, but the app sets `setNotificationHandler` with all fields | No change | `expo-notifications@58.1.5` CHANGELOG 58.0.0 (researcher); `app/_layout.tsx:48` | verified |
| `UIRequiresFullScreen` no longer opts out of resizing on iOS 27. **The iPad four-orientation write is not new**: SDK 55's `RequiresFullScreen.js` has the same `isTabletEnabled && !requiresFullScreen` branch; 58 only adds the comment and warning text | Keep `supportsTablet: true`. Run the resizability QA matrix | `@expo/config-plugins@58.0.9` vs `node_modules/@expo/config-plugins` (55) `build/ios/RequiresFullScreen.js`; SDK 58 changelog | verified (corrects the apple-ios27 researcher's "new silent default") |
| `@expo/fingerprint` 0.16.6 → 0.21.5. `DEFAULT_PRESET = 'balanced'`: its sourceSkips add `ExpoConfigRuntimeVersionIfString`, `EasJson`, `Easignore`, `AutolinkingConfigPaths`, and it sets `nativeModuleSourceType` / `configPluginSourceType` to `'package'`. User config is spread over the preset, so our `sourceSkips` array **replaces** the preset's skips | Merge in the balanced skips (Decision 11) | `@expo/fingerprint@0.21.5` `build/Presets.js`, `build/Options.js` (`normalizeOptionsAsync`) | verified |
| `patches/` is still content-hashed whatever the source type (`sourcer/PatchPackage.js:26-31`), and in-repo config plugin files are "hashed directly" (`sourcer/Expo.js:161-162`) | docs/RELEASING.md's "patches/ forks the runtime" stays true. A local widget plugin forks the runtime when edited | same tarball | verified (corrects the tooling researcher's "patched modules become invisible") |
| Expo CLI forces `NODE_ENV`; Router defaults to `web.output: "server"`; Node ≥ 22.13 / 24.3 / 26; RN 0.87's Strict TS API makes `react-native/Libraries/*` deep imports type errors | `app.json` already pins `web.output: "static"`. There are 0 deep imports and no code reads `NODE_ENV`. CI's `node-version: '20'` must change (`.github/workflows/test.yml:14,33`) | SDK 58 changelog (fetched); grep | verified |
| `expo/tsconfig.base` `jsx` changes from `react-native` to `react-jsx` | Possible typecheck fallout | `expo@58.0.16/tsconfig.base.json` vs 55 | verified |
| eas-cli v22.0.0: build objects in `--json` output now have `runtime` (`{id, version}`) and `updateChannel` in place of `runtimeVersion` and `channel`; other `eas update` JSON is unchanged. v24.4.2: "Support Xcode 27, which replaces Simulator.app with Device Hub". v24.4.0: Node `^20.18.3 \|\| >=22.0.0`. v24.9.0 (build-tools): SDK 58 builds upload the embedded bundle by default | `scripts/ota-publish.sh:94` reads `b.runtimeVersion` from `eas build:list --json`. On eas-cli ≥ 22 the audience guard reads an empty runtime and refuses every publish (fail-closed) | `gh release view v22.0.0 / v24.4.0 / v24.4.2 / v24.9.0 --repo expo/eas-cli` | release notes verified; script impact **likely** |
| The `build:list` `--runtime-version` flag still exists in 25.2.0 | The guard query still works | `eas-cli@25.2.0` `build/commands/build/list.js:44-45` | verified |

#### F2.9 Unchanged (no action)

- `expo-file-system/legacy` (`src/lib/log.ts:13`).
- `expo-secure-store`, `expo-splash-screen`, `expo-symbols`, `expo-image`, `expo-blur`, `expo-system-ui`, `expo-web-browser`, `expo-application`, `expo-dev-client`. Their only 56–58 breaking entry is the iOS 16.4 minimum (researcher, CHANGELOGs).
- `@expo/vector-icons` keeps working at 15.1.1 (peer `expo-font >=14.0.4`).
- The privacy-manifest categories are unchanged for iOS 27. No new required-reason category was found (**unverified**; re-check before submission).
- New Architecture: already mandatory on RN 0.83.
- The same `babel-preset-expo` auto-adds the worklets plugin on 55 and 58, so the explicit `react-native-reanimated/plugin` in `babel.config.js` is not a new duplication (`babel-preset-expo@58.0.18` `build/configs/expo.js:104-116` vs 55 `build/index.js:313-320`, verified).

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

`expo-widgets ~58.0.21` is a range and is no longer excluded. `@expo/ui` follows it transitively; it isn't added as a direct dependency. *The user may veto (b) in favor of (a).*

### Decision 6: Delete the reanimated patch

**Chosen:** delete `patches/react-native-reanimated+4.2.1.patch` (F2.5), and update the now-stale `babel.config.js:19-22` comment. With both patches gone, `patches/` is empty. `patch-package --error-on-fail --error-on-warn` stays as the postinstall, so future patches are strict.

### Decision 7: Skia 2.14 + victory-native 42

**Chosen:** Make `ScrubCursor` and `AIArcHero` version-neutral on SDK 55 first (FR2). For `ScrubCursor`, use `Skia.Path.MakeFromSVGString('M x y L x y2')`. For `AIArcHero`, use `<Path path={full} start={0} end={sweepProgress}>`, which trims natively and needs no worklet `copy()`. Then move to Skia `2.14.0` and victory-native `^42.0.1` in FR4. Add a source guard that bans `Skia.Path.Make()` mutation in app code.

### Decision 8: Pin the production image

**Options:** `auto`; `macos-tahoe-26.6-xcode-27.1` (`sdk-58` alias, Xcode 27.1 RC 27A9275); `macos-tahoe-26.6-xcode-27.0` (27.0 GA 27A266a, the same build as this Mac).
**Chosen:** `build.production.ios.image = "macos-tahoe-26.6-xcode-27.1"` (spec 09 rule 1: the `sdk-58` image when it's GA or RC). App Store Connect accepts RC Xcode builds; spec 09's research covers this, though it was **not** re-verified this pass. `development` and `preview` keep `auto`, which also resolves to the `sdk-58` image. Fallback: 27.0 GA.

### Decision 9: Scenes come from the template

**Chosen:** No `expo-build-properties` and no `enableSceneSupport`. No hand-written `UIApplicationSceneManifest`. No `ios.deploymentTarget` override. FR9 asserts the generated files. The project stays CNG (`ios/` is gitignored), so the expo.fyi scene migration guide doesn't apply.

### Decision 10: iPad and resizing

**Chosen:** Keep `ios.supportsTablet: true` and `orientation: "portrait"`, and don't add `requireFullScreen` (spec 09 D3). On iOS 27 it no longer opts out of resizing, and the iPad orientation behavior is unchanged from build 18 (F2.8). Run spec 09's resizability matrix in FR11. The task is to fix breakage, not to redesign the layout.

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
- CI `node-version: '22'` in both jobs.
- Upgrade the global eas-cli to ≥ 25.2.0 and set `eas.json` `cli.version` to `">= 25.2.0"`.
- `scripts/ota-publish.sh` reads `b.runtime?.version ?? b.runtimeVersion`. **Cherry-pick that script fix to `release/1.1` before** anyone runs the upgraded CLI against the 1.1.x lane. `scripts/` isn't a fingerprint input, so it's OTA-neutral.

### Decision 13: Branches, the hotfix lane, and build 18

**Chosen:**
- Tag `build-18` → `aade79b` and cut `release/1.1` from `aade79b` (FR1). All 1.1.x fixes go there. They're OTA'd with `scripts/ota-publish.sh` from that branch, or rebuilt natively if App Review rejects build 18. Each fix is cherry-picked forward to `feat/sdk-58`.
- `feat/sdk-58` doesn't merge to `main` until two things hold: build 18's review is resolved, and build 19 has passed the TestFlight smoke. Until then `main` stays exactly build 18.
- Never run `eas update --channel production` from `feat/sdk-58`. Dev builds use the `development` / `preview` channels.
- Never submit to App Review without the user's explicit go-ahead.

### Decision 14: Version and build number

**Chosen:** `expo.version` = `package.json` `version` = `1.2.0`, and the lockfile root version is also `1.2.0` (`fingerprint-config.test.ts` FR1). `ios.buildNumber` = `"19"`. Before the production build, re-check it is the next unused number (`node .appstore/asc.js builds`). If a 1.1.x rebuild consumed 19, take 20. Tests are range-based (≥ 19), so either passes.

### Decision 15: Android

**Chosen:** `expo.autolinking.android.exclude: ["expo-widgets"]`. This keeps expo-widgets 58's Glance, WorkManager and Hermes runtime out of the Android app, which renders widgets through `react-native-android-widget` and only `require`s expo-widgets on iOS (`bridge.ts:913-916,976-977`). Bump `react-native-android-widget` to `^0.23.0`. The pre-existing "Android widget handler is never registered" bug stays out of scope (Android isn't on the store).

---

## Interface Contracts

### I1. `package.json` (post-FR4)

`dependencies`:

```
@expo-google-fonts/inter ^0.4.2 · plus-jakarta-sans ^0.4.2 · space-grotesk ^0.4.1 · space-mono ^0.4.2   (unchanged)
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

### I2. `app.json`

| Key | Contract |
|---|---|
| `expo.version` | `"1.2.0"` |
| `expo.ios.buildNumber` | `"19"` (an integer string ≥ 19, the next unused) |
| `expo.ios.supportsTablet` / `requireFullScreen` | `true` / absent |
| `expo.orientation` | `"portrait"` (advisory on iOS 27) |
| `expo.ios.infoPlist` | `UIBackgroundModes: ["remote-notification"]`, `ITSAppUsesNonExemptEncryption: false`. No `UIApplicationSceneManifest`, no `NSFaceIDUsageDescription` |
| `expo.ios.deploymentTarget` | absent (the template default is 16.4) |
| `expo.ios.privacyManifests` | Unchanged from build 18 (spec 03 contract) |
| `expo.plugins` | Same as build 18, plus `"./plugins/withHourglassWidgetBackground"` placed **immediately before** the `expo-widgets` tuple. No `expo-build-properties` entry. `JSON.stringify(plugins)` doesn't contain `enableSceneSupport` |
| `expo.web.output` | `"static"` |
| `expo.runtimeVersion` | `{ "policy": "fingerprint" }` (unchanged) |

### I3. `eas.json`

| Key | Contract |
|---|---|
| `cli.version` | `">= 25.2.0"` |
| `cli.appVersionSource` | `"local"` (unchanged) |
| `build.production.ios.image` | `"macos-tahoe-26.6-xcode-27.1"`. Matches `/^macos-[a-z]+-\d+(\.\d+)*-xcode-27(\.\d+)+$/` and isn't an alias |
| `build.development` / `build.preview` | no `image` key |
| `submit.production.ios` | unchanged |

### I4. Prebuilt iOS project (FR9, scratch copy)

| File | Must contain |
|---|---|
| `ios/Hourglassxo/Info.plist` | `UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes = false`; `UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName = "$(PRODUCT_MODULE_NAME).SceneDelegate"`; `UILaunchStoryboardName = "SplashScreen"`; `UIBackgroundModes = ["remote-notification"]`; no `NSFaceIDUsageDescription`; `UIRequiresFullScreen = false`; `UISupportedInterfaceOrientations~ipad` has all 4; `CFBundleShortVersionString`/`CFBundleVersion` resolve to 1.2.0 / 19 |
| `ios/Hourglassxo/SceneDelegate.swift` | `class SceneDelegate: ExpoAppSceneDelegate` |
| `ios/Hourglassxo/AppDelegate.swift` | `class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider` |
| `ios/*.xcodeproj/project.pbxproj` | every `IPHONEOS_DEPLOYMENT_TARGET` is ≥ `16.4`; `Podfile.properties.json` has no `ios.deploymentTarget` < 16.4 |
| `ios/Hourglassxo/*.entitlements` and `ios/ExpoWidgetsTarget/*.entitlements` | `com.apple.security.application-groups` = `["group.com.jalvarez0907.hourglass.widgets"]` |
| `ios/Hourglassxo/PrivacyInfo.xcprivacy` | the build-18 manifest, including `1C8F.1` |
| `ios/ExpoWidgetsTarget/Info.plist` | no `UIApplicationSceneManifest` |
| `ios/ExpoWidgetsTarget/HourglassWidget.swift` | `WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())` exactly once, plus the `HourglassContainerBackground` struct |
| prebuild output | no `enableSceneSupport` warning; every warning recorded |

### I5. IPA (FR11)

| Info.plist key (`Payload/*.app/Info.plist`) | Contract |
|---|---|
| `DTSDKName` | starts with `iphoneos27` |
| `DTSDKBuild` | starts with `24` (the build-16 IPA had `23F81a`) |
| `DTXcode` | starts with `27` |
| `CFBundleShortVersionString` / `CFBundleVersion` | `1.2.0` / `19` |
| `MinimumOSVersion` | `16.4` |
| scene delegate class | ends with `.SceneDelegate` |

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

Every `node-version:` in `.github/workflows/test.yml` is `'22'`. `app-tests` runs `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` (spec 07 order unchanged).

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
- `__tests__/config/app-config.test.ts`: a `describe('10-sdk-58-ios-27')` block covering I2/I3 (typed JSON imports only, per spec 03's contract).
- `__tests__/config/app-config-introspect.test.ts`: `sdkVersion` major 58; `UIRequiresFullScreen === false`; spec 03's guards stay intact. A local plugin isn't guaranteed to show up in `_internal.pluginHistory`, so the plugin's effect is asserted in the FR9 prebuild instead.
- `__tests__/config/fingerprint-config.test.ts`: the expected `sourceSkips` become the 7 names; every name is a `SourceSkips` enum member.
- `__tests__/ci-gates.test.ts`: every `node-version` is ≥ 22 and even.
- `__tests__/scripts/ota-publish.test.ts`: the audience guard accepts both `runtimeVersion` and `runtime.version` build JSON.
- `src/widgets/__tests__/widgetLayoutJs.test.ts`:
  - `props` undefined doesn't throw;
  - `containerBackground` is present on each system root;
  - every stack sets `spacing`;
  - the `env.date` countdown is used;
  - every global the layout references exists in `@expo/ui/swift-ui` (including modifiers).
- `__tests__/config/widget-background-plugin.test.ts` (new): transform, idempotence, and the missing-anchor throw, against the real `widgetSwift` template string copied from `expo-widgets@58.0.21` `plugin/src/ios/withWidgetSourceFiles.ts:355-364` as a fixture.
- API client: tests for the single body read (a fake Response that throws `TypeError` on a second read), an empty body on 200 and 204 (GET and PUT), a non-JSON 2xx body → `ApiError`, and a `FetchError`-shaped rejection → `NetworkError`.
- Components: `ScrubCursor.test.ts` (`MakeFromSVGString` string), `AIArcHero*.test.tsx` (`Path` `start`/`end` props).

### Manual / commands

- `rm -rf node_modules && npm ci`; `npx expo install --check`; `npx expo-doctor`; `npm ls` (no `invalid` / `UNMET`).
- The scratch prebuild (I4).
- An EAS development build on device (Checkpoint B).
- The EAS production build on the pinned image (I5).
- Fingerprint determinism: local `runtimeversion:resolve --platform ios` equals the build's runtime.
- TestFlight smoke on an iOS 27 iPhone and iPad: the checklist covers spec 05's 8 items, plus the scene, fetch, widget and memory checks, plus the resizability matrix.

---

## Files to Create/Modify

| File | Action | FR |
|---|---|---|
| `package.json`, `package-lock.json` | modify | FR1, FR4, FR5 |
| `patches/expo-widgets+55.0.5.patch`, `patches/react-native-reanimated+4.2.1.patch` | delete | FR4 |
| `__mocks__/react-native-inner-shadow.ts` | delete | FR1 |
| `components/haptic-tab.tsx`, `src/components/__tests__/HapticTab.test.tsx` | delete | FR2 |
| `src/components/FadeInScreen.tsx`, `src/hooks/useFocusKey.ts`, `src/hooks/useStaggeredEntry.ts` (+ their test mocks) | modify | FR2 |
| `src/components/ScrubCursor.ts`, `src/components/AIArcHero.tsx`, `__mocks__/@shopify/react-native-skia.ts` (+ tests) | modify | FR2 |
| `src/api/client.ts` (+ API tests) | modify | FR3 |
| `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(auth)/_layout.tsx`, `src/components/FloatingPillTabBar.tsx`, `app/(tabs)/__tests__/native-tabs.test.tsx` | modify | FR4 |
| `jest.config.js`, `babel.config.js` (comment), `__tests__/auth-screens.test.tsx`, `src/__tests__/hooks/useWidgetSync.test.ts` | modify | FR4 |
| `__tests__/config/deps.test.ts` | create (port) | FR1, FR4 |
| `__tests__/config/sdk58-migration.test.ts` | create | FR2, FR4 |
| `app.json`, `eas.json` | modify | FR5, FR6, FR8 |
| `__tests__/config/app-config.test.ts`, `__tests__/config/app-config-introspect.test.ts` | modify | FR5, FR6 |
| `src/widgets/bridge.ts`, `src/types/modules.d.ts`, `src/widgets/__tests__/widgetLayoutJs.test.ts`, `src/__tests__/widgets/clearWidgetData.test.ts` | modify | FR6 |
| `plugins/withHourglassWidgetBackground.js`, `__tests__/config/widget-background-plugin.test.ts` | create | FR6 |
| `.github/workflows/test.yml`, `__tests__/ci-gates.test.ts` | modify | FR8 |
| `fingerprint.config.js`, `__tests__/config/fingerprint-config.test.ts` | modify | FR8 |
| `scripts/ota-publish.sh`, `__tests__/scripts/ota-publish.test.ts` | modify (also on `release/1.1`) | FR8 |
| `TECH_STACK.md`, `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/RELEASING.md`, `features/app/store-compliance/FEATURE.md` | modify | FR10 |

---

## Edge Cases to Handle

1. **App Review rejects build 18.**
   - Fix on `release/1.1`. A native 1.1.0 rebuild takes the next build number, possibly 19, which moves v1.2.0 to 20.
   - The range tests still pass.
   - Cherry-pick the fix forward.
2. **1.1.x OTA during the migration.** Publish only from `release/1.1` with `scripts/ota-publish.sh`. Its runtime guard targets build 18's fingerprint. Apply the Decision 12 script fix there first if eas-cli ≥ 22 is installed.
3. **Update without an app open.**
   - Covered by Decision 5's native fallback.
   - Verified on device by installing build 18 from TestFlight, adding all three widget sizes, updating to build 19 **without** opening it, and checking the widgets.
4. **expo-widgets G hunk needed after all.** If the ExpoWidgets pod fails to compile because something is "unavailable in application extensions", re-add only that setting. Prefer a local config plugin on the Podfile `post_install`; fall back to a one-line patch-package hunk. In the patch case, also pin exactly, add to `install.exclude`, and keep `babel-preset-expo`'s `^58.0.21` peer satisfied.
5. **The codemod is unreliable** (expo/expo#46481). The source-walk test is the authority, not the codemod's report.
6. **Peer conflicts during install.** Never use `--legacy-peer-deps` or `--force`. Fix the conflicting range instead (RNTL 14 is the known one).
7. **Two copies** of `react-native-css-interop`, `test-renderer`, `expo-widgets`, `@expo/ui` or `react`. The `deps.test.ts` single-copy checks fail; fix the declared range.
8. **NativeWind `className` stops applying on SDK 58's Metro.** Keep `metro.config.js`'s resolver redirect and `forceWriteFileSystem`. Removing them is a separate, reversible experiment.
9. **No Simulator.** All runtime checks run on physical devices through EAS development, preview or production builds. Start Metro from this worktree on port 8082, never on 8081 and never from `WS/hourglassws`.
10. **The ASC agreement is unaccepted (403).** Uploads and asc.js calls stay blocked until the Account Holder accepts it (spec 05).
11. **The 1.2.0 version record can't be created while 1.1.0 is in review** (unverified ASC rule). A TestFlight upload doesn't need the version record. Create it when ASC allows.
12. **EAS build-tools upload the embedded bundle for SDK 58 builds** (eas-cli 24.9.0). After build 19, check `eas update:list --branch production`. If an automatic entry would confuse runbook A, set `EAS_UPDATE_UPLOAD_EMBEDDED_BUNDLE=0` in the production env and record it.
13. **The Strict TS API or TS 6 produces more than 60 errors.** Spec 07/09's escape hatch applies: the `react-native-legacy-deep-imports` opt-out is allowed temporarily, with a dated follow-up. There are 0 deep imports today, so this is unlikely.

## Open Questions

- **Q1 (user):** Decision 3 (icons), Decision 4 (test renderer) and Decision 5 (native widget fallback) are recorded as chosen defaults. Confirm them or change them before FR4.
- **Q2 (resolved at FR9/FR11):** Is the ExpoWidgets `APPLICATION_EXTENSION_API_ONLY=No` setting (hunk G) still needed? It's answered by the first build of the `ExpoWidgetsTarget` scheme.
- **Q3 (resolved at Checkpoint B):** Is the `metro.config.js` jsx-runtime redirect still required? It's answered by a reversible experiment on the dev client.
- **Q4 (resolved at FR11):** Does Instruments' Activity Monitor on Xcode 27 read the footprint of a TestFlight (non-debuggable) app? If it doesn't, the memory check runs on the development build only.
- **Q5 (before submission):** Re-check Apple's required-reason API list and the Age Rating "social media capabilities" answer (set to No for 1.1.0 by spec 05 FR5) for the 1.2.0 submission.
