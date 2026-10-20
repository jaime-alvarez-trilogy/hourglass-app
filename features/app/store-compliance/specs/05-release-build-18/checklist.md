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
- [x] Confirm `__tests__/config/app-config.test.ts` exists (spec 03 merged). If it doesn't, stop.
- [x] Add `describe('05-release-build-18')`. Follow spec 03's test-file contract (typed JSON imports, no `fs`):
  - Reuse spec 03's module-level `expo` (from `import appJson from '@/app.json'`).
  - Add `import easJson from '@/eas.json'` next to spec 03's imports at the top of the file.
  - Don't use `fs`, `path` or `__dirname`. `tsconfig.json` has `"types": ["jest"]`, so they'd add TS2307/TS2304 until spec 07 FR3.
  - Done: `describe('05-release-build-18')` › `describe('FR1: build number with a pinned local version source')` › the three `it`s named in the spec's interface contract.
- [x] Test: `expo.ios?.buildNumber` is a `string`, matches `/^\d+$/`, and `Number(...) >= 18`. Never `=== '18'`.
- [x] Test: `expo.version` matches `/^\d+\.\d+\.\d+$/`.
- [x] Test: `expect(easJson.cli).toHaveProperty('appVersionSource', 'local')`. Don't read `easJson.cli.appVersionSource` directly: that's TS2339 before FR1 adds the key.
- [x] `git diff __tests__/config/app-config.test.ts | grep -E "^\+.*(from 'fs'|from 'path'|__dirname)"` → nothing. (Only added import: `+import easJson from '@/eas.json';`. `npx tsc --noEmit` stays at 541 errors in this worktree, none in this file.)
- [x] Run `npx jest __tests__/config/app-config.test.ts`. The buildNumber and appVersionSource tests **fail** (red: `"17"`, `undefined`), the semver test passes, and spec 03/04 tests in the file are unaffected.
  - Red, 2026-10-20: 2 failed / 21 passed / 23. `ios.buildNumber is an integer string >= 18` → `Expected: >= 18, Received: 17`. `eas.json pins cli.appVersionSource to local` → `Expected path: "appVersionSource" … Received value: {"version": ">= 18.0.0"}`. `expo.version is semver x.y.z` passes. All 20 spec 03/04 tests pass.
  - Full suite: `npx jest --silent` → 4951 passed / 3 failed (the 2 above plus the known out-of-repo `NativeWindSmoke` FR3 SC3.2). One earlier full run also showed the Android widget suite failing; that's the parallel-worker flake the spec notes, and it didn't recur.

### FR6: Native release runbook and OPS.md ownership
- [x] Confirm `docs/RELEASING.md` exists (spec 04 merged). If it doesn't, stop. Save `git show HEAD:docs/RELEASING.md > /tmp/releasing-before.md` for the unchanged-OTA check.
  - Done 2026-10-20 at HEAD `9c1652e`: `/tmp/releasing-before.md` is 118 lines. If `/tmp` has been cleared, regenerate it with `git show 9c1652e:docs/RELEASING.md`.
- [x] Write down the verification commands before writing the doc:
  - `grep -n '^## Native release' docs/RELEASING.md` → exactly 1 match.
  - `grep -n '^### ' docs/RELEASING.md` → Pre-flight, App Store Connect prep (asc.js), Build, Upload, Attach and verify (asc.js), TestFlight smoke, User-only steps, Submit, Post-release, If something fails, in that order (10 headings, after spec 04's). ASC prep must come before Build (OPS O6: public link off before the build lands).
  - `grep -c -- '--dry-run' docs/RELEASING.md` ≥ 1, and `grep -n 'main checkout' docs/RELEASING.md` ≥ 1.
  - `grep -n 'runtimeversion:resolve --platform ios' docs/RELEASING.md` ≥ 1 in the new section, and `grep -n 'expo-fingerprint' docs/RELEASING.md` → nothing (spec 04's check covers the whole file).
  - `grep -n 'ITMS-91053' docs/RELEASING.md` ≥ 1, with a line number between the "Upload" and "Attach and verify (asc.js)" headings.
  - `grep -n 'app-build-version' docs/RELEASING.md` ≥ 1 in the Build subsection, and `grep -n -E 'eas submit.*--path' docs/RELEASING.md` → nothing.
  - **Red baseline, 2026-10-20 (before FR6):** `^## Native release` → 0 matches. `^### ` → only spec 04's A–E (lines 22, 49, 71, 86, 101), so the 10 new headings must all come after line 101. `main checkout` → 0. `ITMS-91053` → 0. `expo-fingerprint` → nothing (must stay so). `eas submit.*--path` → nothing (must stay so).
  - **Whole-file greps that already pass on spec 04's text.** These are vacuous, so scope them to the new section or subsection. Each command below was checked on a sample section.
    - `--dry-run`: whole file = 2 already (spec 04's `ota-publish.sh --dry-run`). Use `awk '/^## Native release/{f=1} f' docs/RELEASING.md | grep -c -- '--dry-run'`: 0 today, must be ≥ 1.
    - `runtimeversion:resolve --platform ios`: already in spec 04's section A step 4. Use the same `awk '/^## Native release/{f=1} f' …` prefix: 0 today, must be ≥ 1.
    - `app-build-version`: already in spec 04's section A step 1. Use `awk '/^### Build$/{f=1;next} /^#{2,3} /{f=0} f' docs/RELEASING.md | grep -c 'app-build-version'`: must be ≥ 1.
    - ITMS-91053 placement: `awk '/^### Upload$/{f=1;next} /^#{2,3} /{f=0} f' docs/RELEASING.md | grep -c 'ITMS-91053'` must be ≥ 1, and `awk '/^## Native release/{exit} 1' docs/RELEASING.md | grep -c 'ITMS-91053'` must be 0.
- [x] Write down the OPS.md verification before editing it. Save `git show HEAD:features/app/store-compliance/OPS.md > /tmp/ops-before.md`, then:
  - `grep -n -E '^- \[ \] \*\*O(3|4|6) \(C\)' features/app/store-compliance/OPS.md` → 3 lines.
  - `grep -n 'spec 05' features/app/store-compliance/OPS.md` → O3, O4 and O6 each cite spec 05 FR5/FR3.
  - `grep -n '~~Move the two email testers' features/app/store-compliance/OPS.md` → 1 line, followed by the Out of Scope 7 reason.
  - `diff /tmp/ops-before.md features/app/store-compliance/OPS.md` → only the O3, O4 and O6 lines differ, and none is ticked (`[x]`).
  - **Red baseline, 2026-10-20:** `/tmp/ops-before.md` saved (25 lines). Regenerate it with `git show 9c1652e:features/app/store-compliance/OPS.md` if needed. `(C)` O3/O4/O6 → 0 lines, because all three are `(J)` today. `~~Move the two email testers` → 0.
  - `grep -n 'spec 05'` already matches O7 (line 13), so check each line: `grep -E '^- \[ \] \*\*O3 \(C\)' features/app/store-compliance/OPS.md | grep -c 'spec 05 FR5'` → 1. Same for O4 with `spec 05 FR5`, and for O6 with `spec 05 FR3`.

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

**Offline harness (added in Phase 2.0, 2026-10-20).** The ASC API returns 403 for every call until J accepts the agreement, so no live GET or dry-run transcript can be produced today. The expected transcripts below are encoded as an executable suite in `features/app/store-compliance/specs/05-release-build-18/asc-offline/`:
- `fixtures.js`: ASC JSON:API states for each point in the FR7 sequence (`agreement-403`, `today`, `v110-fresh`, `v110-prepped`, `v110-build18`, `post-live`, `v110-in-review`) plus negative-case modifiers (`+two-editable`, `+no-en-us`, `+no-socialmedia-key`, `+pages-redirect`, …). The 403 body is the one captured live on 2026-10-19.
- `fake-asc.js`: a pure in-memory router for those states.
- `mock-https.js`: a `node -r` preload. It replaces `https`/`http` request/get, `fetch`, `net`/`tls` connects and `child_process`, so **nothing leaves the machine**. It answers every non-GET with an error and logs it as `blocked`. It refuses to load without `ASC_MOCK_SCENARIO`.
- `check.js`: 82 cases (6 characterization), each run with `ASC_TRACE=1`. It asserts exit codes, exact `[dry-run] <METHOD> <path> <json>` lines and bodies, the `[dry-run] <n> write(s) skipped` trailer, one `[http] …` stderr trace line per ASC request, and zero non-GET requests. That last check is the `ASC_TRACE … | grep -E '^\[http\] (POST|PATCH|DELETE)'` → empty check, applied to every case. It also runs static checks on the file.
- Run it from anywhere: `node features/app/store-compliance/specs/05-release-build-18/asc-offline/check.js --target "/Users/Trilogy/Documents/Claude Code/WS/hourglassws/.appstore/asc.js"`. `--red` asserts the red phase. `--transcripts` prints every transcript. `--only <id>` filters cases. `--self-test` checks the fake and the transport.
- **Red phase, 2026-10-20, against the unmodified asc.js** (sha256 `9d77b903…`): `--red` → `6 passed, 76 failed (82 cases, 6 characterization)`, "red phase OK". The 6 characterization cases pass: FR2.01 `node --check`, FR2.02 `KEY_*` at top, FR2.16 `check-submission` format, FR2.17 `check-submission` on a non-editable newest version, FR2.18 `builds` format, FR2.19 `beta-info` format. No case failed from a fixture gap or a non-fixture host. In 9 cases (FR2.12, FR2.14, FR4.28–FR4.34), the current code ignored `--dry-run` and tried a PATCH. The harness intercepted it in-process (`blocked`), so nothing was sent to Apple. This is the FR2/FR4 bug the cases exist to catch.
- The runner's passing path was proven against a throwaway spec-shaped stand-in for 23 cases (list-testers, disable-public-link, remove-public-link-testers, create-version, set-urls, and the 403 path). The stand-in was deleted.
- **What offline can't prove.** It doesn't prove the real ASC response shapes: fixtures follow the ASC API reference. It doesn't prove whether the API exposes `socialMedia`, or whether a new version copies the 1.0 localizations. It doesn't cover `write()`'s live error path (`status >= 400` / `errors`): no live writes are run, even offline. It doesn't use the real tester and group ids and counts. These still need the live transcripts in Phase 3.

### Setup
- [x] `cd "/Users/Trilogy/Documents/Claude Code/WS/hourglassws"` (not a worktree). Check `ls .appstore/asc.js` succeeds.
  - Ran with absolute paths from the build18 worktree. This run's rules keep the cwd in the worktree, and asc.js resolves its key via `__dirname`. `.appstore/asc.js` is present: 500 lines, 23380 bytes.
- [x] Back up: `cp .appstore/asc.js .appstore/asc.js.bak-$(date +%Y%m%d)`. Then `ls .appstore/asc.js.bak-*`.
  - `.appstore/asc.js.bak-20261019`, made with `cp -p`, has the same sha256 as asc.js: `9d77b903cc7eccdf9a2fb4be9027ea9413f940223df2c785da32b34d73c8685b`. `git status --porcelain .appstore` in the main checkout → empty, and `git check-ignore -v .appstore/asc.js` → `.gitignore:62`.
- [x] Agreement probe: `node .appstore/asc.js builds`.
  - Record the result. Expected today: `Error: App not found for bundle ID` (the hidden 403).
  - If it 403s, the read-only GET items below wait for (J) to accept the agreement in ASC → Business. `node --check`, the grep items and dry-run refusals that need no API (bad args) can still go ahead.
  - 2026-10-20: `Error: App not found for bundle ID: com.jalvarez0907.hourglass`, exit 1. A raw read-only `GET /v1/apps?filter[bundleId]=…` returns HTTP 403 `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`, "A required agreement is missing or has expired.", `links.see: /business`. That body is the `agreement-403` fixture.

### FR2: Safety fixes and dry-run plumbing (red baselines)
- [x] Red: `node .appstore/asc.js list-testers` → expected `TypeError … reading 'padEnd'` (agreement accepted) or the hidden 403. Record it.
  - Live: `Error: App not found for bundle ID: com.jalvarez0907.hourglass`, exit 1.
  - Offline (`today` fixture, 12 testers with null `email`/`firstName`/`lastName`): the header prints, then `Error: Cannot read properties of null (reading 'padEnd')`, exit 1. Harness FR2.09–FR2.11.
- [x] Red: `node .appstore/asc.js check-submission` → expected `Version 1.0: READY_FOR_SALE`. Record the full output as the format baseline.
  - Live: the hidden 403, exit 1. Offline format baseline (`today` fixture), pinned by FR2.16:
    ```
    Version 1.0: READY_FOR_SALE
    Attached build: v15 (bld-15)
    Demo account required: true  |  demo user set: yes
    Review notes match Unlisted text: true

    Review submissions:
      rs-100  state=COMPLETE  platform=IOS
    ```
  - [ ] Live format baseline, once J accepts the agreement (Phase 3.0 Gates).
- [x] Red: `node .appstore/asc.js builds` → record the output as the format baseline (build 17 VALID expected).
  - Live: the hidden 403, exit 1. Offline format baseline (`today` fixture), pinned by FR2.18:
    ```
    Build      Date                   State                Audience
    ──────────────────────────────────────────────────────────────────────
    17         8/6/2026, 7:00:00 PM   VALID                APP_STORE_ELIGIBLE
    …
    Build IDs (for submit-review):
      bld-17  v17  VALID
    ```
  - [ ] Live format baseline, once J accepts the agreement (Phase 3.0 Gates).
- [x] Expected after the fix (write down now):
  - `list-testers` shows an id column, `<anonymous>` for 12 PUBLIC_LINK rows, no `null`, and per-type counts.
  - `set-review-notes --dry-run` → exit 1, `No editable App Store version (live: 1.0 …)`.
  - `check-submission` → still prints 1.0.
  - Agreement 403 → `ASC API error: 403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`.
  - Encoded as harness cases, all red today:
    - FR2.03: Config block `URLS`/`EDITABLE_*`, evaluated in a sandbox.
    - FR2.04: dispatcher after every function and UPPER_CASE const.
    - FR2.05 / FR2.06: header comment and usage list all 19 commands and `--dry-run`.
    - FR2.07a–c: the 403 is surfaced as `ASC API error: 403 … — A required agreement is missing or has expired.`
    - FR2.08: `[http] GET … -> 200` on stderr.
    - FR2.09–FR2.11: list-testers with `--type`.
    - FR2.12: the `Run: node .appstore/asc.js create-version <x.y.z>` refusal.
    - FR2.13: two editable versions → throw before any read.
    - FR2.14: the `request()` backstop via legacy `set-beta-info --dry-run` → `Refusing PATCH in --dry-run`.
    - FR2.15: `--dry-run` before the command.

### FR3: Public-link lockdown (expected transcripts)
- [x] `disable-public-link --dry-run`: lists groups, with "Test" external and `publicLinkEnabled: true`, then exactly 1 `[dry-run] PATCH /betaGroups/<id>` with `{"publicLinkEnabled":false}`.
  - FR3.01 asserts the full body `{"data":{"type":"betaGroups","id":"<id>","attributes":{"publicLinkEnabled":false}}}` and the trailer `[dry-run] 1 write(s) skipped`. The internal group (`publicLinkEnabled: null`) gets no write. FR3.02 covers the no-op (`= public link already disabled on all groups`). Red: unknown command.
- [x] `remove-public-link-testers --dry-run`: N `[dry-run] DELETE /betaTesters/<id>/relationships/apps` lines, where N = the `list-testers --type=PUBLIC_LINK` total (12 expected), and 0 lines for EMAIL ids.
  - FR3.03 expects 12 DELETEs, body `{"data":[{"type":"apps","id":"6761698411"}]}`, and trailer 12. FR3.06 covers 2 explicit ids, FR3.08 the no-op (`= no PUBLIC_LINK testers`), and FR3.09 / FR3.10 the after-lockdown `Total: 0` and the 2 EMAIL testers. Red: unknown command.
- [x] `remove-public-link-testers <email-tester-id> --dry-run`: exit 1, `Refusing: <id> is EMAIL`, 0 `[dry-run]` lines.
  - FR3.04. FR3.05 is the mixed list `<PUBLIC_LINK id> <EMAIL id>`, which must also make 0 writes (validate every id first). FR3.07 is an unknown id, looked up with `GET /betaTesters/{id}`.

### FR4: Version record commands (expected transcripts)
- [x] `create-version 1.1 --dry-run`: exit 1 (format), 0 `[dry-run]` lines.
  - FR4.01 (bad format) and FR4.02 (no version). Also FR4.06: `1.2.0` while 1.1.0 is editable → refuse, never rename. And FR4.07: `1.1.0` while it's `WAITING_FOR_REVIEW` → refuse and print the state.
- [x] `create-version 1.1.0 --dry-run` (no 1.1.0 record): 1 `[dry-run] POST /appStoreVersions` containing `"versionString":"1.1.0"`, `"platform":"IOS"`, `"releaseType":"AFTER_APPROVAL"`, plus 1 `[dry-run] POST /appStoreVersionPhasedReleases` with `<new-version-id>` and `"phasedReleaseState":"INACTIVE"`. Ends with `[dry-run] 2 write(s) skipped`.
  - FR4.03 compares both bodies exactly against spec FR4. FR4.04 covers a record with no phased release (1 POST, real id). FR4.05 covers the re-run (`= version 1.1.0 already exists (PREPARE_FOR_SUBMISSION)`, `= phased release already configured (INACTIVE)`, 0 writes).
- [x] `set-whats-new --file /tmp/empty.txt --dry-run`: exit 1. `attach-build --dry-run` (no id): exit 1, usage. `submit-app-review --dry-run` (no id): exit 1, usage.
  - FR4.19 (empty), FR4.20 (whitespace only), FR4.27 (no text), FR4.08 (`attach-build <buildId>` usage), FR4.30 (`submit-app-review <buildId>` usage, no auto-pick).
  - Other set-whats-new cases: FR4.21 (the PATCH with trimmed file contents on the **en-US** loc; the en-GB loc is listed first), FR4.22 (inline text), FR4.23 (4001 chars → refuse), FR4.24 (exactly 4000 → accept), FR4.25 (`= whatsNew unchanged`), FR4.26 (no en-US loc → refuse).
  - Attach guards: (a) FR4.15 PROCESSING, (b) FR4.13 expired, (c) FR4.14 other marketing version, (d) FR4.10 build 17 vs a VALID 18. FR4.16 checks that a non-VALID 19 doesn't block. FR4.16b checks that 18 replaces an attached 17. FR4.11 is the 1-PATCH preview, FR4.12 the already-attached no-op, FR4.17 an unknown id.
  - Submit: FR4.32 (17 refused through `attachBuild`), FR4.33 (attached 18 → `= build 18 already attached` + POST `/reviewSubmissions`, POST `/reviewSubmissionItems` with `<new-submission-id>`, PATCH `/reviewSubmissions/<new-submission-id>` `{submitted:true}`, trailer 3), FR4.34 (not attached → 4).
  - Notes: FR4.28 (the PATCH equals the old notes with only the Unlisted sentence replaced), FR4.29 (`= review notes unchanged`).
  - check-submission: FR4.35 (the FR4 fields after the FR7 writes), FR4.36 (no editable appInfo → still exit 0, phased `none`).
- [x] Before 1.1.0 exists: `set-whats-new --file /tmp/whats-new-1.1.0.txt --dry-run`, `attach-build <id> --dry-run` and `set-review-notes --dry-run` all exit 1 with "run create-version".
  - FR4.18, FR4.09 and FR2.12, plus FR4.31 (`submit-app-review <build17-id> --dry-run`). Each must print `create-version <x.y.z>` as the command's own refusal, not the global usage.

### FR5: Compliance metadata (expected transcripts)
- [x] `curl -s -o /dev/null -w '%{http_code}\n'` on each of the 3 `URLS`. Record them (404 until spec 01 deploys).
  - 2026-10-20: `…/hourglass-app/privacy-policy.html` → 404, `…/hourglass-app/support.html` → 404, `…/hourglass-app/` → 404.
- [x] Spec 01 not live: `set-urls --dry-run` → exit 1, `URL not live: …`, 0 `[dry-run]` lines.
  - FR5.01 requires the exact `URL not live: <URLS.*> -> 404 (finish spec 01 / OPS O2)`. FR5.06 checks that a 301 is refused (no redirects followed, `fetch` included).
  - Other set-urls cases: FR5.02 (Pages live, no 1.1.0 → all 3 URLs checked, then "run create-version"), FR5.03 (3 PATCHes on the **editable** appInfo loc, the en-US version loc and the beta loc), FR5.03b (two editable appInfos → refuse), FR5.04 (diff-only attributes + 1 `= … URLs unchanged`), FR5.05 (3 unchanged, 0 writes). FR5.08 checks that `setBetaInfo`/`setStoreListing` read `URLS.*`.
- [x] No 1.1.0 record: `set-social-media-age-rating --dry-run` → exit 1, "run create-version".
  - FR5.09. FR5.10 is the preview: it shows `socialMedia: null`, sends 1 PATCH whose attributes are exactly `{"socialMedia":false}`, prints FOUR_PLUS and the Brazil value, and reads `/appInfos/<editable>/ageRatingDeclaration`, not the live one. FR5.11 is the no-op, FR5.12 the missing key (refuse, list keys), FR5.13 the non-FOUR_PLUS warning.
- [x] `grep -c "hourglass/hourglassws" .appstore/asc.js` → expected `0` after the fix (record the current count; expected 4).
  - Current count: 4 (as expected). FR5.07.

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

**2026-10-20 (implement, Phase X.0 = Phases 1.0 + 2.0, tests first):**
- **FR1:** added the `05-release-build-18` block to `__tests__/config/app-config.test.ts`. The only new import is `@/eas.json`, with no `fs`/`path`/`__dirname`. It's red for the right reasons: `17 < 18`, and `cli` has no `appVersionSource`. Semver passes. `tsc` count unchanged (541 in this worktree), and the file is ESLint-clean.
- **FR6:** recorded red baselines for every RELEASING.md / OPS.md check. `/tmp/releasing-before.md` and `/tmp/ops-before.md` are saved from `9c1652e`. Several whole-file greps already pass on spec 04's text (`--dry-run`, `runtimeversion:resolve`, `app-build-version`, `spec 05`), so section- and line-scoped variants are written down next to them.
- **FR2–FR5 (asc.js):** made the backup `.appstore/asc.js.bak-20261019`. That name was set by the orchestrator; the session date rolled to 10-20 mid-run. Nothing else in the main checkout was edited.
  - Every live probe hits the hidden 403.
  - The Phase 2.0 transcripts are encoded in `asc-offline/check.js`, 82 cases, red phase OK (see the Phase 2.0 header). This harness is test tooling in the spec folder: no secrets, ESLint-clean, not matched by Jest's `testMatch` or by tsc's `include`. It doesn't replace the Phase 3 live transcripts.
  - **Harness rules that go beyond the literal checklist wording**, so Phase 2.1 implements against them:
    - (1) Validation and lookup refusals must be the command's own error, not the global usage.
    - (2) The contract GETs are asserted: `GET /betaTesters/{id}` for explicit ids, `GET /builds/{id}?include=preReleaseVersion`, `/appInfos/<editable>/ageRatingDeclaration`, and `/apps/{id}/appInfos`.
    - (3) There must be one `[http]` stderr line per ASC request.
    - (4) The `remove-public-link-testers` and `set-urls` writes may come in any order.
    - (5) FR5.13 doesn't assert an exit code for the non-FOUR_PLUS warning.
  - The test-design validators (Phase 1 and Phase 2 gates) are run separately by the orchestrator.
