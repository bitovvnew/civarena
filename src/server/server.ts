// Zero-dependency HTTP server: serves the dashboard, streams frames over SSE, runs the setup wizard API.
// Secrets: keys are accepted only from the local machine, written to .env, and never sent back.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { GuardedBrain } from '../brains/guard.js';
import { detect, PROVIDERS, probe, type ProviderId } from '../brains/providers.js';
import { redact, registerSecret } from '../brains/redact.js';
import { KEY_ENV, normalizeConfig, saveConfig, saveEnv, type CivConfig } from '../config.js';
import { validateCommand } from '../engine/commands.js';
import { Simulation, VERSION } from '../engine/engine.js';
import type { Scenario } from '../engine/plugins.js';
import type { Command, Frame, ReplayFile } from '../engine/types.js';
import { parseScenarioSpec, saveScenarioSpec, scenarioFromSpec } from '../scenarios/index.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.gz': 'application/gzip',
};

export interface WorldFactory {
  /** Build a world from a config (teams, budgets...) and a scenario. Throws a readable error on bad specs. */
  make(cfg: CivConfig, scenario: Scenario, seed: string | number): Simulation;
}

export interface ServerOptions {
  port: number;
  host?: string;
  webRoot: string;
  /** Live mode: current config (null = not configured yet, start in setup mode). */
  config?: CivConfig | null;
  factory?: WorldFactory;
  scenarios?: Scenario[];
  tps?: number;
  replay?: ReplayFile;
  /** Directory holding .env / .civarena.json / scenarios. */
  dir?: string;
  log?: (msg: string) => void;
}

type Mode = 'setup' | 'live' | 'replay';

class Runner {
  sim: Simulation | null = null;
  paused = false;
  tps: number;
  scenario: Scenario | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private listeners = new Set<(event: string, data: unknown) => void>();

  constructor(tps: number, private log: (m: string) => void) {
    this.tps = tps;
  }

  on(fn: (event: string, data: unknown) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(event: string, data: unknown) {
    for (const fn of this.listeners) fn(event, data);
  }

  load(sim: Simulation, scenario: Scenario) {
    this.sim = sim;
    this.scenario = scenario;
    this.paused = false;
  }

  start() {
    if (this.timer) return;
    const loop = async () => {
      const started = Date.now();
      if (this.sim && !this.paused && !this.busy) {
        this.busy = true;
        const sim = this.sim;
        try {
          const frame = await sim.tick();
          if (sim === this.sim) this.send('frame', frame);
        } catch (err) {
          this.log(redact(`tick failed: ${(err as Error).message}`));
        } finally {
          this.busy = false;
        }
      }
      const wait = Math.max(5, 1000 / Math.max(0.2, this.tps) - (Date.now() - started));
      this.timer = setTimeout(loop, wait);
    };
    this.timer = setTimeout(loop, 50);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, gzip = false) {
  const data = Buffer.from(JSON.stringify(body));
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (gzip && data.length > 4096) {
    res.writeHead(status, { ...headers, 'content-encoding': 'gzip' });
    res.end(zlib.gzipSync(data));
    return;
  }
  res.writeHead(status, headers);
  res.end(data);
}

function readBody(req: http.IncomingMessage, limit = 256 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
export const isLoopback = (addr?: string) => !!addr && (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1');

export function startServer(o: ServerOptions): Promise<{ url: string; close: () => void; runner: Runner; mode: () => Mode }> {
  const log = o.log ?? (() => {});
  const dir = o.dir ?? process.cwd();
  const runner = new Runner(o.tps ?? 8, log);
  const clients = new Set<http.ServerResponse>();
  let config: CivConfig | null = o.config ?? null;
  let scenarios: Scenario[] = o.scenarios ?? [];
  let mode: Mode = o.replay ? 'replay' : 'setup';
  let lastError = '';

  const broadcast = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(payload);
  };
  runner.on(broadcast);

  const scenarioList = () => scenarios.map((s) => ({ id: s.id, name: s.name, description: s.description, tags: s.tags ?? [], author: s.author ?? '', source: s.source ?? 'code', spec: s.spec ?? null }));

  const meta = () => {
    if (mode === 'replay') {
      const r = o.replay!;
      return {
        mode, version: VERSION, seed: r.seed, scenario: { id: r.scenario, name: r.scenarioName ?? r.scenario, description: '' }, scenarios: [],
        teams: r.config.teams, map: r.map, names: r.names, agents: r.config.agents, paused: true, tps: 8,
      };
    }
    const sim = runner.sim;
    if (mode === 'setup' || !sim) return { mode: 'setup' as const, version: VERSION, error: lastError, scenarios: scenarioList() };
    const s = sim.state;
    return {
      mode: 'live' as const, version: VERSION, seed: sim.seed,
      scenario: { id: runner.scenario!.id, name: runner.scenario!.name, description: runner.scenario!.description },
      scenarios: scenarioList(),
      teams: s.teams.map((t) => ({ id: t.id, label: t.label, provider: t.provider, model: t.model, color: t.color })),
      map: { width: s.width, height: s.height, tiles: s.tiles }, names: sim.names(), agents: sim.opts.agents,
      paused: runner.paused, tps: runner.tps, policyEvery: sim.opts.policyEvery,
    };
  };

  const launch = (scenarioId?: string, seed?: string | number) => {
    if (!config || !o.factory) return false;
    const scenario = scenarios.find((s) => s.id === (scenarioId ?? config!.scenario)) ?? scenarios[0];
    try {
      const sim = o.factory.make(config, scenario, seed ?? config.seed);
      runner.load(sim, scenario);
      mode = 'live';
      lastError = '';
      runner.start();
      broadcast('reset', meta());
      return true;
    } catch (err) {
      lastError = redact((err as Error).message);
      log(lastError);
      return false;
    }
  };

  const usage = () => {
    const sim = runner.sim;
    if (!sim) return [];
    return sim.state.teams.map((t) => {
      const b = sim.brains.get(t.id);
      const g = b instanceof GuardedBrain ? b : null;
      return {
        team: t.id, label: t.label, provider: t.provider,
        calls: g?.usage.calls ?? 0, tokens: g?.tokens ?? 0, errors: g?.usage.errors ?? 0,
        limit: g?.budget.teamTokens ?? 0, exhausted: g?.exhausted ?? null,
      };
    });
  };

  if (!o.replay && config && config.teams.length) launch();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    const host = req.headers.host ?? '';
    // DNS-rebinding guard: only answer to localhost names unless the user opted into --lan
    if (!LOCAL_HOSTS.test(host) && (o.host ?? '127.0.0.1') !== '0.0.0.0') return sendJson(res, 421, { error: 'unexpected host' });
    try {
      if (req.method === 'POST') {
        // CSRF guard: JSON only (forces a CORS preflight we never approve) and same-origin only
        const ct = req.headers['content-type'] ?? '';
        const origin = req.headers.origin?.replace(/^https?:\/\//, '');
        if (!ct.startsWith('application/json')) return sendJson(res, 415, { error: 'json only' });
        if (origin && origin !== host && !LOCAL_HOSTS.test(origin)) return sendJson(res, 403, { error: 'cross-origin request refused' });
      }
      if (p.startsWith('/api/setup/') && !isLoopback(req.socket.remoteAddress)) return sendJson(res, 403, { error: 'setup is only available from this computer' });

      if (p === '/api/meta') return sendJson(res, 200, meta(), true);
      if (p === '/api/history') {
        const frames: Frame[] = mode === 'replay' ? o.replay!.frames : runner.sim?.history ?? [];
        return sendJson(res, 200, frames, true);
      }
      if (p === '/api/usage') return sendJson(res, 200, { teams: usage(), globalLimit: config?.budget.globalTokens ?? 0 });
      if (p === '/api/replay') {
        const r = mode === 'replay' ? o.replay! : runner.sim?.toReplay(runner.scenario?.id, runner.scenario?.name);
        if (!r) return sendJson(res, 404, { error: 'no world yet' });
        const body = zlib.gzipSync(Buffer.from(JSON.stringify(r)));
        res.writeHead(200, { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="civarena-${r.scenario}-${r.seed}-day${r.config.ticks}.civ.json.gz"` });
        return res.end(body);
      }
      if (p === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': hello\n\n');
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }
      if (p === '/api/command' && req.method === 'POST') {
        if (mode !== 'live' || !runner.sim) return sendJson(res, 409, { error: 'no live world' });
        const cmd = validateCommand(JSON.parse(await readBody(req)));
        if (!cmd) return sendJson(res, 400, { error: 'invalid command' });
        applyCommand(cmd);
        return sendJson(res, 200, { ok: true, paused: runner.paused, tps: runner.tps });
      }
      if (p === '/api/world' && req.method === 'POST') {
        if (mode === 'replay') return sendJson(res, 409, { error: 'replay mode' });
        const body = JSON.parse(await readBody(req)) as { scenario?: string; seed?: string | number };
        const ok = launch(typeof body.scenario === 'string' ? body.scenario : undefined, body.seed !== undefined ? String(body.seed).slice(0, 64) : undefined);
        return sendJson(res, ok ? 200 : 400, ok ? { ok } : { error: lastError || 'could not start world' });
      }
      if (p === '/api/scenarios') {
        if (req.method === 'POST') {
          if (!isLoopback(req.socket.remoteAddress)) return sendJson(res, 403, { error: 'local only' });
          const spec = parseScenarioSpec(JSON.parse(await readBody(req)));
          saveScenarioSpec(spec, path.join(dir, 'scenarios'));
          scenarios = [...scenarios.filter((s) => s.id !== spec.id), scenarioFromSpec(spec)];
          broadcast('scenarios', scenarioList());
          return sendJson(res, 200, { ok: true, id: spec.id });
        }
        return sendJson(res, 200, scenarioList());
      }
      // ---------- setup wizard
      if (p === '/api/setup/status') {
        return sendJson(res, 200, {
          configured: !!config && config.teams.length > 0,
          providers: await detect(),
          catalog: PROVIDERS.map((x) => ({ id: x.id, label: x.label, needsKey: x.needsKey, keyUrl: x.keyUrl ?? null })),
          config: config ?? normalizeConfig({}),
          error: lastError,
        });
      }
      if (p === '/api/setup/probe' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req, 16 * 1024)) as { provider: ProviderId; key?: string };
        const info = PROVIDERS.find((x) => x.id === body.provider);
        if (!info) return sendJson(res, 400, { error: 'unknown provider' });
        // an empty key means "use the one already in the environment" (it is never sent to the browser)
        const envKey = info.envVar ? process.env[info.envVar] ?? (info.id === 'gemini' ? process.env.GOOGLE_API_KEY : undefined) : undefined;
        const key = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : envKey;
        registerSecret(key);
        const result = await probe(info.id, key, { baseUrl: info.id === 'ollama' ? process.env.OLLAMA_BASE_URL : undefined });
        return sendJson(res, 200, result);
      }
      if (p === '/api/setup/save' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req, 64 * 1024)) as { keys?: Record<string, string>; config?: Partial<CivConfig> };
        const updates: Record<string, string> = {};
        for (const [prov, envVar] of Object.entries(KEY_ENV)) {
          const v = body.keys?.[prov];
          if (typeof v === 'string' && v.trim()) {
            if (/[\s"'=#]/.test(v.trim())) return sendJson(res, 400, { error: `invalid key format for ${prov}` });
            updates[envVar] = v.trim();
          }
        }
        const next = normalizeConfig(body.config ?? {});
        if (!next.teams.length) return sendJson(res, 400, { error: 'pick at least one team' });
        if (Object.keys(updates).length) {
          saveEnv(updates, dir);
          for (const [k, v] of Object.entries(updates)) {
            process.env[k] = v;
            registerSecret(v);
          }
        }
        config = next;
        saveConfig(config, dir);
        const ok = launch();
        return sendJson(res, ok ? 200 : 400, ok ? { ok: true } : { error: lastError });
      }
      // ---------- static files
      const rel = decodeURIComponent(p === '/' ? '/index.html' : p);
      const file = path.normalize(path.join(o.webRoot, rel));
      if (!file.startsWith(path.normalize(o.webRoot))) return sendJson(res, 403, { error: 'forbidden' });
      const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(o.webRoot, 'index.html');
      if (!fs.existsSync(target)) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        return res.end('Dashboard not built. Run: npm run build');
      }
      const ext = path.extname(target);
      res.writeHead(200, {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      fs.createReadStream(target).pipe(res);
    } catch (err) {
      sendJson(res, 400, { error: redact((err as Error).message) });
    }
  });

  function applyCommand(cmd: Command) {
    switch (cmd.type) {
      case 'pause': runner.paused = true; break;
      case 'resume': runner.paused = false; break;
      case 'speed': runner.tps = cmd.tps; break;
      case 'reset': launch(runner.scenario?.id, cmd.seed ?? Math.floor(Math.random() * 1e9)); break;
      default: runner.sim!.command(cmd);
    }
    broadcast('control', { paused: runner.paused, tps: runner.tps });
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(o.port, o.host ?? '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : o.port;
      resolve({
        url: `http://localhost:${port}`,
        runner,
        mode: () => mode,
        close: () => {
          runner.stop();
          for (const c of clients) c.end();
          server.close();
        },
      });
    });
  });
}
