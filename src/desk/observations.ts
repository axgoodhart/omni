import { readRaw, writeRaw, exists } from './store.ts';
import { emit } from '../events/log.ts';
import type { Surface } from '../interview/types.ts';

const FILE = 'observations.md';
const HEAD = `---\nabout: notes the loop keeps about you, one per line, with where each came from\n---\n\nStrike any line. Nothing here changes a priority; it only shapes how things are arranged and phrased.\n\n`;
export function ensure() { if (!exists(FILE)) writeRaw(FILE, HEAD); }
export function list(): { date: string; source: string; text: string }[] {
  return readRaw(FILE).split('\n').filter((l) => l.startsWith('- ')).map((l) => { const m = /^- (\S+) · ([^·]+) · (.*)$/.exec(l); return m ? { date: m[1], source: m[2].trim(), text: m[3] } : { date: '', source: '', text: l.slice(2) }; });
}
export const has = (text: string) => list().some((o) => o.text === text);
export function add(text: string, source: string, date: string) {
  ensure();
  if (has(text)) return false;
  writeRaw(FILE, `${readRaw(FILE).trimEnd()}\n- ${date} · ${source} · ${text}\n`);
  emit('observation', 'loop', { text, source });
  return true;
}
export const surface: Surface = {
  name: 'observations',
  questions: () => [{ id: 'observations.note', surface: 'observations', kind: 'statement', prompt: 'Omnii will keep notes about you in desk/observations.md.', hint: 'Things like when you tend to answer, or what you leave for Sundays. You can read every line and strike any of them. They never change a priority.' }],
  apply: () => ensure(),
};
