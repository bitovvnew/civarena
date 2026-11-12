// Parse team specs like "openai:gpt-5", "anthropic:claude-opus-5-5", "ollama:llama3.1", "mock:tycoon".

import type { Brain } from '../engine/plugins.js';
import { AnthropicBrain, GeminiBrain, OpenAIBrain } from './llm.js';
import { MockBrain, PERSONALITIES, type Personality } from './mock.js';

export { MockBrain, PERSONALITIES } from './mock.js';
export { AnthropicBrain, GeminiBrain, OpenAIBrain, extractJson, prettyModel, SYSTEM_PROMPT } from './llm.js';

export const DEFAULT_MODELS: Record<string, string> = {
  openai: process.env.CIVARENA_OPENAI_MODEL ?? 'gpt-5-mini',
  anthropic: process.env.CIVARENA_ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  gemini: process.env.CIVARENA_GEMINI_MODEL ?? 'gemini-2.5-flash',
  ollama: process.env.CIVARENA_OLLAMA_MODEL ?? 'llama3.1',
};

export const DEMO_TEAMS = ['mock:tycoon', 'mock:cooperative', 'mock:prudent', 'mock:gambler'];

export class TeamSpecError extends Error {}

/**
 * Build a brain from a spec. Format: `provider[:model][@baseUrl]`.
 * Keys come from the environment: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY (or GOOGLE_API_KEY).
 */
export function brainFromSpec(spec: string, seed = 1, env: NodeJS.ProcessEnv = process.env): Brain {
  const at = spec.indexOf('@');
  const baseUrl = at >= 0 ? spec.slice(at + 1) : undefined;
  const head = at >= 0 ? spec.slice(0, at) : spec;
  const colon = head.indexOf(':');
  const provider = (colon >= 0 ? head.slice(0, colon) : head).trim().toLowerCase();
  const model = (colon >= 0 ? head.slice(colon + 1) : '').trim();
  switch (provider) {
    case 'mock':
    case 'offline': {
      const p = (model || 'adaptive') as Personality;
      if (!PERSONALITIES.includes(p)) throw new TeamSpecError(`Unknown offline personality "${model}". Use one of: ${PERSONALITIES.join(', ')}`);
      return new MockBrain(p, seed);
    }
    case 'openai': {
      const key = env.OPENAI_API_KEY;
      if (!key && !baseUrl) throw new TeamSpecError('OPENAI_API_KEY is not set (needed for team "' + spec + '")');
      return new OpenAIBrain({ model: model || DEFAULT_MODELS.openai, apiKey: key, baseUrl: baseUrl ?? env.OPENAI_BASE_URL });
    }
    case 'anthropic':
    case 'claude': {
      const key = env.ANTHROPIC_API_KEY;
      if (!key) throw new TeamSpecError('ANTHROPIC_API_KEY is not set (needed for team "' + spec + '")');
      return new AnthropicBrain({ model: model || DEFAULT_MODELS.anthropic, apiKey: key, baseUrl: baseUrl ?? env.ANTHROPIC_BASE_URL });
    }
    case 'gemini':
    case 'google': {
      const key = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
      if (!key) throw new TeamSpecError('GEMINI_API_KEY is not set (needed for team "' + spec + '")');
      return new GeminiBrain({ model: model || DEFAULT_MODELS.gemini, apiKey: key, baseUrl });
    }
    case 'ollama':
      return new OpenAIBrain({ provider: 'ollama', model: model || DEFAULT_MODELS.ollama, baseUrl: baseUrl ?? env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1', timeoutMs: 180_000 });
    case 'compat':
    case 'openai-compatible':
      if (!baseUrl) throw new TeamSpecError('compat teams need a base URL, e.g. compat:my-model@http://localhost:1234/v1');
      return new OpenAIBrain({ provider: 'compat', model, apiKey: env.COMPAT_API_KEY, baseUrl, jsonMode: false });
    default:
      throw new TeamSpecError(`Unknown provider "${provider}" in team "${spec}". Use openai, anthropic, gemini, ollama, compat or mock.`);
  }
}
