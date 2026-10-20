# Spec Research: Expo SDK 55 → 57 + UIKit Scene Lifecycle

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `08-expo-sdk-57-scenes`

---

## Problem Context

From April 2027 (month only; re-check early Feb 2027), uploads must be built with the iOS 27 SDK. An iOS 27 SDK build without UIKit scene lifecycle doesn't launch (SIGTRAP before app code). `enableSceneSupport` exists only in `expo-build-properties` 57.x (artifact-verified absent from 55.0.18 and 56.0.27). So the path is a two-major upgrade: 55 → 56 → 57 (RN 0.83 → 0.86). **Don't ship 56**: Hermes V1 becomes default there with a memory regression that hits reanimated/worklets apps, fixed in expo ≥57.0.9. Ship as **v1.2.0**, on a branch, over 2–4 weeks.

## Exploration Findings

### Breaking changes at 56 (all apply here)

| Change | Sites | Approach |
|--------|-------|----------|
| expo-router drops react-navigation | `app/`, `src/`, **`components/`** (only `@react-navigation/elements` import) | `npx expo-codemod sdk-56-expo-router-react-navigation-replace app src components`, then **manual grep** (expo/expo#46481: codemod misses ~50%) |
| `@expo/vector-icons` → `@react-native-vector-icons/*` | all icon imports | `npx @react-native-vector-icons/codemod` + grep |
| Min iOS 15.1 → 16.4 | config | Accept. Note it in What's New / support page |
| `expo/fetch` replaces `globalThis.fetch` | `src/api/client.ts:36,223,261`, `src/lib/pushToken.ts:35,65` | Run the API tests. Escape hatch is `EXPO_PUBLIC_USE_RN_FETCH=1` if response/empty-body parsing regresses (see the build-11 empty-body bug in memory) |

### Native surface at risk under scenes

| Surface | File | Why |
|---------|------|-----|
| Foreground refresh | `useScheduledNotifications.ts:276`, `useAIData.ts:376`, `useRoleRefresh.ts` (`AppState.addEventListener`) | Under scenes, UIKit stops calling app-delegate lifecycle callbacks; AppState must still fire |
| Push + notification tap routing | `app/_layout.tsx`, `src/notifications/` | Delegate callbacks move |
| Widget extension + app group | expo-widgets (patched), `src/widgets/bridge.ts` | expo-widgets major jump. **The 130 KB patch must be re-based or retired** |
| Deep links (`hourglassws://`) | expo-router | Scene `openURL` path |

### Patches
- `patches/react-native-reanimated+4.2.1.patch`: obsolete at reanimated 4.5.x (`_requiresAnimatedComponent` removed). Delete it.
- `patches/expo-widgets+55.0.5.patch`: diff its intent against expo-widgets 57. Keep only what's still needed, regenerate, and remove from `expo.install.exclude` once rebased.

## Key Decisions

### Decision 1: Hop strategy

**Chosen:** One branch `feat/sdk-57`, with two commits-worth of milestones: (a) 56 compiles and tests are green in Expo Go / dev client (not shipped); (b) 57.0.24+ with scenes, shipped. Each milestone gets a dev-client build.

### Decision 2: Scene support config

```json
["expo-build-properties", { "ios": { "enableSceneSupport": true } }]
```
Floors: `expo ≥ 57.0.23` and `expo-build-properties ≥ 57.0.20`. Source: the 2026-09-22 audit (`wf_c3720f0e-78a`, action 11), where a verifier grepped the npm tarballs. **Re-verify at execution time** with `npm view expo-build-properties versions` + tarball grep for `enableSceneSupport`, and check expo.dev/changelog for the Hermes V1 memory fix version (audit: ≥57.0.9). Verify that on SDK 57 **no** `SceneDelegate.swift` is generated; instead `AppDelegate.swift` conforms to `ExpoReactNativeFactoryProvider` and Info.plist has `UISceneDelegateClassName = EXExpoAppSceneDelegate`.

## Interface Contracts

| Item | Contract |
|------|----------|
| `package.json` `expo` | `~57.0.24` (≥57.0.23) |
| `expo-build-properties` | installed, ≥57.0.20, plugin entry above |
| `app.json` `version` | `1.2.0`; buildNumber continues the sequence |
| No `@react-navigation/*` direct imports remaining | `grep -rn "@react-navigation" app src components` empty, unless expo-router re-exports require it |
| No `@expo/vector-icons` imports | grep empty |
| Prebuilt Info.plist | has `UIApplicationSceneManifest` / `UISceneDelegateClassName` |

## Test Plan

### Automated
- `npm test`, `npm run typecheck`, `npm run lint` green at each milestone. This depends on spec 07, so the type fallout from 56 is visible.
- `__tests__/config/app-config.test.ts`: the `expo-build-properties` plugin entry has `ios.enableSceneSupport === true`.
- `__tests__/config/deps.test.ts` (spec 06): the patch/version alignment still holds.
- API client tests (`__tests__/client.test.ts`, `approvals-api.test.ts`, `auth-api.test.ts`) pass under `expo/fetch`, including the empty-body case.

### Manual (dev client, then TestFlight, on iOS 26 and iOS 27 devices)
- Everything in spec 05's smoke checklist, plus:
- Background the app for 1 min, then foreground: hours and AI data refresh (AppState hooks fire).
- Kill the app, tap a deadline notification: it routes to the right screen. Same for a widget tap.
- Silent push while backgrounded: the widget updates.
- `hourglassws://` deep link opens the right route from Safari.
- Memory: 10 minutes of tab switching with charts animating, with no growth trend in Xcode memory gauge (Hermes V1 regression check).

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `package.json`, lockfile | modify | SDK 57 line |
| `app.json` | modify | build-properties plugin, version |
| `app/**`, `src/**`, `components/**` | modify | Codemod fallout |
| `patches/*` | modify/delete | Rebase / retire |
| `__tests__/config/app-config.test.ts` | modify | Scene-support assertion |
| `__tests__/config/deps.test.ts` | modify | Keep patch/version guard passing |
| `TECH_STACK.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md` | modify | Versions |

## Edge Cases to Handle

1. **OTA during the upgrade.** The fingerprint changes, so 1.1.x users keep getting OTA only from the 1.1.x tree. Do hotfixes on a `release/1.1` branch, not on `feat/sdk-57`.
2. **Codemod misses.** Grep is the source of truth, not the codemod's report.

## Open Questions

None remaining.
