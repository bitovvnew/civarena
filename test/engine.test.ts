import { describe, expect, it } from 'vitest';
import { brainFromSpec, DEMO_TEAMS, extractJson, MockBrain } from '../src/brains/index.js';
import { Simulation } from '../src/engine/engine.js';
import { clear } from '../src/engine/market.js';
import { cpi, gini } from '../src/engine/metrics.js';
import { defaultPolicy, sanitizePolicy } from '../src/engine/policy.js';
import { Rng, hashSeed } from '../src/engine/rng.js';
import { BASE_PRICE, GOODS, type WorldState } from '../src/engine/types.js';
import { apply, emptyState, expectedMoney, moneySupply } from '../src/engine/world.js';
import { BUILTIN, classic, hyperinflation } from '../src/scenarios/index.js';

const demoTeams = () => DEMO_TEAMS.map((s) => ({ brain: brainFromSpec(s) }));
const make = (opts: Partial<ConstructorParameters<typeof Simulation>[0]> = {}) =>
  new Simulation({ seed: 7, agents: 120, teams: demoTeams(), scenario: classic, ...opts });

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(123), b = new Rng(123), c = new Rng(124);
    const xa = Array.from({ length: 5 }, () => a.float());
    const xb = Array.from({ length: 5 }, () => b.float());
    expect(xa).toEqual(xb);
    expect(xa).not.toEqual(Array.from({ length: 5 }, () => c.float()));
    for (const x of xa) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThan(1);
  });
  it('hashes human seeds', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'));
    expect(hashSeed('42')).toBe(42);
  });
});

describe('market clearing', () => {
  it('matches the crossing orders at a single price', () => {
    const r = clear(
      [{ party: 1, qty: 5, limit: 10, seq: 0 }, { party: 2, qty: 5, limit: 6, seq: 1 }],
      [{ party: 3, qty: 4, limit: 5, seq: 2 }, { party: 4, qty: 10, limit: 8, seq: 3 }],
    );
    expect(r.volume).toBe(5);
    // marginal pair is bid 10 / ask 8 -> price 9; every buyer pays <= its limit, every seller gets >= its limit
    expect(r.price).toBe(9);
    expect(r.fills).toEqual([
      { buyer: 1, seller: 3, qty: 4 },
      { buyer: 1, seller: 4, qty: 1 },
    ]);
  });
  it('does not trade when bids are below asks', () => {
    const r = clear([{ party: 1, qty: 1, limit: 2, seq: 0 }], [{ party: 2, qty: 1, limit: 3, seq: 1 }]);
    expect(r.volume).toBe(0);
    expect(r.fills).toHaveLength(0);
  });
  it('never lets an agent trade with itself', () => {
    const r = clear([{ party: 1, qty: 1, limit: 9, seq: 0 }], [{ party: 1, qty: 1, limit: 1, seq: 1 }]);
    expect(r.volume).toBe(0);
  });
});

describe('metrics', () => {
  it('computes Gini', () => {
    expect(gini([1, 1, 1, 1])).toBeCloseTo(0);
    expect(gini([0, 0, 0, 10])).toBeCloseTo(0.75);
    expect(gini([])).toBe(0);
  });
  it('CPI is 100 at base prices', () => {
    expect(cpi({ ...BASE_PRICE })).toBeCloseTo(100);
  });
});

describe('policies', () => {
  it('clamps anything a model returns', () => {
    const p = sanitizePolicy({ markup: 99, borrow: -3, jobBias: { farmer: 'lots' }, rationale: 'x'.repeat(500) });
    expect(p.markup).toBe(1.5);
    expect(p.borrow).toBe(0);
    expect(p.jobBias.farmer).toBe(defaultPolicy().jobBias.farmer);
    expect(p.rationale.length).toBeLessThanOrEqual(160);
    expect(sanitizePolicy(null)).toEqual(defaultPolicy());
  });
  it('extracts JSON from chatty model replies', () => {
    expect(extractJson('Sure! ```json\n{"markup": 0.2, "rationale": "a {brace} inside"}\n```')).toEqual({ markup: 0.2, rationale: 'a {brace} inside' });
    expect(() => extractJson('no json here')).toThrow();
  });
  it('parses team specs', () => {
    expect(brainFromSpec('mock:tycoon').label).toBe('Tycoons');
    expect(() => brainFromSpec('mock:nope')).toThrow();
    expect(() => brainFromSpec('anthropic:claude-opus-5-5', 1, {})).toThrow(/ANTHROPIC_API_KEY/);
    expect(brainFromSpec('ollama:llama3.1', 1, {}).provider).toBe('ollama');
  });
});

describe('simulation', () => {
  it('gives every team the same start', () => {
    const sim = make();
    const byTeam = new Map<string, { n: number; cash: number; jobs: string }>();
    for (const t of sim.state.teams) {
      const members = sim.state.agents.filter((a) => a.team === t.id);
      byTeam.set(t.id, { n: members.length, cash: members.reduce((x, a) => x + a.cash, 0), jobs: members.map((a) => a.job).sort().join() });
    }
    const vals = [...byTeam.values()];
    for (const v of vals) expect(v).toEqual(vals[0]);
  });

  it('is deterministic for the same seed', async () => {
    const a = make(), b = make();
    await a.run(60);
    await b.run(60);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    const c = make({ seed: 8 });
    await c.run(60);
    expect(JSON.stringify(c.state)).not.toBe(JSON.stringify(a.state));
  });

  it('is a pure reduction of its event log (event sourcing)', async () => {
    const sim = make({ recordEvents: true });
    await sim.run(80);
    let rebuilt: WorldState = emptyState();
    for (const e of sim.log) rebuilt = apply(rebuilt, e);
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(sim.state));
  });

  it('never creates or destroys money outside the ledger', async () => {
    for (const scenario of [classic, hyperinflation]) {
      const sim = new Simulation({ seed: 3, agents: 120, teams: demoTeams(), scenario });
      await sim.run(150);
      expect(moneySupply(sim.state)).toBeCloseTo(expectedMoney(sim.state, 0), 4);
    }
  });

  it('keeps inventories and health in range', async () => {
    const sim = make();
    await sim.run(120);
    for (const a of sim.state.agents) {
      for (const g of GOODS) expect(a.inv[g]).toBeGreaterThan(-1e-6);
      expect(a.health).toBeGreaterThanOrEqual(0);
      expect(a.health).toBeLessThanOrEqual(1);
    }
    for (const g of GOODS) expect(sim.state.market.price[g]).toBeGreaterThan(0);
  });

  it('produces frames with metrics, leaderboard and headlines', async () => {
    const sim = make();
    const frames = await sim.run(120);
    const last = frames[frames.length - 1];
    expect(last.tick).toBe(120);
    expect(last.teams).toHaveLength(4);
    expect(last.m.population).toBeGreaterThan(0);
    expect(last.agents?.length).toBe(last.m.population);
    expect(frames.flatMap((f) => f.headlines).length).toBeGreaterThan(3);
    const shares = last.teams.reduce((x, t) => x + t.gdpShare, 0);
    expect(shares).toBeCloseTo(1, 2);
  });

  it('hyperinflation scenario actually inflates', async () => {
    const sim = new Simulation({ seed: 5, agents: 120, teams: demoTeams(), scenario: hyperinflation });
    const frames = await sim.run(260);
    expect(frames[frames.length - 1].m.cpi).toBeGreaterThan(frames[50].m.cpi * 2);
  });

  it('applies dashboard commands', async () => {
    const sim = make();
    sim.command({ type: 'tax', rate: 0.3 });
    sim.command({ type: 'rate', rate: 12 });
    sim.command({ type: 'shock', kind: 'drought' });
    const f = await sim.tick();
    expect(sim.state.gov.taxRate).toBe(0.3);
    expect(sim.state.cb.policyRate).toBe(12);
    expect(f.shocks.map((s) => s.kind)).toContain('drought');
    expect(f.headlines.some((h) => h.key === 'h.shock.drought')).toBe(true);
  });

  it('survives a brain that throws or returns garbage', async () => {
    const bad = { provider: 'test', model: 'bad', label: 'Bad', decide: async () => { throw new Error('boom'); } };
    const weird = { provider: 'test', model: 'weird', label: 'Weird', decide: async () => ({ markup: 'NaN', cheat: 7 }) };
    const sim = new Simulation({ seed: 1, agents: 60, teams: [{ brain: bad }, { brain: weird }, { brain: new MockBrain('prudent') }], scenario: classic });
    await sim.run(30);
    expect(sim.state.teams[1].policy.cheat).toBe(1);
  });

  it('exports a replay that round-trips through JSON', async () => {
    const sim = make();
    await sim.run(30);
    const r = JSON.parse(JSON.stringify(sim.toReplay()));
    expect(r.format).toBe('civarena-replay');
    expect(r.frames).toHaveLength(30);
    expect(r.names.length).toBe(sim.state.agents.length);
    expect(r.map.tiles.length).toBe(r.map.width * r.map.height);
  });

  it('runs every built-in scenario', async () => {
    for (const scenario of BUILTIN) {
      const sim = new Simulation({ seed: 11, agents: 60, teams: demoTeams(), scenario });
      await sim.run(40);
      expect(sim.state.tick).toBe(40);
    }
  });
});
