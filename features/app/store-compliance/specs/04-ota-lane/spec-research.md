# Spec Research: Restore the OTA Lane

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `04-ota-lane`

> **Amended 2026-10-19, after spec.md was verified against the code.** Decision 2, the `.fingerprintignore` contract and runbook §B/§C now match spec.md. Where the two documents still differ in detail (for example `--channel` vs `--branch`, the publish script's audience guard, `EXPO_NO_DOTENV=1`), spec.md wins. [Corrections](#corrections) lists what was originally proposed and why it changed.

---

## Problem Context

OTA updates currently reach nobody, for two independent reasons (audit action 13):
1. `runtimeVersion: { policy: "appVersion" }` with app.json at 1.1.0, while every live user is on build 15 = runtime `1.0.0`. Runtime matching is exact. `eas update` publishes "successfully" to an empty audience.
2. The three existing rtv-1.0.0 updates (newest 2026-04-11) predate build 15's embedded bundle (built 2026-06-11). expo-updates only loads an update whose commitTime is later than the launched one (`LoaderSelectionPolicyFilterAware.swift:57`).

There's also a structural trap: with `appVersion`, every marketing-version bump silently forks the OTA audience.

## Exploration Findings

### Key Files

| File | Relevance |
|------|-----------|
| `app.json` `runtimeVersion`, `updates.url` | Policy change |
| `eas.json` | Channels: `production`, `preview`, `development` (already set) |
| `package.json:4` | `"version": "1.0.0"`, out of sync with app.json 1.1.0 |
| expo-updates 55.0.15 | Installed; no runtime calls anywhere (`grep Updates\.` in app/src returns none) |
| `scripts/` | Home for the runbook helper |

## Key Decisions

### Decision 1: Runtime policy

**Options:** keep `appVersion` and be careful; `nativeVersion` (forks on every build number, which is worse); **`fingerprint`**.
**Chosen:** `fingerprint`. The runtime only changes when native inputs change, so version bumps no longer sever OTA. Builds 15 and 17 would have shared a runtime.
**Consequence:** Build 18 starts a new runtime regardless, because spec 03 changes native config. Users still on 1.0/build 15 stay unreachable by OTA until they install 18. That's accepted: an emergency 1.0.0 fix is published from a branch cut at the build-15 commit (runbook §B).

### Decision 2: Fingerprint scope and determinism

The local and EAS fingerprints must agree, and only native inputs should move the runtime. Under default settings the iOS fingerprint also hashes `version` / `ios.buildNumber`, `package.json` scripts, `.gitignore` and `eas.json`. This repo edits all four for non-native reasons. `features/`, `docs/`, `site/`, `__tests__/`, `coverage/` and root `*.md` files are not fingerprint sources at all (`npx expo-updates fingerprint:generate --platform ios` lists none of them).
**Chosen:** a `fingerprint.config.js` with `sourceSkips: ['ExpoConfigVersions', 'PackageJsonScriptsAll', 'GitIgnore']`, plus a `.fingerprintignore` whose only pattern is `eas.json`. Nothing else goes in `.fingerprintignore`.
**Verification:** locally, `npx expo-updates runtimeversion:resolve --platform ios` (the runtime) or `npx expo-updates fingerprint:generate --platform ios` (the source list). Against EAS, the build's `runtimeVersion` from `eas build:list`, or `eas fingerprint:compare`. Compare iOS runtimes only. The bare `fingerprint` bin from `@expo/fingerprint` hashes both platforms, so it never matches the iOS runtime. `npx expo-fingerprint` isn't an npm package (404).

### Decision 3: Foreground update checks

**Chosen:** Out of scope (FEATURE non-goal). Updates apply on the next cold start, as today.

## Interface Contracts

| Item | Contract |
|------|----------|
| `app.json` `expo.runtimeVersion` | `{ "policy": "fingerprint" }` |
| `package.json` `version` | equals `app.json` `expo.version` (1.1.0) |
| `fingerprint.config.js` | `module.exports = { sourceSkips: ['ExpoConfigVersions', 'PackageJsonScriptsAll', 'GitIgnore'] }` (Decision 2) |
| `.fingerprintignore` | Effective patterns (trimmed, non-empty, not `#` comments) equal `['eas.json']` |
| `scripts/ota-publish.sh <message>` | Runs `eas update --branch production --environment production --message "$1"`, then prints the runtime version and update group id. Refuses to run with a dirty tree. **Superseded by spec.md FR3** (`--channel production --platform ios`, audience guard, `EXPO_NO_DOTENV=1`) |
| `docs/RELEASING.md` §OTA | Runbook (below) |

### Runbook (goes in `docs/RELEASING.md`)
- **A. Baseline after a native release:** once build 18 is READY_FOR_SALE, run `scripts/ota-publish.sh "baseline"` from the exact build-18 tree. Install from the App Store, cold-start twice, and confirm the Settings version row (spec 02) shows `Update: <id>` instead of `embedded`.
- **B. Emergency fix for users still on 1.0.0 (build 15):** branch from `e7fb801`, the build-15 version-bump commit. EAS recorded `1b45a8a` for build 15, but that commit isn't in the repo. `e7fb801` has build 15's `.gitignore`, version and buildNumber, and `package.json`, `package-lock.json` and `patches/` are unchanged since. Cherry-pick the JS-only fix. Confirm `npx expo-updates runtimeversion:resolve --platform ios` prints `"runtimeVersion":"1.0.0"` (the appVersion policy at that commit produces it, so no literal edit is needed). Publish with `EXPO_NO_DOTENV=1 eas update --channel production --environment production --platform ios --message "<msg>"`. **Never merge the branch, and never publish main with a literal `1.0.0`.** See [Corrections](#corrections) for why the earlier "edit main, then revert" procedure is unsafe.
- **C. Is it a JS-only change?** Run `scripts/ota-publish.sh --dry-run "check"`. A pass means OTA. A refusal at the audience guard means the change is native, so ship a build. `eas fingerprint:compare --build-id <id> --environment production` shows which source changed.

## Test Plan

### `__tests__/config/app-config.test.ts` (extends spec 03's file)
- `runtimeVersion` deep-equals `{ policy: 'fingerprint' }`.
- `package.json.version === app.json.expo.version`.

### `scripts/ota-publish.sh`
- A dirty tree makes it exit 1 with a message (manual check).
- A missing message argument makes it exit 1.

### End-to-end (manual, in spec 05's checklist and runbook A)
- Store or TestFlight build 18 cold start shows `Update: embedded`. After baseline publish and two cold starts, it shows the update id.

**Mocks Needed:** none (static config tests).

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `app.json` | modify | `runtimeVersion` policy |
| `package.json` | modify | version 1.1.0 |
| `fingerprint.config.js` | create | `sourceSkips` (Decision 2) |
| `.fingerprintignore` | create | Keep `eas.json` out of the hash (Decision 2) |
| `scripts/ota-publish.sh` | create | Guarded publish |
| `docs/RELEASING.md` | create | Release + OTA runbook (shared with spec 05) |

## Edge Cases to Handle

1. **The TestFlight build uses the `production` channel.** A baseline published before review would also hit TestFlight testers. That's fine, since it's the same code.
2. **Patch files change the fingerprint.** `patches/` stays included, because patches do alter native code.

## Open Questions

None remaining.

## Corrections

Made on 2026-10-19 while writing spec.md. The evidence is in spec.md's "Verified Facts".

| Originally proposed | Corrected to | Why |
|---------------------|--------------|-----|
| `.fingerprintignore` = `features/**`, `docs/**`, `site/**`, `__tests__/**`, `coverage/**`, `*.md` | `fingerprint.config.js` `sourceSkips` + `.fingerprintignore` = `eas.json` only | None of those paths is a fingerprint source, so the patterns did nothing. The non-native inputs that really forked the runtime were versions, `package.json` scripts, `.gitignore` and `eas.json`. |
| Verify with `npx expo-fingerprint fingerprint:generate` | `npx expo-updates runtimeversion:resolve --platform ios`; `eas build:list` `runtimeVersion` or `eas fingerprint:compare` | `expo-fingerprint` returns npm 404. The local `fingerprint` bin hashes both platforms, so its hash is never the iOS runtime. |
| §B: set `runtimeVersion` to a literal `"1.0.0"` on main, publish, revert in the next commit | Branch from `e7fb801`, publish from there, never merge, never publish main with a literal runtime | A literal runtime only *claims* compatibility. Once spec 03 lands, main's native inputs differ from build 15's (`expo-background-fetch` and `expo-task-manager` removed, Info.plist changes), so an update published from main as `1.0.0` would reach build-15 binaries it wasn't built for. The guard it relied on ("diff from the build-15 tag") can't run: the repo has no tags, and build 15's recorded commit `1b45a8a` doesn't exist. Publishing a literal runtime would also bypass spec.md FR3's 40-hex check. |
| Publish with `eas update --branch production` | `--channel production --platform ios`, after an audience guard, with `EXPO_NO_DOTENV=1` | See spec.md FR3. |
