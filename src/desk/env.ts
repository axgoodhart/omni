import fs from 'node:fs';
import { ENV_PATH } from '../config.ts';

/** Secrets go to .env, never to desk/*.md. Takes effect for the running process too. */
export function setEnv(key: string, value: string) {
  const text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, next);
  process.env[key] = value;
}
export const getEnv = (key: string) => process.env[key] ?? '';
