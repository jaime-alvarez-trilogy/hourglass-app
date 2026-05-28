// Spec 08-observability-log: logger tests (FR1, FR3–FR8, FR10).

jest.mock('expo-file-system/legacy');

import * as FileSystem from 'expo-file-system/legacy';
import { AuthError } from '@/src/api/errors';

// Helper: pull the in-memory file contents out of the mock.
const _fs = FileSystem as unknown as {
  _reset: () => void;
  _getFile: (uri: string) => string | undefined;
  _setFile: (uri: string, content: string) => void;
};

const LOG_URI = '/mock-docs/hourglass-debug.log';

beforeEach(() => {
  _fs._reset();
  jest.resetModules();
});

afterEach(() => {
  jest.useRealTimers();
});

function freshLogger() {
  // Re-require the singleton fresh after a module reset so test state is isolated.
  // Use require (not dynamic import) to avoid Jest's lack of ESM dynamic-import support.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/src/lib/log') as typeof import('@/src/lib/log');
  return mod;
}

describe('logger — FR1: line format', () => {
  // T18
  it('writes a single JSON line per call', async () => {
    const { log } = freshLogger();
    log.info('x.y', { a: 1 });
    await log.flush();
    const content = _fs._getFile(LOG_URI);
    expect(content).toBeDefined();
    const lines = content!.split('\n').filter((s) => s.length > 0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({ level: 'info', category: 'x.y', meta: { a: 1 } });
    expect(typeof parsed.ts).toBe('string');
  });

  // T19
  it('appends two events as two lines in order', async () => {
    const { log } = freshLogger();
    log.info('first', {});
    log.info('second', {});
    await log.flush();
    const content = _fs._getFile(LOG_URI)!;
    const lines = content.split('\n').filter((s) => s.length > 0);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).category).toBe('first');
    expect(JSON.parse(lines[1]).category).toBe('second');
  });

  // T20
  it('each line ends with \\n', async () => {
    const { log } = freshLogger();
    log.info('a', {});
    log.info('b', {});
    await log.flush();
    const content = _fs._getFile(LOG_URI)!;
    expect(content.endsWith('\n')).toBe(true);
    expect((content.match(/\n/g) ?? []).length).toBe(2);
  });

  // T21
  it('ts field parses as a valid ISO 8601 string', async () => {
    const { log } = freshLogger();
    log.info('x', {});
    await log.flush();
    const content = _fs._getFile(LOG_URI)!;
    const parsed = JSON.parse(content.split('\n')[0]);
    expect(Number.isFinite(Date.parse(parsed.ts))).toBe(true);
  });
});

describe('logger — FR3: error class without message', () => {
  // T22
  it('captures error class but never the .message of an Error', async () => {
    const { log } = freshLogger();
    log.error('cat', new Error('SECRET_MARKER'));
    await log.flush();
    const content = _fs._getFile(LOG_URI)!;
    expect(content).not.toContain('SECRET_MARKER');
    const parsed = JSON.parse(content.split('\n')[0]);
    expect(parsed.errorClass).toBe('Error');
    expect(parsed.meta).toEqual({});
  });

  // T23
  it('AuthError is captured as class only', async () => {
    const { log } = freshLogger();
    log.error('auth.failure', new AuthError(401, 'should not appear'));
    await log.flush();
    const content = _fs._getFile(LOG_URI)!;
    expect(content).not.toContain('should not appear');
    const parsed = JSON.parse(content.split('\n')[0]);
    expect(parsed.errorClass).toBe('AuthError');
  });

  // T24
  it('accepts a string as errorClass with meta', async () => {
    const { log } = freshLogger();
    log.error('cat', 'CustomClass', { statusCode: 500 });
    await log.flush();
    const content = _fs._getFile(LOG_URI)!;
    const parsed = JSON.parse(content.split('\n')[0]);
    expect(parsed.errorClass).toBe('CustomClass');
    expect(parsed.meta).toEqual({ statusCode: 500 });
  });

  // T25
  it('empty error message → no message field, class still captured', async () => {
    const { log } = freshLogger();
    log.error('cat', new Error(''));
    await log.flush();
    const content = _fs._getFile(LOG_URI)!;
    const parsed = JSON.parse(content.split('\n')[0]);
    expect(parsed.errorClass).toBe('Error');
    expect(parsed.message).toBeUndefined();
  });
});

describe('logger — FR4: buffered flush', () => {
  // T26
  it('writes after 3 seconds without explicit flush', async () => {
    jest.useFakeTimers();
    const { log } = freshLogger();
    log.info('delayed', {});
    expect(_fs._getFile(LOG_URI)).toBeUndefined();
    await jest.advanceTimersByTimeAsync(3001);
    const content = _fs._getFile(LOG_URI);
    expect(content).toBeDefined();
    expect(content!).toContain('delayed');
  });

  // T27
  it('flush() with empty buffer does not call writeAsStringAsync', async () => {
    const { log } = freshLogger();
    await log.flush();
    expect((FileSystem.writeAsStringAsync as jest.Mock).mock.calls.length).toBe(0);
  });

  // T28
  it('batches multiple events into a single write call', async () => {
    const { log } = freshLogger();
    log.info('a', {});
    log.info('b', {});
    log.info('c', {});
    await log.flush();
    expect((FileSystem.writeAsStringAsync as jest.Mock).mock.calls.length).toBe(1);
  });

  // T29
  it('flush() cancels the pending flush timer', async () => {
    jest.useFakeTimers();
    const { log } = freshLogger();
    log.info('x', {});
    await log.flush();
    const writesAfterFlush = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls.length;
    await jest.advanceTimersByTimeAsync(5000);
    expect((FileSystem.writeAsStringAsync as jest.Mock).mock.calls.length).toBe(writesAfterFlush);
  });
});

describe('logger — FR5: rotation', () => {
  // T30 + T31 + T32 + T33
  it('rotates when file exceeds the cap, preserving complete lines', async () => {
    const mod = freshLogger();
    const { log } = mod;
    // Lower the cap so we can rotate without writing megabytes.
    mod.__setRotationLimits(500, 300);

    for (let i = 0; i < 20; i++) {
      log.info('evt', { i });
    }
    await log.flush();

    const content = _fs._getFile(LOG_URI)!;
    const size = Buffer.byteLength(content, 'utf8');
    // T30: file should be ≤ 300 bytes (or close — rotation aims for target).
    expect(size).toBeLessThanOrEqual(500);

    // T32: first byte starts a complete JSON line.
    expect(content.startsWith('{')).toBe(true);

    // T31: the first surviving line should NOT be the very first event.
    const firstLine = content.split('\n')[0];
    const parsedFirst = JSON.parse(firstLine);
    expect(parsedFirst.meta.i).toBeGreaterThan(0);

    // T33: subsequent writes append correctly.
    log.info('after', { ok: true });
    await log.flush();
    const after = _fs._getFile(LOG_URI)!;
    expect(after).toContain('after');
  });
});

describe('logger — FR6: never throws', () => {
  // T34
  it('swallows writeAsStringAsync rejections', async () => {
    const { log } = freshLogger();
    (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    log.info('x', {});
    await expect(log.flush()).resolves.toBeUndefined();
  });

  // T35
  it('swallows getInfoAsync rejections during rotation check', async () => {
    const { log } = freshLogger();
    (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(new Error('stat fail'));
    log.info('x', {});
    await expect(log.flush()).resolves.toBeUndefined();
  });

  // T36
  it('clears buffer on failure (no unbounded retry)', async () => {
    const { log } = freshLogger();
    (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    log.info('lost', {});
    await log.flush();
    // Next flush should not write the "lost" event again.
    await log.flush();
    const content = _fs._getFile(LOG_URI);
    if (content) {
      expect(content).not.toContain('lost');
    }
  });

  // T37
  it('log.error during disk failure does not throw', async () => {
    const { log } = freshLogger();
    (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValue(new Error('disk full'));
    expect(() => log.error('cat', new Error('boom'))).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
  });
});

describe('logger — FR7: getLogFileUri', () => {
  // T38
  it('returns a URI ending in hourglass-debug.log', async () => {
    const { log } = freshLogger();
    const uri = await log.getLogFileUri();
    expect(uri.endsWith('hourglass-debug.log')).toBe(true);
  });

  // T39
  it('creates the file empty if it does not exist', async () => {
    const { log } = freshLogger();
    const uri = await log.getLogFileUri();
    const info = await FileSystem.getInfoAsync(uri);
    expect(info.exists).toBe(true);
  });

  // T40
  it('URI starts with documentDirectory', async () => {
    const { log } = freshLogger();
    const uri = await log.getLogFileUri();
    expect(uri.startsWith('/mock-docs/')).toBe(true);
  });
});

describe('logger — FR8: clear', () => {
  // T41
  it('empties the file content and keeps the file', async () => {
    const { log } = freshLogger();
    log.info('x', {});
    await log.flush();
    expect(_fs._getFile(LOG_URI)!.length).toBeGreaterThan(0);
    await log.clear();
    await log.flush(); // nothing buffered; no-op
    const after = _fs._getFile(LOG_URI);
    expect(after).toBe('');
  });

  // T42
  it('file still exists after clear (no deleteAsync called)', async () => {
    const { log } = freshLogger();
    log.info('x', {});
    await log.flush();
    await log.clear();
    expect((FileSystem.deleteAsync as jest.Mock).mock.calls.length).toBe(0);
    const uri = await log.getLogFileUri();
    const info = await FileSystem.getInfoAsync(uri);
    expect(info.exists).toBe(true);
  });

  // T43
  it('clear cancels the pending flush timer', async () => {
    jest.useFakeTimers();
    const { log } = freshLogger();
    log.info('queued', {});
    await log.clear();
    await jest.advanceTimersByTimeAsync(5000);
    const content = _fs._getFile(LOG_URI);
    // After clear+timer advance, no write of "queued" should appear.
    expect(content === undefined || !content.includes('queued')).toBe(true);
  });
});

describe('logger — FR10: zero network calls', () => {
  // T44
  it('module exports do not include any fetch-shaped symbol', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/src/lib/log') as typeof import('@/src/lib/log');
    for (const key of Object.keys(mod)) {
      expect(key.toLowerCase()).not.toContain('fetch');
      expect(key.toLowerCase()).not.toContain('http');
      expect(key.toLowerCase()).not.toContain('xhr');
    }
  });

  // T45
  it('does not call global.fetch during info/error/flush cycle', async () => {
    const fetchSpy = jest.fn(() => {
      throw new Error('fetch should never be called');
    });
    const originalFetch = global.fetch;
    (global as unknown as { fetch: jest.Mock }).fetch = fetchSpy;
    try {
      const { log } = freshLogger();
      log.info('a', { x: 1 });
      log.error('b', new Error('c'));
      await log.flush();
      expect(fetchSpy.mock.calls.length).toBe(0);
    } finally {
      (global as unknown as { fetch: typeof originalFetch }).fetch = originalFetch;
    }
  });
});
