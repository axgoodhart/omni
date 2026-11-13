import { esc } from '../lib.js';
import { ALL_DAYS, DAYS, LETTERS, sf, led, includes, dayControl, switchHTML, channels, stepper, tile } from '../controls.js';

const LEVELS = ['high', 'medium', 'low'];
const NAMES = ['High', 'Medium', 'Low'];
const minutes = (s) => { const m = /^(\d+(?:\.\d+)?)\s*([mhdw]?)$/.exec(String(s)); return m ? Number(m[1]) * ({ m: 1, h: 60, d: 1440, w: 10080 }[m[2] || 'm']) : 15; };
const hour = (s) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
const hhmm = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const clock = (h) => { const m = Math.round((h % 1) * 60); return `${Math.floor(h) % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h % 24 < 12 ? 'am' : 'pm'}`; };
let tab = 'high';
let mode = localStorage.getItem('omnii.notifications.mode') === 'advanced' ? 'advanced' : 'simple';
let schedule = { from: '22:00', to: '08:00', days: ALL_DAYS() };

const addPriority = (end = false) => `<button type="button" class="addp mx${end ? ' end' : ''}" data-placeholder="priority" aria-label="New priority"><span class="addp-rest m-out">${sf('plus')}</span><span class="addp-face m-in">${sf('plus')}<span>new priority</span></span></button>`;

function hoursCaption(start, end, days, ready) {
  if (!ready) return 'Paused. Omnii can reach you at any hour.';
  const selected = DAYS.filter((_, i) => days[i]);
  if (!selected.length) return 'No days chosen, so Omnii stays quiet every day.';
  const mask = days.map(Number).join('');
  const when = selected.length === 7 ? 'every day' : mask === '0111110' ? 'on weekdays' : mask === '1000001' ? 'at weekends' : `on ${selected.map((d) => d.slice(0, 3)).join(', ')}`;
  return `Omnii reaches you ${clock(start)} to ${clock(end)} ${when}, and stays quiet the rest of the time.`;
}
function hours(loop) {
  if (loop.quiet) schedule = { ...loop.quiet, days: loop.quiet.days ?? ALL_DAYS() };
  const start = hour(schedule.to), storedEnd = hour(schedule.from), end = storedEnd === 0 ? 24 : storedEnd, ready = !!loop.quiet;
  // An overnight legacy availability window is kept until its hours are edited.
  const wraps = start >= end;
  return `<section class="hours" aria-labelledby="hours-title"><h2 class="hours-title" id="hours-title">Available Hours</h2><div class="hours-main"><div class="range${ready ? '' : ' off'}${wraps ? ' wraps' : ''}" style="--start:${start / 24 * 100}%;--end:${end / 24 * 100}%"><div class="range-rail"><div class="range-fill"><span data-clock="from">${clock(start)}</span><span data-clock="until">${clock(end)}</span></div></div><input type="range" min="0" max="24" step="0.5" value="${start}" aria-label="Available from" aria-valuetext="${clock(start)}" data-hour="from" data-n-focus="hours-from"><input type="range" min="0" max="24" step="0.5" value="${end}" aria-label="Available until" aria-valuetext="${clock(end)}" data-hour="until" data-n-focus="hours-until"></div><p class="hours-caption" aria-live="polite">${hoursCaption(start, end, schedule.days, ready)}</p></div><div class="hours-side">${dayControl(schedule.days, 'available', 'Available days')}${switchHTML('ready', ready, 'Available hours', true)}</div></section>`;
}
function prioritySet(included) {
  return `<div class="prio-cell"><div class="priorities" role="group" aria-label="Priorities">${LEVELS.map((l, i) => `<button type="button" class="prio${included.includes(l) ? '' : ' off'}" aria-label="${NAMES[i]}" aria-pressed="${included.includes(l)}" data-priority="${l}" data-n-focus="priority-${l}"><span class="prio-face">${NAMES[i][0]}</span></button>`).join('')}</div>${addPriority(true)}</div>`;
}
function simple(loop, islands, texting, included) {
  const r = loop.levels.high, areas = [...new Set(islands.map((i) => i.kind))], area = loop.area || 'all';
  return `<div class="simple-row">${prioritySet(included)}<div class="when-cell">${dayControl(loop.days, 'reminder', 'Days')}<div class="area-ctl mx"><button type="button" class="sel" aria-label="Area" aria-haspopup="listbox" aria-expanded="false" data-n-focus="area"><i class="sel-mark m-in s1" aria-hidden="true"></i><span class="sel-text">${esc(area === 'all' ? 'all areas' : area)}</span>${sf('down', false, 'm-in s2')}</button><div class="menu" role="listbox" aria-label="Areas" hidden>${['all', ...areas].map((a) => `<button type="button" role="option" aria-selected="${a === area}" data-area="${esc(a)}">${esc(a === 'all' ? 'all areas' : a)}</button>`).join('')}</div></div></div><div class="reach-ctl mx"><span class="reach-rest m-out" aria-hidden="true"><span class="glyph">${['desk', 'phone'].filter((c) => includes(loop.via, c)).map((c) => sf(c, true)).join('')}</span><span class="readout"><b>${r.first_times}</b>x</span></span>${channels(loop.via, 'simple', texting, false, true)}${stepper('simple.times', r.first_times, 'times', 'Repeats', 1, 9, 1, false, true, 's3')}</div><div class="snooze-ctl mx">${tile('snooze')}<span class="snooze-rest readout m-out" aria-hidden="true"><b>${minutes(r.first_after)}</b><span>min.</span></span>${stepper('simple.snooze', minutes(r.first_after), 'min', 'Snooze', 5, 120, 5, false, true, 's4')}</div>${tile('archive', true)}</div>`;
}
function advanced(loop, texting) {
  const r = loop.levels[tab], key = (f) => `loop.levels.${tab}.${f}`;
  const primary = `<div class="block"><div class="sent mx"><span>send to</span>${channels(r.via, key('via'), texting)}</div><div class="sent">${stepper(key('first_times'), r.first_times, 'times', 'Repeats', 1, 9, 1)}<span>with a</span>${stepper(key('first_after'), minutes(r.first_after), 'min', 'Snooze', 5, 120, 5)}<span>snooze.</span></div><div class="tier"><div class="tier-bar"></div><div class="tier-foot">Primary</div></div></div>`;
  const secondary = r.second_times > 0 ? `<span class="amp-big" aria-hidden="true">&</span><div class="block t2"><div class="sent"><span>if no response arrives after</span>${stepper(key('second_after'), minutes(r.second_after), 'min', 'Wait before secondary', 5, 240, 5, true)}</div><div class="sent mx"><span>then, send to</span>${channels(r.second_via ?? r.via, key('second_via'), texting, true)}</div><div class="sent">${stepper(key('second_times'), r.second_times, 'times', 'Secondary repeats', 1, 9, 1, true)}<span>with a</span>${stepper(key('second_snooze'), minutes(r.second_snooze ?? r.second_after), 'min', 'Secondary snooze', 5, 120, 5, true)}<span>snooze.</span></div><div class="tier t2"><div class="tier-bar"></div><div class="tier-foot"><span>Secondary</span><button type="button" class="tag-x" data-secondary="remove" data-n-focus="secondary">${sf('close')}Remove</button></div></div></div>` : `<div class="block-add"><button type="button" class="link-add" data-secondary="add" data-n-focus="secondary">${sf('plus')}Add secondary</button></div>`;
  return `<div class="chain"><div class="tabs"><div role="group" aria-label="Priority">${LEVELS.map((l, i) => `<button type="button" class="tab${l === tab ? ' on' : ''}" aria-pressed="${l === tab}" aria-label="${NAMES[i]}" data-tab="${l}" data-n-focus="tab-${l}">${led(l === tab)}${NAMES[i][0]}</button>`).join('')}</div>${addPriority()}</div>${primary}${secondary}</div>`;
}

export function renderNotifications(settings, texting) {
  const loop = settings.loop, on = loop.notify !== false;
  const included = loop.notify_levels?.length ? loop.notify_levels : LEVELS;
  return `<div class="notifications"><div class="page"><header class="page-head${on ? '' : ' off'}"><h1 class="page-title">Notifications</h1>${switchHTML('notify', on, 'Notifications')}</header><div class="page-rule${on ? ' on' : ''}" aria-hidden="true"></div><div class="page-body${on ? '' : ' muted'}"${on ? '' : ' inert'}>${hours(loop)}<section class="reminders" aria-labelledby="reminders-title"><div class="sec-head"><h2 class="sec-title" id="reminders-title">Reminders</h2><div class="mode" role="group" aria-label="Detail"><button type="button" data-mode="simple" data-n-focus="mode-simple" aria-pressed="${mode === 'simple'}">simple</button><i aria-hidden="true"></i><button type="button" data-mode="advanced" data-n-focus="mode-advanced" aria-pressed="${mode === 'advanced'}">advanced</button></div><div class="sec-tools"><span class="pager">1 of 1</span><button type="button" class="link-voice" data-placeholder="reminder">+ add new</button></div></div>${mode === 'simple' ? simple(loop, settings.islands, texting, included) : advanced(loop, texting)}${!texting ? '<p class="channel-note">Texting is off, so everything goes to the desk.</p>' : ''}</section></div></div></div>`;
}

export function wireNotifications(root, settings, { save, saveMany, toast, rerender }) {
  const loop = settings.loop, included = loop.notify_levels?.length ? loop.notify_levels : LEVELS;
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; localStorage.setItem('omnii.notifications.mode', mode); rerender(); }));
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; rerender(); }));
  root.querySelectorAll('[data-placeholder]').forEach((b) => b.addEventListener('click', () => toast({ priority: 'Three levels for now.', reminder: 'One reminder for now.', archive: 'Nothing to archive yet.' }[b.dataset.placeholder])));
  root.querySelector('[data-switch="notify"]').addEventListener('click', () => save('loop.notify', loop.notify === false));
  root.querySelector('[data-switch="ready"]').addEventListener('click', () => save('loop.quiet', loop.quiet ? null : schedule));
  root.querySelectorAll('[data-priority]').forEach((b) => b.addEventListener('click', () => {
    const l = b.dataset.priority, next = included.includes(l) ? included.filter((p) => p !== l) : LEVELS.filter((p) => included.includes(p) || p === l);
    if (next.length) save('loop.notify_levels', next);
  }));
  root.querySelectorAll('[data-days]').forEach((group) => group.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const available = group.dataset.days === 'available', days = [...(available ? schedule.days : loop.days ?? ALL_DAYS())];
    days[Number(b.dataset.day)] = !days[Number(b.dataset.day)];
    if (available) { schedule = { ...schedule, days }; if (loop.quiet) save('loop.quiet', schedule); else rerender(); }
    else save('loop.days', days);
  })));
  root.querySelectorAll('[data-channels]').forEach((group) => group.querySelectorAll('[data-channel]').forEach((b) => b.addEventListener('click', () => {
    const key = group.dataset.channels, current = key === 'simple' ? loop.via : key.split('.').reduce((o, k) => o?.[k], settings) ?? loop.levels[tab].via;
    const chosen = ['desk', 'phone'].filter((c) => includes(current, c) !== (c === b.dataset.channel));
    if (!chosen.length) return toast('Questions need somewhere to go: keep the lamp or the bubble lit.');
    save(key === 'simple' ? 'loop.via' : key, chosen.length === 2 ? 'both' : chosen[0]);
  })));
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.step, v = Number(b.dataset.value), value = key.endsWith('_times') || key === 'simple.times' ? v : `${v}m`;
    if (key.startsWith('simple.')) saveMany(included.map((l) => ({ key: `loop.levels.${l}.${key.endsWith('times') ? 'first_times' : 'first_after'}`, value })));
    else save(key, value);
  }));
  root.querySelector('[data-secondary]')?.addEventListener('click', (e) => {
    const key = (f) => `loop.levels.${tab}.${f}`;
    if (e.currentTarget.dataset.secondary === 'remove') save(key('second_times'), 0);
    else saveMany([{ key: key('second_after'), value: '15m' }, { key: key('second_via'), value: 'desk' }, { key: key('second_snooze'), value: '15m' }, { key: key('second_times'), value: 2 }]);
  });
  const area = root.querySelector('.area-ctl');
  if (area) {
    const button = area.querySelector('.sel'), menu = area.querySelector('.menu');
    const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) { const rect = menu.getBoundingClientRect(); menu.style.left = rect.right > innerWidth - 16 ? 'auto' : '0'; menu.style.right = rect.right > innerWidth - 16 ? '0' : 'auto'; } });
    menu.querySelectorAll('[data-area]').forEach((b) => b.addEventListener('click', () => { close(); save('loop.area', b.dataset.area); }));
    area.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); button.focus(); } });
    area.addEventListener('focusout', (e) => { if (!area.contains(e.relatedTarget)) close(); });
    root.querySelector('.simple-row').addEventListener('mouseleave', close);
  }
  const range = root.querySelector('.range'), from = range.querySelector('[data-hour="from"]'), until = range.querySelector('[data-hour="until"]');
  [from, until].forEach((input) => {
    input.addEventListener('input', () => {
      if (input === from && +from.value > +until.value - 1) from.value = Math.max(0, +until.value - 1);
      if (input === until && +until.value < +from.value + 1) until.value = Math.min(24, +from.value + 1);
      range.classList.remove('wraps'); range.style.setProperty('--start', `${+from.value / 24 * 100}%`); range.style.setProperty('--end', `${+until.value / 24 * 100}%`);
      from.setAttribute('aria-valuetext', clock(+from.value)); until.setAttribute('aria-valuetext', clock(+until.value));
      range.querySelector('[data-clock="from"]').textContent = clock(+from.value); range.querySelector('[data-clock="until"]').textContent = clock(+until.value);
      root.querySelector('.hours-caption').textContent = hoursCaption(+from.value, +until.value, schedule.days, !!loop.quiet);
    });
    input.addEventListener('change', () => { schedule = { from: hhmm(+until.value), to: hhmm(+from.value), days: schedule.days }; if (loop.quiet) save('loop.quiet', schedule); });
  });
}
