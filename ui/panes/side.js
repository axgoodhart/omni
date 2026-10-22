import { $, api, esc } from '../lib.js';
import { state, refresh } from '../app.js';

let editing = null;

export function renderSide() {
  const d = state.data; if (!d) return;
  const mode = d.modes.find((m) => m.name === state.mode);
  renderApprovals(d.pending);
  renderCartridges(d.cartridges, mode);
  renderModeFile(mode);
  $('#schedules').innerHTML = d.schedules.length ? d.schedules.map((s) => `<div class="skill"><b>${esc(s.name)}</b> <span class="muted">next ${s.next ? new Date(s.next).toLocaleString() : '–'}</span></div>`).join('') : '<div class="muted">No schedules. Add a <code>schedules:</code> list to a mode file.</div>';
  $('#skill-count').textContent = d.skills.length ? `${d.skills.length}` : '';
  $('#skills').innerHTML = d.skills.length ? d.skills.map((s) => `<div class="skill"><b>${esc(s.name)}</b> <span class="muted">${esc(s.description)}</span></div>`).join('') : '<div class="muted">Set SKILLS_PATH in .env to load SKILL.md folders.</div>';
}

function renderApprovals(pending) {
  $('#approval-count').textContent = pending.length || '';
  $('#approvals').innerHTML = pending.length ? pending.map((p) => `<div class="approval" data-id="${esc(p.approvalId)}"><div><b>${esc(p.toolName)}</b> <span class="muted">in ${esc(p.thread)}</span></div><div class="why">${esc(p.reason || 'needs your approval')}</div><pre>${esc(JSON.stringify(p.input, null, 2))}</pre><div class="row"><button data-ok="1">Allow</button><button class="danger" data-ok="0">Deny</button></div></div>`).join('') : '<div class="muted">Nothing waiting.</div>';
  $('#approvals').querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('.approval').dataset.id;
    await api(`/api/approvals/${encodeURIComponent(id)}`, { method: 'POST', body: { approved: b.dataset.ok === '1' } });
  }));
}

function renderCartridges(all, mode) {
  const inserted = new Set(mode?.inserted ?? []);
  $('#cartridges').innerHTML = all.map((c) => `<div class="cart ${inserted.has(c.name) ? 'in' : ''}" data-name="${esc(c.name)}"><div><span class="name">${esc(c.name)}</span><div class="files">${c.files.length ? c.files.map((f) => `<a data-f="${esc(f)}">${esc(f)}</a>`).join(' · ') : 'empty'}</div></div><span class="desc">${esc(c.description)}</span><button class="ghost">${inserted.has(c.name) ? 'Eject' : 'Insert'}</button></div>`).join('') || '<div class="muted">No cartridges yet.</div>';
  $('#cartridges').querySelectorAll('.cart > button').forEach((b) => b.addEventListener('click', async () => {
    const name = b.closest('.cart').dataset.name;
    const next = inserted.has(name) ? [...inserted].filter((n) => n !== name) : [...inserted, name];
    await api(`/api/threads/${encodeURIComponent(state.mode)}/cartridges`, { method: 'PUT', body: { cartridges: next } });
    await refresh();
  }));
  $('#cartridges').querySelectorAll('.files a').forEach((a) => a.addEventListener('click', async () => {
    const name = a.closest('.cart').dataset.name;
    const { content } = await api(`/api/cartridges/${encodeURIComponent(name)}/files/${a.dataset.f.split('/').map(encodeURIComponent).join('/')}`);
    let pre = a.closest('.cart').querySelector('pre');
    if (!pre) { pre = document.createElement('pre'); a.closest('.cart').after(pre); }
    pre.textContent = `${name}/${a.dataset.f}\n\n${content}`;
  }));
}

async function renderModeFile(mode) {
  if (!mode) return;
  $('#mode-file').textContent = `modes/${mode.file}`;
  if (editing === mode.name && document.activeElement === $('#mode-raw')) return;  // don't clobber while typing
  editing = mode.name;
  const { text } = await api(`/api/modes/${encodeURIComponent(mode.name)}/raw`);
  $('#mode-raw').value = text;
}

$('#save-mode').addEventListener('click', async () => {
  const s = $('#mode-save-status');
  try { await api(`/api/modes/${encodeURIComponent(state.mode)}/raw`, { method: 'PUT', body: { text: $('#mode-raw').value } }); s.textContent = 'saved, reloaded'; }
  catch (e) { s.textContent = e.message; }
  setTimeout(() => (s.textContent = ''), 3000);
});
$('#new-cartridge').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/cartridges', { method: 'POST', body: { name: $('#cart-name').value.trim(), description: $('#cart-desc').value.trim() } }); $('#cart-name').value = ''; $('#cart-desc').value = ''; await refresh(); }
  catch (err) { alert(err.message); }
});
