// Built-in scenarios. Each one is a plugin: starting rules plus an optional per-tick script.
// Drop your own `*.js` / `*.mjs` file into a `scenarios/` folder next to where you run civarena,
// export a default Scenario, and run `civarena --scenario <id>`.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Scenario } from '../engine/plugins.js';
import { parseScenarioSpec, scenarioFromSpec, type ScenarioSpec } from './spec.js';

export const classic: Scenario = {
  id: 'classic',
  name: 'Classic',
  description: 'A mixed economy: 10% income tax, welfare for the starving, a 4% policy rate. The default.',
};

export const laissezFaire: Scenario = {
  id: 'laissez-faire',
  name: 'Laissez-faire',
  description: 'No taxes, no welfare, no regulators. Cartels welcome. Who survives?',
  setup: { gov: { taxRate: 0, welfare: false, antitrust: false }, policyRate: 2 },
};

export const welfareState: Scenario = {
  id: 'welfare-state',
  name: 'Welfare state',
  description: '35% income tax, a wealth tax, universal basic income and strict antitrust.',
  setup: { gov: { taxRate: 0.35, wealthTax: 0.002, ubi: 0.6, welfare: true, antitrust: true } },
};

export const hyperinflation: Scenario = {
  id: 'hyperinflation',
  name: 'Hyperinflation',
  description: 'From year one the central bank prints money every tick, faster and faster. Watch prices explode.',
  onTick(api) {
    if (api.tick < 60) return;
    const amount = 40 * Math.pow(1.012, api.tick - 60);
    api.command({ type: 'print', amount });
  },
};

export const drought: Scenario = {
  id: 'drought',
  name: 'Great Drought',
  description: 'Harvests collapse at tick 80 and again at tick 220. A food crisis stress test.',
  onTick(api) {
    if (api.tick === 80 || api.tick === 220) api.command({ type: 'shock', kind: 'drought' });
  },
};

export const goldRush: Scenario = {
  id: 'gold-rush',
  name: 'Gold rush',
  description: 'Ore booms every 150 ticks: miners get rich, foreign buyers pay a premium, then it busts.',
  onTick(api) {
    if (api.tick % 150 === 40) api.command({ type: 'shock', kind: 'gold_rush' });
  },
};

export const volcker: Scenario = {
  id: 'volcker',
  name: 'Rate shock',
  description: 'Easy money for 120 ticks, then the central bank hikes rates to 20%. Who was over-leveraged?',
  setup: { policyRate: 0.5 },
  onTick(api) {
    if (api.tick === 120) {
      api.command({ type: 'rate', rate: 20 });
      api.headline('The central bank slams rates to 20% to kill the credit boom.', 2);
    }
    if (api.tick === 260) api.command({ type: 'rate', rate: 4 });
  },
};

export const BUILTIN: Scenario[] = [classic, laissezFaire, welfareState, hyperinflation, drought, goldRush, volcker].map((s) => ({ ...s, source: 'builtin' as const }));

function isScenario(x: unknown): x is Scenario {
  return !!x && typeof x === 'object' && typeof (x as Scenario).id === 'string' && typeof (x as Scenario).name === 'string';
}

/**
 * Load built-ins plus user scenarios from `./scenarios`:
 *   *.json  declarative scenarios (safe to share; validated, no code runs)
 *   *.mjs / *.js / *.ts  code plugins (only files you put there yourself)
 */
export async function loadScenarios(dirs: string[] = [path.join(process.cwd(), 'scenarios')]): Promise<Scenario[]> {
  const out = [...BUILTIN];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, f);
      try {
        if (f.endsWith('.json')) {
          const sc = scenarioFromSpec(parseScenarioSpec(JSON.parse(fs.readFileSync(file, 'utf8'))));
          if (!out.some((x) => x.id === sc.id)) out.push(sc);
          continue;
        }
        if (!/\.(m?js|m?ts)$/.test(f) || f.endsWith('.d.ts')) continue;
        const mod = await import(pathToFileURL(file).href);
        const sc = mod.default ?? mod.scenario;
        if (isScenario(sc) && !out.some((x) => x.id === sc.id)) out.push({ ...sc, source: 'code' });
      } catch (err) {
        console.warn(`  ! could not load scenario ${f}: ${(err as Error).message}`);
      }
    }
  }
  return out;
}

/** Save a declarative scenario into ./scenarios (used by the dashboard's scenario builder). */
export function saveScenarioSpec(spec: ScenarioSpec, dir = path.join(process.cwd(), 'scenarios')): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${spec.id}.json`);
  fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
  return file;
}

export { parseScenarioSpec, scenarioFromSpec, ScenarioSpecError, type ScenarioSpec } from './spec.js';
