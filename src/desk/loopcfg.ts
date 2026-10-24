import { readFm, patchFm, exists, writeFm } from './store.ts';
import { LOOP_INTERVAL_MIN } from '../config.ts';

/** desk/loop.md — how the loop behaves. Every sentence on the "What Omnii does" page is a field here. The loop never writes this file. */
export type LevelRule = { remind_after?: string; end_of_day?: string; file_after?: string; text: boolean };
export type LoopCfg = {
  every_min: number; paused: boolean; quiet: { from: string; to: string } | null; max_open: number; ask: { text: boolean };
  levels: { top: LevelRule; normal: LevelRule; low: LevelRule };
};
const FILE = 'loop.md';
const SEED = `How Omnii behaves. Change a number here or on the "What Omnii does" page and Omnii follows it on its next look. Omnii never edits this file.

every_min: how often Omnii looks. quiet: Omnii doesn't text between these hours; questions wait for the morning.
max_open: how many questions Omnii may have out to you at once. ask.text: whether a new question is also texted.
levels: what happens when you don't answer, by priority. remind_after / end_of_day for top; file_after for the others; text = whether that level texts at all.`;

export function ensure() {
  if (!exists(FILE)) writeFm(FILE, { every_min: LOOP_INTERVAL_MIN, paused: false, quiet: { from: '22:00', to: '08:00' }, max_open: 1, ask: { text: true },
    levels: { top: { remind_after: '90m', end_of_day: '21:00', text: true }, normal: { file_after: '1d', text: true }, low: { file_after: '1d', text: false } } }, SEED);
}
export function get(): LoopCfg {
  const d = readFm(FILE).data;
  const L = (k: 'top' | 'normal' | 'low', def: LevelRule): LevelRule => ({ ...def, ...(d.levels?.[k] ?? {}), text: d.levels?.[k]?.text ?? def.text });
  return {
    every_min: Math.max(1, Math.min(120, Number(d.every_min ?? LOOP_INTERVAL_MIN) || LOOP_INTERVAL_MIN)),
    paused: !!d.paused,
    quiet: d.quiet && d.quiet.from && d.quiet.to ? { from: String(d.quiet.from), to: String(d.quiet.to) } : null,
    max_open: Math.max(1, Number(d.max_open ?? 1) || 1),
    ask: { text: d.ask?.text ?? true },
    levels: { top: L('top', { remind_after: '90m', end_of_day: '21:00', text: true }), normal: L('normal', { file_after: '1d', text: true }), low: L('low', { file_after: '1d', text: false }) },
  };
}
export const patch = (p: Record<string, any>) => { ensure(); patchFm(FILE, p); };
