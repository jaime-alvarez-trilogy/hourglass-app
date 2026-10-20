# SDK 58 on Xcode 27 (iOS 27 SDK build)

**Status:** Draft (gated, see FR1)
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This spec moves Hourglass from Expo SDK 57 (spec 08, v1.2.0) to **Expo SDK 58 / React Native 0.88**. It builds the store binary on a **pinned EAS Xcode 27 image**, so the uploaded IPA uses the **iOS 27 SDK**. That satisfies Apple's April 2027 upload rule. It ships as **v1.3.0**.

The work runs in six steps:

1. **Gate (FR1).** Confirm that Expo SDK 58 is stable and that EAS lists an Xcode 27 image. Also confirm that specs 03–08 have merged. Any failed check stops the executor, and nothing changes.
2. **Dependencies (FR2).** Run `npx expo install expo@^58.0.0 --fix` until `--check` is clean. Re-align patches and any packages in `expo.install.exclude`. Rewrite spec 08's SDK 57 version windows in `__tests__/config/sdk-migration.test.ts` as SDK 58 floors. Move off the deprecated `expo-router/unstable-native-tabs` path.
3. **Native config (FR3).** Delete `ios.enableSceneSupport`, which is a no-op with a warning at SDK 58 because the SDK 58 template generates `SceneDelegate.swift` itself. Replace spec 08's app-config assertion that requires it. Bump to `1.3.0` and take the next build number. Verify the scene setup with a scratch prebuild.
4. **Build image (FR4).** Pin `build.production.ios.image` to a full Xcode 27 image name and document the "bump the image on every SDK upgrade" step. Store builds run on EAS cloud, because `eas build --local` ignores `image`.
5. **Toolchain (FR5).** Move CI to Node 22, because SDK 58 and RN 0.88 drop Node 20. Clear the RN 0.87 Strict TypeScript API fallout so all three CI gates pass.
6. **Verification (FR6).** Check the IPA's `DT*` keys to prove it was built with the iOS 27 SDK. Then run the TestFlight smoke on an iOS 27 iPhone and iPad, plus a resizability matrix. iOS 27 makes iPhone apps resizable, and the iPad build already supports multitasking.

### Trigger snapshot (recorded by spec author, 2026-10-19)

| Check | Observed 2026-10-19 | Result |
|-------|---------------------|--------|
| E1: EAS Xcode 27 image | `macos-tahoe-26.6-xcode-27.1` **(latest, sdk-58)**, Xcode 27.1 **RC** (27A9275), Node 22.23.3. `macos-tahoe-26.6-xcode-27.0`, Xcode 27.0 GA (27A266a), Node 22.23.2. `sdk-57` is still `macos-tahoe-26.5-xcode-26.6`; `sdk-55` is `macos-sequoia-15.6-xcode-26.2` | PASS |
| E2: SDK 58 stable on npm | `expo` dist-tags: `latest` = `58.0.16`, `next` = `58.0.11`, `sdk-57` = `57.0.30`. **No `sdk-58` tag on `expo`**. `58.0.0` published 2026-09-29, after `58.0.0-preview.0…8` (09-10 → 09-28) | PASS |
| E3: SDK 58 changelog | `https://expo.dev/changelog/sdk-58` → 200, "Expo SDK 58", Oct 15 2026, "built for iOS 27 and includes React Native 0.88" | PASS |
| I1: spec 08 merged (`expo` ~57.0.≥23) | `package.json` `expo` = `~55.0.0` (installed 55.0.7) | **FAIL** |
| I2: `enableSceneSupport: true` present | no `expo-build-properties` in `app.json` or `node_modules` | **FAIL** |
| I3: spec 07 CI gates | `.github/workflows/test.yml` runs only `npm test` | **FAIL** |
| I4: prerequisite files | `__tests__/config/app-config.test.ts`, `__tests__/config/deps.test.ts`, `__tests__/config/sdk-migration.test.ts`, `docs/RELEASING.md` all absent (no `__tests__/config/` directory) | **FAIL** |

**Gate verdict on 2026-10-19: STOP.** The external block has cleared. The internal prerequisites (specs 03–08) have not.

Local toolchain on 2026-10-19: macOS 27.0.1, Xcode 27.0 (27A266a), iOS SDK 27.0 (build `24A430`), Node 22.17.0, eas-cli 20.1.0.

---

## Out Of Scope

1. **SDK 55 → 57 migration work.** This covers the react-navigation and vector-icons codemods, `expo/fetch`, the Hermes V1 regression check, the first adoption of the scene lifecycle at 57, and the expo-widgets patch rebase to 57. **Deferred to `08-expo-sdk-57-scenes`.** This spec starts from a merged spec 08.

2. **iPhone Duo-specific layout.** This means `ArrangementView`, `expo-hinge`, and a vertical rail. **Descoped.** The hardware is unreleased and can't be tested. The app already uses system `NativeTabs`, which iOS places on both displays. Resizing in general is covered by FR6.

3. **victory-native 42 migration.** **Descoped unless forced.** victory-native isn't in Expo's `bundledNativeModules`, and every 41.x release declares open-ended peers (`@shopify/react-native-skia >=1.2.3`). FR2 keeps 41.x and moves to 42 only if 41.x fails typecheck or the FR6 chart pass. In that case the migration stays inside this spec.

4. **Pinning images for the `development` and `preview` profiles.** **Descoped.** These profiles keep `auto`, which resolves to the `sdk-58` alias at SDK 58. Only the store artifact needs a reproducible toolchain (Decision 2 in spec-research).

5. **Replacing the deprecated `ImageBackground`** (`src/components/GlassCard.tsx:238`, `src/components/ApprovalCard.tsx:390`). **Descoped.** RN 0.88 deprecates it but doesn't remove it. Revisit when a removal is announced.

6. **Android changes.** This covers expo-widgets 58's new Android implementation versus `react-native-android-widget`, and R8 becoming the default. **Descoped** under the FEATURE non-goal (no Android store listing). The iOS release doesn't run Android prebuild.

7. **Adopting new SDK 58 features.** This covers App Intents, Expo Observe, the Rust transformer, Router data loaders, and Expo UI lists. **Descoped.** FEATURE non-goal: no new user-facing features.

8. **Multi-column or wide-screen redesign.** **Descoped.** FR6 fixes breakage only (clipping, overlap, stale canvas width) and doesn't design new wide layouts.

9. **Accepting the updated Apple agreement in App Store Connect.** As of 2026-10-19 the ASC API returns 403 `REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. **Descoped here.** It blocks spec 05 (build 18) first and must be resolved there by the Account Holder. FR6 doesn't depend on the ASC API: the primary check reads the IPA.

10. **Foreground OTA checks.** **Descoped** (FEATURE non-goal).

---

## Functional Requirements

### FR1: Trigger gate (external availability + internal prerequisites)

This is the first task, and it can stop the spec. It checks that the outside world is ready (E1–E3) and that the repo is ready (I1–I5). **If any check fails, the executor stops.** It writes the SPEC BLOCKED report into `checklist.md` Session Notes and modifies no other file.

**Requirements:**
- **E1: Xcode 27 image listed.** Run the E1 command in the checklist against `https://docs.expo.dev/build-reference/infrastructure/`. It must return at least one `macos-*-xcode-27.*` row whose Xcode string doesn't contain `beta`. Record every row verbatim: image name, aliases, Xcode version, and Xcode build. Also record which row carries the `sdk-58` alias.
- **E2: SDK 58 stable on npm.** The newest version matching `/^58\.\d+\.\d+$/` exists in `npm view expo versions`, and the major version of `npm view expo dist-tags.latest` is ≥ 58. **Don't** require an `sdk-58` dist-tag on `expo`; there wasn't one on 2026-10-19.
- **E3: Changelog published.** `curl -s -o /dev/null -w '%{http_code}' https://expo.dev/changelog/sdk-58` prints `200`.
- **I1: Spec 08 merged.** `package.json` `dependencies.expo` matches `~57.0.N` with N ≥ 23.
- **I2: Scene support present at 57.** `app.json` has an `expo-build-properties` plugin tuple with `ios.enableSceneSupport === true`.
- **I3: Spec 07 merged.** `.github/workflows/test.yml` contains both `npm run typecheck` and `npm run lint`.
- **I4: Prerequisite files exist.** `__tests__/config/app-config.test.ts` (spec 03/04/05), `__tests__/config/deps.test.ts` (spec 06), `__tests__/config/sdk-migration.test.ts` (spec 08), and `docs/RELEASING.md` (spec 04/05).
- **I5: Clean start.** On `main`, `git status --porcelain` is empty and `git fetch && git status -sb` shows the branch isn't behind. Then create branch `feat/sdk-58`.

**Success Criteria:**
- [ ] The outputs of E1–E3 and I1–I5 are pasted into `checklist.md` Session Notes with the date, and each is marked PASS or FAIL.
- [ ] If any check FAILs, `git status --porcelain` shows no change outside `checklist.md`, and the Session Notes contain a SPEC BLOCKED block that names each failed check and its observed value.
- [ ] If all checks pass, `git rev-parse --abbrev-ref HEAD` prints `feat/sdk-58`, and the branch was created from an up-to-date `main`.
- [ ] The image picked for FR4 (from E1) is recorded with its Xcode version and build.

---

### FR2: Upgrade dependencies to the SDK 58 line

Move every SDK-coupled package to the versions SDK 58 expects. Keep patches applying, and keep non-SDK libraries on their current majors unless the upgrade forces a change.

**Requirements:**
- Run `npx expo install expo@^58.0.0 --fix`, then repeat `npx expo install --fix` until `npx expo install --check` exits 0.
- If `package.json` `expo.install.exclude` lists packages (spec 06 added `expo-widgets`, and spec 08 FR1 keeps it), `--fix` skips them. Move each one to its SDK 58 version explicitly (`npx expo install <pkg>@<bundled range>`). Then drop it from `exclude` unless a patch in `patches/` still pins it. Two tests assert the current list, and both must match the new one. Spec 06's `__tests__/config/deps.test.ts` asserts `exclude` contains `"expo-widgets"`: update it to the new list, and keep its "every entry is a direct dependency" check. Spec 08's `__tests__/config/sdk-migration.test.ts` asserts the same thing: rewrite it as below. Don't delete either assertion.
- **Rewrite spec 08's SDK 57 version windows in `__tests__/config/sdk-migration.test.ts`.** Spec 08's FR1 cases have upper bounds that fail on SDK 58: lockfile `expo` in [57.0.23, 58.0.0), `expo-build-properties` in [57.0.20, 58.0.0), `react-native` matching `/^0\.86\.\d+$/`, and `dependencies["expo-widgets"]` matching `/^57\.\d+\.\d+$/`. Edit them in place, using floors with no upper bound, so SDK 59 doesn't repeat the problem:
  - Lockfile `node_modules/expo` matches `/^\d+\.\d+\.\d+$/` (no prerelease) with major ≥ 58, and `dependencies.expo` (after stripping a leading `~`/`^`) has major ≥ 58.
  - `dependencies["react-native"]` and the lockfile `node_modules/react-native` are `0.N.x` with N ≥ 88.
  - Lockfile `node_modules/expo-widgets` has major ≥ 58 and equal to the lockfile `expo` major. `dependencies["expo-widgets"]` has the same major after stripping `~`/`^`. Exactness is left to spec 06's alignment guard, which requires an exact pin only while a patch exists.
  - `expo-build-properties`: delete the [57.0.20, 58.0.0) window. Replace it with this invariant: the package is in `dependencies` if and only if an `app.json` `expo.plugins` entry names it, and if it's present, its lockfile major equals the lockfile `expo` major. FR3 normally removes both the plugin and the package.
  - `expo.install.exclude`: replace "contains `expo-widgets`" with "contains `expo-widgets` if and only if a `patches/expo-widgets+*.patch` file exists".
  - Keep every other spec 08 case unchanged as a guard: no `@react-navigation/*` or `@expo/vector-icons` in `dependencies`/`devDependencies` or in the source walk, `components/haptic-tab.tsx` absent, both `@react-native-vector-icons/*` in `dependencies`, the glyphmap key checks, and `@react-native/jest-preset` in `devDependencies`. Tighten the jest-preset case: its declared range has the same `0.N` minor as `react-native`.
- Every `patches/<name>+<version>.patch` targets the installed version. Rebase a patch with `npx patch-package <name>` after re-applying its intent, or delete it if the upstream fix has landed. `rm -rf node_modules && npm ci` must apply every patch without warnings (`postinstall: patch-package --error-on-fail`, from spec 06).
- If the `expo-widgets` patch changes, update spec 08's FR5 patch-shape cases in `deps.test.ts` in the same commit. Those cases expect exactly one `patches/expo-widgets+*.patch`, under 20000 bytes, with exactly four `diff --git` paths, containing `addingTimeInterval(15 * 60)` and `basename "$PROJECT_DIR"`. If the patch is regenerated, match the hunks that remain, and keep each surviving hunk's marker-string assertion. If the patch is deleted, replace the cases with "no `patches/expo-widgets+*.patch`". Keep the "no `react-native-reanimated+*.patch`" case.
- Expected targets, from `expo@58.0.16` `bundledNativeModules.json` on 2026-10-19. If `--fix` picks a later patch release, `--fix` wins:

  | Package | Now (SDK 55) | SDK 58 |
  |---|---|---|
  | `react-native` | 0.83.2 | 0.88.0 |
  | `react` / `react-dom` | 19.2.0 | 19.3.0 |
  | `expo-widgets` | 55.0.5 (patched) | ~58.0.21 |
  | `@shopify/react-native-skia` | 2.4.18 | 2.14.0 |
  | `react-native-reanimated` / `react-native-worklets` | 4.2.1 / 0.7.2 | 4.7.1 / 0.13.0 |
  | `react-native-gesture-handler` | ~2.30.0 | **~3.3.0 (major)** |
  | `react-native-svg` | 15.15.3 | 15.16.0 |
  | `react-native-screens` / `react-native-safe-area-context` | ~4.23.0 / ~5.6.0 | ~4.30.0 / ~5.10.1 |
  | `expo-router` / `expo-updates` / `expo-notifications` | 55.x | ~58.0.24 / ~58.0.17 / ~58.1.5 |
  | `jest-expo` / `eslint-config-expo` | ~55.0.11 / ~55.0.0 | ~58.0.11 / ~58.0.4 |

- `jest-expo` 58 adds a peer dependency on `@react-native/jest-preset@^0.88.0`. `npm ls @react-native/jest-preset` must show no `UNMET` or `invalid` entry. Keep `jest` on `~29.7` unless the suite fails to boot; the jest-expo 58 peer range is `^29 || ^30`.
- **victory-native** stays on the latest 41.x (the `^41.20.2` range lets the lockfile move to 41.26.x). Move to `^42` only if 41.x fails `npm run typecheck` or the FR6 chart pass. If that happens, do a chart-by-chart pass of `src/components/WeeklyBarChart.tsx` and `src/components/TrendSparkline.tsx`. 42.0.1 still exports `CartesianChart`, `Line`, `Area` and `useChartPressState`, and needs Skia `>=2.6.0 <3.0.0`.
- **react-native-gesture-handler 3.** Keep the current `Gesture` + `GestureDetector` API, which 3.3.0 still exports: `Gesture` is the legacy builder, `GestureDetector` comes from the v3 module, and `GestureType` and `GestureHandlerRootView` are unchanged. Fix only what typecheck or the device reports at `app/_layout.tsx:16`, `app/(tabs)/overview.tsx:22`, `src/components/ApprovalCard.tsx:34`, `src/components/AIConeChart.tsx:34` and `src/hooks/useScrubGesture.ts:27,29`.
- **nativewind** stays on 4.x (≥4.2.7 allowed); 5.x is still an RC. `react-native-android-widget` and `react-native-inner-shadow` (JS-only) stay unchanged unless install fails.
- Change the deprecated `expo-router/unstable-native-tabs` import (`app/(tabs)/_layout.tsx:23`) to `expo-router/native-tabs`. Both export the same `NativeTabs`; the old path is marked `@deprecated` in expo-router 58.0.24.
- `npx expo-doctor` passes every check.

**Success Criteria:**
- [ ] `package.json` `dependencies.expo` has major ≥ 58, and lockfile `packages["node_modules/expo"].version` matches `/^\d+\.\d+\.\d+$/` (no prerelease) with major ≥ 58. For this spec, that's `58.x.y`.
- [ ] `dependencies["react-native"]` and the lockfile `node_modules/react-native` version are `0.N.x` with N ≥ 88.
- [ ] `npx expo install --check` exits 0.
- [ ] `npx expo-doctor` exits 0.
- [ ] `rm -rf node_modules && npm ci` exits 0, and every file in `patches/` is reported as applied with no warnings.
- [ ] `__tests__/config/deps.test.ts` passes, including the patch-version alignment guard from spec 06, the updated `install.exclude` assertion, and spec 08's FR5 patch-shape cases (updated if the patch changed).
- [ ] `__tests__/config/sdk-migration.test.ts` passes with the SDK 58 floors, and `grep -nE "57\.|0\.86" __tests__/config/sdk-migration.test.ts` prints nothing (no SDK 57 bound left).
- [ ] `__tests__/config/fingerprint-config.test.ts` (spec 04) passes against the SDK 58 `@expo/fingerprint`.
- [ ] `grep -rn "unstable-native-tabs" app src components` returns nothing.
- [ ] The victory-native major (41 or 42), and the reason if it's 42, is recorded in Session Notes.

---

### FR3: Native config for the SDK 58 scene lifecycle and v1.3.0

From SDK 58 the project template adopts the scene lifecycle itself. The SDK 57 opt-in becomes a no-op that emits a warning (verified in `expo-build-properties` 58.0.11, `build/iosSceneSupport.js`). Clean it up, bump the version, and prove the generated native project is correct.

**Requirements:**
- Remove `ios.enableSceneSupport` from the `expo-build-properties` plugin options. If the options object is then empty, remove the plugin entry. If nothing else references `expo-build-properties`, uninstall it. (Spec 08 FR4 allows no other options, so normally both the entry and the package go.)
- **Replace spec 08's FR4 block in `__tests__/config/app-config.test.ts`.** It asserts exactly one `expo-build-properties` plugin entry, a tuple whose `[1]` deep-equals `{ ios: { enableSceneSupport: true } }`. That fails as soon as this FR lands. Delete that case, and replace it with spec 09's "`JSON.stringify(expo.plugins)` doesn't contain `enableSceneSupport`" case. Keep spec 08's other FR4 cases as guards: no bare-string `'expo-build-properties'` entry, no `ios.deploymentTarget` in any `expo-build-properties` options, and no `UIApplicationSceneManifest`. They pass vacuously once the entry is gone. The package-presence rule is in `sdk-migration.test.ts` (FR2).
- `app.json` must not declare `ios.infoPlist.UIApplicationSceneManifest`. The template owns it, and a hand-written copy would conflict.
- `expo.version` = `1.3.0`, and `package.json` `version` = `1.3.0` (spec 04 keeps the two equal). `ios.buildNumber` takes the **next unused** build number, an integer string greater than the last build uploaded to ASC. Never hard-code a guess.
- Keep `ios.supportsTablet: true` (Decision 3) and `orientation: "portrait"`. iOS 27 treats `orientation` as a preference while the app is resizable. Don't add `ios.requireFullScreen: true`, because it no longer opts out of resizing on iOS 27 (Expo SDK 58 changelog; `expo-screen-orientation` v58 docs).
- A scratch prebuild (see the FR3 commands in the checklist) produces:
  - `ios/Hourglassxo/SceneDelegate.swift` containing `class SceneDelegate: ExpoAppSceneDelegate`.
  - `ios/Hourglassxo/Info.plist` key path `UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0.UISceneDelegateClassName` = `$(PRODUCT_MODULE_NAME).SceneDelegate`. This is the SDK 58 template value. SDK 57's was `EXExpoAppSceneDelegate`.
  - `ios/Hourglassxo/AppDelegate.swift` containing `class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider`.
  - Prebuild output with no `ios.enableSceneSupport` warning.
  - No regressions from spec 03: `PrivacyInfo.xcprivacy` contains `1C8F.1`, introspected `UIBackgroundModes` equals `["remote-notification"]`, and `NSFaceIDUsageDescription` is absent.

**Success Criteria:**
- [ ] `JSON.stringify(app.expo.plugins)` doesn't contain `enableSceneSupport`.
- [ ] `__tests__/config/app-config.test.ts` has no case requiring an `expo-build-properties` entry or `enableSceneSupport: true` (spec 08's FR4 deep-equal case is gone), and `grep -n "enableSceneSupport: true" __tests__/config/app-config.test.ts` prints nothing.
- [ ] `app.expo.ios.infoPlist.UIApplicationSceneManifest` is `undefined`.
- [ ] `app.expo.version` is semver ≥ `1.3.0` and equals `package.json` `version`.
- [ ] `app.expo.ios.supportsTablet === true` and `app.expo.ios.requireFullScreen !== true`.
- [ ] All five prebuild checks above pass, and their outputs are recorded in Session Notes.
- [ ] `npx expo config --type introspect --json` reports `sdkVersion` beginning with `58.` and `ios.infoPlist.UIRequiresFullScreen === false`. This is automated in `__tests__/config/app-config-introspect.test.ts` (spec 03's resolved-config suite, which runs the Expo CLI in `beforeAll`).
- [ ] Spec 03's existing introspect assertions stay green unchanged: `UIBackgroundModes` deep-equals `['remote-notification']`, no `NSFaceIDUsageDescription`, `privacyManifests` includes `1C8F.1`, and the `ExpoWidgetsAppGroupIdentifier` non-vacuity guard holds.

---

### FR4: Reproducible Xcode 27 build image

Pin the store build to a known Xcode 27 toolchain. Make sure the pin can't silently go stale or be bypassed by a local build.

**Requirements:**
- Set `eas.json` → `build.production.ios.image` to a **full image name**, never an alias (`auto`, `default`, `latest`, `sdk-58`). Pick it this way:
  1. Use the image carrying the `sdk-58` alias in FR1/E1, provided its Xcode is GA or RC. App Store Connect accepts RC builds but not betas.
  2. Otherwise, use the newest `*-xcode-27.*` image whose Xcode isn't a beta.
  - As of 2026-10-19, rule 1 gives **`macos-tahoe-26.6-xcode-27.1`** (Xcode 27.1 RC, 27A9275). Rule 2's fallback is `macos-tahoe-26.6-xcode-27.0` (Xcode 27.0 GA, 27A266a, the same build as the local Mac).
- Run v1.3.0 store builds on **EAS cloud**: `eas build -p ios --profile production`, without `--local`. `eas build --local` ignores `image` and uses the host's Xcode. Builds 10–12 and 16 were built locally; the build-16 IPA shows Xcode 26.6. A local store build is allowed only if `xcodebuild -version` reports the same Xcode version **and** build as the pinned image. Record both.
- Add the following to the SDK-upgrade section of `docs/RELEASING.md`:
  - "Bump `build.production.ios.image` to the new SDK's image." Pinning cuts the `auto` link between SDK and Xcode.
  - "Local builds ignore `image`; check that `xcodebuild -version` matches the pinned image, or build on EAS cloud."
  - The IPA `DT*` verification command from FR6.
- `development` and `preview` keep `auto` (Out of Scope #4).

**Success Criteria:**
- [ ] `eas.build.production.ios.image` matches `/^macos-[a-z]+-\d+(\.\d+)*-xcode-27(\.\d+)+$/`.
- [ ] At execution time, the pinned name appears in the E1 command output.
- [ ] `grep -n "ios.image" docs/RELEASING.md` and `grep -n -i "local builds ignore" docs/RELEASING.md` both match.
- [ ] The EAS build log's "Spin up build environment" section names the pinned image and Xcode 27.x. Paste the line into Session Notes.

---

### FR5: Toolchain and CI gates green on SDK 58

SDK 58 tooling and RN 0.88 require Node `^22.13 || ^24.3 || >=26`. RN 0.87 makes the Strict TypeScript API the default. Keep the three CI gates from spec 07 green.

**Requirements:**
- Set every `node-version` in `.github/workflows/test.yml` to `'22'`. That covers both `app-tests` and `server-tests`, because `server-tests` also runs the root `npm ci`. The EAS Xcode 27 images ship Node 22.23.x. The Railway runtime is separate and isn't affected.
- `npm test`, `npm run typecheck` and `npm run lint` all exit 0 locally on Node ≥ 22.13 and in CI.
- **Strict TypeScript API.** Fix the fallout, which is mostly ref types moving to instance types such as `ViewInstance`. The app has **zero** `react-native/Libraries/*` deep imports (verified 2026-10-19). Don't add the `react-native-legacy-deep-imports` `customConditions` opt-out, which RN removes after 0.89. Exception: if strict-API errors after FR2 exceed 60, the opt-out is allowed temporarily. In that case record a follow-up in Session Notes and in `TECH_STACK.md`.
- Update the docs: in `TECH_STACK.md`, set Expo SDK, React Native, React and the key native library versions, and add the Node ≥ 22.13 requirement. In the `CLAUDE.md` "Project quick reference" section, set Framework to SDK 58 / RN 0.88.

**Success Criteria:**
- [ ] Every `node-version:` value in `test.yml` has major ≥ 22, and at least one exists.
- [ ] `test.yml` still contains `npm run typecheck` and `npm run lint`.
- [ ] `npm test`, `npm run typecheck` and `npm run lint` exit 0 locally, and the PR's CI run is green on all jobs.
- [ ] `tsconfig.json` has no `react-native-legacy-deep-imports` entry, or a dated follow-up is recorded under the exception.
- [ ] `TECH_STACK.md` and `CLAUDE.md` name SDK 58 / RN 0.88 (`grep -n "58" TECH_STACK.md` shows the SDK row).

---

### FR6: Verify the iOS 27 SDK build and smoke-test resizability

Prove the uploaded binary was built with the iOS 27 SDK. Then confirm the app works, and lays out correctly, when iOS 27 resizes it.

**Requirements:**
- **Artifact check (primary; no ASC API needed).** Get the production IPA (`eas build:list --platform ios --limit 1 --json --non-interactive` → `artifacts.buildUrl`) and extract `Payload/*.app/Info.plist`. Then check:
  - `DTSDKName` starts with `iphoneos27`.
  - `DTSDKBuild` starts with `24`. The iOS 27.0 SDK is `24A430`; the current build-16 IPA shows `23F81a`.
  - `DTXcode` starts with `27`.
  - `CFBundleShortVersionString` = `1.3.0`, and `CFBundleVersion` = the FR3 build number.
  - The scene delegate key path from FR3 ends with `.SceneDelegate` (the build expands `$(PRODUCT_MODULE_NAME)`).
- **Fingerprint determinism (spec 04 FR2/FR4 method).** SDK 58 moves `@expo/fingerprint` from 0.16 to 0.21. Spec 04's `scripts/ota-publish.sh` publishes only when the local iOS runtime matches a finished production build's, so a local/EAS mismatch would block every 1.3.x OTA. Get the FR6 build's `id`, `runtimeVersion` and `gitCommitHash` from `eas build:list`. At that commit, after `npm ci`, `npx expo-updates runtimeversion:resolve --platform ios` must print the same `runtimeVersion`. If they differ, `eas fingerprint:compare --build-id <id> --environment production` names the differing source. Compare iOS runtimes only. Don't use `npx expo-fingerprint` (npm 404) or the bare `fingerprint` bin, which hashes both platforms and never equals the iOS runtime (spec 04 Verified Facts).
- **ASC check (secondary, only if the ASC API is reachable).** `GET /v1/builds/{id}?include=buildBundles` → `buildBundles[].attributes.sdkBuild` starts with `24`. `.appstore/asc.js` has no buildBundles command. If the API returns 403 (agreements) or the call isn't worth adding, record "skipped" with the reason.
- **TestFlight smoke on an iOS 27 iPhone and an iOS 27 iPad.** Run every item in the spec 05 smoke checklist and every addition from spec 08 (both listed in the checklist). Record pass or fail for each.
- **Resizability matrix.** On the iPad, test Split View at ⅓, ½ and ⅔, Slide Over, Stage Manager from narrowest to widest, and rotation between portrait and landscape. On the iPhone, resize the iPhone Mirroring window on macOS 27. Cover these screens: Home, Overview (manager and contributor), AI, Approvals (swipe approve and reject) and the Settings modal. Each screen must meet all of these:
  - No clipped or overlapping content.
  - Every Skia/Victory chart re-measures to the new width within one resize. That covers the `onLayout` sites at `app/(tabs)/index.tsx:465,499,528,583`, `app/(tabs)/overview.tsx:154,194,530`, `app/(tabs)/ai.tsx:222,284`, `src/components/GlassCard.tsx:198`, `src/components/ApprovalCard.tsx:353` and `src/components/DailyAIRow.tsx:62`. A chart must never stay at a stale width or render a blank canvas.
  - The Overview sticky bar still triggers correctly (`overview.tsx:401` re-measures the hero bottom).
  - `AnimatedMeshBackground` fills the window (`useWindowDimensions`, `src/components/AnimatedMeshBackground.tsx:164`).
  - The Approval swipe threshold scales with window width (`src/components/ApprovalCard.tsx:124,173,177,191`).
  - The tab bar stays reachable, and nothing crashes.
- **Fix layout breakage as it's found.** Each fix gets a jest regression test in that component's existing test file wherever jest can reproduce the bug, typically by firing `onLayout` with a second width and asserting the chart width prop updates. Where jest can't reproduce it, attach before and after screenshots in the checklist.

**Success Criteria:**
- [ ] The five IPA `DT*` and scene values are pasted into Session Notes, and all match.
- [ ] The local `runtimeversion:resolve --platform ios` value at the build's `gitCommitHash` equals the build's `runtimeVersion` from `eas build:list`. Both values are pasted into Session Notes.
- [ ] ASC `sdkBuild` starts with `24`, or "skipped" is recorded with a reason.
- [ ] Every spec 05 and spec 08 smoke item is marked PASS on iOS 27 for both iPhone and iPad.
- [ ] Every cell of the resizability matrix (configuration × screen) is marked PASS, with a screenshot for each iPad width.
- [ ] Every layout fix has a passing regression test or a recorded before/after screenshot pair.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `features/app/store-compliance/specs/08-expo-sdk-57-scenes/spec-research.md` | Starting state: scene opt-in, patch status, manual smoke additions, `release/1.x` OTA branching |
| `features/app/store-compliance/specs/08-expo-sdk-57-scenes/spec.md` (Test Plan) | Spec 08 tests pinned to SDK 57 that this spec rewrites: `sdk-migration.test.ts` FR1 windows, the `app-config.test.ts` FR4 `enableSceneSupport: true` tuple, and the `deps.test.ts` FR5 expo-widgets patch-shape cases |
| `features/app/store-compliance/specs/04-ota-lane/spec.md` (FR2, FR4, Verified Facts) | Fingerprint determinism method: `runtimeversion:resolve --platform ios` against `eas build:list` `runtimeVersion`, or `eas fingerprint:compare`. `npx expo-fingerprint` is npm 404 |
| `features/app/store-compliance/specs/05-release-build-18/spec-research.md` | TestFlight smoke checklist and native release runbook |
| `features/app/store-compliance/specs/04-ota-lane/spec-research.md` | Fingerprint runtime; `docs/RELEASING.md` layout; the package.json/app.json version equality test |
| `features/app/store-compliance/specs/06-dependency-hygiene/spec-research.md` | `deps.test.ts` patch guard; `expo.install.exclude`; `--error-on-fail` |
| `features/app/store-compliance/specs/07-ci-typecheck-lint/spec-research.md` | CI gate layout in `test.yml`; >60-error escape-hatch precedent |
| `jest.config.js` | `preset: 'jest-expo/node'`; `testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']` |
| `src/lib/__tests__/sharedTransitions.test.ts:15-16,99` | Pattern for reading `app.json` via `fs` + `path.resolve(__dirname, …)` in a static config test |
| `__mocks__/victory-native.ts`, `__mocks__/react-native-gesture-handler.ts` | Module-level mocks: jest **can't** detect victory-native or RNGH API breaks, so typecheck and FR6 on-device checks are the guard |
| `metro.config.js` | NativeWind workaround (`forceWriteFileSystem`, jsx-runtime redirect) tied to Metro internals. If `className` styles vanish on SDK 58, look here first |
| `babel.config.js` | `react-native-reanimated/plugin`, which still exists in reanimated 4.7.1 |
| `app/(tabs)/_layout.tsx:23`, `app/(tabs)/__tests__/native-tabs.test.tsx:82-83,166-167` | Deprecated native-tabs import, and the tests that pin it |
| `src/lib/pushToken.ts:11-13` | `EXPO_PUBLIC_PING_SERVER_URL` with a hard-coded fallback. SDK 58 changes NODE_ENV/.env loading, so confirm relay registration in the smoke |
| `https://docs.expo.dev/build-reference/infrastructure/` | Image list and aliases (E1, FR4) |
| `https://expo.dev/changelog/sdk-58` | Breaking changes: scene template, Strict TS API, RN API removals, NODE_ENV, Node engines |
| `https://docs.expo.dev/versions/v58.0.0/sdk/screen-orientation/#orientation-locks-on-ios-27-and-later` | iOS 27 resizability; orientation becomes a preference |
| `https://expo.fyi/ios-scene-lifecycle` | Scene migration guide (only needed if AppDelegate is customised; it isn't, because this is a CNG project) |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `package.json`, `package-lock.json` | modify | SDK 58 line (FR2); `version` 1.3.0 (FR3); `expo.install.exclude` cleanup |
| `patches/*` | modify/delete | Re-target or retire any patch whose package moved (FR2) |
| `app.json` | modify | Drop `enableSceneSupport` (and the empty plugin entry), `version` 1.3.0, next `buildNumber` (FR3) |
| `eas.json` | modify | `build.production.ios.image` pin (FR4) |
| `.github/workflows/test.yml` | modify | `node-version: '22'` in both jobs (FR5) |
| `docs/RELEASING.md` | modify | Image-bump step, local-build rule, IPA `DT*` check (FR4/FR6) |
| `__tests__/config/app-config.test.ts` | modify | Delete spec 08's FR4 "exactly one `expo-build-properties` tuple deep-equal `{ ios: { enableSceneSupport: true } }`" case. Add spec 09 guards: scene config, version, tablet/fullscreen, image pin, CI Node (FR3/FR4/FR5) |
| `__tests__/config/sdk-migration.test.ts` | modify | Created by spec 08. Rewrite its FR1 SDK 57 windows as SDK 58 floors (`expo` major ≥ 58, RN `0.N` with N ≥ 88, `expo-widgets` major = `expo` major). Replace the `expo-build-properties` [57.0.20, 58.0.0) window with the dependency-iff-plugin invariant. Replace "exclude contains `expo-widgets`" with "if and only if its patch exists". Keep the react-navigation, vector-icons and jest-preset guards (FR2) |
| `__tests__/config/deps.test.ts` | modify | Existing spec 06 patch guard; `install.exclude` assertion matches the new list; spec 08's FR5 expo-widgets patch-shape cases follow the regenerated or deleted patch (FR2) |
| `__tests__/config/app-config-introspect.test.ts` | modify | Add `sdkVersion` major 58 and `UIRequiresFullScreen === false` to spec 03's resolved-config suite (FR3) |
| `__tests__/config/fingerprint-config.test.ts` | keep green (modify only if `@expo/fingerprint` renamed a `SourceSkips` member) | Spec 04 guard; SDK 58 bumps `@expo/fingerprint` 0.16 → 0.21 (FR2) |
| `app/(tabs)/_layout.tsx` | modify | `expo-router/native-tabs` import (FR2) |
| `app/(tabs)/__tests__/native-tabs.test.tsx` | modify | SC2.1/SC4.1 assert the new path (FR2) |
| `app/**`, `src/**`, `components/**` | modify (as found) | Strict TS API, RNGH 3 typing, resizability fixes (FR5/FR6) |
| `src/components/__tests__/*`, `__tests__/components/*` | modify (as found) | Regression tests for layout fixes (FR6) |
| `TECH_STACK.md`, `CLAUDE.md` | modify | Versions and Node requirement (FR5) |

### Interface Contracts

| Item | Contract | Source |
|------|----------|--------|
| `package.json` `dependencies.expo` | `~58.0.N` (major ≥ 58 in tests) | FR2; `npm view expo versions` |
| lockfile `node_modules/expo` | `/^58\.\d+\.\d+$/` | FR2 |
| `react-native` | `0.88.x` | `expo@58.0.16` `bundledNativeModules.json` |
| `expo-widgets` (lockfile) | major ≥ 58 and equal to the `expo` major | `bundledNativeModules.json` (`~58.0.21`) |
| `expo-build-properties` | in `dependencies` only if an `app.json` plugin entry names it (normally absent after FR3); if present, same major as `expo` | FR3 |
| `expo.install.exclude` | contains `expo-widgets` if and only if `patches/expo-widgets+*.patch` exists | spec 06 rule; FR2 |
| `app.json` `expo.plugins` | no `enableSceneSupport` anywhere | `expo-build-properties@58.0.11` `iosSceneSupport.js` (no-op + warning at SDK ≥ 58) |
| `app.json` `expo.ios.infoPlist.UIApplicationSceneManifest` | absent | SDK 58 template owns it |
| `app.json` `expo.version` / `package.json` `version` | `1.3.0`, equal | FEATURE release plan; spec 04 |
| `app.json` `expo.ios.buildNumber` | next unused integer string | spec 05 rule |
| `app.json` `expo.ios.supportsTablet` / `requireFullScreen` | `true` / not `true` | Decision 3; SDK 58 changelog |
| `eas.json` `build.production.ios.image` | full name matching `/^macos-[a-z]+-\d+(\.\d+)*-xcode-27(\.\d+)+$/`; 2026-10-19 value `macos-tahoe-26.6-xcode-27.1` | EAS infrastructure page |
| `test.yml` `node-version` | `'22'` (all jobs) | `expo@58` / `react-native@0.88.0` `engines.node` |
| Prebuilt `Info.plist` scene delegate | `$(PRODUCT_MODULE_NAME).SceneDelegate` | `expo-template-bare-minimum@58.0.25` |
| Prebuilt `SceneDelegate.swift` | `class SceneDelegate: ExpoAppSceneDelegate` | same template |
| IPA `Info.plist` | `DTSDKName` `iphoneos27*`, `DTSDKBuild` `24*`, `DTXcode` `27*`, `CFBundleShortVersionString` `1.3.0` | Local Xcode 27.0 SDK build `24A430` |
| ASC `buildBundles[].attributes.sdkBuild` (optional) | starts with `24` | spec-research contract, now secondary |

### Data Flow

```
FR1 gate (EAS docs + npm + changelog + repo state) ──fail──► STOP (Session Notes only)
        │ pass
        ▼
npx expo install expo@^58 --fix ─► package.json / lockfile / patches  (FR2)
        ▼
app.json (no enableSceneSupport, 1.3.0, next build) ─► expo prebuild (CNG)
        ─► ios/Hourglassxo/{SceneDelegate.swift, AppDelegate.swift, Info.plist, PrivacyInfo.xcprivacy}  (FR3)
        ▼
eas.json production.ios.image = macos-…-xcode-27.x ─► EAS cloud worker (Xcode 27, Node 22)  (FR4)
        ▼
IPA (DTSDKName iphoneos27.x, DTSDKBuild 24…) ─► eas submit ─► ASC ─► TestFlight (iOS 27 iPhone + iPad)  (FR6)
        ▼
fingerprint changes ─► new OTA runtime for 1.3.x; 1.2.x hotfixes only from release/1.2
```

### Test Plan

All jest tests are static and need no mocks. Most read files with `fs`; spec 03's introspect suite also runs the local Expo CLI. Run them with `npx jest __tests__/config "app/(tabs)/__tests__/native-tabs.test.tsx"`. The red/green column describes the expected state on the spec-08 tree (SDK 57) before implementation.

Spec 08 left SDK-57-pinned cases in `sdk-migration.test.ts` (FR1 windows) and `app-config.test.ts` (FR4 tuple). Both are green on the spec-08 tree and go red as soon as FR2/FR3 land. This spec rewrites or deletes each one (rows below), so FR5's "`npm test` exits 0" stays reachable.

| FR | Test file | Assertion | Red before impl? |
|----|-----------|-----------|------------------|
| FR1 | none (external, network-dependent) | Gate command outputs in Session Notes | n/a |
| FR2 | `__tests__/config/sdk-migration.test.ts` | Rewrites spec 08's `expo` [57.0.23, 58.0.0) window: `dependencies.expo` major ≥ 58 (strip leading `~`/`^`), and lockfile `packages["node_modules/expo"].version` matches `/^\d+\.\d+\.\d+$/` (no prerelease) with major ≥ 58 | red |
| FR2 | `__tests__/config/sdk-migration.test.ts` | Rewrites spec 08's `/^0\.86\.\d+$/` case: `dependencies["react-native"]` and the lockfile version are `0.N.x` with N ≥ 88 | red |
| FR2 | `__tests__/config/sdk-migration.test.ts` | Rewrites spec 08's `/^57\.\d+\.\d+$/` `expo-widgets` case: lockfile major ≥ 58 and equal to the lockfile `expo` major; the declared spec has the same major | red |
| FR2 | `__tests__/config/sdk-migration.test.ts` | Replaces spec 08's `expo-build-properties` [57.0.20, 58.0.0) window: in `dependencies` if and only if an `app.json` plugin entry names it; if present, lockfile major equals the `expo` major | green (guard) |
| FR2 | `__tests__/config/sdk-migration.test.ts` | Replaces spec 08's "`expo.install.exclude` contains `expo-widgets`": contains it if and only if `patches/expo-widgets+*.patch` exists | green (guard) |
| FR2 | `__tests__/config/sdk-migration.test.ts` | Spec 08's remaining cases unchanged: no `@react-navigation/*` or `@expo/vector-icons` (deps and source walk), `haptic-tab.tsx` absent, both `@react-native-vector-icons/*` present, glyphmap keys. `@react-native/jest-preset` is in devDependencies with the same `0.N` minor as `react-native` | green (guard) |
| FR2 | `__tests__/config/deps.test.ts` | existing spec 06 patch/version alignment for every `patches/*` | green (guard) |
| FR2 | `__tests__/config/deps.test.ts` | the `expo.install.exclude` assertion matches the post-upgrade list, and every entry is a direct dependency | red only if the list changes |
| FR2 | `__tests__/config/deps.test.ts` | spec 08's FR5 `expo-widgets` patch-shape cases (count, size, `diff --git` paths, marker strings) match the patch as it is after FR2 | green (guard); rewrite in the same commit if FR2 regenerates or deletes the patch |
| FR2 | `__tests__/config/fingerprint-config.test.ts` | spec 04 `sourceSkips` names are valid members of the installed `@expo/fingerprint` `SourceSkips` | green (guard) |
| FR2 | `app/(tabs)/__tests__/native-tabs.test.tsx` | SC2.1 / SC4.1: source contains `expo-router/native-tabs` and doesn't contain `unstable-native-tabs` | red |
| FR3 | `__tests__/config/app-config.test.ts` | `JSON.stringify(expo.plugins)` doesn't contain `enableSceneSupport`. This replaces spec 08's FR4 case (exactly one `expo-build-properties` tuple whose `[1]` deep-equals `{ ios: { enableSceneSupport: true } }`), which is deleted | red |
| FR3 | `__tests__/config/app-config.test.ts` | Spec 08's remaining FR4 guards: no bare-string `'expo-build-properties'` entry, and no `ios.deploymentTarget` in any `expo-build-properties` options | green (guard) |
| FR3 | `__tests__/config/app-config.test.ts` | `expo.ios.infoPlist.UIApplicationSceneManifest` is undefined | green (guard) |
| FR3 | `__tests__/config/app-config.test.ts` | `expo.version` semver ≥ 1.3.0 (range, not equality, so later bumps don't break it) and equals `package.json` version | red |
| FR3 | `__tests__/config/app-config.test.ts` | `ios.supportsTablet === true`, `ios.requireFullScreen !== true` | green (guard) |
| FR3 | `__tests__/config/app-config-introspect.test.ts` | resolved `sdkVersion` major === 58, and `ios.infoPlist.UIRequiresFullScreen === false` | red |
| FR3 | `__tests__/config/app-config-introspect.test.ts` | spec 03's existing assertions (UIBackgroundModes, Face ID, privacy manifest, widget app-group guard) | green (guard) |
| FR4 | `__tests__/config/app-config.test.ts` | `eas.build.production.ios.image` matches the full-name regex and isn't one of `auto`/`default`/`latest`/`sdk-58` | red |
| FR5 | `__tests__/config/app-config.test.ts` | every `/node-version:\s*['"]?(\d+)/g` match in `test.yml` is ≥ 22, with ≥ 1 match | red (unless spec 08 already bumped it) |
| FR5 | `__tests__/config/app-config.test.ts` | `test.yml` contains `npm run typecheck` and `npm run lint` | green (guard) |
| FR5 | full suite via CI | `npm test`, `npm run typecheck`, `npm run lint` exit 0 | n/a |
| FR6 | component test files (as found) | `onLayout` fired with width A then B → chart width prop equals B | written per fix |
| FR6 | manual/commands | IPA `DT*` keys; fingerprint determinism (`runtimeversion:resolve --platform ios` against `eas build:list` `runtimeVersion`); TestFlight smoke; resizability matrix | n/a |

Command checks (these go in the checklist): FR1 gate commands; `npx expo install --check`; `npx expo-doctor`; `npm ci` patch output; scratch `expo prebuild -p ios --clean --no-install`; `npx expo config --type introspect --json`; the EAS build log; IPA `plutil` extraction; the fingerprint determinism check.

### Edge Cases

| Case | Handling |
|------|----------|
| Any FR1 check fails | STOP. Write SPEC BLOCKED in Session Notes. Change no other file. Re-run FR1 later. |
| Spec 08 slips past early Feb 2027 | Escalate to the user. Since 58 and the Xcode 27 images already exist, one option is to merge 08 and 09 into a direct 55 → 58 upgrade, which removes the `enableSceneSupport` step. That's a plan change, so don't do it silently. |
| The `sdk-58` alias image is an Xcode beta at execution time | Use FR4 rule 2: the newest non-beta `*-xcode-27.*` image. |
| The pinned RC image's Xcode later goes GA, or the image is renamed or retired | Re-run the E1 command before each store build. If the pinned name has disappeared, bump the pin following the same rule, and the RELEASING.md step covers it from then on. |
| A store build runs with `eas build --local` | `image` is ignored. Refuse unless `xcodebuild -version` matches the pinned image (version and build). The FR6 IPA check catches a wrong SDK either way. |
| `expo.install.exclude` still lists `expo-widgets` | `--fix` skips it silently. Install the SDK 58 range explicitly (FR2), then re-run `--check`. |
| A patch no longer matches its package version | `deps.test.ts` fails, and `npm ci` fails because of `--error-on-fail`. Rebase the patch or delete it if it's obsolete (FR2). |
| expo-widgets 58 renames or drops the `ExpoWidgetsAppGroupIdentifier` Info.plist key | Spec 03's introspect non-vacuity guard fails. Confirm the new key from the expo-widgets 58 config plugin source, then update the guard to that key. Don't delete it. Re-check the widget app-group in the FR6 smoke. |
| `@expo/fingerprint` 0.21 renames a `SourceSkips` member | Spec 04's `fingerprint-config.test.ts` fails. Update `fingerprint.config.js` and the test's expected names to the new member name. Then run the FR6 determinism check, following spec 04 FR2/FR4: at the build's `gitCommitHash`, `npx expo-updates runtimeversion:resolve --platform ios` must equal the build's `runtimeVersion` from `eas build:list --platform ios --status finished --channel production --app-build-version <FR3 build> --limit 1 --json --non-interactive`. Alternatively, `eas fingerprint:compare --build-id <id> --environment production` must report no differing source. Don't use `npx expo-fingerprint` (npm 404) or the bare `fingerprint` bin, which hashes both platforms and never equals the iOS runtime. |
| `npm test` fails on a spec 08 assertion pinned to SDK 57 that isn't listed in the Test Plan | Rewrite it to the SDK 58 equivalent as a floor, not a window. Delete it only if what it guards no longer exists (as with the `enableSceneSupport` tuple), and record which case and why in Session Notes. |
| victory-native or RNGH API changes are invisible to jest (module mocks) | Typecheck is the compile-time guard; the FR6 chart pass, scrub and swipe are the runtime guard. |
| The Strict TS API produces a large error count | Up to 60: fix them. Above 60: the temporary opt-out is allowed with a recorded follow-up (FR5). |
| CI still on Node 20 | `npm ci` warns `EBADENGINE`, and `expo lint` may refuse to run. FR5 bumps both jobs to 22. |
| ASC API returns 403 (`REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`) | The FR6 primary check is the IPA plist, so no API is needed. `eas submit` stays blocked until the Account Holder accepts the agreement (spec 05 dependency). |
| The fingerprint changes (a native upgrade) | 1.2.x installs stop receiving OTA from the 1.3 tree. Ship 1.2.x hotfixes from `release/1.2` (same pattern as spec 08 edge case 1). |
| NativeWind `className` styles vanish under the new Metro | Visible in the FR6 smoke as unstyled layout. Revisit the `metro.config.js` workaround (`forceWriteFileSystem`, jsx-runtime redirect). The NativeWind smoke test was deleted in spec 07, so the device is the only check. |
| expo-widgets 58 adds Android widgets that collide with `react-native-android-widget` (same `HourglassWidget` name) | Android is out of scope. iOS prebuild isn't affected. If `npx expo prebuild -p android` is ever run and conflicts, record it as a follow-up. |
| SDK 58 forces `NODE_ENV=production` on EAS for `expo config` / `prebuild` / `expo-doctor` | The app reads only `EXPO_PUBLIC_PING_SERVER_URL` (with a hard-coded fallback) and `EXPO_PUBLIC_DEV_USERNAME` (dev-only). Confirm in the smoke that sign-in registers with the relay (server `/health` count goes up). |
| A layout bug only reproduces on device | Fix it, and attach a before/after screenshot pair in place of a jest test (FR6). |

---

## Dependencies

### Internal
- **08-expo-sdk-57-scenes** merged: SDK 57.0.≥23, `enableSceneSupport: true`, patches rebased or retired for 57, and `__tests__/config/sdk-migration.test.ts`. FR2 and FR3 rewrite its SDK 57 tests.
- **07-ci-typecheck-lint** merged: `typecheck` and `lint` scripts, and the CI gates.
- **06-dependency-hygiene** merged: `__tests__/config/deps.test.ts`, `--error-on-fail`, and `expo.install.exclude`.
- **03 / 04 / 05** merged: `__tests__/config/app-config.test.ts`, fingerprint `runtimeVersion`, `docs/RELEASING.md`, and the smoke checklist.

### External
- Expo SDK 58 stable on npm. Met 2026-10-19: `latest` = 58.0.16.
- An EAS Xcode 27 image. Met 2026-10-19: `macos-tahoe-26.6-xcode-27.1` (sdk-58, RC) and `macos-tahoe-26.6-xcode-27.0` (GA).
- App Store Connect accepts uploads built with Xcode 27.x GA/RC, and the ASC agreement has been accepted (see Out of Scope #9).
- An iOS 27 iPhone and an iOS 27 iPad for TestFlight; macOS 27 for iPhone Mirroring (the local Mac is on 27.0.1).

### Assumptions
- Apple's iOS 27 SDK upload requirement takes effect in April 2027 (OPS dated reminder: re-check in early Feb 2027).
- The project stays CNG: `ios/` is gitignored and AppDelegate isn't customised. The scene migration guide applies only if that changes.
- The `onLayout`-driven chart sizing (13 handlers) and the two `useWindowDimensions` consumers re-measure on window resize. FR6 checks this assumption on device.
