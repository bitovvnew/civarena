// Tournament mode: the same teams across many seeds and scenarios, with confidence intervals.
// One world proves nothing; fifty worlds start to.

import { buildTeams } from './brains/index.js';
import type { Budget, RateLimit } from './config.js';
import { Simulation, TEAM_COLORS, VERSION } from './engine/engine.js';
import type { Scenario } from './engine/plugins.js';
import type { TeamScore } from './engine/types.js';

export interface TournamentOptions {
  teams: string[];
  scenarios: Scenario[];
  seeds: (string | number)[];
  ticks: number;
  agents: number;
  policyEvery?: number;
  budget?: Budget;
  rate?: RateLimit;
  onRun?: (done: number, total: number, run: TournamentRun) => void;
}

import type { TeamStanding, TournamentReport, TournamentRun } from './tournament-types.js';
export type { TeamStanding, TournamentReport, TournamentRun } from './tournament-types.js';

// two-sided 95% t critical values for small samples, then the normal value
const T95 = [0, 12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.1, 2.09, 2.09];
export function tCritical(df: number) {
  return df <= 0 ? 0 : df < T95.length ? T95[df] : 1.96;
}

export function meanSd(xs: number[]) {
  const n = xs.length;
  if (!n) return { mean: 0, sd: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd };
}

export async function runTournament(o: TournamentOptions): Promise<TournamentReport> {
  if (new Set(o.teams).size !== o.teams.length) throw new Error('each team spec may appear only once in a tournament');
  const runs: TournamentRun[] = [];
  const total = o.scenarios.length * o.seeds.length;
  let done = 0;
  for (const scenario of o.scenarios) {
    for (const [si, seed] of o.seeds.entries()) {
      const rot = si % o.teams.length;
      const order = [...o.teams.slice(rot), ...o.teams.slice(0, rot)];
      const { brains } = buildTeams(order, { budget: o.budget, rate: o.rate });
      const sim = new Simulation({
        seed,
        agents: o.agents,
        scenario,
        policyEvery: o.policyEvery ?? 25,
        historyAgentsEvery: 1_000_000,
        // stable ids/colors per spec regardless of seating order
        teams: brains.map((brain, i) => ({ brain, id: order[i], color: TEAM_COLORS[o.teams.indexOf(order[i]) % TEAM_COLORS.length] })),
      });
      await sim.run(o.ticks);
      const last = sim.history[sim.history.length - 1];
      const ranked = [...last.teams].sort((a, b) => b.score - a.score);
      const run: TournamentRun = {
        scenario: scenario.id, seed: String(sim.seed), order, teams: last.teams, winner: ranked[0].id,
        deaths: last.m.deaths, population: last.m.population,
      };
      runs.push(run);
      o.onRun?.(++done, total, run);
    }
  }
  const standings: TeamStanding[] = o.teams.map((spec) => {
    const mine = runs.map((r) => ({ r, t: r.teams.find((t) => t.id === spec)! })).filter((x) => x.t);
    const scores = mine.map((x) => x.t.score);
    const { mean, sd } = meanSd(scores);
    const byScenario: Record<string, number> = {};
    for (const sc of o.scenarios) byScenario[sc.id] = meanSd(mine.filter((x) => x.r.scenario === sc.id).map((x) => x.t.score)).mean;
    const first = mine[0]?.t;
    return {
      spec, label: first?.label ?? spec, provider: first?.provider ?? '', model: first?.model ?? '', color: first?.color ?? '#888',
      runs: scores.length, wins: runs.filter((r) => r.winner === spec).length, mean, sd,
      ci95: scores.length > 1 ? (tCritical(scores.length - 1) * sd) / Math.sqrt(scores.length) : 0,
      meanWealthShare: meanSd(mine.map((x) => x.t.wealthShare)).mean,
      meanGdpShare: meanSd(mine.map((x) => x.t.gdpShare)).mean,
      meanSurvival: meanSd(mine.map((x) => x.t.survival)).mean,
      meanGini: meanSd(mine.map((x) => x.t.gini)).mean,
      byScenario,
    };
  }).sort((a, b) => b.mean - a.mean);
  return {
    format: 'civarena-tournament', version: 1, createdWith: `civarena ${VERSION}`, ticks: o.ticks, agents: o.agents,
    seeds: o.seeds.map(String), scenarios: o.scenarios.map((s) => ({ id: s.id, name: s.name })), standings, runs,
  };
}

export function tournamentMarkdown(r: TournamentReport): string {
  const lines = [
    `# CivArena tournament`,
    '',
    `${r.runs.length} worlds · ${r.scenarios.map((s) => s.name).join(', ')} · ${r.seeds.length} seeds · ${r.ticks} days · ${r.agents} citizens`,
    '',
    '| # | Team | Mean score | 95% CI | Wins | Wealth | GDP | Survival | Gini |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...r.standings.map((s, i) =>
      `| ${i + 1} | ${s.label} (\`${s.spec}\`) | ${s.mean.toFixed(1)} | ±${s.ci95.toFixed(1)} | ${s.wins}/${s.runs} | ${(s.meanWealthShare * 100).toFixed(1)}% | ${(s.meanGdpShare * 100).toFixed(1)}% | ${(s.meanSurvival * 100).toFixed(0)}% | ${s.meanGini.toFixed(2)} |`),
    '',
  ];
  if (r.scenarios.length > 1) {
    lines.push('## By scenario', '', `| Team | ${r.scenarios.map((s) => s.name).join(' | ')} |`, `|---|${r.scenarios.map(() => '---:').join('|')}|`);
    for (const s of r.standings) lines.push(`| ${s.label} | ${r.scenarios.map((sc) => s.byScenario[sc.id].toFixed(1)).join(' | ')} |`);
    lines.push('');
  }
  return lines.join('\n');
}
