# Spec Research: Dependency Hygiene

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `06-dependency-hygiene`

---

## Problem Context

This is the prerequisite for the SDK upgrade (spec 08), and it ships as **the next build after 18** (19 unless 18 needed a retry), kept out of 18 to hold that build's risk down.
- `"expo-widgets": "^55.0.5"` is a caret range, while `patches/expo-widgets+55.0.5.patch` (130 KB, rewrites native Swift) is pinned by filename. The sdk-55 tag is 55.0.20+, so any lockfile refresh silently orphans the patch.
- `postinstall: patch-package` exits 0 on a version mismatch outside CI, so an unpatched widget looks like a successful install.
- `@expo/ngrok` is a dev tunnel helper misfiled in `dependencies` and imported nowhere. (`expo-background-fetch` and `expo-task-manager` are removed by spec 03.)
- 26 packages are behind their SDK 55 patch line: `expo` 55.0.7→55.0.31, `react-native` 0.83.2→0.83.10, plus `expo-notifications` and `expo-updates`. Those are bug fixes in exactly the modules this app depends on.

## Exploration Findings

### Key Files

| File | Relevance |
|------|-----------|
| `package.json` | Pins, scripts, deps |
| `patches/expo-widgets+55.0.5.patch` | Must keep applying |
| `patches/react-native-reanimated+4.2.1.patch` | `reanimated` is pinned exact `4.2.1`; `--fix` may want a newer 4.2.x. If so, regenerate or rename the patch |
| `TECH_STACK.md:164` | Mentions ngrok |

## Key Decisions

### Decision 1: Upgrade expo-widgets to 55.0.20 or stay pinned?

**Chosen:** Pin `55.0.5` exactly in this spec. Re-basing a 130 KB native patch is its own risk; it gets re-evaluated in spec 08 anyway, where expo-widgets jumps majors.

### Decision 2: Pinned packages vs `expo install --fix`

`expo install --fix` will try to move pinned packages. Rule: if `--fix` moves a package that has a patch file, either regenerate the patch against the new version (`npx patch-package <pkg>` after re-applying the diff) or exclude that package with `expo.install.exclude` in package.json. **Chosen:** `expo.install.exclude: ["expo-widgets"]`, and allow reanimated to move only if its patch still applies cleanly (otherwise exclude it too).

### Decision 3: Gate

Gate on `npm test` against the baseline. Once spec 07 lands, also gate on typecheck and lint. Don't chain `tsc && npm test` before spec 07.

## Interface Contracts

| Item | Contract |
|------|----------|
| `dependencies["expo-widgets"]` | `"55.0.5"` (no range) |
| `scripts.postinstall` | `"patch-package --error-on-fail"` |
| `dependencies` | no `@expo/ngrok` |
| `expo.install.exclude` (package.json) | includes `"expo-widgets"` |
| `npx expo install --check` | exits 0 after running `--fix` twice |
| Patches | both apply (`npm ci` output lists them as applied, no warnings) |

## Test Plan

### `__tests__/config/deps.test.ts` (new)
- `expo-widgets` version string matches `/^\d+\.\d+\.\d+$/` (exact).
- For every file in `patches/`, the `name+version.patch` version equals the installed version in `package-lock.json` (`packages["node_modules/<name>"].version`). This is the core guard against orphaned patches.
- `postinstall` contains `--error-on-fail`.
- `@expo/ngrok` is not in dependencies.

### Commands (checklist)
- `rm -rf node_modules && npm ci`: both patches apply; exit 0.
- `npx expo-doctor`: all checks pass.
- `npm test`: no new failures vs. baseline.
- `eas build -p ios --profile preview` + TestFlight/internal install: run the spec 05 smoke checklist (widgets and notifications are what patch-line bumps touch).

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `package.json`, `package-lock.json` | modify | Pins, scripts, removals, bumps |
| `patches/react-native-reanimated+*.patch` | modify/rename if version moves | Keep applying |
| `__tests__/config/deps.test.ts` | create | Guards |
| `TECH_STACK.md` | modify | Versions, ngrok |
| `app.json` | modify | buildNumber → next unused |

## Edge Cases to Handle

1. **The fingerprint changes** (spec 04). Expected: this is a native change, which is why it ships as build 19.
2. **`npx expo start --tunnel` after removing ngrok.** Expo CLI installs it on demand. Note this in TECH_STACK.

## Open Questions

None remaining.
