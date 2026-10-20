# Restore the OTA Lane

**Status:** Draft
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Right now `eas update` publishes to runtime `1.1.0`, and no installed binary has that runtime. Live users are on build 15, which is runtime `1.0.0`. This spec switches the app to the `fingerprint` runtime policy and limits the fingerprint to inputs that really change the native binary. It also adds a publish script that refuses any update that would reach nobody, plus a runbook. The lane counts as proven only after a baseline update published once build 18 is live is seen running on a store install.

Five pieces:

1. **Runtime policy** (`app.json`): `runtimeVersion: { "policy": "fingerprint" }`. `package.json` and the root version of `package-lock.json` go to `1.1.0` so all three agree.
2. **Fingerprint scope**: a `fingerprint.config.js` with `sourceSkips` and a `.fingerprintignore`. Together they keep version bumps, `package.json` script edits, `.gitignore` edits and `eas.json` edits out of the hash. This repo makes all four kinds of change for non-native reasons, and each one silently forks the runtime under the default settings (measured, see Verified Facts). Native inputs still move the hash: config plugins and their props, Info.plist, autolinked native modules, `patches/`, icons and splash.
3. **`scripts/ota-publish.sh`**: a guarded, iOS-only publisher. It requires a clean tree and a 40-hex fingerprint runtime. It requires a finished iOS build on channel `production` with **that exact runtime** (looked up with `eas build:list`). It publishes with `EXPO_NO_DOTENV=1`, so values from `.env.local` can't leak into the bundle. It prints the runtime, the group id and the iOS update id (the Settings row shows the update id).
4. **`docs/RELEASING.md`**: an OTA runbook with five sections. A is the baseline, B is the build-15 emergency path, C is the "is this OTA-safe?" check, D is rollback, and E is a table of what forks the runtime. Spec 05 later appends a `## Native release` section below it.
5. **Baseline OTA** (FR4, run as OPS O11 after build 18 is READY_FOR_SALE). It proves the lane end to end on a real App Store install.

Foreground update checks stay out of scope. Updates keep applying on the next cold start. Introspection confirms `EXUpdatesCheckOnLaunch: ALWAYS` and `EXUpdatesLaunchWaitMs: 0`.

---

## Out Of Scope

1. **Foreground update checks (`checkForUpdateAsync` / `fetchUpdateAsync` / `reloadAsync`).** **Descoped.** This is a FEATURE non-goal. Updates apply on the next cold start, as today.

2. **Android OTA.** **Descoped.** There is no Android store listing (FEATURE non-goal). The script publishes `--platform ios` only. Android has its own fingerprint and no production build to receive updates.

3. **Reaching build-15 (runtime `1.0.0`) users through the fingerprint lane.** **Descoped.** Build 18 starts a new runtime no matter what, because spec 03 changes native config. Emergencies for 1.0.0 users go through runbook §B (FR5). Old users move over by installing build 18.

4. **Leaving more ExpoConfig fields out of the fingerprint (`extra`, assets, names, etc.).** **Descoped.** No planned change needs it. `extra` (feature flags read through `Constants.expoConfig.extra`) stays hashed on purpose. A flag flip therefore needs a native build or a deliberate future spec.

5. **The native release itself (build 18, the TestFlight smoke, ASC submission) and the `## Native release` section of `docs/RELEASING.md`.** **Deferred to `05-release-build-18`.** This spec creates the file with only the OTA content. Spec 05 appends `## Native release` below it without touching this content (spec 05 FR6).

6. **Bumping `ios.buildNumber` to 18.** **Deferred to `05-release-build-18`.**

7. **Changing the spec 02 version row to native version APIs (`expo-application` `nativeApplicationVersion` / `nativeBuildVersion`).** **Descoped. Spec 02 owns the row; this spec only mitigates.** Inside an OTA, `Constants.expoConfig` comes from the update manifest. So the row shows the `version` and `buildNumber` of the tree that published, not those of the binary. FR3 warns when the two differ.

8. **Automating OTA publishing in CI (for example, publish on merge).** **Descoped.** Publishing stays manual and guarded until the lane is proven and used a few times.

9. **EAS Update code signing.** **Descoped.** Not needed for an unlisted app with a single publisher.

10. **Deleting the three stale rtv-`1.0.0` update groups.** **Descoped.** They're harmless: older than build 15's embedded bundle, so they're never loaded (`LoaderSelectionPolicyFilterAware.swift:57`).

11. **Rotating the ASC key in `eas.json`.** **Descoped (OPS O8).** FR2 makes sure that edit doesn't fork the runtime, so O8 and O11 can run in either order.

---

## Functional Requirements

### FR1: Fingerprint runtime policy and version sync

Switch the runtime policy and line up the three version fields.

**Requirements:**
- Set `app.json` `expo.runtimeVersion` to exactly `{ "policy": "fingerprint" }`.
- `expo.ios.runtimeVersion` and `expo.android.runtimeVersion` must stay absent. A platform-level value would shadow the top-level policy, because `resolveRuntimeVersionAsync` reads `config[platform]?.runtimeVersion ?? config.runtimeVersion`.
- Leave `expo.updates.url` unchanged (`https://u.expo.dev/4ad8a6bd-aec2-45a5-935f-5598d47b605d`).
- `package.json` `version`, `package-lock.json` top-level `version` and `package-lock.json` `packages[""].version` all equal `app.json` `expo.version` (`1.1.0`). Use `npm version 1.1.0 --no-git-tag-version`, which updates both files and runs no lifecycle scripts. Measured: changing the `package.json` version does **not** change the fingerprint.
- **Where the assertions live.** The FR1 assertions in `__tests__/config/app-config.test.ts` follow spec 03's test-file contract (spec 03 spec.md → Interface Contracts → Test-file contract). They use only the module-level `expo` and `pkg` bindings from the typed `@/app.json` / `@/package.json` imports, with no `fs`, no `path` and no `package-lock.json` import. The two lockfile root-version assertions therefore go in `__tests__/config/fingerprint-config.test.ts` (FR2), which already reads files from disk. They still need a test, because `npm ci` does **not** catch root-version drift. Measured 2026-10-19: `npm ci` with `package.json` `1.1.0` and a lockfile root of `1.0.0` exits 0 and leaves the lockfile unchanged.

**Success Criteria:**
- [ ] `__tests__/config/app-config.test.ts` has a top-level `describe('app.json — 04 OTA lane')` block (the name spec 03's contract reserves) with a nested `describe('FR1: …')`. It asserts that `expo.runtimeVersion` deep-equals `{ policy: 'fingerprint' }`, and it passes.
- [ ] The same block asserts `expect(expo.ios).not.toHaveProperty('runtimeVersion')` and `expect(expo.android).not.toHaveProperty('runtimeVersion')` (spec 03's absence rule).
- [ ] The same block asserts `pkg.version === expo.version`, using the `@/package.json` import.
- [ ] The same block asserts `expo.updates.url === 'https://u.expo.dev/' + expo.extra.eas.projectId`.
- [ ] `__tests__/config/fingerprint-config.test.ts` has a `describe('FR1: lockfile root version')` block. It reads `JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'))` and asserts only the two root fields: `lock.version` and `lock.packages[''].version` each equal `appJson.expo.version` (typed `@/app.json` import). `ROOT` is `path.resolve(__dirname, '../..')`. Nothing else in the lockfile is asserted.
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` prints JSON where `runtimeVersion` matches `/^[0-9a-f]{40}$/` and `workflow === "managed"`.
- [ ] `npx expo config --type introspect --json` shows `_internal.modResults.ios.expoPlist` with `EXUpdatesRuntimeVersion === "file:fingerprint"`, `EXUpdatesCheckOnLaunch === "ALWAYS"`, `EXUpdatesLaunchWaitMs === 0` and an unchanged `EXUpdatesURL`.

---

### FR2: Fingerprint scope (only native inputs move the runtime)

With the default settings, the iOS fingerprint changes when `version` or `ios.buildNumber` changes, when any `package.json` script changes, when `.gitignore` changes, and when anything in `eas.json` changes, including the ASC submit block. The features, docs, site and test folders are **not** fingerprint sources at all, so the `.fingerprintignore` patterns originally proposed in the research would do nothing (spec-research.md now records this under Corrections).

**Requirements:**
- Create `fingerprint.config.js` at the repo root (CommonJS, same style as `babel.config.js` and `metro.config.js`):
  ```js
  /** @type {import('expo/fingerprint').Config} */
  module.exports = {
    sourceSkips: ['ExpoConfigVersions', 'PackageJsonScriptsAll', 'GitIgnore'],
  };
  ```
  Include a short comment for each entry:
  - `ExpoConfigVersions`: `version`, `ios.buildNumber` and `android.versionCode`, so version bumps don't sever OTA (FEATURE Key Behavior 5).
  - `PackageJsonScriptsAll`: spec 07 adds `typecheck`, and spec 06 edits `postinstall`. Patch contents are still hashed through `patches/`.
  - `GitIgnore`: `.gitignore` was edited after launch for non-native reasons (`09359d8`).
- This config **replaces** `DEFAULT_SOURCE_SKIPS` (`PackageJsonAndroidAndIosScriptsIfNotContainRun`), and `PackageJsonScriptsAll` is a superset of it. Add nothing else. No `ExpoConfigAll`, `ExpoConfigAssets`, `ExpoConfigExtraSection`, `ignorePaths` or `fileHookTransform`.
- Create `.fingerprintignore` at the repo root. It holds comment lines (minimatch treats a leading `#` as a comment; verified) and exactly one pattern, `eas.json`. The comment says that eas.json holds build profiles and the ASC submit block, and neither changes the native module surface the JS binds to.
- Don't add the research's original patterns (`features/**`, `docs/**`, `site/**`, `__tests__/**`, `coverage/**`, `*.md`). They aren't fingerprint sources, so they would do nothing and only mislead.
- Both files are committed (not gitignored), so EAS gets them in the upload archive. EAS Build, `eas update` and the Xcode build phase all compute the runtime through the project's own `expo-updates` (`runtimeversion:resolve` → `@expo/fingerprint`), which loads both files from the project root.

**Success Criteria:**
- [ ] `__tests__/config/fingerprint-config.test.ts`: `require('../../fingerprint.config.js')` deep-equals `{ sourceSkips: [...] }` with exactly those three names (compared order-insensitively).
- [ ] The same test checks that every `sourceSkips` entry is a key of `SourceSkips` from `expo/fingerprint`, with `typeof SourceSkips[name] === 'number'`. This matters because `@expo/fingerprint` silently drops unknown names (`Config.js` `normalizeSourceSkips`), so a typo would quietly turn a skip off.
- [ ] The same test checks that the effective `.fingerprintignore` patterns (trimmed, non-empty, not starting with `#`) equal `['eas.json']`.
- [ ] Sensitivity matrix, run in a scratch worktree (checklist 1.1). Each of these leaves `npx expo-updates runtimeversion:resolve --platform ios` **unchanged**: `ios.buildNumber` → `"99"`; `version` → `"9.9.9"`; adding a `package.json` script; changing `eas.json` `submit.production.ios.ascApiKeyId`; appending a `.gitignore` line; adding files under `features/`, `docs/` and `site/`. Each of these **changes** it: dropping `fetch` from `ios.infoPlist.UIBackgroundModes`; changing the `expo-secure-store` plugin entry to `["expo-secure-store", { "faceIDPermission": false }]`; appending a line to a file in `patches/`.
- [ ] Determinism between local and EAS is proven after build 18 by the FR3 guard in FR4. The local runtime at the build-18 commit must equal `runtimeVersion` from `eas build:list` for that build.

---

### FR3: Guarded publish script (`scripts/ota-publish.sh`)

A single command that publishes only when the update has an audience.

**Requirements:**
- Usage: `scripts/ota-publish.sh [--dry-run] "<message>"`. Shebang `#!/usr/bin/env bash`, `set -euo pipefail`, committed with mode `100755`. It must run on macOS's stock bash 3.2: no associative arrays, `mapfile` or `${var,,}`. It uses `node` for JSON parsing and works from any cwd, because it `cd`s to `$(dirname "$0")/..`.
- The steps run in this order. Each refusal writes to stderr and exits `1` before the next step runs:
  1. **Arguments.** Accept an optional leading `--dry-run` followed by exactly one positional message. Refuse if the message is missing, empty or whitespace-only, if there is more than one positional argument (an unquoted message), or if there is any other `--flag`. Print `Usage: scripts/ota-publish.sh [--dry-run] "<message>"`.
  2. **Clean tree.** If `git status --porcelain` is non-empty (tracked changes **or** untracked files), refuse with `Refusing to publish: uncommitted changes` followed by the porcelain listing.
  3. **Runtime.** `RTV` = the `runtimeVersion` field from `npx expo-updates runtimeversion:resolve --platform ios`. If the command fails or the field is missing, refuse. If `RTV` doesn't match `^[0-9a-f]{40}$`, refuse with `Refusing to publish: runtime version "<RTV>" is not a fingerprint hash`. This catches a leftover literal runtime or a reverted policy.
  4. **Audience guard.** Run `eas build:list --platform ios --status finished --channel production --runtime-version "$RTV" --limit 1 --json --non-interactive`. If the command fails, refuse; the guard fails closed. If it returns `[]`, refuse with `Refusing to publish: no finished iOS build on channel "production" has runtime <RTV>`, plus two hints: run `npm ci`, and run `eas fingerprint:compare --build-id <id>` (find the id with `eas build:list --platform ios --channel production --limit 1`). The hints are static text; the script makes no extra eas call.
  5. **Version check (warning only).** If `app.json` `expo.version` / `expo.ios.buildNumber` differ from the matched build's `appVersion` / `appBuildVersion`, print `WARNING: app.json is <v> (<b>) but the target build is <bv> (<bb>)` to stderr, explain that the Settings version row will show the app.json values, and continue.
  6. **Dry run.** With `--dry-run`, print `Dry run OK` along with the runtime, the matched build (id, `appVersion (appBuildVersion)`) and the exact publish command, then exit `0` without publishing.
  7. **Publish.** Run `EXPO_NO_DOTENV=1 eas update --channel production --environment production --platform ios --message "<message>" --json --non-interactive`. The message is passed as one argv element. If eas exits non-zero, exit with **eas's exit code** and don't print the success block.
  8. **Report.** From the JSON array, take the element with `platform === "ios"`. If its `runtimeVersion` ≠ `RTV`, print `ERROR: eas published to runtime <x> but the guard checked <RTV>` with rollback instructions (runbook §D) and exit `1`. Otherwise print to stdout:
     ```
     OTA published
       commit:   <git rev-parse --short HEAD>
       runtime:  <RTV>
       group:    <group>
       update:   <ios update id>
       settings: Update: <first 8 chars of ios update id>
     ```
- Why `--channel production` instead of the research's `--branch production`: the channel is what binaries listen on. It's verified to map to the single branch `production`, and publishing through the channel stays correct if that mapping ever changes.
- Why `EXPO_NO_DOTENV=1`: Expo CLI loads `.env.local` during `eas update` bundling (`@expo/env` file list; `.env.local` is gitignored, so EAS builds never see it). The local `.env.local` defines `EXPO_PUBLIC_DEV_USERNAME`, which `app/modal.tsx:45` uses to gate dev options. Without this flag, that value would be inlined into a production OTA bundle. EAS-side variables still apply through `--environment production`.

**Success Criteria** (all in `__tests__/scripts/ota-publish.test.ts`, which runs the real script in a temporary git repo with `npx`/`eas` stubs first on `PATH`):
- [ ] No arguments, a whitespace-only message, two positional arguments, or an unknown flag (`--force`): exit 1, stderr contains `Usage:`, and the stub log has no `eas` or `npx` calls.
- [ ] A modified tracked file → exit 1, `uncommitted changes`, no `npx` or `eas` calls. Same for an untracked file only.
- [ ] Stubbed runtime `"1.1.0"` → exit 1, `is not a fingerprint hash`, no `eas` calls. The runtime resolver exiting non-zero → exit 1, no `eas` calls.
- [ ] `build:list` returns `[]` → exit 1, stderr contains `no finished iOS build on channel "production" has runtime <rtv>`, no `eas update` call. The logged `build:list` argv contains `--platform ios`, `--status finished`, `--channel production`, `--runtime-version <rtv>` and `--json`. `build:list` exiting non-zero → exit 1, no `eas update` call.
- [ ] Happy path → exit 0. `eas update` is called exactly once with argv `update --channel production --environment production --platform ios --message <msg> --json --non-interactive`, and the stub sees `EXPO_NO_DOTENV=1`. stdout contains the runtime, the group id, the iOS update id and `Update: <first 8 chars>`.
- [ ] A message with spaces and double quotes (`fix: "Approve" button`) reaches `eas` as one argv element, byte for byte.
- [ ] `--dry-run` → exit 0, stdout contains `Dry run OK` and `eas update --channel production`, and there is no `eas update` call.
- [ ] Build `appBuildVersion` `"17"` vs app.json `"18"` → exit 0, stderr contains `WARNING:`, and the update is still published.
- [ ] `eas update` exits 3 → the script exits 3 and stdout doesn't contain `OTA published`.
- [ ] `eas update` JSON reports a different `runtimeVersion` → exit 1, stderr contains `ERROR: eas published to runtime`.
- [ ] `scripts/ota-publish.sh` has an executable bit (`mode & 0o111`) and its first line is `#!/usr/bin/env bash`.

---

### FR4: Baseline OTA proves the lane (post-release, OPS O11)

FEATURE.md's Release Plan and OPS O11 refer to this as "spec 04 FR4". It can only run after build 18 is live, so it closes after the implementation PR. Phase 1.3 of the checklist tracks it.

**Requirements:**
- **Before release** (part of spec 05's TestFlight smoke): on build 18, the Settings version row's second line reads `Update: embedded` (spec 02).
- **After build 18 is READY_FOR_SALE**, follow runbook §A:
  1. Get build 18's `gitCommitHash` and `runtimeVersion` from `eas build:list --platform ios --status finished --channel production --app-build-version 18 --limit 1 --json --non-interactive`. Confirm the commit exists locally (`git cat-file -t <hash>`). Build 15's recorded commit, `1b45a8a`, does **not** exist in this repo, so this check matters. If spec 06's `build-<N>` tag convention is in use, `build-18` must resolve to the same commit.
  2. `git switch --detach <hash>`, then `npm ci`.
  3. `scripts/ota-publish.sh --dry-run "baseline: build 18 (v1.1.0)"` must pass. This proves that the local fingerprint and the EAS fingerprint agree (the FR2 determinism criterion).
  4. `scripts/ota-publish.sh "baseline: build 18 (v1.1.0)"`. Record its output.
  5. On a device with the App Store build installed: force-quit and relaunch, twice. With `EXUpdatesLaunchWaitMs: 0`, the first launch downloads the update and the second launch runs it. Open Settings.
- Record the build id, runtime, group id, iOS update id, device model, iOS version and date in the checklist Session Notes, then tick OPS O11.
- If the row still says `Update: embedded` after three cold starts, **stop**. Don't publish again. Check the channel, the runtime (`eas update:list --branch production --json`) and `eas update:insights <group>`, and record what you find.

**Success Criteria:**
- [ ] The dry run from the build-18 commit passes. The local runtime equals build 18's EAS `runtimeVersion`.
- [ ] The published iOS update's `runtimeVersion` equals build 18's `runtimeVersion` (the script checks this).
- [ ] On the App Store install, Settings shows `Update: <first 8 chars of the printed iOS update id>` after at most three cold starts.
- [ ] Session Notes hold the recorded ids, and OPS O11 is ticked.

---

### FR5: Release runbook (`docs/RELEASING.md`)

This spec creates the file. Spec 05 adds the native-release section.

**Requirements:**
- Structure, with these exact headings. **Don't** create a `## Native release` heading: spec 05 FR6 appends that section at the end of the file and checks that it appears exactly once.
  - `# Releasing Hourglass`: one paragraph naming the two lanes. JS-only changes go out by OTA (`scripts/ota-publish.sh`); native changes need a new build. Add one sentence saying the native-release procedure follows in `## Native release` (added by spec 05).
  - `## OTA updates`, containing:
    - `### A. Baseline after a native release`: the FR4 steps, written as a procedure for any future native release (not only build 18).
    - `### B. Emergency fix for users still on 1.0.0 (build 15)`:
      - Branch from `e7fb801` (the build-15 version-bump commit). EAS recorded `1b45a8a` for build 15, but that commit isn't in the repo. `e7fb801` has the same `.gitignore` hash, the same version/buildNumber, and `package.json`, `package-lock.json` and `patches/` unchanged since then, so it carries build 15's native inputs.
      - Cherry-pick the JS-only fix.
      - Confirm `npx expo-updates runtimeversion:resolve --platform ios` prints `"runtimeVersion":"1.0.0"`. The appVersion policy at that commit produces it, so no literal edit is needed.
      - Publish with `EXPO_NO_DOTENV=1 eas update --channel production --environment production --platform ios --message "<msg>"`. The script doesn't exist on that branch.
      - Never merge the branch, and never publish main with a literal `1.0.0`. After spec 03, main's native dependencies differ from build 15's.
    - `### C. Is this change OTA-safe?`: run `scripts/ota-publish.sh --dry-run "check"`. If it passes, use OTA. If it refuses at the audience guard, the change is native: ship a build. Use `eas fingerprint:compare --build-id <id> --environment production` to see which source changed.
    - `### D. Rolling back a bad update`: `eas update:roll-back-to-embedded --channel production --runtime-version <rtv> --platform ios --message "<why>"`, or `eas update:republish --group <last-good-group> --destination-channel production`. Then cold-start twice to verify.
    - `### E. What changes the runtime`: a table. **Forks:** native dependency add/remove/upgrade, `patches/`, config plugins and their props, `ios.infoPlist`/entitlements/privacy manifest, icons and splash, `extra`, `fingerprint.config.js`, `.fingerprintignore`. **Doesn't fork:** `version`/`buildNumber`, `package.json` scripts, `.gitignore`, `eas.json`, any JS/TS/asset under `app/`, `src/`, `components/`, `hooks/`, plus docs and tests. **Caveat:** not hashed, but still needs a native build: changing `postinstall`, adding `eas-build-*` hooks, or changing `eas.json` build-profile `env`/`prebuildCommand`/image.
  - A note that `fingerprint.config.js` / `.fingerprintignore` changes take effect only with the next native build. Never change them between a build and an OTA aimed at it.
  - A note that version bumps go through `npm version <x> --no-git-tag-version` plus the `app.json` edit, so FR1's version-equality tests (in `app-config.test.ts` and `fingerprint-config.test.ts`) stay green.
- Every command in the file is copy-pasteable and correct for eas-cli 20.1.0. The file never mentions `npx expo-fingerprint`, which returns npm 404.

**Success Criteria:**
- [ ] `grep -c '^## OTA updates$' docs/RELEASING.md` prints `1`, `grep -c '^## Native release' docs/RELEASING.md` prints `0` (spec 05 adds it), and `grep -c '^### [A-E]\. ' docs/RELEASING.md` prints `5`.
- [ ] `grep -n 'expo-fingerprint' docs/RELEASING.md` prints nothing.
- [ ] `grep -n 'scripts/ota-publish.sh\|EXPO_NO_DOTENV=1\|runtimeversion:resolve --platform ios\|e7fb801\|roll-back-to-embedded' docs/RELEASING.md` finds each term at least once.
- [ ] A reviewer runs §C's dry-run command on the PR branch. Before build 18 exists, it refuses at the audience guard, which is expected and shows the guard works. The output is pasted into Session Notes.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `app.json` (`updates.url` at lines 107-108, `runtimeVersion` at lines 110-112, `extra.eas.projectId` at line 122) | Policy change; URL/projectId consistency |
| `package.json:4`, `package-lock.json:3,9` | `version` fields (`1.0.0` → `1.1.0`) |
| `eas.json` | Channels `production`/`preview`/`development` exist; `cli.version >= 18.0.0`; submit block (O8 edits it later) |
| `node_modules/@expo/fingerprint/build/Options.js` | `.fingerprintignore` loading (one minimatch glob per line, `dot: true`), `DEFAULT_IGNORE_PATHS`, `DEFAULT_SOURCE_SKIPS` |
| `node_modules/@expo/fingerprint/build/Config.js` | `fingerprint.config.js` keys; `normalizeSourceSkips` silently drops unknown names |
| `node_modules/@expo/fingerprint/build/sourcer/{Sourcer,Expo,Bare}.js` | What gets hashed: `.gitignore`, `eas.json`/`.easignore`, the expoConfig contents, plugin modules, autolinked dirs, `patches/`, `packageJson:scripts` |
| `node_modules/expo-updates/utils/build/{resolveRuntimeVersionAsync,createFingerprintAsync}.js` | Per-platform fingerprint (`platforms: [platform]`), with `ios/**` and `android/**` ignored for managed projects |
| `node_modules/expo-updates/ios/EXUpdates/SelectionPolicy/LoaderSelectionPolicyFilterAware.swift:57` | commitTime ordering (why the old updates never load) |
| `node_modules/@expo/env/build/index.js:63-103` | dotenv file list and the `EXPO_NO_DOTENV` switch |
| `app/modal.tsx:45`, `.env.local` (key names only) | `EXPO_PUBLIC_DEV_USERNAME` leak path |
| `features/app/store-compliance/specs/02-in-app-legal-links/spec-research.md` | Version row contract (`Update: <8 chars>` / `Update: embedded`), used in FR4 |
| `features/app/store-compliance/specs/03-native-config-cleanup/spec.md` → Interface Contracts → Test-file contract | Creates `__tests__/config/app-config.test.ts`; typed JSON imports only (no `fs`, no `package-lock.json` import), reserved `describe('app.json — 04 OTA lane')` name, `not.toHaveProperty` for absence |
| `features/app/store-compliance/specs/05-release-build-18/spec-research.md` | Extends `docs/RELEASING.md`; build 18 steps |
| `jest.config.js` | `testMatch: **/__tests__/**/*.test.ts(x)`, preset `jest-expo/node` |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `app.json` | modify | `runtimeVersion: { policy: "fingerprint" }` (FR1) |
| `package.json` | modify | `version` `1.1.0` (FR1) |
| `package-lock.json` | modify | Root `version` and `packages[""].version` `1.1.0`, through `npm version` (FR1) |
| `fingerprint.config.js` | create | `sourceSkips` (FR2) |
| `.fingerprintignore` | create | `eas.json` (FR2) |
| `scripts/ota-publish.sh` | create (mode 755) | Guarded publish (FR3) |
| `docs/RELEASING.md` | create | OTA runbook (FR5). Spec 05 appends `## Native release` |
| `__tests__/config/app-config.test.ts` | modify (create if spec 03 hasn't landed) | FR1 assertions in a `describe('app.json — 04 OTA lane')` block, typed JSON imports only (spec 03 test-file contract) |
| `__tests__/config/fingerprint-config.test.ts` | create | FR2 assertions, plus FR1's two lockfile root-version assertions (reads `package-lock.json` with `fs`) |
| `__tests__/scripts/ota-publish.test.ts` | create | FR3 assertions |

No app source (`app/`, `src/`) changes. Nothing is added to `package.json` scripts. Script edits wouldn't fork the runtime anymore, but leaving them alone avoids merge conflicts with spec 07.

### Interface Contracts

**Config shapes**

```jsonc
// app.json (excerpt)
"runtimeVersion": { "policy": "fingerprint" },          // no ios/android override
"updates": { "url": "https://u.expo.dev/4ad8a6bd-aec2-45a5-935f-5598d47b605d" }
```

```js
// fingerprint.config.js (exact object; comments allowed)
module.exports = { sourceSkips: ['ExpoConfigVersions', 'PackageJsonScriptsAll', 'GitIgnore'] };
```

```
# .fingerprintignore: effective patterns must equal ["eas.json"]
eas.json
```

**Generated native config (introspection, not committed):** `Expo.plist` → `EXUpdatesEnabled: true`, `EXUpdatesCheckOnLaunch: "ALWAYS"`, `EXUpdatesLaunchWaitMs: 0`, `EXUpdatesURL: <unchanged>`, `EXUpdatesRuntimeVersion: "file:fingerprint"`. The fingerprint file is written into the bundle at build time.

**`scripts/ota-publish.sh` CLI**

| Aspect | Contract |
|--------|----------|
| Invocation | `scripts/ota-publish.sh [--dry-run] "<message>"` |
| Exit codes | `0` published or dry-run OK · `1` usage/refusal/guard failure/runtime mismatch after publish · `N` = eas update's own non-zero code |
| External calls (in order) | `git status --porcelain` → `npx expo-updates runtimeversion:resolve --platform ios` → `eas build:list --platform ios --status finished --channel production --runtime-version <RTV> --limit 1 --json --non-interactive` → `EXPO_NO_DOTENV=1 eas update --channel production --environment production --platform ios --message <msg> --json --non-interactive` |
| stderr substrings (tested) | `Usage: scripts/ota-publish.sh [--dry-run] "<message>"` · `Refusing to publish: uncommitted changes` · `is not a fingerprint hash` · `no finished iOS build on channel "production" has runtime <RTV>` · `WARNING: app.json is` · `ERROR: eas published to runtime` |
| stdout (tested) | `Dry run OK` block, or `OTA published` block with `runtime:`, `group:`, `update:`, `settings: Update: <8 chars>` |

**Upstream JSON shapes (verified against eas-cli 20.1.0 source and live output)**

| Command | Shape used |
|---------|------------|
| `npx expo-updates runtimeversion:resolve --platform ios` | `{ "runtimeVersion": string, "fingerprintSources": [...] \| null, "workflow": "managed" \| "generic" }` |
| `eas build:list ... --json` | `Array<{ id, status, platform, channel, buildProfile, appVersion, appBuildVersion, runtimeVersion, gitCommitHash, fingerprint: { hash } }>` (raw `BuildFragment`) |
| `eas update ... --json` | `Array<{ id, createdAt, group, branch, message, runtimeVersion, platform, manifestPermalink, isRollBackToEmbedded, gitCommitHash }>` (`getUpdateJsonInfosForUpdates`) |

**Settings row link (spec 02):** `Updates.updateId` is the **per-platform update `id`**, not the group id. The row shows its first 8 characters, so the script prints both values.

### Data Flow

```
developer (clean tree at commit X)
   │ scripts/ota-publish.sh "msg"
   ├─► git status --porcelain ............................ must be empty
   ├─► npx expo-updates runtimeversion:resolve -p ios
   │      └─ @expo/fingerprint(projectRoot, platforms:[ios], ignore ios/** android/**)
   │           + fingerprint.config.js (skip versions/scripts/.gitignore)
   │           + .fingerprintignore (eas.json)
   │           = RTV (sha1, 40 hex)
   ├─► eas build:list --channel production --runtime-version RTV ... must be non-empty
   └─► EXPO_NO_DOTENV=1 eas update --channel production --platform ios
          └─ EAS: channel "production" → branch "production" → update group (runtime RTV)

store binary (build 18, Expo.plist runtime = file:fingerprint = same RTV, computed on EAS with the same config)
   cold start #1: launches embedded, checks the update URL (CheckOnLaunch ALWAYS, wait 0), downloads the update
   cold start #2: launches the update (commitTime newer than embedded) → Settings "Update: <id[0:8]>"
```

### Edge Cases

| Case | Handling |
|------|----------|
| TestFlight builds use channel `production` | The baseline also reaches testers. It's the same code, so that's fine. |
| `patches/` edits | Still hashed (measured), so they correctly fork the runtime and force a native build. |
| `.env.local` values (`EXPO_PUBLIC_DEV_USERNAME`) | Kept out of OTA bundles by `EXPO_NO_DOTENV=1`. If a committed `.env`/`.env.production` is ever added, EAS builds would load it but OTAs wouldn't. Move such values to EAS `production` env vars instead (runbook note). |
| Local `node_modules` differ from the lockfile | The local runtime won't match any build, so the guard refuses and suggests `npm ci`. |
| Settings row shows the publishing tree's `version (buildNumber)` | `Constants.expoConfig` comes from the update manifest (the live 2026-04-11 update carries `buildNumber: "4"`). The script warns on mismatch. Runbook §A publishes from the build commit. |
| OPS O8 edits `eas.json` (ASC key) after build 18 | Not hashed (`.fingerprintignore`), so it doesn't fork. O8 and O11 can run in either order. |
| Spec 07 adds the `typecheck` script; spec 06 edits `postinstall` | Scripts aren't hashed. Spec 06 is native anyway (dependency bumps change autolinked dirs), and runbook §E says `postinstall` changes need a build. |
| Two binaries with the same native inputs (for example, a rebuild with only a buildNumber bump) | Same runtime, so one update reaches both. Intended. |
| EAS API down or not logged in | `build:list` fails, so the script fails closed (exit 1). |
| A literal runtime left in app.json after some emergency | The 40-hex check refuses. Runbook §B never edits main anyway. |
| eas reports a different runtime than the guard checked | Exit 1 with rollback instructions (§D). This shouldn't happen, since both use `runtimeversion:resolve`. |
| Build 15 users | Stay on embedded or old updates until they install 18. Emergencies use §B from `e7fb801`. |
| Spec 03 hasn't landed, so `__tests__/config/app-config.test.ts` doesn't exist | Create it with spec 03's contract header (the `ExpoConfig` type import, `@/app.json` and `@/package.json` imports, the `expo` cast) and only the spec 04 `describe` block. Spec 03 adds its block when it merges. |
| Typecheck of the new tests (`fingerprint-config.test.ts` and `ota-publish.test.ts` import `child_process`, `fs`, `os`, `path`) | Same as existing tests (`__tests__/use-ai-data.test.ts` imports `fs`). These must pass `npm run typecheck` once spec 07 adds `@types/node`. The spec 04 block in `app-config.test.ts` adds no Node built-ins, so that file keeps spec 03's zero-TS-error property. |
| Lockfile root version drifts from `package.json` (hand edit, or a bump without `npm version`) | `npm ci` doesn't catch it (measured), so `fingerprint-config.test.ts` asserts both root fields. Only those two fields are read; the rest of the 640 KB lockfile is never asserted. |
| `fingerprint.config.js` / `.fingerprintignore` changed after build 18 | Forks every later publish. FR2's exact-equality tests make any change a deliberate, reviewed edit, and the runbook warns about it. |

### Test Plan (mapped to FRs)

| FR | Test file / method | What it proves |
|----|--------------------|----------------|
| FR1 | `__tests__/config/app-config.test.ts` (`describe('app.json — 04 OTA lane')`) | Policy object, no platform overrides, `package.json` ↔ `expo.version`, updates URL ↔ projectId |
| FR1 | `__tests__/config/fingerprint-config.test.ts` (`describe('FR1: lockfile root version')`) | Both lockfile root `version` fields equal `expo.version` |
| FR1 | Commands: `npx expo-updates runtimeversion:resolve --platform ios`; `npx expo config --type introspect --json` | 40-hex runtime, managed workflow; Expo.plist values |
| FR2 | `__tests__/config/fingerprint-config.test.ts` | Exact sourceSkips, every name valid in `SourceSkips`, `.fingerprintignore` == `['eas.json']` |
| FR2 | Command: sensitivity matrix in a scratch worktree (checklist 1.1) | Non-native edits don't fork; native edits do |
| FR3 | `__tests__/scripts/ota-publish.test.ts` | Every refusal path, argv/env passed to eas, dry run, warning, exit-code propagation, post-publish runtime check, executable bit |
| FR3 | Command: `bash -n scripts/ota-publish.sh`; `shellcheck scripts/ota-publish.sh` if installed | Syntax / lint |
| FR3 | Command: `EXPO_NO_DOTENV=1 npx expo export --platform ios --output-dir <tmp>` then grep for the `.env.local` dev-username value → 0 hits; control without the flag → ≥1 hit | The leak is real and the flag closes it |
| FR4 | Manual, post-release (checklist Phase 1.3) | End-to-end lane on an App Store install |
| FR5 | `grep` commands (checklist 1.1) plus the §C dry run on the PR branch | Headings, correct commands, no `expo-fingerprint` |

**Test harness for FR3** (no mocks of app code; the real script runs):
- `beforeEach`: create `repo` and `stubs` as **sibling** temp dirs under `os.tmpdir()`. The stubs must not be inside `repo`, or they'd make the tree dirty. Copy `scripts/ota-publish.sh` to `repo/scripts/`. Write `repo/app.json` as `{ "expo": { "version": "1.1.0", "ios": { "buildNumber": "18" } } }`. Run `git init -q`, `git add -A` and `git -c user.name=test -c user.email=test@example.com -c commit.gpgsign=false commit -qm init`.
- Stubs `stubs/npx` and `stubs/eas` (bash, chmod 755) append `CALL <name>`, one `ARG <value>` line per argument, and `ENV EXPO_NO_DOTENV=<value>` to `$STUB_LOG`. Their output comes from `STUB_RTV_JSON`, `STUB_RTV_EXIT`, `STUB_BUILDS_JSON`, `STUB_BUILDS_EXIT`, `STUB_UPDATE_JSON` and `STUB_UPDATE_EXIT`.
- Run `spawnSync('bash', [repo/scripts/ota-publish.sh, ...args], { cwd: os.tmpdir(), env: { ...process.env, PATH: stubs + ':' + process.env.PATH, STUB_LOG, ... }, encoding: 'utf8' })`. Running from `os.tmpdir()` proves the script doesn't depend on cwd.
- Realistic fixtures: RTV `'7e91e3c1a9513c5e1890adb5f42eaaf0c5480e31'`. Build: `{ id: 'b18-uuid', platform: 'IOS', status: 'FINISHED', channel: 'production', appVersion: '1.1.0', appBuildVersion: '18', runtimeVersion: <RTV>, gitCommitHash: '…' }`. Update: `[{ id: '019e0000-aaaa-7bbb-8ccc-000000000001', group: '2ea0f853-efcf-45c5-8108-dc2d377f52ef', platform: 'ios', runtimeVersion: <RTV>, branch: 'production', message: '…' }]`.
- A probe confirmed that this pattern (`expo/fingerprint` import, `app.json` JSON import, spawning `bash` and `git` in a temp dir) runs under `jest-expo/node` in under 1 s.

---

## Dependencies

### Internal
- **03-native-config-cleanup** (blocks this spec): creates `__tests__/config/app-config.test.ts` and changes native config. Build 18 gets a new runtime regardless. Spec 04's block in that file follows spec 03's test-file contract; anything needing `fs` goes in `fingerprint-config.test.ts`.
- **02-in-app-legal-links**: the version row (`Update: <8 chars>` / `Update: embedded`) that FR4 uses for verification.
- **05-release-build-18**: produces build 18 and appends `## Native release` to `docs/RELEASING.md`, leaving this spec's OTA section untouched. Its post-release step points at runbook §A.
- **07-ci-typecheck-lint**: adds `@types/node` (needed for the new tests to typecheck) and the `typecheck` script. Thanks to FR2, that script doesn't fork the runtime. Spec 07's "Release & Merge Order" step 2 assumes `packageJson:scripts` and `.gitignore` are hashed; that constraint goes away once this spec lands. Following it anyway is harmless.

### External
- `expo-updates` 55.0.15 and `@expo/fingerprint` 0.16.6 (through `expo/fingerprint`); both installed.
- eas-cli: global 20.1.0 satisfies `eas.json` `cli.version >= 18.0.0`. `--environment` is required for SDK 55 projects (eas-cli help text). An EAS login is needed for `build:list` and `update`.
- bash ≥ 3.2, node 20 (CI), git.

### Assumptions
- Build 18 is made with `eas build -p ios --profile production` (channel `production`) from a committed, pushed tree that includes this spec.
- Channel `production` keeps mapping to branch `production`. The script publishes through the channel, so a remap stays safe.
- `cli.appVersionSource` stays unset (eas-cli default "local"). Even if it switched to "remote", skipping `ExpoConfigVersions` keeps the local and EAS runtimes identical.

---

## Verified Facts (2026-10-19)

Gathered while writing this spec. Where they disagreed with the research, spec-research.md was amended to match: Decision 2, its `.fingerprintignore` contract and runbook §B/§C. Its Corrections section records the original proposals.

- **Fingerprint sources (iOS, current HEAD, `npx expo-updates fingerprint:generate --platform ios`):** `.gitignore`; `eas.json`; `assets/images/icon.png` and `splash-icon.png`; 129 config-plugin module files; 38 expo-autolinked iOS dirs; 10 RN-core autolinked package dirs; `patches/`; `contents:expoConfig` (includes `version: 1.1.0` and `ios.buildNumber: 17`); `contents:package:react-native`; `contents:packageJson:scripts` (`start`, `test`, `test:watch`, `web`, `lint`, `postinstall`). No path under `features/`, `docs/`, `site/`, `__tests__/` or `coverage/`, and no root `*.md`.
- **Local and EAS agree today.** The local iOS fingerprint at HEAD (`8e028056b5d3…`) equals the fingerprint EAS recorded for build 17 (`a3453f46…`, commit `fc24cd5`).
- **Sensitivity (scratch copy, policy `fingerprint`), default settings vs. this spec's config:** buildNumber, version, a new script, an `eas.json` submit edit, a `.gitignore` line and an `extra` flag change each forked the runtime under defaults. Under the spec config, all except `extra` stay the same. Edits to Info.plist, plugin props and `patches/` fork it under both. A `package.json` `version` change never forks.
- **Builds 15 and 17 did not share a fingerprint** (`0221c51d…` vs `8e028056…`). The diff: `.gitignore`, `version`, `ios.buildNumber`, plus a bare `ios` source in build 15.
- **Default `@expo/fingerprint` CLI (both platforms) = `79a493de…` ≠ iOS runtime `8e028056…`.** Compare iOS runtimes only.
- **`npx expo-fingerprint`** → `npm error 404 Not Found`. The local bin is `fingerprint` (`@expo/fingerprint`). Use `npx expo-updates runtimeversion:resolve|fingerprint:generate --platform ios` or `eas fingerprint:generate|compare`.
- **EAS state:** channel `production` → branch `production` (single mapping). The branch has 3 update groups, all rtv `1.0.0`, android+ios, newest 2026-04-11. Build 15 is `dba3d70e…`, rtv `1.0.0`, completed 2026-06-11, recorded commit `1b45a8a` (not in the repo). The build-15 bump commit `e7fb801` has the same `.gitignore` hash as build 15's fingerprint, and `package.json`, `package-lock.json` and `patches/` haven't changed since.
- **No runtime `expo-updates` usage** in `app/`, `src/`, `components/`, `hooks/` or `constants/`. No git tags exist.
