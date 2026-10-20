# Implementation Checklist

Spec: `06-dependency-hygiene`
Feature: `store-compliance`

All commands run from the app repo root (`hourglassws/`). Branch: `chore/06-dependency-hygiene`, cut from `main` after spec 05 (build 18) has merged.

---

## Pre-flight (before Phase 1.0)

### Preconditions
- [x] Spec 03 is merged. Confirm both of these print `undefined`:
  - `node -p "require('./package.json').dependencies['expo-background-fetch']"`
  - `node -p "require('./package.json').dependencies['expo-task-manager']"`
- [x] Spec 04 is merged: `node -p "JSON.stringify(require('./app.json').expo.runtimeVersion)"` prints `{"policy":"fingerprint"}`.
- [ ] Spec 05 is done: build 18 is submitted and `docs/RELEASING.md` §Native exists.
- [x] Spec 07 merge status recorded in Session Notes. `node -p "require('./package.json').scripts.typecheck"` prints `tsc --noEmit` if merged. This decides which gates apply.
- [x] `__tests__/config/` exists (created by spec 03). Create it if it's missing.

### Baseline captures (on the branch point, before any change)
- [x] `npm ci`, then record the patch-package output. Expect `expo-widgets@55.0.5 ✔` and `react-native-reanimated@4.2.1 ✔`.
- [x] `npm test 2>&1 | tail -5`: record pass/fail counts and any failing test names (expect 0 failures if spec 07 is merged).
- [x] If spec 07 is merged: `npm run typecheck` and `npm run lint` both exit 0 (record). **N/A:** spec 07 is not on this branch; raw `tsc`/`expo lint` counts recorded in Session Notes instead.
- [x] `EXPO_NO_DOTENV=1 npx expo config --type introspect --json > /tmp/06-introspect-before.json`
- [x] `EXPO_NO_DOTENV=1 npx expo-updates fingerprint:generate --platform ios | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).hash))"`: record as **fingerprint-before**.
- [x] `EXPO_NO_DOTENV=1 CI=1 npx expo install --check --json > /tmp/06-check-before.json; echo $?`: expect exit 1 and 24 entries. Record the list in Session Notes.

---

## Phase 1.0: Test Foundation

Create `__tests__/config/deps.test.ts` following the spec's "Interface Contracts → deps.test.ts internals":
- `collectPatchProblems`, `versionAtLeast`, `ROOT = path.resolve(__dirname, '../..')`
- patch-package parser and discovery via `require` with the `eslint-disable-next-line` comment and typed casts

Commit message: `test(06-dependency-hygiene): add dependency guard tests (red)`.

### FR1: Pin every patched package to its patch version
- [x] Test: `getPatchFiles(ROOT/patches)` returns ≥ 1 file, and every filename parses (non-null `PatchDetails`).
- [x] Test: `dependencies['expo-widgets'] === '55.0.5'`.
- [x] Test: `collectPatchProblems(realPkg, realLock, realPatchFiles)` equals `[]`.
- [x] Fixture tests on `collectPatchProblems`. Each asserts the returned problem contains the package or filename and the rule phrase:
  - [x] `expo-widgets: '^55.0.5'` → contains `expo-widgets` and `exactly "55.0.5"`
  - [x] lockfile version `55.0.20` vs patch `55.0.5` → contains `orphaned patch`
  - [x] package missing from `lock.packages` → contains `not in package-lock.json`
  - [x] patch for a package not in `dependencies`/`devDependencies` → contains `not a direct dependency`
  - [x] `garbage.patch` → `Unrecognized patch file: garbage.patch`
  - [x] lockfile root spec `^55.0.5` vs `package.json` `55.0.5` → contains `package-lock root spec`
  - [x] nested `a++b+1.0.0.patch` with `lock.packages['node_modules/a/node_modules/b'].version === '1.0.0'` and `b` not a direct dependency → `[]`

### FR2: A failed or mismatched patch fails the install
- [x] Test: `scripts.postinstall` matches `/^patch-package(\s|$)/` and contains `--error-on-fail` and `--error-on-warn`.
- [x] Test: `devDependencies['patch-package']` is defined.

### FR3: Remove the unused dev tunnel helper
- [x] Test: `@expo/ngrok` is in neither `dependencies` nor `devDependencies`.
- [x] Test: no key of `lock.packages` starts with `node_modules/@expo/ngrok`.

### FR4: Keep `expo install` away from `expo-widgets`
- [x] Test: `pkg.expo?.install?.exclude` is an array containing `'expo-widgets'`.
- [x] Test: every exclude entry is a key of `dependencies` or `devDependencies`.

### FR5: Refresh to the latest SDK 55 patch line
- [x] Test: `versionAtLeast` units: `('55.0.31','55.0.31')` true, `('55.0.7','55.0.31')` false, `('0.83.10','0.83.2')` true, `('0.7.4','0.7.4')` true.
- [x] Test: lockfile `expo` ≥ `55.0.31` and starts with `55.`
- [x] Test: lockfile `react-native` ≥ `0.83.10` and starts with `0.83.`
- [x] Test: lockfile `expo-notifications` ≥ `55.0.27`, `expo-updates` ≥ `55.0.33`, `jest-expo` ≥ `55.0.22`
- [x] Test: lockfile `react-native-worklets` ≥ `0.7.4` and starts with `0.7.` (reanimated 4.2.x requires worklets `0.7.x`)

### FR6 / FR7
- [x] No new unit tests. FR6 is verified by the drift one-liner in Phase 1.1. FR7 is covered by the existing `__tests__/config/app-config.test.ts` (specs 03/04/05) plus the release verifications in Phase 1.3.

### Red-phase confirmation
- [x] `npx jest __tests__/config/deps.test.ts`. These **fail**:
  - expo-widgets exact pin
  - real-data `collectPatchProblems` (rules 3 and 6 for `expo-widgets`)
  - postinstall flags
  - both ngrok tests
  - both exclude tests
  - all FR5 lockfile floors

  These **pass**: all fixture tests and the `versionAtLeast` units. Record the counts in Session Notes.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage (FR1–FR5 unit tests; FR2/FR5/FR6/FR7 command checks listed below)
- [ ] Assertions are specific (not just "exists" or "doesn't throw"). Problem strings are matched on package name plus rule phrase, and versions are compared numerically.
- [ ] Mocks return realistic data matching interface contracts. There are no mocks; fixtures use lockfile v3 shapes (`packages[''].dependencies`, `packages['node_modules/<name>'].version`).
- [ ] The guard can fail. Each `collectPatchProblems` rule has a fixture producing exactly that problem.
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

Do FR1–FR4 first, so the strict `postinstall` guards the FR5 refresh.

### FR1: Pin every patched package to its patch version
- [ ] `npm install expo-widgets@55.0.5 --save-exact`
- [ ] `node -p "require('./package.json').dependencies['expo-widgets']"` prints `55.0.5`.
- [ ] `node -p "require('./package-lock.json').packages[''].dependencies['expo-widgets']"` prints `55.0.5`.
- [ ] `git diff --stat -- patches/` is empty.

### FR2: A failed or mismatched patch fails the install
- [ ] Set `scripts.postinstall` to `"patch-package --error-on-fail --error-on-warn"`.
- [ ] `npm ci`: exit 0; output contains `expo-widgets@55.0.5 ✔` and `react-native-reanimated@4.2.1 ✔`; output does **not** contain `patch-package finished with`.
- [ ] **Negative check** (touches only `node_modules`):
  ```bash
  node -e "const f='node_modules/expo-widgets/package.json';const p=JSON.parse(require('fs').readFileSync(f,'utf8'));p.version='55.0.6';require('fs').writeFileSync(f,JSON.stringify(p,null,2))"
  npx patch-package --error-on-fail --error-on-warn; echo "exit=$?"   # expect exit=1 and "patch file version mismatch"
  npm ci                                                              # restore; expect both ✔ again
  ```

### FR3: Remove the unused dev tunnel helper
- [ ] `npm uninstall @expo/ngrok`
- [ ] `node -p "Object.keys(require('./package-lock.json').packages).filter(k=>k.startsWith('node_modules/@expo/ngrok')).length"` prints `0`.
- [ ] `grep -rn ngrok app src components hooks scripts app.json eas.json metro.config.js babel.config.js` returns nothing.

### FR4: Keep `expo install` away from `expo-widgets`
- [ ] Add `"expo": { "install": { "exclude": ["expo-widgets"] } }` to `package.json`.
- [ ] `node -p "require('./package.json').expo.install.exclude"` prints `[ 'expo-widgets' ]`.
- [ ] `npx jest __tests__/config/deps.test.ts`: FR1–FR4 tests pass. FR5 floors still fail, which is expected.
- [ ] Commit: `chore(06-dependency-hygiene): pin patched deps, strict postinstall, drop ngrok, install.exclude`.

### FR5: Refresh to the latest SDK 55 patch line
- [ ] `npx expo install --fix`. It must finish without a postinstall failure.
- [ ] `CI=1 npx expo install --check; echo $?`. If it's not 0, run `npx expo install --fix` once more and re-check. Final result: exit 0, `Dependencies are up to date`, and the output includes `Skipped checking dependencies: expo-widgets`.
- [ ] Compare the moved packages against the spec's FR5 table and record actual versions in Session Notes. Confirm all of these:
  - [ ] `react-native-reanimated` is still `4.2.1`.
  - [ ] `expo-widgets` is still `55.0.5`.
  - [ ] `react-native-worklets` is in `0.7.x`.
- [ ] If `--fix` tried to move reanimated: revert it to `4.2.1`, add it to `expo.install.exclude`, and add a TECH_STACK reason (Edge Case 6).
- [ ] `node -p "require('./package-lock.json').packages['node_modules/@expo/ui'].version"` prints `55.0.3` (Edge Case 14).
- [ ] `git diff --stat -- patches/` is empty.
- [ ] `npm ci`: exit 0, both patches ✔, no `patch-package finished with`.
- [ ] `npx expo-doctor@latest; echo $?`: exit 0, all checks pass.
- [ ] Introspect re-check:
  ```bash
  EXPO_NO_DOTENV=1 npx expo config --type introspect --json > /tmp/06-introspect-after.json
  node -e "const a=require('/tmp/06-introspect-before.json'),b=require('/tmp/06-introspect-after.json');
  console.log('bgModes', JSON.stringify(b.ios.infoPlist.UIBackgroundModes));
  console.log('faceID absent', b.ios.infoPlist.NSFaceIDUsageDescription===undefined);
  console.log('privacyManifests unchanged', JSON.stringify(a.ios.privacyManifests)===JSON.stringify(b.ios.privacyManifests));"
  ```
  Expect `["remote-notification"]`, `true`, `true`. Review and note any other Info.plist diff.
- [ ] `npx jest __tests__/config/deps.test.ts`: all tests pass.
- [ ] `npm test`: 0 failures. If spec 07 isn't merged: failures are a subset of the baseline.
- [ ] If spec 07 is merged: `npm run typecheck` exits 0 and `npm run lint` reports 0 errors.
- [ ] Triage any new test failure per Edge Case 8. Do not exclude `jest-expo` or delete tests.
- [ ] Commit: `chore(06-dependency-hygiene): refresh to latest SDK 55 patch line`.

### FR6: Docs match the new dependency state
- [ ] Update every touched version cell in `TECH_STACK.md` to the exact `package.json` spec.
- [ ] Update the `Expo SDK` row to the new `expo` spec and the `React Native` row to the new `react-native` version.
- [ ] Set the `expo-widgets` row to `55.0.5`. Its Role cell notes it is pinned exact because it is patched (`patches/expo-widgets+55.0.5.patch`).
- [ ] Remove the `@expo/ngrok` row. Add a Tooling note: "`expo start --tunnel` prompts to install `@expo/ngrok` globally on first use."
- [ ] Add a "Patched packages" note covering:
  - the guards (exact pin, `--error-on-fail --error-on-warn`, `__tests__/config/deps.test.ts`)
  - `expo.install.exclude` and the reason for each entry
  - the version-change procedure
  - the warning never to run a bare `npx expo install expo-widgets`
- [ ] Drift check prints `drift 0`:
  ```bash
  node -e "const fs=require('fs');const p=require('./package.json');const d={...p.dependencies,...p.devDependencies};
  const rows=fs.readFileSync('TECH_STACK.md','utf8').split('\n').map(l=>l.match(/^\|\s*\*\*([^*]+)\*\*\s*\|\s*([^|]+?)\s*\|/)).filter(Boolean);
  let bad=0;for(const [,n,v] of rows){if(n in d&&d[n]!==v){bad++;console.log('DRIFT',n,'doc='+v,'pkg='+d[n]);}}console.log('rows',rows.length,'drift',bad);"
  ```
- [ ] `grep -n ngrok TECH_STACK.md` shows only the tunnel note. `grep -n "Patched packages" TECH_STACK.md` shows one match.
- [ ] Commit: `docs(06-dependency-hygiene): update TECH_STACK for pinned and refreshed deps`.

### FR7: Ship as the next native build after 18 (repo changes)
- [ ] Check the 1.1.0 state (C: `node .appstore/asc.js check-submission`, from the main checkout). If it's approved or released, set `app.json` `expo.version` and `package.json` `version` to `1.1.1`. Otherwise keep `1.1.0`. Record which in Session Notes.
- [ ] Find the highest uploaded build (`eas build:list -p ios --limit 5` or `node .appstore/asc.js builds`). Set `app.json` `ios.buildNumber` to that number + 1 (≥ `"19"`).
- [ ] `node -p "require('./app.json').expo.version===require('./package.json').version"` prints `true`.
- [ ] `npx jest __tests__/config`: `app-config.test.ts` and `deps.test.ts` pass. If spec 05's test hard-coded `"18"`, convert it to the `>= 18` range and note it.
- [ ] `EXPO_NO_DOTENV=1 npx expo-updates fingerprint:generate --platform ios`: record the hash as **fingerprint-after**. It must differ from fingerprint-before (Edge Case 1).
- [ ] Commit: `chore(ios): bump to <version> build <N> for dependency refresh`.

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code
- [ ] Interface contracts match implementation (`package.json` contract table, `collectPatchProblems` rules 1–6, command contracts)
- [ ] No scope creep or shortfall: no non-SDK upgrades, no `patches/` edits, no CI workflow changes

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes (`npx jest __tests__/config`, then `npm test`; plus typecheck/lint if present)
- [ ] Commit fixes: `fix(06-dependency-hygiene): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(06-dependency-hygiene): strengthen test assertions`

### Final Verification
- [ ] All tests passing
- [ ] No regressions in existing tests
- [ ] Code follows existing patterns (`fs.readFileSync(path.resolve(__dirname, …))`, as in `__tests__/approval-card.test.tsx`)
- [ ] Final `npm ci` shows both patches ✔ with no warnings, and `CI=1 npx expo install --check` exits 0.

---

## Phase 1.3: Ship (FR7 release steps)

Follow `docs/RELEASING.md` §Native (spec 05) as written: its order, its owner tags, and its rules. Don't edit the runbook. asc.js and `eas submit` run from the main checkout only. For every asc.js write: (1) `--dry-run`, paste the transcript; (2) live run, paste the output; (3) re-run, paste the no-op output (zero writes). `<version>` is the Phase 1.1 FR7 value (`1.1.1` in practice). `<N>` is the build number.

### Before merging to `main`
- [ ] Get the build-18 commit: the commit SHA recorded in spec 05's checklist at its Build step. Builds may be `--local`, and those have no EAS record. For a cloud build, confirm it equals `gitCommitHash` of the build-18 entry in `eas build:list -p ios --limit 10 --json`.
- [ ] `git tag build-18 <sha> && git push origin build-18`, then confirm with `git ls-remote --tags origin build-18`.
- [ ] Confirm the build-18 baseline OTA (spec 04 runbook A / OPS O11) has been published from the build-18 tree. Record the update group id.
- [ ] Rebase onto `main`. If `package-lock.json` conflicts: resolve `package.json` by hand, run `npm install` to regenerate the lockfile, then repeat the FR5 gates (`npm ci`, `--check`, doctor, introspect, `npm test`, typecheck/lint).
- [ ] Merge.

### Pre-flight (C), on the merge commit
- [ ] §Native "Pre-flight": record every command's output summary. Unlike build 18, `npx expo-doctor@latest` must pass **every** check (FR5), not just the schema check.

### App Store Connect prep (asc.js) (C), before the build
- [ ] `disable-public-link`: dry-run → expected no-op (`= public link already disabled…`), because build 18 already turned it off
- [ ] `remove-public-link-testers`: dry-run → expected no-op. `list-testers --type=PUBLIC_LINK` → `Total: 0`
- [ ] `create-version <version>`: dry-run (1 `POST /appStoreVersions` with `versionString:"<version>"`, plus 1 `POST /appStoreVersionPhasedReleases`) / live / re-run no-op (`= version <version> already exists (PREPARE_FOR_SUBMISSION)`, `= phased release already configured (INACTIVE)`). This also sets up phased release, so there's no separate phased-release step.
- [ ] `check-submission` → newest is `<version>`. Check that copyright, description and keywords copied over. If any is missing, stop and report to J
- [ ] `set-urls`: dry-run / live (if anything differs) / re-run no-op
- [ ] `set-social-media-age-rating`: dry-run / live (if not already `false`) / re-run no-op. `appStoreAgeRating` = `FOUR_PLUS` (stop if not)
- [ ] `set-whats-new "Stability improvements and bug fixes."` (for `1.1.1`): dry-run / live / re-run no-op. If the version stayed `1.1.0`, use `--file` with spec 05's 1.1.0 copy instead (§Native: changes since the last live build)
- [ ] `set-review-notes`: dry-run / live (if anything differs) / re-run no-op

### Build and upload (C)
- [ ] `EXPO_NO_DOTENV=1 npx expo-updates runtimeversion:resolve --platform ios` on the merge commit: record the runtime.
- [ ] `eas build -p ios --profile production` succeeds. Record the EAS build id and the commit SHA (used for the `build-<N>` tag). The runtime version in the build log equals the value above. If native compile fails, **stop** and follow Edge Case 7 (escalate; no ad hoc overrides).
- [ ] `eas submit -p ios --profile production --latest`, from the main checkout.
- [ ] `node .appstore/asc.js builds` → `<N> … VALID`. ASC build id: ______

### Attach and verify (C)
- [ ] `attach-build <buildN-id>`: dry-run (1 PATCH) / live / re-run no-op (`= build <N> already attached`)
- [ ] `check-submission` → `<version>` `PREPARE_FOR_SUBMISSION`, build `v<N>`, `AFTER_APPROVAL`, phased `INACTIVE`, the What's New text, the 3 live URLs, `socialMedia false`, `FOUR_PLUS`. No new review submission listed.

### TestFlight smoke (J performs, C records)
- [ ] Spec 05 TestFlight smoke (`docs/RELEASING.md`), recording pass/fail for each:
  - [ ] Cold launch, then sign in (QA manager)
  - [ ] Home hours/earnings load; Overview Personal/Team toggle; Patterns card renders
  - [ ] Approve one QA item; reject one with a reason
  - [ ] Settings → About: Privacy Policy and Support open in the in-app browser. The version row reads `Version <version> (<N>)` with `Update: embedded`.
  - [ ] Widgets: add small, medium and large; each shows data; tapping one opens the app (expo-widgets 55.0.5 on the newer expo-modules-core)
  - [ ] Widget refresh on open: opening the app updates the widget (the silent push doesn't refresh the widget (no `registerTaskAsync` task; `addNotificationReceivedListener` only hears foreground `willPresent`), so don't wait for a cron tick)
  - [ ] A local deadline notification fires, and tapping it routes correctly
  - [ ] Sign Out clears data, and the relay token is removed

### User-only steps (J)
- [ ] §Native "User-only steps". These include confirming that the demo account in App Review Information signs in on build `<N>`.

### Submit (J)
- [ ] J decides, only after every smoke item passes, per §Native "Submit": `node .appstore/asc.js submit-app-review <buildN-id>` (dry-run first) or the ASC Submit button. Claude doesn't run `submit-app-review` live on its own.

### Post-release (C)
- [ ] **Addition to §Native** (spec 06 convention): `git tag build-<N> <sha> && git push origin build-<N>`, using the commit SHA recorded at Build. Confirm with `git ls-remote --tags origin build-<N>`.
- [ ] §Native "Post-release": spec 04 runbook A baseline OTA from the `build-<N>` tree (its step 1 cross-checks the `build-<N>` tag). After two cold starts, the version row shows `Update: <id>`. Also do any OPS O8–O10 item that is still open.

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19**: Spec drafted. Facts verified against the tree on 2026-10-19:
- **Installed versions:** expo 55.0.7, react-native 0.83.2, expo-widgets 55.0.5, reanimated 4.2.1, worklets 0.7.2, @expo/ngrok 4.1.3, patch-package 8.0.1, @expo/cli 55.0.17.
- **`expo install --check`:** remote list flags 26 packages (24 once spec 03 lands). It flags neither expo-widgets (not on the SDK 55 list) nor reanimated (expected exactly 4.2.1).
- **expo-doctor 1.21.5:** 18/20 checks pass. The 2 failures are schema (spec 03) and versions (this spec).
- **`expo.install.exclude`:** supported by @expo/cli 55.0.17 and by 55.0.36, which `expo@55.0.31` ships.
- **patch-package strict flags:** `npx patch-package --error-on-fail --error-on-warn` exits 0 with both patches ✔ on the current tree.

**2026-10-20 (Phase 1.0)**: tests written, red phase confirmed.
- **Branch / branch point:** orchestrator-assigned `feat/dependency-hygiene`, cut from `feat/store-compliance-build18` @ `1a9550c` (not `chore/06-dependency-hygiene` from `main`). Worktree `hg-worktrees/deps`. Not to be merged until FR7 preconditions hold.
- **Preconditions:** spec 03 merged on this base (`expo-background-fetch` / `expo-task-manager` both `undefined`). Spec 04 merged (`runtimeVersion` = `{"policy":"fingerprint"}`). Spec 05: `docs/RELEASING.md` §Native exists, but "build 18 submitted" can't be verified offline, so it's left unticked. `app.json` is at `1.1.0` / build `18`.
- **Spec 07 status: NOT on this branch.** There's no `scripts.typecheck` and no `@types/node`; spec 07 lives on `feat/ci-typecheck-lint`. Until this branch is rebased onto a base that has spec 07, the gate is research Decision 3 (`npm test` against the baseline, no `tsc` chain). Expected side effect: `tsc` reports 3 errors in `deps.test.ts` (TS2307 `fs`/`path`, TS2304 `__dirname`). These are the same missing-`@types/node` errors that `__tests__/approval-card.test.tsx` and `__tests__/config/fingerprint-config.test.ts` already have. With `types: ["jest","node"]` (a temp tsconfig, not committed), `deps.test.ts` typechecks with 0 errors.
- **Baselines (branch point, before any package change):**
  - `npm ci`: exit 0, `patch-package 8.0.1`, `expo-widgets@55.0.5 ✔`, `react-native-reanimated@4.2.1 ✔`, no `patch-package finished with`.
  - `npx jest --silent`: without `deps.test.ts`, 4953 passed / 1 failed (`NativeWindSmoke.test.tsx`, the known out-of-repo read). With `deps.test.ts`, 4973 passed / 14 failed (the 13 red tests below + NativeWindSmoke).
  - `npx tsc --noEmit`: 541 errors without `deps.test.ts`, 544 with it (the +3 above). `npx expo lint`: 9 errors / 494 warnings, the same with or without `deps.test.ts`. `npx eslint __tests__/config/deps.test.ts` is clean, so both `eslint-disable-next-line` directives are used.
  - **fingerprint-before** (ios): `a0123e904dabf5610e315a75f845005f5f814b5c`.
  - Introspect before: `/tmp/06-introspect-before.json` (`UIBackgroundModes` = `["remote-notification"]`, `NSFaceIDUsageDescription` absent).
  - `CI=1 expo install --check --json`: exit 1, **24 entries**. These match the spec's FR5 table exactly (expo 55.0.7→~55.0.31 … jest-expo 55.0.11→~55.0.22; react-native 0.83.2→0.83.10, react-native-worklets 0.7.2→0.7.4). Neither expo-widgets nor reanimated is flagged. Saved to `/tmp/06-check-before.json`.
- **Red phase (`npx jest __tests__/config/deps.test.ts`): 33 tests, 13 failed, 20 passed.** Every failure is an assertion on current tree state; none is a syntax, import or `require` error:
  - FR1: exact pin (received `^55.0.5`). Real-data `collectPatchProblems` returns `expo-widgets: declared "^55.0.5" must be exactly "55.0.5" (expo-widgets+55.0.5.patch)`.
  - FR2: postinstall argv is `["patch-package"]`.
  - FR3: `@expo/ngrok` is in `dependencies` (`^4.1.0`), and there are 15 `node_modules/@expo/ngrok*` lock keys.
  - FR4: both exclude tests receive `undefined`.
  - FR5: all 6 lockfile floors fail: expo 55.0.7, react-native 0.83.2, expo-notifications 55.0.13, expo-updates 55.0.15, jest-expo 55.0.11, worklets 0.7.2.
  - Passing as designed (pure logic): 11 `collectPatchProblems` fixtures and 7 `versionAtLeast` units.
  - Green on today's tree as guards/characterization (behaviour already present): "patches/ has ≥ 1 file and every filename parses", and "patch-package stays a devDependency".
- **Deviations from the spec text (no contract change):**
  1. Real-data `collectPatchProblems` reports only **rule 3** today, not "rules 3 and 6". `package.json` and the lock root are both `^55.0.5`, so they agree. Rule 6 fires only when `package.json` is edited without regenerating the lockfile; a fixture covers it.
  2. There are 15 `node_modules/@expo/ngrok*` lock keys on this base, not 16.
  3. The file uses `import * as fs` / `import * as path`, matching `approval-card.test.tsx` and `fingerprint-config.test.ts`, instead of the spec sketch's default imports.
  4. Extra tests beyond the plan:
     - two positive controls (aligned tree; scoped exact-pinned devDependency, `@scope+tool+2.1.0.patch`)
     - rule 3 with an exact pin at a different version
     - nested-path lock drift
     - `versionAtLeast` cases `('0.83.2','0.83.10')` false and `('56.0.0','55.0.31')` true, plus a throw on non-`x.y.z` input (so `NaN` comparisons can't pass silently)
     - the `55.` line asserted for expo-notifications, expo-updates and jest-expo as well
  5. The second exclude test is non-vacuous: a missing or empty `exclude` fails it.
  6. Rule 6 compares against the same lock-root section (`dependencies` vs `devDependencies`) that declares the package in `package.json`.
