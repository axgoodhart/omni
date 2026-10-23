import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from '../config.ts';
import { emit } from '../events/log.ts';
import { inside } from '../memory/files.ts';
import * as trust from './trust.ts';
import type { Domain } from './trust.ts';

/** The only path by which anything "leaves" in the user's name. Sandbox = a file in out/<domain>/. */
export function deliver(domain: Domain, name: string, content: string, by: string) {
  if (!trust.DOMAINS.includes(domain)) throw new Error(`unknown domain "${domain}"; have ${trust.DOMAINS.join(', ')}`);
  if (trust.of(domain) === 'live') throw new Error(`trust for ${domain} is "live" but no live connector exists yet; set it back to sandbox in desk/trust.md`);
  const safe = name.replace(/[^a-z0-9._ -]/gi, '-').replace(/^\.+/, '').slice(0, 120) || `${Date.now()}.md`;
  const full = inside(path.join(OUT_DIR, domain), safe);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  emit('out.written', 'loop', { domain, name: safe, bytes: content.length, by });
  return { domain, name: safe, path: full };
}
export function list(limit = 40) {
  const rows: { domain: string; name: string; mtime: number; bytes: number }[] = [];
  for (const d of trust.DOMAINS) {
    const dir = path.join(OUT_DIR, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) { if (f.startsWith('.')) continue; const st = fs.statSync(path.join(dir, f)); if (st.isFile()) rows.push({ domain: d, name: f, mtime: st.mtimeMs, bytes: st.size }); }
  }
  return rows.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}
export const read = (domain: string, name: string) => fs.readFileSync(inside(path.join(OUT_DIR, domain), name), 'utf8');
