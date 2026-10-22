/**
 * features/app/durable-data spec 01-auth-renewal FR3 — the shared query retry policy.
 *
 * `isRetryableError` decides whether a failure is an outage (retry) or a credential
 * problem (never retry). `shouldRetryQuery` adds the two-retry cap
 * (`MAX_QUERY_RETRIES`, today's `retry: 2`) for spec 02; spec 03 uses the classifier
 * directly in a one-retry form (today's `retry: 1`); spec 05's backfill stop rule uses
 * the classifier too.
 *
 * Everything is imported from src/api/errors, which also pins the exports. No mocks:
 * the error classes are real, and the last block runs the rules through a real
 * TanStack QueryClient to pin its `failureCount` semantics (0 on the first failure).
 * Client-thrown errors under the same predicate are covered in auth-resilience.test.ts
 * (DD1.18-DD1.20).
 */

import { QueryClient } from '@tanstack/react-query';

import {
  ApiError,
  AuthError,
  AUTH_HTML_500,
  AUTH_LOGIN_LATCHED,
  HTML_5XX_AFTER_RENEWAL,
  isRetryableError,
  MAX_QUERY_RETRIES,
  NetworkError,
  NO_CREDENTIALS,
  shouldRetryQuery,
} from '../../api/errors';

// The wire strings are written out (not the constants) so a classifier bug and a
// constant bug cannot cancel each other out. FR3.a pins the constants separately.
const networkError = () => new NetworkError('Network request failed');
const htmlTokenRejected = () =>
  new AuthError(401, undefined, {
    errorCode: 'AUTH_HTML_500',
    text: 'Token rejected — HTML 5xx response (status 503)',
  });
const latched = (statusCode: 401 | 403 = 401) =>
  new AuthError(statusCode, 'Login recently rejected', { errorCode: 'AUTH_LOGIN_LATCHED' });
const noCredentials = () => new AuthError(401, undefined, { errorCode: 'NO_CREDENTIALS' });
const outageAfterRenewal = () =>
  new ApiError(503, 'Server error after token renewal', { errorCode: 'HTML_5XX_AFTER_RENEWAL' });

// ---------------------------------------------------------------------------
// FR3.a — error-code constants
// ---------------------------------------------------------------------------

describe('FR3.a: error-code constants', () => {
  it('FR3.a.1: each error code equals its own name', () => {
    expect({ AUTH_HTML_500, AUTH_LOGIN_LATCHED, NO_CREDENTIALS, HTML_5XX_AFTER_RENEWAL }).toEqual({
      AUTH_HTML_500: 'AUTH_HTML_500',
      AUTH_LOGIN_LATCHED: 'AUTH_LOGIN_LATCHED',
      NO_CREDENTIALS: 'NO_CREDENTIALS',
      HTML_5XX_AFTER_RENEWAL: 'HTML_5XX_AFTER_RENEWAL',
    });
  });

  it('FR3.a.2: MAX_QUERY_RETRIES is 2 (today\'s retry: 2)', () => {
    expect(MAX_QUERY_RETRIES).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// FR3.b — isRetryableError
// ---------------------------------------------------------------------------

describe('FR3.b: isRetryableError', () => {
  it.each([
    ['NetworkError', networkError()],
    ['ApiError(500)', new ApiError(500)],
    ['ApiError(502)', new ApiError(502)],
    ['ApiError(503)', new ApiError(503)],
    ['ApiError(504)', new ApiError(504)],
    ['ApiError(408) request timeout', new ApiError(408)],
    ['ApiError(429) rate limited', new ApiError(429)],
    ['AuthError(401, AUTH_HTML_500) — first-response Tomcat page', htmlTokenRejected()],
    ['ApiError(503, HTML_5XX_AFTER_RENEWAL)', outageAfterRenewal()],
    ['a raw TypeError', new TypeError('Network request failed')],
    ['a plain Error', new Error('boom')],
    ['a thrown string', 'offline'],
    ['undefined', undefined],
  ])('FR3.b.1: %s is retryable', (_label, err) => {
    expect(isRetryableError(err)).toBe(true);
  });

  it.each([
    ['AuthError(401)', new AuthError(401)],
    ['AuthError(403)', new AuthError(403)],
    ['AuthError(401) with a server envelope code', new AuthError(401, undefined, { errorCode: 'CROS-0001', text: 'Invalid credentials' })],
    ['AuthError(401, AUTH_LOGIN_LATCHED)', latched(401)],
    ['AuthError(403, AUTH_LOGIN_LATCHED)', latched(403)],
    ['AuthError(401, NO_CREDENTIALS)', noCredentials()],
    ['ApiError(400)', new ApiError(400)],
    ['ApiError(404)', new ApiError(404)],
    ['ApiError(422)', new ApiError(422)],
    ['ApiError(499) — just under the 5xx boundary', new ApiError(499)],
  ])('FR3.b.2: %s is not retryable', (_label, err) => {
    expect(isRetryableError(err)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR3.c — shouldRetryQuery (two retries, spec 02)
// ---------------------------------------------------------------------------

describe('FR3.c: shouldRetryQuery', () => {
  it.each([
    [0, 'NetworkError', true, networkError()],
    [1, 'NetworkError', true, networkError()],
    [2, 'NetworkError', false, networkError()],
    [3, 'NetworkError', false, networkError()],
    [1, 'ApiError(503)', true, new ApiError(503)],
    [2, 'ApiError(503)', false, new ApiError(503)],
    [0, 'AuthError(AUTH_HTML_500)', true, htmlTokenRejected()],
    [0, 'AuthError(401)', false, new AuthError(401)],
    [1, 'AuthError(401)', false, new AuthError(401)],
    [0, 'AuthError(AUTH_LOGIN_LATCHED)', false, latched()],
    [0, 'AuthError(NO_CREDENTIALS)', false, noCredentials()],
    [0, 'ApiError(404)', false, new ApiError(404)],
  ])('FR3.c.1: shouldRetryQuery(%i, %s) → %s', (failureCount, _label, expected, err) => {
    expect(shouldRetryQuery(failureCount, err)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// FR3.d — the one-retry form spec 03 uses (today's retry: 1)
// ---------------------------------------------------------------------------

describe('FR3.d: one-retry form (n, e) => n < 1 && isRetryableError(e)', () => {
  const oneRetry = (failureCount: number, error: unknown) =>
    failureCount < 1 && isRetryableError(error);

  // One `it` so the count cap (row 2, which short-circuits) is never green on its own.
  it('FR3.d.1: retries an outage once and a credential failure never', () => {
    const rows: [number, unknown, boolean][] = [
      [0, networkError(), true],
      [1, networkError(), false],
      [0, new AuthError(401), false],
      [0, outageAfterRenewal(), true],
      [0, latched(), false],
    ];

    expect(rows.map(([n, e]) => oneRetry(n, e))).toEqual(rows.map(([, , expected]) => expected));
  });
});

// ---------------------------------------------------------------------------
// FR3.e — the rules under TanStack's real retryer
// ---------------------------------------------------------------------------

type RetryRule = number | ((failureCount: number, error: unknown) => boolean);

/**
 * How many times TanStack runs a queryFn that always throws `error` under `retry`.
 * A throw inside a retry function would leave TanStack's promise pending forever, so
 * it is caught and rethrown here as the test failure.
 */
async function attemptsUntilGiveUp(retry: RetryRule, error: unknown): Promise<number> {
  const client = new QueryClient();
  let attempts = 0;
  let retryThrew: unknown = null;
  const guarded =
    typeof retry === 'number'
      ? retry
      : (failureCount: number, err: unknown) => {
          try {
            return retry(failureCount, err);
          } catch (e) {
            retryThrew = e;
            return false;
          }
        };
  try {
    await expect(
      client.fetchQuery({
        queryKey: ['retry-policy'],
        queryFn: async () => {
          attempts += 1;
          throw error;
        },
        retry: guarded,
        retryDelay: 0,
        networkMode: 'always',
      }),
    ).rejects.toBe(error);
  } finally {
    client.clear();
  }
  if (retryThrew) throw retryThrew;
  return attempts;
}

describe('FR3.e: attempts under a real QueryClient', () => {
  it('FR3.e.1: shouldRetryQuery runs an outage 3 times, the same as today\'s retry: 2', async () => {
    const err = networkError();

    expect(await attemptsUntilGiveUp(2, err)).toBe(3);
    expect(await attemptsUntilGiveUp(shouldRetryQuery, err)).toBe(3);
  });

  it('FR3.e.2: shouldRetryQuery runs a credential failure once (a latched login is never retried)', async () => {
    expect(await attemptsUntilGiveUp(shouldRetryQuery, new AuthError(401))).toBe(1);
    expect(await attemptsUntilGiveUp(shouldRetryQuery, latched())).toBe(1);
  });

  it('FR3.e.3: the one-retry form runs an outage twice (today\'s retry: 1) and a credential failure once', async () => {
    const oneRetry = (failureCount: number, error: unknown) =>
      failureCount < 1 && isRetryableError(error);
    const err = new ApiError(503);

    expect(await attemptsUntilGiveUp(1, err)).toBe(2);
    expect(await attemptsUntilGiveUp(oneRetry, err)).toBe(2);
    expect(await attemptsUntilGiveUp(oneRetry, new AuthError(401))).toBe(1);
  });
});
