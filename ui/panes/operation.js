import { $, esc, fmt } from '../lib.js';
import { state } from '../app.js';

const GROUPS = {
  model: { label: 'Model', help: 'the prompt it was given, its reasoning, tokens used', types: ['prompt.assembled', 'model.request', 'reasoning', 'usage', 'source', 'compaction'] },
  tool: { label: 'Tools', help: 'every tool call and what came back', types: ['tool.call', 'tool.result', 'tool.error', 'tool.denied'] },
  memory: { label: 'Memory', help: 'notes written, cartridges inserted or ejected', types: ['memory.write', 'cartridges.changed', 'cartridge.missing'] },
  policy: { label: 'Permissions', help: 'what was allowed, blocked, or paused to ask you', types: ['policy.decision', 'approval.requested', 'approval.resolved'] },
  channel: { label: 'Channels', help: 'messages in and out, iMessage, scheduled runs', types: ['inbound', 'outbound', 'imessage.sent', 'imessage.ignored', 'imessage.error', 'imessage.watch', 'imessage.watch.exit', 'imessage.stderr', 'imessage.disabled', 'schedule.tick', 'schedule.loaded', 'schedule.error'] },
  loop: { label: 'Loop', help: 'each tick, check-ins, what landed in out/, the desk files', types: ['settings.changed', 'loop.tick', 'loop.started', 'loop.error', 'checkin.opened', 'checkin.sent', 'checkin.send_error', 'checkin.reminded', 'checkin.snoozed', 'checkin.answered', 'checkin.archived', 'checkin.handoff_error', 'out.written', 'desk.reloaded', 'watch.export', 'watch.mail', 'watch.mail_error', 'mail.sorted', 'mail.handled', 'logbook', 'observation', 'interview.answered', 'interview.restarted'] },
  budget: { label: 'Budget', help: 'free-token limits kicking in', types: ['budget.refused', 'budget.downgraded'] },
  system: { label: 'System', help: 'startup, mode reloads, errors', types: ['mode.reloaded', 'mode.error', 'daemon.started', 'daemon.listening', 'daemon.stopping', 'server.error', 'error'] },
};
const groupOf = (type) => Object.keys(GROUPS).find((g) => GROUPS[g].types.includes(type)) ?? 'system';
const hidden = new Set(JSON.parse(localStorage.getItem('omni.hidden') || '[]'));
let tokens = 0;

function filters() {
  $('#filters').innerHTML = Object.entries(GROUPS).map(([g, v]) => `<label title="${esc(v.help)}"><input type="checkbox" data-g="${g}" ${hidden.has(g) ? '' : 'checked'}><i class="c-${g}"></i>${v.label}</label>`).join('');
  $('#filters').querySelectorAll('input').forEach((i) => i.addEventListener('change', () => { i.checked ? hidden.delete(i.dataset.g) : hidden.add(i.dataset.g); localStorage.setItem('omni.hidden', JSON.stringify([...hidden])); renderEvents(); }));
}
filters();

const EMPTY = `<div class="intro">Nothing has happened in this mode yet. After your first message you will see, in order:
<ul><li><b>prompt</b> — the exact instructions and memory it was given</li><li><b>request</b> and <b>thinking</b> — the model call and its reasoning summary</li><li><b>permission</b>, <b>tool</b>, <b>result</b> — each thing it did, and whether it had to ask you</li><li><b>memory</b> — notes it saved</li><li><b>tokens</b> and <b>out</b> — what it cost and what it replied</li></ul>Click any row for the raw data. Untick a group above to hide it.</div>`;

export function renderEvents() {
  const box = $('#events');
  tokens = 0;
  const rows = state.events.map(row).join('');
  box.innerHTML = rows || EMPTY;
  wire(box);
  $('#counter').textContent = tokens ? `${fmt(tokens)} tokens in view` : '';
  box.scrollTop = box.scrollHeight;
}
export function pushEvent(e) {
  const box = $('#events');
  if (box.querySelector('.intro')) box.innerHTML = '';
  const tmp = document.createElement('div'); tmp.innerHTML = row(e);
  wire(tmp);
  while (tmp.firstChild) box.appendChild(tmp.firstChild);
  $('#counter').textContent = tokens ? `${fmt(tokens)} tokens in view` : '';
  if (box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
  if (e.type === 'outbound' || e.type === 'error') $('#live').textContent = '';
}
let liveKind = '';
export function pushLive(e) {
  const live = $('#live');
  const kind = e.type === 'reasoning.delta' ? 'thinking' : e.type === 'text.delta' ? 'writing' : e.type === 'tool.input.start' ? `calling ${e.data.toolName}` : '';
  if (kind !== liveKind) { liveKind = kind; live.textContent = `${kind}: `; }
  if (e.type === 'reasoning.delta' || e.type === 'text.delta') live.textContent += e.data.text;
  live.scrollTop = live.scrollHeight;
}

function wire(root) {
  root.querySelectorAll('.head').forEach((h) => h.addEventListener('click', () => { const ev = h.parentElement; ev.classList.toggle('open'); const pre = h.nextElementSibling; pre.hidden = !pre.hidden; }));
}

const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function tickBlock(d) {
  const s = d.status || {}, dec = d.decisions || [], w = d.waiting || [], ina = d.inaction || [];
  const L = [];
  L.push(`LOOK — ${new Date(d.at).toLocaleDateString([], { weekday: 'short' })} @ ${hm(d.at)}${d.why !== 'cron' ? ` (${d.why})` : ''}${d.next ? ` · next ${hm(d.next)}` : ''}`);
  if (d.paused) { L.push('• PAUSED by you. Nothing looked, nothing asked.'); return L.join('\n'); }
  L.push('• CURRENT STATUS');
  L.push(`•• Check-ins: ${s.checkins}`);
  L.push(`•• Activity: ${s.activity}`);
  L.push(`•• Texting: ${s.quiet}`);
  L.push(`•• Medicine: ${s.medicine}`);
  L.push(`•• Apartment: ${s.apartment}`);
  L.push(`•• Export folder: ${s.export}`);
  L.push(`•• Email: ${s.mail}`);
  L.push(`•• Islands: ${s.islands}`);
  L.push('• DECISIONS');
  L.push(`•• Total: ${dec.length}`);
  dec.forEach((x, i) => L.push(`•••• ${i + 1}. ${x}`));
  L.push(`•• Waiting on you: ${w.length}`);
  w.forEach((x, i) => L.push(`•••• ${i + 1}. ${x.what} — asked ${hm(x.since)}; ${x.next}`));
  L.push(`•• Looked at and left, with reason: ${ina.length}`);
  ina.forEach((x) => L.push(`•••• ${x.what}: ${x.why}`));
  return L.join('\n');
}

function row(e) {
  const g = groupOf(e.type);
  if (hidden.has(g)) return '';
  if (e.type === 'loop.tick' && e.data?.paused) return '';
  if (e.type === 'checkin.answered' && e.data?.action === 'log') return '';
  if (e.type === 'loop.tick' && e.data?.status) {
    const t = new Date(e.ts).toLocaleTimeString([], { hour12: false });
    return `<div class="ev g-loop tick"><div class="head" title="click for the raw data"><span class="t">${t}</span><span class="sum"><span class="type">tick</span><pre class="tickblock">${esc(tickBlock(e.data))}</pre></span></div><pre hidden>${esc(JSON.stringify(e.data, null, 2))}</pre></div>`;
  }
  if (e.type === 'usage') tokens += e.data.usage?.totalTokens ?? 0;
  const t = new Date(e.ts).toLocaleTimeString([], { hour12: false });
  return `<div class="ev g-${g} ${e.type === 'error' ? 'error' : ''}"><div class="head" title="click for the raw data"><span class="t">${t}</span><span class="sum">${esc(summary(e))}</span></div><pre hidden>${esc(JSON.stringify(e.data, null, 2))}</pre></div>`;
}

const j = (v, n = 160) => { const s = typeof v === 'string' ? v : JSON.stringify(v) ?? ''; return s.length > n ? `${s.slice(0, n)}…` : s; };

function summary(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'inbound': return d.channel === 'schedule' ? `Scheduled run: ${d.text}` : d.channel === 'web' ? `You said: ${d.text}` : `You said over ${d.channel}: ${d.text}`;
    case 'outbound': return d.channel === 'notify' ? `Pushed to you (${(d.targets || []).map((x) => x.channel).join(', ')}): ${d.text}` : `Replied via ${d.channel}: ${d.text}`;
    case 'prompt.assembled': return `Built the prompt for ${d.model}: ${d.messages} messages, ${d.tools?.length ?? 0} tools, memory ${d.cartridges?.length ? d.cartridges.join(', ') : 'none'}, about ${fmt(d.estimate)} tokens`;
    case 'model.request': return `Asked ${d.model}`;
    case 'reasoning': return `Thought: ${d.text}`;
    case 'tool.call': return `Called ${d.toolName} with ${j(d.input)}`;
    case 'tool.result': return `${d.toolName} returned ${j(d.output)}`;
    case 'tool.error': return `${d.toolName} failed: ${d.error}`;
    case 'tool.denied': return 'A tool call was denied and the model was told';
    case 'policy.decision': return d.decision === 'not-applicable' ? `${d.tool}: read-only, no permission needed`
      : d.decision === 'approved' ? `${d.tool}: allowed (${d.level})`
      : d.decision === 'denied' ? `${d.tool}: blocked — ${d.reason}`
      : `${d.tool}: paused to ask you — ${d.reason}`;
    case 'approval.requested': return `Waiting for you: ${d.toolName}${d.reason ? ` — ${d.reason}` : ''}`;
    case 'approval.resolved': return `You ${d.approved ? 'allowed' : 'denied'} ${d.toolName}${d.reason ? ` (${d.reason})` : ''}`;
    case 'memory.write': return `${d.op === 'write' ? 'Wrote' : d.op === 'edit' ? 'Edited' : 'Deleted'} memory note ${d.path}`;
    case 'cartridges.changed': return `Memory cartridges now: ${(d.cartridges || []).join(', ') || 'none'}`;
    case 'usage': return `${d.model} used ${fmt(d.usage?.inputTokens)} in, ${fmt(d.usage?.outputTokens)} out (${d.finishReason})`;
    case 'compaction': return `Compacted the conversation: dropped ${d.dropped} messages, kept ${d.kept}${d.savedTo ? `, summary saved to ${d.savedTo}` : ''}`;
    case 'budget.downgraded': return `Budget nearly spent: switched ${d.from} → ${d.to}`;
    case 'budget.refused': return `Stopped: needs about ${fmt(d.estimate)} tokens, only ${fmt(d.remaining)} left today`;
    case 'schedule.tick': return `Scheduled run (${d.cron}): ${d.prompt}`;
    case 'loop.tick': return `Saw ${Object.entries(d.saw || {}).map(([k, v]) => `${k} ${Array.isArray(v) ? (v.length || 'none') : v}`).join(', ')}. ${d.did?.length ? `Did: ${d.did.join('; ')}.` : 'Did nothing.'} ${d.left?.length ? `Left alone: ${d.left.join('; ')}.` : ''}`;
    case 'loop.started': return `I now look every ${d.everyMin} minutes`;
    case 'settings.changed': return `You changed ${d.key} from ${d.from === undefined ? '(unset)' : JSON.stringify(d.from)} to ${JSON.stringify(d.to)}`;
    case 'checkin.opened': return `${d.title} ${(d.options || []).join(' ')}`;
    case 'checkin.sent': return `Texted it (${d.why})`;
    case 'checkin.reminded': return `Came back about: ${d.title} (${d.why}, ${d.reminders}×)`;
    case 'checkin.snoozed': return `Snoozed until ${new Date(d.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${d.title}`;
    case 'checkin.answered': return `You chose ${d.answer}) ${d.label} via ${d.via}: ${d.title}`;
    case 'checkin.archived': return `Filed (${d.reason}): ${d.title}`;
    case 'out.written': return `Wrote out/${d.domain}/${d.name} (${d.by})`;
    case 'desk.reloaded': return `desk/${d.file} changed on disk, reloaded`;
    case 'watch.export': return `New in the export folder: ${(d.fresh || []).join(', ')}`;
    case 'watch.mail': return `Read ${d.fresh} new message${d.fresh === 1 ? '' : 's'}`;
    case 'mail.sorted': return `Triage sorted ${d.sorted} of ${d.of}`;
    case 'logbook': return d.kind === 'medicine' ? 'Your medicine has been logged.' : d.kind === 'chores' ? 'Your apartment chores have been logged.' : `Recorded an entry in ${d.kind}.`;
    case 'observation': return `Noted: ${d.text}`;
    case 'interview.answered': return `Interview: answered ${d.id}${d.done ? ' — done' : ''}`;
    case 'schedule.loaded': return `${(d.jobs || []).length} scheduled runs loaded`;
    case 'mode.reloaded': return `Mode files reloaded: ${(d.names || []).join(', ')}`;
    case 'daemon.started': return `Agent started: ${(d.modes || []).length} modes, ${d.skills} skills, iMessage ${d.imessage ? 'on' : 'off'}`;
    case 'daemon.listening': return `Web app at ${d.url}`;
    case 'imessage.sent': return `Sent an iMessage (${d.chars} chars)`;
    case 'imessage.ignored': return `Ignored an iMessage from ${d.from} (not in ALLOWED_HANDLES)`;
    case 'imessage.watch': return 'Watching Messages for new texts';
    case 'imessage.disabled': return 'iMessage off: ALLOWED_HANDLES is empty';
    case 'error': case 'server.error': case 'schedule.error': case 'imessage.error': case 'mode.error': case 'loop.error': case 'watch.mail_error': case 'checkin.send_error': case 'checkin.handoff_error': return d.error || d.message || '';
    default: return j(d);
  }
}
