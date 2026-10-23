import { emit } from '../events/log.ts';
import * as store from '../desk/store.ts';
import * as profile from '../desk/profile.ts';
import * as reach from '../desk/reach.ts';
import * as islands from '../desk/islands.ts';
import * as priorities from '../desk/priorities.ts';
import * as watches from '../desk/watches.ts';
import * as observations from '../desk/observations.ts';
import * as trust from '../desk/trust.ts';
import type { Question, Surface } from './types.ts';

/**
 * The interview is derived: each surface says what it needs to know, in this order. One question per screen.
 * Answers write straight into desk/ files (secrets into .env). State lives in desk/interview.md so it can be re-run.
 */
const SURFACES: Surface[] = [profile.surface, reach.surface, islands.surface, priorities.surface, watches.surface, observations.surface, trust.surface];
const FILE = 'interview.md';
type State = { started: number | null; finished: number | null; cursor: number; answers: Record<string, string> };

export const all = (): Question[] => SURFACES.flatMap((s) => s.questions());
const state = (): State => { const d = store.readFm(FILE).data; return { started: d.started ?? null, finished: d.finished ?? null, cursor: Number(d.cursor ?? 0), answers: d.answers ?? {} }; };
const save = (s: State) => store.writeFm(FILE, s, 'The interview, as answered. Re-run it from the desk any time; answers here prefill it.');

export const needed = () => !profile.configured();
export function current() {
  const qs = all(), s = state();
  const i = Math.min(s.cursor, qs.length);
  const q = qs[i];
  const view = q ? { ...q, current: undefined, prefill: q.kind === 'secret' ? undefined : s.answers[q.id] ?? q.current?.() } : null;
  return { needed: needed(), done: !q, index: i, total: qs.length, question: view, started: s.started, finished: s.finished, surfaces: SURFACES.map((x) => x.name) };
}
export function answer(id: string, value: string) {
  const qs = all(); let s = state();
  if (!s.started) s.started = Date.now();
  const i = qs.findIndex((q) => q.id === id);
  if (i < 0) throw new Error(`unknown question ${id}`);
  const q = qs[i], v = (value ?? '').trim();
  const exit = q.loop && q.loop.exit.includes(v.toLowerCase());
  if (!v && !q.optional && q.kind !== 'statement' && !exit) throw new Error('this one needs an answer');
  if (v && !exit && q.kind !== 'statement') { SURFACES.find((x) => x.name === q.surface)!.apply(q.id, v, s.answers); if (q.kind !== 'secret') s.answers[q.id] = v; }
  if (q.kind === 'statement') SURFACES.find((x) => x.name === q.surface)!.apply(q.id, '', s.answers);
  // where next: groups repeat until their first question gets an exit answer
  let next = i + 1;
  if (q.group) {
    const first = qs.findIndex((x) => x.group === q.group), lastIdx = qs.map((x) => x.group).lastIndexOf(q.group);
    if (i === first && (exit || !v)) next = lastIdx + 1;
    else if (i === lastIdx) next = first;
  }
  s.cursor = next;
  if (next >= qs.length) s.finished = Date.now();
  save(s);
  emit('interview.answered', 'loop', { id, group: q.group ?? null, secret: q.kind === 'secret', done: next >= qs.length });
  return current();
}
export function restart() { const s = state(); save({ ...s, cursor: 0, finished: null }); emit('interview.restarted', 'loop', {}); return current(); }
export function skipTo(index: number) { const s = state(); save({ ...s, cursor: Math.max(0, Math.min(index, all().length)) }); return current(); }
