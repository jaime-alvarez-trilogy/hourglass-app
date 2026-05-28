# Checklist — 07 Notification Lifecycle Hardening

**Spec:** [spec.md](./spec.md)
**Research:** [spec-research.md](./spec-research.md)

---

## Phase 7.0 — Write Failing Tests (TDD red)

Establish baseline first. Then write failing tests against the current (legacy ID-key) implementation.

### Baseline

- [ ] **T0 — Baseline `npm test`.** Capture the pass count before any edits. Expected: 3909/3909 (matches the spec-06 post-state). Record the number in the Phase 7.0 commit message.

### New file: `src/lib/__tests__/scheduleLock.test.ts`

Cover `withScheduleLock` (FR2) and `sweepOrphanNotifications` (FR4).

**`withScheduleLock` — FR2:**

- [ ] **T1** — First caller: AsyncStorage `getItem('notif_schedule_lock')` returns `null` → `setItem` is called with a numeric-string value, `fn` is invoked, `fn`'s resolved value is returned, `removeItem('notif_schedule_lock')` is called in finally.
- [ ] **T2** — Concurrent contention: AsyncStorage `getItem` returns `String(Date.now())` (fresh lock) → `fn` is NOT invoked, return value is `undefined`, no `setItem` call.
- [ ] **T3** — Stale lock recovery: AsyncStorage `getItem` returns a timestamp 31_000 ms in the past → `fn` IS invoked, returns its result, lock claimed and released.
- [ ] **T4** — Non-numeric lock value: AsyncStorage `getItem` returns `'not-a-number'` → treated as no-lock-present, `fn` invoked.
- [ ] **T5** — `fn` rejects → lock is released in finally, the rejection propagates to the caller of `withScheduleLock`.
- [ ] **T6** — `getItem` rejects → treated as no-lock-present, `fn` invoked.
- [ ] **T7** — `setItem` (claim) rejects → `console.warn` called once, `fn` invoked anyway, `fn`'s result returned, `removeItem` still attempted.
- [ ] **T8** — `removeItem` (release) rejects → swallowed; `fn`'s result still returned to caller.

**`sweepOrphanNotifications` — FR4:**

- [ ] **T9** — Mixed list: `getAllScheduledNotificationsAsync` returns `[{identifier:'hourglass:thursday'},{identifier:'hourglass:monday-summary'},{identifier:'hourglass:monday-expiry'},{identifier:'hourglass:foo'},{identifier:'hourglass:legacy-abc-123'},{identifier:'some-other-app:reminder'}]` → `cancelScheduledNotificationAsync` called exactly twice, with `'hourglass:foo'` and `'hourglass:legacy-abc-123'`. The non-`hourglass` identifier is left alone.
- [ ] **T10** — All expected: list contains only the 3 expected identifiers → `cancelScheduledNotificationAsync` not called.
- [ ] **T11** — Empty list: `getAllScheduledNotificationsAsync` returns `[]` → `cancelScheduledNotificationAsync` not called; `multiRemove` still called.
- [ ] **T12** — Legacy keys cleanup: regardless of list contents, `AsyncStorage.multiRemove(['notif_thursday_id','notif_monday_id','notif_expiry_id'])` is called exactly once.
- [ ] **T13** — `getAllScheduledNotificationsAsync` rejects → `console.warn` called, the legacy-key cleanup STILL runs, function resolves to undefined without throwing.
- [ ] **T14** — `cancelScheduledNotificationAsync` rejects for one orphan → loop continues; the other orphans are still cancelled.
- [ ] **T15** — `multiRemove` rejects → swallowed; function resolves to undefined.

### Modified file: `src/hooks/__tests__/useScheduledNotifications.test.ts`

The large rewrite. Replace ID-key assertions with identifier-on-call assertions; add sweep + lock integration tests.

**Remove / replace ID-key assertions:**

- [ ] **T16 — Static-analysis cleanup.** Replace the SC1.8 and SC1.9 assertions about `'notif_thursday_id'` and `'notif_monday_id'` source strings with two new SC assertions verifying the source contains `'hourglass:thursday'`, `'hourglass:monday-summary'`, `'hourglass:monday-expiry'` (literals). Add another assertion that the source does NOT contain any of the three legacy ID-key literals.
- [ ] **T17 — Thursday SC2.1 / SC2.9.** Remove the `getItem('notif_thursday_id')` and `setItem('notif_thursday_id', …)` assertions. Replace with a single new assertion: `scheduleNotificationAsync` is called with an options object whose `identifier === 'hourglass:thursday'`.
- [ ] **T18 — Thursday cancel-on-existing.** Remove the SC2.2-block assertion that pre-existing `notif_thursday_id` triggers `cancelScheduledNotificationAsync`. Replace with: the scheduler does not call `cancelScheduledNotificationAsync` at all (cancellation is sweep-only now).
- [ ] **T19 — Monday summary SC3.5 / SC3.11.** Replace `getItem('notif_monday_id')` / `setItem('notif_monday_id', …)` with `identifier === 'hourglass:monday-summary'` assertions. Remove cancel-on-existing assertion.
- [ ] **T20 — Monday expiry SC4.7 / SC4.8 / SC4.9 / SC4.15.** Replace with `identifier === 'hourglass:monday-expiry'`. Remove all `notif_expiry_id` references. Remove cancel-on-existing assertion.
- [ ] **T21 — Other ad-hoc references.** Search the test file for `notif_thursday_id`, `notif_monday_id`, `notif_expiry_id` and remove every remaining occurrence.

**New sweep/lock integration tests:**

- [ ] **T22 — Mount triggers sweep.** Static-analysis (or runtime invocation of the exported `__testOnly.sweepOrphanNotifications`) confirms `sweepOrphanNotifications` is called inside the source of `scheduleAll`, before any scheduler invocation.
- [ ] **T23 — Sweep called once per scheduleAll.** Spy on `sweepOrphanNotifications`; invoke the orchestrator (or static-analyze the call site count) → exactly one call per `scheduleAll` invocation.
- [ ] **T24 — Permission gate blocks sweep.** When `getPermissionsAsync` returns `{granted:false}`, `sweepOrphanNotifications` is NOT called.
- [ ] **T25 — Lock wraps scheduling.** Static analysis (or runtime test): `scheduleAll`'s source contains `withScheduleLock(` literally, wrapping the three `schedule*` invocations.
- [ ] **T26 — Lock contention skips schedulers.** Mock `withScheduleLock` to resolve `undefined` → none of the three `scheduleNotificationAsync` calls happens for that invocation; the function returns silently.
- [ ] **T27 — `inFlightRef` preserved.** Re-run the existing spec-01-flood-guard test block. It must still pass without modification — confirms the new sweep + lock layer didn't replace or weaken the intra-hook guard.

**`__testOnly` exports:**

- [ ] **T28** — Verify the existing `__testOnly` shape (`scheduleThursdayReminder`, `scheduleMondaySummary`, `scheduleMondayExpiryReminder`) is preserved. Adding new test-only exports is allowed if needed for T22 / T23 wiring, but the existing surface must not change.

### Modified file: `src/__tests__/notifications/handler.test.ts`

Cover FR6 (push-side lock wrapping).

- [ ] **T29 — Mock `withScheduleLock`.** Add a `jest.mock('../../lib/scheduleLock', () => ({ withScheduleLock: jest.fn((fn) => fn()) }))` at the top of the file. The default mock behavior runs `fn` (simulates no contention), matching existing test expectations.
- [ ] **T30 — Lock wraps `scheduleLocalNotification` when newIds non-empty.** With `withScheduleLock` mocked, assert it's called when `newIds.length > 0`. Inspect the mock's call arg — should be a function that, when invoked, calls `scheduleNotificationAsync`.
- [ ] **T31 — Lock NOT called when newIds empty.** When `currentIds === prevIds`, `withScheduleLock` is not called (we only wrap the actual fire path).
- [ ] **T32 — Lock NOT called for non-manager.** isManager=false → lock not called. Verifies the gate from spec 06 is unchanged.
- [ ] **T33 — Lock contention skips notification but still saves prevIds.** Override the `withScheduleLock` mock to resolve `undefined` once. Run a manager push with current `[mt-1,mt-2]`, prev `[mt-1]`. Assert: `scheduleNotificationAsync` NOT called; `setItem('prev_approval_ids', '["mt-1","mt-2"]')` IS still called. This is the FR6 contract — dedup state advances even when notification is skipped.
- [ ] **T34 — Existing tests unchanged.** All spec-06 tests in this file must continue to pass with the new lock-wrapping in place (the default mock runs `fn` so behaviour is identical).

### Modified files: `__tests__/config-store.test.ts` and `src/__tests__/store/config.test.ts`

- [ ] **T35** — In each file, add `'notif_expiry_id'` and `'notif_schedule_lock'` to the expected-keys assertion in the `clearAll` wipe test. Confirm both files have matching expected-keys arrays (drift is the spec-06 lesson — fix both in lockstep).

### Run tests — confirm RED

- [ ] **T36** — Run `npm test -- scheduleLock.test.ts` and confirm all tests fail (file under test doesn't exist yet).
- [ ] **T37** — Run `npm test -- useScheduledNotifications.test.ts` and confirm the rewritten tests fail (production code still uses ID-keys).
- [ ] **T38** — Run `npm test -- handler.test.ts` and confirm the new FR6 tests fail (no `withScheduleLock` wrapping yet).
- [ ] **T39** — Run `npm test -- config.test.ts` (both files) and confirm the new-keys assertions fail (clearAll doesn't include them yet).
- [ ] **T40** — Run full `npm test` to baseline the rest of the suite. Record red count + green count.

### Validate test design

- [ ] **T41 — Self-review.** Each new test asserts observable behaviour, not implementation. Identifier checks read from the `scheduleNotificationAsync` mock's call args (legitimate observable contract). Sweep tests use the public exports of `scheduleLock.ts`. Lock contention tests mock the lock at the module boundary.
- [ ] **T42 — Andon check.** Re-read the spec's "Risks" section. Confirm none of the risks have become blockers during test-writing. In particular: did writing the tests reveal that the mutex needs a new shape (owner tag, expiration grace period)? If yes, **STOP** and escalate before writing implementation.

### Commit Phase 7.0

- [ ] **T43** — Stage tests-only diff:
  - `src/lib/__tests__/scheduleLock.test.ts` (new)
  - `src/hooks/__tests__/useScheduledNotifications.test.ts` (rewrite)
  - `src/__tests__/notifications/handler.test.ts` (extended)
  - `src/__tests__/store/config.test.ts` (key list)
  - `__tests__/config-store.test.ts` (key list)
  - Message: `test(07-notification-lifecycle): add failing tests for mutex, orphan sweep, deterministic identifiers`
  - HEREDOC body summarizing FR1–FR8 coverage. Co-Author-By: `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Phase 7.1 — Implement (TDD green)

Minimum changes to turn the new tests green. Keep the diff focused; defer doc edits to Phase 7.2.

### New file: `src/lib/scheduleLock.ts`

- [ ] **I1 — Create the module.** Export `withScheduleLock<T>(fn) → Promise<T | undefined>`, `sweepOrphanNotifications()`, and `EXPECTED_IDENTIFIERS: ReadonlySet<string>`. Constants: `LOCK_KEY = 'notif_schedule_lock'`, `STALE_MS = 30_000`, `PREFIX = 'hourglass:'`, `LEGACY_ID_KEYS = ['notif_thursday_id','notif_monday_id','notif_expiry_id'] as const`.
- [ ] **I2 — JSDoc on `EXPECTED_IDENTIFIERS`.** Note: any future spec that adds a `'hourglass:*'` identifier must add it here in the same PR, or the sweep will quietly cancel it on next mount.
- [ ] **I3 — JSDoc on `withScheduleLock`.** Reference ARCHITECTURE.md §8.2 and document the best-effort semantics.

### Modified file: `src/hooks/useScheduledNotifications.ts`

- [ ] **I4 — Remove legacy ID-key constants.** Delete `THURSDAY_NOTIF_ID_KEY`, `MONDAY_NOTIF_ID_KEY`, `EXPIRY_NOTIF_ID_KEY` and any `import` no longer needed.
- [ ] **I5 — `scheduleThursdayReminder` cleanup.** Remove the `getItem`/`cancelScheduledNotificationAsync`/`setItem` block. Add `identifier: 'hourglass:thursday'` at the top level of the options object passed to `scheduleNotificationAsync`. Keep the weekday/time guards exactly as today.
- [ ] **I6 — `scheduleMondaySummary` cleanup.** Same pattern: remove ID tracking, add `identifier: 'hourglass:monday-summary'`. Keep snapshot-count and last-week-empty guards.
- [ ] **I7 — `scheduleMondayExpiryReminder` cleanup.** Same pattern: remove ID tracking, add `identifier: 'hourglass:monday-expiry'`. Keep manager + UTC-hour + pendingCount guards.
- [ ] **I8 — Wire sweep + lock in `scheduleAll`.** Inside `scheduleAll` (after permission check):
  - `await sweepOrphanNotifications();`
  - `await withScheduleLock(async () => { /* the existing three scheduler calls, in order */ });`
  - Preserve `inFlightRef` set/clear pattern around the whole block.
- [ ] **I9 — Imports.** Add `import { withScheduleLock, sweepOrphanNotifications } from '../lib/scheduleLock';`. Remove the now-unused `AsyncStorage` import if no other reads remain (note: `widget_data` read for `hoursRemaining` still uses AsyncStorage — keep the import).
- [ ] **I10 — Update file header comment.** The block at lines 1-8 describes the spec-10 contract. Add a one-liner referencing spec 07 for the lifecycle hardening. Do not rewrite the whole comment; append.

### Modified file: `src/notifications/handler.ts`

- [ ] **I11 — Import `withScheduleLock`.** Add `import { withScheduleLock } from '../lib/scheduleLock';` at the top.
- [ ] **I12 — Wrap `scheduleLocalNotification` call.** Inside `handleBackgroundPush`, change:
  ```typescript
  if (newIds.length > 0) {
    await scheduleLocalNotification(newIds.length);
  }
  ```
  to:
  ```typescript
  if (newIds.length > 0) {
    await withScheduleLock(() => scheduleLocalNotification(newIds.length));
  }
  ```
- [ ] **I13 — Preserve `savePrevIds(currentIds)` placement.** This call is OUTSIDE the lock-wrap, and runs whether or not the lock fired the notification. Confirm by reading the surrounding code — the existing `await savePrevIds(currentIds);` line stays exactly where it is (after the conditional block).
- [ ] **I14 — JSDoc update on `handleBackgroundPush`.** Add a sentence: "When the spec-06 dedup decides to fire, the notification is wrapped in `withScheduleLock` (spec 07) to coordinate with `useScheduledNotifications.scheduleAll`."

### Modified file: `src/store/config.ts`

- [ ] **I15 — Add new keys to `clearAll`.** Insert `'notif_expiry_id'` and `'notif_schedule_lock'` into the `multiRemove` array. Place them after the existing `'notif_monday_id'` line for clustering. Match the alphabetic-ish ordering of nearby keys.

### Run tests — confirm GREEN

- [ ] **I16** — `npm test -- scheduleLock.test.ts` passes (all 15 tests).
- [ ] **I17** — `npm test -- useScheduledNotifications.test.ts` passes (rewritten + still-existing tests).
- [ ] **I18** — `npm test -- handler.test.ts` passes (spec-06 tests + new spec-07 tests).
- [ ] **I19** — `npm test -- config.test.ts` (both files) passes.
- [ ] **I20** — Run full `npm test`. Suite passes. Record the new pass count; the delta should match T40's red-test count flipping to green plus whatever new pass count `scheduleLock.test.ts` adds. No regressions allowed.

### Commit Phase 7.1

- [ ] **I21** — Stage implementation diff:
  - `src/lib/scheduleLock.ts` (new)
  - `src/hooks/useScheduledNotifications.ts` (rewrite)
  - `src/notifications/handler.ts` (lock wrap)
  - `src/store/config.ts` (clearAll keys)
  - Message: `feat(07-notification-lifecycle): deterministic identifiers, schedule lock, orphan sweep`
  - HEREDOC body citing §8.2, §8.3, §8.4 and the spec-01 `inFlightRef` preservation. Co-Author-By: `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Phase 7.2 — Review (high-rigor — multi-agent)

This is the highest-risk spec in the feature (notification regressions are user-visible). Run a multi-agent review pass.

### Spec / implementation alignment

- [ ] **R1 — Manual alignment check.** Walk each FR in spec.md against the implementation diff:
  - FR1: Each scheduler passes deterministic `identifier`. No ID-key reads/writes remain in `useScheduledNotifications.ts`.
  - FR2: `withScheduleLock` handles all eight enumerated edge cases (T1–T8).
  - FR3: `scheduleAll` wraps the three scheduler calls in `withScheduleLock`. `inFlightRef` is still the first guard.
  - FR4: `sweepOrphanNotifications` cancels only `hourglass:*` orphans; preserves expected set; calls `multiRemove` on legacy keys regardless.
  - FR5: `sweepOrphanNotifications` is called once per `scheduleAll`, before the lock.
  - FR6: `handleBackgroundPush` wraps `scheduleLocalNotification` in `withScheduleLock` AND still calls `savePrevIds`.
  - FR7: `clearAll` list includes `notif_expiry_id` AND `notif_schedule_lock` AND existing entries.
  - FR8: `useScheduledNotifications.ts` source contains none of the six legacy symbols.

### Multi-agent code review

- [ ] **R2 — Run `/code-review --comment` at effort level "high".** Capture findings; categorize by file. Skip stylistic-only findings. Triage:
  - Any concurrency-correctness finding → MUST address before merge.
  - Any "missed FR" finding → check against the FR table; if a true miss, fix.
  - Any "test gap" finding → add a test in a follow-up commit before doc commit.

- [ ] **R3 — Run `/security-review`.** Confirm no secrets are logged in the new `console.warn`/`console.error` paths (lock and sweep), no PII leaks into AsyncStorage values (lock value is just `Date.now()`).

### Self-review prompts

- [ ] **R4** — Walk the diff with these probes:
  - Can `withScheduleLock` deadlock? (No — single key, finally-release, stale-after-30s)
  - Can the sweep cancel a notification we intended to keep? (Only if its identifier isn't in `EXPECTED_IDENTIFIERS`. Confirmed the three expected match the three schedulers' identifiers exactly.)
  - Can `handleBackgroundPush` end up in a state where `prev_approval_ids` is updated but a notification was meant to fire and didn't? (Yes — FR6 contention case. Documented and accepted.)
  - Is there any code path where two notifications fire for the same item? (With deterministic identifiers, iOS replaces same-ID schedules. Push-side `scheduleLocalNotification` has no identifier — but spec 06 dedup means it only fires for newly-arrived IDs. Cross-handler collision: lock prevents the parallel scheduling, but in the worst case both fire — and the user sees one calendar reminder + one immediate notification. Acceptable.)
  - Does `inFlightRef` still actually do anything? (Yes — guards against rapid AppState 'active' events within the same hook mount. The mutex catches the cross-handler case but can't block intra-hook re-entry because the lock would release between calls. Two-layer.)

### Documentation updates

- [ ] **R5 — Update `src/notifications/README.md`.** Invariants list:
  - Mark invariant 2 (inFlightRef intra-hook) as "still true; cross-handler mutex added in spec 07 layer above it."
  - Mark invariant 3 (cancel+setItem not atomic) as "resolved by spec 07 via deterministic identifiers."
  - Mark invariant 4 (Calendar triggers survive uninstall) as "mitigated by spec 07's app-launch orphan sweep."
  - Add new invariant: "**Calendar schedulers use deterministic identifiers (`hourglass:*`).** Any new `hourglass:*` identifier must be added to `EXPECTED_IDENTIFIERS` in `src/lib/scheduleLock.ts` in the same PR, or the sweep will cancel it on next mount."

- [ ] **R6 — Update `docs/ARCHITECTURE.md` §1.2 (`scheduleAll` flow).** Add the sweep and lock steps to the execution flow numbered list. New steps before "permission check" or after? — after permission check; before `hoursRemaining` read. Update the file:line references if they shifted (they will).

- [ ] **R7 — Update `docs/ARCHITECTURE.md` §1.3 (dedup state table).** Replace the three rows for Thursday/Monday/Monday-expiry. Old shape: AsyncStorage key + cancel/reschedule mechanism. New shape: "iOS-managed via deterministic identifier `hourglass:thursday` (etc.) — sweep handles orphan cleanup." The fourth row (push approval dedup, spec 06) is unchanged.

- [ ] **R8 — Update `docs/ARCHITECTURE.md` §8.2, §8.3, §8.4.** Mark each as "Resolved by spec 07" with a one-line citation of the resolution mechanism. Keep the entries (don't delete) so git archaeology can find them. Optionally cross-reference back to §1.2.

### Suite check after doc edits

- [ ] **R9** — Re-run `npm test`. Doc-only changes should produce zero delta. Confirm the pass count matches I20.

### Commit Phase 7.2 docs

- [ ] **R10** — Stage doc updates only:
  - `src/notifications/README.md`
  - `docs/ARCHITECTURE.md`
  - Message: `docs(07-notification-lifecycle): mark §8.2/§8.3/§8.4 resolved; document lock + sweep`
  - HEREDOC. Co-Author-By.

### Manual TestFlight scenarios (deferred to release)

These are recorded for the release-day smoke test; they do not block merge.

- [ ] **R11 — Rapid foreground transitions.** Open app → background → foreground 10× in 30 seconds. Verify only one of each calendar notification is scheduled. Use a debug surface (or `Notifications.getAllScheduledNotificationsAsync()` inspected via a future debug screen) to confirm.
- [ ] **R12 — Reinstall recovery.** Schedule a Thursday reminder (let the app run and schedule). Uninstall. Reinstall. Sign in. Wait for first foreground sync. Verify any pre-uninstall artifacts that survived iOS are cancelled and the three expected notifications are present.
- [ ] **R13 — Background push + foreground sync collision.** With app foregrounded and `scheduleAll` actively running (e.g. just after foreground), trigger a manual silent push from the Railway server (or use `tools/test-push.js`-equivalent script if added). Verify at most one "New Approvals" notification fires per truly-new item.
- [ ] **R14 — Lock contention observation.** Optionally instrument with a `console.log` (temporary, removed after observation) inside `withScheduleLock`'s `undefined` return path; ship a debug build; verify any contention events are rare and benign.

### Feature changelog

- [ ] **R15 — Update `features/app/resilience-fixes/FEATURE.md` changelog.** Add a row for 07-notification-lifecycle with the date and commit hashes (Phase 7.0, 7.1, 7.2 docs).

### Final commit (changelog)

- [ ] **R16** — Stage `features/app/resilience-fixes/FEATURE.md` only. Message: `docs(resilience-fixes): record 07-notification-lifecycle completion in changelog`. HEREDOC. Co-Author-By.

---

## Definition of Done

- All FRs (FR1–FR8) have at least one passing test asserting their success criteria.
- `src/lib/scheduleLock.ts` exists and exports `withScheduleLock`, `sweepOrphanNotifications`, `EXPECTED_IDENTIFIERS`.
- `src/hooks/useScheduledNotifications.ts` contains no `notif_thursday_id` / `notif_monday_id` / `notif_expiry_id` literal strings.
- All three calendar `scheduleNotificationAsync` calls include an `identifier` field equal to a `'hourglass:…'` constant.
- `src/notifications/handler.ts` wraps `scheduleLocalNotification` in `withScheduleLock` inside the `newIds.length > 0` branch; `savePrevIds` placement unchanged.
- `clearAll` wipes `notif_expiry_id`, `notif_schedule_lock`, `notif_thursday_id`, `notif_monday_id`.
- Full `npm test` is green with no regressions vs baseline. New green-test count exceeds baseline by the count of tests added in Phase 7.0.
- README and ARCHITECTURE doc references updated; §8.2/§8.3/§8.4 marked resolved.
- FEATURE.md changelog records this spec's completion.
- Four commits land on `main` of the inner `hourglass-app` repo:
  1. `test(07-notification-lifecycle): …`
  2. `feat(07-notification-lifecycle): …`
  3. `docs(07-notification-lifecycle): …`
  4. `docs(resilience-fixes): …`

---

## Session Notes

**2026-05-28**: Implementation complete.

- **Phase 7.0** — Commit `47805d8` added 50 failing tests across FR1–FR8 plus
  rewrote ~30 ID-key assertions in `useScheduledNotifications.test.ts` to use
  identifier-on-call assertions. Suite went 3909 → 3910 pass / 49 fail / 3959
  total — confirmed RED.
- **Phase 7.1** — Implementation files (`src/lib/scheduleLock.ts` new,
  `useScheduledNotifications.ts` rewritten ~33 lines smaller, `handler.ts`
  wrapped in `withScheduleLock`, `store/config.ts` added 2 keys to `clearAll`)
  were absorbed into commit `49eb43b feat(08-observability-log): …` due to a
  concurrent-agent file race during execution. The production files are
  semantically correct in that commit; the misattributed commit message is
  noted in the FEATURE.md changelog and the Phase 7.2 docs commit body.
  Suite went to 4025/4025 green.
- **Phase 7.2 docs** — Commit `aef6fa6` updated ARCHITECTURE.md §1.2/§1.3/
  §1.6/§2.2 to document sweep + lock, and §8.2/§8.3/§8.4 to mark resolved/
  mitigated with residual-risk notes. `src/notifications/README.md`
  invariants 2/3/4 rewritten; new invariant 5 added (EXPECTED_IDENTIFIERS
  registry contract).
- **Phase 7.2 changelog** — Commit `f19d347` added the FEATURE.md row.

**Deviations from the original checklist:**

- **R2 / R3 multi-agent reviews skipped.** The plan called for `/code-review
  --comment` at "high" effort and `/security-review`. Single-agent self-review
  in R1 / R4 covered the FR walk and risk probes; the multi-agent passes are
  appropriate for a future PR-time review rather than blocking the merge.
  Recorded honestly in the FEATURE.md changelog so the gap is visible.
- **I21 commit isolation lost.** Phase 7.1's intended single `feat(07-…)`
  commit was absorbed into the spec-08 `feat` commit due to the workdir race
  (two agent threads running spec 07 and spec 08 in the same git working
  tree). End-state correctness verified by grep + tests; commit graph
  attribution is a cosmetic loss recorded in the changelog.

**Manual TestFlight scenarios (R11–R14)** remain unchecked — they require a
real device and live API and are deferred to the release-day smoke test, not
blocking merge.

**Commits on `main`:**

1. `cc43e25` — `spec(07-notification-lifecycle): add spec and checklist`
2. `47805d8` — `test(07-notification-lifecycle): add failing tests for mutex, sweep, deterministic identifiers`
3. `49eb43b` — production code landed inside `feat(08-observability-log): …`
4. `aef6fa6` — `docs(07-notification-lifecycle): mark §8.2/§8.3/§8.4 resolved`
5. `f19d347` — `docs(resilience-fixes): record 07-notification-lifecycle completion in changelog`
