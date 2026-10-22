import path from 'node:path';
import type { ToolApprovalStatus } from 'ai';
import { ALLOWED_HANDLES } from '../config.ts';
import { emit } from '../events/log.ts';
import type { Mode } from '../modes/registry.ts';

// Ported from briizOS electron/agent/tools.js so both agents ask at the same moments.
const DESTRUCTIVE_TOOLS = new Set(['shell', 'write_file', 'memory_delete', 'imessage_send']);
const WRITE_TOOLS = new Set(['memory_write', 'memory_edit', 'notify']);
const DESTRUCTIVE_VERBS = new Set(['rm', 'rmdir', 'mv', 'chmod', 'chown', 'chgrp', 'kill', 'killall', 'pkill', 'mkfs', 'fdisk', 'dd', 'truncate', 'shred', 'launchctl', 'systemctl', 'defaults', 'xattr']);
const SAFE_VERBS = new Set(['ls', 'cat', 'head', 'tail', 'less', 'more', 'echo', 'printf', 'pwd', 'whoami', 'which', 'where', 'find', 'grep', 'rg', 'ag', 'ack', 'wc', 'sort', 'uniq', 'diff', 'comm', 'file', 'stat', 'du', 'df', 'date', 'cal', 'uptime', 'uname', 'env', 'printenv', 'set', 'cp', 'mkdir', 'touch', 'curl', 'wget', 'ping', 'dig', 'nslookup', 'host', 'git', 'node', 'npm', 'npx', 'python', 'python3', 'pip', 'brew', 'open', 'top', 'ps', 'htop', 'lsof', 'netstat', 'imsg', 'jq']);

export function bashIsDestructive(command: string): boolean {
  const trimmed = String(command || '').trim();
  if (!trimmed) return false;
  if (/[|;&]/.test(trimmed)) return trimmed.split(/[|;&]+/).some((part) => bashIsDestructive(part));
  if (trimmed.includes('>')) return true;
  let verb = trimmed.split(/\s+/)[0];
  if (verb === 'sudo') return true;
  verb = verb.split('/').pop() ?? verb;
  if (DESTRUCTIVE_VERBS.has(verb)) return true;
  return !SAFE_VERBS.has(verb);
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

const normHandle = (h: string) => h.replace(/[\s()-]/g, '').toLowerCase();
const isYou = (to: string) => ALLOWED_HANDLES.some((h) => normHandle(h) === normHandle(to));

export function decide(mode: Mode, toolName: string, input: any): ToolApprovalStatus {
  const status = raw(mode, toolName, input);
  const kind = typeof status === 'string' ? status : status?.type ?? 'not-applicable';
  const reason = typeof status === 'object' ? status?.reason : undefined;
  emit('policy.decision', mode.name, { tool: toolName, level: mode.permissions.mode, decision: kind, reason, input });
  return status;
}

function raw(mode: Mode, toolName: string, input: any): ToolApprovalStatus {
  const { mode: level, blacklist, overrides } = mode.permissions;
  const o = overrides[toolName];
  if (o === 'deny') return { type: 'denied', reason: `${toolName} is denied in mode "${mode.name}"` };
  if (o === 'allow') return 'approved';
  if (o === 'ask') return { type: 'user-approval', reason: `mode "${mode.name}" asks before ${toolName}` };
  if (toolName === 'imessage_send' && !isYou(String(input?.to ?? ''))) return { type: 'user-approval', reason: `message to ${input?.to}, who is not you` };
  const destructive = DESTRUCTIVE_TOOLS.has(toolName), write = WRITE_TOOLS.has(toolName);
  if (!destructive && !write) return 'not-applicable';
  const bad = blacklisted(toolName, input, blacklist);
  if (bad) return { type: 'denied', reason: bad };
  if (level === 'no-asking') return 'approved';
  if (level === 'ask-always') return { type: 'user-approval', reason: `ask-always: ${toolName}` };
  if (!destructive) return 'approved';
  if (toolName === 'shell' && !bashIsDestructive(input?.command)) return 'approved';
  return { type: 'user-approval', reason: toolName === 'shell' ? `shell command looks destructive: ${String(input?.command).slice(0, 120)}` : `${toolName} changes or deletes something` };
}
