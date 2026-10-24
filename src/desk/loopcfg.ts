import { readFm, patchFm, exists, writeFm } from './store.ts';
import { LOOP_INTERVAL_MIN } from '../config.ts';
import { hmToMinutes } from '../lib/time.ts';
import type { Level } from './priorities.ts';

/** desk/loop.md — how the loop behaves. Every line on the Config page is a field here. The loop never writes this file. */
export type Via = 'desk' | 'phone' | 'both';
export type LevelRule = { via: Via; first_after: string; first_times: number; second_after: string; second_times: number; stop: boolean; stop_text: boolean };
export type LoopCfg = {
  every_min: number; paused: boolean; quiet: { from: string; to: string } | null; max_open: number; via: Via;
  levels: { top: LevelRule; normal: LevelRule; low: LevelRule };
};
const FILE = 'loop.md';
export const VIA: Via[] = ['desk', 'phone', 'both'];
export const LEVEL_DEFAULTS: LoopCfg['levels'] = {
  top: { via: 'both', first_after: '15m', first_times: 2, second_after: '90m', second_times: 2, stop: true, stop_text: true },
  normal: { via: 'desk', first_after: '120m', first_times: 2, second_after: '1d', second_times: 2, stop: true, stop_text: false },
  low: { via: 'desk', first_after: '1d', first_times: 2, second_after: '1w', second_times: 2, stop: true, stop_text: false },
};
export const SEED = `How Omnii behaves. Change a value here or on the Config page and Omnii follows it on its next look. Omnii never edits this file.

every_min: how often Omnii looks.
quiet: Omnii doesn't text between these hours. Nothing is nudged or filed until they end.
via: where questions may reach you at all: desk, phone or both.
max_open: how many questions may be out to you at once.
levels: for each priority, what happens when you don't answer.
  via: where that priority's questions go. It can narrow the overall via, never widen it.
  first_after / first_times: the quick nudges.
  second_after / second_times: the slower nudges that follow.
  stop: true files the question as unanswered after the slower nudges; false keeps nudging at the slower pace.
  stop_text: true also texts you that it was filed; false only writes it in the log.`;

export function ensure() {
  if (!exists(FILE)) writeFm(FILE, { every_min: LOOP_INTERVAL_MIN, paused: false, quiet: { from: '22:00', to: '08:00' }, max_open: 1, via: 'both', levels: LEVEL_DEFAULTS }, SEED);
}
const times = (v: any, def: number) => ([1, 2, 3].includes(Number(v)) ? Number(v) : def);
const rule = (d: any, def: LevelRule): LevelRule => ({
  via: VIA.includes(d?.via) ? d.via : def.via,
  first_after: String(d?.first_after ?? def.first_after), first_times: times(d?.first_times, def.first_times),
  second_after: String(d?.second_after ?? def.second_after), second_times: times(d?.second_times, def.second_times),
  stop: d?.stop ?? def.stop, stop_text: d?.stop_text ?? def.stop_text,
});
export function get(): LoopCfg {
  const d = readFm(FILE).data;
  return {
    every_min: Math.max(1, Math.min(120, Number(d.every_min ?? LOOP_INTERVAL_MIN) || LOOP_INTERVAL_MIN)),
    paused: !!d.paused,
    quiet: d.quiet && d.quiet.from && d.quiet.to ? { from: String(d.quiet.from), to: String(d.quiet.to) } : null,
    max_open: Math.max(1, Math.min(5, Number(d.max_open ?? 1) || 1)),
    via: VIA.includes(d.via) ? d.via : d.ask?.text === false ? 'desk' : 'both', // ask.text: the older name
    levels: { top: rule(d.levels?.top, LEVEL_DEFAULTS.top), normal: rule(d.levels?.normal, LEVEL_DEFAULTS.normal), low: rule(d.levels?.low, LEVEL_DEFAULTS.low) },
  };
}
export const patch = (p: Record<string, any>) => { ensure(); patchFm(FILE, p); };

/** Where a priority's questions go: the overall via narrowed by the priority's own. Never nowhere: falls back to the desk. */
export function reach(cfg: LoopCfg, level: Level, canText: boolean) {
  const has = (v: Via, w: 'desk' | 'phone') => v === 'both' || v === w;
  const L = cfg.levels[level].via;
  const phone = canText && has(cfg.via, 'phone') && has(L, 'phone');
  return { phone, desk: !phone || (has(cfg.via, 'desk') && has(L, 'desk')) };
}
/** "Remind me at end of day": an hour before quiet hours start, or 21:00 without them. */
export function endOfDay(cfg: LoopCfg) {
  if (!cfg.quiet) return '21:00';
  const m = (hmToMinutes(cfg.quiet.from) + 1380) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
