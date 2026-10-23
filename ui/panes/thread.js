import { $, api, esc } from '../lib.js';
import { state, loadThread } from '../app.js';

let streaming = null, buffer = '';

export function renderThread() {
  const box = $('#messages');
  const msgs = state.thread?.messages ?? [];
  renderBanner();
  box.innerHTML = msgs.length ? msgs.map(renderMessage).join('') : intro();
  box.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { const pre = c.nextElementSibling; if (pre) pre.hidden = !pre.hidden; }));
  if (streaming) box.appendChild(streaming);
  box.scrollTop = box.scrollHeight;
}

function intro() {
  const m = state.data?.modes.find((x) => x.name === state.mode);
  const mem = m?.inserted?.length ? m.inserted.join(', ') : 'none inserted';
  return `<div class="intro">
<b>This is the "${esc(state.mode)}" mode's conversation.</b> One ongoing thread: what you say here and what you text it over iMessage land in the same place.
<ul>
<li><b>Operation</b>, to the right, shows every step while it works: the prompt it was given, its reasoning, each tool it used, what was allowed or blocked, and what it cost.</li>
<li><b>Modes</b>, in the sidebar, are its personalities. Setup → prompt &amp; settings opens the one you are in; save and it reloads instantly.</li>
<li><b>Memory</b>, in the sidebar, is what it knows long-term, as cartridges you insert or eject. Right now: ${esc(mem)}.</li>
</ul>
Try: <i>"remember my coffee order is a flat white"</i>, then eject the cartridge and ask what your order is.
</div>`;
}

function renderBanner() {
  const pending = (state.data?.pending ?? []).filter((p) => p.thread === state.mode);
  const b = $('#banner');
  if (!pending.length) { b.innerHTML = ''; return; }
  const p = pending[0];
  b.innerHTML = `<div class="banner"><span>Paused: it wants to run <b>${esc(p.toolName)}</b>${p.reason ? ` — ${esc(p.reason)}` : ''}.</span><span class="spacer"></span><button data-ok="1">Allow</button><button class="danger" data-ok="0">Deny</button></div>`;
  b.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => api(`/api/approvals/${encodeURIComponent(p.approvalId)}`, { method: 'POST', body: { approved: btn.dataset.ok === '1' } })));
}

function renderMessage(m) {
  const texts = m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  const tools = m.parts.filter((p) => p.type !== 'text' && p.type !== 'reasoning');
  if (m.role === 'user') {
    const mm = /^(\[[^\]]+\])\n?([\s\S]*)$/.exec(texts);
    return `<div class="msg user">${mm ? `<span class="ctx">${esc(mm[1])}</span>${esc(mm[2])}` : esc(texts)}</div>`;
  }
  if (m.role === 'tool') return `<div class="msg tool">${tools.map(chip).join('')}</div>`;
  return `${tools.length ? `<div class="msg tool">${tools.map(chip).join('')}</div>` : ''}${texts ? `<div class="msg assistant">${esc(texts)}</div>` : ''}`;
}

function chip(p) {
  if (p.type === 'tool-call') return `<span class="chip call" title="click for details">used ${esc(p.toolName)}</span><pre hidden>${esc(JSON.stringify(p.input, null, 2))}</pre>`;
  if (p.type === 'tool-result') return `<span class="chip" title="click for details">${esc(p.toolName)} result</span><pre hidden>${esc(typeof p.output === 'string' ? p.output : JSON.stringify(p.output, null, 2))}</pre>`;
  if (p.type === 'approval') return `<span class="chip approval">you ${p.approved ? 'allowed' : 'denied'} it${p.reason ? `: ${esc(p.reason)}` : ''}</span>`;
  return `<span class="chip">${esc(p.type)}</span>`;
}

export function startStreaming() {
  if (streaming) return;
  buffer = '';
  streaming = document.createElement('div');
  streaming.className = 'msg assistant streaming';
  streaming.textContent = '…';
  $('#messages').appendChild(streaming);
}
export function onDelta(text) { if (!streaming) startStreaming(); buffer += text; streaming.textContent = buffer; $('#messages').scrollTop = $('#messages').scrollHeight; }
export function stopStreaming() { streaming?.remove(); streaming = null; buffer = ''; }

const form = $('#composer'), input = $('#input'), send = $('#send');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || !state.mode || state.busy) return;
  input.value = ''; state.busy = true; send.disabled = true;
  const box = $('#messages');
  if (box.querySelector('.intro')) box.innerHTML = '';
  const u = document.createElement('div'); u.className = 'msg user'; u.textContent = text; box.appendChild(u);
  startStreaming();
  try { await api(`/api/threads/${encodeURIComponent(state.mode)}/messages`, { method: 'POST', body: { text } }); }
  catch (err) { stopStreaming(); const d = document.createElement('div'); d.className = 'msg assistant'; d.textContent = `Error: ${err.message}`; box.appendChild(d); }
  finally { state.busy = false; send.disabled = false; stopStreaming(); await loadThread(); input.focus(); }
});
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
