import Database from 'better-sqlite3';
import fs from 'node:fs';
import { DATA_DIR, DB_PATH } from './config.ts';

fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, thread TEXT, type TEXT NOT NULL, json TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS events_thread ON events(thread, id);
  CREATE TABLE IF NOT EXISTS threads (
    mode TEXT PRIMARY KEY, messages_json TEXT NOT NULL DEFAULT '[]', state_json TEXT NOT NULL DEFAULT '{}', updated INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT PRIMARY KEY, thread TEXT NOT NULL, tool TEXT NOT NULL, input_json TEXT NOT NULL,
    reason TEXT, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, resolved INTEGER);
  CREATE TABLE IF NOT EXISTS usage (
    day TEXT NOT NULL, model TEXT NOT NULL, input INTEGER NOT NULL DEFAULT 0, output INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, model));
`);
