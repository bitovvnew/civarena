// Team policies: the contract between a "brain" (LLM or offline heuristic) and the executor.
// A brain sets strategy for its whole team every few ticks; every citizen then follows it.
// This keeps LLM cost to one call per team per policy period, while the world still runs at full speed.

import { GOODS, JOBS, type Good, type Job, type TeamPolicy } from './types.js';

export function defaultPolicy(): TeamPolicy {
  return {
    markup: 0.08,
    bidPremium: 0.06,
    jobBias: { farmer: 1, lumberjack: 1, miner: 1, smith: 1, artisan: 1 },
    borrow: 0.3,
    cartel: 0.3,
    cheat: 0.2,
    charity: 0.1,
    savings: 8,
    rationale: 'Keep it steady.',
  };
}

const clamp = (x: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Validate anything a model returned into a safe policy. Never throws. */
export function sanitizePolicy(raw: unknown, prev: TeamPolicy = defaultPolicy()): TeamPolicy {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const jb = (r.jobBias && typeof r.jobBias === 'object' ? r.jobBias : {}) as Record<string, unknown>;
  const jobBias = {} as Record<Job, number>;
  for (const j of JOBS) jobBias[j] = clamp(jb[j], 0.2, 3, prev.jobBias[j]);
  let rationale = typeof r.rationale === 'string' ? r.rationale : prev.rationale;
  rationale = rationale.replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    markup: clamp(r.markup, -0.5, 1.5, prev.markup),
    bidPremium: clamp(r.bidPremium, -0.3, 1, prev.bidPremium),
    jobBias,
    borrow: clamp(r.borrow, 0, 1, prev.borrow),
    cartel: clamp(r.cartel, 0, 1, prev.cartel),
    cheat: clamp(r.cheat, 0, 1, prev.cheat),
    charity: clamp(r.charity, 0, 1, prev.charity),
    savings: clamp(r.savings, 1, 40, prev.savings),
    rationale: rationale || prev.rationale,
  };
}

/** What a brain sees when it sets its team's policy. Plain JSON, small enough for any model. */
export interface Observation {
  tick: number;
  team: { id: string; label: string; alive: number; startPopulation: number; wealth: number; wealthShare: number; gdpShare: number; rank: number; teams: number; jobs: Record<Job, number>; bankruptcies: number; avgCash: number; hungry: number };
  market: Record<Good, { price: number; change10: number; volume: number }>;
  economy: { gdp: number; inflation: number; unemployment: number; gini: number; taxRate: number; policyRate: number; ubi: number; antitrust: boolean; cartels: { good: Good; floor: number; yourMembers: number }[]; shocks: string[] };
  previous: TeamPolicy;
}

export const POLICY_SCHEMA_TEXT = `Return ONLY a JSON object with these fields:
{
  "markup": number (-0.5..1.5)      // ask price vs. market reference; 0.2 = sell 20% above market
  "bidPremium": number (-0.3..1)    // how much above market you pay when buying
  "jobBias": { "farmer":n, "lumberjack":n, "miner":n, "smith":n, "artisan":n }  // 0.2..3, preference when citizens choose jobs
  "borrow": number (0..1)           // appetite for bank loans
  "cartel": number (0..1)           // willingness to form/join price-fixing cartels
  "cheat": number (0..1)            // temptation to undercut your own cartel
  "charity": number (0..1)          // share of surplus cash given to struggling teammates
  "savings": number (1..40)         // cash buffer in days of food before buying luxuries
  "rationale": string               // one punchy sentence (max 140 chars) explaining your strategy
}`;

export const GOODS_LIST = GOODS.join(', ');
