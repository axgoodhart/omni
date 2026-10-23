import { readFm, patchFm, exists, writeFm } from './store.ts';
import type { Surface } from '../interview/types.ts';

export type Level = 'top' | 'normal' | 'low';
export type Priorities = {
  defaults: { remind_after: string; end_of_day: string };
  medicine: { priority: Level; time: string; remind_after?: string; end_of_day?: string };
  chores: { priority: Level; days: string[]; time: string };
  islands: Record<string, Level>;
};
const FILE = 'priorities.md';
const LEVELS: Level[] = ['top', 'normal', 'low'];
const lvl = (v: any, d: Level): Level => (LEVELS.includes(v) ? v : d);
const SEED = `Priorities are yours. The loop reads them and never changes them.
top: it asks, comes back once after remind_after, archives the question at end_of_day.
normal: it asks once, archives after a day of silence.
low: it asks once, quietly, and archives after a day.`;

export function ensure() {
  if (!exists(FILE)) writeFm(FILE, { defaults: { remind_after: '90m', end_of_day: '21:00' }, medicine: { priority: 'top', time: '09:00' }, chores: { priority: 'low', days: ['sat'], time: '11:00' }, islands: {} }, SEED);
}
export function get(): Priorities {
  const d = readFm(FILE).data;
  return {
    defaults: { remind_after: d.defaults?.remind_after ?? '90m', end_of_day: d.defaults?.end_of_day ?? '21:00' },
    medicine: { priority: lvl(d.medicine?.priority, 'top'), time: d.medicine?.time ?? '09:00', remind_after: d.medicine?.remind_after, end_of_day: d.medicine?.end_of_day },
    chores: { priority: lvl(d.chores?.priority, 'low'), days: Array.isArray(d.chores?.days) ? d.chores.days.map((x: string) => String(x).slice(0, 3).toLowerCase()) : [], time: d.chores?.time ?? '11:00' },
    islands: Object.fromEntries(Object.entries(d.islands ?? {}).map(([k, v]) => [k, lvl(v, 'normal')])),
  };
}
export const ofIsland = (slug: string): Level => get().islands[slug] ?? 'normal';
export function setIsland(slug: string, level: Level) { ensure(); patchFm(FILE, { islands: { [slug]: level } }); }

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const surface: Surface = {
  name: 'priorities',
  questions: () => [
    { id: 'rhythm.medicine_time', surface: 'priorities', kind: 'time', prompt: 'What time do you take your medicine?', hint: 'If it is not logged by then, I ask. Medicine is top priority unless you change priorities.md.', current: () => get().medicine.time },
    { id: 'rhythm.chores_days', surface: 'priorities', kind: 'text', prompt: 'Which days are for the apartment?', hint: 'e.g. sat, or tue thu. A quiet nudge, never a chase.', optional: true, current: () => get().chores.days.join(', ') || undefined },
  ],
  apply: (id, value) => {
    ensure();
    if (id === 'rhythm.medicine_time') patchFm(FILE, { medicine: { time: normTime(value) } });
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
