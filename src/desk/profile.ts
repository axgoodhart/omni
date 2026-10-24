import { readFm, patchFm } from './store.ts';
import type { Surface } from '../interview/types.ts';

export type Profile = { name: string; timezone: string; writing: string; site: string };
const FILE = 'profile.md';

export function get(): Profile {
  const d = readFm(FILE).data;
  return { name: d.name ?? '', timezone: d.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, writing: d.writing ?? '', site: d.site ?? '' };
}
export const configured = () => !!readFm(FILE).data.name;

export const surface: Surface = {
  name: 'profile',
  questions: () => [
    { id: 'profile.name', surface: 'profile', kind: 'text', prompt: 'What should Omnii call you?', current: () => get().name || undefined },
    { id: 'profile.timezone', surface: 'profile', kind: 'text', prompt: 'What timezone are you in?', hint: 'e.g. America/Chicago. Rhythms and end-of-day follow this.', current: () => get().timezone },
    { id: 'profile.writing', surface: 'profile', kind: 'path', prompt: 'Where does your writing live?', hint: 'A folder path or a URL. Omnii reads it to learn how you sound before drafting anything as you.', optional: true, current: () => get().writing || undefined },
    { id: 'profile.site', surface: 'profile', kind: 'path', prompt: 'Where is your website kept?', hint: 'A folder on this machine. Changes Omnii proposes land in out/site, never here, until you say so.', optional: true, current: () => get().site || undefined },
  ],
  apply: (id, value) => { patchFm(FILE, { [id.split('.')[1]]: value }); },
};
