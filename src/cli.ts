// civarena CLI
//   civarena                      start the arena with offline teams or a saved setup
//   civarena setup [--cli]        pick providers, paste keys, choose models
//   civarena run                  simulate headless and save a replay
//   civarena replay <file>        watch a replay
//   civarena gif <file>           render a replay to an animated GIF
//   civarena tournament           many seeds x scenarios, with confidence intervals
//   civarena scenarios            list scenarios

import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { buildTeams, OFFLINE_TEAMS, TeamSpecError } from './brains/index.js';
import { detect, PROVIDERS, probe, type ModelInfo, type ProviderId } from './brains/providers.js';
import { redact, registerEnvSecrets, registerSecret } from './brains/redact.js';
import { KEY_ENV, loadConfig, loadEnv, normalizeConfig, saveConfig, saveEnv, type CivConfig } from './config.js';
import { Simulation, VERSION } from './engine/engine.js';
import type { Scenario } from './engine/plugins.js';
import type { ReplayFile, TeamScore } from './engine/types.js';
import { replayToGif } from './render/raster.js';
import { loadScenarios } from './scenarios/index.js';
import { startServer } from './server/server.js';
import { runTournament, tournamentMarkdown } from './tournament.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'dist', 'web');
const SCENARIO_DIRS = [...new Set([path.resolve('scenarios'), path.join(ROOT, 'scenarios')])];

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
      else if (argv[i + 1] && !argv[i + 1].startsWith('-')) out[k] = argv[++i];
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
  civarena                        start the arena (offline teams on first run)
  civarena setup [--cli]          choose providers, paste keys, pick models (browser or terminal)
  civarena run [options]          simulate headless and save a replay
  civarena replay <file>          watch a saved .civ.json(.gz) replay
  civarena gif <file> [--out x.gif --from 1 --to 600 --step 5 --scale 6]
  civarena tournament [options]   same teams across many seeds and scenarios, with 95% CIs
  civarena scenarios              list scenarios (built-in, JSON and code plugins)

${bold('Options')}
  --teams <list>       comma-separated team specs, overriding your saved setup
                       openai:<model>  anthropic:<model>  gemini:<model>  openrouter:<vendor/model>
                       ollama:<model>  compat:<model>@http://host/v1  offline:tycoon|cooperative|prudent|gambler|adaptive
  --offline            use the four offline personalities (no keys, no network)
  --agents, -n <n>     citizens (default 500)
  --seed, -s <seed>    world seed, any number or word (default 42)
  --scenario <id>      see \`civarena scenarios\`
  --policy-every <n>   days between strategy calls per team (default 25)
  --ticks, -t <n>      days to simulate for run/tournament (default 500)
  --seeds <n|a,b,c>    tournament seeds: a count or a list (default 5)
  --scenarios <a,b>    tournament scenarios (default: the configured one)
  --budget-tokens <n>  global token cap per world        --team-tokens <n>  per-team token cap
  --rpm <n>            requests per minute per provider  --concurrency <n>  parallel requests per provider
  --out, -o <file>     output file
  --port, -p <n>       dashboard port (default 4321)     --tps <n>  live days per second (default 8)
  --no-open            do not open the browser           --lan      serve on your local network

Keys live in ${bold('.env')} next to where you run civarena (gitignored, never logged, never in replays).
`;

function openBrowser(url: string) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

const str = (a: Args, k: string, d: string) => (typeof a[k] === 'string' ? (a[k] as string) : d);
function num(a: Args, k: string, d: number) {
  const v = Number(a[k]);
  return a[k] !== undefined && a[k] !== true && Number.isFinite(v) ? v : d;
}

/** Saved setup + command-line overrides. */
function resolveConfig(a: Args): CivConfig {
  const base = loadConfig() ?? normalizeConfig({});
  const flagTeams = str(a, 'teams', '');
  const teams = a.offline ? OFFLINE_TEAMS
    : flagTeams ? flagTeams.split(',').map((s) => s.trim()).filter(Boolean)
    : base.teams.length ? base.teams : OFFLINE_TEAMS;
  return normalizeConfig({
    ...base,
    teams,
    agents: num(a, 'agents', base.agents),
    scenario: str(a, 'scenario', base.scenario),
    seed: str(a, 'seed', base.seed),
    policyEvery: num(a, 'policy-every', base.policyEvery),
    budget: { ...base.budget, globalTokens: num(a, 'budget-tokens', base.budget.globalTokens), teamTokens: num(a, 'team-tokens', base.budget.teamTokens) },
    rateLimit: { rpm: num(a, 'rpm', base.rateLimit.rpm), concurrency: num(a, 'concurrency', base.rateLimit.concurrency) },
  });
}

function makeWorld(cfg: CivConfig, scenario: Scenario, seed: string | number) {
  const { brains } = buildTeams(cfg.teams, { budget: cfg.budget, rate: cfg.rateLimit });
  return new Simulation({
    seed, agents: cfg.agents, policyEvery: cfg.policyEvery, scenario,
    teams: brains.map((brain) => ({ brain })),
    onLog: (m) => console.warn(yellow('  ! ') + redact(m)),
  });
}

async function pickScenario(id: string): Promise<{ scenario: Scenario; all: Scenario[] }> {
  const all = await loadScenarios(SCENARIO_DIRS);
  const scenario = all.find((s) => s.id === id);
  if (!scenario) throw new TeamSpecError(`Unknown scenario "${id}". Available: ${all.map((s) => s.id).join(', ')}`);
  return { scenario, all };
}

function needTeams(cfg: CivConfig) {
  if (cfg.teams.length) return;
  throw new TeamSpecError(`No teams configured yet. Run \`civarena setup\` to pick models, or add --offline for the no-key personalities.`);
}

function leaderboard(teams: TeamScore[]) {
  const rows = [...teams].sort((x, y) => y.score - x.score);
  console.log('\n' + bold('  Leaderboard'));
  console.log(dim('  #  team                     score   wealth   GDP    alive   gini'));
  rows.forEach((t, i) => {
    console.log(
      `  ${i === 0 ? green(String(i + 1)) : i + 1}  ${t.label.padEnd(22).slice(0, 22)}  ${bold(t.score.toFixed(1).padStart(6))}  ${(t.wealthShare * 100).toFixed(1).padStart(5)}%  ${(t.gdpShare * 100).toFixed(1).padStart(5)}%  ${String(t.alive).padStart(5)}   ${t.gini.toFixed(2)}`,
    );
  });
}

function progress(done: number, total: number, extra = '') {
  if (!tty) return;
  const w = 28, k = Math.round((done / total) * w);
  process.stdout.write(`\r  [${'#'.repeat(k)}${'.'.repeat(w - k)}] ${done}/${total}  ${extra}`);
}

async function cmdRun(a: Args) {
  const cfg = resolveConfig(a);
  needTeams(cfg);
  const { scenario } = await pickScenario(cfg.scenario);
  const ticks = num(a, 'ticks', 500);
  const sim = makeWorld(cfg, scenario, cfg.seed);
  const out = str(a, 'out', `civarena-${scenario.id}-${sim.seed}.civ.json.gz`);
  console.log(`\n  ${bold('CivArena')} ${dim('v' + VERSION)}  ${cyan(scenario.name)}  ${dim(`seed ${sim.seed} · ${sim.opts.agents} citizens · ${ticks} days`)}`);
  console.log(dim(`  teams: ${sim.state.teams.map((t) => `${t.label} (${t.provider})`).join(', ')}\n`));
  const t0 = Date.now();
  let drama = 0;
  await sim.run(ticks, (f) => {
    drama += f.headlines.filter((h) => h.level === 2).length;
    if (f.tick % 5 === 0 || f.tick === ticks) progress(f.tick, ticks, `GDP ${f.m.gdp.toFixed(0).padStart(6)}  CPI ${f.m.cpi.toFixed(0).padStart(5)}  pop ${String(f.m.population).padStart(4)}  `);
  });
  if (tty) process.stdout.write('\n');
  const last = sim.history[sim.history.length - 1];
  leaderboard(last.teams);
  console.log(dim(`\n  ${last.m.deaths} deaths · ${last.m.bankruptcies} bankruptcies · ${drama} dramatic events · ${((Date.now() - t0) / 1000).toFixed(1)}s`));
  const json = JSON.stringify(sim.toReplay());
  fs.writeFileSync(out, out.endsWith('.gz') ? zlib.gzipSync(json) : json);
  console.log(`  replay saved: ${bold(out)}  ${dim(`(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`)}`);
  console.log(dim(`  watch it:     civarena replay ${out}`));
  console.log(dim(`  as a GIF:     civarena gif ${out}\n`));
}

function readReplay(file: string): ReplayFile {
  const buf = fs.readFileSync(file);
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  const r = JSON.parse(text) as ReplayFile;
  if (r.format !== 'civarena-replay') throw new TeamSpecError('not a CivArena replay file');
  return r;
}

function ensureWeb() {
  if (!fs.existsSync(path.join(WEB, 'index.html'))) throw new TeamSpecError('Dashboard is not built. Run `npm run build` first.');
}

async function cmdServe(a: Args, opts: { replayFile?: string; forceSetup?: boolean } = {}) {
  ensureWeb();
  const port = num(a, 'port', 4321);
  const host = a.lan ? '0.0.0.0' : '127.0.0.1';
  let server;
  let suffix = '/';
  if (opts.replayFile) {
    const replay = readReplay(opts.replayFile);
    server = await startServer({ port, host, webRoot: WEB, replay });
    console.log(`\n  ${bold('CivArena')} replay  ${dim(`${replay.scenarioName ?? replay.scenario} · seed ${replay.seed} · ${replay.config.ticks} days`)}`);
  } else {
    const cfg = resolveConfig(a);
    const all = await loadScenarios(SCENARIO_DIRS);
    server = await startServer({
      port, host, webRoot: WEB, config: cfg.teams.length ? cfg : null, scenarios: all, tps: num(a, 'tps', 8),
      factory: { make: makeWorld }, log: (m) => console.warn(yellow('  ! ') + redact(m)),
    });
    if (opts.forceSetup || server.mode() === 'setup') {
      suffix = '/?setup=1';
      console.log(`\n  ${bold('CivArena')} ${dim('v' + VERSION)}  ${cyan('setup')}`);
      console.log(dim('  Pick providers and models in the browser. Keys are checked live and saved to .env (gitignored).'));
    } else {
      const sim = server.runner.sim!;
      console.log(`\n  ${bold('CivArena')} ${dim('v' + VERSION)}  ${cyan(server.runner.scenario!.name)}  ${dim(`seed ${sim.seed} · ${sim.opts.agents} citizens`)}`);
      console.log(dim(`  teams: ${sim.state.teams.map((t) => `${t.label} (${t.provider})`).join(', ')}`));
    }
  }
  const url = server.url + suffix;
  console.log(`\n  dashboard  ${bold(green(url))}${a.lan ? dim('  (listening on your network; setup stays local-only)') : ''}`);
  console.log(dim('  press Ctrl+C to stop\n'));
  if (a.open !== false && !a['no-open']) openBrowser(url);
  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}

// ------------------------------------------------------------ terminal wizard ---

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((r) => rl.question(q, (x) => r(x.trim())));
}

/** Read a secret without echoing it. */
function askSecret(q: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(q);
    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', (l) => { rl.close(); resolve(l.trim()); });
      return;
    }
    let buf = '';
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (d: Buffer) => {
      for (const ch of d.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(buf.trim());
        }
        if (ch === '\x03') process.exit(130);
        if (ch === '\x7f' || ch === '\b') {
          if (buf.length) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); }
        } else {
          buf += ch;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function chooseModel(rl: readline.Interface, models: ModelInfo[], label: string): Promise<string | null> {
  let list = models;
  for (;;) {
    const shown = list.slice(0, 15);
    shown.forEach((m, i) => console.log(`    ${dim(String(i + 1).padStart(2))}  ${m.id}${m.usdPerMTokIn !== undefined ? dim(`  $${m.usdPerMTokIn.toFixed(2)}/M in`) : ''}`));
    if (list.length > shown.length) console.log(dim(`    ... ${list.length - shown.length} more. Type text to filter.`));
    const ans = await ask(rl, `  ${label} model (number, filter text, or empty to skip): `);
    if (!ans) return null;
    const n = Number(ans);
    if (Number.isInteger(n) && n >= 1 && n <= shown.length) return shown[n - 1].id;
    const f = models.filter((m) => m.id.toLowerCase().includes(ans.toLowerCase()) || m.label.toLowerCase().includes(ans.toLowerCase()));
    if (f.length === 1) return f[0].id;
    list = f.length ? f : models;
    if (!f.length) console.log(yellow('    no match'));
  }
}

async function cmdSetupCli() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n  ${bold('CivArena setup')}  ${dim('keys are saved to .env in this folder (gitignored)')}\n`);
  const found = await detect();
  for (const d of found) {
    const note = d.id === 'ollama' ? (d.reachable ? green(`running, ${d.models} models`) : dim('not running')) : d.id === 'offline' ? dim('always available') : d.envKey ? green('key found in environment') : dim('no key');
    console.log(`  ${d.label.padEnd(18)} ${note}`);
  }
  const prev = loadConfig() ?? normalizeConfig({});
  const teams: string[] = [];
  const keys: Record<string, string> = {};
  for (const p of PROVIDERS) {
    if (p.id === 'offline') continue;
    const d = found.find((x) => x.id === p.id)!;
    if (p.id === 'ollama' && !d.reachable) continue;
    if (!(await ask(rl, `\n  Use ${bold(p.label)}? [y/N] `)).toLowerCase().startsWith('y')) continue;
    let key: string | undefined;
    if (p.needsKey && !(d.envKey && (await ask(rl, `  Use the key already in your environment? [Y/n] `)).toLowerCase() !== 'n')) {
      rl.pause();
      key = await askSecret(`  Paste your ${p.label} key ${dim(p.keyUrl ? `(${p.keyUrl})` : '')}: `);
      rl.resume();
    }
    registerSecret(key);
    process.stdout.write(dim('  checking... '));
    const res = await probe(p.id as ProviderId, key ?? (p.envVar ? process.env[p.envVar] : undefined));
    if (!res.ok) {
      console.log(red(`failed: ${res.error}`));
      continue;
    }
    console.log(green(`ok, ${res.models.length} models (${res.ms} ms)`));
    if (key && p.id in KEY_ENV) keys[KEY_ENV[p.id as keyof typeof KEY_ENV]] = key;
    for (;;) {
      const m = await chooseModel(rl, res.models, p.label);
      if (!m) break;
      teams.push(`${p.id}:${m}`);
      console.log(green(`    + team ${p.id}:${m}`));
      if (teams.length >= 8 || !(await ask(rl, '  Add another model from this provider? [y/N] ')).toLowerCase().startsWith('y')) break;
    }
  }
  if ((await ask(rl, `\n  Add the offline no-key personalities as baselines? [y/N] `)).toLowerCase().startsWith('y')) {
    for (const t of OFFLINE_TEAMS) if (teams.length < 8) teams.push(t);
  }
  rl.close();
  if (!teams.length) {
    console.log(yellow('\n  No teams chosen. Nothing saved.\n'));
    return;
  }
  if (Object.keys(keys).length) saveEnv(keys);
  saveConfig(normalizeConfig({ ...prev, teams }));
  console.log(`\n  ${green('Saved.')} ${teams.length} teams: ${teams.join(', ')}`);
  console.log(`  Start the arena with ${bold('civarena')}\n`);
}

// ---------------------------------------------------------------- others ---

async function cmdGif(a: Args) {
  const file = a._[1];
  if (!file) throw new TeamSpecError('gif needs a replay file: civarena gif world.civ.json.gz');
  const replay = readReplay(file);
  const out = str(a, 'out', file.replace(/\.civ\.json(\.gz)?$/, '') + '.gif');
  const t0 = Date.now();
  const gif = replayToGif(replay, { from: num(a, 'from', 1), to: num(a, 'to', replay.frames.length), step: num(a, 'step', 5), scale: num(a, 'scale', 6), delayMs: num(a, 'delay', 70) });
  fs.writeFileSync(out, gif);
  console.log(`\n  ${green('GIF saved')} ${bold(out)}  ${dim(`${(gif.length / 1024 / 1024).toFixed(1)} MB · ${((Date.now() - t0) / 1000).toFixed(1)}s`)}\n`);
}

async function cmdTournament(a: Args) {
  const cfg = resolveConfig(a);
  needTeams(cfg);
  const all = await loadScenarios(SCENARIO_DIRS);
  const ids = str(a, 'scenarios', cfg.scenario).split(',').map((s) => s.trim());
  const scenarios = ids.map((id) => {
    const s = all.find((x) => x.id === id);
    if (!s) throw new TeamSpecError(`Unknown scenario "${id}"`);
    return s;
  });
  const seedsArg = str(a, 'seeds', '5');
  const seeds = /^\d+$/.test(seedsArg) ? Array.from({ length: Number(seedsArg) }, (_, i) => 1000 + i * 7919) : seedsArg.split(',').map((s) => s.trim());
  const ticks = num(a, 'ticks', 500);
  const llm = cfg.teams.filter((t) => !t.startsWith('offline') && !t.startsWith('mock')).length;
  console.log(`\n  ${bold('CivArena tournament')}  ${dim(`${cfg.teams.length} teams · ${scenarios.length} scenarios · ${seeds.length} seeds · ${ticks} days`)}`);
  if (llm) console.log(dim(`  about ${Math.ceil(ticks / cfg.policyEvery) * llm * seeds.length * scenarios.length} model calls in total; per-world budgets apply`));
  const t0 = Date.now();
  const report = await runTournament({
    teams: cfg.teams, scenarios, seeds, ticks, agents: cfg.agents, policyEvery: cfg.policyEvery, budget: cfg.budget, rate: cfg.rateLimit,
    onRun: (d, total, run) => progress(d, total, `${run.scenario} seed ${run.seed}: ${run.teams.find((t) => t.id === run.winner)?.label} wins   `),
  });
  if (tty) process.stdout.write('\n');
  console.log('\n' + bold('  Standings') + dim('  (mean score ± 95% CI)'));
  report.standings.forEach((s, i) => {
    console.log(`  ${i === 0 ? green(String(i + 1)) : i + 1}  ${s.label.padEnd(22).slice(0, 22)}  ${bold(s.mean.toFixed(1).padStart(6))} ${dim('±' + s.ci95.toFixed(1).padEnd(5))}  wins ${s.wins}/${s.runs}  survival ${(s.meanSurvival * 100).toFixed(0)}%`);
  });
  const base = str(a, 'out', 'civarena-tournament').replace(/\.(json|md)$/, '');
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  fs.writeFileSync(`${base}.md`, tournamentMarkdown(report));
  console.log(dim(`\n  ${((Date.now() - t0) / 1000).toFixed(1)}s · saved ${base}.json and ${base}.md (drop the .json on the dashboard to explore it)\n`));
}

async function cmdScenarios() {
  const all = await loadScenarios(SCENARIO_DIRS);
  console.log('');
  for (const s of all) console.log(`  ${bold(s.id.padEnd(20))} ${dim((s.source ?? '').padEnd(8))} ${s.description}`);
  console.log(dim('\n  Add your own: build one in the dashboard, or drop a .json (shareable) or .mjs file into ./scenarios/\n'));
}

export async function main(argv = process.argv.slice(2)) {
  loadEnv();
  registerEnvSecrets();
  const a = parseArgs(argv);
  if (a.version) return console.log(VERSION);
  if (a.help) return console.log(HELP);
  const cmd = a._[0] ?? 'start';
  try {
    if (cmd === 'run') return await cmdRun(a);
    if (cmd === 'setup') return a.cli ? await cmdSetupCli() : await cmdServe(a, { forceSetup: true });
    if (cmd === 'replay') {
      const f = a._[1];
      if (!f) throw new TeamSpecError('replay needs a file: civarena replay world.civ.json.gz');
      return await cmdServe(a, { replayFile: f });
    }
    if (cmd === 'gif') return await cmdGif(a);
    if (cmd === 'tournament') return await cmdTournament(a);
    if (cmd === 'scenarios') return await cmdScenarios();
    if (cmd === 'start' || cmd === 'live') return await cmdServe(a);
    console.log(HELP);
    process.exitCode = 2;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (err instanceof TeamSpecError || e.code === 'ENOENT') {
      console.error(red('\n  ' + redact(e.message) + '\n'));
      process.exit(2);
    }
    if (e.code === 'EADDRINUSE') {
      console.error(red(`  Port is busy. Try --port ${num(a, 'port', 4321) + 1}`));
      process.exit(2);
    }
    console.error(red('  ' + redact(e.stack ?? e.message)));
    process.exit(1);
  }
}
