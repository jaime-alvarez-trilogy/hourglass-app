# 08-expo-sdk-57-scenes

**Status:** Draft
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

**What is being built:** Upgrade the app from Expo SDK 55 (`expo` 55.0.7, React Native 0.83.2) to SDK 57 (`expo` ≥ 57.0.23, React Native 0.86.x), going through an SDK 56 checkpoint. On SDK 57, opt in to the UIKit scene lifecycle with `expo-build-properties` `ios.enableSceneSupport: true`. That makes the app launchable when it is built with the iOS 27 SDK (Xcode 27). The work happens on branch `feat/sdk-57` and ships as **v1.2.0**. It is **not** part of build 18 (specs 01–05, 07) or build 19 (spec 06).

**How:**
1. **Start gate (checklist pre-implementation).** Specs 06 and 07 must be merged first. Re-verify the registry floors. Then ask Jaime to confirm SDK 57 is still the target. As of 2026-10-19, SDK 58 is stable (`expo@latest` = 58.0.16, 58.0.0 published 2026-09-29), and EAS lists `macos-tahoe-26.6-xcode-27.0` and `macos-tahoe-26.6-xcode-27.1` images. That means both of spec 09's start triggers are already met. Retargeting straight to 58 is Jaime's call, not the executor's.
2. **Milestone A: SDK 56 checkpoint, JS-only.** First (Phase 1.0), rewrite spec 06's SDK 55-pinned `deps.test.ts` cases so they're SDK-relative (FR1). Then run `npx expo install expo@^56.0.0 --fix`. Move every `@react-navigation/*` import to `expo-router` (FR2) and every `@expo/vector-icons` import to `@react-native-vector-icons/*` (FR3). Delete the obsolete reanimated patch (FR5). Gate: typecheck and lint pass, and `npm test` fails only on the named milestone-B cases (FR1). Commit. No native build, because `expo-widgets` stays pinned at 55.0.5 (spec 06's `expo.install.exclude`) until milestone B. Never ship this state: SDK 56 has the Hermes V1 memory regression.
3. **Milestone B: SDK 57 + scenes.** Run `npx expo install expo@^57.0.0 --fix`. Install `expo-build-properties` and add the scene-support plugin entry (FR4). Bump `expo-widgets` explicitly to its sdk-57 version and regenerate its patch with only the hunks that are still needed (FR5). Move the widget's container background from the patch into the JS layout as an `@expo/ui` modifier (FR5).
4. **Verify on device (FR6).** Check AppState-driven refresh, `expo/fetch` (now the global `fetch`), push, notifications, widget, deep links and memory. Use a dev client, a `preview-xcode27` build on an iOS 27 device, and then TestFlight.
5. **Package and ship (FR7).** Version 1.2.0, the next unused build number, docs, and the `release/1.1` hotfix lane. TestFlight smoke, then App Review via the `docs/RELEASING.md` runbook (specs 04/05).

**Ships:** native build v1.2.0, Dec 2026–Jan 2027 (FEATURE.md Release Plan). The fingerprint runtime (spec 04) changes, so 1.1.x installs get OTA updates only from the 1.1.x tree.

---

## Out Of Scope

1. **SDK 58 upgrade, building production on an Xcode 27 image, pinning `build.production.ios.image`, and removing `enableSceneSupport`.** **Deferred to 09-sdk-58-xcode-27.** This spec adds only a verification-only `preview-xcode27` profile (FR4). Production keeps EAS's `auto` image. On 2026-10-19 the `sdk-57` alias resolves to `macos-tahoe-26.5-xcode-26.6`.

2. **iPad resizability, multi-window, and `UIApplicationSupportsMultipleScenes: true`.** **Deferred to 09-sdk-58-xcode-27** (that spec owns the iOS 27 resizability pass). The scene manifest written by the plugin keeps `UIApplicationSupportsMultipleScenes: false`.

3. **Notification-tap routing and widget deep links (`widgetURL`).** **Descoped.** The app has neither today: no `addNotificationResponseReceivedListener` (ARCHITECTURE.md §1.5: "Tapping a notification opens the app"), and no `widgetURL` in `src/widgets/`. Adding them is new behavior (FEATURE.md Non-Goals). FR6 only checks that a tap still opens the app.

4. **Android verification, and the pre-existing Android pill-tab glyph bug.** **Descoped** (FEATURE.md Non-Goals: Android store listing). `src/components/FloatingPillTabBar.tsx:35-37` maps to `bar_chart`, `auto_awesome` and `check_circle`. None of these names exist in the MaterialIcons glyphmap of either `@expo/vector-icons` 15.1.1 or `@react-native-vector-icons/material-icons` 14.0.0 (verified 2026-10-19), and `FloatingPillTabBar.test.ts:129-141` pins those wrong values. FR3 keeps the map byte-for-byte. This is recorded here so it isn't lost.

5. **Static icon-font embedding (`/static` imports + `@react-native-vector-icons/*` config plugins) and excluding icon packages from autolinking to avoid shipping the fonts twice.** **Descoped.** This is an optimization. FR3 uses the default (dynamic) import, which matches today's runtime model (expo-font registers the font at first render) and keeps fonts OTA-updatable.

6. **Deleting the rest of the Expo-starter scaffolding** (`app/(tabs)/explore.tsx`, `components/*`, root `hooks/*`). **Descoped.** ARCHITECTURE.md §8.6 lists these as candidates, but the migration doesn't require it, and `explore.tsx` is a live route. Only `components/haptic-tab.tsx` is deleted. It has zero importers, and its only purpose was wrapping the now-deprecated `PlatformPressable` (FR2).

7. **Opt-in SDK 56/57 features** (Stack v5, `Stack.Toolbar`, React Compiler, streaming SSR, worklets bundle mode). **Descoped.**

8. **Major bumps of non-Expo-managed libraries** (victory-native 42, NativeWind 5). **Descoped** for this spec. victory-native 42 is called out in spec 09's research. Libraries move only as far as `npx expo install --fix` requires.

9. **Upstreaming the expo-widgets fixes, or retiring the patch entirely.** **Descoped.** FR5 shrinks the patch to the hunks that are still needed. Removing `expo-widgets` from `expo.install.exclude` is tied to retiring the patch (spec 06 Decision 2), so the exclude stays.

10. **A "Requires iOS 16.4" line on `site/support.html`.** **Descoped.** The App Store listing shows the minimum OS automatically, and editing spec 01's page would churn its content tests. FR7 puts the note in What's New instead.

11. **Foreground OTA checks (`checkForUpdateAsync`).** **Descoped** (FEATURE.md Non-Goals).

---

## Functional Requirements

### FR1: SDK 57 dependency baseline

Move the dependency set to SDK 57 in two `expo install --fix` hops and leave the tree consistent.

**Requirements:**
- Hop 1 (milestone A): `npx expo install expo@^56.0.0 --fix`. Hop 2 (milestone B): `npx expo install expo@^57.0.0 --fix`. Don't hand-edit Expo-managed versions.
- Final `package.json`:
  - `dependencies.expo`: the tilde range `expo install` writes, on 57.0.x with x ≥ 23 (`~57.0.30` on 2026-10-19). The floor comes from `expo-build-properties`' `MINIMUM_EXPO_VERSION = '57.0.23'`; the plugin throws below it.
  - `dependencies["expo-build-properties"]`: added with `npx expo install expo-build-properties` (sdk-57 tag 57.0.22 on 2026-10-19). The floor is 57.0.20: the property was added in 57.0.19, and 57.0.20 fixed startup-block detection when another plugin edits the AppDelegate.
  - `dependencies["expo-widgets"]`: an **exact** version equal to `npm view expo-widgets@sdk-57 version` (57.0.26 on 2026-10-19). Install it explicitly, because spec 06's `expo.install.exclude` makes `--fix` skip it. `"expo-widgets"` stays in `expo.install.exclude`.
  - `devDependencies["@react-native/jest-preset"]`: present, matching the React Native minor (`^0.85.x` at hop 1, `^0.86.x` at hop 2). jest-expo 56 and 57 both declare this as a peer, and jest-expo throws "The React Native Jest preset … has moved to a separate package" without it.
  - Removed: `@react-navigation/native`, `@react-navigation/bottom-tabs` and `@react-navigation/elements` (after FR2), and `@expo/vector-icons` (after FR3). Added: `@react-native-vector-icons/ionicons` and `@react-native-vector-icons/material-icons` (FR3).
  - `typescript`: accept the 6.0.x that hop 1's `--fix` installs (SDK 56 changelog: "TypeScript bumped to 6.0.3 … pulled in via `npx expo install --fix`"). **Fallback:** if `npm run typecheck` then fails on errors caused by TS 6 itself rather than by SDK API changes, pin `"typescript": "~5.9.2"`, add `"typescript"` to `expo.install.exclude`, and record the decision in the checklist Session Notes.
- `package-lock.json` is regenerated and committed. `rm -rf node_modules && npm ci` succeeds with `postinstall: patch-package --error-on-fail` (spec 06).
- **Retire spec 06's SDK 55 pins in `__tests__/config/deps.test.ts`, in Phase 1.0, before hop 1.** Spec 06 pins the SDK 55 line on purpose (its Out of Scope 3). On 2026-10-19, hop 1 resolves `expo` 56.0.23, `react-native` 0.85.3 and `react-native-worklets` 0.8.3, and milestone B moves `expo-widgets` to 57.0.26. Left alone, those cases go red at milestone A or B and never come back. Change them like this:
  - `dependencies['expo-widgets'] === '55.0.5'` (spec 06 FR1): replace it with an assertion that `dependencies['expo-widgets']` equals the `version` that `getPackageDetailsFromPatchFilename` parses from the single `patches/expo-widgets+*.patch`. That ties the pin to the patch file, not to an SDK: 55.0.5 on `main` and at milestone A, 57.x at milestone B.
  - The `SDK 55 patch line` describe (spec 06 FR5): replace it with an SDK-relative `SDK line consistency` describe. Keep the `versionAtLeast` unit checks. Assert that the lockfile `expo-notifications`, `expo-updates` and `jest-expo` versions each have the same major as the lockfile `expo`. Delete the `expo` `55.`, `react-native` `0.83.` and `react-native-worklets` `0.7.` cases and the 55.x floors. The absolute SDK floors live only in `sdk-migration.test.ts`: `expo`, `expo-build-properties` and `react-native` (below), plus `react-native-worklets` `0.10.x`, which replaces spec 06's reanimated-compatibility case (reanimated 4.5.1 declares the peer `react-native-worklets: 0.10.x`).
  - Keep unchanged: patch discovery and parsing, the real-data `collectPatchProblems(...)` equals `[]` case, every `collectPatchProblems` fixture (pure logic on synthetic data, so the `55.0.x` literals there stay), the postinstall cases, both ngrok cases, and both `expo.install.exclude` cases.
  - The rewritten cases pass on `main` and at both milestones. They aren't on the milestone-A allowed-failure list.

**Success Criteria:**
- [ ] `package-lock.json` `packages["node_modules/expo"].version` is ≥ 57.0.23 and < 58.0.0.
- [ ] `package-lock.json` `packages["node_modules/expo-build-properties"].version` is ≥ 57.0.20 and < 58.0.0.
- [ ] `package-lock.json` `packages["node_modules/react-native"].version` matches `/^0\.86\.\d+$/`.
- [ ] `package-lock.json` `packages["node_modules/react-native-worklets"].version` matches `/^0\.10\.\d+$/`.
- [ ] `__tests__/config/deps.test.ts` has no SDK-pinned assertion. There's no `SDK 55 patch line` describe, and `55.0.x` literals appear only in the `collectPatchProblems` fixtures. The `expo-widgets` case compares against the patch filename's version, and the lockfile `expo-notifications`/`expo-updates`/`jest-expo` versions are asserted to share `expo`'s major. Spec 06's version-agnostic cases are still present.
- [ ] `dependencies["expo-widgets"]` matches `/^57\.\d+\.\d+$/` (exact, no range), and `expo.install.exclude` still contains `"expo-widgets"`.
- [ ] `dependencies` and `devDependencies` have no key starting with `@react-navigation/` and no `@expo/vector-icons`.
- [ ] `devDependencies` contains `@react-native/jest-preset`.
- [ ] `npm ls @react-navigation/native --all` prints `(empty)`.
- [ ] `npx expo install --check` exits 0.
- [ ] `npx expo-doctor` exits 0. In particular, it doesn't print the SDK 56 "expo-router and react-navigation are both installed" warning.
- [ ] `rm -rf node_modules && npm ci` exits 0.
- [ ] Milestone A: `npm run typecheck` and `npm run lint` exit 0, and `npm test` fails only the named milestone-B cases: the FR1 version-floor (`expo`, `expo-build-properties`, `react-native`, `react-native-worklets`) and `expo-widgets` cases in `sdk-migration.test.ts`, FR4, the FR5 expo-widgets patch-content and `containerBackground` cases, and FR7. Every other `deps.test.ts` case passes at milestone A, including the rewritten spec 06 cases. Milestone B: all three exit 0, with no failures.

---

### FR2: Navigation imports move to `expo-router`

expo-router 56+ no longer depends on `@react-navigation/*`; it ships a fork (verified: `expo-router@57.0.28` has no `@react-navigation/*` dependency, while 55.0.7 depends on four). Every direct import must move to the expo-router entry points.

**Requirements:**
- Source sites (the complete list from `grep -rn "@react-navigation" app src components hooks constants` on 2026-10-19):

  | Site | Today | Change |
  |------|-------|--------|
  | `app/_layout.tsx:6` | `import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'` | Merge into the existing `expo-router` import at `:11` (`expo-router` exports all three, `build/exports.d.ts:22-24`) |
  | `src/components/FadeInScreen.tsx:18` | `useIsFocused` from `@react-navigation/native` | `from 'expo-router'` |
  | `src/hooks/useFocusKey.ts:2` | same | `from 'expo-router'` |
  | `src/hooks/useStaggeredEntry.ts:29` | same | `from 'expo-router'` |
  | `src/components/FloatingPillTabBar.tsx:18` | `import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'` | `from 'expo-router/js-tabs'` (re-exports the bottom-tabs types) |
  | `components/haptic-tab.tsx:1-2` | `BottomTabBarButtonProps` + `PlatformPressable` (`@react-navigation/elements`) | **Delete the file.** It has zero importers (`app/(tabs)/__tests__/native-tabs.test.tsx:204-206` already asserts the layout doesn't use it), and `PlatformPressable` is `@deprecated … Copy the component into your codebase` in expo-router 57 |
  | `app/(tabs)/_layout.tsx:24` | `import { Tabs } from 'expo-router'` (not react-navigation, but `@deprecated Use import { Tabs } from 'expo-router/js-tabs'` in 57) | `import { Tabs } from 'expo-router/js-tabs'` |

- The codemod is optional: `npx expo-codemod sdk-56-expo-router-react-navigation-replace app src components hooks` (the transform ships in `expo-codemod` 58.0.1). It maps only `native`, `stack`, `bottom-tabs` and `material-top-tabs`. It does **not** handle `@react-navigation/elements` or `jest.mock(...)` strings, and expo/expo#46481 (open) reports it misses about 25% of import sites. The FR2 guard test is the source of truth.
- Test sites that must change in the same milestone:

  | Test | Change |
  |------|--------|
  | `app/__tests__/layout-notifications.test.tsx:99` | Move `DarkTheme`/`DefaultTheme`/`ThemeProvider` into the existing `jest.mock('expo-router', …)` factory at `:82`. Delete the react-navigation mock |
  | `app/(tabs)/__tests__/index.test.tsx:54` | Move `useIsFocused` into the `expo-router` mock at `:65` |
  | `app/(tabs)/__tests__/indexConeIntegration.test.tsx:44-49` | Move `useIsFocused` (plus `useNavigation`/`useRoute` if still referenced) into the `expo-router` mock at `:38` |
  | `src/components/__tests__/AITab.test.tsx:168` | Merge into the `expo-router` mock at `:75` |
  | `src/components/__tests__/AITabConeIntegration.test.tsx:160` | Merge into the `expo-router` mock at `:83` |
  | `src/components/__tests__/FadeInScreen.test.tsx:22-25` | Replace with `jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }))`. No `requireActual` of a removed package |
  | `src/components/__tests__/FloatingPillTabBar.test.ts:310-314` | Assert `from 'expo-router/js-tabs'`, and rename the `it(...)` title |
  | `src/hooks/__tests__/useStaggeredEntry.test.ts:132-135` | Assert `useIsFocused` is imported from `'expo-router'`, and rename the `it(...)` title |
  | `app/(tabs)/__tests__/native-tabs.test.tsx:86-87, :213-214` | Assert `Tabs` is imported from `'expo-router/js-tabs'` |
  | `src/components/__tests__/HapticTab.test.tsx` | Delete together with `components/haptic-tab.tsx` |

- The guard is a plain string match, so comments naming the package change too: `indexConeIntegration.test.tsx:44`, `AITabConeIntegration.test.tsx:153`, `AITab.test.tsx:163`, `FadeInScreen.test.tsx:9`.
- Any other `jest.mock('expo-router', factory)` (14 test files mock expo-router today) whose test renders a consumer of `useIsFocused` (`useFocusKey`, `useStaggeredEntry`, `FadeInScreen`, `InsightChip`, the four tab screens) must export `useIsFocused` from the factory. Find them by running the suites, not by guessing.

**Success Criteria:**
- [ ] No file under `app/`, `src/`, `components/`, `hooks/`, `constants/`, `__tests__/` or `__mocks__/` contains the string `@react-navigation/` (guard test, Test Plan).
- [ ] `components/haptic-tab.tsx` and `src/components/__tests__/HapticTab.test.tsx` don't exist.
- [ ] `app/(tabs)/_layout.tsx` imports `Tabs` from `'expo-router/js-tabs'` and still imports `NativeTabs` from `'expo-router/unstable-native-tabs'`.
- [ ] Every test file listed above passes. `npm test` passes, and the total count drops only by the deleted `HapticTab.test.tsx` cases.
- [ ] `npx expo export --platform ios --output-dir /tmp/sdk57-export` bundles without "Unable to resolve module @react-navigation/…".

---

### FR3: Icon imports move to `@react-native-vector-icons/*`

SDK 56 deprecated `@expo/vector-icons`, and `expo` no longer depends on it. It still works as an explicit dependency (SDK 57 and 58 `bundledNativeModules.json` still list `^15.0.2`). This spec migrates now anyway, so the next native build isn't needed just for icons.

**Requirements:**
- Source sites (the complete list from `grep -rn "@expo/vector-icons" app src components hooks`):

  | Site | Today | Change |
  |------|-------|--------|
  | `src/components/ApprovalUrgencyCard.tsx:29` | `import { Ionicons } from '@expo/vector-icons'` | `import { Ionicons } from '@react-native-vector-icons/ionicons'` |
  | `src/components/ApprovalCard.tsx:55` | same | same |
  | `src/components/FloatingPillTabBar.tsx:19` | `import MaterialIcons from '@expo/vector-icons/MaterialIcons'` | `import MaterialIcons from '@react-native-vector-icons/material-icons'` |
  | `components/ui/icon-symbol.tsx:3` | same | same |

- Use the **default (dynamic) entry**, not `/static`. Don't add `@react-native-vector-icons/*` config plugins to `app.json`.
- Install with `npx expo install @react-native-vector-icons/ionicons @react-native-vector-icons/material-icons` (14.0.0 on 2026-10-19; peer `expo: "*"`). Remove `@expo/vector-icons`.
- Glyph names stay as they are (`time-outline`, `checkmark-circle`, `close-circle`, the `icon-symbol.tsx` `MAPPING` values, and `FloatingPillTabBar.tsx` `ICON_MAP`, kept byte-for-byte; see Out of Scope 4).
- Jest:
  - Add `__mocks__/@react-native-vector-icons/common.js` (root node-module mock, the same pattern as `__mocks__/@react-native-async-storage/`). Its `createIconSet(glyphMap, options)` returns a function component that renders a host element and forwards `name`, `size`, `color`, `style`, and exposes `glyphMap`. This keeps expo-font dynamic loading out of the node test environment (upstream's recommended jest setup).
  - Rewrite the inline mocks to the new module paths: `app/(tabs)/__tests__/index.test.tsx:74`, `src/components/__tests__/ApprovalUrgencyCardScreenIntegration.test.tsx:92`, `src/components/__tests__/ApprovalUrgencyCard.test.tsx:22`, `__tests__/approval-card.test.tsx:66`, `__tests__/glass-swipe-card.test.tsx:84`. Mock `@react-native-vector-icons/ionicons` with both a named `Ionicons` export and a `default`.
  - Update `src/components/__tests__/FloatingPillTabBar.test.ts:105-108` to `/import\s+MaterialIcons\s+from\s+['"]@react-native-vector-icons\/material-icons['"]/`. Rename the test title as well (`SC2.3 — MaterialIcons imported from @expo/vector-icons/MaterialIcons`).
  - Update the comments that name the old package, because the guard is a plain string match: `app/(tabs)/__tests__/index.test.tsx:69`, `src/components/__tests__/ApprovalUrgencyCard.test.tsx:11`, `__tests__/approval-card.test.tsx:65`, `__tests__/glass-swipe-card.test.tsx:20,83`.
  - No `jest.config.js` change is expected. `transformIgnorePatterns` already admits any `@react-native*` scope, and jest-expo's preset transforms `.ttf` with its asset transformer. Edge Cases has the fallback.
- The codemod is optional and needs flags. It defaults to `/static` imports when run non-interactively, scans the whole directory except `node_modules` (`dist/` holds a built bundle that mentions `@expo/vector-icons`), requires a clean git tree, and rewrites `package.json`. If you use it: `rm -rf dist && npx @react-native-vector-icons/codemod --dynamic .`.

**Success Criteria:**
- [ ] No file under `app/`, `src/`, `components/`, `hooks/`, `constants/`, `__tests__/` or `__mocks__/` contains `@expo/vector-icons` (guard test).
- [ ] No import path ends in `/static` for `@react-native-vector-icons/*`, and `app.json` `plugins` has no `@react-native-vector-icons/*` entry.
- [ ] Every Ionicons name literal used in `ApprovalCard.tsx` and `ApprovalUrgencyCard.tsx` (`checkmark-circle`, `close-circle`, `time-outline`) and every value of `icon-symbol.tsx` `MAPPING` exists in the installed package's `glyphmaps/*.json` (guard test).
- [ ] The five rewritten test files and `FloatingPillTabBar.test.ts` pass.
- [ ] On device, the approve/reject icons on Approvals cards and the clock icon on the urgency card render as glyphs, not as `?` or empty boxes (FR6 smoke).

---

### FR4: UIKit scene lifecycle enabled through `expo-build-properties`

**Requirements:**
- Append exactly this entry to `app.json` `expo.plugins`:
  ```json
  ["expo-build-properties", { "ios": { "enableSceneSupport": true } }]
  ```
  No other `expo-build-properties` keys. In particular, no `ios.deploymentTarget`: the SDK 56+ template default is 16.4. Don't set `useHermesV1` either; the default stays Hermes V1 (the memory regression is fixed at ≥ 57.0.9 per the SDK 57 changelog, below the 57.0.23 floor).
- `app.json` must not declare `ios.infoPlist.UIApplicationSceneManifest`. The plugin throws if a manifest it doesn't own is already there.
- No hand-written native code, no committed `ios/`. This is a CNG project (`.gitignore:60` `/ios`).
- On SDK 57, prebuild must produce what `iosSceneSupport.ts` (expo-build-properties 57.0.22) and expo/fyi `ios-scene-lifecycle.md` describe. `AppDelegate` conforms to `ExpoReactNativeFactoryProvider`. The legacy `window = UIWindow(frame: UIScreen.main.bounds)` / `factory.startReactNative(` block is removed. Info.plist gets the scene manifest pointing at `EXExpoAppSceneDelegate`. **No `SceneDelegate.swift`** is generated on SDK 57.
- Add a verification-only EAS profile to `eas.json`:
  ```json
  "preview-xcode27": { "extends": "preview", "ios": { "image": "macos-tahoe-26.6-xcode-27.0" } }
  ```
  Use the newest non-RC Xcode 27 image listed at docs.expo.dev/build-reference/infrastructure/ at execution time (27.0 on 2026-10-19; 27.1 is an RC). Leave `build.production` without an `image`; spec 09 owns production pinning.

**Success Criteria:**
- [ ] `app.json` has exactly one `expo-build-properties` plugin entry. It's a tuple whose options deep-equal `{ ios: { enableSceneSupport: true } }` (app-config test).
- [ ] `app.json` `ios.infoPlist` has no `UIApplicationSceneManifest` key, and no `expo-build-properties` options set `ios.deploymentTarget` (app-config test).
- [ ] `npx expo config --type introspect --json` → `ios.infoPlist.UIApplicationSceneManifest` deep-equals the Scene manifest contract below.
- [ ] Scratch prebuild (`npx expo prebuild -p ios --clean --no-install`, then inspect, then `rm -rf ios`):
  - `ios/Hourglassxo/AppDelegate.swift` contains `class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {`
  - it contains neither `window = UIWindow(frame: UIScreen.main.bounds)` nor `factory.startReactNative(`
  - `find ios -name SceneDelegate.swift` prints nothing
  - `ios/Hourglassxo/Info.plist` contains `EXExpoAppSceneDelegate`
  - the widget extension target's Info.plist contains no `UIApplicationSceneManifest` (`ExpoAppSceneDelegate` is `@available(iOSApplicationExtension, unavailable)`)
  - prebuild output prints no `ios.enableSceneSupport` error or warning
  - afterwards, `git status --porcelain` shows no changes from the prebuild
- [ ] `eas build -p ios --profile preview-xcode27` succeeds. Its "Spin up build environment" log shows Xcode 27.0. The build installs on an iOS 27 device and cold-launches to the Home tab with data: no black screen, no launch crash.
- [ ] `eas build -p ios --profile development` (default `sdk-57` image) succeeds, and the dev client launches on an iOS 26 device.

---

### FR5: Patches rebased or retired; widget background moves to JS

**Requirements:**
- **Delete `patches/react-native-reanimated+4.2.1.patch` at milestone A.** It rewrites the `get _requiresAnimatedComponent()` getter on the `useAnimatedStyle` handle. That getter no longer exists in reanimated 4.3.1 (SDK 56) or 4.5.1 (SDK 57) (verified in the tarballs). With `--error-on-fail`, a stale patch would fail `npm ci`.
- **Replace `patches/expo-widgets+55.0.5.patch` (130,007 bytes) at milestone B** with `patches/expo-widgets+<pinned 57 version>.patch`, carrying exactly these hunks re-applied to the 57 sources:

  | # | File (in `node_modules/expo-widgets/`) | Hunk | Why it's still needed in 57.0.26 |
  |---|------|------|----------------------------|
  | a | `ios/ExpoWidgets.podspec` | quote the script path: `bash -l -c "\"$PODS_TARGET_SRCROOT/../scripts/xcode-build-bundle.sh\""` | 57's `:34` is still unquoted. The repo path contains a space (`…/Claude Code/…`) |
  | b | `scripts/xcode-build-bundle.sh` | `basename "$PROJECT_DIR"` | 57's `:12` is still unquoted |
  | c | `ios/Widgets/TimelineProvider.swift` | `policy: .atEnd` → `.after(Date().addingTimeInterval(15 * 60))` | 57's `:34` still uses `.atEnd`. Product decision: reload every 15 minutes |
  | d | `scripts/autolinking.rb` | add `target.name == 'ExpoWidgets'` to the `APPLICATION_EXTENSION_API_ONLY = 'No'` condition | 57's `expo_widgets_post_install` still lists only `ExpoModulesCore`, `ExpoUI` and `React-*` |

  Dropped from the 55 patch:

  | Dropped intent | Reason |
  |----------------|--------|
  | New file `bundle/build/ExpoWidgets.bundle` (about 126 KB of the 130 KB) | A prebuilt **55.0.5** widget JS runtime. 57 builds the bundle at Xcode build time (`scripts/build-bundle.mjs`), and a stale 55 bundle could silently survive a failed build step |
  | `autolinking.rb`: `.resolve` → `.send(:resolve)` | `AutolinkingManager#resolve` is `public def` in expo-modules-autolinking 55 and 57.0.16 |
  | `ios/Widgets/EntryView.swift`: `.containerBackground(Color(red: 0.051, green: 0.051, blue: 0.102), for: .widget)` | 57 removed the hard-coded background "in favor of `@expo/ui` modifier" (expo-widgets CHANGELOG, #44192). It moves to JS (next bullet) |

- **Widget background in JS:** in `src/widgets/bridge.ts` `WIDGET_LAYOUT_JS`, the three system-family roots `small` (`:665`), `medium` (`:710`) and `large` (`:807`) each get `modifiers: [containerBackground('#0D0D1A', 'widget')]`. `#0D0D1A` is the 55 patch's color; `containerBackground` is a global in the 57 widget runtime (`bundle/index.ts` spreads `@expo/ui/swift-ui/modifiers` onto `globalThis`). The accessory branches (`:811-829`) are unchanged; those families aren't in `app.json` `supportedFamilies`.
- Regeneration procedure: `npx expo install expo-widgets@<sdk-57 version>`, pin it exact, re-apply hunks a–d inside `node_modules/expo-widgets`, run `npx patch-package expo-widgets`, delete the 55.0.5 patch, then `rm -rf node_modules && npm ci`.

**Success Criteria:**
- [ ] `ls patches/` lists exactly one file, `expo-widgets+<v>.patch`, where `<v>` equals `dependencies["expo-widgets"]` and the lockfile version (spec 06's `deps.test.ts` alignment guard passes).
- [ ] The patch file is under 20,000 bytes. Its `diff --git` headers name exactly `ios/ExpoWidgets.podspec`, `scripts/xcode-build-bundle.sh`, `ios/Widgets/TimelineProvider.swift` and `scripts/autolinking.rb`. It doesn't contain `bundle/build/ExpoWidgets.bundle`, `EntryView.swift` or `send(:resolve)`. It does contain `addingTimeInterval(15 * 60)` and `basename "$PROJECT_DIR"` (deps test).
- [ ] `npm ci` output lists `expo-widgets@<v> ✔` and no reanimated patch line.
- [ ] `widgetLayoutJs.test.ts`: for `systemSmall`, `systemMedium` and `systemLarge`, the root node's `modifiers` include `{ __modifier: 'containerBackground', style: '#0D0D1A', placement: 'widget' }`. Existing cases stay green.
- [ ] On device (dev client, then TestFlight): small, medium and large widgets render with an opaque dark background, with no "Please adopt containerBackground API" placeholder and no red "No layout found" box. After data changes, the widget picks up new data within about 15 minutes, and tapping it opens the app.

---

### FR6: Runtime parity under scenes and `expo/fetch`

No app-code changes are expected here. This FR proves that behavior on the new lifecycle and the new fetch matches build 18/19.

**Requirements:**
- `globalThis.fetch` is `expo/fetch` (SDK 56: installed by `expo/src/winter/runtime.native.ts` unless `EXPO_PUBLIC_USE_RN_FETCH` is `1` or `true`). It covers every network call: `src/api/client.ts:36` (token mint), `:223` (`apiGet`), `:261` (`apiPut`), and `src/lib/pushToken.ts:35` / `:65` (relay register/unregister). The body parsing these depend on is `parseBody` (`client.ts:197-198`, `response.text()` first, empty body → `undefined`) and `handleStatus` (`client.ts:139`; 401/403/HTML 5xx).
- **Escape hatch:** set `EXPO_PUBLIC_USE_RN_FETCH=1` only if a device check below fails because of fetch semantics. It's inlined at bundle time, so it must go in `eas.json` `build.{development,preview,preview-xcode27,production}.env` **and** be present whenever `eas update` runs. `.env.local` alone never reaches EAS. Record the failing case in Session Notes.
- Foreground refresh still works under scenes. RN's `RCTAppState` observes `UIApplicationDidBecomeActiveNotification` / `…WillEnterForeground…` (`RCTAppState.mm:85-91`), which UIKit still posts for a single-scene app. The four JS listeners are:
  - `app/_layout.tsx:62` (TanStack `focusManager`, which refetches hours/approvals queries)
  - `src/hooks/useAIData.ts:376`
  - `src/hooks/useScheduledNotifications.ts:276`
  - `src/hooks/useRoleRefresh.ts:100`
- Push and notifications are unaffected by scenes, but must be re-proven. expo-notifications uses `NotificationsAppDelegateSubscriber` and the `UNUserNotificationCenter` delegate, neither of which moves to the scene delegate. Silent push reaches `addNotificationReceivedListener` at `src/notifications/handler.ts:117`.
- Deep links (`scheme: "hourglassws"`) now arrive through `EXExpoAppSceneDelegate`. On cold start it rebuilds the launch options from `connectionOptions.urlContexts`, so `Linking.getInitialURL()` and expo-router's initial route still see the URL.

**Success Criteria** (record pass/fail per row in checklist.md; run on the dev client on an iOS 26 device, the `preview-xcode27` build on an iOS 27 device, and finally the TestFlight build on iOS 27):
- [ ] **Jest:** `__tests__/client.test.ts`, `src/__tests__/api/client.test.ts`, `__tests__/approvals-api.test.ts`, `__tests__/auth-api.test.ts`, `__tests__/error-envelope.test.ts`, `src/__tests__/lib/pushToken.test.ts`, `__tests__/appstate-check.test.ts`, `__tests__/use-ai-data.test.ts`, `__tests__/use-role-refresh.test.ts`, `src/hooks/__tests__/useScheduledNotifications.test.ts`, `src/__tests__/notifications/handler.test.ts`, `app/__tests__/layout-notifications.test.tsx`, `src/widgets/__tests__/` and `src/__tests__/widgets/bridge.test.ts` all pass. These mock `global.fetch`, so they prove the parsing contract only; the device rows below prove `expo/fetch` itself.
- [ ] **Sign-in:** a cold launch and sign-in with the QA manager account (`app-qa.crossover.com`) reaches Home with hours and earnings.
- [ ] **401 path:** onboarding with a wrong password shows the auth-error message, not a crash or a JSON parse error.
- [ ] **Empty-body PUT:** approve one QA item and reject one with a reason. Both succeed, and the build-11 empty-body bug doesn't come back.
- [ ] **Foreground refresh:** background the app for ≥ 60 s, then foreground. In the dev client's React Native DevTools Network panel, new requests to `api-qa.crossover.com` appear within 5 s. On TestFlight, data changed in QA in the meantime shows up.
- [ ] **Silent push:** with the app backgrounded, wait ≤ 30 min for a relay ping (or trigger one from `server/`). The widget's timestamp updates.
- [ ] **Local notification:** a deadline notification fires. Tapping it with the app killed opens the app to the tabs (no routing; Out of Scope 3).
- [ ] **Widget tap:** tapping the widget with the app killed opens the app.
- [ ] **Deep links:**
  - Simulator dev client: `xcrun simctl openurl booted "hourglassws://overview"` opens the Overview tab, both warm and cold (after `xcrun simctl terminate booted com.jalvarez0907.hourglass`).
  - On device: typing `hourglassws://overview` in Safari does the same.
- [ ] **In-app browser:** Settings → About → Privacy Policy and Support open in the in-app browser (spec 02) and dismiss cleanly.
- [ ] **Sign Out:** clears data, and the relay `/health` count drops by 1 (spec 05 check).
- [ ] **Memory (Hermes V1 regression check):** on the dev client with Xcode attached (Debug Navigator → Memory), spend 10 minutes switching tabs with charts animating. Memory at 10 min is ≤ 1.5× memory at 1 min, with no monotonic climb.
- [ ] **Visual smoke:** NativeWind styles, Skia/Victory charts and the NativeTabs glass pill render the same as the build 19 screenshots.

---

### FR7: v1.2.0 packaging, milestones, hotfix lane and docs

**Requirements:**
- Branch `feat/sdk-57` from `main` after specs 06 and 07 have merged. Before milestone B merges to `main`, create `release/1.1` from the commit of the last 1.1.x store build (build 19, or whatever shipped last).
- **Milestone A** commit (`chore(sdk-57): SDK 56 checkpoint — imports migrated, JS gates green`): FR1 hop 1, FR2, FR3, and the FR5 reanimated deletion. Gate: typecheck and lint exit 0; `npm test` fails only the named milestone-B cases (FR1 success criteria); `npx expo-doctor` is clean apart from the excluded `expo-widgets`. No native build. Not merged to `main` alone. CI doesn't run on a branch push without a PR (`test.yml` triggers are `pull_request` and push to `main`), so open the PR only at milestone B.
- **Milestone B:** FR1 hop 2, FR4, FR5 (expo-widgets), then this FR's version and docs, then FR6 device checks, then production build → TestFlight → App Review. Follow the native-release runbook in `docs/RELEASING.md` (specs 04/05).
- Version: `app.json` `expo.version` = `"1.2.0"` and `package.json` `version` = `"1.2.0"` (spec 04's equality test). `ios.buildNumber` = the next unused integer string, greater than the highest build in App Store Connect (`node .appstore/asc.js builds`). Never hard-code it ahead of time (spec 05 rule).
- What's New for 1.2.0 includes "Requires iOS 16.4 or later" (SDK 56 raised the minimum from 15.1).
- Docs:
  - `TECH_STACK.md`: Expo SDK ~57.0.x, React Native 0.86.x, React 19.2.x. Replace the Navigation table's `@react-navigation/*` rows with "expo-router (ships its own navigation fork since SDK 56)". Replace the `@expo/vector-icons` row with the two `@react-native-vector-icons/*` packages. Update the reanimated/worklets/expo-widgets/skia versions, and add `expo-build-properties` (`ios.enableSceneSupport`).
  - `CLAUDE.md:69`: "Expo SDK 57, React Native 0.86" (it currently says SDK 54 / 0.81.5).
  - `README.md:27`: "Expo SDK 57 + React Native 0.86" (currently "SDK 55 + React Native 0.81"). `README.md:66`: "patch-package fixes for expo-widgets".
  - `docs/ARCHITECTURE.md`: add §5.7 "Native launch & lifecycle (UIKit scenes)" covering the data flow below: which delegate callbacks moved to `EXExpoAppSceneDelegate`, AppState via `UIApplication` notifications, push via `ExpoAppDelegateSubscriber`, and the cold-start URL path. In §7.2, note the 15-minute `.after` reload policy (patch hunk c) and the `containerBackground` modifier.
  - `docs/RELEASING.md`: add an "SDK upgrade" section (two-hop `--fix`, explicit `expo-widgets` bump plus patch regeneration, prebuild scene check, `preview-xcode27` build) and a "1.1.x hotfix lane" section (`release/1.1`; never `eas update --channel production` from `feat/sdk-57` before the 1.2.0 binary is live).
- After 1.2.0 is READY_FOR_SALE, run spec 04 runbook A (baseline OTA) from the exact 1.2.0 tree.

**Success Criteria:**
- [ ] `app.json` `expo.version` is ≥ 1.2.0 by numeric semver compare, and equals `package.json` `version` (app-config test).
- [ ] `grep -n "SDK 57" CLAUDE.md README.md TECH_STACK.md` matches in all three files. `grep -rn "SDK 54\|0\.81\|@react-navigation\|@expo/vector-icons" CLAUDE.md README.md TECH_STACK.md` returns nothing.
- [ ] `docs/ARCHITECTURE.md` has a `### 5.7` heading that mentions `EXExpoAppSceneDelegate`. `docs/RELEASING.md` has "SDK upgrade" and "1.1.x hotfix lane" sections.
- [ ] `git branch --list release/1.1` shows the branch, pointing at the last shipped 1.1.x commit.
- [ ] TestFlight build 1.2.0 (`<next build>`) passes spec 05's smoke checklist plus every FR6 row, on an iOS 27 device.
- [ ] 1.2.0 is submitted to App Review. After release, the Settings version row shows `Update: <id>` following the baseline OTA (spec 04 runbook A).

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `package.json`, `package-lock.json` | Current: `expo ~55.0.0` (installed 55.0.7), `react-native 0.83.2`, `@react-navigation/*` ×3, `@expo/vector-icons ^15.0.3`, `expo-widgets ^55.0.5` (spec 06 makes it exact), `postinstall: patch-package` |
| `app.json` | `plugins` (no `expo-build-properties` yet), `scheme: "hourglassws"`, `version`, `ios.buildNumber`, `supportedFamilies` |
| `eas.json` | Profiles `development` / `preview` / `production`, no `image` |
| `jest.config.js` | `preset: 'jest-expo/node'`; `testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']`; `transformIgnorePatterns` (`:21`) |
| `app/_layout.tsx` | `:6` react-navigation import, `:11` expo-router import, `:48-54` notification handler, `:59-66` focusManager/AppState, `:155` ThemeProvider |
| `app/(tabs)/_layout.tsx` | `:23` NativeTabs import, `:24` Tabs import, `:131` `contentStyle` (spec 07 may rename it to `sceneStyle`; `sceneStyle` exists in expo-router 57's tabs types) |
| `src/api/client.ts` | fetch sites `:36,:223,:261`; `handleStatus :139`; `parseBody :197` |
| `src/lib/pushToken.ts` | fetch sites `:35,:65` |
| `src/hooks/useAIData.ts:376`, `src/hooks/useScheduledNotifications.ts:276`, `src/hooks/useRoleRefresh.ts:100` | AppState listeners |
| `src/notifications/handler.ts:117` | Silent-push listener |
| `src/widgets/bridge.ts` | `WIDGET_LAYOUT_JS :460-834`; roots `:665/:710/:807`; native-module guard `:873`; `createWidget(...).updateTimeline` `:881-896` |
| `src/widgets/ios/HourglassWidget.tsx:29,:539-541` | `@expo/ui/swift-ui` + `createWidget` (API signature unchanged in 57: `createWidget(name, widget)`, `updateTimeline(entries)`) |
| `patches/expo-widgets+55.0.5.patch` | Hunks: bundle `:1-100`, podspec `:101`, EntryView `:114`, TimelineProvider `:127`, autolinking.rb `:141`, xcode-build-bundle.sh `:163` |
| `patches/react-native-reanimated+4.2.1.patch` | Getter → `defineProperty` rewrite (obsolete) |
| `src/widgets/__tests__/widgetLayoutJs.test.ts:80-130` | Stub harness that evaluates `WIDGET_LAYOUT_JS` |
| `docs/ARCHITECTURE.md` §1.5, §5.2, §5.3, §7.2, §8.6 | Lifecycle, notification and widget context |
| `specs/06-dependency-hygiene/spec-research.md` | `expo.install.exclude`, exact pins, `--error-on-fail`, `deps.test.ts` |
| `specs/09-sdk-58-xcode-27/spec-research.md` | Removes `enableSceneSupport` at 58; owns image pinning |
| expo-build-properties 57.0.22 `src/iosSceneSupport.ts` (npm tarball) | Exact plugin behavior: floor check, AppDelegate rewrite, manifest, throw conditions |
| `https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md` § "Staying on SDK 57 with Xcode 27" | Official requirements; no SceneDelegate.swift on 57 |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `package.json`, `package-lock.json` | modify | FR1 versions/additions/removals, FR3 icon packages, FR7 `version` |
| `app.json` | modify | FR4 plugin entry; FR7 `version`, `ios.buildNumber` |
| `eas.json` | modify | FR4 `preview-xcode27` profile (verification only) |
| `app/_layout.tsx` | modify | FR2 theme imports from `expo-router` |
| `app/(tabs)/_layout.tsx` | modify | FR2 `Tabs` from `expo-router/js-tabs` |
| `src/components/FadeInScreen.tsx`, `src/hooks/useFocusKey.ts`, `src/hooks/useStaggeredEntry.ts` | modify | FR2 `useIsFocused` from `expo-router` |
| `src/components/FloatingPillTabBar.tsx` | modify | FR2 type import; FR3 MaterialIcons import |
| `components/haptic-tab.tsx` | delete | FR2 (dead code on a removed package) |
| `src/components/ApprovalUrgencyCard.tsx`, `src/components/ApprovalCard.tsx`, `components/ui/icon-symbol.tsx` | modify | FR3 icon imports |
| `src/widgets/bridge.ts` | modify | FR5 `containerBackground` on the three system roots |
| `patches/react-native-reanimated+4.2.1.patch` | delete | FR5 (milestone A) |
| `patches/expo-widgets+55.0.5.patch` | delete | FR5 (milestone B) |
| `patches/expo-widgets+<v57>.patch` | create | FR5 hunks a–d |
| `__mocks__/@react-native-vector-icons/common.js` | create | FR3 jest mock |
| `__tests__/config/sdk-migration.test.ts` | create | FR1/FR2/FR3 guards. Holds every absolute SDK 57 floor, including `react-native-worklets` `0.10.x`, which replaces spec 06's `0.7.x` case |
| `__tests__/config/app-config.test.ts` | modify | FR4, FR7 assertions (file created by spec 03) |
| `__tests__/config/deps.test.ts` | modify | File created by spec 06. FR1: replace the `expo-widgets === '55.0.5'` case with an equals-patch-filename-version case, and replace the `SDK 55 patch line` describe with the SDK-relative `SDK line consistency` describe. FR5: patch-content assertions |
| `src/widgets/__tests__/widgetLayoutJs.test.ts` | modify | FR5 `containerBackground` stub and assertions |
| `app/__tests__/layout-notifications.test.tsx`, `app/(tabs)/__tests__/index.test.tsx`, `app/(tabs)/__tests__/indexConeIntegration.test.tsx`, `app/(tabs)/__tests__/native-tabs.test.tsx`, `src/components/__tests__/AITab.test.tsx`, `src/components/__tests__/AITabConeIntegration.test.tsx`, `src/components/__tests__/FadeInScreen.test.tsx`, `src/components/__tests__/FloatingPillTabBar.test.ts`, `src/hooks/__tests__/useStaggeredEntry.test.ts` | modify | FR2 mock and source-assertion updates (+ any other `expo-router` mock that needs `useIsFocused`) |
| `src/components/__tests__/HapticTab.test.tsx` | delete | FR2 |
| `__tests__/approval-card.test.tsx`, `__tests__/glass-swipe-card.test.tsx`, `src/components/__tests__/ApprovalUrgencyCard.test.tsx`, `src/components/__tests__/ApprovalUrgencyCardScreenIntegration.test.tsx` (+ `app/(tabs)/__tests__/index.test.tsx:74`) | modify | FR3 icon mocks |
| `TECH_STACK.md`, `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/RELEASING.md` | modify | FR7 docs |
| `jest.config.js`, `tsconfig.json` | no change expected | Fallbacks only (Edge Cases) |

### Interface Contracts

| Item | Contract | Source |
|------|----------|--------|
| `expo` (lockfile) | ≥ 57.0.23, < 58.0.0 | `iosSceneSupport.ts` `MINIMUM_EXPO_VERSION` |
| `expo-build-properties` (lockfile) | ≥ 57.0.20, < 58.0.0 | Property added 57.0.19; startup-block fix 57.0.20 (CHANGELOG) |
| `react-native` (lockfile) | `0.86.x` | SDK 57 `bundledNativeModules.json` (0.86.3 at 57.0.30) |
| `react-native-worklets` (lockfile) | `0.10.x` | SDK 57 `bundledNativeModules.json` (0.10.1 at 57.0.30); `react-native-reanimated` 4.5.1 peer `0.10.x` |
| `dependencies["expo-widgets"]` vs `patches/expo-widgets+<v>.patch` | equal (`deps.test.ts`; no SDK-specific literal) | spec 06 rule 3, made explicit by FR1 |
| `expo-widgets` | exact `57.x.y` = sdk-57 tag; listed in `expo.install.exclude` | spec 06 contract, carried forward |
| `@react-native/jest-preset` | devDependency, `^0.86.x` | jest-expo 57.0.6 `peerDependencies` |
| `@react-navigation/*`, `@expo/vector-icons` | absent from `dependencies`/`devDependencies` and from source/tests | FR2/FR3 |
| `@react-native-vector-icons/ionicons`, `…/material-icons` | present; imported from the package root (no `/static`) | FR3 |
| `app.json` plugin | `["expo-build-properties", { "ios": { "enableSceneSupport": true } }]`, exactly once | expo/fyi ios-scene-lifecycle.md |
| `app.json` `version` / `package.json` `version` | `"1.2.0"`, equal | spec 04 equality test |
| `ios.buildNumber` | next unused integer string | spec 05 rule |
| `eas.json` `build.preview-xcode27` | `{ "extends": "preview", "ios": { "image": "<newest non-RC macos-*-xcode-27.* image>" } }` | EAS infra page (27.0 on 2026-10-19) |
| `patches/` | exactly `expo-widgets+<v>.patch` with hunks a–d | FR5 |
| `WIDGET_LAYOUT_JS` system roots | `modifiers` include `containerBackground('#0D0D1A', 'widget')` | `@expo/ui` 57.0.25 `containerBackground(style, container)` |
| `EXPO_PUBLIC_USE_RN_FETCH` | unset (default); if adopted, set in every EAS build profile `env` and at `eas update` time | `expo/src/winter/runtime.native.ts:41-42` |

**Scene manifest contract** (Info.plist via introspect/prebuild; byte-equal to `SCENE_MANIFEST` in `iosSceneSupport.ts`):

```json
{
  "UIApplicationSupportsMultipleScenes": false,
  "UISceneConfigurations": {
    "UIWindowSceneSessionRoleApplication": [
      { "UISceneConfigurationName": "Default Configuration", "UISceneDelegateClassName": "EXExpoAppSceneDelegate" }
    ]
  }
}
```

**Generated AppDelegate contract (SDK 57, prebuild):** `class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {`. `didFinishLaunchingWithOptions` creates `ReactNativeDelegate` + `ExpoReactNativeFactory`, assigns `reactNativeDelegate`/`reactNativeFactory`, and doesn't create a window or call `startReactNative`. There is no `SceneDelegate.swift`.

### Data Flow

```
Launch (SDK 57 + enableSceneSupport)
  UIApplicationMain
    → AppDelegate.didFinishLaunching: build ExpoReactNativeFactory (no window)
    → UIKit connects UIWindowScene (Info.plist UIApplicationSceneManifest)
    → EXExpoAppSceneDelegate.scene(_:willConnectTo:options:)
        window = UIWindow(windowScene:) ; provider.window = window
        factory.startReactNative("main", launchOptions rebuilt from connectionOptions.urlContexts / userActivities)
        forward urlContexts → ExpoAppDelegate subscribers → RCTLinkingManager → expo-router route

Foreground / background
  sceneDidBecomeActive / sceneWillEnterForeground → ExpoAppDelegate subscribers
  UIKit also posts UIApplication{DidBecomeActive,WillEnterForeground,...}Notification
    → RCTAppState → JS AppState 'change'
        → app/_layout.tsx:62 focusManager → TanStack refetch (hours, approvals)
        → useAIData.ts:376, useScheduledNotifications.ts:276, useRoleRefresh.ts:100

Push (unchanged by scenes)
  APNs token / didReceiveRemoteNotification → UIApplicationDelegate → NotificationsAppDelegateSubscriber
    → expo-notifications → handler.ts:117 addNotificationReceivedListener → widget bridge
  Notification tap → UNUserNotificationCenterDelegate → app opens (no routing)

Network
  fetch(...) in client.ts / pushToken.ts → globalThis.fetch = expo/fetch (WinterTC)
    → Response.text() → parseBody / handleStatus
  (EXPO_PUBLIC_USE_RN_FETCH=1 at bundle time → RN XHR-based fetch instead)

Widget
  bridge.ts createWidget('HourglassWidget', WIDGET_LAYOUT_JS).updateTimeline(96×15-min entries)
    → App Group storage (__expo_widgets_HourglassWidget_layout + timeline)
    → extension TimelineProvider (.after +15 min, patch c) → EntryView evaluates layout
    → root ZStack .containerBackground(#0D0D1A, .widget)  [JS modifier, replaces patch hunk]
```

### Test Plan

Iterate with targeted runs, e.g. `npx jest __tests__/config src/widgets/__tests__/widgetLayoutJs.test.ts`. Every file below matches `testMatch` (`**/__tests__/**/*.test.ts(x)`) and runs under `jest-expo/node`.

| Test file | FR | Cases |
|-----------|----|-------|
| `__tests__/config/sdk-migration.test.ts` (new) | FR1 | Reads `package.json` + `package-lock.json` (`packages["node_modules/<name>"].version`). Asserts: `expo` in [57.0.23, 58.0.0); `expo-build-properties` in [57.0.20, 58.0.0); `react-native` matches `/^0\.86\.\d+$/`; `react-native-worklets` matches `/^0\.10\.\d+$/`; `expo-widgets` dep matches `/^57\.\d+\.\d+$/` and equals the lockfile version; `expo.install.exclude` contains `expo-widgets`; no `@react-navigation/*` or `@expo/vector-icons` key in deps/devDeps; `@react-native/jest-preset` in devDeps; both `@react-native-vector-icons/*` in deps. Uses a local numeric semver compare (no new dependency) |
| same | FR2 | Recursively reads `.ts/.tsx/.js/.jsx` under `app`, `src`, `components`, `hooks`, `constants`, `__tests__`, `__mocks__` (skipping `node_modules` and this file). No file contains `'@react-' + 'navigation/'` (needle built by concatenation). `components/haptic-tab.tsx` doesn't exist |
| same | FR3 | Same walk: no file contains `'@expo/' + 'vector-icons'`. No `@react-native-vector-icons/*/static` import. `app.json` plugins have no `@react-native-vector-icons/` entry. `checkmark-circle`, `close-circle`, `time-outline` are keys of `node_modules/@react-native-vector-icons/ionicons/glyphmaps/Ionicons.json`. Every value of the `MAPPING` object in `components/ui/icon-symbol.tsx` (parsed by regex) is a key of `…/material-icons/glyphmaps/MaterialIcons.json` |
| `__tests__/config/app-config.test.ts` (extend spec 03's file) | FR4 | Exactly one plugin entry with `[0] === 'expo-build-properties'`; it's an array; `[1]` deep-equals `{ ios: { enableSceneSupport: true } }`; no bare-string `'expo-build-properties'` entry; `expo.ios.infoPlist.UIApplicationSceneManifest` undefined |
| same | FR7 | `expo.version` ≥ `1.2.0` (numeric compare); `package.json.version === expo.version` (spec 04's assertion stays); spec 05's `buildNumber ≥ 18` assertion stays |
| `__tests__/config/deps.test.ts` (rewrite spec 06's SDK 55 cases, Phase 1.0) | FR1 | Replace `dependencies['expo-widgets'] === '55.0.5'` with: exactly one `expo-widgets+*.patch` parses, and `dependencies['expo-widgets']` equals its parsed `version`. Replace the `SDK 55 patch line` describe with `SDK line consistency`: the `versionAtLeast` unit checks (unchanged), and lockfile `expo-notifications`, `expo-updates` and `jest-expo` each have the same major as lockfile `expo`. Delete the `expo` `55.`/≥ 55.0.31, `react-native` `0.83.`/≥ 0.83.10, `react-native-worklets` `0.7.`/≥ 0.7.4, and 55.x floor cases (the SDK 57 floors live in `sdk-migration.test.ts`). Green on `main` (55.0.5 = 55.0.5; all majors 55), at milestone A (majors 56) and at milestone B (57). They're guard rewrites, not red-phase tests |
| `__tests__/config/deps.test.ts` (extend spec 06's file) | FR5 | `patches/` has no `react-native-reanimated+*.patch`; exactly one `expo-widgets+*.patch`; its size < 20000 bytes; its `diff --git` paths are exactly the four hunk files; it doesn't contain `bundle/build/ExpoWidgets.bundle`, `EntryView.swift` or `send(:resolve)`; it contains `addingTimeInterval(15 * 60)` and `basename "$PROJECT_DIR"`. Spec 06's version-agnostic cases stay unchanged and green: patch discovery/parse, real-data `collectPatchProblems` equals `[]`, all fixtures, postinstall, ngrok, `expo.install.exclude` |
| `src/widgets/__tests__/widgetLayoutJs.test.ts` (extend) | FR5 | Add stub `containerBackground: (style, placement) => ({ __modifier: 'containerBackground', style, placement })`. For each of `systemSmall`, `systemMedium`, `systemLarge`, the returned root's `modifiers` array contains that object with `'#0D0D1A'` and `'widget'`. For `accessoryInline`, no `containerBackground` anywhere in the tree |
| FR2 and FR3 test-site rewrites (tables in FR2/FR3) | FR2, FR3 | Existing behavior assertions unchanged; only module paths and mock locations move |
| API / AppState / notification / widget suites (FR6 list) | FR6 | Unchanged; must pass at milestones A and B |
| (manual) `npx expo install --check`, `npx expo-doctor`, `rm -rf node_modules && npm ci`, `npm ls @react-navigation/native --all` | FR1 | Checklist |
| (manual) `npx expo export --platform ios` | FR2 | Checklist |
| (manual) `npx expo config --type introspect --json`, scratch prebuild, `preview-xcode27` + `development` EAS builds | FR4 | Checklist |
| (manual) device matrix | FR5, FR6, FR7 | Checklist "Device verification" |

**SDK pinning:** after this spec, absolute SDK floors live only in `sdk-migration.test.ts`. They're pinned to SDK 57 on purpose (`< 58.0.0`, `0.86.x`, `0.10.x`, `57.x`), and spec 09 replaces them the same way this spec replaces spec 06's SDK 55 block. `deps.test.ts` stays SDK-agnostic.

**Mocks needed:** `__mocks__/@react-native-vector-icons/common.js` (new); `jest.mock('expo-router', …)` factories gain `useIsFocused` and, in `layout-notifications.test.tsx`, `DarkTheme`/`DefaultTheme`/`ThemeProvider`. No network mocks change.

### Edge Cases

| Case | Handling |
|------|----------|
| SDK 58 stable and an Xcode 27 EAS image both exist at start (already true on 2026-10-19) | Start gate: escalate to Jaime before starting. If he retargets to 58, stop this spec and fold the work into spec 09 (`enableSceneSupport` is a no-op with a warning on 58). Don't retarget silently |
| Prebuild throws `` `ios.enableSceneSupport` requires Expo SDK 57.0.23 … `` | `expo` resolved below the floor. Run `npx expo install expo@^57.0.0 --fix` again and confirm the lockfile |
| Prebuild throws `requires the standard Expo SDK 57 Swift AppDelegate` | Another plugin rewrote the startup block in a way the regexes don't match. List the AppDelegate mods (`EXPO_DEBUG=1 npx expo prebuild -p ios --no-install`), confirm `expo-build-properties` ≥ 57.0.20, and if needed move the entry within `plugins`. Don't hand-edit `ios/` |
| Prebuild throws `cannot enable scene support because UIApplicationSceneManifest is already declared` | Someone added a manifest to `app.json` `ios.infoPlist`. Remove it (the app-config test guards against this) |
| Widget extension picks up the scene manifest | It must not (`ExpoAppSceneDelegate` is unavailable in extensions). Prebuild check in FR4. If it appears, the build fails or the widget crashes; stop and report upstream |
| Codemod misses imports (expo/expo#46481: ~25%) or leaves a copy of `@react-navigation/*` installed | Guard test + `npm ls @react-navigation/native --all` empty. The packages are removed, so any leftover import fails at bundle time instead of creating two navigation copies at runtime |
| `jest.mock('expo-router', factory)` lacks `useIsFocused` after the migration → `TypeError: useIsFocused is not a function` | Add it to that factory (FR2). 14 test files mock expo-router; fix them as the run reveals them |
| Jest fails on `.ttf` from `@react-native-vector-icons/*` | Fallback: add `'\\.(ttf|otf)$': '<rootDir>/__mocks__/fileMock.js'` to `moduleNameMapper` in `jest.config.js`, and record it in Session Notes |
| jest-expo 57 throws "The React Native Jest preset … has moved" | `@react-native/jest-preset` missing. Add it to devDependencies (FR1) |
| TypeScript 6.0 errors flood `npm run typecheck`. Note that `expo/tsconfig.base` also changes `jsx` from `react-native` to `react-jsx` at 57 | FR1 fallback: pin TS ~5.9.2 + `expo.install.exclude`. Record it. The SDK API errors still get fixed |
| `expo/fetch` behaves differently from RN fetch (empty bodies, HTML 5xx, header casing, redirects) | FR6 device rows 3–4. Escape hatch `EXPO_PUBLIC_USE_RN_FETCH=1`, which must be set in the EAS build profile `env` and at `eas update` time, never only in `.env.local` |
| `@expo/ui` `containerBackground` not honored by the 57 widget runtime | Device check fails ("adopt containerBackground" placeholder). Fallback: restore an `EntryView.swift` hunk in the 57 patch (setting the background natively), update the deps-test file list, and record it |
| expo-widgets 57 layout/storage format differs from 55 | Old App Group data is replaced on the first `updateTimeline` after launch (`useWidgetSync` runs on every app open). Until the user opens 1.2.0 once, the widget may show the red "No layout found" box. Acceptable; mention "open the app once after updating" in What's New only if it shows up in TestFlight |
| OTA during the upgrade | Fingerprint changes (spec 04), so 1.1.x binaries never match 1.2.0 updates. Hotfixes for 1.1.x come from `release/1.1` only. Don't publish production-channel updates from `feat/sdk-57` before 1.2.0 is live |
| Users on iOS < 16.4 | App Store keeps serving them the last compatible 1.1.x. What's New notes the requirement |
| Expo Go for SDK 56 isn't on the App Store | Milestone A is JS-only. All native verification uses dev-client/EAS builds |
| Node version | RN 0.86 `engines.node`: `^20.19.4 \|\| ^22.13.0 \|\| ^24.3.0 \|\| >=25`. CI `setup-node` `'20'` resolves to the latest 20.x; local is 22.17.0. If CI resolves below 20.19.4, bump `node-version` to `'22'` in `test.yml` |
| Local build from a path with a space | Patch hunks a/b. EAS paths have no spaces, so EAS builds don't depend on them |
| Third-party native/JS libraries on RN 0.86 (nativewind 4.2.3 + css-interop jsx-runtime Metro redirect, victory-native 41 on skia 2.6.x, react-native-inner-shadow, react-native-android-widget) | FR6 visual smoke on iOS. Android isn't verified (Out of Scope 4). If a library breaks iOS, bump it within its current major. A major bump escalates |

---

## Dependencies

### Internal
- **06-dependency-hygiene** (merged and shipped in build 19): `expo.install.exclude: ["expo-widgets"]`, exact pins, `postinstall: patch-package --error-on-fail`, `__tests__/config/deps.test.ts`. This spec rewrites that file's SDK 55-pinned cases (the `expo-widgets === '55.0.5'` case and the `SDK 55 patch line` describe) into SDK-relative ones (FR1) and keeps the rest.
- **07-ci-typecheck-lint** (merged): `npm run typecheck`, `npm run lint`, and the CI gates in `.github/workflows/test.yml`. Without them, the SDK type fallout is invisible.
- **03/04/05**: `__tests__/config/app-config.test.ts` exists (03), fingerprint `runtimeVersion` + version-equality test + `docs/RELEASING.md` (04), and the native-release runbook + smoke checklist (05).

### External
- npm registry (verified 2026-10-19): `expo` sdk-57 = 57.0.30; `expo-build-properties` sdk-57 = 57.0.22 (`enableSceneSupport` present from 57.0.19; absent in 55.0.18, 56.0.27, 57.0.17, 57.0.18); `expo-widgets` sdk-57 = 57.0.26; `react-native-reanimated` 4.5.1; `@react-native-vector-icons/*` 14.0.0; `expo-codemod` 58.0.1.
- EAS Build images: `sdk-57` alias = `macos-tahoe-26.5-xcode-26.6`; `macos-tahoe-26.6-xcode-27.0` available; `macos-tahoe-26.6-xcode-27.1` (RC) = `latest`/`sdk-58`.
- Test devices: one iOS 26 and one iOS 27 iPhone; the QA manager account.

### Assumptions
- Jaime confirms SDK 57 (not a direct 55→58 jump) at the start gate.
- EAS's `sdk-57` alias stays on an Xcode 26.x image, so the 1.2.0 production binary uses the iOS 26 SDK, which App Store Connect accepts until the iOS 27 SDK requirement (April 2027; re-check early Feb 2027 per OPS).
- The App Group identifier and widget name stay unchanged (`group.com.jalvarez0907.hourglass.widgets`, `HourglassWidget`).

---

## Research Corrections (verified 2026-10-19)

| Research claim | Current reality | Spec handling |
|----------------|-----------------|---------------|
| react-navigation sites: "`components/` (only `@react-navigation/elements` import)" | 6 source files: `app/_layout.tsx:6`, `src/components/FadeInScreen.tsx:18`, `src/components/FloatingPillTabBar.tsx:18`, `src/hooks/useFocusKey.ts:2`, `src/hooks/useStaggeredEntry.ts:29`, `components/haptic-tab.tsx:1-2` (bottom-tabs **and** elements). Plus 6 test files mock `@react-navigation/native` and 2 assert the import path in source | FR2 tables enumerate every site |
| "expo/expo#46481: codemod misses ~50%" | The issue title says ~25% of import sites; still open. The codemod doesn't map `@react-navigation/elements` or `jest.mock` strings | Guard test is the source of truth |
| `@expo/vector-icons` → `@react-native-vector-icons/*` listed as a breaking change | SDK 56 **deprecated** it, and `expo` dropped it as a dependency. An explicit dependency keeps working (SDK 57/58 `bundledNativeModules` still list `^15.0.2`). The vector-icons codemod defaults to `/static` when non-interactive | FR3 migrates anyway (planned), with the dynamic import and `--dynamic` if the codemod is used |
| AppState sites: `useScheduledNotifications.ts:276`, `useAIData.ts:376`, `useRoleRefresh.ts` | Correct, but incomplete: `app/_layout.tsx:62` (TanStack `focusManager`) is the listener that refetches hours. `useRoleRefresh.ts` is `:100` | FR6 lists all four |
| "Push + notification tap routing … delegate callbacks move" | No tap-routing code exists (ARCHITECTURE.md §1.5). expo-notifications uses `NotificationsAppDelegateSubscriber` + the UNUserNotificationCenter delegate, which scenes don't move. Only URL/user-activity/lifecycle/quick-action callbacks move | FR6 checks that a tap opens the app. Routing is out of scope |
| Smoke: "tap a deadline notification: it routes to the right screen. Same for a widget tap" | No routing for either; no `widgetURL` | FR6 expects the app to open |
| reanimated patch "obsolete at reanimated 4.5.x" | Already obsolete at 4.3.1 (SDK 56); the getter is gone | Delete at milestone A |
| expo-widgets patch: "130 KB patch must be re-based"; "remove from `expo.install.exclude` once rebased" | About 126 KB is a prebuilt 55.0.5 `ExpoWidgets.bundle`. The real intents are 6 small hunks: 4 still needed, `send(:resolve)` unnecessary, `containerBackground` moved upstream to a JS modifier. `expo.install.exclude` doesn't exist yet (spec 06 adds it), and dropping it while a patch exists defeats spec 06's guard | FR5 keeps hunks a–d, moves the background to JS, keeps the exclude |
| API tests "pass under `expo/fetch`, including the empty-body case" | Jest mocks `global.fetch` (`__tests__/client.test.ts:7`), and `jest-expo/node` never installs `expo/fetch` | The jest suites prove parsing only; FR6 device rows prove `expo/fetch` |
| Hermes V1 memory fix "≥ 57.0.9" | The SDK 57 changelog says 57.0.9 (RN 0.86.2) in "Known regressions" and 57.0.17 (RN 0.86.3) in the Aug 27 update note (the latter fixed a dev-startup regression) | Moot: floor 57.0.23 |
| Milestone (a) "green in Expo Go / dev client … each milestone gets a dev-client build" | Expo Go for SDK 56 isn't on the App Store, and expo-widgets stays at 55.0.5 under spec 06's exclude until 57, so a 56 native build would mean rebasing the patch twice | Milestone A is JS-only; native builds start at B |
| `deps.test.ts` (spec 06): "keep the patch/version guard passing" | Spec 06's file also pins the SDK 55 line: lockfile `expo` starts with `55.`, `react-native` with `0.83.`, `react-native-worklets` with `0.7.`, and `dependencies['expo-widgets'] === '55.0.5'`. Hop 1 resolves expo 56.0.23 / RN 0.85.3 / worklets 0.8.3 (SDK 56 `bundledNativeModules.json`), and milestone B moves expo-widgets to 57.0.26, so those cases would go red | FR1 rewrites them in Phase 1.0: the expo-widgets pin compares against the patch filename, the SDK block becomes same-major checks, and the absolute floors (including worklets `0.10.x`) move to `sdk-migration.test.ts` |
| Interface contract `expo ~57.0.24` | sdk-57 tag is 57.0.30. Plugin floor 57.0.23 confirmed in source | Contract is a range floor, not a fixed patch |
| Docs to update: `TECH_STACK.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md` "Versions" | `ARCHITECTURE.md` has no SDK version string. `CLAUDE.md:69` says SDK 54 / RN 0.81.5 and `README.md:27` says SDK 55 + RN 0.81 (both already stale) | FR7 adds README.md and a §5.7 lifecycle section |
| Not mentioned in research | SDK 56 pulls TypeScript 6.0.3 via `--fix`; jest-expo 57 needs `@react-native/jest-preset`; `Tabs` from `'expo-router'` is deprecated in 57; expo-doctor warns if expo-router and react-navigation are both installed; SDK 58 is stable; EAS has Xcode 27 images | FR1, FR2, FR4, start gate |
| `enableSceneSupport` absent from 55.0.18 and 56.0.27; floors 57.0.23 / 57.0.20; no `SceneDelegate.swift` on 57; `UISceneDelegateClassName = EXExpoAppSceneDelegate`; min iOS 16.4; `expo/fetch` default + `EXPO_PUBLIC_USE_RN_FETCH`; fetch sites `client.ts:36,223,261`, `pushToken.ts:35,65`; RN 0.86 | All confirmed (tarballs, changelogs, source) | — |
