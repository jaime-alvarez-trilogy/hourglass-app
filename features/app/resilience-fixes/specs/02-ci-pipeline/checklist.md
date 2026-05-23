# Checklist — Spec 02 (CI pipeline)

## Pre-implementation
- [ ] Confirm `.github/workflows/` does not already exist in `hourglass-app` (greenfield)
- [ ] Confirm `package-lock.json` and `server/package-lock.json` are committed in `hourglass-app`
- [ ] Confirm `package.json:scripts.test` is `"jest"` and `server/package.json:scripts.test` works from `server/`
- [ ] Confirm GitHub repo `jaime-alvarez-trilogy/hourglass-app` has Actions enabled (Settings → Actions → General → "Allow all actions")

## Phase X.0 — Test foundation
This spec has no unit-testable code; the workflow is the test infrastructure. The TDD `red-phase-test-validator` gate does not apply. Verification is end-to-end and lives in Phase X.2.

## Phase X.1 — Implementation

**Workflow file**
- [ ] FR1, FR2, FR3, FR4, FR5: Create the workflow at `hourglassws/.github/workflows/test.yml` on disk (i.e. `.github/workflows/test.yml` relative to the `hourglass-app` repo root), using the YAML defined in `spec.md` § Workflow definition. **Do not** create a workflow at the outer WS / `hourglass-scriptable` repo root.
- [ ] `cd hourglassws && git status` shows the workflow file as untracked in the `hourglass-app` repo (confirms correct repo)
- [ ] Push the workflow file on a feature branch in `hourglass-app` (not directly to main — we want to exercise the PR trigger first)

**Commit**
- [ ] One commit: `feat(02-ci-pipeline): add GitHub Actions test workflow`
- [ ] Co-author trailer
- [ ] Stage only `.github/workflows/test.yml`

## Phase X.2 — Review and end-to-end verification

**Step 0: spec-implementation-alignment**
- [ ] Run `spec-implementation-alignment` agent against `spec.md` and the created workflow file
- [ ] Confirm PASS (all 5 FRs satisfied)

**Step 1: First PR — workflow triggers (FR1, FR2)**
- [ ] Open a PR with the new workflow file
- [ ] Confirm both `app-tests` and `server-tests` appear as checks within ~1 minute
- [ ] Confirm both jobs run on `ubuntu-latest`
- [ ] Confirm jobs run concurrently (start times within seconds of each other)

**Step 2: Baseline green (FR3, FR4)**
- [ ] Confirm `app-tests` passes on the introductory PR (no test changes yet)
- [ ] Confirm `server-tests` passes on the introductory PR

**Step 3: App red-signal probe (FR3)**
- [ ] Add a throwaway test in `__tests__/_ci-probe.test.ts` that intentionally fails (`expect(1).toBe(2)`)
- [ ] Push to the same PR
- [ ] Confirm `app-tests` turns red
- [ ] Confirm `server-tests` stays green (attribution preserved)
- [ ] Confirm the PR's merge button is blocked (or yellow if branch protection isn't yet set — note for Step 7)

**Step 4: Server red-signal probe (FR4)**
- [ ] Remove the app probe; add a throwaway test in `server/__tests__/_ci-probe.test.ts` that intentionally fails
- [ ] Push to the same PR
- [ ] Confirm `server-tests` turns red
- [ ] Confirm `app-tests` stays green (attribution preserved)

**Step 5: Remove probes (FR3, FR4)**
- [ ] Delete both probe files in a final commit on the PR
- [ ] Confirm both jobs green
- [ ] Merge the PR to `main`

**Step 6: Push-to-main trigger (FR1)**
- [ ] Confirm the merge commit triggers a `Test` workflow run against `main`
- [ ] Confirm both jobs pass

**Step 7: Cache reuse (FR5)**
- [ ] Open a follow-up PR with a trivial doc change (no lockfile change)
- [ ] In the `setup-node` step logs for both jobs, confirm the line "Cache restored from key" (or equivalent)
- [ ] Compare install time vs. first run (should be substantially faster)

**Step 8: Branch protection (manual, out of workflow scope but expected follow-up)**
- [ ] GitHub Settings → Branches → Add rule for `main`
- [ ] Require status checks: `app-tests`, `server-tests`
- [ ] (Not committed code; recorded here so it isn't forgotten)

**Step 9: Multi-agent review**
- [ ] `pr-review-toolkit:review-pr` — light pass, the workflow YAML is small. Focus on `code-reviewer` and `silent-failure-hunter` findings.
- [ ] Skip `test-optimiser` — no unit tests added by this spec.

## Completion
- [ ] Update `features/app/resilience-fixes/FEATURE.md` changelog with spec 02 completion
- [ ] Append session notes to this checklist
- [ ] Commit: `docs(02-ci-pipeline): mark spec complete in checklist and FEATURE.md`
- [ ] Verify `git status` clean (in `hourglass-app` repo)
