import { renderThread, onDelta, startStreaming, stopStreaming } from './panes/thread.js';
import { renderEvents, pushEvent, pushLive } from './panes/operation.js';
import { renderSide, openDrawer } from './panes/side.js';
import { $, api, esc, fmt } from './lib.js';

export const state = { mode: null, data: null, thread: null, events: [], busy: false };
const pad = (n) => String(n).padStart(2, '0');

export async function refresh() {
  state.data = await api('/api/state');
  if (!state.mode || !state.data.modes.some((m) => m.name === state.mode)) state.mode = localStorage.getItem('omni.mode') || state.data.modes[0]?.name || null;
  renderShell();
  await loadThread();
  renderSide();
}

export async function loadThread() {
  if (!state.mode) return;
  state.thread = await api(`/api/threads/${encodeURIComponent(state.mode)}`);
  state.events = await api(`/api/events?thread=${encodeURIComponent(state.mode)}&limit=400`);
  renderThread(); renderEvents();
}

export const currentMode = () => state.data?.modes.find((m) => m.name === state.mode);

export async function switchMode(name) {
  if (name === state.mode) return;
  state.mode = name; localStorage.setItem('omni.mode', name);
  renderShell(); await loadThread(); renderSide();
}

function renderShell() {
  const d = state.data, cur = currentMode(), idx = d.modes.findIndex((m) => m.name === state.mode);
  const inserted = new Set(cur?.inserted ?? []), pending = d.pending ?? [];

  $('#nav-modes').innerHTML = d.modes.map((m, i) => `<li><button class="nav-item ${m.name === state.mode ? 'active' : ''}" data-mode="${esc(m.name)}" title="${esc(m.voice || m.model)}"><span class="n">${pad(i + 1)}</span>${esc(m.name)}${m.busy ? '<span class="live" title="working"></span>' : ''}</button></li>`).join('');
  $('#nav-memory').innerHTML = d.cartridges.map((c) => `<li><button class="nav-item ${inserted.has(c.name) ? 'active' : ''}" data-drawer="memory" title="${inserted.has(c.name) ? 'inserted: the agent can read and write it' : 'on the shelf: kept, but invisible to the agent'}"><span class="n">${inserted.has(c.name) ? '▮' : '▯'}</span>${esc(c.name)}<span class="count">${c.files.length} note${c.files.length === 1 ? '' : 's'}</span></button></li>`).join('')
    + `<li><button class="nav-item" data-drawer="memory"><span class="n">+</span>insert, eject, create</button></li>`;
  $('#nav-attention').innerHTML = `<li><button class="nav-item ${pending.length ? 'alert' : ''}" data-drawer="approvals"><span class="n">${pending.length || '–'}</span>${pending.length ? `waiting for you` : 'approvals'}</button></li>`;
  $('#nav-setup').innerHTML = [['mode', 'prompt & settings'], ['more', 'skills, schedules, channels']].map(([k, label]) => `<li><button class="nav-item" data-drawer="${k}"><span class="n">→</span>${label}</button></li>`).join('');
  document.querySelectorAll('#nav-modes .nav-item').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
  document.querySelectorAll('[data-drawer]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.drawer)));

  const u = d.usage, pct = u.budget ? Math.min(100, Math.round((u.total / u.budget) * 100)) : 0;
  $('#budget-fill').style.width = `${pct}%`;
  $('#budget-text').textContent = u.budget ? `free tokens today · ${fmt(u.total)} of ${fmt(u.budget)}` : `${fmt(u.total)} tokens today`;
  $('#imessage-label').textContent = d.imessage ? 'imessage · on' : 'imessage · off';

  if (!cur) return;
  $('#mode-num').textContent = pad(idx + 1);
  $('#mode-title').textContent = cur.name;
  $('#mode-sub').textContent = cur.voice || `Permissions: ${cur.permissions.mode}. Edit this mode under Setup.`;
  $('#mode-tags').innerHTML = [
    `<span class="plate-tag" title="the model this mode thinks with">${esc(cur.model)}</span>`,
    `<span class="plate-tag focus" title="when it has to ask you first">${esc(cur.permissions.mode)}</span>`,
    `<span class="plate-tag sage" title="memory cartridges it can use right now">memory · ${esc(cur.inserted?.length ? cur.inserted.join(', ') : 'none')}</span>`,
    `<span class="plate-tag clay" title="tools it may use">${cur.tools ? cur.tools.length : d.tools.defaults.length} tools</span>`,
  ].join('');
}

function connect() {
  const es = new EventSource('/events');
  es.addEventListener('agent', (ev) => {
    const e = JSON.parse(ev.data);
    if (e.thread && e.thread !== state.mode) { if (['approval.requested', 'approval.resolved', 'usage', 'mode.reloaded', 'inbound', 'outbound'].includes(e.type)) refreshSoon(); return; }
    if (!e.id) { pushLive(e); if (e.type === 'text.delta') onDelta(e.data.text); return; }
    state.events.push(e); pushEvent(e);
    if (e.type === 'inbound' && e.data.channel !== 'web') { startStreaming(); loadThread(); }
    if (e.type === 'outbound') { stopStreaming(); loadThread(); }
    if (e.type === 'approval.requested') openDrawer('approvals');
    if (['approval.requested', 'approval.resolved', 'cartridges.changed', 'mode.reloaded', 'usage', 'schedule.loaded', 'memory.write', 'inbound', 'outbound'].includes(e.type)) refreshSoon();
  });
  es.onopen = () => { $('#status').textContent = 'personal agent · live'; $('#status').classList.add('on'); };
  es.onerror = () => { $('#status').textContent = 'reconnecting…'; $('#status').classList.remove('on'); };
}
let t = null;
export function refreshSoon() {
  clearTimeout(t);
  t = setTimeout(() => { api('/api/state').then((d) => { state.data = d; renderShell(); renderSide(); renderThread(); }).catch(() => {}); }, 300);
}

$('#reset').addEventListener('click', async () => {
  if (confirm(`Forget the "${state.mode}" conversation? Memory cartridges are kept.`)) { await api(`/api/threads/${state.mode}/reset`, { method: 'POST' }); await loadThread(); }
});

refresh().then(connect).catch((e) => { $('#messages').textContent = `Failed to load: ${e.message}`; });
