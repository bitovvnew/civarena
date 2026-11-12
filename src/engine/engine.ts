// CivArena simulation engine.
// Each tick: produce -> eat -> pick jobs -> trade (call auctions) -> taxes & welfare -> bank -> cartels -> births & deaths.
// The engine only *decides*; every change is an event applied by the reducer in world.ts.

import { generateMap, workTile } from './map.js';
import { clear, type Order, type Party } from './market.js';
import { annualInflation, cpi, gini, round } from './metrics.js';
import { makeName } from './names.js';
import { defaultPolicy, sanitizePolicy, type Observation } from './policy.js';
import type { Brain, Scenario, ScenarioApi } from './plugins.js';
import { Rng, hashSeed } from './rng.js';
import {
  BASE_OUTPUT, BASE_PRICE, GOODS, JOBS, JOB_INPUTS, JOB_OUTPUT,
  type Agent, type Cartel, type Command, type Frame, type Good, type Headline, type HeadlineKind, type Job,
  type Metrics, type ReplayFile, type ShockKind, type TeamInfo, type TeamPolicy, type TeamScore, type WorldEvent, type WorldState,
} from './types.js';
import { agentWealth, apply, debtByAgent, emptyInventory, emptyState, moneySupply } from './world.js';

export const VERSION = '0.1.1';

// Validated categorical palette (dark steps), fixed order: blue, orange, aqua, yellow, magenta, green, violet, red.
export const TEAM_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export interface TeamSpec {
  brain: Brain;
  id?: string;
  color?: string;
}

export interface SimOptions {
  seed?: number | string;
  agents?: number;
  teams: TeamSpec[];
  scenario: Scenario;
  /** Ticks between strategy updates (one brain call per team). */
  policyEvery?: number;
  /** Keep every event in memory (tests, audits). */
  recordEvents?: boolean;
  /** Keep agent snapshots in history every N ticks (replay size vs. detail). */
  historyAgentsEvery?: number;
  onLog?: (msg: string) => void;
}

const SHOCK_TICKS: Record<ShockKind, number> = {
  drought: 45, mine_collapse: 40, tech_boom: 60, plague: 30, gold_rush: 35, trade_embargo: 50,
};

const DEFAULT_JOB_MIX: Record<Job, number> = { farmer: 0.4, lumberjack: 0.18, miner: 0.16, smith: 0.13, artisan: 0.13 };

export class Simulation {
  state: WorldState;
  readonly seed: number;
  readonly opts: Required<Omit<SimOptions, 'seed' | 'onLog'>> & { onLog: (m: string) => void };
  readonly brains = new Map<string, Brain>();
  readonly log: WorldEvent[] = [];
  readonly history: Frame[] = [];
  private rng: Rng;
  private queue: Command[] = [];
  private headlines: Headline[] = [];
  private flows: Record<string, number> = {};
  private traded = new Set<number>();
  private bankruptNow = new Set<number>();
  private births: [number, string, number][] = [];
  private cpiHistory: number[] = [];
  private priceHistory: Record<Good, number>[] = [];
  private lastReported: Record<string, number> = {};
  private richest = -1;
  private deathsWindow: number[] = [];
  private totalDeaths = 0;
  private totalBankruptcies = 0;
  private birthsWindow: number[] = [];
  private bankWasHealthy = true;
  private teamProducedWindow: Record<string, Record<Good, number>>[] = [];
  private initialPerTeam = new Map<string, number>();
  private bornPerTeam = new Map<string, number>();
  private incomeEma = new Map<number, number>();
  private jobTick = { count: zeroJobs(), net: zeroJobs() };
  /** What citizens in each job actually earned per tick lately (net of inputs). Peers watch this. */
  private jobIncome: Record<Job, number> = zeroJobs();
  private money0 = 0;
  private outOfBudget = new Set<string>();

  constructor(options: SimOptions) {
    this.seed = hashSeed(options.seed ?? 42);
    this.opts = {
      agents: options.agents ?? 500,
      teams: options.teams,
      scenario: options.scenario,
      policyEvery: options.policyEvery ?? 25,
      recordEvents: options.recordEvents ?? false,
      historyAgentsEvery: options.historyAgentsEvery ?? 5,
      onLog: options.onLog ?? (() => {}),
    };
    if (this.opts.teams.length === 0) throw new Error('At least one team is required');
    this.rng = new Rng(this.seed);
    this.state = emptyState();
    this.genesis();
  }

  // ------------------------------------------------------------- events ---

  private emit(e: WorldEvent) {
    this.state = apply(this.state, e);
    if (this.opts.recordEvents) this.log.push(e);
  }

  private headline(kind: HeadlineKind, level: 0 | 1 | 2, key: string, params: Record<string, string | number> = {}, team?: string) {
    this.headlines.push({ tick: this.state.tick, kind, level, key, params, team });
  }

  /** Only allow a headline of this kind/subject once per `gap` ticks, so the feed stays readable. */
  private throttle(key: string, gap: number): boolean {
    const last = this.lastReported[key];
    if (last !== undefined && this.state.tick - last < gap) return false;
    this.lastReported[key] = this.state.tick;
    return true;
  }

  // ------------------------------------------------------------ genesis ---

  private genesis() {
    const { scenario } = this.opts;
    const width = 72, height = 44;
    const base = emptyState();
    base.seed = this.seed;
    base.width = width;
    base.height = height;
    base.tiles = generateMap(this.seed, width, height);
    base.gov = { taxRate: 0.1, wealthTax: 0, ubi: 0, welfare: true, antitrust: false, treasury: 0, ...scenario.setup?.gov };
    base.cb.policyRate = scenario.setup?.policyRate ?? 4;
    base.market.price = { ...BASE_PRICE };
    base.market.last = { ...BASE_PRICE };
    const usedIds = new Set<string>();
    base.teams = this.opts.teams.map((spec, i): TeamInfo => {
      let id = spec.id ?? `${spec.brain.provider}:${spec.brain.model}`;
      while (usedIds.has(id)) id += "'";
      usedIds.add(id);
      this.brains.set(id, spec.brain);
      return {
        id,
        label: spec.brain.label,
        provider: spec.brain.provider,
        model: spec.brain.model,
        color: spec.color ?? TEAM_COLORS[i % TEAM_COLORS.length],
        policy: defaultPolicy(),
      };
    });
    this.emit({ t: 'genesis', state: base });

    // Fair start: every team gets the same job mix, cash and goods.
    const mix = { ...DEFAULT_JOB_MIX, ...scenario.setup?.jobs };
    const total = JOBS.reduce((s, j) => s + mix[j], 0);
    const teams = this.state.teams;
    const perTeam = Math.max(1, Math.floor(this.opts.agents / teams.length));
    const plan: Job[] = [];
    let acc = 0;
    for (const j of JOBS) {
      acc += (mix[j] / total) * perTeam;
      while (plan.length < Math.round(acc)) plan.push(j);
    }
    while (plan.length < perTeam) plan.push('farmer');
    const startCash = scenario.setup?.startCash ?? 40;
    let id = 0;
    for (let k = 0; k < perTeam; k++) {
      for (const team of teams) {
        const job = plan[k];
        const agent: Agent = {
          id,
          name: makeName(this.rng),
          team: team.id,
          job,
          cash: 0,
          inv: { ...emptyInventory(), food: 5, tools: 1 },
          health: 1,
          happiness: 0.6,
          home: workTile(this.state.tiles, width, height, job, id, this.seed),
          alive: true,
          born: 0,
          bankruptcies: 0,
          idle: 0,
          idleStreak: 0,
          lastIncome: 0,
          producedValue: 0,
        };
        this.emit({ t: 'spawn', agent });
        this.emit({ t: 'mint', to: id, amount: startCash, reason: 'endowment' });
        id++;
      }
    }
    this.money0 = moneySupply(this.state);
    for (const t of teams) {
      this.initialPerTeam.set(t.id, perTeam);
      this.bornPerTeam.set(t.id, perTeam);
    }
  }

  // ------------------------------------------------------------- public ---

  command(cmd: Command) {
    this.queue.push(cmd);
  }

  get now() {
    return this.state.tick;
  }

  names(): string[] {
    return this.state.agents.map((a) => a.name);
  }

  /** Ask every brain for a fresh team strategy. Failures keep the previous policy. */
  async refreshPolicies() {
    const s = this.state;
    const scores = this.teamScores();
    const obsList = s.teams.map((team) => this.observe(team, scores));
    const results = await Promise.all(
      s.teams.map(async (team, i) => {
        const brain = this.brains.get(team.id)!;
        try {
          return await brain.decide(obsList[i]);
        } catch (err) {
          const e = err as Error;
          if (e.name === 'BudgetExceeded') {
            if (!this.outOfBudget.has(team.id)) {
              this.outOfBudget.add(team.id);
              this.headline('policy', 2, 'h.budget', { team: team.label }, team.id);
            }
          } else this.opts.onLog(`[${team.label}] brain error: ${e.message}`);
          return null;
        }
      }),
    );
    s.teams.forEach((team, i) => {
      if (results[i] == null) return;
      const policy = sanitizePolicy(results[i], team.policy);
      const changed = JSON.stringify(policy) !== JSON.stringify(team.policy);
      if (!changed) return;
      const rationaleChanged = policy.rationale !== team.policy.rationale;
      this.emit({ t: 'policy', team: team.id, policy });
      if (rationaleChanged) this.headline('strategy', 0, 'h.strategy', { team: team.label, text: policy.rationale }, team.id);
    });
  }

  async tick(): Promise<Frame> {
    if (this.state.tick % this.opts.policyEvery === 0) await this.refreshPolicies();
    return this.step();
  }

  async run(ticks: number, onFrame?: (f: Frame) => void): Promise<Frame[]> {
    const out: Frame[] = [];
    for (let i = 0; i < ticks; i++) {
      const f = await this.tick();
      onFrame?.(f);
      out.push(f);
    }
    return out;
  }

  toReplay(scenarioId = this.opts.scenario.id, scenarioName = this.opts.scenario.name): ReplayFile {
    const s = this.state;
    return {
      format: 'civarena-replay',
      version: 1,
      createdWith: `civarena ${VERSION}`,
      scenario: scenarioId,
      scenarioName,
      seed: this.seed,
      config: {
        agents: this.opts.agents,
        ticks: s.tick,
        teams: s.teams.map((t) => ({ id: t.id, label: t.label, provider: t.provider, model: t.model, color: t.color })),
      },
      map: { width: s.width, height: s.height, tiles: s.tiles },
      names: this.names(),
      frames: this.history,
    };
  }

  // --------------------------------------------------------------- tick ---

  step(): Frame {
    const t = this.state.tick + 1;
    this.headlines = [];
    this.flows = {};
    this.traded.clear();
    this.bankruptNow.clear();
    this.births = [];
    this.emit({ t: 'tick', n: t });
    this.applyCommands();
    this.runScenario();

    const order = this.rng.shuffle(this.state.agents.filter((a) => a.alive).map((a) => a.id));
    const idle = new Set<number>();
    this.jobTick = { count: zeroJobs(), net: zeroJobs() };
    for (const id of order) if (!this.produce(id)) idle.add(id);
    for (const j of JOBS) {
      const n = this.jobTick.count[j];
      if (n > 0) this.jobIncome[j] = this.jobIncome[j] * 0.8 + (this.jobTick.net[j] / n) * 0.2;
    }
    for (const id of order) this.consume(id, idle.has(id));
    for (const id of order) if (this.state.agents[id].alive) this.chooseJob(id);
    this.trade();
    this.government();
    this.bank();
    this.cartels();
    this.birthsAndFx();
    return this.frame();
  }

  // ----------------------------------------------------------- commands ---

  private applyCommands() {
    const q = this.queue;
    this.queue = [];
    for (const c of q) {
      switch (c.type) {
        case 'tax':
          this.emit({ t: 'gov', patch: { taxRate: clamp(c.rate, 0, 0.9) } });
          this.headline('policy', 1, 'h.tax', { pct: Math.round(clamp(c.rate, 0, 0.9) * 100) });
          break;
        case 'rate':
          this.emit({ t: 'rate', policyRate: clamp(c.rate, 0, 50) });
          this.headline('policy', 1, 'h.rate', { pct: round(clamp(c.rate, 0, 50), 1) });
          break;
        case 'ubi':
          this.emit({ t: 'gov', patch: { ubi: clamp(c.amount, 0, 50) } });
          this.headline('policy', 1, c.amount > 0 ? 'h.ubi_on' : 'h.ubi_off', { amount: round(c.amount, 2) });
          break;
        case 'welfare':
          this.emit({ t: 'gov', patch: { welfare: c.on } });
          break;
        case 'antitrust':
          this.emit({ t: 'gov', patch: { antitrust: c.on } });
          this.headline('policy', 1, c.on ? 'h.antitrust_on' : 'h.antitrust_off');
          break;
        case 'print': {
          const alive = this.state.agents.filter((a) => a.alive);
          if (alive.length === 0 || c.amount <= 0) break;
          const each = c.amount / alive.length;
          for (const a of alive) this.emit({ t: 'mint', to: a.id, amount: each, reason: 'print' });
          if (this.throttle('print', 15)) this.headline('policy', 2, 'h.print', { amount: Math.round(c.amount), each: round(each, 1) });
          break;
        }
        case 'shock': {
          const until = this.state.tick + SHOCK_TICKS[c.kind];
          this.emit({ t: 'shock', shock: { kind: c.kind, until, factor: 1 } });
          this.headline('shock', 2, `h.shock.${c.kind}`, { ticks: SHOCK_TICKS[c.kind] });
          break;
        }
        default:
          break; // pause/resume/speed/reset are handled by the runner
      }
    }
  }

  private runScenario() {
    const sc = this.opts.scenario;
    if (!sc.onTick) return;
    const api: ScenarioApi = {
      tick: this.state.tick,
      state: this.state,
      rng: this.rng,
      command: (cmd) => this.queue.push(cmd),
      headline: (text, level = 1) => this.headline('milestone', level, 'h.custom', { text }),
    };
    sc.onTick(api);
    // scenario commands take effect immediately this tick
    this.applyCommands();
  }

  private shock(kind: ShockKind): boolean {
    return this.state.shocks.some((s) => s.kind === kind);
  }

  // --------------------------------------------------------- production ---

  private capacity(a: Agent): number {
    let f = BASE_OUTPUT[a.job] * (0.35 + 0.65 * a.health);
    if (a.job === 'farmer' && this.shock('drought')) f *= 0.4;
    if (a.job === 'miner' && this.shock('mine_collapse')) f *= 0.3;
    if (a.job === 'miner' && this.shock('gold_rush')) f *= 1.8;
    if (this.shock('tech_boom')) f *= a.job === 'smith' || a.job === 'artisan' ? 1.7 : 1.3;
    return f;
  }

  private produce(id: number): boolean {
    const s = this.state;
    const a = s.agents[id];
    const good = JOB_OUTPUT[a.job];
    const tooled = a.inv.tools >= 0.05;
    let qty = this.capacity(a) * (tooled ? 1.5 : 1);
    const inputs = JOB_INPUTS[a.job];
    for (const g of GOODS) {
      const per = inputs[g];
      if (per) qty = Math.min(qty, Math.max(0, (a.inv[g] - (g === 'tools' && tooled ? 0.05 : 0)) / per));
    }
    this.jobTick.count[a.job] += 1;
    if (qty < 0.05) return false;
    const used: Partial<Record<Good, number>> = {};
    let cost = 0;
    for (const g of GOODS) cost += (inputs[g] ?? 0) * qty * s.market.price[g];
    this.jobTick.net[a.job] += qty * s.market.price[good] - cost;
    for (const g of GOODS) {
      const per = inputs[g];
      if (per) used[g] = per * qty;
    }
    if (tooled) used.tools = (used.tools ?? 0) + 0.05;
    this.emit({ t: 'produce', a: id, good, qty, used, value: qty * s.market.price[good] });
    return true;
  }

  private consume(id: number, idle: boolean) {
    const a = this.state.agents[id];
    const eat = Math.min(1, Math.max(0, a.inv.food));
    if (eat > 0) this.emit({ t: 'consume', a: id, good: 'food', qty: eat });
    // food spoils, homes burn wood for heat, the comfortable enjoy luxuries
    const spoil = a.inv.food > 2 ? (a.inv.food - 2) * 0.03 : 0;
    if (spoil > 1e-6) this.emit({ t: 'consume', a: id, good: 'food', qty: spoil });
    const heat = Math.min(0.15, Math.max(0, a.inv.wood - (a.job === 'smith' || a.job === 'artisan' ? 1 : 0)));
    if (heat > 1e-6) this.emit({ t: 'consume', a: id, good: 'wood', qty: heat });
    const lux = Math.min(0.1 + a.inv.luxury * 0.15, 0.6, Math.max(0, a.inv.luxury));
    if (lux > 1e-6) this.emit({ t: 'consume', a: id, good: 'luxury', qty: lux });
    let health = a.health + (eat >= 0.999 ? 0.04 : -0.1 * (1 - eat));
    if (this.shock('plague')) health -= this.rng.range(0, 0.05);
    health = clamp(health, 0, 1);
    const happiness = clamp(a.happiness * 0.92 + 0.08 * (0.3 + Math.min(0.4, lux * 1.5) + (heat > 0.1 ? 0.1 : -0.05) + (eat >= 0.999 ? 0.1 : -0.35) + (idle ? -0.1 : 0.05)), 0, 1);
    this.emit({ t: 'vitals', a: id, health, happiness, idle });
    if (health <= 0) this.kill(id, this.shock('plague') ? 'plague' : 'starvation');
  }

  private kill(id: number, cause: 'starvation' | 'plague' | 'old_age') {
    const s = this.state;
    const a = s.agents[id];
    for (const l of s.loans.filter((x) => x.agent === id)) this.emit({ t: 'default', a: id, loan: l.id, writeOff: l.principal });
    if (a.cash > 0) this.emit({ t: 'transfer', from: id, to: 'gov', amount: a.cash, reason: 'estate' });
    this.emit({ t: 'death', a: id, cause });
    this.totalDeaths++;
    this.deathsWindow.push(s.tick);
    if (this.totalDeaths === 1) this.headline('starvation', 2, 'h.first_death', { name: a.name, team: this.teamLabel(a.team) }, a.team);
  }

  // --------------------------------------------------------------- jobs ---

  private chooseJob(id: number) {
    const s = this.state;
    const a = s.agents[id];
    const due = (s.tick + id) % 12 === 0 || (a.idleStreak >= 3 && (s.tick + id) % 3 === 0);
    if (!due) return;
    const P = this.policy(a.team);
    const p = s.market.price;
    let best: Job = a.job;
    let bestScore = -Infinity;
    for (const j of JOBS) {
      let cost = 0;
      const inputs = JOB_INPUTS[j];
      for (const g of GOODS) cost += (inputs[g] ?? 0) * p[g];
      const theory = BASE_OUTPUT[j] * 1.25 * Math.max(0.05, p[JOB_OUTPUT[j]] - cost);
      const realized = this.jobTick.count[j] > 0 ? Math.max(0.05, this.jobIncome[j]) : theory;
      let score = (0.35 * theory + 0.65 * realized) * P.jobBias[j] * (1 + 0.25 * this.rng.normal());
      if (j === a.job) score *= a.idleStreak >= 3 ? 0.6 : 1.6;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (best === a.job || !this.rng.chance(a.idleStreak >= 3 ? 0.5 : 0.15)) return;
    const fee = Math.min(Math.max(0, a.cash), 2 * p.food);
    if (fee > 0) this.emit({ t: 'transfer', from: id, to: 'gov', amount: fee, reason: 'job_fee' });
    this.emit({ t: 'job', a: id, job: best });
  }

  // ------------------------------------------------------------ markets ---

  private trade() {
    const s = this.state;
    const p = s.market.price;
    const bids: Record<Good, Order[]> = { food: [], wood: [], ore: [], tools: [], luxury: [] };
    const asks: Record<Good, Order[]> = { food: [], wood: [], ore: [], tools: [], luxury: [] };
    const cheaters = new Map<number, number>(); // agent -> cartel id
    let seq = 0;
    const alive = s.agents.filter((a) => a.alive);
    for (const a of alive) {
      const P = this.policy(a.team);
      const cap = this.capacity(a) * 1.5;
      const inputs = JOB_INPUTS[a.job];
      const desperate = a.inv.food < 1 && a.cash < p.food;
      const cartel = a.cartel !== undefined ? s.cartels.find((c) => c.id === a.cartel) : undefined;
      // ---- sell
      for (const g of GOODS) {
        let reserve = g === 'food' ? 3 : (inputs[g] ?? 0) * cap * 2;
        if (g === 'tools' && a.job !== 'smith') reserve = Math.max(reserve, 1);
        const surplus = a.inv[g] - reserve;
        if (surplus <= 0.05) continue;
        let limit = p[g] * (1 + P.markup);
        if (a.inv[g] > 12) limit *= Math.max(0.55, 1 - 0.02 * (a.inv[g] - 12));
        if (desperate) limit = p[g] * 0.7;
        if (cartel && cartel.good === g) {
          const pressure = a.inv[g] > 10 ? 2 : 1;
          if (this.rng.chance(P.cheat * 0.04 * pressure)) {
            limit = cartel.floor * 0.85;
            cheaters.set(a.id, cartel.id);
          } else limit = Math.max(limit, cartel.floor);
        }
        limit *= 1 + 0.04 * this.rng.normal();
        asks[g].push({ party: a.id, qty: surplus, limit: Math.max(0.01, limit), seq: seq++ });
      }
      // ---- buy
      let budget = Math.max(0, a.cash);
      const buy = (g: Good, qty: number, limit: number) => {
        limit = Math.max(0.01, limit * (1 + 0.03 * this.rng.normal()));
        const q = Math.min(qty, budget / limit);
        if (q <= 0.02) return;
        budget -= q * limit;
        bids[g].push({ party: a.id, qty: q, limit, seq: seq++ });
      };
      if (a.inv.food < 3) {
        const urgency = a.inv.food < 1 ? 1.5 : 1 + (1 - a.health) * 0.4;
        buy('food', 4 - a.inv.food, p.food * (1 + P.bidPremium) * urgency);
      }
      let inputCost = 0;
      for (const g of GOODS) inputCost += (inputs[g] ?? 0) * p[g];
      const worthIt = p[JOB_OUTPUT[a.job]] > inputCost * 1.02;
      if (worthIt) {
        for (const g of GOODS) {
          const per = inputs[g];
          if (!per) continue;
          const want = per * cap * 2 - a.inv[g];
          if (want > 0.05) buy(g, want, p[g] * (1 + P.bidPremium));
        }
      }
      if (a.inv.tools < 0.3 && a.job !== 'smith' && budget > p.tools * 2) buy('tools', 1, p.tools * (1 + P.bidPremium));
      if (a.inv.wood < 0.5 && a.job !== 'lumberjack' && budget > p.food * 3) buy('wood', 1, p.wood * (1 + P.bidPremium));
      const comfy = P.savings * p.food;
      if (budget > comfy * 1.5 && a.inv.luxury < 4) buy('luxury', Math.min(3, ((budget - comfy) * 0.4) / p.luxury), p.luxury * (1 + P.bidPremium));
    }

    // ---- the outside world: imports at a ceiling, exports at a floor (both float with the exchange rate)
    const embargo = this.shock('trade_embargo');
    const fx = s.ledger.fx;
    // The merchant can only spend money it earned from our imports (plus a small reserve),
    // so trade balances out over time and money does not leak away forever.
    const wallet = Math.max(0, this.money0 * 0.05 + s.ledger.imports - s.ledger.exports);
    const eagerness = clamp(wallet / Math.max(1, moneySupply(s) * 0.15), 0, 0.6);
    for (const g of GOODS) {
      let ceiling = BASE_PRICE[g] * 2.2 * fx;
      let floor = BASE_PRICE[g] * 0.45 * fx;
      const bid = Math.min(p[g] * 0.95, floor + (BASE_PRICE[g] * fx - floor) * eagerness);
      if (g === 'ore' && this.shock('gold_rush')) floor = BASE_PRICE[g] * 1.1 * fx;
      if (!embargo) {
        asks[g].push({ party: 'foreign', qty: Infinity, limit: ceiling, seq: seq++ });
        if (wallet > 1) bids[g].push({ party: 'foreign', qty: wallet / 5 / Math.max(floor, bid), limit: Math.max(floor, bid), seq: seq++ });
      } else {
        ceiling = Infinity;
        floor = 0;
      }
      const res = clear(bids[g], asks[g], embargo ? undefined : { min: floor, max: ceiling });
      let volume = 0;
      for (const f of res.fills) {
        let q = f.qty;
        if (f.buyer !== 'foreign') q = Math.min(q, Math.max(0, s.agents[f.buyer].cash) / res.price);
        if (f.seller !== 'foreign') q = Math.min(q, Math.max(0, s.agents[f.seller].inv[g]));
        if (q <= 1e-6) continue;
        this.emit({ t: 'trade', good: g, buyer: f.buyer, seller: f.seller, qty: q, price: res.price });
        volume += q;
        const sellerTeam = this.partyTeam(f.seller);
        const buyerTeam = this.partyTeam(f.buyer);
        const k = `${sellerTeam}>${buyerTeam}`;
        this.flows[k] = (this.flows[k] ?? 0) + q * res.price;
        if (f.buyer !== 'foreign') this.traded.add(f.buyer);
        if (f.seller !== 'foreign') this.traded.add(f.seller);
      }
      // ---- price discovery
      const ref = p[g];
      let next = ref;
      if (volume > 0) next = ref * 0.75 + res.price * 0.25;
      else if (res.demand > res.supply) next = ref * 1.04;
      else if (res.supply > 0) next = ref * 0.97;
      if (!embargo) next = Math.min(ceiling * 1.05, Math.max(floor * 0.95, next));
      next = Math.max(0.05, next);
      this.emit({ t: 'price', good: g, price: next, last: volume > 0 ? res.price : s.market.last[g], volume });
    }

    // ---- cartel cheaters get caught?
    for (const [agentId, cartelId] of cheaters) {
      const c = s.cartels.find((x) => x.id === cartelId);
      if (!c || !this.traded.has(agentId)) continue;
      if (this.rng.chance(0.6)) {
        const a = s.agents[agentId];
        this.emit({ t: 'cartel_break', id: cartelId, reason: 'defection', by: agentId });
        this.headline('cartel_break', 2, 'h.cartel_defect', { name: a.name, team: this.teamLabel(a.team), good: c.good }, a.team);
      }
    }
  }

  private partyTeam(p: Party): string {
    return p === 'foreign' ? 'world' : this.state.agents[p].team;
  }

  // --------------------------------------------------------- government ---

  private government() {
    const s = this.state;
    const p = s.market.price;
    const alive = s.agents.filter((a) => a.alive);
    // income tax on today's sales
    for (const a of alive) {
      const ema = this.incomeEma.get(a.id) ?? 0;
      this.incomeEma.set(a.id, ema * 0.9 + a.lastIncome * 0.1);
      if (a.lastIncome <= 0 || s.gov.taxRate <= 0) continue;
      const tax = Math.min(Math.max(0, a.cash), a.lastIncome * s.gov.taxRate);
      if (tax > 0) this.emit({ t: 'transfer', from: a.id, to: 'gov', amount: tax, reason: 'tax' });
    }
    // wealth tax on the rich
    if (s.gov.wealthTax > 0) {
      const threshold = 150 * p.food;
      for (const a of alive) {
        const w = agentWealth(s, a.id);
        if (w <= threshold) continue;
        const tax = Math.min(Math.max(0, a.cash), (w - threshold) * s.gov.wealthTax);
        if (tax > 0) this.emit({ t: 'transfer', from: a.id, to: 'gov', amount: tax, reason: 'wealth_tax' });
      }
    }
    // welfare: food money for the starving
    if (s.gov.welfare) {
      for (const a of alive) {
        if (a.inv.food >= 1 || a.cash >= p.food * 1.2) continue;
        const grant = Math.min(s.gov.treasury, p.food * 2);
        if (grant <= 0.01) break;
        this.emit({ t: 'transfer', from: 'gov', to: a.id, amount: grant, reason: 'welfare' });
      }
    }
    // universal basic income
    if (s.gov.ubi > 0 && alive.length > 0) {
      const each = Math.min(s.gov.ubi, s.gov.treasury / alive.length);
      if (each > 0.001) for (const a of alive) this.emit({ t: 'transfer', from: 'gov', to: a.id, amount: each, reason: 'ubi' });
    }
    // public spending: a government does not hoard cash forever
    const cap = alive.length * 4 * Math.max(1, p.food / 4);
    if (s.gov.treasury > cap && alive.length > 0) {
      const each = ((s.gov.treasury - cap) * 0.25) / alive.length;
      for (const a of alive) this.emit({ t: 'transfer', from: 'gov', to: a.id, amount: each, reason: 'ubi' });
    }
    // charity inside teams
    for (const team of s.teams) {
      const P = team.policy;
      if (P.charity <= 0.01) continue;
      const members = alive.filter((a) => a.team === team.id);
      const needy = members.filter((a) => a.inv.food < 1 && a.cash < p.food * 1.5);
      if (needy.length === 0) continue;
      const donors = members.filter((a) => a.cash > P.savings * p.food * 2);
      let di = 0;
      for (const n of needy) {
        if (di >= donors.length) break;
        const d = donors[di++];
        const gift = Math.min(p.food * 3, (d.cash - P.savings * p.food * 2) * P.charity);
        if (gift > 0.05) this.emit({ t: 'transfer', from: d.id, to: n.id, amount: gift, reason: 'charity' });
      }
    }
  }

  // --------------------------------------------------------------- bank ---

  private bank() {
    const s = this.state;
    const p = s.market.price;
    // repayments and defaults
    for (const loan of [...s.loans]) {
      const a = s.agents[loan.agent];
      const principal = Math.min(loan.payment, loan.principal);
      const interest = loan.principal * loan.rate;
      if (a.cash >= principal + interest) {
        this.emit({ t: 'repay', loan: loan.id, principal, interest });
        continue;
      }
      this.emit({ t: 'missed', loan: loan.id });
      const cur = s.loans.find((l) => l.id === loan.id);
      if (cur && cur.missed >= 4) {
        const wealthBefore = agentWealth(s, a.id);
        for (const g of GOODS) {
          const keep = g === 'food' ? Math.min(1, a.inv[g]) : 0;
          const q = a.inv[g] - keep;
          if (q > 1e-6) this.emit({ t: 'seize', a: a.id, good: g, qty: q });
        }
        this.emit({ t: 'default', a: a.id, loan: loan.id, writeOff: cur.principal });
        this.totalBankruptcies++;
        this.bankruptNow.add(a.id);
        if (this.throttle(`bankrupt`, 8) || wealthBefore > 120 * p.food) {
          this.headline('bankrupt', 1, 'h.bankrupt', { name: a.name, team: this.teamLabel(a.team), debt: Math.round(cur.principal) }, a.team);
        }
      }
    }
    // new loans
    const capital = s.cb.bankCash - s.cb.writeOffs;
    const crunch = capital < 0 ? 0.3 : 1;
    const rateDrag = Math.max(0.1, 1 - s.cb.policyRate / 20);
    const hasLoan = new Set(s.loans.map((l) => l.agent));
    for (const a of s.agents) {
      if (!a.alive || hasLoan.has(a.id) || a.health < 0.3) continue;
      const P = this.policy(a.team);
      const P_cashLow = a.cash < P.savings * p.food * 0.6;
      const wantsToExpand = P.borrow > 0.6 && a.cash < P.savings * p.food * 2;
      if (!P_cashLow && !wantsToExpand) continue;
      const burned = a.bankruptcies > 0 ? 0.12 : 1; // banks remember who defaulted
      if (!this.rng.chance(P.borrow * 0.08 * crunch * rateDrag * burned)) continue;
      const income = this.incomeEma.get(a.id) ?? 0;
      if (income < p.food * 0.2 && !this.rng.chance(0.3)) continue; // bank checks your income
      const principal = p.food * (15 + 25 * P.borrow);
      const rate = (s.cb.policyRate + 4) / 100 / 100;
      const loan = { id: s.nextId.loan, agent: a.id, principal, rate, payment: principal / 60, issuedAt: s.tick, missed: 0 };
      this.emit({ t: 'mint', to: a.id, amount: principal, reason: 'loan' });
      this.emit({ t: 'loan', loan });
    }
    // bank profits flow to the treasury
    const alive = s.agents.reduce((n, a) => n + (a.alive ? 1 : 0), 0);
    const keep = 400 + alive * 2;
    if (s.cb.bankCash > keep) this.emit({ t: 'transfer', from: 'bank', to: 'gov', amount: (s.cb.bankCash - keep) * 0.5, reason: 'dividend' });
    const cap2 = s.cb.bankCash - s.cb.writeOffs;
    if (cap2 < 0 && this.bankWasHealthy) {
      this.headline('bank_crisis', 2, 'h.bank_crisis', { loss: Math.round(-cap2) });
      this.bankWasHealthy = false;
    } else if (cap2 > 100) this.bankWasHealthy = true;
  }

  // ------------------------------------------------------------ cartels ---

  private cartels() {
    const s = this.state;
    const p = s.market.price;
    // antitrust & natural collapse
    for (const c of [...s.cartels]) {
      if (c.members.length < 3) {
        this.emit({ t: 'cartel_break', id: c.id, reason: 'collapse' });
        this.headline('cartel_break', 1, 'h.cartel_collapse', { good: c.good });
        continue;
      }
      if (s.gov.antitrust && this.rng.chance(0.06)) {
        for (const m of c.members) {
          const a = s.agents[m];
          const fine = Math.max(0, a.cash) * 0.15;
          if (fine > 0) this.emit({ t: 'transfer', from: m, to: 'gov', amount: fine, reason: 'fine' });
        }
        this.emit({ t: 'cartel_break', id: c.id, reason: 'antitrust' });
        this.headline('cartel_break', 2, 'h.cartel_antitrust', { good: c.good, count: c.members.length });
      }
    }
    // formation
    if (s.tick % 5 !== 0) return;
    for (const g of GOODS) {
      if (s.cartels.some((c) => c.good === g)) continue;
      const producers = s.agents.filter((a) => a.alive && JOB_OUTPUT[a.job] === g);
      if (producers.length < 4) continue;
      const willing = producers.filter((a) => a.cartel === undefined && this.rng.chance(this.policy(a.team).cartel));
      if (willing.length < 3 || willing.length / producers.length < 0.35) continue;
      const avg = willing.reduce((x, a) => x + this.policy(a.team).cartel, 0) / willing.length;
      if (!this.rng.chance(0.12 * avg)) continue;
      const members = willing.sort((x, y) => y.inv[g] - x.inv[g] || x.id - y.id).slice(0, 15).map((a) => a.id);
      const teams = [...new Set(members.map((m) => s.agents[m].team))];
      const cartel: Cartel = { id: s.nextId.cartel, good: g, members, floor: p[g] * (1.2 + 0.3 * avg), formedAt: s.tick, teams };
      this.emit({ t: 'cartel_form', cartel });
      this.headline('cartel_form', 2, 'h.cartel_form', {
        count: members.length, good: g, floor: round(cartel.floor, 2), teams: teams.map((x) => this.teamLabel(x)).join(' + '),
      }, teams.length === 1 ? teams[0] : undefined);
    }
  }

  // ----------------------------------------------------- births & money ---

  private birthsAndFx() {
    const s = this.state;
    const p = s.market.price;
    const aliveCount = s.agents.reduce((n, a) => n + (a.alive ? 1 : 0), 0);
    const cap = this.opts.agents * 1.6;
    if (aliveCount < cap) {
      for (const a of [...s.agents]) {
        if (!a.alive || a.health < 0.85 || a.cash < 100 * p.food || a.happiness < 0.5) continue;
        if (!this.rng.chance(0.0025)) continue;
        const P = this.policy(a.team);
        let job: Job = 'farmer';
        let best = -1;
        for (const j of JOBS) {
          const sc = P.jobBias[j] * (0.8 + 0.4 * this.rng.float());
          if (sc > best) { best = sc; job = j; }
        }
        const id = s.nextId.agent;
        const child: Agent = {
          id, name: makeName(this.rng), team: a.team, job, cash: 0, inv: emptyInventory(), health: 1, happiness: 0.7,
          home: workTile(s.tiles, s.width, s.height, job, id, s.seed), alive: true, born: s.tick, bankruptcies: 0,
          idle: 0, idleStreak: 0, lastIncome: 0, producedValue: 0, parent: a.id,
        };
        this.emit({ t: 'spawn', agent: child });
        this.emit({ t: 'transfer', from: a.id, to: id, amount: a.cash * 0.25, reason: 'inheritance' });
        this.bornPerTeam.set(a.team, (this.bornPerTeam.get(a.team) ?? 0) + 1);
        this.births.push([id, child.name, s.teams.findIndex((t) => t.id === a.team)]);
        this.birthsWindow.push(s.tick);
      }
    }
    // floating exchange rate
    // printing money weakens the currency abroad; imports get pricier, exports cheaper
    const target = (this.money0 + s.cb.printed) / Math.max(1, this.money0);
    this.emit({ t: 'fx', rate: s.ledger.fx * 0.97 + target * 0.03 });
  }

  // ------------------------------------------------------------- frames ---

  private policy(teamId: string): TeamPolicy {
    return this.state.teams.find((t) => t.id === teamId)!.policy;
  }

  private teamLabel(teamId: string): string {
    return this.state.teams.find((t) => t.id === teamId)?.label ?? teamId;
  }

  teamScores(): TeamScore[] {
    const s = this.state;
    const debts = debtByAgent(s);
    const T = s.teams.length;
    const rows = s.teams.map((team) => {
      const members = s.agents.filter((a) => a.team === team.id);
      const alive = members.filter((a) => a.alive);
      const wealths = alive.map((a) => agentWealth(s, a.id, debts));
      const wealth = wealths.reduce((x, y) => x + y, 0);
      const produced = members.reduce((x, a) => x + a.producedValue, 0);
      return { team, alive: alive.length, wealth, produced, gini: gini(wealths), bankruptcies: members.reduce((x, a) => x + a.bankruptcies, 0) };
    });
    const totalWealth = rows.reduce((x, r) => x + Math.max(0, r.wealth), 0) || 1;
    const totalProduced = rows.reduce((x, r) => x + r.produced, 0) || 1;
    return rows.map((r) => {
      const wealthShare = Math.max(0, r.wealth) / totalWealth;
      const gdpShare = r.produced / totalProduced;
      const survival = r.alive / (this.initialPerTeam.get(r.team.id) || 1);
      const score = 30 * wealthShare * T + 30 * gdpShare * T + 25 * Math.min(1.5, survival) + 15 * (1 - r.gini);
      return {
        id: r.team.id, label: r.team.label, provider: r.team.provider, model: r.team.model, color: r.team.color,
        alive: r.alive, born: this.bornPerTeam.get(r.team.id) ?? r.alive, wealth: round(r.wealth, 0),
        wealthShare: round(wealthShare, 4), gdpShare: round(gdpShare, 4), survival: round(survival, 3), gini: round(r.gini, 3),
        bankruptcies: r.bankruptcies, score: round(score, 1), rationale: r.team.policy.rationale,
      };
    });
  }

  private observe(team: TeamInfo, scores: TeamScore[]): Observation {
    const s = this.state;
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const me = scores.find((x) => x.id === team.id)!;
    const members = s.agents.filter((a) => a.alive && a.team === team.id);
    const jobs = { farmer: 0, lumberjack: 0, miner: 0, smith: 0, artisan: 0 } as Record<Job, number>;
    for (const a of members) jobs[a.job]++;
    const prev = this.priceHistory[Math.max(0, this.priceHistory.length - 10)] ?? s.market.price;
    const market = {} as Observation['market'];
    for (const g of GOODS) {
      market[g] = { price: round(s.market.price[g], 2), change10: round(((s.market.price[g] / prev[g]) - 1) * 100, 1), volume: round(s.market.volume[g], 1) };
    }
    const last = this.history[this.history.length - 1]?.m;
    return {
      tick: s.tick,
      team: {
        id: team.id, label: team.label, alive: me.alive, startPopulation: this.initialPerTeam.get(team.id) ?? 0, wealth: me.wealth,
        wealthShare: me.wealthShare, gdpShare: me.gdpShare, rank: sorted.findIndex((x) => x.id === team.id) + 1, teams: scores.length,
        jobs, bankruptcies: me.bankruptcies, avgCash: round(members.reduce((x, a) => x + a.cash, 0) / Math.max(1, members.length), 1),
        hungry: members.filter((a) => a.inv.food < 1).length,
      },
      market,
      economy: {
        gdp: round(last?.gdp ?? 0, 1), inflation: round(last?.inflation ?? 0, 1), unemployment: round(last?.unemployment ?? 0, 3),
        gini: round(last?.gini ?? 0, 3), taxRate: s.gov.taxRate, policyRate: s.cb.policyRate, ubi: s.gov.ubi, antitrust: s.gov.antitrust,
        cartels: s.cartels.map((c) => ({ good: c.good, floor: round(c.floor, 2), yourMembers: c.members.filter((m) => s.agents[m].team === team.id).length })),
        shocks: s.shocks.map((x) => x.kind),
      },
      previous: team.policy,
    };
  }

  private frame(): Frame {
    const s = this.state;
    const p = s.market.price;
    const debts = debtByAgent(s);
    const alive = s.agents.filter((a) => a.alive);
    const wealths = alive.map((a) => agentWealth(s, a.id, debts));
    const c = cpi(p);
    this.cpiHistory.push(c);
    this.priceHistory.push({ ...p });
    const window = Math.min(50, this.cpiHistory.length - 1);
    const then = this.cpiHistory[this.cpiHistory.length - 1 - window] ?? c;
    const loans = s.loans.reduce((x, l) => x + l.principal, 0);
    const m: Metrics = {
      gdp: round(s.tick_gdp, 2),
      cpi: round(c, 2),
      inflation: round(window >= 40 ? annualInflation(c, then, window) : 0, 2),
      unemployment: round(alive.length ? alive.filter((a) => a.idleStreak >= 2).length / alive.length : 0, 4),
      gini: round(gini(wealths), 4),
      money: round(moneySupply(s), 2),
      population: alive.length,
      treasury: round(s.gov.treasury, 2),
      bankCapital: round(s.cb.bankCash - s.cb.writeOffs, 2),
      policyRate: s.cb.policyRate,
      taxRate: s.gov.taxRate,
      loans: round(loans, 2),
      deaths: this.totalDeaths,
      bankruptcies: this.totalBankruptcies,
    };
    this.detectStories(m, alive, wealths);
    const teams = this.teamScores();
    const teamIdx = new Map(s.teams.map((t, i) => [t.id, i]));
    const jobIdx = new Map(JOBS.map((j, i) => [j, i]));
    const hasLoan = new Set(s.loans.map((l) => l.agent));
    const agents = alive.map((a, i) => {
      let flags = 0;
      if (a.cartel !== undefined) flags |= 1;
      if (a.inv.food < 1) flags |= 2;
      if (this.traded.has(a.id)) flags |= 4;
      if (hasLoan.has(a.id)) flags |= 8;
      if (this.bankruptNow.has(a.id)) flags |= 16;
      return [a.id, teamIdx.get(a.team) ?? 0, jobIdx.get(a.job) ?? 0, Math.round(wealths[i]), Math.round(a.health * 100), flags];
    });
    const flows: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.flows)) flows[k] = round(v, 2);
    const frame: Frame = {
      tick: s.tick,
      m,
      prices: Object.fromEntries(GOODS.map((g) => [g, round(p[g], 3)])) as Record<Good, number>,
      volumes: Object.fromEntries(GOODS.map((g) => [g, round(s.market.volume[g], 2)])) as Record<Good, number>,
      teams,
      headlines: this.headlines,
      flows,
      agents,
      births: this.births.length ? this.births : undefined,
      cartels: s.cartels.map((x) => ({ id: x.id, good: x.good, members: x.members.length, floor: round(x.floor, 2), teams: x.teams })),
      gov: { taxRate: s.gov.taxRate, wealthTax: s.gov.wealthTax, ubi: s.gov.ubi, welfare: s.gov.welfare, antitrust: s.gov.antitrust, treasury: round(s.gov.treasury, 2) },
      shocks: s.shocks.map((x) => ({ kind: x.kind, until: x.until })),
    };
    const stored = s.tick % this.opts.historyAgentsEvery === 0 || s.tick === 1 ? frame : { ...frame, agents: undefined };
    this.history.push(stored);
    return frame;
  }

  private detectStories(m: Metrics, alive: Agent[], wealths: number[]) {
    const s = this.state;
    const t = s.tick;
    // price spikes / crashes vs. 10 ticks ago
    if (this.priceHistory.length > 10) {
      const then = this.priceHistory[this.priceHistory.length - 11];
      for (const g of GOODS) {
        const ch = s.market.price[g] / then[g] - 1;
        if (ch > 0.3 && this.throttle(`spike:${g}`, 25)) this.headline('price_spike', 1, 'h.price_spike', { good: g, pct: Math.round(ch * 100), price: round(s.market.price[g], 2) });
        if (ch < -0.3 && this.throttle(`crash:${g}`, 25)) this.headline('price_crash', 1, 'h.price_crash', { good: g, pct: Math.round(-ch * 100), price: round(s.market.price[g], 2) });
      }
    }
    // starvation waves
    this.deathsWindow = this.deathsWindow.filter((x) => x > t - 10);
    if (this.deathsWindow.length >= 3 && this.throttle('starve', 15)) this.headline('starvation', 2, 'h.starvation', { count: this.deathsWindow.length });
    // richest citizen
    if (t % 10 === 0 && alive.length) {
      let bi = 0;
      for (let i = 1; i < wealths.length; i++) if (wealths[i] > wealths[bi]) bi = i;
      const top = alive[bi];
      if (top.id !== this.richest) {
        if (this.richest !== -1) this.headline('richest', 1, 'h.richest', { name: top.name, team: this.teamLabel(top.team), wealth: Math.round(wealths[bi]), job: top.job }, top.team);
        this.richest = top.id;
      }
    }
    // monopolies: one team makes >60% of a good
    const prod: Record<string, Record<Good, number>> = {};
    for (const a of alive) {
      const g = JOB_OUTPUT[a.job];
      prod[a.team] ??= { food: 0, wood: 0, ore: 0, tools: 0, luxury: 0 };
      prod[a.team][g] += 1;
    }
    this.teamProducedWindow.push(prod);
    if (t % 25 === 0 && s.teams.length > 1) {
      for (const g of GOODS) {
        const total = s.teams.reduce((x, team) => x + (prod[team.id]?.[g] ?? 0), 0);
        if (total < 6) continue;
        for (const team of s.teams) {
          const share = (prod[team.id]?.[g] ?? 0) / total;
          if (share > 0.6 && this.throttle(`mono:${g}`, 100)) this.headline('monopoly', 2, 'h.monopoly', { team: team.label, good: g, pct: Math.round(share * 100) }, team.id);
        }
      }
    }
    if (this.teamProducedWindow.length > 30) this.teamProducedWindow.shift();
    // baby boom
    this.birthsWindow = this.birthsWindow.filter((x) => x > t - 20);
    if (this.birthsWindow.length >= 8 && this.throttle('boom', 60)) this.headline('baby_boom', 1, 'h.baby_boom', { count: this.birthsWindow.length });
    // hyperinflation
    if (m.inflation > 200 && this.throttle('hyper', 50)) this.headline('price_spike', 2, 'h.hyperinflation', { pct: Math.round(m.inflation) });
    // years
    if (t % 100 === 0) this.headline('milestone', 0, 'h.year', { year: t / 100, gdp: Math.round(m.gdp), pop: m.population, inflation: round(m.inflation, 1) });
  }
}

function zeroJobs(): Record<Job, number> {
  return { farmer: 0, lumberjack: 0, miner: 0, smith: 0, artisan: 0 };
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
}
