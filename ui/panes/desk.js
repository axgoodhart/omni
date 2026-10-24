import { $, api, esc, ic, ibtn, progressHTML, wireProgress } from '../lib.js';
import { state, deskSoon, discuss, kindIcon, showView, switchMode } from '../app.js';
import { openDrawer, showOut, showDeskFile } from './side.js';

const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const LEVEL = { high: 3, medium: 2, low: 1 };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const OUT_ICON = { mail: 'mail', site: 'public', submissions: 'upload' };
export const priority = (p, what = 'Priority') => `<span class="priority" data-level="${LEVEL[p] ?? 2}" data-tip="${esc(what)}: ${esc(p)}"><i></i><i></i><i></i></span>`;
const week = (on, tip) => `<span class="week" data-tip="${esc(tip)}">${DAYS.map((d) => `<i class="day ${on.includes(d) ? 'on' : ''}"></i>`).join('')}</span>`;
const empty = (a, b, tip, n = '0') => `<div class="empty-visual" id="emptyVisual" tabindex="0" data-tip="${esc(tip)}">${ic(a, 'zero')}<span class="empty-line"></span>${n === null ? ic(b) : `<span class="num">${n}</span>`}</div>`;

export function renderDesk() {
  const d = state.desk; if (!d) return;
  renderStrip(d); renderNeeds(d); renderRhythms(d); renderIslands(d); renderMail(d); renderOut(d); renderWatches(d);
}

function renderStrip(d) {
  const l = d.loop, last = l.last, on = !l.paused;
  const node = (icon, n, tip, done) => `<span class="loop-node ${done ? 'done' : ''}" tabindex="0" data-tip="${esc(tip)}">${ic(icon)}${n === null ? '' : `<span class="num">${n}</span>`}</span>`;
  $('#loopstrip').innerHTML = `
    ${ibtn(on ? 'pause' : 'play_arrow', on ? 'Running. Click to pause everything: nothing scans, nothing asks, until you turn Omnii back on.' : 'Paused. Nothing looks, nothing asks. Click to turn Omnii back on.', `id="strip-pause" aria-pressed="${on}"`)}
    <span class="live-dot ${on ? 'on' : ''}" data-tip="${on ? 'Running' : 'Paused'}"></span>
    <div class="loop-track">
      ${node('visibility', last ? hm(last.at) : '–', last ? `Last scan at ${hm(last.at)}` : "No scan yet", !!last)}
      ${node('task', last ? last.decisions : '–', last ? `${last.decisions} decision${last.decisions === 1 ? '' : 's'} on the last scan` : 'No decisions yet', !!last && last.decisions > 0)}
      ${node('notifications', last ? last.waiting : '–', last ? `${last.waiting} request${last.waiting === 1 ? "" : "s"} open` : "No requests open", !!last && last.waiting > 0)}
      ${node('shield', null, 'Sandboxed: nothing leaves in your name', true)}
    </div>
    ${l.busy?.length ? `<span class="busy" data-tip="Working right now: ${esc(l.busy.join(', '))}">${ic('sync', 'spin')}</span>` : ''}
    <button type="button" class="frequency" id="strip-settings" data-tip="Omnii scans every ${l.everyMin} minutes${on && l.next ? ` · next ${hm(l.next)}` : ''}. Click to change.">${ic('schedule')}<span class="num">${l.everyMin}</span></button>
    ${ibtn("refresh", "Scan now", 'id="strip-tick"', 'small')}
    ${ibtn('history', 'What Omnii did', 'id="strip-loop"', 'small')}`;
  $('#strip-pause').addEventListener('click', async () => { await api('/api/settings', { method: 'PUT', body: { key: 'loop.paused', value: on } }); deskSoon(); });
  $('#strip-settings').addEventListener('click', () => showView('settings'));
  $('#strip-tick').addEventListener('click', async () => { await api('/api/loop/tick', { method: 'POST' }); deskSoon(); });
  $('#strip-loop').addEventListener('click', () => showView('loop'));
}

export function checkinHTML(c) {
  const snoozed = c.state === 'snoozed';
  return `<div class="checkin p-${esc(c.priority)} ${snoozed ? 'snoozed' : ''}" data-id="${esc(c.id)}">
    <div class="ci-head">${priority(c.priority)}<span class="ci-when">${snoozed ? `snoozed until ${hm(c.snoozedUntil)}` : `${ago(c.created)}${c.reminders ? ` · reminded ${c.reminders}×` : ''}`}</span></div>
    <div class="ci-title">${esc(c.title)}</div>
    ${c.options.length ? `<div class="ci-opts">${c.options.map((o) => `<button class="${o.k === 'd' ? 'ghost' : ''}" data-k="${esc(o.k)}" data-act="${esc(o.action?.type ?? '')}"><span class="k">${esc(o.k)}</span>${esc(o.label)}</button>`).join('')}</div>` : `<div class="ci-opts"><button data-k="ok">ok</button></div>`}
  </div>`;
}
function wireCheckins(root) {
  root.querySelectorAll('.checkin button').forEach((b) => b.addEventListener('click', async () => {
    const box = b.closest('.checkin'); box.classList.add('answering');
    try { const { reply } = await api(`/api/checkins/${box.dataset.id}/answer`, { method: 'POST', body: { option: b.dataset.k } }); box.innerHTML = `<div class="ci-title muted-text">${esc(reply)}</div>`; if (b.dataset.act === 'discuss') switchMode('assistant'); }
    catch (e) { alert(e.message); box.classList.remove('answering'); }
    deskSoon();
  }));
}

function renderNeeds(d) {
  const general = d.checkins.live.filter((c) => !c.island && c.onDesk !== false);
  const pending = state.data?.pending ?? [];
  const box = $('#desk-needs');
  box.innerHTML = (general.map(checkinHTML).join('') + (pending.length ? `<div class="checkin p-top"><div class="ci-title">${pending.length} approval request${pending.length === 1 ? "" : "s"}.</div><div class="ci-opts"><button data-drawer="approvals">open</button></div></div>` : ''))
    || empty('check_circle', null, 'No requests right now.');
  wireCheckins(box);
  box.querySelector('[data-drawer]')?.addEventListener('click', () => openDrawer('approvals'));
  const archived = d.checkins.recent.filter((c) => c.state === 'archived' || c.state === 'answered').slice(0, 6);
  if (archived.length) {
    const h = document.createElement('details'); h.className = 'history';
    h.innerHTML = `<summary data-tip="Answered and filed questions. Omnii never deletes them.">${ic('history')}<span class="num">${archived.length}</span></summary>${archived.map((c) => `<div class="hist ${c.state}"><span class="t">${hm(c.answered ?? c.created)}</span><span>${esc(c.title)}</span><span class="r">${c.state === 'answered' ? `${esc(c.answer)}) ${esc(c.options.find((o) => o.k === c.answer)?.label ?? 'ok')} · ${esc(c.via ?? '')}` : `filed · ${esc(c.archivedReason ?? '')}`}</span></div>`).join('')}`;
    box.appendChild(h);
  }
}

function renderRhythms(d) {
  const p = d.priorities, med = d.logbook.medicine, ch = d.logbook.chores;
  const historyOpen = $('#medicine-history')?.open ?? false;
  const dateTime = (ts) => new Date(ts).toLocaleString([], { timeZone: d.profile.timezone, month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const history = d.medicineHistory;
  const row = (key, icon, name, time, days, daysTip, pri, lastTip, logTip) => `
    <div class="rhythm ${p[key].enabled ? '' : 'off'}">
      <span class="ic" data-tip="${esc(lastTip)}">${ic(icon, key === 'medicine' ? 'accent' : '')}</span>
      <b data-tip="${esc(lastTip)}">${name}</b>
      <span class="time num" data-tip="When Omnii asks, if it has not been logged">${esc(time)}</span>
      ${week(days, daysTip)}
      ${priority(pri)}
      ${ibtn('check', logTip, `data-log="${key}"`, 'small')}
    </div>`;
  $('#desk-rhythms').innerHTML = row('medicine', 'medication', 'Medicine', p.medicine.time, DAYS, 'Every day', p.medicine.priority, med ? `Last logged ${dateTime(med.ts)}` : 'Not logged yet', 'Log medicine now')
    + (history?.length === 0 ? '' : `<details class="medicine-history" id="medicine-history" ${historyOpen ? 'open' : ''}>
      <summary data-tip="Every time medicine was logged">${ic('history')}<span class="num">${history?.length ?? 0}</span></summary>
      ${history ? `<ol>${history.map((entry) => `<li><time datetime="${esc(new Date(entry.ts).toISOString())}">${esc(dateTime(entry.ts))}</time><span>${entry.via === 'web' ? 'in the app' : entry.via === 'imessage' ? 'by text' : ''}</span></li>`).join('')}</ol>` : '<p class="muted-text">History unavailable. Restart the background service and reload.</p>'}
    </details>`)
    + row('chores', 'home', 'Apartment', p.chores.time, p.chores.days, p.chores.days.length ? `On ${p.chores.days.join(', ')}` : 'No days set', p.chores.priority, ch ? `Last done ${ago(ch.ts)}` : 'Not logged yet', 'Mark the apartment done');
  $('#desk-rhythms').querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', async () => {
    const open = d.checkins.live.find((c) => c.state !== 'answered' && (c.title.startsWith('Medicine') && b.dataset.log === 'medicine' || c.title.startsWith('Apartment') && b.dataset.log === 'chores'));
    if (open) await api(`/api/checkins/${open.id}/answer`, { method: 'POST', body: { option: 'a' } });
    else await api(`/api/logbook/${b.dataset.log}`, { method: 'POST' });
    deskSoon();
  }));
}

function renderIslands(d) {
  const box = $('#desk-islands');
  const byIsland = (slug) => d.checkins.live.filter((c) => c.island === slug && c.onDesk !== false);
  box.innerHTML = d.islands.map((i) => `<article class="island" data-slug="${esc(i.slug)}" data-done="${i.progress >= 100}">
    <header><span class="ic" data-tip="${esc(i.kind)}">${kindIcon(i.kind)}</span><h3>${esc(i.name)}</h3>${priority(d.priorities.islands[i.slug] ?? 'medium')}</header>
    ${progressHTML(i.progress)}
    <input class="status" value="${esc(i.status)}" placeholder="what's true about it right now">
    ${byIsland(i.slug).map(checkinHTML).join('')}
    <footer><span class="file-count" data-tip="${i.files.length ? `${i.files.length} file${i.files.length === 1 ? '' : 's'} in its folder` : 'No files yet'}">${ic('attachment')}<span class="num">${i.files.length}</span></span><span class="spacer"></span>${ibtn('chat_bubble', 'Talk about this with the assistant', 'data-discuss', 'small')}${ibtn('description', 'Open its file', 'data-edit', 'small')}</footer>
  </article>`).join('') || empty('account_tree', null, 'Nothing on the plate yet. Use + to add something, or run the interview.');
  wireCheckins(box);
  box.querySelectorAll('.island').forEach((el) => {
    const slug = el.dataset.slug;
    wireProgress(el, async (_, progress) => { await api(`/api/islands/${slug}`, { method: 'POST', body: { progress } }); deskSoon(); });
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
  if (!w.configured) {
    box.innerHTML = `<div class="disconnected"><span class="dis" tabindex="0" data-tip="Mail is not connected.">${ic('mail')}<span class="break"></span>${ic('link_off')}</span>${ibtn('link', 'Connect mail', 'id="connect-mail"', 'small')}</div>`;
    $('#connect-mail').addEventListener('click', async () => {
      await showView('settings');
      document.querySelector('[data-k="mail.connect"]')?.click();
      $('#mail-connect')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }
  const ny = d.mail.needsYou;
  box.innerHTML = `<div class="mailhead"><span class="live-dot ${w.lastError ? '' : 'on'}" data-tip="${w.lastCheck ? `Checked ${ago(w.lastCheck)}` : 'Not checked yet'}${w.lastError ? ` · problem: ${esc(w.lastError)}` : ''} · ${d.mail.recent.length} recent"></span></div>`
    + (ny.length ? ny.map((m) => `<div class="mailrow" data-uid="${m.uid}"><span class="avatar">${ic('person')}</span><div><b>${esc(m.senderName || m.sender)}</b> <span class="muted">${hm(m.ts)}</span><div class="sub" data-tip="${esc(m.reason ?? '')}">${esc(m.subject)}</div></div>${ibtn('edit', 'Draft a reply into out/mail', 'data-draft', 'small')}${ibtn('check', 'Handled', 'data-handled', 'small')}</div>`).join('') : empty('mail', null, 'Nothing in your mail asks for you.'));
  box.querySelectorAll('[data-draft]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/mail/${b.closest('.mailrow').dataset.uid}/draft`, { method: 'POST' }); b.innerHTML = ic('hourglass_top'); b.dataset.tip = 'Drafting into out/mail'; }));
  box.querySelectorAll('[data-handled]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/mail/${b.closest('.mailrow').dataset.uid}/handled`, { method: 'POST' }); deskSoon(); }));
}

function renderOut(d) {
  const box = $('#desk-out');
  box.innerHTML = d.out.length ? d.out.map((f) => `<button type="button" class="outrow" data-domain="${esc(f.domain)}" data-name="${esc(f.name)}" data-tip="${esc(f.domain)} · written ${ago(f.mtime)} · not sent">${ic(OUT_ICON[f.domain] ?? 'description')}<span class="nm">${esc(f.name)}</span><span class="muted">${ago(f.mtime)}</span></button>`).join('')
    : `<div class="out-visual" tabindex="0" data-tip="Nothing written yet. Anything Omnii would send or publish as you lands here as a file.">${ic('shield')}<span class="out-arrow"></span>${ic('folder_open')}</div>`;
  box.querySelectorAll('.outrow').forEach((b) => b.addEventListener('click', () => showOut(b.dataset.domain, b.dataset.name)));
}

function renderWatches(d) {
  const w = d.watches, t = d.trust, p = d.profile;
  const cell = (icon, on, tip, file, n = null) => `<button type="button" class="watch-cell" aria-pressed="${on}" data-tip="${esc(tip)}" data-f="${file}">${ic(icon)}${n === null ? '<span class="signal"></span>' : `<span class="num">${n}</span>`}</button>`;
  const TRUST_TIP = { mail: 'Email replies and unsubscribes', site: 'Changes to your website', submissions: 'Applications and submissions' };
  const TRUST_ICON = { mail: 'mail', site: 'public', submissions: 'upload' };
  $('#desk-watches').innerHTML = `
    <div class="watch-grid">
      ${cell('folder', !!w.export.path, w.export.path ? `Export folder: ${w.export.path} · ${w.export.seen} file${w.export.seen === 1 ? '' : 's'} asked about` : 'Export folder not set. Set it on the Config page.', 'watches.md')}
      ${cell('mail', w.mail.configured, w.mail.configured ? `Mail: reading${w.mail.since ? ` from message ${w.mail.since}` : ''}` : 'Mail not connected', 'watches.md')}
      ${cell('database', d.observations.length > 0, `${d.observations.length} thing${d.observations.length === 1 ? '' : 's'} Omnii has noticed about you. They never change a setting.`, 'observations.md', d.observations.length)}
      ${cell('person', !!p.name, p.name ? `${p.name} · ${p.timezone}` : 'Profile not filled in yet', 'profile.md')}
    </div>
    ${Object.entries(t).map(([k, v]) => `<div class="trust-row" tabindex="0" data-tip="${esc(TRUST_TIP[k] ?? k)}: ${v === 'live' ? 'may leave in your name' : 'written to out/ for you to read, never sent'}">${ic(TRUST_ICON[k] ?? 'shield')}<span class="sandbox-track"><i></i><i></i><i></i></span>${ic(v === 'live' ? 'lock_open' : 'shield', v === 'live' ? 'warn' : 'ok')}</div>`).join('')}
    <div class="file-tabs">${ibtn('notifications', 'Open priorities.md', 'data-f="priorities.md"', 'small')}${ibtn('shield', 'Open trust.md', 'data-f="trust.md"', 'small')}</div>`;
  $('#desk-watches').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => showDeskFile(b.dataset.f)));
  $('#watches-settings').onclick = () => showView('settings');
}
