import type { LanguageModelUsage } from 'ai';
import { db } from '../db.ts';
import { BUDGET_DOWNGRADE_AT, DAILY_TOKEN_BUDGET, MODEL_LIGHT } from '../config.ts';

const today = () => new Date().toISOString().slice(0, 10);
const add = db.prepare(`INSERT INTO usage (day, model, input, output, total, requests) VALUES (?, ?, ?, ?, ?, 1)
  ON CONFLICT(day, model) DO UPDATE SET input = input + excluded.input, output = output + excluded.output,
  total = total + excluded.total, requests = requests + 1`);

export function record(model: string, u: LanguageModelUsage) {
  const i = u.inputTokens ?? 0, o = u.outputTokens ?? 0;
  add.run(today(), model, i, o, u.totalTokens ?? i + o);
}

export function todayUsage() {
  const rows = db.prepare('SELECT model, input, output, total, requests FROM usage WHERE day = ?').all(today()) as any[];
  const total = rows.reduce((s, r) => s + r.total, 0);
  return { day: today(), total, budget: DAILY_TOKEN_BUDGET, remaining: Math.max(0, DAILY_TOKEN_BUDGET - total), models: rows };
}

/** Picks the model for the next request, or refuses when the day's budget is gone. */
export function pick(main: string, estimate: number): { model: string; downgraded: boolean; refused: boolean; remaining: number } {
  const { total, remaining } = todayUsage();
  if (!DAILY_TOKEN_BUDGET) return { model: main, downgraded: false, refused: false, remaining: Infinity };
  if (estimate > remaining) return { model: main, downgraded: false, refused: true, remaining };
  const downgraded = total / DAILY_TOKEN_BUDGET >= BUDGET_DOWNGRADE_AT && main !== MODEL_LIGHT;
  return { model: downgraded ? MODEL_LIGHT : main, downgraded, refused: false, remaining };
}
