import fs from 'node:fs';
import path from 'node:path';
import { emit } from '../events/log.ts';
import * as watches from '../desk/watches.ts';

/** Scan the export folder each tick; anything unseen is a candidate finished piece. Nothing is ever moved. */
export function scan(): { path: string; ok: boolean; fresh: string[]; error?: string } {
  const w = watches.get().export;
  if (!w.path) return { path: '', ok: false, fresh: [] };
  if (!fs.existsSync(w.path)) return { path: w.path, ok: false, fresh: [], error: 'folder not found' };
  const seen = new Set(w.seen);
  const names = fs.readdirSync(w.path).filter((f) => !f.startsWith('.') && fs.statSync(path.join(w.path, f)).isFile()).sort();
  const fresh = names.filter((f) => !seen.has(f));
  if (fresh.length) emit('watch.export', 'loop', { fresh });
  return { path: w.path, ok: true, fresh };
}
/** Remember the files that have been asked about, so they're asked about once. */
export function markSeen(files: string[]) { if (files.length) watches.patch({ export: { seen: [...new Set([...watches.get().export.seen, ...files])] } }); }
