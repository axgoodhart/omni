import { generateText, type ModelMessage } from 'ai';
import { MODEL_LIGHT } from '../config.ts';
import { emit } from '../events/log.ts';
import * as cartridges from '../memory/cartridge.ts';
import * as files from '../memory/files.ts';
import { model } from '../providers/registry.ts';
import { record } from './budget.ts';

const KEEP = 12; // recent messages kept verbatim

export async function compact(mode: string, messages: ModelMessage[], cartridge: string | null): Promise<ModelMessage[]> {
  let cut = messages.length - KEEP;
  while (cut > 0 && messages[cut].role !== 'user') cut--; // never separate a tool call from its result
  if (cut <= 0) return messages;
  const older = messages.slice(0, cut), recent = messages.slice(cut);
  const { text, usage } = await generateText({
    model: model(MODEL_LIGHT),
    instructions: 'You compact an assistant\'s conversation history. Write a dense markdown summary: facts learned about the user, decisions, open tasks, promises made. Keep names, numbers, dates. No preamble.',
    prompt: older.map(render).join('\n'),
  });
  record(MODEL_LIGHT, usage);
  let savedTo: string | null = null;
  if (cartridge) {
    const c = cartridges.get(cartridge), rel = 'thread-summary.md';
    const prev = files.exists(c.memoriesDir, rel) ? `${files.read(c.memoriesDir, rel).trimEnd()}\n\n` : '';
    files.write(c.memoriesDir, rel, `${prev}## ${new Date().toISOString().slice(0, 16)} · ${mode}\n\n${text.trim()}\n`);
    cartridges.reindexFile(cartridge, rel);
    savedTo = `${cartridge}/${rel}`;
  }
  emit('compaction', mode, { dropped: older.length, kept: recent.length, savedTo, usage, summary: text });
  return [{ role: 'user', content: `[compacted history]\n${text.trim()}` }, { role: 'assistant', content: 'Noted. Continuing from there.' }, ...recent];
}

function render(m: ModelMessage): string {
  if (typeof m.content === 'string') return `${m.role}: ${m.content}`;
  return (m.content as any[]).map((p) =>
    p.type === 'text' ? `${m.role}: ${p.text}`
    : p.type === 'tool-call' ? `${m.role} called ${p.toolName}(${JSON.stringify(p.input).slice(0, 300)})`
    : p.type === 'tool-result' ? `tool ${p.toolName} → ${JSON.stringify(p.output).slice(0, 300)}`
    : '').filter(Boolean).join('\n');
}
