import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ModelMessage } from 'ai';
import * as budget from '../agent/budget.ts';
import * as runner from '../agent/runner.ts';
import { list as listEvents, subscribe } from '../events/log.ts';
import * as cartridges from '../memory/cartridge.ts';
import { read as readMemory } from '../memory/files.ts';
import * as modes from '../modes/registry.ts';
import * as scheduler from '../scheduler/index.ts';
import * as skills from '../skills/loader.ts';
import { DEFAULT_TOOLS, TOOL_INFO } from '../agent/tools.ts';
import * as store from '../threads/store.ts';
import * as outbound from './outbound.ts';
import * as checkins from '../desk/checkins.ts';
import * as deskStore from '../desk/store.ts';
import * as islands from '../desk/islands.ts';
import * as observations from '../desk/observations.ts';
import * as out from '../desk/out.ts';
import * as priorities from '../desk/priorities.ts';
import * as profile from '../desk/profile.ts';
import * as trust from '../desk/trust.ts';
import * as watches from '../desk/watches.ts';
import * as interview from '../interview/index.ts';
import * as loop from '../loop/index.ts';
import * as mail from '../loop/mail.ts';
import * as logbook from '../desk/logbook.ts';
const logbookLast = (kind: string) => logbook.last(kind);

export const api = new Hono();
const bad = (c: any, e: unknown, status = 400) => c.json({ error: (e as Error).message ?? String(e) }, status);

outbound.register('web', async () => {});   // the UI renders outbound events itself
outbound.addUserChannel('web', null);

api.get('/api/state', (c) => c.json({
  modes: modes.list().map(({ instructions, ...m }) => ({ ...m, inserted: runner.insertedFor(m.name), busy: runner.busy(m.name) })),
  threads: store.listThreads(),
  cartridges: cartridges.list().map(({ dir, memoriesDir, ...x }) => x),
  skills: skills.all().map(({ dir, ...s }) => s),
  pending: runner.pendingApprovals(),
  usage: budget.todayUsage(),
  schedules: scheduler.list(),
  channels: outbound.channels(),
  tools: { defaults: DEFAULT_TOOLS, info: TOOL_INFO },
  imessage: outbound.channels().includes('imessage'),
  desk: { open: checkins.open().length, loop: loop.status(), interviewNeeded: interview.needed(), islands: islands.list().map(({ notes, ...i }) => i) },
}));

// ---- desk ----
api.get('/api/desk', (c) => {
  const w = watches.get();
  return c.json({
    profile: profile.get(), islands: islands.list(), priorities: priorities.get(), trust: trust.get(),
    watches: { export: { path: w.export.path, seen: w.export.seen.length }, mail: { configured: watches.mailConfigured(), since: w.mail.since, lastCheck: w.mail.lastCheck, lastError: w.mail.lastError, ignore: w.mail.ignore } },
    checkins: { live: checkins.live(), recent: checkins.recent(30) },
    mail: { needsYou: mail.needsYou(), recent: mail.recent(20) },
    out: out.list(), observations: observations.list(), loop: loop.status(), interview: interview.current(),
    logbook: { medicine: logbookLast('medicine'), chores: logbookLast('chores') },
  });
});
api.post('/api/logbook/:kind', (c) => { logbook.add(c.req.param('kind'), 'web'); return c.json({ ok: true }); });
api.post('/api/loop/tick', async (c) => { await loop.tick('manual'); return c.json(loop.status()); });
api.post('/api/checkins/:id/answer', async (c) => {
  const { option } = await c.req.json<{ option: string }>();
  try { return c.json({ reply: await checkins.answer(c.req.param('id'), option, 'web') }); } catch (e) { return bad(c, e); }
});
api.get('/api/desk/files', (c) => c.json({ files: [...deskStore.EDITABLE.filter(deskStore.exists), ...deskStore.listDir('islands').map((f) => `islands/${f}`)] }));
api.get('/api/desk/files/*', (c) => { try { const rel = decodeURIComponent(c.req.path.split('/files/')[1] ?? ''); return c.json({ path: rel, text: deskStore.readRaw(rel) }); } catch (e) { return bad(c, e, 404); } });
api.put('/api/desk/files/*', async (c) => {
  const rel = decodeURIComponent(c.req.path.split('/files/')[1] ?? ''); const { text } = await c.req.json<{ text: string }>();
  try { deskStore.writeRaw(rel, text); return c.json({ ok: true }); } catch (e) { return bad(c, e); }
});
api.post('/api/islands', async (c) => {
  const { name, kind, position } = await c.req.json<{ name: string; kind?: string; position?: string }>();
  if (!name?.trim()) return bad(c, new Error('name is empty'));
  try { return c.json(islands.upsert(islands.slugify(name), { name: name.trim(), kind, position: position as any })); } catch (e) { return bad(c, e); }
});
api.post('/api/islands/:slug', async (c) => { try { return c.json(islands.upsert(c.req.param('slug'), await c.req.json())); } catch (e) { return bad(c, e); } });
api.post('/api/mail/:uid/handled', (c) => { mail.markHandled(Number(c.req.param('uid'))); return c.json({ ok: true }); });
api.post('/api/mail/:uid/draft', (c) => {
  const m = mail.get(Number(c.req.param('uid'))); if (!m) return bad(c, new Error('no such mail'), 404);
  void runner.run({ mode: 'drafter', channel: 'web', text: `Draft a reply to this mail. From: ${m.senderName ? `${m.senderName} <${m.sender}>` : m.sender}. Subject: ${m.subject}. You only have the subject and sender; write a short reply in the user's voice that moves it forward, with [brackets] for anything you don't know. deliver it to mail as "reply-${m.uid}.md".` }).catch(() => {});
  return c.json({ ok: true });
});
api.get('/api/out', (c) => c.json(out.list()));
api.get('/api/out/:domain/:name', (c) => { try { return c.json({ content: out.read(c.req.param('domain'), c.req.param('name')) }); } catch (e) { return bad(c, e, 404); } });
api.get('/api/interview', (c) => c.json(interview.current()));
api.post('/api/interview/answer', async (c) => { const { id, value } = await c.req.json<{ id: string; value: string }>(); try { return c.json(interview.answer(id, value ?? '')); } catch (e) { return bad(c, e); } });
api.post('/api/interview/restart', (c) => c.json(interview.restart()));
api.post('/api/interview/skip', async (c) => { const { index } = await c.req.json<{ index: number }>(); return c.json(interview.skipTo(Number(index))); });


api.get('/api/threads/:mode', (c) => {
  try { const mode = c.req.param('mode'); return c.json({ mode, inserted: runner.insertedFor(mode), messages: store.getMessages(mode).map(view) }); }
  catch (e) { return bad(c, e, 404); }
});
api.post('/api/threads/:mode/messages', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return bad(c, new Error('text is empty'));
  try { return c.json({ text: await runner.run({ mode: c.req.param('mode'), text: text.trim(), channel: 'web' }) }); }
  catch (e) { return bad(c, e, 500); }
});
api.post('/api/threads/:mode/reset', (c) => { store.reset(c.req.param('mode')); return c.json({ ok: true }); });
api.put('/api/threads/:mode/cartridges', async (c) => {
  const { cartridges: list } = await c.req.json<{ cartridges: string[] }>();
  try { return c.json({ inserted: runner.setCartridges(c.req.param('mode'), list ?? []) }); } catch (e) { return bad(c, e); }
});

api.get('/api/tools', (c) => c.json({ defaults: DEFAULT_TOOLS, info: TOOL_INFO }));
api.get('/api/modes/:name', (c) => { try { return c.json(modes.readParsed(c.req.param('name'))); } catch (e) { return bad(c, e, 404); } });
api.put('/api/modes/:name', async (c) => {
  const { data, body } = await c.req.json<{ data: Record<string, any>; body: string }>();
  try { modes.writeParsed(c.req.param('name'), data, body); return c.json({ ok: true }); } catch (e) { return bad(c, e); }
});
api.get('/api/modes/:name/raw', (c) => { try { return c.json({ text: modes.readRaw(c.req.param('name')) }); } catch (e) { return bad(c, e, 404); } });
api.put('/api/modes/:name/raw', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  try { modes.writeRaw(c.req.param('name'), text); return c.json({ ok: true }); } catch (e) { return bad(c, e); }
});

api.post('/api/cartridges', async (c) => {
  const { name, description } = await c.req.json<{ name: string; description?: string }>();
  try { const { dir, memoriesDir, ...x } = cartridges.create(name, description); return c.json(x); } catch (e) { return bad(c, e); }
});
api.get('/api/cartridges/:name/files/*', (c) => {
  try {
    const rel = decodeURIComponent(c.req.path.split('/files/')[1] ?? '');
    return c.json({ path: rel, content: readMemory(cartridges.get(c.req.param('name')).memoriesDir, rel) });
  } catch (e) { return bad(c, e, 404); }
});

api.get('/api/approvals', (c) => c.json(runner.pendingApprovals()));
api.post('/api/approvals/:id', async (c) => {
  const { approved, reason } = await c.req.json<{ approved: boolean; reason?: string }>();
  return c.json({ ok: runner.answerApproval(c.req.param('id'), !!approved, reason ?? (approved ? 'approved in web app' : 'denied in web app')) });
});

api.get('/api/usage', (c) => c.json(budget.todayUsage()));
api.get('/api/events', (c) => c.json(listEvents({ thread: c.req.query('thread') || undefined, after: Number(c.req.query('after') ?? 0), limit: Number(c.req.query('limit') ?? 400) })));

api.get('/events', (c) => {
  const thread = c.req.query('thread') || null;
  return streamSSE(c, async (stream) => {
    let open = true;
    const unsub = subscribe((e) => {
      if (thread && e.thread && e.thread !== thread) return;
      stream.writeSSE({ event: 'agent', data: JSON.stringify(e), id: e.id ? String(e.id) : undefined }).catch(() => {});
    });
    stream.onAbort(() => { open = false; unsub(); });
    while (open) { await stream.sleep(15_000); await stream.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => { open = false; }); }
    unsub();
  });
});

function view(m: ModelMessage) {
  const parts = typeof m.content === 'string'
    ? [{ type: 'text', text: m.content }]
    : (m.content as any[]).map((p) =>
      p.type === 'text' ? { type: 'text', text: p.text }
      : p.type === 'reasoning' ? { type: 'reasoning', text: p.text }
      : p.type === 'tool-call' ? { type: 'tool-call', toolName: p.toolName, input: p.input }
      : p.type === 'tool-result' ? { type: 'tool-result', toolName: p.toolName, output: p.output }
      : p.type === 'tool-approval-response' ? { type: 'approval', approved: p.approved, reason: p.reason }
      : { type: p.type });
  return { role: m.role, parts };
}
