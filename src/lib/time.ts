/** Local-time helpers for one IANA timezone. */
export type Parts = { date: string; hm: string; minutes: number; weekday: string };

export function parts(tz: string, d = new Date()): Parts {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  const hour = Number(o.hour) % 24;
  return { date: `${o.year}-${o.month}-${o.day}`, hm: `${String(hour).padStart(2, '0')}:${o.minute}`, minutes: hour * 60 + Number(o.minute), weekday: o.weekday.toLowerCase() };
}
export const hmToMinutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
/** "90m", "2h", "1h30m", "45" (minutes) → ms */
export function duration(s: string | number | undefined, fallbackMs: number) {
  if (s == null || s === '') return fallbackMs;
  if (typeof s === 'number') return s * 60_000;
  let ms = 0, found = false;
  for (const [, n, u] of s.matchAll(/(\d+)\s*([hmd]?)/g)) { found = true; ms += Number(n) * (u === 'h' ? 3_600_000 : u === 'd' ? 86_400_000 : 60_000); }
  return found ? ms : fallbackMs;
}
/** ms from now until local HH:MM today (negative if passed). */
export const untilToday = (tz: string, hm: string) => (hmToMinutes(hm) - parts(tz).minutes) * 60_000;
export const fmtHm = (ts: number, tz: string) => parts(tz, new Date(ts)).hm;
