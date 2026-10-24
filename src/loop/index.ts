import { Cron } from 'croner';
import { activity, emit } from '../events/log.ts';
import * as runner from '../agent/runner.ts';
import * as outbound from '../channels/outbound.ts';
import * as modes from '../modes/registry.ts';
import * as store from '../threads/store.ts';
import { duration, fmtHm, hmToMinutes, parts } from '../lib/time.ts';
import * as checkins from '../desk/checkins.ts';
import * as islands from '../desk/islands.ts';
import * as logbook from '../desk/logbook.ts';
import * as loopcfg from '../desk/loopcfg.ts';
import * as observations from '../desk/observations.ts';
import * as priorities from '../desk/priorities.ts';
import * as profile from '../desk/profile.ts';
import * as watches from '../desk/watches.ts';
import * as deskStore from '../desk/store.ts';
import * as exportsWatch from './exports.ts';
import * as mail from './mail.ts';
import type { Option } from '../desk/checkins.ts';
import type { Level } from '../desk/priorities.ts';

/**
 * The heartbeat. Each pass asks three questions — who is the user, what's on the plate, what's happening —
 * then does a few bounded things, within the rules in desk/loop.md (which it reads and never writes).
 * Every pass writes one report: status, decisions, what is waiting on the user, what it looked at and left.
 */
let job: Cron | null = null;
let everyMin = 0;
let last: { at: number; ms: number; decisions: number; waiting: number; paused?: boolean } | null = null;
let running = false;

export function start() {
  const cfg = loopcfg.get();
  if (cfg.paused) { stop(); return; }
  const n = cfg.every_min;
  if (job && n === everyMin) return;
  stop(); everyMin = n;
  job = new Cron(n < 60 ? `*/${n} * * * *` : `0 */${Math.round(n / 60)} * * *`, { name: 'loop' }, () => { void tick('cron'); });
  if (!last) setTimeout(() => { void tick('boot'); }, 4000);
  emit('loop.started', 'loop', { everyMin: n });
}
export function stop() { job?.stop(); job = null; }
deskStore.onChange((f) => { if (f === 'loop.md') start(); });
export const status = () => { const c = loopcfg.get(); return { running, paused: c.paused, everyMin: c.every_min, quiet: c.quiet, maxOpen: c.max_open, last, next: c.paused ? null : job?.nextRun()?.getTime() ?? null, busy: modes.names().filter((m) => runner.busy(m)) }; };

const opt = (k: string, label: string, action: Option['action']): Option => ({ k, label, action });
const discuss = opt('d', 'Discuss', { type: 'discuss' });
const clean = (t: string) => t.replace(/[:.\s]+$/, '');

export type Tick = {
  why: string; at: number; next: number | null; ms: number; paused?: boolean;
  status: { checkins: string; activity: string; medicine: string; apartment: string; export: string; mail: string; islands: string; quiet: string };
  decisions: string[];
  waiting: { what: string; since: number; next: string }[];
  inaction: { what: string; why: string }[];
};

/** Quiet hours: when they end, as a timestamp, or null if not in them now. */
function quietEnds(cfg: loopcfg.LoopCfg, tz: string): number | null {
  if (!cfg.quiet) return null;
  const now = parts(tz), from = hmToMinutes(cfg.quiet.from), to = hmToMinutes(cfg.quiet.to), m = now.minutes;
  const inQuiet = from < to ? m >= from && m < to : m >= from || m < to;
  if (!inQuiet) return null;
  const untilTo = to - m; // minutes until "to", today or tomorrow
  return Date.now() + (untilTo > 0 ? untilTo : untilTo + 1440) * 60_000;
}

/** One look, recorded as one activity. */
export const tick = (why: string) => activity('look', 'loop', () => tickNow(why));
async function tickNow(why: string) {
  if (running || loopcfg.get().paused) return;
  running = true;
  const t0 = Date.now();
  const T: Tick = { why, at: t0, next: null, ms: 0, status: { checkins: '', activity: '', medicine: '', apartment: '', export: '', mail: '', islands: '', quiet: '' }, decisions: [], waiting: [], inaction: [] };
  try {
    const cfg = loopcfg.get();
    start(); // picks up a changed every_min
    const prof = profile.get(), tz = prof.timezone, now = parts(tz), pr = priorities.get();
    const hm = (ts: number) => fmtHm(ts, tz);
    const qEnd = quietEnds(cfg, tz);
    T.status.quiet = cfg.quiet ? (qEnd ? `quiet until ${hm(qEnd)}; texts are held` : `texts allowed; quiet from ${cfg.quiet.from} to ${cfg.quiet.to}`) : 'no quiet hours';
    const canText = outbound.channels().includes('imessage');
    const deliver = (level: Level): checkins.Delivery => ({ text: loopcfg.reach(cfg, level, canText).phone, holdUntil: qEnd });
    const room = () => checkins.open().length < cfg.max_open;
    const heldBack = (what: string) => T.inaction.push({ what, why: `held back: you already have ${checkins.open().length} question${checkins.open().length === 1 ? '' : 's'} out (your limit is ${cfg.max_open})` });

    if (cfg.paused) {
      T.paused = true;
      T.status.activity = 'paused by you; nothing looks, nothing asks';
      T.inaction.push({ what: 'Everything', why: 'you paused Omnii on the Config page' });
      return;
    }

    // ---- 1. texts held through quiet hours; snoozes that came due
    for (const c of checkins.releaseHeld()) T.decisions.push(`Quiet hours over: texted you the question "${clean(c.title)}"`);
    for (const c of checkins.live().filter((c) => c.state === 'snoozed' && (c.snoozedUntil ?? 0) <= Date.now())) { checkins.remind(c, 'snooze over', deliver(c.priority)); T.decisions.push(`Reminded you, as you asked: "${clean(c.title)}"`); }

    // ---- 2. medicine: its own status line
    const medKey = `medicine:${now.date}`;
    const medLast = logbook.last('medicine');
    const medLogged = logbook.loggedOn('medicine', tz, now.date);
    const medDue = now.minutes >= hmToMinutes(pr.medicine.time);
    let medPrior = checkins.latestByDedupe(medKey);
    const medLater = cfg.levels[pr.medicine.priority].second_after;
    if (!pr.medicine.enabled) T.status.medicine = 'turned off';
    else if (medLogged) T.status.medicine = `Logged today at ${hm(medLast!.ts)} via ${medLast!.via}`;
    else if (!medDue) T.status.medicine = `Due at ${pr.medicine.time}, not yet asked`;
    else if (!medPrior) {
      if (!room()) { heldBack('The medicine question'); T.status.medicine = `Due since ${pr.medicine.time}, not logged, question held back`; }
      else {
        medPrior = checkins.ask({ priority: pr.medicine.priority, dedupe: medKey, title: 'Medicine logging is a high priority. You should:', options: [
          opt('a', 'Take now if necessary and have it logged', { type: 'log', kind: 'medicine' }),
          opt('b', `Be reminded in ${medLater}`, { type: 'snooze', for: medLater }),
          opt('c', 'Be reminded at end of day', { type: 'snooze-eod' }),
          discuss,
        ] }, deliver(pr.medicine.priority));
        T.decisions.push(`Asked you about medicine (due ${pr.medicine.time}, not logged)${medPrior.heldUntil ? `, text held until ${hm(medPrior.heldUntil)}` : ''}`);
        T.status.medicine = `Due since ${pr.medicine.time}, not logged, asked just now`;
      }
    } else if (medPrior.state === 'archived') T.status.medicine = `Due since ${pr.medicine.time}, not logged, asked at ${hm(medPrior.created)}, filed unanswered at ${hm(medPrior.answered ?? medPrior.created)}`;
    else if (medPrior.state === 'snoozed') T.status.medicine = `Due since ${pr.medicine.time}, not logged, asked at ${hm(medPrior.created)}, you asked to be reminded at ${hm(medPrior.snoozedUntil ?? Date.now())}`;
    else T.status.medicine = `Due since ${pr.medicine.time}, not logged, asked at ${hm(medPrior.created)}, not answered${medPrior.reminders ? `, nudged ${medPrior.reminders}×` : ''}${medPrior.heldUntil ? `, text held until ${hm(medPrior.heldUntil)}` : ''}`;

    // ---- 3. apartment: a nudge, never a chase
    const choresToday = pr.chores.days.includes(now.weekday);
    const choresLast = logbook.last('chores');
    if (!pr.chores.enabled) T.status.apartment = 'turned off';
    else if (!pr.chores.days.length) T.status.apartment = 'No days set';
    else if (!choresToday) T.status.apartment = `Next on ${pr.chores.days.join('/')} at ${pr.chores.time}${choresLast ? `, last done ${new Date(choresLast.ts).toLocaleDateString()}` : ''}`;
    else if (logbook.loggedOn('chores', tz, now.date)) T.status.apartment = `Done today at ${hm(choresLast!.ts)}`;
    else if (now.minutes < hmToMinutes(pr.chores.time)) T.status.apartment = `Today at ${pr.chores.time}, not yet nudged`;
    else {
      const key = `chores:${now.date}`;
      if (checkins.latestByDedupe(key)) T.status.apartment = 'Nudged today, not done';
      else if (!room()) { heldBack('The apartment nudge'); T.status.apartment = 'Due today, nudge held back'; }
      else { checkins.ask({ priority: pr.chores.priority, dedupe: key, title: 'Apartment day. One corner counts.', options: [opt('a', 'Done, log it', { type: 'log', kind: 'chores' }), opt('b', 'Not today', { type: 'archive', reason: 'not today' })] }, deliver(pr.chores.priority)); T.decisions.push('Nudged you about the apartment (today is a set day)'); T.status.apartment = 'Nudged today, not done'; }
    }

    // ---- 4. finished work landing in the export folder
    const ex = exportsWatch.scan();
    T.status.export = !ex.path ? 'NOT SET' : !ex.ok ? `${ex.path}: ${ex.error}` : `${ex.path}: ${ex.fresh.length} new, ${watches.get().export.seen.length} already asked about`;
    const asked: string[] = [];
    for (const f of ex.fresh) {
      if (asked.length >= 3) { T.inaction.push({ what: `New file ${f}`, why: 'at most three questions about new files per look; next look' }); continue; }
      if (!room()) { heldBack(`A question about the new file ${f}`); continue; }
      const isl = islands.forFile(f), level = isl ? priorities.ofIsland(isl.slug) : 'medium';
      checkins.ask({ priority: level, island: isl?.slug ?? null, dedupe: `export:${f}`, title: `New finished piece: ${f}.`, options: [
        opt('a', 'Add it to the site', { type: 'handoff', mode: 'carrier', text: `A finished piece landed: "${f}" in the export folder (desk_view export/${f} to read it, desk_view site to see how the site lists work). Produce the changed or new site files that add it, written with deliver to out/site. Say what you wrote.` }),
        opt('b', 'Draft a submission for it', { type: 'handoff', mode: 'drafter', text: `Draft a submission for the finished piece "${f}" (desk_view export/${f}). Read desk_view profile and a sample of desk_view writing to match the user's voice. Write the draft with deliver to out/submissions as "${f.replace(/\.[^.]+$/, '')}-submission.md". Say what you wrote.` }),
        opt('c', "It's not finished", { type: 'archive', reason: 'not finished' }),
        discuss,
      ] }, deliver(level));
      asked.push(f);
      T.decisions.push(`Asked you what to do with a new file in the export folder: ${f}`);
    }
    exportsWatch.markSeen(asked);

    // ---- 5. mail: read, sort, propose unsubscribes
    if (!watches.mailConfigured()) T.status.mail = 'NOT SET';
    else {
      const w = watches.get().mail;
      let fetched = '';
      if (Date.now() - w.lastCheck >= cfg.every_min * 60_000 - 5000) {
        const r = await mail.fetchNew();
        fetched = r.error ? `read failed: ${r.error}` : `${r.fresh.length} new`;
        if (r.fresh.length) T.decisions.push(`Read ${r.fresh.length} new message${r.fresh.length === 1 ? '' : 's'} (sender and subject only)`);
        const unsorted = mail.unsorted();
        if (unsorted.length && modes.names().includes('triage')) { const n = await triage(unsorted); T.decisions.push(`Had triage sort ${n} of ${unsorted.length} messages`); }
        else if (unsorted.length) T.inaction.push({ what: `${unsorted.length} unsorted messages`, why: 'no triage mode is loaded' });
        for (const cand of mail.unsubscribeCandidates(w.unsub_threshold).slice(0, 2)) {
          const key = `unsub:${cand.sender}`;
          if (checkins.latestByDedupe(key)) continue;
          const who = cand.name ? `${cand.name} (${cand.sender})` : cand.sender;
          if (!room()) { heldBack(`Whether to unsubscribe you from ${who}`); continue; }
          checkins.ask({ priority: 'low', dedupe: key, title: `Can Omnii unsubscribe you from ${who}? You received ${cand.n} this week.`, options: [
            opt('a', 'Yes', { type: 'deliver', domain: 'mail', name: `unsubscribe-${cand.sender}.md`, content: `# Unsubscribe request\n\nSender: ${who}\nReceived this week: ${cand.n}\nList-Unsubscribe: ${cand.listUnsub}\n\nNothing was sent. Open the link or address above to unsubscribe yourself, or wait for a live email connector.\n` }),
            opt('b', 'Not now', { type: 'archive', reason: 'not now' }),
            opt('c', `Never ask about ${cand.sender}`, { type: 'ignore-sender', sender: cand.sender }),
            discuss,
          ] }, deliver('low'));
          T.decisions.push(`Asked whether to unsubscribe you from ${who} (${cand.n} this week)`);
        }
      } else fetched = `checked at ${hm(w.lastCheck)}`;
      T.status.mail = `${fetched}, ${mail.needsYou().length} need you${w.lastError ? `, last error: ${w.lastError}` : ''}`;
    }

    // ---- 6. carry: finished work, asked about once
    const all = islands.list();
    const carry = all.filter((i) => i.progress >= 100 && !checkins.latestByDedupe(`carry:${i.slug}`));
    if (carry.length) {
      const i = carry[0], level = priorities.ofIsland(i.slug);
      if (!room()) heldBack(`What to do with "${i.name}", now finished`);
      else {
        checkins.ask({ priority: level, island: i.slug, dedupe: `carry:${i.slug}`, title: `${i.name} is finished. What should happen with it?`, options: [
          opt('a', 'Add it to the site', { type: 'handoff', mode: 'carrier', text: `"${i.name}" is finished and not shared (desk_view islands/${i.slug}; its files, if any, are listed there and live under desk_view export/). Produce the site files that add it, with deliver to out/site. Say what you wrote.` }),
          opt('b', 'Draft a submission', { type: 'handoff', mode: 'drafter', text: `Draft a submission for "${i.name}" (desk_view islands/${i.slug}). Match the user's voice from desk_view profile and desk_view writing. Write it with deliver to out/submissions as "${i.slug}-submission.md". Say what you wrote.` }),
          opt('c', "Nothing, it's done", { type: 'none' }),
          discuss,
        ] }, deliver(level));
        T.decisions.push(`Asked you about "${i.name}": finished`);
      }
      if (carry.length > 1) T.inaction.push({ what: `${carry.length - 1} more finished islands`, why: 'one of these per look' });
    }
    const byPos: Record<string, number> = {};
    for (const i of all) byPos[i.position] = (byPos[i.position] ?? 0) + 1;
    T.status.islands = all.length ? `${all.length} total · ${Object.entries(byPos).map(([k, v]) => `${v} ${k}`).join(' · ')}` : 'none yet';

    // ---- 7. nudges by priority: the quick ones, then the slower ones, then filed (or slower nudges for good). Quiet hours pause the count.
    for (const c of checkins.live()) {
      const R = cfg.levels[c.priority], what = clean(c.title), total = R.first_times + R.second_times;
      const held = () => (c.heldUntil && c.heldUntil > Date.now() ? ` (text held until ${hm(c.heldUntil)})` : '');
      if (c.state === 'snoozed') { T.waiting.push({ what, since: c.created, next: `paused at your request until ${hm(c.snoozedUntil ?? Date.now())}` }); continue; }
      const step = () => {
        const n = c.reminders, quick = n < R.first_times, files = R.stop && n >= total;
        const at = c.lastSent + duration(quick ? R.first_after : R.second_after, 90 * 60_000);
        return { at, quick, files, label: files ? `files as unanswered at ${hm(at)}` : `${quick ? 'quick' : 'slower'} nudge ${n + 1}${R.stop ? ` of ${total}` : ''} at ${hm(at)}` };
      };
      const s = step();
      if (qEnd) { T.waiting.push({ what, since: c.created, next: `nothing moves until quiet hours end at ${hm(qEnd)}${held()}` }); continue; }
      if (Date.now() < s.at) { T.waiting.push({ what, since: c.created, next: s.label + held() }); continue; }
      if (s.files) {
        checkins.archive(c, 'unanswered');
        T.decisions.push(`Filed as unanswered after ${total} nudge${total === 1 ? '' : 's'}: "${what}"`);
        if (R.stop_text && deliver(c.priority).text) { void checkins.notify(`Filed without an answer: "${what}". It stays in the desk's history.`, 'filed'); T.decisions.push(`Texted you that "${what}" was filed`); }
        continue;
      }
      const silentMin = Math.round((Date.now() - c.lastSent) / 60_000);
      checkins.remind(c, s.quick ? 'quick nudge' : 'slower nudge', deliver(c.priority));
      T.decisions.push(`Nudged you (${s.quick ? 'quick' : 'slower'}, ${c.reminders}${R.stop ? ` of ${total}` : ''}) after ${silentMin} minutes of silence: "${what}"`);
      T.waiting.push({ what, since: c.created, next: step().label + held() });
    }
    const liveNow = checkins.live();
    const answeredToday = checkins.recent(200).filter((c) => c.state === 'answered' && c.answered && parts(tz, new Date(c.answered)).date === now.date).length;
    const openOnes = liveNow.filter((c) => c.state === 'open');
    T.status.checkins = `${openOnes.length} not answered${openOnes.length ? ` (oldest asked ${hm(Math.min(...openOnes.map((c) => c.created)))})` : ''} · ${answeredToday} answered today · ${liveNow.length - openOnes.length} paused · limit ${cfg.max_open} out at once`;
    T.status.activity = status().busy.length ? `${status().busy.join(', ')} running` : 'nothing running';

    // ---- 8. what was looked at and left, with the reason
    for (const i of all) {
      if (liveNow.some((c) => c.island === i.slug)) continue;
      if (i.progress >= 100) continue;
      T.inaction.push({ what: `Island "${i.name}"`, why: `${i.position} (${i.progress}%), ${priorities.ofIsland(i.slug)} priority; nothing is due` });
    }
    if (!ex.path) T.inaction.push({ what: 'Export folder', why: 'not set; set it on the Config page' });
    if (!watches.mailConfigured()) T.inaction.push({ what: 'Email', why: 'not connected; connect it on the Config page' });

    // ---- 9. observations: only from patterns in his own answers
    const med = checkins.recent(200).filter((c) => c.dedupe?.startsWith('medicine') && c.state === 'answered' && c.answer === 'a' && c.answered);
    if (med.length >= 3 && !observations.list().some((o) => o.text.startsWith('answers the medicine check-in'))) {
      const avg = Math.round(med.reduce((s, c) => s + parts(tz, new Date(c.answered!)).minutes, 0) / med.length);
      if (observations.add(`answers the medicine check-in around ${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`, 'loop: medicine answers', now.date)) T.decisions.push('Noted an observation: when you tend to answer the medicine question');
    }
  } catch (e) {
    emit('loop.error', 'loop', { error: (e as Error).message });
  } finally {
    T.ms = Date.now() - t0; T.next = T.paused ? null : job?.nextRun()?.getTime() ?? null;
    last = { at: t0, ms: T.ms, decisions: T.decisions.length, waiting: T.waiting.length, paused: T.paused };
    running = false;
    emit('loop.tick', 'loop', T);
  }
}

/** Hand unsorted mail to the triage mode (light model) and read its verdicts back. */
async function triage(list: mail.Mail[]) {
  store.reset('triage');
  const lines = list.map((m) => `${m.uid} | ${m.senderName ? `${m.senderName} <${m.sender}>` : m.sender} | ${m.subject}${m.listUnsub ? ' | has List-Unsubscribe' : ''}`).join('\n');
  const text = await runner.run({ mode: 'triage', channel: 'loop', light: true, text: `Sort these ${list.length} messages. One line per message, exactly: uid | verdict | reason. Verdicts: needs_you, file, newsletter.\n\n${lines}` });
  let n = 0;
  for (const m of text.matchAll(/^\s*(\d+)\s*\|\s*(needs_you|file|newsletter)\s*\|\s*(.*)$/gim)) { mail.setVerdict(Number(m[1]), m[2].toLowerCase(), m[3].trim()); n++; }
  for (const m of list) if (!text.includes(String(m.uid))) mail.setVerdict(m.uid, 'file', 'not mentioned by triage');
  emit('mail.sorted', 'loop', { sorted: n, of: list.length });
  return n;
}
