import { $, api, esc } from '../lib.js';
import { state, loadThread } from '../app.js';

let streaming = null, buffer = '';

export function renderThread() {
  const box = $('#messages');
  const msgs = state.thread?.messages ?? [];
  box.innerHTML = msgs.map(renderMessage).join('') || '<div class="muted">No messages yet in this mode.</div>';
  box.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { const pre = c.nextElementSibling; if (pre) pre.hidden = !pre.hidden; }));
  if (streaming) box.appendChild(streaming);
  box.scrollTop = box.scrollHeight;
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
  if (p.type === 'tool-call') return `<span class="chip call">→ ${esc(p.toolName)}</span><pre hidden>${esc(JSON.stringify(p.input, null, 2))}</pre>`;
  if (p.type === 'tool-result') return `<span class="chip">← ${esc(p.toolName)}</span><pre hidden>${esc(typeof p.output === 'string' ? p.output : JSON.stringify(p.output, null, 2))}</pre>`;
  if (p.type === 'approval') return `<span class="chip approval">${p.approved ? 'approved' : 'denied'}${p.reason ? `: ${esc(p.reason)}` : ''}</span>`;
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
  const u = document.createElement('div'); u.className = 'msg user'; u.textContent = text; box.appendChild(u);
  startStreaming();
  try { await api(`/api/threads/${encodeURIComponent(state.mode)}/messages`, { method: 'POST', body: { text } }); }
  catch (err) { stopStreaming(); const d = document.createElement('div'); d.className = 'msg assistant'; d.textContent = `Error: ${err.message}`; box.appendChild(d); }
  finally { state.busy = false; send.disabled = false; stopStreaming(); await loadThread(); input.focus(); }
});
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
