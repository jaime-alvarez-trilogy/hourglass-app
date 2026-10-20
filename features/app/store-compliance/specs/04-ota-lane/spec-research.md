# Spec Research: Restore the OTA Lane

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `04-ota-lane`

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
**Consequence:** Build 18 starts a new runtime regardless, because spec 03 changes native config. Users still on 1.0/build 15 stay unreachable by OTA until they install 18. That's accepted: an emergency 1.0.0 fix uses the documented version-swap procedure (runbook §B).

### Decision 2: Fingerprint determinism

Local `npx expo-fingerprint` and EAS must agree. Add `.fingerprintignore` entries for files that change without affecting native output (`features/**`, `docs/**`, `site/**`, `__tests__/**`, `coverage/**`, `*.md`). Verify that `eas build` logs the same hash as `npx expo-fingerprint fingerprint:generate` locally.

### Decision 3: Foreground update checks

**Chosen:** Out of scope (FEATURE non-goal). Updates apply on the next cold start, as today.

## Interface Contracts

| Item | Contract |
|------|----------|
| `app.json` `expo.runtimeVersion` | `{ "policy": "fingerprint" }` |
| `package.json` `version` | equals `app.json` `expo.version` (1.1.0) |
| `.fingerprintignore` | Excludes non-native paths listed in Decision 2 |
| `scripts/ota-publish.sh <message>` | Runs `eas update --branch production --environment production --message "$1"`, then prints the runtime version and update group id. Refuses to run with a dirty tree |
| `docs/RELEASING.md` §OTA | Runbook (below) |

### Runbook (goes in `docs/RELEASING.md`)
- **A. Baseline after a native release:** once build 18 is READY_FOR_SALE, run `scripts/ota-publish.sh "baseline"` from the exact build-18 tree. Install from the App Store, cold-start twice, and confirm the Settings version row (spec 02) shows `Update: <id>` instead of `embedded`.
- **B. Emergency fix for users still on 1.0.0 (build 15):** only valid while the package.json diff from the build-15 tag shows no native change. Temporarily set `runtimeVersion` to `"1.0.0"` (a literal string), publish, then revert in the next commit.
- **C. Is it a JS-only change?** Compare `npx expo-fingerprint` before and after. Same hash means OTA; a changed hash means a native build.

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
| `.fingerprintignore` | create | Determinism |
| `scripts/ota-publish.sh` | create | Guarded publish |
| `docs/RELEASING.md` | create | Release + OTA runbook (shared with spec 05) |

## Edge Cases to Handle

1. **The TestFlight build uses the `production` channel.** A baseline published before review would also hit TestFlight testers. That's fine, since it's the same code.
2. **Patch files change the fingerprint.** `patches/` stays included, because patches do alter native code.

## Open Questions

None remaining.
