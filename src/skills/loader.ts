import fs from 'node:fs';
import path from 'node:path';
import { SKILLS_PATH } from '../config.ts';
import { parseFrontmatter } from '../lib/frontmatter.ts';

export type Skill = { name: string; description: string; category: string; dir: string };

let cache: Skill[] | null = null;

function walk(dir: string, category: string, depth = 0): Skill[] {
  if (!fs.existsSync(dir)) return [];
  const out: Skill[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name), file = path.join(full, 'SKILL.md');
    if (fs.existsSync(file)) {
      try {
        const { data } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
        out.push({ name: String(data.name ?? e.name), description: String(data.description ?? ''), category, dir: full });
      } catch { out.push({ name: e.name, description: '', category, dir: full }); }
    } else if (depth < 1) out.push(...walk(full, category, depth + 1));
  }
  return out;
}

export function load(): Skill[] {
  if (!SKILLS_PATH) return (cache = []);
  cache = [...walk(path.join(SKILLS_PATH, 'public'), 'public'), ...walk(path.join(SKILLS_PATH, 'custom'), 'custom')]
    .sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}
export const all = () => cache ?? load();
export const get = (name: string) => all().find((s) => s.name === name);
export const pick = (sel: string[] | 'all' | 'none') => sel === 'none' ? [] : sel === 'all' ? all() : all().filter((s) => sel.includes(s.name));
export const readSkill = (name: string) => {
  const s = get(name);
  if (!s) throw new Error(`unknown skill "${name}"`);
  return { skill: s, text: fs.readFileSync(path.join(s.dir, 'SKILL.md'), 'utf8'), files: fs.readdirSync(s.dir) };
};
