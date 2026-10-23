import { $, api, esc } from '../lib.js';
import { state, deskSoon, discuss, kindIcon, showView } from '../app.js';
import { openDrawer, showOut, showDeskFile } from './side.js';

const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

export function renderDesk() {
  const d = state.desk; if (!d) return;
  renderStrip(d); renderNeeds(d); renderRhythms(d); renderIslands(d); renderMail(d); renderOut(d); renderWatches(d);
}

function renderStrip(d) {
  const l = d.loop, last = l.last;
  $('#loopstrip').innerHTML = l.paused
    ? `<span class="k">paused</span><span>Nothing looks, nothing asks.</span><span class="spacer"></span><button class="ghost tiny" id="strip-settings">turn me back on</button>`
    : `<span class="k">I look every ${l.everyMin} min</span>${last ? `<span>last ${hm(last.at)}</span><span><b>${last.decisions}</b> decision${last.decisions === 1 ? '' : 's'}</span><span><b>${last.waiting}</b> waiting on you</span>` : '<span>not yet</span>'}<span>next ${l.next ? hm(l.next) : '–'}</span>${l.busy?.length ? `<span class="busy">working: ${esc(l.busy.join(', '))}</span>` : ''}<span class="spacer"></span><button class="ghost tiny" id="strip-settings">change</button><button class="ghost tiny" id="strip-tick">look now</button><button class="ghost tiny" id="strip-loop">what I did</button>`;
  $('#strip-settings').addEventListener('click', () => showView('settings'));
  $('#strip-tick')?.addEventListener('click', async () => { await api('/api/loop/tick', { method: 'POST' }); deskSoon(); });
  $('#strip-loop')?.addEventListener('click', () => showView('loop'));
}

export function checkinHTML(c) {
  const snoozed = c.state === 'snoozed';
  return `<div class="checkin p-${esc(c.priority)} ${snoozed ? 'snoozed' : ''}" data-id="${esc(c.id)}">
    <div class="ci-head"><span class="ci-pri">${esc(c.priority)}</span><span class="ci-when">${snoozed ? `snoozed until ${hm(c.snoozedUntil)}` : `${ago(c.created)}${c.reminders ? ` · reminded ${c.reminders}×` : ''}`}</span></div>
    <div class="ci-title">${esc(c.title)}</div>
    ${c.options.length ? `<div class="ci-opts">${c.options.map((o) => `<button class="${o.k === 'd' ? 'ghost' : ''}" data-k="${esc(o.k)}"><span class="k">${esc(o.k)}</span>${esc(o.label)}</button>`).join('')}</div>` : `<div class="ci-opts"><button data-k="ok">ok</button></div>`}
  </div>`;
}
function wireCheckins(root) {
  root.querySelectorAll('.checkin button').forEach((b) => b.addEventListener('click', async () => {
    const box = b.closest('.checkin'); box.classList.add('answering');
    try { const { reply } = await api(`/api/checkins/${box.dataset.id}/answer`, { method: 'POST', body: { option: b.dataset.k } }); box.innerHTML = `<div class="ci-title muted-text">${esc(reply)}</div>`; }
    catch (e) { alert(e.message); box.classList.remove('answering'); }
    deskSoon();
  }));
}

function renderNeeds(d) {
  const general = d.checkins.live.filter((c) => !c.island);
  const pending = state.data?.pending ?? [];
  const box = $('#desk-needs');
  box.innerHTML = (general.map(checkinHTML).join('') + (pending.length ? `<div class="checkin p-top"><div class="ci-title">${pending.length} tool approval${pending.length === 1 ? '' : 's'} waiting.</div><div class="ci-opts"><button data-drawer="approvals">open</button></div></div>` : ''))
    || `<div class="intro small">Nothing is waiting on you. When the loop needs an answer it puts one sentence here, and texts it if iMessage is on. Letters answer it either place.</div>`;
  wireCheckins(box);
  box.querySelector('[data-drawer]')?.addEventListener('click', () => openDrawer('approvals'));
  const archived = d.checkins.recent.filter((c) => c.state === 'archived' || c.state === 'answered').slice(0, 6);
  if (archived.length) {
    const h = document.createElement('details'); h.className = 'history';
    h.innerHTML = `<summary>history · ${archived.length} recent</summary>${archived.map((c) => `<div class="hist ${c.state}"><span class="t">${hm(c.answered ?? c.created)}</span><span>${esc(c.title)}</span><span class="r">${c.state === 'answered' ? `${esc(c.answer)}) ${esc(c.options.find((o) => o.k === c.answer)?.label ?? 'ok')} · ${esc(c.via ?? '')}` : `archived · ${esc(c.archivedReason ?? '')}`}</span></div>`).join('')}`;
    box.appendChild(h);
  }
}

function renderRhythms(d) {
  const p = d.priorities, med = d.logbook.medicine, ch = d.logbook.chores;
  const historyOpen = $('#medicine-history')?.open ?? false;
  const dateTime = (ts) => new Date(ts).toLocaleString([], { timeZone: d.profile.timezone, month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const history = d.medicineHistory;
  $('#desk-rhythms').innerHTML = `
    <div class="rhythm"><span class="ic">✚</span><div><b>Medicine</b> <span class="muted">${esc(p.medicine.time)} · ${esc(p.medicine.priority)}</span><div class="sub">${med ? `Last logged on ${esc(dateTime(med.ts))}.` : 'You have not logged your medicine yet.'}</div></div><button class="ghost tiny" data-log="medicine">Log now</button></div>
    <details class="medicine-history" id="medicine-history" ${historyOpen ? 'open' : ''}>
      <summary>View medicine history</summary>
      ${history ? history.length ? `<ol>${history.map((entry) => `<li><time datetime="${esc(new Date(entry.ts).toISOString())}">${esc(dateTime(entry.ts))}</time><span>${entry.via === 'web' ? 'Logged in the app' : entry.via === 'imessage' ? 'Logged through iMessage' : 'Medicine logged'}</span></li>`).join('')}</ol>` : '<p>You have not logged your medicine yet. Your entries will appear here.</p>' : '<p>Medicine history is unavailable. Restart the app’s background service, then reload this page.</p>'}
    </details>
    <div class="rhythm"><span class="ic">⌂</span><div><b>apartment</b> <span class="muted">${p.chores.days.length ? esc(p.chores.days.join(' ')) : 'no days set'} · ${esc(p.chores.priority)}</span><div class="sub">${ch ? `last done ${ago(ch.ts)}` : 'not logged yet'}</div></div><button class="ghost tiny" data-log="chores">done</button></div>`;
  $('#desk-rhythms').querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', async () => {
    const open = d.checkins.live.find((c) => c.state !== 'answered' && (c.title.startsWith('Medicine') && b.dataset.log === 'medicine' || c.title.startsWith('Apartment') && b.dataset.log === 'chores'));
    if (open) await api(`/api/checkins/${open.id}/answer`, { method: 'POST', body: { option: 'a' } });
    else await api(`/api/logbook/${b.dataset.log}`, { method: 'POST' });
    deskSoon();
  }));
}

function renderIslands(d) {
  const box = $('#desk-islands');
  const byIsland = (slug) => d.checkins.live.filter((c) => c.island === slug);
  box.innerHTML = d.islands.map((i) => `<article class="island" data-slug="${esc(i.slug)}">
    <header><span class="ic">${kindIcon(i.kind)}</span><h3>${esc(i.name)}</h3><span class="plate-tag ${i.position === 'finished, not shared' ? 'clay' : i.position === 'done' ? '' : 'slate'}">${esc(i.position)}</span><span class="plate-tag focus">${esc(d.priorities.islands[i.slug] ?? 'normal')}</span></header>
    <div class="track">${i.stages.map((s, n) => `<button class="dot ${n <= i.stage ? 'on' : ''} ${n === i.stage ? 'cur' : ''}" data-stage="${n}" title="${esc(s)}"></button>`).join('')}<span class="stage-name">${esc(i.stages[i.stage])}</span></div>
    <input class="status" value="${esc(i.status)}" placeholder="status line — what's true about it right now">
    ${byIsland(i.slug).map(checkinHTML).join('')}
    <footer><span class="muted">${i.files.length ? `${i.files.length} file${i.files.length === 1 ? '' : 's'}` : 'no files'} · ${esc(i.kind)}</span><span class="spacer"></span><button class="ghost tiny" data-discuss>discuss</button><button class="ghost tiny" data-edit>edit file</button></footer>
  </article>`).join('') || `<div class="intro small">No islands yet. Each is one thing on your plate: a project, a piece, something you keep avoiding. The interview adds them, or use + island.</div>`;
  wireCheckins(box);
  box.querySelectorAll('.island').forEach((el) => {
    const slug = el.dataset.slug;
    el.querySelectorAll('.dot').forEach((b) => b.addEventListener('click', async () => { await api(`/api/islands/${slug}`, { method: 'POST', body: { stage: Number(b.dataset.stage) } }); deskSoon(); }));
    el.querySelector('.status').addEventListener('change', async (e) => { await api(`/api/islands/${slug}`, { method: 'POST', body: { status: e.target.value } }); });
    el.querySelector('[data-discuss]').addEventListener('click', () => discuss(`About ${d.islands.find((x) => x.slug === slug)?.name}: `));
    el.querySelector('[data-edit]').addEventListener('click', () => showDeskFile(`islands/${slug}.md`));
  });
  $('#add-island').onclick = async () => {
    const name = prompt('Name the thing on your plate:'); if (!name) return;
    await api('/api/islands', { method: 'POST', body: { name } }); deskSoon();
  };
}

function renderMail(d) {
  const w = d.watches.mail, box = $('#desk-mail');
  if (!w.configured) { box.innerHTML = `<div class="intro small">Mail is not connected. Add IMAP_HOST, IMAP_USER and IMAP_PASS to .env (the interview asks for them) and the loop will start reading. It only reads; replies and unsubscribes land in out/mail.</div>`; return; }
  const ny = d.mail.needsYou;
  box.innerHTML = `<div class="mailhead muted">${w.lastCheck ? `checked ${ago(w.lastCheck)}` : 'not checked yet'}${w.lastError ? ` · <span class="err">${esc(w.lastError)}</span>` : ''} · ${d.mail.recent.length ? `${d.mail.recent.length} recent` : 'nothing read yet'}</div>`
    + (ny.length ? ny.map((m) => `<div class="mailrow" data-uid="${m.uid}"><div><b>${esc(m.senderName || m.sender)}</b> <span class="muted">${hm(m.ts)}</span><div class="sub">${esc(m.subject)}${m.reason ? ` <span class="muted">· ${esc(m.reason)}</span>` : ''}</div></div><button class="ghost tiny" data-draft>draft reply</button><button class="ghost tiny" data-handled>handled</button></div>`).join('') : '<div class="muted-text">Nothing needs you.</div>');
  box.querySelectorAll('[data-draft]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/mail/${b.closest('.mailrow').dataset.uid}/draft`, { method: 'POST' }); b.textContent = 'drafting → out/mail'; }));
  box.querySelectorAll('[data-handled]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/mail/${b.closest('.mailrow').dataset.uid}/handled`, { method: 'POST' }); deskSoon(); }));
}

function renderOut(d) {
  const box = $('#desk-out');
  box.innerHTML = d.out.length ? d.out.map((f) => `<button class="outrow" data-domain="${esc(f.domain)}" data-name="${esc(f.name)}"><span class="plate-tag ${f.domain === 'mail' ? 'slate' : f.domain === 'site' ? '' : 'clay'}">${esc(f.domain)}</span><span class="nm">${esc(f.name)}</span><span class="muted">${ago(f.mtime)}</span></button>`).join('') : `<div class="intro small">Empty. Anything the loop would send or publish as you is written here instead: a reply, an unsubscribe, a site change, a submission. Read it, then do with it what you like.</div>`;
  box.querySelectorAll('.outrow').forEach((b) => b.addEventListener('click', () => showOut(b.dataset.domain, b.dataset.name)));
}

function renderWatches(d) {
  const w = d.watches, t = d.trust;
  $('#desk-watches').innerHTML = `
    <div class="kv"><span>export folder</span><b>${w.export.path ? `${esc(w.export.path)} <span class="muted">· ${w.export.seen} seen</span>` : 'not set'}</b></div>
    <div class="kv"><span>mail</span><b>${w.mail.configured ? `reading${w.mail.since ? ` · uid ${w.mail.since}` : ''}` : 'not set'}</b></div>
    <div class="kv"><span>trust</span><b>${Object.entries(t).map(([k, v]) => `${esc(k)} · ${esc(v)}`).join(' &nbsp; ')}</b></div>
    <div class="kv"><span>observations</span><b>${d.observations.length} line${d.observations.length === 1 ? '' : 's'}</b></div>
    <div class="row"><button class="ghost tiny" data-f="priorities.md">priorities</button><button class="ghost tiny" data-f="trust.md">trust</button><button class="ghost tiny" data-f="watches.md">watches</button><button class="ghost tiny" data-f="observations.md">observations</button><button class="ghost tiny" data-f="profile.md">profile</button></div>`;
  $('#desk-watches').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => showDeskFile(b.dataset.f)));
}
