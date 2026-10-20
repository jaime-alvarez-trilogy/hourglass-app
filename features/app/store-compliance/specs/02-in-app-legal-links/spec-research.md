# Spec Research: In-App Legal Links

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `02-in-app-legal-links`

---

## Problem Context

Guideline 5.1.1(i) requires the privacy policy to be reachable "within the app in an easily accessible manner". A grep of `app/` and `src/` finds no link. The Settings modal (`app/modal.tsx`) is the natural home: it already holds Sign Out, Share Log and environment switching. While there, add Support and a version/build row. The version row also helps verify which binary and OTA update a tester is running (spec 04/05).

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| `openBrowserAsync` with presentation style | `components/external-link.tsx:2,18` | In-app Safari sheet; reuse it rather than `Linking.openURL` |
| Pure constants in `src/lib/` | `src/lib/colors.ts`, `appGuidance.ts` | `src/lib` must stay pure (CLAUDE.md layering) |
| Settings sections with title + rows | `app/modal.tsx:186-292` (Config Debug, Debug Log, Dev Options, Sign Out) | Match the existing `styles.*` section look |
| Modal tests | `app/__tests__/modal.test.tsx`, `modal-signout.test.tsx`, `modal-debug-log.test.tsx` | Render with mocked contexts; follow `modal-debug-log.test.tsx` |

### Key Files

| File | Relevance |
|------|-----------|
| `app/modal.tsx` (455 lines) | Add the About section above Sign Out |
| `components/external-link.tsx` | Shows the `openBrowserAsync` options already in use |
| `expo-constants` (installed) | `Constants.expoConfig.version`, `ios.buildNumber` |
| `expo-updates` (installed) | `Updates.updateId`, `Updates.runtimeVersion`, `Updates.isEmbeddedLaunch` for the version row |

## Key Decisions

### Decision 1: Where the URLs live

**Chosen:** `src/lib/legalLinks.ts` exporting `PRIVACY_POLICY_URL`, `SUPPORT_URL`. They're hard-coded because they're public and stable, and spec 01 owns them. No `app.json` `extra`, because constants are simpler to test.

### Decision 2: Visibility

**Chosen:** The About section is always visible to every user, not gated behind dev or debug flags. App Review must see it on the demo account.

### Decision 3: Version row content

**Chosen:** `Version 1.1.0 (18)`, with a second muted line showing `Update: <first 8 chars of updateId>` or `Update: embedded` when `isEmbeddedLaunch`. Building it is a pure function so it can be tested without native modules.

## Interface Contracts

```typescript
// src/lib/legalLinks.ts
export const PRIVACY_POLICY_URL = 'https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html'; // ← spec 01
export const SUPPORT_URL = 'https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html';               // ← spec 01

export interface BuildInfoInput {
  version: string | undefined;        // ← Constants.expoConfig?.version
  buildNumber: string | undefined;    // ← Constants.expoConfig?.ios?.buildNumber
  updateId: string | null | undefined;// ← Updates.updateId
  isEmbeddedLaunch: boolean;          // ← Updates.isEmbeddedLaunch
}
export function formatBuildInfo(i: BuildInfoInput): { versionLine: string; updateLine: string };
```

| Function | Signature | Responsibility | Dependencies |
|----------|-----------|----------------|--------------|
| `formatBuildInfo` | above | Version/update strings | none (pure) |
| `openLegalLink` (in modal) | `(url: string) => Promise<void>` | `openBrowserAsync(url, { presentationStyle: AUTOMATIC })`, falling back to `Linking.openURL` on throw | expo-web-browser, react-native Linking |

### UI contract (app/modal.tsx)

New "About" section, placed after Debug Log and before Sign Out:
- Row "Privacy Policy" → `openLegalLink(PRIVACY_POLICY_URL)`, `testID="about-privacy"`
- Row "Support" → `openLegalLink(SUPPORT_URL)`, `testID="about-support"`
- Text `versionLine` + muted `updateLine`, `testID="about-version"`

## Test Plan

### formatBuildInfo
**Happy Path:**
- `{1.1.0, '18', 'abcdef1234…', false}` → `"Version 1.1.0 (18)"`, `"Update: abcdef12"`
- `isEmbeddedLaunch: true` → `"Update: embedded"`

**Edge Cases:**
- `version` undefined → `"Version unknown"`. No crash.
- `buildNumber` undefined → `"Version 1.1.0"` (no parens).
- `updateId` null and not embedded → `"Update: embedded"`. This is dev / Expo Go, where updates are disabled.

### legalLinks constants
- Both URLs are `https://` and start with `https://jaime-alvarez-trilogy.github.io/hourglass-app/`.

### Modal About section (`app/__tests__/modal-about.test.tsx`)
- Renders the Privacy Policy, Support and version rows for a non-manager config and for a manager config.
- Pressing `about-privacy` calls `openBrowserAsync` with `PRIVACY_POLICY_URL`.
- Pressing `about-support` calls `openBrowserAsync` with `SUPPORT_URL`.
- If `openBrowserAsync` rejects → `Linking.openURL` is called with the same URL.
- Existing modal tests (`modal*.test.tsx`) stay green.

**Mocks Needed:**
- `expo-web-browser`: `jest.mock` with an `openBrowserAsync` jest.fn
- `expo-constants`, `expo-updates`: module mocks with static values
- Existing modal context mocks (copy from `modal-debug-log.test.tsx`)

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/legalLinks.ts` | create | URLs + `formatBuildInfo` |
| `src/lib/__tests__/legalLinks.test.ts` | create | Unit tests |
| `app/modal.tsx` | modify | About section |
| `app/__tests__/modal-about.test.tsx` | create | UI tests |

## Edge Cases to Handle

1. **Offline.** The browser sheet shows Safari's own offline error. Acceptable; no app-side handling.
2. **QA environment.** The links are the same in both environments, so they're independent of `useQA`.

## Open Questions

None remaining.
