# Implementation Checklist

Spec: `09-sdk-58-xcode-27`
Feature: `store-compliance`

Run every command from the app repo root (`hourglassws/`) unless a step says otherwise. Use Node ≥ 22.13.

---

## Phase 0: Trigger Gate (FR1). STOP if any check fails.

⚠️ **Do this before anything else.** If any check below FAILs, write a SPEC BLOCKED block in Session Notes (which check failed, and the observed value) and **stop**. Don't modify any other file. Paste every command's output into Session Notes with the date.

### External (E1–E3)
- [ ] **E1: an EAS Xcode 27 image is listed.** PASS = at least one row, and at least one row's Xcode string doesn't contain `beta`. Record every row, and which one carries `sdk-58`.
  ```bash
  curl -sSL https://docs.expo.dev/build-reference/infrastructure/ \
    | sed -e 's/<[^>]*>/ /g' | tr -s ' \n' ' ' \
    | grep -oE 'macos-[a-z]+-[0-9.]+-xcode-27\.[0-9]+ (\( [^)]* \) )?Details macOS [A-Za-z]+ [0-9.]+ Xcode 27\.[0-9]+( RC| beta[ 0-9]*)? \([0-9A-Za-z]+\)' \
    | sort -u
  ```
- [ ] **E2: SDK 58 is stable on npm.** PASS = the first command prints a `58.x.y` version, and the second prints a stable version with major ≥ 58. Don't require an `sdk-58` dist-tag on `expo`; there wasn't one on 2026-10-19.
  ```bash
  npm view expo versions --json | node -e 'const v=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(v.filter(x=>/^58\.\d+\.\d+$/.test(x)).pop()||"NONE")'
  npm view expo dist-tags.latest
  ```
- [ ] **E3: the SDK 58 changelog is published.** PASS = `200`.
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://expo.dev/changelog/sdk-58
  ```

### Internal (I1–I5)
- [ ] **I1: spec 08 merged.** PASS = `~57.0.N` with N ≥ 23.
  ```bash
  node -p "require('./package.json').dependencies.expo"
  ```
- [ ] **I2: scene support present at 57.** PASS = prints `PASS`.
  ```bash
  node -e "const a=(require('./app.json').expo.plugins||[]).find(p=>Array.isArray(p)&&p[0]==='expo-build-properties');console.log(a&&a[1]&&a[1].ios&&a[1].ios.enableSceneSupport===true?'PASS':'FAIL')"
  ```
- [ ] **I3: spec 07 CI gates present.** PASS = prints `PASS`.
  ```bash
  grep -q "npm run typecheck" .github/workflows/test.yml && grep -q "npm run lint" .github/workflows/test.yml && echo PASS || echo FAIL
  ```
- [ ] **I4: prerequisite files exist.** PASS = prints `PASS`.
  ```bash
  test -f __tests__/config/app-config.test.ts && test -f __tests__/config/deps.test.ts && test -f __tests__/config/sdk-migration.test.ts && test -f docs/RELEASING.md && echo PASS || echo FAIL
  ```
- [ ] **I5: clean, current `main`.** PASS = on `main`, `git status --porcelain` prints nothing, and `git status -sb` doesn't show `behind`.
  ```bash
  git rev-parse --abbrev-ref HEAD && git fetch && git status -sb | head -1 && git status --porcelain
  ```

### Gate decision
- [ ] All of E1–E3 and I1–I5 PASS → record "GATE PASS <date>" and continue. Otherwise record SPEC BLOCKED and **stop here**.
- [ ] Record the FR4 image choice from the E1 output. Rule 1: the `sdk-58` image if its Xcode is GA or RC. Rule 2: otherwise, the newest non-beta `*-xcode-27.*` image. Record the image name, Xcode version and build.

---

## Phase 1.0: Test Foundation

Write the tests first. Run only the targeted files, not the full suite:
`npx jest __tests__/config "app/(tabs)/__tests__/native-tabs.test.tsx"`

### FR1: Trigger gate
- [ ] No jest test (the state is external and network-dependent). Confirm that the Phase 0 evidence is pasted into Session Notes. That evidence is FR1's verification.

### FR2: SDK 58 dependency line
- [ ] In `__tests__/config/sdk-migration.test.ts` (created by spec 08), rewrite the FR1 SDK 57 windows **in place** as SDK 58 floors with no upper bound. Don't add a second copy anywhere else:
  - [ ] `expo` (was [57.0.23, 58.0.0)): `package.json` `dependencies.expo` with a leading `~`/`^` stripped has major ≥ 58, and `package-lock.json` `packages["node_modules/expo"].version` matches `/^\d+\.\d+\.\d+$/` (no prerelease) with major ≥ 58.
  - [ ] `react-native` (was `/^0\.86\.\d+$/`): `dependencies["react-native"]` and the lockfile `packages["node_modules/react-native"].version` are `0.N.x` with N ≥ 88.
  - [ ] `expo-widgets` (was `/^57\.\d+\.\d+$/`): lockfile major ≥ 58 and equal to the lockfile `expo` major, and the declared spec (strip `~`/`^`) has the same major.
  - [ ] `expo-build-properties` (was [57.0.20, 58.0.0)): delete the window. Assert it's in `dependencies` if and only if an `app.json` `expo.plugins` entry names it, and if it's present, its lockfile major equals the lockfile `expo` major.
  - [ ] `expo.install.exclude` (was "contains `expo-widgets`"): it contains `expo-widgets` if and only if a `patches/expo-widgets+*.patch` file exists.
  - [ ] Leave the other spec 08 cases unchanged: no `@react-navigation/*` or `@expo/vector-icons` (deps and source walk), `components/haptic-tab.tsx` absent, both `@react-native-vector-icons/*` in `dependencies`, and the glyphmap keys. Tighten the `@react-native/jest-preset` case: its declared range has the same `0.N` minor as `react-native`.
  - [ ] `grep -nE "57\.|0\.86" __tests__/config/sdk-migration.test.ts` prints nothing.
- [ ] In `__tests__/config/deps.test.ts`:
  - [ ] Keep the spec 06 patch/version alignment test unchanged. It's a guard and should be green.
  - [ ] If FR2 will change `expo.install.exclude`, update spec 06's exclude assertion to the target list now, so it goes red first. Keep the "every entry is a direct dependency" check.
  - [ ] Leave spec 08's FR5 `expo-widgets` patch-shape cases alone for now. They're guards and green on the spec-08 tree. They get rewritten in Phase 1.1 FR2 only if the patch changes.
- [ ] Leave `__tests__/config/fingerprint-config.test.ts` (spec 04) unchanged. It's a guard; FR2 must keep it green on `@expo/fingerprint` 0.21.
- [ ] In `app/(tabs)/__tests__/native-tabs.test.tsx`, update SC2.1 (line ~82) and SC4.1 (line ~166) to assert `source` contains `expo-router/native-tabs` **and** doesn't contain `unstable-native-tabs`. Rename the test titles to match.

### FR3: Scene config + version
- [ ] In `__tests__/config/app-config.test.ts`, **delete** spec 08's FR4 case: "exactly one plugin entry with `[0] === 'expo-build-properties'`, an array whose `[1]` deep-equals `{ ios: { enableSceneSupport: true } }`". Keep spec 08's other FR4 cases as guards: no bare-string `'expo-build-properties'` entry, no `ios.deploymentTarget`, and no `UIApplicationSceneManifest`. Then `grep -n "enableSceneSupport: true" __tests__/config/app-config.test.ts` prints nothing.
- [ ] In the same file, add `describe('09-sdk-58-xcode-27: native config')`:
  - [ ] `JSON.stringify(app.expo.plugins)` doesn't contain `enableSceneSupport` (replaces the deleted spec 08 case).
  - [ ] `app.expo.ios.infoPlist?.UIApplicationSceneManifest` is `undefined` (guard).
  - [ ] `app.expo.version` is semver ≥ `1.3.0`, via a small numeric compare helper. Use a range, not `toBe('1.3.0')`, so later bumps don't break the test. It must also equal `package.json` `version`.
  - [ ] `app.expo.ios.supportsTablet === true` and `app.expo.ios.requireFullScreen !== true` (guard).
- [ ] In `__tests__/config/app-config-introspect.test.ts` (spec 03's suite, which runs the Expo CLI in `beforeAll`), add:
  - [ ] Resolved `sdkVersion` has major `58`.
  - [ ] `ios.infoPlist.UIRequiresFullScreen === false`.
  - [ ] Keep the existing spec 03 assertions unchanged as guards.

### FR4: Build image pin
- [ ] In the same file, read `eas.json` with `fs` (pattern: `src/lib/__tests__/sharedTransitions.test.ts:15-16,99`):
  - [ ] `eas.build.production.ios.image` matches `/^macos-[a-z]+-\d+(\.\d+)*-xcode-27(\.\d+)+$/`.
  - [ ] It isn't one of `['auto', 'default', 'latest', 'sdk-58']`.

### FR5: Toolchain / CI
- [ ] In the same file, read `.github/workflows/test.yml` as text:
  - [ ] Collect every match of `/node-version:\s*['"]?(\d+)/g`. Assert there's at least one, and that each value is ≥ 22.
  - [ ] The text contains `npm run typecheck` and `npm run lint` (spec 07 regression guard).

### FR6: Resizability regressions
- [ ] No upfront test, because the bugs aren't known yet. For each layout bug FR6 finds, first write a failing test in that component's existing test file (`src/components/__tests__/<Name>.test.tsx` or `__tests__/components/<Name>.test.tsx`, both matched by `testMatch`). The test fires `onLayout` with width A, then width B, and asserts that the chart or canvas width prop equals B.

### Red-phase confirmation
- [ ] Run `npx jest __tests__/config "app/(tabs)/__tests__/native-tabs.test.tsx"` and record the result. These should be **red**: the rewritten `sdk-migration.test.ts` floors (`expo`, `react-native`, `expo-widgets`), introspect `sdkVersion` 58, `enableSceneSupport` absent, version ≥ 1.3.0, image pin, Node ≥ 22 (unless spec 08 already bumped it), native-tabs path, and the exclude list (only if it changes). These should be **green**: the `sdk-migration.test.ts` `expo-build-properties` and exclude invariants plus spec 08's unchanged guards, the spec 06 patch guard, spec 08's FR5 patch-shape guards, the fingerprint-config guard, spec 03's introspect guards (`UIRequiresFullScreen` is already `false` today), spec 08's remaining FR4 guards, no `UIApplicationSceneManifest`, tablet/fullscreen, and gates present. Spec 08's SDK 57 windows and its `enableSceneSupport: true` tuple case must no longer exist.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage (FR1 and FR6 device items are covered by recorded command or manual evidence, which is acceptable)
- [ ] Assertions are specific (regexes and numeric floors, not just "exists" or "doesn't throw")
- [ ] Mocks return realistic data matching interface contracts (none needed; all tests read real files)
- [ ] Version assertions use floors or ranges, so the next SDK or version bump doesn't break them
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Trigger gate
- [ ] `git checkout -b feat/sdk-58` (only after "GATE PASS" is recorded)
- [ ] Confirm `git rev-parse --abbrev-ref HEAD` prints `feat/sdk-58`

### FR2: SDK 58 dependency line
- [ ] `npx expo install expo@^58.0.0 --fix`
- [ ] Repeat `npx expo install --fix` until `npx expo install --check` exits 0
- [ ] If `package.json` `expo.install.exclude` lists packages, install each at its SDK 58 range explicitly (e.g. `npx expo install expo-widgets`, with the exclusion temporarily removed). Drop it from `exclude` unless a patch still pins it. `deps.test.ts`'s exclude assertion must match the result
- [ ] For each file in `patches/`: if its package version moved, re-apply the intent and regenerate it (`npx patch-package <name>`), or delete it if the fix is now upstream
- [ ] If the `expo-widgets` patch was regenerated, update spec 08's FR5 patch-shape cases in `deps.test.ts` to match: count, size cap, the `diff --git` path list, and each surviving hunk's marker string (`addingTimeInterval(15 * 60)`, `basename "$PROJECT_DIR"`). If it was deleted, replace them with "no `patches/expo-widgets+*.patch`". Keep the "no `react-native-reanimated+*.patch`" case. Record what changed in Session Notes
- [ ] `rm -rf node_modules && npm ci`: exit 0, every patch reported as applied, no warnings
- [ ] `npm ls @react-native/jest-preset`: no `UNMET` or `invalid` entry
- [ ] victory-native: keep `^41` and let the lockfile take the newest 41.x. Move to `^42` only if 41.x fails typecheck or the FR6 chart pass, and record the decision and reason in Session Notes. If you move to 42, do a chart-by-chart pass of `src/components/WeeklyBarChart.tsx` and `src/components/TrendSparkline.tsx`
- [ ] RNGH 3: keep `Gesture` and `GestureDetector`. Fix only the type or runtime errors at `app/_layout.tsx:16`, `app/(tabs)/overview.tsx:22`, `src/components/ApprovalCard.tsx:34`, `src/components/AIConeChart.tsx:34` and `src/hooks/useScrubGesture.ts:27,29`
- [ ] Change `app/(tabs)/_layout.tsx:23` from `expo-router/unstable-native-tabs` to `expo-router/native-tabs`
- [ ] `grep -rn "unstable-native-tabs" app src components` returns nothing
- [ ] `npx expo-doctor` exits 0
- [ ] If `__tests__/config/fingerprint-config.test.ts` fails because `@expo/fingerprint` 0.21 renamed a `SourceSkips` member: update `fingerprint.config.js` and the test's expected names to the new member, and note it in Session Notes. The FR6 determinism check then confirms that local and EAS still agree
- [ ] FR2 tests green (`npx jest __tests__/config/deps.test.ts __tests__/config/sdk-migration.test.ts __tests__/config/fingerprint-config.test.ts "app/(tabs)/__tests__/native-tabs.test.tsx"`). The `sdk-migration.test.ts` `expo-build-properties` invariant holds here because `--fix` moved the package to 58.x while its plugin entry still exists

### FR3: Scene config + version
- [ ] Remove `ios.enableSceneSupport` from the `expo-build-properties` options in `app.json`. If the options object is now empty, remove the plugin entry. If nothing else uses the package, `npm uninstall expo-build-properties`
- [ ] Confirm `app.json` has no `ios.infoPlist.UIApplicationSceneManifest`
- [ ] Set `app.json` `expo.version` and `package.json` `version` to `1.3.0`
- [ ] Set `app.json` `ios.buildNumber` to the next unused build number. Check the last uploaded build in ASC, or with `node .appstore/asc.js builds` if the API is reachable
- [ ] Leave `supportsTablet: true` and `orientation: "portrait"` as they are. Don't add `requireFullScreen`
- [ ] Introspect. Expected output: `58.0.0 false ["remote-notification"] undefined`
  ```bash
  npx expo config --type introspect --json > /tmp/introspect-58.json
  node -e 'const c=require("/tmp/introspect-58.json");const p=c.ios.infoPlist;console.log(c.sdkVersion,p.UIRequiresFullScreen,JSON.stringify(p.UIBackgroundModes),p.NSFaceIDUsageDescription)'
  ```
- [ ] Scratch prebuild in a space-free path (CNG; `ios/` is gitignored; the in-place prebuild hits the space-in-path script bug). Paste the outputs into Session Notes:
  ```bash
  SCRATCH=/tmp/hg-prebuild-58; rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
  rsync -a --exclude node_modules --exclude ios --exclude android --exclude .git \
        --exclude '*.ipa' --exclude build --exclude coverage --exclude dist ./ "$SCRATCH/"
  ln -s "$PWD/node_modules" "$SCRATCH/node_modules"   # if plugin resolution fails, run `npm ci` in $SCRATCH instead
  (cd "$SCRATCH" && npx expo prebuild -p ios --clean --no-install 2>&1 | tee prebuild.log)
  grep -c "class SceneDelegate: ExpoAppSceneDelegate" "$SCRATCH/ios/Hourglassxo/SceneDelegate.swift"                       # expect ≥ 1
  plutil -extract UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0.UISceneDelegateClassName raw "$SCRATCH/ios/Hourglassxo/Info.plist"   # expect $(PRODUCT_MODULE_NAME).SceneDelegate
  grep -c "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider" "$SCRATCH/ios/Hourglassxo/AppDelegate.swift"   # expect ≥ 1
  grep -c "enableSceneSupport" "$SCRATCH/prebuild.log"                                                                     # expect 0
  grep -c "1C8F.1" "$SCRATCH/ios/Hourglassxo/PrivacyInfo.xcprivacy"                                                        # expect ≥ 1
  rm -rf "$SCRATCH"
  ```
- [ ] FR3 tests green (`npx jest __tests__/config/app-config.test.ts __tests__/config/app-config-introspect.test.ts __tests__/config/sdk-migration.test.ts`). `sdk-migration.test.ts` is included because removing the plugin entry and uninstalling `expo-build-properties` must happen together (dependency-if-and-only-if-plugin invariant)
- [ ] FR2 guard still green after the config edits (`npx jest __tests__/config/fingerprint-config.test.ts`)

### FR4: Build image pin
- [ ] Set `eas.json` `build.production.ios.image` to the image recorded in Phase 0 (the 2026-10-19 rule gives `macos-tahoe-26.6-xcode-27.1`; the fallback is `macos-tahoe-26.6-xcode-27.0`). Leave `development` and `preview` alone
- [ ] Re-run the E1 command and confirm the pinned name is still listed
- [ ] `docs/RELEASING.md`, SDK-upgrade section: add "Bump `build.production.ios.image` to the new SDK's image (pinning cuts the `auto` SDK↔Xcode link)"
- [ ] `docs/RELEASING.md`: add "Local builds ignore `image`: build on EAS cloud, or check that `xcodebuild -version` matches the pinned image's Xcode version and build"
- [ ] `docs/RELEASING.md`: add the IPA `DT*` verification command (from FR6 below)
- [ ] `grep -n "ios.image" docs/RELEASING.md` and `grep -n -i "local builds ignore" docs/RELEASING.md` both match
- [ ] FR4 test green

### FR5: Toolchain / CI
- [ ] Set every `node-version` in `.github/workflows/test.yml` to `'22'` (both `app-tests` and `server-tests`)
- [ ] `npm run typecheck`: fix the Strict TS API fallout (ref instance types and so on). Don't add `react-native-legacy-deep-imports`, unless errors after FR2 exceed 60. In that case add it temporarily and record a dated follow-up in Session Notes and `TECH_STACK.md`
- [ ] `npm run lint` exits 0 (warnings allowed)
- [ ] `npm test` exits 0 (CI runs the full suite; locally, run it only as the final gate)
- [ ] Update `TECH_STACK.md` (Expo SDK 58, RN 0.88, React 19.3, key native libs, Node ≥ 22.13) and the `CLAUDE.md` quick reference (SDK 58 / RN 0.88)
- [ ] Push the branch and open a PR. CI must be green on `app-tests` and `server-tests`
- [ ] FR5 test green

### FR6: iOS 27 artifact + smoke + resizability
- [ ] Build on EAS cloud: `eas build -p ios --profile production --non-interactive` (no `--local`)
- [ ] Build log, "Spin up build environment": paste the line showing the pinned image and Xcode 27.x
- [ ] IPA check. Expected: `DTSDKName=iphoneos27*`, `DTSDKBuild=24*`, `DTXcode=27*`, `CFBundleShortVersionString=1.3.0`, `CFBundleVersion=<FR3 build>`, and a scene delegate ending in `.SceneDelegate`:
  ```bash
  URL=$(eas build:list -p ios -e production --status finished --app-version 1.3.0 --limit 1 --json --non-interactive \
        | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8"))[0].artifacts.buildUrl)')
  curl -sSL -o /tmp/hg-1.3.0.ipa "$URL"
  unzip -p /tmp/hg-1.3.0.ipa 'Payload/*.app/Info.plist' > /tmp/hg-1.3.0-Info.plist
  for k in DTSDKName DTSDKBuild DTXcode CFBundleShortVersionString CFBundleVersion; do printf '%s=' "$k"; plutil -extract "$k" raw /tmp/hg-1.3.0-Info.plist; done
  plutil -extract UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0.UISceneDelegateClassName raw /tmp/hg-1.3.0-Info.plist
  ```
- [ ] Fingerprint determinism (spec 04 FR2/FR4 method; SDK 58 moves `@expo/fingerprint` from 0.16 to 0.21). Get the build's `id`, `runtimeVersion` and `gitCommitHash`, then compare with the local iOS runtime at that commit. PASS = the two `runtimeVersion` values are identical 40-hex strings. Paste both into Session Notes:
  ```bash
  eas build:list --platform ios --status finished --channel production --app-build-version <FR3 build> --limit 1 --json --non-interactive
  git switch --detach <gitCommitHash> && npm ci
  npx expo-updates runtimeversion:resolve --platform ios
  git switch - && npm ci
  ```
  If they differ, `eas fingerprint:compare --build-id <id> --environment production` names the differing source. Fix it before any 1.3.x OTA. Don't use `npx expo-fingerprint` (npm 404) or the bare `fingerprint` bin (it hashes both platforms, so it never equals the iOS runtime).
- [ ] Upload: `eas submit -p ios --profile production --latest`. This is blocked while the ASC agreement is unaccepted; see spec Out of Scope #9
- [ ] (Optional) ASC: `GET /v1/builds/{id}?include=buildBundles` → `sdkBuild` starts with `24`. If skipped, record the reason (403, or no `asc.js` command)

**TestFlight smoke: spec 05 items (iOS 27 iPhone AND iOS 27 iPad; mark each P/F per device)**
- [ ] Cold launch, then sign in with the QA manager account
- [ ] Home hours and earnings load. The Overview Personal/Team toggle works (manager). The Patterns card renders
- [ ] Approvals: approve one QA item, then reject one with a reason
- [ ] Settings → About: Privacy Policy and Support open in the in-app browser and load. The version row reads `Version 1.3.0 (<build>)` and shows `embedded` before the first OTA
- [ ] Widgets: add small, medium and large. They show data, and tapping opens the app
- [ ] Silent push: wait for a server ping (≤ 30 min) or trigger one from `server/`. The widget timestamp updates
- [ ] A local deadline notification fires, and tapping it routes correctly
- [ ] Sign-in registers with the relay (server `/health` count goes up by 1). Sign Out clears data and removes the token (count goes down by 1)

**TestFlight smoke: spec 08 additions (scene lifecycle)**
- [ ] Background for 1 min, then foreground: hours and AI data refresh (AppState hooks fire)
- [ ] Kill the app, then tap a deadline notification: it routes to the right screen. Do the same for a widget tap
- [ ] Silent push while backgrounded: the widget updates
- [ ] A `hourglassws://` deep link from Safari opens the right route
- [ ] Memory: 10 min of tab switching with charts animating shows no growth trend in the Xcode memory gauge

**Resizability matrix (mark P/F per cell; screenshot each iPad width)**

| Configuration | Home | Overview (mgr) | Overview (contrib) | AI | Approvals (swipe) | Settings |
|---|---|---|---|---|---|---|
| iPad Split View ⅓ | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| iPad Split View ½ | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| iPad Split View ⅔ | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| iPad Slide Over | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| iPad Stage Manager, narrowest → widest drag | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| iPad rotate portrait ↔ landscape | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| iPhone Mirroring on macOS 27, window resize | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

Each cell must meet all of these:
- No clipped or overlapping content.
- Every chart re-measures to the new width within one resize, with no stale width and no blank Skia canvas. Sites: `index.tsx:465,499,528,583`, `overview.tsx:154,194,530`, `ai.tsx:222,284`, `GlassCard.tsx:198`, `ApprovalCard.tsx:353`, `DailyAIRow.tsx:62`.
- The Overview sticky bar still triggers (`overview.tsx:401`).
- The mesh background fills the window (`AnimatedMeshBackground.tsx:164`).
- The swipe-approve threshold scales with window width (`ApprovalCard.tsx:124`).
- The tab bar is reachable, and nothing crashes.

- [ ] For each failing cell: write a failing regression test (see Phase 1.0 FR6), fix the layout, and confirm the test is green. If jest can't reproduce the bug, attach a before/after screenshot pair
- [ ] Re-test every failing cell after its fix, and mark it PASS

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code (FR1–FR6)
- [ ] Interface contracts match implementation (the spec's Interface Contracts table)
- [ ] No scope creep or shortfall (no victory-native 42 or ImageBackground refactor unless justified in Session Notes)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes
- [ ] Commit fixes: `fix(09-sdk-58-xcode-27): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(09-sdk-58-xcode-27): strengthen test assertions`

### Final Verification
- [ ] All tests passing (`npm test`), and `npm run typecheck` and `npm run lint` exit 0
- [ ] No regressions in existing tests
- [ ] Code follows existing patterns
- [ ] IPA check, TestFlight smoke and the resizability matrix all PASS (FR6)
- [ ] OTA: if 1.2.x needs a hotfix, ship it from `release/1.2`, never from `feat/sdk-58` or `main` (spec 08 edge case 1)

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19 (spec author pre-check, not an execution run):** Gate verdict **STOP**: external triggers met, internal prerequisites not.
- E1 PASS:
  - `macos-tahoe-26.6-xcode-27.1 ( latest , sdk-58 ) … Xcode 27.1 RC (27A9275)`
  - `macos-tahoe-26.6-xcode-27.0 … Xcode 27.0 (27A266a)`
  - `sdk-57` is still `macos-tahoe-26.5-xcode-26.6`; `sdk-55` is `macos-sequoia-15.6-xcode-26.2`.
- E2 PASS: newest 58.x = `58.0.16`; `dist-tags.latest` = `58.0.16`; `next` = `58.0.11`; no `sdk-58` tag on `expo`. `58.0.0` was published 2026-09-29.
- E3 PASS: `https://expo.dev/changelog/sdk-58` → 200 ("Expo SDK 58", Oct 15 2026, RN 0.88, built for iOS 27).
- I1 FAIL: `expo` = `~55.0.0`. I2 FAIL: no `expo-build-properties`. I3 FAIL: `test.yml` runs only `npm test`. I4 FAIL: all three prerequisite files are absent. Specs 03–08 aren't implemented yet.
- Local toolchain: macOS 27.0.1, Xcode 27.0 (27A266a), iOS SDK 27.0 (`24A430`), Node 22.17.0, eas-cli 20.1.0.
- ⚠️ Because the local Xcode is 27.0, any `eas build --local` would compile against the iOS 27 SDK. Builds 18 and 19 (SDK 55, no scene lifecycle) must use EAS cloud (`auto` → `sdk-55` → Xcode 26.2), or a side-by-side Xcode 26.x install. v1.2.0 (SDK 57) should be built with whichever Xcode spec 08 validated.

**{Date}**: {Notes about progress, blockers, decisions}
