import { randomUUID } from 'node:crypto';
import { db } from '../db.ts';
import { emit } from '../events/log.ts';
import * as outbound from '../channels/outbound.ts';
import * as runner from '../agent/runner.ts';
import { duration, untilToday } from '../lib/time.ts';
import * as islands from './islands.ts';
import * as logbook from './logbook.ts';
import * as out from './out.ts';
import * as priorities from './priorities.ts';
import * as profile from './profile.ts';
import * as watches from './watches.ts';
import type { Level } from './priorities.ts';

db.exec(`CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, priority TEXT NOT NULL, island TEXT, dedupe TEXT, title TEXT NOT NULL, options_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open', created INTEGER NOT NULL, snoozed_until INTEGER, reminders INTEGER NOT NULL DEFAULT 0,
  answer TEXT, answered INTEGER, via TEXT, archived_reason TEXT, last_sent INTEGER);
  CREATE INDEX IF NOT EXISTS checkins_state ON checkins(state, created);`);

export type Action =
  | { type: 'log'; kind: string } | { type: 'snooze'; for: string } | { type: 'snooze-eod' } | { type: 'archive'; reason: string }
  | { type: 'discuss' } | { type: 'handoff'; mode: string; text: string } | { type: 'deliver'; domain: 'mail' | 'site' | 'submissions'; name: string; content: string }
  | { type: 'ignore-sender'; sender: string } | { type: 'island'; slug: string; patch: Record<string, any> } | { type: 'none' };
export type Option = { k: string; label: string; action: Action };
export type Checkin = { id: string; kind: 'ask' | 'nudge'; priority: Level; island: string | null; dedupe: string | null; title: string; options: Option[]; state: 'open' | 'snoozed' | 'answered' | 'archived'; created: number; snoozedUntil: number | null; reminders: number; lastSent: number; answer: string | null; answered: number | null; via: string | null; archivedReason: string | null };

const row = (r: any): Checkin => ({ id: r.id, kind: r.kind, priority: r.priority, island: r.island, dedupe: r.dedupe, title: r.title, options: JSON.parse(r.options_json), state: r.state, created: r.created, snoozedUntil: r.snoozed_until, reminders: r.reminders, lastSent: r.last_sent ?? r.created, answer: r.answer, answered: r.answered, via: r.via, archivedReason: r.archived_reason });
const q = {
  ins: db.prepare('INSERT INTO checkins (id, kind, priority, island, dedupe, title, options_json, state, created, last_sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  get: db.prepare('SELECT * FROM checkins WHERE id = ?'),
  live: db.prepare("SELECT * FROM checkins WHERE state IN ('open', 'snoozed') ORDER BY created"),
  recent: db.prepare('SELECT * FROM checkins ORDER BY created DESC LIMIT ?'),
  byDedupe: db.prepare('SELECT * FROM checkins WHERE dedupe = ? ORDER BY created DESC LIMIT 1'),
  set: db.prepare('UPDATE checkins SET state = ?, snoozed_until = ?, reminders = ?, answer = ?, answered = ?, via = ?, archived_reason = ?, last_sent = ? WHERE id = ?'),
};
const save = (c: Checkin) => q.set.run(c.state, c.snoozedUntil, c.reminders, c.answer, c.answered, c.via, c.archivedReason, c.lastSent, c.id);

export const get = (id: string): Checkin | null => { const r = q.get.get(id); return r ? row(r) : null; };
export const live = (): Checkin[] => (q.live.all() as any[]).map(row);
export const open = (): Checkin[] => live().filter((c) => c.state === 'open');
export const recent = (n = 50): Checkin[] => (q.recent.all(n) as any[]).map(row);
export const latestByDedupe = (key: string): Checkin | null => { const r = q.byDedupe.get(key); return r ? row(r) : null; };
export const latestOpen = (): Checkin | null => open().at(-1) ?? null;

export const text = (c: Checkin) => c.kind === 'nudge' || !c.options.length ? c.title : `${c.title}\n${c.options.map((o) => `${o.k}) ${o.label}`).join('\n')}`;

export function ask(input: { kind?: 'ask' | 'nudge'; priority: Level; title: string; options?: Option[]; island?: string | null; dedupe?: string | null }): Checkin {
  const c: Checkin = { id: randomUUID().slice(0, 8), kind: input.kind ?? 'ask', priority: input.priority, island: input.island ?? null, dedupe: input.dedupe ?? null, title: input.title, options: input.options ?? [], state: 'open', created: Date.now(), snoozedUntil: null, reminders: 0, lastSent: Date.now(), answer: null, answered: null, via: null, archivedReason: null };
  q.ins.run(c.id, c.kind, c.priority, c.island, c.dedupe, c.title, JSON.stringify(c.options), c.state, c.created, c.lastSent);
  emit('checkin.opened', 'loop', { id: c.id, kind: c.kind, priority: c.priority, island: c.island, title: c.title, options: c.options.map((o) => `${o.k}) ${o.label}`) });
  void send(c, 'opened');
  return c;
}
async function send(c: Checkin, why: string) {
  if (!outbound.channels().includes('imessage')) return;
  try { await outbound.send('imessage', null, text(c)); emit('checkin.sent', 'loop', { id: c.id, why }); }
  catch (e) { emit('checkin.send_error', 'loop', { id: c.id, error: (e as Error).message }); }
}
/** Re-send a snoozed or silent check-in. */
export function remind(c: Checkin, why: string) {
  c.state = 'open'; c.snoozedUntil = null; c.reminders += 1; c.lastSent = Date.now(); save(c);
  emit('checkin.reminded', 'loop', { id: c.id, title: c.title, reminders: c.reminders, why });
  void send(c, why);
}
export function snooze(c: Checkin, until: number, via: string) {
  c.state = 'snoozed'; c.snoozedUntil = until; c.via = via; save(c);
  emit('checkin.snoozed', 'loop', { id: c.id, title: c.title, until });
}
export function archive(c: Checkin, reason: string) {
  c.state = 'archived'; c.archivedReason = reason; c.answered = Date.now(); save(c);
  emit('checkin.archived', 'loop', { id: c.id, title: c.title, reason });
}

/** Answer with an option letter. Returns a one-line confirmation for the channel that answered. */
export async function answer(id: string, k: string, via: string): Promise<string> {
  const c = get(id);
  if (!c) throw new Error('no such check-in');
  if (c.state === 'answered' || c.state === 'archived') return `Already ${c.state}.`;
  const o = c.options.find((x) => x.k === k.toLowerCase()) ?? (c.kind === 'nudge' ? { k, label: 'ok', action: { type: 'none' } as Action } : null);
  if (!o) throw new Error(`options are ${c.options.map((x) => x.k).join(', ')}`);
  c.answer = o.k; c.via = via;
  const tz = profile.get().timezone;
  const a = o.action;
  let reply = `Noted: ${o.label}.`;
  switch (a.type) {
    case 'snooze': snooze(c, Date.now() + duration(a.for, 90 * 60_000), via); reply = `I'll come back in ${a.for}.`; break;
    case 'snooze-eod': { const ms = untilToday(tz, priorities.get().defaults.end_of_day); snooze(c, Date.now() + Math.max(ms, 60_000), via); reply = 'I\'ll come back at end of day.'; break; }
    default: {
      c.state = 'answered'; c.answered = Date.now(); save(c);
      if (a.type === 'log') { logbook.add(a.kind, via); reply = `Logged ${a.kind}.`; }
      if (a.type === 'archive') { archive(c, a.reason); reply = 'Filed, I won\'t ask again.'; }
      if (a.type === 'ignore-sender') { watches.patch({ mail: { ignore: [...new Set([...watches.get().mail.ignore, a.sender])] } }); reply = `I won't ask about ${a.sender} again.`; }
      if (a.type === 'island') { islands.upsert(a.slug, a.patch); reply = 'Updated on the desk.'; }
      if (a.type === 'deliver') { const r = out.deliver(a.domain, a.name, a.content, `checkin ${c.id}`); reply = `Written to out/${r.domain}/${r.name}.`; }
      if (a.type === 'handoff') { void runner.run({ mode: a.mode, text: a.text, channel: 'checkin' }).catch((e) => emit('checkin.handoff_error', 'loop', { id: c.id, error: e.message })); reply = `Handed to ${a.mode}; the result lands in out/.`; }
      if (a.type === 'discuss') { void runner.run({ mode: 'assistant', text: `About this check-in: "${c.title}". The user chose "discuss". Ask one question or offer one way forward.`, channel: 'checkin' }).catch(() => {}); reply = 'Opening it in the assistant thread.'; }
    }
  }
  emit('checkin.answered', 'loop', { id: c.id, title: c.title, answer: o.k, label: o.label, via, action: a.type });
  return reply;
}
