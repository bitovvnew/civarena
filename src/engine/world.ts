// The world is a pure reduction of its event log.
// Every state change in CivArena goes through `apply()`: the engine decides, the reducer mutates.
// Tests replay the full log on an empty world and check the result is identical.

import { workTile } from './map.js';
import { GOODS, JOB_OUTPUT, type Account, type Inventory, type WorldEvent, type WorldState } from './types.js';

export function emptyInventory(): Inventory {
  return { food: 0, wood: 0, ore: 0, tools: 0, luxury: 0 };
}

export function emptyState(): WorldState {
  return {
    tick: 0,
    seed: 0,
    width: 0,
    height: 0,
    tiles: [],
    agents: [],
    teams: [],
    loans: [],
    cartels: [],
    gov: { taxRate: 0, wealthTax: 0, ubi: 0, welfare: false, antitrust: false, treasury: 0 },
    cb: { policyRate: 0, printed: 0, bankCash: 0, writeOffs: 0 },
    market: {
      price: { ...emptyInventory() },
      last: { ...emptyInventory() },
      volume: { ...emptyInventory() },
    },
    shocks: [],
    ledger: { fx: 1, minted: 0, burned: 0, imports: 0, exports: 0 },
    nextId: { agent: 0, loan: 0, cartel: 0 },
    tick_produced: emptyInventory(),
    tick_gdp: 0,
  };
}

function credit(s: WorldState, acc: Account, amount: number) {
  if (typeof acc === 'number') s.agents[acc].cash += amount;
  else if (acc === 'gov') s.gov.treasury += amount;
  else if (acc === 'bank') s.cb.bankCash += amount;
  else s.ledger.imports += amount; // money flowing to the outside world
}

function debit(s: WorldState, acc: Account, amount: number) {
  if (typeof acc === 'number') s.agents[acc].cash -= amount;
  else if (acc === 'gov') s.gov.treasury -= amount;
  else if (acc === 'bank') s.cb.bankCash -= amount;
  else s.ledger.exports += amount; // money arriving from the outside world
}

/** Accounting identity every world must satisfy: money = start + minted - burned + exports - imports. */
export function expectedMoney(s: WorldState, startMoney: number): number {
  return startMoney + s.ledger.minted - s.ledger.burned + s.ledger.exports - s.ledger.imports;
}

/** Apply one event. Mutates and returns the state (genesis returns a fresh copy). */
export function apply(s: WorldState, e: WorldEvent): WorldState {
  switch (e.t) {
    case 'genesis':
      return structuredClone(e.state);
    case 'tick':
      s.tick = e.n;
      s.tick_produced = emptyInventory();
      s.tick_gdp = 0;
      s.shocks = s.shocks.filter((x) => x.until > e.n);
      for (const g of GOODS) s.market.volume[g] = 0;
      for (const a of s.agents) if (a) a.lastIncome = 0;
      return s;
    case 'spawn': {
      s.agents[e.agent.id] = structuredClone(e.agent);
      s.nextId.agent = Math.max(s.nextId.agent, e.agent.id + 1);
      return s;
    }
    case 'produce': {
      const a = s.agents[e.a];
      a.inv[e.good] += e.qty;
      for (const g of GOODS) {
        const u = e.used[g];
        if (u) a.inv[g] -= u;
      }
      a.producedValue += e.value;
      s.tick_produced[e.good] += e.qty;
      s.tick_gdp += e.value;
      return s;
    }
    case 'consume':
      s.agents[e.a].inv[e.good] -= e.qty;
      return s;
    case 'trade': {
      const value = e.qty * e.price;
      if (e.buyer === 'foreign') s.ledger.exports += value;
      else {
        const b = s.agents[e.buyer];
        b.cash -= value;
        b.inv[e.good] += e.qty;
      }
      if (e.seller === 'foreign') s.ledger.imports += value;
      else {
        const sel = s.agents[e.seller];
        sel.cash += value;
        sel.inv[e.good] -= e.qty;
        sel.lastIncome += value;
      }
      s.market.volume[e.good] += e.qty;
      return s;
    }
    case 'price':
      s.market.price[e.good] = e.price;
      s.market.last[e.good] = e.last;
      s.market.volume[e.good] = e.volume;
      return s;
    case 'transfer':
      debit(s, e.from, e.amount);
      credit(s, e.to, e.amount);
      return s;
    case 'mint':
      credit(s, e.to, e.amount);
      s.ledger.minted += e.amount;
      if (e.reason === 'print') s.cb.printed += e.amount;
      return s;
    case 'burn':
      debit(s, e.from, e.amount);
      s.ledger.burned += e.amount;
      return s;
    case 'loan':
      s.loans.push({ ...e.loan });
      s.nextId.loan = Math.max(s.nextId.loan, e.loan.id + 1);
      return s;
    case 'repay': {
      const loan = s.loans.find((l) => l.id === e.loan);
      if (!loan) return s;
      const a = s.agents[loan.agent];
      a.cash -= e.principal + e.interest;
      loan.principal -= e.principal;
      loan.missed = 0;
      s.cb.bankCash += e.interest;
      s.ledger.burned += e.principal; // repaying principal destroys the money the loan created
      if (loan.principal <= 1e-9) s.loans = s.loans.filter((l) => l.id !== e.loan);
      return s;
    }
    case 'missed': {
      const loan = s.loans.find((l) => l.id === e.loan);
      if (loan) loan.missed += 1;
      return s;
    }
    case 'default': {
      s.loans = s.loans.filter((l) => l.id !== e.loan);
      s.cb.writeOffs += e.writeOff;
      s.agents[e.a].bankruptcies += 1;
      return s;
    }
    case 'seize':
      s.agents[e.a].inv[e.good] -= e.qty;
      return s;
    case 'job': {
      const a = s.agents[e.a];
      a.job = e.job;
      a.home = workTile(s.tiles, s.width, s.height, e.job, a.id, s.seed);
      return s;
    }
    case 'vitals': {
      const a = s.agents[e.a];
      a.health = e.health;
      a.happiness = e.happiness;
      if (e.idle) {
        a.idle += 1;
        a.idleStreak += 1;
      } else a.idleStreak = 0;
      return s;
    }
    case 'death': {
      const a = s.agents[e.a];
      a.alive = false;
      a.diedAt = s.tick;
      a.inv = emptyInventory();
      if (a.cartel !== undefined) {
        const c = s.cartels.find((x) => x.id === a.cartel);
        if (c) c.members = c.members.filter((m) => m !== a.id);
        a.cartel = undefined;
      }
      return s;
    }
    case 'cartel_form': {
      s.cartels.push(structuredClone(e.cartel));
      s.nextId.cartel = Math.max(s.nextId.cartel, e.cartel.id + 1);
      for (const m of e.cartel.members) s.agents[m].cartel = e.cartel.id;
      return s;
    }
    case 'cartel_break': {
      const c = s.cartels.find((x) => x.id === e.id);
      if (c) for (const m of c.members) if (s.agents[m].cartel === e.id) s.agents[m].cartel = undefined;
      s.cartels = s.cartels.filter((x) => x.id !== e.id);
      return s;
    }
    case 'policy': {
      const t = s.teams.find((x) => x.id === e.team);
      if (t) t.policy = structuredClone(e.policy);
      return s;
    }
    case 'gov':
      Object.assign(s.gov, e.patch);
      return s;
    case 'rate':
      s.cb.policyRate = e.policyRate;
      return s;
    case 'shock':
      s.shocks.push({ ...e.shock });
      return s;
    case 'fx':
      s.ledger.fx = e.rate;
      return s;
  }
}

// ------------------------------------------------------------ read helpers ---

export function agentWealth(s: WorldState, id: number, debts?: Map<number, number>): number {
  const a = s.agents[id];
  let w = a.cash;
  for (const g of GOODS) w += a.inv[g] * s.market.price[g];
  if (debts) w -= debts.get(id) ?? 0;
  return w;
}

export function debtByAgent(s: WorldState): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of s.loans) m.set(l.agent, (m.get(l.agent) ?? 0) + l.principal);
  return m;
}

/** Total money in the economy: cash held by citizens, the treasury and the bank. */
export function moneySupply(s: WorldState): number {
  let m = s.gov.treasury + s.cb.bankCash;
  for (const a of s.agents) if (a) m += a.cash;
  return m;
}

export function producesGood(job: keyof typeof JOB_OUTPUT) {
  return JOB_OUTPUT[job];
}
