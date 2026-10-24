import { emit } from '../events/log.ts';
import { exists, readFm, writeFm } from './store.ts';

/** desk/allowed.md — things you told Omnii it may always do without asking. Each is narrow: one exact command, one folder, one person. Remove an entry and Omnii asks again. */
export type Rule = { tool: string; match: string; cwd?: string; label: string; added?: string };
const FILE = 'allowed.md';
const BODY = 'Things you told Omnii it may always do without asking. Remove an entry, here or on the Config page, and Omnii asks again.';

export const list = (): Rule[] => { const d = exists(FILE) ? readFm(FILE).data : {}; return Array.isArray(d.always) ? d.always : []; };
const same = (a: Rule, b: Rule) => a.tool === b.tool && a.match === b.match && (a.cwd ?? '') === (b.cwd ?? '');
export const has = (r: Rule) => list().some((x) => same(x, r));
export function add(r: Rule) {
  writeFm(FILE, { always: [...list().filter((x) => !same(x, r)), { ...r, added: new Date().toISOString().slice(0, 10) }] }, BODY);
  emit('allowed.added', 'loop', { tool: r.tool, label: r.label });
}
export function remove(i: number) {
  const rules = list(), [r] = rules.splice(i, 1);
  if (!r) throw new Error('no such entry');
  writeFm(FILE, { always: rules }, BODY);
  emit('allowed.removed', 'loop', { tool: r.tool, label: r.label });
  return r;
}
