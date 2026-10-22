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
import * as store from '../threads/store.ts';
import * as outbound from './outbound.ts';

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
}));

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
