import { listDir, readFm, writeFm, deskPath } from './store.ts';
import * as priorities from './priorities.ts';
import type { Surface } from '../interview/types.ts';
import fs from 'node:fs';

/** The kinds of thing that can sit on the plate; each has an icon on the desk. */
export const KINDS = ['make', 'research', 'build', 'story', 'grow', 'open'] as const;
export type Kind = typeof KINDS[number];
const TRACK_LEN: Record<string, number> = { make: 5, research: 5, build: 5, story: 5, grow: 4, open: 3 }; // older files kept a stage out of this many
export type Island = { slug: string; name: string; kind: Kind; progress: number; position: string; status: string; files: string[]; notes: string; updated: number };

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'island';
export const clampProgress = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
/** The word for a progress number. */
export const position = (p: number) => (p <= 0 ? 'not started' : p >= 100 ? 'finished' : 'in progress');
const legacyProgress = (d: any, kind: string) => d.position === 'done' || d.position === 'finished, not shared' ? 100 : d.position === 'not started' ? 0 : Math.round((Number(d.stage ?? 0) / (TRACK_LEN[kind] - 1)) * 100);

export function list(): Island[] {
  return listDir('islands').map((f) => get(f.slice(0, -3))).filter(Boolean) as Island[];
}
export function get(slug: string): Island | null {
  const rel = `islands/${slug}.md`;
  if (!fs.existsSync(deskPath(rel))) return null;
  const { data: d, body } = readFm(rel);
  const kind: Kind = KINDS.includes(d.kind) ? d.kind : 'open';
  const progress = clampProgress(d.progress ?? legacyProgress(d, kind));
  return { slug, name: d.name ?? slug, kind, progress, position: position(progress), status: d.status ?? '', files: Array.isArray(d.files) ? d.files : [], notes: body, updated: fs.statSync(deskPath(rel)).mtimeMs };
}
export function upsert(slug: string, patch: Partial<Pick<Island, 'name' | 'kind' | 'progress' | 'status' | 'files'>> & { notes?: string }) {
  const cur = get(slug);
  const data = { name: patch.name ?? cur?.name ?? slug, kind: patch.kind ?? cur?.kind ?? 'open', progress: clampProgress(patch.progress ?? cur?.progress ?? 0), status: patch.status ?? cur?.status ?? '', files: patch.files ?? cur?.files ?? [] };
  writeFm(`islands/${slug}.md`, data, patch.notes ?? cur?.notes ?? '');
  return get(slug)!;
}
export const setStatus = (slug: string, status: string) => upsert(slug, { status });
export const forFile = (file: string) => list().find((i) => i.files.includes(file)) ?? null;

let draft: { slug?: string } = {};
export const surface: Surface = {
  name: 'islands',
  questions: () => [
    { id: 'island.name', surface: 'islands', group: 'island', loop: { exit: ["that's all", 'thats all', 'done', 'none', ''] }, kind: 'text', optional: true,
      prompt: "What's something you're working on, have finished, or keep avoiding?", hint: `Each one becomes a place on the desk. Say "that's all" when the plate is full.${list().length ? ` Already here: ${list().map((i) => i.name).join(', ')}.` : ''}` },
    { id: 'island.kind', surface: 'islands', group: 'island', kind: 'choice', prompt: 'What kind of thing is it?', options: KINDS.map((k) => ({ value: k, label: k })) },
    { id: 'island.priority', surface: 'islands', group: 'island', kind: 'choice', prompt: 'How hard should Omnii hold onto questions about it?', hint: 'high: quick nudges, then slower ones, and a text. medium: nudges on the desk only. low: a quiet ask.', options: [{ value: 'medium', label: 'medium' }, { value: 'high', label: 'high' }, { value: 'low', label: 'low' }] },
  ],
  apply: (id, value) => {
    if (id === 'island.name') { draft = { slug: slugify(value) }; upsert(draft.slug!, { name: value.trim() }); return; }
    if (!draft.slug) return;
    if (id === 'island.kind') upsert(draft.slug, { kind: value as Kind });
    if (id === 'island.priority') { priorities.setIsland(draft.slug, value as any); draft = {}; }
  },
};
