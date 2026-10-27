# Hourglass — Tech Stack Reference

## Platform & Runtime

| Layer | Value |
|---|---|
| **Expo SDK** | ~58.0.16 |
| **React Native** | 0.88.0 |
| **React** | 19.3.0 (`react-dom` 19.3.0) |
| **Architecture** | New Architecture (mandatory; there is no app.json toggle) |
| **JS engine** | Hermes |
| **React Compiler** | Disabled (`experiments.reactCompiler: false`) |
| **Node** | ≥ 22.13 (CI and EAS run 22) |
| **iOS** | ≥ 16.4 (the SDK 58 template default; `app.json` sets no `ios.deploymentTarget`) |
| **iOS SDK / Xcode** | iOS 27 SDK, Xcode 27.1 (27A9275), on the pinned EAS production image `macos-tahoe-26.6-xcode-27.1` |
| **iOS app lifecycle** | UIKit scenes from the SDK 58 template (`SceneDelegate: ExpoAppSceneDelegate`; `docs/ARCHITECTURE.md` §5.7) |
| **Bundle ID (iOS)** | `com.jalvarez0907.hourglass` |
| **Bundle ID (Android)** | `com.jalvarez0907.hourglass` |
| **EAS Project ID** | `4ad8a6bd-aec2-45a5-935f-5598d47b605d` |

---

## Navigation & Routing

| Library | Version | Role |
|---|---|---|
| **expo-router** | ~58.0.24 | File-based routing. Ships its own navigation fork since SDK 56: themes and `useIsFocused` come from `expo-router`, the tabs from `expo-router/native-tabs` (iOS) and `expo-router/js-tabs` (Android). There are no separate navigation packages |
| **react-native-screens** | ~4.30.0 | Native screen containers |
| **react-native-safe-area-context** | ~5.10.1 | Safe-area insets |
| **@react-native-masked-view/masked-view** | 0.3.2 | Masked views (an expo-router dependency) |

---

## Styling

| Library | Version | Role |
|---|---|---|
| **NativeWind** | ^4.2.7 | Tailwind CSS → React Native |
| **react-native-css-interop** | 0.2.7 | NativeWind v4 runtime engine. Pinned to exactly the version `nativewind` depends on (`__tests__/config/deps.test.ts`) |
| **tailwindcss** | ^3.4.19 | Class generation |

**Metro fix:** App-code imports of `react/jsx-runtime` and `react/jsx-dev-runtime` are redirected to `nativewind/jsx-runtime` via Metro resolver (bypasses a babel transform-ordering race). Re-verified on SDK 58 / RN 0.88: with the redirect removed, every `className` style is lost (spec 10 FR7), so it stays.

**Babel config:** `jsxImportSource: 'nativewind'` + `nativewind/babel` preset (disabled in test env).

---

## Design System

### Color Tokens (synced between `tailwind.config.js` and `src/lib/colors.ts`)

| Token | Hex | Semantic Use |
|---|---|---|
| `background` | `#0D0C14` | Screen fill |
| `surface` | `#16151F` | Default card |
| `surfaceElevated` | `#1F1E29` | Modals, active cards |
| `border` | `#2F2E41` | Card borders, dividers |
| `gold` | `#E8C97A` | Earnings, money values (primary brand accent) |
| `goldBright` | `#FFDF89` | Gradient endpoint, hero states |
| `cyan` | `#00C2FF` | AI usage % |
| `violet` | `#A78BFA` | BrainLift / deep-work |
| `success` | `#10B981` | On-track, positive |
| `warning` | `#F59E0B` | Behind pace, caution |
| `critical` | `#F43F5E` | Overdue, urgent |
| `destructive` | `#F85149` | Delete, reject actions |
| `textPrimary` | `#FFFFFF` | Hero numbers, headings |
| `textSecondary` | `#8B949E` | Metadata, supporting labels |
| `textMuted` | `#484F58` | Disabled, fine print |
| `overtimeWhiteGold` | `#FFF8E7` | Overtime achievement state |

### Typography

All type uses **Inter** (single-family system, v1.1). Hierarchy via weight + letter-spacing only.

| Token | Weight | Use |
|---|---|---|
| `font-display` / `font-display-bold` | Inter 700 Bold | Hero numbers, metric values |
| `font-display-extrabold` | Inter 800 ExtraBold | Hero states ("Crushed It") |
| `font-display-semibold` | Inter 600 SemiBold | Large headings |
| `font-display-medium` | Inter 500 Medium | Section headers |
| `font-sans` | Inter 400 Regular | UI labels, navigation, buttons |
| `font-sans-medium` | Inter 500 Medium | Form inputs |
| `font-sans-semibold` | Inter 600 SemiBold | Emphasized UI labels |
| `font-sans-bold` | Inter 700 Bold | Strong UI emphasis |
| `font-body` | Inter 400 Regular | Descriptive text, copy |
| `font-body-light` | Inter 300 Light | Fine print |
| `font-body-medium` | Inter 500 Medium | AI insights, onboarding |

**Loaded via:** `@expo-google-fonts/inter` ^0.4.2

### Border Radius Convention

| Class | Size | Use |
|---|---|---|
| `rounded-2xl` | 16px | Cards, panels, large containers |
| `rounded-xl` | 12px | Buttons, inputs, modals |
| `rounded-full` | — | Pills, status badges |
| `rounded-lg` | 8px | Inner card elements (minimum) |

### Spacing Convention

- `p-5` / `p-6` → card internal padding
- `gap-4` / `gap-6` → between cards and sections
- `px-4` → screen horizontal edge padding
- `gap-3` → list item spacing

---

## Graphics & Animation

| Library | Version | Role |
|---|---|---|
| **@shopify/react-native-skia** | 2.14.0 | Canvas drawing (ring, arc, scrub cursor). `SkPath` is immutable since 2.14: build paths with `Skia.Path.MakeFromSVGString` and trim with `<Path start end>`. `Skia.Path.Make()` is banned in app code (`__tests__/config/sdk58-migration.test.ts`) |
| **victory-native** | ^42.0.1 | Charts on Skia (bar chart, sparkline, cone). 42 is required by Skia 2.14 |
| **react-native-reanimated** | 4.7.1 | UI-thread animations, shared values |
| **react-native-worklets** | 0.13.0 | Worklet runtime for Reanimated 4 |
| **react-native-gesture-handler** | ~3.3.0 | Touch / gesture input (builder API; the RNGH 3 hook API migration is deferred) |
| **react-native-svg** | 15.16.0 | SVG rendering |
| **expo-linear-gradient** | ~58.0.3 | Gradient fills |
| **expo-blur** | ~58.0.5 | Blur overlays |

---

## Data & State

| Library | Version | Role |
|---|---|---|
| **@tanstack/react-query** | ^5.104.5 | Server state, caching, background refetch |
| **@tanstack/react-query-persist-client** | ^5.104.5 | Persists the Query cache across launches |
| **@tanstack/query-async-storage-persister** | ^5.104.5 | AsyncStorage persister for the Query cache |
| **@react-native-async-storage/async-storage** | 2.2.0 | Persistent local cache (AI data, config). Exactly the version SDK 58 bundles |
| **expo-secure-store** | ~58.0.2 | Encrypted credential storage |
| **expo-file-system** | ~58.0.10 | On-device debug log (`expo-file-system/legacy` in `src/lib/log.ts`) |

**Networking:** `fetch` is `expo/fetch` (SDK 56+). A response body can be read once, and `src/api/client.ts` `parseBody` reads it once, as text (spec 10 FR3). The `EXPO_PUBLIC_USE_RN_FETCH` escape hatch back to React Native's fetch is in `docs/RELEASING.md` (SDK upgrade).

---

## Widgets

| Library | Version | Platform | Role |
|---|---|---|---|
| **expo-widgets** | ~58.0.21 | iOS | JS layout → SwiftUI widget. Excluded from Android autolinking (`package.json` `expo.autolinking.android.exclude`) |
| **@expo/ui** | ~58.0.21 | iOS | SwiftUI components and modifiers (`containerBackground`, stacks) that the widget layout calls. A direct dependency, kept on the same version as expo-widgets |
| **react-native-android-widget** | ^0.23.0 | Android | Home screen widget |

**iOS widget app group:** `group.com.jalvarez0907.hourglass.widgets`

### Local config plugins (`plugins/`)

Both are listed in `app.json` `plugins` immediately before `expo-widgets`: a later plugin's mod runs first, so these run after expo-widgets has generated the widget target. Each throws when its anchor is missing, so a template change fails prebuild loudly. Editing either file forks the runtime.

| Plugin | What it does |
|---|---|
| **`withHourglassWidgetPrivacyManifest`** (spec 10 I10) | Writes `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` (UserDefaults `CA92.1` + `1C8F.1`, FileTimestamp `C617.1`, SystemBootTime `35F9.1`; no tracking, no collected data) and adds it to the `ExpoWidgetsTarget` Resources build phase. React Native's privacy aggregation only writes the app target's manifest |
| **`withHourglassWidgetBackground`** (spec 10 I7) | Rewrites the generated `ios/ExpoWidgetsTarget/HourglassWidget.swift` to `WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())`, an iOS 17+ native `containerBackground` in the brand color. It covers widgets that still run the previous build's stored layout after an update (`docs/ARCHITECTURE.md` §7.2) |

### Patched packages

None. `postinstall` runs `patch-package --error-on-fail --error-on-warn`, so any future patch must apply cleanly. A patched package gets an exact version pin and an `expo.install.exclude` entry for as long as its patch exists (`__tests__/config/deps.test.ts`; `docs/RELEASING.md` SDK upgrade).

### iOS pods

SDK 58 uses Expo's precompiled modules by default (the template Podfile sets `EXPO_USE_PRECOMPILED_MODULES`). `pod install` reports ExpoFileSystem, ExpoFont, ExpoImage, ExpoModulesCore and ExpoModulesWorklets as prebuilt; ExpoWidgets, ExpoUI and the React Native community pods build from source. The `expo-build-properties` `ios.usePrecompiledModules: false` fallback (spec 10 Decision 9) was **not needed**: the Debug simulator builds (checkpoint B, FR6, FR7) and the Release compile of both targets (FR9) succeeded with precompiled modules on.

---

## Notifications & Background

| Library | Version | Role |
|---|---|---|
| **expo-notifications** | ~58.1.5 | Local reminders and push registration. The silent ping is meant to refresh data, but on iOS it doesn't yet (`docs/ARCHITECTURE.md` §2) |

Background execution is silent-push only (`UIBackgroundModes: ["remote-notification"]`). Adding `expo-background-fetch` or `expo-task-manager` re-injects the `fetch` mode through their auto-applied config plugins (guarded by `__tests__/config/`).

---

## Utilities

| Library | Version | Role |
|---|---|---|
| **expo-haptics** | ~58.0.7 | Tactile feedback |
| **expo-image** | ~58.0.16 | Optimised image rendering |
| **expo-linking** | ~58.0.13 | Deep links (`hourglassws://`) |
| **expo-web-browser** | ~58.0.6 | In-app browser |
| **expo-symbols** | ~58.0.4 | SF Symbols (iOS) |
| **expo-system-ui** | ~58.0.6 | System UI color config |
| **expo-constants** | ~58.0.12 | App config access |
| **expo-application** | ~58.1.2 | Native app version (Settings → About) |
| **expo-updates** | ~58.0.17 | OTA updates (EAS) |
| **expo-status-bar** | ~58.0.3 | Status bar control |
| **expo-splash-screen** | ~58.0.10 | Splash screen |
| **expo-font** | ~58.0.9 | Font loading |
| **expo-sharing** | ~58.0.19 | Share sheet (Settings → Share log) |
| **@expo/vector-icons** | ^15.1.1 | Icon set. Kept on SDK 58 (still bundled); the move to `@react-native-vector-icons/*` is deferred (spec 10 Decision 3) |
| **@expo-google-fonts/inter** | ^0.4.2 | Inter (the app's type family) |
| **@expo-google-fonts/plus-jakarta-sans**, **space-grotesk**, **space-mono** | ^0.4.2, ^0.4.1, ^0.4.2 | Additional font packages |
| **react-native-web** | ~0.21.4 | Web target (`web.output: "static"`) |

**Dev tunnel:** no tunnel package is installed. `npx expo start --tunnel` installs ngrok on demand: Expo CLI asks to install it globally the first time.

---

## Testing

| Library | Version | Role |
|---|---|---|
| **jest** | ^30.5.2 | Test runner (`jest-expo` 58 requires Jest 30) |
| **jest-expo** | ~58.0.11 | Expo preset |
| **@react-native/jest-preset** | 0.88.0 | React Native's Jest preset, on the same minor as `react-native` |
| **@testing-library/react-native** | ^14.1.0 | Component tests (async API, host queries only) |
| **test-renderer** | 1.3.0 | RNTL 14's renderer |
| **react-test-renderer** | 19.3.0 | Kept explicitly for the older test files that still use it; their port to RNTL 14 is deferred (spec 10 Decision 4) |
| **@types/jest** | ^30.0.0 | Jest types |

---

## Tooling

| Tool | Version | Notes |
|---|---|---|
| **TypeScript** | ~6.0.3 | `npm run typecheck` (`tsc --noEmit`), a CI gate |
| **@types/react**, **@types/react-test-renderer**, **@types/node** | ~19.3.0, ~19.3.0, ^22.20.5 | Type packages |
| **ESLint** | ^9.39.5 | `npm run lint`, a CI gate |
| **eslint-config-expo** | ~58.0.4 | Brings eslint-plugin-react-hooks 7. Three React Compiler rules are off with dated follow-ups in `eslint.config.js`; `rules-of-hooks` and `exhaustive-deps` stay on |
| **patch-package** | ^8.0.1 | Strict `postinstall`; no patches today |
| **expo-dev-client** | ~58.0.14 | Development builds |
| **eas-cli** | ≥ 25.2.0 (`eas.json` `cli.version`) | Builds, submits and updates. Its `build:list --json` shape is in `docs/RELEASING.md` |
