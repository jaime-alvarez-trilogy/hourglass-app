# Hourglass.xo

A mobile app for Crossover employees to track weekly hours, earnings, AI usage, and manage time approval requests — all from your phone.

Built with Expo (React Native), available on iOS and Android.

**Download on TestFlight (iOS):** https://testflight.apple.com/join/eV25Wbvh

---

## What it does

- **Home** — Weekly hours at a glance: total, daily average, remaining, earnings, and a bar chart of the week
- **Overview** — 4-week trends for hours, earnings, AI usage %, and BrainLift hours
- **AI & BrainLift** — Daily AI usage grade, trajectory chart, per-app breakdown, and 12-week history
- **Requests** — View your submitted manual time requests and their approval status (contributors) or approve/reject pending requests (managers)
- **Widget** — iOS and Android home screen widget showing live hours, earnings, and AI%

Data is pulled directly from the Crossover API using your own credentials, which never leave your device.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 55 + React Native 0.81 |
| Navigation | Expo Router (file-based) |
| Data fetching | TanStack Query v5 + AsyncStorage persistence |
| UI | NativeWind v4 (Tailwind CSS for RN) |
| Animations | React Native Reanimated 4 |
| Charts | Victory Native |
| iOS widget | expo-widgets (SwiftUI via JSX) |
| Android widget | react-native-android-widget |
| Push server | Node.js + Railway (silent push every 30 min) |
| Credentials | Expo SecureStore (on-device only) |
| Builds | EAS Build + EAS Submit |

---

## Project Structure

```
hourglassws/
├── app/                    # Screens (Expo Router file-based routing)
│   ├── (auth)/             # Login flow: welcome → credentials → setup → success
│   └── (tabs)/             # Main tabs: Home, Overview, AI, Requests
│
├── src/
│   ├── api/                # Crossover API client (auth, timesheet, payments, approvals)
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Data fetching hooks (useHoursData, useAIData, etc.)
│   ├── lib/                # Business logic and utilities
│   ├── store/              # Config and credential storage
│   ├── widgets/            # iOS and Android widget implementations
│   └── notifications/      # Push notification handler
│
├── server/                 # Railway ping server (Node.js + Express)
│   ├── index.ts            # REST API: /register, /unregister, /health
│   ├── cron.ts             # Sends silent push notifications every 30 minutes
│   ├── db.ts               # SQLite device token storage
│   └── push.ts             # Expo Push API integration
│
├── features/               # Feature specs and design docs (development reference)
├── assets/                 # App icons, splash screen, notification icon
├── patches/                # patch-package fixes for expo-widgets and reanimated
└── tools/                  # UX tooling (multi-model UI generation scripts)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS: Xcode 15+ (for simulator or device builds)
- Android: Android Studio (for emulator builds)
- A Crossover employee account

### Install and run

```bash
# Install dependencies
npm install

# Start the Metro bundler
npx expo start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

### Running on a physical device

For the best experience (widgets, push notifications), build with EAS:

```bash
# iOS — builds and submits to TestFlight
eas build --platform ios --profile production
eas submit --platform ios --latest

# Android — builds AAB for Google Play
eas build --platform android --profile production
```

---

## Architecture Notes

### Credentials & Privacy

Crossover credentials are stored exclusively in **Expo SecureStore** (iOS Keychain / Android Keystore). They are never sent to any third-party server. The app calls the Crossover API directly from the device.

The ping server (Railway) only stores **Expo push tokens** — anonymous device identifiers used to deliver silent background refresh notifications. No user data or credentials pass through the server.

### Data Refresh

Data stays fresh through two mechanisms:

1. **Foreground refresh** — TanStack Query refetches stale data every time the app comes to the foreground (wired via `AppState`)
2. **Background refresh** — The Railway server sends a silent push notification every 30 minutes, waking the app to fetch and update widget data

Query results are persisted to AsyncStorage so the app shows cached data instantly on cold start, even before the network response arrives.

### Widget Data Flow

```
App fetches Crossover API
    └── writes to AsyncStorage (widget_data key + App Group shared storage)
            └── iOS/Android widget reads from shared storage
                    └── Widget re-renders every 15 minutes
```

---

## Environment Variables

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

The app itself requires no environment variables — all configuration is done in-app during onboarding. The `.env.local` file is only used for development tooling (UX generation scripts, etc.).

For the ping server, see `server/.env.example`.

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Server tests
cd server && npm test
```

---

## Deployment

### iOS (TestFlight / App Store)

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Bump `buildNumber` in `app.json` before each submission.

### Android (Google Play)

```bash
eas build --platform android --profile production
```

Upload the resulting `.aab` manually to Google Play Console on first submission. Subsequent releases can use `eas submit`.

### Ping Server (Railway)

The server deploys automatically from the `server/` directory via Railway. See `server/railway.json` for configuration. No build step needed — nixpacks compiles TypeScript during the Railway build phase.

---

## Contributing

This app is built for internal Crossover use. To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Make your changes with tests
4. Open a pull request

See `features/` for design specs and architectural decisions behind each feature.
