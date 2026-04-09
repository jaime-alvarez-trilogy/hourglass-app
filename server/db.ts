/**
 * FR2: SQLite Token Store
 * Device token persistence using better-sqlite3.
 * Schema: device_tokens(token TEXT PRIMARY KEY, updated_at TEXT NOT NULL)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'tokens.db');

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.prepare(
      `CREATE TABLE IF NOT EXISTS device_tokens (
        token TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL
      )`
    ).run();
  }
  return db;
}

/**
 * Insert or replace a device token, updating updated_at to now.
 */
export function upsertToken(token: string): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO device_tokens (token, updated_at) VALUES (?, ?)')
    .run(token, new Date().toISOString());
}

/**
 * Remove a single device token. No-op if token doesn't exist.
 */
export function deleteToken(token: string): void {
  getDb()
    .prepare('DELETE FROM device_tokens WHERE token = ?')
    .run(token);
}

/**
 * Remove multiple device tokens in a single transaction (for stale token cleanup).
 */
export function deleteTokens(tokens: string[]): void {
  if (tokens.length === 0) return;
  const d = getDb();
  const deleteMany = d.transaction((toks: string[]) => {
    const stmt = d.prepare('DELETE FROM device_tokens WHERE token = ?');
    for (const tok of toks) {
      stmt.run(tok);
    }
  });
  deleteMany(tokens);
}

/**
 * Return all registered device token strings.
 */
export function getAllTokens(): string[] {
  const rows = getDb()
    .prepare('SELECT token FROM device_tokens')
    .all() as { token: string }[];
  return rows.map(r => r.token);
}

/**
 * Return the total count of registered tokens.
 */
export function getTokenCount(): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) as count FROM device_tokens')
    .get() as { count: number };
  return row.count;
}
