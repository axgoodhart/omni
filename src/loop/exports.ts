import fs from 'node:fs';
import { emit } from '../events/log.ts';
import * as checkins from '../desk/checkins.ts';
import * as watches from '../desk/watches.ts';

/** Scan the export folder each tick; anything unseen is a candidate finished piece. Nothing is ever moved. */
export function scan(): { path: string; ok: boolean; fresh: string[]; error?: string } {
  const w = watches.get().export;
  if (!w.path) return { path: '', ok: false, fresh: [] };
  if (!fs.existsSync(w.path)) return { path: w.path, ok: false, fresh: [], error: 'folder not found' };
  const seen = new Set(w.seen);
  const fresh = watches.filesIn(w.path).filter((f) => !seen.has(f));
  if (fresh.length) emit('watch.export', 'loop', { fresh });
  return { path: w.path, ok: true, fresh };
}
/** Remember the files that have been asked about, so they're asked about once. */
export function markSeen(files: string[]) { if (files.length) watches.patch({ export: { seen: [...new Set([...watches.get().export.seen, ...files])] } }); }

/** Point the watch at a folder. What's already there counts as known, and questions still out about those files are filed; only files added later are asked about. */
export function setFolder(dir: string) {
  const there = watches.filesIn(dir);
  watches.patch({ export: { path: dir, seen: there } });
  const filed = checkins.live().filter((c) => c.dedupe?.startsWith('export:') && there.includes(c.dedupe.slice('export:'.length)));
  for (const c of filed) checkins.archive(c, 'already in the folder when it was set');
  emit('watch.export_set', 'loop', { path: dir, known: there.length, filed: filed.length });
  return { known: there.length, filed: filed.length };
}
