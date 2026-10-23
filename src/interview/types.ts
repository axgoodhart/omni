export type Option = { value: string; label: string };
export type Question = {
  id: string; surface: string; prompt: string; hint?: string;
  kind: 'text' | 'choice' | 'secret' | 'path' | 'time' | 'statement';
  options?: Option[]; optional?: boolean;
  group?: string;                        // questions in a group repeat as a unit
  loop?: { exit: string[] };             // on the group's first question: these answers leave the group
  current?: () => string | undefined;    // prefill when re-running
};
export type Surface = { name: string; questions(): Question[]; apply(id: string, value: string, answers: Record<string, string>): void };
