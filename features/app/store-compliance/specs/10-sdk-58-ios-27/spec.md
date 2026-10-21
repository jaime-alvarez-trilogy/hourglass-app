# 10 — Expo SDK 58 on the iOS 27 SDK (v1.2.0, build 19)

**Status:** Draft (critique pass applied 2026-10-20)
**Created:** 2026-10-20
**Last Updated:** 2026-10-20
**Owner:** @jaime-alvarez-trilogy
**Supersedes:** `08-expo-sdk-57-scenes`, `09-sdk-58-xcode-27` (kept as history)

---

## Overview

This spec moves Hourglass from Expo SDK 55 / React Native 0.83.2 to **Expo SDK 58 / React Native 0.88.0** in one native jump. Every dependency moves to its latest SDK 58-compatible version. The release ships as **v1.2.0, build 19**, built on EAS cloud with the pinned image **`macos-tahoe-26.6-xcode-27.1`** (Xcode 27.1 GA, build 27A9275, iOS 27 SDK; Expo's page still labels it "RC", but Apple released 27A9275 as Xcode 27.1 on 2026-10-15). That satisfies Apple's April 2027 upload rule. The SDK 58 project template generates the UIKit scene lifecycle (`SceneDelegate.swift` and `UIApplicationSceneManifest`), and an iOS 27 SDK build needs it to launch. All evidence is in `spec-research.md`, which uses the labels verified, likely and unverified.

The work is ordered so the app stays runnable at every checkpoint (spec-research Decision 2):

- **Checkpoint A (SDK 55, FR1–FR3).** First, cut the hotfix lane and add the dependency guards. Then land every change that works on both SDK 55 and 58:
  - `useIsFocused` from `expo-router`.
  - Deleting dead code.
  - Version-neutral Skia path calls.
  - `expo/fetch` hardening of the API client.

  All three CI gates stay green. Nothing native changes. FR1 also moves the CI to Node 22, adds the `ota-publish.sh` dual-shape fix (cherry-picked to `release/1.1`) and upgrades eas-cli, so every EAS build in this spec uses the same CLI. Checkpoint A ends with one device run of the FR3 tree on an SDK 55 dev client (Decision 2).
- **Checkpoint B (SDK 58, FR4).** One atomic dependency bump. It includes only the 58-only source edits needed to compile and the test toolchain that the peer dependencies force. Patches are retired. An EAS development build boots on a physical iOS 27 iPhone.
- **FR5–FR8 (SDK 58).** Native config (scenes, iOS 16.4 minimum, image pin, version), the widget changes (layout, background fallback, extension privacy manifest), a behavior pass over the third-party natives, and the fingerprint config with the draft-PR CI run. Gates stay green after each FR.
- **Checkpoint C (FR9).** Inspect a throwaway local prebuild, run a mandatory `pod install` and a Release compile-only `xcodebuild`, run `expo-doctor` and check fingerprint stability.
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
  - The single exception, only if J approves Decision 16 (a): one read-only `cp -R` of its gitignored `.appstore/` into this worktree before FR5. After that, every `asc.js` and `eas submit` call runs from this worktree.
- No `--legacy-peer-deps` or `--force`. Fix the range that conflicts instead.
- **Every pushed commit is green.** Each FR writes its red tests at its own start, runs them, records the red list, and commits tests and implementation once all three gates exit 0. Red-only commits stay local and are never pushed.

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
15. **Adopting expo-widgets `ios.initialLayout`** to remove the transient placeholder red box before 1.2.0's first open. **Deferred** (Decision 5 (ii)), unless J rejects option (i).
---

## Functional Requirements

### FR1: Hotfix lane, dependency guards and release tooling (SDK 55, checkpoint A)

Protect build 18, bring spec 06's guards onto this branch, and land the release tooling while both trees still share the SDK 55 line (Decision 12). All of this comes before any risky install.

**Requirements:**
- **Branches:**
  - `git tag build-18 aade79b` and `git branch release/1.1 aade79b`.
  - Push both to `origin`.
  - Record that `release/1.1` and `build-18` resolve to `aade79b`.
- **Port spec 06.** Cherry-pick each commit **once**, in this order:
  - First `962d413` (the `deps.test.ts` guard), then `96035ea` (exact `expo-widgets 55.0.5`, `postinstall: patch-package --error-on-fail --error-on-warn`, removal of `@expo/ngrok`, `expo.install.exclude: ["expo-widgets"]`), from `feat/dependency-hygiene`.
  - Both commits also touch spec 06's own `checklist.md`. On a conflict there, take the incoming version (`git checkout --theirs`), because it's spec 06's progress record.
  - That branch forked at `1a9550c`, before spec 07. Resolve any `package.json` conflict by hand, keeping `typecheck` and `lint`. Regenerate `package-lock.json` with `npm install`; never merge it by hand.
  - Don't cherry-pick `91de428`, because FR10 rewrites TECH_STACK.md.
- **Adapt `__tests__/config/deps.test.ts`:**
  - Delete the `FR5: refreshed to the latest SDK 55 patch line` describe. It's superseded by FR4's SDK 58 floors.
  - Replace the FR4 describe with:
    - (a) `expo.install.exclude` contains package X if and only if a `patches/X+*.patch` file exists.
    - (b) Every `exclude` entry is a direct dependency.
    - An absent or empty list is valid when there are no patches.
  - Keep the `collectPatchProblems` rules 1–6 and their fixtures unchanged.
- **Remove `react-native-inner-shadow`.** It has zero imports (`GlassCard.tsx:14-20` explains why) and is JS-only (no podspec, no `ios/`). Remove it from `dependencies` and delete `__mocks__/react-native-inner-shadow.ts`. Add a `deps.test.ts` case that it's absent from `dependencies` and `devDependencies`.
- **Release tooling (moved here from FR8; Decision 12):**
  - **CI.** `.github/workflows/test.yml` sets `node-version: '22'` for both `app-tests` and `server-tests` (`:14`, `:33`). The step order is unchanged (spec 07 SC8.2). Extend `__tests__/ci-gates.test.ts`: every `node-version` value is an even major ≥ 22, and at least one exists.
  - **`scripts/ota-publish.sh`.** At `:86-95`, read the build runtime as `(b.runtime && b.runtime.version) ?? b.runtimeVersion`. eas-cli ≥ 22 renamed the field, and this form works on both. Add both JSON shapes to `__tests__/scripts/ota-publish.test.ts`.
  - **Cherry-pick to `release/1.1`.** Commit that change, then, inside this worktree: `git switch release/1.1 && git cherry-pick <sha> && rm -rf node_modules && npm ci && npm test && git push origin release/1.1 && git switch feat/sdk-58 && rm -rf node_modules && npm ci`. **No runtime value may be recorded before that final `npm ci`**, because `runtimeversion:resolve` reads local `node_modules`. A dedicated `git worktree add` for `release/1.1` is allowed instead, but only with J's OK.
  - **eas-cli.** Only after the cherry-pick: `npm i -g eas-cli@latest` (≥ 25.2.0), and record `eas --version`. Set `eas.json` `cli.version` to `">= 25.2.0"`, with an `app-config.test.ts` case for it. That case opens a new `describe('10-sdk-58-ios-27')` block, which FR5 and FR6 extend. `docs/RELEASING.md` field names follow in FR10.
- **ITMS-91053 baseline (J; must be recorded before FR4 starts).** In the App Store Connect processing emails for builds 17 and 18, search for `ITMS-91053`. Record either "none" or each binary and API category listed. Spec 05's checklist (`:457`) never recorded it. Build 19's result is compared against this in FR11.

**Success Criteria:**
- [ ] `git rev-parse build-18 release/1.1` prints `aade79b…` twice, and both refs exist on `origin`.
- [ ] `rm -rf node_modules && npm ci` exits 0. Its output lists both patches as applied, with no warnings.
- [ ] `deps.test.ts` passes, and it contains no `55.0.31`/`0.83.10` floors (`grep -nE "55\.0\.31|0\.83\.10"` prints nothing).
- [ ] `package.json` has no `@expo/ngrok` or `react-native-inner-shadow`, and `__mocks__/react-native-inner-shadow.ts` is gone.
- [ ] `ci-gates.test.ts`, `ota-publish.test.ts` and the `cli.version` case are red before the change and green after it.
- [ ] `git log release/1.1 --oneline -1 -- scripts/ota-publish.sh` shows the cherry-pick, and `release/1.1`'s `npm test` passed on its own tree. `eas --version` is ≥ 25.2.0.
- [ ] The build 17 and 18 ITMS-91053 results are recorded, or "blocked: <reason>".
- [ ] `npm test`, `npm run typecheck` and `npm run lint` exit 0. `npx expo install --check` exits 0 with the exclude in place.

---

### FR2: Forward-compatible navigation, dead code and Skia paths (SDK 55, checkpoint A)

Land every change that compiles and runs on **both** SDK 55 and SDK 58, so the bump in FR4 stays small.

**Requirements:**
- **`useIsFocused` from `expo-router`.** expo-router 55.0.7 already exports it (`node_modules/expo-router/build/exports.d.ts:26`). Change the import at `src/components/FadeInScreen.tsx:18`, `src/hooks/useFocusKey.ts:2` and `src/hooks/useStaggeredEntry.ts:29`.
- **Tests that name `@react-navigation/native` for these hooks** (spec-research F2.2; the source walk skips tests, so this list is the authority):
  - `app/(tabs)/__tests__/index.test.tsx:54`, `app/(tabs)/__tests__/indexConeIntegration.test.tsx:45`, `src/components/__tests__/AITab.test.tsx:168` and `src/components/__tests__/AITabConeIntegration.test.tsx:160`: move the `useIsFocused` stub into that file's existing `expo-router` mock, and delete the `@react-navigation/native` mock. Extend the existing mock; don't replace it with `jest.requireActual('expo-router')`.
  - `src/components/__tests__/FadeInScreen.test.tsx:22-24`: it has **no** `expo-router` mock. Replace the `jest.requireActual('@react-navigation/native')` mock with `jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }))`.
  - `src/hooks/__tests__/useStaggeredEntry.test.ts:132-135`: invert the source regex to `/useIsFocused.*from.*['"]expo-router['"]/`, and assert that `@react-navigation` is absent.
  - Each of these files keeps its test count.
  - `app/__tests__/layout-notifications.test.tsx` keeps its `@react-navigation/native` theme mock until FR4. The package still resolves on SDK 55.
- **Delete the dead tab button.** Delete `components/haptic-tab.tsx` and `src/components/__tests__/HapticTab.test.tsx`. Nothing in `app/` imports it (ARCHITECTURE §8.6), and its `PlatformPressable` exists only in a deprecated expo-router fork.
- **Version-neutral Skia path calls.** Skia 2.14 removes `SkPath.moveTo/lineTo/trim` (spec-research F2.4).
  - `src/components/ScrubCursor.ts:42-44` builds the line with `Skia.Path.MakeFromSVGString(\`M ${scrubX} ${topPadding} L ${scrubX} ${chartHeight - topPadding}\`)`. The return type keeps `linePath: SkPath`. If the parse returns `null`, fall back to `Skia.Path.MakeFromSVGString('M 0 0')!`, which never happens for finite numbers.
  - `src/components/AIArcHero.tsx:146-150` deletes the `useDerivedValue` that runs `copy()` + `trim()`. It renders the fill as `<Path path={fullSkiaPath} start={0} end={sweepProgress} …>`, keeping the existing stroke and gradient props. `start` and `end` exist on `PathProps` in both 2.4.18 and 2.14.0 (`dom/types/Drawings.d.ts:12-18`).
  - `src/components/AIArcHero.tsx:131`: the `?? Skia.Path.Make()` fallback becomes `?? Skia.Path.MakeFromSVGString('M 0 0')!`. `Make()` still exists in 2.14, but the ban below keeps one construction idiom (spec-research Decision 7).
  - Update `__mocks__/@shopify/react-native-skia.ts` so `Skia.Path.MakeFromSVGString` returns a path stub. Remove `moveTo` from the mock path, so any remaining mutation fails a test.
- **Create `__tests__/config/sdk58-migration.test.ts`.** It walks the source tree (`app/`, `src/`, `components/`, `hooks/`, `constants/`, skipping `__tests__`, `__mocks__` and `node_modules`) and, for this FR, asserts:
  - No `useIsFocused` imported from `@react-navigation/native`.
  - No `Skia.Path.Make()` call.
  - No `.copy().trim(` chain.
  - `components/haptic-tab.tsx` doesn't exist.
- **Never OTA these JS changes to 1.1.x users from this branch.** They would be runtime-compatible, but the rule is still no production publishes from `feat/sdk-58`.

**Success Criteria:**
- [ ] `grep -rn "useIsFocused" app src components | grep "@react-navigation"` prints nothing, including in tests.
- [ ] The six test files listed above pass with unchanged test counts, and `useStaggeredEntry.test.ts` asserts the `expo-router` import.
- [ ] `ScrubCursor.test.ts` asserts the exact `MakeFromSVGString` argument for a sample point, and no longer asserts `moveTo`/`lineTo`.
- [ ] An `AIArcHero` test asserts the fill `Path` receives `start={0}` and an `end` bound to the sweep shared value.
- [ ] The `sdk58-migration.test.ts` FR2 cases fail before the change (red) and pass after it (green).
- [ ] `npm test`, `npm run typecheck` and `npm run lint` exit 0 on SDK 55.

---

### FR3: `expo/fetch` readiness: API client hardening (SDK 55, checkpoint A)

From SDK 56, `globalThis.fetch` is `expo/fetch` (`expo/src/winter/runtime.native.ts`). It reads a body strictly once, rejects with `FetchError` and defaults to `credentials: 'include'`. Make the client correct under those rules, and test them in jest. Jest mocks `fetch`, so the tests use stubs that mimic `expo/fetch`.

**Requirements:**
- **`parseBody`** (`src/api/client.ts:197-200`):
  - Keep the build-11 behavior: an empty body returns `undefined`. A **whitespace-only** body (`text.trim() === ''`) also counts as empty.
  - A non-blank body that isn't JSON throws `ApiError(response.status, 'Invalid JSON response body')`, not a raw `SyntaxError`.
  - This applies to `apiPut` as well, even though the approve/reject callers discard the result (`src/api/approvals.ts:61,80,97,115`). A 200 HTML page (a captive portal or proxy) means the PUT may never have reached Crossover, so an error is safer than a false success. `useApprovalItems` restores the list and refetches in `finally` (`src/hooks/useApprovalItems.ts:155-162`), so the user sees the real state before retrying. Document this in the `parseBody` comment.
- **Read each body at most once.** That covers the `mintAuthToken` (`:36-56`) OK and error paths, `apiGet` / `apiPut` with and without the `creds` retry, and `handleStatus` (`:139-182`). Discarding the first 401 response in the retry path without reading it is allowed.
- **Network errors.** A rejection with an `Error` subclass named `FetchError` maps to `NetworkError` with the message preserved. This already works through `err instanceof Error` (`:43`, `:228`, `:270`), so lock it in with a test.
- **No RN-fetch-only fields.** No code reads `response._bodyInit`, `response._bodyText` or other whatwg-fetch internals. Add a `sdk58-migration.test.ts` source-walk case for `_bodyInit|_bodyText|_bodyBlob`.
- **`src/lib/pushToken.ts`.** `:35` and `:65` don't read response bodies. Keep it that way, and add a test asserting `register` never calls `text()`/`json()`.
- **Escape hatch, documented in FR10.** `EXPO_PUBLIC_USE_RN_FETCH=1` is inlined when the bundle is built, so it would have to go in `eas.json` `build.*.env` for every profile **and** in the `eas update` environment. Use it only if an FR11 device check fails because of fetch semantics, and record why.

**Success Criteria:**
- [ ] A shared test helper `makeExpoLikeResponse({ status, body, headers })` throws `TypeError('…Response body is already used.')` on a second `text()`/`json()` call. Every client path passes with it, in `src/__tests__/api/client.test.ts` and `__tests__/client.test.ts`.
- [ ] GET and PUT each pass with a 200 empty body, a 204 empty body, a 200 and a 204 whitespace-only body (`' '`, `'\n'`), and a 200 `{}` body.
- [ ] A 200 HTML body rejects with `ApiError` (`statusCode` 200), not `SyntaxError`.
- [ ] The `FetchError` rejection maps to `NetworkError`.
- [ ] The existing `approvals-api`, `auth-api`, `error-envelope` and `auth-resilience` suites pass unchanged.
- [ ] All three gates exit 0 on SDK 55. **Checkpoint A** is recorded in the checklist.
- [ ] **Checkpoint A device run (Decision 2).** The FR3 tree runs on an SDK 55 dev client against this worktree's Metro (port 8082). That's an existing SDK 55 dev build, or `eas build -p ios --profile development`, where `auto` resolves to the `sdk-55` image. Record PASS/FAIL for:
  - the `AIArcHero` sweep;
  - the Overview/Trend scrub-cursor line;
  - the `FadeInScreen`/`useStaggeredEntry` entry animations on tab focus;
  - one approve and one reject PUT on QA (empty body, no error).

---

### FR4: SDK 58 dependency line (checkpoint B)

One atomic step. It includes every package version, the 58-only source edits needed to compile, the test toolchain forced by peers, and patch retirement. When it ends, all three gates are green locally and the app boots on a device.

**Requirements:**
- **Retire both patches first.** Otherwise `--error-on-fail` aborts the install.
  - Delete `patches/expo-widgets+55.0.5.patch`. 3 of its 5 hunks fail against 58.0.21, and none are needed (spec-research F2.6). FR6 replaces the background.
  - Delete `patches/react-native-reanimated+4.2.1.patch`; its target code is gone in 4.7.1 (F2.5).
  - Remove `expo.install.exclude`.
  - Un-pin `expo-widgets`.
- **Install the contract versions** (spec-research Interface Contracts I1, install order):
  - **First**, write every I1 range into `package.json`:
    - `expo ~58.0.16` and every bundled package, including the new direct `@expo/ui ~58.0.21`.
    - The non-bundled packages: `victory-native`, `@tanstack/*`, `nativewind`, `react-native-css-interop`, `react-native-android-widget` and `@expo/vector-icons`.
    - Every devDependency: RNTL 14, `test-renderer 1.3.0`, Jest 30, `jest-expo ~58.0.11`, `@react-native/jest-preset 0.88.0`, `react-test-renderer 19.3.0`, the TS/ESLint lines.
    - Remove `@react-navigation/native`, `@react-navigation/bottom-tabs` and `@react-navigation/elements`.
  - **Then** run a single `npm install`.
  - **Then** run `npx expo install --check`, and `npx expo install --fix` for any bundled drift, until `--check` exits 0.
  - Never start with `npx expo install expo@~58.0.16`. Its `--fix` would pull expo-router 58 while RNTL 13 is still declared, and the optional peer `@testing-library/react-native >= 14.0.0` then fails with ERESOLVE (spec-research F2.2).
  - If `--fix` chooses a later patch release than I1, take it and record it.
- **58-only source edits.** Run `npx expo-codemod sdk-56-expo-router-react-navigation-replace app src components` if helpful, then fix by hand until `sdk58-migration.test.ts` passes:
  - `app/_layout.tsx:6`: `DarkTheme`, `DefaultTheme`, `ThemeProvider` from `'expo-router'`.
  - `src/components/FloatingPillTabBar.tsx:18`: `import type { BottomTabBarProps } from 'expo-router/js-tabs'`.
  - `app/(tabs)/_layout.tsx:23`: `NativeTabs` from `'expo-router/native-tabs'`.
  - `app/(tabs)/_layout.tsx:24`: `Tabs` from `'expo-router/js-tabs'`.
  - `app/(auth)/_layout.tsx:8`: delete `initialRouteName="welcome"`. Instead add `export const unstable_settings = { anchor: 'welcome' };` to that layout (sdk-57-to-58 router guide; the prop is `Omit`ted at `StackClient.d.ts:8`).
  - `app/(tabs)/__tests__/native-tabs.test.tsx:82-83,86-88,166-167`: assert the new paths and the absence of the old ones.
- **Tests that hard-code `@react-navigation` (spec-research F2.2):**
  - `src/components/__tests__/FloatingPillTabBar.test.ts:310-314`: assert `from 'expo-router/js-tabs'`, and assert that `@react-navigation/bottom-tabs` is absent.
  - `app/__tests__/layout-notifications.test.tsx:84-110`:
    - Add `DarkTheme: {}`, `DefaultTheme: {}` and the `ThemeProvider` passthrough to its `expo-router` mock.
    - Delete the `jest.mock('@react-navigation/native', …)` block. A non-virtual mock of a module that no longer resolves throws, and the whole suite fails to load.
    - The suite keeps its test count. It holds the FR1.5–1.7 notification-handler shape tests.
- **Test toolchain:**
  - `jest ^30.5.2`, `@types/jest ^30.0.0`, `jest-expo ~58.0.11`.
  - `@react-native/jest-preset 0.88.0`.
  - `@testing-library/react-native ^14.1.0` with `test-renderer 1.3.0`.
  - `react-test-renderer 19.3.0` and `@types/react-test-renderer ~19.3.0` (Decision 4).
  - `jest.config.js` `transformIgnorePatterns` keeps the custom allow-list, adds `standard-navigation`, and adds the two jest-expo 58 exclusions (`/node_modules/react-native-reanimated/plugin/`, `/node_modules/@react-native/babel-preset/`).
  - `src/__tests__/hooks/useWidgetSync.test.ts` `await`s `renderHook`/`rerender`/`unmount`.
  - **`__tests__/auth-screens.test.tsx` is rewritten onto host queries** (Decision 4). RNTL 14 removed the queries behind its 73 `UNSAFE_getAllByType` / `UNSAFE_queryAllByType` calls (71 lines), and `test-renderer` renders host elements only, so a query by `TouchableOpacity` or `TextInput` type has no direct port.
    - Use `getByText` / `getByRole` / `getByPlaceholderText` / `getByTestId`.
    - Add a `testID` to an `app/(auth)/*.tsx` element only where no text, role or placeholder query fits.
    - `await` every `render`, `fireEvent.*` and `act`.
    - The file keeps the same test count, recorded from the jest run before the change. It has no `UNSAFE_` left (`grep -c UNSAFE_` → 0).
- **TypeScript and lint toolchain** land in the same install: `typescript ~6.0.3`, `@types/react ~19.3.0`, `@types/node ^22.20.5`, `eslint ^9.39.5`, `eslint-config-expo ~58.0.4`.
  - Fix the Strict TS API fallout, TS 6 and `jsx: react-jsx` (the new `expo/tsconfig.base`).
  - Don't add `react-native-legacy-deep-imports`, unless more than 60 errors remain (spec 09 FR5 escape hatch, with a dated follow-up).
  - **Lint (Decision 12).** eslint-config-expo 58 brings `eslint-plugin-react-hooks ^7`, whose `recommended` preset adds the React Compiler rules at `error` (`purity`, `refs`, `immutability`, `set-state-in-render`, `static-components`, `use-memo`, `error-boundaries`, …).
    - Record `npx expo lint -f json` error counts per rule right after the install. A likely hit is `app/(tabs)/index.tsx:201` `new Date()` during render.
    - Fix the local, behavior-neutral cases.
    - If more than 30 errors remain, or a fix would change behavior, turn off only the named `react-hooks/<rule>` entries in `eslint.config.js`, each with a dated `TODO(2026-12-31, spec-10 follow-up)` comment.
    - Never turn off `rules-of-hooks` or `exhaustive-deps`.
- **`babel.config.js:19-22`.** Rewrite the comment so it no longer names the deleted reanimated patch's `_requiresAnimatedComponent` crash. The ordering rule (reanimated plugin last) stays.
- **Guards.** Extend `__tests__/config/deps.test.ts` with an `SDK 58 line` describe that uses floors, not windows:
  - Lockfile `expo` matches `/^\d+\.\d+\.\d+$/` with major ≥ 58. Lockfile `react-native` is `0.N.x` with N ≥ 88.
  - `expo-widgets` and `@expo/ui` lockfile majors equal the `expo` major, and `@expo/ui` is a direct `dependencies` entry.
  - `react-native-reanimated` ≥ 4.7.1, and `react-native-worklets` satisfies reanimated's `0.13.x` peer.
  - `@shopify/react-native-skia` ≥ 2.14.0 and `victory-native` major ≥ 42.
  - async-storage is exactly `2.2.0`.
  - `react-test-renderer` lockfile version equals `react`'s. `@react-native/jest-preset` `0.N` equals `react-native`'s `0.N`.
  - **Single copy** (no `node_modules/*/node_modules/<pkg>` lockfile key) of `react`, `react-native`, `expo-widgets`, `@expo/ui`, `test-renderer` and `react-native-css-interop`.
  - Root `react-native-css-interop` version equals `nativewind`'s declared dependency.
  - No `@react-navigation/*` in `dependencies` or `devDependencies`.
  - `patches/` contains no `.patch` files.
    - **Amended 2026-10-21 (final review):** narrowed to "neither retired SDK 55 patch file is back". A blanket ban contradicted this spec's own patch-package fallback and the patches policy (exact pin + `install.exclude` while a patch exists), which FR1's rules already enforce.
- **`sdk58-migration.test.ts` adds:** no `from '@react-navigation/`, no `expo-router/unstable-native-tabs`, no `import { … Tabs … } from 'expo-router'`, no `initialRouteName=`, and `app/(auth)/_layout.tsx` exports `unstable_settings.anchor === 'welcome'`. A second walk over test files (`__tests__/`, `*.test.*`, `__mocks__/`) finds no `jest.mock('@react-navigation/` and no `requireActual('@react-navigation/`.
- **Checkpoint B (device):**
  - `eas build -p ios --profile development` on EAS cloud. `auto` resolves to the `sdk-58` image.
  - Install it on an iOS 27 iPhone and run `npx expo start --dev-client --port 8082` from this worktree.
  - The app cold-launches, signs in with the QA manager account and renders all four tabs. Widgets may show the system "containerBackground" placeholder until FR6; that's expected and recorded.
  - From the build log's "Install pods" phase, record every `[Expo-precompiled]` line (which pods are prebuilt). This is the first `pod install` + compile of both targets on the `sdk-58` image (Debug), and it answers Q2 for Debug.
  - If `pod install` or the `ExpoWidgetsTarget` link fails because of precompiled modules, apply the Decision 9 fallback (`expo-build-properties` `ios.usePrecompiledModules: false`), record the failing log line, and rebuild.

**Success Criteria:**
- [ ] `rm -rf node_modules && npm ci` exits 0 and prints `No patch files found`. `ls patches/*.patch` matches nothing.
- [ ] `npx expo install --check` exits 0. `npm ls --all 2>&1 | grep -E "invalid|UNMET"` prints nothing.
- [ ] `package.json` matches I1 for every listed package, apart from recorded `--fix` patch-level drift.
- [ ] `deps.test.ts` and `sdk58-migration.test.ts` pass, including every single-copy and floor case.
- [ ] `npm test`, `npm run typecheck` and `npm run lint` exit 0 locally on Node ≥ 22.13, with no allowed failures. FR5–FR8 write their red tests at their own start.
- [ ] `(cd server && npm ci && npm test)` exits 0. The server suite runs on the root Jest 30 and babel-preset-expo 58 (`server/jest.config.js:5-13`), and the root jest ignores `/server/`.
- [ ] `auth-screens.test.tsx`, `layout-notifications.test.tsx` and `FloatingPillTabBar.test.ts` keep their recorded test counts. The lint per-rule counts, before and after, are recorded, along with any rule turned off.
- [ ] Checkpoint B is recorded: EAS build id, image line, iOS version, the `[Expo-precompiled]` lines, and a pass/fail line for each of the four tabs and sign-in.

---

### FR5: Native config for the iOS 27 SDK: scenes, minimum iOS, image pin, version

**Requirements:**
- **Scenes (Decision 9).** The SDK 58 template generates them. No `expo-build-properties` dependency, no plugin entry, no `enableSceneSupport`, no `ios.infoPlist.UIApplicationSceneManifest`.
  - **One allowed exception: the precompiled-modules fallback.** It applies only if checkpoint B, FR7 or FR9 shows a `pod install` or extension-link failure caused by precompiled modules (spec-research F2.8). Then add `expo-build-properties` (bundled version) and exactly `["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`, and record the failing log line.
- **Minimum iOS 16.4.** Take the template default and add no `ios.deploymentTarget` override. FR10 and FR11 put "Requires iOS 16.4 or later" into What's New and `site/support.html`.
- **Image pin (Decision 8).** `eas.json` `build.production.ios.image = "macos-tahoe-26.6-xcode-27.1"`. `development` and `preview` get no `image` key.
  - Re-run the infrastructure-page check before the FR11 build.
  - If the pinned name has gone, or its Xcode is a beta, use the newest non-beta `*-xcode-27.*` image and record it.
- **Version.**
  - `app.json` `expo.version` and `package.json` `version` = `"1.2.0"`. Regenerate the lockfile root version, because `fingerprint-config.test.ts` FR1 asserts it.
  - `ios.buildNumber` = `"19"`. If a 1.1.x rebuild took 19, use the next unused number (`node .appstore/asc.js builds`, run from this worktree after the Decision 16 copy; otherwise record "blocked: ASC key access" and take 19).
- **iPad (Decision 10, default (a)).** Keep `ios.supportsTablet: true` and `orientation: "portrait"`, and don't add `ios.requireFullScreen`.
  - If J chooses (b), set `ios.requireFullScreen: true`. Then the `requireFullScreen` and `UIRequiresFullScreen` assertions below flip to `true`, and I4's iPad-orientation row expects portrait entries only, or the key absent.
- **Privacy manifest.** `ios.privacyManifests` stays byte-identical to build 18. Spec 03's tests must stay green unchanged.
- **Extend the `describe('10-sdk-58-ios-27')` block in `__tests__/config/app-config.test.ts`** (FR1 created it with the `cli.version` case). Use typed JSON imports only (spec 03 contract) and read optional `eas.json` keys with `toHaveProperty`:
  - `JSON.stringify(expo.plugins)` doesn't contain `enableSceneSupport` or `deploymentTarget`.
  - Any plugin entry naming `expo-build-properties` must deep-equal `["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]` (the Decision 9 fallback). The case passes when there's no such entry.
  - `expo.ios.infoPlist` has no `UIApplicationSceneManifest`, and `expo.ios` has no `deploymentTarget`.
  - `expo.version` is semver ≥ 1.2.0. (The equality with `package.json` is spec 04's existing test.)
  - `ios.buildNumber` is an integer string ≥ 19.
  - `supportsTablet === true`, and `requireFullScreen` isn't `true`.
  - `expect(easJson.build.production).toHaveProperty(['ios','image'], expect.stringMatching(/^macos-[a-z]+-\d+(\.\d+)*-xcode-27(\.\d+)+$/))`. The value isn't `auto`, `default`, `latest` or `sdk-58`.
  - `easJson.build.development` and `easJson.build.preview` have no `ios.image`.
  - `expo.web.output === 'static'`.
- **`__tests__/config/app-config-introspect.test.ts` additions.** The resolved `sdkVersion` starts with `58.`, and `ios.infoPlist.UIRequiresFullScreen === false`. Spec 03's assertions stay unchanged, including the `ExpoWidgetsAppGroupIdentifier` non-vacuity guard. If expo-widgets 58 renamed that key, take the new name from its plugin source; never delete the guard.

**Success Criteria:**
- [ ] The `10-sdk-58-ios-27` cases are written at the start of this FR. Every case whose value FR5 changes (version, build number, image pin, `development`/`preview` image absence) is red on the FR4 tree, and all are green after this FR.
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
    - **Amended 2026-10-21 (final review):** `var entryMs = (env && env.date) ? env.date.getTime() : 0; var nowMs = Math.max(entryMs, Date.now());`. Under `.atEnd`, WidgetKit keeps re-rendering the last entry once the timeline runs out, so with `env.date` alone the countdown froze on that entry's date, past the deadline.
  - (e) Pass `initialProps` at both call sites: `createWidget('HourglassWidget', WIDGET_LAYOUT_JS, buildSignedOutWidgetData(Date.now()))` (`:920`, `:980`). Widen the local `CreateWidget` type (`:839`).
- **Module hygiene:**
  - Import `requireOptionalNativeModule` from `'expo'` instead of `'expo-modules-core'` (`:9`), and move the `jest.mock` in `src/__tests__/widgets/clearWidgetData.test.ts:31` to match.
  - Delete the stale ambient `declare module 'expo-widgets'` block (`src/types/modules.d.ts:50-61`), because the package ships `build/index.d.ts`. If typecheck shows that a call doesn't match the shipped types, fix the call. Don't re-declare the module.
- **Native fallback for the update window.** Create `plugins/withHourglassWidgetBackground.js` to contract I7:
  - It's a `withDangerousMod('ios')` that edits `ExpoWidgetsTarget/HourglassWidget.swift`, plus a pure, exported `addContainerBackground(source)`.
  - Add `"./plugins/withHourglassWidgetBackground"` to `app.json` `plugins` **immediately before** the `expo-widgets` tuple. A later plugin's mod runs first (`@expo/config-plugins` `withMod.js`), so listing it earlier makes it run after expo-widgets has written the file.
  - The transform is idempotent, and it throws when the anchor `WidgetsEntryView(entry: entry)` is missing.
- **Widget-extension privacy manifest (spec-research F2.10, Decision 5).** Create `plugins/withHourglassWidgetPrivacyManifest.js` to contract I10. It replaces spec 05's remedy, which went through the deleted 55 patch, without a patch.
  - A `withDangerousMod('ios')` writes `ExpoWidgetsTarget/PrivacyInfo.xcprivacy` with these entries:
    - UserDefaults `CA92.1` + `1C8F.1`, FileTimestamp `C617.1`, SystemBootTime `35F9.1`;
    - `NSPrivacyTracking: false` and empty tracking-domain and collected-data lists.
  - A `withXcodeProject` mod adds the file to the `ExpoWidgetsTarget` Resources build phase, creating the phase if it's missing. expo-widgets creates one only for localizations (`plugin/src/ios/xcode/addBuildPhases.ts:84-96`). The mod throws if the target is missing.
  - List it in `app.json` immediately before `"./plugins/withHourglassWidgetBackground"`, so both precede the `expo-widgets` tuple (I2).
  - RN's privacy aggregation only writes manifests for `:application` targets (`react-native@0.88.0` `scripts/cocoapods/privacy_manifest_utils.rb:52-54`). That's why the extension needs its own.
- **The update-window placeholder (spec-research F2.6, Decision 5 (i)).**
  - Until 1.2.0 is opened once, an upgrader's widget **placeholder** evaluates build 18's stored layout with `undefined` props and renders the red box. So does a never-opened fresh install's gallery preview.
  - (a) and (e) fix this only after the first open. The default is to accept it as transient. FR11 smoke 17 records what's actually seen. `ios.initialLayout` is a follow-up option, not part of this FR.
- **Timeline.** Keep 58's `.atEnd` policy; drop the 15-minute reload. (d) is what keeps the countdown honest between app opens.
  - **Amended 2026-10-21 (final review):** 96 × 15 min covers only 24 h, so `updateWidgetData` calls `buildTimelineEntries(data, 96, 15, { extendToDeadline: true })`, which appends one entry per hour at `deadline − k h + 1 s` and an expired entry at `deadline + 1 s` (hourly run capped at 8 days). A full week is 241 entries, about 260 KB.
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
  - **`__tests__/config/widget-privacy-plugin.test.ts`** (I10):
    - `buildWidgetPrivacyManifest()` has exactly the four reason codes under the right categories, and empty collected-data and tracking-domain lists. The serialized XML parses as a plist.
    - `addPrivacyManifestToTarget` on an `xcode`-package fixture project that has an `ExpoWidgetsTarget` target and no Resources phase adds the phase and exactly one `PrivacyInfo.xcprivacy` build file. A second run adds nothing.
    - A fixture without the target throws.
    - `app.json` lists this plugin immediately before `withHourglassWidgetBackground`.
  - **`deps.test.ts`:** `expo.autolinking.android.exclude` contains `expo-widgets`.
- **Device checks** (FR11 smoke): fresh install, the gallery preview, the update-over-build-18-without-opening case (including the gallery and placeholder **before** first open), and the countdown after more than an hour with the app closed.

**Success Criteria:**
- [ ] Every new widget test is written at the start of this FR, red before the change and green after it. The existing `widgetLayoutJs`, `widgetPolish`, `widgetVisualIos`, `bridge`, `clearWidgetData` and Android widget suites pass.
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

### FR8: Fingerprint config, runtime determinism and draft-PR CI

The CI Node bump, the `ota-publish.sh` fix and its `release/1.1` cherry-pick, and the eas-cli upgrade moved to FR1 (Decision 12), so they land on SDK 55 and every EAS build in this spec uses the same CLI.

**Requirements:**
- **Fingerprint (Decision 11).**
  - `fingerprint.config.js` exports exactly `{ sourceSkips: ['ExpoConfigVersions','PackageJsonScriptsAll','GitIgnore','ExpoConfigRuntimeVersionIfString','EasJson','Easignore','AutolinkingConfigPaths'] }`. Rewrite the header comment: it's 0.21.x / `balanced` now.
  - In `__tests__/config/fingerprint-config.test.ts`, `EXPECTED_SOURCE_SKIPS` becomes those 7 names, sorted. The enum-membership and no-`.cjs` guards stay.
  - `.fingerprintignore` is unchanged.
- **Runtime determinism.** On a clean tree, after a fresh `rm -rf node_modules && npm ci` on `feat/sdk-58`, run `npx expo-updates runtimeversion:resolve --platform ios` twice. This value is the baseline for FR9, FR10 and FR11.
- **Gates in CI.** Open the PR (`feat/sdk-58` → `main`) as a **draft** so CI runs. Merging waits for the ground rule. `app-tests` and `server-tests` are green on that PR.

**Success Criteria:**
- [ ] `fingerprint-config.test.ts` is red before the change and green after it.
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` prints the same 40-hex value on two consecutive runs on a clean tree, after a fresh `npm ci`. Record it.
- [ ] The draft PR's CI run is green on all jobs. Record the run URL.

---

### FR9: Local prebuild inspection, expo-doctor and fingerprint (checkpoint C)

Prove the generated native project is right **before** spending an EAS production build. Nothing here ships.

**Requirements:**
- **Throwaway copy (its own git repo, never the worktree's gitdir):**
  - `T=$(mktemp -d)`. Copy the worktree with an APFS clone that includes `node_modules` (`cp -cR "<worktree>" "$T/app"`).
  - **Then `rm "$T/app/.git"`.** That file is a `gitdir:` pointer into `WS/hourglassws/.git/worktrees/sdk58`. Git commands in the copy would read and rewrite that index in the off-limits checkout: prebuild's git-status check, and expo-updates' git-ignore workflow detection.
  - Then `git -C "$T/app" init -q && git -C "$T/app" add -A && git -C "$T/app" commit -qm scratch`. The copied `.gitignore` keeps `/ios`, `/android` and `node_modules` ignored, so the project still resolves as managed (CNG).
  - Resolve `npx expo-updates runtimeversion:resolve --platform ios` in `$T/app` **before** prebuilding (for the fingerprint comparison below).
  - Run `npx expo prebuild --platform ios --clean --no-install` **inside `$T/app` only**. Never prebuild in the worktree.
  - `$T` contains no spaces. EAS paths don't either.
- **Assert every row of contract I4** with `plutil -extract … raw`, `grep` and `grep -c`. Record the outputs.
- **Record every prebuild warning.** There must be none about `enableSceneSupport` or `requireFullScreen`.
- **Mandatory `pod install` and Release compile-only check (inspection; never archive or export).** This answers Q2 for Release, and checks the precompiled-modules path (spec-research F2.8) before the production build.
  - In `$T/app/ios`, run `pod install 2>&1 | tee "$T/pod.log"`. It exits 0. Record every `[Expo-precompiled]` line (`grep "Expo-precompiled" "$T/pod.log"`).
  - Run `xcodebuild -workspace Hourglassxo.xcworkspace -scheme Hourglassxo -configuration Release -destination 'generic/platform=iOS' -derivedDataPath "$T/dd" CODE_SIGNING_ALLOWED=NO build`. The app scheme builds the embedded `ExpoWidgetsTarget` as a target dependency.
  - It exits 0. In `"$T/dd/Build/Products/Release-iphoneos/Hourglassxo.app/PlugIns/ExpoWidgetsTarget.appex/"`, there's no `Frameworks/` directory and `PrivacyInfo.xcprivacy` exists.
  - On failure, record the first error and follow spec-research edge case 4 (the precompiled-modules fallback or hunk G). Fix it, then re-run FR9.
  - This Mac has Xcode 27.0 and EAS uses 27.1 (Decision 8), an accepted one-minor gap. A local pass doesn't replace the EAS builds; it front-runs them.
- **`npx expo-doctor`** (in the worktree) exits 0. Record the check count.
- **Fingerprint.** The worktree's `runtimeversion:resolve --platform ios` (after a fresh `npm ci`, FR8) equals the pre-prebuild value from `$T/app`. Compare iOS only; don't use `npx expo-fingerprint`.
- Delete `$T` when done.

**Success Criteria:**
- [ ] Every I4 row is PASS, with its command output pasted in the checklist, including the `ExpoWidgetsTarget` privacy-manifest row.
- [ ] The prebuild warning list is recorded, and has no scene or full-screen warning.
- [ ] `pod install` and the Release `xcodebuild` both exit 0. The `[Expo-precompiled]` list is recorded, and the appex has no `Frameworks/` but has `PrivacyInfo.xcprivacy`.
- [ ] `expo-doctor` exits 0.
- [ ] The fingerprint values are equal.
- [ ] `git -C "<worktree>" status --porcelain` is unchanged by FR9: the copy never touched the worktree's index.

---

### FR10: Docs

**Requirements:**
- **`TECH_STACK.md`:**
  - Set Expo SDK `~58.0.16`, React Native `0.88.0`, React `19.3.0`, and every row in I1.
  - Replace the `@react-navigation/*` rows with "expo-router (ships its own navigation fork since SDK 56)".
  - Remove the `@expo/ngrok` and `react-native-inner-shadow` rows. Add a note that `npx expo start --tunnel` installs ngrok on demand.
  - Add "Node ≥ 22.13 (CI and EAS run 22)" and "iOS ≥ 16.4".
  - Patched packages: "none". Describe the two local plugins, `withHourglassWidgetBackground` (I7) and `withHourglassWidgetPrivacyManifest` (I10).
  - Note that iOS pods use Expo's precompiled modules by default, and whether the Decision 9 `usePrecompiledModules: false` fallback was needed.
  - Re-word the Metro fix line to say it was re-verified on SDK 58 / RN 0.88, or keep it with the FR7 result.
- **`CLAUDE.md:69`:** "Expo SDK 58, React Native 0.88, Expo Router, TanStack Query v5".
- **`README.md`:** `:27` "Expo SDK 58 + React Native 0.88"; `:66` reworded (no patches today).
- **`docs/ARCHITECTURE.md`:**
  - New `### 5.7 Native launch & lifecycle (UIKit scenes)`: `SceneDelegate: ExpoAppSceneDelegate`, AppState through UIApplication notifications, the cold-start URL path through `connectionOptions`, notifications via the app delegate subscriber, and no tap routing.
  - `§7.2`: the `.atEnd` timeline, `env.date`, stored-layout precedence, the two `containerBackground`s, the transient placeholder red box before first open after an update, and the extension's own `PrivacyInfo.xcprivacy`.
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
    - The IPA `DT*` check, including the appex `PrivacyInfo.xcprivacy` and no-`Frameworks/` checks.
    - The eas-cli JSON shape.
    - Precompiled modules: record the `[Expo-precompiled]` lines; the `usePrecompiledModules: false` fallback.
    - The ITMS-91053 check for every binary, including `ExpoWidgetsTarget`.
    - Where the ASC key and `asc.js` come from in a worktree (Decision 16).
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
- [ ] `grep -n "SDK 58" CLAUDE.md README.md TECH_STACK.md` matches in all three. `grep -rnE "SDK 55|0\.83|@react-navigation|@expo/ngrok|inner-shadow" CLAUDE.md README.md TECH_STACK.md` prints nothing. (The plain word `ngrok` is allowed, for the `--tunnel` note.)
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
  - Confirm the ASC key is reachable from this worktree under Decision 16: `test -f .appstore/AuthKey_W4UV4XTKPC.p8 && git check-ignore -q .appstore/AuthKey_W4UV4XTKPC.p8` for option (a), or `eas credentials` showing the key for (b). Otherwise stop with "blocked: ASC key access".
  - Record HEAD, gate results and the local iOS runtime.
- **Build.** `eas build -p ios --profile production` on EAS cloud.
  - Record the build id, `gitCommitHash` (must equal HEAD) and runtime.
  - The log's "Spin up build environment" section names `macos-tahoe-26.6-xcode-27.1` / Xcode 27.1.
  - `eas build:list --platform ios --status finished --channel production --app-build-version 19 --limit 1 --json --non-interactive` returns that id, and its runtime equals the local resolve.
- **IPA check (contract I5).** Download `artifacts.buildUrl` into a new `mktemp -d`, unzip it, and `plutil -extract` each key from `Payload/*.app/Info.plist`. Then check the appex:
  - `Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/Info.plist` has no scene manifest.
  - `Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/PrivacyInfo.xcprivacy` exists and contains `CA92.1`, `1C8F.1`, `C617.1` and `35F9.1`.
  - `Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/Frameworks` doesn't exist.
- **Upload to TestFlight only.** `eas submit -p ios --profile production --id <build id>`. That's an upload to App Store Connect, not an App Review submission.
  - Record the ITMS-91053 result for every binary, including `ExpoWidgetsTarget`, next to the FR1 build 17/18 baseline. Then take one branch:
    - **None:** proceed.
    - **It names only `ExpoWidgetsTarget`:** compare the listed categories with I10.
      - A category or reason that I10 lacks: add it to `buildWidgetPrivacyManifest()` and its test, and rebuild with the next unused build number before "ready to submit".
      - All already declared: record it, don't block, and open a follow-up.
    - **It names the main app binary:** add the reason to `ios.privacyManifests` and the spec 03 contract test, then rebuild with the next unused build number.
    - **Build 19 never reaches `VALID`:** this is a release blocker. Stop and escalate.
  - The ASC `buildBundles[].sdkBuild` starting with `24` is an optional extra check; record "skipped" if the API is unreachable.
- **TestFlight smoke.** The user runs the checklist's "TestFlight smoke" section on an iOS 27 iPhone and an iOS 27 iPad. It covers:
  - Spec 05's 8 checks.
  - Foreground refresh.
  - A notification tap from a killed state.
  - Widget refresh on app open, and the build-18 → 19 update with no app open. Before first open, it records the gallery and placeholder result (Decision 5 (i)). On first open, the 1.1.0 session must survive: straight to the tabs, the same account, no onboarding or credentials screen.
  - The `hourglassws://` deep link, cold and warm.
  - Sign-out clearing the widget and the log.
  - The 10-minute memory check.
  - The resizability matrix.
- **ASC prep for 1.2.0.** Do this when ASC allows a new version record (edge case 11), using `.appstore/asc.js` from this worktree (Decision 16) with `--dry-run` first (spec 05):
  - `create-version 1.2.0` (phased release, `AFTER_APPROVAL`).
  - `set-whats-new`, including "Requires iOS 16.4 or later".
  - `attach-build <19>`.
  - Confirm the age-rating "social media" answer is still `false`.
- **Stop at "ready to submit".** Record "ready to submit" in the checklist only after every smoke item passes. Submitting is the user's call.

**Success Criteria:**
- [ ] The EAS build id, `gitCommitHash`, image line and runtime are recorded. The `build:list` check matches.
- [ ] All I5 values are pasted and match, including the three appex rows.
- [ ] The ITMS-91053 result and its branch are recorded.
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
| `scripts/ota-publish.sh:63-72,82-110` | Local runtime resolve from `node_modules`; audience guard JSON read (FR1) |
| `jest.config.js:19-21`, `metro.config.js`, `babel.config.js` | Test transform list; NativeWind workaround; reanimated plugin comment |
| `__tests__/config/{app-config,app-config-introspect,fingerprint-config}.test.ts`, `__tests__/ci-gates.test.ts` | Existing guards to extend; spec 03's typed-import contract |
| `/tmp/spec10.o6hmwI/*`, `/tmp/spec10crit.zF69wC/x/*` (ephemeral) | Tarballs read for this spec and its critique pass (`react-native@0.88.0`, `expo-widgets@58.0.21`, `@expo/ui@58.0.21`, `expo-modules-core@58.0.23`, `expo-modules-autolinking@58.0.13`, `expo-build-properties@58.0.11`, `@expo/config-plugins@58.0.9`, `expo-template-bare-minimum@{55.0.16,58.0.25}`, `eslint-config-expo@58.0.4`, `eslint-plugin-react-hooks@7.1.1`, `@testing-library/react-native@14.1.0`, `expo-secure-store@58.0.2`, `react-native-android-widget@0.23.0`); re-create with `npm pack` |
| `src/widgets/ios/HourglassWidget.tsx:29`, `src/hooks/useApprovalItems.ts:155-162`, `server/jest.config.js` | Direct `@expo/ui` import; approval refetch on error; server tests on the root jest |

### Files to Create/Modify

See spec-research "Files to Create/Modify". Additionally, `site/support.html` is modified in FR10 (iOS 16.4 minimum).

### Interface Contracts

Normative: spec-research I1 (`package.json`), I2 (`app.json`), I3 (`eas.json`), I4 (prebuilt project), I5 (IPA), I6 (widget layout), I7 (widget-background plugin), I8 (`fingerprint.config.js`), I9 (CI) and I10 (widget privacy-manifest plugin). Test-facing summary:

```typescript
// __tests__/config/app-config.test.ts (added block; typed JSON imports only)
describe('10-sdk-58-ios-27', () => {
  it('eas cli.version floor is >= 25.2.0');                                   // FR1
  it('plugins never mention enableSceneSupport or deploymentTarget');         // FR5
  it('any expo-build-properties entry is exactly { ios: { usePrecompiledModules: false } }'); // FR5
  it('ios.infoPlist has no UIApplicationSceneManifest; ios has no deploymentTarget');
  it('expo.version is semver >= 1.2.0');
  it('ios.buildNumber is an integer string >= 19');
  it('supportsTablet stays true and requireFullScreen is not true');          // flips under Decision 10 (b)
  it('eas production ios.image is a full xcode-27 image name, not an alias');
  it('eas development and preview have no ios.image');
  it('web.output stays static');
  it('withHourglassWidgetBackground is listed immediately before expo-widgets');            // FR6
  it('withHourglassWidgetPrivacyManifest is listed immediately before withHourglassWidgetBackground'); // FR6
});

// __tests__/config/sdk58-migration.test.ts (new; fs source walk)
describe('10 FR2/FR3/FR4 — source migrations', () => {
  it('no @react-navigation imports');                 // FR2 (useIsFocused) then FR4 (all)
  it('no Skia.Path.Make() and no .copy().trim(');     // FR2
  it('no whatwg-fetch internals (_bodyInit|_bodyText|_bodyBlob)'); // FR3
  it('no expo-router/unstable-native-tabs, no root Tabs import, no initialRouteName='); // FR4
  it('(auth) layout exports unstable_settings.anchor === "welcome"'); // FR4
  it('components/haptic-tab.tsx is absent');           // FR2
  it('test files never jest.mock or requireActual @react-navigation/*'); // FR4 (second walk over __tests__/__mocks__)
});
```

### Data Flow

```
aade79b (build 18) ──► tag build-18, release/1.1 (1.1.x hotfix lane, OTA via ota-publish.sh)
        │
        ▼ feat/sdk-58
FR1 guards + CI Node 22 + ota-publish.sh dual-shape (cherry-picked to release/1.1, then npm ci) + eas-cli ≥ 25.2
    + ITMS-91053 baseline (J) ─► FR2 nav/Skia/dead code ─► FR3 fetch hardening
        ─► SDK 55 dev client + Metro :8082 device run              [checkpoint A: SDK 55, gates green]
        │
        ▼
FR4 package.json ← all I1 ranges ─► one npm install ─► expo install --check/--fix; patches deleted;
    58-only imports; RNTL 14 auth-screens rewrite; lint fallout; server tests
        ─► EAS development build (auto → sdk-58 image; [Expo-precompiled] lines) ─► device + Metro :8082   [checkpoint B]
        ▼
FR5 app.json 1.2.0/19, eas image pin ─► FR6 widget JS + background plugin + extension privacy-manifest plugin
    ─► FR7 device pass ─► FR8 fingerprint skips, runtime baseline, draft PR CI
        ▼
FR9 mktemp copy (own git init) ─► expo prebuild --clean ─► Info.plist / SceneDelegate / pbxproj / entitlements /
    PrivacyInfo (app + appex) / widget Swift asserts ─► pod install + Release xcodebuild (CODE_SIGNING_ALLOWED=NO);
    expo-doctor; fingerprint equality                                             [checkpoint C]
        ▼
FR10 docs ─► FR11 eas build (macos-tahoe-26.6-xcode-27.1, Xcode 27.1 27A9275) ─► IPA DT* (iphoneos27, 24…, 27…)
    + appex PrivacyInfo / no Frameworks ─► eas submit (ASC key per Decision 16) ─► ITMS-91053 branch
    ─► smoke on iOS 27 iPhone + iPad ─► "ready to submit"                          [checkpoint D]
        ▼ (user decides)
App Review ─► release ─► spec 04 runbook A baseline OTA ─► merge to main ─► retire release/1.1 later
```

### Test Plan

| FR | Test | Location | Red before? |
|---|---|---|---|
| FR1 | `install.exclude` iff patch; exclude entries are direct deps; no inner-shadow; spec 06 rules 1–6 + fixtures | `__tests__/config/deps.test.ts` | red (inner-shadow, iff wording) |
| FR1 | Node ≥ 22 even; `ota-publish.sh` both JSON shapes; `cli.version` ≥ 25.2.0 | `__tests__/ci-gates.test.ts`, `__tests__/scripts/ota-publish.test.ts`, `app-config.test.ts` | red |
| FR2 | No `useIsFocused` from react-navigation; no `Skia.Path.Make()`; no `.copy().trim(`; haptic-tab absent | `__tests__/config/sdk58-migration.test.ts` | red |
| FR2 | ScrubCursor builds via `MakeFromSVGString`; AIArcHero `Path` `start`/`end` | `src/components/__tests__/ScrubCursor.test.ts`, `AIArcHero*.test.tsx` | red |
| FR2 | `useStaggeredEntry` imports `useIsFocused` from `expo-router`; `useIsFocused` stubs live in `expo-router` mocks | `useStaggeredEntry.test.ts`, `FadeInScreen.test.tsx`, `index.test.tsx`, `indexConeIntegration.test.tsx`, `AITab.test.tsx`, `AITabConeIntegration.test.tsx` | red (`useStaggeredEntry` regex); the others keep their counts |
| FR3 | Single body read; empty and whitespace-only 200/204; non-JSON 2xx → `ApiError`; `FetchError` → `NetworkError`; pushToken never reads the body | `src/__tests__/api/client.test.ts`, `__tests__/client.test.ts`, `src/__tests__/lib/pushToken.test.ts` | red (non-JSON, whitespace, single-read helper) |
| FR4 | SDK 58 floors; single copies; css-interop = nativewind dependency; no `@react-navigation/*`; no patches | `deps.test.ts` | red |
| FR4 | No react-navigation imports (source and test files); native-tabs/js-tabs paths; `unstable_settings` | `sdk58-migration.test.ts`, `native-tabs.test.tsx`, `FloatingPillTabBar.test.ts` | red |
| FR4 | Host-query rewrite (no `UNSAFE_`, awaited events); themes from the `expo-router` mock | `__tests__/auth-screens.test.tsx`, `app/__tests__/layout-notifications.test.tsx` | count-preserving rewrite (red = fails to run on RNTL 14 / without `@react-navigation`) |
| FR5 | The `10-sdk-58-ios-27` block | `app-config.test.ts` | red |
| FR5 | `sdkVersion` 58; `UIRequiresFullScreen` false; spec 03 guards | `app-config-introspect.test.ts` | red (sdkVersion is red until FR4; FR5 adds it) |
| FR6 | Undefined props; `containerBackground` on roots; spacing set; `env.date`; globals exist in `@expo/ui` | `widgetLayoutJs.test.ts` | red |
| FR6 | Plugin transform, idempotence, throw, plugin order | `__tests__/config/widget-background-plugin.test.ts` | red |
| FR6 | Extension privacy manifest: four reasons, Resources phase added once, missing-target throw, plugin order | `__tests__/config/widget-privacy-plugin.test.ts` | red |
| FR6 | Android autolinking exclude | `deps.test.ts` | red |
| FR7 | Regression tests per fix | component test files | written per fix |
| FR8 | 7 `sourceSkips` | `fingerprint-config.test.ts` | red |
| FR9–FR11 | Commands and device checks | checklist | n/a |

**Mocks needed:** `makeExpoLikeResponse` (FR3), the Skia mock `MakeFromSVGString` (FR2), `expo-router` mocks carrying `useIsFocused` (FR2) and the theme exports (FR4), a `containerBackground` stub in the widget layout harness (FR6), the expo-widgets 58 `widgetSwift` template fixture (FR6), and an `xcode`-package fixture project with an `ExpoWidgetsTarget` target (FR6). Everything else is static file reads.

**Red-test timing:** each FR writes its red tests at its own start and pushes only once all three gates exit 0 (ground rules).

### Edge Cases

| Case | Handling |
|---|---|
| App Review rejects build 18 | Fix on `release/1.1`. A 1.1.0 rebuild takes the next build number, and 1.2.0 then takes the one after (the range tests still pass). Cherry-pick the fix forward |
| A 1.1.x OTA is needed during the migration | Publish from `release/1.1` with `scripts/ota-publish.sh`. FR1 already cherry-picked the dual-shape fix there, before the CLI upgrade |
| `npx expo install` fails with ERESOLVE | Find the conflicting peer (RNTL is the known one) and fix that range. Never use `--legacy-peer-deps` or `--force` |
| Two copies of css-interop, test-renderer, expo-widgets, @expo/ui or react | The `deps.test.ts` single-copy case fails. Align the declared range (e.g. css-interop exactly equal to nativewind's dependency) |
| The codemod misses imports (expo/expo#46481) | The `sdk58-migration.test.ts` source walk is the authority |
| Strict TS API / TS 6 fallout over 60 errors | Spec 09 FR5 escape hatch with a dated follow-up |
| A widget shows the placeholder after the update, without the app opening | That's what the FR6 local plugin is for. If it still happens, record it and check the plugin order in the FR9 prebuild (`.modifier(HourglassContainerBackground())` must be present) |
| `pod install` or the extension link fails ("… unavailable in application extensions", a duplicate pod across targets, undefined symbols in `ExpoWidgetsTarget`) | Find the pod in the `[Expo-precompiled]` lines. If it's prebuilt, use the Decision 9 fallback `["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`, which the FR5 test allows; a Podfile setting can't reach a prebuilt XCFramework. If `ExpoWidgets` is source-built and needs it, re-add only `APPLICATION_EXTENSION_API_ONLY=No` for that pod, preferably with a local Podfile `post_install` config plugin. If patch-package is used instead, pin exactly and add `install.exclude`, as spec 06 does |
| `npm run lint` goes red on the React Compiler rules (eslint-plugin-react-hooks 7) | Decision 12: record the per-rule counts, fix the local cases, and turn off only named compiler rules with a dated follow-up. Never turn off `rules-of-hooks`/`exhaustive-deps` |
| The widget placeholder (or a never-opened fresh install's gallery) shows the red box before 1.2.0's first open | Expected under Decision 5 (i); record it in smoke 17. If J rejects it, open the `ios.initialLayout` follow-up. Don't block on it |
| ITMS-91053 names `ExpoWidgetsTarget` | The FR11 branch: add a missing category to I10 and rebuild, or record it as a follow-up if already declared |
| The `.appstore/` copy (Decision 16) isn't approved | FR5's build-number check and FR11's upload and ASC prep record "blocked: ASC key access" until J chooses |
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
4. **Spec 08 FR4 / spec 09 FR3:** no `expo-build-properties` on the direct path. The only exception is the Decision 9 precompiled-modules fallback (`ios.usePrecompiledModules: false`), used only on a recorded failure.
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
12. **Critique pass (spec-research F4):**
    - The widget extension gets no privacy manifest from RN's aggregation, and spec 05's remedy went through the deleted patch. Fixed by I10.
    - SDK 58 precompiles Expo modules by default. FR9's `pod install` and Release compile are now mandatory.
    - On iOS 27, `requireFullScreen` requests discrete, orientation-honoring resizing on iPhone and iPad. It no longer opts out, but it's not inert either (Decision 10).
    - The placeholder shows a red box before 1.2.0 is first opened.
    - RNTL 14 removed `UNSAFE_*` (the `auth-screens` rewrite).
    - eslint-plugin-react-hooks 7 adds the compiler lint rules.
    - Six more test files hard-code `@react-navigation`.
    - The ASC key and `asc.js` aren't in this worktree (Decision 16).
    - `release/1.1` cherry-picking, eas-cli and CI Node 22 move to FR1.
    - The FR9 copy needs its own git repo.
    - 27A9275 is the released Xcode 27.1, not an RC.

---

## Dependencies

### Internal
- On `main` at `aade79b`: specs 01–05 and 07 merged (CI already gates on typecheck and lint).
- Spec 06 FR1–FR4: ported in FR1. Spec 06 FR5: superseded.
- Specs 08 and 09: superseded by this spec. Their research is reused.

### External
- Expo SDK 58 stable (`expo@58.0.16` latest, 2026-10-20).
- EAS image `macos-tahoe-26.6-xcode-27.1` listed (re-fetched 2026-10-20). Its Xcode, 27A9275, is the released Xcode 27.1 (developer.apple.com/news/releases, 2026-10-15).
- The App Store Connect agreement accepted by the Account Holder.
- An iOS 27 iPhone and an iOS 27 iPad registered for internal distribution (`eas device:create`), for the development builds and TestFlight. macOS 27 for iPhone Mirroring.
- Access to the ASC key and `asc.js` from this worktree (Decision 16, J's OK).
- The build 17 and 18 ITMS-91053 email results (J, FR1).

### Assumptions
- The project stays CNG: `ios/` and `android/` are gitignored, and AppDelegate isn't customized.
- Apple's iOS 27 SDK rule takes effect in April 2027. v1.2.0 ships well before then.
- The `onLayout`-driven chart sizing re-measures on window resize. FR11's matrix checks this.
