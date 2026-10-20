# Release Build 18 (v1.1.0)

**Status:** Draft
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Build 18 is the binary that carries specs 01–04 and spec 07 to the App Store. Spec 07 needs at least its PR A (FR1 Buffer fix + FR2); PR B may follow (FR7 Gates). It keeps marketing version `1.1.0` (never on sale) and bumps only `ios.buildNumber` to `"18"`. This spec has three parts:

1. **Repo changes (tracked, in a PR):**
   - Bump `app.json` `ios.buildNumber` to `"18"`.
   - Pin `eas.json` `cli.appVersionSource` to `"local"`, so EAS keeps honoring `app.json`.
   - Add range-based assertions to `__tests__/config/app-config.test.ts`.
   - Add a native-release runbook section to `docs/RELEASING.md`.
   - Re-own OPS.md O3, O4 and O6 to Claude (asc.js), with Jaime only as the UI fallback (FR6).
2. **Local tooling (untracked):** Harden `.appstore/asc.js`, the gitignored App Store Connect (ASC) API helper that exists only in the main checkout, so Claude can do the ASC work itself instead of handing it to the user:
   - Fix the crash on testers with a null email and the unguarded version lookup.
   - Add a global `--dry-run` flag and idempotent commands for: the age-rating Social Media answer, the legal URLs, TestFlight public-link lockdown, creating the 1.1.0 version record (with phased release), attaching the build, and What's New.
3. **Release execution:**
   - Pre-flight, then ASC preparation, an EAS cloud build, upload and attaching the build, all done by Claude. ASC preparation comes before the build so the public TestFlight link is off before build 18 lands (OPS O6).
   - The user then runs the TestFlight smoke test on iOS 27, fills in the App Privacy label, and accepts Apple's agreement.
   - Implementation stops at "ready to submit". The user decides when to submit, after the smoke test passes.

Changes to asc.js can't be covered by Jest because the file is untracked and absent from worktrees and CI. They're verified with `node --check`, `--dry-run` transcripts, request tracing (`ASC_TRACE=1`) and read-only GETs, all recorded in `checklist.md`. **No ASC network writes happen while asc.js is being implemented.** Live writes happen only in the release-execution phase (FR7), each preceded by a dry run of the same command.

---

## Out Of Scope

1. **Submitting 1.1.0 for App Review.** **Descoped (user decision).** The user submits only after the TestFlight smoke test passes. The runbook (FR6) documents the command (`submit-app-review <buildId>`), and FR4 hardens it, but implementation never runs it.

2. **App Privacy nutrition label (OPS O5).** **Descoped (user step).** App privacy details aren't exposed by the public ASC API. The user declares Device ID → App Functionality, Not Linked, Not Used for Tracking in the ASC UI.

3. **Accepting Apple's updated agreement.** **Descoped (user step).** Only the Account Holder can accept it (ASC → Business). As of 2026-10-19 the ASC API returns `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`, which blocks every asc.js call, `eas submit`, and every read-only verification in this spec until it's accepted.

4. **Baseline OTA after release.** **Deferred to `04-ota-lane`** (FR4 / runbook A). This spec's runbook links to it as the first post-release step.

5. **ASC key rotation, checkpoint purge, untracking `hourglassws/` (OPS O8–O10).** **Descoped (OPS.md, post-release).** asc.js keeps `KEY_ID`/`ISSUER_ID`/`KEY_PATH` as top-of-file constants, so O8 stays a one-line edit.

6. **Committing asc.js to the repo.** **Descoped.** It embeds the key id and issuer and stays gitignored (`.gitignore:62`).

7. **Moving the two EMAIL testers to an internal TestFlight group (tail of OPS O6).** **Descoped.** Internal groups only accept App Store Connect team users. The EMAIL testers stay in the external "Test" group with the public link disabled. FR6 strikes this step from OPS.md O6 with this reason.

8. **Fixing `set-metadata`'s age-rating block and refreshing `set-store-listing`'s description copy.** **Descoped.** Neither command runs during this release. `set-metadata` reads `/apps/{id}/ageRatingDeclaration` and silently skips when `data.id` is missing (`asc.js:340-342`). Only the stale URLs in `set-store-listing`/`set-beta-info` are fixed (FR5), so re-running them can't bring back the dead links.

9. **Build 19 / SDK 55 patch refresh.** **Deferred to `06-dependency-hygiene`**, which takes the next unused build number.

10. **Android release.** **Descoped** (FEATURE.md non-goal).

11. **Foreground OTA checks.** **Descoped** (FEATURE.md non-goal).

12. **Changing App Review notes beyond tense.** **Descoped.** Only the Unlisted sentence moves to the granted tense (FR4). Demo-account credentials are left untouched.

---

## Functional Requirements

### FR1: Build number 18 with a pinned local version source

Bump the build number and make sure EAS actually uses it.

**Requirements:**
- `app.json` `expo.ios.buildNumber` = `"18"` (a string). `expo.version` stays `"1.1.0"`.
- `eas.json` gains `"appVersionSource": "local"` inside the existing `cli` object. `cli.version` is unchanged.
  - eas-cli 20.1.0 (installed) treats an unset source as local but warns that it "will be required in the future".
  - If an upgraded eas-cli defaulted to `remote`, it would ignore `app.json` `buildNumber` (`remoteVersionSource.js`).
- Add a `describe('05-release-build-18')` block to `__tests__/config/app-config.test.ts`. Spec 03 creates that file and spec 04 extends it. All assertions are range-based, so later specs that take build 19+ don't break the test.
- Follow spec 03's test-file contract: typed JSON imports only. Reuse spec 03's module-level `expo` (`import appJson from '@/app.json'`) and add `import easJson from '@/eas.json'` beside spec 03's imports. Don't use `fs`, `path` or `__dirname`. `tsconfig.json` has `"types": ["jest"]` and no Node types until spec 07 FR3, so they'd add TS2307/TS2304 errors that spec 07 then has to clear.

**Success Criteria:**
- [ ] `ios.buildNumber` is a `string` matching `/^\d+$/`, and `Number(buildNumber) >= 18`.
- [ ] `expo.version` matches `/^\d+\.\d+\.\d+$/`.
- [ ] `eas.json` `cli.appVersionSource === 'local'`, asserted as `expect(easJson.cli).toHaveProperty('appVersionSource', 'local')`. Reading `easJson.cli.appVersionSource` directly is TS2339 on current `main`, because the inferred JSON type has no such key (checked with `tsc`, 2026-10-19). `toHaveProperty` type-checks before and after FR1.
- [ ] The new tests fail on current `main` (`"17"`, no `appVersionSource`) and pass after the change.
- [ ] `npx expo config --type public --json` reports `ios.buildNumber: "18"` and `version: "1.1.0"`.
- [ ] No test hard-codes `=== "18"`.
- [ ] The block adds no `fs`/`path`/`__dirname` usage and no new `import` other than `@/eas.json`.

---

### FR2: asc.js safety fixes and dry-run plumbing

Fix the two release-blocking bugs and add the shared infrastructure every new command uses.

**Requirements:**
- **Back up first:** `cp .appstore/asc.js .appstore/asc.js.bak-<YYYYMMDD>`. The file is untracked, so there's no git history to revert to.
- **Null-safe tester listing (`listTesters`, `asc.js:87-98`):**
  - `email ?? '<anonymous>'`.
  - `firstName ?? ''` and `lastName ?? ''`. The destructuring defaults at line 94 don't apply to `null`, so today the code prints `"null null"`.
  - `inviteType ?? ''`.
  - Print each tester's `t.id` as the first column.
  - Accept an optional `--type=PUBLIC_LINK|EMAIL` client-side filter.
  - Print the total and a per-`inviteType` count.
- **Surface API errors in `getAppId()` (`asc.js:79-83`):** if `res.errors` is present, throw `ASC API error: <status> <code> — <title>` instead of the misleading `App not found for bundle ID`. The 403 agreement error currently shows up as "App not found".
- **New `request(method, path, body) → Promise<{ status, body }>`:**
  - `api()` keeps its current contract by returning `request().body`, so existing callers are unchanged.
  - When `ASC_TRACE=1`, `request()` writes `[http] <METHOD> <path> -> <status>` to stderr.
  - `request()` throws `Refusing <METHOD> in --dry-run` if `DRY_RUN` is set and the method isn't `GET`. This is a backstop.
- **New `write(method, path, body)`:** all new and modified write paths use it.
  - Under `DRY_RUN` it prints `[dry-run] <METHOD> <path> <compact JSON body>` to stdout, increments a counter, and resolves `null` without calling `request()`.
  - Otherwise it calls `request()` and throws on `status >= 400` or `body.errors`.
  - Commands print `[dry-run] <n> write(s) skipped` at the end of a dry run.
- **Global `--dry-run` flag:**
  - Parse it from anywhere in `process.argv`.
  - Strip it, and the `--type=`/`--file` options, before reading positional args.
- **Editable-only `getLatestVersion()` (`asc.js:384-391`):**
  - Fetch all iOS versions.
  - Keep those whose `versionState(v)` is in `EDITABLE_VERSION_STATES = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED']`.
    - `versionState(v)` = `v.attributes.appVersionState ?? v.attributes.appStoreState`.
    - This matches the list already at `asc.js:417`.
  - Throw `No editable App Store version (live: <versionString> <state>). Run: node .appstore/asc.js create-version <x.y.z>` if none match.
  - Throw if more than one matches.
  - Its callers `set-review-notes` (line 394) and `submit-app-review` (line 415) inherit the guard.
- **New `getNewestVersion()`:** the old unfiltered "newest by `createdDate`" behavior, used **only** by `check-submission` (line 474). Without it, the read-only status command would start throwing once 1.1.0 moves to `WAITING_FOR_REVIEW`.
- **New `getEditableAppInfo(appId)`:**
  - From `GET /apps/{id}/appInfos`, return the appInfo whose `state ?? appStoreState` is in `['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED']`.
  - Throw the same "run create-version" message if there's none.
  - This replaces the `appInfos.data?.[0]` pattern (lines 241, 323) for new commands. That pattern picks an arbitrary appInfo once a live one and an editable one both exist.
- **Move the `// ── Main` dispatcher to the end of the file and put new constants in the Config block at the top:**
  - Today `fn()` is invoked at line 233, before later `const` declarations are initialized (e.g. `REVIEW_NOTES_UNLISTED`, line 382).
  - A new command that reads a later `const` before its first `await` would throw a TDZ `ReferenceError`.
- **Update the usage string and header comment** to list every command and the `--dry-run` flag.

**Success Criteria:**
- [ ] `node --check .appstore/asc.js` exits 0.
- [ ] `node .appstore/asc.js list-testers` prints a table including the 12 `PUBLIC_LINK` rows as `<anonymous>`, each with an id, and no `null` text. Before the fix it fails with `Cannot read properties of null (reading 'padEnd')`.
- [ ] `list-testers --type=PUBLIC_LINK` prints only `PUBLIC_LINK` rows. `--type=EMAIL` prints only the email testers.
- [ ] While the agreement is unaccepted, any command prints `ASC API error: 403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED …` and exits 1, not "App not found".
- [ ] Before 1.1.0 exists:
  - `set-review-notes --dry-run` exits 1 with `No editable App Store version (live: 1.0 READY_FOR_SALE…)` (or `READY_FOR_DISTRIBUTION`, depending on which attribute is populated).
  - `check-submission` still prints the 1.0 record.
- [ ] `ASC_TRACE=1 node .appstore/asc.js <any write command> --dry-run 2>&1 | grep -E '^\[http\] (POST|PATCH|DELETE)'` prints nothing for every command in FR3–FR5.
- [ ] `builds`, `beta-info` and `check-submission` still produce their pre-change output format (beyond the FR4 additions to `check-submission`).

---

### FR3: TestFlight public-link lockdown (OPS O6)

Stop strangers from getting the unreleased build, while keeping the two EMAIL testers.

**Requirements:**
- **`disable-public-link [--dry-run]`:**
  - `GET /apps/{appId}/betaGroups`.
  - Print every group: id, name, `isInternalGroup`, `publicLinkEnabled`, `publicLink`.
  - For each group with `publicLinkEnabled === true`, `write('PATCH', '/betaGroups/{id}', { data: { type: 'betaGroups', id, attributes: { publicLinkEnabled: false } } })`.
  - If no group has it enabled, print `= public link already disabled on all groups` and exit 0.
- **`remove-public-link-testers [<testerId> ...] [--dry-run]`:**
  - **No ids:** target every app tester with `inviteType === 'PUBLIC_LINK'`.
  - **With ids:**
    - `GET /betaTesters/{id}` for each.
    - **Validate every id before any write.** If any id isn't `PUBLIC_LINK`, exit 1 with `Refusing: <id> is <inviteType>` and write nothing.
  - For each target, `write('DELETE', '/betaTesters/{id}/relationships/apps', { data: [{ type: 'apps', id: appId }] })`. This is the same call as the existing `removeTester` (`asc.js:129-131`).
  - If there are no PUBLIC_LINK testers, print `= no PUBLIC_LINK testers` and exit 0.
  - `EMAIL` testers are never touched.
- Run order is always `disable-public-link`, then `remove-public-link-testers`, so nobody can re-join between the two.

**Success Criteria:**
- [ ] The `disable-public-link --dry-run` transcript lists the external group "Test" with `publicLinkEnabled: true` and exactly one `[dry-run] PATCH /betaGroups/<id>` line whose body is `publicLinkEnabled:false`.
- [ ] The `remove-public-link-testers --dry-run` transcript shows exactly 12 `[dry-run] DELETE /betaTesters/<id>/relationships/apps` lines (or the current PUBLIC_LINK count shown by `list-testers --type=PUBLIC_LINK`) and none for EMAIL testers.
- [ ] Passing an EMAIL tester's id exits 1 with `Refusing:` and has zero `[dry-run]` lines.
- [ ] After the live run (FR7):
  - `disable-public-link --dry-run` prints `= public link already disabled…`.
  - `list-testers --type=PUBLIC_LINK` prints `Total: 0`.
  - `list-testers --type=EMAIL` still shows the 2 email testers.
- [ ] A second live run of either command makes zero writes.

---

### FR4: Version record commands (create, attach, What's New, review notes, submit guard)

Let Claude create and fill in the 1.1.0 version record without the ASC UI.

**Requirements:**
- **`create-version <versionString> [--dry-run]`:**
  - Validate `/^\d+\.\d+\.\d+$/`.
  - **No editable version exists:** POST `/appStoreVersions` with `{ data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString, releaseType: 'AFTER_APPROVAL' }, relationships: { app: { data: { type: 'apps', id: appId } } } } }`.
  - **An editable version exists with the same `versionString`:** print `= version <v> already exists (<state>)` and skip the POST.
  - **An editable version exists with a different `versionString`:** exit 1. Never rename.
  - **The same `versionString` exists in a non-editable state (e.g. `WAITING_FOR_REVIEW`):** exit 1, printing the state.
  - **Phased release (Decision 3):**
    - `GET /appStoreVersions/{id}/appStoreVersionPhasedRelease`.
    - If there's no data, POST `/appStoreVersionPhasedReleases` with `{ data: { type: 'appStoreVersionPhasedReleases', attributes: { phasedReleaseState: 'INACTIVE' }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id } } } } }`.
    - If it already exists, print `= phased release already configured (<state>)`.
  - In a dry run with no existing version, the phased-release step prints with the placeholder id `<new-version-id>`.
- **`attach-build <buildId> [--dry-run]`:** a build id is required, with no auto-pick.
  - `GET /builds/{id}?include=preReleaseVersion`.
  - Refuse (exit 1, no write) unless all of these hold:
    - (a) `processingState === 'VALID'`.
    - (b) `expired !== true`.
    - (c) The included `preReleaseVersions.version` equals the editable version's `versionString`.
    - (d) No other `VALID`, non-expired build of that marketing version has a higher numeric `attributes.version`. This is what stops build 17 from being attached once 18 is valid.
  - If `GET /appStoreVersions/{id}/build` already returns that id, print `= build <n> already attached`.
  - Otherwise, `write` the existing PATCH from `asc.js:429-434`, moved into a shared `attachBuild()`.
- **`set-whats-new <text> | --file <path> [--dry-run]`:**
  - Trim the text. It must be non-empty and ≤ 4000 characters.
  - Target the `en-US` `appStoreVersionLocalization` of the editable version. Exit 1 if it's missing.
  - If `whatsNew` is already equal, print `= whatsNew unchanged`.
  - Otherwise PATCH `{ whatsNew }`.
- **Review notes:**
  - Change `REVIEW_NOTES_UNLISTED` to the granted tense. Replace "We intend to distribute this app via Unlisted App Distribution rather than public App Store listing, per Apple's guidance under Guideline 3.2." with "This app is distributed via Unlisted App Distribution, as approved under Guideline 3.2, rather than a public App Store listing." Leave the rest of the text unchanged.
  - `set-review-notes` gains `--dry-run` and an equality no-op (`= review notes unchanged`).
- **`submit-app-review <buildId> [--dry-run]`:**
  - Require `buildId` (remove the auto-pick at lines 421-426).
  - Remove the "Proceeding anyway" branch (417-419), which `getLatestVersion()` now makes unreachable.
  - Attach through `attachBuild()` so it gets the same guards.
  - Route its three writes through `write()`, so `--dry-run` previews the whole submission.
  - Implementation must not run it live.
- **`check-submission`** (read-only, via `getNewestVersion()`) additionally prints, for the newest version:
  - `releaseType`.
  - Phased release state (or `none`).
  - `copyright`.
  - The en-US `whatsNew` (first 120 chars), `supportUrl` and `marketingUrl`.
  - The editable appInfo's en-US `privacyPolicyUrl`.
  - The age-rating `socialMedia` value and `appStoreAgeRating` from the editable appInfo, when there is one.

**What's New copy for 1.1.0 (Decision 2; each item verified against `main`, and every one postdates build 15 `e7fb801`):**

```
• Managers: a new Team view in Overview lets you switch between your own numbers and your team's.
• New Patterns card in Overview shows when in the day you work and focus best.
• Your hours headline now includes overtime you've worked that is still awaiting approval.
• Privacy Policy and Support are now in Settings.
```

The copy doesn't mention Org scope, which is hard-disabled at `src/components/OverviewStickyBar.tsx:124`.

**Success Criteria:**
- [ ] With no 1.1.0 record, the `create-version 1.1.0 --dry-run` transcript shows exactly one `POST /appStoreVersions` with `versionString:"1.1.0"`, `platform:"IOS"`, `releaseType:"AFTER_APPROVAL"`, plus one `POST /appStoreVersionPhasedReleases` with `<new-version-id>`.
- [ ] `create-version 1.1` (bad format) exits 1 with zero writes.
- [ ] After the live create, a re-run prints `= version 1.1.0 already exists (PREPARE_FOR_SUBMISSION)` and `= phased release already configured (INACTIVE)`, with zero writes.
- [ ] `attach-build <build17-id> --dry-run` exits 1 with a "newer valid build 18 exists" refusal once build 18 is `VALID`. `attach-build <build18-id> --dry-run` shows exactly one PATCH.
- [ ] `set-whats-new --file <path> --dry-run` shows one PATCH whose `whatsNew` equals the file contents, trimmed. An empty file exits 1.
- [ ] `submit-app-review` with no argument exits 1 with a usage error.
- [ ] Once 1.1.0 exists and build 18 is `VALID` and attached (FR7 Attach step), `submit-app-review <build18-id> --dry-run` prints the attach PATCH (or `= build 18 already attached`), the `POST /reviewSubmissions`, the `POST /reviewSubmissionItems` and the `PATCH /reviewSubmissions/<new-submission-id>` as `[dry-run]` lines, ending `[dry-run] 3 write(s) skipped` (4 if the attach is previewed), and `ASC_TRACE` shows no non-GET request. Before then the command can only reach its "run create-version" or attach-guard refusals, so this preview is recorded in Phase 3.1. It is a dry run only and is never run live in this spec.
- [ ] After the FR7 live writes, `check-submission` shows: version `1.1.0 PREPARE_FOR_SUBMISSION`, attached build `v18`, `releaseType AFTER_APPROVAL`, phased release `INACTIVE`, the What's New text, and review notes matching the updated text.

---

### FR5: Compliance metadata commands (URLs + Social Media age rating)

Point every ASC URL at the live Pages site and answer the unanswered age-rating question (OPS O3, O4).

**Requirements:**
- Add a `URLS` constant in the Config block:
  - `privacy`: `https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html`
  - `support`: `https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html`
  - `marketing`: `https://jaime-alvarez-trilogy.github.io/hourglass-app/`
  - These are the spec 01 public contract, and spec 02's `legalLinks.ts` uses the same values.
- Replace the hard-coded dead `…/hourglass/hourglassws/privacy-policy.html` URLs in `setBetaInfo` (`asc.js:188`) and `setStoreListing` (`asc.js:253, 283, 284`) with `URLS.*`.
- **`set-urls [--dry-run]`:**
  - (1) Fetch each of the 3 URLs with Node `https`, without following redirects. If any status isn't `200`, exit 1 with `URL not live: <url> -> <status> (finish spec 01 / OPS O2)` and make zero writes. The check runs in dry-run too.
  - (2) PATCH the editable appInfo's en-US `appInfoLocalizations` with `{ privacyPolicyUrl }`.
  - (3) PATCH the editable version's en-US `appStoreVersionLocalizations` with `{ supportUrl, marketingUrl }`.
  - (4) PATCH the en-US `betaAppLocalizations` with `{ privacyPolicyUrl }`. TestFlight external testing has its own copy of the dead URL.
  - Each PATCH sends only the fields that differ. If none differ, print `= <resource> URLs unchanged`.
- **`set-social-media-age-rating [--dry-run]`:**
  - `GET /appInfos/{editableAppInfoId}/ageRatingDeclaration`.
  - The attribute key is `socialMedia`. The 2026-09-22 audit read it as `null` while sibling capability answers were explicit `false`.
  - **Key absent from the response:** exit 1 with `socialMedia not exposed by the API; do OPS O3 in the ASC UI`, list the attribute keys returned, and make no write.
  - **Value already `false`:** print `= socialMedia already false`.
  - **Otherwise:** PATCH `/ageRatingDeclarations/{id}` with `{ socialMedia: false }` only. Never resend the other answers.
  - Print the editable appInfo's `appStoreAgeRating` and any attribute matching `/brazil/i` after the write (or the current values in a dry run). Warn if the rating isn't `FOUR_PLUS`.

**Success Criteria:**
- [ ] Before spec 01 is deployed, `set-urls --dry-run` exits 1 with `URL not live:` and zero `[dry-run]` lines.
- [ ] After spec 01 is live and 1.1.0 exists, the `set-urls --dry-run` transcript shows 3 PATCH lines:
  - `appInfoLocalizations/<id>` → privacy.
  - `appStoreVersionLocalizations/<id>` → support + marketing.
  - `betaAppLocalizations/<id>` → privacy.
  - Every URL equals `URLS.*`.
- [ ] `grep -c "hourglass/hourglassws" .appstore/asc.js` returns `0`.
- [ ] The `set-social-media-age-rating --dry-run` transcript shows the current `socialMedia: null` and exactly one PATCH whose attributes object is `{"socialMedia":false}`.
- [ ] After the live runs, re-running both commands makes zero writes, and `check-submission` shows the 3 new URLs, `socialMedia false` and `appStoreAgeRating FOUR_PLUS`.

---

### FR6: Native release runbook in `docs/RELEASING.md`, and OPS.md ownership

Write down the native release procedure so build 19+ follows the same path. Make OPS.md agree with who actually does each ASC step.

**Requirements:**
- Append a `## Native release` section to `docs/RELEASING.md`. Spec 04 creates the file with the OTA runbook. Leave spec 04's content untouched.
- Use these subsections, in this order. The order matches FR7's execution order:
  1. **Pre-flight.**
  2. **App Store Connect prep (asc.js).** The pre-build commands, in FR7 order: `disable-public-link`, `remove-public-link-testers`, `create-version`, `set-urls`, `set-social-media-age-rating`, `set-whats-new`, `set-review-notes`.
  3. **Build.**
  4. **Upload.**
  5. **Attach and verify (asc.js).** `attach-build <buildId>` once the build is `VALID`, then `check-submission`.
  6. **TestFlight smoke.**
  7. **User-only steps.**
  8. **Submit.**
  9. **Post-release.**
  10. **If something fails.**
- ASC prep must come before Build, for two reasons. The public TestFlight link has to be off and the public testers removed before the new build lands in TestFlight (OPS O6). And `set-urls`' 200 check is cheap, so it should fail before a long build rather than after it. State both reasons in the runbook.
- Tag every step with its owner: **C** (Claude, CLI/API) or **J** (Jaime, browser or device).
- State that asc.js commands and `eas submit` must run from the **main checkout**, because `.appstore/` is gitignored and absent from worktrees.
- Note that every asc.js write is run with `--dry-run` first.
- Build numbers: "take the next unused build number (`node .appstore/asc.js builds`), never reuse one". The section must not hard-code 18 as a rule; 1.1.0/18 appears only as the worked example.
- Include the What's New copy guidance: user-visible changes since the last live build, and nothing about disabled features.
- The Build step checks the iOS runtime with `npx expo-updates runtimeversion:resolve --platform ios` (spec 04). Never write `npx expo-fingerprint`: it isn't an npm package (404), and spec 04's `grep -n 'expo-fingerprint' docs/RELEASING.md` check covers the whole file, including this section. Don't use the bare `@expo/fingerprint` CLI either. It hashes both platforms, so it never matches the iOS runtime.
- **Pre-flight** lists `npm run typecheck` and `npm run lint` as "when present". They must exit 0 once spec 07 PR B (FR3–FR8) has merged. Before that, the `typecheck` script doesn't exist and `lint` still has spec 07's 9 errors, so both are recorded as `skipped: 07 PR B pending`. `npx jest --runInBand` with 0 failures is always required.
- **Build** says store builds run on **EAS cloud** (`eas build -p ios --profile production`), never `eas build --local`, and gives both reasons:
  - (1) A local build creates no EAS build record. Spec 04's publish guard (`eas build:list --runtime-version`), spec 04 runbook A step 1 and spec 06's `build-<N>` tag all read that record.
  - (2) A local build ignores the EAS image and uses this Mac's Xcode, which is 27.0 as of 2026-10-19 (spec 09). Builds on SDK 55, which has no scene lifecycle, must not be compiled against the iOS 27 SDK (FEATURE.md).
- Build records the EAS build id (required). Before Upload, it checks that `eas build:list --platform ios --status finished --channel production --app-build-version <N> --limit 1 --json --non-interactive` returns that id, with `gitCommitHash` equal to the pushed HEAD and `runtimeVersion` equal to the local resolve.
- **Upload** uses `eas submit -p ios --profile production --latest`, with no `--path <ipa>` variant. It then waits for `VALID` and runs the **(J) ITMS-91053 check** from FR7 Upload, written for build N with build N−1's processing email as the baseline. It keeps all three decision branches.
- **OPS.md ownership (same docs PR as the runbook):** edit `features/app/store-compliance/OPS.md` → "Before build 18 is submitted" so each item has one owner:
  - **O3 → `(C)`.** `node .appstore/asc.js set-social-media-age-rating`, `--dry-run` first (spec 05 FR5). J is the UI fallback only when the command refuses (`socialMedia not exposed by the API`) or the rating isn't `FOUR_PLUS` / Brazil L afterwards. In that case J uses the existing ASC UI steps, including "if locked, do it on the 1.1.0 version record".
  - **O4 → `(C)`.** `node .appstore/asc.js set-urls`, `--dry-run` first (spec 05 FR5). It refuses until the spec 01 URLs return 200, which replaces the "only after spec 01's curl checks return 200" rule. Marketing URL = `…/hourglass-app/` (not blank). J is the UI fallback only when it fails with an ASC API error. A `URL not live` refusal means: finish spec 01 / O2 first.
  - **O6 → `(C)`.** `disable-public-link`, then `remove-public-link-testers`, each `--dry-run` first (spec 05 FR3), still **before** build 18 is uploaded. J is the UI fallback (ASC → TestFlight → "Test") only when either command errors.
  - **O6's "Move the two email testers to an internal group"** is struck through (`~~…~~`). Reason: internal groups only accept App Store Connect team users (spec 05 Out of Scope 7), so the EMAIL testers stay in "Test" with the public link off.
  - Leave O1, O2, O5 and O7–O11 untouched. Tick nothing in this edit. FR7 ticks O6, O4 and O3 as each one's live run and idempotent re-run are recorded.

**Success Criteria:**
- [ ] `grep -n '^## Native release' docs/RELEASING.md` matches once, and the 10 subsection headings appear in the order above. Check with `grep -n '^### ' docs/RELEASING.md`. "App Store Connect prep (asc.js)" has a lower line number than "Build", and "Attach and verify (asc.js)" has a higher one than "Upload".
- [ ] The section names these commands verbatim:
  - `npx jest --runInBand`
  - `npm run typecheck` (marked "when present")
  - `npm run lint` (marked "when present")
  - `npx expo config --type introspect`
  - `npx expo-doctor`
  - `eas build -p ios --profile production`
  - `npx expo-updates runtimeversion:resolve --platform ios`
  - `eas build:list --platform ios --status finished --channel production --app-build-version`
  - `eas submit -p ios --profile production --latest`
  - Every asc.js command from FR3–FR5, each in its own subsection: the seven pre-build commands from subsection 2 under "App Store Connect prep (asc.js)", `attach-build` and `check-submission` under "Attach and verify (asc.js)", and `submit-app-review` under "Submit".
- [ ] `grep -n 'expo-fingerprint' docs/RELEASING.md` prints nothing.
- [ ] Build says EAS cloud and gives both reasons against `--local`. Upload has no `--path` variant.
- [ ] `grep -n 'ITMS-91053' docs/RELEASING.md` matches inside the Upload subsection, and all three decision branches are present.
- [ ] Every step line carries `(C)` or `(J)`. The App Privacy label, the agreement acceptance, the ITMS-91053 email check, the smoke test and the submit decision are `(J)`.
- [ ] Spec 04's OTA section is unchanged (`git diff` shows only additions below it).
- [ ] OPS.md: O3, O4 and O6 are tagged `(C)`. Each cites spec 05 FR3/FR5 and names J only as a fallback. O6's internal-group move is struck through with the reason. `git diff features/app/store-compliance/OPS.md` touches only the O3, O4 and O6 lines, and none is ticked.

---

### FR7: Release execution up to "ready to submit"

Produce build 18, get it into TestFlight, and finish the 1.1.0 record. Stop before submission.

**Requirements:**
- **Gates (all must hold before any build or live write):**
  - Specs 01, 02, 03 and 04 are merged to `main`, along with FR1–FR6 of this spec.
  - Spec 07 **PR A** is merged to `main`: FR1, the Hermes-safe log rotation (Buffer fix), and FR2, removing the out-of-repo `NativeWindSmoke` test. PR A is what makes the 0-failure `npx jest --runInBand` below possible.
  - Spec 07 **PR B** (FR3–FR8: typecheck, lint, CI gates) is **not** a gate. Spec 07 is complexity L (526 TS errors), and its Release & Merge Order step 4 allows build 18 to ship with FR1+FR2 only. PR B may land after build 18 without forking the runtime:
    - Spec 04 FR2's `fingerprint.config.js` skips `PackageJsonScriptsAll`, so the new `typecheck` script isn't hashed.
    - `@types/node`, `tsconfig.json`, `eslint.config.js` and `test.yml` are fingerprint-neutral (spec 07 step 2).
    - Spec 07's "the `typecheck` script must be in the build-18 tree" coupling is out of date against spec 04 FR2. PR B's JS fixes can reach build-18 users by OTA (spec 04 `scripts/ota-publish.sh`).
  - `git status --porcelain` is empty.
  - `git rev-list --count origin/main..main` is `0`. Today `main` is 2 ahead: `fc24cd5` (build-17 bump) and `b6b79b7` (research). Pushing covers both.
  - (J) The agreement is accepted, and `node .appstore/asc.js builds` succeeds.
  - (J) Has given the go-ahead for live ASC writes.
- **Pre-flight (C):**
  - `npx jest --runInBand` has 0 failures (needs spec 07 PR A). `--runInBand` because the Android widget test flakes under parallel workers.
  - **If spec 07 PR B has merged:** `npm run typecheck` and `npm run lint` exit 0. **If it hasn't:** record `skipped: 07 PR B pending` for both and continue. Before PR B, the `typecheck` script doesn't exist and `expo lint` reports spec 07's 9 errors.
  - `npx expo config --type introspect` shows:
    - `UIBackgroundModes` = `["remote-notification"]` only.
    - No `NSFaceIDUsageDescription`.
    - `runtimeVersion` policy `fingerprint`.
  - The `npx expo-doctor` schema check passes. The package-version check may stay red until spec 06.
  - `scripts/check-legal-pages.sh` (spec 01) exits 0.
- **ASC prep, before the upload (C, each `--dry-run` then live):**
  1. `disable-public-link`.
  2. `remove-public-link-testers`.
  3. `create-version 1.1.0`.
  4. `set-urls`.
  5. `set-social-media-age-rating`.
  6. `set-whats-new --file <copy>`.
  7. `set-review-notes`.
  - **OPS.md ticks:** tick O6 after steps 1–2, O4 after step 4, and O3 after step 5 (with `FOUR_PLUS` confirmed). Tick each one only when its live run and its idempotent re-run (zero writes) are both recorded in the checklist. If a command takes its J fallback path, tick the item once J's UI change is confirmed by `check-submission` or `list-testers`.
- **Build (C), EAS cloud only:**
  - Run `eas build -p ios --profile production`. **`--local` is not allowed**, for two reasons:
    - (1) **No EAS record.** A `--local` build creates no EAS build record: eas-cli's `build/build.js` runs the local build plugin and never calls `sendBuildRequestAsync`. Spec 04 needs that record in three places. The FR3 audience guard (`eas build:list --runtime-version <RTV>`) would return `[]` and refuse every publish. FR4 runbook A step 1 reads build 18's `gitCommitHash` and `runtimeVersion` from `eas build:list --app-build-version 18`. And the baseline OTA (OPS O11) depends on both. Spec 06 FR7(b) also reads build 18's `gitCommitHash` from `eas build:list` to create the `build-18` tag. Without the record, the OTA lane can't be proven and spec 06 is blocked.
    - (2) **Wrong SDK.** This Mac has Xcode 27.0 (27A266a; spec 09 checklist Session Notes), and `--local` ignores the EAS image. A local build 18 would compile SDK 55, which has no scene lifecycle, against the iOS 27 SDK, and FEATURE.md says SDK 55 can't launch on that SDK. EAS cloud uses the `sdk-55` image, `macos-sequoia-15.6-xcode-26.2` (spec 09 E1).
  - Builds 10–17 did **not** all use `--local`. On 2026-10-19, EAS has finished production records for builds 13, 15 (`1b45a8a`) and 17 (`fc24cd5`). Builds 10, 11, 14 and 16 have no EAS record, and 12 has only a canceled preview record. Spec 09 names 10–12 and 16 as the local builds.
  - **Required records:** the EAS build id, its `gitCommitHash`, and the iOS runtime. An EAS cloud build always has an id. No id means the build wasn't a cloud build, so stop.
  - Record the local iOS runtime: run `npx expo-updates runtimeversion:resolve --platform ios` at the build commit (spec 04).
    - Don't use `npx expo-fingerprint` (npm 404) or the bare `@expo/fingerprint` CLI. The bare CLI hashes both platforms, so its hash never equals the iOS runtime (spec 04 Verified Facts).
  - **EAS record check, before upload:** run `eas build:list --platform ios --status finished --channel production --app-build-version 18 --limit 1 --json --non-interactive`. It must return the recorded EAS build id with:
    - `appVersion` `1.1.0` and `appBuildVersion` `18`.
    - `gitCommitHash` equal to the HEAD SHA recorded at the Gates.
    - `runtimeVersion` equal to the local resolve.
    - Stop if it returns `[]` or any field differs. This is the same lookup spec 04 runbook A step 1 and spec 06 FR7(b) use later, so passing it here proves they'll work.
  - Check that the build log shows build number 18, an Xcode 26.x image (not Xcode 27), and no `cli.appVersionSource` warning.
- **Upload (C, then J):**
  - (C) Run `eas submit -p ios --profile production --latest` from the main checkout. There is no `--path <ipa>` variant. Confirm that the build eas-cli submits is the recorded EAS build id. If any other iOS build has started since, use `--id <eas-build-id>` instead of `--latest`.
  - (C) Wait until `node .appstore/asc.js builds` shows `18 … VALID`.
  - **(J) ITMS-91053 check** (owned here, handed off by spec 03 Out of Scope #5; text verbatim):
    > **(J) ITMS-91053 check.** In the App Store Connect processing email for build 18, search for `ITMS-91053`. Check build 17's email too, as a baseline. Record either "none" or the binaries and API categories it lists.
    > - **It names only `ExpoWidgetsTarget`, and build 18 is `VALID`:** don't block submission. Open a follow-up for the next native build: give the `ExpoWidgets` pod its own `PrivacyInfo.xcprivacy` (`CA92.1`, `1C8F.1`) through the existing `patches/expo-widgets+55.0.5.patch`.
    > - **It names the main app binary:** spec 03's FR4 manifest is missing a reason. Add that reason to `ios.privacyManifests` and the FR4 contract test, then rebuild with the next unused build number before submitting.
    > - **Build 18 never reaches `VALID`:** this is a release blocker. Stop and escalate.
  - The checklist can't read "ready to submit" until this result is recorded and is either "none" or the first branch. The second branch restarts Build with the next unused build number. The third stops the release.
- **Attach (C):**
  - `attach-build <build18-id>` (dry run, then live), then `check-submission`.
  - Then run `ASC_TRACE=1 node .appstore/asc.js submit-app-review <build18-id> --dry-run` and record the full submission preview (FR4 success criterion). **Dry run only**: this spec never runs it live.
- **TestFlight smoke on an iOS 27 device (J; Claude records the results in the checklist):**
  - J installs through internal testing.
  - If `disable-public-link` output shows no internal group, J creates one in ASC → TestFlight and adds themself. Internal groups need no Beta App Review.
  - Run the 8 smoke checks listed in the Test Plan.
- **User-only steps (J):**
  - App Privacy label (OPS O5).
  - Confirm the demo account in App Review Information signs in on build 18.
- **Stop.** Mark the checklist "ready to submit" (only after the ITMS-91053 result allows it). Submission (`submit-app-review <build18-id>` or the ASC Submit button) is J's call and is outside implementation.

**Success Criteria:**
- [ ] The gates and every pre-flight command are recorded in the checklist with their output summary (pass counts, exit codes). Spec 07 PR A is merged. `npm run typecheck` / `npm run lint` read either exit 0 or `skipped: 07 PR B pending`.
- [ ] Every live asc.js write is preceded in the checklist by its dry-run transcript, and followed by a re-run showing zero writes (idempotence) or by `check-submission` output.
- [ ] Build 18 was built on EAS cloud (no `--local`). The ASC build id, EAS build id, `gitCommitHash` (equal to the gated HEAD SHA) and iOS runtime are recorded. `node .appstore/asc.js builds` lists build `18` as `VALID`.
- [ ] The `eas build:list --platform ios --status finished --channel production --app-build-version 18 …` record check ran before upload. It returned the recorded EAS build id, and its `runtimeVersion` equals the local `npx expo-updates runtimeversion:resolve --platform ios`.
- [ ] The ITMS-91053 result for builds 17 and 18 is recorded ("none" or the listed binaries and API categories), along with the branch taken.
- [ ] OPS.md O3, O4 and O6 are ticked, each only after its live run and idempotent re-run are recorded.
- [ ] The `submit-app-review <build18-id> --dry-run` transcript (after the attach) is recorded with the 3 submission `[dry-run]` lines, and its `ASC_TRACE` grep for POST/PATCH/DELETE is empty.
- [ ] `check-submission` shows: version 1.1.0 `PREPARE_FOR_SUBMISSION`, build 18 attached, `AFTER_APPROVAL`, phased `INACTIVE`, the What's New text, the 3 live URLs, `socialMedia false`, `FOUR_PLUS`, and review notes matching the updated text.
- [ ] All 8 smoke checks are recorded pass/fail with the device's iOS version. All 8 pass before the checklist reads "ready to submit".
- [ ] No `POST /reviewSubmissions` was issued live. `check-submission` shows no new review submission.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `.appstore/asc.js` (500 lines, untracked) | JWT `makeToken` (27-34), `api` (37-64), `all` paginator (67-76), `getAppId` (79-83), `listTesters` crash at 95, `removeTester` DELETE pattern (124-133), dispatcher (209-233), stale URLs (188, 253, 283, 284), `getLatestVersion` (384-391), `submitAppStoreReview` (413-469), `checkSubmissionState` (472-500) |
| `.appstore/query-listing.js` | Shows that `GET /apps/{id}/appInfos` returns more than one appInfo, iterated per state (lines 64-82) |
| `app.json` | `ios.buildNumber: "17"`, `version: "1.1.0"`, `ITSAppUsesNonExemptEncryption: false` (no export-compliance prompt) |
| `eas.json` | `cli.version ">= 18.0.0"`, no `appVersionSource`, `submit.production.ios` uses `.appstore/AuthKey_W4UV4XTKPC.p8`, `ascAppId 6761698411` |
| `/usr/local/lib/node_modules/eas-cli/build/project/remoteVersionSource.js:50-58` | eas-cli 20.1.0 warns on an unset `appVersionSource` and treats it as local |
| `features/app/store-compliance/specs/03-native-config-cleanup/spec.md` → "Test-file contract (for specs 04 and 05)" | Typed JSON imports (`import appJson from '@/app.json'`, module-level `expo`), with no `fs`. The FR1 block follows it |
| `features/app/store-compliance/specs/03-native-config-cleanup/spec.md` → Out of Scope #5 | Source of the verbatim `(J) ITMS-91053 check` and its three decision branches (FR6, FR7 Upload) |
| `tsconfig.json` | `"types": ["jest"]`, so there are no Node types until spec 07 FR3, and `fs`/`path`/`__dirname` produce TS2307/TS2304. `resolveJsonModule` and the `@/*` alias come from `expo/tsconfig.base` |
| `jest.config.js` | `testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']`, preset `jest-expo/node`, `moduleNameMapper` `^@/(.*)$`. `__tests__/config/app-config.test.ts` matches |
| `features/app/store-compliance/specs/07-ci-typecheck-lint/checklist.md` (PR A / PR B) and `spec.md` → Release & Merge Order | PR A = FR1+FR2, PR B = FR3–FR8. Step 4 lets build 18 ship with PR A only |
| `features/app/store-compliance/specs/04-ota-lane/spec.md` FR2–FR4 | `sourceSkips: ['ExpoConfigVersions', 'PackageJsonScriptsAll', 'GitIgnore']`. The FR3 guard and runbook A step 1 read the EAS build record |
| `features/app/store-compliance/specs/06-dependency-hygiene/spec.md` FR7(b) | `build-18` tag from `eas build:list` → `gitCommitHash` |
| `features/app/store-compliance/specs/09-sdk-58-xcode-27/spec.md` E1, `checklist.md` Session Notes | `sdk-55` image = `macos-sequoia-15.6-xcode-26.2`. Local Xcode is 27.0, so builds 18/19 must use EAS cloud |
| `features/app/store-compliance/OPS.md` | O3, O4 and O6 are re-owned to `(C)` (FR6) and ticked in FR7 |
| `server/index.ts:37-40` | `GET /health` → `{ ok, tokenCount }` (sign-out smoke check) |
| `server/cron.ts:39` | Silent push every 30 min. There's no HTTP trigger route, so the smoke test waits ≤ 30 min |
| `src/lib/pushToken.ts:11-13` | Production relay base URL `https://dynamic-balance-production-1696.up.railway.app` (overridable via `EXPO_PUBLIC_PING_SERVER_URL`) |
| `src/components/OverviewStickyBar.tsx:124` | Org segment `disabled` (excluded from What's New) |
| `features/app/store-compliance/specs/01-legal-pages/spec-research.md` | URL contract, `scripts/check-legal-pages.sh` |
| `features/app/store-compliance/specs/03-native-config-cleanup/spec-research.md` | Creates `__tests__/config/app-config.test.ts`; introspection contract |
| `features/app/store-compliance/specs/04-ota-lane/spec-research.md` | Creates `docs/RELEASING.md`; fingerprint recording; runbook A |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `app.json` | modify | `ios.buildNumber` `"17"` → `"18"` (FR1) |
| `eas.json` | modify | `cli.appVersionSource: "local"` (FR1) |
| `__tests__/config/app-config.test.ts` | modify (created by spec 03) | `05-release-build-18` describe block (FR1) |
| `docs/RELEASING.md` | modify (created by spec 04) | `## Native release` section (FR6) |
| `features/app/store-compliance/OPS.md` | modify | Re-own O3, O4 and O6 to `(C)` via asc.js, with J as the UI fallback only, and strike O6's internal-group move (FR6). Tick O3, O4 and O6 during execution (FR7) |
| `.appstore/asc.js` | modify (local, untracked, main checkout only) | FR2–FR5 |
| `.appstore/asc.js.bak-<YYYYMMDD>` | create (local, untracked) | Pre-edit backup |
| `features/app/store-compliance/specs/05-release-build-18/checklist.md` | modify during execution | Dry-run transcripts, GET outputs, smoke results |

### Interface Contracts

#### `app.json` / `eas.json`

| Path | Contract |
|------|----------|
| `expo.ios.buildNumber` | string, `/^\d+$/`, numeric value `>= 18` (`"18"` for this release) |
| `expo.version` | `"1.1.0"` (test asserts only `/^\d+\.\d+\.\d+$/`) |
| `eas.json` `cli.appVersionSource` | `"local"` |

#### `__tests__/config/app-config.test.ts` (added block)

```typescript
// Top of file: spec 03 already has
//   import type { ExpoConfig } from 'expo/config';
//   import appJson from '@/app.json';
//   const expo = appJson.expo as unknown as ExpoConfig;
// Spec 05 adds one import next to them:
import easJson from '@/eas.json';

describe('05-release-build-18', () => {
  it('ios.buildNumber is an integer string >= 18');   // expo.ios?.buildNumber
  it('expo.version is semver x.y.z');                 // expo.version
  it('eas.json pins cli.appVersionSource to local');  // expect(easJson.cli).toHaveProperty('appVersionSource', 'local')
});
```

No `fs`, `path` or `__dirname` (spec 03 test-file contract). Mixing them into this file would bring back the TS2307/TS2304 errors that spec 07 has to clear.

#### `.appstore/asc.js` internals

| Symbol | Contract |
|--------|----------|
| `DRY_RUN: boolean` | `process.argv.includes('--dry-run')`, parsed before positional args |
| `URLS` | `{ privacy, support, marketing }`, as in FR5. Lives in the Config block |
| `EDITABLE_VERSION_STATES` | `['PREPARE_FOR_SUBMISSION','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED']` |
| `EDITABLE_INFO_STATES` | Same four values, applied to `appInfo.attributes.state ?? appStoreState` |
| `versionState(v)` | `v.attributes.appVersionState ?? v.attributes.appStoreState` |
| `request(method, path, body)` | `Promise<{ status: number, body: any }>`. Logs `[http] M path -> status` to stderr when `ASC_TRACE=1`. Throws on a non-GET when `DRY_RUN` |
| `api(method, path, body)` | Unchanged contract: resolves the parsed body (now `request().body`) |
| `write(method, path, body)` | `DRY_RUN`: prints `[dry-run] M path json`, resolves `null`. Else: `request()`, throws on `status >= 400` or `body.errors` |
| `getAppId()` | Throws `ASC API error: <status> <code> — <title>` when `res.errors` |
| `getLatestVersion()` | The single editable iOS version. Throws if there are 0 or more than 1 |
| `getNewestVersion()` | Newest iOS version by `createdDate`, unfiltered (read-only use only) |
| `getEditableAppInfo(appId)` | The single editable appInfo. Throws "run create-version" if none |
| `attachBuild(version, buildId)` | Guards (a)–(d) from FR4. No-op if already attached. Single `write` PATCH |

#### `.appstore/asc.js` commands (new or changed)

| Command | Reads (GET) | Writes (skipped under `--dry-run`) | No-op when |
|---------|-------------|------------------------------------|------------|
| `list-testers [--type=…]` | `/betaTesters?filter[apps]=…` | none | n/a |
| `disable-public-link` | `/apps/{id}/betaGroups` | `PATCH /betaGroups/{id}` `{publicLinkEnabled:false}` | No group has the link enabled |
| `remove-public-link-testers [ids…]` | `/betaTesters?filter[apps]=…`, `/betaTesters/{id}` | `DELETE /betaTesters/{id}/relationships/apps` | 0 PUBLIC_LINK testers |
| `create-version <x.y.z>` | `/apps/{id}/appStoreVersions?filter[platform]=IOS`, `/appStoreVersions/{id}/appStoreVersionPhasedRelease` | `POST /appStoreVersions`, `POST /appStoreVersionPhasedReleases` | Version is editable and phased release exists |
| `attach-build <buildId>` | `/builds/{id}?include=preReleaseVersion`, `/builds?filter[app]=…&filter[preReleaseVersion.version]=…`, `/appStoreVersions/{id}/build` | `PATCH /appStoreVersions/{id}` (build relationship) | Already attached |
| `set-whats-new <text>\|--file p` | editable version en-US localization | `PATCH /appStoreVersionLocalizations/{id}` `{whatsNew}` | Equal |
| `set-urls` | 3 public URLs (expect 200), editable appInfo en-US localization, version en-US localization, `/apps/{id}/betaAppLocalizations` | Up to 3 PATCHes (FR5) | All equal |
| `set-social-media-age-rating` | `/appInfos/{id}/ageRatingDeclaration` | `PATCH /ageRatingDeclarations/{id}` `{socialMedia:false}` | Already `false` |
| `set-review-notes` | (existing) | (existing PATCH via `write`) | Equal |
| `submit-app-review <buildId>` | (existing) | attach + 3 submission writes via `write` | n/a (never run live in implementation) |
| `check-submission` | Extended read-only report (FR4) | none | n/a |

Exit codes: `0` on success or no-op; `1` on any refusal or error (the existing `fn().catch` path).

### Data Flow

```
specs 01-04 + 07 PR A merged ─► FR1 bump (app.json "18", eas.json local) ─► push main
        │                          (07 PR B optional: before or after build 18, runtime-neutral)
        ▼
pre-flight (jest --runInBand; typecheck + lint if 07 PR B merged; introspect, expo-doctor, check-legal-pages)
        │
        ▼
asc.js (main checkout) ── --dry-run ──► transcript in checklist ──► live ──► re-run = no-op
   disable-public-link → remove-public-link-testers → create-version 1.1.0 (+phased)
   → set-urls → set-social-media-age-rating → set-whats-new → set-review-notes
   (tick OPS O6, O4, O3 as each live run + no-op re-run is recorded)
        │
        ▼
eas build (EAS cloud, production; EAS build id + gitCommitHash + iOS runtime recorded)
        │
        ▼
eas build:list --app-build-version 18 record check (id, commit, runtime == local resolve)
        │
        ▼
eas submit --latest ─► ASC processing ─► build 18 VALID ─► (J) ITMS-91053 email check
        │
        ▼
attach-build <18> ─► check-submission ─► submit-app-review <18> --dry-run (preview only)
        │
        ▼
(J) TestFlight smoke on iOS 27 + App Privacy label + demo sign-in
        │
        ▼
"ready to submit"  ──(J decides, outside implementation)──► submit-app-review <18>
```

### Test Plan

| FR | Test / verification | Location | Type |
|----|---------------------|----------|------|
| FR1 | `ios.buildNumber` string `/^\d+$/`, `>= 18`; `expo.version` semver; `eas.json` `cli` has `appVersionSource: 'local'` (via typed `@/eas.json` import + `toHaveProperty`) | `__tests__/config/app-config.test.ts` (run alone: `npx jest __tests__/config/app-config.test.ts`) | Jest (red on current main) |
| FR1 | `npx expo config --type public --json` → `ios.buildNumber "18"` | checklist | command |
| FR2 | `node --check`; `list-testers` before (crash) and after (table with ids); 403 surfaced; `set-review-notes --dry-run` refuses with no editable version; `check-submission` still works; `ASC_TRACE` shows only GETs under `--dry-run` | checklist | command + read-only GET |
| FR3 | `disable-public-link --dry-run` and `remove-public-link-testers --dry-run` transcripts; EMAIL id refusal; post-live re-run no-op | checklist | dry-run + GET |
| FR4 | `create-version` dry run (and bad-format refusal); `attach-build` refusal for build 17 and accept for 18; `set-whats-new` dry run (and empty refusal); `submit-app-review` no-arg refusal (Phase 2) and full dry run after build 18 is attached (Phase 3.1); `check-submission` fields | checklist | dry-run + GET |
| FR5 | `set-urls` refusal before Pages is live; 3-PATCH dry run after; `grep -c hourglass/hourglassws` = 0; `set-social-media-age-rating` dry run; post-live no-op | checklist | dry-run + GET + curl |
| FR6 | `grep` headings, commands, owner tags and `ITMS-91053`; spec 04 section unchanged in `git diff`; OPS.md diff limited to O3/O4/O6 | checklist | command |
| FR7 | Pre-flight outputs (typecheck/lint may be `skipped: 07 PR B pending`); EAS build id and `eas build:list` record check; upload and VALID records; ITMS-91053 result; OPS O3/O4/O6 ticks; `check-submission` final state; 8 smoke checks | checklist | manual + command |

**TestFlight smoke checks (FR7, manual, iOS 27 device):**
1. Cold launch, then sign in with the QA manager account.
2. Home hours and earnings load. Overview's Personal/Team toggle works (manager). The Patterns card renders.
3. Approvals: approve one QA item, then reject one with a reason.
4. Settings → About: Privacy Policy and Support open in the in-app browser and load. The version row reads `Version 1.1.0 (18)` and `Update: embedded`.
5. Widgets: add small, medium and large. They show data, and tapping one opens the app.
6. Silent push: within 30 min of a cron tick (`server/cron.ts:39`), the widget timestamp updates. This proves dropping `fetch` (spec 03) broke nothing.
7. A local deadline notification fires, and tapping it routes correctly.
8. Sign Out clears data, and `curl -s <relay>/health` shows `tokenCount` drop by 1 against a reading taken just before.

**Mocks needed:** none. FR1 is a static config test, and the rest is command verification.

### Edge Cases

| Case | Handling |
|------|----------|
| The ASC agreement isn't accepted (403 as of 2026-10-19) | `getAppId()` surfaces `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. All asc.js verification and `eas submit` wait on J (ASC → Business). asc.js code edits and `node --check` can still proceed |
| asc.js is absent in a worktree | All asc.js edits and runs, and `eas submit` (the `.p8` path), happen in `/Users/Trilogy/Documents/Claude Code/WS/hourglassws`. The tracked changes (FR1, FR6) can be made in a worktree |
| No undo for edits to the untracked asc.js | Back up to `.appstore/asc.js.bak-<YYYYMMDD>` before the first edit |
| New top-level `const` read before the dispatcher's first `await` (TDZ) | Constants go in the Config block, and the dispatcher moves to the end of the file (FR2) |
| Build 17 is still `VALID` (expires 2026-11-04) | `attach-build` guard (d) refuses it once 18 is `VALID`. Never attach 17; its expiry is then harmless |
| Smoke test fails | Fix on `main`, then take the next unused build number (19). FR1's range test still passes. Re-run build, upload and `attach-build <19>`; guard (d) allows replacing the attached build. Don't submit 18 |
| `create-version` when 1.1.0 is already non-editable, or a different editable version exists | Refuse, exit 1, print the state. Never rename versions |
| Two editable versions or appInfos returned | Throw (Apple allows one per platform). Investigate in ASC |
| No editable version or appInfo yet | `set-urls`, `set-social-media-age-rating`, `set-whats-new`, `set-review-notes` and `attach-build` throw "run create-version" (this also proves the FR2 guard) |
| Pages URLs aren't 200 yet | `set-urls` refuses, dry run included. Finish spec 01 / OPS O2 |
| The API response has no `socialMedia` key | Refuse the PATCH, print the keys, and fall back to J doing O3 in the ASC UI |
| The age rating isn't `FOUR_PLUS` after the answer | Warn, stop ASC prep, and have J review the questionnaire before going on |
| An explicit tester id is actually `EMAIL` | Validate all ids first, refuse the whole command, make zero writes |
| Public-link testers re-join mid-cleanup | Order is `disable-public-link` first, then `remove-public-link-testers` |
| Required metadata (copyright, description, keywords) is missing on the new version | `check-submission` shows it. Stop and report to J. Don't run `set-metadata` or `set-store-listing` wholesale (out of scope) |
| No internal TestFlight group exists | J creates one in ASC and adds themself (internal testing needs no Beta App Review) |
| eas-cli upgraded to a version that requires or defaults `appVersionSource` | Pinned to `local` (FR1). The build log must show build number 18 |
| The cloud build's `runtimeVersion` differs from the local `npx expo-updates runtimeversion:resolve --platform ios` | Stop. Run `eas fingerprint:compare --build-id <id>` to see which source differs. Spec 04's `fingerprint.config.js` / `.fingerprintignore` must be fixed before the baseline OTA can be trusted |
| `eas build:list --platform ios --status finished --channel production --app-build-version 18 …` returns `[]`, or a different id or `gitCommitHash` | Don't upload. `[]` means the build wasn't an EAS cloud build, or it isn't on channel `production`. A different commit means the tree moved after the gate. Rebuild on EAS cloud from the gated HEAD |
| Someone runs `eas build --local` anyway | Never upload the artifact: it has no EAS record (spec 04 guard and runbook A, spec 06 tag), and it was compiled with this Mac's Xcode 27.0 / iOS 27 SDK. If it was already uploaded, that build number is burned. Take the next unused number and rebuild on EAS cloud |
| Spec 07 PR B isn't merged by the build-18 cut | Not a blocker. Build with PR A. Record typecheck/lint as `skipped: 07 PR B pending`. PR B lands later without forking the runtime (spec 04 FR2 `PackageJsonScriptsAll`), and its JS fixes ship by OTA |
| Spec 07 PR A isn't merged | Blocker. `npx jest --runInBand` can't reach 0 failures (the out-of-repo `NativeWindSmoke` test), and the Hermes `Buffer` bug would ship. Merge PR A first; it's small and independent |
| The ITMS-91053 email names the main app binary, or build 18 never reaches `VALID` | Follow the FR7 Upload branches: add the missing reason and rebuild with the next unused number, or stop and escalate. Don't mark "ready to submit" |
| `/health` `tokenCount` changes because of other users | Take the reading right before Sign Out and re-read right after. Repeat once if the result is ambiguous |
| Review rejection after J submits | Reply in Resolution Center. For metadata-only fixes, the set-* commands still work, because `REJECTED`/`METADATA_REJECTED` are editable states |
| The live 1.0 listing keeps its dead URLs until 1.1.0 releases | Accepted. The 1.1.0 record and appInfo carry the fixed URLs |

---

## Research Corrections

These are claims in `spec-research.md` that were stale or incomplete against the code on 2026-10-19, and how this spec handles each:

1. **"main is 1 ahead of origin":** it's now **2 ahead** (`fc24cd5` + `b6b79b7`). FR7 gates on `origin/main..main` being 0.
2. **`getLatestVersion` filter list** omitted `METADATA_REJECTED`, which is already in asc.js's own list at line 417. It's included here. The state is read as `appVersionState ?? appStoreState`, because `appStoreState` is the deprecated attribute.
3. **Making `getLatestVersion` throw would break `check-submission`** (line 474) after submission. That command now uses a new unfiltered `getNewestVersion()`.
4. **"`submit-app-review` mangles the live listing":** the code warns "Proceeding anyway" (417-419) and also auto-picks the latest VALID build (421-426), which would be build 17 before 18 processes. `set-review-notes` is the other unguarded writer. Both are now guarded, and `submit-app-review` requires an explicit build id.
5. **The null-email crash** isn't the only null bug. `firstName`/`lastName` defaults don't apply to `null`, so they print "null null". Fixed too.
6. **`getAppId()` hides API errors:** the current 403 agreement error shows as "App not found". Fixed in FR2.
7. **Runbook step 5 assigned O3, O4, version creation, What's New, review notes and phased release to J.** Claude now does these through asc.js. Only O5, agreement acceptance, the ITMS-91053 email check, the smoke test, demo sign-in and the submit decision stay with J. OPS.md is updated to match (FR6), so O3, O4 and O6 each have one owner.
8. **The pre-flight allowed the NativeWindSmoke failure.** Spec 07 PR A (FR1 + FR2) is now a gate, so the pre-flight requires 0 failures, using `--runInBand` for the known parallel flake. Typecheck and lint are required only once spec 07 PR B has merged. Spec 07 (L, 526 TS errors) explicitly allows build 18 with FR1+FR2 only, and spec 04 FR2's `PackageJsonScriptsAll` skip means PR B no longer forks the runtime if it lands after build 18.
9. **The smoke step "trigger [a push] from `server/`":** there's no trigger route (`server/index.ts` exposes only `/register`, `/unregister`, `/health`), so the test waits for the 30-minute cron.
10. **`eas build -p ios --profile production` (cloud) is kept as written in the research, and `--local` is ruled out.** Spec 04 (FR3 guard, runbook A, O11) and spec 06 (FR7(b) tag) need the EAS build record. This Mac's Xcode 27.0 would also compile SDK 55 against the iOS 27 SDK. Builds 10–17 didn't all use `--local`: EAS has records for 13, 15 and 17, and spec 09 names 10–12 and 16 as local.
11. **`eas.json` has no `cli.appVersionSource`.** It's pinned to `local` so the `buildNumber` bump can't be silently ignored.
12. **`__tests__/config/app-config.test.ts` and `docs/RELEASING.md` don't exist yet.** Specs 03 and 04 create them. This spec modifies them and is blocked until both have merged.
13. **TestFlight's `betaAppLocalizations.privacyPolicyUrl`, and the hard-coded URLs in `set-store-listing`/`set-beta-info`, still point at the dead URL.** They weren't in the research. Fixed by FR5 / `URLS`.
14. **OPS O6 "move the two email testers to an internal group"** isn't possible unless they're ASC team users. Descoped, and struck from OPS.md (FR6).
15. **The widget-extension `ITMS-91053` check had no owner.** Spec 03 Out of Scope #5 hands it to this spec. It's placed verbatim in FR7 Upload and the FR6 runbook Upload subsection.

---

## Dependencies

### Internal
- `01-legal-pages`: the three URLs return 200, and `scripts/check-legal-pages.sh` exists.
- `02-in-app-legal-links`: the About section and the version row (smoke check 4).
- `03-native-config-cleanup`: the introspection contract; creates `__tests__/config/app-config.test.ts` and its typed-JSON-import contract; hands off the `ITMS-91053` check (Out of Scope #5).
- `04-ota-lane`: fingerprint runtime, including the `PackageJsonScriptsAll` skip; creates `docs/RELEASING.md`; runbook A after release, which reads build 18's EAS record.
- `07-ci-typecheck-lint`: **PR A** (FR1 Buffer fix, FR2 out-of-repo test removal) is required for a 0-failure `npx jest --runInBand`. **PR B** (`npm run typecheck`, lint gates) is optional for build 18.

### External
- App Store Connect API (`api.appstoreconnect.apple.com/v1`) with key `W4UV4XTKPC`.
- EAS Build (cloud; SDK 55 → `sdk-55` image `macos-sequoia-15.6-xcode-26.2`) and EAS Submit (eas-cli 20.1.0 installed; `cli.version >= 18.0.0`).
- The App Store Connect processing emails for builds 17 and 18, which J reads for the ITMS-91053 check.
- GitHub Pages (`jaime-alvarez-trilogy.github.io/hourglass-app/`).
- An iOS 27 device with TestFlight.

### Assumptions
- The Account Holder accepts Apple's updated agreement before release execution.
- The age-rating capability attribute is named `socialMedia` and is boolean, as observed by the 2026-09-22 audit. FR5 refuses to write if it isn't.
- Creating the 1.1.0 version also creates an editable appInfo and copies the 1.0 localizations, so the dead support and marketing URLs carry over and `set-urls` must overwrite them. `check-submission` confirms this after the create.
- Build 18 is uploaded before build 17 expires on 2026-11-04. After that, nothing is time-critical, because builds have a 90-day window.
