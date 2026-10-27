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

- **Publish only through `scripts/ota-publish.sh`.** It refuses a dirty tree, a non-fingerprint runtime, and any runtime that no build has. A local build (build 21 on) counts through its annotated `build-<N>` tag, once origin has it and its `Runtime:` line is that runtime; an EAS cloud build (18–20) counts through its EAS record, a finished iOS build on channel `production`. It publishes iOS only, with `EXPO_NO_DOTENV=1`, so values from `.env.local` can't end up in the bundle. The one exception is section B, whose branch predates the script.
- **`fingerprint.config.js` and `.fingerprintignore` take effect only with the next native build.** Changing either one changes the runtime of every later publish. Never change them between a build and an OTA aimed at that build.
- **Bump versions with `npm version <x> --no-git-tag-version` plus the `app.json` `expo.version` edit**, so `package.json`, both `package-lock.json` root fields and `app.json` stay equal. `__tests__/config/app-config.test.ts` and `__tests__/config/fingerprint-config.test.ts` fail otherwise. A version bump alone doesn't change the runtime.
- **Don't commit `.env*` files.** OTA bundles never read them (`EXPO_NO_DOTENV=1`), but EAS builds would read a committed `.env` or `.env.production`, so builds and OTAs would quietly differ. Put such values in the EAS `production` environment variables instead; `eas update --environment production` applies those.

### A. Baseline after a native release

Run this once each new native build is READY_FOR_SALE. It proves that this tree's fingerprint and the build's agree and that store installs pick up updates, before an emergency depends on it. Worked example: build 18 (v1.1.0).

0. Before release, during the TestFlight smoke: the build's Settings row shows `Update: embedded`.
1. Get the build's record: its commit, runtime and version.
   - **Build 21 on (local builds):** the record is the annotated `build-<N>` tag that `scripts/build-ios-local.sh` made and Upload step 3 pushed. Record the commit and the `Version:`, `Build:` and `Runtime:` lines:
     ```bash
     git rev-parse 'build-<N>^{commit}'
     git for-each-ref --format='%(contents)' refs/tags/build-<N>
     ```
     `git ls-remote --tags origin refs/tags/build-<N>` must print the object that `git rev-parse refs/tags/build-<N>` prints. If it doesn't, the tag isn't pushed (or differs on origin), and step 5 won't count the build: stop and finish Upload step 3.
   - **Builds 18–20 (EAS cloud builds):** they keep their EAS record. Record `id`, `runtime.version`, `gitCommitHash` and `appVersion`. eas-cli ≥ 22 nests the runtime as `runtime.version`; older CLIs printed a top-level `runtimeVersion` (see `## SDK upgrade`):
     ```bash
     eas build:list --platform ios --status finished --channel production --app-build-version <N> --limit 1 --json --non-interactive
     ```
2. Check that the commit exists locally. `git cat-file -t <commit>` must print `commit`. If it doesn't, stop: the build's tree is unknown, so investigate before publishing. If an EAS build is also tagged `build-<N>` (build 18), `git rev-parse 'build-<N>^{commit}'` must print its `gitCommitHash`.
3. Check out the build's tree and install exactly its dependencies:
   ```bash
   git switch --detach <commit> && npm ci
   ```
   **Build 18: check out `7b0e328` instead of `aade79b`.** `7b0e328` is `aade79b` plus only the `ota-publish.sh` fix (the first commit on `release/1.1`). `aade79b`'s own script reads a top-level `runtimeVersion`, which eas-cli ≥ 22 no longer prints, so its step 5 refuses with `runtime ""`. Scripts aren't a fingerprint input, so step 4 still resolves build 18's runtime, and `app.json` there is 1.1.0 (18), so step 5 prints no `WARNING:`. Never work around a refusal with a hand-run `eas update` (that's only for section B's branch, which has no script). If a section B2 hotfix has already been published to build 18, skip this baseline: that publish and its step-7 check already prove the lane, and a baseline from `7b0e328` would roll the hotfix back. From build 19 on, the build's own commit has the fix.
4. `npx expo-updates runtimeversion:resolve --platform ios` must print the build's runtime (the tag's `Runtime:` line, or the EAS record's `runtime.version`) in its own `runtimeVersion` field.
5. Dry run. It must print `Dry run OK` and no `WARNING:`, and its `build:` line must name this build: `tag build-<N>, <version> (<N>)` for a local build, the EAS build id for builds 18–20:
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

**The lane.** `release/1.1` was cut from `aade79b`, the build-18 commit, which is tagged `build-18` (`git rev-parse 'build-18^{commit}'` prints `aade79b…`). It also carries the `ota-publish.sh` fix for eas-cli ≥ 22's build JSON (`7b0e328`, cherry-picked from `feat/sdk-58`), and the `Test` workflow trigger for `release/**` pushes (`92545fb`). Scripts aren't a fingerprint input, so the branch still resolves build 18's runtime. The branch's own copy of this file predates spec 10; follow this one. Build 18's section A baseline (Post-release step 1, OPS O11) also runs from `7b0e328`, not from `aade79b` (section A step 3).

A JS-only fix goes out as an OTA from `release/1.1`:

1. `git switch release/1.1 && rm -rf node_modules && npm ci`.
2. Commit the fix there. `npm test`, `npm run typecheck` and `npm run lint` exit 0.
3. Push, and wait for CI to pass **before** publishing: `git push origin release/1.1`, then `gh run list --branch release/1.1 --limit 1` and `gh run watch <run-id> --exit-status`, which must exit 0. The `Test` workflow runs on `release/**` pushes. A local pass isn't enough: spec 10 FR8's first CI run failed on a type declaration that only existed in the local checkout. Record the run URL with the hotfix. If the run is red, fix it on the branch and push again. Never publish a commit whose run isn't green.
4. `npx expo-updates runtimeversion:resolve --platform ios` must print build 18's runtime: the `runtime.version` of `eas build:list --platform ios --status finished --channel production --app-build-version 18 --limit 1 --json --non-interactive`.
5. `scripts/ota-publish.sh --dry-run "<msg>"` must print `Dry run OK` and name build 18. Then publish with `scripts/ota-publish.sh "<msg>"`, and verify on a build-18 install as in section A step 7.
6. Cherry-pick the fix forward: `git switch feat/sdk-58 && git cherry-pick -x <sha>` (onto `main` instead, once 1.2.0 has merged). Then run `rm -rf node_modules && npm ci` before recording any runtime there, because `runtimeversion:resolve` reads the local `node_modules`.

A native fix (App Review rejects build 18, or the fix touches a native input) is a rebuild from `release/1.1`: follow `## Native release` in this file, building from that branch with the next unused build number. 1.2.0 then takes the number after it; its tests assert a range, so they still pass. **Never compile it with Xcode 27**, which is this Mac's default: SDK 55 has no scene lifecycle, so a build against the iOS 27 SDK crashes. The branch has no `scripts/build-ios-local.sh`, and its `eas.json` has no image pin. (J) picks one of:

- **A one-off EAS cloud build** from `release/1.1`: `eas build -p ios --profile production`. With no pin, `auto` picks the `sdk-55` image, `macos-sequoia-15.6-xcode-26.2` (Xcode 26.2); its build log must name it. It gets an EAS record, which is what the branch's own `ota-publish.sh` reads, and it uploads from the main checkout with `eas submit -p ios --profile production --id <eas-build-id>`.
- **A local build with Xcode 26.x installed next to Xcode 27** (for example `/Applications/Xcode-26.2.app`). First cherry-pick `scripts/build-ios-local.sh`, the `ota-publish.sh` tag path and their tests onto `release/1.1`, and pin `build.production.ios.image` there to `macos-sequoia-15.6-xcode-26.2`, so the script requires Xcode 26. Then prefix both the dry run and the live run with `DEVELOPER_DIR=/Applications/Xcode-26.2.app/Contents/Developer`. The script refuses an Xcode whose major isn't the pin's, so it can't fall back to Xcode 27 silently.

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

- `Dry run OK`: a build has this exact runtime, so the change is OTA-compatible with that build. The `build:` line names it: `tag build-<N>, <version> (<N>)` for a local build (pushed tag), or the EAS build id for builds 18–20. It reaches App Store users only once that build is READY_FOR_SALE. Until then they're on the previous live build, so use section B to reach build 15, or section B2 to reach build 18 during the 1.2.0 rollout. Also check the caveat row in section E.
- `Refusing to publish: no finished iOS build on channel "production" has runtime …`: run `npm ci` and retry once, since local `node_modules` that drifted from the lockfile change the fingerprint too. If it still refuses, the change is native: ship a build. A last line `Local tag build-<N> has this runtime, but …` means a local build has it, but its tag isn't on origin yet (Upload step 3). To see which source changed:
  - Against an EAS cloud build (18–20): `eas fingerprint:compare --build-id <id> --environment production`. Find `<id>` with `eas build:list --platform ios --channel production --limit 1`.
  - Against a local build (21 on): `eas fingerprint:compare` takes `--build-id` only for EAS builds, so generate the fingerprint at the tag's commit in a throwaway copy and diff the two:
    ```bash
    npx expo-updates fingerprint:generate --platform ios > /tmp/fp-now.json
    T=$(mktemp -d) && git archive build-<N> | tar -x -C "$T"
    (cd "$T" && npm ci >/dev/null && npx expo-updates fingerprint:generate --platform ios) > /tmp/fp-build.json
    npx @expo/fingerprint fingerprint:diff /tmp/fp-build.json /tmp/fp-now.json
    ```
    `/tmp/fp-build.json`'s `hash` must equal the tag's `Runtime:` line; if it doesn't, the copy didn't reproduce the build, so trust nothing in the diff. The diff lists each source that changed (`[]` for none). Then `rm -rf "$T"`. Generate with `expo-updates fingerprint:generate --platform ios`, never the bare `@expo/fingerprint` generator, which hashes both platforms; `fingerprint:diff` only compares the two files.

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

- **Store builds run on this Mac.** J decided on 2026-10-27 that every store build from build 21 on is an `eas build --local` on this Mac (M4 Pro), run through `scripts/build-ios-local.sh`; build 20 (1.2.0, EAS build `76947a8f-5675-448f-bf33-55a85c2f6be1`) was the last EAS cloud build, and builds 18–20 keep their EAS records. A local build leaves no EAS record, so its annotated `build-<N>` tag is the record: section A and `scripts/ota-publish.sh` read it once it's pushed (Upload step 3).
- **Run asc.js and `eas submit` from the main checkout** (`/Users/Trilogy/Documents/Claude Code/WS/hourglassws`), never from a worktree. `.appstore/` holds `asc.js` and the `.p8` key that the `eas.json` submit block points at. It's gitignored, so worktrees don't have it, and it's never copied into one (spec 10 Decision 16, option (c); see `## SDK upgrade`).
- **Every asc.js write runs with `--dry-run` first.** A dry run sends only GET requests and prints each skipped write as `[dry-run] <METHOD> <path> <json>`, ending with `[dry-run] <n> write(s) skipped`. With `ASC_TRACE=1`, every request is also logged to stderr as `[http] <METHOD> <path> -> <status>`, so `ASC_TRACE=1 node .appstore/asc.js <command> --dry-run 2>&1 | grep -E '^\[http\] (POST|PATCH|DELETE)'` must print nothing. Then run the command live, then run it once more: the re-run must make zero writes and print only `= …` lines.
- **Build numbers:** take the next unused build number (`node .appstore/asc.js builds`), never reuse one. A number that reached App Store Connect is burned even if that build was never submitted.

### Pre-flight

1. (C) Agreement check: `node .appstore/asc.js builds` lists the uploaded builds. If it prints `ASC API error: 403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`, nothing in this section can run until (J) accepts Apple's agreement (see User-only steps).
2. (C) Set `app.json` `expo.ios.buildNumber` (a string) to the next unused build number from that list. Change `expo.version` only for a new marketing version (see the version-bump rule above). `eas.json` pins `cli.appVersionSource` to `local`, so EAS uses this number, and `__tests__/config/app-config.test.ts` asserts a range, so it keeps passing. Worked example: 1.1.0 stayed 1.1.0 and went from build 17 to 18.
3. (C) `npx jest --runInBand` → 0 failures. Always required. `--runInBand` because the Android widget suite flakes under parallel workers.
4. (C) `npm run typecheck` and `npm run lint` both exit 0. They're CI gates since spec 07.
5. (C) `npx expo config --type introspect --json`: `UIBackgroundModes` is `["remote-notification"]` only, there's no `NSFaceIDUsageDescription`, `runtimeVersion` has policy `fingerprint`, and `ios.buildNumber` is the new number.
6. (C) `npx expo-doctor` exits 0 (20/20 checks on SDK 58, spec 10 FR9). For a 1.1.x rebuild from `release/1.1` (SDK 55), the config-schema check must pass, but the package-version check may stay red, as that branch's own copy of this file says: its `expo-widgets` is patched (`patches/expo-widgets+55.0.5.patch`), and it has no `expo.install.exclude`.
7. (C) `scripts/check-legal-pages.sh` exits 0: all three legal URLs return 200 (spec 01).
8. (C) Clean, pushed tree on the branch being built: `main`, `feat/sdk-58` for 1.2.0, or `release/1.1` for a 1.1.x rebuild. `git status --porcelain` prints nothing, and `git rev-list --count @{u}..HEAD` prints `0`. If the branch has no upstream, that command fails: push it with `git push -u origin <branch>` first. Record the branch name and the HEAD SHA. `scripts/build-ios-local.sh` checks both again and tags that commit. An unpushed commit is how build 15's recorded commit (`1b45a8a`) went missing (section B).
9. (J) Give the go-ahead for live App Store Connect writes.

### App Store Connect prep (asc.js)

Do this **before** Build, for two reasons:

- The public TestFlight link has to be off, and its anonymous testers removed, before the new build lands in TestFlight. Otherwise strangers get an unreleased build (OPS O6).
- `set-urls` refuses until the legal URLs return 200. That check takes seconds, so it should fail before a long build, not after it.

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

1. (C) `npm ci`, so this checkout resolves the same runtime as the build's own `npm ci`. Then the dry run, which builds and tags nothing:
   ```bash
   scripts/build-ios-local.sh --dry-run
   ```
   It must print `Dry run OK` with the commit, the version, build `<N>`, the runtime, the Xcode and the IPA path, plus the exact build command. It refuses (exit 1, the reason on stderr) a dirty or unpushed tree, an `app.json` whose `expo.ios.buildNumber` isn't a positive integer string, a build number already used by a `build-<N>` tag here or on origin, an `eas.json` `build.production.ios.image` that doesn't end in `-xcode-<major>.<minor>`, an Xcode (`xcodebuild -version`, which follows `DEVELOPER_DIR`) whose major isn't the pin's, a non-fingerprint runtime, and an IPA that already exists. A different minor only warns: this Mac has Xcode 27.0 (27A266a) and the pin `macos-tahoe-26.6-xcode-27.1` names Xcode 27.1, and both build with the iOS 27 SDK that Apple requires from April 2027. A `release/1.1` rebuild never runs on Xcode 27 (section B2).
2. (C) The build: `scripts/build-ios-local.sh`. It runs `EXPO_NO_DOTENV=1 eas build --local --platform ios --profile production --non-interactive --output ~/hourglass-builds/hourglass-<version>-<N>.ipa` (`HOURGLASS_BUILD_DIR` moves the folder; it must be absolute) and passes on eas's exit code. Then it checks the IPA before tagging anything:
   - `Info.plist` of the app and of every `PlugIns/*.appex` (the widget): `CFBundleShortVersionString` and `CFBundleVersion` are `app.json`'s.
   - The app's `DTXcode` and `DTXcodeBuild` are the local Xcode's, and `DTSDKName` is `iphoneos<pin major>.*`.
   - The embedded runtime equals the local resolve. With `runtimeVersion: { "policy": "fingerprint" }`, expo-updates writes the literal `file:fingerprint` to `Expo.plist`'s `EXUpdatesRuntimeVersion`, and its "Generate updates resources" build phase writes the hash to `Payload/Hourglassxo.app/EXUpdates.bundle/fingerprint`, which the app reads at launch.
   - Every `embedded.mobileprovision` (app and widget) is an App Store profile: no `ProvisionedDevices`, no `ProvisionsAllDevices`, and `get-task-allow` false.

   Only when all of that passes does it create the annotated tag `build-<N>` at that commit, locally. The tag message records `Version:`, `Build:`, `Runtime:`, `Xcode:`, `SDK:` and `IPA-SHA256:`. A failed check exits 1, keeps the IPA and creates no tag (If something fails).
3. (C) Record the printed IPA path, sha256 and tag, and the tag message (`git for-each-ref --format='%(contents)' refs/tags/build-<N>`). Don't push the tag yet: Upload step 3 does that.

### Upload

1. (C) From the main checkout, upload the IPA the build printed (its absolute path works from there):
   ```bash
   eas submit -p ios --profile production --path ~/hourglass-builds/hourglass-<version>-<N>.ipa
   ```
   First, `shasum -a 256 <ipa>` must print the tag's `IPA-SHA256:` value. Only an IPA that passed the build script's check is ever uploaded.
2. (C) Wait until `node .appstore/asc.js builds` lists `<N> … VALID`, and record the ASC build id from its `Build IDs` list.
3. (C) Only then, with J's go-ahead like any push: `git push origin build-<N>`. The worktree and the main checkout share tags, so either can push it. This push is what makes the build's runtime OTA-eligible: `scripts/ota-publish.sh` counts a `build-<N>` tag only once origin has that same tag object. Check that `git ls-remote --tags origin refs/tags/build-<N>` prints the object that `git rev-parse refs/tags/build-<N>` prints. Never move, re-create or delete a pushed build tag.
4. (J) **ITMS-91053 check.** In the App Store Connect processing email for build N, search for `ITMS-91053`. Check build N−1's email too, as a baseline. Record either "none" or every binary it names, including the `ExpoWidgetsTarget` extension, with its API categories.
   - **It names only `ExpoWidgetsTarget`, and build N is `VALID`:** compare the listed categories with the extension's own manifest, `buildWidgetPrivacyManifest()` in `plugins/withHourglassWidgetPrivacyManifest.js` (from v1.2.0). A category or reason it lacks: add it there and to `__tests__/config/widget-privacy-plugin.test.ts`, then rebuild with the next unused build number before submitting. All already declared: record it, don't block, and open a follow-up.
   - **It names the main app binary:** spec 03's FR4 manifest is missing a reason. Add that reason to `ios.privacyManifests` and the FR4 contract test, then rebuild with the next unused build number before submitting.
   - **Build N never reaches `VALID`:** this is a release blocker. Stop and escalate. Don't push its tag.
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

1. (C) Once the version is READY_FOR_SALE, run the baseline OTA in section A above (spec 04 runbook A) for this build. For build 18 (OPS O11), run it from `7b0e328`, not `aade79b` (section A step 3).
2. (C) Then work through any open "After build N is live" items in `features/app/store-compliance/OPS.md`. For build 18 these are O8–O10; O8's key revocation is (J).
3. (C) Tag and baseline. A local build (21 on) is already tagged: the build script made `build-<N>` and Upload step 3 pushed it, so don't tag it again. An EAS cloud build (1.2.0 is build 19 or 20) gets a plain tag on its `gitCommitHash`, `git tag build-<N> <gitCommitHash>`, pushed with J's go-ahead; with no `Runtime:` line, `scripts/ota-publish.sh` ignores it and keeps reading the EAS record. Then run section A for the build. `feat/sdk-58` merges into `main` only once build 18's review is resolved and build 19 has passed the TestFlight smoke. The merge also publishes `site/` through `pages.yml`, including the support page's iOS 16.4 line. Keep `release/1.1` until it can be retired (section B2).

### If something fails

- (C) A smoke check fails, or the processing email names the main app binary: fix it on the branch the build was made from. That's `feat/sdk-58` for 1.2.0 until it merges, `release/1.1` for 1.1.x (then cherry-pick it forward, section B2 step 6), and `main` otherwise. SDK 58 work never goes onto `main` before the merge (Post-release step 3). Then take the next unused build number (never reuse one), and repeat Pre-flight, Build, Upload and Attach and verify. `attach-build <new-buildId>` replaces the attached build, and the guard refuses the older one. Don't submit the failed build.
- (C) An asc.js command refuses. `No editable App Store version … Run: node .appstore/asc.js create-version <x.y.z>` means: create the version first. `URL not live` means: finish spec 01 / OPS O2 first. `ASC API error: 403 …` means: (J) accepts the agreement. `socialMedia not exposed by the API` means: (J) does OPS O3 in the ASC UI. Any other ASC API error on a write means (J) makes that change in the ASC UI, then (C) confirms it with `check-submission` or `list-testers`.
- (C) `scripts/build-ios-local.sh` refuses before building: nothing was built or tagged, so fix the named cause and rerun. A used build number (a `build-<N>` tag here or on origin, or the IPA file already exists) means: take the next unused number (Pre-flight step 2). Never delete a build tag or an uploaded IPA to free a number. An Xcode major that isn't the pin's means: install the pinned major and select it (`DEVELOPER_DIR=/Applications/<Xcode>.app/Contents/Developer`); never edit the pin to match this Mac.
- (C) `eas build --local` fails: the script exits with eas's exit code and tags nothing. Nothing reached App Store Connect, so the number isn't burned: fix the cause and rerun with the same number, after deleting any IPA it left at the output path.
- (C) The IPA check fails (`IPA check failed: <ipa>`, exit 1): the IPA is kept and has no tag. Never upload it. Then, by the problem it lists:
  - `CFBundleVersion is <N+1>, not <N>` on the app and the widget: Xcode's export renumbered the build, because `<N>` is already in App Store Connect (Xcode manages the build number on export while it's signed in to the team's Apple account). On 2026-10-27, a local build of `df37d85` (`app.json` build 20, which cloud build 20 already uses) exported as 1.2.0 (21). Take the next unused number, commit, push and rebuild.
  - `the embedded runtime is <X>, but this tree resolves <Y>`: the build's own `npm ci` gave a different fingerprint than this checkout's `node_modules`. Run `npm ci` and resolve again. If it now prints `<X>`, delete the IPA and rerun with the same number (it never reached App Store Connect). If it still prints `<Y>`, the fingerprint isn't reproducible: stop, and fix `fingerprint.config.js` / `.fingerprintignore` (spec 10 Decision 11) before any build or OTA.
  - A `DTXcode`, `DTXcodeBuild` or `DTSDKName` mismatch: the build didn't use the Xcode the script checked (for example, `xcode-select` changed during the run). Select one Xcode, delete the IPA and rebuild.
  - A profile problem (`ProvisionedDevices`, `ProvisionsAllDevices` or `get-task-allow`): the EAS credentials handed out a profile that isn't App Store. Check the production profiles with `eas credentials -p ios` before rebuilding.
- (C) `ERROR: HEAD moved during the build`: the script can't tell which commit eas built, so it tagged nothing. Don't upload the IPA. Delete it and rerun on the commit you mean to ship.
- (J) App Review rejects the version: reply in Resolution Center. Metadata-only fixes need no rebuild. The `set-*` commands still work, because `REJECTED`, `METADATA_REJECTED` and `DEVELOPER_REJECTED` are editable states. A binary fix takes the next unused build number.

## SDK upgrade

An Expo SDK bump is always a native release (section E: it forks the runtime), so everything in `## Native release` applies. These steps come on top. Worked example: spec 10, SDK 55 → 58, shipped as v1.2.0 (build 19).

1. **Versions.** Compare the new SDK's `bundledNativeModules.json` (in the `expo` package) with `package.json`. Write every bundled range, the newest compatible version of each non-bundled package, every removal and the devDependencies that the new peers force into `package.json` **first**, then run one `npm install`. After that, run `npx expo install --check`, and `npx expo install --fix` for any bundled drift, until `--check` exits 0. Record any later patch release that `--fix` picks.
   - Don't start with `npx expo install expo@<new>`. Its `--fix` can pull in a package whose peer conflicts with one that's still declared at the old version. Spec 10 hit this: expo-router 58's optional peer `@testing-library/react-native >= 14` conflicts with RNTL 13 (ERESOLVE).
2. **No forcing.** Never use `--legacy-peer-deps` or `--force`. Find the conflicting peer and fix that range. Afterwards, `npm ls --all 2>&1 | grep -E "invalid|UNMET"` prints nothing.
3. **Patches policy.** A package with a `patches/<pkg>+<version>.patch` gets an exact version pin and an `expo.install.exclude` entry, for exactly as long as its patch exists (`__tests__/config/deps.test.ts` enforces "exclude if and only if a patch exists"). Before the bump, check each patch against the new version and delete the hunks upstream has fixed. `postinstall` (`patch-package --error-on-fail --error-on-warn`) aborts the install on a hunk that no longer applies, so retire patches before installing. Today `patches/` is empty.
4. **Image pin.** Bump `build.production.ios.image` in `eas.json` with every SDK. Store builds are local (`## Native release`), so the pin now names the Xcode that **this Mac's** build must use: `scripts/build-ios-local.sh` reads `-xcode-<major>.<minor>` off it and refuses an Xcode with another major (a different minor or patch only warns). With each bump, install that Xcode major locally, next to the old one if a `release/*` branch still needs it, and select it with `xcode-select` or `DEVELOPER_DIR` before the first build. Use the full image name that Expo's build-infrastructure page tags `sdk-<N>`, never an alias such as `auto`, `latest` or `sdk-<N>` (`__tests__/config/app-config.test.ts` checks the shape). Re-check the page before each production build. If the pinned image is gone, or its Xcode is a beta, take the newest non-beta image for the same Xcode major and record it. `development` and `preview` stay on `auto`. SDK 58: `macos-tahoe-26.6-xcode-27.1` (Xcode 27.1, 27A9275).
5. **Prebuild inspection (spec 10 FR9).** Do this before the first production build. Nothing here ships.
   - Work in a throwaway copy with its own git repo; never prebuild inside a worktree. `T=$(mktemp -d) && cp -cR "<worktree>" "$T/app" && rm "$T/app/.git" && git -C "$T/app" init -q && git -C "$T/app" add -A && git -C "$T/app" commit -qm scratch`. A worktree's `.git` file points into the main checkout's git directory, so remove it before any git command runs in the copy.
   - In the copy, before prebuild, `npx expo-updates runtimeversion:resolve --platform ios` must equal the worktree's value after a fresh `npm ci`.
   - `npx expo prebuild --platform ios --clean --no-install`, recording every warning. Then check the generated `ios/`: the Info.plist scene manifest, `SceneDelegate.swift`, the deployment targets, both entitlements files, both privacy manifests and the widget Swift (spec 10 contract I4).
   - Run `cd ios && pod install` (record the `[Expo-precompiled]` lines, step 7), then a compile-only Release build: `xcodebuild -workspace Hourglassxo.xcworkspace -scheme Hourglassxo -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`. Never archive or export locally. In the product, `Hourglassxo.app/PlugIns/ExpoWidgetsTarget.appex/` has no `Frameworks/` directory and does have `PrivacyInfo.xcprivacy`.
   - `npx expo-doctor` exits 0 in the worktree. Delete the copy; the worktree's `git status --porcelain` is unchanged.
6. **IPA check (after the build).** `scripts/build-ios-local.sh` already checks the versions, `DTXcode`, `DTXcodeBuild`, the `DTSDKName` major, the embedded runtime and the profiles. For the rest, unzip the IPA it printed (for builds 18–20, the EAS build's `artifacts.buildUrl`) into a new `mktemp -d`, and `plutil -extract` each key from `Payload/*.app/Info.plist`:
   - `DTSDKName` starts with the new iOS SDK (`iphoneos27`), `DTSDKBuild` with its build prefix (`24`) and `DTXcode` with the Xcode major (`27`).
   - `CFBundleShortVersionString` / `CFBundleVersion` are the new version and build number, and `MinimumOSVersion` is the SDK's minimum (`16.4`).
   - The scene delegate class ends with `.SceneDelegate`.
   - Then the widget extension, `Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/`. Its `Info.plist` has no `UIApplicationSceneManifest`. Its `PrivacyInfo.xcprivacy` exists and contains `CA92.1`, `1C8F.1`, `C617.1` and `35F9.1`. It has no `Frameworks/` directory, because App Store validation rejects an extension that embeds frameworks. It also has no `*.debug.dylib` or `__preview.dylib`: a local compile-only Release build has them, because expo-widgets compiles the widget unoptimized (spec 10 FR9), but build 18's archived IPA didn't.
7. **Precompiled modules.** SDK 58 precompiles Expo modules by default. Record the `[Expo-precompiled]` lines from `pod install` (the local step 5 run, or the `[INSTALL_PODS]` lines of the `eas build --local` output). They say which pods are prebuilt. If `pod install` or the `ExpoWidgetsTarget` link fails because of a prebuilt pod (duplicate pods across the app and extension targets, undefined symbols in the extension, or "unavailable in application extensions"), the fallback is one plugin entry, `["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`, added together with the failing log line. `app-config.test.ts` allows exactly that entry and nothing else from `expo-build-properties`. SDK 58 didn't need it.
8. **eas-cli JSON shape.** This matters for the EAS records of builds 18–20, which `scripts/ota-publish.sh` falls back to when no build tag matches. eas-cli ≥ 22 prints build objects with `runtime: { id, version }` and `updateChannel`, in place of `runtimeVersion` and `channel`; update objects are unchanged. `scripts/ota-publish.sh` reads `(b.runtime && b.runtime.version) ?? b.runtimeVersion`, so it works with both, and its test has a fixture for each. After an eas-cli major upgrade, read the release notes and confirm the shape with a read-only `eas build:list --platform ios --status finished --channel production --limit 1 --json --non-interactive`. `eas.json` `cli.version` is `">= 25.2.0"`.
9. **Fingerprint config.** After an `@expo/fingerprint` upgrade, compare `fingerprint.config.js` with the new default preset. Our `sourceSkips` array replaces the preset's skips instead of adding to them (spec 10 Decision 11; `fingerprint-config.test.ts`). Then resolve the iOS runtime twice on a clean tree after a fresh `npm ci`; the two values must match.
10. **ITMS-91053 for every binary.** In the processing email, check `ITMS-91053` for every binary it names, including the `ExpoWidgetsTarget` extension, and compare with the previous build's result (Upload step 4). The extension has its own manifest, written by `plugins/withHourglassWidgetPrivacyManifest.js`, because React Native's aggregation only covers the app target. A new SDK can link new required-reason APIs into either binary.
11. **The ASC key and `asc.js` in a worktree (spec 10 Decision 16, option (c)).** `.appstore/` (the `.p8` key, `api_key.json` and `asc.js`) is gitignored and exists only in the main checkout. Don't copy it into a worktree. Run `asc.js` commands and `eas submit` from the main checkout. `eas submit -p ios --profile production --path <ipa>` uploads that file, not the checkout's code, so the branch the main checkout is on doesn't change what's uploaded (`--id <eas-build-id>` did the same with an EAS build's artifact for builds 18–20).
12. **Lint.** A new eslint-config-expo can bring new rules at `error`. eslint-plugin-react-hooks 7 (SDK 58) added the React Compiler rules. Fix the local, behavior-neutral cases. Otherwise turn off only the named rule, with a dated `TODO` in `eslint.config.js`. Never turn off `rules-of-hooks` or `exhaustive-deps`.

### `expo/fetch` escape hatch

Since SDK 56, `globalThis.fetch` is `expo/fetch`. It defaults to `credentials: 'include'`, rejects network errors with `FetchError`, and lets a response body be read only once. `src/api/client.ts` is written for that (spec 10 FR3): it reads each body once, as text.

If a device check fails because of fetch semantics, fix it in the client and add a test. Only as a recorded last resort, set `EXPO_PUBLIC_USE_RN_FETCH=1`, which makes Expo keep React Native's own fetch (`expo/src/winter/runtime.native.ts`). The value is inlined into the JS bundle when it's built, so it has to be set in **both** places, or the embedded bundle and the OTA bundles behave differently:

- `eas.json` `build.<profile>.env`, for every profile. That changes the binary without forking the runtime (section E, caveat row), so it ships as a native build.
- The EAS `production` environment variables, which `eas update --environment production` (and so `scripts/ota-publish.sh`) applies. A `.env` file won't work, because the script publishes with `EXPO_NO_DOTENV=1`.

Record why it was needed, and remove it with the next native build once the client handles the case.
