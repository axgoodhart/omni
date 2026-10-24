import { $, api, esc, ic, ibtn, progressHTML, wireProgress } from '../lib.js';
import { state, deskSoon, showView, kindIcon } from '../app.js';
import { openDrawer } from './side.js';
import { showInterview } from './interview.js';

/** Config: sections as header bands over a spine; inside, one setting per line, label first, every choice visible. Explanations live in the (i) dots. */
let S = null;
const pad = (n) => String(n).padStart(2, '0');
const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const toMs = (s) => [...String(s).matchAll(/(\d+(?:\.\d+)?)\s*([mhdw]?)/g)].reduce((t, [, n, u]) => t + Number(n) * ({ h: 3_600_000, d: 86_400_000, w: 604_800_000 }[u] ?? 60_000), 0);
const LEVELS = ['high', 'medium', 'low'];
const NAME = { high: 'High', medium: 'Medium', low: 'Low' };
const VIA = [['desk', 'Desk'], ['phone', 'Phone'], ['both', 'Both']];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const KINDS = ['make', 'research', 'build', 'story', 'grow', 'open'];
const TRUST = { mail: 'Email replies', site: 'Website changes', submissions: 'Submissions' };

// ==== NUDGE SCALES (per priority: the quick nudges, then the slower ones) ====
const UNIT = { m: [60_000, 'min'], d: [86_400_000, 'days'], w: [604_800_000, 'weeks'] };
const NUDGE = {
  high: [{ u: 'm', min: 5, max: 240, step: 5 }, { u: 'm', min: 15, max: 480, step: 15 }],
  medium: [{ u: 'm', min: 15, max: 480, step: 15 }, { u: 'd', picks: [0.5, 1, 2, 3, 4, 5, 6, 7] }],
  low: [{ u: 'd', picks: [1, 2, 3, 4, 5, 6, 7] }, { u: 'w', picks: [1, 2, 3, 4, 5, 6, 7] }],
};
// ==== QUIET TRACK ====
const Q0 = 17 * 60; // the day track starts at 5 PM so the night sits in the middle
const QN = 96;      // 15-minute steps

export async function renderSettings() {
  S = await api('/api/settings');
  const L = S.loop, P = S.priorities, W = S.watches, st = S.status, texting = !!state.data?.imessage;
  const waiting = S.waiting.filter((c) => c.state === 'open');
  const box = $('#view-settings');
  box.innerHTML = `
<section class="cfg">
  ${block('autorenew', 'Loop', 'Every line on this page is a rule Omnii follows. Change one and Omnii follows it on its next look. Omnii never edits this page; only you do.',
    line('Every', slider('loop.every_min', L.every_min, 1, 120, 1, 'min'), 'How often Omnii looks at what is on your plate.')
    + line('Quiet hours', quiet(L.quiet), "Omnii doesn't text you in these hours, and nothing is nudged or filed until they end. Drag either end."),
    { control: pills('loop.paused', L.paused, [[false, 'Active'], [true, 'Paused']], L.paused ? 'warn' : ''),
      status: st.paused ? stat([['Paused', '', 'warn']]) : st.last ? stat([['Last', hm(st.last.at)], ['Next', st.next ? hm(st.next) : '–', 'next']]) : stat([['Not looked yet', '']]) })}

  ${block('notifications', 'Reach', 'Where questions reach you, and how many may be out at once. The rest wait their turn.',
    line('Arrive via', pills('loop.via', L.via, VIA) + (!texting && L.via !== 'desk' ? fact('Texting is off, so everything goes to the desk.', 'dim') : ''), 'Where questions may reach you at all. Each priority below picks its own, inside this.')
    + line('No more than', pills('loop.max_open', L.max_open, [1, 2, 3, 4, 5].map((n) => [n, String(n)])) + '<span class="unit">at a time</span>')
    + (waiting.length ? line('Waiting', fact(waiting.map((c) => `${esc(c.title.replace(/[:.\s]+$/, '').slice(0, 40))} (asked ${hm(c.created)})`).join('; '))) : ''),
    { status: stat([['Waiting', waiting.length || 'none']]) })}

  ${block('low_priority', 'Priorities', "What happens when you don't answer: a few quick nudges, then a few slower ones, then filed or kept going. Ignoring a question is allowed; filed ones stay in the desk history.",
    LEVELS.map(level).join(''))}

  ${block('repeat', 'Rhythms', 'Routines Omnii keeps for you. Logging one from the desk or by text counts for the day.',
    rhythm('medicine', 'Medicine', 'Every day at this time, if it is not logged, Omnii asks.', '', S.logbook.medicine ? `logged ${ago(S.logbook.medicine.ts)}${S.logbook.medicine.via === 'imessage' ? ' by text' : ''}` : 'never logged')
    + rhythm('chores', 'Apartment', 'On these days at this time, Omnii nudges once.', line('Days', days('priorities.chores.days', P.chores.days)), S.logbook.chores ? `done ${ago(S.logbook.chores.ts)}` : 'never logged'))}

  ${block('visibility', 'Watches', 'Omnii reads, never changes. The folder is scanned for new files. Mail is sender and subject only, never the message.',
    line('Finished work', text('watches.export.path', W.export.path, 'a folder on this Mac') + (W.export.path ? fact(`${W.export.seen} known`, 'dim') : ''), 'Files already in the folder when you set it count as known. When a new one appears, Omnii asks what you would like done with it.')
    + `<div class="group">${line('Email', W.mail.configured ? `${fact(`Connected to ${esc(W.mail.user)}`)}${btn('mail.disconnect', null, 'change')}` : btn('mail.connect', null, 'connect…'))}
      <div id="mail-connect" hidden>${rail(
        line('Server', `<input class="field" id="mc-host" placeholder="imap.example.com" value="${esc(W.mail.host)}">`, "Your mail provider's server. Gmail: imap.gmail.com · Fastmail: imap.fastmail.com")
        + line('Address', `<input class="field" id="mc-user" placeholder="you@example.com" value="${esc(W.mail.user)}">`, 'The address Omnii reads')
        + line('App password', `<input class="field" id="mc-pass" type="password" placeholder="app password">`, "An app password you create in your mail account's security settings, so Omnii never sees your real password. Stored in .env only, never in a desk file.")
        + line('', '<button type="button" id="mc-save">Save</button>'))}</div>
      ${W.mail.configured ? rail(line('Last read', fact(`${W.mail.lastCheck ? ago(W.mail.lastCheck) : 'not yet'}${W.mail.lastError ? ` · problem: ${esc(W.mail.lastError)}` : ''}`)) + (W.mail.ignore.length ? line('Never asks about', fact(W.mail.ignore.map(esc).join(', '))) : '')) : ''}
      ${rail(line('Unsubscribe at', slider('watches.mail.unsub_threshold', W.mail.unsub_threshold, 1, 30, 1, 'a week from one sender'), 'When one sender sends this many in a week and offers an unsubscribe link, Omnii asks whether to unsubscribe.'))}</div>`)}

  ${block('shield', 'In your name', 'Everything Omnii would send or publish as you is written to the out/ folder instead, for you to read. Sending for real is not available yet.',
    Object.entries(TRUST).map(([k, label]) => line(label, `${ic('lock', 'dim')}${fact(`written to out/${k}/, never sent`)}`)).join(''),
    { actions: ibtn('folder_open', "See what's in out/", 'data-k="open.out" data-json="null"', 'small act') })}

  ${block('verified_user', 'Always allowed', 'Things you told Omnii it may do without asking, each as narrow as one exact command, one folder or one person. Remove one and Omnii asks again. They live in desk/allowed.md.',
    S.allowed.length ? S.allowed.map((r, i) => line(esc(r.added ?? ''), `${fact(esc(r.label))}${ibtn('close', 'Take this back; Omnii will ask again', `data-unallow="${i}"`, 'small')}`)).join('') : line('', fact('Nothing yet. When Omnii asks, “Always allow this” adds a line here.')))}

  ${block('account_tree', 'Plate', 'Everything you are working on. Click a name to rename it; the slider is how far along it is. Priorities are yours alone; Omnii never changes them. When something reaches done, Omnii asks you once what should happen with it.',
    plate(S.islands))}

  ${block('database', 'Noticed', 'Things that help Omnii arrange and phrase better. They never change a setting on this page. Strike any you disagree with.',
    S.observations.length ? S.observations.map((o) => line(esc(o.date), `${fact(`${esc(o.text)} · ${esc(o.source)}`)}${ibtn('close', 'Strike this', `data-strike="${esc(o.text)}"`, 'small')}`)).join('') : line('', fact('Nothing yet.')))}

  ${block('person', 'You', 'Where Omnii texts you is kept in the .env file, never in a desk file.',
    line('Name', text('profile.name', S.profile.name, 'your name'))
    + line('Timezone', text('profile.timezone', S.profile.timezone, 'America/Chicago'))
    + line('Writing', text('profile.writing', S.profile.writing, 'folder or URL'))
    + line('Site', text('profile.site', S.profile.site, 'folder'))
    + line('Texts go to', text('reach.handle', S.reach.handle, 'phone or email')),
    { actions: btn('interview', null, 'interview again') })}

  <footer class="rules-foot">${ibtn('description', 'Open the files. Everything here is a plain file in desk/; every change you make is written in the log as "you changed X from A to B".', 'data-k="open.files" data-json="null"', 'small act')}</footer>
</section>
<div id="toast" class="toast" hidden></div>`;
  wire(box);
}

// ---- layout: a block is a header band over a spine; a rail holds lines, and a rail inside a rail holds what belongs to the line above
const block = (icon, title, tip, body, { control = '', status = '', actions = '' } = {}) => `<section class="block">
  <header class="block-head"><span class="block-ic">${ic(icon)}</span><h2>${esc(title)}</h2>${control}<span class="block-status">${status}</span>${actions}${info(tip)}</header>
  <div class="block-body">${rail(body)}</div></section>`;
const rail = (html, off = false) => `<div class="rail${off ? ' off' : ''}">${html}</div>`;
const info = (tip) => (tip ? `<span class="info" tabindex="0" data-tip="${esc(tip)}">${ic('info', 'fill')}</span>` : '');
const line = (label, value, tip = '') => `<div class="line">${info(tip)}<span class="lab">${label}</span><span class="val">${value}</span></div>`;
const stat = (pairs) => pairs.map(([k, v, cls = '']) => `<span class="k ${cls}">${k}</span><span class="v ${cls}">${v}</span>`).join('');
const fact = (t, cls = '') => `<span class="fact ${cls}">${t}</span>`;

// ---- controls: each returns HTML; wire() attaches the saves
const pills = (k, cur, opts, cls = '') => `<span class="pills ${cls}" role="radiogroup" data-k="${k}">${opts.map(([v, label, on = JSON.stringify(cur) === JSON.stringify(v)]) => `<button type="button" role="radio" aria-checked="${on}" data-v="${esc(JSON.stringify(v))}">${esc(label)}</button>`).join('')}</span>`;
const days = (k, on) => `<span class="pills multi" data-k="${k}">${DAYS.map((d) => `<button type="button" aria-pressed="${on.includes(d)}" data-day="${d}">${d}</button>`).join('')}</span>`;
const slider = (k, v, min, max, step, unit, suffix = '') => `<span class="slide" data-k="${k}" data-suffix="${suffix}"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="${esc(unit)}"><output>${v}</output><span class="unit">${esc(unit)}</span></span>`;
const time = (k, v) => `<input class="field time" type="time" data-k="${k}" value="${esc(v)}">`;
const text = (k, v, ph) => `<input class="field" type="text" data-k="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;
const btn = (k, v, label) => `<button type="button" class="ghost tiny act" data-k="${k}" data-json='${esc(JSON.stringify(v))}'>${esc(label)}</button>`;

function level(l) {
  const R = S.loop.levels[l];
  return `<div class="group">${line(`<b>${NAME[l]}</b>`, pills(`loop.levels.${l}.via`, R.via, VIA))}${rail(nudge(l, 0) + nudge(l, 1)
    + `<div class="group">${line('Stop after 2nds?', pills(`loop.levels.${l}.stop`, R.stop, [[true, 'Yes'], [false, 'No']]), 'Yes: after the slower nudges the question is filed as unanswered. No: the slower nudges go on until you answer.')}`
    + (R.stop ? rail(line('When filed', pills(`loop.levels.${l}.stop_text`, R.stop_text, [[true, 'Text and log'], [false, 'Log only']]), 'Whether Omnii also texts you that it was filed. Filed questions stay in the desk history either way.')) : '') + '</div>')}</div>`;
}
function nudge(l, i) {
  const R = S.loop.levels[l], f = i ? 'second' : 'first', s = NUDGE[l][i], [unitMs, unit] = UNIT[s.u], k = `loop.levels.${l}.${f}_after`;
  const n = +(toMs(R[`${f}_after`]) / unitMs).toFixed(2);
  const wait = s.picks
    ? `${pills(k, null, [...new Set([...s.picks, n])].sort((a, b) => a - b).map((p) => [`${p}${s.u}`, p === 0.5 ? '½' : String(p), p === n]))}<span class="unit">${unit}</span>`
    : slider(k, n, s.min, s.max, s.step, unit, s.u);
  return line(i ? '2nd nudge after' : '1st nudge after', wait + pills(`loop.levels.${l}.${f}_times`, R[`${f}_times`], [1, 2, 3].map((t) => [t, `${t}x`]), 'times'),
    i ? 'The slower nudges that follow the quick ones, and how many.' : 'The quick nudges right after Omnii asks, and how many.');
}
function rhythm(key, name, tip, extra, last) {
  const p = S.priorities[key];
  return `<div class="group">${line(`<b>${name}</b>`, pills(`priorities.${key}.enabled`, p.enabled, [[true, 'On'], [false, 'Off']]), tip)}${rail(extra
    + line('Time', time(`priorities.${key}.time`, p.time))
    + line('Priority', pills(`priorities.${key}.priority`, p.priority, LEVELS.map((l) => [l, NAME[l]])))
    + line('Last', fact(last)), !p.enabled)}</div>`;
}
// ---- plate: one row per island. The name is the field (pencil on hover); priority as a letter; type as a grid; progress as a slider.
const choice = (k, cur, opts, cls, tip = () => '') => `<span class="${cls}" role="radiogroup" data-k="${k}">${opts.map(([v, label]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-v="${esc(JSON.stringify(v))}"${tip(v) ? ` data-tip="${esc(tip(v))}"` : ''}>${esc(label)}</button>`).join('')}</span>`;
function plate(list) {
  const row = (i) => `<div class="plate-row" data-slug="${esc(i.slug)}">
    <span class="plate-gutter">${ic('edit')}</span>
    <input class="plate-name" data-k="islands.${esc(i.slug)}.name" value="${esc(i.name)}" aria-label="Name">
    ${choice(`islands.${i.slug}.priority`, i.priority, LEVELS.map((l) => [l, NAME[l][0]]), 'letters', (l) => NAME[l])}
    ${choice(`islands.${i.slug}.kind`, i.kind, KINDS.map((k) => [k, k]), 'kinds')}
    ${progressHTML(i.progress, `data-k="islands.${esc(i.slug)}.progress"`)}
    ${ibtn('delete', 'Remove from the plate (its file is deleted)', `data-remove="${esc(i.slug)}"`, 'small')}
  </div>`;
  return `<div class="plate">
    <div class="plate-row head"><span></span><span></span><span class="lab">Priority</span><span class="lab">Type</span><span class="lab">Progress</span><span></span></div>
    ${list.map(row).join('')}
    <div class="plate-row add"><span class="plate-gutter">${ic('add')}</span><input class="plate-name" id="plate-add" placeholder="Add something to the plate" aria-label="Add to the plate"></div>
  </div>`;
}

// ---- quiet hours: one day on a track, the quiet stretch between two handles, each handle labelled with its time
const qIdx = (t) => { const [h, m] = t.split(':').map(Number); return Math.round(((h * 60 + m - Q0 + 1440) % 1440) / 15); };
const qHm = (i) => { const m = (Q0 + i * 15) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const ampm = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${pad(m)}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };
function quiet(q) {
  const from = q?.from ?? '22:00', to = q?.to ?? '08:00', a = qIdx(from), b = Math.max(a + 1, qIdx(to) || QN), off = q ? '' : 'disabled';
  return pills('loop.quiet', null, [[{ from, to }, 'On', !!q], [null, 'Off', !q]])
    + `<span class="quiet${q ? '' : ' off'}" style="--a:${a};--b:${b}"><span class="q-end">5<br>PM</span><span class="q-track"><i></i><b class="q-at" data-q="from">${ampm(from)}</b><b class="q-at" data-q="to">${ampm(to)}</b><input type="range" min="0" max="${QN}" value="${a}" aria-label="Quiet hours start" ${off}><input type="range" min="0" max="${QN}" value="${b}" aria-label="Quiet hours end" ${off}></span><span class="q-end">5<br>PM</span></span>`;
}

async function save(key, value) {
  try {
    const r = await api('/api/settings', { method: 'PUT', body: { key, value } });
    const label = S.labels[key] ?? key.split('.').slice(-1)[0];
    toast(`Saved: ${label} is now ${show(r.to)}${S.status.next && !S.loop.paused ? '. Takes effect when Omnii next looks.' : '.'}`, r.from === undefined ? null : () => save(key, r.from));
    deskSoon();
    await renderSettings();
  } catch (e) { toast(e.message); }
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
  wireProgress(box, (el, v) => save(el.dataset.k, v));
  const add = $('#plate-add');
  const addIsland = async () => { const name = add.value.trim(); if (!name) return; add.value = ''; await api('/api/islands', { method: 'POST', body: { name } }); deskSoon(); renderSettings(); };
  add?.addEventListener('change', addIsland);
  add?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addIsland(); } });
  box.querySelectorAll('.pills.multi').forEach((el) => el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const on = [...el.querySelectorAll('[aria-pressed="true"]')].map((x) => x.dataset.day);
    save(el.dataset.k, b.getAttribute('aria-pressed') === 'true' ? on.filter((d) => d !== b.dataset.day) : [...on, b.dataset.day]);
  })));
  box.querySelectorAll('.slide').forEach((el) => {
    const inp = el.querySelector('input'), out = el.querySelector('output');
    inp.addEventListener('input', () => { out.textContent = inp.value; });
    inp.addEventListener('change', () => save(el.dataset.k, el.dataset.suffix ? `${inp.value}${el.dataset.suffix}` : Number(inp.value)));
  });
  box.querySelectorAll('.quiet').forEach((el) => {
    const [fa, ta] = el.querySelectorAll('input'), [fl, tl] = el.querySelectorAll('.q-at');
    const show = () => { el.style.setProperty('--a', fa.value); el.style.setProperty('--b', ta.value); fl.textContent = ampm(qHm(+fa.value)); tl.textContent = ampm(qHm(+ta.value)); };
    fa.addEventListener('input', () => { if (+fa.value >= +ta.value) fa.value = +ta.value - 1; show(); });
    ta.addEventListener('input', () => { if (+ta.value <= +fa.value) ta.value = +fa.value + 1; show(); });
    [fa, ta].forEach((i) => i.addEventListener('change', () => save('loop.quiet', { from: qHm(+fa.value), to: qHm(+ta.value) })));
  });
  box.querySelectorAll('input[data-k]').forEach((el) => el.addEventListener('change', () => save(el.dataset.k, el.value)));
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
      toast('Saved. Omnii starts reading on its next look.'); await renderSettings(); deskSoon();
    } catch (e) { toast(e.message); }
  });
  box.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Remove "${S.islands.find((i) => i.slug === b.dataset.remove)?.name}" from the plate? Its file is deleted; nothing else is touched.`)) return;
    await api(`/api/islands/${b.dataset.remove}/remove`, { method: 'POST' }); deskSoon(); renderSettings();
  }));
  box.querySelectorAll('[data-unallow]').forEach((b) => b.addEventListener('click', () => save('allowed.remove', Number(b.dataset.unallow))));
  box.querySelectorAll('[data-strike]').forEach((b) => b.addEventListener('click', () => save('observations.remove', b.dataset.strike)));
}
