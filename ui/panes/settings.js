import { $, api, esc, ic, ibtn, sliderHTML, wireSliders, progressHTML, progressWord } from '../lib.js';
import { state, deskSoon, showView } from '../app.js';
import { openDrawer } from './side.js';
import { showInterview } from './interview.js';
import { renderNotifications, wireNotifications } from './notifications.js';

/** Config: quiet sections, one row per thing, every choice visible and small. Explanations live in the (i) per section and on each row's label. */
let S = null;
const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const LEVELS = ['high', 'medium', 'low'];
const NAME = { high: 'High', medium: 'Medium', low: 'Low' };
const RULE_KIND = { shell: 'Command', write_file: 'Files', imessage_send: 'Texts' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const KINDS = ['make', 'research', 'build', 'story', 'grow', 'open'];
const TRUST = ['Email replies', 'Website changes', 'Submissions'];

export async function renderSettings() {
  S = await api('/api/settings');
  paintSettings();
}

function paintSettings() {
  const L = S.loop, W = S.watches, st = S.status, texting = !!state.data?.imessage;
  const waiting = S.waiting.filter((c) => c.state === 'open');
  const box = $('#view-settings');
  const focus = box.contains(document.activeElement) ? document.activeElement.dataset.nFocus : null;
  box.innerHTML = `
<div class="cfg">
  ${sec('autorenew', 'Loop', 'Every row on this page is a rule Omnii follows. Change one and Omnii follows it on its next scan. Omnii never edits this page; only you do.',
    line("Scans every", cells(slider('loop.every_min', L.every_min, 1, 120, 'min', 'wide')), 'How often Omnii scans your plate.')
    + line('Out at once', cells(pills('loop.max_open', L.max_open, [1, 2, 3, 4, 5].map((n) => [n, String(n)]))), 'How many questions Omnii may have out to you at the same time.', waiting.length ? `${waiting.length} open` : 'none open')
    + (waiting.length ? line('Open requests', cells(fact(waiting.map((c) => `${esc(c.title.replace(/[:.\s]+$/, '').slice(0, 40))} (asked ${hm(c.created)})`).join('; ')))) : ''),
    { right: pills('loop.paused', L.paused, [[false, 'Active'], [true, 'Paused']], L.paused ? 'warn' : '') + (st.paused ? '<span class="warn">Paused</span>' : st.last ? `<span>Last ${hm(st.last.at)} · next ${st.next ? hm(st.next) : '–'}</span>` : '<span>Not looked yet</span>') })}

  ${renderNotifications(S, texting)}

  ${sec('repeat', 'Rhythms', 'Routines Omnii keeps for you. Logging one from the desk or by text counts for the day.',
    heads(['', '', 'Days', 'Time', 'Priority', 'Last'])
    + rhythm('medicine', 'Medicine', 'Every day at this time, if it is not logged, Omnii asks.', S.logbook.medicine ? `logged ${ago(S.logbook.medicine.ts)}${S.logbook.medicine.via === 'imessage' ? ' by text' : ''}` : 'never logged')
    + rhythm('chores', 'Apartment', 'On these days at this time, Omnii nudges once.', S.logbook.chores ? `done ${ago(S.logbook.chores.ts)}` : 'never logged'), { cls: 'rhythms', table: true })}

  ${sec('visibility', 'Watches', 'Omnii reads, never changes. The folder is scanned for new files. Mail is sender and subject only, never the message.',
    line('Finished work', cells(text('watches.export.path', W.export.path, 'a folder on this Mac') + (W.export.path ? fact(`${W.export.seen} known`, 'dim') : '')), 'Files already in the folder when you set it count as known. When a new one appears, Omnii asks what you would like done with it.')
    + line('Email', cells(W.mail.configured ? fact(`Connected to ${esc(W.mail.user)}`) + btn('mail.disconnect', null, 'change') : btn('mail.connect', null, 'connect…')), 'Omnii reads sender and subject only, never the message.', W.mail.configured ? (W.mail.lastCheck ? `read ${ago(W.mail.lastCheck)}` : 'not read yet') : '')
    + `<div id="mail-connect" hidden>${line('Server', cells(`<input class="field" id="mc-host" placeholder="imap.example.com" value="${esc(W.mail.host)}">`), "Your mail provider's server. Gmail: imap.gmail.com · Fastmail: imap.fastmail.com")
      + line('Address', cells(`<input class="field" id="mc-user" placeholder="you@example.com" value="${esc(W.mail.user)}">`), 'The address Omnii reads')
      + line('App password', cells('<input class="field" id="mc-pass" type="password" placeholder="app password">'), "An app password you create in your mail account's security settings, so Omnii never sees your real password. Stored in .env only, never in a desk file.")
      + line('', cells('<button type="button" id="mc-save">Save</button>'))}</div>`
    + (W.mail.lastError ? line('Problem', cells(fact(esc(W.mail.lastError), 'dim'))) : '')
    + (W.mail.ignore.length ? line('Never asks about', cells(fact(W.mail.ignore.map(esc).join(', '), 'dim'))) : '')
    + line('Unsubscribe at', cells(slider('watches.mail.unsub_threshold', W.mail.unsub_threshold, 1, 30, 'in a week') + fact('from one sender that offers an unsubscribe link', 'dim')), 'When one sender sends this many in a week and offers an unsubscribe link, Omnii asks whether to unsubscribe.'))}

  ${sec('shield', 'In your name', 'Everything Omnii would send or publish as you is written to the out/ folder instead, for you to read. Sending for real is not available yet.',
    line('Sends as you', cells(TRUST.map((t) => `<span class="fact">${ic('lock', 'dim')}${esc(t)}</span>`).join('') + fact('written to out/, never sent', 'dim')), 'Three kinds of thing Omnii could send as you. All of them are written to the out/ folder for you to read; none is sent.'),
    { right: ibtn('folder_open', "See what's in out/", 'data-k="open.out" data-json="null"', 'small act') })}

  ${S.allowed?.length ? sec('verified_user', 'Always allowed', 'Things you told Omnii it may always do without asking, each kept narrow: one exact command in one folder, one folder for files, one person for texts. Remove one and Omnii asks again next time.',
    S.allowed.map((a, i) => line(esc(RULE_KIND[a.tool] ?? a.tool), cells(fact(esc(a.label)) + (a.added ? fact(`since ${esc(a.added)}`, 'dim') : '')) + ibtn('close', 'Remove: Omnii asks again next time', `data-unallow="${i}"`, 'small'))).join('')) : ''}

  ${sec('account_tree', 'Plate', 'Everything you are working on. Click a name to rename it; the slider is how far along it is. Priorities are yours alone; Omnii never changes them. When something reaches done, Omnii asks you once what should happen with it.',
    heads(['', '', 'Priority', 'Type', 'Progress', '']) + S.islands.map(island).join('')
    + `<div class="line add"><span class="plate-gutter">${ic('add')}</span><input class="plate-name" id="plate-add" placeholder="Add something to the plate" aria-label="Add to the plate"></div>`, { cls: 'plate', table: true })}

  ${sec('database', 'Noticed', 'Things that help Omnii arrange and phrase better. They never change a setting on this page. Strike any you disagree with.',
    S.observations.length ? S.observations.map((o) => line(esc(o.date), cells(fact(esc(o.text)) + fact(esc(o.source), 'dim')) + ibtn('close', 'Strike this', `data-strike="${esc(o.text)}"`, 'small'))).join('') : line('', cells(fact('Nothing yet.', 'dim'))))}

  ${sec('person', 'You', 'Where Omnii texts you is kept in the .env file, never in a desk file.',
    line('Name', cells(text('profile.name', S.profile.name, 'your name')))
    + line('Timezone', cells(text('profile.timezone', S.profile.timezone, 'America/Chicago')))
    + line('Writing', cells(text('profile.writing', S.profile.writing, 'folder or URL')), 'Where your writing lives, so Omnii can match your voice.')
    + line('Site', cells(text('profile.site', S.profile.site, 'folder')), 'Where your website lives.')
    + line('Texts go to', cells(text('reach.handle', S.reach.handle, 'phone or email'))),
    { right: btn('interview', null, 'interview again') })}

  <footer class="rules-foot">${ibtn('description', 'Open the files. Everything here is a plain file in desk/; every change you make is written in the log as "you changed X from A to B".', 'data-k="open.files" data-json="null"', 'small act')}</footer>
</div>
<div id="toast" class="toast" role="status" hidden></div>`;
  wire(box);
  wireNotifications(box.querySelector('.notifications'), S, { save, saveMany, toast, rerender: paintSettings });
  if (focus) box.querySelector(`[data-n-focus="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
}

// ---- layout: a section is a title line over rows; a row is label · controls · status
const sec = (icon, title, tip, rows, { right = '', cls = '', table = false } = {}) => `<section class="sec ${cls}">
  <h2 class="sec-head">${ic(icon)}<span>${esc(title)}</span><span class="sec-right">${right}</span>${info(tip)}</h2>
  ${table ? `<div class="table">${rows}</div>` : rows}</section>`;
const cell = (h, html, cls = '') => `<span class="cell ${cls}" data-h="${esc(h)}">${html}</span>`;
const line = (label, inner, tip = '', status = '', cls = '') => `<div class="line ${cls}"><span class="lab"${tip ? ` data-tip="${esc(tip)}" tabindex="0"` : ''}>${label}</span>${inner}${status ? `<span class="status">${status}</span>` : ''}</div>`;
const heads = (list) => `<div class="line heads">${list.map((h) => `<span class="lab">${esc(h)}</span>`).join('')}</div>`;
const cells = (html) => `<span class="cells">${html}</span>`;
const info = (tip) => (tip ? `<span class="info" tabindex="0" data-tip="${esc(tip)}">${ic('info')}</span>` : '');
const fact = (t, cls = '') => `<span class="fact ${cls}">${t}</span>`;

// ---- controls: each returns HTML; wire() attaches the saves
const choice = (k, cur, opts, cls, tip = () => '') => `<span class="${cls}" role="radiogroup" data-k="${k}">${opts.map(([v, label]) => `<button type="button" role="radio" aria-checked="${JSON.stringify(cur) === JSON.stringify(v)}" data-v="${esc(JSON.stringify(v))}"${tip(v) ? ` data-tip="${esc(tip(v))}"` : ''}>${esc(label)}</button>`).join('')}</span>`;
const pills = (k, cur, opts, cls = '') => choice(k, cur, opts, `pills ${cls}`);
const days = (k, on) => `<span class="pills multi days" data-k="${k}">${DAYS.map((d) => `<button type="button" aria-pressed="${on.includes(d)}" data-day="${d}">${d}</button>`).join('')}</span>`;
const slider = (k, v, min, max, unit, cls = '') => sliderHTML({ min, max, step: 1, value: v, word: `${v} ${unit}`, attrs: `data-k="${k}" data-unit="${esc(unit)}"`, cls });
const time = (k, v) => `<input class="field time" type="time" data-k="${k}" value="${esc(v)}">`;
const text = (k, v, ph) => `<input class="field" type="text" data-k="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;
const btn = (k, v, label) => `<button type="button" class="ghost tiny act" data-k="${k}" data-json='${esc(JSON.stringify(v))}'>${esc(label)}</button>`;
function rhythm(key, name, tip, last) {
  const p = S.priorities[key], k = (f) => `priorities.${key}.${f}`;
  return line(`<b>${name}</b>`,
    cell('', pills(k('enabled'), p.enabled, [[true, 'On'], [false, 'Off']])) + cell('Days', key === 'chores' ? days(k('days'), p.days) : fact('every day', 'dim')) + cell('Time', time(k('time'), p.time))
    + cell('Priority', pills(k('priority'), p.priority, LEVELS.map((l) => [l, NAME[l]]))) + cell('Last', fact(esc(last), 'dim')),
    tip, '', p.enabled ? '' : 'off');
}
function island(i) {
  return `<div class="line" data-slug="${esc(i.slug)}">
    <span class="plate-gutter">${ic('edit')}</span>
    <input class="plate-name" data-k="islands.${esc(i.slug)}.name" value="${esc(i.name)}" aria-label="Name">
    ${cell('Priority', choice(`islands.${i.slug}.priority`, i.priority, LEVELS.map((l) => [l, NAME[l][0]]), 'letters', (l) => NAME[l]))}
    ${cell('Type', choice(`islands.${i.slug}.kind`, i.kind, KINDS.map((k) => [k, k]), 'kinds'))}
    ${cell('Progress', progressHTML(i.progress, `data-k="islands.${esc(i.slug)}.progress"`))}
    ${ibtn('delete', 'Remove from the plate (its file is deleted)', `data-remove="${esc(i.slug)}"`, 'small')}
  </div>`;
}

const save = (key, value) => saveMany([{ key, value }]);
let saving = false;
async function saveMany(changes) {
  if (saving) return;
  saving = true;
  const box = $('#view-settings'), focus = document.activeElement?.dataset.nFocus;
  box.inert = true;
  box.setAttribute('aria-busy', 'true');
  try {
    const saved = [];
    let error;
    try {
      for (const change of changes) saved.push(await api('/api/settings', { method: 'PUT', body: change }));
    } catch (e) { error = e; }
    try { await renderSettings(); } catch (e) { error ??= e; }
    if (saved.length) deskSoon();
    const undo = saved.filter((r) => r.from !== undefined).reverse().map((r) => ({ key: r.key, value: r.from }));
    const last = saved.at(-1);
    const label = last ? (S.labels?.[last.key] ?? last.key.split('.').at(-1)) : '';
    toast(error ? error.message : saved.length > 1 ? 'Saved reminder settings.' : `Saved: ${label} is now ${show(last.to)}.`, undo.length ? () => saveMany(undo) : null);
  } finally {
    saving = false;
    box.inert = false;
    box.removeAttribute('aria-busy');
    if (focus) {
      const target = box.querySelector('[data-n-focus="' + CSS.escape(focus) + '"]');
      (target?.disabled ? target.closest('.step')?.querySelector('button:not(:disabled)') : target)?.focus({ preventScroll: true });
    }
  }
}
const show = (v) => v === null ? 'off' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : `${v.from} to ${v.to}`) : String(v);
let toastTimer = null;
function toast(msg, undo) {
  const t = $('#toast'); if (!t) return;
  t.hidden = false; t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="ghost tiny" id="toast-undo">undo</button>' : ''}`;
  if (undo) $('#toast-undo').addEventListener('click', () => { t.hidden = true; undo(); });
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { if ($('#toast')) $('#toast').hidden = true; }, 10000);
}

function wire(box) {
  box.querySelectorAll('[role=radiogroup][data-k] button').forEach((b) => b.addEventListener('click', () => {
    if (b.getAttribute('aria-checked') !== 'true') save(b.parentElement.dataset.k, JSON.parse(b.dataset.v));
  }));
  box.querySelectorAll('[data-unallow]').forEach((b) => b.addEventListener('click', () => save('allowed.remove', Number(b.dataset.unallow))));
  box.querySelectorAll('.pills.multi').forEach((el) => el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const on = [...el.querySelectorAll('[aria-pressed="true"]')].map((x) => x.dataset.day);
    save(el.dataset.k, b.getAttribute('aria-pressed') === 'true' ? on.filter((d) => d !== b.dataset.day) : [...on, b.dataset.day]);
  })));
  wireSliders(box,
    (el, v) => el.dataset.unit ? [v, el.dataset.unit].join(' ') : progressWord(v),
    (el, v) => save(el.dataset.k, v));
  box.querySelectorAll('input[data-k]').forEach((el) => el.addEventListener('change', () => save(el.dataset.k, el.value)));
  const add = $('#plate-add');
  const addIsland = async () => { const name = add.value.trim(); if (!name) return; add.value = ''; await api('/api/islands', { method: 'POST', body: { name } }); deskSoon(); renderSettings(); };
  add?.addEventListener('change', addIsland);
  add?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addIsland(); } });
  box.querySelectorAll('.act').forEach((el) => el.addEventListener('click', () => {
    const k = el.dataset.k;
    if (k === 'open.files') return openDrawer('desk');
    if (k === 'open.out') return showView('desk');
    if (k === 'interview') return showInterview(true);
    if (k === 'mail.connect' || k === 'mail.disconnect') { $('#mail-connect').hidden = false; $('#mc-host').focus(); }
  }));
  $('#mc-save')?.addEventListener('click', async () => {
    try {
      await api('/api/settings', { method: 'PUT', body: { key: 'mail.host', value: $('#mc-host').value } });
      await api('/api/settings', { method: 'PUT', body: { key: 'mail.user', value: $('#mc-user').value } });
      if ($('#mc-pass').value) await api('/api/settings', { method: 'PUT', body: { key: 'mail.pass', value: $('#mc-pass').value } });
      toast('Saved. Omnii starts reading on its next scan.'); await renderSettings(); deskSoon();
    } catch (e) { toast(e.message); }
  });
  box.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Remove "${S.islands.find((i) => i.slug === b.dataset.remove)?.name}" from the plate? Its file is deleted; nothing else is touched.`)) return;
    await api(`/api/islands/${b.dataset.remove}/remove`, { method: 'POST' }); deskSoon(); renderSettings();
  }));
  box.querySelectorAll('[data-strike]').forEach((b) => b.addEventListener('click', () => save('observations.remove', b.dataset.strike)));
}
