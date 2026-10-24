import { $, api, esc, ic, ibtn, head } from '../lib.js';
import { state, deskSoon, showView, kindIcon } from '../app.js';
import { openDrawer } from './side.js';
import { showInterview } from './interview.js';
import { priority } from './desk.js';

/** "What I do": the loop's rules printed as sentences, with the blanks as the controls. Explanations live in the heading tooltips. */
let S = null;
const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const DUR = ['15m', '30m', '45m', '1h', '90m', '2h', '3h', '4h', '6h', '12h', '1d', '2d', '3d', '7d'];
const durLabel = (d) => ({ '15m': '15 minutes', '30m': '30 minutes', '45m': '45 minutes', '1h': '1 hour', '90m': '90 minutes', '2h': '2 hours', '3h': '3 hours', '4h': '4 hours', '6h': '6 hours', '12h': '12 hours', '1d': '1 day', '2d': '2 days', '3d': '3 days', '7d': '1 week' }[d] ?? d);
const LEVELS = ['top', 'normal', 'low'];
const TRUST = { mail: ['mail', 'Email replies and unsubscribes'], site: ['public', 'Changes to your website'], submissions: ['upload', 'Applications and submissions'] };

export async function renderSettings() {
  S = await api('/api/settings');
  const L = S.loop, P = S.priorities, W = S.watches, st = S.status;
  const waitingNow = S.waiting.filter((c) => c.state === 'open');
  const box = $('#view-settings');
  box.innerHTML = `
<section class="rules">
  ${head('schedule', 'How often I look', 'Every sentence on this page is a rule I follow. Change a number and I follow the new rule on my next look. I never edit this page myself; only you do.')}
  <p class="rule">Every ${num('loop.every_min', L.every_min, 1, 120)} minutes I look at what's on your plate.</p>
  <p class="rule">${L.quiet ? `Between ${time('loop.quiet.from', L.quiet.from)} and ${time('loop.quiet.to', L.quiet.to)} I don't text you; anything that comes up waits for the morning. ${btn('loop.quiet', null, 'no quiet hours')}` : `I may text you at any hour. ${btn('loop.quiet', { from: '22:00', to: '08:00' }, 'add quiet hours')}`}</p>
  <p class="rule">${sw('loop.paused', L.paused, 'Paused: nothing looks, nothing asks, until you turn me back on.', 'Running. Pause everything')}</p>
  <p class="now">${st.paused ? 'Paused.' : st.last ? `Last looked ${hm(st.last.at)}, next ${st.next ? hm(st.next) : '–'}.` : 'I have not looked yet.'}</p>

  ${head('notifications', 'How I ask', 'One sentence, fixed options. I never have more than the set number of questions out to you at once; the rest wait their turn.')}
  <p class="rule">When I have a question, I ${sel('loop.ask.text', String(L.ask.text), [['true', 'text you and put it on the desk'], ['false', 'only put it on the desk']])}.</p>
  <p class="rule">I never have more than ${num('loop.max_open', L.max_open, 1, 10)} question${L.max_open === 1 ? '' : 's'} out to you at a time.</p>
  <p class="now">${waitingNow.length ? `${waitingNow.length} waiting: ${waitingNow.map((c) => `${c.title.replace(/[:.\s]+$/, '').slice(0, 40)} (asked ${hm(c.created)})`).join('; ')}.` : 'Nothing is waiting on you.'}</p>

  ${head('timer', "When you don't answer", 'Ignoring a question is allowed. Filed questions stay in History on the desk; I never delete them.')}
  <p class="rule">${priority('top')} <b>Top.</b> I come back once after ${dur('loop.levels.top.remind_after', L.levels.top.remind_after)}. If there's still no answer by ${time('loop.levels.top.end_of_day', L.levels.top.end_of_day)}, I file it as unanswered and stop. ${sel('loop.levels.top.text', String(L.levels.top.text), [['true', 'I text these'], ['false', "I don't text these"]])}.</p>
  <p class="rule">${priority('normal')} <b>Normal.</b> I ask once. After ${dur('loop.levels.normal.file_after', L.levels.normal.file_after)} of silence I file it. ${sel('loop.levels.normal.text', String(L.levels.normal.text), [['true', 'I text these'], ['false', "I don't text these"]])}.</p>
  <p class="rule">${priority('low')} <b>Low.</b> I ask once. After ${dur('loop.levels.low.file_after', L.levels.low.file_after)} of silence I file it. ${sel('loop.levels.low.text', String(L.levels.low.text), [['true', 'I text these'], ['false', "I don't text these"]])}.</p>

  ${head('repeat', 'Rhythms', 'Routines I keep for you. Logging one from the desk or by text counts for the day.')}
  <div class="card ${P.medicine.enabled ? '' : 'off'}"><p class="rule">${ic('medication', 'accent')} <b>Medicine.</b> At ${time('priorities.medicine.time', P.medicine.time)} every day, if you haven't logged it, I ask. Priority ${sel('priorities.medicine.priority', P.medicine.priority, LEVELS.map((l) => [l, l]))}. ${sw('priorities.medicine.enabled', P.medicine.enabled, 'on', 'off')}</p>
    <p class="now">${S.logbook.medicine ? `Last logged ${ago(S.logbook.medicine.ts)}${S.logbook.medicine.via === 'imessage' ? ' by text' : ''}.` : 'Never logged yet.'}</p></div>
  <div class="card ${P.chores.enabled ? '' : 'off'}"><p class="rule">${ic('home')} <b>Apartment.</b> On ${days('priorities.chores.days', P.chores.days)} at ${time('priorities.chores.time', P.chores.time)} I nudge once. Priority ${sel('priorities.chores.priority', P.chores.priority, LEVELS.map((l) => [l, l]))}. ${sw('priorities.chores.enabled', P.chores.enabled, 'on', 'off')}</p>
    <p class="now">${S.logbook.chores ? `Last done ${ago(S.logbook.chores.ts)}.` : 'Not logged yet.'}</p></div>

  ${head('visibility', 'What I watch', 'I read, never change. The export folder is scanned for new files. Mail is sender and subject only, never the message.')}
  <p class="rule">${ic('folder')} <b>Finished work.</b> The folder ${text('watches.export.path', W.export.path, 'a folder on this Mac')}. When a new file appears there I ask what you'd like done with it.${W.export.path ? ` <span class="now-inline">${W.export.seen} asked about so far.</span>` : ''}</p>
  <p class="rule">${ic('mail')} <b>Email.</b> ${W.mail.configured ? `Connected to ${esc(W.mail.user)}. ${btn('mail.disconnect', null, 'change')}` : `Not connected. ${btn('mail.connect', null, 'connect…')}`} When one sender has sent ${num('watches.mail.unsub_threshold', W.mail.unsub_threshold, 1, 50)} or more in a week and offers an unsubscribe link, I ask whether to unsubscribe.</p>
  <div id="mail-connect" hidden><div class="row">
    <input id="mc-host" placeholder="imap.example.com" value="${esc(W.mail.host)}" data-tip="Your mail provider's server. Gmail: imap.gmail.com · Fastmail: imap.fastmail.com">
    <input id="mc-user" placeholder="you@example.com" value="${esc(W.mail.user)}" data-tip="The address I read">
    <input id="mc-pass" type="password" placeholder="app password" data-tip="An app password you create in your mail account's security settings, so I never see your real password. Stored in .env only, never in a desk file.">
    <button id="mc-save">Save</button></div></div>
  ${W.mail.configured ? `<p class="now">${W.mail.lastCheck ? `Last read ${ago(W.mail.lastCheck)}.` : 'Not read yet.'}${W.mail.lastError ? ` Last problem: ${esc(W.mail.lastError)}` : ''}${W.mail.ignore.length ? ` Never asking about: ${W.mail.ignore.map(esc).join(', ')}.` : ''}</p>` : ''}

  ${head('shield', 'In your name', 'Everything I would send or publish as you is written to the out/ folder instead, for you to read. Sending for real is not available yet.', ibtn('folder_open', "See what's in out/", 'data-k="open.out" data-json="null"', 'small act'))}
  ${Object.entries(TRUST).map(([k, [icon, label]]) => `<div class="trust-row" tabindex="0" data-tip="${esc(label)}: written to out/${k}/ for you to read, never sent. Sending for real: not available yet.">${ic(icon)}<span class="trust-label">${esc(label)}</span><span class="sandbox-track"><i></i><i></i><i></i></span>${ic('lock', 'dim')}</div>`).join('')}

  ${head('account_tree', "What's on your plate", 'Priorities are yours alone; I never change them. When something is finished and has not been shared, I ask you once what to do with it.')}
  ${S.islands.length ? `<table class="islands"><thead><tr><th></th><th>name</th><th>kind</th><th>where it stands</th><th>priority</th><th></th></tr></thead><tbody>${S.islands.map((i) => `<tr data-slug="${esc(i.slug)}"><td>${kindIcon(i.kind)}</td><td>${text(`islands.${i.slug}.name`, i.name, 'name')}</td><td>${sel(`islands.${i.slug}.kind`, i.kind, ['make', 'research', 'build', 'story', 'grow', 'open'].map((k) => [k, k]))}</td><td>${sel(`islands.${i.slug}.position`, i.position, ['not started', 'in progress', 'finished, not shared', 'ongoing', 'done'].map((p) => [p, p]))}</td><td>${sel(`islands.${i.slug}.priority`, i.priority, LEVELS.map((l) => [l, l]))}</td><td>${ibtn('delete', 'Remove from the plate (its file is deleted)', `data-remove="${esc(i.slug)}"`, 'small')}</td></tr>`).join('')}</tbody></table>` : '<p class="now">Nothing on the plate yet.</p>'}

  ${head('database', "What I've noticed", 'Things that help me arrange and phrase better. They never change a setting on this page. Strike any you disagree with.')}
  ${S.observations.length ? `<ul class="obs">${S.observations.map((o) => `<li><span class="muted">${esc(o.date)}</span> ${esc(o.text)} <span class="muted">· ${esc(o.source)}</span> ${ibtn('close', 'Strike this', `data-strike="${esc(o.text)}"`, 'small')}</li>`).join('')}</ul>` : '<p class="now">Nothing noticed yet.</p>'}

  ${head('person', 'Who you are to me', 'Where I text you is kept in the .env file, never in a desk file.', btn('interview', null, 'run the interview again'))}
  <p class="rule">You are ${text('profile.name', S.profile.name, 'your name')}, in ${text('profile.timezone', S.profile.timezone, 'America/Chicago')}. Your writing lives at ${text('profile.writing', S.profile.writing, 'folder or URL')} and your site at ${text('profile.site', S.profile.site, 'folder')}. I text ${text('reach.handle', S.reach.handle, 'phone or email')}.</p>

  <footer class="rules-foot">${ibtn('description', 'Open the files. Everything here is a plain file in desk/; every change you make is written in the log as "you changed X from A to B".', 'data-k="open.files" data-json="null"', 'small act')}</footer>
</section>
<div id="toast" class="toast" hidden></div>`;
  wire(box);
}

// ---- controls: each returns HTML for an inline blank; wire() attaches the saves
const num = (k, v, min, max) => `<span class="blank num" data-k="${k}"><button class="step" data-d="-1" aria-label="less">−</button><input type="number" min="${min}" max="${max}" value="${v}"><button class="step" data-d="1" aria-label="more">+</button></span>`;
const time = (k, v) => `<input class="blank" type="time" data-k="${k}" value="${esc(v)}">`;
const text = (k, v, ph) => `<input class="blank text" type="text" data-k="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" size="${Math.max(6, Math.min(40, String(v || ph).length + 1))}">`;
const sel = (k, v, opts) => `<select class="blank" data-k="${k}">${opts.map(([val, label]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
const dur = (k, v) => sel(k, v, (DUR.includes(v) ? DUR : [v, ...DUR]).map((d) => [d, durLabel(d)]));
const sw = (k, on, onLabel, offLabel) => `<button class="blank switch ${on ? 'on' : ''}" data-k="${k}" data-v="${!on}">${on ? esc(onLabel) : esc(offLabel)}</button>`;
const days = (k, v) => `<span class="blank days" data-k="${k}">${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => `<button class="${v.includes(d) ? 'on' : ''}" data-day="${d}">${d}</button>`).join('')}</span>`;
const btn = (k, v, label) => `<button class="ghost tiny act" data-k="${k}" data-json='${esc(JSON.stringify(v))}'>${esc(label)}</button>`;

async function save(key, value) {
  try {
    const r = await api('/api/settings', { method: 'PUT', body: { key, value } });
    const label = S.labels[key] ?? key.split('.').slice(-1)[0];
    toast(`Saved: ${label} is now ${show(r.to)}${S.status.next && !S.loop.paused ? `. Takes effect when I next look.` : '.'}`, r.from === undefined ? null : () => save(key, r.from));
    deskSoon();
    await renderSettings();
  } catch (e) { toast(e.message); }
}
const show = (v) => v === null ? 'off' : typeof v === 'object' ? `${v.from} to ${v.to}` : String(v);
let toastTimer = null;
function toast(msg, undo) {
  const t = $('#toast'); if (!t) return;
  t.hidden = false; t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="ghost tiny" id="toast-undo">undo</button>' : ''}`;
  if (undo) $('#toast-undo').addEventListener('click', () => { t.hidden = true; undo(); });
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { if ($('#toast')) $('#toast').hidden = true; }, 10000);
}

function wire(box) {
  box.querySelectorAll('.blank.num').forEach((el) => {
    const inp = el.querySelector('input');
    el.querySelectorAll('.step').forEach((b) => b.addEventListener('click', () => { inp.value = Math.max(Number(inp.min), Math.min(Number(inp.max), Number(inp.value) + Number(b.dataset.d))); save(el.dataset.k, Number(inp.value)); }));
    inp.addEventListener('change', () => save(el.dataset.k, Number(inp.value)));
  });
  box.querySelectorAll('input.blank[type=time], select.blank, input.blank.text').forEach((el) => el.addEventListener('change', () => save(el.dataset.k, el.value)));
  box.querySelectorAll('.switch').forEach((el) => el.addEventListener('click', () => save(el.dataset.k, el.dataset.v === 'true')));
  box.querySelectorAll('.blank.days').forEach((el) => el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const on = [...el.querySelectorAll('button')].filter((x) => x.classList.contains('on')).map((x) => x.dataset.day);
    save(el.dataset.k, b.classList.contains('on') ? on.filter((d) => d !== b.dataset.day) : [...on, b.dataset.day]);
  })));
  box.querySelectorAll('.act').forEach((el) => el.addEventListener('click', () => {
    const k = el.dataset.k, v = JSON.parse(el.dataset.json);
    if (k === 'open.files') return openDrawer('desk');
    if (k === 'open.out') return showView('desk');
    if (k === 'interview') return showInterview(true);
    if (k === 'mail.connect' || k === 'mail.disconnect') { $('#mail-connect').hidden = false; $('#mc-host').focus(); return; }
    save(k, v);
  }));
  $('#mc-save')?.addEventListener('click', async () => {
    try {
      await api('/api/settings', { method: 'PUT', body: { key: 'mail.host', value: $('#mc-host').value } });
      await api('/api/settings', { method: 'PUT', body: { key: 'mail.user', value: $('#mc-user').value } });
      if ($('#mc-pass').value) await api('/api/settings', { method: 'PUT', body: { key: 'mail.pass', value: $('#mc-pass').value } });
      toast('Saved. I start reading on my next look.'); await renderSettings(); deskSoon();
    } catch (e) { toast(e.message); }
  });
  box.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Remove "${S.islands.find((i) => i.slug === b.dataset.remove)?.name}" from the plate? Its file is deleted; nothing else is touched.`)) return;
    await api(`/api/islands/${b.dataset.remove}/remove`, { method: 'POST' }); deskSoon(); renderSettings();
  }));
  box.querySelectorAll('[data-strike]').forEach((b) => b.addEventListener('click', () => save('observations.remove', b.dataset.strike)));
}
