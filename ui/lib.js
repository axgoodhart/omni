export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n ?? 0));
export const api = async (path, opts = {}) => {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
};
export const ic = (name, cls = '') => `<span class="ms${cls ? ` ${cls}` : ''}" aria-hidden="true">${name}</span>`;
export const ibtn = (icon, tip, attrs = '', cls = '') => `<button type="button" class="icon-btn${cls ? ` ${cls}` : ''}" data-tip="${esc(tip)}" aria-label="${esc(tip)}" ${attrs}>${ic(icon)}</button>`;
export const head = (icon, title, tip, actions = '') => `<h2 class="panel-head"><span class="ph" tabindex="0" data-tip="${esc(tip)}">${ic(icon)}<span>${esc(title)}</span></span>${actions}</h2>`;
// ---- progress: a slider with the word for where it stands riding above the thumb
export const progressWord = (p) => (p <= 0 ? 'start' : p >= 100 ? 'done' : `${p}%`);
export const progressHTML = (v, attrs = '') => `<span class="progress" style="--p:${v}" ${attrs}><i class="word">${progressWord(v)}</i><input type="range" min="0" max="100" step="5" value="${v}" aria-label="Progress"></span>`;
export const wireProgress = (root, onSave) => root.querySelectorAll('.progress').forEach((el) => {
  const inp = el.querySelector('input'), w = el.querySelector('.word');
  inp.addEventListener('input', () => { el.style.setProperty('--p', inp.value); w.textContent = progressWord(+inp.value); });
  inp.addEventListener('change', () => onSave(el, Number(inp.value)));
});
