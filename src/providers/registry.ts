import { createProviderRegistry } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOllama } from 'ai-sdk-ollama';
import { OLLAMA_BASE_URL } from '../config.ts';

export const openai = createOpenAI();
export const registry = createProviderRegistry(
  { openai, anthropic: createAnthropic(), google: createGoogle(), ollama: createOllama({ baseURL: OLLAMA_BASE_URL }) },
  { separator: '/' },
);

export const providerOf = (id: string) => id.split('/')[0];
export const model = (id: string) => registry.languageModel(id as any);
