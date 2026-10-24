import { execFile, spawn } from 'node:child_process';
import readline from 'node:readline';
import { promisify } from 'node:util';
import * as runner from '../agent/runner.ts';
import { ALLOWED_HANDLES, IMESSAGE_ENABLED, IMSG_BIN } from '../config.ts';
import { emit, subscribe } from '../events/log.ts';
import * as modes from '../modes/registry.ts';
import * as store from '../threads/store.ts';
import * as outbound from './outbound.ts';
import * as checkins from '../desk/checkins.ts';

const exec = promisify(execFile);
const norm = (h: string) => String(h ?? '').replace(/[\s()-]/g, '').toLowerCase();
const allowed = (h: string) => ALLOWED_HANDLES.some((a) => norm(a) === norm(h));
const modeFor = new Map<string, string>();
const defaultMode = () => (modes.names().includes('assistant') ? 'assistant' : modes.names()[0]);

export async function send(to: string | null, text: string) {
  const target = to ?? ALLOWED_HANDLES[0];
  if (!target) throw new Error('no iMessage recipient: set ALLOWED_HANDLES');
  for (const chunk of chunks(text)) await exec(IMSG_BIN, ['send', '--to', target, '--text', chunk, '--json']);
  emit('imessage.sent', null, { to: target, chars: text.length });
}
const chunks = (t: string, n = 1800) => { const out: string[] = []; for (let i = 0; i < t.length; i += n) out.push(t.slice(i, i + n)); return out.length ? out : ['']; };

export function start() {
  if (!IMESSAGE_ENABLED) { emit('imessage.disabled', null, { reason: 'ALLOWED_HANDLES is empty' }); return; }
  outbound.register('imessage', send);
  outbound.addUserChannel('imessage', ALLOWED_HANDLES[0]);
  subscribe((e) => {
    if (e.type !== 'approval.requested') return;
    const d = e.data as any;
    send(null, `Approve ${d.toolName}?${d.reason ? ` ${d.reason}.` : ''}\n${JSON.stringify(d.input ?? {}).slice(0, 300)}\nReply yes or no.`)
      .catch((err) => emit('imessage.error', e.thread, { error: err.message }));
  });
  watch();
}

function watch() {
  const args = ['watch', '--json', ...(ALLOWED_HANDLES.length === 1 ? ['--participants', ALLOWED_HANDLES[0]] : [])];
  const child = spawn(IMSG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  emit('imessage.watch', null, { pid: child.pid, args });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let m: any; try { m = JSON.parse(line); } catch { return; }
    handle(m).catch((err) => emit('imessage.error', null, { error: err.message }));
  });
  child.stderr.on('data', (d) => emit('imessage.stderr', null, { text: String(d).slice(0, 500) }));
  child.on('exit', (code) => { emit('imessage.watch.exit', null, { code }); setTimeout(watch, 5000); });
}

async function handle(m: any) {
  if (m.is_from_me) return;
  const from: string = m.sender ?? m.handle ?? '';
  const text: string = String(m.text ?? '').trim();
  if (!text) return;
  if (!allowed(from)) { emit('imessage.ignored', null, { from: `…${from.slice(-4)}`, reason: 'not in ALLOWED_HANDLES' }); return; }
  const key = norm(from), mode = modeFor.get(key) ?? defaultMode(), lower = text.toLowerCase();

  if (/^[a-d]$/.test(lower) || /^[1-4]$/.test(lower)) { // check-in letters; yes/no stay for approvals
    const k = /^\d$/.test(lower) ? 'abcd'[Number(lower) - 1] : lower;
    const c = checkins.latestOpen();
    if (!c) return send(from, 'No request is open.');
    try { return send(from, await checkins.answer(c.id, k, 'imessage')); } catch (e) { return send(from, (e as Error).message); }
  }
  if (/^(yes|y|approve|ok|allow)$/.test(lower)) { if (!runner.answerLatest(mode, true, 'approved via iMessage')) await send(from, 'No approval request is open.'); return; }
  if (/^(no|n|deny|stop)$/.test(lower)) { if (!runner.answerLatest(mode, false, 'denied via iMessage')) await send(from, 'No approval request is open.'); return; }
  if (lower.startsWith('/mode')) {
    const name = text.split(/\s+/)[1];
    if (!name) return send(from, `Mode: ${mode}. Available: ${modes.names().join(', ')}`);
    try { modes.get(name); modeFor.set(key, name); return send(from, `Mode → ${name}`); } catch (e) { return send(from, (e as Error).message); }
  }
  if (lower.startsWith('/cartridge')) {
    const [, verb, name] = text.split(/\s+/);
    try {
      const cur = runner.insertedFor(mode);
      if (verb === 'insert' && name) runner.setCartridges(mode, [...new Set([...cur, name])]);
      if (verb === 'eject' && name) runner.setCartridges(mode, cur.filter((c) => c !== name));
    } catch (e) { return send(from, (e as Error).message); }
    return send(from, `Cartridges in ${mode}: ${runner.insertedFor(mode).join(', ') || 'none'}`);
  }
  if (lower === '/reset') { store.reset(mode); return send(from, `Thread "${mode}" reset.`); }
  if (lower === '/help') return send(from, 'Commands: /mode <name>, /cartridge insert|eject <name>, /reset, yes, no');

  const reply = await runner.run({ mode, text, channel: 'imessage', from });
  if (reply) await send(from, reply);
}
