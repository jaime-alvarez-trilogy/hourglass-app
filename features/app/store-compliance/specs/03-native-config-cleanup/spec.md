# 03 — Native Config Cleanup + Privacy Manifest

**Status:** Draft
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This spec fixes four native-config defects that ship inside the iOS binary, so they have to ride **build 18 (v1.1.0)**. None of them can go out by OTA. All the edits are to `app.json` and `package.json`. No app source code changes.

1. **Schema-invalid keys.** Delete `expo.newArchEnabled` (`app.json:10`) and `expo.android.edgeToEdgeEnabled` (`app.json:36`). Neither key is in the SDK 55 config schema, and nothing in the SDK 55 toolchain reads either one: `@expo/prebuild-config` only prints a deprecation warning for `edgeToEdgeEnabled`, and `newArchEnabled` has no reader at all. Deleting them changes no behavior, and `expo-doctor`'s schema check goes green.
2. **Unused `fetch` background mode (Guideline 2.5.4).** Set `ios.infoPlist.UIBackgroundModes` to `["remote-notification"]`, and `npm uninstall expo-background-fetch expo-task-manager`. Deleting the app.json entry alone isn't enough. Both packages are in `@expo/prebuild-config`'s `legacyExpoPlugins` auto-apply list (`withDefaultPlugins.js:218`), and each one's plugin pushes `fetch` back in (`withBackgroundFetch.js:12`, `withTaskManager.js:11`). Neither package is imported anywhere in the repo.
3. **Unused Face ID usage string.** Change the bare `"expo-secure-store"` plugin entry to `["expo-secure-store", { "faceIDPermission": false }]`. `applyPermissions` in `@expo/config-plugins` deletes the Info.plist key when the value is exactly `false` (`build/ios/Permissions.js:30`).
4. **App-level privacy manifest.** Add `ios.privacyManifests` (contents under Interface Contracts). CNG then generates `ios/Hourglassxo/PrivacyInfo.xcprivacy`, which declares `1C8F.1` (App Group UserDefaults) for the first time.

Two Jest suites guard the result:
- A static suite asserts what `app.json` and `package.json` contain. Specs 04 and 05 extend this file.
- An introspection suite runs `expo config --type introspect` and checks the plugin-resolved config. This is the only automated check that actually proves `fetch` is gone, because it runs after all config plugins have executed.

Doc drift in `TECH_STACK.md` and `CLAUDE.md` is fixed in the same change.

Everything above was verified on 2026-10-19 against the installed tree. A scratch-copy dry run of the target config produced:
- introspect: `UIBackgroundModes: ["remote-notification"]`, no `NSFaceIDUsageDescription`, neither package in `_internal.pluginHistory`;
- `expo-doctor`: schema check passes (19/20; only the package-version check, which belongs to spec 06, still fails);
- `expo prebuild -p ios`: `PrivacyInfo.xcprivacy` passes `plutil -lint`, contains `1C8F.1`, and is referenced in `project.pbxproj`.

---

## Out Of Scope

1. **Removing `@expo/ngrok`**: **Deferred to 06-dependency-hygiene.** It's a misfiled dev dependency with no config-plugin effect on Info.plist.

2. **SDK 55 patch-version refresh** (`expo-doctor`'s "Check that packages match versions required by installed Expo SDK" stays red; 24 mismatches remain after this spec): **Deferred to 06-dependency-hygiene.**

3. **Changing `runtimeVersion` to the `fingerprint` policy**: **Deferred to 04-ota-lane.** This spec does change native inputs (two native modules removed), so it has to merge before spec 04 records its baseline fingerprint.

4. **Bumping `ios.buildNumber` to 18, and the TestFlight silent-push smoke test**: **Deferred to 05-release-build-18.** Its smoke checklist already includes "Silent push … confirms that dropping `fetch` (spec 03) broke nothing."

5. **A privacy manifest for the widget extension target (`ExpoWidgetsTarget`)**: **Descoped from this spec. Its post-upload check is an open hand-off that no spec or OPS item carries yet.**
   - **Why it can't be done here.** `ios.privacyManifests` only writes the main app target's manifest. React Native's pod-install aggregation (`node_modules/react-native/scripts/cocoapods/privacy_manifest_utils.rb`, `get_application_targets`) only touches `:application` targets, so the extension never gets one either. The extension links the `ExpoWidgets` pod, whose `WidgetsStorage.swift:3` calls `UserDefaults(suiteName:)`. That pod ships no `PrivacyInfo.xcprivacy`: the `ExpoWidgets` resource bundle in its podspec is empty.
   - **Risk.** Build 17 reached `VALID` with the same extension and no extension manifest, so uploads aren't blocked today. Nobody has checked whether Apple's processing email for build 17 carried an `ITMS-91053` warning. A build reaching `VALID` doesn't prove there was no warning.
   - **Where the check lives.** As of 2026-10-19, no file in spec 05 (`spec.md`, `checklist.md`, `spec-research.md`) and nothing in `OPS.md` mentions `ITMS-91053` or the extension. This spec can't run the check, because it needs the build 18 upload, and it doesn't edit those files. So the orchestrator has to place the item below. **Recommended home:** spec 05 `checklist.md` Phase 3.1 "Build and upload", right after the `18 … VALID` line. OPS.md "Before build 18 is submitted" would also work. Until the item is placed, this spec's checklist (Final Verification → hand-offs) tracks it.
   - **Item text to place:**
     > **(J) ITMS-91053 check.** In the App Store Connect processing email for build 18, search for `ITMS-91053`. Check build 17's email too, as a baseline. Record either "none" or the binaries and API categories it lists.
     > - **It names only `ExpoWidgetsTarget`, and build 18 is `VALID`:** don't block submission. Open a follow-up for the next native build: give the `ExpoWidgets` pod its own `PrivacyInfo.xcprivacy` (`CA92.1`, `1C8F.1`) through the existing `patches/expo-widgets+55.0.5.patch`.
     > - **It names the main app binary:** spec 03's FR4 manifest is missing a reason. Add that reason to `ios.privacyManifests` and the FR4 contract test, then rebuild with the next unused build number before submitting.
     > - **Build 18 never reaches `VALID`:** this is a release blocker. Stop and escalate.

6. **Other plugin-injected Info.plist keys** (`NSLocalNetworkUsageDescription` and `NSBonjourServices` from `expo-dev-launcher`; `NSSupportsLiveActivities` from `expo-widgets`): **Descoped.** The audit didn't flag them, and they were already in build 15, which passed review.

7. **Android manifest differences**: **Descoped.** Android isn't a store target (FEATURE.md Non-Goals). Removing `expo-background-fetch` drops the `android.permission.WAKE_LOCK` it contributed (visible in introspected `android.permissions`). `RECEIVE_BOOT_COMPLETED` stays because `app.json` declares it explicitly.

8. **TypeScript errors from Node built-ins in the introspection test** (`child_process`, `path`, `__dirname`): **Deferred to 07-ci-typecheck-lint** (FR3 adds `@types/node` and `"types": ["jest", "node"]`). Existing tests that import `fs`/`path` are in the same bucket today. The static suite uses only JSON imports and adds zero TS errors.

9. **The App Store Connect App Privacy label (Device ID)**: **Descoped from code**, because it's a non-code step tracked as OPS.md **O5**. The manifest in FR4 must match it.

10. **Any background-execution feature** (BGTaskScheduler, `Notifications.registerTaskAsync` headless tasks): **Descoped** (FEATURE.md Non-Goals: no new features).

---

## Functional Requirements

### FR1: Remove schema-invalid config keys

Delete the two keys that the SDK 55 config schema rejects (`additionalProperties: false` at the top level and in `Android`).

**Requirements:**
- Delete `"newArchEnabled": true` (`app.json:10`).
- Delete `"edgeToEdgeEnabled": true` (`app.json:36`).
- Leave `android.predictiveBackGestureEnabled: false` and every other sibling key unchanged. `predictiveBackGestureEnabled` is valid in the SDK 55 schema.

**Success Criteria:**
- [ ] `app.json` `expo` has no `newArchEnabled` property, and `expo.android` has no `edgeToEdgeEnabled` property.
- [ ] `expo.android.predictiveBackGestureEnabled === false` (guards against over-deletion).
- [ ] `npx expo-doctor` output has no `✖ Check Expo config (app.json/ app.config.js) schema` line. Doctor reports only the **first** schema error it finds: today it shows only `android.edgeToEdgeEnabled`, and `newArchEnabled` appears only once that one is gone. So run it after both deletions.
- [ ] The resolved config (introspect) has no top-level `newArchEnabled` and no `android.edgeToEdgeEnabled`.

---

### FR2: Remove the unused `fetch` background mode

Silent push needs only `remote-notification`. The path is `NotificationsAppDelegateSubscriber.didReceiveRemoteNotification` → `NotificationCenterManager` → the JS listener registered at `src/notifications/handler.ts:117`. None of it uses background fetch or TaskManager.

> **Correction (build-18 re-review, 2026-10-20).** The last hop doesn't exist. `NotificationCenterManager.didReceive(userInfo)` asks its delegates, and `EmitterModule` (behind `addNotificationReceivedListener`) doesn't implement that method, so iOS gets `.noData`. The JS listener fires only from `willPresent`, which a content-available push with no alert never reaches. JS sees a background push only through a `Notifications.registerTaskAsync` task, and that needs `expo-task-manager` (removed here, because its plugin adds `fetch` back). So the relay push refreshed nothing before this spec and still refreshes nothing after it. Policy §5, the support FAQ and spec 05 smoke step 6 now say so. Real background refresh would need a task registered without the `fetch` mode, and that's a separate spec.

**Requirements:**
- `app.json` `expo.ios.infoPlist.UIBackgroundModes` becomes exactly `["remote-notification"]`.
- Run `npm uninstall expo-background-fetch expo-task-manager`, which updates both `package.json` (removes lines 32 and 50) and `package-lock.json`.
- The lockfile diff only **removes** things: the root dependency lines for the two packages, plus the `node_modules/expo-background-fetch`, `node_modules/expo-task-manager` and `node_modules/unimodules-app-loader` entries. A dry run (`npm uninstall --dry-run`) predicted exactly these 3 removals. Changing any other package version is out of scope (spec 06).
- No other code changes. A repo-wide search (excluding `node_modules`, `dist`, `build`, `coverage`) found no imports of either package and no `TaskManager.defineTask` or `Notifications.registerTaskAsync` calls.

**Success Criteria:**
- [ ] `expo.ios.infoPlist.UIBackgroundModes` deep-equals `["remote-notification"]` in `app.json`.
- [ ] Neither `package.json` `dependencies` nor `devDependencies` has `expo-background-fetch` or `expo-task-manager`.
- [ ] `package-lock.json` has no `packages["node_modules/expo-background-fetch"]`, `packages["node_modules/expo-task-manager"]` or `packages["node_modules/unimodules-app-loader"]`, and `git diff package-lock.json` has no added (`+`) content lines.
- [ ] Resolved config: `ios.infoPlist.UIBackgroundModes` deep-equals `["remote-notification"]`, and `_internal.pluginHistory` has neither `expo-background-fetch` nor `expo-task-manager`.
- [ ] Generated `ios/Hourglassxo/Info.plist` (scratch prebuild): `UIBackgroundModes` is `["remote-notification"]`.

---

### FR3: Remove the Face ID usage description

The app never calls SecureStore with `requireAuthentication` (`src/store/config.ts:12,16,20` pass no options), and `expo-local-authentication` isn't installed.

**Requirements:**
- Swap the string entry `"expo-secure-store"` (`app.json:94`) for the tuple `["expo-secure-store", { "faceIDPermission": false }]` **in the same position** in `plugins`.
- Don't pass `configureAndroidBackup`. The default (`true`) keeps today's Android backup rules.
- `plugins` must contain **exactly one** `expo-secure-store` entry. The plugin is a run-once plugin (`createRunOncePlugin`, `withSecureStore.js:37`), so if the old string entry survived ahead of the tuple, the string would run first, the tuple would be skipped, and the Face ID string would come back.

**Success Criteria:**
- [ ] The only `expo-secure-store` entry in `expo.plugins` deep-equals `["expo-secure-store", { "faceIDPermission": false }]`.
- [ ] `expo.ios.infoPlist` in `app.json` has no `NSFaceIDUsageDescription`.
- [ ] Resolved config: `ios.infoPlist.NSFaceIDUsageDescription` is `undefined`, and `_internal.pluginHistory` still contains `expo-secure-store` (the plugin ran; it just didn't add the key).
- [ ] Generated `Info.plist` (scratch prebuild): `plutil -extract NSFaceIDUsageDescription raw` reports "No value at that key path".

---

### FR4: Declare the app-level privacy manifest

Add `expo.ios.privacyManifests` with the exact contents in **Interface Contracts → Privacy manifest**. On 2026-10-19 every required-reason code was checked against a manifest already in `node_modules`:
- `CA92.1`: expo-constants, expo-notifications, expo-system-ui, react-native.
- `C617.1`: react-native, async-storage, expo-application, Folly/boost/glog.
- `0A2A.1`, `3B52.1`, `E174.1`, `85F4.1`: expo-file-system.
- `35F9.1`: boost.

`1C8F.1` is the only new code. It covers App Group UserDefaults: `src/widgets/bridge.ts:868-896` → `expo-widgets` `createWidget().updateTimeline()` → `WidgetsStorage.swift:3` `UserDefaults(suiteName:)`. Device ID is declared to match spec 01's policy text (the anonymous push token) and OPS O5.

**Requirements:**
- Insert `privacyManifests` inside `expo.ios`, between `entitlements` and `buildNumber`. The `buildNumber` line stays untouched, which keeps spec 05's bump conflict-free.
- Contents exactly as specified. Don't add `NSPrivacyAccessedAPICategoryActiveKeyboards` or any other category.

**Success Criteria:**
- [ ] `expo.ios.privacyManifests` deep-equals the Interface Contracts object, array order included.
- [ ] The UserDefaults entry's reasons are exactly `["CA92.1", "1C8F.1"]`, and the SystemBootTime entry's are `["35F9.1"]`.
- [ ] `NSPrivacyTracking === false`, `NSPrivacyTrackingDomains` is `[]`, and there's no `NSPrivacyAccessedAPICategoryActiveKeyboards` entry.
- [ ] Resolved config: `ios.privacyManifests` deep-equals the `app.json` value (plugins don't touch it).
- [ ] Scratch prebuild: `ios/Hourglassxo/PrivacyInfo.xcprivacy` exists, `plutil -lint` prints `OK`, it contains `1C8F.1`, and `ios/Hourglassxo.xcodeproj/project.pbxproj` references `PrivacyInfo.xcprivacy`.

---

### FR5: Automated resolved-config regression guard

Add a Jest suite that runs the Expo CLI's introspection, so CI checks the post-plugin config, not just `app.json`. This catches any future dependency whose auto-applied plugin re-injects `fetch` or Face ID. The static `package.json` assertion in FR2 can't catch that, because it only names two packages.

This goes beyond spec-research, which left introspection manual. It was added because a prototype under the real Jest config (`jest-expo/node` preset) ran the introspection subprocess in about 220 ms and returned `_internal.pluginHistory`.

**Requirements:**
- Create `__tests__/config/app-config-introspect.test.ts`. In `beforeAll` (timeout 60 000 ms), call `execFileSync(process.execPath, [<ROOT>/node_modules/expo/bin/cli, 'config', '--type', 'introspect', '--json'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, EXPO_NO_TELEMETRY: '1' }, maxBuffer: 32 MiB })`, where `ROOT = path.resolve(__dirname, '../..')`. Then `JSON.parse` stdout.
- Include **non-vacuity guards** that pass both before and after the change, proving plugins actually ran:
  - `ios.infoPlist.ExpoWidgetsAppGroupIdentifier === 'group.com.jalvarez0907.hourglass.widgets'` (set by the expo-widgets `withAppInfoPlist` mod);
  - `_internal.pluginHistory` has `expo-secure-store` and `expo-notifications`.
- If the subprocess fails (missing CLI, invalid config), the suite fails. Never skip it.

**Success Criteria:**
- [ ] Before FR1–FR4 are implemented, the suite fails on the `UIBackgroundModes`, `NSFaceIDUsageDescription`, `pluginHistory` (bf/tm), `privacyManifests` and removed-key assertions, while the non-vacuity guards pass.
- [ ] After implementation, every assertion passes with `npx jest __tests__/config`.
- [ ] The suite finishes in under 10 s locally.

---

### FR6: Fix documentation drift

**Requirements:**
- `TECH_STACK.md:10`: replace `New Architecture enabled (\`newArchEnabled: true\`)` with `New Architecture (mandatory on SDK 55 / RN 0.83; there is no app.json toggle)`.
- `TECH_STACK.md:11`: says React Compiler is `Enabled (\`experiments.reactCompiler: true\`)`, but `app.json:115` has `false`. Correct it to `Disabled (\`experiments.reactCompiler: false\`)`. (Newly found drift in a line adjacent to the line being edited.)
- `TECH_STACK.md:144-145`: delete the `expo-background-fetch` and `expo-task-manager` rows. Under the "Notifications & Background" table, add one sentence: background execution is silent-push only (`UIBackgroundModes: ["remote-notification"]`), and adding `expo-background-fetch` or `expo-task-manager` re-injects the `fetch` mode through their auto-applied config plugins (guarded by `__tests__/config/`).
- `CLAUDE.md:69` (the hourglassws app's CLAUDE.md): replace `Expo SDK 54, React Native 0.81.5` with `Expo SDK 55, React Native 0.83`. Leave out the patch version, because spec 06 changes it.

**Success Criteria:**
- [ ] `grep -n 'newArchEnabled: true' TECH_STACK.md` prints nothing.
- [ ] `grep -nE '^\| \*\*expo-(background-fetch|task-manager)\*\*' TECH_STACK.md` prints nothing.
- [ ] `grep -n 'reactCompiler: true' TECH_STACK.md` prints nothing.
- [ ] `grep -nE 'SDK 54|0\.81\.5' CLAUDE.md` prints nothing, and `grep -n 'Expo SDK 55, React Native 0.83' CLAUDE.md` matches line 69.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `app.json` | Lines 10, 15-18, 21-26, 36, 94: every edit site |
| `package.json` | Lines 32, 50: the two dependencies to uninstall |
| `jest.config.js` | `testMatch: ['**/__tests__/**/*.test.ts', …]`, `testPathIgnorePatterns: ['/node_modules/', '/server/']`, `moduleNameMapper '^@/(.*)$' → '<rootDir>/$1'`. `npx jest --showConfig` confirms `roots: [<rootDir>]`, and `__tests__/config/*.test.ts` matches |
| `app/(tabs)/__tests__/native-tabs.test.tsx:29-45` | Existing pattern for static app.json assertions (it uses `fs`; this spec uses typed JSON imports instead) |
| `node_modules/@expo/prebuild-config/build/plugins/withDefaultPlugins.js:218` | `legacyExpoPlugins` auto-apply list (includes both packages) |
| `node_modules/@expo/prebuild-config/build/getAutolinkedPackages.js:37-54` | `shouldSkipAutoPlugin`: auto-plugins apply only to autolinked packages |
| `node_modules/expo-background-fetch/plugin/build/withBackgroundFetch.js:12`, `node_modules/expo-task-manager/plugin/build/withTaskManager.js:11` | `UIBackgroundModes.push('fetch')` |
| `node_modules/@expo/config-plugins/build/ios/Permissions.js:30` | `permissions[permission] === false` → `delete infoPlist[permission]` |
| `node_modules/expo-secure-store/plugin/build/withSecureStore.js:8-37` | Plugin signature, `faceIDPermission`, run-once wrapper |
| `node_modules/@expo/config-plugins/build/ios/PrivacyInfo.js:60,93` | Writes `<ios>/<projectName>/PrivacyInfo.xcprivacy`, merges reasons |
| `node_modules/expo-notifications/ios/ExpoNotifications/Notifications/NotificationsAppDelegateSubscriber.swift:21-27` | Silent-push entry point (doesn't depend on TaskManager) |
| `src/notifications/handler.ts:116-118` | `addNotificationReceivedListener` registration (no `registerTaskAsync`) |
| `src/widgets/bridge.ts:868-896`, `node_modules/expo-widgets/ios/WidgetsStorage.swift:3` | App Group UserDefaults (justifies `1C8F.1`) |
| `.gitignore:60` | `/ios` is ignored, so a local prebuild can't be committed by accident |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `app.json` | modify | FR1–FR4 |
| `package.json` | modify (via `npm uninstall`) | FR2: drop 2 dependencies |
| `package-lock.json` | modify (via `npm uninstall`) | FR2: drop 3 package entries |
| `__tests__/config/app-config.test.ts` | create | Static regression suite for FR1–FR4. Specs 04 and 05 append `describe` blocks |
| `__tests__/config/app-config-introspect.test.ts` | create | FR5: resolved-config suite |
| `TECH_STACK.md` | modify | FR6 |
| `CLAUDE.md` | modify | FR6 (line 69) |

No source files under `app/`, `src/`, `components/`, `hooks/` or `server/` change.

### Interface Contracts

#### Target `app.json` fragments

```jsonc
// expo.ios (newArchEnabled removed from expo; nothing else at top level changes)
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.jalvarez0907.hourglass",
  "infoPlist": {
    "UIBackgroundModes": [
      "remote-notification"
    ],
    "ITSAppUsesNonExemptEncryption": false
  },
  "entitlements": { /* unchanged */ },
  "privacyManifests": { /* see below */ },
  "buildNumber": "17"            // untouched; spec 05 bumps it
},
// expo.android: "edgeToEdgeEnabled" line removed; everything else unchanged
// expo.plugins[4] (same index as today):
[
  "expo-secure-store",
  {
    "faceIDPermission": false
  }
],
```

#### Privacy manifest (`expo.ios.privacyManifests`, exact)

```json
{
  "NSPrivacyTracking": false,
  "NSPrivacyTrackingDomains": [],
  "NSPrivacyCollectedDataTypes": [
    {
      "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeDeviceID",
      "NSPrivacyCollectedDataTypeLinked": false,
      "NSPrivacyCollectedDataTypeTracking": false,
      "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
    }
  ],
  "NSPrivacyAccessedAPITypes": [
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPITypeReasons": ["CA92.1", "1C8F.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp", "NSPrivacyAccessedAPITypeReasons": ["C617.1", "0A2A.1", "3B52.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace", "NSPrivacyAccessedAPITypeReasons": ["E174.1", "85F4.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime", "NSPrivacyAccessedAPITypeReasons": ["35F9.1"] }
  ]
}
```

#### Config contract (static `app.json` / `package.json`, and resolved config via `npx expo config --type introspect --json`)

| Path | Static | Resolved | Today (baseline) |
|------|--------|----------|------------------|
| `newArchEnabled` | absent | absent | `true` |
| `android.edgeToEdgeEnabled` | absent | absent | `true` |
| `android.predictiveBackGestureEnabled` | `false` | `false` | `false` |
| `ios.infoPlist.UIBackgroundModes` | `["remote-notification"]` | `["remote-notification"]` | `["remote-notification","fetch"]` |
| `ios.infoPlist.NSFaceIDUsageDescription` | absent | absent | `"Allow $(PRODUCT_NAME) to access your Face ID biometric data."` (resolved) |
| `ios.infoPlist.ITSAppUsesNonExemptEncryption` | `false` | `false` | `false` |
| `ios.privacyManifests` | exact object above | deep-equals static | absent |
| `plugins` `expo-secure-store` entry | single tuple `[name, {faceIDPermission:false}]` | n/a | bare string |
| `_internal.pluginHistory` | n/a | no `expo-background-fetch` or `expo-task-manager`; has `expo-secure-store` and `expo-notifications` | has both |
| `ios.infoPlist.ExpoWidgetsAppGroupIdentifier` | n/a | `group.com.jalvarez0907.hourglass.widgets` | same |
| `package.json` deps + devDeps | no `expo-background-fetch` or `expo-task-manager` | n/a | both present |

#### Canonical introspection one-liner (spec 05's pre-flight reuses it)

```bash
npx expo config --type introspect --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s),h=c._internal.pluginHistory,p=c.ios.infoPlist;console.log(JSON.stringify({bg:p.UIBackgroundModes,faceId:p.NSFaceIDUsageDescription??null,newArch:"newArchEnabled" in c,edge:"edgeToEdgeEnabled" in (c.android||{}),bf:"expo-background-fetch" in h,tm:"expo-task-manager" in h,ud:(c.ios.privacyManifests?.NSPrivacyAccessedAPITypes||[]).find(t=>t.NSPrivacyAccessedAPIType==="NSPrivacyAccessedAPICategoryUserDefaults")?.NSPrivacyAccessedAPITypeReasons??null}))})'
```

Expected after this spec:
`{"bg":["remote-notification"],"faceId":null,"newArch":false,"edge":false,"bf":false,"tm":false,"ud":["CA92.1","1C8F.1"]}`

Baseline today:
`{"bg":["remote-notification","fetch"],"faceId":"Allow $(PRODUCT_NAME) to access your Face ID biometric data.","newArch":true,"edge":true,"bf":true,"tm":true,"ud":null}`

#### Test-file contract (for specs 04 and 05)

`__tests__/config/app-config.test.ts` loads config through **typed JSON imports**, not `fs`. JSON imports type-check today (`resolveJsonModule` from `expo/tsconfig.base`, plus the `@/*` path alias), and the `@/` mapper resolves them in Jest. Both were verified with a prototype.

```ts
import type { ExpoConfig } from 'expo/config';   // type-only; erased by babel
import appJson from '@/app.json';
import pkg from '@/package.json';

const expo = appJson.expo as unknown as ExpoConfig;
// module-level helper, reusable by later describe blocks:
const pluginEntries = (name: string) =>
  (expo.plugins ?? []).filter((p) => (Array.isArray(p) ? p[0] : p) === name);

describe('app.json — 03 native config cleanup', () => {
  describe('FR1: schema-invalid keys removed', () => { /* … */ });
  // FR2 / FR3 / FR4 blocks: names start with "FRn:" so `jest -t FRn` targets them
});
// Spec 04 appends: describe('app.json — 04 OTA lane', …)
// Spec 05 appends: describe('app.json — 05 release build 18', …)
```

Rules:
- Assert absence with `expect(obj).not.toHaveProperty('key')`. The string key path stays type-safe after the key is deleted.
- List dependencies with `Object.keys(pkg.dependencies)` / `Object.keys(pkg.devDependencies)`. Property access on a removed key won't type-check.
- Don't import `package-lock.json` in tests (it's large, and `npm ci` in CI already enforces lock/manifest sync). FR2's lockfile criteria are checked by command.

### Data Flow

```
app.json + package.json
   │  @expo/config getConfig
   ▼
static ExpoConfig ──► withDefaultPlugins
   │                    ├─ explicit plugins (expo-secure-store {faceIDPermission:false} → delete NSFaceIDUsageDescription)
   │                    ├─ legacyExpoPlugins (expo-background-fetch / expo-task-manager now NOT autolinked → skipped → no 'fetch')
   │                    └─ withPrivacyInfo (ios.privacyManifests → ios/Hourglassxo/PrivacyInfo.xcprivacy + pbxproj resource)
   ▼
resolved config (introspect)  ──►  EAS prebuild (CNG)  ──►  Info.plist, PrivacyInfo.xcprivacy  ──►  build 18 binary
      ▲                                                                                            │
      └── __tests__/config/app-config-introspect.test.ts                     Xcode privacy report aggregates app + pod manifests
```

### Edge Cases

| Case | Handling |
|------|----------|
| Silent push without `fetch` | iOS delivers content-available pushes through `remote-notification` only: `didReceiveRemoteNotification` → `NotificationCenterManager` → `handler.ts:117`. `expo-task-manager` is used only by `Notifications.registerTaskAsync`, which the app never calls. Verified on device by spec 05's TestFlight smoke (widget timestamp updates after a ping). |
| Both a string and a tuple `expo-secure-store` entry | Run-once plugin: the first entry wins and Face ID comes back. The static test asserts exactly one entry, and the introspection test asserts the key is absent. |
| A future dependency's plugin injects `fetch` | `app-config-introspect.test.ts` fails on `UIBackgroundModes`. Re-adding either removed package also fails the static dependency assertion. If background tasks are ever really needed, revisit spec-research Decision 1 option (b): a trailing `withInfoPlist` filter plugin. |
| The two packages are still in a developer's local `node_modules` | Doesn't matter. Autolinking resolves from `package.json`, so `shouldSkipAutoPlugin` skips them (verified in the scratch run, where the packages were still on disk). EAS always does a clean install. |
| `expo-doctor` shows one schema error at a time | Re-run it after both FR1 deletions. Pass condition: no `✖ Check Expo config` line. The package-version check stays red until spec 06, and doctor exits 1 because of it, so don't chain it with `&&`. |
| `npm uninstall` rewrites unrelated lockfile entries | FR2 criterion: no `+` lines in the lockfile diff. If any appear, `git checkout package.json package-lock.json` and redo the uninstall from a clean `npm ci` tree. Don't accept version changes (spec 06's territory). |
| A local prebuild gets committed | `/ios` is in `.gitignore:60`. After the prebuild check, `git status --porcelain` must be empty, then `rm -rf ios`. Prebuild reports "Updated package.json \| no changes". |
| `expo prebuild --clean` on a dirty tree | Run with `CI=1`. `@expo/cli` (`utils/git.js:83-104`) continues without prompting when non-interactive. |
| Reasons duplicated between the app manifest and pod manifests | Harmless. Xcode aggregates per bundle, and `mergePrivacyInfo` dedups within the app file. |
| Manifest vs. policy vs. nutrition label | Device ID is declared, not linked, not tracking, purpose App Functionality. This matches spec 01's push-token sentence and OPS O5. If O5 is entered differently in App Store Connect, fix O5, not the manifest. **Build-18 re-review:** Crash Data was added on the same terms. Policy §5 discloses expo-updates' `Expo-Fatal-Error` header, which sends the previous launch's fatal error to EAS Update, so the manifest and O5 now declare `NSPrivacyCollectedDataTypeCrashData` too. |
| Widget extension has no manifest | Out of Scope #5. This is an open hand-off: the `ITMS-91053` processing-email check isn't in spec 05 or OPS.md yet. The item text and decision rule are in Out of Scope #5, and the checklist's Final Verification gates on the item being placed. |
| Native fingerprint changes | Expected. Build 18 is a native build, and spec 04 must baseline its fingerprint after this spec merges. |
| `expo/bin/cli` path missing in a future SDK | The introspection suite fails loudly with ENOENT, which surfaces the change and doesn't skip silently. |

---

## Test Plan

| Test file (matches `jest.config.js` `testMatch`) | FR | Cases |
|---|---|---|
| `__tests__/config/app-config.test.ts` | FR1 | `expo` has no `newArchEnabled`; `expo.android` has no `edgeToEdgeEnabled`; `expo.android.predictiveBackGestureEnabled === false` (guard) |
| | FR2 | `UIBackgroundModes` deep-equals `['remote-notification']`; neither package in `Object.keys(pkg.dependencies)` or `Object.keys(pkg.devDependencies)` |
| | FR3 | `pluginEntries('expo-secure-store')` has length 1 and its only element deep-equals `['expo-secure-store', { faceIDPermission: false }]`; `expo.ios.infoPlist` has no `NSFaceIDUsageDescription`; `ITSAppUsesNonExemptEncryption === false` (guard) |
| | FR4 | `expo.ios.privacyManifests` deep-equals the contract object; UserDefaults reasons `['CA92.1','1C8F.1']`; SystemBootTime `['35F9.1']`; `NSPrivacyTracking === false`; no ActiveKeyboards category |
| `__tests__/config/app-config-introspect.test.ts` | FR5 (covers FR1–FR4 post-plugin) | Non-vacuity guards (`ExpoWidgetsAppGroupIdentifier`, `pluginHistory` has `expo-secure-store` and `expo-notifications`); `UIBackgroundModes` deep-equals `['remote-notification']`; `NSFaceIDUsageDescription` undefined; `pluginHistory` lacks `expo-background-fetch` and `expo-task-manager`; no top-level `newArchEnabled` or `android.edgeToEdgeEnabled`; `ios.privacyManifests` deep-equals `appJson.expo.ios.privacyManifests` and its UserDefaults reasons include `1C8F.1` |
| Command checks (checklist) | FR1 | `npx expo-doctor`: no `✖ Check Expo config` line |
| | FR2 | Lockfile node check plus `git diff package-lock.json` with no `+` lines; repo-wide grep finds no imports |
| | FR2–FR4 | Introspection one-liner matches the expected JSON; `CI=1 npx expo prebuild -p ios --clean --no-install` then `plutil` checks, `git status --porcelain` empty, `rm -rf ios` |
| | FR6 | The four grep checks under FR6 |
| Regression (unchanged suites) | all | `npx jest src/__tests__/notifications src/__tests__/widgets native-tabs` (6 suites: handler, bridge, widgetVisualIos, android/HourglassWidget, android/widgetTaskHandler, and native-tabs, which also reads `app.json`): green before and after. Jest treats path args as regexes, so don't pass `app/(tabs)/…` literally |

**Mocks needed:** none. Both suites read real config. The introspection suite runs the real Expo CLI as a child process.

**Red phase expectation:** Before FR1–FR4, every FR assertion in both suites fails, and the guard assertions (`predictiveBackGestureEnabled`, `ITSAppUsesNonExemptEncryption`, `ExpoWidgetsAppGroupIdentifier`, `pluginHistory` has `expo-secure-store`/`expo-notifications`) pass.

---

## Dependencies

### Internal
- **Blocks 04-ota-lane:** the fingerprint baseline must include the removal of the two native modules. Spec 04 also edits `app.json` `runtimeVersion` and appends to `__tests__/config/app-config.test.ts`.
- **Blocks 05-release-build-18:** pre-flight reuses the introspection one-liner, the TestFlight smoke covers silent push (smoke check 6), and spec 05 bumps `buildNumber` and appends to the test file. The `ITMS-91053` check from Out of Scope #5 belongs in spec 05's upload step too, but it isn't there yet (open hand-off).
- **Blocks 06-dependency-hygiene:** its version refresh shouldn't re-add the removed packages. Once this spec lands, doctor no longer lists them.
- Interacts with **07-ci-typecheck-lint**: the introspection test's Node built-in imports type-check once 07 FR3 lands.

### External
- `expo-doctor` via `npx` (network: npm registry plus `api.expo.dev` schema endpoint). Verified with expo-doctor 1.21.5.
- macOS `plutil` for the prebuild checks.
- Installed versions (2026-10-19): `expo` 55.0.7, `@expo/cli` 55.0.17, `@expo/config-plugins` 55.0.10, `@expo/prebuild-config` 55.0.10, `@expo/config-types` 55.0.5, `expo-secure-store` 55.0.9, `expo-notifications` 55.0.13, `expo-widgets` 55.0.5, `jest-expo` 55.0.11, `react-native` 0.83.2.

### Assumptions
- No code path needs background fetch or headless notification tasks. The repo-wide search found only a code comment in `src/hooks/useAIData.ts`.
- OPS O5 declares Device ID / App Functionality / Not Linked / Not Tracking, matching FR4.
- Build 18 comes from a clean EAS install (`npm ci`), so stale local `node_modules` can't leak plugins.
