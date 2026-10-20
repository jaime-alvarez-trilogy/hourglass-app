# In-App Legal Links

**Status:** Draft
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Add an always-visible **About** section to the Settings modal (`app/modal.tsx`) containing:

1. A **Privacy Policy** row and a **Support** row. Each opens its GitHub Pages URL (owned by spec 01) in the in-app Safari sheet via `expo-web-browser`'s `openBrowserAsync`, falling back to `Linking.openURL` if the sheet cannot be presented, and to an `Alert` if both fail.
2. A **version row**: `Version 1.1.0 (18)` plus a muted second line `Update: <first 8 chars of updateId>` or `Update: embedded`. The version and build number are read from the **binary** (`CFBundleShortVersionString` / `CFBundleVersion`), so they never change under OTA. Only the `Update:` line identifies the OTA.

The URLs and the version/update string formatting live in a new pure module, `src/lib/legalLinks.ts` (`PRIVACY_POLICY_URL`, `SUPPORT_URL`, `formatBuildInfo`). That module has no imports, so it is unit-testable without native modules and respects the `src/lib` layering convention. The modal reads `expo-application` / `expo-constants` / `expo-updates` at render time, builds a `BuildInfoInput`, and renders `formatBuildInfo`'s output.

This closes App Review Guideline 5.1.1(i) (privacy policy reachable inside the app). It also gives spec 04 (OTA baseline verification) and spec 05 (TestFlight smoke test) a visible readout of which binary and which OTA update is running.

**One new direct dependency, no new native code:** `expo-application` `~55.0.10`, for the binary's marketing version (FR5). It is already installed at 55.0.10 (a dependency of `expo-notifications` 55.0.13) and already autolinked into the iOS binary (`npx expo-modules-autolinking search --platform apple` lists it among 39 modules on 2026-10-19). Declaring it only stops the import relying on npm hoisting. Build 18 is a native build anyway. `expo-web-browser` 55.0.10, `expo-constants` 55.0.9 and `expo-updates` 55.0.15 are already direct dependencies, and `expo-web-browser` is already in `app.json` `plugins`.

---

## Out Of Scope

1. **Hosting and content of the privacy/support pages.** **Deferred to `01-legal-pages`.** That spec owns `site/privacy-policy.html`, `site/support.html` and the Pages workflow. As of 2026-10-19 both URLs return 404 (verified with curl). This spec only hard-codes the URLs spec 01 publishes.

2. **App Store Connect Privacy/Support/Marketing URL fields.** **Descoped (non-code; OPS.md O4).** ASC is changed by hand after spec 01's curl checks pass.

3. **Bumping `ios.buildNumber` 17 → 18.** **Deferred to `05-release-build-18`.** Until then, a dev client built from the current `app.json` reads `Version 1.1.0 (17)`. Tests must not read `app.json`.

4. **`runtimeVersion` policy, OTA publishing, and verifying on a store install that the row flips from `embedded` to an update id.** **Deferred to `04-ota-lane`** (runbook A) **and `05-release-build-18`** (TestFlight smoke).

5. **Showing `Updates.runtimeVersion` or `Updates.channel` in the version row.** **Descoped.** Under spec 04's fingerprint policy the runtime version is a long hash with no value to users. The update id prefix is enough for runbook A. (The research listed `runtimeVersion` under Key Files, but its own contract never used it.)

6. **Foreground update checks / a "Check for updates" button.** **Descoped.** This is a FEATURE.md non-goal.

7. **Terms of Service / EULA link.** **Descoped.** The app relies on Apple's standard EULA, and spec 01 publishes no terms page.

8. **In-app account deletion (Guideline 5.1.1(v)).** **Descoped.** It is not applicable because Hourglass signs into existing Crossover accounts and never creates accounts.

9. **Android version code display.** **Descoped.** There is no Android store listing. On Android the build number falls back to `expoConfig.ios.buildNumber`, which is harmless. (The version still comes from the native `versionName`.)

10. **Changing or gating the existing "Config Debug" box, environment switcher, Debug Log or Dev Options sections.** **Descoped.** These sections are untouched apart from inserting About between Debug Log and Dev Options.

11. **Removing the template `components/external-link.tsx`** (still used by `app/(tabs)/explore.tsx`). **Descoped.** This spec only reads it for the `openBrowserAsync` options.

12. **Fixing pre-existing TypeScript errors in existing modal tests** (`fs`/`path`/`__dirname` with `types: ["jest"]`, and `mock.calls` tuple indexing). **Deferred to `07-ci-typecheck-lint`.** This spec must not add new errors of that kind.

13. **Localization of the new strings.** **Descoped.** The app is English-only.

---

## Functional Requirements

### FR1: Legal URL constants

`src/lib/legalLinks.ts` exports the two public legal URLs as string constants. They match spec 01's page map exactly.

**Requirements:**
- `export const PRIVACY_POLICY_URL = 'https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html';`
- `export const SUPPORT_URL = 'https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html';`
- The module has **no `import` statements** (no `react-native`, no `expo-*`, no `src/api`, `src/store`, `src/hooks`).
- The URLs are independent of `config.useQA`: the same values apply in both environments.

**Success Criteria:**
- [ ] `PRIVACY_POLICY_URL` strictly equals `'https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html'`.
- [ ] `SUPPORT_URL` strictly equals `'https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html'`.
- [ ] Both constants start with `https://jaime-alvarez-trilogy.github.io/hourglass-app/` and contain no whitespace.
- [ ] `grep -nE "^\s*import " src/lib/legalLinks.ts` prints nothing.

---

### FR2: `formatBuildInfo` pure formatter

`formatBuildInfo(input)` turns raw build/update values into the two display lines. It is a pure function with no side effects.

**Requirements:**
- `versionLine`:
  - Base text: `Version <version>` if `version` is a non-empty string, otherwise `Version unknown`.
  - Append ` (<buildNumber>)` if `buildNumber` is a non-empty string. Otherwise append nothing (no empty parentheses).
- `updateLine`:
  - `Update: embedded` if `isEmbeddedLaunch` is `true`, **or** if `updateId` is `null`, `undefined` or `''`.
  - Otherwise `Update: ${updateId.slice(0, 8)}`.
  - `isEmbeddedLaunch` takes precedence because embedded launches on store builds have a non-null `updateId`: the embedded update's own UUID.
- `null`, `undefined` and `''` are all treated as "absent" for `version`, `buildNumber` and `updateId`.
- The function does not mutate its input and does not read any global or module state.
- The function has a 2–3 line JSDoc, per the `src/lib` comment rule in `hourglassws/CLAUDE.md`.

**Success Criteria:**
- [ ] `{ version: '1.1.0', buildNumber: '18', updateId: '0f3c9a12-3456-4abc-8def-1234567890ab', isEmbeddedLaunch: false }` returns exactly `{ versionLine: 'Version 1.1.0 (18)', updateLine: 'Update: 0f3c9a12' }`.
- [ ] The same input with `isEmbeddedLaunch: true` returns `updateLine: 'Update: embedded'`, even though `updateId` is non-null.
- [ ] `updateId` of `null`, `undefined` or `''` with `isEmbeddedLaunch: false` returns `'Update: embedded'`.
- [ ] `updateId: 'abc'` (shorter than 8 characters) returns `'Update: abc'`.
- [ ] `version` of `undefined`, `null` or `''` with `buildNumber: '18'` returns `'Version unknown (18)'`. With no build number it returns `'Version unknown'`.
- [ ] `buildNumber` of `undefined`, `null` or `''` with `version: '1.1.0'` returns `'Version 1.1.0'`.
- [ ] Calling with an `Object.freeze`d input does not throw, and two calls with equal inputs return deep-equal outputs.

---

### FR3: About section in the Settings modal

`app/modal.tsx` renders an About section that every user can see. It sits immediately after the Debug Log box and before the Dev Options block and the Sign Out button.

**Requirements:**
- **Placement:** Insert the section between the closing `</View>` of the Debug Log box (current line 254) and `{config && isMe && (` (current line 256).
  - This placement is required, not cosmetic. It keeps Sign Out as the last `onPress` node in the tree, which `app/__tests__/modal-signout.test.tsx:163-168` relies on.
  - It also keeps every `<TouchableOpacity` far more than 200 source characters away from `handleSignOut`, which `src/components/__tests__/TouchAndNavigation.test.tsx` SC4.4 relies on.
- **Visibility:** No conditions. The section renders when `config` is null, for managers and non-managers, for QA and production, and whether or not `isMe` is true.
- **Structure:**
  - Container `View` with `testID="about-section"`.
  - Heading `Text` exactly `About`.
  - A row `TouchableOpacity` with `testID="about-privacy"` and `accessibilityRole="link"`, containing a `Text` exactly `Privacy Policy`.
  - A row `TouchableOpacity` with `testID="about-support"` and `accessibilityRole="link"`, containing a `Text` exactly `Support`.
  - A non-pressable `View` with `testID="about-version"`, containing a `Text` with `versionLine` and a muted `Text` with `updateLine`.
- **Row handlers:** `onPress={() => openLegalLink(PRIVACY_POLICY_URL)}` and `onPress={() => openLegalLink(SUPPORT_URL)}`. Use an expression body so `onPress` returns the promise and tests can await it.
- **Styling:**
  - New style keys: `aboutBox`, `aboutTitle`, `aboutRow`, `aboutRowLabel`, `aboutVersion`, `aboutUpdate`.
  - `aboutBox` and `aboutTitle` mirror `debugLogBox` and `debugLogTitle` (`#161B22`, radius 12, padding 14, marginBottom 16; 12pt uppercase `#8B949E` title).
  - Rows have `minHeight: 44` (HIG touch target).
  - New text colors use `colors.*` tokens (`textPrimary`, `textSecondary`, `textMuted`).
  - Do not use the string `'#0D1117'`, which `src/lib/__tests__/colors.test.ts` FR4.1 bans.

**Success Criteria:**
- [ ] With a non-manager config, the rendered tree contains Text nodes exactly `About`, `Privacy Policy` and `Support`, and a node with `testID="about-version"`.
- [ ] With a manager config (`isManager: true`), the same four elements render.
- [ ] With `config: null`, the same four elements render, and `Config Debug` does not render (this proves the null branch ran).
- [ ] With `isMe` true (`process.env.EXPO_PUBLIC_DEV_USERNAME` equal to the mocked username), the depth-first Text order is `Debug Log` < `About` < `Dev Options` < `Sign Out`.
- [ ] The last node in `renderer.root.findAll(n => n.props?.onPress !== undefined)` has a descendant Text `Sign Out`.
- [ ] The `about-privacy` and `about-support` pressables have `accessibilityRole === 'link'`.
- [ ] All existing modal test files pass **without modification**: `modal.test.tsx`, `modal-signout.test.tsx`, `modal-debug-log.test.tsx`, `modal-auth-cache.test.tsx`, `modal.colorSemantics.test.tsx`, plus `src/components/__tests__/TouchAndNavigation.test.tsx` and `src/lib/__tests__/colors.test.ts`.

---

### FR4: Opening legal links in the in-app browser

`openLegalLink(url)` is a module-scope, **unexported** async function in `app/modal.tsx`. It presents the in-app Safari sheet and degrades gracefully.

**Requirements:**
- Call `openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC })`.
- **Do not gate on `process.env.EXPO_OS` or `Platform.OS`.** `components/external-link.tsx:14` has such a gate. In jest (`jest-expo/node` preset) both values are `'web'`, so a copied gate would skip the call in tests.
- Treat any **resolved** result as success, including `{ type: 'locked' }`. On iOS, `WebBrowserModule.swift:25-28` resolves `locked` (it does not reject) when a sheet is already open, so a double-tap must not trigger the fallback.
- On **rejection**, call `Linking.openURL(url)` (add `Linking` to the existing `react-native` import).
- If `Linking.openURL` also rejects, call `Alert.alert('Could not open link', url)`.
- `openLegalLink` never rejects, so a tap can't cause an unhandled promise rejection.
- Define it at module scope: above `export default function ModalScreen()` or below the component. Do not put it inside the component, and keep it away from `handleSignOut`. This keeps the `modal-auth-cache` and `TouchAndNavigation` source regexes unaffected.

**Success Criteria:**
- [ ] Pressing `about-privacy` calls `openBrowserAsync` exactly once with `('https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html', { presentationStyle: 'automatic' })`, and does not call `Linking.openURL`.
- [ ] Pressing `about-support` calls `openBrowserAsync` exactly once with `(SUPPORT_URL, { presentationStyle: 'automatic' })`.
- [ ] If `openBrowserAsync` resolves `{ type: 'locked' }`, neither `Linking.openURL` nor `Alert.alert` is called.
- [ ] If `openBrowserAsync` rejects, `Linking.openURL` is called exactly once with the same URL.
- [ ] If both reject, `Alert.alert` is called with `('Could not open link', SUPPORT_URL)`, and the awaited `onPress()` resolves (does not throw).
- [ ] With a QA config (`useQA: true`), pressing `about-privacy` still opens `PRIVACY_POLICY_URL`.

---

### FR5: Build info wiring from Expo modules

The modal builds `BuildInfoInput` from `expo-application`, `expo-constants` and `expo-updates` **during render** (not captured at module scope), then renders `formatBuildInfo`'s output in `about-version`.

**Why both version fields are read natively:** under an OTA launch, `Constants.expoConfig` is the update manifest's `extra.expoClient` (`expo-constants/build/Constants.js:101-119`), i.e. the config of the tree that **published** the update, not the binary's. Spec 04 FR2 puts `ExpoConfigVersions` in `sourceSkips`, so `version`, `ios.buildNumber` and `android.versionCode` are **not** fingerprint inputs. An update published from a tree whose version or build number was bumped still matches build 18's runtime and installs. If the row read `expoConfig.version`, a build-18 user would then see `Version 1.1.1 (18)`. Reading both values from the binary's Info.plist keeps the row equal to the installed binary. The `Update:` line is what identifies the OTA.

**Requirements:**
- `version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version`
  - Native first: `nativeApplicationVersion` is the binary's `CFBundleShortVersionString` (`expo-application/ios/ApplicationModule.swift:18-19`). It never changes under OTA.
  - The fallback applies only where the native value is `null`: web, and jest (`expo-application/build/ExpoApplication.web.js`; confirmed by a probe on 2026-10-19).
- `buildNumber: Constants.platform?.ios?.buildNumber ?? Constants.expoConfig?.ios?.buildNumber`
  - Native first: `platform.ios.buildNumber` is the binary's `CFBundleVersion` (`expo-constants/ios/EXConstantsService.m:51,59`) and never changes under OTA.
  - In Expo Go the native value is `null`, so the fallback applies.
  - Keep `expo-constants` here rather than `Application.nativeBuildVersion`. On iOS both read the same `CFBundleVersion`, but in Expo Go `expo-application` reports Expo Go's own build, not `null`.
- `updateId: Updates.updateId`
- `isEmbeddedLaunch: Updates.isEmbeddedLaunch`
- Imports:
  - `import * as Application from 'expo-application';`
  - `import Constants from 'expo-constants';`
  - `import * as Updates from 'expo-updates';`
  - `import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';`
  - `import { PRIVACY_POLICY_URL, SUPPORT_URL, formatBuildInfo } from '@/src/lib/legalLinks';`
- Declare `expo-application` as a direct dependency with `npx expo install expo-application`. It must write `"expo-application": "~55.0.10"`, and `node_modules/expo-application` must stay at 55.0.10 (already installed and autolinked; see Overview).
- Rendering must not crash when the modules are **unmocked** in jest. Under the `jest-expo/node` preset:
  - `expo-application` resolves to `ExpoApplication.web.js` (`nativeApplicationVersion` null).
  - `expo-updates` resolves to `ExpoUpdates.web.js` (`updateId` null, `isEmbeddedLaunch` false).
  - `Constants.expoConfig` has `version: '1.1.0'` but no `ios` key, and `Constants.platform` is undefined.
  - All verified by probe on 2026-10-19.

**Success Criteria:**
- [ ] With `nativeApplicationVersion = '1.1.0'`, `expoConfig = { version: '1.1.0', ios: { buildNumber: '18' } }`, `platform = { ios: { buildNumber: '18' } }`, `updateId = '0f3c9a12-3456-4abc-8def-1234567890ab'` and `isEmbeddedLaunch = false`, `about-version` contains Text `Version 1.1.0 (18)` and `Update: 0f3c9a12`.
- [ ] With `platform.ios.buildNumber = '18'` and `expoConfig.ios.buildNumber = '17'`, the row reads `Version 1.1.0 (18)` (native wins).
- [ ] With `platform` undefined and `expoConfig.ios.buildNumber = '17'`, the row reads `Version 1.1.0 (17)` (fallback).
- [ ] With `isEmbeddedLaunch = true`, the row reads `Update: embedded`.
- [ ] With `nativeApplicationVersion = null`, `expoConfig = null` and `platform.ios.buildNumber = '18'`, the row reads `Version unknown (18)`.
- [ ] **OTA from a bumped tree (native version wins):** with `nativeApplicationVersion = '1.1.0'`, `platform.ios.buildNumber = '18'`, `expoConfig = { version: '1.1.1', ios: { buildNumber: '19' } }`, `updateId = '0f3c9a12-…'` and `isEmbeddedLaunch = false`, the row reads `Version 1.1.0 (18)` and `Update: 0f3c9a12`, and no Text node under `about-version` contains `1.1.1` or `19`.
- [ ] **Version fallback:** with `nativeApplicationVersion = null`, `expoConfig.version = '1.1.1'` and `platform.ios.buildNumber = '18'`, the row reads `Version 1.1.1 (18)`. The distinct value proves that `expoConfig` is the source.
- [ ] The unmodified existing modal suites (which do not mock these modules) still pass.

---

### FR6: Quality gates and documentation

The change adds no type errors and no lint errors. Its only dependency change is the `expo-application` declaration from FR5. The architecture and tech-stack docs reflect the change.

**Requirements:**
- The new test files avoid `fs`, `path` and `__dirname`, and do not index `mock.calls[n][m]`.
  - Assert with `toHaveBeenCalledWith` / `toHaveBeenCalledTimes`.
  - Type jest mocks with explicit parameter types.
  - This avoids the TS2307/TS2304/TS2493 classes that already affect older modal tests.
- Update the `docs/ARCHITECTURE.md:267` Settings row with: an "About" section (Privacy Policy, Support, version/update row) visible to **all users** — store-compliance spec 02.
- `TECH_STACK.md` Utilities table: add `| **expo-application** | ~55.0.10 | Native app version (Settings → About) |` next to the `expo-constants` row. This keeps spec 06 FR6's "every dependency row matches `package.json`" rule true.
- The only change to `package.json` / `package-lock.json` is the `expo-application` entry, one line in `package.json` `dependencies` and one in the lockfile's `packages[""].dependencies`. There must be no version change in `node_modules/expo-application` and no other lockfile churn. If specs 03/04 change these files first, rebase and re-run `npx expo install expo-application` instead of hand-merging the lockfile.

**Success Criteria:**
- [ ] `npx tsc --noEmit -p . 2>&1 | grep -E "^(app/modal\.tsx|src/lib/legalLinks\.ts|src/lib/__tests__/legalLinks\.test\.ts|app/__tests__/modal-about\.test\.tsx)\("` prints nothing. The total `error TS` count is ≤ the pre-change baseline (529 on 2026-10-19).
- [ ] `npx eslint app/modal.tsx src/lib/legalLinks.ts src/lib/__tests__/legalLinks.test.ts app/__tests__/modal-about.test.tsx` exits 0 with 0 errors.
- [ ] `node -p "require('./package.json').dependencies['expo-application']"` prints `~55.0.10`, and `node -p "require('./package-lock.json').packages['node_modules/expo-application'].version"` prints `55.0.10`.
- [ ] `git diff -U0 "$(git merge-base HEAD main)" -- package.json package-lock.json | grep -E '^[+-][^+-]'` prints exactly two lines, both `+` lines adding `"expo-application": "~55.0.10",`.
- [ ] `docs/ARCHITECTURE.md` Settings row mentions the About section, and `grep -n 'expo-application' TECH_STACK.md` shows `~55.0.10`.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `app/modal.tsx:4` | Existing `react-native` import. Add `Linking` here |
| `app/modal.tsx:187-292` | Section layout: Config Debug 187-199, env switcher 201-229, Debug Log 231-254, Dev Options 256-288, Sign Out 290-292 |
| `app/modal.tsx:376-412` | `debugLogBox`/`debugLogTitle`/`debugLogButton` styles to mirror |
| `components/external-link.tsx:2,18-20` | `openBrowserAsync(href, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC })`. **Do not copy line 14's `EXPO_OS` gate** |
| `app/__tests__/modal-debug-log.test.tsx:9-132` | Full mock set + `renderModal` / `findTextNodes` / `findPressableForLabel` helpers to copy |
| `app/__tests__/modal-signout.test.tsx:163-168` | "Sign Out is the last onPress node" invariant |
| `src/components/__tests__/TouchAndNavigation.test.tsx:84-87` | SC4.4 regex `<TouchableOpacity[\s\S]{0,200}handleSignOut` |
| `app/__tests__/modal-auth-cache.test.tsx:39,53` | Function-body regexes anchored on `handleSignOut` / `handleSwitchEnvironment` |
| `src/lib/__tests__/colors.test.ts:124-168` | Bans `'#0D1117'`; requires the `colors` import |
| `src/__tests__/lib/pushToken.test.ts:15-26` | `expo-constants` mock shape (`{ __esModule: true, default: {...} }`) |
| `node_modules/expo-updates/build/Updates.d.ts:19,61` | `updateId: string \| null`, `isEmbeddedLaunch: boolean` (v55.0.15) |
| `node_modules/expo-application/ios/ApplicationModule.swift:18-19` | `nativeApplicationVersion` = binary `CFBundleShortVersionString` (v55.0.10) |
| `node_modules/expo-application/build/Application.d.ts:10` / `ExpoApplication.web.js` | `nativeApplicationVersion: string \| null`. The web module (used by jest) returns `null` |
| `node_modules/expo-constants/build/Constants.js:101-119` | `expoConfig` = update manifest's `extra.expoClient` on OTA launches |
| `features/app/store-compliance/specs/04-ota-lane/spec.md` FR2 | `sourceSkips: ['ExpoConfigVersions', …]`: version/buildNumber don't fork the runtime, which is why FR5 reads both natively |
| `node_modules/expo-constants/build/Constants.types.d.ts:36-45,204` | `platform?.ios?.buildNumber: string \| null` = binary `CFBundleVersion` |
| `node_modules/expo-web-browser/ios/WebBrowserModule.swift:19-41` | Second open resolves `{ type: 'locked' }`. Invalid scheme throws |
| `node_modules/expo-web-browser/build/WebBrowser.types.d.ts:138-193` | `WebBrowserResultType.LOCKED`, `WebBrowserPresentationStyle.AUTOMATIC = "automatic"` (v55.0.10) |
| `jest.config.js:2-3` | `preset: 'jest-expo/node'` (`react-native` → `react-native-web`, `EXPO_OS='web'`); `testMatch` `**/__tests__/**/*.test.ts(x)` |
| `docs/ARCHITECTURE.md:267` | Settings route row to update |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/legalLinks.ts` | create | `PRIVACY_POLICY_URL`, `SUPPORT_URL`, `BuildInfoInput`, `BuildInfo`, `formatBuildInfo` (FR1, FR2) |
| `src/lib/__tests__/legalLinks.test.ts` | create | Unit tests for FR1 and FR2 |
| `app/modal.tsx` | modify | Imports, module-scope `openLegalLink`, render-time build info, About section JSX, `about*` styles (FR3–FR5) |
| `app/__tests__/modal-about.test.tsx` | create | Render/behaviour tests for FR3–FR5 |
| `package.json`, `package-lock.json` | modify (via `npx expo install expo-application`) | Declare `expo-application` `~55.0.10` (FR5, FR6) |
| `docs/ARCHITECTURE.md` | modify | Settings row (line 267) mentions About (FR6) |
| `TECH_STACK.md` | modify | Utilities row for `expo-application` (FR6) |

### Interface Contracts

```typescript
// src/lib/legalLinks.ts — no imports
export const PRIVACY_POLICY_URL =
  'https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html'; // ← spec 01 page map
export const SUPPORT_URL =
  'https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html';        // ← spec 01 page map

export interface BuildInfoInput {
  version: string | null | undefined;     // ← Application.nativeApplicationVersion ?? Constants.expoConfig?.version
  buildNumber: string | null | undefined; // ← Constants.platform?.ios?.buildNumber ?? Constants.expoConfig?.ios?.buildNumber
  updateId: string | null | undefined;    // ← Updates.updateId (lowercase UUID or null)
  isEmbeddedLaunch: boolean;              // ← Updates.isEmbeddedLaunch
}

export interface BuildInfo {
  versionLine: string; // "Version 1.1.0 (18)" | "Version 1.1.0" | "Version unknown (18)" | "Version unknown"
  updateLine: string;  // "Update: 0f3c9a12" | "Update: embedded"
}

export function formatBuildInfo(input: BuildInfoInput): BuildInfo;
```

```typescript
// app/modal.tsx — module scope, NOT exported
async function openLegalLink(url: string): Promise<void>;
// try   openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC })  — any resolve = done
// catch → try Linking.openURL(url)
//         catch → Alert.alert('Could not open link', url)
// never rejects
```

| Function | Signature | Responsibility | Dependencies |
|----------|-----------|----------------|--------------|
| `formatBuildInfo` | `(input: BuildInfoInput) => BuildInfo` | Version/update display strings | none (pure) |
| `openLegalLink` | `(url: string) => Promise<void>` | In-app browser with fallbacks | `expo-web-browser`, `react-native` `Linking`/`Alert` |

**UI contract (`app/modal.tsx`, between Debug Log and Dev Options):**

| Element | testID | Content | Behaviour |
|---------|--------|---------|-----------|
| Container `View` | `about-section` | — | Always rendered |
| Heading `Text` | — | `About` | — |
| Row `TouchableOpacity` (`accessibilityRole="link"`) | `about-privacy` | `Privacy Policy` | `onPress={() => openLegalLink(PRIVACY_POLICY_URL)}` |
| Row `TouchableOpacity` (`accessibilityRole="link"`) | `about-support` | `Support` | `onPress={() => openLegalLink(SUPPORT_URL)}` |
| `View` (not pressable) | `about-version` | `versionLine` / muted `updateLine` | — |

### Data Flow

```
expo-application ► Application.nativeApplicationVersion  (binary, OTA-proof)  ┐
expo-constants ──►   ?? Constants.expoConfig?.version ────────────────────────┤
                   Constants.platform?.ios?.buildNumber  (binary, OTA-proof)  │
                     ?? Constants.expoConfig?.ios?.buildNumber ──────────────┤
expo-updates ────► Updates.updateId, Updates.isEmbeddedLaunch ───────────────┤
                                                                              ▼
                                  (render) formatBuildInfo(BuildInfoInput) ──► about-version Text x2

Tap "Privacy Policy" / "Support"
  → openLegalLink(URL from src/lib/legalLinks.ts)
      → openBrowserAsync(url, { presentationStyle: AUTOMATIC })  ──resolve (any type)──► done (SFSafariViewController sheet)
          └─reject─► Linking.openURL(url) ──resolve──► done (external Safari)
                        └─reject─► Alert.alert('Could not open link', url)
  → GitHub Pages (spec 01): /hourglass-app/privacy-policy.html, /hourglass-app/support.html
```

### Test Plan

All paths match `jest.config.js` `testMatch` (`**/__tests__/**/*.test.ts(x)`).

#### `src/lib/__tests__/legalLinks.test.ts` (FR1, FR2)

No mocks. Imports from `@/src/lib/legalLinks`.

| ID | Case | Expected |
|----|------|----------|
| FR1.1 | `PRIVACY_POLICY_URL` | `toBe('https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html')` |
| FR1.2 | `SUPPORT_URL` | `toBe('https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html')` |
| FR1.3 | Both constants | Start with `https://jaime-alvarez-trilogy.github.io/hourglass-app/`; `/\s/` doesn't match |
| FR2.1 | Full input (`'1.1.0'`, `'18'`, `'0f3c9a12-3456-4abc-8def-1234567890ab'`, `false`) | `toEqual({ versionLine: 'Version 1.1.0 (18)', updateLine: 'Update: 0f3c9a12' })` |
| FR2.2 | Same input, `isEmbeddedLaunch: true` | `updateLine === 'Update: embedded'` |
| FR2.3 | `updateId` ∈ {`null`, `undefined`, `''`}, not embedded (`it.each`) | `'Update: embedded'` |
| FR2.4 | `updateId: 'abc'` | `'Update: abc'` |
| FR2.5 | `version` ∈ {`undefined`, `null`, `''`}, `buildNumber: '18'` (`it.each`) | `'Version unknown (18)'` |
| FR2.6 | `version: undefined`, `buildNumber: undefined` | `'Version unknown'` |
| FR2.7 | `buildNumber` ∈ {`undefined`, `null`, `''`}, `version: '1.1.0'` (`it.each`) | `'Version 1.1.0'` |
| FR2.8 | `Object.freeze`d input; call twice | No throw; outputs deep-equal |

#### `app/__tests__/modal-about.test.tsx` (FR3, FR4, FR5)

**Mocks** (declared before the modal is required):
- Copy the full set from `modal-debug-log.test.tsx:11-98`: `@/src/lib/log`, `expo-sharing`, `@/src/lib/pushToken`, `@/src/store/config`, `expo-router`, `@tanstack/react-query`, `expo-notifications`, `expo-blur`, `@/src/components/AnimatedPressable`, `@/src/api/auth`, `@/src/lib/devMock`.
- `@/src/hooks/useConfig`: `useConfig: () => ({ config: mockConfig })`, where `let mockConfig` is reassigned per test (non-manager default; manager; `null`; `useQA: true`).
- `expo-web-browser`: `{ openBrowserAsync: (url: string, opts?: object) => mockOpenBrowserAsync(url, opts), WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' } }`. The enum **must** be present, otherwise the modal throws a TypeError on tap. `mockOpenBrowserAsync` defaults to resolving `{ type: 'dismiss' }`.
- `expo-constants`: `{ __esModule: true, get default() { return mockConstants; } }`, where `mockConstants` is a mutable `{ expoConfig, platform }` object reset in `beforeEach`.
- `expo-updates`: `{ __esModule: true, get updateId() { return mockUpdates.updateId; }, get isEmbeddedLaunch() { return mockUpdates.isEmbeddedLaunch; } }`. `__esModule` + getters keep the values live through Babel interop, so per-test mutation works. Plain-object mocks are snapshotted at import.
- `expo-application`: `{ __esModule: true, get nativeApplicationVersion() { return mockApplication.nativeApplicationVersion; } }`, where `mockApplication` is a mutable `{ nativeApplicationVersion: string | null }`. Reset it to `'1.1.0'` in `beforeEach`. Use the same getter pattern as `expo-updates`.
- `Linking.openURL` / `Alert.alert`: `jest.spyOn(Linking, 'openURL')` / `jest.spyOn(Alert, 'alert')` from `react-native` (react-native-web in this preset; its `openURL` rejects in node, so always stub it). Restore in `afterEach`.

Do **not** use `jest.resetModules` / `jest.isolateModules`: re-requiring React breaks hooks.

**Helpers:**
- `renderModal()`: `await act(async () => { renderer = create(React.createElement(require('../modal').default)); })`. This flushes the `loadCredentials` effect.
- `textsInOrder(root)`: maps `root.findAll(n => n.type === Text)` to joined strings.
- `pressable(testID)`: `renderer.root.findAll(n => n.props?.testID === testID && typeof n.props?.onPress === 'function')[0]`.

**Cases:**

| ID | Setup | Expected |
|----|-------|----------|
| FR3.1 | Non-manager config | Texts `About`, `Privacy Policy`, `Support` present; a node with `testID="about-version"` exists |
| FR3.2 | `mockConfig.isManager = true` | Same as FR3.1 |
| FR3.3 | `mockConfig = null` | Same as FR3.1, and no `Config Debug` text |
| FR3.4 | `process.env.EXPO_PUBLIC_DEV_USERNAME = 'someone@example.com'` (equals the `loadCredentials` mock; restored in `finally`) | Index order `Debug Log` < `About` < `Dev Options` < `Sign Out` |
| FR3.5 | Default | Last `onPress` node has a descendant Text `Sign Out` |
| FR3.6 | Default | `pressable('about-privacy').props.accessibilityRole === 'link'`; same for `about-support` |
| FR4.1 | Press `about-privacy` (awaited in `act`) | `mockOpenBrowserAsync` `toHaveBeenCalledTimes(1)` and `toHaveBeenCalledWith(PRIVACY_POLICY_URL, { presentationStyle: 'automatic' })`; `Linking.openURL` not called |
| FR4.2 | Press `about-support` | `toHaveBeenCalledWith(SUPPORT_URL, { presentationStyle: 'automatic' })` |
| FR4.3 | `mockOpenBrowserAsync` resolves `{ type: 'locked' }` | `Linking.openURL` and `Alert.alert` not called |
| FR4.4 | `mockOpenBrowserAsync` rejects `new Error('unavailable')` | `Linking.openURL` `toHaveBeenCalledTimes(1)`, `toHaveBeenCalledWith(PRIVACY_POLICY_URL)` |
| FR4.5 | Both reject; press `about-support` | `await expect(onPress()).resolves.toBeUndefined()`; `Alert.alert` `toHaveBeenCalledWith('Could not open link', SUPPORT_URL)` |
| FR4.6 | `mockConfig.useQA = true`; press `about-privacy` | Called with `PRIVACY_POLICY_URL` |
| FR5.1 | `nativeApplicationVersion '1.1.0'`, `expoConfig {version '1.1.0', ios {buildNumber '18'}}`, `platform {ios {buildNumber '18'}}`, `updateId '0f3c9a12-…'`, not embedded | Under `about-version`: `Version 1.1.0 (18)` and `Update: 0f3c9a12` |
| FR5.2 | `platform.ios.buildNumber '18'`, `expoConfig.ios.buildNumber '17'` | `Version 1.1.0 (18)` |
| FR5.3 | `platform: undefined`, `expoConfig.ios.buildNumber '17'` | `Version 1.1.0 (17)` |
| FR5.4 | `isEmbeddedLaunch: true` | `Update: embedded` |
| FR5.5 | `nativeApplicationVersion: null`, `expoConfig: null`, `platform.ios.buildNumber '18'` | `Version unknown (18)` |
| FR5.6 | OTA from a bumped tree: `nativeApplicationVersion '1.1.0'`, `platform.ios.buildNumber '18'`, `expoConfig {version '1.1.1', ios {buildNumber '19'}}`, `updateId '0f3c9a12-…'`, not embedded | `Version 1.1.0 (18)` and `Update: 0f3c9a12`. No Text under `about-version` contains `1.1.1` or `19` |
| FR5.7 | `nativeApplicationVersion: null`, `expoConfig.version '1.1.1'`, `platform.ios.buildNumber '18'` | `Version 1.1.1 (18)` (fallback source proven by the distinct value) |

#### Regression set (FR3, FR5, FR6) — run unmodified

`npx jest app/__tests__/modal src/lib/__tests__/legalLinks.test.ts src/lib/__tests__/colors.test.ts src/components/__tests__/TouchAndNavigation.test.tsx`

Baseline 2026-10-19: the 5 existing `app/__tests__/modal*` suites pass (35 tests). The `modal` path pattern also picks up `modal-about.test.tsx`.

#### Manual / command verification

- `npx expo config --type public --json` shows `version: "1.1.0"` and `ios.buildNumber` (`"17"` today, `"18"` after spec 05), and `plugins` includes `expo-web-browser`. At build time this config becomes the binary's `CFBundleShortVersionString` / `CFBundleVersion` (what the row shows) and the embedded `Constants.expoConfig`.
- `npm ls expo-application` shows a single `expo-application@55.0.10`, deduped under `expo-notifications`. `npx expo-modules-autolinking search --platform apple --json` still lists it, so the iOS module set is unchanged.
- `curl -sS -o /dev/null -L -w "%{http_code}\n" <URL>` for both URLs returns `200`. It returns `404` today, so this gate is satisfied by spec 01's deploy and must pass before spec 05 submits.
- Dev client on an iOS simulator/device (not Expo Go; see Edge Cases):
  - Settings → About is visible.
  - Privacy Policy and Support open in an in-app sheet, not external Safari.
  - The sheet's Done button returns to Settings.
  - A quick double-tap opens only one sheet.
  - The row shows the dev client binary's own version and build (`Version 1.1.0 (17)` for a dev client built from the current `app.json`) and `Update: embedded`. A JS reload from Metro doesn't change it.

### Edge Cases

| Case | Handling |
|------|----------|
| Pages not deployed yet (404 on 2026-10-19) | The sheet shows GitHub's 404 page. Release gate: the curl check returns 200 before spec 05 submission |
| Offline | SFSafariViewController shows its own error page. No app-side handling (accepted in research) |
| Double-tap on a row | iOS resolves `{ type: 'locked' }` for the second call (`WebBrowserModule.swift:25-28`). Treated as success: no fallback, no second sheet |
| `openBrowserAsync` rejects (native module unavailable → `UnavailabilityError`; non-http(s) URL → `WebBrowserInvalidURLException`) | `Linking.openURL(url)` |
| Both open paths fail | `Alert.alert('Could not open link', url)` shows the address. `openLegalLink` never rejects |
| QA environment | Same URLs. Independent of `useQA` |
| `config` null (loading or missing) | About still renders. Only Config Debug / env switcher / Dev Options are gated |
| Dev client (updates disabled) | `updateId` null → `Update: embedded`. The version and build come from the dev client binary, so they reflect `app.json` as of when that dev client was built |
| Expo Go | `updateId` null → `Update: embedded`. `platform.ios.buildNumber` is null → falls back to `expoConfig.ios.buildNumber`. `nativeApplicationVersion` is **Expo Go's own** version, so the version line is wrong in Expo Go. Accepted: this is dev-only, the app ships as a dev client / store binary (`expo-dev-client`, `expo-widgets`), and the manual check uses a dev client |
| Store build on embedded bundle | `updateId` is the embedded update's UUID but `isEmbeddedLaunch` is true → `Update: embedded`. The embedded `expoConfig` equals the binary's values anyway |
| OTA launch | `expoConfig` comes from the update manifest, i.e. the publishing tree's config. Spec 04 FR2 skips `ExpoConfigVersions`, so `version` and `ios.buildNumber` are **not** fingerprint inputs. An OTA published from a tree with a bumped version or build number (for example `main` after a `1.1.1` bump, or a buildNumber-only rebuild that shares the runtime) still installs on build 18. Both fields are read from the binary (FR5), so the row keeps reading `Version 1.1.0 (18)`, and only the `Update:` line changes (FR5.6). Spec 04 FR3's mismatch warning still flags publishing from a tree other than the build commit, but it no longer changes what the row shows |
| Which id testers compare | The row shows the first 8 chars of `Updates.updateId`: the **per-platform (iOS) update id** in `eas update` output / the EAS dashboard, **not** the update group id |
| Jest environment | `react-native` → `react-native-web`, `EXPO_OS`/`Platform.OS` = `'web'`. Unmocked `expo-application` → web module (`nativeApplicationVersion` null → falls back to `expoConfig.version` `'1.1.0'`). Unmocked `expo-updates` → web module (`updateId` null). Unmocked `expoConfig` has no `ios`. Existing suites render `Version 1.1.0` / `Update: embedded` without new mocks |
| Android | `nativeApplicationVersion` is the native `versionName`. `platform.ios` undefined → build number falls back to `expoConfig.ios.buildNumber`. Accepted (no Android listing) |

---

## Dependencies

### Internal
- **01-legal-pages**: publishes the two URLs. Blocks the release gate, not the merge.
- **04-ota-lane**: consumes the `Update:` line in runbook A. Its FR2 `ExpoConfigVersions` skip is why FR5 reads the version and build natively. Spec 04 text written before this decision is now stale for this spec's row and should be corrected in spec 04: FR3 step 5 ("the Settings version row will show the app.json values"), Out Of Scope 7 (native version APIs descoped), and the edge case "Settings row shows the publishing tree's `version (buildNumber)`". With this spec, the row always shows the binary's values.
- **05-release-build-18**: bumps `ios.buildNumber` to 18 and smoke-tests `Version 1.1.0 (18)` and both links on TestFlight.
- `app/modal.tsx` existing sections and the source-analysis tests listed above.

### External
- `expo-web-browser` 55.0.10, `expo-constants` 55.0.9, `expo-updates` 55.0.15: installed direct dependencies.
- `expo-application` 55.0.10: installed and autolinked today as a transitive dependency of `expo-notifications`. This spec declares it directly (`~55.0.10`). It adds no native module. `package.json` dependencies aren't a fingerprint source (only `packageJson:scripts` is hashed, and spec 04 skips that). Whether or not the runtime moves doesn't matter, because build 18 is a native build. Spec 06's `npx expo install --fix` may later move it within SDK 55, which is fine.
- GitHub Pages on `jaime-alvarez-trilogy/hourglass-app` (OPS O2).

### Assumptions
- Spec 01's page map stays `/hourglass-app/privacy-policy.html` and `/hourglass-app/support.html`.
- `app.json` keeps `expo-web-browser` in `plugins` and `updates.url` configured (both true today).
- Build 18 is a native build, so even though no native module is added, the About section reaches users only via build 18 or later. Shipping it to build-15 users by OTA (spec 04 runbook B) is out of scope.
