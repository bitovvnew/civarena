// Local configuration: `.civarena.json` (teams, world, budgets) and `.env` (API keys).
// Both live in the directory you run civarena from, are gitignored, and are written with 0600 permissions.
// Keys are never printed, logged, sent to the dashboard, or written into replays.

import fs from 'node:fs';
import path from 'node:path';

export const KEY_ENV = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
} as const;
export type KeyedProvider = keyof typeof KEY_ENV;

export interface Budget {
  /** Hard cap on tokens across all teams for one world. */
  globalTokens: number;
  /** Hard cap on tokens for each team (one brain = one team). */
  teamTokens: number;
  /** Hard cap on brain calls per team. */
  teamCalls: number;
  /** Optional price, used only to show an estimated cost. */
  usdPerMTok?: number;
}

export interface RateLimit {
  /** Requests per minute per provider. */
  rpm: number;
  /** Requests in flight per provider. */
  concurrency: number;
}

export interface CivConfig {
  version: 1;
  /** Team specs, e.g. "anthropic:claude-sonnet-5-5", "openrouter:meta-llama/llama-4-maverick", "offline:tycoon". */
  teams: string[];
  agents: number;
  scenario: string;
  seed: string;
  policyEvery: number;
  budget: Budget;
  rateLimit: RateLimit;
}

export const DEFAULT_BUDGET: Budget = { globalTokens: 2_000_000, teamTokens: 600_000, teamCalls: 200 };
export const DEFAULT_RATE: RateLimit = { rpm: 30, concurrency: 2 };

export function defaultConfig(): CivConfig {
  return {
    version: 1,
    teams: [],
    agents: 500,
    scenario: 'classic',
    seed: '42',
    policyEvery: 25,
    budget: { ...DEFAULT_BUDGET },
    rateLimit: { ...DEFAULT_RATE },
  };
}

export const CONFIG_FILE = '.civarena.json';
export const ENV_FILE = '.env';

export function configPath(dir = process.cwd()) {
  return path.join(dir, CONFIG_FILE);
}

export function loadConfig(dir = process.cwd()): CivConfig | null {
  const p = configPath(dir);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<CivConfig>;
    return normalizeConfig(raw);
  } catch {
    return null;
  }
}

export function normalizeConfig(raw: Partial<CivConfig>): CivConfig {
  const d = defaultConfig();
  const num = (v: unknown, lo: number, hi: number, f: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : f);
  const teams = Array.isArray(raw.teams) ? raw.teams.filter((t): t is string => typeof t === 'string' && t.length < 200).slice(0, 8) : [];
  return {
    version: 1,
    teams,
    agents: Math.round(num(raw.agents, 20, 5000, d.agents)),
    scenario: typeof raw.scenario === 'string' ? raw.scenario.slice(0, 64) : d.scenario,
    seed: typeof raw.seed === 'string' || typeof raw.seed === 'number' ? String(raw.seed).slice(0, 64) : d.seed,
    policyEvery: Math.round(num(raw.policyEvery, 1, 500, d.policyEvery)),
    budget: {
      globalTokens: Math.round(num(raw.budget?.globalTokens, 0, 1e10, d.budget.globalTokens)),
      teamTokens: Math.round(num(raw.budget?.teamTokens, 0, 1e10, d.budget.teamTokens)),
      teamCalls: Math.round(num(raw.budget?.teamCalls, 0, 1e6, d.budget.teamCalls)),
      usdPerMTok: raw.budget?.usdPerMTok !== undefined ? num(raw.budget.usdPerMTok, 0, 1000, 0) : undefined,
    },
    rateLimit: {
      rpm: Math.round(num(raw.rateLimit?.rpm, 1, 10_000, d.rateLimit.rpm)),
      concurrency: Math.round(num(raw.rateLimit?.concurrency, 1, 64, d.rateLimit.concurrency)),
    },
  };
}

function writePrivate(file: string, content: string) {
  fs.writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* windows */
  }
}

export function saveConfig(cfg: CivConfig, dir = process.cwd()) {
  writePrivate(configPath(dir), JSON.stringify(cfg, null, 2) + '\n');
  ensureGitignored(dir);
}

/** Parse a .env file (KEY=VALUE, # comments, optional quotes). */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Load .env into process.env without overriding variables that are already set. */
export function loadEnv(dir = process.cwd(), env: NodeJS.ProcessEnv = process.env): string[] {
  const p = path.join(dir, ENV_FILE);
  if (!fs.existsSync(p)) return [];
  const vars = parseEnv(fs.readFileSync(p, 'utf8'));
  const loaded: string[] = [];
  for (const [k, v] of Object.entries(vars)) {
    if (env[k] === undefined || env[k] === '') {
      env[k] = v;
      loaded.push(k);
    }
  }
  return loaded;
}

/** Merge keys into .env. Empty values remove the key. Other lines are preserved. */
export function saveEnv(updates: Record<string, string>, dir = process.cwd()) {
  const p = path.join(dir, ENV_FILE);
  const lines = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split(/\r?\n/) : ['# CivArena API keys. This file is gitignored. Never commit it.'];
  const done = new Set<string>();
  const out = lines
    .map((line) => {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (!m || !(m[1] in updates)) return line;
      done.add(m[1]);
      const v = updates[m[1]];
      return v ? `${m[1]}=${v}` : null;
    })
    .filter((l): l is string => l !== null);
  for (const [k, v] of Object.entries(updates)) if (!done.has(k) && v) out.push(`${k}=${v}`);
  while (out.length && out[out.length - 1] === '') out.pop();
  writePrivate(p, out.join('\n') + '\n');
  ensureGitignored(dir);
}

/** Make sure a local .gitignore covers our secret files if this directory is a git repo. */
export function ensureGitignored(dir = process.cwd()) {
  if (!fs.existsSync(path.join(dir, '.git'))) return;
  const gi = path.join(dir, '.gitignore');
  const text = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const need = [ENV_FILE, CONFIG_FILE].filter((f) => !text.split(/\r?\n/).some((l) => l.trim() === f));
  if (need.length) fs.appendFileSync(gi, (text.endsWith('\n') || !text ? '' : '\n') + need.join('\n') + '\n');
}
