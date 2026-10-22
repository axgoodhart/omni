import { renderThread, onDelta, startStreaming, stopStreaming } from './panes/thread.js';
import { renderEvents, pushEvent, pushLive } from './panes/operation.js';
import { renderSide } from './panes/side.js';

import { $, api, esc, fmt } from './lib.js';

export const state = { mode: null, data: null, thread: null, events: [], busy: false };

export async function refresh() {
  state.data = await api('/api/state');
  if (!state.mode || !state.data.modes.some((m) => m.name === state.mode)) state.mode = localStorage.getItem('omni.mode') || state.data.modes[0]?.name || null;
  const sel = $('#mode');
  sel.innerHTML = state.data.modes.map((m) => `<option ${m.name === state.mode ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  $('#models').textContent = state.data.modes.find((m) => m.name === state.mode)?.model ?? '';
  renderBudget(state.data.usage);
  await loadThread();
  renderSide();
}

export async function loadThread() {
  if (!state.mode) return;
  state.thread = await api(`/api/threads/${encodeURIComponent(state.mode)}`);
  state.events = await api(`/api/events?thread=${encodeURIComponent(state.mode)}&limit=400`);
  renderThread(); renderEvents();
}

function renderBudget(u) {
  if (!u) return;
  const pct = u.budget ? Math.min(100, Math.round((u.total / u.budget) * 100)) : 0;
  $('#budget-fill').style.width = `${pct}%`;
  $('#budget-text').textContent = u.budget ? `${fmt(u.total)} / ${fmt(u.budget)} tokens today (${pct}%)` : `${fmt(u.total)} tokens today`;
}

function connect() {
  const es = new EventSource('/events');
  es.addEventListener('agent', (ev) => {
    const e = JSON.parse(ev.data);
    if (e.thread && e.thread !== state.mode) { if (['approval.requested', 'approval.resolved', 'usage', 'mode.reloaded'].includes(e.type)) refreshSoon(); return; }
    if (!e.id) { pushLive(e); if (e.type === 'text.delta') onDelta(e.data.text); return; }
    state.events.push(e); pushEvent(e);
    if (e.type === 'inbound' && e.data.channel !== 'web') { startStreaming(); loadThread(); }
    if (e.type === 'outbound') { stopStreaming(); loadThread(); }
    if (['approval.requested', 'approval.resolved', 'cartridges.changed', 'mode.reloaded', 'usage', 'schedule.loaded', 'memory.write'].includes(e.type)) refreshSoon();
  });
  es.onopen = () => $('#status').classList.add('on');
  es.onerror = () => { $('#status').classList.remove('on'); };
}
let t = null;
export function refreshSoon() { clearTimeout(t); t = setTimeout(() => { api('/api/state').then((d) => { state.data = d; renderBudget(d.usage); renderSide(); }).catch(() => {}); }, 300); }

$('#mode').addEventListener('change', async (e) => { state.mode = e.target.value; localStorage.setItem('omni.mode', state.mode); await refresh(); });
$('#reset').addEventListener('click', async () => { if (confirm(`Forget the "${state.mode}" conversation? Memory cartridges are kept.`)) { await api(`/api/threads/${state.mode}/reset`, { method: 'POST' }); await loadThread(); } });

refresh().then(connect).catch((e) => { $('#messages').textContent = `Failed to load: ${e.message}`; });
