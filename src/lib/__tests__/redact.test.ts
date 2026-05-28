// Spec 08-observability-log FR2: redaction tests.

import { redact } from '@/src/lib/redact';

describe('redact', () => {
  // T1
  it('returns {} for empty input', () => {
    expect(redact({})).toEqual({});
  });

  // T2
  it('keeps primitive values with safe keys', () => {
    expect(redact({ a: 1, b: true, c: 'ok' })).toEqual({ a: 1, b: true, c: 'ok' });
  });

  // T3
  it('drops password key', () => {
    expect(redact({ password: 'x', a: 1 })).toEqual({ a: 1 });
  });

  // T4
  it('drops password-shaped keys case-insensitively', () => {
    expect(redact({ Password: 'x', PASS: 'y', a: 1 })).toEqual({ a: 1 });
  });

  // T5
  it('drops keys with auth substring (token + authorization)', () => {
    expect(redact({ authToken: 'abc', authorization: 'def', a: 1 })).toEqual({ a: 1 });
  });

  // T6
  it('drops keys ending in Id (userId, assignmentId, notificationId)', () => {
    const out = redact({ userId: 1, assignmentId: '2', notificationId: 'x', a: 1 });
    expect(out).toEqual({ a: 1 });
  });

  // T7
  it('keeps count/length/size keys even when they end in Id-ish suffixes', () => {
    const out = redact({ idCount: 5, idLength: 3, idSize: 2 });
    expect(out).toEqual({ idCount: 5, idLength: 3, idSize: 2 });
  });

  // T8
  it('drops username, email, fullName', () => {
    expect(redact({ username: 'x', email: 'y@z', fullName: 'a b' })).toEqual({});
  });

  // T9
  it('drops memo, description, text, message', () => {
    expect(redact({ memo: 'x', description: 'y', text: 'z', message: 'w' })).toEqual({});
  });

  // T10
  it('drops body, headers, cookie, secret', () => {
    expect(redact({ body: 'x', headers: 'y', cookie: 'z', secret: 'w' })).toEqual({});
  });

  // T11
  it('scrubs Basic auth strings', () => {
    expect(redact({ header: 'Basic dXNlcjpwYXNz' })).toEqual({ header: '<basic-auth>' });
  });

  // T12
  it('scrubs Bearer token strings', () => {
    expect(redact({ h: 'Bearer xyz123' })).toEqual({ h: '<bearer-token>' });
  });

  // T13
  it('scrubs long base64-shaped values', () => {
    const longBase64 = 'A'.repeat(80);
    expect(redact({ field: longBase64 })).toEqual({ field: '<redacted-base64>' });
  });

  // T14
  it('scrubs token-shaped values (32+ word chars)', () => {
    expect(redact({ field: 'a_token_like_abcdefghij1234567890_ABCDEFGHIJKLMNOP' })).toEqual({
      field: '<redacted-token>',
    });
  });

  // T15
  it('drops non-primitive values (object, array, null, undefined)', () => {
    expect(
      redact({
        nested: { a: 1 },
        arr: [1, 2],
        n: null as unknown,
        u: undefined as unknown,
      })
    ).toEqual({});
  });

  // T16
  it('passes the canonical safe payload verbatim', () => {
    const safe = {
      errorCode: 'CROS-1234',
      statusCode: 401,
      errorType: 'X',
      ok: true,
      count: 3,
    };
    expect(redact(safe)).toEqual(safe);
  });

  // T17
  it('drops tokenRetried (substring token matches) — documents rename policy', () => {
    expect(redact({ tokenRetried: true })).toEqual({});
  });

  // Extra: drops bigint, symbol, function values
  it('drops exotic primitive-ish values (bigint, symbol, function)', () => {
    expect(
      redact({
        big: BigInt(1) as unknown,
        sym: Symbol('s') as unknown,
        fn: (() => 1) as unknown,
        ok: true,
      })
    ).toEqual({ ok: true });
  });
});
