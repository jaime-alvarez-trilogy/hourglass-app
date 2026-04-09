/**
 * FR2: SQLite Token Store tests
 * Tests for db.ts: upsertToken, deleteToken, deleteTokens, getAllTokens, getTokenCount
 */

// Mock better-sqlite3 with an in-memory store
const mockStore: Map<string, { token: string; updated_at: string }> = new Map();

const mockDb = {
  prepare: jest.fn((sql: string) => {
    // upsert
    if (sql.includes('INSERT OR REPLACE')) {
      return {
        run: jest.fn((token: string, updated_at: string) => {
          mockStore.set(token, { token, updated_at });
        }),
      };
    }
    // delete single
    if (sql.includes('DELETE') && !sql.includes('IN')) {
      return {
        run: jest.fn((token: string) => {
          mockStore.delete(token);
        }),
      };
    }
    // select all
    if (sql.includes('SELECT token FROM')) {
      return {
        all: jest.fn(() => Array.from(mockStore.values()).map(r => ({ token: r.token }))),
      };
    }
    // count
    if (sql.includes('COUNT(*)')) {
      return {
        get: jest.fn(() => ({ count: mockStore.size })),
      };
    }
    // create table
    if (sql.includes('CREATE TABLE')) {
      return { run: jest.fn() };
    }
    return { run: jest.fn(), all: jest.fn(() => []), get: jest.fn(() => ({ count: 0 })) };
  }),
  // better-sqlite3 transaction: wrap a function so it executes synchronously
  transaction: jest.fn((fn: (...args: unknown[]) => void) => fn),
  exec: jest.fn(),
};

jest.mock('better-sqlite3', () => {
  return jest.fn(() => mockDb);
});

// Import after mock setup
import { upsertToken, deleteToken, deleteTokens, getAllTokens, getTokenCount } from '../db';

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('FR2: SQLite Token Store', () => {
  describe('upsertToken', () => {
    it('inserts a new token with updated_at timestamp', () => {
      const before = Date.now();
      upsertToken('ExponentPushToken[abc123]');
      const row = mockStore.get('ExponentPushToken[abc123]');
      expect(row).toBeDefined();
      expect(row!.token).toBe('ExponentPushToken[abc123]');
      const updatedAt = new Date(row!.updated_at).getTime();
      expect(updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('replaces existing token without creating duplicate', () => {
      upsertToken('ExponentPushToken[abc123]');
      const firstUpdatedAt = mockStore.get('ExponentPushToken[abc123]')!.updated_at;

      // Small delay to ensure different timestamp
      jest.useFakeTimers();
      jest.advanceTimersByTime(10);
      upsertToken('ExponentPushToken[abc123]');
      jest.useRealTimers();

      expect(mockStore.size).toBe(1);
      // Still only one entry for this token
      const allEntries = Array.from(mockStore.entries()).filter(
        ([k]) => k === 'ExponentPushToken[abc123]'
      );
      expect(allEntries).toHaveLength(1);
    });

    it('stores the token with an ISO string updated_at', () => {
      upsertToken('ExponentPushToken[xyz]');
      const row = mockStore.get('ExponentPushToken[xyz]');
      expect(row!.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('deleteToken', () => {
    it('removes an existing token', () => {
      upsertToken('ExponentPushToken[del1]');
      expect(mockStore.has('ExponentPushToken[del1]')).toBe(true);
      deleteToken('ExponentPushToken[del1]');
      expect(mockStore.has('ExponentPushToken[del1]')).toBe(false);
    });

    it('does not throw when token does not exist', () => {
      expect(() => deleteToken('ExponentPushToken[nonexistent]')).not.toThrow();
    });
  });

  describe('deleteTokens', () => {
    it('removes multiple tokens in one call', () => {
      upsertToken('ExponentPushToken[a]');
      upsertToken('ExponentPushToken[b]');
      upsertToken('ExponentPushToken[c]');
      deleteTokens(['ExponentPushToken[a]', 'ExponentPushToken[b]']);
      expect(mockStore.has('ExponentPushToken[a]')).toBe(false);
      expect(mockStore.has('ExponentPushToken[b]')).toBe(false);
      expect(mockStore.has('ExponentPushToken[c]')).toBe(true);
    });

    it('handles empty array without error', () => {
      upsertToken('ExponentPushToken[keep]');
      expect(() => deleteTokens([])).not.toThrow();
      expect(mockStore.size).toBe(1);
    });
  });

  describe('getAllTokens', () => {
    it('returns an array of token strings', () => {
      upsertToken('ExponentPushToken[t1]');
      upsertToken('ExponentPushToken[t2]');
      const tokens = getAllTokens();
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens).toContain('ExponentPushToken[t1]');
      expect(tokens).toContain('ExponentPushToken[t2]');
    });

    it('returns empty array when no tokens stored', () => {
      const tokens = getAllTokens();
      expect(tokens).toEqual([]);
    });
  });

  describe('getTokenCount', () => {
    it('returns 0 when no tokens stored', () => {
      expect(getTokenCount()).toBe(0);
    });

    it('returns correct count after inserts', () => {
      upsertToken('ExponentPushToken[c1]');
      upsertToken('ExponentPushToken[c2]');
      upsertToken('ExponentPushToken[c3]');
      expect(getTokenCount()).toBe(3);
    });
  });
});
