import { readFm, patchFm, exists, writeFm } from './store.ts';
import { LOOP_INTERVAL_MIN } from '../config.ts';
import { hmToMinutes, parts } from '../lib/time.ts';
import { LEVELS, type Level } from './priorities.ts';
import * as islands from './islands.ts';
import * as profile from './profile.ts';

/** desk/loop.md — how the loop behaves. Every line on the Config page is a field here. The loop never writes this file. */
export type Via = 'desk' | 'phone' | 'both';
export type LevelRule = { via: Via; first_after: string; first_times: number; second_after: string; second_via: Via; second_times: number; second_snooze: string; stop: boolean; stop_text: boolean };
export type LoopCfg = {
  every_min: number; paused: boolean; notify: boolean; notify_levels: Level[]; days: boolean[]; area: string;
  quiet: { from: string; to: string; days: boolean[] } | null; max_open: number; via: Via;
  levels: { high: LevelRule; medium: LevelRule; low: LevelRule };
};
const FILE = 'loop.md';
export const VIA: Via[] = ['desk', 'phone', 'both'];
export const LEVEL_DEFAULTS: LoopCfg['levels'] = {
  high: { via: 'both', first_after: '15m', first_times: 2, second_after: '90m', second_via: 'both', second_times: 2, second_snooze: '90m', stop: true, stop_text: true },
  medium: { via: 'desk', first_after: '120m', first_times: 2, second_after: '1d', second_via: 'desk', second_times: 2, second_snooze: '1d', stop: true, stop_text: false },
  low: { via: 'desk', first_after: '1d', first_times: 2, second_after: '1w', second_via: 'desk', second_times: 2, second_snooze: '1w', stop: true, stop_text: false },
};
export const SEED = `How Omnii behaves. Change a value here or on the Config page and Omnii follows it on its next scan. Omnii never edits this file.

every_min: how often Omnii scans.
notify: false keeps scanning and recording, but sends no notifications.
notify_levels: which priorities may send notifications.
days: reminder days, seven booleans from Sunday through Saturday.
area: all, or an island kind.
quiet: the complement of Available Hours. days selects the available days, Sunday through Saturday.
via: where questions may reach you at all: desk, phone or both.
max_open: how many questions may be out to you at once.
levels: for each priority, what happens when you don't answer.
  via: where that priority's questions go. It can narrow the overall via, never widen it.
  first_after / first_times: the quick nudges, 1 to 9.
  second_after: the wait before the first secondary nudge.
  second_times: secondary nudges, 0 to 9; zero skips the secondary.
  second_via / second_snooze: secondary channels and the wait between secondary nudges.
  stop: true files the question as unanswered after the slower nudges; false keeps nudging at the slower pace.
  stop_text: true also texts you that it was filed; false only writes it in the log.`;

export function ensure() {
  if (!exists(FILE)) writeFm(FILE, { every_min: LOOP_INTERVAL_MIN, paused: false, notify: true, notify_levels: LEVELS, days: Array(7).fill(true), area: 'all', quiet: { from: '22:00', to: '08:00', days: Array(7).fill(true) }, max_open: 1, via: 'both', levels: LEVEL_DEFAULTS }, SEED);
}
const times = (v: any, def: number, min = 1) => (v != null && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= 9 ? Number(v) : def);
export const days = (v: unknown): boolean[] => Array.isArray(v) && v.length === 7 && v.every((d) => typeof d === 'boolean') ? [...v] : Array(7).fill(true);
const rule = (d: any, def: LevelRule): LevelRule => ({
  via: VIA.includes(d?.via) ? d.via : def.via,
  first_after: String(d?.first_after ?? def.first_after), first_times: times(d?.first_times, def.first_times),
  second_after: String(d?.second_after ?? def.second_after), second_times: times(d?.second_times, def.second_times, 0), // 0: straight from the quick nudges to filing
  second_via: VIA.includes(d?.second_via) ? d.second_via : VIA.includes(d?.via) ? d.via : def.second_via,
  second_snooze: String(d?.second_snooze ?? d?.second_after ?? def.second_snooze),
  stop: d?.stop ?? def.stop, stop_text: d?.stop_text ?? def.stop_text,
});
export function get(): LoopCfg {
  const d = readFm(FILE).data;
  return {
    every_min: Math.max(1, Math.min(120, Number(d.every_min ?? LOOP_INTERVAL_MIN) || LOOP_INTERVAL_MIN)),
    paused: !!d.paused,
    notify: d.notify !== false,
    notify_levels: Array.isArray(d.notify_levels) && d.notify_levels.some((l: Level) => LEVELS.includes(l)) ? LEVELS.filter((l) => d.notify_levels.includes(l)) : [...LEVELS],
    days: days(d.days),
    area: typeof d.area === 'string' && (d.area === 'all' || islands.KINDS.includes(d.area as islands.Kind)) ? d.area : 'all',
    quiet: d.quiet && d.quiet.from && d.quiet.to ? { from: String(d.quiet.from), to: String(d.quiet.to), days: days(d.quiet.days) } : null,
    max_open: Math.max(1, Math.min(5, Number(d.max_open ?? 1) || 1)),
    via: VIA.includes(d.via) ? d.via : d.ask?.text === false ? 'desk' : 'both', // ask.text: the older name
    levels: { high: rule(d.levels?.high ?? d.levels?.top, LEVEL_DEFAULTS.high), medium: rule(d.levels?.medium ?? d.levels?.normal, LEVEL_DEFAULTS.medium), low: rule(d.levels?.low, LEVEL_DEFAULTS.low) }, // top/normal: the older names
  };
}
export const patch = (p: Record<string, any>) => { ensure(); patchFm(FILE, p); };

const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** Whether this reminder is included, independently of its delivery channel. */
export function included(cfg: LoopCfg, level: Level, island: string | null = null, tz = profile.get().timezone) {
  return cfg.notify && cfg.notify_levels.includes(level) && cfg.days[WEEK.indexOf(parts(tz).weekday)] && (cfg.area === 'all' || (island != null && islands.get(island)?.kind === cfg.area));
}
/** Quiet hours and available days share one schedule; a finite hold is rechecked before delivery. */
export function quietEnds(cfg: LoopCfg, tz: string): number | null {
  if (!cfg.quiet) return null;
  const stamp = Date.now(), now = parts(tz), from = hmToMinutes(cfg.quiet.from), to = hmToMinutes(cfg.quiet.to), m = now.minutes;
  const inQuiet = from === to ? false : from < to ? m >= from && m < to : m >= from || m < to;
  const today = WEEK.indexOf(now.weekday);
  if (!inQuiet && cfg.quiet.days[today]) return null;
  for (let offset = 0; offset <= 7; offset++) {
    if (!cfg.quiet.days[(today + offset) % 7]) continue;
    const start = from === to || (from > 0 && from < to && offset > 0) ? 0 : to;
    const minutes = offset * 1440 + start - m;
    if (minutes > 0) return stamp + minutes * 60_000;
  }
  return stamp + 8 * 86_400_000;
}
/** Where an included question goes; unavailable texting falls back to the desk. */
export function reach(cfg: LoopCfg, level: Level, canText: boolean, island: string | null = null, secondary = false) {
  if (!included(cfg, level, island)) return { phone: false, desk: false };
  const has = (v: Via, w: 'desk' | 'phone') => v === 'both' || v === w;
  const L = secondary ? cfg.levels[level].second_via : cfg.levels[level].via;
  const phone = canText && has(cfg.via, 'phone') && has(L, 'phone');
  return { phone, desk: !phone || (has(cfg.via, 'desk') && has(L, 'desk')) };
}
/** "Remind me at end of day": an hour before quiet hours start, or 21:00 without them. */
export function endOfDay(cfg: LoopCfg) {
  if (!cfg.quiet) return '21:00';
  const m = (hmToMinutes(cfg.quiet.from) + 1380) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
