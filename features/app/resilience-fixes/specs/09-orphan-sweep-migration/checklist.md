# Implementation Checklist
**Spec:** 09-orphan-sweep-migration

## Phase 9.0: Test Foundation
### FR1: Broaden the orphan sweep
- [ ] Update T9: a mixed list (3 expected + `hourglass:foo` + random-UUID `7f3a...` + `legacy-uuid-xyz`) cancels ALL non-expected (foo, the UUID, legacy) and NONE of the expected three.
- [ ] Add regression test: a single random-UUID orphan (build-9 shape, no `hourglass:` prefix) IS cancelled — proves the migration gap is closed.
- [ ] Keep T10 (all expected → no cancel), T11 (empty), T12/T13 (legacy multiRemove), T14 (per-orphan reject → loop continues) green.

## Phase 9.1: Implementation
### FR1
- [ ] `scheduleLock.ts`: change the sweep condition to `if (typeof id === 'string' && !EXPECTED_IDENTIFIERS.has(id))` (drop `startsWith(PREFIX)`).
- [ ] Remove the now-unused `PREFIX` constant.
- [ ] Update file header + `sweepOrphanNotifications` JSDoc + `EXPECTED_IDENTIFIERS` comment to "cancels ANY non-expected identifier".

## Phase 9.2: Review & Verification
- [ ] Full `npx jest --runInBand` green vs baseline.
- [ ] Spec-implementation alignment check.
- [ ] `docs/ARCHITECTURE.md` §8.3/§8.4 updated.
- [ ] `app.json` buildNumber = 12.
- [ ] Commits: test → feat → docs(09-orphan-sweep-migration).
- [ ] Device-test deferred: build-9→build-12 upgrade, no Thursday 6pm barrage.
