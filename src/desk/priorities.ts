import { readFm, patchFm, exists, writeFm } from './store.ts';
import type { Surface } from '../interview/types.ts';

export type Level = 'high' | 'medium' | 'low';
export type Priorities = {
  medicine: { priority: Level; time: string; enabled: boolean };
  chores: { priority: Level; days: string[]; time: string; enabled: boolean };
  islands: Record<string, Level>;
};
const FILE = 'priorities.md';
export const LEVELS: Level[] = ['high', 'medium', 'low'];
const LEGACY: Record<string, Level> = { top: 'high', normal: 'medium' }; // the older names
/** A level from any spelling, old names included. */
export const normLevel = (v: any, d: Level = 'medium'): Level => (LEVELS.includes(v) ? v : LEGACY[v] ?? d);
const lvl = normLevel;
function migrate() {
  const { data, body } = readFm(FILE), s = JSON.stringify(data);
  if (/"(top|normal)"/.test(s)) writeFm(FILE, JSON.parse(s.replace(/"top"/g, '"high"').replace(/"normal"/g, '"medium"')), body);
}
const SEED = `Priorities are yours. The loop reads them and never changes them.
Which priority each rhythm and island has, plus when the rhythms happen. What each priority means (reminders, filing) is in loop.md.`;

export function ensure() {
  if (!exists(FILE)) writeFm(FILE, { medicine: { priority: 'high', time: '09:00', enabled: true }, chores: { priority: 'low', days: ['sat'], time: '11:00', enabled: true }, islands: {} }, SEED);
  else migrate();
}
export function get(): Priorities {
  const d = readFm(FILE).data;
  return {
    medicine: { priority: lvl(d.medicine?.priority, 'high'), time: d.medicine?.time ?? '09:00', enabled: d.medicine?.enabled ?? true },
    chores: { priority: lvl(d.chores?.priority, 'low'), days: Array.isArray(d.chores?.days) ? d.chores.days.map((x: string) => String(x).slice(0, 3).toLowerCase()) : [], time: d.chores?.time ?? '11:00', enabled: d.chores?.enabled ?? true },
    islands: Object.fromEntries(Object.entries(d.islands ?? {}).map(([k, v]) => [k, lvl(v, 'medium')])),
  };
}
export const ofIsland = (slug: string): Level => get().islands[slug] ?? 'medium';
export function setIsland(slug: string, level: Level) { ensure(); patchFm(FILE, { islands: { [slug]: level } }); }
export const normTimeStr = (v: string) => normTime(v);

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const surface: Surface = {
  name: 'priorities',
  questions: () => [
    { id: 'rhythm.medicine_time', surface: 'priorities', kind: 'time', prompt: 'What time do you take your medicine?', hint: 'If it is not logged by then, Omnii asks. Medicine is high priority unless you change it on the Config page.', current: () => get().medicine.time },
    { id: 'rhythm.chores_days', surface: 'priorities', kind: 'text', prompt: 'Which days are for the apartment?', hint: 'e.g. sat, or tue thu. A quiet nudge, never a chase.', optional: true, current: () => get().chores.days.join(', ') || undefined },
  ],
  apply: (id, value) => {
    ensure();
    if (id === 'rhythm.medicine_time') patchFm(FILE, { medicine: { time: normTime(value) } });
    if (id === 'rhythm.chores_days' && !value.trim()) patchFm(FILE, { chores: { enabled: false } });
    if (id === 'rhythm.chores_days') patchFm(FILE, { chores: { days: value.toLowerCase().split(/[\s,]+/).map((x) => x.slice(0, 3)).filter((x) => DAYS.includes(x)) } });
  },
};
function normTime(v: string) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(v.trim());
  if (!m) return '09:00';
  let h = Number(m[1]); const mm = m[2] ?? '00';
  if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
  if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mm}`;
}
