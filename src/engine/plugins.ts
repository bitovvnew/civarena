import type { Rng } from './rng.js';
import type { Observation } from './policy.js';
import type { Command, Government, TeamPolicy, WorldState } from './types.js';

/** A brain sets strategy for one team. LLM adapters and the offline heuristic all implement this. */
export interface Brain {
  provider: string; // openai | anthropic | gemini | ollama | mock
  model: string;
  label: string;
  /** Return a policy (it will be validated and clamped, so a partial or messy object is fine). */
  decide(obs: Observation): Promise<Partial<TeamPolicy> | unknown>;
}

export interface ScenarioApi {
  readonly tick: number;
  readonly state: Readonly<WorldState>;
  readonly rng: Rng;
  /** Queue a command exactly like the dashboard would (taxes, printing money, shocks...). */
  command(cmd: Command): void;
  /** Post a custom headline to the event feed. */
  headline(text: string, level?: 0 | 1 | 2): void;
}

/** Scenarios are plugins: initial settings plus an optional per-tick script. */
export interface Scenario {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  author?: string;
  /** Where it came from: built into CivArena, a code plugin, or a shareable JSON file. */
  source?: 'builtin' | 'code' | 'json';
  /** The JSON definition, for declarative scenarios (exportable / shareable). */
  spec?: unknown;
  /** Overrides for the starting government / central bank. */
  setup?: {
    gov?: Partial<Omit<Government, 'treasury'>>;
    policyRate?: number;
    startCash?: number;
    /** Initial job mix weights. */
    jobs?: Partial<Record<'farmer' | 'lumberjack' | 'miner' | 'smith' | 'artisan', number>>;
  };
  onTick?(api: ScenarioApi): void;
}
