# Implementation Checklist

Spec: `03-native-config-cleanup`
Feature: `store-compliance`

All commands run from the app repo root `hourglassws/`. macOS has no `timeout` binary, so don't wrap commands in it.

---

## Phase 1.0: Test Foundation

### Baseline (CLAUDE.md no-break ritual)
- [x] Run `npx jest src/__tests__/notifications src/__tests__/widgets native-tabs` and record the result (expect 6 suites green). Jest treats path args as regexes, so use `native-tabs`, not `app/(tabs)/…`
- [x] Record the baseline introspection with the canonical one-liner from spec.md → Interface Contracts. Expected today: `{"bg":["remote-notification","fetch"],"faceId":"Allow $(PRODUCT_NAME) to access your Face ID biometric data.","newArch":true,"edge":true,"bf":true,"tm":true,"ud":null}`
- [x] Confirm `npx jest --listTests __tests__/config` will list the new files once created. `testMatch` is `**/__tests__/**/*.test.ts`; `/server/` and `/node_modules/` are the only ignores

### Shared test scaffolding (`__tests__/config/app-config.test.ts`, new)
- [x] Create the file per spec.md → Test-file contract: `import type { ExpoConfig } from 'expo/config'`, `import appJson from '@/app.json'`, `import pkg from '@/package.json'`, `const expo = appJson.expo as unknown as ExpoConfig`, and a module-level `pluginEntries(name)` helper
- [x] Wrap everything in `describe('app.json — 03 native config cleanup', …)` with one nested `describe` per FR, named with an `FRn:` prefix (e.g. `describe('FR2: no fetch background mode', …)`) so `npx jest … -t FR2` works. Specs 04 and 05 append sibling top-level `describe` blocks
- [x] Use `not.toHaveProperty('<key>')` for absence checks and `Object.keys(pkg.dependencies)` / `Object.keys(pkg.devDependencies)` for dependency checks. Don't use `fs` and don't import `package-lock.json`

### FR1: Remove schema-invalid config keys
- [x] Test: `expo` has no `newArchEnabled` property
- [x] Test: `expo.android` has no `edgeToEdgeEnabled` property
- [x] Guard test: `expo.android?.predictiveBackGestureEnabled === false` (passes today; catches over-deletion)

### FR2: Remove the unused `fetch` background mode
- [x] Test: `expo.ios?.infoPlist?.UIBackgroundModes` deep-equals `['remote-notification']`
- [x] Test: neither `Object.keys(pkg.dependencies)` nor `Object.keys(pkg.devDependencies)` contains `expo-background-fetch`
- [x] Test: same for `expo-task-manager`

### FR3: Remove the Face ID usage description
- [x] Test: `pluginEntries('expo-secure-store')` has length 1 (catches a leftover string entry, which would win under run-once and bring the key back)
- [x] Test: that single entry deep-equals `['expo-secure-store', { faceIDPermission: false }]` (exact, so no `configureAndroidBackup` override)
- [x] Test: `expo.ios?.infoPlist` has no `NSFaceIDUsageDescription`
- [x] Guard test: `expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === false` (passes today)

### FR4: Declare the app-level privacy manifest
- [x] Test: `expo.ios?.privacyManifests` deep-equals the exact contract object in spec.md (declare it as a `const EXPECTED_PRIVACY_MANIFEST` in the test; array order matters)
- [x] Test: the `NSPrivacyAccessedAPICategoryUserDefaults` entry's reasons deep-equal `['CA92.1', '1C8F.1']`
- [x] Test: the `NSPrivacyAccessedAPICategorySystemBootTime` entry's reasons deep-equal `['35F9.1']`
- [x] Test: `NSPrivacyTracking === false` and `NSPrivacyTrackingDomains` deep-equals `[]`
- [x] Test: no `NSPrivacyAccessedAPIType` equals `NSPrivacyAccessedAPICategoryActiveKeyboards`
- [x] Test: `NSPrivacyCollectedDataTypes` has exactly one entry, `NSPrivacyCollectedDataTypeDeviceID`, with `Linked: false`, `Tracking: false`, purposes `['NSPrivacyCollectedDataTypePurposeAppFunctionality']`

### FR5: Automated resolved-config regression guard (`__tests__/config/app-config-introspect.test.ts`, new)
- [x] Create the suite with `ROOT = path.resolve(__dirname, '../..')`. In `beforeAll(…, 60_000)`, run `execFileSync(process.execPath, [path.join(ROOT, 'node_modules/expo/bin/cli'), 'config', '--type', 'introspect', '--json'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, EXPO_NO_TELEMETRY: '1' }, maxBuffer: 32 * 1024 * 1024 })` and `JSON.parse` the stdout. Type the result as `ExpoConfig & { _internal: { pluginHistory: Record<string, unknown> } }`. Don't catch errors: a CLI failure must fail the suite
- [x] Non-vacuity guard: `ios.infoPlist.ExpoWidgetsAppGroupIdentifier === 'group.com.jalvarez0907.hourglass.widgets'` (passes today)
- [x] Non-vacuity guard: `_internal.pluginHistory` has keys `expo-secure-store` and `expo-notifications` (passes today)
- [x] Test (FR2): `ios.infoPlist.UIBackgroundModes` deep-equals `['remote-notification']`
- [x] Test (FR2): `_internal.pluginHistory` has neither `expo-background-fetch` nor `expo-task-manager` as a key
- [x] Test (FR3): `ios.infoPlist.NSFaceIDUsageDescription` is `undefined`
- [x] Test (FR1): resolved config has no top-level `newArchEnabled` and no `android.edgeToEdgeEnabled`
- [x] Test (FR4): `ios.privacyManifests` deep-equals `appJson.expo.ios.privacyManifests`, and its UserDefaults reasons contain `1C8F.1`

### Red phase run
- [x] `npx jest __tests__/config`: every FR assertion fails and every guard passes (`predictiveBackGestureEnabled`, `ITSAppUsesNonExemptEncryption`, `ExpoWidgetsAppGroupIdentifier`, `pluginHistory` has `expo-secure-store`/`expo-notifications`). If a guard fails, fix the test before going on
- [x] Commit: `test(03-native-config-cleanup): add app config regression suites (red)`

### FR6: Fix documentation drift
- [x] No Jest test (docs only). Verified by the grep commands in Phase 1.1 → FR6

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage (FR1–FR5 in Jest; FR1 doctor, FR2 lockfile, FR2–FR4 prebuild and FR6 greps are command checks in Phase 1.1)
- [ ] Assertions are specific: exact `toEqual` on arrays and objects, `toHaveLength(1)` on the secure-store entry, and no bare `toBeDefined()` or `toContain('remote-notification')` (which would miss a leftover `fetch`)
- [ ] The introspection suite's non-vacuity guards pass in the red phase, proving plugins actually ran
- [ ] Mocks: none. Both suites read the real `app.json`/`package.json`, and the introspection suite runs the real CLI
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Remove schema-invalid config keys
- [ ] Delete `"newArchEnabled": true,` (`app.json:10`)
- [ ] Delete `"edgeToEdgeEnabled": true,` (`app.json:36`); leave `predictiveBackGestureEnabled` alone
- [ ] Run `npx jest __tests__/config/app-config.test.ts -t FR1`: green

### FR2: Remove the unused `fetch` background mode
- [ ] Set `expo.ios.infoPlist.UIBackgroundModes` to `["remote-notification"]` (keep the multi-line array formatting)
- [ ] Run `npm uninstall expo-background-fetch expo-task-manager`
- [ ] Lockfile check prints `lockfile OK`:
  `node -e 'const l=require("./package-lock.json");const bad=["expo-background-fetch","expo-task-manager","unimodules-app-loader"].filter(n=>l.packages["node_modules/"+n]);const root=Object.keys({...l.packages[""].dependencies,...l.packages[""].devDependencies}).filter(n=>n==="expo-background-fetch"||n==="expo-task-manager");console.log(bad.length||root.length?"FAIL "+JSON.stringify({bad,root}):"lockfile OK")'`
- [ ] `git diff package-lock.json | grep -E '^\+[^+]'` prints nothing (deletions only). If anything prints, `git checkout package.json package-lock.json`, run `npm ci`, and redo the uninstall. Don't accept other version changes (spec 06)
- [ ] `git diff package.json` shows exactly 2 removed lines (old lines 32 and 50)
- [ ] Import sweep prints nothing:
  `grep -rIn 'expo-background-fetch\|expo-task-manager\|TaskManager\.\|registerTaskAsync' app src components hooks scripts tools --include='*.ts' --include='*.tsx' --include='*.js'`
- [ ] Run `npx jest __tests__/config/app-config.test.ts -t FR2`: green

### FR3: Remove the Face ID usage description
- [ ] Replace `"expo-secure-store",` (`app.json:94`) at the same index with `["expo-secure-store", { "faceIDPermission": false }]`, formatted like the neighboring tuple entries
- [ ] Confirm no other `expo-secure-store` entry remains: `grep -c '"expo-secure-store"' app.json` prints `1`
- [ ] Run `npx jest __tests__/config/app-config.test.ts -t FR3`: green

### FR4: Declare the app-level privacy manifest
- [ ] Insert `"privacyManifests": { … }` (exact contract object) inside `expo.ios`, between `entitlements` and `buildNumber`. Don't touch the `buildNumber` line
- [ ] `node -e 'JSON.parse(require("fs").readFileSync("app.json","utf8"))'` exits 0 (valid JSON)
- [ ] Run `npx jest __tests__/config/app-config.test.ts -t FR4`: green

### FR5: Resolved-config guard goes green
- [ ] Run `npx jest __tests__/config`: both suites green; the introspection suite finishes in under 10 s
- [ ] The canonical introspection one-liner prints exactly `{"bg":["remote-notification"],"faceId":null,"newArch":false,"edge":false,"bf":false,"tm":false,"ud":["CA92.1","1C8F.1"]}`

### Native verification (command checks for FR1–FR4)
- [ ] **expo-doctor (FR1):** `npx expo-doctor > /tmp/doctor.txt 2>&1; grep -c '✖ Check Expo config' /tmp/doctor.txt` prints `0`. The only expected failure is "Check that packages match versions required by installed Expo SDK" (spec 06), and its table no longer lists `expo-background-fetch` or `expo-task-manager`. Doctor exits 1 because of that check, so don't chain with `&&`
- [ ] **Prebuild (FR2–FR4):** confirm `git check-ignore -v ios/` prints `.gitignore:60:/ios`, then run `CI=1 npx expo prebuild -p ios --clean --no-install`
  - [ ] `plutil -extract UIBackgroundModes json -o - ios/Hourglassxo/Info.plist` prints `["remote-notification"]`
  - [ ] `plutil -extract NSFaceIDUsageDescription raw -o - ios/Hourglassxo/Info.plist` reports "No value at that key path"
  - [ ] `plutil -lint ios/Hourglassxo/PrivacyInfo.xcprivacy` prints `OK`
  - [ ] `grep -c '1C8F.1' ios/Hourglassxo/PrivacyInfo.xcprivacy` prints `1`
  - [ ] `grep -c 'PrivacyInfo.xcprivacy' ios/Hourglassxo.xcodeproj/project.pbxproj` prints a number ≥ 1 (4 seen in the dry run)
  - [ ] `git status --porcelain` shows only this spec's intended changes: no `ios/`, and no `package.json` change beyond FR2 (prebuild should report "Updated package.json | no changes")
  - [ ] `rm -rf ios`
- [ ] Commit: `fix(03-native-config-cleanup): drop fetch background mode, Face ID string and invalid keys; add privacy manifest`

### FR6: Fix documentation drift
- [ ] `TECH_STACK.md:10`: architecture row → `New Architecture (mandatory on SDK 55 / RN 0.83; there is no app.json toggle)`
- [ ] `TECH_STACK.md:11`: React Compiler row → `Disabled (\`experiments.reactCompiler: false\`)` (matches `app.json:115`)
- [ ] `TECH_STACK.md:144-145`: delete the `expo-background-fetch` and `expo-task-manager` rows; under the table, add the silent-push-only sentence from spec.md FR6
- [ ] `CLAUDE.md:69`: `Expo SDK 54, React Native 0.81.5` → `Expo SDK 55, React Native 0.83`
- [ ] Each of these prints nothing: `grep -n 'newArchEnabled: true' TECH_STACK.md`; `grep -nE '^\| \*\*expo-(background-fetch|task-manager)\*\*' TECH_STACK.md`; `grep -n 'reactCompiler: true' TECH_STACK.md`; `grep -nE 'SDK 54|0\.81\.5' CLAUDE.md`
- [ ] `grep -n 'Expo SDK 55, React Native 0.83' CLAUDE.md` matches line 69
- [ ] Commit: `docs(03-native-config-cleanup): fix TECH_STACK and CLAUDE.md drift`

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code (FR1–FR6)
- [ ] Interface contracts match the implementation: `app.json` fragments, exact privacy manifest, config contract table, test-file contract (typed JSON imports, top-level `describe` per spec)
- [ ] No scope creep or shortfall: no source changes under `app/`, `src/`, `components/`, `hooks/`, `server/`; no `buildNumber` or `runtimeVersion` change; no other dependency version changes

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes (`npx jest __tests__/config src/__tests__/notifications src/__tests__/widgets native-tabs`)
- [ ] Commit fixes: `fix(03-native-config-cleanup): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on `__tests__/config/app-config.test.ts` and `__tests__/config/app-config-introspect.test.ts`
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(03-native-config-cleanup): strengthen test assertions`

### Final Verification
- [ ] `npx jest __tests__/config src/__tests__/notifications src/__tests__/widgets native-tabs`: all green, same as the Phase 1.0 baseline
- [ ] `npm test`: no new failures. The only allowed pre-existing failure is the out-of-repo `__tests__/components/NativeWindSmoke.test.tsx` (zero failures if spec 07 FR2 has merged)
- [ ] The canonical introspection one-liner prints the expected post-spec JSON (spec 05's pre-flight reuses it)
- [ ] Code follows existing patterns (static config tests sit beside other `__tests__/` suites; no comments beyond what the repo's CLAUDE.md "Comments" rule allows)
- [ ] Hand-offs noted for later specs:
  - [ ] spec 04: take the fingerprint baseline **after** this merges;
  - [ ] spec 05: TestFlight silent-push smoke (already in spec 05 as smoke check 6);
  - [ ] `ITMS-91053` processing-email check (spec.md Out of Scope #5). On 2026-10-19 it had **not** been placed anywhere. Run `grep -rln 'ITMS-91053' features/app/store-compliance/specs/05-release-build-18 features/app/store-compliance/OPS.md`. If it prints a file, the item has been placed. If it prints nothing, paste the item text from Out of Scope #5 into the PR description under "Open hand-offs" and report it to the orchestrator. Don't mark this spec complete while the hand-off is both unplaced and unreported

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19**: Spec drafted. Pre-verified in a /tmp scratch copy (repo untouched): the target `app.json` plus the 2 packages removed from `package.json` gives introspect `UIBackgroundModes: ["remote-notification"]`, no Face ID key, neither package in `pluginHistory`; expo-doctor 1.21.5 schema check passes (19/20); `expo prebuild -p ios --no-install` writes `ios/Hourglassxo/PrivacyInfo.xcprivacy` (lint OK, `1C8F.1` present, referenced in pbxproj). A probe test under the real Jest config confirmed `@/app.json` and `@/package.json` JSON imports work, and that the introspection subprocess runs in about 220 ms.

**2026-10-19 (revision)**: A validator found that Out of Scope #5 deferred the widget-extension `ITMS-91053` check to spec 05, but spec 05 and OPS.md never mention it. Out of Scope #5 now calls it an open hand-off. It gives the exact item text, a decision rule and a recommended home (spec 05 checklist Phase 3.1, after `18 … VALID`). The Final Verification hand-off line gates on it with a grep. Also re-verified that RN's privacy aggregation skips non-`:application` targets, and that the `ExpoWidgets` podspec's resource bundle is empty.

**2026-10-19 (Phase 1.0)**: Both suites written under `__tests__/config/`. Baseline: the 6 regression suites are green (420 tests), and the introspection one-liner matches the expected baseline JSON exactly. Red run (`npx jest __tests__/config/`): 18 failed / 5 passed. All 5 passes are expected: the 4 named guards (`predictiveBackGestureEnabled`, `ITSAppUsesNonExemptEncryption`, `ExpoWidgetsAppGroupIdentifier`, `pluginHistory` has secure-store + notifications), plus the static "`infoPlist` doesn't hard-code `NSFaceIDUsageDescription`" test. That last one is green by construction, because the key comes from the plugin and is never in `app.json`. Its red counterpart is the introspection FR3 test. Two choices to keep the red run honest:
- The FR3 length-1 test also asserts that the single entry is a tuple. A bare `toHaveLength(1)` passes today, since today's lone entry is the string.
- The ActiveKeyboards test also asserts the exact list of four categories. A bare `not.toContain` passes vacuously when there's no manifest.

Green sanity check: in a throwaway `cp -cR` clone in /tmp (since deleted), I applied the target `app.json` and dropped both packages from `package.json`. All 23 tests passed. Note: `npx jest __tests__/config` (no trailing slash) is a regex, so it also matches `__tests__/config-store.test.ts` and `config-types.test.ts`. Use `__tests__/config/` to target only these two suites. `tsc`: the static suite adds 0 errors; the introspection suite adds 3 (`child_process`, `path`, `__dirname`), as expected per Out of Scope #8 (deferred to spec 07). The worktree's own tsc baseline is 529. Full `npx jest --silent`: 4880 passed / 19 failed (18 new red + the pre-existing NativeWindSmoke).
