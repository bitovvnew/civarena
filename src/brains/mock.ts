// Offline brains: no API key, no network, fully deterministic.
// Each personality reacts to the market so the demo world tells a real story without any LLM.

import type { Observation } from '../engine/policy.js';
import type { Brain } from '../engine/plugins.js';
import { Rng, hashSeed } from '../engine/rng.js';
import { GOODS, JOBS, JOB_OUTPUT, type Good, type Job, type TeamPolicy } from '../engine/types.js';

export type Personality = 'tycoon' | 'cooperative' | 'prudent' | 'gambler' | 'adaptive';

export const PERSONALITIES: Personality[] = ['tycoon', 'cooperative', 'prudent', 'gambler', 'adaptive'];

const LABELS: Record<Personality, string> = {
  tycoon: 'Tycoons',
  cooperative: 'Co-op',
  prudent: 'Prudent',
  gambler: 'Gamblers',
  adaptive: 'Adaptive',
};

const BASE: Record<Personality, Omit<TeamPolicy, 'jobBias' | 'rationale'>> = {
  tycoon: { markup: 0.28, bidPremium: 0.02, borrow: 0.75, cartel: 0.85, cheat: 0.35, charity: 0, savings: 6 },
  cooperative: { markup: 0.04, bidPremium: 0.12, borrow: 0.2, cartel: 0.15, cheat: 0.05, charity: 0.4, savings: 8 },
  prudent: { markup: 0.1, bidPremium: 0.05, borrow: 0.05, cartel: 0.3, cheat: 0.1, charity: 0.12, savings: 16 },
  gambler: { markup: 0.15, bidPremium: 0.2, borrow: 0.95, cartel: 0.6, cheat: 0.85, charity: 0, savings: 3 },
  adaptive: { markup: 0.1, bidPremium: 0.06, borrow: 0.35, cartel: 0.4, cheat: 0.2, charity: 0.15, savings: 9 },
};

const outputOf = (j: Job): Good => JOB_OUTPUT[j];

export class MockBrain implements Brain {
  readonly provider = 'offline';
  readonly model: string;
  readonly label: string;
  private rng: Rng;

  constructor(readonly personality: Personality = 'adaptive', seed = 1) {
    this.model = personality;
    this.label = LABELS[personality];
    this.rng = new Rng((hashSeed(personality) ^ seed) >>> 0);
  }

  async decide(obs: Observation): Promise<TeamPolicy> {
    return this.decideSync(obs);
  }

  decideSync(obs: Observation): TeamPolicy {
    const b = BASE[this.personality];
    const m = obs.market;
    // the hottest and coldest goods by recent price change
    const sorted = [...GOODS].sort((x, y) => m[y].change10 - m[x].change10);
    const hot = sorted[0];
    const cold = sorted[sorted.length - 1];
    const jobBias = { farmer: 1, lumberjack: 1, miner: 1, smith: 1, artisan: 1 } as Record<Job, number>;
    const r = this.rng;
    const rich = obs.team.rank === 1;
    const losing = obs.team.rank === obs.team.teams;
    let policy: TeamPolicy;

    switch (this.personality) {
      case 'tycoon': {
        jobBias.smith = 1.5;
        jobBias.artisan = 1.6;
        for (const j of JOBS) if (outputOf(j) === hot) jobBias[j] += 0.6;
        const cartelBoost = obs.economy.antitrust ? -0.5 : 0;
        policy = {
          ...b, jobBias, cartel: Math.max(0, b.cartel + cartelBoost),
          markup: b.markup + (m[hot].change10 > 10 ? 0.1 : 0),
          rationale: pick(r, obs.economy.antitrust
            ? [`Regulators are watching. We go legit and squeeze ${hot} margins instead.`, `No cartels for now. Buy cheap, sell ${hot} dear.`]
            : [`Corner the ${hot} market. Prices are up ${Math.round(m[hot].change10)}%.`, `Margins first. Everyone else can compete on price.`, `Form the ${hot} cartel before someone else does.`]),
        };
        break;
      }
      case 'cooperative': {
        const hungry = obs.team.hungry / Math.max(1, obs.team.alive);
        jobBias.farmer = 1.3 + hungry * 2;
        policy = {
          ...b, jobBias, charity: Math.min(1, b.charity + hungry),
          rationale: pick(r, hungry > 0.1
            ? [`${obs.team.hungry} of us are hungry. Everyone shares until nobody is.`, `Feed the team first, profits second.`]
            : [`Fair prices, full stomachs, nobody left behind.`, `We trade honestly and keep every member alive.`]),
        };
        break;
      }
      case 'prudent': {
        jobBias.farmer = 1.2;
        const highRates = obs.economy.policyRate > 8;
        policy = {
          ...b, jobBias, borrow: highRates ? 0 : b.borrow,
          savings: obs.economy.inflation > 40 ? 6 : b.savings, // inflation punishes hoarding cash
          rationale: pick(r, obs.economy.inflation > 40
            ? [`Inflation at ${Math.round(obs.economy.inflation)}%. Turning cash into goods.`]
            : [`No debt, deep savings, steady trade. Slow and alive beats fast and broke.`, `Keep a cash buffer and wait for others to overextend.`]),
        };
        break;
      }
      case 'gambler': {
        for (const j of JOBS) jobBias[j] = outputOf(j) === hot ? 2.6 : 0.7;
        policy = {
          ...b, jobBias, markup: r.range(-0.1, 0.45), borrow: losing ? 1 : b.borrow,
          rationale: pick(r, [`All in on ${hot}. Borrow everything, ask questions later.`, `${hot} is up ${Math.round(m[hot].change10)}%. Leverage to the max.`, `Losing? Double the bet.`]),
        };
        break;
      }
      default: {
        // adaptive: chase margins, avoid crowded jobs, react to macro conditions
        for (const j of JOBS) {
          const g = outputOf(j);
          jobBias[j] = clampN(1 + m[g].change10 / 50 - (obs.team.jobs[j] / Math.max(1, obs.team.alive)) * 0.8, 0.4, 2.5);
        }
        const inflation = obs.economy.inflation;
        policy = {
          ...b, jobBias,
          markup: clampN(b.markup + inflation / 400, -0.2, 0.6),
          borrow: obs.economy.policyRate > 10 ? 0.05 : b.borrow + (inflation > 30 ? 0.3 : 0),
          cartel: rich ? 0.2 : b.cartel,
          rationale: pick(r, [
            `Moving workers from ${cold} into ${hot}.`,
            inflation > 30 ? `Inflation is ${Math.round(inflation)}%. Borrow now, repay in cheaper money.` : `Following the margins: ${hot} pays best right now.`,
            rich ? `We lead. Lock in gains and stay out of trouble.` : `Rank ${obs.team.rank} of ${obs.team.teams}. Time to adapt.`,
          ]),
        };
      }
    }
    return policy;
  }
}

function pick<T>(r: Rng, xs: T[]): T {
  return xs[Math.floor(r.float() * xs.length)];
}

function clampN(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
