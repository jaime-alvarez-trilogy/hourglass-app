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
- `site/support.html` (new)
- `.github/workflows/pages.yml` (new)
- `privacy-policy.html` (delete — superseded by `site/`)

### App
- `src/lib/legalLinks.ts` (new)
- `app/modal.tsx` (modify — About section with Privacy Policy / Support / version row)
- `src/lib/log.ts` (modify — Buffer → TextEncoder)
- `src/components/NativeWindSmoke.tsx` + its test (delete)

### Native config
- `app.json` (modify — invalid keys, Face ID, background modes, privacy manifest, runtimeVersion, buildNumber, later expo-build-properties)
- `package.json` / `package-lock.json` (modify — dead deps, pins, scripts, SDK bumps)
- `tsconfig.json` (modify — `types`)
- `eas.json` (modify — later: pinned build image)
- `TECH_STACK.md` (modify)

### CI
- `.github/workflows/test.yml` (modify — typecheck + lint gates)

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
- Reach Expo SDK 57 with scene lifecycle, then SDK 58 / Xcode 27, before April 2027.

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
7. **iOS 27-ready**: Expo SDK 57 with `enableSceneSupport`, then SDK 58 built on an Xcode 27 EAS image.

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
| Build 19 | Spec 06 (SDK 55 patch refresh) | Native build |
| SDK 57 (v1.2.0) | Spec 08 | Native build, Dec 2026–Jan 2027 |
| SDK 58 (v1.3.0) | Spec 09 | Native build, when Expo ships an Xcode 27 image; before April 2027 |

Non-code steps (App Store Connect, key handling, repo hygiene) are in [OPS.md](OPS.md).

## Changelog of Feature Specs

| Date | Spec | Description |
|------|------|-------------|
| 2026-10-19 | [01-legal-pages](specs/01-legal-pages/spec-research.md) | Corrected privacy policy + support page on GitHub Pages |
| 2026-10-19 | [02-in-app-legal-links](specs/02-in-app-legal-links/spec-research.md) | Settings → About: Privacy, Support, version |
| 2026-10-19 | [03-native-config-cleanup](specs/03-native-config-cleanup/spec-research.md) | app.json cleanup, drop background-fetch deps, privacy manifest |
| 2026-10-19 | [04-ota-lane](specs/04-ota-lane/spec-research.md) | Fingerprint runtimeVersion + baseline-update verification |
| 2026-10-19 | [05-release-build-18](specs/05-release-build-18/spec-research.md) | Build 18 bump, TestFlight smoke, submission runbook |
| 2026-10-19 | [06-dependency-hygiene](specs/06-dependency-hygiene/spec-research.md) | Pin patched deps, harden patch-package, SDK 55 patch refresh |
| 2026-10-19 | [07-ci-typecheck-lint](specs/07-ci-typecheck-lint/spec-research.md) | Fix Buffer bug, delete out-of-repo test, clear TS/lint, add CI gates |
| 2026-10-19 | [08-expo-sdk-57-scenes](specs/08-expo-sdk-57-scenes/spec-research.md) | SDK 55→56→57 + UIKit scene lifecycle |
| 2026-10-19 | [09-sdk-58-xcode-27](specs/09-sdk-58-xcode-27/spec-research.md) | SDK 58 on an Xcode 27 image (externally blocked) |

### Dependency Graph

| Spec | Blocks | Blocked By | Complexity | Ships in |
|------|--------|------------|------------|----------|
| 01-legal-pages | 02, 05 | - | S | web (immediate) |
| 02-in-app-legal-links | 05 | 01 | S | build 18 |
| 03-native-config-cleanup | 04, 05, 06 | - | M | build 18 |
| 04-ota-lane | 05 | 03 | S | build 18 |
| 05-release-build-18 | 06 | 01, 02, 03, 04 | S | build 18 |
| 06-dependency-hygiene | 08 | 03, 05 | M | build 19 |
| 07-ci-typecheck-lint | 08 | - | L | any (JS-only) |
| 08-expo-sdk-57-scenes | 09 | 06, 07 | L | v1.2.0 |
| 09-sdk-58-xcode-27 | - | 08 + Expo Xcode 27 image | M | v1.3.0 |
