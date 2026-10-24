import fs from 'node:fs';
import { emit } from '../events/log.ts';
import { getEnv, setEnv } from './env.ts';
import * as allowed from './allowed.ts';
import * as islands from './islands.ts';
import * as logbook from './logbook.ts';
import * as loopcfg from './loopcfg.ts';
import * as observations from './observations.ts';
import * as priorities from './priorities.ts';
import * as profile from './profile.ts';
import * as store from './store.ts';
import * as trust from './trust.ts';
import * as watches from './watches.ts';
import * as exportsWatch from '../loop/exports.ts';
import { readRaw, writeRaw } from './store.ts';

/**
 * One place that reads and writes every setting the Config page shows. Each change is one dotted key,
 * routed to the file that owns it, and written to the log as "you changed X from A to B".
 */
export function get() {
  const w = watches.get();
  return {
    loop: loopcfg.get(), priorities: priorities.get(), profile: profile.get(), trust: trust.get(),
    watches: { export: { path: w.export.path, seen: w.export.seen.length }, mail: { configured: watches.mailConfigured(), host: getEnv('IMAP_HOST'), user: getEnv('IMAP_USER'), unsub_threshold: w.mail.unsub_threshold, lastCheck: w.mail.lastCheck, lastError: w.mail.lastError, ignore: w.mail.ignore } },
    reach: { handle: getEnv('ALLOWED_HANDLES') },
    islands: islands.list().map(({ notes, ...i }) => ({ ...i, priority: priorities.ofIsland(i.slug) })),
    observations: observations.list(),
    allowed: allowed.list(),
    logbook: { medicine: logbook.last('medicine'), chores: logbook.last('chores') },
  };
}

const nest = (path: string[], value: unknown): Record<string, any> => path.reduceRight((acc, k) => ({ [k]: acc }), value as any);
const pick = (obj: any, path: string[]) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
const asBool = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';
const asTime = (v: unknown) => priorities.normTimeStr(String(v));
const asDur = (v: unknown) => { const s = String(v).trim(); if (!/^\d+(\.\d+)?\s*[mhdw]?$/.test(s)) throw new Error('use minutes like 90m, hours like 2h, days like 1d, or weeks like 1w'); return s.replace(/\s+/g, ''); };
const asVia = (v: unknown) => { if (!loopcfg.VIA.includes(v as loopcfg.Via)) throw new Error('use desk, phone or both'); return v as loopcfg.Via; };
const asDays = (v: unknown) => { const D = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; const list = Array.isArray(v) ? v : String(v).toLowerCase().split(/[\s,]+/); return list.map((x) => String(x).slice(0, 3).toLowerCase()).filter((x) => D.includes(x)); };
const asLevel = (v: unknown) => { if (!['top', 'normal', 'low'].includes(String(v))) throw new Error('priority is top, normal or low'); return String(v) as priorities.Level; };

/** Change one setting. Returns what it was and what it is now. */
export function set(key: string, value: unknown, by = 'web') {
  const [root, ...rest] = key.split('.');
  const before = get();
  let from: unknown, to: unknown;
  switch (root) {
    case 'loop': {
      const v = rest.join('.');
      from = pick(before.loop, rest);
      if (v === 'every_min') to = Math.max(1, Math.min(120, Number(value) || 5));
      else if (v === 'paused') to = asBool(value);
      else if (v === 'max_open') to = Math.max(1, Math.min(5, Number(value) || 1));
      else if (v === 'quiet') to = value ? { from: asTime((value as any).from), to: asTime((value as any).to) } : null;
      else if (v === 'quiet.from' || v === 'quiet.to') to = asTime(value);
      else if (v === 'via' || v.endsWith('.via')) to = asVia(value);
      else if (v.endsWith('_after')) to = asDur(value);
      else if (v.endsWith('_times')) to = Math.max(1, Math.min(3, Number(value) || 1));
      else if (v.endsWith('.stop') || v.endsWith('.stop_text')) to = asBool(value);
      else throw new Error(`unknown setting ${key}`);
      if (v === 'quiet' && to === null) { const { data, body } = store.readFm('loop.md'); data.quiet = null; store.writeFm('loop.md', data, body); }
      else loopcfg.patch(nest(rest, to));
      break;
    }
    case 'priorities': {
      const [who, field] = rest;
      from = pick(before.priorities, rest);
      if (who === 'islands') to = asLevel(value);
      else if (field === 'time') to = asTime(value);
      else if (field === 'days') to = asDays(value);
      else if (field === 'priority') to = asLevel(value);
      else if (field === 'enabled') to = asBool(value);
      else throw new Error(`unknown setting ${key}`);
      priorities.ensure(); store.patchFm('priorities.md', nest(rest, to));
      break;
    }
    case 'watches': {
      from = pick(before.watches, rest);
      if (key === 'watches.export.path') { to = String(value ?? '').trim().replace(/^~/, process.env.HOME ?? '~'); exportsWatch.setFolder(String(to)); break; }
      if (key === 'watches.mail.unsub_threshold') to = Math.max(1, Math.min(50, Number(value) || 3));
      else throw new Error(`unknown setting ${key}`);
      watches.patch(nest(rest, to));
      break;
    }
    case 'profile': {
      const f = rest[0]; if (!['name', 'timezone', 'writing', 'site'].includes(f)) throw new Error(`unknown setting ${key}`);
      from = (before.profile as any)[f]; to = String(value ?? '').trim();
      store.patchFm('profile.md', { [f]: to });
      break;
    }
    case 'reach': { from = before.reach.handle; to = String(value ?? '').replace(/\s+/g, ''); setEnv('ALLOWED_HANDLES', String(to)); break; }
    case 'mail': {
      const f = rest[0]; const K: Record<string, string> = { host: 'IMAP_HOST', user: 'IMAP_USER', pass: 'IMAP_PASS' };
      if (!K[f]) throw new Error(`unknown setting ${key}`);
      from = f === 'pass' ? '••••' : getEnv(K[f]); to = f === 'pass' ? '••••' : String(value ?? '').trim();
      setEnv(K[f], String(value ?? '').trim());
      break;
    }
    case 'islands': {
      const [slug, f] = rest; const cur = islands.get(slug); if (!cur) throw new Error('no such island');
      if (f === 'priority') { from = priorities.ofIsland(slug); to = asLevel(value); priorities.setIsland(slug, to as priorities.Level); break; }
      if (!['name', 'kind', 'position', 'status', 'stage'].includes(f)) throw new Error(`unknown setting ${key}`);
      from = (cur as any)[f]; to = f === 'stage' ? Number(value) : String(value ?? '');
      if (f === 'kind' && !islands.KINDS[String(to)]) throw new Error('unknown kind');
      if (f === 'position' && !islands.POSITIONS.includes(to as any)) throw new Error('unknown position');
      islands.upsert(slug, { [f]: to } as any);
      break;
    }
    case 'observations': {
      if (rest[0] !== 'remove') throw new Error(`unknown setting ${key}`);
      from = String(value); to = null;
      const raw = readRaw('observations.md');
      writeRaw('observations.md', raw.split('\n').filter((l) => !(l.startsWith('- ') && l.endsWith(` · ${value}`))).join('\n'));
      break;
    }
    case 'allowed': {
      if (rest[0] !== 'remove') throw new Error(`unknown setting ${key}`);
      allowed.remove(Number(value)); // records its own event
      return { key, from: undefined, to: null };
    }
    case 'trust': throw new Error('Sending for real is not available yet. Everything stays written to the out/ folder.');
    default: throw new Error(`unknown setting ${key}`);
  }
  emit('settings.changed', 'loop', { key, from, to, by });
  return { key, from, to };
}

export function removeIsland(slug: string, by = 'web') {
  const i = islands.get(slug); if (!i) throw new Error('no such island');
  fs.rmSync(store.deskPath(`islands/${slug}.md`));
  const { data, body } = store.readFm('priorities.md'); if (data.islands) delete data.islands[slug]; store.writeFm('priorities.md', data, body);
  emit('settings.changed', 'loop', { key: `islands.${slug}`, from: i.name, to: null, by });
  return { ok: true };
}

const LEVEL_LABELS = Object.fromEntries((['top', 'normal', 'low'] as const).flatMap((l) => [
  [`loop.levels.${l}.via`, `where ${l}-priority questions go`], [`loop.levels.${l}.first_after`, `${l} priority: wait before each quick nudge`], [`loop.levels.${l}.first_times`, `${l} priority: number of quick nudges`],
  [`loop.levels.${l}.second_after`, `${l} priority: wait before each slower nudge`], [`loop.levels.${l}.second_times`, `${l} priority: number of slower nudges`], [`loop.levels.${l}.stop`, `${l} priority: file after the slower nudges`], [`loop.levels.${l}.stop_text`, `${l} priority: text you when it's filed`],
]));
/** Plain-English labels for the change log. */
export const LABELS: Record<string, string> = {
  'loop.every_min': 'how often Omnii looks (minutes)', 'loop.paused': 'paused', 'loop.max_open': 'how many questions Omnii may have out at once', 'loop.quiet': 'quiet hours', 'loop.quiet.from': 'quiet hours start', 'loop.quiet.to': 'quiet hours end', 'loop.via': 'where questions reach you',
  ...LEVEL_LABELS,
  'priorities.medicine.time': 'medicine time', 'priorities.medicine.priority': 'medicine priority', 'priorities.medicine.enabled': 'medicine rhythm on', 'priorities.chores.days': 'apartment days', 'priorities.chores.time': 'apartment time', 'priorities.chores.priority': 'apartment priority', 'priorities.chores.enabled': 'apartment rhythm on',
  'allowed.remove': 'an always-allowed action', 'watches.export.path': 'finished-work folder', 'watches.mail.unsub_threshold': 'messages per week before Omnii asks about unsubscribing', 'profile.name': 'your name', 'profile.timezone': 'your timezone', 'profile.writing': 'where your writing lives', 'profile.site': 'where your site lives', 'reach.handle': 'the number Omnii texts', 'mail.host': 'mail server', 'mail.user': 'mail address', 'mail.pass': 'mail app password',
};
