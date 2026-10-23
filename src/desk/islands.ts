import { listDir, readFm, writeFm, deskPath } from './store.ts';
import * as priorities from './priorities.ts';
import type { Surface } from '../interview/types.ts';
import fs from 'node:fs';

/** Stage tracks per kind, after Worlddesk. */
export const KINDS: Record<string, string[]> = {
  make: ['Sketch', 'Make', 'Refine', 'Finish', 'Share'],
  research: ['Question', 'Gather', 'Analyze', 'Write', 'Share'],
  build: ['Spec', 'Prototype', 'Build', 'Test', 'Ship'],
  story: ['Outline', 'Draft', 'Revise', 'Polish', 'Release'],
  grow: ['Plan', 'Start', 'Tend', 'Harvest'],
  open: ['Begin', 'Middle', 'End'],
};
export const POSITIONS = ['not started', 'in progress', 'finished, not shared', 'ongoing', 'done'] as const;
export type Position = typeof POSITIONS[number];
export type Island = { slug: string; name: string; kind: string; stages: string[]; stage: number; position: Position; status: string; files: string[]; notes: string; updated: number };

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'island';

export function list(): Island[] {
  return listDir('islands').map((f) => get(f.slice(0, -3))).filter(Boolean) as Island[];
}
export function get(slug: string): Island | null {
  const rel = `islands/${slug}.md`;
  if (!fs.existsSync(deskPath(rel))) return null;
  const { data: d, body } = readFm(rel);
  const kind = KINDS[d.kind] ? d.kind : 'open';
  return { slug, name: d.name ?? slug, kind, stages: KINDS[kind], stage: Math.min(Number(d.stage ?? 0), KINDS[kind].length - 1), position: POSITIONS.includes(d.position) ? d.position : 'in progress', status: d.status ?? '', files: Array.isArray(d.files) ? d.files : [], notes: body, updated: fs.statSync(deskPath(rel)).mtimeMs };
}
export function upsert(slug: string, patch: Partial<Omit<Island, 'slug' | 'stages' | 'updated' | 'notes'>> & { notes?: string }) {
  const cur = get(slug);
  const data = { name: patch.name ?? cur?.name ?? slug, kind: patch.kind ?? cur?.kind ?? 'open', stage: patch.stage ?? cur?.stage ?? 0, position: patch.position ?? cur?.position ?? 'in progress', status: patch.status ?? cur?.status ?? '', files: patch.files ?? cur?.files ?? [] };
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
    { id: 'island.kind', surface: 'islands', group: 'island', kind: 'choice', prompt: 'What kind of thing is it?', options: Object.entries(KINDS).map(([k, st]) => ({ value: k, label: `${k} · ${st.join(' → ')}` })) },
    { id: 'island.position', surface: 'islands', group: 'island', kind: 'choice', prompt: 'Where does it stand?', options: POSITIONS.map((p) => ({ value: p, label: p })) },
    { id: 'island.priority', surface: 'islands', group: 'island', kind: 'choice', prompt: 'How hard should I hold onto questions about it?', hint: 'top: I come back once, then archive at end of day. normal: one ask, archived after a day. low: one quiet ask.', options: [{ value: 'normal', label: 'normal' }, { value: 'top', label: 'top' }, { value: 'low', label: 'low' }] },
  ],
  apply: (id, value) => {
    if (id === 'island.name') { draft = { slug: slugify(value) }; upsert(draft.slug!, { name: value.trim() }); return; }
    if (!draft.slug) return;
    if (id === 'island.kind') upsert(draft.slug, { kind: value });
    if (id === 'island.position') { const i = upsert(draft.slug, { position: value as Position }); if (value === 'finished, not shared') upsert(draft.slug, { stage: i.stages.length - 2 }); if (value === 'done') upsert(draft.slug, { stage: i.stages.length - 1 }); }
    if (id === 'island.priority') { priorities.setIsland(draft.slug, value as any); draft = {}; }
  },
};
