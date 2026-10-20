# Implementation Checklist

Spec: `10-sdk-58-ios-27`
Feature: `store-compliance`

**Phases:**
- **Phase A:** SDK 55, FR1–FR3, ending at **checkpoint A**: three gates green, nothing native changed, and one device run of the FR3 tree on an SDK 55 dev client.
- **Phase B:** SDK 58, FR4–FR8. **Checkpoint B** (dev build boots on device) comes at the end of FR4.
- **Phase C:** FR9 local prebuild inspection, with a mandatory `pod install` and Release compile (**checkpoint C**), then FR10 docs.
- **Phase D:** FR11, from build 19 to "ready to submit" (**checkpoint D**), including the TestFlight smoke.

**Ground rules (every phase):**
- Work only in `/Users/Trilogy/Documents/Claude Code/hg-worktrees/sdk58` on `feat/sdk-58`. Never touch `WS/hourglassws`: its Metro is on port 8081, so this worktree uses `--port 8082`.
  - The single exception, only with J's OK under Decision 16 (a), is one read-only `cp -R` of its gitignored `.appstore/` before FR5.
- EAS **cloud** builds only. Never run `eas build --local`, and never archive or export locally.
- Never run `eas update --channel production` from this branch.
- `main` stays at `aade79b` until build 18's review is resolved **and** checkpoint D passes.
- Never submit to App Review. Stop at "ready to submit" (J's call).
- Never use `--legacy-peer-deps` or `--force`.
- **Every pushed commit is green.**
  - Each FR writes its red tests at its own start, runs them, and records the red list here.
  - Tests and implementation are then committed together once `npm test`, `npm run typecheck` and `npm run lint` all exit 0.
  - Red-only commits, including the `962d413` cherry-pick, stay local until the FR is green.

**Owner tags:** **(C)** Claude, **(J)** Jaime.

**Decisions needing J before the step that uses them** (spec-research Q1/Q1b):
- Decision 3 (icons), Decision 4 (test renderer, incl. the auth-screens rewrite) and Decision 5 (widget fallbacks, the privacy-manifest plugin, the transient placeholder red box): before FR4.
- Decision 10 (iPad (a) vs (b)): before FR5.
- Decision 16 (ASC key access): before FR5.

---

## Phase A.0: Test Foundation (SDK 55)

### FR1: Hotfix lane, dependency guards and release tooling
- [ ] (C) Pre-flight:
  - `git status --porcelain` is empty, and `git rev-parse HEAD` is `aade79b` or a spec-only commit on top of it.
  - `node --version` is ≥ 22.13.
  - Record the `npm test`, `npm run typecheck` and `npm run lint` baselines (pass counts, exit codes).
- [ ] (C) `git cherry-pick 962d413` (**once**; it isn't picked again in A.1). That brings `__tests__/config/deps.test.ts` (red). If spec 06's `checklist.md` conflicts, take the incoming version (`git checkout --theirs features/app/store-compliance/specs/06-dependency-hygiene/checklist.md`).
- [ ] (C) Edit `deps.test.ts`:
  - Delete the `FR5: refreshed to the latest SDK 55 patch line` describe.
  - Rewrite FR4 as "contains X iff `patches/X+*.patch` exists" plus "every entry is a direct dependency". An absent list is allowed when there are no patches.
  - Add "`react-native-inner-shadow` is in neither `dependencies` nor `devDependencies`".
- [ ] (C) `ci-gates.test.ts`: every `node-version` is an even major ≥ 22, and at least one exists.
- [ ] (C) `__tests__/scripts/ota-publish.test.ts`: the guard accepts build JSON with `runtime.version` and with `runtimeVersion`.
- [ ] (C) `app-config.test.ts`: a new `describe('10-sdk-58-ios-27')` block containing only the `eas.json` `cli.version` floor ≥ 25.2.0 case (FR5 and FR6 add the rest).
- [ ] (C) Run them. Expect red on:
  - rule 3 (`^55.0.5`), `--error-on-fail`, `@expo/ngrok`, the exclude and inner-shadow;
  - the Node 22 case, both `ota-publish` shapes, and `cli.version`.
  - The fixture and unit cases stay green. Record the counts.

### FR2: Forward-compatible navigation, dead code and Skia
- [ ] (C) Create `__tests__/config/sdk58-migration.test.ts` with the FR2 cases: no `useIsFocused` from `@react-navigation/native`, no `Skia.Path.Make()`, no `.copy().trim(`, and `components/haptic-tab.tsx` absent.
- [ ] (C) `ScrubCursor.test.ts`: assert the `MakeFromSVGString` argument for `(scrubX=40, chartHeight=120, topPadding=8)` is `M 40 8 L 40 112`. Remove the `moveTo`/`lineTo` assertions.
- [ ] (C) `AIArcHero*.test.tsx`: assert the fill `Path` gets `start={0}` and an `end` that is the sweep shared value.
- [ ] (C) `src/hooks/__tests__/useStaggeredEntry.test.ts:132-135`: invert to `useIsFocused … from 'expo-router'`, and assert `@react-navigation` is absent.
- [ ] (C) Record the current test counts of `FadeInScreen.test.tsx`, `index.test.tsx`, `indexConeIntegration.test.tsx`, `AITab.test.tsx` and `AITabConeIntegration.test.tsx`. Their mocks move in A.1, and the counts must not change.
- [ ] (C) Run them. All of the new assertions are red. Record.

### FR3: `expo/fetch` readiness
- [ ] (C) Add `makeExpoLikeResponse({ status, body, headers })` to a shared test helper. A second `text()`/`json()` call throws `TypeError("Failed to execute 'text' on 'Response': Response body is already used.")`.
- [ ] (C) Tests in `src/__tests__/api/client.test.ts` and `__tests__/client.test.ts`:
  - Every path (mint OK and error, GET and PUT, each with and without the `creds` retry) passes with the helper.
  - 200 empty, 204 empty, 200 and 204 whitespace-only (`' '`, `'\n'`), and 200 `{}` bodies, for GET and PUT.
  - A 200 `text/html` body → `ApiError` with `statusCode` 200, for GET **and** PUT.
  - `class FetchError extends Error {}` rejection → `NetworkError` with the message preserved.
- [ ] (C) `src/__tests__/lib/pushToken.test.ts`: `registerPushToken` never calls `text()` or `json()` on the response.
- [ ] (C) `sdk58-migration.test.ts`: no `_bodyInit|_bodyText|_bodyBlob` in source.
- [ ] (C) Run them. The non-JSON → `ApiError` and whitespace cases are red; record any others.

## Test Design Validation (MANDATORY), Phase A

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run the `red-phase-test-validator` agent on `deps.test.ts`, `ci-gates.test.ts`, `ota-publish.test.ts`, `sdk58-migration.test.ts`, the ScrubCursor, AIArcHero and useStaggeredEntry tests, and the client tests.
- [ ] Every FR1–FR3 success criterion has a test, or a recorded command check.
- [ ] The source-walk tests can't pass vacuously. Each one asserts that the walk visited at least 50 files and found the known-good sites (e.g. `app/_layout.tsx`).
- [ ] `makeExpoLikeResponse` really throws on a second read: a self-test calls `text()` twice and expects the `TypeError`.
- [ ] Fix any issues before proceeding.

---

## Phase A.1: Implementation (SDK 55)

### FR1
- [ ] (C) `git tag build-18 aade79b && git branch release/1.1 aade79b && git push origin build-18 release/1.1`. Record `git rev-parse build-18 release/1.1`.
- [ ] (C) `git cherry-pick 96035ea` (**only** this one; `962d413` was picked in A.0).
  - Resolve the `package.json` conflict by hand, keeping `typecheck`/`lint` and adding the strict `postinstall`.
  - For spec 06's `checklist.md`, take the incoming version.
  - Regenerate the lockfile with `npm install` instead of resolving it by hand.
- [ ] (C) Remove `react-native-inner-shadow` (`npm uninstall react-native-inner-shadow`) and `git rm __mocks__/react-native-inner-shadow.ts`.
- [ ] (C) `rm -rf node_modules && npm ci`. Exit 0, both patches listed as applied, no warnings.
- [ ] (C) `.github/workflows/test.yml`: `node-version: '22'` in both jobs.
- [ ] (C) `scripts/ota-publish.sh:86-95`: read `(b.runtime && b.runtime.version) ?? b.runtimeVersion`. FR1 tests green. Commit.
- [ ] (C) Cherry-pick to `release/1.1`, inside this worktree:
  - `git switch release/1.1 && git cherry-pick <sha> && rm -rf node_modules && npm ci && npm test`.
  - `git push origin release/1.1`.
  - `git switch feat/sdk-58 && rm -rf node_modules && npm ci`.
  - **Record no runtime value before this last `npm ci` finishes.**
  - Record the `release/1.1` test result and `git log release/1.1 --oneline -1 -- scripts/ota-publish.sh`.
- [ ] (C) `npm i -g eas-cli@latest`. Record `eas --version` (≥ 25.2.0). Set `eas.json` `cli.version` to `">= 25.2.0"`.
- [ ] (J) **ITMS-91053 baseline (before FR4 starts).** In the App Store Connect processing emails for builds 17 and 18, search for `ITMS-91053`. Record "none", or each binary and API category listed:
  - Build 17: ______
  - Build 18: ______
- [ ] (C) `npx expo install --check` exits 0. Three gates green. `deps.test.ts`, `ci-gates.test.ts`, `ota-publish.test.ts` and the `cli.version` case are green. Record.

### FR2
- [ ] (C) `useIsFocused` from `'expo-router'` at `FadeInScreen.tsx:18`, `useFocusKey.ts:2` and `useStaggeredEntry.ts:29`.
- [ ] (C) Test mocks:
  - In `app/(tabs)/__tests__/index.test.tsx:54`, `indexConeIntegration.test.tsx:45`, `src/components/__tests__/AITab.test.tsx:168` and `AITabConeIntegration.test.tsx:160`, move the `useIsFocused` stub into the existing `expo-router` mock and delete the `@react-navigation/native` mock.
  - In `FadeInScreen.test.tsx:22-24`, replace the `requireActual('@react-navigation/native')` mock with `jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }))`.
  - Confirm each file's test count is unchanged.
- [ ] (C) `git rm components/haptic-tab.tsx src/components/__tests__/HapticTab.test.tsx`.
- [ ] (C) Skia sites:
  - `ScrubCursor.ts` → `MakeFromSVGString`.
  - `AIArcHero.tsx:146-150` → `<Path start={0} end={sweepProgress}>`, with the `useDerivedValue` trim removed.
  - `AIArcHero.tsx:131` fallback → `?? Skia.Path.MakeFromSVGString('M 0 0')!`.
- [ ] (C) Skia mock: add `MakeFromSVGString` and remove `moveTo` from the path stub.
- [ ] (C) FR2 tests green. Three gates green.

### FR3
- [ ] (C) `parseBody`:
  - `text.trim() === ''` → `undefined`.
  - Otherwise wrap `JSON.parse` and throw `ApiError(response.status, 'Invalid JSON response body')` on failure.
  - Update the doc comment with why PUTs also get `ApiError` (captive portal / proxy 200 HTML; `useApprovalItems.ts:155-162` refetches).
- [ ] (C) Fix any path the single-read helper exposes; none is expected.
- [ ] (C) FR3 tests green. Three gates green.

### Checkpoint A
- [ ] (C) Record:
  - HEAD, and the `npm test`/`typecheck`/`lint` counts and exit codes.
  - `git diff aade79b -- app.json` is empty, and `git diff aade79b -- eas.json` shows only `cli.version` (nothing native changed).
- [ ] (J/C) **Device run on SDK 55 (Decision 2).**
  - Dev client: an existing SDK 55 dev build (J: which one? ______), or `eas build -p ios --profile development` on this tree (`auto` → `sdk-55` image; build id ______).
  - `npx expo start --dev-client --port 8082` from this worktree. Confirm `lsof -i :8081` still shows the WS server untouched.
  - Results:
    - `AIArcHero` sweep animates to the right %: ______
    - Overview/Trend scrub-cursor line draws and follows the finger: ______
    - `FadeInScreen` / `useStaggeredEntry` entry animations on tab focus: ______
    - One approve and one reject on QA succeed (empty-body PUTs, no error): ______
- [ ] (C) Push `feat/sdk-58` (all of Phase A is green).

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

## Phase B.0: Test Foundation (FR4 only)

Only FR4's tests are written here. FR5–FR8 write their red tests at the start of their own FR (ground rules), so no red test ever sits on a green tree.

### FR4
- [ ] (C) `deps.test.ts` `SDK 58 line` describe:
  - Floors: `expo` major ≥ 58 with no prerelease; RN `0.N` with N ≥ 88; `expo-widgets` and `@expo/ui` major equal to `expo`'s; reanimated ≥ 4.7.1 and worklets satisfies `0.13.x`; Skia ≥ 2.14.0; victory major ≥ 42.
  - `@expo/ui` is a direct dependency.
  - async-storage is exactly `2.2.0`.
  - `react-test-renderer` equals `react`; `@react-native/jest-preset` `0.N` equals RN's.
  - Single copies of `react`, `react-native`, `expo-widgets`, `@expo/ui`, `test-renderer` and `react-native-css-interop`.
  - css-interop equals nativewind's dependency spec.
  - No `@react-navigation/*` and no `patches/*.patch`.
- [ ] (C) `sdk58-migration.test.ts` FR4 cases:
  - no `from '@react-navigation/`, no `unstable-native-tabs`, no root `Tabs` import from `'expo-router'`, no `initialRouteName=`;
  - `(auth)` `unstable_settings.anchor === 'welcome'`;
  - a second walk over test files finds no `jest.mock('@react-navigation/` or `requireActual('@react-navigation/`.
- [ ] (C) `native-tabs.test.tsx`: expect `expo-router/native-tabs` and `expo-router/js-tabs`, and the absence of `unstable-native-tabs`.
- [ ] (C) `FloatingPillTabBar.test.ts:310-314`: expect `from 'expo-router/js-tabs'`, and the absence of `@react-navigation/bottom-tabs`.
- [ ] (C) Record the current test counts of `__tests__/auth-screens.test.tsx` and `app/__tests__/layout-notifications.test.tsx`. Both are rewritten in B.1 and must keep their counts.
- [ ] (C) Run the FR4 set and record the red list by test name.

## Test Design Validation (MANDATORY), Phase B

- [ ] Run `red-phase-test-validator` on every Phase B.0 test file. Run it again at the start of FR5, FR6 and FR8 on that FR's new tests.
- [ ] Every floor is a floor, not a window: no case fails on SDK 59 just because the number rose.
- [ ] Single-copy checks read lockfile keys (`node_modules/*/node_modules/<pkg>`), not `npm ls` output.
- [ ] The widget-plugin fixture (FR6) is the real 58.0.21 template text, not paraphrased.
- [ ] `app-config.test.ts` uses typed JSON imports only (spec 03 contract) and reads optional keys with `toHaveProperty`.
- [ ] Fix any issues before proceeding.

---

## Phase B.1: Implementation (SDK 58)

### FR4: dependency line (atomic; one commit once green)
- [ ] (C) `git rm patches/expo-widgets+55.0.5.patch patches/react-native-reanimated+4.2.1.patch`. Remove `expo.install.exclude`.
- [ ] (C) **Write every I1 range into `package.json` first:**
  - `expo ~58.0.16`, every bundled `expo-*` and RN package, `@expo/ui ~58.0.21` (new direct), `expo-widgets ~58.0.21`.
  - The non-bundled packages.
  - Every devDependency: RNTL 14, `test-renderer 1.3.0`, Jest 30, `jest-expo ~58.0.11`, `@react-native/jest-preset 0.88.0`, `react-test-renderer 19.3.0`, TS/ESLint.
  - Remove `@react-navigation/native`, `@react-navigation/bottom-tabs` and `@react-navigation/elements`.
- [ ] (C) **Then** one `npm install`. Record its summary. On ERESOLVE, fix the conflicting range; never `--force`.
- [ ] (C) **Then** `npx expo install --check`, and `npx expo install --fix` for bundled drift, until `--check` exits 0. Record each run and any drift against I1. Never start with `npx expo install expo@~58.0.16`.
- [ ] (C) 58-only edits:
  - `app/_layout.tsx:6` → `'expo-router'`.
  - `FloatingPillTabBar.tsx:18` → `'expo-router/js-tabs'`.
  - `app/(tabs)/_layout.tsx:23` → `'expo-router/native-tabs'`; `:24` → `'expo-router/js-tabs'`.
  - `app/(auth)/_layout.tsx`: drop `initialRouteName`, add `export const unstable_settings = { anchor: 'welcome' };`.
- [ ] (C) Optionally run the codemod, then `grep -rn "@react-navigation" app src components hooks constants __tests__ __mocks__`. Nothing may remain.
- [ ] (C) `app/__tests__/layout-notifications.test.tsx`:
  - Add `DarkTheme`, `DefaultTheme` and the `ThemeProvider` passthrough to its `expo-router` mock (`:84-97`).
  - Delete the `@react-navigation/native` mock (`:103-110`).
  - The test count is unchanged.
- [ ] (C) `src/__tests__/hooks/useWidgetSync.test.ts`: `await` `renderHook`/`rerender`/`unmount`.
- [ ] (C) **Rewrite `__tests__/auth-screens.test.tsx` onto host queries (Decision 4):**
  - Replace all 73 `UNSAFE_*` calls (71 lines) with `getByText` / `getByRole` / `getByPlaceholderText` / `getByTestId`.
  - Add `testID`s in `app/(auth)/*.tsx` only where nothing else fits, and list them.
  - `await` every `render`, `fireEvent.*` and `act`.
  - `grep -c UNSAFE_` → 0. The test count equals the B.0 record.
- [ ] (C) `jest.config.js`: add `standard-navigation` to the allow-list, and add `/node_modules/react-native-reanimated/plugin/` and `/node_modules/@react-native/babel-preset/` as extra `transformIgnorePatterns` entries.
- [ ] (C) `babel.config.js:19-22`: rewrite the comment (no reanimated-patch reference).
- [ ] (C) Fix typecheck fallout: Strict TS API, TS 6, `jsx: react-jsx`. Record the error count before fixing. If it's over 60, use the escape hatch and record a dated follow-up.
- [ ] (C) **Lint fallout (Decision 12).**
  - Right after the install, record `npx expo lint -f json` error counts per rule: ______
  - Fix the local, behavior-neutral cases (e.g. `app/(tabs)/index.tsx:201` `new Date()` in render).
  - If more than 30 errors remain, or a fix would change behavior, turn off only the named `react-hooks/<rule>` entries in `eslint.config.js`, each with a dated `TODO(2026-12-31, spec-10 follow-up)`. Never turn off `rules-of-hooks` or `exhaustive-deps`.
  - Record the rules turned off: ______
- [ ] (C) `rm -rf node_modules && npm ci`. Exit 0 and `No patch files found`. `npm ls --all 2>&1 | grep -E "invalid|UNMET"` prints nothing.
- [ ] (C) Gates, with **no allowed failures**: `npm test` 0, `npm run typecheck` 0, `npm run lint` 0, and `(cd server && npm ci && npm test)` 0. Commit and push.

### Checkpoint B (device)
- [ ] (C) `eas build -p ios --profile development` on cloud. Record:
  - the build id;
  - the image line from "Spin up build environment";
  - every `[Expo-precompiled]` line from "Install pods": ______
- [ ] (C) If `pod install` or the `ExpoWidgetsTarget` link fails because of precompiled modules, record the failing line, apply the Decision 9 fallback (`["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`), and rebuild.
- [ ] (J) Install it on the iOS 27 iPhone. Record the iOS version: ______
- [ ] (C) `npx expo start --dev-client --port 8082` from this worktree. Confirm `lsof -i :8081` still shows the WS server untouched.
- [ ] (J/C) Cold launch → sign in with the QA manager account → Home, Overview, AI and Requests each render. Record pass/fail per tab. A widget placeholder is expected until FR6.
- [ ] (C) Record `(cd server && npm test)` again on this tree.

### FR5
- [ ] (J) Decision 16 (ASC key access) chosen: ______. Under (a): `cp -R "<main checkout>/.appstore" .appstore`, then `git check-ignore -q .appstore/AuthKey_W4UV4XTKPC.p8` succeeds and `git status --porcelain` shows nothing new.
- [ ] (J) Decision 10 (iPad (a) / (b)) chosen: ______
- [ ] (C) **Red first:** in `app-config.test.ts`'s `describe('10-sdk-58-ios-27')`, add every Interface Contracts case except `cli.version` (FR1) and the two plugin-order cases (FR6). The `expo-build-properties` case allows only the exact Decision 9 fallback entry. Add `sdkVersion` starts with `58.` and `UIRequiresFullScreen === false` (or `true` under Decision 10 (b)) to `app-config-introspect.test.ts`. Run them and record the red list.
- [ ] (C) `app.json`: `version` `1.2.0`, `ios.buildNumber` `"19"`.
  - Confirm the next unused number with `node .appstore/asc.js builds` from this worktree; otherwise record "blocked: ASC key access" and take 19.
  - No scene or deployment-target keys. `requireFullScreen` only under Decision 10 (b).
- [ ] (C) `package.json` `version` `1.2.0`. `npm install --package-lock-only` updates the lockfile root.
- [ ] (C) `eas.json` `build.production.ios.image = "macos-tahoe-26.6-xcode-27.1"`. Re-check docs.expo.dev/build-reference/infrastructure first and record the row. The Xcode build should be 27A9275 = Xcode 27.1 GA.
- [ ] (C) FR5 tests green. Record the `npx expo config --type introspect --json` values. Three gates green. Commit.

### FR6
- [ ] (C) **Red first:**
  - `widgetLayoutJs.test.ts`:
    - `props` undefined doesn't throw, for every family.
    - `containerBackground('#0D0D1A','widget')` is on the small, medium and large roots and not on accessories.
    - Every `HStack({`/`VStack({` sets `spacing`.
    - The `env.date` countdown is used.
    - Every called global exists in `jest.requireActual('@expo/ui/swift-ui')` (+ modifiers).
  - `__tests__/config/widget-background-plugin.test.ts`: fixture copied verbatim from `expo-widgets@58.0.21` `plugin/src/ios/withWidgetSourceFiles.ts:355-364`. Cases: inserts once, idempotent, throws without the anchor, and app.json plugin order.
  - `__tests__/config/widget-privacy-plugin.test.ts` (I10):
    - Exactly the four reasons; empty collected-data and tracking-domain lists; the XML parses.
    - The `xcode` fixture project gets a Resources phase plus one `PrivacyInfo.xcprivacy` build file, and a second run is a no-op.
    - A missing target throws.
    - The plugin is listed immediately before `withHourglassWidgetBackground`.
  - `deps.test.ts`: `expo.autolinking.android.exclude` contains `expo-widgets`.
  - `bridge.test.ts`/`clearWidgetData.test.ts`: `createWidget` is called with 3 args, the 3rd being the signed-out snapshot.
  - Run them and record the red list.
- [ ] (C) `bridge.ts`: changes (a)–(e), the `requireOptionalNativeModule` import from `'expo'`, and the widened `CreateWidget` type. Move the `jest.mock` in `clearWidgetData.test.ts:31`.
- [ ] (C) Delete the ambient `declare module 'expo-widgets'` block (`src/types/modules.d.ts:50-61`). Fix any call that doesn't match the shipped types.
- [ ] (C) Create `plugins/withHourglassWidgetBackground.js` (I7) and `plugins/withHourglassWidgetPrivacyManifest.js` (I10). List them in `app.json` as `…, "./plugins/withHourglassWidgetPrivacyManifest", "./plugins/withHourglassWidgetBackground", ["expo-widgets", {…}], …`.
- [ ] (C) Add `package.json` `expo.autolinking.android.exclude: ["expo-widgets"]`.
- [ ] (C) `npx expo-modules-autolinking resolve -p android | grep -c expo-widgets` → `0`. `-p apple` → ≥ 1.
- [ ] (C) FR6 tests green. Three gates green. Commit.

### FR7: device pass (EAS development build of the FR6 tree)
- [ ] (C) New `eas build -p ios --profile development`. Record the id and the `[Expo-precompiled]` lines (compare them with checkpoint B).
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
- [ ] (C) **Red first:** `fingerprint-config.test.ts`: `EXPECTED_SOURCE_SKIPS` is the 7 sorted names. Record red.
- [ ] (C) `fingerprint.config.js`: the 7 names, with the header comment rewritten. Test green. Commit.
- [ ] (C) `rm -rf node_modules && npm ci` on `feat/sdk-58`, then run `npx expo-updates runtimeversion:resolve --platform ios` twice on a clean tree. The values are equal. Record: ______
- [ ] (C) Open a **draft** PR `feat/sdk-58` → `main` and confirm CI is green on both jobs. Record the run URL. Don't merge.

## Phase B.2: Review (MANDATORY)

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` for FR4–FR8 against I1–I3, I6–I8 and I10.

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
- [ ] (C) Record `git status --porcelain` in the worktree (it must be identical at the end of FR9).
- [ ] (C) Make the scratch copy:
  - `T=$(mktemp -d) && cp -cR "/Users/Trilogy/Documents/Claude Code/hg-worktrees/sdk58" "$T/app" && rm "$T/app/.git"`. The `.git` file is a gitdir pointer into the off-limits checkout.
  - `git -C "$T/app" init -q && git -C "$T/app" add -A && git -C "$T/app" commit -qm scratch`.
  - Confirm `$T` has no spaces.
- [ ] (C) `cd "$T/app" && npx expo-updates runtimeversion:resolve --platform ios`, **before** prebuild. Record: ______
- [ ] (C) `cd "$T/app" && npx expo prebuild --platform ios --clean --no-install 2>&1 | tee "$T/prebuild.log"`. Record every warning. None may mention `enableSceneSupport` or `requireFullScreen`.
- [ ] (C) I4 checks (paste each output):
  - [ ] `plutil -extract UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes raw ios/Hourglassxo/Info.plist` → `false`
  - [ ] `plutil -extract UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0.UISceneDelegateClassName raw ios/Hourglassxo/Info.plist` → `$(PRODUCT_MODULE_NAME).SceneDelegate`
  - [ ] `UILaunchStoryboardName` → `SplashScreen`; `UIBackgroundModes` → only `remote-notification`; no `NSFaceIDUsageDescription`; `UIRequiresFullScreen` → `false` and `UISupportedInterfaceOrientations~ipad` has 4 entries (Decision 10 (b): `true`, portrait entries only or the key absent)
  - [ ] `grep -n "class SceneDelegate: ExpoAppSceneDelegate" ios/Hourglassxo/SceneDelegate.swift`
  - [ ] `grep -n "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider" ios/Hourglassxo/AppDelegate.swift`
  - [ ] `grep -o "IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*" ios/*.xcodeproj/project.pbxproj | sort -u` shows only values ≥ 16.4; `cat ios/Podfile.properties.json` has no lower target
  - [ ] Both `.entitlements` files list `group.com.jalvarez0907.hourglass.widgets`
  - [ ] `grep -c "1C8F.1" ios/Hourglassxo/PrivacyInfo.xcprivacy` ≥ 1, and the manifest diff against build 18's config is empty
  - [ ] `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` exists. `grep -c` finds each of `CA92.1`, `1C8F.1`, `C617.1` and `35F9.1`. `grep -n "PrivacyInfo.xcprivacy in Resources" ios/*.xcodeproj/project.pbxproj` includes an entry in the `ExpoWidgetsTarget` Resources phase
  - [ ] `plutil -extract UIApplicationSceneManifest raw ios/ExpoWidgetsTarget/Info.plist` fails (the key is absent)
  - [ ] `grep -c "WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())" ios/ExpoWidgetsTarget/HourglassWidget.swift` → `1`; the struct is present
- [ ] (C) **Mandatory** `cd "$T/app/ios" && pod install 2>&1 | tee "$T/pod.log"`. Exit 0. Paste `grep "Expo-precompiled" "$T/pod.log"`. Re-check that `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` still has the four reasons.
- [ ] (C) **Mandatory** `xcodebuild -workspace Hourglassxo.xcworkspace -scheme Hourglassxo -configuration Release -destination 'generic/platform=iOS' -derivedDataPath "$T/dd" CODE_SIGNING_ALLOWED=NO build`.
  - Exit 0. Never archive or export.
  - `ls "$T/dd/Build/Products/Release-iphoneos/Hourglassxo.app/PlugIns/ExpoWidgetsTarget.appex/"`: no `Frameworks/`, and `PrivacyInfo.xcprivacy` is present.
  - On failure, record the first error, follow spec-research edge case 4, fix, and re-run FR9.
- [ ] (C) In the worktree: `npx expo-doctor` exits 0. Record the check count.
- [ ] (C) The worktree's `runtimeversion:resolve --platform ios` (the FR8 value, after a fresh `npm ci`) equals the `$T/app` pre-prebuild value. Record both.
- [ ] (C) `rm -rf "$T"`. The worktree's `git status --porcelain` is unchanged from the first FR9 step.

### FR10: docs
- [ ] (C) Update `TECH_STACK.md`, `CLAUDE.md:69`, `README.md:27,66`, `docs/ARCHITECTURE.md` (§5.7, §7.2, §8.6), `docs/RELEASING.md` ((a)–(e)), `FEATURE.md` and `site/support.html`, per FR10.
- [ ] (C) Run the FR10 success-criteria greps and paste the outputs. The forbidden-words grep uses `@expo/ngrok`, not `ngrok`.
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
- [ ] (C) The ASC key is reachable from this worktree (Decision 16): `test -f .appstore/AuthKey_W4UV4XTKPC.p8 && git check-ignore -q .appstore/AuthKey_W4UV4XTKPC.p8`, or the EAS-stored key under (b). Otherwise stop with "blocked: ASC key access".

### Build and verify (C)
- [ ] `eas build -p ios --profile production` on cloud. Record:
  - the EAS build id: ______
  - `gitCommitHash` (= HEAD): ______
  - the log line naming `macos-tahoe-26.6-xcode-27.1` / Xcode 27.1 (27A9275);
  - the `[Expo-precompiled]` lines.
- [ ] `eas build:list --platform ios --status finished --channel production --app-build-version 19 --limit 1 --json --non-interactive` returns that id, and `runtime.version` equals the local resolve: ______
- [ ] IPA (`D=$(mktemp -d)`, download `artifacts.buildUrl`, unzip):
  - `DTSDKName` ______ (iphoneos27*), `DTSDKBuild` ______ (24*), `DTXcode` ______ (27*).
  - `CFBundleShortVersionString` 1.2.0, `CFBundleVersion` 19, `MinimumOSVersion` 16.4.
  - The scene delegate class ends with `.SceneDelegate`.
  - Appex: `Info.plist` has no scene manifest. `PrivacyInfo.xcprivacy` exists with `CA92.1`/`1C8F.1`/`C617.1`/`35F9.1`. `test ! -e "$D"/Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/Frameworks`.
- [ ] `eas submit -p ios --profile production --id <build id>`: **TestFlight upload only**.
- [ ] **ITMS-91053 result for build 19** (every binary, including `ExpoWidgetsTarget`): ______. Compare it with the FR1 baseline (build 17: ______ / build 18: ______), then take one branch:
  - **None:** proceed.
  - **It names only `ExpoWidgetsTarget`:**
    - A category or reason that I10 lacks: add it to `buildWidgetPrivacyManifest()` and its test, then rebuild with the next unused build number before "ready to submit".
    - All already declared: record it, don't block, and open a follow-up.
  - **It names the main app binary:** add the reason to `ios.privacyManifests` and the spec 03 contract test, then rebuild with the next unused build number.
  - **Build 19 never reaches `VALID`:** this is a release blocker. Stop and escalate.
- [ ] ASC `sdkBuild` `24…`, or "skipped": ______
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
- [ ] 8. Sign Out clears the data, with no error toast (expo-secure-store 58's `deleteItemAsync` now rejects when the keychain refuses). The widgets show the empty signed-out view, and `curl -s <relay>/health` `tokenCount` drops by 1 against a reading taken just before.

Lifecycle, network and widget additions:
- [ ] 9. **Foreground refresh:** background for ≥ 60 s, change data in QA (e.g. approve an item on the web), then foreground. The change shows within 10 s. This proves the AppState hooks still fire under scenes.
- [ ] 10. **Notification tap from a killed state:** force-quit, wait for or trigger a deadline notification, then tap it. The app cold-launches to the tabs with data, with no blank screen or crash.
- [ ] 11. **Widget tap from a killed state:** force-quit, then tap the widget. The app opens.
- [ ] 12. **Deep link:** type `hourglassws://overview` in Safari while the app is running (warm) → the Overview tab. Force-quit and repeat (cold) → the Overview tab.
- [ ] 13. **401 path:** sign out, then onboard with a wrong password. You get the auth-error message, not a crash or parse error.
- [ ] 14. **Relay register:** after sign-in, the relay `/health` `tokenCount` rises by 1 (NODE_ENV / `.env` check).
- [ ] 15. **Sign-out clears the log:** before sign-out, Settings → Debug Log → **Share log** exports a non-empty file. After sign-out and sign-in, **Share log** contains no entries from before the sign-out. This also proves `expo-file-system/legacy` and `expo-sharing` 58 work.
- [ ] 16. **Widget gallery preview (after 1.2.0 has been opened):** the long-press → Edit → add-widget gallery shows the Hourglass previews with no red box and no placeholder.
- [ ] 17. **Update without opening:**
  - Install build 18 from TestFlight, sign in, and add all three widget sizes.
  - Install build 19 from TestFlight **without opening it**, and wait ≥ 5 min.
  - The home-screen widgets still render on a dark background, with no "adopt containerBackground" placeholder.
  - **Before opening 1.2.0:** long-press → Edit → open the widget gallery, and watch a widget being added (its placeholder). Record what the gallery preview and the placeholder show: ______. A red box here is the expected transient (Decision 5 (i)). Record it; don't fail on it unless it persists after first open.
  - **Then open 1.2.0 once:**
    - The app goes straight to the tabs with the same account, with no onboarding or credentials screen. The Keychain credentials (expo-secure-store 58) and settings survived.
    - Record whether cached data (the AsyncStorage 2.2.0 TanStack persister) appears before the network returns: ______
    - The widgets refresh, and repeating the gallery check shows no red box.
- [ ] 18. **Countdown honesty:** with the app closed for ≥ 1 h, the widget's "Due in …" label has advanced to match the clock (the `env.date` fix).
- [ ] 19. **Memory, 10 minutes:** tab switching with charts animating. Use Instruments → Activity Monitor on the TestFlight build if Xcode 27 allows it; otherwise record "dev-build only" and cite the FR7 numbers. 1 min ____ MB / 10 min ____ MB, ratio ≤ 1.5, no jetsam.
- [ ] 20. **Visual parity:** NativeWind layout, every chart and the NativeTabs glass pill match the build-18 screenshots. The Settings modal header looks right under the iOS 26+ system bar appearance.

Resizability matrix:
- **iPad:** Split View ⅓ · ½ · ⅔, Slide Over, Stage Manager narrow → wide, portrait ↔ landscape.
- **iPhone:** resize the iPhone Mirroring window on macOS 27. iOS 27 resizes iPhone windows too.
- Under Decision 10 (b), record which discrete sizes iOS offers instead of free resizing.

Each cell passes when there's no clipping or overlap, every chart re-measures within one resize, the Overview sticky bar still triggers, `AnimatedMeshBackground` fills the window, the swipe threshold scales, the tab bar stays reachable, and nothing crashes.

| Screen | ⅓ | ½ | ⅔ | Slide Over | Stage Mgr | Rotate | iPhone Mirroring |
|---|---|---|---|---|---|---|---|
| Home | | | | | | | |
| Overview (manager) | | | | | | | |
| Overview (contributor) | | | | | | | |
| AI | | | | | | | |
| Requests (swipe) | | | | | | | |
| Settings modal | | | | | | | |

- [ ] (C) For each failure: fix it on `feat/sdk-58`, add a regression test or a screenshot pair, take the next build number (20), and repeat Phase D. Never submit a build that has a failing smoke item.

### ASC prep for 1.2.0 (C, `.appstore/asc.js` from this worktree per Decision 16; each live write preceded by its `--dry-run` transcript)
- [ ] `create-version 1.2.0` (phased `INACTIVE`, `AFTER_APPROVAL`), or "blocked: <reason>" if 1.1.0's review state prevents it.
- [ ] `set-whats-new` (includes "Requires iOS 16.4 or later.") · `attach-build <19 id>` · confirm `socialMedia false` in `check-submission`.
- [ ] `submit-app-review <19 id> --dry-run` transcript only. **No live submission.**

### Stop point
- [ ] (C) Every smoke item and matrix cell is PASS (or "blocked: no device", with J informed), and the ITMS-91053 branch is recorded. Mark **"ready to submit"** here: ______
- [ ] (J) Decides whether and when to submit. That's outside implementation.

## Phase D Review (MANDATORY)
- [ ] `spec-implementation-alignment` for FR11. Every recorded value matches I5. No `POST /reviewSubmissions` in the `ASC_TRACE` output.

---

## Session Notes

**2026-10-20**: Spec created. The research pass is recorded in `spec-research.md` (tarballs in `/tmp/spec10.o6hmwI`, ephemeral). Supersedes specs 08 and 09. Decisions 3 (icons), 4 (test renderer) and 5 (native widget fallback) are chosen defaults awaiting the user's confirmation. Nothing implemented yet.

**2026-10-20 (critique pass)**: Two critics' 22 issues were each re-verified against the cited source (tarballs in `/tmp/spec10crit.zF69wC`, ephemeral). 20 were applied and 2 rejected (spec-research F4).
- Main changes:
  - The widget-extension privacy-manifest plugin (I10).
  - A mandatory `pod install` and Release compile in FR9, plus the precompiled-modules fallback.
  - eas-cli, `ota-publish.sh`, `release/1.1` and CI Node 22 moved to FR1.
  - A checkpoint A device run.
  - The RNTL 14 `auth-screens` rewrite and the React Compiler lint policy.
  - The test files that hard-code `@react-navigation`.
  - Per-FR red tests, with only green commits pushed.
  - The FR9 copy gets its own git repo.
  - New decisions 10 (iPad options) and 16 (ASC key access).
- 27A9275 is the released Xcode 27.1, so the image pin stands.
- Nothing implemented yet.
