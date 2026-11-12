// civarena CLI
//   civarena                         live demo: 500 offline agents + dashboard
//   civarena --teams openai,anthropic,gemini,ollama:llama3.1
//   civarena run --ticks 500 --out world.civ.json.gz
//   civarena replay world.civ.json.gz
//   civarena scenarios

import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { brainFromSpec, DEMO_TEAMS, TeamSpecError } from './brains/index.js';
import { Simulation, VERSION } from './engine/engine.js';
import type { Scenario } from './engine/plugins.js';
import type { ReplayFile, TeamScore } from './engine/types.js';
import { loadScenarios } from './scenarios/index.js';
import { startServer } from './server/server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'dist', 'web');

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: number) => (s: string | number) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1), dim = c(2), green = c(32), yellow = c(33), cyan = c(36), red = c(31);

interface Args {
  _: string[];
  [k: string]: string | boolean | string[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else if (a.startsWith('-') && a.length === 2) {
      const map: Record<string, string> = { h: 'help', v: 'version', p: 'port', t: 'ticks', o: 'out', s: 'seed', n: 'agents' };
      const k = map[a[1]] ?? a[1];
      if (['help', 'version'].includes(k)) out[k] = true;
      else out[k] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

const HELP = `
${bold('CivArena')} ${dim('v' + VERSION)}  ${dim('AI civilization arena: which model is the best capitalist?')}

${bold('Usage')}
  civarena [start] [options]      run a live world and open the dashboard
  civarena run [options]          simulate headless and save a replay
  civarena replay <file>          open a saved .civ.json(.gz) replay in the dashboard
  civarena scenarios              list scenarios

${bold('Options')}
  --teams <list>       comma-separated teams (default: 4 offline personalities)
                       openai[:model]  anthropic[:model]  gemini[:model]  ollama[:model]
                       compat:model@http://host/v1     mock:tycoon|cooperative|prudent|gambler|adaptive
  --agents, -n <n>     citizens in the world (default 500)
  --seed, -s <seed>    world seed, any number or word (default 42)
  --scenario <id>      classic, laissez-faire, welfare-state, hyperinflation, drought, gold-rush, volcker
  --policy-every <n>   ticks between strategy calls per team (default 25)
  --ticks, -t <n>      ticks to simulate for "run" (default 500); live mode runs until stopped
  --out, -o <file>     replay path for "run" (default civarena-<scenario>-<seed>.civ.json.gz)
  --port, -p <n>       dashboard port (default 4321)
  --tps <n>            live ticks per second (default 8)
  --no-open            do not open the browser
  --lan                listen on all interfaces (share the dashboard on your network)

${bold('Keys')} are read from the environment: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY.
Offline teams need no key and no network.
`;

function openBrowser(url: string) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function str(a: Args, k: string, d: string) {
  const v = a[k];
  return typeof v === 'string' ? v : d;
}
function num(a: Args, k: string, d: number) {
  const v = Number(a[k]);
  return Number.isFinite(v) && a[k] !== undefined && a[k] !== true ? v : d;
}

async function pickScenario(a: Args): Promise<{ scenario: Scenario; all: Scenario[] }> {
  const all = await loadScenarios();
  const id = str(a, 'scenario', 'classic');
  const scenario = all.find((s) => s.id === id);
  if (!scenario) {
    console.error(red(`Unknown scenario "${id}".`) + ` Available: ${all.map((s) => s.id).join(', ')}`);
    process.exit(2);
  }
  return { scenario, all };
}

function teamSpecs(a: Args): string[] {
  const raw = str(a, 'teams', '');
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEMO_TEAMS;
}

function makeFactory(a: Args, scenario: Scenario) {
  const specs = teamSpecs(a);
  const agents = num(a, 'agents', 500);
  const policyEvery = num(a, 'policy-every', 25);
  return (seed: number | string) =>
    new Simulation({
      seed,
      agents,
      policyEvery,
      scenario,
      teams: specs.map((s, i) => ({ brain: brainFromSpec(s, i + 1) })),
      onLog: (m) => console.warn(yellow('  ! ') + m),
    });
}

function leaderboard(teams: TeamScore[]) {
  const rows = [...teams].sort((x, y) => y.score - x.score);
  console.log('\n' + bold('  Leaderboard'));
  console.log(dim('  #  team                     score   wealth   GDP    alive   gini'));
  rows.forEach((t, i) => {
    const medal = ['1', '2', '3'][i] ?? String(i + 1);
    console.log(
      `  ${i === 0 ? green(medal) : medal}  ${t.label.padEnd(22).slice(0, 22)}  ${bold(t.score.toFixed(1).padStart(6))}  ${(t.wealthShare * 100).toFixed(1).padStart(5)}%  ${(t.gdpShare * 100).toFixed(1).padStart(5)}%  ${String(t.alive).padStart(5)}   ${t.gini.toFixed(2)}`,
    );
  });
}

async function cmdRun(a: Args) {
  const { scenario } = await pickScenario(a);
  const seed = str(a, 'seed', '42');
  const ticks = num(a, 'ticks', 500);
  const sim = makeFactory(a, scenario)(seed);
  const out = str(a, 'out', `civarena-${scenario.id}-${sim.seed}.civ.json.gz`);
  console.log(`\n  ${bold('CivArena')} ${dim('v' + VERSION)}  ${cyan(scenario.name)}  ${dim(`seed ${sim.seed} · ${sim.opts.agents} agents · ${ticks} ticks`)}`);
  console.log(dim(`  teams: ${sim.state.teams.map((t) => t.label).join(', ')}\n`));
  const t0 = Date.now();
  let drama = 0;
  await sim.run(ticks, (f) => {
    drama += f.headlines.filter((h) => h.level === 2).length;
    if (tty && (f.tick % 5 === 0 || f.tick === ticks)) {
      const w = 28, done = Math.round((f.tick / ticks) * w);
      process.stdout.write(`\r  [${'#'.repeat(done)}${'.'.repeat(w - done)}] ${f.tick}/${ticks}  GDP ${f.m.gdp.toFixed(0).padStart(6)}  CPI ${f.m.cpi.toFixed(0).padStart(5)}  pop ${String(f.m.population).padStart(4)}  `);
    }
  });
  if (tty) process.stdout.write('\n');
  const last = sim.history[sim.history.length - 1];
  leaderboard(last.teams);
  console.log(dim(`\n  ${last.m.deaths} deaths · ${last.m.bankruptcies} bankruptcies · ${drama} dramatic events · ${((Date.now() - t0) / 1000).toFixed(1)}s`));
  const replay = sim.toReplay();
  const json = JSON.stringify(replay);
  fs.writeFileSync(out, out.endsWith('.gz') ? zlib.gzipSync(json) : json);
  console.log(`  replay saved: ${bold(out)}  ${dim(`(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`)}`);
  console.log(dim(`  open it:      civarena replay ${out}\n`));
}

function readReplay(file: string): ReplayFile {
  const buf = fs.readFileSync(file);
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  const r = JSON.parse(text) as ReplayFile;
  if (r.format !== 'civarena-replay') throw new Error('not a CivArena replay file');
  return r;
}

function ensureWeb() {
  if (!fs.existsSync(path.join(WEB, 'index.html'))) {
    console.error(red('  Dashboard is not built.') + ' Run ' + bold('npm run build') + ' first.');
    process.exit(1);
  }
}

async function cmdServe(a: Args, replayFile?: string) {
  ensureWeb();
  const port = num(a, 'port', 4321);
  const host = a.lan ? '0.0.0.0' : '127.0.0.1';
  let server;
  if (replayFile) {
    const replay = readReplay(replayFile);
    server = await startServer({ port, host, webRoot: WEB, replay });
    console.log(`\n  ${bold('CivArena')} replay  ${dim(`${replay.scenario} · seed ${replay.seed} · ${replay.config.ticks} ticks`)}`);
  } else {
    const { scenario, all } = await pickScenario(a);
    const make = makeFactory(a, scenario);
    const seed = str(a, 'seed', '42');
    server = await startServer({
      port, host, webRoot: WEB,
      live: { make, seed, scenario, scenarios: all, tps: num(a, 'tps', 8) },
      log: (m) => console.warn(yellow('  ! ') + m),
    });
    const sim = server.runner!.sim;
    console.log(`\n  ${bold('CivArena')} ${dim('v' + VERSION)}  ${cyan(scenario.name)}  ${dim(`seed ${sim.seed} · ${sim.opts.agents} agents`)}`);
    console.log(dim(`  teams: ${sim.state.teams.map((t) => `${t.label} (${t.provider})`).join(', ')}`));
    if (sim.state.teams.every((t) => t.provider === 'mock')) console.log(dim('  offline demo: no API keys, no network. Add real models with --teams openai,anthropic,gemini'));
  }
  console.log(`\n  dashboard  ${bold(green(server.url))}${a.lan ? dim('  (listening on your network)') : ''}`);
  console.log(dim('  press Ctrl+C to stop\n'));
  if (a.open !== false && !a['no-open']) openBrowser(server.url);
  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}

async function cmdScenarios() {
  const all = await loadScenarios();
  console.log('');
  for (const s of all) console.log(`  ${bold(s.id.padEnd(16))} ${s.description}`);
  console.log(dim('\n  Add your own: drop a .mjs file exporting a Scenario into ./scenarios/\n'));
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  if (a.version) return console.log(VERSION);
  if (a.help) return console.log(HELP);
  const cmd = a._[0] ?? 'start';
  try {
    if (cmd === 'run') return await cmdRun(a);
    if (cmd === 'replay') {
      const f = a._[1];
      if (!f) throw new TeamSpecError('replay needs a file: civarena replay world.civ.json.gz');
      return await cmdServe(a, f);
    }
    if (cmd === 'scenarios') return await cmdScenarios();
    if (cmd === 'start' || cmd === 'live' || cmd === 'demo') return await cmdServe(a);
    console.log(HELP);
    process.exitCode = 2;
  } catch (err) {
    if (err instanceof TeamSpecError || (err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(red('  ' + (err as Error).message));
      process.exit(2);
    }
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(red(`  Port is busy. Try --port ${num(a, 'port', 4321) + 1}`));
      process.exit(2);
    }
    throw err;
  }
}
