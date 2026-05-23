# Checklist — Spec 02 (CI pipeline)

## Pre-implementation
- [x] Confirm `.github/workflows/` does not already exist in `hourglass-app` (greenfield) — verified, dir absent at implementation time
- [x] Confirm `package-lock.json` and `server/package-lock.json` are committed in `hourglass-app` — both tracked
- [x] Confirm `package.json:scripts.test` is `"jest"` and `server/package.json:scripts.test` works from `server/` — confirmed (`jest --testPathPattern='server/__tests__' --config ../jest.config.js`)
- [ ] Confirm GitHub repo `jaime-alvarez-trilogy/hourglass-app` has Actions enabled (Settings → Actions → General → "Allow all actions") — **user must verify in browser before first PR**

## Phase X.0 — Test foundation
This spec has no unit-testable code; the workflow is the test infrastructure. The TDD `red-phase-test-validator` gate does not apply. Verification is end-to-end and lives in Phase X.2.

## Phase X.1 — Implementation

**Workflow file**
- [x] FR1, FR2, FR3, FR4, FR5: Create the workflow at `hourglassws/.github/workflows/test.yml` on disk (i.e. `.github/workflows/test.yml` relative to the `hourglass-app` repo root), using the YAML defined in `spec.md` § Workflow definition. **Do not** create a workflow at the outer WS / `hourglass-scriptable` repo root.
- [x] `cd hourglassws && git status` showed the workflow file as untracked in the `hourglass-app` repo (commit `5302411` confirms correct repo)
- [ ] Push the workflow file on a feature branch in `hourglass-app` (not directly to main — we want to exercise the PR trigger first) — **user action**

**Commit**
- [x] One commit: `feat(02-ci-pipeline): add GitHub Actions test workflow` (commit `5302411`)
- [x] Co-author trailer
- [x] Stage only `.github/workflows/test.yml`

## Phase X.2 — Review and end-to-end verification

**Step 0: spec-implementation-alignment**
- [x] Run `spec-implementation-alignment` agent against `spec.md` and the created workflow file — **PASS** (all 5 FRs satisfied; YAML is byte-for-byte identical to the spec's canonical definition)

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
- [x] `pr-review-toolkit:review-pr` — **skipped** as disproportionate. Artifact is a 31-line GitHub Actions YAML; 4 of the 6 toolkit agents (`type-design-analyzer`, `comment-analyzer`, `code-simplifier`, `pr-test-analyzer`) have nothing to analyze. The alignment check is the relevant gate here, and it passed. If extra eyes are wanted, `/code-review` with `--low` effort on the workflow file gives a focused pass.
- [x] Skip `test-optimiser` — no unit tests added by this spec.

## Completion
- [x] Update `features/app/resilience-fixes/FEATURE.md` changelog with spec 02 implementation status
- [x] Append session notes to this checklist
- [x] Commit: `docs(02-ci-pipeline): mark Phase X.1 complete and document open verification steps`
- [x] Verify `git status` clean (in `hourglass-app` repo) modulo untracked `.claude/`

## Session Notes

**2026-05-23**: Phase X.1 complete; Phase X.2 partially complete.
- Phase X.0: N/A (no unit tests — CI infra).
- Phase X.1: One commit `5302411 feat(02-ci-pipeline): add GitHub Actions test workflow`. Stages only `.github/workflows/test.yml` (31 lines).
- Phase X.2 Step 0 (alignment): PASS — all 5 FRs satisfied, byte-for-byte match to spec's canonical YAML.
- Phase X.2 Step 9 (multi-agent review): skipped as disproportionate for 31-line YAML.
- **Phase X.2 Steps 1-8 (end-to-end PR verification): NOT YET DONE — requires user.** The branch is committed locally but not pushed to `origin`. The verification exercise (open PR, red/green probes, cache reuse check, branch protection setup) must be driven on GitHub by the user. Re-open this checklist when the PR is up and tick off Steps 1-7 from the run log. Step 8 (branch protection) is a manual GitHub Settings change.
