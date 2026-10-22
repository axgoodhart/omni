import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CARTRIDGES_DIR } from '../config.ts';
import { parseFrontmatter, stringifyFrontmatter } from '../lib/frontmatter.ts';
import { listTree, read } from './files.ts';

export type Cartridge = { name: string; description: string; summary: string; dir: string; memoriesDir: string; files: string[] };

const indexes = new Map<string, Database.Database>();

export function list(): Cartridge[] {
  fs.mkdirSync(CARTRIDGES_DIR, { recursive: true });
  return fs.readdirSync(CARTRIDGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(CARTRIDGES_DIR, e.name, 'cartridge.md')))
    .map((e) => get(e.name));
}

export function get(name: string): Cartridge {
  const dir = path.join(CARTRIDGES_DIR, name);
  const file = path.join(dir, 'cartridge.md');
  if (!fs.existsSync(file)) throw new Error(`unknown cartridge "${name}"`);
  const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  const memoriesDir = path.join(dir, 'memories');
  fs.mkdirSync(memoriesDir, { recursive: true });
  return { name, description: data.description ?? '', summary: body, dir, memoriesDir, files: listTree(memoriesDir) };
}

export function create(name: string, description = '') {
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name)) throw new Error('cartridge names: letters, digits, - and _');
  const dir = path.join(CARTRIDGES_DIR, name);
  if (fs.existsSync(dir)) throw new Error(`cartridge "${name}" exists`);
  fs.mkdirSync(path.join(dir, 'memories'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cartridge.md'), stringifyFrontmatter({ name, description }, `Memories about: ${description || name}.`));
  return get(name);
}

function index(name: string): Database.Database {
  let db = indexes.get(name);
  if (!db) {
    db = new Database(path.join(get(name).dir, 'index.sqlite'));
    db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS mem USING fts5(path, body, tokenize="porter unicode61")');
    indexes.set(name, db);
  }
  return db;
}

export function rebuild(name: string) {
  const c = get(name), db = index(name);
  const ins = db.prepare('INSERT INTO mem (path, body) VALUES (?, ?)');
  db.transaction(() => {
    db.exec('DELETE FROM mem');
    for (const f of c.files) ins.run(f, read(c.memoriesDir, f));
  })();
  return c.files.length;
}

export function reindexFile(name: string, rel: string) {
  const c = get(name), db = index(name);
  db.prepare('DELETE FROM mem WHERE path = ?').run(rel);
  const full = path.join(c.memoriesDir, rel);
  if (fs.existsSync(full)) db.prepare('INSERT INTO mem (path, body) VALUES (?, ?)').run(rel, fs.readFileSync(full, 'utf8'));
}

export function search(names: string[], query: string, limit = 8) {
  const tokens = query.split(/\s+/).map((t) => t.replace(/["*]/g, '')).filter(Boolean);
  if (!tokens.length) return [];
  const q = (op: string) => tokens.map((t) => `"${t}"`).join(` ${op} `);
  const hits: { cartridge: string; path: string; snippet: string; rank: number }[] = [];
  for (const name of names) {
    const stmt = index(name).prepare('SELECT path, snippet(mem, 1, "[", "]", " … ", 24) AS snippet, bm25(mem) AS rank FROM mem WHERE mem MATCH ? ORDER BY rank LIMIT ?');
    let rows = stmt.all(q('AND'), limit) as any[];
    if (!rows.length) rows = stmt.all(q('OR'), limit) as any[];
    for (const r of rows) hits.push({ cartridge: name, ...r });
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

export const rebuildAll = () => Object.fromEntries(list().map((c) => [c.name, rebuild(c.name)]));
