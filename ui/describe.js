import { api, esc } from './lib.js';

/** Plain sentences for what an agent did: one for the step, one for how it went. Used by the chat, History and approval cards. */

const short = (s, n = 70) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const unquote = (s) => String(s ?? '').replace(/^['"]|['"]$/g, '');
const words = (cmd) => (String(cmd).match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map(unquote);
const pretty = (p) => unquote(p).replace(/^\/Users\/[^/]+/, '~').replace(/\*/g, '…');

/** "~/Documents" → "your Documents folder"; "a/b/Notes.txt" → "“Notes.txt” in a/b"; "." → "its work folder". */
export function place(p) {
  const s = pretty(p);
  if (!s || s === '.' || s === './') return 'its work folder';
  if (s === '~') return 'your home folder';
  const parts = s.replace(/\/$/, '').split('/'), name = parts.pop();
  const dir = parts.join('/');
  if (/\.[^./]+$/.test(name)) return dir ? `“${name}” in ${dir === '~' ? 'your home folder' : dir}` : `“${name}”`;
  return dir === '~' ? `your ${name} folder` : `the ${name} folder${dir ? ` in ${dir}` : ''}`;
}

function shell(cmd) {
  const first = String(cmd).split(/[|;&]/)[0].trim();
  const w = words(first), verb = (w[0] ?? '').split('/').pop(), args = w.slice(1).filter((a) => !a.startsWith('-') && !/^\d?>/.test(a) && a !== '/dev/null');
  const piped = /\|/.test(cmd) ? ' and narrowed the result' : '';
  if (verb === 'find') {
    const names = [...first.matchAll(/-i?name\s+('[^']*'|"[^"]*"|\S+)/g)].map((m) => `“${pretty(m[1])}”`);
    return `Searched ${place(args[0] ?? '.')}${names.length ? ` for files named like ${names.join(' or ')}` : ''}${piped}`;
  }
  if (['cat', 'head', 'tail', 'less', 'more', 'wc'].includes(verb)) return `Read ${args.length ? args.map(place).join(', ') : 'a file'}${piped}`;
  if (verb === 'ls') return `Listed ${place(args[0] ?? '.')}${piped}`;
  if (['grep', 'rg', 'ag'].includes(verb)) return `Searched inside files for “${short(args[0], 40)}”${args[1] ? ` in ${place(args[1])}` : ''}${piped}`;
  if (verb.startsWith('python')) return 'Ran a short Python script';
  if (verb === 'node') return 'Ran a short JavaScript script';
  if (verb === 'rm') return `Deleted ${args.map(place).join(', ')}`;
  if (verb === 'mv') return `Moved ${place(args[0])} to ${place(args[1])}`;
  if (verb === 'cp') return `Copied ${place(args[0])} to ${place(args[1])}`;
  if (verb === 'mkdir') return `Made ${place(args[0])}`;
  if (verb === 'curl' || verb === 'wget') return `Downloaded from ${short(args[0], 50)}`;
  return `Ran the command “${short(cmd, 60)}”`;
}

/** What a step is, as the user would say it. */
export function describeCall(tool, input = {}) {
  switch (tool) {
    case 'shell': return shell(input.command);
    case 'read_file': return `Read ${place(input.path)}`;
    case 'write_file': return `Wrote ${place(input.path)}`;
    case 'memory_view': { const [c, ...r] = String(input.path ?? '').replace(/^\/+/, '').split('/'); return r.join('') ? `Read its note “${r.join('/')}” in ${c}` : c ? `Looked through its “${c}” notes` : 'Looked through its notes'; }
    case 'memory_search': return `Searched its notes for “${short(input.query, 40)}”`;
    case 'memory_write': return `Saved a note, ${place(input.path)}`;
    case 'memory_edit': return `Edited its note ${place(input.path)}`;
    case 'memory_delete': return `Deleted its note ${place(input.path)}`;
    case 'fetch_url': { try { return `Opened a page on ${new URL(input.url).host}`; } catch { return 'Opened a web page'; } }
    case 'web_search': return `Searched the web for “${short(input.query, 50)}”`;
    case 'skill_read': return `Read the “${input.name}” instructions`;
    case 'notify': return 'Sent you a notification';
    case 'imessage_send': return `Texted ${input.to}`;
    case 'desk_view': return `Looked at ${input.path || 'the desk'}`;
    case 'deliver': return `Wrote “${input.name}” into out/${input.domain} for you to read`;
    default: return `Used ${tool}`;
  }
}

/** How a step went, in a few words; empty when there's nothing worth saying. */
export function describeResult(tool, input = {}, output) {
  const o = output?.type === 'json' || output?.type === 'text' ? output.value : output;
  if (output?.type === 'execution-denied') return 'you said no';
  if (output?.type === 'error-text' || output?.type === 'error-json') return `failed: ${short(typeof o === 'string' ? o : JSON.stringify(o), 80)}`;
  if (tool === 'shell' && o && typeof o === 'object') {
    if (o.code && o.code !== 0) return /No such file/i.test(o.stderr) ? "it wasn't there" : `failed: ${short(String(o.stderr || o.stdout).split('\n')[0], 80)}`;
    const lines = String(o.stdout ?? '').split('\n').filter(Boolean);
    if (/^find\b/.test(String(input.command).trim())) return lines.length ? `found ${lines.length}: ${lines.slice(0, 2).map((l) => place(l)).join(', ')}${lines.length > 2 ? '…' : ''}` : 'found nothing';
    return lines.length ? `${lines.length} line${lines.length === 1 ? '' : 's'} back` : '';
  }
  if (o && typeof o === 'object' && o.error) return `failed: ${short(o.error, 80)}`;
  return '';
}

const PRESENT = { Searched: 'search', Read: 'read', Wrote: 'write', Deleted: 'delete', Moved: 'move', Copied: 'copy', Made: 'make', Ran: 'run', Saved: 'save', Edited: 'edit', Texted: 'text', Opened: 'open', Listed: 'list', Looked: 'look', Sent: 'send', Used: 'use', Downloaded: 'download' };
/** An approval request as a sentence: "Omnii would like to delete “notes.txt”." */
export function askSentence(tool, input) {
  const [verb, ...rest] = describeCall(tool, input).split(' ');
  return `Omnii would like to ${PRESENT[verb] ?? verb.toLowerCase()} ${rest.join(' ').replace('and narrowed', 'and narrow')}.`;
}

/** An approval waiting on you: what Omnii wants to do, why it's asking, and the choices. "Always allow" appears only when the request offers a narrow rule to remember. */
export const askCard = (p, where = '') => `<div class="ask-card" data-id="${esc(p.approvalId)}">
  <p class="ask-what">${esc(askSentence(p.toolName, p.input))}</p>
  <p class="ask-note">${p.reason ? `Asking because ${esc(p.reason)}. ` : ''}${where ? `${esc(where)} ` : ''}Nothing runs until you choose.</p>
  <div class="ask-btns"><button type="button" data-ok="1">Allow once</button>${p.always ? `<button type="button" data-ok="1" data-always="1" data-tip="From now on Omnii may ${esc(p.always.label)} without asking. Take it back any time on the Config page.">Always allow this</button>` : ''}<button type="button" class="ghost" data-ok="0">Don't allow</button></div>
</div>`;
export function wireAsks(root) {
  root.querySelectorAll('.ask-card button').forEach((b) => b.addEventListener('click', () => api(`/api/approvals/${encodeURIComponent(b.closest('.ask-card').dataset.id)}`, { method: 'POST', body: { approved: b.dataset.ok === '1', always: b.dataset.always === '1' } })));
}
