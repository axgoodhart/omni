import { Cron } from 'croner';
import { LOOP_INTERVAL_MIN } from '../config.ts';
import { emit } from '../events/log.ts';
import * as runner from '../agent/runner.ts';
import * as modes from '../modes/registry.ts';
import * as store from '../threads/store.ts';
import { duration, fmtHm, hmToMinutes, parts } from '../lib/time.ts';
import * as checkins from '../desk/checkins.ts';
import * as islands from '../desk/islands.ts';
import * as logbook from '../desk/logbook.ts';
import * as observations from '../desk/observations.ts';
import * as priorities from '../desk/priorities.ts';
import * as profile from '../desk/profile.ts';
import * as watches from '../desk/watches.ts';
import * as exportsWatch from './exports.ts';
import * as mail from './mail.ts';
import type { Option } from '../desk/checkins.ts';

/**
 * The heartbeat. Three questions each tick — who is the user (profile, observations), what's on the plate
 * (islands, rhythms, watches), what's happening (open check-ins, agents, its own log) — then a few bounded verbs.
 * Every tick writes one loop.tick with saw / did / left. Silence is a decision and gets written down.
 */
let job: Cron | null = null;
let last: { at: number; ms: number; decisions: number; waiting: number } | null = null;
let running = false;

export function start() {
  stop();
  const n = Math.max(1, Math.min(59, LOOP_INTERVAL_MIN));
  job = new Cron(`*/${n} * * * *`, { name: 'loop' }, () => { void tick('cron'); });
  setTimeout(() => { void tick('boot'); }, 4000);
  emit('loop.started', 'loop', { everyMin: n });
}
export function stop() { job?.stop(); job = null; }
export const status = () => ({ running, everyMin: LOOP_INTERVAL_MIN, last, next: job?.nextRun()?.getTime() ?? null, busy: modes.names().filter((m) => runner.busy(m)) });

const opt = (k: string, label: string, action: Option['action']): Option => ({ k, label, action });
const discuss = opt('d', 'Discuss', { type: 'discuss' });
const clean = (t: string) => t.replace(/[:.\s]+$/, '');

/** What one tick writes down. Rendered as a block in the Loop view; stored whole in the event. */
export type Tick = {
  why: string; at: number; next: number | null; ms: number;
  status: { checkins: string; activity: string; medicine: string; apartment: string; export: string; mail: string; islands: string };
  decisions: string[];                                   // things it did, with what and why
  waiting: { what: string; since: number; next: string }[]; // questions out to the user, and what happens if they stay unanswered
  inaction: { what: string; why: string }[];              // things it looked at and chose to leave, with the reason
};

export async function tick(why: string) {
  if (running) return;
  running = true;
  const t0 = Date.now();
  const T: Tick = { why, at: t0, next: null, ms: 0, status: { checkins: '', activity: '', medicine: '', apartment: '', export: '', mail: '', islands: '' }, decisions: [], waiting: [], inaction: [] };
  try {
    const prof = profile.get(), tz = prof.timezone, now = parts(tz), pr = priorities.get();
    const hm = (ts: number) => fmtHm(ts, tz);

    // ---- 1. snoozes that came due
    for (const c of checkins.live().filter((c) => c.state === 'snoozed' && (c.snoozedUntil ?? 0) <= Date.now())) { checkins.remind(c, 'snooze over'); T.decisions.push(`Reminded you, as you asked: "${clean(c.title)}"`); }

    // ---- 2. medicine: a first-class surface with its own status line
    const medKey = `medicine:${now.date}`;
    const medLast = logbook.last('medicine');
    const medLogged = logbook.loggedOn('medicine', tz, now.date);
    const medDue = now.minutes >= hmToMinutes(pr.medicine.time);
    let medPrior = checkins.latestByDedupe(medKey);
    if (medLogged) T.status.medicine = `Logged today at ${hm(medLast!.ts)} via ${medLast!.via}`;
    else if (!medDue) T.status.medicine = `Due at ${pr.medicine.time}, not yet asked`;
    else if (!medPrior) {
      const ra = pr.medicine.remind_after ?? pr.defaults.remind_after;
      medPrior = checkins.ask({ priority: pr.medicine.priority, dedupe: medKey, title: 'Medicine logging is a top priority. You should:', options: [
        opt('a', 'Take now if necessary and have it logged', { type: 'log', kind: 'medicine' }),
        opt('b', `Be reminded in ${ra}`, { type: 'snooze', for: ra }),
        opt('c', 'Be reminded at end of day', { type: 'snooze-eod' }),
        discuss,
      ] });
      T.decisions.push(`Asked you about medicine (due ${pr.medicine.time}, not logged)`);
      T.status.medicine = `Due since ${pr.medicine.time}, not logged, asked just now`;
    } else if (medPrior.state === 'archived') T.status.medicine = `Due since ${pr.medicine.time}, not logged, asked at ${hm(medPrior.created)}, filed unanswered at ${hm(medPrior.answered ?? medPrior.created)}`;
    else if (medPrior.state === 'snoozed') T.status.medicine = `Due since ${pr.medicine.time}, not logged, asked at ${hm(medPrior.created)}, you asked to be reminded at ${hm(medPrior.snoozedUntil ?? Date.now())}`;
    else T.status.medicine = `Due since ${pr.medicine.time}, not logged, asked at ${hm(medPrior.created)}, not answered${medPrior.reminders ? ', reminded once' : ''}`;

    // ---- 3. apartment: a nudge, never a chase
    const choresToday = pr.chores.days.includes(now.weekday);
    const choresLast = logbook.last('chores');
    if (!pr.chores.days.length) T.status.apartment = 'No days set';
    else if (!choresToday) T.status.apartment = `Next on ${pr.chores.days.join('/')} at ${pr.chores.time}${choresLast ? `, last done ${new Date(choresLast.ts).toLocaleDateString()}` : ''}`;
    else if (logbook.loggedOn('chores', tz, now.date)) T.status.apartment = `Done today at ${hm(choresLast!.ts)}`;
    else if (now.minutes < hmToMinutes(pr.chores.time)) T.status.apartment = `Today at ${pr.chores.time}, not yet nudged`;
    else {
      const key = `chores:${now.date}`;
      if (!checkins.latestByDedupe(key)) { checkins.ask({ priority: pr.chores.priority, dedupe: key, title: 'Apartment day. One corner counts.', options: [opt('a', 'Done, log it', { type: 'log', kind: 'chores' }), opt('b', 'Not today', { type: 'archive', reason: 'not today' })] }); T.decisions.push('Nudged you about the apartment (today is a set day)'); }
      T.status.apartment = 'Nudged today, not done';
    }

    // ---- 4. finished work landing in the export folder
    const ex = exportsWatch.scan();
    T.status.export = !ex.path ? 'NOT SET' : !ex.ok ? `${ex.path}: ${ex.error}` : `${ex.path}: ${ex.fresh.length} new, ${watches.get().export.seen.length} seen in total`;
    for (const f of ex.fresh.slice(0, 3)) {
      const isl = islands.forFile(f);
      checkins.ask({ priority: isl ? priorities.ofIsland(isl.slug) : 'normal', island: isl?.slug ?? null, dedupe: `export:${f}`, title: `New finished piece: ${f}.`, options: [
        opt('a', 'Add it to the site', { type: 'handoff', mode: 'carrier', text: `A finished piece landed: "${f}" in the export folder (desk_view export/${f} to read it, desk_view site to see how the site lists work). Produce the changed or new site files that add it, written with deliver to out/site. Say what you wrote.` }),
        opt('b', 'Draft a submission for it', { type: 'handoff', mode: 'drafter', text: `Draft a submission for the finished piece "${f}" (desk_view export/${f}). Read desk_view profile and a sample of desk_view writing to match the user's voice. Write the draft with deliver to out/submissions as "${f.replace(/\.[^.]+$/, '')}-submission.md". Say what you wrote.` }),
        opt('c', "It's not finished", { type: 'archive', reason: 'not finished' }),
        discuss,
      ] });
      T.decisions.push(`Asked you what to do with a new file in the export folder: ${f}`);
    }
    if (ex.fresh.length > 3) T.inaction.push({ what: `${ex.fresh.length - 3} more new files in the export folder`, why: 'at most three questions per tick; the rest next tick' });

    // ---- 5. mail: read, sort, propose unsubscribes
    if (!watches.mailConfigured()) T.status.mail = 'NOT SET';
    else {
      const w = watches.get().mail;
      let fetched = '';
      if (Date.now() - w.lastCheck >= LOOP_INTERVAL_MIN * 60_000 - 5000) {
        const r = await mail.fetchNew();
        fetched = r.error ? `read failed: ${r.error}` : `${r.fresh.length} new`;
        if (r.fresh.length) T.decisions.push(`Read ${r.fresh.length} new message${r.fresh.length === 1 ? '' : 's'} (sender and subject only)`);
        const unsorted = mail.unsorted();
        if (unsorted.length && modes.names().includes('triage')) { const n = await triage(unsorted); T.decisions.push(`Had triage sort ${n} of ${unsorted.length} messages`); }
        else if (unsorted.length) T.inaction.push({ what: `${unsorted.length} unsorted messages`, why: 'no triage mode is loaded' });
        for (const cand of mail.unsubscribeCandidates().slice(0, 2)) {
          const key = `unsub:${cand.sender}`;
          if (checkins.latestByDedupe(key)) continue;
          const who = cand.name ? `${cand.name} (${cand.sender})` : cand.sender;
          checkins.ask({ priority: 'low', dedupe: key, title: `Can I unsubscribe you from ${who}? You received ${cand.n} this week.`, options: [
            opt('a', 'Yes', { type: 'deliver', domain: 'mail', name: `unsubscribe-${cand.sender}.md`, content: `# Unsubscribe request\n\nSender: ${who}\nReceived this week: ${cand.n}\nList-Unsubscribe: ${cand.listUnsub}\n\nIn sandbox: nothing was sent. Open the link or address above to unsubscribe, or set mail to live in desk/trust.md once a connector exists.\n` }),
            opt('b', 'Not now', { type: 'archive', reason: 'not now' }),
            opt('c', `Never ask about ${cand.sender}`, { type: 'ignore-sender', sender: cand.sender }),
            discuss,
          ] });
          T.decisions.push(`Asked whether to unsubscribe you from ${who} (${cand.n} this week)`);
        }
      } else fetched = `checked at ${hm(w.lastCheck)}`;
      T.status.mail = `${fetched}, ${mail.needsYou().length} need you${w.lastError ? `, last error: ${w.lastError}` : ''}`;
    }

    // ---- 6. carry: finished work that never left
    const all = islands.list();
    const carry = all.filter((i) => i.position === 'finished, not shared' && !checkins.latestByDedupe(`carry:${i.slug}`));
    if (carry.length) {
      const i = carry[0];
      checkins.ask({ priority: priorities.ofIsland(i.slug), island: i.slug, dedupe: `carry:${i.slug}`, title: `${i.name} is finished and hasn't been shared.`, options: [
        opt('a', 'Add it to the site', { type: 'handoff', mode: 'carrier', text: `"${i.name}" is finished and not shared (desk_view islands/${i.slug}; its files, if any, are listed there and live under desk_view export/). Produce the site files that add it, with deliver to out/site. Say what you wrote.` }),
        opt('b', 'Draft a submission', { type: 'handoff', mode: 'drafter', text: `Draft a submission for "${i.name}" (desk_view islands/${i.slug}). Match the user's voice from desk_view profile and desk_view writing. Write it with deliver to out/submissions as "${i.slug}-submission.md". Say what you wrote.` }),
        opt('c', "It's fine where it is", { type: 'island', slug: i.slug, patch: { position: 'done' } }),
        discuss,
      ] });
      T.decisions.push(`Asked you about "${i.name}": finished and never shared`);
      if (carry.length > 1) T.inaction.push({ what: `${carry.length - 1} more finished, unshared islands`, why: 'one carry question per tick' });
    }
    const byPos: Record<string, number> = {};
    for (const i of all) byPos[i.position] = (byPos[i.position] ?? 0) + 1;
    T.status.islands = all.length ? `${all.length} total · ${Object.entries(byPos).map(([k, v]) => `${v} ${k}`).join(' · ')}` : 'none yet';

    // ---- 7. recap: every question out to you, what happens if it stays unanswered; then reminders and filing by priority
    for (const c of checkins.live()) {
      const silent = Date.now() - c.lastSent;
      const isMed = c.dedupe?.startsWith('medicine') ?? false;
      const eod = isMed ? (pr.medicine.end_of_day ?? pr.defaults.end_of_day) : pr.defaults.end_of_day;
      const ra = duration(isMed ? pr.medicine.remind_after ?? pr.defaults.remind_after : pr.defaults.remind_after, 90 * 60_000);
      if (c.state === 'snoozed') { T.waiting.push({ what: clean(c.title), since: c.created, next: `paused at your request until ${hm(c.snoozedUntil ?? Date.now())}` }); continue; }
      if (c.priority === 'top') {
        if (c.reminders === 0 && silent >= ra) { checkins.remind(c, 'silent'); T.decisions.push(`Reminded you once, after ${Math.round(silent / 60_000)} minutes of silence: "${clean(c.title)}"`); T.waiting.push({ what: clean(c.title), since: c.created, next: `files as unanswered at ${eod}` }); }
        else if (now.minutes >= hmToMinutes(eod) && silent >= 30 * 60_000) { checkins.archive(c, 'unanswered'); T.decisions.push(`Filed as unanswered at end of day: "${clean(c.title)}"`); }
        else T.waiting.push({ what: clean(c.title), since: c.created, next: c.reminders ? `already reminded once; files as unanswered at ${eod}` : `reminder at ${hm(c.lastSent + ra)}, then files at ${eod}` });
      } else if (silent >= 24 * 3_600_000) { checkins.archive(c, 'unanswered'); T.decisions.push(`Filed as unanswered after a day: "${clean(c.title)}"`); }
      else T.waiting.push({ what: clean(c.title), since: c.created, next: `${c.priority} priority: no reminder; files as unanswered at ${hm(c.lastSent + 24 * 3_600_000)}` });
    }
    const liveNow = checkins.live();
    const answeredToday = checkins.recent(200).filter((c) => c.state === 'answered' && c.answered && parts(tz, new Date(c.answered)).date === now.date).length;
    const openOnes = liveNow.filter((c) => c.state === 'open');
    T.status.checkins = `${openOnes.length} not answered${openOnes.length ? ` (oldest asked ${hm(Math.min(...openOnes.map((c) => c.created)))})` : ''} · ${answeredToday} answered today · ${liveNow.length - openOnes.length} paused`;
    T.status.activity = status().busy.length ? `${status().busy.join(', ')} running` : 'nothing running';

    // ---- 8. what was looked at and left, with the reason
    for (const i of all) {
      if (liveNow.some((c) => c.island === i.slug)) continue;
      if (i.position === 'finished, not shared') continue;
      T.inaction.push({ what: `Island "${i.name}"`, why: `${i.position}, ${priorities.ofIsland(i.slug)} priority; nothing is due and no rule applies to this position yet` });
    }
    if (!ex.path) T.inaction.push({ what: 'Export folder', why: 'not set; the interview or desk/watches.md sets it' });
    if (!watches.mailConfigured()) T.inaction.push({ what: 'Email', why: 'not set; IMAP_HOST, IMAP_USER, IMAP_PASS in .env' });

    // ---- 9. observations: only from patterns in his own answers
    const med = checkins.recent(200).filter((c) => c.dedupe?.startsWith('medicine') && c.state === 'answered' && c.answer === 'a' && c.answered);
    if (med.length >= 3 && !observations.list().some((o) => o.text.startsWith('answers the medicine check-in'))) {
      const avg = Math.round(med.reduce((s, c) => s + parts(tz, new Date(c.answered!)).minutes, 0) / med.length);
      if (observations.add(`answers the medicine check-in around ${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`, 'loop: medicine answers', now.date)) T.decisions.push('Noted an observation: when you tend to answer the medicine question');
    }
  } catch (e) {
    emit('loop.error', 'loop', { error: (e as Error).message });
  } finally {
    T.ms = Date.now() - t0; T.next = job?.nextRun()?.getTime() ?? null;
    last = { at: t0, ms: T.ms, decisions: T.decisions.length, waiting: T.waiting.length };
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
