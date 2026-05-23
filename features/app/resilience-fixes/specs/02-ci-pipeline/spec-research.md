# Spec 02 — CI pipeline (GitHub Actions)

**Status:** Research complete
**Complexity:** S
**Blocks:** 03, 04, 05, 06, 07, 08 (CI must run green before merging any of them).

## Problem context

There is currently **no automated verification** between "I committed" and "this hits an iPhone." From the test-infra map:

- 142 Jest suites exist and pass locally (after spec 01).
- `npm test` is defined in `package.json:7` but never invoked automatically.
- No `.github/workflows/`, no pre-commit hooks (Husky / Lefthook), no EAS pre-submit checks.
- A developer can `eas build && eas submit` with broken tests, broken types, or broken lint.

The Thursday-notification regression shipped through this exact gap: tests passed locally, the bug was a multi-handler concurrency issue invisible to unit tests, and there was nothing in the pipeline to flag the test mock regression that would have surfaced *part* of it (the `.text()` failure).

## Exploration findings

- `jest.config.js` uses the `jest-expo/node` preset with test glob `**/__tests__/**/*.test.ts(x)`.
- `server/` has its own `jest.config.js` for the Node-side ping server. Server tests are not run by the root `npm test`.
- TypeScript check available via `npx tsc --noEmit` (no script alias).
- Lint available via `npm run lint` (uses `expo lint`).
- Repository is on GitHub at `https://github.com/jaime-alvarez-trilogy/hourglass-app`.

## Key decisions

**1. Use GitHub Actions, not GitLab CI / Jenkins / etc.** — repo already lives on GitHub, no alternative platform in use.

**2. Two jobs, not one:** `app-tests` and `server-tests` run in parallel. They have separate `package.json` files and the server uses a Node environment vs Expo. Splitting keeps failures attributable.

**3. Run on PR + push-to-main.** Not on every push to every branch (would burn Actions minutes on personal experiments). PR-gated.

**4. Include `tsc --noEmit` in the matrix.** TypeScript catches more than tests do (e.g. F4's `errorCode` field added to `ApiError` will catch every site that destructures the error). Cheap to add. **Note:** the codebase has some pre-existing TS errors in `__tests__/` and `tools/` per recent verification — initial CI may need `continue-on-error: true` on the tsc step or a tsconfig include filter; flag this during implementation.

**5. Don't include lint in CI for now.** `expo lint` exists but isn't enforced in current commits; making it blocking now would generate noise. Add as a follow-up after the codebase is lint-clean.

**6. Cache node_modules.** First CI run sets up, subsequent runs reuse cache. Standard `actions/setup-node` pattern.

**7. No matrix across Node versions.** EAS pins to one Node version; CI should match. (Read it from `package.json` `engines` if present, or pin explicitly.)

## Interface contracts

A new file `.github/workflows/test.yml`:

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
          node-version: '20'   # match EAS / .nvmrc if present
          cache: npm
          cache-dependency-path: hourglassws/package-lock.json
      - run: npm ci
        working-directory: hourglassws
      - run: npm test
        working-directory: hourglassws
      - run: npx tsc --noEmit
        working-directory: hourglassws
        continue-on-error: true   # remove once tsc is clean

  server-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: hourglassws/server/package-lock.json
      - run: npm ci
        working-directory: hourglassws/server
      - run: npm test
        working-directory: hourglassws/server
```

**Note on paths:** the repo root is `WS/`; the Expo app is `WS/hourglassws/`. Workflow lives at repo root: `.github/workflows/test.yml`. Working directories are `hourglassws` and `hourglassws/server`.

## Test plan

This spec is itself a test infrastructure addition. Verification:

- [ ] Open a PR; CI job runs.
- [ ] PR with failing test → CI red, merge blocked.
- [ ] PR with passing test → CI green.
- [ ] Push to main triggers same workflow (sanity).
- [ ] Server test job runs independently — verify by introducing a deliberate failure in `server/__tests__/`, observing only `server-tests` red.
- [ ] First run cold-cache succeeds; second run hits cached `node_modules`.

## Files to reference

| File | Why |
|---|---|
| `package.json:7` | `"test": "jest"` — what CI invokes for app. |
| `server/package.json` | What CI invokes for server. |
| `jest.config.js` | Root Jest config, no changes. |
| `server/jest.config.js` | Server Jest config, no changes. |
| `tsconfig.json` | Used by `tsc --noEmit`. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | n/a | CI runs Jest, not is Jest. |
| Live-QA probe | ✗ | No API change. |
| TestFlight | ✗ | No app behavior change. |
| Error log | ✗ | No production behavior change. |

## Open questions

- **Node version:** check `.nvmrc` or EAS build config for current Node version; pin CI to match. If neither pins a version, use 20 (latest LTS at time of writing).
- **`tsc --noEmit` clean state:** the codebase reportedly has pre-existing TS errors in tests and tools. Either (a) fix them as part of this spec, (b) add `exclude` entries to tsconfig, or (c) use `continue-on-error: true` until a follow-up cleanup. Decide during implementation based on count.
