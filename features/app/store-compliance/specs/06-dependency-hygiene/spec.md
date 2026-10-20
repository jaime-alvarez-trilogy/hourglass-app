# 06 — Dependency Hygiene

**Status:** Draft
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This spec makes the dependency tree safe to upgrade, then refreshes the app to the newest Expo SDK 55 patch line, so spec 08 (SDK 57) starts from a clean base. It works in three steps:

1. **Guards first (static, no native change on their own).**
   - Pin every patched package to the exact version in its patch filename. Today that means `expo-widgets` goes from `^55.0.5` to `55.0.5`.
   - Make `postinstall` fail the install when a patch fails or applies to a different version (`--error-on-fail --error-on-warn`).
   - Remove the unused `@expo/ngrok` from `dependencies`.
   - Add `expo.install.exclude: ["expo-widgets"]` to `package.json`.
   - Add a Jest guard, `__tests__/config/deps.test.ts`, that reads `package.json`, `package-lock.json` and `patches/`. It uses patch-package's own filename parser and fails on any orphaned or loosely pinned patch.
2. **Refresh under the guards.** Run `npx expo install --fix` until `npx expo install --check` exits 0. As of 2026-10-19, with spec 03 merged, this moves **24 packages** within SDK 55 (`expo` 55.0.7 → ~55.0.31, `react-native` 0.83.2 → 0.83.10, `react-native-worklets` 0.7.2 → 0.7.4, and others; see FR5). Neither patched package moves, and both patch files stay byte-identical.
3. **Ship as the next native build after 18.** This is a native change, so the fingerprint runtime changes (spec 04). Bump `ios.buildNumber` to the next unused number. If 1.1.0 has already been approved, also bump the marketing version to `1.1.1`. Release it through `docs/RELEASING.md` §Native as written: Claude does the asc.js prep, build, upload and attach; J runs the TestFlight smoke and makes the submit decision. After release, tag the build commit and publish a baseline OTA for the new runtime.

**Branch and timing:** work on its own branch (`chore/06-dependency-hygiene`), cut from `main` after build 18's work (spec 05) has merged. Merge it to `main` only after the FR7 preconditions hold (build-18 tag pushed, build-18 baseline OTA published). Once this merges, `main`'s fingerprint no longer matches build 18.

**Gate:** spec 07 is part of build 18, so `npm test`, `npm run typecheck` and `npm run lint` must all pass. If spec 07 has unexpectedly not merged, fall back to research Decision 3: gate on `npm test` against the recorded baseline only, and do not chain `tsc`.

---

## Out Of Scope

1. **Upgrading `expo-widgets` past 55.0.5 or re-basing its 130 KB patch.** **Deferred to 08-expo-sdk-57-scenes.** Research Decision 1. expo-widgets jumps majors there anyway (SDK 56+ lists it at `~56.0.27` / `~57.0.26`). Spec 08 also removes the `install.exclude` entry once the patch is re-based.
2. **Moving `react-native-reanimated` off 4.2.1 or deleting its patch.** **Deferred to 08-expo-sdk-57-scenes** (the patch is obsolete at reanimated 4.5.x). It doesn't need to move here: SDK 55 expects exactly `4.2.1`, both in the bundled list and in the remote list as of 2026-10-19.
3. **Any Expo SDK major upgrade (56/57).** **Deferred to 08-expo-sdk-57-scenes.** The deps test asserts the project stays on `expo` 55.x / `react-native` 0.83.x.
4. **Adding `typecheck`/`lint` scripts or CI gates.** **Deferred to 07-ci-typecheck-lint.** This spec only *runs* those gates if they exist.
5. **Running `npx expo install --check` or `expo-doctor` in CI.** **Descoped.** Both depend on Expo's live remote version list (`api.expo.dev`). CI would go red whenever Expo publishes a new 55.0.x patch, with no code change. The static deps test covers the regression that matters (orphaned or loosely pinned patches) and runs offline in `npm test`.
6. **Non-SDK dependency upgrades** (TanStack Query, victory-native, nativewind, react-native-android-widget, font packages, etc.). **Descoped.** `expo install --check` doesn't flag them, they don't affect compliance, and upgrading them adds churn risk to a native build.
7. **`server/` dependencies.** **Descoped.** Separate package with its own lockfile, not part of the iOS binary.
8. **Pinning transitive native deps (`@expo/ui`, `expo-modules-core`) via `overrides`.** **Descoped**, unless the FR7 EAS build fails to compile. If it does, escalate per Edge Case 7; don't add overrides ad hoc.
9. **Writing new release runbooks or fixing `.appstore/asc.js`.** **Deferred to 05-release-build-18** (it creates `docs/RELEASING.md` §Native) and **04-ota-lane** (runbook A, baseline OTA). FR7 reuses them unchanged. Its one extra step, the `build-<N>` git tag, is this spec's convention and lives here, not in §Native.
10. **Foreground OTA checks.** **Descoped** (FEATURE non-goal).

---

## Functional Requirements

### FR1: Pin every patched package to its patch version

Any package with a file in `patches/` must be declared at the exact version that patch was made for, so no lockfile refresh can silently orphan the patch.

**Requirements:**
- `package.json` `dependencies["expo-widgets"]` is `"55.0.5"`, with no `^` or `~`. Use `npm install expo-widgets@55.0.5 --save-exact`, which also rewrites the lockfile root entry.
- The general rule, enforced by the test for every patch file that patch-package recognises:
  - For non-nested patches: the package is a direct dependency (`dependencies` or `devDependencies`), and its declared spec is an exact `x.y.z` equal to the patch filename's version.
  - For all patches: `package-lock.json` `packages[<details.path>].version` equals the patch version.
  - For non-nested patches: the lockfile root spec (`packages[""].dependencies` or `.devDependencies`) equals the `package.json` spec.
- `react-native-reanimated` is already `"4.2.1"`, which matches its patch, so it needs no change.
- `patches/*` are not modified.

**Success Criteria:**
- [ ] `node -p "require('./package.json').dependencies['expo-widgets']"` prints `55.0.5`.
- [ ] `node -p "require('./package-lock.json').packages[''].dependencies['expo-widgets']"` prints `55.0.5`.
- [ ] `collectPatchProblems(realPkg, realLock, realPatchFiles)` returns `[]`.
- [ ] `collectPatchProblems` returns a problem naming the package for each fixture: range spec (`^55.0.5`), lock drift (lock `55.0.20` vs patch `55.0.5`), package missing from lock, patched package not a direct dependency, unrecognised filename, and lock root spec ≠ `package.json` spec.
- [ ] Before FR1 is implemented, the `expo-widgets` exact-pin test fails on the current tree (`^55.0.5`).
- [ ] `git diff --stat main -- patches/` is empty.

---

### FR2: A failed or mismatched patch fails the install

Today `postinstall` is `patch-package` with no flags. Per patch-package 8.0.1 (`dist/index.js:91-95`, `dist/applyPatches.js`):
- A patch that fails to apply exits 0 locally. It exits 1 only in CI or when `NODE_ENV=test`.
- A patch that applies to a different installed version is only a *warning* ("Don't worry! This is probably fine"). That exits 0 everywhere, CI and EAS included.

Both cases must fail.

**Requirements:**
- `scripts.postinstall` is exactly `"patch-package --error-on-fail --error-on-warn"`.
- `patch-package` stays a devDependency (`^8.0.1`; 8.0.1 is the latest).

**Success Criteria:**
- [ ] The test asserts `postinstall` starts with `patch-package` and contains both `--error-on-fail` and `--error-on-warn`.
- [ ] `npm ci`:
  - exits 0
  - output contains `expo-widgets@55.0.5 ✔` and `react-native-reanimated@4.2.1 ✔`
  - output does **not** contain `patch-package finished with`
- [ ] Manual negative check: set the installed `node_modules/expo-widgets/package.json` `version` to `55.0.6`, then run `npx patch-package --error-on-fail --error-on-warn`. It exits **1** and prints `patch file version mismatch`. `npm ci` restores the tree.

---

### FR3: Remove the unused dev tunnel helper

`@expo/ngrok` (`^4.1.0`, installed 4.1.3) sits in `dependencies` but nothing imports it. `expo start --tunnel` resolves it on demand: `@expo/cli` `NgrokResolver` prompts to install it globally.

**Requirements:**
- `npm uninstall @expo/ngrok`.
- Don't add it to `devDependencies`.

**Success Criteria:**
- [ ] The test asserts `@expo/ngrok` is in neither `dependencies` nor `devDependencies`.
- [ ] The test asserts no `package-lock.json` `packages` key starts with `node_modules/@expo/ngrok`. Today there are 16 such entries, including the `ngrok-bin-*` platform binaries.
- [ ] `grep -rn ngrok app src components hooks scripts app.json eas.json metro.config.js babel.config.js` returns nothing.

---

### FR4: Keep `expo install` away from `expo-widgets`

**Requirements:**
- `package.json` gains `"expo": { "install": { "exclude": ["expo-widgets"] } }`.
- Every entry in `expo.install.exclude` must be a direct dependency, so stale entries fail the test. Any entry other than `expo-widgets` needs a one-line reason in `TECH_STACK.md` (FR6).
- `react-native-reanimated` is **not** excluded: SDK 55 expects exactly 4.2.1, so `--fix` leaves it alone. Excluding it would only hide future drift.

Today this is defense-in-depth. `expo-widgets` is absent from SDK 55's native-module list (bundled and remote), so `--check`/`--fix` already ignore it. It becomes load-bearing at SDK 56+, which list it. Keeping it here records the intent for spec 08 and protects against a remote list update.

**Success Criteria:**
- [ ] The test asserts `pkg.expo.install.exclude` is an array containing `"expo-widgets"`, and every entry is a key of `dependencies` or `devDependencies`.
- [ ] `CI=1 npx expo install --check` output includes `Skipped checking dependencies: expo-widgets`.
- [ ] `node -p "require('./package.json').expo.install.exclude"` prints `[ 'expo-widgets' ]`.

---

### FR5: Refresh to the latest SDK 55 patch line

Do this after FR1–FR4, so the strict `postinstall` guards the refresh.

**Requirements:**
- Run `npx expo install --fix`. Re-run `CI=1 npx expo install --check`. If it still reports drift (for example, because the first pass moved `expo` itself), run `--fix` once more. The end state is `--check` exiting 0.
- Expected moves as of 2026-10-19, after spec 03 removed `expo-background-fetch` and `expo-task-manager`. If Expo has published newer 55.0.x patches by implementation time, take what `--fix` selects and record the actual versions in Session Notes.

| Package | From | To (`--fix` writes) |
|---|---|---|
| expo | 55.0.7 | ~55.0.31 |
| expo-blur | 55.0.10 | ~55.0.18 |
| expo-constants | 55.0.9 | ~55.0.17 |
| expo-dev-client | 55.0.18 | ~55.0.40 |
| expo-file-system | 55.0.22 | ~55.0.26 |
| expo-font | 55.0.4 | ~55.0.8 |
| expo-haptics | 55.0.9 | ~55.0.18 |
| expo-image | 55.0.6 | ~55.0.11 |
| expo-linear-gradient | 55.0.9 | ~55.0.18 |
| expo-linking | 55.0.8 | ~55.0.17 |
| expo-notifications | 55.0.13 | ~55.0.27 |
| expo-router | 55.0.7 | ~55.0.18 |
| expo-secure-store | 55.0.9 | ~55.0.18 |
| expo-sharing | 55.0.20 | ~55.0.24 |
| expo-splash-screen | 55.0.12 | ~55.0.25 |
| expo-status-bar | 55.0.4 | ~55.0.6 |
| expo-symbols | 55.0.5 | ~55.0.9 |
| expo-system-ui | 55.0.10 | ~55.0.22 |
| expo-updates | 55.0.15 | ~55.0.33 |
| expo-web-browser | 55.0.10 | ~55.0.20 |
| react-native | 0.83.2 | 0.83.10 |
| react-native-worklets | 0.7.2 | 0.7.4 |
| eslint-config-expo (dev) | 55.0.0 | ~55.0.1 |
| jest-expo (dev) | 55.0.11 | ~55.0.22 |

- **Must not move:**
  - `expo-widgets` stays 55.0.5 (FR1).
  - `react-native-reanimated` stays 4.2.1. SDK 55 expects exactly that, and `react-native-worklets` 0.7.4 is inside reanimated 4.2.x's supported `0.7.x` (`node_modules/react-native-reanimated/compatibility.json`).
  - `@expo/ui` stays 55.0.3 in the lockfile. Only expo-widgets depends on it (`~55.0.3`).
  - If `--fix` proposes moving reanimated (because the remote list changed), add it to `expo.install.exclude` with a TECH_STACK reason. Don't regenerate or rename its patch.
- `package-lock.json` is only ever regenerated by npm, never hand-edited.

**Success Criteria:**
- [ ] `CI=1 npx expo install --check` exits 0 and prints `Dependencies are up to date`.
- [ ] `npx expo-doctor@latest` exits 0 with all checks passing. On 2026-10-19 (doctor 1.21.5, 20 checks) exactly two fail: the schema check (fixed by spec 03) and the version check (fixed here).
- [ ] The deps test's SDK-line assertions pass, reading versions from `package-lock.json` `packages["node_modules/<name>"].version`:

  | Package | Assertion |
  |---|---|
  | expo | ≥ 55.0.31 and major 55 |
  | react-native | ≥ 0.83.10 and `0.83.x` |
  | expo-notifications | ≥ 55.0.27 |
  | expo-updates | ≥ 55.0.33 |
  | react-native-worklets | ≥ 0.7.4 and `0.7.x` |
  | jest-expo | ≥ 55.0.22 |
- [ ] `npm ci` passes FR2's output check (both patches ✔, no summary line).
- [ ] Spec 03's config contract still holds after the plugin bumps. In `EXPO_NO_DOTENV=1 npx expo config --type introspect --json`:
  - `ios.infoPlist.UIBackgroundModes` deep-equals `["remote-notification"]`
  - `ios.infoPlist.NSFaceIDUsageDescription` is absent
  - `ios.privacyManifests` is unchanged from before the refresh
- [ ] Tests and gates:
  - `npm test` has 0 failures. Fallback if spec 07 isn't merged: failures are a subset of the recorded baseline.
  - `npm run typecheck` exits 0 and `npm run lint` reports 0 errors, if those scripts exist.
- [ ] `node -p "require('./package-lock.json').packages['node_modules/@expo/ui'].version"` prints `55.0.3`.

---

### FR6: Docs match the new dependency state

**Requirements:**
- Update `TECH_STACK.md`:
  - Every table row whose bold name is a `package.json` dependency shows exactly the `package.json` spec.
  - The `Expo SDK` row shows the new `expo` spec, and the `React Native` row shows the new `react-native` version.
  - The `expo-widgets` row shows `55.0.5`, and its Role cell says it is pinned exact because it is patched (`patches/expo-widgets+55.0.5.patch`).
  - The `@expo/ngrok` row is removed. Add one line under Tooling: "`expo start --tunnel` prompts to install `@expo/ngrok` globally on first use."
- Add a short "Patched packages" note to `TECH_STACK.md` covering:
  - the three guards: the exact pin, the strict `postinstall`, and `deps.test.ts`
  - the `install.exclude` entry and the reason for each entry
  - the procedure for changing a patched package's version: re-apply the diff, then `npx patch-package <pkg>`, then rename the patch, update the pin, and run `npm ci`
  - a warning never to run a bare `npx expo install expo-widgets`. SDK 55 doesn't list it, so the CLI passes it straight to npm, which installs `latest` (58.x).
- Leave `README.md:66` (`patches/` description) unchanged; it's still accurate.

**Success Criteria:**
- [ ] The TECH_STACK drift one-liner in the checklist prints `drift 0`.
- [ ] `grep -n "Expo SDK\|React Native\b" TECH_STACK.md` shows the new versions.
- [ ] `grep -n ngrok TECH_STACK.md` matches only the on-demand tunnel note.
- [ ] `grep -n "Patched packages" TECH_STACK.md` matches one heading or note.

---

### FR7: Ship as the next native build after 18

**Requirements:**
- **Preconditions before merging to `main`:**
  - (a) Build 18 is submitted (spec 05 done).
  - (b) The commit that produced build 18 is tagged `build-18` and pushed. Use the commit SHA that spec 05's checklist recorded at its Build step. Builds may be `--local`, and a `--local` build has no EAS record. For a cloud build, that SHA must also equal `gitCommitHash` from `eas build:list -p ios --limit 5 --json`.
  - (c) The build-18 baseline OTA (spec 04 runbook A / OPS O11) has been published from that tree.

  After this spec merges, `main`'s fingerprint differs from build 18's. Any later OTA for build-18 users must be published from a branch off `build-18`.
- **Version:**
  - If App Store Connect shows 1.1.0 in any approved state (Pending Developer Release, Ready for Distribution/Sale, Processing for Distribution), set `app.json` `expo.version` **and** `package.json` `version` to `1.1.1`. ASC closes an approved version's train, so a 1.1.0 upload is rejected (ITMS-90186/90062). Spec 04's contract requires the two fields to stay equal.
  - Otherwise keep 1.1.0.
  - In practice this is `1.1.1`. Precondition (c) needs the build-18 baseline OTA, and spec 04 FR4 runs that only after build 18 is `READY_FOR_SALE`.
- **Build number:** `app.json` `ios.buildNumber` is the next unused build number: the highest uploaded build + 1, so at least `"19"`. Check with `eas build:list -p ios` or `node .appstore/asc.js builds`.
- **Fingerprint:** record `npx expo-updates fingerprint:generate --platform ios` hashes before and after. They are expected to differ. Confirm the EAS build log's runtime version equals `npx expo-updates runtimeversion:resolve --platform ios` run on the merge commit.
- **Release:** follow `docs/RELEASING.md` §Native (spec 05) as written: its step order, its owner tags, and its rules. Run asc.js and `eas submit` from the main checkout, and dry-run every asc.js write first. Don't edit the runbook. `<version>` is the Version value above, and `<N>` is the build number.
  1. **Pre-flight (C):** §Native "Pre-flight" on the merge commit. Unlike build 18, `npx expo-doctor` must pass every check, not just the schema check (FR5).
  2. **App Store Connect prep (asc.js) (C), before the build:** §Native's seven commands, in its order. Two of them take version-specific arguments, and two should change nothing:
     - `create-version <version>`. This also creates the phased release (`INACTIVE`), so there is no separate phased-release step.
     - `set-whats-new "Stability improvements and bug fixes."`. This is for `1.1.1`. If the version stayed `1.1.0`, keep spec 05's 1.1.0 copy instead, per §Native's rule that What's New covers changes since the last live build.
     - `disable-public-link` and `remove-public-link-testers` are expected to be no-ops, because build 18 already locked the public link down.
  3. **Build and Upload (C):** `eas build -p ios --profile production`, then `eas submit -p ios --profile production --latest`. Record the build's commit SHA, as §Native's Build step requires; the `build-<N>` tag uses it. Wait until `node .appstore/asc.js builds` shows `<N> … VALID`.
  4. **Attach and verify (C):** `attach-build <buildN-id>`, then `check-submission`.
  5. **TestFlight smoke (J performs, C records):** the full spec 05 smoke. Widgets and notifications get extra attention because those modules moved.
  6. **User-only steps (J):** as listed in §Native.
  7. **Submit (J):** the submit decision is J's, per §Native "Submit" (`submit-app-review <buildN-id>`, dry-run first, or the ASC Submit button). Claude never runs `submit-app-review` live on its own.
- **After release (C):**
  1. **Addition to §Native** (this spec's convention, not in the runbook): tag the commit SHA recorded at the Build step as `build-<N>` and push the tag. Do this first, so spec 04 runbook A step 1 can cross-check the tag against the build's commit.
  2. §Native "Post-release": spec 04 runbook A (baseline OTA) for the new runtime, published from the `build-<N>` tree, plus any OPS O8–O10 item that is still open.

**Success Criteria:**
- [ ] `git tag --list build-18` prints `build-18`, and `git ls-remote --tags origin build-18` shows it, before the merge.
- [ ] `app.json` `ios.buildNumber` is the next unused integer string (≥ `"19"`). `app.json` `expo.version` equals `package.json` `version`, and is `1.1.1` if 1.1.0 was approved.
- [ ] Spec 03/04/05's `__tests__/config/app-config.test.ts` passes unchanged. It uses range assertions for the build number and equality for the version.
- [ ] Every live asc.js write in ASC prep and Attach is preceded in the checklist by its dry-run transcript, and followed by a no-op re-run or by `check-submission` output (as in §Native).
- [ ] The EAS production build succeeds, and its runtime version equals the locally resolved "after" fingerprint.
- [ ] Before J submits, `check-submission` shows version `<version>` `PREPARE_FOR_SUBMISSION`, build `v<N>` attached, `AFTER_APPROVAL`, phased release `INACTIVE`, the What's New text and the 3 live URLs.
- [ ] Every spec 05 smoke item passes on TestFlight. The Settings version row reads `Version <version> (<N>)` with `Update: embedded`.
- [ ] After release, the baseline OTA lands: the version row shows `Update: <id>` after two cold starts. `build-<N>` is tagged and pushed.

---

## Technical Design

### Interface Contracts

#### `package.json` / lockfile (post-change)

| Item | Contract |
|---|---|
| `dependencies["expo-widgets"]` | `"55.0.5"` |
| `dependencies["react-native-reanimated"]` | `"4.2.1"` (unchanged) |
| Each non-nested `patches/<name>+<ver>.patch` | `<name>` is a direct dependency declared exactly `<ver>`; lockfile root spec is the same |
| Each patch (incl. nested) | `package-lock.json` `packages[<details.path>].version === <ver>` |
| `scripts.postinstall` | `"patch-package --error-on-fail --error-on-warn"` |
| `dependencies` / `devDependencies` | no `@expo/ngrok`; lockfile has no `node_modules/@expo/ngrok*` keys |
| `expo.install.exclude` | `["expo-widgets"]`; every entry is a direct dependency |
| `patches/*` | byte-identical to `main` |
| Lockfile `node_modules/expo` | ≥ 55.0.31, major 55 |
| Lockfile `node_modules/react-native` | ≥ 0.83.10, `0.83.x` |
| Lockfile `node_modules/react-native-worklets` | ≥ 0.7.4, `0.7.x` |
| `app.json` `ios.buildNumber` | next unused, ≥ `"19"` |
| `app.json` `expo.version` | equals `package.json` `version`; `"1.1.1"` if 1.1.0 was approved |

#### Command contracts

| Command | Expected |
|---|---|
| `npm ci` | exit 0; prints `expo-widgets@55.0.5 ✔` and `react-native-reanimated@4.2.1 ✔`; no `patch-package finished with` |
| `CI=1 npx expo install --check` | exit 0; `Dependencies are up to date`; `Skipped checking dependencies: expo-widgets` |
| `npx expo-doctor@latest` | exit 0, all checks pass |
| `EXPO_NO_DOTENV=1 npx expo config --type introspect --json` | spec 03 contract holds (FR5) |
| `npx expo-updates fingerprint:generate --platform ios` | hash differs before vs after (expected) |

Use `EXPO_NO_DOTENV=1` with any `--json` Expo command. Otherwise the `.env.local` loader prints `env: load .env.local` to stdout and breaks the JSON.

#### `__tests__/config/deps.test.ts` internals

```ts
import fs from 'fs';
import path from 'path';

type PatchDetails = {
  name: string; version: string; path: string; // e.g. 'node_modules/expo-widgets'
  isNested: boolean; patchFilename: string;
};
// patch-package ships no .d.ts; use its own parser + discovery so this guard reads
// patches/ exactly as `postinstall` does (scoped, nested `++`, `.dev`, sequence names).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getPackageDetailsFromPatchFilename } = require('patch-package/dist/PackageDetails') as {
  getPackageDetailsFromPatchFilename(f: string): PatchDetails | null;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getPatchFiles } = require('patch-package/dist/patchFs') as {
  getPatchFiles(dir: string): string[];
};

const ROOT = path.resolve(__dirname, '../..');

type PackageJson = {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  expo?: { install?: { exclude?: string[] } };
};
type PackageLock = {
  packages: Record<string, { version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>;
};

/** Pure. Returns one human-readable problem per violation; [] means aligned. */
function collectPatchProblems(pkg: PackageJson, lock: PackageLock, patchFilenames: string[]): string[];

/** Numeric x.y.z comparison (no prerelease handling needed for these packages). */
function versionAtLeast(actual: string, floor: string): boolean;
```

`collectPatchProblems` rules. Each problem string must contain the package name or filename:

| # | Condition | Problem text (shape) |
|---|---|---|
| 1 | filename unparseable (`getPackageDetailsFromPatchFilename` → `null`) | `Unrecognized patch file: <file>` |
| 2 | non-nested, `name` not in `dependencies`/`devDependencies` | `<name>: patched but not a direct dependency` |
| 3 | non-nested, declared spec not `/^\d+\.\d+\.\d+$/` or ≠ patch version | `<name>: declared "<spec>" must be exactly "<ver>" (<file>)` |
| 4 | `lock.packages[details.path]` missing (normalize `path.sep` → `/`) | `<name>: not in package-lock.json at <path>` |
| 5 | lockfile version ≠ patch version | `<name>: lockfile has <lv>, patch is for <ver> (orphaned patch)` |
| 6 | non-nested, lockfile root spec ≠ `package.json` spec | `<name>: package-lock root spec "<x>" != package.json "<y>"` |

### Test Plan

All tests are plain Jest, run under the existing `jest-expo/node` preset. The test path matches `testMatch` `**/__tests__/**/*.test.ts`. There are no mocks: the tests read real repo files with `fs`, like the existing source-reading tests in `__tests__/approval-card.test.tsx`.

**`__tests__/config/deps.test.ts` (new).** `__tests__/config/` is created by spec 03; create it if it's missing.

| describe / it | FR |
|---|---|
| **patched packages** — `getPatchFiles(ROOT/patches)` returns ≥ 1 file, and every file parses (non-null) | FR1 |
| — `dependencies['expo-widgets'] === '55.0.5'` | FR1 |
| — `collectPatchProblems(real pkg, real lock, real patch files)` equals `[]` | FR1 |
| — fixture: `expo-widgets: '^55.0.5'` → one problem containing `expo-widgets` and `exactly "55.0.5"` | FR1 |
| — fixture: lockfile `55.0.20` vs patch `55.0.5` → problem containing `orphaned patch` | FR1 |
| — fixture: package absent from lockfile → `not in package-lock.json` | FR1 |
| — fixture: patch for a package not declared in `package.json` → `not a direct dependency` | FR1 |
| — fixture: `garbage.patch` → `Unrecognized patch file: garbage.patch` | FR1 |
| — fixture: lockfile root spec `^55.0.5` while `package.json` says `55.0.5` → `package-lock root spec` | FR1 |
| — fixture: nested `a++b+1.0.0.patch` with lock `node_modules/a/node_modules/b` at 1.0.0 and `b` not a direct dependency → `[]` | FR1 |
| **postinstall** — `scripts.postinstall` matches `/^patch-package(\s|$)/` and contains `--error-on-fail` and `--error-on-warn` | FR2 |
| — `devDependencies['patch-package']` is defined | FR2 |
| **dev tunnel helper** — `@expo/ngrok` not in `dependencies` or `devDependencies` | FR3 |
| — no `lock.packages` key starts with `node_modules/@expo/ngrok` | FR3 |
| **expo.install.exclude** — is an array containing `expo-widgets` | FR4 |
| — every entry is a key of `dependencies`/`devDependencies` | FR4 |
| **SDK 55 patch line** — `versionAtLeast` unit checks: `('55.0.31','55.0.31')` true, `('55.0.7','55.0.31')` false, `('0.83.10','0.83.2')` true | FR5 |
| — lockfile `expo` ≥ 55.0.31 and starts with `55.` | FR5 |
| — lockfile `react-native` ≥ 0.83.10 and starts with `0.83.` | FR5 |
| — lockfile `expo-notifications` ≥ 55.0.27; `expo-updates` ≥ 55.0.33; `jest-expo` ≥ 55.0.22 | FR5 |
| — lockfile `react-native-worklets` ≥ 0.7.4 and starts with `0.7.` (reanimated 4.2.x compatibility) | FR5 |

**Red phase (before implementation):**
- These fail on today's tree: `expo-widgets` exact pin, real-data `collectPatchProblems` (rules 3 and 6 for expo-widgets), postinstall flags, both ngrok tests, both exclude tests, and every FR5 lockfile floor.
- These pass already: all fixture tests and `versionAtLeast` units, because they exercise pure logic.

**Existing tests that must stay green:**
- `__tests__/config/app-config.test.ts` (specs 03/04/05) covers FR7's version/build bump and spec 03's config contract. It's expected to pass unchanged. If spec 05's version hard-coded `"18"` instead of a `>= 18` range, change it to the range spec 05 specified and note it.
- The whole suite (`npm test`) is the FR5 regression gate.

**Command and manual verifications (in the checklist):**
- `npm ci` output check (FR2, FR5)
- the FR2 negative check
- `expo install --check` (FR4, FR5)
- `expo-doctor` (FR5)
- introspect contract (FR5)
- `@expo/ui` lockfile check (FR5)
- TECH_STACK drift one-liner (FR6)
- fingerprint before/after, asc.js prep and attach transcripts, EAS build, `check-submission`, TestFlight smoke, `build-<N>` tag, baseline OTA (FR7)

### Files to Reference

| File | Why |
|---|---|
| `node_modules/patch-package/dist/index.js:91-95` | `shouldExitWithError` / `shouldExitWithWarning` logic |
| `node_modules/patch-package/dist/applyPatches.js` (`applyPatchesForPackage`, `applyPatch`) | Mismatch → warning, failure → error, already-applied → success |
| `node_modules/patch-package/dist/PackageDetails.js`, `patchFs.js` | Parser and discovery reused by the test |
| `node_modules/expo/node_modules/@expo/cli/build/src/install/checkPackages.js:94` | `expo.install.exclude` handling (CLI 55.0.17; still present in 55.0.36, which `expo@55.0.31` ships) |
| `node_modules/expo/node_modules/@expo/cli/build/src/start/doctor/dependencies/getVersionedPackages.js:117-145` | Packages not in the SDK list pass straight to npm (bare `expo install expo-widgets` → `latest`) |
| `node_modules/react-native-reanimated/compatibility.json` | 4.2.x ↔ worklets `0.7.x`, RN 0.80–0.83 |
| `jest.config.js` | `testMatch`, `jest-expo/node` preset |
| `__tests__/approval-card.test.tsx` | Existing `fs.readFileSync(path.resolve(__dirname, …))` pattern |
| `features/app/store-compliance/specs/03-native-config-cleanup/spec-research.md` | Introspect contract to re-verify; `__tests__/config/app-config.test.ts` |
| `features/app/store-compliance/specs/04-ota-lane/spec-research.md` | Fingerprint policy, runbook A, version-equality contract |
| `features/app/store-compliance/specs/05-release-build-18/spec.md` (FR3–FR7), `docs/RELEASING.md` | §Native runbook, asc.js command behavior, TestFlight smoke list. Use spec 05's `spec.md`, not its `spec-research.md`: the research runbook still gives version creation, What's New and phased release to J (spec 05 Research Correction 7) |
| `.appstore/asc.js` (untracked, main checkout only) | The ASC prep, `attach-build`, `check-submission` and `submit-app-review` commands that FR7 runs |
| `eas.json` | `production` profile (channel `production`); `preview` is internal/ad hoc, not TestFlight |

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `__tests__/config/deps.test.ts` | create | Guards for FR1–FR5 |
| `package.json` | modify | Exact pin, `postinstall`, drop ngrok, `expo.install.exclude`, SDK 55 patch refresh, `version` (FR7, if bumped) |
| `package-lock.json` | modify (npm-generated only) | Mirrors the above |
| `TECH_STACK.md` | modify | Versions, ngrok note, "Patched packages" note |
| `app.json` | modify | `ios.buildNumber` (next unused); `expo.version` → `1.1.1` if 1.1.0 was approved |
| `patches/*` | **not modified** | Must stay byte-identical |

### Data Flow

```
npm ci / npm install / npx expo install --fix
  └─ npm resolves from package-lock.json (patched pkgs pinned exact → cannot drift)
       └─ postinstall: patch-package --error-on-fail --error-on-warn
            ├─ applied at matching version     → "<pkg>@<ver> ✔"           → exit 0
            ├─ applied at a different version  → mismatch warning          → exit 1 (install fails)
            └─ failed to apply / pkg missing   → error                     → exit 1 (install fails)

npm test (local + CI)
  └─ __tests__/config/deps.test.ts
       ├─ getPatchFiles(patches/) → getPackageDetailsFromPatchFilename
       ├─ compare against package.json (exact spec) and package-lock.json (packages[path].version, root spec)
       └─ assert postinstall flags, no ngrok, install.exclude, SDK 55 floors

npx expo install --check/--fix
  └─ remote SDK 55 list (api.expo.dev) + bundled list; skips expo.install.exclude
       (expo-widgets isn't on the SDK 55 list → never touched; reanimated expected exactly 4.2.1 → untouched)

eas build (production) → fingerprint runtime ≠ build 18 → new OTA audience → baseline OTA after release
```

### Edge Cases

| # | Case | Handling |
|---|---|---|
| 1 | Fingerprint changes (spec 04) | Expected; this is why the spec ships as a native build. Record the before/after hashes (FR7). |
| 2 | `npx expo start --tunnel` after removing ngrok | The CLI prompts to install `@expo/ngrok` globally. Without a TTY (CI) it errors; tunnels aren't used in CI. Documented in TECH_STACK (FR6). |
| 3 | Someone runs a bare `npx expo install expo-widgets` | SDK 55 doesn't list expo-widgets, so the CLI passes it to npm unchanged and npm installs `latest` (58.x). The strict `postinstall` fails and the deps test fails (rules 3/5). Fix: `npm install expo-widgets@55.0.5 --save-exact`. Documented in TECH_STACK. |
| 4 | Lockfile deleted/regenerated or `npm update` | Exact pins mean npm can only resolve the patched versions. |
| 5 | Expo publishes more 55.0.x patches before implementation | Floors are `≥`, so the tests still pass. Take what `--fix` selects and record it. |
| 6 | `--fix` wants to move reanimated (remote list changed) | Add it to `expo.install.exclude` with a TECH_STACK reason. Don't touch its patch (spec 08 deletes it). |
| 7 | EAS build fails compiling expo-widgets 55.0.5 against the newer `expo-modules-core` (55.0.16 → 55.0.26). expo-widgets 55.0.5 shipped with expo 55.0.7 on 2026-03-17; upstream never shipped it alongside expo 55.0.31 (2026-08-31). | Stop. Don't hand-patch. Record the error. Per the project's Debugging Escalation rule, escalate with these options: (a) move expo-widgets to 55.0.20 and re-base the patch (scope change, needs a spec amendment); (b) `overrides`-pin `expo-modules-core` (not recommended); (c) ship only FR1–FR4 and defer the refresh to spec 08. |
| 8 | jest-expo 55.0.22 changes test behavior | Triage each new failure. Fix the test only if app behavior is unchanged. Excluding jest-expo needs a spec amendment. |
| 9 | Spec 07 isn't merged (unexpected) | Gate on `npm test` against the baseline only (research Decision 3). Don't chain `tsc`. |
| 10 | Lockfile conflicts on rebase (e.g. with spec 07's `@types/node`) | Resolve `package.json` by hand, regenerate the lockfile with `npm install`, never hand-merge `package-lock.json`, then re-run every FR5 gate. |
| 11 | 1.1.0 already approved | Its train is closed, so bump to `1.1.1` in both `app.json` and `package.json` (FR7). With the fingerprint policy, the version bump alone doesn't change the runtime. |
| 12 | A JS-only fix (OTA) is needed for build-18 users after this merges | Publish from a branch off the `build-18` tag. `main` now targets the new runtime. |
| 13 | A non-`.patch` file in `patches/` (e.g. a README) | patch-package ignores it. A `*.patch` file that doesn't parse becomes a warning, which now fails the install; deps test rule 1 also flags it. |
| 14 | `@expo/ui` moves in the lockfile | It shouldn't, because only expo-widgets depends on it. If `git diff package-lock.json` shows a change, revert to 55.0.3 and investigate before building. |
| 15 | `--json` Expo output polluted by `env: load .env.local` | Prefix with `EXPO_NO_DOTENV=1`. |
| 16 | EAS install step | EAS sets `CI`, so failed patches already exited 1 there. `--error-on-warn` now also fails on version-mismatch warnings, which is intended. |

---

## Dependencies

### Internal
- **03-native-config-cleanup**, merged: removes `expo-background-fetch`/`expo-task-manager` (which is why 24 packages move, not 26), creates `__tests__/config/app-config.test.ts`, and defines the introspect contract re-verified in FR5.
- **04-ota-lane**, merged: fingerprint runtime policy, `.fingerprintignore`, runbook A, and `package.json.version === app.json.expo.version`.
- **05-release-build-18**, done: build 18 submitted; `docs/RELEASING.md` §Native, the hardened asc.js commands it runs, and the TestFlight smoke list.
- **07-ci-typecheck-lint**, expected merged (part of build 18): adds the typecheck/lint gates and `@types/node`, so `fs`/`path` imports typecheck.
- Blocks **08-expo-sdk-57-scenes**, which keeps `deps.test.ts` passing and removes the `install.exclude` entry after re-basing.

### External
- npm registry: `expo-widgets` sdk-55 tag = 55.0.20; `expo` sdk-55 tag = 55.0.31; patch-package latest = 8.0.1.
- Expo API `api.expo.dev/v2/sdks/55.0.0/native-modules`: the remote SDK 55 list used by `--check`/`--fix`.
- EAS Build/Submit and App Store Connect. Claude does the version record, What's New, phased release and attach through asc.js (§Native). J owns the agreement, the TestFlight smoke and the submit decision.

### Assumptions
- patch-package stays on 8.x, so `dist/PackageDetails` and `dist/patchFs` exist. A future major that moves them breaks the test loudly. Then re-implement the parser locally; don't loosen the guard.
- Expo's SDK 55 list keeps `react-native-reanimated` at exactly `4.2.1` and leaves `expo-widgets` off. If not, follow Edge Case 6.
- At least one registered tester device is available for the TestFlight smoke.
