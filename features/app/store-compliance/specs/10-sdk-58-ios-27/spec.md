# 10 — Expo SDK 58 on the iOS 27 SDK (v1.2.0, build 19)

**Status:** Draft
**Created:** 2026-10-20
**Last Updated:** 2026-10-20
**Owner:** @jaime-alvarez-trilogy
**Supersedes:** `08-expo-sdk-57-scenes`, `09-sdk-58-xcode-27` (kept as history)

---

## Overview

This spec moves Hourglass from Expo SDK 55 / React Native 0.83.2 to **Expo SDK 58 / React Native 0.88.0** in one native jump. Every dependency moves to its latest SDK 58-compatible version. The release ships as **v1.2.0, build 19**, built on EAS cloud with the pinned image **`macos-tahoe-26.6-xcode-27.1`** (Xcode 27.1, iOS 27 SDK). That satisfies Apple's April 2027 upload rule. The SDK 58 project template generates the UIKit scene lifecycle (`SceneDelegate.swift` and `UIApplicationSceneManifest`), and an iOS 27 SDK build needs it to launch. All evidence is in `spec-research.md`, which uses the labels verified, likely and unverified.

The work is ordered so the app stays runnable at every checkpoint (spec-research Decision 2):

- **Checkpoint A (SDK 55, FR1–FR3).** First, cut the hotfix lane and add the dependency guards. Then land every change that works on both SDK 55 and 58:
  - `useIsFocused` from `expo-router`.
  - Deleting dead code.
  - Version-neutral Skia path calls.
  - `expo/fetch` hardening of the API client.

  All three CI gates stay green. Nothing native changes.
- **Checkpoint B (SDK 58, FR4).** One atomic dependency bump. It includes only the 58-only source edits needed to compile and the test toolchain that the peer dependencies force. Patches are retired. An EAS development build boots on a physical iOS 27 iPhone.
- **FR5–FR8 (SDK 58).** Native config (scenes, iOS 16.4 minimum, image pin, version), the widget changes, a behavior pass over the third-party natives, and the toolchain and CI. Gates stay green after each FR.
- **Checkpoint C (FR9).** Inspect a throwaway local prebuild, run `expo-doctor` and check fingerprint stability.
- **FR10.** Docs.
- **Checkpoint D (FR11).** EAS production build 19, the IPA SDK check, then the TestFlight smoke on an iOS 27 iPhone and iPad. The work stops at "ready to submit".

### Ground rules (apply to every FR)

- **Build 18 must not be affected.** It's v1.1.0 on SDK 55, at `aade79b`, and in App Store review.
  - `main` stays at build 18 until build 18's review is resolved **and** build 19 has passed the TestFlight smoke. Only then may `feat/sdk-58` merge.
  - 1.1.x hotfixes go on `release/1.1`, cut from `aade79b` (FR1).
  - Never run `eas update --channel production` from `feat/sdk-58`.
- **EAS cloud builds only.**
  - This Mac has only Xcode 27.0 and no Simulator.app (Xcode 27 ships Device Hub instead).
  - A local prebuild into a throwaway copy is allowed for inspection (FR9). So is a compile-only `xcodebuild` with `CODE_SIGNING_ALLOWED=NO`.
  - Never run `eas build --local`, and never archive or export locally.
- **Never submit to App Review without the user's explicit go-ahead.** FR11 ends at "ready to submit".
- **Don't touch `/Users/Trilogy/Documents/Claude Code/WS/hourglassws`.** A Metro dev server runs there on port 8081. Start this worktree's Metro with `npx expo start --dev-client --port 8082`.
- No `--legacy-peer-deps` or `--force`. Fix the range that conflicts instead.

---

## Out Of Scope

1. **Submitting 1.2.0 to App Review.** **Descoped (user decision).** FR11 stops at "ready to submit".
2. **Migrating `@expo/vector-icons` to `@react-native-vector-icons/*`.** **Deferred** (Decision 3). The package is still in SDK 58's `bundledNativeModules.json`, and the replacement adds podspecs and config plugins.
3. **Porting the 61 `react-test-renderer` test files to RNTL 14 / `test-renderer`.** **Deferred** (Decision 4). `react-test-renderer@19.3.0` is declared explicitly as a stopgap.
4. **Migrating gestures to the RNGH 3 hook API.** **Deferred.** The builder API still works in 3.3.0 (spec-research F2.3).
5. **Notification-tap routing.** **Descoped.** None exists today (spec-research F2.8). A tap cold-launches to the default route, and FR11 checks only that.
6. **Silent push → widget refresh (`registerTaskAsync`).** **Descoped.** This is the known gap in `docs/ARCHITECTURE.md` §2 and isn't caused by the SDK.
7. **Android store release, and the unregistered Android widget handler.** **Descoped** (FEATURE non-goal). FR6 only excludes expo-widgets from Android autolinking.
8. **NativeWind 5 / Tailwind 4.** **Descoped.** NativeWind 5 is RC-only, and css-interop 0.2.7 peers `tailwindcss ~3`.
9. **`@react-native-async-storage/async-storage` 3.x.** **Descoped.** SDK 58 bundles exactly 2.2.0.
10. **New SDK 58 features** (App Intents, Live Activities, Router loaders, Expo UI lists) and **iPhone Duo / wide-screen redesign.** **Descoped** (FEATURE non-goal). FR11 fixes resize breakage only.
11. **Replacing the deprecated `ImageBackground`** (`src/components/NoiseOverlay.tsx:15`). **Descoped.** RN 0.88 deprecates it but doesn't remove it.
12. **Pinning images for the `development` and `preview` profiles.** **Descoped.** They stay on `auto`, which resolves to the `sdk-58` image.
13. **Baseline OTA after 1.2.0 is live** (spec 04 runbook A), and **retiring `release/1.1`.** **Deferred to post-release.** FR10 documents both.
14. **Deleting the dead Expo-starter `app/(tabs)/explore.tsx` and `components/parallax-scroll-view.tsx`.** **Descoped.** expo-router 58 hides the undeclared `explore` route anyway.

---

## Functional Requirements

### FR1: Hotfix lane and dependency guards (SDK 55, checkpoint A)

Protect build 18, then bring spec 06's guards onto this branch before any risky install.

**Requirements:**
- **Branches:**
  - `git tag build-18 aade79b` and `git branch release/1.1 aade79b`.
  - Push both to `origin`.
  - Record that `release/1.1` and `build-18` resolve to `aade79b`.
- **Port spec 06:**
  - Cherry-pick `962d413` (the `deps.test.ts` guard) and `96035ea` (exact `expo-widgets 55.0.5`, `postinstall: patch-package --error-on-fail --error-on-warn`, removal of `@expo/ngrok`, `expo.install.exclude: ["expo-widgets"]`) from `feat/dependency-hygiene`.
  - That branch forked at `1a9550c`, before spec 07. Resolve any `package.json` conflict by hand, keeping `typecheck` and `lint`. Regenerate `package-lock.json` with `npm install`; never merge it by hand.
  - Don't cherry-pick `91de428`, because FR10 rewrites TECH_STACK.md.
- **Adapt `__tests__/config/deps.test.ts`:**
  - Delete the `FR5: refreshed to the latest SDK 55 patch line` describe. It's superseded by FR4's SDK 58 floors.
  - Replace the FR4 describe with:
    - (a) `expo.install.exclude` contains package X if and only if a `patches/X+*.patch` file exists.
    - (b) Every `exclude` entry is a direct dependency.
    - An absent or empty list is valid when there are no patches.
  - Keep the `collectPatchProblems` rules 1–6 and their fixtures unchanged.
- **Remove `react-native-inner-shadow`.** It has zero imports (`GlassCard.tsx:14-20` explains why). Remove it from `dependencies` and delete `__mocks__/react-native-inner-shadow.ts`. Add a `deps.test.ts` case that it's absent from `dependencies` and `devDependencies`.

**Success Criteria:**
- [ ] `git rev-parse build-18 release/1.1` prints `aade79b…` twice, and both refs exist on `origin`.
- [ ] `rm -rf node_modules && npm ci` exits 0. Its output lists both patches as applied, with no warnings.
- [ ] `deps.test.ts` passes, and it contains no `55.0.31`/`0.83.10` floors (`grep -nE "55\.0\.31|0\.83\.10"` prints nothing).
- [ ] `package.json` has no `@expo/ngrok` or `react-native-inner-shadow`, and `__mocks__/react-native-inner-shadow.ts` is gone.
- [ ] `npm test`, `npm run typecheck` and `npm run lint` exit 0. `npx expo install --check` exits 0 with the exclude in place.

---

### FR2: Forward-compatible navigation, dead code and Skia paths (SDK 55, checkpoint A)

Land every change that compiles and runs on **both** SDK 55 and SDK 58, so the bump in FR4 stays small.

**Requirements:**
- **`useIsFocused` from `expo-router`.** expo-router 55.0.7 already exports it (`node_modules/expo-router/build/exports.d.ts:26`). Change the import at `src/components/FadeInScreen.tsx:18`, `src/hooks/useFocusKey.ts:2` and `src/hooks/useStaggeredEntry.ts:29`. In every test that mocks `@react-navigation/native` for these hooks, move the `useIsFocused` stub into that file's `expo-router` mock. Extend the existing mock; don't replace it with `jest.requireActual('expo-router')`.
- **Delete the dead tab button.** Delete `components/haptic-tab.tsx` and `src/components/__tests__/HapticTab.test.tsx`. Nothing in `app/` imports it (ARCHITECTURE §8.6), and its `PlatformPressable` exists only in a deprecated expo-router fork.
- **Version-neutral Skia path calls.** Skia 2.14 removes `SkPath.moveTo/lineTo/trim` (spec-research F2.4).
  - `src/components/ScrubCursor.ts:42-44` builds the line with `Skia.Path.MakeFromSVGString(\`M ${scrubX} ${topPadding} L ${scrubX} ${chartHeight - topPadding}\`)`. The return type keeps `linePath: SkPath`. If the parse returns `null`, fall back to `Skia.Path.MakeFromSVGString('M 0 0')!`, which never happens for finite numbers.
  - `src/components/AIArcHero.tsx:146-150` deletes the `useDerivedValue` that runs `copy()` + `trim()`. It renders the fill as `<Path path={fullSkiaPath} start={0} end={sweepProgress} …>`, keeping the existing stroke and gradient props. `start` and `end` exist on `PathProps` in both 2.4.18 and 2.14.0 (`dom/types/Drawings.d.ts:12-18`).
  - Update `__mocks__/@shopify/react-native-skia.ts` so `Skia.Path.MakeFromSVGString` returns a path stub. Remove `moveTo` from the mock path, so any remaining mutation fails a test.
- **Create `__tests__/config/sdk58-migration.test.ts`.** It walks the source tree (`app/`, `src/`, `components/`, `hooks/`, `constants/`, skipping `__tests__`, `__mocks__` and `node_modules`) and, for this FR, asserts:
  - No `useIsFocused` imported from `@react-navigation/native`.
  - No `Skia.Path.Make()` call.
  - No `.copy().trim(` chain.
  - `components/haptic-tab.tsx` doesn't exist.
- **Never OTA these JS changes to 1.1.x users from this branch.** They would be runtime-compatible, but the rule is still no production publishes from `feat/sdk-58`.

**Success Criteria:**
- [ ] `grep -rn "useIsFocused" app src components | grep "@react-navigation"` prints nothing.
- [ ] `ScrubCursor.test.ts` asserts the exact `MakeFromSVGString` argument for a sample point, and no longer asserts `moveTo`/`lineTo`.
- [ ] An `AIArcHero` test asserts the fill `Path` receives `start={0}` and an `end` bound to the sweep shared value.
- [ ] The `sdk58-migration.test.ts` FR2 cases fail before the change (red) and pass after it (green).
- [ ] `npm test`, `npm run typecheck` and `npm run lint` exit 0 on SDK 55.

---

### FR3: `expo/fetch` readiness: API client hardening (SDK 55, checkpoint A)

From SDK 56, `globalThis.fetch` is `expo/fetch` (`expo/src/winter/runtime.native.ts`). It reads a body strictly once, rejects with `FetchError` and defaults to `credentials: 'include'`. Make the client correct under those rules, and test them in jest. Jest mocks `fetch`, so the tests use stubs that mimic `expo/fetch`.

**Requirements:**
- **`parseBody`** (`src/api/client.ts:197-200`):
  - Keep the build-11 behavior: an empty body returns `undefined`.
  - A non-empty body that isn't JSON throws `ApiError(response.status, 'Invalid JSON response body')`, not a raw `SyntaxError`.
- **Read each body at most once.** That covers the `mintAuthToken` (`:36-56`) OK and error paths, `apiGet` / `apiPut` with and without the `creds` retry, and `handleStatus` (`:139-182`). Discarding the first 401 response in the retry path without reading it is allowed.
- **Network errors.** A rejection with an `Error` subclass named `FetchError` maps to `NetworkError` with the message preserved. This already works through `err instanceof Error` (`:43`, `:228`, `:270`), so lock it in with a test.
- **No RN-fetch-only fields.** No code reads `response._bodyInit`, `response._bodyText` or other whatwg-fetch internals. Add a `sdk58-migration.test.ts` source-walk case for `_bodyInit|_bodyText|_bodyBlob`.
- **`src/lib/pushToken.ts`.** `:35` and `:65` don't read response bodies. Keep it that way, and add a test asserting `register` never calls `text()`/`json()`.
- **Escape hatch, documented in FR10.** `EXPO_PUBLIC_USE_RN_FETCH=1` is inlined when the bundle is built, so it would have to go in `eas.json` `build.*.env` for every profile **and** in the `eas update` environment. Use it only if an FR11 device check fails because of fetch semantics, and record why.

**Success Criteria:**
- [ ] A shared test helper `makeExpoLikeResponse({ status, body, headers })` throws `TypeError('…Response body is already used.')` on a second `text()`/`json()` call. Every client path passes with it, in `src/__tests__/api/client.test.ts` and `__tests__/client.test.ts`.
- [ ] GET and PUT each pass with a 200 empty body, a 204 empty body and a 200 `{}` body.
- [ ] A 200 HTML body rejects with `ApiError` (`statusCode` 200), not `SyntaxError`.
- [ ] The `FetchError` rejection maps to `NetworkError`.
- [ ] The existing `approvals-api`, `auth-api`, `error-envelope` and `auth-resilience` suites pass unchanged.
- [ ] All three gates exit 0 on SDK 55. **Checkpoint A** is recorded in the checklist.

---

### FR4: SDK 58 dependency line (checkpoint B)

One atomic step. It includes every package version, the 58-only source edits needed to compile, the test toolchain forced by peers, and patch retirement. When it ends, all three gates are green locally and the app boots on a device.

**Requirements:**
- **Retire both patches first.** Otherwise `--error-on-fail` aborts the install.
  - Delete `patches/expo-widgets+55.0.5.patch`. 3 of its 5 hunks fail against 58.0.21, and none are needed (spec-research F2.6). FR6 replaces the background.
  - Delete `patches/react-native-reanimated+4.2.1.patch`; its target code is gone in 4.7.1 (F2.5).
  - Remove `expo.install.exclude`.
  - Un-pin `expo-widgets`.
- **Install the contract versions** (spec-research Interface Contracts I1):
  - `npx expo install expo@~58.0.16`, then `npx expo install --fix` until `npx expo install --check` exits 0.
  - Then set the non-bundled packages explicitly (`victory-native`, `@tanstack/*`, `nativewind`, `react-native-css-interop`, `react-native-android-widget`, `@expo/vector-icons`, and the devDependencies in I1).
  - Remove `@react-navigation/native`, `@react-navigation/bottom-tabs` and `@react-navigation/elements`.
  - If `--fix` chooses a later patch release than I1, take it and record it.
- **58-only source edits.** Run `npx expo-codemod sdk-56-expo-router-react-navigation-replace app src components` if helpful, then fix by hand until `sdk58-migration.test.ts` passes:
  - `app/_layout.tsx:6`: `DarkTheme`, `DefaultTheme`, `ThemeProvider` from `'expo-router'`.
  - `src/components/FloatingPillTabBar.tsx:18`: `import type { BottomTabBarProps } from 'expo-router/js-tabs'`.
  - `app/(tabs)/_layout.tsx:23`: `NativeTabs` from `'expo-router/native-tabs'`.
  - `app/(tabs)/_layout.tsx:24`: `Tabs` from `'expo-router/js-tabs'`.
  - `app/(auth)/_layout.tsx:8`: delete `initialRouteName="welcome"`. Instead add `export const unstable_settings = { anchor: 'welcome' };` to that layout (sdk-57-to-58 router guide; the prop is `Omit`ted at `StackClient.d.ts:8`).
  - `app/(tabs)/__tests__/native-tabs.test.tsx:82-83,86-88,166-167`: assert the new paths and the absence of the old ones.
- **Test toolchain:**
  - `jest ^30.5.2`, `@types/jest ^30.0.0`, `jest-expo ~58.0.11`.
  - `@react-native/jest-preset 0.88.0`.
  - `@testing-library/react-native ^14.1.0` with `test-renderer 1.3.0`.
  - `react-test-renderer 19.3.0` and `@types/react-test-renderer ~19.3.0` (Decision 4).
  - `jest.config.js` `transformIgnorePatterns` keeps the custom allow-list, adds `standard-navigation`, and adds the two jest-expo 58 exclusions (`/node_modules/react-native-reanimated/plugin/`, `/node_modules/@react-native/babel-preset/`).
  - The two RNTL files (`__tests__/auth-screens.test.tsx`, `src/__tests__/hooks/useWidgetSync.test.ts`) `await` `render`/`renderHook`/`rerender`/`unmount`.
- **TypeScript and lint toolchain** land in the same install: `typescript ~6.0.3`, `@types/react ~19.3.0`, `@types/node ^22.20.5`, `eslint ^9.39.5`, `eslint-config-expo ~58.0.4`.
  - Fix the Strict TS API fallout, TS 6 and `jsx: react-jsx` (the new `expo/tsconfig.base`).
  - Don't add `react-native-legacy-deep-imports`, unless more than 60 errors remain (spec 09 FR5 escape hatch, with a dated follow-up).
- **`babel.config.js:19-22`.** Rewrite the comment so it no longer names the deleted reanimated patch's `_requiresAnimatedComponent` crash. The ordering rule (reanimated plugin last) stays.
- **Guards.** Extend `__tests__/config/deps.test.ts` with an `SDK 58 line` describe that uses floors, not windows:
  - Lockfile `expo` matches `/^\d+\.\d+\.\d+$/` with major ≥ 58. Lockfile `react-native` is `0.N.x` with N ≥ 88.
  - `expo-widgets` and `@expo/ui` lockfile majors equal the `expo` major.
  - `react-native-reanimated` ≥ 4.7.1, and `react-native-worklets` satisfies reanimated's `0.13.x` peer.
  - `@shopify/react-native-skia` ≥ 2.14.0 and `victory-native` major ≥ 42.
  - async-storage is exactly `2.2.0`.
  - `react-test-renderer` lockfile version equals `react`'s. `@react-native/jest-preset` `0.N` equals `react-native`'s `0.N`.
  - **Single copy** (no `node_modules/*/node_modules/<pkg>` lockfile key) of `react`, `react-native`, `expo-widgets`, `@expo/ui`, `test-renderer` and `react-native-css-interop`.
  - Root `react-native-css-interop` version equals `nativewind`'s declared dependency.
  - No `@react-navigation/*` in `dependencies` or `devDependencies`.
  - `patches/` contains no `.patch` files.
- **`sdk58-migration.test.ts` adds:** no `from '@react-navigation/`, no `expo-router/unstable-native-tabs`, no `import { … Tabs … } from 'expo-router'`, no `initialRouteName=`, and `app/(auth)/_layout.tsx` exports `unstable_settings.anchor === 'welcome'`.
- **Checkpoint B (device):**
  - `eas build -p ios --profile development` on EAS cloud. `auto` resolves to the `sdk-58` image.
  - Install it on an iOS 27 iPhone and run `npx expo start --dev-client --port 8082` from this worktree.
  - The app cold-launches, signs in with the QA manager account and renders all four tabs. Widgets may show the system "containerBackground" placeholder until FR6; that's expected and recorded.

**Success Criteria:**
- [ ] `rm -rf node_modules && npm ci` exits 0 and prints `No patch files found`. `ls patches/*.patch` matches nothing.
- [ ] `npx expo install --check` exits 0. `npm ls --all 2>&1 | grep -E "invalid|UNMET"` prints nothing.
- [ ] `package.json` matches I1 for every listed package, apart from recorded `--fix` patch-level drift.
- [ ] `deps.test.ts` and `sdk58-migration.test.ts` pass, including every single-copy and floor case.
- [ ] `npm test`, `npm run typecheck` and `npm run lint` exit 0 locally on Node ≥ 22.13. The only failures allowed are the red-phase tests written for FR5–FR8, each listed by name in the checklist.
- [ ] Checkpoint B is recorded: EAS build id, image line, iOS version, and a pass/fail line for each of the four tabs and sign-in.

---

### FR5: Native config for the iOS 27 SDK: scenes, minimum iOS, image pin, version

**Requirements:**
- **Scenes (Decision 9).** The SDK 58 template generates them. No `expo-build-properties` dependency, no plugin entry, no `enableSceneSupport`, no `ios.infoPlist.UIApplicationSceneManifest`.
- **Minimum iOS 16.4.** Take the template default and add no `ios.deploymentTarget` override. FR10 and FR11 put "Requires iOS 16.4 or later" into What's New and `site/support.html`.
- **Image pin (Decision 8).** `eas.json` `build.production.ios.image = "macos-tahoe-26.6-xcode-27.1"`. `development` and `preview` get no `image` key.
  - Re-run the infrastructure-page check before the FR11 build.
  - If the pinned name has gone, or its Xcode is a beta, use the newest non-beta `*-xcode-27.*` image and record it.
- **Version.**
  - `app.json` `expo.version` and `package.json` `version` = `"1.2.0"`. Regenerate the lockfile root version, because `fingerprint-config.test.ts` FR1 asserts it.
  - `ios.buildNumber` = `"19"`. If a 1.1.x rebuild took 19, use the next unused number (`node .appstore/asc.js builds`).
- **iPad (Decision 10).** Keep `ios.supportsTablet: true` and `orientation: "portrait"`, and don't add `ios.requireFullScreen`.
- **Privacy manifest.** `ios.privacyManifests` stays byte-identical to build 18. Spec 03's tests must stay green unchanged.
- **New `describe('10-sdk-58-ios-27')` in `__tests__/config/app-config.test.ts`.** Use typed JSON imports only (spec 03 contract) and read optional `eas.json` keys with `toHaveProperty`:
  - `JSON.stringify(expo.plugins)` doesn't contain `enableSceneSupport`, and no plugin entry names `expo-build-properties`.
  - `expo.ios.infoPlist` has no `UIApplicationSceneManifest`, and `expo.ios` has no `deploymentTarget`.
  - `expo.version` is semver ≥ 1.2.0. (The equality with `package.json` is spec 04's existing test.)
  - `ios.buildNumber` is an integer string ≥ 19.
  - `supportsTablet === true`, and `requireFullScreen` isn't `true`.
  - `expect(easJson.build.production).toHaveProperty(['ios','image'], expect.stringMatching(/^macos-[a-z]+-\d+(\.\d+)*-xcode-27(\.\d+)+$/))`. The value isn't `auto`, `default`, `latest` or `sdk-58`.
  - `easJson.build.development` and `easJson.build.preview` have no `ios.image`.
  - `expo.web.output === 'static'`.
- **`__tests__/config/app-config-introspect.test.ts` additions.** The resolved `sdkVersion` starts with `58.`, and `ios.infoPlist.UIRequiresFullScreen === false`. Spec 03's assertions stay unchanged, including the `ExpoWidgetsAppGroupIdentifier` non-vacuity guard. If expo-widgets 58 renamed that key, take the new name from its plugin source; never delete the guard.

**Success Criteria:**
- [ ] Every `10-sdk-58-ios-27` case is red on the FR4 tree and green after this FR.
- [ ] `npx expo config --type introspect --json` shows `sdkVersion` `58.x`, version `1.2.0`, buildNumber `19`, `UIRequiresFullScreen: false`, and `UIBackgroundModes: ["remote-notification"]`.
- [ ] The privacy-manifest tests in `app-config.test.ts` and `app-config-introspect.test.ts` pass with no edits to those cases.
- [ ] All three gates exit 0.

---

### FR6: Widgets on expo-widgets 58

Replace what the 55 patch did, and adapt `WIDGET_LAYOUT_JS` to the 58 runtime (spec-research F2.6, Decision 5).

**Requirements:**
- **Layout JS** (`src/widgets/bridge.ts`):
  - (a) The first statement inside `(function(props, env) {` (`:461`) is `props = props || {};`. 58 passes `undefined` props to the placeholder and gallery.
  - (b) The small, medium and large roots (`:666`, `:711`, `:808`) get `modifiers: [containerBackground('#0D0D1A', 'widget')]`. That's the build-18 native color `Color(0.051, 0.051, 0.102)`. Accessory families stay unchanged.
  - (c) Add `spacing: 0` to the `HStack`s at `:600`, `:617`, `:702`, `:735` and `:779`. @expo/ui 58 no longer collapses an unset spacing to 0.
  - (d) The countdown and `isEOWUrgent` use `var nowMs = (env && env.date) ? env.date.getTime() : Date.now();` instead of `Date.now()` (`:507`).
  - (e) Pass `initialProps` at both call sites: `createWidget('HourglassWidget', WIDGET_LAYOUT_JS, buildSignedOutWidgetData(Date.now()))` (`:920`, `:980`). Widen the local `CreateWidget` type (`:839`).
- **Module hygiene:**
  - Import `requireOptionalNativeModule` from `'expo'` instead of `'expo-modules-core'` (`:9`), and move the `jest.mock` in `src/__tests__/widgets/clearWidgetData.test.ts:31` to match.
  - Delete the stale ambient `declare module 'expo-widgets'` block (`src/types/modules.d.ts:50-61`), because the package ships `build/index.d.ts`. If typecheck shows that a call doesn't match the shipped types, fix the call. Don't re-declare the module.
- **Native fallback for the update window.** Create `plugins/withHourglassWidgetBackground.js` to contract I7:
  - It's a `withDangerousMod('ios')` that edits `ExpoWidgetsTarget/HourglassWidget.swift`, plus a pure, exported `addContainerBackground(source)`.
  - Add `"./plugins/withHourglassWidgetBackground"` to `app.json` `plugins` **immediately before** the `expo-widgets` tuple. A later plugin's mod runs first (`@expo/config-plugins` `withMod.js`), so listing it earlier makes it run after expo-widgets has written the file.
  - The transform is idempotent, and it throws when the anchor `WidgetsEntryView(entry: entry)` is missing.
- **Timeline.** Keep 58's `.atEnd` policy; drop the 15-minute reload. (d) is what keeps the countdown honest between app opens.
- **Android.** `package.json` gets `"expo": { "autolinking": { "android": { "exclude": ["expo-widgets"] } } }` (Decision 15), and `react-native-android-widget` is `^0.23.0` (already in FR4).
- **Tests:**
  - **`src/widgets/__tests__/widgetLayoutJs.test.ts`:**
    - Evaluating the layout with `props` `undefined` doesn't throw and returns a node for each family.
    - Each system root carries a `containerBackground` stub with `('#0D0D1A','widget')`.
    - A regex over `WIDGET_LAYOUT_JS` finds no `HStack({`/`VStack({` call without `spacing`.
    - With `env.date` = deadline − 3 h, the label reads `Due in 3h`, or the layout's exact format.
    - Every global identifier the layout calls exists among the named exports of `@expo/ui/swift-ui` (+ `/modifiers`), read with `jest.requireActual`.
  - **`__tests__/config/widget-background-plugin.test.ts`** uses a fixture copied verbatim from `expo-widgets@58.0.21` `plugin/src/ios/withWidgetSourceFiles.ts:355-364`:
    - The transform inserts `.modifier(HourglassContainerBackground())` exactly once and appends the struct.
    - A second run returns identical text.
    - A fixture without the anchor throws.
    - `app.json` lists the plugin immediately before the `expo-widgets` tuple.
  - **`deps.test.ts`:** `expo.autolinking.android.exclude` contains `expo-widgets`.
- **Device checks** (FR11 smoke): fresh install, the gallery preview, the update-over-build-18-without-opening case, and the countdown after more than an hour with the app closed.

**Success Criteria:**
- [ ] Every new widget test is red before the change and green after it. The existing `widgetLayoutJs`, `widgetPolish`, `widgetVisualIos`, `bridge`, `clearWidgetData` and Android widget suites pass.
- [ ] `grep -n "expo-modules-core" src/widgets/bridge.ts` prints nothing, and `grep -n "declare module 'expo-widgets'" src/types/modules.d.ts` prints nothing.
- [ ] `npx expo-modules-autolinking resolve -p android | grep -c expo-widgets` prints `0`. `npx expo-modules-autolinking resolve -p apple | grep -c expo-widgets` is ≥ 1.
- [ ] All three gates exit 0.

---

### FR7: Third-party native behavior pass (dev build, device)

Jest mocks Skia, Victory, RNGH and Reanimated (`__mocks__/`), so it can't see their native behavior. This FR is a device pass on an EAS development build of the FR6 tree. It fixes what breaks, and adds a regression test wherever jest can reproduce the break.

**Requirements:**
- **Gestures (RNGH 3.3).** No source change is expected (F2.3). On device, check:
  - Approvals swipe-approve and swipe-reject (`ApprovalCard.tsx:93-166`), including the threshold.
  - Overview scrub (`overview.tsx:138-147`, `useScrubGesture.ts:91-115`) and the AI cone scrub (`AIConeChart.tsx`).
  - No "GestureDetector must be used as a descendant of GestureHandlerRootView" error on any screen or in the Settings modal.
  - Keep the `useScrubGesture.ts:86-88` SIGABRT workaround.
- **Reanimated 4.7.** Check for no crash or warning from `sharedTransitionTag` (`setTag`), the `FadeInScreen` / `useStaggeredEntry` entry animations, the `AIArcHero` sweep (now `<Path end={sweepProgress}>`) and the `AnimatedMeshBackground` loop.
- **Charts.**
  - victory-native 42 + Skia 2.14 on `WeeklyBarChart`, `TrendSparkline` (including the scrub cursor), `AIConeChart`, `AIRingChart`, `DayPatternChart`, `HourlyPatternCard` and `DailyAIRow`.
  - They render with the right axes, bars, lines and areas, with no blank canvas and no red box.
  - Compare each against a build-18 screenshot taken beforehand.
- **NativeWind 4.2.7.** `className` styles apply on every screen. Keep `metro.config.js` unchanged.
  - Optionally, run a reversible experiment with the jsx-runtime redirect removed, and record whether styles survive.
  - Remove the workaround only in a later spec.
- **Hermes V1 memory.** On the development build with Xcode attached (Debug Navigator → Memory, or Instruments → Allocations), switch tabs for 10 minutes with charts animating.
  - Memory at 10 minutes must be ≤ 1.5 × the 1-minute reading, with no steady climb.
  - FR11 repeats this on TestFlight where tooling allows (spec-research Q4).
- **Fixes.** Each fix gets a jest regression test in that component's test file when jest can reproduce it. Otherwise, attach a before/after screenshot pair to the checklist.

**Success Criteria:**
- [ ] Every row of the checklist's FR7 device table is PASS, with the iOS version and dev-build id recorded.
- [ ] The memory readings (1 min and 10 min) are recorded, and the ratio is ≤ 1.5.
- [ ] Every fix has a passing regression test or a recorded screenshot pair. All three gates exit 0 afterwards.

---

### FR8: Toolchain, CI and release scripts

**Requirements:**
- **CI.** `.github/workflows/test.yml` sets `node-version: '22'` for both `app-tests` and `server-tests` (`:14`, `:33`). The step order is unchanged (spec 07 SC8.2). Extend `__tests__/ci-gates.test.ts`: every `node-version` value is an even major ≥ 22, and at least one exists.
- **Fingerprint (Decision 11).**
  - `fingerprint.config.js` exports exactly `{ sourceSkips: ['ExpoConfigVersions','PackageJsonScriptsAll','GitIgnore','ExpoConfigRuntimeVersionIfString','EasJson','Easignore','AutolinkingConfigPaths'] }`. Rewrite the header comment: it's 0.21.x / `balanced` now.
  - In `__tests__/config/fingerprint-config.test.ts`, `EXPECTED_SOURCE_SKIPS` becomes those 7 names, sorted. The enum-membership and no-`.cjs` guards stay.
  - `.fingerprintignore` is unchanged.
- **eas-cli (Decision 12):**
  - **First**, change `scripts/ota-publish.sh:86-95` to read the build runtime as `(b.runtime && b.runtime.version) ?? b.runtimeVersion`, and add both shapes to `__tests__/scripts/ota-publish.test.ts`. eas-cli ≥ 22 renamed the field.
  - Commit that change to `feat/sdk-58`, **and** cherry-pick it to `release/1.1`.
  - Then upgrade the global CLI (`npm i -g eas-cli@latest`, ≥ 25.2.0) and record `eas --version`.
  - Set `eas.json` `cli.version` to `">= 25.2.0"`, and add an `app-config.test.ts` case for it.
  - `docs/RELEASING.md` field names follow in FR10.
- **Gates in CI.** Open the PR (`feat/sdk-58` → `main`) as a **draft** so CI runs. Merging waits for the ground rule. `app-tests` and `server-tests` are green on that PR.

**Success Criteria:**
- [ ] `ci-gates.test.ts`, `fingerprint-config.test.ts`, `ota-publish.test.ts` and the `cli.version` case are red before the change and green after it.
- [ ] `git log release/1.1 --oneline -1 -- scripts/ota-publish.sh` shows the cherry-pick, and `release/1.1`'s `npm test` passes on its own tree (Node 20 is fine there).
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` prints the same 40-hex value on two consecutive runs on a clean tree. Record it.
- [ ] The draft PR's CI run is green on all jobs. Record the run URL.

---

### FR9: Local prebuild inspection, expo-doctor and fingerprint (checkpoint C)

Prove the generated native project is right **before** spending an EAS production build. Nothing here ships.

**Requirements:**
- **Throwaway copy:**
  - `T=$(mktemp -d)`. Copy the worktree with an APFS clone that includes `node_modules` (`cp -cR "<worktree>" "$T/app"`).
  - Run `npx expo prebuild --platform ios --clean --no-install` **inside `$T/app` only**. Never prebuild in the worktree.
  - `$T` contains no spaces. EAS paths don't either.
- **Assert every row of contract I4** with `plutil -extract … raw`, `grep` and `grep -c`. Record the outputs.
- **Record every prebuild warning.** There must be none about `enableSceneSupport` or `requireFullScreen`.
- **Optional compile-only check (inspection; never archive or export).** This answers whether hunk G is needed:
  - In `$T/app/ios`: `pod install`, then `xcodebuild -workspace Hourglassxo.xcworkspace -scheme ExpoWidgetsTarget -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`.
  - Record success, or the first error.
  - If it's skipped or inconclusive, the FR11 EAS build is the check (spec-research Q2, edge case 4).
- **`npx expo-doctor`** (in the worktree) exits 0. Record the check count.
- **Fingerprint.** The worktree's `runtimeversion:resolve --platform ios` equals the value from the `$T/app` copy. Compare iOS only; don't use `npx expo-fingerprint`.
- Delete `$T` when done.

**Success Criteria:**
- [ ] Every I4 row is PASS, with its command output pasted in the checklist.
- [ ] The prebuild warning list is recorded, and has no scene or full-screen warning.
- [ ] `expo-doctor` exits 0.
- [ ] The fingerprint values are equal.
- [ ] The compile-only check result, or "skipped", is recorded.

---

### FR10: Docs

**Requirements:**
- **`TECH_STACK.md`:**
  - Set Expo SDK `~58.0.16`, React Native `0.88.0`, React `19.3.0`, and every row in I1.
  - Replace the `@react-navigation/*` rows with "expo-router (ships its own navigation fork since SDK 56)".
  - Remove the `@expo/ngrok` and `react-native-inner-shadow` rows. Add a note that `npx expo start --tunnel` installs ngrok on demand.
  - Add "Node ≥ 22.13 (CI and EAS run 22)" and "iOS ≥ 16.4".
  - Patched packages: "none". Describe the local `withHourglassWidgetBackground` plugin.
  - Re-word the Metro fix line to say it was re-verified on SDK 58 / RN 0.88, or keep it with the FR7 result.
- **`CLAUDE.md:69`:** "Expo SDK 58, React Native 0.88, Expo Router, TanStack Query v5".
- **`README.md`:** `:27` "Expo SDK 58 + React Native 0.88"; `:66` reworded (no patches today).
- **`docs/ARCHITECTURE.md`:**
  - New `### 5.7 Native launch & lifecycle (UIKit scenes)`: `SceneDelegate: ExpoAppSceneDelegate`, AppState through UIApplication notifications, the cold-start URL path through `connectionOptions`, notifications via the app delegate subscriber, and no tap routing.
  - `§7.2`: the `.atEnd` timeline, `env.date`, stored-layout precedence, and the two `containerBackground`s.
  - `§8.6`: `haptic-tab` removed.
- **`docs/RELEASING.md`:**
  - (a) In `### Build`, rewrite steps 1 and 3 for SDK 58. Cloud only; the log must name `macos-tahoe-26.6-xcode-27.1` and Xcode 27.1. A local build would also miss the pinned Xcode.
  - (b) Update the `eas build:list` field names to `runtime.version` (eas-cli ≥ 22).
  - (c) New `## SDK upgrade` section:
    - Bump `build.production.ios.image` with every SDK.
    - Check `bundledNativeModules.json` and run `npx expo install --fix` until `--check` is clean.
    - Don't force through peer conflicts.
    - Patches policy (exact pin + `install.exclude` only while a patch exists).
    - The FR9 prebuild inspection.
    - The IPA `DT*` check.
    - The eas-cli JSON shape.
  - (d) New `### B2. Hotfixes for 1.1.x during the 1.2.0 rollout`:
    - `release/1.1` from `aade79b`, tagged `build-18`.
    - JS-only fixes are OTA'd from `release/1.1` with `scripts/ota-publish.sh`.
    - Every fix is cherry-picked forward to `feat/sdk-58`/`main`.
    - Never publish to production from the 1.2 tree before build 19 is live.
    - Retire the branch once 1.1.x adoption is negligible.
  - (e) The `EXPO_PUBLIC_USE_RN_FETCH` escape hatch (FR3).
- **`features/app/store-compliance/FEATURE.md`:** the release plan shows v1.2.0 / build 19 = spec 10; mark specs 06 FR5, 08 and 09 as superseded. (This spec's own commit already adds the spec table rows.)
- **`site/support.html`:** add "Requires iOS 16.4 or later".

**Success Criteria:**
- [ ] `grep -n "SDK 58" CLAUDE.md README.md TECH_STACK.md` matches in all three. `grep -rnE "SDK 55|0\.83|@react-navigation|ngrok|inner-shadow" CLAUDE.md README.md TECH_STACK.md` prints nothing.
- [ ] `grep -n "^### 5.7" docs/ARCHITECTURE.md` matches and mentions `ExpoAppSceneDelegate`.
- [ ] `grep -nE "^## SDK upgrade|^### B2\." docs/RELEASING.md` gives 2 matches. `grep -n "xcode-27.1" docs/RELEASING.md` is ≥ 1, and `grep -n "not Xcode 27" docs/RELEASING.md` prints nothing.
- [ ] `grep -n "16.4" site/support.html` matches.
- [ ] All three gates exit 0, and docs-only commits don't change the iOS runtime value from FR8.

---

### FR11: Build 19 to "ready to submit" (checkpoint D)

**Requirements:**
- **Pre-flight:**
  - Re-run the FR5 image check.
  - Confirm the next unused build number.
  - Confirm the ASC agreement has been accepted (spec 05: the API returns 403 otherwise).
  - Record HEAD, gate results and the local iOS runtime.
- **Build.** `eas build -p ios --profile production` on EAS cloud.
  - Record the build id, `gitCommitHash` (must equal HEAD) and runtime.
  - The log's "Spin up build environment" section names `macos-tahoe-26.6-xcode-27.1` / Xcode 27.1.
  - `eas build:list --platform ios --status finished --channel production --app-build-version 19 --limit 1 --json --non-interactive` returns that id, and its runtime equals the local resolve.
- **IPA check (contract I5).** Download `artifacts.buildUrl` into a new `mktemp -d`, unzip it, and `plutil -extract` each key from `Payload/*.app/Info.plist`. Also check `Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/Info.plist` has no scene manifest.
- **Upload to TestFlight only.** `eas submit -p ios --profile production --id <build id>`. That's an upload to App Store Connect, not an App Review submission.
  - Record the ITMS-91053 result, for any binary including `ExpoWidgetsTarget`.
  - The ASC `buildBundles[].sdkBuild` starting with `24` is an optional extra check; record "skipped" if the API is unreachable.
- **TestFlight smoke.** The user runs the checklist's "TestFlight smoke" section on an iOS 27 iPhone and an iOS 27 iPad. It covers:
  - Spec 05's 8 checks.
  - Foreground refresh.
  - A notification tap from a killed state.
  - Widget refresh on app open, and the build-18 → 19 update with no app open.
  - The `hourglassws://` deep link, cold and warm.
  - Sign-out clearing the widget and the log.
  - The 10-minute memory check.
  - The resizability matrix.
- **ASC prep for 1.2.0.** Do this when ASC allows a new version record (edge case 11), using `.appstore/asc.js` with `--dry-run` first (spec 05):
  - `create-version 1.2.0` (phased release, `AFTER_APPROVAL`).
  - `set-whats-new`, including "Requires iOS 16.4 or later".
  - `attach-build <19>`.
  - Confirm the age-rating "social media" answer is still `false`.
- **Stop at "ready to submit".** Record "ready to submit" in the checklist only after every smoke item passes. Submitting is the user's call.

**Success Criteria:**
- [ ] The EAS build id, `gitCommitHash`, image line and runtime are recorded. The `build:list` check matches.
- [ ] All I5 values are pasted and match.
- [ ] Every TestFlight smoke item is PASS on the iOS 27 iPhone, and on the iPad where applicable. Record the device models and iOS versions.
- [ ] Every cell of the resizability matrix is PASS, with a screenshot for each iPad width.
- [ ] `check-submission` shows 1.2.0 `PREPARE_FOR_SUBMISSION` with build 19 attached, or "blocked: <reason>" is recorded.
- [ ] No `POST /reviewSubmissions` was issued.

---

## Technical Design

### Files to Reference

| File | Why |
|---|---|
| `features/app/store-compliance/specs/10-sdk-58-ios-27/spec-research.md` | All evidence, decisions D1–D15 and contracts I1–I9 |
| `features/app/store-compliance/specs/08-expo-sdk-57-scenes/spec.md` FR6 | Device-check wording reused for FR11 (scenes, fetch, deep links) |
| `features/app/store-compliance/specs/09-sdk-58-xcode-27/spec.md` FR4, FR6 | Image-pick rule, IPA `DT*` method, resizability matrix, fingerprint-determinism method |
| `features/app/store-compliance/specs/05-release-build-18/spec.md` Test Plan | The 8 TestFlight smoke checks, `asc.js` dry-run discipline |
| `features/app/store-compliance/specs/04-ota-lane/spec.md` | `runtimeversion:resolve --platform ios`; never `npx expo-fingerprint` |
| `git show 962d413 96035ea` (`feat/dependency-hygiene`) | Spec 06 guard and pins to port (FR1) |
| `git show 9a56b88` (`origin/claude/loving-newton-2ozq70`) | Unmerged SDK 57 prior art: same widget conclusions (`spacing: 0`, `.atEnd`, native background) |
| `src/widgets/bridge.ts:9,461-520,600-820,839-980` | Layout JS and the `createWidget` sites (FR6) |
| `src/api/client.ts:26-56,109-200,207-283` | fetch sites, `handleStatus`, `parseBody` (FR3) |
| `scripts/ota-publish.sh:82-110` | Audience guard JSON read (FR8) |
| `jest.config.js:19-21`, `metro.config.js`, `babel.config.js` | Test transform list; NativeWind workaround; reanimated plugin comment |
| `__tests__/config/{app-config,app-config-introspect,fingerprint-config}.test.ts`, `__tests__/ci-gates.test.ts` | Existing guards to extend; spec 03's typed-import contract |
| `/tmp/spec10.o6hmwI/*` (ephemeral) | Tarballs read for this spec; re-create with `npm pack` |

### Files to Create/Modify

See spec-research "Files to Create/Modify". Additionally, `site/support.html` is modified in FR10 (iOS 16.4 minimum).

### Interface Contracts

Normative: spec-research I1 (`package.json`), I2 (`app.json`), I3 (`eas.json`), I4 (prebuilt project), I5 (IPA), I6 (widget layout), I7 (local plugin), I8 (`fingerprint.config.js`) and I9 (CI). Test-facing summary:

```typescript
// __tests__/config/app-config.test.ts (added block; typed JSON imports only)
describe('10-sdk-58-ios-27', () => {
  it('plugins never mention enableSceneSupport or expo-build-properties');
  it('ios.infoPlist has no UIApplicationSceneManifest; ios has no deploymentTarget');
  it('expo.version is semver >= 1.2.0');
  it('ios.buildNumber is an integer string >= 19');
  it('supportsTablet stays true and requireFullScreen is not true');
  it('eas production ios.image is a full xcode-27 image name, not an alias');
  it('eas development and preview have no ios.image');
  it('eas cli.version floor is >= 25.2.0');
  it('web.output stays static');
  it('withHourglassWidgetBackground is listed immediately before expo-widgets');
});

// __tests__/config/sdk58-migration.test.ts (new; fs source walk)
describe('10 FR2/FR3/FR4 — source migrations', () => {
  it('no @react-navigation imports');                 // FR2 (useIsFocused) then FR4 (all)
  it('no Skia.Path.Make() and no .copy().trim(');     // FR2
  it('no whatwg-fetch internals (_bodyInit|_bodyText|_bodyBlob)'); // FR3
  it('no expo-router/unstable-native-tabs, no root Tabs import, no initialRouteName='); // FR4
  it('(auth) layout exports unstable_settings.anchor === "welcome"'); // FR4
  it('components/haptic-tab.tsx is absent');           // FR2
});
```

### Data Flow

```
aade79b (build 18) ──► tag build-18, release/1.1 (1.1.x hotfix lane, OTA via ota-publish.sh)
        │
        ▼ feat/sdk-58
FR1 guards ─► FR2 nav/Skia/dead code ─► FR3 fetch hardening          [checkpoint A: SDK 55, gates green]
        │
        ▼
FR4 npx expo install expo@~58.0.16 --fix; patches deleted; 58-only imports; test toolchain
        ─► EAS development build (auto → sdk-58 image) ─► device + Metro :8082   [checkpoint B]
        ▼
FR5 app.json 1.2.0/19, eas image pin ─► FR6 widget JS + local plugin ─► FR7 device pass ─► FR8 CI Node 22,
    fingerprint skips, eas-cli ≥ 25 (+ ota-publish.sh on release/1.1)
        ▼
FR9 mktemp copy ─► expo prebuild --clean ─► Info.plist / SceneDelegate / pbxproj / entitlements /
    PrivacyInfo / widget Swift asserts; expo-doctor; fingerprint equality              [checkpoint C]
        ▼
FR10 docs ─► FR11 eas build (macos-tahoe-26.6-xcode-27.1) ─► IPA DT* (iphoneos27, 24…, 27…) ─► eas submit
    (TestFlight upload) ─► smoke on iOS 27 iPhone + iPad ─► "ready to submit"          [checkpoint D]
        ▼ (user decides)
App Review ─► release ─► spec 04 runbook A baseline OTA ─► merge to main ─► retire release/1.1 later
```

### Test Plan

| FR | Test | Location | Red before? |
|---|---|---|---|
| FR1 | `install.exclude` iff patch; exclude entries are direct deps; no inner-shadow; spec 06 rules 1–6 + fixtures | `__tests__/config/deps.test.ts` | red (inner-shadow, iff wording) |
| FR2 | No `useIsFocused` from react-navigation; no `Skia.Path.Make()`; no `.copy().trim(`; haptic-tab absent | `__tests__/config/sdk58-migration.test.ts` | red |
| FR2 | ScrubCursor builds via `MakeFromSVGString`; AIArcHero `Path` `start`/`end` | `src/components/__tests__/ScrubCursor.test.ts`, `AIArcHero*.test.tsx` | red |
| FR3 | Single body read; empty 200/204; non-JSON 2xx → `ApiError`; `FetchError` → `NetworkError`; pushToken never reads the body | `src/__tests__/api/client.test.ts`, `__tests__/client.test.ts`, `src/__tests__/lib/pushToken.test.ts` | red (non-JSON, single-read helper) |
| FR4 | SDK 58 floors; single copies; css-interop = nativewind dependency; no `@react-navigation/*`; no patches | `deps.test.ts` | red |
| FR4 | No react-navigation imports; native-tabs/js-tabs paths; `unstable_settings` | `sdk58-migration.test.ts`, `native-tabs.test.tsx` | red |
| FR5 | The `10-sdk-58-ios-27` block | `app-config.test.ts` | red |
| FR5 | `sdkVersion` 58; `UIRequiresFullScreen` false; spec 03 guards | `app-config-introspect.test.ts` | red (sdkVersion is red until FR4; FR5 adds it) |
| FR6 | Undefined props; `containerBackground` on roots; spacing set; `env.date`; globals exist in `@expo/ui` | `widgetLayoutJs.test.ts` | red |
| FR6 | Plugin transform, idempotence, throw, plugin order | `__tests__/config/widget-background-plugin.test.ts` | red |
| FR6 | Android autolinking exclude | `deps.test.ts` | red |
| FR7 | Regression tests per fix | component test files | written per fix |
| FR8 | Node ≥ 22 even; 7 `sourceSkips`; `ota-publish.sh` both JSON shapes; `cli.version` | `ci-gates.test.ts`, `fingerprint-config.test.ts`, `__tests__/scripts/ota-publish.test.ts`, `app-config.test.ts` | red |
| FR9–FR11 | Commands and device checks | checklist | n/a |

**Mocks needed:** `makeExpoLikeResponse` (FR3), the Skia mock `MakeFromSVGString` (FR2), a `containerBackground` stub in the widget layout harness (FR6), and the expo-widgets 58 `widgetSwift` template fixture (FR6). Everything else is static file reads.

### Edge Cases

| Case | Handling |
|---|---|
| App Review rejects build 18 | Fix on `release/1.1`. A 1.1.0 rebuild takes the next build number, and 1.2.0 then takes the one after (the range tests still pass). Cherry-pick the fix forward |
| A 1.1.x OTA is needed during the migration | Publish from `release/1.1` with `scripts/ota-publish.sh`. If eas-cli ≥ 22 is installed, apply the FR8 script fix there first |
| `npx expo install` fails with ERESOLVE | Find the conflicting peer (RNTL is the known one) and fix that range. Never use `--legacy-peer-deps` or `--force` |
| Two copies of css-interop, test-renderer, expo-widgets, @expo/ui or react | The `deps.test.ts` single-copy case fails. Align the declared range (e.g. css-interop exactly equal to nativewind's dependency) |
| The codemod misses imports (expo/expo#46481) | The `sdk58-migration.test.ts` source walk is the authority |
| Strict TS API / TS 6 fallout over 60 errors | Spec 09 FR5 escape hatch with a dated follow-up |
| A widget shows the placeholder after the update, without the app opening | That's what the FR6 local plugin is for. If it still happens, record it and check the plugin order in the FR9 prebuild (`.modifier(HourglassContainerBackground())` must be present) |
| ExpoWidgets fails with "… unavailable in application extensions" | Re-add only `APPLICATION_EXTENSION_API_ONLY=No` for the `ExpoWidgets` pod, preferably with a local Podfile `post_install` config plugin. If patch-package is used instead, pin exactly and add `install.exclude`, as spec 06 does |
| NativeWind styles vanish | Keep the `metro.config.js` workaround. Investigate before changing anything else |
| The pinned image disappears, or its Xcode is a beta | Use the newest non-beta `*-xcode-27.*` image, and update the test regex only if it no longer matches |
| ASC returns 403 (agreement) | Uploads and asc.js calls stay blocked until the Account Holder accepts it. The IPA check doesn't need the API |
| ASC won't create the 1.2.0 version while 1.1.0 is in review | TestFlight upload and smoke continue. Do the version-record prep once ASC allows it. Record "blocked: <reason>" |
| An automatic embedded-bundle update shows up on branch `production` after the SDK 58 build (EAS build-tools 24.9.0) | Record `eas update:list --branch production`. If it would confuse runbook A, set `EAS_UPDATE_UPLOAD_EMBEDDED_BUNDLE=0` in `build.production.env` before the next build |
| A device check fails because of `expo/fetch` semantics | Fix it in the client and add a test (FR3). Use `EXPO_PUBLIC_USE_RN_FETCH=1` only as a recorded last resort |
| No iOS 27 iPad is available | Run the iPhone matrix (iPhone Mirroring window resize on macOS 27). Mark the iPad rows "blocked: no device" and tell the user before "ready to submit" |

---

## Research Corrections

Corrections to earlier planning and to the six research inputs, each re-verified in this pass (details in spec-research F3):

1. **Spec 09 Out of Scope 3:** victory-native 42 is **forced**, not optional. Skia 2.14.0 removed the mutable SkPath API (#4092), and victory-native 41.x still calls `moveTo`/`lineTo`. That same Skia change breaks `ScrubCursor.ts` and `AIArcHero.tsx`.
2. **Spec 09 FR2:** keep `jest ~29.7` → **Jest 30**. The docs say "In SDK 58 and later, `jest-expo` requires Jest 30". RNTL 14 is also forced, by expo-router's optional peer.
3. **Spec 08 FR3:** the icon migration is not required at SDK 58 (Decision 3).
4. **Spec 08 FR4 / spec 09 FR3:** no `expo-build-properties` at all on the direct path.
5. **Spec 08 FR5 / spec 09 FR2 patch-shape tests:** the expo-widgets patch is **deleted**, not regenerated. The podspec and build-script quoting are fixed upstream in 58.0.0, and the background moves to JS plus a local plugin.
6. **Spec 06 FR5:** dropped. The SDK 58 floors replace the SDK 55 patch-line floors.
7. **The RNGH 3 rename claim** applies to the hook API only. The builder `onStart`/`onEnd` are unchanged in 3.3.0.
8. **The "patched modules become invisible to fingerprint" claim** is wrong. `patches/` is hashed by its own sourcer. The real gap is the dropped `balanced` skips.
9. **The "iPad orientation force-write is new" claim** is wrong. The same logic exists on SDK 55.
10. **The "no direct fetch() in app code" claim** is wrong. There are 5 sites.
11. **New in this pass:**
    - `initialRouteName` is a type error on expo-router 58 (`app/(auth)/_layout.tsx:8`).
    - The root `Tabs` import is deprecated.
    - eas-cli ≥ 22 breaks `ota-publish.sh`'s `runtimeVersion` read.
    - `react-test-renderer` is only transitive today, and disappears with RNTL 14.

---

## Dependencies

### Internal
- On `main` at `aade79b`: specs 01–05 and 07 merged (CI already gates on typecheck and lint).
- Spec 06 FR1–FR4: ported in FR1. Spec 06 FR5: superseded.
- Specs 08 and 09: superseded by this spec. Their research is reused.

### External
- Expo SDK 58 stable (`expo@58.0.16` latest, 2026-10-20).
- EAS image `macos-tahoe-26.6-xcode-27.1` listed (2026-10-20).
- The App Store Connect agreement accepted by the Account Holder.
- An iOS 27 iPhone and an iOS 27 iPad registered for internal distribution (`eas device:create`), for the development builds and TestFlight. macOS 27 for iPhone Mirroring.
- App Store Connect accepts Xcode 27.1 RC builds (spec 09 assumption, not re-verified).

### Assumptions
- The project stays CNG: `ios/` and `android/` are gitignored, and AppDelegate isn't customized.
- Apple's iOS 27 SDK rule takes effect in April 2027. v1.2.0 ships well before then.
- The `onLayout`-driven chart sizing re-measures on window resize. FR11's matrix checks this.
