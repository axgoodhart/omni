import { ImapFlow } from 'imapflow';
import { db } from '../db.ts';
import { IMAP_MAILBOX, IMAP_PORT } from '../config.ts';
import { emit } from '../events/log.ts';
import { getEnv } from '../desk/env.ts';
import * as watches from '../desk/watches.ts';

db.exec(`CREATE TABLE IF NOT EXISTS mail (
  uid INTEGER PRIMARY KEY, ts INTEGER NOT NULL, sender TEXT NOT NULL, sender_name TEXT, subject TEXT, list_unsub TEXT,
  verdict TEXT NOT NULL DEFAULT 'unsorted', reason TEXT, handled INTEGER NOT NULL DEFAULT 0, seen_at INTEGER NOT NULL);`);

export type Mail = { uid: number; ts: number; sender: string; senderName: string; subject: string; listUnsub: string | null; verdict: string; reason: string | null; handled: boolean };
const row = (r: any): Mail => ({ uid: r.uid, ts: r.ts, sender: r.sender, senderName: r.sender_name ?? '', subject: r.subject ?? '', listUnsub: r.list_unsub, verdict: r.verdict, reason: r.reason, handled: !!r.handled });
const q = {
  ins: db.prepare('INSERT OR IGNORE INTO mail (uid, ts, sender, sender_name, subject, list_unsub, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  verdict: db.prepare('UPDATE mail SET verdict = ?, reason = ? WHERE uid = ?'),
  handled: db.prepare('UPDATE mail SET handled = 1 WHERE uid = ?'),
  unsorted: db.prepare("SELECT * FROM mail WHERE verdict = 'unsorted' ORDER BY uid DESC LIMIT 40"),
  needsYou: db.prepare("SELECT * FROM mail WHERE verdict = 'needs_you' AND handled = 0 ORDER BY ts DESC LIMIT 30"),
  week: db.prepare('SELECT sender, sender_name, list_unsub, COUNT(*) AS n FROM mail WHERE ts > ? AND list_unsub IS NOT NULL GROUP BY sender HAVING n >= ? ORDER BY n DESC'),
  recent: db.prepare('SELECT * FROM mail ORDER BY ts DESC LIMIT ?'),
  get: db.prepare('SELECT * FROM mail WHERE uid = ?'),
};
export const unsorted = (): Mail[] => (q.unsorted.all() as any[]).map(row);
export const needsYou = (): Mail[] => (q.needsYou.all() as any[]).map(row);
export const recent = (n = 30): Mail[] => (q.recent.all(n) as any[]).map(row);
export const get = (uid: number): Mail | null => { const r = q.get.get(uid); return r ? row(r) : null; };
export const setVerdict = (uid: number, verdict: string, reason: string) => { q.verdict.run(verdict, reason, uid); };
export const markHandled = (uid: number) => { q.handled.run(uid); emit('mail.handled', 'loop', { uid }); };
/** Senders with List-Unsubscribe and >= threshold messages this week, minus the ignore list. */
export const unsubscribeCandidates = (threshold = 3) => {
  const ignore = new Set(watches.get().mail.ignore);
  return (q.week.all(Date.now() - 7 * 86_400_000, threshold) as any[]).filter((r) => !ignore.has(r.sender)).map((r) => ({ sender: r.sender as string, name: (r.sender_name ?? '') as string, listUnsub: r.list_unsub as string, n: r.n as number }));
};

/** Read new messages since the stored UID. Envelope and List-Unsubscribe only; bodies stay on the server. */
export async function fetchNew(): Promise<{ fresh: Mail[]; error?: string }> {
  const host = getEnv('IMAP_HOST'), user = getEnv('IMAP_USER'), pass = getEnv('IMAP_PASS');
  if (!host || !user || !pass) return { fresh: [] };
  const client = new ImapFlow({ host, port: IMAP_PORT, secure: true, auth: { user, pass }, logger: false });
  const fresh: Mail[] = [];
  let since = watches.get().mail.since;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(IMAP_MAILBOX);
    try {
      const exists = (client.mailbox && typeof client.mailbox === 'object' ? client.mailbox.exists : 0) ?? 0;
      const range = since ? `${since + 1}:*` : `${Math.max(1, exists - 29)}:*`;
      for await (const m of client.fetch(range, { uid: true, envelope: true, headers: ['list-unsubscribe'] }, since ? { uid: true } : {})) {
        if (m.uid <= since) continue;
        const from = m.envelope?.from?.[0];
        const sender = (from?.address ?? '').toLowerCase();
        const headers = m.headers ? m.headers.toString() : '';
        const lu = /^list-unsubscribe:\s*(.+)$/im.exec(headers)?.[1]?.trim() ?? null;
        const ts = m.envelope?.date ? new Date(m.envelope.date).getTime() : Date.now();
        q.ins.run(m.uid, ts, sender, from?.name ?? '', m.envelope?.subject ?? '', lu, Date.now());
        fresh.push({ uid: m.uid, ts, sender, senderName: from?.name ?? '', subject: m.envelope?.subject ?? '', listUnsub: lu, verdict: 'unsorted', reason: null, handled: false });
        since = Math.max(since, m.uid);
      }
    } finally { lock.release(); }
    await client.logout();
    watches.patch({ mail: { since, lastCheck: Date.now(), lastError: '' } });
    if (fresh.length) emit('watch.mail', 'loop', { fresh: fresh.length, since });
    return { fresh };
  } catch (e) {
    const error = (e as Error).message;
    try { await client.logout(); } catch {}
    watches.patch({ mail: { lastCheck: Date.now(), lastError: error } });
    emit('watch.mail_error', 'loop', { error });
    return { fresh: [], error };
  }
}
