// Team specs: "provider:model[@baseUrl]".
//   openai:<model>  anthropic:<model>  gemini:<model>  openrouter:<vendor/model>  ollama:<model>
//   compat:<model>@http://host/v1     offline:tycoon|cooperative|prudent|gambler|adaptive
// Model names always come from the user (picked in `civarena setup` from the provider's live model list).

import { DEFAULT_BUDGET, DEFAULT_RATE, type Budget, type RateLimit } from '../config.js';
import type { Brain } from '../engine/plugins.js';
import { GlobalBudget, GuardedBrain, limiterFor } from './guard.js';
import { AnthropicBrain, GeminiBrain, OpenAIBrain } from './llm.js';
import { MockBrain, PERSONALITIES, type Personality } from './mock.js';
import { registerSecret } from './redact.js';

export { MockBrain, PERSONALITIES } from './mock.js';
export { AnthropicBrain, GeminiBrain, OpenAIBrain, cleanText, extractJson, prettyModel, SYSTEM_PROMPT, userPrompt } from './llm.js';
export { BudgetExceeded, GlobalBudget, GuardedBrain, RateLimiter } from './guard.js';

/** The four offline personalities used when no model is configured. */
export const OFFLINE_TEAMS = ['offline:tycoon', 'offline:cooperative', 'offline:prudent', 'offline:gambler'];
/** @deprecated kept for 0.1.0 scripts */
export const DEMO_TEAMS = OFFLINE_TEAMS;

export class TeamSpecError extends Error {}

export interface ParsedSpec {
  provider: string;
  model: string;
  baseUrl?: string;
}

export function parseSpec(spec: string): ParsedSpec {
  const at = spec.indexOf('@');
  const baseUrl = at >= 0 ? spec.slice(at + 1) : undefined;
  const head = at >= 0 ? spec.slice(0, at) : spec;
  const colon = head.indexOf(':');
  let provider = (colon >= 0 ? head.slice(0, colon) : head).trim().toLowerCase();
  if (provider === 'mock') provider = 'offline';
  if (provider === 'claude') provider = 'anthropic';
  if (provider === 'google') provider = 'gemini';
  const model = (colon >= 0 ? head.slice(colon + 1) : '').trim();
  return { provider, model, baseUrl };
}

const needModel = (spec: string, provider: string) =>
  new TeamSpecError(`Team "${spec}" has no model. Use ${provider}:<model>, or run \`civarena setup\` to pick one from ${provider}'s model list.`);

/** Build a raw (unguarded) brain from a spec. Keys come from the environment / .env. */
export function brainFromSpec(spec: string, seed = 1, env: NodeJS.ProcessEnv = process.env): Brain {
  const { provider, model, baseUrl } = parseSpec(spec);
  switch (provider) {
    case 'offline': {
      const p = (model || 'adaptive') as Personality;
      if (!PERSONALITIES.includes(p)) throw new TeamSpecError(`Unknown offline personality "${model}". Use one of: ${PERSONALITIES.join(', ')}`);
      return new MockBrain(p, seed);
    }
    case 'openai': {
      const key = env.OPENAI_API_KEY;
      if (!key && !baseUrl) throw new TeamSpecError(`OPENAI_API_KEY is not set (needed for team "${spec}"). Run \`civarena setup\`.`);
      if (!model) throw needModel(spec, provider);
      registerSecret(key);
      return new OpenAIBrain({ model, apiKey: key, baseUrl: baseUrl ?? env.OPENAI_BASE_URL });
    }
    case 'anthropic': {
      const key = env.ANTHROPIC_API_KEY;
      if (!key) throw new TeamSpecError(`ANTHROPIC_API_KEY is not set (needed for team "${spec}"). Run \`civarena setup\`.`);
      if (!model) throw needModel(spec, provider);
      registerSecret(key);
      return new AnthropicBrain({ model, apiKey: key, baseUrl: baseUrl ?? env.ANTHROPIC_BASE_URL });
    }
    case 'gemini': {
      const key = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
      if (!key) throw new TeamSpecError(`GEMINI_API_KEY is not set (needed for team "${spec}"). Run \`civarena setup\`.`);
      if (!model) throw needModel(spec, provider);
      registerSecret(key);
      return new GeminiBrain({ model, apiKey: key, baseUrl });
    }
    case 'openrouter': {
      const key = env.OPENROUTER_API_KEY;
      if (!key) throw new TeamSpecError(`OPENROUTER_API_KEY is not set (needed for team "${spec}"). Run \`civarena setup\`.`);
      if (!model) throw needModel(spec, provider);
      registerSecret(key);
      return new OpenAIBrain({
        provider: 'openrouter', model, apiKey: key, baseUrl: baseUrl ?? 'https://openrouter.ai/api/v1',
        extraHeaders: { 'HTTP-Referer': 'https://github.com/bitovvnew/civarena', 'X-Title': 'CivArena' },
      });
    }
    case 'ollama':
      if (!model) throw needModel(spec, provider);
      return new OpenAIBrain({ provider: 'ollama', model, baseUrl: baseUrl ?? (env.OLLAMA_BASE_URL ? env.OLLAMA_BASE_URL.replace(/\/$/, '') + '/v1' : 'http://localhost:11434/v1'), timeoutMs: 180_000 });
    case 'compat':
    case 'openai-compatible':
      if (!baseUrl) throw new TeamSpecError('compat teams need a base URL, e.g. compat:my-model@http://localhost:1234/v1');
      registerSecret(env.COMPAT_API_KEY);
      return new OpenAIBrain({ provider: 'compat', model, apiKey: env.COMPAT_API_KEY, baseUrl, jsonMode: false });
    default:
      throw new TeamSpecError(`Unknown provider "${provider}" in team "${spec}". Use openai, anthropic, gemini, openrouter, ollama, compat or offline.`);
  }
}

export interface TeamBuild {
  brains: Brain[];
  global: GlobalBudget;
}

/** Build every team's brain, wrapping LLM brains with budgets and rate limits. */
export function buildTeams(specs: string[], opts: { budget?: Budget; rate?: RateLimit; env?: NodeJS.ProcessEnv } = {}): TeamBuild {
  const budget = opts.budget ?? DEFAULT_BUDGET;
  const rate = opts.rate ?? DEFAULT_RATE;
  const global = new GlobalBudget(budget.globalTokens);
  const brains = specs.map((s, i) => {
    const b = brainFromSpec(s, i + 1, opts.env);
    if (b.provider === 'offline') return b;
    return new GuardedBrain(b as never, budget, global, limiterFor(b.provider, rate));
  });
  return { brains, global };
}
