# Implementation Checklist

Spec: `10-sdk-58-ios-27`
Feature: `store-compliance`

**Phases:**
- **Phase A:** SDK 55, FR1–FR3, ending at **checkpoint A**: three gates green, nothing native changed.
- **Phase B:** SDK 58, FR4–FR8. **Checkpoint B** (dev build boots on device) comes at the end of FR4.
- **Phase C:** FR9 local prebuild inspection (**checkpoint C**), then FR10 docs.
- **Phase D:** FR11, from build 19 to "ready to submit" (**checkpoint D**), including the TestFlight smoke.

**Ground rules (every phase):**
- Work only in `/Users/Trilogy/Documents/Claude Code/hg-worktrees/sdk58` on `feat/sdk-58`. Never touch `WS/hourglassws`: its Metro is on port 8081, so this worktree uses `--port 8082`.
- EAS **cloud** builds only. Never run `eas build --local`, and never archive or export locally.
- Never run `eas update --channel production` from this branch.
- `main` stays at `aade79b` until build 18's review is resolved **and** checkpoint D passes.
- Never submit to App Review. Stop at "ready to submit" (J's call).
- Never use `--legacy-peer-deps` or `--force`.

**Owner tags:** **(C)** Claude, **(J)** Jaime.

---

## Phase A.0: Test Foundation (SDK 55)

### FR1: Hotfix lane and dependency guards
- [ ] (C) Pre-flight: `git status --porcelain` is empty, `git rev-parse HEAD` is `aade79b` (or this spec's commit on top of it), and `node --version` is ≥ 22.13. Record `npm test`, `npm run typecheck` and `npm run lint` baselines (pass counts, exit codes).
- [ ] (C) `git cherry-pick 962d413`. That brings `__tests__/config/deps.test.ts` (red).
- [ ] (C) Edit `deps.test.ts`:
  - Delete the `FR5: refreshed to the latest SDK 55 patch line` describe.
  - Rewrite FR4 as "contains X iff `patches/X+*.patch` exists" plus "every entry is a direct dependency". An absent list is allowed when there are no patches.
  - Add "`react-native-inner-shadow` is in neither `dependencies` nor `devDependencies`".
- [ ] (C) `npx jest __tests__/config/deps.test.ts`. Expect red on rule 3 (`^55.0.5`), `--error-on-fail`, `@expo/ngrok`, the exclude, and inner-shadow. The fixture and unit cases stay green. Record the counts.

### FR2: Forward-compatible navigation, dead code and Skia
- [ ] (C) Create `__tests__/config/sdk58-migration.test.ts` with the FR2 cases: no `useIsFocused` from `@react-navigation/native`, no `Skia.Path.Make()`, no `.copy().trim(`, and `components/haptic-tab.tsx` absent.
- [ ] (C) `ScrubCursor.test.ts`: assert the `MakeFromSVGString` argument for `(scrubX=40, chartHeight=120, topPadding=8)` is `M 40 8 L 40 112`. Remove the `moveTo`/`lineTo` assertions.
- [ ] (C) `AIArcHero*.test.tsx`: assert the fill `Path` gets `start={0}` and an `end` that is the sweep shared value.
- [ ] (C) Run them. All red. Record.

### FR3: `expo/fetch` readiness
- [ ] (C) Add `makeExpoLikeResponse({ status, body, headers })` to a shared test helper. A second `text()`/`json()` call throws `TypeError("Failed to execute 'text' on 'Response': Response body is already used.")`.
- [ ] (C) Tests in `src/__tests__/api/client.test.ts` and `__tests__/client.test.ts`:
  - Every path (mint OK and error, GET and PUT, each with and without the `creds` retry) passes with the helper.
  - 200 empty, 204 empty and 200 `{}` bodies, for GET and PUT.
  - A 200 `text/html` body → `ApiError` with `statusCode` 200.
  - `class FetchError extends Error {}` rejection → `NetworkError` with the message preserved.
- [ ] (C) `src/__tests__/lib/pushToken.test.ts`: `registerPushToken` never calls `text()` or `json()` on the response.
- [ ] (C) `sdk58-migration.test.ts`: no `_bodyInit|_bodyText|_bodyBlob` in source.
- [ ] (C) Run them. The non-JSON → `ApiError` case is red; record any others.

## Test Design Validation (MANDATORY), Phase A

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run the `red-phase-test-validator` agent on `deps.test.ts`, `sdk58-migration.test.ts`, the ScrubCursor and AIArcHero tests, and the client tests.
- [ ] Every FR1–FR3 success criterion has a test, or a recorded command check.
- [ ] The source-walk tests can't pass vacuously. Each one asserts that the walk visited at least 50 files and found the known-good sites (e.g. `app/_layout.tsx`).
- [ ] `makeExpoLikeResponse` really throws on a second read: a self-test calls `text()` twice and expects the `TypeError`.
- [ ] Fix any issues before proceeding.

---

## Phase A.1: Implementation (SDK 55)

### FR1
- [ ] (C) `git tag build-18 aade79b && git branch release/1.1 aade79b && git push origin build-18 release/1.1`. Record `git rev-parse build-18 release/1.1`.
- [ ] (C) `git cherry-pick 962d413 96035ea`. Resolve the `package.json` conflict by hand, keeping `typecheck`/`lint` and adding the strict `postinstall`. Regenerate the lockfile with `npm install` instead of resolving it by hand.
- [ ] (C) Remove `react-native-inner-shadow` (`npm uninstall react-native-inner-shadow`) and `git rm __mocks__/react-native-inner-shadow.ts`.
- [ ] (C) `rm -rf node_modules && npm ci`. Exit 0, both patches listed as applied, no warnings.
- [ ] (C) `npx expo install --check` exits 0. Three gates green. `deps.test.ts` green. Record.

### FR2
- [ ] (C) `useIsFocused` from `'expo-router'` at `FadeInScreen.tsx:18`, `useFocusKey.ts:2` and `useStaggeredEntry.ts:29`. Move the `useIsFocused` stubs in the affected test mocks into each file's existing `expo-router` mock. List the files touched.
- [ ] (C) `git rm components/haptic-tab.tsx src/components/__tests__/HapticTab.test.tsx`.
- [ ] (C) `ScrubCursor.ts` → `MakeFromSVGString`. `AIArcHero.tsx` → `<Path start={0} end={sweepProgress}>`, with the `useDerivedValue` trim removed.
- [ ] (C) Skia mock: add `MakeFromSVGString` and remove `moveTo` from the path stub.
- [ ] (C) FR2 tests green. Three gates green.

### FR3
- [ ] (C) `parseBody`: wrap `JSON.parse` and throw `ApiError(response.status, 'Invalid JSON response body')` on failure. The empty body still returns `undefined`.
- [ ] (C) Fix any path the single-read helper exposes; none is expected.
- [ ] (C) FR3 tests green. Three gates green.

### Checkpoint A
- [ ] (C) Record HEAD, the `npm test`/`typecheck`/`lint` counts and exit codes, and confirm `git diff aade79b -- app.json eas.json` is empty (nothing native changed).

## Phase A.2: Review (MANDATORY)

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` for FR1–FR3.

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` on the Phase A commits.

### Step 2: Address Feedback
- [ ] Fix HIGH/MEDIUM findings, re-run the tests, and record the commits.

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` on the new and modified tests.

### Final Verification
- [ ] Three gates green. No regressions against the pre-flight baseline.

---

## Phase B.0: Test Foundation (SDK 58)

Write these tests against the Phase A tree; they're red there. Put the FR5–FR8 cases in now as well, so the FR4 gate lists them by name as the only allowed failures.

### FR4
- [ ] (C) `deps.test.ts` `SDK 58 line` describe:
  - Floors: `expo` major ≥ 58 with no prerelease; RN `0.N` with N ≥ 88; `expo-widgets` and `@expo/ui` major equal to `expo`'s; reanimated ≥ 4.7.1 and worklets satisfies `0.13.x`; Skia ≥ 2.14.0; victory major ≥ 42.
  - async-storage is exactly `2.2.0`.
  - `react-test-renderer` equals `react`; `@react-native/jest-preset` `0.N` equals RN's.
  - Single copies of `react`, `react-native`, `expo-widgets`, `@expo/ui`, `test-renderer` and `react-native-css-interop`.
  - css-interop equals nativewind's dependency spec.
  - No `@react-navigation/*` and no `patches/*.patch`.
- [ ] (C) `sdk58-migration.test.ts` FR4 cases: no `from '@react-navigation/`, no `unstable-native-tabs`, no root `Tabs` import from `'expo-router'`, no `initialRouteName=`, and `(auth)` `unstable_settings.anchor === 'welcome'`.
- [ ] (C) `native-tabs.test.tsx`: expect `expo-router/native-tabs` and `expo-router/js-tabs`, and the absence of `unstable-native-tabs`.

### FR5
- [ ] (C) `app-config.test.ts` `describe('10-sdk-58-ios-27')`, every case in the spec's Interface Contracts block except `cli.version` (that's FR8).
- [ ] (C) `app-config-introspect.test.ts`: `sdkVersion` starts with `58.`, and `UIRequiresFullScreen === false`.

### FR6
- [ ] (C) `widgetLayoutJs.test.ts`:
  - `props` undefined doesn't throw, for every family.
  - `containerBackground('#0D0D1A','widget')` is on the small, medium and large roots and not on accessories.
  - Every `HStack({`/`VStack({` sets `spacing`.
  - The `env.date` countdown is used.
  - Every called global exists in `jest.requireActual('@expo/ui/swift-ui')` (+ modifiers). This one is red until FR4 installs @expo/ui 58.
- [ ] (C) `__tests__/config/widget-background-plugin.test.ts`: fixture copied verbatim from `expo-widgets@58.0.21` `plugin/src/ios/withWidgetSourceFiles.ts:355-364`. Cases: inserts once, idempotent, throws without the anchor, and app.json plugin order.
- [ ] (C) `deps.test.ts`: `expo.autolinking.android.exclude` contains `expo-widgets`.
- [ ] (C) `bridge.test.ts`/`clearWidgetData.test.ts`: `createWidget` is called with 3 args, the 3rd being the signed-out snapshot.

### FR8
- [ ] (C) `ci-gates.test.ts`: every `node-version` is an even major ≥ 22, and at least one exists.
- [ ] (C) `fingerprint-config.test.ts`: `EXPECTED_SOURCE_SKIPS` is the 7 sorted names.
- [ ] (C) `ota-publish.test.ts`: the guard accepts build JSON with `runtime.version` and with `runtimeVersion`.
- [ ] (C) `app-config.test.ts`: `eas.json` `cli.version` floor is ≥ 25.2.0.

- [ ] (C) Run the whole new set and record the red list by test name. This is the allowed-failure list for the FR4 gate.

## Test Design Validation (MANDATORY), Phase B

- [ ] Run `red-phase-test-validator` on every Phase B.0 test file.
- [ ] Every floor is a floor, not a window: no case fails on SDK 59 just because the number rose.
- [ ] Single-copy checks read lockfile keys (`node_modules/*/node_modules/<pkg>`), not `npm ls` output.
- [ ] The widget-plugin fixture is the real 58.0.21 template text, not paraphrased.
- [ ] `app-config.test.ts` uses typed JSON imports only (spec 03 contract) and reads optional keys with `toHaveProperty`.
- [ ] Fix any issues before proceeding.

---

## Phase B.1: Implementation (SDK 58)

### FR4: dependency line (atomic)
- [ ] (C) `git rm patches/expo-widgets+55.0.5.patch patches/react-native-reanimated+4.2.1.patch`. Remove `expo.install.exclude`, and set `expo-widgets` to `~58.0.21`.
- [ ] (C) `npx expo install expo@~58.0.16`, then `npx expo install --fix`, repeated until `npx expo install --check` exits 0. Record each run's output summary.
- [ ] (C) Set the non-bundled packages and devDependencies to I1. Remove `@react-navigation/native`, `@react-navigation/bottom-tabs` and `@react-navigation/elements`. Record any `--fix` drift against I1.
- [ ] (C) 58-only edits:
  - `app/_layout.tsx:6` → `'expo-router'`.
  - `FloatingPillTabBar.tsx:18` → `'expo-router/js-tabs'`.
  - `app/(tabs)/_layout.tsx:23` → `'expo-router/native-tabs'`; `:24` → `'expo-router/js-tabs'`.
  - `app/(auth)/_layout.tsx`: drop `initialRouteName`, add `export const unstable_settings = { anchor: 'welcome' };`.
- [ ] (C) Optionally run the codemod, then `grep -rn "@react-navigation" app src components hooks constants`. Only allowed in `__tests__`/`__mocks__`, and those are fixed too.
- [ ] (C) Make the two RNTL files `await` `render`/`renderHook`/`rerender`/`unmount`.
- [ ] (C) `jest.config.js`: add `standard-navigation` to the allow-list, and add `/node_modules/react-native-reanimated/plugin/` and `/node_modules/@react-native/babel-preset/` as extra `transformIgnorePatterns` entries.
- [ ] (C) `babel.config.js:19-22`: rewrite the comment (no reanimated-patch reference).
- [ ] (C) Fix typecheck fallout: Strict TS API, TS 6, `jsx: react-jsx`. Record the error count before fixing. If it's over 60, use the escape hatch and record a dated follow-up.
- [ ] (C) `rm -rf node_modules && npm ci`. Exit 0 and `No patch files found`. `npm ls --all 2>&1 | grep -E "invalid|UNMET"` prints nothing.
- [ ] (C) Gates: `npm test` (only the Phase B.0 red-list failures allowed, listed by name), `npm run typecheck` 0, `npm run lint` 0.

### Checkpoint B (device)
- [ ] (C) `eas build -p ios --profile development` on cloud. Record the build id and the image line from "Spin up build environment".
- [ ] (J) Install it on the iOS 27 iPhone. Record the iOS version: ______
- [ ] (C) `npx expo start --dev-client --port 8082` from this worktree. Confirm `lsof -i :8081` still shows the WS server untouched.
- [ ] (J/C) Cold launch → sign in with the QA manager account → Home, Overview, AI and Requests each render. Record pass/fail per tab. A widget placeholder is expected until FR6.

### FR5
- [ ] (C) `app.json`: `version` `1.2.0`, `ios.buildNumber` `"19"` (confirm the next unused number with `node .appstore/asc.js builds` from the main checkout, read-only). No scene, deployment-target or full-screen keys.
- [ ] (C) `package.json` `version` `1.2.0`. `npm install --package-lock-only` updates the lockfile root.
- [ ] (C) `eas.json` `build.production.ios.image = "macos-tahoe-26.6-xcode-27.1"`. Re-check docs.expo.dev/build-reference/infrastructure first and record the row.
- [ ] (C) FR5 tests green. `npx expo config --type introspect --json` values recorded. Three gates green.

### FR6
- [ ] (C) `bridge.ts`: changes (a)–(e), the `requireOptionalNativeModule` import from `'expo'`, and the widened `CreateWidget` type. Move the `jest.mock` in `clearWidgetData.test.ts:31`.
- [ ] (C) Delete the ambient `declare module 'expo-widgets'` block (`src/types/modules.d.ts:50-61`). Fix any call that doesn't match the shipped types.
- [ ] (C) Create `plugins/withHourglassWidgetBackground.js` (I7) and list it in `app.json` immediately before the `expo-widgets` tuple.
- [ ] (C) Add `package.json` `expo.autolinking.android.exclude: ["expo-widgets"]`.
- [ ] (C) `npx expo-modules-autolinking resolve -p android | grep -c expo-widgets` → `0`. `-p apple` → ≥ 1.
- [ ] (C) FR6 tests green. Three gates green.

### FR7: device pass (EAS development build of the FR6 tree)
- [ ] (C) New `eas build -p ios --profile development`. Record the id.
- [ ] (J/C) Device table. Record PASS/FAIL, with a note and a screenshot where useful.

| Area | Check | Result |
|---|---|---|
| Gestures | Approvals swipe-approve and swipe-reject (QA items); the threshold feels like build 18 | |
| Gestures | Overview chart scrub; AI cone scrub; no RootView error on any screen or in the Settings modal | |
| Reanimated | Entry animations (`FadeInScreen`, `useStaggeredEntry`); no `sharedTransitionTag` warning in Metro logs | |
| Skia | `AIArcHero` sweep animates to the right %; `AnimatedMeshBackground` loops; `GlassCard` inner shadow | |
| Victory 42 | `WeeklyBarChart`, `TrendSparkline` + scrub cursor line, `AIConeChart`, `AIRingChart`, `DayPatternChart`, `HourlyPatternCard`, `DailyAIRow` match the build-18 screenshots | |
| NativeWind | `className` layout on Home, Overview, AI, Requests, Settings and the auth screens | |
| Widgets | Small, medium and large added fresh: dark background, no gaps in the footer text runs, data shown | |
| Memory | 10 min of tab switching with charts animating. 1 min: ____ MB; 10 min: ____ MB; ratio ≤ 1.5 | |

- [ ] (C) For each fix: add a regression test (or a before/after screenshot pair), then re-run the three gates.
- [ ] (C) Optional experiment: remove the `metro.config.js` jsx-runtime redirect on a scratch commit, check NativeWind styles, record the result, then **revert**.

### FR8
- [ ] (C) `test.yml`: `node-version: '22'` in both jobs.
- [ ] (C) `fingerprint.config.js`: the 7 names, with the header comment rewritten.
- [ ] (C) `ota-publish.sh`: dual-shape runtime read and tests. Commit, then `git switch release/1.1 && git cherry-pick <sha> && npm ci && npm test && git switch feat/sdk-58`. Push `release/1.1`.
- [ ] (C) `npm i -g eas-cli@latest`. Record `eas --version` (≥ 25.2.0). Set `eas.json` `cli.version` to `">= 25.2.0"`.
- [ ] (C) Run `npx expo-updates runtimeversion:resolve --platform ios` twice on a clean tree. Equal values. Record.
- [ ] (C) Open a **draft** PR `feat/sdk-58` → `main` and confirm CI is green on both jobs. Record the run URL. Don't merge.

## Phase B.2: Review (MANDATORY)

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` for FR4–FR8 against I1–I3 and I6–I9.

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` on the draft PR.

### Step 2: Address Feedback
- [ ] Fix HIGH/MEDIUM findings and re-run the gates.

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` on the Phase B tests.

### Final Verification
- [ ] Three gates green locally and in CI. `npx expo install --check` exits 0. No `patches/*.patch` files.

---

## Phase C: Inspection and Docs

### FR9: local prebuild inspection (checkpoint C)
- [ ] (C) `T=$(mktemp -d) && cp -cR "/Users/Trilogy/Documents/Claude Code/hg-worktrees/sdk58" "$T/app"`. Confirm `$T` has no spaces.
- [ ] (C) `cd "$T/app" && npx expo prebuild --platform ios --clean --no-install 2>&1 | tee "$T/prebuild.log"`. Record every warning. None may mention `enableSceneSupport` or `requireFullScreen`.
- [ ] (C) I4 checks (paste each output):
  - [ ] `plutil -extract UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes raw ios/Hourglassxo/Info.plist` → `false`
  - [ ] `plutil -extract UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0.UISceneDelegateClassName raw ios/Hourglassxo/Info.plist` → `$(PRODUCT_MODULE_NAME).SceneDelegate`
  - [ ] `UILaunchStoryboardName` → `SplashScreen`; `UIBackgroundModes` → only `remote-notification`; no `NSFaceIDUsageDescription`; `UIRequiresFullScreen` → `false`; `UISupportedInterfaceOrientations~ipad` has 4 entries
  - [ ] `grep -n "class SceneDelegate: ExpoAppSceneDelegate" ios/Hourglassxo/SceneDelegate.swift`
  - [ ] `grep -n "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider" ios/Hourglassxo/AppDelegate.swift`
  - [ ] `grep -o "IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*" ios/*.xcodeproj/project.pbxproj | sort -u` shows only values ≥ 16.4; `cat ios/Podfile.properties.json` has no lower target
  - [ ] Both `.entitlements` files list `group.com.jalvarez0907.hourglass.widgets`
  - [ ] `grep -c "1C8F.1" ios/Hourglassxo/PrivacyInfo.xcprivacy` ≥ 1, and the manifest diff against build 18's config is empty
  - [ ] `plutil -extract UIApplicationSceneManifest raw ios/ExpoWidgetsTarget/Info.plist` fails (the key is absent)
  - [ ] `grep -c "WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())" ios/ExpoWidgetsTarget/HourglassWidget.swift` → `1`; the struct is present
- [ ] (C) Optional compile-only check: `cd ios && pod install && xcodebuild -workspace Hourglassxo.xcworkspace -scheme ExpoWidgetsTarget -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`. Record the result, or "skipped". Never archive.
- [ ] (C) In the worktree: `npx expo-doctor` exits 0. Record the check count.
- [ ] (C) The worktree's `runtimeversion:resolve --platform ios` equals the `$T/app` value. Record both.
- [ ] (C) `rm -rf "$T"`.

### FR10: docs
- [ ] (C) Update `TECH_STACK.md`, `CLAUDE.md:69`, `README.md:27,66`, `docs/ARCHITECTURE.md` (§5.7, §7.2, §8.6), `docs/RELEASING.md` ((a)–(e)), `FEATURE.md` and `site/support.html`, per FR10.
- [ ] (C) Run the FR10 success-criteria greps and paste the outputs.
- [ ] (C) `runtimeversion:resolve --platform ios` is unchanged from the FR8 value (docs don't fork the runtime).

## Phase C Review (MANDATORY)
- [ ] `spec-implementation-alignment` for FR9–FR10. Run `pr-review-toolkit:review-pr` on the docs diff and address the findings. Three gates green.

---

## Phase D: Build 19 to "ready to submit" (FR11)

### Gates (all required before the build)
- [ ] (C) Phases A–C complete. Draft PR CI green. HEAD recorded: ______
- [ ] (C) The image row was re-checked today and the pin is unchanged, or the update is recorded.
- [ ] (C) The build number is confirmed unused: ______
- [ ] (J) The ASC agreement is accepted (asc.js read-only call no longer returns 403).

### Build and verify (C)
- [ ] `eas build -p ios --profile production` on cloud. Record the EAS build id: ______, `gitCommitHash` (= HEAD): ______, and the log line naming `macos-tahoe-26.6-xcode-27.1` / Xcode 27.1.
- [ ] `eas build:list --platform ios --status finished --channel production --app-build-version 19 --limit 1 --json --non-interactive` returns that id, and `runtime.version` equals the local resolve: ______
- [ ] IPA (`D=$(mktemp -d)`, download `artifacts.buildUrl`, unzip): `DTSDKName` ______ (iphoneos27*), `DTSDKBuild` ______ (24*), `DTXcode` ______ (27*), `CFBundleShortVersionString` 1.2.0, `CFBundleVersion` 19, `MinimumOSVersion` 16.4. The scene delegate class ends with `.SceneDelegate`. The widget `.appex` Info.plist has no scene manifest.
- [ ] `eas submit -p ios --profile production --id <build id>`: **TestFlight upload only**. Record the ITMS-91053 email result: ______. ASC `sdkBuild` `24…`, or "skipped": ______
- [ ] `eas update:list --branch production --limit 3 --json --non-interactive`. Record whether an automatic embedded-bundle entry appeared (edge case).

### TestFlight smoke (J performs on iOS 27, C records)

iPhone model / iOS: ______ · iPad model / iOS: ______

Spec 05's eight checks:
- [ ] 1. Cold launch, then sign in with the QA manager account.
- [ ] 2. Home hours and earnings load. Overview's Personal/Team toggle works (manager). The Patterns card renders.
- [ ] 3. Approvals: approve one QA item and reject one with a reason. Both succeed with no JSON parse error; these are the empty-body PUTs.
- [ ] 4. Settings → About: Privacy Policy and Support open in the in-app browser and dismiss cleanly. The version row reads `Version 1.2.0 (19)` and `Update: embedded`.
- [ ] 5. Widgets: add small, medium and large. Each shows data on a dark background with no "adopt containerBackground" placeholder, and tapping one opens the app.
- [ ] 6. Widget refresh on open: after check 3, opening the app updates the widget.
- [ ] 7. A local deadline notification fires. Tapping it opens the app; there's no deep routing (Out of Scope 5).
- [ ] 8. Sign Out clears the data. The widgets show the empty signed-out view, and `curl -s <relay>/health` `tokenCount` drops by 1 against a reading taken just before.

Lifecycle, network and widget additions:
- [ ] 9. **Foreground refresh:** background for ≥ 60 s, change data in QA (e.g. approve an item on the web), then foreground. The change shows within 10 s. This proves the AppState hooks still fire under scenes.
- [ ] 10. **Notification tap from a killed state:** force-quit, wait for or trigger a deadline notification, then tap it. The app cold-launches to the tabs with data, with no blank screen or crash.
- [ ] 11. **Widget tap from a killed state:** force-quit, then tap the widget. The app opens.
- [ ] 12. **Deep link:** type `hourglassws://overview` in Safari while the app is running (warm) → the Overview tab. Force-quit and repeat (cold) → the Overview tab.
- [ ] 13. **401 path:** sign out, then onboard with a wrong password. You get the auth-error message, not a crash or parse error.
- [ ] 14. **Relay register:** after sign-in, the relay `/health` `tokenCount` rises by 1 (NODE_ENV / `.env` check).
- [ ] 15. **Sign-out clears the log:** before sign-out, Settings → Debug Log → **Share log** exports a non-empty file. After sign-out and sign-in, **Share log** contains no entries from before the sign-out. This also proves `expo-file-system/legacy` and `expo-sharing` 58 work.
- [ ] 16. **Widget gallery preview:** the long-press → Edit → add-widget gallery shows the Hourglass previews with no red box and no placeholder.
- [ ] 17. **Update without opening:**
  - Install build 18 from TestFlight, sign in, and add all three widget sizes.
  - Install build 19 from TestFlight **without opening it**, and wait ≥ 5 min.
  - The widgets still render on a dark background, with no "adopt containerBackground" placeholder.
  - Then open 1.2.0 once; the widgets refresh.
- [ ] 18. **Countdown honesty:** with the app closed for ≥ 1 h, the widget's "Due in …" label has advanced to match the clock (the `env.date` fix).
- [ ] 19. **Memory, 10 minutes:** tab switching with charts animating. Use Instruments → Activity Monitor on the TestFlight build if Xcode 27 allows it; otherwise record "dev-build only" and cite the FR7 numbers. 1 min ____ MB / 10 min ____ MB, ratio ≤ 1.5, no jetsam.
- [ ] 20. **Visual parity:** NativeWind layout, every chart and the NativeTabs glass pill match the build-18 screenshots. The Settings modal header looks right under the iOS 26+ system bar appearance.

Resizability matrix (iPad: Split View ⅓ · ½ · ⅔, Slide Over, Stage Manager narrow → wide, portrait ↔ landscape. iPhone: resize the iPhone Mirroring window on macOS 27). Each cell passes when there's no clipping or overlap, every chart re-measures within one resize, the Overview sticky bar still triggers, `AnimatedMeshBackground` fills the window, the swipe threshold scales, the tab bar stays reachable, and nothing crashes.

| Screen | ⅓ | ½ | ⅔ | Slide Over | Stage Mgr | Rotate | iPhone Mirroring |
|---|---|---|---|---|---|---|---|
| Home | | | | | | | |
| Overview (manager) | | | | | | | |
| Overview (contributor) | | | | | | | |
| AI | | | | | | | |
| Requests (swipe) | | | | | | | |
| Settings modal | | | | | | | |

- [ ] (C) For each failure: fix it on `feat/sdk-58`, add a regression test or a screenshot pair, take the next build number (20), and repeat Phase D. Never submit a build that has a failing smoke item.

### ASC prep for 1.2.0 (C, `.appstore/asc.js` in the main checkout; each live write preceded by its `--dry-run` transcript)
- [ ] `create-version 1.2.0` (phased `INACTIVE`, `AFTER_APPROVAL`), or "blocked: <reason>" if 1.1.0's review state prevents it.
- [ ] `set-whats-new` (includes "Requires iOS 16.4 or later.") · `attach-build <19 id>` · confirm `socialMedia false` in `check-submission`.
- [ ] `submit-app-review <19 id> --dry-run` transcript only. **No live submission.**

### Stop point
- [ ] (C) Every smoke item and matrix cell is PASS (or "blocked: no device", with J informed). Mark **"ready to submit"** here: ______
- [ ] (J) Decides whether and when to submit. That's outside implementation.

## Phase D Review (MANDATORY)
- [ ] `spec-implementation-alignment` for FR11. Every recorded value matches I5. No `POST /reviewSubmissions` in the `ASC_TRACE` output.

---

## Session Notes

**2026-10-20**: Spec created. The research pass is recorded in `spec-research.md` (tarballs in `/tmp/spec10.o6hmwI`, ephemeral). Supersedes specs 08 and 09. Decisions 3 (icons), 4 (test renderer) and 5 (native widget fallback) are chosen defaults awaiting the user's confirmation. Nothing implemented yet.
