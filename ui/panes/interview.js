import { $, api, esc } from '../lib.js';
import { state, refresh } from '../app.js';

let cur = null, dismissed = sessionStorage.getItem('omni.iv.later') === '1';

export function maybeShowInterview() { if (state.data?.desk?.interviewNeeded && !dismissed && $('#interview').hidden) showInterview(false); }
export async function showInterview(force) {
  if (force) { dismissed = false; sessionStorage.removeItem('omni.iv.later'); }
  cur = await api('/api/interview');
  if (cur.done && force) cur = await api('/api/interview/restart', { method: 'POST' });
  $('#interview').hidden = false;
  render();
}
function hide() { $('#interview').hidden = true; refresh(); }

function render() {
  const q = cur.question, box = $('#iv-field');
  $('#iv-eyebrow').textContent = q ? `Interview · ${q.surface} · ${cur.index + 1} of ${cur.total}` : 'Interview · done';
  $('#iv-skip').hidden = !(q && q.optional && q.kind !== 'statement');
  if (!q) {
    $('#iv-prompt').textContent = 'The station is set.';
    $('#iv-hint').textContent = 'Everything you said is a file under desk/. Change any of it there or on the desk.';
    box.innerHTML = `<button type="submit">open the desk</button>`;
    $('#iv-help').textContent = '';
    return;
  }
  $('#iv-prompt').textContent = q.prompt;
  $('#iv-hint').textContent = q.hint ?? '';
  if (q.kind === 'choice') {
    box.innerHTML = `<div class="iv-choices">${q.options.map((o) => `<button type="button" class="ghost" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>`;
    box.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.v)));
    $('#iv-help').textContent = 'choose one';
  } else if (q.kind === 'statement') {
    box.innerHTML = `<button type="submit">continue</button>`;
    $('#iv-help').textContent = 'enter to continue';
  } else {
    box.innerHTML = `<input class="iv-input" type="${q.kind === 'secret' ? 'password' : q.kind === 'time' ? 'time' : 'text'}" value="${esc(q.prefill ?? '')}" placeholder="${q.kind === 'secret' ? '••••••••' : q.optional ? 'enter, or skip' : 'enter'}" autocomplete="off" spellcheck="false">`;
    $('#iv-help').textContent = 'enter to continue';
    box.querySelector('input').focus();
  }
}
async function submit(value) {
  const q = cur.question;
  if (!q) return hide();
  const orb = $('#orb'); orb.classList.add('flash'); setTimeout(() => orb.classList.remove('flash'), 900);
  try { cur = await api('/api/interview/answer', { method: 'POST', body: { id: q.id, value } }); }
  catch (e) { $('#iv-hint').textContent = e.message; return; }
  $('.interview-layer').classList.add('swap'); setTimeout(() => { $('.interview-layer').classList.remove('swap'); render(); }, 350);
}
$('#iv-form').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#iv-field input'); submit(i ? i.value : ''); });
$('#iv-skip').addEventListener('click', () => submit(''));
$('#iv-later').addEventListener('click', () => { dismissed = true; sessionStorage.setItem('omni.iv.later', '1'); hide(); });
