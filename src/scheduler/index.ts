import { Cron } from 'croner';
import * as runner from '../agent/runner.ts';
import * as outbound from '../channels/outbound.ts';
import { emit, subscribe } from '../events/log.ts';
import * as modes from '../modes/registry.ts';
import type { Schedule } from '../modes/registry.ts';

let jobs: Cron[] = [];

export function start() {
  stop();
  for (const m of modes.list()) for (const s of m.schedules) {
    try { jobs.push(new Cron(s.cron, { timezone: s.timezone, name: `${m.name} · ${s.cron}` }, () => tick(m.name, s))); }
    catch (e) { emit('schedule.error', m.name, { cron: s.cron, error: (e as Error).message }); }
  }
  emit('schedule.loaded', null, { jobs: list() });
}
export function stop() { for (const j of jobs) j.stop(); jobs = []; }
export const list = () => jobs.map((j) => ({ name: j.name ?? '', next: j.nextRun()?.toISOString() ?? null }));

async function tick(mode: string, s: Schedule) {
  emit('schedule.tick', mode, { cron: s.cron, prompt: s.prompt, deliver: s.deliver ?? null });
  try {
    if (s.cartridges) runner.setCartridges(mode, s.cartridges);
    const text = await runner.run({ mode, text: s.prompt, channel: 'schedule', light: s.light ?? false });
    if (s.deliver && text) await outbound.send(s.deliver, null, text);
  } catch (e) { emit('schedule.error', mode, { cron: s.cron, error: (e as Error).message }); }
}

subscribe((e) => { if (e.type === 'mode.reloaded') start(); });
