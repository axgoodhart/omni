import { renderThread, onDelta, startStreaming, stopStreaming } from './panes/thread.js';
import { renderEvents, pushEvent, pushLive } from './panes/operation.js';
import { renderSide, openDrawer } from './panes/side.js';
import { renderDesk } from './panes/desk.js';
import { showInterview, maybeShowInterview } from './panes/interview.js';
import { renderSettings } from './panes/settings.js';
import { $, api, esc, fmt, ic } from './lib.js';

export const state = { view: new URLSearchParams(location.search).get('view') || localStorage.getItem('omni.view') || 'desk', mode: null, data: null, desk: null, thread: null, events: [], busy: false };
const pad = (n) => String(n).padStart(2, '0');
const KIND_ICON = { make: 'brush', research: 'search', build: 'construction', story: 'menu_book', grow: 'potted_plant', open: 'radio_button_unchecked' };
export const kindIcon = (k) => ic(KIND_ICON[k] ?? 'radio_button_unchecked');
const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });


export async function refresh() {
  state.data = await api('/api/state');
  if (!state.mode || !state.data.modes.some((m) => m.name === state.mode)) state.mode = localStorage.getItem('omni.mode') || state.data.modes.find((m) => m.name === 'assistant')?.name || state.data.modes[0]?.name || null;
  await loadDesk();
  renderShell();
  if (state.view === 'settings') await renderSettings(); // a reload on Config used to come up blank
  await loadThread();
  renderSide();
  maybeShowInterview();
}
export async function loadDesk() {
  state.desk = await api('/api/desk'); if (state.view === 'desk') renderDesk();
  const deskNeeds = document.getElementById('desk-needs');
  const emptyVisual = document.getElementById('emptyVisual');
  const panelNeeds = document.getElementById('panel-needs');


  if (deskNeeds.firstElementChild === emptyVisual) {
    panelNeeds.classList.add('mini');
  }else {
    panelNeeds.classList.remove('mini');
  }

 }

export async function loadThread() {
  const thread = state.view === 'loop' ? 'loop' : state.mode;
  if (!thread) return;
  if (state.view !== 'loop') state.thread = await api(`/api/threads/${encodeURIComponent(state.mode)}`);
  state.events = await api(state.view === 'loop' ? '/api/events?limit=800' : `/api/events?thread=${encodeURIComponent(thread)}&limit=400`); // History shows every thread
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
  renderShell(); await loadThread(); if (v === 'desk') renderDesk(); if (v === 'settings') await renderSettings(); renderSide();
}
/** Open the assistant thread with a line already typed. */
export async function discuss(text) { await switchMode(state.data.modes.some((m) => m.name === 'assistant') ? 'assistant' : state.mode); $('#input').value = text; $('#input').focus(); }

const navItem = (icon, label, attrs, cls = '', right = '') => `<li><button class="nav-item ${cls}" ${attrs}><span class="n">${icon}</span><span class="label">${label}${right}</span></button></li>`;

export function renderShell() {
  const d = state.data, cur = currentMode(), idx = d.modes.findIndex((m) => m.name === state.mode);
  const inserted = new Set(cur?.inserted ?? []), pending = d.pending ?? [], open = d.desk?.open ?? 0, needs = open + pending.length;
  const act = (v) => (state.view === v ? 'active' : '');
  const l = d.desk?.loop;
  const loopNote = l?.paused ? 'paused' : l?.last ? `${Math.round((Date.now() - l.last.at) / 60000)}m ago` : 'not yet';

  $('#nav-desk').innerHTML = navItem(ic('desktop_windows'), 'desk', `data-view="desk" data-tip="Everything Omnii looks at and asks about, in one place"`, act('desk'))
    + navItem(needs ? `<b>${needs}</b>` : ic('check_circle'), needs ? 'needs you' : 'nothing waiting', `data-drawer="approvals" data-tip="${needs ? `${needs} thing${needs === 1 ? '' : 's'} waiting on your answer` : 'No questions or approvals are waiting on you'}"`, needs ? 'alert' : '')
    + navItem(ic('tune'), 'config', `data-view="settings" data-tip="Omnii's rules, one per line"`, act('settings'))
    + navItem(ic('history'), 'history', `data-view="loop" data-tip="Every look: what Omnii saw, decided, and left alone"`, act('loop'), `<span class="count">${loopNote}</span>`);
  $('#nav-islands').innerHTML = (d.desk?.islands ?? []).map((i) => navItem(kindIcon(i.kind), esc(i.name), `data-island="${esc(i.slug)}" data-tip="${esc(i.kind)} · ${esc(i.position)}${i.progress > 0 && i.progress < 100 ? ` · ${i.progress}%` : ''}"`)).join('')
    + (d.desk?.islands?.length ? '' : navItem(ic('add'), 'run the interview', `data-interview="1" data-tip="A short set of questions that fills in the desk"`));
  $('#nav-modes').innerHTML = d.modes.map((m, i) => navItem(pad(i + 1), esc(m.name), `data-mode="${esc(m.name)}" data-tip="${esc(m.voice || m.model)}"`, m.name === state.mode && state.view === 'thread' ? 'active' : '', m.busy ? '<span class="live" data-tip="working"></span>' : '')).join('');
  $('#nav-memory').innerHTML = d.cartridges.map((c) => navItem(ic('memory', inserted.has(c.name) ? 'fill' : ''), esc(c.name), `data-drawer="memory" data-tip="${inserted.has(c.name) ? 'Inserted: the agent can read and write it now' : 'On the shelf: invisible to the agent until inserted'} · ${c.files.length} note${c.files.length === 1 ? '' : 's'}"`, inserted.has(c.name) ? 'active' : '')).join('')
    + navItem(ic('add'), 'insert, eject, create', `data-drawer="memory" data-tip="Memory cartridges: folders of notes the agent keeps"`);
  $('#nav-setup').innerHTML = navItem(ic('description'), 'desk files', `data-drawer="desk" data-tip="The plain files under desk/: profile, islands, priorities, trust, watches, observations"`)
    + navItem(ic('edit'), 'this mode', `data-drawer="mode" data-tip="Prompt, model, permissions and tools of the mode you are in"`)
    + navItem(ic('more_horiz'), 'skills, schedules, channels', `data-drawer="more" data-tip="How you reach it, timed runs, and instruction folders"`)
    + navItem(ic('help'), 'interview again', `data-interview="1" data-tip="Answer the setup questions again"`);
  document.querySelectorAll('#nav-modes .nav-item').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  document.querySelectorAll('[data-drawer]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.drawer)));
  document.querySelectorAll('[data-interview]').forEach((b) => b.addEventListener('click', () => showInterview(true)));
  document.querySelectorAll('[data-island]').forEach((b) => b.addEventListener('click', async () => { await showView('desk'); document.querySelector(`.island[data-slug="${b.dataset.island}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));

  const u = d.usage, pct = u.budget ? Math.min(100, Math.round((u.total / u.budget) * 100)) : 0;
  $('#budget-fill').style.width = `${pct}%`;
  $('#budget-text').textContent = u.budget ? `${fmt(u.total)} / ${fmt(u.budget)}` : `${fmt(u.total)} tokens`;
  $('#imessage-label').classList.toggle('on', d.imessage);
  $('#imessage-label').dataset.tip = d.imessage ? 'iMessage is on: text Omnii from your phone' : 'iMessage is off: put your number in ALLOWED_HANDLES in .env and restart';

  $('#view-desk').hidden = state.view !== 'desk';
  $('#view-settings').hidden = state.view !== 'settings';
  $('#view-thread').hidden = state.view === 'desk' || state.view === 'settings';
  $('#thread-pane').hidden = state.view === 'loop';
  $('#view-thread').classList.toggle('single', state.view === 'loop');
  $('#op-title').textContent = state.view === 'loop' ? 'Everything' : 'What it did';
  $('#op-head').dataset.tip = state.view === 'loop' ? 'Everything Omnii did, one card per conversation, look, answer or change, newest last. Open a card for its steps; open a step for the raw record.' : 'What this mode did, one card per conversation. Open a card for its steps; open a step for the raw record.';

  const title = (num, text, tip) => { $('#mode-num').innerHTML = num; $('#mode-title').textContent = text; $('#mode-title').dataset.tip = tip; };
  if (state.view === 'desk') {
    const p = state.desk?.profile;
    title(ic('desktop_windows'), p?.name ? `${p.name}'s desk` : 'Desk', 'Your desk. Omnii arranges it; you change it. Hover any heading for what it is.');
    $('#mode-tags').innerHTML = [`<span class="plate-tag clay" data-tip="Questions waiting on your answer">${ic('notifications')}<b>${open}</b></span>`, `<span class="plate-tag" data-tip="Things on your plate">${ic('account_tree')}<b>${d.desk?.islands?.length ?? 0}</b></span>`, `<span class="plate-tag focus" data-tip="${Object.values(state.desk?.trust ?? {}).some((v) => v === 'live') ? 'Some things may leave in your name' : 'Sandboxed: nothing leaves in your name; it is written to out/ instead'}">${ic('shield')}</span>`].join('');
    return;
  }
  if (state.view === 'settings') {
    title(ic('tune'), 'Config', 'Every line on this page is a rule Omnii follows. Change one and Omnii changes. Omnii never edits this page itself.');
    $('#mode-tags').innerHTML = '';
    return;
  }
  if (state.view === 'loop') {
    title(ic('history'), 'History', `A look every ${l?.everyMin ?? '?'} minutes. Omnii reads its own log, checks the agents, looks at what it watches, and may do a handful of bounded things. It writes down what it decided, including nothing.`);
    $('#mode-tags').innerHTML = `<span class="plate-tag clay" data-tip="When Omnii next looks">${ic('schedule')}<b>${l?.next ? hm(l.next) : '–'}</b></span><button type="button" class="icon-btn small" id="tick-now" data-tip="Look now" aria-label="Look now">${ic('refresh')}</button>`;
    $('#tick-now')?.addEventListener('click', async () => { await api('/api/loop/tick', { method: 'POST' }); refreshSoon(); });
    return;
  }
  if (!cur) return;
  title(pad(idx + 1), cur.name, cur.voice || `Permissions: ${cur.permissions.mode}. Edit this mode under Setup.`);
  $('#mode-tags').innerHTML = [
    `<span class="plate-tag" data-tip="The model this mode thinks with">${esc(cur.model)}</span>`,
    `<span class="plate-tag focus" data-tip="When it has to ask you first">${esc(cur.permissions.mode)}</span>`,
    `<span class="plate-tag sage" data-tip="Memory cartridges it can use right now: ${esc(cur.inserted?.length ? cur.inserted.join(', ') : 'none')}">${ic('memory')}<b>${cur.inserted?.length ?? 0}</b></span>`,
    `<span class="plate-tag clay" data-tip="Tools it may use">${ic('construction')}<b>${cur.tools ? cur.tools.length : d.tools.defaults.length}</b></span>`,
  ].join('');
}

const DESK_EVENTS = ['settings.changed', 'loop.tick', 'checkin.opened', 'checkin.answered', 'checkin.snoozed', 'checkin.archived', 'checkin.reminded', 'out.written', 'desk.reloaded', 'watch.export', 'watch.mail', 'mail.sorted', 'mail.handled', 'logbook', 'observation', 'interview.answered'];
function connect() {
  const es = new EventSource('/events');
  es.addEventListener('agent', (ev) => {
    const e = JSON.parse(ev.data);
    const shownThread = state.view === 'loop' ? 'loop' : state.mode;
    if (e.thread === 'loop' && DESK_EVENTS.includes(e.type)) { deskSoon(); if (state.view === 'settings' && e.type === 'desk.reloaded') renderSettings(); }
    if (e.type === 'checkin.opened' && state.view !== 'desk') openDrawer('approvals');
    if (e.thread && e.thread !== shownThread && state.view !== 'loop') { if (['approval.requested', 'approval.resolved', 'usage', 'mode.reloaded', 'inbound', 'outbound'].includes(e.type)) refreshSoon(); return; }
    if (!e.id) { pushLive(e); if (e.type === 'text.delta') onDelta(e.data.text); return; }
    state.events.push(e); pushEvent(e);
    if (state.view === 'thread') {
      if (e.type === 'inbound' && e.data.channel !== 'web') { startStreaming(); loadThread(); }
      if (e.type === 'outbound') { stopStreaming(); loadThread(); }
    }
    if (e.type === 'approval.requested') openDrawer('approvals');
    if (['approval.requested', 'approval.resolved', 'cartridges.changed', 'mode.reloaded', 'usage', 'schedule.loaded', 'memory.write', 'inbound', 'outbound'].includes(e.type)) refreshSoon();
  });
  es.onopen = () => { $('#status').textContent = 'live'; $('#status').classList.add('on'); };
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

// ---- tooltips: one element, shown for anything with data-tip (hover or keyboard focus)
const tip = $('#tip');
let tipFor = null;
function showTip(el) {
  const text = el.dataset.tip; if (!text) return hideTip();
  tipFor = el; tip.textContent = text; tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const y = r.bottom + h + 16 > window.innerHeight ? r.top - h - 8 : r.bottom + 8;

}
function hideTip() { tipFor = null; tip.hidden = true; }
document.addEventListener('mouseover', (e) => { const el = e.target.closest?.('[data-tip]'); if (!el) { if (tipFor) hideTip(); } else if (el !== tipFor) showTip(el); });
document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); });
document.addEventListener('focusout', hideTip);
document.addEventListener('mousedown', hideTip);
document.addEventListener('scroll', hideTip, true);

refresh().then(connect).catch((e) => { $('#mode-title').textContent = `Failed to load: ${e.message}`; });

