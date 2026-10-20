# Spec Research: Release Build 18

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `05-release-build-18`

---

## Problem Context

v1.1.0 has only ever existed as build 17 (uploaded 2026-08-06, expires 2026-11-04, never submitted). Specs 02–04 change native config, so they need a new binary: **build 18, still version 1.1.0**. Build 18 also resets the 90-day expiry, so the Nov 4 date stops being the constraint once 18 uploads. ASC has no 1.1.0 version record, and local tooling can't create one.

`.appstore/asc.js` (gitignored, local only) has two bugs that bite during release:
- `asc.js:95` `email.padEnd` crashes on the 12 testers with `email: null`.
- `getLatestVersion()` (`asc.js:384`) has no state filter. Run before the 1.1.0 record exists, `submit-app-review` targets the live 1.0 record and mangles the listing.

## Exploration Findings

### Key Files

| File | Relevance |
|------|-----------|
| `app.json` `ios.buildNumber` | "17" → "18" |
| `eas.json` | `production` profile, submit block using the ASC key |
| `.appstore/asc.js` | Local helper (gitignored); patch locally, not in PR |
| `docs/RELEASING.md` | Created in spec 04; this spec adds the native-release section |
| `fc24cd5` | Build-17 bump commit, **not pushed** (main is 1 ahead of origin). Push as part of this spec |

## Key Decisions

### Decision 1: Version string

**Chosen:** Keep `1.1.0` and bump only `buildNumber` to `18`. 1.1.0 has never been on sale, so there's no reason to burn a version.

### Decision 2: What's New copy

Use the audit's draft: Team view in Overview for managers, the hourly Patterns card, the overtime headline fix. Add "Privacy Policy and Support are now in Settings". **Do not mention Org scope** (hard-disabled, `OverviewStickyBar.tsx:124`).

### Decision 3: Phased release

**Chosen:** Turn on ASC phased release for 1.1.0. Small user base, but it costs nothing and gives a pause button.

## Interface Contracts

| Item | Contract |
|------|----------|
| `app.json` `ios.buildNumber` | `"18"` |
| `docs/RELEASING.md` §Native | Pre-flight → build → TestFlight smoke → ASC → submit → post-release (below) |
| `.appstore/asc.js` (local patch) | `(email ?? '<anonymous>').padEnd(40)` and print `t.id`. `getLatestVersion()` filters `appStoreState` in `PREPARE_FOR_SUBMISSION, DEVELOPER_REJECTED, REJECTED` and throws if none are found |

### Runbook — native release (goes in `docs/RELEASING.md`)
1. **Pre-flight:** specs 01–04 merged; `npm test` has no failures except the known out-of-repo `NativeWindSmoke` test (zero failures if spec 07 FR2 has merged); `npx expo-doctor` schema check passes; `npx expo config --type introspect` matches spec 03's contract; spec 01 curl checks return 200; OPS O1, O6 done.
2. **Build:** `eas build -p ios --profile production`. Record the fingerprint hash from the log (spec 04).
3. **Upload:** `eas submit -p ios --profile production --latest`.
4. **TestFlight smoke on an iOS 27 device** (build 17 never ran on iOS 27). Steps are in the test plan below.
5. **ASC (J):** OPS O3, O4, O5. Create the 1.1.0 version (`+ Version`), attach build 18, paste What's New, update the review notes to the granted tense ("distributed via Unlisted App Distribution"), confirm the demo account signs in, and turn on phased release.
6. **Submit:** `node .appstore/asc.js submit-app-review <build18-id>`, only after step 5 (patched `getLatestVersion` refuses otherwise), or click Submit in ASC.
7. **Post-release:** spec 04 runbook A (baseline OTA), then OPS O8–O10.

## Test Plan

### Config
- `__tests__/config/app-config.test.ts`: `ios.buildNumber` is an integer string `>= 18` and `expo.version` matches `/^\d+\.\d+\.\d+$/`. Range assertions, so later bumps (spec 06+) don't break the test.

### TestFlight smoke checklist (manual; record pass/fail in checklist.md)
- Cold launch on iOS 27, then sign in with the QA manager account.
- Home hours and earnings load; Overview Personal/Team toggle works (manager); the Patterns card renders.
- Approvals: approve one QA item, then reject one with a reason.
- Settings → About: Privacy Policy and Support open in the in-app browser and load; the version row reads `Version 1.1.0 (18)`.
- Widgets: add small/medium/large; they show data; tapping opens the app.
- Silent push: wait for a server ping (≤30 min) or trigger one from `server/`; the widget timestamp updates. This confirms that dropping `fetch` (spec 03) broke nothing.
- Local deadline notification fires; tapping it routes correctly.
- Sign Out clears data; the relay token is removed (server `/health` count drops by 1).

### Error Cases
- Smoke fails → fix on main, bump to the next build number, repeat. Don't submit 18. Later specs always take the next unused build number, never a hard-coded one.
- Review rejection → reply in Resolution Center. For metadata-only issues, fix in ASC without a rebuild.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `app.json` | modify | buildNumber 18 |
| `docs/RELEASING.md` | modify | Native release section |
| `__tests__/config/app-config.test.ts` | modify | Build/version assertions |
| `.appstore/asc.js` | modify (local, untracked) | Two bug fixes |

## Edge Cases to Handle

1. **Build 17 still attached somewhere.** Never attach 17; 18 supersedes it. Expiry of 17 on 11-04 is then harmless.
2. **Review takes longer than expected.** Nothing is time-critical once 18 is uploaded (90-day window).

## Open Questions

None remaining.
