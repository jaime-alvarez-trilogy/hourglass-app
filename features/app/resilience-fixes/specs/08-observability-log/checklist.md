# Checklist — 08 Observability Log

**Spec:** [spec.md](./spec.md)
**Research:** [spec-research.md](./spec-research.md)

---

## Phase 8.0 — Write Failing Tests (TDD red)

Before any production code, write tests that fail because the modules don't exist yet.

### Dependencies and mocks (preconditions)

- [ ] **T0a — Install deps.** Run `npx expo install expo-file-system expo-sharing` from `hourglassws/`. Confirm `package.json` gains both entries. *This is the only command that should run outside test/source files in this phase.*
- [ ] **T0b — Create `__mocks__/expo-file-system.ts`.** In-memory implementation with: `documentDirectory: '/mock-docs/'`, `writeAsStringAsync(uri, content, opts)` honoring `{append: true}`, `readAsStringAsync(uri)`, `getInfoAsync(uri)` returning `{exists, size}`, `deleteAsync(uri)`. Add `_reset()` to clear state between tests. Mirror the SecureStore mock style.
- [ ] **T0c — Create `__mocks__/expo-sharing.ts`.** Exports `shareAsync: jest.fn(async () => undefined)` plus `_reset()`.

### Test file: `src/lib/__tests__/redact.test.ts` (new)

**FR2 — Redactor cases**

- [ ] **T1** — `redact({})` returns `{}`.
- [ ] **T2** — `redact({a: 1, b: true, c: 'ok'})` returns `{a: 1, b: true, c: 'ok'}` (all primitives kept).
- [ ] **T3** — `redact({password: 'x', a: 1})` drops `password`.
- [ ] **T4** — `redact({Password: 'x', PASS: 'y', a: 1})` is case-insensitive (both dropped).
- [ ] **T5** — `redact({authToken: 'abc', authorization: 'def', a: 1})` drops both (substring `auth`).
- [ ] **T6** — `redact({userId: 1, assignmentId: '2', notificationId: 'x', a: 1})` drops all `*Id` keys.
- [ ] **T7** — `redact({idCount: 5, idLength: 3, idSize: 2})` keeps all (count/length/size exception overrides `*id` rule).
- [ ] **T8** — `redact({username: 'x', email: 'y@z', fullName: 'a b'})` drops all.
- [ ] **T9** — `redact({memo: 'x', description: 'y', text: 'z', message: 'w'})` drops all.
- [ ] **T10** — `redact({body: 'x', headers: 'y', cookie: 'z', secret: 'w'})` drops all.
- [ ] **T11** — `redact({header: 'Basic abc'})` replaces with `'<basic-auth>'`.
- [ ] **T12** — `redact({h: 'Bearer xyz123'})` replaces with `'<bearer-token>'`.
- [ ] **T13** — `redact({field: 'A'.repeat(80)})` (80 chars, base64-shaped) replaces with `'<redacted-base64>'`.
- [ ] **T14** — `redact({field: 'a_token_like_abcdefghij1234567890_ABCDEFGHIJKLMNOP'})` (≥ 32 chars, token-shaped) replaces with `'<redacted-token>'`.
- [ ] **T15** — `redact({nested: {a: 1}, arr: [1, 2], n: null, u: undefined})` returns `{}` (non-primitives all dropped).
- [ ] **T16** — `redact({errorCode: 'CROS-1234', statusCode: 401, errorType: 'X', ok: true, count: 3})` returns the input verbatim (all whitelisted shapes).
- [ ] **T17** — `redact({tokenRetried: true})` drops the key (substring `token` matches; documents the rename-on-call-site policy).

### Test file: `src/lib/__tests__/log.test.ts` (new)

**FR1 — Single JSON line per call**

- [ ] **T18** — `log.info('x.y', {a: 1}); await log.flush();` → file has exactly one line, parseable as JSON, fields `{ts, level: 'info', category: 'x.y', meta: {a: 1}}`.
- [ ] **T19** — Two info calls → two `\n`-terminated lines in order.
- [ ] **T20** — Line ends with `\n` (no extra newlines, no missing terminator).
- [ ] **T21** — `ts` field parses as a valid ISO 8601 string (via `Date.parse`).

**FR3 — Error class capture, message NOT logged**

- [ ] **T22** — `log.error('cat', new Error('SECRET_MARKER'))` → file contains `errorClass: 'Error'` and the string `'SECRET_MARKER'` does NOT appear anywhere.
- [ ] **T23** — `log.error('cat', new AuthError(401, 'should not appear'))` → `errorClass: 'AuthError'`, message not present. *Import `AuthError` from `src/api/errors.ts` to get the real class.*
- [ ] **T24** — `log.error('cat', 'CustomClass', {statusCode: 500})` → `errorClass: 'CustomClass'`, `meta: {statusCode: 500}`.
- [ ] **T25** — `log.error('cat', new Error(''))` (empty message) → `errorClass: 'Error'`, no `message` field.

**FR4 — Buffered flush**

- [ ] **T26 — Fake timers**: `log.info('x'); ` — without flush, file is empty. Advance timers by 3001 ms — file now contains the event.
- [ ] **T27** — `log.flush()` while buffer is empty does NOT call `writeAsStringAsync` (no empty write).
- [ ] **T28** — Two `log.info` then `flush` → single `writeAsStringAsync` call containing both lines (batched).
- [ ] **T29** — Calling `flush()` cancels the pending timer (so a subsequent advance doesn't re-fire).

**FR5 — Rotation**

For rotation tests, expose a test-only setter or pass cap/target as env-injected constants. Implementation choice: export `__setRotationLimits(max, target)` from `log.ts` guarded by `__DEV__`/test-only, OR factor the limits to module-level `let`s and mutate them in tests via a test hook. Pick whichever is least intrusive.

- [ ] **T30** — With `MAX_BYTES=500, TARGET_BYTES=300`, write ~700 bytes (multiple events), flush → file size ≤ 300 bytes.
- [ ] **T31** — After rotation, the FIRST line in the file is a previously-mid-stream line (oldest dropped). Verify by content match — e.g. log events `e1, e2, …, e20`; after rotation, line 1 starts with `e<k>` where `k > 1`.
- [ ] **T32** — Rotated file's first byte is the start of a complete line (no truncated half-line).
- [ ] **T33** — Subsequent writes after rotation append correctly and remain under cap.

**FR6 — Non-throwing**

- [ ] **T34** — Mock `writeAsStringAsync` to reject. `await log.flush()` resolves (no throw). `_lastWriteError` is set.
- [ ] **T35** — Mock `getInfoAsync` (used in rotation check) to reject. Flush still resolves.
- [ ] **T36** — On flush failure, buffer is cleared (no unbounded memory). Verified by: after failed flush, calling flush again does NOT write the lost events.
- [ ] **T37** — `log.error('cat', new Error('boom'))` while disk is failing → no throw, no unhandled rejection.

**FR7 — `getLogFileUri`**

- [ ] **T38** — Returns string ending in `'hourglass-debug.log'`.
- [ ] **T39** — On a fresh mock (no prior writes), calling `getLogFileUri()` creates the file empty; `FileSystem.getInfoAsync(uri).exists` is true afterward.
- [ ] **T40** — URI starts with `documentDirectory` value from the mock (`/mock-docs/...`).

**FR8 — `clear`**

- [ ] **T41** — `log.info('x'); await log.clear(); await log.flush();` → file size is 0.
- [ ] **T42** — After clear, file still exists at the path (no `deleteAsync`).
- [ ] **T43 — Fake timers**: `log.info('x');` schedules flush timer. `await log.clear();` then advance timers. No write occurs after clear.

**FR10 — Zero network calls**

- [ ] **T44** — Module-import check: `import * as logMod from '@/src/lib/log';` — assert module's `__esModule` is true and no fetch-related symbol is exported. *(Surface-level smoke check.)*
- [ ] **T45** — In a test, monkey-patch `global.fetch` to throw. Run `log.info`, `log.error`, `log.flush`. No fetch invocation. The `fetch.mock.calls.length === 0` after the cycle.

### Test file: `app/__tests__/modal-debug-log.test.tsx` (new)

**FR9 — Settings modal Debug Log section**

- [ ] **T46** — Render `<ModalScreen />` with a mocked config (`{ ...config, isManager: true, ... }`). Assert "Share log" and "Clear log" buttons are present (visible).
- [ ] **T47** — The "Debug Log" heading text is present.
- [ ] **T48** — Section is visible WITHOUT the `isMe` gate. Mock `loadCredentials` to return a non-dev username; both buttons still render.
- [ ] **T49** — Tap "Share log" → `Sharing.shareAsync` called once with a URI ending in `hourglass-debug.log` and options matching `{ dialogTitle: 'Share debug log', mimeType: 'text/plain' }`.
- [ ] **T50** — Tap "Share log" while `Sharing.shareAsync` rejects → `Alert.alert` is called with title `'Could not share'`. *(Mock `Alert.alert` via `jest.spyOn`.)*
- [ ] **T51** — Tap "Clear log" → `Alert.alert` is called with title `'Clear log?'` and two buttons (Cancel + Clear).
- [ ] **T52** — Tap "Clear log" then invoke the "Clear" alert button → `log.clear()` called once.
- [ ] **T53** — Tap "Clear log" then invoke "Cancel" → `log.clear()` NOT called.

### Run tests — confirm RED

- [ ] **T54** — Run `npm test -- redact.test.ts` and confirm all 17 cases fail with "Cannot find module '@/src/lib/redact'".
- [ ] **T55** — Run `npm test -- log.test.ts` and confirm all cases fail (module missing).
- [ ] **T56** — Run `npm test -- modal-debug-log.test.tsx` and confirm at least one assertion fails (Debug Log section not rendered).
- [ ] **T57** — Run full `npm test` to baseline. Record total count vs current `main` baseline (3909 from spec 06). Expected: many new failures from the test files above; everything else still green.

### Validate test design

- [ ] **T58 — Self-review** that no test inspects logger internals via private property access (`logger['buffer']`). All assertions go through public methods + the mock file's observable state.
- [ ] **T59 — Self-review** that the redactor tests cover the documented categories (keys, value scrubbing, type filter) without testing implementation details.
- [ ] **T60 — Self-review** that no test relies on real `setTimeout` (all timing tests use `jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync`).

### Commit Phase 8.0

- [ ] **T61** — Stage `package.json`, `package-lock.json` (deps), `__mocks__/expo-file-system.ts`, `__mocks__/expo-sharing.ts`, `src/lib/__tests__/redact.test.ts`, `src/lib/__tests__/log.test.ts`, `app/__tests__/modal-debug-log.test.tsx`. Commit:
  - Message: `test(08-observability-log): add failing tests for logger, redactor, and settings UI`
  - HEREDOC body: brief summary of FR coverage.
  - Co-Author-By: `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

## Phase 8.1 — Implement (TDD green)

Smallest possible production code that turns the new tests green.

### `src/lib/redact.ts` (new)

- [ ] **I1** — Implement `redact(meta)` per FR2. Key deny-list as case-insensitive substring matches. `*Id` rule with count/length/size exception. Value scrubbers for Basic/Bearer/base64/token. No async, no I/O, no dependencies.
- [ ] **I2** — Add JSDoc on the exported `redact` function (2–3 lines) per repo convention.

### `src/lib/log.ts` (new)

- [ ] **I3** — Define constants: `LOG_FILENAME`, `MAX_BYTES`, `TARGET_BYTES`, `FLUSH_INTERVAL_MS`, `BUFFER_OVERFLOW`. Constants are `let` (not `const`) only for `MAX_BYTES` / `TARGET_BYTES` so the test hook can override; OR const + export test hook function. Pick the simpler one.
- [ ] **I4** — `Logger` class with `buffer`, `flushTimer`, `_lastWriteError` private fields.
- [ ] **I5** — `info`, `warn`, `error` methods build a `LogEvent`, redact meta, push to buffer, schedule timer.
- [ ] **I6** — `flush()` drains buffer, serializes events to `JSON.stringify(event) + '\n'` joined, calls `writeAsStringAsync(uri, payload, {encoding: 'utf8', append: true})` (or whichever option name expo-file-system uses for append). Catches any throw, sets `_lastWriteError`, clears buffer regardless.
- [ ] **I7** — After successful write, `rotateIfNeeded()`: `getInfoAsync(uri)`, if `size > MAX_BYTES`, read file, split on `\n`, drop lines from start until cumulative byte count from the right ≤ `TARGET_BYTES`, re-write file (no append). Catch / swallow.
- [ ] **I8** — `getLogFileUri()`: returns `FileSystem.documentDirectory + LOG_FILENAME`. Pre-creates empty file if `getInfoAsync(uri).exists === false`.
- [ ] **I9** — `clear()`: cancel timer, empty buffer, `writeAsStringAsync(uri, '', {append: false})` — overwrites with empty.
- [ ] **I10** — Export singleton `log = new Logger()`.
- [ ] **I11** — Test hook (`__setRotationLimits(max, target)` or similar) exported but only intended for tests. Document with `/** @internal */`.
- [ ] **I12** — JSDoc on all exported methods per repo convention.

### `app/modal.tsx`

- [ ] **I13 — Imports**: add `import { log } from '@/src/lib/log';` and `import * as Sharing from 'expo-sharing';`.
- [ ] **I14 — Insert "Debug Log" section** between the Environment switcher (line ~189) and the dev-options box (line ~191). Structure:
  ```tsx
  <View style={styles.debugLogBox}>
    <Text style={styles.debugLogTitle}>Debug Log</Text>
    <Text style={styles.debugLogHint}>Export a privacy-redacted error log when reporting a bug.</Text>
    <View style={styles.debugLogRow}>
      <TouchableOpacity style={styles.debugLogButton} onPress={handleShareLog}>
        <Text style={styles.debugLogButtonText}>Share log</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.debugLogButton} onPress={handleClearLog}>
        <Text style={styles.debugLogButtonText}>Clear log</Text>
      </TouchableOpacity>
    </View>
  </View>
  ```
- [ ] **I15** — `handleShareLog` async function: `try { const uri = await log.getLogFileUri(); await Sharing.shareAsync(uri, { dialogTitle: 'Share debug log', mimeType: 'text/plain' }); } catch { Alert.alert('Could not share', 'Try again later.'); }`.
- [ ] **I16** — `handleClearLog` function: presents `Alert.alert('Clear log?', 'This removes all logged events from this device.', [{text:'Cancel',style:'cancel'},{text:'Clear',style:'destructive',onPress: async () => { await log.clear(); }}])`.
- [ ] **I17** — Section is rendered unconditionally inside the ScrollView (no `isMe` gate, visible to all users).
- [ ] **I18** — Add styles (`debugLogBox`, `debugLogTitle`, `debugLogHint`, `debugLogRow`, `debugLogButton`, `debugLogButtonText`) following the existing dev-options visual style.

### Run tests — confirm GREEN

- [ ] **I19** — `npm test -- redact.test.ts` passes.
- [ ] **I20** — `npm test -- log.test.ts` passes.
- [ ] **I21** — `npm test -- modal-debug-log.test.tsx` passes.
- [ ] **I22** — Full `npm test` passes with no regressions. Record delta vs baseline.

### Commit Phase 8.1

- [ ] **I23** — Stage `src/lib/redact.ts`, `src/lib/log.ts`, `app/modal.tsx`. Commit:
  - Message: `feat(08-observability-log): add local error log with redaction and share UI`
  - HEREDOC body covering: logger module, redactor, modal wiring, no network calls.
  - Co-Author-By.

---

## Phase 8.2 — Review

### Spec / implementation alignment

- [ ] **R1 — Walk each FR** against the implementation:
  - FR1: line format, fields, `\n` terminator.
  - FR2: deny-list keys all dropped; value scrubbers fire.
  - FR3: only error class, never message; tested with `AuthError`.
  - FR4: 3s timer, fake-timer test passing.
  - FR5: rotation triggers at cap, file shrinks to target, complete lines preserved.
  - FR6: every I/O surface catches.
  - FR7: file pre-created on first URI request.
  - FR8: clear empties + keeps file.
  - FR9: section visible to all users, both buttons wire to logger + sharing.
  - FR10: import graph clean, no fetch.

### Code review pass

- [ ] **R2 — Self-review** with prompts:
  - Any path where the logger can throw past the public surface? (Run mental test of every catch boundary.)
  - Any way a meta value of unexpected type bypasses the redactor? (Test FR2 cases cover string, number, boolean, object, array, null, undefined; what about `bigint`, `symbol`, `function`? Decision: drop those too — only keep primitives explicitly enumerated.)
  - Could the rotation `split('\n')` miscount with a multi-byte UTF-8 character at a boundary? (Unlikely — string length is in chars, but `getInfoAsync.size` is in bytes. Could cause a slightly-over-target file. Acceptable.)
  - Is `Sharing.shareAsync` actually available? (yes — installed in T0a; verify import resolves.)
  - Does adding `expo-file-system` break any other test file via its mock? (Run full suite — if `__mocks__/expo-file-system.ts` shadows what `jest-expo` provides for other tests, check for collateral damage.)
- [ ] **R3 — Privacy spot-check**: grep the implementation for any `console.log`, `console.warn`, `fetch`, `XMLHttpRequest`, `Sentry`, `Crashlytics`. None should exist in `src/lib/log.ts` or `src/lib/redact.ts`.

### Multi-agent review (orchestrator dispatch)

- [ ] **R4 — Spec-implementation-alignment agent** dispatched against the spec path. PASS gate.
- [ ] **R5 — PR review toolkit** dispatched. Address actionable findings.

### Documentation touch-ups

- [ ] **R6 — Update `docs/ARCHITECTURE.md` §1** (privacy model): add a paragraph noting the local error log is the only observability surface, redacted at write time, exported only by explicit user action. Reference `src/lib/log.ts`.
- [ ] **R7 — Update `docs/ARCHITECTURE.md` §5.5** (settings modal): mention the new Debug Log section and its visibility (all users).
- [ ] **R8 — Update `docs/ARCHITECTURE.md` §8** if there's a row for "no observability" / TBD: mark resolved by spec 08. *(Verify section exists; if not, no-op this task.)*

### Suite check after doc edits

- [ ] **R9** — Re-run `npm test`. Identical green count to I22.

### Commit Phase 8.2 docs

- [ ] **R10** — Stage `docs/ARCHITECTURE.md`. Commit:
  - Message: `docs(08-observability-log): document local error log in privacy model and settings`
  - HEREDOC body summarizing the §1, §5.5, §8 touches.
  - Co-Author-By.

### Manual TestFlight scenarios (deferred to release smoke test)

- [ ] **R11 — Live log generation**: sign in, navigate around for 5 minutes, open Settings → Share log → email to self. Inspect file: no PII, plausible event stream.
- [ ] **R12 — Deliberate failure**: sign in with wrong password. Confirm log captures an `auth.failure`-style line (after wiring spec lands). Email and confirm no password leak.
- [ ] **R13 — Clear flow**: tap Clear log → confirm Alert dialog → tap Clear → reopen settings → tap Share log → file is empty.
- [ ] **R14 — Rotation**: synthetically log ~2000 events (use a `__DEV__`-only dev button or a temporary loop) → confirm file stays ≤ 200 KB and contains the most-recent events.

*These are documented for the release smoke test; they do not block merge.*

### Feature changelog

- [ ] **R15 — Update `features/app/resilience-fixes/FEATURE.md`** Changelog: add a row for 08-observability-log with implementation date and commit hashes for Phase 8.0, 8.1, 8.2 docs.

### Final commit (changelog)

- [ ] **R16** — Stage `features/app/resilience-fixes/FEATURE.md`. Commit:
  - Message: `docs(resilience-fixes): record 08-observability-log completion in changelog`
  - HEREDOC.
  - Co-Author-By.

---

## Definition of Done

- All FRs (FR1–FR10) have at least one passing test asserting their success criteria.
- Full `npm test` suite is green with delta ≥ 0 vs the pre-spec baseline. New tests increase the green count by the number of new cases (~60).
- `src/lib/log.ts` and `src/lib/redact.ts` exist as pure modules (no network imports).
- `app/modal.tsx` shows a "Debug Log" section with Share + Clear buttons visible to all users.
- `expo-file-system` and `expo-sharing` are present in `package.json` at SDK-compatible versions.
- `docs/ARCHITECTURE.md` §1 and §5.5 mention the logger.
- `FEATURE.md` Changelog records this spec's completion.
- Four commits land on `main` of the `hourglass-app` inner repo:
  1. `test(08-observability-log): …`
  2. `feat(08-observability-log): …`
  3. `docs(08-observability-log): …`
  4. `docs(resilience-fixes): …`

---

## Session Notes

*Filled in as work proceeds.*
