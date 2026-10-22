import { IMESSAGE_ENABLED } from '../config.ts';
import type { Cartridge } from '../memory/cartridge.ts';
import type { Mode } from '../modes/registry.ts';
import type { Skill } from '../skills/loader.ts';

export function buildInstructions(mode: Mode, cartridges: Cartridge[], skills: Skill[], toolNames: string[]) {
  const parts = [mode.instructions.trim()];
  if (mode.voice) parts.push(`<voice>\n${mode.voice.trim()}\n</voice>`);

  parts.push(cartridges.length
    ? `<memory>
Inserted memory cartridges (your long-term memory; use the memory_* tools, paths are "cartridge/file.md"):
${cartridges.map((c) => `- ${c.name}: ${c.description || '(no description)'}\n  summary: ${c.summary.replace(/\s+/g, ' ').slice(0, 400)}\n  files: ${c.files.length ? c.files.join(', ') : '(empty)'}`).join('\n')}
Rules: search or view before answering questions about the user's life, work or preferences. When you learn something durable, write it to the fitting cartridge as a short markdown note (one topic per file, dated lines). Never store secrets or credentials.
</memory>`
    : '<memory>No memory cartridge is inserted. You have no long-term memory this turn; say so if asked to remember something.</memory>');

  if (skills.length) parts.push(`<skills>
Skills are folders of instructions. When a task matches one, call skill_read with its name and follow SKILL.md.
${skills.map((s) => `- ${s.name}: ${s.description || '(no description)'}`).join('\n')}
</skills>`);

  parts.push(`<operating>
Tools available this turn: ${toolNames.join(', ') || 'none'}.
Approval level: ${mode.permissions.mode}. Some tool calls pause for the user's approval; if one is denied, say so plainly and offer the next best step.
Messages arrive from several channels; the bracketed prefix on each user message names the channel and local time. Reply in plain text (no markdown tables) when the channel is imessage.
${IMESSAGE_ENABLED ? 'imessage_send to anyone other than the user always asks first.' : ''}
Be brief. Finish the task before reporting. Do not invent tool results.
</operating>`);
  return parts.filter(Boolean).join('\n\n');
}

export const contextLine = (channel: string) => `[${channel} · ${new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}]`;
