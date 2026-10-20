# Spec Research: SDK 58 on Xcode 27 (iOS 27 SDK build)

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `09-sdk-58-xcode-27`

---

## Problem Context

This is the step that actually satisfies Apple's April 2027 rule. It's **externally blocked**: as of the audit, EAS's newest image was `macos-tahoe-26.5-xcode-26.6` (tagged `latest` / `sdk-57`), and SDK 58 was `58.0.0-preview.5` on an RN 0.88 RC. Expo said Xcode 27 images are "coming soon". `eas.json` pins no `image`, so `auto` keeps resolving an SDK-appropriate Xcode 26.x. Waiting alone never reaches iOS 27.

**Start trigger (both required):** (1) an `*-xcode-27.*` image listed at docs.expo.dev/build-reference/infrastructure/; (2) SDK 58 stable on expo.dev/changelog. The spec executor must check these first and stop if either is missing.

## Exploration Findings

| Item | Notes |
|------|-------|
| `eas.json` | No `image` key in any profile |
| `app.json` `orientation: "portrait"` | Becomes a preference under iOS 27 resizability |
| Layout | Zero `Dimensions.get()` calls; ~15 `onLayout` sites feed widths into the Skia/Victory charts, so it's largely resize-ready |
| Version-coupled natives | expo-widgets, @shopify/react-native-skia, reanimated + worklets, react-native-svg, victory-native (41→42 **major**), nativewind, react-native-android-widget |

## Key Decisions

### Decision 1: Scene config at 58
**Chosen:** Remove the `enableSceneSupport` property added in spec 08. It becomes default and prebuild warns on it. Expect `SceneDelegate.swift` + `UIApplicationSceneManifest` from prebuild.

### Decision 2: Pin the build image
**Chosen:** Set `build.production.ios.image` to the specific Xcode 27 image for reproducibility. Add "bump eas image" to the SDK-upgrade checklist in `docs/RELEASING.md`, because pinning severs the `auto` coupling.

### Decision 3: Tablet
**Chosen:** Keep `supportsTablet: true`. Setting it false doesn't avoid resizability on iOS 27.

## Interface Contracts

| Item | Contract |
|------|----------|
| `expo` | `~58.x` stable |
| `eas.json` `build.production.ios.image` | `"<xcode-27 image id>"` |
| `app.json` | no `enableSceneSupport` property; version `1.3.0` |
| Uploaded build | ASC `GET /v1/builds/{id}?include=buildBundles` → `sdkBuild` starts with `24` (iOS 27), not `23` |

## Test Plan

### Automated
- All three CI gates are green.
- `app-config.test.ts`: `eas.json` production profile has an `ios.image` matching `/xcode-27/`, and the build-properties plugin has no `enableSceneSupport`.

### Manual (TestFlight, iOS 27 iPhone + iPad)
- Spec 05 + spec 08 smoke checklists.
- Resizability: iPad split view at 1/3, 1/2 and 2/3 widths, plus Stage Manager free-resize. Charts reflow without clipping, the sticky bar stays usable, and nothing overlaps.
- Verify the build log's "Spin up build environment" section shows Xcode 27.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `package.json`, lockfile | modify | SDK 58 |
| `app.json` | modify | Drop property, version |
| `eas.json` | modify | Pin image |
| `docs/RELEASING.md` | modify | Image-bump step |
| `__tests__/config/app-config.test.ts` | modify | Image pin + no enableSceneSupport |
| Layout fixes as found | modify | Resizability |

## Edge Cases to Handle

1. **Expo ships late (after ~Mar 2027).** Escalate. The fallback is a bare-workflow prebuild with a local Xcode 27 build plus `eas submit` of a local archive. Decide in early Feb 2027.
2. **victory-native 42 API changes.** Budget a chart-by-chart pass; the chart tests cover the data path only.

## Open Questions

None remaining.
✓ What if the trigger isn't met → the executor stops and reports (Problem Context).
