/**
 * FR1: Device Token Registration Endpoint tests
 * Tests for server/index.ts: POST /register, POST /unregister, GET /health
 * Uses supertest for HTTP-level assertions against the Express app.
 */

// Mock the db module — use jest.fn() inside factory (hoisting safe)
jest.mock('../db', () => ({
  upsertToken: jest.fn(),
  deleteToken: jest.fn(),
  getTokenCount: jest.fn(),
}));

// Mock the cron module so it doesn't start during tests
jest.mock('../cron', () => ({
  startCron: jest.fn(),
}));

// Use node's built-in http to test without supertest dependency
import http from 'http';
import { app } from '../index';
import * as db from '../db';

// Convenience references to mocks
const mockUpsertToken = db.upsertToken as jest.Mock;
const mockDeleteToken = db.deleteToken as jest.Mock;
const mockGetTokenCount = db.getTokenCount as jest.Mock;

// Helper: make an HTTP request to the Express app
function request(
  method: string,
  path: string,
  body?: object
): Promise<{ status: number; body: object }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const payload = body ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      };
      const req = http.request(options, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: {} });
          }
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

const VALID_TOKEN = 'ExponentPushToken[testtoken123]';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTokenCount.mockReturnValue(0);
});

describe('FR1: POST /register', () => {
  it('returns 200 { ok: true } for a valid token', async () => {
    const res = await request('POST', '/register', { token: VALID_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('calls upsertToken with the provided token', async () => {
    await request('POST', '/register', { token: VALID_TOKEN });
    expect(mockUpsertToken).toHaveBeenCalledWith(VALID_TOKEN);
    expect(mockUpsertToken).toHaveBeenCalledTimes(1);
  });

  it('calling /register twice with same token calls upsertToken twice (idempotent upsert in DB)', async () => {
    await request('POST', '/register', { token: VALID_TOKEN });
    await request('POST', '/register', { token: VALID_TOKEN });
    expect(mockUpsertToken).toHaveBeenCalledTimes(2);
    expect(mockUpsertToken).toHaveBeenNthCalledWith(1, VALID_TOKEN);
    expect(mockUpsertToken).toHaveBeenNthCalledWith(2, VALID_TOKEN);
  });

  it('returns 400 with error message for empty token string', async () => {
    const res = await request('POST', '/register', { token: '' });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/token/i);
  });

  it('returns 400 when token field is missing from body', async () => {
    const res = await request('POST', '/register', {});
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/token/i);
  });

  it('returns 400 for whitespace-only token (trimmed to empty string)', async () => {
    const res = await request('POST', '/register', { token: '   ' });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/token/i);
  });
});

describe('FR1: POST /unregister', () => {
  it('returns 200 { ok: true } for a valid token', async () => {
    const res = await request('POST', '/unregister', { token: VALID_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('calls deleteToken with the provided token', async () => {
    await request('POST', '/unregister', { token: VALID_TOKEN });
    expect(mockDeleteToken).toHaveBeenCalledWith(VALID_TOKEN);
  });

  it('returns 200 { ok: true } when token does not exist (idempotent)', async () => {
    mockDeleteToken.mockImplementation(() => undefined);
    const res = await request('POST', '/unregister', { token: 'ExponentPushToken[nonexistent]' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 200 { ok: true } when request body has no token field (graceful)', async () => {
    const res = await request('POST', '/unregister', {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockDeleteToken).not.toHaveBeenCalled();
  });
});

describe('FR1: GET /health', () => {
  it('returns 200 { ok: true, tokenCount: number }', async () => {
    mockGetTokenCount.mockReturnValue(42);
    const res = await request('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, tokenCount: 42 });
  });

  it('returns tokenCount of 0 when no tokens registered', async () => {
    mockGetTokenCount.mockReturnValue(0);
    const res = await request('GET', '/health');
    expect((res.body as { tokenCount: number }).tokenCount).toBe(0);
  });
});
