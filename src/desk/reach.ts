import { ALLOWED_HANDLES } from '../config.ts';
import { getEnv, setEnv } from './env.ts';
import type { Surface } from '../interview/types.ts';

export const surface: Surface = {
  name: 'reach',
  questions: () => [
    { id: 'reach.handle', surface: 'reach', kind: 'text', prompt: 'What number or email should Omnii text?', hint: 'Check-ins reach you over iMessage. Saved to .env as ALLOWED_HANDLES; restart the daemon to start the watcher.', optional: true, current: () => getEnv('ALLOWED_HANDLES') || ALLOWED_HANDLES[0] || undefined },
  ],
  apply: (id, value) => { if (value) setEnv('ALLOWED_HANDLES', value.replace(/\s+/g, '')); },
};
