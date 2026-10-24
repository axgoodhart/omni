import { $, api, esc, ic } from '../lib.js';
import { state, refresh, currentMode, deskSoon } from '../app.js';
import { checkinHTML } from './desk.js';

const TITLES = { approvals: 'Needs you', mode: 'This mode', memory: 'Memory', more: 'Skills, schedules, channels', desk: 'Desk files', out: 'Out' };
const ICONS = { approvals: 'notifications', mode: 'edit', memory: 'memory', more: 'more_horiz', desk: 'description', out: 'upload' };
const HELP = {
  approvals: 'Two kinds of thing wait here. Check-ins from the loop: one sentence, fixed options, answerable with a letter here or over iMessage. Approvals when an agent is about to do something risky: allow or deny. Ignoring either is allowed; priorities decide what happens next.',
  mode: 'A mode is a personality for the agent. Everything here is one file under modes/; change it here or in any editor and it reloads on save.',
  memory: "Cartridges are the agent's long-term memory: folders of notes in cartridges/. Inserted ones it can read and write right now; ejected ones stay on disk but are invisible to it. Each mode keeps its own set.",
  more: 'How you reach it, timed runs, and the instruction folders it may read.',
  desk: 'Everything the loop reads lives in desk/ as plain files. Edit here or in any editor; it reloads on save. Priorities and trust are yours alone: the loop never writes them.',
  out: 'Nothing here was sent. In sandbox, the file is the whole act.',
};
let tab = null;
let formFor = null; // mode the editor currently shows

export function openDrawer(name) {
  tab = name;
  $('#drawer').hidden = false;
  $('#drawer-title').innerHTML = `<span class="ph" tabindex="0" data-tip="${esc(HELP[name] ?? '')}">${ic(ICONS[name] ?? 'info')}<span>${esc(TITLES[name] ?? name)}</span></span>`;
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== `tab-${name}`; });
  if (name === 'mode' && formFor !== state.mode) renderModeTab();
  if (name === 'desk') renderDeskFiles();
}
export function showDeskFile(file) { openDrawer('desk'); renderDeskFiles(file); }
export async function showOut(domain, name) {
  openDrawer('out');
  const box = $('#tab-out');
  box.innerHTML = `<div class="muted" data-tip="Written here instead of being sent. Read it, then do with it what you like.">out/${esc(domain)}/${esc(name)}</div><pre class="tall">loading…</pre>`;
  try { const { content } = await api(`/api/out/${encodeURIComponent(domain)}/${encodeURIComponent(name)}`); box.querySelector('pre').textContent = content; }
  catch (e) { box.querySelector('pre').textContent = e.message; }
}
let deskFile = 'priorities.md';
async function renderDeskFiles(file) {
  if (file) deskFile = file;
  const box = $('#tab-desk');
  let files = [], text = '';
  try { ({ files } = await api('/api/desk/files')); if (!files.includes(deskFile)) deskFile = files[0] ?? deskFile; ({ text } = await api(`/api/desk/files/${deskFile.split('/').map(encodeURIComponent).join('/')}`)); }
  catch (e) { box.innerHTML = `<div class="muted">${esc(e.message)}</div>`; return; }
  box.innerHTML = `<div class="row">${files.map((f) => `<button class="${f === deskFile ? '' : 'ghost'} tiny" data-f="${esc(f)}">${esc(f.replace(/\.md$/, ''))}</button>`).join('')}</div>
<textarea id="desk-raw" class="code" rows="22" spellcheck="false">${esc(text)}</textarea>
<div class="row"><button id="desk-save">Save</button><span id="desk-status" class="muted"></span></div>`;
  box.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => renderDeskFiles(b.dataset.f)));
  $('#desk-save').addEventListener('click', async () => {
    try { await api(`/api/desk/files/${deskFile.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: { text: $('#desk-raw').value } }); $('#desk-status').textContent = 'saved'; deskSoon(); }
    catch (e) { $('#desk-status').textContent = e.message; }
  });
}
export function closeDrawer() { tab = null; $('#drawer').hidden = true; }
$('#drawer-close').addEventListener('click', closeDrawer);

export function renderSide() {
  const d = state.data; if (!d) return;
  renderApprovals(d.pending);
  renderMemory(d.cartridges, currentMode());
  renderMore(d);
  if (tab === 'mode' && formFor !== state.mode) renderModeTab();
}

function renderApprovals(pending) {
  const badge = $('#approval-count'); if (badge) badge.textContent = pending.length || '';
  const live = state.desk?.checkins?.live ?? [];
  $('#tab-approvals').innerHTML = (live.map(checkinHTML).join('') || '<div class="muted">No check-ins open.</div>') +
    `<h3 data-tip="An agent is about to do something risky and wants your yes or no first.">Approvals</h3>` +
    (pending.length ? pending.map((p) => `<div class="approval" data-id="${esc(p.approvalId)}"><div><b>${esc(p.toolName)}</b> <span class="muted">in ${esc(p.thread)}</span></div><div class="why">${esc(p.reason || 'needs your approval')}</div><pre>${esc(JSON.stringify(p.input, null, 2))}</pre><div class="row"><button data-ok="1">Allow</button><button class="danger" data-ok="0">Deny</button></div></div>`).join('') : '<div class="muted">Nothing is waiting.</div>');
  $('#tab-approvals').querySelectorAll('.approval button').forEach((b) => b.addEventListener('click', () => api(`/api/approvals/${encodeURIComponent(b.closest('.approval').dataset.id)}`, { method: 'POST', body: { approved: b.dataset.ok === '1' } })));
  $('#tab-approvals').querySelectorAll('.checkin button').forEach((b) => b.addEventListener('click', async () => {
    const box = b.closest('.checkin');
    try { const { reply } = await api(`/api/checkins/${box.dataset.id}/answer`, { method: 'POST', body: { option: b.dataset.k } }); box.innerHTML = `<div class="ci-title muted-text">${esc(reply)}</div>`; } catch (e) { alert(e.message); }
    deskSoon();
  }));
}

function renderMemory(all, mode) {
  const inserted = new Set(mode?.inserted ?? []);
  const box = $('#tab-memory');
  box.innerHTML = (all.map((c) => `<div class="cart ${inserted.has(c.name) ? 'in' : ''}" data-name="${esc(c.name)}">
      <div><span class="name">${esc(c.name)}</span> <span class="state">${inserted.has(c.name) ? 'inserted' : 'on the shelf'} · ${c.files.length} note${c.files.length === 1 ? '' : 's'}</span></div>
      <button class="${inserted.has(c.name) ? 'ghost' : ''}">${inserted.has(c.name) ? 'Eject' : 'Insert'}</button>
      <div class="desc">${esc(c.description)}</div>
      <div class="files">${c.files.length ? c.files.map((f) => `<a data-f="${esc(f)}">${esc(f)}</a>`).join(' · ') : 'no notes yet'}</div>
    </div>`).join('') || '<div class="muted">No cartridges yet.</div>') +
    `<h3>New cartridge</h3><form id="new-cartridge" class="row"><input id="cart-name" placeholder="name, e.g. work" required><input id="cart-desc" placeholder="what goes in it"><button>Create</button></form>`;
  box.querySelectorAll('.cart > button').forEach((b) => b.addEventListener('click', async () => {
    const name = b.closest('.cart').dataset.name;
    const next = inserted.has(name) ? [...inserted].filter((n) => n !== name) : [...inserted, name];
    await api(`/api/threads/${encodeURIComponent(state.mode)}/cartridges`, { method: 'PUT', body: { cartridges: next } });
    await refresh();
  }));
  box.querySelectorAll('.files a').forEach((a) => a.addEventListener('click', async () => {
    const name = a.closest('.cart').dataset.name;
    const { content } = await api(`/api/cartridges/${encodeURIComponent(name)}/files/${a.dataset.f.split('/').map(encodeURIComponent).join('/')}`);
    let pre = a.closest('.cart').querySelector('pre');
    if (!pre) { pre = document.createElement('pre'); pre.style.gridColumn = '1 / -1'; a.closest('.cart').appendChild(pre); }
    pre.textContent = `${name}/${a.dataset.f}\n\n${content}`;
  }));
  box.querySelector('#new-cartridge').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/cartridges', { method: 'POST', body: { name: $('#cart-name').value.trim(), description: $('#cart-desc').value.trim() } }); await refresh(); }
    catch (err) { alert(err.message); }
  });
}

const MODELS = ['openai/gpt-6.1-sol', 'openai/gpt-6-astra', 'openai/gpt-6-luna', 'anthropic/claude-opus-5-5', 'anthropic/claude-sonnet-5-5', 'anthropic/claude-haiku-5-5', 'google/gemini-3.5-flash', 'ollama/llama3.3'];
const PERMS = [
  ['ask-always', 'asks you before every write or command'],
  ['ask-destructive', 'asks only before destructive things: deleting, overwriting, risky commands, texting others'],
  ['no-asking', 'never asks; blacklisted paths and file types are still blocked'],
];

async function renderModeTab() {
  const name = state.mode; if (!name) return;
  formFor = name;
  const box = $('#tab-mode');
  let data, body, raw;
  try { ({ data, body } = await api(`/api/modes/${encodeURIComponent(name)}`)); ({ text: raw } = await api(`/api/modes/${encodeURIComponent(name)}/raw`)); }
  catch (e) { box.innerHTML = `<div class="muted">${esc(e.message)}</div>`; return; }
  const tools = state.data.tools, p = data.permissions ?? {}, bl = p.blacklist ?? {};
  const check = (id, items, on, info) => `<div class="checks" id="${id}">${items.map((t) => `<label><input type="checkbox" value="${esc(t)}" ${on(t) ? 'checked' : ''}><code>${esc(t)}</code><span>${esc(info(t))}</span></label>`).join('')}</div>`;
  const skillsSel = data.skills === 'all' ? 'all' : Array.isArray(data.skills) ? 'chosen' : 'none';

  box.innerHTML = `<div class="form">
<label class="f" data-tip="Who it is and how it should behave in this mode"><b>Prompt</b></label><textarea id="f-body" rows="12">${esc(body)}</textarea>
<label class="f" data-tip="One line about tone"><b>Voice</b></label><input id="f-voice" type="text" value="${esc(data.voice ?? '')}" placeholder="Warm, direct, no filler.">
<label class="f" data-tip="provider/model. Change the provider by changing this line."><b>Model</b></label><input id="f-model" type="text" list="model-ids" value="${esc(data.model ?? '')}" placeholder="blank = the daemon's default (${esc(currentMode()?.model ?? '')})"><datalist id="model-ids">${MODELS.map((m) => `<option value="${m}">`).join('')}</datalist>
<label class="f" data-tip="How long the model reasons before answering (OpenAI)"><b>Thinking effort</b></label><select id="f-effort">${['', 'none', 'low', 'medium', 'high', 'xhigh', 'max'].map((v) => `<option value="${v}" ${(data.effort ?? '') === v ? 'selected' : ''}>${v || 'model default'}</option>`).join('')}</select>
<label class="f" data-tip="When it has to ask you first"><b>Permissions</b></label><select id="f-perm">${PERMS.map(([v, h]) => `<option value="${v}" ${(p.mode ?? 'ask-destructive') === v ? 'selected' : ''}>${v} — ${h}</option>`).join('')}</select>
<label class="f" data-tip="Paths and file types it may not read or change, comma-separated"><b>Never touch</b></label><div class="row"><input id="f-paths" type="text" value="${esc((bl.paths ?? []).join(', '))}" placeholder="~/.ssh, .env"><input id="f-types" type="text" value="${esc((bl.filetypes ?? []).join(', '))}" placeholder=".pem, .key"></div>
<label class="f" data-tip="What it is allowed to do"><b>Tools</b></label>
<label class="muted"><input type="checkbox" id="f-default-tools" ${data.tools ? '' : 'checked'}> use the default set</label>
${check('f-tools', Object.keys(tools.info), (t) => data.tools ? data.tools.includes(t) : tools.defaults.includes(t), (t) => tools.info[t])}
<label class="f" data-tip="Inserted automatically when this mode starts"><b>Memory cartridges</b></label>
${check('f-carts', state.data.cartridges.map((c) => c.name), (c) => (data.cartridges ?? []).includes(c), (c) => state.data.cartridges.find((x) => x.name === c)?.description ?? '')}
<label class="f" data-tip="Instruction folders it may read when a task matches (${state.data.skills.length} loaded)"><b>Skills</b></label>
<div class="row"><select id="f-skills"><option value="none" ${skillsSel === 'none' ? 'selected' : ''}>none</option><option value="all" ${skillsSel === 'all' ? 'selected' : ''}>all of them</option><option value="chosen" ${skillsSel === 'chosen' ? 'selected' : ''}>only these:</option></select><input id="f-skill-list" type="text" value="${esc(Array.isArray(data.skills) ? data.skills.join(', ') : '')}" placeholder="day-planner, prioritizer"></div>
<label class="f" data-tip="How many tool calls it may chain before it must answer"><b>Max steps per reply</b></label><input id="f-steps" type="number" min="1" max="60" value="${esc(data.maxSteps ?? 12)}">
<div class="row"><button id="f-save">Save</button><button id="f-reload" class="ghost" data-tip="Reload from disk">Reload</button><span id="f-status" class="muted"></span></div>
<details><summary>Edit the file directly (YAML settings + prompt)</summary><textarea id="f-raw" class="code" rows="18" spellcheck="false">${esc(raw)}</textarea><div class="row"><button id="f-save-raw" class="ghost">Save file</button></div></details>
</div>`;

  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const checked = (id) => [...box.querySelectorAll(`#${id} input:checked`)].map((i) => i.value);
  const toggleTools = () => box.querySelectorAll('#f-tools input').forEach((i) => { i.disabled = $('#f-default-tools').checked; });
  $('#f-default-tools').addEventListener('change', toggleTools); toggleTools();
  const status = (t) => { $('#f-status').textContent = t; setTimeout(() => { if ($('#f-status')) $('#f-status').textContent = ''; }, 3000); };

  $('#f-save').addEventListener('click', async () => {
    const sk = $('#f-skills').value;
    const next = { ...data,
      voice: $('#f-voice').value.trim() || undefined,
      model: $('#f-model').value.trim() || undefined,
      effort: $('#f-effort').value || undefined,
      permissions: { mode: $('#f-perm').value, blacklist: { paths: list($('#f-paths').value), filetypes: list($('#f-types').value) }, overrides: p.overrides ?? {} },
      tools: $('#f-default-tools').checked ? undefined : checked('f-tools'),
      cartridges: checked('f-carts'),
      skills: sk === 'chosen' ? list($('#f-skill-list').value) : sk,
      maxSteps: Number($('#f-steps').value) || 12,
    };
    try { await api(`/api/modes/${encodeURIComponent(name)}`, { method: 'PUT', body: { data: next, body: $('#f-body').value } }); status('saved and reloaded'); formFor = null; await refresh(); }
    catch (e) { status(e.message); }
  });
  $('#f-reload').addEventListener('click', () => { formFor = null; renderModeTab(); });
  $('#f-save-raw').addEventListener('click', async () => {
    try { await api(`/api/modes/${encodeURIComponent(name)}/raw`, { method: 'PUT', body: { text: $('#f-raw').value } }); formFor = null; await refresh(); }
    catch (e) { status(e.message); }
  });
}

function renderMore(d) {
  const m = currentMode();
  const uses = m ? (m.skills === 'all' ? 'all of them' : Array.isArray(m.skills) && m.skills.length ? m.skills.join(', ') : 'none') : '';
  $('#tab-more').innerHTML = `
<h3 data-tip="Where you can reach it. The web app is this page.">Channels</h3>
<div class="skill">${ic('chat_bubble')} <b>iMessage</b> <span class="muted">${d.imessage ? 'on' : 'off'}</span> <span class="muted" data-tip="${d.imessage ? 'Text the agent\'s handle from your phone' : 'Put your phone number or email in ALLOWED_HANDLES in .env and restart'}">${ic('info')}</span></div>
<h3 data-tip="Modes can run on a timer, like the morning brief. Add a schedules: list to a mode file.">Scheduled runs</h3>
${d.schedules.length ? d.schedules.map((s) => `<div class="skill"><b>${esc(s.name)}</b> <span class="muted">next ${s.next ? new Date(s.next).toLocaleString() : '–'}</span></div>`).join('') : '<div class="muted">None loaded.</div>'}
<h3 data-tip="Instruction folders (SKILL.md) the agent can read when a task matches. Loaded from SKILLS_PATH.">Skills <span class="muted">${d.skills.length} loaded · this mode uses ${esc(uses)}</span></h3>
${d.skills.length ? d.skills.map((s) => `<div class="skill"><b>${esc(s.name)}</b> <span class="muted">${esc(s.description)}</span></div>`).join('') : '<div class="muted">Set SKILLS_PATH in .env to load some.</div>'}
<details><summary>Where things live</summary>
<p class="help"><code>desk/</code> the station: profile, islands, priorities, trust, watches, observations · <code>out/</code> everything that would have left, as files · <code>modes/</code> personalities, including the fixed-task ones (triage, carrier, drafter) · <code>cartridges/</code> memory · <code>workspace/</code> the only folder shell tools may touch · <code>data/agent.sqlite</code> conversations, check-ins, mail index and the event log · <code>data/logbook/</code> medicine and chores, one line each</p></details>`;
}
