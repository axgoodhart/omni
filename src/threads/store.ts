import type { ModelMessage } from 'ai';
import { db } from '../db.ts';

export type ThreadState = { cartridges?: string[]; lastInputTokens?: number };

const get = db.prepare('SELECT * FROM threads WHERE mode = ?');
const upsert = db.prepare(`INSERT INTO threads (mode, messages_json, state_json, updated) VALUES (?, ?, ?, ?)
  ON CONFLICT(mode) DO UPDATE SET messages_json = excluded.messages_json, state_json = excluded.state_json, updated = excluded.updated`);

export function getMessages(mode: string): ModelMessage[] {
  const row = get.get(mode) as any;
  return row ? JSON.parse(row.messages_json) : [];
}
export function getState(mode: string): ThreadState {
  const row = get.get(mode) as any;
  return row ? JSON.parse(row.state_json) : {};
}
export function save(mode: string, messages: ModelMessage[], state: ThreadState = getState(mode)) {
  upsert.run(mode, JSON.stringify(messages), JSON.stringify(state), Date.now());
}
export function setState(mode: string, patch: ThreadState) {
  save(mode, getMessages(mode), { ...getState(mode), ...patch });
}
export function reset(mode: string) { save(mode, [], getState(mode)); }
export function listThreads(): { mode: string; updated: number; messages: number }[] {
  return (db.prepare('SELECT mode, updated, messages_json FROM threads').all() as any[])
    .map((r) => ({ mode: r.mode, updated: r.updated, messages: JSON.parse(r.messages_json).length }));
}
