// Spec 08-observability-log: local rolling error log.
//
// Privacy contract:
//   - Writes JSONL events to a single file in documentDirectory.
//   - Redacts every meta payload at write time (no message text, no IDs,
//     no credentials; see ./redact).
//   - Captures Error class names, never .message.
//   - No automatic transmission. The user invokes share via the Settings
//     modal's "Share log" button (see app/modal.tsx).
//   - This module imports only expo-file-system/legacy and ./redact. There
//     is no fetch, no Sentry, no Crashlytics — verified by FR10 tests.

import * as FileSystem from 'expo-file-system/legacy';
import { redact } from './redact';

const LOG_FILENAME = 'hourglass-debug.log';
const FLUSH_INTERVAL_MS = 3000;
const BUFFER_OVERFLOW = 100;

// Mutable for the test hook __setRotationLimits.
let MAX_BYTES = 200_000;
let TARGET_BYTES = 150_000;

type LogLevel = 'info' | 'warn' | 'error';

interface LogEvent {
  ts: string;
  level: LogLevel;
  category: string;
  errorClass?: string;
  meta: Record<string, string | number | boolean>;
}

function logFileUri(): string {
  return `${FileSystem.documentDirectory ?? ''}${LOG_FILENAME}`;
}

class Logger {
  private buffer: LogEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastWriteError: unknown = null;

  /** Append an info-level event; redacts meta; schedules a flush. */
  info(category: string, meta?: Record<string, unknown>): void {
    this.enqueue({
      ts: new Date().toISOString(),
      level: 'info',
      category,
      meta: redact(meta ?? {}),
    });
  }

  /** Append a warn-level event; redacts meta; schedules a flush. */
  warn(category: string, meta?: Record<string, unknown>): void {
    this.enqueue({
      ts: new Date().toISOString(),
      level: 'warn',
      category,
      meta: redact(meta ?? {}),
    });
  }

  /**
   * Append an error-level event. Captures the error class name only —
   * `.message` is never written. Pass `errOrClass` as either an Error
   * instance (we read `.constructor.name`) or a string (used verbatim
   * as the class).
   */
  error(
    category: string,
    errOrClass: Error | string,
    meta?: Record<string, unknown>
  ): void {
    let errorClass: string;
    if (typeof errOrClass === 'string') {
      errorClass = errOrClass;
    } else {
      errorClass = errOrClass?.constructor?.name || 'Error';
    }
    this.enqueue({
      ts: new Date().toISOString(),
      level: 'error',
      category,
      errorClass,
      meta: redact(meta ?? {}),
    });
  }

  /** Drain the in-memory buffer to disk. Never throws — I/O errors are swallowed. */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0, this.buffer.length);
    const payload = events.map((e) => JSON.stringify(e)).join('\n') + '\n';

    try {
      await FileSystem.writeAsStringAsync(logFileUri(), payload, {
        encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
        append: true,
      } as Parameters<typeof FileSystem.writeAsStringAsync>[2]);
    } catch (e) {
      this._lastWriteError = e;
      return;
    }

    try {
      await this.rotateIfNeeded();
    } catch (e) {
      this._lastWriteError = e;
    }
  }

  /**
   * Ensures the log file exists (creating it empty if absent) and returns
   * its `file://`-shaped absolute URI for handing to the share sheet.
   */
  async getLogFileUri(): Promise<string> {
    const uri = logFileUri();
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        await FileSystem.writeAsStringAsync(uri, '', {
          encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
        } as Parameters<typeof FileSystem.writeAsStringAsync>[2]);
      }
    } catch (e) {
      this._lastWriteError = e;
    }
    return uri;
  }

  /**
   * Empty the log file (overwrite with empty string) and discard any
   * buffered events. The file path remains valid for future writes.
   */
  async clear(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = [];
    try {
      await FileSystem.writeAsStringAsync(logFileUri(), '', {
        encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
      } as Parameters<typeof FileSystem.writeAsStringAsync>[2]);
    } catch (e) {
      this._lastWriteError = e;
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  private enqueue(event: LogEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= BUFFER_OVERFLOW) {
      // Drain immediately to avoid unbounded memory.
      void this.flush();
      return;
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        void this.flush();
      }, FLUSH_INTERVAL_MS);
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    const uri = logFileUri();
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return;
    const size = (info as { size?: number }).size ?? 0;
    if (size <= MAX_BYTES) return;

    const content = await FileSystem.readAsStringAsync(uri);
    const lines = content.split('\n');
    // Drop oldest lines until cumulative size from the right is <= TARGET_BYTES.
    let kept: string[] = [];
    let cumulative = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(lines[i], 'utf8') + 1; // +1 for \n
      if (cumulative + lineBytes > TARGET_BYTES) break;
      cumulative += lineBytes;
      kept.unshift(lines[i]);
    }
    // Drop a leading empty line if it appears (artefact of split on trailing \n).
    while (kept.length > 0 && kept[0] === '') kept.shift();
    const rewritten = kept.length > 0 ? kept.join('\n') + (kept[kept.length - 1] === '' ? '' : '\n') : '';

    await FileSystem.writeAsStringAsync(uri, rewritten, {
      encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
    } as Parameters<typeof FileSystem.writeAsStringAsync>[2]);
  }
}

/** Singleton — import as `import { log } from '@/src/lib/log';`. */
export const log = new Logger();

/**
 * @internal — test hook. Allows the rotation suite to lower MAX_BYTES /
 * TARGET_BYTES without writing 200 KB of payload. Do not call from
 * production code.
 */
export function __setRotationLimits(max: number, target: number): void {
  MAX_BYTES = max;
  TARGET_BYTES = target;
}
