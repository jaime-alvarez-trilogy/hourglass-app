// 10-sdk-58-ios-27 FR3 — a jest stand-in for an `expo/fetch` Response.
//
// From SDK 56, `globalThis.fetch` is `expo/fetch` (expo `src/winter/runtime.native.ts`). Its
// Response differs from React Native's whatwg-fetch one in ways a plain `{ ok, text }` mock hides
// (spec-research F2.7; expo@58.0.16 `src/winter/fetch/FetchResponse.ts`, `FetchErrors.ts`):
//   - The body can be read once. A second `text()`/`json()`/… rejects with
//     `TypeError("Failed to execute '<method>' on 'Response': Response body is already used.")`.
//   - `json()` is `JSON.parse(await this.text())`, so it also consumes the body.
//   - `ok` is derived from `status` (200-299); `headers` is a real `Headers` (case-insensitive).
//   - Network and abort failures reject `fetch()` with `FetchError extends Error`, whose message is
//     prefixed `fetch failed: `.
//
// This is a helper module, not a suite: jest's testMatch only picks up `*.test.ts(x)`.

export type ExpoLikeResponseInit = {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
};

export type ExpoLikeResponse = Response & {
  text: jest.Mock<Promise<string>, []>;
  json: jest.Mock<Promise<unknown>, []>;
  /** Every body-read call in order (`'text'`, `'json'`, …), including ones that rejected. */
  readonly reads: string[];
};

/** Mirrors expo@58.0.16 `src/winter/fetch/FetchErrors.ts` (no `name` override, prefixed message). */
export class FetchError extends Error {
  constructor(message: string, { cause }: { cause?: unknown } = {}) {
    super(`fetch failed: ${message}`);
    this.cause = cause;
  }
}

export function bodyAlreadyUsedMessage(method: string): string {
  return `Failed to execute '${method}' on 'Response': Response body is already used.`;
}

/**
 * Build a single-read Response. Defaults: `status` 200, `body` '' and no headers.
 * Read-tracking lives on `reads` and on the `jest.fn` body methods.
 */
export function makeExpoLikeResponse({
  status = 200,
  body = '',
  headers = {},
}: ExpoLikeResponseInit = {}): ExpoLikeResponse {
  let used = false;
  const reads: string[] = [];

  // expo/fetch's checkBodyUsedError throws inside an async method, so the read rejects.
  const consume = async (method: string): Promise<string> => {
    reads.push(method);
    if (used) throw new TypeError(bodyAlreadyUsedMessage(method));
    used = true;
    return body;
  };

  const res = {
    status,
    statusText: '',
    url: '',
    type: 'default',
    redirected: false,
    get ok() {
      return status >= 200 && status < 300;
    },
    get bodyUsed() {
      return used;
    },
    headers: new Headers(headers),
    reads,
    text: jest.fn(() => consume('text')),
    json: jest.fn(async () => JSON.parse(await consume('json'))),
  };
  return res as unknown as ExpoLikeResponse;
}
