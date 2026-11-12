// Shared types for the CivArena engine, server and dashboard.
// This file must stay free of Node-only imports: the web dashboard imports it too.

export const GOODS = ['food', 'wood', 'ore', 'tools', 'luxury'] as const;
export type Good = (typeof GOODS)[number];

export const JOBS = ['farmer', 'lumberjack', 'miner', 'smith', 'artisan'] as const;
export type Job = (typeof JOBS)[number];

/** What each job produces. */
export const JOB_OUTPUT: Record<Job, Good> = {
  farmer: 'food',
  lumberjack: 'wood',
  miner: 'ore',
  smith: 'tools',
  artisan: 'luxury',
};

/** Inputs consumed per unit of output (raw producers need none). */
export const JOB_INPUTS: Record<Job, Partial<Record<Good, number>>> = {
  farmer: {},
  lumberjack: {},
  miner: {},
  smith: { ore: 1, wood: 0.5 },
  artisan: { wood: 0.5, ore: 0.5, tools: 0.1 },
};

/** Base output per tick at full health, without tools. */
export const BASE_OUTPUT: Record<Job, number> = {
  farmer: 2.0,
  lumberjack: 1.6,
  miner: 1.3,
  smith: 0.9,
  artisan: 0.7,
};

/** Starting reference prices. */
export const BASE_PRICE: Record<Good, number> = {
  food: 4,
  wood: 3,
  ore: 5,
  tools: 14,
  luxury: 22,
};

/** CPI basket weights (what a typical household buys). */
export const CPI_WEIGHTS: Record<Good, number> = {
  food: 0.55,
  wood: 0.1,
  ore: 0.05,
  tools: 0.1,
  luxury: 0.2,
};

export type Inventory = Record<Good, number>;

export interface Agent {
  id: number;
  name: string;
  team: string;
  job: Job;
  cash: number;
  inv: Inventory;
  health: number; // 0..1
  happiness: number; // 0..1
  home: [number, number]; // tile coordinates
  alive: boolean;
  born: number;
  diedAt?: number;
  bankruptcies: number;
  /** ticks the agent could not work (no inputs / switching job) */
  idle: number;
  /** consecutive idle ticks, used for the unemployment rate */
  idleStreak: number;
  lastIncome: number;
  producedValue: number; // cumulative value produced (GDP contribution)
  cartel?: number;
  parent?: number;
}

export interface Loan {
  id: number;
  agent: number;
  principal: number; // outstanding principal
  rate: number; // per-tick interest rate
  payment: number; // scheduled principal payment per tick
  issuedAt: number;
  missed: number;
}

export interface Cartel {
  id: number;
  good: Good;
  members: number[];
  floor: number;
  formedAt: number;
  teams: string[];
}

export interface TeamPolicy {
  /** Ask price relative to the reference price, e.g. 0.15 = +15%. */
  markup: number;
  /** Bid premium over reference when buying, e.g. 0.1 = +10%. */
  bidPremium: number;
  /** Preference weights for picking a job. */
  jobBias: Record<Job, number>;
  /** 0..1 appetite for taking loans. */
  borrow: number;
  /** 0..1 willingness to form / join cartels. */
  cartel: number;
  /** 0..1 temptation to undercut a cartel you are in. */
  cheat: number;
  /** 0..1 share of surplus cash given to struggling teammates. */
  charity: number;
  /** Cash buffer (in food-days) agents try to keep before buying luxuries. */
  savings: number;
  /** One-line strategy statement, shown in the event feed. */
  rationale: string;
}

export interface TeamInfo {
  id: string;
  label: string; // e.g. "GPT-5", "Claude Sonnet", "Greedy (offline)"
  provider: string; // openai | anthropic | gemini | ollama | mock
  model: string;
  color: string;
  policy: TeamPolicy;
}

export interface Government {
  taxRate: number; // on sales income
  wealthTax: number; // per tick on wealth above threshold
  ubi: number; // cash per agent per tick
  welfare: boolean; // pay food money to the starving
  antitrust: boolean; // break up cartels
  treasury: number;
}

export interface CentralBank {
  policyRate: number; // per 100 ticks ("year")
  printed: number; // cumulative printed money
  bankCash: number; // bank equity in cash
  writeOffs: number;
}

export interface Shock {
  kind: ShockKind;
  until: number;
  factor: number;
  good?: Good;
}

export type ShockKind = 'drought' | 'mine_collapse' | 'tech_boom' | 'plague' | 'gold_rush' | 'trade_embargo';

export interface Market {
  price: Record<Good, number>; // reference price (EMA of clearing prices)
  last: Record<Good, number>; // last clearing price
  volume: Record<Good, number>; // last tick volume
}

export interface Ledger {
  /** Floating exchange rate vs. the outside world (1 = start). Scales import/export prices. */
  fx: number;
  minted: number;
  burned: number;
  imports: number; // money that left the economy to the foreign merchant
  exports: number; // money that entered from the foreign merchant
}

export interface WorldState {
  tick: number;
  seed: number;
  width: number;
  height: number;
  tiles: number[]; // TileKind per cell, row-major
  agents: Agent[];
  teams: TeamInfo[];
  loans: Loan[];
  cartels: Cartel[];
  gov: Government;
  cb: CentralBank;
  market: Market;
  shocks: Shock[];
  ledger: Ledger;
  nextId: { agent: number; loan: number; cartel: number };
  tick_produced: Record<Good, number>;
  tick_gdp: number;
}

export const TILE = { water: 0, plains: 1, farm: 2, forest: 3, mountain: 4, city: 5, market: 6 } as const;
export type TileKind = (typeof TILE)[keyof typeof TILE];

/** Owner of money in transfers. A number is an agent id. */
export type Account = number | 'gov' | 'bank' | 'foreign';

export type WorldEvent =
  | { t: 'genesis'; state: WorldState }
  | { t: 'tick'; n: number }
  | { t: 'spawn'; agent: Agent }
  | { t: 'produce'; a: number; good: Good; qty: number; used: Partial<Record<Good, number>>; value: number }
  | { t: 'consume'; a: number; good: Good; qty: number }
  | { t: 'trade'; good: Good; buyer: number | 'foreign'; seller: number | 'foreign'; qty: number; price: number }
  | { t: 'price'; good: Good; price: number; last: number; volume: number }
  | { t: 'transfer'; from: Account; to: Account; amount: number; reason: TransferReason }
  | { t: 'mint'; to: Account; amount: number; reason: string }
  | { t: 'burn'; from: Account; amount: number; reason: string }
  | { t: 'loan'; loan: Loan }
  | { t: 'repay'; loan: number; principal: number; interest: number }
  | { t: 'missed'; loan: number }
  | { t: 'default'; a: number; loan: number; writeOff: number }
  | { t: 'seize'; a: number; good: Good; qty: number }
  | { t: 'job'; a: number; job: Job }
  | { t: 'vitals'; a: number; health: number; happiness: number; idle: boolean }
  | { t: 'death'; a: number; cause: 'starvation' | 'plague' | 'old_age' }
  | { t: 'cartel_form'; cartel: Cartel }
  | { t: 'cartel_break'; id: number; reason: 'defection' | 'antitrust' | 'collapse'; by?: number }
  | { t: 'policy'; team: string; policy: TeamPolicy }
  | { t: 'gov'; patch: Partial<Omit<Government, 'treasury'>> }
  | { t: 'rate'; policyRate: number }
  | { t: 'shock'; shock: Shock }
  | { t: 'fx'; rate: number };

export type TransferReason = 'tax' | 'wealth_tax' | 'ubi' | 'welfare' | 'charity' | 'interest' | 'estate' | 'dividend' | 'fine' | 'helicopter' | 'inheritance' | 'job_fee';

// ---------------------------------------------------------------- frames ---

/** Compact snapshot streamed to the dashboard each tick and stored in replays. */
export interface Frame {
  tick: number;
  m: Metrics;
  prices: Record<Good, number>;
  volumes: Record<Good, number>;
  teams: TeamScore[];
  headlines: Headline[];
  /** Trade value between teams this tick: key "teamA>teamB" (seller>buyer). */
  flows: Record<string, number>;
  /** Present every few ticks: [id, teamIndex, jobIndex, wealth, health*100, flags] */
  agents?: number[][];
  /** Names of citizens born this tick: [id, name, teamIndex] */
  births?: [number, string, number][];
  cartels: { id: number; good: Good; members: number; floor: number; teams: string[] }[];
  gov: Omit<Government, 'treasury'> & { treasury: number };
  shocks: { kind: ShockKind; until: number }[];
}

export interface Metrics {
  gdp: number;
  cpi: number;
  inflation: number; // % change of CPI over the last 10 ticks, annualised-ish
  unemployment: number; // 0..1
  gini: number; // 0..1
  money: number;
  population: number;
  treasury: number;
  bankCapital: number;
  policyRate: number;
  taxRate: number;
  loans: number; // outstanding principal
  deaths: number;
  bankruptcies: number;
}

export interface TeamScore {
  id: string;
  label: string;
  provider: string;
  model: string;
  color: string;
  alive: number;
  born: number;
  wealth: number;
  wealthShare: number;
  gdpShare: number;
  survival: number;
  gini: number;
  bankruptcies: number;
  score: number;
  rationale: string;
}

export type HeadlineKind =
  | 'bankrupt'
  | 'cartel_form'
  | 'cartel_break'
  | 'starvation'
  | 'price_spike'
  | 'price_crash'
  | 'richest'
  | 'monopoly'
  | 'bank_crisis'
  | 'strategy'
  | 'shock'
  | 'policy'
  | 'baby_boom'
  | 'milestone';

export interface Headline {
  tick: number;
  kind: HeadlineKind;
  /** Severity for styling: 0 info, 1 notable, 2 dramatic */
  level: 0 | 1 | 2;
  /** i18n key + params: the dashboard renders it in the viewer's language */
  key: string;
  params: Record<string, string | number>;
  team?: string;
}

export interface ReplayFile {
  format: 'civarena-replay';
  version: 1;
  createdWith: string;
  scenario: string;
  scenarioName?: string;
  seed: number;
  config: { agents: number; ticks: number; teams: { id: string; label: string; provider: string; model: string; color: string }[] };
  map: { width: number; height: number; tiles: number[] };
  names: string[];
  frames: Frame[];
}

/** Commands the dashboard can send to a live world. */
export type Command =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'speed'; tps: number }
  | { type: 'tax'; rate: number }
  | { type: 'rate'; rate: number }
  | { type: 'ubi'; amount: number }
  | { type: 'welfare'; on: boolean }
  | { type: 'antitrust'; on: boolean }
  | { type: 'print'; amount: number }
  | { type: 'shock'; kind: ShockKind }
  | { type: 'reset'; seed?: number };
