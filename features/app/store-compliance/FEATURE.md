# Feature: Store Compliance & App Health

## Feature ID

`store-compliance`

## Metadata

| Field | Value |
|-------|-------|
| **Domain** | app |
| **Feature Name** | Store Compliance & App Health |
| **Contributors** | @jaime-alvarez-trilogy |

## Files Touched

### Web (GitHub Pages)
- `site/index.html` (new)
- `site/privacy-policy.html` (new — moved from repo root, text corrected)
- `site/support.html` (new; spec 10: "Requires iOS 16.4 or later")
- `.github/workflows/pages.yml` (new)
- `privacy-policy.html` (delete — superseded by `site/`)

### App
- `src/lib/legalLinks.ts` (new)
- `app/modal.tsx` (modify — About section with Privacy Policy / Support / version row)
- `src/lib/log.ts` (modify — Buffer → TextEncoder)
- `src/components/NativeWindSmoke.tsx` + its test (delete)

### Native config
- `app.json` (modify — invalid keys, Face ID, background modes, privacy manifest, runtimeVersion, buildNumber; spec 10: v1.2.0, widget background and widget privacy-manifest plugins)
- `plugins/withHourglassWidgetBackground.js`, `plugins/withHourglassWidgetPrivacyManifest.js` (new — spec 10: widget `containerBackground` fallback; `PrivacyInfo.xcprivacy` for the `ExpoWidgetsTarget` extension)
- `package.json` / `package-lock.json` (modify — dead deps, pins, scripts, SDK bumps)
- `tsconfig.json` (modify — `types`)
- `eas.json` (modify — spec 10: `cli.version` ≥ 25.2.0, pinned production image `macos-tahoe-26.6-xcode-27.1`)
- `TECH_STACK.md` (modify; spec 10: SDK 58 line)

### Docs
- `docs/RELEASING.md` (modify — spec 04 OTA runbook, spec 05 native release; spec 10: SDK 58 build steps, `runtime.version`, B2 hotfix lane, SDK upgrade)
- `docs/ARCHITECTURE.md` (modify — spec 10: §5.7 UIKit scenes, §7.2 expo-widgets 58)
- `README.md`, `CLAUDE.md` (modify — spec 10: SDK 58 / RN 0.88)

### CI
- `.github/workflows/test.yml` (modify — typecheck + lint gates; spec 10: Node 22)

## Table of Contents

- [Feature Overview](#feature-overview)
- [Intended State](#intended-state)
- [System Architecture](#system-architecture)
- [Release Plan](#release-plan)
- [Changelog of Feature Specs](#changelog-of-feature-specs)

## Feature Overview

### Summary

Bring Hourglass back into a shippable, compliant, maintainable state: fix the App Store gates blocking 1.1.0, ship the overdue native fixes in build 18, restore the OTA hotfix lane, make CI honest, and carry the app to the iOS 27 SDK before Apple's April 2027 cutoff.

### Problem Statement

The 2026-09-22 compliance audit (134-agent workflow, `wf_c3720f0e-78a`) found nothing broken for users, but:
- v1.1.0 / build 17 has never been submitted. It expires **2026-11-04**.
- The privacy, support and marketing URLs registered in App Store Connect all return **404**. They point at the old `hourglass-scriptable` Pages site; `hourglass-app` has never had Pages enabled.
- There is no in-app privacy policy link (Guideline 5.1.1(i)).
- `app.json` ships two invalid schema keys, an unused `fetch` background mode (Guideline 2.5.4) and a Face ID usage string for a feature that doesn't exist.
- There is no app-level privacy manifest, and the App Group UserDefaults reason (`1C8F.1`) is declared nowhere.
- **OTA updates reach zero users** (`runtimeVersion: appVersion` + a commitTime ordering trap).
- CI runs only `npm test`: 526 TypeScript errors and 9 lint errors go unseen, and one test reads a file outside the repo.
- Expo SDK 55 has no UIKit scene support. The iOS 27 SDK (required from April 2027) won't launch without it.

### Goals

- Ship **build 18** (v1.1.0) through App Review before 2026-11-04 with every compliance gate closed.
- From build 18 onward, OTA hotfixes actually reach installed users.
- CI gates on tests, typecheck and lint, all green.
- Reach Expo SDK 58 (UIKit scene lifecycle) built on an Xcode 27 / iOS 27 SDK image, before April 2027: one direct 55 → 58 jump shipped as v1.2.0 (spec 10, superseding the two-step plan in specs 08 and 09).

### Non-Goals

- New user-facing features. The only planned UI change is the Settings → About section; spec 07 may also fix a tab style that typecheck shows is being silently ignored (screenshotted).
- Foreground OTA checks (`checkForUpdateAsync`). Updates continue to apply on next cold start; revisit after the lane is proven.
- Android store listing. Android config is cleaned up only where it's shared (`app.json`).
- Retracting history from the archived outer repo. It's read-only; untracking stops future drift only (see OPS.md).

## Intended State

### Key Behaviors

1. **Live legal pages**: `https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html` and `/support.html` return 200, deployed from `site/` by a GitHub Actions Pages workflow. App Store Connect points at them.
2. **Accurate policy**: The policy accurately describes the anonymous push-token relay, has a retention/deletion clause, and no longer claims "no databases".
3. **In-app access**: Settings shows an About section with Privacy Policy, Support and the app version + build. Links open in the in-app browser.
4. **Clean native config**: `expo-doctor` passes its config-schema check. Info.plist declares only `remote-notification` in `UIBackgroundModes`, has no `NSFaceIDUsageDescription`, and ships a `PrivacyInfo.xcprivacy` that declares `1C8F.1`.
5. **Working OTA lane**: `runtimeVersion` uses the `fingerprint` policy, so marketing-version bumps don't sever OTA. A baseline update published after release is verified to land on a store install.
6. **Honest CI**: `npm test`, `npm run typecheck` and `npm run lint` all run on every PR and all pass.
7. **iOS 27-ready**: Expo SDK 58, whose template generates the scene lifecycle, built on the pinned EAS image `macos-tahoe-26.6-xcode-27.1` (spec 10).

## System Architecture

### Component Structure

```
site/ ──(pages.yml on push to main)──► GitHub Pages ◄── App Store Connect URLs
                                              ▲
src/lib/legalLinks.ts (URL constants) ──► app/modal.tsx About section
                                              │ openBrowserAsync (expo-web-browser)

app.json ──(EAS prebuild / CNG)──► Info.plist, PrivacyInfo.xcprivacy, runtimeVersion (fingerprint)
```

### Data Flow

```
User taps "Privacy Policy" → legalLinks.PRIVACY_POLICY_URL → expo-web-browser sheet → GitHub Pages
eas update (production) → runtime = fingerprint(native deps) → matches build 18+ binaries → next cold start
```

## Release Plan

| Release | Contains | Path |
|---------|----------|------|
| **Build 18 (v1.1.0)** — target submit ≤ 2026-10-31 | Specs 01, 02, 03, 04, 05 (+ 07's Buffer fix if merged) | Native build → TestFlight → App Review |
| Baseline OTA | Proves the lane (spec 04 FR4) | `eas update` after build 18 is live |
| 1.1.x hotfixes (while 1.2.0 rolls out) | Fixes for build 18 users | `release/1.1` (from `aade79b`, tag `build-18`): OTA with `scripts/ota-publish.sh`, or a native rebuild on the `sdk-55` image; each fix cherry-picked forward (`docs/RELEASING.md` B2) |
| **v1.2.0, build 19** | Spec 10: direct SDK 55 → 58 on the iOS 27 SDK, minimum iOS 16.4. Includes spec 06 FR1–FR4; spec 06 FR5 is superseded | Native build (EAS, `macos-tahoe-26.6-xcode-27.1`) → TestFlight → App Review on the user's go-ahead; before April 2027 |
| After 1.2.0 is live | Baseline OTA for build 19 (spec 04 runbook A); merge `feat/sdk-58` into `main` (allowed once build 18's review is resolved and build 19 has passed the TestFlight smoke); retire `release/1.1` once 1.1.x adoption is negligible | `docs/RELEASING.md` A, Post-release, B2 |
| ~~Build 19~~ | ~~Spec 06 (SDK 55 patch refresh)~~: FR1–FR4 ported into spec 10 FR1, FR5 superseded | — |
| ~~SDK 57 (v1.2.0)~~ | ~~Spec 08~~: superseded by spec 10 | — |
| ~~SDK 58 (v1.3.0)~~ | ~~Spec 09~~: superseded by spec 10 | — |

Non-code steps (App Store Connect, key handling, repo hygiene) are in [OPS.md](OPS.md).

## Changelog of Feature Specs

| Date | Spec | Description |
|------|------|-------------|
| 2026-10-19 | [01-legal-pages](specs/01-legal-pages/spec.md) | Corrected privacy policy + support page on GitHub Pages |
| 2026-10-19 | [02-in-app-legal-links](specs/02-in-app-legal-links/spec.md) | Settings → About: Privacy, Support, version |
| 2026-10-19 | [03-native-config-cleanup](specs/03-native-config-cleanup/spec.md) | app.json cleanup, drop background-fetch deps, privacy manifest |
| 2026-10-19 | [04-ota-lane](specs/04-ota-lane/spec.md) | Fingerprint runtimeVersion + baseline-update verification |
| 2026-10-19 | [05-release-build-18](specs/05-release-build-18/spec.md) | Build 18 bump, TestFlight smoke, submission runbook |
| 2026-10-19 | [06-dependency-hygiene](specs/06-dependency-hygiene/spec.md) | Pin patched deps, harden patch-package, SDK 55 patch refresh. FR1–FR4 ported into spec 10 FR1; **FR5 superseded by 10** |
| 2026-10-19 | [07-ci-typecheck-lint](specs/07-ci-typecheck-lint/spec.md) | Fix Buffer bug, delete out-of-repo test, clear TS/lint, add CI gates |
| 2026-10-19 | [08-expo-sdk-57-scenes](specs/08-expo-sdk-57-scenes/spec.md) | **Superseded by 10.** SDK 55→56→57 + UIKit scene lifecycle |
| 2026-10-19 | [09-sdk-58-xcode-27](specs/09-sdk-58-xcode-27/spec.md) | **Superseded by 10.** SDK 58 on an Xcode 27 image (externally blocked) |
| 2026-10-20 | [10-sdk-58-ios-27](specs/10-sdk-58-ios-27/spec.md) | Direct SDK 55→58 upgrade, every dependency at its latest SDK 58-compatible version, on the iOS 27 SDK (`macos-tahoe-26.6-xcode-27.1`); v1.2.0 build 19 |

### Dependency Graph

| Spec | Blocks | Blocked By | Complexity | Ships in |
|------|--------|------------|------------|----------|
| 01-legal-pages | 02, 05 | - | S | web (immediate) |
| 02-in-app-legal-links | 05 | 01 | S | build 18 |
| 03-native-config-cleanup | 04, 05, 06 | - | M | build 18 |
| 04-ota-lane | 05 | 03 | S | build 18 |
| 05-release-build-18 | 06 | 01, 02, 03, 04 | S | build 18 |
| 06-dependency-hygiene | 10 | 03, 05 | M | FR1–FR4 ported into spec 10; FR5 superseded |
| 07-ci-typecheck-lint | 10 | - | L | any (JS-only) |
| 08-expo-sdk-57-scenes | - | - | - | superseded by 10 |
| 09-sdk-58-xcode-27 | - | - | - | superseded by 10 |
| 10-sdk-58-ios-27 | - | 03, 04, 05, 07 (merged); 06 FR1–FR4 (ported) | L | v1.2.0, build 19 |
