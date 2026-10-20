# Spec Research: Native Config Cleanup + Privacy Manifest

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `03-native-config-cleanup`

---

## Problem Context

Four Info.plist/config defects ship in the binary (audit actions 8 + 9). They're native, so they can't go OTA and must ride build 18:

1. `newArchEnabled` (app.json:10) and `android.edgeToEdgeEnabled` (app.json:36) were removed from the SDK 55 schema, so `expo-doctor` fails its schema check.
2. `UIBackgroundModes` includes `fetch`, but no background-fetch code has ever existed (`git log -S'BackgroundFetch'` returns nothing). That's a Guideline 2.5.4 risk. Removing it from app.json alone doesn't work, because the auto-applied config plugins of `expo-background-fetch` **and** `expo-task-manager` push `fetch` back in. Both packages are imported nowhere.
3. `NSFaceIDUsageDescription` ships the expo-secure-store template string. The app never uses `requireAuthentication`, and expo-local-authentication isn't installed.
4. There's no `ios.privacyManifests`, so no app-level `PrivacyInfo.xcprivacy` is generated. App Group UserDefaults (`src/widgets/bridge.ts`, expo-widgets `WidgetsStorage.swift`) needs reason `1C8F.1`, which no dependency manifest declares.

## Exploration Findings

### Key Files

| File | Relevance |
|------|-----------|
| `app.json` | All config edits |
| `package.json` | Uninstall `expo-background-fetch`, `expo-task-manager` |
| `TECH_STACK.md:10,144,145` | Documents `newArchEnabled` and the two packages; update |
| `CLAUDE.md` quick reference | Says "SDK 54 / RN 0.81.5", which is stale. Fix it to SDK 55 / RN 0.83 |
| `src/widgets/bridge.ts` | App Group UserDefaults writer (justifies `1C8F.1`) |

Verified 2026-10-19: neither package is imported (`grep -rn "expo-background-fetch\|expo-task-manager" app src components hooks` returns no imports).

## Key Decisions

### Decision 1: How to remove `fetch`

**Options:** (a) uninstall both dead packages; (b) keep them and add a trailing `withInfoPlist` filter plugin.
**Chosen:** (a). It removes dead code and the deprecated package, with no custom plugin to maintain. (`@expo/ngrok` removal stays in spec 06.)

### Decision 2: Face ID string

**Chosen:** `["expo-secure-store", { "faceIDPermission": false }]`. `@expo/config-plugins` deletes the key when the value is exactly `false`.

### Decision 3: Privacy manifest content

**Chosen:** The audit's verified set. Every code comes from a manifest already shipping in node_modules, plus `1C8F.1`:

```json
"privacyManifests": {
  "NSPrivacyTracking": false,
  "NSPrivacyTrackingDomains": [],
  "NSPrivacyCollectedDataTypes": [
    {
      "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeDeviceID",
      "NSPrivacyCollectedDataTypeLinked": false,
      "NSPrivacyCollectedDataTypeTracking": false,
      "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
    }
  ],
  "NSPrivacyAccessedAPITypes": [
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPITypeReasons": ["CA92.1", "1C8F.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp", "NSPrivacyAccessedAPITypeReasons": ["C617.1", "0A2A.1", "3B52.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace", "NSPrivacyAccessedAPITypeReasons": ["E174.1", "85F4.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime", "NSPrivacyAccessedAPITypeReasons": ["35F9.1"] }
  ]
}
```

**Rationale for declaring Device ID** (the audit left `[]` as an open choice): spec 01's policy now discloses the push token, and OPS O5 declares it in the nutrition label. The manifest must agree with both. Do **not** add ActiveKeyboards.

## Interface Contracts

### Config contract (post-change, verified via `npx expo config --type introspect --json`)

| Path | Expected |
|------|----------|
| `newArchEnabled` | absent |
| `android.edgeToEdgeEnabled` | absent |
| `ios.infoPlist.UIBackgroundModes` | `["remote-notification"]` exactly |
| `ios.infoPlist.NSFaceIDUsageDescription` | absent |
| `ios.privacyManifests` | as in Decision 3 |
| `dependencies` | no `expo-background-fetch`, no `expo-task-manager` |

## Test Plan

### `__tests__/config/app-config.test.ts` (new, plain Jest reading `app.json` + `package.json`)
**Happy Path:**
- `UIBackgroundModes` equals `['remote-notification']`.
- `newArchEnabled` and `android.edgeToEdgeEnabled` are undefined.
- The `expo-secure-store` plugin entry is a tuple with `faceIDPermission === false`.
- `privacyManifests.NSPrivacyAccessedAPITypes` includes the UserDefaults entry with both `CA92.1` and `1C8F.1`, and the SystemBootTime entry with `35F9.1`.
- `NSPrivacyTracking === false`.

**Edge Cases:**
- `package.json` dependencies contain neither `expo-background-fetch` nor `expo-task-manager`. This guards against re-adding a package that re-injects `fetch`.

### Introspection check (manual, recorded in checklist)
- `npx expo config --type introspect | grep -A4 UIBackgroundModes` shows only `remote-notification`. This is the real proof, because plugins run here.
- `npx expo-doctor`: the schema check passes. The package-version check may stay red until spec 06.
- `npx expo prebuild -p ios --clean` in a scratch copy produces `ios/Hourglassxo/PrivacyInfo.xcprivacy` containing `1C8F.1`. Directory is `Hourglassxo`, from the app name. Delete `ios/` afterwards; this is a CNG project.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `app.json` | modify | All config changes |
| `package.json`, `package-lock.json` | modify | Uninstall 2 packages |
| `__tests__/config/app-config.test.ts` | create | Regression guard |
| `TECH_STACK.md`, `CLAUDE.md` | modify | Doc drift |

## Edge Cases to Handle

1. **Silent push still works without `fetch`.** Silent pushes use `remote-notification` only. Verify in the spec 05 TestFlight smoke that the widget refreshes after a server ping.
2. **The prebuilt `ios/` folder is accidentally committed.** Confirm `ios/` is in `.gitignore` before running prebuild.

## Open Questions

None remaining.
✓ Device ID in manifest → declared (Decision 3).
