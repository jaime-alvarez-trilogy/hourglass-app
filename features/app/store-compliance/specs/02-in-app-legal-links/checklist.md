# Implementation Checklist

Spec: `02-in-app-legal-links`
Feature: `store-compliance`

Ships in: **build 18 (v1.1.0)**. Blocks: `05-release-build-18`. Blocked by: `01-legal-pages`, which gates the release but not the merge.

---

## Phase 1.0: Test Foundation

### Baseline (before writing anything)
- [x] Run `npx jest app/__tests__/modal src/lib/__tests__/colors.test.ts src/components/__tests__/TouchAndNavigation.test.tsx` and record the pass count. Expected on 2026-10-19: the 5 `modal*` suites (35 tests) pass, plus the two source-analysis suites.
- [x] Run `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` and record the baseline (529 on 2026-10-19). **Recorded in the `legal` worktree after spec 01: 552** (15 of the extra errors come from spec 01's `__tests__/scripts/check-legal-pages.test.ts`). Phase 1.1's "≤ baseline" gate uses 552.
- [x] Run `npx eslint app/modal.tsx` and confirm exit 0.

### FR1: Legal URL constants
Test file: `src/lib/__tests__/legalLinks.test.ts`.
- [x] FR1.1: `PRIVACY_POLICY_URL` `toBe('https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html')`.
- [x] FR1.2: `SUPPORT_URL` `toBe('https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html')`.
- [x] FR1.3: both constants start with `https://jaime-alvarez-trilogy.github.io/hourglass-app/` and contain no whitespace.

### FR2: `formatBuildInfo`
Same file.
- [x] FR2.1: full input (`'1.1.0'`, `'18'`, `'0f3c9a12-3456-4abc-8def-1234567890ab'`, `false`) `toEqual({ versionLine: 'Version 1.1.0 (18)', updateLine: 'Update: 0f3c9a12' })`.
- [x] FR2.2: same input with `isEmbeddedLaunch: true` gives `'Update: embedded'` (non-null `updateId` is ignored).
- [x] FR2.3: `it.each([null, undefined, ''])` for `updateId`, not embedded, gives `'Update: embedded'`.
- [x] FR2.4: `updateId: 'abc'` gives `'Update: abc'`.
- [x] FR2.5: `it.each([undefined, null, ''])` for `version` with `buildNumber: '18'` gives `'Version unknown (18)'`.
- [x] FR2.6: `version` and `buildNumber` both undefined give `'Version unknown'`.
- [x] FR2.7: `it.each([undefined, null, ''])` for `buildNumber` with `version: '1.1.0'` gives `'Version 1.1.0'` (no parentheses).
- [x] FR2.8: an `Object.freeze`d input doesn't throw, and two calls return deep-equal results.

### FR3: About section rendering
Test file: `app/__tests__/modal-about.test.tsx`.
- [x] Set up mocks:
  - Copy the mock block from `app/__tests__/modal-debug-log.test.tsx:11-98`.
  - Replace `useConfig` with a mutable `mockConfig`.
  - Add `expo-web-browser`, including `WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' }`.
  - Add `expo-constants` as `__esModule` with a `default` getter over a mutable `mockConstants`.
  - Add `expo-updates` as `__esModule` with getters over a mutable `mockUpdates`.
  - Add `expo-application` as `__esModule` with a `nativeApplicationVersion` getter over a mutable `mockApplication` (default `'1.1.0'`).
  - Reset all mutable mocks in `beforeEach`.
- [x] Do not import `fs`, `path` or `__dirname`. Do not use `jest.resetModules` or `jest.isolateModules`. Do not index `mock.calls[n][m]`.
- [x] Add the helpers: async `renderModal()` (`await act(async () => create(...))`), `textsInOrder()`, and `pressable(testID)` (first node with that testID and a function `onPress`).
- [x] FR3.1: with a non-manager config, `About`, `Privacy Policy` and `Support` texts and an `about-version` node render.
- [x] FR3.2: with a manager config (`isManager: true`), the same elements render.
- [x] FR3.3: with `mockConfig = null`, the same elements render and there is no `Config Debug` text.
- [x] FR3.4: set `process.env.EXPO_PUBLIC_DEV_USERNAME = 'someone@example.com'` and restore it in `finally`. Text order is `Debug Log` < `About` < `Dev Options` < `Sign Out`.
- [x] FR3.5: the last node with `onPress` has a descendant Text `Sign Out`. This guards the `modal-signout.test.tsx` invariant.
- [x] FR3.6: `about-privacy` and `about-support` have `accessibilityRole === 'link'`.

### FR4: Opening links
Same file. Spy on `Linking.openURL` and `Alert.alert` and restore them in `afterEach`.
- [x] FR4.1: pressing `about-privacy` calls `openBrowserAsync` once, `toHaveBeenCalledWith(PRIVACY_POLICY_URL, { presentationStyle: 'automatic' })`. `Linking.openURL` is not called.
- [x] FR4.2: pressing `about-support` gives `toHaveBeenCalledWith(SUPPORT_URL, { presentationStyle: 'automatic' })`.
- [x] FR4.3: when `openBrowserAsync` resolves `{ type: 'locked' }`, neither `Linking.openURL` nor `Alert.alert` is called.
- [x] FR4.4: when `openBrowserAsync` rejects, `Linking.openURL` is called once with `PRIVACY_POLICY_URL`.
- [x] FR4.5: when both reject, `await expect(onPress()).resolves.toBeUndefined()` passes and `Alert.alert` `toHaveBeenCalledWith('Could not open link', SUPPORT_URL)`.
- [x] FR4.6: with `useQA: true`, `about-privacy` still opens `PRIVACY_POLICY_URL`.

### FR5: Build info wiring
Same file.
- [x] FR5.1: with `nativeApplicationVersion '1.1.0'`, `expoConfig {version '1.1.0', ios {buildNumber '18'}}`, `platform {ios {buildNumber '18'}}`, `updateId '0f3c9a12-…'` and not embedded, `about-version` contains `Version 1.1.0 (18)` and `Update: 0f3c9a12`.
- [x] FR5.2: native wins. With `platform '18'` and `expoConfig '17'`, the row reads `Version 1.1.0 (18)`.
- [x] FR5.3: fallback. With `platform: undefined` and `expoConfig '17'`, the row reads `Version 1.1.0 (17)`.
- [x] FR5.4: with `isEmbeddedLaunch: true`, the row reads `Update: embedded`.
- [x] FR5.5: with `nativeApplicationVersion: null`, `expoConfig: null` and `platform '18'`, the row reads `Version unknown (18)`.
- [x] FR5.6: OTA from a bumped tree. With `nativeApplicationVersion '1.1.0'`, `platform '18'`, `expoConfig {version '1.1.1', ios {buildNumber '19'}}`, `updateId '0f3c9a12-…'` and not embedded, the row reads `Version 1.1.0 (18)` / `Update: 0f3c9a12`, and no Text under `about-version` contains `1.1.1` or `19`.
- [x] FR5.7: version fallback. With `nativeApplicationVersion: null`, `expoConfig.version '1.1.1'` and `platform '18'`, the row reads `Version 1.1.1 (18)`.

### FR6: Quality gates
- [x] Confirm red phase:
  - `npx jest src/lib/__tests__/legalLinks.test.ts` fails because `@/src/lib/legalLinks` can't be found.
  - `npx jest app/__tests__/modal-about.test.tsx` fails because `About` / `about-privacy` are missing.
  - Every pre-existing suite in the regression set is still green.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run `red-phase-test-validator` agent
- [x] All FR success criteria have test coverage (FR1–FR5 via jest; FR6 via the commands in Phase 1.1 / Final Verification)
- [x] Assertions are specific: exact strings and `toHaveBeenCalledWith` with exact URL and options, not just "exists" or "doesn't throw"
- [x] Mocks return realistic data matching the interface contracts: a lowercase UUID `updateId`, string build numbers, `WebBrowserResult` shapes (`{ type: 'dismiss' | 'locked' }`), and `presentationStyle: 'automatic'`
- [x] `expo-application` / `expo-constants` / `expo-updates` mocks are `__esModule` + getter-backed, so per-test mutation actually reaches the modal
- [x] FR5.6 and FR5.7 use a `nativeApplicationVersion` that differs from `expoConfig.version`, so each test proves which source the row reads
- [x] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Legal URL constants
- [x] Create `src/lib/legalLinks.ts` with `PRIVACY_POLICY_URL` and `SUPPORT_URL`, using the exact literals from the spec.
- [x] Verify purity: `grep -nE "^\s*import " src/lib/legalLinks.ts` prints nothing.
- [x] Run `npx jest src/lib/__tests__/legalLinks.test.ts -t FR1`. It passes.

### FR2: `formatBuildInfo`
- [x] In `src/lib/legalLinks.ts`, export `BuildInfoInput` (`version`, `buildNumber` and `updateId` typed `string | null | undefined`; `isEmbeddedLaunch: boolean`) and `BuildInfo`.
- [x] Implement `formatBuildInfo`:
  - Empty values (`null`, `undefined`, `''`) count as absent.
  - `isEmbeddedLaunch` takes precedence over `updateId`.
  - The update id is `slice(0, 8)`.
- [x] Add a 2–3 line JSDoc to `formatBuildInfo` (per the `hourglassws/CLAUDE.md` comment rule).
- [x] Run `npx jest src/lib/__tests__/legalLinks.test.ts`. All tests pass.

### FR4: `openLegalLink` (implement before the JSX that calls it)
- [x] In `app/modal.tsx`, add `Linking` to the existing `react-native` import on line 4.
- [x] Add `import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';`.
- [x] Add the module-scope, unexported `async function openLegalLink(url: string): Promise<void>`, placed above `export default function ModalScreen()`. Its flow:
  1. `openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC })`. Any resolved result means done.
  2. On reject, `Linking.openURL(url)`.
  3. If that also rejects, `Alert.alert('Could not open link', url)`.
- [x] No `EXPO_OS` / `Platform.OS` gate.

### FR5: Build info wiring
- [x] Run `npx expo install expo-application`. Confirm it wrote `"expo-application": "~55.0.10"`, and that `npm ls expo-application` still shows a single 55.0.10 (no reinstall, no other lockfile churn).
- [x] Add the imports:
  - `import * as Application from 'expo-application';`
  - `import Constants from 'expo-constants';`
  - `import * as Updates from 'expo-updates';`
  - `import { PRIVACY_POLICY_URL, SUPPORT_URL, formatBuildInfo } from '@/src/lib/legalLinks';`
- [x] Inside `ModalScreen` (at render time, not module scope), compute `const buildInfo = formatBuildInfo({ ... })` with these fields:
  - `version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version`. Native first: under OTA, `expoConfig` is the publishing tree's config, and spec 04 skips `ExpoConfigVersions`.
  - `buildNumber: Constants.platform?.ios?.buildNumber ?? Constants.expoConfig?.ios?.buildNumber`
  - `updateId: Updates.updateId`
  - `isEmbeddedLaunch: Updates.isEmbeddedLaunch`

### FR3: About section
- [x] Insert the About JSX **between** the Debug Log box's closing `</View>` (currently line 254) and `{config && isMe && (` (currently line 256). Do not put it directly above Sign Out.
- [x] Build the section:
  - `View testID="about-section" style={styles.aboutBox}` with a `Text` heading `About`.
  - `TouchableOpacity testID="about-privacy" accessibilityRole="link" onPress={() => openLegalLink(PRIVACY_POLICY_URL)}` containing `Privacy Policy`.
  - `TouchableOpacity testID="about-support" accessibilityRole="link" onPress={() => openLegalLink(SUPPORT_URL)}` containing `Support`.
  - `View testID="about-version"` containing `buildInfo.versionLine` and a muted `buildInfo.updateLine`.
- [x] Add the styles `aboutBox`, `aboutTitle`, `aboutRow` (`minHeight: 44`), `aboutRowLabel`, `aboutVersion` and `aboutUpdate`:
  - `aboutBox` and `aboutTitle` mirror `debugLogBox` and `debugLogTitle`.
  - Text colors use `colors.*` tokens.
  - Do not use `'#0D1117'`.
- [x] Run `npx jest app/__tests__/modal-about.test.tsx`. All tests pass.

### FR6: Quality gates and docs
- [x] Update `docs/ARCHITECTURE.md:267` (Settings row) to add: "About" section (Privacy Policy, Support, version/update row) visible to **all users**, store-compliance spec 02.
- [x] Add `| **expo-application** | ~55.0.10 | Native app version (Settings → About) |` to the `TECH_STACK.md` Utilities table, next to `expo-constants`.
- [x] Run the regression set: `npx jest app/__tests__/modal src/lib/__tests__/legalLinks.test.ts src/lib/__tests__/colors.test.ts src/components/__tests__/TouchAndNavigation.test.tsx`. Everything is green. `git diff --stat -- app/__tests__/modal.test.tsx app/__tests__/modal-signout.test.tsx app/__tests__/modal-debug-log.test.tsx app/__tests__/modal-auth-cache.test.tsx app/__tests__/modal.colorSemantics.test.tsx src/components/__tests__/TouchAndNavigation.test.tsx src/lib/__tests__/colors.test.ts` is empty.
- [x] Typecheck: `npx tsc --noEmit -p . 2>&1 | grep -E "^(app/modal\.tsx|src/lib/legalLinks\.ts|src/lib/__tests__/legalLinks\.test\.ts|app/__tests__/modal-about\.test\.tsx)\("` prints nothing, and the total `error TS` count is ≤ the recorded baseline.
- [x] Lint: `npx eslint app/modal.tsx src/lib/legalLinks.ts src/lib/__tests__/legalLinks.test.ts app/__tests__/modal-about.test.tsx` exits 0.
- [x] Dependency diff is only `expo-application`:
  - `node -p "require('./package.json').dependencies['expo-application']"` prints `~55.0.10`.
  - `node -p "require('./package-lock.json').packages['node_modules/expo-application'].version"` prints `55.0.10`.
  - `git diff -U0 "$(git merge-base HEAD main)" -- package.json package-lock.json | grep -E '^[+-][^+-]'` prints exactly two `+` lines, both adding `"expo-application": "~55.0.10",`.
- [x] Autolinking unchanged: `npx expo-modules-autolinking search --platform apple --json` still lists `expo-application` (39 modules on 2026-10-19).
- [x] Config introspection: `npx expo config --type public --json` shows `version` `1.1.0`, `ios.buildNumber` (`17` until spec 05), and `plugins` including `expo-web-browser`.

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code (FR1–FR6)
- [ ] Interface contracts match the implementation (`BuildInfoInput` / `BuildInfo` / `formatBuildInfo` signatures; `openLegalLink` unexported, module scope, never rejects; testIDs `about-section`, `about-privacy`, `about-support`, `about-version`)
- [ ] No scope creep or shortfall: no `runtimeVersion`/channel display, no update-check button, no changes to other Settings sections

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes (regression set above)
- [ ] Commit fixes: `fix(02-in-app-legal-links): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on `src/lib/__tests__/legalLinks.test.ts` and `app/__tests__/modal-about.test.tsx`
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(02-in-app-legal-links): strengthen test assertions`

### Final Verification
- [ ] All tests passing (regression set + new files)
- [ ] No regressions in existing tests (existing test files unmodified)
- [ ] Code follows existing patterns: section styling mirrors Debug Log; `colors` tokens; `src/lib/legalLinks.ts` has no imports
- [ ] **Manual (iOS simulator or device, dev client — not Expo Go, which reports its own app version):**
  - Settings → About is visible without the dev account.
  - Privacy Policy and Support open in the in-app sheet, not external Safari.
  - Done returns to Settings.
  - A rapid double-tap opens only one sheet.
  - The version row shows the dev client binary's version and build (`Version 1.1.0 (17)` if it was built from the current `app.json`) and `Update: embedded`.
- [ ] **Release gate (record the result; blocks spec 05 submission, not this merge):** `for u in https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html; do curl -sS -o /dev/null -L -w "%{http_code} $u\n" "$u"; done` prints `200` for both. On 2026-10-19 both returned `404`, pending spec 01.
- [ ] **Handoff notes for spec 04/05:**
  - Spec 05's TestFlight smoke test expects `Version 1.1.0 (18)`.
  - Spec 04 runbook A compares the row's 8-character prefix against the **iOS update ID** from `eas update` output, not the update group ID.
  - The version row reads the binary's `CFBundleShortVersionString (CFBundleVersion)`, so it stays `Version 1.1.0 (18)` after any OTA, including one published from a tree with a bumped version. Flag to spec 04's owner that its FR3 step 5 warning text ("the Settings version row will show the app.json values"), Out Of Scope 7 and the "Settings row shows the publishing tree's version" edge case are stale.

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19**: Spec drafted. Pre-implementation facts:
- Baseline: 5 modal suites / 35 tests green, and 529 TS errors repo-wide (0 in `app/modal.tsx`). `npx eslint app/modal.tsx` is clean.
- Both legal URLs return 404 (spec 01 not yet deployed).
- A throwaway probe confirmed that unmocked `expo-updates`, `expo-constants` and `expo-web-browser` load under the `jest-expo/node` preset (`updateId` null, `expoConfig` without `ios`, `EXPO_OS='web'`). The probe was deleted.

**2026-10-19 (revision)**: Validator finding: the spec's OTA edge case wrongly assumed spec 04 uses the default fingerprint. Spec 04 FR2 skips `ExpoConfigVersions`, so an OTA from a version-bumped tree still matches build 18, and `Constants.expoConfig.version` would show the publishing tree's version. Fix: FR5 now reads the version from `expo-application` `nativeApplicationVersion` (binary `CFBundleShortVersionString`), with FR5.6/FR5.7 covering the mismatch and the fallback. Facts:
- `expo-application` 55.0.10 is already installed (via `expo-notifications` 55.0.13) and autolinked on iOS (`expo-modules-autolinking search --platform apple`: 39 modules, includes it).
- `expo-constants` exposes only `CFBundleVersion` natively (`EXConstantsService.m:51,59`). It has no native marketing version.
- A probe under `jest-expo/node` (in this spec folder, deleted after) showed unmocked `nativeApplicationVersion` / `nativeBuildVersion` = `null`, `expoConfig.version` = `'1.1.0'`, and `Constants.platform` undefined.
- The only `package.json`-derived fingerprint sources are `packageJson:scripts` and `react-native`'s own `package.json` (`@expo/fingerprint/build/sourcer/{Bare,Sourcer}.js`), so declaring the dependency doesn't add a hashed input.

**2026-10-19 (Phase 1.0)**: Tests written and committed (red phase). The Test Design Validation gate (`red-phase-test-validator`) is still open and is run by the orchestrator.
- Baseline (`legal` worktree, after spec 01): regression set 7 suites / 78 tests green (5 `modal*` suites / 35 tests). `tsc` 552 errors. `npx eslint app/modal.tsx` exits 0.
- `src/lib/__tests__/legalLinks.test.ts` (FR1–FR2: 18 tests) fails as expected: `Could not locate module @/src/lib/legalLinks`.
- `app/__tests__/modal-about.test.tsx` (FR3–FR5: 19 tests) loads cleanly. All 19 fail on missing behaviour: `About` text absent, or `No pressable with testID "about-privacy"/"about-support"`, or `No node with testID "about-version"`. No syntax, import or mock-hoisting errors.
- Regression set after adding the tests: 78 pre-existing tests still green. Full suite: 4942 passed, 20 failed (19 new + the known `NativeWindSmoke` failure).
- New TS errors: only TS2307 for the missing `@/src/lib/legalLinks` in `legalLinks.test.ts`, which clears once the module exists. `modal-about.test.tsx` has 0 TS errors and 0 lint errors (5 `no-require-imports` warnings, the same pattern as the other modal tests).
- Design choices:
  - `modal-about.test.tsx` declares its own `PRIVACY_POLICY_URL` / `SUPPORT_URL` literals instead of importing `@/src/lib/legalLinks`. The suite then fails because About is missing rather than at import, and it proves the modal opens the exact published URLs.
  - FR3.5 also asserts that `about-privacy` and `about-support` come before the last `onPress` node. Without that, it is just an invariant that already holds today.
  - FR3.1 additionally checks that the texts sit inside `about-section` and that `about-version` has no `onPress` (UI contract).
- Satisfiability check: a throwaway spec-conformant implementation (reverted, never committed) turned all 37 new tests green, with the full regression set at 115/115. Mutations of it were each caught:
  - Version or build number read from `expoConfig` first → FR5.6 (and FR5.2/FR5.7) fail.
  - Block-body `onPress` → FR4.5 fails.
  - A copied `EXPO_OS` gate → FR4.1–FR4.6 fail.
  - No Alert fallback → FR4.5 fails.
  - About gated on `config` → FR3.3 fails.
  - About moved below Sign Out → FR3.4 and FR3.5 fail.

**2026-10-19 (Phase 1.1)**: Implemented FR1–FR6. The orchestrator's `red-phase-test-validator` run returned no findings, so no test changes were needed. The Test Design Validation items were re-checked against both test files before being ticked.
- `src/lib/legalLinks.ts`: no imports. It has the two URL constants, `BuildInfoInput` / `BuildInfo`, and `formatBuildInfo` with a 3-line JSDoc.
- `app/modal.tsx`:
  - `Linking` was added to the `react-native` import, plus the imports for `expo-application`, `expo-constants`, `expo-updates`, `expo-web-browser` and `legalLinks`.
  - `openLegalLink` is module scope, above `ModalScreen`, and not exported. It has no `EXPO_OS` gate.
  - `buildInfo` is computed at render time. Version and build are read native first.
  - The About JSX sits between Debug Log and Dev Options.
  - It uses exactly six new style keys: `aboutBox`, `aboutTitle`, `aboutRow` (`minHeight: 44`), `aboutRowLabel`, `aboutVersion`, `aboutUpdate`. `aboutTitle` mirrors `debugLogTitle`'s `#8B949E`. The row and version text use `colors.textPrimary`, `colors.textSecondary` and `colors.textMuted`.
- **Gotcha: `npx expo install expo-application` (online) wrote `~55.0.19` and upgraded `node_modules` to 55.0.19.**
  - Cause: the online versions API is newer than the local `expo/bundledNativeModules.json` (`~55.0.10`, expo 55.0.7).
  - Fix:
    1. Reverted `package.json` / `package-lock.json`.
    2. Restored `node_modules/expo-application` at 55.0.10 with an APFS clone from main's `node_modules`.
    3. Re-ran `EXPO_OFFLINE=1 npx expo install expo-application`. That wrote `~55.0.10`, kept 55.0.10, and the diff is exactly the two required `+` lines.
  - **Spec 06 / any rebase re-run must use `EXPO_OFFLINE=1`** (or accept 55.0.19 deliberately).
- Verification:
  - Regression set: 9 suites / 115 tests green (78 pre-existing + 37 new). The 7 pre-existing test files are unmodified.
  - Full `npx jest --silent`: 4979 passed / 1 failed (only `NativeWindSmoke.test.tsx`, the known baseline failure).
  - `tsc`: 552 errors (≤ 552 baseline; the TS2307 for `legalLinks` cleared). 0 errors in the four touched files.
  - `eslint` on the four files: exit 0, 0 errors. There are 5 `no-require-imports` warnings in `modal-about.test.tsx`.
  - `npx expo lint`: 9 errors / 499 warnings (main baseline 9 / 494; the +5 are those test warnings).
  - `package.json` dependency is `~55.0.10`, the lockfile has 55.0.10, and `npm ls` shows a single `expo-application@55.0.10` deduped under `expo-notifications`.
  - Autolinking: 39 apple modules, including `expo-application` 55.0.10.
  - `expo config`: `version` 1.1.0, `ios.buildNumber` 17, `plugins` includes `expo-web-browser`.
  - Release gate curl: both URLs return `404` (spec 01 not deployed yet; expected).
- Left for the orchestrator: Phase 1.2 review agents, the manual dev-client check, the release-gate curl (needs spec 01's deploy), and the spec 04 handoff flag.
