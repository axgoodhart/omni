import YAML from 'yaml';

export function parseFrontmatter(text: string): { data: Record<string, any>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text.trim() };
  let data: Record<string, any> = {};
  try { data = (YAML.parse(m[1]) as Record<string, any>) ?? {}; } catch (e) { throw new Error(`bad frontmatter: ${(e as Error).message}`); }
  return { data, body: m[2].trim() };
}

export function stringifyFrontmatter(data: Record<string, any>, body: string) {
  return `---\n${YAML.stringify(data).trimEnd()}\n---\n\n${body.trim()}\n`;
}
