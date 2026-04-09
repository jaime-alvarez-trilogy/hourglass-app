/**
 * FR3: Cron Push Dispatcher tests
 * Tests for server/push.ts (sendPushBatch) and server/cron.ts (runCron)
 */

// Mock node-fetch for push.ts
// node-fetch v2 is CJS; when transpiled with Babel esModuleInterop,
// `import fetch from 'node-fetch'` becomes `_nodeFetch.default`, so the
// factory must expose the mock as `.default`.
// Use jest.fn() inside factory (hoisting safe — factory runs before variable declarations).
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock db module for cron.ts — use jest.fn() inside factory (hoisting safe)
jest.mock('../db', () => ({
  getAllTokens: jest.fn(),
  deleteTokens: jest.fn(),
}));

import { sendPushBatch } from '../push';
import { runCron } from '../cron';
import nodeFetch from 'node-fetch';
import * as db from '../db';

// Convenience references to mocks (safe to assign after hoisted jest.mock factories run)
const mockFetch = nodeFetch as jest.Mock;
const mockGetAllTokens = db.getAllTokens as jest.Mock;
const mockDeleteTokens = db.deleteTokens as jest.Mock;

// Helpers
const makeToken = (i: number) => `ExponentPushToken[token${i}]`;
const makeTokenList = (count: number) => Array.from({ length: count }, (_, i) => makeToken(i));

// Expo push API success ticket
const successTicket = { status: 'ok', id: 'ticket-id' };
// Expo DeviceNotRegistered error ticket
const staleTicket = { status: 'error', details: { error: 'DeviceNotRegistered' } };

const makeExpoResponse = (tickets: object[]) => ({
  ok: true,
  json: async () => ({ data: tickets }),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FR3: sendPushBatch', () => {
  describe('chunking behaviour', () => {
    it('sends a single request for ≤100 tokens', async () => {
      const tokens = makeTokenList(50);
      mockFetch.mockResolvedValueOnce(makeExpoResponse(tokens.map(() => successTicket)));

      await sendPushBatch(tokens);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('sends two requests for 101–200 tokens', async () => {
      const tokens = makeTokenList(150);
      // First chunk: 100 tokens, second chunk: 50 tokens
      mockFetch
        .mockResolvedValueOnce(makeExpoResponse(makeTokenList(100).map(() => successTicket)))
        .mockResolvedValueOnce(makeExpoResponse(makeTokenList(50).map(() => successTicket)));

      await sendPushBatch(tokens);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('sends ceil(N/100) requests for N tokens', async () => {
      const tokens = makeTokenList(250); // 3 chunks: 100, 100, 50
      mockFetch
        .mockResolvedValueOnce(makeExpoResponse(makeTokenList(100).map(() => successTicket)))
        .mockResolvedValueOnce(makeExpoResponse(makeTokenList(100).map(() => successTicket)))
        .mockResolvedValueOnce(makeExpoResponse(makeTokenList(50).map(() => successTicket)));

      await sendPushBatch(tokens);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Expo push API request format', () => {
    it('POSTs to the correct Expo push endpoint', async () => {
      const tokens = makeTokenList(1);
      mockFetch.mockResolvedValueOnce(makeExpoResponse([successTicket]));

      await sendPushBatch(tokens);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends correct push message shape for each token', async () => {
      const tokens = [makeToken(0)];
      mockFetch.mockResolvedValueOnce(makeExpoResponse([successTicket]));

      await sendPushBatch(tokens);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual({
        to: makeToken(0),
        data: { type: 'bg_refresh' },
        _contentAvailable: true,
      });
    });
  });

  describe('stale token detection', () => {
    it('returns stale token identifiers for DeviceNotRegistered errors', async () => {
      const tokens = [makeToken(0), makeToken(1), makeToken(2)];
      // token 1 is stale
      mockFetch.mockResolvedValueOnce(
        makeExpoResponse([successTicket, staleTicket, successTicket])
      );

      const result = await sendPushBatch(tokens);

      expect(result.staleTokens).toContain(makeToken(1));
      expect(result.staleTokens).not.toContain(makeToken(0));
      expect(result.staleTokens).not.toContain(makeToken(2));
    });
  });

  describe('result counts', () => {
    it('returns sent and failed counts', async () => {
      const tokens = makeTokenList(3);
      mockFetch.mockResolvedValueOnce(
        makeExpoResponse([successTicket, staleTicket, successTicket])
      );

      const result = await sendPushBatch(tokens);

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe('error resilience', () => {
    it('returns zero sent/failed and empty stale tokens for empty input', async () => {
      const result = await sendPushBatch([]);
      expect(result).toEqual({ sent: 0, failed: 0, staleTokens: [] });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not throw when Expo push API call fails', async () => {
      const tokens = makeTokenList(5);
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(sendPushBatch(tokens)).resolves.toBeDefined();
    });

    it('returns failed count when Expo push API call fails', async () => {
      const tokens = makeTokenList(5);
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await sendPushBatch(tokens);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(5);

      consoleSpy.mockRestore();
    });
  });
});

describe('FR3: runCron', () => {
  it('fetches all tokens from DB', async () => {
    mockGetAllTokens.mockReturnValue([]);

    await runCron();

    expect(mockGetAllTokens).toHaveBeenCalledTimes(1);
  });

  it('calls deleteTokens for stale tokens returned by push batch', async () => {
    const tokens = makeTokenList(3);
    const staleToken = makeToken(1);
    mockGetAllTokens.mockReturnValue(tokens);
    mockFetch.mockResolvedValueOnce(
      makeExpoResponse([successTicket, staleTicket, successTicket])
    );

    await runCron();

    expect(mockDeleteTokens).toHaveBeenCalledWith(expect.arrayContaining([staleToken]));
  });

  it('does not call deleteTokens when no stale tokens', async () => {
    const tokens = makeTokenList(2);
    mockGetAllTokens.mockReturnValue(tokens);
    mockFetch.mockResolvedValueOnce(
      makeExpoResponse([successTicket, successTicket])
    );

    await runCron();

    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });

  it('logs push counts to console', async () => {
    mockGetAllTokens.mockReturnValue(makeTokenList(3));
    mockFetch.mockResolvedValueOnce(
      makeExpoResponse([successTicket, successTicket, successTicket])
    );
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runCron();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not crash when Expo push API is unavailable', async () => {
    mockGetAllTokens.mockReturnValue(makeTokenList(5));
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runCron()).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});
