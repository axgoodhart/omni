import fs from 'node:fs';
import path from 'node:path';

/** Resolves `rel` under `root` and refuses anything that escapes it. */
export function inside(root: string, rel = ''): string {
  const target = path.resolve(root, rel);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`path escapes ${path.basename(root)}: ${rel}`);
  return target;
}

export function listTree(root: string, ext = '.md'): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (!ext || e.name.endsWith(ext)) out.push(path.relative(root, full));
    }
  };
  walk(root);
  return out.sort();
}

export const read = (root: string, rel: string) => fs.readFileSync(inside(root, rel), 'utf8');
export function write(root: string, rel: string, content: string) {
  const full = inside(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
export function edit(root: string, rel: string, oldText: string, newText: string) {
  const full = inside(root, rel);
  const text = fs.readFileSync(full, 'utf8');
  const count = text.split(oldText).length - 1;
  if (count !== 1) throw new Error(`"old" must match exactly once, matched ${count} times`);
  fs.writeFileSync(full, text.replace(oldText, () => newText));
}
export const remove = (root: string, rel: string) => fs.rmSync(inside(root, rel));
export const exists = (root: string, rel: string) => fs.existsSync(inside(root, rel));
