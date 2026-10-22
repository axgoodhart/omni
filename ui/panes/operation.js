import { $, esc, fmt } from '../lib.js';
import { state } from '../app.js';

const GROUPS = {
  model: ['prompt.assembled', 'model.request', 'reasoning', 'usage', 'source', 'compaction'],
  tool: ['tool.call', 'tool.result', 'tool.error', 'tool.denied'],
  memory: ['memory.write', 'cartridges.changed', 'cartridge.missing'],
  policy: ['policy.decision', 'approval.requested', 'approval.resolved'],
  channel: ['inbound', 'outbound', 'imessage.sent', 'imessage.ignored', 'imessage.error', 'imessage.watch', 'imessage.watch.exit', 'imessage.stderr', 'imessage.disabled', 'schedule.tick', 'schedule.loaded', 'schedule.error'],
  budget: ['budget.refused', 'budget.downgraded'],
  system: ['mode.reloaded', 'mode.error', 'daemon.started', 'daemon.listening', 'daemon.stopping', 'server.error', 'error'],
};
const groupOf = (type) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(type)) ?? 'system';
const hidden = new Set(JSON.parse(localStorage.getItem('omni.hidden') || '[]'));
let tokens = 0;

function filters() {
  $('#filters').innerHTML = Object.keys(GROUPS).map((g) => `<label><input type="checkbox" data-g="${g}" ${hidden.has(g) ? '' : 'checked'}> ${g}</label>`).join('');
  $('#filters').querySelectorAll('input').forEach((i) => i.addEventListener('change', () => { i.checked ? hidden.delete(i.dataset.g) : hidden.add(i.dataset.g); localStorage.setItem('omni.hidden', JSON.stringify([...hidden])); renderEvents(); }));
}
filters();

export function renderEvents() {
  const box = $('#events');
  tokens = 0;
  box.innerHTML = state.events.map(row).join('');
  wire(box);
  $('#counter').textContent = tokens ? `${fmt(tokens)} tokens in view` : '';
  box.scrollTop = box.scrollHeight;
}
export function pushEvent(e) {
  const box = $('#events');
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

function wire(root) { root.querySelectorAll('.head').forEach((h) => h.addEventListener('click', () => { const pre = h.nextElementSibling; pre.hidden = !pre.hidden; })); }

function row(e) {
  const g = groupOf(e.type);
  if (hidden.has(g)) return '';
  if (e.type === 'usage') tokens += e.data.usage?.totalTokens ?? 0;
  const t = new Date(e.ts).toLocaleTimeString([], { hour12: false });
  return `<div class="ev g-${g} ${e.type === 'error' ? 'error' : ''}"><div class="head"><span class="t">${t}</span><span class="type">${esc(e.type)}</span><span class="sum">${esc(summary(e))}</span></div><pre hidden>${esc(JSON.stringify(e.data, null, 2))}</pre></div>`;
}

function summary(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'inbound': return `${d.channel}${d.from ? ` ${d.from}` : ''}: ${d.text}`;
    case 'outbound': return `${d.channel}: ${d.text}`;
    case 'prompt.assembled': return `${d.model} · ${d.messages} msgs · tools ${d.tools?.length} · cartridges ${d.cartridges?.join(', ') || 'none'} · ~${fmt(d.estimate)} tok`;
    case 'model.request': return d.model;
    case 'reasoning': return d.text;
    case 'tool.call': return `${d.toolName}(${JSON.stringify(d.input)})`;
    case 'tool.result': return `${d.toolName} → ${typeof d.output === 'string' ? d.output : JSON.stringify(d.output)}`;
    case 'tool.error': return `${d.toolName}: ${d.error}`;
    case 'policy.decision': return `${d.tool}: ${d.decision}${d.reason ? ` (${d.reason})` : ''} [${d.level}]`;
    case 'approval.requested': return `${d.toolName}: ${d.reason || 'needs your approval'}`;
    case 'approval.resolved': return `${d.toolName}: ${d.approved ? 'approved' : 'denied'}${d.reason ? ` — ${d.reason}` : ''}`;
    case 'memory.write': return `${d.op} ${d.path}`;
    case 'usage': return `${d.model}: in ${fmt(d.usage?.inputTokens)} · out ${fmt(d.usage?.outputTokens)} · ${d.finishReason}`;
    case 'compaction': return `dropped ${d.dropped}, kept ${d.kept}${d.savedTo ? ` → ${d.savedTo}` : ''}`;
    case 'budget.downgraded': return `${d.from} → ${d.to} (${fmt(d.remaining)} left)`;
    case 'budget.refused': return `needs ~${fmt(d.estimate)}, ${fmt(d.remaining)} left`;
    case 'schedule.tick': return `${d.cron}: ${d.prompt}`;
    case 'mode.reloaded': return (d.names || []).join(', ');
    case 'error': case 'server.error': case 'schedule.error': case 'imessage.error': case 'mode.error': return d.error || d.message || '';
    default: return JSON.stringify(d);
  }
}
