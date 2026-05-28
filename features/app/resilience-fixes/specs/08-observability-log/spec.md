# 08 — Local Error Log with Privacy-Preserving Redaction and User-Driven Export

**Status:** Draft
**Created:** 2026-05-28
**Last Updated:** 2026-05-28
**Owner:** @jaime-alvarez-trilogy

---

## Overview

Add a privacy-preserving observability layer to the Hourglass app. Errors and meaningful decision points are appended to a local JSONL file on the device. A "Share debug log" button in the settings modal exports the file via the iOS share sheet. There is **no automatic transmission** — events travel off-device only when the user explicitly invokes the share sheet. This is consciously the opposite of a typical crash reporter (Sentry, Crashlytics): the model is "user-driven post-mortem export" not "automatic phone-home".

The implementation is one logger module (`src/lib/log.ts`) and one redaction module (`src/lib/redact.ts`), plus a wiring change to `app/modal.tsx` for the export/clear UI. Two new dependencies are added (`expo-file-system`, `expo-sharing`) — both are first-party Expo modules already present in `expo-modules-core`. No other modules are touched. Existing call sites (auth, push handler, notification orchestrator, onboarding) get one-line `log.info(...)` / `log.error(...)` calls added as part of future specs; this spec ships **only the infrastructure**, not the call-site wiring.

The redaction policy is **deny-by-default**: only an allow-list of types (`string | number | boolean`) and key shapes (no `password`, `token`, `auth`, `user`, `email`, `memo`, `description`, `text`, `message`, `body`, `headers`, `name` in any case) is written. Values that look like credentials (`Basic …`, `Bearer …`, long base64 blobs) are scrubbed even when their key is innocuous. Errors are logged as `{class: "AuthError", statusCode, errorCode, errorType}` — never `.message`, never `serverText`/`envelope.text`. This is more conservative than the dispatch prompt suggested (which proposed logging `envelope.text` redacted) and matches spec-research §3's explicit "no message text" guidance.

The file is JSONL (one event per line) capped at ~200 KB; on exceed, the oldest half of lines is dropped (so the file shrinks to ~100–150 KB). I/O is buffered in memory and flushed on a 3-second timer or on explicit `flush()`. Failures in I/O are swallowed — the logger never throws, never crashes the app. The file lives at `FileSystem.documentDirectory + 'hourglass-debug.log'` so it persists across app updates and is accessible via the share sheet.

---

## Out of Scope

1. **Adding `log.*` calls at the existing API/auth/push call sites.** This spec ships only the logger surface and the share UI. Wiring into specs 03/04/05/06/07 will land in those specs' own follow-up tasks or in a dedicated wiring spec. *Rationale: keeps the diff small and lets call-site additions land independently with their respective behavior changes.*

2. **Automatic phone-home / Sentry-style transmission.** Spec-research §"Out of scope" explicitly defers Tier 2/3 telemetry. The logger emits to disk only.

3. **Native crash detection.** JavaScript exceptions are logged via explicit `log.error(...)` calls. Native iOS crashes are not captured — that requires `expo-application` crash reporting integration, deferred.

4. **Performance / timing instrumentation.** No `log.timing(...)` API. Only `info`, `warn`, `error`. Spec-research §3 keeps the API tight.

5. **Cross-device log correlation.** No device ID or install ID is logged. The user's email / username is the only stable identifier the support flow has, and it travels out-of-band (in the user's email body, not in the log file).

6. **Hashed user IDs.** Spec-research §3 considered logging hashed-but-deterministic IDs and rejected it. Counts and booleans only. *Rationale: a hash is still a stable token tied to the user; under the on-device-only privacy promise, the log file should be sharable to a stranger without revealing identity.*

7. **Server-side log ingestion.** The Railway server has no log-receive endpoint. The user emails the file; we read it manually. Future Tier 2 work could add ingestion; not in scope here.

8. **Multi-file rotation.** A single rolling file is used. No `.log.1`, `.log.2` archive. *Rationale: simpler, sufficient for a 200 KB cap (≈ thousands of events).*

9. **Encryption of the log file at rest.** iOS file protection already encrypts `documentDirectory` while the device is locked. The log file contains no credentials (by redaction); additional encryption would block the share-sheet flow.

10. **Log level configuration / filtering.** All three levels are always written. There is no `setLogLevel` API. *Rationale: avoids the trap where production turns off the logs you need to debug production.*

11. **Migrating existing `console.error` call sites.** Out of scope for this spec; tracked separately.

---

## Functional Requirements

### FR1 — Logger writes a single-line JSON event to the log file per `log.*` call

A call `log.info('auth.token_minted', { useQA: true })` results in (eventually, after buffer flush) exactly one new line appended to the log file. The line is valid JSON. The line ends with `\n`. The line contains the fields: `ts` (ISO 8601 string), `level` (`'info' | 'warn' | 'error'`), `category` (string, the first argument), and `meta` (object, the second argument after redaction). For `log.error`, an `errorClass` field is also present.

**Success criteria:**
- After `log.info('x.y', {a: 1})` and a manual `await log.flush()`, the log file contains exactly one line.
- The line parses as JSON and yields `{ts, level: 'info', category: 'x.y', meta: {a: 1}}`.
- The line ends with `\n`.
- After two `log.info` calls, the file contains exactly two `\n`-terminated lines.

### FR2 — Redactor strips deny-listed keys and scrubs credential-shaped values

The redactor (`src/lib/redact.ts`, exported as `redact(meta)`) takes a `Record<string, unknown>` and returns `Record<string, string | number | boolean>`. Behavior:

- Keys matching (case-insensitive substring) any of `password`, `pass`, `token`, `secret`, `auth` (matches `authorization`, `authToken`), `cookie`, `credential`, `username`, `user_name`, `email`, `firstname`, `lastname`, `fullname`, `displayname`, `memo`, `description`, `text`, `message`, `body`, `headers`, `serverText` are dropped entirely.
- The bare key `name` is dropped (matches `name`, `fullName`, `firstName`, `userName` — already covered, but defended explicitly).
- The bare key `id` and any key ending in `id`/`Id` (case-insensitive) is dropped — `userId`, `assignmentId`, `managerId`, `teamId`, `notificationId`, `identifier`. **Exception:** keys ending in `Count`, `count`, `Length`, `Size` are kept (e.g. `idCount` is kept; ambiguous but Counts/Lengths/Sizes are the safe shape). For absolute clarity, the implementation checks ending-with-`id` *or* ending-with-`Id` and excludes keys that contain `count`, `length`, `size`.
- Values that are not `string`, `number`, or `boolean` are dropped (objects, arrays, null, undefined).
- String values are scrubbed by additional pattern check:
  - Match `/^Basic\s+/i` → replaced with `'<basic-auth>'`.
  - Match `/^Bearer\s+/i` → replaced with `'<bearer-token>'`.
  - String length > 64 chars AND looks like base64 (`/^[A-Za-z0-9+/=]+$/`) → replaced with `'<redacted-base64>'`.
  - String matches `/^[A-Za-z0-9_\-]{32,}$/` (looks like a token) → replaced with `'<redacted-token>'`.
  - Otherwise kept as-is.

**Success criteria:**
- `redact({password: 'x', a: 1})` returns `{a: 1}`.
- `redact({authToken: 'abc', errorCode: 'CROS-001'})` returns `{errorCode: 'CROS-001'}`.
- `redact({userId: 123, count: 5})` returns `{count: 5}` (note: `count` kept, `userId` dropped).
- `redact({assignmentId: '79996', statusCode: 401})` returns `{statusCode: 401}`.
- `redact({header: 'Basic dXNlcjpwYXNz'})` returns `{header: '<basic-auth>'}`.
- `redact({field: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})` returns `{field: '<redacted-base64>'}` (64 a's, ≥ 64, base64 pattern matches).
- `redact({nested: {a: 1}})` returns `{}` (objects dropped).
- `redact({list: [1, 2]})` returns `{}` (arrays dropped).
- `redact({n: null, u: undefined, ok: true})` returns `{ok: true}`.
- `redact({})` returns `{}`.
- `redact({idCount: 5, userId: 2})` returns `{idCount: 5}` (the count/length/size exception keeps `idCount`).

### FR3 — `log.error(category, err, meta?)` captures the error class name but not the message

When called with an `Error` instance, `errorClass` is set to `err.constructor.name` (e.g. `'AuthError'`, `'ApiError'`, `'NetworkError'`, `'Error'`). The error's `.message` is never written. If `err` is a string, it is treated as the class name (`errorClass: err`) without any string scrubbing — callers passing strings are intentionally naming a class.

For `ApiError` / `AuthError` (from `src/api/errors.ts`), the logger does NOT automatically pull `errorCode`/`statusCode`/`errorType` from the error object; the caller is expected to pass them explicitly via `meta`. This keeps the redactor's job simple — every field comes through the same gate.

**Success criteria:**
- `log.error('api.failure', new Error('secret token leaked here'))` writes a line with `errorClass: 'Error'` and `meta: {}`. The string `'secret token leaked here'` does NOT appear anywhere in the file.
- `log.error('auth.failure', new AuthError(401, 'should not appear'))` writes `errorClass: 'AuthError'`, no message.
- `log.error('cat', 'CustomClass', {statusCode: 500})` writes `errorClass: 'CustomClass'`, `meta: {statusCode: 500}`.
- Passing an `Error` whose constructor is anonymous (`new class extends Error {}`) writes `errorClass: 'Error'` (or the class's `.name` if set) — defensive against weird subclasses; the redactor still drops `.message`.

### FR4 — Buffered writes flush within ~3 seconds or on explicit `flush()`

A call to `log.*` enqueues an event in an in-memory buffer and schedules a flush on a 3-second timer (using `setTimeout`). The flush appends all buffered events to the file in a single `writeAsStringAsync({append: true})` call. Subsequent `log.*` calls before the timer fires append to the same buffer; the timer is not reset. A call to `log.flush()` drains the buffer immediately and clears any pending timer.

**Success criteria:**
- `log.info('x', {a:1}); await log.flush();` → file contains one line.
- `log.info('x'); log.info('y'); await log.flush();` → file contains two lines, in order x then y.
- Without `flush()`, after 3.5 seconds, the file contains the events. *Tested with `jest.useFakeTimers()` + advance.*
- `log.flush()` while buffer is empty is a no-op (does not write an empty string, does not throw).

### FR5 — Log file is capped; oldest entries truncated when size exceeds 200 KB

After each flush, the logger checks the file size. If the size exceeds 200_000 bytes, the logger reads the file, splits on `\n`, drops lines from the start until the remaining content fits ~150_000 bytes (target: shrink to 75% of cap), and re-writes the file. The 75% target leaves headroom so rotation doesn't fire every flush.

**Success criteria:**
- With `MAX_BYTES=1000` and `TARGET_BYTES=750` (test overrides), writing ~1500 bytes of content triggers rotation; after rotation the file is ≤ 750 bytes and starts mid-stream with the most-recent lines.
- Rotation preserves complete lines (does not produce a half-line at the start of the rotated file).
- New writes after rotation append to the now-smaller file successfully.
- If the file does not exist when rotation is checked, no error is thrown.

### FR6 — Logger never throws; I/O failures are swallowed

Any failure from `FileSystem.writeAsStringAsync`, `getInfoAsync`, `readAsStringAsync`, or `deleteAsync` is caught inside the logger. The logger's promise still resolves (not rejects). The buffer is preserved across failures so events are not lost if the next flush succeeds. There is **no fallback to `console.log`** for swallowed errors — that would defeat the purpose (we are explicitly avoiding noise on a console no one reads). Instead, the logger maintains an internal `_lastWriteError` field readable for tests (or for the share-debug-log button to surface, future enhancement).

**Success criteria:**
- Mocking `FileSystem.writeAsStringAsync` to reject → `log.flush()` resolves (does not throw, does not reject).
- After a failed flush, the in-memory buffer still contains the events (or has been cleared deliberately — implementation choice; the success criterion is that the *next* successful flush writes all queued events including the failed-flush ones, OR drops them safely. **Decision: clear the buffer on failure to avoid unbounded memory growth on a permanent disk error.** Document this trade-off in the test.)
- `log.error('cat', new Error('boom'))` while disk is full → no throw, no app crash.
- `getInfoAsync` rejection (during rotation size-check) → flush still resolves.

### FR7 — `log.getLogFileUri()` returns a sharable URI

Returns the absolute `file://` URI of the log file. Calling this method ensures the file exists (creates it empty if absent) so the share sheet doesn't fail on a missing file. The returned URI ends in `hourglass-debug.log`.

**Success criteria:**
- `await log.getLogFileUri()` → string ending in `hourglass-debug.log`.
- Calling it on a fresh install (no prior log activity) creates the file as empty and returns its URI; `FileSystem.getInfoAsync(uri).exists` is true.

### FR8 — `log.clear()` empties the file and the in-memory buffer

Truncates the file to empty (overwrites with empty string; does NOT delete the file — keeps the path stable for future writes). Clears the in-memory buffer and cancels any pending flush timer.

**Success criteria:**
- After `log.info('x'); await log.clear(); await log.flush();` → file is empty (size 0).
- After clear, the file still exists at the expected path.
- The pending 3-second flush timer is cancelled by clear (verified via fake timers).

### FR9 — Settings modal exposes "Share debug log" and "Clear log" buttons

In `app/modal.tsx`, a new section labelled "Debug Log" is added between the Environment switcher and the Dev Options box. The section contains:
- A single description line: `"Export a privacy-redacted error log when reporting a bug."`
- Two buttons, side by side: `[ Share log ]` and `[ Clear log ]`.
- `Share log` button: calls `log.getLogFileUri()` then `Sharing.shareAsync(uri, { dialogTitle: 'Share debug log', mimeType: 'text/plain' })`. Wrap in try/catch — failures show an `Alert.alert('Could not share', 'Try again later.')`. *The user does not need to know why.*
- `Clear log` button: presents `Alert.alert('Clear log?', 'This removes all logged events from this device.', [Cancel, Clear])`. On confirm, calls `await log.clear()`.

The section is visible to **all users** (not gated behind `isMe` / dev-only). End-users are the primary audience.

**Success criteria:**
- Rendering `<ModalScreen />` shows a "Debug Log" section with both buttons.
- Tapping "Share log" calls `Sharing.shareAsync` with a URI ending in `hourglass-debug.log` and the documented options.
- Tapping "Clear log" → "Clear" in the alert → `log.clear()` was called.
- Tapping "Clear log" → "Cancel" in the alert → `log.clear()` was NOT called.
- Section is visible regardless of `isMe`.

### FR10 — Logger makes zero network calls

The logger module imports only `expo-file-system`. It does not import `fetch`, axios, or any other HTTP module. There is no `Sentry.captureException`, no `crashlytics().log()`. Verification is by import-graph: a unit test imports `src/lib/log.ts` and asserts the module's top-level imports do not include anything network-related.

**Success criteria:**
- Static check: `src/lib/log.ts` imports only `expo-file-system` (and `./redact`).
- Dynamic check: running a full `log.info` → `flush` cycle in a test where `global.fetch` is monkey-patched to a throwing stub does NOT trigger any fetch call.

---

## Technical Design

### Files to Reference

| File | Why |
|---|---|
| `src/api/errors.ts:1-49` | `AuthError`, `NetworkError`, `ApiError`, `ErrorEnvelope` definitions. Logger captures `err.constructor.name`; callers pass `errorCode`/`statusCode` via meta. |
| `src/api/client.ts:50-79` | `handleStatus` already parses the envelope. Future wiring: `handleStatus` calls `log.warn('api.error', err.constructor.name, { statusCode, errorCode, errorType })`. Not done in this spec. |
| `app/modal.tsx:18-232` | Settings modal. Insert "Debug Log" section between env-switcher and dev-options box (~line 190). |
| `package.json` | Add `expo-file-system` (~55.x), `expo-sharing` (~13.x). Use `npx expo install` to pin SDK-compatible versions. |
| `jest.config.js` | No changes needed. `expo-file-system` is mocked via the standard `expo` Jest preset; verify by running the new tests. |
| `__mocks__/` | New mock at `__mocks__/expo-file-system.ts` if jest-expo's mock is insufficient. Likely needed because we exercise `writeAsStringAsync`, `getInfoAsync`, `readAsStringAsync`, `deleteAsync`. |
| `features/app/resilience-fixes/specs/08-observability-log/spec-research.md` | Source of decisions (deny-list, file path, format, rotation policy). |
| `docs/ARCHITECTURE.md` §1, §5.5 | Privacy model (§1) — logger must respect on-device-only. Settings modal (§5.5) — placement context. |

### Files to Create / Modify

| File | Action | Summary |
|---|---|---|
| `src/lib/redact.ts` | **Create** | Pure function `redact(meta: Record<string, unknown>): Record<string, string | number | boolean>`. Implements FR2. No I/O, no deps. |
| `src/lib/log.ts` | **Create** | `Logger` class with `info/warn/error/flush/getLogFileUri/clear` methods; singleton export `log`. Implements FR1, FR3, FR4, FR5, FR6, FR7, FR8, FR10. |
| `app/modal.tsx` | Modify | Insert "Debug Log" section with Share / Clear buttons (FR9). |
| `__mocks__/expo-file-system.ts` | **Create** | In-memory mock with `writeAsStringAsync`, `getInfoAsync`, `readAsStringAsync`, `deleteAsync`, `documentDirectory`. Mirrors the SecureStore mock pattern (`_reset()` for test isolation). |
| `__mocks__/expo-sharing.ts` | **Create** | Mock with `shareAsync: jest.fn()` and `_reset()`. |
| `src/lib/__tests__/redact.test.ts` | **Create** | FR2 cases. Pure unit, no async. |
| `src/lib/__tests__/log.test.ts` | **Create** | FR1, FR3–FR8, FR10 cases. Uses fake timers for FR4 buffer flush. |
| `app/__tests__/modal-debug-log.test.tsx` | **Create** | FR9 cases. Renders the modal, taps buttons, asserts mock calls. |
| `package.json` | Modify | Add `expo-file-system`, `expo-sharing`. Bump after `npx expo install`. |

### Data Flow

```
Caller anywhere in the app
  │
  ├─ log.info('cat.subcat', {statusCode: 401, count: 3})
  │      │
  │      ▼
  │   logger.enqueue({level: 'info', category, meta: redact(meta)})
  │      │
  │      ▼
  │   buffer.push(event)
  │      │
  │      ├─ if !flushTimer → setTimeout(flush, 3000)
  │      └─ if buffer.length >= 100 → flush immediately   [overflow guard]
  │
  ▼
3 s elapses (or log.flush() called)
  │
  ▼
flush():
  │
  ├─ events = buffer.splice(0)
  ├─ payload = events.map(JSON.stringify).join('\n') + '\n'
  ├─ try { FileSystem.writeAsStringAsync(LOG_PATH, payload, {append: true}) }
  │   catch { _lastWriteError = e; return /* swallow */ }
  ├─ rotate(): check size, if > MAX_BYTES → read, drop lines from start until ≤ TARGET, rewrite
  │   catch { _lastWriteError = e; return /* swallow */ }
  └─ flushTimer = null

User taps "Share log" in settings
  │
  ▼
uri = await log.getLogFileUri()   // ensures file exists
  │
  ▼
await Sharing.shareAsync(uri, { dialogTitle, mimeType: 'text/plain' })
  │
  └─ iOS share sheet appears; user picks Mail / Files / AirDrop / ...
```

### Redaction Examples

```typescript
redact({
  username: 'alice',          // dropped — substring 'user' matches deny-list (also 'name')
  password: 'hunter2',        // dropped — exact match
  authToken: 'Bearer xyz',    // dropped — 'auth' substring matches
  userId: 12345,              // dropped — ends in 'Id'
  statusCode: 401,            // kept
  errorCode: 'CROS-1234',     // kept
  errorType: 'BadCredentials',// kept
  tokenRetried: true,         // dropped — 'token' substring matches
  retried: true,              // kept
  newCount: 3,                // kept
  newIdsCount: 3,             // kept — count exception
})
// => { statusCode: 401, errorCode: 'CROS-1234', errorType: 'BadCredentials', retried: true, newCount: 3, newIdsCount: 3 }
```

Note: `tokenRetried` is dropped even though it's a meaningful debug field, because `token` is in the deny-list. The fix is to rename the field on the call site to `retried` (semantic equivalence, no PII risk).

### Edge Cases

| Case | Handling | Where covered |
|---|---|---|
| `log.info` with no meta | Pass `meta: {}`. | FR1 |
| `log.info` with `meta: undefined` | Treat as `{}` — defensive. | FR1 |
| Meta contains `meta: { a: 1 }` (nested) | Nested objects dropped by redactor. | FR2 |
| Meta key is a number (e.g. `{0: 'x'}`) | JS coerces to string keys; redactor runs on string keys; numeric-string keys are kept if they don't match deny-list. Edge case but handled. | FR2 |
| Empty buffer flush | No-op — does not write empty file. | FR4 |
| Two `flush()` calls in flight | Both await the same internal write promise; safe. | FR4 |
| `log.clear()` while a flush is pending | Cancel timer, clear buffer, then overwrite file. Pending events are lost (acceptable — user explicitly asked to clear). | FR8 |
| `getLogFileUri()` on first call ever | Creates empty file at `documentDirectory + 'hourglass-debug.log'`, returns URI. | FR7 |
| Disk full → `writeAsStringAsync` rejects | Swallowed, `_lastWriteError` set, buffer cleared, next flush proceeds. | FR6 |
| File corrupted (binary garbage) during rotation | `readAsStringAsync` may return bytes that don't split cleanly on `\n`. `lines.slice(midpoint)` still produces something; the file shrinks. The downside (a few corrupted lines remain) is acceptable. | FR5 |
| App backgrounded mid-flush | iOS may suspend the JS runtime. The `writeAsStringAsync` may or may not complete. On next foreground, the buffer has been cleared (events scheduled before background lost). Acceptable — logs are best-effort. | FR4, FR6 |
| Concurrent `log.error` from two stack frames | JavaScript is single-threaded; sequential. Both events end up in buffer in call order. | FR1 |
| `Sharing.shareAsync` not available (Android) | Out of scope (iOS-only app). If invoked on a hypothetical Android target, the catch in `app/modal.tsx` shows the generic Alert. | FR9 |
| Modal rendered while `log.getLogFileUri()` is in flight | Button tap awaits; double-tap is guarded by React Native's natural event coalescing. No explicit lock. | FR9 |
| Test runs in parallel and writes to the same mock file | Mock is per-module; jest isolates modules per worker. The `_reset()` helper clears the mock between tests. | testing |

### Constants

```typescript
// src/lib/log.ts
const LOG_FILENAME = 'hourglass-debug.log';
const MAX_BYTES = 200_000;
const TARGET_BYTES = 150_000;   // after rotation
const FLUSH_INTERVAL_MS = 3000;
const BUFFER_OVERFLOW = 100;    // flush immediately at 100 buffered events
```

### Type Sketch

```typescript
// src/lib/log.ts
type LogLevel = 'info' | 'warn' | 'error';

interface LogEvent {
  ts: string;
  level: LogLevel;
  category: string;
  errorClass?: string;
  meta: Record<string, string | number | boolean>;
}

class Logger {
  private buffer: LogEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastWriteError: unknown = null;

  info(category: string, meta?: Record<string, unknown>): void;
  warn(category: string, meta?: Record<string, unknown>): void;
  error(category: string, errOrClass: Error | string, meta?: Record<string, unknown>): void;
  flush(): Promise<void>;
  getLogFileUri(): Promise<string>;
  clear(): Promise<void>;
}

export const log: Logger;
```

```typescript
// src/lib/redact.ts
export function redact(meta: Record<string, unknown>): Record<string, string | number | boolean>;
```
