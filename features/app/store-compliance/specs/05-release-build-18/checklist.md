# Implementation Checklist

Spec: `05-release-build-18`
Feature: `store-compliance`

**Phases:**
- **Phase 1:** tracked repo changes (FR1, FR6). Can be done in a worktree.
- **Phase 2:** local `.appstore/asc.js` (FR2–FR5). Main checkout only, with **no ASC network writes**.
- **Phase 3:** release execution (FR7). Live writes, build and upload. Stops before submission.

**Blocked until:** specs 03 and 04 are merged. They create `__tests__/config/app-config.test.ts` and `docs/RELEASING.md`. If either file is missing, stop.

---

## Phase 1.0: Test Foundation (tracked repo)

### FR1: Build number 18 with a pinned local version source
- [ ] Confirm `__tests__/config/app-config.test.ts` exists (spec 03 merged). If it doesn't, stop.
- [ ] Add `describe('05-release-build-18')`. Follow spec 03's test-file contract (typed JSON imports, no `fs`):
  - Reuse spec 03's module-level `expo` (from `import appJson from '@/app.json'`).
  - Add `import easJson from '@/eas.json'` next to spec 03's imports at the top of the file.
  - Don't use `fs`, `path` or `__dirname`. `tsconfig.json` has `"types": ["jest"]`, so they'd add TS2307/TS2304 until spec 07 FR3.
- [ ] Test: `expo.ios?.buildNumber` is a `string`, matches `/^\d+$/`, and `Number(...) >= 18`. Never `=== '18'`.
- [ ] Test: `expo.version` matches `/^\d+\.\d+\.\d+$/`.
- [ ] Test: `expect(easJson.cli).toHaveProperty('appVersionSource', 'local')`. Don't read `easJson.cli.appVersionSource` directly: that's TS2339 before FR1 adds the key.
- [ ] `git diff __tests__/config/app-config.test.ts | grep -E "^\+.*(from 'fs'|from 'path'|__dirname)"` → nothing.
- [ ] Run `npx jest __tests__/config/app-config.test.ts`. The buildNumber and appVersionSource tests **fail** (red: `"17"`, `undefined`), the semver test passes, and spec 03/04 tests in the file are unaffected.

### FR6: Native release runbook and OPS.md ownership
- [ ] Confirm `docs/RELEASING.md` exists (spec 04 merged). If it doesn't, stop. Save `git show HEAD:docs/RELEASING.md > /tmp/releasing-before.md` for the unchanged-OTA check.
- [ ] Write down the verification commands before writing the doc:
  - `grep -n '^## Native release' docs/RELEASING.md` → exactly 1 match.
  - `grep -n '^### ' docs/RELEASING.md` → Pre-flight, App Store Connect prep (asc.js), Build, Upload, Attach and verify (asc.js), TestFlight smoke, User-only steps, Submit, Post-release, If something fails, in that order (10 headings, after spec 04's). ASC prep must come before Build (OPS O6: public link off before the build lands).
  - `grep -c -- '--dry-run' docs/RELEASING.md` ≥ 1, and `grep -n 'main checkout' docs/RELEASING.md` ≥ 1.
  - `grep -n 'runtimeversion:resolve --platform ios' docs/RELEASING.md` ≥ 1 in the new section, and `grep -n 'expo-fingerprint' docs/RELEASING.md` → nothing (spec 04's check covers the whole file).
  - `grep -n 'ITMS-91053' docs/RELEASING.md` ≥ 1, with a line number between the "Upload" and "Attach and verify (asc.js)" headings.
  - `grep -n 'app-build-version' docs/RELEASING.md` ≥ 1 in the Build subsection, and `grep -n -E 'eas submit.*--path' docs/RELEASING.md` → nothing.
- [ ] Write down the OPS.md verification before editing it. Save `git show HEAD:features/app/store-compliance/OPS.md > /tmp/ops-before.md`, then:
  - `grep -n -E '^- \[ \] \*\*O(3|4|6) \(C\)' features/app/store-compliance/OPS.md` → 3 lines.
  - `grep -n 'spec 05' features/app/store-compliance/OPS.md` → O3, O4 and O6 each cite spec 05 FR5/FR3.
  - `grep -n '~~Move the two email testers' features/app/store-compliance/OPS.md` → 1 line, followed by the Out of Scope 7 reason.
  - `diff /tmp/ops-before.md features/app/store-compliance/OPS.md` → only the O3, O4 and O6 lines differ, and none is ticked (`[x]`).

---

## Test Design Validation (MANDATORY), Phase 1

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent on `__tests__/config/app-config.test.ts`
- [ ] All FR1 success criteria have test coverage (range, string type, semver, appVersionSource)
- [ ] Assertions are specific (numeric `>= 18`, regex, strict equality to `'local'`), not just "is defined"
- [ ] No hard-coded `"18"` equality that would break build 19 (spec 06)
- [ ] Config is read through spec 03's typed JSON imports (`expo`, `easJson`). No `fs`/`path`/`__dirname`
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation (tracked repo)

### FR1: Build number 18 with a pinned local version source
- [ ] `app.json`: `expo.ios.buildNumber` `"17"` → `"18"`. Change nothing else.
- [ ] `eas.json`: add `"appVersionSource": "local"` inside `cli`. Keep `"version": ">= 18.0.0"`.
- [ ] `npx jest __tests__/config/app-config.test.ts` → all pass (green).
- [ ] `npx expo config --type public --json | node -e "const c=JSON.parse(require('fs').readFileSync(0));console.log(c.version,c.ios.buildNumber)"` → `1.1.0 18`
- [ ] Commit: `chore(05-release-build-18): bump iOS build to 18, pin local version source`

### FR6: Native release runbook and OPS.md ownership
- [ ] Append `## Native release` to `docs/RELEASING.md` with the 10 subsections in the spec FR6 order: Pre-flight, App Store Connect prep (asc.js), Build, Upload, Attach and verify (asc.js), TestFlight smoke, User-only steps, Submit, Post-release, If something fails. Tag every step `(C)` or `(J)`.
- [ ] Pre-flight lists:
  - `npx jest --runInBand` (0 failures, always required).
  - `npm run typecheck` and `npm run lint`, marked "when present": they must exit 0 once spec 07 PR B has merged, and before that they're recorded as `skipped: 07 PR B pending`.
  - `npx expo config --type introspect`, `npx expo-doctor`, `scripts/check-legal-pages.sh`.
  - A clean pushed tree.
  - The agreement check `node .appstore/asc.js builds` (J accepts in ASC → Business if it returns 403).
- [ ] App Store Connect prep comes **before** Build, and says why: the public link is off before the build lands in TestFlight (OPS O6), and `set-urls`' 200 check fails fast before a long build. It lists, in order and each `--dry-run` first:
  1. `disable-public-link`
  2. `remove-public-link-testers`
  3. `create-version <x.y.z>`
  4. `set-urls`
  5. `set-social-media-age-rating`
  6. `set-whats-new --file <path>`
  7. `set-review-notes`
- [ ] Build lists `eas build -p ios --profile production` on **EAS cloud, never `--local`**, with both reasons:
  - (1) No EAS build record, which spec 04's guard and runbook A and spec 06's `build-<N>` tag need.
  - (2) A local build uses this Mac's Xcode (27.0) instead of the EAS image, and SDK 55 must not be built against the iOS 27 SDK.
- [ ] Build records the EAS build id (required), `gitCommitHash` and the iOS runtime from `npx expo-updates runtimeversion:resolve --platform ios`. Before Upload, it checks `eas build:list --platform ios --status finished --channel production --app-build-version <N> --limit 1 --json --non-interactive`: same id, `gitCommitHash` = pushed HEAD, `runtimeVersion` = the local resolve. No `npx expo-fingerprint` and no bare `@expo/fingerprint` CLI.
- [ ] Upload lists `eas submit -p ios --profile production --latest` (no `--path <ipa>` variant), waits for `VALID`, then the **(J) ITMS-91053 check**. Copy the spec FR7 Upload text, written for build N with build N−1's email as the baseline, with all three branches: widget extension only → don't block, follow up; main app binary → add the reason, rebuild with the next number; never `VALID` → stop and escalate.
- [ ] Attach and verify lists `attach-build <buildId>` once the build is `VALID` (dry-run first), then `check-submission`.
- [ ] States that asc.js and `eas submit` run from the main checkout only (`.appstore/` is gitignored).
- [ ] TestFlight smoke lists the 8 checks from spec.md. User-only steps: App Privacy label (OPS O5), agreement acceptance, demo-account sign-in, internal group if missing.
- [ ] Submit says `node .appstore/asc.js submit-app-review <buildId>` (dry-run first) or the ASC button, `(J)` decision only after the smoke test passes. Post-release links spec 04 runbook A, then OPS O8–O10.
- [ ] "If something fails":
  - Take the next unused build number, never reuse one.
  - Re-attach the newer build.
  - Handle a review rejection in Resolution Center; set-* commands work on rejected states.
- [ ] What's New guidance: changes since the last live build, nothing about disabled features (e.g. Org scope).
- [ ] Run the Phase 1.0 grep commands. All match.
- [ ] `diff <(head -n $(wc -l < /tmp/releasing-before.md) docs/RELEASING.md) /tmp/releasing-before.md` → no output (spec 04 content unchanged).
- [ ] Commit: `docs(05-release-build-18): add native release runbook`
- [ ] `features/app/store-compliance/OPS.md` → "Before build 18 is submitted" (spec FR6 "OPS.md ownership"):
  - O3 → `(C)`: `node .appstore/asc.js set-social-media-age-rating`, dry-run first (spec 05 FR5). J does it in the ASC UI only if the command refuses (`socialMedia not exposed by the API`) or the rating isn't 4+ / Brazil L afterwards. Keep "if locked, do it on the 1.1.0 version record".
  - O4 → `(C)`: `node .appstore/asc.js set-urls`, dry-run first (spec 05 FR5). It refuses until the spec 01 URLs return 200. Marketing = `…/hourglass-app/`. J does it in the UI only on an ASC API error.
  - O6 → `(C)`: `disable-public-link`, then `remove-public-link-testers`, dry-run first (spec 05 FR3), before build 18 is uploaded. J does it in ASC → TestFlight only if a command errors.
  - Strike `~~Move the two email testers to an internal group.~~` and add the reason: internal groups only accept ASC team users (spec 05 Out of Scope 7), so the EMAIL testers stay in "Test" with the link off.
  - Leave every other item unchanged and tick nothing.
- [ ] Run the Phase 1.0 OPS.md verification commands. All match.
- [ ] Commit: `docs(05-release-build-18): re-own OPS O3/O4/O6 to asc.js`

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent (FR1, FR6)
- [ ] All FR1/FR6 success criteria verified
- [ ] Interface contracts match (`buildNumber` string ≥ 18, `appVersionSource: local`)
- [ ] No scope creep (no other app.json/eas.json keys touched; the OPS.md diff touches only O3, O4 and O6)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run `npx jest __tests__/config/app-config.test.ts` after fixes
- [ ] Commit fixes: `fix(05-release-build-18): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on `__tests__/config/app-config.test.ts`
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(05-release-build-18): strengthen test assertions`

### Final Verification
- [ ] `npx jest __tests__/config/app-config.test.ts` passing
- [ ] No regressions (the full `npx jest --runInBand` runs in Phase 3 pre-flight)
- [ ] Code follows existing patterns

---

## Phase 2.0: Test Foundation (`.appstore/asc.js`, main checkout only)

asc.js is untracked, so it has no Jest coverage. The "tests" are the command transcripts below. Write the expected result next to each item **before** implementing, then record the actual output after. **No live writes in Phase 2.** Run every write command with `--dry-run` and `ASC_TRACE=1`.

### Setup
- [ ] `cd "/Users/Trilogy/Documents/Claude Code/WS/hourglassws"` (not a worktree). Check `ls .appstore/asc.js` succeeds.
- [ ] Back up: `cp .appstore/asc.js .appstore/asc.js.bak-$(date +%Y%m%d)`. Then `ls .appstore/asc.js.bak-*`.
- [ ] Agreement probe: `node .appstore/asc.js builds`.
  - Record the result. Expected today: `Error: App not found for bundle ID` (the hidden 403).
  - If it 403s, the read-only GET items below wait for (J) to accept the agreement in ASC → Business. `node --check`, the grep items and dry-run refusals that need no API (bad args) can still go ahead.

### FR2: Safety fixes and dry-run plumbing (red baselines)
- [ ] Red: `node .appstore/asc.js list-testers` → expected `TypeError … reading 'padEnd'` (agreement accepted) or the hidden 403. Record it.
- [ ] Red: `node .appstore/asc.js check-submission` → expected `Version 1.0: READY_FOR_SALE`. Record the full output as the format baseline.
- [ ] Red: `node .appstore/asc.js builds` → record the output as the format baseline (build 17 VALID expected).
- [ ] Expected after the fix (write down now):
  - `list-testers` shows an id column, `<anonymous>` for 12 PUBLIC_LINK rows, no `null`, and per-type counts.
  - `set-review-notes --dry-run` → exit 1, `No editable App Store version (live: 1.0 …)`.
  - `check-submission` → still prints 1.0.
  - Agreement 403 → `ASC API error: 403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`.

### FR3: Public-link lockdown (expected transcripts)
- [ ] `disable-public-link --dry-run`: lists groups, with "Test" external and `publicLinkEnabled: true`, then exactly 1 `[dry-run] PATCH /betaGroups/<id>` with `{"publicLinkEnabled":false}`.
- [ ] `remove-public-link-testers --dry-run`: N `[dry-run] DELETE /betaTesters/<id>/relationships/apps` lines, where N = the `list-testers --type=PUBLIC_LINK` total (12 expected), and 0 lines for EMAIL ids.
- [ ] `remove-public-link-testers <email-tester-id> --dry-run`: exit 1, `Refusing: <id> is EMAIL`, 0 `[dry-run]` lines.

### FR4: Version record commands (expected transcripts)
- [ ] `create-version 1.1 --dry-run`: exit 1 (format), 0 `[dry-run]` lines.
- [ ] `create-version 1.1.0 --dry-run` (no 1.1.0 record): 1 `[dry-run] POST /appStoreVersions` containing `"versionString":"1.1.0"`, `"platform":"IOS"`, `"releaseType":"AFTER_APPROVAL"`, plus 1 `[dry-run] POST /appStoreVersionPhasedReleases` with `<new-version-id>` and `"phasedReleaseState":"INACTIVE"`. Ends with `[dry-run] 2 write(s) skipped`.
- [ ] `set-whats-new --file /tmp/empty.txt --dry-run`: exit 1. `attach-build --dry-run` (no id): exit 1, usage. `submit-app-review --dry-run` (no id): exit 1, usage.
- [ ] Before 1.1.0 exists: `set-whats-new --file /tmp/whats-new-1.1.0.txt --dry-run`, `attach-build <id> --dry-run` and `set-review-notes --dry-run` all exit 1 with "run create-version".

### FR5: Compliance metadata (expected transcripts)
- [ ] `curl -s -o /dev/null -w '%{http_code}\n'` on each of the 3 `URLS`. Record them (404 until spec 01 deploys).
- [ ] Spec 01 not live: `set-urls --dry-run` → exit 1, `URL not live: …`, 0 `[dry-run]` lines.
- [ ] No 1.1.0 record: `set-social-media-age-rating --dry-run` → exit 1, "run create-version".
- [ ] `grep -c "hourglass/hourglassws" .appstore/asc.js` → expected `0` after the fix (record the current count; expected 4).

---

## Test Design Validation (MANDATORY), Phase 2

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent on the Phase 2.0 expected-transcript list (spec.md FR2–FR5 as the reference)
- [ ] Every FR2–FR5 success criterion has a transcript, grep or GET item
- [ ] Expectations are specific (exact line counts, exact JSON attributes, exit codes), not just "runs"
- [ ] Every write command has an `ASC_TRACE=1 … 2>&1 | grep -E '^\[http\] (POST|PATCH|DELETE)'` → empty check
- [ ] Fix any issues identified before proceeding

---

## Phase 2.1: Implementation (`.appstore/asc.js`)

### FR2: Safety fixes and dry-run plumbing
- [ ] Config block: add `URLS`, `EDITABLE_VERSION_STATES`, `EDITABLE_INFO_STATES`. Keep `KEY_ID`/`ISSUER_ID`/`KEY_PATH` at the top (for OPS O8).
- [ ] Add `request()` returning `{status, body}`, with `ASC_TRACE` logging and the non-GET-under-dry-run throw. Re-implement `api()` as `request().body`.
- [ ] Add `write()` (dry-run print + counter, else request + throw on `status >= 400` / `errors`) and the end-of-command `[dry-run] <n> write(s) skipped`.
- [ ] Argument parsing: strip `--dry-run`, `--type=…`, `--file <p>` before positional args.
- [ ] `getAppId()`: throw `ASC API error: <status> <code> — <title>` when `res.errors`.
- [ ] `listTesters()`: `?? '<anonymous>'`, `?? ''` for names and inviteType, id column, `--type` filter, per-type counts.
- [ ] `versionState()`, `getLatestVersion()` (editable-only, throws on 0 or more than 1), `getNewestVersion()` (unfiltered). Switch `checkSubmissionState` to `getNewestVersion()`.
- [ ] `getEditableAppInfo(appId)`.
- [ ] Move the dispatcher (`// ── Main`) to the end of the file. Update the usage string and header comment with all commands + `--dry-run`.
- [ ] `node --check .appstore/asc.js` → exit 0.
- [ ] Re-run the FR2 Phase 2.0 items and record actual vs expected.

### FR3: Public-link lockdown
- [ ] `disable-public-link`: list groups, `write` PATCH for each `publicLinkEnabled === true`, no-op message otherwise.
- [ ] `remove-public-link-testers [ids…]`: validate all ids are PUBLIC_LINK before any write, `write` DELETE per tester, no-op message when 0.
- [ ] Re-run the FR3 Phase 2.0 items with `ASC_TRACE=1` and record the transcripts. The trace grep must be empty.

### FR4: Version record commands
- [ ] `create-version <x.y.z>`: format check, the existing/editable/non-editable/different-version branches, POST version (`AFTER_APPROVAL`), ensure phased release (`INACTIVE`), `<new-version-id>` placeholder in a dry run.
- [ ] `attachBuild(version, buildId)` with guards (a)–(d), the already-attached no-op, and the PATCH body moved from `asc.js:429-434`. Add the `attach-build <buildId>` command.
- [ ] `set-whats-new <text> | --file <path>`: trim, check 1–4000 chars, en-US loc, equality no-op, `write` PATCH.
- [ ] `REVIEW_NOTES_UNLISTED` → granted-tense sentence from spec FR4. `set-review-notes` gets the equality no-op and goes through `write()`.
- [ ] `submit-app-review <buildId>`: require the id, remove the auto-pick (421-426) and the "Proceeding anyway" branch (417-419), use `attachBuild()`, route the 3 submission writes through `write()` with a `<new-submission-id>` placeholder in dry runs.
- [ ] Extend `check-submission` with: releaseType, phased state, copyright, whatsNew (120 chars), supportUrl, marketingUrl, privacyPolicyUrl, socialMedia, appStoreAgeRating.
- [ ] Write `/tmp/whats-new-1.1.0.txt` with the exact 4-bullet copy from spec FR4. Check it with `grep -ci '\borg\b' /tmp/whats-new-1.1.0.txt` → `0`.
- [ ] Re-run the FR4 Phase 2.0 items with `ASC_TRACE=1` and record the transcripts. The trace grep must be empty, including `submit-app-review <build17-id> --dry-run` (expected now: the "run create-version" refusal, since 1.1.0 doesn't exist yet; no non-GET request). This doesn't satisfy the FR4 full-preview criterion. That transcript is recorded in Phase 3.1 → Attach, once build 18 is attached.

### FR5: Compliance metadata
- [ ] Replace the 4 dead URLs in `setBetaInfo` (188) and `setStoreListing` (253, 283, 284) with `URLS.*`. `grep -c "hourglass/hourglassws"` → `0`.
- [ ] `set-urls`: URL 200 pre-check (no redirects, runs in dry-run too), then up to 3 diff-only PATCHes (appInfoLocalizations, appStoreVersionLocalizations, betaAppLocalizations) via `write()`.
- [ ] `set-social-media-age-rating`: `GET /appInfos/{id}/ageRatingDeclaration`. Refuse if the `socialMedia` key is absent (print the keys). No-op if `false`. Else `write` PATCH `{socialMedia:false}` only. Print `appStoreAgeRating` and `/brazil/i` attributes, and warn if the rating isn't `FOUR_PLUS`.
- [ ] Re-run the FR5 Phase 2.0 items and record them.
- [ ] Final: `node --check .appstore/asc.js`. Then `git -C "/Users/Trilogy/Documents/Claude Code/WS/hourglassws" status --porcelain .appstore` → empty (still ignored). Then `git check-ignore -v .appstore/asc.js` → `.gitignore:62`.

---

## Phase 2.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent on `.appstore/asc.js` vs spec FR2–FR5 and the command contract table
- [ ] All FR2–FR5 success criteria verified (transcripts recorded above)
- [ ] Interface contracts match (`request`/`write`/`getLatestVersion`/`getNewestVersion`/`getEditableAppInfo`/`attachBuild`, command no-op conditions, exit codes)
- [ ] No scope creep (`set-metadata` untouched; `set-store-listing`/`set-beta-info` changed only in URLs)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents). The file is untracked, so point the reviewers at `diff -u .appstore/asc.js.bak-<YYYYMMDD> .appstore/asc.js` instead of a git diff.

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run `node --check` and every Phase 2.0 dry-run and trace item after fixes
- [ ] No commit (untracked). Note the fixes in Session Notes

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on the Phase 2.0 verification list
- [ ] Add any missing negative case it identifies (e.g. a second editable version, a missing en-US localization)
- [ ] Re-run the affected dry runs to confirm
- [ ] Record changes in Session Notes

### Final Verification
- [ ] Every write command's `ASC_TRACE` grep is empty under `--dry-run`
- [ ] `builds`, `beta-info`, `check-submission` output formats match the Phase 2.0 baselines (plus the FR4 additions)
- [ ] Code follows the existing asc.js patterns (`api`/`all` helpers, `✓` success lines)

---

## Phase 3.0: Release Gates and Pre-flight (FR7)

### Gates (all required before any build or live write)
- [ ] Specs 01, 02, 03 and 04 merged to `main`, with Phases 1 and 2 of this spec complete.
- [ ] Spec 07 **PR A** (FR1 Buffer fix + FR2 NativeWindSmoke removal) merged to `main`. Merge SHA: ______
- [ ] Spec 07 **PR B** (FR3–FR8) status: merged at ______ / pending. **Not a gate.** If pending, it lands after build 18 without forking the runtime (spec 04 FR2 `PackageJsonScriptsAll`), and its JS fixes ship by OTA.
- [ ] `git -C "/Users/Trilogy/Documents/Claude Code/WS/hourglassws" status --porcelain` → empty.
- [ ] `git push origin main`, then `git rev-list --count origin/main..main` → `0`. Record the HEAD SHA: ______
- [ ] (J) Apple agreement accepted. `node .appstore/asc.js builds` → lists builds (no 403).
- [ ] (J) Explicit go-ahead for live ASC writes recorded here: ______

### Pre-flight (C), recording each result
- [ ] `npx jest --runInBand` → 0 failures. Pass count: ______
- [ ] `npm run typecheck` → exit 0 if spec 07 PR B has merged, otherwise record `skipped: 07 PR B pending` (the script doesn't exist yet). Result: ______
- [ ] `npm run lint` → exit 0 if spec 07 PR B has merged, otherwise record `skipped: 07 PR B pending` (9 known errors until PR B). Result: ______
- [ ] `npx expo config --type introspect --json` → `UIBackgroundModes` is `["remote-notification"]` only, no `NSFaceIDUsageDescription`, `runtimeVersion.policy === "fingerprint"`, `ios.buildNumber "18"`
- [ ] `npx expo-doctor` → config-schema check passes (package-version check may be red until spec 06)
- [ ] `scripts/check-legal-pages.sh` → exit 0 (all 3 URLs 200)

---

## Phase 3.1: Release Execution (FR7, live)

For every asc.js step: (1) `--dry-run` → paste the transcript; (2) live run → paste the output; (3) re-run → paste the no-op output (zero writes). The one exception is `submit-app-review`, which is **dry-run only** here.

### ASC prep (C), before the upload
- [ ] `disable-public-link`: dry-run / live / re-run no-op
- [ ] `remove-public-link-testers`: dry-run / live / re-run no-op. Then `list-testers --type=PUBLIC_LINK` → `Total: 0`, and `list-testers --type=EMAIL` → the 2 email testers are still present
- [ ] Tick **OPS O6** in `features/app/store-compliance/OPS.md`, only now that both commands' live runs and no-op re-runs are recorded above
- [ ] Note from the `disable-public-link` output whether an internal group exists. If none: (J) create one in ASC → TestFlight and add themself
- [ ] `create-version 1.1.0`: dry-run / live / re-run no-op (`= version 1.1.0 already exists (PREPARE_FOR_SUBMISSION)`, `= phased release already configured (INACTIVE)`)
- [ ] `check-submission` → newest is 1.1.0. Check that copyright, description and keywords copied over. If any is missing, stop and report to J
- [ ] `set-urls`: dry-run (3 PATCHes) / live / re-run no-op. Then tick **OPS O4**
- [ ] `set-social-media-age-rating`: dry-run (current `socialMedia: null`, 1 PATCH `{"socialMedia":false}`) / live / re-run no-op. `appStoreAgeRating` = `FOUR_PLUS` (stop if not). Then tick **OPS O3**
- [ ] If any of these took the J UI fallback (refusal path), tick its OPS item only after `check-submission` / `list-testers` confirms J's change
- [ ] `set-whats-new --file /tmp/whats-new-1.1.0.txt`: dry-run / live / re-run no-op
- [ ] `set-review-notes`: dry-run / live / re-run no-op

### Build and upload (C, then J)
- [ ] `eas build -p ios --profile production` on **EAS cloud**. **No `--local`**: it creates no EAS record (spec 04 guard, runbook A and O11; spec 06 FR7(b) tag), and this Mac's Xcode 27.0 would build SDK 55 against the iOS 27 SDK. EAS build id (**required**): ______. `gitCommitHash`: ______ (must equal the Gates HEAD SHA).
- [ ] Build log: build number `18`, an Xcode 26.x image (expected `macos-sequoia-15.6-xcode-26.2`, not Xcode 27), no `cli.appVersionSource` warning.
- [ ] iOS runtime: run `npx expo-updates runtimeversion:resolve --platform ios` locally at the build commit → `runtimeVersion` ______ (40-hex). Don't use `npx expo-fingerprint` (npm 404) or the bare `@expo/fingerprint` CLI (it hashes both platforms).
- [ ] **EAS record check (before upload):** `eas build:list --platform ios --status finished --channel production --app-build-version 18 --limit 1 --json --non-interactive` returns:
  - `id` = the EAS build id above.
  - `appVersion` `1.1.0`, `appBuildVersion` `18`.
  - `gitCommitHash` = the Gates HEAD SHA.
  - `runtimeVersion` ______, equal to the local resolve: yes/no.
  - If it returns `[]` or any field differs, stop. For a runtime mismatch, run `eas fingerprint:compare --build-id <id>`.
- [ ] `eas submit -p ios --profile production --latest`, run from the main checkout (no `--path` variant). Submitted EAS build id matches the one above: yes/no. If another iOS build started in between, use `--id <eas-build-id>`.
- [ ] `node .appstore/asc.js builds` → `18 … VALID`. ASC build id: ______
- [ ] **(J) ITMS-91053 check.** In the App Store Connect processing email for build 18, search for `ITMS-91053`. Check build 17's email too, as a baseline. Record either "none" or the binaries and API categories it lists.
  - **It names only `ExpoWidgetsTarget`, and build 18 is `VALID`:** don't block submission. Open a follow-up for the next native build: give the `ExpoWidgets` pod its own `PrivacyInfo.xcprivacy` (`CA92.1`, `1C8F.1`) through the existing `patches/expo-widgets+55.0.5.patch`.
  - **It names the main app binary:** spec 03's FR4 manifest is missing a reason. Add that reason to `ios.privacyManifests` and the FR4 contract test, then rebuild with the next unused build number before submitting.
  - **Build 18 never reaches `VALID`:** this is a release blocker. Stop and escalate.
  - Build 17 result: ______. Build 18 result: ______. Branch taken: ______

### Attach (C)
- [ ] `attach-build <build17-id> --dry-run` → exit 1, newer valid build refusal
- [ ] `attach-build <build18-id>`: dry-run (1 PATCH) / live / re-run no-op (`= build 18 already attached`)
- [ ] `check-submission` → 1.1.0 `PREPARE_FOR_SUBMISSION`, build `v18`, `AFTER_APPROVAL`, phased `INACTIVE`, What's New text, 3 live URLs, `socialMedia false`, `FOUR_PLUS`, review notes match the updated text. No new review submission listed.
- [ ] `ASC_TRACE=1 node .appstore/asc.js submit-app-review <build18-id> --dry-run 2>&1`: paste the transcript. Expected (FR4):
  - `= build 18 already attached`.
  - Then `[dry-run] POST /reviewSubmissions` (`platform:"IOS"`, app relationship).
  - Then `[dry-run] POST /reviewSubmissionItems` referencing `<new-submission-id>` and the 1.1.0 version id.
  - Then `[dry-run] PATCH /reviewSubmissions/<new-submission-id>` with `submitted:true`.
  - Ends with `[dry-run] 3 write(s) skipped`.
  - Then run `ASC_TRACE=1 node .appstore/asc.js submit-app-review <build18-id> --dry-run 2>&1 | grep -E '^\[http\] (POST|PATCH|DELETE)'` → empty.
  - **Dry run only. Never run it live in this spec.**

### TestFlight smoke on an iOS 27 device (J performs, C records). iOS version: ______
- [ ] 1. Cold launch, sign in with the QA manager account: pass/fail
- [ ] 2. Home hours and earnings load; Overview Personal/Team toggle works; Patterns card renders: pass/fail
- [ ] 3. Approve one QA item; reject one with a reason: pass/fail
- [ ] 4. Settings → About: Privacy Policy and Support open in the in-app browser and load; row reads `Version 1.1.0 (18)` / `Update: embedded`: pass/fail
- [ ] 5. Widgets small, medium and large show data; tap opens the app: pass/fail
- [ ] 6. Within 30 min of a cron tick, the widget timestamp updates (silent push without `fetch`): pass/fail
- [ ] 7. Local deadline notification fires; tap routes correctly: pass/fail
- [ ] 8. Sign Out clears data; `curl -s https://dynamic-balance-production-1696.up.railway.app/health` `tokenCount` before ______ / after ______ (drop of 1): pass/fail

### User-only steps (J)
- [ ] App Privacy label (OPS O5): Identifiers → Device ID, App Functionality, Not Linked to You, Not Used for Tracking
- [ ] Demo account in App Review Information signs in on build 18

### Stop point
- [ ] If any smoke check failed, or the ITMS-91053 check named the main app binary: fix on `main`, take build 19 (next unused), repeat Phase 3.0 and the Build/Attach steps. **Do not submit 18.**
- [ ] All of the above pass, the ITMS-91053 result is "none" or the widget-extension-only branch, and OPS O3/O4/O6 are ticked → mark **READY TO SUBMIT**. Submission (`node .appstore/asc.js submit-app-review <build18-id>`, dry-run first, or the ASC button) is J's decision and is **not** part of implementation.

---

## Phase 3.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent on this checklist's recorded outputs vs spec FR7 success criteria
- [ ] Every live write has a preceding dry-run transcript and a following no-op or `check-submission` record
- [ ] Final `check-submission` matches the FR7 contract
- [ ] No `POST /reviewSubmissions` issued live (scope). The `submit-app-review <build18-id> --dry-run` preview is recorded and its trace grep is empty.
- [ ] Build 18 has an EAS build id, and its `eas build:list` record check is recorded. The ITMS-91053 result and branch are recorded. OPS O3, O4 and O6 are ticked.

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill on the repo diff for this spec (`app.json`, `eas.json`, `__tests__/config/app-config.test.ts`, `docs/RELEASING.md`, `features/app/store-compliance/OPS.md`, this checklist)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run `npx jest __tests__/config/app-config.test.ts` after fixes
- [ ] Commit fixes: `fix(05-release-build-18): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(05-release-build-18): strengthen test assertions`

### Final Verification
- [ ] All tests passing (`npx jest --runInBand`)
- [ ] No regressions in existing tests
- [ ] Code follows existing patterns
- [ ] Commit the checklist with recorded results: `docs(05-release-build-18): record release execution`

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19**: Spec drafted. Known blockers at draft time:
- The ASC API returns 403 `REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. J must accept the agreement before any asc.js GET or `eas submit`.
- Specs 01–04 and 07 aren't merged yet: `site/`, `src/lib/legalLinks.ts`, `docs/RELEASING.md` and `__tests__/config/app-config.test.ts` don't exist.
- `main` is 2 commits ahead of `origin/main` (`fc24cd5`, `b6b79b7`).
- Build 17 expires 2026-11-04.

**2026-10-19 (validator revision):**
- Build 18 must be an EAS cloud build. `--local` and `--path <ipa>` are removed, the EAS build id is a required record, and an `eas build:list --app-build-version 18` record check runs before upload. Verified with `eas build:list`: EAS has records for builds 13, 15 and 17 but not 10, 11, 14 or 16. `xcodebuild -version` on this Mac prints Xcode 27.0 (27A266a).
- The ITMS-91053 check (spec 03 Out of Scope #5) is placed in Phase 3.1 "Build and upload", spec FR7 Upload and the FR6 runbook Upload subsection.
- Spec 07 gate narrowed to PR A. Typecheck and lint are required only if PR B has merged. `package.json` today has `lint` but no `typecheck` script.
- OPS.md O3, O4 and O6 are re-owned to `(C)` (FR6), and ticked in Phase 3.1.
- The FR1 test block uses spec 03's typed JSON imports (`@/app.json`, `@/eas.json`), with no `fs`. Checked with `tsc`: `toHaveProperty('appVersionSource', 'local')` type-checks on current `main`, but `easJson.cli.appVersionSource` is TS2339.
