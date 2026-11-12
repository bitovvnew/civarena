// Guardrails around every LLM brain: spend limits (per team and global), per-provider rate limiting.

import type { Budget, RateLimit } from '../config.js';
import type { Observation } from '../engine/policy.js';
import type { Brain } from '../engine/plugins.js';

export class BudgetExceeded extends Error {
  constructor(readonly scope: 'team' | 'global' | 'calls') {
    super(`budget exhausted (${scope})`);
    this.name = 'BudgetExceeded';
  }
}

export interface Usage {
  calls: number;
  input: number;
  output: number;
  errors: number;
}

/** Shared token counter for one world. */
export class GlobalBudget {
  used = 0;
  constructor(readonly limit: number) {}
  get remaining() {
    return Math.max(0, this.limit - this.used);
  }
}

/** Sliding-window limiter: at most `rpm` starts per minute and `concurrency` in flight. */
export class RateLimiter {
  private starts: number[] = [];
  private inFlight = 0;
  private queue: (() => void)[] = [];

  constructor(readonly rpm: number, readonly concurrency: number, private now = () => Date.now()) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.inFlight--;
      this.queue.shift()?.();
    }
  }

  private async acquire() {
    for (;;) {
      if (this.inFlight >= this.concurrency) {
        await new Promise<void>((r) => this.queue.push(r));
        continue;
      }
      const t = this.now();
      this.starts = this.starts.filter((s) => t - s < 60_000);
      if (this.starts.length < this.rpm) {
        this.starts.push(t);
        this.inFlight++;
        return;
      }
      const wait = 60_000 - (t - this.starts[0]) + 5;
      await new Promise((r) => setTimeout(r, Math.min(wait, 1000)));
    }
  }
}

const limiters = new Map<string, RateLimiter>();

export function limiterFor(provider: string, rate: RateLimit): RateLimiter {
  const key = `${provider}:${rate.rpm}:${rate.concurrency}`;
  let l = limiters.get(key);
  if (!l) {
    l = new RateLimiter(rate.rpm, rate.concurrency);
    limiters.set(key, l);
  }
  return l;
}

interface Metered extends Brain {
  usage?: Usage;
}

/**
 * Wraps a brain with spend and rate limits. Once a team is out of budget it keeps its
 * last strategy for the rest of the world; the engine reports that in the event feed.
 */
export class GuardedBrain implements Brain {
  readonly provider: string;
  readonly model: string;
  readonly label: string;
  exhausted: BudgetExceeded['scope'] | null = null;

  constructor(
    readonly inner: Metered,
    readonly budget: Budget,
    readonly global: GlobalBudget,
    readonly limiter: RateLimiter | null,
  ) {
    this.provider = inner.provider;
    this.model = inner.model;
    this.label = inner.label;
  }

  get usage(): Usage {
    return this.inner.usage ?? { calls: 0, input: 0, output: 0, errors: 0 };
  }

  get tokens() {
    return this.usage.input + this.usage.output;
  }

  async decide(obs: Observation): Promise<unknown> {
    if (this.exhausted) throw new BudgetExceeded(this.exhausted);
    if (this.usage.calls >= this.budget.teamCalls) throw this.stop('calls');
    if (this.tokens >= this.budget.teamTokens) throw this.stop('team');
    if (this.global.remaining <= 0) throw this.stop('global');
    const before = this.tokens;
    const run = () => this.inner.decide(obs);
    try {
      return await (this.limiter ? this.limiter.run(run) : run());
    } finally {
      this.global.used += this.tokens - before;
    }
  }

  private stop(scope: BudgetExceeded['scope']) {
    this.exhausted = scope;
    return new BudgetExceeded(scope);
  }
}
