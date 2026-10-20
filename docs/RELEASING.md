# Releasing Hourglass

Hourglass ships through two lanes. A JS-only change (code and assets under `app/`, `src/`, `components/`, `hooks/` and `constants/`) goes out as an over-the-air (OTA) update, published with `scripts/ota-publish.sh`. A native change (dependencies, config plugins, Info.plist, icons and the rest of the table in section E) needs a new App Store build. The native release procedure follows in `## Native release` at the end of this file (added by spec 05).

## OTA updates

How the lane works:

- `app.json` uses `runtimeVersion: { "policy": "fingerprint" }`. The runtime is a 40-hex hash of the native inputs only. `fingerprint.config.js` and `.fingerprintignore` keep version bumps, `package.json` scripts, `.gitignore` and `eas.json` out of it.
- Each build embeds its runtime. An update reaches a binary only when the two runtimes match exactly, so an update published from a tree whose native inputs differ from every live build reaches nobody.
- Binaries check for updates on every cold start, but don't wait for them (`EXUpdatesCheckOnLaunch: ALWAYS`, `EXUpdatesLaunchWaitMs: 0`). The first cold start after a publish downloads the update and the second one runs it.
- The Settings version row shows `Update: <first 8 chars of the iOS update id>` when an update is running, and `Update: embedded` when the binary's own bundle is.
- Inside an update, the version row's `version (buildNumber)` comes from the tree that published it, not from the binary. That's why section A publishes from the build's own commit, and why the script warns when the two differ.

Rules:

- **Publish only through `scripts/ota-publish.sh`.** It refuses a dirty tree, a non-fingerprint runtime, and any runtime that no finished iOS build on channel `production` has. It publishes iOS only, with `EXPO_NO_DOTENV=1`, so values from `.env.local` can't end up in the bundle. The one exception is section B, whose branch predates the script.
- **`fingerprint.config.js` and `.fingerprintignore` take effect only with the next native build.** Changing either one changes the runtime of every later publish. Never change them between a build and an OTA aimed at that build.
- **Bump versions with `npm version <x> --no-git-tag-version` plus the `app.json` `expo.version` edit**, so `package.json`, both `package-lock.json` root fields and `app.json` stay equal. `__tests__/config/app-config.test.ts` and `__tests__/config/fingerprint-config.test.ts` fail otherwise. A version bump alone doesn't change the runtime.
- **Don't commit `.env*` files.** OTA bundles never read them (`EXPO_NO_DOTENV=1`), but EAS builds would read a committed `.env` or `.env.production`, so builds and OTAs would quietly differ. Put such values in the EAS `production` environment variables instead; `eas update --environment production` applies those.

### A. Baseline after a native release

Run this once each new native build is READY_FOR_SALE. It proves that the local and EAS fingerprints agree and that store installs pick up updates, before an emergency depends on it. Worked example: build 18 (v1.1.0).

0. Before release, during the TestFlight smoke: the build's Settings row shows `Update: embedded`.
1. Get the build's metadata and record `id`, `runtimeVersion`, `gitCommitHash` and `appVersion`:
   ```bash
   eas build:list --platform ios --status finished --channel production --app-build-version <N> --limit 1 --json --non-interactive
   ```
2. Check that the commit exists locally. `git cat-file -t <gitCommitHash>` must print `commit`. If it doesn't, stop: the build's tree is unknown, so investigate before publishing. If builds are tagged `build-<N>`, `git rev-parse 'build-<N>^{commit}'` must print the same hash.
3. Check out the build's tree and install exactly its dependencies:
   ```bash
   git switch --detach <gitCommitHash> && npm ci
   ```
4. `npx expo-updates runtimeversion:resolve --platform ios` must print the build's `runtimeVersion`.
5. Dry run. It must print `Dry run OK` and no `WARNING:`:
   ```bash
   scripts/ota-publish.sh --dry-run "baseline: build <N> (v<version>)"
   ```
6. Publish, and record the printed runtime, group and iOS update id:
   ```bash
   scripts/ota-publish.sh "baseline: build <N> (v<version>)"
   ```
7. On a device with the App Store build installed, force-quit and relaunch the app twice, then open Settings. The row must show `Update: <first 8 chars of the iOS update id>`.
8. If it still shows `Update: embedded` after three cold starts, **stop and don't publish again.** Check the branch and runtime with `eas update:list --branch production --json --non-interactive` and the launches with `eas update:insights <group> --platform ios`, and record what you find.
9. Go back: `git switch main && npm ci`.

### B. Emergency fix for users still on 1.0.0 (build 15)

Build 15 has runtime `1.0.0` (the old `appVersion` policy), which nothing on main can produce. Reach it only from a branch cut at the build-15 version-bump commit, `e7fb801`. EAS recorded commit `1b45a8a` for build 15, but that commit isn't in this repo. `e7fb801` has the same `.gitignore` hash, version and buildNumber as build 15's recorded fingerprint, and `package.json`, `package-lock.json` and `patches/` stayed unchanged after it until the store-compliance work, so it carries build 15's native inputs.

1. Confirm build 15's runtime still has an audience; this must list a build:
   ```bash
   eas build:list --platform ios --status finished --channel production --runtime-version 1.0.0 --limit 1 --json --non-interactive
   ```
2. Branch and install that tree's dependencies (main has since dropped native modules that build 15 still has):
   ```bash
   git switch -c hotfix/1.0.0-<topic> e7fb801 && npm ci
   ```
3. Cherry-pick the JS-only fix: `git cherry-pick <fix-sha>`. It must not depend on anything main changed after `e7fb801`; if it does, port it by hand.
4. `npx expo-updates runtimeversion:resolve --platform ios` must print `"runtimeVersion":"1.0.0"`. The `appVersion` policy at that commit produces it, so don't edit `runtimeVersion` by hand.
5. Publish by hand (the script doesn't exist on this branch):
   ```bash
   EXPO_NO_DOTENV=1 eas update --channel production --environment production --platform ios --message "<msg>"
   ```
6. Verify on a build-15 install as in section A step 7, then `git switch main && npm ci`.

Never merge this branch, and never publish main with a literal `1.0.0` runtime: main's native dependencies no longer match build 15's, and the script refuses non-fingerprint runtimes anyway.

### C. Is this change OTA-safe?

Commit the change (the script needs a clean tree) and make sure you're logged in to EAS (`eas whoami`), then run:

```bash
scripts/ota-publish.sh --dry-run "check"
```

- `Dry run OK`: a live build has this exact runtime, so the change can ship as an OTA. Also check the caveat row in section E.
- `Refusing to publish: no finished iOS build on channel "production" has runtime …`: run `npm ci` and retry once, since local `node_modules` that drifted from the lockfile change the fingerprint too. If it still refuses, the change is native: ship a build. To see which source changed:
  ```bash
  eas fingerprint:compare --build-id <id> --environment production
  ```
  Find `<id>` with `eas build:list --platform ios --channel production --limit 1`.

### D. Rolling back a bad update

Find the runtime (the script's `runtime:` line, or the build's `runtimeVersion`) and, for a republish, the last good group (`eas update:list --branch production --json --non-interactive`). Then either:

- send devices back to the binary's own bundle:
  ```bash
  eas update:roll-back-to-embedded --channel production --runtime-version <rtv> --platform ios --message "<why>"
  ```
- or republish the last good update group:
  ```bash
  eas update:republish --group <last-good-group> --destination-channel production --message "<why>"
  ```

Then force-quit and relaunch twice on a store install. After a rollback, Settings shows `Update: embedded`. After a republish, it shows the first 8 chars of the **new** iOS update id that the republish printed, not the old one.

### E. What changes the runtime

| Change | Runtime | Ship as |
|--------|---------|---------|
| Native dependency added, removed or upgraded (anything autolinked) | Forks | Native build |
| `patches/` | Forks | Native build |
| Config plugins and their props (`app.json` `plugins`) | Forks | Native build |
| `ios.infoPlist`, entitlements, privacy manifest | Forks | Native build |
| Icons and splash | Forks | Native build |
| `extra` (feature flags read through `Constants.expoConfig.extra`), or any other `app.json` field except the versions | Forks | Native build |
| `fingerprint.config.js`, `.fingerprintignore` | Forks | Native build (see Rules) |
| `version`, `ios.buildNumber` | Doesn't fork | OTA (the Settings row shows the publishing tree's values) |
| `package.json` scripts | Doesn't fork | OTA |
| `.gitignore` | Doesn't fork | OTA |
| `eas.json` (build profiles, submit block) | Doesn't fork | OTA |
| Any JS, TS or asset under `app/`, `src/`, `components/`, `hooks/`, `constants/` | Doesn't fork | OTA |
| Docs and tests | Doesn't fork | Nothing to ship |
| **Caveat:** changing `postinstall`, adding `eas-build-*` hooks, or changing an `eas.json` build profile's `env`, `prebuildCommand` or image | Doesn't fork, but changes the binary | Native build |

## Native release

Use this for every App Store build, that is, for any change section E marks "Native build". The worked example throughout is v1.1.0, build 18 (spec 05). Each step is tagged with its owner: **(C)** = Claude, from the CLI or the App Store Connect (ASC) API; **(J)** = Jaime, in a browser or on a device.

- **Run asc.js and `eas submit` from the main checkout** (`/Users/Trilogy/Documents/Claude Code/WS/hourglassws`), never from a worktree. `.appstore/` holds `asc.js` and the `.p8` key that the `eas.json` submit block points at. It's gitignored, so worktrees don't have it.
- **Every asc.js write runs with `--dry-run` first.** A dry run sends only GET requests and prints each skipped write as `[dry-run] <METHOD> <path> <json>`, ending with `[dry-run] <n> write(s) skipped`. With `ASC_TRACE=1`, every request is also logged to stderr as `[http] <METHOD> <path> -> <status>`, so `ASC_TRACE=1 node .appstore/asc.js <command> --dry-run 2>&1 | grep -E '^\[http\] (POST|PATCH|DELETE)'` must print nothing. Then run the command live, then run it once more: the re-run must make zero writes and print only `= …` lines.
- **Build numbers:** take the next unused build number (`node .appstore/asc.js builds`), never reuse one. A number that reached App Store Connect is burned even if that build was never submitted.

### Pre-flight

1. (C) Agreement check: `node .appstore/asc.js builds` lists the uploaded builds. If it prints `ASC API error: 403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`, nothing in this section can run until (J) accepts Apple's agreement (see User-only steps).
2. (C) Set `app.json` `expo.ios.buildNumber` (a string) to the next unused build number from that list. Change `expo.version` only for a new marketing version (see the version-bump rule above). `eas.json` pins `cli.appVersionSource` to `local`, so EAS uses this number, and `__tests__/config/app-config.test.ts` asserts a range, so it keeps passing. Worked example: 1.1.0 stayed 1.1.0 and went from build 17 to 18.
3. (C) `npx jest --runInBand` → 0 failures. Always required. `--runInBand` because the Android widget suite flakes under parallel workers.
4. (C) `npm run typecheck` and `npm run lint`, when present: both must exit 0 once spec 07 PR B (FR3–FR8) has merged. Before that, the `typecheck` script doesn't exist and `lint` still reports spec 07's 9 known errors, so record both as `skipped: 07 PR B pending`.
5. (C) `npx expo config --type introspect --json`: `UIBackgroundModes` is `["remote-notification"]` only, there's no `NSFaceIDUsageDescription`, `runtimeVersion` has policy `fingerprint`, and `ios.buildNumber` is the new number.
6. (C) `npx expo-doctor`: the config-schema check passes. The package-version check may stay red until spec 06.
7. (C) `scripts/check-legal-pages.sh` exits 0: all three legal URLs return 200 (spec 01).
8. (C) Clean, pushed tree: `git status --porcelain` prints nothing and `git rev-list --count origin/main..main` prints `0`. Record the HEAD SHA. The Build step checks the EAS record against it.
9. (J) Give the go-ahead for live App Store Connect writes.

### App Store Connect prep (asc.js)

Do this **before** Build, for two reasons:

- The public TestFlight link has to be off, and its anonymous testers removed, before the new build lands in TestFlight. Otherwise strangers get an unreleased build (OPS O6).
- `set-urls` refuses until the legal URLs return 200. That check takes seconds, so it should fail before a long cloud build, not after it.

Run each command with `--dry-run`, then live, then once more to confirm it makes zero writes.

1. (C) `node .appstore/asc.js disable-public-link`: lists every beta group (id, name, internal or not, `publicLinkEnabled`, link) and turns the public link off on each group that has it on. Note whether an internal group exists. If none does, (J) creates one (see User-only steps).
2. (C) `node .appstore/asc.js remove-public-link-testers`: removes every `PUBLIC_LINK` tester from the app. `EMAIL` testers are never touched. It always runs after `disable-public-link`, so nobody can re-join in between. Afterwards, `node .appstore/asc.js list-testers --type=PUBLIC_LINK` prints `Total: 0` and `node .appstore/asc.js list-testers --type=EMAIL` still lists the email testers.
3. (C) `node .appstore/asc.js create-version <x.y.z>`: creates the version record (`releaseType` `AFTER_APPROVAL`) and its phased release (`INACTIVE`). If the version already exists and is editable, it prints `= version <x.y.z> already exists (<state>)` and creates nothing. It refuses (exit 1) if a different editable version exists, or if the same version exists in a non-editable state; it never renames. Then run `node .appstore/asc.js check-submission`: the copyright, description and keywords must have carried over from the previous version. If any is missing, stop and tell J. Don't run `set-metadata` or `set-store-listing` wholesale. Worked example: `create-version 1.1.0`.
4. (C) `node .appstore/asc.js set-urls`: first checks that the privacy, support and marketing URLs each return 200, without following redirects. Otherwise it refuses with `URL not live: <url> -> <status> (finish spec 01 / OPS O2)`, dry run included. Then it sets the privacy policy URL on the editable app info and on TestFlight's beta app localization, and the support and marketing URLs on the version's en-US localization. It sends only the fields that differ.
5. (C) `node .appstore/asc.js set-social-media-age-rating`: answers the age-rating Social Media question with `false` on the editable app info and prints `appStoreAgeRating` and the Brazil rating. If it refuses with `socialMedia not exposed by the API`, or the rating isn't `FOUR_PLUS` / Brazil L afterwards, stop ASC prep: (J) does OPS O3 in the ASC UI and reviews the questionnaire.
6. (C) `node .appstore/asc.js set-whats-new --file <path>`: sets the en-US What's New text (trimmed, 1–4000 characters).
   - What's New lists the user-visible changes since the last build that went **live**, not since the last upload. It says nothing about disabled or flag-gated features (for example the Org scope in Overview, which is disabled).
   - Worked example, 1.1.0 (changes since build 15):
     ```
     • Managers: a new Team view in Overview lets you switch between your own numbers and your team's.
     • New Patterns card in Overview shows when in the day you work and focus best.
     • Your hours headline now includes overtime you've worked that is still awaiting approval.
     • Privacy Policy and Support are now in Settings.
     ```
7. (C) `node .appstore/asc.js set-review-notes`: sets the App Review notes to the Unlisted App Distribution text in asc.js (`REVIEW_NOTES_UNLISTED`).

Worked example: for build 18, OPS O6 closed after steps 1–2, O4 after step 4 and O3 after step 5, each only once its live run and zero-write re-run were recorded.

### Build

1. (C) `eas build -p ios --profile production`, on **EAS cloud**. Never `eas build --local`, for two reasons:
   - A local build creates no EAS build record. Spec 04's publish guard (`eas build:list --runtime-version`), section A step 1 above and spec 06's `build-<N>` tag all read that record. Without it, `scripts/ota-publish.sh` refuses every publish for the build's runtime, and the build can't be tagged.
   - A local build ignores the EAS image and compiles with this Mac's Xcode, which is 27.0 as of 2026-10-19 (spec 09). SDK 55 has no scene lifecycle and must not be compiled against the iOS 27 SDK (FEATURE.md). EAS cloud uses the `sdk-55` image, `macos-sequoia-15.6-xcode-26.2`.
2. (C) Record the EAS build id, which is required, and its `gitCommitHash`. A cloud build always has an id: no id means it wasn't a cloud build, so stop.
3. (C) Check the build log: build number `<N>`, an Xcode 26.x image (not Xcode 27), and no `cli.appVersionSource` warning.
4. (C) Record the iOS runtime. At the build commit, run `npx expo-updates runtimeversion:resolve --platform ios` (spec 04). Don't use the bare `@expo/fingerprint` CLI: it hashes both platforms, so its hash never equals the iOS runtime.
5. (C) EAS record check, before Upload:
   ```bash
   eas build:list --platform ios --status finished --channel production --app-build-version <N> --limit 1 --json --non-interactive
   ```
   It must return the recorded EAS build id, with `appVersion` = the version, `appBuildVersion` = `<N>`, `gitCommitHash` = the HEAD SHA recorded in Pre-flight, and `runtimeVersion` = the local resolve. Stop if it returns `[]` or any field differs. `[]` means the build wasn't an EAS cloud build, or it isn't on channel `production`. A different commit means the tree moved after Pre-flight. For a runtime mismatch, run `eas fingerprint:compare --build-id <id>`.

### Upload

1. (C) From the main checkout: `eas submit -p ios --profile production --latest`. Confirm that the build eas-cli submits is the recorded EAS build id. If any other iOS build has started since, run `eas submit -p ios --profile production --id <eas-build-id>` instead.
2. (C) Only EAS cloud builds are uploaded. There's no variant that uploads a local `.ipa`.
3. (C) Wait until `node .appstore/asc.js builds` lists `<N> … VALID`, and record the ASC build id from its `Build IDs` list.
4. (J) **ITMS-91053 check.** In the App Store Connect processing email for build N, search for `ITMS-91053`. Check build N−1's email too, as a baseline. Record either "none" or the binaries and API categories it lists.
   - **It names only `ExpoWidgetsTarget`, and build N is `VALID`:** don't block submission. Open a follow-up for the next native build: give the `ExpoWidgets` pod its own `PrivacyInfo.xcprivacy` (`CA92.1`, `1C8F.1`) through the existing `patches/expo-widgets+55.0.5.patch`.
   - **It names the main app binary:** spec 03's FR4 manifest is missing a reason. Add that reason to `ios.privacyManifests` and the FR4 contract test, then rebuild with the next unused build number before submitting.
   - **Build N never reaches `VALID`:** this is a release blocker. Stop and escalate.
5. (C) Record the result and the branch taken. The release can't be marked "ready to submit" until the result is "none" or the first branch. The second branch restarts Build with the next unused build number. The third stops the release.

### Attach and verify (asc.js)

1. (C) `node .appstore/asc.js attach-build <buildId>` once the build is `VALID`, `--dry-run` first. It refuses a build that isn't `VALID`, has expired, belongs to another marketing version, or has a newer `VALID` build of the same version, so the previous upload can't be attached by mistake. A re-run prints `= build <N> already attached`. Worked example: `attach-build <build18-id>`. Once 18 was `VALID`, `attach-build <build17-id>` refused.
2. (C) `node .appstore/asc.js check-submission` shows: the version in `PREPARE_FOR_SUBMISSION`, the new build attached, `releaseType` `AFTER_APPROVAL`, phased release `INACTIVE`, the What's New text, the three legal URLs, `socialMedia false`, `FOUR_PLUS`, `Review notes match Unlisted text: true`, and no new review submission.

### TestFlight smoke

(J) runs these on a device with the newest iOS (iOS 27 for build 18), installed through internal testing. (C) records each result, pass or fail, with the device's iOS version. All 8 must pass before the release is "ready to submit".

1. (J) Cold launch, then sign in with the QA manager account.
2. (J) Home hours and earnings load. Overview's Personal/Team toggle works (manager). The Patterns card renders.
3. (J) Approvals: approve one QA item, then reject one with a reason.
4. (J) Settings → About: Privacy Policy and Support open in the in-app browser and load. The version row reads `Version <x.y.z> (<N>)` and `Update: embedded` (worked example: `Version 1.1.0 (18)`).
5. (J) Widgets: add small, medium and large. They show data, and tapping one opens the app.
6. (J) Silent push: within 30 min of a cron tick (`server/cron.ts`, which has no HTTP trigger), the widget timestamp updates.
7. (J) A local deadline notification fires, and tapping it routes correctly.
8. (J) Sign Out clears data. (C) reads `curl -s https://dynamic-balance-production-1696.up.railway.app/health` right before and right after: `tokenCount` drops by 1. Repeat once if other users make the result ambiguous.

### User-only steps

1. (J) Accept Apple's updated agreement (Account Holder only: ASC → Business) whenever asc.js or `eas submit` reports `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`.
2. (J) App Privacy label (OPS O5): Identifiers → Device ID, App Functionality, Not Linked to You, Not Used for Tracking. The public ASC API doesn't expose it.
3. (J) Confirm that the demo account in App Review Information signs in on the new build.
4. (J) If `disable-public-link` showed no internal group, create one in ASC → TestFlight and add yourself. Internal testing needs no Beta App Review.

### Submit

1. (J) Decide whether to submit, only after all 8 smoke checks pass and the Upload processing-email result allows it.
2. (C) Preview the submission: `ASC_TRACE=1 node .appstore/asc.js submit-app-review <buildId> --dry-run 2>&1`. Expect `= build <N> already attached`, then `[dry-run] POST /reviewSubmissions`, `[dry-run] POST /reviewSubmissionItems` and `[dry-run] PATCH /reviewSubmissions/<new-submission-id>`, ending with `[dry-run] 3 write(s) skipped`. The `[http]` trace must show only GETs.
3. (J) Submit: click Submit for Review in ASC, or tell C to run `node .appstore/asc.js submit-app-review <buildId>` live.

### Post-release

1. (C) Once the version is READY_FOR_SALE, run the baseline OTA in section A above (spec 04 runbook A) for this build.
2. (C) Then work through any open "After build N is live" items in `features/app/store-compliance/OPS.md`. For build 18 these are O8–O10; O8's key revocation is (J).

### If something fails

- (C) A smoke check fails, or the processing email names the main app binary: fix it on `main`, take the next unused build number (never reuse one), and repeat Pre-flight, Build, Upload and Attach and verify. `attach-build <new-buildId>` replaces the attached build, and the guard refuses the older one. Don't submit the failed build.
- (C) An asc.js command refuses. `No editable App Store version … Run: node .appstore/asc.js create-version <x.y.z>` means: create the version first. `URL not live` means: finish spec 01 / OPS O2 first. `ASC API error: 403 …` means: (J) accepts the agreement. `socialMedia not exposed by the API` means: (J) does OPS O3 in the ASC UI. Any other ASC API error on a write means (J) makes that change in the ASC UI, then (C) confirms it with `check-submission` or `list-testers`.
- (C) The cloud build's `runtimeVersion` differs from the local resolve: stop and run `eas fingerprint:compare --build-id <id>`. Fix `fingerprint.config.js` / `.fingerprintignore` before trusting the baseline OTA.
- (C) Someone ran `eas build --local` anyway: never upload that artifact. If it was already uploaded, that build number is burned: take the next unused one and rebuild on EAS cloud.
- (J) App Review rejects the version: reply in Resolution Center. Metadata-only fixes need no rebuild. The `set-*` commands still work, because `REJECTED`, `METADATA_REJECTED` and `DEVELOPER_REJECTED` are editable states. A binary fix takes the next unused build number.
