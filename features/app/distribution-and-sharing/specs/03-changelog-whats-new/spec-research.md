# Spec 03 — "What's New" screen + one-time post-update banner

**Status:** Research complete
**Complexity:** M
**Blocks:** — (independent)

## Problem context

The app now ships updates two ways (per `project_ota_update_sequencing` memory): instant OTA JS pushes (`eas update --branch production`) and native binary builds through App Review. Neither path currently tells the user anything changed. A user opens the app one day and something is different (or fixed) with zero explanation — this is a missed trust-building opportunity (especially post-launch, where every bug-fix update is a chance to show the app is actively maintained) and a missed support-load reducer (a user who reported a bug and then sees "fixed: X" in a changelog doesn't need to ask if it landed).

## Exploration findings

- `app.json` — `expo.version` (currently `"1.0.0"`) is the native app version. OTA updates don't bump this — they're tracked by Expo's own update ID, not exposed to app code by version number in a simple way. `expo-updates` (`~55.0.15`) is already a dependency; `Updates.updateId` / `Updates.createdAt` from `expo-updates` give an OTA-specific identifier that changes on every OTA push, independent of `expo.version`.
- No existing "changelog" or "release notes" content exists anywhere in the repo — this is greenfield content, not a refactor.
- `src/store/config.ts` already has an `AsyncStorage`-backed pattern (`CONFIG_KEY`, `loadCredentials`, etc.) — a `LAST_SEEN_VERSION` key follows the same pattern for the one-time-banner state.
- Two possible triggers for "last seen version": (a) `Constants.expoConfig?.version` (native `app.json` version, changes only on binary bumps) or (b) `Updates.updateId` (changes on every OTA push too). Using (a) means the banner only fires on binary updates (rarer, more "worth announcing"); using (b) means it fires on every OTA push too (more frequent, possibly annoying for small fixes).

## Key decisions

**1. Use `app.json`'s `version` string as the trigger, not `Updates.updateId`.** Rationale: OTA pushes happen for small JS fixes frequently (per the OTA memory, that's the whole point — instant, low-ceremony); showing a "what's new" banner on every one of those would be noisy and cheapen the signal. Version bumps are deliberate, human-authored events — a better proxy for "there's something worth telling the user about." The changelog content itself can still be updated via OTA (it's just JS/data), so a "what's new" entry can ship same-day as a bug fix even without a version bump, but the banner specifically triggers on version change.

**2. Static changelog content, not derived from git.** A simple ordered array of `{ version: string, date: string, highlights: string[] }` maintained by hand in a data file (e.g. `src/lib/changelog.ts`). Automating this from commit history is out of scope (per FEATURE.md) — commit messages aren't user-facing prose.

**3. "What's New" screen shows the full history (most recent first); the banner shows only the newest entry.** Two consumers of the same data source, no duplication.

**4. Banner is a modal/card shown once per version, dismissible, not blocking.** Store `lastSeenVersion` in AsyncStorage; compare against `Constants.expoConfig?.version` on app launch; show if different (or if `lastSeenVersion` was never set — but see edge case below); update `lastSeenVersion` on dismiss.

**5. Edge case — fresh install.** A brand-new user has no `lastSeenVersion` in storage. Showing "What's New" to a user who just onboarded and has never used a prior version is confusing ("new since what?"). Decision: on first-ever launch (detected the same way onboarding detects first-run, or simply: if `lastSeenVersion` is unset, silently set it to the current version WITHOUT showing the banner, since there's nothing to compare against).

## Interface contracts

```typescript
// src/lib/changelog.ts (new)
export interface ChangelogEntry {
  version: string;
  date: string;       // 'YYYY-MM-DD'
  highlights: string[];
}
export const CHANGELOG: ChangelogEntry[]; // newest first

// src/hooks/useWhatsNew.ts (new)
export function useWhatsNew(): {
  shouldShowBanner: boolean;
  latestEntry: ChangelogEntry | null;
  dismiss(): Promise<void>; // writes lastSeenVersion, sets shouldShowBanner false
};

// app/(tabs)/whats-new.tsx or a Settings-reachable screen (new)
// Renders CHANGELOG in full, newest first.
```

## Test plan

- [ ] `useWhatsNew`: fresh install (no stored `lastSeenVersion`) → `shouldShowBanner` false, storage gets seeded with current version, no banner shown.
- [ ] `useWhatsNew`: stored version differs from current `app.json` version → `shouldShowBanner` true, `latestEntry` matches `CHANGELOG[0]`.
- [ ] `useWhatsNew`: stored version matches current → `shouldShowBanner` false.
- [ ] `dismiss()` writes the current version to storage and flips `shouldShowBanner` to false.
- [ ] What's New screen renders all `CHANGELOG` entries, newest first, with version + date + highlights.
- [ ] AsyncStorage read failure (corrupted value) → fail safe as "show banner" (treat as unset), not a crash.

## Files to reference

| File | Why |
|---|---|
| `src/store/config.ts` | Existing AsyncStorage read/write pattern to mirror for `lastSeenVersion`. |
| `app.json` | Source of the current app version (`expo.version`), read via `expo-constants`. |
| `package.json` | `expo-updates` already present if `Updates.*` APIs are needed later; not required for the version-string approach. |
| `app/modal.tsx` | Precedent for a Settings-reachable secondary screen/section. |
| `project_ota_update_sequencing` memory | Context on why OTA vs. native version bumps matter for this decision. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | Hook logic (version comparison, fresh-install seeding, dismiss), screen render |
| Live-QA probe | ✗ | No Crossover API involved |
| TestFlight | ✓ | Bump version, submit build, confirm banner appears once on first launch of new build and not on relaunch |
| Error log | ✗ | Low-stakes; AsyncStorage failure already fails safe per test plan |
