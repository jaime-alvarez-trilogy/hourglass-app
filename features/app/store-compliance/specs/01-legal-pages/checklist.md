# Implementation Checklist

Spec: `01-legal-pages`
Feature: `store-compliance`

> Run every command from the app repo root: `/Users/Trilogy/Documents/Claude Code/WS/hourglassws`.
> **GitHub Pages is NOT enabled during implementation.** Phases 1.0–1.2 are local-only. Phase 1.3 runs after the change reaches `origin/main`.
> Iterate with the new suites only: `npx jest __tests__/site __tests__/scripts`.

---

## Phase 1.0: Test Foundation

### FR1: Corrected privacy policy (`__tests__/site/legal-pages.test.ts`)
- [ ] `test(FR1)` Repo-root `privacy-policy.html` doesn't exist, and `site/privacy-policy.html` exists. Paths come from `path.resolve(__dirname, '../..', …)`, following the pattern in `__tests__/approval-card.test.tsx:13-14,74`.
- [ ] `test(FR1)` The parsed `<h2>` list equals, in order: `1. About This App`, `2. Information We Access`, `3. How Your Data Is Stored`, `4. Data We Do Not Collect`, `5. Background Refresh`, `6. Data Retention and Deletion`, `7. Permissions`, `8. Children's Privacy`, `9. Changes to This Policy`, `10. Contact`.
- [ ] `test(FR1)` The file doesn't contain `user accounts or databases`. It does contain `We do not operate user accounts, and we do not store your Crossover credentials or work data on any server`.
- [ ] `test(FR1)` §5 (the text between the `5.` and `6.` headings) has exactly 2 `<p>` elements. The second equals the contract sentence verbatim (`If you allow notifications, the app registers an anonymous device push token with Expo's push notification service and with this refresh service; the token contains no personal data and is not linked to your identity or your Crossover account.`).
- [ ] `test(FR1)` §6 contains both contract paragraphs verbatim.
- [ ] `test(FR1)` Unchanged guards. The file still contains the original summary sentence `We do not collect, store, or share your personal data on any external server.`, the §3 sentence `They are never transmitted to any server operated by this application.`, §4 bullets 2–5 verbatim, `Jaime Alvarez`, `mailto:jaime.alvarez@trilogy.com`, and the original footer text.
- [ ] `test(FR1)` The subtitle matches `/Last updated: (January|…|December) \d{1,2}, 20\d{2}/` and isn't `April 8, 2026`.

### FR2: Support page (`__tests__/site/legal-pages.test.ts`)
- [ ] `test(FR2)` The `mailto:` value in `support.html` equals the `mailto:` value in `privacy-policy.html`, and both equal `jaime.alvarez@trilogy.com`.
- [ ] `test(FR2)` It contains `href="privacy-policy.html"`.
- [ ] `test(FR2)` The `<h3>` texts are exactly `How do I sign in?`, `Why is my widget empty or out of date?`, `How do I sign out or remove my data?`, in that order.
- [ ] `test(FR2)` The sign-out answer contains `gear icon`, `Settings`, `Sign Out` and `before deleting the app`.
- [ ] `test(FR2)` It contains no `<form`, `<input` or `<script`.

### FR3: Landing page (`__tests__/site/legal-pages.test.ts`)
- [ ] `test(FR3)` It contains `href="privacy-policy.html"` and `href="support.html"`.
- [ ] `test(FR3)` It doesn't contain `apps.apple.com`, `testflight` or `itms` (case-insensitive).

### FR4: Static-site constraints (`__tests__/site/legal-pages.test.ts`, parameterized over all 3 files)
- [ ] `test(FR4)` Each file starts with `<!DOCTYPE html>` and has `<html lang="en">`, `<meta charset="UTF-8" />`, the viewport meta and a non-empty `<title>`. The three titles are all different.
- [ ] `test(FR4)` Each file has exactly one `<style>` block, and no `<link`, `<script`, `<iframe`, `<img` or `src=`.
- [ ] `test(FR4)` Every `href` is either `mailto:` or relative. Reject `^/`, `^https?:` and `^//`.
- [ ] `test(FR4)` Every relative `.html` href resolves to an existing file in `site/`.
- [ ] `test(FR4)` The logo anchor is `<a class="logo" href="./">` on every page.
- [ ] `test(FR4)` `fs.readdirSync('site')` with dotfiles filtered out, sorted, equals `['index.html', 'privacy-policy.html', 'support.html']`.

### FR5: Pages workflow (`__tests__/site/pages-workflow.test.ts`)
- [ ] `test(FR5)` The push trigger has `branches: [main]` and paths containing `'site/**'` and `'.github/workflows/pages.yml'`. `workflow_dispatch:` is present.
- [ ] `test(FR5)` `pull_request` doesn't appear anywhere in the file (this also covers `pull_request_target`).
- [ ] `test(FR5)` Permissions include `contents: read`, `pages: write` and `id-token: write`.
- [ ] `test(FR5)` `group: pages` and `cancel-in-progress: false` are present.
- [ ] `test(FR5)` `name: github-pages` and `url: ${{ steps.deployment.outputs.page_url }}` are present.
- [ ] `test(FR5)` `uses: actions/checkout@v\d+`, `actions/configure-pages@v\d+`, `actions/upload-pages-artifact@v\d+` and `actions/deploy-pages@v\d+` appear in that order (ascending `indexOf`).
- [ ] `test(FR5)` `path: site` matches `/^\s*path:\s*['"]?site['"]?\s*$/m`, and `path: .` is absent.
- [ ] `test(FR5)` `id: deployment` is present and `enablement` is absent.

### FR6: Check script (`__tests__/scripts/check-legal-pages.test.ts`)
Harness: a Node `http` server on `127.0.0.1:0` per case, the script run via `child_process.execFile` (timeout 15 s), a Jest per-test timeout of 20 s, and the server closed in `afterEach`. Combined stdout+stderr is used for message assertions. No real network.
- [ ] `test(FR6)` (a) The real `site/` files are served under `/hourglass-app/` (with `/hourglass-app/` → `index.html`). Running against `http://127.0.0.1:<port>/hourglass-app` exits 0, and stdout contains `PASS index`, `PASS privacy` and `PASS support`.
- [ ] `test(FR6)` (b) Same as (a) with a trailing-slash base (`…/hourglass-app/`): exits 0.
- [ ] `test(FR6)` (c) Every path returns 404: exits 1, and the output contains `OPS O2` and `build_type=workflow`.
- [ ] `test(FR6)` (d) The privacy fixture body contains `user accounts or databases`: exits 1, prints `FAIL privacy`, and still prints `PASS index` and `PASS support` (all checks run).
- [ ] `test(FR6)` (e) The support fixture has no `mailto:jaime.alvarez@trilogy.com`: exits 1 with `FAIL support`.
- [ ] `test(FR6)` (f) `/hourglass-app/` returns 301 with a `Location` header: exits 1 with `FAIL index` (redirects aren't followed).
- [ ] `test(FR6)` (g) The exact path returns 404 but the same path with `?cb=` returns 200: exits 1, the output contains `cached`, and it doesn't contain `OPS O2`.
- [ ] `test(FR6)` (h) Closed port (listen on :0, read the port, close): exits 1, the output contains `000`, and the process exits normally rather than hanging.
- [ ] `test(FR6)` (i) Two arguments: exits 2.
- [ ] `test(FR6)` (j) `fs.statSync(script).mode & 0o111` is non-zero, and the first line is `#!/usr/bin/env bash`.

### FR7: Rollout readiness (no Jest; verified by commands)
- [ ] Baseline: `gh api repos/jaime-alvarez-trilogy/hourglass-app/pages` returns 404 and `gh api repos/jaime-alvarez-trilogy/hourglass-app --jq .has_pages` prints `false`. Record both in the Session Notes so FR7 can show the before/after.
- [ ] Baseline: `curl -sS -o /dev/null -w '%{http_code}\n' https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html` prints `404`.
- [ ] Confirm the deploy target's branch policy allows `main`: `gh api repos/jaime-alvarez-trilogy/hourglass-app/environments/github-pages/deployment-branch-policies --jq '.branch_policies[].name'` includes `main`.

### Red phase
- [ ] Run `npx jest __tests__/site __tests__/scripts`. All new tests fail because `site/`, `pages.yml` and the script don't exist yet. Commit: `test(01-legal-pages): add failing tests for legal pages, workflow and check script`.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage (FR1–FR6 in Jest; FR4/FR6 also by the manual dry run; FR7 by Phase 1.3 commands)
- [ ] Assertions are specific (exact contract strings, ordered heading lists, exit codes), not just "exists" or "doesn't throw"
- [ ] HTTP fixtures return realistic data matching the check script contract: real `site/` files for the happy path, and single-defect variants for the failure cases
- [ ] No test touches the real network or depends on Pages being enabled
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Corrected privacy policy
- [ ] `git mv privacy-policy.html site/privacy-policy.html` (creates `site/`)
- [ ] Logo `href="#"` → `href="./"` (L127)
- [ ] Subtitle → `Last updated: {merge date, Month D, YYYY}` (L133)
- [ ] Replace §4 bullet 1 (L160) with the contract text
- [ ] Add the §5 contract sentence as a second `<p>` after L168
- [ ] Insert the new `<h2>6. Data Retention and Deletion</h2>` block verbatim before the current `<h2>6. Permissions</h2>`
- [ ] Renumber Permissions → 7, Children's Privacy → 8, Changes to This Policy → 9, Contact → 10
- [ ] Verify: `git diff -M --cached --summary` (or after commit, `git show -M --summary HEAD`) shows `rename privacy-policy.html => site/privacy-policy.html (NN%)` with NN ≥ 80
- [ ] Verify: `git diff -M --cached -- site/privacy-policy.html` touches only the lines above. Summary box, §1–§3, §4 bullets 2–5, existing §5 paragraph, Permissions list, contact block, footer and `<style>` are unchanged.
- [ ] FR1 tests pass

### FR2: Support page
- [ ] Create `site/support.html`: copy the policy's `<head>`, `<style>` (plus an optional `h3` rule), logo (`href="./"`) and footer, then add the support contract body verbatim
- [ ] FR2 tests pass

### FR3: Landing page
- [ ] Create `site/index.html` with `<title>Hourglass</title>` and the landing contract body; no App Store or TestFlight link
- [ ] FR3 tests pass

### FR4: Static-site constraints
- [ ] Confirm no `<script>`, `<link>`, `<img>`, `src=` or root-absolute/absolute `href` in any page; remove any stray `.DS_Store` from `site/`
- [ ] Open all three files directly in a browser (`open site/index.html`) and check they render with the dark palette and that the links navigate between pages
- [ ] FR4 tests pass

### FR5: Pages workflow
- [ ] Create `.github/workflows/pages.yml` verbatim from the spec's workflow contract
- [ ] Verify the YAML parses: `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/pages.yml','utf8'))"` exits 0 (local manual check only)
- [ ] FR5 tests pass

### FR6: Check script
- [ ] Create `scripts/check-legal-pages.sh` per the check script contract (bash 3.2-compatible; `curl -sS --max-time 20 -o "$tmp" -w '%{http_code}'` with `|| true` so transport errors yield `000`; no `-L`; `mktemp -d` + `trap 'rm -rf "$tmpdir"' EXIT`; `?cb=$(date +%s)` probe on non-200; O2 hint printed at most once)
- [ ] `chmod +x scripts/check-legal-pages.sh`, then confirm `git ls-files -s scripts/check-legal-pages.sh` shows `100755` after `git add`
- [ ] Local prefix dry run on macOS `/bin/bash` 3.2 (proves FR4's relative links and FR6 end to end):
  ```bash
  TMP=$(mktemp -d) && ln -s "$PWD/site" "$TMP/hourglass-app"
  python3 -m http.server 8765 --bind 127.0.0.1 --directory "$TMP" >/dev/null 2>&1 & PID=$!
  curl -s --retry 10 --retry-connrefused --retry-delay 1 -o /dev/null http://127.0.0.1:8765/
  /bin/bash scripts/check-legal-pages.sh http://127.0.0.1:8765/hourglass-app; echo "exit=$?"   # expect 3× PASS, exit=0
  /bin/bash scripts/check-legal-pages.sh http://127.0.0.1:8765/nope; echo "exit=$?"            # expect FAIL ×3 + O2 hint, exit=1
  kill $PID; rm -rf "$TMP"
  ```
- [ ] Run against production now (Pages is still disabled): `scripts/check-legal-pages.sh; echo "exit=$?"` → 3× `FAIL …: HTTP 404`, the OPS O2 hint, `exit=1`. This confirms the hint path against the real host.
- [ ] FR6 tests pass

### FR7: Rollout preparation
- [ ] Run `npx jest __tests__/site __tests__/scripts` and confirm everything is green
- [ ] Commit implementation: `feat(01-legal-pages): add GitHub Pages legal site, deploy workflow and check script`
- [ ] Add a Session Notes entry saying the first push-triggered `pages.yml` run on `main` is expected to fail at `Setup Pages`

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code (FR1–FR6). FR7 is tracked in Phase 1.3.
- [ ] Interface contracts match the implementation: public URLs, `pages.yml` verbatim (allowing the documented version fallback), check script CLI and output, policy text, support/landing bodies
- [ ] No scope creep or shortfall. Policy edits are limited to the contract table, and no app/server/`app.json` files changed.

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes (`npx jest __tests__/site __tests__/scripts`)
- [ ] If any policy or support wording changes during review, re-check it against the spec's Claim provenance table. Every statement must still trace to code.
- [ ] Commit fixes: `fix(01-legal-pages): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(01-legal-pages): strengthen test assertions`

### Final Verification
- [ ] All tests passing (`npm test`)
- [ ] No regressions in existing tests
- [ ] Code follows existing patterns (source-file assertions via `fs`/`path`, executable scripts in `scripts/`, workflow style of `test.yml`)

---

## Phase 1.3: Post-Merge Rollout (FR7) — only after the change is on `origin/main`

- [ ] Push or merge to `main`. Find the push-triggered run: `gh run list --workflow pages.yml --branch main --limit 1`. It's expected to fail at `Setup Pages` with `Get Pages site failed`. Record the run id in Session Notes. If it succeeded, Pages was already enabled; skip to the verification step.
- [ ] Enable Pages (OPS O2): `gh api -X POST repos/jaime-alvarez-trilogy/hourglass-app/pages -f build_type=workflow`
- [ ] Verify: `gh api repos/jaime-alvarez-trilogy/hourglass-app/pages --jq '.build_type, .https_enforced'` prints `workflow` and `true`, and `gh api repos/jaime-alvarez-trilogy/hourglass-app --jq .has_pages` prints `true`
- [ ] Redeploy: `gh workflow run pages.yml --ref main` (or `gh run rerun <id>`), then `gh run watch <new-run-id> --exit-status` exits 0
- [ ] If the deploy fails for an action-version reason (not `Get Pages site failed`), apply the starter-set fallback from the spec (`configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v5`), commit `fix(01-legal-pages): pin Pages actions to starter-workflow versions`, push, and re-watch
- [ ] Check that the `deploy` job's environment URL is `https://jaime-alvarez-trilogy.github.io/hourglass-app/` (`gh run view <id>` or the Actions UI)
- [ ] Run `scripts/check-legal-pages.sh; echo "exit=$?"` and expect 3× `PASS` and `exit=0`. If it prints the `cached` hint, wait about 10 minutes and re-run. **Don't proceed until it exits 0.**
- [ ] Independent check: `for p in "" privacy-policy.html support.html; do curl -sS -o /dev/null -w "%{http_code} $p\n" "https://jaime-alvarez-trilogy.github.io/hourglass-app/$p"; done` prints `200` three times
- [ ] Manual: open the privacy URL in iPhone Safari (or a narrow desktop window). It should render readably, show "Last updated" with the merge date, and §6 should be present.
- [ ] Only after `scripts/check-legal-pages.sh` exits 0: tick OPS O2 in `features/app/store-compliance/OPS.md` and commit: `docs(store-compliance): mark OPS O2 done`. Leave O4 unticked.
- [ ] Report to the spec 05 executor that `set-urls` (OPS O4, spec 05 FR5) is unblocked, giving the three URLs (Marketing URL with trailing slash). Don't edit ASC by hand and don't ask Jaime to: `set-urls` writes the appInfo, version and TestFlight `betaAppLocalizations` URLs, and a manual edit would duplicate it or miss the beta-app URL.
- [ ] Tell Jaime only about OPS O5 (App Privacy label: Device ID, App Functionality, Not Linked, Not Tracking), which matches the new §5/§6 text

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19**: Spec and checklist drafted. Pages baseline at drafting time: `has_pages:false`, `GET /pages` → 404, all three target URLs → 404 (a cached 404 was observed with `age: 3021`). The `github-pages` environment already exists, with a branch policy allowing `main` and `gh-pages`.
