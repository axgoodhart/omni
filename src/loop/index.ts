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
let last: { at: number; ms: number; did: number; left: number } | null = null;
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

export async function tick(why: string) {
  if (running) return;
  running = true;
  const t0 = Date.now();
  const did: string[] = [], left: string[] = [];
  const saw: Record<string, unknown> = {};
  try {
    const prof = profile.get(), tz = prof.timezone, now = parts(tz), pr = priorities.get();
    const live = checkins.live();
    saw.time = `${now.weekday} ${now.hm}`; saw.open = live.filter((c) => c.state === 'open').length; saw.snoozed = live.filter((c) => c.state === 'snoozed').length;
    saw.busy = modes.names().filter((m) => runner.busy(m));

    // 1. snoozes that came due
    for (const c of live.filter((c) => c.state === 'snoozed' && (c.snoozedUntil ?? 0) <= Date.now())) { checkins.remind(c, 'snooze over'); did.push(`reminded: ${c.title}`); }

    // 2. medicine
    const medKey = `medicine:${now.date}`;
    const medLogged = logbook.loggedOn('medicine', tz, now.date);
    saw.medicine = medLogged ? 'logged' : now.minutes >= hmToMinutes(pr.medicine.time) ? 'due' : `due ${pr.medicine.time}`;
    if (!medLogged && now.minutes >= hmToMinutes(pr.medicine.time)) {
      const prior = checkins.latestByDedupe(medKey);
      if (!prior) {
        const ra = pr.medicine.remind_after ?? pr.defaults.remind_after;
        checkins.ask({ priority: pr.medicine.priority, dedupe: medKey, title: 'Medicine logging is a top priority. You should:', options: [
          opt('a', 'Take now if necessary and have it logged', { type: 'log', kind: 'medicine' }),
          opt('b', `Be reminded in ${ra}`, { type: 'snooze', for: ra }),
          opt('c', 'Be reminded at end of day', { type: 'snooze-eod' }),
          discuss,
        ] });
        did.push('asked: medicine');
      } else if (prior.state === 'open' || prior.state === 'snoozed') left.push(`medicine: ${prior.state} ${Math.round((Date.now() - prior.lastSent) / 60_000)}m, ${prior.reminders ? 'reminded once' : 'not yet reminded'}, waiting`);
      else if (prior.state === 'archived') left.push('medicine: asked today, archived unanswered');
    }

    // 3. chores (a nudge, never a chase)
    if (pr.chores.days.includes(now.weekday) && now.minutes >= hmToMinutes(pr.chores.time)) {
      const key = `chores:${now.date}`;
      if (!checkins.latestByDedupe(key)) { checkins.ask({ kind: 'ask', priority: pr.chores.priority, dedupe: key, title: 'Apartment day. One corner counts.', options: [opt('a', 'Done, log it', { type: 'log', kind: 'chores' }), opt('b', 'Not today', { type: 'archive', reason: 'not today' })] }); did.push('nudged: apartment'); }
    }

    // 4. finished work landing in the export folder
    const ex = exportsWatch.scan();
    saw.export = ex.path ? (ex.ok ? `${ex.fresh.length} new` : ex.error) : 'not set';
    for (const f of ex.fresh.slice(0, 3)) {
      const isl = islands.forFile(f);
      checkins.ask({ priority: isl ? priorities.ofIsland(isl.slug) : 'normal', island: isl?.slug ?? null, dedupe: `export:${f}`, title: `New finished piece: ${f}.`, options: [
        opt('a', 'Add it to the site', { type: 'handoff', mode: 'carrier', text: `A finished piece landed: "${f}" in the export folder (desk_view export/${f} to read it, desk_view site to see how the site lists work). Produce the changed or new site files that add it, written with deliver to out/site. Say what you wrote.` }),
        opt('b', 'Draft a submission for it', { type: 'handoff', mode: 'drafter', text: `Draft a submission for the finished piece "${f}" (desk_view export/${f}). Read desk_view profile and a sample of desk_view writing to match the user's voice. Write the draft with deliver to out/submissions as "${f.replace(/\.[^.]+$/, '')}-submission.md". Say what you wrote.` }),
        opt('c', "It's not finished", { type: 'archive', reason: 'not finished' }),
        discuss,
      ] });
      did.push(`asked about new piece: ${f}`);
    }
    if (ex.fresh.length > 3) left.push(`export: ${ex.fresh.length - 3} more new files, next tick`);

    // 5. mail: fetch, sort, propose unsubscribes
    if (watches.mailConfigured()) {
      const since = watches.get().mail.lastCheck;
      if (Date.now() - since >= LOOP_INTERVAL_MIN * 60_000 - 5000) {
        const r = await mail.fetchNew();
        saw.mail = r.error ? `error: ${r.error}` : `${r.fresh.length} new`;
        if (r.fresh.length) did.push(`read ${r.fresh.length} new mail`);
        const unsorted = mail.unsorted();
        if (unsorted.length && modes.names().includes('triage')) { const n = await triage(unsorted); did.push(`sorted ${n} mail with triage`); }
        else if (unsorted.length) left.push(`mail: ${unsorted.length} unsorted, no triage mode`);
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
          did.push(`asked: unsubscribe ${cand.sender}`);
        }
      } else saw.mail = 'checked recently';
      saw.needsYou = mail.needsYou().length;
    } else saw.mail = 'not set';

    // 6. carry: finished work that never left
    const carry = islands.list().filter((i) => i.position === 'finished, not shared' && !checkins.latestByDedupe(`carry:${i.slug}`));
    if (carry.length) {
      const i = carry[0];
      checkins.ask({ priority: priorities.ofIsland(i.slug), island: i.slug, dedupe: `carry:${i.slug}`, title: `${i.name} is finished and hasn't been shared.`, options: [
        opt('a', 'Add it to the site', { type: 'handoff', mode: 'carrier', text: `"${i.name}" is finished and not shared (desk_view islands/${i.slug}; its files, if any, are listed there and live under desk_view export/). Produce the site files that add it, with deliver to out/site. Say what you wrote.` }),
        opt('b', 'Draft a submission', { type: 'handoff', mode: 'drafter', text: `Draft a submission for "${i.name}" (desk_view islands/${i.slug}). Match the user's voice from desk_view profile and desk_view writing. Write it with deliver to out/submissions as "${i.slug}-submission.md". Say what you wrote.` }),
        opt('c', "It's fine where it is", { type: 'island', slug: i.slug, patch: { position: 'done' } }),
        discuss,
      ] });
      did.push(`asked: carry ${i.name}`);
      if (carry.length > 1) left.push(`carry: ${carry.length - 1} more finished pieces, one per tick`);
    }

    // 7. persistence by priority: top comes back once then archives at end of day; others archive after a day
    for (const c of checkins.open()) {
      const silent = Date.now() - c.lastSent, eod = c.dedupe?.startsWith('medicine') ? (pr.medicine.end_of_day ?? pr.defaults.end_of_day) : pr.defaults.end_of_day;
      if (c.priority === 'top') {
        const ra = duration(c.dedupe?.startsWith('medicine') ? pr.medicine.remind_after ?? pr.defaults.remind_after : pr.defaults.remind_after, 90 * 60_000);
        if (c.reminders === 0 && silent >= ra) { checkins.remind(c, 'silent'); did.push(`reminded once: ${c.title}`); }
        else if (now.minutes >= hmToMinutes(eod) && silent >= 30 * 60_000) { checkins.archive(c, 'unanswered'); did.push(`archived unanswered: ${c.title}`); }
        else left.push(`${c.title.slice(0, 48)}: open ${Math.round(silent / 60_000)}m, waiting`);
      } else if (silent >= 24 * 3_600_000) { checkins.archive(c, 'unanswered'); did.push(`archived quietly: ${c.title}`); }
      else left.push(`${c.title.slice(0, 48)}: open ${Math.round(silent / 60_000)}m, ${c.priority}, no chase`);
    }

    // 8. observations: only from patterns in his own answers
    const med = checkins.recent(200).filter((c) => c.dedupe?.startsWith('medicine') && c.state === 'answered' && c.answer === 'a' && c.answered);
    if (med.length >= 3 && !observations.list().some((o) => o.text.startsWith('answers the medicine check-in'))) {
      const avg = Math.round(med.reduce((s, c) => s + parts(tz, new Date(c.answered!)).minutes, 0) / med.length);
      if (observations.add(`answers the medicine check-in around ${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`, 'loop: medicine answers', now.date)) did.push('noted an observation');
    }
    if (!did.length) left.push('nothing needed doing');
  } catch (e) {
    emit('loop.error', 'loop', { error: (e as Error).message });
  } finally {
    const ms = Date.now() - t0;
    last = { at: t0, ms, did: did.length, left: left.length };
    running = false;
    emit('loop.tick', 'loop', { why, saw, did, left, ms, next: job?.nextRun()?.getTime() ?? null });
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
