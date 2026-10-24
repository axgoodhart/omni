import { $, api, esc, ic } from '../lib.js';
import { state, loadThread } from '../app.js';
import { describeCall, describeResult, askCard, wireAsks, place } from '../describe.js';

let streaming = null, buffer = '';

export function renderThread() {
  const box = $('#messages');
  const msgs = state.thread?.messages ?? [];
  renderBanner();
  const parts = msgs.flatMap((m) => m.parts ?? []);
  seen = {
    result: new Map(parts.filter((p) => p.type === 'tool-result').map((p) => [p.toolCallId, p])),
    asked: new Map(parts.filter((p) => p.type === 'ask' && !p.automatic).map((p) => [p.toolCallId, p.approvalId])),
    answer: new Map(parts.filter((p) => p.type === 'approval').map((p) => [p.approvalId, p])),
  };
  box.innerHTML = msgs.length ? msgs.map(renderMessage).join('') : intro();
  box.querySelectorAll('.step-line').forEach((b) => b.addEventListener('click', () => { const pre = b.nextElementSibling; pre.hidden = !pre.hidden; }));
  if (streaming) box.appendChild(streaming);
  box.scrollTop = box.scrollHeight;
}
let seen = { result: new Map(), asked: new Map(), answer: new Map() };

function intro() {
  const m = state.data?.modes.find((x) => x.name === state.mode);
  const mem = m?.inserted?.length ? m.inserted.join(', ') : 'none inserted';
  return `<div class="empty-visual tall" tabindex="0" data-tip="Nothing said yet in the ${esc(state.mode)} mode. What you type here and what you text over iMessage land in the same thread. Memory right now: ${esc(mem)}.">${ic('chat_bubble', 'zero')}<span class="empty-line"></span>${ic('smart_toy')}</div>`;
}

function renderBanner() {
  const pending = (state.data?.pending ?? []).filter((p) => p.thread === state.mode);
  const b = $('#banner');
  if (!pending.length) { b.innerHTML = ''; return; }
  b.innerHTML = askCard(pending[0]);
  wireAsks(b);
}

function renderMessage(m) {
  const texts = m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  if (m.role === 'user') {
    const mm = /^(\[[^\]]+\])\n?([\s\S]*)$/.exec(texts);
    const disc = /About this check-in: "(.*?)"\. The user chose "(.*?)"/s.exec(mm ? mm[2] : texts), file = /\nThe file is at (.+?)\. It/.exec(texts)?.[1];
    if (disc) return `<div class="msg note">From a check-in: you chose ${esc(disc[2])} on “${esc(disc[1].replace(/[:.\s]+$/, ''))}”.${file ? ` Omnii handed the assistant the file, ${esc(place(file))}.` : ''}</div>`;
    return `<div class="msg user">${mm ? `<span class="ctx">${esc(mm[1])}</span>${esc(mm[2])}` : esc(texts)}</div>`;
  }
  if (m.role === 'tool') return ''; // results and answers are shown with the step they belong to
  const calls = m.parts.filter((p) => p.type === 'tool-call');
  return `${calls.length ? `<div class="steps">${calls.map(step).join('')}</div>` : ''}${texts ? `<div class="msg assistant">${esc(texts)}</div>` : ''}`;
}

/** One line per step: what it did, how it went, and whether it asked you. */
function step(c) {
  const r = seen.result.get(c.toolCallId), id = seen.asked.get(c.toolCallId), a = id ? seen.answer.get(id) : null;
  const asked = id ? (a ? (a.approved ? 'you allowed it' : 'you said no') : 'request open') : '';
  const out = r && !(a && !a.approved) ? describeResult(c.toolName, c.input, r.output) : '';
  return `<div class="step"><button type="button" class="step-line">${esc(describeCall(c.toolName, c.input))}${out ? ` — ${esc(out)}` : ''}${asked ? `<span class="asked">${asked}</span>` : ''}</button><pre hidden>${esc(JSON.stringify({ asked: c.input, got: r?.output ?? null }, null, 2))}</pre></div>`;
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
