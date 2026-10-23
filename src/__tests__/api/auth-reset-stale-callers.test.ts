/**
 * durable-data cross-spec review: stale callers after a hard reset.
 *
 * A work-diary task queued behind the limiter calls getAuthToken only when it
 * starts. After sign-out or an env switch (`invalidateAuthToken()`), such a task
 * must not mint with the old credentials / old env, and the token cache must
 * never hand one account's (or env's) token to another caller.
 *
 * Runs the real src/api/client.ts and src/api/workDiary.ts against a mocked fetch.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../../store/config', () => ({
  getApiBase: (useQA: boolean) =>
    useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com',
}));

jest.mock('../../lib/log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  apiGet,
  getAuthToken,
  invalidateAuthToken,
} from '../../api/client';
import { fetchWorkDiary, WORK_DIARY_CONCURRENCY, __resetWorkDiaryInFlightForTests } from '../../api/workDiary';
import { AuthResetError, isRetryableError } from '../../api/errors';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function tokenResponse(token: string) {
  return { ok: true, status: 200, text: async () => token, headers: { get: () => null } };
}
function jsonOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    headers: { get: () => 'application/json' },
  };
}
function status401() {
  return { ok: false, status: 401, text: async () => '', headers: { get: () => 'application/json' } };
}

const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;
const tokenPosts = () =>
  mockFetch.mock.calls.filter(([url]) => String(url).endsWith('/api/v3/token'));

const ALICE = { username: 'alice', password: 'pw-a' };
const BOB = { username: 'bob', password: 'pw-b' };

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  mockFetch.mockReset();
  invalidateAuthToken();
  __resetWorkDiaryInFlightForTests();
});

describe('stale work-diary tasks after a hard reset', () => {
  it('a task queued before sign-out rejects with AuthResetError and mints nothing; the next account gets its own token', async () => {
    // Alice's token, then 4 hanging diary requests fill the limiter
    const hanging: Array<Deferred<unknown>> = [];
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/api/v3/token')) return Promise.resolve(tokenResponse('alice-tok'));
      const d = deferred<unknown>();
      hanging.push(d);
      return d.promise;
    });

    const running = Array.from({ length: WORK_DIARY_CONCURRENCY }, (_, i) =>
      fetchWorkDiary('A1', `2026-10-0${i + 1}`, ALICE, false).catch((e) => e),
    );
    const queued = [
      fetchWorkDiary('A1', '2026-10-10', ALICE, false).catch((e) => e),
      fetchWorkDiary('A1', '2026-10-11', ALICE, false).catch((e) => e),
    ];
    await flush();
    expect(hanging).toHaveLength(WORK_DIARY_CONCURRENCY);
    expect(tokenPosts()).toHaveLength(1);

    // Sign-out
    invalidateAuthToken();

    // The running requests finish; the queued tasks start after the reset
    hanging.forEach((d) => d.resolve(jsonOk([])));
    await Promise.all(running);
    const queuedResults = await Promise.all(queued);

    expect(queuedResults[0]).toBeInstanceOf(AuthResetError);
    expect(queuedResults[1]).toBeInstanceOf(AuthResetError);
    expect(isRetryableError(queuedResults[0])).toBe(false);
    // No new login with alice's credentials after the reset
    expect(tokenPosts()).toHaveLength(1);

    // Bob signs in: his token is minted with his credentials
    mockFetch.mockImplementation(() => Promise.resolve(tokenResponse('bob-tok')));
    await expect(getAuthToken(BOB.username, BOB.password, false)).resolves.toBe('bob-tok');
    const posts = tokenPosts();
    expect(posts).toHaveLength(2);
    expect(posts[1][1].headers.Authorization).toBe(basic(BOB.username, BOB.password));
  });

  it('a request in flight at the reset does not renew on its 401 (no mint with the old credentials)', async () => {
    const d = deferred<unknown>();
    mockFetch.mockImplementationOnce(() => d.promise);
    const p = apiGet('/x', {}, 'alice-tok', false, { ...ALICE, useQA: false }).catch((e) => e);
    await flush();

    invalidateAuthToken();
    d.resolve(status401());
    const err = await p;

    expect(err).toBeInstanceOf(AuthResetError);
    expect(tokenPosts()).toHaveLength(0);
  });
});

describe('the token cache is keyed by env + credentials', () => {
  it('a cached token for one account is never returned to another', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse('alice-tok'))
      .mockResolvedValueOnce(tokenResponse('bob-tok'));

    await expect(getAuthToken(ALICE.username, ALICE.password, false)).resolves.toBe('alice-tok');
    await expect(getAuthToken(BOB.username, BOB.password, false)).resolves.toBe('bob-tok');
    expect(tokenPosts()).toHaveLength(2);
  });

  it('a cached prod token is never returned to a QA caller', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse('prod-tok'))
      .mockResolvedValueOnce(tokenResponse('qa-tok'));

    await expect(getAuthToken(ALICE.username, ALICE.password, false)).resolves.toBe('prod-tok');
    await expect(getAuthToken(ALICE.username, ALICE.password, true)).resolves.toBe('qa-tok');
    expect(String(tokenPosts()[1][0])).toBe('https://api-qa.crossover.com/api/v3/token');
  });

  it('a QA caller never joins an in-flight prod mint', async () => {
    const prodMint = deferred<unknown>();
    mockFetch
      .mockImplementationOnce(() => prodMint.promise)
      .mockResolvedValueOnce(tokenResponse('qa-tok'));

    const prod = getAuthToken(ALICE.username, ALICE.password, false);
    const qa = getAuthToken(ALICE.username, ALICE.password, true);
    await expect(qa).resolves.toBe('qa-tok');
    prodMint.resolve(tokenResponse('prod-tok'));
    await expect(prod).resolves.toBe('prod-tok');
  });

  it('same credentials still share one cached token and one in-flight mint', async () => {
    mockFetch.mockResolvedValueOnce(tokenResponse('alice-tok'));
    const [a, b] = await Promise.all([
      getAuthToken(ALICE.username, ALICE.password, false),
      getAuthToken(ALICE.username, ALICE.password, false),
    ]);
    expect([a, b]).toEqual(['alice-tok', 'alice-tok']);
    await expect(getAuthToken(ALICE.username, ALICE.password, false)).resolves.toBe('alice-tok');
    expect(tokenPosts()).toHaveLength(1);
  });
});
