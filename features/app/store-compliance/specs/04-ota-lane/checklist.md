# Implementation Checklist

Spec: `04-ota-lane`
Feature: `store-compliance`

Phases 1.0–1.2 go into the implementation PR, which ships in build 18. Phase 1.3 (FR4) can only run after build 18 is READY_FOR_SALE. It closes OPS O11.

> Run only the targeted test files listed below. Don't run the full jest suite as part of these steps; CI runs it.

---

## Phase 1.0: Test Foundation

### FR1: Fingerprint runtime policy and version sync
- [ ] Open `__tests__/config/app-config.test.ts`. If spec 03 hasn't landed, create it with spec 03's contract header: `import type { ExpoConfig } from 'expo/config'`, `import appJson from '@/app.json'`, `import pkg from '@/package.json'`, `const expo = appJson.expo as unknown as ExpoConfig`. Follow spec 03's test-file contract: **no `fs`, no `path`, no `package-lock.json` import** in this file. Append a top-level `describe('app.json — 04 OTA lane')` with a nested `describe('FR1: fingerprint runtime policy')` containing:
  - [ ] `expo.runtimeVersion` deep-equals `{ policy: 'fingerprint' }`
  - [ ] `expect(expo.ios).not.toHaveProperty('runtimeVersion')` and `expect(expo.android).not.toHaveProperty('runtimeVersion')`
  - [ ] `pkg.version === expo.version`
  - [ ] `expo.updates.url === 'https://u.expo.dev/' + expo.extra.eas.projectId`
- [ ] Run `npx jest __tests__/config/app-config.test.ts`. The policy assertion and the `pkg.version` assertion must fail (red) before implementation. Spec 03's assertions keep whatever status they had.
- [ ] The lockfile root-version assertions go in `fingerprint-config.test.ts` (FR2 below), not here.

### FR2: Fingerprint scope
- [ ] Create `__tests__/config/fingerprint-config.test.ts` with `ROOT = path.resolve(__dirname, '../..')` and `import appJson from '@/app.json'`. It contains:
  - [ ] `describe('FR1: lockfile root version')`: `const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'))`. Assert `lock.version` and `lock.packages[''].version` each equal `appJson.expo.version`. Assert nothing else in the lockfile. This lives here, not in `app-config.test.ts`, because spec 03's contract bans `fs` and lockfile imports there, and `npm ci` doesn't catch root-version drift (measured).
  - [ ] `require('../../fingerprint.config.js')` deep-equals `{ sourceSkips: [...] }`, and the sorted `sourceSkips` equal `['ExpoConfigVersions', 'GitIgnore', 'PackageJsonScriptsAll']`
  - [ ] For every entry, `typeof SourceSkips[entry] === 'number'`, with `SourceSkips` imported from `expo/fingerprint`. This guards against typos, because `normalizeSourceSkips` silently drops unknown names.
  - [ ] Read `.fingerprintignore` and keep lines that are trimmed, non-empty and don't start with `#`. The result must equal `['eas.json']`.
- [ ] Run `npx jest __tests__/config/fingerprint-config.test.ts`. The FR2 assertions should fail because the files are missing, and the FR1 lockfile assertions should fail because both root fields read `1.0.0`.

### FR3: Guarded publish script
- [ ] Create `__tests__/scripts/ota-publish.test.ts` with the harness from spec.md, Technical Design → "Test harness for FR3":
  - [ ] `repo` and `stubs` as sibling dirs from `fs.mkdtempSync(os.tmpdir())`. Copy the real script into `repo/scripts/`. Write `repo/app.json` (`1.1.0` / `"18"`), then `git init` and commit with `-c user.name -c user.email -c commit.gpgsign=false`.
  - [ ] `stubs/npx` and `stubs/eas` (chmod 755) log `CALL`, `ARG <each>` and `ENV EXPO_NO_DOTENV=` lines to `$STUB_LOG`. Their output comes from `STUB_RTV_JSON/EXIT`, `STUB_BUILDS_JSON/EXIT` and `STUB_UPDATE_JSON/EXIT`.
  - [ ] Spawn with `bash <script>`, `cwd: os.tmpdir()`, `PATH = stubs:$PATH`. Remove the temp dirs in `afterEach`.
- [ ] Usage refusals. Each case exits 1, stderr contains `Usage:`, and the log has no `npx` or `eas` calls:
  - [ ] no args
  - [ ] `"   "` (whitespace only)
  - [ ] two positional args (`fix` `thing`)
  - [ ] unknown flag `--force "msg"`
- [ ] Dirty tree: a modified tracked file (`app.json`) → exit 1, `uncommitted changes`, no `npx`/`eas` calls
- [ ] Dirty tree: an untracked file only → exit 1, `uncommitted changes`, no `npx`/`eas` calls
- [ ] Stubbed runtime `{"runtimeVersion":"1.1.0",...}` → exit 1, `is not a fingerprint hash`, no `eas` calls
- [ ] Runtime resolver exits 1 → exit 1, no `eas` calls
- [ ] `build:list` returns `[]` → exit 1, stderr contains `no finished iOS build on channel "production" has runtime 7e91e3c1…`. No `eas update` call. The logged `build:list` argv includes `--platform` `ios`, `--status` `finished`, `--channel` `production`, `--runtime-version` `<rtv>` and `--json`.
- [ ] `build:list` exits 1 → exit 1, no `eas update` call
- [ ] Happy path → exit 0. `eas update` is called exactly once, and its argv equals `update --channel production --environment production --platform ios --message <msg> --json --non-interactive`. The logged env has `EXPO_NO_DOTENV=1`. stdout contains `OTA published`, the runtime, the group id, the iOS update id and `Update: 019e0000`.
- [ ] The message `fix: "Approve" button` arrives as a single `ARG` line, byte for byte
- [ ] `--dry-run "msg"` → exit 0, stdout contains `Dry run OK` and `eas update --channel production`, no `eas update` call
- [ ] Build `appBuildVersion: "17"` vs app.json `"18"` → exit 0, stderr contains `WARNING:`, `eas update` still called
- [ ] `STUB_UPDATE_EXIT=3` → exit 3, stdout doesn't contain `OTA published`
- [ ] Update JSON with a different `runtimeVersion` → exit 1, stderr contains `ERROR: eas published to runtime`
- [ ] `fs.statSync('scripts/ota-publish.sh').mode & 0o111` is non-zero, and the first line is `#!/usr/bin/env bash`
- [ ] Run `npx jest __tests__/scripts/ota-publish.test.ts`. Everything should fail because the script is missing.

### FR4: Baseline OTA (post-release)
- [ ] No automated test. This FR is a manual end-to-end check in Phase 1.3, and FR3's tests cover its guard logic. Confirm Phase 1.3 is present and that OPS O11 points at it.

### FR5: Release runbook
- [ ] No jest test (documentation). Write down the verification commands to run in Phase 1.1 (listed under FR5 there).

---

## Test Design Validation (MANDATORY)

⚠️ **Validate the test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run the `red-phase-test-validator` agent
- [ ] Every FR1–FR3 success criterion has test coverage. FR2's sensitivity matrix and FR1's introspection check are command checks in 1.1, by design (too slow for jest).
- [ ] Assertions are specific: exact argv arrays, exact stderr substrings from the spec's Interface Contracts, exact exit codes, and "no call" assertions on the stub log for every refusal.
- [ ] Stub fixtures match the verified eas-cli 20.1.0 JSON shapes: `build:list` returns raw BuildFragment objects with `runtimeVersion`/`appVersion`/`appBuildVersion`; `update` returns an array with `id`/`group`/`platform`/`runtimeVersion`.
- [ ] Stubs live outside the temp repo, so they can't make the tree dirty
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Fingerprint runtime policy and version sync
- [ ] `app.json`: replace `"runtimeVersion": { "policy": "appVersion" }` with `{ "policy": "fingerprint" }`. Add no `ios`/`android` override, and leave `updates.url` untouched.
- [ ] `npm version 1.1.0 --no-git-tag-version`. Confirm `package.json` and both `package-lock.json` root version fields read `1.1.0`, and nothing else in the lockfile changed (`git diff --stat package-lock.json` shows 2 lines changed).
- [ ] `npx jest __tests__/config/app-config.test.ts` passes
- [ ] `npx jest __tests__/config/fingerprint-config.test.ts -t 'FR1'` passes (lockfile root version). The FR2 assertions in the same file go green under FR2 below.
- [ ] `grep -nE "readFileSync|__dirname|package-lock|from ['\"](node:)?(fs|path)['\"]" __tests__/config/app-config.test.ts` prints nothing (spec 03 test-file contract). At this point the file holds only the spec 03 and spec 04 blocks; spec 05 is blocked until this spec merges.
- [ ] `npx expo-updates runtimeversion:resolve --platform ios`: `runtimeVersion` matches `/^[0-9a-f]{40}$/` and `workflow` is `"managed"`. Paste the output into Session Notes.
- [ ] Introspection check:
  ```bash
  npx expo config --type introspect --json | node -e 'const c=JSON.parse(require("fs").readFileSync(0,"utf8"))._internal.modResults.ios.expoPlist; console.log(c)'
  ```
  Expect `EXUpdatesRuntimeVersion: 'file:fingerprint'`, `EXUpdatesCheckOnLaunch: 'ALWAYS'`, `EXUpdatesLaunchWaitMs: 0`, and `EXUpdatesURL: 'https://u.expo.dev/4ad8a6bd-aec2-45a5-935f-5598d47b605d'`.

### FR2: Fingerprint scope
- [ ] Create `fingerprint.config.js`. Use exactly `module.exports = { sourceSkips: ['ExpoConfigVersions', 'PackageJsonScriptsAll', 'GitIgnore'] }` plus the JSDoc `@type {import('expo/fingerprint').Config}` and a one-line *why* comment per entry.
- [ ] Create `.fingerprintignore`: comment lines explaining why, then the single pattern `eas.json`. Don't add `features/**`, `docs/**` and similar; they aren't fingerprint sources.
- [ ] `npx jest __tests__/config/fingerprint-config.test.ts` passes
- [ ] Sensitivity matrix. Run it in a scratch worktree, never in the working tree, after committing FR1 and FR2:
  ```bash
  ROOT="$(pwd)"; WT=/tmp/ota-matrix; git worktree add --detach "$WT" HEAD && ln -s "$ROOT/node_modules" "$WT/node_modules" && cd "$WT"
  rtv(){ npx expo-updates runtimeversion:resolve --platform ios | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).runtimeVersion'; }
  BASE=$(rtv); echo "base $BASE"
  # after each edit: echo "<label> $(rtv)"; git checkout -- . && git clean -fdq -e node_modules   # -e keeps the symlink
  ```
  The following must equal `$BASE`. Record each value.
  - [ ] `ios.buildNumber` → `"99"`
  - [ ] `version` → `"9.9.9"`
  - [ ] add a script `"foo": "echo foo"` to `package.json` `scripts`
  - [ ] `eas.json` `submit.production.ios.ascApiKeyId` → `"NEWKEY1234"`
  - [ ] append `tmp-junk/` to `.gitignore`
  - [ ] new files `features/x.md`, `docs/y.md`, `site/z.html`

  The following must differ from `$BASE`:
  - [ ] remove `"fetch"` from `ios.infoPlist.UIBackgroundModes`. If spec 03 already removed it, add `"audio"` instead.
  - [ ] change `"expo-secure-store"` to `["expo-secure-store", { "faceIDPermission": false }]`. If spec 03 already did this, set `faceIDPermission` to a string instead.
  - [ ] append a line to `patches/expo-widgets+55.0.5.patch`

  Clean up: `cd "$ROOT" && git worktree remove --force "$WT"`.

### FR3: Guarded publish script
- [ ] Create `scripts/ota-publish.sh` per the spec (steps 1–8, exact stderr and stdout strings, bash 3.2 compatible, `node` for JSON). `chmod 755`, and confirm `git ls-files -s scripts/ota-publish.sh` shows `100755`.
- [ ] `bash -n scripts/ota-publish.sh` passes. Also run `shellcheck scripts/ota-publish.sh` if it's installed, with no errors.
- [ ] `npx jest __tests__/scripts/ota-publish.test.ts` passes
- [ ] Prove the `.env.local` leak and the fix (skip this if `.env.local` has no `EXPO_PUBLIC_DEV_USERNAME`):
  ```bash
  V=$(sed -n 's/^EXPO_PUBLIC_DEV_USERNAME=//p' .env.local)
  npx expo export --platform ios --output-dir /tmp/ota-leak-on  >/dev/null && grep -rlF "$V" /tmp/ota-leak-on | wc -l   # expect >= 1 (control)
  EXPO_NO_DOTENV=1 npx expo export --platform ios --output-dir /tmp/ota-leak-off >/dev/null && grep -rlF "$V" /tmp/ota-leak-off | wc -l   # expect 0
  rm -rf /tmp/ota-leak-on /tmp/ota-leak-off
  ```
  Record both counts in Session Notes. Don't record the value itself.
- [ ] Live dry run against EAS (needs an EAS login) on the PR branch with a clean tree: `scripts/ota-publish.sh --dry-run "check"`. **Expected before build 18 exists:** exit 1 with `no finished iOS build on channel "production" has runtime <hash>`. Paste the output into Session Notes.

### FR5: Release runbook
- [ ] Create `docs/RELEASING.md` with `# Releasing Hourglass` (intro naming both lanes and saying spec 05 appends `## Native release`) and `## OTA updates`. Don't create a `## Native release` heading; spec 05 FR6 appends it. `## OTA updates` contains `### A.` baseline, `### B.` 1.0.0 emergency (from `e7fb801`, no literal runtime on main), `### C.` OTA-safe check, `### D.` rollback and `### E.` the fork table with its caveat row. Add the notes on config-file changes, `npm version` bumps and committed `.env*` files.
- [ ] `grep -c '^## OTA updates$' docs/RELEASING.md` prints `1`, and `grep -c '^## Native release' docs/RELEASING.md` prints `0`
- [ ] `grep -c '^### [A-E]\. ' docs/RELEASING.md` prints `5`
- [ ] `grep -n 'expo-fingerprint' docs/RELEASING.md` prints nothing
- [ ] Each term is present: `for t in 'scripts/ota-publish.sh' 'EXPO_NO_DOTENV=1' 'runtimeversion:resolve --platform ios' 'e7fb801' 'roll-back-to-embedded' 'fingerprint:compare'; do grep -qF "$t" docs/RELEASING.md || echo "MISSING $t"; done` prints nothing
- [ ] Spot-check that every `eas …` command in the doc parses: `eas <cmd> --help` lists every flag the doc uses (eas-cli 20.1.0)

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run the `spec-implementation-alignment` agent
- [ ] All FR1, FR2, FR3 and FR5 success criteria verified in code or command output. FR4 is deferred to Phase 1.3.
- [ ] Interface contracts match the implementation: config shapes, script argv order, stderr/stdout strings, exit codes
- [ ] Spec 03's test-file contract holds for the spec 04 block in `app-config.test.ts`: typed JSON imports only, `describe('app.json — 04 OTA lane')`, `not.toHaveProperty` for absence. The lockfile reads are only in `fingerprint-config.test.ts`
- [ ] No scope creep: no foreground update checks, no Android publish, no `package.json` script additions, no app source changes
- [ ] No shortfall

### Step 1: Comprehensive PR Review
- [ ] Run the `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why they're deferred)
- [ ] Re-run the three targeted test files after fixes
- [ ] Commit fixes: `fix(04-ota-lane): {description}`

### Step 3: Test Quality Optimization
- [ ] Run the `test-optimiser` agent on the three new or modified test files
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run the tests to confirm they pass
- [ ] Commit if changes were made: `fix(04-ota-lane): strengthen test assertions`

### Final Verification
- [ ] `npx jest __tests__/config/app-config.test.ts __tests__/config/fingerprint-config.test.ts __tests__/scripts/ota-publish.test.ts` passes
- [ ] No regressions: CI `npm test` is green on the PR. Don't run the full suite locally as part of this checklist.
- [ ] If spec 07 has merged: `npm run typecheck` and `npm run lint` pass with the new files
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` on the final PR head prints a 40-hex runtime
- [ ] The code follows existing patterns (CJS config like `babel.config.js`; tests under `__tests__/`)

---

## Phase 1.3: Post-release verification: FR4 Baseline OTA (closes OPS O11)

⚠️ Runs **after** build 18 is READY_FOR_SALE. It doesn't block merging the PR. It does block ticking OPS O11 and calling the FEATURE goal "OTA hotfixes actually reach installed users" met.

- [ ] Pre-release (during spec 05's TestFlight smoke): the build 18 Settings row shows `Update: embedded`
- [ ] Get build 18's metadata:
  ```bash
  eas build:list --platform ios --status finished --channel production --app-build-version 18 --limit 1 --json --non-interactive
  ```
  Record `id`, `runtimeVersion` and `gitCommitHash`.
- [ ] `git cat-file -t <gitCommitHash>` prints `commit`. If it doesn't, stop: the build tree is unknown, so investigate before publishing.
- [ ] `git switch --detach <gitCommitHash> && npm ci`
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` equals the build's `runtimeVersion`. This is the FR2 determinism criterion.
- [ ] `scripts/ota-publish.sh --dry-run "baseline: build 18 (v1.1.0)"` → `Dry run OK`, with no `WARNING:`
- [ ] `scripts/ota-publish.sh "baseline: build 18 (v1.1.0)"` → `OTA published`. Record the runtime, group and iOS update id.
- [ ] Device with the App Store install: force-quit and relaunch twice, then open Settings. The row shows `Update: <first 8 chars of the iOS update id>`.
- [ ] If it still shows `embedded` after 3 cold starts: **stop**, don't republish. Check `eas update:list --branch production --json --non-interactive` and `eas update:insights <group> --platform ios`, and record what you find.
- [ ] Optional: within 48 h, `eas update:insights <group> --platform ios --json` shows at least 1 launch
- [ ] `git switch main`
- [ ] Record everything in Session Notes, then tick OPS O11 in `OPS.md`

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19**: Spec drafted. Research corrections are listed in spec.md under "Verified Facts". The main ones:
- Under default settings, the fingerprint includes `version`, `buildNumber`, `package.json` scripts, `.gitignore` and `eas.json`. FR2 adds `fingerprint.config.js` and an `eas.json`-only `.fingerprintignore`; the research's ignore patterns did nothing.
- `npx expo-fingerprint` returns npm 404. Use `npx expo-updates runtimeversion:resolve --platform ios`.
- Build 15's EAS commit `1b45a8a` isn't in the repo. Runbook §B branches from `e7fb801`.
- `.env.local` would leak `EXPO_PUBLIC_DEV_USERNAME` into an OTA bundle, so the script publishes with `EXPO_NO_DOTENV=1`.
- spec-research.md was amended to match: Decision 2 and its `.fingerprintignore` contract (`eas.json` only, verified with `runtimeversion:resolve`), and runbook §B (branch from `e7fb801`, never a literal `1.0.0` on main) and §C. The original proposals are kept under its Corrections section. If the two documents disagree, follow spec.md.

**2026-10-19 (revision)**: Validator finding: FR1's lockfile assertions clashed with spec 03's test-file contract for `app-config.test.ts` (no `fs`, no `package-lock.json` import). Moved the two lockfile root-version assertions into `fingerprint-config.test.ts` (`describe('FR1: lockfile root version')`, `fs.readFileSync` + `JSON.parse`, root fields only). `app-config.test.ts` keeps `pkg.version === expo.version` through the `@/package.json` import. The spec 04 block there was also renamed to spec 03's reserved `describe('app.json — 04 OTA lane')` and now uses `not.toHaveProperty` for the absence checks. The lockfile test is still needed: in a scratch dir, `npm ci` with `package.json` `1.1.0` and a lockfile root of `1.0.0` exited 0 and didn't rewrite the lockfile.
