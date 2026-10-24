import path from 'node:path';
import type { ToolApprovalStatus } from 'ai';
import { ALLOWED_HANDLES } from '../config.ts';
import * as allowed from '../desk/allowed.ts';
import { emit } from '../events/log.ts';
import type { Mode } from '../modes/registry.ts';

// Ported from briizOS electron/agent/tools.js; the shell judgement follows OpenClaw's exec approvals (src/infra/exec-*).
const DESTRUCTIVE_TOOLS = new Set(['shell', 'write_file', 'memory_delete', 'imessage_send']);
const WRITE_TOOLS = new Set(['memory_write', 'memory_edit', 'notify']);
const DELETE_VERBS = new Set(['rm', 'rmdir', 'mv', 'truncate', 'shred', 'dd']);
const SYSTEM_VERBS = new Set(['chmod', 'chown', 'chgrp', 'kill', 'killall', 'pkill', 'mkfs', 'fdisk', 'launchctl', 'systemctl', 'defaults', 'xattr']);
const SAFE_VERBS = new Set(['ls', 'cat', 'head', 'tail', 'less', 'more', 'echo', 'printf', 'pwd', 'whoami', 'which', 'where', 'find', 'grep', 'rg', 'ag', 'ack', 'wc', 'sort', 'uniq', 'diff', 'comm', 'file', 'stat', 'du', 'df', 'date', 'cal', 'uptime', 'uname', 'env', 'printenv', 'set', 'cp', 'mkdir', 'touch', 'curl', 'wget', 'ping', 'dig', 'nslookup', 'host', 'git', 'node', 'npm', 'npx', 'python', 'python3', 'pip', 'brew', 'open', 'top', 'ps', 'htop', 'lsof', 'netstat', 'imsg', 'jq', 'cut', 'tr', 'cd', 'test', 'true', 'false']);

// ==== SHELL SHAPES ====
const CANT_TELL = [/\$\(/, /`/, /<\(/, />\(/, /(^|[\s;&|])(eval|source|sudo|su|doas)\s/];        // builds itself while running, or runs as someone else
const RUNS_OTHERS = [/\s-(exec|execdir|ok|okdir)\b/, /(^|[|;&]\s*)xargs\b/];                    // hands what it finds to other commands
const HARMLESS = /\s*(?:&>|\d?>>?)\s*\/dev\/null|\s*\d?>&\d/g;                                   // throwing output away, or merging it, writes nothing

export type Judgement = { ask: boolean; why: string; always: boolean };
/** Whether a shell command can run without asking, and if not, why in plain words and whether "always" may be offered. */
export function judgeShell(command: string): Judgement {
  const cmd = String(command || '').trim();
  const ask = (why: string, always = true): Judgement => ({ ask: true, why, always });
  if (!cmd) return { ask: false, why: '', always: false };
  if (CANT_TELL.some((r) => r.test(` ${cmd}`))) return ask("Omnii can't tell ahead of time exactly what it would do", false);
  if (RUNS_OTHERS.some((r) => r.test(` ${cmd}`))) return ask('it would run other commands on whatever it finds', false);
  for (const step of cmd.replace(HARMLESS, '').split(/\|\||&&|[|;&]/).map((s) => s.trim()).filter(Boolean)) {
    const verb = (step.split(/\s+/)[0] ?? '').split('/').pop() ?? '';
    if (step.includes('>')) return ask('it would write to a file');
    if (DELETE_VERBS.has(verb) || (verb === 'find' && /\s-delete\b/.test(step))) return ask('it would delete or move things');
    if (SYSTEM_VERBS.has(verb)) return ask('it would change system settings or stop programs');
    if (!SAFE_VERBS.has(verb)) return ask(`Omnii doesn't know what “${verb}” does`);
  }
  return { ask: false, why: '', always: false };
}
export const bashIsDestructive = (command: string) => judgeShell(command).ask;

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const normHandle = (h: string) => h.replace(/[\s()-]/g, '').toLowerCase();
const isYou = (to: string) => ALLOWED_HANDLES.some((h) => normHandle(h) === normHandle(to));

/** What "Always allow" would remember for this call, kept as narrow as OpenClaw's: one exact command in one folder, one folder for files, one person for texts. Null when it shouldn't be offered. */
export function alwaysRule(toolName: string, input: any): allowed.Rule | null {
  if (toolName === 'shell') { const cmd = norm(input?.command); return judgeShell(cmd).always ? { tool: 'shell', match: cmd, cwd: input?.cwd ?? '', label: `run “${short(cmd)}”` } : null; }
  if (toolName === 'write_file') { const dir = path.dirname(String(input?.path ?? '')); return { tool: 'write_file', match: dir, label: `write files in ${dir === '.' ? 'its work folder' : dir}` }; }
  if (toolName === 'imessage_send') return { tool: 'imessage_send', match: normHandle(String(input?.to ?? '')), label: `text ${input?.to}` };
  return null;
}

function targets(toolName: string, input: any): string[] {
  const out: string[] = [];
  for (const k of ['path', 'file', 'to']) if (typeof input?.[k] === 'string') out.push(input[k]);
  if (toolName === 'shell' && typeof input?.command === 'string') {
    for (const tok of input.command.split(/\s+/)) if (tok.includes('/') || tok.includes('.')) out.push(tok.replace(/^['"]|['"]$/g, ''));
  }
  return out;
}

function blacklisted(toolName: string, input: any, bl: Mode['permissions']['blacklist']): string | null {
  for (const t of targets(toolName, input)) {
    const ext = path.extname(t).toLowerCase();
    if (ext && bl.filetypes.some((f) => f.toLowerCase().replace(/^\.?/, '.') === ext)) return `${t} has a blacklisted file type`;
    if (bl.paths.some((p) => t === p || t.startsWith(p.endsWith('/') ? p : `${p}/`) || t.includes(p))) return `${t} is under a blacklisted path`;
  }
  return null;
}

export function decide(mode: Mode, toolName: string, input: any): ToolApprovalStatus {
  const status = raw(mode, toolName, input);
  const kind = typeof status === 'string' ? status : status?.type ?? 'not-applicable';
  const reason = typeof status === 'object' ? status?.reason : undefined;
  emit('policy.decision', mode.name, { tool: toolName, level: mode.permissions.mode, decision: kind, reason, input });
  return status;
}

const REASON: Record<string, string> = { write_file: 'it would write a file', memory_delete: 'it would delete one of its notes', imessage_send: 'it would send a text' };

function raw(mode: Mode, toolName: string, input: any): ToolApprovalStatus {
  const { mode: level, blacklist, overrides } = mode.permissions;
  const o = overrides[toolName];
  if (o === 'deny') return { type: 'denied', reason: `${toolName} is turned off in the ${mode.name} mode` };
  if (o === 'allow') return 'approved';
  if (o === 'ask') return { type: 'user-approval', reason: `the ${mode.name} mode always asks before ${toolName}` };
  const destructive = DESTRUCTIVE_TOOLS.has(toolName), write = WRITE_TOOLS.has(toolName);
  if (!destructive && !write) return 'not-applicable';
  const bad = blacklisted(toolName, input, blacklist);
  if (bad) return { type: 'denied', reason: bad };
  if (level === 'no-asking') return 'approved';
  const rule = level === 'ask-always' ? null : alwaysRule(toolName, input);
  if (rule && allowed.has(rule)) return { type: 'approved', reason: `you said it may always ${rule.label}` };
  if (toolName === 'imessage_send' && !isYou(String(input?.to ?? ''))) return { type: 'user-approval', reason: `the text would go to ${input?.to}, not you` };
  if (level === 'ask-always') return { type: 'user-approval', reason: 'this mode asks before every change' };
  if (!destructive) return 'approved';
  if (toolName === 'shell') { const j = judgeShell(input?.command); return j.ask ? { type: 'user-approval', reason: j.why } : 'approved'; }
  return { type: 'user-approval', reason: REASON[toolName] ?? 'it would change or delete something' };
}
