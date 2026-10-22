import { db } from '../db.ts';

export type AgentEvent = { id: number; ts: number; thread: string | null; type: string; data: unknown };
type Listener = (e: AgentEvent) => void;

const listeners = new Set<Listener>();
const insert = db.prepare('INSERT INTO events (ts, thread, type, json) VALUES (?, ?, ?, ?)');

export function emit(type: string, thread: string | null, data: unknown = {}): AgentEvent {
  const ts = Date.now();
  const json = JSON.stringify(data ?? {});
  const id = Number(insert.run(ts, thread, type, json).lastInsertRowid);
  const e = { id, ts, thread, type, data };
  for (const l of listeners) { try { l(e); } catch {} }
  return e;
}

/** Fan-out only, nothing persisted: for per-token deltas. */
export function live(type: string, thread: string | null, data: unknown = {}) {
  const e = { id: 0, ts: Date.now(), thread, type, data };
  for (const l of listeners) { try { l(e); } catch {} }
}

export function subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

export function list({ thread, after = 0, limit = 500 }: { thread?: string | null; after?: number; limit?: number }): AgentEvent[] {
  const rows = thread
    ? db.prepare('SELECT * FROM events WHERE thread = ? AND id > ? ORDER BY id DESC LIMIT ?').all(thread, after, limit)
    : db.prepare('SELECT * FROM events WHERE id > ? ORDER BY id DESC LIMIT ?').all(after, limit);
  return (rows as any[]).reverse().map((r) => ({ id: r.id, ts: r.ts, thread: r.thread, type: r.type, data: JSON.parse(r.json) }));
}
