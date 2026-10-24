import { $, esc, fmt } from '../lib.js';
import { state } from '../app.js';
import { describeCall, describeResult, askSentence } from '../describe.js';

/** History: every recorded event, grouped into one card per activity (a conversation, a look, an answer, a change). A card opens to its steps in plain words; a step opens to its raw record. Nothing is left out: "every record" lists them all. */

// ==== FACETS ====
const FACETS = [
  ['all', 'All', 'Everything except system housekeeping'],
  ['talk', 'Conversations', 'What you asked a mode, and what it did about it'],
  ['looks', 'Looks', 'Each time Omnii looked at your plate and decided something'],
  ['checkins', 'Check-ins', 'Questions Omnii asked, and how you answered'],
  ['access', 'Permissions', 'What Omnii asked to do, and what you said'],
  ['changes', 'Changes', 'Settings and desk files that changed'],
  ['problems', 'Problems', 'Anything that failed'],
  ['system', 'System', 'Startup, reloads and connections'],
];
const SYSTEM = ['daemon.started', 'daemon.listening', 'daemon.stopping', 'imessage.watch', 'imessage.watch.exit', 'imessage.stderr', 'imessage.disabled', 'imessage.sent', 'imessage.ignored', 'schedule.loaded', 'mode.reloaded', 'loop.started', 'desk.reloaded', 'cartridges.changed'];
const PROBLEM = ['error', 'server.error', 'tool.error', 'loop.error', 'mode.error', 'schedule.error', 'imessage.error', 'watch.mail_error', 'checkin.send_error', 'checkin.handoff_error', 'budget.refused'];
const STATUS = { checkins: 'Check-ins', activity: 'Running', quiet: 'Texting', medicine: 'Medicine', apartment: 'Apartment', export: 'Finished-work folder', mail: 'Email', islands: 'Plate' };

let facet = localStorage.getItem('omni.facet') || 'all';
const opened = new Set();
const short = (s, n = 110) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (ts) => { const d = new Date(ts), t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1); return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }); };
const clean = (t) => String(t ?? '').replace(/[:.\s]+$/, '');

// ---- grouping: events recorded with an activity id share a card; older ones are grouped by their shape
function group(events) {
  const by = new Map(), add = (k, e) => (by.get(k) ?? by.set(k, []).get(k)).push(e);
  const runs = new Map(), ticks = events.filter((e) => e.type === 'loop.tick' && !e.activity);
  for (const e of events) {
    if (e.activity) { add(e.activity, e); continue; }
    if (e.thread && e.thread !== 'loop') {
      if (e.type === 'inbound') runs.set(e.thread, `run:${e.id}`);
      const k = runs.get(e.thread);
      if (k) { add(k, e); if (e.type === 'outbound') runs.delete(e.thread); continue; }
    }
    const t = e.thread === 'loop' && e.type !== 'loop.tick' && !e.type.startsWith('settings') && ticks.find((x) => x.id > e.id && e.ts >= (x.data?.at ?? x.ts));
    add(t ? `tick:${t.id}` : e.type === 'loop.tick' ? `tick:${e.id}` : `ev:${e.id}`, e);
  }
  return [...by.entries()].map(([key, evs]) => card(key, evs)).filter(Boolean).sort((a, b) => a.ts - b.ts);
}

function card(key, evs) {
  const has = (t) => evs.find((e) => e.type === t), problem = evs.some((e) => PROBLEM.includes(e.type));
  const tick = has('loop.tick'), inbound = evs.find((e) => e.type === 'inbound' && e.thread !== 'loop'), answered = has('checkin.answered');
  const facets = new Set(problem ? ['problems'] : []);
  let c;
  if (inbound) {
    facets.add('talk'); if (has('approval.requested')) facets.add('access');
    c = talk(evs, inbound);
  } else if (tick) {
    if (tick.data?.paused) return null;
    facets.add('looks'); if (evs.some((e) => e.type.startsWith('checkin.'))) facets.add('checkins');
    c = look(tick);
  } else if (answered) {
    facets.add('checkins');
    const d = answered.data;
    c = { title: `You answered “${short(clean(d.title), 70)}”: ${d.label}${d.via === 'imessage' ? ' (by text)' : ''}`, steps: evs.filter((e) => e !== answered).map((e) => line(summary(e), [e])) };
  } else {
    const e = evs[0];
    facets.add(SYSTEM.includes(e.type) ? 'system' : e.type.startsWith('checkin.') ? 'checkins' : e.type.startsWith('approval.') || e.type.startsWith('allowed.') || e.type === 'policy.decision' ? 'access' : e.type.startsWith('settings') || e.type.startsWith('watch.') || e.type === 'logbook' || e.type === 'observation' || e.type.startsWith('interview') ? 'changes' : problem ? 'problems' : 'system');
    c = { title: short(summary(e), 140), steps: evs.length > 1 ? evs.slice(1).map((x) => line(summary(x), [x])) : [] };
  }
  return { key, evs, facets, problem, ts: evs[0].ts, ...c };
}
const line = (text, raw, cls = '') => ({ text, raw, cls });

function talk(evs, inbound) {
  const d = inbound.data, mode = inbound.thread;
  const disc = /^About this check-in: "(.*)"\. The user chose "(.*)"/s.exec(d.text ?? '');
  const title = disc ? `You chose ${disc[2]} on “${short(clean(disc[1]), 60)}”` : d.channel === 'schedule' ? `Scheduled ${mode}: ${short(d.text, 80)}` : `You asked the ${mode}${d.channel === 'imessage' ? ' by text' : ''}: “${short(d.text, 90)}”`;
  const results = new Map(evs.filter((e) => e.type === 'tool.result').map((e) => [e.data.toolCallId, e]));
  const steps = []; let tokens = 0, calls = 0, asked = 0;
  for (const e of evs) {
    const x = e.data || {};
    if (e.type === 'tool.call') { const r = results.get(x.toolCallId), out = r ? describeResult(x.toolName, x.input, r.data.output) : ''; steps.push(line(`${describeCall(x.toolName, x.input)}${out ? ` — ${out}` : ''}`, r ? [e, r] : [e])); }
    else if (e.type === 'approval.requested') { asked++; steps.push(line(`Asked you first. ${askSentence(x.toolName, x.input)}`, [e], 'ask')); }
    else if (e.type === 'approval.resolved') steps.push(line(x.always ? `You allowed it, and said Omnii may always ${x.always}` : x.approved ? 'You allowed it' : `You said no${x.reason && !/denied in web app/.test(x.reason) ? `: ${x.reason}` : ''}`, [e], 'ask'));
    else if (e.type === 'reasoning') steps.push(line(`Thought: ${short(x.text.replace(/\*\*/g, ''), 180)}`, [e], 'quiet'));
    else if (PROBLEM.includes(e.type)) steps.push(line(`Problem: ${x.error || x.message || summary(e)}`, [e], 'problem'));
    else if (['memory.write', 'out.written', 'compaction', 'budget.downgraded'].includes(e.type)) steps.push(line(summary(e), [e]));
    else if (e.type === 'usage') { tokens += x.usage?.totalTokens ?? 0; calls++; }
  }
  const out = evs.findLast((e) => e.type === 'outbound');
  if (calls) steps.push(line(`${calls} model call${calls === 1 ? '' : 's'}, ${fmt(tokens)} tokens`, evs.filter((e) => ['prompt.assembled', 'model.request', 'usage'].includes(e.type)), 'quiet'));
  const n = steps.filter((s) => s.cls !== 'quiet').length;
  return { title, outcome: out ? `Replied: “${short(out.data.text, 160)}”` : 'Still working…', meta: [n ? `${n} step${n === 1 ? '' : 's'}` : '', asked ? `asked you ${asked === 1 ? 'once' : `${asked} times`}` : ''].filter(Boolean).join(' · '), steps };
}

function look(tick) {
  const d = tick.data, dec = d.decisions ?? [], w = d.waiting ?? [], left = d.inaction ?? [];
  const title = `Looked${d.why && d.why !== 'cron' ? ` (${d.why})` : ''}: ${dec.length ? `${dec.length} thing${dec.length === 1 ? '' : 's'} done` : 'nothing to do'}${w.length ? `, ${w.length} waiting on you` : ''}`;
  return {
    title, outcome: dec.length ? short(dec.join(' · '), 160) : '',
    steps: [
      ...dec.map((x) => line(x, [tick])),
      ...w.map((x) => line(`Waiting on you: ${clean(x.what)} (asked ${hm(x.since)}). Next: ${x.next}`, [tick], 'ask')),
      ...left.map((x) => line(`Left alone: ${x.what}, because ${x.why}`, [tick], 'quiet')),
      ...Object.entries(d.status ?? {}).filter(([, v]) => v).map(([k, v]) => line(`${STATUS[k] ?? k}: ${v}`, [tick], 'quiet')),
    ],
  };
}

// ---- rendering
export function renderEvents() {
  const cards = group(state.events), shown = cards.filter((c) => (facet === 'all' ? !(c.facets.size === 1 && c.facets.has('system')) : c.facets.has(facet)));
  const count = (f) => (f === 'all' ? cards.filter((c) => !(c.facets.size === 1 && c.facets.has('system'))).length : cards.filter((c) => c.facets.has(f)).length);
  $('#filters').innerHTML = FACETS.map(([f, label, tip]) => `<button type="button" class="facet${f === facet ? ' on' : ''}${f === 'problems' && count(f) ? ' alert' : ''}" data-f="${f}" data-tip="${esc(tip)}">${label} <span class="n">${count(f)}</span></button>`).join('');
  $('#filters').querySelectorAll('.facet').forEach((b) => b.addEventListener('click', () => { facet = b.dataset.f; localStorage.setItem('omni.facet', facet); renderEvents(); }));
  $('#counter').textContent = `${shown.length} of ${cards.length}`;
  const box = $('#events'), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  let lastDay = '';
  box.innerHTML = shown.map((c) => { const dd = day(c.ts), sep = dd !== lastDay ? `<h3 class="act-day">${dd}</h3>` : ''; lastDay = dd; return sep + cardHTML(c); }).join('')
    || '<p class="act-empty">Nothing here yet.</p>';
  wire(box);
  if (atBottom) box.scrollTop = box.scrollHeight;
}

const cardHTML = (c) => `<article class="act${c.problem ? ' problem' : ''}${opened.has(c.key) ? ' open' : ''}" data-key="${esc(c.key)}">
  <button type="button" class="act-head"><time>${hm(c.ts)}</time><span class="act-title">${esc(c.title)}</span>${c.meta ? `<span class="act-meta">${esc(c.meta)}</span>` : ''}</button>
  ${c.outcome ? `<p class="act-out">${esc(c.outcome)}</p>` : ''}
  <div class="act-body">
    ${c.steps.length ? `<ol class="act-steps">${c.steps.map((s) => `<li class="${s.cls}"><button type="button" class="st">${esc(s.text)}</button><pre hidden>${esc(s.raw.map((e) => JSON.stringify(e.data, null, 2)).join('\n\n'))}</pre></li>`).join('')}</ol>` : ''}
    <details class="act-all"><summary>Every record (${c.evs.length})</summary>${c.evs.map((e) => `<div class="rec"><time>${new Date(e.ts).toLocaleTimeString([], { hour12: false })}</time><button type="button" class="st">${esc(short(summary(e), 200))}</button><pre hidden>${esc(JSON.stringify(e.data, null, 2))}</pre></div>`).join('')}</details>
  </div>
</article>`;

function wire(root) {
  root.querySelectorAll('.act-head').forEach((h) => h.addEventListener('click', () => { const a = h.closest('.act'); a.classList.toggle('open'); a.classList.contains('open') ? opened.add(a.dataset.key) : opened.delete(a.dataset.key); }));
  root.querySelectorAll('.st').forEach((b) => b.addEventListener('click', () => { const pre = b.nextElementSibling; pre.hidden = !pre.hidden; }));
}

let pending = null;
export function pushEvent(e) {
  clearTimeout(pending); pending = setTimeout(renderEvents, 200);
  if (e.type === 'outbound' || e.type === 'error') $('#live').textContent = '';
}
let liveKind = '';
export function pushLive(e) {
  const live = $('#live');
  const kind = e.type === 'reasoning.delta' ? 'thinking' : e.type === 'text.delta' ? 'writing' : e.type === 'tool.input.start' ? `calling ${e.data.toolName}` : '';
  if (kind !== liveKind) { liveKind = kind; live.textContent = `${kind}: `; }
  if (e.type === 'reasoning.delta' || e.type === 'text.delta') live.textContent += e.data.text;
  live.scrollTop = live.scrollHeight;
}

const j = (v, n = 160) => { const s = typeof v === 'string' ? v : JSON.stringify(v) ?? ''; return s.length > n ? `${s.slice(0, n)}…` : s; };

function summary(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'inbound': return d.channel === 'schedule' ? `Scheduled run: ${d.text}` : d.channel === 'web' ? `You said: ${d.text}` : `You said over ${d.channel}: ${d.text}`;
    case 'outbound': return d.channel === 'notify' ? `Pushed to you (${(d.targets || []).map((x) => x.channel).join(', ')}): ${d.text}` : `Replied via ${d.channel}: ${d.text}`;
    case 'prompt.assembled': return `Built the prompt for ${d.model}: ${d.messages} messages, ${d.tools?.length ?? 0} tools, memory ${d.cartridges?.length ? d.cartridges.join(', ') : 'none'}, about ${fmt(d.estimate)} tokens`;
    case 'model.request': return `Asked ${d.model}`;
    case 'reasoning': return `Thought: ${d.text}`;
    case 'tool.call': return `Called ${d.toolName} with ${j(d.input)}`;
    case 'tool.result': return `${d.toolName} returned ${j(d.output)}`;
    case 'tool.error': return `${d.toolName} failed: ${d.error}`;
    case 'tool.denied': return 'A tool call was denied and the model was told';
    case 'policy.decision': return d.decision === 'not-applicable' ? `${d.tool}: read-only, no permission needed`
      : d.decision === 'approved' ? `${d.tool}: allowed${d.reason ? `, because ${d.reason}` : ` (${d.level})`}`
      : d.decision === 'denied' ? `${d.tool}: blocked — ${d.reason}`
      : `${d.tool}: paused to ask you — ${d.reason}`;
    case 'approval.requested': return `Waiting for you: ${d.toolName}${d.reason ? ` — ${d.reason}` : ''}`;
    case 'approval.resolved': return `You ${d.approved ? 'allowed' : 'denied'} ${d.toolName}${d.reason ? ` (${d.reason})` : ''}`;
    case 'memory.write': return `${d.op === 'write' ? 'Wrote' : d.op === 'edit' ? 'Edited' : 'Deleted'} memory note ${d.path}`;
    case 'cartridges.changed': return `Memory cartridges now: ${(d.cartridges || []).join(', ') || 'none'}`;
    case 'usage': return `${d.model} used ${fmt(d.usage?.inputTokens)} in, ${fmt(d.usage?.outputTokens)} out (${d.finishReason})`;
    case 'compaction': return `Compacted the conversation: dropped ${d.dropped} messages, kept ${d.kept}${d.savedTo ? `, summary saved to ${d.savedTo}` : ''}`;
    case 'budget.downgraded': return `Budget nearly spent: switched ${d.from} → ${d.to}`;
    case 'budget.refused': return `Stopped: needs about ${fmt(d.estimate)} tokens, only ${fmt(d.remaining)} left today`;
    case 'schedule.tick': return `Scheduled run (${d.cron}): ${d.prompt}`;
    case 'loop.tick': return `Saw ${Object.entries(d.saw || {}).map(([k, v]) => `${k} ${Array.isArray(v) ? (v.length || 'none') : v}`).join(', ')}. ${d.did?.length ? `Did: ${d.did.join('; ')}.` : 'Did nothing.'} ${d.left?.length ? `Left alone: ${d.left.join('; ')}.` : ''}`;
    case 'loop.started': return `Omnii now looks every ${d.everyMin} minutes`;
    case 'settings.changed': return `You changed ${d.key} from ${d.from === undefined ? '(unset)' : JSON.stringify(d.from)} to ${JSON.stringify(d.to)}`;
    case 'checkin.opened': return `${d.title} ${(d.options || []).join(' ')}`;
    case 'checkin.sent': return `Texted it (${d.why})`;
    case 'checkin.reminded': return `Came back about: ${d.title} (${d.why}, ${d.reminders}×)`;
    case 'checkin.snoozed': return `Snoozed until ${new Date(d.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${d.title}`;
    case 'checkin.answered': return `You chose ${d.answer}) ${d.label} via ${d.via}: ${d.title}`;
    case 'checkin.archived': return `Filed (${d.reason}): ${d.title}`;
    case 'checkin.notified': return `Texted you: ${d.line}`;
    case 'allowed.added': return `You said Omnii may always ${d.label} without asking`;
    case 'allowed.removed': return `You took back “${d.label}”. Omnii will ask again`;
    case 'out.written': return `Wrote out/${d.domain}/${d.name} (${d.by})`;
    case 'desk.reloaded': return `desk/${d.file} changed on disk, reloaded`;
    case 'watch.export': return `New in the export folder: ${(d.fresh || []).join(', ')}`;
    case 'watch.export_set': return `Now watching ${d.path || 'no folder'}. The ${d.known} file${d.known === 1 ? '' : 's'} already there count as known${d.filed ? `, and ${d.filed} question${d.filed === 1 ? '' : 's'} about them ${d.filed === 1 ? 'was' : 'were'} filed` : ''}. Only files added from now on are asked about.`;
    case 'watch.mail': return `Read ${d.fresh} new message${d.fresh === 1 ? '' : 's'}`;
    case 'mail.sorted': return `Triage sorted ${d.sorted} of ${d.of}`;
    case 'logbook': return d.kind === 'medicine' ? 'Your medicine has been logged.' : d.kind === 'chores' ? 'Your apartment chores have been logged.' : `Recorded an entry in ${d.kind}.`;
    case 'observation': return `Noted: ${d.text}`;
    case 'interview.answered': return `Interview: answered ${d.id}${d.done ? ' — done' : ''}`;
    case 'schedule.loaded': return `${(d.jobs || []).length} scheduled runs loaded`;
    case 'mode.reloaded': return `Mode files reloaded: ${(d.names || []).join(', ')}`;
    case 'daemon.started': return `Agent started: ${(d.modes || []).length} modes, ${d.skills} skills, iMessage ${d.imessage ? 'on' : 'off'}`;
    case 'daemon.listening': return `Web app at ${d.url}`;
    case 'imessage.sent': return `Sent an iMessage (${d.chars} chars)`;
    case 'imessage.ignored': return `Ignored an iMessage from ${d.from} (not in ALLOWED_HANDLES)`;
    case 'imessage.watch': return 'Watching Messages for new texts';
    case 'imessage.disabled': return 'iMessage off: ALLOWED_HANDLES is empty';
    case 'error': case 'server.error': case 'schedule.error': case 'imessage.error': case 'mode.error': case 'loop.error': case 'watch.mail_error': case 'checkin.send_error': case 'checkin.handoff_error': return d.error || d.message || '';
    default: return j(d);
  }
}
