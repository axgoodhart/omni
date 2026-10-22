import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { IMESSAGE_ENABLED, SHELL_TIMEOUT_MS, TOOL_OUTPUT_CAP, WORKSPACE_DIR } from '../config.ts';
import * as outbound from '../channels/outbound.ts';
import { emit } from '../events/log.ts';
import * as cartridges from '../memory/cartridge.ts';
import * as files from '../memory/files.ts';
import type { Mode } from '../modes/registry.ts';
import { openai, providerOf } from '../providers/registry.ts';
import * as skills from '../skills/loader.ts';

const exec = promisify(execFile);
const cap = (s: string, n = TOOL_OUTPUT_CAP) => (s.length > n ? `${s.slice(0, n)}\n…[${s.length - n} more chars cut]` : s);

export const DEFAULT_TOOLS = [
  'memory_view', 'memory_search', 'memory_write', 'memory_edit', 'memory_delete',
  'read_file', 'write_file', 'shell', 'fetch_url', 'skill_read', 'notify',
  ...(IMESSAGE_ENABLED ? ['imessage_send'] : []),
];

export type ToolCtx = { mode: Mode; inserted: string[] };

export function buildTools(ctx: ToolCtx): ToolSet {
  const thread = ctx.mode.name;
  const cart = (name: string) => {
    if (!ctx.inserted.includes(name)) throw new Error(`cartridge "${name}" is not inserted (inserted: ${ctx.inserted.join(', ') || 'none'})`);
    return cartridges.get(name);
  };
  const split = (p: string) => { const [name, ...rest] = p.replace(/^\/+/, '').split('/'); return { name, rel: rest.join('/') }; };
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const all: ToolSet = {
    memory_view: tool({
      description: 'List a cartridge\'s memory files ("cartridge") or read one ("cartridge/file.md").',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path: p }) => {
        const { name, rel } = split(p); const c = cart(name);
        return rel ? { path: p, content: cap(files.read(c.memoriesDir, rel)) } : { cartridge: name, files: c.files };
      },
    }),
    memory_search: tool({
      description: 'Full-text search across inserted cartridges. Returns file paths with snippets.',
      inputSchema: z.object({ query: z.string(), cartridge: z.string().optional(), limit: z.number().int().min(1).max(25).optional() }),
      execute: async ({ query, cartridge, limit }) => cartridges.search(cartridge ? [cart(cartridge).name] : ctx.inserted, query, limit ?? 8),
    }),
    memory_write: tool({
      description: 'Create or overwrite a memory file at "cartridge/topic.md". Short, dated, one topic per file.',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path: p, content }) => {
        const { name, rel } = split(p); const c = cart(name);
        if (!rel.endsWith('.md')) throw new Error('memory files end in .md');
        files.write(c.memoriesDir, rel, content); cartridges.reindexFile(name, rel);
        emit('memory.write', thread, { op: 'write', path: p, bytes: content.length });
        return { ok: true, path: p };
      },
    }),
    memory_edit: tool({
      description: 'Replace one exact passage in a memory file. "old" must occur exactly once.',
      inputSchema: z.object({ path: z.string(), old: z.string(), new: z.string() }),
      execute: async ({ path: p, old, new: next }) => {
        const { name, rel } = split(p); const c = cart(name);
        files.edit(c.memoriesDir, rel, old, next); cartridges.reindexFile(name, rel);
        emit('memory.write', thread, { op: 'edit', path: p });
        return { ok: true, path: p };
      },
    }),
    memory_delete: tool({
      description: 'Delete a memory file.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path: p }) => {
        const { name, rel } = split(p); const c = cart(name);
        files.remove(c.memoriesDir, rel); cartridges.reindexFile(name, rel);
        emit('memory.write', thread, { op: 'delete', path: p });
        return { ok: true, path: p };
      },
    }),
    read_file: tool({
      description: `Read a text file inside the workspace (${WORKSPACE_DIR}).`,
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path: p }) => ({ path: p, content: cap(files.read(WORKSPACE_DIR, p)) }),
    }),
    write_file: tool({
      description: 'Write a text file inside the workspace.',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path: p, content }) => { files.write(WORKSPACE_DIR, p, content); return { ok: true, path: p }; },
    }),
    shell: tool({
      description: `Run a zsh command inside the workspace (${WORKSPACE_DIR}); ${SHELL_TIMEOUT_MS / 1000}s timeout. Destructive commands pause for approval.`,
      inputSchema: z.object({ command: z.string(), cwd: z.string().optional() }),
      execute: async ({ command, cwd }) => {
        try {
          const { stdout, stderr } = await exec('/bin/zsh', ['-lc', command], { cwd: files.inside(WORKSPACE_DIR, cwd ?? ''), timeout: SHELL_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
          return { code: 0, stdout: cap(stdout), stderr: cap(stderr) };
        } catch (e: any) {
          return { code: e.code ?? 1, stdout: cap(e.stdout ?? ''), stderr: cap(e.stderr ?? e.message ?? '') };
        }
      },
    }),
    fetch_url: tool({
      description: 'Fetch a web page or API URL and return its readable text.',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        const u = new URL(url);
        const res = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'omni/0.1 (personal agent)', accept: 'text/html,application/json,text/plain,*/*' }, signal: AbortSignal.timeout(20_000) });
        const type = res.headers.get('content-type') ?? '';
        const body = await res.text();
        return { url: res.url, status: res.status, type, text: cap(type.includes('html') ? htmlToText(body) : body) };
      },
    }),
    skill_read: tool({
      description: 'Read a skill\'s SKILL.md and list the files in its folder.',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => { const r = skills.readSkill(name); return { name: r.skill.name, dir: r.skill.dir, files: r.files, text: cap(r.text) }; },
    }),
    notify: tool({
      description: 'Push a message to the user outside this conversation (iMessage when configured, else the web app). For briefs and alerts, not ordinary replies.',
      inputSchema: z.object({ text: z.string(), channel: z.string().optional() }),
      execute: async ({ text, channel }) => ({ delivered: await outbound.notify(thread, text, channel) }),
    }),
    imessage_send: tool({
      description: 'Send an iMessage or SMS to a phone number or email through Messages.app.',
      inputSchema: z.object({ to: z.string(), text: z.string() }),
      execute: async ({ to, text }) => { await outbound.send('imessage', to, text); return { ok: true, to }; },
    }),
  };

  const picked: ToolSet = {};
  for (const n of ctx.mode.tools ?? DEFAULT_TOOLS) {
    if (all[n]) picked[n] = all[n];
    else if (n === 'web_search' && providerOf(ctx.mode.model) === 'openai') picked.web_search = openai.tools.webSearch();
  }
  return picked;
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article|blockquote|pre)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}
