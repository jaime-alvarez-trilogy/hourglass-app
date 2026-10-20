# Implementation Checklist

Spec: `08-expo-sdk-57-scenes`
Feature: `store-compliance`
Branch: `feat/sdk-57`. Ships as **v1.2.0**, not in build 18 or build 19.

---

## Pre-implementation: start gate (STOP if any item fails)

- [ ] Specs **06** and **07** are merged to `main`, and build 19 (spec 06) has shipped. On `main`: `npm test`, `npm run typecheck` and `npm run lint` each exit 0. `__tests__/config/app-config.test.ts` (spec 03) and `__tests__/config/deps.test.ts` (spec 06) exist, and `package.json` has `expo.install.exclude` containing `"expo-widgets"`. If anything is missing: **STOP**, blocked by 06/07.
- [ ] Re-verify the registry floors (record the outputs in Session Notes):
  - [ ] `npm view expo@57 version | tail -1` gives ≥ `57.0.23` (57.0.30 on 2026-10-19)
  - [ ] `npm view expo-build-properties@57 version | tail -1` gives ≥ `57.0.20` (57.0.22 on 2026-10-19)
  - [ ] `npm view expo-widgets@sdk-57 version` gives the version to pin (57.0.26 on 2026-10-19)
  - [ ] Tarball grep in a fresh empty dir; don't run anything from it: `D=$(mktemp -d /tmp/ebp-verify-XXXXXX) && (cd "$D" && npm pack expo-build-properties@sdk-57 --silent >/dev/null && tar -xzOf expo-build-properties-*.tgz | grep -c enableSceneSupport)` prints a count > 0. Also `tar -xzOf "$D"/expo-build-properties-*.tgz package/src/iosSceneSupport.ts | grep MINIMUM_EXPO_VERSION` shows `'57.0.23'` (or lower)
- [ ] **Retarget decision:** check expo.dev/changelog for SDK 58 status and docs.expo.dev/build-reference/infrastructure/ for `*-xcode-27.*` images. On 2026-10-19 both exist (`expo@latest` 58.0.16; `macos-tahoe-26.6-xcode-27.0`, `…-27.1` RC). That means spec 09's triggers are met. **Ask Jaime:** proceed with SDK 57 (this spec), or retarget to SDK 58 (fold into spec 09)? Record the decision and date in Session Notes. **Don't start without it.**
- [ ] Baseline on `main`: record the `npm test` pass/fail counts and confirm typecheck and lint are 0 errors (CLAUDE.md no-break ritual).
- [ ] `git checkout -b feat/sdk-57`.
- [ ] Create the hotfix lane: `git branch release/1.1 <commit of last shipped 1.1.x build>`, then `git push -u origin release/1.1` (FR7).

---

## Phase 1.0: Test Foundation (write first; red until the matching implementation lands)

### FR1: SDK 57 dependency baseline
- [ ] Create `__tests__/config/sdk-migration.test.ts` with a local numeric semver compare helper (no new dependency) and a lockfile reader (`packages["node_modules/<name>"].version`).
- [ ] Test: lockfile `expo` ≥ 57.0.23 and < 58.0.0.
- [ ] Test: lockfile `expo-build-properties` ≥ 57.0.20 and < 58.0.0.
- [ ] Test: lockfile `react-native` matches `/^0\.86\.\d+$/`.
- [ ] Test: lockfile `react-native-worklets` matches `/^0\.10\.\d+$/` (replaces spec 06's `0.7.x` case; reanimated 4.5.1 peers `0.10.x`).
- [ ] Test: `dependencies["expo-widgets"]` matches `/^57\.\d+\.\d+$/` and equals the lockfile version. `expo.install.exclude` contains `"expo-widgets"`.
- [ ] Test: no `@react-navigation/*` key and no `@expo/vector-icons` in `dependencies`/`devDependencies`. `@react-native/jest-preset` is in `devDependencies`. `@react-native-vector-icons/ionicons` and `…/material-icons` are in `dependencies`.

### FR1: retire spec 06's SDK 55 pins in `__tests__/config/deps.test.ts` (do this before hop 1)
Find the cases by content if spec 06's implementation named them differently.
- [ ] Replace `dependencies['expo-widgets'] === '55.0.5'` with: exactly one `patches/expo-widgets+*.patch` parses via `getPackageDetailsFromPatchFilename`, and `dependencies['expo-widgets']` equals its `version`.
- [ ] Replace the `SDK 55 patch line` describe with `SDK line consistency`:
  - [ ] keep the `versionAtLeast` unit checks unchanged
  - [ ] lockfile `expo-notifications`, `expo-updates` and `jest-expo` each have the same major as lockfile `expo`
  - [ ] delete the `expo` (`55.`, ≥ 55.0.31), `react-native` (`0.83.`, ≥ 0.83.10), `react-native-worklets` (`0.7.`, ≥ 0.7.4) and the `expo-notifications`/`expo-updates`/`jest-expo` 55.x floor cases (the SDK 57 floors are in `sdk-migration.test.ts`)
- [ ] Leave these unchanged: patch discovery/parse, real-data `collectPatchProblems` equals `[]`, every fixture case (synthetic `55.0.x` literals stay), postinstall, `patch-package` devDependency, both ngrok cases, both `expo.install.exclude` cases.
- [ ] `npx jest __tests__/config/deps.test.ts` on the current tree: every case except the new FR5 patch-content ones passes (the rewrites are green on SDK 55). `grep -n "SDK 55 patch line" __tests__/config/deps.test.ts` prints nothing.

### FR2: Navigation imports → expo-router
- [ ] Test (same file): recursively read `.ts/.tsx/.js/.jsx` under `app`, `src`, `components`, `hooks`, `constants`, `__tests__`, `__mocks__` (skip `node_modules` and the test file itself). No file contains `'@react-' + 'navigation/'` (needle built by concatenation).
- [ ] Test: `components/haptic-tab.tsx` doesn't exist.
- [ ] Rewrite the source assertions so they expect the new paths (red until FR2 lands):
  - [ ] `src/components/__tests__/FloatingPillTabBar.test.ts:310-314` expects `from 'expo-router/js-tabs'` (rename the `it(...)` title too)
  - [ ] `src/hooks/__tests__/useStaggeredEntry.test.ts:132-135` expects `useIsFocused` imported from `'expo-router'` (rename the `it(...)` title too)
  - [ ] `app/(tabs)/__tests__/native-tabs.test.tsx:86-87` and `:213-214` expect `Tabs` from `'expo-router/js-tabs'`

### FR3: Icon imports → @react-native-vector-icons
- [ ] Test (same file): no file in the same walk contains `'@expo/' + 'vector-icons'`. No `@react-native-vector-icons/*/static` import. `app.json` plugins contain no `@react-native-vector-icons/` entry.
- [ ] Test: `checkmark-circle`, `close-circle` and `time-outline` are keys in `node_modules/@react-native-vector-icons/ionicons/glyphmaps/Ionicons.json`. Every value of `MAPPING` in `components/ui/icon-symbol.tsx` (regex-parsed) is a key in `…/material-icons/glyphmaps/MaterialIcons.json`.
- [ ] Rewrite `src/components/__tests__/FloatingPillTabBar.test.ts:105-108` to expect `import MaterialIcons from '@react-native-vector-icons/material-icons'`. Leave `:129-141` (`bar_chart` etc.) untouched (Out of Scope 4).

### FR4: Scene lifecycle config
- [ ] Extend `__tests__/config/app-config.test.ts`: exactly one plugin entry with `[0] === 'expo-build-properties'`; it's an array; `[1]` deep-equals `{ ios: { enableSceneSupport: true } }`; no bare-string `'expo-build-properties'` entry.
- [ ] Test: `expo.ios.infoPlist.UIApplicationSceneManifest` is `undefined`, and the build-properties options have no `ios.deploymentTarget`.

### FR5: Patches + widget background
- [ ] Extend `__tests__/config/deps.test.ts`:
  - [ ] no `patches/react-native-reanimated+*.patch`
  - [ ] exactly one `patches/expo-widgets+*.patch`, under 20000 bytes
  - [ ] its `diff --git` paths are exactly `ios/ExpoWidgets.podspec`, `scripts/xcode-build-bundle.sh`, `ios/Widgets/TimelineProvider.swift` and `scripts/autolinking.rb`
  - [ ] it doesn't contain `bundle/build/ExpoWidgets.bundle`, `EntryView.swift` or `send(:resolve)`
  - [ ] it contains `addingTimeInterval(15 * 60)` and `basename "$PROJECT_DIR"`
- [ ] Extend `src/widgets/__tests__/widgetLayoutJs.test.ts`: add the stub `containerBackground: (style, placement) => ({ __modifier: 'containerBackground', style, placement })` to `createSwiftUIStubs()`. For `systemSmall`, `systemMedium` and `systemLarge`, assert the root node's `modifiers` contain `{ __modifier: 'containerBackground', style: '#0D0D1A', placement: 'widget' }`. For `accessoryInline`, assert no `containerBackground` anywhere in the tree.

### FR6: Runtime parity (no new unit tests)
- [ ] Record a green baseline on `main` for: `__tests__/client.test.ts`, `src/__tests__/api/client.test.ts`, `__tests__/approvals-api.test.ts`, `__tests__/auth-api.test.ts`, `__tests__/error-envelope.test.ts`, `src/__tests__/lib/pushToken.test.ts`, `__tests__/appstate-check.test.ts`, `__tests__/use-ai-data.test.ts`, `__tests__/use-role-refresh.test.ts`, `src/hooks/__tests__/useScheduledNotifications.test.ts`, `src/__tests__/notifications/handler.test.ts`, `app/__tests__/layout-notifications.test.tsx`, `src/widgets/__tests__/`, `src/__tests__/widgets/bridge.test.ts`.

### FR7: Version
- [ ] Extend `__tests__/config/app-config.test.ts`: `expo.version` ≥ `1.2.0` (numeric compare). Keep spec 04's `package.json.version === expo.version` and spec 05's `buildNumber ≥ 18` assertions.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage (FR1–FR5, FR7 automated; FR4 native output, FR5 on-device widget and FR6 covered by the manual rows below)
- [ ] Assertions are specific (exact versions/ranges, exact plugin tuple, exact patch file list, exact modifier object), not just "exists"
- [ ] Mocks return realistic data matching interface contracts (`expo-router` factories expose the real export names; the icon mock forwards `name`/`size`/`color`)
- [ ] The new tests are red for the right reason on the current tree (`npx jest __tests__/config src/widgets/__tests__/widgetLayoutJs.test.ts`). The rewritten spec 06 `deps.test.ts` cases (FR1) are green on the current tree, and none of them pins an SDK version
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### Milestone A: SDK 56 checkpoint (JS-only, no native build, never shipped)

#### FR1: hop 1
- [ ] `npx expo install expo@^56.0.0 --fix`. Run it again until `npx expo install --check` is clean (expo-widgets is excluded; expected).
- [ ] TypeScript: note the version `--fix` installed (6.0.x expected). Apply the FR1 fallback only if TS-6-specific errors block typecheck, and record it in Session Notes.
- [ ] jest-expo 56 has a peer dependency on `@react-native/jest-preset ^0.85.0`. If `--fix` didn't add it to devDependencies, run `npm i -D @react-native/jest-preset@^0.85` (it becomes `^0.86` at hop 2).

#### FR2: navigation imports
- [ ] Optional: `npx expo-codemod sdk-56-expo-router-react-navigation-replace app src components hooks`.
- [ ] `app/_layout.tsx:6`: merge `DarkTheme, DefaultTheme, ThemeProvider` into the `expo-router` import at `:11`, and delete line 6.
- [ ] `src/components/FadeInScreen.tsx:18`, `src/hooks/useFocusKey.ts:2`, `src/hooks/useStaggeredEntry.ts:29`: `useIsFocused` from `'expo-router'`.
- [ ] `src/components/FloatingPillTabBar.tsx:18`: `import type { BottomTabBarProps } from 'expo-router/js-tabs'`.
- [ ] `app/(tabs)/_layout.tsx:24`: `import { Tabs } from 'expo-router/js-tabs'`.
- [ ] Precondition grep: `grep -rn "haptic-tab\|HapticTab" app src components --include='*.ts' --include='*.tsx'` shows only test/comment references. Then delete `components/haptic-tab.tsx` and `src/components/__tests__/HapticTab.test.tsx`.
- [ ] Move the mocks into the `expo-router` factories:
  - [ ] `app/__tests__/layout-notifications.test.tsx:99` → the factory at `:82`
  - [ ] `app/(tabs)/__tests__/index.test.tsx:54` → the factory at `:65`
  - [ ] `app/(tabs)/__tests__/indexConeIntegration.test.tsx:44-49` → the factory at `:38`
  - [ ] `src/components/__tests__/AITab.test.tsx:168` → the factory at `:75`
  - [ ] `src/components/__tests__/AITabConeIntegration.test.tsx:160` → the factory at `:83`
  - [ ] `src/components/__tests__/FadeInScreen.test.tsx:22-25` → `jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }))`
- [ ] Update the comments that name the package (the guard is a string match): `indexConeIntegration.test.tsx:44`, `AITabConeIntegration.test.tsx:153`, `AITab.test.tsx:163`, `FadeInScreen.test.tsx:9`.
- [ ] Run `npm test`. For every `TypeError: useIsFocused is not a function` (or missing theme export), add the export to that file's `expo-router` factory. List the files fixed in Session Notes.
- [ ] Remove `@react-navigation/native`, `@react-navigation/bottom-tabs` and `@react-navigation/elements` from `package.json`, then `npm install`. `npm ls @react-navigation/native --all` prints `(empty)`.

#### FR3: icon imports
- [ ] `npx expo install @react-native-vector-icons/ionicons @react-native-vector-icons/material-icons`, and remove `@expo/vector-icons` from `package.json`. Optional codemod: `rm -rf dist && npx @react-native-vector-icons/codemod --dynamic .` on a clean tree.
- [ ] `src/components/ApprovalUrgencyCard.tsx:29` and `src/components/ApprovalCard.tsx:55`: `import { Ionicons } from '@react-native-vector-icons/ionicons'`.
- [ ] `src/components/FloatingPillTabBar.tsx:19` and `components/ui/icon-symbol.tsx:3`: `import MaterialIcons from '@react-native-vector-icons/material-icons'`.
- [ ] Create `__mocks__/@react-native-vector-icons/common.js`. Its `createIconSet(glyphMap, options)` returns a function component that renders a host element forwarding `name`/`size`/`color`/`style`, with `.glyphMap` attached.
- [ ] Rewrite the inline icon mocks to `@react-native-vector-icons/ionicons` (named `Ionicons` + `default`): `app/(tabs)/__tests__/index.test.tsx:74`, `src/components/__tests__/ApprovalUrgencyCardScreenIntegration.test.tsx:92`, `src/components/__tests__/ApprovalUrgencyCard.test.tsx:22`, `__tests__/approval-card.test.tsx:66`, `__tests__/glass-swipe-card.test.tsx:84`.
- [ ] Update the comments and test titles that name the old package: `app/(tabs)/__tests__/index.test.tsx:69`, `src/components/__tests__/ApprovalUrgencyCard.test.tsx:11`, `__tests__/approval-card.test.tsx:65`, `__tests__/glass-swipe-card.test.tsx:20,83`, and the `FloatingPillTabBar.test.ts:105` title.
- [ ] If jest fails on `.ttf`: add `'\\.(ttf|otf)$': '<rootDir>/__mocks__/fileMock.js'` to `jest.config.js` `moduleNameMapper` and record it in Session Notes. Otherwise leave `jest.config.js` alone.

#### FR5: retire the reanimated patch
- [ ] Confirm the getter is gone in the installed version: `grep -c "get _requiresAnimatedComponent" node_modules/react-native-reanimated/src/hook/useAnimatedStyle.ts` prints `0`.
- [ ] `git rm patches/react-native-reanimated+4.2.1.patch`.
- [ ] `rm -rf node_modules && npm ci` exits 0. The patch-package output lists only `expo-widgets@55.0.5 ✔`.

#### Milestone A gate
- [ ] `npm test`: the **only** failures are the milestone-B cases written in Phase 1.0, and they stay red on purpose (don't skip, `.todo` or weaken them):
  - the FR1 version-floor cases (`expo`, `expo-build-properties`, `react-native` 0.86, `react-native-worklets` 0.10, `expo-widgets` 57) in `sdk-migration.test.ts`
  - the FR4 plugin cases in `app-config.test.ts`
  - the FR5 expo-widgets patch-content cases in `deps.test.ts`
  - the `containerBackground` cases in `widgetLayoutJs.test.ts`
  - the FR7 version case

  List the failing test names in Session Notes. Everything else passes, including every other `deps.test.ts` case: the patch-filename `expo-widgets` pin (55.0.5), `SDK line consistency` (majors all 56), `collectPatchProblems`, postinstall, ngrok and exclude. A failing spec 06 SDK 55 case here means the Phase 1.0 rewrite was skipped. Fix the rewrite; don't add the case to this list. The pre-existing count changes only by the deleted `HapticTab.test.tsx` cases and the removed spec 06 SDK 55 cases.
- [ ] `npm run typecheck` exits 0. `npm run lint` exits 0 errors.
- [ ] `npx expo-doctor` shows no "expo-router and react-navigation are both installed" warning. The only allowed finding is the `expo-widgets` exclusion.
- [ ] `npx expo export --platform ios --output-dir /tmp/sdk56-export` bundles without "Unable to resolve module". Then `rm -rf /tmp/sdk56-export`.
- [ ] Commit: `chore(sdk-57): SDK 56 checkpoint — imports migrated, JS gates green` (stage specific files; Co-Authored-By trailer).

### Milestone B: SDK 57 + scenes

#### FR1: hop 2
- [ ] `npx expo install expo@^57.0.0 --fix` (repeat until `--check` is clean). Lockfile `expo` ≥ 57.0.23.
- [ ] `npx expo install expo-build-properties`. Lockfile ≥ 57.0.20.
- [ ] Ensure `@react-native/jest-preset` `^0.86.x` is in devDependencies.
- [ ] Lockfile `react-native-worklets` is `0.10.x`.
- [ ] `npm ls @react-navigation/native --all` prints `(empty)`.

#### FR5: expo-widgets bump + patch regeneration
- [ ] `npx expo install expo-widgets@<sdk-57 version>`, then set `dependencies["expo-widgets"]` to the exact version (no `^`/`~`). Keep `"expo-widgets"` in `expo.install.exclude`.
- [ ] Re-apply hunks inside `node_modules/expo-widgets`:
  - [ ] a: `ios/ExpoWidgets.podspec` script → `bash -l -c "\"$PODS_TARGET_SRCROOT/../scripts/xcode-build-bundle.sh\""`
  - [ ] b: `scripts/xcode-build-bundle.sh` → `PROJECT_DIR_BASENAME=$(basename "$PROJECT_DIR")`
  - [ ] c: `ios/Widgets/TimelineProvider.swift` → `let nextRefresh = Date().addingTimeInterval(15 * 60)` and `policy: .after(nextRefresh)`
  - [ ] d: `scripts/autolinking.rb` `expo_widgets_post_install` → add `|| target.name == 'ExpoWidgets'`
- [ ] Don't carry over `bundle/build/ExpoWidgets.bundle`, `.send(:resolve)` or the `EntryView.swift` background.
- [ ] `npx patch-package expo-widgets`, then `git rm patches/expo-widgets+55.0.5.patch` and `git add patches/expo-widgets+<v>.patch`.
- [ ] `src/widgets/bridge.ts`: add `modifiers: [containerBackground('#0D0D1A', 'widget')]` to the `small` (`:665`), `medium` (`:710`) and `large` (`:807`) root `ZStack`s.
- [ ] `rm -rf node_modules && npm ci` exits 0. Output shows `expo-widgets@<v> ✔` and no reanimated line.

#### FR4: scene support
- [ ] Append `["expo-build-properties", { "ios": { "enableSceneSupport": true } }]` to `app.json` `expo.plugins`.
- [ ] Add `"preview-xcode27": { "extends": "preview", "ios": { "image": "<newest non-RC macos-*-xcode-27.* image>" } }` to `eas.json` `build` (27.0 on 2026-10-19). Leave `production` unpinned.
- [ ] Introspect: `npx expo config --type introspect --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).ios.infoPlist.UIApplicationSceneManifest)))'` prints the Scene manifest contract exactly (`UIApplicationSupportsMultipleScenes:false`, `UISceneDelegateClassName:"EXExpoAppSceneDelegate"`).
- [ ] Scratch prebuild (`/ios` is gitignored; CNG project):
  - [ ] `npx expo prebuild -p ios --clean --no-install` prints no `enableSceneSupport` error or warning
  - [ ] `grep -c "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {" ios/Hourglassxo/AppDelegate.swift` prints `1`
  - [ ] `grep -c "window = UIWindow(frame: UIScreen.main.bounds)\|factory.startReactNative(" ios/Hourglassxo/AppDelegate.swift` prints `0`
  - [ ] `find ios -name SceneDelegate.swift` prints nothing
  - [ ] `grep -c EXExpoAppSceneDelegate ios/Hourglassxo/Info.plist` prints ≥ `1`
  - [ ] For each extension Info.plist (`find ios -name Info.plist -not -path "*/Hourglassxo/*" -not -path "*/Pods/*"`), `grep -c UIApplicationSceneManifest` prints `0`
  - [ ] `rm -rf ios && git status --porcelain` shows no prebuild-induced changes (only this milestone's intended edits)

#### FR7: version, docs, hotfix lane
- [ ] `app.json` `expo.version` → `"1.2.0"`; `package.json` `version` → `"1.2.0"`.
- [ ] `ios.buildNumber` → next unused: check `node .appstore/asc.js builds` for the highest uploaded build, then add 1. Record it in Session Notes.
- [ ] `TECH_STACK.md`: SDK ~57.0.x, RN 0.86.x, React 19.2.x. Replace the Navigation table's `@react-navigation/*` rows with an expo-router fork note. Replace the icons row with `@react-native-vector-icons/ionicons` + `material-icons`. Update reanimated/worklets/expo-widgets/skia, and add `expo-build-properties` (`ios.enableSceneSupport`).
- [ ] `CLAUDE.md:69` → "Expo SDK 57, React Native 0.86". `README.md:27` → "Expo SDK 57 + React Native 0.86". `README.md:66` → "patch-package fixes for expo-widgets".
- [ ] `docs/ARCHITECTURE.md`: add `### 5.7 Native launch & lifecycle (UIKit scenes)` (spec Data Flow; mentions `EXExpoAppSceneDelegate`, AppState via `UIApplication` notifications, push via `ExpoAppDelegateSubscriber`, cold-start URL path). In §7.2, note the 15-min `.after` policy (patch hunk c) and the `containerBackground` modifier.
- [ ] `docs/RELEASING.md`: add "SDK upgrade" (two-hop `--fix`, explicit expo-widgets bump + patch regen, prebuild scene check, `preview-xcode27` build) and "1.1.x hotfix lane" (`release/1.1`; no production-channel `eas update` from `feat/sdk-57` before 1.2.0 is live).
- [ ] Docs check: `grep -n "SDK 57" CLAUDE.md README.md TECH_STACK.md` matches in all three. `grep -rn "SDK 54\|0\.81\|@react-navigation\|@expo/vector-icons" CLAUDE.md README.md TECH_STACK.md` prints nothing.

#### Milestone B gate
- [ ] `npm test` has 0 failures (all new tests green). `npm run typecheck` exits 0. `npm run lint` exits 0 errors.
- [ ] `npx expo install --check` exits 0. `npx expo-doctor` exits 0.
- [ ] `npx expo export --platform ios --output-dir /tmp/sdk57-export` succeeds. Then `rm -rf /tmp/sdk57-export`.
- [ ] Commit(s): `feat(sdk-57): Expo SDK 57 + UIKit scene lifecycle (v1.2.0)` (stage specific files; Co-Authored-By trailer).

### Device verification (FR4, FR5, FR6): record ✅/❌ + date per row

Builds:
- [ ] FR4: `eas build -p ios --profile development` succeeds (default `sdk-57` image). The dev client launches on the iOS 26 device.
- [ ] FR4: `eas build -p ios --profile preview-xcode27` succeeds. The "Spin up build environment" log shows Xcode 27.x. It installs on the iOS 27 device and cold-launches to Home with data (no black screen, no launch crash).

Matrix (run on the dev client/iOS 26 and preview-xcode27/iOS 27; repeat on TestFlight/iOS 27 in Release):

| # | Check | iOS 26 dev | iOS 27 preview-xcode27 | iOS 27 TestFlight |
|---|-------|-----------|------------------------|-------------------|
| 1 | Cold launch + QA manager sign-in → Home shows hours/earnings | [ ] | [ ] | [ ] |
| 2 | Wrong password in onboarding → auth error message (401 path), no crash | [ ] | [ ] | [ ] |
| 3 | Approve one + reject one with reason (empty-body PUT) succeed | [ ] | [ ] | [ ] |
| 4 | Background ≥ 60 s → foreground → new `api-qa.crossover.com` requests within 5 s (RN DevTools Network on dev; data change visible on TF) | [ ] | [ ] | [ ] |
| 5 | Silent push while backgrounded (≤ 30 min, or trigger from `server/`) → widget timestamp updates | [ ] | [ ] | [ ] |
| 6 | Local deadline notification fires; tapping it from killed state opens the app | [ ] | [ ] | [ ] |
| 7 | Widgets small/medium/large: opaque dark background, data shown, no "adopt containerBackground"/"No layout found"; tap from killed state opens the app (FR5) | [ ] | [ ] | [ ] |
| 8 | Widget picks up changed data within ~15 min (patch hunk c) | [ ] | [ ] | [ ] |
| 9 | Deep link `hourglassws://overview`: Safari on device, warm + cold → Overview tab | [ ] | [ ] | [ ] |
| 10 | Settings → About → Privacy Policy / Support open in the in-app browser and dismiss | [ ] | [ ] | [ ] |
| 11 | Approvals card icons + urgency clock icon render as glyphs (FR3) | [ ] | [ ] | [ ] |
| 12 | NativeWind styles, Skia/Victory charts and the NativeTabs glass pill match build 19 screenshots | [ ] | [ ] | [ ] |
| 13 | Sign Out clears data; relay `/health` count drops by 1 | [ ] | [ ] | [ ] |

- [ ] Simulator deep link (dev client): `xcrun simctl openurl booted "hourglassws://overview"` opens Overview warm, and again after `xcrun simctl terminate booted com.jalvarez0907.hourglass` (cold).
- [ ] Memory (Hermes V1 regression check): dev client with Xcode attached (Debug Navigator → Memory). Switch tabs with charts animating for 10 minutes. Memory at 10 min ≤ 1.5× memory at 1 min, with no monotonic climb. Record both values.
- [ ] If row 2 or 3 fails because of fetch semantics: adopt `EXPO_PUBLIC_USE_RN_FETCH=1` in `eas.json` `build.{development,preview,preview-xcode27,production}.env`, document it for `eas update`, rebuild, re-run rows 1–5, and record the failing case.

### Release (FR7)
- [ ] `eas build -p ios --profile production` (default image). Record the fingerprint hash (spec 04).
- [ ] `eas submit -p ios --profile production --latest`. Run spec 05's TestFlight smoke checklist plus the TestFlight column above, on the iOS 27 device.
- [ ] ASC: create the 1.2.0 version, attach the build, and add What's New including "Requires iOS 16.4 or later". Submit per `docs/RELEASING.md`.
- [ ] Merge `feat/sdk-57` to `main` only after TestFlight passes. `release/1.1` stays available for 1.1.x hotfixes.
- [ ] After READY_FOR_SALE: spec 04 runbook A (baseline OTA from the exact 1.2.0 tree). After two cold starts, the Settings version row shows `Update: <id>`.

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code (FR1–FR7), including the manual rows recorded above
- [ ] Interface contracts match the implementation (version floors, plugin tuple, patch file list, scene manifest, `preview-xcode27` profile, `containerBackground` color)
- [ ] No scope creep or shortfall (no routing, no `/static` icons, no production image pin, no `UIApplicationSupportsMultipleScenes: true`)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes (`npm test`, `npm run typecheck`, `npm run lint`)
- [ ] Commit fixes: `fix(08-expo-sdk-57-scenes): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests (`__tests__/config/*.test.ts`, `widgetLayoutJs.test.ts`, the FR2/FR3 rewritten tests)
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(08-expo-sdk-57-scenes): strengthen test assertions`

### Final Verification
- [ ] All tests passing (`npm test` 0 failures; CI `app-tests` green with typecheck + lint gates)
- [ ] No regressions in existing tests (count = baseline − deleted `HapticTab.test.tsx` cases − removed spec 06 SDK 55 cases + new and rewritten cases)
- [ ] Code follows existing patterns (root `__mocks__` for node modules; `fs`-based source/config tests; no hand-edited `ios/`)

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19**: Spec drafted. Registry snapshot: expo sdk-57 = 57.0.30, expo-build-properties sdk-57 = 57.0.22 (`enableSceneSupport` from 57.0.19, `MINIMUM_EXPO_VERSION = '57.0.23'`), expo-widgets sdk-57 = 57.0.26, `expo@latest` = 58.0.16. EAS: `sdk-57` = `macos-tahoe-26.5-xcode-26.6`; `macos-tahoe-26.6-xcode-27.0` available. Start-gate retarget decision pending (Jaime).

**2026-10-19**: `bundledNativeModules.json` checked from the tarballs. expo@sdk-56 (56.0.23): react-native 0.85.3, reanimated 4.3.1, worklets 0.8.3, jest-expo ~56.0.5. expo@sdk-57 (57.0.30): react-native 0.86.3, reanimated 4.5.1 (peer worklets `0.10.x`), worklets 0.10.1, jest-expo ~57.0.6. So spec 06's `deps.test.ts` SDK 55 cases (`55.`, `0.83.`, `0.7.`, `expo-widgets === '55.0.5'`) can't survive hop 1 or milestone B. Phase 1.0 rewrites them (FR1).
