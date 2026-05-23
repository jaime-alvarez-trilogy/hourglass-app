# Spec 08 — Local error log + user-controlled export

**Status:** Research complete
**Complexity:** M
**Replaces:** what would normally be Sentry / Crashlytics. Tier 1 of the privacy-preserving observability plan (FEATURE.md §"verification strategy").

## Problem context

The app intentionally has no automatic phone-home telemetry — credentials live on-device only, the Railway server never sees user data. Standard observability tools (Sentry, Crashlytics, Mixpanel) violate that model because they automatically transmit error details.

But we need *some* signal when things go wrong. Today:
- Errors `console.error` to a console no one reads.
- A bug report from a user (e.g. "I got a JSON parse error") gives us nothing but the user's recollection.
- Specs 03–07 introduce new behaviors (token retry, dedup, sweep, etc.) — without logs, we can't tell if they're working in the field.

## The plan

Write errors to a local file. Provide a "Share debug log" button. User exports manually when they want to report a bug; we get a rich error trail; no automatic transmission.

This is consciously the *opposite* of a typical crash reporter — events go nowhere unless the user pushes a button.

## Exploration findings

- `expo-file-system` is used elsewhere in the project (verify; if not present, it's a small dep add).
- `expo-sharing` provides cross-platform share sheet (verify presence; small dep if not).
- React Native `Alert` provides simple "are you sure?" dialogs.
- Settings is accessed via `app/modal.tsx` (already has dev toggles). New button goes there.
- The existing error classes (`AuthError`, `NetworkError`, `ApiError`, plus new `NotContributorError` from spec 05) all extend `Error` with extra fields. Logger captures the class name + safe fields.

## Key decisions

**1. JSONL format, one event per line.** Easy to read, easy to tail, easy to grep when shared.

**2. Rolling file, ~200 KB cap.** When the file exceeds the cap, truncate from the start (keep the most recent). Avoids unbounded disk growth.

**3. Redact at write time, not at export time.** It is too easy to forget redaction on a code path. Write the safe payload only.

Safe fields to log:
- Timestamp (ISO 8601 local time)
- Event type / category (auth.token_retry, push.dedup_decision, notif.orphan_swept, etc.)
- Error class name (AuthError, ApiError, etc.) — no message
- API error metadata: `statusCode`, `errorCode` (CROS-XXXX), `errorType`, `httpStatus`
- App version, build number, platform (iOS/Android), iOS version
- Counts and booleans (e.g. `newApprovalCount: 2`, `tokenRetried: true`)

Never logged:
- Username, email, password, token
- Approval item details (`name`, `memo`, `description`)
- Crossover IDs are borderline — log hashed-but-deterministic? Or skip? **Decision: skip user-identifying IDs entirely.** Counts and booleans only.
- Stack traces with file paths from third-party libs (small fingerprint OK; full traces no).

**4. Synchronous-ish logging via a queue.** Don't block the calling code on file I/O. Push events to an in-memory buffer; flush every few seconds or on app background.

**5. Logger is a singleton.** Single instance imported anywhere via `src/lib/log.ts`. Functions: `log.info(category, payload)`, `log.warn(category, payload)`, `log.error(category, errClass, payload)`. Callers decide category.

**6. Export uses `expo-sharing.shareAsync(fileUri)`.** User picks Mail / Files / etc. We don't email it ourselves.

**7. "Clear log" button next to "Share log".** User can wipe before sharing if they want.

**8. Surface in Settings modal, not Onboarding.** This is debug functionality; it lives next to dev toggles.

## Interface contracts

### `src/lib/log.ts` (new)

```typescript
type LogLevel = 'info' | 'warn' | 'error';

interface LogEvent {
  ts: string;             // ISO 8601 local
  level: LogLevel;
  category: string;       // e.g. 'auth.token_retry'
  errorClass?: string;    // e.g. 'AuthError'
  meta: Record<string, string | number | boolean>;
}

class Logger {
  private buffer: LogEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  info(category: string, meta?: Record<string, ...>): void;
  warn(category: string, meta?: Record<string, ...>): void;
  error(category: string, errOrClass: Error | string, meta?: Record<string, ...>): void;

  async getLogFileUri(): Promise<string>;
  async clear(): Promise<void>;
}

export const log = new Logger();
```

### File path

```typescript
const LOG_FILE = `${FileSystem.documentDirectory}hourglass-debug.log`;
const MAX_BYTES = 200_000;
```

### Settings modal addition

```typescript
// in app/modal.tsx, near dev toggles
<Pressable onPress={async () => {
  const uri = await log.getLogFileUri();
  await Sharing.shareAsync(uri, { dialogTitle: 'Share debug log', mimeType: 'text/plain' });
}}>
  <Text>Share debug log</Text>
</Pressable>
<Pressable onPress={async () => {
  const ok = await confirm('Clear debug log?');
  if (ok) await log.clear();
}}>
  <Text>Clear debug log</Text>
</Pressable>
```

### Call sites (from other specs)

| Spec | Category | Meta logged |
|---|---|---|
| 03 | `api.error_envelope` | `statusCode`, `errorCode`, `errorType` |
| 04 | `auth.token_minted` | (no meta) |
| 04 | `auth.token_retried` | `triggerStatusCode` |
| 04 | `auth.html_500_detected` | `statusCode`, `contentType` |
| 05 | `onboarding.not_contributor` | `avatarTypesCount`, `hasAssignment: false` |
| 05 | `onboarding.assignments_fallback_used` | `contentCount` |
| 06 | `push.bg_refresh_handled` | `prevIdsCount`, `currentIdsCount`, `newIdsCount`, `notificationFired: bool` |
| 07 | `notif.scheduled` | `identifier` |
| 07 | `notif.orphan_swept` | `identifier` (just the part after `hourglass:`) |
| 07 | `notif.lock_not_acquired` | (no meta) |

Each call site is one line of added code: `log.info('push.bg_refresh_handled', {prevIdsCount, currentIdsCount, newIdsCount, notificationFired})`.

## Test plan

### Unit tests (`__tests__/log.test.ts`, new)

**Logger basics:**
- [ ] `log.info('x', {a: 1})` appends a line to the file.
- [ ] Multiple events appear as separate JSONL lines.
- [ ] Buffer flush happens within ~5s without explicit call.
- [ ] Calling `flush()` directly drains buffer immediately.
- [ ] Logger never throws (file system error → swallowed; we don't crash the app to write a log).

**Redaction:**
- [ ] Passing `{username: 'x', password: 'y'}` in meta → keys are stripped before write. (Defense in depth — callers shouldn't pass these, but if they do, the log still scrubs.)
- [ ] `log.error('cat', new Error('with secret'))` → error class captured, message not.

**Rotation:**
- [ ] When file exceeds 200KB, the oldest lines are truncated, file shrinks to ~150KB.
- [ ] After rotation, new logs append to the now-smaller file.

**Export:**
- [ ] `getLogFileUri()` returns a string ending in `hourglass-debug.log`.
- [ ] File exists at that path after at least one log call.

**Clear:**
- [ ] `log.clear()` empties the file but keeps the file present.

### Live-QA probe extension

Not applicable.

### TestFlight scenario

- [ ] Sign in, do some normal actions for 5 minutes. Open Settings → Share debug log → email to self. Verify the log has reasonable entries (login event, refreshes, etc.) and no PII.
- [ ] Trigger a deliberate error (sign in with wrong password). Verify log contains an `auth.failure` or similar event. Email log; confirm no password leaked.

### Self-verification on every other spec

- [ ] Spec 03 implementation: when `ApiError` is thrown with envelope, `api.error_envelope` event is logged.
- [ ] Spec 04: `auth.token_retried` fires on 401 → retry.
- [ ] Spec 06: `push.bg_refresh_handled` fires on every silent push receive.
- [ ] Spec 07: `notif.orphan_swept` fires on every cold app launch where orphans were cancelled.

## Files to reference

| File | Why |
|---|---|
| `src/lib/log.ts` | **New file** — the logger. |
| `app/modal.tsx` | Settings modal — add Share / Clear buttons. |
| `package.json` | May need `expo-file-system`, `expo-sharing` dependencies. Check current state first. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit | ✓ | New `__tests__/log.test.ts`. |
| Live-QA probe | ✗ | No API contact. |
| TestFlight | ✓ | Scenarios above. |
| Error log | n/a (this *is* the error log) | — |

## Risks

- **Disk pressure on long-lived installs.** 200KB cap with rotation handles this. If the cap turns out to be too small or too large, easy to tune.
- **User shares unredacted info via screenshot.** Out of our control. The redaction we promise is for the log file; users sharing other parts of the app is on them.
- **Performance.** Logging on every API call could be noisy. Decide categories carefully — only log decisions and errors, not "I made a request." This keeps log size manageable and signal-to-noise high.
- **The categories chosen here are starting points.** Specs that come after may add more. The logger is general-purpose; new categories don't require code changes.

## Out of scope (deferred to later if needed)

- Automatic phone-home (Sentry style). Tier 2/3 in FEATURE.md.
- Crash detection (native crashes — not JS exceptions). Would require integration with iOS crash reporting; out of scope for this feature.
- Performance metrics (timings). Could be added later; not needed for the current fixes.
