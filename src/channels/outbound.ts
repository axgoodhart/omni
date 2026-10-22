import { emit } from '../events/log.ts';

type Sender = (to: string | null, text: string) => Promise<void>;
const senders = new Map<string, Sender>();
let userChannels: { channel: string; to: string | null }[] = [];

export const register = (channel: string, send: Sender) => { senders.set(channel, send); };
export const channels = () => [...senders.keys()];
/** Where `notify` reaches you when no channel is named. */
export const addUserChannel = (channel: string, to: string | null) => { userChannels.push({ channel, to }); };

export async function send(channel: string, to: string | null, text: string) {
  const s = senders.get(channel);
  if (!s) throw new Error(`no channel "${channel}" (have ${channels().join(', ') || 'none'})`);
  await s(to, text);
}

export async function notify(thread: string | null, text: string, channel?: string) {
  const targets = channel ? userChannels.filter((c) => c.channel === channel) : userChannels;
  emit('outbound', thread, { channel: 'notify', targets, text });
  for (const t of targets) await send(t.channel, t.to, text);
  return targets.map((t) => t.channel);
}
