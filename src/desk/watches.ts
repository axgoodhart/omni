import { readFm, patchFm, exists, writeFm } from './store.ts';
import { getEnv, setEnv } from './env.ts';
import type { Surface } from '../interview/types.ts';

export type Watches = { export: { path: string; seen: string[] }; mail: { since: number; lastCheck: number; ignore: string[]; lastError: string; unsub_threshold: number } };
const FILE = 'watches.md';
export function ensure() { if (!exists(FILE)) writeFm(FILE, { export: { path: '', seen: [] }, mail: { since: 0, lastCheck: 0, ignore: [] } }, 'What the loop watches, and how far it has read. Clear `seen` or `since` to make it look again.'); }
export function get(): Watches {
  const d = readFm(FILE).data;
  return { export: { path: d.export?.path ?? '', seen: Array.isArray(d.export?.seen) ? d.export.seen : [] }, mail: { since: Number(d.mail?.since ?? 0), lastCheck: Number(d.mail?.lastCheck ?? 0), ignore: Array.isArray(d.mail?.ignore) ? d.mail.ignore : [], lastError: d.mail?.lastError ?? '', unsub_threshold: Math.max(1, Number(d.mail?.unsub_threshold ?? 3) || 3) } };
}
export const patch = (p: Record<string, any>) => { ensure(); patchFm(FILE, p); };
export const mailConfigured = () => !!(getEnv('IMAP_HOST') && getEnv('IMAP_USER') && getEnv('IMAP_PASS'));

export const surface: Surface = {
  name: 'watches',
  questions: () => [
    { id: 'watch.export', surface: 'watches', kind: 'path', prompt: 'Where does finished work land?', hint: 'A folder. When something new appears there I ask what to do with it. Nothing in it is ever moved.', optional: true, current: () => get().export.path || undefined },
    { id: 'watch.mail_host', surface: 'watches', kind: 'text', prompt: 'Your mail server?', hint: 'IMAP host, e.g. imap.gmail.com or imap.fastmail.com. Leave blank to skip mail for now.', optional: true, current: () => getEnv('IMAP_HOST') || undefined },
    { id: 'watch.mail_user', surface: 'watches', kind: 'text', prompt: 'The address I read?', optional: true, current: () => getEnv('IMAP_USER') || undefined },
    { id: 'watch.mail_pass', surface: 'watches', kind: 'secret', prompt: 'An app password for it', hint: 'Goes to .env, never to a desk file. I only read. Replies and unsubscribes are written to out/mail for you to look at.', optional: true },
  ],
  apply: (id, value) => {
    ensure();
    if (id === 'watch.export') patch({ export: { path: value.trim().replace(/^~/, process.env.HOME ?? '~') } });
    if (id === 'watch.mail_host' && value) setEnv('IMAP_HOST', value.trim());
    if (id === 'watch.mail_user' && value) setEnv('IMAP_USER', value.trim());
    if (id === 'watch.mail_pass' && value) setEnv('IMAP_PASS', value);
  },
};
