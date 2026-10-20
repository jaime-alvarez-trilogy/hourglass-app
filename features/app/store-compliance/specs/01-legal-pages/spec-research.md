# Spec Research: Legal Pages on GitHub Pages

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `01-legal-pages`

---

## Problem Context

App Store Connect's privacy, support and marketing URLs all point at `jaime-alvarez-trilogy.github.io/hourglass/hourglassws/privacy-policy.html`, which returns 404. That path belongs to the archived `hourglass-scriptable` repo's Pages site. `hourglass-app` reports `has_pages:false` (re-verified 2026-10-19), and `https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html` also returns 404. App Review opens the privacy URL on every submission, so a dead link is a near-certain Guideline 5.1.1 rejection. The live v1.0 listing is affected too.

Text defects in `privacy-policy.html` (corrected scope; the audit's draft over-claimed):
- §4 bullet 1, "We do not operate any user accounts or databases", is false. The Railway relay persists Expo push tokens in SQLite.
- There is no retention/deletion clause, which 5.1.1(i) requires.
- §5 correctly describes the silent-ping relay but doesn't say an anonymous device push token is registered with it. Add one sentence; don't rewrite.
- The summary box says "on any external server". Soften it to "personal data". The push token is anonymous and isn't personal data.
- §3 (credentials never leave the device) is true. Leave it.

There is no support page at all.

## Exploration Findings

### Key Files

| File | Relevance |
|------|-----------|
| `privacy-policy.html` (repo root) | Current policy, self-contained styled HTML. Last updated April 8, 2026 |
| `src/lib/pushToken.ts:35,65` | POSTs the token to `${PING_SERVER_URL}/register`; `unregisterPushToken` deletes it |
| `app/modal.tsx:54` | Sign Out calls `unregisterPushToken()`, which backs the deletion claim |
| `server/` | Railway relay; stores tokens in SQLite |
| `.github/workflows/test.yml` | Existing CI (pattern for a new workflow) |

### Integration Points

- ASC URL fields (OPS O4) depend on these URLs returning 200.
- Spec 02 links to the same URLs from `src/lib/legalLinks.ts`.

## Key Decisions

### Decision 1: How to host

**Options considered:**
1. Pages "deploy from branch, / (root)". Zero config, but it publishes the whole repo root through Jekyll (README, `docs/`, `features/`). That's noisy, and Jekyll ignores underscore paths.
2. Pages from `/docs`. `docs/` already holds ARCHITECTURE.md and API samples, which would be published.
3. **A GitHub Actions Pages workflow that uploads only `site/`.** Explicit, publishes nothing else, versioned with the app.

**Chosen:** 3.
**Rationale:** Publishes exactly three files. Enabling it is a single API call (OPS O2: `build_type=workflow`).

### Decision 2: Support page contents

**Chosen:** A static page with the app's purpose, an FAQ (sign-in uses your Crossover credentials; widgets need the app opened once; sign out clears data), the contact email (the same one as policy §9), and a link to the privacy policy. No form, no JS.

### Decision 3: Keep root `privacy-policy.html`?

**Chosen:** Delete it in the same PR (`git mv` to `site/`). A second copy would drift.

## Interface Contracts

### URLs (public contract, consumed by ASC and spec 02)

| URL | Source |
|-----|--------|
| `https://jaime-alvarez-trilogy.github.io/hourglass-app/` | `site/index.html` (links to both pages) |
| `https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html` | `site/privacy-policy.html` |
| `https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html` | `site/support.html` |

### Workflow contract — `.github/workflows/pages.yml`

- Triggers: `push` to `main` with `paths: ['site/**', '.github/workflows/pages.yml']`, plus `workflow_dispatch`.
- Permissions: `pages: write`, `id-token: write`, `contents: read`.
- Steps: `actions/checkout@v4` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` with `path: site` → `actions/deploy-pages@v4`.
- Concurrency group `pages`, `cancel-in-progress: false`.

### Policy text changes

| Section | Change |
|---------|--------|
| Subtitle | "Last updated: <ship date>" |
| Summary box | "…We do not collect, store, or share your personal data." (drop "on any external server") |
| §4 bullet 1 | Replace with "We do not create user accounts or store your Crossover data on any server" |
| §5 | Add: to deliver refresh pings, the app registers an anonymous device push token with a developer-operated refresh service and with Expo's push service. The token contains no personal data and is not linked to your identity |
| New §6 "Data Retention and Deletion" (renumber later sections) | Push token deleted from the refresh service when you sign out. On-device cache and credentials deleted on sign out or uninstall. Tokens that stop working are pruned by the service |
| §9 Contact | Unchanged email |

## Test Plan

No Jest tests: static HTML. Verification is scripted in `scripts/check-legal-pages.sh`:

**Happy Path:**
- `curl -sS -o /dev/null -w '%{http_code}'` returns `200` for each of the 3 URLs after deploy.
- Privacy page body contains "Data Retention" and does not contain "user accounts or databases".
- Support page body contains the contact email and a link to `privacy-policy.html`.

**Edge Cases:**
- Relative links (`privacy-policy.html`, not `/privacy-policy.html`) still resolve under the `/hourglass-app/` project-site prefix.
- The pages render without external CSS/JS (inline styles only, matching the current file).

**Error Cases:**
- Pages not enabled: the deploy job fails with "Get Pages site failed". The script exits non-zero with a hint to run OPS O2.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `site/privacy-policy.html` | create (git mv + edit) | Corrected policy |
| `site/support.html` | create | Support page |
| `site/index.html` | create | Landing / marketing URL |
| `.github/workflows/pages.yml` | create | Deploy `site/` |
| `scripts/check-legal-pages.sh` | create | Post-deploy verification |
| `privacy-policy.html` | delete | Superseded |

## Edge Cases to Handle

1. **ASC still on old URLs after deploy.** Nothing in code can fix this; OPS O4 is required. The spec's done criteria include the curl check, not ASC.
2. **Policy vs. nutrition label mismatch.** The policy mentions the push token, so the ASC label must declare Device ID (OPS O5), and spec 03's manifest stays consistent.

## Open Questions

None remaining.
✓ Contact email → reuse the existing §9 address.
✓ Hosting → Actions workflow from `site/` (Decision 1).
