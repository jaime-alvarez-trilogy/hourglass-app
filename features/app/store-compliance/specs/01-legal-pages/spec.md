# 01-legal-pages

**Status:** Draft
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

**What is being built:** A three-page static site in a new `site/` folder: a corrected privacy policy, a new support page and a small landing page. A GitHub Actions workflow (`.github/workflows/pages.yml`) deploys only `site/` to GitHub Pages for `hourglass-app`. A post-deploy script (`scripts/check-legal-pages.sh`) checks that the three public URLs App Store Connect will use return 200 and serve the corrected text.

**How:**
1. `git mv privacy-policy.html site/privacy-policy.html`, then make a small number of factual text edits: replace the false §4 bullet 1, add one sentence to §5 about the anonymous push token, insert a new §6 "Data Retention and Deletion" (renumbering §6–§9 to §7–§10), and bump "Last updated". Nothing else in the policy changes.
2. Create `site/support.html` and `site/index.html` with the same inline `<style>` block as the policy. No JavaScript, no external resources, relative links only.
3. Add `pages.yml`. It runs on push to `main` (when `site/**` or the workflow changes) and on `workflow_dispatch`, and uploads `site/` as the Pages artifact.
4. Add `scripts/check-legal-pages.sh [BASE_URL]`. Plain bash 3.2 plus curl and grep. It exits 0 only if all three pages return 200 with the required content. When a page returns 404, it tells a cached CDN 404 apart from "Pages not enabled/deployed" and prints the matching hint.
5. Jest tests (they run in the existing `test.yml` CI job) lock down the page content, the static-site constraints, the workflow shape and the script's behavior against a local HTTP server. Nothing touches the real network.
6. **Rollout happens after merge.** GitHub Pages is **not** enabled on `hourglass-app` today (`has_pages:false`, `GET /pages` → 404, verified 2026-10-19), and it stays that way through implementation. Once the change is on `origin/main`, Claude enables Pages with `build_type=workflow` (OPS O2), re-runs the workflow and runs the check script against production. The push-triggered run on the merge commit is **expected to fail** at "Setup Pages", because Pages isn't enabled yet.

**Ships:** web only, immediately. No app binary or OTA is involved. Spec 02 consumes the URLs as constants. Spec 05's `set-urls` (OPS O4) and OPS O5 depend on the pages being live.

---

## Out Of Scope

1. **Updating the Privacy, Support and Marketing URLs in App Store Connect (OPS O4).** **Deferred to 05-release-build-18 FR5** (`node .appstore/asc.js set-urls`, run by Claude in spec 05's release execution, not by hand in the ASC UI). `set-urls` re-checks each URL for 200, then PATCHes the appInfo localization (privacy), the 1.1.0 version localization (support + marketing) and the TestFlight `betaAppLocalizations` privacy URL, which the original O4 wording didn't cover. It's blocked until Apple's agreement is accepted (the ASC API currently returns 403 `REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`). This spec's done criteria stop at "the URLs return 200 with correct content". `set-urls` runs only after FR7 passes. OPS.md still lists O4 as owner J; spec 05 Research Correction 7 supersedes that.

2. **App Privacy nutrition label (Device ID declaration).** **Deferred to OPS O5** (owner: Jaime). The new §5/§6 text describes the anonymous push token, so it matches O5's planned declaration (Identifiers → Device ID, App Functionality, Not Linked, Not Tracking).

3. **In-app Privacy Policy / Support links and the version row.** **Deferred to 02-in-app-legal-links**, which hard-codes the FR URLs from this spec in `src/lib/legalLinks.ts`.

4. **App privacy manifest (`PrivacyInfo.xcprivacy`).** **Deferred to 03-native-config-cleanup.**

5. **Broader policy rewrite.** This covers the summary box, §1–§3, §4 bullets 2–5, the existing §5 sentences and the Permissions list (including the "Background App Refresh" line, which stays accurate because iOS gates silent-push wake-ups on that setting; **re-review 2026-10-20:** it wasn't accurate, because no push reaches JS in the background (see spec 03 FR2 correction), so the line was removed and §5's first paragraph reworded). **Descoped.** These statements are accurate (the relay is an anonymous ping relay, and the token isn't personal data). The research proposed softening the summary box ("drop 'on any external server'"). This spec drops that edit to keep the policy diff minimal, because the sentence isn't false.

6. **Clearing the iOS widget's App Group data on sign-out.** **Descoped** (it's a behavior change, not a text fix). `clearAll()` (`src/store/config.ts:72-99`) doesn't touch the App Group timeline written by `src/widgets/bridge.ts:867-905`. The new §6 is worded to match current behavior and doesn't claim the widget is cleared.

7. **Deleting Keychain credentials on reinstall.** **Descoped.** The policy tells users to sign out before deleting the app instead.

8. **Relay server changes** (auth on `/register` and `/unregister`, time-based token expiry, reading Expo push *receipts* for `DeviceNotRegistered`). **Descoped.** The server only prunes tokens reported in push *tickets* (`server/push.ts:71-73`), and the policy text matches that exactly. The unauthenticated endpoints are a griefing risk, not a confidentiality risk (project memory: push-relay privacy scope).

9. **The stale policy copy still live at `https://jaime-alvarez-trilogy.github.io/hourglass-scriptable/hourglassws/privacy-policy.html`** (returns 200, verified 2026-10-19). **Descoped.** It's served from the archived outer repo, which OPS says not to unarchive. ASC stops pointing at the old domain path once spec 05's `set-urls` (O4) runs. Nothing links to it.

10. **Deploy verification inside the workflow.** **Descoped.** The Pages CDN caches responses (`cache-control: max-age=600`, and cached 404s were observed with `age: 3021`), so an in-workflow check right after `deploy-pages` would be flaky. Verification is the manual post-deploy FR7 step.

11. **Custom domain, analytics, contact form, App Store link on the landing page, HTML-validator tooling.** **Descoped.** The app uses Unlisted App Distribution, so the landing page must not publish an App Store link. Content and structure are guarded by Jest (FR1–FR5).

---

## Functional Requirements

### FR1: Corrected privacy policy at `site/privacy-policy.html`

Move the policy into `site/` with history preserved, and make only the factual edits listed in [Policy text contract](#policy-text-contract).

**Requirements:**
- Move with `git mv privacy-policy.html site/privacy-policy.html` so `git log --follow` keeps history. The repo-root `privacy-policy.html` no longer exists (Research Decision 3: one copy, no drift).
- Replace §4 bullet 1 ("We do not operate any user accounts or databases") with the exact contract text.
- Add exactly one sentence, as a second `<p>` in §5, stating that an anonymous device push token is registered with Expo's push service and the developer-operated refresh service.
- Insert a new `<h2>6. Data Retention and Deletion</h2>` section, using the contract text, after §5. Renumber Permissions → 7, Children's Privacy → 8, Changes to This Policy → 9, Contact → 10.
- Set the subtitle to `Last updated: {Month D, YYYY}`, using the date the change merges to `main`.
- Change the logo link `href="#"` to `href="./"` (see FR4).
- Leave everything else byte-identical: the summary box, §1, §2, §3, §4 bullets 2–5, the existing §5 paragraph, the Permissions list, §8–§10 bodies, the contact name and email, the footer and the `<style>` block.

**Success Criteria:**
- [ ] `site/privacy-policy.html` exists. `privacy-policy.html` at the repo root doesn't exist, and `git ls-files privacy-policy.html` prints nothing.
- [ ] `git diff -M --summary main...HEAD` (or against the pre-change commit) reports `rename privacy-policy.html => site/privacy-policy.html` with similarity ≥ 80%.
- [ ] The file doesn't contain the string `user accounts or databases`. It does contain `We do not operate user accounts, and we do not store your Crossover credentials or work data on any server`.
- [ ] `<h2>` headings parse as exactly `1. About This App`, `2. Information We Access`, `3. How Your Data Is Stored`, `4. Data We Do Not Collect`, `5. Background Refresh`, `6. Data Retention and Deletion`, `7. Permissions`, `8. Children's Privacy`, `9. Changes to This Policy`, `10. Contact`, in that order.
- [ ] §5 contains the contract sentence (it includes `anonymous device push token` and `Expo's push notification service`). §5 has exactly 2 `<p>` elements.
- [ ] §6 contains each §6 contract sentence verbatim (two `<p>` elements).
- [ ] The summary box still reads `We do not collect, store, or share your personal data on any external server.`, and §3 still contains `They are never transmitted to any server operated by this application.`
- [ ] It still contains `mailto:jaime.alvarez@trilogy.com` and `Jaime Alvarez`.
- [ ] The subtitle matches `/Last updated: (January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d{2}/` and isn't `April 8, 2026`.

---

### FR2: Support page at `site/support.html`

A static support page covering the app's purpose, a short FAQ, the contact email and a link to the policy (Research Decision 2). Every statement must trace to current code (see [Claim provenance](#claim-provenance)).

**Requirements:**
- Same document shell and inline `<style>` block as the policy. `<title>Support — Hourglass</title>`, `<h1>Support</h1>`.
- Sections, in order: `About Hourglass` (one paragraph), `Frequently Asked Questions` (exactly the three `<h3>` questions in the [Support page contract](#support-and-landing-page-contract)), `Contact` (name + `mailto:` link, the same address as policy §10), and `Privacy` (a link to `privacy-policy.html`).
- Same footer disclaimer as the policy.
- No version-number instructions. The app has no version row until spec 02 ships.

**Success Criteria:**
- [ ] It contains `<a href="mailto:jaime.alvarez@trilogy.com">jaime.alvarez@trilogy.com</a>` (the same address as the policy; the test compares the two files' `mailto:` values).
- [ ] It contains `href="privacy-policy.html"`.
- [ ] It contains exactly three `<h3>` elements, with these texts in order: `How do I sign in?`, `Why is my widget empty or out of date?`, `How do I sign out or remove my data?`.
- [ ] The sign-out answer names the gear icon on the Home screen, Settings and Sign Out, and says to sign out before deleting the app.
- [ ] It contains no `<form`, `<input` or `<script`.

---

### FR3: Landing page at `site/index.html`

This is the Marketing URL and the site root. It holds a one-paragraph description and links to both legal pages.

**Requirements:**
- Same shell and inline styles. `<title>Hourglass</title>`, `<h1>Hourglass</h1>`, one description paragraph and a list linking to `privacy-policy.html` ("Privacy Policy") and `support.html` ("Support"). Same footer.
- No App Store, TestFlight or download link (the app is Unlisted).

**Success Criteria:**
- [ ] It contains `href="privacy-policy.html"` and `href="support.html"`.
- [ ] It doesn't contain `apps.apple.com`, `testflight` or `itms`, checked case-insensitively.

---

### FR4: Static-site constraints (all three pages)

The pages must render under the `/hourglass-app/` project-site prefix with no external dependencies.

**Requirements:**
- Each page starts with `<!DOCTYPE html>`, has `<html lang="en">`, `<meta charset="UTF-8" />`, `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` and a non-empty `<title>`. The three titles are all different.
- Styling is a single inline `<style>` block per page. There is no `<link`, `<script`, `<iframe`, `<img` or any `src=` attribute.
- Every `href` is either `mailto:…` or a relative path: no leading `/`, no `http:`, `https:` or `//`. The logo link on every page is `href="./"`.
- Every relative `.html` link points at a file that exists in `site/`.
- `site/` contains exactly `index.html`, `privacy-policy.html` and `support.html`. Dotfiles such as `.DS_Store` are ignored: they're gitignored and also excluded by `upload-pages-artifact` v4+.

**Success Criteria:**
- [ ] A Jest test passes for each bullet above, across all three files.
- [ ] Local prefix dry run: `scripts/check-legal-pages.sh http://127.0.0.1:8765/hourglass-app` exits 0 while `site/` is served under `/hourglass-app/` (command in checklist 1.1). This proves relative links work under the prefix.

---

### FR5: Pages deploy workflow `.github/workflows/pages.yml`

The workflow deploys only `site/` to GitHub Pages. The file must match the [workflow contract](#workflow-contract) verbatim, except that action major versions may fall back as described there.

**Requirements:**
- Triggers: `push` to `main` with `paths: ['site/**', '.github/workflows/pages.yml']`, and `workflow_dispatch`. **No** `pull_request` or `pull_request_target` trigger, so PRs and forks can't deploy.
- Top-level `permissions`: `contents: read`, `pages: write`, `id-token: write`.
- `concurrency`: `group: pages`, `cancel-in-progress: false`.
- A single `deploy` job on `ubuntu-latest` with `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`.
- Steps, in order: `actions/checkout` → `actions/configure-pages` → `actions/upload-pages-artifact` with `path: site` → `actions/deploy-pages` with `id: deployment`.
- No `enablement: true` on configure-pages. `GITHUB_TOKEN` can't enable Pages, and enabling is the post-merge OPS O2 step.

**Success Criteria:**
- [ ] Jest (`__tests__/site/pages-workflow.test.ts`) asserts every bullet above against the file text.
- [ ] `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/pages.yml','utf8'))"` exits 0. This is a local manual check; `yaml@2.8.2` is a transitive dependency, so don't use it in Jest.
- [ ] After merge, `gh workflow list` shows the workflow, and `gh workflow view pages.yml` shows the `workflow_dispatch` trigger.

---

### FR6: Post-deploy verification script `scripts/check-legal-pages.sh`

A CLI that answers "are the ASC URLs live and correct?" It's used in FR7, and spec 05's submission runbook can reuse it. The behavior is in the [check script contract](#check-script-contract).

**Requirements:**
- `#!/usr/bin/env bash`, tracked as git mode `100755`. It runs under macOS `/bin/bash` 3.2.57 (no associative arrays, `mapfile`, `${var,,}` or `|&`) and under bash 5 on `ubuntu-latest`.
- It depends only on `curl`, `grep`, `mktemp` and `date`. It never follows redirects (no `-L`), and a redirect counts as a failure. Each request uses `--max-time 20`.
- It runs all three checks even after one fails, prints one `PASS`/`FAIL` line per check, and exits 0 only if all pass.
- A curl transport failure (connection refused, DNS, timeout) is reported as HTTP `000` and must not abort the script.
- When a check gets a non-200 response, the script re-requests that URL with a `?cb=<epoch>` query. If that returns 200, it prints the **cached-CDN hint**. Otherwise it prints the **OPS O2 hint**, at most once per run.
- It cleans up temp files with a `trap`, on both success and failure.

**Success Criteria:**
- [ ] Against a local server serving the real `site/` under `/hourglass-app/`, it exits 0 and prints `PASS index`, `PASS privacy`, `PASS support`. This works with and without a trailing slash on `BASE_URL`.
- [ ] When every path returns 404, it exits 1, and the combined output contains `OPS O2` and `build_type=workflow`.
- [ ] When the privacy page body contains `user accounts or databases`, it exits 1 and prints a line starting `FAIL privacy`. The other two checks still print `PASS`.
- [ ] When the support page lacks the `mailto:` address, it exits 1 with `FAIL support`.
- [ ] When the index returns a 301, it exits 1 with `FAIL index` (redirects aren't followed).
- [ ] When the exact URL returns 404 but the URL with `?cb=` returns 200, it exits 1 and the output contains `cached`, not `OPS O2`.
- [ ] When the port is closed, it exits 1, reports `000`, and doesn't crash.
- [ ] With two or more arguments, it exits 2 and prints usage.
- [ ] The file is executable (`fs.statSync(...).mode & 0o111`), and `git ls-files -s scripts/check-legal-pages.sh` shows `100755`.

---

### FR7: Post-merge rollout and production verification

These steps happen after implementation, once the change is on `origin/main`. They enable Pages, deploy, and verify the production URLs. **Implementation must not assume Pages is enabled.** Every check before merge runs locally.

**Requirements:**
- The push-triggered `pages.yml` run on the merge commit is expected to fail at `Setup Pages` with `Get Pages site failed`. Record the run id; it isn't a regression. If Pages was enabled in the meantime and the run succeeded, skip to the verification step.
- Enable Pages (OPS O2): `gh api -X POST repos/jaime-alvarez-trilogy/hourglass-app/pages -f build_type=workflow`.
- Redeploy with `gh workflow run pages.yml --ref main` (or `gh run rerun <id>`), then `gh run watch <new-id> --exit-status`.
- Verify with `scripts/check-legal-pages.sh` (default production base). If it prints the cached hint, re-run after about 10 minutes. **Don't report `set-urls` as unblocked until it exits 0.**
- Once it exits 0, tick OPS O2 in `OPS.md` and report to the spec 05 executor that `set-urls` (OPS O4) is unblocked, giving the three [public URLs](#public-urls). Don't edit ASC by hand, don't ask Jaime to, and don't tick O4: spec 05 FR5 owns it, and its `set-urls` also updates the TestFlight `betaAppLocalizations` privacy URL.
- The only ASC step for Jaime from this spec is OPS O5 (App Privacy label: Device ID, App Functionality, Not Linked, Not Tracking), which matches the new §5/§6 text.

**Success Criteria:**
- [ ] `gh api repos/jaime-alvarez-trilogy/hourglass-app/pages --jq '.build_type'` prints `workflow`, and `--jq '.https_enforced'` prints `true`.
- [ ] `gh api repos/jaime-alvarez-trilogy/hourglass-app --jq .has_pages` prints `true`.
- [ ] The latest `pages.yml` run on `main` concluded `success`, and its `deploy` job's environment URL is `https://jaime-alvarez-trilogy.github.io/hourglass-app/`.
- [ ] `scripts/check-legal-pages.sh` exits 0 against production.
- [ ] `curl -sS -o /dev/null -w '%{http_code}'` returns `200` for each of the three [public URLs](#public-urls), requested exactly as written with no redirect.
- [ ] OPS O2 is ticked in `OPS.md`. O4 stays unticked; it belongs to spec 05's `set-urls`.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `privacy-policy.html` | Source policy: lines 7–122 `<style>`, 127 logo `href="#"`, 133 subtitle, 136 summary box, 155 §3 sentence, 158–165 §4, 167–168 §5, 170–188 §6–§9, 187 mailto |
| `src/lib/pushToken.ts` | 22–51 `registerPushToken` (permission gate 23–26, `getExpoPushTokenAsync` 31, `POST /register` 35–39, body `{ token }` 38). 58–79 `unregisterPushToken` (`POST /unregister` 65, local key always removed 78) |
| `app/_layout.tsx:94-99` | Push token registered once after `config.setupComplete` |
| `app/modal.tsx:47-69` | Sign Out: `unregisterPushToken()` (54) → `clearAll()` (56) → `queryClient.clear()` → cancel notifications. Title "Settings" at 180, button at 290 |
| `app/(tabs)/index.tsx:325-330` | Gear icon (`testID="settings-button"`) opens `/modal` |
| `src/store/config.ts:10-21,51-65,72-99` | SecureStore credential layer; `clearAll()` removes 18 AsyncStorage keys + both SecureStore keys; no App Group or reinstall cleanup |
| `src/widgets/bridge.ts:853-905` | `updateWidgetData` writes AsyncStorage `widget_data` + iOS App Group timeline; nothing clears the App Group on sign-out |
| `src/hooks/useWidgetSync.ts:42-43` | Widget sync is skipped while config/hours are null (widget needs a signed-in app open) |
| `server/db.ts:19-24,32-45` | SQLite `device_tokens(token TEXT PRIMARY KEY, updated_at TEXT NOT NULL)`; upsert/delete |
| `server/index.ts:13-35` | `/register` upserts, `/unregister` deletes (idempotent) |
| `server/push.ts:50-54,71-73` | Silent payload `{to, data:{type:'bg_refresh'}, _contentAvailable:true}`; `DeviceNotRegistered` tickets → stale list |
| `server/cron.ts:29-32,39` | Stale tokens deleted; schedule `*/30 * * * *` |
| `docs/ARCHITECTURE.md` §2 | Push & refresh pipeline (background widget refresh) |
| `.github/workflows/test.yml` | Existing CI; `app-tests` runs `npm test`, so new Jest files run on every PR |
| `jest.config.js` | `testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']`, preset `jest-expo/node`, ignores `/server/` |
| `__tests__/approval-card.test.tsx:13-14,74` | Existing pattern for source-file assertions (`import * as fs from 'fs'`, `path.resolve(__dirname, …)`) |
| `scripts/reset-project.js` | Precedent for an executable (`100755`) file in `scripts/` |
| `features/app/store-compliance/OPS.md` | O2 (enable Pages, owner C), O5 (owner J). O4 still reads owner J there, but spec 05 makes it a Claude step (below) |
| `features/app/store-compliance/specs/05-release-build-18/spec.md` FR5 | `set-urls` performs OPS O4: 200 check, then PATCHes appInfo, version and `betaAppLocalizations` URLs. It's the consumer of FR7's hand-off |
| `features/app/store-compliance/specs/02-in-app-legal-links/spec-research.md` | Consumer of the public URLs |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `site/privacy-policy.html` | create (via `git mv privacy-policy.html site/privacy-policy.html`, then edit) | Corrected policy (FR1, FR4) |
| `privacy-policy.html` | delete (by the `git mv`) | Superseded; one copy only |
| `site/support.html` | create | Support page (FR2, FR4) |
| `site/index.html` | create | Landing / Marketing URL (FR3, FR4) |
| `.github/workflows/pages.yml` | create | Deploy `site/` to Pages (FR5) |
| `scripts/check-legal-pages.sh` | create, mode `100755` | Post-deploy verification (FR6, FR7) |
| `__tests__/site/legal-pages.test.ts` | create | Content + static constraints (FR1–FR4) |
| `__tests__/site/pages-workflow.test.ts` | create | Workflow shape (FR5) |
| `__tests__/scripts/check-legal-pages.test.ts` | create | Script behavior against local HTTP fixtures (FR6) |
| `features/app/store-compliance/OPS.md` | modify (post-merge only) | Tick O2 (FR7) |

No app source, `app.json`, `package.json` or server files change.

### Interface Contracts

#### Public URLs

These are the public contract, consumed by ASC (written by spec 05's `set-urls` from its `URLS` constant, OPS O4) and spec 02 (`src/lib/legalLinks.ts`).

| URL | Served from | ASC field |
|-----|-------------|-----------|
| `https://jaime-alvarez-trilogy.github.io/hourglass-app/` | `site/index.html` | Marketing URL (keep the trailing slash; without it, the URL 301s) |
| `https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html` | `site/privacy-policy.html` | Privacy Policy URL |
| `https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html` | `site/support.html` | Support URL |

Preconditions verified 2026-10-19: the repo is public, its default branch is `main`, there's no user-site repo or custom domain (so no CNAME redirect), and a `github-pages` environment already exists (created 2026-04-09) with a custom branch policy that allows `main` and `gh-pages`.

#### Workflow contract

`.github/workflows/pages.yml`, verbatim:

```yaml
name: Deploy legal pages

on:
  push:
    branches: [main]
    paths:
      - 'site/**'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v5
```

On action versions (checked via `gh api repos/actions/*/releases/latest` on 2026-10-19):
- `configure-pages` v6.0.0, `upload-pages-artifact` v5.0.0 and `deploy-pages` v5.0.1 are the current majors and run on Node 24.
- `checkout@v4` matches `test.yml` and is still maintained (v4.4.0).
- **Fallback:** if the first post-O2 deploy fails for an action-version reason (anything other than `Get Pages site failed`), switch to GitHub's own starter set (`actions/starter-workflows/pages/static.yml`): `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v5`.
- The Jest test accepts any `@vN` tag, so the fallback doesn't break tests.

#### Check script contract

```
Usage: scripts/check-legal-pages.sh [BASE_URL]
  BASE_URL  default https://jaime-alvarez-trilogy.github.io/hourglass-app
            one trailing "/" is stripped
  >1 arg    → print usage to stderr, exit 2

Checks (all run; order fixed):
  index    GET  $BASE/                     200; body contains href="privacy-policy.html" AND href="support.html"
  privacy  GET  $BASE/privacy-policy.html  200; contains "Data Retention" AND "push token";
                                           does NOT contain "user accounts or databases"
  support  GET  $BASE/support.html         200; contains "mailto:jaime.alvarez@trilogy.com" AND href="privacy-policy.html"

curl: -sS --max-time 20 -o <tmp> -w '%{http_code}', no -L; transport error → code 000 (not fatal)

stdout, one line per check:
  PASS <name>
  FAIL <name>: HTTP <code>
  FAIL <name>: missing "<string>"
  FAIL <name>: contains forbidden "<string>"
final stdout line:
  "All legal page checks passed for <BASE>"  |  "<n> legal page check(s) failed for <BASE>"

stderr hints (only on non-200):
  probe <url>?cb=<epoch>; if 200 →
    HINT: <url> is served by origin (cache-busted request returned 200) but the CDN returned <code>; it is cached. Re-run in ~10 minutes.
  else (printed at most once per run) →
    HINT: GitHub Pages may not be enabled or deployed yet. Run OPS O2:
      gh api -X POST repos/jaime-alvarez-trilogy/hourglass-app/pages -f build_type=workflow
      gh workflow run pages.yml --ref main

exit 0 all PASS | 1 any FAIL | 2 usage
```

#### Policy text contract

All edits to `site/privacy-policy.html`. Line numbers refer to the current `privacy-policy.html`.

| Location | Before | After |
|----------|--------|-------|
| Logo link (L127) | `<a class="logo" href="#">` | `<a class="logo" href="./">` |
| Subtitle (L133) | `Last updated: April 8, 2026` | `Last updated: {Month D, YYYY}` (merge date, e.g. `October 20, 2026`) |
| §4 bullet 1 (L160) | `We do not operate any user accounts or databases` | `We do not operate user accounts, and we do not store your Crossover credentials or work data on any server` |
| §5 (after L168) | none | New `<p>`: `If you allow notifications, the app registers an anonymous device push token with Expo's push notification service and with this refresh service; the token contains no personal data and is not linked to your identity or your Crossover account.` |
| New §6 (before current `<h2>6. Permissions</h2>`) | none | see block below |
| `<h2>` numbers | `6. Permissions`, `7. Children's Privacy`, `8. Changes to This Policy`, `9. Contact` | `7.`, `8.`, `9.`, `10.` (titles unchanged) |
| Everything else | — | unchanged |

New §6, verbatim:

```html
    <h2>6. Data Retention and Deletion</h2>
    <p>Your credentials and cached work data are kept only on your device. Signing out deletes your saved credentials and the app's cached work data. Home screen widgets may continue to show the last data they received until you delete the app. If you delete the app without signing out, iOS may keep your saved credentials in the device Keychain, so sign out first to remove them.</p>
    <p>The refresh service stores only the anonymous push token and the time it was last registered. When you sign out, the app asks the refresh service to delete the token. Tokens that Expo's push service reports as no longer registered are deleted automatically.</p>
```

#### Support and landing page contract

`site/support.html` body. The shell, `<style>`, logo and footer are copied from the policy.

```html
    <h1>Support</h1>
    <p class="subtitle">Help with Hourglass</p>

    <h2>About Hourglass</h2>
    <p>Hourglass shows your tracked hours, earnings, AI usage and team approval requests from your Crossover account, in the app and in home screen widgets. It is an internal tool for Crossover employees and requires an active Crossover account.</p>

    <h2>Frequently Asked Questions</h2>
    <h3>How do I sign in?</h3>
    <p>Use the same email and password you use for Crossover. Your credentials are stored only on your device, in the iOS Keychain, and are sent only to Crossover.</p>
    <h3>Why is my widget empty or out of date?</h3>
    <p>Widgets show data after you sign in and open the app at least once. After that, the widget updates when you open the app and in the background when iOS allows it.</p>
    <h3>How do I sign out or remove my data?</h3>
    <p>Tap the gear icon on the Home screen to open Settings, then tap Sign Out. This deletes your saved credentials and the app's cached data from your device. Sign out before deleting the app to make sure your saved credentials are removed.</p>

    <h2>Contact</h2>
    <p>For help or to report a problem, email:</p>
    <p>
      Jaime Alvarez<br />
      <a href="mailto:jaime.alvarez@trilogy.com">jaime.alvarez@trilogy.com</a>
    </p>

    <h2>Privacy</h2>
    <p>Read the <a href="privacy-policy.html">Privacy Policy</a> to see what data Hourglass accesses and how it is stored.</p>
```

The `<style>` block may add one `h3` rule (for example `h3 { font-size: 16px; font-weight: 600; color: #E6EDF3; margin: 20px 0 6px; }`). Keep the existing palette.

`site/index.html` body:

```html
    <h1>Hourglass</h1>
    <p>Hourglass shows your tracked hours, earnings, AI usage and approval requests from your Crossover account. It is an internal tool for Crossover employees.</p>
    <ul>
      <li><a href="privacy-policy.html">Privacy Policy</a></li>
      <li><a href="support.html">Support</a></li>
    </ul>
```

#### Claim provenance

Every user-facing statement added by this spec traces to current code.

| Statement | Evidence |
|-----------|----------|
| §4: no user accounts; no credentials or work data stored on any server | `server/db.ts:19-24` (token + timestamp only); `server/index.ts:13-35` (only `token` accepted); `src/lib/pushToken.ts:38` (body `{ token }`) |
| §5: token registered only if notifications allowed, with Expo and the refresh service | `pushToken.ts:23-26` (permission gate), `:31` (`getExpoPushTokenAsync`), `:35-39` (`POST /register`); `app/_layout.tsx:94-99` |
| §5: token contains no personal data and isn't linked to identity | `server/db.ts:19-24`; project memory "push relay privacy scope" (verified 2026-09-22) |
| §6: credentials and cache kept only on device | `src/store/config.ts:10-21,51-65` (SecureStore); AsyncStorage keys `:75-94`; App Group `src/widgets/bridge.ts:867-905` |
| §6: sign-out deletes credentials and cached work data | `app/modal.tsx:54-64` → `clearAll()` `src/store/config.ts:72-99` + `queryClient.clear()` |
| §6: widgets cleared on sign-out from 1.1.0; earlier versions may keep the last data | `app/modal.tsx` `handleSignOut` → `clearWidgetData()` (`src/widgets/bridge.ts`) after `queryClient.clear()`. Builds before 1.1.0 had no widget call (`useWidgetSync.ts:42-43` no-ops on null config) |
| §6: Keychain may persist after app deletion | iOS Keychain semantics; `config.ts` deletes credentials only in `clearAll()`, with no reinstall cleanup |
| §6: relay stores only token + last-registered time | `server/db.ts:19-24,32-35` (`updated_at` set on upsert) |
| §6: sign-out *asks* the service to delete the token | `modal.tsx:54` → `pushToken.ts:64-75` (best effort; failure only warns) → `server/index.ts:27-35` |
| §6: tokens reported as no longer registered are deleted automatically | `server/push.ts:71-73` → `server/cron.ts:29-32` (every 30 min, `cron.ts:39`) |
| Support: gear icon → Settings → Sign Out | `app/(tabs)/index.tsx:325-330`; `app/modal.tsx:180,290` |
| Support: credentials sent only to Crossover | Policy §3 (unchanged); `src/store/config.ts` `getApiBase` → `api.crossover.com` (`__tests__/env-urls.test.ts`) |
| Support: widget needs sign-in + one app open; updates when the app is open | `src/hooks/useWidgetSync.ts:3,42-43`. The silent push never reaches `handleBackgroundPush` (spec 03 FR2 correction), so the earlier "in the background when iOS allows it" was removed |

### Data Flow

```
Before merge (local only — Pages NOT enabled)
  site/*.html ──► Jest (__tests__/site/*, __tests__/scripts/*) in test.yml on every PR
  site/ ──symlink──► $TMP/hourglass-app ──python3 -m http.server──► check-legal-pages.sh http://127.0.0.1:8765/hourglass-app

After merge (FR7)
  push to main (site/** changed) ──► pages.yml run #1 ──✗ "Get Pages site failed" (expected)
  gh api -X POST …/pages -f build_type=workflow  (OPS O2)
  gh workflow run pages.yml --ref main ──► checkout ─► configure-pages ─► upload-pages-artifact(path: site) ─► deploy-pages
        └─► github-pages environment (branch policy allows main) ─► Pages CDN (max-age=600)
  scripts/check-legal-pages.sh ──curl──► 3 public URLs ──► exit 0 ──► tick OPS O2 ──► report to spec 05 executor: `set-urls` (O4) unblocked
                                                                     (Jaime: OPS O5 only; no manual ASC URL edits)

Consumers
  spec 05 `set-urls` (O4, Claude) ─► ASC appInfo privacy + version support/marketing + TestFlight betaAppLocalizations privacy
        ─► App Review opens the privacy URL on submission (spec 05)
  src/lib/legalLinks.ts (spec 02) ─► openBrowserAsync ─► same URLs
```

### Test Plan

Run only the new suites while iterating: `npx jest __tests__/site __tests__/scripts`. All three files match `testMatch` (`**/__tests__/**/*.test.ts`) and run under `jest-expo/node`. None of them use the network.

| Test file | FR | Cases |
|-----------|----|-------|
| `__tests__/site/legal-pages.test.ts` | FR1 | root `privacy-policy.html` absent and `site/privacy-policy.html` present; `<h2>` list equals the 10 expected headings in order; forbidden phrase absent and new §4 bullet present; §5 has 2 `<p>`s and the second equals the contract sentence; §6 has both contract paragraphs verbatim; summary box, §3 sentence, §4 bullets 2–5, contact name + mailto and footer unchanged (string equality with the contract); `Last updated` matches the month-name regex and isn't `April 8, 2026` |
| same | FR2 | `mailto:` value equals the policy's `mailto:` value; `href="privacy-policy.html"` present; `<h3>` texts equal the 3 questions in order; sign-out answer mentions `gear icon`, `Settings`, `Sign Out` and `before deleting the app`; no `<form`, `<input` or `<script` |
| same | FR3 | both relative hrefs present; no `apps.apple.com`, `testflight` or `itms` (case-insensitive) |
| same | FR4 | for each of the 3 files: doctype, `lang="en"`, charset, viewport, non-empty title; titles unique; exactly one `<style>`; no `<link`, `<script`, `<iframe`, `<img` or `src=`; every `href` is `mailto:` or relative (regex rejects `^/`, `^https?:`, `^//`); every relative `.html` href exists in `site/`; logo `href="./"`; `readdirSync('site')` without dotfiles equals `['index.html','privacy-policy.html','support.html']` |
| `__tests__/site/pages-workflow.test.ts` | FR5 | push branch `main`; paths include `'site/**'` and `'.github/workflows/pages.yml'`; `workflow_dispatch:` present; `pull_request` absent; permissions `contents: read`, `pages: write`, `id-token: write`; `group: pages` + `cancel-in-progress: false`; `name: github-pages` + `url: ${{ steps.deployment.outputs.page_url }}`; `uses:` for checkout → configure-pages → upload-pages-artifact → deploy-pages appear in that order (each `@v\d+`); `path: site` (rejects `path: .`); `id: deployment`; `enablement` absent |
| `__tests__/scripts/check-legal-pages.test.ts` | FR6 | Each case starts a Node `http` server on `127.0.0.1:0` and runs the script via `child_process.execFile` (timeout 15 s; Jest per-test timeout 20 s). Cases: (a) real `site/` under `/hourglass-app/` → exit 0, 3 `PASS` lines; (b) the same with a trailing-slash base → exit 0; (c) all-404 → exit 1, output includes `OPS O2` and `build_type=workflow`; (d) privacy fixture containing `user accounts or databases` → exit 1, `FAIL privacy`, `PASS index`, `PASS support`; (e) support without mailto → `FAIL support`; (f) index 301 → `FAIL index`; (g) exact path 404 but `?cb=` 200 → exit 1, output includes `cached` and not `OPS O2`; (h) closed port (listen then close) → exit 1, output includes `000`; (i) two args → exit 2; (j) executable bit set and shebang `#!/usr/bin/env bash` |
| (manual) | FR4, FR6 | Local prefix dry run on macOS bash 3.2 (checklist 1.1) |
| (manual, post-merge) | FR7 | `gh api` Pages status, `gh run watch`, script against production, curl 200 ×3 (checklist 1.3) |

### Edge Cases

| Case | Handling |
|------|----------|
| Pages not enabled when the change lands on `main` | Push-triggered run fails at `configure-pages` with `Get Pages site failed`. Expected; FR7 enables Pages (O2) and re-runs via `workflow_dispatch`. Don't add `enablement: true` (GITHUB_TOKEN can't enable Pages). |
| CDN serves a stale or cached 404 after deploy (observed `age: 3021` on the current 404) | The script probes `?cb=<epoch>` and prints the cached hint (FR6 case g). Re-run later. The `set-urls` hand-off waits for the exact URLs to return 200 (and `set-urls` re-checks them itself). |
| Project-site prefix `/hourglass-app/` | Relative hrefs only (FR4 test). The local prefix dry run proves resolution before merge. |
| `…/hourglass-app` without trailing slash | GitHub returns 301. The script always requests `$BASE/`, and the ASC Marketing URL keeps the slash. |
| macOS bash 3.2 vs CI bash 5 | Script avoids bash-4 features. The Jest test runs it on CI (bash 5), and the manual dry run runs it on macOS (3.2.57). |
| curl transport failure | Captured as `000`; reported as FAIL, not an abort (FR6 case h). |
| `.DS_Store` or other dotfiles in `site/` | Gitignored. `upload-pages-artifact` ≥ v4 excludes dotfiles. The FR4 test ignores dotfiles when listing `site/`. |
| Action major-version incompatibility | Fall back to the starter-workflow set (workflow contract note). The test accepts any `@vN`. |
| `github-pages` environment branch policy changed to exclude `main` | Deploy fails with "not allowed to deploy to github-pages". Fix the policy with `gh api repos/…/environments/github-pages/deployment-branch-policies`. Current policy allows `main` (verified). |
| Sign-out while offline | `/unregister` fails silently, but the local token is removed (`pushToken.ts:70-78`). The policy says the app "asks" the service to delete the token, and stale tokens are pruned once Expo reports them unregistered. |
| Keychain credentials survive app deletion | The policy and support page tell users to sign out first. No code change (Out of Scope 7). |
| Widget keeps its last snapshot after sign-out | The policy says so explicitly. No code change (Out of Scope 6). **Re-review 2026-10-20:** sign-out now calls `clearWidgetData()` (`src/widgets/bridge.ts`), which replaces the iOS timeline with a signed-out snapshot, and the copy says so for version 1.1.0 and later. Team photos in RN's image cache may remain, and the copy says that too. |
| Policy vs. nutrition label | §5/§6 disclose the push token, consistent with O5's Device ID (Not Linked, App Functionality) declaration and spec 03's manifest (`NSPrivacyCollectedDataTypeDeviceID`, not linked). §5's update-check paragraph discloses the `Expo-Fatal-Error` startup error, so O5 and the manifest also declare Crash Data (re-review 2026-10-20). `legal-pages.test.ts` cross-checks §5, `app.json` and the O5/RELEASING label lines. |
| Concurrent deploys | `concurrency: pages` with `cancel-in-progress: false` queues the later run. |
| Fork PRs | No `pull_request` trigger, so they can't deploy. Jest content tests still run on PRs via `test.yml`. |

---

## Dependencies

### Internal
- None blocking. Spec 02 (`legalLinks.ts`) and spec 05 (submission) depend on this spec's URLs. Spec 02 can merge before FR7 because it only hard-codes the URLs.

### External
- GitHub Pages and GitHub Actions (`actions/checkout`, `configure-pages`, `upload-pages-artifact`, `deploy-pages`).
- `gh` CLI authenticated as the repo owner (admin is needed for `POST /pages`). `curl` locally and on `ubuntu-latest`. `python3` (3.9.6 on this Mac) for the local dry run.

### Assumptions
- `hourglass-app` stays public (Pages on a private repo needs a paid plan). Verified public on 2026-10-19.
- No user-site repo or custom domain is added before rollout (it would redirect `*.github.io/hourglass-app/`).
- App Review uses the ASC values, not this repo, so the URLs only take effect once spec 05's `set-urls` writes them after FR7.

---

## Research Corrections (verified 2026-10-19)

| Research claim | Current reality | Spec handling |
|----------------|-----------------|---------------|
| Workflow uses `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4` | Latest majors are `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5` (GitHub's own starter already uses `deploy-pages@v5`) | Contract uses current majors with a starter-set fallback |
| Workflow contract lists triggers, permissions, steps and concurrency only | `deploy-pages` expects the job to target the `github-pages` environment; the step needs `id: deployment` for `page_url` | Added `environment` block + `id: deployment` |
| Retention: "on-device cache and credentials deleted on sign out **or uninstall**" | iOS Keychain (expo-secure-store) can outlive app deletion; widget App Group data isn't cleared on sign-out | §6 text says "sign out first"; widget caveat stated |
| Retention: "push token deleted from the refresh service when you sign out" | Best-effort `POST /unregister`; on failure the server keeps the token until Expo reports it unregistered | §6 says the app "asks" the service to delete it |
| Summary box: drop "on any external server" | Not false (token isn't personal data); task guidance limits edits | Summary unchanged (Out of Scope 5) |
| "Contact email (same as policy §9)" / "§9 Contact unchanged" | After inserting §6, Contact becomes §10 | Renumbered; email unchanged |
| "No Jest tests: static HTML" | Repo has a precedent for `fs.readFileSync` source assertions; `test.yml` runs `npm test` on PRs | Added 3 Jest suites (content, workflow, script behavior) |
| "Path belongs to the archived hourglass-scriptable repo's Pages site" | Repo `hourglass` was renamed `hourglass-scriptable`; its Pages moved to `/hourglass-scriptable/`, which still serves a stale policy copy (200) | Noted; Out of Scope 9 |
| "ASC URL fields (OPS O4) … OPS O4 is required" (O4 owner J in OPS.md) | Spec 05 FR5 makes O4 a Claude step (`set-urls`: 200 check, then PATCHes appInfo, version and TestFlight `betaAppLocalizations`); spec 05 Research Correction 7 | FR7 hands off to the spec 05 executor, not Jaime; Jaime does only O5 |
| `pushToken.ts:35,65`, `modal.tsx:54`, SQLite relay, `test.yml`, `has_pages:false`, 404s, policy dated April 8, 2026 | All confirmed | — |
