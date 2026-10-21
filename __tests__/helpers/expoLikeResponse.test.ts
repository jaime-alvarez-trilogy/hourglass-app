// 10-sdk-58-ios-27 FR3 — self-test for the expo/fetch Response stand-in. If the helper ever
// stopped rejecting a second read, every "single read" client test would pass vacuously.

import {
  FetchError,
  bodyAlreadyUsedMessage,
  makeExpoLikeResponse,
} from './expoLikeResponse';

describe('10 FR3: makeExpoLikeResponse mimics expo/fetch', () => {
  it('a second text() rejects with the expo/fetch TypeError', async () => {
    const res = makeExpoLikeResponse({ body: 'hello' });
    await expect(res.text()).resolves.toBe('hello');
    const second = res.text();
    await expect(second).rejects.toBeInstanceOf(TypeError);
    await expect(second).rejects.toThrow(
      "Failed to execute 'text' on 'Response': Response body is already used.",
    );
    expect(res.reads).toEqual(['text', 'text']);
  });

  it('json() consumes the body too: text() after json(), and json() after text(), both reject', async () => {
    const a = makeExpoLikeResponse({ body: '{"a":1}' });
    await expect(a.json()).resolves.toEqual({ a: 1 });
    await expect(a.text()).rejects.toThrow(bodyAlreadyUsedMessage('text'));

    const b = makeExpoLikeResponse({ body: '{"a":1}' });
    await expect(b.text()).resolves.toBe('{"a":1}');
    await expect(b.json()).rejects.toThrow(bodyAlreadyUsedMessage('json'));
  });

  it('json() on a non-JSON body rejects with SyntaxError (JSON.parse of the text)', async () => {
    await expect(makeExpoLikeResponse({ body: '<html>' }).json()).rejects.toBeInstanceOf(SyntaxError);
    await expect(makeExpoLikeResponse({ body: '' }).json()).rejects.toBeInstanceOf(SyntaxError);
  });

  it('bodyUsed flips on the first read', async () => {
    const res = makeExpoLikeResponse({ body: 'x' });
    expect(res.bodyUsed).toBe(false);
    await res.text();
    expect(res.bodyUsed).toBe(true);
  });

  it('ok derives from status (200-299), and headers are case-insensitive', () => {
    expect(makeExpoLikeResponse({ status: 200 }).ok).toBe(true);
    expect(makeExpoLikeResponse({ status: 204 }).ok).toBe(true);
    expect(makeExpoLikeResponse({ status: 299 }).ok).toBe(true);
    expect(makeExpoLikeResponse({ status: 300 }).ok).toBe(false);
    expect(makeExpoLikeResponse({ status: 401 }).ok).toBe(false);
    const res = makeExpoLikeResponse({ headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    expect(res.headers.get('content-type')).toBe('text/html;charset=utf-8');
    expect(makeExpoLikeResponse().headers.get('content-type')).toBeNull();
  });

  it('defaults to status 200 with an empty body', async () => {
    const res = makeExpoLikeResponse();
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe('');
  });

  it('FetchError matches expo/fetch: an Error subclass with a "fetch failed: " message', () => {
    const err = new FetchError('The network connection was lost.');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('fetch failed: The network connection was lost.');
  });
});
