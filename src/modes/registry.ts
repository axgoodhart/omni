import fs from 'node:fs';
import path from 'node:path';
import { MAX_STEPS, MODEL_MAIN, MODES_DIR } from '../config.ts';
import { emit } from '../events/log.ts';
import { parseFrontmatter, stringifyFrontmatter } from '../lib/frontmatter.ts';

export type Level = 'ask-always' | 'ask-destructive' | 'no-asking';
export type Override = 'allow' | 'ask' | 'deny';
export type Permissions = { mode: Level; blacklist: { paths: string[]; filetypes: string[] }; overrides: Record<string, Override> };
export type Schedule = { cron: string; prompt: string; cartridges?: string[]; deliver?: string; timezone?: string; light?: boolean };
export type Mode = {
  name: string; file: string; model: string; effort?: string; providerOptions: Record<string, any>;
  tools: string[] | null; permissions: Permissions; cartridges: string[]; skills: string[] | 'all' | 'none';
  schedules: Schedule[]; voice?: string; maxSteps: number; instructions: string;
};

const LEVELS: Level[] = ['ask-always', 'ask-destructive', 'no-asking'];
const modes = new Map<string, Mode>();
let watcher: fs.FSWatcher | null = null;

function normalize(name: string, file: string, d: Record<string, any>, body: string): Mode {
  const p = d.permissions ?? {};
  return {
    name, file,
    model: d.model ?? MODEL_MAIN,
    effort: d.effort,
    providerOptions: d.providerOptions ?? {},
    tools: Array.isArray(d.tools) ? d.tools : null,
    permissions: {
      mode: LEVELS.includes(p.mode) ? p.mode : 'ask-destructive',
      blacklist: { paths: p.blacklist?.paths ?? [], filetypes: p.blacklist?.filetypes ?? [] },
      overrides: p.overrides ?? {},
    },
    cartridges: d.cartridges ?? [],
    skills: d.skills ?? 'none',
    schedules: Array.isArray(d.schedules) ? d.schedules : [],
    voice: d.voice,
    maxSteps: Number(d.maxSteps ?? MAX_STEPS),
    instructions: body,
  };
}

export function load() {
  fs.mkdirSync(MODES_DIR, { recursive: true });
  modes.clear();
  for (const f of fs.readdirSync(MODES_DIR).filter((f) => f.endsWith('.md')).sort()) {
    const name = f.slice(0, -3);
    try {
      const { data, body } = parseFrontmatter(fs.readFileSync(path.join(MODES_DIR, f), 'utf8'));
      modes.set(name, normalize(name, f, data, body));
    } catch (e) { emit('mode.error', null, { name, error: (e as Error).message }); }
  }
  return names();
}

export function watch() {
  if (watcher) return;
  let timer: NodeJS.Timeout | null = null;
  watcher = fs.watch(MODES_DIR, { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => emit('mode.reloaded', null, { names: load() }), 150);
  });
}

export const names = () => [...modes.keys()];
export const list = () => [...modes.values()];
export function get(name: string): Mode {
  const m = modes.get(name);
  if (!m) throw new Error(`unknown mode "${name}"; have: ${names().join(', ') || 'none'}`);
  return m;
}
export const readRaw = (name: string) => fs.readFileSync(path.join(MODES_DIR, get(name).file), 'utf8');
export function readParsed(name: string) { return parseFrontmatter(readRaw(name)); }
export function writeParsed(name: string, data: Record<string, any>, body: string) {
  const clean = Object.fromEntries(Object.entries(data ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  fs.writeFileSync(path.join(MODES_DIR, `${name}.md`), stringifyFrontmatter(clean, body ?? ''));
  load();
}
export function writeRaw(name: string, text: string) {
  parseFrontmatter(text); // throws before anything is written
  fs.writeFileSync(path.join(MODES_DIR, `${name}.md`), text);
  load();
}
