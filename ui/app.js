import { renderThread, onDelta, startStreaming, stopStreaming } from './panes/thread.js';
import { renderEvents, pushEvent, pushLive } from './panes/operation.js';
import { renderSide, openDrawer } from './panes/side.js';
import { renderDesk } from './panes/desk.js';
import { showInterview, maybeShowInterview } from './panes/interview.js';
import { $, api, esc, fmt } from './lib.js';

export const state = { view: localStorage.getItem('omni.view') || 'desk', mode: null, data: null, desk: null, thread: null, events: [], busy: false };
const pad = (n) => String(n).padStart(2, '0');
const KIND_ICON = { make: '✎', research: '⌕', build: '⚒', story: '¶', grow: '❧', open: '○' };
export const kindIcon = (k) => KIND_ICON[k] ?? '○';

export async function refresh() {
  state.data = await api('/api/state');
  if (!state.mode || !state.data.modes.some((m) => m.name === state.mode)) state.mode = localStorage.getItem('omni.mode') || state.data.modes.find((m) => m.name === 'assistant')?.name || state.data.modes[0]?.name || null;
  await loadDesk();
  renderShell();
  await loadThread();
  renderSide();
  maybeShowInterview();
}
export async function loadDesk() { state.desk = await api('/api/desk'); if (state.view === 'desk') renderDesk(); }

export async function loadThread() {
  const thread = state.view === 'loop' ? 'loop' : state.mode;
  if (!thread) return;
  if (state.view !== 'loop') state.thread = await api(`/api/threads/${encodeURIComponent(state.mode)}`);
  state.events = await api(`/api/events?thread=${encodeURIComponent(thread)}&limit=400`);
  renderThread(); renderEvents();
}

export const currentMode = () => state.data?.modes.find((m) => m.name === state.mode);

export async function switchMode(name) {
  if (name === state.mode && state.view === 'thread') return;
  state.mode = name; localStorage.setItem('omni.mode', name);
  await showView('thread');
}
export async function showView(v) {
  state.view = v; localStorage.setItem('omni.view', v);
  renderShell(); await loadThread(); if (v === 'desk') renderDesk(); renderSide();
}
/** Open the assistant thread with a line already typed. */
export async function discuss(text) { await switchMode(state.data.modes.some((m) => m.name === 'assistant') ? 'assistant' : state.mode); $('#input').value = text; $('#input').focus(); }

export function renderShell() {
  const d = state.data, cur = currentMode(), idx = d.modes.findIndex((m) => m.name === state.mode);
  const inserted = new Set(cur?.inserted ?? []), pending = d.pending ?? [], open = d.desk?.open ?? 0, needs = open + pending.length;
  const act = (v) => (state.view === v ? 'active' : '');

  $('#nav-desk').innerHTML = `<li><button class="nav-item ${act('desk')}" data-view="desk"><span class="n">◎</span>desk</button></li>
    <li><button class="nav-item ${needs ? 'alert' : ''}" data-drawer="approvals"><span class="n">${needs || '–'}</span>${needs ? 'needs you' : 'nothing waiting'}</button></li>
    <li><button class="nav-item ${act('loop')}" data-view="loop"><span class="n">↻</span>loop<span class="count">${d.desk?.loop?.last ? `${Math.round((Date.now() - d.desk.loop.last.at) / 60000)}m ago` : 'not yet'}</span></button></li>`;
  $('#nav-islands').innerHTML = (d.desk?.islands ?? []).map((i) => `<li><button class="nav-item" data-island="${esc(i.slug)}" title="${esc(i.position)}"><span class="n">${kindIcon(i.kind)}</span>${esc(i.name)}<span class="count">${esc(i.stages[i.stage] ?? '')}</span></button></li>`).join('')
    + (d.desk?.islands?.length ? '' : '<li><button class="nav-item" data-interview="1"><span class="n">+</span>run the interview</button></li>');
  $('#nav-modes').innerHTML = d.modes.map((m, i) => `<li><button class="nav-item ${m.name === state.mode && state.view === 'thread' ? 'active' : ''}" data-mode="${esc(m.name)}" title="${esc(m.voice || m.model)}"><span class="n">${pad(i + 1)}</span>${esc(m.name)}${m.busy ? '<span class="live" title="working"></span>' : ''}</button></li>`).join('');
  $('#nav-memory').innerHTML = d.cartridges.map((c) => `<li><button class="nav-item ${inserted.has(c.name) ? 'active' : ''}" data-drawer="memory"><span class="n">${inserted.has(c.name) ? '▮' : '▯'}</span>${esc(c.name)}<span class="count">${c.files.length} note${c.files.length === 1 ? '' : 's'}</span></button></li>`).join('')
    + `<li><button class="nav-item" data-drawer="memory"><span class="n">+</span>insert, eject, create</button></li>`;
  $('#nav-setup').innerHTML = [['desk', 'priorities, trust, watches'], ['mode', 'prompt & settings'], ['more', 'skills, schedules, channels']].map(([k, label]) => `<li><button class="nav-item" data-drawer="${k}"><span class="n">→</span>${label}</button></li>`).join('')
    + `<li><button class="nav-item" data-interview="1"><span class="n">?</span>interview again</button></li>`;
  document.querySelectorAll('#nav-modes .nav-item').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  document.querySelectorAll('[data-drawer]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.drawer)));
  document.querySelectorAll('[data-interview]').forEach((b) => b.addEventListener('click', () => showInterview(true)));
  document.querySelectorAll('[data-island]').forEach((b) => b.addEventListener('click', async () => { await showView('desk'); document.querySelector(`.island[data-slug="${b.dataset.island}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));

  const u = d.usage, pct = u.budget ? Math.min(100, Math.round((u.total / u.budget) * 100)) : 0;
  $('#budget-fill').style.width = `${pct}%`;
  $('#budget-text').textContent = u.budget ? `free tokens today · ${fmt(u.total)} of ${fmt(u.budget)}` : `${fmt(u.total)} tokens today`;
  $('#imessage-label').textContent = d.imessage ? 'imessage · on' : 'imessage · off';

  $('#view-desk').hidden = state.view !== 'desk';
  $('#view-thread').hidden = state.view === 'desk';
  $('#thread-pane').hidden = state.view === 'loop';
  $('#view-thread').classList.toggle('single', state.view === 'loop');
  $('#op-title').textContent = state.view === 'loop' ? 'Loop' : 'Operation';
  $('#op-sub').textContent = state.view === 'loop' ? 'every tick: what it saw, did, and left alone' : 'every step, as it happens';

  if (state.view === 'desk') {
    const l = d.desk?.loop, p = state.desk?.profile;
    $('#mode-num').textContent = '◎';
    $('#mode-title').textContent = p?.name ? `${p.name}'s desk` : 'Desk';
    $('#mode-sub').textContent = l?.last ? `The loop last looked ${new Date(l.last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: did ${l.last.did}, left ${l.last.left} alone. Every ${l.everyMin} min.` : 'The loop has not ticked yet.';
    $('#mode-tags').innerHTML = [`<span class="plate-tag clay">${open} open check-in${open === 1 ? '' : 's'}</span>`, `<span class="plate-tag">${d.desk?.islands?.length ?? 0} islands</span>`, `<span class="plate-tag focus">trust · ${Object.values(state.desk?.trust ?? {}).some((v) => v === 'live') ? 'mixed' : 'sandbox'}</span>`].join('');
    return;
  }
  if (state.view === 'loop') {
    const l = d.desk?.loop;
    $('#mode-num').textContent = '↻'; $('#mode-title').textContent = 'Loop';
    $('#mode-sub').textContent = `A heartbeat every ${l?.everyMin ?? '?'} minutes. It reads its own log, checks the agents, looks at what it watches, and may do a handful of bounded things. It writes down what it decided, including nothing.`;
    $('#mode-tags').innerHTML = `<span class="plate-tag clay">next ${l?.next ? new Date(l.next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–'}</span><button class="ghost tiny" id="tick-now">tick now</button>`;
    $('#tick-now')?.addEventListener('click', async () => { await api('/api/loop/tick', { method: 'POST' }); refreshSoon(); });
    return;
  }
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

const DESK_EVENTS = ['loop.tick', 'checkin.opened', 'checkin.answered', 'checkin.snoozed', 'checkin.archived', 'checkin.reminded', 'out.written', 'desk.reloaded', 'watch.export', 'watch.mail', 'mail.sorted', 'mail.handled', 'logbook', 'observation', 'interview.answered'];
function connect() {
  const es = new EventSource('/events');
  es.addEventListener('agent', (ev) => {
    const e = JSON.parse(ev.data);
    const shownThread = state.view === 'loop' ? 'loop' : state.mode;
    if (e.thread === 'loop' && DESK_EVENTS.includes(e.type)) deskSoon();
    if (e.type === 'checkin.opened' && state.view !== 'desk') openDrawer('approvals');
    if (e.thread && e.thread !== shownThread) { if (['approval.requested', 'approval.resolved', 'usage', 'mode.reloaded', 'inbound', 'outbound'].includes(e.type)) refreshSoon(); return; }
    if (!e.id) { pushLive(e); if (e.type === 'text.delta') onDelta(e.data.text); return; }
    state.events.push(e); pushEvent(e);
    if (state.view === 'thread') {
      if (e.type === 'inbound' && e.data.channel !== 'web') { startStreaming(); loadThread(); }
      if (e.type === 'outbound') { stopStreaming(); loadThread(); }
    }
    if (e.type === 'approval.requested') openDrawer('approvals');
    if (['approval.requested', 'approval.resolved', 'cartridges.changed', 'mode.reloaded', 'usage', 'schedule.loaded', 'memory.write', 'inbound', 'outbound'].includes(e.type)) refreshSoon();
  });
  es.onopen = () => { $('#status').textContent = 'extension · live'; $('#status').classList.add('on'); };
  es.onerror = () => { $('#status').textContent = 'reconnecting…'; $('#status').classList.remove('on'); };
}
let t = null, td = null;
export function refreshSoon() {
  clearTimeout(t);
  t = setTimeout(() => { api('/api/state').then((d) => { state.data = d; renderShell(); renderSide(); if (state.view === 'thread') renderThread(); }).catch(() => {}); }, 300);
}
export function deskSoon() { clearTimeout(td); td = setTimeout(() => { loadDesk().then(() => { api('/api/state').then((d) => { state.data = d; renderShell(); renderSide(); }); }).catch(() => {}); }, 250); }

$('#reset').addEventListener('click', async () => {
  if (confirm(`Forget the "${state.mode}" conversation? Memory cartridges are kept.`)) { await api(`/api/threads/${state.mode}/reset`, { method: 'POST' }); await loadThread(); }
});

refresh().then(connect).catch((e) => { $('#mode-title').textContent = `Failed to load: ${e.message}`; });
