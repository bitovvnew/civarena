// Pure types shared by the tournament runner (Node) and the dashboard (browser).
import type { TeamScore } from './engine/types.js';

export interface TournamentRun {
  scenario: string;
  seed: string;
  /** Order teams were seated in this run (rotated to cancel any position effect). */
  order: string[];
  teams: TeamScore[];
  winner: string;
  deaths: number;
  population: number;
}

export interface TeamStanding {
  spec: string;
  label: string;
  provider: string;
  model: string;
  color: string;
  runs: number;
  wins: number;
  mean: number;
  sd: number;
  /** 95% confidence interval half-width for the mean score */
  ci95: number;
  meanWealthShare: number;
  meanGdpShare: number;
  meanSurvival: number;
  meanGini: number;
  /** mean score per scenario */
  byScenario: Record<string, number>;
}

export interface TournamentReport {
  format: 'civarena-tournament';
  version: 1;
  createdWith: string;
  ticks: number;
  agents: number;
  seeds: string[];
  scenarios: { id: string; name: string }[];
  standings: TeamStanding[];
  runs: TournamentRun[];
}
