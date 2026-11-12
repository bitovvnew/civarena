// Declarative scenarios: plain JSON, no code, safe to share and download from anywhere.
// The dashboard's scenario builder writes these; `civarena` loads every *.json in ./scenarios.

import { validateCommand } from '../engine/commands.js';
import type { Scenario } from '../engine/plugins.js';
import type { Command, Government, Job } from '../engine/types.js';

export interface TimelineEvent {
  day: number;
  command?: Command;
  headline?: string;
}

export interface RepeatEvent {
  from: number;
  every: number;
  to?: number;
  command: Command;
}

export interface ScenarioSpec {
  format: 'civarena-scenario';
  version: 1;
  id: string;
  name: string;
  description: string;
  author?: string;
  tags?: string[];
  setup?: {
    gov?: Partial<Omit<Government, 'treasury'>>;
    policyRate?: number;
    startCash?: number;
    jobs?: Partial<Record<Job, number>>;
  };
  timeline?: TimelineEvent[];
  repeat?: RepeatEvent[];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);

export class ScenarioSpecError extends Error {}

/** Validate untrusted JSON into a ScenarioSpec. Throws with a readable message. */
export function parseScenarioSpec(raw: unknown): ScenarioSpec {
  if (!raw || typeof raw !== 'object') throw new ScenarioSpecError('scenario must be a JSON object');
  const r = raw as Record<string, unknown>;
  if (r.format !== 'civarena-scenario') throw new ScenarioSpecError('missing "format": "civarena-scenario"');
  const id = str(r.id, 48).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!id) throw new ScenarioSpecError('scenario needs an id');
  const name = str(r.name, 80) || id;
  const setupRaw = (r.setup && typeof r.setup === 'object' ? r.setup : {}) as Record<string, unknown>;
  const govRaw = (setupRaw.gov && typeof setupRaw.gov === 'object' ? setupRaw.gov : {}) as Record<string, unknown>;
  const gov: Partial<Omit<Government, 'treasury'>> = {};
  if (num(govRaw.taxRate, 0, 0.9) !== undefined) gov!.taxRate = num(govRaw.taxRate, 0, 0.9);
  if (num(govRaw.wealthTax, 0, 0.05) !== undefined) gov!.wealthTax = num(govRaw.wealthTax, 0, 0.05);
  if (num(govRaw.ubi, 0, 50) !== undefined) gov!.ubi = num(govRaw.ubi, 0, 50);
  if (typeof govRaw.welfare === 'boolean') gov!.welfare = govRaw.welfare;
  if (typeof govRaw.antitrust === 'boolean') gov!.antitrust = govRaw.antitrust;
  const jobsRaw = (setupRaw.jobs && typeof setupRaw.jobs === 'object' ? setupRaw.jobs : {}) as Record<string, unknown>;
  const jobs: Partial<Record<Job, number>> = {};
  for (const j of ['farmer', 'lumberjack', 'miner', 'smith', 'artisan'] as Job[]) {
    const v = num(jobsRaw[j], 0, 10);
    if (v !== undefined) jobs[j] = v;
  }
  const timeline: TimelineEvent[] = [];
  for (const ev of Array.isArray(r.timeline) ? r.timeline.slice(0, 500) : []) {
    const e = ev as Record<string, unknown>;
    const day = num(e.day, 1, 100_000);
    if (day === undefined) throw new ScenarioSpecError('every timeline event needs a "day"');
    const command = e.command === undefined ? undefined : validateCommand(e.command);
    if (e.command !== undefined && (!command || command.type === 'reset' || command.type === 'pause' || command.type === 'resume' || command.type === 'speed')) {
      throw new ScenarioSpecError(`invalid command on day ${day}`);
    }
    const headline = str(e.headline, 200) || undefined;
    if (!command && !headline) continue;
    timeline.push({ day: Math.round(day), command: command ?? undefined, headline });
  }
  const repeat: RepeatEvent[] = [];
  for (const ev of Array.isArray(r.repeat) ? r.repeat.slice(0, 20) : []) {
    const e = ev as Record<string, unknown>;
    const from = num(e.from, 1, 100_000), every = num(e.every, 1, 100_000);
    const command = validateCommand(e.command);
    if (from === undefined || every === undefined || !command || ['reset', 'pause', 'resume', 'speed'].includes(command.type)) throw new ScenarioSpecError('invalid repeat event');
    repeat.push({ from: Math.round(from), every: Math.round(every), to: num(e.to, 1, 100_000), command });
  }
  return {
    format: 'civarena-scenario',
    version: 1,
    id,
    name,
    description: str(r.description, 400),
    author: str(r.author, 60) || undefined,
    tags: Array.isArray(r.tags) ? r.tags.map((t) => str(t, 24)).filter(Boolean).slice(0, 8) : undefined,
    setup: {
      gov,
      policyRate: num(setupRaw.policyRate, 0, 50),
      startCash: num(setupRaw.startCash, 0, 10_000),
      jobs: Object.keys(jobs).length ? jobs : undefined,
    },
    timeline: timeline.sort((a, b) => a.day - b.day),
    repeat,
  };
}

/** Turn a validated spec into a runnable Scenario. */
export function scenarioFromSpec(spec: ScenarioSpec): Scenario {
  const byDay = new Map<number, TimelineEvent[]>();
  for (const e of spec.timeline ?? []) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    tags: spec.tags,
    author: spec.author,
    source: 'json',
    spec,
    setup: spec.setup,
    onTick(api) {
      for (const e of byDay.get(api.tick) ?? []) {
        if (e.command) api.command(e.command);
        if (e.headline) api.headline(e.headline, 2);
      }
      for (const r of spec.repeat ?? []) {
        if (api.tick >= r.from && (r.to === undefined || api.tick <= r.to) && (api.tick - r.from) % r.every === 0) api.command(r.command);
      }
    },
  };
}
