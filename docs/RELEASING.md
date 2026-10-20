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
