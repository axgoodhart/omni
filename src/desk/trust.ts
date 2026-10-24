import { readFm, writeFm, exists } from './store.ts';
import type { Surface } from '../interview/types.ts';

export const DOMAINS = ['mail', 'site', 'submissions'] as const;
export type Domain = typeof DOMAINS[number];
export type Setting = 'sandbox' | 'live';
const FILE = 'trust.md';
export function ensure() { if (!exists(FILE)) writeFm(FILE, Object.fromEntries(DOMAINS.map((d) => [d, 'sandbox'])), 'sandbox: anything the loop would send or publish in this domain is written to out/<domain>/ for you to read. live: a real connector (none exist yet). Only you edit this file.'); }
export function get(): Record<Domain, Setting> {
  const d = readFm(FILE).data;
  return Object.fromEntries(DOMAINS.map((k) => [k, d[k] === 'live' ? 'live' : 'sandbox'])) as Record<Domain, Setting>;
}
export const of = (domain: Domain): Setting => get()[domain];
export const surface: Surface = {
  name: 'trust',
  questions: () => [{ id: 'trust.note', surface: 'trust', kind: 'statement', prompt: 'Nothing leaves this machine in your name.', hint: 'Every reply, unsubscribe, site change or submission Omnii drafts is written to the out/ folder. desk/trust.md is the dial, and it starts at sandbox for everything.' }],
  apply: () => ensure(),
};
