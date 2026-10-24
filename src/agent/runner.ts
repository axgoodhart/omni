import { isStepCount, streamText, type ModelMessage } from 'ai';
import { APPROVAL_TIMEOUT_MS, COMPACT_AT, MODEL_LIGHT } from '../config.ts';
import { db } from '../db.ts';
import { activity, emit, live } from '../events/log.ts';
import * as cartridges from '../memory/cartridge.ts';
import * as modes from '../modes/registry.ts';
import type { Mode } from '../modes/registry.ts';
import { model, providerOf } from '../providers/registry.ts';
import * as skills from '../skills/loader.ts';
import * as store from '../threads/store.ts';
import * as budget from './budget.ts';
import { compact } from './compact.ts';
import { alwaysRule, decide } from './policy.ts';
import * as allowed from '../desk/allowed.ts';
import { buildInstructions, contextLine } from './prompt.ts';
import { buildTools } from './tools.ts';

export type RunInput = { mode: string; text: string; channel: string; from?: string | null; light?: boolean; onText?: (delta: string) => void };
type Answer = { approvalId: string; approved: boolean; reason?: string; always?: boolean };
type Pending = { approvalId: string; thread: string; toolCallId: string; toolName: string; input: unknown; reason?: string; always: allowed.Rule | null; created: number; resolve: (a: Answer) => void; timer: NodeJS.Timeout };

const pending = new Map<string, Pending>();
const queues = new Map<string, Promise<unknown>>();
const insApproval = db.prepare('INSERT OR REPLACE INTO approvals (approval_id, thread, tool, input_json, reason, status, created) VALUES (?, ?, ?, ?, ?, ?, ?)');
const updApproval = db.prepare('UPDATE approvals SET status = ?, resolved = ? WHERE approval_id = ?');
db.prepare("UPDATE approvals SET status = 'expired', resolved = ? WHERE status = 'pending'").run(Date.now()); // left over from a previous process

export const pendingApprovals = (thread?: string) =>
  [...pending.values()].filter((p) => !thread || p.thread === thread).map(({ resolve, timer, ...p }) => p);

/** The first answer wins; "always" also remembers the narrow rule the request offered, so the same thing doesn't ask again. */
export function answerApproval(approvalId: string, approved: boolean, reason?: string, always = false) {
  const p = pending.get(approvalId);
  if (!p) return false;
  clearTimeout(p.timer); pending.delete(approvalId);
  const keep = approved && always && p.always;
  if (keep) allowed.add(p.always!);
  p.resolve({ approvalId, approved, reason, always: !!keep });
  return true;
}
export function answerLatest(thread: string, approved: boolean, reason?: string) {
  const p = [...pending.values()].filter((x) => x.thread === thread).at(-1);
  return p ? answerApproval(p.approvalId, approved, reason) : false;
}

/** One run at a time per mode thread. */
export function run(input: RunInput): Promise<string> {
  const next = (queues.get(input.mode) ?? Promise.resolve()).catch(() => {}).then(() => activity('talk', input.mode, () => runNow(input)));
  queues.set(input.mode, next);
  next.finally(() => { if (queues.get(input.mode) === next) queues.delete(input.mode); }).catch(() => {});
  return next;
}

export const busy = (mode: string) => queues.has(mode);

export function setCartridges(mode: string, list: string[]) {
  for (const n of list) cartridges.get(n);
  store.setState(mode, { cartridges: list });
  emit('cartridges.changed', mode, { cartridges: list });
  return list;
}
export const insertedFor = (mode: string) => store.getState(mode).cartridges ?? modes.get(mode).cartridges;

function providerOptionsFor(mode: Mode, modelId: string) {
  const po = structuredClone(mode.providerOptions ?? {}) as Record<string, any>;
  if (providerOf(modelId) === 'openai') {
    po.openai = { reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'], ...(mode.effort ? { reasoningEffort: mode.effort } : {}), ...(po.openai ?? {}) };
  }
  return po;
}

const trim = (v: unknown, n = 4000) => { const s = JSON.stringify(v) ?? ''; return s.length > n ? `${s.slice(0, n)}…` : v; };

async function runNow(input: RunInput): Promise<string> {
  const mode = modes.get(input.mode), thread = mode.name;
  const inserted = insertedFor(thread).filter((n) => { try { cartridges.get(n); return true; } catch { emit('cartridge.missing', thread, { name: n }); return false; } });
  const tools = buildTools({ mode, inserted });
  const toolNames = Object.keys(tools);
  const sk = skills.pick(mode.skills);
  const instructions = buildInstructions(mode, inserted.map((n) => cartridges.get(n)), sk, toolNames);
  const messages: ModelMessage[] = [...store.getMessages(thread), { role: 'user', content: `${contextLine(input.channel)}\n${input.text}` }];
  emit('inbound', thread, { channel: input.channel, from: input.from ?? null, text: input.text });
  store.save(thread, messages);

  let finalText = '', lastInput = 0;
  const granted = new Set<string>(); // calls you approved; the library re-checks them before running, and they shouldn't be asked about again
  for (let round = 0; round < 8; round++) { // a new round after every approval pause
    const estimate = Math.ceil((JSON.stringify(messages).length + instructions.length) / 4) + 2000;
    const want = input.light ? MODEL_LIGHT : mode.model;
    const choice = budget.pick(want, estimate);
    if (choice.refused) {
      const msg = `Daily token budget is used up (${choice.remaining} tokens left, this needs about ${estimate}). It resets at 00:00 UTC; raise DAILY_TOKEN_BUDGET to continue sooner.`;
      emit('budget.refused', thread, { estimate, remaining: choice.remaining });
      emit('outbound', thread, { channel: input.channel, text: msg });
      return msg;
    }
    if (choice.downgraded) emit('budget.downgraded', thread, { from: want, to: choice.model, remaining: choice.remaining });
    emit('prompt.assembled', thread, { model: choice.model, instructions, tools: toolNames, cartridges: inserted, skills: sk.map((s) => s.name), messages: messages.length, estimate, round });

    const requests: any[] = [];
    let text = '', reasoning = '';
    const result = streamText({
      model: model(choice.model),
      instructions,
      messages,
      tools,
      stopWhen: isStepCount(mode.maxSteps),
      providerOptions: providerOptionsFor(mode, choice.model),
      toolApproval: ({ toolCall }) => (granted.has(toolCall.toolCallId) ? 'approved' : decide(mode, toolCall.toolName, toolCall.input)),
      onError: ({ error }) => emit('error', thread, { message: String((error as any)?.message ?? error) }),
    });

    for await (const part of result.stream) {
      switch (part.type) {
        case 'start-step': emit('model.request', thread, { model: choice.model, warnings: part.warnings }); break;
        case 'text-delta': text += part.text; input.onText?.(part.text); live('text.delta', thread, { text: part.text }); break;
        case 'reasoning-delta': reasoning += part.text; live('reasoning.delta', thread, { text: part.text }); break;
        case 'reasoning-end': if (reasoning.trim()) emit('reasoning', thread, { text: reasoning }); reasoning = ''; break;
        case 'tool-input-start': live('tool.input.start', thread, { toolName: part.toolName }); break;
        case 'tool-call': emit('tool.call', thread, { toolCallId: part.toolCallId, toolName: part.toolName, input: part.input, providerExecuted: (part as any).providerExecuted ?? false }); break;
        case 'tool-result': emit('tool.result', thread, { toolCallId: part.toolCallId, toolName: part.toolName, output: trim((part as any).output) }); break;
        case 'tool-error': emit('tool.error', thread, { toolCallId: (part as any).toolCallId, toolName: (part as any).toolName, error: String((part as any).error?.message ?? (part as any).error) }); break;
        case 'tool-output-denied': emit('tool.denied', thread, { toolCallId: (part as any).toolCallId }); break;
        case 'tool-approval-request': if (!(part as any).isAutomatic) requests.push(part); break; // automatic ones were already decided and run
        case 'source': emit('source', thread, trim(part)); break;
        case 'finish-step': lastInput = part.usage.inputTokens ?? lastInput; budget.record(choice.model, part.usage); emit('usage', thread, { model: choice.model, usage: part.usage, finishReason: part.finishReason }); break;
        case 'error': emit('error', thread, { message: String((part.error as any)?.message ?? part.error) }); break;
      }
    }
    messages.push(...(await result.responseMessages));
    store.save(thread, messages, { ...store.getState(thread), lastInputTokens: lastInput });
    if (text) finalText = text;

    if (!requests.length) break;
    const answers = await Promise.all(requests.map((r) => waitForApproval(thread, r, mode.permissions.mode === 'ask-always' ? null : alwaysRule(r.toolCall?.toolName, r.toolCall?.input))));
    requests.forEach((r, i) => { if (answers[i].approved) granted.add(r.toolCall?.toolCallId ?? r.toolCallId); });
    messages.push({ role: 'tool', content: answers.map((a) => ({ type: 'tool-approval-response', approvalId: a.approvalId, approved: a.approved, reason: a.reason })) });
    store.save(thread, messages);
  }

  emit('outbound', thread, { channel: input.channel, text: finalText });
  if (lastInput > COMPACT_AT) store.save(thread, await compact(thread, messages, inserted[0] ?? null));
  return finalText;
}

function waitForApproval(thread: string, r: any, always: allowed.Rule | null): Promise<Answer> {
  const toolName: string = r.toolCall?.toolName ?? r.toolName ?? 'tool';
  const toolCallId: string = r.toolCall?.toolCallId ?? r.toolCallId ?? '';
  const input = r.toolCall?.input;
  insApproval.run(r.approvalId, thread, toolName, JSON.stringify(input ?? null), r.reason ?? null, 'pending', Date.now());
  emit('approval.requested', thread, { approvalId: r.approvalId, toolCallId, toolName, input, reason: r.reason ?? null, always: always?.label ?? null, timeoutMs: APPROVAL_TIMEOUT_MS });
  return new Promise((resolve) => {
    const finish = (approved: boolean, reason?: string, kept = false) => {
      updApproval.run(approved ? 'approved' : 'denied', Date.now(), r.approvalId);
      emit('approval.resolved', thread, { approvalId: r.approvalId, toolName, approved, reason: reason ?? null, always: kept ? always?.label ?? null : null });
      resolve({ approvalId: r.approvalId, approved, reason });
    };
    const timer = setTimeout(() => { pending.delete(r.approvalId); finish(false, 'no answer within the approval timeout'); }, APPROVAL_TIMEOUT_MS);
    pending.set(r.approvalId, { approvalId: r.approvalId, thread, toolCallId, toolName, input, reason: r.reason, always, created: Date.now(), timer, resolve: (a) => finish(a.approved, a.reason, a.always) });
  });
}
