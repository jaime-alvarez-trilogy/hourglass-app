# Hourglass — Tech Stack Reference

## Platform & Runtime

| Layer | Value |
|---|---|
| **Expo SDK** | ~55.0.0 |
| **React Native** | 0.83.2 |
| **React** | 19.2.0 |
| **Architecture** | New Architecture enabled (`newArchEnabled: true`) |
| **React Compiler** | Enabled (`experiments.reactCompiler: true`) |
| **Bundle ID (iOS)** | `com.jalvarez0907.hourglass` |
| **Bundle ID (Android)** | `com.jalvarez0907.hourglass` |
| **EAS Project ID** | `4ad8a6bd-aec2-45a5-935f-5598d47b605d` |

---

## Navigation & Routing

| Library | Version |
|---|---|
| **expo-router** | ~55.0.7 |
| **@react-navigation/native** | ^7.1.8 |
| **@react-navigation/bottom-tabs** | ^7.4.0 |
| **@react-navigation/elements** | ^2.6.3 |

---

## Styling

| Library | Version | Role |
|---|---|---|
| **NativeWind** | ^4.2.3 | Tailwind CSS → React Native |
| **react-native-css-interop** | ^0.2.3 | NativeWind v4 runtime engine |
| **tailwindcss** | ^3.4.19 | Class generation |

**Metro fix:** App-code imports of `react/jsx-runtime` and `react/jsx-dev-runtime` are redirected to `nativewind/jsx-runtime` via Metro resolver (bypasses babel transform ordering race in SDK 55 / Metro 0.83).

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
| **@shopify/react-native-skia** | 2.4.18 | Canvas charts (bar chart, ring, sparkline) |
| **react-native-reanimated** | 4.2.1 | UI-thread animations, shared values |
| **react-native-worklets** | 0.7.2 | Worklet runtime for Reanimated 4 |
| **react-native-gesture-handler** | ~2.30.0 | Touch / gesture input |
| **react-native-svg** | 15.15.3 | SVG rendering |
| **expo-linear-gradient** | ~55.0.9 | Gradient fills |
| **expo-blur** | ~55.0.10 | Blur overlays |

---

## Data & State

| Library | Version | Role |
|---|---|---|
| **@tanstack/react-query** | ^5.90.21 | Server state, caching, background refetch |
| **@react-native-async-storage/async-storage** | 2.2.0 | Persistent local cache (AI data, config) |
| **expo-secure-store** | ~55.0.9 | Encrypted credential storage |

---

## Widgets

| Library | Version | Platform | Role |
|---|---|---|---|
| **expo-widgets** | ^55.0.5 | iOS | JSX → SwiftUI widget |
| **react-native-android-widget** | ^0.20.1 | Android | Home screen widget |

**iOS widget app group:** `group.com.jalvarez0907.hourglass.widgets`

---

## Notifications & Background

| Library | Version | Role |
|---|---|---|
| **expo-notifications** | ~55.0.13 | Push notifications (silent ping → data refresh) |
| **expo-background-fetch** | ~55.0.10 | Background task scheduling |
| **expo-task-manager** | ~55.0.10 | Background task registration |

---

## Utilities

| Library | Version | Role |
|---|---|---|
| **expo-haptics** | ~55.0.9 | Tactile feedback |
| **expo-image** | ~55.0.6 | Optimised image rendering |
| **expo-linking** | ~55.0.8 | Deep links |
| **expo-web-browser** | ~55.0.10 | In-app browser |
| **expo-symbols** | ~55.0.5 | SF Symbols (iOS) |
| **expo-system-ui** | ~55.0.10 | System UI color config |
| **expo-constants** | ~55.0.9 | App config access |
| **expo-updates** | ~55.0.15 | OTA updates (EAS) |
| **expo-status-bar** | ~55.0.4 | Status bar control |
| **expo-splash-screen** | ~55.0.12 | Splash screen |
| **@expo/vector-icons** | ^15.0.3 | Icon set |
| **@expo/ngrok** | ^4.1.0 | Local tunnel for dev |

---

## Testing

| Library | Version |
|---|---|
| **jest** | ~29.7.0 |
| **jest-expo** | ~55.0.11 |
| **@testing-library/react-native** | ^13.3.3 |
| **@types/jest** | ^29.5.14 |

---

## Tooling

| Tool | Version |
|---|---|
| **TypeScript** | ~5.9.2 |
| **ESLint** | ^9.25.0 |
| **eslint-config-expo** | ~55.0.0 |
| **expo-dev-client** | ~55.0.18 |
