# Releasing Hourglass

Hourglass ships through two lanes. A JS-only change (code and assets under `app/`, `src/`, `components/`, `hooks/` and `constants/`) goes out as an over-the-air (OTA) update, published with `scripts/ota-publish.sh`. A native change (dependencies, config plugins, Info.plist, icons and the rest of the table in section E) needs a new App Store build. The native release procedure follows in `## Native release` (added by spec 05), and `## SDK upgrade` at the end of this file adds what an Expo SDK bump needs on top of it (spec 10).

## OTA updates

How the lane works:

- `app.json` uses `runtimeVersion: { "policy": "fingerprint" }`. The runtime is a 40-hex hash of the native inputs only. `fingerprint.config.js` and `.fingerprintignore` keep version bumps, `package.json` scripts, `.gitignore` and `eas.json` out of it.
- Each build embeds its runtime. An update reaches a binary only when the two runtimes match exactly, so an update published from a tree whose native inputs differ from every live build reaches nobody.
- Binaries check for updates on every cold start, but don't wait for them (`EXUpdatesCheckOnLaunch: ALWAYS`, `EXUpdatesLaunchWaitMs: 0`). The first cold start after a publish downloads the update and the second one runs it.
- The Settings version row shows `Update: <first 8 chars of the iOS update id>` when an update is running, and `Update: embedded` when the binary's own bundle is.
- The version row's `version (buildNumber)` always comes from the binary (`Application.nativeApplicationVersion` and `Constants.platform.ios.buildNumber` in `app/modal.tsx`), so an update never changes it; only the `Update:` line does. The update's manifest (`Constants.expoConfig`) does carry the publishing tree's `app.json` values, so the script warns when they differ from the target build: that means the tree isn't the build's commit, which section A requires.

Rules:

- **Publish only through `scripts/ota-publish.sh`.** It refuses a dirty tree, a non-fingerprint runtime, and any runtime that no finished iOS build on channel `production` has. It publishes iOS only, with `EXPO_NO_DOTENV=1`, so values from `.env.local` can't end up in the bundle. The one exception is section B, whose branch predates the script.
- **`fingerprint.config.js` and `.fingerprintignore` take effect only with the next native build.** Changing either one changes the runtime of every later publish. Never change them between a build and an OTA aimed at that build.
- **Bump versions with `npm version <x> --no-git-tag-version` plus the `app.json` `expo.version` edit**, so `package.json`, both `package-lock.json` root fields and `app.json` stay equal. `__tests__/config/app-config.test.ts` and `__tests__/config/fingerprint-config.test.ts` fail otherwise. A version bump alone doesn't change the runtime.
- **Don't commit `.env*` files.** OTA bundles never read them (`EXPO_NO_DOTENV=1`), but EAS builds would read a committed `.env` or `.env.production`, so builds and OTAs would quietly differ. Put such values in the EAS `production` environment variables instead; `eas update --environment production` applies those.

### A. Baseline after a native release

Run this once each new native build is READY_FOR_SALE. It proves that the local and EAS fingerprints agree and that store installs pick up updates, before an emergency depends on it. Worked example: build 18 (v1.1.0).

0. Before release, during the TestFlight smoke: the build's Settings row shows `Update: embedded`.
1. Get the build's metadata and record `id`, `runtime.version`, `gitCommitHash` and `appVersion`. eas-cli ≥ 22 nests the runtime as `runtime.version`; older CLIs printed a top-level `runtimeVersion` (see `## SDK upgrade`):
   ```bash
   eas build:list --platform ios --status finished --channel production --app-build-version <N> --limit 1 --json --non-interactive
   ```
2. Check that the commit exists locally. `git cat-file -t <gitCommitHash>` must print `commit`. If it doesn't, stop: the build's tree is unknown, so investigate before publishing. If builds are tagged `build-<N>`, `git rev-parse 'build-<N>^{commit}'` must print the same hash.
3. Check out the build's tree and install exactly its dependencies:
   ```bash
   git switch --detach <gitCommitHash> && npm ci
   ```
4. `npx expo-updates runtimeversion:resolve --platform ios` must print the build's `runtime.version` (in its own `runtimeVersion` field).
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

### B2. Hotfixes for 1.1.x during the 1.2.0 rollout

While 1.2.0 (build 19, Expo SDK 58) is in TestFlight or App Review, App Store users are on 1.1.0 (build 18, SDK 55). Build 19 has a different runtime, so nothing published from the 1.2 tree reaches them. Some never move: 1.2.0 needs iOS 16.4, and 1.1.0 runs on iOS 15.1, so devices on iOS 15.1–16.3 stay on build 18.

**The lane.** `release/1.1` was cut from `aade79b`, the build-18 commit, which is tagged `build-18` (`git rev-parse 'build-18^{commit}'` prints `aade79b…`). It also carries the `ota-publish.sh` fix for eas-cli ≥ 22's build JSON (`7b0e328`, cherry-picked from `feat/sdk-58`). Scripts aren't a fingerprint input, so the branch still resolves build 18's runtime. The branch's own copy of this file predates spec 10; follow this one.

A JS-only fix goes out as an OTA from `release/1.1`:

1. `git switch release/1.1 && rm -rf node_modules && npm ci`.
2. Commit the fix there. `npm test`, `npm run typecheck` and `npm run lint` exit 0.
3. `npx expo-updates runtimeversion:resolve --platform ios` must print build 18's runtime: the `runtime.version` of `eas build:list --platform ios --status finished --channel production --app-build-version 18 --limit 1 --json --non-interactive`.
4. `scripts/ota-publish.sh --dry-run "<msg>"` must print `Dry run OK` and name build 18. Then publish with `scripts/ota-publish.sh "<msg>"`, and verify on a build-18 install as in section A step 7.
5. `git push origin release/1.1`.
6. Cherry-pick the fix forward: `git switch feat/sdk-58 && git cherry-pick -x <sha>` (onto `main` instead, once 1.2.0 has merged). Then run `rm -rf node_modules && npm ci` before recording any runtime there, because `runtimeversion:resolve` reads the local `node_modules`.

A native fix (App Review rejects build 18, or the fix touches a native input) is a rebuild from `release/1.1`: follow `## Native release` in this file, building from that branch with the next unused build number. 1.2.0 then takes the number after it; its tests assert a range, so they still pass. The branch's `eas.json` has no image pin, so the build runs on the `sdk-55` image (Build step 1).

Rules:

- **Never publish to channel `production` from the 1.2 tree before build 19 is live.** That means no `eas update --channel production` and no `scripts/ota-publish.sh` from `feat/sdk-58`, or from `main` after the merge, until 1.2.0 is READY_FOR_SALE. Once build 19 exists, the script's audience guard would accept its runtime, but the update would reach only TestFlight testers, and it would land before build 19's section A baseline.
- **Every 1.1.x fix is cherry-picked forward** (step 6), so 1.2.0 never regresses it.
- **Retire `release/1.1` once 1.1.x adoption is negligible.** That's J's call, from App Store Connect's usage by app version. Because of the iOS 15.1–16.3 devices, it may take a while. To retire it: stop publishing to build 18's runtime, delete the branch (`git push origin --delete release/1.1`), and keep the `build-18` tag.
- **After 1.2.0 is live:** run section A for build 19 (Post-release step 3).

### C. Is this change OTA-safe?

Commit the change (the script needs a clean tree) and make sure you're logged in to EAS (`eas whoami`), then run:

```bash
scripts/ota-publish.sh --dry-run "check"
```

- `Dry run OK`: a finished iOS build on channel `production` has this exact runtime (the `build:` line names it), so the change is OTA-compatible with that build. It reaches App Store users only once that build is READY_FOR_SALE. Until then they're on the previous live build, so use section B to reach build 15, or section B2 to reach build 18 during the 1.2.0 rollout. Also check the caveat row in section E.
- `Refusing to publish: no finished iOS build on channel "production" has runtime …`: run `npm ci` and retry once, since local `node_modules` that drifted from the lockfile change the fingerprint too. If it still refuses, the change is native: ship a build. To see which source changed:
  ```bash
  eas fingerprint:compare --build-id <id> --environment production
  ```
  Find `<id>` with `eas build:list --platform ios --channel production --limit 1`.

### D. Rolling back a bad update

Find the runtime (the script's `runtime:` line, or the build's `runtime.version`) and, for a republish, the last good group (`eas update:list --branch production --json --non-interactive`). Then either:

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
| Config plugins and their props (`app.json` `plugins`), including any edit to a local plugin file under `plugins/` | Forks | Native build |
| `ios.infoPlist`, entitlements, privacy manifest | Forks | Native build |
| Icons and splash | Forks | Native build |
| `extra` (feature flags read through `Constants.expoConfig.extra`), or any other `app.json` field except the versions | Forks | Native build |
| `fingerprint.config.js`, `.fingerprintignore` | Forks | Native build (see Rules) |
| `version`, `ios.buildNumber` | Doesn't fork | OTA (the Settings row still shows the binary's values) |
| `package.json` scripts | Doesn't fork | OTA |
| `.gitignore` | Doesn't fork | OTA |
| `eas.json` (build profiles, submit block) | Doesn't fork | OTA |
| Any JS, TS or asset under `app/`, `src/`, `components/`, `hooks/`, `constants/` | Doesn't fork | OTA |
| Docs and tests | Doesn't fork | Nothing to ship |
| **Caveat:** changing `postinstall`, adding `eas-build-*` hooks, or changing an `eas.json` build profile's `env`, `prebuildCommand` or image | Doesn't fork, but changes the binary | Native build |

## Native release

Use this for every App Store build, that is, for any change section E marks "Native build". The worked example throughout is v1.1.0, build 18 (spec 05). Each step is tagged with its owner: **(C)** = Claude, from the CLI or the App Store Connect (ASC) API; **(J)** = Jaime, in a browser or on a device.

- **Run asc.js and `eas submit` from the main checkout** (`/Users/Trilogy/Documents/Claude Code/WS/hourglassws`), never from a worktree. `.appstore/` holds `asc.js` and the `.p8` key that the `eas.json` submit block points at. It's gitignored, so worktrees don't have it, and it's never copied into one (spec 10 Decision 16, option (c); see `## SDK upgrade`).
- **Every asc.js write runs with `--dry-run` first.** A dry run sends only GET requests and prints each skipped write as `[dry-run] <METHOD> <path> <json>`, ending with `[dry-run] <n> write(s) skipped`. With `ASC_TRACE=1`, every request is also logged to stderr as `[http] <METHOD> <path> -> <status>`, so `ASC_TRACE=1 node .appstore/asc.js <command> --dry-run 2>&1 | grep -E '^\[http\] (POST|PATCH|DELETE)'` must print nothing. Then run the command live, then run it once more: the re-run must make zero writes and print only `= …` lines.
- **Build numbers:** take the next unused build number (`node .appstore/asc.js builds`), never reuse one. A number that reached App Store Connect is burned even if that build was never submitted.

### Pre-flight

1. (C) Agreement check: `node .appstore/asc.js builds` lists the uploaded builds. If it prints `ASC API error: 403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`, nothing in this section can run until (J) accepts Apple's agreement (see User-only steps).
2. (C) Set `app.json` `expo.ios.buildNumber` (a string) to the next unused build number from that list. Change `expo.version` only for a new marketing version (see the version-bump rule above). `eas.json` pins `cli.appVersionSource` to `local`, so EAS uses this number, and `__tests__/config/app-config.test.ts` asserts a range, so it keeps passing. Worked example: 1.1.0 stayed 1.1.0 and went from build 17 to 18.
3. (C) `npx jest --runInBand` → 0 failures. Always required. `--runInBand` because the Android widget suite flakes under parallel workers.
4. (C) `npm run typecheck` and `npm run lint` both exit 0. They're CI gates since spec 07.
5. (C) `npx expo config --type introspect --json`: `UIBackgroundModes` is `["remote-notification"]` only, there's no `NSFaceIDUsageDescription`, `runtimeVersion` has policy `fingerprint`, and `ios.buildNumber` is the new number.
6. (C) `npx expo-doctor` exits 0 (20/20 checks on SDK 58, spec 10 FR9).
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

1. (C) `eas build -p ios --profile production`, on **EAS cloud** only. Never `eas build --local`, for two reasons:
   - A local build creates no EAS build record. Spec 04's publish guard (`eas build:list --runtime-version`), section A step 1 above and spec 06's `build-<N>` tag all read that record. Without it, `scripts/ota-publish.sh` refuses every publish for the build's runtime, and the build can't be tagged.
   - A local build ignores the image pinned in `eas.json` and compiles with this Mac's Xcode instead (27.0 as of 2026-10-20), so it would also miss the pinned Xcode. From v1.2.0 (SDK 58), `build.production.ios.image` pins **`macos-tahoe-26.6-xcode-27.1`**: Xcode 27.1 (27A9275) with the iOS 27 SDK, which Apple requires for uploads from April 2027. The image is bumped with every SDK (`## SDK upgrade`).
   - A 1.1.x rebuild from `release/1.1` (section B2) is the exception: that branch's `eas.json` has no pin, so `auto` picks the `sdk-55` image, `macos-sequoia-15.6-xcode-26.2` (Xcode 26.2). That's required: SDK 55 has no scene lifecycle and must never be compiled against the iOS 27 SDK.
2. (C) Record the EAS build id, which is required, and its `gitCommitHash`. A cloud build always has an id: no id means it wasn't a cloud build, so stop.
3. (C) Check the build log: build number `<N>`, no `cli.appVersionSource` warning, and the "Spin up build environment" section names the pinned image `macos-tahoe-26.6-xcode-27.1` and Xcode 27.1 (27A9275). For a `release/1.1` rebuild, it names `macos-sequoia-15.6-xcode-26.2` and Xcode 26.2 instead.
4. (C) Record the iOS runtime. At the build commit, run `npx expo-updates runtimeversion:resolve --platform ios` (spec 04). Don't use the bare `@expo/fingerprint` CLI: it hashes both platforms, so its hash never equals the iOS runtime.
5. (C) EAS record check, before Upload:
   ```bash
   eas build:list --platform ios --status finished --channel production --app-build-version <N> --limit 1 --json --non-interactive
   ```
   It must return the recorded EAS build id, with `appVersion` = the version, `appBuildVersion` = `<N>`, `gitCommitHash` = the HEAD SHA recorded in Pre-flight, and `runtime.version` = the local resolve. Stop if it returns `[]` or any field differs. `[]` means the build wasn't an EAS cloud build, or it isn't on channel `production`. A different commit means the tree moved after Pre-flight. For a runtime mismatch, run `eas fingerprint:compare --build-id <id>`.

### Upload

1. (C) From the main checkout: `eas submit -p ios --profile production --latest`. Confirm that the build eas-cli submits is the recorded EAS build id. If any other iOS build has started since, run `eas submit -p ios --profile production --id <eas-build-id>` instead.
2. (C) Only EAS cloud builds are uploaded. There's no variant that uploads a local `.ipa`.
3. (C) Wait until `node .appstore/asc.js builds` lists `<N> … VALID`, and record the ASC build id from its `Build IDs` list.
4. (J) **ITMS-91053 check.** In the App Store Connect processing email for build N, search for `ITMS-91053`. Check build N−1's email too, as a baseline. Record either "none" or every binary it names, including the `ExpoWidgetsTarget` extension, with its API categories.
   - **It names only `ExpoWidgetsTarget`, and build N is `VALID`:** compare the listed categories with the extension's own manifest, `buildWidgetPrivacyManifest()` in `plugins/withHourglassWidgetPrivacyManifest.js` (from v1.2.0). A category or reason it lacks: add it there and to `__tests__/config/widget-privacy-plugin.test.ts`, then rebuild with the next unused build number before submitting. All already declared: record it, don't block, and open a follow-up.
   - **It names the main app binary:** spec 03's FR4 manifest is missing a reason. Add that reason to `ios.privacyManifests` and the FR4 contract test, then rebuild with the next unused build number before submitting.
   - **Build N never reaches `VALID`:** this is a release blocker. Stop and escalate.
5. (C) Record the result and the branch taken. The release can't be marked "ready to submit" until the result is "none" or the first branch with nothing missing. The second branch restarts Build with the next unused build number. The third stops the release.

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
6. (J) Widget refresh on open: after step 3 changes the pending count, open the app, let Home load, then go to the home screen. The widget shows the new values. Don't wait for a cron tick: the silent push doesn't refresh the widget in this build. `addNotificationReceivedListener` only hears foreground `willPresent`, and there's no `registerTaskAsync` task (policy §5 says so).
7. (J) A local deadline notification fires, and tapping it routes correctly.
8. (J) Sign Out clears data, and the widgets switch to the empty signed-out view (0.0h, $0, no names or pending items). (C) reads `curl -s https://dynamic-balance-production-1696.up.railway.app/health` right before and right after: `tokenCount` drops by 1. Repeat once if other users make the result ambiguous.

### User-only steps

1. (J) Accept Apple's updated agreement (Account Holder only: ASC → Business) whenever asc.js or `eas submit` reports `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`.
2. (J) App Privacy label (OPS O5): Identifiers → Device ID and Diagnostics → Crash Data, each App Functionality, Not Linked to You, Not Used for Tracking. They match `ios.privacyManifests` in `app.json` and policy §5 (Crash Data is expo-updates' `Expo-Fatal-Error` header). The public ASC API doesn't expose it.
3. (J) Confirm that the demo account in App Review Information signs in on the new build.
4. (J) If `disable-public-link` showed no internal group, create one in ASC → TestFlight and add yourself. Internal testing needs no Beta App Review.

### Submit

1. (J) Decide whether to submit, only after all 8 smoke checks pass and the Upload processing-email result allows it.
2. (C) Preview the submission: `ASC_TRACE=1 node .appstore/asc.js submit-app-review <buildId> --dry-run 2>&1`. Expect `= build <N> already attached`, then `[dry-run] POST /reviewSubmissions`, `[dry-run] POST /reviewSubmissionItems` and `[dry-run] PATCH /reviewSubmissions/<new-submission-id>`, ending with `[dry-run] 3 write(s) skipped`. The `[http]` trace must show only GETs. If an earlier run stopped partway, the open submission is reused instead: the preview prints `= reusing review submission <id> (<state>)`, skips the `POST /reviewSubmissions`, and also skips the item POST when it prints `= version <x.y.z> already an item of submission <id>`. Two open submissions make it refuse.
3. (J) Submit: click Submit for Review in ASC, or tell C to run `node .appstore/asc.js submit-app-review <buildId>` live.

### Post-release

1. (C) Once the version is READY_FOR_SALE, run the baseline OTA in section A above (spec 04 runbook A) for this build.
2. (C) Then work through any open "After build N is live" items in `features/app/store-compliance/OPS.md`. For build 18 these are O8–O10; O8's key revocation is (J).
3. (C) For 1.2.0 (build 19): tag the build's `gitCommitHash` as `build-19` and run section A for it. `feat/sdk-58` merges into `main` only once build 18's review is resolved and build 19 has passed the TestFlight smoke. The merge also publishes `site/` through `pages.yml`, including the support page's iOS 16.4 line. Keep `release/1.1` until it can be retired (section B2).

### If something fails

- (C) A smoke check fails, or the processing email names the main app binary: fix it on `main`, take the next unused build number (never reuse one), and repeat Pre-flight, Build, Upload and Attach and verify. `attach-build <new-buildId>` replaces the attached build, and the guard refuses the older one. Don't submit the failed build.
- (C) An asc.js command refuses. `No editable App Store version … Run: node .appstore/asc.js create-version <x.y.z>` means: create the version first. `URL not live` means: finish spec 01 / OPS O2 first. `ASC API error: 403 …` means: (J) accepts the agreement. `socialMedia not exposed by the API` means: (J) does OPS O3 in the ASC UI. Any other ASC API error on a write means (J) makes that change in the ASC UI, then (C) confirms it with `check-submission` or `list-testers`.
- (C) The cloud build's `runtime.version` differs from the local resolve: stop and run `eas fingerprint:compare --build-id <id>`. Fix `fingerprint.config.js` / `.fingerprintignore` before trusting the baseline OTA.
- (C) Someone ran `eas build --local` anyway: never upload that artifact. If it was already uploaded, that build number is burned: take the next unused one and rebuild on EAS cloud.
- (J) App Review rejects the version: reply in Resolution Center. Metadata-only fixes need no rebuild. The `set-*` commands still work, because `REJECTED`, `METADATA_REJECTED` and `DEVELOPER_REJECTED` are editable states. A binary fix takes the next unused build number.

## SDK upgrade

An Expo SDK bump is always a native release (section E: it forks the runtime), so everything in `## Native release` applies. These steps come on top. Worked example: spec 10, SDK 55 → 58, shipped as v1.2.0 (build 19).

1. **Versions.** Compare the new SDK's `bundledNativeModules.json` (in the `expo` package) with `package.json`. Write every bundled range, the newest compatible version of each non-bundled package, every removal and the devDependencies that the new peers force into `package.json` **first**, then run one `npm install`. After that, run `npx expo install --check`, and `npx expo install --fix` for any bundled drift, until `--check` exits 0. Record any later patch release that `--fix` picks.
   - Don't start with `npx expo install expo@<new>`. Its `--fix` can pull in a package whose peer conflicts with one that's still declared at the old version. Spec 10 hit this: expo-router 58's optional peer `@testing-library/react-native >= 14` conflicts with RNTL 13 (ERESOLVE).
2. **No forcing.** Never use `--legacy-peer-deps` or `--force`. Find the conflicting peer and fix that range. Afterwards, `npm ls --all 2>&1 | grep -E "invalid|UNMET"` prints nothing.
3. **Patches policy.** A package with a `patches/<pkg>+<version>.patch` gets an exact version pin and an `expo.install.exclude` entry, for exactly as long as its patch exists (`__tests__/config/deps.test.ts` enforces "exclude if and only if a patch exists"). Before the bump, check each patch against the new version and delete the hunks upstream has fixed. `postinstall` (`patch-package --error-on-fail --error-on-warn`) aborts the install on a hunk that no longer applies, so retire patches before installing. Today `patches/` is empty.
4. **Image pin.** Bump `build.production.ios.image` in `eas.json` with every SDK. Use the full image name that Expo's build-infrastructure page tags `sdk-<N>`, never an alias such as `auto`, `latest` or `sdk-<N>` (`__tests__/config/app-config.test.ts` checks the shape). Re-check the page before each production build. If the pinned image is gone, or its Xcode is a beta, take the newest non-beta image for the same Xcode major and record it. `development` and `preview` stay on `auto`. SDK 58: `macos-tahoe-26.6-xcode-27.1` (Xcode 27.1, 27A9275).
5. **Prebuild inspection (spec 10 FR9).** Do this before spending an EAS production build. Nothing here ships.
   - Work in a throwaway copy with its own git repo; never prebuild inside a worktree. `T=$(mktemp -d) && cp -cR "<worktree>" "$T/app" && rm "$T/app/.git" && git -C "$T/app" init -q && git -C "$T/app" add -A && git -C "$T/app" commit -qm scratch`. A worktree's `.git` file points into the main checkout's git directory, so remove it before any git command runs in the copy.
   - In the copy, before prebuild, `npx expo-updates runtimeversion:resolve --platform ios` must equal the worktree's value after a fresh `npm ci`.
   - `npx expo prebuild --platform ios --clean --no-install`, recording every warning. Then check the generated `ios/`: the Info.plist scene manifest, `SceneDelegate.swift`, the deployment targets, both entitlements files, both privacy manifests and the widget Swift (spec 10 contract I4).
   - Run `cd ios && pod install` (record the `[Expo-precompiled]` lines, step 7), then a compile-only Release build: `xcodebuild -workspace Hourglassxo.xcworkspace -scheme Hourglassxo -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`. Never archive or export locally. In the product, `Hourglassxo.app/PlugIns/ExpoWidgetsTarget.appex/` has no `Frameworks/` directory and does have `PrivacyInfo.xcprivacy`.
   - `npx expo-doctor` exits 0 in the worktree. Delete the copy; the worktree's `git status --porcelain` is unchanged.
6. **IPA check (after the EAS build).** Download the build's `artifacts.buildUrl` into a new `mktemp -d`, unzip it, and `plutil -extract` each key from `Payload/*.app/Info.plist`:
   - `DTSDKName` starts with the new iOS SDK (`iphoneos27`), `DTSDKBuild` with its build prefix (`24`) and `DTXcode` with the Xcode major (`27`).
   - `CFBundleShortVersionString` / `CFBundleVersion` are the new version and build number, and `MinimumOSVersion` is the SDK's minimum (`16.4`).
   - The scene delegate class ends with `.SceneDelegate`.
   - Then the widget extension, `Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/`. Its `Info.plist` has no `UIApplicationSceneManifest`. Its `PrivacyInfo.xcprivacy` exists and contains `CA92.1`, `1C8F.1`, `C617.1` and `35F9.1`. It has no `Frameworks/` directory, because App Store validation rejects an extension that embeds frameworks. It also has no `*.debug.dylib` or `__preview.dylib`: a local compile-only Release build has them, because expo-widgets compiles the widget unoptimized (spec 10 FR9), but build 18's archived IPA didn't.
7. **Precompiled modules.** SDK 58 precompiles Expo modules by default. Record the `[Expo-precompiled]` lines from `pod install` (the local step 5 run, or the "Install pods" phase of the EAS log). They say which pods are prebuilt. If `pod install` or the `ExpoWidgetsTarget` link fails because of a prebuilt pod (duplicate pods across the app and extension targets, undefined symbols in the extension, or "unavailable in application extensions"), the fallback is one plugin entry, `["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`, added together with the failing log line. `app-config.test.ts` allows exactly that entry and nothing else from `expo-build-properties`. SDK 58 didn't need it.
8. **eas-cli JSON shape.** eas-cli ≥ 22 prints build objects with `runtime: { id, version }` and `updateChannel`, in place of `runtimeVersion` and `channel`; update objects are unchanged. `scripts/ota-publish.sh` reads `(b.runtime && b.runtime.version) ?? b.runtimeVersion`, so it works with both, and its test has a fixture for each. After an eas-cli major upgrade, read the release notes and confirm the shape with a read-only `eas build:list --platform ios --status finished --channel production --limit 1 --json --non-interactive`. `eas.json` `cli.version` is `">= 25.2.0"`.
9. **Fingerprint config.** After an `@expo/fingerprint` upgrade, compare `fingerprint.config.js` with the new default preset. Our `sourceSkips` array replaces the preset's skips instead of adding to them (spec 10 Decision 11; `fingerprint-config.test.ts`). Then resolve the iOS runtime twice on a clean tree after a fresh `npm ci`; the two values must match.
10. **ITMS-91053 for every binary.** In the processing email, check `ITMS-91053` for every binary it names, including the `ExpoWidgetsTarget` extension, and compare with the previous build's result (Upload step 4). The extension has its own manifest, written by `plugins/withHourglassWidgetPrivacyManifest.js`, because React Native's aggregation only covers the app target. A new SDK can link new required-reason APIs into either binary.
11. **The ASC key and `asc.js` in a worktree (spec 10 Decision 16, option (c)).** `.appstore/` (the `.p8` key, `api_key.json` and `asc.js`) is gitignored and exists only in the main checkout. Don't copy it into a worktree. Run `asc.js` commands and `eas submit` from the main checkout. `eas submit -p ios --profile production --id <eas-build-id>` uploads that EAS build's own artifact, not the checkout's code, so the branch the main checkout is on doesn't change what's uploaded.
12. **Lint.** A new eslint-config-expo can bring new rules at `error`. eslint-plugin-react-hooks 7 (SDK 58) added the React Compiler rules. Fix the local, behavior-neutral cases. Otherwise turn off only the named rule, with a dated `TODO` in `eslint.config.js`. Never turn off `rules-of-hooks` or `exhaustive-deps`.

### `expo/fetch` escape hatch

Since SDK 56, `globalThis.fetch` is `expo/fetch`. It defaults to `credentials: 'include'`, rejects network errors with `FetchError`, and lets a response body be read only once. `src/api/client.ts` is written for that (spec 10 FR3): it reads each body once, as text.

If a device check fails because of fetch semantics, fix it in the client and add a test. Only as a recorded last resort, set `EXPO_PUBLIC_USE_RN_FETCH=1`, which makes Expo keep React Native's own fetch (`expo/src/winter/runtime.native.ts`). The value is inlined into the JS bundle when it's built, so it has to be set in **both** places, or the embedded bundle and the OTA bundles behave differently:

- `eas.json` `build.<profile>.env`, for every profile. That changes the binary without forking the runtime (section E, caveat row), so it ships as a native build.
- The EAS `production` environment variables, which `eas update --environment production` (and so `scripts/ota-publish.sh`) applies. A `.env` file won't work, because the script publishes with `EXPO_NO_DOTENV=1`.

Record why it was needed, and remove it with the next native build once the client handles the case.
