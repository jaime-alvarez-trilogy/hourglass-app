# Spec 02 — CI pipeline (GitHub Actions)

**Status:** Ready for implementation
**Created:** 2026-05-23
**Last Updated:** 2026-05-23
**Owner:** @jaime-alvarez-trilogy
**Complexity:** S
**Blocks:** 03, 04, 05, 06, 07, 08

---

## Overview

Add a GitHub Actions workflow that runs `npm test` for both the Expo app and the ping server on every pull request and every push to `main`. This is the verification foundation for the rest of the resilience-fixes feature — once it is green, specs 03–08 can rely on CI to catch regressions instead of hoping local runs covered everything.

The workflow lives in the `hourglass-app` GitHub repo (`hourglassws/.github/workflows/test.yml`). The outer `hourglass-scriptable` (WS) repo holds the deprecated Scriptable widgets and is not the CI target.

The workflow is a single file. It does **not** include TypeScript checking or lint — see Out of Scope.

---

## Out of Scope

1. **`tsc --noEmit` step.** Deferred. The codebase has ~419 baseline TS errors in `__tests__/` and `tools/`. A blocking step would fail every PR; an advisory `continue-on-error: true` step gives no signal. ⚠️ Unassigned — needs a follow-up `tsc-enforcement` spec that cleans the baseline first.

2. **`expo lint` step.** Descoped per research key decision #5 — codebase isn't lint-clean; blocking would generate noise. ⚠️ Unassigned — needs a follow-up `lint-enforcement` spec after a lint-cleanup pass.

3. **Pre-commit hooks (Husky / Lefthook).** Descoped. CI is the merge gate; pre-commit hooks duplicate effort without adding meaningful coverage.

4. **EAS build / submit gating.** Descoped. Out of scope for this feature; covered by Tier 3 (TestFlight) in the verification ladder, which is manual.

5. **Test matrix across Node versions.** Descoped per research key decision #7 — EAS pins a single Node version; a matrix adds cost without catching anything real.

6. **Coverage reporting / Codecov / status badges.** Descoped. Adds external infrastructure and consent surface; can be added later if needed.

7. **Caching `~/.cache/expo` or other Expo CLI caches.** Descoped — `npm ci` cache is the dominant cost; Expo CLI caches don't apply here because no `expo` command runs in CI.

---

## Functional requirements

**FR1.** A workflow file MUST exist at `.github/workflows/test.yml` (in the `hourglass-app` repo, rooted at `hourglassws/`) and MUST trigger on `pull_request` (any branch) and `push` to `main`.
- **Success criteria:**
  - Opening a PR against `main` triggers the workflow within ~1 minute.
  - Pushing a commit directly to `main` triggers the workflow.
  - Pushing to a branch *without* an open PR does NOT trigger the workflow.

**FR2.** The workflow MUST define two parallel jobs — `app-tests` and `server-tests` — both running on `ubuntu-latest`.
- **Success criteria:**
  - A single PR triggers both jobs.
  - The jobs appear concurrently in the GitHub Actions UI.
  - A failure in one job is attributed to that job by name (no cross-contamination of status).

**FR3.** `app-tests` MUST install dependencies via `npm ci` and run the app test suite via `npm test`, both at the repo root.
- **Success criteria:**
  - A PR that introduces a failing app test → `app-tests` job red.
  - A PR with all app tests passing → `app-tests` job green.
  - `npm ci` (not `npm install`) is used — verified by the workflow log line.

**FR4.** `server-tests` MUST install dependencies via `npm ci` and run the server test suite via `npm test`, both with `working-directory: server`.
- **Success criteria:**
  - A PR that introduces a failing test in `server/__tests__/` → `server-tests` job red.
  - When only the app job fails, `server-tests` stays green (and vice versa).
  - The job uses `working-directory: server` for both the install and the test step.

**FR5.** Both jobs MUST pin Node to version `20` and configure `npm` caching via `actions/setup-node@v4`, with the correct `cache-dependency-path` for each job (root `package-lock.json` for `app-tests`; `server/package-lock.json` for `server-tests`).
- **Success criteria:**
  - Both jobs use `node-version: '20'` exactly.
  - The first workflow run installs from scratch (cache miss expected).
  - A subsequent run on a PR with unchanged lockfile shows "Cache restored from key" in the setup-node step log.
  - Changing a lockfile invalidates only that job's cache.

---

## Technical design

### Files to create

| File | Purpose |
|---|---|
| `.github/workflows/test.yml` (relative to the `hourglass-app` repo root, i.e. on disk at `hourglassws/.github/workflows/test.yml`) | The workflow. Only file added by this spec. **Not** to be created at the outer WS / `hourglass-scriptable` repo root. |

### Files to reference (no changes)

| File | Why |
|---|---|
| `package.json` (`scripts.test`) | What `app-tests` invokes (`jest`). |
| `server/package.json` (`scripts.test`) | What `server-tests` invokes (`jest --testPathPattern='server/__tests__' --config ../jest.config.js`). The `../jest.config.js` path is correct because the server uses the root Jest config. |
| `jest.config.js` | Shared root config used by both jobs. |
| `package-lock.json`, `server/package-lock.json` | Required for `npm ci` and used as cache keys. |

### Workflow definition

```yaml
name: Test
on:
  pull_request:
  push:
    branches: [main]

jobs:
  app-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npm test

  server-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: server/package-lock.json
      - run: npm ci
        working-directory: server
      - run: npm test
        working-directory: server
```

Notes:
- `actions/setup-node@v4` with `cache: npm` defaults to the root `package-lock.json`, which is what `app-tests` needs — no `cache-dependency-path` override required there.
- `server-tests` explicitly overrides `cache-dependency-path` to point at `server/package-lock.json`.
- No `concurrency:` group is configured. Multiple PRs and re-pushes will each get a run; Actions minutes for a solo project are not a concern at this scale.

### Data flow

N/A — pure infrastructure addition. No runtime code paths change.

### Edge cases

- **First run (cold cache).** `npm ci` does a full install. Cache populated. Job time dominated by install (~30–60s).
- **Lockfile unchanged across PRs.** Cache hit. Install is fast.
- **Lockfile changed (dependency bump).** Cache miss for that job only; the other job still hits its cache.
- **App-only failure.** `app-tests` red; `server-tests` green. PR shows mixed status; merge button respects branch protection if configured.
- **Server-only failure.** Inverse of above.
- **Both jobs fail.** Both red.
- **Workflow YAML syntax error on first PR.** GitHub displays a parse error in the Actions UI and no `Test` check appears on the PR. Caught during the initial verification PR (Phase X.2 Step 1).
- **Branch protection not yet configured.** Out of scope of this spec — CI runs and reports status, but merge isn't actually blocked until the user enables branch protection on `main` requiring both jobs. This is documented as a manual follow-up in the checklist.
- **PR from a fork.** GitHub Actions runs PR workflows from forks with reduced permissions; this workflow doesn't need secrets so fork PRs work the same as same-repo PRs.

---

## Verification

| Tier | Applies? | How |
|---|---|---|
| 1 — Unit (Jest) | n/a | CI runs Jest; it isn't Jest. |
| 2 — Live-QA probe | ✗ | No API change. |
| 3 — TestFlight | ✗ | No app behavior change. |
| 4 — Error log | ✗ | No production behavior change. |

End-to-end verification is the Phase X.2 exercise in `checklist.md`: open a PR, observe both jobs, prove red/green attributability with deliberate probe failures, prove caching on a second run, and finally enable branch protection (manual step).

---

## Acceptance

- `.github/workflows/test.yml` exists in `hourglass-app` and is syntactically valid (no parse error in Actions UI).
- Both `app-tests` and `server-tests` run on a PR and report status independently.
- Deliberate failures in each suite are attributed to the correct job.
- Second run on an unchanged lockfile hits the `npm` cache (visible in setup-node logs).
- No production code changed.
