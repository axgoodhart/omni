import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { db } from '../db.ts';

export type AgentEvent = { id: number; ts: number; thread: string | null; type: string; data: unknown; activity: string | null };
type Listener = (e: AgentEvent) => void;

const listeners = new Set<Listener>();
if (!(db.prepare('PRAGMA table_info(events)').all() as any[]).some((r) => r.name === 'activity')) db.exec('ALTER TABLE events ADD COLUMN activity TEXT');
const insert = db.prepare('INSERT INTO events (ts, thread, type, json, activity) VALUES (?, ?, ?, ?, ?)');

// ---- activities: every event emitted while one runs shares its id, so History can show them as one card
const current = new AsyncLocalStorage<string>();
const byThread = new Map<string, string>(); // for events the async chain doesn't reach, e.g. from inside the model library
export function activity<T>(kind: string, thread: string | null, fn: () => T): T {
  const id = `${kind}:${randomUUID().slice(0, 8)}`;
  if (thread) byThread.set(thread, id);
  const out = current.run(id, fn);
  if (thread) Promise.resolve(out).finally(() => { if (byThread.get(thread) === id) byThread.delete(thread); }).catch(() => {});
  return out;
}
const activityFor = (thread: string | null) => current.getStore() ?? (thread ? byThread.get(thread) : undefined) ?? null;

export function emit(type: string, thread: string | null, data: unknown = {}): AgentEvent {
  const ts = Date.now(), act = activityFor(thread);
  const json = JSON.stringify(data ?? {});
  const id = Number(insert.run(ts, thread, type, json, act).lastInsertRowid);
  const e = { id, ts, thread, type, data, activity: act };
  for (const l of listeners) { try { l(e); } catch {} }
  return e;
}

/** Fan-out only, nothing persisted: for per-token deltas. */
export function live(type: string, thread: string | null, data: unknown = {}) {
  const e = { id: 0, ts: Date.now(), thread, type, data, activity: activityFor(thread) };
  for (const l of listeners) { try { l(e); } catch {} }
}

export function subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

export function list({ thread, after = 0, limit = 500 }: { thread?: string | null; after?: number; limit?: number }): AgentEvent[] {
  const rows = thread
    ? db.prepare('SELECT * FROM events WHERE thread = ? AND id > ? ORDER BY id DESC LIMIT ?').all(thread, after, limit)
    : db.prepare('SELECT * FROM events WHERE id > ? ORDER BY id DESC LIMIT ?').all(after, limit);
  return (rows as any[]).reverse().map((r) => ({ id: r.id, ts: r.ts, thread: r.thread, type: r.type, data: JSON.parse(r.json), activity: r.activity ?? null }));
}
