import fs from 'node:fs';
import path from 'node:path';
import { LOGBOOK_DIR } from '../config.ts';
import { emit } from '../events/log.ts';
import { parts } from '../lib/time.ts';

/** data/logbook/<kind>.log — one line per entry: ISO time, tab, how it was logged. Plain text on purpose. */
const file = (kind: string) => path.join(LOGBOOK_DIR, `${kind.replace(/[^a-z0-9_-]/gi, '')}.log`);

export function add(kind: string, via: string) {
  fs.mkdirSync(LOGBOOK_DIR, { recursive: true });
  fs.appendFileSync(file(kind), `${new Date().toISOString()}\t${via}\n`);
  emit('logbook', 'loop', { kind, via });
}
export function entries(kind: string): { ts: number; via: string }[] {
  if (!fs.existsSync(file(kind))) return [];
  return fs.readFileSync(file(kind), 'utf8').split('\n').filter(Boolean).map((l) => { const [iso, via] = l.split('\t'); return { ts: Date.parse(iso), via: via ?? '' }; });
}
export const loggedOn = (kind: string, tz: string, date = parts(tz).date) => entries(kind).some((e) => parts(tz, new Date(e.ts)).date === date);
export const last = (kind: string) => entries(kind).at(-1) ?? null;
