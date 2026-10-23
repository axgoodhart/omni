import fs from 'node:fs';
import path from 'node:path';
import { DESK_DIR } from '../config.ts';
import { emit } from '../events/log.ts';
import { parseFrontmatter, stringifyFrontmatter } from '../lib/frontmatter.ts';
import { inside } from '../memory/files.ts';

/** desk/ holds every file the loop reads and the user may edit. */
export const deskPath = (rel: string) => inside(DESK_DIR, rel);
export const exists = (rel: string) => fs.existsSync(deskPath(rel));
export function readRaw(rel: string) { return fs.existsSync(deskPath(rel)) ? fs.readFileSync(deskPath(rel), 'utf8') : ''; }
export function readFm(rel: string): { data: Record<string, any>; body: string } {
  const raw = readRaw(rel);
  return raw ? parseFrontmatter(raw) : { data: {}, body: '' };
}
const ownWrites = new Map<string, number>(); // files the daemon itself just wrote: no reload event for those
export function writeRaw(rel: string, text: string) {
  parseFrontmatter(text); // throws before writing
  const full = deskPath(rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  ownWrites.set(path.relative(DESK_DIR, full), Date.now());
  fs.writeFileSync(full, text);
}
export function writeFm(rel: string, data: Record<string, any>, body = '') {
  const clean = JSON.parse(JSON.stringify(data)); // drop undefined
  writeRaw(rel, stringifyFrontmatter(clean, body));
}
/** Merge a patch into a file's frontmatter, keeping its body. */
export function patchFm(rel: string, patch: Record<string, any>) {
  const { data, body } = readFm(rel);
  writeFm(rel, deepMerge(data, patch), body);
}
export function listDir(rel: string, ext = '.md') {
  const dir = deskPath(rel);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : [];
}
export const EDITABLE = ['profile.md', 'priorities.md', 'watches.md', 'observations.md', 'trust.md', 'interview.md'];

function deepMerge(a: any, b: any): any {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
  return out;
}

let watcher: fs.FSWatcher | null = null;
const listeners = new Set<(file: string) => void>();
export const onChange = (l: (file: string) => void) => { listeners.add(l); };
export function watch() {
  if (watcher) return;
  fs.mkdirSync(path.join(DESK_DIR, 'islands'), { recursive: true });
  const timers = new Map<string, NodeJS.Timeout>();
  watcher = fs.watch(DESK_DIR, { persistent: false, recursive: true }, (_ev, file) => {
    const f = String(file ?? '');
    if (!f.endsWith('.md')) return;
    clearTimeout(timers.get(f));
    timers.set(f, setTimeout(() => {
      if (Date.now() - (ownWrites.get(f) ?? 0) < 1500) return;
      emit('desk.reloaded', 'loop', { file: f }); for (const l of listeners) { try { l(f); } catch {} }
    }, 200));
  });
}
